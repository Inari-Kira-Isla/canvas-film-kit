// scenes/island-inflation.ts — "The Fictional Island's Bread Price: What Is Inflation" (canvas-
// film-kit K4 economics demo). Single continuous scene, same "no interior boundary to hide a hard
// cut behind" reasoning as this kit's other demos.
//
// Exercises every K4 economics-profile component in one place: charts/line + charts/bar (both plot
// through the SAME src/data/island-economy.json dataset), count-up (a pure function of `t` — see
// that file's own header), entity-card, and source-footer (the ONE component that renders the
// mandatory "示意數據" disclosure whenever a fictional dataset's flag is wired through it —
// gates/chart-provenance.mjs looks for exactly this call).
import { seg, ease, clamp } from '../core/math';
import { mix, P } from '../core/color';
import { DURATION, T, type Scene } from '../core/timeline';
import { drawChapterCard } from '../components/chapter-card';
import { drawCaptionPlate, type CaptionCue } from '../components/caption-plate';
import { DEFAULT_AXIS_STYLE, drawAxis, type AxisSpec } from '../components/axis';
import { drawLineChart, type ChartPoint } from '../components/charts/line';
import { drawBarChart } from '../components/charts/bar';
import { drawCountUp, type CountUpSpec } from '../components/count-up';
import { drawEntityCard } from '../components/entity-card';
import { drawSourceFooter } from '../components/source-footer';
import dataset from '../data/island-economy.json';
import timeline from '../content/timeline.json';

// ---- captions ----
const CUES: CaptionCue[] = timeline.cards.map((c, i, arr) => ({
  id: c.card_id,
  zh: c.zh,
  en: c.en,
  t_in: c.show_start,
  t_out: c.show_end,
  contiguousWithNext: c.contiguous_with_next,
  contiguousWithPrev: i > 0 ? arr[i - 1].contiguous_with_next : false,
}));

// ---- dataset: read straight from src/data/island-economy.json (the SAME file chart-provenance.mjs
// validates at gate time) — never a re-typed copy of the numbers, so the chart and the gate's
// metadata check can never silently drift apart. ----
interface BreadDataset { id: string; source: string; url: string; retrieved: string; unit: string; license: string; fictional: boolean; values: { year: number; price: number }[] }
interface BakeryDataset { id: string; source: string; url: string; retrieved: string; unit: string; license: string; fictional: boolean; name: string; founded: string; description: string }
const BREAD = dataset.find((d) => d.id === 'bread-price-index') as unknown as BreadDataset;
const BAKERY = dataset.find((d) => d.id === 'lighthouse-bakery') as unknown as BakeryDataset;
const PRICE_POINTS: ChartPoint[] = BREAD.values.map((v) => ({ x: v.year, y: v.price }));
const START_PRICE = PRICE_POINTS[0].y;
const END_PRICE = PRICE_POINTS[PRICE_POINTS.length - 1].y;
const INFLATION_PCT = ((END_PRICE - START_PRICE) / START_PRICE) * 100;

const LINE_X_AXIS: AxisSpec = { from: { x: 260, y: 820 }, to: { x: 900, y: 820 }, min: 1, max: 4, tickStep: 1, unit: 'yr', ...DEFAULT_AXIS_STYLE, ink: P.ink, soft: mix(P.ink, P.bg, 0.4) };
const LINE_Y_AXIS: AxisSpec = { from: { x: 260, y: 820 }, to: { x: 260, y: 300 }, min: 0, max: 18, tickStep: 6, unit: BREAD.unit, ...DEFAULT_AXIS_STYLE, ink: P.ink, soft: mix(P.ink, P.bg, 0.4) };
const BAR_X_AXIS: AxisSpec = { from: { x: 1150, y: 820 }, to: { x: 1450, y: 820 }, min: 1, max: 4, tickStep: 3, unit: 'yr', ...DEFAULT_AXIS_STYLE, ink: P.ink, soft: mix(P.ink, P.bg, 0.4) };
const BAR_Y_AXIS: AxisSpec = { from: { x: 1150, y: 820 }, to: { x: 1150, y: 300 }, min: 0, max: 18, tickStep: 6, unit: BREAD.unit, ...DEFAULT_AXIS_STYLE, ink: P.ink, soft: mix(P.ink, P.bg, 0.4) };

