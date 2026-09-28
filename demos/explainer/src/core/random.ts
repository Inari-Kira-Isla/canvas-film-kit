import { TAU } from './math';

// FAIL LOUD on a fractional seed (2026-09-28, K1 verifier finding): every seed-taking function below
// eventually feeds its seed into a bitwise op (`>>> 0`, `Math.imul`), which implicitly does ToInt32 —
// for any seed in [0, 1), that truncates to EXACTLY 0. `Math.random()` always returns a value in
// [0, 1), so `sketch(ctx, pts, { seed: Math.random() })` doesn't fail, doesn't render garbage, and
// doesn't even break `kit gate`'s determinism check (every "random" run silently collapses to
// seed=0, which is of course perfectly repeatable) — it just quietly stops doing what the author
// almost certainly intended, with zero visible sign anything is wrong. This assertion turns that
// silent truncation into an immediate, loud error at the call site instead. (A DIFFERENT, static
// guard — `kit gate`'s grep-gates step — also forbids `Math.random`/`Date.now`/`performance.now`
// anywhere in src/ outright; this assertion is the defense-in-depth backstop for a fractional seed
// that reaches here through some indirection the static grep can't see, e.g. a variable.)
function assertIntSeed(fn: string, seed: number): void {
  if (!Number.isInteger(seed)) {
    throw new Error(
      `${fn}: seed must be an integer (got ${seed}) — a fractional seed (e.g. Math.random()) silently ` +
        `truncates to 0 inside a bitwise op, breaking the "same seed → same output" determinism ` +
        `contract without any visible error. Use an integer seed (vary it deliberately per element ` +
        `instead, e.g. \`seed + i\`).`,
    );
  }
}

/** mulberry32 — small, fast, seeded PRNG. Every generated structure uses one so runs are identical. */
export function rng(seed: number): () => number {
  assertIntSeed('rng(seed)', seed);
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ihash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Stateless hash of an integer (plus seed) into [0, 1). `n` may be fractional (it is floored
 *  internally, e.g. callers passing `i*13+seed` where seed itself is checked below) — but `seed`
 *  must be an integer, see the assertion at the top of this file. */
export const hash = (n: number, s = 0): number => {
  assertIntSeed('hash(n, seed)', s);
  return ihash((Math.imul(Math.floor(n), 374761393) + Math.imul(s, 668265263)) | 0);
};

const hash3 = (i: number, j: number, k: number, s: number): number => {
  assertIntSeed('hash3(i, j, k, seed)', s);
  return ihash(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ Math.imul(s + 1, 2654435761 | 0));
};

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i, seed) * (1 - u) + hash(i + 1, seed) * u) * 2 - 1;
}

/** Smooth 3D value noise in [-1, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return (
    l(
      l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
      l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
      w,
    ) * 2 - 1
  );
}

export function fbm3(x: number, y: number, z: number, octaves: number, seed = 0): number {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise3(x * f, y * f, z * f, seed + o * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export function gauss(r: () => number): number {
  const u = 1 - r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
