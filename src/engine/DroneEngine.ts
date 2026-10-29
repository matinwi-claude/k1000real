/**
 * DroneEngine — owns the WebGL renderer, scene, camera rig, post-processing,
 * interaction (hover / click / measure), and all animated state (explode, x-ray,
 * section, lighting, overlays). React talks to it through the zustand store and a
 * handful of imperative methods (camera views, focus, stats).
 */
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { getState, useStore, type CameraView, type State } from '../store';
import { COMPONENT_MAP, ENVELOPE } from '../data/components';

/** Half-range of the cross-section cut slider per axis, in metres (illustrative scale). */
export const SECTION_RANGE = { top: 0.15, side: 2.6, front: 1.3 } as const;
import { CRUISE, FUSELAGE, LIFT, LIFT_LAYOUT, LOWEST_Y, TAIL, WING, pad } from '../data/layout';
import { buildDroneModel, type ComponentNode, type DroneModel } from './DroneModel';
import { createMaterialLibrary, globalUniforms } from './materials';
import { LIGHT_PRESETS, clonePreset, lerpPreset, type LightPreset } from './lighting';
import { createGridMaterial } from '../shaders/grid';
import { planformShadowTexture, SHADOW_PLANE } from './shadow';
import { AxisGizmo, Hud, type Pt } from './Hud';
import { sound } from '../utils/sound';

CameraControls.install({ THREE });
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DEFAULT_AZIMUTH = -0.62;
const DEFAULT_POLAR = 1.12;
const TARGET = new THREE.Vector3(0, 0.07, -0.18);
const FIT_RADIUS = 1.75;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * k;

interface MPoint {
  node: ComponentNode | null;
  local: THREE.Vector3;
}
interface MeasureLine {
  id: number;
  a: MPoint;
  b: MPoint;
  mm: number;
}

export interface EngineDom {
  /** optional real model (glTF scene) that replaces the procedural geometry */
  external?: THREE.Object3D | null;
  host: HTMLElement;
  hud: SVGSVGElement;
  gizmo: SVGSVGElement;
  tooltip: HTMLElement;
}

export interface EngineStats {
  fps: number;
  calls: number;
  triangles: number;
  dpr: number;
  camera: [number, number, number];
  target: [number, number, number];
  distance: number;
}

