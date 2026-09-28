# canvas-film-kit

**Deterministic, hand-drawn Canvas 2D short films from code — explainers, history, economics,
music — with built-in fact and render gates. Same code, same style, on Mac, Windows and Linux.**

*(中文說明：[README.md](README.md))*

<p>
  <img src="docs/media/abstract-hero.gif" width="360" alt="abstract profile demo — one continuous line becomes a circle, a wave, a spiral">
</p>

| abstract | music | explainer | history | economics |
|---|---|---|---|---|
| ![abstract still](docs/media/abstract.jpg) | ![music still](docs/media/music.jpg) | ![explainer still](docs/media/explainer.jpg) | ![history still](docs/media/history.jpg) | ![economics still](docs/media/economics.jpg) |

> All 5 images/GIF above are real frames extracted from the MP4s in `demos/` — none of it is a hand-drawn mockup (`docs/media/` totals under 1MB).

---

## What this kit gives you

- **`render(t)` is a pure function.** Given the same `t`, it produces the exact same frame every
  time, on every machine — `kit gate`'s determinism step actually seeks forward, backward, and in
  shuffled order to verify this, it doesn't just take your word for it.
- **Colour and timing each live in exactly one place.** Hex colours only in `theme.ts`, timestamps
  only through `timeline.ts` — `kit gate`'s grep gate fails if either shows up anywhere else.
- **Facts are checked before export.** A number or historical claim on screen needs a source
  (`research/fact_table.md` or `src/data/*.json`) — no source and no `fictional: true` flag means
  the gate fails.
- **One deliberate human checkpoint.** `docs/preproduction.md`'s `approved_by: <name> <YYYY-MM-DD>`
  is the one step in the whole gate pipeline that isn't mechanical — a human has to have actually
  looked before export is allowed (see [AGENTS.md](AGENTS.md) §4).
- **Zero Python in the core.** `doctor`/`gate`/`export`/`stills`/`determinism`/`boundary-diff` are
  all plain Node — Python is only needed if you choose local Whisper alignment.

## Install

You need: **Node 22.12+** (24 LTS recommended), **ffmpeg ≥6** (with `libx264`), and git. The
renderer prefers your already-installed system Chrome, falling back to Playwright's bundled
Chromium if none is found.

| Platform | Install ffmpeg |
|---|---|
| macOS | `brew install ffmpeg` |
| Windows | `winget install ffmpeg` or `choco install ffmpeg` |
| Linux (Debian/Ubuntu) | `sudo apt-get install ffmpeg` |

Once installed, `kit doctor` reports PASS/WARN/FAIL for each dependency (Node version, ffmpeg,
browser, GPU renderer, fonts, disk space, …). `doctor --fix` only prints install commands — it never
installs anything on your behalf.

## Quick start

This kit is **not published to the npm registry** — install straight from GitHub (see
[`docs/design/why-file-dependency.md`](docs/design/why-file-dependency.md)).

```bash
npx --yes github:Inari-Kira-Isla/canvas-film-kit#v0.1.1 new my-film --profile explainer
cd my-film
npm install
npm run dev              # leave this terminal running
```

In another terminal:

```bash
npm run doctor            # diagnostic only, always exits 0
npm run gate              # every mechanical pre-export check
npm run export            # runs gate first automatically; refuses to render if it fails
```

The scaffolded project already ships example content that passes `gate` — except
`docs/preproduction.md`'s `approved_by:` line, which is a placeholder you must fill in yourself (see
"Gates and `approved_by`" below).

> **Alternative (no re-download per film)**: `git clone` this repo once, run `npm install` at its
> root, then scaffold with `node packages/kit/bin/kit.mjs new ../my-film --profile explainer`. A
> project scaffolded this way points back at your local clone (a `file:` dependency) — handy if
> you're starting several films and don't want to re-fetch from GitHub every time.

## The five profiles

`--profile` sets three axes: `driver` (what paces the film — narration/music/none), `facts` (whether
and how strictly claims are checked), and `rubric` (which story-structure rules a reviewer checks
against).

