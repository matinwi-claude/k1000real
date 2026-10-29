/**
 * Screen-space technical HUD drawn in a single SVG layer above the canvas:
 * inspection brackets, callout leaders and the axis gizmo. Updated imperatively by the engine each rendered frame — no React
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
  gCallout: SVGGElement;
  gBrackets: SVGGElement;
  private calloutLine: SVGPolylineElement;
  private calloutDot: SVGCircleElement;
  private calloutRing: SVGCircleElement;
  private brackets: SVGPathElement;
  private coord: SVGTextElement;
  private coord2: SVGTextElement;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    svg.innerHTML = '';
    this.gBrackets = el('g', { class: 'hud-brackets' }, svg);
    this.gCallout = el('g', { class: 'hud-callout' }, svg);

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
