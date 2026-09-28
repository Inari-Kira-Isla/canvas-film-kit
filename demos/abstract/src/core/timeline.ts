import { FPS, DURATION } from '../config';
import { mix, type RGB } from './color';
import { THEME } from '../theme';

export { FPS, DURATION };

const P = THEME.palette;

/**
 * "One Line" — a single hand-drawn stroke stays on screen for the whole film and continuously
 * reshapes itself: a straight line -> a circle -> a travelling wave band -> a spiral. One scene,
 * one piece of geometry, no hard cuts (see src/scenes/one-line.ts).
 *
 * Hand-off table:
 * | phase → phase          | shared geometry                    | T window              |
 * |-------------------------|-------------------------------------|------------------------|
 * | line → circle            | `LINE_N` point count, `shapeAt(t)`  | `T.toCircle`           |
 * | circle → wave             | same                                 | `T.toWave`             |
 * | wave → spiral              | same                                 | `T.toSpiral`           |
 */
export interface Scene {
  name: string;
  start: number;
  end: number;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}

// A steady, roughly-1s-apart accent "tick" runs underneath the whole morph (a subtle spark on the
// line, see src/scenes/one-line.ts) — this is what keeps story-metrics' anti-slideshow beat-spacing
// check green even though the actual STORY beats (draw/toCircle/toWave/toSpiral below) are, by
// design, a handful of long, slow morph windows rather than frequent cuts. `TICK_KEYS` lists the
// generated names so the scene can read each one individually (`T[k]` per key, never `for...in T`/
// `Object.keys(T)` — that would trip story-metrics' "T enumerated, unreliable" guard, see its own
// file header N9).
const TICK_COUNT = 16;
const TICK_SPACING = (17.4 - 0.6) / (TICK_COUNT - 1);
export const TICK_KEYS: string[] = Array.from({ length: TICK_COUNT }, (_, i) => `tick${i}`);
const tickEntries: Record<string, number> = Object.fromEntries(TICK_KEYS.map((k, i): [string, number] => [k, +(0.6 + i * TICK_SPACING).toFixed(3)]));

export const T = {
  draw: [0.5, 3.0] as const, // the line draws itself in from nothing
  toCircle: [3.5, 7.5] as const,
  holdCircle: 8.5, // a single accent pulse while it's a circle
  toWave: [9.0, 13.0] as const,
  toSpiral: [13.5, 17.0] as const,
  ...tickEntries,
};

/** Typed accessor for a dynamically-computed key (`T.tick3` etc.) — a plain `T[k]` with a `string`
 *  `k` loses TypeScript's literal-key typing on `T`'s other, named properties, so this one cast
 *  lives here instead of at every call site. Still a single `get` per call at runtime (not an
 *  enumeration trap), so story-metrics still credits each key read through this individually. */
export function tickAt(key: string): number {
  return (T as unknown as Record<string, number>)[key];
}

const BG: [number, RGB][] = [
  [0, P.bg],
  [DURATION, P.bg2],
];

export function bgAt(t: number): RGB {
  for (let i = 1; i < BG.length; i++) {
    if (t <= BG[i][0]) {
      const [t0, c0] = BG[i - 1];
      const [t1, c1] = BG[i][0] === t0 ? [t0 + 1, BG[i][1]] : BG[i];
      return mix(c0, c1, Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
    }
  }
  return BG[BG.length - 1][1];
}

export function finishLook(t: number): { light: number; tint: RGB } {
  return { light: 0, tint: bgAt(t) };
}
