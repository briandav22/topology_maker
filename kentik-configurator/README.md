# Infoblox Kentik Deployment Configurator

A small Python app for designing a Kentik deployment and exporting it for a customer:

- **Configure** on-prem sites (as many data centers and branches as you need, each with one Universal Agent and its capabilities), AWS, Azure, Google Cloud and Oracle Cloud, and synthetic monitoring.
- **See** the topology update live, in High level or Deep dive (ports and permissions) mode.
- **Export** either
  - a one-page **topology PDF**, or
  - a full **deployment guide PDF**: roles and permissions, firewall rules per site, Universal Agent sizing and install steps, capability configuration, cloud setup with IAM policies and roles, a synthetic test plan with credit estimates, a go-live checklist, security and licensing, and the Kentik KB pages every fact came from.

Everything carries Infoblox branding.

Design rules built in: on-prem sites always use the **Universal Agent** with capabilities (never the standalone kproxy or ksynth agents), the agent installs on a **Linux host or in Docker** only (no Kubernetes or Helm), and Kentik Kube is not part of the offer.

## Run it

Needs Python 3.9 or newer and one package, reportlab.

```bash
cd kentik-configurator
python3 -m pip install -r requirements.txt
python3 run.py
```

Your browser opens at http://127.0.0.1:8765. Use `--port 9000` to change the port or `--no-browser` to skip opening it.

In the app:

1. Fill in the customer and pick the Kentik region (US or EU).
2. Start from a preset, or add sites with **+ Add data center** / **+ Add branch**. Each site gets its own Universal Agent; tick the capabilities it needs and enter rough load (flows per second, devices, syslog rate) to size the host.
3. Turn on the clouds in scope and pick what to collect.
4. Set up synthetic tests (site mesh, SaaS apps to test, BGP Monitor).
5. Click **Export topology PDF** or **Export deployment guide PDF**. **Save setup** writes a JSON file you can load again later.

The app remembers your last setup in the browser.

## Export from the command line

```bash
python3 run.py export examples/hybrid-two-dc.json            # both PDFs into ./exports
python3 run.py export my-setup.json --out out --only guide    # just the guide
```

## Samples

`samples/` holds PDFs built from the three setups in `examples/`:

| Setup | What it shows |
|---|---|
| `single-dc-aws.json` | One data center on Docker plus AWS, high level |
| `hybrid-two-dc.json` | Two data centers and a branch, AWS (4 accounts) and Azure, deep dive |
| `global-multicloud-eu.json` | Four data centers and two branches, all four clouds, EU region, deep dive |

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
configurator/topology.py   diagram layout, drawn as SVG (preview) and into PDFs
configurator/pdf.py        topology PDF and deployment guide PDF
configurator/web.py        local web server and the app page
configurator/brand.py      Infoblox branding
examples/                  sample setups
samples/                   sample exports
```
