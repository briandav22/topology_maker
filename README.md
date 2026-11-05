# Infoblox Kentik Deployment Configurator

A small Python app for designing a Kentik deployment and exporting it for a customer. It serves an interactive Infoblox deployment explorer in your browser, and what you design there exports as an HTML page, a deployment guide PDF or a setup file.

- **Design** data centers (up to six) and branch offices (up to ten), plus AWS, Azure, Google Cloud, Oracle Cloud and SaaS, in High level or Deep dive (ports and permissions) mode.
- **Branches without an agent.** By default a branch has no Universal Agent: its routers, switches and firewalls send flow, SNMP, traps and syslog across the WAN to a data center agent. Under "Universal Agent at this branch", pick **Tests only** for an agent that runs only Connectivity Test while the devices still send to the data center, or **Collects here** for an agent that also collects the branch devices.
- **Agents and appliances in the cloud.** Each cloud (AWS, Azure, Google Cloud, Oracle Cloud) can have a Universal Agent on a VM: **Tests only**, or **Collects here**. Enter the number of network appliances there (for example Palo Alto VM-Series). With no collecting agent in the cloud, the appliances send flow, traps and syslog to a data center agent across Direct Connect, ExpressRoute, Cloud Interconnect or FastConnect. Flow logs keep coming through the cloud export either way.
- **One box for the network equipment.** Each site shows one box for its equipment: "Data center network equipment", "Branch network equipment", or "AWS network appliances" with the count you enter. You do not pick or add device types. The tool shows how Kentik collects from the network; it does not draw the network.
- **Capability toggles.** Each Universal Agent has the switches of Installed Capabilities in the Kentik portal: BGP Proxy, Connectivity Test, Device Configuration Sync, DNS OTT Tap, Flow Proxy, SNMP, SNMP Trap Receiver, Streaming Telemetry and Syslog Server. Only the ones you turn on are drawn, sized and given firewall rules.
- **SNMP without streaming telemetry.** The portal bundles SNMP and Streaming Telemetry (gNMI) in one SNMP/ST capability. Here they are two switches, and Streaming Telemetry starts off, so a design can use SNMP polling only. gNMI then appears nowhere in the map or the guide. Sizing counts the shared SNMP/ST figure once, and the guide tells the customer to turn on SNMP/ST in the portal.
- **Flow Proxy modes.** Flow Proxy runs as **Forwarding** (sends raw flow to Kentik SaaS to decode; 1 core / 2 GB per 20,000+ flows/s) or **Edge Processing** (decodes on the agent; 8 cores / 32 GB per 25,000+ flows/s). Pick per agent.
- **Optional sizing inputs.** Open "Size this agent" on any agent (or "Branch load" or "Appliance load" where the devices send to a data center) and enter network devices and flows per second. The map shows the planned host, and the guide PDF sizes each agent from those numbers. Left blank, sizing uses the KB baseline.
- **BGP peering is optional.** Each data center has a BGP peering switch, off by default since many enterprises don't use it. When it's on, choose whether the edge routers peer directly with Kentik or with the agent (BGP Proxy). Turning BGP Proxy off on the agent leaves the site with no BGP; it never switches to direct peering on its own.
- **Export** (Export button, or press E):
  - **Save as HTML**: a single file that opens on your design in any browser, no app needed.
  - **Deployment guide PDF**: the diagrams (each branch, but not the All branch offices view; cloud views show only the agents and the account setup you chose), then roles and permissions, firewall rules per site, Universal Agent sizing and install steps, capability configuration, branches without an agent, cloud setup with IAM policies, a synthetic test plan with credit estimates, and the Kentik KB sources.
  - **Setup JSON**: the design in the format the command line export reads.

Everything carries Infoblox branding. The AWS, Azure, Google Cloud and Oracle Cloud views and cards use each provider's official architecture icons, and the AWS card shows the AWS logo (see [Cloud provider icons](#cloud-provider-icons)).

Design rules built in: on-prem sites always use the **Universal Agent** with capabilities (never the standalone kproxy or ksynth agents), the agent installs on a **Linux host or in Docker** only (no Kubernetes or Helm), and Kentik Kube is not part of the offer.

## Run it

Needs Python 3.9 or newer and one package, reportlab. Install reportlab in a Python virtual environment, as shown below.

**Why a virtual environment?** A virtual environment (venv) is a folder in the project, here `.venv`, with its own Python and its own packages:

- reportlab goes into that folder only. It does not change the Python of your system or the packages of your other projects.
- Recent Python installs (Homebrew on macOS, many Linux distributions) refuse `pip install` outside a virtual environment, with the error `externally-managed-environment`. In a venv, the install works and needs no `sudo`.
- To remove everything, delete the `.venv` folder. Git ignores it.

On macOS or Linux:

```bash
git clone https://github.com/briandav22/topology_maker.git
cd topology_maker
python3 -m venv .venv                       # make the environment (one time)
source .venv/bin/activate                   # turn it on (in each new terminal)
python -m pip install -r requirements.txt   # install reportlab into .venv (one time)
python run.py
```

On Windows, make the environment with `py -m venv .venv` and turn it on with `.venv\Scripts\activate`. The other commands are the same.

Your browser opens at http://127.0.0.1:8765. Use `--port 9000` to change the port or `--no-browser` to skip opening it.

While the environment is on, your prompt starts with `(.venv)`. In a new terminal, go to the `topology_maker` folder and turn the environment on again before you run `python run.py` or an export. To turn it off, run `deactivate`.

