"""The deployment configuration: defaults, validation and derived numbers (sizing, firewall rules, test credits)."""
import copy
import datetime
import math

from . import catalog as C

# Defaults match the explorer: not everything on, the user toggles what each agent needs
DC_CAPS = ["flow", "snmp", "trap", "syslog"]
BRANCH_CAPS = ["flow", "snmp", "synth"]


def new_site(kind="dc", n=1):
    if kind == "dc":
        return {"name": f"Data Center {n}", "kind": "dc", "location": "", "install": "linux",
                "capabilities": list(DC_CAPS), "flow_mode": "forward", "fps": 20000, "devices": 200,
                "syslog_eps": 2000, "dns_lps": 0, "bgp": False, "proxy": False, "agent": True, "send_to": ""}
    return {"name": f"Branch {n}", "kind": "branch", "location": "", "install": "docker",
            "capabilities": list(BRANCH_CAPS), "flow_mode": "forward", "fps": 2000, "devices": 20,
            "syslog_eps": 200, "dns_lps": 0, "bgp": False, "proxy": False, "agent": False, "send_to": ""}


def new_cloud(cid):
    base = {"enabled": False, "features": ["metadata", "flow"], "accounts": 1, "regions": "", "test_agent": False}
    if cid == "aws":
        base.update(features=["metadata", "flow", "firewall"], multi_account=False)
    elif cid == "azure":
        base.update(features=["metadata", "flow", "firewall"], auth="enterprise")
    elif cid == "oci":
        base.update(access="cross_tenancy")
    return base


def default_config():
    return {
        "customer": "Example Customer",
        "prepared_by": "",
        "prepared_by_email": "",
        "project": "Network observability rollout",
        "date": datetime.date.today().isoformat(),
        "region": "US",
        "sites": [new_site("dc", 1)],
        "clouds": {cid: new_cloud(cid) for cid in C.CLOUD_ORDER},
        "synthetics": {"enabled": True, "site_mesh": True, "mesh_interval_min": 1, "global_agents": 3,
                       "saas_targets": ["Microsoft 365", "Salesforce"], "http_interval_min": 5, "http_timeout_s": 5,
                       "bgp_monitor": False, "bgp_prefixes": 0},
        "detail": "deep",
    }


def normalize(cfg):
    """Merge user input over defaults so every key the renderers need exists."""
    base = default_config()
    out = copy.deepcopy(base)
    cfg = cfg or {}
    for k in ("customer", "prepared_by", "prepared_by_email", "project", "date", "region", "detail"):
        if cfg.get(k) not in (None, ""):
            out[k] = str(cfg[k]).strip()
    if out["region"] not in C.REGIONS:
        out["region"] = "US"
    sites = []
    counters = {"dc": 0, "branch": 0}
    for s in cfg.get("sites", base["sites"]) or []:
        kind = s.get("kind", "dc") if s.get("kind") in ("dc", "branch") else "dc"
        counters[kind] += 1
        site = new_site(kind, counters[kind])
        for k, v in s.items():
            if k in site:
                site[k] = v
        site["capabilities"] = [c for c in C.CAP_ORDER if c in (site["capabilities"] or [])]
        for k in ("fps", "devices", "syslog_eps", "dns_lps"):
            try:
                site[k] = max(0, int(float(site[k] or 0)))
            except (TypeError, ValueError):
                site[k] = 0
        site["name"] = str(site["name"]).strip() or f"Site {len(sites) + 1}"
        if site["install"] not in ("linux", "docker"):
            site["install"] = "linux"
        if site["flow_mode"] not in ("edge", "forward"):
            site["flow_mode"] = "forward"
        if kind == "branch" and "agent" not in s:
            site["agent"] = bool(s.get("capabilities"))  # setups saved before agent-less branches existed
        site["agent"] = True if kind == "dc" else bool(site["agent"])
        if not site["agent"]:
            site["capabilities"] = []
            site["bgp"] = False
        if "bgp" in site["capabilities"]:
            site["bgp"] = False  # routers peer with the agent, not directly with Kentik
        sites.append(site)
    # A branch with no agent sends to a data center agent; default to the first one
    dc_names = [s["name"] for s in sites if s["kind"] == "dc"]
    for s in sites:
        if not s["agent"]:
            s["send_to"] = s["send_to"] if s["send_to"] in dc_names else (dc_names[0] if dc_names else "")
    out["sites"] = sites
    for cid in C.CLOUD_ORDER:
        src = (cfg.get("clouds") or {}).get(cid) or {}
        cl = out["clouds"][cid]
        for k, v in src.items():
            if k in cl:
                cl[k] = v
        feats = [f for f in C.CLOUDS[cid]["features"] if f in (cl["features"] or [])]
        if "metadata" not in feats:
            feats.insert(0, "metadata")  # required by every cloud export
        cl["features"] = feats
        try:
            cl["accounts"] = max(1, int(cl["accounts"] or 1))
        except (TypeError, ValueError):
            cl["accounts"] = 1
    syn = out["synthetics"]
    for k, v in (cfg.get("synthetics") or {}).items():
        if k in syn:
            syn[k] = v
    if isinstance(syn["saas_targets"], str):
        syn["saas_targets"] = [t.strip() for t in syn["saas_targets"].split(",") if t.strip()]
    for k in ("mesh_interval_min", "http_interval_min", "http_timeout_s", "global_agents", "bgp_prefixes"):
        try:
            syn[k] = max(0, float(syn[k] or 0))
        except (TypeError, ValueError):
            syn[k] = 0
    return out


