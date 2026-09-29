#!/usr/bin/env node
// gates/audio-diag.mjs — K6: the final mix must be checked under "phone speaker" conditions, not
// just LUFS. A mix can hit its integrated-loudness target while still being effectively inaudible on
// a phone speaker if almost all of its energy sits below ~200Hz (phone speakers physically cannot
// reproduce that range) — LUFS alone cannot catch that. This script outputs loudnorm (LUFS/TP/LRA) +
// per-band energy ratios in one pass, so "hits the loudness target" and "is actually audible on the
// device most viewers will use" can both be checked before export.
//
// Method (documented as an approximation, not a lab-grade acoustic measurement):
//   - LUFS/TP/LRA: ffmpeg's `loudnorm` filter, `print_format=json`, reading `input_i`/`input_tp`/
//     `input_lra` (the MEASURED values off the original input — unrelated to loudnorm's own target
//     params — so a single pass is already accurate). Done directly on the raw input (WAV or MP4/MP4
//     audio track); this step is unaffected by the canonical-decode issue described below.
//   - Band energy ratios: `astats`'s `RMS level dB` as a proxy — run three times: full-band,
//     `lowpass=200` (a <200Hz proxy), and `highpass=300,lowpass=4000` (a 300Hz-4kHz proxy — roughly
//     the band a phone speaker can actually reproduce with any clarity). RMS dB -> linear power via
//     `power = 10^(dB/10)` (RMS level is a dBFS amplitude figure; power scales with amplitude
//     squared); band ratio = band power / full-band power. Butterworth low/highpass filters are not
//     brick-wall, so there is real leakage across the nominal band edges — this is a same-script,
//     same-filter-chain comparison useful for tracking a mix across revisions, not an FFT-precise
//     spectral integral.
//
// Canonical-decode step: band-ratio measurements are taken off a single-pass, canonically-decoded PCM
// WAV (same channel count, resampled to 48kHz) rather than filtering a compressed container (MP4/AAC)
// directly — chaining container demux+decode and an astats filter graph in one ffmpeg invocation has
// been observed to distort a lowpass/bandpass RMS reading (confirmed empirically: measuring the same
// audio directly from an MP4 vs. from a WAV decoded from that same MP4 disagreed by roughly 2x on the
// low-band ratio, and produced two band ratios that together summed to over 100% — physically
// impossible for two non-overlapping bands). Decoding once to a canonical WAV first and always
// filtering THAT removes the discrepancy. LUFS/TP/LRA are unaffected by this and are measured
// straight off the original input container (R8: whatever a project's actual delivery format is).
//
// Threshold reflection: a full mix WITH dialogue is not directly comparable to a music-only mix for
// the low-band check — human voice fundamentals (roughly 85-180Hz for a typical male voice) live
// inside the very band this check calls "low", so applying a strict low-band ceiling to a whole
// narration-driven film's full mix mostly measures "does this film have a male narrator", not "is the
// music/SFX layer inaudible on a phone speaker". `--low-band-source` exists for this:
//   --low-band-source full       (default, backward compatible): measures the whole input container.
//   --low-band-source stem       : measures only `--stem` (e.g. a music/SFX stem with no dialogue) —
//                                  the check this threshold was actually designed for.
//   --low-band-source gaps       : measures only the silent-of-dialogue windows (via `--dialogue-stem`
//                                  silencedetect) — a compromise when there is no separate stem.
//
// Thresholds (all CLI-overridable, nothing hardcoded):
//   --low-max <pct>   <200Hz ratio ceiling (default 60, i.e. must be <=60%)
//   --mid-min <pct>   300Hz-4kHz ratio floor (default 25, i.e. must be >=25%)
//   --tp-max <dBTP>   true peak ceiling (default -1, i.e. must be <= -1 dBTP)
//   --lufs <LUFS>      integrated-loudness target (default -15)
//   --lufs-tol <LU>    tolerance around the target (default 1, i.e. target+-tol)
//
// Band-measurement source (--low-band-source, default full):
//   --low-band-source full|stem|gaps
//   --stem <path>            required for low-band-source=stem: measure only this file (e.g.
//                            music.wav). Optional for low-band-source=gaps: cut silent windows out
//                            of this file instead of the main input.
//   --dialogue-stem <path>   required for low-band-source=gaps: this dialogue/vocal stem's own
//                            silencedetect finds the "no dialogue" windows.
//   --gap-noise <dB>         silencedetect noise threshold (default -30; lower = stricter silence).
//   --gap-min-dur <sec>      minimum silence duration to count (default 0.3s).
//
// Measurement target: LUFS/TP/LRA always run against the final delivery container (MP4 or WAV — `-vn`
// means an MP4 with no video-codec mapping never errors); band ratios follow `--low-band-source`.
//
// Usage: node audio-diag.mjs <input.wav|.mp4> [--low-max 60] [--mid-min 25] [--tp-max -1]
//                              [--lufs -15] [--lufs-tol 1]
//                              [--low-band-source full|stem|gaps] [--stem path]
//                              [--dialogue-stem path] [--gap-noise -30] [--gap-min-dur 0.3]
//                              [--json out.json]
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
function optNum(flag, def) {
  const i = argv.indexOf(flag);
  if (i === -1) return def;
  return Number(argv[i + 1]);
}
function optStr(flag, def) {
  const i = argv.indexOf(flag);
  if (i === -1) return def;
  return argv[i + 1];
}
let jsonOut;
{
  const i = argv.indexOf('--json');
  if (i !== -1) jsonOut = argv[i + 1];
}
const inputPath = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;

