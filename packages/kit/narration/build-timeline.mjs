#!/usr/bin/env node
// narration/build-timeline.mjs — narration timeline builder, zero Python (design doc §2.2/§9 K3
// row). Builds src/content/timeline.json from:
//   src/content/cards.json   — caption SSOT: { cards: [{ card_id, n_id, scene, zh, en, hanzi }] }
//                               (n_id groups cards that share one narration WAV — an "N unit";
//                               hanzi = pronounced-character count, used for the ESTIMATE timing
//                               model when no measured audio manifest exists yet)
//   src/content/pauses.json  — { lead_in, within_n, between_n, after: {<last_card_id>: sec},
//                               last_caption_hold, tail } (all seconds)
//   audio/vo/manifest.json (OPTIONAL) — { n: [{n_id, file, duration_s}],
//     cards: [{card_id, n_id, start_s, end_s}] } — per-card offsets INSIDE their N unit's WAV.
//     `start_s` MUST be the REAL ACOUSTIC onset of the audio (measured off the actual waveform —
//     see narration/measure-onset.mjs, ffmpeg silencedetect), never a TTS provider's own
//     self-reported word timestamp — a provider's own t0 can be a fixed lead-in constant it always
//     reports, not a measurement of a given clip's real silence, and captions built from it can
//     appear a couple of frames before the narrator's voice actually starts. `kit tts build`
//     generates a correct manifest.json in one pass; narration/onset-check.mjs independently
//     verifies it (re-measures the raw audio fresh every time — never reads a word-timestamp JSON).
//     When manifest.json is absent, this script falls back to an ESTIMATE model: card duration =
//     hanzi / 4.2 chars/sec — every output has `timing_source: "estimate"` so a caller can tell the
//     difference and never treat an estimate as measured evidence. `kit gate`'s
//     narration/timing-source-check.mjs step WARNs (never fails) on this, and captions built from an
//     estimate timeline should only ever be shown sentence-level, never word-highlighted.
//
// Outputs:
//   src/content/timeline.json      — cards with start/end/show_start/show_end
//   docs/audio_placement.json      — where each N-unit WAV must start on the film clock, for
//                                     whoever builds the final mix
//
// Usage: node build-timeline.mjs [repoRoot] [--manifest <path>]   (default: cwd, audio/vo/manifest.json)
// Exit: 0 = timeline.json written, 1 = a structural problem in cards.json/pauses.json/manifest
// (fail loud — never write a partial/guessed timeline.json).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let rootArg = '.';
let manifestArg;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--manifest') manifestArg = argv[++i];
  else if (a.startsWith('--')) { console.error(`build-timeline: unknown flag ${a}`); process.exit(1); }
  else rootArg = a;
}

const ROOT = path.resolve(rootArg);
const FPS_DEFAULT = 30;
const fail = (m) => { console.error('build-timeline: FAIL: ' + m); process.exit(1); };
const r3 = (x) => Math.round(x * 1000) / 1000;

const cardsPath = path.join(ROOT, 'src/content/cards.json');
const pausesPath = path.join(ROOT, 'src/content/pauses.json');
if (!existsSync(cardsPath)) fail(`${cardsPath} does not exist`);
if (!existsSync(pausesPath)) fail(`${pausesPath} does not exist`);

let cardsDoc, pauses;
try { cardsDoc = JSON.parse(readFileSync(cardsPath, 'utf8')); } catch (e) { fail(`parse ${cardsPath} failed: ${e.message}`); }
try { pauses = JSON.parse(readFileSync(pausesPath, 'utf8')); } catch (e) { fail(`parse ${pausesPath} failed: ${e.message}`); }
const cards = cardsDoc.cards;
if (!Array.isArray(cards) || cards.length === 0) fail(`${cardsPath}: 'cards' must be a non-empty array`);
for (const req of ['lead_in', 'within_n', 'between_n', 'last_caption_hold', 'tail']) {
  if (typeof pauses[req] !== 'number') fail(`${pausesPath}: missing numeric '${req}'`);
}
pauses.after ??= {};

let FPS = FPS_DEFAULT;
const configPath = path.join(ROOT, 'src/config.ts');
if (existsSync(configPath)) {
  const m = readFileSync(configPath, 'utf8').match(/export const FPS[^=]*=\s*(\d+)/);
  if (m) FPS = Number(m[1]);
}

const byN = {};
for (const c of cards) {
  if (!c.card_id || !c.n_id || typeof c.hanzi !== 'number') fail(`card missing card_id/n_id/hanzi(number): ${JSON.stringify(c)}`);
  (byN[c.n_id] ??= []).push(c);
}

