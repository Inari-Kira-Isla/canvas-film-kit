import { W, H } from '../config';

export { W, H };
export const TAU = Math.PI * 2;
export const CX = W / 2;
export const CY = H / 2;

export type Pt = { x: number; y: number };
export type Ease = (t: number) => number;

export const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number): number => clamp((x - a) / (b - a));
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Eased 0→1 progress of t across [a, b]. */
export const seg = (t: number, a: number, b: number, e: Ease = ease.linear): number => e(invLerp(a, b, t));

/** Rises over [a, b], holds, falls over [c, d]. */
export const envelope = (t: number, a: number, b: number, c: number, d: number, e: Ease = ease.inOutSine): number =>
  seg(t, a, b, e) * (1 - seg(t, c, d, e));

/** Position of something that accelerates from rest to speed 1 over `k` seconds (integral of a ramped velocity). */
export const rampIntegral = (tau: number, k = 0.8): number => {
  if (tau <= 0) return 0;
  if (tau < k) return (tau * tau) / (2 * k);
  return tau - k / 2;
};

/** Numerically integrate f over [a, b] (used for stateless angular positions under changing angular speed). */
export function integrate(f: (x: number) => number, a: number, b: number, steps = 48): number {
  if (b <= a) return 0;
  const h = (b - a) / steps;
  let s = 0;
  for (let i = 0; i < steps; i++) s += f(a + (i + 0.5) * h);
  return s * h;
}
