// scenes/moon-phases.ts — "Why Does the Moon Have Phases" (canvas-film-kit K3 explainer demo).
// Single continuous scene (chapter card + narration content), same "no interior boundary to hide a
// hard cut behind" reasoning as the abstract/music demos' own single-scene choice — every element
// here self-gates to its own T window instead of needing a second Scene entry + hand-off row.
import { CX, CY, seg, ease, clamp, type Pt } from '../core/math';
import { sketch, circlePts } from '../core/draw';
import { rgba, mix } from '../core/color';
import { P } from '../core/color';
import { DURATION, T, type Scene } from '../core/timeline';
import { drawChapterCard } from '../components/chapter-card';
import { drawCaptionPlate, type CaptionCue } from '../components/caption-plate';
import { drawPointer } from '../components/pointer';
import { drawStepBadges, type Step } from '../components/step-badge';
import timeline from '../content/timeline.json';

// ---- captions: built from the REAL, measured src/content/timeline.json (narration/build-timeline.mjs's
// output) — never hand-typed durations, so this scene can never silently drift from the actual
// audio/vo/*.wav lengths `kit tts build` measured. ----
const CUES: CaptionCue[] = timeline.cards.map((c, i, arr) => ({
  id: c.card_id,
  zh: c.zh,
  en: c.en,
  t_in: c.show_start,
  t_out: c.show_end,
  contiguousWithNext: c.contiguous_with_next,
  contiguousWithPrev: i > 0 ? arr[i - 1].contiguous_with_next : false,
}));

// ---- step-badge row: new / first quarter / full / last quarter, spanning T.stepRow (N4's window).
// Built fresh from T.stepRow INSIDE draw() below (not here, at module load) — story-metrics.mjs's
// beat-keys-all-used check only credits a T read that happens during the draw() sampling pass. ----
const STEP_LABELS = ['new', '1st quarter', 'full', 'last quarter'];
function buildSteps(s0: number, s1: number): Step[] {
  const each = (s1 - s0) / STEP_LABELS.length;
  return STEP_LABELS.map((label, i) => ({ id: `step${i}`, label, start: s0 + i * each, end: s0 + (i + 1) * each }));
}

const MOON_CX = CX;
const MOON_CY = CY - 40;
const MOON_R = 220;
const SUN_POS: Pt = { x: MOON_CX - 560, y: MOON_CY - 40 };

/** Phase fraction 0..1 over the film's own narration arc (N3/N4 — "Earth's view of the lit half
 *  changes over the cycle"): 0/1 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. Ramps
 *  smoothly across [T.n3[0], T.n4[1]] so the disc visibly cycles while N3/N4 narrate it, then holds
 *  at "full" once the step-badge row lands on that step — a deliberate simplification (real orbital
 *  phase is continuous, not scene-gated) appropriate for a 25s explainer, not a planetarium. */
function phaseFraction(t: number): number {
  const u = seg(t, T.n3[0], T.n4[1], ease.inOutSine);
  return clamp(u); // sweeps the full new->quarter->full->quarter->new cycle across the narrated arc,
  // matching N4's own "新月、上弦、滿月、下弦" caption and the step-badge row below
}

/** Draws the Moon disc with a lit/dark terminator for a given phase fraction (0=new, 0.5=full). Pure
 *  function of `phase` — the classic "two intersecting curves" trick: a straight diameter (the
 *  circle's own right or left edge) plus a half-ellipse terminator whose horizontal radius tracks
 *  how far into the cycle we are. */
