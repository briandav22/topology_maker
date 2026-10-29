/* ---------- Rendering: drill-in views, panel, motion and controls ---------- */
function nodeText(n, dd){
  return [n.t, dd && n.sd !== undefined ? n.sd : n.s, dd && n.sd2 !== undefined ? n.sd2 : n.s2].filter(s => s !== undefined && s !== '');
}

function drawNode(gN, n, dd){
  const g = el('g', {class:'node k-' + n.k, role:'button', tabindex:0, 'data-id':n.id, 'aria-label':(n.t || n.tip || n.id) + (n.i ? '. ' + n.i.h : '')}, gN);
  if(n.tip) el('title', {}, g).textContent = n.tip;
  el('rect', {class:'bg', x:n.x, y:n.y, width:n.w, height:n.h, rx:n.k === 'ua' ? 12 : 9}, g);
  if(!n.t){ icon(g, n.icon, n.x + n.w / 2 - 10, n.y + n.h / 2 - 10, 20); return g; }
  const tx = nodeText(n, dd);
  if(n.k === 'ua' || n.lines){
    if(n.k === 'ua'){
      el('rect', {class:'uahead', x:n.x + 1.2, y:n.y + 1.2, width:n.w - 2.4, height:50, rx:10.8}, g);
      el('rect', {class:'uahead', x:n.x + 1.2, y:n.y + 30, width:n.w - 2.4, height:21.2}, g);
    }
    icon(g, n.icon, n.x + 14, n.y + 14, 22);
    fit(txt(g, n.x + 44, n.y + 25, tx[0], 't-label'), n.w - 54);
    if(tx[1]) fit(txt(g, n.x + 44, n.y + 41, tx[1], 't-sub'), n.w - 54);
    if(n.lines){
      el('line', {class:'sepl', x1:n.x + 14, x2:n.x + n.w - 14, y1:n.y + 56, y2:n.y + 56}, g);
      (dd && n.linesd ? n.linesd : n.lines).forEach((s, i) => {
        const y = n.y + 78 + i * 22;
        el('circle', {class:'bul', cx:n.x + 19, cy:y - 4, r:2.4}, g);
        fit(txt(g, n.x + 28, y, s, 't-line'), n.w - 40);
      });
    }
    if(n.foot) fit(txt(g, n.x + 14, n.y + n.h - 14, dd && n.footd ? n.footd : n.foot, 't-sub'), n.w - 28);
    return g;
  }
  icon(g, n.icon, n.x + 12, n.y + n.h / 2 - 10, 20);
  const b0 = n.y + n.h / 2 - (tx.length - 1) * 8 + 4.5;
  tx.forEach((s, i) => fit(txt(g, n.x + 42, b0 + i * 16, s, i ? 't-sub' : 't-label'), n.w - 52));
  return g;
}

function drawFrame(gF, f, dd){
  const cls = f.cls || 'frame', big = cls === 'frame', click = !!(f.id && f.i);
  const g = el('g', click ? {class:'fnode', role:'button', tabindex:0, 'data-id':f.id, 'aria-label':f.label + '. ' + f.i.h} : {}, gF);
  el('rect', {class:cls + (f.ghost ? ' ghost' : ''), x:f.x, y:f.y, width:f.w, height:f.h, rx:big ? 14 : 10}, g);
  if(f.label) fit(txt(g, f.x + (big ? 16 : 12), f.y + (big ? 26 : 20), dd && f.labeld ? f.labeld : f.label, big ? 't-frame' : 't-sframe'), f.w - 24);
  return g;
}

