/* ---------- Scene data: AWS and Azure ---------- */
function COLLECTOR(o){ return Object.assign({id:'collector', x:780, y:96, w:204, h:88, k:'ktk', icon:'ib', t:'Kentik collector'}, o); }
const CLOUD_LINES = ['Logs normalized','Enriched with metadata','Stored in KDE','Kentik Map, Pathfinder'];

/* ===== AWS ===== */
SC.aws = {
  frames:[{x:16, y:16, w:744, h:588, label:'Your AWS account', labeld:'Your AWS account (Standard), or hub and spoke accounts (Nested)'}],
  nodes:[
    {id:'vpc', x:40, y:70, w:220, h:56, k:'srv', icon:'network', t:'VPCs, subnets, ENIs', s:'East-west and egress', sd:'Custom format, v2–v5',
     i:{h:'VPC flow logs record traffic for whole VPCs, subnets or single ENIs, including east-west traffic and the effect of security groups.',
        d:['Create flow log: Filter All, destination S3 bucket ARN, Custom format with all v2–v5 fields. Default logs miss TCP flags, drop reasons, region and zone, and packet size.',
           'Files land under AWSLogs/<account-id>/vpcflowlogs/ as .log.gz, usually 5–10 minutes after traffic.',
           'Write interval: every minute (recommended for security and troubleshooting) or every 10 minutes (AWS default, lower cost).']}},
    {id:'tgw', x:40, y:140, w:220, h:56, k:'net', icon:'switch', t:'Transit Gateway', s:'Inter-VPC and hybrid', sd:'TGW flow logs',
     i:{h:'Transit Gateway flow logs show inter-VPC, VPN and Direct Connect traffic in one place.', d:['They do not replace VPC flow logs; Kentik recommends turning on both.']}},
    {id:'nfw', x:40, y:210, w:220, h:56, k:'net', icon:'firewall', t:'Network Firewall', s:'Allowed and dropped', sd:'Flow + alert logs',
     i:{h:'Network Firewall logs show allowed and dropped traffic and rule hits, so Kentik Map, Cloud Pathfinder and Data Explorer can point to the blocking rule.',
        d:['Firewall › Logging details › Edit: Flow logs and Alert logs to an S3 bucket, with an optional prefix such as firewall-logs/.','They can share the VPC flow log bucket.']}},
    {id:'apis', x:40, y:312, w:220, h:56, k:'srv', icon:'api', t:'AWS APIs', s:'Topology metadata', sd:'EC2, DX, ELB, NFW, WAN',
     i:{h:'Kentik reads your topology with describe calls: VPCs, subnets, route tables, security groups, NACLs, gateways, Transit Gateways and more.',
        d:['Feeds the Kentik Map, flow enrichment and Cloud Pathfinder connectivity checks.',
           'Services: EC2 (including Transit Gateway), Direct Connect, ELB, IAM ListAccountAliases, Network Manager (Cloud WAN) and Network Firewall. Optional: Organizations ListAccounts, CloudWatch, STS AssumeRole.']}},
    {id:'cw', x:40, y:382, w:220, h:56, k:'srv', icon:'chart', t:'CloudWatch', s:'Performance metrics', sd:'ELB, VPN, DX, TGW, NAT',
     i:{h:'Optional CloudWatch metrics add history and alerting for gateways, load balancers, VPN, Direct Connect and more.',
        d:['Namespaces: AWS/ELB, ApplicationELB, NetworkELB, GatewayELB, VPN, DX, TransitGateway, PrivateLinkEndpoints, PrivateLinkServices, EC2, S3, NATGateway, Route53, ApiGateway, NetworkFirewall and NetworkManager.']}},
    {id:'ua', x:40, y:486, w:220, h:56, k:'opt', icon:'agent', t:'Universal Agent', s:'Optional, on EC2', sd:'Private synthetic agent', go:'dc',
     i:{h:'Optional: a Universal Agent on an EC2 instance becomes a private test point inside the VPC, for tests between the cloud and your sites.',
        d:['Cloud Performance Monitor maps Direct Connect and VPN interconnects and shows path health once agents sit in your VPCs.','Same install as on-prem, outbound TCP 443 only.']}},
    {id:'s3', x:330, y:140, w:214, h:56, k:'store', icon:'bucket', t:'S3 bucket', s:'One per region', sd:'SSE-S3, or SSE-KMS + key',
     i:{h:'A bucket you own holds the logs. Kentik only reads from it.',
        d:['One bucket per region: no cross-region transfer fees, data stays in region, and no S3 throttling. Kentik treats each bucket as one device for rate purposes.',
           'SSE-S3 is recommended. With SSE-KMS add kms:Decrypt and kms:DescribeKey on the key. SSE-C is not supported.',
           'Optional: let Kentik delete old logs (Delete After Read) by widening the S3 action to s3:*.']}},
    {id:'role', x:330, y:316, w:214, h:72, k:'iam', icon:'key', t:'IAM role for Kentik', s:'Read-only access', s2:'Trusts Kentik’s account', sd:'Trusts 834693425129', sd2:'ExternalId = Company ID',
     i:{h:'An IAM role in your account that Kentik’s collector assumes. It is read-only: describe calls, CloudWatch reads and reads of the log bucket.',
        d:['Trust: Principal arn:aws:iam::834693425129:root, Action sts:AssumeRole, StringEquals sts:ExternalId = your Company ID (Account # on the Licenses page), ArnEquals aws:PrincipalArn = arn:aws:iam::834693425129:role/eks-ingest-node.',
           'Policy: ec2:Describe*, ec2:Search*, ec2:GetManagedPrefixListEntries, directconnect:Describe*/List*, elasticloadbalancing:Describe*, iam:ListAccountAliases, network-firewall:Describe*/List*, networkmanager core network reads, cloudwatch reads, and s3:Get* and s3:List* on the bucket.',
           'Kentik support can issue a random 16-digit ExternalId instead of the Company ID.']}},
    {id:'nested', x:330, y:470, w:220, h:72, k:'iam', icon:'org', t:'Several AWS accounts?', s:'Pick Several (nested) in', s2:'the panel to see the roles', sd:'Primary assumes secondary roles', sd2:'Switch on Nested in the panel',
     i:{h:'For many accounts, Kentik trusts one hub (primary) role. The hub role assumes a spoke (secondary) role in each member account.',
        d:['Hub policy: sts:AssumeRole on the spoke roles plus organizations:ListAccounts.','Spoke trust: the hub account root, no ExternalId needed. Spoke policy: the same read-only permissions as Standard.','In the export: tick “This is an AWS organization role”, then enter the spoke account IDs, their regions and the spoke role name (role suffix).','Fits large organizations, Control Tower and MSPs, or a central log-archive account with metadata from member accounts.']}},
    COLLECTOR({s:'In Kentik’s AWS account', s2:'Reads your logs inside AWS', sd:'Account 834693425129', sd2:'Role eks-ingest-node',
     i:{h:'Kentik’s cloud collector runs in Kentik’s own AWS account. It assumes your role and reads new flow log files from your bucket inside AWS, then sends them on to Kentik SaaS, so you don’t pay egress charges for the logs.',
        d:['Kentik account 834693425129, calling role eks-ingest-node.','Each VPC, Transit Gateway, subnet or interface writing logs becomes a cloud device in Kentik.']}}),
    KEN({y:250, h:250, lines:CLOUD_LINES, linesd:['Cloud export per bucket','Device per VPC or ENI','Sampling: 2–2000 or none','CloudPak flows per second']})
  ],
  edges:[
    {t:'flow', a:'vpc', b:'s3', p:[[260,98],[330,158]], lab:'Flow logs', labd:'1 or 10 min', lp:[296,108]},
    {t:'flow', a:'tgw', b:'s3', p:[[260,168],[330,168]]},
    {t:'flow', a:'nfw', b:'s3', p:[[260,238],[330,178]]},
    {t:'perm', a:'role', b:'s3', p:[[437,316],[437,196]], lab:'Read logs', labd:'s3:Get*, s3:List*', lp:[445,262], anchor:'start'},
    {t:'perm', a:'role', b:'apis', p:[[330,340],[260,340]]},
    {t:'perm', a:'role', b:'cw', p:[[330,364],[260,410]]},
    {t:'flow', a:'s3', b:'collector', p:[[544,168],[780,140]], lab:'Logs read inside AWS', labd:'No egress charge for you', lp:[662,146]},
    {t:'int', a:'collector', b:'kentik', p:[[882,184],[882,250]]},
    {t:'pull', a:'kentik', b:'role', p:[[780,352],[544,352]], lab:'Metadata API calls', labd:'sts:AssumeRole with ExternalId', lp:[662,342]},
    {t:'https', a:'ua', b:'kentik', p:[[260,514],[300,514],[300,584],[882,584],[882,500]], lab:'Test results over HTTPS', labd:'TCP 443 outbound', lp:[600,584]}
  ],
  notes:[
    {x:572, y:74, t:'Start with a metadata-only export', td:'One cloud export per S3 bucket.'},
    {x:572, y:91, t:'to prove access, then add logs.', td:'Each VPC, subnet or ENI that'},
    {x:572, y:108, t:'', td:'sends logs becomes a device.'}
  ]
};

