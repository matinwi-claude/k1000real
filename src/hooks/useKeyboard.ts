import { useEffect } from 'react';
import { getState, useStore } from '../store';
import { actions } from '../utils/actions';
import { sound } from '../utils/sound';

const SECRET = 'k1000';

/** Global keyboard shortcuts + the typed "k1000" cinematic Easter egg. */
export function useKeyboard() {
  useEffect(() => {
    let buffer = '';
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      buffer = (buffer + k).slice(-SECRET.length);
      if (buffer === SECRET) {
        buffer = '';
        useStore.setState({ cinematic: true, settingsOpen: false, treeOpen: false, selected: null, interacted: true, autoRotate: false });
        getState().notify('CINEMATIC SEQUENCE');
        sound.unlock();
        return;
      }
      if (k === 'escape') return actions.escape();
      const s = getState();
      if (s.cinematic) return;
      if (s.freeCam && 'wasdqe'.includes(k)) return; // reserved for flying
      switch (k) {
        case '1': return actions.cameraView('reset');
        case '2': return actions.cameraView('front');
        case '3': return actions.cameraView('side');
        case '4': return actions.cameraView('top');
        case '5': return actions.cameraView('bottom');
        case 'e': return actions.toggleExplode();
        case 'i': return actions.setMode('inspect');
        case 'm': return actions.setMode('measure');
        case 't': return actions.toggleView('internal');
        case 'x': return actions.toggleView('xray');
        case 's': return actions.toggleSection();
        case 'o': return actions.toggleOverlay();
        case 'l': return actions.cycleLighting();
        case 'r': return actions.toggleAutoRotate();
        case 'c': return actions.toggleFreeCam();
        case 'p': return actions.togglePresentation();
        case 'f': return actions.focusSelected();
        case 'h': return actions.hideSelected();
        case 'b': return useStore.setState({ treeOpen: !s.treeOpen });
        case '?': return useStore.setState({ settingsOpen: !s.settingsOpen });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
