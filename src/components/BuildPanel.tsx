import { useEffect, useRef, useState } from 'react';
import { useStore, type Configuration, type PowerOption } from '../store';
import { COMPONENT_MAP, CATEGORIES } from '../data/components';
import { BUILD_PAYLOADS, flightHours, payloadWeightLb } from '../data/build';
import { IconClose } from './Icons';

type LinePart = {
  id: string;
  d: string;
  dd?: string;
  region?: string;
  box: number[];
};
let lineart: Promise<Map<string, LinePart>> | null = null;
const loadLineart = () => (lineart ??= import('../parts/lineart-payloads.json').then((m) => new Map((m.default.parts as LinePart[]).map((p) => [p.id, p]))));

const CONFIGS: { id: Configuration; label: string }[] = [
  { id: 'fixed-wing', label: 'Fixed Wing' },
  { id: 'evtol', label: 'eVTOL' },
];
const POWER: { id: PowerOption; label: string }[] = [
  { id: 'solar', label: 'Solar' },
  { id: 'non-solar', label: 'Non-Solar' },
];

/** Eases a displayed number toward its target. */
function useTween(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from + (target - from) * e;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Stat({ label, value, unit, digits = 0 }: { label: string; value: number; unit: string; digits?: number }) {
  const v = useTween(value);
  return (
    <div className="k-stat">
      <span>{label}</span>
      <b>
        {v.toLocaleString('en-US', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })}
        <small>{unit}</small>
      </b>
    </div>
  );
}

function Preview({ id }: { id: string }) {
  const [part, setPart] = useState<LinePart | null>(null);
  useEffect(() => {
    let live = true;
    void loadLineart().then((m) => live && setPart(m.get(id) ?? null));
    return () => {
      live = false;
    };
  }, [id]);
  const c = COMPONENT_MAP[id];
  const b = part?.box;
  const pad = b ? 0.14 * Math.max(b[2] - b[0], b[3] - b[1]) : 0;
  return (
    <>
      <div className="k-preview-head">
        <b>{c?.name}</b>
        <span>{CATEGORIES.find((x) => x.id === c?.category)?.label ?? ''}</span>
      </div>
      <div className="k-preview-art">
        {b && (
          <svg viewBox={`${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + pad * 2} ${b[3] - b[1] + pad * 2}`} preserveAspectRatio="xMidYMid meet">
            {part.region && <path className="fill" d={part.region} />}
            {part.dd && <path className="detail" d={part.dd} />}
            <path className="line" d={part.d} />
          </svg>
        )}
      </div>
    </>
  );
}

/** Build Your Own K1000: configuration, power and payload picker with live performance (left side). */
export function BuildPanel() {
  const open = useStore((s) => s.buildOpen);
  const configuration = useStore((s) => s.configuration);
  const power = useStore((s) => s.power);
  const payloads = useStore((s) => s.payloads);
  const [preview, setPreview] = useState<{ id: string; top: number; touch?: boolean } | null>(null);
  const stack = useRef<HTMLDivElement>(null);
  const tapTimer = useRef<number>(0);

  useEffect(() => {
    if (open) void loadLineart();
    else setPreview(null);
  }, [open]);
  if (!open) return null;

  const hours = flightHours(configuration, power, payloads);
  const showPreview = (id: string, el: HTMLElement, touch = false) => {
    const s = stack.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setPreview({ id, top: s ? r.top - s.top : 0, touch });
  };
  const toggle = (id: string) =>
    useStore.setState({
      payloads: payloads.includes(id) ? payloads.filter((p) => p !== id) : [...payloads, id],
    });

  return (
    <div className="k-build-stack" ref={stack}>
      <section className="k-build-stats" aria-live="polite">
        <Stat label="Flight Hours" value={hours} unit="hrs" digits={1} />
        <Stat label="Weight" value={payloadWeightLb(payloads)} unit="lb" digits={1} />
      </section>
      <section className="k-build" aria-label="Build Your Own K1000">
        <header>
          <h3>Build Your Own K1000</h3>
          <button className="k-icon-btn" onClick={() => useStore.setState({ buildOpen: false })} aria-label="Close">
            <IconClose size={13} />
          </button>
        </header>
        <div className="k-build-scroll" onScroll={() => setPreview((p) => (p?.touch ? p : null))}>
          <fieldset>
            <legend>01 · Configuration</legend>
            {CONFIGS.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={configuration === c.id}
                className={`k-opt ${configuration === c.id ? 'on' : ''}`}
                onClick={() => useStore.setState({ configuration: c.id })}
              >
                <i className="dot" />
                {c.label}
              </button>
            ))}
          </fieldset>
          <fieldset>
            <legend>02 · Power</legend>
            {POWER.map((c) => (
              <button key={c.id} role="radio" aria-checked={power === c.id} className={`k-opt ${power === c.id ? 'on' : ''}`} onClick={() => useStore.setState({ power: c.id })}>
                <i className="dot" />
                {c.label}
              </button>
            ))}
          </fieldset>
          {(
            [
              ['radio', '03', 'Radios'],
              ['payload', '04', 'Payloads'],
            ] as const
          ).map(([kind, n, title]) => (
            <fieldset key={kind}>
              <legend>
                {n} · {title}
              </legend>
              {BUILD_PAYLOADS.filter((p) => p.kind === kind).map(({ id }) => {
                const on = payloads.includes(id);
                return (
                  <button
                    key={id}
                    role="checkbox"
                    aria-checked={on}
                    className={`k-opt ${on ? 'on' : ''}`}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && showPreview(id, e.currentTarget)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && setPreview(null)}
                    onFocus={(e) => e.currentTarget.matches(':focus-visible') && showPreview(id, e.currentTarget)}
                    onBlur={() => setPreview((p) => (p?.touch ? p : null))}
                    onClick={(e) => {
                      toggle(id);
                      if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') {
                        showPreview(id, e.currentTarget, true);
                        window.clearTimeout(tapTimer.current);
                        tapTimer.current = window.setTimeout(() => setPreview(null), 3000);
                      }
                    }}
                  >
                    <i className="box" />
                    {COMPONENT_MAP[id]?.name ?? id}
                  </button>
                );
              })}
            </fieldset>
          ))}
        </div>
      </section>
      {preview && (
        <aside className="k-preview" style={{ ['--row' as string]: `${preview.top}px` }} aria-hidden>
          <Preview id={preview.id} />
        </aside>
      )}
    </div>
  );
}
