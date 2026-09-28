// components/charts/area.ts — economics-profile filled area chart: same series/axis contract as
// charts/line.ts (reuses its `ChartPoint`/`chartPoint`/`drawLineChart`), fills the region between the
// line and the yAxis baseline (value 0 by default — same convention as charts/bar.ts). "逐段生長" via
// the same left-to-right `reveal` (0..1) as every other chart in this kit.
//
// This is a COPY template — paste into your own `src/components/charts/area.ts`.
import { rgba, type RGB } from '../../core/color';
import { partial } from '../../core/draw';
import { axisPoint, type AxisSpec } from '../axis';
import { chartPoint, drawLineChart, type ChartPoint, type LineChartStyle } from './line';

export interface AreaChartStyle extends LineChartStyle {
  fill: RGB;
  fillAlpha: number;
}
export const DEFAULT_AREA_CHART_STYLE: AreaChartStyle = { color: [180, 80, 43], width: 4, dotR: 7, seed: 21, fill: [180, 80, 43], fillAlpha: 0.18 };

export function drawAreaChart(ctx: CanvasRenderingContext2D, xAxis: AxisSpec, yAxis: AxisSpec, points: readonly ChartPoint[], reveal: number, alpha = 1, style: Partial<AreaChartStyle> = {}): void {
  const s: AreaChartStyle = { ...DEFAULT_AREA_CHART_STYLE, ...style };
  if (alpha <= 0 || points.length < 2) return;
  const pts = points.map((p) => chartPoint(xAxis, yAxis, p));
  const shown = partial(pts, Math.max(0, Math.min(1, reveal)));
  if (shown.length >= 2) {
    const baseline = axisPoint(yAxis, yAxis.min).y;
    ctx.save();
    ctx.globalAlpha = alpha * s.fillAlpha;
    ctx.fillStyle = rgba(s.fill);
    ctx.beginPath();
    ctx.moveTo(shown[0].x, baseline);
    for (const p of shown) ctx.lineTo(p.x, p.y);
    ctx.lineTo(shown[shown.length - 1].x, baseline);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  drawLineChart(ctx, xAxis, yAxis, points, reveal, alpha, s);
}
