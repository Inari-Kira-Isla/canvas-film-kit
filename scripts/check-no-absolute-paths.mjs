#!/usr/bin/env node
// scripts/check-no-absolute-paths.mjs — repo-level guard against exactly the bug an independent K3
// verifier found (2026-09-28): demos/explainer/package.json + package-lock.json hardcoded
// `"canvas-film-kit": "file:/Users/example-user/dev/canvas-film-kit/packages/kit"` — an absolute,
// machine-specific path. Two problems in one: (1) a personal-path leak (design doc §7.1's own
// release-scan pattern list already bans bare `/Users/` — this is the same class of leak, just in a
// package manifest instead of source), and (2) a real portability bug: `npm install` on any other
// machine/CI fails outright, because the referenced `file:` path does not exist there.
//
// Scope: every package.json and package-lock.json in this monorepo (root, packages/*, demos/*,
// templates/* if any ship one) EXCEPT node_modules/.git. A `file:` dependency must be a RELATIVE
// path (e.g. `file:../../packages/kit`, matching demos/music and demos/abstract's own correct
// usage) — absolute (`file:/...` or Windows `file:C:\...`) is always wrong for a project meant to be
// cloned onto a different machine. Separately, ANY occurrence of `/Users/` anywhere in a
// package.json/package-lock.json (not just inside a `file:` value) is flagged — the same
// personal-path-leak concern as design doc §7.1, just scoped to manifest files for now (the full
// content scan across ALL file types is release-scan.mjs's job, a later K5 batch).
//
// This is meant to fold into K5's scripts/release-scan.mjs verbatim (same pattern-list approach) —
// written standalone now so K4 has an immediate, testable regression guard for the bug that was
// actually found, without waiting on the rest of release-scan's broader scope.
//
// Usage: node check-no-absolute-paths.mjs [rootDir]
// Exit codes: 0 = clean, 1 = at least one absolute path found, 2 = script could not run.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
if (!existsSync(root)) {
  console.error(`check-no-absolute-paths: root not found: ${root}`);
  process.exit(2);
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.cache', '__fixtures__']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name === 'package.json' || name === 'package-lock.json') out.push(p);
  }
  return out;
}

const FILE_ABS_RE = /"file:(\/[^"]*|[A-Za-z]:\\[^"]*)"/g; // file:/... (POSIX) or file:C:\... (Windows)
const USERS_PATH_RE = /\/Users\/[^"'\s]+/g;

const files = walk(root);
const problems = [];
for (const file of files) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(FILE_ABS_RE)) {
    problems.push({ file: rel, kind: 'absolute file: dependency', match: m[0] });
  }
  for (const m of text.matchAll(USERS_PATH_RE)) {
    problems.push({ file: rel, kind: '/Users/ personal path', match: m[0] });
  }
}

console.log(`check-no-absolute-paths: scanned ${files.length} package.json/package-lock.json file(s) under ${root}`);
if (problems.length === 0) {
  console.log('check-no-absolute-paths: [PASS] no absolute file: dependency and no /Users/ path found');
  process.exit(0);
}
console.error(`check-no-absolute-paths: [FAIL] ${problems.length} problem(s):`);
for (const p of problems) console.error(`  ${p.file} — ${p.kind}: ${p.match}`);
process.exit(1);
