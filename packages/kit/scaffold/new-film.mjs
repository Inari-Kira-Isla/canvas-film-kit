// new-film.mjs — the shared scaffolding implementation behind BOTH `kit new` and the separate
// `create-canvas-film` package (so `npx create-canvas-film my-film --profile x` and
// `kit new my-film --profile x` are exactly the same code path, never two copies that can drift).
//
// Copies templates/base/ into a new git repo, writes PROFILE (+ its three axes) into src/config.ts,
// writes a package.json wiring the scaffolded project to THIS kit install (via a `file:` dependency
// — v0.1 ships pre-npm-publish, see the repo's docs/design/why-file-dependency.md), and generates a
// docs/preproduction.md skeleton with the P0 approval line `kit gate`'s story-metrics step hard-checks.
//
// K1 shipped `abstract` only; K2 adds `music` (see PROFILES below). explainer/history/economics
// land in later batches — see docs/design/profiles.md. The first commit's message contains the literal string
// `scaffold:` — a `git log` showing that commit is machine-readable proof this command (and not a
// hand-copy of templates/) was actually used.
//
// Exit codes: 0 = scaffolded, 1 = target dir problem / bad args, 2 = internal error (copy/git failed)
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // .../packages/kit/scaffold
const KIT_PKG_DIR = path.resolve(HERE, '..'); // .../packages/kit
// K5: templates/ used to live at the monorepo root (sibling of packages/), resolved here via
// `path.resolve(KIT_PKG_DIR, '..', '..')`. That only works inside this repo's own working tree — a
// real (or tarball-simulated) npm install of `canvas-film-kit` gives you ONLY what packages/kit's
// package.json "files" array lists, and nothing two directories above it exists at all (there is no
// monorepo there, just this one package under node_modules/). templates/ now lives INSIDE
// packages/kit/ and ships as part of the published package for exactly this reason.
const TEMPLATES_DIR = path.join(KIT_PKG_DIR, 'templates', 'base');

// AGENTS.md / CLAUDE.md / .claude/skills/canvas-film/ (the workflow skill + its references) have
// exactly ONE source of truth: this repo's own root — the same files a contributor working on the
// kit itself reads, and the same ones Claude Code auto-loads in this repo. A scaffolded project gets
// a COPY of them (below, in scaffold()), not a second hand-maintained set living under templates/ —
// two copies of agent-guidance prose are two copies that silently drift the first time one gets
// edited and the other doesn't (`packages/kit/scaffold/__tests__/scaffold-agent-files.mjs` asserts
// the copy is byte-identical to this source, which is what would catch that drift if it ever crept
// back in). This only resolves when the whole repo is on disk next to packages/kit/ — true for both
// ways `kit new`/`create-canvas-film` are actually distributed today (a monorepo dev checkout, or a
// full `npx --yes github:...#tag` clone — see RELEASE_GIT_SPEC's own comment below: there is no
// npm-registry-published, packages/kit-only install yet). If that ever changes, copying these files
// degrades to a WARN + skip (see AGENT_FILES below) — never a hard scaffold failure, since none of
// these files are inputs `kit gate` itself reads.
const REPO_ROOT = path.resolve(KIT_PKG_DIR, '..', '..');
const AGENT_FILES = [
  { from: path.join(REPO_ROOT, 'AGENTS.md'), to: 'AGENTS.md', kind: 'file' },
  { from: path.join(REPO_ROOT, 'CLAUDE.md'), to: 'CLAUDE.md', kind: 'file' },
  { from: path.join(REPO_ROOT, '.claude', 'skills', 'canvas-film'), to: path.join('.claude', 'skills', 'canvas-film'), kind: 'dir' },
];

// I3' fix (2026-09-29 re-review, second pass) — the git spec a scaffolded project's package.json
// depends on when `kit new`/`create-canvas-film` was itself run from an npm-installed copy of this
// kit (see the `usesNodeModulesInstall` branch below). Points at this repo's own root (npm git deps
// cannot target a subdirectory), pinned to the v0.2.1 tag so a scaffold made today keeps working even
// after a later tag changes root package.json's shape. CANVAS_FILM_KIT_GIT_SPEC lets a fork (or this
// re-review's own local-bare-repo test, via `git config --global url.<base>.insteadOf`) override the
// owner/tag without touching this file — unset, it defaults to the real, public release location.
const RELEASE_GIT_SPEC = process.env.CANVAS_FILM_KIT_GIT_SPEC ?? 'github:Inari-Kira-Isla/canvas-film-kit#v0.2.1';

