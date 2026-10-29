import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
export type SurfaceFn = (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Apply a position / rotation (euler, radians) / scale transform to a geometry in place. */
export function xf(g: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1) {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  _p.set(p[0], p[1], p[2]);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Orient a geometry built along +Y so that +Y points along `dir`, then move it to `p`. */
export function alignY(g: THREE.BufferGeometry, dir: THREE.Vector3, p: THREE.Vector3) {
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  _m.compose(p, _q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

export const box = (w: number, h: number, d: number, p?: V3, r?: V3) => xf(new THREE.BoxGeometry(w, h, d), p, r);

export const rbox = (w: number, h: number, d: number, radius: number, p?: V3, r?: V3, seg = 3) =>
  xf(new RoundedBoxGeometry(w, h, d, seg, Math.min(radius, Math.min(w, h, d) / 2 - 1e-5)), p, r);

export const cyl = (rt: number, rb: number, h: number, seg = 24, p?: V3, r?: V3, open = false) =>
  xf(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), p, r);

export const sphere = (radius: number, p?: V3, ws = 16, hs = 12) => xf(new THREE.SphereGeometry(radius, ws, hs), p);

export const torus = (R: number, r: number, p?: V3, rot?: V3, rs = 8, ts = 32) =>
  xf(new THREE.TorusGeometry(R, r, rs, ts), p, rot);

/** Lathe from [radius, y] pairs around +Y. */
export const lathe = (pts: [number, number][], seg = 40, p?: V3, r?: V3) =>
  xf(
    new THREE.LatheGeometry(
      pts.map(([x, y]) => new THREE.Vector2(x, y)),
      seg,
    ),
    p,
    r,
  );

/** Tube through points (Catmull-Rom). */
export function tube(points: V3[], radius: number, tubular = 48, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

export function tubeCurve(curve: THREE.Curve<THREE.Vector3>, radius: number, tubular = 48, radial = 8) {
  return new THREE.TubeGeometry(curve, tubular, radius, radial, false);
}

/** Extruded 2D shape (shape XY → world XZ, depth along +Y). */
export function plate(shape: THREE.Shape, depth: number, y: number, bevel = 0.0008) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 24,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function circlePath(cx: number, cy: number, r: number) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

export function slotPath(x1: number, y1: number, x2: number, y2: number, r: number) {
  const p = new THREE.Path();
  const a = Math.atan2(y2 - y1, x2 - x1);
  p.absarc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2, false);
  p.absarc(x1, y1, r, a + Math.PI / 2, a + (3 * Math.PI) / 2, false);
  p.closePath();
  // holes must wind opposite to the outer shape
  const pts = p.getPoints(24).reverse();
  return new THREE.Path(pts);
}

/**
 * Closed solid slab built from a parametric surface: outer skin, inner skin offset
 * by `thickness` along the inward normal, and side walls. Gives real wall thickness,
 * which reads correctly in cross-section mode.
 */
export function surfaceSlab(
  fn: SurfaceFn,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  su: number,
  sv: number,
  thickness: number,
  offset = 0,
) {
  const outer: THREE.Vector3[][] = [];
  const inner: THREE.Vector3[][] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  const n = new THREE.Vector3();
  const eps = 1e-4;
  for (let i = 0; i <= su; i++) {
    const u = u0 + ((u1 - u0) * i) / su;
    const rowO: THREE.Vector3[] = [];
    const rowI: THREE.Vector3[] = [];
    for (let j = 0; j <= sv; j++) {
      const v = v0 + ((v1 - v0) * j) / sv;
      fn(u, v, a);
      fn(u + eps, v, b);
      fn(u - eps, v, c);
      du.subVectors(b, c);
      fn(u, v + eps, b);
      fn(u, v - eps, c);
      dv.subVectors(b, c);
      const lu = du.length();
      const lv = dv.length();
      if (lu > 1e-12) du.divideScalar(lu);
      if (lv > 1e-12) dv.divideScalar(lv);
      n.crossVectors(du, dv);
      if (lu < 1e-12 || lv < 1e-12 || n.lengthSq() < 1e-8) {
        // degenerate pole: point along the body axis
        n.set(0, 0, u < 0.5 ? -1 : 1);
      }
      n.normalize();
      rowO.push(a.clone().addScaledVector(n, offset));
      rowI.push(a.clone().addScaledVector(n, offset - thickness));
    }
    outer.push(rowO);
    inner.push(rowI);
  }

  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, uvq: number[]) => {
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    pos.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    uv.push(uvq[0], uvq[1], uvq[2], uvq[3], uvq[4], uvq[5], uvq[0], uvq[1], uvq[4], uvq[5], uvq[6], uvq[7]);
  };

  // Build indexed skins so normals are smooth on each skin.
  const skin = (grid: THREE.Vector3[][], flip: boolean) => {
    const g = new THREE.BufferGeometry();
    const P: number[] = [];
    const UV: number[] = [];
    const I: number[] = [];
    for (let i = 0; i <= su; i++)
      for (let j = 0; j <= sv; j++) {
        const q = grid[i][j];
        P.push(q.x, q.y, q.z);
        UV.push(i / su, j / sv);
      }
    const w = sv + 1;
    for (let i = 0; i < su; i++)
      for (let j = 0; j < sv; j++) {
        const k0 = i * w + j;
        const k1 = (i + 1) * w + j;
        const k2 = (i + 1) * w + j + 1;
        const k3 = i * w + j + 1;
        if (flip) I.push(k0, k2, k1, k0, k3, k2);
        else I.push(k0, k1, k2, k0, k2, k3);
      }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    return g.toNonIndexed();
  };

  // Orientation of outer skin depends on parameter direction; detect by sampling.
  const mid = outer[Math.floor(su / 2)][Math.floor(sv / 2)];
  const midIn = inner[Math.floor(su / 2)][Math.floor(sv / 2)];
  const outward = mid.clone().sub(midIn).normalize();
  const t1 = outer[Math.floor(su / 2) + 1][Math.floor(sv / 2)].clone().sub(mid);
  const t2 = outer[Math.floor(su / 2)][Math.floor(sv / 2) + 1].clone().sub(mid);
  const natural = new THREE.Vector3().crossVectors(t1, t2).dot(outward) > 0;
  const gOuter = skin(outer, !natural);
  const gInner = skin(inner, natural);

  // side walls — orient each quad so it faces away from the slab interior
  const nrm = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const ow = new THREE.Vector3();
  const wall = (pa: THREE.Vector3[], pb: THREE.Vector3[], ref: THREE.Vector3[]) => {
    for (let k = 0; k < pa.length - 1; k++) {
      e1.subVectors(pa[k + 1], pa[k]);
      e2.subVectors(pb[k + 1], pa[k]);
      nrm.crossVectors(e1, e2);
      ow.subVectors(pa[k], ref[k]).add(ow.clone().subVectors(pa[k + 1], ref[k + 1]));
      const flip = nrm.dot(ow) > 0;
      if (flip) quad(pa[k], pa[k + 1], pb[k + 1], pb[k], [0, 0, 1, 0, 1, 1, 0, 1]);
      else quad(pa[k], pb[k], pb[k + 1], pa[k + 1], [0, 0, 0, 1, 1, 1, 1, 0]);
    }
  };
  const colO = (j: number) => outer.map((r) => r[j]);
  const colI = (j: number) => inner.map((r) => r[j]);
  wall(outer[0], inner[0], outer[1]);
  wall(outer[su], inner[su], outer[su - 1]);
  wall(colO(0), colI(0), colO(1));
  wall(colO(sv), colI(sv), colO(sv - 1));

  const gw = new THREE.BufferGeometry();
  gw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gw.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  gw.computeVertexNormals();

  return merge([gOuter, gInner, gw]);
}

/** Normalise attributes so geometries can be merged, then merge. */
export function merge(geoms: THREE.BufferGeometry[], keepColor = false): THREE.BufferGeometry {
  const list = geoms.filter(Boolean);
  if (list.length === 0) return new THREE.BufferGeometry();
  const anyNonIndexed = list.some((g) => !g.index);
  const prepared = list.map((g0) => {
    let g = anyNonIndexed && g0.index ? g0.toNonIndexed() : g0;
    if (g === g0) g = g0.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(keepColor && name === 'color')) {
        g.deleteAttribute(name);
      }
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (keepColor && !g.attributes.color) {
      const c = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    }
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  });
  const out = mergeGeometries(prepared, false);
  if (!out) throw new Error('mergeGeometries failed');
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Set a uniform vertex colour on a geometry. */
export function tint(g: THREE.BufferGeometry, r: number, gg: number, b: number) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

/**
 * Twisted, tapered propeller blade along +X. `dir` = +1/-1 sets rotation handedness.
 */
export function propBlade(rootR: number, tipR: number, dir: 1 | -1, t0 = 0, t1 = 1, inflate = 1) {
  const spanSeg = 28;
  const ringSeg = 14;
  const P: number[] = [];
  const I: number[] = [];
  const UV: number[] = [];
  const ring = ringSeg * 2;
  for (let i = 0; i <= spanSeg; i++) {
    const t = t0 + ((t1 - t0) * i) / spanSeg;
    const r = rootR + (tipR - rootR) * t;
    // chord: widen out of the hub, peak ~25% span, taper to a rounded tip
    const chord =
      t < 0.08 ? 0.022 + (t / 0.08) * 0.03 : 0.052 * (1 - 0.62 * Math.pow((t - 0.08) / 0.92, 1.25)) * (t > 0.96 ? Math.sqrt(Math.max(0.02, (1 - t) / 0.04)) : 1);
    const thick = chord * (0.16 - 0.08 * t) * inflate;
    const twist = THREE.MathUtils.degToRad(24 - 16 * t) * dir;
    const sweep = 0.012 * Math.pow(t, 2) * dir;
    const dihedral = r * 0.035;
    for (let k = 0; k < ring; k++) {
      // airfoil param: 0..1 along upper surface LE→TE, then lower surface TE→LE
      const upper = k < ringSeg;
      const s = upper ? k / ringSeg : (k - ringSeg) / ringSeg;
      const xc = upper ? s : 1 - s; // 0 = leading edge
      const yt = 5 * thick * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1015 * xc ** 4);
      const camber = thick * 0.9 * Math.sin(Math.PI * xc) * 0.6;
      const yy = upper ? camber + yt : camber - yt * 0.55;
      // chord along -Z*dir (leading edge forward in rotation direction)
      const cz = (0.35 - xc) * chord * dir * (1 + (inflate - 1) * 0.15);
      const lz = cz * Math.cos(twist) - yy * Math.sin(twist);
      const ly = cz * Math.sin(twist) + yy * Math.cos(twist);
      P.push(r, ly + dihedral, lz + sweep);
      UV.push(t, k / ring);
    }
  }
  for (let i = 0; i < spanSeg; i++)
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      const c = (i + 1) * ring + ((k + 1) % ring);
      const d = (i + 1) * ring + k;
      if (dir > 0) I.push(a, b, c, a, c, d);
      else I.push(a, c, b, a, d, c);
    }
  // caps
  const capCenter = (i: number) => {
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let k = 0; k < ring; k++) {
      cx += P[(i * ring + k) * 3];
      cy += P[(i * ring + k) * 3 + 1];
      cz += P[(i * ring + k) * 3 + 2];
    }
    const idx = P.length / 3;
    P.push(cx / ring, cy / ring, cz / ring);
    UV.push(i / spanSeg, 0.5);
    return idx;
  };
  const c0 = capCenter(0);
  const c1 = capCenter(spanSeg);
  for (let k = 0; k < ring; k++) {
    const a = k;
    const b = (k + 1) % ring;
    const ta = spanSeg * ring + k;
    const tb = spanSeg * ring + ((k + 1) % ring);
    if (dir > 0) {
      I.push(c0, b, a);
      I.push(c1, ta, tb);
    } else {
      I.push(c0, a, b);
      I.push(c1, tb, ta);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

/** Multiply UVs (used to keep the carbon weave at a realistic scale). */
export function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

/** Point + outward normal on a parametric surface. */
export function surfaceFrame(fn: SurfaceFn, u: number, v: number) {
  const p = fn(u, v, new THREE.Vector3());
  const eps = 1e-4;
  const du = fn(u + eps, v, new THREE.Vector3()).sub(fn(u - eps, v, new THREE.Vector3()));
  const dv = fn(u, v + eps, new THREE.Vector3()).sub(fn(u, v - eps, new THREE.Vector3()));
  const n = new THREE.Vector3().crossVectors(du, dv).normalize();
  // make it point away from the body axis
  const axis = new THREE.Vector3(0, p.y > 0 ? 0.01 : -0.01, p.z * 0.6);
  if (n.dot(p.clone().sub(axis)) < 0) n.negate();
  return { p, n, du: du.normalize(), dv: dv.normalize() };
}

// ───────────────────────────────────────────────────────── lifting surfaces
export interface LoftStation {
  /** spanwise coordinate (x for wings, y for fins) */
  s: number;
  /** offset of the chord line in the thickness direction (y for wings, x for fins) */
  t: number;
  /** leading-edge z */
  le: number;
  chord: number;
  /** thickness / chord */
  tc: number;
}

/** NACA-style cambered section: returns [upper, lower] thickness-direction offsets as chord fractions. */
export function airfoilAt(xc: number, tc: number, camber = 0.035): [number, number] {
  const x = Math.min(1, Math.max(0, xc));
  const yt = 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const p = 0.4;
  const yc = camber > 0 ? (x < p ? (camber / (p * p)) * (2 * p * x - x * x) : (camber / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x)) : 0;
  return [yc + yt, yc - yt];
}

/**
 * Closed loft of an airfoil along spanwise stations, optionally limited to the chord
 * fraction range [f0, f1] (used to split control surfaces from the main surface).
 * `axis = 'x'` builds a wing (span along X, thickness along Y);
 * `axis = 'y'` builds a fin (span along Y, thickness along X).
 */
export function wingLoft(stations: LoftStation[], f0 = 0, f1 = 1, ring = 22, camber = 0.035, axis: 'x' | 'y' = 'x') {
  const n = ring;
  const rows: THREE.Vector3[][] = stations.map((st) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < n * 2; k++) {
      const upper = k < n;
      const s = upper ? k / n : (k - n) / n;
      const e = (1 - Math.cos(Math.PI * s)) / 2;
      const xc = upper ? f0 + (f1 - f0) * e : f1 - (f1 - f0) * e;
      const [u, l] = airfoilAt(xc, st.tc, camber);
      const th = st.t + (upper ? u : l) * st.chord;
      const z = st.le - xc * st.chord;
      pts.push(axis === 'x' ? new THREE.Vector3(st.s, th, z) : new THREE.Vector3(th, st.s, z));
    }
    return pts;
  });
  const P: number[] = [];
  const I: number[] = [];
  const ringN = n * 2;
  for (const r of rows) for (const p of r) P.push(p.x, p.y, p.z);
  for (let i = 0; i < rows.length - 1; i++)
    for (let k = 0; k < ringN; k++) {
      const a = i * ringN + k;
      const b = i * ringN + ((k + 1) % ringN);
      const c = (i + 1) * ringN + ((k + 1) % ringN);
      const d = (i + 1) * ringN + k;
      I.push(a, b, c, a, c, d);
    }
  const cap = (i: number, flip: boolean) => {
    const c = new THREE.Vector3();
    for (const p of rows[i]) c.add(p);
    c.divideScalar(ringN);
    const ci = P.length / 3;
    P.push(c.x, c.y, c.z);
    for (let k = 0; k < ringN; k++) {
      const a = i * ringN + k;
      const b = i * ringN + ((k + 1) % ringN);
      if (flip) I.push(ci, b, a);
      else I.push(ci, a, b);
    }
  };
  cap(0, false);
  cap(rows.length - 1, true);
  // orientation check: an upper-surface triangle must face +thickness
  const mid = Math.floor((rows.length - 1) / 2);
  const ia = mid * ringN + Math.floor(n / 2);
  const ib = mid * ringN + Math.floor(n / 2) + 1;
  const ic = (mid + 1) * ringN + Math.floor(n / 2) + 1;
  const va = new THREE.Vector3(P[ia * 3], P[ia * 3 + 1], P[ia * 3 + 2]);
  const vb = new THREE.Vector3(P[ib * 3], P[ib * 3 + 1], P[ib * 3 + 2]);
  const vc = new THREE.Vector3(P[ic * 3], P[ic * 3 + 1], P[ic * 3 + 2]);
  const nrm = new THREE.Vector3().crossVectors(vb.sub(va), vc.sub(va));
  const up = axis === 'x' ? nrm.y : nrm.x;
  if (up < 0) for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

/** Solid of revolution along +Z from [radius, z] pairs (z ascending), placed at (x, y). */
export function latheZ(pts: [number, number][], seg = 32, x = 0, y = 0) {
  const g = lathe(pts.map(([r, z]) => [r, z] as [number, number]), seg);
  g.rotateX(Math.PI / 2); // lathe axis Y → Z (y' = -z, z' = y)
  g.translate(x, y, 0);
  return g;
}
