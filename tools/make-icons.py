#!/usr/bin/env python3
"""Generate the PWA icons.

The icon is not hand-drawn: it is the side-on silhouette of the actual dino,
rasterized from the very box list `src/render/meshes.js` builds the model from.
Re-run this after changing the model and the icon follows it.

    python3 tools/make-icons.py

No third-party dependencies -- PNGs are written with zlib directly, so this
runs on a bare Python install like everything else in the project.
"""
import re
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MESHES = ROOT / "src/render/meshes.js"
OUT = ROOT / "icons"

BG = (0x20, 0x21, 0x24)        # the error page's dark background
INK = (212, 214, 219)          # MONO_DARK.dino
SS = 4                         # supersampling factor

# [halfW, height, halfD, cx, cy, cz]; cy is the box's BASE, +z is forward.
BOX = re.compile(
    r"\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),"
    r"\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]"
)


def boxes_between(src, start_marker, end_marker):
    i = src.index(start_marker) + len(start_marker)
    j = src.index(end_marker, i)
    return [tuple(float(g) for g in m.groups()) for m in BOX.finditer(src[i:j])]


def load_model():
    """The dino's boxes, as (z0, y0, z1, y1) rectangles in the side view."""
    src = MESHES.read_text()
    torso = boxes_between(src, "const torso = partMesh(gl, body, [", "]);")
    legs = boxes_between(src, "const m = partMesh(gl, limb, [", "]);")
    hip = float(re.search(r"pivot\.position\.set\(x,\s*(-?[\d.]+),", src).group(1))
    if len(torso) < 8 or len(legs) < 2:
        sys.exit(f"parsed {len(torso)} torso and {len(legs)} leg boxes -- "
                 f"the shape of meshes.js changed, update the markers")

    rects = []
    for _hw, h, hd, _cx, cy, cz in torso:
        rects.append((cz - hd, cy, cz + hd, cy + h))
    for _hw, h, hd, _cx, cy, cz in legs:          # legs hang off the hip pivot
        rects.append((cz - hd, cy + hip, cz + hd, cy + hip + h))
    return rects


def png(path, w, h, pixels):
    """Minimal RGBA PNG writer."""
    raw = b"".join(b"\x00" + bytes(pixels[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def render(size, coverage):
    """Draw the dino centred, occupying `coverage` of the icon's width."""
    rects = load_model()
    z0 = min(r[0] for r in rects); z1 = max(r[2] for r in rects)
    y0 = min(r[1] for r in rects); y1 = max(r[3] for r in rects)

    n = size * SS
    scale = (n * coverage) / max(z1 - z0, y1 - y0)
    ox = (n - (z1 - z0) * scale) / 2 - z0 * scale
    oy = (n - (y1 - y0) * scale) / 2 + y1 * scale      # +y is up, screen y is down

    cov = bytearray(n * n)                             # 1 where the dino is
    for rz0, ry0, rz1, ry1 in rects:
        for py in range(max(0, round(oy - ry1 * scale)), min(n, round(oy - ry0 * scale))):
            row = py * n
            for px in range(max(0, round(ox + rz0 * scale)), min(n, round(ox + rz1 * scale))):
                cov[row + px] = 1

    # box-downsample the supersampled coverage into an antialiased icon
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            hits = 0
            for sy in range(SS):
                row = (y * SS + sy) * n + x * SS
                hits += sum(cov[row:row + SS])
            a = hits / (SS * SS)
            i = (y * size + x) * 4
            for c in range(3):
                out[i + c] = round(BG[c] + (INK[c] - BG[c]) * a)
            out[i + 3] = 255
    return out


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    # Maskable icons are cropped to a circle by the launcher, so the dino has to
    # sit well inside the safe zone; the plain icons can run closer to the edge.
    for name, size, coverage in [
        ("icon-192.png", 192, 0.78),
        ("icon-512.png", 512, 0.78),
        ("icon-maskable-512.png", 512, 0.50),
    ]:
        png(OUT / name, size, size, render(size, coverage))
        print(f"  icons/{name}")
