/* ---------- Sites: data centers and branch offices, each agent with its own capabilities ---------- */

/* Capabilities as the portal lists them under Settings › Universal Agents › Installed Capabilities */
const UACAPS = [
  {id:'bgp', ui:'BGP Proxy', aka:'kbgp', icon:'route', s:'Routers peer with the agent', sd:'TCP 179 from routers', chip:'BGP', cpu:2, ram:2},
  {id:'synth', ui:'Connectivity Test', icon:'probe', s:'Tests to sites and apps', sd:'TCP 8877 · UDP 9977', chip:'Tests', cpu:2, ram:2},
  {id:'ssh', ui:'Device Configuration Sync', icon:'terminal', s:'Config backups over SSH', sd:'TCP 22 to management IPs', chip:'Config', cpu:0, ram:0},
  {id:'dns', ui:'DNS OTT Tap', icon:'dns', s:'DNS queries as flow', sd:'DNSTAP, SPAN or on-server', chip:'DNS', cpu:1, ram:1},
  {id:'flow', ui:'Flow Proxy', icon:'flow', s:'NetFlow, sFlow, IPFIX', sd:'Listens on UDP 9995', chip:'Flow', cpu:1, ram:2},
  {id:'trap', ui:'SNMP Trap Receiver', icon:'bolt', s:'Real-time device events', sd:'Listens on UDP 162', chip:'Traps', cpu:0, ram:0},
  {id:'snmp', ui:'SNMP/ST', icon:'gauge', s:'Health and interfaces', sd:'UDP 161 · gNMI · ICMP', chip:'SNMP/ST', cpu:2, ram:8},
  {id:'syslog', ui:'Syslog Server', icon:'list', s:'Network device logs', sd:'Listens on UDP/TCP 514', chip:'Syslog', cpu:1, ram:1}
];
const UAC = Object.fromEntries(UACAPS.map(c => [c.id, c]));
const DRAW_ORDER = ['flow', 'snmp', 'trap', 'syslog', 'dns', 'synth', 'ssh', 'bgp'];   // order inside the agent box, matching the device lines
const DC_DEF = ['flow', 'snmp', 'trap', 'syslog'], BR_DEF = ['flow', 'snmp', 'synth'];
const BR_MAX = 10;

/* ----- Data center helpers ----- */
const isDC = v => typeof v === 'string' && /^dc[2-6]?$/.test(v);
const dcId = i => i === 1 ? 'dc' : 'dc' + i;
const dcIndex = v => v === 'dc' ? 1 : +v.slice(2);
const dcIds = () => Array.from({length:S.dcN}, (_, k) => dcId(k + 1));
function dcCustom(i){ return String(S.dcNames[i - 1] || '').trim(); }
function dcDefault(i){ return S.dcN > 1 ? 'Data center ' + i : 'Data center'; }
function dcName(i){ return dcCustom(i) || dcDefault(i); }

/* ----- Branch helpers ----- */
const isBR = v => typeof v === 'string' && /^br([1-9]|10)$/.test(v);
const brId = i => 'br' + i;
const brIndex = v => +v.slice(2);
const brIds = () => Array.from({length:S.brN}, (_, k) => brId(k + 1));
function brCustom(i){ return String(S.brNames[i - 1] || '').trim(); }
function brDefault(i){ return S.brN > 1 ? 'Branch ' + i : 'Branch office'; }
function brName(i){ return brCustom(i) || brDefault(i); }
const brUA = i => !!S.brUA[i - 1];
const dcOn = () => S.sel.has('dc');
const brOn = () => S.sel.has('branch');
function brTarget(i){ if(!dcOn()) return 0; const t = +S.brTo[i - 1] || 1; return t >= 1 && t <= S.dcN ? t : 1; }
function feeders(dc){ return brOn() ? brIds().map(brIndex).filter(i => !brUA(i) && brTarget(i) === dc) : []; }

const modOf = v => isDC(v) || v === 'dcs' ? 'dc' : isBR(v) || v === 'brs' ? 'branch' : MOD[v] ? v : null;

/* ----- Per-agent capabilities and install method ----- */
function capsOf(kind, i){
  const arr = kind === 'dc' ? S.dcCaps : S.brCaps;
  if(!arr[i - 1]) arr[i - 1] = new Set(kind === 'dc' ? DC_DEF : BR_DEF);
  return arr[i - 1];
}
/* BGP peering at a data center: off, routers peer directly with Kentik, or with the agent (BGP Proxy on) */
function bgpMode(i){ return capsOf('dc', i).has('bgp') ? 'ua' : S.dcBgp[i - 1] === 'direct' ? 'direct' : 'off'; }
function instOf(kind, i){ return (kind === 'dc' ? S.dcInst : S.brInst)[i - 1] === 'docker' ? 'docker' : 'linux'; }
const capList = (kind, i) => DRAW_ORDER.filter(c => capsOf(kind, i).has(c));
/* Flow Proxy runs in one of two modes. Forwarding sends raw flow to Kentik SaaS to decode; Edge Processing decodes on the agent. */
const FLOW_MODES = {
  forward:{ui:'Flow Proxy Forwarding', short:'Forwarding', s:'Forwards raw flow; Kentik decodes it', cpu:1, ram:2, per:20000},
  edge:{ui:'Flow Proxy Edge Processing', short:'Edge Processing', s:'Decodes flow on the agent', cpu:8, ram:32, per:25000}
};
function fmOf(kind, i){ return (kind === 'dc' ? S.dcFm : S.brFm)[i - 1] === 'edge' ? 'edge' : 'forward'; }
const capUI = (kind, i, c) => c === 'flow' ? FLOW_MODES[fmOf(kind, i)].ui : UAC[c].ui;
/* Optional load per site: network devices and flows per second. 0 means not given, so sizing uses the KB baseline. */
function szOf(kind, i){ const a = kind === 'dc' ? S.dcSz : S.brSz; return a[i - 1] || (a[i - 1] = {d:0, f:0}); }
const SNMP_PER = 500;
function sizing(kind, i){
  const list = capList(kind, i), own = szOf(kind, i);
  let d = own.d || 0, f = own.f || 0;
  if(kind === 'dc') feeders(i).forEach(b => { const z = szOf('br', b); d += z.d || 0; f += z.f || 0; });   // branches without an agent add their load here
  let cpu = 0, ram = 0, est = false;
  list.forEach(c => {
    let cc = UAC[c].cpu, rr = UAC[c].ram, n = 1;
    if(c === 'flow'){ const m = FLOW_MODES[fmOf(kind, i)]; cc = m.cpu; rr = m.ram; n = Math.max(1, Math.ceil(f / m.per)); est = n > 1; }
    if(c === 'snmp') n = Math.max(1, Math.ceil(d / SNMP_PER));
    cpu += cc * n; ram += rr * n;
  });
  return {cpu, ram, d, f, est, given:!!(d || f), rc:list.length ? Math.max(2, Math.ceil(cpu * 1.3)) : 0, rr:list.length ? Math.max(2, Math.ceil(ram * 1.3)) : 0};
}
const fmtN = v => v >= 10000 ? fmt(v / 1000) + 'k' : fmt(v);
/* Every agent that has Connectivity Test on: private test points for site-to-site tests */
function testAgents(){
  const out = [];
  if(dcOn()) for(let i = 1; i <= S.dcN; i++) if(capsOf('dc', i).has('synth')) out.push(dcName(i));
  if(brOn()) for(let i = 1; i <= S.brN; i++) if(brUA(i) && capsOf('br', i).has('synth')) out.push(brName(i));
  return out;
}
function meshMath(n){ const sub = n * (n - 1), run = sub * 2.5; return {sub, run, month:run * 43200}; }
const fmt = v => v.toLocaleString('en-US', {maximumFractionDigits:1});

