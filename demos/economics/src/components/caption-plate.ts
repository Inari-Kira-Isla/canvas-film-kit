// components/caption-plate.ts — bilingual (zh+en) burned-in caption plate, for explainer/history
// profile narration. Distinct from components/captions.ts (the music profile's per-word LYRIC
// painter, which lights words one at a time) — this one shows a whole line at once on a rounded
// plate, the shape a narrated explainer/history piece needs. Pure function of `t`.
//
// This is a COPY template — paste into your own `src/components/caption-plate.ts`.
//
// Includes two pieces merged into one painter:
//   - CJK punctuation half-em compression (`zhLayout`): PingFang TC centres its punctuation in the
//     em box; re-centring each mark by its own ink in a half-em cell keeps long CJK lines from
//     ballooning the plate width.
//   - Cross-cut DENSITY rules (`validateCaptionBudget`), checked as a pure function a *-check.mjs
//     gate script can call — max chars/line, and a local-peak cap on how many NEW captions may start
//     within an 8-second window (both cross-cut readability limits, not baked silently into the
//     paint function).
//
// No FontFace loading here — ctx.font uses a generic system font STACK so this component renders
// correctly before a project adds its own font-loading step. The 360px-still legibility floor (CJK
// glyph height when a still is scaled to 360px wide) is a project's own responsibility to check
// against whatever zhPx it actually passes in.
import { clamp, seg, ease, type Pt } from '../core/math';
import { mix, rgba, type RGB } from '../core/color';
import { sketch, partial } from '../core/draw';

// ---- cross-cut density rules ----
export const MAX_CHARS_PER_LINE = 12;
export const LOCAL_PEAK_WINDOW_S = 8;
export const LOCAL_PEAK_MAX_COUNT = 1;

export interface CaptionCue {
  id: string;
  zh: string;
  en?: string;
  /** Pre-wrapped zh lines, when the caller already wrapped; otherwise `zh` is treated as one line
   *  for the density check (the paint function itself never wraps — it always draws `zh` as a
   *  single line). */
  lines?: string[];
  t_in: number;
  t_out: number;
  /** true when this cue continues straight from the previous one (no gap) — skip fade-out into it. */
  contiguousWithNext?: boolean;
  /** true when the previous cue flowed straight into this one — skip fade-in. */
  contiguousWithPrev?: boolean;
}

/** Validates the WHOLE cue list against both density rules. Call this from a *-check.mjs script or
 *  at module load in dev — an empty array = no violations. Pure, no canvas/DOM dependency. */
export function validateCaptionBudget(cues: readonly CaptionCue[]): string[] {
  const violations: string[] = [];
  for (const c of cues) {
    const lines = c.lines && c.lines.length > 0 ? c.lines : [c.zh];
    for (const line of lines) {
      if (line.length > MAX_CHARS_PER_LINE) {
        violations.push(`${c.id}: line "${line}" (${line.length} chars) > limit ${MAX_CHARS_PER_LINE}`);
      }
    }
  }
  const sorted = [...cues].map((c) => c.t_in).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    let count = 1;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j] - sorted[i] <= LOCAL_PEAK_WINDOW_S) count++;
      else break;
    }
    if (count > LOCAL_PEAK_MAX_COUNT) {
      violations.push(`${sorted[i].toFixed(1)}s: ${count} new caption(s) start within ${LOCAL_PEAK_WINDOW_S}s > limit ${LOCAL_PEAK_MAX_COUNT}`);
      break;
    }
  }
  return violations;
}

const FADE = 0.22;
/** 0..1 visibility of a cue at `t` — fades in/out over FADE seconds unless a contiguous neighbour
 *  says to skip that edge. Outside [t_in, t_out) this is always 0. */
export function captionAlpha(t: number, c: Pick<CaptionCue, 't_in' | 't_out' | 'contiguousWithNext' | 'contiguousWithPrev'>): number {
  if (t < c.t_in || t >= c.t_out) return 0;
  const fadeIn = c.contiguousWithPrev ? 1 : seg(t, c.t_in, c.t_in + FADE);
  const fadeOut = c.contiguousWithNext ? 1 : 1 - seg(t, c.t_out - FADE, c.t_out);
  return clamp(fadeIn * fadeOut);
}
/** Small upward settle-in offset (px) for a cue's entrance. */
export function captionRiseOffset(t: number, tIn: number, riseDist = 18, dur = 0.3): number {
  return (1 - seg(t, tIn, tIn + dur, ease.outCubic)) * riseDist;
}

