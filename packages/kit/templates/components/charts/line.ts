// components/charts/line.ts — economics-profile line chart: draws a data series as a hand-inked line
// that grows LEFT-TO-RIGHT with `reveal` (0..1) — "逐段生長" (design doc §3.1). Pure function of
// `reveal`; no accumulated state. Plots through the SAME `AxisSpec`/`axisPoint` this kit's
// components/axis.ts already ships (a chart's x/y axes ARE just two AxisSpecs, one horizontal one
// vertical) — no new axis math introduced here.
//
// This is a COPY template — paste into your own `src/components/charts/line.ts` (and the sibling
// bar.ts/area.ts alongside it — all three share this file's `ChartPoint`/`chartPoint`).
import type { Pt } from '../../core/math';
import { rgba, type RGB } from '../../core/color';
import { sketch, partial } from '../../core/draw';
import { axisPoint, type AxisSpec } from '../axis';

export interface ChartPoint {
  x: number; // domain value on xAxis (e.g. a year, a period index)
  y: number; // domain value on yAxis
}

/** Screen point for one data point, via the x/y AxisSpecs — the only place chart math meets pixel
 *  math; bar.ts/area.ts reuse this directly rather than duplicating it. */
export function chartPoint(xAxis: AxisSpec, yAxis: AxisSpec, p: ChartPoint): Pt {
  return { x: axisPoint(xAxis, p.x).x, y: axisPoint(yAxis, p.y).y };
}

export interface LineChartStyle {
  color: RGB;
  width: number;
  dotR: number;
  seed: number;
}
export const DEFAULT_LINE_CHART_STYLE: LineChartStyle = { color: [180, 80, 43], width: 4, dotR: 7, seed: 21 };

/** `reveal` 0..1: fraction of the series drawn, left to right BY POINT ORDER (not by x-value
 *  spacing — pass points already sorted by x). A trailing dot marks the current head of the line
 *  while reveal < 1, matching this kit's other "draw-on" components' convention. */
export function drawLineChart(ctx: CanvasRenderingContext2D, xAxis: AxisSpec, yAxis: AxisSpec, points: readonly ChartPoint[], reveal: number, alpha = 1, style: Partial<LineChartStyle> = {}): void {
  const s: LineChartStyle = { ...DEFAULT_LINE_CHART_STYLE, ...style };
  if (alpha <= 0 || points.length < 2) return;
  const pts = points.map((p) => chartPoint(xAxis, yAxis, p));
  const shown = partial(pts, Math.max(0, Math.min(1, reveal)));
  ctx.save();
  ctx.globalAlpha = alpha;
  sketch(ctx, shown, { width: s.width, color: s.color, seed: s.seed, amp: 1.4 });
  if (reveal > 0 && reveal < 1 && shown.length) {
    const head = shown[shown.length - 1];
    ctx.fillStyle = rgba(s.color);
    ctx.beginPath();
    ctx.arc(head.x, head.y, s.dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
