/**
 * K1000ULE component database.
 *
 * Every interactive part of the visualization is described here. The 3D builder
 * (src/engine/DroneModel.ts) creates geometry for each id, and the UI reads names,
 * descriptions and specifications from this table. To add a component: add an entry
 * here and a matching builder in DroneModel.ts (or name a mesh with the same id in a
 * glTF model dropped into public/models/k1000ule.glb).
 *
 * Specifications marked `published: true` come from Kraus Hamdani Aerospace's public
 * K1000ULE product page. Everything else is an ILLUSTRATIVE placeholder for
 * visualization purposes and is not an official K1000ULE specification.
 */
import {
  BOOM,
  BOOM_Y,
  ENVELOPE,
  FUSELAGE,
  LIFT_LAYOUT,
  LIFT_PROP_Y,
  MOTOR_BASE_Y,
  LIFT,
  TAIL,
  WING,
  pad,
  wingY,
  type Vec3,
} from './layout';

export type CategoryId =
  | 'airframe'
  | 'propulsion'
  | 'power'
  | 'avionics'
  | 'sensors'
  | 'camera';

export type Status = 'operational' | 'attention' | 'standby';

/**
 * exterior  — outer skin: fades out in INTERNAL view and becomes x-ray in X-RAY view.
 * structure — external hardware: x-rayed lightly in X-RAY view.
 * internal  — systems inside the fuselage, wing and booms.
 */
export type Layer = 'exterior' | 'structure' | 'internal';

export interface Spec {
  label: string;
  value: string;
  /** true when the value is stated on the manufacturer's public product page */
  published?: boolean;
}

export interface DroneComponent {
  id: string;
  name: string;
  category: CategoryId;
  system: string;
  type: string;
  partNumber: string;
  description: string;
  /** Nominal anchor point in metres (model frame). */
  position: Vec3;
  location: string;
  relatedComponents: string[];
  status: Status;
  statusNote?: string;
  illustrativeSpecifications: Spec[];
  layer: Layer;
  /** Offset applied at 100% explode, in metres. */
  explode: Vec3;
  /** 0..1 stagger so assemblies separate in sequence. */
  explodeDelay: number;
  /** Revealed only to people who look closely (see Easter eggs). */
  hiddenNote?: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  code: string;
}

export const CATEGORIES: Category[] = [
  { id: 'airframe', label: 'Airframe', code: 'AFR' },
  { id: 'propulsion', label: 'Propulsion', code: 'PRP' },
  { id: 'power', label: 'Power', code: 'PWR' },
  { id: 'avionics', label: 'Avionics', code: 'AVN' },
  { id: 'sensors', label: 'Sensors', code: 'SNS' },
  { id: 'camera', label: 'Camera', code: 'CAM' },
];

/** Aircraft-level facts from the public product page (shown in the status panel). */
export const AIRCRAFT = {
  name: 'K1000ULE',
  maker: 'Kraus Hamdani Aerospace',
  tagline: 'Ultra-Long-Endurance, Long-Range Electric UAV',
  published: [
    { label: 'Class', value: 'Fully electric Group 2 UAS' },
    { label: 'Endurance (fixed-wing)', value: 'Up to 24 h' },
    { label: 'Endurance (eVTOL)', value: 'Up to 12 h' },
    { label: 'C2 range', value: 'Up to 150 km LOS from the GCS' },
    { label: 'Beyond LOS', value: 'SATCOM capable' },
    { label: 'Recharge', value: 'In-flight solar recharge' },
    { label: 'Deployment', value: 'Box-to-flight in 10 minutes' },
    { label: 'Readiness', value: 'TRL-9 / MRL-9' },
    { label: 'Compliance', value: 'Blue UAS Cleared & Select · NDAA' },
  ] satisfies Spec[],
};

const P = (label: string, value: string): Spec => ({ label, value, published: true });

const wingRootY = wingY(0);

