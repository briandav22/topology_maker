/* ---------- Shared data: line types, deployments, presets ---------- */
const TYPES = {
  https:  {n:'To Kentik (HTTPS)', d:'Telemetry sent to Kentik SaaS over outbound HTTPS or gRPC with TLS 1.2+', pt:'sq'},
  pull:   {n:'Kentik reads', d:'Kentik reads from your cloud account using read-only access you grant', pt:'sq'},
  flow:   {n:'Flow and flow logs', d:'NetFlow, sFlow or IPFIX sent to the Universal Agent, or cloud flow logs written to storage', pt:'sq'},
  snmp:   {n:'SNMP and telemetry', d:'The Universal Agent polls SNMP or dials in with gNMI streaming telemetry', pt:'ring'},
  trap:   {n:'SNMP traps', d:'Devices push SNMP traps to the Universal Agent', pt:'dot'},
  syslog: {n:'Syslog', d:'Devices and servers push syslog to the Universal Agent', pt:'sq'},
  dns:    {n:'DNS', d:'A DNSTAP stream (for example from Infoblox) or mirrored DNS traffic', pt:'dot'},
  synth:  {n:'Synthetic tests', d:'Ping, traceroute, DNS and HTTP tests between agents and targets', pt:'ring'},
  ssh:    {n:'SSH', d:'Read-only SSH for config backups and show commands', pt:'sq'},
  bgp:    {n:'BGP', d:'BGP peering so Kentik can add routing context to flow', pt:'dot'},
  perm:   {n:'Grants read access', d:'A read-only permission you grant to Kentik', pt:null},
  int:    {n:'Inside Kentik', d:'Processing inside the Kentik platform', pt:'dot'}
};

