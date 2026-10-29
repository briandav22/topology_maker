/* ---------- Rendering: helpers, state and the overview ---------- */
const NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);
const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } })();
const S = {mode:'high', sel:new Set(['dc','branch','aws']), view:'ov', focus:null, hl:null, anim:!REDUCED,
  dcN:1, dcNames:[], dcCaps:[], dcInst:[], dcBgp:[],
  brN:2, brNames:[], brUA:[], brTo:[], brCaps:[], brInst:[],
  meta:{cu:'', pb:'', rg:'US'}};
const VB = [0, 0, 1000, 620];
const FIT = [];       // texts that had to shrink to fit; empty means every label fits at its design size
let OVR = {};         // overview card rectangles, used by the zoom transition

function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  if(attrs) for(const k in attrs){ const v = attrs[k]; if(v !== undefined && v !== null && v !== false) e.setAttribute(k, v); }
  if(parent) parent.appendChild(e);
  return e;
}
function txt(parent, x, y, s, cls, attrs){ const t = el('text', Object.assign({x, y, class:cls}, attrs || {}), parent); t.textContent = s; return t; }
function icon(parent, name, x, y, size, cls){ return el('use', {href:'#i-' + name, x, y, width:size, height:size, class:cls || 'ico'}, parent); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));

/* Off-screen SVG for measuring text before layout */
const MS = el('svg', {width:0, height:0, 'aria-hidden':'true', style:'position:absolute;left:-9999px;top:0;visibility:hidden'});
document.body.appendChild(MS);
const MT = el('text', {x:0, y:20}, MS);
function measure(s, cls){ MT.setAttribute('class', cls); MT.textContent = s; return MT.getComputedTextLength(); }

/* Never truncate: if a label is too wide, shrink it a little and log it */
function fit(t, maxW, min){
  if(!t || !t.textContent || maxW <= 0) return t;
  let len = 0;
  try { len = t.getComputedTextLength(); } catch(e){ return t; }
  if(len > maxW + 0.5){
    const fs = parseFloat(getComputedStyle(t).fontSize) || 12;
    const ns = Math.max(min || 9, fs * maxW / len);
    t.style.fontSize = ns.toFixed(2) + 'px';
    FIT.push({text:t.textContent, len:Math.round(len), max:Math.round(maxW), size:+ns.toFixed(2), view:S.view, mode:S.mode});
  }
  return t;
}

/* Arrowheads, one per line type, kept with the icon sprite */
(function(){
  const defs = document.querySelector('#sprite defs');
  Object.keys(TYPES).forEach(t => {
    const m = el('marker', {id:'ah-' + t, viewBox:'0 0 10 10', refX:8, refY:5, markerWidth:7, markerHeight:7, orient:'auto-start-reverse', markerUnits:'userSpaceOnUse'}, defs);
    el('path', {d:'M0,0.6 L10,5 L0,9.4 z', class:'ah-' + t}, m);
  });
})();

