// good/src/scenes/moon.ts — every on-screen fact-shaped string carries a valid // fact: Cxx tag
// that resolves in research/fact_table.md. See gates/__fixtures__/fact-strings-check/README (this
// header) for what "good" means for this check.
export function drawMoon(ctx: CanvasRenderingContext2D) {
  // fact: C01
  ctx.fillText('The Moon is about 384,400 km from Earth', 10, 10);
}
