import { useEffect } from 'react';
import { useStore } from '../store';
import { engineRef } from '../engine/engineRef';

/**
 * First-load sequence: dark screen → drone fades in at a three-quarter view →
 * UI appears.
 */
export function IntroOverlay() {
  const ready = useStore((s) => s.ready);
  const progress = useStore((s) => s.loadProgress);
  const phase = useStore((s) => s.introPhase);

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
    return () => clearTimeout(t2);
  }, [phase]);

  return (
    <div className={`k-loader ${phase !== 'dark' ? 'gone' : ''}`} aria-hidden={phase !== 'dark'}>
      <div className="k-loader-inner">
        <div className="k-loader-title">K1000</div>
        <div className="k-loader-bar">
          <i style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
        </div>
      </div>
    </div>
  );
}
