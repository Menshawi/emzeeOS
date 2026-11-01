#!/usr/bin/env python3
"""Draws the launch splash: the near-black ground with the small emzeeOS tile in the middle, so webOS has
something calm to show while it starts the launcher. Mostly black, for the OLED. No dependencies.

Usage: python3 tools/make-splash.py   -> app/splash.png (1920x1080)
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('icons', os.path.join(HERE, 'make-icons.py'))
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)

W, H, N = 1920, 1080, 120          # screen, and the tile's size
BG = (0x0A, 0x0A, 0x0B)            # --ground
FADE = 0.55                        # the tile shows at this strength over the ground
SS = icons.SS


def tile_pixel(px, py):
    tile = ink = 0
    for sy in range(SS):
        for sx in range(SS):
            x, y = px + (sx + 0.5) / SS, py + (sy + 0.5) / SS
            if icons.inside_tile(x, y, N):
                tile += 1
                if icons.inside_e(x, y, N):
                    ink += 1
    a = tile / (SS * SS) * FADE
    t = ink / tile if tile else 0
    rgb = [icons.GROUND[i] + (icons.INK[i] - icons.GROUND[i]) * t for i in range(3)]
    return bytes(round(BG[i] + (rgb[i] - BG[i]) * a) for i in range(3)) + b'\xff'


x0, y0 = (W - N) // 2, (H - N) // 2
blank = bytes(BG) + b'\xff'
rows = []
for y in range(H):
    if y0 <= y < y0 + N:
        mid = b''.join(tile_pixel(x - x0, y - y0) for x in range(x0, x0 + N))
        rows.append(b'\x00' + blank * x0 + mid + blank * (W - x0 - N))
    else:
        rows.append(b'\x00' + blank * W)
path = os.path.normpath(os.path.join(HERE, '..', 'app', 'splash.png'))
with open(path, 'wb') as f:
    f.write(icons.png(W, H, b''.join(rows)))
print('wrote', path)
