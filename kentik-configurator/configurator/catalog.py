"""Kentik deployment facts, taken from the Kentik Knowledge Base (kb.kentik.com).

Every fact that ends up in an export lives here, with the KB page it came from,
so the content can be reviewed and updated in one place. Facts were checked
against the KB in October 2026.

Scope rules for this tool:
- On-prem sites use the Universal Agent with capabilities. The standalone
  kproxy and the standalone synthetics agent are never deployed.
- Kubernetes (Kentik Kube) is not part of the offer and is not modeled.
"""

KB = {
    "universal-agents": ("Universal Agents", "https://kb.kentik.com/docs/universal-agents"),
    "ua-deployment": ("UA Deployment", "https://kb.kentik.com/docs/ua-deployment"),
    "ua-portal-management": ("UA Portal Management", "https://kb.kentik.com/docs/ua-portal-management"),
    "device-settings": ("Device Settings", "https://kb.kentik.com/docs/device-settings"),
    "router-configuration": ("Router Configuration", "https://kb.kentik.com/docs/router-configuration"),
    "flow-overview": ("Flow Overview", "https://kb.kentik.com/docs/flow-overview"),
    "nms-setup": ("NMS Setup", "https://kb.kentik.com/docs/nms-setup"),
    "snmp-traps-syslogs": ("SNMP Traps & Syslog", "https://kb.kentik.com/docs/snmp-traps-syslogs"),
    "ssh-command-access": ("SSH Command Access for Kentik NMS", "https://kb.kentik.com/docs/ssh-command-access-for-kentik-nms"),
    "kproxy-migration": ("Migration Scenarios (kproxy to UA)", "https://kb.kentik.com/docs/kproxy-migration-scenarios"),
    "synthetics-overview": ("Synthetics Overview", "https://kb.kentik.com/docs/synthetics-overview"),
    "test-types": ("Test Types Reference", "https://kb.kentik.com/docs/test-types"),
    "test-credits": ("Test Credits", "https://kb.kentik.com/docs/test-credits"),
    "agents-page": ("Agents Page", "https://kb.kentik.com/docs/agents-page"),
    "bgp-route-viewer": ("BGP Route Viewer", "https://kb.kentik.com/docs/bgp-route-viewer"),
    "public-clouds": ("Public Clouds", "https://kb.kentik.com/docs/public-clouds"),
    "cloud-overview": ("Cloud Overview", "https://kb.kentik.com/docs/cloud-overview"),
    "kentik-for-aws": ("Kentik for AWS", "https://kb.kentik.com/docs/kentik-for-aws"),
    "metadata-aws": ("Metadata Configuration (AWS)", "https://kb.kentik.com/docs/metadata-configuration-aws"),
    "flowlog-aws": ("Flow/Firewall Log Collection Configuration (AWS)", "https://kb.kentik.com/docs/flow-firewall-log-collection-configuration"),
    "export-aws": ("Kentik Export Configuration for AWS", "https://kb.kentik.com/docs/kentik-export-configuration-aws"),
    "kentik-for-azure": ("Kentik for Azure", "https://kb.kentik.com/docs/kentik-for-azure"),
    "azure-roles": ("Azure Prerequisites & Roles", "https://kb.kentik.com/docs/azure-prerequisites-roles"),
    "flowlog-azure": ("Flow/Firewall Log Collection (Azure)", "https://kb.kentik.com/docs/flow-firewall-log-collection"),
    "export-azure": ("Kentik Export Configuration for Azure", "https://kb.kentik.com/docs/kentik-export-configuration-azure"),
    "azure-powershell": ("Automated Configuration (PowerShell)", "https://kb.kentik.com/docs/automated-configuration-powershell"),
    "kentik-for-gcp": ("Kentik for GCP", "https://kb.kentik.com/docs/kentik-for-gcp"),
    "kentik-for-oci": ("Kentik for OCI", "https://kb.kentik.com/docs/kentik-for-oci"),
    "security-overview": ("Security Overview", "https://kb.kentik.com/docs/security-overview"),
    "kde-overview": ("KDE Overview", "https://kb.kentik.com/docs/kde-overview"),
    "licenses": ("Licenses", "https://kb.kentik.com/docs/licenses"),
}

