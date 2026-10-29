import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { COMPONENTS } from '../data/components';
import { sound } from '../utils/sound';

/** Brand mark + compact system status (top-left). Logo ×5 → Engineer Mode. */
export function StatusPanel() {
  const mode = useStore((s) => s.mode);
  const selected = useStore((s) => s.selected);
  const engineer = useStore((s) => s.engineer);
  const view = useStore((s) => s.view);
  const explode = useStore((s) => s.explode);
  const modelSource = useStore((s) => s.modelSource);
  const [edge, setEdge] = useState<string>('—');
  const clicks = useRef<number[]>([]);

  useEffect(() => {
    let alive = true;
    fetch('/api/status', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : Promise.reject()))
      .then((d: { edge?: string }) => alive && setEdge(d.edge ?? 'EDGE'))
      .catch(() => alive && setEdge('LOCAL'));
    return () => {
      alive = false;
    };
  }, []);

  const onLogo = () => {
    const now = performance.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 1800), now];
    if (clicks.current.length >= 5) {
      clicks.current = [];
      const next = !useStore.getState().engineer;
      useStore.setState({ engineer: next });
      useStore.getState().notify(next ? 'ENGINEER MODE ENABLED' : 'ENGINEER MODE DISABLED');
      sound.unlock();
    }
  };

  const inspection = mode === 'inspect' ? (selected ? 'ACTIVE' : 'ARMED') : mode === 'measure' ? 'MEASURE' : 'READY';
  const config = [explode > 0.01 ? 'EXPLODED' : 'ASSEMBLED', view === 'exterior' ? null : view === 'xray' ? 'X-RAY' : 'INTERNAL']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="k-status">
      <button className="k-brand" onClick={onLogo} aria-label="K1000 Digital Twin">
        <span className="k-brand-mark">K1000</span>
        <span className="k-brand-sub">
          ULE · DIGITAL TWIN{engineer && <em> · ENG</em>}
        </span>
      </button>
      <dl className="k-status-grid fade-on-idle">
        <dt>SYSTEM STATUS</dt>
        <dd>
          <i className="k-dot ok" /> ONLINE
        </dd>
        <dt>AIRFRAME</dt>
        <dd>eVTOL · SOLAR</dd>
        <dt>COMPONENTS</dt>
        <dd>{COMPONENTS.length}</dd>
        <dt>INSPECTION</dt>
        <dd className={inspection !== 'READY' ? 'accent' : ''}>{inspection}</dd>
        <dt>CONFIG</dt>
        <dd>{config}</dd>
        <dt>MODEL</dt>
        <dd>{modelSource === 'cad' ? 'CAD (SUPPLIED)' : 'VISUALIZATION'}</dd>
        <dt>EDGE</dt>
        <dd>{edge}</dd>
      </dl>
    </div>
  );
}