def enabled_clouds(cfg):
    return [cid for cid in C.CLOUD_ORDER if cfg["clouds"][cid]["enabled"]]


def agent_sites(cfg):
    return [s for s in cfg["sites"] if s["agent"]]


def remote_branches(cfg, site=None):
    """Branches with no agent, optionally only those that send to one data center."""
    return [s for s in cfg["sites"] if not s["agent"] and (site is None or s["send_to"] == site["name"])]


def site_sizing(site, cfg=None):
    """Sum KB per-capability sizing for one agent host, then add headroom. Includes branches that send to it."""
    rows = []
    caps = site["capabilities"]
    if not site["agent"]:
        return {"rows": [], "cpu": 0, "ram": 0, "rec_cpu": 0, "rec_ram": 0}
    feeds = remote_branches(cfg, site) if cfg else []
    if feeds:
        site = dict(site, fps=site["fps"] + sum(b["fps"] for b in feeds), devices=site["devices"] + sum(b["devices"] for b in feeds),
                    syslog_eps=site["syslog_eps"] + sum(b["syslog_eps"] for b in feeds))

    def add(key, units, qty_label):
        s = C.SIZING[key]
        if s["cpu"] is None:
            rows.append((s["label"], qty_label, "Not published", 0, 0))
            return
        n = max(1, math.ceil(units / s["per"])) if s["per"] and s.get("scale", True) else 1
        if s["per"] and not s.get("scale", True) and units > s["per"] * 1.5:
            qty_label += " (above the KB figure: confirm with Kentik)"
        rows.append((s["label"], qty_label, f"{s['cpu']} cores / {s['ram']} GB" + (f" x {n}" if n > 1 else ""),
                     s["cpu"] * n, s["ram"] * n))

    if "flow" in caps:
        key = "flow_edge" if site["flow_mode"] == "edge" else "flow_forward"
        add(key, site["fps"], f"{site['fps']:,} flows/s")
    if "snmp" in caps:
        add("snmp", site["devices"], f"{site['devices']:,} devices")
    if "syslog" in caps:
        add("syslog", site["syslog_eps"], f"{site['syslog_eps']:,} events/s")
    if "dns" in caps:
        add("dns", site["dns_lps"], f"{site['dns_lps']:,} lookups/s" if site["dns_lps"] else "per 400k lookups/s")
    if "synth" in caps:
        add("synth", 1, "per agent")
    if "trap" in caps:
        add("trap", 1, "event driven")
    if "ssh" in caps:
        add("ssh", 1, "per fetch interval")
    if "bgp" in caps:
        add("bgp", 1, "per agent")
    cpu = sum(r[3] for r in rows)
    ram = sum(r[4] for r in rows)
    rec_cpu = max(2, math.ceil(cpu * (1 + C.HEADROOM)))
    rec_ram = max(2, math.ceil(ram * (1 + C.HEADROOM)))
    return {"rows": rows, "cpu": cpu, "ram": ram, "rec_cpu": rec_cpu, "rec_ram": rec_ram}


