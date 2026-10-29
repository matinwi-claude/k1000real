import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LABELS, type AtlasLabel } from './labels';
import { AIRCRAFT, CATEGORIES, COMPONENTS, COMPONENT_MAP, type CategoryId, type DroneComponent } from '../data/components';
import { EmbedCodeDialog } from '../components/EmbedCodeDialog';
import { IconClose, IconEmbed } from '../components/Icons';

interface Part {
  id: string;
  d: string;
  dd?: string;
  region: string;
  c: [number, number] | null;
  box: [number, number, number, number] | null;
}

export interface LineArt {
  variant: 'landscape' | 'portrait';
  viewBox: number[];
  parts: Part[];
}

const CAT_ORDER = CATEGORIES.map((c) => c.id);
const ORDER: string[] = COMPONENTS.filter((c) => !['fasteners', 'wiring-harness', 'wing-spar'].includes(c.id))
  .sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || COMPONENTS.indexOf(a) - COMPONENTS.indexOf(b))
  .map((c) => c.id);
const CAT_COUNT = Object.fromEntries(CATEGORIES.map((c) => [c.id, ORDER.filter((id) => COMPONENT_MAP[id].category === c.id).length]));

// ───────────────────────────────────────────── URL options (also used when embedded)
const params = new URLSearchParams(window.location.search);
const EMBED = params.get('embed') === '1' || window.self !== window.top;
const HEX = /^[0-9a-f]{3,8}$/i;
const opt = {
  light: params.get('theme') === 'light',
  accent: HEX.test(params.get('accent') ?? '') ? `#${params.get('accent')}` : null,
  ink: HEX.test(params.get('ink') ?? '') ? `#${params.get('ink')}` : null,
  labels: params.get('labels') !== '0',
  component: COMPONENT_MAP[params.get('component') ?? ''] ? params.get('component') : null,
  category: CAT_ORDER.includes(params.get('category') as CategoryId) ? (params.get('category') as CategoryId) : null,
};
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function post(data: Record<string, unknown>) {
  if (window.parent !== window) window.parent.postMessage(data, '*');
}

interface View {
  k: number;
  x: number;
  y: number;
}

type PartState = '' | 'hi' | 'sel' | 'rel' | 'dim';

/** One component of the drawing. */
const PartShape = memo(function PartShape({ p, state, dotR, delay }: { p: Part; state: PartState; dotR: number; delay: number }) {
  const c = COMPONENT_MAP[p.id];
  const small = p.box ? Math.max(p.box[2] - p.box[0], p.box[3] - p.box[1]) < 26 : true;
  return (
    <g
      className={`pa-part ${state}`}
      data-part={p.id}
      tabIndex={0}
      role="button"
      aria-label={`${c.name}, ${c.partNumber}`}
      aria-pressed={state === 'sel'}
      style={{ animationDelay: `${delay}s` }}
    >
      {p.region && <path className="pa-fill" d={p.region} />}
      {p.dd && <path className="pa-detail" d={p.dd} />}
      <path className="pa-line" d={p.d} />
      <path className="pa-hit" d={p.d} />
      {small && p.c && <circle className="pa-hitdot" cx={p.c[0]} cy={p.c[1]} r={dotR} />}
    </g>
  );
});

