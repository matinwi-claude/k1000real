import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { CATEGORIES, COMPONENTS, getComponent, type DroneComponent } from '../data/components';
import { BOOM, CRUISE, FUSELAGE, LIFT, LIFT_LAYOUT, TAIL, WING, wingStation } from '../data/layout';
import { actions } from '../utils/actions';
import { IconClose, IconEye, IconFocus, IconIsolate } from './Icons';
import { sound } from '../utils/sound';

type Tab = 'overview' | 'technical' | 'location' | 'related' | 'notes';

const STATUS_LABEL: Record<DroneComponent['status'], string> = {
  operational: 'OPERATIONAL',
  attention: 'ATTENTION',
  standby: 'STANDBY',
};

/** Compact technical information panel for the selected component. */
export function ComponentInspector() {
  const selected = useStore((s) => s.selected);
  const engineer = useStore((s) => s.engineer);
  const hidden = useStore((s) => s.hidden);
  const [tab, setTab] = useState<Tab>('overview');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const pnClicks = useRef<number[]>([]);
  const c = getComponent(selected);

  useEffect(() => {
    if (tab === 'notes' && c && !(engineer || revealed[c.id]) ) setTab('overview');
  }, [c, engineer, revealed, tab]);

  if (!c) return null;
  const cat = CATEGORIES.find((x) => x.id === c.category)!;
  const index = COMPONENTS.findIndex((x) => x.id === c.id) + 1;
  const notesAvailable = !!c.hiddenNote && (engineer || revealed[c.id]);
  const tabs: Tab[] = ['overview', 'technical', 'location', 'related', ...(notesAvailable ? (['notes'] as Tab[]) : [])];

  const onPartNumber = () => {
    if (!c.hiddenNote) return;
    const now = performance.now();
    pnClicks.current = [...pnClicks.current.filter((t) => now - t < 1500), now];
    if (pnClicks.current.length >= 3 && !revealed[c.id]) {
      setRevealed({ ...revealed, [c.id]: true });
      setTab('notes');
      useStore.getState().notify('TECHNICAL NOTE UNLOCKED');
      sound.unlock();
    }
  };

  return (
    <aside className="k-inspector panel" key={c.id} aria-label={`${c.name} inspection panel`}>
      <span className="k-callout-anchor" data-callout-anchor />
      <header className="k-insp-head">
        <div className="k-insp-meta">
          <span>
            {cat.code} · {String(index).padStart(2, '0')}/{COMPONENTS.length}
          </span>
          <button className="k-pn" onClick={onPartNumber} title={c.hiddenNote ? 'Part number' : undefined}>
            {c.partNumber}
          </button>
        </div>
        <h2>{c.name.toUpperCase()}</h2>
        <div className="k-insp-system">{c.system.toUpperCase()}</div>
        <button className="k-icon-btn k-insp-close" onClick={() => actions.select(null)} aria-label="Close inspector">
          <IconClose size={15} />
        </button>
      </header>

      <dl className="k-insp-facts">
        <div>
          <dt>Status</dt>
          <dd className={`st-${c.status}`}>
            <i className={`k-dot ${c.status}`} /> {STATUS_LABEL[c.status]}
          </dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{c.location}</dd>
        </div>
        <div>
          <dt>Component Type</dt>
          <dd>{c.type}</dd>
        </div>
      </dl>

      <div className="k-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'related' ? 'RELATED' : t.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="k-tab-body">
        {tab === 'overview' && (
          <>
            <p className="k-desc">{c.description}</p>
            {c.statusNote && <p className="k-note warn">{c.statusNote}</p>}
            <div className="k-insp-actions">
              <button onClick={actions.focusSelected}>
                <IconFocus size={14} /> FOCUS
              </button>
              <button onClick={() => actions.isolate(c.id)}>
                <IconIsolate size={14} /> ISOLATE
              </button>
              <button onClick={actions.hideSelected}>
                <IconEye size={14} off /> HIDE
              </button>
            </div>
            {Object.keys(hidden).length > 0 && (
              <button className="k-link small" onClick={actions.showAll}>
                RESTORE ALL COMPONENTS
              </button>
            )}
          </>
        )}
        {tab === 'technical' && (
          <>
            <table className="k-specs">
              <tbody>
                {c.illustrativeSpecifications.map((s) => (
                  <tr key={s.label} className={s.published ? 'pub' : ''}>
                    <th>
                      {s.label}
                      {s.published && <em className="k-pub">PUBLISHED</em>}
                    </th>
                    <td>{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="k-note">
              <em className="k-pub">PUBLISHED</em> values are from the manufacturer’s public K1000ULE page. All other values are
              illustrative placeholders, not official specifications.
            </p>
          </>
        )}
        {tab === 'location' && <LocationTab c={c} />}
        {tab === 'related' && (
          <ul className="k-related">
            {c.relatedComponents.map((id) => {
              const r = getComponent(id);
              if (!r) return null;
              return (
                <li key={id}>
                  <button
                    onClick={() => actions.select(id, true)}
                    onMouseEnter={() => useStore.setState({ hovered: id, hoverSource: 'ui' })}
                    onMouseLeave={() => useStore.setState({ hovered: null, hoverSource: null })}
                  >
                    <i className={`k-dot ${r.status}`} />
                    <span>{r.name}</span>
                    <small>{r.partNumber}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tab === 'notes' && c.hiddenNote && (
          <div className="k-hidden-note">
            <div className="k-hidden-tag">FIELD NOTE · RESTRICTED</div>
            <p>{c.hiddenNote}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Top-down planform locator with the component marked. */
function LocationTab({ c }: { c: DroneComponent }) {
  const [x, y, z] = c.position;
  const S = 32; // px per metre
  const cx = 90;
  const cy = 62;
  const zc = -0.25;
  const pX = (wx: number) => cx - wx * S; // port (+X) to the left, viewed from above
  const pZ = (wz: number) => cy - (wz - zc) * S; // nose up
  const wingPts: string[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const xx = (i / steps) * WING.halfSpan;
    wingPts.push(`${pX(xx)},${pZ(wingStation(xx).le)}`);
  }
  for (let i = steps; i >= -steps; i--) {
    const xx = (i / steps) * WING.halfSpan;
    wingPts.push(`${pX(xx)},${pZ(wingStation(Math.abs(xx)).te)}`);
  }
  for (let i = -steps; i <= 0; i++) {
    const xx = (i / steps) * WING.halfSpan;
    wingPts.push(`${pX(xx)},${pZ(wingStation(Math.abs(xx)).le)}`);
  }
  return (
    <>
      <div className="k-loc-grid">
        <div>
          <dt>X</dt>
          <dd>{(x * 1000).toFixed(0)} mm</dd>
        </div>
        <div>
          <dt>Y</dt>
          <dd>{(y * 1000).toFixed(0)} mm</dd>
        </div>
        <div>
          <dt>Z</dt>
          <dd>{(z * 1000).toFixed(0)} mm</dd>
        </div>
      </div>
      <svg className="k-locator" viewBox="0 0 180 124" aria-label="Top-down locator">
        <text x="4" y="10">
          TOP · DATUM
        </text>
        <line x1={cx - 86} y1={pZ(0)} x2={cx + 86} y2={pZ(0)} className="axis" />
        <line x1={cx} y1={4} x2={cx} y2={120} className="axis" />
        <polygon points={wingPts.join(' ')} className="body" />
        <rect x={pX(TAIL.stabHalfSpan)} y={pZ(TAIL.stabLE)} width={TAIL.stabHalfSpan * 2 * S} height={(TAIL.stabLE - TAIL.stabTE) * S} className="body" />
        <line x1={cx} y1={pZ(FUSELAGE.podEndZ)} x2={cx} y2={pZ(FUSELAGE.tailEndZ)} className="boom" />
        <ellipse cx={cx} cy={pZ((FUSELAGE.noseZ + FUSELAGE.podEndZ) / 2)} rx={0.088 * S} ry={((FUSELAGE.noseZ - FUSELAGE.podEndZ) / 2) * S} className="body" />
        {[1, -1].map((sd) => (
          <line key={sd} x1={pX(sd * BOOM.x)} y1={pZ(BOOM.frontZ)} x2={pX(sd * BOOM.x)} y2={pZ(BOOM.rearZ)} className="boom" />
        ))}
        {LIFT_LAYOUT.map((a) => (
          <circle key={a.index} cx={pX(a.x)} cy={pZ(a.z)} r={LIFT.propRadius * S} className="disc" />
        ))}
        <line x1={cx - CRUISE.propRadius * S} y1={pZ(CRUISE.z)} x2={cx + CRUISE.propRadius * S} y2={pZ(CRUISE.z)} className="boom" />
        <circle cx={pX(x)} cy={pZ(z)} r={4.5} className="mark-ring" />
        <circle cx={pX(x)} cy={pZ(z)} r={2} className="mark" />
      </svg>
      <div className="k-assembly-path">
        K1000ULE <span>›</span> {CATEGORIES.find((k) => k.id === c.category)?.label} <span>›</span> {c.name}
      </div>
      <p className="k-note">Coordinates relative to the airframe datum at an illustrative scale. +Z forward, +Y up, +X port.</p>
    </>
  );
}