REGIONS = {
    "US": {
        "label": "United States (Ashburn, VA)",
        "domain": "kentik.com",
        "hosts": ["flow.kentik.com", "grpc.api.kentik.com", "api.kentik.com", "portal.kentik.com", "storage.googleapis.com"],
        "optional": ["whoami.kentiklabs.com"],
        "status": "status.kentik.com",
    },
    "EU": {
        "label": "European Union (Frankfurt)",
        "domain": "kentik.eu",
        "hosts": ["flow.kentik.eu", "grpc.api.kentik.eu", "api.kentik.eu", "portal.kentik.eu", "storage.googleapis.com"],
        "optional": ["whoami.kentiklabs.com"],
        "status": "status.kentik.eu",
    },
}

# Universal Agent capabilities. "cpu"/"ram" are per unit of "per" from the KB sizing table.
CAPABILITIES = {
    "flow": {
        "name": "Flow Proxy", "kb_id": "kproxy / ktraffic", "color": "flow",
        "short": "NetFlow, sFlow, IPFIX", "port_label": "UDP 9995 in",
        "purpose": "Receives NetFlow, sFlow and IPFIX from routers, switches and firewalls, enriches it and forwards it to Kentik over TLS.",
        "inbound": [("Network devices", "UDP 9995", "Flow export (NetFlow, sFlow, IPFIX)")],
        "outbound_local": [],
        "setup": [
            "Enable Flow Proxy on the agent. Settings: Host 0.0.0.0, Port 9995 (UDP), optional sFlow agent address override, and Site.",
            "On each device, export flow to the agent's IP on UDP 9995. Sample ingress on every interface; never ingress and egress on the same interface.",
            "The sample rate on the device must match the rate set for that device in Kentik.",
            "Vendor configuration snippets for flow, SNMP and BGP: github.com/kentik/config-snippets.",
            "Sanity check after go-live: flow volume should land within about 20% of SNMP interface traffic.",
        ],
        "license": "FlowPak",
        "kb": ["universal-agents", "router-configuration", "flow-overview", "kproxy-migration"],
    },
    "snmp": {
        "name": "SNMP / Streaming Telemetry", "kb_id": "ranger", "color": "snmp",
        "short": "Health and interfaces", "port_label": "UDP 161 out",
        "purpose": "Discovers devices and collects health, interface and hardware metrics by SNMP polling or gNMI streaming telemetry. It also enriches flow with interface names and speeds.",
        "inbound": [],
        "outbound_local": [("Network devices", "UDP 161", "SNMP polling (v1, v2c, v3)"), ("Network devices", "ICMP", "Reachability"),
                           ("Network devices", "Device gNMI port", "Streaming telemetry dial-in (only if used)")],
        "setup": [
            "Run the NMS Setup Wizard: pick this agent, enter IP ranges and SNMP v1, v2c or v3 credentials, discover, then add devices.",
            "Per device, on the SNMP tab choose \"Flow Enrichment via Universal Agent\" or \"Full Monitoring via Universal Agent\".",
            "SNMP v3 options: auth None, MD5 or SHA; privacy None, DES or AES.",
            "Default polling: 1 minute for status, CPU, memory and interfaces; 5 minutes for everything else.",
            "Streaming telemetry (optional): enable \"Dial-In from Universal Agent\" (gNMI over gRPC, 30 second default).",
        ],
        "license": "FlowPak (flow enrichment) or NMS / DevicePak (full monitoring)",
        "kb": ["universal-agents", "nms-setup", "device-settings"],
    },
    "trap": {
        "name": "SNMP Trap Receiver", "kb_id": "ksnmptrap", "color": "trap",
        "short": "Real-time device events", "port_label": "UDP 162 in",
        "purpose": "Captures SNMP traps the moment a device sends them, for example an interface or BGP session going down.",
        "inbound": [("Network devices", "UDP 162", "SNMP traps")],
        "outbound_local": [],
        "setup": [
            "Enable SNMP Trap Receiver on the agent.",
            "Point device trap targets at the agent's IP on UDP 162.",
            "Traps must come from a device licensed for NMS. Query them in Data Explorer with the metric \"SNMP Traps: Events\".",
        ],
        "license": "NMS / DevicePak",
        "kb": ["universal-agents", "snmp-traps-syslogs"],
    },
    "syslog": {
        "name": "Syslog Server", "kb_id": "ksyslog", "color": "syslog",
        "short": "Device and server logs", "port_label": "UDP/TCP 514 in",
        "purpose": "Collects log messages from devices and servers so they can be searched, alerted on and lined up with traffic.",
        "inbound": [("Network devices and servers", "UDP and TCP 514", "Syslog")],
        "outbound_local": [],
        "setup": [
            "Enable Syslog Server on the agent.",
            "Point device and server syslog at the agent's IP on UDP or TCP 514.",
            "If a syslog forwarder sits in between, it must keep the original device IP. Changing the port currently needs Kentik support.",
            "Query in Data Explorer with the metric \"Syslog: Events\".",
        ],
        "license": "NMS / DevicePak",
        "kb": ["universal-agents", "snmp-traps-syslogs"],
    },
    "dns": {
        "name": "DNS OTT Tap", "kb_id": "kdns", "color": "dns",
        "short": "DNS lookups as flow", "port_label": "DNSTAP / mirror",
        "purpose": "Turns DNS lookups into records Kentik can join with traffic, for OTT service tracking and DNS troubleshooting.",
        "inbound": [("DNS servers (for example Infoblox NIOS)", "DNSTAP port you choose", "DNSTAP stream, or a SPAN or mirror port")],
        "outbound_local": [],
        "setup": [
            "Enable DNS OTT Tap on the agent.",
            "Preferred mode: DNSTAP receiver, for DNS appliances such as Infoblox. Other modes: promiscuous capture of a SPAN or mirror port, or directly on a BIND9 or Linux resolver.",
            "On the DNS servers, stream DNSTAP to the agent's IP and the port you configure.",
        ],
        "license": "Confirm with the Kentik account team",
        "kb": ["universal-agents"],
    },
    "synth": {
        "name": "Synthetics", "kb_id": "ksynth (capability)", "color": "synth",
        "short": "Tests to sites and apps", "port_label": "TCP 8877 / UDP 9977",
        "purpose": "Makes this agent a private test point. It measures latency, loss and jitter to other sites, clouds, SaaS apps and DNS servers, and gives AI Advisor on-demand ping and traceroute.",
        "inbound": [("Other Universal Agents", "TCP 8877 and UDP 9977", "Agent-to-agent and mesh tests")],
        "outbound_local": [("Other Universal Agents", "TCP 8877 and UDP 9977", "Agent-to-agent and mesh tests"),
                           ("Test targets", "ICMP, TCP or UDP", "Ping and traceroute"),
                           ("Test targets", "TCP 80 and 443", "HTTP(S) and API tests")],
        "setup": [
            "Enable the Synthetics (Connectivity Test) capability on the agent.",
            "Open TCP 8877 and UDP 9977 between every pair of agents that will test each other.",
            "Create tests in Synthetics: agent-to-agent, network mesh, server IP or hostname, DNS server monitor and HTTP(S) or API tests.",
            "Confirm which continuous test types run on the Universal Agent today with the Kentik account team.",
        ],
        "license": "Synthetics test credits",
        "kb": ["universal-agents", "synthetics-overview", "test-types", "test-credits"],
    },
    "ssh": {
        "name": "SSH config access", "kb_id": "SSH", "color": "ssh",
        "short": "Config backup, show cmds", "port_label": "TCP 22 out",
        "purpose": "Backs up configs, shows what changed, and runs read-only show commands during an AI Advisor investigation.",
        "inbound": [],
        "outbound_local": [("Device management IPs", "TCP 22", "SSH config backup and read-only show commands")],
        "setup": [
            "Create a read-only SSH account on each device (TACACS+ or RADIUS logs will show the agent as the source).",
            "In device settings, SSH tab: credential, collection agent, platform autodetect, config sync and fetch interval (5 minutes recommended for high-visibility environments).",
            "Supported platforms: Juniper Junos, Cisco NX-OS, Arista EOS and Cisco IOS-XE.",
            "Read-only by design: a command block-list, never configure or commit.",
        ],
        "license": "NMS / DevicePak",
        "kb": ["ssh-command-access", "device-settings"],
    },
}
CAP_ORDER = ["flow", "snmp", "trap", "syslog", "dns", "synth", "ssh"]

