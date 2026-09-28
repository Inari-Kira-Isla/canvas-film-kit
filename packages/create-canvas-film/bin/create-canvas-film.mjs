#!/usr/bin/env node
// create-canvas-film — thin CLI wrapper around canvas-film-kit's own scaffold implementation, so
// `npx create-canvas-film my-film --profile abstract` and `kit new my-film --profile abstract` (the
// same kit, called directly) are exactly the same code path.
//
// K5 fix: this used to import new-film.mjs via a hardcoded relative path assuming
// `packages/create-canvas-film` and `packages/kit` are monorepo siblings on disk
// (`../../kit/scaffold/new-film.mjs`). That only worked inside THIS repo's own working tree — a
// real `npm install create-canvas-film` (or the npm-pack-tarball simulation of one, see
// docs/design/why-file-dependency.md) puts the two packages in unrelated node_modules locations
// with no such relative relationship, so the import would throw MODULE_NOT_FOUND on every real
// install. A normal ES module specifier (`canvas-film-kit/scaffold/new-film.mjs`) resolves through
// standard Node package resolution instead, which finds `canvas-film-kit` correctly in BOTH cases:
// as an npm-workspaces symlink in this monorepo's own node_modules (because `package.json` now lists
// it as a normal `dependencies` entry), and as a real extracted package after a tarball/registry
// install. `canvas-film-kit` has no "exports" field, so a direct subpath specifier resolves straight
// to the file on disk in either case.
import path from 'node:path';
import { scaffold, PROFILES, ScaffoldError } from 'canvas-film-kit/scaffold/new-film.mjs';

const rawArgs = process.argv.slice(2);
// Accept an optional leading "new" keyword so both invocation styles documented above work.
const args = rawArgs[0] === 'new' ? rawArgs.slice(1) : rawArgs;

let target;
let profile;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--profile') profile = args[++i];
  else if (a.startsWith('--profile=')) profile = a.slice('--profile='.length);
  else if (a.startsWith('--')) {
    console.error(`create-canvas-film: unknown flag ${a}`);
    process.exit(1);
  } else if (!target) target = a;
  else {
    console.error(`create-canvas-film: unexpected extra argument: ${a}`);
    process.exit(1);
  }
}
if (!target) {
  console.error(`create-canvas-film: needs a <dir> argument. Usage: create-canvas-film <dir> --profile <${PROFILES.join('|')}>`);
  process.exit(1);
}
if (!profile) {
  console.error(`create-canvas-film: needs --profile. Available: ${PROFILES.join(', ')}`);
  process.exit(1);
}

try {
  const result = scaffold({ target, profile });
  console.log(`create-canvas-film: scaffolded ${result.target} (profile=${result.profile}, driver=${result.axes.driver}, facts=${result.axes.facts}, rubric=${result.axes.rubric})`);
  console.log(`create-canvas-film: ${result.gitMessage}`);
  console.log('\nnext steps:');
  console.log(`  cd ${path.relative(process.cwd(), result.target) || '.'}`);
  console.log('  npm install');
  console.log('  fill in docs/preproduction.md, then add an approved_by: <name> <YYYY-MM-DD> line (the ONE manual step `kit gate` requires)');
  console.log('  edit src/core/timeline.ts (fill T) and src/core/color.ts (fill P, or point it at ../theme.ts) for your real film — the scaffold already ships working example values so `gate`/`export` run before you touch either file');
  console.log('  npm run dev   # then, in another terminal: npm run gate / npm run export');
} catch (e) {
  console.error(`create-canvas-film: ${e.message}`);
  process.exit(e instanceof ScaffoldError ? e.code : 2);
}