let SCN = null;   // the scene on screen: fixed data, or built for the current data centers
function renderDetail(){
  const svg = $('#dt');
  svg.innerHTML = '';
  const sc = SCN = getScene(S.view);
  if(!sc){ svg._edges = []; return; }
  const dd = S.mode === 'deep';
  const gF = el('g', {class:'frames'}, svg), gE = el('g', {class:'edges'}, svg), gP = el('g', {class:'pts'}, svg);
  const gN = el('g', {class:'nodes'}, svg), gT = el('g', {class:'notes'}, svg), gL = el('g', {class:'labels'}, svg);
  sc.frames.forEach(f => drawFrame(gF, f, dd));
  sc.edges.forEach((e, i) => drawEdge(gE, gL, e, i, dd, true));
  sc.nodes.forEach(n => drawNode(gN, n, dd));
  (sc.notes || []).forEach(n => { const s = dd ? n.td : n.t; if(s) txt(gT, n.x, n.y, s, 't-note'); });
  svg.setAttribute('aria-label', viewName(S.view) + ' detail view');
  svg._edges = sc.edges;
}

/* ===== Lookups ===== */
function viewName(v){
  if(v === 'ov') return 'All deployments';
  if(v === 'kentik') return 'Kentik SaaS';
  if(v === 'dcs') return S.dcN > 1 ? 'All data centers' : 'Your data center';
  if(isDC(v)) return dcName(dcIndex(v));
  return MOD[v] ? MOD[v].name : v;
}
function findItem(id){ const sc = SCN; if(!sc || S.view === 'ov') return null; return sc.nodes.find(n => n.id === id) || sc.frames.find(f => f.id === id) || null; }
function itemName(id){
  if(S.view === 'ov') return id === 'kentik' ? 'Kentik SaaS' : isDC(id) ? dcName(dcIndex(id)) : MOD[id] ? MOD[id].name : id;
  const it = findItem(id);
  return it ? (it.t || it.label || it.tip || id) : id;
}
function edgeLabel(e){ return (S.mode === 'deep' && e.labd) || e.lab || ''; }
function focusName(){
  const f = S.focus;
  if(!f) return '';
  if(f.k === 'edge'){ const e = SCN.edges[f.i]; return edgeLabel(e) || TYPES[e.t].n; }
  return itemName(f.id);
}
const rectOf = it => [it.x, it.y, it.w, it.h];
const inside = (a, b) => a[0] >= b[0] - 1 && a[1] >= b[1] - 1 && a[0] + a[2] <= b[0] + b[2] + 1 && a[1] + a[3] <= b[1] + b[3] + 1;

/* ===== Highlighting ===== */
function applyHighlight(){
  const svg = S.view === 'ov' ? $('#ov') : $('#dt');
  const edges = svg._edges || [];
  let litE = null, litN = null;
  if(S.focus && S.view !== 'ov'){
    litE = new Set(); litN = new Set();
    if(S.focus.k === 'edge'){ const e = edges[S.focus.i]; if(e){ litE.add(S.focus.i); litN.add(e.a); litN.add(e.b); } }
    else {
      const id = S.focus.id;
      litN.add(id);
      edges.forEach((e, i) => { if(e.a === id || e.b === id){ litE.add(i); litN.add(e.a); litN.add(e.b); } });
    }
  } else if(S.hl){
    litE = new Set(); litN = new Set();
    edges.forEach((e, i) => { if(e.t === S.hl){ litE.add(i); litN.add(e.a); litN.add(e.b); } });
  }
  if(litN && S.view !== 'ov' && SCN){
    const lit = [...litN].map(findItem).filter(Boolean).map(rectOf);
    SCN.nodes.forEach(n => { const r = rectOf(n); if(lit.some(l => inside(r, l) || inside(l, r))) litN.add(n.id); });
  }
  svg.querySelectorAll('[data-edge]').forEach(g => g.classList.toggle('dimmed', !!litE && !litE.has(+g.dataset.edge)));
  svg.querySelectorAll('.node[data-id], .card-ov[data-go]').forEach(g => {
    const id = g.dataset.id || g.dataset.go;
    g.classList.toggle('dimmed', !!litN && !litN.has(id));
    g.classList.toggle('sel', !!S.focus && S.focus.id === id);
  });
  svg.querySelectorAll('.fnode').forEach(g => g.classList.toggle('sel', !!S.focus && S.focus.id === g.dataset.id));
  PT.list.forEach(p => p.el.classList.toggle('dimmed', p.edge.classList.contains('dimmed')));
}

