# Contributing to canvas-film-kit

Thanks for considering a contribution. This project is maintained best-effort, as-is — no SLA on
issue response time or PR review turnaround, see `README.md`. That said, contributions are welcome
and this file is here to make them land smoothly.

## Before you start

- **Read `AGENTS.md` first**, even if you're a human — it's the same rules this kit expects of an AI
  coding agent, and they apply to any contribution: `render(t)` must be a pure function, no
  `Math.random`/`Date.now` in scene/component code, hex colours only in `theme.ts`, timestamps only
  through `timeline.ts`.
- For anything beyond a small fix, open an issue first describing what you want to change and why —
  saves everyone a large PR that goes a direction the project isn't taking.
- This kit deliberately has **zero telemetry and no network calls except `kit fonts`/TTS providers**
  (see `SECURITY.md`). A PR that adds any kind of "phone home" behaviour, even opt-in, will be
  declined — this is a hard line, not a preference.

## Every new `kit gate` check needs a `good` AND a `bad` fixture

This is the single most important rule for contributing a new check (a new file under
`packages/kit/gates/`, `packages/kit/narration/`, etc.):

```
packages/kit/gates/__fixtures__/<your-check-name>/
  good/   — a minimal project fragment that SHOULD pass your check
  bad/    — a minimal project fragment that SHOULD FAIL your check, in exactly the way it exists to catch
```

A check with no `bad/` fixture is a check nobody has verified can actually fail — see
`docs/design/why-gates.md` for why every existing check has one. Your PR should include a short note
showing both fixtures actually produce the verdict you expect (paste the command + output, or point
at a test script under `__tests__/` that runs both and asserts on the exit codes).

## Adding a TTS provider

See `packages/kit/tts/provider.mjs`'s interface and `providers/*.mjs` for the existing four. A new
provider must:

- read credentials from `process.env` only — never a bundled or auto-discovered dotfile,
- redact any credential-shaped string from error messages/logs (there's a `redact()` helper; use it),
- declare `requiredEnv` accurately (`doctor` reports presence/absence of these, never their values),
- document its `timingSource` behaviour (`'provider'` if it returns real word-level timestamps,
  `'none'` if callers must fall back to the estimate path).

## Adding a profile

See `docs/design/profiles.md`'s "Adding a profile" section.

## Style

- Plain Node ESM (`.mjs`), no build step, no TypeScript in `packages/kit/` itself (scaffolded
  *projects* use TypeScript; the kit's own scripts do not need it).
- `spawnSync`/`spawn`: always `shell: false`, args as an array — this kit runs on Windows too.
- Comment the *why*, not just the *what* — most files in this repo already do this; match that
  density rather than leaving a change unexplained.

## Running the kit's own checks before you open a PR

```
npm install                              # repo root, npm workspaces
node scripts/check-no-absolute-paths.mjs .
node scripts/release-scan.mjs .
node packages/kit/narration/__tests__/parity-speech-rate.mjs   # SKIPs cleanly without a local Python copy
node packages/kit/tts/__tests__/run-all.mjs
node packages/kit/scaffold/__tests__/scaffold-agent-files.mjs
```

Full gate+export on one of the shipped demos (see each `demos/<profile>/` for the exact commands) is
the closest thing to an end-to-end test this kit has; running one before a PR touching `gates/`,
`render/`, or `scaffold/` is strongly encouraged.

## License

By contributing, you agree your contribution is licensed under this project's MIT license
(`LICENSE`).
