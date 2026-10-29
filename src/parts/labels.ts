/**
 * Labels for the 2D parts atlas, in drawing (viewBox) coordinates of lineart.json.
 * Group labels name an assembly and highlight every part in `ids`; detail labels sit
 * under the enlarged loose parts (position defaults to just below the part).
 */
export interface AtlasLabel {
  text: string;
  sub?: string;
  ids: string[];
  at?: [number, number];
  /** position in the portrait (phone) drawing; aircraft labels share coordinates in both */
  atPortrait?: [number, number];
  /** in portrait, ignore `at` and sit under the part */
  portraitAuto?: boolean;
  align?: 'start' | 'middle' | 'end';
  kind: 'group' | 'detail';
}

const LIFT_PORT = ['boom-port', 'lift-motor-02', 'lift-motor-03', 'lift-prop-02', 'lift-prop-03', 'gear-port'];
const LIFT_STBD = ['boom-starboard', 'lift-motor-01', 'lift-motor-04', 'lift-prop-01', 'lift-prop-04', 'gear-starboard'];

export const LABELS: AtlasLabel[] = [
  { kind: 'group', text: 'Outer Wing', sub: 'Port · solar', ids: ['wing-port', 'solar-port', 'aileron-port'], at: [1330, 248] },
  { kind: 'group', text: 'Outer Wing', sub: 'Starboard · solar', ids: ['wing-starboard', 'solar-starboard', 'aileron-starboard'], at: [70, 690] },
  { kind: 'group', text: 'Centre Wing', sub: 'SATCOM dome', ids: ['wing-center', 'satcom'], at: [668, 296] },
  { kind: 'group', text: 'VTOL', sub: 'Lift boom · port', ids: LIFT_PORT, at: [1238, 478] },
  { kind: 'group', text: 'VTOL', sub: 'Lift boom · starboard', ids: LIFT_STBD, at: [700, 700] },
  {
    kind: 'group',
    text: 'T-Tail',
    sub: 'Solar stabiliser',
    ids: ['vertical-fin', 'rudder', 'horizontal-stabilizer', 'elevator', 'solar-tail', 'nav-lights'],
    at: [706, 178],
  },
  {
    kind: 'group',
    text: 'Fuselage',
    sub: 'Canopy · masts',
    ids: ['fuselage', 'avionics-hatch', 'antenna-01', 'antenna-02', 'tail-boom', 'gnss', 'payload-bay', 'belly-skid', 'lidar-down', 'pitot'],
    at: [962, 458],
  },
  { kind: 'group', text: 'Cruise', sub: 'Electric tractor', ids: ['nose-cone', 'cruise-motor', 'cruise-prop'], at: [1112, 640] },
  { kind: 'group', text: 'Avionics', ids: ['flight-controller', 'companion-computer', 'datalink'], at: [160, 92], atPortrait: [193, 945] },
  {
    kind: 'group',
    text: 'Power',
    ids: ['battery', 'mppt', 'power-distribution', 'cruise-esc', 'esc-01', 'esc-02', 'esc-03', 'esc-04'],
    at: [1012, 728],
    atPortrait: [305, 1778],
  },
  { kind: 'group', text: 'Payload', ids: ['eo-ir', 'gimbal', 'payload-module'], at: [412, 718], atPortrait: [183, 1252] },

  { kind: 'detail', text: 'Flight Controller', ids: ['flight-controller'] },
  { kind: 'detail', text: 'Mission Computer', ids: ['companion-computer'] },
  { kind: 'detail', text: 'LOS Datalink', ids: ['datalink'] },
  { kind: 'detail', text: 'Flight Battery', ids: ['battery'] },
  { kind: 'detail', text: 'Solar MPPT', ids: ['mppt'] },
  { kind: 'detail', text: 'Power Distribution', ids: ['power-distribution'] },
  { kind: 'detail', text: 'Cruise ESC', ids: ['cruise-esc'] },
  { kind: 'detail', text: 'Lift ESC ×4', ids: ['esc-01', 'esc-02', 'esc-03', 'esc-04'], at: [1330, 950], atPortrait: [800, 2262] },
  { kind: 'detail', text: 'Gimbal Mount', ids: ['gimbal'], at: [500, 776], atPortrait: [356, 1372], align: 'start' },
  { kind: 'detail', text: 'EO/IR Turret', ids: ['eo-ir'] },
  { kind: 'detail', text: 'Mission Payload', ids: ['payload-module'] },
];
