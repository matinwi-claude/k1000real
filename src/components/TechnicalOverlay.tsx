import { useStore } from '../store';
import { AIRCRAFT } from '../data/components';

/**
 * Screen-frame elements of the TECH OVERLAY (the 3D centerlines, rotor discs,
 * dimensions and labels are drawn by the engine). Adds subtle edge rulers,
 * a reticle and a legend — never covering the drone.
 */
export function TechnicalOverlay() {
  const on = useStore((s) => s.overlay);
  const presentation = useStore((s) => s.presentation);
  const cinematic = useStore((s) => s.cinematic);
  const show = on && !presentation && !cinematic;
  return (
    <div className={`k-techframe ${show ? 'show' : ''}`} aria-hidden>
      <div className="k-ruler top" />
      <div className="k-ruler bottom" />
      <div className="k-ruler left" />
      <div className="k-ruler right" />
      <div className="k-reticle" />
      <div className="k-legend">
        <div>
          <i className="sw center" /> CENTERLINE
        </div>
        <div>
          <i className="sw disc" /> ROTOR DISCS
        </div>
        <div>
          <i className="sw dim" /> ENVELOPE (ILLUSTRATIVE)
        </div>
        <div className="mono dim">GRID 250 mm · RING 1 m · SCALE ILLUSTRATIVE</div>
        <div className="k-legend-facts">
          <div>
            {AIRCRAFT.name} · <em className="k-pub">PUBLISHED</em>
          </div>
          {AIRCRAFT.published.slice(0, 6).map((f) => (
            <div key={f.label}>
              {f.label.toUpperCase()} <b>{f.value}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Corner frame marks that give the viewport its instrument feel. */
export function FrameMarks() {
  return (
    <div className="k-frame fade-on-idle" aria-hidden>
      <i className="tl" />
      <i className="tr" />
      <i className="bl" />
      <i className="br" />
    </div>
  );
}
