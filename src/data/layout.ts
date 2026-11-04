/**
 * Shared layout constants for the K1000ULE visualization.
 *
 * Units are metres. Frame: +Y up, +Z forward (nose), +X port (left wing), -X starboard.
 *
 * Proportions are traced from CAD views of the K1000ULE (top view, 3/4 view and
 * exploded views) cross-checked against Kraus Hamdani Aerospace's public renders.
 * Absolute scale is NOT published — the wingspan below is an illustrative assumption,
 * so every dimension derived from it is illustrative too.
 */

export type Vec3 = [number, number, number];

/** Wingspan of the CAD wing (models-src/wing-6m.stl). */
export const SPAN = 6.098;

export const WING = {
  halfSpan: SPAN / 2,
  /** planform of the CAD wing: straight 364 mm chord, rounded tips */
  rootChord: 0.364,
  /** spanwise position where the rounded tip begins */
  tipStart: 2.45,
  /** trailing edge z (straight) */
  teZ: -0.114,
  /** chord-line height at the root */
  y: 0.124,
  dihedralDeg: 0.9,
  /** CAD wing underside between the fuselage and the VTOL pods */
  undersideY: 0.106,
  /** three-piece wing: centre section spans the booms, outer panels plug in here */
  centreHalf: 0.8,
  aileron: { inner: 1.487, outer: 2.747, hinge: 0.76 },
} as const;

export const FUSELAGE = {
  noseZ: 1.015,
  podEndZ: -0.72,
  tailEndZ: -1.79,
  shellThickness: 0.0026,
} as const;

/** VTOL pods, placed where the CAD wing assembly carries them. */
export const BOOM = {
  x: 0.92,
  frontZ: 0.811,
  rearZ: -0.796,
  /** maximum radius, at the pylon */
  radius: 0.031,
  /** radius of the motor nacelles at the rotor stations */
  nacelle: 0.025,
  /** CAD lift-motor centres */
  rotorFrontZ: 0.75,
  rotorRearZ: -0.68,
} as const;

export const LIFT = {
  motorRadius: 0.03,
  motorHeight: 0.036,
  propRadius: 0.15,
} as const;

export const CRUISE = {
  propRadius: 0.3,
  z: 0.822,
} as const;

/** T-tail extents, from the CAD tail and stabilizer (models-src/). */
export const TAIL = {
  finTipY: 0.527,
  stabY: 0.528,
  stabHalfSpan: 0.628,
  stabLE: -1.61,
  stabTE: -1.82,
} as const;

/** Lowest point of the aircraft (EO/IR turret), used to place the floor. */
export const LOWEST_Y = -0.235;

/** dihedral rise of the wing chord line at spanwise station |x| */
export const wingY = (x: number) => WING.y + Math.abs(x) * Math.tan((WING.dihedralDeg * Math.PI) / 180);

/** chord and leading/trailing edge z at spanwise station |x| (elliptical tips) */
export function wingStation(xAbs: number) {
  const c0: number = WING.rootChord;
  let c: number = c0;
  if (xAbs > WING.tipStart) {
    const t = Math.min(1, (xAbs - WING.tipStart) / (WING.halfSpan - WING.tipStart));
    c = Math.max(0.035, c0 * Math.sqrt(Math.max(0, 1 - t * t)));
  }
  // straight trailing edge; the leading edge rounds back into the tip
  const te = WING.teZ + 0.1 * (c0 - c);
  return { chord: c, te, le: te + c };
}

/**
 * Quad-X lift rotor numbering (PX4 style): 1 front-right, 2 rear-left, 3 front-left,
 * 4 rear-right. Port (+X) boom carries 2 and 3, starboard (-X) boom carries 1 and 4.
 */
export const LIFT_LAYOUT = [
  { index: 1, x: -BOOM.x, z: BOOM.rotorFrontZ, side: 'Front Right', boom: 'Starboard', spin: 'CCW' },
  { index: 2, x: BOOM.x, z: BOOM.rotorRearZ, side: 'Rear Left', boom: 'Port', spin: 'CCW' },
  { index: 3, x: BOOM.x, z: BOOM.rotorFrontZ, side: 'Front Left', boom: 'Port', spin: 'CW' },
  { index: 4, x: -BOOM.x, z: BOOM.rotorRearZ, side: 'Rear Right', boom: 'Starboard', spin: 'CW' },
] as const;

/** pod centreline height (CAD pod centre) */
export const BOOM_Y = 0.0475;
export const MOTOR_BASE_Y = BOOM_Y + BOOM.nacelle + 0.002;
export const LIFT_PROP_Y = MOTOR_BASE_Y + LIFT.motorHeight + 0.016;

export const pad = (n: number) => String(n).padStart(2, '0');

/** Overall envelope (mm) — illustrative because the absolute scale is assumed. */
export const ENVELOPE = {
  span: Math.round(SPAN * 1000),
  length: Math.round((CRUISE.z + 0.02 - FUSELAGE.tailEndZ) * 1000),
  height: Math.round((TAIL.finTipY + 0.02 - LOWEST_Y) * 1000),
};
