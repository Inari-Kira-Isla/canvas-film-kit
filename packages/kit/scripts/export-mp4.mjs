#!/usr/bin/env node
// export-mp4.mjs — deterministic export: renders every frame through window.__renderAt and pipes
// PNGs into ffmpeg.
// Usage: node export-mp4.mjs [url] [out.mp4] [durationSeconds] [fps] [--audio <path>] [--skip-gate "<reason>"]
// --audio <path> (K2): mux this file in as the exported MP4's audio track (AAC, -shortest). Meant
// for the music profile's own track (audio/track.wav or an equivalent) — omit for every other
// profile, which still exports video-only exactly as K1 always did.
//
// durationSeconds/fps (2026-09-29 fix, I4 in the publish review): when NOT given explicitly (as a
// positional arg or FILM_DURATION/FILM_FPS env var), this used to silently default to 30/30 instead
// of reading the film's own src/config.ts DURATION/FPS (the one SSOT every other gate/script reads —
// see determinism.mjs/boundary-diff.mjs's window.__meta.DURATION checks). A `DURATION=6` config used
// to export a 30s MP4 (silently truncating a shorter film's ending frames as frozen/undefined, or
// padding a longer one's export short). Now: once the page is open, an explicit CLI/env value still
// always wins; otherwise this reads window.__meta (main.ts guarantees it exists) for the real value.
//
// export is the one step nobody skips — there is no deliverable without it — so `kit gate` runs
// FIRST, right here, and a non-zero gate exit blocks the render. `--skip-gate "<reason>"` is the
// one sanctioned escape hatch — it still renders, but every use is appended to
// qa/gate_skips.jsonl (tracked in git — see scaffold/new-film.mjs's .gitignore note — meant to be
// read at review time), and a real reason string is REQUIRED: at least 10 non-whitespace
// characters, and it must not look like a shifted URL/flag argument.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../render/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const rawArgs = process.argv.slice(2);
let audioPath;
let audioExplicit = false;
{
  const audioIdx = rawArgs.indexOf('--audio');
  if (audioIdx !== -1) {
    audioPath = rawArgs[audioIdx + 1];
    audioExplicit = true;
    rawArgs.splice(audioIdx, 2);
  }
}
let skipReason;
const skipIdx = rawArgs.indexOf('--skip-gate');
if (skipIdx !== -1) {
  skipReason = rawArgs[skipIdx + 1];
  rawArgs.splice(skipIdx, 2);
}
if (skipIdx !== -1) {
  const MIN_REASON_CHARS = 10;
  const trimmed = (skipReason ?? '').trim();
  const nonWhitespaceLen = trimmed.replace(/\s+/g, '').length;
  if (nonWhitespaceLen < MIN_REASON_CHARS) {
    console.error(
      `export-mp4: --skip-gate reason needs at least ${MIN_REASON_CHARS} non-whitespace characters (got ${nonWhitespaceLen}: ${JSON.stringify(trimmed)}) — ` +
        `"kit export -- <url> <out> <dur> <fps> --skip-gate \\"<reason>\\"", a single character or empty string is not a reason.`,
    );
    process.exit(2);
  }
  if (/^(https?:\/\/|--)/i.test(trimmed)) {
    console.error(
      `export-mp4: --skip-gate reason looks like a URL or a flag (${JSON.stringify(trimmed)}) — argument order is probably wrong. ` +
        `Correct order: <url> <out> <dur> <fps> --skip-gate "<reason>" (--skip-gate and its reason go last).`,
    );
    process.exit(2);
  }
}

const url = rawArgs[0] ?? 'http://localhost:5173/?paused';
const out = rawArgs[1] ?? 'out.mp4';
// Explicit only when actually given (arg or env) — see window.__meta fallback below, right after
// the page loads, for the "nothing given" case. 30/30 remains the absolute last-resort default, used
// only if __meta itself is missing DURATION/FPS (shouldn't happen — main.ts always sets both).
const explicitDuration = rawArgs[2] !== undefined || process.env.FILM_DURATION !== undefined;
const explicitFps = rawArgs[3] !== undefined || process.env.FILM_FPS !== undefined;
let DURATION = Number(rawArgs[2] ?? process.env.FILM_DURATION ?? 30);
let FPS = Number(rawArgs[3] ?? process.env.FILM_FPS ?? 30);

