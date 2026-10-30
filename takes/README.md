# Two new takes on the Kentik deployment tool

This folder holds two new versions of the tool, for review. They do not change the current app. Each take is a complete application with its own diagram, panels, checks and exports for the customer.

## Start them

```bash
python3 takes/serve.py
```

Your browser opens on http://127.0.0.1:8770. That page compares the takes and links to them:

- Take A, Network Canvas: http://127.0.0.1:8770/canvas/
- Take B, Rollout Map: http://127.0.0.1:8770/rollout/

The server uses the Python standard library only. It does not need reportlab. Use `--port 9100` to change the port, or `--no-browser` to keep the browser closed.

## The thinking

The current app starts from Kentik's reference design. The SE picks the deployments in scope and sets counts and switches. The result explains how Kentik works, and it is good at that.

An SE team also gets two other questions, and the reference design answers neither of them well:

1. "What does Kentik look like in *our* network?" The customer wants to see their own sites, their WAN links and their firewalls. They want to know which rules to open, and how much telemetry crosses a thin WAN link.
2. "How do we get live, and who does what?" A deployment stalls on firewall change requests, host builds, IAM approvals and device configuration. These belong to five different customer teams.

Each take answers one of these questions, and each starts from a different place:

| | Current app | Take A: Network Canvas | Take B: Rollout Map |
|---|---|---|---|
| Starts from | Kentik's reference design | The customer's network | The customer's teams and dates |
| The SE does | Sets counts and switches | Draws sites and links | Lists sites, puts them in waves |
| The diagram | Fixed scenes, drill-ins | Free canvas with lenses | Transit map with a timeline |
| Scale | Up to 6 DCs and 10 branches | Any number, plus groups (×N) | Any number, plus groups (×N) |
| The customer gets | HTML page, guide PDF | Interactive view, firewall CSV, build sheet, brief | A workbook to track the rollout |

## Take A: Network Canvas

**Idea:** draw the customer's network as it is. Kentik plans itself on top of the drawing.

The SE adds data centers, campuses, branches, clouds and SaaS apps, and draws the WAN links between them. Each site has its network devices (routers, switches, firewalls, load balancers and DNS servers). The SE does not place Kentik parts by hand. The engine (`derive()` in `canvas/app.js`) works out these items, and it updates them at each change:

- Where Universal Agents go. Data centers and campuses get an agent. A branch sends its data to the nearest agent along the WAN links, or to the agent that you choose.
- The path of each kind of data, hop by hop along the links.
- The firewall rules, grouped by the firewall that must allow them. This includes the rules at both ends of a WAN path.
- The telemetry on each WAN link, as a share of the link capacity.
- The size of each agent host, from the same KB figures as the current app, including the load from the branches that it serves.

**Things to try (5 minutes):**

1. Open the canvas. It shows the "Retail chain" starter: two data centers, an HQ, 150 stores in two groups, a warehouse, AWS, Azure and SaaS tests.
2. Click the lenses at the bottom (or press 1 to 0). Flow, Metrics and Events show moving data. Firewalls shows a rule count on each site. WAN load colors each link.
3. Hover over or click "Stores East". Only its paths stay bright.
4. Open the Checks tab. The warehouse sends 5.3 Mbps over a 10 Mbps link. Click "Put an agent at Denver warehouse": the WAN load goes away, and the rules move. Press Ctrl+Z or Cmd+Z to undo.
5. Click "Branch group" on the left. It links to the nearest data center by itself. Change "Sites like this" to 200, and see the sizing and the WAN load change.
6. Drag from the small link handle on a card's right edge to another card to draw a link.
7. Open "Customer pack": the customer view (one HTML file, interactive, no editing), the firewall rules CSV, the agent build sheet CSV and a printable brief.

**New in this take:** the customer's own topology, multi-hop paths, rules for each firewall, WAN load, groups of identical sites (×N), checks with one-click fixes, undo and redo, "Paste list" for many sites at once, and automatic layout ("Tidy").

## Take B: Rollout Map

**Idea:** a deployment is a project. Show the customer how it goes live, and who does each part.

The SE lists the sites and clouds on the left and puts each one in a wave (for example "Prove value", "Data centers and cloud", "Branches", "Tests and handover"). The engine (`derive()` in `rollout/app.js`) then makes the tasks for each team from the design:

- Security team: HTTPS 443 out to the Kentik hosts, the WAN rules for each branch group, the test ports.
- Server team: one agent host per site, with its size.
- Network team: flow export, SNMP discovery, traps and syslog, BGP.
- DNS team: DNSTAP from the DNS servers (for example Infoblox NIOS).
- Cloud team: flow logs and read-only access for each cloud.
- Infoblox + Kentik: kickoff, portal, agent install, cloud exports, tests, validation and handover.

