import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LABELS, type AtlasLabel } from './labels';
import { AIRCRAFT, CATEGORIES, COMPONENT_MAP, type CategoryId } from '../data/components';
import { BUILD_PAYLOADS } from '../data/build';
import { IconClose } from '../components/Icons';

interface Part {
  id: string;
  d: string;
  dd?: string;
  region: string;
  c: [number, number] | null;
  box: [number, number, number, number] | null;
}

export interface LineArt {
  variant: string;
  viewBox: number[];
  parts: Part[];
}

/** Payloads and radios: shown in the side panel (not on the aircraft drawing); the only parts with a specs panel. */
const ITEMS = BUILD_PAYLOADS.map((p) => p.id).filter((id) => COMPONENT_MAP[id]);
const ITEM_KIND = Object.fromEntries(BUILD_PAYLOADS.map((p) => [p.id, p.kind])) as Record<string, 'radio' | 'payload'>;
const IS_ITEM = new Set(ITEMS);
const CAT_ORDER = CATEGORIES.map((c) => c.id);

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

/** An aircraft part (or labelled assembly) tapped / clicked: highlighted with its name, no specs panel. */
interface Pin {
  ids: string[];
  name: string;
  at: [number, number];
}

type PartState = '' | 'hi' | 'sel' | 'dim';

/** One component of the drawing. */
const PartShape = memo(function PartShape({ p, state, dotR, delay }: { p: Part; state: PartState; dotR: number; delay: number }) {
  const c = COMPONENT_MAP[p.id];
  const small = p.box ? Math.max(p.box[2] - p.box[0], p.box[3] - p.box[1]) < 26 : true;
  return (
    <g className={`pa-part ${state}`} data-part={p.id} tabIndex={0} role="button" aria-label={c.name} aria-pressed={state === 'sel'} style={{ animationDelay: `${delay}s` }}>
      {p.region && <path className="pa-fill" d={p.region} />}
      {p.dd && <path className="pa-detail" d={p.dd} />}
      <path className="pa-line" d={p.d} />
      <path className="pa-hit" d={p.d} />
      {small && p.c && <circle className="pa-hitdot" cx={p.c[0]} cy={p.c[1]} r={dotR} />}
    </g>
  );
});

