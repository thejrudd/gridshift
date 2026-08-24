"""
NFL Team City Map Generator
Generates 32 poster-style city maps, one per NFL team, using OpenStreetMap data
via osmnx. Each map is styled with the team's primary and secondary colors.

Output: public/maps/{team_id}.png  (1200×800 px, ~300 KB each)

Usage:
    python3 scripts/generate_maps.py             # generate all teams
    python3 scripts/generate_maps.py buf kc sea  # generate specific teams
"""

import sys
import os
import math
import matplotlib
matplotlib.use('Agg')  # non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import osmnx as ox

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'maps')

# ── Team definitions ──────────────────────────────────────────────────────────
# Each entry: (city label, lat, lon, primary hex, secondary hex, radius_m)
# radius_m controls how much of the city is shown — smaller = more zoomed in

TEAMS = {
    # AFC EAST
    'buf': ('Buffalo, NY',          42.8864, -78.8784, '#00338D', '#C60C30', 4500),
    'mia': ('Miami, FL',            25.9580, -80.2389, '#008E97', '#FC4C02', 4000),
    'ne':  ('Foxborough, MA',       42.0909, -71.2643, '#002244', '#C60C30', 3500),
    'nyj': ('East Rutherford, NJ',  40.8135, -74.0745, '#125740', '#FFFFFF', 4000),

    # AFC NORTH
    'bal': ('Baltimore, MD',        39.2904, -76.6122, '#241773', '#9E7C0C', 4000),
    'cin': ('Cincinnati, OH',       39.0953, -84.5120, '#FB4F14', '#000000', 4000),
    'cle': ('Cleveland, OH',        41.4963, -81.6944, '#FF3C00', '#311D00', 4000),
    'pit': ('Pittsburgh, PA',       40.4406, -79.9959, '#FFB612', '#101820', 4000),

    # AFC SOUTH
    'hou': ('Houston, TX',          29.7355, -95.4154, '#03202F', '#A71930', 4500),
    'ind': ('Indianapolis, IN',     39.7684, -86.1581, '#002C5F', '#A2AAAD', 4000),
    'jax': ('Jacksonville, FL',     30.3240, -81.6373, '#101820', '#D7A22A', 4500),
    'ten': ('Nashville, TN',        36.1667, -86.7713, '#0C2340', '#4B92DB', 4000),

    # AFC WEST
    'den': ('Denver, CO',           39.7439, -104.9883, '#FB4F14', '#002244', 4500),
    'kc':  ('Kansas City, MO',      39.0997, -94.5786,  '#E31837', '#FFB81C', 4000),
    'lv':  ('Las Vegas, NV',        36.0908, -115.1833,  '#000000', '#A5ACAF', 4500),
    'lac': ('Inglewood, CA',        33.9535, -118.3392,  '#0080C6', '#FFC20E', 4000),

    # NFC EAST
    'dal': ('Arlington, TX',        32.7480, -97.0944,  '#003594', '#869397', 4000),
    'nyg': ('East Rutherford, NJ',  40.8135, -74.0745,  '#0B2265', '#A71930', 4000),
    'phi': ('Philadelphia, PA',     39.9526, -75.1652,  '#004C54', '#A5ACAF', 4000),
    'wsh': ('Landover, MD',         38.9076, -76.8645,  '#5A1414', '#FFB612', 3500),

    # NFC NORTH
    'chi': ('Chicago, IL',          41.8827, -87.6233,  '#0B162A', '#C83803', 5000),
    'det': ('Detroit, MI',          42.3314, -83.0458,  '#0076B6', '#B0B7BC', 4000),
    'gb':  ('Green Bay, WI',        44.5133, -88.0133,  '#203731', '#FFB612', 3500),
    'min': ('Minneapolis, MN',      44.9537, -93.0900,  '#4F2683', '#FFC62F', 4500),

    # NFC SOUTH
    'atl': ('Atlanta, GA',          33.7550, -84.4000,  '#A71930', '#000000', 4500),
    'car': ('Charlotte, NC',        35.2271, -80.8431,  '#0085CA', '#101820', 4000),
    'no':  ('New Orleans, LA',      29.9511, -90.0715,  '#101820', '#D3BC8D', 3500),
    'tb':  ('Tampa, FL',            27.9758, -82.5033,  '#D50A0A', '#34302B', 4000),

    # NFC WEST
    'ari': ('Glendale, AZ',         33.5276, -112.2626,  '#97233F', '#FFB612', 4000),
    'la':  ('Inglewood, CA',        33.9535, -118.3392,  '#003594', '#FFA300', 4000),
    'sf':  ('Santa Clara, CA',      37.4034, -121.9700,  '#AA0000', '#B3995D', 3500),
    'sea': ('Seattle, WA',          47.5952, -122.3316,  '#002244', '#69BE28', 4500),
}