function dcMod(id){
  const i = dcIndex(id), f = feeders(i).length, caps = capList('dc', i);
  return Object.assign({}, MOD.dc, {id, name:dcName(i),
    sub:f ? 'Also collects for ' + f + (f > 1 ? ' branches' : ' branch') : caps.length + ' capabilit' + (caps.length === 1 ? 'y' : 'ies') + ' on',
    subd:f ? 'Branches send across the WAN to this agent' : MOD.dc.subd,
    chips:caps.length ? caps.map(c => [c, UAC[c].chip]) : [['more', 'No capabilities on']]});
}

/* The agent's footer on the map: its planned host, and the load it was sized for when one was entered */
function uaFoot(kind, i, dd){
  const z = sizing(kind, i);
  if(!capList(kind, i).length) return 'No capabilities on';
  const host = z.rc + ' vCPU / ' + z.rr + ' GB';
  if(!z.given) return dd ? 'Plan ' + host + ' RAM at the KB baseline' : 'Plan ' + host;
  return host + ' · ' + [z.d ? fmtN(z.d) + ' devices' : '', z.f ? fmtN(z.f) + ' flows/s' : ''].filter(Boolean).join(' · ');
}

/* ===== One site with a Universal Agent: the layout follows the capabilities that are on ===== */
function agentScene(kind, i){
  const dc = kind === 'dc', caps = capsOf(kind, i), on = c => caps.has(c), inst = instOf(kind, i);
  const name = dc ? dcName(i) : brName(i);
  const L = dc ? {ux:316, uw:236, cx:328, cw:212, fw:744} : {ux:304, uw:244, cx:316, cw:220, fw:552};
  const frames = [], nodes = [], edges = [], notes = [];
  frames.push({x:16, y:16, w:L.fw, h:588, label:name + (dc ? ' (on-prem)' : ''),
    labeld:dc ? (S.dcN > 1 ? name + ' (on-prem) · site ' + i + ' of ' + S.dcN : name + ' (on-prem)') : name + ' · agent at the branch'});
  frames.push(dc ? DC_NETGRP : BR_NETGRP);
  const bm = dc ? bgpMode(i) : '';
  nodes.push(...(dc ? DC_DEVICES.map(n => n.id === 'edge' && bm === 'off' ? Object.assign({}, n, {sd:'Flow · SNMP · traps'}) : n) : BR_DEVICES));

  /* Left column under the devices: only what the capabilities need */
  const feeds = dc ? feeders(i) : [];
  const left = [];
  if(on('dns')) left.push(Object.assign({}, dc ? DC_DNS : BR_DNS));
  if(!dc) left.push(Object.assign({}, BR_USERS));
  if(feeds.length){
    const one = feeds.length === 1;
    left.push({id:'brin', k:'net', icon:'store', h:64, t:one ? brName(feeds[0]) : feeds.length + ' branch offices', s:'No agent at the branch',
      sd:'Flow, traps, syslog over the WAN', go:one ? brId(feeds[0]) : 'brs',
      i:{h:(one ? brName(feeds[0]) + ' has' : 'These branches have') + ' no agent of its own. Branch routers, switches and Wi-Fi send flow, traps and syslog across the WAN to this agent, and the agent polls them back across the WAN.',
         d:['Allow UDP 9995 (flow), UDP 162 (traps) and UDP or TCP 514 (syslog) from branch devices to this agent, through WAN firewalls and SD-WAN policies.',
            'Allow UDP 161 and ICMP (SNMP/ST) and TCP 22 (Device Configuration Sync) from this agent to the branch devices.',
            'In Kentik, set this agent as the collection agent for the branch devices, and assign the devices to the branch Site so they still group by location.',
            'Size this agent for the branch flow and devices too.']}});
  }
  let y = 298;
  left.forEach(n => { n.x = 32; n.w = 240; n.h = n.h || 52; n.y = y; y += n.h + 14; });
  nodes.push(...left);
  const byId = id => left.find(n => n.id === id);

  /* Agent box and its capability chips */
  const list = DRAW_ORDER.filter(on), top = 118, step = 52;
  const chips = list.map((c, k) => ({id:'c-' + c, x:L.cx, y:top + k * step, w:L.cw, h:46, k:'chip', icon:UAC[c].icon, t:capUI(kind, i, c), s:c === 'flow' ? FLOW_MODES[fmOf(kind, i)].s : UAC[c].s, sd:UAC[c].sd, i:CAP[c], cap:c}));
  if(!chips.length) chips.push({id:'c-none', x:L.cx, y:top, w:L.cw, h:46, k:'opt', icon:'agent', t:'No capabilities on', s:'Toggle them in the side panel', sd:'Installed Capabilities',
    i:{h:'This agent is installed but has no capabilities on yet. Toggle capabilities in the side panel, the same way you do under Installed Capabilities in the portal.', d:[]}});
  const chipBottom = chips[chips.length - 1].y + 46;
  const brin = byId('brin');
  const uh = Math.max(chipBottom + 40 - 58, brin ? brin.y + brin.h + 12 - 58 : 0, !dc && on('synth') ? 352 : 230);
  const ua = {id:'ua', x:L.ux, y:58, w:L.uw, h:uh, k:'ua', icon:'agent', t:'Universal Agent', s:inst === 'docker' ? 'In Docker' : 'On a Linux host',
    sd:inst === 'docker' ? 'docker run from the portal' : 'Debian, Ubuntu, Oracle Linux',
    foot:uaFoot(kind, i), footd:uaFoot(kind, i, true), i:dc ? UA_DC_I : UA_BR_I};
  nodes.push(ua, ...chips);
  const cy = c => top + list.indexOf(c) * step + 23;
  const ex = 16 + L.fw, ey = !dc && on('synth') ? 380 : Math.round(Math.min(Math.max(58 + uh / 2, 150), 440));   // under the branch test targets
  nodes.push(EGRESS(ex, ey), KEN());
  edges.push({t:'https', a:'ua', b:'kentik', p:[[L.ux + L.uw, ey], [780, ey]], lab:'HTTPS, TLS 1.2+', labd:'TCP 443, outbound only', lp:[dc ? 652 : 674, ey - 12]});

  /* Device lines, only for capabilities that are on */
  const cx = L.cx, rx = L.cx + L.cw;
  if(on('flow')) edges.push({t:'flow', a:'netgrp', b:'c-flow', p:[[272, 104], [cx, cy('flow')]]});
  if(on('snmp')) edges.push({t:'snmp', a:'c-snmp', b:'netgrp', p:[[cx, cy('snmp')], [272, 148]], bi:true});
  if(on('trap')) edges.push({t:'trap', a:'netgrp', b:'c-trap', p:[[272, 192], [cx, cy('trap')]]});
  if(on('syslog')) edges.push({t:'syslog', a:'netgrp', b:'c-syslog', p:[[272, 236], [cx, cy('syslog')]]});   // logs come from the network devices
  if(on('dns')){ const d = byId('dnsn'); edges.push({t:'dns', a:'dnsn', b:'c-dns', p:[[272, d.y + 26], [cx, cy('dns')]]}); }
  if(on('ssh')) edges.push({t:'ssh', a:'c-ssh', b:'netgrp', p:[[cx, cy('ssh')], [298, cy('ssh')], [298, 268], [272, 268]]});
  const router = dc ? 'edge' : 'wan';
  const ur = L.ux + L.uw;
  if(on('bgp') && dc) edges.push({t:'bgp', a:router, b:'c-bgp', p:[[236, 90], [236, 50], [ur + 12, 50], [ur + 12, cy('bgp')], [rx, cy('bgp')]], lab:'BGP: routers peer with the agent', labd:'BGP Proxy, TCP 179 to the agent', lp:[(236 + ur) / 2 + 6, 50]});
  else if(on('bgp')) edges.push({t:'bgp', a:router, b:'c-bgp', p:[[236, 90], [236, 50], [294, 50], [294, cy('bgp')], [cx, cy('bgp')]], lab:'BGP', labd:'TCP 179', lp:[265, 50]});
  else if(bm === 'direct') edges.push({t:'bgp', a:'edge', b:'kentik', p:[[236, 90], [236, 50], [882, 50], [882, 130]], lab:'BGP routes: edge routers peer with Kentik', labd:'Direct iBGP on TCP 179', lp:[566, 50]});

  /* Branches with no agent of their own, across the WAN */
  if(brin){
    const r = 272, l = L.ux, b0 = brin.y;
    const ins = [['flow', 14], ['trap', 38], ['syslog', 50]].filter(c => on(c[0]));
    ins.forEach(([c, dy]) => edges.push({t:c, a:'brin', b:'c-' + c, p:[[r, b0 + dy], [l, b0 + dy]]}));
    if(on('snmp')) edges.push({t:'snmp', a:'c-snmp', b:'brin', p:[[l, b0 + 26], [r, b0 + 26]], bi:true});
  }

  /* Connectivity Test targets */
  if(on('synth')){
    if(dc){
      nodes.push(S.dcN > 1 ? Object.assign({}, REMOTE, REMOTE_MULTI) : REMOTE);
      edges.push({t:'synth', a:'c-synth', b:'remote', p:[[rx, cy('synth')], [ur + 28, cy('synth')], [ur + 28, 524], [780, 524]], lab:'Tests to other sites and apps', labd:'Ping, traceroute, DNS, HTTP', lp:[676, 512]});
    } else {
      const T = BR_TARGETS(dcOn() ? dcId(brTarget(i) || 1) : 'dc');
      frames.push(T.frame);
      nodes.push(...T.nodes);
      T.nodes.forEach(n => edges.push({t:'synth', a:'c-synth', b:n.id, p:[[rx, cy('synth')], [592, n.y + 26]], bi:n.id === 't-dc' || n.id === 't-cloud'}));
    }
  }

  /* Notes, under the left column */
  const ny = Math.max(y + 8, 446);
  if(ny < 590){
    const warn = brin && !on('flow') ? 'Turn on Flow Proxy to collect branch flow.' : '';
    if(dc) notes.push({x:32, y:ny, t:warn || 'Point devices at the agent.', td:warn || 'All agent connections are outbound.'},
                      {x:32, y:ny + 17, t:'It forwards everything to Kentik.', td:'A web proxy works (https_proxy).'});
    else notes.push({x:32, y:ny, t:'Local flow, health and tests,', td:'Agent-to-agent tests need TCP 8877'},
                    {x:32, y:ny + 17, t:'without crossing the WAN.', td:'and UDP 9977 open between agents.'});
  }
  return {frames, nodes, edges, notes};
}

