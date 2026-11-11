/**
 * Sunrise reveal: the K1000ULE on a desert pad at dawn. The aircraft starts as a silhouette
 * against the pre-dawn glow, the sun clears a distant ridge and lights it (the solar cells
 * first), the four lift rotors spin up and kick dust off the pad, then it lifts off.
 *
 * Rendered offline one deterministic frame at a time, like tools/hangar.ts:
 *   node tools/render-hangar.mjs k1000-sunrise.mp4 --url http://localhost:5173/tools/sunrise.html
 * Open /tools/sunrise.html?t=5 in the dev server to preview a single moment.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildDroneModel } from '../src/engine/DroneModel';
import { createMaterialLibrary } from '../src/engine/materials';
import { loadPartModels } from '../src/engine/PartModels';
import { BOOM, BOOM_Y } from '../src/data/layout';

declare global {
  interface Window {
    __ready?: boolean;
    __error?: string;
    __render?: (t: number) => string;
    __duration?: number;
  }
}

const Q = new URLSearchParams(location.search);
const W = Number(Q.get('w') ?? 1920);
const H = Number(Q.get('h') ?? 1080);

// ── timeline (seconds)
const CUT = 8.0; // head-on dawn shot → elevated three-quarter lift-off shot
const LIFT_START = 8.45;
const FADE_OUT = 10.6; // fade to black
const TITLE_IN = 11.0;
const DURATION = 12.6;

// ── world (metres; +Y up, aircraft nose toward +Z, +X = port = frame right in the first shot)
const PAD_TOP = 0.035;
const CLEARANCE = 0.1; // lowest point of the airframe above the pad, resting on two boom cradles
const SUN_AZ = (28 * Math.PI) / 180; // sun bearing from the tail, toward +X
const SUN_H = new THREE.Vector2(Math.sin(SUN_AZ), -Math.cos(SUN_AZ)); // horizontal direction toward the sun (x, z)
const RIDGE_R = 750; // distance of the far ridge the sun rises behind
const RIDGE_AT_SUN = 3.0; // its angular height (deg) at the sun's bearing
const SUN_RADIUS = 0.0052; // angular radius of the disc (rad), a little larger than life

const D2R = Math.PI / 180;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Monotone cubic interpolation through (x, y) keys: smooth, with no overshoot. */
function monotone(keys: [number, number][]) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = ys.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Piecewise-smooth blend of colour keyframes over the sun elevation (deg). */
function palette(keys: [number, number[]][]) {
  return (e: number, out: THREE.Color | THREE.Vector3) => {
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (e >= keys[i][0] && e <= keys[i + 1][0]) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
    const u = e <= keys[0][0] ? 0 : e >= keys[keys.length - 1][0] ? 1 : smooth(a[0], b[0], e);
    const v = a[1].map((x, i) => x + (b[1][i] - x) * u);
    (out as THREE.Vector3).set(v[0], v[1], v[2]);
    return out;
  };
}
const scalarKeys = (keys: [number, number][]) => {
  const p = palette(keys.map(([e, v]) => [e, [v, v, v]]));
  const tmp = new THREE.Vector3();
  return (e: number) => p(e, tmp).x;
};

// sun elevation (deg) over time: climbs through twilight, crawls while the disc clears the ridge
const sunElevation = monotone([
  [0, -3.2],
  [2.4, 1.6],
  [3.4, 2.62],
  [4.6, 3.02],
  [5.6, 3.35],
  [7.0, 4.3],
  [8.0, 5.0],
  [10.6, 6.6],
]);

// linear-light sky palette by sun elevation (deg)
const zenithAt = palette([
  [-3, [0.004, 0.009, 0.03]],
  [0, [0.012, 0.03, 0.085]],
  [3, [0.03, 0.075, 0.19]],
  [7, [0.05, 0.12, 0.3]],
]);
const horizonAt = palette([
  [-3, [0.02, 0.024, 0.05]],
  [0, [0.07, 0.075, 0.11]],
  [3, [0.2, 0.2, 0.24]],
  [7, [0.33, 0.35, 0.4]],
]);
const glowAt = palette([
  [-3, [0.2, 0.065, 0.02]],
  [0, [0.95, 0.36, 0.1]],
  [3, [1.6, 0.8, 0.34]],
  [7, [1.15, 0.82, 0.52]],
]);
const sunColAt = palette([
  [-3, [1, 0.34, 0.1]],
  [2, [1, 0.48, 0.19]],
  [4, [1, 0.6, 0.33]],
  [7, [1, 0.73, 0.5]],
]);
const aureoleAt = scalarKeys([
  [-3, 0.15],
  [0, 0.6],
  [3, 1.4],
]);
const beltAt = scalarKeys([
  [-3, 1],
  [2, 0.6],
  [5, 0],
]);
const sunIntensityAt = scalarKeys([
  [2, 1.9],
  [4, 2.9],
  [7, 3.7],
]);

