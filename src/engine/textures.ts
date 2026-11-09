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
    ctx.font = `${l.weight ?? 500} ${l.size}px ${l.font ?? 'Inter, sans-serif'}`;
    ctx.textAlign = l.align ?? 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.text, l.x ?? o.w * 0.05, l.y);
  }
  return finish(c);
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
/**
 * Solar panel (one texture per panel; u along the span, v along the chord), after the
 * aircraft's array: glossy near-black cells, thin white row lines along the span, white
 * ladder-style interconnects across the chord, and gold bus bars at the panel ends.
 */
export function solarTexture(cols = 9, rows = 4) {
  const W = 1024;
  const H = 512;
  const { c, ctx } = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b0d12');
  g.addColorStop(0.5, '#11141b');
  g.addColorStop(1, '#0a0c10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // fine cell texture
  ctx.strokeStyle = 'rgba(120,135,160,0.07)';
  ctx.lineWidth = 1;
  for (let y = 2; y < H; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  const bus = 14; // gold bus bars at both span ends
  // row lines along the span
  ctx.strokeStyle = 'rgba(232,236,240,0.85)';
  ctx.lineWidth = 2;
  for (let r = 1; r < rows; r++) {
    const y = (H * r) / rows;
    ctx.beginPath();
    ctx.moveTo(bus, y);
    ctx.lineTo(W - bus, y);
    ctx.stroke();
  }
  // ladder interconnects across the chord: a thin line with short ticks
  for (let k = 0; k < cols; k++) {
    const x = bus + ((W - 2 * bus) * (k + 0.5)) / cols;
    ctx.strokeStyle = 'rgba(225,230,236,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let y = 9; y < H; y += 18) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.stroke();
    }
  }
  for (const x0 of [0, W - bus]) {
    const gb = ctx.createLinearGradient(x0, 0, x0 + bus, 0);
    gb.addColorStop(0, '#9a6a12');
    gb.addColorStop(0.5, '#e6b23c');
    gb.addColorStop(1, '#9a6a12');
    ctx.fillStyle = gb;
    ctx.fillRect(x0, 0, bus, H);
  }
  return finish(c);
}

/** White company logo, twice around a band (transparent elsewhere); drawn once the image loads. */
export function motorLogo() {
  const { c, ctx } = canvas(1024, 128);
  const t = finish(c);
  const img = new Image();
  img.onload = () => {
    const h = 92;
    const w = (img.width / img.height) * h;
    for (const cx of [256, 768]) ctx.drawImage(img, cx - w / 2, (128 - h) / 2, w, h);
    t.needsUpdate = true;
  };
  img.src = '/brand/kraus-hamdani-aerospace.png';
  return t;
}
