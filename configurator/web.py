"""Local web app: the Infoblox Kentik deployment explorer, plus HTML and PDF exports. Standard library only (plus reportlab).

The page is the deployment explorer built from ui/ by ui/build.sh, so what you design here looks
exactly like a saved HTML export. The app adds two things the browser cannot do alone: the deployment guide PDF
(built here with reportlab) and the setup file for the command line.
"""
import json
import os
import re
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import model as M
from . import pdf as PDF

STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
EXPLORER = os.path.join(STATIC, "explorer.html")
APP_FLAG = '<script id="ibk-app">window.IBK_APP=1;</script>\n'


def explorer_html():
    with open(EXPLORER, encoding="utf-8") as f:
        return f.read()


def app_page():
    """The explorer, flagged so it shows the PDF and setup file exports."""
    return explorer_html().replace("</head>", APP_FLAG + "</head>", 1)


def html_export(state):
    """A standalone copy of the explorer that opens on a saved design (the state is the explorer's URL hash)."""
    st = json.dumps(str(state or "")).replace("<", "\\u003c")
    return explorer_html().replace("</head>", f'<script id="ibk-state">window.IBK_STATE={st};</script>\n</head>', 1)


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower() or "customer"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, app_page().encode("utf-8"), "text/html; charset=utf-8")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        try:
            body = self._json_body()
            cfg = M.normalize(body.get("cfg") or {})
            images = body.get("images") or []
            name = slug(cfg["customer"])
            if self.path == "/api/pdf":
                data = PDF.guide_pdf(cfg, images)
                self._send(200, data, "application/pdf", {"Content-Disposition": f'attachment; filename="infoblox-kentik-deployment-guide-{name}.pdf"'})
            elif self.path == "/api/topology":
                data = PDF.topology_pdf(cfg, images)
                self._send(200, data, "application/pdf", {"Content-Disposition": f'attachment; filename="infoblox-kentik-topology-{name}.pdf"'})
            else:
                self._send(404, b"not found", "text/plain")
        except Exception as e:  # surface errors to the page instead of dropping the connection
            self._send(500, ("Export failed: " + str(e)).encode(), "text/plain; charset=utf-8")


def serve(host="127.0.0.1", port=8765, open_browser=True):
    if not os.path.exists(EXPLORER):
        raise SystemExit(f"Missing {EXPLORER}. Build it with: sh ui/build.sh")
    httpd = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{port}/"
    print(f"Infoblox Kentik Deployment Configurator running at {url}  (Ctrl+C to stop)")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
