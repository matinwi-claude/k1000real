#!/usr/bin/env python3
"""
Convert CAD parts (STL) into public/models/parts.glb for the 3D viewer.

Each source in models-src/parts.json is converted from its own units and axes into
the viewer frame (metres, +Y up, +Z nose, +X port), shifted by `offset` (metres), and
split into components: every connected body goes to the first `pieces` entry whose
`where` rule matches it (rules use the SOURCE coordinates/units), otherwise to
`default`. Meshes are written as "<component-id>__<material>" and replace that
component's procedural geometry at runtime (src/engine/PartModels.ts).

Requires: pip install trimesh scipy networkx rtree ; Node (npx) for meshopt compression.
"""
import json, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'models-src'
OUT = ROOT / 'public' / 'models' / 'parts.glb'
UNITS = {'mm': 0.001, 'cm': 0.01, 'm': 1.0, 'in': 0.0254}
GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1'


def axis_matrix(axes):
    """['x','z','-y'] → rows giving viewer x, y, z from source xyz."""
    m = np.zeros((3, 3))
    for row, a in enumerate(axes):
        m[row, 'xyz'.index(a[-1])] = -1.0 if a.startswith('-') else 1.0
    if round(np.linalg.det(m)) != 1:
        sys.exit(f'axes {axes} mirror the model; pick a proper rotation')
    return m


def matches(rule, lo, hi):
    c = (lo + hi) / 2
    for key, v in rule.items():
        what, ax, op = key.split('_')
        val = {'min': lo, 'max': hi, 'center': c}[what]['xyz'.index(ax)]
        if (op == 'gt' and not val > v) or (op == 'lt' and not val < v):
            return False
    return True


def convert(src):
    mesh = trimesh.load(SRC / src['file'], force='mesh')
    print(f"{src['file']}: {len(mesh.faces)} triangles")
    bodies = trimesh.graph.connected_components(mesh.face_adjacency, nodes=np.arange(len(mesh.faces)), min_len=1)
    groups = {}
    for faces in bodies:
        pts = mesh.vertices[mesh.faces[faces].ravel()]
        lo, hi = pts.min(0), pts.max(0)
        target = next((p for p in src.get('pieces', []) if matches(p['where'], lo, hi)), src['default'])
        groups.setdefault((target['id'], target['material']), []).append(faces)

    rot = axis_matrix(src['axes']) * UNITS[src['units']]
    out = {}
    for (cid, mat), parts in groups.items():
        part = mesh.submesh([np.concatenate(parts)], append=True)
        part.vertices = part.vertices @ rot.T + np.array(src['offset'])
        part.merge_vertices()
        # split normals at creases so CAD edges stay crisp and curved panels stay smooth
        part = trimesh.graph.smooth_shade(part, angle=np.radians(35))
        out[f'{cid}__{mat}'] = part
        lo, hi = part.bounds
        print(f'  {cid:<14} {mat:<8} {len(part.faces):>7} tris  x {lo[0]:+.3f}..{hi[0]:+.3f}  y {lo[1]:+.3f}..{hi[1]:+.3f}  z {lo[2]:+.3f}..{hi[2]:+.3f}')
    return out


def main():
    cfg = json.loads((SRC / 'parts.json').read_text())
    scene = trimesh.Scene()
    for src in cfg['sources']:
        for name, part in convert(src).items():
            part.visual = trimesh.visual.ColorVisuals(part)
            scene.add_geometry(part, node_name=name, geom_name=name)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / 'raw.glb'
        scene.export(raw)
        subprocess.run(['npx', '--yes', GLTF_TRANSFORM, 'meshopt', str(raw), str(OUT)], check=True)
    print(f'wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.2f} MB)')


if __name__ == '__main__':
    main()
