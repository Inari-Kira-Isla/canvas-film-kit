#!/usr/bin/env node
// determinism.mjs — seek-order independence gate (rule #1 of the scaffold's core contract: render
// must be a pure function of t). Renders a set of sample times forward, then reversed, then
// pseudo-shuffled, and compares PNG hashes across the three orders. A mismatch means some scene is
// carrying per-frame mutable state or an un-seeded Math.random — a real frame drawn from THIS
// project's own scenes, not a lint.
//
// Sample times cover the FULL current duration automatically, every run, from two sources (never a
// hand-typed list that silently goes stale when DURATION changes):
//   1. a coarse grid — every 5s across [0, DURATION), offset by a fixed 0.37s so it never lands
//      exactly on a scene boundary by accident.
//   2. every real scene boundary (window.__meta.scenes[].start/.end, excluding 0 and DURATION
//      themselves) ±1 frame either side — this is where a hidden per-frame accumulator is most
//      likely to show up, because forward order reaches it from one direction and reversed/shuffled
//      order reach it from others.
// If __meta.scenes is a single-element array spanning the whole film (e.g. the placeholder scene),
// there is genuinely no interior boundary — only the 5s grid runs, noted in the output, not hidden.
// Any other degenerate shape (>1 scenes but 0 interior boundaries) is a FAIL, not a silent PASS —
// see render/browser.mjs normalizeScenes().
//
// Usage: node determinism.mjs [url] [outJson]
//   FILM_URL / PW_CHANNEL env vars — see render/browser.mjs
// Exit codes: 0 = identical across all three orders, 1 = at least one mismatch, 2 = could not run.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openFilm, framePng, FILM_URL, normalizeScenes, SceneFormatError } from '../render/browser.mjs';

const url = process.argv[2] ?? FILM_URL;
const out = process.argv[3] ?? 'qa/determinism.json';
const GRID_STEP = 5; // seconds
const GRID_OFFSET = 0.37; // avoid landing exactly on a boundary by chance

function fail(msg) {
  console.error(`determinism: ${msg}`);
  process.exit(2);
}

let session;
try {
  session = await openFilm(url);
} catch (e) {
  fail(e.message);
}
const { page, meta, renderer, close } = session;
if (typeof meta?.DURATION !== 'number') fail('window.__meta.DURATION is not a number — main.ts __meta does not follow the scaffold shape?');
const DURATION = meta.DURATION;
const FPS = meta.FPS ?? 30;
if (/swiftshader|llvmpipe|software/i.test(renderer ?? '')) {
  console.error(`determinism: WARN: renderer="${renderer}" looks like software rendering — hashes are unaffected by the GPU so this script is not lying, but it means this machine is not exercising the real playback path (see \`kit doctor\`).`);
}

// ---- 1. coarse 5s grid ----
const grid = [];
for (let t = GRID_OFFSET; t < DURATION; t += GRID_STEP) grid.push(+t.toFixed(4));

// ---- 2. every real scene boundary ±1 frame ----
let scenes;
try {
  scenes = normalizeScenes(meta);
} catch (e) {
  if (e instanceof SceneFormatError) fail(e.message);
  throw e;
}
const boundaryValues = new Set();
for (const s of scenes) {
  if (s.start > 0 && s.start < DURATION) boundaryValues.add(s.start);
  if (s.end > 0 && s.end < DURATION) boundaryValues.add(s.end);
}
const boundaries = [];
for (const b of boundaryValues) {
  for (const f of [-1, 0, 1]) {
    const t = Math.min(DURATION - 1 / FPS, Math.max(0, b + f / FPS));
    boundaries.push(+t.toFixed(4));
  }
}

const timesSet = new Set([...grid, ...boundaries]);
const ts = [...timesSet].sort((a, b) => a - b);
if (boundaryValues.size === 0) {
  if (scenes.length !== 1) {
    fail(
      `window.__meta.scenes has ${scenes.length} scene(s) but zero interior boundaries (0 < t < DURATION=${DURATION}) — ` +
        `${scenes.length} scenes should normally have an interior boundary unless every start/end is pinned exactly ` +
        `to 0 or ${DURATION}. This cannot silently PASS — verify the scenes' start/end values by hand.`,
    );
  }
  console.log(`determinism: NOTE — window.__meta.scenes has no interior boundary (0 < t < DURATION=${DURATION}), using only the ${GRID_STEP}s grid (${grid.length} points). Normal for a single-scene/whole-film-overlap film, not a FAIL reason.`);
} else {
  console.log(`determinism: ${grid.length} 5s grid point(s) + ${boundaries.length} boundary±1-frame point(s) (from ${boundaryValues.size} scene boundaries) = ${ts.length} deduplicated time point(s)`);
}

const h = async (t) => createHash('sha1').update(await framePng(page, t)).digest('hex').slice(0, 12);
const fwd = {};
for (const t of ts) fwd[t] = await h(t);
const rev = {};
for (const t of [...ts].reverse()) rev[t] = await h(t);
const shuf = {};
for (const t of [...ts].sort((a, b) => ((a * 7919) % 1) - ((b * 7919) % 1))) shuf[t] = await h(t);
await close();

const bad = ts.filter((t) => fwd[t] !== rev[t] || fwd[t] !== shuf[t]);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      url,
      fps: FPS,
      duration: DURATION,
      source: { grid_step: GRID_STEP, grid_points: grid.length, boundary_points: boundaries.length, boundaries_found: boundaryValues.size },
      times: ts,
      fwd,
      rev,
      shuf,
      mismatches: bad,
    },
    null,
    1,
  ),
);
console.log(bad.length ? `determinism: FAIL ${bad.length}/${ts.length} mismatches: ${bad.join(', ')}` : `determinism: PASS ${ts.length} times identical across forward/reverse/shuffled seeks (full DURATION=${DURATION}s)`);
console.log(`written ${out}`);
process.exit(bad.length ? 1 : 0);
