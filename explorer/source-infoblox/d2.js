/* ---------- Scene data: on-prem (data center, branch) and Internet & SaaS ---------- */
const SC = {}, INFO = {};

const I_KENTIK = {h:'Your Kentik account receives the data, enriches it and stores it in the Kentik Data Engine. You use it through the portal, alerts and APIs.',
  d:['Hosted in Ashburn, VA (US) or Frankfurt (EU). TLS 1.2+ in transit and AES-256 at rest. SOC 2 Type II.',
     'Default retention: 45 days of full-resolution flow, 120 days of summarized data, and 3 or 13 months for NMS, depending on plan. Contracts can change this.',
     'Open the Kentik SaaS view to see inside the platform.']};
const I_EGRESS = {h:'Every Universal Agent connection starts from inside your network. Nothing has to reach in from the Internet.',
  d:['Allow TCP 443 to flow.kentik.com, grpc.api.kentik.com, api.kentik.com, portal.kentik.com and storage.googleapis.com. whoami.kentiklabs.com is optional. EU accounts use the same names on kentik.eu.',
     'SSL-inspecting firewalls and proxies must allow gRPC over port 443.',
     'A web proxy works: set https_proxy before running the install command, or pass it to Docker with --env.']};
function KEN(o){ o = o || {}; return Object.assign({id:'kentik', x:780, y:130, w:204, h:330, k:'ktk', icon:'ib', t:'Kentik SaaS', s:'Your Kentik account', sd:'US or EU region',
  lines:['Ingest and enrichment','Kentik Data Engine (KDE)','Data Explorer, Kentik Map','NMS, Synthetics, alerts','AI Advisor and APIs'],
  linesd:['flow.kentik.com','grpc.api.kentik.com','api.kentik.com','portal.kentik.com','storage.googleapis.com','EU: *.kentik.eu'], i:I_KENTIK, go:'kentik'}, o); }
function EGRESS(x, y){ return {id:'egress', x:x-18, y:y-18, w:36, h:36, k:'net', icon:'lock', t:'', i:I_EGRESS, tip:'Outbound only'}; }

/* Capability descriptions shared by every site */
const CAP = {
  flow:{h:'Flow Proxy: Forwarding receives NetFlow, sFlow and IPFIX from your devices and forwards it to Kentik over TLS. It is the light way to collect flow.',
    d:['Settings: Host 0.0.0.0, Port 9995 (UDP), optional sFlow agent address override, and Site.',
       'Forwarding (ktraffic, beta in the KB) ships raw flow with about 10x less compute: 1 core / 2 GB for 20,000+ flows per second.',
       'The Edge Processing flavor (kproxy) decodes, enriches with SNMP and rDNS, and samples locally: 8 cores / 32 GB RAM for 25,000+ flows per second.',
       'Branches without their own agent can export flow across the WAN to this agent on UDP 9995.',
       'Sends to flow.kentik.com on TCP 443, with an optional UDP 40010 base port.',
       'Replaces the standalone kproxy agent, which reaches end of life on May 1, 2027.']},
  snmp:{h:'SNMP/ST discovers devices and collects health, interface and hardware metrics by SNMP polling or gNMI streaming telemetry. The same capability enriches flow with interface names and speeds.',
    d:['Per device, pick “Flow Enrichment via Universal Agent” or “Full Monitoring via Universal Agent” on the SNMP tab.',
       'NMS Setup Wizard: deploy or pick an agent, enter IP ranges and SNMP v1, v2c or v3 credentials, discover, then add devices.',
       'Needs UDP 161 and ICMP to devices. Default polling: 1 minute for status, CPU, memory and interfaces, 5 minutes for everything else.',
       'Streaming telemetry: gNMI dial-in over gRPC (JSON or Protobuf), 30 second default, CPU every 2 seconds. Enable “Dial-In from Universal Agent” on the device.',
       'Sizing: 2 cores / 8 GB RAM for up to 500 devices.']},
  trap:{h:'The Trap Receiver captures SNMP traps the moment a device sends them, for example an interface or BGP session going down.',
    d:['Listens on UDP 162. Filter and alert by trap name and OID. Event alerts need manual clearing.',
       'Query in Data Explorer with the metric “SNMP Traps: Events”.',
       'Traps must come from a device licensed for NMS.']},
  syslog:{h:'The Syslog Server collects log messages from devices and servers, so you can search them, alert on them and line them up with traffic.',
    d:['Listens on UDP and TCP 514. Filter by severity, message content and device.',
       'Query in Data Explorer with the metric “Syslog: Events”.',
       'Sizing: 1 core / 1 GB RAM for about 8,000 events per second.',
       'If a syslog forwarder sits in between, it must keep the original device IP.']},
  dns:{h:'DNS OTT Tap turns DNS lookups into records Kentik can join with traffic, for OTT service tracking and DNS troubleshooting.',
    d:['Modes: DNSTAP receiver (preferred, for appliances such as Infoblox), promiscuous capture of a SPAN or mirror port, or directly on a BIND9 or Linux resolver.',
       'Sizing: 1 core / 1 GB RAM per 400,000 DNS lookups per second.',
       'Replaces the old standalone kprobe DNS tap.']},
  synth:{h:'Synthetics makes this agent a private test point. It measures latency, loss and jitter to other sites, clouds, SaaS apps and DNS servers, and gives AI Advisor on-demand ping and traceroute.',
    d:['Agent-to-agent and mesh tests use TCP 8877 and UDP 9977 between agents.',
       'Private agent subtests cost 2.5 credits per run; global agent subtests cost 5.',
       'Sizing: 2 cores / 2 GB RAM.',
       'Shown as Connectivity Test in Installed Capabilities. Confirm which continuous test types run on the Universal Agent today with your Infoblox team.']},
  ssh:{h:'Device Configuration Sync uses read-only SSH so Kentik can back up configs, show what changed, and run read-only show commands during an AI Advisor investigation.',
    d:['Needs TCP 22 from the agent to each device’s management IP, a read-only SSH account and an NMS device license.',
       'Supported platforms: Juniper Junos, Cisco NX-OS, Arista EOS and Cisco IOS-XE.',
       'Read-only by design: a command block-list, never configure or commit. Commands come from your agent, so they land in your TACACS+ or RADIUS logs.',
       'Config sync and backup: a 5 minute fetch interval is recommended for high-visibility environments.']},
  bgp:{h:'BGP Proxy (kbgp) lets routers peer BGP with the agent instead of with Kentik, and the agent relays the routes to Kentik over outbound HTTPS. Routers in private networks need no session to the Internet.',
    d:['Routers peer with the agent on TCP 179.',
       'Sizing: 2 cores / 2 GB RAM. Extra capacity helps the agent stay stable during BGP table updates.',
       'BGP peering is optional. Without BGP Proxy, edge routers can peer with Kentik directly on TCP 179, or not peer at all.',
       'It appears in Installed Capabilities in the portal, while the KB page still lists it as coming soon. Confirm availability for your account with your Infoblox team.']}
};

