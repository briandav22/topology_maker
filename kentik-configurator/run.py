#!/usr/bin/env python3
"""Infoblox Kentik Deployment Configurator.

  python3 run.py                         start the web app and open it in a browser
  python3 run.py --port 9000 --no-browser
  python3 run.py export setup.json       write the topology PDF and deployment guide for a saved setup
  python3 run.py export setup.json --out exports --only guide
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser(description="Infoblox Kentik Deployment Configurator")
    sub = ap.add_subparsers(dest="cmd")
    ex = sub.add_parser("export", help="build PDFs from a saved setup JSON file")
    ex.add_argument("setup", help="setup JSON saved from the app (Save setup), or one in examples/")
    ex.add_argument("--out", default="exports", help="output folder (default: exports)")
    ex.add_argument("--only", choices=["topology", "guide"], help="build just one of the two PDFs")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    try:
        import reportlab  # noqa: F401
    except ImportError:
        sys.exit("reportlab is missing. Install it with:  python3 -m pip install -r requirements.txt")

    if args.cmd == "export":
        from configurator import model, pdf
        from configurator.web import slug
        with open(args.setup) as f:
            cfg = model.normalize(json.load(f))
        os.makedirs(args.out, exist_ok=True)
        name = slug(cfg["customer"])
        if args.only in (None, "topology"):
            p = os.path.join(args.out, f"infoblox-kentik-topology-{name}.pdf")
            open(p, "wb").write(pdf.topology_pdf(cfg))
            print("wrote", p)
        if args.only in (None, "guide"):
            p = os.path.join(args.out, f"infoblox-kentik-deployment-guide-{name}.pdf")
            open(p, "wb").write(pdf.guide_pdf(cfg))
            print("wrote", p)
        return

    from configurator.web import serve
    serve(args.host, args.port, not args.no_browser)


if __name__ == "__main__":
    main()