/* Nested accounts, as in the KB: Kentik assumes the primary role in account A, which assumes a secondary role in B, C and so on */
function awsNestedScene(){
  const N = id => Object.assign({}, SC.aws.nodes.find(n => n.id === id));
  const at = (id, x, y, o) => Object.assign(N(id), {x, y}, o || {});
  const roleI = {h:'The primary role in account A. Kentik’s account assumes it, and it assumes the secondary role in each other account to read that account’s metadata.',
    d:['Trust: Kentik’s account 834693425129 with sts:ExternalId = your Company ID, as in a single account.', 'Policy: the read-only permissions, plus sts:AssumeRole on the secondary roles (AssumeSecondaryRoles) and organizations:ListAccounts.']};
  const nodes = [
    at('vpc', 40, 62, {h:50}), at('tgw', 40, 122, {h:50}), at('nfw', 40, 182, {h:50}),
    at('apis', 40, 262, {h:50}), at('cw', 40, 322, {h:50}),
    at('s3', 330, 122, {s:'Central log archive', sd:'One per region, all accounts'}),
    at('role', 330, 262, {t:'Primary IAM role', s:'Trusts Kentik’s account', s2:'Assumes the secondary roles', sd:'ExternalId = Company ID', sd2:'sts:AssumeRole on secondaries', i:roleI}),
    N('collector'), N('kentik')
  ];
  const frames = [{x:16, y:16, w:744, h:418, label:'Account A: primary', labeld:'Account A: primary (hub), the only account Kentik trusts'}];
  const edges = [
    {t:'flow', a:'vpc', b:'s3', p:[[260,87],[330,140]], lab:'Flow logs', labd:'1 or 10 min', lp:[296,96]},
    {t:'flow', a:'tgw', b:'s3', p:[[260,147],[330,150]]},
    {t:'flow', a:'nfw', b:'s3', p:[[260,207],[330,160]]},
    {t:'perm', a:'role', b:'s3', p:[[437,262],[437,178]], lab:'Read logs', labd:'s3:Get*, s3:List*', lp:[445,224], anchor:'start'},
    {t:'perm', a:'role', b:'apis', p:[[330,287],[260,287]]},
    {t:'perm', a:'role', b:'cw', p:[[330,312],[260,347]]},
    {t:'flow', a:'s3', b:'collector', p:[[544,150],[780,140]], lab:'Logs read inside AWS', labd:'No egress charge for you', lp:[662,136]},
    {t:'int', a:'collector', b:'kentik', p:[[882,184],[882,250]]},
    {t:'pull', a:'kentik', b:'role', p:[[780,298],[544,298]], lab:'Metadata API calls', labd:'sts:AssumeRole with ExternalId', lp:[662,288]}
  ];
  const sec = (key, x, name) => {
    const rx = x + 16, ax = x + 212, y = 504;
    frames.push({x, y:452, w:364, h:152, label:'Account ' + name, labeld:'Account ' + name});
    nodes.push({id:'r' + key, x:rx, y, w:172, h:60, k:'iam', icon:'key', t:'Secondary role', s:'For metadata, trusts A', sd:'Principal: account A root',
      i:{h:'A secondary role in account ' + name + '. It trusts account A, so the primary role can assume it. No ExternalId is needed.',
         d:['Trust: arn:aws:iam::<account A ID>:root, sts:AssumeRole, empty Condition.', 'Policy: the read-only metadata permissions (describe and list calls, CloudWatch reads).', 'Use the same role name in every secondary account; the export asks for it once.']}},
      {id:'a' + key, x:ax, y, w:136, h:60, k:'srv', icon:'api', t:'AWS APIs', s:'ec2, etc.', sd:'Describe, list',
       i:{h:'Account ' + name + '’s topology metadata, read through its secondary role.', d:[]}});
    edges.push({t:'perm', a:'r' + key, b:'a' + key, p:[[rx + 172, y + 30], [ax, y + 30]]});
    return rx + 128;   // enter the role right of the frame label
  };
  const bx = sec('b', 16, 'B'), cx = sec('c', 396, 'C');
  edges.push({t:'pull', a:'role', b:'rb', p:[[410,334],[410,436],[bx,436],[bx,504]], lab:'sts:AssumeRole', labd:'Primary assumes secondary', lp:[260,436]},
             {t:'pull', a:'role', b:'rc', p:[[464,334],[464,436],[cx,436],[cx,504]], lab:'sts:AssumeRole', labd:'Primary assumes secondary', lp:[cx + 70,436]});
  const notes = [
    {x:572, y:66, t:'Kentik trusts only account A.', td:'Add more secondaries the same way:'},
    {x:572, y:83, t:'A reaches B, C and so on.', td:'the export lists their IDs and regions.'}
  ];
  return {frames, nodes, edges, notes};
}

