import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { engineRef } from '../engine/engineRef';

/**
 * First-load sequence: dark screen → drone fades in at a three-quarter view →
 * UI appears → "EXPLORE THE K1000" message fades away (or on first interaction).
 */
export function IntroOverlay() {
  const ready = useStore((s) => s.ready);
  const progress = useStore((s) => s.loadProgress);
  const phase = useStore((s) => s.introPhase);
  const interacted = useStore((s) => s.interacted);
  const [message, setMessage] = useState(false);

  useEffect(() => {
    if (!ready || phase !== 'dark') return;
    const t1 = setTimeout(() => {
      useStore.setState({ introPhase: 'reveal' });
      engineRef.current?.startIntro();
    }, 350);
    return () => clearTimeout(t1);
  }, [ready, phase]);

  useEffect(() => {
    if (phase !== 'reveal') return;
    const t2 = setTimeout(() => useStore.setState({ introPhase: 'done' }), 2200);
    const t3 = setTimeout(() => setMessage(true), 2000);
    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(false), 5200);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (interacted && message) {
      const t = setTimeout(() => setMessage(false), 600);
      return () => clearTimeout(t);
    }
  }, [interacted, message]);

  return (
    <>
      <div className={`k-loader ${phase !== 'dark' ? 'gone' : ''}`} aria-hidden={phase !== 'dark'}>
        <div className="k-loader-inner">
          <div className="k-loader-title">K1000</div>
          <div className="k-loader-sub">ULE · INITIALIZING DIGITAL TWIN</div>
          <div className="k-loader-bar">
            <i style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
          </div>
        </div>
      </div>
      <div className={`k-intro-msg ${message ? 'show' : ''}`} aria-live="polite">
        <div className="k-intro-title">EXPLORE THE K1000ULE</div>
        <div className="k-intro-lines">
          <span>DRAG TO ROTATE</span>
          <span>SCROLL TO ZOOM</span>
          <span>CLICK TO INSPECT</span>
        </div>
      </div>
    </>
  );
}
