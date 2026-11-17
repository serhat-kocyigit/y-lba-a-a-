import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const root = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(process.env.DB_PATH || resolve(root, 'dilek.sqlite'));
const derive = promisify(scrypt);
const port = Number(process.env.PORT || 8787);
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript'};
const idPattern = '[0-9a-f-]{36}';
const sessionAge = 30 * 86400_000;
db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS letters (id INTEGER PRIMARY KEY, tree TEXT NOT NULL REFERENCES accounts(id), author TEXT NOT NULL, body TEXT NOT NULL, date TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS letters_tree ON letters(tree,id);
`);
const digest = value => createHash('sha256').update(value).digest('hex');
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function reply(res, status, value) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
function field(data, key, max, min = 1, trim = true) {
  const raw = data?.[key];
  const value = typeof raw === 'string' ? (trim ? raw.trim() : raw) : '';
  if (value.length < min || value.length > max) fail(400, 'Alanlar� belirtilen uzunlukta doldurun.');
  return value;
}
async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'Ge�ersiz istek bi�imi.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    size += chunk.length;
    if (size > 12000) { req.resume(); fail(413, 'Mesaj �ok uzun.'); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'Ge�ersiz istek.'); }
}
const ownerFields = 'id, name';
function sessionHash(req) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  return match ? digest(match[1]) : '';
}
function sessionOwner(req) {
  return db.prepare('SELECT a.id,a.name FROM sessions s JOIN accounts a ON a.id=s.owner WHERE s.hash=? AND s.expires>?').get(sessionHash(req), Date.now());
}
function createSession(account) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), account.id, Date.now()+sessionAge);
  return {token, account:{id:account.id,name:account.name}};
}
const rates = new Map();
function limit(req, group, max) {
  const now = Date.now();
  const key = group + ':' + req.socket.remoteAddress;
  let entry = rates.get(key);
  if (!entry || entry.until <= now) { entry = {count:0,until:now+60000}; rates.set(key,entry); }
  if (++entry.count > max) fail(429, '�ok fazla deneme yap�ld�. Bir dakika sonra tekrar dene.');
}
setInterval(() => {
  for (const [key, entry] of rates) if (entry.until <= Date.now()) rates.delete(key);
}, 60000).unref();

const routes = {
  async 'POST /api/register'(req) {
    limit(req,'account',12);
    const data = await readBody(req);
    const name = field(data,'name',50);
    const username = field(data,'username',24,3).toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) fail(400, 'Kullan�c� ad� harf, rakam ve alt �izgi i�erebilir.');
    const password = field(data,'password',128,8,false);
    const salt = randomBytes(16).toString('hex');
    const hash = (await derive(password,salt,64)).toString('hex');
    const id = randomUUID();
    const result = db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?) ON CONFLICT(username) DO NOTHING').run(id,username,name,salt,hash);
    if (!result.changes) fail(409, 'Bu kullan�c� ad� kullan�l�yor.');
    return createSession({id,name});
  },
  async 'POST /api/login'(req) {
    limit(req,'account',12);
    const data = await readBody(req);
    const username = field(data,'username',24,3).toLowerCase();
    const password = field(data,'password',128,8,false);
    const account = db.prepare('SELECT * FROM accounts WHERE username=?').get(username);
    const hash = await derive(password,account?.salt || '00000000000000000000000000000000',64);
    if (!account || !timingSafeEqual(hash,Buffer.from(account.hash,'hex'))) fail(401, 'Kullan�c� ad� veya �ifre hatal�.');
    return createSession(account);
  },
  'POST /api/logout'(req) {
    db.prepare('DELETE FROM sessions WHERE hash=?').run(sessionHash(req));
    return {};
  },
  'GET /api/me'(req) {
    const account = sessionOwner(req);
    if (!account) fail(401, 'Tekrar giri� yap.');
    return account;
  }
};

const server = http.createServer(async (req,res) => {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin && req.headers.origin === origin) {
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Vary','Origin');
  }
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    const path = new URL(req.url,'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const route = routes[req.method+' '+path];
      if (route) { reply(res,200,await route(req)); return; }
      const match = new RegExp('^/api/trees/('+idPattern+')(/letters)?$').exec(path);
      if (!match) fail(404, 'Sayfa bulunamad�.');
      const [,id,lettersPath] = match;
      const tree = db.prepare('SELECT '+ownerFields+' FROM accounts WHERE id=?').get(id);
      if (!tree) fail(404,'Bu a�a� bulunamad�.');
      if (req.method === 'GET' && !lettersPath) {
        const count = db.prepare('SELECT count(*) AS total FROM letters WHERE tree=?').get(id).total;
        const isOwner = sessionOwner(req)?.id === id;
        const letters = isOwner ? db.prepare('SELECT id,author,body,date FROM letters WHERE tree=? ORDER BY id DESC').all(id) : [];
        reply(res,200,{...tree,count,isOwner,letters}); return;
      }
      if (req.method === 'POST' && lettersPath) {
        limit(req,'letters',20);
        const data = await readBody(req);
        const author = field(data,'author',50);
        const body = field(data,'body',1000);
        db.prepare('INSERT INTO letters (tree,author,body,date) VALUES (?,?,?,?)').run(id,author,body,new Date().toISOString());
        reply(res,201,{}); return;
      }
      fail(405,'Bu i�lem desteklenmiyor.');
    }
    const file = path === '/' ? '/index.html' : path;
    if (req.method !== 'GET' || !['/index.html','/config.js','/app.js','/style.css'].includes(file)) fail(404,'Sayfa bulunamad�.');
    const content = await readFile(resolve(root,'docs',file.slice(1)));
    res.writeHead(200,{'Content-Type':types[extname(file)]+'; charset=utf-8','Cache-Control':'no-cache',
      'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    res.end(content);
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) reply(res,error.status || 500,{error:error.status ? error.message : 'Bir sorun olu�tu. Tekrar dene.'});
  }
});
server.listen(port,process.env.HOST || '127.0.0.1',() => console.log('Dilek A�ac� http://localhost:'+port));

