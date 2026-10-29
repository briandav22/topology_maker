/* ---------- Scene data: GCP, OCI and the Kentik platform ---------- */
const CLOUD_LINES2 = ['Logs normalized','Enriched with metadata','Stored in KDE','Kentik Map, Data Explorer'];
const I_CLOUD_UA = {h:'Optional: a Universal Agent on a VM in this network becomes a private test point, for tests between the cloud and your sites.',
  d:['Same install as on-prem, outbound TCP 443 only.','Agent-to-agent tests need TCP 8877 and UDP 9977 open between agents.']};

/* ===== Google Cloud ===== */
SC.gcp = {
  frames:[{x:16, y:16, w:744, h:588, label:'Your Google Cloud project', labeld:'Your GCP project: topic and subscription live here'}],
  nodes:[
    {id:'vpc', x:40, y:70, w:220, h:56, k:'srv', icon:'network', t:'VPC subnets', s:'Flow logs with metadata', sd:'Sample rate: default 50%',
     i:{h:'Turn on VPC flow logs per subnet and include metadata, which Kentik needs.',
        d:['VPC Network › subnet › Edit › Flow logs On › Configure Logs › Include metadata › Save.',
           'Any aggregation interval works. Sample rate 0–100%, default 50%. Check the estimated logs per day to gauge cost.',
           'Each subnet publishing to the topic appears in Kentik as a cloud device named after the subnet.']}},
    {id:'logging', x:40, y:150, w:220, h:56, k:'srv', icon:'log', t:'Cloud Logging', s:'Log Router sink', sd:'Filter: vpc_flows log ID',
     i:{h:'A Log Router sink sends only the VPC flow logs to a Pub/Sub topic.',
        d:['Logging › Logs Router › Create Sink, destination Cloud Pub/Sub topic. Create the topic from the same dialog.',
           'Inclusion filter: resource.type="gce_subnetwork" AND log_id("compute.googleapis.com/vpc_flows").',
           'To cut cost, narrow the filter, for example by port, protocol or subnet.']}},
    {id:'run', x:40, y:230, w:220, h:56, k:'opt', icon:'app', t:'Cloud Run', s:'Optional log collection', sd:'Creates a second export',
     i:{h:'Optional: Kentik can also collect Cloud Run logs.',
        d:['Tick GCP Cloud Run Log Collection in the export wizard. Kentik creates a second cloud export just for Cloud Run logs.','The KB gives no further setup detail for this option; follow the wizard.']}},
    {id:'apis', x:40, y:330, w:220, h:56, k:'srv', icon:'api', t:'Compute Engine API', s:'Topology metadata', sd:'Networks, routes, firewalls',
     i:{h:'Kentik reads your topology through the Compute Engine API to build the Kentik Map and enrich flow.',
        d:['Clients include networks, subnetworks, routers, routes, firewalls and firewall policies, forwarding rules, backend services, health checks, instances and instance groups, VPN gateways and tunnels, Interconnects and attachments, URL maps, target proxies, regions and zones.']}},
    {id:'ua', x:40, y:486, w:220, h:56, k:'opt', icon:'agent', t:'Universal Agent', s:'Optional, on a VM', sd:'Private synthetic agent', go:'dc', i:I_CLOUD_UA},
    {id:'topic', x:350, y:150, w:200, h:56, k:'store', icon:'queue', t:'Pub/Sub topic', s:'Sink destination', sd:'Same project as the sink',
     i:{h:'The topic receives the flow log entries from the sink.', d:['One Kentik cloud export per subscription on this topic.']}},
    {id:'sub', x:350, y:236, w:200, h:56, k:'store', icon:'queue', t:'Pull subscription', s:'Kentik pulls from it', sd:'Delivery type: Pull',
     i:{h:'A pull subscription on the topic. Kentik requests log entries from it.',
        d:['Pub/Sub › Topics › Create Subscription, delivery type Pull. Other properties as needed.','Create it in the same project as the topic and give its name to Kentik.']}},
    {id:'iam', x:350, y:352, w:200, h:72, k:'iam', icon:'key', t:'IAM grants', s:'Roles for Kentik’s', s2:'service account', sd:'Subscriber + Viewer', sd2:'Compute Viewer',
     i:{h:'You grant roles in your project to Kentik’s own service account. Everything it gets is read-only.',
        d:['Service account: kentik-vpc-flow@kentik-vpc-flow.iam.gserviceaccount.com.',
           'Pub/Sub Subscriber and Pub/Sub Viewer: Pub/Sub › Subscriptions › select it › Add Member.',
           'Compute Viewer (not Compute Network Viewer): IAM & Admin › IAM › Grant Access. In a folder hierarchy, grant it on the top-level folder so nested projects inherit it.',
           'Whoever grants Compute Viewer needs compute.networks.list and resourcemanager.projects.setIamPolicy.']}},
    COLLECTOR({s:'Pulls as Kentik’s', s2:'service account', sd:'Service account in', sd2:'project kentik-vpc-flow',
     i:{h:'Kentik’s collector pulls flow log messages from your subscription and calls the Compute Engine API as Kentik’s own service account.',
        d:['kentik-vpc-flow@kentik-vpc-flow.iam.gserviceaccount.com, with only the roles you grant it.','Status shows under Cloud Config Status › View Details.']}}),
    KEN({y:250, h:250, lines:CLOUD_LINES2, linesd:['Cloud export per subscription','Device per subnet','Cloud Run: its own export','CloudPak flows per second']})
  ],
  edges:[
    {t:'flow', a:'vpc', b:'logging', p:[[150,126],[150,150]], c:'v'},
    {t:'flow', a:'run', b:'logging', p:[[150,230],[150,206]], c:'v'},
    {t:'flow', a:'logging', b:'topic', p:[[260,178],[350,178]], lab:'Log sink', labd:'vpc_flows filter', lp:[305,165]},
    {t:'flow', a:'topic', b:'sub', p:[[450,206],[450,236]], c:'v'},
    {t:'perm', a:'iam', b:'sub', p:[[450,352],[450,292]], lab:'Read messages', labd:'Subscriber + Viewer', lp:[458,322], anchor:'start'},
    {t:'perm', a:'iam', b:'apis', p:[[350,388],[260,358]], lab:'Read metadata', labd:'Compute Viewer', lp:[298,408]},
    {t:'pull', a:'sub', b:'collector', p:[[550,264],[780,140]], lab:'Kentik pulls the subscription', labd:'Pub/Sub pull, read-only', lp:[665,226]},
    {t:'int', a:'collector', b:'kentik', p:[[882,184],[882,250]]},
    {t:'https', a:'ua', b:'kentik', p:[[260,514],[300,514],[300,584],[882,584],[882,500]], lab:'Test results over HTTPS', labd:'TCP 443 outbound', lp:[600,584]}
  ],
  notes:[
    {x:572, y:74, t:'A metadata-only export always', td:'Grant Compute Viewer, not'},
    {x:572, y:91, t:'shows a red flow status.', td:'Compute Network Viewer.'},
    {x:572, y:108, t:'', td:'Top folder for nested projects.'}
  ]
};

