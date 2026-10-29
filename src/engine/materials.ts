import * as THREE from 'three';
import { batteryLabel, carbonTexture, fcLidLabel } from './textures';
import { MATERIAL_PATCH_FRAGMENT, MATERIAL_PATCH_UNIFORMS } from '../shaders/materialPatch';

/** Uniforms shared by every drone material. */
export const globalUniforms = {
  uXray: { value: 0 },
  uGhost: { value: 0 },
  uSection: { value: 0 },
  uCapA: { value: new THREE.Color('#1a3550') },
  uCapB: { value: new THREE.Color('#6fb7ff') },
  uAccent: { value: new THREE.Color('#5aa8ff') },
  uXrayColor: { value: new THREE.Color('#4f9dff') },
};

/** Per-component uniforms: one set is shared by all of a component's materials. */
export interface ComponentUniforms {
  uDim: { value: number };
  uHi: { value: number };
  uHov: { value: number };
  uFade: { value: number };
  uXrayW: { value: number };
  uGhostW: { value: number };
}

export function createComponentUniforms(xrayW: number, ghostW: number): ComponentUniforms {
  return {
    uDim: { value: 0 },
    uHi: { value: 0 },
    uHov: { value: 0 },
    uFade: { value: 1 },
    uXrayW: { value: xrayW },
    uGhostW: { value: ghostW },
  };
}

export function patchMaterial(mat: THREE.Material, cu: ComponentUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globalUniforms, cu);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MATERIAL_PATCH_UNIFORMS}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${MATERIAL_PATCH_FRAGMENT}`);
  };
  mat.customProgramCacheKey = () => 'k1000-patch-v1';
}

export type MatKey =
  | 'shell'
  | 'panel'
  | 'radome'
  | 'seam'
  | 'carbon'
  | 'aluminum'
  | 'anodized'
  | 'motorBell'
  | 'blackMatte'
  | 'rubber'
  | 'plastic'
  | 'plasticLight'
  | 'glass'
  | 'lens'
  | 'pcb'
  | 'pcbBlack'
  | 'copper'
  | 'gold'
  | 'wireRed'
  | 'wireBlack'
  | 'wireSignal'
  | 'wireYellow'
  | 'foam'
  | 'accent'
  | 'propWhite'
  | 'ledRed'
  | 'ledGreen'
  | 'ledWhite'
  | 'ledBlue'
  | 'batteryLabel'
  | 'fcLid'
  | 'fastener'
  | 'decal';

export type MaterialLibrary = Record<MatKey, THREE.Material>;

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);

export function createMaterialLibrary(): MaterialLibrary {
  const carbon = carbonTexture();
  return {
    shell: phys({ color: '#e6e9ec', roughness: 0.42, metalness: 0.04, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
    panel: phys({ color: '#dde1e5', roughness: 0.38, metalness: 0.04, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    radome: phys({ color: '#2b3036', roughness: 0.32, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    seam: std({ color: '#4a5058', roughness: 0.8, metalness: 0 }),
    carbon: phys({ color: '#ffffff', map: carbon, roughness: 0.38, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 }),
    aluminum: std({ color: '#c3cad2', roughness: 0.3, metalness: 1 }),
    anodized: std({ color: '#30353c', roughness: 0.36, metalness: 0.85 }),
    motorBell: phys({ color: '#24282e', roughness: 0.3, metalness: 0.9, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    blackMatte: std({ color: '#0b0c0e', roughness: 0.85, metalness: 0.05 }),
    rubber: std({ color: '#131416', roughness: 0.95, metalness: 0 }),
    plastic: std({ color: '#23272c', roughness: 0.62, metalness: 0.05 }),
    plasticLight: phys({ color: '#b9bec4', roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    glass: phys({ color: '#05080c', roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }),
    lens: phys({
      color: '#0c1420',
      roughness: 0.02,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.0,
      iridescence: 0.85,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [200, 520],
    }),
    pcb: std({ color: '#0f2a24', roughness: 0.55, metalness: 0.1 }),
    pcbBlack: std({ color: '#111418', roughness: 0.5, metalness: 0.15 }),
    copper: std({ color: '#c07a45', roughness: 0.35, metalness: 1 }),
    gold: std({ color: '#d8b04a', roughness: 0.28, metalness: 1 }),
    wireRed: std({ color: '#8e1d1d', roughness: 0.45, metalness: 0 }),
    wireBlack: std({ color: '#121314', roughness: 0.5, metalness: 0 }),
    wireSignal: std({ color: '#3b4c5f', roughness: 0.5, metalness: 0 }),
    wireYellow: std({ color: '#9a7a1c', roughness: 0.5, metalness: 0 }),
    foam: std({ color: '#26282b', roughness: 1, metalness: 0 }),
    accent: std({ color: '#e0662a', roughness: 0.5, metalness: 0.1 }),
    propWhite: std({ color: '#e4e7ea', roughness: 0.5, metalness: 0 }),
    ledRed: std({ color: '#300', emissive: '#ff2a1f', emissiveIntensity: 2.2, roughness: 0.3 }),
    ledGreen: std({ color: '#031', emissive: '#22ff6a', emissiveIntensity: 2.2, roughness: 0.3 }),
    ledWhite: std({ color: '#222', emissive: '#ffffff', emissiveIntensity: 2.0, roughness: 0.3 }),
    ledBlue: std({ color: '#012', emissive: '#4aa3ff', emissiveIntensity: 2.0, roughness: 0.3 }),
    batteryLabel: std({ map: batteryLabel(), roughness: 0.6, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 }),
    fcLid: std({ map: fcLidLabel(), roughness: 0.45, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
    fastener: std({ color: '#ffffff', vertexColors: true, roughness: 0.28, metalness: 1 }),
    decal: std({ color: '#ffffff', transparent: true, roughness: 0.5, metalness: 0.2, depthWrite: false }),
  };
}

export const LED_KEYS: MatKey[] = ['ledRed', 'ledGreen', 'ledWhite', 'ledBlue'];
