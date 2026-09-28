// 鐵律: the whole film draws from ONE palette object (`P`). Scene files must never
// write a raw hex/rgb string — that's how a README's "one palette" claim stays true
// (grep gate: `#[0-9A-Fa-f]{6}` in src/scenes must be 0 before you claim it — `kit gate` checks this).
export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const rgba = (c: RGB, a = 1): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** Piecewise-linear colour ramp; stops must be sorted by position. */
export function ramp(stops: ReadonlyArray<readonly [number, RGB]>, x: number): RGB {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (x <= p1) {
      const [p0, c0] = stops[i - 1];
      return mix(c0, c1, p1 === p0 ? 1 : (x - p0) / (p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
}

export const luminance = (c: RGB): number => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;

/**
 * Matches src/theme.ts's `paper-day` preset (this project's chosen THEME) so P and THEME.palette
 * never drift apart. Add every colour the film uses here, named by role (bg / ink / accent…), not
 * by scene. If you catch yourself writing `hex('#...')` inside src/scenes/*.ts, that value belongs
 * here instead.
 */
export const P = {
  bg: hex('#F4EEDF'), // base background tone (paper)
  ink: hex('#2B2118'), // line / silhouette colour
  accent: hex('#B4502B'), // recurring motif accent (pointer, current step-badge)
  signal: hex('#2E7D6B'), // "something is happening now" (caption underline)
  muted: hex('#8A7F6C'), // de-emphasised text / done step-badge
};
