// The whole film draws from ONE palette object (`P`) — scene files must never write a raw
// hex/rgb string (grep gate: `#[0-9A-Fa-f]{6}` in src/scenes must be 0). `P` is re-exported from
// `../theme`'s THEME.palette (see that file for the actual colour values / preset choice) so
// there is exactly one hex-literal entry point in the whole project, per the K2 design doc §5.2.
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

// No `P` here on purpose (unlike the upstream base template) — this project's actual palette is
// `THEME.palette` (see ../theme.ts, this project's single hex entry point). Import THEME where a
// palette is needed: `import { THEME } from '../theme'; const P = THEME.palette;`.