| profile | driver | facts | good for | shipped demo |
|---|---|---|---|---|
| `abstract` | none | none | pure visual pieces, no on-screen text or numbers | "One Line" — one continuous stroke becomes a circle, a wave, a spiral |
| `music` | music beat | only self-declared names/taglines | music videos, rhythm-driven pieces | "Tide Lines" — line-art waves moving with a beat grid |
| `explainer` | narration | knowledge-level facts | teaching a concept | "Why the Moon has phases" — a geometry explainer sourced from NASA |
| `history` | narration | historical (tiered: primary/secondary/popular) | historical narrative | "How printing spread across Europe, 1450–1500" — a year axis + a schematic map |
| `economics` | narration | dataset-backed (every chart number needs a source) | data-driven narrative | "The price of bread on a fictional island: what is inflation" — a fully fictional dataset demonstrating the "illustrative data" label |

See [`docs/design/profiles.md`](docs/design/profiles.md) for which components and extra gate steps
each profile pulls in, and what `kit new` still leaves for you to fill in.

## Narration (TTS)

`explainer`/`history`/`economics` can use `kit tts build`; `music` has no narration and `abstract`
has no text at all.

| provider | cost | required env vars | notes |
|---|---|---|---|
| `none` | free | none | default — captions-only, or drop your own `.wav` files into `audio/vo/` |
| `system` | free | none | uses your OS's own TTS (e.g. macOS `say`) |
| `edge` (**experimental**) | free | none | unofficial endpoint, may break at any time — not in CI, not the default, read the terms yourself before relying on it |
| `minimax` | paid | `MINIMAX_API_KEY` (`MINIMAX_GROUP_ID` optional) | returns real word-level timestamps |
| `openai` | paid | `OPENAI_API_KEY` | model name is set in config, never hardcoded |

**Credential rule**: this kit reads `process.env` only — no dotfile fallback, no kit-owned credential
store of any kind. Want a `.env` file? Use Node's own `node --env-file=.env`. `kit doctor` only
reports whether a given env var is *set*, never its value.

```bash
kit tts build my-film --script content/vo_script.json --provider minimax --voice <voice-id> --lang en
```

## Gates and `approved_by`

`kit gate` runs typecheck, grep gates (hex/seconds), the nondeterminism check, fact/source checks,
determinism, and boundary-diff in one pass, writing the result to `qa/gate.json`. `kit export` always
runs `gate` first and refuses to render if it fails.

**How to use `approved_by:`** — add one line by hand to `docs/preproduction.md`:

```
approved_by: <your name> <YYYY-MM-DD>
```

This is the **only non-mechanical** step in the whole gate pipeline: a real person has to have looked
at the plan and typed their own name before export is allowed. Placeholder names (`test`/`tbd`/`todo`)
are rejected, and an AI agent must never fill this line in on a human's behalf (see
[AGENTS.md](AGENTS.md) §4).

**How to turn it off** — there is currently no project-wide config toggle to skip this step
permanently. The escape hatches that actually exist today are:

- `kit export --skip-gate "<a real reason, not a placeholder>"` — logs the reason and a timestamp to
  `qa/gate_skips.jsonl` (meant to be committed — a skip that leaves no trace defeats the point).
- `kit gate`/`story-metrics.mjs --calibrate` — re-measures a film that was **already** approved once
  (e.g. after a rendering-logic change, to confirm the old film still holds up), not a second way to
  approve something for the first time.

> Earlier design notes for this kit describe a planned `kit.config.json` `gates.approval` toggle for
> permanently skipping this step project-wide — that isn't implemented in this release; the two
> escape hatches above are what actually exists.

## Pre-release cleanup (`release-scan`)

If you fork this kit and want to publish your own version publicly, run:

```bash
node scripts/release-scan.mjs .        # personal paths / emails / phone numbers / key-shaped strings (generic rules, built into the repo)
gitleaks detect --no-git --source .    # a second, independent credential scan (prints install instructions if missing, never fakes a pass)
```

Both need to report zero findings before you consider it clean.