function chips(x, y0, w, list, step){
  return list.map((c, i) => ({id:'c-'+c[0], x, y:y0+i*step, w, h:46, k:c[0]==='bgp'?'opt':'chip', icon:c[1], t:c[2], s:c[3], sd:c[4], i:CAP[c[0]], cap:c[0]}));
}

/* ===== Data center pieces: the scene is built per site from its capabilities (see d5) ===== */
const DC_NETGRP = {id:'netgrp', x:32, y:58, w:240, h:222, label:'Network devices', cls:'sframe',
  i:{h:'Routers, switches and firewalls export flow to the agent, send it traps and syslog, and answer its SNMP or streaming telemetry requests.',
     d:['Flow: sample ingress on every interface, never ingress and egress on the same interface. The device sample rate must match the rate set for the device in Kentik.',
        'Recommended standard rates: data center and core 1:400–800 at 1 Gbps up to 1:25k–50k at 1 Tbps; Internet edge 1:3k–7k at 10 Gbps up to 1:11k–15k at 1 Tbps.',
        'SNMP v3 options: auth None, MD5 or SHA; privacy None, DES or AES.',
        'Vendor config snippets for flow, SNMP and BGP live in github.com/kentik/config-snippets.']}};
const DC_DEVICES = [
  {id:'edge', x:44, y:90, w:216, h:52, k:'net', icon:'router', t:'Edge routers', s:'WAN and Internet edge', sd:'Flow · SNMP · traps · BGP',
   i:{h:'Edge routers carry Internet and WAN traffic. Besides flow and device telemetry, they peer BGP so every flow gets AS path, community and next-hop context.',
      d:['With BGP Proxy on, routers peer with the Universal Agent on TCP 179 and the agent relays routes to Kentik over HTTPS.',
         'BGP peering is optional; many enterprises skip it. Without BGP Proxy, routers peer with Kentik directly: Device settings › BGP › “Peer with device”, using the ingest peering IPs shown next to the fields.',
         'Kentik peers as an iBGP route-reflector client using your ASN. 4-byte ASN support is required; an MD5 password is optional.',
         'Filter the default route toward Kentik so it does not override the destination AS for unmatched flows.',
         'BGP here is telemetry only; your routing is unaffected. Peering is also what enables RTBH and Flowspec mitigation.']}},
  {id:'core', x:44, y:152, w:216, h:52, k:'net', icon:'switch', t:'Core and leaf switches', s:'Data center fabric', sd:'sFlow/IPFIX · SNMP or gNMI',
   i:{h:'Data center switches export sFlow or IPFIX and are polled for interface counters, so Kentik sees east-west traffic and link health together.',
      d:['sFlow is the only common flow protocol that carries a packet sample. IPFIX and NetFlow v9 add MAC and VLAN through option templates.',
         'Sanity check: flow volume should land within about 20% of SNMP interface traffic.']}},
  {id:'fw', x:44, y:214, w:216, h:52, k:'net', icon:'firewall', t:'Firewalls', s:'Perimeter and internal', sd:'Flow · syslog · traps',
   i:{h:'Firewalls export flow and send syslog and traps, so allowed and denied traffic sits next to device health and events.',
      d:['Syslog to the agent on UDP or TCP 514; traps to UDP 162.','Trap and syslog ingestion require the device to be licensed for NMS.']}}
];
const DC_SRV = {id:'srv', k:'srv', icon:'server', t:'Servers and hypervisors', s:'Linux, Windows, VMware', sd:'Syslog to UDP/TCP 514',
  i:{h:'Servers and hypervisors can send syslog to the same agent, so server events line up with network events.', d:['Changing the syslog port currently needs Kentik support.']}};
