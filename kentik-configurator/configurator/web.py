"""Local web app: pick the deployment, see the topology live, export PDFs. Standard library only (plus reportlab)."""
import json
import re
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import brand as B
from . import catalog as C
from . import model as M
from . import pdf as PDF
from . import topology as T

PRESETS = {
    "dc_aws": {"label": "Data center + AWS", "sites": [M.new_site("dc", 1)], "clouds": ["aws"]},
    "multi_dc": {"label": "Multiple data centers", "sites": [M.new_site("dc", 1), M.new_site("dc", 2), M.new_site("dc", 3)], "clouds": []},
    "hybrid": {"label": "Hybrid", "sites": [M.new_site("dc", 1), M.new_site("dc", 2), M.new_site("branch", 1)], "clouds": ["aws", "azure"]},
    "multicloud": {"label": "Multi-cloud", "sites": [], "clouds": ["aws", "azure", "gcp", "oci"]},
    "everything": {"label": "Everything", "sites": [M.new_site("dc", 1), M.new_site("dc", 2), M.new_site("branch", 1), M.new_site("branch", 2)],
                   "clouds": ["aws", "azure", "gcp", "oci"]},
}


def catalog_payload():
    return {
        "defaults": M.default_config(),
        "newSite": {"dc": M.new_site("dc", 1), "branch": M.new_site("branch", 1)},
        "caps": [{"id": c, "name": C.CAPABILITIES[c]["name"], "port": C.CAPABILITIES[c]["port_label"],
                  "color": B.FLOW_COLORS[C.CAPABILITIES[c]["color"]]} for c in C.CAP_ORDER],
        "clouds": [{"id": c, "name": C.CLOUDS[c]["full"], "features": C.CLOUDS[c]["features"]} for c in C.CLOUD_ORDER],
        "regions": {k: v["label"] for k, v in C.REGIONS.items()},
        "presets": {k: {"label": v["label"], "sites": v["sites"], "clouds": v["clouds"]} for k, v in PRESETS.items()},
    }


def preview_payload(cfg):
    cfg = M.normalize(cfg)
    sc = T.build(cfg)
    sites = []
    for s in cfg["sites"]:
        z = M.site_sizing(s)
        sites.append({"name": s["name"], "cpu": z["rec_cpu"], "ram": z["rec_ram"]})
    rows, total = M.synth_estimate(cfg)
    return {"svg": T.to_svg(sc), "sites": sites, "credits": round(total), "clouds": M.enabled_clouds(cfg)}


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
        if self.path in ("/", "/index.html"):
            self._send(200, page_html().encode("utf-8"), "text/html; charset=utf-8")
        elif self.path == "/api/catalog":
            self._send(200, json.dumps(catalog_payload()).encode(), "application/json")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        try:
            cfg = self._json_body()
            if self.path == "/api/preview":
                self._send(200, json.dumps(preview_payload(cfg)).encode(), "application/json")
            elif self.path in ("/api/export/topology", "/api/export/guide"):
                norm = M.normalize(cfg)
                kind = "topology" if self.path.endswith("topology") else "deployment-guide"
                data = PDF.topology_pdf(norm) if kind == "topology" else PDF.guide_pdf(norm)
                name = f"infoblox-kentik-{kind}-{slug(norm['customer'])}.pdf"
                self._send(200, data, "application/pdf", {"Content-Disposition": f'attachment; filename="{name}"'})
            else:
                self._send(404, b"not found", "text/plain")
        except Exception as e:  # surface errors to the UI instead of dropping the connection
            self._send(500, json.dumps({"error": str(e)}).encode(), "application/json")


def serve(host="127.0.0.1", port=8765, open_browser=True):
    httpd = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{port}/"
    print(f"Infoblox Kentik Deployment Configurator running at {url}  (Ctrl+C to stop)")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


