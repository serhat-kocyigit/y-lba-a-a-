const get = id => document.getElementById(id);
const modal = get('modal');
const form = get('form');
const apiRoot = (window.DILEK_API || '').replace(/\/$/, '');
const queryId = new URL(location.href).searchParams.get('agac');
let token = localStorage.getItem('dilek-token') || '';
let account, tree;

// GitHub Pages mode. Private keys and received letters stay on the owner's device.
const pages = location.hostname.endsWith('.github.io') && !apiRoot;
const legacy = new URL(location.href).searchParams.has('yerel') || (queryId && (location.hash || localStorage.getItem('dilek-owner:'+queryId)));
const offline = pages && Boolean(legacy);
const pack = bytes => btoa(Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unpack = value => Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const utf = new TextEncoder();
const decode = bytes => new TextDecoder().decode(bytes);
const encodeObj = obj => pack(utf.encode(JSON.stringify(obj)));
const decodeObj = value => JSON.parse(decode(unpack(value)));
const accountKey = id => 'dilek-owner:'+id;
const localAccount = id => JSON.parse(localStorage.getItem(accountKey(id)) || 'null');
const rsa = {name:'RSA-OAEP',hash:'SHA-256'};
let responseLink;
function offlineLink(id) {
  const url = new URL(location.href);
  url.search=''; url.hash='';
  if (id) {
    url.searchParams.set('agac',id);
    const user = localAccount(id);
    if (user) url.hash=encodeObj({id,name:user.name,pub:user.pub});
    else if (id===queryId) url.hash=location.hash;
  }
  return url.href;
}
async function passwordKey(password,salt) {
  const base=await crypto.subtle.importKey('raw',utf.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:unpack(salt),iterations:210000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function session() {
  return JSON.parse(sessionStorage.getItem('dilek-offline-session') || 'null');
}
async function offlineApi(path,method,data) {
  const active=session();
  if(path==='register' || path==='login') {
    const username=data.username.trim().toLowerCase();
    const alias='dilek-login:'+username;
    let user=localAccount(localStorage.getItem(alias));
    let secret;
    if(path==='register') {
      if(!data.name.trim()) throw Error('Ad\u0131n\u0131 yaz.');
      if(user) throw Error('Bu kullan\u0131c\u0131 ad\u0131 bu taray\u0131c\u0131da kay\u0131tl\u0131.');
      const keys=await crypto.subtle.generateKey({...rsa,modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['encrypt','decrypt']);
      const id=crypto.randomUUID(), salt=pack(crypto.getRandomValues(new Uint8Array(16))), iv=crypto.getRandomValues(new Uint8Array(12));
      secret=pack(await crypto.subtle.exportKey('pkcs8',keys.privateKey));
      const key=await passwordKey(data.password,salt);
      user={id,name:data.name.trim(),salt,iv:pack(iv),pub:pack(await crypto.subtle.exportKey('spki',keys.publicKey)),locked:pack(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,utf.encode(secret)))};
      localStorage.setItem(accountKey(id),JSON.stringify(user));
      localStorage.setItem(alias,id);
    } else {
      try {
        const key=await passwordKey(data.password,user.salt);
        secret=decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unpack(user.iv)},key,unpack(user.locked)));
      } catch { throw Error('Bu taray\u0131c\u0131daki kullan\u0131c\u0131 ad\u0131 veya \u015fifre hatal\u0131.'); }
    }
    const account={id:user.id,name:user.name};
    sessionStorage.setItem('dilek-offline-session',JSON.stringify({account,secret}));
    return {account,token:'offline'};
  }
  if(path==='logout') {sessionStorage.removeItem('dilek-offline-session');return {};}
  if(path==='me') {if(active)return active.account;throw Object.assign(Error('Giri\u015f yap.'),{status:401});}
  const id=path.split('/')[1], user=localAccount(id), fragment=location.hash.slice(1);
  if(fragment.length>24000) throw Error('Ba\u011flant\u0131 \u00e7ok uzun.');
  const payload=fragment ? decodeObj(fragment) : {};
  const owner=active?.account.id===id;
  if(payload.reply && !owner) throw Error('Mektubu a\u00e7mak i\u00e7in a\u011fac\u0131n\u0131 olu\u015fturdu\u011fun taray\u0131c\u0131da giri\u015f yap.');
  const info=user || payload;
  if(info.id!==id || !info.pub || typeof info.name!=='string') throw Error('A\u011fac\u0131n tam payla\u015f\u0131m ba\u011flant\u0131s\u0131n\u0131 a\u00e7.');
  if(method==='POST') {
    const author=data.author.trim(), body=data.body.trim();
    if(!author || !body) throw Error('Ad\u0131n\u0131 ve mektubunu yaz.');
    const pub=await crypto.subtle.importKey('spki',unpack(info.pub),rsa,false,['encrypt']);
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const envelope={id,reply:true,iv:pack(iv),key:pack(await crypto.subtle.encrypt(rsa,pub,await crypto.subtle.exportKey('raw',key))),message:pack(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,utf.encode(JSON.stringify({id:crypto.randomUUID(),author,body}))))};
    const url=new URL(location.href);url.hash=encodeObj(envelope);responseLink=url.href;return {};
  }
  if(owner && payload.reply) {
    const privateKey=await crypto.subtle.importKey('pkcs8',unpack(active.secret),rsa,false,['decrypt']);
    const raw=await crypto.subtle.decrypt(rsa,privateKey,unpack(payload.key));
    const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
    const letter=JSON.parse(decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unpack(payload.iv)},key,unpack(payload.message))));
    if(typeof letter.author!=='string'||typeof letter.body!=='string'||!/^[-a-f0-9]{36}$/.test(letter.id)||letter.author.length>50||letter.body.length>1000)throw Error('Ge\u00e7ersiz mektup.');
    localStorage.setItem('dilek-letter:'+id+':'+letter.id,JSON.stringify(letter));
    history.replaceState(null,'',offlineLink(id));
  }
  const letters=owner?Object.keys(localStorage).filter(k=>k.startsWith('dilek-letter:'+id+':')).map(k=>JSON.parse(localStorage.getItem(k))):[];
  return {id,name:info.name,isOwner:owner,letters,count:letters.length};
}
function showReply() {
  show('Mektubunu ula\u015ft\u0131r');
  const label=document.createElement('label');
  label.textContent='Bu ba\u011flant\u0131y\u0131 a\u011fac\u0131n sahibine g\u00f6nder. A\u00e7t\u0131\u011f\u0131nda mektubun a\u011fac\u0131na as\u0131lacak.';
  const field=document.createElement('textarea');field.value=responseLink;field.readOnly=true;
  label.append(field);form.append(label);
  action('Cevap linkini kopyala',async event=>{
    try{await navigator.clipboard.writeText(field.value);event.target.textContent='Kopyaland\u0131';}catch{field.select();}
  });
}

