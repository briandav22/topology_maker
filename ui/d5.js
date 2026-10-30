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
/* A branch agent collects everything (full), or runs only Connectivity Test (test): then the branch devices still send to a data center agent */
function brRole(i){ return !brUA(i) ? 'none' : S.brRole[i - 1] === 'test' ? 'test' : 'full'; }
const brRemote = i => brRole(i) !== 'full';
const dcOn = () => S.sel.has('dc');
const brOn = () => S.sel.has('branch');
function brTarget(i){ if(!dcOn()) return 0; const t = +S.brTo[i - 1] || 1; return t >= 1 && t <= S.dcN ? t : 1; }
function feeders(dc){ return brOn() ? brIds().map(brIndex).filter(i => brRemote(i) && brTarget(i) === dc) : []; }

/* ----- Cloud network sites: an optional Universal Agent, and network appliances (for example Palo Alto VM-Series), in each cloud ----- */
const CLOUD_IDS = ['aws', 'azure', 'gcp', 'oci'];
const CL = {   // where an agent runs in each cloud, what its network is called, and the private link to the data centers
  aws:{on:'On EC2', vm:'an EC2 instance', net:'VPC', link:'Direct Connect', linkd:'Direct Connect or Site-to-Site VPN'},
  azure:{on:'On an Azure VM', vm:'an Azure VM', net:'VNet', link:'ExpressRoute', linkd:'ExpressRoute or VPN Gateway'},
  gcp:{on:'On a Compute Engine VM', vm:'a Compute Engine VM', net:'VPC', link:'Cloud Interconnect', linkd:'Cloud Interconnect or Cloud VPN'},
  oci:{on:'On an OCI instance', vm:'an OCI compute instance', net:'VCN', link:'FastConnect', linkd:'FastConnect or Site-to-Site VPN'}
};
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);   // 'On EC2' → 'on EC2'
const CL_DEF = ['flow', 'snmp', 'trap', 'syslog', 'synth'];
const TEST_ONLY = new Set(['synth']);   // the capabilities of a tests-only agent; never changed
const AP_MAX = 500;
const isCU = v => typeof v === 'string' && /^(aws|azure|gcp|oci)-ua$/.test(v);
const cuId = c => c + '-ua';
const cuOf = v => v.slice(0, -3);
function clOf(c){ return S.cl[c] || (S.cl[c] = {ua:'none', inst:'linux', caps:null, fm:'forward', sz:{d:0, f:0}, ap:0, to:1}); }
const clRole = c => clOf(c).ua;
function clTarget(c){ if(!dcOn()) return 0; const t = +clOf(c).to || 1; return t >= 1 && t <= S.dcN ? t : 1; }
const clRemote = c => S.sel.has(c) && clOf(c).ap > 0 && clRole(c) !== 'full';   // appliance data goes to a data center agent
const clUsed = c => clRole(c) !== 'none' || clOf(c).ap > 0;
const clSite = c => MOD[c].name + ' ' + CL[c].net;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
function cfeeders(dc){ return CLOUD_IDS.filter(c => clRemote(c) && clTarget(c) === dc); }

const modOf = v => isDC(v) || v === 'dcs' ? 'dc' : isBR(v) || v === 'brs' ? 'branch' : isCU(v) ? cuOf(v) : MOD[v] ? v : null;

/* ----- Per-agent capabilities and install method ----- */
function capsOf(kind, i){
  if(kind === 'cl'){ const o = clOf(i); return o.ua === 'test' ? TEST_ONLY : o.caps || (o.caps = new Set(CL_DEF)); }
  if(kind === 'br' && brRole(i) === 'test') return TEST_ONLY;
  const arr = kind === 'dc' ? S.dcCaps : S.brCaps;
  if(!arr[i - 1]) arr[i - 1] = new Set(kind === 'dc' ? DC_DEF : BR_DEF);
  return arr[i - 1];
}
/* BGP peering at a data center: off, routers peer directly with Kentik, or with the agent (BGP Proxy on) */
function bgpMode(i){ return capsOf('dc', i).has('bgp') ? 'ua' : S.dcBgp[i - 1] === 'direct' ? 'direct' : 'off'; }
function instOf(kind, i){ return (kind === 'cl' ? clOf(i).inst : (kind === 'dc' ? S.dcInst : S.brInst)[i - 1]) === 'docker' ? 'docker' : 'linux'; }
const capList = (kind, i) => DRAW_ORDER.filter(c => capsOf(kind, i).has(c));
/* Flow Proxy runs in one of two modes. Forwarding sends raw flow to Kentik SaaS to decode; Edge Processing decodes on the agent. */
const FLOW_MODES = {
  forward:{ui:'Flow Proxy Forwarding', short:'Forwarding', s:'Forwards raw flow; Kentik decodes it', cpu:1, ram:2, per:20000},
  edge:{ui:'Flow Proxy Edge Processing', short:'Edge Processing', s:'Decodes flow on the agent', cpu:8, ram:32, per:25000}
};
function fmOf(kind, i){ return (kind === 'cl' ? clOf(i).fm : (kind === 'dc' ? S.dcFm : S.brFm)[i - 1]) === 'edge' ? 'edge' : 'forward'; }
const capUI = (kind, i, c) => c === 'flow' ? FLOW_MODES[fmOf(kind, i)].ui : UAC[c].ui;
/* Optional load per site: network devices and flows per second. 0 means not given, so sizing uses the KB baseline.
   A cloud's devices are its appliance count. */
function szOf(kind, i){ if(kind === 'cl') return clOf(i).sz; const a = kind === 'dc' ? S.dcSz : S.brSz; return a[i - 1] || (a[i - 1] = {d:0, f:0}); }
const SNMP_PER = 500;
function sizing(kind, i){
  const list = capList(kind, i), own = szOf(kind, i);
  let d = kind === 'cl' ? clOf(i).ap : own.d || 0, f = own.f || 0;
  if(kind === 'dc'){   // sites whose devices send to this agent add their load here
    feeders(i).forEach(b => { const z = szOf('br', b); d += z.d || 0; f += z.f || 0; });
    cfeeders(i).forEach(c => { d += clOf(c).ap; f += szOf('cl', c).f || 0; });
  }
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
  CLOUD_IDS.forEach(c => { if(S.sel.has(c) && clRole(c) !== 'none' && capsOf('cl', c).has('synth')) out.push(clSite(c)); });
  return out;
}
function meshMath(n){ const sub = n * (n - 1), run = sub * 2.5; return {sub, run, month:run * 43200}; }
const fmt = v => v.toLocaleString('en-US', {maximumFractionDigits:1});

