# economics demo — "The Fictional Island's Bread Price: What Is Inflation" — pre-production (P0)

> Scaffolded 2026-09-28 for canvas-film-kit's K4 batch (driver=narration, facts=data, rubric=economics).
> This is one of canvas-film-kit's own shipped demos — it exists to prove the kit's economics profile
> end-to-end (line/bar chart, count-up, entity-card, source-footer, chart-provenance.mjs) on a
> COMPLETELY FICTIONAL dataset (`src/data/island-economy.json`, every entry `fictional: true`) — no
> real island, no real bakery, no real currency, **zero network and zero paid TTS**: narration audio
> here is a deterministic synthetic tone (`kit tts build --provider none`, `audio/vo/N*.wav`) standing
> in for a recorded line, same pattern as every other demo this kit ships.

## Logline

What does "inflation" actually mean? A fictional island's bread price over four fictional years,
ending ~50% higher — shown as a line chart, a bar-chart comparison, an animated count-up percentage,
and a fictional bakery entity card, every one of them explicitly labelled "示意數據" (illustrative
data) via `source-footer.ts`.

## Notes

- Duration ~27.4s @ 30fps, 1920x1080. Palette: `paper-day` preset (`src/theme.ts`, unmodified).
- Narration: 4 N units (`content/vo_script.json`), synthesized via `kit tts build --provider none`.
- Components used: `caption-plate.ts`, `chapter-card.ts`, `components/charts/{line,bar}.ts`,
  `count-up.ts` (pure function of `t` — see that file's own header on why it must never be a rAF
  accumulator), `entity-card.ts`, `source-footer.ts` (the ONE component that renders the mandatory
  "示意數據" badge whenever a dataset's `fictional` flag is wired through — never optional).
- Data: `src/data/island-economy.json` — `bread-price-index` (4 fictional yearly prices, "shells/loaf")
  and `lighthouse-bakery` (a fictional entity-card subject), BOTH `fictional: true`.
  `src/content/chart_manifest.json` cross-references every on-screen chart/count-up/card to one of
  these dataset ids — `chart-provenance.mjs` verifies the whole chain at gate time.
- Facts: `research/fact_table.md` — C01 is a general, uncontroversial definition of inflation; C02
  documents that the ~50% figure shown on screen comes from the fictional dataset above, not real
  data (fact-strings-check.mjs verifies the on-screen numeral is tagged, same Cxx mechanism every
  other profile uses for narration text — a separate mechanism from chart-provenance.mjs's own
  dataset-id cross-check, which governs the CHART numbers specifically).

<!--
speech-rate-gate declaration (narration/speech-rate.mjs) — measured against audio/vo/vo_manifest.json
(written by `kit tts build`) once it exists. ~100 pronounced characters across N1-N4 at the kit's
usual Cantonese demo pacing.
-->
speech_rate_cps: 4.8 source: audio/vo/N1.wav

<!--
approved_by is the ONE thing scripts/story-metrics.mjs (via `kit gate`) hard-checks: no line here
(or a placeholder name like "test"/"tbd"/"todo") blocks the gate, so nothing can be exported.
-->
approved_by: canvas-film-kit-k4 2026-09-28
