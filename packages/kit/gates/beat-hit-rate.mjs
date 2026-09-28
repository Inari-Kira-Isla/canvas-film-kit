#!/usr/bin/env node
// beat-hit-rate.mjs — music-profile-only gate (K2, design doc §3.1/§9): what fraction of the
// track's detected beats (audio/beats.json) land within ±1 video frame of a VISUAL EVENT the film
// itself claims (`src/core/timeline.ts`'s `export const VISUAL_EVENTS: number[]`)? A film that
// never reacts to its own beat grid defeats the entire point of the music profile — but this is a
// judgment call about FEEL, not a hard correctness bug, so it is a WARN below a threshold, never a
// FAIL (per the design doc: "未校準唔做 FAIL" — nobody has calibrated what "good" looks like across
// enough real films yet to make this a release-blocking hard gate).
//
// Contract: `src/core/timeline.ts` MAY export `VISUAL_EVENTS: number[]` (timeline seconds where a
// scene claims a visible reaction to the beat). No export at all -> SKIP (most projects, including
// every non-music profile, will never have this). No audio/beats.json yet -> SKIP (new project,
// `kit beats` not run yet) — same "SKIP until the input exists" shape as fact-strings-check.mjs.
//
// Usage: node beat-hit-rate.mjs [repoRoot] [beatsJson] [--threshold 0.7]
// Exit codes: ALWAYS 0 (WARN is not a failure) unless the script itself could not run (2).
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let threshold = 0.7;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--threshold') threshold = Number(argv[++i]);
  else if (a.startsWith('--')) {
    console.error(`beat-hit-rate: unknown flag ${a}`);
    process.exit(2);
  } else positional.push(a);
}
const root = path.resolve(positional[0] ?? '.');
const beatsArg = positional[1];
const require = createRequire(import.meta.url);

function done(status, msg) {
  console.log(`beat-hit-rate: [${status}] ${msg}`);
  process.exit(0); // always 0 — see file header
}
function fail(msg) {
  console.error(`beat-hit-rate: ${msg}`);
  process.exit(2);
}

const configPath = path.join(root, 'src/config.ts');
if (!existsSync(configPath)) done('SKIP', 'src/config.ts not found');

let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  fail(`esbuild not found via normal Node module resolution (${e.message})`);
}
async function importCode(code) {
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}
function bundleFile(entryFile) {
  const r = esbuild.buildSync({ entryPoints: [entryFile], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return r.outputFiles[0].text;
}

const configModule = await importCode(bundleFile(configPath));
const PROFILE = configModule.PROFILE;
if (PROFILE !== 'music') done('SKIP', `PROFILE="${PROFILE}" is not "music" — beat-hit-rate only applies to the music profile`);

const beatsPath = path.resolve(beatsArg ?? path.join(root, 'audio/beats.json'));
if (!existsSync(beatsPath)) done('SKIP', `${path.relative(root, beatsPath)} not found yet — run \`kit beats <audio>\` first (not a permanent SKIP)`);
let beatsData;
try {
  beatsData = JSON.parse(readFileSync(beatsPath, 'utf8'));
} catch (e) {
  fail(`${beatsPath} is not valid JSON: ${e.message}`);
}
const beats = beatsData.beats;
if (!Array.isArray(beats) || !beats.length) fail(`${beatsPath} has no non-empty "beats" array`);

const timelinePath = path.join(root, 'src/core/timeline.ts');
if (!existsSync(timelinePath)) fail('src/core/timeline.ts not found');
let timelineModule;
try {
  timelineModule = await importCode(bundleFile(timelinePath));
} catch (e) {
  fail(`could not bundle/import src/core/timeline.ts: ${e.stack || e.message}`);
}
const VISUAL_EVENTS = timelineModule.VISUAL_EVENTS;
if (VISUAL_EVENTS === undefined) done('SKIP', 'src/core/timeline.ts does not export VISUAL_EVENTS — add `export const VISUAL_EVENTS: number[]` (the timeline seconds a scene visibly reacts to the beat) to enable this check');
if (!Array.isArray(VISUAL_EVENTS)) fail('src/core/timeline.ts exports VISUAL_EVENTS but it is not an array');

const FPS = configModule.FPS ?? timelineModule.FPS ?? 30;
if (typeof FPS !== 'number') fail('could not determine FPS (src/config.ts export FPS)');
const frame = 1 / FPS;

const sortedEvents = [...VISUAL_EVENTS].sort((a, b) => a - b);
function nearestEventDist(b) {
  let best = Infinity;
  for (const e of sortedEvents) {
    const d = Math.abs(e - b);
    if (d < best) best = d;
    if (e > b + 1) break;
  }
  return best;
}
let hits = 0;
const misses = [];
for (const b of beats) {
  const d = nearestEventDist(b);
  if (d <= frame + 1e-9) hits++;
  else misses.push({ beat: b, nearestDist: +d.toFixed(4) });
}
const hitRate = hits / beats.length;
const summary = `${hits}/${beats.length} beats (${(hitRate * 100).toFixed(1)}%) have a VISUAL_EVENTS entry within ±1 frame (${(frame * 1000).toFixed(1)}ms @ ${FPS}fps) — threshold ${(threshold * 100).toFixed(0)}%`;
if (misses.length) console.log(`beat-hit-rate: ${misses.length} miss(es), first few: ${JSON.stringify(misses.slice(0, 5))}`);
done(hitRate >= threshold ? 'PASS' : 'WARN', summary);
