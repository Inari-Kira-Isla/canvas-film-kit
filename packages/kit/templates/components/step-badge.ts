// components/step-badge.ts — numbered step row with a current-step highlight, for the explainer
// profile's "how does X work" pieces. Pure function of `t`.
//
// This is a COPY template (see templates/components/lineart.ts's own header for why components are
// copy-paste, not an npm dependency) — paste into your own `src/components/step-badge.ts`.
//
// Draws a horizontal row of N numbered circles; the step whose [start, end) window contains `t` is
// highlighted (filled + scaled up slightly); steps already passed are drawn "done" (filled, no
// scale); steps not yet reached are drawn hollow.
import { clamp, seg, ease, type Pt } from '../core/math';
import { rgba, mix, type RGB } from '../core/color';
import { sketch, circlePts } from '../core/draw';

export interface Step {
  id: string;
  label: string; // FILL IN short label under the badge, e.g. 'catch'
  start: number; // this step is "current" for start <= t < end
  end: number;
}

export interface StepBadgeStyle {
  cx: number; // row horizontal centre
  cy: number; // row vertical centre
  gap: number; // spacing between badge centres, px
  r: number; // resting radius, px
  currentScale: number; // radius multiplier while current (e.g. 1.25)
  ink: RGB;
  accent: RGB;
  labelPx: number;
  fadeIn: number; // seconds — whole-row entrance fade
}

// Generic, brand-agnostic defaults — a project styles its own row by passing a Partial<StepBadgeStyle>
// built from its own theme.ts palette, rather than editing these.
export const DEFAULT_STEP_BADGE_STYLE: StepBadgeStyle = {
  cx: 960,
  cy: 140,
  gap: 140,
  r: 30,
  currentScale: 1.25,
  ink: [42, 31, 26],
  accent: [236, 122, 60],
  labelPx: 26,
  fadeIn: 0.4,
};

/** Index of the step whose [start, end) window contains `t`, or -1 if `t` is before the first
 *  step or sits in a gap between two steps. Pure. */
export function currentStepIndex(t: number, steps: readonly Step[]): number {
  for (let i = 0; i < steps.length; i++) {
    if (t >= steps[i].start && t < steps[i].end) return i;
  }
  return -1;
}

/** Draws the whole row. `tRowStart` is when the row itself should fade in (defaults to the first
 *  step's start). Pure function of `t` — no mutable state. */
export function drawStepBadges(
  ctx: CanvasRenderingContext2D,
  t: number,
  steps: readonly Step[],
  style: Partial<StepBadgeStyle> = {},
  tRowStart = steps[0]?.start ?? 0,
): void {
  const s: StepBadgeStyle = { ...DEFAULT_STEP_BADGE_STYLE, ...style };
  const rowAlpha = seg(t, tRowStart, tRowStart + s.fadeIn);
  if (rowAlpha <= 0 || steps.length === 0) return;
  const current = currentStepIndex(t, steps);
  const x0 = s.cx - ((steps.length - 1) * s.gap) / 2;

  ctx.save();
  ctx.globalAlpha = rowAlpha;
  // connecting line (drawn first, under the badges)
  ctx.strokeStyle = rgba(s.ink, 0.25);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, s.cy);
  ctx.lineTo(x0 + (steps.length - 1) * s.gap, s.cy);
  ctx.stroke();

  steps.forEach((step, i) => {
    const x = x0 + i * s.gap;
    const isCurrent = i === current;
    const isDone = !isCurrent && t >= step.end;
    const scale = isCurrent ? clamp(1 + (s.currentScale - 1) * seg(t, step.start, step.start + 0.25, ease.outBack)) : 1;
    const r = s.r * scale;
    const fill = isCurrent || isDone;
    const pts: Pt[] = circlePts(x, s.cy, r, 40);
    if (fill) {
      ctx.fillStyle = rgba(isCurrent ? s.accent : mix(s.accent, s.ink, 0.4), 1);
      ctx.beginPath();
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
    }
    sketch(ctx, pts, { closed: true, width: 3, color: fill ? s.accent : s.ink, seed: i + 1, amp: 1.6 });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(r * 0.9)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = fill ? rgba([255, 255, 255]) : rgba(s.ink);
    ctx.fillText(String(i + 1), x, s.cy + 1);

    ctx.font = `500 ${s.labelPx}px "PingFang TC", "Heiti TC", sans-serif`;
    ctx.fillStyle = rgba(isCurrent ? s.accent : s.ink, isCurrent ? 1 : 0.7);
    ctx.fillText(step.label, x, s.cy + r + s.labelPx * 0.9 + 8);
  });
  ctx.restore();
}