# Sizing from the KB (Universal Agents page). None = not published.
SIZING = {
    "flow_edge": {"label": "Flow Proxy (Edge Processing)", "cpu": 8, "ram": 32, "per": 25000, "unit": "flows/s", "scale": False},
    "flow_forward": {"label": "Flow Proxy (Forwarding, beta)", "cpu": 1, "ram": 2, "per": 20000, "unit": "flows/s", "scale": False},
    "snmp": {"label": "SNMP/ST", "cpu": 2, "ram": 8, "per": 500, "unit": "devices"},
    "syslog": {"label": "Syslog Server", "cpu": 1, "ram": 1, "per": 8000, "unit": "events/s"},
    "dns": {"label": "DNS OTT Tap", "cpu": 1, "ram": 1, "per": 400000, "unit": "lookups/s"},
    "synth": {"label": "Synthetics", "cpu": 2, "ram": 2, "per": None, "unit": None},
    "trap": {"label": "SNMP Trap Receiver", "cpu": None, "ram": None, "per": None, "unit": None},
    "ssh": {"label": "SSH config access", "cpu": None, "ram": None, "per": None, "unit": None},
}
HEADROOM = 0.30  # KB: add 20-30% for bursty flow, syslog and traps; we plan for the top of that range.

SUPPORTED_OS = ["Debian 11, 12, 13", "Ubuntu 20.04, 22.04, 24.04", "Oracle Linux 9", "CentOS Stream 8"]
UNSUPPORTED_OS = "CentOS 7 and Enterprise Linux before 8 are not supported."

