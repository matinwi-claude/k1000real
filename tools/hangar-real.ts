/**
 * Hangar doors: a single-shot, colour, photoreal reveal of the K1000ULE.
 *
 * One locked angle (a slow dolly push from the front-port three-quarter). The hangar is dark
 * apart from an exit sign and a hairline of daylight at the door seam. The big sliding doors
 * behind the aircraft roll apart; low sun pours in through the haze, sweeps across the airframe
 * and throws its shadow toward the lens. Then the high-bay lights come on row by row and the
 * aircraft is revealed in full, with a small title at the end.
 *
 * Rendered offline one deterministic frame at a time (tools/render-hangar.mjs). Open
 * /tools/hangar-real.html?t=7 in the dev server to preview one moment.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
const DURATION = 12.5;
const DOOR_START = 1.0;
const DOOR_END = 9.6;
const ROW_ON = [8.5, 8.75, 9.0, 9.25]; // high-bay rows, back to front
const TITLE_IN = 10.4;

// ── hangar (metres; aircraft nose toward +Z, port = +X; the doors are in the starboard wall, x = HX0)
const HX0 = -14;
const HX1 = 14;
const HZ0 = -26;
const HZ1 = 13;
const EAVE = 8.2;
const DOOR_C = -9; // door centre (z)
const DOOR_HALF = 8; // half the opening width
const DOOR_H = 7;
const DOOR_TRAVEL = 8.15; // how far each leaf slides
const CLEARANCE = 0.32; // aircraft belly above the floor, on two boom cradles
// sun outside, low beyond the doors and a little behind the aircraft (unit vector toward the sun)
const SUN = new THREE.Vector3(-0.905, 0.3, -0.3).normalize();

// ── the one camera angle: a slow push in from the front-port three-quarter, high enough to see the solar wing
const CAM_FROM = new THREE.Vector3(2.75, 1.7, 7.15);
const CAM_TO = new THREE.Vector3(2.35, 1.55, 6.35);
const LOOK_FROM = new THREE.Vector3(-0.05, 0.45, -0.45);
const LOOK_TO = new THREE.Vector3(0.1, 0.5, -0.3);
const FOV = 30;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Leaf travel: a heavy door — slow to get going, steady, then easing to a stop. */
function doorOpen(t: number) {
  const u = clamp01((t - DOOR_START) / (DOOR_END - DOOR_START));
  const e = u < 0.35 ? (u / 0.35) ** 2 * 0.25 : u < 0.8 ? 0.25 + ((u - 0.35) / 0.45) * 0.6 : 0.85 + 0.15 * (1 - (1 - (u - 0.8) / 0.2) ** 2);
  return DOOR_TRAVEL * e;
}
/** LED high-bay switch-on: a quick stutter, then full. */
function flickerOn(t: number, t0: number, seed: number) {
  const d = t - t0;
  if (d < 0) return 0;
  if (d > 0.16) return 1;
  const pattern = [0.7, 0.1, 1, 0.35, 1];
  const i = Math.min(pattern.length - 1, Math.floor((d / 0.16) * pattern.length));
  return pattern[i] * (0.8 + 0.2 * hash(seed + i));
}

function valueNoise(S: number) {
  const lat = (x: number, y: number, p: number, seed: number) => hash(((x % p) + p) % p * 157 + (((y % p) + p) % p) * 311 + seed * 7919);
  return (x: number, y: number, p: number, seed: number) => {
    const fx = (x / S) * p;
    const fy = (y / S) * p;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let tx = fx - ix;
    let ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const a = lat(ix, iy, p, seed);
    const b = lat(ix + 1, iy, p, seed);
    const c = lat(ix, iy + 1, p, seed);
    const d = lat(ix + 1, iy + 1, p, seed);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Tileable sealed-concrete albedo: soft mottling, speckle, faint tyre scuffs and saw-cut joints. */
function concreteCanvas() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const noise = valueNoise(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let n = 0;
      let amp = 0.5;
      let tot = 0;
      for (const p of [3, 7, 16, 37, 90]) {
        n += noise(x, y, p, p) * amp;
        tot += amp;
        amp *= 0.55;
      }
      n /= tot;
      let v = 0.74 + (n - 0.5) * 0.42 + (hash(x * 1.31 + y * 977.7) - 0.5) * 0.07;
      // long faint scuffs along the tow direction
      const sc = noise(x * 0.08, y * 2.2, 40, 9);
      v *= 1 - 0.07 * smooth(0.62, 0.8, sc);
      const jx = Math.min(x, S - 1 - x);
      const jy = Math.min(y, S - 1 - y);
      if (jx < 2 || jy < 2) v *= 0.5;
      const k = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Painted parking box and a lead-in line, with worn paint. Covers a SIZE×SIZE patch under the aircraft. */
const DECAL_SIZE = 14;
function decalCanvas() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const px = (m: number) => (m / DECAL_SIZE + 0.5) * S; // metres (x or -z) → pixels
  g.strokeStyle = '#d9a514';
  g.lineWidth = (0.1 / DECAL_SIZE) * S;
  // parking box (x ±4.2, z −3.6…3.4), drawn with canvas y = −z
  g.strokeRect(px(-4.2), px(-3.4), px(4.2) - px(-4.2), px(3.6) - px(-3.4));
  // centre line toward the doors
  g.beginPath();
  g.moveTo(px(0), px(3.6));
  g.lineTo(px(0), px(6.9));
  g.stroke();
  // hatched corner marks
  g.lineWidth = (0.07 / DECAL_SIZE) * S;
  for (const [cx, cz] of [
    [-4.2, -3.4],
    [4.2, -3.4],
    [-4.2, 3.6],
    [4.2, 3.6],
  ]) {
    for (let k = 1; k <= 3; k++) {
      const o = k * 0.22;
      g.beginPath();
      g.moveTo(px(cx - Math.sign(cx) * o), px(-cz));
      g.lineTo(px(cx), px(-cz + Math.sign(cz) * o));
      g.stroke();
    }
  }
  // wear: knock holes in the paint
  const img = g.getImageData(0, 0, S, S);
  const noise = valueNoise(S);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4 + 3;
      if (!img.data[i]) continue;
      const n = noise(x, y, 64, 3) * 0.6 + noise(x, y, 260, 5) * 0.4;
      const keep = smooth(0.32, 0.5, n) * (0.75 + 0.25 * hash(x * 3.1 + y * 7.7));
      img.data[i] = Math.round(img.data[i] * keep);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Insulated wall panels: a soft vertical rib every 0.33 m (used as a bump map). */
function ribCanvas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 4;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, '#000');
  gr.addColorStop(0.08, '#fff');
  gr.addColorStop(0.16, '#000');
  gr.addColorStop(1, '#000');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 4);
  return c;
}

