import * as THREE from 'three';
import type { LightingMode } from '../store';

export interface LightPreset {
  background: THREE.Color;
  exposure: number;
  env: number;
  hemi: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  key: number;
  keyColor: THREE.Color;
  keyPos: THREE.Vector3;
  fill: number;
  fillColor: THREE.Color;
  rim: number;
  rimColor: THREE.Color;
  grid: number;
  shadow: number;
  led: number;
  vignette: number;
}

const c = (h: string) => new THREE.Color(h);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const LIGHT_PRESETS: Record<LightingMode, LightPreset> = {
  studio: {
    background: c('#07090c'),
    exposure: 1.0,
    env: 0.85,
    hemi: 0.35,
    hemiSky: c('#cfd9e6'),
    hemiGround: c('#14171b'),
    key: 2.8,
    keyColor: c('#fff4e8'),
    keyPos: v(2.6, 4.2, 2.8),
    fill: 0.7,
    fillColor: c('#a9c4e6'),
    rim: 2.6,
    rimColor: c('#d9e8ff'),
    grid: 0.45,
    shadow: 0.7,
    led: 1,
    vignette: 0.75,
  },
  technical: {
    background: c('#0b0f14'),
    exposure: 1.02,
    env: 0.35,
    hemi: 1.9,
    hemiSky: c('#e6eef7'),
    hemiGround: c('#2a3038'),
    key: 0.9,
    keyColor: c('#ffffff'),
    keyPos: v(1.5, 5, 3),
    fill: 0.9,
    fillColor: c('#ffffff'),
    rim: 0.5,
    rimColor: c('#ffffff'),
    grid: 0.8,
    shadow: 0.35,
    led: 0.6,
    vignette: 0.35,
  },
  night: {
    background: c('#020305'),
    exposure: 0.9,
    env: 0.1,
    hemi: 0.06,
    hemiSky: c('#4a6a9a'),
    hemiGround: c('#000000'),
    key: 0.35,
    keyColor: c('#7d9cd0'),
    keyPos: v(-2, 3, 2),
    fill: 0.06,
    fillColor: c('#3a5a8a'),
    rim: 3.6,
    rimColor: c('#4f8dff'),
    grid: 0.22,
    shadow: 0.5,
    led: 5,
    vignette: 0.95,
  },
  inspection: {
    background: c('#0d1014'),
    exposure: 1.12,
    env: 0.6,
    hemi: 0.6,
    hemiSky: c('#ffffff'),
    hemiGround: c('#20242a'),
    key: 4.6,
    keyColor: c('#ffffff'),
    keyPos: v(0.4, 5.5, 1.8),
    fill: 1.2,
    fillColor: c('#f2f6fb'),
    rim: 1.0,
    rimColor: c('#ffffff'),
    grid: 0.55,
    shadow: 0.85,
    led: 0.8,
    vignette: 0.5,
  },
};

export function clonePreset(p: LightPreset): LightPreset {
  return {
    ...p,
    background: p.background.clone(),
    hemiSky: p.hemiSky.clone(),
    hemiGround: p.hemiGround.clone(),
    keyColor: p.keyColor.clone(),
    keyPos: p.keyPos.clone(),
    fillColor: p.fillColor.clone(),
    rimColor: p.rimColor.clone(),
  };
}

/** Exponential approach of `cur` toward `target` (in place). */
export function lerpPreset(cur: LightPreset, target: LightPreset, k: number) {
  const nums: (keyof LightPreset)[] = ['exposure', 'env', 'hemi', 'key', 'fill', 'rim', 'grid', 'shadow', 'led', 'vignette'];
  let delta = 0;
  for (const n of nums) {
    const a = cur[n] as number;
    const b = target[n] as number;
    (cur as unknown as Record<string, number>)[n] = a + (b - a) * k;
    delta += Math.abs(b - a);
  }
  cur.background.lerp(target.background, k);
  cur.hemiSky.lerp(target.hemiSky, k);
  cur.hemiGround.lerp(target.hemiGround, k);
  cur.keyColor.lerp(target.keyColor, k);
  cur.keyPos.lerp(target.keyPos, k);
  cur.fillColor.lerp(target.fillColor, k);
  cur.rimColor.lerp(target.rimColor, k);
  return delta > 0.002;
}
