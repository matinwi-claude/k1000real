import * as THREE from 'three';
import { BOOM, FUSELAGE, LIFT, LIFT_LAYOUT, TAIL, WING, wingStation } from '../data/layout';

/** Footprint of the contact-shadow plane on the floor (metres). */
export const SHADOW_PLANE = { width: 6.4, depth: 3.6, centerZ: -0.25 } as const;

/**
 * Soft contact shadow shaped like the aircraft planform (drawn from the same layout
 * constants as the model), so the shadow reads as the aircraft rather than a blob.
 */
export function planformShadowTexture() {
  const cw = 1024;
  const ch = Math.round((cw * SHADOW_PLANE.depth) / SHADOW_PLANE.width);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  const X = (x: number) => (x / SHADOW_PLANE.width + 0.5) * cw;
  const Z = (z: number) => ((z - SHADOW_PLANE.centerZ) / SHADOW_PLANE.depth + 0.5) * ch;
  const k = cw / SHADOW_PLANE.width;

  // wide ambient halo
  const g = ctx.createRadialGradient(X(0), Z(0), 0, X(0), Z(0), cw * 0.42);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(X(0), Z(0));
  ctx.scale(1, 0.55);
  ctx.translate(-X(0), -Z(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch / 0.55);
  ctx.restore();

  const shapes = (blur: number, alpha: number) => {
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.lineCap = 'round';
    // wing
    ctx.beginPath();
    const n = 40;
    for (let i = -n; i <= n; i++) {
      const x = (i / n) * WING.halfSpan;
      const p = [X(x), Z(wingStation(Math.abs(x)).le)] as const;
      if (i === -n) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    for (let i = n; i >= -n; i--) {
      const x = (i / n) * WING.halfSpan;
      ctx.lineTo(X(x), Z(wingStation(Math.abs(x)).te));
    }
    ctx.closePath();
    ctx.fill();
    // fuselage pod
    ctx.beginPath();
    ctx.ellipse(X(0), Z((FUSELAGE.noseZ + FUSELAGE.podEndZ) / 2), 0.085 * k, ((FUSELAGE.noseZ - FUSELAGE.podEndZ) / 2) * k, 0, 0, Math.PI * 2);
    ctx.fill();
    // tail boom + stabiliser
    ctx.lineWidth = 0.04 * k;
    ctx.beginPath();
    ctx.moveTo(X(0), Z(FUSELAGE.podEndZ));
    ctx.lineTo(X(0), Z(FUSELAGE.tailEndZ));
    ctx.stroke();
    ctx.fillRect(X(-TAIL.stabHalfSpan), Z(TAIL.stabTE), TAIL.stabHalfSpan * 2 * k, (TAIL.stabLE - TAIL.stabTE) * k);
    // lift booms + rotor hubs
    ctx.lineWidth = BOOM.radius * 2 * k;
    for (const s of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(X(s * BOOM.x), Z(BOOM.frontZ));
      ctx.lineTo(X(s * BOOM.x), Z(BOOM.rearZ));
      ctx.stroke();
    }
    for (const a of LIFT_LAYOUT) {
      ctx.beginPath();
      ctx.arc(X(a.x), Z(a.z), LIFT.motorRadius * 1.6 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  shapes(30, 0.45);
  shapes(12, 0.6);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
