#!/usr/bin/env node
// narration/measure-onset.mjs — TRUE acoustic onset of an audio file, measured directly off the
// waveform with ffmpeg's `silencedetect` filter. Zero Python (design doc §2.2/§9 K3 row).
//
// WHY MEASURE THIS INSTEAD OF TRUSTING A TTS PROVIDER'S OWN TIMESTAMP: a provider's self-reported
// "first word starts at t0" can be a fixed lead-in constant the engine always reports, not an actual
// measurement of a given clip's real silence — using it directly as a caption's on-screen start time
// can put the caption a few frames ahead of where the voice actually starts. Measuring the real
// acoustic onset independently, off the rendered audio file itself, is the only way to catch that.
//
// METHOD: decode the input to canonical 48kHz PCM WAV first (so silencedetect always sees a
// consistent sample format regardless of whether the input was mp3/wav/m4a), then run
// `silencedetect=noise=<db>dB:d=<mindur>` and read the first `silence_end` event IF the file's first
// `silence_start` is at (approximately) t=0 — i.e. "how long is the LEADING silence before the voice
// starts", not any mid-file pause. A file with no detected leading silence at all (talks
// immediately) reports onset_s=0.
//
// Reports onset at THREE thresholds (-50/-40/-30 dB) for transparency — `--noise-db` (default -40)
// selects which one is the CANONICAL `onset_s` a caller should actually use.
//
// Usage: node measure-onset.mjs <audio.mp3|.wav> [--noise-db -40] [--min-dur 0.02] [--json out.json]
// Exit: 0 = measured (onset_s always present, even if 0), 2 = bad args / ffmpeg failure.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
function optNum(flag, def) {
  const i = argv.indexOf(flag);
  return i === -1 ? def : Number(argv[i + 1]);
}
const inputPath = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
if (!inputPath) {
  console.error('measure-onset: needs <audio> as the first argument');
  process.exit(2);
}
if (!existsSync(inputPath)) {
  console.error(`measure-onset: not found: ${inputPath}`);
  process.exit(2);
}
const CANONICAL_DB = optNum('--noise-db', -40);
const MIN_DUR = optNum('--min-dur', 0.02);
let jsonOut;
{
  const i = argv.indexOf('--json');
  if (i !== -1) jsonOut = argv[i + 1];
}

const tmpDir = mkdtempSync(path.join(tmpdir(), 'measure-onset-'));
function cleanup() {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
}
process.on('exit', cleanup);

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { out: (r.stderr ?? '') + (r.stdout ?? ''), status: r.status };
}

const canonicalPath = path.join(tmpDir, 'canonical.wav');
{
  const { out, status } = ffmpeg(['-y', '-hide_banner', '-nostats', '-i', inputPath, '-vn', '-ar', '48000', '-c:a', 'pcm_s16le', canonicalPath]);
  if (status !== 0 || !existsSync(canonicalPath)) {
    console.error(`measure-onset: canonical decode failed (${inputPath})`);
    console.error(out.slice(-2000));
    process.exit(2);
  }
}

function silenceEvents(noiseDb, minDur) {
  const { out } = ffmpeg(['-hide_banner', '-nostats', '-i', canonicalPath, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`, '-f', 'null', '-']);
  const starts = [...out.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...out.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  return { starts, ends };
}

// "Leading silence end" = the acoustic onset: only counts if the FIRST detected silence starts at
// (approximately) t=0 — a silence detected later in the file is a mid-speech pause, not lead-in.
function leadingOnset(noiseDb, minDur) {
  const { starts, ends } = silenceEvents(noiseDb, minDur);
  if (starts.length === 0) return 0; // never below threshold at all -> starts loud, onset 0
  if (starts[0] > 0.005) return 0; // first silence isn't at the very start -> file starts non-silent
  if (ends.length === 0) return null; // pathological: whole file below threshold
  return Math.round(ends[0] * 10000) / 10000;
}

const THRESHOLDS_DB = [-50, -40, -30];
const thresholds = THRESHOLDS_DB.map((db) => ({ noise_db: db, min_dur: MIN_DUR, onset_s: leadingOnset(db, MIN_DUR) }));
const canonical = thresholds.find((t) => t.noise_db === CANONICAL_DB);
if (!canonical) {
  console.error(`measure-onset: --noise-db ${CANONICAL_DB} is not in the fixed ${JSON.stringify(THRESHOLDS_DB)} set (deliberate — comparing all three is the point)`);
  process.exit(2);
}
if (canonical.onset_s === null) {
  console.error(`measure-onset: --noise-db ${CANONICAL_DB} found the whole file below threshold — not normal, check whether this is a silent file`);
  process.exit(2);
}

const summary = {
  file: path.relative(process.cwd(), inputPath),
  canonical_noise_db: CANONICAL_DB,
  canonical_min_dur: MIN_DUR,
  onset_s: canonical.onset_s,
  thresholds,
};
console.log(`measure-onset: ${summary.file}`);
for (const t of thresholds) console.log(`  noise=${t.noise_db}dB d=${t.min_dur}s -> onset ${t.onset_s === null ? 'n/a' : t.onset_s.toFixed(4) + 's'}${t.noise_db === CANONICAL_DB ? '  <- canonical' : ''}`);
console.log(`  onset_s (canonical): ${summary.onset_s}`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');
  console.log(`wrote ${jsonOut}`);
}
process.exit(0);