const liftMotors: DroneComponent[] = LIFT_LAYOUT.map((a) => ({
  id: `lift-motor-${pad(a.index)}`,
  name: `Lift Motor ${pad(a.index)}`,
  category: 'propulsion',
  system: 'eVTOL Lift System',
  type: 'Brushless Motor',
  partNumber: `K1-PRP-L${pad(a.index)}`,
  description: `Vertical-lift brushless motor on the ${a.boom.toLowerCase()} boom (${a.side.toLowerCase()}). Provides thrust for vertical take-off, hover and landing, spinning ${a.spin}. Idle in fixed-wing cruise.`,
  position: [a.x, MOTOR_BASE_Y + LIFT.motorHeight / 2, a.z],
  location: `${a.boom} boom · ${a.side.split(' ')[0].toLowerCase()} station`,
  relatedComponents: [`lift-prop-${pad(a.index)}`, a.boom === 'Port' ? 'boom-port' : 'boom-starboard'],
  status: 'operational',
  illustrativeSpecifications: [
    P('Role', 'eVTOL lift (up to 12 h eVTOL endurance at aircraft level)'),
    { label: 'Type', value: 'Outrunner brushless (illustrative)' },
    { label: 'Rotation', value: a.spin },
    { label: 'Cooling', value: 'Open-bell, prop-wash cooled' },
    { label: 'Mount', value: 'Boom-top pylon' },
  ],
  layer: 'structure',
  explode: [0, 0.22, 0],
  explodeDelay: 0.24,
}));

const liftProps: DroneComponent[] = LIFT_LAYOUT.map((a) => ({
  id: `lift-prop-${pad(a.index)}`,
  name: `Lift Propeller ${pad(a.index)}`,
  category: 'propulsion',
  system: 'eVTOL Lift System',
  type: 'Two-Blade Propeller',
  partNumber: `K1-PRP-P${pad(a.index)}`,
  description: `Two-blade carbon lift propeller, ${a.spin} rotation. Stops aligned with the boom in cruise to minimise drag.`,
  position: [a.x, LIFT_PROP_Y, a.z],
  location: `${a.boom} boom · above Lift Motor ${pad(a.index)}`,
  relatedComponents: [`lift-motor-${pad(a.index)}`, a.boom === 'Port' ? 'boom-port' : 'boom-starboard'],
  status: a.index === 3 ? 'attention' : 'operational',
  statusNote: a.index === 3 ? 'Illustrative: minor leading-edge wear flagged for the next inspection.' : undefined,
  illustrativeSpecifications: [
    { label: 'Blades', value: '2 (traced from imagery)' },
    { label: 'Diameter', value: `≈ ${Math.round(LIFT.propRadius * 2000)} mm (illustrative scale)` },
    { label: 'Rotation', value: a.spin },
    { label: 'Material', value: 'Carbon composite (illustrative)' },
    { label: 'Cruise', value: 'Parked in line with boom' },
  ],
  layer: 'structure',
  explode: [0, 0.48, 0],
  explodeDelay: 0.32,
  hiddenNote: a.index === 3 ? 'Blade B, 62 % span: the wear mark is modelled. Zoom close to the leading edge.' : undefined,
}));

const boom = (side: 1 | -1): DroneComponent => ({
  id: side > 0 ? 'boom-port' : 'boom-starboard',
  name: side > 0 ? 'Lift Boom · Port' : 'Lift Boom · Starboard',
  category: 'airframe',
  system: 'Airframe Structure',
  type: 'Composite Rotor Boom',
  partNumber: side > 0 ? 'K1-AFR-B01' : 'K1-AFR-B02',
  description:
    'Slender composite boom hung beneath the wing on a faired pylon. Carries a forward and an aft lift motor and houses their speed controllers.',
  position: [side * BOOM.x, BOOM_Y, (BOOM.frontZ + BOOM.rearZ) / 2],
  location: `${side > 0 ? 'Port' : 'Starboard'} wing · ${Math.round(BOOM.x * 1000)} mm from centreline (illustrative)`,
  relatedComponents: side > 0 ? ['lift-motor-02', 'lift-motor-03', 'wing-port'] : ['lift-motor-01', 'lift-motor-04', 'wing-starboard'],
  status: 'operational',
  illustrativeSpecifications: [
    { label: 'Configuration', value: '2 lift rotors per boom (traced from imagery)' },
    { label: 'Length', value: `≈ ${Math.round((BOOM.frontZ - BOOM.rearZ) * 1000)} mm (illustrative scale)` },
    { label: 'Construction', value: 'Composite tube + faired pylon (illustrative)' },
  ],
  layer: 'exterior',
  explode: [side * 0.1, -0.34, 0],
  explodeDelay: 0.14,
  hiddenNote:
    side < 0 ? 'Serial plate on the underside of the boom, just aft of the pylon. Zoom in closely — the etching is a few millimetres tall.' : undefined,
});