UA_INSTALL_STEPS = [
    "In the Kentik portal go to Settings > Universal Agents and click + Deploy Agent.",
    "Under Installation pick {method}. The portal generates a command that carries K_COMPANY_ID and K_REGISTER_PROVISIONING_TOKEN.",
    "Copy the command and run it on the agent host. Portal tokens last one hour, and you can register as many agents as you like in that window.",
    "The agent appears under Select an Agent (host name is the {hostname_note}). Click Authorize. An agent left unauthorized shows Not Authorized and does nothing.",
    "Set Display Name, Description and Site Name ({site}), then click Continue.",
    "Toggle on the capabilities for this site ({caps}) and click Finish.",
    "Confirm the agent status is Up. An agent not seen for 30 minutes shows Down. Agents update themselves and their capabilities.",
]
UA_PROXY = {
    "docker": "Behind a web proxy add --env https_proxy=http://<proxy>:<port> to the docker run command.",
    "linux": "Behind a web proxy run export https_proxy=http://<proxy>:<port> before the install command.",
}
UA_API_NOTE = ("Automated rollout (optional): create a provisioning token with POST https://grpc.api.{domain}/kagent/v202401/provisioning-tokens "
               "(name, maxUsageCount, requiresApproval, config.siteId, optional expiresAt), export K_COMPANY_ID and "
               "K_REGISTER_PROVISIONING_TOKEN on the host, then authorize with PUT .../agents/authorize/<install-id>. "
               "A token created with requiresApproval false skips authorization. Revoke the token when all agents have registered.")

EGRESS_NOTES = [
    "Every Universal Agent connection starts from inside the network. Nothing has to reach in from the Internet.",
    "SSL-inspecting firewalls and proxies must allow gRPC over port 443.",
    "UDP 40010 to Kentik is an optional Flow Proxy base port.",
]

BGP = {
    "summary": "Edge routers peer BGP directly with Kentik so every flow gets AS path, community and next-hop context.",
    "steps": [
        "In Kentik: device settings > BGP > Peer with device. Kentik shows its ingest peering IPv4 and IPv6 addresses next to the fields.",
        "Kentik peers as an iBGP route-reflector client using your ASN. 4-byte ASN support is required; an MD5 password is optional.",
        "Filter the default route toward Kentik so it does not override the destination AS for unmatched flows.",
        "BGP here is telemetry only; customer routing is unaffected. Peering also enables RTBH and Flowspec mitigation.",
        "The Universal Agent BGP Proxy capability is listed as coming soon, so routers peer with Kentik directly today.",
    ],
    "port": "TCP 179",
    "kb": ["device-settings", "universal-agents"],
}