// K1 shipped `abstract` only; K2 added `music` (design doc §3/§9 K2 row — a music-video profile
// driven by beats.json rather than a narrator or fixed cadence). K3 added `explainer`
// (narration-driven, TTS timeline — design doc §9 K3 row). K4 adds `history` (two independent time
// axes, schematic map routes, silhouette portraits, source-tier + disputed-wording checks) and
// `economics` (charts/count-up, dataset provenance) — design doc §9 K4 row. All five profiles this
// kit's design doc names now scaffold; `kit new`'s own generated docs/preproduction.md still only
// gives a generic skeleton (no profile-specific starter scene) — a history/economics project's real
// scene work still starts from the component templates (templates/components/{year-axis,map-route,
// silhouette,split-compare,charts/*,count-up,entity-card,source-footer}.ts) + this kit's own shipped
// demos (demos/history, demos/economics) as worked examples, same as every other profile.
export const PROFILES = ['abstract', 'music', 'explainer', 'history', 'economics'];
const AXES = {
  abstract: { driver: 'none', facts: 'none', rubric: 'abstract' },
  music: { driver: 'music', facts: 'label', rubric: 'music' },
  explainer: { driver: 'narration', facts: 'knowledge', rubric: 'explainer' },
  history: { driver: 'narration', facts: 'history', rubric: 'history' },
  economics: { driver: 'narration', facts: 'data', rubric: 'economics' },
};

export class ScaffoldError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function scaffold({ target, profile }) {
  if (!PROFILES.includes(profile)) {
    throw new ScaffoldError(
      `--profile "${profile}" is not available yet — this kit release only scaffolds: ${PROFILES.join(', ')} ` +
        `(music/explainer/history/economics land in later batches — see docs/design/profiles.md).`,
      1,
    );
  }
  if (!existsSync(TEMPLATES_DIR)) {
    throw new ScaffoldError(`templates/base/ not found at ${TEMPLATES_DIR} — is this kit install complete?`, 2);
  }

  const resolvedTarget = path.resolve(process.cwd(), target);
  if (existsSync(resolvedTarget)) {
    const entries = readdirSync(resolvedTarget);
    if (entries.length > 0) {
      throw new ScaffoldError(`target directory "${resolvedTarget}" already exists and is not empty (${entries.length} entries) — will not overwrite; pick another path or clear it by hand.`, 1);
    }
  }
  mkdirSync(resolvedTarget, { recursive: true });

  // ---- 1. copy templates/base/ ----
  try {
    cpSync(TEMPLATES_DIR, resolvedTarget, { recursive: true });
  } catch (e) {
    throw new ScaffoldError(`copy templates/base/ → ${resolvedTarget} failed: ${e.message}`, 2);
  }

  // ---- 2. write src/config.ts (PROFILE + 3 axes) ----
  const axes = AXES[profile];
  const configPath = path.join(resolvedTarget, 'src/config.ts');
  if (!existsSync(configPath)) throw new ScaffoldError(`copy succeeded but ${configPath} is missing — templates/base/src/config.ts moved?`, 2);
  {
    let src = readFileSync(configPath, 'utf8');
    const replace = (re, line) => {
      if (!re.test(src)) throw new ScaffoldError(`src/config.ts has no match for pattern ${re} — templates/base changed shape, update scaffold/new-film.mjs alongside it.`, 2);
      src = src.replace(re, line);
    };
    replace(/export const PROFILE:[^\n]*\n/, `export const PROFILE: 'abstract' | 'info-narrative' | 'music' | 'explainer' | 'history' | 'economics' = '${profile}';\n`);
    replace(/export const DRIVER:[^\n]*\n/, `export const DRIVER: 'music' | 'narration' | 'none' = '${axes.driver}';\n`);
    replace(/export const FACTS:[^\n]*\n/, `export const FACTS: 'none' | 'label' | 'knowledge' | 'history' | 'data' = '${axes.facts}';\n`);
    replace(/export const RUBRIC:[^\n]*\n/, `export const RUBRIC: 'abstract' | 'info-narrative' | 'music' | 'explainer' | 'history' | 'economics' = '${axes.rubric}';\n`);
    writeFileSync(configPath, src);
  }

