#!/usr/bin/env node
// beats.mjs — full-track beat tracker, pure Node (zero Python — design doc §2.2 K1→K2 row). Ports
// the DYNAMIC-PROGRAMMING beat-tracking idea of a real project's `analysis/beat_track.py` (Ellis-
// style: a spectral-flux onset envelope, a period estimate, then a DP pass that finds the single
// best-scoring near-periodic path through the envelope) onto a hand-rolled FFT (fft.mjs) so this
// kit never depends on scipy/numpy/essentia.js (the last of those is AGPL — avoided on purpose).
//
// Accuracy note (also written to every beats.json under `method`): a hand-rolled onset-envelope +
// DP tracker is NOT as accurate as librosa/madmom on real, noisy, mixed music — this is why
// beats.json is a plain, git-friendly JSON file a human can hand-edit, and why `--bpm`/`--offset`
// exist as a direct override that skips detection entirely. It is accurate on a clean, percussive,
// roughly-constant-tempo track (exactly what `make-demo-track.mjs` produces) — that is what this
// script is verified against (see demos/music/docs/beats-accuracy.md if present).
//
// Usage:
//   node beats.mjs <input-audio> [outJson]              # detect
//   node beats.mjs <input-audio> [outJson] --bpm 120 --offset 0.0   # manual override, no detection
// Options: --sr <Hz> (default 22050) --hop <samples> (default 220, ~10ms @ 22050)
//          --nperseg <pow2> (default 1024) --lo-bpm <n> --hi-bpm <n> (tempo search range, default 60-200)
// Exit codes: 0 = wrote beats.json, 1 = bad input/args, 2 = ffmpeg/decode failed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hannWindow, magnitudeSpectrum } from './fft.mjs';