/* ===== A branch with no agent: its devices send across the WAN to a data center agent ===== */
function branchRemoteScene(i){
  const name = brName(i), t = brTarget(i);
  const frames = [
    {x:16, y:16, w:280, h:588, label:name, labeld:name + ' · no agent'},
    Object.assign({}, BR_NETGRP, {w:248}),
    {id:'wan', x:312, y:58, w:150, h:296, label:'WAN or SD-WAN', cls:'sframe', ghost:true,
     i:{h:'Branch telemetry crosses your WAN to the data center agent. Flow, traps and syslog are small next to user traffic, but they need to be allowed through.',
        d:['Allow UDP 9995, UDP 162 and UDP or TCP 514 from the branch devices to the data center agent.',
           'Allow UDP 161, ICMP and TCP 22 from the data center agent back to the branch devices.',
           'SD-WAN: make sure these flows are permitted by the overlay policy and any branch firewall.']}}
  ];
  const nodes = BR_DEVICES.map(n => Object.assign({}, n, {w:224}));
  nodes.push(Object.assign({}, BR_USERS, {x:32, y:300, w:248, h:52}));
  const edges = [], notes = [];
  if(!t){
    frames.push({x:478, y:16, w:286, h:588, label:'No data center yet', cls:'frame', ghost:true});
    nodes.push({id:'nodc', x:494, y:150, w:254, h:64, k:'opt', icon:'building', t:'Add a data center', s:'Its agent collects this branch', sd:'Or give this branch an agent', go:'dc',
      i:{h:'This branch has no agent and there is no data center agent to send to. Add a data center, or turn on an agent at this branch.', d:[]}});
    nodes.push(KEN());
    notes.push({x:32, y:384, t:'Nothing collects this branch yet.', td:'Nothing collects this branch yet.'});
    return {frames, nodes, edges, notes};
  }
  const caps = capsOf('dc', t), on = c => caps.has(c), dname = dcName(t);
  const rel = ['flow', 'snmp', 'trap', 'syslog', 'ssh', 'synth'].filter(on);
  frames.push({x:478, y:16, w:286, h:588, label:dname + ' (on-prem)', labeld:dname + ' · collects for this branch', go:dcId(t)});
  const uh = Math.max(220, 64 + Math.max(rel.length, 1) * 22 + 28);
  nodes.push({id:'ua', x:494, y:90, w:254, h:uh, k:'ua', icon:'agent', t:'Universal Agent', s:'In ' + dname, sd:instOf('dc', t) === 'docker' ? 'In Docker' : 'On a Linux host', go:dcId(t),
    lines:rel.length ? rel.map(c => capUI('dc', t, c)) : ['No capabilities on'], linesd:rel.length ? rel.map(c => capUI('dc', t, c) + ' · ' + UAC[c].sd.replace('Listens on ', '')) : ['Toggle them on in ' + dname],
    foot:uaFoot('dc', t), footd:'Plan ' + sizing('dc', t).rc + ' vCPU / ' + sizing('dc', t).rr + ' GB, branch load included',
    i:{h:'The ' + dname + ' agent collects for this branch. Only the capabilities that are on at ' + dname + ' reach the branch devices.', d:UA_DC_I.d}});
  const ex = 764, ey = 90 + Math.round(uh / 2);
  nodes.push(EGRESS(ex, ey), KEN());
  edges.push({t:'https', a:'ua', b:'kentik', p:[[748, ey], [780, ey]]});
  const R = 280, U = 494;
  if(on('flow')) edges.push({t:'flow', a:'netgrp', b:'ua', p:[[R, 104], [U, 104]], lab:'Flow over the WAN', labd:'UDP 9995', lp:[387, 104]});
  if(on('snmp')) edges.push({t:'snmp', a:'ua', b:'netgrp', p:[[U, 130], [R, 130]], bi:true, lab:'SNMP polls', labd:'UDP 161 · ICMP', lp:[387, 130]});
  if(on('trap')) edges.push({t:'trap', a:'netgrp', b:'ua', p:[[R, 156], [U, 156]], lab:'Traps', labd:'UDP 162', lp:[387, 156]});
  if(on('syslog')) edges.push({t:'syslog', a:'netgrp', b:'ua', p:[[R, 182], [U, 182]], lab:'Syslog', labd:'UDP/TCP 514', lp:[387, 182]});
  if(on('ssh')) edges.push({t:'ssh', a:'ua', b:'netgrp', p:[[U, 208], [R, 208]], lab:'Config sync', labd:'SSH, TCP 22', lp:[387, 208]});
  if(on('synth')) edges.push({t:'synth', a:'ua', b:'wan', p:[[U, 240], [R, 240]], lab:'Tests to the branch', labd:'Server IP tests', lp:[387, 240]});
  const miss = ['flow', 'snmp', 'trap', 'syslog'].filter(c => !on(c)).map(c => capUI('dc', t, c));
  notes.push({x:32, y:384, t:'No agent here: devices send to', td:'No local tests: test the branch'},
             {x:32, y:401, t:'the ' + dname + ' agent.', td:'router from the data center agent.'});
  if(miss.length) notes.push({x:494, y:90 + uh + 26, t:'Off at ' + dname + ':', td:'Off at ' + dname + ':'}, {x:494, y:90 + uh + 43, t:miss.join(', '), td:miss.join(', ')});
  return {frames, nodes, edges, notes};
}

