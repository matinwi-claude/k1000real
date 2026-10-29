/**
 * Screen-space technical HUD drawn in a single SVG layer above the canvas:
 * measurement lines, inspection brackets, callout leaders, overlay labels and the
 * axis gizmo. Updated imperatively by the engine each rendered frame — no React
 * re-renders on the hot path.
 */
const NS = 'http://www.w3.org/2000/svg';

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

export interface Pt {
  x: number;
  y: number;
  ok: boolean;
}

export class Hud {
  svg: SVGSVGElement;
  gMeasure: SVGGElement;
  gCallout: SVGGElement;
  gBrackets: SVGGElement;
  gLabels: SVGGElement;
  gDims: SVGGElement;
  private measurePool: SVGGElement[] = [];
  private labelPool: SVGGElement[] = [];
  private dimPool: SVGTextElement[] = [];
  private calloutLine: SVGPolylineElement;
  private calloutDot: SVGCircleElement;
  private calloutRing: SVGCircleElement;
  private brackets: SVGPathElement;
  private coord: SVGTextElement;
  private coord2: SVGTextElement;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    svg.innerHTML = '';
    this.gDims = el('g', { class: 'hud-dims' }, svg);
    this.gLabels = el('g', { class: 'hud-labels' }, svg);
    this.gBrackets = el('g', { class: 'hud-brackets' }, svg);
    this.gCallout = el('g', { class: 'hud-callout' }, svg);
    this.gMeasure = el('g', { class: 'hud-measure' }, svg);

