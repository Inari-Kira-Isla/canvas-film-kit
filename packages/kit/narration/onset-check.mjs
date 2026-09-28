#!/usr/bin/env node
// narration/onset-check.mjs — INDEPENDENT caption-onset accuracy check, zero Python.
//
// Answers: does the RENDERED caption's first visible frame match where the narrator's voice
// ACTUALLY starts, within <=1 frame? "Rendered" means frame-quantized the same way a HyperFrames-
// style tick() does it (frame = floor(clock*FPS); a caption with t_in becomes visible at the
// smallest frame f with f/FPS >= t_in, i.e. f = ceil(t_in*FPS)) — not a raw-float comparison.
//
// WHY "INDEPENDENT" MATTERS: this script RE-MEASURES the acoustic onset straight off the raw
// audio/vo/<file> with measure-onset.mjs (ffmpeg silencedetect) every time it runs — it never reads
// any word-timestamp JSON, never reads the manifest a TTS provider wrote, and would catch a wrong
// `start_s` in timeline.json even if that number itself came from a correct measurement but was then
// hand-edited wrong afterwards. Comparing a number to a copy of itself (reading the same
// self-reported timestamp on both sides of a check) always "passes" regardless of whether the
// underlying number is actually right — this script is built specifically to never do that.
//
// true_onset(N unit) = timeline.json's n_units[n_id].start_s (film-clock position where that N
//                       unit's WAV starts) + measure-onset.mjs's measured onset_s of that unit's raw
//                       audio file (real silence-to-voice acoustic measurement, NOT a word
//                       timestamp).
// true_onset(card)    = true_onset(card's N unit) — every card sharing an N unit shares its onset.
//
// Usage: node onset-check.mjs [repoRoot] [--noise-db -40] [--json qa/onset-accuracy.json] [--audio-dir audio/vo]
// Exit: 0 = every card within 1 frame, 1 = at least one card off by >1 frame, 2 = couldn't run
// (missing timeline.json/audio files/measure-onset.mjs failure).
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
let rootArg = '.';
let noiseDb = -40;
let jsonOut;
let audioDirArg = 'audio/vo';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--noise-db') noiseDb = Number(argv[++i]);
  else if (a === '--json') jsonOut = argv[++i];
  else if (a === '--audio-dir') audioDirArg = argv[++i];
  else if (a.startsWith('--')) { console.error(`onset-check: unknown flag ${a}`); process.exit(2); }
  else rootArg = a;
}
const root = path.resolve(rootArg);

function measureOnset(audioPath, db) {
  const outJson = `${audioPath}.onset-check-tmp.json`;
  const r = spawnSync('node', [path.join(HERE, 'measure-onset.mjs'), audioPath, '--noise-db', String(db), '--json', outJson], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(outJson)) {
    console.error(`onset-check: measure-onset.mjs failed (${audioPath})`);
    console.error(r.stdout ?? '');
    console.error(r.stderr ?? '');
    process.exit(2);
  }
  let data;
  try {
    data = JSON.parse(readFileSync(outJson, 'utf8'));
  } finally {
    try { unlinkSync(outJson); } catch { /* best-effort */ }
  }
  return data.onset_s;
}

const timelinePath = path.join(root, 'src/content/timeline.json');
if (!existsSync(timelinePath)) {
  console.error(`onset-check: ${timelinePath} does not exist (run narration/build-timeline.mjs first?)`);
  process.exit(2);
}
let timeline;
try {
  timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
} catch (e) {
  console.error(`onset-check: failed to parse ${timelinePath}: ${e.message}`);
  process.exit(2);
}

if (timeline.timing_source !== 'measured') {
  console.error(`onset-check: timeline.json timing_source=${JSON.stringify(timeline.timing_source)} (needs 'measured' — i.e. a real audio manifest existed; ESTIMATE mode has no real audio to measure against)`);
  process.exit(2);
}

const fps = timeline.fps;
const nUnits = new Map((timeline.n_units ?? []).map((n) => [n.n_id, n]));
const audioDir = path.join(root, audioDirArg);

const onsetCache = new Map();
const rows = [];
for (const card of timeline.cards ?? []) {
  const nId = card.n_id;
  const nUnit = nUnits.get(nId);
  if (!nUnit || !nUnit.file) {
    console.error(`onset-check: n_unit ${nId} has no 'file' (ESTIMATE timing has no real audio)`);
    process.exit(2);
  }
  if (!onsetCache.has(nId)) {
    const audioPath = path.join(audioDir, nUnit.file);
    if (!existsSync(audioPath)) {
      console.error(`onset-check: not found: ${audioPath}`);
      process.exit(2);
    }
    onsetCache.set(nId, measureOnset(audioPath, noiseDb));
  }
  const measuredOnsetS = onsetCache.get(nId);
  const trueOnset = Math.round((nUnit.start_s + measuredOnsetS) * 10000) / 10000;
  const renderedFrame = Math.ceil(card.start * fps - 1e-9);
  const renderedVisibleS = Math.round((renderedFrame / fps) * 10000) / 10000;
  const deviationS = Math.round((renderedVisibleS - trueOnset) * 10000) / 10000;
  const deviationFrames = Math.round(deviationS * fps * 1000) / 1000;
  rows.push({
    card_id: card.card_id,
    n_id: nId,
    card_start_s: card.start,
    n_unit_start_s: nUnit.start_s,
    measured_acoustic_onset_s: measuredOnsetS,
    measured_noise_db: noiseDb,
    true_onset_s: trueOnset,
    rendered_frame: renderedFrame,
    rendered_visible_s: renderedVisibleS,
    deviation_s: deviationS,
    deviation_frames: deviationFrames,
    within_1_frame: Math.abs(deviationFrames) <= 1.0,
  });
}

if (rows.length === 0) {
  console.error('onset-check: timeline.json has no cards');
  process.exit(2);
}

const maxDevFrames = Math.max(...rows.map((r) => Math.abs(r.deviation_frames)));
const summary = {
  method: 'independent acoustic re-measurement (ffmpeg silencedetect via measure-onset.mjs) — never reads a word-timestamp JSON or the TTS manifest\'s own start_s',
  fps,
  threshold_frames: 1.0,
  rows,
  max_abs_deviation_frames: Math.round(maxDevFrames * 1000) / 1000,
  verdict: maxDevFrames <= 1.0 ? 'PASS' : 'FAIL',
};
const outPath = jsonOut ? path.resolve(jsonOut) : path.join(root, 'qa/onset-accuracy.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.error(`\nwrote ${outPath}`);
process.exit(summary.verdict === 'PASS' ? 0 : 1);
