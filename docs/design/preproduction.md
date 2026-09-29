# Pre-production (P0) — what exists today, and what's coming

`kit new`/`create-canvas-film` writes a per-project `docs/preproduction.md` skeleton. The one thing
`kit gate`'s story-metrics step hard-checks, today, is the sign-off line:

```
approved_by: <name> <YYYY-MM-DD>
```

No line (or a placeholder name like `test`/`tbd`/`todo`/`x`) blocks the gate — nothing can be
exported until a real name and a real, non-future date are present. This is deliberate: it is the
one place a human has to have actually looked at the plan before an MP4 can come out the other end.
You can turn this check off in a project (not recommended, but your choice): a later batch adds a
`kit.config.json` `{"gates": {"approval": "off"}}` switch, which still writes a `SKIP` (with a
reason) into `qa/gate.json` rather than silently disappearing the check.

## What story-metrics.mjs actually measures (the "red-light alarm")

Beyond the sign-off line, `kit gate`'s story-metrics step is a set of *structural* alarms — it
catches films that are shaped like a slideshow (few beats, evenly-split scene lengths, a fixed
camera, caption-driven) — never a judge of whether the story is any good. See the file's own header
comment (`packages/kit/gates/story-metrics.mjs`) for the full threat model, camera contract, and the
calibration anchors the pass/fail bands are set against. A film can be all-green here and still be
rejected by a human reviewer; a yellow band is a prompt to look, never an automatic verdict.

## What exists today (beyond the sign-off line)

The structured five-question kickoff, and a human-review rubric table per profile (`abstract` /
`music` / `explainer` / `history` / `economics`), now ship as part of the `.claude/skills/canvas-film/`
workflow skill every `kit new`/`create-canvas-film` scaffold copies in:

- [`references/kickoff-questions.md`](../../.claude/skills/canvas-film/references/kickoff-questions.md)
  — the five questions, asked before any scene is written, and written into the scaffold's own
  `docs/preproduction.md` → `## Kickoff` section (see `scaffold/new-film.mjs`). They fix the
  protagonist, driver, facts strength, sample length, and aspect ratio — and the profile itself —
  before the storyboard exists.
- [`references/rubrics.md`](../../.claude/skills/canvas-film/references/rubrics.md) — the P5
  fresh-context review rubric table, one row set per profile.
- `AGENTS.md` §7 covers the rest of the phase order (kickoff → storyboard → build → gate →
  independent review → retro) and both human-only sign-off lines (`approved_by_kickoff:` for
  direction, `approved_by:` for the storyboard — see `kickoff-questions.md`'s own "Sign-off"
  section for why answering the five questions does not unlock `kit gate`).

All five named profiles (`abstract`, `music`, `explainer`, `history`, `economics`) are scaffoldable
today — see `profiles.md`'s "Shipping status" table for what each one's axes and gates actually check.

## What's not here yet (later batches)

A per-profile information *budget* (how many facts/numbers a given duration can carry before it
reads as a spec sheet) and a storyboard checklist beyond the rubric table are still open — see
`profiles.md`'s "Adding a profile" section for the shape later work here is expected to take.