def page_html():
    css_vars = (f"--navy:{B.NAVY};--green:{B.GREEN};--teal:{B.TEAL};--blue:{B.BLUE};--ink:{B.INK};"
                f"--muted:{B.MUTED};--line:{B.LINE};--panel:{B.PANEL}")
    return PAGE.replace("/*VARS*/", css_vars).replace("{{PRODUCT}}", B.PRODUCT_LINE)


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kentik Deployment Configurator · Infoblox</title>
<style>
:root{/*VARS*/}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:var(--ink);background:#E9EEF3}
header{background:var(--navy);color:#fff;display:flex;align-items:center;gap:16px;padding:0 20px;height:58px;border-bottom:3px solid var(--green);position:sticky;top:0;z-index:5}
.wm{display:flex;align-items:center;gap:8px;font-weight:800;font-size:21px;letter-spacing:-.3px}
.wm i{width:18px;height:18px;border-radius:4px;background:var(--green);display:inline-grid;place-items:center}
.wm i:after{content:"";width:7px;height:7px;border-radius:2px;background:var(--navy)}
header .t{font-weight:600;font-size:15px;opacity:.95}
header .s{font-size:12px;color:#BFD0E6;margin-left:auto}
main{display:grid;grid-template-columns:440px 1fr;height:calc(100vh - 61px)}
#form{overflow:auto;padding:16px;background:#fff;border-right:1px solid var(--line)}
#right{overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px}
h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--navy);margin:18px 0 8px;display:flex;align-items:center;gap:8px}
h2:after{content:"";flex:1;height:2px;background:var(--green);opacity:.6}
h2:first-child{margin-top:0}
label{display:block;font-size:12px;color:var(--muted);margin:6px 0 2px}
input[type=text],input[type=number],input[type=email],select{width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;font:inherit;color:var(--ink);background:#fff}
input:focus,select:focus{outline:2px solid var(--blue);outline-offset:-1px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.card{border:1px solid var(--line);border-left:4px solid var(--blue);border-radius:8px;padding:10px 12px;margin:8px 0;background:#fff}
.card.branch{border-left-color:var(--teal)}
.card.cloud{border-left-color:var(--teal)}
.card.off{opacity:.7;border-left-color:var(--line)}
.card .hd{display:flex;align-items:center;gap:8px}
.card .hd input[type=text]{font-weight:600}
.kind{font-size:10.5px;font-weight:700;letter-spacing:.06em;color:var(--blue);white-space:nowrap}
.branch .kind{color:var(--teal)}
.iconbtn{border:1px solid var(--line);background:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;color:var(--muted);font-size:12px;white-space:nowrap}
.iconbtn:hover{color:var(--ink);border-color:var(--muted)}
.caps{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.cap{display:flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:14px;padding:3px 9px 3px 6px;font-size:12px;cursor:pointer;user-select:none}
.cap input{margin:0}
.cap.on{border-color:var(--c);background:color-mix(in srgb,var(--c) 10%,#fff)}
.cap .dot{width:8px;height:8px;border-radius:2px;background:var(--c)}
.chk{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink);margin:6px 0 0;cursor:pointer}
.btns{display:flex;flex-wrap:wrap;gap:6px}
.btn{border:1px solid var(--line);background:#fff;border-radius:7px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;color:var(--ink)}
.btn:hover{border-color:var(--navy)}
.btn.primary{background:var(--navy);border-color:var(--navy);color:#fff;font-weight:600}
.btn.primary:hover{background:#13305a}
.btn.green{background:var(--green);border-color:var(--green);color:#fff;font-weight:600}
.preset{font-size:12px;padding:5px 10px;border-radius:14px}
.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.bar .grow{flex:1}
.stat{font-size:12px;color:var(--muted)}.stat b{color:var(--navy);font-size:15px;margin-right:3px}
#svgwrap{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;min-height:300px}
#svgwrap svg{width:100%;height:auto;display:block}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:7px;overflow:hidden}
.seg button{border:0;background:#fff;padding:6px 11px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--muted)}
.seg button.on{background:var(--navy);color:#fff}
.sub{font-size:11.5px;color:var(--muted);margin-top:4px}
#toast{position:fixed;bottom:18px;right:18px;background:var(--navy);color:#fff;padding:10px 14px;border-radius:8px;border-left:4px solid var(--green);display:none;font-size:13px}
.feat{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px}
.feat label{display:flex;align-items:center;gap:5px;color:var(--ink);font-size:12.5px;margin:0}
@media (max-width:900px){main{grid-template-columns:1fr;height:auto}#form{border-right:0}}
</style></head>
<body>
<header><div class="wm"><i></i>infoblox</div><div class="t">Kentik Deployment Configurator</div><div class="s">{{PRODUCT}}</div></header>
<main>
<section id="form"></section>
<section id="right">
  <div class="bar">
    <div class="stat" id="stats"></div><div class="grow"></div>
    <div class="seg" id="detail"><button data-v="high">High level</button><button data-v="deep">Deep dive</button></div>
  </div>
  <div class="bar">
    <button class="btn primary" id="expTopo">Export topology PDF</button>
    <button class="btn green" id="expGuide">Export deployment guide PDF</button>
    <div class="grow"></div>
    <button class="btn" id="save">Save setup</button>
    <label class="btn" style="margin:0;color:var(--ink)">Load setup<input type="file" id="load" accept=".json" hidden></label>
  </div>
  <div id="svgwrap"></div>
</section>
</main>
<div id="toast"></div>
<script>
let CAT, S;
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
function toast(t){const el=$('#toast');el.textContent=t;el.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>el.style.display='none',2600)}

async function init(){
  CAT = await (await fetch('/api/catalog')).json();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('kentik-config') || 'null'); } catch(e) {}
  S = saved || clone(CAT.defaults);
  render(); preview();
}

function renumber(kind){ return S.sites.filter(s => s.kind === kind).length + 1; }

function render(){
  const f = $('#form');
  let h = `<h2>Engagement</h2>
  <label>Customer</label><input type="text" data-k="customer" value="${esc(S.customer)}">
  <label>Project</label><input type="text" data-k="project" value="${esc(S.project)}">
  <div class="row"><div><label>Prepared by</label><input type="text" data-k="prepared_by" value="${esc(S.prepared_by)}"></div>
  <div><label>Email</label><input type="email" data-k="prepared_by_email" value="${esc(S.prepared_by_email)}"></div></div>
  <div class="row"><div><label>Kentik region</label><select data-k="region">${Object.entries(CAT.regions).map(([k,v])=>`<option value="${k}" ${S.region===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
  <div><label>Date</label><input type="text" data-k="date" value="${esc(S.date)}"></div></div>
  <h2>Start from a preset</h2><div class="btns">${Object.entries(CAT.presets).map(([k,p])=>`<button class="btn preset" data-preset="${k}">${esc(p.label)}</button>`).join('')}</div>
  <h2>On-prem sites · Universal Agent</h2>
  <div class="sub">One Universal Agent per site, with capabilities switched on. Add as many data centers and branches as you need.</div>`;
  S.sites.forEach((s, i) => {
    h += `<div class="card ${s.kind}" data-site="${i}">
      <div class="hd"><span class="kind">${s.kind==='dc'?'DATA CENTER':'BRANCH'}</span><input type="text" data-s="name" value="${esc(s.name)}">
      <button class="iconbtn" data-act="dup" title="Duplicate">Copy</button><button class="iconbtn" data-act="del" title="Remove">Remove</button></div>
      <div class="row"><div><label>Location</label><input type="text" data-s="location" value="${esc(s.location)}" placeholder="City, region"></div>
      <div><label>Install on</label><select data-s="install"><option value="linux" ${s.install==='linux'?'selected':''}>Linux host or VM</option><option value="docker" ${s.install==='docker'?'selected':''}>Docker</option></select></div></div>
      <label>Capabilities</label><div class="caps">${CAT.caps.map(c=>`<label class="cap ${s.capabilities.includes(c.id)?'on':''}" style="--c:${c.color}" title="${esc(c.port)}"><input type="checkbox" data-cap="${c.id}" ${s.capabilities.includes(c.id)?'checked':''}><span class="dot"></span>${esc(c.name)}</label>`).join('')}</div>
      <div class="row3">
        ${s.capabilities.includes('flow')?`<div><label>Flow mode</label><select data-s="flow_mode"><option value="edge" ${s.flow_mode==='edge'?'selected':''}>Edge Processing</option><option value="forward" ${s.flow_mode==='forward'?'selected':''}>Forwarding (beta)</option></select></div><div><label>Flows / sec</label><input type="number" min="0" data-s="fps" value="${s.fps}"></div>`:''}
        ${s.capabilities.includes('snmp')?`<div><label>Devices</label><input type="number" min="0" data-s="devices" value="${s.devices}"></div>`:''}
        ${s.capabilities.includes('syslog')?`<div><label>Syslog events / sec</label><input type="number" min="0" data-s="syslog_eps" value="${s.syslog_eps}"></div>`:''}
        ${s.capabilities.includes('dns')?`<div><label>DNS lookups / sec</label><input type="number" min="0" data-s="dns_lps" value="${s.dns_lps}"></div>`:''}
      </div>
      <label class="chk"><input type="checkbox" data-s="bgp" ${s.bgp?'checked':''}> Edge routers peer BGP with Kentik</label>
      <label class="chk"><input type="checkbox" data-s="proxy" ${s.proxy?'checked':''}> Outbound through a web proxy</label>
    </div>`;
  });
  h += `<div class="btns"><button class="btn" data-add="dc">+ Add data center</button><button class="btn" data-add="branch">+ Add branch</button></div>
  <h2>Public cloud · agentless</h2>`;
  CAT.clouds.forEach(c => {
    const cl = S.clouds[c.id];
    const extra = c.id==='aws' ? `<label class="chk"><input type="checkbox" data-c="multi_account" ${cl.multi_account?'checked':''}> Many accounts (hub role)</label>`
      : c.id==='azure' ? `<label>Kentik access</label><select data-c="auth"><option value="enterprise" ${cl.auth!=='custom'?'selected':''}>Kentik enterprise app</option><option value="custom" ${cl.auth==='custom'?'selected':''}>Customer app registration</option></select>`
      : c.id==='oci' ? `<label>Kentik access</label><select data-c="access"><option value="cross_tenancy" ${cl.access!=='user'?'selected':''}>Cross-tenancy policy (recommended)</option><option value="user" ${cl.access==='user'?'selected':''}>API key user and group</option></select>` : '';
    const unit = {aws:'Accounts',azure:'Subscriptions',gcp:'Projects',oci:'Tenancies'}[c.id];
    h += `<div class="card cloud ${cl.enabled?'':'off'}" data-cloud="${c.id}">
      <label class="chk" style="margin:0;font-weight:600"><input type="checkbox" data-c="enabled" ${cl.enabled?'checked':''}> ${esc(c.name)}</label>
      ${cl.enabled?`<div class="feat">${Object.entries(c.features).map(([k,v])=>`<label><input type="checkbox" data-feat="${k}" ${cl.features.includes(k)?'checked':''} ${k==='metadata'?'disabled':''}> ${esc(v)}</label>`).join('')}</div>
      <div class="row"><div><label>${unit}</label><input type="number" min="1" data-c="accounts" value="${cl.accounts}"></div><div><label>Regions</label><input type="text" data-c="regions" value="${esc(cl.regions)}" placeholder="optional"></div></div>
      ${extra}
      <label class="chk"><input type="checkbox" data-c="test_agent" ${cl.test_agent?'checked':''}> Universal Agent on a VM as a test point</label>`:''}
    </div>`;
  });
  const y = S.synthetics;
  h += `<h2>Synthetic monitoring</h2>
  <div class="card" style="border-left-color:#D4A20B">
  <label class="chk" style="margin:0;font-weight:600"><input type="checkbox" data-y="enabled" ${y.enabled?'checked':''}> Internet and SaaS app testing</label>
  ${y.enabled?`<label class="chk"><input type="checkbox" data-y="site_mesh" ${y.site_mesh?'checked':''}> Mesh between all agents</label>
  <div class="row"><div><label>Mesh interval (min)</label><input type="number" min="1" data-y="mesh_interval_min" value="${y.mesh_interval_min}"></div><div><label>Kentik global agents</label><input type="number" min="0" data-y="global_agents" value="${y.global_agents}"></div></div>
  <label>SaaS apps and sites to test (comma separated)</label><input type="text" data-y="saas_targets" value="${esc((y.saas_targets||[]).join(', '))}">
  <div class="row"><div><label>HTTP interval (min)</label><input type="number" min="1" data-y="http_interval_min" value="${y.http_interval_min}"></div><div><label>HTTP timeout (s)</label><input type="number" min="1" data-y="http_timeout_s" value="${y.http_timeout_s}"></div></div>
  <label class="chk"><input type="checkbox" data-y="bgp_monitor" ${y.bgp_monitor?'checked':''}> BGP Monitor (hijacks, leaks, RPKI)</label>`:''}
  </div>
  <p class="sub">Facts and credit rules come from the Kentik Knowledge Base. Kubernetes and standalone kproxy are not part of this offer.</p>`;
  f.innerHTML = h;
  document.querySelectorAll('#detail button').forEach(b => b.classList.toggle('on', b.dataset.v === (S.detail||'deep')));
}

function num(v){ const n = parseFloat(v); return isNaN(n) ? 0 : n; }

document.addEventListener('input', e => {
  const t = e.target; if (!t.closest('#form')) return;
  const card = t.closest('[data-site]'), cloud = t.closest('[data-cloud]');
  let rerender = false;
  if (t.dataset.k) S[t.dataset.k] = t.value;
  else if (card && t.dataset.s) { const s = S.sites[+card.dataset.site]; s[t.dataset.s] = t.type==='checkbox' ? t.checked : (t.type==='number' ? num(t.value) : t.value); }
  else if (card && t.dataset.cap) { const s = S.sites[+card.dataset.site]; const c = t.dataset.cap;
    s.capabilities = t.checked ? CAT.caps.map(x=>x.id).filter(x => x===c || s.capabilities.includes(x)) : s.capabilities.filter(x => x!==c); rerender = true; }
  else if (cloud && t.dataset.c) { const cl = S.clouds[cloud.dataset.cloud]; cl[t.dataset.c] = t.type==='checkbox' ? t.checked : (t.type==='number' ? num(t.value) : t.value); rerender = t.dataset.c==='enabled'; }
  else if (cloud && t.dataset.feat) { const cl = S.clouds[cloud.dataset.cloud]; const k = t.dataset.feat;
    cl.features = t.checked ? [...new Set([...cl.features, k])] : cl.features.filter(x => x!==k); }
  else if (t.dataset.y) { const y = S.synthetics; const k = t.dataset.y;
    y[k] = t.type==='checkbox' ? t.checked : (k==='saas_targets' ? t.value.split(',').map(x=>x.trim()).filter(Boolean) : num(t.value)); rerender = t.type==='checkbox' && k==='enabled'; }
  if (rerender) { const pos = $('#form').scrollTop; render(); $('#form').scrollTop = pos; }
  changed();
});

document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.add) { S.sites.push(clone(CAT.newSite[t.dataset.add])); const s = S.sites[S.sites.length-1];
    s.name = (t.dataset.add==='dc'?'Data Center ':'Branch ') + (renumber(t.dataset.add)-1); render(); changed();
    $('#form').scrollTop = $('#form').scrollHeight; return; }
  if (t.dataset.act) { const i = +t.closest('[data-site]').dataset.site;
    if (t.dataset.act==='del') S.sites.splice(i,1);
    else { const c = clone(S.sites[i]); c.name += ' (copy)'; S.sites.splice(i+1, 0, c); }
    const pos = $('#form').scrollTop; render(); $('#form').scrollTop = pos; changed(); return; }
  if (t.dataset.preset) { const p = CAT.presets[t.dataset.preset];
    S.sites = clone(p.sites); Object.keys(S.clouds).forEach(k => S.clouds[k].enabled = p.clouds.includes(k));
    render(); changed(); toast('Preset applied: ' + p.label); return; }
  if (t.closest('#detail') && t.dataset.v) { S.detail = t.dataset.v; render(); changed(); }
});

let timer;
function changed(){ try { localStorage.setItem('kentik-config', JSON.stringify(S)); } catch(e) {} clearTimeout(timer); timer = setTimeout(preview, 250); }

async function preview(){
  const r = await fetch('/api/preview', {method:'POST', body: JSON.stringify(S)});
  const d = await r.json();
  if (d.error) { toast('Preview error: ' + d.error); return; }
  $('#svgwrap').innerHTML = d.svg;
  const dcs = S.sites.filter(s=>s.kind==='dc').length, br = S.sites.length - dcs;
  $('#stats').innerHTML = `<span><b>${dcs}</b>data center${dcs===1?'':'s'}</span> &nbsp; <span><b>${br}</b>branch${br===1?'':'es'}</span> &nbsp; <span><b>${d.clouds.length}</b>cloud${d.clouds.length===1?'':'s'}</span> &nbsp; <span><b>${d.sites.reduce((a,s)=>a+s.cpu,0)}</b>vCPU planned</span> &nbsp; <span><b>${d.credits.toLocaleString()}</b>test credits / month</span>`;
}

async function exportPdf(kind){
  toast('Building ' + (kind==='guide'?'deployment guide':'topology') + ' PDF…');
  const r = await fetch('/api/export/' + kind, {method:'POST', body: JSON.stringify(S)});
  if (!r.ok) { const d = await r.json().catch(()=>({})); toast('Export failed: ' + (d.error||r.status)); return; }
  const blob = await r.blob();
  const name = (r.headers.get('Content-Disposition')||'').match(/filename="(.+)"/)?.[1] || kind + '.pdf';
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  toast('Saved ' + name);
}
$('#expTopo').onclick = () => exportPdf('topology');
$('#expGuide').onclick = () => exportPdf('guide');
$('#save').onclick = () => { const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], {type:'application/json'}));
  a.download = 'kentik-setup-' + (S.customer||'customer').toLowerCase().replace(/[^a-z0-9]+/g,'-') + '.json'; a.click(); };
$('#load').onchange = async e => { const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); S = Object.assign(clone(CAT.defaults), d);
    S.clouds = Object.assign(clone(CAT.defaults.clouds), d.clouds||{}); S.synthetics = Object.assign(clone(CAT.defaults.synthetics), d.synthetics||{});
    render(); changed(); toast('Loaded ' + f.name); } catch(err) { toast('Could not read that file'); } e.target.value=''; };
init();
</script>
</body></html>"""
