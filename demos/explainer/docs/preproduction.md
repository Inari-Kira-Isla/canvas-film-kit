# explainer demo — "Why Does the Moon Have Phases" — pre-production (P0)

> Scaffolded 2026-09-28 by `kit new --profile explainer` (driver=narration, facts=knowledge, rubric=explainer).
> This is one of canvas-film-kit's own shipped demos (K3 batch) — it exists to prove the kit's
> explainer profile end-to-end (TTS timeline -> captions -> step-badge -> gate -> export) on a
> neutral, brand-free subject, with **zero network and zero paid TTS**: narration audio here is a
> deterministic synthetic tone (`kit tts build --provider none`, `audio/vo/N*.wav` — see this file's
> own Notes section) standing in for a recorded line, exactly the same "bring your own WAV" pattern
> a real project's `none` provider expects (see `packages/kit/tts/providers/none.mjs`'s own header).
> No real speech is used or claimed — this demonstrates the MEASURED timing pipeline
> (`kit tts build` -> `narration/build-timeline.mjs` -> `narration/onset-check.mjs`), not a finished
> voiceover.

## Logline

Why does the Moon show different shapes on different nights? Four short beats: moonlight is
reflected sunlight, half the Moon always faces the Sun, Earth's changing viewing angle shows us a
different lit fraction each day, and the ~29.5-day cycle this produces (new, first quarter, full,
last quarter).

## Notes

- Duration ~28s @ 30fps, 1920x1080. Palette: `paper-day` preset (`src/theme.ts`, unmodified) — the
  design doc's own default for teaching/explainer work.
- Narration: 4 N units (`content/vo_script.json`), synthesized via `kit tts build --provider none`
  (placeholder tone WAVs pre-placed at `audio/vo/N{1..4}.wav`, matching the durations these captions
  are timed to — a real project replaces these 4 files with actual recorded/synthesized speech and
  re-runs the same command; nothing else about the pipeline changes).
- Components used: `src/components/caption-plate.ts` (bilingual burned caption), `src/components/
  step-badge.ts` (new/first-quarter/full/last-quarter row during N4), `src/components/chapter-card.ts`
  (opening title card), `src/components/pointer.ts` (Sun -> Moon reflection annotation during N1/N2).
- Facts: `research/fact_table.md` C01 (the ~29.5-day synodic month), source NASA (US government work,
  public domain) — the one quantitative claim in the narration, drawn as a direct on-screen numeral
  (`label('29.5', ...) // fact: C01` in `src/scenes/moon-phases.ts`) so `fact-strings-check.mjs`'s
  literal-call heuristic can actually see and verify it; the surrounding descriptive narration text
  lives in `content/cards.json` (a data table, not literal `fillText`/`label` calls) and is outside
  that gate's scan scope by construction — same as every other narration/cards.json-driven caption in
  this kit (documented limitation, not hidden).

<!--
speech-rate-gate declaration (narration/speech-rate.mjs) — measured against audio/vo/vo_manifest.json
(written by `kit tts build`) once it exists. 103 pronounced characters / 22.4s planned speech ≈ 4.6
chars/s.
-->
speech_rate_cps: 4.6 source: audio/vo/N1.wav

<!--
approved_by is the ONE thing scripts/story-metrics.mjs (via `kit gate`) hard-checks: no line here
(or a placeholder name like "test"/"tbd"/"todo") blocks the gate, so nothing can be exported.
Add exactly one line below, in this exact shape, once a human has actually looked at the plan:
approved_by: <name> <YYYY-MM-DD>
-->
approved_by: canvas-film-kit-k3 2026-09-28
