"""Infoblox branding used by the web app and every export.

Edit this one file to match the official brand kit. If you have the official
logo, save it as assets/infoblox-logo.png (a wide, transparent PNG works best)
and it replaces the drawn wordmark in every PDF and in the web app.
"""
import os

NAME = "Infoblox"
PRODUCT_LINE = "Network Observability powered by Kentik"
FOOTER_NOTE = "Infoblox Confidential. Prepared for the named customer only."

# Brand palette (approximation of the Infoblox brand; swap in official hex values here)
NAVY = "#0B1F3A"        # primary dark: headers, title bars, wordmark
GREEN = "#2DB24A"       # signature accent: rules, highlights, the "box" in the wordmark
TEAL = "#00A3AD"        # secondary accent: cloud
BLUE = "#1A6FD1"        # links, on-prem agents
INK = "#1D2733"         # body text
MUTED = "#5B6878"       # secondary text
LINE = "#D5DBE3"        # hairlines and borders
PANEL = "#F3F6F9"       # light panel background
WHITE = "#FFFFFF"

# Colors for each kind of connection or capability (diagram legend)
FLOW_COLORS = {
    "https": "#1A6FD1",   # to Kentik over HTTPS
    "pull": "#00A3AD",    # Kentik reads from the cloud
    "flow": "#2DB24A",
    "snmp": "#7A4CC2",
    "st": "#65A30D",
    "trap": "#E0861A",
    "syslog": "#C2417A",
    "dns": "#0B8F86",
    "synth": "#D4A20B",
    "ssh": "#5B6878",
    "bgp": "#B23A3A",
}

ASSET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
LOGO_PATH = os.path.join(ASSET_DIR, "infoblox-logo.png")


def logo_file():
    """Return the official logo path if one was dropped in, otherwise None."""
    return LOGO_PATH if os.path.exists(LOGO_PATH) else None
