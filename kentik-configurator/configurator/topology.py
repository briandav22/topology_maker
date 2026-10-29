"""Topology diagram: one layout, drawn as SVG (web preview) or into a PDF (exports).

The layout produces simple primitives (rect, text, polyline) in a virtual
coordinate space with y growing downward. Renderers turn them into SVG or
reportlab canvas calls, so the preview and the PDF always match.
"""
import math
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth

from . import brand as B
from . import catalog as C
from . import model as M

FONT = "Helvetica"
FONT_B = "Helvetica-Bold"


def tw(s, size, bold=False):
    return stringWidth(s, FONT_B if bold else FONT, size)


def fit(s, size, width, bold=False):
    """Trim text with an ellipsis so it fits the given width."""
    if tw(s, size, bold) <= width:
        return s
    while s and tw(s + "…", size, bold) > width:
        s = s[:-1]
    return s + "…"


class Scene:
    def __init__(self):
        self.items = []
        self.w = 0
        self.h = 0

    def rect(self, x, y, w, h, fill=None, stroke=None, sw=1, r=6, dash=None):
        self.items.append(("rect", dict(x=x, y=y, w=w, h=h, fill=fill, stroke=stroke, sw=sw, r=r, dash=dash)))

    def text(self, x, y, s, size=9, color=B.INK, bold=False, anchor="start"):
        self.items.append(("text", dict(x=x, y=y, s=s, size=size, color=color, bold=bold, anchor=anchor)))

    def line(self, pts, color, sw=1.4, dash=None, arrow=True, arrow_start=False):
        self.items.append(("line", dict(pts=pts, color=color, sw=sw, dash=dash, arrow=arrow, arrow_start=arrow_start)))


# ---------------------------------------------------------------- layout

SITE_X, SITE_W = 20, 400
HUB_X, HUB_W = 600, 200
CLOUD_X, CLOUD_W = 900, 380
WIDTH = 1300
TOP = 20
BUS_BGP = 440
BUS_HTTPS = 455
BUS_SYNTH = 470
BUS_CLOUD = 880


