// "Tide Lines" — a hand-drawn coastline that swells on every detected beat, with a two-line
// caption whose words light up on the beat grid. Demonstrates the kit's music-profile idiom: the
// timeline is driven by audio/beats.json (see ../core/timeline.ts), not a hand-typed cadence — per
// the K2 design doc §3.1 music demo. Lyrics are deliberately Lorem-style/neutral (art, not fact —
// the music profile's facts gate is label-only for exactly this reason).
import { CX, CY, W, ease, seg } from '../core/math';
import { boil, sketch } from '../core/draw';
import { coastline, drawSwell } from '../components/lineart';
import { glowDot, motes } from '../components/fx';
import { drawCaption, type Caption } from '../components/captions';
import { THEME } from '../theme';
import { BEATS, DURATION, T, type Scene } from '../core/timeline';

const P = THEME.palette;

const LINE1: Caption = {
  start: T.capLine1[0],
  end: T.capLine1[1],
  words: ['the', 'tide', 'keeps', 'a', 'steady', 'line', 'here', 'now'].map((text, i) => ({ text, t: BEATS[1 + i] ?? T.capLine1[0] })),
};
const LINE2: Caption = {
  start: T.capLine2[0],
  end: T.capLine2[1],
  words: ['and', 'hums', 'the', 'coast', 'back', 'into', 'sleep', 'slow'].map((text, i) => ({ text, t: BEATS[11 + i] ?? T.capLine2[0] })),
};

/** Nearest-beat "how on-beat is this instant" envelope: 1 right on a beat, decaying to 0 by the
 *  time the next one is due — used to swell the coastline and pulse the accent glow. */
function beatPulse(t: number): number {
  let best = Infinity;
  for (const b of BEATS) {
    const d = Math.abs(t - b);
    if (d < best) best = d;
    if (b > t + 1) break; // BEATS is sorted — no need to scan past t+1s
  }
  return Math.max(0, 1 - best / 0.35);
}

export const tideLinesScene: Scene = {
  name: 'tide-lines',
  start: 0,
  end: DURATION,
  draw(ctx, t) {
    const fade = seg(t, T.fadeIn[0], T.fadeIn[1], ease.outCubic);
    const pulse = beatPulse(t);

    motes(ctx, W, 1080, t, 50, 0.35 * fade, P.muted, 5);

    // three coastline bands at different depths, all swelling together on the beat — the
    // "reaction to the beat" this scene claims in VISUAL_EVENTS (see ../core/timeline.ts).
    const bands: [number, number][] = [
      [CY - 120, 26],
      [CY, 46],
      [CY + 130, 34],
    ];
    for (const [y, amp] of bands) {
      const swelled = amp * (1 + pulse * 0.6);
      const pts = coastline(CX - 460, CX + 460, y, swelled, Math.round(y), 96);
      sketch(ctx, pts, {
        width: THEME.stroke.base,
        color: P.ink,
        seed: boil(t, THEME.wobble.boilFps),
        amp: THEME.wobble.amp * fade,
        freq: THEME.wobble.freq,
        ghost: 0.22,
      });
    }
    drawSwell(ctx, CX - 460, CX + 460, CY + 220, 3, 18, 8 + pulse * 10, t);
    ctx.strokeStyle = `rgba(${P.muted[0]},${P.muted[1]},${P.muted[2]},${0.5 * fade})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (pulse > 0.02) glowDot(ctx, CX, CY - 200, 6 + pulse * 14, P.signal, P.paper, pulse * fade);

    drawCaption(ctx, LINE1, t, { x: CX, y: CY - 280, size: 44, align: 'center', font: '600', dim: P.muted, lit: P.ink, flash: P.signal });
    drawCaption(ctx, LINE2, t, { x: CX, y: CY + 300, size: 44, align: 'center', font: '600', dim: P.muted, lit: P.ink, flash: P.accent });
  },
};