function fail(msg, code = 1) {
  console.error(`beats: ${msg}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let input;
let outArg;
let bpmOverride;
let offsetOverride = 0;
let SR = 22050;
let HOP = 220;
let NPERSEG = 1024;
let LO_BPM = 60;
let HI_BPM = 200;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--bpm') bpmOverride = Number(argv[++i]);
  else if (a === '--offset') offsetOverride = Number(argv[++i]);
  else if (a === '--sr') SR = Number(argv[++i]);
  else if (a === '--hop') HOP = Number(argv[++i]);
  else if (a === '--nperseg') NPERSEG = Number(argv[++i]);
  else if (a === '--lo-bpm') LO_BPM = Number(argv[++i]);
  else if (a === '--hi-bpm') HI_BPM = Number(argv[++i]);
  else if (a.startsWith('--')) fail(`unknown flag ${a}`);
  else positional.push(a);
}
input = positional[0];
outArg = positional[1] ?? 'audio/beats.json';
if (!input) fail('needs <input-audio> — usage: node beats.mjs <input-audio> [outJson] [--bpm N --offset N]');
if (!existsSync(input)) fail(`input not found: ${input}`);
if (NPERSEG & (NPERSEG - 1)) fail(`--nperseg must be a power of two, got ${NPERSEG}`);

// ---------------------------------------------------------------------------------- 1. decode
function decodeToMonoF32(file, sr) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(sr), '-'], {
    maxBuffer: 1024 * 1024 * 512,
  });
  if (r.error) fail(`ffmpeg failed to start: ${r.error.message}`, 2);
  if (r.status !== 0) fail(`ffmpeg exited ${r.status}: ${r.stderr?.toString().slice(0, 2000)}`, 2);
  const buf = r.stdout;
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  return samples;
}

const samples = decodeToMonoF32(input, SR);
if (samples.length < NPERSEG * 4) fail(`decoded audio too short (${samples.length} samples @ ${SR}Hz) to track beats`, 2);
const durationSec = samples.length / SR;

// ---------------------------------------------------------------------------------- manual override
function writeBeats(obj) {
  mkdirSync(path.dirname(outArg), { recursive: true });
  writeFileSync(outArg, JSON.stringify(obj, null, 2) + '\n');
  console.log(`beats: wrote ${outArg} — bpm=${obj.bpm} offsetSec=${obj.offsetSec} n_beats=${obj.beats.length} (method=${obj.method})`);
}

if (bpmOverride !== undefined) {
  if (!(bpmOverride > 0)) fail(`--bpm must be > 0, got ${bpmOverride}`);
  const period = 60 / bpmOverride;
  const beats = [];
  for (let t = offsetOverride; t < durationSec; t += period) beats.push(+t.toFixed(4));
  writeBeats({
    source: input, // as given on the command line — never resolved to an absolute path (this file
    // is meant to be committed; an absolute path would bake one machine's home directory into it)
    sampleRate: SR,
    hop: HOP,
    nperseg: NPERSEG,
    method: 'manual-override',
    bpm: bpmOverride,
    offsetSec: offsetOverride,
    durationSec: +durationSec.toFixed(4),
    beats,
  });
  process.exit(0);
}

// ---------------------------------------------------------------------------------- 2. STFT + onset envelope
const window = hannWindow(NPERSEG);
const numFrames = Math.max(0, Math.floor((samples.length - NPERSEG) / HOP) + 1);
if (numFrames < 8) fail(`too few STFT frames (${numFrames}) — track/hop/nperseg mismatch`, 2);

const frameTimes = new Float64Array(numFrames);
let prevLogS = null;
const onset = new Float64Array(numFrames - 1); // onset[i] = flux between frame i and frame i+1
const windowed = new Float64Array(NPERSEG);
for (let f = 0; f < numFrames; f++) {
  const start = f * HOP;
  frameTimes[f] = start / SR;
  for (let i = 0; i < NPERSEG; i++) windowed[i] = (samples[start + i] ?? 0) * window[i];
  const mag = magnitudeSpectrum(windowed, NPERSEG);
  const logS = new Float64Array(mag.length);
  for (let k = 0; k < mag.length; k++) logS[k] = Math.log1p(100 * mag[k]);
  if (prevLogS) {
    let flux = 0;
    for (let k = 0; k < logS.length; k++) {
      const d = logS[k] - prevLogS[k];
      if (d > 0) flux += d;
    }
    onset[f - 1] = flux;
  }
  prevLogS = logS;
}
const onsetTimes = frameTimes.subarray(1); // onset[i] time = frameTimes[i+1]

// detrend: subtract a moving average (~0.4s window), clip negative, normalise by std
const framesPerSec = SR / HOP;
const movWin = Math.max(3, Math.round(0.4 * framesPerSec));
function movingAverage(x, w) {
  const n = x.length;
  const out = new Float64Array(n);
  const half = Math.floor(w / 2);
  let sum = 0;
  const q = [];
  for (let i = -half; i < n; i++) {
    const add = i + half < n ? x[i + half] : 0;
    if (i + half < n) { sum += add; q.push(add); } else q.push(0);
    if (q.length > w) sum -= q.shift();
    if (i >= 0) out[i] = sum / Math.min(w, i + half + 1);
  }
  return out;
}
const trend = movingAverage(onset, movWin);
const o = new Float64Array(onset.length);
for (let i = 0; i < o.length; i++) o[i] = Math.max(0, onset[i] - trend[i]);
let std = 0;
{
  const mean = o.reduce((a, b) => a + b, 0) / o.length;
  std = Math.sqrt(o.reduce((a, b) => a + (b - mean) ** 2, 0) / o.length);
}
if (!(std > 1e-9)) fail('onset envelope has ~zero variance — silent/constant audio, cannot track beats', 2);
for (let i = 0; i < o.length; i++) o[i] /= std;

// ---------------------------------------------------------------------------------- 3. tempo (period) estimate
const lagMin = Math.max(1, Math.floor((60 / HI_BPM) * framesPerSec));
const lagMax = Math.min(o.length - 1, Math.ceil((60 / LO_BPM) * framesPerSec));
if (lagMax <= lagMin) fail(`tempo search range [${LO_BPM},${HI_BPM}] bpm produces an empty lag window for this track length`, 2);
let bestLag = lagMin;
let bestAc = -Infinity;
const ac = new Float64Array(lagMax - lagMin + 1);
for (let lag = lagMin; lag <= lagMax; lag++) {
  let s = 0;
  for (let i = 0; i + lag < o.length; i++) s += o[i] * o[i + lag];
  ac[lag - lagMin] = s;
  if (s > bestAc) {
    bestAc = s;
    bestLag = lag;
  }
}
// parabolic sub-frame refinement around the peak
let periodFrames = bestLag;
{
  const i = bestLag - lagMin;
  if (i > 0 && i < ac.length - 1) {
    const y0 = ac[i - 1], y1 = ac[i], y2 = ac[i + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-12) periodFrames = bestLag + 0.5 * (y0 - y2) / denom;
  }
}

// ---------------------------------------------------------------------------------- 4. DP beat tracking (Ellis-style)
const TIGHT = 100;
const lo = Math.max(1, Math.floor(periodFrames * 0.85));
const hi = Math.max(lo + 1, Math.ceil(periodFrames * 1.15));
const n = o.length;
if (n <= hi) fail(`onset envelope (${n} frames) too short relative to estimated period (${periodFrames.toFixed(2)} frames) for DP tracking`, 2);
const score = Float64Array.from(o);
const back = new Int32Array(n).fill(-1);
for (let i = hi; i < n; i++) {
  let bestVal = -Infinity;
  let bestPrev = -1;
  const from = i - hi;
  const to = i - lo;
  for (let prev = from; prev <= to; prev++) {
    const gap = i - prev;
    const pen = -TIGHT * Math.log(gap / periodFrames) ** 2;
    const val = score[prev] + pen;
    if (val > bestVal) {
      bestVal = val;
      bestPrev = prev;
    }
  }
  score[i] = o[i] + bestVal;
  back[i] = bestPrev;
}
// best path end = argmax score over the last ~2 periods
const tailStart = Math.max(0, n - Math.round(periodFrames * 2));
let endIdx = tailStart;
let endVal = -Infinity;
for (let i = tailStart; i < n; i++) {
  if (score[i] > endVal) {
    endVal = score[i];
    endIdx = i;
  }
}
const pathFrames = [];
for (let i = endIdx; i >= 0; i = back[i]) {
  pathFrames.push(i);
  if (back[i] === -1) break;
}
pathFrames.reverse();

const rawBeats = pathFrames.map((i) => onsetTimes[i]);
if (rawBeats.length < 2) fail('DP produced fewer than 2 beats — track too short or too quiet for the estimated tempo', 2);

// ---------------------------------------------------------------------------------- 5. sub-frame onset refinement
// The DP stage above works on a coarse STFT grid (one value per `HOP` samples) and reports a
// frame's START time — but the actual attack transient usually lands partway INTO that frame's
// analysis window (nperseg/SR wide), biasing every detected time a little early or late by up to
// roughly nperseg/(2*SR) seconds. That bias is small in absolute terms but can already exceed a
// single video frame at typical export fps (e.g. ~46ms window vs a 33ms frame at 30fps) — so every
// DP-detected time gets refined here against the RAW, full-resolution PCM: find where a short-time
// amplitude envelope actually crosses a threshold near the coarse estimate (linear-interpolated for
// sub-sample precision), which is accurate to a few samples for anything with a real attack
// transient (percussive hits, most real music) — not for a slow fade-in, which has no sharp edge to
// find (falls back to the coarse DP time unchanged in that case).
function refineOnset(pcm, sr, approxSec, halfWindowSec, smoothSamples) {
  const center = Math.round(approxSec * sr);
  const half = Math.max(smoothSamples, Math.round(halfWindowSec * sr));
  const from = Math.max(0, center - half);
  const to = Math.min(pcm.length - 1, center + half);
  const n = to - from + 1;
  if (n < smoothSamples * 2) return approxSec;
  const env = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.abs(pcm[from + i]);
    if (i >= smoothSamples) sum -= Math.abs(pcm[from + i - smoothSamples]);
    env[i] = sum / Math.min(smoothSamples, i + 1);
  }
  let maxEnv = 0;
  for (let i = 0; i < n; i++) if (env[i] > maxEnv) maxEnv = env[i];
  if (maxEnv <= 1e-6) return approxSec; // silence in this window — nothing to refine against
  const thresh = maxEnv * 0.2;
  for (let i = 1; i < n; i++) {
    if (env[i] >= thresh && env[i - 1] < thresh) {
      const frac = (thresh - env[i - 1]) / (env[i] - env[i - 1] || 1);
      return (from + i - 1 + frac) / sr;
    }
  }
  return approxSec; // no clear rising edge (e.g. a fade-in) — keep the coarse DP time
}
const periodSec = periodFrames * HOP / SR;
const refineHalfWindow = Math.min(0.15, periodSec * 0.3);
const beats = rawBeats.map((t) => +refineOnset(samples, SR, t, refineHalfWindow, 32).toFixed(4));

const ibi = [];
for (let i = 1; i < beats.length; i++) ibi.push(beats[i] - beats[i - 1]);
ibi.sort((a, b) => a - b);
const medianIbi = ibi[Math.floor(ibi.length / 2)];
const bpm = 60 / medianIbi;

writeBeats({
  source: input, // as given — see the manual-override branch above for why this is never resolved to an absolute path
  sampleRate: SR,
  hop: HOP,
  nperseg: NPERSEG,
  method: 'spectral-flux+DP (ported from analysis/beat_track.py concept, see file header)',
  bpm: +bpm.toFixed(2),
  offsetSec: beats[0],
  durationSec: +durationSec.toFixed(4),
  n_beats: beats.length,
  beats,
});
