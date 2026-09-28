# Security policy

## Supported versions

This project ships as-is, best-effort, with no SLA (see `CONTRIBUTING.md`). Security fixes land on
the latest published `main`/release; there is no long-term-support branch.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security-relevant bug (credential handling, a
gate that could be tricked into passing when it shouldn't, a supply-chain concern in a dependency).

Instead, use GitHub's private vulnerability reporting for this repository (Security tab → "Report a
vulnerability"), or open a regular issue asking a maintainer to set up a private channel if that
option isn't available yet. Include:

- what you found and why it's a security concern (not just a bug),
- a minimal reproduction if you have one,
- the version/commit you tested against.

We'll acknowledge within a reasonable time and work with you on a fix before any public disclosure.

## What this kit does and doesn't do with your data

- **No telemetry, ever** (see the design notes / `docs/design/`): this kit never phones home, never
  reports usage, and never uploads anything you render.
- **API keys are read from `process.env` only** — never from a committed file, never from a kit-owned
  dotfile, never logged. If you find a code path that echoes a key value (even partially, even in an
  error message), that's a bug worth reporting under this policy, not just a regular issue.
- **`kit fonts` and TTS providers make outbound network requests** (font downloads, paid/free TTS
  synthesis) — everything else (`doctor`, `gate`, `export`, `stills`, `determinism`, `boundary-diff`)
  runs entirely offline once dependencies are installed and assets are present.
- The `edge` TTS provider talks to an **unofficial**, reverse-engineered Microsoft endpoint (see its
  own file header) using a long-published, non-account constant — not a secret, and not something
  this project can vouch for the long-term availability or terms of.

## Dependency posture

This kit depends on `playwright` (browser automation), `esbuild` (bundling for type-checking),
`fontkit` (font parsing), and `ws` (WebSocket client for the `edge` TTS provider). Run `npm audit` in
your own scaffolded project periodically; this repo's CI runs it too but does not currently fail a
build on advisory severity alone (a human judgment call each time, since audit noise-to-signal varies
a lot release to release).
