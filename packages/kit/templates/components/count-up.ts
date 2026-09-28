// components/count-up.ts — economics-profile animated numeral, PURE function of `t` (design doc
// §3.1: "確定性...value(t) 純函數，唔准用 rAF 累加"). A requestAnimationFrame accumulator
// (`count += delta` each frame) is the one thing this file exists to forbid: it makes the on-screen
// value depend on how many frames actually ran, which breaks this kit's core determinism promise —
// seek to t=5.0s twice, get two different numbers otherwise. See gates/nondeterminism-check.mjs's
// own broader rule against per-frame mutable state. Every function below takes `t` and returns a
// value; calling it twice with the same `t` always returns the same result — that equality is
// exactly what K4's acceptance test (`countUpValue` called twice at the same `t`) checks.
//
// This is a COPY template — paste into your own `src/components/count-up.ts`.
import { clamp, ease, type Ease } from '../core/math';
import { rgba, type RGB } from '../core/color';

export interface CountUpSpec {
  from: number;
  to: number;
  start: number; // timeline seconds the count-up begins
  end: number; // timeline seconds it reaches `to` and holds
  ease?: Ease;
  decimals?: number;
  locale?: string; // FIXED locale — never left `undefined` (which would read the runtime's OS
  // locale and make the exact same `t` render different digit grouping/decimal marks on different
  // machines — the numeric equivalent of the font-fallback problem font-coverage.mjs exists to
  // catch). Pick one per project (e.g. 'en-US') and put it in your own theme/config.
  prefix?: string;
  suffix?: string;
}

/** The numeric value at `t` — pure, no side effects, no accumulation. Same `t` in, same value out,
 *  forever, regardless of how many times or in what order it's called. */
export function countUpValue(spec: CountUpSpec, t: number): number {
  const u = clamp((t - spec.start) / Math.max(1e-6, spec.end - spec.start));
  const e = (spec.ease ?? ease.outCubic)(u);
  return spec.from + (spec.to - spec.from) * e;
}

/** Formatted string at `t`, via a FIXED `Intl.NumberFormat` locale (see `locale` above). */
export function countUpText(spec: CountUpSpec, t: number): string {
  const v = countUpValue(spec, t);
  const nf = new Intl.NumberFormat(spec.locale ?? 'en-US', {
    minimumFractionDigits: spec.decimals ?? 0,
    maximumFractionDigits: spec.decimals ?? 0,
  });
  return `${spec.prefix ?? ''}${nf.format(v)}${spec.suffix ?? ''}`;
}

export interface CountUpStyle {
  px: number;
  ink: RGB;
  font: string; // `{px}` is substituted with `px` at draw time
  align: CanvasTextAlign;
}
export const DEFAULT_COUNT_UP_STYLE: CountUpStyle = {
  px: 96,
  ink: [42, 31, 26],
  font: '700 {px}px "Helvetica Neue", Arial, sans-serif',
  align: 'center',
};

export function drawCountUp(ctx: CanvasRenderingContext2D, spec: CountUpSpec, t: number, x: number, y: number, alpha = 1, style: Partial<CountUpStyle> = {}): void {
  if (alpha <= 0 || t < spec.start - 0.001) return;
  const s: CountUpStyle = { ...DEFAULT_COUNT_UP_STYLE, ...style };
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = s.font.replace('{px}', String(s.px));
  ctx.fillStyle = rgba(s.ink);
  ctx.textAlign = s.align;
  ctx.textBaseline = 'middle';
  ctx.fillText(countUpText(spec, t), x, y);
  ctx.restore();
}
