/**
 * Hangar reveal: a short cinematic of the K1000ULE in a dark hangar while rows of
 * ceiling light strips switch on from front to back, then floor lights and glints.
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
const DURATION = 6;

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

function starTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const m = s / 2;
  const core = g.createRadialGradient(m, m, 0, m, m, m * 0.35);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.2, 'rgba(255,255,255,0.45)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'lighter';
  const ray = (angle: number, len: number, width: number, alpha: number) => {
    g.save();
    g.translate(m, m);
    g.rotate(angle);
    const gr = g.createLinearGradient(-len, 0, len, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-len, 0);
    g.lineTo(0, -width);
    g.lineTo(len, 0);
    g.lineTo(0, width);
    g.closePath();
    g.fill();
    g.restore();
  };
  ray(0, m, 2.2, 1);
  ray(Math.PI / 2, m * 0.85, 2, 0.9);
  ray(Math.PI / 4, m * 0.45, 1.2, 0.45);
  ray(-Math.PI / 4, m * 0.45, 1.2, 0.45);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  const standMat = new THREE.MeshPhysicalMaterial({ color: '#0d0e10', roughness: 0.25, metalness: 0.8, clearcoat: 1, clearcoatRoughness: 0.1 });
  const stand = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, STAND_TOP - 0.02, 32), standMat);
  post.position.y = (STAND_TOP - 0.02) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.025, 64), standMat);
  foot.position.y = 0.0125;
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.32), standMat);
  saddle.position.y = STAND_TOP - 0.012;
  stand.add(post, foot, saddle);
  // under the wing / fuselage centre of gravity
  stand.position.set(0, 0, 0.25);
  scene.add(stand);

  // ── floor: dark polished concrete over a mirror
  const floorSize = 60;
  const mirror = new Reflector(new THREE.PlaneGeometry(floorSize, floorSize), {
    textureWidth: W / 2,
    textureHeight: H / 2,
    color: new THREE.Color('#5a5a5a'),
    clipBias: 0.003,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = -0.002;
  scene.add(mirror);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.32, metalness: 0, transparent: true, opacity: 0.84 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

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
  const panels: { mats: THREE.MeshBasicMaterial[]; light: THREE.RectAreaLight; t0: number; base: THREE.Vector3 }[] = [];
  const panelSpots: [number, number, number][] = [
    [-4.0, 0, -1.8],
    [4.0, 0, -1.8],
    [-2.5, 0, -4.4],
    [2.5, 0, -4.4],
  ];
  panelSpots.forEach(([x, , z], idx) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const legMat = new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.5, metalness: 0.6 });
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 12), legMat);
    leg.position.y = 0.275;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), legMat);
    frame.position.y = 0.7;
    g.add(leg, frame);
    const mats: THREE.MeshBasicMaterial[] = [];
    for (let r = 0; r < 3; r++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false });
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.045), mat);
      bar.position.set(0, 0.79 - r * 0.085, 0.027);
      g.add(bar);
      mats.push(mat);
    }
    const light = new THREE.RectAreaLight('#ffffff', 0, 0.42, 0.25);
    light.position.set(x, 0.7, z + 0.03);
    light.lookAt(x * 0.2, 0.6, z + 6);
    scene.add(g, light);
    panels.push({ mats, light, t0: 3.0 + (idx < 2 ? 0.15 : 0) + hash(idx + 40) * 0.05, base: new THREE.Vector3(x, 0.01, z + 0.25) });
  });

  // ── floor glints: under the stand and in front of the panels
  const starTex = starTexture();
  const glints: { sprite: THREE.Sprite; t0: number; size: number; seed: number }[] = [];
  const addGlint = (p: THREE.Vector3, t0: number, size: number, seed: number) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: starTex, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    );
    sprite.position.copy(p);
    sprite.scale.setScalar(0.001);
    scene.add(sprite);
    glints.push({ sprite, t0, size, seed });
  };
  addGlint(new THREE.Vector3(0, 0.03, 0.62), 3.25, 0.75, 1);
  addGlint(new THREE.Vector3(-0.3, 0.02, 0.32), 3.4, 0.35, 2);
  addGlint(new THREE.Vector3(0.3, 0.02, 0.32), 3.45, 0.35, 3);
  panels.forEach((p, i) => addGlint(p.base, p.t0 + 0.15, i < 2 ? 0.55 : 0.4, 10 + i));

  // ── camera + post
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 80);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.2, 0.0, 1.6);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // ── reflections: an environment map of the hangar (without the aircraft), rebuilt as lights change
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflective = new Set<THREE.MeshStandardMaterial>();
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
    for (const g of glints) g.sprite.visible = false;
    const prev = envRT;
    envRT = pmrem.fromScene(scene, 0, 0.1, 60, { size: 256, position: envCenter });
    prev?.dispose();
    model.root.visible = true;
    stand.visible = true;
    mirror.visible = true;
    for (const g of glints) g.sprite.visible = true;
    // only the aircraft and stand reflect the hangar; the floor and walls stay dark
    for (const m of reflective) {
      m.envMap = envRT.texture;
      m.envMapIntensity = 1.6;
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
      for (const m of p.mats) m.color.setScalar(4 * k);
      p.light.intensity = 3 * k;
      panelSum += Math.round(k * 10);
    });
    glints.forEach((g) => {
      const k = smooth(g.t0, g.t0 + 0.35, t);
      const tw = 0.82 + 0.18 * Math.sin(t * 5.3 + g.seed * 1.7) * Math.sin(t * 2.1 + g.seed);
      g.sprite.scale.setScalar(Math.max(0.001, g.size * k * tw));
      g.sprite.material.color.setScalar(1.8 * k);
      g.sprite.material.rotation = Math.sin(t * 0.6 + g.seed) * 0.05;
    });
    updateEnv(`${litSum}|${panelSum}|${Math.round(wall * 10)}`);

    // slow push-in
    const u = smooth(0, DURATION, t);
    camera.position.lerpVectors(CAM_START, CAM_END, u);
    camera.lookAt(CAM_LOOK);
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