CLOUDS = {
    "aws": {
        "name": "AWS", "full": "Amazon Web Services",
        "pipeline": ["VPC, TGW and firewall flow logs", "S3 bucket per region", "Read-only IAM role"],
        "summary": "No agent. Flow logs are written to S3 buckets the customer owns, and Kentik assumes a read-only IAM role protected by an ExternalId.",
        "features": {"metadata": "Topology metadata (required)", "flow": "VPC and Transit Gateway flow logs", "firewall": "Network Firewall logs", "metrics": "CloudWatch metrics history"},
        "grant_who": "AWS IAM administrator",
        "grant_what": "IAM role trusting arn:aws:iam::834693425129:root with sts:ExternalId = Kentik Company ID; Describe/List APIs, CloudWatch read, s3:Get* and s3:List* on the log bucket",
        "kb": ["kentik-for-aws", "metadata-aws", "flowlog-aws", "export-aws", "public-clouds"],
    },
    "azure": {
        "name": "Azure", "full": "Microsoft Azure",
        "pipeline": ["VNet and firewall flow logs", "Storage account", "Kentik app, read-only roles"],
        "summary": "No agent. Network Watcher writes VNet flow logs to a storage account the customer owns, and Kentik reads it through an app approved in Entra ID.",
        "features": {"metadata": "Topology metadata (required)", "flow": "VNet flow logs (version 2)", "firewall": "Azure Firewall diagnostic logs", "metrics": "Azure metrics history"},
        "grant_who": "Entra ID Application Administrator and subscription Owner",
        "grant_what": "Reader on subscriptions or resource groups; Storage Blob Data Reader on the log storage account",
        "kb": ["kentik-for-azure", "azure-roles", "flowlog-azure", "export-azure", "azure-powershell"],
    },
    "gcp": {
        "name": "Google Cloud", "full": "Google Cloud",
        "pipeline": ["Subnet flow logs", "Pub/Sub topic + pull subscription", "IAM roles for Kentik"],
        "summary": "No agent. A Log Router sink sends VPC flow logs to Pub/Sub, and Kentik pulls them with its own service account.",
        "features": {"metadata": "Topology metadata (required)", "flow": "VPC flow logs", "cloudrun": "Cloud Run logs (second export)", "metrics": "Cloud metrics history"},
        "grant_who": "GCP project or folder IAM administrator",
        "grant_what": "kentik-vpc-flow@kentik-vpc-flow.iam.gserviceaccount.com gets Pub/Sub Subscriber + Viewer on the subscription and Compute Viewer on the project or folder",
        "kb": ["kentik-for-gcp", "cloud-overview", "public-clouds"],
    },
    "oci": {
        "name": "Oracle Cloud", "full": "Oracle Cloud Infrastructure",
        "pipeline": ["VCN flow logs", "Connector Hub to bucket", "Policy for Kentik"],
        "summary": "No agent. OCI Logging captures VCN flow logs, Connector Hub moves them into an Object Storage bucket, and Kentik reads the bucket through OCI APIs.",
        "features": {"metadata": "Topology metadata (required)", "flow": "VCN flow logs"},
        "grant_who": "OCI tenancy administrator",
        "grant_what": "Cross-tenancy policy generated by the Kentik portal (recommended), or a user and group holding Kentik's API key; READ on the bucket and network resources",
        "kb": ["kentik-for-oci", "cloud-overview", "public-clouds"],
    },
}
CLOUD_ORDER = ["aws", "azure", "gcp", "oci"]

AWS_TRUST_POLICY = """{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::834693425129:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "<Kentik Company ID>" },
      "ArnEquals": { "aws:PrincipalArn": "arn:aws:iam::834693425129:role/eks-ingest-node" }
    }
  }]
}"""

AWS_PERMISSIONS = [
    ("EC2", "ec2:Describe*, ec2:Search*, ec2:GetManagedPrefixListEntries"),
    ("Direct Connect", "directconnect:List*, directconnect:Describe*"),
    ("ELB", "elasticloadbalancing:Describe*"),
    ("IAM", "iam:ListAccountAliases"),
    ("Network Firewall", "network-firewall:Describe*, network-firewall:List*"),
    ("Cloud WAN", "networkmanager:ListCoreNetworks, GetCoreNetwork, GetCoreNetworkPolicy, ListAttachments, GetNetworkRoutes"),
    ("CloudWatch", "cloudwatch:ListMetrics, GetMetricStatistics, GetMetricData, Describe*"),
    ("Organizations", "organizations:ListAccounts"),
    ("S3 (log bucket)", "s3:Get*, s3:List* on arn:aws:s3:::<bucket> and arn:aws:s3:::<bucket>/*"),
    ("KMS (SSE-KMS only)", "kms:Decrypt, kms:DescribeKey on the bucket key"),
]

