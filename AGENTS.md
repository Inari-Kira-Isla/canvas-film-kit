# AGENTS.md — rules for any AI coding agent working in a canvas-film-kit project

You are reading this because you (an AI agent — Claude Code, Codex, Cursor, or anything else that
reads `AGENTS.md`) are about to write or edit code in a project scaffolded by `create-canvas-film`
or `kit new`. These are not style preferences. Every rule below exists because breaking it produces
a film that looks fine on the machine that rendered it and breaks (or lies) somewhere else — a
different OS, a re-render six months later, or a reviewer who never sees the number a caption is
quoting. `kit gate` mechanically enforces most of these; this file is what to keep in mind *while
writing the code*, before you ever run the gate.

## 1. `render(t)` is the entire contract

Every scene's draw function is a **pure function of the timeline second `t`**. Given the same `t`,
it must produce **pixel-identical** output every single time — this render, tomorrow's render, a
render on someone else's machine. That is the one property this whole kit is built to protect
(`kit gate`'s determinism + boundary-diff steps exist only to catch violations of this).

Concretely, that means:

- **No `Math.random()`.** Use `core/random.ts`'s `rng(seed)` / `hash(n, seed)` / `noise1` / `noise3` —
  every one of those is seeded and deterministic. `Math.random()` in a scene or component file is a
  hard gate failure (`nondeterminism-check.mjs`), not a warning.
- **No `Date.now()` / `performance.now()` / any wall-clock read inside render code.** The only clock
  that exists inside a scene is the `t` argument you were given. A film exported today and re-exported
  next year from the same source must produce the same frames.
- **No accumulating state across frames** (`let angle += 0.01` in a per-frame callback). Compute the
  value directly from `t` (`angle = t * SPEED`) so seeking to any `t` — forward, backward, out of
  order — gives the same answer. `kit gate`'s determinism check literally seeks forward, backward,
  and shuffled and compares SHA-256 hashes of the rendered frame; state that "remembers" how it got
  to `t` will fail this the moment seek order changes.
- **No network calls, no filesystem reads, no environment-dependent branching inside render code.**
  TTS synthesis, beat detection, font downloading — all of that happens in a build/prep step
  *before* the page renders; by the time a scene's draw function runs, everything it needs is already
  a plain value in memory or in a JSON file loaded once at startup.

## 2. Colour and timing only ever come from one place each

- **Every hex colour literal lives in `src/theme.ts` — nowhere else.** A scene or component receives
  colour through the `P` palette object (see `src/core/color.ts`'s hand-off contract), never a
  hardcoded `#RRGGBB`. `kit gate`'s grep-gates step fails on any hex literal found outside
  `theme.ts`. This is what makes a theme swap (`ink-night` → `paper-day` → `chalkboard`) a one-file
  change instead of a find-and-replace across every scene.
- **Every timestamp comes from `src/core/timeline.ts`'s `T` / `seg()` — never a bare number typed
  into a scene.** `seg(4.5, 7)` is checked into source once, in one place, as a named beat; a scene
  writing `if (t > 4.5)` directly is a grep-gate failure. This is what makes retiming a whole film
  (a narrator reads faster than expected, a beat grid shifts) a one-file change.

## 3. Every mechanical check must have a negative fixture

If you add a new `kit gate` step (a new check, not a new scene), it needs **two** fixtures under
that check's own `__fixtures__/{good,bad}/` directory: one that passes, one that is deliberately
broken in exactly the way the check exists to catch. A check with no `bad/` fixture proving it can
actually fail is a check nobody has verified does anything — see `CONTRIBUTING.md`.

## 4. `approved_by:` is a human signature — an agent never writes it

`docs/preproduction.md`'s `approved_by: <name> <YYYY-MM-DD>` line is the one thing in the entire gate
pipeline that is **not** mechanical: it means a human actually read the plan and signed off before
export was allowed to happen. **You, the agent, must never fill in, fabricate, or guess this line on
a human's behalf** — not with the project owner's name, not with your own, not with a placeholder
that happens to pass the format check. Filling in someone else's name here is worse than a gate
failure: it makes the gate lie about what it is protecting.

If the gate needs to be bypassed for a legitimate reason before a human is available to approve
(a CI dry run, a `--calibrate` re-measurement of already-approved content, a documented one-off),
use the escape hatches that already exist and already log why:

- `kit export --skip-gate "<a real reason, not a placeholder>"` — logs the skip, the reason, and a
  timestamp to `qa/gate_skips.jsonl` (append-only, meant to be committed — a skip that leaves no
  trace defeats the entire point of the gate existing).
- `story-metrics.mjs --calibrate` — for re-measuring a film whose storyboard was already approved
  once; it is a measurement tool, not a second way to approve something for the first time.

Neither of these is "turn the gate off" — they are "record, honestly, that the gate was bypassed and
why." Do not look for a third way around `approved_by:` that avoids leaving that record.

## 5. Never widen what you don't understand

- Don't add a dependency, a new gate exemption, or a new `--skip-*` flag to make a failing gate pass
  without first understanding *why* it failed. A gate failure is almost always telling you about a
  real property (non-determinism, an unsourced number, a missing approval) that the film actually
  needs — not a false alarm to route around.
- Don't invent facts. `fact-strings-check.mjs` / `history-sources-check.mjs` / `chart-provenance.mjs`
  exist because a number or a claim on screen needs a traceable source (`research/fact_table.md`,
  `src/data/*.json` with a `source`/`url`/`retrieved` field, or an explicit `fictional: true` flag
  that forces an on-screen "illustrative data" label). If you are writing narration, captions, or
  chart data and you don't have a real source, either mark it `fictional: true` or leave it out —
  never fabricate a citation to satisfy the gate.
- Don't quietly reduce a check's strength to make your change pass (loosening a regex, widening a
  fixture's expected range, adding your specific case to an allowlist) without saying so plainly in
  the commit/PR description. A gate exists because something broke once; weakening it silently is how
  it breaks again.

## 6. Style notes specific to this codebase

- CJK text must only use the font families this kit ships (`kit fonts` + `fonts.lock.json`) — never
  let a canvas fall back to a system font. A silent font fallback is a silent style break (see
  `docs/design/why-gates.md`'s font-coverage section); `font-coverage.mjs` exists to catch it before
  it reaches a render.
- Scripts in this kit are plain Node (`.mjs`, ESM, no build step, no transpilation) — match that
  style in anything you add to `packages/kit/`. Python is optional and used only for a user's own
  external tooling (e.g. local whisper alignment); do not reintroduce a Python dependency into the
  kit's own gate/export/doctor pipeline.
- `spawnSync`/`spawn` calls must use `shell: false` and pass args as an array, never a shell string —
  this kit runs on Windows too, where `&&` and `rm` are not valid shell syntax.

---

If something in this file seems to conflict with what a human in the conversation is asking for,
say so explicitly and ask — don't silently pick one. If a gate is failing and you're not sure why,
read the failing check's own script (they are short, commented, and deliberately not clever) before
reaching for a workaround.
