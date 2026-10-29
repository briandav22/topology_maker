/* ---------- Save as HTML, the deployment guide PDF, and the setup file ---------- */
const APP = !!window.IBK_APP;   // set when the page is served by the Python configurator app

function applyMeta(){
  const cu = S.meta.cu;
  $('.brand h1').textContent = cu ? 'Kentik deployment for ' + cu : 'Kentik deployment explorer';
  document.title = cu ? 'Infoblox Kentik deployment · ' + cu : 'Infoblox Kentik Deployment Explorer';
}
const slug = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'design';
function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* The page as it was loaded, plus the current design baked in, so the file opens exactly here */
function savedHTML(){
  const h = PRISTINE.replace(/<script id="ibk-(?:app|state)">[\s\S]*?<\/script>\n?/g, '');
  const tag = 'scr' + 'ipt';   // split so this source never matches the pattern above
  const st = '<' + tag + ' id="ibk-state">window.IBK_STATE=' + JSON.stringify(stateHash()).replace(/</g, '\\u003c') + ';<\/' + tag + '>\n';
  return h.replace('</head>', st + '</head>');
}

/* Optional load for the guide's sizing; null means not given, so the guide plans for the KB baseline */
function loadOf(kind, i){ const z = szOf(kind, i); return {flow_mode:fmOf(kind, i), devices:z.d || null, fps:z.f || null, syslog_eps:null, dns_lps:null}; }
/* The design in the shape the Python app's deployment guide expects */
function exportCfg(){
  const sites = [];
  if(dcOn()) for(let i = 1; i <= S.dcN; i++){
    sites.push(Object.assign({name:dcName(i), kind:'dc', agent:true, install:instOf('dc', i), capabilities:capList('dc', i), bgp:bgpMode(i) === 'direct'}, loadOf('dc', i)));
  }
  if(brOn()) for(let i = 1; i <= S.brN; i++){
    const ua = brUA(i), t = brTarget(i);
    sites.push(Object.assign({name:brName(i), kind:'branch', agent:ua, install:instOf('br', i), capabilities:ua ? capList('br', i) : [], send_to:ua || !t ? '' : dcName(t), bgp:false}, loadOf('br', i)));
  }
  const clouds = {};
  ['aws', 'azure', 'gcp', 'oci'].forEach(c => { clouds[c] = {enabled:S.sel.has(c)}; });
  clouds.aws.multi_account = !!S.awsNested;
  return {customer:S.meta.cu || 'Example Customer', prepared_by:S.meta.pb, region:S.meta.rg, detail:S.mode, sites, clouds,
    synthetics:{enabled:S.sel.has('saas') || testAgents().length > 0, site_mesh:true, bgp_monitor:S.sel.has('saas')},
    explorer_state:stateHash()};
}

/* Draw a view off screen and turn it into a PNG. CSS variables do not resolve inside an SVG image,
   so every element gets its computed style written inline (light theme). */
const INLINE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'color',
  'font-family', 'font-size', 'font-weight'];
