import { FPS, DURATION } from '../config';
import { mix, P, type RGB } from './color';

export { FPS, DURATION };

/**
 * Every beat of the film lives here (see templates/base's own hand-off contract comment for the
 * full rule set this kit expects every project to follow) — single continuous scene
 * (src/scenes/printing-spread.ts), same "no interior boundary to hide a hard cut behind" choice as
 * every other demo in this kit.
 *
 * All windows below come straight from `kit tts build`'s measured src/content/timeline.json
 * (cards[].show_start/show_end for N1..N4) — never hand-typed ahead of a real pipeline run.
 */
export const T = {
  chapterCard: [0, 2.6] as const, // opening title card
  // N1-N4's own caption windows come straight off timeline.json (CUES in the scene file) — no
  // separate T entries for them; every OTHER visual cue below (year axis / map route / silhouette /
  // split-compare) has its own T window because those are genuinely read in draw() (story-metrics.mjs's
  // beat-keys-all-used check would FAIL on a T key that's declared but never sampled during draw()).
  yearAxis: [2.6, 26.65] as const, // year marker sweeps 1450 -> 1500 across the whole narration arc
  silhouetteReveal: [2.6, 6.2] as const, // Gutenberg silhouette draw-on, inside N1
  mapReveal: [8.62, 20.4] as const, // route draw-on, spans N2 into N3 (fully drawn before N4 closes)
  splitCompare: [20.65, 26.65] as const, // then/now coda, during N4
};

export interface Scene {
  name: string;
  start: number;
  end: number;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}

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

export function finishLook(t: number): { light: number; tint: RGB } {
  return { light: 1, tint: bgAt(t) };
}
