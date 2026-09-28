// components/silhouette.ts — history-profile PORTRAIT painter that can only ever produce a solid,
// flat silhouette — never a face. This is a deliberate CAPABILITY limit, not an oversight: design
// doc §3.1 "history": real people are shown as silhouettes or public-domain images only, never an
// AI-generated likeness. A component with no eyes/nose/mouth detail channel and no image-compositing
// call cannot accidentally render a generated face even if a caller wanted it to — the constraint is
// enforced by what this file is physically capable of drawing, not by a rule someone has to remember
// to follow. Pairs with `src/content/portrait_manifest.json` + gates/portrait-manifest.mjs, which
// separately requires every portrait's data source to declare `ai_generated: false`.
//
// This is a COPY template — paste into your own `src/components/silhouette.ts`.
import type { Pt } from '../core/math';
import { rgba, type RGB } from '../core/color';
import { sketch, smoothTrace } from '../core/draw';

export interface SilhouetteStyle {
  ink: RGB;
  labelInk: RGB;
  labelPx: number;
  wobbleAmp: number;
  seed: number;
}

export const DEFAULT_SILHOUETTE_STYLE: SilhouetteStyle = {
  ink: [42, 31, 26],
  labelInk: [110, 96, 84],
  labelPx: 26,
  wobbleAmp: 1.4,
  seed: 13,
};

/** `outline` is a closed polygon in screen space — trace it BY HAND from a public-domain
 *  engraving/portrait's silhouette (or draw one from scratch), never generated. The fill fades in
 *  via `alpha` over the first third of `reveal` (a silhouette reads as one flat shape, not a line
 *  that gets traced then filled); the outline stroke itself is always drawn at full `reveal`. */
export function drawSilhouette(ctx: CanvasRenderingContext2D, outline: readonly Pt[], reveal: number, alpha = 1, style: Partial<SilhouetteStyle> = {}, name?: string, labelAt?: Pt): void {
  const s: SilhouetteStyle = { ...DEFAULT_SILHOUETTE_STYLE, ...style };
  if (alpha <= 0 || outline.length < 3) return;
  const r = Math.max(0, Math.min(1, reveal));
  ctx.save();
  ctx.globalAlpha = alpha * Math.min(1, r * 3);
  ctx.fillStyle = rgba(s.ink);
  ctx.beginPath();
  smoothTrace(ctx, outline as Pt[], true);
  ctx.fill();

  ctx.globalAlpha = alpha;
  sketch(ctx, outline as Pt[], { closed: true, width: 2.5, color: s.ink, seed: s.seed, amp: s.wobbleAmp });

  if (name && labelAt && r >= 0.98) {
    ctx.font = `500 ${s.labelPx}px "PingFang TC", "Heiti TC", sans-serif`;
    ctx.fillStyle = rgba(s.labelInk);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, labelAt.x, labelAt.y);
  }
  ctx.restore();
}

/** A simple, generic humanoid bust outline — a STAND-IN silhouette shape for use during
 *  preproduction, before a real portrait has been traced. NOT meant to depict any specific real
 *  person — swap for a hand-traced outline before shipping a project's real
 *  `portrait_manifest.json` entry. */
export function genericBustOutline(cx: number, cy: number, scale = 1): Pt[] {
  const pts: Pt[] = [];
  const head = 60 * scale;
  const shoulders = 130 * scale;
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    pts.push({ x: cx + Math.cos(a) * head, y: cy - 90 * scale + Math.sin(a) * head });
  }
  pts.push({ x: cx + shoulders, y: cy + 40 * scale });
  pts.push({ x: cx + shoulders * 0.7, y: cy + 160 * scale });
  pts.push({ x: cx - shoulders * 0.7, y: cy + 160 * scale });
  pts.push({ x: cx - shoulders, y: cy + 40 * scale });
  return pts;
}
