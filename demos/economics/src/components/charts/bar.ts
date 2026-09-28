// components/charts/bar.ts — economics-profile bar chart. Each bar grows from the axis baseline
// (`yAxis`'s value-0 point BY DEFAULT — see gates/chart-provenance.mjs's own "y axis starts at 0"
// rule) up to its value, "逐段生長" via a per-bar local reveal derived from one overall chart
// `reveal` (bars fill in left to right). A caller wanting a genuinely truncated axis (yAxis.min !==
// 0) must say so explicitly in `src/content/chart_manifest.json`'s `truncatedAxis` field —
// chart-provenance.mjs enforces that at gate time; this component itself does not judge, it just
// draws whatever `yAxis` it's given.
//
// This is a COPY template — paste into your own `src/components/charts/bar.ts`.
import { rgba, type RGB } from '../../core/color';
import { axisPoint, type AxisSpec } from '../axis';
import type { ChartPoint } from './line';

export interface BarChartStyle {
  color: RGB;
  barWidthPx: number;
}
export const DEFAULT_BAR_CHART_STYLE: BarChartStyle = { color: [180, 80, 43], barWidthPx: 64 };

/** `reveal` 0..1: bars fill in left to right (bar i's own local reveal is `reveal` re-scaled to
 *  [i/n, (i+1)/n]), each bar's own height then grows 0->full within its own local reveal window —
 *  the classic "count the bars in, then grow the current one" animation, expressed as a pure
 *  function of the single `reveal` input. */
export function drawBarChart(ctx: CanvasRenderingContext2D, xAxis: AxisSpec, yAxis: AxisSpec, points: readonly ChartPoint[], reveal: number, alpha = 1, style: Partial<BarChartStyle> = {}): void {
  const s: BarChartStyle = { ...DEFAULT_BAR_CHART_STYLE, ...style };
  if (alpha <= 0 || points.length === 0) return;
  const n = points.length;
  const baseline = axisPoint(yAxis, yAxis.min).y; // yAxis.min is this bar chart's own y=0 — see header
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(s.color);
  points.forEach((p, i) => {
    const localReveal = Math.max(0, Math.min(1, (reveal - i / n) * n));
    if (localReveal <= 0) return;
    const cx = axisPoint(xAxis, p.x).x;
    const fullY = axisPoint(yAxis, p.y).y;
    const y = baseline + (fullY - baseline) * localReveal;
    const top = Math.min(y, baseline);
    const h = Math.abs(y - baseline);
    ctx.fillRect(cx - s.barWidthPx / 2, top, s.barWidthPx, h);
  });
  ctx.restore();
}
