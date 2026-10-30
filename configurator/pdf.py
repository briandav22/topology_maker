"""PDF exports with Infoblox branding: a one-page topology and a full deployment guide."""
import io
from xml.sax.saxutils import escape as _esc

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter, landscape, TABLOID
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, NextPageTemplate, KeepTogether, Preformatted, CondPageBreak, Flowable)

from . import brand as B
from . import catalog as C
from . import model as M
from . import topology as T


def esc(s):
    return _esc(str(s))


# ---------------------------------------------------------------- branding

def draw_wordmark(c, x, y, size=18, color=B.NAVY, accent=B.GREEN):
    """Infoblox wordmark: the official logo if present, otherwise a drawn stand-in. (x, y) is the baseline start."""
    logo = B.logo_file()
    if logo:
        from reportlab.lib.utils import ImageReader
        img = ImageReader(logo)
        iw, ih = img.getSize()
        h = size * 1.15
        c.drawImage(img, x, y - size * 0.2, width=h * iw / ih, height=h, mask="auto")
        return h * iw / ih
    s = size * 0.78
    c.saveState()
    c.setFillColor(HexColor(accent))
    c.roundRect(x, y - 1, s, s, s * 0.22, stroke=0, fill=1)
    c.setFillColor(HexColor(color))
    c.roundRect(x + s * 0.32, y - 1 + s * 0.32, s * 0.36, s * 0.36, s * 0.08, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", size)
    c.drawString(x + s + size * 0.3, y, "infoblox")
    w = s + size * 0.3 + c.stringWidth("infoblox", "Helvetica-Bold", size)
    c.restoreState()
    return w


def page_chrome(c, doc_title, cfg, page_w, page_h, page_no=None):
    """Header band and footer used on every branded page."""
    c.saveState()
    c.setFillColor(HexColor(B.NAVY))
    c.rect(0, page_h - 44, page_w, 44, stroke=0, fill=1)
    c.setFillColor(HexColor(B.GREEN))
    c.rect(0, page_h - 47, page_w, 3, stroke=0, fill=1)
    draw_wordmark(c, 36, page_h - 29, 15, color=B.WHITE)
    c.setFillColor(HexColor(B.WHITE))
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(page_w - 36, page_h - 22, doc_title)
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#BFD0E6"))
    c.drawRightString(page_w - 36, page_h - 34, f"Prepared for {cfg['customer']}  ·  {B.PRODUCT_LINE}")
    c.setStrokeColor(HexColor(B.LINE))
    c.setLineWidth(0.6)
    c.line(36, 34, page_w - 36, 34)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(HexColor(B.MUTED))
    c.drawString(36, 22, B.FOOTER_NOTE)
    right = cfg["date"] + (f"   Page {page_no}" if page_no else "")
    c.drawRightString(page_w - 36, 22, right)
    c.restoreState()


# ---------------------------------------------------------------- topology PDF

def decode_images(images):
    """Explorer views sent by the browser: [{"title", "png": "data:image/png;base64,..."}] -> [(title, ImageReader)]."""
    import base64
    from reportlab.lib.utils import ImageReader
    out = []
    for im in images or []:
        data = str(im.get("png") or "")
        if "," in data:
            data = data.split(",", 1)[1]
        try:
            out.append((str(im.get("title") or ""), ImageReader(io.BytesIO(base64.b64decode(data)))))
        except Exception:
            continue
    return out


def topology_pdf(cfg, images=None):
    cfg = M.normalize(cfg)
    shots = decode_images(images)
    if shots:
        return _topology_pages(cfg, shots)
    sc = T.build(cfg)
    buf = io.BytesIO()
    from reportlab.pdfgen import canvas
    # Pick the smallest page that keeps the diagram readable.
    for size in (landscape(letter), landscape(TABLOID)):
        pw, ph = size
        avail_w, avail_h = pw - 72, ph - 47 - 34 - 70
        scale = min(avail_w / sc.w, avail_h / sc.h)
        if scale >= 0.55:
            break
    if scale < 0.55:  # very large designs: grow the page height so text stays legible
        scale = 0.6
        pw = max(landscape(TABLOID)[0], sc.w * scale + 72)
        ph = sc.h * scale + 47 + 34 + 70
    c = canvas.Canvas(buf, pagesize=(pw, ph))
    c.setTitle(f"Kentik deployment topology - {cfg['customer']}")
    c.setAuthor(cfg["prepared_by"] or B.NAME)
    c.setSubject("Kentik deployment topology")
    page_chrome(c, "Kentik deployment topology", cfg, pw, ph)
    # title block
    c.setFillColor(HexColor(B.NAVY))
    c.setFont("Helvetica-Bold", 16)
    c.drawString(36, ph - 74, f"{cfg['customer']}: Kentik deployment topology")
    counts = M.summary_counts(cfg)
    bits = []
    if counts["dcs"]:
        bits.append(f"{counts['dcs']} data center{'s' if counts['dcs'] != 1 else ''}")
    if counts["branches"]:
        bits.append(f"{counts['branches']} branch{'es' if counts['branches'] != 1 else ''}")
    if counts["agents"]:
        bits.append(f"{counts['agents']} Universal Agent{'s' if counts['agents'] != 1 else ''}")
    if counts["clouds"]:
        bits.append(", ".join(C.CLOUDS[x]["name"] for x in counts["clouds"]))
    bits.append(f"Kentik {cfg['region']} region")
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor(B.MUTED))
    detail = "Deep dive (ports and permissions)" if cfg["detail"] == "deep" else "High level"
    c.drawString(36, ph - 88, "  ·  ".join(bits) + f"   |   {detail}")
    w, h = sc.w * scale, sc.h * scale
    ox = (pw - w) / 2
    top = ph - 100 - max(0, (avail_h - h) / 3)
    T.draw_on_canvas(c, sc, ox, top, scale)
    c.showPage()
    c.save()
    return buf.getvalue()