const DC_DNS = {id:'dnsn', k:'srv', icon:'dns', t:'DNS servers', s:'Infoblox, BIND resolvers', sd:'DNSTAP stream to the agent',
  i:{h:'DNS servers stream queries and answers to the agent, which turns DNS into records Kentik can join with traffic.', d:CAP.dns.d}};
const UA_DC_I = {h:'The Universal Agent is one software package that runs capabilities. Install it once per site, then toggle capabilities on in Settings › Universal Agents. It updates itself and reports its own health.',
  d:['Install on a Linux host (VM or bare metal) or in Docker: Settings › Universal Agents › Deploy Agent generates the Linux or Docker command carrying K_COMPANY_ID and K_REGISTER_PROVISIONING_TOKEN. Portal tokens last one hour.',
     'Authorize the agent in the portal, or use an API token created with requiresApproval false. Status: Up, Down (not seen for 30 minutes) or Not Authorized.',
     'Supported OS: Debian 11–13, Ubuntu 20.04–24.04, Oracle Linux 9, CentOS Stream 8. CentOS 7 and other EL7 builds are not supported.',
     'Every capability you toggle on needs more CPU and memory on the host; size for the sum.']};
const REMOTE = {id:'remote', x:780, y:492, w:204, h:64, k:'ext', icon:'globe', t:'Other sites, SaaS', s:'Synthetic test targets', sd:'Agents, IPs, hosts, URLs', go:'saas',
  i:{h:'Connectivity Test targets: other sites’ agents, Kentik’s global and public cloud agents, SaaS apps, websites and DNS servers.', d:['Drill into Internet & SaaS apps for test types and credits.']}};

