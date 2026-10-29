/**
 * Per-part CAD replacements.
 *
 * public/models/parts.glb holds meshes named "<component-id>__<material>[__spin]" that are
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

export type PartGeometry = { mat: MatKey; geom: THREE.BufferGeometry; spin: boolean };
export type PartModels = Map<string, PartGeometry[]>;

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
      const [id, mat, flag] = (mesh.name || mesh.parent?.name || '').split('__');
      if (!COMPONENT_MAP[id] || !mat) {
        console.warn('[K1000] parts.glb: ignoring mesh', mesh.name);
        return;
      }
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      for (const name of Object.keys(geom.attributes)) if (name !== 'position' && name !== 'normal') geom.deleteAttribute(name);
      if (!parts.has(id)) parts.set(id, []);
      parts.get(id)!.push({ mat: mat as MatKey, geom, spin: flag === 'spin' });
    });
  } catch (e) {
    console.warn('[K1000] Failed to load part models, using procedural geometry.', e);
  }
  return parts;
}
