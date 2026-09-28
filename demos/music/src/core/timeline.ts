import { FPS, DURATION } from '../config';
import { mix, type RGB } from './color';
import { THEME } from '../theme';
import beatsData from '../../audio/beats.json';

export { FPS, DURATION };

const P = THEME.palette;

/** "Tide Lines" — a coastline wave that swells on every detected beat, with a short two-line
 *  caption synced to the same beat grid. Timeline is DRIVEN BY THE SONG (design doc §3.1 music):
 *  every visual event below reads its second straight from audio/beats.json, not from a hand-typed
 *  cadence, so re-running `kit beats` on a different take of the audio re-times the whole film for
 *  free.
 *
 * Hand-off table: one continuous scene (src/scenes/tide-lines.ts) — no scene-to-scene transition
 * exists in this demo, so there is nothing to list here (see that file's own header).
 */
export const BEATS: number[] = beatsData.beats;

/** `kit gate`'s beat-hit-rate step (music profile only) reads this export: every timeline second a
 *  scene claims a *visible* reaction to the beat happens. Here every beat gets one (the coastline
 *  swell pulse) — see src/scenes/tide-lines.ts. */
export const VISUAL_EVENTS: number[] = BEATS;

export const T = {
  fadeIn: [0, BEATS[0] ?? 0.5] as const, // lead-in silence before the first beat — see audio/track.truth.json
  capLine1: [BEATS[1] ?? 1.0, BEATS[9] ?? 4.5] as const,
  capLine2: [BEATS[11] ?? 5.5, BEATS[19] ?? 9.5] as const,
};

const BG: [number, RGB][] = [
  [0, P.bg2],
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
  return { light: 0, tint: bgAt(t) };
}

export interface Scene {
  name: string;
  start: number;
  end: number;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}
