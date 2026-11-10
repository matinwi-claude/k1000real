// Renders tools/hangar.html frame by frame and encodes an MP4 with ffmpeg.
//   npm run dev   (in another terminal)
//   node tools/render-hangar.mjs [out.mp4] [--fps 30] [--w 1920 --h 1080] [--only 0,2.5,5.9]
// Needs playwright(-core) with a Chromium, and ffmpeg on PATH.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import('playwright')); }

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const out = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? 'k1000-hangar-reveal.mp4';
const fps = Number(opt('fps', 30));
const w = Number(opt('w', 1920));
const h = Number(opt('h', 1080));
const only = opt('only', null);
const base = opt('url', 'http://localhost:5173/tools/hangar.html');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', (e) => console.error(e));
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto(`${base}?w=${w}&h=${h}`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 300000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.error(err); process.exit(1); }
const duration = await page.evaluate(() => window.__duration);

const dir = join(tmpdir(), `hangar-frames-${process.pid}`);
mkdirSync(dir, { recursive: true });
const times = only ? only.split(',').map(Number) : Array.from({ length: Math.round(duration * fps) }, (_, i) => i / fps);
const started = Date.now();
for (let i = 0; i < times.length; i++) {
  const url = await page.evaluate((t) => window.__render(t), times[i]);
  const file = only ? out.replace(/\.mp4$/, '') + `-t${times[i]}.png` : join(dir, `f${String(i).padStart(5, '0')}.png`);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  if (i % 10 === 0 || only) console.log(`frame ${i + 1}/${times.length}  t=${times[i].toFixed(2)}s  ${((Date.now() - started) / 1000).toFixed(0)}s elapsed`);
}
await browser.close();

if (!only) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', join(dir, 'f%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  rmSync(dir, { recursive: true, force: true });
  console.log(`wrote ${out}`);
}
