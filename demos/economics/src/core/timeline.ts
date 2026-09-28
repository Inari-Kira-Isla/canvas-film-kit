import { FPS, DURATION } from '../config';
import { mix, P, type RGB } from './color';

export { FPS, DURATION };

/**
 * Every beat of the film lives here — single continuous scene (src/scenes/island-inflation.ts),
 * same "no interior boundary to hide a hard cut behind" choice as every other demo in this kit.
 * All windows below come straight from `kit tts build`'s measured src/content/timeline.json.
 */
export const T = {
  chapterCard: [0, 2.6] as const,
  lineReveal: [8.62, 14.18] as const, // N2 window — line chart draws on
  barReveal: [14.43, 19.99] as const, // N3 window — bar-chart comparison (start year vs end year)
  countUp: [14.43, 19.0] as const, // "~50%" count-up, inside N3
  entityCard: [20.24, 26.24] as const, // N4 window — Lighthouse Bakery card + source-footer
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
