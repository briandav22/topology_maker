# CLAUDE.md

Infoblox Kentik Deployment Configurator: a small local web app for designing how a customer deploys Kentik (Infoblox network observability) and exporting that design for the customer.

## What it is and who it's for

- Built for Infoblox solutions engineers and account teams who get asked "how is Kentik deployed?". They lay out a customer's deployment in the browser and send the result to the customer.
- Models up to 6 data centers and 10 branch offices with Universal Agents (UA), plus AWS, Azure, Google Cloud, Oracle Cloud (OCI) and SaaS/Internet testing. Click any card to drill in. High level mode shows concepts; Deep dive adds ports, roles and permissions.
- Exports: **Save as HTML** (one file that opens on the design in any browser), **Deployment guide PDF** (diagrams, roles and permissions, firewall rules per site, UA sizing and install, capability setup, cloud setup with IAM policies, synthetic test plan with credit estimates, go-live checklist, KB sources) and **Setup JSON** (input for the command line export).

## Stack

- Python 3.9+ with the standard library HTTP server. reportlab is the only dependency (PDFs).
- The page is one self-contained HTML file: inline SVG and plain JavaScript, no framework, no npm, no bundler. `ui/build.sh` concatenates the parts.
- No database. The design lives in the page's URL hash. localStorage keeps only the theme and whether the details panel is open.

## Layout

```
run.py                     CLI: serve the app, or export PDFs/HTML from a setup JSON
configurator/
  web.py                   HTTP server: GET / (the page), POST /api/pdf and /api/topology
  model.py                 setup defaults and normalize(), UA sizing, firewall rules, synthetic credits
  catalog.py               every Kentik fact with its kb.kentik.com source; OPEN_ITEMS for the guide
  pdf.py                   reportlab: topology PDF and deployment guide PDF
  topology.py              simpler drawn diagram for CLI exports (no browser there)
  brand.py                 PDF colors, product line, footer; official logo hook
  static/explorer.html     BUILT from ui/. Never edit by hand
ui/                        page source, joined in this order by build.sh
  p1.html                  CSS, light and dark themes
  p2.html                  body markup and icons
  d1.js                    line types, deployments, presets, limits; PRISTINE copy used by Save as HTML
  d2.js d3.js d4.js        scene data: on-prem and SaaS; AWS and Azure; GCP, OCI and the Kentik platform
  d5.js                    sites: UA capabilities (UACAPS), Flow Proxy modes and sizing, agent and branch scenes
  r1.js                    helpers, state object S, overview layout (ovLayout, ovSize)
  r2.js                    drill-ins, side panel, zoom and glide, URL hash state, keyboard, startup
  r3.js                    exports: Save as HTML, guide PDF, setup JSON
examples/                  three setup JSONs for the CLI
samples/                   PDFs built from examples/, plus one exported from the app
assets/                    put the official logo here as infoblox-logo.png
```

How the pieces connect:
- `GET /` serves the built page with `window.IBK_APP=1` injected, which turns on the PDF and setup JSON exports.
- Guide PDF: r3.js draws each view off screen on a 1000×620 canvas in the light theme, turns it into a PNG and posts `{cfg, images}` to `/api/pdf`. `cfg` comes from `exportCfg()` in r3.js and goes through `model.normalize()`.
- Save as HTML: the page as first loaded (`PRISTINE`) with the URL hash baked in as `window.IBK_STATE`. It works without the app, but there the PDF and setup JSON exports are off.
- The setup JSON is `exportCfg()` output. Its `explorer_state` field (the hash) lets the CLI write the HTML page too.

## Run it

```bash
python3 -m pip install -r requirements.txt   # once (a venv is fine)
python3 run.py                               # http://127.0.0.1:8765, opens a browser
python3 run.py --port 9000 --no-browser
sh ui/build.sh                               # after any change in ui/
python3 run.py export examples/hybrid-two-dc.json                  # topology + guide PDFs into ./exports
python3 run.py export setup.json --out out --only guide            # or topology, or html (needs explorer_state)
```