function radialTexture(inner = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(inner, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Polished-concrete reflection added over the lit floor: blurred, smeared toward the viewer, Fresnel-weighted. */
const FloorReflectShader = {
  name: 'FloorReflect',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    uInvRes: { value: new THREE.Vector2(1 / W, 1 / H) },
    tConcrete: { value: null as THREE.Texture | null },
    uRepeat: { value: 15 },
    uStrength: { value: 0.55 },
    uTexel: { value: new THREE.Vector2(2 / W, 2 / H) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vFloorUv; varying vec3 vWorld;
    void main() {
      vFloorUv = uv;
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform sampler2D tConcrete;
    uniform float uRepeat; uniform float uStrength; uniform vec2 uTexel; uniform vec2 uInvRes;
    varying vec2 vFloorUv; varying vec3 vWorld;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = gl_FragCoord.xy * uInvRes;
      float conc = texture2D(tConcrete, vFloorUv * uRepeat + 0.5).r;
      float dist = length(cameraPosition.xz - vWorld.xz);
      float spread = mix(6.0, 13.0, clamp((dist - 3.0) / 12.0, 0.0, 1.0));
      float jit = (h(gl_FragCoord.xy) - 0.5) * 0.25;
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int i = -9; i <= 9; i++) {
        for (int j = -3; j <= 3; j++) {
          float fi = float(i) + jit; float fj = float(j) + jit * 0.7;
          float w = exp(-fi * fi / 30.0 - fj * fj / 5.0);
          // taps never reach above this pixel by more than a hair: beyond the floor's far edge the
          // reflection image holds nothing real (the world past the back wall)
          vec2 suv = uv + vec2(fj * uTexel.x * 1.6, fi * uTexel.y * spread * 0.6);
          suv.y = min(suv.y, uv.y + 0.004);
          acc += min(texture2D(tDiffuse, suv).rgb, vec3(30.0)) * w;
          wsum += w;
        }
      }
      vec3 refl = acc / wsum;
      vec3 V = normalize(cameraPosition - vWorld);
      float F = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
      float k = uStrength * F * mix(0.5, 1.0, smoothstep(0.3, 0.85, conc));
      gl_FragColor = vec4(refl * color * k, 1.0);
    }`,
};

/** Volumetric sunlight: march each view ray through the hazy air, testing every step against a
 *  depth map rendered from the sun, so the shafts are cut by the door edges and the aircraft. */
const VolumeShader = {
  uniforms: {
    tDepth: { value: null as THREE.Texture | null },
    tSun: { value: null as THREE.Texture | null },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uSunVP: { value: new THREE.Matrix4() },
    uSunDir: { value: SUN.clone() },
    uCamPos: { value: new THREE.Vector3() },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDepth; uniform sampler2D tSun;
    uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform mat4 uSunVP;
    uniform vec3 uSunDir; uniform vec3 uCamPos;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float sunVis(vec3 p) {
      vec4 sc = uSunVP * vec4(p, 1.0);
      vec3 n = sc.xyz / sc.w;
      vec2 uv = n.xy * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
      float occ = unpackRGBAToDepth(texture2D(tSun, uv));
      return step(n.z * 0.5 + 0.5, occ + 0.0008);
    }
    void main() {
      float d = texture2D(tDepth, vUv).x;
      vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      v /= v.w;
      vec3 end = (uCamWorld * v).xyz;
      vec3 ray = end - uCamPos;
      float len = min(length(ray), 34.0);
      vec3 dir = normalize(ray);
      const int N = 72;
      float stepLen = len / float(N);
      float j = h(gl_FragCoord.xy);
      float acc = 0.0;
      for (int i = 0; i < N; i++) {
        vec3 p = uCamPos + dir * (float(i) + j) * stepLen;
        // the air outside the doors is not part of the hangar's haze
        if (p.x < ${HX0}.0) break;
        acc += sunVis(p);
      }
      float c = dot(dir, uSunDir);
      float g = 0.62;
      float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) / 12.566;
      float phase = 0.8 * hg + 0.2 / 12.566;
      gl_FragColor = vec4(acc * stepLen * phase, len, 0.0, 1.0);
    }`,
};

const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tVol: { value: null as THREE.Texture | null },
    uSunScatter: { value: new THREE.Vector3() },
    uAmbHaze: { value: new THREE.Vector3() },
    uTexel: { value: new THREE.Vector2(2 / W, 2 / H) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tVol; uniform vec3 uSunScatter; uniform vec3 uAmbHaze; uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // half-float overflow from tiny sun glints on the clear coat: keep them finite
      c.rgb = min(c.rgb, vec3(60.0));
      if (any(isnan(c.rgb))) c.rgb = vec3(0.0);
      // soften the marching noise with a small blur
      vec2 acc = vec2(0.0); float w = 0.0;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
        float k = exp(-float(i * i + j * j) / 3.0);
        acc += texture2D(tVol, vUv + vec2(float(i), float(j)) * uTexel).xy * k;
        w += k;
      }
      acc /= w;
      float centre = texture2D(tVol, vUv).y;
      c.rgb += acc.x * uSunScatter + (1.0 - exp(-centre * 0.035)) * uAmbHaze;
      gl_FragColor = c;
    }`,
};

/** Lens and film: a touch of lateral chromatic aberration, vignette, halation lift and grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: W / H },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 3.1) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
      vec2 off = d * 0.0008 * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      // gentle teal shadows / warm highlights before the tone curve
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.94, 1.0, 1.06), vec3(1.04, 1.0, 0.95), smoothstep(0.02, 0.6, l));
      col *= mix(1.0, smoothstep(1.3, 0.25, sqrt(r2)), 0.6);
      col *= 1.0 + (h(vUv * 1000.0) - 0.5) * 0.06;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

/** Dust motes drifting in the air; bright only inside the sunbeam, strongly forward-scattering. */
function dustMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      tSun: { value: null as THREE.Texture | null },
      uSunVP: { value: new THREE.Matrix4() },
      uSun: { value: SUN.clone() },
      uPx: { value: H / (2 * Math.tan(((FOV / 2) * Math.PI) / 180)) },
      uAmb: { value: 0 },
      uSunCol: { value: new THREE.Vector3(1, 0.86, 0.68) },
    },
    vertexShader: /* glsl */ `
      #include <packing>
      attribute vec3 aSeed;
      uniform sampler2D tSun; uniform mat4 uSunVP;
      uniform float uTime; uniform float uOpen; uniform vec3 uSun; uniform float uPx; uniform float uAmb;
      varying float vLum; varying float vSoft;
      const vec3 BMIN = vec3(${HX0 + 2}.0, 0.05, ${HZ0}.0);
      const vec3 BSIZE = vec3(${HX1 - HX0 - 4}.0, 6.5, ${HZ1 - HZ0 - 4}.0);
      void main() {
        vec3 p = position;
        float t = uTime;
        p += vec3(sin(t * (0.21 + aSeed.x * 0.3) + aSeed.y * 40.0) * 0.18,
                  t * (0.012 + aSeed.z * 0.03) + sin(t * 0.37 + aSeed.x * 30.0) * 0.08,
                  sin(t * (0.17 + aSeed.y * 0.25) + aSeed.z * 50.0) * 0.18 + t * 0.03);
        p = BMIN + mod(p - BMIN, BSIZE);
        // is this mote in the sunbeam? (same sun depth map as the volumetric light)
        vec4 sc = uSunVP * vec4(p, 1.0);
        vec3 sn = sc.xyz / sc.w;
        float occ = unpackRGBAToDepth(texture2D(tSun, sn.xy * 0.5 + 0.5));
        float inX = step(sn.z * 0.5 + 0.5, occ + 0.0008);
        float inY = 1.0;
        vec3 V = normalize(cameraPosition - p);
        float g = 0.72;
        float c = dot(-uSun, V);
        float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        float r = 0.0018 + aSeed.x * 0.0025;
        float px = r * uPx / dist;
        float size = max(px, 1.2);
        vSoft = 0.5;
        // motes nearer than ~2 m are out of focus: bigger, fainter
        float defocus = smoothstep(2.5, 0.6, dist) * 6.0;
        size += defocus;
        float energy = (px * px) / (size * size);
        vLum = (inX * inY * hg * 0.9 + uAmb) * energy * (0.4 + aSeed.y);
        gl_PointSize = size * 2.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunCol; varying float vLum; varying float vSoft;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, r);
        gl_FragColor = vec4(uSunCol * vLum * a * 6.0, 1.0);
      }`,
  });
}

/** Daylight sky outside the doors (overexposed through the opening, as a camera would see it). */
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthWrite: false,
    clipping: true,
    uniforms: { uSun: { value: SUN.clone() }, uGain: { value: 1 } },
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec3 uSun; uniform float uGain; varying vec3 vDir;
      void main() {
        #include <clipping_planes_fragment>
        vec3 d = normalize(vDir);
        float e = max(d.y, 0.0);
        vec3 zen = vec3(0.32, 0.5, 0.92);
        vec3 hor = vec3(1.0, 0.93, 0.82);
        vec3 col = mix(hor, zen, pow(e, 0.45));
        float c = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.8, 0.55) * (pow(c, 8.0) * 1.5 + pow(c, 200.0) * 8.0);
        col *= mix(0.6, 1.0, smoothstep(-0.2, 0.02, d.y));
        gl_FragColor = vec4(col * 3.2 * uGain, 1.0);
      }`,
  });
}

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000');
  const exterior = new THREE.Group(); // everything outside the doors (white in the shaft mask)
  scene.add(exterior);
  const shadowed = (o: THREE.Object3D, cast = true, receive = true) =>
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = cast;
        m.receiveShadow = receive;
      }
    });

  // ── aircraft
  const lib = createMaterialLibrary();
  const shell = lib.shell as THREE.MeshPhysicalMaterial;
  shell.color.set('#eef0f1');
  shell.roughness = 0.26;
  shell.clearcoat = 1;
  shell.clearcoatRoughness = 0.06;
  const panel = lib.panel as THREE.MeshPhysicalMaterial;
  panel.roughness = 0.26;
  panel.clearcoat = 1;
  panel.clearcoatRoughness = 0.06;
  const cad = await loadPartModels();
  const model = buildDroneModel(lib, null, cad);
  for (const s of model.glows) s.visible = false;
  for (const m of model.ledMaterials) m.emissiveIntensity = 0;
  for (const m of model.recLamp) m.emissiveIntensity = 0;
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  const BASE_Y = CLEARANCE - box.min.y;
  model.root.position.set(0, BASE_Y, -(box.min.z + box.max.z) / 2);
  scene.add(model.root);
  shadowed(model.root);
  model.root.updateMatrixWorld(true);
  const abox = new THREE.Box3().setFromObject(model.root);
  console.log('aircraft bounds', abox.min.toArray(), abox.max.toArray());

  // ── ground-handling cradles under the booms
  const cradleMat = new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.55, metalness: 0.5 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.92 });
  const casterMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7 });
  const props = new THREE.Group();
  scene.add(props);
  const boomBottom = BASE_Y + BOOM_Y - BOOM.radius;
  const cradleZ = (BOOM.rotorFrontZ + BOOM.rotorRearZ) / 2 + model.root.position.z;
  const contactSpots: [number, number, number][] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(side * BOOM.x, 0, cradleZ);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.5), cradleMat);
    base.position.y = 0.075;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, boomBottom - 0.13, 0.05), cradleMat);
    post.position.y = 0.095 + (boomBottom - 0.13) / 2;
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.22), rubberMat);
    saddle.position.y = boomBottom - 0.0175;
    g.add(base, post, saddle);
    for (const b of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.016, (boomBottom - 0.13) * 0.85, 0.016), cradleMat);
      brace.position.set(0, 0.095 + (boomBottom - 0.13) * 0.4, b * 0.09);
      brace.rotation.x = b * 0.4;
      g.add(brace);
    }
    for (const cx of [-0.17, 0.17]) {
      for (const cz of [-0.21, 0.21]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.022, 20), casterMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(cx, 0.028, cz);
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), cradleMat);
        fork.position.set(cx, 0.055, cz);
        g.add(wheel, fork);
      }
    }
    props.add(g);
    contactSpots.push([side * BOOM.x, cradleZ, 0.6]);
  }

  // ── props: hard cases and a tool chest
  const caseMat = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.48, metalness: 0.0 });
  const latchMat = new THREE.MeshStandardMaterial({ color: '#9a9ea4', roughness: 0.3, metalness: 1 });
  const addCase = (x: number, y: number, z: number, w: number, h: number, d: number, ry: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.03), caseMat);
    body.position.y = h / 2;
    g.add(body);
    const rib = new THREE.Mesh(new RoundedBoxGeometry(w + 0.012, 0.03, d + 0.012, 2, 0.01), caseMat);
    rib.position.y = h * 0.7;
    g.add(rib);
    for (const lx of [-w * 0.3, w * 0.3]) {
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.012), latchMat);
      latch.position.set(lx, h * 0.7, d / 2 + 0.008);
      g.add(latch);
    }
    g.position.set(x, y, z);
    g.rotation.y = ry;
    props.add(g);
    if (y === 0) contactSpots.push([x, z, Math.max(w, d) * 1.4]);
  };
  addCase(3.35, 0, -1.6, 1.1, 0.42, 0.6, 0.35);
  addCase(3.4, 0.42, -1.62, 0.8, 0.3, 0.5, 0.42);
  addCase(-3.6, 0, 2.6, 0.7, 0.36, 0.48, -0.2);
  // tool chest against the back wall, right of the doors
  const chestMat = new THREE.MeshStandardMaterial({ color: '#5c1512', roughness: 0.35, metalness: 0.6 });
  const chest = new THREE.Group();
  const cbody = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.0, 0.6, 3, 0.015), chestMat);
  cbody.position.y = 0.6;
  chest.add(cbody);
  for (let k = 0; k < 6; k++) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.012, 0.02), latchMat);
    handle.position.set(0, 0.25 + k * 0.15, 0.31);
    chest.add(handle);
  }
  chest.position.set(4.2, 0, HZ0 + 0.55);
  props.add(chest);
  contactSpots.push([4.2, HZ0 + 0.55, 1.8]);
  shadowed(props);

  // ── floor: lit sealed concrete with saw-cut 4 m slabs
  const floorSize = 90;
  const REPEAT = floorSize / 4;
  const concreteImg = concreteCanvas();
  const concreteAlbedo = new THREE.CanvasTexture(concreteImg);
  concreteAlbedo.colorSpace = THREE.SRGBColorSpace;
  const concreteRough = new THREE.CanvasTexture(concreteImg);
  for (const tx of [concreteAlbedo, concreteRough]) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(REPEAT, REPEAT);
    tx.offset.set(0.5, 0.5);
    tx.anisotropy = 8;
  }
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#8d8a85',
    map: concreteAlbedo,
    roughness: 0.62,
    roughnessMap: concreteRough,
    metalness: 0,
    envMapIntensity: 0.08,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((HX0 + HX1) / 2, 0, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  // painted parking box
  const decalTex = new THREE.CanvasTexture(decalCanvas());
  decalTex.colorSpace = THREE.SRGBColorSpace;
  decalTex.anisotropy = 8;
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(DECAL_SIZE, DECAL_SIZE),
    new THREE.MeshStandardMaterial({ map: decalTex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 0.05 }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.0015;
  decal.receiveShadow = true;
  decal.renderOrder = 1;
  scene.add(decal);

  // ── exterior beyond the starboard doors: apron, tree line and sky
  const apronMat = new THREE.MeshStandardMaterial({ color: '#6f6c68', map: concreteAlbedo, roughness: 0.85, envMapIntensity: 0 });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 400), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(HX0 - 130.3, -0.005, 0);
  apron.receiveShadow = true;
  exterior.add(apron);
  {
    const pts: number[] = [];
    const idx: number[] = [];
    const R = 220;
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const a = Math.PI * (0.05 + 0.9 * (i / N));
      const z = Math.cos(a) * R * 1.6;
      const x = HX0 - Math.sin(a) * R;
      const hgt = 9 + 6 * hash(Math.floor(i / 3)) + 3 * hash(i * 1.7) + 7 * Math.sin(i * 0.05) ** 2;
      pts.push(x, -1, z, x, hgt, z);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setIndex(idx);
    const trees = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.56, 0.62), side: THREE.DoubleSide, fog: false }));
    exterior.add(trees);
  }
  const skyMat = skyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 64, 32), skyMat);
  sky.frustumCulled = false;
  exterior.add(sky);

  // ── hangar shell
  const ribTex = new THREE.CanvasTexture(ribCanvas());
  ribTex.wrapS = ribTex.wrapT = THREE.RepeatWrapping;
  ribTex.anisotropy = 8;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#9ea3a8', roughness: 0.62, metalness: 0.15, bumpMap: ribTex, bumpScale: 0.5, envMapIntensity: 0.6 });
  const wallTex = (len: number) => {
    const m = wallMat.clone();
    const t = ribTex.clone();
    t.repeat.set(len / 0.5, 1);
    t.needsUpdate = true;
    m.bumpMap = t;
    return m;
  };
  const T = 0.25;
  const addBox = (sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const H_ROOF = EAVE + 1.0;
  // starboard wall around the door opening (its boxes run along z; the rib texture runs along u)
  const dl = DOOR_C - DOOR_HALF;
  const dr = DOOR_C + DOOR_HALF;
  addBox(T, H_ROOF, dl - HZ0, HX0 - T / 2, H_ROOF / 2, (HZ0 + dl) / 2, wallTex(dl - HZ0));
  addBox(T, H_ROOF, HZ1 - dr, HX0 - T / 2, H_ROOF / 2, (dr + HZ1) / 2, wallTex(HZ1 - dr));
  addBox(T, H_ROOF - DOOR_H, dr - dl, HX0 - T / 2, (DOOR_H + H_ROOF) / 2, DOOR_C, wallTex(dr - dl));
  // port, back and front walls, roof
  addBox(T, H_ROOF, HZ1 - HZ0, HX1 + T / 2, H_ROOF / 2, (HZ0 + HZ1) / 2, wallTex(HZ1 - HZ0));
  addBox(HX1 - HX0, H_ROOF, T, (HX0 + HX1) / 2, H_ROOF / 2, HZ0 - T / 2, wallTex(HX1 - HX0));
  addBox(HX1 - HX0, H_ROOF, T, (HX0 + HX1) / 2, H_ROOF / 2, HZ1 + T / 2, wallTex(HX1 - HX0));
  const roofMat = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.85, envMapIntensity: 0.4 });
  addBox(HX1 - HX0 + 1, T, HZ1 - HZ0 + 1, (HX0 + HX1) / 2, H_ROOF + T / 2, (HZ0 + HZ1) / 2, roofMat);
  // portal frames: columns along both long walls (none across the door opening) and roof beams spanning them
  const steelMat = new THREE.MeshStandardMaterial({ color: '#d4d6d8', roughness: 0.5, metalness: 0.35, envMapIntensity: 0.6 });
  for (let z = HZ0 + 0.3; z <= HZ1; z += 7) {
    addBox(0.35, EAVE, 0.45, HX1 - 0.25, EAVE / 2, z, steelMat);
    if (z < dl - 0.3 || z > dr + 0.3) addBox(0.35, EAVE, 0.45, HX0 + 0.25, EAVE / 2, z, steelMat);
    addBox(HX1 - HX0, 0.6, 0.3, (HX0 + HX1) / 2, EAVE + 0.3, z, steelMat);
  }
  // purlins
  for (let x = HX0 + 2; x < HX1; x += 3) addBox(0.12, 0.2, HZ1 - HZ0, x, H_ROOF - 0.1, (HZ0 + HZ1) / 2, steelMat);
  // door header beam / guide rail
  addBox(0.3, 0.45, DOOR_HALF * 4 + 0.6, HX0 + 0.35, DOOR_H + 0.25, DOOR_C, steelMat);

  // ── sliding door leaves (inside the wall, sliding along it); they overlap the jambs a little
  const leafMat = new THREE.MeshStandardMaterial({ color: '#a8acb0', roughness: 0.5, metalness: 0.3, bumpMap: ribTex, bumpScale: 0.5, envMapIntensity: 0.6 });
  const leafTex = ribTex.clone();
  leafTex.repeat.set((DOOR_HALF + 0.3) / 0.5, 1);
  leafTex.needsUpdate = true;
  leafMat.bumpMap = leafTex;
  const leaves: { mesh: THREE.Mesh; closedZ: number; dir: number }[] = [];
  for (const dir of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.14, DOOR_H + 0.15, DOOR_HALF + 0.3 - 0.006), leafMat);
    const closedZ = DOOR_C + dir * ((DOOR_HALF + 0.3) / 2 + 0.003);
    leaf.position.set(HX0 + 0.12, (DOOR_H + 0.15) / 2 + 0.03, closedZ);
    leaf.castShadow = leaf.receiveShadow = true;
    for (const ry of [-0.6, 1.4]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, DOOR_HALF + 0.2), steelMat);
      rail.position.set(0.09, ry, 0);
      rail.castShadow = true;
      leaf.add(rail);
    }
    scene.add(leaf);
    leaves.push({ mesh: leaf, closedZ, dir });
  }

  // ── exit sign on the back wall
  const exitCanvas = document.createElement('canvas');
  exitCanvas.width = 256;
  exitCanvas.height = 96;
  {
    const g = exitCanvas.getContext('2d')!;
    g.fillStyle = '#0a8f3c';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#f2fff4';
    g.font = 'bold 54px Inter, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('EXIT', 128, 50);
  }
  const exitTex = new THREE.CanvasTexture(exitCanvas);
  exitTex.colorSpace = THREE.SRGBColorSpace;
  const exitMat = new THREE.MeshBasicMaterial({ map: exitTex, color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: true });
  const EXIT_X = -3.2;
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), exitMat);
  exitSign.position.set(EXIT_X, 2.8, HZ0 + 0.035);
  scene.add(exitSign);
  addBox(0.54, 0.23, 0.06, EXIT_X, 2.8, HZ0 + 0.0, new THREE.MeshStandardMaterial({ color: '#ddd', roughness: 0.5 }));
  const exitGlow = new THREE.RectAreaLight('#2bd46a', 1.5, 0.5, 0.19);
  exitGlow.position.set(EXIT_X, 2.8, HZ0 + 0.05);
  exitGlow.lookAt(EXIT_X, 2.4, 0);
  scene.add(exitGlow);

  // ── high-bay LED fixtures, in rows across the roof
  const rowsZ = [-18, -11, -4, 3];
  const bayMats: THREE.MeshBasicMaterial[][] = rowsZ.map(() => []);
  const bayLights: THREE.RectAreaLight[][] = rowsZ.map(() => []);
  const bayGeo = new THREE.CylinderGeometry(0.28, 0.2, 0.16, 40);
  const bayHousing = new THREE.MeshStandardMaterial({ color: '#2a2c2f', roughness: 0.45, metalness: 0.8 });
  const BAY_Y = EAVE - 0.35;
  rowsZ.forEach((z, r) => {
    for (const x of [-9, -3, 3, 9]) {
      const housing = new THREE.Mesh(bayGeo, bayHousing);
      housing.position.set(x, BAY_Y + 0.08, z);
      const mat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false });
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 40), mat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, BAY_Y - 0.002, z);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H_ROOF - BAY_Y - 0.16, 6), bayHousing);
      cable.position.set(x, (H_ROOF + BAY_Y + 0.16) / 2, z);
      scene.add(housing, lens, cable);
      bayMats[r].push(mat);
      const light = new THREE.RectAreaLight('#fff3e4', 0, 0.42, 0.42);
      light.position.set(x, BAY_Y - 0.01, z);
      light.lookAt(x, 0, z);
      scene.add(light);
      bayLights[r].push(light);
    }
  });
  const N_BAYS = rowsZ.length * 4;

  // ── daylight: sun through the doors, sky through the opening, bounce off the sunlit floor
  const sun = new THREE.DirectionalLight('#ffe7cc', 0);
  const SUN_TARGET = new THREE.Vector3(0, 0, -6);
  sun.position.copy(SUN_TARGET).addScaledVector(SUN, 45);
  sun.target.position.copy(SUN_TARGET);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 5, far: 95 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // the same view from the sun, as packed depth, for the volumetric light and the dust
  const sunCam = new THREE.OrthographicCamera(-26, 26, 26, -26, 5, 95);
  sunCam.position.copy(sun.position);
  sunCam.lookAt(SUN_TARGET);
  sunCam.updateMatrixWorld();
  const sunRT = new THREE.WebGLRenderTarget(2048, 2048, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const sunDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const sunVP = new THREE.Matrix4().multiplyMatrices(sunCam.projectionMatrix, sunCam.matrixWorldInverse);
  const doorSky = new THREE.RectAreaLight('#cfe0ff', 0, 1, DOOR_H);
  doorSky.position.set(HX0 + 0.3, DOOR_H / 2, DOOR_C);
  doorSky.lookAt(10, DOOR_H / 2, DOOR_C);
  scene.add(doorSky);
  const bounce = new THREE.RectAreaLight('#ffd9b0', 0, 14, 14);
  bounce.position.set(-5, 0.05, -5);
  bounce.lookAt(-5, 10, -5);
  scene.add(bounce);
  const ambient = new THREE.HemisphereLight('#9fb4cf', '#5a5148', 0);
  scene.add(ambient);

  // ── soft overhead shadow of the aircraft and contact darkening (for the roof lights, which cast none)
  const overhead = (() => {
    const S = 256;
    const span = 8;
    const rtTop = new THREE.WebGLRenderTarget(S, S);
    const cam = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.1, 20);
    cam.position.set(0, 10, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    const tmp = new THREE.Scene();
    tmp.overrideMaterial = new THREE.MeshBasicMaterial({ color: '#fff' });
    const parent = model.root.parent!;
    tmp.add(model.root);
    renderer.setRenderTarget(rtTop);
    renderer.setClearColor('#000', 1);
    renderer.clear();
    renderer.render(tmp, cam);
    const buf = new Uint8Array(S * S * 4);
    renderer.readRenderTargetPixels(rtTop, 0, 0, S, S, buf);
    renderer.setRenderTarget(null);
    parent.add(model.root);
    const raw = document.createElement('canvas');
    raw.width = raw.height = S;
    const rg = raw.getContext('2d')!;
    const img = rg.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const src = ((S - 1 - y) * S + x) * 4;
        const dst = (y * S + x) * 4;
        img.data[dst] = img.data[dst + 1] = img.data[dst + 2] = buf[src];
        img.data[dst + 3] = 255;
      }
    }
    rg.putImageData(img, 0, 0);
    const blurred = document.createElement('canvas');
    blurred.width = blurred.height = S;
    const bg = blurred.getContext('2d')!;
    bg.fillStyle = '#000';
    bg.fillRect(0, 0, S, S);
    bg.filter = 'blur(9px)';
    bg.drawImage(raw, 0, 0);
    const tex = new THREE.CanvasTexture(blurred);
    const mat = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: tex, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, span), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.002;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mat;
  })();
  const contactTex = radialTexture();
  const contactMats: THREE.MeshBasicMaterial[] = [];
  for (const [x, z, s] of contactSpots) {
    const mat = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: contactTex, transparent: true, opacity: 0, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.0025, z);
    m.renderOrder = 2;
    scene.add(m);
    contactMats.push(mat);
  }

  // ── floor reflection: the whole world rendered again, flipped about the floor (y → −y) and clipped
  // to below it, from the same camera; the floor then reads that image at its own screen position.
  // (three's Reflector uses an oblique near plane, which clipped the roof away at these angles.)
  const reflRT = new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType });
  const reflTex = reflRT.texture;
  const mirrorMat = new THREE.ShaderMaterial({
    ...FloorReflectShader,
    uniforms: THREE.UniformsUtils.clone(FloorReflectShader.uniforms),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  mirrorMat.uniforms.tDiffuse.value = reflTex;
  mirrorMat.uniforms.color.value = new THREE.Color('#ffffff');
  mirrorMat.uniforms.tConcrete.value = concreteRough;
  mirrorMat.uniforms.uRepeat.value = REPEAT;
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), mirrorMat);
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set((HX0 + HX1) / 2, 0.001, 0);
  mirror.renderOrder = 3;
  // the floor and the decals lying on it would only z-fight in the reflection: keep them out
  const flat: THREE.Object3D[] = [floor, decal];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && Math.abs(m.position.y) < 0.004 && m.geometry.type === 'PlaneGeometry') flat.push(m);
  });
  const rectLights: THREE.Object3D[] = [];
  scene.traverse((o) => ((o as THREE.RectAreaLight).isRectAreaLight ? rectLights.push(o) : null));
  const world = new THREE.Group();
  for (const c of [...scene.children]) world.add(c);
  scene.add(world, mirror);
  const belowFloor = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
  const renderReflection = () => {
    world.scale.y = -1;
    world.updateMatrixWorld(true);
    mirror.visible = false;
    dust.visible = false;
    for (const o of flat) o.visible = false;
    // area lights don't survive the flipped handedness, so the reflection goes without them
    for (const o of rectLights) o.visible = false;
    renderer.clippingPlanes = belowFloor;
    renderer.setRenderTarget(reflRT);
    renderer.setClearColor('#000', 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clippingPlanes = [];
    renderer.setRenderTarget(null);
    for (const o of flat) o.visible = true;
    for (const o of rectLights) o.visible = true;
    mirror.visible = true;
    dust.visible = true;
    world.scale.y = 1;
    world.updateMatrixWorld(true);
  };

  // ── dust in the air
  const DUST = 3500;
  const dpos = new Float32Array(DUST * 3);
  const dseed = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dpos[i * 3] = HX0 + 2 + hash(i * 3.1) * (HX1 - HX0 - 4);
    dpos[i * 3 + 1] = 0.05 + hash(i * 5.7 + 1) ** 1.3 * 6.5;
    dpos[i * 3 + 2] = HZ0 + hash(i * 7.3 + 2) * (HZ1 - HZ0 - 4);
    dseed[i * 3] = hash(i * 11.1 + 3);
    dseed[i * 3 + 1] = hash(i * 13.7 + 4);
    dseed[i * 3 + 2] = hash(i * 17.9 + 5);
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 3));
  const dustMat = dustMaterial();
  const dust = new THREE.Points(dgeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 5;
  scene.add(dust);

  // ── camera and post
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 1200);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // volumetric light: a half-resolution depth pass, then the ray march
  const depthRT = new THREE.WebGLRenderTarget(W / 2, H / 2);
  depthRT.depthTexture = new THREE.DepthTexture(W / 2, H / 2);
  depthRT.depthTexture.type = THREE.UnsignedIntType;
  const volRT = new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType });
  const volMat = new THREE.ShaderMaterial({ ...VolumeShader, depthTest: false, depthWrite: false });
  volMat.uniforms.tDepth.value = depthRT.depthTexture;
  volMat.uniforms.tSun.value = sunRT.texture;
  volMat.uniforms.uSunVP.value.copy(sunVP);
  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), volMat);
  fsQuad.frustumCulled = false;
  fsScene.add(fsQuad);
  const composite = new ShaderPass(CompositeShader);
  composite.uniforms.tVol.value = volRT.texture;
  composer.addPass(composite);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.35, 2.2);
  (bloom as unknown as { compositeMaterial: THREE.ShaderMaterial }).compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.6, 0.35, 0.15, 0.05];
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  dustMat.uniforms.tSun.value = sunRT.texture;
  dustMat.uniforms.uSunVP.value.copy(sunVP);

  const depthOnly = new THREE.MeshBasicMaterial({ color: '#000' });
  const renderVolume = () => {
    mirror.visible = false;
    dust.visible = false;
    const bg = scene.background;
    scene.background = null;
    // depth from the sun (the doors move, so every frame)
    exterior.visible = false;
    scene.overrideMaterial = sunDepthMat;
    renderer.setRenderTarget(sunRT);
    renderer.setClearColor('#ffffff', 1);
    renderer.clear();
    renderer.render(scene, sunCam);
    exterior.visible = true;
    // depth from the camera
    scene.overrideMaterial = depthOnly;
    renderer.setRenderTarget(depthRT);
    renderer.setClearColor('#000', 1);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    mirror.visible = true;
    dust.visible = true;
    volMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    volMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    volMat.uniforms.uCamPos.value.copy(camera.position);
    renderer.setRenderTarget(volRT);
    renderer.render(fsScene, fsCam);
    renderer.setRenderTarget(null);
  };

  // ── end title
  const hud = new THREE.Scene();
  const hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  await document.fonts.load('300 80px Inter').catch(() => undefined);
  await document.fonts.load('400 24px Inter').catch(() => undefined);
  const logo = new Image();
  logo.src = '/brand/kraus-hamdani-aerospace.png';
  await logo.decode().catch(() => undefined);
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = W;
  titleCanvas.height = H;
  {
    const g = titleCanvas.getContext('2d')!;
    const s = H / 1080;
    const x0 = 120 * s;
    const yb = H - 150 * s;
    g.fillStyle = '#fff';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = `300 ${Math.round(74 * s)}px Inter`;
    (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(16 * s)}px`;
    g.fillText('K1000ULE', x0, yb);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(x0, yb + 26 * s, 64 * s, 2 * s);
    g.font = `400 ${Math.round(21 * s)}px Inter`;
    (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(7 * s)}px`;
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.fillText('ULTRA LONG ENDURANCE  ·  SOLAR eVTOL', x0, yb + 70 * s);
    if (logo.naturalWidth) {
      const lw = 190 * s;
      const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
      g.globalAlpha = 0.8;
      g.drawImage(logo, W - 120 * s - lw, yb + 52 * s - lh, lw, lh);
    }
  }
  const titleTex = new THREE.CanvasTexture(titleCanvas);
  titleTex.colorSpace = THREE.SRGBColorSpace;
  const titleMat = new THREE.MeshBasicMaterial({ map: titleTex, transparent: true, opacity: 0, toneMapped: false, depthTest: false });
  hud.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), titleMat));

  // ── image-based lighting: the hangar seen from the aircraft (without it), rebuilt as light changes
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT: THREE.WebGLRenderTarget | null = null;
  let envKey = '';
  const envCenter = new THREE.Vector3(0, BASE_Y + 0.5, 0);
  const updateEnv = (key: string) => {
    if (key === envKey) return;
    envKey = key;
    model.root.visible = false;
    mirror.visible = false;
    dust.visible = false;
    const prev = envRT;
    scene.environment = null;
    envRT = pmrem.fromScene(scene, 0, 0.1, 800, { size: 256, position: envCenter });
    prev?.dispose();
    model.root.visible = true;
    mirror.visible = true;
    dust.visible = true;
    scene.environment = envRT.texture;
  };

  const tmp = new THREE.Vector3();
  window.__duration = DURATION;
  window.__render = (t: number) => {
    // doors
    const travel = doorOpen(t);
    for (const l of leaves) l.mesh.position.z = l.closedZ + l.dir * travel;
    const open = travel + 0.006; // half-width of the gap between the leaves
    const openFrac = clamp01(open / DOOR_HALF);
    dustMat.uniforms.uOpen.value = open;
    dustMat.uniforms.uTime.value = t;
    // daylight
    sun.intensity = 9.0;
    doorSky.width = Math.max(0.02, open * 2);
    doorSky.intensity = 2.4;
    bounce.intensity = 0.55 * openFrac;
    // high bays
    let bayOn = 0;
    rowsZ.forEach((_, r) => {
      bayMats[r].forEach((m, i) => {
        const k = flickerOn(t, ROW_ON[r] + hash(r * 10 + i) * 0.06, r * 13 + i * 3);
        m.color.setScalar(9 * k);
        bayLights[r][i].intensity = 26 * k;
        bayOn += k;
      });
    });
    const bays = bayOn / N_BAYS;
    ambient.intensity = 0.03 + 0.06 * openFrac + 0.12 * bays;
    exitMat.color.setScalar(2.2 * (1 - 0.4 * bays));
    overhead.opacity = 0.6 * bays;
    for (const m of contactMats) m.opacity = 0.35 * bays + 0.25 * openFrac;
    updateEnv(`${Math.round(open * 4)}|${Math.round(bays * N_BAYS)}`);
    dustMat.uniforms.uAmb.value = 0;

    // camera: one continuous move, eased, with a hint of dolly float
    const u = smooth(-2.5, DURATION + 1.5, t);
    camera.position.lerpVectors(CAM_FROM, CAM_TO, u);
    camera.position.x += 0.004 * Math.sin(t * 1.3) + 0.002 * Math.sin(t * 2.9 + 1);
    camera.position.y += 0.003 * Math.sin(t * 1.1 + 2) + 0.0015 * Math.sin(t * 3.3);
    camera.lookAt(tmp.lerpVectors(LOOK_FROM, LOOK_TO, u));
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);

    // volumetric light in the haze
    renderVolume();
    renderReflection();
    composite.uniforms.uSunScatter.value.set(1.0, 0.9, 0.78).multiplyScalar(sun.intensity * 0.009);
    composite.uniforms.uAmbHaze.value.set(0.55, 0.6, 0.66).multiplyScalar(0.004 + 0.012 * openFrac + 0.015 * bays);

    grade.uniforms.uTime.value = t;
    titleMat.opacity = smooth(TITLE_IN, TITLE_IN + 0.9, t);
    renderer.autoClear = true;
    composer.render();
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
