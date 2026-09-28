#!/usr/bin/env node
// tts/build.mjs — `kit tts build`: one TTS pass -> every downstream manifest this kit's narration
// tooling needs (design doc §4.1). Reads content/vo_script.json (one entry per narration unit:
// `[{id, text}]`, `id` = "N unit" id, matching src/content/cards.json's `n_id`), synthesizes each
// line through the chosen provider (tts/provider.mjs), and writes BOTH manifest shapes this kit's
// gates already expect:
//   audio/vo/<id>.wav          — one WAV per N unit
//   audio/vo/manifest.json     — narration/build-timeline.mjs's input: {n:[{n_id,file,duration_s}],
//                                 cards:[{card_id,n_id,start_s,end_s}]}. ONE placeholder card per N
//                                 unit (card_id = "<id>-1", spanning the WHOLE unit) — a project
//                                 whose cards.json splits an N unit into several cards must adjust
//                                 `cards` accordingly (this script only knows the script text, not
//                                 that split).
//   audio/vo/vo_manifest.json  — narration/speech-rate.mjs's input: {order, lines:{id:{text,voice,
//                                 speech_len}}}.
//
// `start_s` in manifest.json ALWAYS comes from narration/measure-onset.mjs's real acoustic
// measurement of the rendered file — NEVER from a provider's own self-reported word timestamp (see
// narration/build-timeline.mjs's header for why that matters). `speech_len` in vo_manifest.json is
// the provider's own last-word end time when word timestamps exist, else the file's own ffprobe
// duration (documented fallback — see tts/providers/*.mjs's own `timingSource` contract).
//
// Caching: each line's synthesis is cached by content hash (provider, voice, lang, rate, text) —
// see tts/provider.mjs's cacheKey(). Re-running this command after an unrelated script edit costs
// nothing and makes zero network calls for unchanged lines; this is also what lets `kit gate`/`kit
// export` run offline once a project's audio/ has been built at least once.
//
// After writing both manifests, if content/cards.json and content/pauses.json already exist, this
// also invokes narration/build-timeline.mjs so `src/content/timeline.json` is refreshed in one step.
//
// Usage:
//   node build.mjs <root> --script <path> --provider <none|edge|minimax|openai|system>
//     [--voice <id>] [--lang zh|en] [--rate 1.0] [--out-dir audio/vo] [--no-cache]
// Exit: 0 = wrote both manifests (+ timeline.json if inputs existed), 1 = bad script/args,
// 2 = a provider call failed.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProvider, cacheKey, readCache, writeCache, redact, PROVIDER_IDS } from './provider.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fail(msg, code = 1) {
  console.error(`tts build: ${msg}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let root;
let scriptArg;
let providerId = 'none';
let voice = 'default';
let lang = 'zh';
let rate = 1.0;
let outDirArg = 'audio/vo';
let noCache = false;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--script') scriptArg = argv[++i];
  else if (a === '--provider') providerId = argv[++i];
  else if (a === '--voice') voice = argv[++i];
  else if (a === '--lang') lang = argv[++i];
  else if (a === '--rate') rate = Number(argv[++i]);
  else if (a === '--out-dir') outDirArg = argv[++i];
  else if (a === '--no-cache') noCache = true;
  else if (a.startsWith('--')) fail(`unknown flag ${a}`);
  else positional.push(a);
}
root = path.resolve(positional[0] ?? '.');
if (!PROVIDER_IDS.includes(providerId)) fail(`--provider must be one of: ${PROVIDER_IDS.join(', ')}`);
const scriptPath = path.resolve(scriptArg ?? path.join(root, 'content/vo_script.json'));
if (!existsSync(scriptPath)) fail(`--script not found: ${scriptPath}`);

let script;
try {
  script = JSON.parse(readFileSync(scriptPath, 'utf8'));
} catch (e) {
  fail(`failed to read/parse ${scriptPath}: ${e.message}`);
}
if (!Array.isArray(script) || script.length === 0) fail(`${scriptPath} must be a non-empty JSON array of {id, text}`);
for (const entry of script) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.text !== 'string') {
    fail(`every script entry needs a string 'id' and 'text': ${JSON.stringify(entry)}`);
  }
}

const provider = await loadProvider(providerId);
const outDir = path.resolve(root, outDirArg);
mkdirSync(outDir, { recursive: true });

function ffprobeDuration(p) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8' }).trim();
  return Number(out);
}
function measureOnset(p) {
  const outJson = `${p}.onset-tmp.json`;
  const r = spawnSync('node', [path.join(HERE, '..', 'narration', 'measure-onset.mjs'), p, '--json', outJson], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(outJson)) {
    fail(`measure-onset.mjs failed for ${p}: ${redact(r.stderr ?? r.stdout ?? '')}`, 2);
  }
  let data;
  try {
    data = JSON.parse(readFileSync(outJson, 'utf8'));
  } finally {
    try { unlinkSync(outJson); } catch { /* best-effort */ }
  }
  return data.onset_s;
}

const nUnits = [];
const cards = [];
const voOrder = [];
const voLines = {};

for (const entry of script) {
  const { id, text } = entry;
  const wavPath = path.join(outDir, `${id}.wav`);
  const key = cacheKey({ provider: providerId, voice, lang, rate, text });

  let synthResult;
  const cached = noCache ? null : readCache(root, key);
  if (cached) {
    copyFileSync(cached.wav, wavPath);
    synthResult = cached.meta;
    console.error(`[${id}] cache hit (${key.slice(0, 12)}...) — no provider call, no network`);
  } else {
    console.error(`[${id}] synthesizing via provider="${providerId}" (${text.length} char(s))...`);
    try {
      synthResult = await provider.synthesize({ text, voice, lang, rate, outWav: wavPath });
    } catch (e) {
      fail(redact(e.message ?? String(e)), 2);
    }
    if (!noCache) {
      const wavBytes = readFileSync(wavPath);
      writeCache(root, key, wavBytes, synthResult);
    }
  }

  const durationSec = ffprobeDuration(wavPath);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    fail(`ffprobe could not read a valid duration from ${wavPath}`, 2);
  }
  const onsetS = measureOnset(wavPath); // ALWAYS re-measured acoustically — never a provider's own
  // self-reported t0 (see build-timeline.mjs's header for why).

  const speechLen = synthResult.words?.length ? synthResult.words[synthResult.words.length - 1].end : durationSec;

  nUnits.push({ n_id: id, file: `${id}.wav`, duration_s: Math.round(durationSec * 1000) / 1000 });
  cards.push({ card_id: `${id}-1`, n_id: id, start_s: onsetS, end_s: Math.round(durationSec * 1000) / 1000 });
  voOrder.push(id);
  voLines[id] = { text, voice, speech_len: Math.round(speechLen * 1000) / 1000 };

  console.error(`[${id}] duration=${durationSec.toFixed(3)}s onset=${onsetS.toFixed(4)}s timingSource=${synthResult.timingSource} words=${synthResult.words?.length ?? 0}`);
}

writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ n: nUnits, cards }, null, 2) + '\n');
writeFileSync(path.join(outDir, 'vo_manifest.json'), JSON.stringify({ order: voOrder, lines: voLines }, null, 2) + '\n');
console.log(`tts build: wrote ${path.join(outDir, 'manifest.json')} + ${path.join(outDir, 'vo_manifest.json')} (${script.length} N unit(s), provider=${providerId})`);

// ---- auto-refresh timeline.json when the project already has cards.json + pauses.json, then
// assemble audio/mix.wav from it (so `kit export`'s auto-detected audio has something to find —
// export-mp4.mjs's own K3 fix) ----
const cardsPath = path.join(root, 'src/content/cards.json');
const pausesPath = path.join(root, 'src/content/pauses.json');
if (existsSync(cardsPath) && existsSync(pausesPath)) {
  const tl = spawnSync('node', [path.join(HERE, '..', 'narration', 'build-timeline.mjs'), root, '--manifest', path.join(outDir, 'manifest.json')], { stdio: 'inherit' });
  if ((tl.status ?? 1) !== 0) process.exit(tl.status ?? 1);
  const mix = spawnSync('node', [path.join(HERE, '..', 'narration', 'build-mix.mjs'), root, '--audio-dir', outDirArg], { stdio: 'inherit' });
  process.exit(mix.status ?? 1);
} else {
  console.log('tts build: src/content/cards.json / pauses.json not found yet — skipping narration/build-timeline.mjs + build-mix.mjs (run them by hand once those exist)');
  process.exit(0);
}
