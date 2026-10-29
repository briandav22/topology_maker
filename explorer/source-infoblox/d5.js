/* ---------- Data centers: one Universal Agent per site, add or remove sites, and all sites together ---------- */
const isDC = v => typeof v === 'string' && /^dc[2-6]?$/.test(v);
const dcId = i => i === 1 ? 'dc' : 'dc' + i;
const dcIndex = v => v === 'dc' ? 1 : +v.slice(2);
const dcIds = () => Array.from({length:S.dcN}, (_, k) => dcId(k + 1));
const modOf = v => isDC(v) || v === 'dcs' ? 'dc' : MOD[v] ? v : null;
function dcCustom(i){ return String(S.dcNames[i - 1] || '').trim(); }
function dcDefault(i){ return S.dcN > 1 ? 'Data center ' + i : 'Data center'; }
function dcName(i){ return dcCustom(i) || dcDefault(i); }
function dcMod(id){ return Object.assign({}, MOD.dc, {id, name:dcName(dcIndex(id))}); }
function meshMath(n){ const sub = n * (n - 1), run = sub * 2.5; return {sub, run, month:run * 43200}; }
const fmt = v => v.toLocaleString('en-US', {maximumFractionDigits:1});

/* One data center: the full data center scene, named for this site */
const REMOTE_MULTI = {t:'Other DCs, SaaS', go:['dcs', 'saas'],
  i:{h:'Synthetic test targets: the agents in your other data centers, Kentik’s global and public cloud agents, SaaS apps, websites and DNS servers.',
     d:['Agent-to-agent and mesh tests between data centers need TCP 8877 and UDP 9977 open between the agents.', 'Open All data centers to see every site and the tests between them.']}};
function dcScene(i){
  const base = SC.dc, n = S.dcN, name = dcName(i);
  return Object.assign({}, base, {
    frames:base.frames.map((f, k) => k ? f : Object.assign({}, f, {label:name + ' (on-prem)', labeld:n > 1 ? name + ' (on-prem) · site ' + i + ' of ' + n : name + ' (on-prem)'})),
    nodes:base.nodes.map(nd => nd.id === 'remote' && n > 1 ? Object.assign({}, nd, REMOTE_MULTI) : nd)
  });
}