// ── the far ridge: angular height (deg) by bearing, the same profile the sun gate uses
const RIDGE_WAVES = [2, 3, 5, 7, 11, 17, 29, 47, 83].map((k, i) => ({ k, a: 1 / Math.pow(k, 0.85), p: hash(i + 3) * 6.283 }));
const ridgeRaw = (a: number) => RIDGE_WAVES.reduce((s, w) => s + w.a * Math.sin(w.k * a + w.p), 0);
const bump = (a: number, c: number, w: number) => {
  let d = a - c;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.exp(-(d * d) / (w * w));
};
const farRaw = (a: number) => 1.6 + 0.75 * ridgeRaw(a) + 1.1 * bump(a, SUN_AZ - 0.12, 0.3);
const FAR_SHIFT = RIDGE_AT_SUN - farRaw(SUN_AZ);
const farAngle = (a: number) => farRaw(a) + FAR_SHIFT;
const nearAngle = (a: number) => Math.min(0.75 + 0.45 * ridgeRaw(a * 1.7 + 2.1) + 0.5 * bump(a, -0.9, 0.5), RIDGE_AT_SUN - 0.6 * bump(a, SUN_AZ, 0.25));

// ── shared uniforms: sky + atmosphere + sun gate
const U = {
  uSunDir: { value: new THREE.Vector3(0, 0, -1) },
  uZenith: { value: new THREE.Vector3() },
  uHorizon: { value: new THREE.Vector3() },
  uGlow: { value: new THREE.Vector3() },
  uSunCol: { value: new THREE.Vector3() },
  uAureole: { value: 1 },
  uBelt: { value: 1 },
  uSunE: { value: 0 },
  uSunH: { value: SUN_H.clone() },
  uRidgeR: { value: RIDGE_R },
  uRidgeH: { value: RIDGE_R * Math.tan(RIDGE_AT_SUN * D2R) },
  uFogDensity: { value: 0.0017 },
};

const SKY_GLSL = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunCol;
  uniform float uAureole; uniform float uBelt;
  vec3 skyColor(vec3 d) {
    float y = max(d.y, 0.0);
    vec3 dh = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0));
    vec3 sh = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
    float az = dot(dh, sh) * 0.5 + 0.5;
    vec3 col = mix(uHorizon, uZenith, pow(y, 0.5));
    // twilight band hugging the horizon, strongest under the sun
    col += uGlow * exp(-y * 7.0) * (0.18 + 0.82 * pow(az, 4.0));
    // belt of Venus: a faint pink band opposite the sun before sunrise
    col += vec3(0.06, 0.025, 0.035) * uBelt * exp(-pow((y - 0.08) / 0.07, 2.0)) * pow(1.0 - az, 3.0);
    float c = max(dot(d, uSunDir), 0.0);
    col += uSunCol * uAureole * (0.06 * pow(c, 10.0) + 0.45 * pow(c, 160.0) + 2.5 * pow(c, 2400.0));
    return col;
  }`;

const GATE_GLSL = /* glsl */ `
  uniform float uSunE; uniform vec2 uSunH; uniform float uRidgeR; uniform float uRidgeH;
  // fraction of the sun's disc visible over the far ridge from point p
  float sunGate(vec3 p) {
    float d = uRidgeR - dot(p.xz, uSunH);
    float occ = atan(uRidgeH - p.y, d);
    return smoothstep(-${SUN_RADIUS.toFixed(4)}, ${SUN_RADIUS.toFixed(4)}, uSunE - occ);
  }`;

/** Adds the ridge gate on direct sunlight and (optionally) sky-coloured aerial perspective. */
function outdoor(mat: THREE.Material, { gate = true, fog = false } = {}) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOutWP;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vOutWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vOutWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nvarying vec3 vOutWP;\n${SKY_GLSL}\n${GATE_GLSL}\nuniform float uFogDensity;`,
    );
    if (gate) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        { float sg = sunGate(vOutWP);
          reflectedLight.directDiffuse *= sg; reflectedLight.directSpecular *= sg;
          #ifdef USE_CLEARCOAT
            clearcoatSpecularDirect *= sg;
          #endif
        }`,
      );
    }
    if (fog) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `{ vec3 vd = vOutWP - cameraPosition; float dist = length(vd); vec3 dir = vd / dist;
           float f = 1.0 - exp(-dist * uFogDensity);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, skyColor(normalize(vec3(dir.x, 0.02, dir.z))), f); }`,
      );
    }
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|outdoor-${gate ? 'g' : ''}${fog ? 'f' : ''}`;
  mat.needsUpdate = true;
}