  // ---- 2.5. rename .template.ts files to their real names + fix every cross-reference ----
  // K1 shipped `color.template.ts`/`timeline.template.ts` as-is, requiring the user to rename them
  // by hand (and fix the ~5 import statements across main.ts/draw.ts/texture.ts/scenes/theme.ts
  // that pointed at the .template.ts names) before `kit gate` would even run — a K1 verifier
  // (2026-09-28) correctly flagged this as "not turnkey": a fresh scaffold could not reach a
  // passing `gate` with only the documented steps. Doing the rename + reference fix HERE, at
  // scaffold time, means a fresh project ships with real `.ts` files and working imports from the
  // start — `approved_by:` in docs/preproduction.md remains the ONE deliberate manual step (a
  // human sign-off is the entire point of that gate, see story-metrics.mjs's own file header).
  const templateRenames = [
    ['src/core/color.template.ts', 'src/core/color.ts'],
    ['src/core/timeline.template.ts', 'src/core/timeline.ts'],
  ];
  for (const [fromRel, toRel] of templateRenames) {
    const fromAbs = path.join(resolvedTarget, fromRel);
    const toAbs = path.join(resolvedTarget, toRel);
    if (!existsSync(fromAbs)) continue; // templates/base changed shape — don't hard-fail a scaffold over it
    let src = readFileSync(fromAbs, 'utf8');
    // strip the "FILL IN — rename me" header line now that the rename has actually happened
    src = src.replace(/^\/\/ FILL IN — rename to [^\n]*\n(\/\/\n)?/, '');
    writeFileSync(toAbs, src);
    rmSync(fromAbs);
  }
  // fix every `'...color.template'` / `'...timeline.template'` import specifier left pointing at
  // the old names, across every .ts file the copy produced (main.ts, core/*, scenes/*, theme.ts).
  const REF_FIXES = [
    [/(['"][./]*core\/color)\.template(['"])/g, '$1$2'],
    [/(['"]\.\/color)\.template(['"])/g, '$1$2'],
    [/(['"][./]*core\/timeline)\.template(['"])/g, '$1$2'],
    [/(['"]\.\/timeline)\.template(['"])/g, '$1$2'],
  ];
  function walkTs(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walkTs(p, out);
      else if (name.endsWith('.ts')) out.push(p);
    }
    return out;
  }
  for (const file of walkTs(path.join(resolvedTarget, 'src'))) {
    let src = readFileSync(file, 'utf8');
    let changed = false;
    for (const [re, replacement] of REF_FIXES) {
      if (re.test(src)) {
        src = src.replace(re, replacement);
        changed = true;
      }
    }
    if (changed) writeFileSync(file, src);
  }

  // ---- 2.6. AGENTS.md / CLAUDE.md / .claude/skills/canvas-film/ (single source: repo root) ----
  // See AGENT_FILES's own comment above for why this copies rather than duplicating a second set
  // under templates/. Best-effort: a project scaffolded from a hypothetical future packages/kit-only
  // npm install (not how v0.1/v0.2 are distributed) would find nothing at REPO_ROOT — WARN and skip
  // rather than fail the whole scaffold over files `kit gate` never reads.
  const missingAgentSource = AGENT_FILES.find((f) => !existsSync(f.from));
  if (missingAgentSource) {
    console.error(
      `kit new: WARN: ${path.relative(REPO_ROOT, missingAgentSource.from)} not found at ${missingAgentSource.from} — ` +
        `skipping AGENTS.md/CLAUDE.md/.claude/skills copy (this kit install doesn't have the full repo on disk; ` +
        `see scaffold/new-film.mjs's AGENT_FILES comment). The scaffolded project will not have agent guidance files.`,
    );
  } else {
    for (const { from, to, kind } of AGENT_FILES) {
      const dest = path.join(resolvedTarget, to);
      if (kind === 'dir') {
        cpSync(from, dest, { recursive: true });
      } else {
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(from, dest);
      }
    }
  }

  // ---- 3. package.json (wires this scaffold to the kit install that scaffolded it) ----
  // K5: a `node_modules` segment anywhere in KIT_PKG_DIR means this kit was consumed as an installed
  // npm dependency (registry install, tarball install, or an npm-workspaces symlink into some OTHER
  // project's node_modules) rather than being run from inside its own monorepo checkout — see the
  // `dependencies` block below for why that distinction matters.
  const usesNodeModulesInstall = KIT_PKG_DIR.split(path.sep).includes('node_modules');
  let kitOwnVersion = '0.0.0';
  try {
    kitOwnVersion = JSON.parse(readFileSync(path.join(KIT_PKG_DIR, 'package.json'), 'utf8')).version ?? kitOwnVersion;
  } catch { /* best-effort only — falls back to a semver range no real release will ever match, so a  broken version-read fails loudly (npm install 404) rather than silently */ }
  const pkgName = path.basename(resolvedTarget).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'canvas-film';
  const packageJson = {
    name: pkgName,
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview',
      typecheck: 'tsc --noEmit',
      doctor: 'kit doctor',
      gate: 'kit gate',
      export: 'kit export',
      stills: 'kit stills',
      determinism: 'kit determinism',
      'boundary-diff': 'kit boundary-diff',
      fonts: 'kit fonts',
    },
    dependencies: {
      // K5: KIT_PKG_DIR living inside a `node_modules/` directory means THIS scaffold command was
      // itself resolved through a real (or tarball-simulated) npm install of canvas-film-kit — in
      // that case a scaffolded project must get something a fresh `npm install` on ANY machine can
      // resolve, never the absolute path of whatever machine happened to run `kit new`/
      // `create-canvas-film` (that path is meaningless, and often private, on any other machine —
      // see docs/design/why-file-dependency.md). Only the monorepo dev-checkout case (this kit's own
      // packages/kit, scaffolding a demo or a throwaway local test film) still uses `file:` — that
      // absolute path is at least locally correct and is the one case
      // docs/design/why-file-dependency.md's caveats still apply to.
      //
      // I3' fix (2026-09-29 re-review, second pass): this used to write a bare semver range
      // (`^${kitOwnVersion}`) for the node_modules-install case, on the assumption that by the time
      // anyone hit that branch, `canvas-film-kit` would already be a published npm package — but
      // this kit ships v0.1 GitHub-only, on purpose, with NO npm registry publish planned (see repo
      // root README "Releasing"). A semver range with nothing on the registry 404s on `npm install`
      // every single time (or worse, silently installs an unrelated same-named package if one ever
      // gets squatted) — see the README's own GitHub-install quick start this exists to make work.
      // Root package.json (this repo's own root, NOT packages/kit) is what actually gets fetched by
      // a git dependency — npm's git-dependency spec has no subdirectory selector, so the whole
      // repo is packed as one unit; that is why RELEASE_GIT_SPEC below points at the repo root and
      // why root package.json's own `dependencies` (not just packages/kit's) must list esbuild/
      // playwright/ws/fontkit — see root package.json's own comment on that field.
      'canvas-film-kit': usesNodeModulesInstall ? RELEASE_GIT_SPEC : `file:${KIT_PKG_DIR}`,
    },
    devDependencies: {
      typescript: '^5.6.0',
      vite: '^6.0.0',
    },
  };
  writeFileSync(path.join(resolvedTarget, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n');

  // ---- 4. docs/preproduction.md skeleton (the P0 approval line kit gate hard-checks) ----
  const today = new Date().toISOString().slice(0, 10);
  const preprod = `# ${path.basename(resolvedTarget)} — pre-production (P0)

> Scaffolded ${today} by \`kit new --profile ${profile}\` (driver=${axes.driver}, facts=${axes.facts}, rubric=${axes.rubric}).
> Fuller per-profile guidance lands with the profile itself (docs/design/preproduction.md covers
> what exists so far) — this file only carries what \`kit gate\`'s story-metrics step hard-checks
> today: the sign-off line below.

## Logline

> TODO — one sentence: what is this film about, and why does it exist?

## Kickoff

> Answer these five before writing any scene — see
> [\`kickoff-questions.md\`](../.claude/skills/canvas-film/references/kickoff-questions.md) for the
> full guide (recommended defaults, what rework each answer prevents). Put the user's own words
> under each question; the agent asks, the human answers.

**Q1 — What is this film mainly about?**

> TODO

**Q2 — What should the film move with — a song, a voice, or just the pictures?**

> TODO (this profile's default: driver=${axes.driver})

**Q3 — Will numbers, dates, or names appear on screen? If so, where do they come from?**

> TODO (this profile's default: facts=${axes.facts})

**Q4 — How long a sample first, and when? What's the longest the full film can be?**

> TODO

**Q5 — Where will people watch it — phone held upright, or wide on a laptop/TV?**

> TODO

<!--
approved_by_kickoff records that the DIRECTION (the five answers above) is approved — filled in by
the human, never the agent, exactly like approved_by below (see AGENTS.md §4 / kickoff-questions.md's
own "Sign-off" section). Add exactly one line below, in this exact shape, once the user has actually
answered all five:
approved_by_kickoff: <name> <YYYY-MM-DD>
-->

## Notes

> TODO — anything a reviewer should know before approving: intended duration, audience, any facts
> that will need a source once this project outgrows the \`abstract\` profile.

<!--
approved_by is the ONE thing scripts/story-metrics.mjs (via \`kit gate\`) hard-checks: no line here
(or a placeholder name like "test"/"tbd"/"todo") blocks the gate, so nothing can be exported.
Add exactly one line below, in this exact shape, once a human has actually looked at the plan:
approved_by: <name> <YYYY-MM-DD>
-->
`;
  mkdirSync(path.join(resolvedTarget, 'docs'), { recursive: true });
  writeFileSync(path.join(resolvedTarget, 'docs/preproduction.md'), preprod);

  // ---- 5. .gitignore ----
  writeFileSync(
    path.join(resolvedTarget, '.gitignore'),
    [
      'node_modules/',
      'dist/',
      'out/',
      '.cache/', // tts/provider.mjs's content-hash synthesis cache (K3) — disposable, and its meta
      // JSON records this machine's absolute wav path, which must never be committed.
      'qa/*.json',
      'qa/*.jsonl',
      // qa/gate_skips.jsonl is the one exception: an append-only audit log of every `--skip-gate`
      // use. Unlike gate.json/determinism.json/boundary-diff.json (regenerated every run, fine to
      // gitignore), a skip record is a one-time event with no other trace — if it isn't committed,
      // a fresh clone or a different machine can never see that someone bypassed the gate.
      '!qa/gate_skips.jsonl',
      '*.mp4',
      '.DS_Store',
      // I6 fix (2026-09-29 publish review): README tells users to run TTS providers with
      // `node --env-file=.env` (an OPENAI_API_KEY/MINIMAX_API_KEY etc. would live there) — but this
      // scaffold used to NOT gitignore `.env`, and step 6 below runs `git init` + a first commit
      // automatically, so a user following the README verbatim could commit a real API key on their
      // very first commit. `.env.*` also covers `.env.local`/`.env.production` etc.
      '.env',
      '.env.*',
      '',
    ].join('\n'),
  );

  // ---- 6. git init + first commit (the machine-readable "scaffold was used" proof) ----
  function git(args) {
    return spawnSync('git', args, { cwd: resolvedTarget, encoding: 'utf8' });
  }
  let gitMessage;
  if (existsSync(path.join(resolvedTarget, '.git'))) {
    gitMessage = 'target is already a git repo, skipped git init (existing history left alone).';
  } else {
    let kitVersion = 'unknown';
    try {
      const pkg = JSON.parse(readFileSync(path.join(KIT_PKG_DIR, 'package.json'), 'utf8'));
      kitVersion = pkg.version ?? 'unknown';
    } catch { /* best-effort only */ }
    const init = git(['init', '-q']);
    if (init.status !== 0) throw new ScaffoldError(`git init failed: ${init.stderr}`, 2);
    git(['add', '-A']);
    const commitMsg = `scaffold: canvas-film-kit@${kitVersion} profile=${profile}`;

    // I4 fix (2026-09-29, CI red on ubuntu/windows + real "fresh machine" bug report): a brand-new
    // machine (or a CI runner) has no git user.name/user.email configured anywhere — global, system,
    // or local — and `git commit` hard-fails with "Author identity unknown" before this scaffold ever
    // gets a chance to hand back a useful project. We check for that specific condition (both name AND
    // email genuinely unset, not just unreadable) and, ONLY for this one commit, pass a fallback
    // identity via `git -c` — this never touches the user's global/system config, so their own git
    // identity (once they set one) is completely unaffected on every later commit they make. We do NOT
    // silently keep using the fallback identity going forward — we print a one-line hint so the user
    // sets their own identity before their next real commit.
    const hasName = git(['config', 'user.name']).stdout.trim().length > 0;
    const hasEmail = git(['config', 'user.email']).stdout.trim().length > 0;
    const FALLBACK_NAME = 'canvas-film-kit scaffold';
    const FALLBACK_EMAIL = 'scaffold@canvas-film-kit.invalid';
    const commitArgs = ['commit', '-q', '-m', commitMsg];
    let usedFallbackIdentity = false;
    if (!hasName || !hasEmail) {
      usedFallbackIdentity = true;
      commitArgs.unshift('-c', `user.email=${FALLBACK_EMAIL}`);
      commitArgs.unshift('-c', `user.name=${FALLBACK_NAME}`);
    }
    const commit = git(commitArgs);
    if (commit.status !== 0) {
      throw new ScaffoldError(`git commit failed (is git user.name/user.email configured?): ${commit.stderr}${commit.stdout}`, 2);
    }
    gitMessage = `git init + first commit — "${commitMsg}"`;
    if (usedFallbackIdentity) {
      gitMessage += `\nNote: no git user.name/user.email was configured on this machine, so the first commit was made as "${FALLBACK_NAME} <${FALLBACK_EMAIL}>" (this project's local git config was NOT changed). Run \`git config --global user.name "Your Name"\` and \`git config --global user.email you@example.com\` before your next commit.`;
    }
  }

  return { target: resolvedTarget, profile, axes, gitMessage };
}