const COUNT_UP: CountUpSpec = { from: 0, to: INFLATION_PCT, start: T.countUp[0], end: T.countUp[1], decimals: 0, locale: 'en-US', prefix: '+', suffix: '%' };

export const islandInflationScene: Scene = {
  name: 'island-inflation',
  start: 0,
  end: DURATION,
  draw(ctx, t) {
    // ---- the entity-card coda takes over the main visual area, so the chart/bar/count-up fade out
    // as it fades in (same "one thing at a time" composition rule this kit's history demo settled
    // on after an earlier layout-collision fix). ----
    const preCardFade = 1 - seg(t, T.entityCard[0] - 0.5, T.entityCard[0], ease.inOutSine);

    // ---- line chart: bread price across all 4 fictional years, draws on during N2 ----
    const lineReveal = seg(t, T.lineReveal[0], T.lineReveal[1], ease.outCubic);
    if (lineReveal > 0 && preCardFade > 0.001) {
      const a = Math.min(1, seg(t, T.lineReveal[0], T.lineReveal[0] + 0.3)) * preCardFade;
      drawAxis(ctx, LINE_X_AXIS, a);
      drawAxis(ctx, LINE_Y_AXIS, a);
      drawLineChart(ctx, LINE_X_AXIS, LINE_Y_AXIS, PRICE_POINTS, lineReveal, a, { color: P.accent });
    }

    // ---- bar-chart comparison: Year 1 vs Year 4 (yMin=0, per chart-provenance.mjs's own "y axis
    // starts at 0" rule — see src/content/chart_manifest.json's yMin/truncatedAxis fields), during N3 ----
    const barReveal = seg(t, T.barReveal[0], T.barReveal[1], ease.outCubic);
    if (barReveal > 0 && preCardFade > 0.001) {
      const a = Math.min(1, seg(t, T.barReveal[0], T.barReveal[0] + 0.3)) * preCardFade;
      drawAxis(ctx, BAR_X_AXIS, a);
      drawAxis(ctx, BAR_Y_AXIS, a);
      drawBarChart(ctx, BAR_X_AXIS, BAR_Y_AXIS, [PRICE_POINTS[0], PRICE_POINTS[PRICE_POINTS.length - 1]], barReveal, a, { color: P.signal, barWidthPx: 90 });
    }

    // ---- count-up: the inflation percentage headline, inside N3 ----
    if (t >= T.countUp[0] && preCardFade > 0.001) {
      drawCountUp(ctx, COUNT_UP, t, 1600, 420, preCardFade, { px: 110, ink: P.accent });
    }

    // ---- entity card + mandatory fictional-data disclosure, during N4 ----
    const cardAlpha = clamp(seg(t, T.entityCard[0], T.entityCard[0] + 0.5));
    if (cardAlpha > 0) {
      drawEntityCard(ctx, t, T.entityCard[0], { name: BAKERY.name, year: BAKERY.founded, description: BAKERY.description, sourceId: 'lighthouse-bakery' }, { x: 120, y: 560, w: 640, h: 220, bg: mix(P.bg, [255, 255, 255], 0.4), ink: P.ink, accent: P.accent });
    }

    // ---- mandatory source-footer disclosure — ALWAYS on screen once the chart data appears, never
    // gated behind the same fade as the chart itself, so "this is illustrative data" stays legible
    // even while other elements are fading in/out. `fictional: true` here is the literal call-site
    // token gates/chart-provenance.mjs's text scan looks for. ----
    if (t >= T.lineReveal[0]) {
      drawSourceFooter(ctx, { source: BREAD.source, fictional: BREAD.fictional, retrieved: BREAD.retrieved }, 1, { x: 60, y: 60 });
    }

    // ---- narration captions ----
    drawCaptionPlate(ctx, t, CUES, { underline: P.signal, plate: mix(P.ink, [0, 0, 0] as const, 0.3) });

    // ---- opening chapter card, drawn LAST as a real hard cut over [0, T.chapterCard[1]) ----
    drawChapterCard(ctx, t, T.chapterCard[0], T.chapterCard[1], '虛構小島嘅麵包價', '乜嘢係通脹？', 1920, 1080, { bg: P.bg, ink: P.ink, accent: P.accent });
  },
};