def build(cfg):
    cfg = M.normalize(cfg)
    deep = cfg.get("detail", "deep") == "deep"
    sc = Scene()
    region = C.REGIONS[cfg["region"]]
    clouds = M.enabled_clouds(cfg)
    syn = cfg["synthetics"]
    compact = len(cfg["sites"]) > 3

    # --- Internet & SaaS box (top center) -------------------------------------
    y_cursor_center = TOP
    saas_box = None
    synth_sites = [s for s in cfg["sites"] if s["agent"] and "synth" in s["capabilities"]]
    show_saas = syn["enabled"] and (synth_sites or syn["saas_targets"] or syn["global_agents"] or syn["bgp_monitor"])
    if show_saas:
        bx, bw = HUB_X - 30, HUB_W + 60
        lines = []
        if syn["saas_targets"]:
            lines.append("Tests: " + ", ".join(syn["saas_targets"]))
        if syn["global_agents"]:
            lines.append(f"Kentik global agents: {int(syn['global_agents'])}")
        if syn["bgp_monitor"]:
            lines.append("BGP Monitor: hijacks, leaks, RPKI")
        if len(synth_sites) > 1 and syn["site_mesh"]:
            lines.append(f"Mesh between {len(synth_sites)} site agents" + (" (TCP 8877, UDP 9977)" if deep else ""))
        if deep:
            lines.append("HTTP(S) TCP 80/443 · ping, trace, DNS")
        bh = 40 + 13 * len(lines)
        sc.rect(bx, TOP, bw, bh, fill=B.WHITE, stroke=B.FLOW_COLORS["synth"], sw=1.2)
        sc.rect(bx, TOP, 5, bh, fill=B.FLOW_COLORS["synth"], r=2)
        sc.text(bx + 14, TOP + 18, "Internet & SaaS apps", 11, B.NAVY, True)
        sc.text(bx + 14, TOP + 31, "Synthetic test targets", 8, B.MUTED)
        for i, l in enumerate(lines):
            sc.text(bx + 14, TOP + 47 + 13 * i, fit(l, 8, bw - 24), 8, B.INK)
        saas_box = (bx, TOP, bw, bh)
        y_cursor_center = TOP + bh + 50

    # --- On-prem sites (left) --------------------------------------------------
    site_boxes = []
    y = TOP
    for s in cfg["sites"]:
        if not s["agent"]:
            continue
        h = draw_site(sc, s, SITE_X, y, deep, compact, cfg)
        site_boxes.append((s, SITE_X, y, SITE_W, h))
        y += h + 16
    # Branches with no agent: a small box each, with a line to the data center agent they send to
    for s in M.remote_branches(cfg):
        h = 40
        sc.rect(SITE_X, y, SITE_W, h, fill=B.WHITE, stroke=B.LINE, sw=1)
        sc.rect(SITE_X, y, 5, h, fill=B.TEAL, r=2)
        sc.text(SITE_X + 14, y + 17, fit(s["name"], 11, SITE_W - 140, True), 11, B.NAVY, True)
        sc.text(SITE_X + SITE_W - 12, y + 17, "BRANCH · NO AGENT", 7.5, B.TEAL, True, "end")
        note = (f"Devices send flow, traps and syslog across the WAN to the {s['send_to']} agent" if s["send_to"] else "Nothing collects this branch yet")
        sc.text(SITE_X + 14, y + 31, fit(note + (" (UDP 9995, 162, 514)" if deep and s["send_to"] else ""), 7.5, SITE_W - 28), 7.5, B.MUTED)
        dc = next((b for b in site_boxes if b[0]["name"] == s["send_to"]), None)
        if dc:
            gx = SITE_X - 10
            sc.line([(SITE_X, y + h / 2), (gx, y + h / 2), (gx, dc[2] + dc[4] - 14), (SITE_X, dc[2] + dc[4] - 14)], B.FLOW_COLORS["flow"], 1.1, dash=(4, 2))
        y += h + 12
    left_bottom = y

    # --- Clouds (right) --------------------------------------------------------
    cloud_boxes = []
    y = TOP
    for cid in clouds:
        h = draw_cloud(sc, cid, cfg["clouds"][cid], CLOUD_X, y, deep)
        cloud_boxes.append((cid, CLOUD_X, y, CLOUD_W, h))
        y += h + 16
    right_bottom = y

    # --- Kentik hub (center) ---------------------------------------------------
    hub_rows = ["Ingest and enrichment", "Kentik Data Engine (KDE)", "Data Explorer, Kentik Map", "NMS, Synthetics, Cloud, alerts", "AI Advisor and APIs"]
    hub_h = 74 + 16 * len(hub_rows) + (34 if deep else 0)
    content_bottom = max(left_bottom, right_bottom, y_cursor_center + hub_h + 20)
    hub_y = max(y_cursor_center, (TOP + content_bottom) / 2 - hub_h / 2)
    if saas_box:
        hub_y = max(hub_y, saas_box[1] + saas_box[3] + 50)
    sc.rect(HUB_X, hub_y, HUB_W, hub_h, fill=B.NAVY, stroke=None, r=10)
    sc.rect(HUB_X, hub_y, HUB_W, 4, fill=B.GREEN, r=2)
    sc.text(HUB_X + HUB_W / 2, hub_y + 26, "Kentik SaaS", 14, B.WHITE, True, "middle")
    sc.text(HUB_X + HUB_W / 2, hub_y + 41, "Customer's Kentik account", 8.5, "#BFD0E6", False, "middle")
    sc.text(HUB_X + HUB_W / 2, hub_y + 54, region["label"], 8, B.GREEN, True, "middle")
    for i, r in enumerate(hub_rows):
        yy = hub_y + 66 + 16 * i
        sc.rect(HUB_X + 12, yy, HUB_W - 24, 13, fill="#183358", r=3)
        sc.text(HUB_X + HUB_W / 2, yy + 9.5, r, 7.5, B.WHITE, False, "middle")
    if deep:
        yy = hub_y + 66 + 16 * len(hub_rows) + 6
        sc.text(HUB_X + HUB_W / 2, yy + 8, f"*.{region['domain']} · TLS 1.2+ · AES-256", 7.2, "#BFD0E6", False, "middle")
        sc.text(HUB_X + HUB_W / 2, yy + 20, "SOC 2 Type II · metadata only", 7.2, "#BFD0E6", False, "middle")
    hub_mid = hub_y + hub_h / 2

    # --- Connections: sites -> Kentik (HTTPS bus) -----------------------------
    if site_boxes:
        ys = []
        for (s, x, yy, w, h) in site_boxes:
            sy = yy + 34
            ys.append(sy)
            sc.line([(x + w, sy), (BUS_HTTPS, sy)], B.FLOW_COLORS["https"], 1.6, arrow=False)
        lo, hi = min(ys + [hub_mid - 10]), max(ys + [hub_mid - 10])
        sc.line([(BUS_HTTPS, lo), (BUS_HTTPS, hi)], B.FLOW_COLORS["https"], 1.6, arrow=False)
        sc.line([(BUS_HTTPS, hub_mid - 10), (HUB_X, hub_mid - 10)], B.FLOW_COLORS["https"], 1.6)
        lbl = "HTTPS, outbound" + (" TCP 443" if deep else "")
        sc.rect(HUB_X - tw(lbl, 7.5, True) - 16, hub_mid - 25, tw(lbl, 7.5, True) + 8, 12, fill=B.WHITE, r=2)
        sc.text(HUB_X - 12, hub_mid - 16, lbl, 7.5, B.FLOW_COLORS["https"], True, "end")

    # --- BGP from edge routers (direct) ----------------------------------------
    bgp_sites = [b for b in site_boxes if b[0].get("bgp")]
    if bgp_sites:
        ys = []
        for (s, x, yy, w, h) in bgp_sites:
            sy = yy + 50
            ys.append(sy)
            sc.line([(x + w, sy), (BUS_BGP, sy)], B.FLOW_COLORS["bgp"], 1.1, dash=(3, 2), arrow=False)
        target = hub_mid + 18
        lo, hi = min(ys + [target]), max(ys + [target])
        sc.line([(BUS_BGP, lo), (BUS_BGP, hi)], B.FLOW_COLORS["bgp"], 1.1, dash=(3, 2), arrow=False)
        sc.line([(BUS_BGP, target), (HUB_X, target)], B.FLOW_COLORS["bgp"], 1.1, dash=(3, 2))
        lbl = "BGP peering (direct)" + (" TCP 179" if deep else "")
        sc.rect(HUB_X - tw(lbl, 7.5, True) - 16, target + 4, tw(lbl, 7.5, True) + 8, 12, fill=B.WHITE, r=2)
        sc.text(HUB_X - 12, target + 13, lbl, 7.5, B.FLOW_COLORS["bgp"], True, "end")

    # --- Synthetics: sites -> Internet & SaaS (synth bus) ----------------------
    if saas_box and synth_sites:
        ys = []
        for (s, x, yy, w, h) in site_boxes:
            if "synth" in s["capabilities"]:
                sy = yy + 20
                ys.append(sy)
                sc.line([(x + w, sy), (BUS_SYNTH, sy)], B.FLOW_COLORS["synth"], 1.2, dash=(5, 3), arrow=False)
        top_y = saas_box[1] + saas_box[3] / 2
        sc.line([(BUS_SYNTH, max(ys)), (BUS_SYNTH, top_y)], B.FLOW_COLORS["synth"], 1.2, dash=(5, 3), arrow=False)
        sc.line([(BUS_SYNTH, top_y), (saas_box[0], top_y)], B.FLOW_COLORS["synth"], 1.2, dash=(5, 3))
    if saas_box:
        # the Kentik global agents and test results report back to Kentik
        sc.line([(HUB_X + HUB_W / 2, saas_box[1] + saas_box[3]), (HUB_X + HUB_W / 2, hub_y)], B.FLOW_COLORS["synth"], 1.2, dash=(5, 3))
        sc.text(HUB_X + HUB_W / 2 + 6, saas_box[1] + saas_box[3] + 28, "Test results", 7.5, "#9A7608", True)

    # --- Clouds -> Kentik (read-only) -------------------------------------------
    if cloud_boxes:
        ys = []
        for (cid, x, yy, w, h) in cloud_boxes:
            cy = yy + 34
            ys.append(cy)
            sc.line([(x, cy), (BUS_CLOUD, cy)], B.FLOW_COLORS["pull"], 1.6, arrow=False)
        lo, hi = min(ys + [hub_mid]), max(ys + [hub_mid])
        sc.line([(BUS_CLOUD, lo), (BUS_CLOUD, hi)], B.FLOW_COLORS["pull"], 1.6, arrow=False)
        sc.line([(BUS_CLOUD, hub_mid), (HUB_X + HUB_W, hub_mid)], B.FLOW_COLORS["pull"], 1.6)
        lbl = "Kentik reads, read-only"
        sc.rect(HUB_X + HUB_W + 8, hub_mid - 19, tw(lbl, 7.5, True) + 8, 12, fill=B.WHITE, r=2)
        sc.text(HUB_X + HUB_W + 12, hub_mid - 10, lbl, 7.5, "#007A82", True)
        cloud_agents = [b for b in cloud_boxes if cfg["clouds"][b[0]].get("test_agent")]
        if saas_box and cloud_agents:
            ys = [yy + 20 for (cid, x, yy, w, h) in cloud_agents]
            bx = BUS_CLOUD + 18
            for (cid, x, yy, w, h) in cloud_agents:
                sc.line([(x, yy + 20), (bx, yy + 20)], B.FLOW_COLORS["synth"], 1.2, dash=(5, 3), arrow=False)
            top_y = saas_box[1] + saas_box[3] / 2
            sc.line([(bx, max(ys)), (bx, top_y)], B.FLOW_COLORS["synth"], 1.2, dash=(5, 3), arrow=False)
            sc.line([(bx, top_y), (saas_box[0] + saas_box[2], top_y)], B.FLOW_COLORS["synth"], 1.2, dash=(5, 3))

    if not site_boxes and not cloud_boxes:
        sc.text(SITE_X, TOP + 30, "Add a data center, branch or cloud to see the topology.", 11, B.MUTED)

    # --- Legend ------------------------------------------------------------------
    bottom = max(content_bottom, hub_y + hub_h + 20, (saas_box[1] + saas_box[3] + 20) if saas_box else 0)
    used = []
    if site_boxes:
        used.append(("https", "To Kentik over HTTPS", None))
    if bgp_sites:
        used.append(("bgp", "BGP peering", (3, 2)))
    if cloud_boxes:
        used.append(("pull", "Kentik reads cloud logs and metadata", None))
    if saas_box:
        used.append(("synth", "Synthetic tests", (5, 3)))
    lx = SITE_X
    ly = bottom + 8
    for key, label, dash in used:
        sc.line([(lx, ly), (lx + 26, ly)], B.FLOW_COLORS[key], 1.6, dash=dash, arrow=False)
        sc.text(lx + 32, ly + 3, label, 8, B.MUTED)
        lx += 52 + tw(label, 8)
    sc.text(WIDTH - 20, ly + 3, "Only outbound connections from customer networks. No inbound access from the Internet.", 7.5, B.MUTED, False, "end")
    sc.w, sc.h = WIDTH, ly + 14
    return sc