    this.calloutLine = el('polyline', { class: 'hud-line hud-callout-line', fill: 'none' }, this.gCallout);
    this.calloutRing = el('circle', { class: 'hud-ring', r: 7 }, this.gCallout);
    this.calloutDot = el('circle', { class: 'hud-dot', r: 2.2 }, this.gCallout);
    this.brackets = el('path', { class: 'hud-bracket', fill: 'none' }, this.gBrackets);
    this.coord = el('text', { class: 'hud-text hud-coord' }, this.gBrackets);
    this.coord2 = el('text', { class: 'hud-text hud-coord dim' }, this.gBrackets);
    this.gCallout.style.display = 'none';
    this.gBrackets.style.display = 'none';
  }

  setSize(w: number, h: number) {
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
  }

  // ───────────────────────────── measurement
  private measureItem(i: number) {
    while (this.measurePool.length <= i) {
      const g = el('g', { class: 'hud-m' }, this.gMeasure);
      el('line', { class: 'hud-mline' }, g);
      el('line', { class: 'hud-mtick' }, g);
      el('line', { class: 'hud-mtick' }, g);
      el('circle', { class: 'hud-mdot', r: 2.6 }, g);
      el('circle', { class: 'hud-mdot', r: 2.6 }, g);
      el('rect', { class: 'hud-mbox', rx: 1 }, g);
      el('text', { class: 'hud-text hud-mcap' }, g).textContent = 'DISTANCE';
      el('text', { class: 'hud-text hud-mval' }, g);
      this.measurePool.push(g);
    }
    return this.measurePool[i];
  }

  drawMeasurements(items: { a: Pt; b: Pt; mm: number; pending?: boolean; index: number }[]) {
    items.forEach((m, i) => {
      const g = this.measureItem(i);
      const ok = m.a.ok && m.b.ok;
      g.style.display = ok ? '' : 'none';
      if (!ok) return;
      g.classList.toggle('pending', !!m.pending);
      const [line, t1, t2, d1, d2, rect, cap, val] = Array.from(g.children) as SVGElement[];
      line.setAttribute('x1', String(m.a.x));
      line.setAttribute('y1', String(m.a.y));
      line.setAttribute('x2', String(m.b.x));
      line.setAttribute('y2', String(m.b.y));
      const dx = m.b.x - m.a.x;
      const dy = m.b.y - m.a.y;
      const L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * 7;
      const ny = (dx / L) * 7;
      t1.setAttribute('x1', String(m.a.x - nx));
      t1.setAttribute('y1', String(m.a.y - ny));
      t1.setAttribute('x2', String(m.a.x + nx));
      t1.setAttribute('y2', String(m.a.y + ny));
      t2.setAttribute('x1', String(m.b.x - nx));
      t2.setAttribute('y1', String(m.b.y - ny));
      t2.setAttribute('x2', String(m.b.x + nx));
      t2.setAttribute('y2', String(m.b.y + ny));
      d1.setAttribute('cx', String(m.a.x));
      d1.setAttribute('cy', String(m.a.y));
      d2.setAttribute('cx', String(m.b.x));
      d2.setAttribute('cy', String(m.b.y));
      d2.style.display = m.pending ? 'none' : '';
      const mx = (m.a.x + m.b.x) / 2 + nx * 2.6;
      const my = (m.a.y + m.b.y) / 2 + ny * 2.6;
      const label = `${m.mm.toFixed(m.mm < 100 ? 1 : 0)} mm`;
      val.textContent = label;
      cap.textContent = `M${String(m.index).padStart(2, '0')} · DISTANCE`;
      cap.setAttribute('x', String(mx));
      cap.setAttribute('y', String(my - 7));
      val.setAttribute('x', String(mx));
      val.setAttribute('y', String(my + 8));
      const w = Math.max(label.length * 7.4, 92) + 14;
      rect.setAttribute('x', String(mx - w / 2));
      rect.setAttribute('y', String(my - 19));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', '34');
    });
    for (let i = items.length; i < this.measurePool.length; i++) this.measurePool[i].style.display = 'none';
  }

  // ───────────────────────────── callout from component to inspector panel
  drawCallout(anchor: Pt | null, panel: { x: number; y: number } | null) {
    if (!anchor || !anchor.ok || !panel) {
      this.gCallout.style.display = 'none';
      return;
    }
    this.gCallout.style.display = '';
    const elbowX = panel.x - 28;
    const midX = anchor.x + (elbowX - anchor.x) * 0.55;
    const pts = `${anchor.x},${anchor.y} ${midX},${panel.y} ${panel.x},${panel.y}`;
    this.calloutLine.setAttribute('points', pts);
    this.calloutDot.setAttribute('cx', String(anchor.x));
    this.calloutDot.setAttribute('cy', String(anchor.y));
    this.calloutRing.setAttribute('cx', String(anchor.x));
    this.calloutRing.setAttribute('cy', String(anchor.y));
  }

  // ───────────────────────────── inspection brackets
  drawBrackets(rect: { x0: number; y0: number; x1: number; y1: number } | null, lines?: [string, string]) {
    if (!rect) {
      this.gBrackets.style.display = 'none';
      return;
    }
    this.gBrackets.style.display = '';
    const pad = 10;
    const x0 = rect.x0 - pad;
    const y0 = rect.y0 - pad;
    const x1 = rect.x1 + pad;
    const y1 = rect.y1 + pad;
    const s = Math.max(8, Math.min(18, (x1 - x0) * 0.18, (y1 - y0) * 0.18));
    const d =
      `M${x0},${y0 + s} L${x0},${y0} L${x0 + s},${y0} ` +
      `M${x1 - s},${y0} L${x1},${y0} L${x1},${y0 + s} ` +
      `M${x1},${y1 - s} L${x1},${y1} L${x1 - s},${y1} ` +
      `M${x0 + s},${y1} L${x0},${y1} L${x0},${y1 - s}`;
    this.brackets.setAttribute('d', d);
    if (lines) {
      this.coord.textContent = lines[0];
      this.coord2.textContent = lines[1];
      this.coord.setAttribute('x', String(x0));
      this.coord.setAttribute('y', String(y1 + 15));
      this.coord2.setAttribute('x', String(x0));
      this.coord2.setAttribute('y', String(y1 + 28));
    }
  }

  // ───────────────────────────── overlay labels with leader lines
  drawLabels(items: { p: Pt; text: string; code: string; cx: number; cy: number }[], opacity: number) {
    this.gLabels.style.opacity = String(opacity);
    this.gLabels.style.display = opacity < 0.01 ? 'none' : '';
    if (opacity < 0.01) return;
    items.forEach((it, i) => {
      while (this.labelPool.length <= i) {
        const g = el('g', { class: 'hud-lab' }, this.gLabels);
        el('polyline', { class: 'hud-line hud-leader', fill: 'none' }, g);
        el('circle', { class: 'hud-dot', r: 1.8 }, g);
        el('text', { class: 'hud-text hud-labname' }, g);
        el('text', { class: 'hud-text hud-labcode' }, g);
        this.labelPool.push(g);
      }
      const g = this.labelPool[i];
      g.style.display = it.p.ok ? '' : 'none';
      if (!it.p.ok) return;
      const [line, dot, name, code] = Array.from(g.children) as SVGElement[];
      const dx = it.p.x - it.cx;
      const dy = it.p.y - it.cy;
      const L = Math.hypot(dx, dy) || 1;
      const ex = it.p.x + (dx / L) * 46;
      const ey = it.p.y + (dy / L) * 46;
      const right = dx >= 0;
      const lw = Math.max(54, it.text.length * 6.6 + 10);
      const hx = ex + (right ? lw : -lw);
      line.setAttribute('points', `${it.p.x},${it.p.y} ${ex},${ey} ${hx},${ey}`);
      dot.setAttribute('cx', String(it.p.x));
      dot.setAttribute('cy', String(it.p.y));
      name.textContent = it.text;
      code.textContent = it.code;
      const anchor = right ? 'start' : 'end';
      const tx = ex + (right ? 4 : -4);
      name.setAttribute('text-anchor', anchor);
      code.setAttribute('text-anchor', anchor);
      name.setAttribute('x', String(tx));
      name.setAttribute('y', String(ey - 5));
      code.setAttribute('x', String(tx));
      code.setAttribute('y', String(ey + 11));
    });
    for (let i = items.length; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
  }

  // ───────────────────────────── dimension texts (overlay)
  drawDims(items: { p: Pt; text: string }[], opacity: number) {
    this.gDims.style.opacity = String(opacity);
    this.gDims.style.display = opacity < 0.01 ? 'none' : '';
    if (opacity < 0.01) return;
    items.forEach((it, i) => {
      while (this.dimPool.length <= i) this.dimPool.push(el('text', { class: 'hud-text hud-dim', 'text-anchor': 'middle' }, this.gDims));
      const t = this.dimPool[i];
      t.style.display = it.p.ok ? '' : 'none';
      t.textContent = it.text;
      t.setAttribute('x', String(it.p.x));
      t.setAttribute('y', String(it.p.y));
    });
  }
}

