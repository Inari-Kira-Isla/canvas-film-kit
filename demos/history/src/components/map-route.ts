// components/map-route.ts — history-profile SCHEMATIC route diagram: named places connected by a
// hand-drawn line that "draws on" segment by segment, revealing left-to-right along the narration.
// This is NOT a real map — no coastlines, no accurate projection, no lat/long. It exists because a
// history film needs SOME way to show "place A -> place B -> place C" without claiming geographic
// accuracy this kit has zero source data for (design doc §3.1: "只做示意路線，畫面強制標「示意」，
// 唔帶真地理資料"). Zero prior art in this kit to copy from — this file's design is new for K4:
//   - "projection": none. Places sit at an ABSTRACT layout position the caller picks by hand (e.g.
//     roughly matching relative compass directions on screen), never computed from real lat/long —
//     there is no real map underneath to project FROM.
//   - the route is drawn segment-by-segment via `partial()` (core/draw.ts), the SAME "draw-on"
//     technique every other line-art component in this kit already uses.
//   - each place's name label fades in only once the route's reveal actually reaches it.
//   - the "示意" (schematic / not-to-scale) badge is NOT optional — `drawMapRoute` always paints it
//     whenever alpha > 0. A caller cannot forget it or configure it away; the only way to ship this
//     component without the badge is to not call this function at all.
//
// This is a COPY template — paste into your own `src/components/map-route.ts`.
import { dist, type Pt } from '../core/math';
import { rgba, mix, type RGB } from '../core/color';
import { sketch, partial, circlePts } from '../core/draw';

export interface MapPlace {
  id: string;
  label: string; // on-screen place name, e.g. "Mainz"
  at: Pt; // ABSTRACT layout position — not a real coordinate, see this file's header
}

export interface MapRouteStyle {
  ink: RGB;
  accent: RGB;
  dotR: number;
  labelPx: number;
  badgeText: string; // FILL IN in the caller's own language if not Chinese — default is 中文 "示意"
  badgeCorner: 'tl' | 'tr' | 'bl' | 'br';
  frameW: number;
  frameH: number;
}

export const DEFAULT_MAP_ROUTE_STYLE: MapRouteStyle = {
  ink: [42, 31, 26],
  accent: [180, 80, 43],
  dotR: 9,
  labelPx: 24,
  badgeText: '示意 · not to scale',
  badgeCorner: 'br',
  frameW: 1920,
  frameH: 1080,
};

/** How far along the WHOLE route (0..1) each place sits, by cumulative segment length — used to
 *  derive each place's own local reveal fraction from one overall `reveal` value. Pure. */
export function routeProgress(places: readonly MapPlace[]): number[] {
  const lens = [0];
  for (let i = 1; i < places.length; i++) lens.push(lens[i - 1] + dist(places[i - 1].at, places[i].at));
  const total = lens[lens.length - 1] || 1;
  return lens.map((l) => l / total);
}

/** Draws the route up to `reveal` (0..1 of total path length), place dots + labels as each is
 *  reached, and the mandatory schematic badge. Pure function of `reveal`/`alpha` — no mutable state. */
export function drawMapRoute(ctx: CanvasRenderingContext2D, places: readonly MapPlace[], reveal: number, alpha = 1, style: Partial<MapRouteStyle> = {}): void {
  const s: MapRouteStyle = { ...DEFAULT_MAP_ROUTE_STYLE, ...style };
  if (alpha <= 0 || places.length < 1) return;
  const progress = routeProgress(places);
  const r = Math.max(0, Math.min(1, reveal));

  ctx.save();
  ctx.globalAlpha = alpha;

  if (places.length >= 2) {
    const fullPts = places.map((p) => p.at);
    sketch(ctx, partial(fullPts, r), { width: 4, color: s.accent, seed: 3, amp: 1.6, ghost: 0.25 });
  }

  places.forEach((place, i) => {
    if (r < progress[i] - 1e-6) return;
    const localAlpha = Math.min(1, (r - progress[i] + 0.03) / 0.03);
    ctx.globalAlpha = alpha * Math.max(0, localAlpha);
    const pts = circlePts(place.at.x, place.at.y, s.dotR, 28);
    ctx.fillStyle = rgba(mix(s.accent, s.ink, i === 0 ? 0 : 0.15));
    ctx.beginPath();
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    sketch(ctx, pts, { closed: true, width: 2.5, color: s.ink, seed: i + 11, amp: 1.2 });

    ctx.font = `600 ${s.labelPx}px "PingFang TC", "Heiti TC", sans-serif`;
    ctx.fillStyle = rgba(s.ink);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(place.label, place.at.x + s.dotR + 10, place.at.y);
  });

  // mandatory schematic badge — always drawn, never optional (see this file's header)
  ctx.globalAlpha = alpha * 0.85;
  ctx.font = `500 20px "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const pad = 28;
  let bx: number, by: number, align: CanvasTextAlign;
  switch (s.badgeCorner) {
    case 'tl': bx = pad; by = pad + 20; align = 'left'; break;
    case 'tr': bx = s.frameW - pad; by = pad + 20; align = 'right'; break;
    case 'bl': bx = pad; by = s.frameH - pad; align = 'left'; break;
    default: bx = s.frameW - pad; by = s.frameH - pad; align = 'right'; break;
  }
  ctx.textAlign = align;
  ctx.fillStyle = rgba(s.ink, 0.8);
  ctx.fillText(s.badgeText, bx, by);
  ctx.restore();
}
