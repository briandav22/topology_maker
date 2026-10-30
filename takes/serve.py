#!/usr/bin/env python3
"""Serve the two new takes on the Kentik deployment tool, side by side. Standard library only.

  python3 takes/serve.py                 http://127.0.0.1:8770 (opens a browser)
  python3 takes/serve.py --port 9100 --no-browser

  /            a short page that compares the takes
  /canvas/     Take A, Network Canvas: draw the customer's network, Kentik plans itself on top
  /rollout/    Take B, Rollout Map: the deployment as waves of work that the customer's teams carry out

Each page is one self-contained HTML file. The server joins index.html, app.css, app.js, the shared icons
and the facts bundle (built from configurator/catalog.py) on every request, so an edit shows on reload.
"""
import argparse
import os
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "common"))
import facts  # noqa: E402

TAKES = ("canvas", "rollout")


def read(*parts):
    with open(os.path.join(HERE, *parts), encoding="utf-8") as f:
        return f.read()


def page(take):
    """The take's page with its styles, script, icons and facts inlined."""
    html = read(take, "index.html")
    html = html.replace("/*@CSS*/", read(take, "app.css"), 1)
    html = html.replace("<!--@DATA-->", facts.script_tag(), 1)
    html = html.replace("<!--@ICONS-->", read("common", "icons.svg"), 1)
    return html.replace("/*@JS*/", read(take, "app.js"), 1)


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

    def do_GET(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        try:
            if path in ("/", "/index.html"):
                self._send(200, read("index.html").encode("utf-8"), "text/html; charset=utf-8")
            elif path.strip("/") in TAKES and not path.endswith("/"):
                self._send(301, b"", "text/plain", {"Location": path + "/"})
            elif path.strip("/") in TAKES:
                self._send(200, page(path.strip("/")).encode("utf-8"), "text/html; charset=utf-8")
            else:
                self._send(404, b"not found", "text/plain")
        except Exception as e:  # show the error in the browser instead of dropping the connection
            self._send(500, ("Could not build the page: " + str(e)).encode("utf-8"), "text/plain; charset=utf-8")


def main():
    ap = argparse.ArgumentParser(description="Serve the two new takes on the Kentik deployment tool")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}/"
    print(f"Two takes running at {url}  (Canvas: {url}canvas/  Rollout: {url}rollout/)  Ctrl+C to stop")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
