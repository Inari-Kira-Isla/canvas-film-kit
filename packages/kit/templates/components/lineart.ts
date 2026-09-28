// lineart.ts — shared hand-drawn LINE-ART vocabulary: coastlines, waves, a traditional wave-band
// pattern, a curling crest, cross-hatch fill, a pointer arrow, and a simple cosmos "orbit rings"
// motif. Distilled from a real project's music-video line-art module (2026-09-28) — every drawer
// below is a PURE function of its inputs (no module-level mutable state, no Math.random — only the
// seeded `hash`/`noise1` helpers from ../core/random), so every caller stays deterministic for free.
//
// This is a COPY template (design doc §2.4 "腳本做依賴、元件做 copy") — paste this file into your
// own `src/components/lineart.ts` and edit freely. It intentionally does NOT import ../theme
// directly: callers pass colour/width in (via ctx.strokeStyle/lineWidth, already set by the
// caller) so this file has zero opinions about your palette — the only hex allowed anywhere in a
// real project is inside src/theme.ts (see that file's own comment + the grep gate).
//
// Deleted from the source this was distilled from (brand/ingredient-specific, do not re-add here):
// scallop/ark-shell/sea-invertebrate shellfish drawers, a Japanese-ingredient kinetic-type stamp, and any
// eye/fish/food/logo/mark shape. What's left is generic line-art technique, not a specific subject.
// Import paths below assume this file lives at `src/components/lineart.ts` in a scaffolded
// project (sibling to `src/core/`, `src/scenes/`) — the normal copy destination. Fix the paths if
// you copy it somewhere else.
import { TAU, clamp, lerp, type Pt } from '../core/math';
import { hash } from '../core/random';

/** Draws the first fraction `p` of a point list into the CURRENT path (caller does beginPath/stroke).
 *  This is the lower-level "plotter reveal" primitive `coastline`/`drawSwell`/`drawCrest` build on;
 *  see core/draw.ts's `partial()` for the point-array equivalent when you already have a full path
 *  and just want to trim it (that one resamples first — this one does not, so it is cheaper inside
 *  a per-frame loop that already has evenly-spaced points, e.g. a coastline). */
export function polyP(ctx: CanvasRenderingContext2D, pts: Pt[], p = 1): void {
  if (p <= 0 || pts.length < 2) return;
  const n = (pts.length - 1) * clamp(p);
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= Math.floor(n); i++) ctx.lineTo(pts[i].x, pts[i].y);
  const f = n - Math.floor(n);
  const i = Math.floor(n);
  if (f > 0 && i + 1 < pts.length) ctx.lineTo(lerp(pts[i].x, pts[i + 1].x, f), lerp(pts[i].y, pts[i + 1].y, f));
}

/** Deterministic fractal coastline across [x0,x1] around baseline y — a handful of summed sine
 *  octaves, phased by `seed` so different seeds read as different coastlines, not the same curve
 *  moved sideways. */
export function coastline(x0: number, x1: number, y: number, amp: number, seed = 1, n = 160): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let d = 0;
    let a = 1;
    let f = 3;
    for (let o = 0; o < 5; o++) {
      d += a * Math.sin(u * f * TAU + hash(seed * 31 + o) * TAU);
      a *= 0.5;
      f *= 2.1;
    }
    pts.push({ x: lerp(x0, x1, u), y: y + d * amp });
  }
  return pts;
}

/** Travelling sine-wave lines (sea swell / any periodic band signal) — `k` lines stacked downward
 *  from `y`, each damped a little more than the one above it so the stack reads as depth. */
