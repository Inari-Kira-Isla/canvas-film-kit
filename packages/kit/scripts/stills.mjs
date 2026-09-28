#!/usr/bin/env node
// stills.mjs — renders chosen timestamps to PNG through the page's deterministic __renderAt hook.
// Usage: node stills.mjs [url] [outDir] [t1,t2,...] [fps]
import { mkdirSync } from 'node:fs';
import { launchBrowser, FILM_URL } from '../render/browser.mjs';

const url = process.argv[2] ?? FILM_URL;
const out = process.argv[3] ?? 'stills';
const times = (process.argv[4] ?? '0.5,1.0,1.5,2.0,2.5').split(',').map(Number);
const fps = Number(process.argv[5] ?? process.env.FILM_FPS ?? 30);

mkdirSync(out, { recursive: true });
const { browser } = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => '__renderAt' in window);
const timings = [];
for (const t of times) {
  const ms = await page.evaluate((t) => { const s = performance.now(); window.__renderAt(t); return performance.now() - s; }, t);
  timings.push(`${t}s:${ms.toFixed(1)}ms`);
  await page.locator('canvas').screenshot({ path: `${out}/t${t.toFixed(2).padStart(5, '0')}.png` });
}
console.log(`fps=${fps} frames=${times.length}`);
console.log(timings.join('  '));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
