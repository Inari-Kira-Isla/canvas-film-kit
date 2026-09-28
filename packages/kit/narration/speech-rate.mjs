#!/usr/bin/env node
// narration/speech-rate.mjs — speech-rate gate, zero Python (design doc §2.2/§9 K3 row: ported
// line-for-line from a Python original so both implementations can be run against the SAME fixture
// and must reach the SAME verdict — that parity is this file's own acceptance test).
//
// WHY THIS EXISTS: a preproduction plan's declared pacing (characters/second) can come from a stale
// or too-small sample — if the full script's timing is planned off a wrong number, every downstream
// second in the film is wrong from minute one. This gate catches that BEFORE export.
//
// Machine-readable declaration, written anywhere in `docs/preproduction.md` (Markdown prefixes like
// "> " or "- " are fine):
//
//     speech_rate_cps: 4.6 source: narration/vo/N1.mp3
//
//   - `speech_rate_cps`: the planned pacing (pronounced characters / second).
//   - `source`: an EXISTING audio file path (.mp3 or .wav — only used to point at "which vo/
//     directory", an existence check). The gate looks in that SAME directory for `vo_manifest.json`
//     (one entry per line: text/voice/speech_len) and computes the REAL rate from the WHOLE
//     manifest (never a single short line) — `source` can be relative to repoRoot or absolute.
//
// Checks (ALL must pass, exit 0; any failure is fail-closed, exit 1):
//   1. docs/preproduction.md has EXACTLY ONE such declaration line (0 or >1 both FAIL)
//   2. the `source` audio file exists
//   3. the sibling vo_manifest.json exists, is valid JSON, and has `order`/`lines`
//   4. every line in the manifest uses the SAME voice
//   5. the manifest's combined text has >= 100 pronounced characters (CJK Unified Ideographs,
//      excluding punctuation/digits/Latin) — too small a sample is the whole failure mode this gate
//      exists to catch
//   6. the MEASURED rate (total pronounced chars / total `speech_len`) is within 10% relative error
//      of the DECLARED `speech_rate_cps`
//
// Usage: node speech-rate.mjs [repoRoot]   (default repoRoot = cwd)
// NARRATION_SYNC_PREPROD_PATH env var overrides the preproduction.md path (test/fixture use — same
// env var name as the ported Python original, so the two can share fixtures byte-for-byte).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DECLARATION_RE = /speech_rate_cps:\s*([0-9]+(?:\.[0-9]+)?)\s+source:\s*(\S+)/g;
const CJK_RE = /[一-鿿]/g;

const MAX_RELATIVE_ERROR = 0.10;
const MIN_SAMPLE_CHARS = 100;

class GateFail extends Error {}

function findDeclaration(preprodText) {
  const matches = [...preprodText.matchAll(DECLARATION_RE)];
  if (matches.length === 0) {
    throw new GateFail('docs/preproduction.md has no machine-readable speech-rate declaration (format: speech_rate_cps: <number> source: <audio-path>)');
  }
  if (matches.length > 1) {
    const lines = matches.map((m) => preprodText.slice(0, m.index).split('\n').length);
    throw new GateFail(
      `docs/preproduction.md has ${matches.length} speech-rate declaration lines (at line(s) ${lines.join(', ')}) — ` +
        `more than one left over from an edit; the gate refuses to guess which is right, clean up to exactly one line by hand`,
    );
  }
  const m = matches[0];
  return { cps: Number(m[1]), source: m[2] };
}

function resolveSource(source, repoRoot) {
  const candidates = [path.resolve(source), path.resolve(repoRoot, source)];
  for (const c of candidates) {
    if (existsSync(c)) {
      const ext = path.extname(c).toLowerCase();
      if (ext !== '.mp3' && ext !== '.wav') {
        throw new GateFail(`source must point at a .mp3 or .wav file, found ${c} (${ext})`);
      }
      return c;
    }
  }
  throw new GateFail(`source audio not found (tried: ${candidates.join(', ')})`);
}

function loadManifest(sourcePath) {
  const manifestPath = path.join(path.dirname(sourcePath), 'vo_manifest.json');
  if (!existsSync(manifestPath)) {
    throw new GateFail(`${manifestPath} not found (the source's own directory needs a vo_manifest.json — see \`kit tts build\`'s output contract)`);
  }
  let data;
  try {
    data = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    throw new GateFail(`failed to read/parse ${manifestPath}: ${e.message}`);
  }
  const lines = data.lines;
  if (!lines || typeof lines !== 'object' || Array.isArray(lines) || Object.keys(lines).length === 0) {
    throw new GateFail(`${manifestPath} has no usable 'lines'`);
  }
  const order = data.order && data.order.length ? data.order : Object.keys(lines);
  const entries = [];
  for (const lid of order) {
    const entry = lines[lid];
    if (entry === undefined) throw new GateFail(`${manifestPath} 'order' mentions ${JSON.stringify(lid)} but 'lines' has no such key`);
    entries.push([lid, entry]);
  }
  if (entries.length === 0) throw new GateFail(`${manifestPath} has no lines at all`);
  return { path: manifestPath, entries };
}