if (!inputPath) {
  console.error('audio-diag: needs input.wav|.mp4 as the first argument');
  process.exit(2);
}
if (!existsSync(inputPath)) {
  console.error(`audio-diag: not found: ${inputPath}`);
  process.exit(2);
}

const LOW_MAX = optNum('--low-max', 60);
const MID_MIN = optNum('--mid-min', 25);
const TP_MAX = optNum('--tp-max', -1);
const LUFS_TARGET = optNum('--lufs', -15);
const LUFS_TOL = optNum('--lufs-tol', 1);

const LOW_BAND_SOURCE = optStr('--low-band-source', 'full');
const STEM_PATH = optStr('--stem', undefined);
const DIALOGUE_STEM_PATH = optStr('--dialogue-stem', undefined);
const GAP_NOISE_DB = optNum('--gap-noise', -30);
const GAP_MIN_DUR = optNum('--gap-min-dur', 0.3);

if (!['full', 'stem', 'gaps'].includes(LOW_BAND_SOURCE)) {
  console.error(`audio-diag: --low-band-source must be full|stem|gaps, got ${LOW_BAND_SOURCE}`);
  process.exit(2);
}
if (LOW_BAND_SOURCE === 'stem' && !STEM_PATH) {
  console.error('audio-diag: --low-band-source stem requires --stem <path>');
  process.exit(2);
}
if (LOW_BAND_SOURCE === 'gaps' && !DIALOGUE_STEM_PATH) {
  console.error('audio-diag: --low-band-source gaps requires --dialogue-stem <path> (used to find the no-dialogue windows)');
  process.exit(2);
}
if (STEM_PATH && !existsSync(STEM_PATH)) {
  console.error(`audio-diag: --stem not found: ${STEM_PATH}`);
  process.exit(2);
}
if (DIALOGUE_STEM_PATH && !existsSync(DIALOGUE_STEM_PATH)) {
  console.error(`audio-diag: --dialogue-stem not found: ${DIALOGUE_STEM_PATH}`);
  process.exit(2);
}

const tmpDir = mkdtempSync(path.join(tmpdir(), 'audio-diag-'));
function cleanup() {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
}
process.on('exit', cleanup);

function ffmpeg(args) {
  // ffmpeg writes its filter/log output to stderr regardless of exit code — spawnSync (which returns
  // stderr on BOTH success and failure) is required here, not execFileSync (which only surfaces
  // stderr via the thrown error on a non-zero exit).
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return (r.stderr ?? '') + (r.stdout ?? '');
}

