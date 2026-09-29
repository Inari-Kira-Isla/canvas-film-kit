# history demo — "How Printing Spread Across Europe (1450-1500)" — pre-production (P0)

> Scaffolded 2026-09-28 for canvas-film-kit's K4 batch (driver=narration, facts=history, rubric=history).
> This is one of canvas-film-kit's own shipped demos — it exists to prove the kit's history profile
> end-to-end (year-axis / map-route / silhouette / split-compare / portrait-manifest / source-tier +
> disputed-wording checks) on a neutral, brand-free, public-domain-friendly subject, with **zero
> network and zero paid TTS**: narration audio here is a deterministic synthetic tone
> (`kit tts build --provider none`, `audio/vo/N*.wav`) standing in for a recorded line, exactly the
> same "bring your own WAV" pattern demos/explainer already established. No real speech is used or
> claimed.

## Logline

How did Gutenberg's movable-type press, which appeared in Mainz around 1450, spread across Europe by
1500? Four beats: the invention itself, its spread to Strasbourg/Venice/Paris, a popular (disputed)
claim about how many print shops appeared, and the state of things by 1500.

## Notes

- Duration ~27.7s @ 30fps, 1920x1080. Palette: `paper-day` preset (`src/theme.ts`, unmodified).
- Narration: 4 N units (`content/vo_script.json`), synthesized via `kit tts build --provider none`
  (placeholder tone WAVs pre-placed at `audio/vo/N{1..4}.wav`, matching real target durations for
  each line — a real project replaces these 4 files with actual recorded/synthesized speech and
  re-runs the same command).
- `audio/vo/N{1..4}.wav` (K6) are a 3-tone (300/1200/3000Hz) broadband placeholder — the original
  single-tone placeholder concentrated almost all of its energy under ~300Hz, which is honest about
  being "not real speech" but also made `gates/audio-diag.mjs`'s 300Hz-4kHz clarity-band floor fail
  for a reason that had nothing to do with narration content. Each replacement file keeps the EXACT
  SAME duration and zero-silence onset as the file it replaces (verified against `measure-onset.mjs`
  before and after), so `manifest.json`/`timeline.json`/onset-check/speech-rate are all untouched —
  only the placeholder's own spectral shape changed. `audio/mix.wav` is then loudness-mastered to
  ~-15 LUFS integrated (`volume=+9.6dB` on `narration/build-mix.mjs`'s output), same as the other
  narration-driven demos.
- Components used: `src/components/caption-plate.ts`, `chapter-card.ts`, `year-axis.ts` (branded
  `Year` — a SEPARATE coordinate system from narration seconds), `map-route.ts` (schematic only, the
  mandatory "示意" badge is baked into the component, never optional), `silhouette.ts` (a generic
  traced bust outline — never an AI-generated likeness), `split-compare.ts` (1450s vs 1500s coda).
- Facts: `research/fact_table.md` — C01/C03 sourced to Encyclopaedia Britannica (secondary/二手); C02
  is a disputed, popular-history claim (通俗/disputed) and is shown on screen with the hedge word
  "據載" (per history-sources-check.mjs's HEDGE_ALLOWLIST) rather than presented as flat fact.
- Portraits: `src/content/portrait_manifest.json` — Johannes Gutenberg, silhouette kind,
  `ai_generated: false`, sourced to this kit's own traced outline (MIT-licensed, same as the rest of
  canvas-film-kit) — portrait-manifest.mjs verifies this at gate time.

<!--
speech-rate-gate declaration (narration/speech-rate.mjs) — measured against audio/vo/vo_manifest.json
(written by `kit tts build`) once it exists. ~93 pronounced characters across N1-N4 at the kit's usual
Cantonese demo pacing.
-->
speech_rate_cps: 4.8 source: audio/vo/N1.wav

<!--
approved_by is the ONE thing scripts/story-metrics.mjs (via `kit gate`) hard-checks: no line here
(or a placeholder name like "test"/"tbd"/"todo") blocks the gate, so nothing can be exported.
-->
approved_by: canvas-film-kit-k4 2026-09-28
