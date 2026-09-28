// components/entity-card.ts — economics-profile company/event card: name, year, one-line
// description, source id. Pure function of `t`. Pairs with gates/chart-provenance.mjs's
// `entity-card` component kind — an entity card's factual claims (name/year/description) should
// themselves resolve to a src/data/*.json dataset entry, same discipline as any chart.
//
// This is a COPY template — paste into your own `src/components/entity-card.ts`.
import { clamp, seg, type Pt } from '../core/math';
import { rgba, mix, type RGB } from '../core/color';
import { sketch, rrectPts } from '../core/draw';

export interface EntityCardData {
  name: string;
  year?: string; // display string, e.g. "1998" or "1998-2001" — a label, not a computed value
  description: string;
  sourceId?: string; // small corner tag, e.g. "src: bread-price-index" — cross-checked by chart-provenance.mjs
}

export interface EntityCardStyle {
  x: number;
  y: number;
  w: number;
  h: number;
  bg: RGB;
  ink: RGB;
  accent: RGB;
  namePx: number;
  bodyPx: number;
  fadeIn: number;
}
export const DEFAULT_ENTITY_CARD_STYLE: EntityCardStyle = {
  x: 120,
  y: 700,
  w: 640,
  h: 220,
  bg: [251, 247, 236],
  ink: [42, 31, 26],
  accent: [180, 80, 43],
  namePx: 40,
  bodyPx: 26,
  fadeIn: 0.4,
};

/** `tIn` is the timeline second the card starts fading in (fixed fade duration `style.fadeIn`). */
export function drawEntityCard(ctx: CanvasRenderingContext2D, t: number, tIn: number, data: EntityCardData, style: Partial<EntityCardStyle> = {}): void {
  const s: EntityCardStyle = { ...DEFAULT_ENTITY_CARD_STYLE, ...style };
  const a = clamp(seg(t, tIn, tIn + s.fadeIn));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const pts: Pt[] = rrectPts(s.x, s.y, s.w, s.h, 18, 6);
  ctx.fillStyle = rgba(s.bg);
  ctx.beginPath();
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  sketch(ctx, pts, { closed: true, width: 3, color: s.ink, seed: 9, amp: 1.4 });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${s.namePx}px "PingFang TC", "Heiti TC", sans-serif`;
  ctx.fillStyle = rgba(s.ink);
  ctx.fillText(data.name, s.x + 32, s.y + 56);

  if (data.year) {
    ctx.font = `600 ${s.bodyPx}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = rgba(s.accent);
    ctx.textAlign = 'right';
    ctx.fillText(data.year, s.x + s.w - 32, s.y + 56);
    ctx.textAlign = 'left';
  }

  ctx.font = `400 ${s.bodyPx}px "PingFang TC", "Heiti TC", sans-serif`;
  ctx.fillStyle = rgba(mix(s.ink, s.bg, 0.2));
  wrapText(ctx, data.description, s.x + 32, s.y + 100, s.w - 64, s.bodyPx * 1.4);

  if (data.sourceId) {
    ctx.font = `400 18px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = rgba(mix(s.ink, s.bg, 0.5));
    ctx.textAlign = 'right';
    ctx.fillText(`src: ${data.sourceId}`, s.x + s.w - 24, s.y + s.h - 18);
  }
  ctx.restore();
}

/** Greedy character-wrap (safe for CJK, which has no inter-word spaces to break on). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
  let line = '';
  let cy = y;
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = ch;
      cy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}