In the app:

1. Pick the deployments in scope at the top. Use the steppers to add data centers and branch offices.
2. Click a site to open it. Name it, choose Linux or Docker, and flip capabilities on or off; the diagram and sizing follow. For a branch, choose whether it has its own agent or which data center it sends to.
3. Click **Export**, fill in the customer, who prepared it and the Kentik region (US or EU), and pick an export.

The design is kept in the page address, so a bookmark or a reload brings it back.

The app page is `configurator/static/explorer.html`, built from the parts in `ui/` by `sh ui/build.sh`. Edit the parts, rebuild, and commit both; do not edit the built page by hand.

## Export from the command line

```bash
python3 run.py export examples/hybrid-two-dc.json            # both PDFs into ./exports
python3 run.py export my-setup.json --out out --only guide    # just the guide
python3 run.py export my-setup.json --only html               # the HTML page, if the JSON came from the app
```

The command line guide draws its own simpler diagram; the guide exported from the app uses the explorer's diagrams.

## Samples

`samples/` holds PDFs built from the three setups in `examples/`:

| Setup | What it shows |
|---|---|
| `single-dc-aws.json` | One data center on Docker plus AWS, high level |
| `hybrid-two-dc.json` | Two data centers and a branch, AWS (4 accounts) and Azure, deep dive |
| `global-multicloud-eu.json` | Four data centers and two branches, all four clouds, EU region, deep dive |

`infoblox-kentik-deployment-guide-from-app.pdf` was exported from the app (two data centers, four branches without agents, AWS, Azure and SaaS) and shows the explorer diagrams in the guide.

## Branding

Colors, the product line and the footer text live in `configurator/brand.py`. The colors are a close approximation; swap in the official hex values from the Infoblox brand kit there. To use the official logo, save it as `assets/infoblox-logo.png` (wide, transparent PNG) and it replaces the drawn wordmark in every PDF.

## Cloud provider icons

The cloud views, the flow pictures on the cloud cards, the guide PDF and the AWS card use the official icons of each cloud provider, unchanged: no crop, new color or new shape. The boxes that show Kentik, the Universal Agent and the provider APIs keep the app's own icons.

| Provider | Package | Where to get it | Terms |
|---|---|---|---|
| AWS | Architecture Icons, release 07312026 | https://aws.amazon.com/architecture/icons/ | Customers and partners may use them to make architecture diagrams. |
| Microsoft Azure | Azure_Public_Service_Icons_V24 | https://learn.microsoft.com/en-us/azure/architecture/icons/ | Allowed in architecture diagrams, training materials and documentation. Do not crop, flip, rotate or change an icon. Show the service name near each icon. |
| Google Cloud | Core product icons and product category icons (2025 update) | https://cloud.google.com/icons | Published for diagrams and technical documentation. A product without its own icon uses the icon of its category, for example Networking for VPC. |
| Oracle Cloud | OCI Architecture Diagram Toolkit v24.2 for draw.io | https://docs.oracle.com/en-us/iaas/Content/General/Reference/graphicsfordiagrams.htm | Published for architecture diagrams of OCI. |

Only the AWS package has a logo (the AWS Cloud group icon). The Azure, Google Cloud and Oracle Cloud cards keep a plain cloud icon. Those logos are trademarks with stricter rules: add them only from a source that the Infoblox brand or alliances team approves.

The icons are in `ui/csp-icons.svg`, which `tools/csp_icons.py` makes from the packages. To update them, unzip the new packages and run:

```bash
python3 -I tools/csp_icons.py --aws DIR --azure DIR --gcp-core DIR --gcp-cat DIR --oci "DIR/OCI Library.xml"
sh ui/build.sh
```

The script lists the file that each icon comes from. It stops if a file is missing or has a format that it does not handle.

## Where the facts come from

All Kentik facts (ports, sizing, permissions, cloud steps, credit rules) are in `configurator/catalog.py`, each tied to its Kentik KB page, checked against kb.kentik.com in October 2026. Update that one file when Kentik changes something. Sizing math and firewall rules are derived in `configurator/model.py`.

Planning assumptions worth knowing:
- Host sizing sums the KB per-capability figures and adds 30% headroom (the KB says 20 to 30%). Above the KB's flow figures (20,000 flows/s for Forwarding, 25,000 for Edge Processing), Flow Proxy sizing is scaled linearly and flagged as an estimate to confirm with Kentik. Disk sizing is not published.
- Synthetic credit estimates count each direction of a mesh as one subtest (this matches the KB's 4-agent mesh example) and are planning estimates only.

## Files

```
run.py                     start the app, or export from the command line
configurator/catalog.py    Kentik KB facts and sources
configurator/model.py      setup defaults, sizing, firewall rules, test credits
configurator/topology.py   fallback diagram for command line PDFs
configurator/pdf.py        topology PDF and deployment guide PDF
configurator/web.py        local web server: serves the explorer, builds PDFs
configurator/static/       explorer.html, the app page (built from ui/)
ui/                        the page's parts (p1/p2 HTML, d1-d5 data, r1-r3 rendering) and build.sh
ui/csp-icons.svg           the cloud provider icons (made by tools/csp_icons.py)
tools/csp_icons.py         makes ui/csp-icons.svg from the providers' icon packages
configurator/brand.py      Infoblox branding
examples/                  sample setups
samples/                   sample exports
```