def draw_site(sc, s, x, y, deep, compact, cfg=None):
    caps = s["capabilities"]
    size = M.site_sizing(s, cfg)
    kind = "Data center" if s["kind"] == "dc" else "Branch office"
    accent = B.BLUE if s["kind"] == "dc" else B.TEAL
    cols = 2 if compact and len(caps) > 3 else 1
    rows = math.ceil(len(caps) / cols) if caps else 1
    chip_h = 17 if not deep or cols == 2 else 20
    ua_h = 40 + rows * (chip_h + 3) + 4
    dev_rows = ["Routers, switches, firewalls, load balancers"]
    if "dns" in caps:
        dev_rows.append("DNS servers (DNSTAP)")
    h = 30 + max(ua_h, 22 + 16 * len(dev_rows) + (14 if s.get("bgp") else 0)) + 12

    sc.rect(x, y, SITE_W, h, fill=B.WHITE, stroke=B.LINE, sw=1)
    sc.rect(x, y, 5, h, fill=accent, r=2)
    title = s["name"] + (f"  ·  {s['location']}" if s.get("location") else "")
    sc.text(x + 14, y + 19, fit(title, 11, SITE_W - 120, True), 11, B.NAVY, True)
    sc.text(x + SITE_W - 12, y + 19, kind.upper(), 7.5, accent, True, "end")

    # devices
    dx, dy, dw = x + 14, y + 30, 128
    dh = 22 + 16 * len(dev_rows) + (14 if s.get("bgp") else 0)
    sc.rect(dx, dy, dw, dh, fill=B.PANEL, stroke=None, r=4)
    sc.text(dx + 8, dy + 14, "Network devices", 8.5, B.NAVY, True)
    for i, r in enumerate(dev_rows):
        sc.text(dx + 8, dy + 29 + 16 * i, fit(r, 7.5, dw - 12), 7.5, B.INK)
    if s.get("bgp"):
        sc.text(dx + 8, dy + 29 + 16 * len(dev_rows), "Edge routers peer BGP", 7.2, B.FLOW_COLORS["bgp"], True)
    # arrow devices -> agent
    ux = x + 160
    uw = SITE_W - 160 - 12
    sc.line([(dx + dw, dy + dh / 2), (ux, dy + dh / 2)], B.MUTED, 1.1)

    # agent
    uy = y + 30
    sc.rect(ux, uy, uw, ua_h, fill="#EEF4FC" if s["kind"] == "dc" else "#E9F7F8", stroke=accent, sw=1.1)
    sc.text(ux + 10, uy + 15, "Universal Agent", 10, B.NAVY, True)
    host = "Docker host" if s["install"] == "docker" else "Linux host or VM"
    sub = host + (f" · plan {size['rec_cpu']} vCPU / {size['rec_ram']} GB RAM" if deep and caps else "")
    sc.text(ux + 10, uy + 28, fit(sub, 7.5, uw - 16), 7.5, B.MUTED)
    cw = (uw - 20 - (cols - 1) * 6) / cols
    for i, cid in enumerate(caps):
        cap = C.CAPABILITIES[cid]
        r, c = divmod(i, cols)
        cx = ux + 10 + c * (cw + 6)
        cy = uy + 38 + r * (chip_h + 3)
        col = B.FLOW_COLORS[cap["color"]]
        sc.rect(cx, cy, cw, chip_h, fill=B.WHITE, stroke=col, sw=0.9, r=3)
        sc.rect(cx, cy, 3.5, chip_h, fill=col, r=1.5)
        if deep and cols == 1:
            sc.text(cx + 9, cy + 13, cap["name"], 8, B.INK, True)
            sc.text(cx + cw - 6, cy + 13, cap["port_label"], 7, B.MUTED, False, "end")
        else:
            short = {"flow": "Flow Proxy", "trap": "Trap Receiver", "ssh": "Config Sync", "synth": "Connectivity Test"}.get(cid, cap["name"])
            sc.text(cx + 9, cy + chip_h / 2 + 3, fit(short, 7.5, cw - 12, True), 7.5, B.INK, True)
    if not caps:
        sc.text(ux + 10, uy + 50, "No capabilities selected", 8, B.MUTED)
    return h


