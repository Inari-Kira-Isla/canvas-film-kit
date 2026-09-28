#!/usr/bin/env node
// boundary-diff.mjs — per-transition consecutive-frame pixel diff. A transition with no shared
// geometry between the two scenes is a hard cut, and every A→B hand-off needs boundary±1 frame
// checked, not a single mid-window sample.
//
// Reads boundaries straight off window.__meta.scenes (main.ts) — every distinct scene start/end
// value strictly inside (0, DURATION). That is every point where the set of active scenes changes.
//
// Per boundary b, renders b-1/fps, b, b+1/fps and diffs each consecutive pair with TWO metrics
// (computed inside the page — only scalars cross back to Node):
//   - meanAbsDiff — mean per-channel abs diff across the whole frame.
//   - tileMax     — max, over 48x48px tiles, of that tile's own mean per-channel abs diff (catches
//     a small localised pop that a whole-frame average would dilute away).
// Flagged if either metric exceeds an ABSOLUTE floor. A flagged diff can be excused via
// qa/boundary-diff-exceptions.json (array of `{ boundary, metric, max_value, reviewed_by }`) — a
// diff within boundary±1 frame and <= max_value*1.05 for that metric is excused.
//
// Known limitation (documented, not hidden): a film with genuinely one scene (e.g. the placeholder
// scaffold) has no transition to check — PASS with a NOTE, which is "no transitions", not "no
// hidden hard cuts". Anything else degenerate (unreadable scenes shape, or >1 scenes with 0
// interior boundaries) is a FAIL, never a silent "0 boundaries" PASS.
//
// Usage: node boundary-diff.mjs [url] [outJson]
// Exit codes: 0 = no unexcused flag, 1 = at least one unexcused flag, 2 = could not run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openFilm, FILM_URL, normalizeScenes, SceneFormatError } from '../render/browser.mjs';

const url = process.argv[2] ?? FILM_URL;
const out = process.argv[3] ?? 'qa/boundary-diff.json';
const TILE = 48;
const ABS_FLOOR = 1.5; // frame-mean floor
const TILE_ABS_FLOOR = 12; // tile-max floor
const FRAME_TOL_MULT = 1; // ± this many frames when matching an exception to a flagged boundary
const VALUE_OVERSHOOT = 1.05;

function fail(msg) {
  console.error(`boundary-diff: ${msg}`);
  process.exit(2);
}

let session;
try {
  session = await openFilm(url);
} catch (e) {
  fail(e.message);
}
const { page, meta, close } = session;
if (typeof meta?.DURATION !== 'number') fail('window.__meta.DURATION is not a number');
const DURATION = meta.DURATION;
const FPS = meta.FPS ?? 30;
let scenes;
try {
  scenes = normalizeScenes(meta);
} catch (e) {
  if (e instanceof SceneFormatError) {
    await close();
    fail(e.message);
  }
  throw e;
}

const boundarySet = new Set();
for (const s of scenes) {
  if (s.start > 0 && s.start < DURATION) boundarySet.add(+s.start.toFixed(4));
  if (s.end > 0 && s.end < DURATION) boundarySet.add(+s.end.toFixed(4));
}
const boundaries = [...boundarySet].sort((a, b) => a - b);

const report = { url, fps: FPS, duration: DURATION, tileSize: TILE, boundaries: [] };

if (boundaries.length === 0) {
  await close();
  if (scenes.length !== 1) {
    fail(
      `window.__meta.scenes has ${scenes.length} scene(s) but zero interior boundaries (0<t<DURATION=${DURATION}) — ` +
        `cannot silently PASS, verify the scenes' start/end values by hand.`,
    );
  }
  mkdirSync(path.dirname(out), { recursive: true });
  report.note = 'Zero interior scene boundaries (window.__meta.scenes has no 0<t<DURATION start/end) — single scene / whole-film overlap, nothing to check. PASS here means "nothing to diff", not "no hidden hard cuts".';
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`boundary-diff: PASS (0 boundaries — ${report.note})`);
  console.log(`written ${out}`);
  process.exit(0);
}

