#!/usr/bin/env python3
"""Draws the placeholder app icons (a dark rounded tile with a light "e") with no dependencies.

Usage: python3 tools/make-icons.py   -> app/icon.png (80x80), app/largeIcon.png (130x130)
"""
import math
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
GROUND = (0x1C, 0x1C, 0x1E)
INK = (0xF5, 0xF5, 0xF7)
SS = 4  # supersampling per axis


def inside_tile(x, y, n):
    r = n * 0.24
    cx = min(max(x, r), n - r)
    cy = min(max(y, r), n - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def inside_e(x, y, n):
    # the "e": a ring, a bar across the middle, and the ring cut open below the bar on the right
    cx, cy = n / 2, n / 2
    ro, w = n * 0.27, n * 0.075
    dx, dy = x - cx, y - cy
    d = math.hypot(dx, dy)
    bar = abs(dy) <= w / 2 and abs(dx) <= ro - w * 0.2
    ring = ro - w <= d <= ro
    if ring and dy > w / 2:
        ang = math.degrees(math.atan2(dy, dx))  # 0 = right, 90 = down
        if 0 <= ang < 42:
            ring = False
    return bar or ring


def render(n):
    rows = []
    for py in range(n):
        row = bytearray([0])
        for px in range(n):
            tile = ink = 0
            for sy in range(SS):
                for sx in range(SS):
                    x, y = px + (sx + 0.5) / SS, py + (sy + 0.5) / SS
                    if inside_tile(x, y, n):
                        tile += 1
                        if inside_e(x, y, n):
                            ink += 1
            k = SS * SS
            a = tile / k
            t = ink / tile if tile else 0
            rgb = [round(GROUND[i] + (INK[i] - GROUND[i]) * t) for i in range(3)]
            row += bytes(rgb + [round(a * 255)])
        rows.append(bytes(row))
    return png(n, n, b''.join(rows))


def png(w, h, raw):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':  # make-splash.py imports the drawing from here
    for name, size in (('icon.png', 80), ('largeIcon.png', 130)):
        path = os.path.join(ROOT, name)
        with open(path, 'wb') as f:
            f.write(render(size))
        print('wrote', os.path.normpath(path))
