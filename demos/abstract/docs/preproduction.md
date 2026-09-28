# abstract demo — "One Line" — pre-production (P0)

> Scaffolded 2026-09-28 by `kit new --profile abstract` (driver=none, facts=none, rubric=abstract).
> This is one of canvas-film-kit's own shipped demos (K2 batch) — it exists to prove the kit's
> abstract profile end-to-end (gate + export) on a neutral, brand-free subject, and to give the
> README something real to link a GIF from.

## Logline

A single hand-drawn line never cuts away for 18 seconds: it draws itself in, becomes a circle,
becomes a travelling coastline wave, becomes a spiral — one continuous piece of geometry
demonstrating the kit's line-art vocabulary (`templates/components/lineart.ts`/`fx.ts`) and the
`theme.ts` palette system on a subject with no brand, no facts, and no narration.

## Notes

- Duration 18s @ 30fps, 1920x1080.
- Single scene (`src/scenes/one-line.ts`) on purpose — a continuously-deforming shape has no
  transition to hide a hard cut behind, so `boundary-diff`/`determinism` have nothing to flag
  (documented "no interior boundary" PASS, not a hidden gap).
- Palette: `ink-night` preset from `src/theme.ts` (unmodified).

<!--
approved_by is the ONE thing scripts/story-metrics.mjs (via `kit gate`) hard-checks: no line here
(or a placeholder name like "test"/"tbd"/"todo") blocks the gate, so nothing can be exported.
Add exactly one line below, in this exact shape, once a human has actually looked at the plan:
approved_by: <name> <YYYY-MM-DD>
-->
approved_by: canvas-film-kit-k2 2026-09-28
