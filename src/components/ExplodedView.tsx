import { useStore } from '../store';
import { actions } from '../utils/actions';
import { IconClose } from './Icons';

/** ASSEMBLY slider shown while the drone is (partially) exploded. */
export function ExplodedView() {
  const explode = useStore((s) => s.explode);
  const visible = explode > 0.001;
  return (
    <div className={`k-dock-item k-assembly ${visible ? 'show' : ''}`} aria-hidden={!visible}>
      <div className="k-dock-title">
        <span>ASSEMBLY</span>
        <b>{Math.round(explode * 100)}%</b>
        <button className="k-icon-btn" onClick={() => actions.setExplode(0)} aria-label="Reassemble" tabIndex={visible ? 0 : -1}>
          <IconClose size={13} />
        </button>
      </div>
      <div className="k-slider-row">
        <small>ASSEMBLED</small>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={explode}
          onChange={(e) => actions.setExplode(Number(e.target.value))}
          aria-label="Assembly separation"
          tabIndex={visible ? 0 : -1}
          style={{ ['--v' as string]: `${explode * 100}%` }}
        />
        <small>EXPLODED</small>
      </div>
    </div>
  );
}