// ---- measured manifest (audio/vo/manifest.json by default) — OPTIONAL ----
const manPath = path.resolve(ROOT, manifestArg ?? 'audio/vo/manifest.json');
let man = null;
if (existsSync(manPath)) {
  try { man = JSON.parse(readFileSync(manPath, 'utf8')); } catch (e) { fail(`parse ${manPath} failed: ${e.message}`); }
  if (!Array.isArray(man.n) || !Array.isArray(man.cards)) fail(`${manPath}: expected n[] and cards[]`);
  const nIds = new Set(man.n.map((x) => x.n_id));
  for (const n of Object.keys(byN)) if (!nIds.has(n)) fail(`manifest has no N unit ${n}`);
  for (const c of cards) {
    const m = man.cards.find((x) => x.card_id === c.card_id);
    if (!m || !(m.end_s > m.start_s)) fail(`manifest has no usable start_s/end_s for ${c.card_id} (start_s must be < end_s)`);
    const nd = man.n.find((x) => x.n_id === c.n_id).duration_s;
    if (m.end_s > nd + 0.01) fail(`${c.card_id} end_s ${m.end_s} beyond ${c.n_id} duration ${nd}`);
  }
}
const timingSource = man ? 'measured' : 'estimate';

let t = pauses.lead_in;
const out = [];
const nUnits = [];
for (const [n, cs] of Object.entries(byN)) {
  const nStart = t;
  let nEnd;
  if (man) {
    const nd = man.n.find((x) => x.n_id === n);
    nEnd = nStart + nd.duration_s;
    for (const c of cs) {
      const m = man.cards.find((x) => x.card_id === c.card_id);
      out.push({ card_id: c.card_id, n_id: n, scene: c.scene, zh: c.zh, en: c.en, hanzi: c.hanzi,
        start: r3(nStart + m.start_s), end: r3(nStart + m.end_s), duration_s: r3(m.end_s - m.start_s), timing_basis: 'measured_clip_in_N_wav' });
    }
    nUnits.push({ n_id: n, file: nd.file, start_s: r3(nStart), duration_s: nd.duration_s });
  } else {
    let u = nStart;
    cs.forEach((c, k) => {
      const d = c.hanzi / 4.2;
      out.push({ card_id: c.card_id, n_id: n, scene: c.scene, zh: c.zh, en: c.en, hanzi: c.hanzi, start: r3(u), end: r3(u + d), duration_s: r3(d), timing_basis: 'estimate_4.2cps' });
      u += d + (k < cs.length - 1 ? pauses.within_n : 0);
    });
    nEnd = u;
    nUnits.push({ n_id: n, file: null, start_s: r3(nStart), duration_s: r3(nEnd - nStart) });
  }
  const lastCard = cs[cs.length - 1].card_id;
  t = nEnd + (pauses.after[lastCard] ?? pauses.between_n);
}
out.forEach((c, i) => {
  const next = out[i + 1];
  const sameN = next && next.n_id === c.n_id;
  c.show_start = c.start;
  c.show_end = r3(next ? (sameN ? next.start : Math.min(c.end + 0.35, next.start - 0.05)) : c.end + pauses.last_caption_hold);
  c.contiguous_with_next = !!sameN;
});
const last = out[out.length - 1];
const total = last.end + pauses.tail;
const mixPath = path.join(ROOT, 'audio/mix.wav');
const duration = Math.ceil(total * FPS - 1e-6) / FPS;

const timeline = {
  _doc: 'GENERATED by narration/build-timeline.mjs — do not hand-edit. Single source for burned captions and animation anchors (card start/end). Consumed by templates/components/caption-plate.ts (map each card into a CaptionCue: t_in=start, t_out=show_end).',
  timing_source: timingSource,
  timing_note: man
    ? 'per-card timing measured (audio/vo/manifest.json card offsets inside each N WAV); N units placed on the film clock with src/content/pauses.json — see n_units for the mix layout'
    : 'ESTIMATE: card duration = hanzi / 4.2 s, pauses from src/content/pauses.json; re-run once audio/vo/manifest.json exists (e.g. after `kit tts build`)',
  mix_present: existsSync(mixPath),
  fps: FPS,
  duration_s: r3(duration),
  total_frames: Math.round(duration * FPS),
  n_units: nUnits,
  cards: out,
};
mkdirSync(path.join(ROOT, 'src/content'), { recursive: true });
writeFileSync(path.join(ROOT, 'src/content/timeline.json'), JSON.stringify(timeline, null, 2) + '\n');
mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
writeFileSync(path.join(ROOT, 'docs/audio_placement.json'), JSON.stringify({
  _doc: 'GENERATED by narration/build-timeline.mjs. Film-clock onset of each narration N WAV (the picture and captions are timed to these). Build audio/mix.wav so each file starts exactly at start_s; total length = total_s.',
  timing_source: timingSource, total_s: timeline.duration_s, fps: FPS,
  n_units: nUnits,
}, null, 2) + '\n');
console.log(`build-timeline: timeline.json ${timingSource}, ${timeline.duration_s}s, ${timeline.total_frames} frames, ${out.length} cards`);
const sc = {};
for (const c of out) { sc[c.scene] ??= [c.start, c.end]; sc[c.scene][1] = c.end; }
for (const [k, v] of Object.entries(sc)) console.log(`  ${k} ${v[0].toFixed(2)}-${v[1].toFixed(2)}`);
