// node tools/run-lineart.mjs [url] [out.json]  — needs playwright(-core) + Chromium
import { writeFileSync } from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import('playwright')); }
const url = process.argv[2] ?? 'http://localhost:5173/tools/lineart.html';
const out = process.argv[3] ?? new URL('../src/parts/lineart.json', import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error(e));
await page.goto(url);
await page.waitForFunction(() => window.__lineart || window.__lineartError, null, { timeout: 300000 });
const err = await page.evaluate(() => window.__lineartError);
if (err) { console.error(err); process.exit(1); }
writeFileSync(out, await page.evaluate(() => window.__lineart));
console.log(await page.evaluate(() => document.getElementById('log').textContent));
await browser.close();