// Diff is computed ENTIRELY inside the page (window.__bdPrev caches the previous frame's
// ImageData between calls) — only the two scalar metrics cross back to Node.
await page.addScriptTag({
  content: `
    window.__bdPrev = null;
    window.__bdStep = (t, tile) => {
      window.__renderAt(t);
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const img = ctx.getImageData(0, 0, w, h).data;
      let out = null;
      if (window.__bdPrev) {
        const a = window.__bdPrev, b = img;
        const tw = Math.ceil(w / tile), th = Math.ceil(h / tile);
        const tileSum = new Float64Array(tw * th), tileN = new Uint32Array(tw * th);
        let sum = 0, n = 0;
        for (let k = 0; k < a.length; k += 16) {
          const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
          sum += d; n++;
          const pi = k / 4, px = pi % w, py = Math.floor(pi / w);
          const ti = Math.floor(py / tile) * tw + Math.floor(px / tile);
          tileSum[ti] += d; tileN[ti]++;
        }
        let tileMax = 0;
        for (let i = 0; i < tileSum.length; i++) { if (!tileN[i]) continue; const m = tileSum[i] / (tileN[i] * 3); if (m > tileMax) tileMax = m; }
        out = { meanAbsDiff: sum / (n * 3), tileMax };
      }
      window.__bdPrev = img.slice();
      return out;
    };
  `,
});

let anyFlagged = false;
for (const b of boundaries) {
  const times = [-1, 0, 1].map((f) => +Math.min(DURATION - 1 / FPS, Math.max(0, b + f / FPS)).toFixed(4));
  await page.evaluate(() => { window.__bdPrev = null; });
  const diffs = [];
  const flagged = [];
  for (let i = 0; i < times.length; i++) {
    const d = await page.evaluate(([t, tile]) => window.__bdStep(t, tile), [times[i], TILE]);
    if (!d) continue; // first frame of the window has no predecessor to diff against
    const row = { from: times[i - 1], to: times[i], meanAbsDiff: d.meanAbsDiff, tileMax: d.tileMax };
    diffs.push(row);
    const frameHit = d.meanAbsDiff > ABS_FLOOR;
    const tileHit = d.tileMax > TILE_ABS_FLOOR;
    if (frameHit || tileHit) flagged.push({ ...row, reason: [frameHit ? 'frame-mean' : null, tileHit ? 'tile-max' : null].filter(Boolean).join('+') });
  }
  if (flagged.length) anyFlagged = true;
  report.boundaries.push({ t: b, frames: diffs, flaggedSpikes: flagged });
  console.log(`boundary t=${b}: ${diffs.map((d) => `${d.from}->${d.to} mean=${d.meanAbsDiff.toFixed(3)} tile=${d.tileMax.toFixed(3)}`).join('  ')}  ${flagged.length ? `FLAGGED x${flagged.length}` : 'ok'}`);
}
await close();

// ---- reviewed-exceptions gate ----
let exceptions = [];
const exceptionsPath = path.resolve('qa/boundary-diff-exceptions.json');
if (existsSync(exceptionsPath)) {
  try {
    exceptions = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
    if (!Array.isArray(exceptions)) throw new Error('expected a JSON array');
  } catch (e) {
    fail(`${exceptionsPath} failed to parse: ${e.message}`);
  }
}
const FRAME_TOL = (FRAME_TOL_MULT / FPS) + 1e-6;
function excused(boundaryT, metric, value) {
  return exceptions.find((e) => e.metric === metric && Math.abs(e.boundary - boundaryT) <= FRAME_TOL && value <= e.max_value * VALUE_OVERSHOOT);
}
const unexcused = [];
for (const b of report.boundaries) {
  for (const f of b.flaggedSpikes) {
    for (const m of f.reason.split('+')) {
      const value = m === 'frame-mean' ? f.meanAbsDiff : f.tileMax;
      if (!excused(b.t, m, value)) unexcused.push(`boundary t=${b.t} ${f.from}->${f.to} metric=${m} value=${value.toFixed(3)} (floor ${m === 'frame-mean' ? ABS_FLOOR : TILE_ABS_FLOOR}, no matching entry in qa/boundary-diff-exceptions.json)`);
    }
  }
}

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`written ${out}`);

if (unexcused.length) {
  console.error(`boundary-diff: FAIL ${unexcused.length} unexcused spike(s):\n  ${unexcused.join('\n  ')}`);
  process.exit(1);
}
console.log(`boundary-diff: PASS — ${boundaries.length} boundary window(s) checked${anyFlagged ? ', all flagged spikes matched a reviewed exception' : ', no spikes'}`);
process.exit(0);