const wing = (side: 1 | -1): DroneComponent => ({
  id: side > 0 ? 'wing-port' : 'wing-starboard',
  name: side > 0 ? 'Outer Wing · Port' : 'Outer Wing · Starboard',
  category: 'airframe',
  system: 'Airframe Structure',
  type: 'Plug-in Outer Wing Panel',
  partNumber: side > 0 ? 'K1-AFR-W01' : 'K1-AFR-W02',
  description:
    'Outer panel of the three-piece wing. Plugs onto the spar stub at the lift boom, carries the aileron and a rounded tip, and is almost entirely covered by solar cells that recharge the aircraft in flight.',
  position: [side * 1.6, wingY(1.6), 0.1],
  location: `${side > 0 ? 'Port' : 'Starboard'} side · shoulder-mounted`,
  relatedComponents: ['wing-center', side > 0 ? 'solar-port' : 'solar-starboard', side > 0 ? 'aileron-port' : 'aileron-starboard', side > 0 ? 'boom-port' : 'boom-starboard'],
  status: 'operational',
  illustrativeSpecifications: [
    P('Energy', 'Integrated solar for in-flight recharge'),
    P('Transport', 'Packs into compact Pelican cases'),
    { label: 'Planform', value: 'Constant chord, rounded tip (traced from CAD)' },
    { label: 'Panel span', value: `≈ ${Math.round((WING.halfSpan - WING.centreHalf) * 1000)} mm (illustrative scale)` },
    { label: 'Dihedral', value: `≈ ${WING.dihedralDeg}° (illustrative)` },
  ],
  layer: 'exterior',
  explode: [side * 0.6, 0.2, 0],
  explodeDelay: 0.06,
});

const wingCenter: DroneComponent = {
  id: 'wing-center',
  name: 'Centre Wing Section',
  category: 'airframe',
  system: 'Airframe Structure',
  type: 'Wing Centre Section',
  partNumber: 'K1-AFR-W00',
  description:
    'Centre section of the three-piece wing. Sits on the fuselage pod, carries both lift booms on faired pylons, and receives the outer panels at its ends.',
  position: [0, wingY(0) + 0.02, 0.1],
  location: 'Above fuselage · between the booms',
  relatedComponents: ['fuselage', 'wing-port', 'wing-starboard', 'boom-port', 'boom-starboard', 'wing-spar'],
  status: 'operational',
  illustrativeSpecifications: [
    P('Assembly', 'Box-to-flight in 10 minutes'),
    { label: 'Construction', value: 'Three-piece wing (from CAD exploded view)' },
    { label: 'Span', value: `≈ ${Math.round(WING.centreHalf * 2000)} mm (illustrative scale)` },
  ],
  layer: 'exterior',
  explode: [0, 0.3, 0],
  explodeDelay: 0.08,
};

const aileron = (side: 1 | -1): DroneComponent => ({
  id: side > 0 ? 'aileron-port' : 'aileron-starboard',
  name: side > 0 ? 'Aileron · Port' : 'Aileron · Starboard',
  category: 'airframe',
  system: 'Flight Controls',
  type: 'Control Surface',
  partNumber: side > 0 ? 'K1-AFR-C01' : 'K1-AFR-C02',
  description: 'Outboard trailing-edge control surface for roll control in fixed-wing flight, driven by a servo buried in the wing.',
  position: [side * (WING.aileron.inner + WING.aileron.outer) / 2, wingY(1.8), WING.teZ + 0.03],
  location: `${side > 0 ? 'Port' : 'Starboard'} wing · outboard trailing edge`,
  relatedComponents: [side > 0 ? 'wing-port' : 'wing-starboard'],
  status: 'operational',
  illustrativeSpecifications: [
    { label: 'Actuation', value: 'Digital servo (illustrative)' },
    { label: 'Chord', value: '≈ 24 % of local chord (illustrative)' },
  ],
  layer: 'structure',
  explode: [side * 0.75, 0.18, -0.2],
  explodeDelay: 0.12,
});

