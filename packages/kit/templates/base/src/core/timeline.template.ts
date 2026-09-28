// FILL IN — rename to timeline.ts once `T` and `BG` are real, then delete this line.
import { FPS, DURATION } from '../config';
import { mix, P, type RGB } from './color.template';

export { FPS, DURATION };

/**
 * Every beat of the film lives here, so pacing can be tuned in one place.
 *
 * ---- HAND-OFF CONTRACT (read before writing a second scene) ----
 * 1. `T` is the single source of truth for every cut point and transition window.
 *    A scene file must never hardcode a raw second value — grep gate `seg(t, [0-9]`
 *    in src/scenes must be 0 before you may claim "every time lives in T".
 * 2. An entry that spans a transition is a tuple `[start, end] as const`
 *    (see `exampleTransition` below). A one-off beat is a bare number
 *    (see `exampleBeat`).
 * 3. Whenever scene A morphs into scene B, add one row to the hand-off table
 *    below naming the shared array/state both scenes read from
 *    `scenes/shared.template.ts`. No shared geometry named = it is a hard cut,
 *    and it must be declared as one — never hidden behind a full-frame opaque
 *    fill "swap" (a scene that fades to full-black and a following scene that
 *    fades in from full-black LOOKS like a smooth morph but shares zero geometry
 *    — `kit gate`'s boundary-diff check exists specifically to catch this).
 * ------------------------------------------------------------------
 *
 * Hand-off table (FILL IN — one row per transition, delete the example row):
 * | from → to           | shared geometry (shared.ts)         | T window            |
 * |----------------------|---------------------------------------|----------------------|
 * | example → example    | `EXAMPLE_PARTICLES` (array of Pt)     | `T.exampleTransition`|
 */
export const T = {
  exampleBeat: 1.0, // a single instant — FILL IN / delete
  exampleTransition: [1.0, 2.4] as const, // a [start, end] window — FILL IN / delete
};

/**
 * OPTIONAL — multi-ending support. Delete this whole export if the film has a single linear cut
 * (the common case). If it has a shared trunk that forks into different closing scenes (e.g. a
 * "for merchants" vs "for diners" ending), export `ENDINGS` here: `kit gate`'s story-metrics step
 * then runs every gate once PER branch instead of once for main.ts's own `SCENES` order.
 *
 * `scenes` is the FULL ordered scene-id list for that branch (same id shape as main.ts's own
 * `SCENES` array) — not a diff/patch against the trunk. This is deliberate: a partial-override
 * scheme reads shorter but is ambiguous about where a branch actually starts diverging, and that
 * ambiguity is exactly the kind of thing a gate script must never guess at.
 *
 * export const ENDINGS: { name: string; scenes: string[] }[] = [
 *   { name: 'merchant', scenes: [trunkSceneA, trunkSceneB, merchantCloseScene] },
 *   { name: 'diner', scenes: [trunkSceneA, trunkSceneB, dinerCloseScene] },
 * ];
 */

export interface Scene {
  name: string;
  start: number;
  end: number;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}

/**
 * Background colour keyframes. FILL IN with your film's real beats.
 * A "hard switch" is two rows at (almost) the same time, e.g. `[5.0, P.bg], [5.001, P.other]`
 * — only ever put one under something already fully opaque on both sides, per the hand-off
 * contract above. Grep gate: `#[0-9A-Fa-f]{6}` in src/scenes must be 0 before you may claim "one
 * palette" — every colour here must come from `P`, never a literal hex.
 */
const BG: [number, RGB][] = [
  [0, P.bg],
  [DURATION, P.bg],
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

/**
 * Look of the finishing pass (paper/vignette/tint). FILL IN once you have distinct
 * "light" (e.g. paper) vs "dark" (e.g. space) sections — ease `light` across those
 * boundaries instead of snapping it with a hidden background switch. Starter default:
 * flat light=1, tint follows bgAt.
 */
export function finishLook(t: number): { light: number; tint: RGB } {
  return { light: 1, tint: bgAt(t) };
}