INFO.aws = {kick:'Drill-in · Public cloud', title:'AWS: flow logs to S3, read-only role',
hl:`<p class="lead">No agent in AWS. You turn on flow logs, send them to an S3 bucket you own, and create a read-only IAM role that Kentik’s collector assumes.</p>
<h3>What you set up</h3><ul>
<li>Flow logs on VPCs, Transit Gateways and Network Firewalls, written to S3 (one bucket per region)</li>
<li>An IAM role that trusts Kentik’s AWS account, protected by an ExternalId</li>
<li>A cloud export in Kentik (Settings › Public Clouds) with the role ARN and bucket</li>
<li>Many accounts? Turn on Nested above: Kentik assumes a primary role in one account, and it assumes a secondary role in each of the others</li></ul>
<h3>How data moves</h3><ul><li>Flow logs: Kentik’s collector in Kentik’s AWS account reads them from your bucket inside AWS and sends them on to Kentik SaaS, so you don’t pay egress for them</li><li>Metadata: Kentik SaaS calls the AWS APIs through your read-only role</li></ul>
<h3>What Kentik collects</h3><ul>
<li>Flow and firewall logs</li><li>Topology metadata: VPCs, subnets, routes, security groups, gateways</li><li>CloudWatch metrics (optional)</li></ul>
<h3>Where you see it</h3><p>Kentik Map, Data Explorer, Cloud Pathfinder, Cloud Performance Monitor and alerts, next to your on-prem data.</p>
<p class="note">Kentik recommends a metadata-only export first, to prove access before turning on high-volume logs.</p>`,
dd:`<h3>Role trust policy</h3>
<pre>{
 "Effect": "Allow",
 "Principal": {
  "AWS": "arn:aws:iam::834693425129:root"
 },
 "Action": "sts:AssumeRole",
 "Condition": {
  "StringEquals": {
   "sts:ExternalId": "&lt;your Company ID&gt;"
  },
  "ArnEquals": {
   "aws:PrincipalArn":
    "arn:aws:iam::834693425129:role/eks-ingest-node"
  }
 }
}</pre>
<h3>Permissions policy</h3>
<table><thead><tr><th style="width:27%">Service</th><th>Actions</th></tr></thead><tbody>
<tr><td>EC2</td><td><code>ec2:Describe*</code> <code>ec2:Search*</code> <code>ec2:GetManagedPrefixListEntries</code></td></tr>
<tr><td>Direct Connect</td><td><code>directconnect:List*</code> <code>directconnect:Describe*</code></td></tr>
<tr><td>ELB</td><td><code>elasticloadbalancing:Describe*</code></td></tr>
<tr><td>IAM</td><td><code>iam:ListAccountAliases</code></td></tr>
<tr><td>Network Firewall</td><td><code>network-firewall:Describe*</code> <code>network-firewall:List*</code></td></tr>
<tr><td>Cloud WAN</td><td><code>networkmanager:ListCoreNetworks</code> <code>GetCoreNetwork</code> <code>GetCoreNetworkPolicy</code> <code>ListAttachments</code> <code>GetNetworkRoutes</code></td></tr>
<tr><td>CloudWatch</td><td><code>cloudwatch:ListMetrics</code> <code>GetMetricStatistics</code> <code>GetMetricData</code> <code>Describe*</code></td></tr>
<tr><td>Organizations</td><td><code>organizations:ListAccounts</code></td></tr>
<tr><td>S3 (log bucket)</td><td><code>s3:Get*</code> <code>s3:List*</code> on <code>arn:aws:s3:::&lt;bucket&gt;</code> and <code>/*</code></td></tr>
<tr><td>KMS (SSE-KMS only)</td><td><code>kms:Decrypt</code> <code>kms:DescribeKey</code> on the key</td></tr>
</tbody></table>
<h3>Flow log settings</h3><ul>
<li>Filter All, destination S3, Custom format with every v2–v5 field.</li>
<li>Regional buckets. Kentik treats each bucket as one device, so hundreds of VPCs into one global bucket risks S3 throttling.</li>
<li>SSE-S3 recommended, SSE-KMS needs the KMS statement, SSE-C is not supported.</li></ul>
<h3>Cloud export in Kentik</h3><ol style="padding-left:18px;margin:0 0 8px">
<li>Settings › Public Clouds › Create Cloud Export › AWS Cloud.</li>
<li>Features: Metadata (required), Flow logs, Firewall logs, Cloud metrics history.</li>
<li>Role ARN › Verify Role. Region › Verify Region.</li>
<li>Bucket name and prefix › Verify S3 Bucket. Nested: spoke account IDs, regions, role suffix.</li>
<li>Sampling, name, billing plan, Save.</li></ol>
<p>Or tick “Help me configure my provider via Terraform” to get a <code>main.tf</code> that can create the role, bucket and flow logs.</p>
<h3>Status and sampling</h3><ul>
<li>Export status: Start, Pending, Error, OK, Disabled or Halt.</li>
<li>Sampling: Legacy (up to 10k flows per file), a rate from 2 to 2000, or Unsampled.</li>
<li>Licensing: CloudPak, measured in flows per second.</li></ul>`,
src:[['Kentik for AWS','https://kb.kentik.com/docs/kentik-for-aws'],['Metadata Configuration (AWS)','https://kb.kentik.com/docs/metadata-configuration-aws'],['Flow/Firewall Log Collection Configuration','https://kb.kentik.com/docs/flow-firewall-log-collection-configuration'],['Kentik Export Configuration for AWS','https://kb.kentik.com/docs/kentik-export-configuration-aws'],['AWS Endpoints List','https://kb.kentik.com/docs/aws-endpoints-list'],['Public Clouds','https://kb.kentik.com/docs/public-clouds'],['Cloud Performance Monitor','https://kb.kentik.com/docs/cloud-performance-monitor']]};

