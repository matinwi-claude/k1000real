/**
 * Labels for the 2D parts atlas, in drawing (viewBox) coordinates of lineart.json.
 * Group labels name an assembly and highlight every part in `ids`; detail labels sit
 * under a loose part (position defaults to just below the part). Payloads and radios are not in the
 * drawing: they live in the side panel (lineart-payloads.json).
 */
export interface AtlasLabel {
  text: string;
  sub?: string;
  ids: string[];
  at?: [number, number];
  align?: 'start' | 'middle' | 'end';
  kind: 'group' | 'detail';
}

const LIFT_PORT = ['boom-port', 'lift-motor-02', 'lift-motor-03', 'lift-prop-02', 'lift-prop-03'];
const LIFT_STBD = ['boom-starboard', 'lift-motor-01', 'lift-motor-04', 'lift-prop-01', 'lift-prop-04'];

export const LABELS: AtlasLabel[] = [
  { kind: 'group', text: 'Portside Wing', ids: ['wing-port', 'solar-port', 'aileron-port'], at: [1348, 251] },
  { kind: 'group', text: 'Starboard Wing', ids: ['wing-starboard', 'solar-starboard', 'aileron-starboard'], at: [70, 699] },
  { kind: 'group', text: 'Center Wing', ids: ['wing-center'], at: [677, 299] },
  { kind: 'group', text: 'VTOL', ids: LIFT_PORT, at: [1069, 458] },
  { kind: 'group', text: 'VTOL', ids: LIFT_STBD, at: [549, 660] },
  {
    kind: 'group',
    text: 'Tail',
    ids: ['tail-boom', 'rudder', 'horizontal-stabilizer', 'elevator', 'solar-tail'],
    at: [654, 180],
  },

  { kind: 'detail', text: 'Battery', ids: ['battery'] },
];
