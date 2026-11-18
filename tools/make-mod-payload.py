#!/usr/bin/env python3
"""
Builds models-src/mod-payload.stl: a simplified MOD payload (NDR325-style radio) for the
2D parts atlas, after the product photo: base flange, body, pin-fin heatsink on top and
a front panel with two D-sub connectors and four SMA jacks. Units mm; +Y up, -Z front.
"""
from pathlib import Path
import numpy as np
import trimesh

L, W = 150.0, 95.0  # length (x), width (z)
parts = []
def box(sx, sy, sz, x, y, z):
    b = trimesh.creation.box((sx, sy, sz)); b.apply_translation((x, y, z)); parts.append(b)
def cyl(r, h, x, y, z, axis='z'):
    c = trimesh.creation.cylinder(radius=r, height=h, sections=16)
    if axis == 'z': pass
    elif axis == 'y': c.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, (1, 0, 0)))
    c.apply_translation((x, y, z)); parts.append(c)

box(L + 8, 3, W + 6, 0, 1.5, 0)                 # base flange
box(L, 18, W, 0, 3 + 9, 0)                      # body
box(L - 6, 2, W - 6, 0, 22, 0)                  # heatsink plate
n_x, n_z, pin = 10, 6, 8.0                      # pin fins
for i in range(n_x):
    for k in range(n_z):
        x = -L / 2 + 10 + i * (L - 20) / (n_x - 1)
        z = -W / 2 + 10 + k * (W - 20) / (n_z - 1)
        box(pin, 7, pin, x, 23 + 3.5, z)
front = -W / 2
box(L - 10, 14, 2, 0, 12, front - 1)            # front panel
for x in (-35, 35):                             # D-sub connectors with screw posts
    box(30, 9, 4, x, 12, front - 3.5)
    for dx in (-19, 19): cyl(2, 5, x + dx, 12, front - 3.5)
for x in (-58, -12, 12, 58):                    # SMA jacks
    cyl(3.2, 9, x, 9, front - 5.5)
mesh = trimesh.util.concatenate(parts)
out = Path(__file__).resolve().parent.parent / 'models-src' / 'mod-payload.stl'
mesh.export(out)
print(out, len(mesh.faces), mesh.extents.round(1))