/* Every data center at once: one row per site, each with its own agent */
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
    const i = k + 1, name = dcName(i);
    frames.push({id:'site-' + i, x:32, y:r.y, w:520, h:rowH, label:name, cls:'sframe', go:dcId(i),
      i:{h:name + ' has its own Universal Agent. The site’s devices send to that agent, and the agent sends everything to Kentik over outbound HTTPS.',
         d:['Same install command, capabilities and ports as every other site.', 'Assign the agent to this site’s Site in Kentik so devices and tests group by location.']}});
    nodes.push({id:'dev-' + i, x:44, y:r.ny, w:226, h:nodeH, k:'net', icon:'router', t:'Network devices', s:'Routers, switches, firewalls', sd:'Flow, SNMP, traps, syslog',
      i:{h:'The routers, switches and firewalls at ' + name + ' export flow to the local agent, send it traps and syslog, and answer its SNMP polls.',
         d:['Devices → agent: UDP 9995 flow, UDP 162 traps, UDP or TCP 514 syslog.', 'Agent → devices: UDP 161 SNMP, ICMP, gNMI and TCP 22 for SSH.']}});
    nodes.push({id:'ua-' + i, x:320, y:r.ny, w:216, h:nodeH, k:'uas', icon:'agent', t:'Universal Agent', s:'Linux host or Docker', sd:'Out: TCP 443 only', go:dcId(i),
      i:{h:'The Universal Agent for ' + name + ', on a Linux host or in Docker, with the capabilities this site needs switched on.',
         d:['Install: Settings › Universal Agents › Deploy Agent gives a Linux or Docker command. Portal tokens last 1 hour.', 'Size the host for the sum of its capabilities: for example SNMP/ST 2 cores / 8 GB, Synthetics 2 cores / 2 GB.', 'Agent-to-agent tests with the other sites use TCP 8877 and UDP 9977.']}});
    nodes.push(Object.assign(EGRESS(760, r.cy), {id:'egress-' + i}));
    edges.push({t:'flow', a:'dev-' + i, b:'ua-' + i, p:[[270, r.cy - 7], [320, r.cy - 7]]});
    edges.push({t:'snmp', a:'ua-' + i, b:'dev-' + i, p:[[320, r.cy + 7], [270, r.cy + 7]], bi:true});
    edges.push(Object.assign({t:'https', a:'ua-' + i, b:'kentik', p:[[536, r.cy], [780, r.cy]]},
      k ? {} : {lab:'HTTPS, TLS 1.2+', labd:'TCP 443, outbound only', lp:[652, r.cy - 13]}));
    if(k < n - 1){
      const nx = rows[k + 1], y1 = r.ny + nodeH, y2 = nx.ny;
      edges.push(Object.assign({t:'synth', a:'ua-' + i, b:'ua-' + (i + 1), p:[[428, y1], [428, y2]], c:'v', bi:true},
        k ? {} : {lab:'Agent-to-agent tests', labd:'TCP 8877 · UDP 9977', lp:[438, (y1 + y2) / 2], anchor:'start'}));
    }
  });
  const kh = Math.max(300, used), ky = Math.round(y0 + used / 2 - kh / 2);
  nodes.push(KEN({y:ky, h:kh, s:'One account, all sites'}));
  const m = meshMath(n);
  const notes = n > 1
    ? [{x:32, y:552, t:'Every site runs the same agent with the same install, all managed in one portal.', td:'Mesh of ' + n + ' agents every minute: ' + m.sub + ' subtests, ' + fmt(m.run) + ' credits per run, about ' + fmt(m.month) + ' a month.'},
       {x:32, y:569, t:'The agents test the paths between your sites.', td:'Edge routers at each site peer BGP with Kentik directly on TCP 179.'}]
    : [{x:32, y:552, t:'Add a data center with + to see more sites and the tests between them.', td:'Add a data center to see mesh test credits for your sites.'}];
  return {frames, nodes, edges, notes};
}

function getScene(v){ return isDC(v) ? dcScene(dcIndex(v)) : v === 'dcs' ? dcsScene() : SC[v] || null; }

