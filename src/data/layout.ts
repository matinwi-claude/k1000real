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

/** Illustrative wingspan; other dimensions are ratios traced from the CAD top view. */
export const SPAN = 5.0;

export const WING = {
  halfSpan: SPAN / 2,
  rootChord: 0.293,
  /** spanwise position where the rounded tip begins */
  tipStart: 1.9,
  /** trailing edge z (straight) */
  teZ: -0.05,
  /** chord-line height at the root (wing sits on top of the fuselage pod) */
  y: 0.1,
  dihedralDeg: 2.5,
  /** three-piece wing: centre section spans the booms, outer panels plug in here */
  centreHalf: 0.8,
  aileron: { inner: 1.36, outer: 2.2, hinge: 0.76 },
} as const;

export const FUSELAGE = {
  noseZ: 0.8,
  podEndZ: -0.49,
  tailEndZ: -1.345,
  shellThickness: 0.0026,
} as const;

export const BOOM = {
  x: 0.762,
  frontZ: 0.843,
  rearZ: -0.698,
  /** maximum radius, at the pylon */
  radius: 0.031,
  /** radius of the motor nacelles at the rotor stations */
  nacelle: 0.025,
  rotorFrontZ: 0.733,
  rotorRearZ: -0.59,
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

export const TAIL = {
  /** fin root leading edge (start of the dorsal fillet) */
  finRootLE: -0.98,
  finRootTE: -1.335,
  finTipLE: -1.17,
  finTipTE: -1.34,
  finBaseY: 0.085,
  finTipY: 0.45,
  stabHalfSpan: 0.465,
  stabLE: -1.18,
  stabTE: -1.338,
} as const;

/** Lowest point of the aircraft (EO/IR turret), used to place the floor. */
export const LOWEST_Y = -0.235;

export const GEAR = {
  /** compact landing pads under the booms (the CAD shows no tall gear) */
  footY: 0.0,
  bellySkidY: -0.155,
} as const;

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

export const BOOM_Y = wingY(BOOM.x) - 0.078;
export const MOTOR_BASE_Y = BOOM_Y + BOOM.nacelle + 0.002;
export const LIFT_PROP_Y = MOTOR_BASE_Y + LIFT.motorHeight + 0.016;

export const pad = (n: number) => String(n).padStart(2, '0');

/** Overall envelope (mm) — illustrative because the absolute scale is assumed. */
export const ENVELOPE = {
  span: Math.round(SPAN * 1000),
  length: Math.round((CRUISE.z + 0.02 - FUSELAGE.tailEndZ) * 1000),
  height: Math.round((TAIL.finTipY + 0.02 - LOWEST_Y) * 1000),
};
