import { drawBarChart } from '../components/charts/bar';
import { drawSourceFooter } from '../components/source-footer';

export function draw(ctx: CanvasRenderingContext2D, t: number): void {
  drawBarChart(ctx, { datasetId: 'island-population', yMin: 500, t });
  drawSourceFooter(ctx, { source: 'fixture', fictional: true, t });
}