def draw_cloud(sc, cid, cl, x, y, deep):
    info = C.CLOUDS[cid]
    feats = [info["features"][f] for f in cl["features"]]
    rows_feat = math.ceil(len(feats) / 2)
    h = 30 + 46 + 8 + rows_feat * 13 + (16 if cl.get("test_agent") else 0) + (12 if deep else 0) + 8
    sc.rect(x, y, CLOUD_W, h, fill=B.WHITE, stroke=B.LINE, sw=1)
    sc.rect(x + CLOUD_W - 5, y, 5, h, fill=B.TEAL, r=2)
    extra = ""
    if cl.get("accounts", 1) > 1:
        extra = f"  ·  {cl['accounts']} {'accounts' if cid == 'aws' else 'subscriptions' if cid == 'azure' else 'projects' if cid == 'gcp' else 'tenancies'}"
    sc.text(x + 12, y + 19, info["name"] + extra, 11, B.NAVY, True)
    sc.text(x + CLOUD_W - 14, y + 19, "AGENTLESS", 7.5, B.TEAL, True, "end")
    # pipeline
    n = len(info["pipeline"])
    gap = 16
    bw = (CLOUD_W - 24 - 8 - gap * (n - 1)) / n
    for i, p in enumerate(info["pipeline"]):
        bx = x + 12 + i * (bw + gap)
        sc.rect(bx, y + 30, bw, 40, fill="#E9F7F8", stroke=None, r=4)
        words = p.split(" ")
        l1, l2 = "", ""
        for w_ in words:
            if tw((l1 + " " + w_).strip(), 7.8, True) <= bw - 8 and not l2:
                l1 = (l1 + " " + w_).strip()
            else:
                l2 = (l2 + " " + w_).strip()
        sc.text(bx + bw / 2, y + 47, l1, 7.8, B.NAVY, True, "middle")
        if l2:
            sc.text(bx + bw / 2, y + 59, fit(l2, 7.8, bw - 6, True), 7.8, B.NAVY, True, "middle")
        if i < n - 1:
            sc.line([(bx + bw + 2, y + 50), (bx + bw + gap - 2, y + 50)], B.TEAL, 1.1)
    fy = y + 84
    for i, f in enumerate(feats):
        r, c = divmod(i, 2)
        fx = x + 12 + c * ((CLOUD_W - 32) / 2)
        sc.rect(fx, fy + r * 13 - 6, 5, 5, fill=B.TEAL, r=1)
        sc.text(fx + 9, fy + r * 13, fit(f, 7.5, (CLOUD_W - 32) / 2 - 12), 7.5, B.INK)
    yy = fy + rows_feat * 13
    if deep:
        g = {"aws": "IAM role trusts Kentik, ExternalId = Company ID",
             "azure": "Reader + Storage Blob Data Reader" + (" via Kentik app" if cl.get("auth") != "custom" else " via your app reg"),
             "gcp": "Kentik SA: Pub/Sub Subscriber + Viewer, Compute Viewer",
             "oci": "Cross-tenancy policy (READ)" if cl.get("access") != "user" else "API key user + group (READ)"}[cid]
        sc.text(x + 12, yy + 2, fit(g, 7.3, CLOUD_W - 30), 7.3, B.MUTED)
        yy += 12
    if cl.get("test_agent"):
        sc.rect(x + 12, yy + 2, 196, 13, fill="#FBF3DA", stroke=B.FLOW_COLORS["synth"], sw=0.8, r=3)
        sc.text(x + 18, yy + 11.5, "Universal Agent on a VM (test point)", 7.3, "#7A5D05", True)
    return h