/* ===== Every data center at once: one row per site, each with its own agent ===== */
const REMOTE_MULTI = {t:'Other DCs, SaaS', go:['dcs', 'saas'],
  i:{h:'Connectivity Test targets: the agents in your other data centers, Kentik’s global and public cloud agents, SaaS apps, websites and DNS servers.',
     d:['Agent-to-agent and mesh tests between data centers need TCP 8877 and UDP 9977 open between the agents.', 'Open All data centers to see every site and the tests between them.']}};
function dcsScene(){
  const n = S.dcN, top = 58, bottom = 530, gap = n > 4 ? 8 : 14;
  const rowH = Math.min(118, Math.floor((bottom - top - (n - 1) * gap) / n));
  const nodeH = rowH >= 96 ? 52 : rowH >= 80 ? 46 : 40;
  const used = n * rowH + (n - 1) * gap, y0 = top + Math.floor((bottom - top - used) / 2);
  const frames = [{x:16, y:16, w:744, h:588, label:n > 1 ? 'Your data centers (on-prem)' : 'Your data center (on-prem)', labeld:n > 1 ? 'Your data centers: one Universal Agent at each site' : 'Your data center: one Universal Agent'}];
  const nodes = [], edges = [], rows = [];
  for(let i = 1; i <= n; i++){
    const y = y0 + (i - 1) * (rowH + gap), ny = y + 24 + Math.floor((rowH - 30 - nodeH) / 2);
    rows.push({y, ny, cy:ny + nodeH / 2});
  }
  rows.forEach((r, k) => {
    const i = k + 1, name = dcName(i), caps = capList('dc', i), f = feeders(i).length;
    frames.push({id:'site-' + i, x:32, y:r.y, w:520, h:rowH, label:name, cls:'sframe', go:dcId(i),
      i:{h:name + ' has its own Universal Agent. The site’s devices send to that agent, and the agent sends everything to Kentik over outbound HTTPS.',
         d:['Same install command and ports as every other site; the capabilities can differ per agent.', 'Assign the agent to this site’s Site in Kentik so devices and tests group by location.']}});
    nodes.push({id:'dev-' + i, x:44, y:r.ny, w:226, h:nodeH, k:'net', icon:'router', t:'Network devices', s:f ? 'Plus ' + f + (f > 1 ? ' branches' : ' branch') + ' over the WAN' : 'Routers, switches, firewalls', sd:'Flow, SNMP, traps, syslog',
      i:{h:'The routers, switches and firewalls at ' + name + (f ? ', plus the devices of ' + f + ' branch office' + (f > 1 ? 's' : '') + ' with no agent,' : '') + ' send to the local agent and answer its polls.',
         d:['Devices → agent: UDP 9995 flow, UDP 162 traps, UDP or TCP 514 syslog.', 'Agent → devices: UDP 161 SNMP, ICMP, gNMI and TCP 22 for SSH.']}});
    nodes.push({id:'ua-' + i, x:320, y:r.ny, w:216, h:nodeH, k:'uas', icon:'agent', t:'Universal Agent', s:uaFoot('dc', i), sd:caps.length ? caps.map(c => UAC[c].chip).join(', ') : 'No capabilities on', go:dcId(i),
      i:{h:'The Universal Agent for ' + name + ', ' + (instOf('dc', i) === 'docker' ? 'in Docker' : 'on a Linux host') + '. On: ' + (caps.length ? caps.map(c => capUI('dc', i, c)).join(', ') : 'nothing yet') + '.',
         d:['Install: Settings › Universal Agents › Deploy Agent gives a Linux or Docker command. Portal tokens last 1 hour.', 'Size the host for the sum of its capabilities: for example SNMP/ST 2 cores / 8 GB, Connectivity Test 2 cores / 2 GB.', 'Agent-to-agent tests with the other sites use TCP 8877 and UDP 9977.']}});
    nodes.push(Object.assign(EGRESS(760, r.cy), {id:'egress-' + i}));
    if(caps.includes('flow')) edges.push({t:'flow', a:'dev-' + i, b:'ua-' + i, p:[[270, r.cy - 7], [320, r.cy - 7]]});
    if(caps.includes('snmp')) edges.push({t:'snmp', a:'ua-' + i, b:'dev-' + i, p:[[320, r.cy + 7], [270, r.cy + 7]], bi:true});
    edges.push(Object.assign({t:'https', a:'ua-' + i, b:'kentik', p:[[536, r.cy], [780, r.cy]]},
      k ? {} : {lab:'HTTPS, TLS 1.2+', labd:'TCP 443, outbound only', lp:[652, r.cy - 13]}));
    if(k < n - 1 && caps.includes('synth') && capsOf('dc', i + 1).has('synth')){
      const nx = rows[k + 1], y1 = r.ny + nodeH, y2 = nx.ny;
      edges.push({t:'synth', a:'ua-' + i, b:'ua-' + (i + 1), p:[[428, y1], [428, y2]], c:'v', bi:true, lab:'Agent-to-agent tests', labd:'TCP 8877 · UDP 9977', lp:[438, (y1 + y2) / 2], anchor:'start'});
    }
  });
  const kh = Math.max(300, used), ky = Math.round(y0 + used / 2 - kh / 2);
  nodes.push(KEN({y:ky, h:kh, s:'One account, all sites'}));
  const ta = testAgents().length, m = meshMath(ta);
  const notes = n > 1
    ? [{x:32, y:552, t:'Every site runs the same agent with its own capabilities, all managed in one portal.', td:ta > 1 ? 'Mesh of the ' + ta + ' agents with Connectivity Test, every minute: ' + m.sub + ' subtests, ' + fmt(m.run) + ' credits per run.' : 'Turn on Connectivity Test at two or more agents to build a mesh.'},
       {x:32, y:569, t:'Agents with Connectivity Test on test the paths between sites.', td:'BGP peering is optional per site: routers peer with their agent (BGP Proxy) or with Kentik on TCP 179.'}]
    : [{x:32, y:552, t:'Add a data center with + next to Data center at the top to see more sites and the tests between them.', td:'Add a data center to see mesh test credits for your sites.'}];
  return {frames, nodes, edges, notes};
}