export function PartsApp({ art }: { art: LineArt }) {
  const [VW, VH] = art.viewBox;
  const PARTS = useMemo(() => art.parts.filter((p) => COMPONENT_MAP[p.id] && p.d), [art]);
  const PART_MAP = useMemo(() => Object.fromEntries(PARTS.map((p) => [p.id, p])) as Record<string, Part>, [PARTS]);
  const portrait = art.variant === 'portrait';
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(opt.component);
  const [hoverPart, setHoverPart] = useState<string | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<CategoryId | null>(opt.category);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [active, setActive] = useState(!EMBED);
  const [hint, setHint] = useState(false);
  const [gesturing, setGesturing] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  // ── layout: fit the drawing into the container, then apply zoom / pan
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const compact = size.w < 720;
  // the drawing makes room for the details panel (side drawer, or bottom sheet on phones)
  const panelOpen = !!selected;
  const top = compact ? 56 : 72;
  const bottom = compact ? (panelOpen ? Math.round(size.h * 0.62) : 64) : 64;
  const side = compact ? 8 : 28;
  const right = !compact && panelOpen && size.w > 900 ? 372 : 0;
  const s0 = Math.min((size.w - side * 2 - right) / VW, (size.h - top - bottom) / VH);
  const t0x = (size.w - right - VW * s0) / 2;
  const t0y = top + (size.h - top - bottom - VH * s0) / 2;
  const s = s0 * view.k;
  const tx = t0x * view.k + view.x;
  const ty = t0y * view.k + view.y;
  const toScreen = useCallback((p: [number, number]) => [p[0] * s + tx, p[1] * s + ty] as const, [s, tx, ty]);

  const zoomAt = useCallback(
    (qx: number, qy: number, f: number) => {
      const v = viewRef.current;
      const k = Math.min(8, Math.max(1, v.k * f));
      if (k === 1) return setView({ k: 1, x: 0, y: 0 });
      // keep the drawing point under (qx, qy) fixed
      const bx = t0x * v.k + v.x, by = t0y * v.k + v.y;
      const nx = qx - ((qx - bx) * k) / v.k, ny = qy - ((qy - by) * k) / v.k;
      setView({ k, x: nx - t0x * k, y: ny - t0y * k });
    },
    [t0x, t0y],
  );

  // ── selection + bridge
  const select = useCallback((id: string | null) => {
    setSelected(id);
    setTip(null);
  }, []);
  useEffect(() => {
    const c = selected ? COMPONENT_MAP[selected] : null;
    post({ k1000: 'select', id: selected, name: c?.name ?? null, category: c?.category ?? null });
  }, [selected]);
  useEffect(() => {
    post({ k1000: 'ready', components: ORDER, page: 'parts' });
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { k1000?: string; value?: unknown };
      if (!d || typeof d !== 'object' || typeof d.k1000 !== 'string') return;
      if (d.k1000 === 'select') select(typeof d.value === 'string' && ORDER.includes(d.value) ? d.value : null);
      if (d.k1000 === 'category') setFilter(CAT_ORDER.includes(d.value as CategoryId) ? (d.value as CategoryId) : null);
      if (d.k1000 === 'reset') {
        select(null);
        setFilter(null);
        setView({ k: 1, x: 0, y: 0 });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [select]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const list = filter ? ORDER.filter((id) => COMPONENT_MAP[id].category === filter) : ORDER;
      const i = selected ? list.indexOf(selected) : -1;
      select(list[(i + dir + list.length) % list.length]);
    },
    [filter, selected, select],
  );

  // ── keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') {
        if (embedOpen) setEmbedOpen(false);
        else if (selected) select(null);
        else if (filter) setFilter(null);
        else setView({ k: 1, x: 0, y: 0 });
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (selected) { e.preventDefault(); step(1); }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (selected) { e.preventDefault(); step(-1); }
      } else if (e.key === '+' || e.key === '=') zoomAt(size.w / 2, size.h / 2, 1.3);
      else if (e.key === '-') zoomAt(size.w / 2, size.h / 2, 1 / 1.3);
      else if (e.key === '0') setView({ k: 1, x: 0, y: 0 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embedOpen, selected, filter, step, select, zoomAt, size]);

  // ── wheel zoom (embedded: only after the viewer was clicked, or with Ctrl/⌘)
  useEffect(() => {
    const el = wrap.current!;
    let hintT = 0;
    let wheelT = 0;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.pa-panel, .k-modal, .pa-legend')) return;
      if (!active && !e.ctrlKey && !e.metaKey) {
        setHint(true);
        clearTimeout(hintT);
        hintT = window.setTimeout(() => setHint(false), 1400);
        return;
      }
      e.preventDefault();
      setGesturing(true);
      clearTimeout(wheelT);
      wheelT = window.setTimeout(() => setGesturing(false), 180);
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [active, zoomAt]);

  // ── pointer: tap / click selects, drag pans, two fingers pinch-zoom
  const gesture = useRef<{ pts: Map<number, { x: number; y: number }>; moved: number; target: string | null; last: { d: number; cx: number; cy: number } | null }>({
    pts: new Map(),
    moved: 0,
    target: null,
    last: null,
  });
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const g = gesture.current;
    const r = wrap.current!.getBoundingClientRect();
    g.pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (g.pts.size === 1) {
      g.moved = 0;
      g.target = (e.target as Element).closest('[data-part]')?.getAttribute('data-part') ?? null;
    }
    g.last = null;
    if (!active) setActive(true);
    const move = (ev: PointerEvent) => {
      const p = g.pts.get(ev.pointerId);
      if (!p) return;
      const nx = ev.clientX - r.left, ny = ev.clientY - r.top;
      const dx = nx - p.x, dy = ny - p.y;
      p.x = nx;
      p.y = ny;
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.moved > 4) setGesturing(true);
      if (g.pts.size >= 2) {
        const [a, b] = [...g.pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (g.last) {
          zoomAt(cx, cy, d / g.last.d);
          setView((v) => (v.k > 1 ? { ...v, x: v.x + cx - g.last!.cx, y: v.y + cy - g.last!.cy } : v));
        }
        g.last = { d, cx, cy };
      } else if (viewRef.current.k > 1 && g.moved > 4) {
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
    };
    const up = (ev: PointerEvent) => {
      if (!g.pts.has(ev.pointerId)) return;
      g.pts.delete(ev.pointerId);
      g.last = null;
      if (g.pts.size === 0) {
        setGesturing(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (g.moved < 6 && ev.type === 'pointerup') select(g.target && g.target !== selected ? g.target : g.target ? selected : null);
      }
    };
    if (g.pts.size === 1) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || gesture.current.pts.size) return;
    const id = (e.target as Element).closest('[data-part]')?.getAttribute('data-part') ?? null;
    setHoverPart(id);
    const r = wrap.current!.getBoundingClientRect();
    setTip(id ? { id, x: e.clientX - r.left, y: e.clientY - r.top } : null);
  };

  // ── what is highlighted
  const sel = selected ? COMPONENT_MAP[selected] : null;
  const states = useMemo(() => {
    const out: Record<string, PartState> = {};
    const hot = new Set(hoverGroup ?? (hoverPart ? [hoverPart] : []));
    const rel = new Set(sel?.relatedComponents ?? []);
    const focus = hot.size > 0 || !!sel || !!filter;
    for (const id of ORDER) {
      const inFilter = !filter || COMPONENT_MAP[id].category === filter;
      if (id === selected) out[id] = 'sel';
      else if (hot.has(id)) out[id] = 'hi';
      else if (!focus) out[id] = '';
      else if (sel && rel.has(id) && hot.size === 0) out[id] = 'rel';
      else if (hot.size === 0 && filter && inFilter) out[id] = '';
      else out[id] = 'dim';
    }
    return out;
  }, [hoverGroup, hoverPart, sel, selected, filter]);

  const delays = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of PARTS) out[p.id] = REDUCED || !p.c ? 0 : 0.05 + (Math.hypot(p.c[0] - VW / 2, p.c[1] - VH / 2) / VW) * 0.9;
    return out;
  }, [PARTS, VW, VH]);

  const showGroup = opt.labels && s >= (compact ? 0.2 : 0.4);
  const showDetail = opt.labels && s >= (compact ? 0.2 : 0.55);
  const rootStyle = {
    ...(opt.accent ? { '--pa-hi': opt.accent } : {}),
    ...(opt.ink ? { '--pa-ink': opt.ink } : {}),
  } as React.CSSProperties;
  const tipC = tip ? COMPONENT_MAP[tip.id] : null;

  return (
    <div className={`pa-root ${opt.light ? 'light' : ''} ${EMBED ? 'embed' : ''} ${compact ? 'compact' : ''}`} style={rootStyle}>
      <div
        ref={wrap}
        className={`pa-stage ${view.k > 1 ? 'zoomed' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setHoverPart(null);
          setTip(null);
        }}
        onKeyDown={(e) => {
          const id = (e.target as Element).getAttribute?.('data-part');
          if (id && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            select(id === selected ? null : id);
          }
        }}
        onFocus={(e) => setHoverPart((e.target as Element).getAttribute?.('data-part') ?? null)}
        onBlur={() => setHoverPart(null)}
      >
        <svg className="pa-svg" width={size.w} height={size.h} role="group" aria-label={`${AIRCRAFT.name} exploded parts drawing`}>
          <g className={gesturing ? '' : 'pa-ease'} style={{ transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(5)})` }}>
            {PARTS.map((p) => (
              <PartShape key={p.id} p={p} state={states[p.id]} dotR={12 / s} delay={delays[p.id]} />
            ))}
          </g>
        </svg>

        {(showGroup || showDetail) && (
          <div className={`pa-labels ${gesturing ? "" : "pa-ease-labels"}`} aria-hidden="true">
            {LABELS.map((l, i) =>
              (l.kind === 'group' ? showGroup && (!portrait || !!l.atPortrait || s >= 0.4) : showDetail) ? (
                <Label
                  key={i}
                  l={l}
                  pos={toScreen(labelAt(l, PART_MAP, portrait))}
                  active={!!hoverGroup && hoverGroup === l.ids}
                  dim={(!!sel || !!hoverGroup || !!hoverPart || !!filter) && !l.ids.some((id) => states[id] === 'hi' || states[id] === 'sel' || (filter && states[id] === ''))}
                  onHover={(on) => setHoverGroup(on ? l.ids : null)}
                  onPick={() => select(l.ids.includes(selected ?? '') ? null : l.ids[0])}
                />
              ) : null,
            )}
          </div>
        )}

        {tipC && tip && tip.id !== selected && (
          <div className={`pa-tip ${tip.x > size.w - 240 ? 'flip' : ''}`} style={{ left: tip.x, top: tip.y }}>
            <b>{tipC.name}</b>
            <span>
              {tipC.partNumber} · {CATEGORIES.find((c) => c.id === tipC.category)!.label}
            </span>
          </div>
        )}
        {hint && <div className="pa-hint">Click the drawing, then scroll to zoom · or hold Ctrl / ⌘</div>}
      </div>

      <header className="pa-head">
        <a className="pa-brand" href={EMBED ? '/parts' : undefined} target={EMBED ? '_blank' : undefined} rel="noopener">
          <span className="pa-logo">K1000</span>
          <span className="pa-sub">ULE · PARTS ATLAS</span>
        </a>
        <nav className="pa-actions">
          <a className="pa-btn" href={`/${selected ? `?component=${selected}&mode=inspection` : ''}`} target={EMBED ? '_blank' : undefined} rel="noopener">
            3D MODEL
          </a>
          {!EMBED && (
            <button className="pa-btn" onClick={() => setEmbedOpen(true)}>
              <IconEmbed size={14} /> EMBED
            </button>
          )}
          {EMBED && (
            <a className="pa-btn" href={`/parts${selected ? `?component=${selected}` : ''}`} target="_blank" rel="noopener">
              OPEN FULL ↗
            </a>
          )}
        </nav>
      </header>

      <footer className="pa-foot">
        <div className="pa-legend" role="toolbar" aria-label="Filter by system">
          {CATEGORIES.filter((c) => CAT_COUNT[c.id]).map((c) => (
            <button
              key={c.id}
              className={filter === c.id ? 'on' : ''}
              aria-pressed={filter === c.id}
              onClick={() => setFilter(filter === c.id ? null : c.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHoverGroup(ORDER.filter((id) => COMPONENT_MAP[id].category === c.id))}
              onPointerLeave={() => setHoverGroup(null)}
            >
              {c.label}
              <i>{CAT_COUNT[c.id]}</i>
            </button>
          ))}
        </div>
        <div className="pa-zoom">
          <button onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.4)} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Fit drawing" className="pa-fit">
            {Math.round(view.k * 100)}%
          </button>
          <button onClick={() => zoomAt(size.w / 2, size.h / 2, 1.4)} aria-label="Zoom in">
            +
          </button>
        </div>
      </footer>

      {!compact && !sel && <p className="pa-note">Line art traced from the K1000ULE digital twin · loose parts shown enlarged · click any part</p>}

      {sel && <InfoPanel c={sel} onClose={() => select(null)} onPick={select} onStep={step} />}

      {embedOpen && (
        <EmbedCodeDialog
          onClose={() => setEmbedOpen(false)}
          initialTarget="parts"
          current={{ parts: selected ? { component: selected } : {}, '3d': selected ? { component: selected } : {} }}
        />
      )}
    </div>
  );
}