# ---------------------------------------------------------------- renderers

def to_svg(sc, pad=10):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {sc.w + 2 * pad} {sc.h + 2 * pad}" '
           f'font-family="Helvetica, Arial, sans-serif">',
           '<defs>']
    colors = sorted({it[1]["color"] for it in sc.items if it[0] == "line"})
    for c in colors:
        cid = c.lstrip("#")
        out.append(f'<marker id="a{cid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                   f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>')
    out.append('</defs>')
    for kind, a in sc.items:
        if kind == "rect":
            dash = f' stroke-dasharray="{a["dash"][0]},{a["dash"][1]}"' if a["dash"] else ""
            out.append(f'<rect x="{a["x"]:.1f}" y="{a["y"]:.1f}" width="{a["w"]:.1f}" height="{a["h"]:.1f}" rx="{a["r"]}" '
                       f'fill="{a["fill"] or "none"}" stroke="{a["stroke"] or "none"}" stroke-width="{a["sw"]}"{dash}/>')
        elif kind == "text":
            weight = ' font-weight="bold"' if a["bold"] else ""
            out.append(f'<text x="{a["x"]:.1f}" y="{a["y"]:.1f}" font-size="{a["size"]}" fill="{a["color"]}" '
                       f'text-anchor="{a["anchor"]}"{weight}>{escape(a["s"])}</text>')
        elif kind == "line":
            pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in a["pts"])
            dash = f' stroke-dasharray="{a["dash"][0]},{a["dash"][1]}"' if a["dash"] else ""
            cid = a["color"].lstrip("#")
            mk = f' marker-end="url(#a{cid})"' if a["arrow"] else ""
            out.append(f'<polyline points="{pts}" fill="none" stroke="{a["color"]}" stroke-width="{a["sw"]}"{dash}{mk}/>')
    out.append("</svg>")
    return "\n".join(out)