/* ===== Every branch at once, and where each one sends its data ===== */
function brsScene(){
  const n = S.brN, ids = Array.from({length:n}, (_, k) => k + 1);
  const order = ids.filter(i => !brUA(i)).sort((a, b) => brTarget(a) - brTarget(b) || a - b).concat(ids.filter(brUA));   // grouped by the data center they send to
  const top = 58, bottom = 590, gap = 8;
  const rh = Math.min(52, Math.floor((bottom - top - (n - 1) * gap) / n));
  const frames = [{x:16, y:16, w:330, h:588, label:n > 1 ? 'Your ' + n + ' branch offices' : 'Your branch office'}];
  const nodes = [], edges = [], notes = [], pos = {};
  order.forEach((i, k) => {
    const y = top + k * (rh + gap), ua = brUA(i), t = brTarget(i), caps = ua ? capList('br', i) : [];
    pos[i] = y + rh / 2;
    nodes.push({id:'b-' + i, x:32, y, w:298, h:rh, k:ua ? 'uas' : 'net', icon:ua ? 'agent' : 'store', t:brName(i),
      s:ua ? 'Own agent · ' + caps.length + ' capabilit' + (caps.length === 1 ? 'y' : 'ies') : t ? 'No agent · sends to ' + dcName(t) : 'No agent and no data center yet',
      sd:ua ? (caps.length ? caps.map(c => UAC[c].chip).join(', ') : 'No capabilities on') : 'Flow, traps, syslog over the WAN', go:brId(i),
      i:{h:ua ? brName(i) + ' has its own Universal Agent, which sends straight to Kentik over HTTPS.' : t ? brName(i) + ' has no agent. Its devices send across the WAN to the ' + dcName(t) + ' agent.' : brName(i) + ' has no agent, and there is no data center agent to send to yet.', d:[]}});
  });
  const targets = [...new Set(order.filter(i => !brUA(i) && brTarget(i)).map(brTarget))].sort((a, b) => a - b);
  if(targets.length){
    frames.push({x:362, y:16, w:310, h:588, label:'Data center agents'});
    const remote = order.filter(i => !brUA(i));
    const yTop = top, yBot = top + remote.length * (rh + gap) - gap, dh = Math.max(rh, 46);
    const slot = (yBot - yTop) / targets.length;
    targets.forEach((t, k) => {
      const y = Math.round(yTop + slot * k + (slot - dh) / 2), caps = capList('dc', t);
      nodes.push({id:'d-' + t, x:378, y, w:278, h:dh, k:'uas', icon:'building', t:dcName(t), s:'Universal Agent · collects ' + feeders(t).length, sd:caps.length ? caps.map(c => UAC[c].chip).join(', ') : 'No capabilities on', go:dcId(t),
        i:{h:'The ' + dcName(t) + ' agent collects for the branches that point at it.', d:['Size it for its own site plus those branches.']}});
      edges.push({t:'https', a:'d-' + t, b:'kentik', p:[[656, y + dh / 2], [780, y + dh / 2]]});
      feeders(t).forEach(i => {
        const tp = capsOf('dc', t).has('flow') ? 'flow' : capsOf('dc', t).has('syslog') ? 'syslog' : capsOf('dc', t).has('trap') ? 'trap' : 'snmp';
        edges.push({t:tp, a:'b-' + i, b:'d-' + t, p:[[330, pos[i]], [378, y + dh / 2]]});
      });
    });
  }
  let first = true;
  order.filter(brUA).forEach(i => {
    edges.push(Object.assign({t:'https', a:'b-' + i, b:'kentik', p:[[330, pos[i]], [780, pos[i]]]}, first ? {lab:'Branch agents send straight to Kentik', labd:'TCP 443, outbound only', lp:[560, pos[i] - 12]} : {}));
    first = false;
  });
  nodes.push(KEN({y:58, h:532, s:'One account, every site'}));
  return {frames, nodes, edges, notes};
}

