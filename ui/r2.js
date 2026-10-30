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

let SCN = null;   // the scene on screen: fixed data, or built for the current sites and capabilities
function renderDetail(){
  const svg = $('#dt');
  const sc = SCN = getScene(S.view);
  drawScene(svg, sc, S.mode === 'deep');
  if(sc) svg.setAttribute('aria-label', viewName(S.view) + ' detail view');
}
function drawScene(svg, sc, dd){
  svg.innerHTML = '';
  if(!sc){ svg._edges = []; return; }
  const gF = el('g', {class:'frames'}, svg), gE = el('g', {class:'edges'}, svg), gP = el('g', {class:'pts'}, svg);
  const gN = el('g', {class:'nodes'}, svg), gT = el('g', {class:'notes'}, svg), gL = el('g', {class:'labels'}, svg);
  sc.frames.forEach(f => drawFrame(gF, f, dd));
  sc.edges.forEach((e, i) => drawEdge(gE, gL, e, i, dd, true));
  sc.nodes.forEach(n => drawNode(gN, n, dd));
  (sc.notes || []).forEach(n => { const s = dd ? n.td : n.t; if(s) txt(gT, n.x, n.y, s, 't-note'); });
  svg._edges = sc.edges;
}

/* ===== Lookups ===== */
function viewName(v){
  if(v === 'ov') return 'All deployments';
  if(v === 'kentik') return 'Kentik SaaS';
  if(v === 'dcs') return S.dcN > 1 ? 'All data centers' : 'Your data center';
  if(v === 'brs') return S.brN > 1 ? 'All branches' : 'Your branch';
  if(isDC(v)) return dcName(dcIndex(v));
  if(isBR(v)) return brName(brIndex(v));
  return MOD[v] ? MOD[v].name : v;
}
function findItem(id){ const sc = SCN; if(!sc || S.view === 'ov') return null; return sc.nodes.find(n => n.id === id) || sc.frames.find(f => f.id === id) || null; }
function itemName(id){
  if(S.view === 'ov') return id === 'kentik' ? 'Kentik SaaS' : isDC(id) ? dcName(dcIndex(id)) : isBR(id) ? brName(brIndex(id)) : MOD[id] ? MOD[id].name : id;
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
  return `<div class="card"><h4>${BLDG}${n > 1 ? n + ' data centers' : esc(dcName(1))}<span class="tag">${esc(m.tag)}</span></h4><p>${esc(dd ? m.oned : m.one)}${n > 1 ? ' Each data center has its own agent.' : ''} Open one to toggle its capabilities.</p><div class="btns">${btns}${n < DC_MAX ? '<button type="button" data-dcadd="1">+ Add a data center</button>' : ''}</div></div>`;
}
function brOverviewCard(dd){
  const m = MOD.branch, n = S.brN, own = brIds().filter(id => brUA(brIndex(id))).length;
  const btns = (n > 1 ? `<button type="button" data-go="brs">All ${n} together ›</button>` : '') + brIds().map((id, k) => `<button type="button" data-go="${id}">${esc(brName(k + 1))} ›</button>`).join('');
  return `<div class="card"><h4>${STORE}${n > 1 ? n + ' branch offices' : esc(brName(1))}<span class="tag">${own ? own + ' with an agent' : 'No agents'}</span></h4><p>${esc(dd ? m.oned : m.one)}</p><div class="btns">${btns}${n < BR_MAX ? '<button type="button" data-bradd="1">+ Add a branch</button>' : ''}</div></div>`;
}
function renderPanel(){
  const P = $('#panel'), dd = S.mode === 'deep';
  if(S.view === 'ov'){
    P.innerHTML = typeBlock() + (dd ? OV_DD : OV_HL);
    const box = P.querySelector('#ov-sel'), ids = CHIP_ORDER.filter(id => S.sel.has(id));
    box.innerHTML = ids.length
      ? ids.map(id => { if(id === 'dc') return dcOverviewCard(dd); if(id === 'branch') return brOverviewCard(dd); const m = MOD[id]; return `<div class="card"><h4><svg class="ico ico-${m.side}" aria-hidden="true"><use href="#i-${m.icon}"/></svg>${esc(m.name)}<span class="tag">${esc(m.tag)}</span></h4><p>${esc(dd ? m.oned : m.one)}</p><button type="button" data-go="${id}">Drill in ›</button></div>`; }).join('')
        + `<div class="card"><h4><svg class="ico ico-ktk" aria-hidden="true"><use href="#i-ib"/></svg>Kentik SaaS<span class="tag">Platform</span></h4><p>${dd ? 'Hosting, encryption, retention, the Kentik Data Engine and Firehose.' : 'What happens to your data once it reaches Kentik.'}</p><button type="button" data-go="kentik">See inside ›</button></div>`
      : '<p class="muted">Nothing selected yet. Pick a starting point or a deployment above.</p>';
    return;
  }
  const inf = getInfo(S.view);
  const site = inf.site ? (inf.site[0] === 'dc' ? siteCard(inf.site[1], dd) : branchCard(inf.site[1], dd)) : inf.sites ? sitesCard(inf.sites) : S.view === 'aws' ? awsCard() : '';
  P.innerHTML = typeBlock() + focusBlock(dd) + `<p class="kick">${esc(inf.kick)}</p><h2 class="ttl">${esc(inf.title)}</h2>` + site + (dd ? inf.dd : inf.hl) + srcList(inf.src);
}

