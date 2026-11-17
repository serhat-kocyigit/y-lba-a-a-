const get = id => document.getElementById(id);
const modal = get('modal');
const form = get('form');
const apiRoot = (window.DILEK_API || '').replace(/\/$/, '');
const queryId = new URL(location.href).searchParams.get('agac');
let token = localStorage.getItem('dilek-token') || '';
let account, tree;

async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await fetch(apiRoot + '/api/' + path,{
      method,
      headers:{...(token && {Authorization:'Bearer '+token}),...(data && {'Content-Type':'application/json'})},
      ...(data && {body:JSON.stringify(data)})
    });
  } catch { throw new Error('Sunucuya ulaşılamadı. Tekrar dene.'); }
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || 'Sunucuya ulaşılamadı.'),{status:response.status});
  return value;
}
function saveToken(value) {
  token = value;
  if (token) localStorage.setItem('dilek-token',token);
  else localStorage.removeItem('dilek-token');
}
function link(id) {
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
  show(register ? 'Ağacını oluştur' : 'Giriş yap');
  if (register) input('Ağaçta görünecek adın','name',50,{autocomplete:'nickname'});
  input('Kullanıcı adı','username',24,{minLength:3,pattern:'[a-zA-Z0-9_]{3,24}',autocomplete:'username'});
  input('Şifre · en az 8 karakter','password',128,{type:'password',minLength:8,autocomplete:register?'new-password':'current-password'});
  submit(register?'Hesap oluştur':'Giriş yap',async data => {
    const result = await api(register?'register':'login','POST',data);
    saveToken(result.token);
    location.assign(link(register ? result.account.id : (queryId || result.account.id)));
  });
  action(register?'Zaten hesabım var':'Yeni hesap oluştur',() => auth(!register),true);
}
function writeLetter() {
  show(tree.name + ' için bir mektup');
  input('Adın','author',50,{autocomplete:'nickname'});
  input('Mektubun','body',1000);
  submit('Ağaca as ✦',async data => {
    await api('trees/'+tree.id+'/letters','POST',data);
    modal.close();
    await loadTree();
    get('feedback').textContent = 'Mektubun ağaca asıldı!';
  });
}
function openLetter(letter) {
  show('✉ ' + letter.author);
  const body = document.createElement('p');
  body.className = 'letter-body';
  body.textContent = letter.body;
  form.append(body);
}
async function share() {
  const url = link(tree.id);
  try {
    await navigator.clipboard.writeText(url);
    get('feedback').textContent = 'Paylaşım linki kopyalandı.';
  } catch {
    show('Paylaşım linki');
    const field = document.createElement('input');
    field.value = url;
    field.readOnly = true;
    field.setAttribute('aria-label','Paylaşım linki');
    form.append(field);
    field.select();
  }
}
const positions = [[48,32],[57,41],[40,43],[51,51],[62,55],[35,56],[43,63],[56,66],[67,68],[29,71],[49,74],[60,77]];
function render() {
  get('account').textContent = account ? 'Çıkış yap' : 'Giriş yap';
  get('account').onclick = account ? async () => {
    try {
      await api('logout','POST');
      saveToken('');
      location.assign(link(queryId));
    } catch (error) { get('feedback').textContent = error.message; }
  } : () => auth(false);
  const primary = get('primary');
  if (!tree) {
    if (queryId) {
      get('title').textContent = 'Ağaç açılamadı';
      get('description').textContent = 'Paylaşım linkini kontrol et veya tekrar dene.';
      primary.textContent = 'Tekrar dene';
      primary.onclick = () => location.reload();
    } else if (account) {
      primary.textContent = 'Ağacıma git ↗';
      primary.onclick = () => location.assign(link(account.id));
    } else primary.onclick = () => auth(true);
    return;
  }
  get('title').textContent = tree.name + ' · Dilek Ağacı';
  get('placard').textContent = tree.name;
  get('description').textContent = tree.isOwner
    ? 'Linkini sevdiklerine gönder. Gelen mektupları ağacındaki kırmızı süslerden açabilirsin.'
    : 'Adını yaz ve bu ağaca bir yılbaşı mektubu bırak. Mektubunu yalnızca ağacın sahibi okuyabilir.';
  primary.textContent = tree.isOwner ? 'Paylaşım linkini kopyala ↗' : 'Mektup bırak ↗';
  primary.onclick = tree.isOwner ? share : writeLetter;
  const secondary = get('secondary');
  secondary.hidden = tree.isOwner;
  secondary.textContent = account ? 'Ağacım' : 'Kendi ağacımı oluştur';
  secondary.onclick = account ? () => location.assign(link(account.id)) : () => auth(true);
  get('letters').hidden = !tree.isOwner;
  get('count').textContent = '· ' + tree.count;
  get('inbox').replaceChildren(...tree.letters.map(letter => {
    const button = document.createElement('button');
    button.textContent = '✉ ' + letter.author;
    button.onclick = () => openLetter(letter);
    return button;
  }));
  if (tree.isOwner && !tree.count) get('inbox').textContent = 'İlk mektubunu bekliyorsun.';
  const ornaments = positions.slice(0,tree.count).map(([x,y],i) => {
    const letter = tree.letters[i];
    const element = document.createElement(letter ? 'button' : 'span');
    element.className = 'ornament';
    element.style.left = x+'%';
    element.style.top = y+'%';
    element.textContent = '✉';
    if (letter) {
      element.setAttribute('aria-label',letter.author+' adlı kişiden mektup');
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
  if (token) {
    try { account = await api('me'); }
    catch (error) { if (error.status === 401) saveToken(''); }
  }
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
