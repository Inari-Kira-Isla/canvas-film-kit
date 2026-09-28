// components/source-footer.ts — economics-profile (also reusable by history) "data has an origin"
// footer bar. This is the ONE component gates/chart-provenance.mjs looks for by name
// (`drawSourceFooter(`) to prove a fictional dataset is disclosed on screen — design doc §3.1:
// "fictional:true → 畫面必須渲出「示意數據」標籤". The "示意數據" (illustrative/simulated data)
// label is NOT a caller-supplied string — it is HARD-CODED here and appears automatically whenever
// `fictional` is truthy, so a scene cannot ship a fictional chart with the wrong label text, a typo,
// or a forgotten flag. The only lever a caller has is whether to pass `fictional` at all, which is
// exactly what chart-provenance.mjs's own call-site text scan requires to see literally present.
//
// This is a COPY template — paste into your own `src/components/source-footer.ts`.
import { rgba, type RGB } from '../core/color';

export interface SourceFooterData {
  source: string; // e.g. "canvas-film-kit fixture dataset" or a real citation
  fictional?: boolean; // true -> renders the mandatory "示意數據" badge, see header
  retrieved?: string; // e.g. "2026-09-01" — optional, shown in parentheses when present
}

export interface SourceFooterStyle {
  x: number;
  y: number;
  px: number;
  ink: RGB;
  warn: RGB;
}
export const DEFAULT_SOURCE_FOOTER_STYLE: SourceFooterStyle = {
  x: 60,
  y: 1040,
  px: 22,
  ink: [110, 96, 84],
  warn: [180, 80, 43],
};

export function drawSourceFooter(ctx: CanvasRenderingContext2D, data: SourceFooterData, alpha = 1, style: Partial<SourceFooterStyle> = {}): void {
  const s: SourceFooterStyle = { ...DEFAULT_SOURCE_FOOTER_STYLE, ...style };
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${s.px}px "Helvetica Neue", "PingFang TC", sans-serif`;
  ctx.fillStyle = rgba(s.ink);
  const retrievedPart = data.retrieved ? ` (${data.retrieved})` : '';
  const sourceText = `${data.fictional ? '' : '來源：'}${data.source}${retrievedPart}`;
  ctx.fillText(sourceText, s.x, s.y);
  let x = s.x + ctx.measureText(sourceText).width + 20;

  if (data.fictional) {
    const badge = '示意數據';
    ctx.font = `700 ${s.px}px "PingFang TC", "Heiti TC", sans-serif`;
    const bw = ctx.measureText(badge).width + 24;
    ctx.fillStyle = rgba(s.warn, 0.15);
    ctx.fillRect(x, s.y - s.px, bw, s.px * 1.4);
    ctx.fillStyle = rgba(s.warn);
    ctx.fillText(badge, x + 12, s.y);
    x += bw;
  }
  ctx.restore();
}