INFO.dc = {kick:'Drill-in · On-prem', title:'Data center with a Universal Agent',
hl:`<p class="lead">One Universal Agent per data center collects everything. Devices send to it, it polls them, and it forwards it all to Kentik over outbound HTTPS.</p>
<h3>What you deploy</h3><ul>
<li>The Universal Agent on a Linux host (VM or bare metal) or in Docker</li>
<li>Only the capabilities this site needs, toggled on per agent: BGP Proxy, Connectivity Test, Device Configuration Sync, DNS OTT Tap, Flow Proxy: Forwarding, SNMP Trap Receiver, SNMP/ST and Syslog Server</li>
<li>Devices pointed at the agent for flow, traps and syslog, including branches that have no agent of their own</li>
<li>Optionally, BGP from the edge routers, to the agent (BGP Proxy) or directly to Kentik</li></ul>
<h3>What Kentik collects</h3><ul>
<li>Flow, enriched with interface names, BGP, GeoIP and your custom dimensions</li>
<li>Device health and interface metrics</li><li>Traps and syslog events</li><li>DNS lookups</li><li>Synthetic test results</li><li>Config backups and changes</li></ul>
<h3>Where you see it</h3><p>Data Explorer, Kentik Map, NMS dashboards, Synthetics, AI Advisor and alerts.</p>`,
dd:`<p class="lead">Universal Agent on a Linux host or in Docker, managed from Settings › Universal Agents.</p>
<h3>Ports</h3>
<table><thead><tr><th style="width:34%">Direction</th><th style="width:32%">Port</th><th>Used by</th></tr></thead><tbody>
<tr><td>Agent → Kentik</td><td>TCP 443, TLS 1.2+</td><td>Everything: control, data, updates</td></tr>
<tr><td>Agent → Kentik</td><td>UDP 40010 (optional)</td><td>Flow Proxy base port</td></tr>
<tr><td>Devices → agent</td><td>UDP 9995</td><td>Flow Proxy</td></tr>
<tr><td>Devices → agent</td><td>UDP 162</td><td>SNMP Trap Receiver</td></tr>
<tr><td>Devices → agent</td><td>UDP and TCP 514</td><td>Syslog Server</td></tr>
<tr><td>Agent → devices</td><td>UDP 161, ICMP</td><td>SNMP/ST polling</td></tr>
<tr><td>Agent → devices</td><td>Device gNMI port</td><td>Streaming telemetry dial-in</td></tr>
<tr><td>Agent → devices</td><td>TCP 22</td><td>Device Configuration Sync (SSH)</td></tr>
<tr><td>Agent ↔ agent</td><td>TCP 8877, UDP 9977</td><td>Connectivity Test</td></tr>
<tr><td>DNS → agent</td><td>DNSTAP port you set</td><td>DNS OTT Tap</td></tr>
<tr><td>Router → agent</td><td>TCP 179</td><td>BGP Proxy</td></tr>
<tr><td>Router ↔ Kentik</td><td>TCP 179</td><td>BGP peering directly with Kentik, if used</td></tr>
<tr><td>Branch devices → agent</td><td>UDP 9995 · 162 · 514</td><td>Branches with no agent, across the WAN</td></tr>
</tbody></table>
<h3>Outbound allowlist</h3>
<p><code>flow.kentik.com</code> <code>grpc.api.kentik.com</code> <code>api.kentik.com</code> <code>portal.kentik.com</code> <code>storage.googleapis.com</code>, optional <code>whoami.kentiklabs.com</code>. EU accounts use <code>*.kentik.eu</code>. SSL inspection must allow gRPC.</p>
<h3>Install and register</h3>
<pre>export K_COMPANY_ID=&lt;company-id&gt;
export K_REGISTER_PROVISIONING_TOKEN=&lt;token&gt;
# run the Linux or Docker command from
# Settings › Universal Agents › Deploy Agent
# behind a proxy: export https_proxy=http://proxy:port</pre>
<ul><li>Portal tokens last 1 hour. API tokens (<code>grpc.api.kentik.com/kagent/v202401/provisioning-tokens</code>) take maxUsageCount, expiresAt and requiresApproval.</li>
<li>Linux: Debian 11–13, Ubuntu 20.04–24.04, Oracle Linux 9 or CentOS Stream 8 (not CentOS 7 or other EL7). Docker: pass a proxy with <code>--env</code> if you need one.</li>
<li>Agents update themselves and their capabilities.</li></ul>
<h3>Sizing per capability</h3>
<table><thead><tr><th style="width:50%">Capability</th><th>CPU / RAM</th></tr></thead><tbody>
<tr><td>Flow Proxy: Forwarding</td><td>1 core / 2 GB, 20k+ FPS</td></tr>
<tr><td>Flow Proxy (Edge Processing)</td><td>8 cores / 32 GB, 25k+ FPS</td></tr>
<tr><td>SNMP/ST</td><td>2 cores / 8 GB, up to 500 devices</td></tr>
<tr><td>Syslog Server</td><td>1 core / 1 GB per 8k events/s</td></tr>
<tr><td>Connectivity Test</td><td>2 cores / 2 GB</td></tr>
<tr><td>DNS OTT Tap</td><td>1 core / 1 GB per 400k lookups/s</td></tr>
<tr><td>BGP Proxy</td><td>2 cores / 2 GB</td></tr>
</tbody></table>
<p class="muted" style="font-size:12.5px">Add 20–30% headroom for bursty flow, syslog and traps.</p>
<h3>Device settings in Kentik</h3><ul>
<li><b>SNMP</b>: Flow Enrichment via Universal Agent, or Full Monitoring via Universal Agent. Pick a credential and a collection agent.</li>
<li><b>Streaming Telemetry</b>: Dial-In from Universal Agent (gNMI, optional SSL).</li>
<li><b>BGP</b>: Peer with device, with the router’s peering address, ASN and optional MD5 password.</li>
<li><b>SSH</b>: credential, collection agent, platform autodetect, config sync and fetch interval.</li></ul>
<h3>Licensing</h3><ul>
<li>FlowPak covers flow and SNMP flow enrichment.</li>
<li>An NMS device license (DevicePak) adds full monitoring, syslog, traps and SSH.</li>
<li>Synthetics runs on test credits.</li></ul>`,
src:[['Universal Agents','https://kb.kentik.com/docs/universal-agents'],['UA Deployment','https://kb.kentik.com/docs/ua-deployment'],['UA Portal Management','https://kb.kentik.com/docs/ua-portal-management'],['Device Settings','https://kb.kentik.com/docs/device-settings'],['Router Configuration','https://kb.kentik.com/docs/router-configuration'],['Flow Overview','https://kb.kentik.com/docs/flow-overview'],['NMS Setup','https://kb.kentik.com/docs/nms-setup'],['SNMP Traps & Syslog','https://kb.kentik.com/docs/snmp-traps-syslogs'],['SSH Command Access for Kentik NMS','https://kb.kentik.com/docs/ssh-command-access-for-kentik-nms'],['Migration Scenarios (kproxy to UA)','https://kb.kentik.com/docs/kproxy-migration-scenarios']]};