def _topology_pages(cfg, shots):
    """One landscape page per explorer view, drawn exactly as on screen."""
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    pw, ph = landscape(letter)
    c = canvas.Canvas(buf, pagesize=(pw, ph))
    c.setTitle(f"Kentik deployment topology - {cfg['customer']}")
    c.setAuthor(cfg["prepared_by"] or B.NAME)
    for n, (title, img) in enumerate(shots, 1):
        page_chrome(c, "Kentik deployment topology", cfg, pw, ph, page_no=n)
        c.setFillColor(HexColor(B.NAVY))
        c.setFont("Helvetica-Bold", 15)
        c.drawString(36, ph - 72, title if n > 1 else f"{cfg['customer']}: Kentik deployment topology")
        draw_shot(c, img, 36, 44, pw - 72, ph - 47 - 44 - 40)
        c.showPage()
    c.save()
    return buf.getvalue()


def draw_shot(c, img, x, y, w, h):
    iw, ih = img.getSize()
    s = min(w / iw, h / ih)
    dw, dh = iw * s, ih * s
    c.setStrokeColor(HexColor(B.LINE))
    c.setLineWidth(0.6)
    c.roundRect(x + (w - dw) / 2 - 1, y + (h - dh) / 2 - 1, dw + 2, dh + 2, 6, stroke=1, fill=0)
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)


class ShotFlowable(Flowable):
    """An explorer view (PNG) scaled to fit the frame, with a hairline border."""

    def __init__(self, img, w, h):
        super().__init__()
        iw, ih = img.getSize()
        s = min(w / iw, h / ih)
        self.img, self.width, self.height = img, iw * s, ih * s

    def draw(self):
        draw_shot(self.canv, self.img, 0, 0, self.width, self.height)


# ---------------------------------------------------------------- guide PDF

ST = {
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=HexColor(B.INK), spaceAfter=5),
    "lead": ParagraphStyle("lead", fontName="Helvetica", fontSize=11, leading=15.5, textColor=HexColor(B.INK), spaceAfter=8),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=HexColor(B.NAVY), spaceBefore=4, spaceAfter=4),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=HexColor(B.NAVY), spaceBefore=12, spaceAfter=5),
    "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=HexColor(B.BLUE), spaceBefore=8, spaceAfter=3),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10.5, textColor=HexColor(B.MUTED), spaceAfter=4),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.3, leading=10.8, textColor=HexColor(B.INK)),
    "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=8.3, leading=10.8, textColor=HexColor(B.INK)),
    "th": ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8.3, leading=10.8, textColor=HexColor(B.WHITE)),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.5, leading=13.2, textColor=HexColor(B.INK), leftIndent=14, bulletIndent=3, spaceAfter=2.5),
    "num": ParagraphStyle("num", fontName="Helvetica", fontSize=9.5, leading=13.2, textColor=HexColor(B.INK), leftIndent=18, bulletIndent=0, spaceAfter=3),
    "code": ParagraphStyle("code", fontName="Courier", fontSize=7.8, leading=9.6, textColor=HexColor(B.INK)),
    "note": ParagraphStyle("note", fontName="Helvetica-Oblique", fontSize=8.8, leading=12, textColor=HexColor(B.MUTED), spaceAfter=6),
}


def P(t, s="body"):
    return Paragraph(t, ST[s])


def bullets(items, style="bullet"):
    return [Paragraph(esc(i) if not i.startswith("<") else i, ST[style], bulletText="•") for i in items]


def steps(items):
    return [Paragraph(esc(i), ST["num"], bulletText=f"{n}.") for n, i in enumerate(items, 1)]


def table(header, rows, widths, bold_first=False):
    data = [[Paragraph(esc(h), ST["th"]) for h in header]]
    for r in rows:
        data.append([Paragraph(esc(v), ST["cellb" if (bold_first and i == 0) else "cell"]) for i, v in enumerate(r)])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(B.NAVY)),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, HexColor(B.GREEN)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, HexColor(B.PANEL)]),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, HexColor(B.LINE)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def code(text, width):
    t = Table([[Preformatted(text, ST["code"])]], colWidths=[width], hAlign="LEFT")
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), HexColor(B.PANEL)),
                           ("LINEBEFORE", (0, 0), (0, -1), 2.5, HexColor(B.GREEN)),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


def callout(text, width, color=B.BLUE):
    t = Table([[P(text, "body")]], colWidths=[width], hAlign="LEFT")
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), HexColor("#EEF4FC")),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, HexColor(color)),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 7),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


def sources(keys):
    seen, parts = set(), []
    for k in keys:
        if k in seen or k not in C.KB:
            continue
        seen.add(k)
        name, url = C.KB[k]
        parts.append(f'<link href="{url}" color="{B.BLUE}">{esc(name)}</link>')
    return P("Source: Kentik KB, " + "; ".join(parts), "small")


def draw_fit(c, text, x, y, font, size, min_size, width):
    """Draw one line no wider than width: shrink the font down to min_size, then cut the end with an ellipsis."""
    while size > min_size and c.stringWidth(text, font, size) > width:
        size -= 0.5
    if c.stringWidth(text, font, size) > width:
        while text and c.stringWidth(text + "…", font, size) > width:
            text = text[:-1]
        text = text.rstrip() + "…"
    c.setFont(font, size)
    c.drawString(x, y, text)