export const COMPONENTS: DroneComponent[] = [
  // ───────────────────────── AIRFRAME
  {
    id: 'fuselage',
    name: 'Fuselage Pod',
    category: 'airframe',
    system: 'Airframe Structure',
    type: 'Composite Fuselage',
    partNumber: 'K1-AFR-F01',
    description:
      'Slender streamlined pod beneath the wing that houses the battery, avionics and mission payload. Tapers aft into the tail boom for low drag — and a small acoustic, visual and radar signature.',
    position: [0, -0.02, 0.15],
    location: 'Centreline · beneath wing',
    relatedComponents: ['tail-boom', 'avionics-hatch'],
    status: 'operational',
    illustrativeSpecifications: [
      P('Signature', 'Minimal acoustic, visual and radar signature'),
      P('Architecture', 'Open architecture for rapid payload interchangeability'),
      { label: 'Construction', value: 'Composite monocoque (illustrative)' },
      { label: 'Pod length', value: `≈ ${Math.round((FUSELAGE.noseZ - FUSELAGE.podEndZ) * 1000)} mm (illustrative scale)` },
    ],
    layer: 'exterior',
    explode: [0, -0.1, 0],
    explodeDelay: 0.04,
  },
  wingCenter,
  wing(1),
  wing(-1),
  aileron(1),
  aileron(-1),
  {
    id: 'wing-spar',
    name: 'Wing Spar & Ribs',
    category: 'airframe',
    system: 'Airframe Structure',
    type: 'Primary Wing Structure',
    partNumber: 'K1-AFR-S01',
    description:
      'Carbon tube spar running through both wing panels with lightweight ribs. Carries flight loads, the lift booms, and the solar array wiring.',
    position: [0, wingRootY, 0.17],
    location: 'Inside wing · ~25 % chord',
    relatedComponents: ['wing-port', 'wing-starboard', 'boom-port', 'boom-starboard'],
    status: 'operational',
    illustrativeSpecifications: [
      { label: 'Spar', value: 'Tapered carbon tube (illustrative)' },
      { label: 'Ribs', value: 'Composite, ~350 mm pitch (illustrative)' },
      { label: 'Joint', value: 'Plug-in root for fast assembly (illustrative)' },
    ],
    layer: 'internal',
    explode: [0, 0.12, 0],
    explodeDelay: 0.5,
    hiddenNote: 'Box-to-flight in 10 minutes (published) relies on the wing panels plugging onto this spar without tools.',
  },
  {
    id: 'tail-boom',
    name: 'Tail Boom',
    category: 'airframe',
    system: 'Airframe Structure',
    type: 'Carbon Tail Boom',
    partNumber: 'K1-AFR-T01',
    description: 'Long tapered boom carrying the T-tail well aft of the wing for pitch and yaw stability.',
    position: [0, 0.073, -0.9],
    location: 'Aft fuselage',
    relatedComponents: ['fuselage', 'vertical-fin', 'horizontal-stabilizer'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Construction', value: 'Carbon tube, painted (illustrative)' }],
    layer: 'structure',
    explode: [0, 0, -0.28],
    explodeDelay: 0.1,
  },
  {
    id: 'vertical-fin',
    name: 'Vertical Fin',
    category: 'airframe',
    system: 'Empennage',
    type: 'Swept Fin',
    partNumber: 'K1-AFR-T02',
    description: 'Swept vertical stabiliser supporting the T-tail horizontal stabiliser at its tip.',
    position: [0, (TAIL.finBaseY + TAIL.finTipY) / 2, -1.33],
    location: 'Tail',
    relatedComponents: ['rudder', 'horizontal-stabilizer', 'tail-boom'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Configuration', value: 'T-tail (traced from imagery)' }],
    layer: 'structure',
    explode: [0, 0.1, -0.48],
    explodeDelay: 0.16,
  },
  {
    id: 'rudder',
    name: 'Rudder',
    category: 'airframe',
    system: 'Flight Controls',
    type: 'Control Surface',
    partNumber: 'K1-AFR-C03',
    description: 'Trailing-edge surface of the fin for yaw control.',
    position: [0, (TAIL.finBaseY + TAIL.finTipY) / 2, -1.46],
    location: 'Tail · fin trailing edge',
    relatedComponents: ['vertical-fin'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Actuation', value: 'Digital servo (illustrative)' }],
    layer: 'structure',
    explode: [0, 0.1, -0.7],
    explodeDelay: 0.22,
  },
  {
    id: 'horizontal-stabilizer',
    name: 'Horizontal Stabilizer',
    category: 'airframe',
    system: 'Empennage',
    type: 'T-Tail Stabilizer',
    partNumber: 'K1-AFR-T03',
    description: 'High-mounted stabiliser on top of the fin. Like the wing, its upper surface carries solar cells.',
    position: [0, TAIL.finTipY + 0.01, (TAIL.stabLE + TAIL.stabTE) / 2],
    location: 'Tail · top of fin',
    relatedComponents: ['elevator', 'solar-tail', 'vertical-fin'],
    status: 'operational',
    illustrativeSpecifications: [
      P('Energy', 'Solar cells on upper surface (visible in imagery)'),
      { label: 'Span', value: `≈ ${Math.round(TAIL.stabHalfSpan * 2000)} mm (illustrative scale)` },
    ],
    layer: 'structure',
    explode: [0, 0.4, -0.55],
    explodeDelay: 0.18,
  },
  {
    id: 'elevator',
    name: 'Elevator',
    category: 'airframe',
    system: 'Flight Controls',
    type: 'Control Surface',
    partNumber: 'K1-AFR-C04',
    description: 'Trailing-edge surface of the horizontal stabiliser for pitch control.',
    position: [0, TAIL.finTipY + 0.01, TAIL.stabTE + 0.02],
    location: 'Tail · stabiliser trailing edge',
    relatedComponents: ['horizontal-stabilizer'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Actuation', value: 'Digital servo (illustrative)' }],
    layer: 'structure',
    explode: [0, 0.5, -0.78],
    explodeDelay: 0.24,
  },
  boom(1),
  boom(-1),
  {
    id: 'avionics-hatch',
    name: 'Canopy Hatch',
    category: 'airframe',
    system: 'Airframe Structure',
    type: 'Removable Hatch',
    partNumber: 'K1-AFR-H01',
    description: 'Long removable canopy over the forward fuselage. Lifts off for field access to the mission computer, payload and battery, and carries the two antenna masts.',
    position: [0, 0.07, 0.52],
    location: 'Fuselage · forward top',
    relatedComponents: ['fuselage'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Fasteners', value: '4× captive quarter-turn (illustrative)' }, { label: 'Shape', value: 'Full-length canopy (from CAD exploded view)' }],
    layer: 'exterior',
    explode: [0, 0.42, 0.05],
    explodeDelay: 0.02,
  },
  {
    id: 'fasteners',
    name: 'Fasteners',
    category: 'airframe',
    system: 'Airframe Hardware',
    type: 'Captive Fasteners',
    partNumber: 'K1-AFR-X00',
    description: 'Captive fasteners used on hatches, motor mounts and pylons. Shown as one set; each instance follows its parent assembly.',
    position: [0, 0, 0],
    location: 'Distributed',
    relatedComponents: ['avionics-hatch', 'lift-motor-01', 'boom-port'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Type', value: 'Stainless socket cap (illustrative)' }],
    layer: 'structure',
    explode: [0, 0, 0],
    explodeDelay: 0,
  },

  // ───────────────────────── PROPULSION
  {
    id: 'cruise-motor',
    name: 'Cruise Motor',
    category: 'propulsion',
    system: 'Fixed-Wing Propulsion',
    type: 'T-Motor AT5220-B 220KV',
    partNumber: 'K1-PRP-C01',
    description: 'Nose-mounted T-Motor AT5220-B outrunner that pulls the aircraft in efficient fixed-wing cruise — the mode that delivers up to 24 hours of flight.',
    position: [0, -0.012, 0.952],
    location: 'Nose',
    relatedComponents: ['cruise-prop'],
    status: 'operational',
    illustrativeSpecifications: [
      P('Endurance', 'Up to 24 h continuous fixed-wing flight (aircraft level)'),
      P('Acoustics', 'Operates quietly'),
      { label: 'Configuration', value: 'Tractor' },
      { label: 'Motor', value: 'T-Motor AT5220-B, 220 KV (20–25 cc class)' },
    ],
    layer: 'structure',
    explode: [0, 0, 0.5],
    explodeDelay: 0.16,
  },
  {
    id: 'cruise-prop',
    name: 'Cruise Propeller',
    category: 'propulsion',
    system: 'Fixed-Wing Propulsion',
    type: 'Two-Blade Propeller',
    partNumber: 'K1-PRP-C02',
    description: 'Two-blade carbon tractor propeller on the cruise motor shaft.',
    position: [0, -0.012, 1.0189],
    location: 'Nose · spinner',
    relatedComponents: ['cruise-motor'],
    status: 'operational',
    illustrativeSpecifications: [
      { label: 'Blades', value: '2' },
      { label: 'Diameter', value: '660 mm' },
    ],
    layer: 'structure',
    explode: [0, 0, 0.72],
    explodeDelay: 0.22,
  },
  ...liftMotors,
  ...liftProps,

  // ───────────────────────── POWER
  {
    id: 'solar-port',
    name: 'Solar Array · Port Wing',
    category: 'power',
    system: 'Solar Power',
    type: 'Wing-Integrated Solar Cells',
    partNumber: 'K1-PWR-S01',
    description: 'Eight conformal solar panels across the port wing upper surface. Harvests energy in flight to extend endurance.',
    position: [1.2, wingY(1.2) + 0.03, 0.1],
    location: 'Port wing · upper surface',
    relatedComponents: ['wing-port', 'solar-starboard'],
    status: 'operational',
    illustrativeSpecifications: [
      P('Function', 'In-flight solar recharge'),
      { label: 'Panels', value: '8 per wing (counted from imagery)' },
      { label: 'Encapsulation', value: 'Flexible, conformal (illustrative)' },
    ],
    layer: 'structure',
    explode: [0.55, 0.62, 0],
    explodeDelay: 0.0,
  },
  {
    id: 'solar-starboard',
    name: 'Solar Array · Starboard Wing',
    category: 'power',
    system: 'Solar Power',
    type: 'Wing-Integrated Solar Cells',
    partNumber: 'K1-PWR-S02',
    description: 'Eight conformal solar panels across the starboard wing upper surface. Harvests energy in flight to extend endurance.',
    position: [-1.2, wingY(1.2) + 0.03, 0.1],
    location: 'Starboard wing · upper surface',
    relatedComponents: ['wing-starboard', 'solar-port'],
    status: 'operational',
    illustrativeSpecifications: [
      P('Function', 'In-flight solar recharge'),
      { label: 'Panels', value: '8 per wing (counted from imagery)' },
    ],
    layer: 'structure',
    explode: [-0.55, 0.62, 0],
    explodeDelay: 0.0,
  },
  {
    id: 'solar-tail',
    name: 'Solar Array · Tail',
    category: 'power',
    system: 'Solar Power',
    type: 'Stabilizer Solar Cells',
    partNumber: 'K1-PWR-S03',
    description: 'Solar cells on the horizontal stabiliser, visible in the manufacturer’s top-view imagery.',
    position: [0, TAIL.finTipY + 0.03, (TAIL.stabLE + TAIL.stabTE) / 2],
    location: 'Horizontal stabiliser · upper surface',
    relatedComponents: ['horizontal-stabilizer'],
    status: 'operational',
    illustrativeSpecifications: [P('Function', 'In-flight solar recharge'), { label: 'Panels', value: '4 (counted from imagery)' }],
    layer: 'structure',
    explode: [0, 0.75, -0.55],
    explodeDelay: 0.04,
  },

  // ───────────────────────── AVIONICS
  {
    id: 'satcom',
    name: 'SATCOM Terminal',
    category: 'avionics',
    system: 'Communications',
    type: 'Satellite Datalink',
    partNumber: 'K1-AVN-S01',
    description: 'Low dome on top of the centre wing section housing the satellite terminal, extending command and control worldwide beyond radio line of sight.',
    position: [0, 0.155, 0.02],
    location: 'Centre wing · upper surface',
    relatedComponents: [],
    status: 'operational',
    illustrativeSpecifications: [P('Capability', 'SATCOM capable for worldwide operations not limited by radio LOS'), { label: 'Radome', value: 'Low-profile dorsal (traced)' }],
    layer: 'structure',
    explode: [0, 0.55, -0.1],
    explodeDelay: 0.12,
  },
  {
    id: 'gnss',
    name: 'GNSS Receiver',
    category: 'avionics',
    system: 'Navigation',
    type: 'Multi-band GNSS',
    partNumber: 'K1-AVN-G01',
    description: 'GNSS antenna and receiver with integrated compass on the tail boom, clear of the solar array wiring.',
    position: [0, 0.09, -0.66],
    location: 'Tail boom · top',
    relatedComponents: [],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Constellations', value: 'Multi-constellation (illustrative)' }],
    layer: 'structure',
    explode: [0, 0.4, -0.2],
    explodeDelay: 0.14,
  },
  {
    id: 'antenna-01',
    name: 'Antenna Mast 01',
    category: 'avionics',
    system: 'Communications',
    type: 'Datalink Antenna Mast',
    partNumber: 'K1-AVN-N01',
    description: 'Port datalink antenna mast on the canopy, just ahead of the wing leading edge. The two masts splay apart for antenna diversity.',
    position: [0.03, 0.15, 0.29],
    location: 'Canopy · ahead of wing, port',
    relatedComponents: ['antenna-02', 'avionics-hatch'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Type', value: 'Whip / sleeve dipole (illustrative)' }, { label: 'Mount', value: 'Canopy, splayed pair (from CAD)' }],
    layer: 'structure',
    explode: [0.1, 0.32, 0.05],
    explodeDelay: 0.14,
  },
  {
    id: 'antenna-02',
    name: 'Antenna Mast 02',
    category: 'avionics',
    system: 'Communications',
    type: 'Datalink Antenna Mast',
    partNumber: 'K1-AVN-N02',
    description: 'Starboard datalink antenna mast on the canopy, just ahead of the wing leading edge. The two masts splay apart for antenna diversity.',
    position: [-0.03, 0.15, 0.29],
    location: 'Canopy · ahead of wing, starboard',
    relatedComponents: ['antenna-01', 'avionics-hatch'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Type', value: 'Whip / sleeve dipole (illustrative)' }, { label: 'Mount', value: 'Canopy, splayed pair (from CAD)' }],
    layer: 'structure',
    explode: [-0.1, 0.32, 0.05],
    explodeDelay: 0.14,
  },

  // ───────────────────────── SENSORS
  {
    id: 'pitot',
    name: 'Pitot-Static Probe',
    category: 'sensors',
    system: 'Air Data',
    type: 'Airspeed Probe',
    partNumber: 'K1-SNS-P01',
    description: 'Forward-facing probe under the starboard wing, just outboard of the lift boom, measuring airspeed for fixed-wing flight and transitions.',
    position: [-0.924, wingY(0.924) - 0.03, 0.28],
    location: 'Starboard wing · underside, outboard of boom',
    relatedComponents: ['wing-starboard'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Heating', value: 'Not specified (illustrative)' }],
    layer: 'structure',
    explode: [0.4, -0.15, 0.3],
    explodeDelay: 0.2,
  },
  {
    id: 'nav-lights',
    name: 'Navigation Lights',
    category: 'sensors',
    system: 'Lighting',
    type: 'Position & Anti-collision Lights',
    partNumber: 'K1-SNS-N01',
    description: 'Red (port) and green (starboard) wingtip position lights with a white tail strobe.',
    position: [0, TAIL.finTipY, TAIL.stabTE],
    location: 'Wingtips · tail',
    relatedComponents: ['wing-port', 'wing-starboard', 'vertical-fin'],
    status: 'operational',
    illustrativeSpecifications: [{ label: 'Colours', value: 'Red · green · white strobe (illustrative)' }],
    layer: 'structure',
    explode: [0, 0, 0],
    explodeDelay: 0,
  },

  // ───────────────────────── CAMERA
  {
    id: 'eo-ir',
    name: 'HD40 Gimbal Camera',
    category: 'camera',
    system: 'ISR Imaging',
    type: 'Stabilised EO/IR Gimbal',
    partNumber: 'K1-CAM-E01',
    description: 'HD40 stabilised gimbal camera for full-motion-video ISR, mounted in the payload bay in the underbelly of the fuselage.',
    position: [0, 0.013, -0.167],
    location: 'Fuselage · belly payload bay',
    relatedComponents: ['fuselage'],
    status: 'operational',
    illustrativeSpecifications: [
      P('Missions', 'FMV ISR, SAR, GEOINT (among supported missions)'),
      { label: 'Model', value: 'HD40' },
    ],
    layer: 'structure',
    explode: [0, -0.45, 0],
    explodeDelay: 0.3,
  },

  // ───────────────────────── PAYLOAD

];

export const COMPONENT_MAP: Record<string, DroneComponent> = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]));

export const getComponent = (id: string | null | undefined) => (id ? COMPONENT_MAP[id] : undefined);

export const componentsByCategory = (cat: CategoryId) => COMPONENTS.filter((c) => c.category === cat);

export { ENVELOPE };