INFO.gcp = {kick:'Drill-in · Public cloud', title:'Google Cloud: flow logs through Pub/Sub',
hl:`<p class="lead">No agent in Google Cloud. A Log Router sink sends VPC flow logs to a Pub/Sub topic, and Kentik pulls them from a subscription using its own service account.</p>
<h3>What you set up</h3><ul>
<li>VPC flow logs on the subnets you care about, with metadata included</li>
<li>A Log Router sink that sends those logs to a Pub/Sub topic</li>
<li>A pull subscription on that topic</li>
<li>Read-only roles for Kentik’s service account</li>
<li>A cloud export in Kentik (Settings › Public Clouds)</li></ul>
<h3>What Kentik collects</h3><ul>
<li>Flow logs</li><li>Topology metadata: networks, subnets, routes, firewalls, VPN and Interconnect</li><li>Cloud Run logs and cloud metrics (both optional)</li></ul>
<h3>Where you see it</h3><p>Kentik Map, Data Explorer, the cloud dashboards and alerts. Each subnet appears as a cloud device named after the subnet.</p>`,
dd:`<h3>Sink filter</h3>
<pre>resource.type="gce_subnetwork" AND
log_id("compute.googleapis.com/vpc_flows")</pre>
<h3>Roles for Kentik’s service account</h3>
<p><code>kentik-vpc-flow@kentik-vpc-flow.iam.gserviceaccount.com</code></p>
<table><thead><tr><th style="width:36%">Role</th><th style="width:30%">Where</th><th>Why</th></tr></thead><tbody>
<tr><td>Pub/Sub Subscriber</td><td>The subscription</td><td>Pull flow log messages</td></tr>
<tr><td>Pub/Sub Viewer</td><td>The subscription</td><td>See the subscription</td></tr>
<tr><td>Compute Viewer (not Compute Network Viewer)</td><td>Project, or the top-level folder</td><td>Read topology metadata</td></tr>
</tbody></table>
<p>Whoever grants Compute Viewer needs <code>compute.networks.list</code> and <code>resourcemanager.projects.setIamPolicy</code>.</p>
<h3>Flow log settings</h3><ul>
<li>Include metadata. Kentik needs it.</li>
<li>Any aggregation interval works.</li>
<li>Sample rate 0–100%, default 50%. Check the estimated logs per day for cost.</li>
<li>To cut cost, narrow the sink filter by port, protocol or subnet.</li></ul>
<h3>Steps in the Google Cloud console</h3><ol style="padding-left:18px;margin:0 0 8px">
<li>VPC Network › subnet › Edit › Flow logs On › Configure Logs › Include metadata.</li>
<li>Logging › Logs Router › Create Sink › Cloud Pub/Sub topic › create the topic › add the filter.</li>
<li>Pub/Sub › Topics › Create Subscription › delivery type Pull.</li>
<li>Pub/Sub › Subscriptions › select it › Add Member › Kentik’s service account › Pub/Sub Subscriber and Pub/Sub Viewer.</li>
<li>IAM &amp; Admin › IAM › Grant Access › Kentik’s service account › Compute Viewer.</li></ol>
<h3>Cloud export in Kentik</h3><ol style="padding-left:18px;margin:0 0 8px">
<li>Settings › Public Clouds › Create Cloud Export › GCP Cloud.</li>
<li>Features: Metadata (required), Flow logs, Cloud Run log collection (a second export), Cloud metrics history.</li>
<li>Project ID, Pub/Sub topic and subscription name, then name, billing plan, Save.</li></ol>
<p class="note">A metadata-only export always shows a red flow status, because it has no flow data. That is expected.</p>`,
src:[['Kentik for GCP','https://kb.kentik.com/docs/kentik-for-gcp'],['Cloud Overview','https://kb.kentik.com/docs/cloud-overview'],['Public Clouds','https://kb.kentik.com/docs/public-clouds']]};

