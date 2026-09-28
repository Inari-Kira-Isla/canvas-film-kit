#!/usr/bin/env node
// narration/timing-source-check.mjs — reads src/content/timeline.json's `timing_source` and WARNs
// (never fails) when it is "estimate" (design doc §4.3: "gate sees timingSource:'estimate' ->
// captions should only be sentence-level synced, never word-highlighted, and this is recorded as a
// WARN so an estimate can never quietly be mistaken for measured evidence").
//
// This script only reports; it does not (and cannot, from here) inspect whether a scene actually
// restricts itself to sentence-level captions under an estimate timeline — that is a project
// authoring convention this WARN exists to keep visible, not something a static check can enforce.
//
// Usage: node timing-source-check.mjs [repoRoot]
// Exit: always 0 (informational — see gate.mjs's own WARN handling, matching beat-hit-rate.mjs's
// convention of never failing the whole gate over an advisory signal).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const timelinePath = path.join(root, 'src/content/timeline.json');

if (!existsSync(timelinePath)) {
  console.log(`[SKIP] timing-source-check: ${timelinePath} does not exist yet (run narration/build-timeline.mjs first)`);
  process.exit(0);
}
let timeline;
try {
  timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
} catch (e) {
  console.log(`[WARN] timing-source-check: could not parse ${timelinePath}: ${e.message}`);
  process.exit(0);
}

const src = timeline.timing_source;
if (src === 'measured') {
  console.log(`[PASS] timing-source-check: timing_source="measured" (real audio manifest backs every card's start/end)`);
} else if (src === 'estimate') {
  console.log(`[WARN] timing-source-check: timing_source="estimate" — no real audio manifest yet; captions built from this timeline must stay SENTENCE-level (never word-highlighted) until a real \`kit tts build\` manifest replaces it`);
} else {
  console.log(`[WARN] timing-source-check: unexpected timing_source=${JSON.stringify(src)} (expected "measured" or "estimate")`);
}
process.exit(0);
