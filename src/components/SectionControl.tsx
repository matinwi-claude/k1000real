import { useStore, type SectionAxis } from '../store';
import { actions } from '../utils/actions';
import { IconClose } from './Icons';

const AXES: SectionAxis[] = ['top', 'side', 'front'];
/** must match SECTION_RANGE in DroneEngine (metres → mm) */
const SECTION_RANGE_MM = { top: 150, side: 2600, front: 1300 } as const;
const SECTION_BASE_MM = { top: 50, side: 0, front: -250 } as const;

/** Cross-section plane chooser + cut-position slider. */
export function SectionControl() {
  const section = useStore((s) => s.section);
  const offset = useStore((s) => s.sectionOffset);
  const visible = !!section;
  const range = section ? SECTION_RANGE_MM[section] : 0;
  return (
    <div className={`k-dock-item k-section ${visible ? 'show' : ''}`} aria-hidden={!visible}>
      <div className="k-dock-title">
        <span>CROSS-SECTION</span>
        <div className="k-seg">
          {AXES.map((a) => (
            <button key={a} className={section === a ? 'on' : ''} onClick={() => useStore.setState({ section: a })} tabIndex={visible ? 0 : -1}>
              {a.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="k-icon-btn" onClick={() => actions.toggleSection()} aria-label="Close section" tabIndex={visible ? 0 : -1}>
          <IconClose size={13} />
        </button>
      </div>
      <div className="k-slider-row">
        <small>CUT</small>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.001}
          value={offset}
          onChange={(e) => actions.setSectionOffset(Number(e.target.value))}
          aria-label="Cut position"
          tabIndex={visible ? 0 : -1}
          style={{ ['--v' as string]: `${((offset + 1) / 2) * 100}%` }}
        />
        <small className="mono">{(SECTION_BASE_MM[section ?? 'top'] + offset * range).toFixed(0).padStart(5, ' ')} mm</small>
      </div>
    </div>
  );
}
