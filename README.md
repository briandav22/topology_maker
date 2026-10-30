# Infoblox Kentik Deployment Configurator

A small Python app for designing a Kentik deployment and exporting it for a customer. It serves an interactive Infoblox deployment explorer in your browser, and what you design there exports as an HTML page, a deployment guide PDF or a setup file.

- **Design** data centers (up to six) and branch offices (up to ten), plus AWS, Azure, Google Cloud, Oracle Cloud and SaaS, in High level or Deep dive (ports and permissions) mode.
- **Branches without an agent.** By default a branch has no Universal Agent: its routers, switches and firewalls send flow, SNMP, traps and syslog across the WAN to a data center agent. Turn on "Universal Agent at this branch" for any branch that needs its own (for example to run Connectivity Tests from that site).
- **Capability toggles.** Each Universal Agent has the same eight switches as Installed Capabilities in the Kentik portal: BGP Proxy, Connectivity Test, Device Configuration Sync, DNS OTT Tap, Flow Proxy, SNMP Trap Receiver, SNMP/ST and Syslog Server. Only the ones you turn on are drawn, sized and given firewall rules.
- **Flow Proxy modes.** Flow Proxy runs as **Forwarding** (sends raw flow to Kentik SaaS to decode; 1 core / 2 GB per 20,000+ flows/s) or **Edge Processing** (decodes on the agent; 8 cores / 32 GB per 25,000+ flows/s). Pick per agent.
- **Optional sizing inputs.** Open "Size this agent" on any agent (or "Branch load" on a branch without one) and enter network devices and flows per second. The map shows the planned host, and the guide PDF sizes each agent from those numbers. Left blank, sizing uses the KB baseline.
- **BGP peering is optional.** Each data center has a BGP peering switch, off by default since many enterprises don't use it. When it's on, choose whether the edge routers peer directly with Kentik or with the agent (BGP Proxy). Turning BGP Proxy off on the agent leaves the site with no BGP; it never switches to direct peering on its own.
- **Export** (Export button, or press E):
  - **Save as HTML**: a single file that opens on your design in any browser, no app needed.
  - **Deployment guide PDF**: every diagram you see, then roles and permissions, firewall rules per site, Universal Agent sizing and install steps, capability configuration, branches without an agent, cloud setup with IAM policies, a synthetic test plan with credit estimates, a go-live checklist, and the Kentik KB sources.
  - **Setup JSON**: the design in the format the command line export reads.

Everything carries Infoblox branding.

Design rules built in: on-prem sites always use the **Universal Agent** with capabilities (never the standalone kproxy or ksynth agents), the agent installs on a **Linux host or in Docker** only (no Kubernetes or Helm), and Kentik Kube is not part of the offer.

## Run it

Needs Python 3.9 or newer and one package, reportlab.

```bash
git clone https://github.com/briandav22/topology_maker.git
cd topology_maker
python3 -m pip install -r requirements.txt
python3 run.py
```

Your browser opens at http://127.0.0.1:8765. Use `--port 9000` to change the port or `--no-browser` to skip opening it.

In the app:

1. Pick the deployments in scope at the top. Use the steppers to add data centers and branch offices.
2. Click a site to open it. Name it, choose Linux or Docker, and flip capabilities on or off; the diagram and sizing follow. For a branch, choose whether it has its own agent or which data center it sends to.
3. Click **Export**, fill in the customer, who prepared it and the Kentik region (US or EU), and pick an export.

The design is kept in the page address, so a bookmark or a reload brings it back.

The app page is `configurator/static/explorer.html`, built from the parts in `ui/` by `sh ui/build.sh`. Edit the parts, rebuild, and commit both; do not edit the built page by hand.

## Two new takes (for review)

The `takes/` folder holds two new versions of the tool, which run beside this app and do not change it:

- **Take A, Network Canvas:** draw the customer's own network; agent placement, data paths, firewall rules per firewall, WAN load and sizing follow from the drawing.
- **Take B, Rollout Map:** the deployment as waves of work, with a transit map and timeline, tasks for each customer team, and a workbook the customer ticks off.

```bash
python3 takes/serve.py        # http://127.0.0.1:8770
```

See `takes/README.md` for the thinking, a short test script for each take, and the known limits.

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

## Where the facts come from

All Kentik facts (ports, sizing, permissions, cloud steps, credit rules) are in `configurator/catalog.py`, each tied to its Kentik KB page, checked against kb.kentik.com in October 2026. Update that one file when Kentik changes something. Sizing math and firewall rules are derived in `configurator/model.py`.

Planning assumptions worth knowing:
- Host sizing sums the KB per-capability figures and adds 30% headroom (the KB says 20 to 30%). Flow Proxy sizing is not scaled past the KB's "25k+ flows/s" figure; very high rates are flagged to confirm with Kentik. Disk sizing is not published.
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
configurator/brand.py      Infoblox branding
examples/                  sample setups
samples/                   sample exports
```