/** Sky dome; in env mode the lower hemisphere is the lit ground, so reflections have a floor. */
function skyMaterial(env: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uGround: { value: new THREE.Vector3() } },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      uniform vec3 uGround;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d);
        ${
          env
            ? 'if (d.y < 0.0) col = mix(skyColor(normalize(vec3(d.x, 0.0, d.z))), uGround, smoothstep(0.0, -0.06, d.y));'
            : `float c = dot(d, uSunDir);
               float r = acos(clamp(c, -1.0, 1.0)) / ${SUN_RADIUS.toFixed(4)};
               float disc = (1.0 - smoothstep(0.92, 1.04, r)) * (0.55 + 0.45 * sqrt(max(0.0, 1.0 - r * r)));
               col += uSunCol * disc * 60.0;`
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Tileable cracked-playa albedo: mud plates (jittered Voronoi), dark cracks, mottling. */
function playaCanvas() {
  const S = 1024;
  const G = 13; // plates per tile edge
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const pts: number[] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push((i + 0.15 + 0.7 * hash(i * 13 + j * 71)) / G, (j + 0.15 + 0.7 * hash(i * 29 + j * 53 + 7)) / G);
  const lat = (x: number, y: number, p: number, seed: number) => hash(((x % p) + p) % p * 157 + (((y % p) + p) % p) * 311 + seed * 7919);
  const noise = (u: number, v: number, p: number, seed: number) => {
    const fx = u * p;
    const fy = v * p;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let tx = fx - ix;
    let ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const a = lat(ix, iy, p, seed);
    const b = lat(ix + 1, iy, p, seed);
    const c2 = lat(ix, iy + 1, p, seed);
    const d = lat(ix + 1, iy + 1, p, seed);
    return a + (b - a) * tx + (c2 - a) * ty + (a - b - c2 + d) * tx * ty;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      // wobble the lookup so plate edges meander
      const wu = u + (noise(u, v, 12, 5) - 0.5) * 0.02;
      const wv = v + (noise(u, v, 12, 9) - 0.5) * 0.02;
      const ci = Math.floor(wu * G);
      const cj = Math.floor(wv * G);
      let f1 = 9;
      let f2 = 9;
      let id = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = ci + di;
          const jj = cj + dj;
          const k = ((((jj % G) + G) % G) * G + (((ii % G) + G) % G)) * 2;
          const px = pts[k] + Math.floor(ii / G);
          const py = pts[k + 1] + Math.floor(jj / G);
          const dd = Math.hypot(wu - px, wv - py);
          if (dd < f1) {
            f2 = f1;
            f1 = dd;
            id = k;
          } else if (dd < f2) f2 = dd;
        }
      }
      const edge = (f2 - f1) * S; // pixels from the crack
      let n = 0;
      let amp = 0.5;
      let tot = 0;
      for (const p of [4, 9, 23, 61]) {
        n += noise(u, v, p, p) * amp;
        tot += amp;
        amp *= 0.55;
      }
      n /= tot;
      let val = 0.8 + (n - 0.5) * 0.35 + (hash(id) - 0.5) * 0.08 + (hash(x * 1.31 + y * 977.7) - 0.5) * 0.05;
      // plates curl up a little at their rims: lighter rim, dark crack
      val *= 0.55 + 0.45 * smooth(0.6, 2.2, edge);
      val *= 1 + 0.05 * (1 - smooth(2.2, 7, edge));
      const k = Math.max(0, Math.min(255, Math.round(val * 255)));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Weathered concrete pad top with a painted landing ring. */
function padCanvas(size: number) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = (hash(Math.floor(x / 6) * 3.1 + Math.floor(y / 6) * 91.7) - 0.5) * 0.05 + (hash(x * 1.7 + y * 413.3) - 0.5) * 0.07;
      const blot = Math.sin(x * 0.011 + 1.3) * Math.sin(y * 0.009 + 0.4) * 0.05 + Math.sin(x * 0.027 + y * 0.019) * 0.03;
      const k = Math.round(Math.max(0, Math.min(1, 0.68 + n + blot)) * 255);
      const i = (y * S + x) * 4;
      img.data[i] = k;
      img.data[i + 1] = Math.round(k * 0.98);
      img.data[i + 2] = Math.round(k * 0.95);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const px = S / size;
  // expansion joints
  g.strokeStyle = 'rgba(40,38,35,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(S / 2, 0);
  g.lineTo(S / 2, S);
  g.moveTo(0, S / 2);
  g.lineTo(S, S / 2);
  g.stroke();
  // painted ring, worn
  g.globalAlpha = 0.82;
  g.strokeStyle = '#f2efe8';
  g.lineWidth = 0.12 * px;
  g.beginPath();
  g.arc(S / 2, S / 2, 2.7 * px, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 900; k++) {
    const a = hash(k * 3.3) * Math.PI * 2;
    const r = 2.7 * px + (hash(k * 7.7) - 0.5) * 0.14 * px;
    g.fillStyle = `rgba(0,0,0,${0.25 + 0.5 * hash(k)})`;
    g.fillRect(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 2 + hash(k * 1.9) * 5, 2 + hash(k * 2.9) * 4);
  }
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#a9a69f';
  g.fillRect(0, 0, S, S);
  return c;
}

