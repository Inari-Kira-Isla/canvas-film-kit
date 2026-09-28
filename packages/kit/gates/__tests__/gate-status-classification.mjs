#!/usr/bin/env node
// gates/__tests__/gate-status-classification.mjs — regression test for NEW-1 (2026-09-29 re-review,
// second pass): gate.mjs's step-status classifier (gate-status.mjs) must never let a sub-check's
// echoed on-screen text masquerade as that sub-check's own SKIP/WARN marker. See gate-status.mjs's
// own header for the full story and the fixture at gates/__fixtures__/fact-strings-check/bad for
// the concrete repro this exercises end to end.
//
// Two layers, both asserted here:
//   1. Synthetic unit cases directly against classifyStepStatus() — the exact function gate.mjs
//      calls — covering the shape of the bug (exit 1 + embedded "[SKIP]"-looking text) and the
//      legitimate cases it must still classify correctly (real SKIP, real WARN, a crash).
//   2. An end-to-end case: actually spawn fact-strings-check.mjs against the real
//      __fixtures__/fact-strings-check/bad fixture (whose on-screen string literally contains
//      "[SKIP]") and feed its REAL exit code + REAL stdout/stderr into classifyStepStatus, exactly
//      as gate.mjs does — asserting FAIL, not SKIP. This is the case that would have caught NEW-1.
//
// Usage: node gates/__tests__/gate-status-classification.mjs
// Exit codes: 0 = every assertion held, 1 = at least one didn't.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyStepStatus } from '../gate-status.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATES_DIR = path.resolve(HERE, '..');
const FIXTURES_DIR = path.join(GATES_DIR, '__fixtures__', 'fact-strings-check');
const FACT_STRINGS_CHECK = path.join(GATES_DIR, 'fact-strings-check.mjs');

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`[PASS] ${label} — got "${actual}"`);
    pass++;
  } else {
    console.error(`[FAIL] ${label} — expected "${expected}", got "${actual}"`);
    fail++;
  }
}

const SKIP_MARKER = { pattern: /^fact-strings-check: \[SKIP\]/m, status: 'SKIP' };

// ---- Layer 1: synthetic unit cases directly against the real classifier function ----

// The exact shape of NEW-1: exit 1 (a real FAIL), but the combined output contains the literal
// substring "[SKIP]" embedded inside an echoed FAIL/WARN row's on-screen text, NOT at the start of
// a line and NOT the script's own marker format. Must be FAIL, never SKIP.
check(
  'exit=1 + unanchored "[SKIP]" substring inside an echoed row → FAIL (the NEW-1 bug shape)',
  classifyStepStatus(1, '  [WARN] src/scenes/moon.ts:8 "[SKIP] The Moon is about 384,400 km from Earth" — contains a digit...', [SKIP_MARKER]),
  'FAIL',
);

// A genuine SKIP: exit 0, and the script's own anchored marker line is present.
check(
  'exit=0 + real anchored SKIP marker → SKIP',
  classifyStepStatus(0, 'fact-strings-check: [SKIP] research/fact_table.md not found and 0 candidate fact-shaped string(s) in src — nothing to verify yet.', [SKIP_MARKER]),
  'SKIP',
);

// exit 0, no marker at all → PASS.
check(
  'exit=0 + no marker → PASS',
  classifyStepStatus(0, 'fact-strings-check: 3 file(s), 0 candidate string(s)\n  OK=0  WARN=0  FAIL=0\ndirectional assertions: 0 (no candidate strings, nothing to verify)', [SKIP_MARKER]),
  'PASS',
);

// A crash (killed by signal / ENOENT — gate.mjs's run() maps these to code 2) must never be masked
// by stray marker-shaped text in whatever partial output made it to the buffer.
check(
  'exit=2 (crash) + stray "[SKIP]"-looking text → FAIL, never masked',
  classifyStepStatus(2, '[gate] sub-process was killed by signal SIGTERM (possibly a 60000ms timeout)\nfact-strings-check: [SKIP] leftover buffered text from before the kill', [SKIP_MARKER]),
  'FAIL',
);

// WARN takes priority over SKIP when both markers are supplied (beat-hit-rate.mjs shape) and the
// process exited 0.
check(
  'exit=0 + WARN marker checked before SKIP → WARN wins',
  classifyStepStatus(0, 'beat-hit-rate: [WARN] 3/10 beats hit (30%, below 70% threshold)', [
    { pattern: /^beat-hit-rate: \[WARN\]/m, status: 'WARN' },
    { pattern: /^beat-hit-rate: \[SKIP\]/m, status: 'SKIP' },
  ]),
  'WARN',
);

// ---- Layer 2: end-to-end, against the REAL fixture and the REAL sub-script ----

const badDir = path.join(FIXTURES_DIR, 'bad');
const r = spawnSync('node', [FACT_STRINGS_CHECK, path.join(badDir, 'src'), path.join(badDir, 'research', 'fact_table.md')], { encoding: 'utf8' });
const combined = `${r.stdout ?? ''}${r.stderr ?? ''}`;
if (!/\[SKIP\]/.test(combined)) {
  console.error('[FAIL] end-to-end precondition — expected the bad fixture\'s real output to contain the literal substring "[SKIP]" (the injection vector this test exists to catch); it did not, so this test is not exercising anything. Check the fixture at ' + badDir);
  fail++;
} else {
  console.log('[PASS] end-to-end precondition — bad fixture\'s real output does contain a bare "[SKIP]" substring (confirms the injection vector is present to test against)');
  pass++;
}
check(
  'end-to-end: real fact-strings-check.mjs run against __fixtures__/fact-strings-check/bad, fed through the real classifier → FAIL',
  classifyStepStatus(r.status, combined, [SKIP_MARKER]),
  'FAIL',
);

console.log(`\ngate-status-classification: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
