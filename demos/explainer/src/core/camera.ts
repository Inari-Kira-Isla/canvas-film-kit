import { CX, CY, type Pt } from './math';

/** A 2D camera: world point (x, y) lands at the screen anchor, scaled by s and rolled by rot.
 *  CAMERA CONTRACT (story-metrics v3): every camera goes through applyCam() — story-metrics wraps it
 *  and credits the scene only if the Cam values change over time — or is listed in
 *  ./camera-registry.ts. Raw ctx.scale/setTransform "cameras" are not credited (WARN only). */
export interface Cam {
  x: number;
  y: number;
  s: number;
  rot?: number;
  ax?: number;
  ay?: number;
}

export function applyCam(ctx: CanvasRenderingContext2D, c: Cam): void {
  ctx.translate(c.ax ?? CX, c.ay ?? CY);
  if (c.rot) ctx.rotate(c.rot);
  ctx.scale(c.s, c.s);
  ctx.translate(-c.x, -c.y);
}

export function toScreen(c: Cam, p: Pt): Pt {
  const dx = (p.x - c.x) * c.s;
  const dy = (p.y - c.y) * c.s;
  const r = c.rot ?? 0;
  const cs = Math.cos(r), sn = Math.sin(r);
  return { x: (c.ax ?? CX) + dx * cs - dy * sn, y: (c.ay ?? CY) + dx * sn + dy * cs };
}