function softDiscTexture(stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: W / H },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 3.1) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      vec3 col = c.rgb * mix(1.0, smoothstep(1.35, 0.3, length(q)), 0.55);
      col *= 1.0 + (h(vUv * 1000.0) - 0.5) * 0.05; // grain + dither against banding
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 96, 48), skyMaterial(false));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  const envScene = new THREE.Scene();
  const envSkyMat = skyMaterial(true);
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), envSkyMat));

  // ── aircraft
  const lib = createMaterialLibrary();
  const shell = lib.shell as THREE.MeshPhysicalMaterial;
  shell.color.set('#eef0f2');
  shell.roughness = 0.3;
  shell.clearcoat = 1;
  shell.clearcoatRoughness = 0.08;
  const panel = lib.panel as THREE.MeshPhysicalMaterial;
  panel.roughness = 0.3;
  panel.clearcoat = 1;
  panel.clearcoatRoughness = 0.08;
  const cad = await loadPartModels();
  const model = buildDroneModel(lib, null, cad);
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  const BASE_Y = PAD_TOP + CLEARANCE - box.min.y;
  model.root.position.set(0, BASE_Y, -(box.min.z + box.max.z) / 2);
  scene.add(model.root);
  model.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !m.userData.outdoor) {
        m.userData.outdoor = true;
        outdoor(m);
      }
    }
  });
  model.root.updateMatrixWorld(true);
  const abox = new THREE.Box3().setFromObject(model.root);
  console.log('aircraft bounds', abox.min.toArray(), abox.max.toArray());

  // ── lift rotors: blades blur into trailing ghost copies as they speed up, plus a faint disc
  type Rotor = { node: THREE.Group; spin: THREE.Group; ghosts: THREE.Group[]; ghostMats: THREE.MeshStandardMaterial[]; disc: THREE.Mesh; dir: number; ground: THREE.Vector3 };
  const rotors: Rotor[] = [];
  const GHOSTS = 10;
  const discTex = softDiscTexture([
    [0, 'rgba(255,255,255,0.25)'],
    [0.2, 'rgba(255,255,255,0.5)'],
    [0.86, 'rgba(255,255,255,0.75)'],
    [0.93, 'rgba(255,255,255,1)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  for (const id of ['lift-prop-01', 'lift-prop-02', 'lift-prop-03', 'lift-prop-04']) {
    const node = model.nodes.get(id);
    if (!node) continue;
    const dir = id === 'lift-prop-03' || id === 'lift-prop-04' ? -1 : 1;
    const sbox = new THREE.Box3();
    node.spin.updateMatrixWorld(true);
    const inv = node.group.matrixWorld.clone().invert();
    node.spin.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      sbox.union(mesh.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)));
    });
    const radius = Math.max(sbox.max.x, -sbox.min.x, sbox.max.z, -sbox.min.z);
    const ghostMats: THREE.MeshStandardMaterial[] = [];
    const matMap = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const ghosts: THREE.Group[] = [];
    for (let k = 0; k < GHOSTS; k++) {
      const gst = node.spin.clone(true);
      gst.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        const src = mesh.material as THREE.MeshStandardMaterial;
        let gm = matMap.get(src);
        if (!gm) {
          gm = new THREE.MeshStandardMaterial({
            color: src.color,
            map: src.map ?? null,
            roughness: src.roughness ?? 0.4,
            metalness: src.metalness ?? 0.2,
            transparent: true,
            depthWrite: false,
          });
          outdoor(gm);
          matMap.set(src, gm);
          ghostMats.push(gm);
        }
        mesh.material = gm;
      });
      gst.visible = false;
      node.group.add(gst);
      ghosts.push(gst);
    }
    const discMat = new THREE.MeshBasicMaterial({ color: '#2a2c30', map: discTex, transparent: true, opacity: 0, depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = (sbox.min.y + sbox.max.y) / 2;
    node.group.add(disc);
    const ground = new THREE.Vector3();
    node.group.getWorldPosition(ground);
    ground.y = PAD_TOP;
    rotors.push({ node: node.group, spin: node.spin, ghosts, ghostMats, disc, dir, ground });
  }
  console.log('rotors', rotors.length);

  // rotor speed (rad/s) and its integral (angle)
  const omega = (t: number) => 26 * smooth(6.0, 6.9, t) + 124 * smooth(6.7, 8.3, t);
  const ANGLE_DT = 1 / 600;
  const angleTable: number[] = [0];
  for (let i = 1; i * ANGLE_DT <= DURATION + 0.1; i++) angleTable.push(angleTable[i - 1] + omega((i - 0.5) * ANGLE_DT) * ANGLE_DT);
  const rotorAngle = (t: number) => {
    const f = t / ANGLE_DT;
    const i = Math.min(angleTable.length - 2, Math.floor(f));
    return angleTable[i] + (angleTable[i + 1] - angleTable[i]) * (f - i);
  };
  // lift height: accelerating climb straight up
  const liftHeight = (t: number) => {
    const u = clamp01((t - LIFT_START) / (FADE_OUT + 0.5 - LIFT_START));
    return 2.3 * u * u * (1.25 - 0.25 * u);
  };

  // ── nav lights: on in the dark, fading back as the day comes up
  for (const m of model.recLamp) m.emissiveIntensity = 0;

  // ── cradles under the booms (the aircraft has no landing gear)
  const cradleMat = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.7, metalness: 0.3 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.95 });
  outdoor(cradleMat);
  outdoor(rubberMat);
  const boomBottom = BASE_Y + BOOM_Y - BOOM.radius;
  const cradleH = boomBottom - PAD_TOP;
  const cradleZ = (BOOM.rotorFrontZ + BOOM.rotorRearZ) / 2 + model.root.position.z;
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(side * BOOM.x, PAD_TOP, cradleZ);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.42), cradleMat);
    foot.position.y = 0.015;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, cradleH - 0.06, 0.05), cradleMat);
    post.position.y = 0.03 + (cradleH - 0.06) / 2;
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.2), rubberMat);
    saddle.position.y = cradleH - 0.015;
    for (const b of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.018, (cradleH - 0.06) * 0.9, 0.018), cradleMat);
      brace.position.set(0, 0.03 + (cradleH - 0.06) * 0.42, b * 0.09);
      brace.rotation.x = b * 0.38;
      g.add(brace);
    }
    g.add(foot, post, saddle);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(g);
  }

  // ── desert floor and pad
  const playa = playaCanvas();
  const groundAlbedo = new THREE.CanvasTexture(playa);
  groundAlbedo.colorSpace = THREE.SRGBColorSpace;
  const groundBump = new THREE.CanvasTexture(playa);
  const GROUND = 1700;
  const TILE = 3.2;
  for (const tx of [groundAlbedo, groundBump]) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(GROUND / TILE, GROUND / TILE);
    tx.anisotropy = 16;
  }
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#c9ab86',
    map: groundAlbedo,
    bumpMap: groundBump,
    bumpScale: 1.0,
    roughness: 0.96,
    metalness: 0,
  });
  outdoor(groundMat, { fog: true });
  const prevGround = groundMat.onBeforeCompile;
  groundMat.onBeforeCompile = (shader, r) => {
    prevGround.call(groundMat, shader, r);
    // large-scale tonal drift so the plate texture doesn't read as a repeat
    // fade the crack relief with distance too
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <bumpmap_pars_fragment>',
      THREE.ShaderChunk.bumpmap_pars_fragment.replace(/bumpScale \*/g, 'bumpScale * (1.0 - smoothstep(10.0, 45.0, length(vOutWP - cameraPosition))) *'),
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       // far away, swap the crack pattern for its average so it can't alias into moire
       diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * texture2D(map, vMapUv, 12.0).rgb, smoothstep(18.0, 90.0, length(vOutWP - cameraPosition)));
       diffuseColor.rgb *= mix(0.78, 1.14, texture2D(map, vMapUv * 0.031 + 0.37).g) * mix(0.9, 1.06, texture2D(map, vMapUv * 0.0047 + 0.11).r);`,
    );
  };
  groundMat.customProgramCacheKey = () => 'sunrise-ground';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const PAD = 7.6;
  const padTex = new THREE.CanvasTexture(padCanvas(PAD));
  padTex.colorSpace = THREE.SRGBColorSpace;
  padTex.anisotropy = 16;
  const padTop = new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.88, metalness: 0 });
  const padSide = new THREE.MeshStandardMaterial({ color: '#8f8b84', roughness: 0.92 });
  outdoor(padTop, { fog: true });
  outdoor(padSide, { fog: true });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(PAD, PAD_TOP + 0.02, PAD), [padSide, padSide, padTop, padSide, padSide, padSide]);
  pad.position.y = (PAD_TOP - 0.02) / 2;
  pad.receiveShadow = true;
  scene.add(pad);

  // ── ridges: a near low range and the far range the sun clears
  const mountainMat = new THREE.MeshStandardMaterial({ color: '#4a3f37', roughness: 0.95, side: THREE.DoubleSide });
  const farMat = new THREE.MeshStandardMaterial({ color: '#3d3732', roughness: 0.95, side: THREE.DoubleSide });
  outdoor(mountainMat, { gate: false, fog: true });
  outdoor(farMat, { gate: false, fog: true });
  const ridge = (R: number, angleDeg: (a: number) => number, mat: THREE.Material) => {
    const N = 1440;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const top = R * Math.tan(angleDeg(a) * D2R);
      const sx = Math.sin(a);
      const sz = -Math.cos(a);
      // a sloped face: the crest, a shoulder part way down, and the base well below the floor
      pos.push(sx * R, top, sz * R, sx * (R - 40), top * 0.55, sz * (R - 40), sx * (R - 140), -4, sz * (R - 140));
      if (i < N) {
        const b = i * 3;
        idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  };
  ridge(RIDGE_R, farAngle, farMat);
  ridge(400, nearAngle, mountainMat);

  // ── sun
  const sun = new THREE.DirectionalLight('#ffffff', 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4.2, right: 4.2, top: 3.2, bottom: -3.2, near: 1, far: 90 });
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // ── downwash dust: particles thrown radially off the pad under each rotor
  const DUST = 7000;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST * 3);
  const dSeed = new Float32Array(DUST * 4);
  const dBirth = new Float32Array(DUST);
  const dAmp = new Float32Array(DUST);
  const dustStrength = (t: number) => smooth(6.9, 8.1, t) * (0.1 + 0.9 * Math.exp(-liftHeight(t) / 0.7)) * (1 - smooth(10.4, 11, t));
  for (let i = 0; i < DUST; i++) {
    const r = rotors[i % Math.max(1, rotors.length)];
    const tb = 6.8 + hash(i * 1.37 + 0.2) * (FADE_OUT + 0.3 - 6.8);
    dBirth[i] = tb;
    dAmp[i] = dustStrength(tb);
    dPos.set([r?.ground.x ?? 0, PAD_TOP, r?.ground.z ?? 0], i * 3);
    dSeed.set([hash(i * 3.1), hash(i * 5.7 + 1), hash(i * 7.3 + 2), hash(i * 11.9 + 3)], i * 4);
  }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 4));
  dGeo.setAttribute('aBirth', new THREE.BufferAttribute(dBirth, 1));
  dGeo.setAttribute('aAmp', new THREE.BufferAttribute(dAmp, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uTime: { value: 0 },
      uScale: { value: H / (2 * Math.tan((34 * D2R) / 2)) },
      uAmbient: { value: new THREE.Vector3() },
      uSunLight: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${GATE_GLSL}
      uniform vec3 uSunDir;
      uniform float uTime; uniform float uScale; uniform vec3 uAmbient; uniform vec3 uSunLight;
      attribute vec4 aSeed; attribute float aBirth; attribute float aAmp;
      varying vec3 vCol; varying float vAlpha; varying vec2 vRot;
      void main() {
        float age = uTime - aBirth;
        float life = 1.1 + 1.1 * aSeed.w;
        if (age < 0.0 || age > life || aAmp < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float ang = aSeed.x * 6.2832 + 0.35 * sin(age * 1.7 + aSeed.y * 9.0);
        float spd = mix(1.6, 4.6, aSeed.y);
        float tau = 0.85;
        float r = 0.22 + spd * tau * (1.0 - exp(-age / tau));
        vec3 p = position + vec3(cos(ang) * r, 0.0, sin(ang) * r);
        p.y += 0.01 + (0.05 + 0.35 * aSeed.z * aSeed.z) * (1.0 - exp(-age / 1.2)) + 0.04 * age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = 0.1 + 0.45 * age + 0.18 * aSeed.z;
        gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 512.0);
        // forward scattering when the dust is between the camera and the sun
        vec3 v = normalize(p - cameraPosition);
        float c = dot(v, uSunDir);
        float g = 0.6;
        float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
        vCol = uAmbient + uSunLight * sunGate(p) * (0.25 + 0.35 * phase);
        vAlpha = aAmp * smoothstep(0.0, 0.18, age) * exp(-age / 0.7) * smoothstep(life, life * 0.5, age) * 0.04;
        vRot = vec2(aSeed.w * 6.2832, aSeed.z);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vAlpha; varying vec2 vRot;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float d = dot(q, q);
        if (d > 1.0) discard;
        // lumpy puff instead of a perfect disc
        float a = atan(q.y, q.x) + vRot.x;
        float lump = 0.85 + 0.15 * sin(a * 3.0) * sin(a * 5.0 + vRot.y * 6.0);
        float m = exp(-d * 3.2 / lump);
        gl_FragColor = vec4(vCol, vAlpha * m);
      }`,
  });
  const dust = new THREE.Points(dGeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 5;
  scene.add(dust);

  // ── camera + post
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 5000);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.1, 1.8);
  (bloom as unknown as { compositeMaterial: THREE.ShaderMaterial }).compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.55, 0.2, 0.0, 0.0];
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // ── end card: fade to black, title and logo
  const hud = new THREE.Scene();
  const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blackMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, toneMapped: false, depthTest: false });
  hud.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blackMat));
  await document.fonts.load('200 140px Inter');
  await document.fonts.load('400 34px Inter');
  const logo = new Image();
  logo.src = '/brand/kraus-hamdani-aerospace.png';
  await logo.decode().catch(() => undefined);
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = W;
  titleCanvas.height = H;
  {
    const g = titleCanvas.getContext('2d')!;
    const s = H / 1080;
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `200 ${Math.round(132 * s)}px Inter`;
    (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(30 * s)}px`;
    g.fillText('K1000ULE', W / 2 + 15 * s, H / 2 - 10 * s);
    g.font = `400 ${Math.round(30 * s)}px Inter`;
    (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(10 * s)}px`;
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.fillText('POWERED BY DAYLIGHT', W / 2 + 5 * s, H / 2 + 62 * s);
    if (logo.naturalWidth) {
      const lw = 240 * s;
      const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
      g.globalAlpha = 0.85;
      g.drawImage(logo, W / 2 - lw / 2, H - 150 * s - lh / 2, lw, lh);
    }
  }
  const titleTex = new THREE.CanvasTexture(titleCanvas);
  titleTex.colorSpace = THREE.SRGBColorSpace;
  const titleMat = new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, opacity: 0, toneMapped: false, depthTest: false });
  hud.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), titleMat));

  // ── environment lighting from the sky, rebuilt as it changes
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT: THREE.WebGLRenderTarget | null = null;
  let envKey = '';
  const groundAlb = new THREE.Vector3(0.42, 0.33, 0.24);
  const updateEnv = (e: number) => {
    const key = e.toFixed(2);
    if (key === envKey) return;
    envKey = key;
    const prev = envRT;
    envRT = pmrem.fromScene(envScene, 0, 0.1, 500, { size: 128 });
    prev?.dispose();
    scene.environment = envRT.texture;
  };

  // ── camera paths
  const SHOT1 = {
    from: new THREE.Vector3(0.0, 0.2, 7.5),
    to: new THREE.Vector3(-0.15, 1.12, 6.3),
    lookFrom: new THREE.Vector3(0.65, 0.62, 0),
    lookTo: new THREE.Vector3(0.35, 0.38, 0),
  };
  const ORBIT = {
    azimuth: [(-56 * Math.PI) / 180, (-47 * Math.PI) / 180], // negative = port side (+x)
    radius: [6.2, 6.0],
    height: [2.7, 2.6],
  };

  const tmpV = new THREE.Vector3();
  window.__duration = DURATION;
  window.__render = (t: number) => {
    // ── sky, sun, light
    const e = sunElevation(t);
    const er = e * D2R;
    U.uSunE.value = er;
    U.uSunDir.value.set(Math.sin(SUN_AZ) * Math.cos(er), Math.sin(er), -Math.cos(SUN_AZ) * Math.cos(er));
    zenithAt(e, U.uZenith.value);
    horizonAt(e, U.uHorizon.value);
    glowAt(e, U.uGlow.value);
    sunColAt(e, U.uSunCol.value);
    U.uAureole.value = aureoleAt(e);
    U.uBelt.value = beltAt(e);
    const sunI = sunIntensityAt(e);
    sun.color.setRGB(U.uSunCol.value.x, U.uSunCol.value.y, U.uSunCol.value.z);
    sun.intensity = sunI;
    // lit floor seen from below in the environment map
    const gateFloor = smooth(-0.3, 0.3, e - RIDGE_AT_SUN);
    envSkyMat.uniforms.uGround.value
      .copy(U.uHorizon.value)
      .multiplyScalar(0.55)
      .addScaledVector(U.uSunCol.value, sunI * Math.sin(Math.max(er, 0)) * gateFloor * 0.35)
      .multiply(groundAlb);
    updateEnv(e);

    // ── aircraft: rotors, nav lights, lift-off
    const lift = liftHeight(t);
    model.root.position.y = BASE_Y + lift;
    model.root.rotation.z = lift > 0 ? 0.012 * Math.sin(t * 2.1) * smooth(0, 0.6, lift) : 0;
    model.root.rotation.x = lift > 0 ? 0.008 * Math.sin(t * 1.6 + 1) * smooth(0, 0.6, lift) : 0;
    sun.target.position.set(0, BASE_Y + lift + 0.3, model.root.position.z);
    sun.position.copy(sun.target.position).addScaledVector(U.uSunDir.value, 40);

    const ang = rotorAngle(t);
    const arc = omega(t) / 60; // 180° shutter at 30 fps
    const blur = arc > 0.12;
    const op = 1 - Math.pow(1 - 0.9, 1 / GHOSTS);
    for (const r of rotors) {
      r.spin.rotation.y = ang * r.dir;
      r.spin.visible = !blur;
      r.ghosts.forEach((gst, k) => {
        gst.visible = blur;
        gst.rotation.y = (ang - (arc * k) / (GHOSTS - 1)) * r.dir;
      });
      for (const m of r.ghostMats) m.opacity = op;
      (r.disc.material as THREE.MeshBasicMaterial).opacity = 0.22 * smooth(1.0, 2.2, arc);
    }

    const night = 1 - smooth(1.2, 3.6, e);
    const strobe = (t % 1.3) / 1.3 < 0.06 ? 1 : 0.15;
    for (const m of model.ledMaterials) {
      const base = m.userData.baseEmissive ?? 2;
      const white = m.emissive.r > 0.9 && m.emissive.g > 0.9 && m.emissive.b > 0.9;
      m.emissiveIntensity = base * (0.08 + night * 2.0) * (white && night > 0.3 ? strobe : 1);
    }
    for (const sp of model.glows) {
      const mat = sp.material as THREE.SpriteMaterial;
      const white = mat.color.r > 0.9 && mat.color.g > 0.9 && mat.color.b > 0.9;
      mat.opacity = (0.02 + night * 0.8) * (white && night > 0.3 ? strobe : 1);
      sp.scale.setScalar(0.04 + night * 0.06);
    }

    // ── dust lighting
    dustMat.uniforms.uTime.value = t;
    tmpV.copy(U.uHorizon.value).multiplyScalar(0.9).multiply(new THREE.Vector3(0.95, 0.8, 0.62));
    dustMat.uniforms.uAmbient.value.copy(tmpV);
    dustMat.uniforms.uSunLight.value.copy(U.uSunCol.value).multiplyScalar(sunI * 0.55).multiply(new THREE.Vector3(0.95, 0.82, 0.65));

    // ── camera
    if (t < CUT) {
      const u = smooth(1.4, 7.6, t);
      camera.position.lerpVectors(SHOT1.from, SHOT1.to, u);
      camera.position.z -= 0.25 * (t / CUT);
      camera.lookAt(tmpV.lerpVectors(SHOT1.lookFrom, SHOT1.lookTo, u));
    } else {
      const u = clamp01((t - CUT) / (FADE_OUT + 0.4 - CUT));
      const lerp = (r: number[]) => r[0] + (r[1] - r[0]) * u;
      const az = lerp(ORBIT.azimuth);
      const rad = lerp(ORBIT.radius);
      camera.position.set(Math.sin(-az) * rad, lerp(ORBIT.height) + 0.35 * lift, Math.cos(az) * rad);
      camera.lookAt(0.1, 0.42 + 0.72 * lift, 0.05);
    }
    sky.position.copy(camera.position);

    // ── frame
    grade.uniforms.uTime.value = t;
    blackMat.opacity = smooth(FADE_OUT, TITLE_IN - 0.05, t);
    titleMat.opacity = smooth(TITLE_IN + 0.1, TITLE_IN + 0.8, t);
    renderer.autoClear = true;
    if (t < TITLE_IN) composer.render();
    else {
      renderer.setRenderTarget(null);
      renderer.setClearColor('#000', 1);
      renderer.clear();
    }
    renderer.autoClear = false;
    renderer.render(hud, hudCam);
    renderer.autoClear = true;
    return renderer.domElement.toDataURL('image/png');
  };

  const t = Q.get('t');
  if (t !== null) window.__render(Number(t));
  window.__ready = true;
}

main().catch((e) => {
  console.error(e);
  window.__error = String(e?.stack ?? e);
});