function dcsInfo(){
  const n = S.dcN, m = meshMath(n);
  const hl = `<p class="lead">Every data center gets its own Universal Agent, installed on a Linux host or in Docker. Each agent sends its own site’s data to the same Kentik account over outbound HTTPS, and the agents test the paths between sites.</p>
<h3>What changes when you add a site</h3><ul>
<li>One more Linux host, or Docker host, running the Universal Agent</li>
<li>The site’s routers, switches and firewalls point at their local agent</li>
<li>The new agent joins your site-to-site tests</li>
<li>Kentik SaaS stays the same: one account and one portal for every agent</li></ul>
<h3>What stays the same at every site</h3><ul>
<li>The install command, capabilities and ports</li>
<li>Outbound TCP 443 only, nothing inbound from the Internet</li>
<li>Agents update themselves and show Up or Down in Settings › Universal Agents</li></ul>`;
  const dd = `<p class="lead">Repeat the same install at each site, then add the agents to a mesh test.</p>
<h3>Checklist for each site</h3><ol style="padding-left:18px;margin:0 0 8px">
<li>A Linux host or Docker host sized for the capabilities you turn on. Add up the sizing for each capability.</li>
<li>Run the Linux or Docker command from Settings › Universal Agents › Deploy Agent, then authorize the agent. Portal tokens last 1 hour.</li>
<li>Assign the agent to its Site in Kentik.</li>
<li>Point devices at the agent: UDP 9995 flow, UDP 162 traps, UDP or TCP 514 syslog.</li>
<li>Allow UDP 161, ICMP and TCP 22 from the agent to the devices.</li>
<li>Allow TCP 443 out to Kentik.</li></ol>
<p>Rolling out many sites? Create provisioning tokens with the API. They take <code>maxUsageCount</code>, <code>expiresAt</code>, <code>requiresApproval</code> and <code>config.siteId</code>, so each agent registers into its own Site.</p>
<h3>Between sites</h3>
<table><thead><tr><th style="width:34%">Direction</th><th style="width:32%">Port</th><th>Used by</th></tr></thead><tbody>
<tr><td>Agent ↔ agent</td><td>TCP 8877, UDP 9977</td><td>Agent-to-agent and mesh tests</td></tr>
<tr><td>Agent → Kentik</td><td>TCP 443, TLS 1.2+</td><td>Every site, outbound only</td></tr>
<tr><td>Router ↔ Kentik</td><td>TCP 179</td><td>BGP from each site’s edge routers</td></tr>
</tbody></table>
<h3>Mesh test credits</h3>
${n > 1 ? `<table><thead><tr><th style="width:64%">A mesh of your ${n} agents</th><th>Value</th></tr></thead><tbody>
<tr><td>Subtests per run (${n} × ${n - 1})</td><td>${m.sub}</td></tr>
<tr><td>Credits per run, at 2.5 per private subtest</td><td>${fmt(m.run)}</td></tr>
<tr><td>Credits per month, running every minute</td><td>${fmt(m.month)}</td></tr>
</tbody></table>
<p class="muted" style="font-size:12.5px">Every minute is 43,200 runs in a 30-day month, and longer intervals cost less. This matches the KB example: 4 private agents every minute is 12 subtests, 30 credits per run.</p>` : '<p>Add a second data center to build a mesh between sites.</p>'}
<h3>Licensing</h3><ul>
<li>Devices at every site count toward FlowPak and NMS (DevicePak) licenses.</li>
<li>Private agents need no extra license. Their subtests cost 2.5 credits per run.</li></ul>`;
  return {kick:'Drill-in · On-prem', title:n > 1 ? 'All ' + n + ' data centers' : 'Your data center', hl, dd,
    src:[['Universal Agents','https://kb.kentik.com/docs/universal-agents'],['UA Deployment','https://kb.kentik.com/docs/ua-deployment'],['UA Portal Management','https://kb.kentik.com/docs/ua-portal-management'],['Test Types Reference','https://kb.kentik.com/docs/test-types'],['Test Credits','https://kb.kentik.com/docs/test-credits']]};
}

function getInfo(v){
  if(isDC(v)) return Object.assign({}, INFO.dc, {title:dcName(dcIndex(v)) + ' with a Universal Agent', site:dcIndex(v)});
  if(v === 'dcs') return Object.assign(dcsInfo(), {sites:true});
  return INFO[v];
}

/* Panel cards to rename, add and remove data centers */
const BLDG = '<svg class="ico ico-left" aria-hidden="true"><use href="#i-building"/></svg>';
function siteCard(i){
  const n = S.dcN;
  return `<div class="card site"><h4>${BLDG}${n > 1 ? 'Site ' + i + ' of ' + n : 'This data center'}<span class="tag">Universal Agent</span></h4>
<label class="fld"><span>Site name</span><input type="text" id="dcNameIn" data-dc="${i}" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(dcCustom(i))}" placeholder="${esc(dcDefault(i))}"></label>
<div class="btns"><button type="button" data-dcadd="1"${n < DC_MAX ? '' : ' disabled'}>+ Add a data center</button>${n > 1 ? `<button type="button" data-dcdel="${i}">Remove this site</button><button type="button" data-go="dcs">All ${n} together ›</button>` : ''}</div></div>`;
}
function sitesCard(){
  const n = S.dcN;
  return `<div class="card site"><h4>${BLDG}${n > 1 ? n + ' data centers' : '1 data center'}<span class="tag">Up to ${DC_MAX}</span></h4>
<p>Each site has its own Universal Agent. Open a site to rename it or see its details.</p>
<div class="btns">${dcIds().map((id, k) => `<button type="button" data-go="${id}">${esc(dcName(k + 1))} ›</button>`).join('')}<button type="button" data-dcadd="1"${n < DC_MAX ? '' : ' disabled'}>+ Add</button>${n > 1 ? '<button type="button" data-dcstep="-1">− Remove the last</button>' : ''}</div></div>`;
}