`release-scan.mjs` itself only knows generic rules (absolute paths, email/phone shapes, credential
shapes) — it will **not** catch your own brand names, internal codenames, or personal identifiers,
because none of that belongs in a public repo's source in the first place (not even in the scanner
itself). To also check for that class of leak, copy
[`scripts/private-terms.example.txt`](scripts/private-terms.example.txt) to somewhere OUTSIDE this
repo (default: `~/.config/canvas-film-kit/private-terms.txt`, or point `RELEASE_SCAN_PRIVATE_TERMS=<path>`
elsewhere), fill in your own real terms, then run the scan above. It still runs fine without that
file — you just lose that one category, and it prints a notice saying so.

## Cross-platform notes

- **Windows**: every `npm run` script is `node xxx.mjs` — no `&&`/`rm`/shell-only syntax; filenames
  never use CJK characters.
- **The key to "same style everywhere" is fonts.** A canvas silently falls back to a system font when
  a family isn't loaded, and that fallback is invisible until you compare renders across machines.
  `kit fonts` downloads and sha256-locks the OFL fonts this kit uses (Noto Sans/Serif TC, Inter,
  JetBrains Mono) into `public/fonts/` — the fonts themselves are **never committed** to this repo
  (each CJK weight is several MB), and a failed download fails loudly rather than silently falling
  back to a system font.
- **The guarantee is "same style," not "pixel-identical."** Font rasterization (CoreText/DirectWrite/
  FreeType) and GPU differences between machines mean small visual differences are expected across
  machines; the SAME machine, SAME render is guaranteed bit-identical (that's what `kit gate`'s
  determinism step actually checks).

## Repo layout

```
packages/kit/                → npm package canvas-film-kit: the kit CLI, gates, renderer, scaffold, templates
packages/create-canvas-film/ → npm package create-canvas-film: a thin wrapper around the kit's own scaffold
demos/{abstract,music,explainer,history,economics}/  → 5 shipped demos, rendered for real in CI
docs/design/                 → why things are built this way (gate rationale, profile table, npm-publish notes)
docs/media/                  → the screenshots/GIF this README uses (all extracted from demos/, none hand-drawn)
scripts/                     → repo-level tooling (release-scan, path checks, fixture test runner)
.github/workflows/           → CI (see below)
```

## CI

`.github/workflows/ci.yml` runs doctor + gate + an abstract-demo export + every gate's own good/bad
fixture pair + release-scan, on ubuntu/macos/windows.

## FAQ

**What's the visual style based on?** Line-art, hand-drawn wobble, paper-grain texture —
`theme.ts` ships three presets (`ink-night`/`paper-day`/`chalkboard`), all newly designed colour
values, not copied from any specific brand.

**Can I use this for real historical/economic content?** Yes — `history`/`economics` profiles force
you to provide sources (`research/fact_table.md`, `src/data/*.json`), and fully fictional content
must be flagged `fictional: true`, which forces an on-screen "illustrative data" label. That's a
deliberate design choice, not a loophole to route around.

**Why no GUI or timeline editor?** This kit's whole value proposition is "code is the single source
of truth, so an AI coding agent can safely edit it" — a GUI is explicitly out of scope for now (see
"not doing this" in `docs/design/`).

**Rendering is slow — why?** `kit doctor` tells you which GPU renderer is actually active. Seeing
`SwiftShader`/`llvmpipe` (software rendering — common in Docker or a GPU-less CI runner) means slow
is expected; use `export --scale 0.5` for a preview-quality render.

**Using an AI coding agent (Claude Code/Codex/Cursor) to build a film?** Read [AGENTS.md](AGENTS.md)
— the rules any agent working in this codebase must follow (`render(t)` must be pure, no
`Math.random`/`Date.now`, colour/timing each have exactly one home, `approved_by:` is a human
signature an agent never fills in). `CLAUDE.md` already points at it via `@AGENTS.md`, so Claude Code
picks it up automatically.

## License

**MIT** (see [LICENSE](LICENSE)). Fonts downloaded by `kit fonts` are **SIL OFL 1.1** and are never
committed to this repository — `OFL.txt` is written alongside them into `public/fonts/` at download
time.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) (every new gate check needs a good/bad fixture),
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) (how to report a security
issue). This project is maintained as-is, best-effort — no SLA.