const MODS = [
  {id:'dc', side:'left', name:'Data center', icon:'building', tag:'Universal Agent',
   sub:'One agent per site, capabilities on', subd:'In: UDP 9995, 162, 514 · Out: TCP 443',
   flowline:'Devices → Universal Agent → Kentik',
   pipe:[['router','Routers, switches','and firewalls'],['agent','Universal','Agent'],['egress','Outbound','HTTPS only']],
   chips:[['flow','Flow'],['snmp','SNMP/ST'],['trap','Traps'],['syslog','Syslog'],['dns','DNS'],['synth','Tests'],['ssh','Config'],['bgp','BGP']],
   one:'A Universal Agent in the data center collects flow, metrics, traps, syslog, DNS, tests and configs.',
   oned:'UA on a Linux host or in Docker. Devices send to UDP 9995/162/514; the agent polls UDP 161 and SSH 22; everything leaves on TCP 443.'},
  {id:'branch', side:'left', name:'Branch office', icon:'store', tag:'Universal Agent',
   sub:'Same agent, fewer capabilities', subd:'Agent tests: TCP 8877 · UDP 9977',
   flowline:'Branch devices → Universal Agent → Kentik',
   pipe:[['router','Branch router,','switches, Wi-Fi'],['agent','Universal','Agent'],['probe','Tests to apps','and other sites']],
   chips:[['flow','Flow'],['snmp','SNMP/ST'],['trap','Traps'],['syslog','Syslog'],['synth','Tests']],
   one:'A small Universal Agent per branch adds local flow and device health, and tests the paths users depend on.',
   oned:'Same UA build. Turn on Flow Proxy, SNMP/ST, Trap Receiver, Syslog and Synthetics as needed. Open TCP 8877 and UDP 9977 for agent-to-agent tests.'},
  {id:'aws', side:'right', name:'AWS', icon:'cloud', tag:'Agentless',
   sub:'Flow logs to S3, read-only IAM role', subd:'Role trusts account 834693425129',
   flowline:'VPC, TGW and firewall logs → S3 → IAM role',
   pipe:[['network','VPC, TGW and','firewall logs'],['bucket','S3 bucket','per region'],['key','IAM role','for Kentik']],
   chips:[['flow','Flow logs'],['flow','Firewall logs'],['pull','Metadata'],['snmp','CloudWatch']],
   one:'No agent. You write flow logs to S3 and give Kentik a read-only IAM role.',
   oned:'IAM role trusts arn:aws:iam::834693425129:root with sts:ExternalId = your Company ID. Policy: ec2/directconnect/elb/network-firewall Describe, CloudWatch read, s3:Get*/List* on the bucket.'},
  {id:'azure', side:'right', name:'Azure', icon:'cloud', tag:'Agentless',
   sub:'VNet flow logs to a storage account', subd:'Reader + Storage Blob Data Reader',
   flowline:'VNet and firewall logs → storage account → Kentik app',
   pipe:[['network','VNet flow and','firewall logs'],['storage','Storage','account'],['key','Kentik app','read-only roles']],
   chips:[['flow','Flow logs'],['flow','Firewall logs'],['pull','Metadata'],['snmp','Metrics']],
   one:'No agent. Network Watcher writes VNet flow logs to a storage account that the Kentik app can read.',
   oned:'Kentik enterprise app or your own app registration. Reader on the subscription or resource group, Storage Blob Data Reader on the storage account.'},
  {id:'gcp', side:'right', name:'Google Cloud', icon:'cloud', tag:'Agentless',
   sub:'Flow logs to Pub/Sub, Kentik pulls', subd:'Subscriber + Viewer, Compute Viewer',
   flowline:'Subnet flow logs → Pub/Sub → Kentik pulls',
   pipe:[['network','Subnet','flow logs'],['queue','Pub/Sub topic','+ pull sub'],['key','IAM roles','for Kentik']],
   chips:[['flow','Flow logs'],['pull','Metadata'],['flow','Cloud Run logs'],['snmp','Metrics']],
   one:'No agent. A log sink sends VPC flow logs to Pub/Sub, and Kentik pulls them with its own service account.',
   oned:'Grant kentik-vpc-flow@kentik-vpc-flow.iam.gserviceaccount.com Pub/Sub Subscriber + Viewer on the subscription and Compute Viewer on the project or top folder.'},
  {id:'oci', side:'right', name:'Oracle Cloud', icon:'cloud', tag:'Agentless',
   sub:'Flow logs to Object Storage', subd:'Cross-tenancy policy or API key user',
   flowline:'VCN flow logs → Connector Hub → bucket',
   pipe:[['network','VCN','flow logs'],['connector','Connector Hub','to a bucket'],['key','Policy','for Kentik']],
   chips:[['flow','Flow logs'],['pull','Metadata']],
   one:'No agent. Connector Hub moves VCN flow logs into an Object Storage bucket that Kentik reads.',
   oned:'Cross-tenancy policy generated in the Kentik portal (recommended), or a user and group holding Kentik’s API key. READ on the bucket and network resources.'},
  {id:'saas', side:'top', name:'Internet & SaaS apps', icon:'globe', tag:'Synthetics',
   sub:'Global agents and your agents test apps', subd:'Global 5 credits per subtest · private 2.5',
   flowline:'Global agents + your agents → SaaS apps, sites, DNS',
   pipe:[['probe','Kentik global','agents'],['app','SaaS apps','and websites'],['agent','Your Universal','Agents']],
   chips:[['synth','HTTP, DNS, ping, trace'],['synth','Page load'],['bgp','BGP Monitor']],
   one:'Kentik’s global agent network plus your own agents test SaaS apps, websites, DNS and Internet paths.',
   oned:'Network tests (agent-to-agent, mesh, IP, hostname, grid, autonomous), DNS, HTTP(S)/API, page load and transaction tests, plus BGP Monitor.'}
];
const MOD = Object.fromEntries(MODS.map(m => [m.id, m]));

const HUB = {name:'Kentik SaaS', rows:['Ingest and enrichment','Kentik Data Engine','Portal, AI Advisor, APIs'],
  subd:'US (Ashburn) or EU (Frankfurt)'};

const PRESETS = [
  {id:'start', n:'Site + AWS', s:['dc','aws']},
  {id:'all', n:'Everything', s:['dc','branch','aws','azure','gcp','oci','saas']},
  {id:'onprem', n:'On-prem', s:['dc','branch']},
  {id:'multi', n:'Multi-cloud', s:['aws','azure','gcp','oci']},
  {id:'hybrid', n:'Hybrid', s:['dc','branch','aws','azure','saas']}
];
const CHIP_ORDER = ['dc','branch','aws','azure','gcp','oci','saas'];
const CHIP_NAMES = {dc:'Data center', branch:'Branch', aws:'AWS', azure:'Azure', gcp:'GCP', oci:'OCI', saas:'SaaS & Internet'};
const DC_MAX = 6;