/* ===== Side panel ===== */
function srcList(src){
  return src && src.length ? `<h3>Sources in the Kentik KB</h3><ul class="src">${src.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])}</a></li>`).join('')}</ul>` : '';
}
function typeBlock(){
  if(!S.hl) return '';
  const T = TYPES[S.hl], svg = S.view === 'ov' ? $('#ov') : $('#dt');
  const es = (svg._edges || []).filter(e => e.t === S.hl);
  return `<p class="kick">Line type</p><h2>${esc(T.n)}</h2><p class="lead">${esc(T.d)}.</p><ul>${es.map(e => `<li>${esc(itemName(e.a))} ${e.bi ? '↔' : '→'} ${esc(itemName(e.b))}${edgeLabel(e) ? ': ' + esc(edgeLabel(e)) : ''}</li>`).join('')}</ul><button type="button" class="linkbtn" data-clear="1">‹ Clear the highlight</button><hr>`;
}
function focusBlock(dd){
  const f = S.focus;
  if(!f || S.view === 'ov') return '';
  const back = `<button type="button" class="linkbtn" data-clear="1">‹ Back to all of ${esc(viewName(S.view))}</button><hr>`;
  if(f.k === 'edge'){
    const e = SCN.edges[f.i], T = TYPES[e.t];
    return `<p class="kick">Connection · ${esc(T.n)}</p><h2>${esc(edgeLabel(e) || T.n)}</h2><p class="lead">${esc(T.d)}.</p><p>From <b>${esc(itemName(e.a))}</b> to <b>${esc(itemName(e.b))}</b>${e.bi ? ', in both directions' : ''}.</p>${back}`;
  }
  const it = findItem(f.id);
  if(!it) return '';
  const inf = it.i || {h:'', d:[]}, d = inf.d || [];
  const kick = it.cap ? 'Universal Agent capability' : it.cls === 'sframe' ? 'Group' : 'Component';
  let h = `<p class="kick">${kick} · ${esc(viewName(S.view))}</p><h2>${esc(it.t || it.label || it.tip)}</h2><p class="lead">${esc(inf.h)}</p>`;
  if(dd && d.length) h += `<ul>${d.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
  else if(d.length) h += `<p class="muted" style="font-size:12.5px">Switch to <b>Deep dive</b> (key <span class="kbd">D</span>) for ports, sizing and permissions.</p>`;
  if(it.go) h += [].concat(it.go).map(g => `<button type="button" class="gobtn" data-go="${g}">Open ${esc(viewName(g))} ›</button>`).join('');
  return h + back;
}
function dcOverviewCard(dd){
  const m = MOD.dc, n = S.dcN;
  const btns = n > 1
    ? `<button type="button" data-go="dcs">All ${n} together ›</button>` + dcIds().map((id, k) => `<button type="button" data-go="${id}">${esc(dcName(k + 1))} ›</button>`).join('')
    : '<button type="button" data-go="dc">Drill in ›</button>';
  return `<div class="card"><h4>${BLDG}${n > 1 ? n + ' data centers' : esc(dcName(1))}<span class="tag">${esc(m.tag)}</span></h4><p>${esc(dd ? m.oned : m.one)}${n > 1 ? ' Each data center has its own agent.' : ''}</p><div class="btns">${btns}${n < DC_MAX ? '<button type="button" data-dcadd="1">+ Add a data center</button>' : ''}</div></div>`;
}
function renderPanel(){
  const P = $('#panel'), dd = S.mode === 'deep';
  if(S.view === 'ov'){
    P.innerHTML = typeBlock() + (dd ? OV_DD : OV_HL);
    const box = P.querySelector('#ov-sel'), ids = CHIP_ORDER.filter(id => S.sel.has(id));
    box.innerHTML = ids.length
      ? ids.map(id => { if(id === 'dc') return dcOverviewCard(dd); const m = MOD[id]; return `<div class="card"><h4><svg class="ico ico-${m.side}" aria-hidden="true"><use href="#i-${m.icon}"/></svg>${esc(m.name)}<span class="tag">${esc(m.tag)}</span></h4><p>${esc(dd ? m.oned : m.one)}</p><button type="button" data-go="${id}">Drill in ›</button></div>`; }).join('')
        + `<div class="card"><h4><svg class="ico ico-ktk" aria-hidden="true"><use href="#i-ib"/></svg>Kentik SaaS<span class="tag">Platform</span></h4><p>${dd ? 'Hosting, encryption, retention, the Kentik Data Engine and Firehose.' : 'What happens to your data once it reaches Kentik.'}</p><button type="button" data-go="kentik">See inside ›</button></div>`
      : '<p class="muted">Nothing selected yet. Pick a starting point or a deployment above.</p>';
    return;
  }
  const inf = getInfo(S.view);
  const site = inf.site ? siteCard(inf.site) : inf.sites ? sitesCard() : '';
  P.innerHTML = typeBlock() + focusBlock(dd) + `<p class="kick">${esc(inf.kick)}</p><h2 class="ttl">${esc(inf.title)}</h2>` + site + (dd ? inf.dd : inf.hl) + srcList(inf.src);
}

