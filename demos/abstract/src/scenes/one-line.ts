// "One Line" — a single hand-drawn stroke that never cuts away: it draws itself in, becomes a
// circle, becomes a travelling wave band, becomes a spiral. One scene, one piece of geometry (a
// fixed-length point array reshaped every frame), demonstrating the kit's line-art vocabulary
// (templates/components/lineart.ts, fx.ts) on a neutral, brand-free subject — per the K2 design
// doc §3.1 abstract demo.
import { CX, CY, H, W, ease, lerpPt, seg, TAU, type Pt } from '../core/math';
import { boil, circlePts, sketch } from '../core/draw';
import { coastline, drawOrbitRings } from '../components/lineart';
import { glowDot, motes } from '../components/fx';
import { THEME } from '../theme';
import { DURATION, T, TICK_KEYS, tickAt, type Scene } from '../core/timeline';

const P = THEME.palette;
const N = 140; // every shape below is resampled to exactly this many points, so lerping between
// two shapes is just lerping corresponding array indices — no resampling needed at draw time.

function lineShape(): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    out.push({ x: CX - 420 + u * 840, y: CY });
  }
  return out;
}
function circleShape(): Pt[] {
  return circlePts(CX, CY, 260, N);
}
function waveShape(): Pt[] {
  return coastline(CX - 420, CX + 420, CY, 90, 7, N - 1);
}
function spiralShape(): Pt[] {
  const out: Pt[] = [];
  const turns = 3;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const a = u * turns * TAU;
    const r = 14 + u * 280;
    out.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r });
  }
  return out;
}

const LINE = lineShape();
const CIRCLE = circleShape();
const WAVE = waveShape();
const SPIRAL = spiralShape();

function lerpShape(a: Pt[], b: Pt[], u: number): Pt[] {
  const out: Pt[] = new Array(N);
  for (let i = 0; i < N; i++) out[i] = lerpPt(a[i], b[i], u);
  return out;
}

/** The single continuous geometry this whole film is: which two keyframe shapes to blend between,
 *  and how far, at timeline second `t`. Pure function of `t` — the whole determinism contract this
 *  kit is built around rests on functions exactly like this one. */
function shapeAt(t: number): { pts: Pt[]; reveal: number } {
  if (t < T.toCircle[0]) return { pts: LINE, reveal: seg(t, T.draw[0], T.draw[1], ease.outCubic) };
  if (t < T.toCircle[1]) return { pts: lerpShape(LINE, CIRCLE, seg(t, T.toCircle[0], T.toCircle[1], ease.inOutSine)), reveal: 1 };
  if (t < T.toWave[0]) return { pts: CIRCLE, reveal: 1 };
  if (t < T.toWave[1]) return { pts: lerpShape(CIRCLE, WAVE, seg(t, T.toWave[0], T.toWave[1], ease.inOutSine)), reveal: 1 };
  if (t < T.toSpiral[0]) return { pts: WAVE, reveal: 1 };
  if (t < T.toSpiral[1]) return { pts: lerpShape(WAVE, SPIRAL, seg(t, T.toSpiral[0], T.toSpiral[1], ease.inOutSine)), reveal: 1 };
  return { pts: SPIRAL, reveal: 1 };
}

export const oneLineScene: Scene = {
  name: 'one-line',
  start: 0,
  end: DURATION,
  draw(ctx, t) {
    const { pts, reveal } = shapeAt(t);
    if (reveal <= 0.002) return;
    const drawn = reveal < 1 ? pts.slice(0, Math.max(2, Math.round(pts.length * reveal))) : pts;

    // faint orbit-ring accent behind the line while it's a circle/spiral (t past the first morph) —
    // a purely decorative demonstration of components/lineart.ts's cosmos motif, not load-bearing.
    if (t > T.toCircle[0]) {
      const a = Math.min(1, seg(t, T.toCircle[0], T.toCircle[1], ease.outCubic));
      drawOrbitRings(ctx, CX, CY, 40, t * 0.3, 'rgba(216,102,63,0.18)', 'rgba(127,183,201,0.14)', 'rgba(237,230,214,0.5)', Math.round(6 * a));
    }

    sketch(ctx, drawn, {
      width: THEME.stroke.base * 1.3,
      color: P.ink,
      seed: boil(t, THEME.wobble.boilFps),
      amp: THEME.wobble.amp,
      freq: THEME.wobble.freq,
      ghost: 0.28,
    });

    // one accent pulse while it's a circle
    const pulse = Math.max(0, 1 - Math.abs(t - T.holdCircle) / 0.5);
    if (pulse > 0.01) glowDot(ctx, CX, CY, 10 + pulse * 18, P.accent, P.paper, pulse * 0.8);

    // a steady ~1s spark travels along the shape, timed off T's tick grid — see ../core/timeline.ts
    // for why this grid exists (keeps story-metrics' anti-slideshow beat-spacing gate green) and why
    // it is read one key at a time here rather than by enumerating T.
    for (const k of TICK_KEYS) {
      const tt = tickAt(k);
      const tp = Math.max(0, 1 - Math.abs(t - tt) / 0.18);
      if (tp > 0.02) {
        const idx = Math.max(0, Math.min(drawn.length - 1, Math.floor((tt / DURATION) * (drawn.length - 1))));
        const pt = drawn[idx];
        glowDot(ctx, pt.x, pt.y, 3 + tp * 6, P.signal, P.paper, tp * 0.7);
      }
    }

    motes(ctx, W, H, t, 60, 0.5, P.muted, 3);
  },
};