AWS_STEPS = [
    "Start with a metadata-only export to prove access before turning on high-volume logs.",
    "Create one S3 bucket per region for flow logs. Kentik treats each bucket as one device, so hundreds of VPCs into one global bucket risks S3 throttling.",
    "Encryption: SSE-S3 is recommended. SSE-KMS needs the KMS statement. SSE-C is not supported.",
    "Turn on flow logs for VPCs, Transit Gateways{fw}: filter All, destination S3, custom format with every v2 to v5 field.",
    "Create the IAM role with the trust policy and permissions below.",
    "In Kentik: Settings > Public Clouds > Create Cloud Export > AWS Cloud. Select features, enter the Role ARN > Verify Role, Region > Verify Region, bucket name and prefix > Verify S3 Bucket.",
    "Pick sampling (Legacy, a rate from 2 to 2000, or Unsampled), name the export, choose the billing plan and Save.",
    "Optional: tick \"Help me configure my provider via Terraform\" for a main.tf that creates the role, bucket and flow logs.",
]
AWS_MULTI = ("Many accounts: create a hub role in one account that assumes a role in each spoke account. In the export, the nested settings take "
             "the spoke account IDs, regions and role suffix.")

AZURE_ROLES = [
    ("Reader", "Subscription or resource group holding the logs", "Read resources"),
    ("Reader", "Additional subscriptions or resource groups", "Enrichment scope"),
    ("Storage Blob Data Reader (or Reader and Data Access)", "Log storage account", "Read exported logs"),
    ("Custom read-only Kentik role (optional)", "Tenant", "Full traffic path views"),
]
AZURE_STEPS = [
    "Create a dedicated storage account for the logs.",
    "If the storage account firewall is restricted, allow 20.69.189.228 and 20.69.185.115 (WestUS2 uses 51.8.214.254 and 172.171.46.16).",
    "In Network Watcher turn on VNet flow logs (version 2) to that storage account.",
    "{fw}",
    "Authorize Kentik: {auth}",
    "In Kentik: Settings > Public Clouds > Create Cloud Export > Azure Cloud. Pick features, API access method, location and subscription ID, Validate Service Principal, resource group > Verify Access.",
    "Enter the storage account name, sampling (2 to 2000 or Unsampled), optional enrichment scope and billing plan, then Save.",
    "Optional: the export wizard can generate a PowerShell script that does most of the Azure side (VNet flow logs only).",
]
AZURE_AUTH = {
    "enterprise": "an Application Administrator assigns the Kentik enterprise app (Kentik NSG Flow Exporter), then Validate Service Principal in the export wizard.",
    "custom": "create a single-tenant app registration with your own secret or certificate, and enter it in Kentik as a credential with the client and tenant IDs.",
}

GCP_FILTER = 'resource.type="gce_subnetwork" AND log_id("compute.googleapis.com/vpc_flows")'
GCP_SA = "kentik-vpc-flow@kentik-vpc-flow.iam.gserviceaccount.com"
GCP_ROLES = [
    ("Pub/Sub Subscriber", "The pull subscription", "Pull flow log messages"),
    ("Pub/Sub Viewer", "The pull subscription", "See the subscription"),
    ("Compute Viewer (not Compute Network Viewer)", "Project, or the top-level folder", "Read topology metadata"),
]
GCP_STEPS = [
    "VPC Network > subnet > Edit > Flow logs On > Configure Logs > Include metadata (Kentik needs it). Any aggregation interval works; sample rate 0 to 100%, default 50%.",
    "Logging > Logs Router > Create Sink > Cloud Pub/Sub topic > create the topic, with the inclusion filter below.",
    "Pub/Sub > Topics > Create Subscription > delivery type Pull.",
    "Pub/Sub > Subscriptions > select it > Add Member > Kentik's service account > Pub/Sub Subscriber and Pub/Sub Viewer.",
    "IAM & Admin > IAM > Grant Access > Kentik's service account > Compute Viewer. Whoever grants it needs compute.networks.list and resourcemanager.projects.setIamPolicy.",
    "In Kentik: Settings > Public Clouds > Create Cloud Export > GCP Cloud. Enter the project ID, Pub/Sub topic and subscription, name and billing plan, then Save.",
    "To cut cost, narrow the sink filter by port, protocol or subnet. A metadata-only export always shows a red flow status; that is expected.",
]

