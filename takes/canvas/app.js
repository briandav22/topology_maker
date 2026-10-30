'use strict';
/* Take A, Network Canvas.
   The SE draws the customer's own network: sites, network devices, WAN links, clouds and SaaS apps.
   The Kentik deployment is derived from that drawing in derive(): where agents go, how each kind of data
   travels, the rules each firewall needs, the telemetry load on WAN links and the size of each agent host.
   Kentik facts (ports, sizing, cloud steps) come from window.FACTS, built from configurator/catalog.py.
   Sections: helpers, constants, design, plan engine, checks, canvas, interaction, panel, exports, starters, startup. */

const PRISTINE = '<!doctype html>\n' + document.documentElement.outerHTML;
const F = window.FACTS;
const EXAMPLES = window.EXAMPLES || [];
const VIEW_ONLY = !!window.IBK_VIEW_ONLY;
const STORE = 'ibk-canvas-design';
const THEME_KEY = 'ibk-canvas-theme';
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmt1 = n => { const v = Math.round((Number(n) || 0) * 10) / 10; return v.toLocaleString('en-US', { maximumFractionDigits: 1 }); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = p => p + Math.random().toString(36).slice(2, 9);
const ic = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : (many || one + 's')}`;
const r1 = v => Math.round(v * 10) / 10;
const slug = s => String(s || 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'customer';
const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window or full storage: the design still works */ } };
const mbpsTxt = m => m >= 1000 ? `${fmt1(m / 1000)} Gbps` : `${fmt(m)} Mbps`;
const loadTxt = m => m < 0.1 ? '< 0.1 Mbps' : `${fmt1(m)} Mbps`;

/* ---------- constants ---------- */
const KIND = {
  dc: { label: 'Data center', icon: 'i-server', w: 240, h: 132, cls: 'k-dc' },
  campus: { label: 'Campus or HQ', icon: 'i-building', w: 240, h: 132, cls: 'k-campus' },
  branch: { label: 'Branch', icon: 'i-store', w: 214, h: 112, cls: 'k-branch' },
  cloud: { label: 'Cloud', icon: 'i-cloud', w: 240, h: 122, cls: 'k-cloud' },
  saas: { label: 'SaaS apps', icon: 'i-app', w: 206, h: 98, cls: 'k-saas' },
};
const KENTIK = { w: 244, h: 92 };
const ONPREM = ['dc', 'campus', 'branch'];
const DEV = [
  { id: 'router', label: 'Routers', one: 'router', icon: 'i-router', t: 'flow snmp trap syslog bgp ssh' },
  { id: 'switch', label: 'Switches', one: 'switch', icon: 'i-switch', t: 'flow snmp trap syslog ssh' },
  { id: 'firewall', label: 'Firewalls', one: 'firewall', icon: 'i-firewall', t: 'flow snmp trap syslog ssh' },
  { id: 'lb', label: 'Load balancers', one: 'load balancer', icon: 'i-network', t: 'flow snmp trap syslog' },
  { id: 'dns', label: 'DNS servers (for example Infoblox NIOS)', one: 'DNS server', icon: 'i-dns', t: 'dns' },
];
const DEF = {
  dc: { dev: { router: 4, switch: 20, firewall: 2, lb: 2, dns: 0 }, fps: 20000, eps: 2000, install: 'linux' },
  campus: { dev: { router: 2, switch: 30, firewall: 2, lb: 0, dns: 0 }, fps: 8000, eps: 800, install: 'linux' },
  branch: { dev: { router: 1, switch: 2, firewall: 1, lb: 0, dns: 0 }, fps: 2000, eps: 200, install: 'docker' },
};
const PROV = {
  aws: { name: 'AWS', short: 'AWS', color: '#ff9900', unit: 'account', hint: 'us-east-1, us-west-2' },
  azure: { name: 'Azure', short: 'Az', color: '#0078d4', unit: 'subscription', hint: 'eastus2, westeurope' },
  gcp: { name: 'Google Cloud', short: 'GC', color: '#4285f4', unit: 'project', hint: 'us-central1' },
  oci: { name: 'Oracle Cloud', short: 'OCI', color: '#c74634', unit: 'tenancy', hint: 'us-ashburn-1' },
};
const LINKK = {
  wan: { label: 'WAN (MPLS or SD-WAN)', short: 'WAN', mbps: 100 },
  internet: { label: 'Internet or VPN', short: 'VPN', mbps: 200 },
  dci: { label: 'Data center interconnect', short: 'DCI', mbps: 10000 },
  cloud: { label: 'Cloud interconnect (Direct Connect, ExpressRoute)', short: 'Interconnect', mbps: 1000 },
};
const TYPES = {
  https: 'To Kentik over HTTPS 443', flow: 'Flow', snmp: 'SNMP and streaming telemetry', trap: 'SNMP traps', syslog: 'Syslog',
  dns: 'DNS lookups (DNSTAP)', ssh: 'Config sync (SSH)', bgp: 'BGP', synth: 'Synthetic tests', cloud: 'Cloud logs and metadata',
};
const LANE = ['https', 'flow', 'snmp', 'trap', 'syslog', 'dns', 'ssh', 'bgp', 'synth', 'cloud'];
const CAP_T = ['flow', 'snmp', 'trap', 'syslog', 'dns', 'synth', 'ssh'];  // capabilities set per agent (BGP Proxy comes from the BGP choice)
const LENSES = [
  { id: 'all', label: 'All data', key: '1', types: null, title: 'Every line is data on its way to Kentik',
    text: 'Agents send everything to Kentik over HTTPS 443, outbound only. Thin colored lines show telemetry that crosses the WAN to an agent. Pick a lens to follow one kind of data. Hover or click a site to trace its paths.' },
  { id: 'flow', label: 'Flow', key: '2', types: ['flow'], title: 'Flow',
    text: 'Routers, switches and firewalls export NetFlow, sFlow or IPFIX to a Universal Agent on UDP 9995. The agent sends it to Kentik over HTTPS 443.' },
  { id: 'metrics', label: 'Metrics', key: '3', types: ['snmp', 'ssh'], title: 'Device metrics and config',
    text: 'The agent polls devices with SNMP (UDP 161) or streaming telemetry, and can back up configs over SSH (TCP 22). Dots move from the agent toward the devices because the agent starts these sessions.' },
  { id: 'events', label: 'Events', key: '4', types: ['trap', 'syslog'], title: 'Traps and syslog',
    text: 'Network devices send SNMP traps (UDP 162) and syslog (UDP or TCP 514) to the agent the moment something happens.' },
  { id: 'bgp', label: 'BGP', key: '5', types: ['bgp'], title: 'BGP',
    text: 'Edge routers peer BGP with Kentik directly (TCP 179, dashed), or with the agent when BGP Proxy is on. BGP here is telemetry only: routing does not change.' },
  { id: 'dns', label: 'DNS', key: '6', types: ['dns'], title: 'DNS lookups',
    text: 'DNS servers such as Infoblox NIOS stream DNSTAP to the agent\'s DNS OTT Tap, so every flow can show the name that was looked up.' },
  { id: 'tests', label: 'Tests', key: '7', types: ['synth'], title: 'Synthetic tests',
    text: 'Agents with Connectivity Test measure each other (TCP 8877, UDP 9977) and the SaaS apps. Kentik\'s global agents test the apps from the Internet (dashed).' },
  { id: 'cloud', label: 'Cloud', key: '8', types: ['cloud'], title: 'Clouds',
    text: 'No agents in the cloud. Kentik reads flow logs from storage the customer owns, and calls read-only APIs for metadata.' },
  { id: 'firewall', label: 'Firewalls', key: '9', types: [], title: 'Firewall rules',
    text: 'Badges count the rules each site\'s firewall needs. Click a site to see its rules, or open the Firewall rules tab for the full list and the CSV.' },
  { id: 'load', label: 'WAN load', key: '0', types: [], title: 'Telemetry on the WAN',
    text: 'Link color shows how much of each link the telemetry uses: green is low, amber is worth a look, red is too much. These are rough planning numbers, not Kentik KB figures.' },
];
const LENS = Object.fromEntries(LENSES.map(l => [l.id, l]));
// Rough planning numbers for WAN load. They are not from the Kentik KB, and the panel says so.
const EST = { flowBytes: 60, syslogBytes: 300, snmpBps: 1500 };

/* ---------- state ---------- */
let D = null;               // the design
let P = null;               // the plan derived from the design
let sel = null;             // {t:'site'|'link'|'kentik', id}
let hover = null;           // site id under the pointer
let lens = 'all';
let tab = 'inspect';
let motion = !REDUCED;
let showInside = false;     // firewall rules tab: include rules inside a site
let view = { x: 0, y: 0, k: 1 };
let drag = null;
let dragging = false;
let lastSnap = '';
const undoStack = [], redoStack = [];

/* ---------- design ---------- */
function blankDesign() {
  return { v: 1, meta: { customer: 'New customer', project: 'Network observability with Infoblox + Kentik', preparedBy: '', region: 'US' }, sites: [], links: [], kentik: { x: -KENTIK.w / 2, y: 0 } };
}
function makeSite(d, kind, extra = {}) {
  const n = d.sites.filter(s => s.kind === kind && (kind !== 'cloud' || s.provider === (extra.provider || 'aws'))).length + 1;
  const s = { id: uid('s'), kind, name: '', location: '', x: 0, y: 0, count: 1 };
  if (DEF[kind]) Object.assign(s, { dev: { ...DEF[kind].dev }, fps: DEF[kind].fps, eps: DEF[kind].eps, dnsLps: 0, install: DEF[kind].install, agent: 'auto', sendTo: '', caps: null, flowMode: 'forward', bgp: 'off' });
  if (kind === 'cloud') Object.assign(s, { provider: 'aws', accounts: 1, regions: '', feats: { flow: true, firewall: false, metrics: false } });
  if (kind === 'saas') Object.assign(s, { apps: ['Microsoft 365', 'Salesforce'] });
  Object.assign(s, extra);
  if (extra.dev) s.dev = { ...DEF[kind].dev, ...extra.dev };
  if (!s.name) s.name = kind === 'cloud' ? PROV[s.provider].name : kind === 'saas' ? 'SaaS apps' : `${KIND[kind].label.split(' ')[0] === 'Campus' ? 'Campus' : KIND[kind].label} ${n}`;
  return s;
}
function normalizeDesign(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.sites)) return null;
  const out = blankDesign();
  out.meta = Object.assign(out.meta, d.meta || {});
  if (!F.regions[out.meta.region]) out.meta.region = 'US';
  const seen = new Set();
  d.sites.forEach(s0 => {
    if (!s0 || !KIND[s0.kind]) return;
    const s = makeSite(out, s0.kind, s0.kind === 'cloud' ? { provider: PROV[s0.provider] ? s0.provider : 'aws' } : {});
    for (const k of Object.keys(s)) if (s0[k] !== undefined && k !== 'dev' && k !== 'feats') s[k] = s0[k];
    if (s.dev) s.dev = Object.assign({}, s.dev, s0.dev || {});
    if (s.feats) s.feats = Object.assign({}, s.feats, s0.feats || {});
    if (!s.id || seen.has(s.id)) s.id = uid('s');
    seen.add(s.id);
    s.x = Number(s.x) || 0; s.y = Number(s.y) || 0; s.count = Math.max(1, Math.round(Number(s.count) || 1));
    if (s.apps && !Array.isArray(s.apps)) s.apps = String(s.apps).split(',').map(a => a.trim()).filter(Boolean);
    out.sites.push(s);
  });
  const ids = new Set(out.sites.map(s => s.id));
  (d.links || []).forEach(l => {
    if (l && ids.has(l.a) && ids.has(l.b) && l.a !== l.b) out.links.push({ id: l.id || uid('l'), a: l.a, b: l.b, kind: LINKK[l.kind] ? l.kind : 'wan', mbps: Math.max(1, Number(l.mbps) || LINKK[l.kind]?.mbps || 100) });
  });
  out.sites.forEach(s => { if (s.sendTo && !ids.has(s.sendTo)) s.sendTo = ''; });
  if (d.kentik && isFinite(d.kentik.x)) out.kentik = { x: Number(d.kentik.x), y: Number(d.kentik.y) || 0 };
  if (d._layout) out._layout = true;
  return out;
}
const byId = id => D.sites.find(s => s.id === id);
const linkById = id => D.links.find(l => l.id === id);
const isOnprem = s => !!DEF[s.kind];
const netDevices = s => (s.dev.router || 0) + (s.dev.switch || 0) + (s.dev.firewall || 0) + (s.dev.lb || 0);
function isAgent(s) {
  if (!isOnprem(s)) return false;
  if (s.agent === 'on') return true;
  if (s.agent === 'off') return false;
  return s.kind !== 'branch';
}
function autoCaps(s) {
  const c = { flow: true, snmp: true, trap: false, syslog: false, dns: false, synth: false, ssh: false };
  if (s.kind === 'branch') c.synth = true; else { c.trap = true; c.syslog = true; }
  if ((s.dev.dns || 0) > 0) c.dns = true;
  return c;
}
function capsOf(s) {
  const c = Object.assign(autoCaps(s), s.caps || {});
  c.bgp = s.bgp === 'proxy';
  return c;
}
function capName(cid, mode) { return cid === 'flow' ? F.flowModes[mode === 'edge' ? 'edge' : 'forward'] : F.caps[cid].name; }

/* ---------- plan engine ---------- */
function box(id) {
  if (id === 'kentik') return { x: D.kentik.x, y: D.kentik.y, w: KENTIK.w, h: KENTIK.h };
  const s = byId(id); const k = KIND[s.kind];
  return { x: s.x, y: s.y, w: k.w, h: k.h };
}
const ctr = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
function edgePt(b, to, pad = 3) {
  const c = ctr(b); const dx = to.x - c.x, dy = to.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min((b.w / 2 + pad) / Math.abs(dx || 1e-9), (b.h / 2 + pad) / Math.abs(dy || 1e-9));
  return { x: c.x + dx * t, y: c.y + dy * t };
}
function bfs(start, adj, S, isGoal) {
  const prev = new Map([[start, null]]); const q = [start];
  while (q.length) {
    const id = q.shift();
    if (id !== start && isGoal(id)) {
      const path = [id], links = []; let cur = id;
      while (cur !== start) { const p = prev.get(cur); links.unshift(p.l); cur = p.from; path.unshift(cur); }
      return { path, links };
    }
    for (const e of adj.get(id) || []) {
      if (prev.has(e.to)) continue;
      const t = S.get(e.to);
      if (!t || t.kind === 'saas') continue;
      prev.set(e.to, { from: id, l: e.l }); q.push(e.to);
    }
  }
  return null;
}
function sizing(caps, mode, L) {
  const rows = [];
  const add = (key, units, qty) => {
    const s = F.sizing[key];
    if (s.cpu == null) { rows.push({ label: s.label, qty, res: 'Not published', cpu: 0, ram: 0 }); return; }
    if (s.per && !units) qty = `Not given; KB baseline up to ${fmt(s.per)} ${s.unit}`;
    const n = s.per ? Math.max(1, Math.ceil(units / s.per)) : 1;
    if (n > 1 && s.estimate) qty += ' (scaled from the KB figure: confirm with Kentik)';
    rows.push({ label: s.label, qty, res: `${s.cpu} core${s.cpu > 1 ? 's' : ''} / ${s.ram} GB${n > 1 ? ' × ' + n : ''}`, cpu: s.cpu * n, ram: s.ram * n, scaled: n > 1 && s.estimate });
  };
  if (caps.flow) add(mode === 'edge' ? 'flow_edge' : 'flow_forward', L.fps, `${fmt(L.fps)} flows/s`);
  if (caps.snmp) add('snmp', L.dev, `${fmt(L.dev)} devices`);
  if (caps.syslog) add('syslog', L.eps, `${fmt(L.eps)} events/s`);
  if (caps.dns) add('dns', L.dns, L.dns ? `${fmt(L.dns)} lookups/s` : 'per 400k lookups/s');
  if (caps.synth) add('synth', 1, 'per agent');
  if (caps.trap) add('trap', 1, 'event driven');
  if (caps.ssh) add('ssh', 1, 'per fetch interval');
  if (caps.bgp) add('bgp', 1, 'per agent');
  const cpu = rows.reduce((a, r) => a + r.cpu, 0), ram = rows.reduce((a, r) => a + r.ram, 0);
  return { rows, cpu, ram, recCpu: Math.max(2, Math.ceil(cpu * (1 + F.headroom))), recRam: Math.max(2, Math.ceil(ram * (1 + F.headroom))) };
}
function teleMbps(s, c) {
  let bps = 0;
  if (c.flow) bps += (s.fps || 0) * EST.flowBytes * 8;
  if (c.syslog) bps += (s.eps || 0) * EST.syslogBytes * 8;
  if (c.snmp) bps += netDevices(s) * EST.snmpBps;
  return bps / 1e6;
}

function derive() {
  const S = new Map(D.sites.map(s => [s.id, s]));
  const adj = new Map(D.sites.map(s => [s.id, []]));
  D.links.forEach(l => { if (S.has(l.a) && S.has(l.b)) { adj.get(l.a).push({ to: l.b, l }); adj.get(l.b).push({ to: l.a, l }); } });
  const st = {};
  const onprem = D.sites.filter(isOnprem);
  onprem.forEach(s => { st[s.id] = { agent: isAgent(s), caps: capsOf(s), feeds: [], route: null, links: [], target: null, noPath: false, mbps: 0 }; });
  const agents = onprem.filter(s => st[s.id].agent);
  const nearest = s => { let best = null, bd = Infinity; const c = ctr(box(s.id)); agents.forEach(a => { const ac = ctr(box(a.id)); const dd = Math.hypot(ac.x - c.x, ac.y - c.y); if (dd < bd) { bd = dd; best = a.id; } }); return best; };
  onprem.filter(s => !st[s.id].agent).forEach(s => {
    const want = s.sendTo && st[s.sendTo] && st[s.sendTo].agent ? s.sendTo : null;
    const r = bfs(s.id, adj, S, id => want ? id === want : !!(st[id] && st[id].agent));
    const x = st[s.id];
    if (r) { x.route = r.path; x.links = r.links; x.target = r.path[r.path.length - 1]; }
    else { x.noPath = true; x.target = want || nearest(s); x.route = x.target ? [s.id, x.target] : null; }
    if (x.target) st[x.target].feeds.push(s.id);
  });
  // load on each agent: its own site plus every site that sends to it
  const per = s => ({ fps: s.fps || 0, dev: netDevices(s), eps: s.eps || 0, dns: s.dnsLps || 0 });
  agents.forEach(a => {
    const x = st[a.id]; const L = per(a);
    x.feeds.forEach(fid => { const f = S.get(fid); const n = f.count || 1; const v = per(f); L.fps += v.fps * n; L.dev += v.dev * n; L.eps += v.eps * n; L.dns += v.dns * n; });
    x.load = L; x.size = sizing(x.caps, a.flowMode, L);
  });
  // telemetry across links
  const linkLoad = {};
  onprem.filter(s => !st[s.id].agent && st[s.id].target).forEach(s => {
    const x = st[s.id]; const m1 = teleMbps(s, st[x.target].caps); const n = s.count || 1;
    x.mbps = m1; x.mbpsAll = m1 * n;
    x.links.forEach((l, i) => {
      const e = linkLoad[l.id] || (linkLoad[l.id] = { mbps: 0, each: false, from: [] });
      const each = i === 0 && n > 1;
      e.mbps += each ? m1 : m1 * n; e.each = e.each || each; e.from.push({ id: s.id, mbps: each ? m1 : m1 * n });
    });
  });
  const rules = buildRules(S, st, agents, onprem);
  const paths = buildPaths(st, agents, onprem);
  const totals = {
    sites: D.sites.reduce((a, s) => a + (isOnprem(s) ? s.count || 1 : 0), 0),
    agents: agents.reduce((a, s) => a + (s.count || 1), 0),
    cpu: agents.reduce((a, s) => a + st[s.id].size.recCpu * (s.count || 1), 0),
    ram: agents.reduce((a, s) => a + st[s.id].size.recRam * (s.count || 1), 0),
    rules: rules.filter(r => !r.inside).length,
    devices: onprem.reduce((a, s) => a + (netDevices(s) + (s.dev.dns || 0)) * (s.count || 1), 0),
    clouds: D.sites.filter(s => s.kind === 'cloud').length,
  };
  return { st, agents, onprem, linkLoad, rules, paths, totals };
}

function buildRules(S, st, agents, onprem) {
  const R = [];
  const reg = F.regions[D.meta.region] || F.regions.US;
  const where = s => (s.dev && s.dev.firewall > 0) ? `${s.name} firewall` : `${s.name} Internet edge (no firewall drawn)`;
  const who = s => (s.count || 1) > 1 ? `Devices at each of the ${fmt(s.count)} ${s.name} sites` : `${s.name} network devices`;
  agents.forEach(a => {
    const c = st[a.id].caps; const at = { at: a.id, where: where(a) }; const ag = `${a.name} agent${(a.count || 1) > 1 ? 's' : ''}`;
    R.push({ ...at, src: ag, dst: `Kentik SaaS (${reg.hosts.join(', ')})`, port: 'TCP 443, TLS 1.2+', why: 'All telemetry, control and updates. Outbound only.', t: 'https' });
    if (c.flow) R.push({ ...at, src: ag, dst: 'Kentik SaaS', port: 'UDP 40010 (optional)', why: 'Flow Proxy base port', t: 'flow' });
    const inside = { at: a.id, where: `Inside ${a.name} (only if the devices and the agent are in different zones)`, inside: true };
    CAP_T.concat(['bgp']).forEach(cid => {
      if (!c[cid] || cid === 'synth') return;
      F.caps[cid].inbound.forEach(r => R.push({ ...inside, src: r.src, dst: ag, port: r.port, why: r.why, t: cid }));
      F.caps[cid].outbound.forEach(r => R.push({ ...inside, src: ag, dst: r.dst, port: r.port, why: r.why, t: cid }));
    });
  });
  onprem.forEach(s => {
    if (s.bgp === 'direct' && (s.dev.router || 0) > 0) R.push({ at: s.id, where: where(s), src: `${s.name} edge routers`, dst: 'Kentik ingest peering IPs (shown in device settings)', port: 'TCP 179', why: 'BGP peering with Kentik, telemetry only', t: 'bgp' });
  });
  onprem.filter(s => !st[s.id].agent && st[s.id].target).forEach(s => {
    const T = S.get(st[s.id].target); const c = st[T.id].caps; const src = who(s); const ag = `${T.name} agent`;
    const items = [];
    if (c.flow) items.push({ src, dst: ag, port: 'UDP 9995', why: 'Flow export', t: 'flow' });
    if (c.trap) items.push({ src, dst: ag, port: 'UDP 162', why: 'SNMP traps', t: 'trap' });
    if (c.syslog) items.push({ src, dst: ag, port: 'UDP and TCP 514', why: 'Syslog', t: 'syslog' });
    if (c.dns && (s.dev.dns || 0) > 0) items.push({ src: `${s.name} DNS servers`, dst: ag, port: 'DNSTAP port you choose', why: 'DNSTAP stream', t: 'dns' });
    if (c.snmp) items.push({ src: ag, dst: src, port: 'UDP 161, ICMP', why: 'SNMP/ST polling across the WAN', t: 'snmp' });
    if (c.ssh) items.push({ src: ag, dst: `${src} (management IPs)`, port: 'TCP 22', why: 'Device Configuration Sync across the WAN', t: 'ssh' });
    const hops = (st[s.id].route || [s.id, T.id]).map(id => S.get(id)).filter(x => x && isOnprem(x) && x.dev.firewall > 0);
    const at = hops.length ? hops : [s];
    at.forEach(h => items.forEach(it => R.push({ ...it, at: h.id, where: h.dev.firewall > 0 ? `${h.name} firewall` : `${h.name} WAN edge`, cross: true })));
  });
  const sa = agents.filter(a => st[a.id].caps.synth);
  if (sa.length >= 2 || (sa.length && agents.some(a => a.count > 1 && st[a.id].caps.synth))) {
    sa.forEach(a => {
      const others = sa.filter(b => b !== a).map(b => b.name);
      R.push({ at: a.id, where: where(a), src: `${a.name} agent`, dst: others.length ? `Other test agents (${others.join(', ')})` : 'Other test agents', port: 'TCP 8877 and UDP 9977, both directions', why: 'Agent-to-agent and mesh tests', t: 'synth' });
    });
  }
  sa.forEach(a => R.push({ at: a.id, where: where(a), src: `${a.name} agent`, dst: 'Test targets (SaaS apps, sites, DNS servers)', port: 'ICMP, TCP or UDP; TCP 80 and 443', why: 'Ping, traceroute and HTTP(S) tests', t: 'synth' }));
  return R;
}

function buildPaths(st, agents, onprem) {
  const paths = [];
  const add = (t, chain, o = {}) => paths.push(Object.assign({ id: 'tp' + paths.length, t, chain, touch: chain.filter(c => c !== 'kentik'), via: [], rev: false, dash: false, trunk: false, arc: 0, both: false }, o));
  agents.forEach(a => {
    const c = st[a.id].caps; const x = st[a.id];
    add('https', [a.id, 'kentik'], { trunk: true, base: true, touch: [a.id, ...x.feeds] });
    CAP_T.forEach(t => { if (c[t]) add(t, [a.id, 'kentik'], { trunk: true, touch: [a.id, ...x.feeds] }); });
    if (c.bgp) add('bgp', [a.id, 'kentik'], { trunk: true, touch: [a.id] });
  });
  onprem.filter(s => !st[s.id].agent && st[s.id].route).forEach(s => {
    const x = st[s.id]; const c = st[x.target].caps;
    ['flow', 'trap', 'syslog', 'snmp', 'ssh', 'dns'].forEach(t => {
      if (!c[t]) return;
      if (t === 'dns' && !(s.dev.dns > 0)) return;
      add(t, x.route, { rev: t === 'snmp' || t === 'ssh', dash: x.noPath, feed: true, via: x.links.map(l => l.id) });
    });
  });
  onprem.forEach(s => { if (s.bgp === 'direct' && (s.dev.router || 0) > 0) add('bgp', [s.id, 'kentik'], { dash: true }); });
  const sa = agents.filter(a => st[a.id].caps.synth);
  for (let i = 0; i < sa.length; i++) for (let j = i + 1; j < sa.length; j++) add('synth', [sa[i].id, sa[j].id], { arc: 1, both: true });
  D.sites.filter(s => s.kind === 'saas').forEach(x => {
    sa.forEach(a => add('synth', [a.id, x.id], { arc: 0.6 }));
    add('synth', ['kentik', x.id], { dash: true, touch: [x.id], label: 'Global agents' });
  });
  D.sites.filter(s => s.kind === 'cloud').forEach(c => add('cloud', ['kentik', c.id], { dash: true, rev: true, label: 'Kentik reads' }));
  return paths;
}

function synthEstimate() {
  const cr = F.synthCredits;
  const n = P.agents.filter(a => P.st[a.id].caps.synth).reduce((t, s) => t + (s.count || 1), 0);
  const apps = D.sites.filter(s => s.kind === 'saas').reduce((t, s) => t + s.apps.length, 0);
  const rows = [];
  if (n >= 2) { const per = n * (n - 1) * cr.private_subtest; rows.push({ what: `Mesh between ${n} agents, every minute`, per, month: per * cr.runs_per_month_1min }); }
  if (apps) { const g = 3, t = 5; const per = apps * (n * t * cr.http_private_per_s + g * t * cr.http_global_per_s); rows.push({ what: `HTTP(S) tests to ${plural(apps, 'SaaS app')} every 5 minutes, from ${n} private and ${g} global agents`, per, month: per * cr.runs_per_month_1min / 5 }); }
  return { rows, total: rows.reduce((t, r) => t + r.month, 0), n, apps };
}

/* ---------- checks: what the SE should look at, each with a fix where one exists ---------- */
function checks() {
  const out = [];
  const add = (sev, text, target, fix) => out.push({ sev, text, target, fix });
  const { st, agents, onprem } = P;
  if (!D.sites.length) { add('info', 'The canvas is empty. Add the customer\'s sites with the buttons on the left, or open a starter.'); return out; }
  if (onprem.length && !agents.length) {
    const first = onprem.find(s => s.kind !== 'branch') || onprem[0];
    add('error', 'No site has a Universal Agent, so no on-prem data can reach Kentik.', first.id, { label: `Put an agent at ${first.name}`, run: () => { first.agent = 'on'; } });
  }
  onprem.filter(s => !st[s.id].agent).forEach(s => {
    const x = st[s.id];
    if (!x.target) return;
    if (x.noPath) {
      const T = byId(x.target);
      add('error', `${s.name} sends its data to ${T.name}, but no link joins them. Draw the WAN link, or give ${s.name} its own agent.`, s.id,
        { label: `Link ${s.name} to ${T.name}`, run: () => addLink(s.id, T.id) });
    }
  });
  Object.entries(P.linkLoad).forEach(([lid, e]) => {
    const l = linkById(lid); if (!l) return;
    const u = e.mbps / l.mbps;
    if (u < 0.1) return;
    const big = e.from.slice().sort((a, b) => b.mbps - a.mbps)[0]; const src = byId(big.id);
    add(u >= 0.3 ? 'error' : 'warn', `Telemetry uses about ${Math.round(u * 100)}% of the ${byId(l.a).name} to ${byId(l.b).name} link (${loadTxt(e.mbps)} of ${mbpsTxt(l.mbps)}${e.each ? ', per site' : ''}). An agent at the source keeps the data off the WAN.`, l.a,
      { label: `Put an agent at ${src.name}`, run: () => { src.agent = 'on'; } });
  });
  onprem.filter(s => (s.dev.dns || 0) > 0).forEach(s => {
    const x = st[s.id]; const a = x.agent ? s : x.target ? byId(x.target) : null;
    if (a && !st[a.id].caps.dns) add('info', `${s.name} has DNS servers, but DNS OTT Tap is off on the ${a.name} agent. Turn it on to see the name behind each flow (DNSTAP from Infoblox NIOS).`, a.id,
      { label: `Turn on DNS OTT Tap at ${a.name}`, run: () => setCap(a, 'dns', true) });
  });
  const sa = agents.filter(a => st[a.id].caps.synth);
  const saas = D.sites.filter(s => s.kind === 'saas');
  if (agents.length >= 2 && sa.length < 2) {
    const pick = agents.filter(a => !st[a.id].caps.synth).slice(0, 2 - sa.length);
    add('info', `${sa.length ? 'Only one agent runs' : 'No agent runs'} Connectivity Test, so there are no site-to-site tests.`, pick[0] && pick[0].id,
      { label: `Turn on Connectivity Test at ${pick.map(a => a.name).join(' and ')}`, run: () => pick.forEach(a => setCap(a, 'synth', true)) });
  }
  if (saas.length && !sa.length) add('warn', 'The SaaS apps are tested only from Kentik\'s global agents, because no site agent runs Connectivity Test. Users\' own experience from the sites is not measured.', saas[0].id,
    agents.length ? { label: `Turn on Connectivity Test at ${agents[0].name}`, run: () => setCap(agents[0], 'synth', true) } : null);
  const se = synthEstimate();
  const mesh = se.rows.find(r => r.what.startsWith('Mesh'));
  if (mesh && se.n >= 12) add('warn', `A full mesh between ${se.n} agents every minute uses about ${fmt(mesh.month)} test credits a month. Test a few sites in a mesh, and the rest to the data centers only.`, sa[0] && sa[0].id);
  if (agents.some(a => a.bgp === 'proxy')) add('warn', F.openItemBgpProxy, agents.find(a => a.bgp === 'proxy').id);
  agents.forEach(a => {
    const x = st[a.id];
    if (x.size.rows.some(r => r.scaled)) add('info', `${a.name} agent receives ${fmt(x.load.fps)} flows/s, above the KB figure for one host. Its size is scaled from the KB and is an estimate: confirm with Kentik.`, a.id);
    if (a.flowMode === 'edge' && x.size.recCpu >= 12) add('info', `${a.name} needs a large host (${x.size.recCpu} vCPU, ${x.size.recRam} GB) because Flow Proxy runs in Edge Processing mode. Forwarding mode needs far less.`, a.id,
      { label: 'Use Forwarding mode', run: () => { a.flowMode = 'forward'; } });
    if ((a.count || 1) > 1) add('info', `${a.name} is a group of ${a.count} sites, each with its own agent: ${a.count} agents to install.`, a.id);
  });
  onprem.filter(s => !netDevices(s)).forEach(s => add('info', `${s.name} has no network devices yet. Add its routers, switches and firewalls in the panel.`, s.id));
  D.sites.filter(s => s.kind === 'cloud').forEach(c => {
    const regions = c.regions.split(',').map(r => r.trim()).filter(Boolean);
    if (c.provider === 'aws' && regions.length > 1 && c.feats.flow) add('info', `${c.name}: plan one S3 bucket per region (${regions.length} buckets). Kentik treats each bucket as one device.`, c.id);
    if (c.provider === 'aws' && c.accounts > 1) add('info', `${c.name}: ${c.accounts} accounts. Kentik assumes one primary role, which assumes a secondary role in each other account.`, c.id);
  });
  return out.sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.sev] - { error: 0, warn: 1, info: 2 }[b.sev]));
}
function setCap(s, cid, on) {
  s.caps = Object.assign({}, s.caps || {}); s.caps[cid] = on;
}

/* ---------- canvas ---------- */
const stage = $('#stage'), world = $('#world');
function applyView() {
  world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
  const g = 22 * view.k;
  stage.style.backgroundSize = `${g}px ${g}px`;
  stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
}
function worldBox() {
  const bs = D.sites.map(s => box(s.id)).concat([box('kentik')]);
  const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
  const X = Math.max(...bs.map(b => b.x + b.w)), Y = Math.max(...bs.map(b => b.y + b.h));
  return { x, y, w: X - x, h: Y - y };
}
function fit(animate = true) {
  const r = stage.getBoundingClientRect(); const bb = worldBox();
  const cap = $('#caption'); const padT = Math.max(64, (cap ? cap.offsetHeight + 28 : 92)), padB = 72, padX = 40;
  const k = clamp(Math.min((r.width - 2 * padX) / bb.w, (r.height - padT - padB) / bb.h), 0.2, 1.15);
  const to = { k, x: (r.width - bb.w * k) / 2 - bb.x * k, y: padT + (r.height - padT - padB - bb.h * k) / 2 - bb.y * k };
  glide(to, animate);
}
function glide(to, animate) {
  if (!animate || REDUCED) { view = to; applyView(); return; }
  const from = { ...view }; const t0 = performance.now(); const dur = 380;
  const step = now => {
    const p = clamp((now - t0) / dur, 0, 1); const e = 1 - Math.pow(1 - p, 3);
    view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
    applyView(); if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function zoomAt(f, cx, cy) {
  const r = stage.getBoundingClientRect();
  const px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
  const k = clamp(view.k * f, 0.15, 2.5); const s = k / view.k;
  view = { k, x: px - (px - view.x) * s, y: py - (py - view.y) * s };
  applyView();
}
function centerOn(id) {
  const b = box(id); const c = ctr(b); const r = stage.getBoundingClientRect();
  const k = Math.max(view.k, 0.75);
  glide({ k, x: r.width / 2 - c.x * k - (tab === 'inspect' ? 0 : 0), y: r.height / 2 - c.y * k }, true);
}
function toWorld(e) {
  const r = stage.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
}

function nodeHTML(s) {
  const k = KIND[s.kind]; const x = P.st[s.id];
  const cls = ['node', k.cls];
  if (sel && sel.t === 'site' && sel.id === s.id) cls.push('sel');
  if ((s.count || 1) > 1) cls.push('group');
  let style = `left:${s.x}px;top:${s.y}px;width:${k.w}px;height:${k.h}px`;
  let head, body = '', badge = '';
  const cnt = (s.count || 1) > 1 ? `<span class="cnt">×${fmt(s.count)}</span>` : '';
  if (isOnprem(s)) {
    const caps = x.agent ? x.caps : x.target ? P.st[x.target].caps : {};
    ['flow', 'snmp', 'trap', 'syslog', 'bgp', 'dns'].forEach(t => {
      if (t === 'bgp' ? (s.bgp !== 'off') : caps[t]) cls.push('has-' + t);
    });
    if (s.dev.firewall > 0) cls.push('fwsite');
    head = `<span class="kic">${ic(k.icon)}</span><div class="nt"><b>${esc(s.name)}</b><small>${esc([k.label, s.location].filter(Boolean).join(' · '))}</small></div>${cnt}`;
    const devs = DEV.filter(d => (s.dev[d.id] || 0) > 0).map(d => `<span class="dv" data-t="${d.t}" title="${esc(d.label)}">${ic(d.icon)}${fmt(s.dev[d.id])}</span>`).join('');
    body += `<div class="devs">${devs || '<span class="dv">No devices yet</span>'}</div>`;
    if (x.agent) {
      const dots = CAP_T.concat(['bgp']).filter(c => x.caps[c]).map(c => `<i style="background:var(--t-${c})" title="${esc(capName(c, s.flowMode))}"></i>`).join('');
      body += `<div class="kf agent" title="Universal Agent on ${s.install === 'docker' ? 'Docker' : 'a Linux host'}: ${x.size.recCpu} vCPU, ${x.size.recRam} GB"><svg class="hex" aria-hidden="true"><use href="#i-agent"/></svg><span class="txt"><b>Agent</b> · ${s.install === 'docker' ? 'Docker' : 'Linux'} · ${x.size.recCpu} vCPU</span><span class="capdots">${dots}</span></div>`;
    } else if (x.target) {
      const T = byId(x.target);
      body += x.noPath ? `<div class="kf"><span class="txt err">No link to ${esc(T.name)}</span></div>`
        : `<div class="kf">${ic('i-route')}<span class="txt">Sends to <b>${esc(T.name)}</b>${x.route.length > 2 ? ` via ${x.route.length - 2} hop${x.route.length > 3 ? 's' : ''}` : ''}</span></div>`;
    } else body += `<div class="kf"><span class="txt err">No agent to send to</span></div>`;
    const nr = P.rules.filter(r => r.at === s.id && !r.inside).length;
    if (nr) badge += `<span class="badge fw">${ic('i-firewall')}${nr} rule${nr > 1 ? 's' : ''}</span>`;
    if (!x.agent && x.mbps) badge += `<span class="badge ld">${loadTxt(x.mbps)}${(s.count || 1) > 1 ? ' each' : ''}</span>`;
  } else if (s.kind === 'cloud') {
    const pv = PROV[s.provider]; const fc = F.clouds[s.provider];
    style += `;--pv:${pv.color}`;
    const regions = s.regions ? s.regions.split(',').map(r => r.trim()).filter(Boolean).length : 0;
    head = `<span class="kic pvt">${esc(pv.short)}</span><div class="nt"><b>${esc(s.name)}</b><small>${plural(s.accounts, pv.unit)}${regions ? ' · ' + plural(regions, 'region') : ''}</small></div>`;
    body += `<div class="pipe"><span title="${esc(fc.pipeline[0])}">${ic('i-log')}${s.feats.flow ? 'Flow logs' : 'Metadata'}</span><span class="ar">→</span><span title="${esc(fc.pipeline[1])}">${ic('i-bucket')}${esc(s.provider === 'gcp' ? 'Pub/Sub' : s.provider === 'azure' ? 'Storage' : 'Bucket')}</span><span class="ar">→</span><span title="${esc(fc.pipeline[2])}">${ic('i-key')}Role</span></div>`;
    body += `<div class="kf">${ic('i-cloud')}<span class="txt"><b>No agent.</b> Kentik reads the logs</span></div>`;
  } else {
    head = `<span class="kic">${ic(k.icon)}</span><div class="nt"><b>${esc(s.name)}</b><small>Tested by synthetic agents</small></div>`;
    body += `<div class="apps">${s.apps.map(a => `<span>${esc(a)}</span>`).join('') || '<span>No apps yet</span>'}</div>`;
  }
  return `<div class="${cls.join(' ')}" data-id="${s.id}" style="${style}"><div class="nh">${head}</div>${body}${badge}${VIEW_ONLY ? '' : `<span class="lh" data-id="${s.id}" title="Drag to another site to draw a link">${ic('i-link')}</span>`}</div>`;
}
function kentikHTML() {
  const reg = F.regions[D.meta.region] || F.regions.US;
  const cls = 'node kentik' + (sel && sel.t === 'kentik' ? ' sel' : '');
  return `<div class="${cls}" data-id="kentik" style="left:${D.kentik.x}px;top:${D.kentik.y}px;width:${KENTIK.w}px;height:${KENTIK.h}px"><div class="nh"><span class="kic"><svg class="ic" viewBox="0 0 15.924 15.924"><use href="#i-ib"/></svg></span><div class="nt"><b>Kentik SaaS</b><small>${esc(D.meta.region)} cluster · ${esc(reg.label.replace(/^.*\(|\)$/g, ''))}</small></div></div><div class="kx">${P.totals.agents ? `<b>${plural(P.totals.agents, 'agent')}</b> connect out on HTTPS 443` : 'Your Kentik account'}</div></div>`;
}
function renderNodes() {
  $('#nh').innerHTML = kentikHTML() + D.sites.map(nodeHTML).join('');
}

function chainPts(chain) {
  const B = chain.map(box); const C = B.map(ctr);
  const pts = [edgePt(B[0], C[1])];
  for (let i = 1; i < chain.length - 1; i++) pts.push(C[i]);
  pts.push(edgePt(B[B.length - 1], C[C.length - 2]));
  return pts;
}
function offsetPts(pts, off) {
  if (!off) return pts;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    return Math.abs(b.y - a.y) >= Math.abs(b.x - a.x) ? { x: p.x + off, y: p.y } : { x: p.x, y: p.y + off };
  });
}
function curveD(pts, arc) {
  const f = v => Math.round(v * 10) / 10;
  if (arc) {
    const [a, b] = [pts[0], pts[pts.length - 1]]; const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1;
    const bend = Math.min(160, L * 0.2) * arc; const mx = (a.x + b.x) / 2 - dy / L * bend, my = (a.y + b.y) / 2 + dx / L * bend;
    return { d: `M${f(a.x)},${f(a.y)} Q${f(mx)},${f(my)} ${f(b.x)},${f(b.y)}`, len: L * 1.08 };
  }
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`; let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]; const dx = b.x - a.x, dy = b.y - a.y; len += Math.hypot(dx, dy);
    if (Math.abs(dy) >= Math.abs(dx)) { const my = (a.y + b.y) / 2; d += ` C${f(a.x)},${f(my)} ${f(b.x)},${f(my)} ${f(b.x)},${f(b.y)}`; }
    else { const mx = (a.x + b.x) / 2; d += ` C${f(mx)},${f(a.y)} ${f(mx)},${f(b.y)} ${f(b.x)},${f(b.y)}`; }
  }
  return { d, len };
}
function visible(p) {
  if (lens === 'all' || lens === 'firewall') return p.base || !p.trunk;
  if (lens === 'load') return !!p.feed;
  return LENS[lens].types.includes(p.t);
}
const particles = () => motion && !dragging && !['all', 'firewall', 'load'].includes(lens);
function focusKey() { return hover || (sel && sel.t === 'site' ? sel.id : null); }
function pathSVG(p) {
  const off = (lens === 'all' || lens === 'firewall' || lens === 'load') && !p.arc ? (LANE.indexOf(p.t) - 4) * 2.6 : 0;
  const { d, len } = curveD(offsetPts(chainPts(p.chain), off), p.arc);
  const faint = lens === 'firewall' || lens === 'load';
  let s = `<g class="tg" data-touch="${p.touch.join(' ')}" data-via="${p.via.join(' ')}"><path id="${p.id}" class="tp t-${p.t}${p.dash ? ' dash' : ''}${faint ? ' faint' : ''}" d="${d}"/>`;
  if (particles()) {
    const n = clamp(Math.round(len / 150), 1, 5); const dur = clamp(len / 85, 1.8, 12);
    for (let i = 0; i < n; i++) {
      const rev = p.both ? i % 2 === 1 : p.rev;
      s += `<circle class="pt t-${p.t}" r="3.4"><animateMotion dur="${dur.toFixed(2)}s" begin="${(-dur * i / n).toFixed(2)}s" repeatCount="indefinite"${rev ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}><mpath href="#${p.id}" xlink:href="#${p.id}"/></animateMotion></circle>`;
    }
  }
  return s + '</g>';
}
function linkGeom(l) {
  const A = box(l.a), B = box(l.b);
  const p1 = edgePt(A, ctr(B), 2), p2 = edgePt(B, ctr(A), 2);
  return { p1, p2, m: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
}
function linkLabel(l) {
  const e = P.linkLoad[l.id];
  const each = e && e.each ? ' each' : (byId(l.a).count > 1 || byId(l.b).count > 1 ? ' each' : '');
  if (lens === 'load') {
    if (!e) return { text: `${LINKK[l.kind].short} · no telemetry`, u: -1 };
    const u = e.mbps / l.mbps;
    return { text: `${loadTxt(e.mbps)} of ${mbpsTxt(l.mbps)}${each} · ${u < 0.01 ? '<1' : Math.round(u * 100)}%`, u };
  }
  return { text: `${LINKK[l.kind].short} · ${mbpsTxt(l.mbps)}${each}`, u: -1 };
}
const uClass = u => u < 0 ? '' : u < 0.05 ? 'u0' : u < 0.15 ? 'u1' : 'u2';
function renderEdges() {
  const bb = worldBox(); const m = 600;
  const x0 = Math.floor(bb.x - m), y0 = Math.floor(bb.y - m), w = Math.ceil(bb.w + 2 * m), h = Math.ceil(bb.h + 2 * m);
  let links = '', labels = '', hits = '';
  const placed = [];  // label boxes already drawn, so labels on nearby links do not overlap
  D.links.forEach(l => {
    const { p1, p2 } = linkGeom(l); const lab = linkLabel(l); const uc = lens === 'load' ? uClass(lab.u) : '';
    const lw = lab.text.length * 6.1 + 14;
    let mid = null;
    for (const t of [0.5, 0.36, 0.64, 0.26, 0.74]) {
      const c = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
      if (!placed.some(b => Math.abs(b.x - c.x) < (b.w + lw) / 2 + 4 && Math.abs(b.y - c.y) < 22)) { mid = c; break; }
    }
    mid = mid || { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    placed.push({ x: mid.x, y: mid.y, w: lw });
    const sw = lens === 'load' && lab.u > 0 ? clamp(2 + lab.u * 30, 2.5, 9) : null;
    const isSel = sel && sel.t === 'link' && sel.id === l.id;
    links += `<path class="lk ${l.kind} ${uc}${isSel ? ' sel' : ''}" d="M${r1(p1.x)},${r1(p1.y)} L${r1(p2.x)},${r1(p2.y)}"${sw ? ` style="stroke-width:${sw}"` : ''}/>`;
    const tw = lab.text.length * 6.1 + 14;
    labels += `<g class="ll ${uc}" transform="translate(${r1(mid.x)},${r1(mid.y)})"><rect x="${-tw / 2}" y="-10" width="${tw}" height="20" rx="10"/><text text-anchor="middle" y="4">${esc(lab.text)}</text></g>`;
    hits += `<path class="hit" data-link="${l.id}" d="M${r1(p1.x)},${r1(p1.y)} L${r1(p2.x)},${r1(p2.y)}"/>`;
  });
  const tps = P.paths.filter(visible);
  let tlabels = '';
  tps.forEach(p => {
    if (!p.label || lens === 'all' || lens === 'firewall' || lens === 'load') return;
    const pts = chainPts(p.chain); const a = pts[0], b = pts[pts.length - 1];
    tlabels += `<g class="tl"><text class="t-${p.t}" x="${r1(a.x + (b.x - a.x) * 0.5)}" y="${r1(a.y + (b.y - a.y) * 0.5 - 6)}" text-anchor="middle">${esc(p.label)}</text></g>`;
  });
  const html = `<svg class="edges" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="left:${x0}px;top:${y0}px;width:${w}px;height:${h}px" viewBox="${x0} ${y0} ${w} ${h}">`
    + `<g>${links}</g><g>${tps.map(pathSVG).join('')}</g><g>${labels}${tlabels}</g><g>${VIEW_ONLY ? hits : hits}</g><path class="tmp" id="tmpLine" d=""/></svg>`;
  $('#eh').innerHTML = html;
  applyFocus();
}
function applyFocus() {
  const svg = $('#eh svg'); if (!svg) return;
  const f = focusKey(); const lk = sel && sel.t === 'link' ? sel.id : null;
  svg.classList.toggle('focus', !!(f || lk));
  $$('.tg', svg).forEach(g => {
    const on = f ? g.dataset.touch.split(' ').includes(f) : lk ? g.dataset.via.split(' ').includes(lk) : false;
    g.classList.toggle('hl', on);
  });
}
function renderLensUI() {
  stage.dataset.lens = lens;
  const L = LENS[lens];
  const dot = t => `var(--t-${t})`;
  $('#lensbar').innerHTML = LENSES.map(l => {
    const c = l.types && l.types.length ? `<span class="dot" style="background:${dot(l.types[0])}"></span>` : '';
    return `<button type="button" data-lens="${l.id}" aria-pressed="${l.id === lens}" title="${esc(l.title)} (key ${l.key})">${c}${esc(l.label)}</button>`;
  }).join('') + `<span class="sep"></span><button type="button" data-motion aria-pressed="${motion}" title="Moving dots (key M)">${ic(motion ? 'i-pause' : 'i-play')}Motion</button>`;
  let keys = '';
  if (lens === 'all') keys = ['https', 'flow', 'snmp', 'trap', 'syslog', 'dns', 'synth', 'cloud'].map(t => `<span><i style="background:${dot(t)}"></i>${esc(TYPES[t])}</span>`).join('');
  else if (L.types && L.types.length) keys = L.types.map(t => `<span><i style="background:${dot(t)}"></i>${esc(TYPES[t])}</span>`).join('');
  const cap = $('#caption'); cap.classList.toggle('mini', captionMini);
  cap.innerHTML = `<b>${L.types && L.types.length ? `<span class="sw" style="background:${dot(L.types[0])}"></span>` : ''}${esc(L.title)}</b><span class="ct">${esc(L.text)}</span>${keys ? `<div class="keys">${keys}</div>` : ''}<button type="button" class="cx" data-cap-toggle title="${captionMini ? 'Show the explanation' : 'Hide the explanation'}" aria-label="${captionMini ? 'Show the explanation' : 'Hide the explanation'}">${ic(captionMini ? 'i-plus' : 'i-minus')}</button>`;
}
let captionMini = !!lsGet('ibk-canvas-caption-mini');
function renderStatus() {
  const t = P.totals; const cks = P.checks;
  const nErr = cks.filter(c => c.sev === 'error').length, nWarn = cks.filter(c => c.sev === 'warn').length;
  $('#status').innerHTML = `<b>${plural(t.sites, 'site')}</b> · ${plural(t.agents, 'agent')} · ${fmt(t.cpu)} vCPU / ${fmt(t.ram)} GB · ${plural(t.rules, 'firewall rule')}${nErr ? ` · <b style="color:var(--err)">${plural(nErr, 'problem')}</b>` : ''}${nWarn ? ` · ${plural(nWarn, 'warning')}` : ''}`;
  const nc = $('#nChecks'); nc.textContent = cks.length || ''; nc.className = 'n' + (nErr ? ' err' : nWarn ? ' warn' : '');
  $('#nRules').textContent = t.rules || '';
  $('#empty').hidden = D.sites.length > 0;
  $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length;
  const ci = $('#custName'); if (document.activeElement !== ci) ci.value = D.meta.customer || '';
  document.title = `${D.meta.customer || 'Customer'} · Kentik Network Canvas`;
}
function refresh(o = {}) {
  P = derive();
  P.checks = checks();
  if (sel && ((sel.t === 'site' && !byId(sel.id)) || (sel.t === 'link' && !linkById(sel.id)))) sel = null;
  renderNodes(); renderEdges(); renderLensUI(); renderStatus();
  if (o.panel !== false) renderPanel();
}

/* ---------- editing ---------- */
function commit() {
  const now = JSON.stringify(D);
  if (now !== lastSnap) { undoStack.push(lastSnap); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; lastSnap = now; }
  if (!VIEW_ONLY) lsSet(STORE, D);
}
function undo() { if (!undoStack.length) return; redoStack.push(lastSnap); lastSnap = undoStack.pop(); D = JSON.parse(lastSnap); lsSet(STORE, D); refresh(); toast('Undone'); }
function redo() { if (!redoStack.length) return; undoStack.push(lastSnap); lastSnap = redoStack.pop(); D = JSON.parse(lastSnap); lsSet(STORE, D); refresh(); toast('Redone'); }
function overlaps(x, y, w, h) {
  return D.sites.concat([{ id: 'kentik' }]).some(s => { const b = box(s.id); return x < b.x + b.w + 28 && x + w + 28 > b.x && y < b.y + b.h + 28 && y + h + 28 > b.y; });
}
function freeSpot(kind, near) {
  const k = KIND[kind]; const r = stage.getBoundingClientRect();
  const c = near || { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k };
  for (let ring = 0; ring < 30; ring++) {
    const steps = Math.max(1, ring * 8);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2; const x = Math.round((c.x - k.w / 2 + Math.cos(a) * ring * 60) / 2) * 2, y = Math.round((c.y - k.h / 2 + Math.sin(a) * ring * 48) / 2) * 2;
      if (!overlaps(x, y, k.w, k.h)) return { x, y };
    }
  }
  return { x: c.x, y: c.y };
}
function nearestHub(s, kinds = ['dc', 'campus']) {
  const c = ctr(box(s.id)); let best = null, bd = Infinity;
  D.sites.filter(o => o !== s && kinds.includes(o.kind)).forEach(o => { const oc = ctr(box(o.id)); const dd = Math.hypot(oc.x - c.x, oc.y - c.y); if (dd < bd) { bd = dd; best = o; } });
  return best;
}
function addSite(what, at) {
  let s;
  if (PROV[what]) s = makeSite(D, 'cloud', { provider: what });
  else if (what === 'group') s = makeSite(D, 'branch', { count: 25, name: `Branch group ${D.sites.filter(x => x.kind === 'branch' && x.count > 1).length + 1}` });
  else s = makeSite(D, what);
  let near = at || null;
  const hub = D.sites.length ? (s.kind === 'branch' || s.kind === 'cloud' || s.kind === 'campus' ? nearestHubTo(near) : null) : null;
  if (!near && hub && s.kind !== 'saas') { const hb = ctr(box(hub.id)); near = { x: hb.x + (s.kind === 'cloud' ? 330 : 0), y: hb.y + (s.kind === 'cloud' ? 0 : 230) }; }
  if (!near && s.kind === 'saas') { const kb = ctr(box('kentik')); near = { x: kb.x - 360, y: kb.y + 10 }; }
  const p = freeSpot(s.kind, near); s.x = p.x; s.y = p.y;
  D.sites.push(s);
  let msg = `Added ${s.name}`;
  const linkTo = s.kind === 'saas' ? null : nearestHub(s, s.kind === 'cloud' ? ['dc'] : ['dc', 'campus']) || (s.kind !== 'cloud' ? nearestHub(s, ['dc', 'campus', 'branch']) : null);
  if (linkTo && linkTo !== s) {
    const kind = s.kind === 'cloud' ? 'cloud' : (s.kind === 'dc' && linkTo.kind === 'dc') ? 'dci' : 'wan';
    D.links.push({ id: uid('l'), a: s.id, b: linkTo.id, kind, mbps: s.kind === 'branch' ? (s.count > 1 ? 20 : 50) : LINKK[kind].mbps });
    msg += `, linked to ${linkTo.name}. Delete the link if it is wrong.`;
  }
  sel = { t: 'site', id: s.id }; tab = 'inspect';
  commit(); refresh(); syncTabs(); toast(msg);
  ensureVisible(s.id);
}
function nearestHubTo(pt) {
  const hubs = D.sites.filter(o => o.kind === 'dc' || o.kind === 'campus');
  if (!hubs.length) return null;
  if (!pt) return sel && sel.t === 'site' && byId(sel.id) && (byId(sel.id).kind === 'dc' || byId(sel.id).kind === 'campus') ? byId(sel.id) : hubs[0];
  let best = null, bd = Infinity; hubs.forEach(o => { const oc = ctr(box(o.id)); const dd = Math.hypot(oc.x - pt.x, oc.y - pt.y); if (dd < bd) { bd = dd; best = o; } });
  return best;
}
function ensureVisible(id) {
  const b = box(id); const r = stage.getBoundingClientRect();
  const sx = b.x * view.k + view.x, sy = b.y * view.k + view.y;
  if (sx < 20 || sy < 80 || sx + b.w * view.k > r.width - 20 || sy + b.h * view.k > r.height - 70) fit();
}
function addLink(a, b) {
  if (a === b || a === 'kentik' || b === 'kentik') return;
  if (D.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) { toast('These sites are already linked'); return; }
  const A = byId(a), B = byId(b);
  const kind = (A.kind === 'cloud' || B.kind === 'cloud') ? 'cloud' : (A.kind === 'dc' && B.kind === 'dc') ? 'dci' : 'wan';
  const mbps = (A.kind === 'branch' || B.kind === 'branch') ? ((A.count > 1 || B.count > 1) ? 20 : 50) : LINKK[kind].mbps;
  const l = { id: uid('l'), a, b, kind, mbps };
  D.links.push(l); sel = { t: 'link', id: l.id }; tab = 'inspect';
  commit(); refresh(); syncTabs(); toast(`Linked ${A.name} and ${B.name}`);
}
function deleteSel() {
  if (!sel || VIEW_ONLY) return;
  if (sel.t === 'site') {
    const s = byId(sel.id); if (!s) return;
    D.sites = D.sites.filter(x => x.id !== s.id);
    D.links = D.links.filter(l => l.a !== s.id && l.b !== s.id);
    D.sites.forEach(x => { if (x.sendTo === s.id) x.sendTo = ''; });
    toast(`Deleted ${s.name}. Press Ctrl+Z or Cmd+Z to undo.`);
  } else if (sel.t === 'link') {
    D.links = D.links.filter(l => l.id !== sel.id); toast('Deleted the link');
  } else return;
  sel = null; commit(); refresh();
}
function duplicateSel() {
  if (!sel || sel.t !== 'site' || VIEW_ONLY) return;
  const s = byId(sel.id); const c = JSON.parse(JSON.stringify(s));
  c.id = uid('s'); c.name = s.name + ' copy';
  const p = freeSpot(s.kind, { x: s.x + KIND[s.kind].w / 2 + 40, y: s.y + KIND[s.kind].h / 2 + 40 }); c.x = p.x; c.y = p.y;
  D.sites.push(c);
  D.links.filter(l => l.a === s.id || l.b === s.id).forEach(l => D.links.push({ ...l, id: uid('l'), a: l.a === s.id ? c.id : l.a, b: l.b === s.id ? c.id : l.b }));
  sel = { t: 'site', id: c.id }; commit(); refresh(); toast(`Duplicated ${s.name} with its links`);
}

/* ---------- auto layout ---------- */
// Put hubs that are linked to each other side by side: start at a hub with few hub links, then walk to linked hubs.
function orderHubs(hubs) {
  const ids = new Set(hubs.map(h => h.id));
  const nb = new Map(hubs.map(h => [h.id, []]));
  D.links.forEach(l => { if (ids.has(l.a) && ids.has(l.b)) { nb.get(l.a).push(l.b); nb.get(l.b).push(l.a); } });
  const out = []; const seen = new Set();
  while (out.length < hubs.length) {
    const rest = hubs.filter(h => !seen.has(h.id));
    let cur = rest.slice().sort((a, b) => nb.get(a.id).filter(i => !seen.has(i)).length - nb.get(b.id).filter(i => !seen.has(i)).length || (a.kind === 'dc' ? 1 : 0) - (b.kind === 'dc' ? 1 : 0))[0];
    while (cur) {
      seen.add(cur.id); out.push(cur);
      const next = nb.get(cur.id).filter(i => !seen.has(i)).map(i => hubs.find(h => h.id === i)).sort((a, b) => nb.get(a.id).length - nb.get(b.id).length)[0];
      cur = next || null;
    }
  }
  return out;
}
function autoLayout() {
  const p = derive();
  const hubs = orderHubs(D.sites.filter(s => s.kind === 'dc' || s.kind === 'campus'));
  const branches = D.sites.filter(s => s.kind === 'branch');
  const clouds = D.sites.filter(s => s.kind === 'cloud'), saas = D.sites.filter(s => s.kind === 'saas');
  const under = new Map(hubs.map(h => [h.id, []])); const loose = [];
  const linkedHub = b => { for (const l of D.links) { const o = l.a === b.id ? l.b : l.b === b.id ? l.a : null; if (o && under.has(o)) return o; } return null; };
  branches.forEach(b => { const x = p.st[b.id]; const t = x.agent ? linkedHub(b) : (x.target && under.has(x.target) && !x.noPath ? x.target : linkedHub(b)); if (t) under.get(t).push(b); else loose.push(b); });
  const BW = KIND.branch.w, BH = KIND.branch.h, HW = KIND.dc.w, HH = KIND.dc.h, G = 70, BG = 34;
  const cols = []; let x = 0;
  const colOf = (h, list) => { const nc = list.length > 4 ? 3 : list.length > 1 ? 2 : 1; const cw = Math.max(h ? HW : 0, nc * BW + (nc - 1) * BG); cols.push({ h, list, nc, cw, x }); x += cw + G; };
  hubs.forEach(h => colOf(h, under.get(h.id)));
  if (loose.length) colOf(null, loose);
  const total = Math.max(0, x - G); const x0 = -total / 2;
  const Y1 = 210, YB = Y1 + HH + 100;
  cols.forEach(c => {
    const cx = x0 + c.x;
    if (c.h) { c.h.x = Math.round(cx + (c.cw - HW) / 2); c.h.y = Y1; }
    const bw = c.nc * BW + (c.nc - 1) * BG;
    c.list.forEach((b, i) => { b.x = Math.round(cx + (c.cw - bw) / 2 + (i % c.nc) * (BW + BG)); b.y = (c.h ? YB : Y1) + Math.floor(i / c.nc) * (BH + 44); });
  });
  D.kentik = { x: -KENTIK.w / 2, y: 0 };
  const right = Math.max(total / 2, KENTIK.w / 2 + 120) + 80;
  clouds.forEach((c, i) => { c.x = Math.round(right); c.y = (clouds.length > 2 ? -10 : 30) + i * (KIND.cloud.h + 30); });
  saas.forEach((s, i) => { s.x = Math.round(-KENTIK.w / 2 - 90 - KIND.saas.w - i * (KIND.saas.w + 30)); s.y = -4; });
}

/* ---------- interaction on the canvas ---------- */
let rafEdges = 0;
function scheduleEdges() { if (rafEdges) return; rafEdges = requestAnimationFrame(() => { rafEdges = 0; renderEdges(); }); }
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.float') || e.target.closest('.empty .row')) return;
  const h = e.target.closest('.lh'), n = e.target.closest('.node'), l = e.target.closest('[data-link]');
  stage.setPointerCapture(e.pointerId);
  if (h && !VIEW_ONLY) { drag = { mode: 'link', from: h.dataset.id }; dragging = true; return; }
  if (n && !VIEW_ONLY) { const id = n.dataset.id; const o = id === 'kentik' ? D.kentik : byId(id); drag = { mode: 'node', id, o, el: n, ox: o.x, oy: o.y, sx: e.clientX, sy: e.clientY, moved: false }; return; }
  if (n) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, click: n.dataset.id }; return; }
  if (l) { drag = { mode: 'clickLink', id: l.dataset.link, sx: e.clientX, sy: e.clientY }; return; }
  drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
});
stage.addEventListener('pointermove', e => {
  if (!drag) {
    const n = e.target.closest && e.target.closest('.node');
    const id = n && n.dataset.id !== 'kentik' ? n.dataset.id : null;
    if (id !== hover) { hover = id; applyFocus(); }
    return;
  }
  const dx = e.clientX - (drag.sx || 0), dy = e.clientY - (drag.sy || 0);
  if (drag.mode === 'node') {
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; dragging = true; stage.classList.add('dragging'); }
    drag.o.x = Math.round((drag.ox + dx / view.k) / 2) * 2; drag.o.y = Math.round((drag.oy + dy / view.k) / 2) * 2;
    drag.el.style.left = drag.o.x + 'px'; drag.el.style.top = drag.o.y + 'px';
    scheduleEdges();
  } else if (drag.mode === 'pan') {
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; stage.classList.add('panning');
    view.x = drag.vx + dx; view.y = drag.vy + dy; applyView();
  } else if (drag.mode === 'link') {
    const a = ctr(box(drag.from)); const w = toWorld(e);
    const t = $('#tmpLine'); if (t) t.setAttribute('d', `M${a.x},${a.y} L${w.x},${w.y}`);
  }
});
stage.addEventListener('pointerup', e => {
  const d = drag; drag = null; stage.classList.remove('panning');
  if (!d) return;
  if (d.mode === 'node') {
    dragging = false; stage.classList.remove('dragging');
    if (d.moved) { commit(); refresh({ panel: false }); }
    else { select(d.id === 'kentik' ? { t: 'kentik', id: 'kentik' } : { t: 'site', id: d.id }); }
  } else if (d.mode === 'link') {
    dragging = false;
    const el = document.elementFromPoint(e.clientX, e.clientY); const n = el && el.closest('.node');
    const t = $('#tmpLine'); if (t) t.setAttribute('d', '');
    if (n && n.dataset.id !== d.from && n.dataset.id !== 'kentik') addLink(d.from, n.dataset.id);
    else renderEdges();
  } else if (d.mode === 'clickLink') select({ t: 'link', id: d.id });
  else if (d.mode === 'pan' && !d.moved) {
    if (d.click) select(d.click === 'kentik' ? { t: 'kentik', id: 'kentik' } : { t: 'site', id: d.click });
    else select(null);
  }
});
stage.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; applyFocus(); } });
stage.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0065), e.clientX, e.clientY);
  else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
}, { passive: false });
stage.addEventListener('dblclick', e => {
  if (VIEW_ONLY || e.target.closest('.node') || e.target.closest('.float')) return;
  addSite('branch', toWorld(e));
});
function select(s) {
  sel = s; hover = null; tab = 'inspect'; syncTabs();
  renderNodes(); renderEdges(); renderPanel();
}

