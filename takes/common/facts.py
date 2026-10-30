"""Kentik facts for the two takes, as one JSON bundle built from configurator/catalog.py.

The current app keeps a second copy of some facts in its JavaScript (UACAPS in ui/d5.js).
The takes do not: the page gets every fact from this bundle, so catalog.py stays the one source.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from configurator import catalog as C  # noqa: E402  (catalog.py has no third-party imports)


def _caps():
    out = {}
    for cid in C.CAP_ORDER:
        c = C.CAPABILITIES[cid]
        out[cid] = {
            "id": cid, "name": c["name"], "kbId": c["kb_id"], "short": c["short"], "portLabel": c["port_label"],
            "purpose": c["purpose"], "setup": c["setup"], "license": c["license"], "kb": c["kb"],
            "inbound": [{"src": s, "port": p, "why": w} for s, p, w in c["inbound"]],
            "outbound": [{"dst": d, "port": p, "why": w} for d, p, w in c["outbound_local"]],
        }
    return out


def bundle():
    """Every fact the pages use, keyed for JavaScript."""
    return {
        "checked": "October 2026",
        "kb": {k: {"title": t, "url": u} for k, (t, u) in C.KB.items()},
        "regions": C.REGIONS,
        "caps": _caps(),
        "capOrder": C.CAP_ORDER,
        "sizing": C.SIZING,
        "flowModes": C.FLOW_MODES,
        "headroom": C.HEADROOM,
        "os": {"supported": C.SUPPORTED_OS, "unsupported": C.UNSUPPORTED_OS},
        "installSteps": C.UA_INSTALL_STEPS,
        "proxy": C.UA_PROXY,
        "apiNote": C.UA_API_NOTE,
        "egressNotes": C.EGRESS_NOTES,
        "bgp": C.BGP,
        "clouds": C.CLOUDS,
        "cloudOrder": C.CLOUD_ORDER,
        "aws": {"trust": C.AWS_TRUST_POLICY, "permissions": C.AWS_PERMISSIONS, "steps": C.AWS_STEPS,
                "dataPath": C.AWS_DATA_PATH, "nested": C.AWS_NESTED_STEPS, "secondaryTrust": C.AWS_SECONDARY_TRUST},
        "azure": {"roles": C.AZURE_ROLES, "steps": C.AZURE_STEPS, "auth": C.AZURE_AUTH},
        "gcp": {"filter": C.GCP_FILTER, "sa": C.GCP_SA, "roles": C.GCP_ROLES, "steps": C.GCP_STEPS},
        "oci": {"steps": C.OCI_STEPS, "access": C.OCI_ACCESS, "userPolicy": C.OCI_USER_POLICY, "values": C.OCI_VALUES},
        "synthCredits": C.SYNTH_CREDITS,
        "security": C.SECURITY,
        "licenses": C.LICENSES,
        "openItems": C.OPEN_ITEMS,
        "openItemBgpProxy": C.OPEN_ITEM_BGP_PROXY,
    }


def examples():
    """The setups in examples/, so each take can open them as starting points."""
    d = os.path.join(ROOT, "examples")
    out = []
    for name in sorted(os.listdir(d)):
        if name.endswith(".json"):
            with open(os.path.join(d, name), encoding="utf-8") as f:
                out.append({"file": name, "setup": json.load(f)})
    return out


def script_tag():
    """One inline script that defines window.FACTS and window.EXAMPLES. '<' is escaped so no string can close the tag."""
    data = "window.FACTS=" + json.dumps(bundle()) + ";\nwindow.EXAMPLES=" + json.dumps(examples()) + ";"
    return '<script id="ibk-data">' + data.replace("<", "\\u003c") + "</script>"


if __name__ == "__main__":
    print(json.dumps(bundle(), indent=2)[:2000])