OCI_STEPS = [
    "Create an Object Storage bucket for the logs.",
    "Create a log group and a capture filter in the root compartment, then turn on VCN flow logs for the VCNs, subnets or VNICs you choose.",
    "Create a Connector Hub connector: source Logging (log group and flow log), target Object Storage (bucket, optional object name prefix). Defaults: 100 MB batch, 7 second batch time. The connector can create its own policy.",
    "Give Kentik access: {access}",
    "In Kentik: Settings > Public Clouds > Create Cloud Export > OCI Cloud. Pick Metadata only, or Flow logs and metadata. Enter tenancy ID, default region (and user ID for a custom user), then Validate Permissions.",
    "For flow, enter the bucket name, namespace, connector OCID and prefix. Copy the autogenerated policy, pick a billing plan and Save.",
    "Troubleshooting: make sure a custom user is in a group, and that no policy placeholders were left in.",
]
OCI_ACCESS = {
    "cross_tenancy": "the Kentik portal generates a cross-tenancy policy (recommended); paste it into the OCI manual policy editor.",
    "user": "create a user and group with Kentik's public key as an API key (fingerprint d0:b4:75:ac:39:8a:90:b0:cf:ee:3e:ee:b9:0c:07:ff) and the policies below.",
}
OCI_USER_POLICY = """Allow group <groupRef> to READ all-resources in tenancy
Allow group <groupRef> to READ buckets in tenancy where target.bucket.name='<bucketName>'
Allow group <groupRef> to READ objects in tenancy where target.bucket.name='<bucketName>'"""
OCI_VALUES = [
    ("Tenancy OCID", "Tenancy details"), ("User OCID", "Custom user only"), ("Home region", "The city name in parentheses"),
    ("Bucket name and namespace", "Bucket details"), ("Service connector OCID", "Connector details"),
    ("Object name prefix", "Only if you set one"), ("Compartment ID", "Defaults to the tenancy OCID"),
]

SYNTH_CREDITS = {
    "private_subtest": 2.5, "global_subtest": 5.0,
    "http_private_per_s": 0.5, "http_global_per_s": 1.0,
    "bgp_per_minute": 0.53, "runs_per_month_1min": 43200,
}

SECURITY = [
    ("Hosting", "US: Ashburn, VA. EU: Frankfurt. Chosen when the contract is signed."),
    ("In transit", "TLS 1.2+ to and from Kentik"),
    ("At rest", "AES-256, consistent with FIPS 140-2"),
    ("Isolation", "Separate logical database and tables per customer"),
    ("Audits", "SOC 2 Type II yearly, annual third-party penetration test"),
    ("Access", "SAML 2.0 SSO, MFA (TOTP or hardware keys), user, admin and super admin roles, per-user API tokens"),
    ("Data", "IP addresses and network metadata, never packet payloads; IP redaction available"),
    ("Retention (default)", "45 days full-resolution flow, 120 days summarized, 3 or 13 months NMS metrics by plan; contracts can change this"),
]

LICENSES = [
    ("FlowPak", "Flow from routers, switches, firewalls and hosts, including SNMP flow enrichment."),
    ("NMS / DevicePak", "Full device monitoring, plus syslog, SNMP traps and SSH config and commands."),
    ("CloudPak", "Public cloud flow logs, sized in flows per second."),
    ("Synthetics", "Monthly test credits: global agent subtest 5 credits, private agent 2.5, BGP Monitor 0.53 per minute."),
]

OPEN_ITEMS = [
    "Which continuous synthetic test types run on the Universal Agent today (the KB names the capability Connectivity Test).",
    "Licensing names and entitlements per contract (FlowPak, NMS/DevicePak, CloudPak, Synthetics credits).",
    "Disk sizing for Universal Agent hosts is not published in the KB.",
    "BGP Proxy on the Universal Agent is listed as coming soon; until then edge routers peer with Kentik directly.",
]