export class DroneEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: CameraControls;
  composer: EffectComposer;
  outline: OutlinePass;
  model!: DroneModel;
  hud: Hud;
  gizmo: AxisGizmo;

  private dom: EngineDom;
  private timer = new THREE.Timer();
  private time = 0;
  private raf = 0;
  private disposed = false;
  private isMobile: boolean;
  private maxDpr: number;
  private dpr: number;
  private width = 1;
  private height = 1;

  // lights & environment
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private fill!: THREE.DirectionalLight;
  private rim!: THREE.DirectionalLight;
  private light: LightPreset = clonePreset(LIGHT_PRESETS.studio);
  private grid!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private shadow!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private backdrop!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  // animated state
  private explodeCur = 0;
  private xrayCur = 0;
  private ghostCur = 0;
  private overlayCur = 0;
  private sectionAmt = 0;
  private sectionActive = false;
  private sectionAxis: 'top' | 'side' | 'front' = 'top';
  private sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10);
  private sectionVisual!: THREE.Group;
  private viewOffsetCur = 0;
  private bobAmt = 1;
  private spinSpeed = 0;
  private spinAngle = 0;
  private cineStart = 0;
  private cineExplode = 0;
  private wireframe = false;

  // interaction
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-10, -10);
  private pointerClient = { x: -100, y: -100 };
  private pointerDirty = false;
  private pointerInside = false;
  private downInfo: { x: number; y: number; t: number; button: number } | null = null;
  private dragging = false;
  private hoverId: string | null = null;
  private pickTargets: THREE.Object3D[] = [];
  private pickDirty = true;
  private keys = new Set<string>();

  // measurement
  private measures: MeasureLine[] = [];
  private pending: MPoint | null = null;
  private pendingHover: THREE.Vector3 | null = null;
  private measureId = 0;
  private lastMeasureSync = 0;

  // overlays
  private overlayGroup = new THREE.Group();
  private overlayMats: (THREE.LineBasicMaterial | THREE.LineDashedMaterial)[] = [];
  private rotorDiscs: THREE.Line[] = [];
  private guides!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private dimAnchors: { p: THREE.Vector3; text: string }[] = [];

  // render bookkeeping
  private needsRender = true;
  private frameTimes: number[] = [];
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  private lastCalls = 0;
  private lastTris = 0;
  private calloutEl: Element | null = null;
  private unsub: () => void;
  private introStarted = false;
  private selectionNode: ComponentNode | null = null;
  private lastRest = 0;
  private onScreen = true;
  private resizeObs: ResizeObserver | null = null;
  private visObs: IntersectionObserver | null = null;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(dom: EngineDom) {
    this.dom = dom;
    this.isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 2);
    this.dpr = this.maxDpr;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.className = 'k-canvas';
    dom.host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
    this.controls = new CameraControls(this.camera, this.renderer.domElement);
    this.configureControls(false);

    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: this.isMobile ? 2 : 4,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlinePass(new THREE.Vector2(1, 1), this.scene, this.camera, []);
    this.outline.edgeStrength = 4.2;
    this.outline.edgeGlow = 0.55;
    this.outline.edgeThickness = 1.4;
    this.outline.visibleEdgeColor.set('#7fc0ff');
    this.outline.hiddenEdgeColor.set('#1d3f66');
    this.outline.enabled = false;
    this.composer.addPass(this.outline);
    this.composer.addPass(new OutputPass());

    this.hud = new Hud(dom.hud);
    this.gizmo = new AxisGizmo(dom.gizmo);

    this.setupEnvironment();
    this.setupModel();
    this.setupOverlay();
    this.setupSectionVisual();
    this.bindEvents();
    this.resize();

    this.applyInitialCamera();
    this.unsub = useStore.subscribe((s, p) => this.onState(s, p));
    this.onState(getState(), { ...getState(), lighting: 'studio', section: null, freeCam: false, selected: null } as State);
    this.light = clonePreset(LIGHT_PRESETS[getState().lighting]);
    this.explodeCur = getState().explode;
    this.raf = requestAnimationFrame(this.loop);
  }

  // ─────────────────────────────────────────────────────────── setup
  private configureControls(free: boolean) {
    const c = this.controls;
    // touch devices in an embed: let the host page scroll until the viewer is tapped
    const touchGate = getState().embed && !getState().activated && this.isMobile;
    c.enabled = !touchGate && !getState().cinematic;
    this.renderer.domElement.style.touchAction = touchGate ? 'pan-y' : 'none';
    const A = CameraControls.ACTION;
    c.mouseButtons.left = A.ROTATE;
    c.mouseButtons.right = A.TRUCK;
    c.mouseButtons.middle = A.DOLLY;
    const gated = getState().embed && !getState().activated;
    c.mouseButtons.wheel = gated ? A.NONE : A.DOLLY;
    c.touches.one = A.TOUCH_ROTATE;
    c.touches.two = A.TOUCH_DOLLY_TRUCK;
    c.touches.three = A.TOUCH_TRUCK;
    c.dollyToCursor = true;
    c.smoothTime = 0.42;
    c.draggingSmoothTime = 0.12;
    c.azimuthRotateSpeed = 0.75;
    c.polarRotateSpeed = 0.75;
    c.dollySpeed = 0.9;
    c.truckSpeed = 1.6;
    c.restThreshold = 0.002;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI;
    c.minDistance = free ? 0.005 : 0.035;
    c.maxDistance = free ? 60 : 22;
    c.infinityDolly = free;
  }

  private setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(env, 0.035).texture;
    env.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    pmrem.dispose();
    this.scene.background = new THREE.Color('#07090c');

    // screen-space studio backdrop: soft radial falloff behind the drone
    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: { uCenter: { value: new THREE.Color('#151b22') }, uEdge: { value: new THREE.Color('#050608') }, uAspect: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
        fragmentShader: `
          uniform vec3 uCenter; uniform vec3 uEdge; uniform float uAspect; varying vec2 vUv;
          void main(){
            vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(uAspect, 1.0);
            float d = length(p);
            float t = smoothstep(0.0, 0.95, d);
            vec3 c = mix(uCenter, uEdge, t);
            // fine dither to avoid banding
            float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0);
          }`,
      }),
    );
    this.backdrop.frustumCulled = false;
    this.backdrop.renderOrder = -10;
    this.scene.add(this.backdrop);

    this.hemi = new THREE.HemisphereLight('#cfd9e6', '#14171b', 0.35);
    this.key = new THREE.DirectionalLight('#fff4e8', 2.8);
    this.fill = new THREE.DirectionalLight('#a9c4e6', 0.7);
    this.fill.position.set(-3, 1.2, 1.5);
    this.rim = new THREE.DirectionalLight('#d9e8ff', 2.6);
    this.rim.position.set(-1.2, 2.2, -4);
    this.scene.add(this.hemi, this.key, this.fill, this.rim);

    const floorY = LOWEST_Y - 0.3;
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), createGridMaterial());
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.position.y = floorY;
    this.grid.renderOrder = -2;
    this.scene.add(this.grid);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(SHADOW_PLANE.width, SHADOW_PLANE.depth),
      new THREE.MeshBasicMaterial({ map: planformShadowTexture(), transparent: true, depthWrite: false, opacity: 0.7, toneMapped: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, floorY + 0.002, SHADOW_PLANE.centerZ);
    this.shadow.renderOrder = -1;
    this.scene.add(this.shadow);
  }

  private setupModel() {
    const lib = createMaterialLibrary();
    this.model = buildDroneModel(lib, this.dom.external);
    this.scene.add(this.model.root);
    for (const o of this.model.pickables) {
      const m = o as THREE.Mesh;
      if (!(m as unknown as THREE.InstancedMesh).isInstancedMesh && m.geometry && m.geometry.attributes.position.count > 200) {
        m.geometry.computeBoundsTree();
      }
    }
    // rotor discs (overlay) parented to each propeller so they follow the explode
    const disc = (radius: number, vertical: boolean) => {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        pts.push(vertical ? new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0) : new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineDashedMaterial({ color: '#6fb7ff', dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0, depthWrite: false });
      const line = new THREE.Line(g, m);
      line.computeLineDistances();
      line.visible = false;
      this.rotorDiscs.push(line);
      this.overlayMats.push(m);
      return line;
    };
    for (const a of LIFT_LAYOUT) this.model.nodes.get(`lift-prop-${pad(a.index)}`)?.group.add(disc(LIFT.propRadius, false));
    this.model.nodes.get('cruise-prop')?.group.add(disc(CRUISE.propRadius, true));
    // explode guide lines
    const n = this.model.nodes.size;
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 6), 3));
    this.guides = new THREE.LineSegments(
      gg,
      new THREE.LineDashedMaterial({ color: '#6fb7ff', dashSize: 0.012, gapSize: 0.01, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.guides.frustumCulled = false;
    this.guides.visible = false;
    this.model.root.add(this.guides);
  }

  private setupOverlay() {
    const g = this.overlayGroup;
    g.visible = false;
    this.scene.add(g);
    const mk = (pts: number[], color: string, dashed: boolean, opacity = 0.6) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0, depthWrite: false })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
      mat.userData.base = opacity;
      const line = new THREE.LineSegments(geo, mat);
      if (dashed) line.computeLineDistances();
      g.add(line);
      this.overlayMats.push(mat);
      return line;
    };
    const fy = this.grid.position.y + 0.003;
    const half = ENVELOPE.span / 2000;
    const noseZ = FUSELAGE.noseZ + 0.07;
    const tailZ = FUSELAGE.tailEndZ;
    const zL = tailZ - 0.35;
    const xL = half + 0.3;
    const tick = 0.06;
    const top = TAIL.finTipY + 0.03;
    // centerlines through the datum
    mk([-half - 0.4, WING.y, 0, half + 0.4, WING.y, 0, 0, WING.y, tailZ - 0.4, 0, WING.y, noseZ + 0.4, 0, fy, 0, 0, top + 0.2, 0], '#6f9fcf', true, 0.55);
    // span dimension (floor, aft of the tail)
    mk(
      [
        -half, fy, zL, half, fy, zL,
        -half, fy, zL - tick, -half, fy, zL + tick,
        half, fy, zL - tick, half, fy, zL + tick,
        -half, fy, zL + tick, -half, fy, WING.teZ - 0.1,
        half, fy, zL + tick, half, fy, WING.teZ - 0.1,
      ],
      '#8fb8e0',
      false,
      0.55,
    );
    // length dimension (floor, outboard of the port tip)
    mk(
      [
        xL, fy, tailZ, xL, fy, noseZ,
        xL - tick, fy, tailZ, xL + tick, fy, tailZ,
        xL - tick, fy, noseZ, xL + tick, fy, noseZ,
      ],
      '#8fb8e0',
      false,
      0.55,
    );
    // height dimension
    mk(
      [
        xL, LOWEST_Y, zL, xL, top, zL,
        xL - tick, LOWEST_Y, zL, xL + tick, LOWEST_Y, zL,
        xL - tick, top, zL, xL + tick, top, zL,
      ],
      '#8fb8e0',
      false,
      0.5,
    );
    // axis triad at floor datum
    mk([0, fy, 0, 0.45, fy, 0], '#d26a5c', false, 0.9);
    mk([0, fy, 0, 0, fy + 0.45, 0], '#7cc48a', false, 0.9);
    mk([0, fy, 0, 0, fy, 0.45], '#5d9ae0', false, 0.9);
    // bounding brackets
    const y0 = LOWEST_Y - 0.01;
    const y1 = top;
    const sB = 0.18;
    const corners: number[] = [];
    for (const x of [-half - 0.05, half + 0.05])
      for (const y of [y0, y1])
        for (const z of [tailZ - 0.05, noseZ + 0.05]) {
          const sx = -Math.sign(x) * sB;
          const sy = -Math.sign(y - (y0 + y1) / 2) * sB * 0.5;
          const sz = -Math.sign(z - (tailZ + noseZ) / 2) * sB;
          corners.push(x, y, z, x + sx, y, z, x, y, z, x, y + sy, z, x, y, z, x, y, z + sz);
        }
    mk(corners, '#6f9fcf', false, 0.45);

    this.dimAnchors = [
      { p: new THREE.Vector3(0, fy, zL - 0.12), text: `SPAN ${ENVELOPE.span} mm` },
      { p: new THREE.Vector3(xL + 0.22, fy, (tailZ + noseZ) / 2), text: `LENGTH ${ENVELOPE.length} mm` },
      { p: new THREE.Vector3(xL + 0.15, (LOWEST_Y + top) / 2, zL), text: `H ${ENVELOPE.height} mm` },
      { p: new THREE.Vector3(0.52, fy, 0), text: '+X' },
      { p: new THREE.Vector3(0, fy + 0.52, 0), text: '+Y' },
      { p: new THREE.Vector3(0, fy, 0.55), text: '+Z  FWD' },
    ];
  }

  private setupSectionVisual() {
    const g = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#4f9dff', transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false }),
    );
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: '#7fc0ff', transparent: true, opacity: 0.5 }),
    );
    const cross = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, -0.5, 0, 0, 0.5, 0], 3)),
      new THREE.LineDashedMaterial({ color: '#7fc0ff', transparent: true, opacity: 0.35, dashSize: 0.02, gapSize: 0.015 }),
    );
    cross.computeLineDistances();
    g.add(plane, edge, cross);
    g.visible = false;
    this.sectionVisual = g;
    this.scene.add(g);
  }

  // ─────────────────────────────────────────────────────────── camera
  private fitDistance() {
    // portrait screens: the long wing needs extra room horizontally
    const portrait = this.camera.aspect < 1 ? 1 + (1 - this.camera.aspect) * 1.15 : 1;
    return this.controls.getDistanceToFitSphere(FIT_RADIUS * portrait);
  }

  private sphericalPos(az: number, polar: number, dist: number, target = TARGET) {
    return new THREE.Vector3(
      target.x + dist * Math.sin(polar) * Math.sin(az),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(az),
    );
  }

  private applyInitialCamera() {
    const cam = parseCamParam(getState().camParam);
    if (cam) {
      this.controls.setLookAt(cam[0], cam[1], cam[2], cam[3], cam[4], cam[5], false);
      return;
    }
    const d = this.fitDistance();
    const p = this.sphericalPos(DEFAULT_AZIMUTH - 0.75, DEFAULT_POLAR + 0.18, d * 1.75);
    this.controls.setLookAt(p.x, p.y, p.z, TARGET.x, TARGET.y + 0.05, TARGET.z, false);
  }

  /** Called by the UI once the reveal begins. */
  startIntro() {
    if (this.introStarted) return;
    this.introStarted = true;
    if (getState().camParam) return;
    const st = getState();
    if (st.selected) {
      this.focusComponent(st.selected);
      return;
    }
    this.controls.smoothTime = 1.35;
    this.setCameraView('reset');
    window.setTimeout(() => {
      if (!this.disposed) this.controls.smoothTime = 0.42;
    }, 2600);
  }

  setCameraView(view: CameraView, smooth = true) {
    // leave room for separated assemblies when the aircraft is exploded
    const d = this.fitDistance() * (getState().explode > 0.5 ? 1.32 : 1);
    const views: Record<CameraView, [number, number, number]> = {
      reset: [DEFAULT_AZIMUTH, DEFAULT_POLAR, d],
      front: [0, Math.PI / 2, d * 1.02],
      rear: [Math.PI, Math.PI / 2, d * 1.02],
      side: [-Math.PI / 2, Math.PI / 2, d * 1.02],
      top: [Math.PI, 0.0001, d * 1.08],
      bottom: [0, Math.PI - 0.0001, d * 1.08],
    };
    const [az, polar, dist] = views[view];
    // take the shortest way round
    const cur = this.controls.azimuthAngle;
    const target = az + Math.round((cur - az) / (Math.PI * 2)) * Math.PI * 2;
    const p = this.sphericalPos(target, polar, dist);
    this.controls.normalizeRotations();
    void this.controls.setLookAt(p.x, p.y, p.z, TARGET.x, TARGET.y, TARGET.z, smooth);
    this.controls.setFocalOffset(0, 0, 0, smooth);
    this.needsRender = true;
  }

  focusComponent(id: string) {
    const node = this.model.nodes.get(id);
    if (!node) return;
    if (id === 'fasteners') return;
    const sphere = this.worldBox(node).getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.03);
    const dist = clamp(this.controls.getDistanceToFitSphere(r) * 1.25, 0.12, 12);
    const pos = this.camera.position.clone();
    const tgt = this.controls.getTarget(new THREE.Vector3());
    const dir = pos.sub(tgt).normalize();
    if (dir.lengthSq() < 0.5) dir.set(0.5, 0.4, 0.7).normalize();
    const p = sphere.center.clone().addScaledVector(dir, dist);
    void this.controls.setLookAt(p.x, p.y, p.z, sphere.center.x, sphere.center.y, sphere.center.z, true);
    this.needsRender = true;
  }

  getCameraParam() {
    const p = this.camera.position;
    const t = this.controls.getTarget(new THREE.Vector3());
    return [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => v.toFixed(3)).join(',');
  }

  setWireframe(on: boolean) {
    this.wireframe = on;
    for (const node of this.model.nodes.values())
      for (const m of node.materials) (m as THREE.MeshStandardMaterial).wireframe = on;
    this.needsRender = true;
  }

  getStats(): EngineStats {
    const p = this.camera.position;
    const t = this.controls.getTarget(new THREE.Vector3());
    return {
      fps: this.fps,
      calls: this.lastCalls,
      triangles: this.lastTris,
      dpr: this.dpr,
      camera: [p.x, p.y, p.z],
      target: [t.x, t.y, t.z],
      distance: this.controls.distance,
    };
  }

  // ─────────────────────────────────────────────────────────── state
  private onState(s: State, p: State) {
    if (s.lighting !== p.lighting) this.needsRender = true;
    if (s.activated !== p.activated) this.configureControls(s.freeCam);
    if (s.freeCam !== p.freeCam) {
      this.configureControls(s.freeCam);
      if (!s.freeCam) this.setCameraView('reset');
    }
    if (s.section !== p.section) {
      if (s.section) {
        this.sectionAxis = s.section;
        this.enableSection(true);
      }
      // disabling is finished in the loop once the cut animates out
    }
    if (s.hidden !== p.hidden || s.view !== p.view) this.pickDirty = true;
    if (s.explode >= 0.5 && p.explode < 0.5 && !s.cinematic) {
      // pull back so the separated assemblies stay in frame
      const want = this.fitDistance() * 1.35;
      if (this.controls.distance < want) void this.controls.dollyTo(want, true);
    }
    if (s.selected !== p.selected) {
      this.pickDirty = true;
      this.selectionNode = s.selected ? this.model.nodes.get(s.selected) ?? null : null;
      this.outline.selectedObjects = this.selectionNode ? this.selectionNode.meshes : [];
      this.outline.enabled = !!this.selectionNode;
      this.calloutEl = null;
      if (s.selected && (s.mode === 'inspect' || s.focusOnSelect)) this.focusComponent(s.selected);
      if (s.focusOnSelect) useStore.setState({ focusOnSelect: false });
    }
    if (s.mode !== p.mode) {
      if (s.mode !== 'measure') {
        this.pending = null;
        this.pendingHover = null;
        if (s.measurePending) useStore.setState({ measurePending: false });
      }
      this.renderer.domElement.style.cursor = s.mode === 'measure' ? 'crosshair' : '';
    }
    if (s.measurements !== p.measurements && s.measurements.length === 0 && this.measures.length) {
      this.measures = [];
      this.pending = null;
    }
    if (s.cinematic !== p.cinematic) {
      if (s.cinematic) {
        this.cineStart = this.time;
        this.controls.enabled = false;
      } else {
        this.controls.enabled = true;
        this.setCameraView('reset');
      }
    }
    if (s.engineer !== p.engineer && !s.engineer && this.wireframe) {
      this.setWireframe(false);
      useStore.setState({ wireframe: false, spinTest: false });
    }
    this.needsRender = true;
  }

  private enableSection(on: boolean) {
    this.sectionActive = on;
    this.renderer.localClippingEnabled = on;
    globalUniforms.uSection.value = on ? 1 : 0;
    for (const node of this.model.nodes.values()) {
      for (const m of node.materials) {
        if (on) {
          if (m.userData.baseSide === undefined) m.userData.baseSide = m.side;
          m.clippingPlanes = [this.sectionPlane];
          m.side = THREE.DoubleSide;
        } else {
          m.clippingPlanes = null;
          m.side = m.userData.baseSide ?? THREE.FrontSide;
        }
        m.needsUpdate = true;
      }
    }
    this.sectionVisual.visible = on;
    this.pickDirty = true;
  }

  // ─────────────────────────────────────────────────────────── events
  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('pointerenter', () => (this.pointerInside = true));
    el.addEventListener('dblclick', this.onDblClick);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', this.onUserInteract, { passive: true });
    window.addEventListener('resize', this.resize);
    // size from the container (works when embedded directly, not only full-window)
    if ('ResizeObserver' in window) {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(this.dom.host);
    }
    // stop rendering while scrolled out of view (embeds on long pages)
    if ('IntersectionObserver' in window) {
      this.visObs = new IntersectionObserver((entries) => {
        this.onScreen = entries.some((e) => e.isIntersecting);
        if (this.onScreen) {
          this.timer.update();
          this.needsRender = true;
        }
      });
      this.visObs.observe(this.dom.host);
    }
    el.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      useStore.setState({ contextLost: true });
    });
    el.addEventListener('webglcontextrestored', () => window.location.reload());
    el.addEventListener('pointerdown', this.activate, { capture: true });
    el.addEventListener('wheel', this.onGatedWheel, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.controls.addEventListener('controlstart', this.onUserInteract);
    this.controls.addEventListener('rest', this.onRest);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.timer.update();
        this.needsRender = true;
      }
    });
  }

  /** First click/tap inside an embed enables zoom (and touch control). */
  private activate = () => {
    if (!getState().activated) useStore.setState({ activated: true });
  };

  private onGatedWheel = () => {
    const s = getState();
    if (s.embed && !s.activated) useStore.setState({ wheelHint: Date.now() });
  };

  private onUserInteract = () => {
    const s = getState();
    if (s.cinematic) return;
    if (s.autoRotate || !s.interacted) useStore.setState({ autoRotate: false, interacted: true });
  };

  private onRest = () => {
    const now = performance.now();
    if (now - this.lastRest < 200) return;
    this.lastRest = now;
    if (getState().interacted && !getState().cinematic) useStore.setState({ camParam: this.getCameraParam() });
  };

  private setPointer(e: PointerEvent | MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointerClient.x = e.clientX;
    this.pointerClient.y = e.clientY;
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onPointerMove = (e: PointerEvent) => {
    this.pointerInside = true;
    this.setPointer(e);
    this.pointerDirty = true;
    if (this.downInfo && Math.hypot(e.clientX - this.downInfo.x, e.clientY - this.downInfo.y) > 4) this.dragging = true;
    const t = this.dom.tooltip;
    t.style.transform = `translate3d(${e.clientX + 16}px, ${e.clientY + 18}px, 0)`;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.setPointer(e);
    this.downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
    this.dragging = false;
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.downInfo;
    this.downInfo = null;
    const wasDrag = this.dragging;
    this.dragging = false;
    if (!d || e.target !== this.renderer.domElement) return;
    if (wasDrag || d.button !== 0 || performance.now() - d.t > 600) return;
    this.setPointer(e);
    this.handleClick();
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    this.pointer.set(-10, -10);
    this.setHover(null);
  };

  private onDblClick = (e: MouseEvent) => {
    this.setPointer(e);
    const hit = this.pick();
    if (hit && getState().mode !== 'measure') {
      const id = hit.object.userData.componentId as string;
      useStore.setState({ selected: id });
      this.focusComponent(id);
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private resize = () => {
    const r = this.dom.host.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(r.width));
    this.height = Math.max(1, Math.floor(r.height));
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.backdrop.material.uniforms.uAspect.value = this.camera.aspect;
    this.applyViewOffset();
    this.hud.setSize(this.width, this.height);
    this.needsRender = true;
  };

  private applyViewOffset() {
    const off = this.viewOffsetCur;
    if (Math.abs(off) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, off, 0, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }

  // ─────────────────────────────────────────────────────────── picking
  /** Selecting a part that lives inside the skin ghosts the exterior so it is visible. */
  private autoGhost(s: State) {
    return !!s.selected && COMPONENT_MAP[s.selected]?.layer === 'internal';
  }

  private rebuildPickTargets() {
    const s = getState();
    const xrayish = s.view !== 'exterior' || this.autoGhost(s);
    this.pickTargets = [];
    for (const node of this.model.nodes.values()) {
      if (s.hidden[node.id]) continue;
      if (xrayish && node.data.layer === 'exterior') continue;
      for (const m of node.meshes) {
        if (m.userData.componentId === 'fasteners') {
          if (s.hidden.fasteners) continue;
          if (s.hidden[m.userData.host]) continue;
        }
        this.pickTargets.push(m);
      }
    }
    // fasteners are owned by the fasteners node but live in host groups
    this.pickTargets = Array.from(new Set(this.pickTargets));
    this.pickDirty = false;
  }

  private pick(): THREE.Intersection | null {
    if (this.pickDirty) this.rebuildPickTargets();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const clip = this.sectionActive && this.sectionAmt > 0.02;
    (this.raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = !clip;
    const hits = this.raycaster.intersectObjects(this.pickTargets, false);
    for (const h of hits) {
      if (clip && this.sectionPlane.distanceToPoint(h.point) < 0) continue;
      if (!h.object.userData.componentId) continue;
      return h;
    }
    return null;
  }

  private setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    useStore.setState({ hovered: id, hoverSource: id ? 'canvas' : null });
    this.needsRender = true;
  }

  private handleClick() {
    const s = getState();
    const hit = this.pick();
    if (s.mode === 'measure') {
      if (!hit) return;
      this.addMeasurePoint(hit);
      return;
    }
    if (!hit) {
      if (s.selected) useStore.setState({ selected: null });
      return;
    }
    const id = hit.object.userData.componentId as string;
    if (id === s.selected) return;
    useStore.setState({ selected: id, interacted: true, autoRotate: false });
    sound.select();
  }

  // ─────────────────────────────────────────────────────────── measurement
  private toMPoint(hit: THREE.Intersection): MPoint {
    let o: THREE.Object3D | null = hit.object;
    let node: ComponentNode | null = null;
    while (o) {
      const n = this.model.nodes.get(o.name);
      if (n && n.group === o) {
        node = n;
        break;
      }
      o = o.parent;
    }
    if (node) {
      node.group.updateMatrixWorld();
      return { node, local: node.group.worldToLocal(hit.point.clone()) };
    }
    return { node: null, local: hit.point.clone() };
  }

  private worldOf(mp: MPoint, out = new THREE.Vector3()) {
    out.copy(mp.local);
    if (mp.node) mp.node.group.localToWorld(out);
    return out;
  }

  private addMeasurePoint(hit: THREE.Intersection) {
    const mp = this.toMPoint(hit);
    if (!this.pending) {
      this.pending = mp;
      useStore.setState({ measurePending: true });
      sound.tick();
    } else {
      const a = this.pending;
      const mm = this.worldOf(a).distanceTo(this.worldOf(mp)) * 1000;
      this.measures.push({ id: ++this.measureId, a, b: mp, mm });
      this.pending = null;
      this.pendingHover = null;
      this.syncMeasurements(true);
      useStore.setState({ measurePending: false });
      sound.confirm();
    }
    this.needsRender = true;
  }

  private syncMeasurements(force = false) {
    const now = performance.now();
    if (!force && now - this.lastMeasureSync < 150) return;
    this.lastMeasureSync = now;
    const cur = getState().measurements;
    const next = this.measures.map((m) => ({ id: m.id, distanceMm: Math.round(m.mm * 10) / 10 }));
    const same = cur.length === next.length && cur.every((c, i) => c.id === next[i].id && Math.abs(c.distanceMm - next[i].distanceMm) < 0.5);
    if (!same) useStore.setState({ measurements: next });
  }

  removeMeasurement(id: number) {
    this.measures = this.measures.filter((m) => m.id !== id);
    this.syncMeasurements(true);
    this.needsRender = true;
  }

  // ─────────────────────────────────────────────────────────── helpers
  private worldBox(node: ComponentNode) {
    node.group.updateWorldMatrix(true, false);
    return node.localBox.clone().applyMatrix4(node.group.matrixWorld);
  }

  private _v = new THREE.Vector3();
  private project(p: THREE.Vector3): Pt {
    const v = this._v.copy(p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, ok: v.z < 1 && v.z > -1 };
  }

  private screenRect(node: ComponentNode) {
    node.group.updateWorldMatrix(true, false);
    const b = node.localBox;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const c = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(node.group.matrixWorld);
      const p = this.project(c);
      if (!p.ok) return null;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
  }

  // ─────────────────────────────────────────────────────────── loop
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden || !this.onScreen) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.time += dt;
    const s = getState();
    let active = false;
    const k = 1 - Math.exp(-dt * 7);
    const kf = 1 - Math.exp(-dt * 12);

    // ── camera
    if (s.cinematic) {
      this.runCinematic();
      active = true;
    } else {
      if (s.autoRotate && !this.downInfo) {
        void this.controls.rotate(dt * (s.presentation ? 0.14 : 0.09), 0, false);
        active = true;
      }
      if (s.freeCam && this.keys.size) active = this.freeFly(dt) || active;
    }
    const camMoved = this.controls.update(dt);
    if (camMoved) active = true;
    const dist = this.controls.distance;
    const near = clamp(dist * 0.012, 0.0015, 0.05);
    if (Math.abs(this.camera.near - near) / near > 0.15) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }

    // ── view offset (shift drone left when the inspector panel is open on desktop)
    const panelOpen = !!s.selected && !s.presentation && !s.cinematic && this.width > 900;
    const offTarget = panelOpen ? Math.min(190, this.width * 0.12) : 0;
    if (Math.abs(this.viewOffsetCur - offTarget) > 0.3) {
      this.viewOffsetCur = approach(this.viewOffsetCur, offTarget, k);
      this.applyViewOffset();
      active = true;
    }

    // ── lighting
    if (lerpPreset(this.light, LIGHT_PRESETS[s.lighting], 1 - Math.exp(-dt * 3.2))) active = true;
    this.applyLighting(s);

    // ── explode
    const explodeTarget = s.cinematic ? this.cineExplode : s.explode;
    if (Math.abs(this.explodeCur - explodeTarget) > 0.0005) {
      this.explodeCur = approach(this.explodeCur, explodeTarget, 1 - Math.exp(-dt * 3.4));
      active = true;
    } else this.explodeCur = explodeTarget;

    // ── view modes
    const xrT = s.view === 'xray' ? 1 : 0;
    const ghT = s.view === 'internal' || (s.view === 'exterior' && this.autoGhost(s)) ? 1 : 0;
    if (Math.abs(this.xrayCur - xrT) > 0.001 || Math.abs(this.ghostCur - ghT) > 0.001) {
      this.xrayCur = approach(this.xrayCur, xrT, k);
      this.ghostCur = approach(this.ghostCur, ghT, k);
      if (Math.abs(this.xrayCur - xrT) < 0.002) this.xrayCur = xrT;
      if (Math.abs(this.ghostCur - ghT) < 0.002) this.ghostCur = ghT;
      active = true;
    }
    globalUniforms.uXray.value = this.xrayCur;
    globalUniforms.uGhost.value = this.ghostCur;

    // ── overlay
    const ovT = s.overlay ? 1 : 0;
    if (Math.abs(this.overlayCur - ovT) > 0.002) {
      this.overlayCur = approach(this.overlayCur, ovT, k);
      active = true;
    } else this.overlayCur = ovT;

    // ── section
    if (this.sectionActive) active = this.updateSection(s, k) || active;

    // ── bob / idle float
    const bobT = !this.reducedMotion && (s.autoRotate || s.presentation || s.cinematic) ? 1 : 0;
    this.bobAmt = approach(this.bobAmt, bobT, 1 - Math.exp(-dt * 1.5));
    if (this.bobAmt > 0.001) {
      this.model.root.position.y = Math.sin(this.time * 0.9) * 0.02 * this.bobAmt;
      this.model.root.rotation.z = Math.sin(this.time * 0.55) * 0.006 * this.bobAmt;
      this.model.root.rotation.x = Math.sin(this.time * 0.43 + 1) * 0.004 * this.bobAmt;
      active = true;
    }
    const lift = this.model.root.position.y;
    this.shadow.scale.setScalar(1 - lift * 1.2);

    // ── spin test
    const spinT = s.spinTest ? 22 : 0;
    this.spinSpeed = approach(this.spinSpeed, spinT, 1 - Math.exp(-dt * 0.9));
    if (this.spinSpeed > 0.01) {
      this.spinAngle += this.spinSpeed * dt;
      active = true;
    }

    // ── components (explode positions, highlight uniforms, fades)
    if (this.updateComponents(s, kf)) active = true;

    // ── hover
    if (this.pointerDirty && !this.downInfo && this.pointerInside && !s.cinematic) {
      this.pointerDirty = false;
      const hit = this.pick();
      if (s.mode === 'measure') {
        this.pendingHover = hit ? hit.point.clone() : null;
        this.setHover(null);
        this.needsRender = true;
      } else {
        this.setHover(hit ? (hit.object.userData.componentId as string) : null);
      }
    }

    // night strobes need continuous frames
    if (s.lighting === 'night' || this.light.led > 2) active = true;

    // ── render
    if (active || this.needsRender) {
      this.needsRender = false;
      this.renderer.info.reset();
      this.composer.render(dt);
      this.lastCalls = this.renderer.info.render.calls;
      this.lastTris = this.renderer.info.render.triangles;
      this.updateHud(s);
      this.adaptResolution(dt);
    }
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime > 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.syncMeasurements();
  };

  private freeFly(dt: number) {
    const sp = (this.keys.has('shift') ? 1.6 : 0.55) * dt;
    let moved = false;
    if (this.keys.has('w')) (void this.controls.forward(sp, true), (moved = true));
    if (this.keys.has('s')) (void this.controls.forward(-sp, true), (moved = true));
    if (this.keys.has('a')) (void this.controls.truck(-sp, 0, true), (moved = true));
    if (this.keys.has('d')) (void this.controls.truck(sp, 0, true), (moved = true));
    if (this.keys.has('q')) (void this.controls.elevate(-sp, true), (moved = true));
    if (this.keys.has('e')) (void this.controls.elevate(sp, true), (moved = true));
    return moved;
  }

  private runCinematic() {
    const t = this.time - this.cineStart;
    const d = this.fitDistance();
    const az = DEFAULT_AZIMUTH + t * 0.12;
    const polar = 1.2 + 0.26 * Math.sin(t * 0.19);
    const dist = d * (0.82 + 0.22 * Math.sin(t * 0.13 + 1.2));
    const target = new THREE.Vector3(0, TARGET.y + 0.035 * Math.sin(t * 0.17), 0);
    const p = this.sphericalPos(az, polar, dist, target);
    void this.controls.setLookAt(p.x, p.y, p.z, target.x, target.y, target.z, false);
    // slow "breathing" assembly every ~25 s
    const phase = (t % 26) / 26;
    this.cineExplode = phase > 0.45 && phase < 0.9 ? 0.55 * Math.sin(((phase - 0.45) / 0.45) * Math.PI) : 0;
  }

  private applyLighting(s: State) {
    const L = this.light;
    (this.scene.background as THREE.Color).copy(L.background);
    const bu = this.backdrop.material.uniforms;
    bu.uEdge.value.copy(L.background).multiplyScalar(0.7);
    bu.uCenter.value.copy(L.background).lerp(L.rimColor, 0.035).multiplyScalar(2.1);
    this.renderer.toneMappingExposure = L.exposure;
    this.scene.environmentIntensity = L.env;
    this.hemi.intensity = L.hemi;
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.key.intensity = L.key;
    this.key.color.copy(L.keyColor);
    this.key.position.copy(L.keyPos);
    this.fill.intensity = L.fill;
    this.fill.color.copy(L.fillColor);
    this.rim.intensity = L.rim;
    this.rim.color.copy(L.rimColor);
    const g = this.grid.material.uniforms;
    g.uOpacity.value = L.grid * (1 + this.overlayCur * 0.6) * (s.presentation ? 0.6 : 1);
    g.uOverlay.value = this.overlayCur;
    this.shadow.material.opacity = L.shadow;

    const night = clamp((L.led - 1) / 4, 0, 1);
    const strobe = (this.time % 1.4) / 1.4 < 0.07 ? 1 : 0.18;
    for (const m of this.model.ledMaterials) {
      const base = m.userData.baseEmissive ?? 2;
      const isWhite = m.emissive.r > 0.9 && m.emissive.g > 0.9 && m.emissive.b > 0.9;
      m.emissiveIntensity = base * (0.7 + L.led * 0.5) * (isWhite && night > 0.5 ? strobe : 1);
    }
    for (const m of this.model.recLamp) {
      m.emissiveIntensity = (m.userData.baseEmissive ?? 2) * (night > 0.5 ? ((this.time % 1) < 0.5 ? 3 : 0.1) : 1);
    }
    for (const sp of this.model.glows) {
      const mat = sp.material as THREE.SpriteMaterial;
      const white = mat.color.r > 0.9 && mat.color.g > 0.9 && mat.color.b > 0.9;
      mat.opacity = (0.22 + night * 0.7) * (white && night > 0.5 ? strobe : 1) * (1 - this.xrayCur * 0.6);
      sp.scale.setScalar(0.05 + night * 0.07);
    }
    document.documentElement.style.setProperty('--vignette', L.vignette.toFixed(3));
  }

  private updateSection(s: State, k: number) {
    const on = !!s.section;
    if (s.section) this.sectionAxis = s.section;
    this.sectionAmt = approach(this.sectionAmt, on ? 1 : 0, k);
    const axis = this.sectionAxis;
    const range = SECTION_RANGE[axis];
    const base = axis === 'top' ? 0.05 : axis === 'front' ? -0.25 : 0;
    const cut = base + s.sectionOffset * range;
    const far = axis === 'top' ? 1.0 : axis === 'side' ? 3.2 : 1.6;
    const c = far + (cut - far) * easeInOut(clamp(this.sectionAmt, 0, 1));
    const n = axis === 'top' ? new THREE.Vector3(0, -1, 0) : axis === 'side' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1);
    this.sectionPlane.normal.copy(n);
    this.sectionPlane.constant = c;
    // visual quad
    const v = this.sectionVisual;
    v.position.set(0, 0, 0);
    v.rotation.set(0, 0, 0);
    if (axis === 'top') {
      v.rotation.x = -Math.PI / 2;
      v.position.set(0, c, -0.25);
      v.scale.set(5.6, 3.2, 1);
    } else if (axis === 'side') {
      v.rotation.y = Math.PI / 2;
      v.position.set(c, 0.1, -0.25);
      v.scale.set(3.2, 0.95, 1);
    } else {
      v.position.set(0, 0.1, c);
      v.scale.set(5.6, 0.95, 1);
    }
    v.children.forEach((ch) => {
      const m = (ch as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (m.userData.base === undefined) m.userData.base = m.opacity;
      m.opacity = m.userData.base * this.sectionAmt;
    });
    if (!on && this.sectionAmt < 0.01) {
      this.sectionAmt = 0;
      this.enableSection(false);
      return true;
    }
    return Math.abs(this.sectionAmt - (on ? 1 : 0)) > 0.001 || true;
  }

  private updateComponents(s: State, k: number) {
    let changed = false;
    const sel = s.selected;
    const selData = sel ? COMPONENT_MAP[sel] : undefined;
    const related = new Set(selData?.relatedComponents ?? []);
    const E = this.explodeCur;
    const dimLevel = s.mode === 'inspect' ? 0.8 : 0.58;
    const guidePos = this.guides.geometry.attributes.position as THREE.BufferAttribute;
    let gi = 0;
    for (const node of this.model.nodes.values()) {
      const d = node.data;
      // explode
      const local = easeInOut(clamp((E - d.explodeDelay * 0.5) / 0.7, 0, 1));
      const ex = d.explode;
      const px = node.basePosition.x + ex[0] * local;
      const py = node.basePosition.y + ex[1] * local;
      const pz = node.basePosition.z + ex[2] * local;
      if (node.group.position.x !== px || node.group.position.y !== py || node.group.position.z !== pz) {
        node.group.position.set(px, py, pz);
        changed = true;
      }
      if (d.id.startsWith('lift-prop-')) {
        const dir = d.id === 'lift-prop-03' || d.id === 'lift-prop-04' ? -1 : 1;
        node.spin.rotation.y = (this.spinAngle + local * 0.9) * dir;
      } else if (d.id === 'cruise-prop') {
        node.spin.rotation.z = this.spinAngle * 0.8 + local * 0.6;
      }
      if (local > 0.001 && (ex[0] || ex[1] || ex[2])) {
        guidePos.setXYZ(gi * 2, node.basePosition.x, node.basePosition.y, node.basePosition.z);
        guidePos.setXYZ(gi * 2 + 1, px, py, pz);
        gi++;
      }
      // highlight / dim / fade
      const hidden = !!s.hidden[d.id];
      const hovT = s.hovered === d.id && sel !== d.id ? 1 : 0;
      const hiT = sel === d.id ? 1 : 0;
      const dimT = sel && sel !== d.id ? (related.has(d.id) ? dimLevel * 0.45 : dimLevel) : 0;
      const fadeT = hidden ? 0 : 1;
      if (Math.abs(node.hov - hovT) > 0.001 || Math.abs(node.hi - hiT) > 0.001 || Math.abs(node.dim - dimT) > 0.001 || Math.abs(node.fade - fadeT) > 0.001) {
        node.hov = approach(node.hov, hovT, k);
        node.hi = approach(node.hi, hiT, k);
        node.dim = approach(node.dim, dimT, k);
        node.fade = approach(node.fade, fadeT, k);
        if (Math.abs(node.fade - fadeT) < 0.004) node.fade = fadeT;
        changed = true;
      }
      const u = node.uniforms;
      u.uHov.value = node.hov;
      u.uHi.value = node.hi * (0.8 + 0.2 * Math.sin(this.time * 2.2));
      u.uDim.value = node.dim;
      u.uFade.value = node.fade;
      // visibility after fade
      const vis = node.fade > 0.003;
      for (const m of node.meshes) {
        if (m.userData.componentId === 'fasteners' && node.id !== 'fasteners') continue;
        if (node.id === 'fasteners') {
          const host = m.userData.host as string;
          m.visible = vis && !s.hidden[host];
        } else m.visible = vis;
      }
      for (const fm of node.fastenerMeshes) fm.visible = !hidden && !s.hidden.fasteners;
      // transparency management
      const needT = node.fade < 0.999 || this.xrayCur * u.uXrayW.value > 0.001 || this.ghostCur * u.uGhostW.value > 0.001;
      if (needT !== node.transparent) {
        node.transparent = needT;
        for (const m of node.materials) {
          m.transparent = needT || !!m.userData.baseTransparent;
          m.depthWrite = needT ? false : m.userData.baseDepthWrite ?? true;
          m.needsUpdate = true;
        }
      }
    }
    if (sel) changed = true; // selection pulse
    // guides
    const showGuides = E > 0.01;
    this.guides.visible = showGuides;
    if (showGuides) {
      guidePos.needsUpdate = true;
      this.guides.geometry.setDrawRange(0, gi * 2);
      this.guides.computeLineDistances();
      this.guides.material.opacity = 0.32 * clamp(E * 3, 0, 1);
    }
    // overlay objects
    const ov = this.overlayCur;
    this.overlayGroup.visible = ov > 0.005;
    for (const m of this.overlayMats) m.opacity = (m.userData.base ?? 0.5) * ov;
    for (const r of this.rotorDiscs) r.visible = ov > 0.005;
    return changed;
  }

  // ─────────────────────────────────────────────────────────── HUD
  private updateHud(s: State) {
    // gizmo
    const q = this.camera.quaternion.clone().invert();
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((a) => {
      a.applyQuaternion(q);
      return [a.x, a.y, a.z] as [number, number, number];
    });
    this.gizmo.update(axes);

    // measurements
    const items: { a: Pt; b: Pt; mm: number; pending?: boolean; index: number }[] = [];
    const wa = new THREE.Vector3();
    const wb = new THREE.Vector3();
    for (const m of this.measures) {
      this.worldOf(m.a, wa);
      this.worldOf(m.b, wb);
      m.mm = wa.distanceTo(wb) * 1000;
      items.push({ a: this.project(wa), b: this.project(wb), mm: m.mm, index: m.id });
    }
    if (this.pending && s.mode === 'measure') {
      this.worldOf(this.pending, wa);
      const a = this.project(wa);
      if (this.pendingHover) {
        items.push({ a, b: this.project(this.pendingHover), mm: wa.distanceTo(this.pendingHover) * 1000, pending: true, index: this.measureId + 1 });
      } else {
        const r = this.renderer.domElement.getBoundingClientRect();
        items.push({ a, b: { x: this.pointerClient.x - r.left, y: this.pointerClient.y - r.top, ok: true }, mm: 0, pending: true, index: this.measureId + 1 });
        items[items.length - 1].mm = NaN;
      }
    }
    this.hud.drawMeasurements(items.filter((i) => !Number.isNaN(i.mm) || i.pending).map((i) => (Number.isNaN(i.mm) ? { ...i, mm: 0 } : i)));

    // selection callout + brackets
    const node = this.selectionNode;
    const uiHidden = s.presentation || s.cinematic;
    if (node && !uiHidden && node.id !== 'fasteners') {
      const center = this.worldBox(node).getCenter(new THREE.Vector3());
      const anchor = this.project(center);
      if (!this.calloutEl || !this.calloutEl.isConnected) this.calloutEl = document.querySelector('[data-callout-anchor]');
      let panel: { x: number; y: number } | null = null;
      if (this.calloutEl && this.width > 900) {
        const r = this.calloutEl.getBoundingClientRect();
        const hr = this.renderer.domElement.getBoundingClientRect();
        if (r.width > 0) panel = { x: r.left - hr.left, y: r.top - hr.top + r.height / 2 };
      }
      this.hud.drawCallout(anchor, panel);
      if (s.mode === 'inspect') {
        const rect = this.screenRect(node);
        const p = center;
        this.hud.drawBrackets(rect, [
          `${node.data.partNumber}  ·  ${node.data.status.toUpperCase()}`,
          `X ${(p.x * 1000).toFixed(0)}  Y ${(p.y * 1000).toFixed(0)}  Z ${(p.z * 1000).toFixed(0)} mm`,
        ]);
      } else this.hud.drawBrackets(null);
    } else {
      this.hud.drawCallout(null, null);
      this.hud.drawBrackets(null);
    }

    // overlay labels + dimensions
    const ov = uiHidden ? 0 : this.overlayCur;
    if (ov > 0.01) {
      const origin = this.project(new THREE.Vector3(0, TARGET.y, 0));
      const labels: { p: Pt; text: string; code: string; cx: number; cy: number }[] = [];
      for (const n of this.model.nodes.values()) {
        if (!n.data.overlayLabel || s.hidden[n.id]) continue;
        const c = this.worldBox(n).getCenter(new THREE.Vector3());
        labels.push({ p: this.project(c), text: n.data.name.toUpperCase(), code: n.data.partNumber, cx: origin.x, cy: origin.y });
      }
      this.hud.drawLabels(labels, ov);
      this.hud.drawDims(
        this.dimAnchors.map((d) => ({ p: this.project(d.p), text: d.text })),
        ov,
      );
    } else {
      this.hud.drawLabels([], 0);
      this.hud.drawDims([], 0);
    }
  }

  private adaptResolution(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 50) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    let next = this.dpr;
    if (avg > 1 / 40 && this.dpr > 0.75) next = Math.max(0.75, this.dpr - 0.25);
    else if (avg < 1 / 58 && this.dpr < this.maxDpr) next = Math.min(this.maxDpr, this.dpr + 0.25);
    if (next !== this.dpr) {
      this.dpr = next;
      this.resize();
    }
  }

  dispose() {
    this.disposed = true;
    this.resizeObs?.disconnect();
    this.visObs?.disconnect();
    cancelAnimationFrame(this.raf);
    this.unsub();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function parseCamParam(v: string | null | undefined): number[] | null {
  if (!v) return null;
  const n = v.split(',').map(Number);
  if (n.length !== 6 || n.some((x) => !Number.isFinite(x) || Math.abs(x) > 50)) return null;
  return n;
}
