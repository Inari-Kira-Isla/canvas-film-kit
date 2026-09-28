// components/split-compare.ts — history-profile "then vs. now" split view: two draw callbacks share
// the frame across a divider line, each with its own era label. Used for a direct old/new comparison
// beat (e.g. a 15th-century print shop sketch vs. a modern printing press sketch) — the "then" and
// "now" CONTENT is entirely the caller's own scene code; this component only owns the split geometry,
// clip regions, divider line, and the two labels.
//
// This is a COPY template — paste into your own `src/components/split-compare.ts`.
import { clamp } from '../core/math';
import { rgba, type RGB } from '../core/color';

export type SplitOrientation = 'vertical' | 'horizontal';
export interface SplitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SplitCompareStyle {
  ink: RGB;
  labelPx: number;
  dividerWidth: number;
  labelPad: number;
}

export const DEFAULT_SPLIT_COMPARE_STYLE: SplitCompareStyle = {
  ink: [42, 31, 26],
  labelPx: 28,
  dividerWidth: 4,
  labelPad: 24,
};

/** Draws `drawA` (era A, left/top) and `drawB` (era B, right/bottom) each clipped to their own half
 *  of `rect`, split at `divide` (0..1, default 0.5 — animate this for a wipe reveal), with a drawn
 *  divider line and two era labels. Each draw callback receives the FULL rect (not just its half) so
 *  its own internal layout math never needs to know about the split — the canvas clip does the
 *  cropping. Pure function of `divide`/`alpha` — no mutable state. */
export function drawSplitCompare(
  ctx: CanvasRenderingContext2D,
  rect: SplitRect,
  orientation: SplitOrientation,
  divide: number,
  drawA: (ctx: CanvasRenderingContext2D, rect: SplitRect) => void,
  drawB: (ctx: CanvasRenderingContext2D, rect: SplitRect) => void,
  labelA: string,
  labelB: string,
  alpha = 1,
  style: Partial<SplitCompareStyle> = {},
): void {
  const s: SplitCompareStyle = { ...DEFAULT_SPLIT_COMPARE_STYLE, ...style };
  if (alpha <= 0) return;
  const d = clamp(divide);
  const { x, y, w, h } = rect;
  const splitX = orientation === 'vertical' ? x + w * d : x;
  const splitY = orientation === 'horizontal' ? y + h * d : y;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.save();
  ctx.beginPath();
  if (orientation === 'vertical') ctx.rect(x, y, w * d, h);
  else ctx.rect(x, y, w, h * d);
  ctx.clip();
  drawA(ctx, rect);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  if (orientation === 'vertical') ctx.rect(splitX, y, w * (1 - d), h);
  else ctx.rect(x, splitY, w, h * (1 - d));
  ctx.clip();
  drawB(ctx, rect);
  ctx.restore();

  ctx.strokeStyle = rgba(s.ink, 0.85);
  ctx.lineWidth = s.dividerWidth;
  ctx.beginPath();
  if (orientation === 'vertical') {
    ctx.moveTo(splitX, y);
    ctx.lineTo(splitX, y + h);
  } else {
    ctx.moveTo(x, splitY);
    ctx.lineTo(x + w, splitY);
  }
  ctx.stroke();

  ctx.font = `600 ${s.labelPx}px "PingFang TC", "Heiti TC", sans-serif`;
  ctx.fillStyle = rgba(s.ink);
  ctx.textBaseline = 'top';
  if (orientation === 'vertical') {
    ctx.textAlign = 'left';
    ctx.fillText(labelA, x + s.labelPad, y + s.labelPad);
    ctx.textAlign = 'right';
    ctx.fillText(labelB, x + w - s.labelPad, y + s.labelPad);
  } else {
    ctx.textAlign = 'left';
    ctx.fillText(labelA, x + s.labelPad, y + s.labelPad);
    ctx.fillText(labelB, x + s.labelPad, y + h * d + s.labelPad);
  }
  ctx.restore();
}