/** Small XYZ triad driven by the camera orientation. */
export class AxisGizmo {
  private lines: SVGLineElement[] = [];
  private labels: SVGTextElement[] = [];
  constructor(svg: SVGSVGElement) {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '-40 -40 80 80');
    el('circle', { class: 'gz-ring', r: 30, cx: 0, cy: 0 }, svg);
    const names = ['X', 'Y', 'Z'];
    for (let i = 0; i < 3; i++) {
      this.lines.push(el('line', { class: `gz-axis gz-${names[i].toLowerCase()}`, x1: 0, y1: 0 }, svg));
      const t = el('text', { class: `gz-label gz-${names[i].toLowerCase()}`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
      t.textContent = names[i];
      this.labels.push(t);
    }
  }
  /** `axes` = camera-space projections of world X,Y,Z unit vectors: [x, y, depth]. */
  update(axes: [number, number, number][]) {
    for (let i = 0; i < 3; i++) {
      const [x, y, z] = axes[i];
      const L = 22;
      this.lines[i].setAttribute('x2', String(x * L));
      this.lines[i].setAttribute('y2', String(-y * L));
      this.lines[i].style.opacity = String(z > 0 ? 0.45 : 1);
      this.labels[i].setAttribute('x', String(x * (L + 9)));
      this.labels[i].setAttribute('y', String(-y * (L + 9)));
    }
  }
}
