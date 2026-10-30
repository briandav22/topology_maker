'use strict';
/* Take B, Rollout Map.
   The deployment is a project in waves. Each site, cloud and the synthetic tests belong to a wave.
   From that, derive() builds the tasks each customer team must do (security, server, network, DNS, cloud)
   and the Infoblox tasks, with their order and typical effort. Three views use it:
   Map (a transit map: each kind of data is a line into Kentik, each site a station, a timeline plays the waves),
   Plan (tasks by team and wave, with plan checks) and Workbook (what the customer gets: tasks to tick off).
   Kentik facts come from window.FACTS, built from configurator/catalog.py.
   Sections: helpers, constants, plan model, tasks, checks, map, plan board, workbook, panel, estate, exports, starters, startup. */

const PRISTINE = '<!doctype html>\n' + document.documentElement.outerHTML;
const F = window.FACTS;
const EXAMPLES = window.EXAMPLES || [];
const BOOK_ONLY = !!window.IBK_WORKBOOK;
const STORE = 'ibk-rollout-plan';
const THEME_KEY = 'ibk-rollout-theme';
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(Number(n) || 0).toLocaleString('en-US');
const fmt1 = n => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = p => p + Math.random().toString(36).slice(2, 9);
const ic = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : (many || one + 's')}`;
const slug = s => String(s || 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'customer';
const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window or full storage */ } };
const DAY = 86400000;
const parseDate = s => { const d = new Date((s || '') + 'T00:00:00'); return isNaN(d) ? null : d; };
const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDateY = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function nextMonday() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); }

/* ---------- constants ---------- */
const KIND = { dc: { label: 'Data center', icon: 'i-server' }, campus: { label: 'Campus or HQ', icon: 'i-building' }, branch: { label: 'Branch', icon: 'i-store' } };
const REGIONS = { amer: 'Americas', emea: 'Europe, Middle East, Africa', apac: 'Asia Pacific' };
const PROV = {
  aws: { name: 'AWS', short: 'AWS', color: '#ff9900', unit: 'account' },
  azure: { name: 'Azure', short: 'Az', color: '#0078d4', unit: 'subscription' },
  gcp: { name: 'Google Cloud', short: 'GC', color: '#4285f4', unit: 'project' },
  oci: { name: 'Oracle Cloud', short: 'OCI', color: '#c74634', unit: 'tenancy' },
};
const LINES = [
  { id: 'flow', label: 'Flow', caps: ['flow'] },
  { id: 'metrics', label: 'Device metrics', caps: ['snmp', 'ssh'] },
  { id: 'events', label: 'Traps and syslog', caps: ['trap', 'syslog'] },
  { id: 'dns', label: 'DNS lookups', caps: ['dns'] },
  { id: 'bgp', label: 'BGP', caps: ['bgp'] },
  { id: 'tests', label: 'Synthetic tests', caps: ['synth'] },
  { id: 'cloud', label: 'Cloud flow logs', caps: [] },
];
const TEAMS = {
  se: { label: 'Infoblox + Kentik', who: 'Your Infoblox account team: the Kentik portal, agents, cloud exports, tests and go-live checks.' },
  security: { label: 'Security team', who: 'Firewall changes, so that agents can reach Kentik and devices can reach the agents.' },
  server: { label: 'Server team', who: 'A Linux host or a Docker host for each Universal Agent.' },
  network: { label: 'Network team', who: 'Routers, switches and firewalls: flow export, SNMP, traps, syslog and BGP.' },
  dns: { label: 'DNS team', who: 'DNS servers such as Infoblox NIOS: DNSTAP to the agent.' },
  cloud: { label: 'Cloud team', who: 'Flow logs, storage and read-only access for Kentik in each cloud.' },
};
const TEAM_ORDER = ['se', 'security', 'server', 'network', 'dns', 'cloud'];
const STATUS = { todo: 'To do', doing: 'In progress', done: 'Done', blocked: 'Blocked' };
const CAPS = ['flow', 'snmp', 'trap', 'syslog', 'dns', 'synth', 'ssh'];
const DEFCAPS = { dc: ['flow', 'snmp', 'trap', 'syslog'], campus: ['flow', 'snmp', 'trap', 'syslog'], branch: ['flow', 'snmp', 'synth'] };
const DEF = { dc: { devices: 200, fps: 20000, eps: 2000, install: 'linux' }, campus: { devices: 120, fps: 8000, eps: 800, install: 'linux' }, branch: { devices: 20, fps: 2000, eps: 200, install: 'docker' } };

/* ---------- state ---------- */
let R = null;            // the plan
let X = null;            // derived: tasks, stations, checks
let view = 'map';
let sel = null;          // {t:'site'|'cloud'|'tests'|'task', id}
let pos = 0;             // timeline: 0 = start, k = during wave k, n+1 = after the last wave
let mode = 'plan';       // map shows the plan by wave, or the real progress from task status
let playing = null;
let hoverSt = null;
const hiddenLines = new Set();
let lastSnap = '';
const undoStack = [], redoStack = [];

/* ---------- plan model ---------- */
function blankPlan() {
  return {
    v: 1, meta: { customer: 'New customer', project: 'Infoblox + Kentik rollout', preparedBy: '', region: 'US', start: nextMonday() },
    waves: [{ id: 'w1', name: 'Prove value', weeks: 2 }, { id: 'w2', name: 'Data centers and cloud', weeks: 3 }, { id: 'w3', name: 'Branches', weeks: 4 }, { id: 'w4', name: 'Tests and handover', weeks: 2 }],
    sites: [], clouds: [], tests: { on: true, wave: 'w4', saas: ['Microsoft 365', 'Salesforce'] },
    owners: {}, status: {}, notes: {},
  };
}
function makeSite(kind, extra = {}) {
  const n = R ? R.sites.filter(s => s.kind === kind).length + 1 : 1;
  const s = { id: uid('s'), kind, name: `${{ dc: 'Data center', campus: 'Campus', branch: 'Branch' }[kind]} ${n}`, location: '', region: 'amer', count: 1, devices: DEF[kind].devices, dns: 0, fps: DEF[kind].fps, eps: DEF[kind].eps,
    agent: kind !== 'branch', sendTo: '', caps: DEFCAPS[kind].slice(), flowMode: 'forward', bgp: 'off', install: DEF[kind].install, wave: '' };
  return Object.assign(s, extra);
}
function makeCloud(provider, extra = {}) {
  return Object.assign({ id: uid('c'), provider, name: PROV[provider].name, accounts: 1, regions: '', feats: { flow: true, firewall: false, metrics: false }, wave: '' }, extra);
}
function normalizePlan(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.sites)) return null;
  const out = blankPlan();
  out.meta = Object.assign(out.meta, p.meta || {});
  if (!F.regions[out.meta.region]) out.meta.region = 'US';
  if (!parseDate(out.meta.start)) out.meta.start = nextMonday();
  if (Array.isArray(p.waves) && p.waves.length) out.waves = p.waves.map((w, i) => ({ id: w.id || 'w' + (i + 1) + uid(''), name: String(w.name || `Wave ${i + 1}`), weeks: clamp(Math.round(Number(w.weeks) || 1), 1, 26) }));
  const wids = out.waves.map(w => w.id);
  const fixWave = w => wids.includes(w) ? w : wids[Math.min(1, wids.length - 1)];
  p.sites.forEach(s0 => {
    if (!s0 || !KIND[s0.kind]) return;
    const s = makeSite(s0.kind);
    Object.keys(s).forEach(k => { if (s0[k] !== undefined) s[k] = s0[k]; });
    s.count = Math.max(1, Math.round(Number(s.count) || 1)); s.devices = Math.max(0, Math.round(Number(s.devices) || 0)); s.dns = Math.max(0, Math.round(Number(s.dns) || 0));
    s.fps = Math.max(0, Math.round(Number(s.fps) || 0)); s.eps = Math.max(0, Math.round(Number(s.eps) || 0));
    if (!REGIONS[s.region]) s.region = 'amer';
    s.caps = (Array.isArray(s.caps) ? s.caps : DEFCAPS[s.kind]).filter(c => CAPS.includes(c));
    s.agent = !!s.agent; s.wave = fixWave(s.wave);
    out.sites.push(s);
  });
  (p.clouds || []).forEach(c0 => { if (!c0 || !PROV[c0.provider]) return; const c = makeCloud(c0.provider); Object.keys(c).forEach(k => { if (c0[k] !== undefined) c[k] = c0[k]; }); c.feats = Object.assign({ flow: true, firewall: false, metrics: false }, c0.feats || {}); c.accounts = Math.max(1, Math.round(Number(c.accounts) || 1)); c.wave = fixWave(c.wave); out.clouds.push(c); });
  out.tests = Object.assign(out.tests, p.tests || {}); out.tests.wave = wids.includes(out.tests.wave) ? out.tests.wave : wids[wids.length - 1];
  if (!Array.isArray(out.tests.saas)) out.tests.saas = String(out.tests.saas || '').split(',').map(x => x.trim()).filter(Boolean);
  out.owners = Object.assign({}, p.owners || {}); out.status = Object.assign({}, p.status || {}); out.notes = Object.assign({}, p.notes || {});
  const ids = new Set(out.sites.map(s => s.id));
  out.sites.forEach(s => { if (s.sendTo && !ids.has(s.sendTo)) s.sendTo = ''; });
  return out;
}
const siteById = id => R.sites.find(s => s.id === id);
const cloudById = id => R.clouds.find(c => c.id === id);
const waveIdx = id => Math.max(0, R.waves.findIndex(w => w.id === id));
const waveOf = id => R.waves[waveIdx(id)];
function waveDates() {
  const start = parseDate(R.meta.start) || new Date(); let t = start.getTime();
  return R.waves.map(w => { const a = new Date(t); t += w.weeks * 7 * DAY; return { start: a, end: new Date(t - 3 * DAY) }; });
}
function capsOf(s) { const c = {}; CAPS.forEach(k => { c[k] = s.caps.includes(k); }); c.bgp = s.bgp === 'proxy'; return c; }
function agentOf(s) {
  if (s.agent) return s;
  const t = s.sendTo && siteById(s.sendTo);
  if (t && t.agent) return t;
  const agents = R.sites.filter(a => a.agent);
  return agents.find(a => a.region === s.region && a.kind !== 'branch') || agents.find(a => a.kind !== 'branch') || agents[0] || null;
}
function sizing(caps, mode, L) {
  const rows = [];
  const add = (key, units, qty) => {
    const s = F.sizing[key];
    if (s.cpu == null) { rows.push({ label: s.label, qty, res: 'Not published', cpu: 0, ram: 0 }); return; }
    if (s.per && !units) qty = `Not given; KB baseline up to ${fmt(s.per)} ${s.unit}`;
    const n = s.per ? Math.max(1, Math.ceil(units / s.per)) : 1;
    if (n > 1 && s.estimate) qty += ' (scaled from the KB figure: confirm with Kentik)';
    rows.push({ label: s.label, qty, res: `${s.cpu} core${s.cpu > 1 ? 's' : ''} / ${s.ram} GB${n > 1 ? ' × ' + n : ''}`, cpu: s.cpu * n, ram: s.ram * n });
  };
  if (caps.flow) add(mode === 'edge' ? 'flow_edge' : 'flow_forward', L.fps, `${fmt(L.fps)} flows/s`);
  if (caps.snmp) add('snmp', L.dev, `${fmt(L.dev)} devices`);
  if (caps.syslog) add('syslog', L.eps, `${fmt(L.eps)} events/s`);
  if (caps.dns) add('dns', 0, 'per 400k lookups/s');
  if (caps.synth) add('synth', 1, 'per agent');
  if (caps.trap) add('trap', 1, 'event driven');
  if (caps.ssh) add('ssh', 1, 'per fetch interval');
  if (caps.bgp) add('bgp', 1, 'per agent');
  const cpu = rows.reduce((a, r) => a + r.cpu, 0), ram = rows.reduce((a, r) => a + r.ram, 0);
  return { rows, recCpu: Math.max(2, Math.ceil(cpu * (1 + F.headroom))), recRam: Math.max(2, Math.ceil(ram * (1 + F.headroom))) };
}
function capName(cid, mode) { return cid === 'flow' ? F.flowModes[mode === 'edge' ? 'edge' : 'forward'] : F.caps[cid].name; }
function linesOf(s) {
  const c = capsOf(agentOf(s) || s);
  const out = [];
  if (c.flow) out.push('flow');
  if (c.snmp || c.ssh) out.push('metrics');
  if (c.trap || c.syslog) out.push('events');
  if (s.agent && c.dns && s.dns > 0) out.push('dns');
  if (s.bgp !== 'off') out.push('bgp');
  if (s.agent && c.synth) out.push('tests');
  return out;
}

/* ---------- tasks ---------- */
function derive() {
  const T = []; const byId = {};
  const add = o => { const t = Object.assign({ deps: [], site: '', effort: 1, sub: '' }, o); T.push(t); byId[t.id] = t; return t; };
  const W0 = R.waves[0].id, WL = R.waves[R.waves.length - 1].id;
  const reg = F.regions[R.meta.region] || F.regions.US;
  add({ id: 'kickoff', team: 'se', wave: W0, title: 'Kickoff: confirm scope, Kentik region and contacts', sub: 'With every team on the call', effort: 0.5, kind: 'kickoff' });
  add({ id: 'portal', team: 'se', wave: W0, title: 'Set up the Kentik portal: users, SSO and sites', effort: 1, deps: ['kickoff'], kind: 'portal' });
  const agents = R.sites.filter(s => s.agent), feeds = R.sites.filter(s => !s.agent);
  const st = {};
  agents.forEach(a => {
    const L = { fps: a.fps, dev: a.devices, eps: a.eps };
    const fed = feeds.filter(f => agentOf(f) === a);
    fed.forEach(f => { L.fps += f.fps * f.count; L.dev += f.devices * f.count; L.eps += f.eps * f.count; });
    st[a.id] = { size: sizing(capsOf(a), a.flowMode, L), fed, load: L };
  });
  agents.forEach(a => {
    const c = capsOf(a); const w = a.wave; const n = a.count; const z = st[a.id].size; const many = n > 1;
    const where = many ? `${a.name} (${n} sites)` : a.name;
    add({ id: `host:${a.id}`, team: 'server', wave: w, site: a.id, title: `Build ${many ? n + ' agent hosts' : 'the agent host'} at ${where}`, sub: `${z.recCpu} vCPU, ${z.recRam} GB RAM, ${a.install === 'docker' ? 'Docker' : 'Linux'}${many ? ' each' : ''}`, effort: many ? 3 : 1, deps: ['kickoff'], kind: 'host' });
    add({ id: `egress:${a.id}`, team: 'security', wave: w, site: a.id, title: `Allow HTTPS 443 out from ${where} to Kentik`, sub: reg.hosts.slice(0, 3).join(', ') + '…', effort: 3, deps: ['kickoff'], kind: 'egress' });
    add({ id: `install:${a.id}`, team: 'se', wave: w, site: a.id, title: `Install and authorize ${many ? n + ' agents' : 'the agent'} at ${where}`, sub: CAPS.concat(['bgp']).filter(k => c[k]).map(k => capName(k, a.flowMode)).join(', '), effort: many ? 2 : 0.5, deps: [`host:${a.id}`, `egress:${a.id}`, 'portal'], kind: 'install' });
    const dep = [`install:${a.id}`];
    if (c.flow) add({ id: `flow:${a.id}`, team: 'network', wave: w, site: a.id, title: `Send flow from ${where} devices to the agent`, sub: 'NetFlow, sFlow or IPFIX to UDP 9995', effort: clamp(1 + a.devices * n / 150, 1, 8), deps: dep, kind: 'flow' });
    if (c.snmp) add({ id: `snmp:${a.id}`, team: 'network', wave: w, site: a.id, title: `Discover ${where} devices with SNMP`, sub: 'NMS Setup Wizard: IP ranges and credentials', effort: 1, deps: dep, kind: 'snmp' });
    if (c.trap || c.syslog) add({ id: `events:${a.id}`, team: 'network', wave: w, site: a.id, title: `Point ${[c.trap && 'traps', c.syslog && 'syslog'].filter(Boolean).join(' and ')} at the ${a.name} agent`, sub: [c.trap && 'UDP 162', c.syslog && 'UDP or TCP 514'].filter(Boolean).join(', '), effort: 1, deps: dep, kind: 'events' });
    if (a.bgp === 'direct') add({ id: `bgp:${a.id}`, team: 'network', wave: w, site: a.id, title: `Peer ${where} edge routers with Kentik`, sub: 'BGP on TCP 179, telemetry only', effort: 2, deps: ['portal'], kind: 'bgp' });
    if (a.bgp === 'proxy') add({ id: `bgp:${a.id}`, team: 'network', wave: w, site: a.id, title: `Peer ${where} edge routers with the agent (BGP Proxy)`, sub: 'BGP on TCP 179 to the agent', effort: 2, deps: dep, kind: 'bgpproxy' });
    if (c.dns && a.dns > 0) add({ id: `dns:${a.id}`, team: 'dns', wave: w, site: a.id, title: `Stream DNSTAP from ${where} DNS servers to the agent`, sub: `${plural(a.dns * n, 'DNS server')}, for example Infoblox NIOS`, effort: 1, deps: dep, kind: 'dns' });
    if (c.ssh) add({ id: `ssh:${a.id}`, team: 'network', wave: w, site: a.id, title: `Create read-only SSH accounts at ${where}`, sub: 'For Device Configuration Sync', effort: 1, deps: dep, kind: 'ssh' });
  });
  feeds.forEach(f => {
    const a = agentOf(f); const where = f.count > 1 ? `${f.name} (${f.count} sites)` : f.name;
    if (!a) return;
    add({ id: `wan:${f.id}`, team: 'security', wave: f.wave, site: f.id, title: `Allow ${where} devices to reach the ${a.name} agent across the WAN`, sub: 'Flow, traps and syslog in; SNMP polling out', effort: 3, deps: ['kickoff'], kind: 'wan' });
    add({ id: `feed:${f.id}`, team: 'network', wave: f.wave, site: f.id, title: `Point ${where} devices at the ${a.name} agent`, sub: `${plural(f.devices * f.count, 'device')}: flow, traps, syslog and SNMP`, effort: clamp(1 + f.count * f.devices / 120, 1, 15), deps: [`wan:${f.id}`, `install:${a.id}`], kind: 'feed' });
  });
  R.clouds.forEach(c => {
    const p = c.provider; const w = c.wave; const nm = c.name;
    const regions = c.regions.split(',').map(x => x.trim()).filter(Boolean);
    const logs = { aws: `Turn on flow logs to S3${regions.length ? ` in ${regions.join(', ')}` : ''}`, azure: 'Turn on VNet flow logs to a storage account', gcp: 'Send VPC flow logs to Pub/Sub', oci: 'Send VCN flow logs to an Object Storage bucket' }[p];
    const access = { aws: `Create the read-only IAM role for Kentik${c.accounts > 1 ? ` (primary plus ${c.accounts - 1} secondary)` : ''}`, azure: 'Authorize the Kentik app and give it read-only roles', gcp: 'Give Kentik\'s service account read-only roles', oci: 'Give Kentik read access with a policy' }[p];
    if (c.feats.flow) add({ id: `c-logs:${c.id}`, team: 'cloud', wave: w, site: c.id, title: `${nm}: ${logs}`, sub: c.feats.firewall ? 'Firewall logs too' : '', effort: 1 + (c.accounts > 1 ? 1 : 0), deps: ['kickoff'], kind: 'c-logs' });
    add({ id: `c-access:${c.id}`, team: 'cloud', wave: w, site: c.id, title: `${nm}: ${access}`, sub: F.clouds[p].grant_who, effort: 1 + (c.accounts > 1 ? 1 : 0), deps: ['kickoff'], kind: 'c-access' });
    add({ id: `c-export:${c.id}`, team: 'se', wave: w, site: c.id, title: `${nm}: create and verify the cloud export in Kentik`, sub: c.feats.flow ? 'Flow logs and metadata' : 'Metadata only', effort: 0.5, deps: [c.feats.flow ? `c-logs:${c.id}` : null, `c-access:${c.id}`, 'portal'].filter(Boolean), kind: 'c-export' });
  });
  const synthAgents = agents.filter(a => capsOf(a).synth);
  if (R.tests.on) {
    const tw = R.tests.wave; const nA = synthAgents.reduce((t, a) => t + a.count, 0);
    if (nA >= 2) add({ id: 't-ports', team: 'security', wave: tw, title: 'Open TCP 8877 and UDP 9977 between the test agents', sub: synthAgents.map(a => a.name).join(', '), effort: 3, deps: ['kickoff'], kind: 't-ports' });
    add({ id: 't-tests', team: 'se', wave: tw, title: `Create the synthetic tests${R.tests.saas.length ? ': ' + R.tests.saas.join(', ') : ''}`, sub: nA >= 2 ? `Agent mesh between ${nA} agents, plus app tests` : 'App tests from Kentik global agents' + (nA ? ' and one site agent' : ''), effort: 1, deps: synthAgents.map(a => `install:${a.id}`).concat(nA >= 2 ? ['t-ports'] : []), kind: 't-tests' });
  }
  add({ id: 'validate', team: 'se', wave: WL, title: 'Validate the data with the customer', sub: 'Flow within about 20% of SNMP interface traffic', effort: 2, deps: T.filter(t => ['flow', 'feed', 'c-export'].includes(t.kind)).map(t => t.id), kind: 'validate' });
  add({ id: 'handover', team: 'se', wave: WL, title: 'Dashboards, alerts and training; hand over', sub: 'Go-live', effort: 2, deps: ['validate'], kind: 'handover' });
  // stations: what goes live, and when
  const S = [];
  R.sites.forEach(s => S.push({ id: s.id, t: 'site', wave: s.wave, ref: s }));
  R.clouds.forEach(c => S.push({ id: c.id, t: 'cloud', wave: c.wave, ref: c }));
  const tasksOf = id => T.filter(t => t.site === id);
  // effort chains inside each wave: a task starts when its dependencies in the same wave are done
  const ef = {};
  const finish = t => { if (ef[t.id] != null) return ef[t.id]; ef[t.id] = 0; const d = t.deps.map(id => byId[id]).filter(x => x && x.wave === t.wave); ef[t.id] = t.effort + (d.length ? Math.max(...d.map(finish)) : 0); return ef[t.id]; };
  T.forEach(finish);
  X = { tasks: T, byId, stations: S, tasksOf, st, ef, agents, feeds, synthAgents };
  X.checks = checks();
  return X;
}
const statusOf = id => R.status[id] || 'todo';
function stationState(s) {
  if (mode === 'progress') {
    const ts = X.tasksOf(s.id); if (!ts.length) return 'planned';
    if (ts.some(t => statusOf(t.id) === 'blocked')) return 'blocked';
    if (ts.every(t => statusOf(t.id) === 'done')) return 'live';
    return ts.some(t => statusOf(t.id) !== 'todo') ? 'now' : 'planned';
  }
  const wi = waveIdx(s.wave) + 1;
  return wi < pos ? 'live' : wi === pos ? 'now' : 'planned';
}

/* ---------- plan checks ---------- */
function checks() {
  const out = [];
  const add = (sev, text, target, fix) => out.push({ sev, text, target, fix });
  const dates = waveDates();
  if (!R.sites.length && !R.clouds.length) add('info', 'The plan is empty. Add sites and clouds on the left, or open a starter.');
  if (R.sites.length && !X.agents.length) add('error', 'No site has a Universal Agent, so no on-prem data can reach Kentik.', R.sites[0].id, { label: `Put an agent at ${R.sites[0].name}`, run: () => { R.sites[0].agent = true; } });
  X.feeds.forEach(f => {
    const a = agentOf(f); if (!a) return;
    if (waveIdx(f.wave) < waveIdx(a.wave)) add('error', `${f.name} is in ${waveOf(f.wave).name}, but its agent at ${a.name} comes in ${waveOf(a.wave).name}. Its devices have nothing to send to until then.`, f.id, { label: `Move ${f.name} to ${waveOf(a.wave).name}`, run: () => { f.wave = a.wave; } });
  });
  if (R.tests.on) {
    const live = X.synthAgents.filter(a => waveIdx(a.wave) <= waveIdx(R.tests.wave)).reduce((t, a) => t + a.count, 0);
    const all = X.synthAgents.reduce((t, a) => t + a.count, 0);
    if (all >= 2 && live < 2) {
      const sorted = X.synthAgents.slice().sort((a, b) => waveIdx(a.wave) - waveIdx(b.wave)); const need = sorted[Math.min(1, sorted.length - 1)];
      add('warn', `Synthetic tests start in ${waveOf(R.tests.wave).name}, but fewer than two test agents are live by then, so there is no agent mesh yet.`, 'tests', { label: `Move the tests to ${waveOf(need.wave).name}`, run: () => { R.tests.wave = need.wave; } });
    }
    if (!all) add('info', 'No site agent runs Connectivity Test, so apps are tested only from Kentik\'s global agents. Users\' experience from the sites is not measured.', 'tests');
  }
  const secAll = X.tasks.filter(t => t.team === 'security');
  if (secAll.length >= 3) add('warn', `The security team has ${plural(secAll.length, 'firewall change')} in this plan (${R.waves.map((w, i) => `wave ${i + 1}: ${secAll.filter(t => t.wave === w.id).length}`).join(', ')}). Raise them all at kickoff: change windows often take a week or more.`, null);
  R.waves.forEach((w, i) => {
    const ts = X.tasks.filter(t => t.wave === w.id);
    const chain = Math.max(0, ...ts.map(t => X.ef[t.id]));
    if (chain > w.weeks * 5) add('warn', `${w.name} needs about ${fmt1(chain)} working days of work in sequence (host, firewall change, install, device setup), but it is ${plural(w.weeks, 'week')} long (${w.weeks * 5} working days).`, null, { label: `Make ${w.name} ${Math.ceil(chain / 5)} weeks`, run: () => { w.weeks = Math.ceil(chain / 5); } });
    if (ts.length > 30) add('info', `${w.name} has ${ts.length} tasks. Think about two smaller waves.`, null);
  });
  X.agents.filter(a => a.count >= 10).forEach(a => add('info', `${a.name}: ${a.count} agents to install. Use provisioning tokens and the API, not the portal one by one.`, a.id));
  X.agents.filter(a => a.bgp === 'proxy').slice(0, 1).forEach(a => add('warn', F.openItemBgpProxy, a.id));
  R.clouds.filter(c => c.provider === 'aws' && c.accounts > 1).forEach(c => add('info', `${c.name}: ${c.accounts} accounts. Kentik assumes one primary role, which assumes a secondary role in each other account.`, c.id));
  const end = dates[dates.length - 1].end;
  if (!out.some(o => o.sev !== 'info') && R.sites.length) add('ok', `The plan holds together. Go-live is planned for ${fmtDateY(end)}.`, null);
  return out.sort((a, b) => ({ error: 0, warn: 1, info: 2, ok: 3 }[a.sev] - { error: 0, warn: 1, info: 2, ok: 3 }[b.sev]));
}

/* ---------- map ---------- */
function layoutMap() {
  const agents = R.sites.filter(s => s.agent), feeds = R.sites.filter(s => !s.agent);
  const bands = [];
  const order = Object.keys(REGIONS).filter(r => R.sites.some(s => s.region === r));
  const XB = 250, XH = 600, ROWH = 96, ROWF = 66, TOP = 24;
  let y = TOP; const at = {};
  order.forEach(r => {
    const top = y; y += 40;
    const hubs = agents.filter(a => a.region === r).sort((a, b) => waveIdx(a.wave) - waveIdx(b.wave));
    const fs = feeds.filter(f => f.region === r);
    let yH = y, yF = y; const placed = new Set();
    hubs.forEach(h => {
      const mine = fs.filter(f => agentOf(f) === h);
      const hy = Math.max(yH, yF + (mine.length ? (mine.length - 1) * ROWF / 2 : 0));
      at[h.id] = { x: XH, y: hy };
      mine.forEach((f, i) => { at[f.id] = { x: XB, y: hy - (mine.length - 1) * ROWF / 2 + i * ROWF }; placed.add(f.id); });
      yH = hy + ROWH; yF = mine.length ? hy + (mine.length - 1) * ROWF / 2 + ROWF : Math.max(yF, hy);
    });
    fs.filter(f => !placed.has(f.id)).forEach(f => { at[f.id] = { x: XB, y: Math.max(yF, y) }; yF = at[f.id].y + ROWF; });
    y = Math.max(yH, yF) + 8;
    bands.push({ id: r, label: REGIONS[r], y: top, h: y - top });
    y += 12;
  });
  if (R.clouds.length) {
    const top = y; y += 40;
    R.clouds.forEach((c, i) => { at[c.id] = { x: XH, y: y + i * 84 }; });
    y += R.clouds.length * 84;
    bands.push({ id: 'cloud', label: 'Public cloud', y: top, h: y - top }); y += 12;
  }
  const XT = 860, H = Math.max(y + 10, 360);
  return { pos: at, bands, XB, XH, XT, W: XT + 210, H };
}
function lanePath(x1, y1, x2, y2, off) {
  y1 += off; y2 += off;
  if (Math.abs(y2 - y1) < 1) return `M${x1},${y1} H${x2}`;
  const dy = Math.abs(y2 - y1); const mid = (x1 + x2) / 2; const half = Math.min(dy / 2, (x2 - x1) / 2 - 6);
  return `M${x1},${y1} H${mid - half} L${mid + half},${y2} H${x2}`;
}
function renderMap() {
  const L = layoutMap(); const P = L.pos;
  const reg = F.regions[R.meta.region] || F.regions.US;
  let bands = '', lines = '', stations = '';
  L.bands.forEach(b => { bands += `<g class="band"><rect x="12" y="${b.y}" width="${L.XT - 40}" height="${b.h}" rx="16"/><text x="30" y="${b.y + 24}">${esc(b.label)}</text></g>`; });
  const laneOff = (i, n) => (i - (n - 1) / 2) * 6;
  const trackCls = (state, line) => `trk t-${line}${state === 'planned' ? ' planned' : state === 'now' && !REDUCED ? ' now' : ''}`;
  const hov = hoverSt || (sel && (sel.t === 'site' || sel.t === 'cloud') ? sel.id : null);
  const lineG = (id, inner) => `<g class="line-g${hov && hov !== id && !relatedTo(hov, id) ? ' dim' : ''}" data-st="${id}">${inner}</g>`;
  R.sites.filter(s => s.agent).forEach(a => {
    const p = P[a.id]; if (!p) return; const ls = linesOf(a).filter(l => !hiddenLines.has(l)); const state = stationState(a);
    lines += lineG(a.id, ls.map((l, i) => `<path class="${trackCls(state, l)}" d="${lanePath(p.x + 18, p.y, L.XT, p.y, laneOff(i, ls.length))}"/>`).join(''));
  });
  R.sites.filter(s => !s.agent).forEach(f => {
    const p = P[f.id]; const a = agentOf(f); if (!p || !a || !P[a.id]) return;
    const q = P[a.id]; const ls = linesOf(f).filter(l => !hiddenLines.has(l)); const state = stationState(f);
    const x2 = q.x - 18; const back = q.x <= p.x; const x1 = p.x + (f.count > 1 ? 27 : 12);
    lines += lineG(f.id, ls.map((l, i) => `<path class="${trackCls(state, l)}" d="${back ? `M${x1},${p.y + laneOff(i, ls.length)} H${x2}` : lanePath(x1, p.y, x2, q.y, laneOff(i, ls.length))}"/>`).join(''));
  });
  R.clouds.forEach(c => {
    const p = P[c.id]; if (!p || hiddenLines.has('cloud')) return; const state = stationState(c);
    lines += lineG(c.id, `<path class="${trackCls(state, 'cloud')}" d="M${p.x + 22},${p.y} H${L.XT}"/>`);
  });
  const dates = waveDates();
  const stn = (o, inner, label, sub, labelSide) => {
    const state = stationState(o.ref || o);
    const isSel = sel && sel.id === o.id;
    const lx = labelSide === 'left' ? -34 : 0, ly = labelSide === 'left' ? -2 : -26, anchor = labelSide === 'left' ? 'end' : 'middle';
    const tick = o.t === 'site' && !(o.ref && o.ref.count > 1) ? '<path class="tick" d="M-5,0 l3.5,3.5 l6.5,-7"/>' : '';
    return `<g class="stn ${state}${isSel ? ' sel' : ''}${tick ? '' : ' notick'}" data-id="${o.id}" data-t="${o.t}" transform="translate(${o.x},${o.y})" tabindex="0" role="button" aria-label="${esc(label)}, ${esc(sub)}, ${state === 'live' ? 'live' : state === 'now' ? 'in this wave' : state === 'blocked' ? 'blocked' : 'planned'}">${inner}${tick}<text class="nm" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(label)}</text><text class="sub" x="${lx}" y="${labelSide === 'left' ? ly + 15 : 31}" text-anchor="${anchor}">${esc(sub)}</text></g>`;
  };
  R.sites.forEach(s => {
    const p = P[s.id]; if (!p) return;
    const w = waveOf(s.wave); const nT = X.tasksOf(s.id).length;
    const sub = `${w.name} · ${fmtDate(dates[waveIdx(s.wave)].start)}${nT ? ` · ${plural(nT, 'task')}` : ''}`;
    const inner = s.count > 1
      ? `<circle class="halo" r="16"/><rect class="dot" x="-26" y="-13" width="52" height="26" rx="13"/><text class="cnt" y="4" text-anchor="middle">×${fmt(s.count)}</text>`
      : `<circle class="halo" r="16"/><circle class="dot" r="${s.agent ? 15 : 11}"/>`;
    const label = s.name + (s.agent ? '' : '');
    stations += stn({ id: s.id, t: 'site', x: p.x, y: p.y, ref: s }, inner, label, sub, s.agent ? 'top' : 'left');
  });
  R.clouds.forEach(c => {
    const p = P[c.id]; const w = waveOf(c.wave);
    const inner = `<circle class="halo" r="16"/><rect class="dot" x="-17" y="-17" width="34" height="34" rx="9"/><text y="4" text-anchor="middle" style="font-size:10px;font-weight:700;fill:${PROV[c.provider].color}">${esc(PROV[c.provider].short)}</text>`;
    stations += stn({ id: c.id, t: 'cloud', x: p.x, y: p.y, ref: c }, inner, c.name, `${w.name} · ${plural(c.accounts, PROV[c.provider].unit)}`, 'top');
  });
  const tTop = 30, tH = L.H - 50;
  const term = `<g class="term"><rect x="${L.XT}" y="${tTop}" width="170" height="${tH}" rx="18"/><g transform="translate(${L.XT + 20},${tTop + 22}) scale(1.5)"><use href="#i-ib" width="15.924" height="15.924" style="color:#00bd4d"/></g><text class="tt" x="${L.XT + 20}" y="${tTop + 70}">Kentik SaaS</text><text class="ts" x="${L.XT + 20}" y="${tTop + 88}">${esc(R.meta.region)} cluster</text><text class="ts" x="${L.XT + 20}" y="${tTop + 104}">${esc(reg.label.replace(/^.*\(|\)$/g, ''))}</text>${R.tests.on && R.tests.saas.length ? `<text class="ts" x="${L.XT + 20}" y="${tTop + tH - 40}">Tests to</text><text class="ts" x="${L.XT + 20}" y="${tTop + tH - 24}">${esc(R.tests.saas.slice(0, 2).join(', '))}${R.tests.saas.length > 2 ? '…' : ''}</text>` : ''}</g>`;
  const empty = !R.sites.length && !R.clouds.length ? `<text x="${L.XT / 2}" y="${L.H / 2}" text-anchor="middle" style="font-size:15px;fill:var(--muted)">Add sites and clouds on the left, or open a starter.</text>` : '';
  $('#mapwrap').innerHTML = `<svg viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Rollout map">${bands}<g>${lines}</g>${term}<g>${stations}</g>${empty}</svg>`
  $('#legend').innerHTML = `${LINES.map(l => `<span data-line="${l.id}" class="${hiddenLines.has(l.id) ? 'off' : ''}" title="Show or hide this line"><i style="background:var(--t-${l.id})"></i>${esc(l.label)}</span>`).join('')}<span title="Not live yet at this point of the timeline"><i class="pl"></i>Planned</span><span title="Work happens in this wave"><i class="nowk"></i>In this wave</span>`;
}
function relatedTo(a, b) {
  const sa = siteById(a), sb = siteById(b);
  if (sa && sb) return (!sb.agent && agentOf(sb) === sa) || (!sa.agent && agentOf(sa) === sb);
  return false;
}
function renderKpis() {
  const n = R.waves.length; const dates = waveDates();
  const live = s => stationState(s) === 'live';
  const sitesAll = R.sites.reduce((t, s) => t + s.count, 0), sitesLive = R.sites.filter(live).reduce((t, s) => t + s.count, 0);
  const devAll = R.sites.reduce((t, s) => t + s.devices * s.count, 0), devLive = R.sites.filter(live).reduce((t, s) => t + s.devices * s.count, 0);
  const cl = R.clouds.filter(live).length;
  const tDone = mode === 'progress' ? X.tasks.filter(t => statusOf(t.id) === 'done').length : X.tasks.filter(t => waveIdx(t.wave) + 1 < pos).length;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const k = (big, label, a, b) => `<div class="kpi"><b>${big}</b><span>${label}</span><div class="bar"><i style="width:${pct(a, b)}%"></i></div></div>`;
  const when = mode === 'progress' ? 'Real progress from the task status' : pos === 0 ? `Before the start · ${fmtDate(dates[0].start)}` : pos > n ? `Live · ${fmtDateY(dates[n - 1].end)}` : `During ${R.waves[pos - 1].name}`;
  $('#kpis').innerHTML = k(`${fmt(sitesLive)} / ${fmt(sitesAll)}`, 'sites live', sitesLive, sitesAll) + k(`${fmt(devLive)} / ${fmt(devAll)}`, 'devices in Kentik', devLive, devAll)
    + k(`${cl} / ${R.clouds.length}`, 'clouds live', cl, R.clouds.length) + k(`${fmt(tDone)} / ${fmt(X.tasks.length)}`, mode === 'progress' ? 'tasks done' : 'tasks done by then', tDone, X.tasks.length)
  ;
}
function renderTimeline() {
  const n = R.waves.length; const dates = waveDates();
  const chip = (p, cls, title, sub, grow) => `<button type="button" class="wv ${cls}" data-pos="${p}" style="flex:${grow}" title="${esc(title + ': ' + sub)}"><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
  let h = chip(0, 'start' + (pos === 0 ? ' cur' : pos > 0 ? ' done' : ''), 'Start', fmtDate(dates[0].start), '0 0 74px');
  R.waves.forEach((w, i) => {
    const p = i + 1; const sites = R.sites.filter(s => s.wave === w.id).reduce((t, s) => t + s.count, 0) + R.clouds.filter(c => c.wave === w.id).length;
    const nt = X.tasks.filter(t => t.wave === w.id).length;
    const cls = mode === 'progress' ? '' : pos === p ? 'cur' : pos > p ? 'done' : '';
    h += chip(p, cls, `${i + 1}. ${w.name}`, `${fmtDate(dates[i].start)} – ${fmtDate(dates[i].end)} · ${plural(sites, 'site')} · ${plural(nt, 'task')}`, `${w.weeks} 1 0`);
  });
  h += chip(n + 1, 'start' + (pos === n + 1 && mode === 'plan' ? ' cur' : ''), 'Go-live', fmtDate(dates[n - 1].end), '0 0 84px');
  if (!BOOK_ONLY) h += `<button type="button" class="wv add" data-act="addWave" title="Add a wave">${ic('i-plus')}</button>`;
  const weeks = R.waves.reduce((t, w) => t + w.weeks, 0);
  const when = mode === 'progress' ? 'Real progress, from the task status' : pos === 0 ? 'Before the start' : pos > n ? 'After go-live' : `During wave ${pos}: ${R.waves[pos - 1].name}`;
  $('#timeline').innerHTML = `<button type="button" class="play" id="playBtn" title="Play the rollout (key P)" aria-label="${playing ? 'Pause' : 'Play the rollout'}">${ic(playing ? 'i-pause' : 'i-play')}</button><div class="tl"><div class="tlh"><span><b>${esc(when)}</b> · ${plural(n, 'wave')}, ${plural(weeks, 'week')}, ${fmtDate(dates[0].start)} to ${fmtDateY(dates[n - 1].end)}</span><span class="seg mini"><button type="button" data-mode="plan" aria-pressed="${mode === 'plan'}" title="What is live at each point of the timeline">Plan</button><button type="button" data-mode="progress" aria-pressed="${mode === 'progress'}" title="What is live from the real task status">Progress</button></span></div><div class="waves">${h}</div></div>`;
}
function play() {
  if (playing) { clearInterval(playing); playing = null; renderTimeline(); return; }
  mode = 'plan'; if (pos > R.waves.length) pos = 0;
  const step = () => { pos++; renderMapView(); if (pos > R.waves.length) { clearInterval(playing); playing = null; renderTimeline(); } };
  playing = setInterval(step, REDUCED ? 600 : 1400); step();
}

/* ---------- plan board ---------- */
function renderPlan() {
  const dates = waveDates();
  const teams = TEAM_ORDER.filter(t => X.tasks.some(x => x.team === t));
  const cols = `124px repeat(${R.waves.length}, minmax(168px, 1fr))`;
  let h = `<div class="risks">${X.checks.map((c, i) => `<div class="risk ${c.sev}">${ic(c.sev === 'ok' ? 'i-check' : c.sev === 'info' ? 'i-info' : 'i-alert')}<div style="flex:1">${esc(c.text)}${c.fix && !BOOK_ONLY ? ` <button type="button" class="tbtn small" data-fix="${i}" style="margin-left:6px">${esc(c.fix.label)}</button>` : ''}</div></div>`).join('')}</div>`;
  h += `<div class="board" style="grid-template-columns:${cols}"><div></div>`;
  R.waves.forEach((w, i) => { const ts = X.tasks.filter(t => t.wave === w.id); const done = ts.filter(t => statusOf(t.id) === 'done').length; h += `<div class="bh">${i + 1}. ${esc(w.name)}<small>${fmtDate(dates[i].start)} – ${fmtDate(dates[i].end)} · ${done}/${ts.length} done</small></div>`; });
  teams.forEach(tm => {
    const ts = X.tasks.filter(t => t.team === tm);
    h += `<div class="bt" style="--team:var(--team-${tm})">${esc(TEAMS[tm].label)}<small>${R.owners[tm] ? esc(R.owners[tm]) + ' · ' : ''}${ts.filter(t => statusOf(t.id) === 'done').length}/${ts.length} done</small></div>`;
    R.waves.forEach(w => {
      h += `<div class="cell">${ts.filter(t => t.wave === w.id).map(t => `<div class="task ${statusOf(t.id)}${sel && sel.t === 'task' && sel.id === t.id ? ' sel' : ''}" style="--team:var(--team-${tm})" data-task="${esc(t.id)}"><div class="tt">${esc(t.title)}</div><div class="tm"><span class="st ${statusOf(t.id)}">${STATUS[statusOf(t.id)]}</span><span>${fmt1(t.effort)} d</span></div></div>`).join('')}</div>`;
    });
  });
  h += '</div>';
  $('#planView').innerHTML = h;
}

/* ---------- task details ---------- */
function stepsList(a) { return `<ol class="steps">${a.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`; }
function rulesList(rules) { return rules.map(r => `<div class="rule"><div><b>${esc(r.port)}</b> · ${esc(r.why)}<div class="ft">${esc(r.src)} → ${esc(r.dst)}</div></div></div>`).join(''); }
function installSteps(s) {
  const c = capsOf(s); const list = CAPS.concat(['bgp']).filter(k => c[k]).map(k => capName(k, s.flowMode)).join(', ');
  return F.installSteps.map(t => t.replace('{method}', s.install === 'docker' ? 'Docker' : 'Linux').replace('{hostname_note}', s.install === 'docker' ? 'Docker container ID' : 'server host name').replace('{site}', s.name).replace('{caps}', list || 'none'));
}
function cloudSteps(c, part) {
  const p = c.provider; let all;
  if (p === 'aws') all = F.aws.steps.map(t => t.replace('{fw}', c.feats.firewall ? ' and Network Firewall' : ''));
  else if (p === 'azure') all = F.azure.steps.map(t => t.replace('{fw}', c.feats.firewall ? 'Send Azure Firewall diagnostic logs to the same storage account.' : '').replace('{auth}', F.azure.auth.enterprise)).filter(Boolean);
  else if (p === 'oci') all = F.oci.steps.map(t => t.replace('{access}', F.oci.access.cross_tenancy));
  else all = F.gcp.steps.slice();
  const cut = { aws: { logs: [1, 4], access: [4, 5], export: [5, 8] }, azure: { logs: [0, 3], access: [3, 4], export: [4, 7] }, gcp: { logs: [0, 3], access: [3, 5], export: [5, 7] }, oci: { logs: [0, 3], access: [3, 4], export: [4, 7] } }[p][part];
  return all.slice(cut[0], cut[1]).concat(part === 'export' && p === 'aws' ? [all[0]] : []);
}
function taskBody(t) {
  const s = siteById(t.site), c = cloudById(t.site); const reg = F.regions[R.meta.region] || F.regions.US;
  switch (t.kind) {
    case 'kickoff': return `<p>Agree on these before the first wave starts:</p>${stepsList([`Kentik region: ${reg.label}. It is fixed when the contract is signed.`, 'One contact in each team below, and who approves firewall changes.', 'Change windows for firewall rules and device changes in each wave.', `Scope: ${plural(R.sites.reduce((a, x) => a + x.count, 0), 'site')} and ${plural(R.clouds.length, 'cloud')} in ${plural(R.waves.length, 'wave')}.`])}`;
    case 'portal': return stepsList(['Invite the users. Set up SAML 2.0 SSO and MFA if the customer uses them.', 'Create one Kentik site per location in this plan, so agents and devices land in the right place.', 'Share the Kentik region hosts with the security team for the HTTPS 443 rules.']) + `<dl class="kv">${F.security.slice(0, 5).map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`;
    case 'host': { const z = X.st[s.id].size; return `<div class="size"><div class="big">${z.recCpu} vCPU · ${z.recRam} GB RAM${s.count > 1 ? ' each' : ''}</div><div class="note">Includes ${Math.round(F.headroom * 100)}% headroom. Install on ${s.install === 'docker' ? 'Docker' : 'a Linux host'}.</div></div><table class="tbl"><tbody>${z.rows.map(r => `<tr><td>${esc(r.label)}<div class="note">${esc(r.qty)}</div></td><td class="num">${esc(r.res)}</td></tr>`).join('')}</tbody></table><p class="note">Supported: ${esc(F.os.supported.join('; '))}. ${esc(F.os.unsupported)}</p>${X.st[s.id].fed.length ? `<p class="note">This agent also serves ${X.st[s.id].fed.map(f => esc(f.name) + (f.count > 1 ? ` (×${f.count})` : '')).join(', ')}.</p>` : ''}`; }
    case 'egress': return `<p>Allow outbound TCP 443 (TLS 1.2+) from the agent${s.count > 1 ? 's' : ''} to:</p><pre class="code">${esc(reg.hosts.join('\n'))}</pre><ul class="srcs">${F.egressNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
    case 'install': return stepsList(installSteps(s)) + `<p class="note">${esc(F.proxy[s.install])}</p>` + (s.count > 1 ? `<p class="note">${esc(F.apiNote.replace(/\{domain\}/g, reg.domain))}</p>` : '');
    case 'flow': return stepsList(F.caps.flow.setup) + `<p class="note">About ${plural(s.devices * s.count, 'device')} at this site.</p>`;
    case 'snmp': return stepsList(F.caps.snmp.setup);
    case 'events': return stepsList(F.caps.trap.setup.concat(F.caps.syslog.setup));
    case 'bgp': return stepsList(F.bgp.steps) + `<p class="note">The security team must allow TCP 179 from the edge routers to the Kentik ingest peering IPs (shown in device settings).</p>`;
    case 'bgpproxy': return stepsList(F.caps.bgp.setup);
    case 'dns': return stepsList(F.caps.dns.setup);
    case 'ssh': return stepsList(F.caps.ssh.setup);
    case 'wan': { const a = agentOf(s); const cc = capsOf(a); const who = s.count > 1 ? `Devices at each of the ${s.count} ${s.name} sites` : `${s.name} devices`; const ag = `${a.name} agent`; const r = [];
      if (cc.flow) r.push({ src: who, dst: ag, port: 'UDP 9995', why: 'Flow export' });
      if (cc.trap) r.push({ src: who, dst: ag, port: 'UDP 162', why: 'SNMP traps' });
      if (cc.syslog) r.push({ src: who, dst: ag, port: 'UDP and TCP 514', why: 'Syslog' });
      if (cc.snmp) r.push({ src: ag, dst: who, port: 'UDP 161, ICMP', why: 'SNMP/ST polling' });
      if (cc.ssh) r.push({ src: ag, dst: who, port: 'TCP 22', why: 'Device Configuration Sync' });
      return `<p>Open these on the firewalls between ${esc(s.name)} and ${esc(a.name)}:</p>${rulesList(r)}`; }
    case 'feed': { const a = agentOf(s); return stepsList([`Export flow from each router, switch and firewall to the ${a.name} agent IP on UDP 9995. Sample ingress on every interface.`, `Send SNMP traps to the agent on UDP 162 and syslog on UDP or TCP 514, if the agent has those capabilities.`, `In the NMS Setup Wizard, pick the ${a.name} agent and add the ${s.name} IP ranges and SNMP credentials.`, s.count > 1 ? `Use one configuration template for all ${s.count} sites.` : 'Check the devices show up in Kentik with flow and SNMP.']); }
    case 'c-logs': return stepsList(cloudSteps(c, 'logs'));
    case 'c-access': return stepsList(cloudSteps(c, 'access')) + (c.provider === 'aws' ? `<p><b>Trust policy</b></p><pre class="code">${esc(F.aws.trust)}</pre>${c.accounts > 1 ? `<p><b>${c.accounts} accounts</b></p>${stepsList(F.aws.nested)}` : ''}` : c.provider === 'gcp' ? `<p class="note">Service account: ${esc(F.gcp.sa)}</p>` : c.provider === 'oci' ? `<pre class="code">${esc(F.oci.userPolicy)}</pre>` : '') + `<p class="note">${esc(F.clouds[c.provider].grant_what)}</p>`;
    case 'c-export': return stepsList(cloudSteps(c, 'export')) + `<p class="note">${esc(F.clouds[c.provider].summary)}</p>`;
    case 't-ports': return `<p>Open TCP 8877 and UDP 9977 in both directions between every pair of these agents: ${esc(X.synthAgents.map(a => a.name).join(', '))}.</p>`;
    case 't-tests': { const cr = F.synthCredits; const n = X.synthAgents.reduce((a, x) => a + x.count, 0); const apps = R.tests.saas.length; const mesh = n >= 2 ? n * (n - 1) * cr.private_subtest * cr.runs_per_month_1min : 0; const http = apps ? apps * (n * 5 * cr.http_private_per_s + 3 * 5 * cr.http_global_per_s) * cr.runs_per_month_1min / 5 : 0;
      return stepsList(F.caps.synth.setup.slice(2)) + `<table class="tbl"><tbody>${mesh ? `<tr><td>Mesh between ${n} agents, every minute</td><td class="num">${fmt(mesh)}</td></tr>` : ''}${http ? `<tr><td>HTTP(S) tests to ${plural(apps, 'app')} every 5 minutes</td><td class="num">${fmt(http)}</td></tr>` : ''}<tr><td><b>Test credits per month (estimate)</b></td><td class="num"><b>${fmt(mesh + http)}</b></td></tr></tbody></table>`; }
    case 'validate': return stepsList(['Compare flow volume with SNMP interface traffic for a few busy interfaces: it should be within about 20%.', 'Check that every device sends flow at the sample rate set for it in Kentik.', 'Check each cloud export shows flow (a metadata-only export always shows a red flow status).', 'Walk through the first dashboards with the customer.']);
    case 'handover': return stepsList(['Build the dashboards and saved views each team asked for.', 'Set up alerts and their notification channels.', 'Train the users, and agree on who owns Kentik day to day.', 'Close the open questions below with the Kentik account team.']) + `<ul class="srcs">${F.openItems.map(o => `<li>${esc(o)}</li>`).join('')}</ul>`;
  }
  return '';
}

/* ---------- workbook ---------- */
function renderBook() {
  const dates = waveDates(); const n = R.waves.length;
  const teams = TEAM_ORDER.filter(t => X.tasks.some(x => x.team === t));
  const done = X.tasks.filter(t => statusOf(t.id) === 'done').length;
  let h = `<div class="book"><p class="eyebrow">Rollout workbook · Infoblox + Kentik</p><h2>${esc(R.meta.customer)}</h2><p class="meta">${esc(R.meta.project)} · ${plural(n, 'wave')} from ${fmtDateY(dates[0].start)} to go-live on ${fmtDateY(dates[n - 1].end)} · ${done} of ${X.tasks.length} tasks done${R.meta.preparedBy ? ' · Prepared by ' + esc(R.meta.preparedBy) : ''}</p>`;
  h += `<div class="tprog">${teams.map(tm => { const ts = X.tasks.filter(t => t.team === tm); const d = ts.filter(t => statusOf(t.id) === 'done').length; return `<div class="tp" style="--team:var(--team-${tm})" data-jump="${tm}"><b>${esc(TEAMS[tm].label)}</b><small>${R.owners[tm] ? esc(R.owners[tm]) + ' · ' : ''}${d} of ${ts.length} done</small><div class="bar"><i style="width:${ts.length ? d / ts.length * 100 : 0}%"></i></div></div>`; }).join('')}</div>`;
  teams.forEach(tm => {
    const ts = X.tasks.filter(t => t.team === tm);
    h += `<section class="team-sec" id="team-${tm}" style="--team:var(--team-${tm})"><h3>${esc(TEAMS[tm].label)}${R.owners[tm] ? ` <span class="note" style="font-weight:500">· ${esc(R.owners[tm])}</span>` : ''}</h3><p>${esc(TEAMS[tm].who)}</p>`;
    R.waves.forEach((w, i) => {
      const wt = ts.filter(t => t.wave === w.id); if (!wt.length) return;
      h += `<div class="wsec"><h4>${i + 1}. ${esc(w.name)} · ${fmtDate(dates[i].start)} – ${fmtDate(dates[i].end)}</h4>`;
      wt.forEach(t => {
        const s = statusOf(t.id); const deps = t.deps.map(id => X.byId[id]).filter(Boolean).filter(d => statusOf(d.id) !== 'done');
        h += `<details class="bk ${s}" data-task="${esc(t.id)}"><summary><span class="cb" data-check="${esc(t.id)}" role="checkbox" aria-checked="${s === 'done'}" tabindex="0" title="Mark as done">${ic('i-check')}</span><span class="bt2"><b>${esc(t.title)}</b><small>${esc(t.sub)}${s !== 'todo' && s !== 'done' ? ` · ${STATUS[s]}` : ''}${deps.length ? ` · Waits for: ${esc(deps.map(d => d.title).slice(0, 2).join('; '))}${deps.length > 2 ? '…' : ''}` : ''}</small></span>${ic('i-chevron', 'chev')}</summary><div class="bd">${taskBody(t)}${R.notes[t.id] ? `<p class="note"><b>Note:</b> ${esc(R.notes[t.id])}</p>` : ''}</div></details>`;
      });
      h += '</div>';
    });
    h += '</section>';
  });
  h += `<p class="note noprint">Facts from the Kentik Knowledge Base, checked ${esc(F.checked)}. Effort figures are typical, not promises: adjust them to the customer.</p></div>`;
  const open = new Set($$('#bookView details[open]').map(d => d.dataset.task));
  $('#bookView').innerHTML = h;
  $$('#bookView details').forEach(d => { if (open.has(d.dataset.task)) d.open = true; });
}

/* ---------- right panel ---------- */
const pane = $('#pane');
const seg = (f, val, opts, obj, cls = '') => `<div class="seg ${cls}">${opts.map(([v, label, title]) => `<button type="button" data-act="seg" data-obj="${obj}" data-f="${f}" data-v="${esc(v)}" aria-pressed="${String(v) === String(val)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`).join('')}</div>`;
const stepper = (f, val, obj, min = 0) => `<div class="stepper"><button type="button" data-act="step" data-obj="${obj}" data-f="${f}" data-d="-1" aria-label="Fewer">−</button><input type="number" min="${min}" data-obj="${obj}" data-f="${f}" data-num value="${val}"><button type="button" data-act="step" data-obj="${obj}" data-f="${f}" data-d="1" aria-label="More">+</button></div>`;
const text = (f, val, obj, ph = '') => `<input class="inp" type="text" data-obj="${obj}" data-f="${f}" value="${esc(val)}" placeholder="${esc(ph)}">`;
const row = (label, ctl) => `<div class="row"><span class="lbl">${label}</span><div class="ctl">${ctl}</div></div>`;
const waveSeg = (val, obj) => `<select class="inp" data-obj="${obj}" data-f="wave">${R.waves.map((w, i) => `<option value="${w.id}"${w.id === val ? ' selected' : ''}>${i + 1}. ${esc(w.name)}</option>`).join('')}</select>`;
function objFor(o) { return o === 'meta' ? R.meta : o === 'owners' ? R.owners : o === 'tests' ? R.tests : o === 'site' ? siteById(sel.id) : o === 'cloud' ? cloudById(sel.id) : o && o.startsWith('wave:') ? R.waves.find(w => w.id === o.slice(5)) : null; }
function taskList(ts) { return ts.length ? `<div class="tl2">${ts.map(t => `<div class="ti" style="--team:var(--team-${t.team})" data-task="${esc(t.id)}"><div class="tx">${esc(t.title)}<small><span class="teamtag"><i></i>${esc(TEAMS[t.team].label)}</span> · ${esc(waveOf(t.wave).name)}</small></div><span class="st ${statusOf(t.id)}">${STATUS[statusOf(t.id)]}</span></div>`).join('')}</div>` : '<p class="note">No tasks.</p>'; }
function siteEditor(s) {
  const a = agentOf(s); let h = `<p class="eyebrow">${esc(KIND[s.kind].label)}${s.count > 1 ? ' group' : ''}</p><div class="ph"><span class="kic">${ic(KIND[s.kind].icon)}</span><input class="title" type="text" data-obj="site" data-f="name" value="${esc(s.name)}" aria-label="Name"><div class="acts edit-only"><button type="button" class="tbtn icon-only" data-act="del" title="Delete" aria-label="Delete">${ic('i-trash')}</button></div></div>`;
  h += row('Goes live in', waveSeg(s.wave, 'site'));
  h += row('Kind', seg('kind', s.kind, [['dc', 'Data center'], ['campus', 'Campus'], ['branch', 'Branch']], 'site'));
  h += row('Region', seg('region', s.region, [['amer', 'Americas'], ['emea', 'EMEA'], ['apac', 'APAC']], 'site'));
  h += row('Location', text('location', s.location, 'site', 'City, country'));
  h += row('Sites like this', stepper('count', s.count, 'site', 1));
  h += row('Network devices', stepper('devices', s.devices, 'site', 0));
  h += row('DNS servers', stepper('dns', s.dns, 'site', 0));
  h += `<div class="sec"><h3>Kentik</h3>`;
  h += row('Universal Agent', seg('agent', s.agent ? 'yes' : 'no', [['yes', 'Agent here'], ['no', 'Send to another site']], 'site'));
  if (s.agent) {
    h += row('Install on', seg('install', s.install, [['linux', 'Linux host'], ['docker', 'Docker']], 'site'));
    h += `<div class="caps">${CAPS.map(c => `<label class="cap" title="${esc(F.caps[c].purpose)}"><span class="cdot" style="background:var(--t-${{ flow: 'flow', snmp: 'metrics', ssh: 'metrics', trap: 'events', syslog: 'events', dns: 'dns', synth: 'tests' }[c]})"></span><span class="cn"><b>${esc(c === 'flow' ? 'Flow Proxy' : F.caps[c].name)}</b><small>${esc(F.caps[c].short)} · ${esc(F.caps[c].portLabel)}</small></span><span class="sw"><input type="checkbox" data-cap="${c}"${s.caps.includes(c) ? ' checked' : ''}><span></span></span></label>`).join('')}</div>`;
    if (s.caps.includes('flow')) h += row('Flow Proxy mode', seg('flowMode', s.flowMode, [['forward', 'Forwarding'], ['edge', 'Edge Processing']], 'site'));
    h += row('BGP', seg('bgp', s.bgp, [['off', 'Off'], ['direct', 'Routers to Kentik'], ['proxy', 'Through the agent']], 'site'));
    const z = X.st[s.id].size; h += `<div class="size"><div class="note">Agent host${s.count > 1 ? ', each' : ''}</div><div class="big">${z.recCpu} vCPU · ${z.recRam} GB RAM</div></div>`;
  } else {
    h += row('Sends to', `<select class="inp" data-obj="site" data-f="sendTo"><option value="">Nearest data center agent</option>${R.sites.filter(x => x.agent).map(x => `<option value="${x.id}"${s.sendTo === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`);
    h += `<p class="hint">${a ? `Its devices send flow, traps and syslog across the WAN to the ${esc(a.name)} agent, which also polls them.` : 'No site has an agent yet.'}</p>`;
    h += row('BGP', seg('bgp', s.bgp === 'proxy' ? 'off' : s.bgp, [['off', 'Off'], ['direct', 'Routers to Kentik']], 'site'));
  }
  h += `<details class="more"><summary>Load (optional)</summary><div>${row('Flows per second', `<input class="inp" type="number" min="0" data-obj="site" data-f="fps" data-num value="${s.fps}">`)}${row('Syslog events/s', `<input class="inp" type="number" min="0" data-obj="site" data-f="eps" data-num value="${s.eps}">`)}<p class="hint">Per site. It sizes the agent host.</p></div></details></div>`;
  h += `<div class="sec"><h3>Tasks for this site <span class="r">${X.tasksOf(s.id).length}</span></h3>${taskList(X.tasksOf(s.id))}</div>`;
  return h;
}
function cloudEditor(c) {
  const pv = PROV[c.provider]; const fc = F.clouds[c.provider];
  let h = `<p class="eyebrow">Cloud · ${esc(fc.full)}</p><div class="ph"><span class="kic pv" style="--pv:${pv.color}">${esc(pv.short)}</span><input class="title" type="text" data-obj="cloud" data-f="name" value="${esc(c.name)}" aria-label="Name"><div class="acts edit-only"><button type="button" class="tbtn icon-only" data-act="del" title="Delete" aria-label="Delete">${ic('i-trash')}</button></div></div>`;
  h += row('Goes live in', waveSeg(c.wave, 'cloud'));
  h += row(`${pv.unit[0].toUpperCase() + pv.unit.slice(1)}s`, stepper('accounts', c.accounts, 'cloud', 1));
  h += row('Regions', text('regions', c.regions, 'cloud', 'us-east-1, us-west-2'));
  h += `<div class="caps">${Object.entries(fc.features).filter(([k]) => k !== 'metadata').map(([k, label]) => `<label class="cap"><span class="cdot" style="background:var(--t-cloud)"></span><span class="cn"><b>${esc(label)}</b></span><span class="sw"><input type="checkbox" data-feat="${k}"${c.feats[k] ? ' checked' : ''}><span></span></span></label>`).join('')}</div>`;
  h += `<p class="note" style="margin-top:10px">${esc(fc.summary)}</p>`;
  h += `<div class="sec"><h3>Tasks for this cloud <span class="r">${X.tasksOf(c.id).length}</span></h3>${taskList(X.tasksOf(c.id))}</div>`;
  return h;
}
function testsEditor() {
  let h = `<p class="eyebrow">Synthetic tests</p><div class="ph"><span class="kic">${ic('i-probe')}</span><h2>Tests</h2></div>`;
  h += row('Tests', seg('on', R.tests.on ? 'yes' : 'no', [['yes', 'In the plan'], ['no', 'Not now']], 'tests'));
  if (R.tests.on) {
    h += row('Start in', waveSeg(R.tests.wave, 'tests'));
    h += `<div class="row"><span class="lbl">Apps to test</span><div class="ctl"><textarea class="inp" data-obj="tests" data-f="saas" data-list rows="3">${esc(R.tests.saas.join(', '))}</textarea></div></div>`;
    h += `<p class="hint">Agents with Connectivity Test: ${X.synthAgents.length ? esc(X.synthAgents.map(a => a.name + (a.count > 1 ? ` (×${a.count})` : '')).join(', ')) : 'none yet'}.</p>`;
  }
  h += `<div class="sec"><h3>Tasks</h3>${taskList(X.tasks.filter(t => t.kind === 't-ports' || t.kind === 't-tests'))}</div>`;
  return h;
}
function taskPanel(t) {
  const s = statusOf(t.id); const site = siteById(t.site) || cloudById(t.site);
  let h = `<p class="eyebrow">Task · ${esc(waveOf(t.wave).name)}</p><h2 style="margin:0 0 6px;font-size:17px;line-height:1.3">${esc(t.title)}</h2>`;
  h += `<p class="note" style="margin:0 0 10px"><span class="teamtag" style="--team:var(--team-${t.team})"><i></i>${esc(TEAMS[t.team].label)}</span>${R.owners[t.team] ? ' · ' + esc(R.owners[t.team]) : ''} · typical effort ${fmt1(t.effort)} day${t.effort === 1 ? '' : 's'}${site ? ` · <button type="button" class="linkbtn" data-goto="${site.id}">${esc(site.name)}</button>` : ''}</p>`;
  h += `<div class="seg st4">${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-status="${esc(t.id)}" data-v="${k}" aria-pressed="${s === k}">${esc(v)}</button>`).join('')}</div>`;
  const deps = t.deps.map(id => X.byId[id]).filter(Boolean);
  if (deps.length) h += `<div class="sec" style="margin-top:12px"><h3>Waits for</h3>${taskList(deps)}</div>`;
  h += `<div class="sec"><h3>How</h3>${taskBody(t)}</div>`;
  h += `<div class="sec"><h3>Note</h3><textarea class="inp" data-note="${esc(t.id)}" rows="3" placeholder="For example a change request number">${esc(R.notes[t.id] || '')}</textarea></div>`;
  return h;
}
function summaryPanel() {
  const dates = waveDates(); const n = R.waves.length;
  let h = `<p class="eyebrow">Plan</p>`;
  h += row('Customer', text('customer', R.meta.customer, 'meta')) + row('Project', text('project', R.meta.project, 'meta')) + row('Prepared by', text('preparedBy', R.meta.preparedBy, 'meta', 'Your name'));
  h += row('Start date', `<input class="inp" type="date" data-obj="meta" data-f="start" value="${esc(R.meta.start)}">`);
  h += row('Kentik region', seg('region', R.meta.region, [['US', 'United States'], ['EU', 'European Union']], 'meta'));
  h += `<div class="stats"><div class="stat"><b>${fmt(R.sites.reduce((t, s) => t + s.count, 0))}</b><span>sites</span></div><div class="stat"><b>${fmt(X.agents.reduce((t, s) => t + s.count, 0))}</b><span>agents</span></div><div class="stat"><b>${fmt(X.tasks.length)}</b><span>tasks</span></div></div>`;
  h += `<div class="sec"><h3>Waves <span class="r">go-live ${fmtDate(dates[n - 1].end)}</span></h3>${R.waves.map((w, i) => `<div class="wrow"><span class="wchip w${i % 6}">${i + 1}</span><input class="inp" type="text" data-obj="wave:${w.id}" data-f="name" value="${esc(w.name)}" aria-label="Wave name"><div class="stepper" style="width:76px"><input type="number" min="1" style="width:100%;border:0" data-obj="wave:${w.id}" data-f="weeks" data-num value="${w.weeks}" aria-label="Weeks" title="Weeks"></div><button type="button" class="tbtn icon-only edit-only" data-act="delWave" data-id="${w.id}" title="Delete this wave" aria-label="Delete this wave"${n < 2 ? ' disabled' : ''}>${ic('i-trash')}</button></div>`).join('')}<div class="btnrow edit-only"><button type="button" class="tbtn small" data-act="addWave">${ic('i-plus')}Add a wave</button></div><p class="hint">Weeks per wave. Items in a deleted wave move to the next one.</p></div>`;
  h += `<div class="sec"><h3>Contacts per team</h3>${TEAM_ORDER.map(t => row(TEAMS[t].label, text(t, R.owners[t] || '', 'owners', 'Name'))).join('')}</div>`;
  h += `<div class="sec"><h3>How it works</h3><ol class="steps"><li>List the customer's sites and clouds on the left. Groups (×N) stand for many similar sites.</li><li>Put each one in a wave. The map shows what is live after each wave; press play to watch the rollout.</li><li>Each team's tasks come from the design: firewall changes, hosts, device setup, cloud access. Open Plan to see them by wave, with checks.</li><li>Send the workbook to the customer. Their teams tick tasks off; "Send progress back" returns their status to you, and the map's Progress mode shows it.</li></ol></div>`;
  return h;
}
function renderPanel() {
  let h;
  if (!sel) h = summaryPanel();
  else if (sel.t === 'task') { const t = X.byId[sel.id]; h = t ? taskPanel(t) : summaryPanel(); }
  else if (sel.t === 'tests') h = testsEditor();
  else if (sel.t === 'cloud') { const c = cloudById(sel.id); h = c ? cloudEditor(c) : summaryPanel(); }
  else { const s = siteById(sel.id); h = s ? siteEditor(s) : summaryPanel(); }
  const st = pane.scrollTop; pane.innerHTML = h; pane.scrollTop = st;
  if (BOOK_ONLY) $$('input:not([data-note]),select,textarea:not([data-note])', pane).forEach(el => { el.disabled = true; });
}

/* ---------- estate ---------- */
function renderEstate() {
  if (BOOK_ONLY) return;
  const dates = waveDates();
  const rowS = s => `<button type="button" class="er${sel && sel.id === s.id ? ' sel' : ''}" data-sel="site" data-id="${s.id}"><span class="ei">${ic(KIND[s.kind].icon)}</span><span class="en"><b>${esc(s.name)}${s.count > 1 ? ` ×${fmt(s.count)}` : ''}</b><small>${s.agent ? 'Agent' : `→ ${esc((agentOf(s) || { name: 'no agent' }).name)}`} · ${fmt(s.devices * s.count)} devices</small></span><span class="wchip w${waveIdx(s.wave) % 6}" title="${esc(waveOf(s.wave).name)}, from ${fmtDate(dates[waveIdx(s.wave)].start)}">W${waveIdx(s.wave) + 1}</span></button>`;
  let h = `<div class="eh"><h2>Estate</h2><span class="note">${plural(R.sites.length + R.clouds.length, 'item')}</span></div><div class="adds"><button type="button" data-add="dc">${ic('i-server')}Data center</button><button type="button" data-add="campus">${ic('i-building')}Campus</button><button type="button" data-add="branch">${ic('i-store')}Branch</button><button type="button" data-add="group">${ic('i-grid')}Branch group</button><button type="button" data-add="aws">${ic('i-cloud')}AWS</button><button type="button" data-add="azure">${ic('i-cloud')}Azure</button><button type="button" data-add="gcp">${ic('i-cloud')}Google</button><button type="button" data-add="oci">${ic('i-cloud')}Oracle</button></div>`;
  Object.keys(REGIONS).forEach(r => { const ss = R.sites.filter(s => s.region === r); if (ss.length) h += `<div class="rg"><h3>${esc(REGIONS[r])}<span>${fmt(ss.reduce((t, s) => t + s.count, 0))}</span></h3>${ss.map(rowS).join('')}</div>`; });
  if (R.clouds.length) h += `<div class="rg"><h3>Public cloud<span>${R.clouds.length}</span></h3>${R.clouds.map(c => `<button type="button" class="er${sel && sel.id === c.id ? ' sel' : ''}" data-sel="cloud" data-id="${c.id}"><span class="ei pv" style="--pv:${PROV[c.provider].color}">${esc(PROV[c.provider].short)}</span><span class="en"><b>${esc(c.name)}</b><small>${plural(c.accounts, PROV[c.provider].unit)}${c.regions ? ' · ' + esc(c.regions) : ''}</small></span><span class="wchip w${waveIdx(c.wave) % 6}">W${waveIdx(c.wave) + 1}</span></button>`).join('')}</div>`;
  h += `<div class="rg"><h3>Tests</h3><button type="button" class="er${sel && sel.t === 'tests' ? ' sel' : ''}" data-sel="tests" data-id="tests"><span class="ei">${ic('i-probe')}</span><span class="en"><b>Synthetic tests</b><small>${R.tests.on ? esc(R.tests.saas.join(', ') || 'No apps') : 'Not in the plan'}</small></span>${R.tests.on ? `<span class="wchip w${waveIdx(R.tests.wave) % 6}">W${waveIdx(R.tests.wave) + 1}</span>` : ''}</button></div>`;
  $('#estate').innerHTML = h;
}

/* ---------- rendering ---------- */
function renderMapView() { renderKpis(); renderMap(); renderTimeline(); }
function refresh(o = {}) {
  derive();
  if (sel && ((sel.t === 'site' && !siteById(sel.id)) || (sel.t === 'cloud' && !cloudById(sel.id)) || (sel.t === 'task' && !X.byId[sel.id]))) sel = null;
  if (pos > R.waves.length + 1) pos = R.waves.length + 1;
  $$('.views [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('#mapView').hidden = view !== 'map'; $('#planView').hidden = view !== 'plan'; $('#bookView').hidden = view !== 'book';
  if (view === 'map') renderMapView(); else if (view === 'plan') renderPlan(); else renderBook();
  renderEstate();
  if (o.panel !== false) renderPanel();
  $('#undoBtn').disabled = !undoStack.length; $('#redoBtn').disabled = !redoStack.length;
  const ci = $('#custName'); if (document.activeElement !== ci) ci.value = R.meta.customer || '';
  document.title = `${R.meta.customer || 'Customer'} · Kentik Rollout Map`;
}
function commit() {
  const now = JSON.stringify(R);
  if (now !== lastSnap) { undoStack.push(lastSnap); if (undoStack.length > 120) undoStack.shift(); redoStack.length = 0; lastSnap = now; }
  if (BOOK_ONLY) lsSet(progressKey(), { status: R.status, notes: R.notes }); else lsSet(STORE, R);
}
const progressKey = () => 'ibk-rollout-progress-' + slug(R.meta.customer);
function undo() { if (!undoStack.length) return; redoStack.push(lastSnap); lastSnap = undoStack.pop(); R = JSON.parse(lastSnap); lsSet(STORE, R); refresh(); toast('Undone'); }
function redo() { if (!redoStack.length) return; undoStack.push(lastSnap); lastSnap = redoStack.pop(); R = JSON.parse(lastSnap); lsSet(STORE, R); refresh(); toast('Redone'); }
function select(s) { sel = s; refresh(); }
function setStatus(id, v) { if (v === 'todo') delete R.status[id]; else R.status[id] = v; commit(); refresh({ panel: !(sel && sel.t === 'task' && sel.id !== id) }); }

/* ---------- editing ---------- */
function defaultWave(kind) {
  const n = R.waves.length; const pick = i => R.waves[Math.min(i, n - 1)].id;
  if (kind === 'dc' || kind === 'campus') return R.sites.some(s => s.agent && s.kind !== 'branch') ? pick(1) : pick(0);
  if (kind === 'cloud') return pick(1);
  return pick(n >= 3 ? n - 2 : n - 1);
}
function addItem(what) {
  let item, t;
  if (PROV[what]) { item = makeCloud(what, { wave: defaultWave('cloud') }); R.clouds.push(item); t = 'cloud'; }
  else {
    const kind = what === 'group' ? 'branch' : what;
    const region = sel && sel.t === 'site' && siteById(sel.id) ? siteById(sel.id).region : (R.sites[0] ? R.sites[0].region : (R.meta.region === 'EU' ? 'emea' : 'amer'));
    item = makeSite(kind, { region, wave: defaultWave(kind) });
    if (what === 'group') { item.count = 25; item.name = `Branch group ${R.sites.filter(s => s.count > 1).length + 1}`; }
    R.sites.push(item); t = 'site';
  }
  sel = { t, id: item.id }; commit(); refresh(); toast(`Added ${item.name} to ${waveOf(item.wave).name}`);
}
function deleteSel() {
  if (!sel || BOOK_ONLY) return;
  if (sel.t === 'site') { const s = siteById(sel.id); R.sites = R.sites.filter(x => x !== s); R.sites.forEach(x => { if (x.sendTo === s.id) x.sendTo = ''; }); toast(`Deleted ${s.name}. Undo goes back.`); }
  else if (sel.t === 'cloud') { const c = cloudById(sel.id); R.clouds = R.clouds.filter(x => x !== c); toast(`Deleted ${c.name}. Undo goes back.`); }
  else return;
  sel = null; commit(); refresh();
}
function setField(el, now) {
  const obj = objFor(el.dataset.obj); if (!obj) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.hasAttribute('data-num')) v = Math.max(Number(el.min) || 0, Math.round(Number(v) || 0));
  if (el.hasAttribute('data-list')) v = String(v).split(',').map(x => x.trim()).filter(Boolean);
  if (el.dataset.f === 'weeks') v = clamp(v, 1, 26);
  if (el.dataset.obj === 'owners' && !v) delete obj[el.dataset.f]; else obj[el.dataset.f] = v;
  if (now) { commit(); refresh(); } else refresh({ panel: false });
}
pane.addEventListener('input', e => {
  const n = e.target.closest('[data-note]');
  if (n) { if (n.value) R.notes[n.dataset.note] = n.value; else delete R.notes[n.dataset.note]; return; }
  const el = e.target.closest('[data-f]');
  if (!el || BOOK_ONLY || el.tagName === 'SELECT' || el.type === 'number' || el.type === 'date' || el.type === 'checkbox') return;
  setField(el, false);
});
pane.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.note) { commit(); return; }
  if (BOOK_ONLY) return;
  if (el.dataset.cap) { const s = siteById(sel.id); s.caps = el.checked ? CAPS.filter(c => c === el.dataset.cap || s.caps.includes(c)) : s.caps.filter(c => c !== el.dataset.cap); commit(); refresh(); return; }
  if (el.dataset.feat) { const c = cloudById(sel.id); c.feats[el.dataset.feat] = el.checked; commit(); refresh(); return; }
  if (el.dataset.f) setField(el, true);
});
pane.addEventListener('click', e => {
  const st = e.target.closest('[data-status]'); if (st) { setStatus(st.dataset.status, st.dataset.v); return; }
  const tk = e.target.closest('[data-task]'); if (tk) { select({ t: 'task', id: tk.dataset.task }); return; }
  const go = e.target.closest('[data-goto]'); if (go) { const id = go.dataset.goto; select({ t: siteById(id) ? 'site' : 'cloud', id }); return; }
  const b = e.target.closest('[data-act]'); if (!b || BOOK_ONLY) return;
  const a = b.dataset.act;
  if (a === 'seg') {
    const obj = objFor(b.dataset.obj); let v = b.dataset.v;
    if (b.dataset.f === 'agent') { obj.agent = v === 'yes'; if (obj.agent && !obj.caps.length) obj.caps = DEFCAPS[obj.kind].slice(); }
    else if (b.dataset.f === 'on') obj.on = v === 'yes';
    else obj[b.dataset.f] = v;
    commit(); refresh(); return;
  }
  if (a === 'step') { const obj = objFor(b.dataset.obj); const f = b.dataset.f; const min = ['count', 'accounts'].includes(f) ? 1 : 0; const cur = Number(obj[f]) || 0; const big = (f === 'count' && cur >= 10) || (f === 'devices' && cur >= 20) ? (f === 'devices' ? 10 : 5) : 1; obj[f] = Math.max(min, cur + Number(b.dataset.d) * big); commit(); refresh(); return; }
  if (a === 'del') { deleteSel(); return; }
  if (a === 'addWave') { addWave(); return; }
  if (a === 'delWave') { delWave(b.dataset.id); }
});
function addWave() { const n = R.waves.length + 1; R.waves.push({ id: uid('w'), name: `Wave ${n}`, weeks: 2 }); commit(); refresh(); toast(`Added wave ${n}`); }
function delWave(id) {
  if (R.waves.length < 2) return;
  const i = waveIdx(id); const to = (R.waves[i + 1] || R.waves[i - 1]).id;
  R.sites.forEach(s => { if (s.wave === id) s.wave = to; }); R.clouds.forEach(c => { if (c.wave === id) c.wave = to; }); if (R.tests.wave === id) R.tests.wave = to;
  R.waves.splice(i, 1); commit(); refresh(); toast('Deleted the wave. Its items moved to the next wave.');
}

/* ---------- exports ---------- */
function download(name, body, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
const csv = rows => rows.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
function exportCsv() {
  const dates = waveDates();
  const rows = [['Wave', 'Starts', 'Ends', 'Team', 'Contact', 'Task', 'Detail', 'Site or cloud', 'Typical effort (days)', 'Waits for', 'Status', 'Note']];
  X.tasks.forEach(t => { const i = waveIdx(t.wave); const s = siteById(t.site) || cloudById(t.site); rows.push([`${i + 1}. ${R.waves[i].name}`, dates[i].start.toISOString().slice(0, 10), dates[i].end.toISOString().slice(0, 10), TEAMS[t.team].label, R.owners[t.team] || '', t.title, t.sub, s ? s.name : '', t.effort, t.deps.map(d => X.byId[d] ? X.byId[d].title : d).join('; '), STATUS[statusOf(t.id)], R.notes[t.id] || '']); });
  download(`${slug(R.meta.customer)}-kentik-rollout-plan.csv`, csv(rows), 'text/csv'); toast(`Saved ${plural(X.tasks.length, 'task')} as CSV`);
}
function exportWorkbook() {
  const tag = '<script id="ibk-plan">window.IBK_PLAN=' + JSON.stringify(R).replace(/</g, '\\u003c') + ';window.IBK_WORKBOOK=true;</' + 'script>\n';
  download(`${slug(R.meta.customer)}-kentik-rollout-workbook.html`, PRISTINE.replace('</' + 'head>', tag + '</' + 'head>'), 'text/html');
  toast('Saved the workbook. It opens in any browser, with no app.');
}
function exportProgress() { download(`${slug(R.meta.customer)}-kentik-progress.json`, JSON.stringify({ kind: 'ibk-rollout-progress', customer: R.meta.customer, at: new Date().toISOString(), status: R.status, notes: R.notes }, null, 2), 'application/json'); toast('Saved your progress. Send the file to your Infoblox team.'); }
function exportPlan() { download(`${slug(R.meta.customer)}-kentik-rollout.json`, JSON.stringify(R, null, 2), 'application/json'); toast('Saved the plan file'); }
function printBook() { view = 'book'; refresh(); $$('.bk').forEach(d => { d.open = true; }); setTimeout(() => window.print(), 80); }
function openFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let j; try { j = JSON.parse(rd.result); } catch (e) { toast('That file is not JSON.'); return; }
    if (j && j.kind === 'ibk-rollout-progress') { const n = Object.keys(j.status || {}).length; Object.assign(R.status, j.status || {}); Object.assign(R.notes, j.notes || {}); commit(); mode = 'progress'; refresh(); toast(`Updated ${plural(n, 'task')} from ${j.customer || 'the customer'}'s progress`); return; }
    let p = null;
    if (j && Array.isArray(j.waves)) p = normalizePlan(j);
    else if (j && Array.isArray(j.sites)) p = fromSetup(j);
    if (!p) { toast('That file is not a rollout plan, a progress file or a setup from the current app.'); return; }
    loadPlan(p); toast(`Opened ${p.meta.customer}`);
  };
  rd.readAsText(file);
}

/* ---------- starters ---------- */
function regionOf(loc, fallback) {
  const l = String(loc || '');
  if (/\b(DE|NL|UK|GB|FR|ES|IT|IE|BE|CH|AT|SE|DK|NO|FI|PL|PT)\b|Europe|London|Paris|Frankfurt|Amsterdam|Madrid|Milan|Dublin/i.test(l)) return 'emea';
  if (/Singapore|Tokyo|Japan|Sydney|Australia|India|Mumbai|Hong Kong|Seoul|APAC/i.test(l)) return 'apac';
  return fallback;
}
function fromSetup(cfg) {
  R = blankPlan(); const W = R.waves.map(w => w.id);
  R.meta = Object.assign(R.meta, { customer: cfg.customer || 'Customer', project: cfg.project || R.meta.project, preparedBy: cfg.prepared_by || '', region: cfg.region === 'EU' ? 'EU' : 'US' });
  const fb = R.meta.region === 'EU' ? 'emea' : 'amer'; const byName = {}; let firstDc = true;
  (cfg.sites || []).forEach(s0 => {
    const kind = s0.kind === 'branch' ? 'branch' : 'dc'; const caps = (s0.capabilities || []).filter(c => CAPS.includes(c));
    const agent = kind === 'dc' ? true : ('agent' in s0 ? !!s0.agent : caps.length > 0);
    const s = makeSite(kind, { name: s0.name || '', location: s0.location || '', region: regionOf(s0.location, fb), devices: Number(s0.devices) || DEF[kind].devices, dns: (s0.capabilities || []).includes('dns') ? 2 : 0,
      fps: Number(s0.fps) || DEF[kind].fps, eps: Number(s0.syslog_eps) || DEF[kind].eps, agent, caps: caps.length ? caps : DEFCAPS[kind].slice(), flowMode: s0.flow_mode === 'edge' ? 'edge' : 'forward',
      bgp: (s0.capabilities || []).includes('bgp') || s0.proxy ? 'proxy' : s0.bgp ? 'direct' : 'off', install: s0.install === 'docker' ? 'docker' : 'linux' });
    s.wave = kind === 'dc' ? (firstDc ? W[0] : W[1]) : W[2]; if (kind === 'dc') firstDc = false;
    s._sendTo = s0.send_to || ''; byName[s.name] = s.id; R.sites.push(s);
  });
  R.sites.forEach(s => { if (s._sendTo && byName[s._sendTo]) s.sendTo = byName[s._sendTo]; delete s._sendTo; });
  F.cloudOrder.forEach(cid => { const c0 = (cfg.clouds || {})[cid]; if (!c0 || !c0.enabled) return; const f = c0.features || []; R.clouds.push(makeCloud(cid, { accounts: Math.max(1, Number(c0.accounts) || 1), regions: c0.regions || '', feats: { flow: f.includes('flow'), firewall: f.includes('firewall'), metrics: f.includes('metrics') }, wave: W[1] })); });
  const syn = cfg.synthetics || {}; R.tests = { on: syn.enabled !== false, wave: W[3], saas: (syn.saas_targets || ['Microsoft 365', 'Salesforce']).slice() };
  const p = R; R = null; return normalizePlan(p);
}
function buildPov() {
  R = blankPlan(); R.waves = [{ id: 'w1', name: 'Connect', weeks: 1 }, { id: 'w2', name: 'Prove value', weeks: 1 }];
  R.meta = Object.assign(R.meta, { customer: 'Fabrikam Logistics', project: 'Two-week proof of value' });
  R.sites.push(makeSite('dc', { name: 'Main data center', location: 'Denver, CO', devices: 120, fps: 10000, eps: 1000, wave: 'w1', install: 'docker' }));
  R.sites.push(makeSite('branch', { name: 'Seattle office', location: 'Seattle, WA', devices: 12, fps: 1500, agent: true, caps: ['flow', 'snmp', 'synth'], wave: 'w2' }));
  R.sites[0].caps = ['flow', 'snmp', 'trap', 'syslog', 'synth'];
  R.clouds.push(makeCloud('aws', { name: 'AWS', regions: 'us-west-2', wave: 'w1' }));
  R.tests = { on: true, wave: 'w2', saas: ['Microsoft 365', 'Salesforce'] };
  const p = R; R = null; return normalizePlan(p);
}
function buildRollout() {
  R = blankPlan();
  R.meta = Object.assign(R.meta, { customer: 'Northwind Retail', project: 'Network observability rollout' });
  const A = makeSite('dc', { name: 'Ashburn DC', location: 'Ashburn, VA', devices: 260, dns: 2, fps: 40000, eps: 3000, caps: ['flow', 'snmp', 'trap', 'syslog', 'dns', 'synth'], wave: 'w1' });
  const B = makeSite('dc', { name: 'Dallas DC', location: 'Dallas, TX', devices: 180, fps: 20000, caps: ['flow', 'snmp', 'trap', 'syslog', 'synth'], wave: 'w2' });
  const H = makeSite('campus', { name: 'Chicago HQ', location: 'Chicago, IL', wave: 'w2' });
  const FR = makeSite('dc', { name: 'Frankfurt DC', location: 'Frankfurt, DE', region: 'emea', devices: 140, fps: 15000, caps: ['flow', 'snmp', 'trap', 'syslog', 'synth'], wave: 'w2' });
  R.sites.push(A, B, H, FR);
  R.sites.push(makeSite('branch', { name: 'Stores East', count: 80, devices: 4, fps: 800, eps: 50, sendTo: A.id, wave: 'w3' }));
  R.sites.push(makeSite('branch', { name: 'Stores West', count: 70, devices: 4, fps: 800, eps: 50, sendTo: B.id, wave: 'w3' }));
  R.sites.push(makeSite('branch', { name: 'Stores Europe', region: 'emea', count: 30, devices: 4, fps: 800, eps: 50, sendTo: FR.id, wave: 'w3' }));
  R.sites.push(makeSite('branch', { name: 'Denver warehouse', location: 'Denver, CO', devices: 11, fps: 9000, eps: 400, sendTo: B.id, wave: 'w1' }));
  R.clouds.push(makeCloud('aws', { name: 'AWS production', accounts: 6, regions: 'us-east-1, us-west-2', feats: { flow: true, firewall: true, metrics: false }, wave: 'w2' }));
  R.clouds.push(makeCloud('azure', { name: 'Azure corporate', accounts: 2, regions: 'eastus2', wave: 'w2' }));
  R.tests = { on: true, wave: 'w4', saas: ['Microsoft 365', 'Salesforce', 'ServiceNow', 'Zoom'] };
  R.owners = {};
  const p = R; R = null; return normalizePlan(p);
}
const STARTERS = () => [
  { id: 'rollout', title: 'Enterprise rollout in four waves', sub: 'Three data centers in two regions, HQ, 180 stores, a warehouse, AWS, Azure and tests. One plan check to fix.', build: buildRollout },
  { id: 'pov', title: 'Proof of value in two weeks', sub: 'One data center, one office and AWS, in two one-week waves', build: buildPov },
  ...EXAMPLES.map(e => ({ id: 'ex:' + e.file, title: e.setup.customer || e.file, sub: `From examples/${e.file}, the current app's format. Waves are set for you.`, build: () => fromSetup(e.setup) })),
  { id: 'blank', title: 'Empty plan', sub: 'Four waves and nothing in them', build: () => normalizePlan(blankPlan()) },
];
function loadPlan(p) { R = normalizePlan(p) || normalizePlan(blankPlan()); sel = null; pos = Math.min(1, R.waves.length); mode = 'plan'; commit(); refresh(); }

/* ---------- menus, keys, theme ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function openModal(title, body) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
function buildMenus() {
  $('#startPop').innerHTML = STARTERS().map(s => `<button type="button" data-starter="${esc(s.id)}">${ic(s.id === 'blank' ? 'i-plus' : 'i-sparkle')}<span><b>${esc(s.title)}</b><small>${esc(s.sub)}</small></span></button>`).join('') + `<hr><button type="button" data-open>${ic('i-upload')}<span><b>Open a file…</b><small>A rollout plan, a customer's progress file, or a setup JSON from the current app</small></span></button>`;
  const items = BOOK_ONLY ? [
    ['progress', 'i-upload', 'Send progress back (.json)', 'A small file with the status of each task, for your Infoblox team'],
    ['print', 'i-print', 'Print the workbook (PDF)', 'Every task with its steps, team by team'],
    ['csv', 'i-list', 'Tasks (.csv)', 'For Excel, Jira or Smartsheet'],
  ] : [
    ['book', 'i-book', 'Customer workbook (.html)', 'One file the customer opens in any browser: the map, the plan and every task. Their teams tick tasks off'],
    ['print', 'i-print', 'Print the workbook (PDF)', 'Every task with its steps, team by team'],
    ['csv', 'i-list', 'Tasks (.csv)', 'One row per task with team, wave, dates and status, for Excel, Jira or Smartsheet'],
    ['json', 'i-download', 'Plan file (.json)', 'Save the plan to open it again later'],
    ['open', 'i-upload', 'Import the customer\'s progress…', 'The progress file the customer sends back'],
  ];
  $('#exportPop').innerHTML = items.map(([id, icon, t, s]) => `<button type="button" data-export="${id}">${ic(icon)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`).join('');
}
function closeMenus() { $$('.menu.open').forEach(m => { m.classList.remove('open'); m.querySelector('[data-menu]').setAttribute('aria-expanded', 'false'); }); }
document.addEventListener('click', e => {
  const mb = e.target.closest('[data-menu]');
  if (mb) { const m = mb.closest('.menu'); const open = !m.classList.contains('open'); closeMenus(); if (open) { m.classList.add('open'); mb.setAttribute('aria-expanded', 'true'); } return; }
  const stt = e.target.closest('[data-starter]');
  if (stt) { const s = STARTERS().find(x => x.id === stt.dataset.starter); closeMenus(); if (s) { loadPlan(s.build()); toast(`Opened ${s.title}. Undo goes back.`); } return; }
  if (e.target.closest('[data-open]')) { closeMenus(); $('#fileIn').click(); return; }
  const ex = e.target.closest('[data-export]');
  if (ex) { closeMenus(); ({ book: exportWorkbook, print: printBook, csv: exportCsv, json: exportPlan, progress: exportProgress, open: () => $('#fileIn').click() })[ex.dataset.export](); return; }
  if (!e.target.closest('.menu')) closeMenus();
  const vb = e.target.closest('[data-view]'); if (vb) { view = vb.dataset.view; refresh({ panel: false }); return; }
  const add = e.target.closest('[data-add]'); if (add && !BOOK_ONLY) { addItem(add.dataset.add); return; }
  const er = e.target.closest('[data-sel]'); if (er) { select({ t: er.dataset.sel, id: er.dataset.id }); return; }
  const stn = e.target.closest('.stn'); if (stn) { select({ t: stn.dataset.t, id: stn.dataset.id }); return; }
  const wv = e.target.closest('.wv[data-pos]'); if (wv) { if (playing) play(); mode = 'plan'; pos = Number(wv.dataset.pos); renderMapView(); return; }
  if (e.target.closest('.wv.add')) { if (!BOOK_ONLY) addWave(); return; }
  if (e.target.closest('#playBtn')) { play(); return; }
  const md = e.target.closest('[data-mode]'); if (md) { mode = md.dataset.mode; renderMapView(); return; }
  const lg = e.target.closest('.legend [data-line]'); if (lg) { const l = lg.dataset.line; hiddenLines.has(l) ? hiddenLines.delete(l) : hiddenLines.add(l); renderMap(); return; }
  const fx = e.target.closest('[data-fix]'); if (fx) { const c = X.checks[Number(fx.dataset.fix)]; if (c && c.fix) { c.fix.run(); commit(); refresh(); toast('Fixed: ' + c.fix.label); } return; }
  const cb = e.target.closest('[data-check]'); if (cb) { e.preventDefault(); const id = cb.dataset.check; setStatus(id, statusOf(id) === 'done' ? 'todo' : 'done'); return; }
  const task = e.target.closest('#planView [data-task]'); if (task) { select({ t: 'task', id: task.dataset.task }); return; }
  const bk = e.target.closest('#bookView summary'); if (bk && !e.target.closest('[data-check]')) { const id = bk.parentElement.dataset.task; if (id) { sel = { t: 'task', id }; renderPanel(); } return; }
  const jump = e.target.closest('[data-jump]'); if (jump) { const s = $('#team-' + jump.dataset.jump); if (s) s.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); return; }
  if (e.target.closest('#mapwrap') && !e.target.closest('.stn') && !e.target.closest('.legend')) { if (sel) select(null); }
});
$('#mapwrap').addEventListener('mouseover', e => { const s = e.target.closest('.stn'); const id = s ? s.dataset.id : null; if (id !== hoverSt) { hoverSt = id; renderMap(); } });
$('#mapwrap').addEventListener('mouseleave', () => { if (hoverSt) { hoverSt = null; renderMap(); } });
$('#mapwrap').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.stn')) { e.preventDefault(); const s = e.target.closest('.stn'); select({ t: s.dataset.t, id: s.dataset.id }); } });
$('#bookView').addEventListener('keydown', e => { const cb = e.target.closest('[data-check]'); if (cb && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); const id = cb.dataset.check; setStatus(id, statusOf(id) === 'done' ? 'todo' : 'done'); } });
$('#fileIn').addEventListener('change', e => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
$('#custName').addEventListener('input', e => { R.meta.customer = e.target.value; document.title = `${R.meta.customer || 'Customer'} · Kentik Rollout Map`; });
$('#custName').addEventListener('change', () => { commit(); refresh(); });
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
$('#helpBtn').addEventListener('click', () => openModal('How the Rollout Map works', `<p>Getting Kentik live is a project: the security team opens firewall rules, the server team builds hosts, the network team points devices at the agents, the cloud team grants access, and your Infoblox team sets up the portal and checks the data. This take plans that work in waves, and shows it as a transit map: each kind of data is a line into Kentik, and each site is a station that opens in its wave.</p><table class="tbl"><tbody><tr><td><b>Map</b></td><td>Press play to watch the rollout wave by wave. Switch to Progress to see the real status from the tasks.</td></tr><tr><td><b>Plan</b></td><td>Tasks by team and wave, with checks: order problems, long chains of work, many firewall changes in one wave.</td></tr><tr><td><b>Workbook</b></td><td>What the customer gets. Each team sees its tasks with the steps, ports and policies, and ticks them off.</td></tr><tr><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></td><td>Map, Plan, Workbook</td></tr><tr><td><kbd>P</kbd></td><td>Play or pause the rollout</td></tr><tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Step through the waves</td></tr><tr><td><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd></td><td>Undo (add Shift to redo)</td></tr></tbody></table><p style="margin-top:10px">Effort figures are typical planning numbers, not Kentik facts. Kentik facts come from configurator/catalog.py, checked against the Kentik KB in ${esc(F.checked)}.</p>`));
document.addEventListener('keydown', e => {
  const typing = e.target.closest && e.target.closest('input,textarea,select');
  if (e.key === 'Escape') { if (!$('#modal').hidden) { closeModal(); return; } closeMenus(); if (typing) e.target.blur(); else if (sel) select(null); return; }
  if (typing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (!BOOK_ONLY) (e.shiftKey ? redo() : undo()); return; }
  if (mod) return;
  if (e.key === '1' || e.key === '2' || e.key === '3') { view = ['map', 'plan', 'book'][Number(e.key) - 1]; refresh({ panel: false }); return; }
  if (e.key.toLowerCase() === 'p' && view === 'map') { play(); return; }
  if (e.key === 'ArrowRight' && view === 'map') { mode = 'plan'; pos = Math.min(R.waves.length + 1, pos + 1); renderMapView(); return; }
  if (e.key === 'ArrowLeft' && view === 'map') { mode = 'plan'; pos = Math.max(0, pos - 1); renderMapView(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSel(); return; }
  if (e.key.toLowerCase() === 'e') $('#exportMenu [data-menu]').click();
  if (e.key === '?') $('#helpBtn').click();
});
function setTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
$('#themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = dark ? 'light' : 'dark'; setTheme(t); try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* no storage */ }
});