function renderChrome(){
  const c = $('#crumbs');
  if(S.view === 'ov') c.innerHTML = '<span class="cur">All deployments</span>';
  else {
    let h = '<button type="button" data-nav="ov">All deployments</button><span class="sep">›</span>';
    h += S.focus ? `<button type="button" data-nav="${S.view}">${esc(viewName(S.view))}</button><span class="sep">›</span><span class="cur">${esc(focusName())}</span>` : `<span class="cur">${esc(viewName(S.view))}</span>`;
    c.innerHTML = h;
  }
  $('#hint').textContent = S.view === 'ov' ? 'Click a deployment to drill in, or Kentik SaaS to see inside' : 'Click any box or line for details · Esc goes back';
  $('#backBtn').hidden = S.view === 'ov';
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === S.mode ? 'true' : 'false'));
  $('#motionBtn').setAttribute('aria-pressed', S.anim ? 'true' : 'false');
  syncPicker();
}

/* ===== Motion: particles along the lines, one rAF loop ===== */
const PT = {list:[], raf:0};
function tick(now){
  PT.raf = requestAnimationFrame(tick);
  if(document.hidden) return;
  const s = now / 1000 * 42;
  for(const p of PT.list){
    let f = (s / p.len + p.off) % 1;
    if(p.rev) f = 1 - f;
    const q = p.path.getPointAtLength(f * p.len);
    if(p.sq){ p.el.setAttribute('x', (q.x - 2.5).toFixed(1)); p.el.setAttribute('y', (q.y - 2.5).toFixed(1)); }
    else { p.el.setAttribute('cx', q.x.toFixed(1)); p.el.setAttribute('cy', q.y.toFixed(1)); }
  }
}
function stopTick(){ if(PT.raf) cancelAnimationFrame(PT.raf); PT.raf = 0; }
function buildParticles(){
  PT.list = [];
  document.querySelectorAll('#ov g.pts, #dt g.pts').forEach(l => { l.innerHTML = ''; });
  if(!S.anim){ stopTick(); return; }
  const svg = S.view === 'ov' ? $('#ov') : $('#dt'), layer = svg.querySelector('g.pts');
  if(!layer) return;
  svg.querySelectorAll('g.edge').forEach(g => {
    const t = g.dataset.t, ty = TYPES[t];
    if(!ty || !ty.pt) return;
    const path = g.querySelector('path.ln'), len = path.getTotalLength();
    if(len < 30) return;
    const n = Math.max(1, Math.min(4, Math.round(len / 190)));
    for(let i = 0; i < n; i++){
      const shape = ty.pt === 'sq' ? el('rect', {width:5, height:5, rx:1, class:'pt-' + t}, layer) : el('circle', {r:ty.pt === 'ring' ? 3.6 : 2.7, class:'pt-' + t}, layer);
      PT.list.push({el:shape, path, len, off:i / n, rev:g.dataset.bi === '1' && i % 2 === 1, sq:ty.pt === 'sq', edge:g});
    }
  });
  if(!PT.raf) PT.raf = requestAnimationFrame(tick);
}