function inlineStyles(live, copy){
  const a = [live, ...live.querySelectorAll('*')], b = [copy, ...copy.querySelectorAll('*')];
  a.forEach((e, i) => {
    const c = b[i];
    if(!c || e.tagName !== c.tagName) return;
    if(e.closest('symbol')) return;   // icons draw with currentColor from the <use> that shows them
    const cs = getComputedStyle(e);
    c.setAttribute('style', INLINE.map(p => p + ':' + cs.getPropertyValue(p)).join(';'));
    c.removeAttribute('class');
  });
}
function svgPNG(svg, scale){
  const c = svg.cloneNode(true);
  inlineStyles(svg, c);
  c.setAttribute('xmlns', NS);
  c.setAttribute('viewBox', VB.join(' '));
  c.setAttribute('width', VB[2] * scale);
  c.setAttribute('height', VB[3] * scale);
  c.style.opacity = 1;
  c.querySelectorAll('g.pts, [data-pts]').forEach(g => { g.innerHTML = ''; });
  const liveDefs = document.querySelector('#sprite defs'), defs = liveDefs.cloneNode(true);
  inlineStyles(liveDefs, defs);
  defs.removeAttribute('style');
  const bg = document.createElementNS(NS, 'rect');
  ['x', 'y'].forEach(k => bg.setAttribute(k, 0));
  bg.setAttribute('width', VB[2]); bg.setAttribute('height', VB[3]); bg.setAttribute('fill', '#fbfbfb');
  c.insertBefore(bg, c.firstChild); c.insertBefore(defs, c.firstChild);
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = VB[2] * scale; cv.height = VB[3] * scale;
      const g = cv.getContext('2d');
      g.fillStyle = '#fbfbfb'; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      res(cv.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => rej(new Error('could not draw ' + (svg.getAttribute('aria-label') || 'a view')));
    img.src = src;
  });
}
function exportViews(){
  const v = [['ov', 'All deployments']];
  if(dcOn()){ dcIds().forEach((id, k) => v.push([id, dcName(k + 1)])); if(S.dcN > 1) v.push(['dcs', 'All data centers']); }
  if(brOn()){ brIds().forEach((id, k) => v.push([id, brName(k + 1)])); if(S.brN > 1) v.push(['brs', 'All branch offices']); }
  ['aws', 'azure', 'gcp', 'oci', 'saas'].filter(id => S.sel.has(id)).forEach(id => v.push([id, MOD[id].name]));
  return v;
}
async function viewImages(onStep){
  const dd = S.mode === 'deep', out = [], liveW = VB[2];
  VB[2] = 1000;   // exports use the standard canvas, whatever the screen width
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-20000px;top:0;width:1000px;height:620px;visibility:hidden';
  const svg = el('svg', {viewBox:VB.join(' '), width:1000, height:620}, host);
  document.body.appendChild(host);
  const theme = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', 'light');   // measure and draw with the light theme
  try {
    const views = exportViews();
    for(let k = 0; k < views.length; k++){
      const [id, title] = views[k];
      if(onStep) onStep(k + 1, views.length, title);
      if(id === 'ov'){ renderOverview(); svg.innerHTML = $('#ov').innerHTML; }
      else drawScene(svg, getScene(id), dd);
      svg.querySelectorAll('.dimmed, .sel').forEach(e => e.classList.remove('dimmed', 'sel'));
      svg.querySelectorAll('g.pts').forEach(g => { g.innerHTML = ''; });
      out.push({id, title, png:await svgPNG(svg, 2)});
    }
  } finally {
    if(theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme');
    host.remove();
    VB[2] = liveW;
    renderOverview(); if(S.view !== 'ov') renderDetail(); refresh();
  }
  return out;
}

/* ===== The dialog ===== */
const XD = $('#xdlg');
function setStat(s){ $('#xStat').textContent = s; }
function openExport(){
  $('#xCu').value = S.meta.cu; $('#xPb').value = S.meta.pb; $('#xRg').value = S.meta.rg;
  $('#xJson').hidden = !APP;
  $('#xPdfNote').textContent = APP ? 'Diagrams plus install steps, sizing, firewall rules and cloud setup'
    : 'Runs in the configurator app: start it with python3 run.py';
  $('#xPdf').disabled = !APP;
  setStat('');
  if(XD.showModal) XD.showModal(); else XD.setAttribute('open', '');
}
function readMeta(){
  S.meta.cu = $('#xCu').value.trim().slice(0, 80);
  S.meta.pb = $('#xPb').value.trim().slice(0, 80);
  S.meta.rg = $('#xRg').value === 'EU' ? 'EU' : 'US';
  applyMeta(); saveHash();
}
['xCu', 'xPb', 'xRg'].forEach(id => $('#' + id).addEventListener('change', readMeta));
$('#exportBtn').addEventListener('click', openExport);
XD.addEventListener('click', ev => { if(ev.target === XD || ev.target.closest('[data-xclose]')) XD.close(); });
$('#xHtml').addEventListener('click', () => {
  readMeta();
  download('infoblox-kentik-' + slug(S.meta.cu || 'design') + '.html', new Blob([savedHTML()], {type:'text/html'}));
  setStat('Saved. Open the file in any browser.');
});
$('#xJson').addEventListener('click', () => {
  readMeta();
  download('infoblox-kentik-setup-' + slug(S.meta.cu || 'design') + '.json', new Blob([JSON.stringify(exportCfg(), null, 2)], {type:'application/json'}));
  setStat('Saved the setup file.');
});
$('#xPdf').addEventListener('click', async () => {
  readMeta();
  const b = $('#xPdf');
  b.disabled = true;
  try {
    const images = await viewImages((k, n, t) => setStat('Drawing ' + k + ' of ' + n + ': ' + t + '…'));
    setStat('Building the PDF…');
    const r = await fetch('/api/pdf', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cfg:exportCfg(), images})});
    if(!r.ok) throw new Error(await r.text());
    download('infoblox-kentik-deployment-guide-' + slug(S.meta.cu || 'design') + '.pdf', await r.blob());
    setStat('Saved the deployment guide.');
  } catch(e){
    setStat('Could not build the PDF: ' + e.message);
  } finally { b.disabled = false; }
});
document.addEventListener('keydown', ev => {
  if(ev.ctrlKey || ev.metaKey || ev.altKey || XD.open) return;
  const tg = ev.target;
  if(tg && (tg.tagName === 'INPUT' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA')) return;
  if(ev.key === 'e' || ev.key === 'E') openExport();
});
applyMeta();
