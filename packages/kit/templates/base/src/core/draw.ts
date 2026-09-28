import { TAU, clamp, dist, type Pt } from './math';
import { noise1 } from './random';
import { rgba, type RGB } from './color.template';

/** Line "boil": hand-drawn animation redraws the outline a few times a second. */
export const boil = (t: number, fps = 8): number => Math.floor(t * fps);

/** Displace a polyline with smooth noise along its arc length — the imperfect, hand-inked edge. */
export function wobble(pts: Pt[], amp: number, seed: number, freq = 0.02, closed = false): Pt[] {
  if (amp <= 0 || pts.length < 2) return pts;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + dist(pts[i - 1], pts[i]));
  const L = lens[lens.length - 1] + (closed ? dist(pts[pts.length - 1], pts[0]) : 0);
  return pts.map((p, i) => {
    const u = lens[i];
    let nx = noise1(u * freq, seed);
    let ny = noise1(u * freq, seed + 31);
    if (closed && L > 0) {
      // Blend with the noise one loop earlier so the seam closes without a kink.
      const w = u / L;
      nx = nx * (1 - w) + noise1((u - L) * freq, seed) * w;
      ny = ny * (1 - w) + noise1((u - L) * freq, seed + 31) * w;
    }
    return { x: p.x + nx * amp, y: p.y + ny * amp };
  });
}

export function trace(ctx: CanvasRenderingContext2D, pts: Pt[], closed = false): void {
  if (!pts.length) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
}

/** Quadratic smoothing through midpoints: softer curves from coarse point lists. */
export function smoothTrace(ctx: CanvasRenderingContext2D, pts: Pt[], closed = false): void {
  const n = pts.length;
  if (n < 3) return trace(ctx, pts, closed);
  if (closed) {
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m0.x, m0.y);
    for (let i = 0; i < n; i++) {
      const m = mid(pts[i], pts[(i + 1) % n]);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
  }
}
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function circlePts(cx: number, cy: number, r: number, n = 64): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

export function rrectPts(x: number, y: number, w: number, h: number, r: number, n = 8): Pt[] {
  const out: Pt[] = [];
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  }
  return out;
}

/** Resample a polyline to roughly evenly spaced points (so wobble noise is even). */
export function resample(pts: Pt[], step: number, closed = false): Pt[] {
  const src = closed ? [...pts, pts[0]] : pts;
  const out: Pt[] = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const d = dist(a, b);
    let pos = step - carry;
    while (pos <= d) {
      const t = pos / d;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      pos += step;
    }
    carry = d - (pos - step);
  }
  if (closed) out.pop();
  return out;
}

/** The first `frac` of a polyline by arc length — used to "draw on" outlines. */
export function partial(pts: Pt[], frac: number): Pt[] {
  frac = clamp(frac);
  if (frac >= 1) return pts;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  let left = total * frac;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (d >= left) {
      const t = d ? left / d : 0;
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t });
      return out;
    }
    left -= d;
    out.push(pts[i]);
  }
  return out;
}

/** Stroke with hand-drawn wobble; optional faint second pass reads like a re-traced pencil line. */
export function sketch(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  o: { closed?: boolean; amp?: number; seed?: number; width: number; color: RGB; alpha?: number; ghost?: number; freq?: number },
): void {
  const closed = o.closed ?? false;
  const amp = o.amp ?? 2;
  const seed = o.seed ?? 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = o.width;
  ctx.strokeStyle = rgba(o.color, o.alpha ?? 1);
  ctx.beginPath();
  smoothTrace(ctx, wobble(pts, amp, seed, o.freq ?? 0.02, closed), closed);
  ctx.stroke();
  if (o.ghost) {
    ctx.lineWidth = o.width * 0.45;
    ctx.strokeStyle = rgba(o.color, (o.alpha ?? 1) * o.ghost);
    ctx.beginPath();
    smoothTrace(ctx, wobble(pts, amp * 1.8, seed + 97, o.freq ?? 0.02, closed), closed);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- glow sprites

const spriteCache = new Map<string, HTMLCanvasElement>();

/** Soft radial dot pre-rendered once per colour; drawImage of these is far cheaper than gradients per particle. */
export function glowSprite(c: RGB, hardness = 0.25): HTMLCanvasElement {
  const q = (v: number) => Math.round(v / 8) * 8;
  const key = `${q(c[0])},${q(c[1])},${q(c[2])},${hardness}`;
  let s = spriteCache.get(key);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const cc: RGB = [q(c[0]), q(c[1]), q(c[2])];
  grd.addColorStop(0, rgba(cc, 1));
  grd.addColorStop(hardness, rgba(cc, 0.45));
  grd.addColorStop(1, rgba(cc, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  spriteCache.set(key, s);
  return s;
}

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a = 1, hardness = 0.25): void {
  if (a <= 0.003 || r <= 0.2) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * clamp(a);
  ctx.drawImage(glowSprite(c, hardness), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

/** Four-point twinkle — a recurring "spark" motif. */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, c: RGB, a = 1): void {
  if (a <= 0.003 || r <= 0.2) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = rgba(c, a);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * TAU;
    const ang2 = ang + TAU / 8;
    ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    ctx.lineTo(Math.cos(ang2) * r * 0.22, Math.sin(ang2) * r * 0.22);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Irregular filled disc: an ink-bloom / paper-bloom radial transition shape. */
export function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, rough = 0.05, n = 96): void {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + rough * (noise1(Math.cos(a) * 2.2 + 10, seed) + 0.6 * noise1(Math.sin(a) * 5 + 20, seed + 3));
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
