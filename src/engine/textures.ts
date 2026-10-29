import * as THREE from 'three';

/**
 * All textures are generated procedurally on small canvases at runtime, so the
 * experience ships with zero image assets.
 */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function finish(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** 2×2 twill carbon weave. */
export function carbonTexture() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#0c0d0f';
  ctx.fillRect(0, 0, S, S);
  const n = 8;
  const cell = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const horizontal = (x + y) % 4 < 2;
      const g = ctx.createLinearGradient(
        x * cell,
        y * cell,
        horizontal ? x * cell : (x + 1) * cell,
        horizontal ? (y + 1) * cell : y * cell,
      );
      const base = horizontal ? 34 : 24;
      g.addColorStop(0, `rgb(${base - 10},${base - 9},${base - 7})`);
      g.addColorStop(0.5, `rgb(${base + 16},${base + 18},${base + 22})`);
      g.addColorStop(1, `rgb(${base - 10},${base - 9},${base - 7})`);
      ctx.fillStyle = g;
      ctx.fillRect(x * cell + 0.6, y * cell + 0.6, cell - 1.2, cell - 1.2);
      // fibre streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.025)';
      ctx.lineWidth = 1;
      for (let k = 2; k < cell; k += 3) {
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x * cell + k, y * cell + 1);
          ctx.lineTo(x * cell + k, (y + 1) * cell - 1);
        } else {
          ctx.moveTo(x * cell + 1, y * cell + k);
          ctx.lineTo((x + 1) * cell - 1, y * cell + k);
        }
        ctx.stroke();
      }
    }
  }
  return finish(c, { repeat: [1, 1] });
}

/** Soft radial contact shadow. */
export function shadowTexture() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.45)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c);
}

/** Soft additive glow used for navigation lights. */
export function glowTexture() {
  const S = 128;
  const { c, ctx } = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c);
}

interface LabelOpts {
  w: number;
  h: number;
  bg: string;
  lines: { text: string; size: number; color?: string; weight?: number; x?: number; y: number; align?: CanvasTextAlign; font?: string }[];
  border?: string;
  stripes?: boolean;
}

/** Generic decal/label sheet. */
export function labelTexture(o: LabelOpts) {
  const { c, ctx } = canvas(o.w, o.h);
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, o.w, o.h);
  if (o.stripes) {
    ctx.save();
    ctx.fillStyle = 'rgba(224,102,42,0.9)';
    for (let x = -o.h; x < o.w; x += o.h * 0.5) {
      ctx.beginPath();
      ctx.moveTo(x, o.h);
      ctx.lineTo(x + o.h * 0.25, o.h);
      ctx.lineTo(x + o.h * 0.25 + o.h * 0.12, o.h * 0.88);
      ctx.lineTo(x + o.h * 0.12, o.h * 0.88);
      ctx.fill();
    }
    ctx.restore();
  }
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = Math.max(2, o.h * 0.012);
    ctx.strokeRect(o.h * 0.04, o.h * 0.04, o.w - o.h * 0.08, o.h - o.h * 0.08);
  }
  for (const l of o.lines) {
    ctx.fillStyle = l.color ?? '#d8dee6';
    ctx.font = `${l.weight ?? 500} ${l.size}px ${l.font ?? '"JetBrains Mono", ui-monospace, monospace'}`;
    ctx.textAlign = l.align ?? 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.text, l.x ?? o.w * 0.05, l.y);
  }
  return finish(c);
}

export function batteryLabel() {
  return labelTexture({
    w: 1024,
    h: 512,
    bg: '#15181c',
    border: 'rgba(200,210,220,0.25)',
    stripes: true,
    lines: [
      { text: 'K1000', size: 120, weight: 300, y: 120, font: 'Inter, sans-serif', color: '#e9eef3' },
      { text: 'SMART FLIGHT BATTERY', size: 40, y: 210, color: '#8fa3b5' },
      { text: '12S · 22 Ah · 980 Wh', size: 44, y: 290 },
      { text: 'ILLUSTRATIVE VALUES — NOT AN OFFICIAL SPECIFICATION', size: 22, y: 360, color: '#6f8090' },
      { text: '⚠  HANDLE WITH CARE · DO NOT PUNCTURE', size: 26, y: 410, color: '#e0662a' },
    ],
  });
}

export function serialPlate(text: string, sub: string) {
  return labelTexture({
    w: 1024,
    h: 256,
    bg: '#9aa3ad',
    border: 'rgba(20,24,28,0.6)',
    lines: [
      { text, size: 78, y: 96, color: '#15191d', weight: 500 },
      { text: sub, size: 40, y: 182, color: '#2b3239' },
    ],
  });
}

export function fcLidLabel() {
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = '#1b1f24';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(160,190,220,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 464, 464);
  // forward arrow
  ctx.fillStyle = '#c9d6e3';
  ctx.beginPath();
  ctx.moveTo(256, 70);
  ctx.lineTo(316, 170);
  ctx.lineTo(276, 170);
  ctx.lineTo(276, 250);
  ctx.lineTo(236, 250);
  ctx.lineTo(236, 170);
  ctx.lineTo(196, 170);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = '300 64px Inter, sans-serif';
  ctx.fillText('K1 · FCU', 256, 330);
  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.fillStyle = '#7f93a6';
  ctx.fillText('TRIPLE IMU · ILLUSTRATIVE', 256, 390);
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText('K1-FW 4.7.2-illustrative', 256, 440);
  return finish(c);
}

export function armDecal(index: number) {
  return labelTexture({
    w: 512,
    h: 128,
    bg: 'rgba(0,0,0,0)',
    lines: [
      { text: `ARM 0${index}  ▸`, size: 64, y: 64, color: 'rgba(220,228,236,0.85)', weight: 400, x: 20 },
    ],
  });
}

export function wearMark() {
  const { c, ctx } = canvas(256, 64);
  ctx.clearRect(0, 0, 256, 64);
  const g = ctx.createRadialGradient(128, 32, 2, 128, 32, 110);
  g.addColorStop(0, 'rgba(190,190,190,0.75)');
  g.addColorStop(1, 'rgba(190,190,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = 'rgba(230,230,230,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const x = 60 + Math.random() * 140;
    ctx.moveTo(x, 18 + Math.random() * 10);
    ctx.lineTo(x + 10 + Math.random() * 20, 40 + Math.random() * 10);
    ctx.stroke();
  }
  return finish(c);
}

/** Monocrystalline solar panel: grid of cells with thin busbars. `cols`×`rows` cells per panel. */
export function solarTexture(cols = 8, rows = 4) {
  const W = 512;
  const H = 256;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#c9cdd2';
  ctx.fillRect(0, 0, W, H);
  const m = 6;
  const cw = (W - m * 2) / cols;
  const ch = (H - m * 2) / rows;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const x0 = m + x * cw + 1;
      const y0 = m + y * ch + 1;
      const g = ctx.createLinearGradient(x0, y0, x0 + cw, y0 + ch);
      g.addColorStop(0, '#141b26');
      g.addColorStop(0.5, '#1b2433');
      g.addColorStop(1, '#121822');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, cw - 2, ch - 2);
      ctx.strokeStyle = 'rgba(170,185,205,0.35)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x0 + ((cw - 2) * k) / 4, y0);
        ctx.lineTo(x0 + ((cw - 2) * k) / 4, y0 + ch - 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,140,165,0.12)';
      for (let k = 2; k < ch - 2; k += 4) {
        ctx.beginPath();
        ctx.moveTo(x0, y0 + k);
        ctx.lineTo(x0 + cw - 2, y0 + k);
        ctx.stroke();
      }
    }
  return finish(c);
}
