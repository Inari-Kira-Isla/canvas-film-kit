#!/usr/bin/env node
// narration/build-mix.mjs — assembles audio/mix.wav by placing each N unit's WAV at the film-clock
// position narration/build-timeline.mjs already computed for it (src/content/timeline.json's
// n_units[].start_s), so `kit export`'s auto-detected audio (export-mp4.mjs) has a single track to
// mux for a narration-driven project — the SAME role audio/track.wav plays for the music profile.
//
// Uses ffmpeg's `adelay` (silence-pad each unit to its own start time) + `amix` (sum all delayed
// streams) — no re-encoding of the individual unit WAVs beyond the final mixdown, no external
// dependency beyond the ffmpeg this kit already requires everywhere else.
//
// Usage: node build-mix.mjs [repoRoot] [--audio-dir audio/vo] [--out audio/mix.wav]
// Exit: 0 = wrote the mix, 1 = timeline.json missing/not measured, 2 = ffmpeg failed.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
let rootArg = '.';
let audioDirArg = 'audio/vo';
let outArg = 'audio/mix.wav';
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--audio-dir') audioDirArg = argv[++i];
  else if (a === '--out') outArg = argv[++i];
  else if (a.startsWith('--')) { console.error(`build-mix: unknown flag ${a}`); process.exit(1); }
  else rootArg = a;
}
const root = path.resolve(rootArg);

const timelinePath = path.join(root, 'src/content/timeline.json');
if (!existsSync(timelinePath)) {
  console.error(`build-mix: ${timelinePath} does not exist (run narration/build-timeline.mjs / \`kit tts build\` first)`);
  process.exit(1);
}
let timeline;
try {
  timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
} catch (e) {
  console.error(`build-mix: failed to parse ${timelinePath}: ${e.message}`);
  process.exit(1);
}
if (timeline.timing_source !== 'measured') {
  console.error(`build-mix: timing_source=${JSON.stringify(timeline.timing_source)} (needs 'measured' — no real per-unit audio to place in ESTIMATE mode)`);
  process.exit(1);
}

const units = (timeline.n_units ?? []).filter((n) => n.file);
if (units.length === 0) {
  console.error('build-mix: timeline.json has no n_units with a file — nothing to mix');
  process.exit(1);
}
const audioDir = path.join(root, audioDirArg);
for (const u of units) {
  const p = path.join(audioDir, u.file);
  if (!existsSync(p)) {
    console.error(`build-mix: not found: ${p}`);
    process.exit(1);
  }
}

const outPath = path.resolve(root, outArg);
mkdirSync(path.dirname(outPath), { recursive: true });

// One `-i` per unit, `adelay` pads it with silence up to its own film-clock start (ms, both
// channels), then `amix` sums everything down to one stream. `duration=longest` keeps the mix as
// long as the latest-ending unit; `dropout_transition=0` avoids a fade artifact amix would otherwise
// apply when an input stream ends before the others. A final `apad=whole_dur=<duration_s>` then pads
// the mix with silence out to the FULL film duration (timeline.json's own duration_s, which includes
// content/pauses.json's `tail` seconds after the last unit ends) — without this, the mix ends
// exactly when the last unit does, and export-mp4.mjs's ffmpeg `-shortest` flag (needed so a video/
// audio length mismatch never produces a silently frozen tail) would instead TRUNCATE the video's
// own closing tail to match the shorter audio track (K3 verifier finding, caught by ffprobe'ing this
// demo's own export before considering it done).
const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error'];
for (const u of units) ffArgs.push('-i', path.join(audioDir, u.file));
const filterParts = units.map((u, i) => {
  const delayMs = Math.max(0, Math.round(u.start_s * 1000));
  return `[${i}:a]adelay=${delayMs}|${delayMs}[a${i}]`;
});
const mixInputs = units.map((_, i) => `[a${i}]`).join('');
const wholeDur = timeline.duration_s;
const filter = `${filterParts.join(';')};${mixInputs}amix=inputs=${units.length}:duration=longest:dropout_transition=0,apad=whole_dur=${wholeDur}[mix]`;
ffArgs.push('-filter_complex', filter, '-map', '[mix]', outPath);

const r = spawnSync('ffmpeg', ffArgs, { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(`build-mix: ffmpeg failed (exit ${r.status})`);
  console.error(r.stderr ?? r.stdout ?? '');
  process.exit(2);
}
console.log(`build-mix: wrote ${path.relative(root, outPath)} (${units.length} unit(s) placed by film-clock start_s)`);
process.exit(0);