// ---- auto-detect the project's own audio when --audio was not given explicitly ----
// K2 shipped `--audio <path>` as the ONLY way to mux audio in — a plain `kit export` (exactly what
// every project's own `npm run export` script calls) produced a video-only MP4 even for the music
// profile, whose whole point is a track. Fixed here (K3 verifier finding): auto-pick the project's
// own audio by DRIVER/PROFILE (src/config.ts), the SAME convention gate.mjs/story-metrics.mjs
// already read that file with. `--audio` always wins when given explicitly.
const root = process.cwd();
function readConfigConst(name) {
  const configPath = path.join(root, 'src/config.ts');
  if (!existsSync(configPath)) return undefined;
  const m = readFileSync(configPath, 'utf8').match(new RegExp(`export const ${name}[^=]*=\\s*['"]([\\w-]+)['"]`));
  return m ? m[1] : undefined;
}
if (!audioExplicit) {
  const driver = readConfigConst('DRIVER');
  const profile = readConfigConst('PROFILE');
  let candidates = [];
  if (driver === 'music' || profile === 'music') {
    candidates = ['audio/track.wav', 'audio/track.mp3', 'audio/mix.wav'];
  } else if (driver === 'narration' || profile === 'explainer' || profile === 'history' || profile === 'economics') {
    candidates = ['audio/mix.wav'];
  }
  const found = candidates.map((p) => path.join(root, p)).find((p) => existsSync(p));
  if (found) {
    audioPath = found;
    console.log(`export-mp4: auto-detected audio for ${driver ? `DRIVER="${driver}"` : `PROFILE="${profile}"`}: ${path.relative(root, found)} (override with --audio <path>)`);
  } else if (driver === 'music' || driver === 'narration' || profile === 'music' || profile === 'explainer' || profile === 'history' || profile === 'economics') {
    console.error(
      `export-mp4: WARN: ${driver ? `DRIVER="${driver}"` : `PROFILE="${profile}"`} normally has an audio track, but none of [${candidates.join(', ')}] was found — ` +
        `exporting VIDEO-ONLY. This is expected before audio exists yet (e.g. \`kit beats\`/\`kit tts build\` not run yet); pass --audio <path> once you have one.`,
    );
  }
}

// ---- gate, before a single frame is rendered ----
if (skipReason !== undefined) {
  mkdirSync('qa', { recursive: true });
  appendFileSync('qa/gate_skips.jsonl', JSON.stringify({ ts: new Date().toISOString(), reason: skipReason, url, out }) + '\n');
  console.error(`export-mp4: WARN: --skip-gate in use, reason written to qa/gate_skips.jsonl (must be read at review time): "${skipReason}"`);
} else {
  console.log('export-mp4: running `kit gate` before export (see qa/gate.json)…');
  const g = spawnSync('node', [path.join(here, '..', 'gates', 'gate.mjs'), '--url', url], { stdio: 'inherit' });
  if ((g.status ?? 1) !== 0) {
    console.error('export-mp4: gate FAILED — no MP4 rendered. Fix the failing gate step(s) above, or re-run with --skip-gate "<reason>" (written to qa/gate_skips.jsonl for review).');
    process.exit(1);
  }
}

// Real GPU (system Chrome first, bundled Chromium fallback), not headless software rendering — a
// SwiftShader/llvmpipe renderer here means every downstream fps/perf number is fake.
const { browser } = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => '__renderAt' in window && '__meta' in window);

// I4 fix: fall back to the film's own window.__meta.DURATION/FPS (main.ts's copy of
// src/config.ts's SSOT — see determinism.mjs/boundary-diff.mjs, which already read the same field)
// whenever the caller didn't explicitly pass a duration/fps. An explicit --audio-style override
// (positional arg or FILM_DURATION/FILM_FPS env var) always still wins.
const meta = await page.evaluate(() => window.__meta);
if (!explicitDuration && typeof meta?.DURATION === 'number') DURATION = meta.DURATION;
if (!explicitFps && typeof meta?.FPS === 'number') FPS = meta.FPS;

// --audio <path> (K2, music profile): muxes a second ffmpeg input as the AAC audio track,
// `-shortest` trims either stream to the shorter of the two so a video/audio length mismatch never
// silently produces a trailing silent-video or frozen-frame tail. Omitted entirely = the exact same
// video-only ffmpeg invocation K1 always ran (no behaviour change for non-music exports).
const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-'];
if (audioPath) ffArgs.push('-i', audioPath);
ffArgs.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p');
if (audioPath) ffArgs.push('-c:a', 'aac', '-b:a', '160k', '-shortest');
ffArgs.push('-movflags', '+faststart', out);
const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

let ffFailed = false;
ff.on('error', () => { ffFailed = true; });

const total = FPS * DURATION;
for (let f = 0; f < total; f++) {
  const b64 = await page.evaluate((t) => { window.__renderAt(t); return document.querySelector('canvas').toDataURL('image/png').split(',')[1]; }, f / FPS);
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 90 === 0) console.log(`frame ${f}/${total}`);
}
ff.stdin.end();
const code = await new Promise((r) => ff.on('close', r));
await browser.close();
if (code !== 0 || ffFailed) {
  console.error(`ffmpeg failed (exit ${code})`);
  process.exit(1);
}
console.log('done', out, `(${DURATION}s @ ${FPS}fps)`);