export function drawSwell(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, k: number, gap: number, amp: number, t: number, steps = 80): void {
  ctx.beginPath();
  for (let j = 0; j < k; j++) {
    for (let i = 0; i <= steps; i++) {
      const px = lerp(x0, x1, i / steps);
      const ph = (i / steps) * TAU * 3 - t * 2.2 + j * 0.7;
      const py = y + j * gap + Math.sin(ph) * amp * (1 - j / (k + 2)) + Math.sin(ph * 2.3) * amp * 0.25;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
  }
  ctx.stroke();
}

/** Hokusai-style repeating wave-band arcs (青海波 seigaiha — a public-domain traditional pattern,
 *  not a brand mark) filling the rect [x,y,w,h]; `t` scrolls the phase so it reads as flowing
 *  water rather than a static tile. */
export function drawSeigaiha(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, t = 0): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.beginPath();
  const off = (t * r * 0.8) % (r * 2);
  for (let row = 0, yy = y + h + r; yy > y - r; row++, yy -= r * 0.5) {
    for (let xx = x - r * 2 + (row % 2 ? r : 0) - off; xx < x + w + r * 2; xx += r * 2) {
      for (const f of [1, 0.72, 0.44]) {
        ctx.moveTo(xx + r * f, yy);
        ctx.arc(xx, yy, r * f, Math.PI, TAU);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Curling wave crest with claw-like foam fingers along the last half of the reveal — `p` is the
 *  reveal fraction (0..1), same idiom as `polyP`. */
export function drawCrest(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, p = 1): void {
  const pts: Pt[] = [];
  for (let i = 0; i <= 90; i++) {
    const u = i / 90;
    const a = u * Math.PI * 1.55;
    const rr = s * (1 - 0.55 * u);
    pts.push({ x: x + Math.cos(Math.PI + a) * rr + u * s * 0.9, y: y + Math.sin(Math.PI + a) * rr * 0.9 });
  }
  ctx.beginPath();
  polyP(ctx, pts, p);
  const n = Math.floor(9 * clamp((p - 0.5) / 0.5));
  for (let k = 0; k < n; k++) {
    const pt = pts[Math.min(89, 50 + k * 4)];
    ctx.moveTo(pt.x, pt.y);
    ctx.quadraticCurveTo(pt.x + s * 0.06, pt.y + s * 0.08, pt.x + s * 0.02, pt.y + s * 0.14);
  }
  ctx.stroke();
}

/** Cross-hatch fill inside a rect — a generic "shaded area" line-art fill (no gradient, stays
 *  in-family with the rest of the hand-drawn look). `density` = line spacing in px. */
export function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, density = 10, angle = Math.PI / 4): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const diag = Math.hypot(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  for (let d = -diag; d <= diag; d += density) {
    const dx = Math.cos(angle) * diag;
    const dy = Math.sin(angle) * diag;
    const nx = -Math.sin(angle) * d;
    const ny = Math.cos(angle) * d;
    ctx.moveTo(cx + nx - dx, cy + ny - dy);
    ctx.lineTo(cx + nx + dx, cy + ny + dy);
  }
  ctx.stroke();
  ctx.restore();
}

/** A simple pointer/callout arrow from (x0,y0) to (x1,y1) with a two-stroke arrowhead. */
export function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, headLen = 14, headAngle = 0.45): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - headAngle) * headLen, y1 - Math.sin(a - headAngle) * headLen);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a + headAngle) * headLen, y1 - Math.sin(a + headAngle) * headLen);
  ctx.stroke();
}

/** Generic cosmos "orbit rings" motif — concentric tilted ellipses + a scatter of orbiting sparks
 *  around a dark disc. A demonstrative abstract shape (not any specific object), `t` rotates the
 *  sparks so it reads as motion. Caller sets ctx.fillStyle for the disc and passes two ring colours
 *  in (this file has no palette opinions — see the file header). */
export function drawOrbitRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  ringColorA: string,
  ringColorB: string,
  sparkColor: string,
  rings = 10,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  for (let k = 0; k < rings; k++) {
    const rr = r * (1.3 + k * 0.16);
    const tilt = 0.22;
    ctx.strokeStyle = k % 3 === 0 ? ringColorA : ringColorB;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * tilt, 0, 0, TAU);
    ctx.stroke();
  }
  const n = 40;
  for (let i = 0; i < n; i++) {
    const rr = r * (1.4 + 1.6 * hash(i * 3));
    const ang = hash(i) * TAU + t * (2.4 / (rr / r));
    ctx.fillStyle = sparkColor;
    ctx.fillRect(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.22, 2, 2);
  }
  ctx.restore();
}