function drawMoonDisc(ctx: CanvasRenderingContext2D, phase: number): void {
  const theta = phase * Math.PI * 2;
  const k = -Math.cos(theta); // -1 new, 0 quarter, +1 full
  const waxing = phase < 0.5;
  const rx = MOON_R * Math.abs(k);

  ctx.save();
  ctx.beginPath();
  ctx.arc(MOON_CX, MOON_CY, MOON_R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = rgba(mix(P.ink, P.bg, 0.15));
  ctx.fillRect(MOON_CX - MOON_R, MOON_CY - MOON_R, MOON_R * 2, MOON_R * 2);

  // The terminator ellipse must retrace the SAME side as the base semicircle (enclosing ~0 area) at
  // the near-new end of each half-cycle, and the OPPOSITE side (enclosing the full disc) at the
  // near-full end — which side counts as "same" flips between waxing (base=right semicircle) and
  // waning (base=left semicircle), hence the two branches below.
  const sweepFlag = waxing ? k < 0 : k >= 0;
  ctx.beginPath();
  ctx.moveTo(MOON_CX, MOON_CY - MOON_R);
  if (waxing) ctx.arc(MOON_CX, MOON_CY, MOON_R, -Math.PI / 2, Math.PI / 2, false); // right edge, top->bottom
  else ctx.arc(MOON_CX, MOON_CY, MOON_R, Math.PI + Math.PI / 2, Math.PI / 2, true); // left edge, top->bottom
  ctx.ellipse(MOON_CX, MOON_CY, rx, MOON_R, 0, Math.PI / 2, -Math.PI / 2, sweepFlag);
  ctx.closePath();
  ctx.fillStyle = rgba(mix(P.accent, [255, 255, 255] as const, 0.3));
  ctx.fill();
  ctx.restore();

  sketch(ctx, circlePts(MOON_CX, MOON_CY, MOON_R, 96), { closed: true, width: 3.5, color: P.ink, seed: 2, amp: 1.4 });
}

export const moonPhasesScene: Scene = {
  name: 'moon-phases',
  start: 0,
  end: DURATION,
  draw(ctx, t) {
    // ---- Sun + pointer, during N1/N2 (moonlight is reflected sunlight) ----
    const pointerReveal = seg(t, T.pointerReveal[0], T.pointerReveal[1], ease.outCubic);
    if (pointerReveal > 0) {
      const sunAlpha = seg(t, T.n1[0], T.n1[0] + 0.5);
      ctx.save();
      ctx.globalAlpha = sunAlpha;
      ctx.fillStyle = rgba(mix(P.accent, [255, 240, 200] as const, 0.5));
      ctx.beginPath();
      ctx.arc(SUN_POS.x, SUN_POS.y, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawPointer(ctx, { x: SUN_POS.x + 60, y: SUN_POS.y }, { x: MOON_CX - MOON_R - 20, y: MOON_CY }, pointerReveal, { color: P.accent, seed: 9 });
    }

    // ---- the Moon itself, visible for the whole narration arc ----
    if (t >= T.n1[0]) drawMoonDisc(ctx, phaseFraction(t));

    // ---- step-badge row (new/1st quarter/full/last quarter), during N4 ----
    const steps = buildSteps(T.stepRow[0], T.stepRow[1]);
    drawStepBadges(ctx, t, steps, { cx: CX, cy: 760, gap: 170, ink: P.ink, accent: P.accent });

    // ---- the one quantitative claim, drawn directly so fact-strings-check.mjs's literal-call
    // heuristic can see and verify it against research/fact_table.md's C01 row (docs/preproduction.md's
    // Notes section explains why this is a direct call rather than a cards.json cue). ----
    const factAlpha = seg(t, T.factNumeral[0], T.factNumeral[0] + 0.5);
    if (factAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = factAlpha;
      ctx.textAlign = 'center';
      ctx.font = '700 40px "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = rgba(P.signal);
      ctx.fillText('29.5 天一個週期', CX, 200); // fact: C01
      ctx.restore();
    }

    // ---- narration captions ----
    drawCaptionPlate(ctx, t, CUES, { underline: P.signal, plate: mix(P.ink, [0, 0, 0] as const, 0.3) });

    // ---- opening chapter card, drawn LAST so its opaque wash is a real hard cut over everything
    // above while [0, T.chapterCard[1]] is active (declared as such — see src/core/timeline.ts's
    // hand-off contract comment). ----
    drawChapterCard(ctx, t, T.chapterCard[0], T.chapterCard[1], '月亮點解有圓缺', 'Why does the Moon have phases?', 1920, 1080, { bg: P.bg, ink: P.ink, accent: P.accent });
  },
};
