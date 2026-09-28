// Starter scene — a single wobbly, hand-drawn circle with one accent pulse. Delete once you have
// real scenes; kept runnable so `npm install && npx tsc --noEmit` (and `npm run dev`) work out of
// the box, AND kept gate-clean out of the box: both T entries the scaffold ships
// (`exampleTransition`, `exampleBeat`) are actually read here, so `kit gate`'s story-metrics
// beat-keys-all-used check does not immediately flag a fresh scaffold for an unused example key.
import { CX, CY, ease, envelope, seg } from '../core/math';
import { boil, circlePts, glow, sketch } from '../core/draw';
import { P } from '../core/color.template';
import { DURATION, T, type Scene } from '../core/timeline.template';

export const placeholderScene: Scene = {
  name: 'placeholder',
  start: 0,
  end: DURATION,
  draw(ctx, t) {
    const grow = seg(t, T.exampleTransition[0], T.exampleTransition[1], ease.outBack);
    const r = 80 + 220 * grow;
    sketch(ctx, circlePts(CX, CY, r, 72), {
      width: 4,
      color: P.ink,
      seed: boil(t), // redraws the outline ~8x/s — the "hand-made" boil
      amp: 3,
      ghost: 0.3,
    });
    // A single one-off accent (FILL IN / delete): T.exampleBeat is a bare-number beat, as opposed
    // to exampleTransition's [start, end] window — see timeline.ts's hand-off contract comment for
    // when to use which shape.
    const pulse = envelope(t, T.exampleBeat - 0.2, T.exampleBeat, T.exampleBeat, T.exampleBeat + 0.4);
    if (pulse > 0.01) glow(ctx, CX, CY, r * 1.4, P.accent, pulse * 0.6);
  },
};
