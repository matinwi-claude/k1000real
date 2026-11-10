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
  'avionics-hatch': { offset: [0, 0.2, 0.02] },
  'antenna-01': { offset: [0, 0.1, 0] },
  'antenna-02': { offset: [0, 0.1, 0] },
  'cruise-motor': { offset: [0, 0, 0.28] },
  'cruise-prop': { offset: [0, 0, 0.44] },
  'horizontal-stabilizer': { offset: [0, 0.14, -0.04] },
  'solar-tail': { offset: [0, 0.14, -0.04] },
  elevator: { offset: [0, 0.14, -0.1] },
  rudder: { offset: [0, 0, -0.08] },
  pitot: { offset: port([wingOut, WING_UP - 0.06, 0.06]) },

  // enlarged detail parts, one row in the bottom right (screen = metres right / up of the model origin)
  'eo-ir': { screen: [0.55, -1.15], scale: 2.4 },
  battery: { screen: [1.15, -1.15], scale: 1.0 },
  atne: { screen: [1.75, -1.1], scale: 0.85 },
  silvus: { screen: [2.3, -1.15], scale: 3.0 },
  'silvus-4400': { screen: [2.85, -1.15], scale: 2.8 },
};

/** Portrait (phone) variant: the loose parts stack under the aircraft instead of around it. */
export const LAYOUT_2D_PORTRAIT: Record<string, Place> = {
  'eo-ir': { screen: [-1.6, -3.7], scale: 5.0 },
  battery: { screen: [0.05, -3.7], scale: 2.2 },
  atne: { screen: [1.7, -3.85], scale: 1.6 },
  silvus: { screen: [-0.9, -5.3], scale: 6 },
  'silvus-4400': { screen: [1.0, -5.3], scale: 5.5 },
};