/* ===== Branch office pieces ===== */
const BR_NETGRP = {id:'netgrp', x:32, y:58, w:240, h:222, label:'Branch network devices', cls:'sframe',
  i:{h:'Branch devices send flow, traps and syslog to an agent and answer its SNMP polls. That agent is either at the branch or in a data center.',
     d:['Use the same device settings as the data center: SNMP tab “Flow Enrichment via Universal Agent” or “Full Monitoring via Universal Agent”, then pick the collection agent.',
        'At a small site, flow from the WAN router alone often answers most questions.']}};
const BR_DEVICES = [
  {id:'wan', x:44, y:90, w:216, h:52, k:'net', icon:'router', t:'Branch / SD-WAN router', s:'WAN edge', sd:'Flow, SNMP, syslog, traps',
   i:{h:'The WAN or SD-WAN edge sees everything entering and leaving the site, so its flow is the most valuable single source at a branch.', d:['Export flow on UDP 9995 to the agent that collects for this branch, and set the same sample rate in Kentik.']}},
  {id:'sw', x:44, y:152, w:216, h:52, k:'net', icon:'switch', t:'Access switches', s:'Wired users and devices', sd:'sFlow · SNMP',
   i:{h:'Access switches add interface health and, with sFlow, local traffic.', d:[]}},
  {id:'wifi', x:44, y:214, w:216, h:52, k:'net', icon:'wifi', t:'Wi-Fi controller, APs', s:'Wireless users', sd:'Syslog · traps · SNMP',
   i:{h:'Wireless controllers mostly contribute events and health: syslog, traps and SNMP.', d:[]}}
];
const BR_USERS = {id:'users', k:'ext', icon:'users', t:'Users at the site', s:'Experience you test for', sd:'Tests run from here',
  i:{h:'People at the branch. Tests from the branch agent measure the paths and apps they rely on, before anyone opens a ticket.', d:[]}};
const BR_DNS = {id:'dnsn', k:'srv', icon:'dns', t:'Local DNS resolver', s:'Branch or SD-WAN DNS', sd:'DNSTAP or mirrored DNS',
  i:{h:'A local resolver streams DNS to the branch agent, so lookups from this site line up with its traffic.', d:CAP.dns.d}};
const UA_BR_I = {h:'The same Universal Agent as the data center, sized for a small site. Install it once, then toggle on only what the site needs.',
  d:['Footprint: Connectivity Test 2 cores / 2 GB, Syslog 1 core / 1 GB, SNMP/ST 2 cores / 8 GB for up to 500 devices.',
     'Linux or Docker install command from Settings › Universal Agents › Deploy Agent.',
     'Assign the agent to a Site so devices and tests group by location.']};
function BR_TARGETS(dcGo){ return {
  frame:{x:584, y:58, w:184, h:296, label:'Test targets', cls:'sframe', ghost:true},
  nodes:[
    {id:'t-dc', x:592, y:88, w:172, h:52, k:'ext', icon:'agent', t:'Data center agent', s:'Agent-to-agent', sd:'TCP 8877 · UDP 9977', go:dcGo,
     i:{h:'Agent-to-agent and Network Mesh tests between the branch and data center agents measure latency, loss and jitter in both directions.', d:['Each direction is a subtest. A 4-agent private mesh every minute is 12 subtests, 30 credits per run.']}},
    {id:'t-saas', x:592, y:152, w:172, h:52, k:'ext', icon:'app', t:'SaaS apps', s:'Microsoft 365, Zoom', sd:'HTTP(S), DNS, ping', go:'saas',
     i:{h:'HTTP(S) and API tests check status code, time to last byte and response size from the branch.', d:['Page load and transaction tests run on Kentik app agents with headless Chromium.']}},
    {id:'t-cloud', x:592, y:216, w:172, h:52, k:'ext', icon:'cloud', t:'Cloud regions', s:'Public cloud agents', sd:'Network mesh tests',
     i:{h:'Kentik’s public cloud agents sit in AWS, Azure, GCP and OCI regions, so you can test from the branch to the regions you use.', d:['Global agent subtests cost 5 credits per run.']}},
    {id:'t-dns', x:592, y:280, w:172, h:52, k:'ext', icon:'dns', t:'DNS servers', s:'Lookup time', sd:'DNS Server Monitor',
     i:{h:'DNS Server Monitor tests a hostname against your resolvers and reports resolution time and the answer.', d:['DNS Server Grid runs the same lookup against many resolvers at once to find slow ones.']}}
  ]}; }