/* ===== Zoom between the overview and a drill-in ===== */
function aspectBox(r){
  const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
  const W = Math.max(r[2] * 1.25, r[3] * 1.25 * VB[2] / VB[3]), H = W * VB[3] / VB[2];
  return [cx - W / 2, cy - H / 2, W, H];
}
function setVB(svg, b){ svg.setAttribute('viewBox', b.map(v => Math.round(v * 100) / 100).join(' ')); }
function animVB(svg, from, to, ms){
  const tok = svg._tok = (svg._tok || 0) + 1;
  if(REDUCED || !ms){ setVB(svg, to); return; }
  setVB(svg, from);
  const t0 = performance.now();
  const step = now => {
    if(svg._tok !== tok) return;
    let k = Math.min(1, (now - t0) / ms);
    k = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    setVB(svg, from.map((v, i) => v + (to[i] - v) * k));
    if(k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function show(svg, on){
  clearTimeout(svg._hide);
  svg.style.pointerEvents = on ? 'auto' : 'none';
  svg.setAttribute('aria-hidden', on ? 'false' : 'true');
  if(on){ svg.style.visibility = 'visible'; svg.style.opacity = 1; }
  else { svg.style.opacity = 0; svg._hide = setTimeout(() => { svg.style.visibility = 'hidden'; }, REDUCED ? 0 : 320); }
}
const WIDE = [-100, -62, 1200, 744];

function refresh(){ renderChrome(); renderPanel(); renderLegend(); buildParticles(); applyHighlight(); saveHash(); }

function go(view, instant){
  const mod = modOf(view);
  if(mod && !S.sel.has(mod)){ S.sel.add(mod); renderOverview(); }
  const prev = S.view, ov = $('#ov'), dt = $('#dt'), ms = instant ? 0 : 420;
  if(prev === view){ if(S.focus || S.hl){ S.focus = null; S.hl = null; refresh(); } return; }
  S.view = view; S.focus = null; S.hl = null;
  if(view === 'ov'){
    show(dt, false); animVB(dt, VB.slice(), WIDE, ms);
    show(ov, true); animVB(ov, OVR[prev] ? aspectBox(OVR[prev]) : WIDE, VB.slice(), ms);
  } else {
    renderDetail();
    if(prev === 'ov'){
      show(ov, false); animVB(ov, VB.slice(), OVR[view] ? aspectBox(OVR[view]) : VB.slice(), ms);
      show(dt, true); animVB(dt, WIDE, VB.slice(), ms);
    } else {
      setVB(dt, VB);
      if(!REDUCED && !instant){ dt.style.transition = 'none'; dt.style.opacity = 0; void dt.getBoundingClientRect(); dt.style.transition = ''; }
      show(dt, true);
    }
  }
  refresh();
  $('#panel').scrollTop = 0;
}
function setMode(m){
  if(S.mode === m) return;
  S.mode = m;
  renderOverview();
  if(S.view !== 'ov') renderDetail();
  refresh();
}
function setFocus(f){
  S.focus = f; S.hl = null;
  refresh();
  $('#panel').scrollTop = 0;
}
function setSelection(set){
  S.sel = set;
  renderOverview();
  if(S.view !== 'ov') go('ov'); else refresh();
}
function toggleMotion(){ S.anim = !S.anim; refresh(); }

/* ===== Adding, removing and renaming data centers ===== */
function dcRefresh(target){
  renderOverview();
  const v = S.view, dcView = isDC(v) || v === 'dcs';
  if(dcView && target && target !== v){ go(target); return; }
  if(dcView){ S.focus = null; S.hl = null; renderDetail(); }
  refresh();
}
function setDCCount(n){
  const shown = Math.max(0, Math.min(DC_MAX, n)), v = S.view, sel = new Set(S.sel);
  if(shown === 0) sel.delete('dc'); else { sel.add('dc'); S.dcN = shown; }
  S.sel = sel;
  let target = v;
  if(isDC(v) || v === 'dcs'){
    if(!sel.has('dc')) target = 'ov';
    else if(isDC(v) && dcIndex(v) > S.dcN) target = dcId(S.dcN);
  }
  dcRefresh(target);
}
const stepDC = d => setDCCount((S.sel.has('dc') ? S.dcN : 0) + d);
function removeDC(i){
  if(S.dcN <= 1){ setDCCount(0); return; }
  S.dcNames.splice(i - 1, 1);
  S.dcN--;
  dcRefresh('dcs');
}
function renameDC(i, v){
  S.dcNames[i - 1] = String(v).slice(0, 32);
  renderOverview();
  if(isDC(S.view) || S.view === 'dcs'){ renderDetail(); buildParticles(); applyHighlight(); }
  renderChrome(); saveHash();
  const h = $('#panel h2.ttl');
  if(h) h.textContent = getInfo(S.view).title;
}

/* ===== URL hash keeps the current view shareable ===== */
function saveHash(){
  let h = 'v=' + S.view + '&m=' + S.mode + '&s=' + CHIP_ORDER.filter(id => S.sel.has(id)).join('.');
  if(S.dcN > 1) h += '&n=' + S.dcN;
  const names = S.dcNames.slice(0, S.dcN).map(s => String(s || '').trim());
  if(names.some(Boolean)) h += '&dn=' + names.map(encodeURIComponent).join('|');
  try { history.replaceState(null, '', '#' + h); } catch(e){}
}
function loadHash(){
  let h = '';
  try { h = location.hash.slice(1); } catch(e){}
  if(!h) return;
  const q = {}, raw = {};
  h.split('&').forEach(kv => {
    const i = kv.indexOf('=');
    if(i > 0){ const k = kv.slice(0, i), v = kv.slice(i + 1); raw[k] = v; try { q[k] = decodeURIComponent(v); } catch(e){ q[k] = v; } }
  });
  if(q.s !== undefined) S.sel = new Set(q.s.split('.').filter(id => MOD[id]));
  if(q.m === 'deep' || q.m === 'high') S.mode = q.m;
  if(q.n) S.dcN = Math.max(1, Math.min(DC_MAX, parseInt(q.n, 10) || 1));
  if(raw.dn) S.dcNames = raw.dn.split('|').map(s => { try { return decodeURIComponent(s).slice(0, 32); } catch(e){ return ''; } });
  const v = q.v;
  if(v === 'ov' || v === 'kentik' || v === 'dcs' || (isDC(v) ? dcIndex(v) <= S.dcN : !!SC[v])) S.view = v;
  const mod = modOf(S.view);
  if(mod) S.sel.add(mod);
}

/* ===== Events ===== */
$('#ov').addEventListener('click', ev => {
  if(ev.target.closest('[data-dcadd]')){ stepDC(1); return; }
  const g = ev.target.closest('[data-go]');
  if(g) go(g.dataset.go);
});
$('#dt').addEventListener('click', ev => {
  const n = ev.target.closest('[data-id]');
  if(n){ setFocus(S.focus && S.focus.id === n.dataset.id ? null : {k:'node', id:n.dataset.id}); return; }
  const e = ev.target.closest('g.edge');
  if(e){ const i = +e.dataset.edge; setFocus(S.focus && S.focus.k === 'edge' && S.focus.i === i ? null : {k:'edge', i}); return; }
  if(S.focus || S.hl) setFocus(null);
});
$('#panel').addEventListener('click', ev => {
  const t = ev.target;
  if(t.closest('[data-dcadd]')){ stepDC(1); return; }
  const del = t.closest('[data-dcdel]');
  if(del){ removeDC(+del.dataset.dcdel); return; }
  const st = t.closest('[data-dcstep]');
  if(st){ stepDC(+st.dataset.dcstep); return; }
  const g = t.closest('[data-go]');
  if(g){ go(g.dataset.go); return; }
  if(t.closest('[data-clear]')) setFocus(null);
});
$('#panel').addEventListener('input', ev => { const t = ev.target; if(t && t.id === 'dcNameIn') renameDC(+t.dataset.dc, t.value); });
$('#crumbs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-nav]');
  if(!b) return;
  if(b.dataset.nav === 'ov') go('ov'); else setFocus(null);
});
$('#legend').addEventListener('click', ev => {
  const b = ev.target.closest('[data-t]');
  if(!b) return;
  S.hl = S.hl === b.dataset.t ? null : b.dataset.t;
  S.focus = null;
  refresh();
});
$('#presets').addEventListener('click', ev => { const b = ev.target.closest('[data-preset]'); if(b) setSelection(new Set(PRESETS.find(p => p.id === b.dataset.preset).s)); });
$('#chips').addEventListener('click', ev => {
  const st = ev.target.closest('[data-dcstep]');
  if(st){ stepDC(+st.dataset.dcstep); return; }
  const b = ev.target.closest('[data-chip]');
  if(!b) return;
  const s = new Set(S.sel), id = b.dataset.chip;
  if(s.has(id)) s.delete(id); else s.add(id);
  setSelection(s);
});
$('#backBtn').addEventListener('click', () => go('ov'));
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#motionBtn').addEventListener('click', toggleMotion);
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('ib-kentik-explorer-theme', next); } catch(e){}
});
document.addEventListener('keydown', ev => {
  if(ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const tg = ev.target, k = ev.key;
  if(tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
  if((k === 'Enter' || k === ' ') && tg instanceof SVGElement && tg.getAttribute('role') === 'button'){
    ev.preventDefault(); tg.dispatchEvent(new MouseEvent('click', {bubbles:true})); return;
  }
  if(k === 'Escape'){ if(S.focus || S.hl) setFocus(null); else if(S.view !== 'ov') go('ov'); return; }
  if(/^[1-7]$/.test(k)){ go(CHIP_ORDER[+k - 1]); return; }
  if(k === '+' || k === '='){ stepDC(1); return; }
  if(k === '-' || k === '_'){ stepDC(-1); return; }
  if(k === 'k' || k === 'K' || k === '0'){ go('kentik'); return; }
  if(k === 'd' || k === 'D'){ setMode('deep'); return; }
  if(k === 'h' || k === 'H'){ setMode('high'); return; }
  if(k === 'm' || k === 'M'){ toggleMotion(); return; }
  if((k === 'ArrowRight' || k === 'ArrowLeft') && S.view !== 'ov'){
    const list = [];
    CHIP_ORDER.filter(id => S.sel.has(id)).forEach(id => { if(id === 'dc'){ list.push(...dcIds()); if(S.dcN > 1) list.push('dcs'); } else list.push(id); });
    list.push('kentik');
    const i = list.indexOf(S.view);
    go(list[(i + (k === 'ArrowRight' ? 1 : list.length - 1)) % list.length]);
    ev.preventDefault();
  }
});
document.addEventListener('visibilitychange', () => { if(!document.hidden && S.anim && !PT.raf) PT.raf = requestAnimationFrame(tick); });

/* ===== Start ===== */
(function init(){
  try { const t = localStorage.getItem('ib-kentik-explorer-theme'); if(t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch(e){}
  buildPicker();
  loadHash();
  renderOverview();
  if(S.view === 'ov'){ show($('#ov'), true); show($('#dt'), false); }
  else { renderDetail(); show($('#dt'), true); show($('#ov'), false); }
  refresh();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    FIT.length = 0;
    renderOverview();
    if(S.view !== 'ov') renderDetail();
    buildParticles(); applyHighlight();
  });
})();
