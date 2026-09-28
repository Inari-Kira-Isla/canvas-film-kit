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

## What's not here yet (later batches)

A fuller pre-production template — a structured five-question kickoff, a per-profile information
budget, a storyboard checklist, and a human-review rubric table per profile (`abstract` vs `music`
vs `explainer`/`history`/`economics`) — lands alongside the profiles themselves (K2-K4; see
`profiles.md`). K1 ships only what `abstract` needs to reach a real, gate-passing MP4.
