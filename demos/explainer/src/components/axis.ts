// components/axis.ts — generic numeric axis with ticks + indicator dot(s), for explainer/history/
// economics-profile scenes needing any numeric scale (temperature, distance, %, time, price, year).
//
// This is a COPY template — paste into your own `src/components/axis.ts`.
import { lerp, invLerp, type Pt } from '../core/math';
import { mix, rgba, type RGB } from '../core/color';

export type Orientation = 'vertical' | 'horizontal';

export interface AxisSpec {
  /** Screen-space start point (axis MINIMUM value end) and end point (MAXIMUM value end). */
  from: Pt;
  to: Pt;
  min: number;
  max: number;
  tickStep: number;
  unit?: string; // e.g. '°C', 'km', '%'
  tickPx: number; // tick mark half-length, screen px
  labelPx: number;
  ink: RGB;
  soft: RGB; // dimmer ink for tick labels
}

// Generic, brand-agnostic defaults.
export const DEFAULT_AXIS_STYLE: Omit<AxisSpec, 'from' | 'to' | 'min' | 'max' | 'tickStep'> = {
  tickPx: 14,
  labelPx: 28,
  ink: [42, 31, 26],
  soft: [110, 96, 84],
};

/** Screen point for a given axis value. Pure function of the value (and the fixed spec) — no `t`
 *  dependency of its own; callers animate by varying `value` themselves (e.g. `axisPoint(spec,
 *  lerp(v0, v1, seg(t, a, b)))`). */
export function axisPoint(spec: AxisSpec, value: number): Pt {
  const u = invLerp(spec.min, spec.max, value);
  return { x: lerp(spec.from.x, spec.to.x, u), y: lerp(spec.from.y, spec.to.y, u) };
}

function orientation(spec: AxisSpec): Orientation {
  return Math.abs(spec.to.x - spec.from.x) >= Math.abs(spec.to.y - spec.from.y) ? 'horizontal' : 'vertical';
}

/** Draws the axis line + tick marks + numeric labels (no indicators — see `drawAxisDot`). Pure
 *  paint function, `alpha` lets a caller fade the whole axis in as part of a scene's own timing. */
export function drawAxis(ctx: CanvasRenderingContext2D, spec: AxisSpec, alpha = 1): void {
  if (alpha <= 0) return;
  const orient = orientation(spec);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = rgba(spec.ink);
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(spec.from.x, spec.from.y);
  ctx.lineTo(spec.to.x, spec.to.y);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.fillStyle = rgba(spec.soft);
  ctx.font = `400 ${spec.labelPx}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  const lo = Math.min(spec.min, spec.max);
  const hi = Math.max(spec.min, spec.max);
  for (let v = lo; v <= hi + 1e-9; v += spec.tickStep) {
    const p = axisPoint(spec, v);
    ctx.beginPath();
    if (orient === 'vertical') {
      ctx.moveTo(p.x - spec.tickPx, p.y);
      ctx.lineTo(p.x + spec.tickPx, p.y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(fmt(v), p.x - spec.tickPx - 10, p.y);
    } else {
      ctx.moveTo(p.x, p.y - spec.tickPx);
      ctx.lineTo(p.x, p.y + spec.tickPx);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(fmt(v), p.x, p.y + spec.tickPx + spec.labelPx * 0.8);
    }
  }
  if (spec.unit) {
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(spec.ink);
    const unitPos = orient === 'vertical' ? { x: spec.from.x, y: Math.min(spec.from.y, spec.to.y) - spec.labelPx * 1.2 } : { x: Math.max(spec.from.x, spec.to.x) + spec.labelPx * 1.5, y: spec.from.y };
    ctx.fillText(spec.unit, unitPos.x, unitPos.y);
  }
  ctx.restore();
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** One indicator dot on the axis at `value`, with an optional warm glow (0..1) — a growing glow
 *  reads as "this indicator is about to hand off to something else on screen". */
export function drawAxisDot(ctx: CanvasRenderingContext2D, spec: AxisSpec, value: number, color: RGB, alpha = 1, glow = 0): void {
  if (alpha <= 0) return;
  const p = axisPoint(spec, value);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow > 0) {
    const R = 9 + 40 * glow;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    g.addColorStop(0, rgba(color, 0.9 * glow));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = rgba(color);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(spec.ink);
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();
}

/** A dashed leader line from a screen point to an axis value's point — connects any labelled screen
 *  element to the axis. */
export function drawAxisLeader(ctx: CanvasRenderingContext2D, spec: AxisSpec, from: Pt, value: number, color: RGB, alpha = 1): void {
  if (alpha <= 0) return;
  const to = axisPoint(spec, value);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export { mix };
