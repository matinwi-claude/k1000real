import { useEffect } from 'react';
import { getState, useStore } from '../store';

/** Fade perimeter controls after a few seconds without pointer/keyboard activity. */
export function useIdle(delay = 3800) {
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      if (getState().uiIdle) useStore.setState({ uiIdle: false });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const s = getState();
        if (s.settingsOpen || s.introPhase !== 'done') return wake();
        useStore.setState({ uiIdle: true });
      }, delay);
    };
    const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    wake();
    return () => {
      window.clearTimeout(timer);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [delay]);
}
