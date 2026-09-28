#!/usr/bin/env node
// make-demo-track.mjs — synthesizes a short CC0 demo track (deterministic kick + hat pattern at a
// known, constant BPM) so the `music` profile has something to scaffold a demo against without any
// licensing question (design doc §3.1 music: "程式合成一段 120 BPM WAV ... 拍點係已知真值，可以
//驗 beats.mjs 準確度"). Zero external dependencies — writes a plain 16-bit PCM mono WAV by hand.
//
// Every sample is a pure function of its own index (a fixed-seed hash for the hat's noise, no
// Math.random anywhere) — re-running this script always produces byte-identical output.
//
// Usage: node make-demo-track.mjs [outDir] [--bpm N] [--duration S] [--sr N]
// Writes: <outDir>/track.wav, <outDir>/track.truth.json (known bpm/offset/beats — for scoring
// beats.mjs's detection accuracy against, never used by beats.mjs itself).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let outDir = 'demos/music/audio';
let bpm = 120;
let duration = 20;
let sr = 44100;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--bpm') bpm = Number(argv[++i]);
  else if (a === '--duration') duration = Number(argv[++i]);
  else if (a === '--sr') sr = Number(argv[++i]);
  else if (a.startsWith('--')) {
    console.error(`make-demo-track: unknown flag ${a}`);
    process.exit(1);
  } else positional.push(a);
}
if (positional[0]) outDir = positional[0];

// deterministic hash noise (same family as templates/base/src/core/random.ts `hash`, duplicated
// here since this script has no access to the TS template's module resolution)
function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

const period = 60 / bpm;
const nSamples = Math.round(duration * sr);
const buf = new Float64Array(nSamples);

function addBurst(startSec, freq, tau, amp, kind, seedOffset = 0) {
  const start = Math.round(startSec * sr);
  const span = Math.min(nSamples - start, Math.round(tau * 8 * sr));
  for (let i = 0; i < span; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= nSamples) continue;
    const tt = i / sr;
    const env = Math.exp(-tt / tau);
    let v;
    if (kind === 'tone') v = Math.sin(2 * Math.PI * freq * tt);
    else v = hash(idx * 2654435761 + seedOffset) * 2 - 1; // deterministic "noise" sample
    buf[idx] += v * env * amp;
  }
}

// A real kick drum's onset is easy for a spectral-flux detector to lock onto precisely BECAUSE it
// is a BROADBAND transient — energy jumps across every frequency bin at once. A lone sine tone is
// the opposite: nearly all its energy sits in one narrow FFT bin, so summing flux across bins barely
// reacts to its attack, AND a decaying narrowband tone analyzed through overlapping STFT windows
// produces spurious magnitude flutter later in its decay (bin-leakage beating against the window
// hop) that can be LARGER than the true attack's flux — an earlier version of this generator learned
// this the hard way (the tracker locked onto a leakage artifact ~0.2s after the true beat, not the
// beat itself). Both the kick and the hat below are therefore broadband noise bursts — only their
// amplitude/decay differ (a real kick is louder and longer than a real hat) — which is also exactly
// what makes the beat vs. off-beat distinguishable to a spectral-flux tracker at all.
//
// LEAD_IN: a flux-based onset detector measures CHANGE between consecutive analysis frames, so the
// very first sample of a file has no "before" to contrast against — a beat placed at t=0 exactly is
// structurally invisible to it (this is also why every real click track/count-in leaves at least one
// bar of silence before the downbeat). One full period of silence before the first scored beat is
// enough for the first beat to look, to the detector, exactly like every other beat.
const LEAD_IN_PERIODS = 1;
const beats = [];
for (let t = LEAD_IN_PERIODS * period; t < duration; t += period) {
  beats.push(+t.toFixed(6));
  addBurst(t, 0, 0.05, 0.9, 'noise', 0); // kick — on the beat, loud + longer decay
}
for (let t = (LEAD_IN_PERIODS + 0.5) * period; t < duration; t += period) {
  addBurst(t, 0, 0.02, 0.25, 'noise', 999983); // hat — on the off-beat, quieter + shorter (texture only, not scored)
}

// clamp + convert to 16-bit PCM
let peak = 0;
for (let i = 0; i < nSamples; i++) peak = Math.max(peak, Math.abs(buf[i]));
const norm = peak > 0.98 ? 0.98 / peak : 1;
const pcm = new Int16Array(nSamples);
for (let i = 0; i < nSamples; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(buf[i] * norm * 32767)));

// ---- WAV (RIFF) header, mono 16-bit PCM ----
function writeWav(filePath, pcmData, sampleRate) {
  const dataSize = pcmData.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (mono, 16-bit)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  const body = Buffer.from(pcmData.buffer, pcmData.byteOffset, dataSize);
  writeFileSync(filePath, Buffer.concat([header, body]));
}

mkdirSync(outDir, { recursive: true });
const wavPath = path.join(outDir, 'track.wav');
const truthPath = path.join(outDir, 'track.truth.json');
writeWav(wavPath, pcm, sr);
writeFileSync(
  truthPath,
  JSON.stringify(
    {
      note: 'ground truth for scoring beats.mjs detection accuracy — synthetic, CC0, not read by beats.mjs itself',
      bpm,
      offsetSec: beats[0],
      durationSec: duration,
      sampleRate: sr,
      n_beats: beats.length,
      beats,
    },
    null,
    2,
  ) + '\n',
);
console.log(`make-demo-track: wrote ${wavPath} (${duration}s @ ${sr}Hz, ${bpm}bpm, ${beats.length} beats) + ${truthPath}`);