/* ---------- panel ---------- */
const pane = $('#pane');
function syncTabs() { $$('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab))); }
const seg = (f, val, opts, obj = 'site') => `<div class="seg">${opts.map(([v, label, title]) => `<button type="button" data-act="seg" data-obj="${obj}" data-f="${f}" data-v="${esc(v)}" aria-pressed="${String(v) === String(val)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`).join('')}</div>`;
const stepper = (f, val, obj = 'site', min = 0) => `<div class="stepper"><button type="button" data-act="step" data-obj="${obj}" data-f="${f}" data-d="-1" aria-label="Fewer">−</button><input type="number" min="${min}" data-obj="${obj}" data-f="${f}" data-num value="${val}" aria-label="${esc(f)}"><button type="button" data-act="step" data-obj="${obj}" data-f="${f}" data-d="1" aria-label="More">+</button></div>`;
const text = (f, val, obj = 'site', ph = '') => `<input class="inp" type="text" data-obj="${obj}" data-f="${f}" value="${esc(val)}" placeholder="${esc(ph)}">`;
const num = (f, val, obj = 'site') => `<input class="inp" type="number" min="0" data-obj="${obj}" data-f="${f}" data-num value="${val}">`;
const row = (label, ctl) => `<div class="row"><span class="lbl">${label}</span><div class="ctl">${ctl}</div></div>`;
const kbLinks = keys => `<ul class="srcs">${[...new Set(keys)].map(k => F.kb[k] ? `<li><a href="${esc(F.kb[k].url)}" target="_blank" rel="noopener">${esc(F.kb[k].title)}</a></li>` : '').join('')}</ul>`;
function objFor(o) { return o === 'meta' ? D.meta : o === 'kentik' ? D.kentik : o === 'link' ? linkById(sel.id) : byId(sel.id); }
function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); o[ks[ks.length - 1]] = v; }
function getPath(obj, path) { return path.split('.').reduce((o, k) => o == null ? o : o[k], obj); }