function dcMod(id){
  const i = dcIndex(id), f = feeders(i).length, cf = cfeeders(i).length, caps = capList('dc', i);
  const also = [f ? plural(f, 'branch', 'branches') : '', cf ? plural(cf, 'cloud') : ''].filter(Boolean).join(' and ');
  return Object.assign({}, MOD.dc, {id, name:dcName(i),
    sub:also ? 'Also collects for ' + also : caps.length + ' capabilit' + (caps.length === 1 ? 'y' : 'ies') + ' on',
    subd:also ? (f ? 'Branches send across the WAN to this agent' : 'Cloud appliances send to this agent') : MOD.dc.subd,
    chips:caps.length ? caps.map(c => [c, UAC[c].chip]) : [['more', 'No capabilities on']]});
}
/* A cloud's card on the overview: the flow logs, plus an agent or appliances when the design has them */
function cloudMod(c){
  const m = MOD[c], o = clOf(c), role = o.ua, ap = o.ap;
  if(role === 'none' && !ap) return m;
  const t = clTarget(c), aps = plural(ap, 'appliance');
  return Object.assign({}, m, {
    tag:role === 'full' ? 'Logs + agent' : role === 'test' ? 'Logs + test agent' : 'Logs + appliances',
    sub:role === 'full' ? (ap ? 'An agent collects ' + aps : 'Flow logs, plus an agent') : ap ? aps + ' send to ' + (t ? dcName(t) : 'no agent yet') : 'Flow logs, plus a test agent',
    subd:role === 'full' ? CL[c].on + ', outbound TCP 443' : ap ? 'Across ' + CL[c].link + ': UDP 9995, 162, 514' : CL[c].on + ', TCP 8877 · UDP 9977',
    chips:m.chips.concat(ap ? [['flow', 'Appliances']] : [], role !== 'none' && capsOf('cl', c).has('synth') ? [['synth', 'Tests']] : [])});
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
  const dc = kind === 'dc', cl = kind === 'cl', caps = capsOf(kind, i), on = c => caps.has(c), inst = instOf(kind, i);
  const name = dc ? dcName(i) : cl ? clSite(i) : brName(i);
  const devs = !cl || clOf(i).ap > 0;   // a cloud may have an agent and no appliances
  const L = dc ? {ux:316, uw:236, cx:328, cw:212, fw:744} : {ux:304, uw:244, cx:316, cw:220, fw:552};
  const frames = [], nodes = [], edges = [], notes = [];
  frames.push({x:16, y:16, w:L.fw, h:588, label:name + (dc ? ' (on-prem)' : ''),
    labeld:dc ? (S.dcN > 1 ? name + ' (on-prem) · site ' + i + ' of ' + S.dcN : name + ' (on-prem)') : cl ? name + ' · Universal Agent ' + lc(CL[i].on) : name + ' · agent at the branch'});
  frames.push(dc ? DC_NETGRP : cl ? CL_NETGRP(i) : BR_NETGRP);
  const bm = dc ? bgpMode(i) : '';
  nodes.push(...(dc ? DC_DEVICES.map(n => n.id === 'edge' && bm === 'off' ? Object.assign({}, n, {sd:'Flow · SNMP · traps'}) : n) : cl ? (devs ? CL_DEVICES(i) : [CL_NONE(i)]) : BR_DEVICES));

  /* Left column under the devices: only what the capabilities need */
  const feeds = dc ? feeders(i) : [], cfeeds = dc ? cfeeders(i) : [];
  const left = [];
  if(on('dns')) left.push(Object.assign({}, dc ? DC_DNS : BR_DNS));
  if(!dc) left.push(Object.assign({}, cl ? CL_WORK(i) : BR_USERS));
  if(feeds.length){
    const one = feeds.length === 1, someTest = feeds.some(b => brRole(b) === 'test'), allTest = feeds.every(b => brRole(b) === 'test');
    left.push({id:'brin', k:'net', icon:'store', h:64, t:one ? brName(feeds[0]) : feeds.length + ' branch offices', s:allTest ? 'Tests-only agent at the branch' : someTest ? 'No agent, or a tests-only agent' : 'No agent at the branch',
      sd:'Flow, traps, syslog over the WAN', go:one ? brId(feeds[0]) : 'brs',
      i:{h:'Routers, switches and Wi-Fi at ' + (one ? brName(feeds[0]) : 'these branches') + ' send flow, traps and syslog across the WAN to this agent, and the agent polls them back across the WAN.' + (someTest ? ' A tests-only agent at the branch runs Connectivity Test only.' : ''),
         d:['Allow UDP 9995 (flow), UDP 162 (traps) and UDP or TCP 514 (syslog) from branch devices to this agent, through WAN firewalls and SD-WAN policies.',
            'Allow UDP 161 and ICMP (SNMP/ST) and TCP 22 (Device Configuration Sync) from this agent to the branch devices.',
            'In Kentik, set this agent as the collection agent for the branch devices, and assign the devices to the branch Site so they still group by location.',
            'Size this agent for the branch flow and devices too.']}});
  }
  if(cfeeds.length){
    const one = cfeeds.length === 1, n = cfeeds.reduce((t, c) => t + clOf(c).ap, 0), links = cfeeds.map(c => CL[c].link).join(' and ');
    left.push({id:'clin', k:'net', icon:'cloud', h:64, t:one ? MOD[cfeeds[0]].name + ' appliances' : cfeeds.length + ' clouds', s:plural(n, 'appliance') + (one ? ', no agent there' : ''),
      sd:'Flow, traps, syslog over ' + (one ? CL[cfeeds[0]].link : 'private links'), go:one ? cuId(cfeeds[0]) : null,
      i:{h:'Network appliances in ' + cfeeds.map(c => MOD[c].name).join(' and ') + ', for example Palo Alto VM-Series, send flow, traps and syslog to this agent across ' + links + ', and the agent polls them back.',
         d:['Allow UDP 9995, UDP 162 and UDP or TCP 514 from the appliances to this agent, in the cloud security groups or NSGs and in the data center firewall.',
            'Allow UDP 161 and ICMP from this agent back to the appliances.',
            'In Kentik, add each appliance as a device with this agent as its collection agent, and assign it to a Site for the cloud.',
            'Size this agent for the appliance flow and devices too.']}});
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
  const brin = byId('brin'), clin = byId('clin'), inn = clin || brin;
  const uh = Math.max(chipBottom + 40 - 58, inn ? inn.y + inn.h + 12 - 58 : 0, !dc && on('synth') ? 352 : 230);
  const ua = {id:'ua', x:L.ux, y:58, w:L.uw, h:uh, k:'ua', icon:'agent', t:'Universal Agent', s:inst === 'docker' ? 'In Docker' : cl ? CL[i].on : 'On a Linux host',
    sd:inst === 'docker' ? 'docker run from the portal' : cl ? 'Linux VM: Debian, Ubuntu, Oracle Linux' : 'Debian, Ubuntu, Oracle Linux',
    foot:uaFoot(kind, i), footd:uaFoot(kind, i, true), i:dc ? UA_DC_I : cl ? UA_CL_I(i) : UA_BR_I};
  nodes.push(ua, ...chips);
  const cy = c => top + list.indexOf(c) * step + 23;
  const ex = 16 + L.fw, ey = !dc && on('synth') ? 380 : Math.round(Math.min(Math.max(58 + uh / 2, 150), 440));   // under the branch test targets
  nodes.push(EGRESS(ex, ey), KEN());
  edges.push({t:'https', a:'ua', b:'kentik', p:[[L.ux + L.uw, ey], [780, ey]], lab:'HTTPS, TLS 1.2+', labd:'TCP 443, outbound only', lp:[dc ? 652 : 674, ey - 12]});

  /* Device lines, only for capabilities that are on */
  const cx = L.cx, rx = L.cx + L.cw;
  if(devs){
    if(on('flow')) edges.push({t:'flow', a:'netgrp', b:'c-flow', p:[[272, 104], [cx, cy('flow')]]});
    if(on('snmp')) edges.push({t:'snmp', a:'c-snmp', b:'netgrp', p:[[cx, cy('snmp')], [272, 148]], bi:true});
    if(on('trap')) edges.push({t:'trap', a:'netgrp', b:'c-trap', p:[[272, 192], [cx, cy('trap')]]});
    if(on('syslog')) edges.push({t:'syslog', a:'netgrp', b:'c-syslog', p:[[272, 236], [cx, cy('syslog')]]});   // logs come from the network devices
    if(on('ssh')) edges.push({t:'ssh', a:'c-ssh', b:'netgrp', p:[[cx, cy('ssh')], [298, cy('ssh')], [298, 268], [272, 268]]});
  }
  if(on('dns')){ const d = byId('dnsn'); edges.push({t:'dns', a:'dnsn', b:'c-dns', p:[[272, d.y + 26], [cx, cy('dns')]]}); }
  const router = dc ? 'edge' : cl ? 'fw' : 'wan';
  const ur = L.ux + L.uw;
  if(on('bgp') && dc) edges.push({t:'bgp', a:router, b:'c-bgp', p:[[236, 90], [236, 50], [ur + 12, 50], [ur + 12, cy('bgp')], [rx, cy('bgp')]], lab:'BGP: routers peer with the agent', labd:'BGP Proxy, TCP 179 to the agent', lp:[(236 + ur) / 2 + 6, 50]});
  else if(on('bgp')) edges.push({t:'bgp', a:router, b:'c-bgp', p:[[236, 90], [236, 50], [294, 50], [294, cy('bgp')], [cx, cy('bgp')]], lab:'BGP', labd:'TCP 179', lp:[265, 50]});
  else if(bm === 'direct') edges.push({t:'bgp', a:'edge', b:'kentik', p:[[236, 90], [236, 50], [882, 50], [882, 130]], lab:'BGP routes: edge routers peer with Kentik', labd:'Direct iBGP on TCP 179', lp:[566, 50]});

  /* Sites whose devices send here: branches across the WAN, and cloud appliances across a private link */
  [brin, clin].filter(Boolean).forEach(n => {
    const r = 272, l = L.ux, b0 = n.y;
    const ins = [['flow', 14], ['trap', 38], ['syslog', 50]].filter(c => on(c[0]));
    ins.forEach(([c, dy]) => edges.push({t:c, a:n.id, b:'c-' + c, p:[[r, b0 + dy], [l, b0 + dy]]}));
    if(on('snmp')) edges.push({t:'snmp', a:'c-snmp', b:n.id, p:[[l, b0 + 26], [r, b0 + 26]], bi:true});
  });

  /* Connectivity Test targets */
  if(on('synth')){
    if(dc){
      nodes.push(S.dcN > 1 ? Object.assign({}, REMOTE, REMOTE_MULTI) : REMOTE);
      edges.push({t:'synth', a:'c-synth', b:'remote', p:[[rx, cy('synth')], [ur + 28, cy('synth')], [ur + 28, 524], [780, 524]], lab:'Tests to other sites and apps', labd:'Ping, traceroute, DNS, HTTP', lp:[676, 512]});
    } else {
      const T = BR_TARGETS(dcOn() ? dcId((cl ? clTarget(i) : brTarget(i)) || 1) : 'dc');
      frames.push(T.frame);
      nodes.push(...T.nodes);
      T.nodes.forEach(n => edges.push({t:'synth', a:'c-synth', b:n.id, p:[[rx, cy('synth')], [592, n.y + 26]], bi:n.id === 't-dc' || n.id === 't-cloud'}));
    }
  }

  /* Notes, under the left column */
  const ny = Math.max(y + 8, 446);
  if(ny < 590){
    const warn = inn && !on('flow') ? 'Turn on Flow Proxy to collect the flow sent here.' : '';
    if(dc) notes.push({x:32, y:ny, t:warn || 'Point devices at the agent.', td:warn || 'All agent connections are outbound.'},
                      {x:32, y:ny + 17, t:'It forwards everything to Kentik.', td:'A web proxy works (https_proxy).'});
    else if(cl) notes.push({x:32, y:ny, t:'Appliance data stays in ' + MOD[i].name + ';', td:'Security group: UDP 9995, 162, 514 in;'},
                           {x:32, y:ny + 17, t:'only results leave on TCP 443.', td:'TCP 8877 and UDP 9977 with other agents.'});
    else notes.push({x:32, y:ny, t:'Local flow, health and tests,', td:'Agent-to-agent tests need TCP 8877'},
                    {x:32, y:ny + 17, t:'without crossing the WAN.', td:'and UDP 9977 open between agents.'});
  }
  return {frames, nodes, edges, notes};
}

/* ===== A site whose devices send to a data center agent: a branch with no agent or a tests-only agent,
   or the appliances in a cloud with no agent or a tests-only agent ===== */
function remoteScene(kind, i){
  const cl = kind === 'cl', role = cl ? clRole(i) : brRole(i), test = role === 'test';
  const name = cl ? clSite(i) : brName(i), t = cl ? clTarget(i) : brTarget(i), devs = !cl || clOf(i).ap > 0;
  const who = cl ? 'appliances' : 'devices', place = cl ? 'inside ' + MOD[i].name : 'the branch';
  const frames = [
    {x:16, y:16, w:280, h:588, label:name, labeld:name + (test ? ' · tests-only agent' : ' · no agent')},
    Object.assign({}, cl ? CL_NETGRP(i) : BR_NETGRP, {w:248}),
    {id:'wan', x:312, y:58, w:150, h:296, label:cl ? CL[i].link : 'WAN or SD-WAN', cls:'sframe', ghost:true,
     i:cl ? {h:'Appliance telemetry crosses ' + CL[i].linkd + ' to the data center agent. It is small next to the traffic it describes, but the cloud security groups and the data center firewall must allow it.',
             d:['Allow UDP 9995, UDP 162 and UDP or TCP 514 from the appliances to the data center agent.',
                'Allow UDP 161 and ICMP from the data center agent back to the appliances.',
                'Route between the appliances and the agent over the private link, not the Internet.']}
          : {h:'Branch telemetry crosses your WAN to the data center agent. Flow, traps and syslog are small next to user traffic, but they need to be allowed through.',
             d:['Allow UDP 9995, UDP 162 and UDP or TCP 514 from the branch devices to the data center agent.',
                'Allow UDP 161, ICMP and TCP 22 from the data center agent back to the branch devices.',
                'SD-WAN: make sure these flows are permitted by the overlay policy and any branch firewall.']}}
  ];
  const nodes = (cl ? (devs ? CL_DEVICES(i) : [CL_NONE(i)]) : BR_DEVICES).map(n => Object.assign({}, n, {w:224}));
  nodes.push(Object.assign({}, cl ? CL_WORK(i) : BR_USERS, {x:32, y:300, w:248, h:52}));
  const edges = [], notes = [];
  if(test){
    const z = sizing(kind, i), on = instOf(kind, i) === 'docker' ? 'in Docker' : cl ? lc(CL[i].on) : 'on a Linux host';
    nodes.push({id:'ua-t', x:32, y:368, w:248, h:64, k:'uas', icon:'agent', t:'Universal Agent', s:'Tests only, ' + on, sd:'Connectivity Test · TCP 8877, UDP 9977',
      i:{h:'A Universal Agent that runs only Connectivity Test. It tests from ' + place + ', while the ' + who + ' still send their flow, traps and syslog to a data center agent.',
         d:['Plan ' + z.rc + ' vCPU / ' + z.rr + ' GB RAM: Connectivity Test needs 2 cores / 2 GB, plus 30% headroom.',
            'It needs outbound TCP 443 to Kentik, and TCP 8877 and UDP 9977 with the agents it tests with.',
            'In the portal, turn on Connectivity Test only. The ' + who + ' keep the data center agent as their collection agent.']}});
  }
  const toKentik = {t:'https', a:'ua-t', b:'kentik', p:[[44, 432], [44, 590], [770, 590], [770, 440], [780, 440]], lab:'Test results over HTTPS', labd:'TCP 443, outbound only', lp:[540, 584]};
  if(!t){
    frames.push({x:478, y:16, w:286, h:588, label:'No data center yet', cls:'frame', ghost:true});
    nodes.push({id:'nodc', x:494, y:150, w:254, h:64, k:'opt', icon:'building', t:'Add a data center', s:'Its agent collects the ' + who, sd:cl ? 'Or let an agent here collect' : 'Or give this branch an agent', go:'dc',
      i:{h:'Nothing collects these ' + who + ': there is no data center agent to send to. Add a data center, or ' + (cl ? 'let a Universal Agent in this cloud collect them.' : 'let the agent at this branch collect them.'), d:[]}});
    nodes.push(KEN());
    if(test) edges.push(toKentik);
    notes.push({x:test ? 56 : 32, y:test ? 456 : 384, t:'Nothing collects the ' + who + ' yet.', td:'Nothing collects the ' + who + ' yet.'});
    return {frames, nodes, edges, notes};
  }
  const caps = capsOf('dc', t), on = c => caps.has(c), dname = dcName(t);
  const rel = ['flow', 'snmp', 'trap', 'syslog', 'ssh', 'synth'].filter(on);
  frames.push({x:478, y:16, w:286, h:588, label:dname + ' (on-prem)', labeld:dname + ' · collects for ' + (cl ? MOD[i].name : 'this branch'), go:dcId(t)});
  const uh = Math.max(220, 64 + Math.max(rel.length, 1) * 22 + 28);
  nodes.push({id:'ua', x:494, y:90, w:254, h:uh, k:'ua', icon:'agent', t:'Universal Agent', s:'In ' + dname, sd:instOf('dc', t) === 'docker' ? 'In Docker' : 'On a Linux host', go:dcId(t),
    lines:rel.length ? rel.map(c => capUI('dc', t, c)) : ['No capabilities on'], linesd:rel.length ? rel.map(c => capUI('dc', t, c) + ' · ' + UAC[c].sd.replace('Listens on ', '')) : ['Toggle them on in ' + dname],
    foot:uaFoot('dc', t), footd:'Plan ' + sizing('dc', t).rc + ' vCPU / ' + sizing('dc', t).rr + ' GB, ' + (cl ? 'appliance' : 'branch') + ' load included',
    i:{h:'The ' + dname + ' agent collects for ' + (cl ? 'the ' + MOD[i].name + ' appliances' : 'this branch') + '. Only the capabilities that are on at ' + dname + ' reach the ' + who + '.', d:UA_DC_I.d}});
  const ex = 764, ey = 90 + Math.round(uh / 2);
  nodes.push(EGRESS(ex, ey), KEN());
  edges.push({t:'https', a:'ua', b:'kentik', p:[[748, ey], [780, ey]]});
  const R = 280, U = 494, over = cl ? CL[i].link : 'the WAN';
  if(devs){
    if(on('flow')) edges.push({t:'flow', a:'netgrp', b:'ua', p:[[R, 104], [U, 104]], lab:'Flow over ' + over, labd:'UDP 9995', lp:[387, 104]});
    if(on('snmp')) edges.push({t:'snmp', a:'ua', b:'netgrp', p:[[U, 130], [R, 130]], bi:true, lab:'SNMP polls', labd:'UDP 161 · ICMP', lp:[387, 130]});
    if(on('trap')) edges.push({t:'trap', a:'netgrp', b:'ua', p:[[R, 156], [U, 156]], lab:'Traps', labd:'UDP 162', lp:[387, 156]});
    if(on('syslog')) edges.push({t:'syslog', a:'netgrp', b:'ua', p:[[R, 182], [U, 182]], lab:'Syslog', labd:'UDP/TCP 514', lp:[387, 182]});
    if(on('ssh') && !cl) edges.push({t:'ssh', a:'ua', b:'netgrp', p:[[U, 208], [R, 208]], lab:'Config sync', labd:'SSH, TCP 22', lp:[387, 208]});
  }
  if(on('synth') && !test && !cl) edges.push({t:'synth', a:'ua', b:'wan', p:[[U, 240], [R, 240]], lab:'Tests to the branch', labd:'Server IP tests', lp:[387, 240]});
  if(test){
    nodes.push(Object.assign({}, REMOTE));
    edges.push({t:'synth', a:'ua-t', b:'ua', p:[[280, 392], [470, 392], [470, 300], [494, 300]], bi:true, lab:'Agent-to-agent tests', labd:'TCP 8877 · UDP 9977', lp:[387, 386]},
               {t:'synth', a:'ua-t', b:'remote', p:[[280, 416], [300, 416], [300, 524], [780, 524]], lab:'Tests to SaaS and other sites', labd:'Ping, traceroute, DNS, HTTP', lp:[540, 518]},
               toKentik);
  }
  const miss = ['flow', 'snmp', 'trap', 'syslog'].filter(c => !on(c)).map(c => capUI('dc', t, c));
  if(test) notes.push({x:56, y:456, t:'Tests run here. The ' + who + ' still', td:'Collection runs at ' + dname + ';'},
                      {x:56, y:473, t:'send to the ' + dname + ' agent.', td:'tests run ' + (cl ? 'in ' + MOD[i].name : 'at the branch') + '.'});
  else if(cl) notes.push({x:32, y:384, t:'No agent here: appliances send', td:'Add a tests-only agent to test'},
                         {x:32, y:401, t:'to the ' + dname + ' agent.', td:'from inside ' + MOD[i].name + '.'});
  else notes.push({x:32, y:384, t:'No agent here: devices send to', td:'No local tests: test the branch'},
                  {x:32, y:401, t:'the ' + dname + ' agent.', td:'router from the data center agent.'});
  if(miss.length && devs) notes.push({x:494, y:90 + uh + 26, t:'Off at ' + dname + ':', td:'Off at ' + dname + ':'}, {x:494, y:90 + uh + 43, t:miss.join(', '), td:miss.join(', ')});
  return {frames, nodes, edges, notes};
}

/* ===== The cloud pieces: appliances, workloads and the agent in a cloud network ===== */
function CL_NETGRP(c){ return {id:'netgrp', x:32, y:58, w:240, h:222, label:'Network appliances in ' + MOD[c].name + (clOf(c).ap ? ' (' + clOf(c).ap + ')' : ''), cls:'sframe',
  i:{h:'Virtual firewalls, routers and SD-WAN appliances in your ' + CL[c].net + ', for example Palo Alto VM-Series. Flow logs do not see inside them; their own flow export, SNMP, traps and syslog do.',
     d:['Export NetFlow or IPFIX on UDP 9995, traps on UDP 162 and syslog on UDP or TCP 514 to the agent that collects them.',
        'Allow UDP 161 and ICMP from that agent for SNMP polling.',
        'In Kentik, add each appliance as a device with that agent as its collection agent.']}}; }
function CL_DEVICES(c){ return [
  {id:'fw', x:44, y:90, w:216, h:52, k:'net', icon:'firewall', t:'Firewall appliances', s:'For example Palo Alto VM-Series', sd:'Flow, SNMP, syslog, traps',
   i:{h:'Next-generation firewalls in the cloud see the traffic between subnets, ' + CL[c].net + 's and the Internet, with the applications behind it.',
      d:['Palo Alto VM-Series exports NetFlow version 9; other vendors use NetFlow or IPFIX.', 'Point the export at the agent that collects this cloud, on UDP 9995.']}},
  {id:'vr', x:44, y:152, w:216, h:52, k:'net', icon:'router', t:'Virtual routers, SD-WAN', s:'For example Cisco 8000v', sd:'Flow · SNMP · BGP',
   i:{h:'Virtual routers and SD-WAN hubs in the cloud add flow and interface health for the paths between the cloud and your sites.', d:[]}},
  {id:'lb', x:44, y:214, w:216, h:52, k:'net', icon:'network', t:'Load balancers', s:'For example F5 BIG-IP VE', sd:'SNMP · syslog',
   i:{h:'Virtual load balancers mostly add health, syslog and traps.', d:[]}}
]; }
function CL_NONE(c){ return {id:'fw', x:44, y:90, w:216, h:64, k:'opt', icon:'firewall', t:'No network appliances', s:'Set the count in the panel', sd:'For example Palo Alto VM-Series',
  i:{h:'No network appliances in ' + MOD[c].name + ' are in the design yet. Flow logs already cover the ' + CL[c].net + '; add appliances when firewalls or routers there should send their own flow, SNMP and syslog.', d:[]}}; }
function CL_WORK(c){ return {id:'users', k:'ext', icon:'server', t:'Workloads', s:'Apps in this ' + CL[c].net, sd:'Tests run from here',
  i:{h:'Your applications in ' + MOD[c].name + '. An agent here tests the paths between them, your sites and the SaaS apps they use.', d:[]}}; }
function UA_CL_I(c){ return {h:'The same Universal Agent as on-prem, on ' + CL[c].vm + '. It needs outbound TCP 443 only, through a NAT gateway or a proxy.',
  d:['Size it like an on-prem agent: the sum of its capabilities, plus 30% headroom.',
     'Security group or NSG: allow UDP 9995, UDP 162 and UDP or TCP 514 in from the appliances, UDP 161 and ICMP out to them, and TCP 8877 and UDP 9977 with the agents it tests with.',
     'Same Linux or Docker install command from Settings › Universal Agents › Deploy Agent.']}; }

/* The agent slot in each cloud scene: the agent, the appliances, or a hint that both are optional.
   Each scene has its own free spot and path to Kentik. */
const CL_SLOT = {
  aws:{x:40, y:486, w:220, h:56, p:[[260, 514], [300, 514], [300, 584], [882, 584], [882, 500]], lp:[600, 584]},
  awsN:{x:40, y:380, w:220, h:46, p:[[260, 403], [780, 403]], lp:[640, 397]},
  azure:{x:44, y:486, w:220, h:56, p:[[264, 514], [290, 514], [290, 584], [882, 584], [882, 500]], lp:[600, 584]},
  gcp:{x:40, y:486, w:220, h:56, p:[[260, 514], [300, 514], [300, 584], [882, 584], [882, 500]], lp:[600, 584]},
  oci:{x:40, y:486, w:220, h:56, p:[[260, 514], [300, 514], [300, 584], [882, 584], [882, 500]], lp:[600, 584]}
};
function cloudScene(c){
  const nested = c === 'aws' && S.awsNested, base = nested ? awsNestedScene() : SC[c];
  const o = clOf(c), role = o.ua, ap = o.ap, t = clTarget(c), slot = CL_SLOT[nested ? 'awsN' : c], aps = plural(ap, 'appliance');
  const nodes = base.nodes.filter(n => n.id !== 'ua'), edges = base.edges.filter(e => e.a !== 'ua' && e.b !== 'ua');
  const at = {id:'ua', x:slot.x, y:slot.y, w:slot.w, h:slot.h};
  if(role === 'none' && !ap)
    nodes.push(Object.assign(at, {k:'opt', icon:'agent', t:'Universal Agent', s:'None: flow logs need no agent', sd:'Optional: tests or appliances',
      i:{h:'Optional. A Universal Agent on ' + CL[c].vm + ' tests from inside ' + MOD[c].name + ', and can collect from network appliances such as Palo Alto VM-Series. Choose one in the panel.',
         d:['Tests only: Connectivity Test, for paths between the cloud, your sites and SaaS apps.', 'Collects here: the appliances send flow, SNMP, traps and syslog to this agent, so their data stays in the cloud.', 'No agent: appliances can still send to a data center agent across ' + CL[c].linkd + '.']}}));
  else if(role === 'none')
    nodes.push(Object.assign(at, {k:'net', icon:'firewall', t:aps, s:t ? 'Send to ' + dcName(t) + ' over ' + CL[c].link : 'No agent collects them yet', sd:'Flow, SNMP, traps, syslog', go:cuId(c),
      i:{h:'Network appliances in ' + MOD[c].name + ', for example Palo Alto VM-Series. With no agent in the cloud, they send to ' + (t ? 'the ' + dcName(t) + ' agent' : 'a data center agent') + ' across ' + CL[c].linkd + '.', d:['Open the view to see the path and the ports.']}}));
  else {
    const caps = capList('cl', c);
    nodes.push(Object.assign(at, {k:'uas', icon:'agent', t:'Universal Agent', s:role === 'test' ? 'Tests only, ' + lc(CL[c].on) : ap ? 'Collects ' + aps : CL[c].on,
      sd:role === 'test' ? (ap ? aps + ' send to ' + (t ? dcName(t) : 'no agent yet') : 'Connectivity Test') : caps.map(k => UAC[k].chip).join(', ') || 'No capabilities on', go:cuId(c),
      i:{h:role === 'test' ? 'A Universal Agent on ' + CL[c].vm + ' that runs only Connectivity Test.' + (ap ? ' The appliances still send to a data center agent across ' + CL[c].link + '.' : '') : 'A Universal Agent on ' + CL[c].vm + (ap ? ' that collects the ' + aps + ' in ' + MOD[c].name + ', so their data stays in the cloud.' : '.'),
         d:['Open the view to see the agent, its capabilities and the ports.']}}));
    edges.push({t:'https', a:'ua', b:'kentik', p:slot.p, lab:role === 'test' ? 'Test results over HTTPS' : 'Agent data over HTTPS', labd:'TCP 443 outbound', lp:slot.lp});
  }
  return Object.assign({}, base, {nodes, edges});
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
  const order = ids.filter(brRemote).sort((a, b) => brTarget(a) - brTarget(b) || a - b).concat(ids.filter(i => !brRemote(i)));   // grouped by the data center they send to
  const top = 58, bottom = 590, gap = 8;
  const rh = Math.min(52, Math.floor((bottom - top - (n - 1) * gap) / n));
  const frames = [{x:16, y:16, w:330, h:588, label:n > 1 ? 'Your ' + n + ' branch offices' : 'Your branch office'}];
  const nodes = [], edges = [], notes = [], pos = {};
  order.forEach((i, k) => {
    const y = top + k * (rh + gap), role = brRole(i), ua = role !== 'none', t = brTarget(i), caps = ua ? capList('br', i) : [];
    const dn = t ? dcName(t) : '';
    pos[i] = y + rh / 2;
    nodes.push({id:'b-' + i, x:32, y, w:298, h:rh, k:ua ? 'uas' : 'net', icon:ua ? 'agent' : 'store', t:brName(i),
      s:role === 'full' ? 'Own agent · ' + caps.length + ' capabilit' + (caps.length === 1 ? 'y' : 'ies') : role === 'test' ? 'Tests-only agent · sends to ' + (dn || 'no data center yet') : t ? 'No agent · sends to ' + dn : 'No agent and no data center yet',
      sd:role === 'full' ? (caps.length ? caps.map(c => UAC[c].chip).join(', ') : 'No capabilities on') : role === 'test' ? 'Tests here; flow, traps, syslog over the WAN' : 'Flow, traps, syslog over the WAN', go:brId(i),
      i:{h:role === 'full' ? brName(i) + ' has its own Universal Agent, which sends straight to Kentik over HTTPS.'
         : role === 'test' ? brName(i) + ' has a tests-only agent for Connectivity Test. Its devices send across the WAN to ' + (t ? 'the ' + dn + ' agent.' : 'a data center agent, but there is none yet.')
         : t ? brName(i) + ' has no agent. Its devices send across the WAN to the ' + dn + ' agent.' : brName(i) + ' has no agent, and there is no data center agent to send to yet.', d:[]}});
  });
  const targets = [...new Set(order.filter(i => brRemote(i) && brTarget(i)).map(brTarget))].sort((a, b) => a - b);
  if(targets.length){
    frames.push({x:362, y:16, w:310, h:588, label:'Data center agents'});
    const remote = order.filter(brRemote);
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
  order.filter(i => !brRemote(i)).forEach(i => {
    edges.push(Object.assign({t:'https', a:'b-' + i, b:'kentik', p:[[330, pos[i]], [780, pos[i]]]}, first ? {lab:'Branch agents send straight to Kentik', labd:'TCP 443, outbound only', lp:[560, pos[i] - 12]} : {}));
    first = false;
  });
  nodes.push(KEN({y:58, h:532, s:'One account, every site'}));
  return {frames, nodes, edges, notes};
}

function getScene(v){
  if(isDC(v)) return agentScene('dc', dcIndex(v));
  if(isBR(v)) return brRole(brIndex(v)) === 'full' ? agentScene('br', brIndex(v)) : remoteScene('br', brIndex(v));
  if(isCU(v)) return clRole(cuOf(v)) === 'full' ? agentScene('cl', cuOf(v)) : remoteScene('cl', cuOf(v));
  if(CLOUD_IDS.includes(v)) return cloudScene(v);
  if(v === 'dcs') return dcsScene();
  if(v === 'brs') return brsScene();
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

const INFO_BR_TEST = {kick:'Drill-in · On-prem', title:'Branch office with a tests-only agent',
hl:`<p class="lead">A Universal Agent at the branch that runs only Connectivity Test. It measures what users at the branch experience, while the branch devices still send their flow, traps and syslog across the WAN to a data center agent.</p>
<h3>What you deploy at the branch</h3><ul>
<li>A small Linux host or Docker host with the Universal Agent, and only Connectivity Test turned on</li>
<li>Device configuration that points flow, traps and syslog at the data center agent</li></ul>
<h3>Why choose it</h3><ul>
<li>Tests from where the users are: SaaS apps, the data centers, cloud regions and DNS</li>
<li>Collection stays in one place: the data center agent collects the branch devices</li></ul>
<p class="note">Pick <b>Collects here</b> in the panel when the branch should also collect its own devices.</p>`,
dd:`<p class="lead">Two paths leave the branch: test traffic from the local agent, and device telemetry across the WAN to the data center agent.</p>
<h3>Ports</h3>
<table><thead><tr><th style="width:38%">Direction</th><th style="width:30%">Port</th><th>Used by</th></tr></thead><tbody>
<tr><td>Branch agent → Kentik</td><td>TCP 443</td><td>Results and control</td></tr>
<tr><td>Branch agent ↔ other agents</td><td>TCP 8877, UDP 9977</td><td>Connectivity Test</td></tr>
<tr><td>Branch devices → DC agent</td><td>UDP 9995</td><td>Flow Proxy</td></tr>
<tr><td>Branch devices → DC agent</td><td>UDP 162</td><td>SNMP Trap Receiver</td></tr>
<tr><td>Branch devices → DC agent</td><td>UDP and TCP 514</td><td>Syslog Server</td></tr>
<tr><td>DC agent → branch devices</td><td>UDP 161, ICMP</td><td>SNMP/ST</td></tr>
</tbody></table>
<h3>In Kentik</h3><ul>
<li>Authorize the branch agent and turn on Connectivity Test only.</li>
<li>Add the branch devices with the data center agent as their collection agent, and assign them to the branch Site.</li>
<li>Add the branch agent to the mesh or agent-to-agent tests with the data center agents.</li></ul>
<h3>Sizing</h3><p>Connectivity Test needs 2 cores / 2 GB, so plan 3 vCPU / 3 GB with headroom. The branch load counts toward the data center agent it sends to.</p>`,
src:[['Universal Agents','https://kb.kentik.com/docs/universal-agents'],['Test Types Reference','https://kb.kentik.com/docs/test-types'],['Test Credits','https://kb.kentik.com/docs/test-credits'],['Device Settings','https://kb.kentik.com/docs/device-settings']]};

/* The drill-in for an agent or appliances in a cloud */
function cloudSiteInfo(c){
  const o = clOf(c), role = o.ua, t = clTarget(c), ap = o.ap, name = MOD[c].name, link = CL[c].linkd;
  const title = role === 'full' ? clSite(c) + ' with a Universal Agent' : role === 'test' ? clSite(c) + ': tests-only agent' : clSite(c) + ': appliances send to ' + (t ? dcName(t) : 'a data center');
  const hl = role === 'full'
    ? `<p class="lead">A Universal Agent on ${CL[c].vm} in your ${CL[c].net}. ${ap ? 'The network appliances, for example Palo Alto VM-Series, send flow, traps and syslog to it, and it polls them, so their data stays in the cloud.' : 'Add network appliances in the panel when firewalls or routers here should send their own flow and SNMP.'} It also tests from inside ${name}.</p>
<h3>What you deploy</h3><ul><li>A small Linux VM, or a Docker host, in a subnet with outbound TCP 443 (a NAT gateway or a proxy)</li><li>Only the capabilities this cloud needs</li><li>Appliance exports that point at the agent’s private IP</li></ul>
<h3>Compared with sending to a data center</h3><ul><li>No telemetry crosses ${esc(link)}</li><li>One more agent to run and keep sized</li></ul>`
    : role === 'test'
    ? `<p class="lead">A Universal Agent on ${CL[c].vm} that runs only Connectivity Test: it measures the paths between ${name}, your sites and SaaS apps.${ap ? ' The network appliances still send to a data center agent across ' + esc(link) + '.' : ''}</p>
<h3>What you deploy</h3><ul><li>A small Linux VM, or a Docker host, with outbound TCP 443</li><li>TCP 8877 and UDP 9977 open with the agents it tests with</li></ul>
<p class="note">Pick <b>Collects here</b> in the panel to also collect the appliances in ${name}.</p>`
    : `<p class="lead">No agent in ${name}. The network appliances, for example Palo Alto VM-Series, send flow, traps and syslog across ${esc(link)} to ${t ? 'the ' + esc(dcName(t)) + ' agent' : 'a data center agent'}, which also polls them.</p>
<h3>What you set up</h3><ul><li>Flow export, trap and syslog targets on the appliances, pointing at the data center agent</li><li>Rules in the cloud security groups and the data center firewall for UDP 9995, 162 and 514, and UDP 161 back</li><li>A route for these flows over the private link</li></ul>
<p class="note">Pick <b>Collects here</b> in the panel to keep this telemetry in ${name}, or <b>Tests only</b> to add tests from inside it.</p>`;
  const rows = [];
  if(role !== 'none') rows.push(['Cloud agent → Kentik', 'TCP 443', 'Everything, outbound only']);
  if(role !== 'none' && capsOf('cl', c).has('synth')) rows.push(['Cloud agent ↔ other agents', 'TCP 8877, UDP 9977', 'Connectivity Test']);
  if(ap) rows.push(['Appliances → ' + (role === 'full' ? 'cloud agent' : 'DC agent, over ' + CL[c].link), 'UDP 9995, 162, 514', 'Flow, traps, syslog'],
                   [(role === 'full' ? 'Cloud agent' : 'DC agent') + ' → appliances', 'UDP 161, ICMP', 'SNMP/ST']);
  const dd = `<p class="lead">The ports for this cloud, next to the flow log export.</p>
<table><thead><tr><th style="width:42%">Direction</th><th style="width:28%">Port</th><th>Used by</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>
<h3>In Kentik</h3><ul>${role !== 'none' ? '<li>Install with the Linux or Docker command from Settings › Universal Agents › Deploy Agent, then authorize the agent and assign it to a Site for this cloud.</li>' : ''}${ap ? '<li>Add each appliance as a device with ' + (role === 'full' ? 'the cloud agent' : 'the data center agent') + ' as its collection agent, and set its flow sample rate.</li>' : ''}<li>Flow logs and metadata still come through the cloud export: an agent does not replace them.</li></ul>`;
  return {kick:'Drill-in · Public cloud', title, hl, dd, site:['cl', c],
    src:[['Universal Agents','https://kb.kentik.com/docs/universal-agents'],['UA Deployment','https://kb.kentik.com/docs/ua-deployment'],['Router Configuration','https://kb.kentik.com/docs/router-configuration'],['Test Types Reference','https://kb.kentik.com/docs/test-types']]};
}

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
  if(isBR(v)){
    const i = brIndex(v), r = brRole(i), to = brTarget(i) ? dcName(brTarget(i)) : 'a data center';
    return Object.assign({}, r === 'full' ? INFO.branch : r === 'test' ? INFO_BR_TEST : INFO_BR_REMOTE,
      {title:brName(i) + (r === 'full' ? ' with a Universal Agent' : r === 'test' ? ': tests-only agent, sends to ' + to : ': no agent, sends to ' + to), site:['br', i]});
  }
  if(isCU(v)) return cloudSiteInfo(cuOf(v));
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
  return `<div class="fld"><span>Install the agent</span><div class="seg mini" role="group" aria-label="Install method">${[['linux', kind === 'cl' ? 'Linux VM' : 'Linux host'], ['docker', 'Docker']].map(o => `<button type="button" data-inst="${kind}:${i}:${o[0]}" aria-pressed="${v === o[0]}">${o[1]}</button>`).join('')}</div></div>`;
}
/* No agent, an agent for tests only, or an agent that collects the devices: for a branch and for each cloud */
function roleSeg(kind, i, role){
  const where = kind === 'cl' ? 'in ' + MOD[i].name : 'at this branch';
  return `<div class="fld"><span>Universal Agent ${esc(where)}</span><div class="seg mini" role="group" aria-label="Universal Agent ${esc(where)}">${[['none', 'No agent'], ['test', 'Tests only'], ['full', 'Collects here']].map(o => `<button type="button" data-role="${kind}:${i}:${o[0]}" aria-pressed="${role === o[0]}">${o[1]}</button>`).join('')}</div></div>`;
}
function testAgentCard(kind, i){
  const z = sizing(kind, i);
  return `<div class="card"><h4>Connectivity Test only<span class="tag">Tests</span></h4><p style="font-size:12.5px;margin:0">Plan <b>${z.rc} vCPU / ${z.rr} GB RAM</b> for this agent, with 30% headroom. It needs outbound TCP 443, and TCP 8877 and UDP 9977 with the agents it tests with.</p></div>`;
}
/* A cloud's agent and network appliances (for example Palo Alto VM-Series) */
function cloudCard(c, dd){
  const o = clOf(c), role = o.ua, ap = o.ap, t = clTarget(c), name = MOD[c].name;
  const what = {none:ap ? 'No agent here. The appliances send across ' + CL[c].link + ' to a data center agent.' : 'Flow logs need no agent. Add one for tests from inside ' + name + ', or to collect from network appliances.',
    test:'An agent ' + lc(CL[c].on) + ' that runs Connectivity Test only.' + (ap ? ' The appliances still send across ' + CL[c].link + ' to a data center agent.' : ''),
    full:'An agent ' + lc(CL[c].on) + ' that collects the appliances here and tests from inside ' + name + '.'}[role];
  const sel = ap && role !== 'full' ? (dcOn()
    ? `<label class="fld"><span>Appliances send to</span><select class="clTo" data-clto="${c}">${dcIds().map((id, k) => `<option value="${k + 1}"${t === k + 1 ? ' selected' : ''}>${esc(dcName(k + 1))} agent</option>`).join('')}</select></label><p class="muted" style="font-size:12px;margin:-2px 0 8px">Across ${esc(CL[c].linkd)}.</p>`
    : '<p class="note">No data center is selected, so nothing collects the appliances. Add a data center, or pick Collects here.</p>') : '';
  const nav = S.view === cuId(c) ? `<div class="btns"><button type="button" data-go="${c}">‹ Back to ${esc(name)}</button></div>`
    : clUsed(c) ? `<div class="btns"><button type="button" data-go="${cuId(c)}">Open ${esc(viewName(cuId(c)))} ›</button></div>` : '';
  return `<div class="card site"><h4><svg class="ico ico-right" aria-hidden="true"><use href="#i-agent"/></svg>Agent and appliances<span class="tag">${{none:ap ? 'No agent' : 'Agentless', test:'Tests-only agent', full:'Universal Agent'}[role]}</span></h4>
${roleSeg('cl', c, role)}
<p style="font-size:12.5px;margin:6px 0 8px">${esc(what)}</p>
<label class="fld"><span>Network appliances</span><input type="number" min="0" max="${AP_MAX}" step="1" inputmode="numeric" data-clap="${c}" value="${ap || ''}" placeholder="0"></label>
<p class="muted" style="font-size:12px;margin:-2px 0 8px">Firewalls, routers or SD-WAN in ${esc(name)} that export flow or answer SNMP, for example Palo Alto VM-Series.</p>
${role !== 'none' ? instSeg('cl', c) : ''}${sel}${nav}</div>`
    + (role === 'full' ? capsCard('cl', c, dd) : (role === 'test' ? testAgentCard('cl', c) : '') + (ap ? loadCard('cl', c) : ''));
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
  const z = sizing(kind, i), f = kind === 'dc' ? feeders(i).filter(b => { const q = szOf('br', b); return q.d || q.f; }).length : 0, fc = kind === 'dc' ? cfeeders(i).length : 0;
  return `Plan <b>${z.rc} vCPU / ${z.rr} GB RAM</b> ` + (z.given ? `for ${[z.d ? fmt(z.d) + ' devices' : '', z.f ? fmt(z.f) + ' flows/s' : ''].filter(Boolean).join(' and ')}${f ? ', branch load included' : ''}${fc ? ', cloud appliances included' : ''}` : 'at the KB baseline (up to 500 devices, 20k+ flows/s)')
    + ', with 30% headroom.' + (z.est ? ' Above the KB flow figure this is an estimate: confirm with your Infoblox team.' : '');
}
/* Devices send to a data center agent: a branch with no agent or a tests-only agent, or cloud appliances with no collecting agent */
const sendsAway = (kind, i) => (kind === 'br' && brRemote(i)) || (kind === 'cl' && clRole(i) !== 'full');
function loadCard(kind, i){
  const z = szOf(kind, i), cl = kind === 'cl', away = sendsAway(kind, i), t = away ? (cl ? clTarget(i) : brTarget(i)) : 0;
  const inp = (k, label, ph) => `<label class="fld"><span>${label}</span><input type="number" min="0" max="10000000" step="1" inputmode="numeric" data-sz="${kind}:${i}:${k}" value="${z[k] || ''}" placeholder="${ph}"></label>`;
  const out = away ? (t ? `Added to the ${esc(dcName(t))} agent’s sizing.` : 'Add a data center to collect ' + (cl ? 'these appliances.' : 'this branch.')) : sizeLine(kind, i);
  const title = away ? (cl ? 'Appliance load' : 'Branch load') : 'Size this agent';
  const intro = away ? (cl ? 'Flows from the appliances. They count toward the data center agent they send to.' : 'Devices and flows at this branch. They count toward the data center agent it sends to.')
    : cl ? 'Enter the appliance flows to size this agent. The appliance count sets the devices.' : 'Enter what this agent collects to size its host. Leave blank to use the KB baseline.';
  return `<details class="card load"${S.szOpen ? ' open' : ''}><summary><h4>${title}<span class="tag">Optional</span></h4></summary>
<p>${intro}</p>
<div class="ldrow">${cl ? '' : inp('d', 'Network devices', 'e.g. 200')}${inp('f', 'Flows per second', cl ? 'e.g. 5000' : 'e.g. 20000')}</div>
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
  const n = S.brN, role = brRole(i), t = brTarget(i);
  const sel = dcOn() ? `<label class="fld"><span>${role === 'test' ? 'Devices send to' : 'Sends its data to'}</span><select class="toSel" data-to="${i}">${dcIds().map((id, k) => `<option value="${k + 1}"${t === k + 1 ? ' selected' : ''}>${esc(dcName(k + 1))} agent</option>`).join('')}</select></label>`
    : '<p class="note">No data center is selected, so nothing collects this branch. Add a data center, or pick Collects here.</p>';
  const what = {none:'Devices send across the WAN to a data center agent.', test:'The agent runs Connectivity Test only. Devices still send across the WAN to a data center agent.', full:'The agent collects the branch devices and tests from the branch.'}[role];
  return `<div class="card site"><h4>${STORE}${n > 1 ? 'Branch ' + i + ' of ' + n : 'This branch'}<span class="tag">${{none:'No agent', test:'Tests-only agent', full:'Universal Agent'}[role]}</span></h4>
<label class="fld"><span>Branch name</span><input type="text" class="nameIn" data-name="br:${i}" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(brCustom(i))}" placeholder="${esc(brDefault(i))}"></label>
${roleSeg('br', i, role)}
<p style="font-size:12.5px;margin:6px 0 8px">${what}</p>
${role !== 'none' ? instSeg('br', i) : ''}${role !== 'full' ? sel : ''}
<div class="btns"><button type="button" data-bradd="1"${n < BR_MAX ? '' : ' disabled'}>+ Add a branch</button><button type="button" data-brdel="${i}">Remove this branch</button>${n > 1 ? `<button type="button" data-go="brs">All ${n} branches ›</button>` : ''}</div></div>`
    + (role === 'full' ? capsCard('br', i, dd) : (role === 'test' ? testAgentCard('br', i) : '') + loadCard('br', i));
}
function sitesCard(kind){
  const dc = kind === 'dc', n = dc ? S.dcN : S.brN, max = dc ? DC_MAX : BR_MAX;
  const ids = dc ? dcIds() : brIds(), nm = k => dc ? dcName(k) : brName(k);
  return `<div class="card site"><h4>${dc ? BLDG : STORE}${n} ${dc ? 'data center' : 'branch office'}${n === 1 ? '' : dc ? 's' : 's'}<span class="tag">Up to ${max}</span></h4>
<p>${dc ? 'Each data center has its own Universal Agent.' : 'Each branch either has an agent or sends to a data center agent.'} Open a site to rename it or toggle its capabilities.</p>
<div class="btns">${ids.map((id, k) => `<button type="button" data-go="${id}">${esc(nm(k + 1))} ›</button>`).join('')}<button type="button" data-${dc ? 'dcadd' : 'bradd'}="1"${n < max ? '' : ' disabled'}>+ Add</button>${n > 1 ? `<button type="button" data-${dc ? 'dcstep' : 'brstep'}="-1">− Remove the last</button>` : ''}</div></div>`;
}