function renderChrome(){
  const c = $('#crumbs');
  if(S.view === 'ov') c.innerHTML = '<span class="cur">All deployments</span>';
  else {
    let h = '<button type="button" data-nav="ov">All deployments</button><span class="sep">›</span>';
    const cur = S.focus ? focusName() : viewName(S.view);
    if(S.focus) h += `<button type="button" data-nav="${S.view}">${esc(viewName(S.view))}</button><span class="sep">›</span>`;
    c.innerHTML = h + `<span class="cur" title="${esc(cur)}">${esc(cur)}</span>`;
  }
  const hint = $('#hint');
  hint.textContent = hint.title = S.view === 'ov' ? 'Click a deployment to drill in, or Kentik SaaS to see inside' : 'Click any box or line for details · Esc goes back';
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
let zoomEnd = 0;   // when the running zoom is done; the overview waits for it before it re-lays out
function animVB(svg, from, to, ms){
  const tok = svg._tok = (svg._tok || 0) + 1;
  if(REDUCED || !ms){ setVB(svg, to); return; }
  setVB(svg, from);
  zoomEnd = Math.max(zoomEnd, performance.now() + ms + 150);
  let t0 = 0;   // the clock starts on the first frame, so the click's own work never eats the opening of the zoom
  const step = now => {
    if(svg._tok !== tok) return;
    if(!t0) t0 = now;
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
/* Overview re-layouts: each card glides from where it was on screen to its new place, then the lines fade back in */
function cardBoxes(svg){
  const cards = {};
  svg.querySelectorAll('.card-ov[data-go]').forEach(g => { cards[g.dataset.go] = g.getBoundingClientRect(); });
  return cards;
}
const inOut = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const cssEase = x => {   // CSS "ease", the curve the panel slides with, so cards and panel move in step
  const bz = (a, b, t) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  let lo = 0, hi = 1, t = x;
  for(let i = 0; i < 18; i++){ t = (lo + hi) / 2; if(bz(.25, .25, t) < x) lo = t; else hi = t; }
  return bz(.1, 1, t);
};
/* area: the diagram area's final rectangle while the panel slides; the glide then runs in step with the slide,
   so each card's straight path stays inside the area the whole way */
function glide(svg, before, area){
  const tok = svg._glide = (svg._glide || 0) + 1;
  const a = area || $('#svgwrap').getBoundingClientRect(), sf = Math.min(a.width / VB[2], a.height / VB[3]);
  const ox = a.left + (a.width - VB[2] * sf) / 2 - VB[0] * sf, oy = a.top + (a.height - VB[3] * sf) / 2 - VB[1] * sf;
  const moves = [];
  svg.querySelectorAll('.card-ov[data-go]').forEach(g => {
    const b = before[g.dataset.go], r = OVR[g.dataset.go];
    if(!b || !r || !b.width) return;
    const f = {l:ox + r[0] * sf, t:oy + r[1] * sf, w:r[2] * sf};
    if(Math.abs(b.left - f.l) < 1 && Math.abs(b.top - f.t) < 1 && Math.abs(b.width - f.w) < 1) return;
    moves.push({g, r, b:{l:b.left, t:b.top, w:b.width}, f});
  });
  if(!moves.length) return;
  const lines = [...svg.querySelectorAll('g.edges, g.pts, g.labels')];
  const frame = e => {
    const m0 = e < 1 ? svg.getScreenCTM() : null;
    moves.forEach(m => {
      if(!m0){ m.g.removeAttribute('transform'); return; }
      const l = m.b.l + (m.f.l - m.b.l) * e, t = m.b.t + (m.f.t - m.b.t) * e, w = m.b.w + (m.f.w - m.b.w) * e;
      const x = (l - m0.e) / m0.a, y = (t - m0.f) / m0.d, k = w / m0.a / m.r[2];
      m.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)}) translate(${-m.r[0]} ${-m.r[1]})`);
    });
    lines.forEach(l => { l.style.opacity = e >= 1 ? '' : Math.max(0, e * 2 - 1).toFixed(3); });
  };
  frame(0);   // before the first paint, so the new layout never flashes in place
  const ms = area ? 250 : 380, ease = area ? cssEase : inOut;
  let t0 = 0;
  const step = now => {
    if(svg._glide !== tok) return;
    if(!t0) t0 = now;
    const k = Math.min(1, (now - t0) / ms);
    frame(k < 1 ? ease(k) : 1);
    if(k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const WIDE = [-100, -62, 1200, 744];
const wideOf = b => [b[0] - b[2] * .1, b[1] - b[3] * .1, b[2] * 1.2, b[3] * 1.2];

function refresh(){ renderChrome(); renderPanel(); renderLegend(); buildParticles(); applyHighlight(); saveHash(); }

function go(view, instant){
  if(view === 'branch') view = 'br1';
  if(isBR(view) && brIndex(view) > S.brN) view = brId(S.brN);
  const mod = modOf(view);
  if(mod && !S.sel.has(mod)){ S.sel.add(mod); renderOverview(); }
  const prev = S.view, ov = $('#ov'), dt = $('#dt'), ms = instant ? 0 : 420;
  if(prev === view){ if(S.focus || S.hl){ S.focus = null; S.hl = null; refresh(); } return; }
  S.view = view; S.focus = null; S.hl = null;
  if(view === 'ov'){
    show(dt, false); animVB(dt, DVB.slice(), WIDE, ms);
    show(ov, true); animVB(ov, OVR[prev] ? aspectBox(OVR[prev]) : wideOf(VB), VB.slice(), ms);
  } else {
    renderDetail();
    if(prev === 'ov'){
      show(ov, false); animVB(ov, VB.slice(), OVR[view] ? aspectBox(OVR[view]) : VB.slice(), ms);
      show(dt, true); animVB(dt, WIDE, DVB.slice(), ms);
    } else {
      setVB(dt, DVB);
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
  renderOverview(true);
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
  renderOverview(true);
  if(S.view !== 'ov') nav('ov'); else refresh();
}
function toggleMotion(){ S.anim = !S.anim; refresh(); }

/* ===== Adding, removing and renaming sites, and toggling capabilities ===== */
const siteView = v => isDC(v) || v === 'dcs' || isBR(v) || v === 'brs';
function dcRefresh(target){
  renderOverview(true);
  const v = S.view;
  if(siteView(v) && target && target !== v){ (target === 'ov' ? nav : go)(target); return; }
  if(siteView(v)){ S.focus = null; S.hl = null; renderDetail(); }
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
  [S.dcNames, S.dcCaps, S.dcInst, S.dcBgp, S.dcFm, S.dcSz].forEach(a => a.splice(i - 1, 1));
  S.brTo = S.brTo.map(t => { t = +t || 1; return t === i ? 1 : t > i ? t - 1 : t; });   // branches that pointed at the removed site move to the first one
  S.dcN--;
  dcRefresh('dcs');
}
function setBRCount(n){
  const shown = Math.max(0, Math.min(BR_MAX, n)), v = S.view, sel = new Set(S.sel);
  if(shown === 0) sel.delete('branch'); else { sel.add('branch'); S.brN = shown; }
  S.sel = sel;
  let target = v;
  if(isBR(v) || v === 'brs'){
    if(!sel.has('branch')) target = 'ov';
    else if(isBR(v) && brIndex(v) > S.brN) target = brId(S.brN);
  }
  dcRefresh(target);
}
const stepBR = d => setBRCount((S.sel.has('branch') ? S.brN : 0) + d);
function addBR(){ const was = S.sel.has('branch') ? S.brN : 0; setBRCount(was + 1); if(S.view !== 'ov' && S.brN > was) go(brId(S.brN)); }
function removeBR(i){
  if(S.brN <= 1){ setBRCount(0); return; }
  [S.brNames, S.brUA, S.brTo, S.brCaps, S.brInst, S.brFm, S.brSz].forEach(a => a.splice(i - 1, 1));
  S.brN--;
  dcRefresh(S.brN > 1 ? 'brs' : 'br1');
}
function renameSite(kind, i, v){
  (kind === 'dc' ? S.dcNames : S.brNames)[i - 1] = String(v).slice(0, 32);
  renderOverview();
  if(siteView(S.view)){ renderDetail(); buildParticles(); applyHighlight(); }
  renderChrome(); saveHash();
  const h = $('#panel h2.ttl');
  if(h) h.textContent = getInfo(S.view).title;
}
/* Any change to an agent: redraw everything that depends on it and keep the panel where it was */
function siteChanged(){
  const top = $('#panel').scrollTop;
  renderOverview(true);
  if(S.view !== 'ov'){ S.focus = null; renderDetail(); }
  refresh();
  $('#panel').scrollTop = top;
}
function toggleCap(kind, i, c){
  const s = capsOf(kind, i);
  if(s.has(c)) s.delete(c); else s.add(c);
  if(kind === 'dc' && c === 'bgp') S.dcBgp[i - 1] = 'off';   // BGP Proxy on: routers peer with the agent; off: no BGP at all
  siteChanged();
}
function setAllCaps(kind, i, on){
  if(kind === 'dc' && (on || capsOf('dc', i).has('bgp'))) S.dcBgp[i - 1] = 'off';   // same rule; direct peering survives "all off" only when the agent was not the peer
  (kind === 'dc' ? S.dcCaps : S.brCaps)[i - 1] = new Set(on ? DRAW_ORDER : []);
  siteChanged();
}
function setBgp(i, m){
  const c = capsOf('dc', i);
  if(m === 'ua') c.add('bgp'); else c.delete('bgp');
  S.dcBgp[i - 1] = m === 'direct' ? 'direct' : 'off';
  siteChanged();
}
function setFlowMode(kind, i, m){ (kind === 'dc' ? S.dcFm : S.brFm)[i - 1] = m === 'edge' ? 'edge' : 'forward'; siteChanged(); }
/* Typing a load redraws the diagrams and the sizing line, but leaves the panel (and the cursor) alone */
function setLoad(kind, i, k, v){
  const n = Math.max(0, Math.min(10000000, Math.round(+v) || 0));
  szOf(kind, i)[k] = n;
  renderOverview();
  if(siteView(S.view)){ renderDetail(); buildParticles(); applyHighlight(); }
  saveHash();
  document.querySelectorAll('#panel [data-szout]').forEach(p => { const [pk, pi] = p.dataset.szout.split(':'); if(pk !== 'br' || brUA(+pi)) p.innerHTML = sizeLine(pk, +pi); });
}
function setAwsNested(on){ S.awsNested = !!on; siteChanged(); }
function setInst(kind, i, v){ (kind === 'dc' ? S.dcInst : S.brInst)[i - 1] = v; siteChanged(); }
function toggleBRUA(i){ S.brUA[i - 1] = !brUA(i); siteChanged(); }
function setBRTarget(i, t){ S.brTo[i - 1] = +t; siteChanged(); }

/* ===== URL hash keeps the current view shareable ===== */
const capCode = set => DRAW_ORDER.filter(c => set.has(c)).join('.');
function stateHash(){
  let h = 'v=' + S.view + '&m=' + S.mode + '&s=' + CHIP_ORDER.filter(id => S.sel.has(id)).join('.');
  h += '&n=' + S.dcN + '&b=' + S.brN;
  const enc = list => list.map(x => encodeURIComponent(String(x || '').trim())).join('|');
  const dn = S.dcNames.slice(0, S.dcN), bn = S.brNames.slice(0, S.brN);
  if(dn.some(x => String(x || '').trim())) h += '&dn=' + enc(dn);
  if(bn.some(x => String(x || '').trim())) h += '&bn=' + enc(bn);
  h += '&dc=' + dcIds().map((id, k) => capCode(capsOf('dc', k + 1))).join('|');
  h += '&bg=' + dcIds().map((id, k) => bgpMode(k + 1)[0]).join('');
  h += '&df=' + dcIds().map((id, k) => fmOf('dc', k + 1)[0]).join('');
  h += '&bf=' + brIds().map((id, k) => fmOf('br', k + 1)[0]).join('');
  const sz = (kind, ids) => ids.map((id, k) => { const z = szOf(kind, k + 1); return (z.d || '') + '.' + (z.f || ''); }).join('|');
  const dz = sz('dc', dcIds()), bz = sz('br', brIds());
  if(/\d/.test(dz)) h += '&dz=' + dz;
  if(/\d/.test(bz)) h += '&bz=' + bz;
  h += '&di=' + dcIds().map((id, k) => instOf('dc', k + 1)[0]).join('');
  h += '&bu=' + brIds().map((id, k) => brUA(k + 1) ? 1 : 0).join('');
  h += '&bt=' + brIds().map((id, k) => +S.brTo[k] || 1).join('.');
  h += '&bc=' + brIds().map((id, k) => capCode(capsOf('br', k + 1))).join('|');
  h += '&bi=' + brIds().map((id, k) => instOf('br', k + 1)[0]).join('');
  if(S.awsNested) h += '&an=1';
  if(S.meta.cu) h += '&cu=' + encodeURIComponent(S.meta.cu);
  if(S.meta.pb) h += '&pb=' + encodeURIComponent(S.meta.pb);
  if(S.meta.rg !== 'US') h += '&rg=' + S.meta.rg;
  return h;
}
function saveHash(){ try { history.replaceState(null, '', '#' + stateHash()); } catch(e){} }
function loadHash(){
  let h = '';
  try { h = location.hash.slice(1); } catch(e){}
  if(!h && typeof window.IBK_STATE === 'string') h = window.IBK_STATE;   // a saved HTML file opens on the design it was saved with
  if(!h) return;
  const q = {}, raw = {};
  h.split('&').forEach(kv => {
    const i = kv.indexOf('=');
    if(i > 0){ const k = kv.slice(0, i), v = kv.slice(i + 1); raw[k] = v; try { q[k] = decodeURIComponent(v); } catch(e){ q[k] = v; } }
  });
  const dec = s => s.split('|').map(x => { try { return decodeURIComponent(x).slice(0, 32); } catch(e){ return ''; } });
  const caps = s => new Set(s.split('.').filter(c => UAC[c]));
  if(q.s !== undefined) S.sel = new Set(q.s.split('.').filter(id => MOD[id]));
  if(q.m === 'deep' || q.m === 'high') S.mode = q.m;
  if(q.n) S.dcN = Math.max(1, Math.min(DC_MAX, parseInt(q.n, 10) || 1));
  if(q.b) S.brN = Math.max(1, Math.min(BR_MAX, parseInt(q.b, 10) || 1));
  if(raw.dn) S.dcNames = dec(raw.dn);
  if(raw.bn) S.brNames = dec(raw.bn);
  if(q.dc !== undefined) S.dcCaps = q.dc.split('|').map(caps);
  if(q.bc !== undefined) S.brCaps = q.bc.split('|').map(caps);
  if(q.bg) S.dcBgp = [...q.bg].map(c => c === 'd' ? 'direct' : 'off');   // 'u' comes back through the bgp capability
  const fm = s => [...s].map(c => c === 'e' ? 'edge' : 'forward');
  const sz = s => s.split('|').map(x => { const [d, f] = x.split('.'); return {d:Math.max(0, parseInt(d, 10) || 0), f:Math.max(0, parseInt(f, 10) || 0)}; });
  if(q.df) S.dcFm = fm(q.df);
  if(q.bf) S.brFm = fm(q.bf);
  if(q.dz) S.dcSz = sz(q.dz);
  if(q.bz) S.brSz = sz(q.bz);
  if(q.di) S.dcInst = [...q.di].map(c => c === 'd' ? 'docker' : 'linux');
  if(q.bi) S.brInst = [...q.bi].map(c => c === 'd' ? 'docker' : 'linux');
  if(q.bu) S.brUA = [...q.bu].map(c => c === '1');
  if(q.bt) S.brTo = q.bt.split('.').map(x => parseInt(x, 10) || 1);
  if(q.an === '1') S.awsNested = true;
  if(q.cu) S.meta.cu = q.cu.slice(0, 80);
  if(q.pb) S.meta.pb = q.pb.slice(0, 80);
  if(q.rg === 'EU') S.meta.rg = 'EU';
  const v = q.v;
  if(v === 'ov' || v === 'kentik' || v === 'dcs' || v === 'brs' || (isDC(v) ? dcIndex(v) <= S.dcN : isBR(v) ? brIndex(v) <= S.brN : !!SC[v])) S.view = v;
  const mod = modOf(S.view);
  if(mod) S.sel.add(mod);
}

/* ===== Events ===== */
$('#ov').addEventListener('click', ev => {
  const g = ev.target.closest('[data-go]');
  if(g) nav(g.dataset.go);
});
$('#dt').addEventListener('click', ev => {
  const n = ev.target.closest('[data-id]');
  if(n){ pick({k:'node', id:n.dataset.id}); return; }
  const e = ev.target.closest('g.edge');
  if(e){ pick({k:'edge', i:+e.dataset.edge}); return; }
  unpick();
});
$('#panel').addEventListener('click', ev => {
  const t = ev.target;
  if(t.closest('[data-dcadd]')){ stepDC(1); return; }
  const del = t.closest('[data-dcdel]');
  if(del){ removeDC(+del.dataset.dcdel); return; }
  const st = t.closest('[data-dcstep]');
  if(st){ stepDC(+st.dataset.dcstep); return; }
  if(t.closest('[data-bradd]')){ addBR(); return; }
  const bd = t.closest('[data-brdel]');
  if(bd){ removeBR(+bd.dataset.brdel); return; }
  const bs = t.closest('[data-brstep]');
  if(bs){ stepBR(+bs.dataset.brstep); return; }
  const cp = t.closest('[data-cap]');
  if(cp){ const [k, i, c] = cp.dataset.cap.split(':'); toggleCap(k, +i, c); return; }
  const ca = t.closest('[data-capall]');
  if(ca){ const [k, i, on] = ca.dataset.capall.split(':'); setAllCaps(k, +i, on === '1'); return; }
  const an = t.closest('[data-awsn]');
  if(an){ setAwsNested(an.dataset.awsn === '1'); return; }
  const fmb = t.closest('[data-fm]');
  if(fmb){ const [k, i, m] = fmb.dataset.fm.split(':'); setFlowMode(k, +i, m); return; }
  const bo = t.closest('[data-bgpon]');
  if(bo){ const i = +bo.dataset.bgpon; setBgp(i, bgpMode(i) === 'off' ? 'direct' : 'off'); return; }
  const bm = t.closest('[data-bgp]');
  if(bm){ const [i, m] = bm.dataset.bgp.split(':'); setBgp(+i, m); return; }
  const ins = t.closest('[data-inst]');
  if(ins){ const [k, i, v] = ins.dataset.inst.split(':'); setInst(k, +i, v); return; }
  const bu = t.closest('[data-brua]');
  if(bu){ toggleBRUA(+bu.dataset.brua); return; }
  const g = t.closest('[data-go]');
  if(g){ go(g.dataset.go); return; }
  if(t.closest('[data-clear]')) setFocus(null);
});
$('#panel').addEventListener('input', ev => {
  const t = ev.target;
  if(t && t.classList.contains('nameIn')){ const [k, i] = t.dataset.name.split(':'); renameSite(k, +i, t.value); }
  if(t && t.dataset && t.dataset.sz){ const [k, i, f] = t.dataset.sz.split(':'); setLoad(k, +i, f, t.value); }
});
$('#panel').addEventListener('toggle', ev => { if(ev.target.matches && ev.target.matches('details.load')) S.szOpen = ev.target.open; }, true);
$('#panel').addEventListener('change', ev => { const t = ev.target; if(t && t.classList.contains('toSel')) setBRTarget(+t.dataset.to, t.value); });
$('#crumbs').addEventListener('click', ev => {
  const b = ev.target.closest('[data-nav]');
  if(!b) return;
  if(b.dataset.nav === 'ov') nav('ov'); else unpick();
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
  const bs = ev.target.closest('[data-brstep]');
  if(bs){ stepBR(+bs.dataset.brstep); return; }
  const b = ev.target.closest('[data-chip]');
  if(!b) return;
  const s = new Set(S.sel), id = b.dataset.chip;
  if(s.has(id)) s.delete(id); else s.add(id);
  setSelection(s);
});
$('#backBtn').addEventListener('click', () => nav('ov'));

/* ===== Collapsible details panel: the diagram takes the space back ===== */
/* The panel follows the selection. Picking a box or line in a drill-in opens it, and picking another one
   only changes what it says. Clearing the selection, moving to another deployment or zooming back out
   hides it again. The Details button (or \) still opens and closes it by hand. */
function pick(f){ setFocus(f); if(!S.panelOpen) setPanel(true, true); }
function unpick(){ if(S.focus || S.hl) setFocus(null); if(S.panelOpen) setPanel(false, true); }
function nav(view){ go(view); if(S.panelOpen) setPanel(false, true); }
function setPanel(open, anim){
  S.panelOpen = open;
  const m = $('.main'), wrap = $('#svgwrap');
  let next = null, area = null;
  if(anim && S.view === 'ov' && performance.now() > zoomEnd){
    // Measure where the diagram area ends up, so the overview can re-lay out for it while the panel slides
    m.classList.remove('sliding');
    m.classList.toggle('nopanel', !open);
    area = wrap.getBoundingClientRect();
    if(area.width && area.height) next = ovSize(area.width, area.height);
    m.classList.toggle('nopanel', open);
    void wrap.getBoundingClientRect();
  }
  if(anim && !REDUCED){ m.classList.add('sliding'); clearTimeout(m._slide); m._slide = setTimeout(() => m.classList.remove('sliding'), 320); }
  m.classList.toggle('nopanel', !open);
  const b = $('#panelBtn');
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
  b.title = open ? 'Hide the details panel (\\)' : 'Show the details panel (\\)';
  b.querySelector('span').textContent = open ? 'Hide details' : 'Details';
  if(next && (next[0] !== VB[2] || next[1] !== VB[3])){ renderOverview(true, next, area); buildParticles(); applyHighlight(); }
}
/* When the diagram area changes shape (window resized, panel toggled), the overview canvas takes the new shape
   (see ovSize) and the cards glide over. Never in the middle of a zoom: it waits for the zoom to finish. */
let fitT = 0;
function fitOverview(){
  clearTimeout(fitT);
  const wait = zoomEnd - performance.now();
  if(wait > 0){ fitT = setTimeout(fitOverview, wait); return; }
  const r = $('#svgwrap').getBoundingClientRect();
  if(!r.width || !r.height) return;
  const size = ovSize(r.width, r.height);
  if(size[0] === VB[2] && size[1] === VB[3]) return;
  renderOverview(true, size);
  if(S.view === 'ov'){ buildParticles(); applyHighlight(); }
}
$('#panelBtn').addEventListener('click', () => setPanel(!S.panelOpen, true));
if(window.ResizeObserver) new ResizeObserver(() => { clearTimeout(fitT); fitT = setTimeout(fitOverview, 60); }).observe($('#svgwrap'));
setPanel(false, false);   // nothing is selected at the start, so the diagram gets the whole width
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
  if(tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return;
  if(document.querySelector('dialog[open]')) return;
  if((k === 'Enter' || k === ' ') && tg instanceof SVGElement && tg.getAttribute('role') === 'button'){
    ev.preventDefault(); tg.dispatchEvent(new MouseEvent('click', {bubbles:true})); return;
  }
  if(k === 'Escape'){ if(S.focus || S.hl) unpick(); else if(S.view !== 'ov') nav('ov'); return; }
  if(k === '\\'){ setPanel(!S.panelOpen, true); return; }
  if(/^[1-7]$/.test(k)){ nav(CHIP_ORDER[+k - 1]); return; }
  if(k === '+' || k === '='){ stepDC(1); return; }
  if(k === '-' || k === '_'){ stepDC(-1); return; }
  if(k === 'k' || k === 'K' || k === '0'){ nav('kentik'); return; }
  if(k === 'd' || k === 'D'){ setMode('deep'); return; }
  if(k === 'h' || k === 'H'){ setMode('high'); return; }
  if(k === 'm' || k === 'M'){ toggleMotion(); return; }
  if((k === 'ArrowRight' || k === 'ArrowLeft') && S.view !== 'ov'){
    const list = [];
    CHIP_ORDER.filter(id => S.sel.has(id)).forEach(id => { if(id === 'dc'){ list.push(...dcIds()); if(S.dcN > 1) list.push('dcs'); } else if(id === 'branch'){ list.push(...brIds()); if(S.brN > 1) list.push('brs'); } else list.push(id); });
    list.push('kentik');
    const i = list.indexOf(S.view);
    nav(list[(i + (k === 'ArrowRight' ? 1 : list.length - 1)) % list.length]);
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
    FIT.length = 0; MCACHE.clear();
    renderOverview();
    if(S.view !== 'ov') renderDetail();
    buildParticles(); applyHighlight();
  });
})();
