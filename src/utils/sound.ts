import { getState } from '../store';

/**
 * Tiny synthesized interface sounds (no audio files). Disabled by default;
 * nothing plays unless the user enables SOUND in settings.
 */
let ctx: AudioContext | null = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.04, slideTo?: number, delay = 0) {
  if (!getState().sound) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 4200;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sound = {
  select: () => {
    tone(1320, 0.08, 'sine', 0.035);
    tone(1980, 0.12, 'sine', 0.02, undefined, 0.04);
  },
  toggle: () => tone(880, 0.06, 'triangle', 0.03),
  tick: () => tone(2400, 0.03, 'square', 0.012),
  confirm: () => {
    tone(1046, 0.07, 'sine', 0.03);
    tone(1568, 0.1, 'sine', 0.025, undefined, 0.05);
  },
  explode: (out: boolean) => tone(out ? 180 : 420, 0.6, 'sawtooth', 0.018, out ? 420 : 160),
  mode: () => tone(660, 0.1, 'sine', 0.03, 990),
  unlock: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'sine', 0.03, undefined, i * 0.07));
  },
};
