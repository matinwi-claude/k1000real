import { useStore } from '../store';
import { actions } from '../utils/actions';
import { engineRef } from '../engine/engineRef';
import { IconClose, IconMeasure } from './Icons';

/** Measurement list + controls; the lines themselves are drawn by the engine HUD. */
export function MeasurementTool() {
  const mode = useStore((s) => s.mode);
  const list = useStore((s) => s.measurements);
  const pending = useStore((s) => s.measurePending);
  if (mode !== 'measure' && list.length === 0) return null;
  return (
    <div className="k-measure panel">
      <div className="k-panel-title">
        <IconMeasure size={14} />
        <span>MEASUREMENT</span>
        {mode === 'measure' && (
          <button className="k-icon-btn" onClick={() => actions.setMode('measure')} aria-label="Exit measure mode">
            <IconClose size={13} />
          </button>
        )}
      </div>
      {mode === 'measure' && <p className="k-measure-hint">{pending ? 'SELECT SECOND POINT' : 'CLICK A POINT ON THE DRONE'}</p>}
      {list.length > 0 && (
        <ul className="k-measure-list">
          {list.map((m) => (
            <li key={m.id}>
              <span className="mono dim">M{String(m.id).padStart(2, '0')}</span>
              <span className="mono">{m.distanceMm.toFixed(m.distanceMm < 100 ? 1 : 0)} mm</span>
              <button className="k-icon-btn" onClick={() => engineRef.current?.removeMeasurement(m.id)} aria-label={`Remove measurement ${m.id}`}>
                <IconClose size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <button className="k-btn-line" onClick={actions.clearMeasurements}>
          CLEAR MEASUREMENTS
        </button>
      )}
      <p className="k-note">Distances from illustrative geometry.</p>
    </div>
  );
}