/* Two points: a smooth curve (horizontal tangents, or vertical with c:'v'). More points: a polyline with rounded corners. */
function pathD(p, c){
  if(p.length === 2){
    const [a, b] = p;
    if(a[0] === b[0] || a[1] === b[1]) return `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
    if(c === 'v'){ const my = (a[1] + b[1]) / 2; return `M${a[0]},${a[1]} C${a[0]},${my} ${b[0]},${my} ${b[0]},${b[1]}`; }
    const mx = (a[0] + b[0]) / 2;
    return `M${a[0]},${a[1]} C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`;
  }
  let d = `M${p[0][0]},${p[0][1]}`;
  for(let i = 1; i < p.length - 1; i++){
    const [px, py] = p[i - 1], [x, y] = p[i], [nx, ny] = p[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y), r = Math.min(10, l1 / 2, l2 / 2);
    const ax = x - (x - px) / l1 * r, ay = y - (y - py) / l1 * r, bx = x + (nx - x) / l2 * r, by = y + (ny - y) / l2 * r;
    d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${x},${y} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  const q = p[p.length - 1];
  return d + ` L${q[0]},${q[1]}`;
}

function drawEdge(gE, gL, e, idx, dd, hit){
  const g = el('g', {class:'edge e-' + e.t, 'data-edge':idx, 'data-t':e.t, 'data-a':e.a, 'data-b':e.b, 'data-bi':e.bi ? 1 : 0}, gE);
  const d = pathD(e.p, e.c);
  if(hit) el('path', {class:'hit', d}, g);
  el('path', {class:'ln', d, 'marker-end':'url(#ah-' + e.t + ')', 'marker-start':e.bi ? 'url(#ah-' + e.t + ')' : null}, g);
  const s = dd && e.labd ? e.labd : e.lab;
  if(s && e.lp){
    const lg = el('g', {class:'edge-l e-' + e.t, 'data-edge':idx}, gL);
    const inner = el('g', {class:'elab'}, lg);
    const r = el('rect', {rx:4}, inner);
    const t = txt(inner, e.lp[0], e.lp[1], s, 't-edge', {'text-anchor':e.anchor || 'middle', 'dominant-baseline':'central'});
    const b = t.getBBox();
    r.setAttribute('x', (b.x - 4).toFixed(1)); r.setAttribute('y', (b.y - 1).toFixed(1));
    r.setAttribute('width', (b.width + 8).toFixed(1)); r.setAttribute('height', (b.height + 2).toFixed(1));
  }
  return g;
}

/* ===== Overview ===== */
const OV_EDGE = {
  dc:{t:'https', lab:'HTTPS', labd:'TCP 443'}, branch:{t:'https', lab:'HTTPS', labd:'TCP 443'},
  aws:{t:'pull', lab:'IAM role', labd:'AssumeRole'}, azure:{t:'pull', lab:'Entra app', labd:'Reader roles'},
  gcp:{t:'pull', lab:'Pub/Sub', labd:'Subscriber'}, oci:{t:'pull', lab:'Policy', labd:'READ policy'},
  saas:{t:'https', lab:'Test results', labd:'TCP 443'}
};
const OV_BGP = {t:'bgp', lab:'BGP', labd:'TCP 179'};
const SW = 290, CW = 320, HW = 188, HH = 140, M = 16, GAP = 14;

/* Card sizes, largest first: full (with the pipeline), compact (all chips), one (first row of chips), mini (title and subtitle) */
function cardLayout(m, w, variant){
  const inner = w - 28, rows = [];
  let row = [], rw = 0;
  m.chips.forEach(c => {
    const cw = Math.ceil(measure(c[1], 'chiptxt')) + 26;
    if(row.length && rw + 6 + cw > inner){ rows.push(row); row = []; rw = 0; }
    rw += (row.length ? 6 : 0) + cw;
    row.push({t:c[0], s:c[1], w:cw});
  });
  if(row.length) rows.push(row);
  if(variant === 'mini') return {rows:[], top:62, variant, h:64};
  if(variant === 'one' && rows.length > 1){
    const first = rows[0].slice(), total = m.chips.length;
    const moreW = k => Math.ceil(measure('+' + k + ' more', 'chiptxt')) + 18;
    let used = first.reduce((a, c, i) => a + c.w + (i ? 6 : 0), 0);
    while(first.length > 1 && used + 6 + moreW(total - first.length) > inner){ const c = first.pop(); used -= c.w + 6; }
    const k = total - first.length;
    first.push({t:'more', s:'+' + k + ' more', w:moreW(k), more:true});
    return {rows:[first], top:62, variant, h:96};
  }
  const top = variant === 'full' ? 138 : 62;
  return {rows, top, variant, h:top + rows.length * 20 + (rows.length - 1) * 6 + 14};
}

const PIPE_CLS = {agent:'ico-ktk', probe:'ico-ktk', egress:'ico-ktk', key:'ico-iam', bucket:'ico-store', storage:'ico-store', queue:'ico-store', connector:'ico-store',
  router:'ico-net', network:'ico-net', server:'ico-srv', app:'ico-srv'};

function drawCard(gN, r, m, dd){
  const g = el('g', {class:'card-ov', role:'button', tabindex:0, 'data-go':m.id, 'aria-label':m.name + '. ' + (dd ? m.oned : m.one) + ' Press Enter to drill in.'}, gN);
  el('rect', {class:'bg', x:r.x, y:r.y, width:r.w, height:r.h, rx:12}, g);
  icon(g, m.icon, r.x + 14, r.y + 13, 20, 'ico ico-' + m.side);
  const pw = Math.ceil(measure(m.tag, 't-tag')) + 14, px = r.x + r.w - 30 - pw;
  el('rect', {class:'tagpill', x:px, y:r.y + 14, width:pw, height:18, rx:9}, g);
  txt(g, px + 7, r.y + 27, m.tag, 't-tag');
  txt(g, r.x + r.w - 15, r.y + 29, '›', 'drill', {'text-anchor':'middle', style:'font-size:18px'});
  fit(txt(g, r.x + 42, r.y + 28, m.name, 't-label'), px - r.x - 50);
  fit(txt(g, r.x + 14, r.y + 50, dd ? m.subd : m.sub, 't-sub'), r.w - 28);
  if(r.lay.variant === 'full'){
    const cy = r.y + 84, xs = [r.x + r.w / 6, r.x + r.w / 2, r.x + r.w * 5 / 6];
    for(let i = 0; i < 2; i++) el('path', {class:'pipe-a', d:`M${(xs[i] + 22).toFixed(1)},${cy} L${(xs[i + 1] - 24).toFixed(1)},${cy}`, 'marker-end':'url(#ah-int)'}, g);
    m.pipe.forEach((p, i) => {
      el('circle', {class:'pipe-c', cx:xs[i].toFixed(1), cy, r:17}, g);
      icon(g, p[0], (xs[i] - 9).toFixed(1), cy - 9, 18, 'ico ' + (PIPE_CLS[p[0]] || ''));
      fit(txt(g, xs[i].toFixed(1), cy + 32, p[1], 'pipe-t', {'text-anchor':'middle'}), r.w / 3 - 6);
      fit(txt(g, xs[i].toFixed(1), cy + 45, p[2], 'pipe-t', {'text-anchor':'middle'}), r.w / 3 - 6);
    });
  }
  let y = r.y + r.lay.top;
  r.lay.rows.forEach(row => {
    let x = r.x + 14;
    row.forEach(c => {
      el('rect', {class:'ovchip', x, y, width:c.w, height:20, rx:10}, g);
      if(c.more) txt(g, x + 9, y + 14, c.s, 'chiptxt');
      else { el('circle', {class:'dot-' + c.t, cx:x + 11, cy:y + 10, r:3.6}, g); txt(g, x + 19, y + 14, c.s, 'chiptxt'); }
      x += c.w + 6;
    });
    y += 26;
  });
  return g;
}

function drawHub(gN, h, dd){
  const g = el('g', {class:'card-ov hub', role:'button', tabindex:0, 'data-go':'kentik', 'aria-label':'Kentik SaaS. Press Enter to see inside the platform.'}, gN);
  el('rect', {class:'bg', x:h.x, y:h.y, width:h.w, height:h.h, rx:14}, g);
  icon(g, 'ib', h.x + 15, h.y + 15, 20);
  txt(g, h.x + 44, h.y + 31, HUB.name, 't-label');
  fit(txt(g, h.x + 14, h.y + 54, dd ? 'Hosted in the US or EU' : 'Your Kentik account', 't-sub'), h.w - 28);
  (dd ? ['flow.kentik.com', 'grpc.api.kentik.com', 'api.kentik.com'] : HUB.rows).forEach((s, i) => {
    el('circle', {class:'hubdot', cx:h.x + 18, cy:h.y + 73 + i * 19, r:2.4}, g);
    fit(txt(g, h.x + 26, h.y + 77 + i * 19, s, 't-sub'), h.w - 36);
  });
  txt(g, h.x + h.w / 2, h.y + h.h - 11, 'See inside ›', 'drill', {'text-anchor':'middle'});
}

/* A branch office tile in the row along the bottom of the overview */
function drawBranchTile(gN, r, i, dd){
  const ua = brUA(i), t = brTarget(i), caps = ua ? capList('br', i) : [];
  const status = ua ? (dd ? 'Own agent · TCP 443 out' : 'Own Universal Agent') : t ? (dd ? 'UDP 9995/162/514 → ' : 'Sends to ') + dcName(t) : 'Nothing collects it yet';
  const g = el('g', {class:'card-ov' + (!ua && !t ? ' warn' : ''), role:'button', tabindex:0, 'data-go':brId(i), 'aria-label':brName(i) + '. ' + status + '. Press Enter to drill in.'}, gN);
  el('rect', {class:'bg', x:r.x, y:r.y, width:r.w, height:r.h, rx:10}, g);
  icon(g, ua ? 'agent' : 'store', r.x + 9, r.y + 9, 17, 'ico ' + (ua ? 'ico-ktk' : 'ico-left'));
  fit(txt(g, r.x + 31, r.y + 22, brName(i), 't-label', {style:'font-size:12.5px'}), r.w - 40);
  fit(txt(g, r.x + 10, r.y + 41, status, 't-sub'), r.w - 20);
  if(r.h >= 70){
    const dots = ua ? caps : t ? ['flow', 'snmp', 'trap', 'syslog'].filter(c => capsOf('dc', t).has(c)) : [];
    dots.forEach((c, k) => el('circle', {class:'dot-' + c, cx:r.x + 14 + k * 11, cy:r.y + 58, r:3.6}, g));
    const lab = ua ? (caps.length ? '' : 'No capabilities on') : t ? 'over the WAN' : 'Add a data center';
    if(lab) fit(txt(g, r.x + 14 + dots.length * 11 + (dots.length ? 2 : -4), r.y + 62, lab, 'chiptxt'), r.w - 24 - dots.length * 11);
  }
  return g;
}

/* Branch row geometry: one row, or two staggered rows so lines from the back row pass between the tiles in front */
function branchBand(rightCol){
  const brs = brIds().map(brIndex), add = S.brN < BR_MAX;
  const x0 = M, x1 = rightCol ? VB[2] - M - SW - 26 : VB[2] - M, rowW = x1 - x0, g = 10;
  const per = Math.max(2, Math.floor((rowW + g) / (100 + g)));
  let slots = brs.length + (add ? 1 : 0), rows = 1, k1 = slots;
  if(slots > per){ rows = 2; k1 = Math.ceil((slots + 1) / 2); if(k1 > per){ k1 = per; slots = Math.min(slots, 2 * per - 1); } }
  const tw = Math.min(rows === 1 ? 188 : 160, (rowW - (k1 - 1) * g) / k1), th = rows === 1 ? 74 : 52;
  const top = VB[3] - M - (rows * th + (rows - 1) * 10), ox = x0 + (rowW - (k1 * tw + (k1 - 1) * g)) / 2;
  const tiles = [];
  for(let j = 0; j < slots; j++){
    const row = j < k1 ? 0 : 1, col = row ? j - k1 : j;
    tiles.push({i:j < brs.length ? brs[j] : 0, x:ox + col * (tw + g) + (row ? (tw + g) / 2 : 0), y:top + row * (th + 10), w:tw, h:th});
  }
  return {top, bus:top - 13, tiles};
}

function renderOverview(){
  const svg = $('#ov');
  svg.innerHTML = '';
  OVR = {};
  const dd = S.mode === 'deep';
  const ids = CHIP_ORDER.filter(id => S.sel.has(id) && id !== 'branch').flatMap(id => id === 'dc' ? dcIds() : [id]);
  const sideOf = id => isDC(id) ? 'left' : MOD[id].side;
  const modFor = id => isDC(id) ? dcMod(id) : MOD[id];
  const side = s => ids.filter(id => sideOf(id) === s);
  const L = side('left'), R = side('right'), T = side('top');
  const gE = el('g', {class:'edges'}, svg), gP = el('g', {class:'pts'}, svg), gN = el('g', {class:'nodes'}, svg), gL = el('g', {class:'labels'}, svg);

  const band = brOn() ? branchBand(R.length > 0) : null;
  const remote = band ? band.tiles.filter(t => t.i && !brUA(t.i) && brTarget(t.i)) : [];
  const lx = remote.length ? 46 : M;
  const column = (list, x, y0, y1) => {
    if(!list.length) return [];
    const H = y1 - y0, each = (H - (list.length - 1) * GAP) / list.length;
    const lays = list.map(id => {
      const m = modFor(id);
      for(const v of ['full', 'compact', 'one']){ const f = cardLayout(m, SW, v); if(f.h <= each) return f; }
      return cardLayout(m, SW, 'mini');
    });
    const sum = lays.reduce((a, l) => a + l.h, 0), gp = list.length > 1 ? Math.max(4, Math.min(GAP, (H - sum) / (list.length - 1))) : 0;
    let y = y0 + Math.max(0, (H - sum - (list.length - 1) * gp) / 2);
    return list.map((id, i) => { const r = {id, x, y, w:SW, h:lays[i].h, lay:lays[i]}; y += r.h + gp; return r; });
  };
  const leftBottom = band ? band.bus - 12 : VB[3] - M;
  const left = column(L, lx, M, leftBottom), right = column(R, VB[2] - M - SW, M, VB[3] - M);
  const top = T.length ? (() => { const lay = cardLayout(modFor(T[0]), CW, band ? 'compact' : 'full'); return {id:T[0], x:(VB[2] - CW) / 2, y:M, w:CW, h:lay.h, lay}; })() : null;
  const y1 = top ? top.y + top.h : 0, y2 = band ? band.bus - 4 : VB[3];
  const hub = {x:(VB[2] - HW) / 2, w:HW, h:HH, y:Math.round((y1 + y2) / 2 - HH / 2)};
  OVR.kentik = [hub.x, hub.y, hub.w, hub.h];

  const edges = [];
  const dcCards = left.filter(r => isDC(r.id)).length;
  const sideEdges = (cards, fromRight) => {
    const list = [];
    cards.forEach(r => {
      const cy = r.y + r.h / 2, two = isDC(r.id) && dcCards <= 2 && bgpMode(dcIndex(r.id)) === 'direct';   // direct BGP from the data center, when it peers with Kentik and there is room
      list.push({r, e:OV_EDGE[modOf(r.id)], y:two ? cy - 12 : cy});
      if(two) list.push({r, e:OV_BGP, y:cy + 12});
    });
    const n = list.length;
    list.forEach((it, i) => {
      const ey = n === 1 ? hub.y + hub.h / 2 : hub.y + 34 + (hub.h - 52) * i / (n - 1);
      const sx = fromRight ? it.r.x : it.r.x + it.r.w, ex = fromRight ? hub.x + hub.w : hub.x;
      const e = Object.assign({}, it.e, {a:it.r.id, b:'kentik', p:[[sx, it.y], [ex, ey]], lp:[(sx + ex) / 2, (it.y + ey) / 2]});
      if(isDC(it.r.id) && dcCards >= 4 && i !== Math.floor((n - 1) / 2)){ delete e.lab; delete e.labd; }   // one HTTPS label is enough for a stack of sites
      edges.push(e);
    });
  };
  sideEdges(left, false);
  sideEdges(right, true);
  const cx = VB[2] / 2;
  if(top) edges.push(Object.assign({}, OV_EDGE[top.id], {a:top.id, b:'kentik', c:'v', p:[[cx, top.y + top.h], [cx, hub.y]], lp:[cx, (top.y + top.h + hub.y) / 2]}));

  /* Branches: their own agent goes up to Kentik; no agent goes across the WAN to a data center agent */
  if(band){
    const own = band.tiles.filter(t => t.i && brUA(t.i));
    own.forEach((t, k) => {
      const hx = own.length === 1 ? cx : hub.x + 26 + (hub.w - 52) * k / (own.length - 1), sx = t.x + t.w / 2;
      edges.push(Object.assign({t:'https', a:brId(t.i), b:'kentik', c:'v', p:[[sx, t.y], [hx, hub.y + hub.h]]},
        k ? {} : {lab:'HTTPS', labd:'TCP 443', lp:[(sx + hx) / 2, (t.y + hub.y + hub.h) / 2]}));
    });
    const dcR = Object.fromEntries(left.filter(r => isDC(r.id)).map(r => [dcIndex(r.id), r]));
    const tgts = [...new Set(remote.map(t => brTarget(t.i)))].filter(d => dcR[d]);
    const maxCx = Math.max(...remote.map(t => t.x + t.w / 2));
    let labeled = false;
    remote.forEach(t => {
      const d = brTarget(t.i), r = dcR[d];
      if(!r) return;
      const caps = capsOf('dc', d), tp = ['flow', 'trap', 'syslog', 'snmp'].find(c => caps.has(c));
      if(!tp) return;
      const gx = lx - 10 - tgts.filter(x => x > d).length * 6, dy = r.y + r.h / 2, sx = t.x + t.w / 2;
      const e = {t:tp, a:brId(t.i), b:dcId(d), p:[[sx, t.y], [sx, band.bus], [gx, band.bus], [gx, dy], [lx, dy]]};
      if(!labeled){ Object.assign(e, {lab:'Branch telemetry over the WAN', labd:'UDP 9995 · 162 · 514 to the agent', lp:[(gx + maxCx) / 2, band.bus]}); labeled = true; }
      edges.push(e);
    });
  }
  edges.forEach((e, i) => drawEdge(gE, gL, e, i, dd, false));

  [...left, ...right, top].filter(Boolean).forEach(r => { drawCard(gN, r, modFor(r.id), dd); OVR[r.id] = [r.x, r.y, r.w, r.h]; });
  if(band){
    band.tiles.forEach(t => {
      if(t.i){ drawBranchTile(gN, t, t.i, dd); OVR[brId(t.i)] = [t.x, t.y, t.w, t.h]; return; }
      const g = el('g', {class:'addbtn', role:'button', tabindex:0, 'data-bradd':1, 'aria-label':'Add a branch office'}, gN);
      el('rect', {x:t.x, y:t.y, width:t.w, height:t.h, rx:10}, g);
      txt(g, t.x + t.w / 2, t.y + t.h / 2 + 4, '+ Add a branch', '', {'text-anchor':'middle'});
    });
    const xs = band.tiles.map(t => t.x), ys = band.tiles.map(t => t.y);
    OVR.brs = [Math.min(...xs), Math.min(...ys), Math.max(...band.tiles.map(t => t.x + t.w)) - Math.min(...xs), Math.max(...band.tiles.map(t => t.y + t.h)) - Math.min(...ys)];
  }
  const dcs = left.filter(r => isDC(r.id));
  if(dcs.length){
    const last = dcs[dcs.length - 1];
    OVR.dcs = [last.x, dcs[0].y, last.w, last.y + last.h - dcs[0].y];
    const ay = last.y + last.h + 8;
    if(S.dcN < DC_MAX && !left.some(r => r.y > last.y) && ay + 26 <= leftBottom + 6){
      const g = el('g', {class:'addbtn', role:'button', tabindex:0, 'data-dcadd':1, 'aria-label':'Add a data center'}, gN);
      el('rect', {x:last.x, y:ay, width:last.w, height:26, rx:9}, g);
      txt(g, last.x + last.w / 2, ay + 17, '+ Add a data center', '', {'text-anchor':'middle'});
    }
  }
  drawHub(gN, hub, dd);
  if(!ids.length && !band) txt(gN, cx, hub.y + hub.h + 42, 'Pick a starting point or deployments above', 'empty-t', {'text-anchor':'middle'});
  svg._edges = edges;
}

/* ===== Legend and picker ===== */
function legendTypes(){
  const svg = S.view === 'ov' ? $('#ov') : $('#dt');
  const set = new Set((svg._edges || []).map(e => e.t));
  return Object.keys(TYPES).filter(t => set.has(t));
}
function renderLegend(){
  const L = $('#legend');
  L.innerHTML = legendTypes().map(t => `<button type="button" data-t="${t}" aria-pressed="${S.hl === t}" title="${esc(TYPES[t].d)}. Click to highlight."><svg viewBox="0 0 30 8" aria-hidden="true"><g class="edge e-${t}"><path class="ln" d="M2 4H28"/></g></svg>${esc(TYPES[t].n)}</button>`).join('');
}
function buildPicker(){
  $('#presets').innerHTML = PRESETS.map(p => `<button type="button" class="pbtn" data-preset="${p.id}" aria-pressed="false">${esc(p.n)}</button>`).join('');
  $('#chips').innerHTML = CHIP_ORDER.map((id, i) => {
    const chip = `<button type="button" class="chip" data-chip="${id}" aria-pressed="false" title="Show or hide. Key ${i + 1} drills in."><span class="box" aria-hidden="true"></span><span class="lab">${esc(CHIP_NAMES[id])}</span></button>`;
    if(id === 'dc') return `<span class="dcset">${chip}<span class="step" role="group" aria-label="Number of data centers"><button type="button" data-dcstep="-1" aria-label="Remove a data center" title="Remove a data center (key −)">−</button><span class="num" id="dcNum" aria-live="polite">1</span><button type="button" data-dcstep="1" aria-label="Add a data center" title="Add a data center (key +)">+</button></span></span>`;
    if(id === 'branch') return `<span class="dcset">${chip}<span class="step" role="group" aria-label="Number of branch offices"><button type="button" data-brstep="-1" aria-label="Remove a branch office" title="Remove a branch office">−</button><span class="num" id="brNum" aria-live="polite">1</span><button type="button" data-brstep="1" aria-label="Add a branch office" title="Add a branch office">+</button></span></span>`;
    return chip;
  }).join('');
}
function syncPicker(){
  document.querySelectorAll('#presets [data-preset]').forEach(b => { const p = PRESETS.find(x => x.id === b.dataset.preset); b.setAttribute('aria-pressed', p.s.length === S.sel.size && p.s.every(x => S.sel.has(x)) ? 'true' : 'false'); });
  document.querySelectorAll('#chips [data-chip]').forEach(b => b.setAttribute('aria-pressed', S.sel.has(b.dataset.chip) ? 'true' : 'false'));
  const shown = S.sel.has('dc') ? S.dcN : 0;
  $('#dcNum').textContent = shown;
  $('#chips [data-chip="dc"] .lab').textContent = shown > 1 ? 'Data centers' : 'Data center';
  $('#chips [data-dcstep="-1"]').disabled = shown === 0;
  $('#chips [data-dcstep="1"]').disabled = shown >= DC_MAX;
  const bs = S.sel.has('branch') ? S.brN : 0;
  $('#brNum').textContent = bs;
  $('#chips [data-chip="branch"] .lab').textContent = bs > 1 ? 'Branches' : 'Branch';
  $('#chips [data-brstep="-1"]').disabled = bs === 0;
  $('#chips [data-brstep="1"]').disabled = bs >= BR_MAX;
}
