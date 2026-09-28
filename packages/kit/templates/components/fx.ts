// fx.ts — shared finishing/atmosphere vocabulary: a soft glow dot, drifting "motes" particles, a
// frame-indexed film-grain + vignette finishing pass, and a two-stop background gradient. Distilled
// from a real project's music-video fx module (2026-09-28); every drawer is deterministic —
// `finish`/`motes` key their randomness off the FRAME INDEX (not wall-clock time or Math.random),
// so re-rendering the same frame twice always paints identical pixels (`kit gate`'s determinism
// check depends on exactly this property).
//
// This is a COPY template (design doc §2.4) — paste into your own `src/components/fx.ts`.
//
// Relationship to core/texture.ts: the base scaffold's own `initTextures()`/`drawFinish()` (already
// wired into main.ts) bakes a PAPER-textured finish (fibres + tooth) — a good fit for the
// `paper-day` theme preset. This file's `finish()` is a lighter, papers-free alternative (plain
// noise grain + vignette) that reads better under `ink-night`/`chalkboard` — use ONE of the two per
// project, not both stacked (a second vignette on top of the first just crushes contrast).
//
// Deleted from the source this was distilled from (brand-specific, do not re-add): an ivory/deep
// two-tone `background()` tied to one brand's exact colours, and any place-name/food/eye/fish drawer
// that lived alongside these in the original file.
import { clamp, TAU } from '../core/math';
import { hash } from '../core/random';
import { rgba, type RGB } from '../core/color';

let grainTile: HTMLCanvasElement | null = null;

/** Builds the one grain tile this module reuses every frame — call once, e.g. from main.ts's
 *  `initTextures()` alongside the base scaffold's own paper/grain setup. Idempotent (safe to call
 *  more than once; it just rebuilds the same deterministic tile). */
export function initFx(size = 256): void {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(hash(i + 77) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
}

/** Film finish: noise grain (offset by FRAME INDEX, not time — deterministic) + a radial vignette
 *  that eases with `light` (1 = brightest section of the film, 0 = darkest). Call this LAST, after
 *  every scene has painted, once per frame. */
export function finish(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number, light: number, grainAlpha = 0.045): void {
  if (grainTile) {
    ctx.save();
    ctx.globalAlpha = grainAlpha + light * 0.02;
    ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor(hash(frame * 3 + 1) * 256);
    const oy = Math.floor(hash(frame * 3 + 2) * 256);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(grainTile, 'repeat')!;
    ctx.fillRect(0, 0, w + 256, h + 256);
    ctx.restore();
  }
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${Math.max(0, 0.55 - light * 0.35)})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Two-stop vertical gradient background, optionally washed toward `wash` by `washAmount` (0..1) —
 *  e.g. a paper-day scene washing an ink-night background toward white for one bright section. */
export function background(ctx: CanvasRenderingContext2D, w: number, h: number, top: RGB, bottom: RGB, wash?: RGB, washAmount = 0): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(top));
  g.addColorStop(1, rgba(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (wash && washAmount > 0) {
    ctx.fillStyle = rgba(wash, clamp(washAmount));
    ctx.fillRect(0, 0, w, h);
  }
}

/** Soft glow dot — a radial falloff halo plus a small solid core. */
export function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: RGB, core: RGB, a = 1): void {
  if (a <= 0) return;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
  g.addColorStop(0, rgba(color, 0.55 * a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(core, a);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Drifting motes/dust — deterministic in the SCROLL PARAMETER `S` (pass elapsed seconds, or a
 *  beat-synced counter — anything monotonic works), never wall-clock time directly, so the same S
 *  always paints the same frame. `seed` picks a different scatter for a different scene/section. */
export function motes(ctx: CanvasRenderingContext2D, w: number, h: number, S: number, n: number, a: number, color: RGB, seed = 1): void {
  if (a <= 0) return;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = hash(i * 13 + seed) * w + Math.sin(S * 0.7 + i) * 12;
    const sp = 20 + hash(i * 7 + seed) * 50;
    const y = (((hash(i * 5 + seed) * h - S * sp) % h) + h) % h;
    const r = 0.8 + hash(i * 11 + seed) * 2.2;
    ctx.fillStyle = rgba(color, a * (0.2 + 0.5 * hash(i * 17 + seed)));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