/* ===== Oracle Cloud ===== */
SC.oci = {
  frames:[{x:16, y:16, w:744, h:588, label:'Your OCI tenancy', labeld:'Your OCI tenancy: log group and capture filter in the root compartment'}],
  nodes:[
    {id:'vcn', x:40, y:70, w:220, h:56, k:'srv', icon:'network', t:'VCNs and subnets', s:'Flow logs turned on', sd:'Capture filter: sampling',
     i:{h:'VCN flow logs record traffic for a whole VCN, or for chosen subnets, VNICs or resources.',
        d:['Enable flow logs: pick the log group, the capture filter and one or more VCN enablement points.',
           'The capture filter lives in the root compartment and sets the sampling rate, the share of flows that generate logs. Other criteria are optional.',
           'Prerequisites: an active tenancy, at least one VCN, and admin rights to create policies, connectors, log groups and buckets.']}},
    {id:'logs', x:40, y:150, w:220, h:56, k:'srv', icon:'log', t:'OCI Logging', s:'Log group, JSON records', sd:'Root compartment',
     i:{h:'OCI Logging collects the VCN flow logs, as JSON, into a log group.', d:['Create the log group in the root compartment.']}},
    {id:'conn', x:40, y:230, w:220, h:56, k:'srv', icon:'connector', t:'Connector Hub', s:'Logging to the bucket', sd:'Batches: 100 MB or 7 s',
     i:{h:'A Connector Hub connector moves the flow logs from Logging into your bucket.',
        d:['Source: Logging, with the log group and flow log. Target: Object Storage, with the bucket and an optional object name prefix.',
           'Defaults: 100 MB batch size and 7 second batch time, under Show additional options.',
           'The connector can create its own policy. Its Enable logs switch is for connector logging and can stay off.']}},
    {id:'apis', x:40, y:330, w:220, h:56, k:'srv', icon:'api', t:'OCI APIs', s:'Topology metadata', sd:'Virtual Network, Compute',
     i:{h:'Kentik reads your topology through OCI APIs: VCNs, subnets, route tables, security lists, NSGs, gateways and DRGs.',
        d:['Virtual Network: listVcns, listSubnets, listRouteTables, listSecurityLists, listNetworkSecurityGroups, listDrgs, listDrgAttachments, listNatGateways, listInternetGateways, listLocalPeeringGateways, listIPSecConnections, listVirtualCircuits, listCrossConnects, listCpes.',
           'Compute: listInstances, listVnicAttachments. Identity: listRegionSubscriptions. Object Storage: listBuckets, listObjects, getObject.']}},
    {id:'ua', x:40, y:486, w:220, h:56, k:'opt', icon:'agent', t:'Universal Agent', s:'Optional, on a VM', sd:'Private synthetic agent', go:'dc', i:I_CLOUD_UA},
    {id:'bucket', x:350, y:230, w:200, h:56, k:'store', icon:'bucket', t:'Object Storage', s:'Bucket for flow logs', sd:'Name + namespace',
     i:{h:'A bucket you own receives the logs from Connector Hub. Kentik only reads it.',
        d:['No extra bucket settings are needed.',
           'Bucket policy: READ buckets and READ objects in tenancy, where target.bucket.name is your bucket.',
           'Kentik needs the bucket name and the bucket namespace, which OCI assigned when the tenancy was created.']}},
    {id:'policy', x:350, y:352, w:200, h:72, k:'iam', icon:'key', t:'Access for Kentik', s:'Cross-tenancy policy', s2:'(recommended)', sd:'Or a user and group', sd2:'with Kentik’s API key',
     i:{h:'Kentik reads OCI through a cross-tenancy policy, or through a user that holds Kentik’s public API key.',
        d:['Cross-tenancy policy (recommended): the Kentik portal generates it; paste it into the OCI manual policy editor.',
           'Custom user: create a user and group, add Kentik’s public key as an API key (fingerprint d0:b4:75:ac:39:8a:90:b0:cf:ee:3e:ee:b9:0c:07:ff), and allow the group to READ all-resources in tenancy.',
           'Least privilege: INSPECT tenancies and metrics plus READ on the network resource types Kentik maps, instead of all-resources.',
           'Troubleshooting: the user must belong to a group, and no placeholders may be left in the policy.']}},
    COLLECTOR({s:'Reads through OCI APIs', s2:'With access you grant', sd:'Validate Permissions', sd2:'in the export wizard',
     i:{h:'Kentik’s collector reads new objects from the bucket and calls the OCI APIs for metadata, then sends the logs to the Kentik Data Engine.',
        d:['Logs are normalized, enriched with OCI metadata and stored.','They appear as a cloud export with its cloud devices on the Public Clouds page. High volumes can spread across several devices.']}}),
    KEN({y:250, h:250, lines:CLOUD_LINES2, linesd:['Cloud export per bucket','Metadata only, or + flow','Optional compartment IDs','CloudPak flows per second']})
  ],
  edges:[
    {t:'flow', a:'vcn', b:'logs', p:[[150,126],[150,150]], c:'v'},
    {t:'flow', a:'logs', b:'conn', p:[[150,206],[150,230]], c:'v'},
    {t:'flow', a:'conn', b:'bucket', p:[[260,258],[350,258]], lab:'Flow logs', labd:'100 MB or 7 s', lp:[305,245]},
    {t:'perm', a:'policy', b:'bucket', p:[[450,352],[450,286]], lab:'Read logs', labd:'READ buckets, objects', lp:[458,320], anchor:'start'},
    {t:'perm', a:'policy', b:'apis', p:[[350,388],[260,358]], lab:'Read metadata', labd:'READ, INSPECT', lp:[302,408]},
    {t:'pull', a:'bucket', b:'collector', p:[[550,258],[780,140]], lab:'Kentik reads the bucket', labd:'OCI APIs, read-only', lp:[665,222]},
    {t:'int', a:'collector', b:'kentik', p:[[882,184],[882,250]]},
    {t:'https', a:'ua', b:'kentik', p:[[260,514],[300,514],[300,584],[882,584],[882,500]], lab:'Test results over HTTPS', labd:'TCP 443 outbound', lp:[600,584]}
  ],
  notes:[
    {x:572, y:74, t:'Kentik recommends the', td:'Have ready: tenancy OCID,'},
    {x:572, y:91, t:'cross-tenancy policy.', td:'home region, bucket name,'},
    {x:572, y:108, t:'', td:'namespace, connector OCID.'}
  ]
};

