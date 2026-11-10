/**
 * Hangar reveal: a short cinematic of the K1000ULE in a dark hangar while rows of
 * ceiling light strips switch on from front to back, then floor-standing LED panels.
 *
 * Rendered offline, one deterministic frame at a time: tools/render-hangar.mjs opens
 * this page with Playwright, calls window.__render(t) for every frame and encodes
 * the PNGs with ffmpeg. Open /tools/hangar.html?t=4 in the dev server to preview a
 * single moment.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { buildDroneModel } from '../src/engine/DroneModel';
import { createMaterialLibrary } from '../src/engine/materials';
import { loadPartModels } from '../src/engine/PartModels';

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
const SHOT1 = 6; // head-on reveal
const SHOT2 = 2.6; // elevated three-quarter view from the front port side
const DURATION = SHOT1 + SHOT2;

// ── hangar layout (metres; aircraft nose toward +Z, camera in front of it)
const N_STRIPS = 22;
const STRIP_Y = 3.25;
const STRIP_HALF = 2.5;
const STRIP_Z0 = 0.9; // nearest strip
const STRIP_DZ = 0.55;
const STAND_TOP = 1.05; // fuselage belly height on the display stand
const CAM_START = new THREE.Vector3(0, 0.82, 7.3);
const CAM_END = new THREE.Vector3(0, 0.8, 6.8);
const CAM_LOOK = new THREE.Vector3(0, 1.6, 0);
// shot 2: orbit slowly around the aircraft from above and to the side
const ORBIT_LOOK = [new THREE.Vector3(-0.6, 0.75, -0.1), new THREE.Vector3(0.15, 0.72, 0.15)];
const ORBIT_HEIGHT = [2.95, 2.85];
const ORBIT_RADIUS = [6.4, 6.25];
const ORBIT_AZIMUTH = [(-58 * Math.PI) / 180, (-46 * Math.PI) / 180]; // 0 = straight ahead of the nose, negative = port side

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** A fluorescent-style switch-on: a couple of flickers, then full and steady. */
function flickerOn(t: number, t0: number, seed: number) {
  const d = t - t0;
  if (d < 0) return 0;
  if (d > 0.2) return 1;
  const pattern = [1, 0.15, 0.8, 0.05, 1, 0.6, 1];
  const i = Math.min(pattern.length - 1, Math.floor((d / 0.2) * pattern.length));
  return pattern[i] * (0.75 + 0.25 * hash(seed + i));
}

/** Tileable polished-concrete albedo: soft mottling, fine speckle and saw-cut joints at the tile edges. */
function concreteCanvas() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const lat = (x: number, y: number, p: number, seed: number) => hash(((x % p) + p) % p * 157 + (((y % p) + p) % p) * 311 + seed * 7919);
  const noise = (x: number, y: number, p: number, seed: number) => {
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
    const c2 = lat(ix, iy + 1, p, seed);
    const d = lat(ix + 1, iy + 1, p, seed);
    return a + (b - a) * tx + (c2 - a) * ty + (a - b - c2 + d) * tx * ty;
  };
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
      let v = 0.72 + (n - 0.5) * 0.5 + (hash(x * 1.31 + y * 977.7) - 0.5) * 0.06;
      // saw-cut joints along two tile edges (they wrap, so every tile gets a full border)
      const jx = Math.min(x, S - 1 - x);
      const jy = Math.min(y, S - 1 - y);
      if (jx < 2 || jy < 2) v *= 0.45;
      const k = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function radialShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Polished-concrete reflection, added over the lit floor: blurred and smeared along the view
 *  direction (vertical on screen), modulated by the concrete and a Fresnel term. */