/* ===== Azure ===== */
SC.azure = {
  frames:[
    {x:16, y:16, w:744, h:588, label:'Your Azure tenant'},
    {x:30, y:56, w:526, h:324, label:'Subscription / resource group', cls:'sframe'},
    {x:300, y:410, w:256, h:150, label:'Microsoft Entra ID', cls:'sframe'}
  ],
  nodes:[
    {id:'vnet', x:44, y:84, w:220, h:50, k:'srv', icon:'network', t:'VNets and NSGs', s:'Workloads and subnets', sd:'Same location and RG',
     i:{h:'Your virtual networks and NSGs. VNet flow logs cover all traffic entering and leaving a VNet, which is simpler than one NSG flow log per NSG.',
        d:['Kentik processes VNet and NSG flow logs. Turn on only one type to avoid duplicates and extra cost; Kentik follows Microsoft in recommending VNet flow logs.','A storage account collects logs from the VNets in one location and resource group.']}},
    {id:'nw', x:44, y:162, w:220, h:52, k:'srv', icon:'log', t:'Network Watcher', s:'VNet flow logs', sd:'Version 2, JSON records',
     i:{h:'Network Watcher creates the flow logs and writes them as JSON into your storage account.',
        d:['Enable Network Watcher in the region, then Flow logs › + Create › target VNet or NSG › choose the storage account.','Version 2 recommended. Retention 1–365 days (the PowerShell script defaults to 2).']}},
    {id:'afw', x:44, y:234, w:220, h:52, k:'net', icon:'firewall', t:'Azure Firewall', s:'Diagnostic settings', sd:'Network + app rule logs',
     i:{h:'Azure Firewall diagnostic logs add application and network rule decisions.',
        d:['Monitoring › Diagnostic settings › + Add: azfwapplicationrule and azfwnetworkrule (or legacy AzureFirewallApplicationRule and AzureFirewallNetworkRule), Archive to a storage account.','Must use the same storage account as the VNet flow logs.']}},
    {id:'apis', x:44, y:306, w:220, h:52, k:'srv', icon:'api', t:'Azure APIs', s:'Metadata and metrics', sd:'Reader covers both',
     i:{h:'Kentik reads topology and metrics through Azure Resource Manager and Azure Monitor with the Reader role.',
        d:['Entities include VNets, subnets, NSGs, route tables, NAT gateways, load balancers, application gateways, VPN and ExpressRoute gateways and circuits, Virtual WAN hubs, private endpoints, public IPs, firewalls, VMs and scale sets.','Cloud metrics history appears in Metrics Explorer under /cloud/Azure/.']}},
    {id:'sa', x:320, y:150, w:216, h:56, k:'store', icon:'storage', t:'Storage account', s:'Dedicated to logs', sd:'Allow Kentik IPs if locked',
     i:{h:'A storage account you own receives the logs. Kentik’s app only reads it.',
        d:['Use a dedicated storage account. Kentik creates one cloud export per storage account.','If the storage firewall is restricted, allow 20.69.189.228 and 20.69.185.115. WestUS2 storage accounts use 51.8.214.254 and 172.171.46.16; contact your account team.']}},
    {id:'sp', x:316, y:442, w:224, h:72, k:'iam', icon:'key', t:'Kentik app', s:'Enterprise app or your', s2:'own app registration', sd:'Reader on sub or RG', sd2:'Storage Blob Data Reader',
     i:{h:'Kentik reads Azure through a service principal: the Kentik enterprise app, or an app registration you own.',
        d:['Enterprise app: Entra ID › Enterprise applications › Kentik NSG Flow Exporter. Assign roles, then Validate Service Principal in the Kentik wizard. An Application Administrator starts this.',
           'Custom app registration: single tenant, you own the secret or certificate. Enter Application (client) ID, Directory (tenant) ID and a Kentik credential.',
           'Roles: Reader on the subscription or resource group with the logs, Reader on extra subscriptions in the enrichment scope, Storage Blob Data Reader (or Reader and Data Access) on the storage account. An optional read-only custom Kentik role at tenant level gives full path views.',
           'The PowerShell script grants the VNet Flow Exporter Reader on the resource group and Contributor on the storage account.']}},
    COLLECTOR({s:'Reads with the Kentik app', s2:'Read-only', sd:'From 20.69.189.228', sd2:'and 20.69.185.115',
     i:{h:'Kentik’s collector reads new log blobs and calls Azure APIs with the service principal.',
        d:['Source IPs 20.69.189.228 and 20.69.185.115 (WestUS2: 51.8.214.254 and 172.171.46.16).','Each VNet or NSG sending flow logs appears as a cloud device.']}}),
    KEN({y:250, h:250, lines:CLOUD_LINES, linesd:['Export per storage account','Device per VNet or NSG','Sampling: 2–2000 or none','CloudPak flows per second']})
  ],
  edges:[
    {t:'flow', a:'vnet', b:'nw', p:[[154,134],[154,162]], c:'v'},
    {t:'flow', a:'nw', b:'sa', p:[[264,188],[320,174]], lab:'Flow logs', lp:[290,146]},
    {t:'flow', a:'afw', b:'sa', p:[[264,260],[320,192]]},
    {t:'perm', a:'sp', b:'sa', p:[[506,442],[506,206]], lab:'Read logs', labd:'Storage Blob Data Reader', lp:[498,300], anchor:'end'},
    {t:'perm', a:'sp', b:'apis', p:[[316,478],[264,332]], lab:'Read metadata', labd:'Reader', lp:[296,430], anchor:'end'},
    {t:'pull', a:'sp', b:'collector', p:[[540,478],[780,140]], lab:'Kentik reads with the app', labd:'Service principal, read-only', lp:[662,300]},
    {t:'int', a:'collector', b:'kentik', p:[[882,184],[882,250]]}
  ],
  notes:[
    {x:320, y:234, t:'Use VNet flow logs', td:'Retention: 1–365 days'},
    {x:320, y:251, t:'(Microsoft’s recommendation)', td:'Script default: 2 days'}
  ]
};

