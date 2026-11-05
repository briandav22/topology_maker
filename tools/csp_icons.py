#!/usr/bin/env python3
"""Make ui/csp-icons.svg: the official cloud provider icons that the cloud views and the AWS card show.

The icon packages are not kept in this repository. To update the icons:
  1. Download and unzip each package. README.md, "Cloud provider icons", gives the links.
  2. Run this script with the folders that unzip made (the Oracle package gives one draw.io library file):
       python3 -I tools/csp_icons.py --aws DIR --azure DIR --gcp-core DIR --gcp-cat DIR --oci "DIR/OCI Library.xml"
  3. Run sh ui/build.sh.

The drawings stay as the providers made them: no crop, new color or new shape. The script removes titles, comments
and ids that nothing uses, gives the gradient ids a prefix, and moves <style> class rules into style attributes, so
the icons can share one page. Oracle gives its icons as draw.io shapes; the script turns them into SVG paths.
Standard library only. Read only files from the official packages: the script trusts the XML that it parses.
"""
import argparse, base64, glob, json, os, re, sys, urllib.parse, zlib
import xml.etree.ElementTree as ET

# Symbol name (the page uses it as #i-<name>) -> the file in the package, as a glob pattern.
AWS = {
    'aws-logo': 'Architecture-Group-Icons_*/AWS-Cloud-logo_32.svg',
    'aws-account': 'Architecture-Group-Icons_*/AWS-Account_32.svg',
    'aws-vpc': 'Architecture-Service-Icons_*/Arch_Networking-Content-Delivery/48/Arch_Amazon-Virtual-Private-Cloud_48.svg',
    'aws-tgw': 'Architecture-Service-Icons_*/Arch_Networking-Content-Delivery/48/Arch_AWS-Transit-Gateway_48.svg',
    'aws-nfw': 'Architecture-Service-Icons_*/Arch_Security-Identity/48/Arch_AWS-Network-Firewall_48.svg',
    'aws-iam': 'Architecture-Service-Icons_*/Arch_Security-Identity/48/Arch_AWS-Identity-and-Access-Management_48.svg',
    'aws-cw': 'Architecture-Service-Icons_*/Arch_Management-Tools/48/Arch_Amazon-CloudWatch_48.svg',
    'aws-s3': 'Architecture-Service-Icons_*/Arch_Storage/48/Arch_Amazon-Simple-Storage-Service_48.svg',
}
AZURE = {
    'az-vnet': '**/Icons/networking/10061-icon-service-Virtual-Networks.svg',
    'az-nw': '**/Icons/networking/10066-icon-service-Network-Watcher.svg',
    'az-fw': '**/Icons/networking/10084-icon-service-Firewalls.svg',
    'az-sa': '**/Icons/storage/10086-icon-service-Storage-Accounts.svg',
    'az-app': '**/Icons/identity/10225-icon-service-Enterprise-Applications.svg',
}
# Google gives a unique icon to its main products only; every other product uses the icon of its category.
GCP_CORE = {
    'gcp-run': 'Unique Icons/Cloud Run/SVG/*-512-color*.svg',
    'gcp-gce': 'Unique Icons/Compute Engine/SVG/*-512-color*.svg',
}
GCP_CAT = {
    'gcp-net': 'Category Icons/Networking/SVG/*-512-color*.svg',          # VPC
    'gcp-ops': 'Category Icons/Operations/SVG/*-512-color*.svg',          # Cloud Logging
    'gcp-data': 'Category Icons/Data Analytics/SVG/*-512-color*.svg',     # Pub/Sub
    'gcp-sec': 'Category Icons/Security Identity/SVG/*-512-color*.svg',   # IAM
}
OCI = {   # titles of entries in the draw.io library
    'oci-vcn': 'Networking - Virtual Cloud Network VCN',
    'oci-log': 'Observability and Management - Logging',
    'oci-conn': 'Analytics and AI - Service Connector Hub',
    'oci-os': 'Storage - Object Storage',
    'oci-policy': 'Identity and Security - Policies',
}

SVGNS, XLINK, XMLNS = 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/XML/1998/namespace'
DROP = {'title', 'desc', 'metadata', 'style'}
REFUSE = {'text', 'image', 'foreignObject', 'script', 'a', 'switch'}
URL = re.compile(r'url\(\s*#([^)\s]+)\s*\)')


def fail(msg):
    sys.exit('csp_icons: ' + msg)


def find(root, pattern):
    hits = [p for p in glob.glob(os.path.join(root, pattern), recursive=True) if '__MACOSX' not in p]
    if len(hits) != 1:
        fail('%d files match %s under %s (need exactly 1)' % (len(hits), pattern, root))
    return hits[0]


def local(name):
    return name.rsplit('}', 1)[-1]


def esc(v):
    return v.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')