// ---- CJK punctuation half-em compression ----
const PUNCT = '，。、；：？！「」『』（）';
function zhLayout(ctx: CanvasRenderingContext2D, s: string, em: number): { w: number; xs: number[]; chars: string[] } {
  const chars = [...s];
  const xs: number[] = [];
  let x = 0;
  chars.forEach((ch, i) => {
    if (PUNCT.includes(ch)) {
      const m = ctx.measureText(ch);
      const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const cell = i === chars.length - 1 ? inkW + 4 : Math.max(em * 0.5, inkW + 8);
      xs.push(x + cell / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2);
      x += cell;
    } else {
      xs.push(x);
      x += ctx.measureText(ch).width;
    }
  });
  return { w: x, xs, chars };
}

export interface CaptionStyle {
  zhPx: number; // default 68 — check your own 360px-still legibility floor against whatever value
  // you actually pass here; there is no built-in enforcement in this component.
  enPx: number; // default 42
  cx: number; // plate horizontal centre, screen px
  bottom: number; // plate BOTTOM edge, screen px
  ink: RGB; // zh text colour
  inkEn: RGB; // en text colour
  plate: RGB;
  plateAlpha: number;
  /** omit to disable the hand-drawn reveal underline under the zh line */
  underline?: RGB;
}

// Generic, brand-agnostic UI default (off-white ink on a translucent near-black plate — chosen for
// legibility against ANY background, not a brand colour), deliberately NOT sourced from theme.ts's
// palette — a caption default has to work before a project's own palette is even finalised. A
// project wanting brand-tinted captions passes its own CaptionStyle instead of editing this default.
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  zhPx: 68,
  enPx: 42,
  cx: 960,
  bottom: 1044,
  ink: [250, 246, 238],
  inkEn: [236, 230, 218],
  plate: [20, 20, 20],
  plateAlpha: 0.55,
  underline: undefined,
};

function fontStr(weight: string, px: number, kind: 'zh' | 'en'): string {
  return kind === 'zh'
    ? `${weight} ${px}px "PingFang TC", "Heiti TC", "Microsoft YaHei", sans-serif`
    : `${weight} ${px}px "Helvetica Neue", Arial, sans-serif`;
}

/** Draws AT MOST one active cue's plate (never two — `cues.find` picks the first t_in≤t<t_out
 *  match; callers must keep cues non-overlapping). Pure function of `t` — no mutable module state,
 *  no side effects besides drawing to `ctx`. */
export function drawCaptionPlate(
  ctx: CanvasRenderingContext2D,
  t: number,
  cues: readonly CaptionCue[],
  style: Partial<CaptionStyle> = {},
): void {
  const s: CaptionStyle = { ...DEFAULT_CAPTION_STYLE, ...style };
  const cue = cues.find((c) => t >= c.t_in && t < c.t_out);
  if (!cue) return;
  const a = captionAlpha(t, cue);
  if (a <= 0) return;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = fontStr('500', s.zhPx, 'zh');
  const zl = zhLayout(ctx, cue.zh, s.zhPx);
  const zw = zl.w;
  let ew = 0;
  if (cue.en) {
    ctx.font = fontStr('400', s.enPx, 'en');
    ew = ctx.measureText(cue.en).width;
  }
  const PAD_X = 40, PAD_Y = 20, LH = 1.25;
  const w = Math.max(zw, ew) + PAD_X * 2;
  const h = PAD_Y * 2 + s.zhPx * LH + (cue.en ? s.enPx * LH : 0);
  const x = s.cx - w / 2, y = s.bottom - h;

  ctx.fillStyle = rgba(s.plate, s.plateAlpha);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(s.ink);
  ctx.font = fontStr('500', s.zhPx, 'zh');
  const zy = y + PAD_Y + (s.zhPx * LH) / 2;
  zl.chars.forEach((ch, k) => ctx.fillText(ch, s.cx - zw / 2 + zl.xs[k], zy));

  if (s.underline) {
    const draw = clamp((t - cue.t_in) / 0.6);
    if (draw > 0) {
      const x0 = s.cx - zw / 2, y0 = zy + s.zhPx * 0.42;
      const pts: Pt[] = [];
      for (let i = 0; i <= 24; i++) pts.push({ x: x0 - 6 + ((zw + 12) * i) / 24, y: y0 });
      sketch(ctx, partial(pts, draw), { amp: 2.2, seed: 11, width: 3, color: s.underline, alpha: 0.85 * a, ghost: 0.3 });
    }
  }

  if (cue.en) {
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(s.inkEn);
    ctx.font = fontStr('400', s.enPx, 'en');
    const ey = y + PAD_Y + s.zhPx * LH + (s.enPx * LH) / 2;
    ctx.fillText(cue.en, s.cx, ey);
  }
  ctx.restore();
}

/** `mix` re-exported so a scene can style a caption from its own palette without a second import
 *  line, e.g. `drawCaptionPlate(ctx, t, cues, { underline: mix(P.accent, P.ink, 0.2) })`. */
export { mix };
