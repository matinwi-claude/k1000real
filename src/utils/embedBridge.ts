/**
 * postMessage bridge for embedded viewers.
 *
 * Host page → viewer:   iframe.contentWindow.postMessage({ k1000: 'select', value: 'battery' }, '*')
 * Viewer → host page:   { k1000: 'ready' | 'select' | 'state', ... }
 *
 * Commands are harmless view changes on a read-only visualization, so any origin may
 * send them. See EMBED.md for the full list.
 */
import { getState, useStore, type CameraView, type LightingMode, type SectionAxis } from '../store';
import { COMPONENT_MAP, getComponent } from '../data/components';
import { engineRef } from '../engine/engineRef';
import { actions } from './actions';

type Msg = { k1000?: string; value?: unknown };

const VIEWS: CameraView[] = ['reset', 'front', 'side', 'top', 'bottom', 'rear'];
const LIGHTS: LightingMode[] = ['studio', 'technical', 'night', 'inspection'];

function post(data: Record<string, unknown>) {
  if (window.parent === window) return;
  window.parent.postMessage({ k1000: data.k1000, ...data }, '*');
}

function handle(cmd: string, value: unknown) {
  const set = useStore.setState;
  switch (cmd) {
    case 'select': {
      const id = typeof value === 'string' && COMPONENT_MAP[value] ? value : null;
      set({ selected: id, focusOnSelect: !!id, interacted: true, autoRotate: false });
      return;
    }
    case 'view':
      if (VIEWS.includes(value as CameraView)) actions.cameraView(value as CameraView);
      return;
    case 'explode':
      set({ explode: Math.min(1, Math.max(0, Number(value) || 0)), interacted: true });
      return;
    case 'mode':
      if (value === 'inspect' || value === 'measure' || value === 'explore') set({ mode: value });
      return;
    case 'xray':
      set({ view: value ? 'xray' : 'exterior' });
      return;
    case 'internal':
      set({ view: value ? 'internal' : 'exterior' });
      return;
    case 'section':
      set({ section: (['top', 'side', 'front'] as const).includes(value as SectionAxis) ? (value as SectionAxis) : null });
      return;
    case 'lighting':
      if (LIGHTS.includes(value as LightingMode)) set({ lighting: value as LightingMode });
      return;
    case 'overlay':
      set({ overlay: !!value });
      return;
    case 'autoRotate':
      set({ autoRotate: !!value });
      return;
    case 'reset':
      set({ selected: null, explode: 0, view: 'exterior', section: null, mode: 'explore', overlay: false, hidden: {} });
      engineRef.current?.setCameraView('reset');
      return;
  }
}

export function initEmbedBridge() {
  if (window.parent === window) return;
  window.addEventListener('message', (e: MessageEvent<Msg>) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || typeof d.k1000 !== 'string') return;
    handle(d.k1000, d.value);
  });
  useStore.subscribe((s, p) => {
    if (s.ready && !p.ready) post({ k1000: 'ready', components: Object.keys(COMPONENT_MAP) });
    if (s.selected !== p.selected) {
      const c = getComponent(s.selected);
      post({ k1000: 'select', id: s.selected, name: c?.name ?? null, category: c?.category ?? null });
    }
    if (s.explode !== p.explode || s.view !== p.view || s.mode !== p.mode || s.lighting !== p.lighting) {
      post({ k1000: 'state', explode: s.explode, view: s.view, mode: s.mode, lighting: s.lighting });
    }
  });
  void getState;
}