INFO.branch = {kick:'Drill-in · On-prem', title:'Branch or campus with a Universal Agent',
hl:`<p class="lead">The same Universal Agent, sized for a small site. It adds local flow and device health, and it tests the paths your users depend on.</p>
<h3>What you deploy</h3><ul>
<li>The Universal Agent on a small Linux host (a VM or a small PC) or in Docker</li>
<li>Only the capabilities this site needs, for example Flow Proxy: Forwarding, SNMP/ST and Connectivity Test</li>
<li>Tests from the branch to the data center, cloud regions, SaaS apps and DNS</li></ul>
<h3>Why it matters</h3><ul>
<li>Site-to-site tests show latency, loss and jitter between locations</li>
<li>Site-to-app tests show what users at this site actually experience</li>
<li>Flow and health from the branch router explain why a test went red</li></ul>`,
dd:`<p class="lead">Same install and ports as the data center. The differences are the capabilities you enable and the tests you schedule.</p>
<h3>Ports</h3>
<table><thead><tr><th style="width:36%">Direction</th><th style="width:32%">Port</th><th>Used by</th></tr></thead><tbody>
<tr><td>Agent → Kentik</td><td>TCP 443, TLS 1.2+</td><td>Everything</td></tr>
<tr><td>Agent ↔ agent</td><td>TCP 8877, UDP 9977</td><td>Agent-to-agent, mesh</td></tr>
<tr><td>Agent → targets</td><td>ICMP, TCP or UDP</td><td>Ping and traceroute (TCP lets you pick the port)</td></tr>
<tr><td>Agent → targets</td><td>TCP 80 / 443</td><td>HTTP(S) and API tests</td></tr>
<tr><td>Devices → agent</td><td>UDP 9995 · 162 · 514</td><td>Flow, traps, syslog</td></tr>
</tbody></table>
<h3>Test types you can run from here</h3><ul>
<li><b>Network</b>: Agent-to-Agent, Network Mesh, Server IP, Server Hostname, Network Grid</li>
<li><b>Autonomous</b>: ASN, CDN, country, region and city targets picked from your flow</li>
<li><b>DNS</b>: DNS Server Monitor, DNS Server Grid</li>
<li><b>HTTP</b>: HTTP(S) or API (GET, POST, PUT, PATCH)</li></ul>
<p class="note">Page load and transaction tests use Kentik app agents with headless Chromium. Confirm which continuous test types the Universal Agent runs today with your Infoblox team.</p>
<h3>Test credits</h3>
<table><thead><tr><th style="width:56%">Test</th><th>Credits</th></tr></thead><tbody>
<tr><td>Network subtest, private agent</td><td>2.5 per run</td></tr>
<tr><td>Network subtest, global agent</td><td>5 per run</td></tr>
<tr><td>HTTP or page load subtest</td><td>timeout (s) × 0.5 private, × 1 global</td></tr>
<tr><td>4-agent private mesh, every minute</td><td>30 per run, about 1.3M per month</td></tr>
</tbody></table>
<p class="muted" style="font-size:12.5px">Test status is Healthy, Warning, Critical or Pending, based on latency, loss and jitter thresholds.</p>`,
src:[['Synthetics Overview','https://kb.kentik.com/docs/synthetics-overview'],['Test Types Reference','https://kb.kentik.com/docs/test-types'],['Test Credits','https://kb.kentik.com/docs/test-credits'],['Universal Agents','https://kb.kentik.com/docs/universal-agents'],['Agents Page','https://kb.kentik.com/docs/agents-page']]};

