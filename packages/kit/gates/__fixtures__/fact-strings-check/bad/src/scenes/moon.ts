// bad/src/scenes/moon.ts — NEW-1 regression fixture (2026-09-29 re-review): an untagged,
// fact-shaped on-screen string with NO research/fact_table.md at all — a real fact-strings-check
// FAIL (exit 1) — whose text happens to contain the literal substring "[SKIP]". This exists to
// prove fact-strings-check.mjs's own exit code (and, one layer up, gate.mjs's step-status
// classifier — see gate-status.mjs) is never fooled by on-screen text that merely LOOKS like a
// gate marker. A gate reading this as SKIP instead of FAIL is exactly the bug NEW-1 describes.
export function drawMoon(ctx: CanvasRenderingContext2D) {
  ctx.fillText('[SKIP] The Moon is about 384,400 km from Earth', 10, 10);
}
