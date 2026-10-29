/**
 * Line-art generator for the 2D parts page (/parts).
 *
 * Builds the same procedural K1000ULE model the 3D viewer uses, spreads the parts
 * out (exploded layout below), renders an isometric depth + id buffer and keeps
 * only the visible silhouette, crease and boundary edges of every component. The
 * result is a compact vector drawing: src/parts/lineart.json.
 *
 * Run with the dev server up:  npm run dev  →  npm run lineart
 * (scripts/lineart.mjs drives this page with Playwright and writes the JSON).
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { contours } from 'd3-contour';
import { buildDroneModel } from '../src/engine/DroneModel';
import { createMaterialLibrary } from '../src/engine/materials';
import { LAYOUT_2D, LAYOUT_2D_PORTRAIT, VIEW_2D, EXCLUDE_2D } from './layout2d';

const VARIANT = new URLSearchParams(location.search).get('variant') === 'portrait' ? 'portrait' : 'landscape';
const PLACES = VARIANT === 'portrait' ? { ...LAYOUT_2D, ...LAYOUT_2D_PORTRAIT } : LAYOUT_2D;

const OUT_W = 1600; // viewBox width
const PX = 4400; // raster width used for hidden-line removal
const CREASE = Math.cos((38 * Math.PI) / 180);

type Seg = [number, number, number, number];

const log = (s: string) => {
  document.getElementById('log')!.textContent += `\n${s}`;
};

function run() {
  const lib = createMaterialLibrary();
  const model = buildDroneModel(lib);
  const scene = new THREE.Scene();
  scene.add(model.root);

  // ── camera
  const th = (VIEW_2D.azimuth * Math.PI) / 180;
  const ph = (VIEW_2D.elevation * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  cam.position.copy(dir).multiplyScalar(25);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);

  // ── exploded 2D layout
  const keep: string[] = [];
  for (const node of model.nodes.values()) {
    if (EXCLUDE_2D.includes(node.id)) {
      node.group.visible = false;
      continue;
    }
    const L = PLACES[node.id];
    if (L?.scale) node.group.scale.setScalar(L.scale);
    if (L?.offset) node.group.position.add(new THREE.Vector3(...L.offset));
    if (L?.screen) {
      // place the part's centre at a camera-plane position (metres from the origin)
      node.group.updateMatrixWorld(true);
      const c = node.localBox.getCenter(new THREE.Vector3()).applyMatrix4(node.group.matrixWorld);
      const want = right.clone().multiplyScalar(L.screen[0]).add(up.clone().multiplyScalar(L.screen[1]));
      const cur = right.clone().multiplyScalar(c.dot(right)).add(up.clone().multiplyScalar(c.dot(up)));
      node.group.position.add(want.sub(cur));
    }
    keep.push(node.id);
  }
  scene.updateMatrixWorld(true);

  // ── meshes that take part (opaque geometry only)
  const meshes: { mesh: THREE.Mesh; id: string; idx: number }[] = [];
  keep.forEach((id, i) => {
    const node = model.nodes.get(id)!;
    node.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.Sprite).isSprite) o.visible = false;
      if (!m.isMesh) return;
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) {
        m.visible = false;
        return;
      }
      const mat = m.material as THREE.Material;
      if (mat.transparent || mat.depthWrite === false || (m.geometry as THREE.PlaneGeometry).type === 'PlaneGeometry') {
        m.visible = false;
        return;
      }
      if (m.userData.componentId !== id) return;
      meshes.push({ mesh: m, id, idx: i + 1 });
    });
  });
  // fasteners hosted by visible parts
  for (const node of model.nodes.values()) for (const f of node.fastenerMeshes) f.visible = false;

  // ── fit camera to the projected bounds
  const vp = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const { mesh } of meshes) {
    if (!isVisible(mesh)) continue;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      vp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const x = vp.dot(right), y = vp.dot(up);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const pad = (x1 - x0) * 0.035;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1;
  cam.updateProjectionMatrix();
  const W = PX;
  const H = Math.round((PX * (y1 - y0)) / (x1 - x0));
  const OUT_H = Math.round((OUT_W * H) / W);
  const S = OUT_W / W;
  log(`raster ${W}×${H}, viewBox ${OUT_W}×${OUT_H}, ${meshes.length} meshes`);

  // ── depth + id buffer (float target, one pass)
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(64, 64);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
  const idMats = new Map<number, THREE.ShaderMaterial>();
  const original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  for (const m of meshes) {
    let mat = idMats.get(m.idx);
    if (!mat) {
      mat = new THREE.ShaderMaterial({
        uniforms: { uId: { value: m.idx } },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uId; void main(){ gl_FragColor = vec4(gl_FragCoord.z, uId, 0.0, 1.0); }',
        side: THREE.DoubleSide,
      });
      idMats.set(m.idx, mat);
    }
    original.set(m.mesh, m.mesh.material);
    m.mesh.material = mat;
  }
  renderer.setRenderTarget(rt);
  renderer.setClearColor(new THREE.Color(1, 0, 0), 1);
  renderer.clear();
  renderer.render(scene, cam);
  const buf = new Float32Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(null);
  const depthAt = (x: number, y: number) => buf[(y * W + x) * 4];
  const idAt = (x: number, y: number) => Math.round(buf[(y * W + x) * 4 + 1]);

  // world → raster (x right, y down) + depth in [0,1]
  const proj = new THREE.Vector3();
  const toRaster = (v: THREE.Vector3): [number, number, number] => {
    proj.copy(v).project(cam);
    return [((proj.x + 1) / 2) * W, ((1 - proj.y) / 2) * H, (proj.z + 1) / 2];
  };
  const depthEps = 0.0045 / (cam.far - cam.near);
  const visibleAt = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = H - 1 - Math.floor(y); // buffer is bottom-up
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const px = xi + dx, py = yi + dy;
        if (px < 0 || py < 0 || px >= W || py >= H) return true;
        if (depthAt(px, py) >= z - depthEps) return true;
      }
    return false;
  };

  // ── edges per component
  const camDir = dir.clone(); // towards the camera
  const segsById = new Map<string, Seg[]>();
  const detailById = new Map<string, Seg[]>();
  const clipVisible = (a: [number, number, number], b: [number, number, number], out: Seg[]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 0.6));
    let start: [number, number] | null = null;
    let last: [number, number] = [a[0], a[1]];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const vis = visibleAt(x, y, z);
      if (vis && !start) start = [x, y];
      if (!vis && start) {
        out.push([start[0], start[1], last[0], last[1]]);
        start = null;
      }
      last = [x, y];
    }
    if (start) out.push([start[0], start[1], b[0], b[1]]);
  };

  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const { mesh, id } of meshes) {
    if (!isVisible(mesh)) continue;
    const src = mesh.geometry;
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', src.attributes.position.clone());
    if (src.index) g0.setIndex(src.index.clone());
    const g = mergeVertices(g0, 1e-5);
    const pos = g.attributes.position;
    const idx = g.index!;
    const wp: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) wp.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
    const triCount = idx.count / 3;
    const fn: THREE.Vector3[] = [];
    const edges = new Map<number, number[]>(); // key → faces
    for (let f = 0; f < triCount; f++) {
      const a = idx.getX(f * 3), b = idx.getX(f * 3 + 1), c = idx.getX(f * 3 + 2);
      va.copy(wp[a]); vb.copy(wp[b]); vc.copy(wp[c]);
      e1.subVectors(vb, va); e2.subVectors(vc, va);
      nrm.crossVectors(e1, e2);
      const area = nrm.length();
      fn.push(area > 1e-14 ? nrm.clone().divideScalar(area) : new THREE.Vector3());
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        if (p === q) continue;
        const key = p < q ? p * 4194304 + q : q * 4194304 + p;
        const l = edges.get(key);
        if (l) l.push(f);
        else edges.set(key, [f]);
      }
    }
    const out = segsById.get(id) ?? [];
    for (const [key, faces] of edges) {
      const p = Math.floor(key / 4194304), q = key % 4194304;
      let draw = false;
      if (faces.length === 1) draw = true;
      else {
        const n0 = fn[faces[0]], n1 = fn[faces[1]];
        if (n0.lengthSq() === 0 || n1.lengthSq() === 0) continue;
        const f0 = n0.dot(camDir) > 0, f1 = n1.dot(camDir) > 0;
        if (f0 !== f1) draw = true;
        else if (f0 && n0.dot(n1) < CREASE) draw = true;
        else if (faces.length > 2) draw = true;
      }
      if (!draw) continue;
      clipVisible(toRaster(wp[p]), toRaster(wp[q]), out);
    }
    segsById.set(id, out);

    // solar cell grid: iso-lines of the panel uv on the cell textures
    const mat = original.get(mesh) as THREE.MeshPhysicalMaterial;
    const uv = src.attributes.uv;
    if (mat?.map && uv && /solar/.test(id)) {
      const d = detailById.get(id) ?? [];
      const sp = src.attributes.position;
      const ix = src.index;
      const tri = (ix ? ix.count : sp.count) / 3;
      const get = (k: number) => (ix ? ix.getX(k) : k);
      for (let f = 0; f < tri; f++) {
        const ids = [get(f * 3), get(f * 3 + 1), get(f * 3 + 2)];
        const P = ids.map((k) => new THREE.Vector3().fromBufferAttribute(sp, k).applyMatrix4(mesh.matrixWorld));
        e1.subVectors(P[1], P[0]); e2.subVectors(P[2], P[0]);
        if (nrm.crossVectors(e1, e2).normalize().dot(camDir) <= 0.05) continue;
        if (nrm.y < 0.3) continue; // top face only
        for (const [comp, steps] of [[0, 8], [1, 4]] as const) {
          const U = ids.map((k) => (comp === 0 ? uv.getX(k) : uv.getY(k)));
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            const hits: THREE.Vector3[] = [];
            for (let e = 0; e < 3; e++) {
              const i0 = e, i1 = (e + 1) % 3;
              const u0 = U[i0], u1 = U[i1];
              if ((u0 - t) * (u1 - t) < 0) hits.push(P[i0].clone().lerp(P[i1], (t - u0) / (u1 - u0)));
            }
            if (hits.length === 2) clipVisible(toRaster(hits[0]), toRaster(hits[1]), d);
          }
        }
      }
      detailById.set(id, d);
    }
  }

  // ── per-part regions (from the id buffer) for hit areas and hover fill
  const DS = 4;
  const gw = Math.ceil(W / DS), gh = Math.ceil(H / DS);
  const counts = new Map<number, { n: number; sx: number; sy: number; x0: number; y0: number; x1: number; y1: number }>();
  const idGrid = new Int16Array(gw * gh);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = idAt(x, H - 1 - y);
      if (!v) continue;
      const gi = Math.floor(y / DS) * gw + Math.floor(x / DS);
      idGrid[gi] = v;
      let c = counts.get(v);
      if (!c) counts.set(v, (c = { n: 0, sx: 0, sy: 0, x0: x, y0: y, x1: x, y1: y }));
      c.n++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
    }
  const contourGen = contours().size([gw, gh]).thresholds([0.5]).smooth(true);

  const parts = keep.map((id, i) => {
    const v = i + 1;
    const segs = segsById.get(id) ?? [];
    const d = pathFromSegs(segs, S);
    const dd = pathFromSegs(detailById.get(id) ?? [], S, 0.6);
    const c = counts.get(v);
    let region = '';
    if (c) {
      const grid = new Float64Array(gw * gh);
      for (let k = 0; k < grid.length; k++) grid[k] = idGrid[k] === v ? 1 : 0;
      const mp = contourGen(grid as unknown as number[])[0];
      region = mp.coordinates
        .flat()
        .map((ring) => {
          const pts = rdp(ring.map(([x, y]) => [x * DS * S, y * DS * S] as [number, number]), 0.8);
          if (pts.length < 3) return '';
          return 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + 'Z';
        })
        .join('');
    }
    const r = (n: number) => r1(n * S);
    return {
      id,
      d,
      dd: dd || undefined,
      region,
      c: c ? [r(c.sx / c.n), r(c.sy / c.n)] : null,
      box: c ? [r(c.x0), r(c.y0), r(c.x1), r(c.y1)] : null,
    };
  });

  // model origin and axis directions in viewBox space (for the page's scale bar and compass)
  const o = toRaster(new THREE.Vector3());
  const result = {
    generated: new Date().toISOString().slice(0, 10),
    variant: VARIANT,
    viewBox: [OUT_W, OUT_H],
    view: VIEW_2D,
    metre: r1(((W / (x1 - x0)) * S)),
    origin: [r1(o[0] * S), r1(o[1] * S)],
    parts,
  };
  const json = JSON.stringify(result);
  log(`done: ${parts.length} parts, ${(json.length / 1024).toFixed(0)} kB`);
  (window as unknown as Record<string, unknown>).__lineart = json;
}

function isVisible(o: THREE.Object3D) {
  for (let c: THREE.Object3D | null = o; c; c = c.parent) if (!c.visible) return false;
  return true;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Join collinear-ish touching segments into polylines, simplify, emit an SVG path. */