/* ===== Internet & SaaS apps ===== */
SC.saas = {
  frames:[
    {x:16, y:16, w:744, h:588, label:'Internet and SaaS apps'},
    {id:'global', x:32, y:58, w:250, h:296, label:'Kentik global agent network', cls:'sframe',
     i:{h:'Kentik runs agents at Internet hubs, in public cloud regions and on broadband connections. Every customer with synthetics can use them.',
        d:['Hosted agents in data centers at key Internet hubs; public cloud agents in AWS, GCP, Azure and OCI regions; app agents with headless Chromium; broadband agents in real end-user homes.',
           'Global agent subtests cost 5 credits per run.']}},
    {id:'private', x:32, y:374, w:250, h:178, label:'Your Universal Agents', cls:'sframe',
     i:{h:'Your agents at sites and in cloud VPCs are private test points that only your account uses.',
        d:['No extra license for private agents. Their subtests cost 2.5 credits per run.','Agent-to-agent tests need TCP 8877 and UDP 9977 open between agents.']}}
  ],
  nodes:[
    {id:'g-hub', x:44, y:88, w:226, h:52, k:'ktk', icon:'probe', t:'Hosted agents', s:'Internet hubs worldwide', sd:'5 credits per subtest',
     i:{h:'Kentik-installed agents in data centers at key Internet hubs: the Internet’s point of view.', d:[]}},
    {id:'g-cloud', x:44, y:154, w:226, h:52, k:'ktk', icon:'cloud', t:'Public cloud agents', s:'AWS, Azure, GCP, OCI', sd:'Cloud region vantage points',
     i:{h:'A subset of global agents running inside public cloud regions, so you can test to and from the regions your workloads use.', d:[]}},
    {id:'g-app', x:44, y:220, w:226, h:52, k:'ktk', icon:'app', t:'App agents', s:'Headless Chromium', sd:'Page load + transaction',
     i:{h:'Global agents that run a real browser engine for page load and scripted transaction tests.', d:[]}},
    {id:'g-bb', x:44, y:286, w:226, h:52, k:'ktk', icon:'wifi', t:'Broadband agents', s:'End-user view from homes', sd:'Run in real homes',
     i:{h:'Agents on consumer broadband connections give an end-user view. Many run in real homes, so they can be less stable than data center agents.', d:[]}},
    {id:'p-dc', x:44, y:404, w:226, h:52, k:'chip', icon:'agent', t:'Data center agent', s:'Private test point', sd:'2.5 credits per subtest', go:'dc',
     i:{h:'A data center Universal Agent with Connectivity Test on.', d:CAP.synth.d}},
    {id:'p-br', x:44, y:468, w:226, h:52, k:'chip', icon:'agent', t:'Branch agent', s:'Private test point', sd:'TCP 8877 · UDP 9977', go:'br1',
     i:{h:'A branch Universal Agent with Connectivity Test on. Branches without an agent can still be tested as a target from a data center agent.', d:CAP.synth.d}},
    {id:'t-saas', x:340, y:88, w:220, h:56, k:'ext', icon:'app', t:'SaaS apps', s:'Microsoft 365, Salesforce', sd:'HTTP(S)/API, page load',
     i:{h:'Test the SaaS apps your users rely on, from where your users are.',
        d:['HTTP(S) or API test: status code, average time to last byte and response size, with optional ping to the resolved IP.','Page load test: a full browser load with navigation, DNS, connect and response timings, on app agents.']}},
    {id:'t-web', x:340, y:164, w:220, h:56, k:'ext', icon:'portal', t:'Your websites and APIs', s:'Public front doors', sd:'Transaction scripts',
     i:{h:'Watch your own public sites and APIs the way customers reach them.', d:['Transaction test: a custom Puppeteer script in headless Chromium, with total time per agent and screenshots of each step.']}},
    {id:'t-dns', x:340, y:240, w:220, h:56, k:'ext', icon:'dns', t:'DNS servers', s:'Answer and lookup time', sd:'DNS Server Monitor, Grid',
     i:{h:'Check resolution time and answers for the names that matter.', d:['DNS Server Monitor: one or more resolvers for a hostname. DNS Server Grid: the same lookup across many resolvers at once.']}},
    {id:'t-net', x:340, y:316, w:220, h:56, k:'ext', icon:'globe', t:'Internet paths', s:'ASN, CDN, country, city', sd:'Autonomous tests from flow',
     i:{h:'Test the networks your traffic actually uses.',
        d:['Autonomous tests pick targets from your flow, SNMP, BGP and GeoIP data: the IPs your traffic uses most in an ASN, CDN, country, region or city.','Network Grid: ping and traceroute to a pasted or uploaded list of IPs.']}},
    {id:'bgpv', x:340, y:430, w:220, h:56, k:'ext', icon:'route', t:'BGP vantage points', s:'Route Views + Kentik peers', sd:'0.53 credits per minute',
     i:{h:'BGP Monitor watches your prefixes for hijacks and route leaks from thousands of vantage points. It needs no agents.',
        d:['Data comes from the public Route Views project plus Kentik’s own peering sessions with customer routers.','Origins outside your allowed ASN list show as critical Invalid Origin events; upstream leaks can be flagged too.','BGP Route Viewer shows announcements and withdrawals for your prefixes over the last 12 hours, with RPKI status.']}},
    KEN({lines:['Test results and status','Meshes and incident log','Kentik Map, AI Advisor','Alerts to your channels'],
         linesd:['Results via api.kentik.com','Healthy · Warning · Critical','Credits per subtest and run','State of the Internet (free)']})
  ],
  edges:[
    {t:'synth', a:'global', b:'t-saas', p:[[282,116],[340,116]]},
    {t:'synth', a:'global', b:'t-web', p:[[282,180],[340,192]]},
    {t:'synth', a:'global', b:'t-dns', p:[[282,246],[340,268]]},
    {t:'synth', a:'global', b:'t-net', p:[[282,312],[340,344]]},
    {t:'synth', a:'private', b:'t-saas', p:[[282,430],[312,430],[312,130],[340,130]]},
    {t:'synth', a:'private', b:'t-dns', p:[[282,494],[324,494],[324,282],[340,282]]},
    {t:'https', a:'global', b:'kentik', p:[[262,58],[262,36],[882,36],[882,130]], lab:'Test results over HTTPS', labd:'Results and status to Kentik on TCP 443', lp:[620,36]},
    {t:'https', a:'private', b:'kentik', p:[[157,552],[157,584],[882,584],[882,460]], lab:'Results over HTTPS', labd:'TCP 443 from your agents', lp:[560,584]},
    {t:'bgp', a:'bgpv', b:'kentik', p:[[560,458],[780,420]], lab:'Route updates', lp:[668,428]}
  ],
  notes:[
    {x:340, y:512, t:'', td:'State of the Internet shows public app,'},
    {x:340, y:529, t:'', td:'cloud and network health with no credits.'}
  ]
};

