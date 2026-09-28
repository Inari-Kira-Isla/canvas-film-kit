// good fixture — every "random-looking" value here is seeded and a pure function of t/seed, never
// a wall-clock or non-seeded source (see the bad/ fixture for the three forbidden calls by name).
// nondeterminism-check.mjs must report 0 hits on this file.
import { hash, rng } from '../../../core/random';

export function draw(t: number): number {
  const seed = Math.floor(t * 8); // boil-style frame-indexed seed — integer, deterministic
  const r = rng(seed);
  return hash(1, seed) + r();
}
