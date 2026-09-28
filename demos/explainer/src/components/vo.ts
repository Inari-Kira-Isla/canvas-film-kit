// components/vo.ts — narration timeline contract: the shape every narration-driven scene reads
// captions through. Whatever generates your timeline (narration/build-timeline.mjs, or a project's
// own TTS wrapper) emits an array of this `Caption` shape (or anything STRUCTURALLY compatible with
// it — TS structural typing means a hand-written array literal in a scene file works too, no import
// required).
//
// This is a COPY template — paste into your own `src/components/vo.ts` (or import it directly if
// your bundler resolves `../../packages/kit` templates — most projects just copy it).
export interface Caption {
  id: string;
  text: string;
  lines: string[];
  t_in: number;
  t_out: number;
  fact_id: string | null;
  fact_ids: string[];
  emph: string | null;
  line_at?: number[];
}

/** Which caption(s) are active at `t` (t_in <= t < t_out). `captions` need not be sorted. */
export function activeCaptions<C extends Pick<Caption, 't_in' | 't_out'>>(t: number, captions: readonly C[]): C[] {
  return captions.filter((c) => t >= c.t_in && t < c.t_out);
}
