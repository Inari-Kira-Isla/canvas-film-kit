// captions.ts — word-timed caption/lyric painter: pre-shows a line dim, then lights each word
// exactly at its measured onset (never before it), with a short colour flash on the word that just
// lit. Distilled from a real project's music-video lyric module (2026-09-28) — generalised for ANY
// word-timed text (song lyrics, narration captions, subtitles), not just lyrics: the shape is the
// same whether the timing source is a beat-synced word list or a TTS provider's WordStamp array
// (see the kit design doc §4.1 `TtsProvider.synthesize()` return shape — `Word` below is that same
// `{ text, start }` idea, renamed `t` for "the moment this word lights up" so a lyric line and a
// narration line can share one painter).
//
// This is a COPY template (design doc §2.4) — paste into your own `src/components/captions.ts`.
// Deleted from the source this was distilled from: nothing brand-specific lived in this file to
// begin with — it was already generic (a lyric line is art, not a fact), so this is close to a
// straight port, with the artist-specific type names (`Line` importing a project's own timeline
// module) replaced by a self-contained `Caption` shape.
import { clamp } from '../core/math';
import { mix, rgba, type RGB } from '../core/color';

export interface Word {
  text: string;
  t: number; // the timeline second this word lights up (never lit before this)
}
export interface Caption {
  start: number; // pre-show begins `preRoll` seconds before this
  end: number; // hold begins here
  words: Word[];
}

export interface CaptionOpts {
  x: number;
  y: number;
  size: number;
  align?: 'left' | 'center' | 'right';
  maxW?: number;
  alpha?: number;
  font: string; // e.g. `${weight} ${px}px ${family}` minus the px/weight — see draw() below
  dim: RGB; // colour of not-yet-lit / pre-show text
  lit: RGB; // colour of a lit word once its flash has faded
  flash: RGB; // colour a word flashes to the instant it lights up
  hold?: number; // seconds the line stays fully visible after `end` before fading out
  preRoll?: number; // seconds before `start` the line begins fading in, dim
  until?: number; // hard cut-off (timeline seconds) — e.g. the next line's own pre-show begin
}

/** Draws one caption/lyric line at timeline second `S`. Returns the alpha actually used (0 = not
 *  currently visible) so a caller can skip other per-line work when it is off-screen. Font is
 *  built as `${opts.font} ${size}px` (caller-controlled weight/family in `opts.font`, this function
 *  only varies the px so `maxW` auto-shrink can re-set it). */
export function drawCaption(ctx: CanvasRenderingContext2D, cap: Caption, S: number, o: CaptionOpts): number {
  const hold = o.hold ?? 0.25;
  const preRoll = o.preRoll ?? 0.35;
  const vis = clamp(prog(cap.start - preRoll, cap.start - preRoll + 0.12, S)) * (1 - prog(cap.end + hold, cap.end + hold + 0.2, S));
  const cutoff = o.until !== undefined ? 1 - prog(o.until - 0.08, o.until, S) : 1;
  const a = vis * cutoff * (o.alpha ?? 1);
  if (a <= 0.001) return 0;
  ctx.save();
  let size = o.size;
  ctx.font = `${o.font} ${size}px sans-serif`.trim();
  const words = cap.words.map((w) => w.text);
  const sp = size * 0.28;
  const widths = () => words.map((w) => ctx.measureText(w).width);
  let ws = widths();
  let total = ws.reduce((s, v) => s + v, 0) + sp * (words.length - 1);
  if (o.maxW && total > o.maxW) {
    size *= o.maxW / total;
    ctx.font = `${o.font} ${size}px sans-serif`.trim();
    ws = widths();
    total = ws.reduce((s, v) => s + v, 0) + sp * (words.length - 1) * (size / o.size);
  }
  const spc = sp * (size / o.size);
  let x = o.align === 'center' ? o.x - total / 2 : o.align === 'right' ? o.x - total : o.x;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  cap.words.forEach((w, i) => {
    const on = S >= w.t;
    const k = on ? easeOut(prog(w.t, w.t + 0.12, S)) : 0;
    const flashAmt = on ? 1 - prog(w.t, w.t + 0.28, S) : 0;
    ctx.globalAlpha = a * (on ? 1 : 0.26);
    ctx.fillStyle = on ? (flashAmt > 0.02 ? mixRgba(o.flash, o.lit, 1 - flashAmt) : rgba(o.lit)) : rgba(o.dim);
    ctx.fillText(words[i], x, o.y - k * size * 0.06 + (on ? 0 : size * 0.02));
    x += ws[i] + spc;
  });
  ctx.restore();
  return a;
}

/** Small monospaced annotation (timestamps/coordinates/labels). */
export function drawMono(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, a: number, px: number, color: RGB, font = 'monospace', align: CanvasTextAlign = 'left'): void {
  if (a <= 0.001) return;
  ctx.save();
  ctx.font = `${px}px ${font}`;
  ctx.fillStyle = rgba(color, a);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---- small local helpers (kept file-local so captions.ts has no dependency beyond core/*) ----
function prog(a: number, b: number, x: number): number {
  return a === b ? (x >= a ? 1 : 0) : clamp((x - a) / (b - a));
}
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}
function mixRgba(a: RGB, b: RGB, t: number): string {
  return rgba(mix(a, b, t));
}