Each task has its steps, ports or policies from the KB facts, the tasks that it waits for, and a typical effort.

There are three views:

- **Map:** a transit map. Each kind of data is a colored line into Kentik, and each site is a station. The timeline at the bottom plays the rollout wave by wave: planned lines are dotted, lines in the current wave move, and live lines are solid. "Progress" shows the real status from the tasks instead of the plan.
- **Plan:** the tasks by team and wave, with plan checks. The checks find a branch that goes live before its agent, a wave too short for its chain of work, many firewall changes, and tests without enough test agents.
- **Workbook:** what the customer gets. Each team sees its tasks with the steps, and ticks them off.

**Things to try (5 minutes):**

1. Open the Rollout Map. It shows the "Enterprise rollout in four waves" starter.
2. Press play under the map. Watch the coverage numbers at the top grow, wave by wave.
3. Open Plan. The first check says that the Denver warehouse goes live before its agent. Click the fix button.
4. Click any task card. The right panel shows how to do it, what it waits for, and its status buttons.
5. Open Workbook and tick a task. Go back to Map and pick "Progress".
6. Open "Send to customer", then "Customer workbook". The file opens in any browser, with no app. The customer's teams tick tasks there, and "Send progress back" gives them a small JSON file. You import that file with "Import the customer's progress", and the map shows their status.

## What both takes share

- **One source of facts.** `common/facts.py` turns `configurator/catalog.py` into one JSON object, which the server puts into each page. The current app keeps a second copy of some facts in `ui/d5.js`. The takes do not, so a fact changes in one place only.
- **One HTML file per take**, with no build step. The server joins `index.html`, `app.css`, `app.js`, the icons and the facts at each request, so an edit shows on reload.
- **Infoblox branding**, light and dark themes, and the same icons as the current app (`common/icons.svg`).
- **The current app's setups.** Both takes open the three files in `examples/` from the Starters menu, and they import any setup JSON that the current app exports.
- **Link options**, for demos and for tests: for example `canvas/#starter=retail&lens=firewall&tab=rules`, or `rollout/#starter=pov&view=plan&pos=2&theme=dark`.
- **Local save.** Each take keeps your work in the browser's local storage. The design or plan file (.json) saves it to disk.

## Decisions that I made without you

- **Two takes in folders, on one branch.** Both takes and the current app run side by side from one checkout, so you can compare them. The branch is `explore/two-takes`. I committed it locally. I did not push it.
- **No PDF engine in the takes.** They print through the browser (take A: "Design brief", take B: "Print the workbook"). They do not use reportlab. If you choose a take, its PDF can come back through `configurator/pdf.py`.
- **Planning numbers are marked as estimates.** Take A's WAN load uses rough numbers that are not from the KB: 60 bytes per flow record, 300 bytes per syslog event, 1,500 bit/s of SNMP per device. Take B's effort in days is typical, not a promise. The pages say so where the numbers show.
- **Branch groups.** One card or station stands for many identical sites. Load, rules, tasks and agent counts multiply. A group of 80 stores is one card, not 80.
- **Default capabilities** are the same as in the current app (data center: Flow, SNMP/ST, traps, syslog; branch agent: Flow, SNMP/ST, Connectivity Test). Take A also turns on DNS OTT Tap at a site with DNS servers.

## Limits and known issues

- The takes are prototypes for review. They have no test suite. I tested them in Chrome: every starter, every lens or view, the exports, undo and redo, and the light and dark themes.
- Take A works best on a laptop or larger screen. On a phone, it works, but it is cramped.
- Take B's map shrinks to fit when a plan has many stations in one region.
- Take B's dates use weeks per wave. They do not use holidays or per-task dates.
- Nothing here has a login. The server listens on 127.0.0.1 only.
- Open questions for Kentik are the same as in the current app (BGP Proxy availability, which test types the UA runs, licensing). Both takes show them.

## If you pick one

The two takes can also merge: the canvas is a better way to *design*, and the rollout plan is a better way to *deliver*. A merged tool can use the canvas as its editor and make the waves and the team tasks from the drawing. Good next steps for either take:

1. Move the take into the main app, and replace the duplicated facts in `ui/d5.js` with the facts bundle.
2. Add the guide PDF back for the take's own content, with `configurator/pdf.py`.
3. Ask two or three SEs to use it on a real customer call, and watch where they stop.

## Files

```
takes/
  serve.py              server for both takes and the comparison page (stdlib only)
  index.html            comparison page
  common/facts.py       catalog.py as one JSON bundle, plus examples/
  common/icons.svg      icons from the current app, plus interface icons
  canvas/               Take A: index.html, app.css, app.js
  rollout/              Take B: index.html, app.css, app.js
```
