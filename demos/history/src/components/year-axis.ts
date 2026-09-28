// components/year-axis.ts — history-profile-only. TWO INDEPENDENT time axes: calendar YEARS
// (branded `Year`) vs narration TIMELINE SECONDS (`t`, from `core/timeline.ts`) — the design doc's
// own history-profile rule: "年份軸座標同旁白秒數兩個座標系分開（型別上唔同 branded type）". It is
// trivially easy to accidentally plug a raw `t` (seconds) into a function expecting a `Year`, and
// get a plausible-looking WRONG date on screen — TypeScript's structural typing can't catch that for
// two plain `number`s, so this file uses a nominal/branded type instead.
//
// This is a COPY template — paste into your own `src/components/year-axis.ts`. Built on top of this
// kit's existing components/axis.ts (a year axis IS just a generic AxisSpec whose values happen to
// be years) — no new pixel math here, just the branding + year-specific label formatting (no
// decimals, no thousands separator).
import { lerp, invLerp, type Pt } from '../core/math';
import { rgba, mix, type RGB } from '../core/color';
import { drawAxis, drawAxisDot, drawAxisLeader, type AxisSpec } from './axis';

/** A calendar year. NEVER a narration-timeline second — see this file's header. Construct with
 *  `year(1450)`, never a bare number cast at a call site. */
export type Year = number & { readonly __brand: 'Year' };
export const year = (n: number): Year => n as Year;

export interface YearAxisSpec {
  from: Pt;
  to: Pt;
  minYear: Year;
  maxYear: Year;
  tickStepYears: number;
  ink: RGB;
  soft: RGB;
  tickPx: number;
  labelPx: number;
}

export const DEFAULT_YEAR_AXIS_STYLE: Omit<YearAxisSpec, 'from' | 'to' | 'minYear' | 'maxYear' | 'tickStepYears'> = {
  tickPx: 14,
  labelPx: 26,
  ink: [42, 31, 26],
  soft: [110, 96, 84],
};

function toAxisSpec(spec: YearAxisSpec): AxisSpec {
  return {
    from: spec.from,
    to: spec.to,
    min: spec.minYear,
    max: spec.maxYear,
    tickStep: spec.tickStepYears,
    tickPx: spec.tickPx,
    labelPx: spec.labelPx,
    ink: spec.ink,
    soft: spec.soft,
  };
}

/** Screen point for a given `Year` — the ONLY function that should ever convert a Year to pixels. */
export function yearPoint(spec: YearAxisSpec, y: Year): Pt {
  const u = invLerp(spec.minYear, spec.maxYear, y);
  return { x: lerp(spec.from.x, spec.to.x, u), y: lerp(spec.from.y, spec.to.y, u) };
}

/** Draws the year axis line + tick years + labels. A caller animates by fading `alpha` from its own
 *  `seg(t, ...)` — this function never reads narration `t` directly, only `alpha` (a plain 0..1
 *  number, deliberately NOT a Year or a timeline second — the one bridge between the two coordinate
 *  systems that isn't itself branded, because it means neither one). */
export function drawYearAxis(ctx: CanvasRenderingContext2D, spec: YearAxisSpec, alpha = 1): void {
  drawAxis(ctx, toAxisSpec(spec), alpha);
}

/** A "we are here" marker at `atYear`, with an optional label (e.g. "1450"). `glow` (0..1, driven by
 *  the caller's own `t`) makes the marker pulse when this moment is the current narration beat. */
export function drawYearMarker(ctx: CanvasRenderingContext2D, spec: YearAxisSpec, atYear: Year, color: RGB, alpha = 1, glow = 0, label?: string): void {
  drawAxisDot(ctx, toAxisSpec(spec), atYear, color, alpha, glow);
  if (label) {
    const p = yearPoint(spec, atYear);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${spec.labelPx}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = rgba(mix(spec.ink, color, 0.4));
    ctx.textAlign = 'center';
    ctx.fillText(label, p.x, p.y - 22);
    ctx.restore();
  }
}

/** A leader line from a screen point (e.g. a map pin, a portrait) to a Year on the axis — connects
 *  ANY on-screen element to "when" without that element itself needing to know pixel math. */
export function drawYearLeader(ctx: CanvasRenderingContext2D, spec: YearAxisSpec, from: Pt, atYear: Year, color: RGB, alpha = 1): void {
  drawAxisLeader(ctx, toAxisSpec(spec), from, atYear, color, alpha);
}
