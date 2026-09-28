// FILL IN — rename to shared.ts once there is real cross-scene geometry, then delete this line.
//
// ---- HAND-OFF CONTRACT ----
// Anything TWO OR MORE scene files need to read in order to morph one into the other lives
// here: shared particle/point arrays, shared geometry-state functions, shared "claimed at"
// timestamps. Both scenes call the SAME pure function of `t` from this file — that is what
// makes a transition a real morph instead of a disguised cut.
//
// A transition with nothing named here is a hard cut. Say so in timeline.template.ts's
// hand-off table. Do not paper over it with a full-frame opaque fill "swap" — a scene that
// fades to full-black followed by a scene that fades in from full-black LOOKS like it eases
// through black, but shares zero geometry with the scene before it; `kit gate`'s boundary-diff
// check exists specifically to catch exactly this pattern.
//
// Reference pattern (a galaxy → tunnel hand-off from a real project this kit's approach is
// drawn from):
//   export interface GP { r: number; th: number; k: number; bright: boolean; }
//   export const GAL: GP[] = [...];                                    // built once, seeded, pure
//   export const CLAIMED_AT = new Float32Array(GAL.length).fill(Infinity);
//   export function galPos(p: GP, t: number): Pt { ... }               // pure fn of t, used by BOTH scenes

import type { Pt } from '../core/math';

// FILL IN — example shared geometry (delete once you have a real one):
export interface ExampleParticle {
  r: number;
  th: number;
}

export const EXAMPLE_PARTICLES: ExampleParticle[] = [];

/** Pure function of time: where an example particle sits on screen. Both hand-off scenes call this. */
export function examplePos(p: ExampleParticle, t: number): Pt {
  return { x: Math.cos(p.th + t) * p.r, y: Math.sin(p.th + t) * p.r };
}
