// gate-status.mjs — shared step-status classifier for the handful of gate.mjs sub-checks that
// encode SKIP/WARN as a printed marker line instead of a distinct exit code (fact-strings-check.mjs,
// beat-hit-rate.mjs, timing-source-check.mjs — every one of them documents in its own header "always
// exit 0 unless it cannot run at all", so gate.mjs cannot tell PASS/SKIP/WARN apart from the exit
// code alone and has to read the sub-check's own stdout/stderr).
//
// NEW-1 (2026-09-29 re-review, second pass): the previous version of this logic did
// `/\[SKIP\]/.test(r.out) ? 'SKIP' : r.code === 0 ? 'PASS' : 'FAIL'` — a bare, unanchored substring
// test over the ENTIRE combined stdout+stderr, checked BEFORE the exit code. But fact-strings-check.mjs
// (like the other two) echoes each FAIL/WARN row's offending on-screen text verbatim into its output
// (e.g. `[WARN] src/scenes/moon.ts:8 "[SKIP] The Moon is about 384,400 km from Earth" — ...`), so a
// scene simply containing the literal substring "[SKIP]" in its on-screen text — accidentally or
// not — flipped a genuine exit-1 FAIL into a reported SKIP, no matter what the sub-check actually
// decided. See gates/__fixtures__/fact-strings-check/bad for the concrete repro and
// __tests__/gate-status-classification.mjs for the regression test against this exact function.
//
// Fix, and the two rules this function enforces:
//   1. Exit code decides FAIL vs not-FAIL FIRST, always. A non-zero exit is a FAIL full stop — no
//      marker in the output ever overrides that.
//   2. Only when the process exited 0 is a marker even consulted, and only via an ANCHORED regex
//      matching the exact line the sub-check itself prints for that status (start-of-line, `^...`,
//      with the multiline flag) — never a bare substring test — so on-screen text a sub-check merely
//      ECHOES back (inside a FAIL/WARN row) can never be mistaken for the sub-check's own marker
//      line, because that echoed text is never anchored at the start of a line the way the real
//      marker is.
//
// `markers` is checked in order; the first pattern that matches wins. Pass WARN before SKIP when a
// sub-check can emit both, so a WARN correctly takes priority (matches beat-hit-rate.mjs's own
// "WARN, not SKIP, once it actually ran" contract).
export function classifyStepStatus(code, out, markers = []) {
  if (code !== 0) return 'FAIL';
  for (const { pattern, status } of markers) {
    if (pattern.test(out)) return status;
  }
  return 'PASS';
}