/* ---------- startup ---------- */
(function init() {
  let t = null; try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* no storage */ }
  if (t === 'light' || t === 'dark') setTheme(t);
  // Optional link options: #starter=rollout&view=plan&pos=2&mode=progress&sel=Ashburn%20DC&theme=dark
  const q = new URLSearchParams(location.hash.slice(1));
  const st = q.get('starter') && STARTERS().find(s => s.id === q.get('starter'));
  let p = st ? st.build() : window.IBK_PLAN || (BOOK_ONLY ? null : lsGet(STORE));
  R = normalizePlan(p) || buildRollout();
  if (BOOK_ONLY) {
    document.body.classList.add('book-only'); $('#viewbar').hidden = false; $('#custName').readOnly = true; $('#estate').hidden = true;
    const saved = lsGet(progressKey()); if (saved) { Object.assign(R.status, saved.status || {}); Object.assign(R.notes, saved.notes || {}); }
    view = 'book'; mode = 'progress';
  }
  if (['map', 'plan', 'book'].includes(q.get('view'))) view = q.get('view');
  if (q.get('mode') === 'progress') mode = 'progress';
  if (q.get('theme') === 'dark' || q.get('theme') === 'light') setTheme(q.get('theme'));
  pos = q.get('pos') != null ? clamp(Number(q.get('pos')) || 0, 0, R.waves.length + 1) : Math.min(2, R.waves.length);
  const sn = q.get('sel') && (R.sites.find(s => s.name === q.get('sel')) || R.clouds.find(c => c.name === q.get('sel')));
  if (sn) sel = { t: R.sites.includes(sn) ? 'site' : 'cloud', id: sn.id };
  buildMenus();
  lastSnap = JSON.stringify(R);
  refresh();
})();