function getScene(v){
  if(isDC(v)) return agentScene('dc', dcIndex(v));
  if(isBR(v)) return brUA(brIndex(v)) ? agentScene('br', brIndex(v)) : branchRemoteScene(brIndex(v));
  if(v === 'dcs') return dcsScene();
  if(v === 'brs') return brsScene();
  if(v === 'aws' && S.awsNested) return awsNestedScene();
  return SC[v] || null;
}

function dcsInfo(){
  const n = S.dcN, ta = testAgents().length, m = meshMath(ta);
  const hl = `<p class="lead">Every data center gets its own Universal Agent, installed on a Linux host or in Docker. Each agent runs only the capabilities its site needs, sends to the same Kentik account over outbound HTTPS, and agents with Connectivity Test on test the paths between sites.</p>
<h3>What changes when you add a site</h3><ul>
<li>One more Linux host, or Docker host, running the Universal Agent</li>
<li>The site’s routers, switches and firewalls point at their local agent</li>
<li>Branches can point at the nearest data center agent instead of getting their own</li>
<li>Kentik SaaS stays the same: one account and one portal for every agent</li></ul>`;
  const dd = `<p class="lead">Repeat the same install at each site, toggle on what each site needs, then add the agents to a mesh test.</p>
<h3>Checklist for each site</h3><ol style="padding-left:18px;margin:0 0 8px">
<li>A Linux host or Docker host sized for the capabilities you turn on, plus any branches that send to it.</li>
<li>Run the Linux or Docker command from Settings › Universal Agents › Deploy Agent, then authorize the agent. Portal tokens last 1 hour.</li>
<li>Assign the agent to its Site in Kentik, and toggle on its capabilities.</li>
<li>Point devices at the agent: UDP 9995 flow, UDP 162 traps, UDP or TCP 514 syslog.</li>
<li>Allow UDP 161, ICMP and TCP 22 from the agent to the devices.</li>
<li>Allow TCP 443 out to Kentik.</li></ol>
<h3>Mesh test credits</h3>
${ta > 1 ? `<table><thead><tr><th style="width:64%">A mesh of your ${ta} agents with Connectivity Test</th><th>Value</th></tr></thead><tbody>
<tr><td>Subtests per run (${ta} × ${ta - 1})</td><td>${m.sub}</td></tr>
<tr><td>Credits per run, at 2.5 per private subtest</td><td>${fmt(m.run)}</td></tr>
<tr><td>Credits per month, running every minute</td><td>${fmt(m.month)}</td></tr>
</tbody></table>
<p class="muted" style="font-size:12.5px">Every minute is 43,200 runs in a 30-day month, and longer intervals cost less. This matches the KB example: 4 private agents every minute is 12 subtests, 30 credits per run.</p>` : '<p>Turn on Connectivity Test at two or more agents to build a mesh between sites.</p>'}
<h3>Licensing</h3><ul>
<li>Devices at every site count toward FlowPak and NMS (DevicePak) licenses.</li>
<li>Private agents need no extra license. Their subtests cost 2.5 credits per run.</li></ul>`;
  return {kick:'Drill-in · On-prem', title:n > 1 ? 'All ' + n + ' data centers' : 'Your data center', hl, dd,
    src:[['Universal Agents','https://kb.kentik.com/docs/universal-agents'],['UA Deployment','https://kb.kentik.com/docs/ua-deployment'],['UA Portal Management','https://kb.kentik.com/docs/ua-portal-management'],['Test Types Reference','https://kb.kentik.com/docs/test-types'],['Test Credits','https://kb.kentik.com/docs/test-credits']]};
}

const INFO_BR_REMOTE = {kick:'Drill-in · On-prem', title:'Branch office with no agent',
hl:`<p class="lead">Most branches don’t get their own agent. The branch routers, switches and Wi-Fi send their telemetry across the WAN to a Universal Agent in a data center, and that agent polls them back.</p>
<h3>What you deploy at the branch</h3><ul>
<li>Nothing new: just device configuration</li>
<li>Flow export, trap and syslog targets pointing at the data center agent</li>
<li>SNMP and read-only SSH credentials for the data center agent to use</li></ul>
<h3>What you give up</h3><ul>
<li>No tests from the branch itself, so no view of what users there experience. A data center agent can still test to the branch router.</li>
<li>Telemetry crosses the WAN, so allow it through WAN firewalls and SD-WAN policy</li></ul>
<p class="note">Turn on <b>Universal Agent at this branch</b> in the panel when the site needs local tests or its own collection.</p>`,
dd:`<p class="lead">Branch devices are configured to use the data center agent as their collector.</p>
<h3>Across the WAN</h3>
<table><thead><tr><th style="width:38%">Direction</th><th style="width:30%">Port</th><th>Used by</th></tr></thead><tbody>
<tr><td>Branch devices → DC agent</td><td>UDP 9995</td><td>Flow Proxy</td></tr>
<tr><td>Branch devices → DC agent</td><td>UDP 162</td><td>SNMP Trap Receiver</td></tr>
<tr><td>Branch devices → DC agent</td><td>UDP and TCP 514</td><td>Syslog Server</td></tr>
<tr><td>DC agent → branch devices</td><td>UDP 161, ICMP</td><td>SNMP/ST</td></tr>
<tr><td>DC agent → branch devices</td><td>TCP 22</td><td>Device Configuration Sync</td></tr>
</tbody></table>
<h3>In Kentik</h3><ul>
<li>Add the branch devices with the data center agent as their collection agent (SNMP tab: Flow Enrichment or Full Monitoring via Universal Agent).</li>
<li>Assign the devices to the branch Site, so dashboards and maps still group them by location.</li>
<li>Set each device’s flow sample rate in Kentik to match the router.</li></ul>
<h3>Sizing</h3><p>Enter this branch’s devices and flows under Branch load and they are added to the data center agent’s sizing. SNMP/ST covers up to 500 devices per 2 cores / 8 GB. Flow Proxy Forwarding handles 20,000+ flows per second on 1 core / 2 GB; Edge Processing needs 8 cores / 32 GB per 25,000.</p>`,
src:[['Universal Agents','https://kb.kentik.com/docs/universal-agents'],['Device Settings','https://kb.kentik.com/docs/device-settings'],['Router Configuration','https://kb.kentik.com/docs/router-configuration'],['NMS Setup','https://kb.kentik.com/docs/nms-setup']]};