def num(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s


def css_rules(root):
    """Class rules of the <style> elements: {class: [declaration, ...]}. Only simple .class selectors are allowed."""
    rules = {}
    for st in root.iter('{%s}style' % SVGNS):
        text = re.sub(r'/\*.*?\*/', '', st.text or '', flags=re.S)
        for sel, body in re.findall(r'([^{}]+)\{([^}]*)\}', text):
            decls = [re.sub(r'\s*:\s*', ':', d.strip(), count=1) for d in body.split(';') if d.strip()]
            for s in sel.split(','):
                s = s.strip()
                if not re.fullmatch(r'\.[\w-]+', s):
                    fail('unsupported CSS selector %r' % s)
                rules.setdefault(s[1:], []).extend(decls)
    return rules


def svg_symbol(path, name):
    root = ET.parse(path).getroot()
    if local(root.tag) != 'svg':
        fail(path + ' is not an SVG')
    rules = css_rules(root)
    refs = set()
    for e in root.iter():
        for k, v in e.attrib.items():
            refs.update(URL.findall(v))
            if local(k) == 'href' and v.startswith('#'):
                refs.add(v[1:])
    for decls in rules.values():
        for d in decls:
            refs.update(URL.findall(d))
    order = [e.get('id') for e in root.iter() if e.get('id') in refs]   # document order, so the output is stable
    if set(order) != refs:
        fail('%s refers to ids it does not define: %s' % (path, sorted(refs - set(order))))
    newid = {old: '%s-%d' % (name, i + 1) for i, old in enumerate(order)}

    def fix(v, href=False):
        if href:
            return '#' + newid[v[1:]] if v.startswith('#') and v[1:] in newid else v
        return URL.sub(lambda m: 'url(#%s)' % newid[m.group(1)], v)

    def attrs(e, skip):
        out, style, own = [], [], None
        for k, v in e.attrib.items():
            if k.startswith('{') and not k.startswith('{%s}' % XLINK):
                continue                      # xml:space, editor attributes
            lk = local(k)
            if lk in skip or lk.startswith('data-'):
                continue
            if lk == 'class':
                for c in v.split():
                    style.extend(rules.get(c, []))
            elif lk == 'id':
                if v in newid:
                    out.append(('id', newid[v]))
            elif lk == 'style':
                own = v
            else:
                out.append((lk, fix(v, lk == 'href')))   # xlink:href becomes href
        if own:
            style.extend(d.strip() for d in own.split(';') if d.strip())   # the element's own style wins over its classes
        if style:
            out.append(('style', fix(';'.join(style))))
        return out

    def ser(e):
        if not e.tag.startswith('{%s}' % SVGNS):
            return ''                         # elements of editors (sodipodi, inkscape)
        tag = local(e.tag)
        if tag in DROP:
            return ''
        if tag in REFUSE:
            fail('%s has a <%s>; this script handles drawings only' % (path, tag))
        if (e.text or '').strip():
            fail('%s has text in <%s>' % (path, tag))
        inner = ''.join(ser(c) for c in e)
        a = ''.join(' %s="%s"' % (k, esc(v)) for k, v in attrs(e, ()))
        return '<%s%s>%s</%s>' % (tag, a, inner, tag) if inner else '<%s%s/>' % (tag, a)

    vb = root.get('viewBox')
    if not vb:
        vb = '0 0 %s %s' % (root.get('width', '').replace('px', ''), root.get('height', '').replace('px', ''))
    own = dict(attrs(root, {'width', 'height', 'viewBox', 'version', 'x', 'y', 'id', 'enable-background', 'preserveAspectRatio'}))
    base = {'fill': '#000', 'stroke': 'none'}   # the defaults of a standalone SVG, so nothing from the page leaks in
    base.update(own)
    a = ''.join(' %s="%s"' % (k, esc(v)) for k, v in base.items())
    body = ''.join(ser(c) for c in root)
    if 'currentColor' in body:
        fail(path + ' uses currentColor')
    return '<symbol id="i-%s" viewBox="%s"%s>%s</symbol>' % (name, vb, a, body)


def unz(s):
    return urllib.parse.unquote(zlib.decompress(base64.b64decode(s), -15).decode('utf-8'))


def oci_symbol(entries, title, name):
    """One draw.io library entry -> an SVG symbol. Each shape cell holds a stencil: paths in a 0-100 box (or the
    stencil's w x h), stretched over the cell's geometry. Cell positions are relative to the parent cell."""
    hits = [e for e in entries if e.get('title') == title]
    if len(hits) != 1:
        fail('%d library entries are called %r' % (len(hits), title))
    model = ET.fromstring(unz(hits[0]['xml']))
    cells = {c.get('id'): c for c in model.iter('mxCell')}

    def geo(c):
        g = c.find('mxGeometry')
        if g is None:
            return None
        return [float(g.get(k, 0)) for k in ('x', 'y', 'width', 'height')]

    def origin(c):
        x = y = 0.0
        p = cells.get(c.get('parent'))
        while p is not None:
            g = geo(p)
            if g and p.get('vertex') == '1':
                x, y = x + g[0], y + g[1]
            p = cells.get(p.get('parent'))
        return x, y

    paths, box = [], [1e9, 1e9, -1e9, -1e9]
    for c in model.iter('mxCell'):
        style = dict(kv.split('=', 1) for kv in (c.get('style') or '').split(';') if '=' in kv)
        fill = style.get('fillColor', 'none')
        if fill == 'none' or not style.get('shape', '').startswith('stencil('):
            continue                          # the group cell and the label box draw nothing
        for k in ('rotation', 'flipH', 'flipV', 'direction'):
            if style.get(k, '0') not in ('0', 'east'):
                fail('%s: a cell uses %s, which this script does not handle' % (title, k))
        if style.get('gradientColor', 'none') != 'none' or style.get('strokeColor', 'none') != 'none':
            fail('%s: a cell has a gradient or a stroke, which this script does not handle' % title)
        ox, oy = origin(c)
        gx, gy, gw, gh = geo(c)
        ox, oy = ox + gx, oy + gy
        shape = ET.fromstring(unz(style['shape'][len('stencil('):-1]))
        sx, sy = gw / float(shape.get('w', 100)), gh / float(shape.get('h', 100))
        box = [min(box[0], ox), min(box[1], oy), max(box[2], ox + gw), max(box[3], oy + gh)]

        def pt(x, y):
            return '%s %s' % (num(ox + float(x) * sx), num(oy + float(y) * sy))

        color, d = fill, []
        for part in [shape.find('background'), shape.find('foreground')]:
            if part is None:
                continue
            for op in part:
                if op.tag == 'path':
                    d = []
                    for s in op:
                        a = s.attrib
                        if s.tag == 'move':
                            d.append('M' + pt(a['x'], a['y']))
                        elif s.tag == 'line':
                            d.append('L' + pt(a['x'], a['y']))
                        elif s.tag == 'curve':
                            d.append('C' + ' '.join(pt(a['x%d' % i], a['y%d' % i]) for i in (1, 2, 3)))
                        elif s.tag == 'quad':
                            d.append('Q' + ' '.join(pt(a['x%d' % i], a['y%d' % i]) for i in (1, 2)))
                        elif s.tag == 'close':
                            d.append('Z')
                        else:
                            fail('%s: stencil path step <%s> is not handled' % (title, s.tag))
                elif op.tag in ('fill', 'fillstroke'):
                    if d:
                        paths.append('<path d="%s" fill="%s"/>' % (''.join(d), color))
                    d = []
                elif op.tag == 'fillcolor':
                    color = op.get('color')
                elif op.tag in ('stroke', 'strokecolor', 'strokewidth'):
                    pass                      # every cell has strokeColor=none, checked above
                else:
                    fail('%s: stencil step <%s> is not handled' % (title, op.tag))
    vb = '%s %s %s %s' % (num(box[0]), num(box[1]), num(box[2] - box[0]), num(box[3] - box[1]))
    return '<symbol id="i-%s" viewBox="%s" fill="#000" stroke="none">%s</symbol>' % (name, vb, ''.join(paths))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description='Make ui/csp-icons.svg from the official icon packages.')
    ap.add_argument('--aws', required=True, help='the unzipped AWS Architecture Icons package')
    ap.add_argument('--azure', required=True, help='the unzipped Azure Architecture Icons package')
    ap.add_argument('--gcp-core', required=True, help='the unzipped Google Cloud core product icons')
    ap.add_argument('--gcp-cat', required=True, help='the unzipped Google Cloud product category icons')
    ap.add_argument('--oci', required=True, help='"OCI Library.xml" from the OCI Architecture Diagram Toolkit for draw.io')
    ap.add_argument('--out', default=os.path.join(here, '..', 'ui', 'csp-icons.svg'))
    a = ap.parse_args()
    syms, src = [], []
    for table, root in ((AWS, a.aws), (AZURE, a.azure), (GCP_CORE, a.gcp_core), (GCP_CAT, a.gcp_cat)):
        for name, pattern in table.items():
            path = find(root, pattern)
            syms.append(svg_symbol(path, name))
            src.append(os.path.relpath(path, root))
    raw = open(a.oci, encoding='utf-8').read()
    entries = json.loads(raw[raw.index('['):raw.rindex(']') + 1])
    for name, title in OCI.items():
        syms.append(oci_symbol(entries, title, name))
        src.append('draw.io entry "%s"' % title)
    out = ('<svg id="csp" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">\n'
           '<!-- Official icons of AWS, Microsoft Azure, Google Cloud and Oracle Cloud Infrastructure, unchanged.'
           ' Made by tools/csp_icons.py: do not edit by hand. Sources and terms: README.md, "Cloud provider icons". -->\n'
           '<defs>\n' + '\n'.join(syms) + '\n</defs>\n</svg>\n')
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(out)
    for s, f in zip(syms, src):
        print('%6d  %-14s %s' % (len(s), re.match(r'<symbol id="([^"]+)"', s).group(1), f))
    print('%6d  total, written to %s' % (len(out), os.path.normpath(a.out)))


if __name__ == '__main__':
    main()