function pathFromSegs(segs: Seg[], S: number, minLen = 1.2): string {
  if (!segs.length) return '';
  const key = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const ends = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      const l = ends.get(k);
      if (l) l.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines: [number, number][][] = [];
  const take = (k: string): number => {
    const l = ends.get(k);
    if (!l) return -1;
    for (const i of l) if (!used[i]) return i;
    return -1;
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const s = segs[i];
    const pts: [number, number][] = [[s[0], s[1]], [s[2], s[3]]];
    // extend forward
    for (;;) {
      const [x, y] = pts[pts.length - 1];
      const j = take(key(x, y));
      if (j < 0) break;
      used[j] = 1;
      const t = segs[j];
      pts.push(key(t[0], t[1]) === key(x, y) ? [t[2], t[3]] : [t[0], t[1]]);
    }
    for (;;) {
      const [x, y] = pts[0];
      const j = take(key(x, y));
      if (j < 0) break;
      used[j] = 1;
      const t = segs[j];
      pts.unshift(key(t[0], t[1]) === key(x, y) ? [t[2], t[3]] : [t[0], t[1]]);
    }
    lines.push(pts);
  }
  let d = '';
  for (const l of lines) {
    const pts = rdp(l.map(([x, y]) => [x * S, y * S] as [number, number]), 0.18);
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (len < minLen * 0.5) continue;
    d += 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L');
  }
  return d.replace(/ -/g, '-');
}

function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
  if (Math.hypot(fx - lx, fy - ly) < 1e-6) {
    // closed ring: split at the point farthest from the start so neither half is degenerate
    let far = 1, best = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const dd = Math.hypot(pts[i][0] - fx, pts[i][1] - fy);
      if (dd > best) { best = dd; far = i; }
    }
    if (best < eps) return [];
    const a = rdpOpen(pts.slice(0, far + 1), eps);
    const b = rdpOpen(pts.slice(far), eps);
    return a.concat(b.slice(1));
  }
  return rdpOpen(pts, eps);
}

function rdpOpen(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const keepIdx = new Uint8Array(pts.length);
  keepIdx[0] = keepIdx[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L;
      if (dist > best) { best = dist; bi = i; }
    }
    if (best > eps) {
      keepIdx[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keepIdx[i]);
}

try {
  run();
} catch (e) {
  log(String((e as Error).stack ?? e));
  (window as unknown as Record<string, unknown>).__lineartError = String(e);
}
