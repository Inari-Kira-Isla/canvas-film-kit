# Profiles

A `PROFILE` (`src/config.ts`) is a named shorthand for three orthogonal axes — `kit gate` and the
story rubric read the axes, never the profile name, so a new named profile never needs a whole new
copy of every check:

| axis | values | meaning |
|---|---|---|
| `DRIVER` | `none` / `music` / `narration` | what paces the timeline — nothing external, a song's beats/onsets, or a narration track |
| `FACTS` | `none` / `label` / `knowledge` / `history` / `data` | what kind of on-screen fact budget applies, if any |
| `RUBRIC` | matches the profile name | which human-review rubric table applies |

## Shipping status

| profile | driver | facts | rubric | status |
|---|---|---|---|---|
| `abstract` | none | none | abstract | **shipped (K1)** — pure procedural-visual, no on-screen text budget |
| `music` | music | label | music | **shipped (K2)** — timeline driven by `audio/beats.json` (see `kit beats`/`kit make-demo-track`), beat-hit-rate gate |
| `explainer` | narration | knowledge | explainer | **shipped (K3)** — TTS timeline (`kit tts build`), speech-rate/onset-check/timing-source-check gates |
| `history` | narration | history | history | **shipped (K4)** — year-axis (branded `Year`, a coordinate system separate from narration seconds), map-route (schematic only, mandatory "示意" badge), silhouette (never AI-generated), split-compare, `portrait-manifest.mjs` + `history-sources-check.mjs` (source tier + disputed-wording hedge check) gates |
| `economics` | narration | data | economics | **shipped (K4)** — charts/{bar,line,area}, count-up (pure function of `t`), entity-card, source-footer (renders the mandatory "示意數據" badge for `fictional: true` data), `chart-provenance.mjs` gate |
| `info-narrative` | none/narration | knowledge | info-narrative | kept only for backward compatibility with the single-project tooling this kit was distilled from; not actively promoted |

All five profiles above are scaffoldable today (`kit new --profile <abstract|music|explainer|history|
economics>`) — `new-film.mjs`'s `PROFILES` list is the single source of truth for what is actually
available. Each profile also has a worked-example demo under `demos/<profile>/` (fictional/public-
domain-friendly content, zero network, zero paid TTS) — the fastest way to see a profile's gates and
components actually wired together.

## Adding a profile (for later batches, not K1)

1. Add the profile to `packages/kit/scaffold/new-film.mjs`'s `PROFILES`/`AXES`.
2. Add any profile-only template directories under `packages/kit/templates/` and copy them
   conditionally (an earlier internal prototype this kit's design evolved from gated its equivalent
   of `narration-sync/`, `components/`, `fact-gate/` on `profile === 'explainer'` — the same pattern
   applies here).
3. Add the profile's gate steps to `packages/kit/gates/gate.mjs`, gated on `profile !== 'abstract'`
   (or the specific profile) and on the relevant input file existing yet — every existing gate step
   SKIPs (not FAILs) until its input exists, so a profile's gates never break another profile's flow.
4. Add a demo under `demos/<profile>/` with fictional, brand-neutral content (see the repo's release
   rules — no real people's names/faces, no real company data unless explicitly public-domain and
   sourced).
