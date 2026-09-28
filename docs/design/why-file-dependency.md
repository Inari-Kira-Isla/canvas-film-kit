# Why scaffolded projects don't depend on a published npm package (v0.1)

`canvas-film-kit` is **not published to the npm registry, and there is no plan to publish it** — v0.1
ships GitHub-only (see the repo root README's "Quick start"). `kit new` writes one of two
`dependencies` entries into every scaffolded project's `package.json`, depending on how `kit new`
itself was invoked:

```json
"dependencies": { "canvas-film-kit": "file:/absolute/path/to/canvas-film-kit/packages/kit" }
```
— when `kit new` was run directly from a `git clone` of this repo's own working tree (see
`packages/kit/scaffold/new-film.mjs`'s `usesNodeModulesInstall` check: the running script's own path
has no `node_modules` segment in it). The absolute path is real but specific to the machine that ran
the scaffold command — it is not meant to be committed and shared as-is across machines.

```json
"dependencies": { "canvas-film-kit": "github:Inari-Kira-Isla/canvas-film-kit#v0.1.2" }
```
— when `kit new` was itself resolved through an npm/npx install of this kit (e.g. the README's
`npx --yes github:Inari-Kira-Isla/canvas-film-kit#v0.1.2 new ...` quick start) — a bare semver range
here would 404 forever (or worse, silently resolve to an unrelated same-named package if one is ever
registered) since there is nothing on the registry to satisfy it. npm's git-dependency spec has no
subdirectory selector, so this points at the **repo root**, not `packages/kit/` — which is exactly
why root `package.json` (not just `packages/kit/package.json`) declares `esbuild`/`playwright`/`ws`/
`fontkit` as its own `dependencies`: whichever of these two forms gets written, the fetched package
needs to carry its own runtime dependencies so a plain `npm install` in the scaffolded project
resolves everything without touching the npm registry for `canvas-film-kit` itself.

Two things worth knowing if you hit surprises:

1. **npm may symlink, not copy, a `file:` dependency.** For a local absolute-path `file:` target, npm
   commonly installs it as a symlink into `node_modules/canvas-film-kit` rather than copying the
   files. That means Node's module resolution (which follows the realpath unless
   `--preserve-symlinks` is set) walks up from the **original kit checkout's own directory**, not
   from the scaffolded project's `node_modules`. Practically: the kit checkout itself (this repo)
   needs its own `npm install` run at least once (`npm install` at the monorepo root, which uses npm
   workspaces to install `packages/kit`'s dependencies) — otherwise a gate step that needs `esbuild`
   (story-metrics.mjs) will fail to resolve it even though the scaffolded project's own
   `node_modules/esbuild` exists.
2. **The `github:...#v0.1.2` form is pinned to a tag on purpose.** A scaffold made today keeps
   resolving the same tree even after a later tag changes root `package.json`'s shape. Forking this
   kit under a different GitHub owner? Set `CANVAS_FILM_KIT_GIT_SPEC` (see `new-film.mjs`) rather than
   editing this file.
