/**
 * Exploded layout for the 2D parts page. Offsets are in metres in the model frame
 * (+X port, +Y up, +Z nose). `screen` pins a part's centre to a camera-plane position
 * (metres right/up of the model origin) — used for the enlarged detail parts.
 */
import type { Vec3 } from '../src/data/layout';

export interface Place {
  offset?: Vec3;
  screen?: [number, number];
  scale?: number;
}

export const VIEW_2D = { azimuth: -38, elevation: 30 };

/** Not drawn: too small or purely internal plumbing. */
export const EXCLUDE_2D = ['fasteners', 'wing-spar'];

/** Drawn as part of another part (one outline, one hover target). */
export const MERGE_2D: Record<string, string> = {
  'pod-segment-port': 'boom-port',
  'pod-segment-starboard': 'boom-starboard',
};

const WING_UP = 0.34;
const wingOut = 0.75;
const boomOut = 0.42;

const port = (o: Vec3): Vec3 => o;
const stbd = (o: Vec3): Vec3 => [-o[0], o[1], o[2]];

export const LAYOUT_2D: Record<string, Place> = {
  // wing
  'wing-center': { offset: [0, WING_UP, 0] },
  'wing-port': { offset: port([wingOut, WING_UP, 0]) },
  'solar-port': { offset: port([wingOut, WING_UP, 0]) },
  'aileron-port': { offset: port([wingOut, WING_UP, -0.09]) },
  'wing-starboard': { offset: stbd([wingOut, WING_UP, 0]) },
  'solar-starboard': { offset: stbd([wingOut, WING_UP, 0]) },
  'aileron-starboard': { offset: stbd([wingOut, WING_UP, -0.09]) },

  // lift booms
  'boom-port': { offset: port([boomOut, -0.08, 0]) },
  'boom-starboard': { offset: stbd([boomOut, -0.08, 0]) },
  'pod-segment-port': { offset: port([boomOut, -0.08, 0]) },
  'pod-segment-starboard': { offset: stbd([boomOut, -0.08, 0]) },
  'lift-motor-02': { offset: port([boomOut, 0.03, 0]) },
  'lift-motor-03': { offset: port([boomOut, 0.03, 0]) },
  'lift-motor-01': { offset: stbd([boomOut, 0.03, 0]) },
  'lift-motor-04': { offset: stbd([boomOut, 0.03, 0]) },
  'lift-prop-02': { offset: port([boomOut, 0.13, 0]) },
  'lift-prop-03': { offset: port([boomOut, 0.13, 0]) },
  'lift-prop-01': { offset: stbd([boomOut, 0.13, 0]) },
  'lift-prop-04': { offset: stbd([boomOut, 0.13, 0]) },

  // fuselage group
  'antenna-01': { offset: [0, 0.1, 0] },
  'antenna-02': { offset: [0, 0.1, 0] },
  'cruise-motor': { offset: [0, 0, 0.28] },
  'cruise-prop': { offset: [0, 0, 0.44] },
  'horizontal-stabilizer': { offset: [0, 0.14, -0.04] },
  'solar-tail': { offset: [0, 0.14, -0.04] },
  elevator: { offset: [0, 0.14, -0.1] },
  rudder: { offset: [0, 0, -0.08] },
  pitot: { offset: port([wingOut, WING_UP - 0.06, 0.06]) },

  // loose parts (screen = metres right / up of the model origin). Payloads / radios only set the scale of
  // their thumbnails (tools/lineart.ts ?variant=payloads); they are not drawn on the aircraft sheet.
  battery: { screen: [0.1, -0.95], scale: 1.0 },
  mod: { screen: [-0.38, -1.15], scale: 1.56 },
  'eo-ir': { screen: [0.09, -1.15], scale: 1.33 },
  sar: { screen: [0.56, -1.15], scale: 0.79 },
  'asi-snitch': { screen: [1.03, -1.15], scale: 0.9 },
  atne: { screen: [1.5, -1.1], scale: 0.78 },
  starlink: { screen: [1.97, -1.15], scale: 0.87 },
  silvus: { screen: [2.44, -1.15], scale: 2.76 },
  'silvus-4400': { screen: [2.91, -1.15], scale: 2.58 },
};