# ── Color helpers ─────────────────────────────────────────────────────────────

def hex_luminance(hex_color):
    """WCAG relative luminance of a hex color."""
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    def lin(c): return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def darken(hex_color, amount=0.35):
    """Darken a hex color by a fraction."""
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    r = max(0, int(r * (1 - amount)))
    g = max(0, int(g * (1 - amount)))
    b = max(0, int(b * (1 - amount)))
    return f'#{r:02x}{g:02x}{b:02x}'

def lighten(hex_color, amount=0.4):
    """Lighten a hex color toward white."""
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    r = min(255, int(r + (255 - r) * amount))
    g = min(255, int(g + (255 - g) * amount))
    b = min(255, int(b + (255 - b) * amount))
    return f'#{r:02x}{g:02x}{b:02x}'

def with_alpha(hex_color, alpha):
    """Return (r,g,b,a) tuple from hex + alpha float."""
    h = hex_color.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    return (r, g, b, alpha)

# ── Map generation ────────────────────────────────────────────────────────────

def generate_map(team_id, label, lat, lon, primary, secondary, radius_m):
    print(f'  [{team_id.upper()}] Fetching OSM data for {label}…')

    try:
        G = ox.graph_from_point(
            (lat, lon),
            dist=radius_m,
            network_type='drive',
            retain_all=False,
        )
    except Exception as e:
        print(f'  [{team_id.upper()}] ERROR fetching graph: {e}')
        return False

    # Derive palette from primary + secondary
    lum = hex_luminance(primary)
    is_dark_primary = lum < 0.15

    bg_color      = darken(primary, 0.5) if not is_dark_primary else darken(primary, 0.6)
    # For very dark primaries (black teams etc.), use a slightly lighter dark bg
    if lum < 0.02:
        bg_color = '#0a0a0a'

    # Road colors — secondary at varying opacity/weight
    road_primary_color   = with_alpha(secondary, 0.85)  # main arterials
    road_secondary_color = with_alpha(secondary, 0.45)  # secondary roads
    road_minor_color     = with_alpha(secondary, 0.20)  # residential/minor

    # Edge classification by highway tag
    edges = ox.graph_to_gdfs(G, nodes=False)

    def tier_of(highway):
        if isinstance(highway, list):
            highway = highway[0]
        if highway in ('motorway', 'trunk'):
            return 'primary'
        elif highway in ('motorway_link', 'trunk_link', 'primary', 'primary_link',
                         'secondary', 'secondary_link', 'tertiary', 'tertiary_link'):
            return 'secondary'
        else:
            return 'minor'

    TIER_STYLE = {
        'primary':   (2.2, road_primary_color),
        'secondary': (0.9, road_secondary_color),
        'minor':     (0.45, road_minor_color),
    }

    fig, ax = plt.subplots(figsize=(12, 8), dpi=100)
    fig.patch.set_facecolor(bg_color)
    ax.set_facecolor(bg_color)

    edges['_tier'] = edges['highway'].apply(tier_of)

    # Draw roads in batches by tier (minor first so major roads render on top)
    for tier in ('minor', 'secondary', 'primary'):
        subset = edges[edges['_tier'] == tier]
        if subset.empty:
            continue
        lw, color = TIER_STYLE[tier]
        subset.plot(ax=ax, color=color, linewidth=lw, capstyle='round', joinstyle='round')

    ax.set_aspect('equal')
    ax.axis('off')
    plt.tight_layout(pad=0)

    out_path = os.path.join(OUTPUT_DIR, f'{team_id}.png')
    fig.savefig(out_path, dpi=100, bbox_inches='tight', pad_inches=0, facecolor=bg_color)
    plt.close(fig)
    print(f'  [{team_id.upper()}] Saved → {out_path}')
    return True


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Filter to requested teams (or all)
    targets = [t.lower() for t in sys.argv[1:]] if len(sys.argv) > 1 else list(TEAMS.keys())
    invalid = [t for t in targets if t not in TEAMS]
    if invalid:
        print(f'Unknown team IDs: {", ".join(invalid)}')
        print(f'Valid IDs: {", ".join(TEAMS.keys())}')
        sys.exit(1)

    print(f'Generating {len(targets)} map(s)…\n')
    succeeded, failed = [], []

    for team_id in targets:
        label, lat, lon, primary, secondary, radius = TEAMS[team_id]
        ok = generate_map(team_id, label, lat, lon, primary, secondary, radius)
        (succeeded if ok else failed).append(team_id)

    print(f'\nDone. {len(succeeded)} succeeded, {len(failed)} failed.')
    if failed:
        print(f'Failed: {", ".join(failed)}')


if __name__ == '__main__':
    main()