async function api(path, method = 'GET', data) {
  if(offline) return offlineApi(path,method,data);
  if(pages){
    const res=await fetch('https://coplmjmvyawnfvyibigl.supabase.co/rest/v1/rpc/dilek_api',{
      method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_Y1D-1pVkVYVovmljtjeYlg_M2YBYGSt'},
      body:JSON.stringify({route:path,payload:data||{},ticket:token})
    });
    const result=await res.json();
    if(!res.ok || result.error)throw Object.assign(Error(result.error||'Sunucuya ula\u015f\u0131lamad\u0131.'),{status:result.status||res.status});
    return result;
  }
  let response;
  try {
    response = await fetch(apiRoot + '/api/' + path,{
      method,
      headers:{...(token && {Authorization:'Bearer '+token}),...(data && {'Content-Type':'application/json'})},
      ...(data && {body:JSON.stringify(data)})
    });
  } catch { throw new Error('Sunucuya ula\u015f\u0131lamad\u0131. Tekrar dene.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || 'Sunucuya ula\u015f\u0131lamad\u0131.'),{status:response.status});
  return value;
}
function saveToken(value) {
  token = value;
  if (token) localStorage.setItem('dilek-token',token);
  else localStorage.removeItem('dilek-token');
}
function link(id) {
  if(offline) return offlineLink(id);
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  if (id) url.searchParams.set('agac',id);
  return url.href;
}
function show(text) {
  get('modal-title').textContent = text;
  get('error').textContent = '';
  form.replaceChildren();
  form.onsubmit = null;
  if (!modal.open) modal.showModal();
}
get('close').onclick = () => modal.close();
function input(label, name, max, extra = {}) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const field = document.createElement(name === 'body' ? 'textarea' : 'input');
  Object.assign(field,{name,maxLength:max,required:true,...extra});
  wrapper.append(field);
  form.append(wrapper);
}
function action(text, callback, quiet = false) {
  const button = document.createElement('button');
  button.textContent = text;
  button.type = 'button';
  if (quiet) button.className = 'quiet';
  button.onclick = callback;
  form.append(button);
  return button;
}
function submit(text, callback) {
  const button = action(text);
  button.type = 'submit';
  form.onsubmit = async event => {
    event.preventDefault();
    button.disabled = true;
    get('error').textContent = '';
    try { await callback(Object.fromEntries(new FormData(form))); }
    catch (error) { get('error').textContent = error.message; }
    finally { button.disabled = false; }
  };
}
function auth(register) {
  show(register ? 'A\u011fac\u0131n\u0131 olu\u015ftur' : 'Giri\u015f yap');
  if (register) input('A\u011fa\u00e7ta g\u00f6r\u00fcnecek ad\u0131n','name',50,{autocomplete:'nickname'});
  input('Kullan\u0131c\u0131 ad\u0131','username',24,{minLength:3,pattern:'[a-zA-Z0-9_]{3,24}',autocomplete:'username'});
  input('\u015eifre \u00b7 en az 8 karakter','password',128,{type:'password',minLength:8,autocomplete:register?'new-password':'current-password'});
  submit(register?'Hesap olu\u015ftur':'Giri\u015f yap',async data => {
    const result = await api(register?'register':'login','POST',data);
    saveToken(result.token);
    if(offline && !register && queryId && location.hash){location.reload();return;}
    location.assign(link(register ? result.account.id : (queryId || result.account.id)));
  });
  action(register?'Zaten hesab\u0131m var':'Yeni hesap olu\u015ftur',() => auth(!register),true);
}
function writeLetter() {
  show(tree.name + ' i\u00e7in bir mektup');
  input('Ad\u0131n','author',50,{autocomplete:'nickname'});
  input('Mektubun','body',1000);
  submit('A\u011faca as \u2726',async data => {
    await api('trees/'+tree.id+'/letters','POST',data);
    if(offline){showReply();return;}
    modal.close();
    await loadTree();
    get('feedback').textContent = 'Mektubun a\u011faca as\u0131ld\u0131!';
  });
}
function openLetter(letter) {
  show('\u2709 ' + letter.author);
  const body = document.createElement('p');
  body.className = 'letter-body';
  body.textContent = letter.body;
  form.append(body);
}
async function share() {
  const url = link(tree.id);
  try {
    await navigator.clipboard.writeText(url);
    get('feedback').textContent = 'Payla\u015f\u0131m linki kopyaland\u0131.';
  } catch {
    show('Payla\u015f\u0131m linki');
    const field = document.createElement('input');
    field.value = url;
    field.readOnly = true;
    field.setAttribute('aria-label','Payla\u015f\u0131m linki');
    form.append(field);
    field.select();
  }
}
const positions = [[48,32],[57,41],[40,43],[51,51],[62,55],[35,56],[43,63],[56,66],[67,68],[29,71],[49,74],[60,77]];
function render() {
  get('account').textContent = account ? '\u00c7\u0131k\u0131\u015f yap' : 'Giri\u015f yap';
  get('account').onclick = account ? async () => {
    try {
      await api('logout','POST');
      saveToken('');
      location.assign(link(queryId));
    } catch (error) { get('feedback').textContent = error.message; }
  } : () => auth(false);
  const primary = get('primary');
  if(pages && !queryId && !offline && Object.keys(localStorage).some(k=>k.startsWith('dilek-owner:'))){
    const old=get('secondary');old.hidden=false;old.textContent='Bu cihazdaki eski a\u011fa\u00e7lar';old.onclick=()=>location.assign('?yerel=1');
  }
  if (!tree) {
    if (queryId) {
      get('title').textContent = 'A\u011fa\u00e7 a\u00e7\u0131lamad\u0131';
      get('description').textContent = 'Payla\u015f\u0131m linkini kontrol et veya tekrar dene.';
      primary.textContent = 'Tekrar dene';
      primary.onclick = () => location.reload();
    } else if (account) {
      primary.textContent = 'A\u011fac\u0131ma git \u2197';
      primary.onclick = () => location.assign(link(account.id));
     } else {
      primary.onclick = () => auth(true);
      if (offline) get('description').textContent = 'Hesab\u0131n\u0131 olu\u015ftur, y\u0131lba\u015f\u0131 a\u011fac\u0131n\u0131 payla\u015f. Daha sonra ayn\u0131 taray\u0131c\u0131da kullan\u0131c\u0131 ad\u0131n ve \u015fifrenle giri\u015f yapabilirsin.';
    }
    return;
  }
  get('title').textContent = tree.name + ' \u00b7 Dilek A\u011fac\u0131';
  get('placard').textContent = tree.name;
  get('description').textContent = tree.isOwner
    ? 'Linkini sevdiklerine g\u00f6nder. Gelen mektuplar\u0131 a\u011fac\u0131ndaki k\u0131rm\u0131z\u0131 s\u00fcslerden a\u00e7abilirsin.'
    : 'Ad\u0131n\u0131 yaz ve bu a\u011faca bir y\u0131lba\u015f\u0131 mektubu b\u0131rak. Mektubunu yaln\u0131zca a\u011fac\u0131n sahibi okuyabilir.';
  if(offline) get('description').textContent=tree.isOwner?'A\u011fa\u00e7 linkini payla\u015f. Sana gelen mektup linklerini bu taray\u0131c\u0131da a\u00e7arak a\u011fac\u0131na as.':'Mektubunu yaz ve olu\u015fan \u015fifreli ba\u011flant\u0131y\u0131 '+tree.name+' ile payla\u015f.';
  primary.textContent = tree.isOwner ? 'Payla\u015f\u0131m linkini kopyala \u2197' : 'Mektup b\u0131rak \u2197';
  primary.onclick = tree.isOwner ? share : writeLetter;
  const secondary = get('secondary');
  secondary.hidden = tree.isOwner;
  secondary.textContent = account ? 'A\u011fac\u0131m' : 'Kendi a\u011fac\u0131m\u0131 olu\u015ftur';
  secondary.onclick = account ? () => location.assign(link(account.id)) : () => auth(true);
  get('letters').hidden = !tree.isOwner;
  get('count').textContent = '\u00b7 ' + tree.count;
  get('inbox').replaceChildren(...tree.letters.map(letter => {
    const button = document.createElement('button');
    button.textContent = '\u2709 ' + letter.author;
    button.onclick = () => openLetter(letter);
    return button;
  }));
  if (tree.isOwner && !tree.count) get('inbox').textContent = '\u0130lk mektubunu bekliyorsun.';
  const ornaments = positions.slice(0,tree.count).map(([x,y],i) => {
    const letter = tree.letters[i];
    const element = document.createElement(letter ? 'button' : 'span');
    element.className = 'ornament';
    element.style.left = x+'%';
    element.style.top = y+'%';
    element.textContent = '\u2709';
    if (letter) {
      element.setAttribute('aria-label',letter.author+' adl\u0131 ki\u015fiden mektup');
      element.onclick = () => openLetter(letter);
    } else element.setAttribute('aria-hidden','true');
    return element;
  });
  get('ornaments').replaceChildren(...ornaments);
}
async function loadTree() {
  if (queryId) tree = await api('trees/'+encodeURIComponent(queryId));
  render();
}
async function initialize() {
  if (offline ? session() : token) {
    try { account = await api('me'); }
    catch (error) { if (error.status === 401) saveToken(''); }
  }
  if(offline && !queryId) get('description').textContent='A\u011fac\u0131n\u0131 bu taray\u0131c\u0131da olu\u015ftur. Linkini sevdiklerine g\u00f6nder, onlar\u0131n yollad\u0131\u011f\u0131 mektup linklerini a\u00e7arak a\u011fac\u0131n\u0131 s\u00fcsle.';
  try { await loadTree(); }
  catch (error) { render(); get('feedback').textContent = error.message; }
}

function drawTree() {
  const ctx = get('tree').getContext('2d');
  ctx.scale(2,2);
  let seed = 421;
  const rand = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0)/4294967296);
  function dot(x,y,r,color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  for (let i=0;i<115;i++) {
    const x=35+rand()*450, y=48+rand()*405;
    if (Math.hypot((x-260)/1.05,y-270)<237) dot(x,y,.35+rand()*1.5,'rgba(248,224,172,'+(.12+rand()*.4)+')');
  }
  ctx.fillStyle='#0f1d17';
  ctx.beginPath(); ctx.ellipse(260,453,168,14,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#664331';ctx.fillRect(247,372,26,76);
  for (let layer=8;layer>=0;layer--) {
    const y=101+layer*33, spread=24+layer*17.1;
    ctx.fillStyle=layer%2 ? '#183c2d' : '#245540';
    ctx.beginPath(); ctx.moveTo(260,y-43);
    ctx.quadraticCurveTo(260+spread*.57,y+33,260+spread,y+57);
    ctx.quadraticCurveTo(260,y+84,260-spread,y+57);
    ctx.quadraticCurveTo(260-spread*.57,y+33,260,y-43);
    ctx.fill();
    for (let i=0;i<135;i++) {
      const amount=rand(), x=260+(rand()*2-1)*spread*amount, yy=y-20+amount*73+rand()*10;
      ctx.strokeStyle=['#315f46','#407958','#27533f','#67936a','#183e30'][Math.floor(rand()*5)];
      ctx.lineWidth=.4+rand()*1.35;
      ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+(x-260)*.065,yy+2+rand()*8); ctx.stroke();
    }
  }
  const colors=[['#fbd68b','#8d451b'],['#f98c74','#8a292c'],['#f5eee2','#9a7951']];
  for (let row=0;row<5;row++) {
    const y=144+row*55, wide=29+row*24;
    ctx.strokeStyle='#cdb480aa';ctx.lineWidth=.9;
    ctx.beginPath();ctx.moveTo(260-wide,y-10);ctx.quadraticCurveTo(260,y+39,260+wide,y-10);ctx.stroke();
    for(let i=0;i<10+row*2;i++) {
      const t=i/(9+row*2);
      ctx.shadowColor='#ffd899';ctx.shadowBlur=11;
      dot(260-wide+t*wide*2,y-10+98*t*(1-t),1.4,'#ffe0a2');
      ctx.shadowBlur=0;
    }
    for(let i=0;i<3+row;i++) {
      const x=260+(rand()*2-1)*wide, yy=y+16+rand()*19, r=3+rand()*6;
      const [light,dark]=colors[Math.floor(rand()*colors.length)];
      const ball=ctx.createRadialGradient(x-r*.33,yy-r*.45,.5,x,yy,r);
      ball.addColorStop(0,'#fff1cc');ball.addColorStop(.32,light);ball.addColorStop(1,dark);
      dot(x,yy,r,ball);
    }
  }
  ctx.shadowColor='#ffce72';ctx.shadowBlur=32;
  ctx.fillStyle='#ffe3a4';ctx.beginPath();
  for(let i=0;i<10;i++) {
    const angle=i*Math.PI/5-Math.PI/2, radius=i%2?9:23;
    ctx.lineTo(260+Math.cos(angle)*radius,72+Math.sin(angle)*radius);
  }
  ctx.closePath();ctx.fill();ctx.shadowBlur=0;
}
drawTree();
initialize();