function brsInfo(){
  const n = S.brN, own = brIds().filter(id => brUA(brIndex(id))).length;
  return {kick:'Drill-in · On-prem', title:n > 1 ? 'All ' + n + ' branch offices' : 'Your branch office',
    hl:`<p class="lead">${own ? own + ' of ' + n + ' branch' + (n > 1 ? 'es have' : ' has') + ' an agent of their own.' : 'No branch has an agent of its own.'} The others send across the WAN to the data center agent they point at.</p>
<h3>When to give a branch an agent</h3><ul><li>You want tests from where the users are</li><li>The site is large, or far from a data center</li><li>You want to keep its telemetry off the WAN</li></ul>`,
    dd:`<p class="lead">Branches without an agent need UDP 9995, 162 and 514 allowed toward their data center agent, and UDP 161, ICMP and TCP 22 back. Branches with an agent need only TCP 443 out, plus TCP 8877 and UDP 9977 for agent-to-agent tests.</p>`,
    src:INFO_BR_REMOTE.src};
}

function getInfo(v){
  if(isDC(v)) return Object.assign({}, INFO.dc, {title:dcName(dcIndex(v)) + ' with a Universal Agent', site:['dc', dcIndex(v)]});
  if(isBR(v)){ const i = brIndex(v); return Object.assign({}, brUA(i) ? INFO.branch : INFO_BR_REMOTE, {title:brName(i) + (brUA(i) ? ' with a Universal Agent' : ': no agent, sends to ' + (brTarget(i) ? dcName(brTarget(i)) : 'a data center')), site:['br', i]}); }
  if(v === 'dcs') return Object.assign(dcsInfo(), {sites:'dc'});
  if(v === 'brs') return Object.assign(brsInfo(), {sites:'br'});
  return INFO[v];
}

