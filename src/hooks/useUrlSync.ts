import { useEffect } from 'react';
import { useStore } from '../store';
import { writeUrlState } from '../utils/url';

/** Mirror shareable state into the URL (debounced, replaceState only). */
export function useUrlSync() {
  useEffect(() => {
    // embedded viewers never rewrite their URL (the host page owns navigation)
    if (useStore.getState().embed) return;
    let t = 0;
    const unsub = useStore.subscribe((s, p) => {
      if (
        s.mode === p.mode &&
        s.selected === p.selected &&
        s.explode === p.explode &&
        s.view === p.view &&
        s.lighting === p.lighting &&
        s.section === p.section &&
        s.sectionOffset === p.sectionOffset &&
        s.overlay === p.overlay &&
        s.presentation === p.presentation &&
        s.camParam === p.camParam
      )
        return;
      window.clearTimeout(t);
      t = window.setTimeout(() => writeUrlState(useStore.getState()), 300);
    });
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);
}
