// components/chapter-card.ts — full-frame chapter/section title card, for explainer/history-profile
// pieces that break content into named sections. Pure function of `t`.
//
// This is a COPY template — paste into your own `src/components/chapter-card.ts`.
//
// Draws an OPAQUE full-frame background wash (so it can sit directly between two scenes as a real
// beat, not a dissolve hiding a hard cut — a chapter card is its own scene, declared as a hard cut
// in your timeline's hand-off table, never a disguise for a missing transition) + a title line with
// a small hand-drawn underline sketch-on, + an optional subtitle line below it.
import { clamp, seg, type Pt } from '../core/math';
import { rgba, mix, type RGB } from '../core/color';
import { sketch, partial } from '../core/draw';

export interface ChapterCardStyle {
  bg: RGB;
  ink: RGB;
  accent: RGB;
  titlePx: number;
  subtitlePx: number;
  cx: number;
  cy: number; // title baseline centre; subtitle drawn below it
  fadeIn: number;
  fadeOut: number;
}

// Generic, brand-agnostic defaults — pass a Partial<ChapterCardStyle> built from your own theme.ts
// palette rather than editing these.
export const DEFAULT_CHAPTER_CARD_STYLE: ChapterCardStyle = {
  bg: [242, 232, 207],
  ink: [42, 31, 26],
  accent: [236, 122, 60],
  titlePx: 96,
  subtitlePx: 34,
  cx: 960,
  cy: 520,
  fadeIn: 0.4,
  fadeOut: 0.4,
};

/** Whole-card visibility 0..1 at `t`, given the card's own [t_in, t_out) window. Pure. */
export function chapterCardAlpha(t: number, tIn: number, tOut: number, fadeIn: number, fadeOut: number): number {
  if (t < tIn || t >= tOut) return 0;
  return clamp(seg(t, tIn, tIn + fadeIn) * (1 - seg(t, tOut - fadeOut, tOut)));
}

/** Draws the card AS ITS OWN OPAQUE SCENE for `t` in [tIn, tOut) — fills the whole frame, so a
 *  caller using this as a transitional beat between two content scenes gets a real cut (declare it
 *  as one in the timeline's hand-off table), not a disguised morph. */
export function drawChapterCard(
  ctx: CanvasRenderingContext2D,
  t: number,
  tIn: number,
  tOut: number,
  title: string,
  subtitle: string | undefined,
  W: number,
  H: number,
  style: Partial<ChapterCardStyle> = {},
): void {
  const s: ChapterCardStyle = { ...DEFAULT_CHAPTER_CARD_STYLE, ...style };
  const a = chapterCardAlpha(t, tIn, tOut, s.fadeIn, s.fadeOut);
  if (a <= 0) return;

  ctx.save();
  ctx.globalAlpha = 1; // background wash is always fully opaque while the card is "on" — only the
  // CONTENT (title/subtitle/underline) fades with `a`, so the card reads as a solid beat, not a
  // translucent overlay over whatever scene preceded it.
  ctx.fillStyle = rgba(s.bg);
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${s.titlePx}px "PingFang TC", "Heiti TC", serif`;
  ctx.fillStyle = rgba(s.ink);
  ctx.fillText(title, s.cx, s.cy);

  const titleW = ctx.measureText(title).width;
  const draw = clamp((t - tIn - s.fadeIn * 0.3) / 0.6);
  if (draw > 0) {
    const y0 = s.cy + s.titlePx * 0.22;
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i++) pts.push({ x: s.cx - titleW / 2 - 8 + ((titleW + 16) * i) / 24, y: y0 });
    sketch(ctx, partial(pts, draw), { amp: 2.2, seed: 5, width: 4, color: s.accent, alpha: a, ghost: 0.3 });
  }

  if (subtitle) {
    ctx.font = `400 ${s.subtitlePx}px "PingFang TC", "Heiti TC", sans-serif`;
    ctx.fillStyle = rgba(mix(s.ink, s.bg, 0.25));
    ctx.fillText(subtitle, s.cx, s.cy + s.titlePx * 0.22 + s.subtitlePx * 1.6);
  }
  ctx.restore();
}
