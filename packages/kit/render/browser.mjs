// browser.mjs — the ONE place every kit script launches a browser (canvas-film-kit K1).
//
// Cross-platform + zero fixed-user-directory coupling (2026-09-28 design doc §2.1/§9 K1 row):
//   - `playwright` is a real npm `dependencies` entry of this package (see package.json), so a
//     plain `import { chromium } from 'playwright'` always resolves through normal Node module
//     resolution — no fallback that guesses at a user's own directory tree to find a copy of
//     playwright. That kind of fallback existed only because playwright was never a declared
//     dependency in an earlier, single-project version of this tooling; shipping it as a real
//     dependency of `canvas-film-kit` removes the whole problem instead of working around it.
//   - `channel: 'chrome'` (system Chrome) is tried FIRST — it is usually already installed and
//     gives real, familiar-to-users rendering. If that fails (no system Chrome — common on a fresh
//     CI runner or a machine that only ever used Firefox/Edge), this falls back to Playwright's own
//     bundled Chromium. The caller never has to know which one actually ran; `renderer` (from
//     openFilm) reports the real WEBGL_debug_renderer_info string either way, and `kit doctor`
//     prints which path was used.
import { chromium } from 'playwright';
import { gpuArgs } from './gpu-flags.mjs';

/**
 * Launches a browser for rendering: system Chrome first, bundled Chromium as fallback.
 * Returns `{ browser, usedChannel }` where usedChannel is 'chrome' or 'chromium-bundled'.
 */
export async function launchBrowser(extraArgs = []) {
  const args = [...gpuArgs(), ...extraArgs];
  try {
    const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', args });
    return { browser, usedChannel: process.env.PW_CHANNEL ?? 'chrome' };
  } catch (e) {
    console.error(
      `[canvas-film-kit] system Chrome launch failed (${e.message.split('\n')[0]}) — falling back to ` +
        `Playwright's bundled Chromium. If this also fails, run \`npx playwright install chromium\`.`,
    );
    const browser = await chromium.launch({ args });
    return { browser, usedChannel: 'chromium-bundled' };
  }
}

export const FILM_URL = process.env.FILM_URL ?? 'http://localhost:5173/?paused';

/**
 * Opens the film, waits for window.__renderAt + window.__meta (main.ts guarantees both exist
 * before scene 1 is ever written), and returns the real WEBGL renderer string alongside them —
 * SwiftShader/llvmpipe here means every downstream perf number is fake (see `kit doctor`).
 */
export async function openFilm(url = FILM_URL) {
  const { browser, usedChannel } = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url);
  try {
    await page.waitForFunction(() => '__renderAt' in window && '__meta' in window, null, { timeout: 30000 });
  } catch {
    await browser.close();
    throw new Error(
      `window.__renderAt / window.__meta never appeared at ${url} within 30s — is the dev/preview server actually running there? (run \`npm run dev\` in another terminal, or pass --url.)`,
    );
  }
  const meta = await page.evaluate(() => window.__meta);
  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl');
    const d = c && c.getExtension('WEBGL_debug_renderer_info');
    return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  return { browser, page, meta, errors, renderer, usedChannel, close: () => browser.close() };
}

/** Renders time `t` through the deterministic hook and returns the canvas as a PNG Buffer. */
export async function framePng(page, t) {
  const b64 = await page.evaluate((tt) => {
    window.__renderAt(tt);
    return document.getElementById('stage').toDataURL('image/png').split(',')[1];
  }, t);
  return Buffer.from(b64, 'base64');
}

/** Thrown by normalizeScenes() below — callers must treat this as a gate FAIL, never a "0 scenes". */
export class SceneFormatError extends Error {}

/**
 * Shared window.__meta.scenes reader for determinism.mjs / boundary-diff.mjs.
 *
 * Any shape other than an array of `{ start, end, ... }` (e.g. an object map keyed by scene name)
 * is refused loudly instead of silently treated as "0 scenes" — a real scaffold with N real
 * transitions must never look identical to a broken/incompatible one under this reader (a hollow
 * "0 interior boundaries, PASS" would hide every real transition from determinism/boundary-diff).
 * The one shape accepted is exactly what the scaffold's own main.ts emits: `SCENES.map((s) =>
 * ({ name, start, end }))`.
 */
export function normalizeScenes(meta) {
  const raw = meta?.scenes;
  if (!Array.isArray(raw)) {
    const shape =
      raw === null || raw === undefined
        ? String(raw)
        : typeof raw === 'object'
          ? `object (keys: ${Object.keys(raw).join(', ') || '(none)'})`
          : typeof raw;
    throw new SceneFormatError(
      `window.__meta.scenes is not an array — got ${shape}. This gate requires scenes to be an ` +
        `{ name, start, end }[] (the scaffold's main.ts SCENES.map(...) already produces this shape). ` +
        `There is no silent compatibility path for other shapes on purpose — that would make a real ` +
        `hidden transition indistinguishable from "no scenes at all".`,
    );
  }
  const bad = raw.filter((s) => !(s && typeof s === 'object' && typeof s.start === 'number' && typeof s.end === 'number'));
  if (bad.length) {
    throw new SceneFormatError(
      `window.__meta.scenes has ${bad.length}/${raw.length} element(s) without numeric start/end: ${JSON.stringify(bad.slice(0, 3))}${bad.length > 3 ? ' …' : ''}`,
    );
  }
  return raw;
}