INFO.oci = {kick:'Drill-in · Public cloud', title:'Oracle Cloud: flow logs to Object Storage',
hl:`<p class="lead">No agent in OCI. OCI Logging captures VCN flow logs, Connector Hub moves them into an Object Storage bucket, and Kentik reads the bucket through OCI APIs.</p>
<h3>What you set up</h3><ul>
<li>An Object Storage bucket for the logs</li>
<li>A log group and a capture filter in the root compartment</li>
<li>VCN flow logs on the VCNs, subnets or VNICs you choose</li>
<li>A Connector Hub connector from Logging to the bucket</li>
<li>Access for Kentik: a cross-tenancy policy (recommended) or a user holding Kentik’s API key</li>
<li>A cloud export in Kentik (Settings › Public Clouds)</li></ul>
<h3>What Kentik collects</h3><ul><li>Flow logs</li><li>Topology metadata: VCNs, subnets, route tables, security lists, NSGs, gateways and DRGs</li></ul>
<h3>Where you see it</h3><p>Kentik Map and Data Explorer. The Traffic Trends and Overviews dashboards are not available for OCI.</p>`,
dd:`<h3>Two ways to give Kentik access</h3><ul>
<li><b>Cross-tenancy policy</b> (recommended): the Kentik portal generates it; paste it into the OCI manual policy editor.</li>
<li><b>Custom user</b>: a user and group with Kentik’s public key as an API key, fingerprint <code>d0:b4:75:ac:39:8a:90:b0:cf:ee:3e:ee:b9:0c:07:ff</code>, and <code>Allow group groupRef to READ all-resources in tenancy</code>.</li></ul>
<h3>Bucket policy</h3>
<pre>Allow group groupRef to READ buckets in tenancy
  WHERE target.bucket.name=&lt;bucketName&gt;
Allow group groupRef to READ objects in tenancy
  WHERE target.bucket.name=&lt;bucketName&gt;</pre>
<h3>Least-privilege option</h3><p>Instead of READ all-resources: INSPECT tenancies and metrics, plus READ on vcns, subnets, route-tables, security-lists, network-security-groups, internet-gateways, nat-gateways, drg-object, drg-attachments, drg-route-tables, drg-route-distributions, local-peering-gateways, ipsec-connections, cpes, cross-connects, virtual-circuits, capture-filters and metrics.</p>
<h3>Connector Hub</h3><ul>
<li>Source: Logging (log group and flow log). Target: Object Storage (bucket, optional object name prefix).</li>
<li>Defaults: 100 MB batch size, 7 second batch time. The connector can create its own policy.</li></ul>
<h3>Values to collect</h3>
<table><thead><tr><th style="width:44%">Value</th><th>Notes</th></tr></thead><tbody>
<tr><td>Tenancy OCID</td><td>Tenancy details</td></tr>
<tr><td>User OCID</td><td>Custom user only</td></tr>
<tr><td>Home region</td><td>The city name in parentheses</td></tr>
<tr><td>Bucket name and namespace</td><td>Bucket details</td></tr>
<tr><td>Service connector OCID</td><td>Connector details</td></tr>
<tr><td>Object name prefix</td><td>Only if you set one</td></tr>
<tr><td>Compartment ID</td><td>Defaults to the tenancy OCID</td></tr>
</tbody></table>
<h3>Cloud export in Kentik</h3><ol style="padding-left:18px;margin:0 0 8px">
<li>Settings › Public Clouds › Create Cloud Export › OCI Cloud.</li>
<li>Metadata only, or Flow logs and metadata.</li>
<li>Tenancy ID, default region, and user ID for a custom user. Validate Permissions.</li>
<li>Optional compartment IDs. For flow: bucket name, namespace, connector OCID, prefix.</li>
<li>Copy the autogenerated policy, pick a billing plan, Save.</li></ol>
<p class="note">Troubleshooting: make sure the custom user is in a group, and that no policy placeholders were left in.</p>`,
src:[['Kentik for OCI','https://kb.kentik.com/docs/kentik-for-oci'],['Cloud Overview','https://kb.kentik.com/docs/cloud-overview'],['Public Clouds','https://kb.kentik.com/docs/public-clouds']]};

