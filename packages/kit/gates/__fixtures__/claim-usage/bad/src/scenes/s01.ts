// claim-usage bad fixture — only C01 is used here. C02 is declared in the fact table but never
// tagged anywhere in this tree (no comment tag, no card field). Expected: exit 1.
export function draw() {
  // fact: C01
  return 'Sample claim A on screen';
}
