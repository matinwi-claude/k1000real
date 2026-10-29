/**
 * Per-part CAD replacements.
 *
 * public/models/parts.glb holds meshes named "<component-id>__<material>" that are
 * already in the viewer frame (metres, +Y up, +Z nose). Each one replaces the
 * procedural geometry of that component; every other part keeps its builder.
 * The file is produced from STL sources by tools/import-parts.py.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { COMPONENT_MAP } from '../data/components';
import type { MatKey } from './materials';

export const PARTS_URL = '/models/parts.glb';

export type PartGeometry = { mat: MatKey; geom: THREE.BufferGeometry };
export type PartModels = Map<string, PartGeometry[]>;

/**
 * Procedural parts that hang off the fuselage, re-fitted to the CAD fuselage when it
 * is loaded: p' = to + (p − pivot) · scale. The CAD nose ring sits 0.24 m ahead of
 * the procedural one and is ~1.8× wider; the CAD belly is shallower.
 */
type Fit = { pivot: [number, number, number]; to: [number, number, number]; scale?: number };
const shift = (x: number, y: number, z: number): Fit => ({ pivot: [0, 0, 0], to: [x, y, z] });
const NOSE_RING: [number, number, number] = [0, -0.012, 1.0146];
const NOSE_SCALE = 1.8;
export const CAD_FUSELAGE_FIT: Record<string, Fit> = {
  'nose-cone': { pivot: [0, -0.02, 0.772], to: NOSE_RING, scale: NOSE_SCALE },
  'cruise-motor': { pivot: [0, -0.02, 0.772], to: NOSE_RING, scale: NOSE_SCALE },
  'cruise-prop': { pivot: [0, -0.02, 0.8105], to: [0, NOSE_RING[1], NOSE_RING[2] + (0.81 - 0.772) * NOSE_SCALE] },
  // belly parts: the CAD hull bottom sits at y ≈ −0.061 (the procedural pod reached −0.15)
  gimbal: shift(0, 0, 0.05),
  'eo-ir': shift(0, 0, 0.05),
};

export function fitMatrix(f: Fit) {
  const s = f.scale ?? 1;
  return new THREE.Matrix4()
    .makeTranslation(...f.to)
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-f.pivot[0], -f.pivot[1], -f.pivot[2]));
}

export async function loadPartModels(url = PARTS_URL): Promise<PartModels> {
  const parts: PartModels = new Map();
  try {
    const head = await fetch(url, { method: 'HEAD' });
    // SPA fallbacks answer unknown paths with index.html
    if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) return parts;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const [id, mat] = (mesh.name || mesh.parent?.name || '').split('__');
      if (!COMPONENT_MAP[id] || !mat) {
        console.warn('[K1000] parts.glb: ignoring mesh', mesh.name);
        return;
      }
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      for (const name of Object.keys(geom.attributes)) if (name !== 'position' && name !== 'normal') geom.deleteAttribute(name);
      if (!parts.has(id)) parts.set(id, []);
      parts.get(id)!.push({ mat: mat as MatKey, geom });
    });
  } catch (e) {
    console.warn('[K1000] Failed to load part models, using procedural geometry.', e);
  }
  return parts;
}