/* ===== Inside Kentik SaaS ===== */
SC.kentik = {
  frames:[
    {x:16, y:16, w:968, h:588, label:'Inside your Kentik account', labeld:'Kentik SaaS: US (Ashburn, VA) or EU (Frankfurt)'},
    {id:'srcgrp', x:32, y:58, w:206, h:336, label:'Arriving data', cls:'sframe',
     i:{h:'Everything reaches Kentik over encrypted connections that start on your side, or through read-only access you grant in your clouds.',
        d:['Universal Agents: outbound TCP 443 to flow, grpc.api, api and portal .kentik.com.','Clouds: Kentik’s collectors read your buckets, storage accounts or subscriptions with read-only access.','BGP: your edge routers peer with Kentik on TCP 179.']}}
  ],
  nodes:[
    {id:'s-ua', x:44, y:90, w:182, h:52, k:'chip', icon:'agent', t:'Universal Agents', s:'Sites and cloud VMs', sd:'TCP 443, TLS 1.2+', go:'dc',
     i:{h:'Your Universal Agents send flow, metrics, events, test results and configs over outbound HTTPS.', d:['Drill into the data center for ports, capabilities and sizing.']}},
    {id:'s-cloud', x:44, y:166, w:182, h:52, k:'ktk', icon:'cloud', t:'Cloud collectors', s:'AWS, Azure, GCP, OCI', sd:'Read-only access', go:'aws',
     i:{h:'Kentik-run collectors read flow logs and metadata from your cloud accounts with the read-only access you grant.', d:['One cloud export per S3 bucket, storage account, Pub/Sub subscription or OCI bucket.']}},
    {id:'s-synth', x:44, y:242, w:182, h:52, k:'ktk', icon:'probe', t:'Global agents', s:'Synthetic test results', sd:'5 credits per subtest', go:'saas',
     i:{h:'Kentik’s global agents, and your private agents, report synthetic test results.', d:['Drill into Internet & SaaS apps for test types and credits.']}},
    {id:'s-bgp', x:44, y:318, w:182, h:52, k:'net', icon:'route', t:'BGP sessions', s:'Your edge routers', sd:'iBGP on TCP 179', go:'dc',
     i:{h:'Edge routers peer with Kentik so every flow gets AS path, community and next-hop context.', d:['Kentik peers as an iBGP route-reflector client with your ASN. Peering also enables RTBH and Flowspec mitigation.']}},
    {id:'ingest', x:282, y:96, w:196, h:72, k:'ktk', icon:'flow', t:'Ingest', s:'Receive and normalize', s2:'every data type', sd:'flow.kentik.com', sd2:'grpc.api.kentik.com',
     i:{h:'Ingest receives flow, cloud logs, metrics, events and test results, and normalizes them.', d:['Universal Agents send to flow.kentik.com and grpc.api.kentik.com on TCP 443.']}},
    {id:'enrich', x:282, y:214, w:196, h:180, k:'ktk', icon:'spark', t:'Enrichment', s:'Added as data arrives',
     lines:['GeoIP','BGP routes and AS paths','SNMP interface names','Threat feeds','Custom dimensions'],
     linesd:['GeoIP and BGP at ingest','Flow Tags and populators','Interface names via SNMP','Threat and Internet context','Cloud metadata for logs'],
     i:{h:'Kentik adds context to every record as it arrives, so you can filter and group by it later.',
        d:['Flow is correlated with GeoIP and BGP at ingest. Flow Tags and Custom Dimensions are populated at ingest too.','SNMP adds interface names and speeds. Cloud metadata adds VPC, subnet and other names to cloud logs.']}},
    {id:'kde', x:512, y:96, w:200, h:298, k:'store', icon:'db', t:'Kentik Data Engine', s:'Columnar, distributed',
     lines:['A database per customer','Full: every record','Fast: 24h+ queries','Two copies of each slice','Feeds portal and APIs'],
     linesd:['Full and Fast dataseries','Masters split queries','Workers hold the shards','45 days full-resolution flow','120 days summarized','NMS: 3 or 13 months'],
     i:{h:'The Kentik Data Engine (KDE) is Kentik’s columnar datastore, with a separate database for each customer.',
        d:['Each device has a Full dataseries (every record) and a Fast dataseries (a subset for queries of 24 hours or more).',
           'Masters split a query into subqueries for the workers that hold each slice. Every slice is stored as at least two shards on different machines.',
           'Default retention: 45 days of full-resolution flow, 120 days of summarized data, 3 or 13 months for NMS by plan. Contracts can change this.']}},
    {id:'portal', x:748, y:70, w:220, h:72, k:'ktk', icon:'portal', t:'Portal', s:'Data Explorer, Kentik Map', s2:'NMS, Synthetics, Cloud', sd:'portal.kentik.com', sd2:'SAML SSO, MFA, roles',
     i:{h:'The Kentik portal: Data Explorer, Kentik Map, NMS, Synthetics, the Cloud section and dashboards.', d:['SAML 2.0 SSO or local accounts, MFA you can require, and user, admin and super admin roles.']}},
    {id:'ai', x:748, y:158, w:220, h:52, k:'ktk', icon:'spark', t:'AI Advisor', s:'Investigations in context', sd:'Read-only show commands',
     i:{h:'AI Advisor answers questions and runs investigations across your Kentik data.', d:['With SSH config access on a Universal Agent, it can run read-only show commands on supported devices.']}},
    {id:'alerts', x:748, y:226, w:220, h:52, k:'ktk', icon:'bell', t:'Alerts and mitigation', s:'Notify your tools', sd:'RTBH and Flowspec via BGP',
     i:{h:'Alert policies watch traffic, metrics, events and tests, and notify your channels.', d:['BGP peering also enables RTBH and Flowspec mitigation.']}},
    {id:'api', x:748, y:294, w:220, h:52, k:'ktk', icon:'api', t:'APIs', s:'Query, config, automation', sd:'api.kentik.com, user tokens',
     i:{h:'APIs for queries, configuration and automation.', d:['API tokens are per user and can be reset at any time.']}},
    {id:'firehose', x:748, y:362, w:220, h:52, k:'ktk', icon:'egress', t:'Firehose', s:'Enriched flow to your tools', sd:'Through ktranslate',
     i:{h:'Firehose sends copies of enriched flow records to ktranslate, which you run in your cloud or data center, and on to your own tools.',
        d:['Sinks include Kafka, Splunk, New Relic, HTTP, Prometheus and files. Formats include JSON, NetFlow (IPFIX), Avro and InfluxDB line protocol.','About one ktranslate instance per 100k flows per second. Set its address as the device’s Firehose Endpoint.','The portal does not support Firehose for cloud flow logs; contact Kentik for that.']}},
    {id:'host', x:32, y:452, w:222, h:56, k:'ext', icon:'building', t:'Hosting', s:'US or EU region', sd:'Ashburn, VA or Frankfurt',
     i:{h:'Kentik runs on its own equipment in Ashburn, VA (Equinix and Deft), or in Frankfurt for EU accounts.', d:['EU hosting is chosen when you sign.','Default uptime SLA 99.99%. Status: status.kentik.com and status.kentik.eu.']}},
    {id:'crypto', x:270, y:452, w:222, h:56, k:'ext', icon:'lock', t:'Encryption', s:'In transit and at rest', sd:'TLS 1.2+ · AES-256',
     i:{h:'TLS 1.2 or higher in transit, AES-256 at rest (consistent with FIPS 140-2).', d:[]}},
    {id:'audit', x:508, y:452, w:222, h:56, k:'ext', icon:'shield', t:'Compliance', s:'SOC 2 Type II', sd:'Yearly third-party pen test',
     i:{h:'SOC 2 Type II every year, with reports under NDA. Annual independent penetration tests and frequent vulnerability scans.', d:[]}},
    {id:'retain', x:746, y:452, w:222, h:56, k:'ext', icon:'list', t:'Retention', s:'45 days full flow', sd:'120 days summarized',
     i:{h:'Default retention: 45 days of full-resolution flow and 120 days of summarized data. NMS keeps 3 or 13 months, depending on plan.', d:['Device configs are kept until you delete them. Contracts can change retention.']}}
  ],
  edges:[
    {t:'https', a:'s-ua', b:'ingest', p:[[226,116],[282,116]]},
    {t:'int', a:'s-cloud', b:'ingest', p:[[226,192],[282,132]]},
    {t:'https', a:'s-synth', b:'ingest', p:[[226,268],[282,148]]},
    {t:'bgp', a:'s-bgp', b:'enrich', p:[[226,344],[282,330]]},
    {t:'int', a:'ingest', b:'enrich', p:[[380,168],[380,214]], c:'v'},
    {t:'int', a:'enrich', b:'kde', p:[[478,300],[512,300]]},
    {t:'int', a:'kde', b:'portal', p:[[712,140],[748,106]]},
    {t:'int', a:'kde', b:'ai', p:[[712,184],[748,184]]},
    {t:'int', a:'kde', b:'alerts', p:[[712,240],[748,252]]},
    {t:'int', a:'kde', b:'api', p:[[712,300],[748,320]]},
    {t:'int', a:'kde', b:'firehose', p:[[712,350],[748,388]]}
  ],
  notes:[
    {x:32, y:544, t:'Metadata only: Kentik does not collect packet payloads.', td:'IP addresses can be partly redacted before ingest.'},
    {x:32, y:561, t:'Each customer gets a separate database.', td:'99.99% uptime SLA by default, RTO under 2 hours.'}
  ]
};