function rulesTable(rules, showWhere) {
  if (!rules.length) return '<p class="note">No rules.</p>';
  return rules.map(r => `<div class="rule"><span class="tdot" style="background:var(--t-${r.t})"></span><div><b>${esc(r.port)}</b> · ${esc(r.why)}<div class="ft">${esc(r.src)} <i>→</i> ${esc(r.dst)}</div>${showWhere ? `<div class="ft">${esc(r.where)}</div>` : ''}</div></div>`).join('');
}
function installSteps(s, caps) {
  const capList = CAP_T.concat(['bgp']).filter(c => caps[c]).map(c => capName(c, s.flowMode)).join(', ');
  return F.installSteps.map(t => t.replace('{method}', s.install === 'docker' ? 'Docker' : 'Linux').replace('{hostname_note}', s.install === 'docker' ? 'Docker container ID' : 'server host name').replace('{site}', s.name).replace('{caps}', capList || 'none yet'));
}
function siteInspector(s) {
  const k = KIND[s.kind]; const x = P.st[s.id]; let h = '';
  h += `<p class="eyebrow">${esc(k.label)}${(s.count || 1) > 1 ? ' group' : ''}</p>`;
  h += `<div class="ph"><span class="kic" style="--kcol:var(--k-${s.kind});--kfill:var(--k-${s.kind}-fill);background:var(--kfill);color:var(--kcol)">${ic(k.icon)}</span><input class="title" type="text" data-obj="site" data-f="name" value="${esc(s.name)}" aria-label="Site name"><div class="acts edit-only"><button type="button" class="tbtn icon-only" data-act="dup" title="Duplicate (Ctrl+D or Cmd+D)" aria-label="Duplicate">${ic('i-copy')}</button><button type="button" class="tbtn icon-only" data-act="del" title="Delete (Delete key)" aria-label="Delete">${ic('i-trash')}</button></div></div>`;
  h += row('Kind', seg('kind', s.kind, [['dc', 'Data center'], ['campus', 'Campus'], ['branch', 'Branch']]));
  h += row('Location', text('location', s.location, 'site', 'City, country'));
  h += row('Sites like this', stepper('count', s.count || 1, 'site', 1));
  h += `<p class="hint">One card can stand for many similar sites, such as 120 stores. Load, rules and agent counts multiply.</p>`;
  h += `<div class="sec"><h3>Network devices${(s.count || 1) > 1 ? ' <span class="r">per site</span>' : ''}</h3><div class="devgrid">${DEV.map(d => `<span class="dl">${ic(d.icon)}${esc(d.label)}</span>${stepper('dev.' + d.id, s.dev[d.id] || 0)}`).join('')}</div></div>`;
  h += `<div class="sec"><h3>Kentik at this site</h3>`;
  h += row('Universal Agent', seg('agent', s.agent, [['auto', `Auto (${isAgent({ ...s, agent: 'auto' }) ? 'yes' : 'no'})`, 'Data centers and campuses get an agent; branches send to one'], ['on', 'Agent here'], ['off', 'No agent']]));
  if (x.agent) {
    h += row('Install on', seg('install', s.install, [['linux', 'Linux host'], ['docker', 'Docker']]));
    h += `<div class="row"><span class="lbl">Capabilities</span><div class="ctl note">${s.caps ? 'Set by hand. <button type="button" class="linkbtn edit-only" data-act="capsAuto">Back to defaults</button>' : 'Defaults for this kind of site.'}</div></div>`;
    h += `<div class="caps">${CAP_T.map(c => { const cap = F.caps[c]; return `<label class="cap" title="${esc(cap.purpose)}"><span class="cdot" style="background:var(--t-${c})"></span><span class="cn"><b>${esc(c === 'flow' ? 'Flow Proxy' : cap.name)}</b><small>${esc(cap.short)}</small></span><span class="pl">${esc(cap.portLabel)}</span><span class="sw"><input type="checkbox" data-cap="${c}"${x.caps[c] ? ' checked' : ''}><span></span></span></label>`; }).join('')}</div>`;
    if (x.caps.flow) h += `<div class="row" style="margin-top:10px"><span class="lbl">Flow Proxy mode</span><div class="ctl">${seg('flowMode', s.flowMode, [['forward', 'Forwarding', 'Sends raw flow to Kentik SaaS to decode. Light.'], ['edge', 'Edge Processing', 'Decodes on the agent. Needs a large host.']])}</div></div>`;
    h += row('BGP', seg('bgp', s.bgp, [['off', 'Off'], ['direct', 'Routers to Kentik'], ['proxy', 'Through the agent', 'BGP Proxy capability']]));
    const z = x.size;
    h += `<div class="size"><div class="note">Plan ${(s.count || 1) > 1 ? 'each agent host' : 'this agent host'} with</div><div class="big">${z.recCpu} vCPU · ${z.recRam} GB RAM<small>incl. ${Math.round(F.headroom * 100)}% headroom</small></div>`;
    h += `<table class="tbl"><tbody>${z.rows.map(r => `<tr><td>${esc(r.label)}<div class="note">${esc(r.qty)}</div></td><td class="num">${esc(r.res)}</td></tr>`).join('')}</tbody></table>`;
    if (x.feeds.length) h += `<div class="note">Includes ${x.feeds.map(fid => { const f = byId(fid); return `<button type="button" class="linkbtn" data-act="sel" data-id="${f.id}">${esc(f.name)}</button>${f.count > 1 ? ` (×${fmt(f.count)})` : ''}`; }).join(', ')}, which send${x.feeds.length === 1 && byId(x.feeds[0]).count === 1 ? 's' : ''} here.</div>`;
    h += `</div>`;
    h += `<details class="more"><summary>Load at this site (optional)</summary><div>${row('Flows per second', num('fps', s.fps))}${row('Syslog events/s', num('eps', s.eps))}${x.caps.dns ? row('DNS lookups/s', num('dnsLps', s.dnsLps)) : ''}<p class="hint">Leave the defaults if you do not know. Sizing then uses the KB baseline.</p></div></details>`;
  } else {
    const agents = P.agents;
    h += row('Sends to', `<select class="inp" data-obj="site" data-f="sendTo"><option value="">Nearest agent (auto)</option>${agents.map(a => `<option value="${a.id}"${s.sendTo === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`);
    if (x.target) {
      const T = byId(x.target);
      if (x.noPath) h += `<p class="hint" style="color:var(--err)">No link joins ${esc(s.name)} and ${esc(T.name)}. Draw one: drag from the link handle on the card's right edge.</p>`;
      else h += `<p class="hint">Path: ${x.route.map(id => esc(byId(id).name)).join(' → ')}. Its routers, switches and firewalls send flow, traps and syslog across the WAN to the ${esc(T.name)} agent, which also polls them.</p>`;
      h += `<div class="size"><div class="note">Telemetry across the WAN${(s.count || 1) > 1 ? ', per site' : ''}</div><div class="big">≈ ${loadTxt(x.mbps)}${(s.count || 1) > 1 ? `<small>${loadTxt(x.mbpsAll)} for all ${fmt(s.count)}</small>` : ''}</div><div class="note">Rough planning number: ${EST.flowBytes} bytes per flow record, ${EST.syslogBytes} bytes per syslog event, ${fmt(EST.snmpBps)} bit/s of SNMP per device. Not a Kentik KB figure.</div></div>`;
    }
    h += row('BGP', seg('bgp', s.bgp === 'proxy' ? 'off' : s.bgp, [['off', 'Off'], ['direct', 'Routers to Kentik']]));
    h += `<details class="more"><summary>Load at this site (optional)</summary><div>${row('Flows per second', num('fps', s.fps))}${row('Syslog events/s', num('eps', s.eps))}<p class="hint">Per site. It sizes the receiving agent and the WAN estimate.</p></div></details>`;
  }
  h += `</div>`;
  const rules = P.rules.filter(r => r.at === s.id && !r.inside);
  h += `<div class="sec"><h3>${ic('i-firewall')}Firewall rules here <span class="r">${rules.length}</span></h3>${rulesTable(rules)}</div>`;
  if (x.agent) {
    h += `<details class="more"><summary>Install the agent (${s.install === 'docker' ? 'Docker' : 'Linux'})</summary><div><ol class="steps">${installSteps(s, x.caps).map(t => `<li>${esc(t)}</li>`).join('')}</ol><p class="note">${esc(F.proxy[s.install])}</p><p class="note">Supported: ${esc(F.os.supported.join('; '))}. ${esc(F.os.unsupported)}</p></div></details>`;
    h += `<details class="more"><summary>What each capability needs</summary><div>${CAP_T.concat(['bgp']).filter(c => x.caps[c]).map(c => `<p><b>${esc(capName(c, s.flowMode))}.</b> ${esc(F.caps[c].purpose)}</p><ol class="steps">${F.caps[c].setup.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`).join('')}<p class="note">Sources:</p>${kbLinks(CAP_T.concat(['bgp']).filter(c => x.caps[c]).flatMap(c => F.caps[c].kb).concat(['ua-deployment']))}</div></details>`;
  }
  return h;
}
function cloudSteps(s) {
  const p = s.provider;
  if (p === 'aws') return F.aws.steps.map(t => t.replace('{fw}', s.feats.firewall ? ' and Network Firewall' : ''));
  if (p === 'azure') return F.azure.steps.map(t => t.replace('{fw}', s.feats.firewall ? 'Send Azure Firewall diagnostic logs to the same storage account.' : '').replace('{auth}', F.azure.auth.enterprise)).filter(Boolean);
  if (p === 'oci') return F.oci.steps.map(t => t.replace('{access}', F.oci.access.cross_tenancy));
  return F.gcp.steps.slice();
}
function cloudInspector(s) {
  const pv = PROV[s.provider]; const fc = F.clouds[s.provider]; let h = '';
  h += `<p class="eyebrow">Cloud · ${esc(fc.full)}</p>`;
  h += `<div class="ph"><span class="kic pvt" style="--pv:${pv.color}">${esc(pv.short)}</span><input class="title" type="text" data-obj="site" data-f="name" value="${esc(s.name)}" aria-label="Name"><div class="acts edit-only"><button type="button" class="tbtn icon-only" data-act="dup" title="Duplicate" aria-label="Duplicate">${ic('i-copy')}</button><button type="button" class="tbtn icon-only" data-act="del" title="Delete" aria-label="Delete">${ic('i-trash')}</button></div></div>`;
  h += row('Provider', seg('provider', s.provider, Object.entries(PROV).map(([k, v]) => [k, v.short === 'GC' ? 'GCP' : v.short])));
  h += row(`${pv.unit[0].toUpperCase() + pv.unit.slice(1)}s`, stepper('accounts', s.accounts, 'site', 1));
  h += row('Regions', text('regions', s.regions, 'site', pv.hint));
  const feats = Object.entries(fc.features).filter(([k]) => k !== 'metadata');
  h += `<div class="sec"><h3>What Kentik collects</h3><div class="caps"><label class="cap"><span class="cdot" style="background:var(--t-cloud)"></span><span class="cn"><b>${esc(fc.features.metadata)}</b><small>Always on</small></span></label>${feats.map(([k, label]) => `<label class="cap"><span class="cdot" style="background:var(--t-cloud)"></span><span class="cn"><b>${esc(label)}</b></span><span class="sw"><input type="checkbox" data-feat="${k}"${s.feats[k] ? ' checked' : ''}><span></span></span></label>`).join('')}</div></div>`;
  h += `<div class="sec"><h3>How Kentik reads it</h3><p class="note">${esc(fc.summary)}</p><ol class="steps">${fc.pipeline.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`;
  h += `<dl class="kv"><dt>Who grants access</dt><dd>${esc(fc.grant_who)}</dd><dt>What they grant</dt><dd>${esc(fc.grant_what)}</dd></dl></div>`;
  h += `<details class="more"><summary>Setup steps</summary><div><ol class="steps">${cloudSteps(s).map(t => `<li>${esc(t)}</li>`).join('')}</ol>`;
  if (s.provider === 'aws') {
    h += `<p><b>IAM trust policy</b></p><pre class="code">${esc(F.aws.trust)}</pre><table class="tbl"><tbody>${F.aws.permissions.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
    if (s.accounts > 1) h += `<p><b>${s.accounts} accounts: primary and secondary roles</b></p><ol class="steps">${F.aws.nested.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`;
  }
  if (s.provider === 'gcp') h += `<p><b>Sink filter</b></p><pre class="code">${esc(F.gcp.filter)}</pre>`;
  if (s.provider === 'oci') h += `<p><b>Policy for a custom user</b></p><pre class="code">${esc(F.oci.userPolicy)}</pre>`;
  h += `<p class="note">Sources:</p>${kbLinks(fc.kb)}</div></details>`;
  return h;
}
function saasInspector(s) {
  const se = synthEstimate(); let h = '';
  h += `<p class="eyebrow">SaaS and Internet tests</p><div class="ph"><span class="kic" style="background:var(--k-saas-fill);color:var(--k-saas)">${ic('i-app')}</span><input class="title" type="text" data-obj="site" data-f="name" value="${esc(s.name)}" aria-label="Name"><div class="acts edit-only"><button type="button" class="tbtn icon-only" data-act="del" title="Delete" aria-label="Delete">${ic('i-trash')}</button></div></div>`;
  h += `<div class="row"><span class="lbl">Apps to test</span><div class="ctl"><textarea class="inp" data-obj="site" data-f="apps" data-list rows="3">${esc(s.apps.join(', '))}</textarea></div></div><p class="hint">Separate the apps with commas.</p>`;
  h += `<div class="sec"><h3>Who tests them</h3><p class="note">${se.n ? `${plural(se.n, 'site agent')} with Connectivity Test, plus 3 Kentik global agents.` : 'Only Kentik\'s global agents, because no site agent runs Connectivity Test.'}</p></div>`;
  h += `<div class="sec"><h3>Test credits per month (estimate)</h3>${se.rows.length ? `<table class="tbl"><tbody>${se.rows.map(r => `<tr><td>${esc(r.what)}<div class="note">${fmt1(r.per)} credits per run</div></td><td class="num">${fmt(r.month)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td class="num"><b>${fmt(se.total)}</b></td></tr></tbody></table>` : '<p class="note">No tests yet.</p>'}<p class="note">Credit rules from the KB: private agent subtest 2.5, global agent subtest 5. Pricing depends on the contract.</p>${kbLinks(['test-credits', 'test-types'])}</div>`;
  return h;
}
function kentikInspector() {
  const reg = F.regions[D.meta.region] || F.regions.US; let h = '';
  h += `<p class="eyebrow">Infoblox + Kentik</p><div class="ph"><span class="kic" style="background:#000;color:var(--ib-green)"><svg class="ic" viewBox="0 0 15.924 15.924"><use href="#i-ib"/></svg></span><h2 style="margin:0;font-size:17px">Kentik SaaS</h2></div>`;
  h += row('Kentik region', seg('region', D.meta.region, [['US', 'United States'], ['EU', 'European Union']], 'meta'));
  h += `<p class="hint">${esc(reg.label)}. Chosen when the contract is signed.</p>`;
  h += `<div class="sec"><h3>Allow outbound HTTPS 443 to</h3><table class="tbl"><tbody>${reg.hosts.map(x => `<tr><td>${esc(x)}</td></tr>`).join('')}${reg.optional.map(x => `<tr><td>${esc(x)} <span class="pill">optional</span></td></tr>`).join('')}</tbody></table><ul class="srcs">${F.egressNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
  h += `<div class="sec"><h3>Security</h3><dl class="kv">${F.security.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></div>`;
  h += `<div class="sec"><h3>Licenses</h3><dl class="kv">${F.licenses.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>${kbLinks(['security-overview', 'licenses'])}</div>`;
  return h;
}
function linkInspector(l) {
  const A = byId(l.a), B = byId(l.b); const e = P.linkLoad[l.id]; let h = '';
  h += `<p class="eyebrow">Network link</p><div class="ph"><span class="kic" style="background:var(--surface-2);color:var(--muted)">${ic('i-link')}</span><h2 style="margin:0;font-size:16px;flex:1">${esc(A.name)} ↔ ${esc(B.name)}</h2><div class="acts edit-only"><button type="button" class="tbtn icon-only" data-act="del" title="Delete the link" aria-label="Delete">${ic('i-trash')}</button></div></div>`;
  h += row('Kind', `<select class="inp" data-obj="link" data-f="kind">${Object.entries(LINKK).map(([k, v]) => `<option value="${k}"${l.kind === k ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select>`);
  h += row(`Capacity (Mbps)${A.count > 1 || B.count > 1 ? ', each' : ''}`, num('mbps', l.mbps, 'link'));
  if (e) {
    const u = e.mbps / l.mbps;
    h += `<div class="sec"><h3>Telemetry on this link</h3><div class="big" style="font-size:18px;font-weight:700">≈ ${loadTxt(e.mbps)}${e.each ? ' per site' : ''} · ${u < 0.01 ? '<1' : Math.round(u * 100)}%</div><div class="util ${uClass(u)}"><i style="width:${clamp(u * 100, 1, 100)}%"></i></div><table class="tbl"><tbody>${e.from.map(f => `<tr><td><button type="button" class="linkbtn" data-act="sel" data-id="${f.id}">${esc(byId(f.id).name)}</button></td><td class="num">${loadTxt(f.mbps)}</td></tr>`).join('')}</tbody></table><p class="note">Rough planning numbers, not Kentik KB figures.</p></div>`;
  } else h += `<p class="note">No telemetry crosses this link: the sites on both ends send to Kentik from their own agents, or it carries none of their data.</p>`;
  return h;
}
function summaryInspector() {
  const t = P.totals; const se = synthEstimate(); let h = '';
  h += `<p class="eyebrow">Design</p>`;
  h += row('Customer', text('customer', D.meta.customer, 'meta')) + row('Project', text('project', D.meta.project, 'meta')) + row('Prepared by', text('preparedBy', D.meta.preparedBy, 'meta', 'Your name'));
  h += row('Kentik region', seg('region', D.meta.region, [['US', 'US'], ['EU', 'EU']], 'meta'));
  h += `<div class="stats"><div class="stat"><b>${fmt(t.sites)}</b><span>on-prem sites</span></div><div class="stat"><b>${fmt(t.agents)}</b><span>agents</span></div><div class="stat"><b>${fmt(t.devices)}</b><span>devices</span></div><div class="stat"><b>${fmt(t.cpu)}</b><span>vCPU planned</span></div><div class="stat"><b>${fmt(t.ram)}</b><span>GB RAM</span></div><div class="stat"><b>${fmt(t.rules)}</b><span>firewall rules</span></div></div>`;
  if (P.agents.length) h += `<div class="sec"><h3>Agents</h3><table class="tbl"><tbody>${P.agents.map(a => { const z = P.st[a.id].size; return `<tr><td><button type="button" class="linkbtn" data-act="sel" data-id="${a.id}">${esc(a.name)}</button>${a.count > 1 ? ` ×${fmt(a.count)}` : ''}<div class="note">${CAP_T.concat(['bgp']).filter(c => P.st[a.id].caps[c]).map(c => capName(c, a.flowMode)).join(', ')}</div></td><td class="num">${z.recCpu} vCPU<br>${z.recRam} GB</td></tr>`; }).join('')}</tbody></table></div>`;
  if (se.rows.length) h += `<div class="sec"><h3>Test credits per month</h3><p class="note">About <b>${fmt(se.total)}</b> credits (estimate). Click the SaaS apps card for the detail.</p></div>`;
  h += VIEW_ONLY
    ? `<div class="sec"><h3>How to read this page</h3><ol class="steps"><li>Each card is one of your sites, clouds or SaaS apps. The green card is your Kentik account.</li><li>Pick a lens at the bottom to follow one kind of data, for example flow or syslog. Moving dots show its direction.</li><li>Click a card to see what Kentik needs there: the agent, its host size, the firewall rules and the setup steps.</li><li>The Firewall rules tab lists every rule by firewall. Customer pack saves the rules and the agent build sheet as CSV files.</li></ol></div>`
    : `<div class="sec"><h3>How to use the canvas</h3><ol class="steps"><li>Add sites with the buttons on the left. New sites link to the nearest data center.</li><li>Drag a card to move it. Drag from the link handle on its right edge to another card to draw a link.</li><li>Click a card or a link to change it here. The plan updates as you type.</li><li>Use the lenses at the bottom to follow each kind of data. Open Checks for problems the plan found.</li><li>Click Customer pack to send the design: an interactive HTML page, the firewall rule list, the agent build sheet and a printable brief.</li></ol></div>`;
  h += `<div class="sec"><h3>Legend</h3><div class="legend">${LANE.map(t => `<span><i style="background:var(--t-${t})"></i>${esc(TYPES[t])}</span>`).join('')}</div></div>`;
  h += `<div class="sec"><h3>Open questions for Kentik</h3><ul class="srcs">${F.openItems.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>`;
  return h;
}
function checksPane() {
  const cks = P.checks;
  if (!cks.length) return `<div class="okmsg">${ic('i-check')}No problems found. The plan is complete for what is on the canvas.</div>`;
  return `<p class="note" style="margin-top:0">The plan checks the design as you draw. Click a check to find the site. A fix button changes the design for you; undo works as usual.</p>` + cks.map((c, i) => `<div class="chk ${c.sev}" data-act="goto" data-id="${c.target || ''}">${ic(c.sev === 'info' ? 'i-info' : 'i-alert')}<div class="ct">${esc(c.text)}${c.fix && !VIEW_ONLY ? `<div class="fix"><button type="button" class="tbtn small" data-act="fix" data-i="${i}">${esc(c.fix.label)}</button></div>` : ''}</div></div>`).join('');
}
function rulesPane() {
  const rules = P.rules.filter(r => showInside || !r.inside);
  const groups = {};
  rules.forEach(r => { (groups[r.where] = groups[r.where] || []).push(r); });
  let h = `<p class="note" style="margin-top:0">Every rule the design needs, grouped by the firewall that must allow it. Send the CSV to the customer's security team as the change request.</p><div class="btnrow"><button type="button" class="tbtn small" data-act="csvRules">${ic('i-download')}Download CSV</button><label class="tbtn small" style="cursor:pointer"><input type="checkbox" data-act-check="inside"${showInside ? ' checked' : ''}> Rules inside sites</label></div>`;
  const names = Object.keys(groups);
  if (!names.length) return h + '<p class="note">No rules yet.</p>';
  names.forEach(w => { h += `<div class="rg"><h4>${ic('i-firewall')}${esc(w)}<span class="n">${groups[w].length}</span></h4>${rulesTable(groups[w])}</div>`; });
  return h;
}
function renderPanel() {
  let h;
  if (tab === 'checks') h = checksPane();
  else if (tab === 'rules') h = rulesPane();
  else if (!sel) h = summaryInspector();
  else if (sel.t === 'kentik') h = kentikInspector();
  else if (sel.t === 'link') h = linkInspector(linkById(sel.id));
  else { const s = byId(sel.id); h = s.kind === 'cloud' ? cloudInspector(s) : s.kind === 'saas' ? saasInspector(s) : siteInspector(s); }
  const st = pane.scrollTop; pane.innerHTML = h; pane.scrollTop = st;
  if (VIEW_ONLY) $$('input,select,textarea', pane).forEach(el => { if (!el.closest('label.tbtn')) el.disabled = true; });
}
function setField(el, now) {
  const obj = objFor(el.dataset.obj); if (!obj) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.hasAttribute('data-num')) v = Math.max(Number(el.min) || 0, Math.round(Number(v) || 0));
  if (el.hasAttribute('data-list')) v = String(v).split(',').map(a => a.trim()).filter(Boolean);
  setPath(obj, el.dataset.f, v);
  if (el.dataset.obj === 'meta' && el.dataset.f === 'customer') $('#custName').value = v;
  if (now) { commit(); refresh(); } else refresh({ panel: false });
}
pane.addEventListener('input', e => {
  const el = e.target.closest('[data-f]');
  if (!el || VIEW_ONLY || el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'number') return;
  setField(el, false);
});
pane.addEventListener('change', e => {
  if (VIEW_ONLY) return;
  const el = e.target;
  if (el.dataset.cap) { const s = byId(sel.id); setCap(s, el.dataset.cap, el.checked); commit(); refresh(); return; }
  if (el.dataset.feat) { const s = byId(sel.id); s.feats[el.dataset.feat] = el.checked; commit(); refresh(); return; }
  if (el.dataset.actCheck === 'inside') { showInside = el.checked; renderPanel(); return; }
  if (el.dataset.f) setField(el, true);
});
pane.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'sel') { select({ t: 'site', id: b.dataset.id }); centerOn(b.dataset.id); return; }
  if (a === 'goto') { if (e.target.closest('[data-act="fix"]')) return; if (b.dataset.id && byId(b.dataset.id)) { sel = { t: 'site', id: b.dataset.id }; renderNodes(); renderEdges(); centerOn(b.dataset.id); } return; }
  if (a === 'csvRules') { exportRules(); return; }
  if (VIEW_ONLY) return;
  if (a === 'seg') { const obj = objFor(b.dataset.obj); setPath(obj, b.dataset.f, b.dataset.v); if (b.dataset.f === 'provider') obj.name = Object.values(PROV).some(p => p.name === obj.name) ? PROV[b.dataset.v].name : obj.name; commit(); refresh(); return; }
  if (a === 'step') { const obj = objFor(b.dataset.obj); const f = b.dataset.f; const min = f === 'count' || f === 'accounts' ? 1 : 0; const cur = Number(getPath(obj, f)) || 0; const big = f === 'count' && cur >= 10 ? 5 : 1; setPath(obj, f, Math.max(min, cur + Number(b.dataset.d) * big)); commit(); refresh(); return; }
  if (a === 'capsAuto') { byId(sel.id).caps = null; commit(); refresh(); return; }
  if (a === 'del') { deleteSel(); return; }
  if (a === 'dup') { duplicateSel(); return; }
  if (a === 'fix') { const c = P.checks[Number(b.dataset.i)]; if (c && c.fix) { c.fix.run(); commit(); refresh(); toast('Fixed: ' + c.fix.label); } }
});
$$('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; syncTabs(); renderPanel(); }));

/* ---------- exports ---------- */
function download(name, body, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const csv = rows => rows.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
function exportRules() {
  const rows = [['Firewall or boundary', 'Source', 'Destination', 'Protocol and port', 'Purpose', 'Data', 'Inside a site']];
  P.rules.forEach(r => rows.push([r.where, r.src, r.dst, r.port, r.why, TYPES[r.t] || r.t, r.inside ? 'yes' : 'no']));
  download(`${slug(D.meta.customer)}-kentik-firewall-rules.csv`, csv(rows), 'text/csv');
  toast(`Saved ${P.rules.length} rules as CSV`);
}
function exportAgents() {
  const rows = [['Site', 'Location', 'Agents', 'Install', 'Capabilities', 'Flow Proxy mode', 'vCPU', 'RAM (GB)', 'Serves', 'Supported OS']];
  P.agents.forEach(a => { const x = P.st[a.id]; rows.push([a.name, a.location, a.count || 1, a.install === 'docker' ? 'Docker' : 'Linux host', CAP_T.concat(['bgp']).filter(c => x.caps[c]).map(c => capName(c, a.flowMode)).join('; '), x.caps.flow ? (a.flowMode === 'edge' ? 'Edge Processing' : 'Forwarding') : '', x.size.recCpu, x.size.recRam, x.feeds.map(f => byId(f).name + (byId(f).count > 1 ? ` (x${byId(f).count})` : '')).join('; '), F.os.supported.join('; ')]); });
  download(`${slug(D.meta.customer)}-kentik-agent-build-sheet.csv`, csv(rows), 'text/csv');
  toast(`Saved the build sheet for ${plural(P.totals.agents, 'agent')}`);
}
function exportDesign() { download(`${slug(D.meta.customer)}-kentik-canvas.json`, JSON.stringify(D, null, 2), 'application/json'); toast('Saved the design file'); }
function exportView() {
  const tag = '<script id="ibk-design">window.IBK_DESIGN=' + JSON.stringify(D).replace(/</g, '\\u003c') + ';window.IBK_VIEW_ONLY=true;</' + 'script>\n';
  const html = PRISTINE.replace('</' + 'head>', tag + '</' + 'head>');
  download(`${slug(D.meta.customer)}-kentik-network-canvas.html`, html, 'text/html');
  toast('Saved the customer view. It opens in any browser, with no app.');
}
function printBrief() {
  const keep = { lens, sel, hover, motion }; lens = 'all'; sel = null; hover = null; motion = false;
  refresh({ panel: false });
  const bb = worldBox(); const W = 1000, H = 600, pad = 24;
  const k = Math.min((W - 2 * pad) / bb.w, (H - 2 * pad) / bb.h, 1);
  const clone = world.cloneNode(true); clone.removeAttribute('id');
  $$('[id]', clone).forEach(n => n.removeAttribute('id'));
  clone.style.transform = `translate(${(W - bb.w * k) / 2 - bb.x * k}px,${(H - bb.h * k) / 2 - bb.y * k}px) scale(${k})`;
  const reg = F.regions[D.meta.region] || F.regions.US; const se = synthEstimate();
  const groups = {}; P.rules.filter(r => !r.inside).forEach(r => { (groups[r.where] = groups[r.where] || []).push(r); });
  const T = (head, rows) => `<table><thead><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  let h = `<div class="brand"><svg viewBox="0 0 15.924 15.924"><use href="#i-ib"/></svg><b>infoblox</b> · Kentik deployment design</div>`;
  h += `<h1>${esc(D.meta.customer)}</h1><p class="meta">${esc(D.meta.project)} · Kentik ${esc(D.meta.region)} region · ${new Date().toISOString().slice(0, 10)}${D.meta.preparedBy ? ' · Prepared by ' + esc(D.meta.preparedBy) : ''}</p>`;
  h += `<div class="snap"></div>`;
  const t = P.totals;
  h += `<p>${plural(t.sites, 'on-prem site')}, ${plural(t.devices, 'network device')}, ${plural(t.clouds, 'cloud')}. ${plural(t.agents, 'Universal Agent')} with ${fmt(t.cpu)} vCPU and ${fmt(t.ram)} GB RAM in total. ${plural(t.rules, 'firewall rule')}. Every agent connection starts from inside the network on HTTPS 443.</p>`;
  h += `<h2>Universal Agents</h2>` + T(['Site', 'Agents', 'Install', 'Capabilities', 'Host size', 'Also serves'], P.agents.map(a => { const x = P.st[a.id]; return [a.name + (a.location ? ` (${a.location})` : ''), a.count || 1, a.install === 'docker' ? 'Docker' : 'Linux host', CAP_T.concat(['bgp']).filter(c => x.caps[c]).map(c => capName(c, a.flowMode)).join(', '), `${x.size.recCpu} vCPU, ${x.size.recRam} GB`, x.feeds.map(f => byId(f).name + (byId(f).count > 1 ? ` (×${byId(f).count})` : '')).join(', ') || '—']; }));
  const remote = P.onprem.filter(s => !P.st[s.id].agent);
  if (remote.length) h += `<h2>Sites without an agent</h2>` + T(['Site', 'Sites', 'Sends to', 'Path', 'WAN telemetry (rough)'], remote.map(s => { const x = P.st[s.id]; return [s.name, s.count || 1, x.target ? byId(x.target).name : 'No agent', x.route ? x.route.map(id => byId(id).name).join(' → ') : '', x.mbps ? `${loadTxt(x.mbps)}${s.count > 1 ? ' per site' : ''}` : '']; }));
  h += `<h2 class="pb">Firewall rules</h2>`;
  Object.keys(groups).forEach(w => { h += `<h3>${esc(w)}</h3>` + T(['Source', 'Destination', 'Port', 'Purpose'], groups[w].map(r => [r.src, r.dst, r.port, r.why])); });
  h += `<p>Allow outbound HTTPS 443 from every agent to: ${esc(reg.hosts.join(', '))}. ${esc(F.egressNotes.join(' '))}</p>`;
  const clouds = D.sites.filter(s => s.kind === 'cloud');
  if (clouds.length) {
    h += `<h2>Clouds</h2>`;
    clouds.forEach(c => { const fc = F.clouds[c.provider]; h += `<h3>${esc(c.name)} (${esc(fc.full)}, ${plural(c.accounts, PROV[c.provider].unit)}${c.regions ? ', ' + esc(c.regions) : ''})</h3><p>${esc(fc.summary)} Access: ${esc(fc.grant_who)}: ${esc(fc.grant_what)}.</p><ol>${cloudSteps(c).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`; });
  }
  if (se.rows.length) h += `<h2>Synthetic tests (estimate)</h2>` + T(['Test', 'Credits per run', 'Credits per month'], se.rows.map(r => [r.what, fmt1(r.per), fmt(r.month)]).concat([['Total', '', fmt(se.total)]]));
  const ck = P.checks.filter(c => c.sev !== 'info');
  h += `<h2>Open points</h2><ul>${ck.map(c => `<li>${esc(c.text)}</li>`).join('')}${F.openItems.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`;
  h += `<h2>Sources</h2><ul>${['universal-agents', 'ua-deployment', 'router-configuration', 'nms-setup', 'snmp-traps-syslogs', 'synthetics-overview', 'test-credits', 'public-clouds', 'security-overview'].map(k => `<li>${esc(F.kb[k].title)}: ${esc(F.kb[k].url)}</li>`).join('')}</ul><p class="meta">Facts from the Kentik Knowledge Base, checked ${esc(F.checked)}. WAN load figures are rough planning numbers.</p>`;
  const brief = $('#brief'); brief.innerHTML = h; brief.querySelector('.snap').appendChild(clone);
  Object.assign({}, keep); lens = keep.lens; sel = keep.sel; hover = keep.hover; motion = keep.motion;
  refresh();
  setTimeout(() => window.print(), 60);
}
function openFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let j; try { j = JSON.parse(rd.result); } catch (e) { toast('That file is not JSON.'); return; }
    let d = null;
    if (j && Array.isArray(j.sites) && Array.isArray(j.links)) d = normalizeDesign(j);
    else if (j && Array.isArray(j.sites)) d = normalizeDesign(fromSetup(j));
    if (!d) { toast('That file is not a canvas design or a setup from the current app.'); return; }
    loadDesign(d); toast(`Opened ${d.meta.customer}`);
  };
  rd.readAsText(file);
}

/* ---------- starters ---------- */
function splitDevices(n, kind, dns) {
  const router = Math.max(1, Math.round(n * 0.06)), firewall = Math.max(1, Math.round(n * 0.03)), lb = kind === 'dc' ? Math.round(n * 0.02) : 0;
  return { router, firewall, lb, switch: Math.max(0, n - router - firewall - lb), dns: dns ? 2 : 0 };
}
function fromSetup(cfg) {
  const d = blankDesign();
  d.meta = { customer: cfg.customer || 'Customer', project: cfg.project || d.meta.project, preparedBy: cfg.prepared_by || '', region: cfg.region === 'EU' ? 'EU' : 'US' };
  const byName = {};
  (cfg.sites || []).forEach(s0 => {
    const kind = s0.kind === 'branch' ? 'branch' : 'dc'; const caps = s0.capabilities || [];
    const s = makeSite(d, kind, { name: s0.name || '', location: s0.location || '' });
    s.dev = splitDevices(Math.max(1, Number(s0.devices) || (kind === 'dc' ? 200 : 20)), kind, caps.includes('dns'));
    s.fps = Number(s0.fps) || DEF[kind].fps; s.eps = Number(s0.syslog_eps) || DEF[kind].eps; s.dnsLps = Number(s0.dns_lps) || 0;
    s.install = s0.install === 'docker' ? 'docker' : 'linux'; s.flowMode = s0.flow_mode === 'edge' ? 'edge' : 'forward';
    const agent = kind === 'dc' ? true : ('agent' in s0 ? !!s0.agent : caps.length > 0);
    s.agent = kind === 'dc' ? 'auto' : agent ? 'on' : 'auto';
    if (agent && caps.length) { s.caps = {}; CAP_T.forEach(c => { s.caps[c] = caps.includes(c); }); }
    s.bgp = caps.includes('bgp') || s0.proxy ? 'proxy' : s0.bgp ? 'direct' : 'off';
    s._sendTo = s0.send_to || '';
    byName[s.name] = s.id; d.sites.push(s);
  });
  const dcs = d.sites.filter(s => s.kind === 'dc');
  d.sites.forEach(s => { if (s._sendTo && byName[s._sendTo]) s.sendTo = byName[s._sendTo]; delete s._sendTo; });
  for (let i = 1; i < dcs.length; i++) d.links.push({ id: uid('l'), a: dcs[i - 1].id, b: dcs[i].id, kind: 'dci', mbps: 10000 });
  d.sites.filter(s => s.kind === 'branch').forEach(b => { const to = b.sendTo || (dcs[0] && dcs[0].id); if (to) d.links.push({ id: uid('l'), a: b.id, b: to, kind: 'wan', mbps: 100 }); });
  F.cloudOrder.forEach(cid => {
    const c0 = (cfg.clouds || {})[cid]; if (!c0 || !c0.enabled) return;
    const feats = c0.features || [];
    const c = makeSite(d, 'cloud', { provider: cid, accounts: Math.max(1, Number(c0.accounts) || 1), regions: c0.regions || '', feats: { flow: feats.includes('flow'), firewall: feats.includes('firewall'), metrics: feats.includes('metrics'), cloudrun: feats.includes('cloudrun') } });
    d.sites.push(c);
    if (dcs[0]) d.links.push({ id: uid('l'), a: c.id, b: dcs[0].id, kind: 'cloud', mbps: 1000 });
  });
  const syn = cfg.synthetics || {};
  if (syn.enabled !== false && (syn.saas_targets || []).length) d.sites.push(makeSite(d, 'saas', { apps: syn.saas_targets.slice() }));
  d._layout = true;
  return d;
}
function buildRetail() {
  const d = blankDesign();
  d.meta = { customer: 'Northwind Retail', project: 'Network observability with Infoblox + Kentik', preparedBy: '', region: 'US' };
  const A = makeSite(d, 'dc', { name: 'Ashburn DC', location: 'Ashburn, VA', dev: { router: 6, switch: 40, firewall: 4, lb: 4, dns: 2 }, fps: 40000, eps: 3000, dnsLps: 30000 }); d.sites.push(A);
  const B = makeSite(d, 'dc', { name: 'Dallas DC', location: 'Dallas, TX', dev: { router: 4, switch: 24, firewall: 2, lb: 2, dns: 2 }, fps: 20000 }); d.sites.push(B);
  const H = makeSite(d, 'campus', { name: 'Chicago HQ', location: 'Chicago, IL' }); d.sites.push(H);
  const E = makeSite(d, 'branch', { name: 'Stores East', location: 'East coast', count: 80, fps: 800, eps: 50 }); d.sites.push(E);
  const W = makeSite(d, 'branch', { name: 'Stores West', location: 'West coast', count: 70, fps: 800, eps: 50 }); d.sites.push(W);
  const DCN = makeSite(d, 'branch', { name: 'Denver warehouse', location: 'Denver, CO', dev: { router: 2, switch: 8, firewall: 1, lb: 0, dns: 0 }, fps: 9000, eps: 400 }); d.sites.push(DCN);
  const AWS = makeSite(d, 'cloud', { name: 'AWS production', provider: 'aws', accounts: 6, regions: 'us-east-1, us-west-2', feats: { flow: true, firewall: true, metrics: false } }); d.sites.push(AWS);
  const AZ = makeSite(d, 'cloud', { name: 'Azure corporate', provider: 'azure', accounts: 2, regions: 'eastus2' }); d.sites.push(AZ);
  const S = makeSite(d, 'saas', { name: 'SaaS apps', apps: ['Microsoft 365', 'Salesforce', 'ServiceNow', 'Zoom'] }); d.sites.push(S);
  const L = (a, b, kind, mbps) => d.links.push({ id: uid('l'), a: a.id, b: b.id, kind, mbps });
  L(A, B, 'dci', 10000); L(H, A, 'wan', 1000); L(E, A, 'wan', 20); L(W, B, 'wan', 20); L(DCN, B, 'wan', 10); L(AWS, A, 'cloud', 1000); L(AZ, B, 'cloud', 1000);
  d._layout = true;
  return d;
}
const STARTERS = () => [
  { id: 'retail', title: 'Retail chain', sub: 'Two data centers, HQ, 150 stores in two groups, a warehouse on a thin link, AWS, Azure and SaaS tests', build: buildRetail },
  ...EXAMPLES.map(e => ({ id: 'ex:' + e.file, title: e.setup.customer || e.file, sub: `${e.setup.project || ''}. From examples/${e.file}, the current app's format`, build: () => fromSetup(e.setup) })),
  { id: 'blank', title: 'Blank canvas', sub: 'Start from nothing', build: blankDesign },
];
function loadDesign(d) {
  D = normalizeDesign(d) || blankDesign();
  if (D._layout) { delete D._layout; autoLayout(); }
  sel = null; hover = null; commit(); refresh(); requestAnimationFrame(() => fit(false));
}

/* ---------- menus, keys, theme ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function openModal(title, body) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modal').hidden = false; const f = $('#modalBody textarea, #modalBody button'); if (f) f.focus(); }
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
function buildMenus() {
  $('#startPop').innerHTML = STARTERS().map(s => `<button type="button" data-starter="${esc(s.id)}">${ic(s.id === 'blank' ? 'i-plus' : 'i-sparkle')}<span><b>${esc(s.title)}</b><small>${esc(s.sub)}</small></span></button>`).join('') + `<hr><button type="button" data-open>${ic('i-upload')}<span><b>Open a file…</b><small>A canvas design, or a setup JSON from the current app</small></span></button>`;
  const items = [
    ['view', 'i-eye', 'Customer view (.html)', 'One interactive file the customer opens in any browser: the canvas, the lenses and every detail, without editing', !VIEW_ONLY],
    ['brief', 'i-print', 'Design brief (print or PDF)', 'The canvas, agents, firewall rules, clouds and open points on a few pages', true],
    ['rules', 'i-firewall', 'Firewall rules (.csv)', 'One row per rule, grouped by firewall, for the change request', true],
    ['agents', 'i-server', 'Agent build sheet (.csv)', 'Host size, install method and capabilities per agent, for the server team', true],
    ['json', 'i-download', 'Design file (.json)', 'Save the design to open it again later', !VIEW_ONLY],
  ];
  $('#exportPop').innerHTML = items.filter(i => i[4]).map(([id, icon, t, s]) => `<button type="button" data-export="${id}">${ic(icon)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`).join('');
}
function closeMenus() { $$('.menu.open').forEach(m => { m.classList.remove('open'); m.querySelector('[data-menu]').setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', e => {
  const mb = e.target.closest('[data-menu]');
  if (mb) { const m = mb.closest('.menu'); const open = !m.classList.contains('open'); closeMenus(); if (open) { m.classList.add('open'); mb.setAttribute('aria-expanded', 'true'); } return; }
  const st = e.target.closest('[data-starter]');
  if (st) { const s = STARTERS().find(x => x.id === st.dataset.starter); closeMenus(); if (s) { loadDesign(s.build()); toast(`Opened ${s.title}. Undo goes back.`); } return; }
  if (e.target.closest('[data-open]')) { closeMenus(); $('#fileIn').click(); return; }
  const ex = e.target.closest('[data-export]');
  if (ex) { closeMenus(); ({ view: exportView, brief: printBrief, rules: exportRules, agents: exportAgents, json: exportDesign })[ex.dataset.export](); return; }
  const add = e.target.closest('[data-add]');
  if (add && !VIEW_ONLY) { addSite(add.dataset.add); return; }
  const lb = e.target.closest('#lensbar [data-lens]');
  if (lb) { lens = lb.dataset.lens; refresh({ panel: false }); return; }
  if (e.target.closest('#lensbar [data-motion]')) { motion = !motion; refresh({ panel: false }); return; }
  if (e.target.closest('[data-cap-toggle]')) { captionMini = !captionMini; lsSet('ibk-canvas-caption-mini', captionMini); renderLensUI(); return; }
  if (!e.target.closest('.menu')) closeMenus();
});
$('#fileIn').addEventListener('change', e => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
$('#custName').addEventListener('input', e => { D.meta.customer = e.target.value; renderStatus(); if (!sel && tab === 'inspect') { const i = $('[data-obj="meta"][data-f="customer"]', pane); if (i) i.value = e.target.value; } });
$('#custName').addEventListener('change', () => commit());
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
$('#zin').addEventListener('click', () => zoomAt(1.2));
$('#zout').addEventListener('click', () => zoomAt(1 / 1.2));
$('#zfit').addEventListener('click', () => fit());
$('#tidyBtn').addEventListener('click', () => { autoLayout(); commit(); refresh(); fit(); toast('Tidied the canvas. Undo goes back.'); });
$('#pasteBtn').addEventListener('click', () => openModal('Add sites from a list', `<p>Paste one site per line: <b>name, kind, count</b>. Kind is dc, campus, branch, aws, azure, gcp, oci or saas. Count is optional, for a group of similar sites. New sites link to the nearest data center, and the canvas is tidied.</p><textarea class="inp" id="pasteText" rows="9" placeholder="Frankfurt DC, dc&#10;London office, campus&#10;Stores France, branch, 120&#10;Lyon warehouse, branch&#10;AWS Europe, aws"></textarea><div class="btnrow" style="justify-content:flex-end;margin-top:10px"><button type="button" class="tbtn" data-close>Cancel</button><button type="button" class="tbtn primary" id="pasteGo">Add the sites</button></div>`));
$('#modal').addEventListener('click', e => {
  if (!e.target.closest('#pasteGo')) return;
  const lines = $('#pasteText').value.split(/\n/).map(l => l.trim()).filter(Boolean);
  let n = 0;
  lines.forEach(line => {
    const [name, kind0, count0] = line.split(/[,;\t]/).map(x => (x || '').trim());
    const k = (kind0 || 'branch').toLowerCase();
    const prov = /aws|amazon/.test(k) ? 'aws' : /azure|microsoft/.test(k) ? 'azure' : /gcp|google/.test(k) ? 'gcp' : /oci|oracle/.test(k) ? 'oci' : null;
    let s;
    if (prov) s = makeSite(D, 'cloud', { provider: prov, name: name || PROV[prov].name });
    else if (/saas|app/.test(k)) s = makeSite(D, 'saas', { name: name || 'SaaS apps' });
    else s = makeSite(D, /dc|data/.test(k) ? 'dc' : /campus|hq|head/.test(k) ? 'campus' : 'branch', { name: name || '', count: Math.max(1, parseInt(count0, 10) || 1) });
    D.sites.push(s); n++;
  });
  D.sites.filter(s => (s.kind === 'branch' || s.kind === 'campus' || s.kind === 'cloud') && !D.links.some(l => l.a === s.id || l.b === s.id)).forEach(s => {
    const hub = D.sites.find(o => o.kind === 'dc') || D.sites.find(o => o.kind === 'campus' && o !== s);
    if (hub && hub !== s) D.links.push({ id: uid('l'), a: s.id, b: hub.id, kind: s.kind === 'cloud' ? 'cloud' : 'wan', mbps: s.kind === 'cloud' ? 1000 : s.count > 1 ? 20 : 50 });
  });
  closeModal(); autoLayout(); commit(); refresh(); fit(); toast(`Added ${plural(n, 'site')}. Undo goes back.`);
});
$('#helpBtn').addEventListener('click', () => openModal('How the Network Canvas works', `<p>Draw the customer's network as it is: their data centers, campuses, branches, clouds and the SaaS apps they care about, joined by their WAN links. You do not place Kentik parts by hand. The canvas works out where Universal Agents go, the path each kind of data takes, the rules each firewall must allow, the telemetry on each WAN link and the size of each agent host.</p><table class="tbl keys-tbl"><tbody>
<tr><td><kbd>D</kbd> <kbd>B</kbd> <kbd>G</kbd></td><td>Add a data center, a branch, a branch group</td></tr>
<tr><td>Double-click</td><td>Add a branch where you click</td></tr>
<tr><td>Drag a card</td><td>Move it. Drag from its link handle to draw a link</td></tr>
<tr><td>Scroll, or drag the background</td><td>Move around. Pinch or Ctrl + scroll to zoom</td></tr>
<tr><td><kbd>1</kbd> to <kbd>0</kbd></td><td>Lenses: all, flow, metrics, events, BGP, DNS, tests, cloud, firewalls, WAN load</td></tr>
<tr><td><kbd>M</kbd></td><td>Moving dots on or off</td></tr>
<tr><td><kbd>F</kbd> <kbd>+</kbd> <kbd>-</kbd></td><td>Fit, zoom in, zoom out</td></tr>
<tr><td><kbd>T</kbd></td><td>Tidy the layout</td></tr>
<tr><td><kbd>Delete</kbd></td><td>Delete what is selected</td></tr>
<tr><td><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd>, <kbd>D</kbd></td><td>Undo (add Shift to redo), duplicate</td></tr>
<tr><td><kbd>E</kbd></td><td>Customer pack</td></tr>
<tr><td><kbd>Esc</kbd></td><td>Clear the selection</td></tr></tbody></table><p style="margin-top:10px">Facts (ports, sizing, cloud steps) come from configurator/catalog.py, checked against the Kentik KB in ${esc(F.checked)}. WAN load figures are rough planning numbers.</p>`));
document.addEventListener('keydown', e => {
  const typing = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
  if (e.key === 'Escape') { if (!$('#modal').hidden) { closeModal(); return; } closeMenus(); if (typing) e.target.blur(); else select(null); return; }
  if (typing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (VIEW_ONLY) return; e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); if (!VIEW_ONLY) redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod) return;
  const L = LENSES.find(l => l.key === e.key);
  if (L) { lens = L.id; refresh({ panel: false }); return; }
  const k = e.key.toLowerCase();
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); }
  else if (k === 'f') fit();
  else if (e.key === '+' || e.key === '=') zoomAt(1.2);
  else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.2);
  else if (k === 'm') { motion = !motion; refresh({ panel: false }); }
  else if (k === 't' && !VIEW_ONLY) $('#tidyBtn').click();
  else if (k === 'e') $('#exportMenu [data-menu]').click();
  else if (e.key === '?') $('#helpBtn').click();
  else if (!VIEW_ONLY && k === 'd') addSite('dc');
  else if (!VIEW_ONLY && k === 'b') addSite('branch');
  else if (!VIEW_ONLY && k === 'g') addSite('group');
});
function setTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
$('#themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = dark ? 'light' : 'dark'; setTheme(t); try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* no storage */ }
});
window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(() => fit(false), 150); });

/* ---------- startup ---------- */
(function init() {
  let t = null; try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* no storage */ }
  if (t === 'light' || t === 'dark') setTheme(t);
  world.innerHTML = '<div id="eh"></div><div id="nh"></div>';
  if (VIEW_ONLY) { document.body.classList.add('view-only'); $('#viewbar').hidden = false; $('#custName').readOnly = true; }
  buildMenus();
  // Optional link options: #starter=retail&lens=flow&sel=Ashburn%20DC&tab=rules&theme=dark
  const q = new URLSearchParams(location.hash.slice(1));
  const st = q.get('starter') && STARTERS().find(s => s.id === q.get('starter'));
  const saved = st ? st.build() : window.IBK_DESIGN || (VIEW_ONLY ? null : lsGet(STORE));
  D = normalizeDesign(saved) || normalizeDesign(buildRetail());
  if (D._layout) { delete D._layout; autoLayout(); }
  if (LENS[q.get('lens')]) lens = q.get('lens');
  if (['inspect', 'checks', 'rules'].includes(q.get('tab'))) tab = q.get('tab');
  if (q.get('theme') === 'dark' || q.get('theme') === 'light') setTheme(q.get('theme'));
  if (q.get('motion') === 'off') motion = false;
  const sn = q.get('sel') && D.sites.find(s => s.name === q.get('sel'));
  if (sn) sel = { t: 'site', id: sn.id };
  syncTabs();
  lastSnap = JSON.stringify(D);
  refresh();
  applyView();
  requestAnimationFrame(() => fit(false));
})();
