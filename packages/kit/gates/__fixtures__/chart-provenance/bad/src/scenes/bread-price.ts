// fixture scene: has a chart call but NO drawSourceFooter — must FAIL because the dataset it uses
// is fictional (once metadata is fixed) — but here the dataset is also missing "fictional"/"source",
// so this scene tests "no source-footer" alongside dangling metadata.
import { drawLineChart } from '../components/charts/line';

export function draw(ctx: CanvasRenderingContext2D, t: number): void {
  drawLineChart(ctx, { datasetId: 'bread-price-index', t });
}
