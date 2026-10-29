#!/bin/sh
# Builds the app page (configurator/static/explorer.html) from the parts. p1 = head (title, styles), p2 = body markup and icons, the rest = scripts.
set -e
cd "$(dirname "$0")"
OUT=${1:-../configurator/static/explorer.html}
mkdir -p "$(dirname "$OUT")"
ICON='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 15.924 15.924%22%3E%3Cpath fill=%22%2300bd4d%22 d=%22M7.962 0L11.348 3.386L7.962 6.773L4.576 3.386ZM3.387 4.576L6.773 7.962L3.387 11.349L0 7.962ZM12.538 4.576L15.924 7.962L12.538 11.349L9.152 7.962ZM7.962 9.152L11.348 12.538L7.962 15.924L4.576 12.538Z%22/%3E%3C/svg%3E'
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  printf '<meta name="description" content="Interactive guide to how Infoblox + Kentik is deployed: data centers with Universal Agents, branches, AWS, Azure, Google Cloud, OCI and SaaS testing.">\n'
  printf '<link rel="icon" href="%s">\n' "$ICON"
  cat p1.html
  printf '</head>\n<body>\n'
  cat p2.html
  printf '<script>\n'; cat d1.js d2.js d3.js d4.js d5.js r1.js r2.js r3.js; printf '</script>\n'
  printf '</body>\n</html>\n'
} > "$OUT"
wc -c "$OUT"