- The server rereads explorer.html on every request, so a rebuild shows on reload. Restart it after Python changes.
- "Address already in use" means another copy is running: stop it (`lsof -ti :8765 | xargs kill`) or pass `--port`.

## Key design decisions

- **Universal Agent only on-prem.** Never draw the standalone kproxy or ksynth agents: the UA with capabilities is how Kentik is deployed now, and kproxy reaches end of life on May 1, 2027.
- **The UA installs on a Linux host or in Docker only.** No Kubernetes or Helm, and no Kentik Kube, which Kentik no longer offers.
- **Infoblox branding throughout.** Kentik is part of Infoblox. Say "Infoblox + Kentik" and "your Infoblox account team".
- **One page for everything.** The app serves the same page that Save as HTML writes, so the customer sees exactly what was designed, and the guide PDF uses pictures of the same views.
- **The design lives in the URL hash.** Bookmarks, reloads and shared links reopen it, with no server state.
- **Branches have no agent by default.** Many customers don't put a UA at every site. A branch's devices send flow, SNMP, traps and syslog across the WAN to a chosen data center agent, and that load counts toward the agent's sizing. Any branch can get its own agent.
- **Capability switches per agent** mirror the eight Installed Capabilities in the Kentik portal. Only what is on gets drawn, sized and given firewall rules. Defaults: data center = Flow Proxy, SNMP/ST, SNMP Trap Receiver, Syslog Server; branch agent = Flow Proxy, SNMP/ST, Connectivity Test.
- **BGP is optional and starts off**, because many enterprises never use it. A data center's BGP peering switch picks routers peering directly with Kentik or with the agent (BGP Proxy). Turning BGP Proxy off leaves the site with no BGP; it never falls back to direct peering.
- **Syslog, traps and metrics come only from network devices** (routers, switches, firewalls, load balancers), never servers or hypervisors. That is what Kentik customers send.
- **Flow Proxy has two modes.** Forwarding (formerly kTraffic) sends raw flow to Kentik SaaS to decode; it is light and the default. Edge Processing (formerly kProxy) decodes on the agent and is heavy. Use the new names.
- **Sizing inputs are optional** and stay collapsed under "Size this agent (Optional)"; left blank, the KB baseline is used. A host's size is the sum of the KB's per-capability figures plus 30% headroom (the KB says 20 to 30%). Above the KB's flow figures it scales linearly and is marked as an estimate.
- **AWS data paths.** Kentik's collector in Kentik's own AWS account reads VPC flow logs from S3 inside AWS, so the customer pays no egress. Metadata API calls go from Kentik SaaS through the IAM role. Nested accounts: Kentik assumes the primary role in account A, which assumes secondary roles in B and C.
- **Sites are added from the top menu** (steppers) or the side panel only. No dashed "add" boxes in the diagram: they cluttered it and couldn't be removed.
- **Facts come from the Kentik KB.** BGP Proxy is shown as available because the portal lists it, and the PDF adds a "confirm" note because the KB still says "coming soon".
- **A steady, smooth diagram.** The details panel collapses (button or `\`) and the overview canvas takes the shape of the free space, so cards grow. Cards glide on re-layout and drill-ins zoom. Exports always use the standard 1000×620 canvas, whatever the screen.

## Conventions

- Edit `ui/`, run `sh ui/build.sh`, and commit both `ui/` and `configurator/static/explorer.html`.
- Kentik facts belong in `configurator/catalog.py` with their KB key. Check them at kb.kentik.com (the index is https://kb.kentik.com/llms.txt; add `.md` to a doc URL for plain text).
- The page keeps its own copy of facts the diagrams show: capabilities and sizing in d5.js (`UACAPS`, `FLOW_MODES`, the 1.3 headroom) and scene text in d1-d5.js. Change both sides so the map and the PDF agree.
- To add a design setting:
  - Keep it in `S` (r1.js).
  - Write and read it in `stateHash()` and `loadHash()` (r2.js) so reloads and saved HTML keep it.
  - Send it in `exportCfg()` (r3.js).
  - Default and validate it in `model.new_site()` and `normalize()`.
  - Older hashes and setup JSON must still load.
- Keep dependencies to the Python standard library plus reportlab, and keep the page free of frameworks and build tools. Use the CSS variables in p1.html for colors so both themes work.
- UI stability rules (learned in PRs #8 and #10):
  - The diagram header (`.shead`) stays one fixed 35px line (it may wrap only at phone widths), and nothing that changes per click may resize `#svgwrap`.
  - Re-layouts wait for a running zoom to end (`zoomEnd`).
  - Honor prefers-reduced-motion.
  - `.panelbtn` is the details button; `.pbtn` is the preset pills.
- Keep the UI simple: optional inputs stay collapsed, and wording is plain and customer-facing.
- Update README.md when behavior changes. Changes reach main through pull requests.
- There is no test suite. Before a PR:
  - Rebuild the page and run the CLI export for all three examples.
  - In the app, go through every preset, a few drill-ins, both modes, both themes, hiding and showing details, and all three exports, with the browser console open.

## Known issues and limits

- **No login.**
  - The server listens on 127.0.0.1 by default. With `--host 0.0.0.0`, anyone who can reach the port can use it.
  - To share it, put it behind something like a Cloudflare Tunnel with Cloudflare Access.
- **Some guide inputs can't be set in the page.** These use `model.py` defaults; to change them, edit a setup JSON and use the CLI export:
  - Synthetic test settings: SaaS targets default to Microsoft 365 and Salesforce.
  - Cloud options: AWS account count and regions, Azure auth, OCI access, cloud test agents.
  - Syslog events/s and DNS lookups/s.
- **Topology PDF and CLI diagrams.**
  - The topology-only PDF is CLI only: `/api/topology` exists, but the page has no button for it.
  - CLI PDFs use the simpler `topology.py` diagram, not the page's views.
- **Layout.**
  - Drill-in views are fixed 1000×620 scenes. On short windows they are limited by height, so hiding details doesn't make them bigger.
  - At 1024×768 with details open, the legend wraps to two lines in data center views.
  - Switching to the Multi-cloud preset can push cards about 40px past the diagram edge for a moment during the glide.
- **Branding is approximate.**
  - The PDF palette in brand.py (green #2DB24A, navy) differs from the page's Infoblox green #00BD4D.
  - The official logo file, once added, is used in PDFs only.
- **Sizing gaps.** The KB publishes no disk sizing, and no CPU or RAM for SNMP Trap Receiver or Device Configuration Sync. The KB marks Flow Proxy Forwarding as beta.
- **samples/ is stale.** It was last regenerated in PR #5 (the from-app guide in PR #1), so it lags later PDF changes. Regenerate the CLI samples with `python3 run.py export examples/<file>.json --out samples`; the from-app guide comes from the app's Export menu.
- **Fonts.** The Inter font loads from Google Fonts; offline, the page falls back to system fonts.
- **Open questions for the Kentik SE** (most also appear in the guide PDF):
  - Which continuous test types the UA's Connectivity Test runs today.
  - Whether BGP Proxy is available.
  - Licensing names, entitlements and credit pricing per contract.
  - Whether UA sizing matches the UA resource docs referenced when sizing was added in PR #4. They never arrived, so the KB sizing table is used.

## Discussed but not built yet

- Two alternative takes are parked on the branch `explore/two-takes` (tag `takes-v1`): Take A, Network Canvas (the SE draws the customer's network and the Kentik plan follows from it), and Take B, Rollout Map (the deployment as waves of tasks for each customer team, with a customer workbook). They were merged in PR #13 and then reverted, because the owner chose to keep iterating on this app. A plain merge of that branch now does nothing; to bring the takes back to main, revert the revert commit. To look at them: `git switch explore/two-takes`, then `python3 takes/serve.py` (port 8770).
- A topology-only PDF in the app's Export menu. It was part of the original ask, and the endpoint already exists.
- The official Infoblox brand kit: real hex values in brand.py, plus the logo file, also used in the page.
- Drill-in views that grow into the space freed by hiding details. This was looked at in PR #10; they stayed fixed-size scenes.
- A systemd service (or similar) to keep the app running on a server. It was offered for a DigitalOcean droplet but not written.
