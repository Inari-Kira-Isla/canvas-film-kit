// components/pointer.ts — hand-drawn arrow pointing at a screen point, for explainer-profile diagram
// annotation. Pure function of `t`. Built on core/draw.ts's `sketch()`/`partial()` line tooling —
// the arrowhead geometry is the only new piece.
//
// This is a COPY template — paste into your own `src/components/pointer.ts`.
//
// Draws a straight line from `from` to `to` with a small hand-drawn wobble, plus a triangular
// arrowhead at `to`. `reveal` (0..1, usually driven by `seg(t, a, b)` from the caller) controls how
// much of the shaft has "drawn on" — the arrowhead only appears once the shaft is fully drawn.
import { dist, type Pt } from '../core/math';
import { rgba, type RGB } from '../core/color';
import { sketch, partial } from '../core/draw';

export interface PointerStyle {
  color: RGB;
  width: number;
  headLen: number; // arrowhead side length, px
  headAngle: number; // radians, half-angle of the arrowhead wedge
  seed: number;
  alpha: number;
}

export const DEFAULT_POINTER_STYLE: PointerStyle = {
  color: [42, 31, 26],
  width: 4,
  headLen: 20,
  headAngle: Math.PI / 8,
  seed: 7,
  alpha: 1,
};

/** `reveal` in [0,1]: fraction of the shaft drawn. Arrowhead fades in only once reveal >= 0.92 so
 *  it never appears "ahead of" an incomplete shaft. Pure — no mutable state, no `t` read directly
 *  (the caller derives `reveal` from `t` via `seg()`, keeping this component reusable for any
 *  timing model). */
export function drawPointer(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, reveal: number, style: Partial<PointerStyle> = {}): void {
  const s: PointerStyle = { ...DEFAULT_POINTER_STYLE, ...style };
  const r = Math.max(0, Math.min(1, reveal));
  if (r <= 0 || dist(from, to) < 1) return;

  const full: Pt[] = [from, to];
  const shaftPts = partial(full, r);

  ctx.save();
  ctx.globalAlpha = s.alpha;
  sketch(ctx, shaftPts, { width: s.width, color: s.color, seed: s.seed, amp: 1.8 });

  const headReveal = Math.max(0, (r - 0.92) / 0.08);
  if (headReveal > 0) {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const a1 = ang + Math.PI - s.headAngle;
    const a2 = ang + Math.PI + s.headAngle;
    const p1: Pt = { x: to.x + Math.cos(a1) * s.headLen, y: to.y + Math.sin(a1) * s.headLen };
    const p2: Pt = { x: to.x + Math.cos(a2) * s.headLen, y: to.y + Math.sin(a2) * s.headLen };
    ctx.globalAlpha = s.alpha * Math.min(1, headReveal);
    ctx.fillStyle = rgba(s.color);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
