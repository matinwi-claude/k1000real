import { getState, useStore, type CameraView, type InteractionMode, type LightingMode, type SectionAxis, type ViewMode } from '../store';
import { engineRef } from '../engine/engineRef';
import { COMPONENTS, getComponent } from '../data/components';
import { sound } from './sound';

const set = useStore.setState;
const LIGHTS: LightingMode[] = ['studio', 'technical', 'night', 'inspection'];

/** UI + keyboard actions shared across controls. */
export const actions = {
  setMode(mode: InteractionMode) {
    const cur = getState().mode;
    const next = cur === mode ? 'explore' : mode;
    set({ mode: next, interacted: true });
    sound.mode();
    if (next === 'measure') getState().notify('MEASURE · CLICK TWO POINTS ON THE DRONE');
    if (next === 'inspect') getState().notify('INSPECTION MODE · CLICK ANY COMPONENT');
  },
  toggleExplode() {
    const out = getState().explode < 0.5;
    set({ explode: out ? 1 : 0, interacted: true, autoRotate: false });
    sound.explode(out);
  },
  setExplode(v: number) {
    set({ explode: v, interacted: true });
  },
  toggleView(v: ViewMode) {
    const cur = getState().view;
    set({ view: cur === v ? 'exterior' : v, interacted: true });
    sound.toggle();
  },
  toggleSection(axis?: SectionAxis) {
    const cur = getState().section;
    if (axis) set({ section: cur === axis ? null : axis });
    else set({ section: cur ? null : 'top' });
    set({ interacted: true });
    sound.toggle();
  },
  setSectionOffset(v: number) {
    set({ sectionOffset: v });
  },
  toggleOverlay() {
    set({ overlay: !getState().overlay, interacted: true });
    sound.toggle();
  },
  setLighting(l: LightingMode) {
    set({ lighting: l });
    sound.mode();
  },
  cycleLighting() {
    const i = LIGHTS.indexOf(getState().lighting);
    const next = LIGHTS[(i + 1) % LIGHTS.length];
    set({ lighting: next });
    getState().notify(`LIGHTING · ${next.toUpperCase()}`);
    sound.mode();
  },
  toggleAutoRotate() {
    set({ autoRotate: !getState().autoRotate });
    sound.toggle();
  },
  toggleFreeCam() {
    const next = !getState().freeCam;
    set({ freeCam: next, autoRotate: false, settingsOpen: false, treeOpen: false, interacted: true });
    if (next) getState().notify('FREE CAM · WASD MOVE · Q / E ELEVATE · ESC EXIT');
    sound.mode();
  },
  togglePresentation() {
    const next = !getState().presentation;
    set({ presentation: next, settingsOpen: false, autoRotate: next ? true : getState().autoRotate });
    sound.mode();
  },
  cameraView(v: CameraView) {
    engineRef.current?.setCameraView(v);
    set({ autoRotate: false, interacted: true });
    sound.tick();
  },
  select(id: string | null, focus = false) {
    set({ selected: id, focusOnSelect: focus && !!id, interacted: true, autoRotate: false });
    if (id) sound.select();
  },
  focusSelected() {
    const id = getState().selected;
    if (id) engineRef.current?.focusComponent(id);
  },
  hideSelected() {
    const id = getState().selected;
    if (!id) return;
    getState().toggleHidden(id);
    set({ selected: null });
    getState().notify(`${getComponent(id)?.name.toUpperCase()} HIDDEN`);
  },
  isolate(id: string) {
    const st = getState();
    const comp = getComponent(id);
    const keep = new Set([id, ...(comp?.relatedComponents ?? [])]);
    const hidden: Record<string, boolean> = {};
    for (const c of COMPONENTS) if (!keep.has(c.id)) hidden[c.id] = true;
    // isolating something that lives inside the shell would otherwise look empty
    set({ hidden });
    st.notify(`ISOLATED · ${comp?.name.toUpperCase()} + RELATED`);
    sound.toggle();
  },
  showAll() {
    getState().showAll();
    sound.toggle();
  },
  toggleSound() {
    const next = !getState().sound;
    set({ sound: next });
    if (next) sound.confirm();
  },
  async copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      getState().notify('LINK COPIED · CURRENT INSPECTION STATE');
    } catch {
      getState().notify('COPY FAILED — USE THE ADDRESS BAR');
    }
  },
  clearMeasurements() {
    set({ measurements: [], measurePending: false });
    sound.tick();
  },
  /** ESC: unwind the most specific state first. */
  escape() {
    const s = getState();
    if (s.cinematic) return set({ cinematic: false });
    if (s.presentation) return set({ presentation: false });
    if (s.freeCam) return set({ freeCam: false });
    if (s.embedOpen) return set({ embedOpen: false });
    if (s.settingsOpen) return set({ settingsOpen: false });
    if (s.mode === 'measure' && s.measurePending) {
      set({ mode: 'explore' });
      return;
    }
    if (s.selected) return set({ selected: null });
    if (s.mode !== 'explore') return set({ mode: 'explore' });
    if (s.treeOpen) return set({ treeOpen: false });
  },
};
