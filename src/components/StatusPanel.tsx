import { useRef, type MouseEvent } from 'react';
import { useStore, type Configuration } from '../store';
import { sound } from '../utils/sound';

const CONFIGS: { id: Configuration; label: string }[] = [
  { id: 'fixed-wing', label: 'FIXED WING' },
  { id: 'evtol', label: 'eVTOL' },
];

/** Brand mark (links to khaero.com) + configuration picker (top-left). Shift-click the mark ×5 → Engineer Mode. */
export function StatusPanel() {
  const engineer = useStore((s) => s.engineer);
  const configuration = useStore((s) => s.configuration);
  const clicks = useRef<number[]>([]);

  const onLogo = (e: MouseEvent) => {
    if (!e.shiftKey) return; // a plain click follows the link
    e.preventDefault();
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

  return (
    <div className="k-status">
      <a className="k-brand" href="https://www.khaero.com/" target="_blank" rel="noopener" onClick={onLogo} aria-label="K1000ULE · khaero.com">
        <span className="k-brand-mark">K1000ULE</span>
        {engineer && (
          <span className="k-brand-sub">
            <em>ENG</em>
          </span>
        )}
      </a>
      <div className="k-config fade-on-idle" role="radiogroup" aria-labelledby="k-config-title">
        <div className="k-config-title" id="k-config-title">
          CONFIGURATION
        </div>
        {CONFIGS.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={configuration === c.id}
            className={configuration === c.id ? 'on' : ''}
            onClick={() => {
              useStore.setState({ configuration: c.id });
              sound.tick();
            }}
          >
            <i />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Link to the aircraft's product page (bottom-left, sized to match the logo). */
export function ExploreMore() {
  return (
    <a className="k-explore" href="https://www.khaero.com/k1000ule" target="_blank" rel="noopener">
      Explore More <span aria-hidden>↗</span>
    </a>
  );
}

/** Manufacturer logo (bottom-right). */
export function BrandLogo() {
  return <img className="k-maker" src="/brand/kraus-hamdani-aerospace.png" alt="Kraus Hamdani Aerospace" width={601} height={161} />;
}