function labelAt(l: AtlasLabel, PART_MAP: Record<string, Part>, portrait: boolean): [number, number] {
  if (portrait && l.atPortrait) return l.atPortrait;
  if (l.at && !(portrait && l.portraitAuto)) return l.at;
  const p = PART_MAP[l.ids[0]];
  if (!p?.box) return [0, 0];
  return [(p.box[0] + p.box[2]) / 2, p.box[3] + 14];
}

function Label({
  l,
  pos,
  active,
  dim,
  onHover,
  onPick,
}: {
  l: AtlasLabel;
  pos: readonly [number, number];
  active: boolean;
  dim: boolean;
  onHover: (on: boolean) => void;
  onPick: () => void;
}) {
  const align = l.align ?? (l.kind === 'detail' ? 'middle' : 'start');
  return (
    <button
      className={`pa-label ${l.kind} ${align} ${active ? 'on' : ''} ${dim ? 'dim' : ''}`}
      style={{ left: pos[0], top: pos[1] }}
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onPick}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <b>{l.text}</b>
      {l.sub && <span>{l.sub}</span>}
    </button>
  );
}

function InfoPanel({ c, onClose, onPick, onStep }: { c: DroneComponent; onClose: () => void; onPick: (id: string) => void; onStep: (d: 1 | -1) => void }) {
  const cat = CATEGORIES.find((x) => x.id === c.category)!;
  const i = ORDER.indexOf(c.id) + 1;
  const related = c.relatedComponents.filter((id) => COMPONENT_MAP[id]);
  return (
    <aside className="pa-panel" key={c.id} aria-label={`${c.name} details`} onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <div className="pa-meta">
          <span>
            {cat.code} · {String(i).padStart(2, '0')}/{ORDER.length}
          </span>
          <span>{c.partNumber}</span>
        </div>
        <h2>{c.name}</h2>
        <div className="pa-type">
          {c.type} · {c.system}
        </div>
        <button className="pa-x" onClick={onClose} aria-label="Close details">
          <IconClose size={15} />
        </button>
      </header>
      <div className="pa-body">
        <p className="pa-desc">{c.description}</p>
        <dl className="pa-specs">
          <div>
            <dt>Location</dt>
            <dd>{c.location}</dd>
          </div>
          {c.illustrativeSpecifications.map((sp) => (
            <div key={sp.label}>
              <dt>{sp.label}</dt>
              <dd>
                {sp.value}
                {sp.published && <em className="pa-pub">PUBLISHED</em>}
              </dd>
            </div>
          ))}
        </dl>
        {related.length > 0 && (
          <>
            <h4>Connected parts</h4>
            <div className="pa-related">
              {related.map((id) => (
                <button key={id} onClick={() => onPick(id)}>
                  {COMPONENT_MAP[id].name}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="pa-fine">Values without the PUBLISHED tag are illustrative placeholders, not official {AIRCRAFT.name} specifications.</p>
      </div>
      <footer>
        <button onClick={() => onStep(-1)} aria-label="Previous part">
          ←
        </button>
        <a href={`/?component=${c.id}&mode=inspection`} target={EMBED ? '_blank' : undefined} rel="noopener">
          VIEW IN 3D ↗
        </a>
        <button onClick={() => onStep(1)} aria-label="Next part">
          →
        </button>
      </footer>
    </aside>
  );
}