/* Overview panel content */
const OV_HL = `
<p class="kick">Infoblox + Kentik · Overview</p>
<h2>How Kentik is deployed</h2>
<p class="lead">Kentik, now part of Infoblox, is SaaS. You run a small footprint where your network lives, and everything lands in your Kentik account over encrypted, outbound connections.</p>
<h3>Three patterns cover almost everything</h3>
<div class="card"><h4>On-prem: one Universal Agent per site</h4><p>A single agent on a Linux host or in Docker, with capabilities switched on: Flow Proxy, SNMP/ST, Trap Receiver, Syslog Server, DNS OTT Tap, Synthetics and SSH config access. Devices point at it, and it talks to Kentik over HTTPS. Each new data center or branch gets its own agent.</p></div>
<div class="card"><h4>Public cloud: agentless</h4><p>You turn on flow logs, send them to storage in your own account, and grant Kentik read-only access. Kentik also reads topology metadata and metrics.</p></div>
<div class="card"><h4>Internet and SaaS: synthetic tests</h4><p>Kentik’s global agents and your own agents test SaaS apps, websites, DNS and paths between your sites and clouds.</p></div>
<h3 id="ov-sel-h">What you are looking at</h3>
<div id="ov-sel"></div>
<p class="muted" style="font-size:12.5px">Tip: click a box or press 1 to 7 to drill in. The + and − buttons next to Data center (or the + and − keys) add and remove data centers. Esc goes back. D and H switch modes.</p>`;

const OV_DD = `
<p class="kick">Infoblox + Kentik · Deep dive</p>
<h2>Deployment details at a glance</h2>
<p class="lead">Ports, permissions and licensing across every deployment type. Drill into a box for the full detail.</p>
<h3>Firewall rules</h3>
<table><thead><tr><th style="width:34%">From → to</th><th style="width:30%">Port</th><th>Why</th></tr></thead><tbody>
<tr><td>Universal Agent → Kentik</td><td>TCP 443, TLS 1.2+</td><td>flow, grpc.api, api, portal .kentik.com and storage.googleapis.com (EU: .kentik.eu)</td></tr>
<tr><td>Devices → Universal Agent</td><td>UDP 9995 · UDP 162 · UDP/TCP 514</td><td>Flow, SNMP traps, syslog</td></tr>
<tr><td>Universal Agent → devices</td><td>UDP 161 · gNMI · ICMP · TCP 22</td><td>SNMP, streaming telemetry, reachability, SSH config</td></tr>
<tr><td>Agent ↔ agent</td><td>TCP 8877 · UDP 9977</td><td>Agent-to-agent and mesh tests</td></tr>
<tr><td>Edge router ↔ Kentik</td><td>TCP 179</td><td>BGP peering with the Kentik ingest peering IPs shown in device settings</td></tr>
<tr><td>Kentik → Azure storage</td><td>From 20.69.189.228 and 20.69.185.115</td><td>Only if the storage account firewall is restricted</td></tr>
</tbody></table>
<h3>Cloud access you grant</h3>
<table><thead><tr><th style="width:18%">Cloud</th><th style="width:38%">You create</th><th>Kentik gets</th></tr></thead><tbody>
<tr><td>AWS</td><td>IAM role trusting <code>arn:aws:iam::834693425129:root</code>, ExternalId = Company ID</td><td>Describe APIs, CloudWatch read, <code>s3:Get*</code> and <code>s3:List*</code> on the log bucket</td></tr>
<tr><td>Azure</td><td>Kentik enterprise app or your own app registration</td><td>Reader on the subscription or resource group, Storage Blob Data Reader on the storage account</td></tr>
<tr><td>GCP</td><td>Pub/Sub topic and pull subscription</td><td>Kentik’s service account gets Pub/Sub Subscriber + Viewer and Compute Viewer</td></tr>
<tr><td>OCI</td><td>Log group, Connector Hub, bucket</td><td>Cross-tenancy policy or API key user with READ on the bucket and network resources</td></tr>
</tbody></table>
<h3>Licensing</h3>
<ul>
<li><b>FlowPak</b>: flow from routers, switches, firewalls and hosts, including SNMP flow enrichment.</li>
<li><b>NMS / DevicePak</b>: full device monitoring, plus syslog, SNMP traps and SSH config and commands.</li>
<li><b>CloudPak</b>: public cloud flow logs, sized in flows per second.</li>
<li><b>Synthetics</b>: monthly test credits. Global agent subtest 5 credits, private agent 2.5, BGP Monitor 0.53 per minute.</li>
</ul>
<p class="note">Plans and editions vary by contract. Confirm entitlements with your Infoblox account team.</p>
<h3 id="ov-sel-h">Selected deployments</h3>
<div id="ov-sel"></div>`;
