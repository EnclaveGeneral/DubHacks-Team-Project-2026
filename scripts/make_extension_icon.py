"""Draws the BackPocket logo (the website's .mark: an 18x14 pocket, ink body,
4px blue band on top, 3px top / 7px bottom corner radii) as a 512px PNG.

A white outline keeps it visible on dark browser toolbars. Pure Python with
4x4 supersampling for smooth edges; no image libraries needed. Plasmo makes
the 16-128 px sizes from it.

    .venv/Scripts/python scripts/make_extension_icon.py   # writes extension/assets/icon.png
"""
import struct
import sys
import zlib

from pathlib import Path

OUT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1] / "extension" / "assets" / "icon.png")
SIZE = 512
SS = 4  # supersamples per axis

INK = (22, 24, 22)        # --ink #161816
BLUE = (42, 120, 214)     # --series #2a78d6
HALO = (255, 255, 255)

# CSS px -> icon px. The pocket is 18 x 14; leave room for the outline.
SCALE = 25.0
W, H = 18 * SCALE, 14 * SCALE            # 450 x 350
X0, Y0 = (SIZE - W) / 2, (SIZE - H) / 2
R_TOP, R_BOT = 3 * SCALE, 7 * SCALE
BAND = 4 * SCALE
OUTLINE = 22.0                           # ~0.7 px at 16 px: a crisp edge on dark toolbars


def inside(px, py, grow=0.0):
    """Point inside the pocket shape, optionally grown by `grow` px."""
    x0, y0, x1, y1 = X0 - grow, Y0 - grow, X0 + W + grow, Y0 + H + grow
    if not (x0 <= px <= x1 and y0 <= py <= y1):
        return False
    rt, rb = R_TOP + grow, R_BOT + grow
    for cx, cy, r, cond in (
        (x0 + rt, y0 + rt, rt, px < x0 + rt and py < y0 + rt),
        (x1 - rt, y0 + rt, rt, px > x1 - rt and py < y0 + rt),
        (x0 + rb, y1 - rb, rb, px < x0 + rb and py > y1 - rb),
        (x1 - rb, y1 - rb, rb, px > x1 - rb and py > y1 - rb),
    ):
        if cond:
            return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    return True


rows = []
for y in range(SIZE):
    row = bytearray([0])
    for x in range(SIZE):
        acc = [0.0, 0.0, 0.0, 0.0]  # premultiplied r, g, b, a
        for sy in range(SS):
            for sx in range(SS):
                px, py = x + (sx + 0.5) / SS, y + (sy + 0.5) / SS
                if inside(px, py):
                    c = BLUE if py < Y0 + BAND else INK
                elif inside(px, py, OUTLINE):
                    c = HALO
                else:
                    continue
                acc[0] += c[0]
                acc[1] += c[1]
                acc[2] += c[2]
                acc[3] += 1
        n = SS * SS
        a = acc[3] / n
        if a == 0:
            row += bytes((0, 0, 0, 0))
        else:
            row += bytes((round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(a * 255)))
    rows.append(bytes(row))


def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)


png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
    + chunk(b"IEND", b"")
)
open(OUT, "wb").write(png)
print("wrote", OUT)
