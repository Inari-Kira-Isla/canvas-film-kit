// bad fixture — three independent violations nondeterminism-check.mjs must each catch:
// Math.random() (worst: silently truncates to seed=0 inside core/random.ts, see that file's own
// comment — this static check is the real backstop), Date.now(), and performance.now().
export function draw(): number {
  const a = Math.random();
  const b = Date.now();
  const c = performance.now();
  return a + b + c;
}