class GuideDoc(BaseDocTemplate):
    def __init__(self, buf, cfg, **kw):
        super().__init__(buf, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                         topMargin=0.95 * inch, bottomMargin=0.7 * inch, **kw)
        self.cfg = cfg
        self.kb_used = []
        pw, ph = letter
        lw, lh = landscape(letter)
        # The cover's text starts below the dark band and its green line (ph * 0.48 - 6), with a gap, so no row hides under them
        cover = Frame(0.9 * inch, 0.9 * inch, pw - 1.8 * inch, ph * 0.48 - 6 - 0.35 * inch - 0.9 * inch, id="cover")
        body = Frame(self.leftMargin, self.bottomMargin, pw - self.leftMargin - self.rightMargin,
                     ph - self.topMargin - self.bottomMargin, id="body")
        land = Frame(0.5 * inch, 0.6 * inch, lw - 1.0 * inch, lh - 0.6 * inch - 0.85 * inch, id="land")
        self.addPageTemplates([
            PageTemplate("cover", [cover], onPage=self._cover, pagesize=letter),
            PageTemplate("body", [body], onPage=self._body, pagesize=letter),
            PageTemplate("land", [land], onPage=self._land, pagesize=landscape(letter)),
        ])
        self.title = f"Kentik deployment guide - {cfg['customer']}"
        self.author = cfg["prepared_by"] or B.NAME
        self.subject = "Kentik network observability deployment guide"

    def _cover(self, c, doc):
        cfg = self.cfg
        pw, ph = letter
        c.saveState()
        c.setFillColor(HexColor(B.NAVY))
        c.rect(0, ph * 0.48, pw, ph * 0.52, stroke=0, fill=1)
        c.setFillColor(HexColor(B.GREEN))
        c.rect(0, ph * 0.48 - 6, pw, 6, stroke=0, fill=1)
        # subtle network motif
        c.setStrokeColor(HexColor("#1E3B63"))
        c.setLineWidth(1)
        pts = [(pw * 0.62, ph * 0.9), (pw * 0.78, ph * 0.82), (pw * 0.9, ph * 0.93), (pw * 0.86, ph * 0.66), (pw * 0.7, ph * 0.6), (pw * 0.95, ph * 0.55)]
        for a, b in [(0, 1), (1, 2), (1, 3), (3, 4), (3, 5), (4, 1), (2, 3)]:
            c.line(*pts[a], *pts[b])
        for i, (x, y) in enumerate(pts):
            c.setFillColor(HexColor(B.GREEN if i in (1, 3) else "#2A5286"))
            c.circle(x, y, 5 if i in (1, 3) else 3.5, stroke=0, fill=1)
        draw_wordmark(c, 0.9 * inch, ph - 1.1 * inch, 26, color=B.WHITE)
        c.setFillColor(HexColor(B.GREEN))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(0.9 * inch, ph * 0.48 + 2.55 * inch, B.PRODUCT_LINE.upper())
        c.setFillColor(HexColor(B.WHITE))
        c.setFont("Helvetica-Bold", 30)
        c.drawString(0.9 * inch, ph * 0.48 + 2.0 * inch, "Kentik Deployment Guide")
        c.setFillColor(HexColor("#D5E2F2"))
        width = pw - 1.8 * inch   # long customer and project names shrink, then shorten, to stay on the page
        draw_fit(c, f"Prepared for {cfg['customer']}", 0.9 * inch, ph * 0.48 + 1.62 * inch, "Helvetica", 15, 10, width)
        draw_fit(c, cfg["project"], 0.9 * inch, ph * 0.48 + 1.32 * inch, "Helvetica", 11, 8, width)
        c.restoreState()
        c.saveState()
        c.setFont("Helvetica", 7.5)
        c.setFillColor(HexColor(B.MUTED))
        c.drawString(0.9 * inch, 0.55 * inch, B.FOOTER_NOTE)
        c.restoreState()

    def _body(self, c, doc):
        page_chrome(c, "Kentik deployment guide", self.cfg, *letter, page_no=doc.page)

    def _land(self, c, doc):
        page_chrome(c, "Kentik deployment guide", self.cfg, *landscape(letter), page_no=doc.page)


