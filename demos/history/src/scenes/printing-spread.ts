// scenes/printing-spread.ts — "How Printing Spread Across Europe (1450-1500)" (canvas-film-kit K4
// history demo). Single continuous scene, same "no interior boundary to hide a hard cut behind"
// reasoning as this kit's other demos — every element below self-gates to its own T window.
//
// Exercises every K4 history-profile component in one place: year-axis (calendar years, a SEPARATE
// coordinate system from narration seconds — see core/timeline.ts's own T comment), map-route
// (schematic, "示意" badge baked in), silhouette (Gutenberg, never an AI-generated face — see
// components/silhouette.ts's own header), split-compare (then/now coda), and the caption-plate this
// kit's explainer profile already uses.
import { seg, ease, clamp } from '../core/math';
import { mix, P } from '../core/color';
import { DURATION, T, type Scene } from '../core/timeline';
import { drawChapterCard } from '../components/chapter-card';
import { drawCaptionPlate, type CaptionCue } from '../components/caption-plate';
import { drawYearAxis, drawYearMarker, year, type YearAxisSpec } from '../components/year-axis';
import { drawMapRoute, type MapPlace } from '../components/map-route';
import { drawSilhouette, genericBustOutline } from '../components/silhouette';
import { drawSplitCompare } from '../components/split-compare';
import { sketch, circlePts } from '../core/draw';
import timeline from '../content/timeline.json';

// ---- captions: built from the REAL, measured src/content/timeline.json (same pattern as
// demos/explainer's own moon-phases.ts — never hand-typed durations). ----
const CUES: CaptionCue[] = timeline.cards.map((c, i, arr) => ({
  id: c.card_id,
  zh: c.zh,
  en: c.en,
  t_in: c.show_start,
  t_out: c.show_end,
  contiguousWithNext: c.contiguous_with_next,
  contiguousWithPrev: i > 0 ? arr[i - 1].contiguous_with_next : false,
}));

// ---- year axis: 1450 -> 1500, an INDEPENDENT coordinate system from narration seconds. The current
// year at time `t` is computed once here (a plain 0..1 progress -> lerp), never by reusing a
// narration-second value AS a year — see year-axis.ts's own header for why that distinction matters. ----
const YEAR_AXIS: YearAxisSpec = {
  from: { x: 260, y: 780 },
  to: { x: 1660, y: 780 },
  minYear: year(1450),
  maxYear: year(1500),
  tickStepYears: 10,
  ink: P.ink,
  soft: mix(P.ink, P.bg, 0.4),
  tickPx: 12,
  labelPx: 24,
};
function currentYear(t: number): number {
  const u = clamp(seg(t, T.yearAxis[0], T.yearAxis[1], ease.inOutSine));
  return 1450 + u * (1500 - 1450);
}

// ---- schematic route: Mainz -> Strasbourg -> Venice -> Paris. Layout positions are an ABSTRACT
// on-screen arrangement, not real geography (map-route.ts's own header + the mandatory "示意" badge
// it always paints). ----
// Order matters: map-route.ts draws the route THROUGH these points in array order (partial() cuts
// the polyline at a fraction of total length) — listed in a left-to-right, no-backtrack layout order
// so the "draw-on" line never has to double back on itself mid-reveal.
const ROUTE: MapPlace[] = [
  { id: 'mainz', label: 'Mainz', at: { x: 340, y: 300 } },
  { id: 'strasbourg', label: 'Strasbourg', at: { x: 560, y: 400 } },
  { id: 'paris', label: 'Paris', at: { x: 800, y: 300 } },
  { id: 'venice', label: 'Venice', at: { x: 1150, y: 560 } },
];

const GUTENBERG_OUTLINE = genericBustOutline(1560, 560, 1.35);

/** Two small schematic line-art panels for the split-compare coda — "then" (a hand press, a few
 *  straight strokes) vs "now" (a rounded modern press body). Deliberately minimal line art, not a
 *  photo/illustration — this coda is about the SHAPE of the comparison, not period accuracy. */
