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
  /** a loose part laid out in a row: its label shares a baseline with the row's other labels */
  row?: boolean;
  /** in portrait, ignore `at` and sit under the part */
  portraitAuto?: boolean;
  align?: 'start' | 'middle' | 'end';
  kind: 'group' | 'detail';
}

const LIFT_PORT = ['boom-port', 'lift-motor-02', 'lift-motor-03', 'lift-prop-02', 'lift-prop-03'];
const LIFT_STBD = ['boom-starboard', 'lift-motor-01', 'lift-motor-04', 'lift-prop-01', 'lift-prop-04'];

export const LABELS: AtlasLabel[] = [
  { kind: 'group', text: 'Portside Wing', ids: ['wing-port', 'solar-port', 'aileron-port'], at: [1330, 248] },
  { kind: 'group', text: 'Starboard Wing', ids: ['wing-starboard', 'solar-starboard', 'aileron-starboard'], at: [70, 690] },
  { kind: 'group', text: 'Center Wing', ids: ['wing-center'], at: [668, 296] },
  { kind: 'group', text: 'VTOL', ids: LIFT_PORT, at: [1085, 452] },
  { kind: 'group', text: 'VTOL', ids: LIFT_STBD, at: [572, 652] },
  {
    kind: 'group',
    text: 'Tail',
    ids: ['tail-boom', 'rudder', 'horizontal-stabilizer', 'elevator', 'solar-tail'],
    at: [646, 178],
  },

  { kind: 'detail', text: 'Battery', ids: ['battery'], row: true },
  { kind: 'detail', text: 'MOD', ids: ['mod'], row: true },
  { kind: 'detail', text: 'HD40 LVV', ids: ['eo-ir'], row: true },
  { kind: 'detail', text: 'SAR', ids: ['sar'], row: true },
  { kind: 'detail', text: 'ATNE', ids: ['atne'], row: true },
  { kind: 'detail', text: 'StarShield', ids: ['starlink'], row: true },
  { kind: 'detail', text: 'Silvus 4200', ids: ['silvus'], row: true },
  { kind: 'detail', text: 'Silvus 4400', ids: ['silvus-4400'], row: true },
];