// See this file's header: always decode to a canonical PCM WAV (original channel count, 48kHz)
// before any astats band measurement.
function decodeCanonical(srcPath, tag) {
  const out = path.join(tmpDir, `${tag}.wav`);
  const log = ffmpeg(['-y', '-hide_banner', '-nostats', '-i', srcPath, '-vn', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
  if (!existsSync(out)) {
    console.error(`audio-diag: canonical decode failed (${srcPath})`);
    console.error(log.slice(-2000));
    process.exit(2);
  }
  return out;
}

function ffprobeDurationSec(srcPath) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', srcPath], { encoding: 'utf8' });
  const n = Number((r.stdout ?? '').trim());
  return Number.isFinite(n) ? n : undefined;
}

function rmsDb(srcPath, filterExtra) {
  const chain = ['aformat=channel_layouts=mono', ...(filterExtra ? [filterExtra] : []), 'astats=metadata=0'].join(',');
  const out = ffmpeg(['-hide_banner', '-nostats', '-i', srcPath, '-vn', '-af', chain, '-f', 'null', '-']);
  const matches = [...out.matchAll(/RMS level dB:\s*(-?[\d.]+|-inf)/g)];
  if (matches.length === 0) {
    console.error(`audio-diag: astats produced no RMS level output (filter=${chain})`);
    console.error(out.slice(-2000));
    process.exit(2);
  }
  const last = matches[matches.length - 1][1];
  return last === '-inf' ? -Infinity : Number(last);
}

function loudnorm(srcPath) {
  const out = ffmpeg(['-hide_banner', '-nostats', '-i', srcPath, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
  const m = out.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!m) {
    console.error('audio-diag: loudnorm produced no JSON summary');
    console.error(out.slice(-2000));
    process.exit(2);
  }
  const j = JSON.parse(m[0]);
  return { lufs: Number(j.input_i), true_peak_dbtp: Number(j.input_tp), lra: Number(j.input_lra) };
}

// Uses the dialogue stem's own silencedetect to find "no dialogue" windows, then cuts and
// concatenates those same windows out of targetPath into one "dialogue-free" temp WAV.
function extractGapsWav(dialogueStemPath, targetPath, noiseDb, minDur) {
  const log = ffmpeg(['-hide_banner', '-nostats', '-i', dialogueStemPath, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`, '-f', 'null', '-']);
  const starts = [...log.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const dur = ffprobeDurationSec(dialogueStemPath);
  const segments = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = ends[i] ?? dur; // the last silence segment can run to end-of-file with no silence_end event
    if (e !== undefined && e > s) segments.push([s, e]);
  }
  if (segments.length === 0) {
    console.error(`audio-diag: --dialogue-stem ${dialogueStemPath} found no silence with noise=${noiseDb}dB:d=${minDur} (try adjusting --gap-noise / --gap-min-dur)`);
    process.exit(2);
  }
  const totalGapDur = segments.reduce((acc, [s, e]) => acc + (e - s), 0);
  const filterParts = segments.map(([s, e], i) => `[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[g${i}]`);
  const concatInputs = segments.map((_, i) => `[g${i}]`).join('');
  const filterComplex = `${filterParts.join(';')};${concatInputs}concat=n=${segments.length}:v=0:a=1[out]`;
  const outPath = path.join(tmpDir, 'gaps.wav');
  ffmpeg(['-y', '-hide_banner', '-nostats', '-i', targetPath, '-filter_complex', filterComplex, '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', outPath]);
  if (!existsSync(outPath)) {
    console.error('audio-diag: gap-window concatenation failed');
    process.exit(2);
  }
  return { path: outPath, segmentCount: segments.length, totalGapDurSec: +totalGapDur.toFixed(2) };
}

function dbToPower(db) {
  return db === -Infinity ? 0 : 10 ** (db / 10);
}

// ---- LUFS/TP/LRA: always measured on the final delivery container itself (no canonical decode —
// this step has never shown the same discrepancy; measuring the original input is already accurate).
const { lufs, true_peak_dbtp, lra } = loudnorm(inputPath);

// ---- Band energy ratios: always through a canonical decode (see header).
const mainCanonical = decodeCanonical(inputPath, 'main');

let bandSrcPath = mainCanonical;
let bandSourceMeta = { low_band_source: 'full', detail: path.relative(process.cwd(), inputPath) };

if (LOW_BAND_SOURCE === 'stem') {
  bandSrcPath = decodeCanonical(STEM_PATH, 'stem');
  bandSourceMeta = { low_band_source: 'stem', detail: path.relative(process.cwd(), STEM_PATH) };
} else if (LOW_BAND_SOURCE === 'gaps') {
  const gapTarget = STEM_PATH ? decodeCanonical(STEM_PATH, 'gap-target') : mainCanonical;
  const gapInfo = extractGapsWav(DIALOGUE_STEM_PATH, gapTarget, GAP_NOISE_DB, GAP_MIN_DUR);
  bandSrcPath = gapInfo.path;
  bandSourceMeta = {
    low_band_source: 'gaps',
    detail: path.relative(process.cwd(), STEM_PATH ?? inputPath),
    dialogue_stem: path.relative(process.cwd(), DIALOGUE_STEM_PATH),
    gap_segment_count: gapInfo.segmentCount,
    gap_total_dur_sec: gapInfo.totalGapDurSec,
  };
}

const totalDb = rmsDb(bandSrcPath, null);
const lowDb = rmsDb(bandSrcPath, 'lowpass=f=200');
const midDb = rmsDb(bandSrcPath, 'highpass=f=300,lowpass=f=4000');

const totalPower = dbToPower(totalDb);
const lowRatioPct = totalPower > 0 ? (dbToPower(lowDb) / totalPower) * 100 : 0;
const midRatioPct = totalPower > 0 ? (dbToPower(midDb) / totalPower) * 100 : 0;

const checks = {
  lufs: { value: lufs, target: LUFS_TARGET, tol: LUFS_TOL, pass: Math.abs(lufs - LUFS_TARGET) <= LUFS_TOL },
  true_peak: { value: true_peak_dbtp, max: TP_MAX, pass: true_peak_dbtp <= TP_MAX },
  low_band_lt_200hz_pct: { value: +lowRatioPct.toFixed(2), max: LOW_MAX, pass: lowRatioPct <= LOW_MAX },
  mid_band_300_4000hz_pct: { value: +midRatioPct.toFixed(2), min: MID_MIN, pass: midRatioPct >= MID_MIN },
};
const verdict = Object.values(checks).every((c) => c.pass) ? 'PASS' : 'FAIL';

console.log(`audio-diag: ${path.relative(process.cwd(), inputPath)}`);
console.log(`  LUFS integrated: ${lufs.toFixed(2)} (target ${LUFS_TARGET}+-${LUFS_TOL}) ${checks.lufs.pass ? 'PASS' : 'FAIL'}`);
console.log(`  true peak: ${true_peak_dbtp.toFixed(2)} dBTP (max ${TP_MAX}) ${checks.true_peak.pass ? 'PASS' : 'FAIL'}`);
console.log(`  LRA: ${lra.toFixed(2)} LU (reference only, no threshold)`);
console.log(`  band source: ${bandSourceMeta.low_band_source} (${bandSourceMeta.detail})${bandSourceMeta.gap_segment_count ? ` [${bandSourceMeta.gap_segment_count} silence segment(s), ${bandSourceMeta.gap_total_dur_sec}s total]` : ''}`);
console.log(`  <200Hz ratio: ${lowRatioPct.toFixed(2)}% (max ${LOW_MAX}%) ${checks.low_band_lt_200hz_pct.pass ? 'PASS' : 'FAIL'}`);
console.log(`  300Hz-4kHz ratio: ${midRatioPct.toFixed(2)}% (min ${MID_MIN}%) ${checks.mid_band_300_4000hz_pct.pass ? 'PASS' : 'FAIL'}`);
console.log(`  overall: ${verdict}`);

const summary = {
  input: path.relative(process.cwd(), inputPath),
  method: 'ffmpeg loudnorm (LUFS/TP/LRA on original container) + astats RMS-dB proxy per band on a canonical-decoded PCM WAV (lowpass 200 / bandpass 300-4000), power = 10^(dB/10)',
  lufs, true_peak_dbtp, lra,
  band_source: bandSourceMeta,
  low_band_lt_200hz_pct: +lowRatioPct.toFixed(2),
  mid_band_300_4000hz_pct: +midRatioPct.toFixed(2),
  raw_rms_db: { total: totalDb, low_lt_200hz: lowDb, mid_300_4000hz: midDb },
  thresholds: { low_max_pct: LOW_MAX, mid_min_pct: MID_MIN, tp_max_dbtp: TP_MAX, lufs_target: LUFS_TARGET, lufs_tol: LUFS_TOL },
  checks,
  verdict,
};
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');
  console.log(`wrote ${jsonOut}`);
}
process.exit(verdict === 'PASS' ? 0 : 1);
