import type { InteractionMode, LightingMode, SectionAxis, State, ViewMode } from '../store';
import { COMPONENT_MAP } from '../data/components';

/**
 * Shareable URL state. Supported params:
 *   mode=inspection|measure     component=motor-04
 *   view=exploded,internal|xray explode=0..1
 *   light=studio|technical|night|inspection
 *   section=top|side|front      cut=-1..1
 *   overlay=1  present=1  cam=px,py,pz,tx,ty,tz
 */
export function readUrlState(search = window.location.search): Partial<State> {
  const q = new URLSearchParams(search);
  const out: Partial<State> = {};
  const mode = q.get('mode');
  if (mode === 'inspection' || mode === 'inspect') out.mode = 'inspect';
  else if (mode === 'measure') out.mode = 'measure' as InteractionMode;
  const comp = q.get('component');
  if (comp && COMPONENT_MAP[comp]) out.selected = comp;
  const views = (q.get('view') ?? '').split(',').map((v) => v.trim().toLowerCase());
  if (views.includes('exploded')) out.explode = 1;
  if (views.includes('internal')) out.view = 'internal' as ViewMode;
  if (views.includes('xray') || views.includes('x-ray')) out.view = 'xray';
  const ex = q.get('explode');
  if (ex !== null && Number.isFinite(Number(ex))) out.explode = Math.min(1, Math.max(0, Number(ex)));
  const light = q.get('light') as LightingMode | null;
  if (light && ['studio', 'technical', 'night', 'inspection'].includes(light)) out.lighting = light;
  const section = q.get('section') as SectionAxis | null;
  if (section && ['top', 'side', 'front'].includes(section)) out.section = section;
  const cut = q.get('cut');
  if (cut !== null && Number.isFinite(Number(cut))) out.sectionOffset = Math.min(1, Math.max(-1, Number(cut)));
  if (q.get('overlay') === '1') out.overlay = true;
  if (q.get('present') === '1') out.presentation = true;
  const cam = q.get('cam');
  if (cam) out.camParam = cam;
  if (Object.keys(out).length > 0) out.autoRotate = false;
  // presentation options that should not stop the idle rotation
  if (q.get('embed') === '1') {
    out.embed = true;
    out.activated = false;
  }
  if (q.get('autorotate') === '0') out.autoRotate = false;
  if (q.get('autorotate') === '1') out.autoRotate = true;
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) out.autoRotate = false;
  if (out.camParam || out.selected) out.interacted = true;
  return out;
}

export function writeUrlState(s: State) {
  const q = new URLSearchParams();
  if (s.mode === 'inspect') q.set('mode', 'inspection');
  if (s.mode === 'measure') q.set('mode', 'measure');
  if (s.selected) q.set('component', s.selected);
  const views: string[] = [];
  if (s.explode >= 0.999) views.push('exploded');
  if (s.view === 'internal') views.push('internal');
  if (s.view === 'xray') views.push('xray');
  if (views.length) q.set('view', views.join(','));
  if (s.explode > 0.001 && s.explode < 0.999) q.set('explode', s.explode.toFixed(2));
  if (s.lighting !== 'studio') q.set('light', s.lighting);
  if (s.section) {
    q.set('section', s.section);
    if (Math.abs(s.sectionOffset) > 0.001) q.set('cut', s.sectionOffset.toFixed(2));
  }
  if (s.overlay) q.set('overlay', '1');
  if (s.presentation) q.set('present', '1');
  if (s.camParam && s.interacted) q.set('cam', s.camParam);
  const str = q.toString().replace(/%2C/g, ',');
  const next = `${window.location.pathname}${str ? `?${str}` : ''}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', next);
  }
}