function drawThenPanel(ctx: CanvasRenderingContext2D): void {
  const cx = 480, cy = 560;
  sketch(ctx, [{ x: cx - 140, y: cy + 160 }, { x: cx + 140, y: cy + 160 }], { width: 6, color: P.ink, seed: 31, amp: 1.2 });
  sketch(ctx, [{ x: cx - 60, y: cy + 160 }, { x: cx - 60, y: cy - 120 }, { x: cx + 60, y: cy - 120 }, { x: cx + 60, y: cy + 160 }], { width: 6, color: P.ink, seed: 32, amp: 1.4 });
  sketch(ctx, [{ x: cx - 90, y: cy - 60 }, { x: cx + 90, y: cy - 60 }], { width: 10, color: P.accent, seed: 33, amp: 1.0 });
}
function drawNowPanel(ctx: CanvasRenderingContext2D): void {
  const cx = 1440, cy = 560;
  sketch(ctx, circlePts(cx, cy - 20, 120, 40), { closed: true, width: 6, color: P.ink, seed: 34, amp: 1.0 });
  sketch(ctx, [{ x: cx - 140, y: cy + 160 }, { x: cx + 140, y: cy + 160 }], { width: 6, color: P.ink, seed: 35, amp: 1.2 });
  sketch(ctx, [{ x: cx - 120, y: cy + 160 }, { x: cx - 120, y: cy + 60 }, { x: cx + 120, y: cy + 60 }, { x: cx + 120, y: cy + 160 }], { width: 6, color: P.ink, seed: 36, amp: 1.2 });
}

export const printingSpreadScene: Scene = {
  name: 'printing-spread',
  start: 0,
  end: DURATION,
  draw(ctx, t) {
    // ---- year axis + "we are here" marker, visible for the whole narration arc ----
    if (t >= T.yearAxis[0]) {
      const axisAlpha = seg(t, T.yearAxis[0], T.yearAxis[0] + 0.5);
      drawYearAxis(ctx, YEAR_AXIS, axisAlpha);
      const y = currentYear(t);
      drawYearMarker(ctx, YEAR_AXIS, year(Math.round(y)), P.accent, axisAlpha, 0.6, `${Math.round(y)}`);
    }

    // ---- the split-compare coda takes over the WHOLE main visual area (design doc's own "one thing
    // at a time" reading), so the route + silhouette fade out as it fades in — otherwise all three
    // occupy the same screen region at once (a real overlap bug an earlier still-frame check caught:
    // "1450s"/"Mainz" labels colliding, the "now" panel drawn over the Gutenberg name label). ----
    const preSplitFade = 1 - seg(t, T.splitCompare[0] - 0.5, T.splitCompare[0], ease.inOutSine);

    // ---- schematic route, draws on across N2 into N3, fades out once the split-compare coda starts ----
    const mapReveal = seg(t, T.mapReveal[0], T.mapReveal[1], ease.outCubic);
    if (mapReveal > 0 && preSplitFade > 0.001) {
      drawMapRoute(ctx, ROUTE, mapReveal, preSplitFade, { ink: P.ink, accent: P.accent, frameW: 1920, frameH: 1080 });
    }

    // ---- Gutenberg silhouette, draws on during N1, fades out with the route above ----
    const silReveal = seg(t, T.silhouetteReveal[0], T.silhouetteReveal[1], ease.outCubic);
    if (silReveal > 0 && preSplitFade > 0.001) {
      drawSilhouette(ctx, GUTENBERG_OUTLINE, silReveal, preSplitFade, { ink: P.ink, labelInk: mix(P.ink, P.bg, 0.3) }, 'Johannes Gutenberg', { x: 1560, y: 700 });
    }

    // ---- then/now split-compare coda, during N4's closing window ----
    const splitAlpha = seg(t, T.splitCompare[0], T.splitCompare[0] + 0.5) * (1 - seg(t, T.splitCompare[1] - 0.4, T.splitCompare[1]));
    if (splitAlpha > 0.001) {
      const divide = clamp(seg(t, T.splitCompare[0], T.splitCompare[0] + 1.0, ease.outCubic)) * 0.5;
      drawSplitCompare(
        ctx,
        { x: 260, y: 260, w: 1400, h: 480 },
        'vertical',
        divide,
        (c2) => drawThenPanel(c2),
        (c2) => drawNowPanel(c2),
        '1450s',
        '1500s',
        splitAlpha,
        { ink: P.ink },
      );
    }

    // ---- narration captions ----
    drawCaptionPlate(ctx, t, CUES, { underline: P.signal, plate: mix(P.ink, [0, 0, 0] as const, 0.3) });

    // ---- opening chapter card, drawn LAST as a real hard cut over [0, T.chapterCard[1]) ----
    drawChapterCard(ctx, t, T.chapterCard[0], T.chapterCard[1], '印刷術點樣傳遍歐洲', '1450 – 1500', 1920, 1080, { bg: P.bg, ink: P.ink, accent: P.accent });
  },
};