/** A payload / radio drawing, fitted to its own box. */
function Thumb({ p }: { p: Part | undefined }) {
  const b = p?.box;
  if (!p || !b) return <svg className="pa-thumb" />;
  const pad = 0.12 * Math.max(b[2] - b[0], b[3] - b[1]);
  return (
    <svg className="pa-thumb" viewBox={`${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + pad * 2} ${b[3] - b[1] + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {p.region && <path className="fill" d={p.region} />}
      {p.dd && <path className="detail" d={p.dd} />}
      <path className="line" d={p.d} />
    </svg>
  );
}

export function PartsApp({ art, payloadArt }: { art: LineArt; payloadArt: LineArt }) {
  const PARTS = useMemo(() => art.parts.filter((p) => COMPONENT_MAP[p.id] && p.d && !IS_ITEM.has(p.id)), [art]);
  const PART_MAP = useMemo(() => Object.fromEntries(PARTS.map((p) => [p.id, p])) as Record<string, Part>, [PARTS]);
  const THUMBS = useMemo(() => Object.fromEntries(payloadArt.parts.map((p) => [p.id, p])) as Record<string, Part>, [payloadArt]);
  const DRAWN = useMemo(() => PARTS.map((p) => p.id), [PARTS]);
  const CAT_COUNT = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, DRAWN.filter((id) => COMPONENT_MAP[id].category === c.id).length])), [DRAWN]);

  // the drawing's content box (viewBox units): parts plus label anchors
  const content = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x: number, y: number) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    for (const p of PARTS) if (p.box) add(p.box[0], p.box[1]), add(p.box[2], p.box[3]);
    for (const l of LABELS) if (l.at) add(l.at[0], l.at[1]);
    return { x: x0 - 12, y: y0 - 12, w: x1 - x0 + 24, h: y1 - y0 + 40 };
  }, [PARTS]);

  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(opt.component && IS_ITEM.has(opt.component) ? opt.component : null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [hoverPart, setHoverPart] = useState<string | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<CategoryId | null>(opt.category);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const [active, setActive] = useState(!EMBED);
  const [hint, setHint] = useState(false);
  const [gesturing, setGesturing] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  // ── layout: fit the drawing into the free area, then apply zoom / pan
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  /** phones / narrow embeds: filters on top, payload strip (or specs sheet) at the bottom */
  const compact = size.w < 900 || size.h < 420;
  const short = size.h < 560;
  const panelW = size.w >= 1100 ? 272 : 236;
  // portrait phones / tablets: the width-fitted drawing leaves room below, so payloads get a grid there
  const drawH = Math.round((content.h * (size.w - 20)) / content.w);
  const tallH = size.h - 48 - drawH - 28;
  const tall = compact && tallH > 250;
  const stripH = tall ? tallH : short ? 104 : 128;
  const sheetH = tall ? Math.max(tallH, 300) : Math.min(Math.round(size.h * 0.6), 400);
  const top = compact ? 48 : 20;
  const bottom = compact ? (selected ? sheetH : stripH) + 8 : 64;
  const left = compact ? 10 : 28;
  const right = compact ? 10 : panelW + 44;
  const s0 = Math.min((size.w - left - right) / content.w, (size.h - top - bottom) / content.h);
  const t0x = left + (size.w - left - right - content.w * s0) / 2 - content.x * s0;
  const t0y = top + (size.h - top - bottom - content.h * s0) / 2 - content.y * s0;
  const s = s0 * view.k;
  const tx = t0x * view.k + view.x;
  const ty = t0y * view.k + view.y;
  const toScreen = useCallback((p: readonly [number, number]) => [p[0] * s + tx, p[1] * s + ty] as const, [s, tx, ty]);

  const zoomAt = useCallback(
    (qx: number, qy: number, f: number) => {
      const v = viewRef.current;
      const k = Math.min(8, Math.max(1, v.k * f));
      if (k === 1) return setView({ k: 1, x: 0, y: 0 });
      // keep the drawing point under (qx, qy) fixed
      const bx = t0x * v.k + v.x,
        by = t0y * v.k + v.y;
      const nx = qx - ((qx - bx) * k) / v.k,
        ny = qy - ((qy - by) * k) / v.k;
      setView({ k, x: nx - t0x * k, y: ny - t0y * k });
    },
    [t0x, t0y],
  );

  // ── selection (payloads / radios) and pins (aircraft parts)
  const select = useCallback((id: string | null) => {
    setSelected(id && IS_ITEM.has(id) ? id : null);
    setTip(null);
  }, []);
  const pinPart = useCallback(
    (id: string | null) => {
      const p = id ? PART_MAP[id] : null;
      setPin(p?.c ? { ids: [p.id], name: COMPONENT_MAP[p.id].name, at: p.c } : null);
      setTip(null);
    },
    [PART_MAP],
  );
  const pinLabel = useCallback(
    (l: AtlasLabel) => {
      if (l.ids.length === 1) return pinPart(pin?.ids[0] === l.ids[0] ? null : l.ids[0]);
      setPin((cur) => (cur && cur.ids === l.ids ? null : { ids: l.ids, name: l.text, at: labelAt(l, PART_MAP) }));
    },
    [PART_MAP, pin, pinPart],
  );

  useEffect(() => {
    const c = selected ? COMPONENT_MAP[selected] : null;
    post({ k1000: 'select', id: selected, name: c?.name ?? null, category: c?.category ?? null });
  }, [selected]);
  useEffect(() => {
    if (opt.component && !IS_ITEM.has(opt.component)) pinPart(opt.component);
  }, [pinPart]);
  useEffect(() => {
    post({ k1000: 'ready', components: ITEMS, page: 'parts' });
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { k1000?: string; value?: unknown };
      if (!d || typeof d !== 'object' || typeof d.k1000 !== 'string') return;
      if (d.k1000 === 'select') {
        const id = typeof d.value === 'string' ? d.value : null;
        if (id && IS_ITEM.has(id)) select(id);
        else {
          select(null);
          pinPart(id);
        }
      }
      if (d.k1000 === 'category') setFilter(CAT_ORDER.includes(d.value as CategoryId) ? (d.value as CategoryId) : null);
      if (d.k1000 === 'reset') {
        select(null);
        setPin(null);
        setFilter(null);
        setView({ k: 1, x: 0, y: 0 });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [select, pinPart]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const i = selected ? ITEMS.indexOf(selected) : -1;
      select(ITEMS[(i + dir + ITEMS.length) % ITEMS.length]);
    },
    [selected, select],
  );

  // ── keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') {
        if (selected) select(null);
        else if (pin) setPin(null);
        else if (filter) setFilter(null);
        else setView({ k: 1, x: 0, y: 0 });
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (selected) {
          e.preventDefault();
          step(1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (selected) {
          e.preventDefault();
          step(-1);
        }
      } else if (e.key === '+' || e.key === '=') zoomAt(size.w / 2, size.h / 2, 1.3);
      else if (e.key === '-') zoomAt(size.w / 2, size.h / 2, 1 / 1.3);
      else if (e.key === '0') setView({ k: 1, x: 0, y: 0 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, pin, filter, step, select, zoomAt, size]);

  // ── wheel zoom (embedded: only after the viewer was clicked, or with Ctrl/⌘)
  useEffect(() => {
    const el = wrap.current!;
    let hintT = 0;
    let wheelT = 0;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.pa-items, .pa-legend')) return;
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

  // ── pointer: tap / click pins a part, drag pans (when zoomed), two fingers pinch-zoom
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
      const nx = ev.clientX - r.left,
        ny = ev.clientY - r.top;
      const dx = nx - p.x,
        dy = ny - p.y;
      p.x = nx;
      p.y = ny;
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.moved > 4) setGesturing(true);
      if (g.pts.size >= 2) {
        const [a, b] = [...g.pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y),
          cx = (a.x + b.x) / 2,
          cy = (a.y + b.y) / 2;
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
        if (g.moved < 6 && ev.type === 'pointerup') pinPart(g.target && !(pin?.ids.length === 1 && pin.ids[0] === g.target) ? g.target : null);
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
  const states = useMemo(() => {
    const out: Record<string, PartState> = {};
    const hot = new Set(hoverGroup ?? (hoverPart ? [hoverPart] : []));
    const pinned = new Set(pin?.ids ?? []);
    const focus = hot.size > 0 || pinned.size > 0 || !!filter;
    for (const id of DRAWN) {
      const inFilter = !filter || COMPONENT_MAP[id].category === filter;
      if (pinned.has(id)) out[id] = 'sel';
      else if (hot.has(id)) out[id] = 'hi';
      else if (!focus) out[id] = '';
      else if (hot.size === 0 && filter && inFilter) out[id] = '';
      else out[id] = 'dim';
    }
    return out;
  }, [hoverGroup, hoverPart, pin, filter, DRAWN]);

  const delays = useMemo(() => {
    const out: Record<string, number> = {};
    const cx = content.x + content.w / 2,
      cy = content.y + content.h / 2;
    for (const p of PARTS) out[p.id] = REDUCED || !p.c ? 0 : 0.05 + (Math.hypot(p.c[0] - cx, p.c[1] - cy) / content.w) * 0.9;
    return out;
  }, [PARTS, content]);

  // labels keep their size while the drawing scales: below this they would crowd the parts (tap a part to name it)
  const showGroup = opt.labels && s >= 0.4;
  const showDetail = opt.labels && s >= 0.4;
  const rootStyle = {
    ...(opt.accent ? { '--pa-hi': opt.accent } : {}),
    ...(opt.ink ? { '--pa-ink': opt.ink } : {}),
  } as React.CSSProperties;
  const tipC = tip ? COMPONENT_MAP[tip.id] : null;
  const pinXY = pin ? toScreen(pin.at) : null;

  return (
    <div
      className={`pa-root ${opt.light ? 'light' : ''} ${EMBED ? 'embed' : ''} ${compact ? 'compact' : ''} ${short ? 'short' : ''} ${tall ? 'tall' : ''} ${selected ? 'has-sel' : ''}`}
      style={{ ...rootStyle, ['--pa-panel-w' as string]: `${panelW}px`, ['--pa-sheet-h' as string]: `${sheetH}px`, ['--pa-strip-h' as string]: `${stripH}px` }}
    >
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
            pinPart(pin?.ids[0] === id ? null : id);
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
          <div className={`pa-labels ${gesturing ? '' : 'pa-ease-labels'}`} aria-hidden="true">
            {LABELS.map((l, i) =>
              (l.kind === 'group' ? showGroup : showDetail) ? (
                <Label
                  key={i}
                  l={l}
                  pos={clampLabel(l, toScreen(labelAt(l, PART_MAP)), size.w - right, compact)}
                  active={(!!hoverGroup && hoverGroup === l.ids) || pin?.ids === l.ids}
                  dim={(!!pin || !!hoverGroup || !!hoverPart || !!filter) && !l.ids.some((id) => states[id] === 'hi' || states[id] === 'sel' || (filter && states[id] === ''))}
                  onHover={(on) => setHoverGroup(on ? l.ids : null)}
                  onPick={() => pinLabel(l)}
                />
              ) : null,
            )}
          </div>
        )}

        {tipC && tip && !pin?.ids.includes(tip.id) && (
          <div className={`pa-tip ${tip.x > size.w - 240 ? 'flip' : ''}`} style={{ left: tip.x, top: tip.y }}>
            <b>{tipC.name}</b>
            <span>{CATEGORIES.find((c) => c.id === tipC.category)!.label}</span>
          </div>
        )}
        {pin && pin.ids.length === 1 && pinXY && (
          <div className={`pa-tip pinned ${pinXY[0] > size.w - right - 200 ? 'flip' : ''}`} style={{ left: pinXY[0], top: pinXY[1] }}>
            <b>{pin.name}</b>
            <span>{CATEGORIES.find((c) => c.id === COMPONENT_MAP[pin.ids[0]].category)!.label}</span>
          </div>
        )}
        {hint && <div className="pa-hint">Click the drawing, then scroll to zoom · or hold Ctrl / ⌘</div>}
      </div>

      <div className="pa-legend" role="toolbar" aria-label="Highlight a system">
        {CATEGORIES.filter((c) => CAT_COUNT[c.id]).map((c) => (
          <button
            key={c.id}
            className={filter === c.id ? 'on' : ''}
            aria-pressed={filter === c.id}
            onClick={() => setFilter(filter === c.id ? null : c.id)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHoverGroup(DRAWN.filter((id) => COMPONENT_MAP[id].category === c.id))}
            onPointerLeave={() => setHoverGroup(null)}
          >
            {c.label}
            <i>{CAT_COUNT[c.id]}</i>
          </button>
        ))}
      </div>

      {(!compact || view.k > 1) && (
        <div className="pa-zoom">
          {!compact && (
            <button onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.4)} aria-label="Zoom out">
              −
            </button>
          )}
          <button onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Fit drawing" className="pa-fit">
            {compact ? 'FIT' : `${Math.round(view.k * 100)}%`}
          </button>
          {!compact && (
            <button onClick={() => zoomAt(size.w / 2, size.h / 2, 1.4)} aria-label="Zoom in">
              +
            </button>
          )}
        </div>
      )}

      <ItemsPanel selected={selected} thumbs={THUMBS} compact={compact} onSelect={select} onStep={step} />
    </div>
  );
}

/** Payloads & radios: a scrolling list (right side on desktop, a bottom strip on phones) that opens a specs view. */
function ItemsPanel({
  selected,
  thumbs,
  compact,
  onSelect,
  onStep,
}: {
  selected: string | null;
  thumbs: Record<string, Part>;
  compact: boolean;
  onSelect: (id: string | null) => void;
  onStep: (d: 1 | -1) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const c = selected ? COMPONENT_MAP[selected] : null;
  // keep the list where it was when coming back from a specs view
  const scroll = useRef(0);
  useEffect(() => {
    if (!selected && list.current) {
      if (compact) list.current.scrollLeft = scroll.current;
      else list.current.scrollTop = scroll.current;
    }
  }, [selected, compact]);
  const remember = () => {
    if (list.current) scroll.current = compact ? list.current.scrollLeft : list.current.scrollTop;
  };

  if (c && selected) {
    return (
      <aside className="pa-items detail" key={selected} aria-label={`${c.name} specifications`} onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <button className="pa-back" onClick={() => onSelect(null)} aria-label="Back to payloads and radios">
            ←
          </button>
          <h2>Specifications</h2>
          <button className="pa-x" onClick={() => onSelect(null)} aria-label="Close specifications">
            <IconClose size={15} />
          </button>
        </header>
        <div className="pa-body">
          <div className="pa-hero">
            <Thumb p={thumbs[selected]} />
          </div>
          <dl className="pa-specs">
            <div>
              <dt>Name</dt>
              <dd>{c.name}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{ITEM_KIND[selected] === 'radio' ? 'Radio' : 'Payload'}</dd>
            </div>
          </dl>
        </div>
        <footer>
          <button onClick={() => onStep(-1)} aria-label="Previous item">
            ←
          </button>
          <span>
            {ITEMS.indexOf(selected) + 1} / {ITEMS.length}
          </span>
          <button onClick={() => onStep(1)} aria-label="Next item">
            →
          </button>
        </footer>
      </aside>
    );
  }

  const groups: { kind: 'payload' | 'radio'; title: string }[] = [
    { kind: 'payload', title: 'Payloads' },
    { kind: 'radio', title: 'Radios' },
  ];
  return (
    <aside className="pa-items" aria-label="Payloads and radios" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <h2>Payloads &amp; Radios</h2>
        <span>{ITEMS.length}</span>
      </header>
      <div className="pa-items-list" ref={list}>
        {groups.map((g) => (
          <section key={g.kind}>
            <h3>{g.title}</h3>
            <div className="pa-cards">
              {ITEMS.filter((id) => ITEM_KIND[id] === g.kind).map((id) => (
                <button
                  key={id}
                  className="pa-card"
                  onClick={() => {
                    remember();
                    onSelect(id);
                  }}
                >
                  <Thumb p={thumbs[id]} />
                  <b>{COMPONENT_MAP[id].name}</b>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

/** Keeps a label on screen (estimated text width). */
function clampLabel(l: AtlasLabel, pos: readonly [number, number], maxX: number, compact: boolean): [number, number] {
  const px = l.kind === 'group' ? (compact ? 10 : 13) * 0.86 : 7;
  const w = l.text.length * px;
  const align = l.align ?? (l.kind === 'detail' ? 'middle' : 'start');
  const leftEdge = align === 'start' ? pos[0] : align === 'middle' ? pos[0] - w / 2 : pos[0] - w;
  const shift = Math.min(0, maxX - 8 - (leftEdge + w)) + Math.max(0, 8 - leftEdge);
  return [pos[0] + shift, pos[1]];
}

function labelAt(l: AtlasLabel, PART_MAP: Record<string, Part>): [number, number] {
  if (l.at) return l.at;
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