def draw_on_canvas(c, sc, ox, oy, scale):
    """Draw the scene with its top-left at (ox, oy) in PDF points (oy measured from the page bottom up to the scene top)."""
    def X(x):
        return ox + x * scale

    def Y(y):
        return oy - y * scale

    for kind, a in sc.items:
        if kind == "rect":
            c.saveState()
            if a["fill"]:
                c.setFillColor(HexColor(a["fill"]))
            if a["stroke"]:
                c.setStrokeColor(HexColor(a["stroke"]))
                c.setLineWidth(a["sw"] * scale)
            if a["dash"]:
                c.setDash([d * scale for d in a["dash"]])
            r = min(a["r"], a["w"] / 2, a["h"] / 2) * scale
            c.roundRect(X(a["x"]), Y(a["y"] + a["h"]), a["w"] * scale, a["h"] * scale, r,
                        stroke=1 if a["stroke"] else 0, fill=1 if a["fill"] else 0)
            c.restoreState()
        elif kind == "text":
            c.saveState()
            c.setFillColor(HexColor(a["color"]))
            c.setFont(FONT_B if a["bold"] else FONT, a["size"] * scale)
            fn = {"start": c.drawString, "middle": c.drawCentredString, "end": c.drawRightString}[a["anchor"]]
            fn(X(a["x"]), Y(a["y"]), a["s"])
            c.restoreState()
        elif kind == "line":
            c.saveState()
            c.setStrokeColor(HexColor(a["color"]))
            c.setLineWidth(a["sw"] * scale)
            if a["dash"]:
                c.setDash([d * scale for d in a["dash"]])
            p = c.beginPath()
            pts = a["pts"]
            p.moveTo(X(pts[0][0]), Y(pts[0][1]))
            for x, y in pts[1:]:
                p.lineTo(X(x), Y(y))
            c.drawPath(p, stroke=1, fill=0)
            if a["arrow"] and len(pts) >= 2:
                (x1, y1), (x2, y2) = pts[-2], pts[-1]
                ang = math.atan2(-(y2 - y1), x2 - x1)
                L = 7 * scale
                tip = (X(x2), Y(y2))
                c.setDash([])
                c.setFillColor(HexColor(a["color"]))
                ap = c.beginPath()
                ap.moveTo(*tip)
                ap.lineTo(tip[0] - L * math.cos(ang - 0.4), tip[1] - L * math.sin(ang - 0.4))
                ap.lineTo(tip[0] - L * math.cos(ang + 0.4), tip[1] - L * math.sin(ang + 0.4))
                ap.close()
                c.drawPath(ap, stroke=0, fill=1)
            c.restoreState()


class TopologyFlowable:
    """A platypus flowable that draws the topology scaled to the frame width."""

    def __new__(cls, sc, max_w, max_h):
        from reportlab.platypus import Flowable

        class _F(Flowable):
            def __init__(self):
                super().__init__()
                self.scale = min(max_w / sc.w, max_h / sc.h)
                self.width = sc.w * self.scale
                self.height = sc.h * self.scale

            def draw(self):
                draw_on_canvas(self.canv, sc, 0, self.height, self.scale)

        return _F()
