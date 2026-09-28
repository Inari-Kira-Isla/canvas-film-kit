# Why `kit gate` checks what it checks

`kit gate` (`packages/kit/gates/gate.mjs`) runs a fixed list of mechanical checks before every
export. None of them judge whether a film is *good* — that's a human's job (rubric review +
`approved_by:`). Every one of them exists because a specific, previously-real failure mode is cheap
to prevent mechanically and expensive to catch by eye. This file is the "why," kept separate from the
check scripts themselves so the reasoning survives even as the exact wording of a comment changes.
Where a check's own source-code comment referenced a specific internal project or decision, that
detail is intentionally left out here — the *reason* generalizes, the internal history doesn't need
to.

## Determinism (`nondeterminism-check.mjs`, `determinism.mjs`, `boundary-diff.mjs`)

The entire premise of "code renders the same film on any computer" collapses the moment a scene's
draw function isn't a pure function of `t`. Three failure modes, all real, all easy to introduce
without noticing:

- **Unseeded randomness.** `Math.random()` inside a scene means the SAME `t` produces a DIFFERENT
  frame on two different renders — including two renders on the *same* machine seconds apart. Any
  visual variety a film needs (noise textures, imperfect hand-drawn wobble, staggered timing) must
  come from a seeded source (`core/random.ts`) so it's reproducible, not merely "looks random."
- **Wall-clock reads.** `Date.now()`/`performance.now()` inside render code makes a frame's content
  depend on *when* it happened to be rendered, not what second of the film it represents. A film
  exported today and re-exported next month from the identical source must produce identical frames;
  a wall-clock read breaks that silently — the bug only shows up when someone diffs two renders and
  finds they don't match, by which point it's often unclear why.
- **Frame-to-frame accumulated state.** Code that advances an angle/position by adding a small delta
  each frame (rather than computing it directly from `t`) gives the right answer when frames are
  rendered in order — and a *different* answer the moment something seeks to `t=10` without having
  rendered `t=0..9` first. Export pipelines, still-frame extraction, and scrubbing in a preview UI all
  do exactly that. `determinism.mjs` seeks forward, backward, and in shuffled order specifically to
  catch this class of bug, because "renders fine start-to-finish" is not the same guarantee.

`boundary-diff.mjs` catches a related but distinct problem: a hidden hard cut at a scene transition
that isn't declared as one. A transition that's *supposed* to be a hard cut is fine; one that happens
because two adjacent scenes' geometry doesn't actually share continuity, and nobody noticed because
the preview always plays forward through it smoothly, is the bug this check exists for.

## Hex colours and timestamps live in exactly one file each

A film's palette and its pacing are the two things most likely to need a global change late in
production ("make it warmer," "the narrator reads faster than we planned, shift everything back
0.3s"). If a hex colour or a raw second value is typed directly into a scene file, that global change
becomes a find-and-replace across every scene — slow, and one missed instance produces a
color/rhythm error that's subtle on screen and easy to miss in review. Routing every colour through
`theme.ts`'s `P` object and every timestamp through `timeline.ts`'s `T`/`seg()` makes both changes a
one-file edit, and makes "does this film use an undeclared colour/time" a one-command grep instead of
a manual read-through.

## `approved_by:` is a human checkpoint, not a formality

Every other `kit gate` step is mechanical: given the same inputs, it always gives the same verdict,
and an AI agent can satisfy it correctly without any human judgment involved. Whether a *story* is
actually coherent, whether a claim is stated fairly, whether 25 seconds is the right length for this
idea — none of that is mechanically checkable. `approved_by:` is the one deliberate non-mechanical
gate: it forces a real human to have looked at `docs/preproduction.md`'s logline and notes and typed
their own name and today's date, before `kit export` will render a single frame. A placeholder name
("test", "tbd", "todo") is rejected specifically because the entire value of this check is that
*someone specific* is on record as having looked — see `AGENTS.md` §4 for why an AI agent must never
fill this line in on a human's behalf.

## A number without a source is a number nobody can check

`fact-strings-check.mjs` / `history-sources-check.mjs` / `chart-provenance.mjs` all enforce the same
underlying rule in different profiles: any number, date, or factual claim that ends up on screen must
trace back to something a viewer (or a later reviewer) could actually go check — a `research/
fact_table.md` entry, a `src/data/*.json` dataset with a `source`/`url`/`retrieved` field, or an
explicit `fictional: true` flag that forces a visible "illustrative data" label instead of a claimed
source. The failure mode this prevents isn't malicious fabrication — it's the much more common case
of a plausible-sounding number getting typed in during scene-writing and nobody remembering, three
edits later, whether it came from research or was just a placeholder that never got replaced.

## Silent font fallback is a silent style break

Canvas text rendering falls back to a system font when the requested family isn't loaded — quietly,
with no error, no console warning, just visibly different letterforms. Because "same code, same style
everywhere" is this kit's central promise, that fallback is exactly the kind of failure that's
invisible on the machine that has the right fonts installed and only shows up on someone else's
machine (or CI). `font-coverage.mjs` scans every string that will be rendered against the actual
font files' glyph coverage (via a real font parser, not a guess) and fails loudly, before export,
naming the missing characters — rather than letting a viewer notice the film looks subtly wrong on
their computer.