def H1(text, num=None):
    label = f"{num}. {text}" if num else text
    t = Table([[Paragraph(esc(label), ST["h1"])]], colWidths=[7.0 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 2, HexColor(B.GREEN)),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return [t, Spacer(1, 8)]


def guide_pdf(cfg, images=None):
    cfg = M.normalize(cfg)
    shots = decode_images(images)
    buf = io.BytesIO()
    doc = GuideDoc(buf, cfg)
    W = 7.0 * inch
    region = C.REGIONS[cfg["region"]]
    clouds = M.enabled_clouds(cfg)
    all_sites = cfg["sites"]
    sites = M.agent_sites(cfg)            # sites with a Universal Agent
    remote = M.remote_branches(cfg)       # sites whose devices send to a data center agent
    remote_title = ("Branches without an agent" if all(s["kind"] == "branch" and not s["agent"] for s in remote)
                    else "Sites that send to a data center agent")
    who = lambda s: "Appliances" if s["kind"] == "cloud" else "Devices"
    no_agent = sum(1 for s in all_sites if s["kind"] == "branch" and not s["agent"])
    caps_used = [c for c in C.CAP_ORDER if any(c in s["capabilities"] for s in sites)]
    kb_used = []

    def src(keys):
        kb_used.extend(keys)
        return sources(keys)

    story = []
    # ---- cover details
    meta = [
        ["Customer", cfg["customer"]], ["Project", cfg["project"]],
        ["Prepared by", (cfg["prepared_by"] or "Infoblox") + (f" ({cfg['prepared_by_email']})" if cfg["prepared_by_email"] else "")],
        ["Date", cfg["date"]], ["Kentik region", region["label"]],
        ["Scope", ", ".join(filter(None, [
            f"{sum(1 for s in sites if s['kind'] == 'dc')} data center(s)" if any(s['kind'] == 'dc' for s in sites) else "",
            f"{sum(1 for s in all_sites if s['kind'] == 'branch')} branch(es)" + (f", {no_agent} without an agent" if no_agent else "") if any(s['kind'] == 'branch' for s in all_sites) else "",
            ", ".join(C.CLOUDS[c]["name"] for c in clouds),
            "Synthetic monitoring" if cfg["synthetics"]["enabled"] else ""]))],
    ]
    mt = Table([[P(f"<b>{esc(k)}</b>", "cell"), P(esc(v), "cell")] for k, v in meta], colWidths=[1.4 * inch, 5.2 * inch], hAlign="LEFT")
    mt.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, HexColor(B.LINE)), ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [mt, Spacer(1, 14),
              P("This guide describes the Kentik deployment designed for this environment: what gets installed, which permissions and "
                "firewall rules are needed, and the steps to go live. Facts are taken from the Kentik Knowledge Base (kb.kentik.com) and "
                "each section names its sources.", "small"),
              NextPageTemplate("body"), PageBreak()]

    # ---- contents
    sec = []
    sec.append("Deployment at a glance")
    sec.append("Topology")
    sec.append("Roles and permissions")
    sec.append("Network and firewall requirements")
    if sites:
        sec.append("Universal Agent deployment")
    if remote:
        sec.append(remote_title)
    if sites:
        sec.append("Capability configuration")
    if clouds:
        sec.append("Public cloud setup")
    if cfg["synthetics"]["enabled"]:
        sec.append("Synthetic monitoring plan")
    sec += ["Security, data handling and licensing", "Open items to confirm with Kentik", "Appendix: Kentik KB references"]
    num = {name: i + 1 for i, name in enumerate(sec)}
    story += H1("Contents")
    story += [P(f"{i + 1}.&nbsp;&nbsp;{esc(n)}", "lead") for i, n in enumerate(sec)]
    story.append(PageBreak())

    # ---- 1. at a glance
    story += H1("Deployment at a glance", num["Deployment at a glance"])
    story.append(P("Kentik is SaaS. The customer runs a small footprint where the network lives, and everything lands in the customer's "
                   f"Kentik account in the {esc(region['label'])} region over encrypted, outbound connections.", "lead"))
    rows = []
    for s in all_sites:
        sends = f"{who(s)} send flow, traps and syslog across {M.path_name(s)} to the {s['send_to']} agent" if s["send_to"] else "Nothing collects the devices yet"
        if not s["agent"]:
            rows.append([s["name"] + (f" ({s['location']})" if s["location"] else ""), "No agent", sends, "None"])
            continue
        size = M.site_sizing(s, cfg)
        test = s["agent_role"] == "test"
        rows.append([s["name"] + (f" ({s['location']})" if s["location"] else ""),
                     "Universal Agent on " + ("Docker" if s["install"] == "docker" else "a VM" if s["kind"] == "cloud" else "Linux") + (", tests only" if test else ""),
                     (M.cap_names(s) or "None selected")
                     + ("; edge routers peer BGP directly with Kentik" if s.get("bgp") else "; no BGP peering" if s["kind"] == "dc" and "bgp" not in s["capabilities"] else "")
                     + (f"; {sends[0].lower() + sends[1:]}" if test and (s["kind"] == "branch" or s["devices"]) else ""),
                     f"{size['rec_cpu']} vCPU / {size['rec_ram']} GB"])
    for cid in clouds:
        cl = cfg["clouds"][cid]
        rows.append([C.CLOUDS[cid]["full"], "Flow logs: agentless (read-only access)",
                     ", ".join(C.CLOUDS[cid]["features"][f] for f in cl["features"]),
                     "No compute" if cl["agent"] == "none" else "Agent VM (row above)"])
    if rows:
        story.append(table(["Where", "Deployment", "What Kentik collects", "Footprint"], rows,
                           [1.6 * inch, 1.45 * inch, 2.8 * inch, 1.15 * inch], bold_first=True))
    story.append(Spacer(1, 10))
    story.append(P("<b>Three patterns cover this design</b>", "body"))
    pats = []
    if sites:
        pats.append("<b>On-prem: a Universal Agent per data center.</b> A single agent with only the capabilities each site needs toggled on in the portal. "
                    "Devices point at it, and it talks to Kentik over outbound HTTPS. The standalone kproxy agent is not used; "
                    "the Universal Agent Flow Proxy replaces it.")
    if remote:
        pats.append(f"<b>{esc(remote_title)} ({len(remote)}).</b> Their routers, switches, Wi-Fi or cloud appliances send flow, traps and syslog "
                    "to a data center agent, which also polls them. A branch or a cloud that needs local tests gets a tests-only agent; "
                    "one that should keep its telemetry local gets an agent that collects.")
    if any(s["kind"] == "cloud" for s in all_sites):
        pats.append("<b>Agents and appliances in the cloud.</b> A Universal Agent on a VM tests from inside a cloud network, and can collect "
                    "from network appliances such as Palo Alto VM-Series. Without one, the appliances send to a data center agent across the "
                    "private link (for example Direct Connect or ExpressRoute). Flow logs keep coming through the cloud export either way.")
    if clouds:
        pats.append("<b>Public cloud: agentless.</b> Flow logs go to storage in the customer's own account, and Kentik gets read-only "
                    "access to the logs, topology metadata and metrics.")
    if cfg["synthetics"]["enabled"]:
        pats.append("<b>Internet and SaaS: synthetic tests.</b> Kentik's global agents and the customer's own agents test SaaS apps, "
                    "websites, DNS and paths between sites and clouds.")
    story += bullets(pats)
    story.append(src(["universal-agents", "public-clouds", "synthetics-overview"]))

    # ---- 2. topology (landscape)
    story += [NextPageTemplate("land"), PageBreak()]
    lw, lh = landscape(letter)[0] - 1.0 * inch, landscape(letter)[1] - 1.45 * inch - 0.85 * inch
    if shots:
        for k, (title, img) in enumerate(shots):
            label = f"<b>{num['Topology']}. Topology</b>" if k == 0 else f"<b>{num['Topology']}.{k}&nbsp;&nbsp;{esc(title)}</b>"
            story.append(P(label, "h2"))
            story.append(ShotFlowable(img, lw, lh - 30))
            if k < len(shots) - 1:
                story.append(PageBreak())
    else:
        sc = T.build(cfg)
        story.append(P(f"<b>{num['Topology']}. Topology</b>", "h2"))
        story.append(T.TopologyFlowable(sc, lw, lh))
    story += [NextPageTemplate("body"), PageBreak()]

    # ---- 3. roles and permissions
    story += H1("Roles and permissions", num["Roles and permissions"])
    story.append(P("Who on the customer side does what, and the access each task needs. Kentik only ever receives read-only access.", "lead"))
    rr = [["Kentik administrator", "Deploy and authorize Universal Agents, enable capabilities, add devices, create cloud exports and tests",
           "Kentik admin (or super admin) user in the customer's Kentik account"]]
    if sites:
        rr.append(["Server or platform team", f"Provide {len(sites)} agent host(s) and run the install command",
                   "root or sudo on a supported Linux host" + (", or Docker" if any(s["install"] == "docker" for s in sites) else "")])
        rr.append(["Network team", "Point flow, traps and syslog at the agents" + (" (branches without an agent point at their data center agent)" if remote else "") + "; create SNMP and SSH credentials"
                   + ("; turn on gNMI dial-in on the devices that stream telemetry" if "st" in caps_used else "") + ("; configure BGP peering" if any(s["bgp"] or "bgp" in s["capabilities"] for s in sites) else ""),
                   "Device configuration rights; SNMP v2c/v3 read-only credentials; read-only SSH account"
                   + ("; read-only gNMI access for the agent" if "st" in caps_used else "")])
        rr.append(["Security / firewall team", "Open the rules in section " + str(num["Network and firewall requirements"]), "Firewall and proxy change rights"])
    if "dns" in caps_used:
        rr.append(["DNS team", "Stream DNSTAP from DNS servers (for example Infoblox NIOS) to the agent", "DNS appliance administration"])
    for cid in clouds:
        rr.append([C.CLOUDS[cid]["grant_who"], f"{C.CLOUDS[cid]['name']}: enable flow logs and grant Kentik access", C.CLOUDS[cid]["grant_what"]])
    story.append(table(["Role", "Task", "Access needed"], rr, [1.55 * inch, 2.75 * inch, 2.7 * inch], bold_first=True))
    story.append(P("<b>Access granted to Kentik</b>", "h3"))
    ga = []
    for cid in clouds:
        ga.append([C.CLOUDS[cid]["name"], C.CLOUDS[cid]["grant_what"]])
    if any("snmp" in s["capabilities"] for s in sites):
        ga.append(["Network devices", "SNMP read-only (polled from the customer's own agent, never from the Internet)"])
    if any("st" in s["capabilities"] for s in sites):
        ga.append(["Network devices", "gNMI streaming telemetry, read-only (the customer's own agent dials in, never from the Internet)"])
    if any("ssh" in s["capabilities"] for s in sites):
        ga.append(["Network devices", "Read-only SSH from the agent; command block-list, never configure or commit"])
    if ga:
        story.append(table(["Scope", "Access"], ga, [1.6 * inch, 5.4 * inch], bold_first=True))
    story.append(src(["ua-deployment", "nms-setup", "ssh-command-access"] + sum((C.CLOUDS[c]["kb"][:1] for c in clouds), [])))

    # ---- 4. network
    story.append(PageBreak())
    story += H1("Network and firewall requirements", num["Network and firewall requirements"])
    story.append(P("All Universal Agent connections are outbound. Nothing needs to reach into the customer network from the Internet.", "lead"))
    story.append(P("<b>Outbound allowlist (every agent)</b>", "h3"))
    story.append(table(["Destination", "Port", "Notes"],
                       [[h, "TCP 443", "TLS 1.2+"] for h in region["hosts"]] +
                       [[h, "TCP 443", "Optional"] for h in region["optional"]] +
                       ([["Kentik flow ingest", "UDP 40010", "Optional Flow Proxy base port"]] if "flow" in caps_used else []),
                       [3.0 * inch, 1.3 * inch, 2.7 * inch]))
    story += bullets(C.EGRESS_NOTES[1:] + ["A web proxy works: set https_proxy before running the install (Linux) or pass it with --env (Docker)."])
    for s in all_sites:
        rules = M.site_firewall(s, cfg)
        if not rules:
            continue
        story.append(CondPageBreak(1.6 * inch))
        note = "" if s["agent"] and s["agent_role"] == "full" else (
            f"  ·  no agent, across {esc(M.path_name(s))} to {esc(s['send_to'])}" if not s["agent"] else
            "  ·  tests-only agent" + (f"; {who(s).lower()} send across {esc(M.path_name(s))} to {esc(s['send_to'])}" if s["send_to"] and (s["kind"] == "branch" or s["devices"]) else ""))
        story.append(P(f"<b>{esc(s['name'])}</b>" + (f"  ·  {esc(s['location'])}" if s["location"] else "") + note, "h3"))
        story.append(table(["From", "To", "Port", "Purpose"], rules,
                           [1.5 * inch, 2.0 * inch, 1.3 * inch, 2.2 * inch]))
    if any(s["kind"] == "cloud" and s["agent"] for s in all_sites):
        story.append(P("<b>Agents in clouds</b>", "h3"))
        story.append(P("A Universal Agent on a VM in a cloud network uses the same outbound TCP 443 rules, through a NAT gateway or a proxy. "
                       + esc(C.CLOUD_AGENT_STEPS[1]), "body"))
    if "azure" in clouds:
        story.append(P("<b>Azure storage firewall</b>", "h3"))
        story.append(P("Only if the log storage account firewall is restricted: allow 20.69.189.228 and 20.69.185.115 "
                       "(WestUS2: 51.8.214.254 and 172.171.46.16).", "body"))
    story.append(src(["universal-agents", "ua-deployment", "test-types"] + (["azure-roles"] if "azure" in clouds else [])))

    # ---- 5. UA deployment
    if sites:
        story.append(PageBreak())
        story += H1("Universal Agent deployment", num["Universal Agent deployment"])
        story.append(P("Install one Universal Agent per site, then switch capabilities on in the portal. The agent updates itself and "
                       "reports its own health.", "lead"))
        story.append(P("<b>Host requirements</b>", "h3"))
        story += bullets(["Supported OS: " + "; ".join(C.SUPPORTED_OS) + ". " + C.UNSUPPORTED_OS,
                          "Or any Docker host that can run the generated docker run command.",
                          "Size for the sum of the capabilities on the host, plus 20 to 30% headroom for bursty flow, syslog and traps. "
                          "The plans below use 30%.",
                          "Disk sizing is not published in the KB; confirm with Kentik."])
        if len(sites) > 1:
            story.append(callout("<b>Rolling out many agents?</b> " + esc(C.UA_API_NOTE.format(domain=region["domain"])), W))
        story.append(src(["universal-agents", "ua-deployment"]))
        for i, s in enumerate(sites, 1):
            size = M.site_sizing(s, cfg)
            block = [CondPageBreak(2.5 * inch),
                     P(f"{num['Universal Agent deployment']}.{i}&nbsp;&nbsp;{esc(s['name'])}" + (f"  ·  {esc(s['location'])}" if s["location"] else ""), "h2")]
            kind = ("Data center" if s["kind"] == "dc" else f"Cloud network in {C.CLOUDS[s['cloud']]['full']}, on {C.CLOUD_SITE[s['cloud']]['vm']}"
                    if s["kind"] == "cloud" else "Branch office")
            feeds = M.remote_branches(cfg, s)
            if feeds:
                kind += f" that also collects for {len(feeds)} site(s) that send to it ({', '.join(b['name'] for b in feeds)}); their load is included in the sizing"
            if s["agent_role"] == "test":
                kind += ". A tests-only agent: Connectivity Test only" + (
                    f"; the {who(s).lower()} send to the {s['send_to']} agent" if s["send_to"] and (s["kind"] == "branch" or s["devices"]) else "")
            block.append(P(f"{kind}. Install method: <b>{'Docker' if s['install'] == 'docker' else 'Linux package'}</b>. "
                           f"Capabilities: <b>{esc(M.cap_names(s) or 'none')}</b>.", "body"))
            if size["rows"]:
                rows = [[r[0], r[1], r[2]] for r in size["rows"]]
                rows.append(["Total from KB sizing", "", f"{size['cpu']} cores / {size['ram']} GB"])
                rows.append(["Recommended host (+30%)", "", f"{size['rec_cpu']} vCPU / {size['rec_ram']} GB RAM"])
                t = table(["Capability", "Planned load", "CPU / RAM"], rows, [2.6 * inch, 2.0 * inch, 2.4 * inch])
                t.setStyle(TableStyle([("FONTNAME", (0, len(rows)), (-1, len(rows)), "Helvetica-Bold"),
                                       ("BACKGROUND", (0, len(rows)), (-1, len(rows)), HexColor("#E3F4E6"))]))
                block.append(t)
            story += block
            inst = [P("<b>Install and register</b>", "h3")]
            stp = [x.format(method="Docker" if s["install"] == "docker" else "Linux",
                            hostname_note="container ID" if s["install"] == "docker" else "system hostname",
                            site=s["name"],
                            caps=M.portal_cap_names(s) or "none")
                   for x in C.UA_INSTALL_STEPS]
            inst += steps(stp)
            if s.get("proxy"):
                inst.append(callout(esc(C.UA_PROXY[s["install"]]), W))
            if s["install"] == "linux":
                inst.append(code("export K_COMPANY_ID=<Kentik company ID>\nexport K_REGISTER_PROVISIONING_TOKEN=<token>\n"
                                 + ("export https_proxy=http://<proxy>:<port>\n" if s.get("proxy") else "")
                                 + "# then run the Linux command copied from Settings > Universal Agents > Deploy Agent", W))
            else:
                inst.append(code("# run the docker command copied from Settings > Universal Agents > Deploy Agent\n"
                                 "# it carries K_COMPANY_ID and K_REGISTER_PROVISIONING_TOKEN\n"
                                 + ("# behind a proxy, add: --env https_proxy=http://<proxy>:<port>\n" if s.get("proxy") else ""), W))
            groups = [inst]   # each group stays on one page, so a code box or a KB line never sits alone on a page
            if s.get("bgp"):
                groups.append([P("<b>BGP peering from the edge routers</b>", "h3")] + bullets(C.BGP["steps"]))
            if s["kind"] == "cloud":
                groups.append([P("<b>In the cloud</b>", "h3")] +
                              bullets(C.CLOUD_AGENT_STEPS if s["devices"] and s["agent_role"] == "full" else C.CLOUD_AGENT_STEPS[:2]))
            if i == len(sites):
                groups[-1].append(src(["ua-deployment", "ua-portal-management", "device-settings"]))
            story += [KeepTogether(g) for g in groups]

    # ---- branches with no agent
    if remote:
        story.append(PageBreak())
        story += H1(remote_title, num[remote_title])
        story.append(P("These sites use a data center Universal Agent as the collector for their devices: branches with no agent or a "
                       "tests-only agent, and cloud appliances with no collecting agent in the cloud." if remote_title != "Branches without an agent" else
                       "These branches get no agent. Their devices are configured to use a data center Universal Agent as their collector, "
                       "across the WAN. Nothing is installed at the branch.", "lead"))
        story.append(table(["Site" if remote_title != "Branches without an agent" else "Branch", "Sends to", "What reaches Kentik"],
                           [[b["name"], (b["send_to"] + " agent") if b["send_to"] else "Nothing yet: add a data center or an agent",
                             (lambda d: ", ".join(M.cap_name(d, c) for c in d["capabilities"] if c in ("flow", "snmp", "st", "trap", "syslog", "ssh")) if d else "")(
                                 next((d for d in sites if d["name"] == b["send_to"]), None)) or "None"] for b in remote],
                           [1.8 * inch, 1.8 * inch, 3.4 * inch], bold_first=True))
        story.append(P("<b>Steps for each branch</b>", "h3"))
        story += steps([
            "On the branch WAN or SD-WAN router (and switches if wanted), export flow to the data center agent's IP on UDP 9995. Set the same sample rate for the device in Kentik.",
            "Point SNMP traps at the agent on UDP 162 and syslog on UDP or TCP 514.",
            "Allow those flows through WAN firewalls and SD-WAN policy, plus UDP 161, ICMP and TCP 22"
            + (" (and the gNMI port of the devices that stream telemetry)" if any("st" in d["capabilities"] and M.remote_branches(cfg, d) for d in sites) else "")
            + " from the agent back to the branch devices.",
            "In Kentik, add the branch devices with the data center agent as their collection agent, and assign them to the branch Site so they still group by location.",
            "Optional: create Server IP or agent-to-agent tests from the data center agent to the branch router to watch the WAN path.",
        ])
        for cid in sorted({s["cloud"] for s in remote if s["kind"] == "cloud"}):
            story.append(P(f"<b>Steps for the appliances in {esc(C.CLOUDS[cid]['full'])}</b>", "h3"))
            story += steps([x.format(link=C.CLOUD_SITE[cid]["link_alt"]) for x in C.CLOUD_APPLIANCE_STEPS])
        story.append(callout("A branch or a cloud gets a tests-only agent when it needs tests from where users or workloads are, and an agent "
                             "that collects when it is large, far from a data center, or should keep its telemetry off the WAN.", W))
        story.append(src(["universal-agents", "device-settings", "router-configuration"]))

    if sites:
        # ---- 6. capability configuration
        story.append(PageBreak())
        story += H1("Capability configuration", num["Capability configuration"])
        story.append(P("How to configure each capability used in this design, on the agent and on the devices that feed it.", "lead"))
        for cid in caps_used:
            cap = C.CAPABILITIES[cid]
            at = [s["name"] + (f" ({'Edge Processing' if s['flow_mode'] == 'edge' else 'Forwarding'})" if cid == "flow" else "")
                  for s in sites if cid in s["capabilities"]]
            story.append(KeepTogether([P(f"{esc(cap['name'])}", "h2"),
                                       P(esc(cap["purpose"]), "body"),
                                       P(f"<b>Enabled at:</b> {esc(', '.join(at))}  ·  <b>License:</b> {esc(cap['license'])}", "small")]))
            story += bullets(cap["setup"])
            story.append(src(cap["kb"]))

    # ---- 7. clouds
    if clouds:
        story.append(PageBreak())
        story += H1("Public cloud setup", num["Public cloud setup"])
        story.append(P("Flow logs need no agent. Each cloud writes flow logs to storage in the customer's own account, and Kentik reads them "
                       "with read-only access. Kentik recommends a metadata-only export first to prove access before turning on high-volume "
                       "logs. A Universal Agent in a cloud is optional: for tests from inside it, or to collect from network appliances.", "lead"))
        for cid in clouds:
            cl = cfg["clouds"][cid]
            info = C.CLOUDS[cid]
            story.append(CondPageBreak(2.2 * inch))
            story.append(P(f"{esc(info['full'])}", "h2"))
            story.append(P(esc(info["summary"]), "body"))
            feats = ", ".join(info["features"][f] for f in cl["features"])
            extra = f" Scope: {cl['accounts']} account(s)/subscription(s)/project(s)." if cl["accounts"] > 1 else ""
            if cl.get("regions"):
                extra += f" Regions: {cl['regions']}."
            story.append(P(f"<b>Collecting:</b> {esc(feats)}.{esc(extra)}", "body"))
            if cid == "aws":
                story.append(P("<b>Steps</b>", "h3"))
                story += steps([s.format(fw=" and Network Firewalls" if "firewall" in cl["features"] else "") for s in C.AWS_STEPS])
                story.append(P("<b>How data moves</b>", "h3"))
                story += bullets(C.AWS_DATA_PATH)
                nested = cl.get("multi_account") or cl["accounts"] > 1
                story.append(P("<b>IAM role trust policy</b>" + (" (primary account)" if nested else ""), "h3"))
                story.append(code(C.AWS_TRUST_POLICY, W))
                if nested:
                    story.append(P("<b>Nested accounts: primary and secondary roles</b>", "h3"))
                    story.append(P("Kentik's account assumes the primary role in account A. The primary role then assumes a secondary role "
                                   "in each other account (B, C and so on) to read its metadata.", "body"))
                    story += steps(C.AWS_NESTED_STEPS)
                    story.append(P("<b>Secondary role trust policy</b>", "h3"))
                    story.append(code(C.AWS_SECONDARY_TRUST, W))
                story.append(P("<b>IAM permissions policy</b>", "h3"))
                story.append(table(["Service", "Actions"], C.AWS_PERMISSIONS, [1.5 * inch, 5.5 * inch], bold_first=True))
                story.append(P("Export status values: Start, Pending, Error, OK, Disabled or Halt. Licensing: CloudPak, measured in flows per second.", "small"))
            elif cid == "azure":
                story.append(P("<b>Steps</b>", "h3"))
                fw = ("Send Azure Firewall diagnostic logs to the same storage account with the azfwapplicationrule and azfwnetworkrule categories."
                      if "firewall" in cl["features"] else "")
                st = [s.format(fw=fw, auth=C.AZURE_AUTH[cl.get("auth", "enterprise")]) for s in C.AZURE_STEPS]
                story += steps([s for s in st if s])
                story.append(P("<b>Roles for the Kentik service principal</b>", "h3"))
                story.append(table(["Role", "Scope", "Why"], C.AZURE_ROLES, [2.6 * inch, 2.6 * inch, 1.8 * inch], bold_first=True))
            elif cid == "gcp":
                story.append(P("<b>Steps</b>", "h3"))
                story += steps(C.GCP_STEPS)
                story.append(P("<b>Log Router sink filter</b>", "h3"))
                story.append(code(C.GCP_FILTER, W))
                story.append(P(f"<b>Roles for Kentik's service account</b> ({esc(C.GCP_SA)})", "h3"))
                story.append(table(["Role", "Where", "Why"], C.GCP_ROLES, [2.6 * inch, 2.4 * inch, 2.0 * inch], bold_first=True))
                if "cloudrun" in cl["features"]:
                    story.append(P("Cloud Run log collection is set up as a second cloud export.", "small"))
            elif cid == "oci":
                story.append(P("<b>Steps</b>", "h3"))
                story += steps([s.format(access=C.OCI_ACCESS[cl.get("access", "cross_tenancy")]) for s in C.OCI_STEPS])
                if cl.get("access") == "user":
                    story.append(P("<b>Policies for the Kentik API key user's group</b>", "h3"))
                    story.append(code(C.OCI_USER_POLICY, W))
                    story.append(P("Least privilege option: instead of READ all-resources, grant INSPECT on tenancies and metrics plus READ on "
                                   "the network resource types (VCNs, subnets, route tables, security lists, NSGs, gateways, DRGs and related).", "small"))
                story.append(P("<b>Values to collect for the Kentik export</b>", "h3"))
                story.append(table(["Value", "Where to find it"], C.OCI_VALUES, [2.4 * inch, 4.6 * inch], bold_first=True))
                story.append(P("The Traffic Trends and Overviews dashboards are not available for OCI.", "small"))
            cs = next((s for s in all_sites if s["kind"] == "cloud" and s["cloud"] == cid), None)
            if cs:
                txt = ""
                if cs["agent"]:
                    txt = (f"<b>Universal Agent in {esc(info['name'])}</b> on {esc(C.CLOUD_SITE[cid]['vm'])}: "
                           + ("Connectivity Test only. " if cs["agent_role"] == "test" else
                              f"collects {cs['devices']} network appliance(s) and runs {esc(M.cap_names(cs))}. " if cs["devices"] else f"runs {esc(M.cap_names(cs))}. ")
                           + "Its host size and install steps are in the Universal Agent deployment section.")
                if cs["devices"] and (not cs["agent"] or cs["agent_role"] == "test"):
                    txt += (f" <b>{cs['devices']} network appliance(s)</b> send to the {esc(cs['send_to'] or '(no data center yet)')} agent across "
                            f"{esc(C.CLOUD_SITE[cid]['link_alt'])}.")
                story.append(callout(txt.strip(), W, B.FLOW_COLORS["synth"]))
            story.append(src(info["kb"]))

    # ---- 8. synthetics
    if cfg["synthetics"]["enabled"]:
        syn = cfg["synthetics"]
        story.append(PageBreak())
        story += H1("Synthetic monitoring plan", num["Synthetic monitoring plan"])
        story.append(P("Continuous tests measure latency, loss and jitter between sites, clouds and the applications users depend on.", "lead"))
        agents = M.synth_agents(cfg)
        story.append(P("<b>Test points</b>", "h3"))
        tp = [[a, "Private (Universal Agent)"] for a in agents]
        if syn["global_agents"]:
            tp.append([f"{int(syn['global_agents'])} Kentik global agent(s)", "Kentik-hosted: Internet hubs, cloud regions, app agents"])
        if tp:
            story.append(table(["Agent", "Type"], tp, [3.2 * inch, 3.8 * inch]))
        story.append(P("<b>Planned tests</b>", "h3"))
        tests = []
        if syn["site_mesh"] and len(agents) >= 2:
            tests.append("Network mesh between all private agents (latency, loss, jitter between every pair of sites and clouds).")
        for t in syn["saas_targets"]:
            tests.append(f"HTTP(S) test to {t} from private and global agents.")
        if syn["bgp_monitor"]:
            tests.append("BGP Monitor for the customer's prefixes: hijacks, leaks and RPKI status.")
        tests.append("Available test types: Agent-to-Agent, Network Mesh, Server IP, Server Hostname, Network Grid, autonomous tests "
                     "(ASN, CDN, country, region, city), DNS Server Monitor, DNS Server Grid, HTTP(S) or API, Page Load and Transaction.")
        story += bullets(tests)
        rows, total = M.synth_estimate(cfg)
        if rows:
            story.append(P("<b>Estimated monthly test credits</b>", "h3"))
            story.append(table(["Test", "Interval", "Per run", "Credits / month"],
                               [[r[0], r[1], r[2], f"{r[3]:,.0f}"] for r in rows] + [["Total", "", "", f"{total:,.0f}"]],
                               [2.1 * inch, 1.0 * inch, 2.6 * inch, 1.3 * inch]))
            story.append(P("Credit rules from the KB: network subtest 2.5 credits from a private agent and 5 from a global agent; HTTP subtests "
                           "cost timeout (seconds) x 0.5 private or x 1 global; BGP Monitor 0.53 credits per minute; a test every minute runs "
                           "43,200 times in a 30-day month; Test Preview is free until saved. Mesh estimates count each direction as one subtest "
                           "(the KB example: a 4-agent private mesh is 30 credits per run). Treat these as planning estimates and confirm with Kentik.", "small"))
        story.append(src(["synthetics-overview", "test-types", "test-credits", "agents-page"]))

    # ---- 9. security & licensing
    story.append(PageBreak())
    story += H1("Security, data handling and licensing", num["Security, data handling and licensing"])
    story.append(table(["Area", "Detail"], C.SECURITY, [1.6 * inch, 5.4 * inch], bold_first=True))
    story.append(src(["security-overview", "kde-overview"]))
    story.append(P("<b>Licensing</b>", "h2"))
    story.append(table(["License", "Covers"], C.LICENSES, [1.6 * inch, 5.4 * inch], bold_first=True))
    story.append(P("Plans and editions vary by contract. Confirm entitlements with the Kentik account team.", "note"))
    story.append(src(["licenses", "test-credits"]))

    # ---- 11. open items
    story += H1("Open items to confirm with Kentik", num["Open items to confirm with Kentik"])
    story += bullets(C.OPEN_ITEMS + ([C.OPEN_ITEM_BGP_PROXY] if "bgp" in caps_used else []))

    # ---- appendix
    story.append(PageBreak())
    story += H1("Appendix: Kentik KB references", num["Appendix: Kentik KB references"])
    seen = []
    for k in kb_used:
        if k not in seen and k in C.KB:
            seen.append(k)
    story.append(table(["Page", "URL"], [[C.KB[k][0], C.KB[k][1]] for k in seen], [2.6 * inch, 4.4 * inch]))
    story.append(Spacer(1, 8))
    story.append(P("Facts in this guide were checked against the Kentik Knowledge Base in October 2026. Kentik updates its product "
                   "frequently; confirm details against the linked pages before go-live.", "small"))

    doc.build(story)
    return buf.getvalue()