INFO.azure = {kick:'Drill-in · Public cloud', title:'Azure: flow logs to a storage account',
hl:`<p class="lead">No agent in Azure. Network Watcher writes VNet flow logs to a storage account you own, and Kentik reads it through an app you approve in Entra ID.</p>
<h3>What you set up</h3><ul>
<li>VNet flow logs from Network Watcher to a dedicated storage account</li>
<li>Azure Firewall diagnostic logs to the same storage account</li>
<li>The Kentik enterprise app, or your own app registration, with read-only roles</li>
<li>A cloud export in Kentik. A generated PowerShell script can do most of the Azure side (VNet flow logs only)</li></ul>
<h3>What Kentik collects</h3><ul><li>Flow logs and firewall logs</li><li>Topology metadata</li><li>Azure metrics (optional)</li></ul>
<h3>Where you see it</h3><p>Kentik Map, Data Explorer, Cloud Pathfinder, the Cloud dashboards and alerts.</p>`,
dd:`<h3>Roles for the Kentik service principal</h3>
<table><thead><tr><th style="width:38%">Role</th><th style="width:30%">Scope</th><th>Why</th></tr></thead><tbody>
<tr><td>Reader</td><td>Subscription or RG with the logs</td><td>Read resources</td></tr>
<tr><td>Reader</td><td>Extra subscriptions or RGs</td><td>Enrichment scope</td></tr>
<tr><td>Storage Blob Data Reader (or Reader and Data Access)</td><td>Log storage account</td><td>Read exported logs</td></tr>
<tr><td>Custom read-only Kentik role (optional)</td><td>Tenant</td><td>Full traffic path views</td></tr>
</tbody></table>
<h3>Two ways to authenticate</h3><ul>
<li><b>Kentik enterprise app</b> (Kentik NSG Flow Exporter): an Application Administrator assigns it; then Validate Service Principal in the wizard.</li>
<li><b>Custom app registration</b>: single tenant, your secret or certificate, entered as a Kentik credential with the client and tenant IDs.</li></ul>
<h3>Network</h3><p>If the storage account firewall is restricted, allow <code>20.69.189.228</code> and <code>20.69.185.115</code>. WestUS2 uses <code>51.8.214.254</code> and <code>172.171.46.16</code>.</p>
<h3>Cloud export in Kentik</h3><ol style="padding-left:18px;margin:0 0 8px">
<li>Settings › Public Clouds › Create Cloud Export › Azure Cloud.</li>
<li>Features: Metadata (required), Flow logs, Firewall collection, Cloud metrics history, optional PowerShell help.</li>
<li>API access: enterprise app or custom app registration.</li>
<li>Location, Subscription ID, Validate Service Principal, resource group › Verify Access.</li>
<li>Storage account name, sampling (2–2000 or Unsampled), optional enrichment scope, billing plan, Save.</li></ol>
<h3>Checklist from the KB</h3><ul>
<li>Dedicated storage account for logs</li><li>Storage firewall allows Kentik IPs (if restricted)</li><li>VNet flow logs (version 2) to that account</li><li>Firewall diagnostic setting to the same account with azfwapplicationrule and azfwnetworkrule</li><li>Service principal with Reader and Storage Blob Data Reader</li></ul>`,
src:[['Kentik for Azure','https://kb.kentik.com/docs/kentik-for-azure'],['Azure Prerequisites & Roles','https://kb.kentik.com/docs/azure-prerequisites-roles'],['Flow/Firewall Log Collection (Azure)','https://kb.kentik.com/docs/flow-firewall-log-collection'],['Kentik Export Configuration for Azure','https://kb.kentik.com/docs/kentik-export-configuration-azure'],['Automated Configuration (PowerShell)','https://kb.kentik.com/docs/automated-configuration-powershell'],['Azure Endpoints List','https://kb.kentik.com/docs/azure-endpoints-list']]};
