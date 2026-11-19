import { create } from 'zustand';

export type InteractionMode = 'explore' | 'inspect';
export type ViewMode = 'exterior' | 'xray';
export type LightingMode = 'studio' | 'sky' | 'night' | 'inspection';
export type Configuration = 'fixed-wing' | 'evtol';
export type PowerOption = 'solar' | 'non-solar';
export type CameraView = 'reset' | 'front' | 'side' | 'top' | 'bottom' | 'rear';

export interface State {
  ready: boolean;
  loadProgress: number;
  /** 'cad' when a real model was loaded from /models/k1000ule.glb */
  modelSource: 'procedural' | 'cad';
  /** running inside another site (?embed=1) */
  embed: boolean;
  /** embeds: zoom/touch control is enabled after the first click/tap */
  activated: boolean;
  /** embeds: timestamp of the last scroll attempt before activation (shows a hint) */
  wheelHint: number;
  contextLost: boolean;
  introPhase: 'dark' | 'reveal' | 'done';
  interacted: boolean;

  mode: InteractionMode;
  hovered: string | null;
  hoverSource: 'canvas' | 'ui' | null;
  selected: string | null;

  explode: number;
  view: ViewMode;
  lighting: LightingMode;
  autoRotate: boolean;
  freeCam: boolean;
  presentation: boolean;
  cinematic: boolean;
  configuration: Configuration;
  /** Build Your Own K1000 */
  buildOpen: boolean;
  power: PowerOption;
  payloads: string[];
  engineer: boolean;
  spinTest: boolean;
  wireframe: boolean;
  sound: boolean;

  hidden: Record<string, boolean>;

  /** Last resting camera pose, serialised for the URL (px,py,pz,tx,ty,tz). */
  camParam: string | null;
  /** One-shot flag: the next selection change should fly the camera to it. */
  focusOnSelect: boolean;

  settingsOpen: boolean;
  embedOpen: boolean;
  uiIdle: boolean;
  toast: { text: string; id: number } | null;

  set: (patch: Partial<State>) => void;
  select: (id: string | null) => void;
  toggleHidden: (id: string) => void;
  setHiddenMany: (ids: string[], hidden: boolean) => void;
  showAll: () => void;
  notify: (text: string) => void;
}

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  ready: false,
  loadProgress: 0,
  modelSource: 'procedural',
  embed: false,
  activated: true,
  wheelHint: 0,
  contextLost: false,
  introPhase: 'dark',
  interacted: false,

  mode: 'explore',
  hovered: null,
  hoverSource: null,
  selected: null,

  explode: 0,
  view: 'exterior',
  lighting: 'studio',
  autoRotate: true,
  freeCam: false,
  presentation: false,
  cinematic: false,
  configuration: 'evtol',
  buildOpen: false,
  power: 'solar',
  payloads: ['eo-ir', 'sar'],
  engineer: false,
  spinTest: false,
  wireframe: false,
  sound: false,

  hidden: {},

  camParam: null,
  focusOnSelect: false,

  settingsOpen: false,
  embedOpen: false,
  uiIdle: false,
  toast: null,

  set: (patch) => set(patch),
  select: (id) => set({ selected: id }),
  toggleHidden: (id) => {
    const hidden = { ...get().hidden };
    if (hidden[id]) delete hidden[id];
    else hidden[id] = true;
    set({ hidden });
  },
  setHiddenMany: (ids, value) => {
    const hidden = { ...get().hidden };
    for (const id of ids) {
      if (value) hidden[id] = true;
      else delete hidden[id];
    }
    set({ hidden });
  },
  showAll: () => set({ hidden: {} }),
  notify: (text) => set({ toast: { text, id: ++toastId } }),
}));

export const getState = () => useStore.getState();