def site_firewall(site, cfg):
    region = C.REGIONS[cfg["region"]]
    if not site["agent"]:
        dc = next((s for s in cfg["sites"] if s["name"] == site["send_to"]), None)
        if not dc:
            return []
        to = f"{dc['name']} Universal Agent (across the WAN)"
        rules = []
        caps = dc["capabilities"]
        if "flow" in caps:
            rules.append(("Branch devices", to, "UDP 9995", "Flow export"))
        if "trap" in caps:
            rules.append(("Branch devices", to, "UDP 162", "SNMP traps"))
        if "syslog" in caps:
            rules.append(("Branch devices", to, "UDP and TCP 514", "Syslog"))
        if "snmp" in caps:
            rules.append((to.replace(" (across the WAN)", ""), "Branch devices", "UDP 161, ICMP", "SNMP/ST polling across the WAN"))
        if "ssh" in caps:
            rules.append((to.replace(" (across the WAN)", ""), "Branch device management IPs", "TCP 22", "Device Configuration Sync across the WAN"))
        return rules
    rules = [("Universal Agent", "Kentik SaaS (" + ", ".join(region["hosts"]) + ")", "TCP 443, TLS 1.2+", "All telemetry, control and updates (outbound only)")]
    if "flow" in site["capabilities"]:
        rules.append(("Universal Agent", "Kentik SaaS", "UDP 40010 (optional)", "Flow Proxy base port"))
    for cid in site["capabilities"]:
        cap = C.CAPABILITIES[cid]
        for src, port, why in cap["inbound"]:
            rules.append((src, "Universal Agent (both directions)" if cid == "synth" else "Universal Agent", port, why))
        for dst, port, why in cap["outbound_local"]:
            if cid == "synth" and dst == "Other Universal Agents":
                continue  # covered by the inbound rule, listed once as bidirectional below
            rules.append(("Universal Agent", dst, port, why))
    if site.get("bgp"):
        rules.append(("Edge routers", "Kentik ingest peering IPs (shown in device settings)", "TCP 179", "BGP peering (direct, telemetry only)"))
    return rules


def synth_agents(cfg):
    """Private test points: sites with Synthetics on, plus cloud test agents."""
    agents = [s["name"] for s in cfg["sites"] if s["agent"] and "synth" in s["capabilities"]]
    for cid in enabled_clouds(cfg):
        if cfg["clouds"][cid].get("test_agent"):
            agents.append(f"{C.CLOUDS[cid]['name']} test agent")
    return agents


def synth_estimate(cfg):
    """Monthly credit estimate using the KB credit rules. Returns rows and total."""
    syn = cfg["synthetics"]
    cr = C.SYNTH_CREDITS
    rows = []
    if not syn["enabled"]:
        return rows, 0
    priv = synth_agents(cfg)
    n = len(priv)
    if syn["site_mesh"] and n >= 2 and syn["mesh_interval_min"]:
        per_run = n * (n - 1) * cr["private_subtest"]
        runs = cr["runs_per_month_1min"] / syn["mesh_interval_min"]
        rows.append((f"Mesh between {n} private agents", f"every {fmt_num(syn['mesh_interval_min'])} min",
                     f"{n} x {n - 1} subtests x 2.5 = {fmt_num(per_run)} per run", per_run * runs))
    targets = syn["saas_targets"]
    if targets and syn["http_interval_min"]:
        g = int(syn["global_agents"])
        t = syn["http_timeout_s"] or 5
        per_run = len(targets) * (n * t * cr["http_private_per_s"] + g * t * cr["http_global_per_s"])
        runs = cr["runs_per_month_1min"] / syn["http_interval_min"]
        rows.append((f"HTTP(S) tests to {len(targets)} SaaS app(s)", f"every {fmt_num(syn['http_interval_min'])} min",
                     f"{n} private + {g} global agents, {fmt_num(t)} s timeout = {fmt_num(per_run)} per run", per_run * runs))
    if syn["bgp_monitor"]:
        p = max(1, int(syn["bgp_prefixes"] or 1))
        monthly = cr["bgp_per_minute"] * cr["runs_per_month_1min"] * p
        rows.append((f"BGP Monitor ({p} test{'s' if p > 1 else ''})", "continuous", "0.53 credits per minute", monthly))
    return rows, sum(r[3] for r in rows)


def fmt_num(x):
    if isinstance(x, float) and x.is_integer():
        x = int(x)
    if isinstance(x, int):
        return f"{x:,}"
    return f"{x:,.1f}"


def summary_counts(cfg):
    dcs = [s for s in cfg["sites"] if s["kind"] == "dc"]
    br = [s for s in cfg["sites"] if s["kind"] == "branch"]
    return {"dcs": len(dcs), "branches": len(br), "agents": len(agent_sites(cfg)), "remote": len(remote_branches(cfg)), "clouds": enabled_clouds(cfg)}