function checkSameVoice(entries) {
  const voices = new Map(entries.map(([lid, e]) => [lid, e.voice]));
  const distinct = new Set(voices.values());
  if (distinct.has(undefined) || distinct.size !== 1) {
    throw new GateFail(`manifest lines do not all use the same voice: ${JSON.stringify(Object.fromEntries(voices))}`);
  }
  return [...distinct][0];
}

function computeRate(entries) {
  let totalChars = 0;
  let totalSpeechS = 0;
  for (const [lid, e] of entries) {
    const text = e.text ?? '';
    const speechLen = e.speech_len;
    if (speechLen === undefined || speechLen === null) {
      throw new GateFail(`manifest line ${JSON.stringify(lid)} has no 'speech_len' (real speaking duration — never estimate this from a silence-inclusive clip length)`);
    }
    totalChars += (text.match(CJK_RE) ?? []).length;
    totalSpeechS += Number(speechLen);
  }
  if (totalChars < MIN_SAMPLE_CHARS) {
    throw new GateFail(`manifest sample is only ${totalChars} pronounced character(s), below the ${MIN_SAMPLE_CHARS}-character floor (too small a sample to trust a rate from)`);
  }
  if (totalSpeechS <= 0) {
    throw new GateFail(`manifest total speech_len is ${totalSpeechS}, cannot compute a rate`);
  }
  const measuredCps = totalChars / totalSpeechS;
  return { totalChars, totalSpeechS: Math.round(totalSpeechS * 1000) / 1000, measuredCps: Math.round(measuredCps * 10000) / 10000 };
}

export function runSpeechRateGate(repoRoot) {
  const preprodPath = path.resolve(process.env.NARRATION_SYNC_PREPROD_PATH || path.join(repoRoot, 'docs/preproduction.md'));
  try {
    if (!existsSync(preprodPath)) throw new GateFail(`${preprodPath} does not exist`);
    const text = readFileSync(preprodPath, 'utf8');
    const { cps: declaredCps, source } = findDeclaration(text);
    console.error(`[speech-rate] declared: speech_rate_cps=${declaredCps} source=${source}`);

    const sourcePath = resolveSource(source, repoRoot);
    console.error(`[speech-rate] source audio exists: ${sourcePath}`);

    const manifest = loadManifest(sourcePath);
    const entries = manifest.entries;
    console.error(`[speech-rate] manifest: ${manifest.path} (${entries.length} line(s))`);

    const voice = checkSameVoice(entries);
    console.error(`[speech-rate] same voice: ${voice}`);

    const rate = computeRate(entries);
    console.error(`[speech-rate] sample ${rate.totalChars} pronounced char(s) / ${rate.totalSpeechS}s -> measured ${rate.measuredCps} chars/s`);

    if (declaredCps <= 0) throw new GateFail(`declared speech_rate_cps=${declaredCps} is not valid (must be >0)`);
    const relError = Math.abs(rate.measuredCps - declaredCps) / declaredCps;
    console.error(`[speech-rate] declared ${declaredCps} vs measured ${rate.measuredCps} -> relative error ${(relError * 100).toFixed(1)}% (threshold ${(MAX_RELATIVE_ERROR * 100).toFixed(0)}%)`);
    if (relError > MAX_RELATIVE_ERROR) {
      throw new GateFail(
        `declared rate ${declaredCps} chars/s vs measured ${rate.measuredCps} chars/s differ by ${(relError * 100).toFixed(1)}%, ` +
          `over the ${(MAX_RELATIVE_ERROR * 100).toFixed(0)}% threshold (a stale/estimated declared rate must never be used to plan the whole script's timing)`,
      );
    }
  } catch (e) {
    if (e instanceof GateFail) {
      console.error(`[speech-rate] FAIL: ${e.message}`);
      return 1;
    }
    throw e;
  }
  console.log('speech-rate: PASS');
  return 0;
}

// Only run as a CLI when invoked directly (not when imported, e.g. by a parity test harness).
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(process.argv[2] ?? '.');
  process.exit(runSpeechRateGate(repoRoot));
}
