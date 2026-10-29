/**
 * Optional real-model support.
 *
 * Drop a glTF binary of the aircraft at public/models/k1000ule.glb and it replaces
 * the procedural visualization automatically. Name meshes (or their parent nodes)
 * after component ids from src/data/components.ts — e.g. "wing-port",
 * "lift-motor-03", "battery" — or set `extras.componentId` in the glTF, and each
 * part becomes individually selectable, explodable and hideable. Unnamed meshes are
 * grouped under the fuselage.
 *
 * Expected frame: +Y up, nose toward +Z, metres. Models in other units are rescaled
 * to the illustrative span and re-centred on the datum.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LOWEST_Y, SPAN } from '../data/layout';

export const MODEL_URL = '/models/k1000ule.glb';

export async function loadExternalModel(url = MODEL_URL): Promise<THREE.Object3D | null> {
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    const type = head.headers.get('content-type') ?? '';
    // SPA fallbacks answer unknown paths with index.html
    if (!head.ok || type.includes('text/html')) return null;
  } catch {
    return null;
  }
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    normalise(gltf.scene);
    return gltf.scene;
  } catch (e) {
    console.warn('[K1000] Failed to load external model, using procedural visualization.', e);
    return null;
  }
}

function normalise(scene: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  if (span < 1 || span > 20) scene.scale.multiplyScalar(SPAN / span);
  scene.updateMatrixWorld(true);
  box.setFromObject(scene);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.x -= c.x;
  scene.position.z -= c.z + 0.25;
  scene.position.y -= box.min.y - LOWEST_Y;
  scene.updateMatrixWorld(true);
}