INFO.saas = {kick:'Drill-in · Synthetics', title:'Internet and SaaS app testing',
hl:`<p class="lead">Kentik’s global agents and your own agents run continuous tests, so you see problems in apps, DNS and Internet paths before users report them.</p>
<h3>Where tests come from</h3><ul>
<li><b>Kentik global agents</b>: Internet hubs, public cloud regions, app agents with a real browser, and broadband agents in homes</li>
<li><b>Your Universal Agents</b>: data centers, branches and cloud VPCs</li></ul>
<h3>What gets tested</h3><ul>
<li>SaaS apps and your own websites and APIs</li><li>DNS servers</li><li>Paths between your sites and clouds</li><li>The Internet networks your traffic uses</li><li>Your BGP prefixes, watched for hijacks and leaks</li></ul>
<h3>Where you see it</h3><p>The Synthetics dashboard (test status, incident log, meshes, credit use), Kentik Map and AI Advisor, next to real traffic and SNMP data.</p>`,
dd:`<p class="lead">Tests are made of subtests: one agent to one target in one direction, run on an interval.</p>
<h3>Test types</h3>
<table><thead><tr><th style="width:30%">Category</th><th>Tests</th></tr></thead><tbody>
<tr><td>Routing</td><td>BGP Monitor (hijacks, leaks, RPKI)</td></tr>
<tr><td>Agent-to-agent</td><td>Agent-to-Agent, Network Mesh</td></tr>
<tr><td>Agent-to-server</td><td>Server IP, Server Hostname, Network Grid</td></tr>
<tr><td>Autonomous</td><td>ASN, CDN, Country, Region, City</td></tr>
<tr><td>DNS</td><td>DNS Server Monitor, DNS Server Grid</td></tr>
<tr><td>HTTP</td><td>HTTP(S) or API, Page Load, Transaction</td></tr>
</tbody></table>
<h3>Protocols</h3><ul>
<li>Ping: ICMP, TCP (pick a port) or UDP-ICMP. Traceroute: ICMP, UDP or TCP. IPv4 and IPv6.</li>
<li>HTTP(S): GET, POST, PUT, PATCH to TCP 80 or 443.</li>
<li>Agents report to Kentik over TCP 443.</li></ul>
<h3>Credits</h3>
<table><thead><tr><th style="width:58%">Item</th><th>Credits</th></tr></thead><tbody>
<tr><td>Network subtest from a global agent</td><td>5 per run</td></tr>
<tr><td>Network subtest from a private agent</td><td>2.5 per run</td></tr>
<tr><td>HTTP or page load subtest</td><td>timeout (s) × 1 global, × 0.5 private</td></tr>
<tr><td>BGP Monitor</td><td>0.53 per minute</td></tr>
<tr><td>Test Preview</td><td>Free until saved</td></tr>
</tbody></table>
<p class="muted" style="font-size:12.5px">A test every minute runs 43,200 times in a 30-day month. Example from the KB: a 5-agent mesh (2 private, 3 global) every minute is 80 credits per run.</p>
<h3>Status</h3><p>Healthy, Warning, Critical or Pending, from latency, packet loss and jitter. Agents: Active, Pending, Warning (offline 5–60 minutes) or Critical (offline 60+ minutes).</p>`,
src:[['Synthetics Overview','https://kb.kentik.com/docs/synthetics-overview'],['Test Types Reference','https://kb.kentik.com/docs/test-types'],['Test Credits','https://kb.kentik.com/docs/test-credits'],['Agents Page','https://kb.kentik.com/docs/agents-page'],['Synthetics Agent (agent types)','https://kb.kentik.com/docs/synthetics-agent'],['BGP Route Viewer','https://kb.kentik.com/docs/bgp-route-viewer']]};
