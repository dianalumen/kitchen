#!/usr/bin/env python3
"""Generate the app icons in icons/ (Matcha background, ink pot glyph from the A board).

No dependencies: the glyph is stroked with analytic anti-aliasing and PNGs are written with zlib.
Run from the repo root:  python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

MATCHA = (0xD4, 0xF0, 0x9F)
INK = (0x14, 0x14, 0x14)
STROKE = 2.0  # in the 24-unit icon grid, like the UI icons

# The pot icon (ui.js "pot"): M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z M2 10h20
# M9 6c0-1 1-2 1-3 M14 6c0-1 1-2 1-3, as polylines in 24-unit space.
def arc(cx, cy, r, a0, a1, n=16):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def cubic(p0, p1, p2, p3, n=16):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(tuple(u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * d for a, b, c, d in zip(p0, p1, p2, p3)))
    return pts

POLYLINES = [
    [(4, 10), (20, 10), (20, 16)] + arc(16, 16, 4, 0, math.pi / 2)[1:] + [(8, 20)] + arc(8, 16, 4, math.pi / 2, math.pi)[1:] + [(4, 10)],
    [(2, 10), (22, 10)],
    cubic((9, 6), (9, 5), (10, 4), (10, 3)),
    cubic((14, 6), (14, 5), (15, 4), (15, 3)),
]
SEGMENTS = [(a, b) for line in POLYLINES for a, b in zip(line, line[1:])]


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0 if l2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
    qx, qy = ax + t * dx - px, ay + t * dy - py
    return math.sqrt(qx * qx + qy * qy)


def render(size, glyph_frac, radius_frac=0.0):
    """Square icon: Matcha fill (optionally with rounded corners), glyph centred at glyph_frac of the size."""
    scale = size * glyph_frac / 24.0          # pixels per icon unit
    off = (size - 24 * scale) / 2              # centre the 24-unit grid
    half = STROKE * scale / 2
    rad = size * radius_frac
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            # background coverage (rounded rectangle)
            bg = 1.0
            if rad:
                cx = min(max(px, rad), size - rad)
                cy = min(max(py, rad), size - rad)
                d = math.hypot(px - cx, py - cy)
                bg = max(0.0, min(1.0, rad - d + 0.5))
            # glyph coverage
            gx, gy = (px - off) / scale, (py - off) / scale
            g = 0.0
            if -2 < gx < 26 and -2 < gy < 26:
                d = min(seg_dist(gx, gy, a, b) for a, b in SEGMENTS) * scale
                g = max(0.0, min(1.0, half - d + 0.5))
            col = [round(m * (1 - g) + i * g) for m, i in zip(MATCHA, INK)]
            row += bytes(col + [round(255 * bg)])
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)
    raw = b"".join(b"\x00" + r for r in rows)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + \
        chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path)


def write_svg(path):
    d = ("M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 6c0-1 1-2 1-3M14 6c0-1 1-2 1-3")
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
           '<rect width="512" height="512" rx="112" fill="#D4F09F"/>'
           '<g transform="translate(128 128) scale(10.667)" fill="none" stroke="#141414" stroke-width="2" '
           'stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></g></svg>\n')
    with open(path, "w") as f:
        f.write(svg)
    print("wrote", path)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out, exist_ok=True)
    write_svg(os.path.join(out, "icon.svg"))
    # "any" icons: full square (Android and iOS apply their own mask), glyph at half the size.
    write_png(os.path.join(out, "icon-192.png"), render(192, 0.5))
    write_png(os.path.join(out, "icon-512.png"), render(512, 0.5))
    write_png(os.path.join(out, "apple-touch-icon.png"), render(180, 0.5))
    # maskable: glyph inside the central safe zone (40% of the size).
    write_png(os.path.join(out, "maskable-512.png"), render(512, 0.4))