INFO.kentik = {kick:'Drill-in · Kentik platform', title:'Inside Kentik SaaS',
hl:`<p class="lead">Everything lands in your own Kentik account. Kentik enriches it as it arrives, stores it in the Kentik Data Engine, and serves it to the portal, AI Advisor, alerts and APIs.</p>
<h3>What happens to your data</h3><ul>
<li><b>Ingest</b>: agents and collectors deliver flow, cloud logs, metrics, events and test results</li>
<li><b>Enrichment</b>: GeoIP, BGP routes, SNMP interface names, threat feeds and your custom dimensions are added on arrival</li>
<li><b>Storage</b>: the Kentik Data Engine keeps a separate database for each customer</li>
<li><b>Use</b>: Data Explorer, Kentik Map, NMS, Synthetics, Cloud, AI Advisor, alerts and APIs</li></ul>
<h3>Security in one line</h3><p>Hosted in the US or EU, encrypted in transit and at rest, SOC 2 Type II, and metadata only, never packet payloads.</p>`,
dd:`<h3>Hosting and availability</h3><ul>
<li>US: Ashburn, VA, at Equinix and Deft. EU: Frankfurt, chosen when you sign.</li>
<li>99.99% default uptime SLA. Status at status.kentik.com and status.kentik.eu.</li>
<li>RTO under 2 hours; RPO 24 hours for platform configuration.</li></ul>
<h3>Security</h3>
<table><thead><tr><th style="width:28%">Area</th><th>Detail</th></tr></thead><tbody>
<tr><td>In transit</td><td>TLS 1.2+ to and from kentik.com</td></tr>
<tr><td>At rest</td><td>AES-256, consistent with FIPS 140-2</td></tr>
<tr><td>Isolation</td><td>Separate logical database and tables per customer</td></tr>
<tr><td>Audits</td><td>SOC 2 Type II yearly, annual third-party pen test</td></tr>
<tr><td>Access</td><td>SAML 2.0 SSO, MFA (TOTP or hardware keys), user, admin and super admin roles, per-user API tokens</td></tr>
<tr><td>Data</td><td>IP addresses and network metadata, no packet payloads; IP redaction available</td></tr>
</tbody></table>
<h3>Default retention</h3>
<table><thead><tr><th style="width:52%">Data</th><th>Kept</th></tr></thead><tbody>
<tr><td>Full-resolution flow</td><td>45 days</td></tr>
<tr><td>Summarized data</td><td>120 days</td></tr>
<tr><td>NMS metrics</td><td>3 or 13 months by plan</td></tr>
<tr><td>Device configs</td><td>Until you delete them</td></tr>
</tbody></table>
<p class="muted" style="font-size:12.5px">Contracts can change retention.</p>
<h3>Kentik Data Engine</h3><ul>
<li>Columnar and distributed. Masters split queries into subqueries for the workers that hold each slice.</li>
<li>Each device has a Full dataseries (all records) and a Fast dataseries (a subset for queries of 24 hours or more).</li>
<li>Every slice is stored as at least two shards on different machines.</li></ul>
<h3>Getting data out</h3><ul>
<li><b>APIs</b>: per-user API tokens on api.kentik.com.</li>
<li><b>Firehose</b>: copies of enriched flow to <code>ktranslate</code>, which you run, then on to Kafka, Splunk, New Relic, HTTP, Prometheus or files. Not available for cloud flow logs from the portal.</li></ul>
<h3>Licensing</h3><p>FlowPak, NMS (DevicePak), CloudPak and Synthetics credits. Confirm entitlements with your Infoblox account team.</p>`,
src:[['Security Overview','https://kb.kentik.com/docs/security-overview'],['KDE Overview','https://kb.kentik.com/docs/kde-overview'],['Using Kentik Firehose','https://kb.kentik.com/docs/using-kentik-firehose'],['Licenses','https://kb.kentik.com/docs/licenses']]};