/* ===== Panel cards: rename sites, choose where a branch sends, toggle capabilities ===== */
const BLDG = '<svg class="ico ico-left" aria-hidden="true"><use href="#i-building"/></svg>';
const STORE = '<svg class="ico ico-left" aria-hidden="true"><use href="#i-store"/></svg>';
/* AWS: one account, or nested (a primary account whose role assumes a role in each secondary account) */
function awsCard(){
  const n = !!S.awsNested;
  return `<div class="card site"><h4><svg class="ico ico-right" aria-hidden="true"><use href="#i-cloud"/></svg>AWS accounts<span class="tag">${n ? 'Nested' : 'One account'}</span></h4>
<div class="seg mini" role="group" aria-label="AWS accounts">${[[0, 'One account'], [1, 'Several (nested)']].map(o => `<button type="button" data-awsn="${o[0]}" aria-pressed="${n === !!o[0]}">${o[1]}</button>`).join('')}</div>
<p style="font-size:12.5px;margin:8px 0 0">${n ? 'Kentik assumes the primary role in account A; that role assumes a secondary role in each other account.' : 'Kentik assumes one read-only role in your account.'}</p></div>`;
}
function instSeg(kind, i){
  const v = instOf(kind, i);
  return `<div class="fld"><span>Install the agent</span><div class="seg mini" role="group" aria-label="Install method">${[['linux', 'Linux host'], ['docker', 'Docker']].map(o => `<button type="button" data-inst="${kind}:${i}:${o[0]}" aria-pressed="${v === o[0]}">${o[1]}</button>`).join('')}</div></div>`;
}
function capsCard(kind, i, dd){
  const caps = capsOf(kind, i), n = caps.size, fm = fmOf(kind, i);
  const modeSeg = `<div class="fmseg"><div class="seg mini" role="group" aria-label="Flow Proxy mode">${[['forward', 'Forwarding'], ['edge', 'Edge Processing']].map(o => `<button type="button" data-fm="${kind}:${i}:${o[0]}" aria-pressed="${fm === o[0]}">${o[1]}</button>`).join('')}</div><span>${fm === 'edge' ? 'Decodes on the agent: 8 cores / 32 GB per 25k flows/s' : 'Kentik decodes: 1 core / 2 GB per 20k flows/s'}</span></div>`;
  const rows = UACAPS.map(c => {
    const on = caps.has(c.id), ui = capUI(kind, i, c.id), sub = c.id === 'flow' ? FLOW_MODES[fm].s : dd ? c.sd : c.s;
    return `<div class="caprow${on ? ' on' : ''}"><button type="button" class="sw" role="switch" aria-checked="${on}" data-cap="${kind}:${i}:${c.id}" aria-label="${esc(ui)}"><span></span></button><div class="capt"><b>${esc(ui)}${c.aka ? ' <span class="aka">(AKA ' + c.aka + ')</span>' : ''}</b><span>${esc(sub)}</span></div></div>` + (c.id === 'flow' && on ? modeSeg : '');
  }).join('');
  return `<div class="card caps"><div class="caphead"><div><h4>Installed capabilities</h4><p>Running on this agent. The diagram follows what you turn on.</p></div><span class="capn" aria-label="${n} on">${n}</span></div>${rows}
<div class="btns" style="margin-top:6px"><button type="button" data-capall="${kind}:${i}:1">Turn all on</button><button type="button" data-capall="${kind}:${i}:0">Turn all off</button></div></div>` + loadCard(kind, i);
}
/* Optional load: devices and flows. Collapsed by default so the panel stays simple. */
function sizeLine(kind, i){
  if(!capList(kind, i).length) return 'Turn on a capability to size this agent.';
  const z = sizing(kind, i), f = kind === 'dc' ? feeders(i).filter(b => { const q = szOf('br', b); return q.d || q.f; }).length : 0;
  return `Plan <b>${z.rc} vCPU / ${z.rr} GB RAM</b> ` + (z.given ? `for ${[z.d ? fmt(z.d) + ' devices' : '', z.f ? fmt(z.f) + ' flows/s' : ''].filter(Boolean).join(' and ')}${f ? ', branch load included' : ''}` : 'at the KB baseline (up to 500 devices, 20k+ flows/s)')
    + ', with 30% headroom.' + (z.est ? ' Above the KB flow figure this is an estimate: confirm with your Infoblox team.' : '');
}
function loadCard(kind, i){
  const z = szOf(kind, i), agentless = kind === 'br' && !brUA(i), t = agentless ? brTarget(i) : 0;
  const inp = (k, label, ph) => `<label class="fld"><span>${label}</span><input type="number" min="0" max="10000000" step="1" inputmode="numeric" data-sz="${kind}:${i}:${k}" value="${z[k] || ''}" placeholder="${ph}"></label>`;
  const out = agentless ? (t ? `Added to the ${esc(dcName(t))} agent’s sizing.` : 'Add a data center to collect this branch.') : sizeLine(kind, i);
  return `<details class="card load"${S.szOpen ? ' open' : ''}><summary><h4>${agentless ? 'Branch load' : 'Size this agent'}<span class="tag">Optional</span></h4></summary>
<p>${agentless ? 'Devices and flows at this branch. They count toward the data center agent it sends to.' : 'Enter what this agent collects to size its host. Leave blank to use the KB baseline.'}</p>
<div class="ldrow">${inp('d', 'Network devices', 'e.g. 200')}${inp('f', 'Flows per second', 'e.g. 20000')}</div>
<p class="szout" data-szout="${kind}:${i}">${out}</p></details>`;
}
function bgpCard(i, dd){
  const m = bgpMode(i), on = m !== 'off';
  const sub = !on ? 'Off: no routing data. Many enterprises skip it.' : m === 'ua' ? 'Routers peer with this agent (BGP Proxy)' : 'Routers peer directly with Kentik';
  const seg = on ? `<div class="fld"><span>Routers peer with</span><div class="seg mini" role="group" aria-label="BGP peering">${[['direct', 'Kentik directly'], ['ua', 'The agent (BGP Proxy)']].map(o => `<button type="button" data-bgp="${i}:${o[0]}" aria-pressed="${m === o[0]}">${o[1]}</button>`).join('')}</div></div>` : '';
  const dd1 = on && dd ? `<p class="muted" style="font-size:12px;margin:4px 0 0">${m === 'ua' ? 'TCP 179 from the edge routers to the agent; the agent relays routes over HTTPS.' : 'TCP 179 between the edge routers and Kentik’s ingest peering IPs (device settings › BGP).'}</p>` : '';
  return `<div class="caprow solo${on ? ' on' : ''}"><button type="button" class="sw" role="switch" aria-checked="${on}" data-bgpon="${i}" aria-label="BGP peering"><span></span></button><div class="capt"><b>BGP peering</b><span>${sub}</span></div></div>${seg}${dd1}`;
}
function siteCard(i, dd){
  const n = S.dcN, f = feeders(i).length;
  return `<div class="card site"><h4>${BLDG}${n > 1 ? 'Site ' + i + ' of ' + n : 'This data center'}<span class="tag">Universal Agent</span></h4>
<label class="fld"><span>Site name</span><input type="text" class="nameIn" data-name="dc:${i}" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(dcCustom(i))}" placeholder="${esc(dcDefault(i))}"></label>
${instSeg('dc', i)}${f ? `<p style="font-size:12.5px">Collects for ${f} branch${f > 1 ? 'es' : ''} with no agent.</p>` : ''}
${bgpCard(i, dd)}
<div class="btns"><button type="button" data-dcadd="1"${n < DC_MAX ? '' : ' disabled'}>+ Add a data center</button>${n > 1 ? `<button type="button" data-dcdel="${i}">Remove this site</button><button type="button" data-go="dcs">All ${n} together ›</button>` : ''}</div></div>` + capsCard('dc', i, dd);
}
function branchCard(i, dd){
  const n = S.brN, ua = brUA(i), t = brTarget(i);
  const sel = dcOn() ? `<label class="fld"><span>Sends its data to</span><select class="toSel" data-to="${i}">${dcIds().map((id, k) => `<option value="${k + 1}"${t === k + 1 ? ' selected' : ''}>${esc(dcName(k + 1))} agent</option>`).join('')}</select></label>`
    : '<p class="note">No data center is selected, so nothing collects this branch. Add a data center or turn on an agent here.</p>';
  return `<div class="card site"><h4>${STORE}${n > 1 ? 'Branch ' + i + ' of ' + n : 'This branch'}<span class="tag">${ua ? 'Universal Agent' : 'No agent'}</span></h4>
<label class="fld"><span>Branch name</span><input type="text" class="nameIn" data-name="br:${i}" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(brCustom(i))}" placeholder="${esc(brDefault(i))}"></label>
<div class="caprow solo${ua ? ' on' : ''}"><button type="button" class="sw" role="switch" aria-checked="${ua}" data-brua="${i}" aria-label="Universal Agent at this branch"><span></span></button><div class="capt"><b>Universal Agent at this branch</b><span>${ua ? 'Collects locally and tests from the branch' : 'Off: devices send across the WAN to a data center'}</span></div></div>
${ua ? instSeg('br', i) : sel}
<div class="btns"><button type="button" data-bradd="1"${n < BR_MAX ? '' : ' disabled'}>+ Add a branch</button><button type="button" data-brdel="${i}">Remove this branch</button>${n > 1 ? `<button type="button" data-go="brs">All ${n} branches ›</button>` : ''}</div></div>` + (ua ? capsCard('br', i, dd) : loadCard('br', i));
}
function sitesCard(kind){
  const dc = kind === 'dc', n = dc ? S.dcN : S.brN, max = dc ? DC_MAX : BR_MAX;
  const ids = dc ? dcIds() : brIds(), nm = k => dc ? dcName(k) : brName(k);
  return `<div class="card site"><h4>${dc ? BLDG : STORE}${n} ${dc ? 'data center' : 'branch office'}${n === 1 ? '' : dc ? 's' : 's'}<span class="tag">Up to ${max}</span></h4>
<p>${dc ? 'Each data center has its own Universal Agent.' : 'Each branch either has an agent or sends to a data center agent.'} Open a site to rename it or toggle its capabilities.</p>
<div class="btns">${ids.map((id, k) => `<button type="button" data-go="${id}">${esc(nm(k + 1))} ›</button>`).join('')}<button type="button" data-${dc ? 'dcadd' : 'bradd'}="1"${n < max ? '' : ' disabled'}>+ Add</button>${n > 1 ? `<button type="button" data-${dc ? 'dcstep' : 'brstep'}="-1">− Remove the last</button>` : ''}</div></div>`;
}
