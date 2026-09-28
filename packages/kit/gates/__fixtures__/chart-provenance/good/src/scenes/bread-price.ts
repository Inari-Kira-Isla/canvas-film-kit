// fixture scene — not real film code, just enough shape for chart-provenance.mjs to parse.
import { drawLineChart } from '../components/charts/line';
import { drawSourceFooter } from '../components/source-footer';

export function draw(ctx: CanvasRenderingContext2D, t: number): void {
  drawLineChart(ctx, { datasetId: 'bread-price-index', t });
  drawSourceFooter(ctx, { source: 'fixture', fictional: true, t });
}