const FloorReflectShader = {
  name: 'FloorReflect',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    tConcrete: { value: null as THREE.Texture | null },
    uRepeat: { value: 15 },
    uStrength: { value: 0.75 },
    uTexel: { value: new THREE.Vector2(2 / W, 2 / H) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec2 vFloorUv; varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vFloorUv = uv;
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform sampler2D tConcrete;
    uniform float uRepeat; uniform float uStrength; uniform vec2 uTexel;
    varying vec4 vUv; varying vec2 vFloorUv; varying vec3 vWorld;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      float conc = texture2D(tConcrete, vFloorUv * uRepeat + 0.5).r;
      float dist = length(cameraPosition.xz - vWorld.xz);
      // farther floor = blurrier reflection
      float spread = mix(7.0, 12.0, clamp((dist - 3.0) / 10.0, 0.0, 1.0));
      float jit = (h(gl_FragCoord.xy) - 0.5) * 0.25;
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int i = -9; i <= 9; i++) {
        for (int j = -3; j <= 3; j++) {
          float fi = float(i) + jit; float fj = float(j) + jit * 0.7;
          float w = exp(-fi * fi / 30.0 - fj * fj / 5.0);
          acc += texture2D(tDiffuse, uv + vec2(fj * uTexel.x * 3.5, fi * uTexel.y * spread), 2.5).rgb * w;
          wsum += w;
        }
      }
      vec3 refl = acc / wsum;
      vec3 V = normalize(cameraPosition - vWorld);
      float F = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
      // worn, less polished patches reflect less
      float k = uStrength * F * mix(0.55, 1.0, smoothstep(0.3, 0.85, conc));
      gl_FragColor = vec4(refl * color * k, 1.0);
    }`,
};

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
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = vec3(l) * vec3(1.0, 0.995, 0.985);
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      col *= mix(1.0, smoothstep(1.25, 0.35, length(q)), 0.85);
      col += (h(vUv * 1000.0) - 0.5) * 0.018;
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000');

  // ── aircraft
  const lib = createMaterialLibrary();
  // a glossier finish than the viewer so the light strips read as reflections
  const shell = lib.shell as THREE.MeshPhysicalMaterial;
  shell.color.set('#eceef0');
  shell.roughness = 0.22;
  shell.clearcoat = 1;
  shell.clearcoatRoughness = 0.04;
  const panel = lib.panel as THREE.MeshPhysicalMaterial;
  panel.roughness = 0.22;
  panel.clearcoat = 1;
  panel.clearcoatRoughness = 0.04;
  const cad = await loadPartModels();
  const model = buildDroneModel(lib, null, cad);
  for (const s of model.glows) s.visible = false;
  for (const m of model.ledMaterials) m.emissiveIntensity = 0;
  for (const m of model.recLamp) m.emissiveIntensity = 0;
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  const lift = STAND_TOP - box.min.y;
  model.root.position.y += lift;
  model.root.position.z -= (box.min.z + box.max.z) / 2;
  scene.add(model.root);
  model.root.updateMatrixWorld(true);
  const abox = new THREE.Box3().setFromObject(model.root);
  console.log('aircraft bounds', abox.min.toArray(), abox.max.toArray());

  // ── display stand: one slim post with a saddle and a round foot
  // satin black powder coat
  const standMat = new THREE.MeshStandardMaterial({ color: '#08090a', roughness: 0.62, metalness: 0.2 });
  const stand = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, STAND_TOP - 0.02, 32), standMat);
  post.position.y = (STAND_TOP - 0.02) / 2;
  const footMat = standMat.clone();
  footMat.userData.envIntensity = 0.35;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 64), footMat);
  foot.position.y = 0.015;
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.32), standMat);
  saddle.position.y = STAND_TOP - 0.012;
  stand.add(post, foot, saddle);
  // under the wing / fuselage centre of gravity
  stand.position.set(0, 0, 0.25);
  scene.add(stand);

  // ── floor: lit polished concrete, a soft shadow pass, then a blurred reflection added on top
  const floorSize = 60;
  const REPEAT = floorSize / 4; // 4 m concrete slabs
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
    color: '#3a3a3a',
    map: concreteAlbedo,
    roughness: 0.95,
    roughnessMap: concreteRough,
    metalness: 0,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // soft overhead shadow of the aircraft and stand (the ceiling is one big soft light)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const shadowSun = new THREE.DirectionalLight('#ffffff', 0.0001);
  shadowSun.position.set(0, 10, -0.6);
  shadowSun.castShadow = true;
  shadowSun.shadow.mapSize.set(512, 512);
  Object.assign(shadowSun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 6, far: 12 });
  shadowSun.shadow.radius = 22;
  shadowSun.shadow.blurSamples = 25;
  scene.add(shadowSun, shadowSun.target);
  for (const root of [model.root, stand]) root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0, transparent: true, depthWrite: false });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.0005;
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = 1;
  scene.add(shadowPlane);
  // contact darkening where the stand's foot meets the floor
  const contactMat = new THREE.MeshBasicMaterial({ map: radialShadowTexture(), transparent: true, depthWrite: false, opacity: 0 });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, 0.0007, 0.25);
  contact.renderOrder = 1;
  scene.add(contact);

  const mirror = new Reflector(new THREE.PlaneGeometry(floorSize, floorSize), {
    textureWidth: W / 2,
    textureHeight: H / 2,
    color: new THREE.Color('#ffffff'),
    clipBias: 0.003,
    shader: FloorReflectShader,
  });
  // mipmapped, so every blur tap reads an already-smoothed texel (no banding between taps)
  const reflTex = mirror.getRenderTarget().texture;
  reflTex.generateMipmaps = true;
  reflTex.minFilter = THREE.LinearMipmapLinearFilter;
  const mirrorMat = mirror.material as THREE.ShaderMaterial;
  mirrorMat.uniforms.tConcrete.value = concreteRough;
  mirrorMat.transparent = true;
  mirrorMat.blending = THREE.AdditiveBlending;
  mirrorMat.depthWrite = false;
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = 0.001;
  mirror.renderOrder = 2;
  scene.add(mirror);

  // ── hangar shell
  const wallMat = new THREE.MeshStandardMaterial({ color: '#030304', roughness: 0.95 });
  const sideL = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), wallMat);
  sideL.rotation.y = Math.PI / 2;
  sideL.position.set(-7.5, 4.5, -4);
  const sideR = sideL.clone();
  sideR.rotation.y = -Math.PI / 2;
  sideR.position.x = 7.5;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), wallMat);
  back.position.set(0, 4.5, -20);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 40), new THREE.MeshStandardMaterial({ color: '#020202', roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, STRIP_Y + 0.25, -4);
  scene.add(sideL, sideR, back, ceil);

  // ── ceiling light strips (emissive tube + downward area light each)
  const strips: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; light: THREE.RectAreaLight; t0: number }[] = [];
  const stripGeo = new THREE.BoxGeometry(STRIP_HALF * 2, 0.05, 0.09);
  for (let i = 0; i < N_STRIPS; i++) {
    const z = STRIP_Z0 - i * STRIP_DZ;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), toneMapped: false });
    const mesh = new THREE.Mesh(stripGeo, mat);
    mesh.position.set(0, STRIP_Y, z);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(STRIP_HALF * 2 + 0.06, 0.08, 0.14), new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.6 }));
    housing.position.set(0, STRIP_Y + 0.06, z);
    const light = new THREE.RectAreaLight('#fff7ee', 0, STRIP_HALF * 2, 0.1);
    light.position.set(0, STRIP_Y - 0.03, z);
    light.lookAt(0, 0, z);
    scene.add(mesh, housing, light);
    // switch on front to back, with a little irregularity
    const t0 = 0.55 + i * 0.058 + (hash(i) - 0.5) * 0.03;
    strips.push({ mesh, mat, light, t0 });
  }

  // ── faint fixtures along the side walls
  const fixtureMats: THREE.MeshBasicMaterial[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      for (const y of [2.6, 3.6]) {
        const mat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), mat);
        m.position.set(side * 7.45, y, 3 - k * 2.1);
        m.rotation.y = -side * (Math.PI / 2);
        scene.add(m);
        fixtureMats.push(mat);
      }
    }
  }

  // ── floor LED panels: three bars each, two pairs either side of the aircraft
  const panels: { mats: THREE.MeshBasicMaterial[]; light: THREE.RectAreaLight; t0: number }[] = [];
  const panelSpots: [number, number, number][] = [
    [-4.0, 0, -1.8],
    [4.0, 0, -1.8],
    [-2.5, 0, -4.4],
    [2.5, 0, -4.4],
  ];
  const standGrey = new THREE.MeshStandardMaterial({ color: '#3b3d41', roughness: 0.42, metalness: 0.7 });
  const housingMat = new THREE.MeshStandardMaterial({ color: '#0e0f11', roughness: 0.55, metalness: 0.2 });
  panelSpots.forEach(([x, , z], idx) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = -x * 0.04; // toe in slightly toward the aircraft
    // tripod light stand
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.62, 12), standGrey);
    pole.position.y = 0.31 + 0.05;
    g.add(pole);
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2 + 0.5;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8), standGrey);
      leg.position.set(Math.cos(a) * 0.13, 0.13, Math.sin(a) * 0.13);
      leg.rotation.set(Math.sin(a) * -0.85, 0, Math.cos(a) * 0.85);
      g.add(leg);
    }
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.02, 0.02), standGrey);
    yoke.position.y = 0.68;
    g.add(yoke);
    // LED panel housing with three diffused bars
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.07), housingMat);
    housing.position.y = 0.86;
    g.add(housing);
    const mats: THREE.MeshBasicMaterial[] = [];
    for (let r = 0; r < 3; r++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false });
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.06), mat);
      bar.position.set(0, 0.95 - r * 0.09, 0.036);
      g.add(bar);
      mats.push(mat);
    }
    const light = new THREE.RectAreaLight('#ffffff', 0, 0.44, 0.26);
    light.position.set(x, 0.86, z + 0.05);
    light.lookAt(x * 0.3, 0.5, z + 6);
    scene.add(g, light);
    panels.push({ mats, light, t0: 3.0 + (idx < 2 ? 0.15 : 0) + hash(idx + 40) * 0.05 });
  });

  // ── camera + post
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 80);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.0, 1.6);
  // keep only the tight inner glow: drop the wide, low-resolution mip levels that read as haze
  (bloom as unknown as { compositeMaterial: THREE.ShaderMaterial }).compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.35, 0.06, 0.0, 0.0];
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // ── reflections: an environment map of the hangar (without the aircraft), rebuilt as lights change
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflective = new Set<THREE.MeshStandardMaterial>([standGrey, housingMat]);
  for (const root of [model.root, stand]) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) reflective.add(m as THREE.MeshStandardMaterial);
      }
    });
  }
  let envRT: THREE.WebGLRenderTarget | null = null;
  let envKey = '';
  const envCenter = new THREE.Vector3(0, STAND_TOP + 0.4, 0);
  const updateEnv = (key: string) => {
    if (key === envKey) return;
    envKey = key;
    model.root.visible = false;
    stand.visible = false;
    mirror.visible = false;
    const prev = envRT;
    envRT = pmrem.fromScene(scene, 0, 0.1, 60, { size: 256, position: envCenter });
    prev?.dispose();
    model.root.visible = true;
    stand.visible = true;
    mirror.visible = true;
    // only the aircraft and stand reflect the hangar; the floor and walls stay dark
    for (const m of reflective) {
      m.envMap = envRT.texture;
      m.envMapIntensity = m.userData.envIntensity ?? 1.6;
    }
  };

  const STRIP_RADIANCE = 3.2;
  window.__duration = DURATION;
  window.__render = (t: number) => {
    // ceiling strips; the first one glows faintly from the start
    let litSum = 0;
    strips.forEach((s, i) => {
      let k = flickerOn(t, s.t0, i * 7.3);
      if (i === 0) k = Math.max(k, 0.12);
      if (i === 1) k = Math.max(k, 0.05);
      s.mat.color.setScalar(STRIP_RADIANCE * k);
      s.light.intensity = 2.2 * k;
      litSum += Math.round(k * 10);
    });
    const wall = smooth(1.6, 2.8, t);
    for (const m of fixtureMats) m.color.setScalar(0.3 * wall);
    wallMat.color.setScalar(0.012 + 0.01 * wall);
    let panelSum = 0;
    panels.forEach((p, i) => {
      const k = flickerOn(t, p.t0, 90 + i * 5);
      for (const m of p.mats) m.color.setScalar(2.4 * k);
      p.light.intensity = 3 * k;
      panelSum += Math.round(k * 10);
    });
    // overhead shadow and contact darkening follow the ceiling brightness
    const ceiling = litSum / (N_STRIPS * 10);
    shadowMat.opacity = 0.55 * ceiling;
    contactMat.opacity = 0.7 * Math.max(ceiling, 0.15 * (panelSum / 40));
    updateEnv(`${litSum}|${panelSum}|${Math.round(wall * 10)}`);

    // slow push-in
    if (t < SHOT1) {
      // slow push-in
      const u = smooth(0, SHOT1, t);
      camera.position.lerpVectors(CAM_START, CAM_END, u);
      camera.lookAt(CAM_LOOK);
    } else {
      const u = (t - SHOT1) / SHOT2; // linear drift, so the cut lands on a moving camera
      const lerp = (r: number[]) => r[0] + (r[1] - r[0]) * u;
      const az = lerp(ORBIT_AZIMUTH);
      const rad = lerp(ORBIT_RADIUS);
      // port side is +x, the nose points to +z
      camera.position.set(Math.sin(-az) * rad, lerp(ORBIT_HEIGHT), Math.cos(az) * rad);
      camera.lookAt(new THREE.Vector3().lerpVectors(ORBIT_LOOK[0], ORBIT_LOOK[1], u));
    }
    grade.uniforms.uTime.value = t;
    composer.render();
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
