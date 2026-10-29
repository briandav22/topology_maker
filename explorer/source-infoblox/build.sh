#!/bin/sh
set -e
cd "$(dirname "$0")"
OUT=${1:-../infoblox-kentik-deployment-explorer.html}
mkdir -p "$(dirname "$OUT")"
{ cat p1.html; cat p2.html; printf '<script>\n'; cat d1.js d2.js d3.js d4.js d5.js r1.js r2.js; printf '</script>\n'; } > "$OUT"
wc -c "$OUT"
