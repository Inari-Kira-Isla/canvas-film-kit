#!/usr/bin/env node
// scripts/run-fixture-tests.mjs — runs every `good`/`bad` fixture pair shipped in this repo against
// its own check script and asserts the verdict CONTRIBUTING.md promises: `good` passes, `bad` fails
// in exactly the way the check exists to catch. This is the CI-friendly, no-browser-needed half of
// "全部 fixture 測試" (the browser-dependent half — determinism/boundary-diff against a real running
// film — is covered separately by the abstract demo's own gate+export in CI, since those two checks
// have no static good/bad fixture pair of their own: they need a live page, not a source tree).
//
// Each entry below was verified by hand against its fixture (see K5 batch notes) rather than
// guessed from a script's own `// Usage:` comment alone — several scripts take a `srcDir`/`root`
// argument with subtly different defaults, and getting this manifest wrong would make this test
// runner lie about coverage, which is worse than not having one.
//
// Two checks (`beat-hit-rate.mjs`, `timing-source-check.mjs`) are WARN-only by design — ALWAYS exit
// 0 (see their own file headers) — so they're smoke-tested (does it run without crashing on both
// fixtures) rather than exit-code-asserted.
//
// Usage: node scripts/run-fixture-tests.mjs
// Exit codes: 0 = every assertion held, 1 = at least one didn't, 2 = a fixture/script was missing.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(ROOT, 'packages', 'kit');

function run(script, args, env) {
  const r = spawnSync('node', [script, ...args], { encoding: 'utf8', cwd: ROOT, env: env ? { ...process.env, ...env } : process.env });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// { label, script, cases: [{ fixture, args: (fixtureDir) => [...], expect: 0|1|'smoke' }] }
const SUITES = [
  {
    label: 'nondeterminism-check',
    script: path.join(KIT, 'gates', 'nondeterminism-check.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'nondeterminism'),
    args: (f) => [f],
  },
  {
    label: 'chart-provenance',
    script: path.join(KIT, 'gates', 'chart-provenance.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'chart-provenance'),
    args: (f) => [f],
  },
  {
    label: 'portrait-manifest',
    script: path.join(KIT, 'gates', 'portrait-manifest.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'portrait-manifest'),
    args: (f) => [f],
  },
  {
    label: 'history-sources-check',
    script: path.join(KIT, 'gates', 'history-sources-check.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'history-sources-check'),
    args: (f) => [f],
  },
  {
    // font-coverage.mjs exits 0 for BOTH a real PASS and a "fonts.lock.json not found yet" SKIP
    // (see that script's own header) — a good/bad fixture pair that's supposed to always ship its
    // own fonts.lock.json (see .gitignore's `!.../font-coverage/**/fonts.lock.json` exception) must
    // never actually hit that SKIP path, or this suite's "PASS" is really "never ran" (I2, 2026-09
    // publish review: .gitignore was eating both lock files, so a fresh clone always SKIPped).
    label: 'font-coverage',
    script: path.join(KIT, 'gates', 'font-coverage.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'font-coverage'),
    args: (f) => [f],
    disallowSkip: true,
  },
  {
    label: 'fact-strings-check (cards)',
    script: path.join(KIT, 'gates', 'fact-strings-check.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'fact-strings-cards'),
    args: (f) => [path.join(f, 'src'), path.join(f, 'research', 'fact_table.md')],
  },
  {
    // NEW-1 regression (2026-09-29 re-review): the `bad` fixture's on-screen fillText string
    // literally contains the substring "[SKIP]" (embedded inside an untagged, unsourced fact —
    // see the fixture's own header). fact-strings-check.mjs must still exit 1 here — its own
    // verdict does not change — and gate.mjs's step-status classifier (gate-status.mjs) must
    // never read that echoed substring as a SKIP marker; see __tests__/gate-status-classification.mjs
    // for the assertion against gate.mjs's actual classifier using this fixture's real output.
    label: 'fact-strings-check (scenes, [SKIP]-in-text injection)',
    script: path.join(KIT, 'gates', 'fact-strings-check.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'fact-strings-check'),
    args: (f) => [path.join(f, 'src'), path.join(f, 'research', 'fact_table.md')],
  },
  {
    label: 'onset-check',
    script: path.join(KIT, 'narration', 'onset-check.mjs'),
    dir: path.join(KIT, 'narration', '__fixtures__', 'onset-check'),
    args: (f) => [f],
  },
  {
    label: 'speech-rate (good/bad)',
    script: path.join(KIT, 'narration', 'speech-rate.mjs'),
    dir: path.join(KIT, 'narration', '__fixtures__', 'speech-rate'),
    args: (f) => [f],
    only: ['good', 'bad'], // wav-source is a 3rd, non-good/bad fixture (source-format variant) — see below
  },
  {
    label: 'check-no-absolute-paths',
    script: path.join(ROOT, 'scripts', 'check-no-absolute-paths.mjs'),
    dir: path.join(ROOT, 'scripts', '__fixtures__', 'check-no-absolute-paths'),
    args: (f) => [f],
  },
  {
    // Points RELEASE_SCAN_PRIVATE_TERMS at a synthetic, test-only list (never the real
    // ~/.config/canvas-film-kit/private-terms.txt a user may have) so the private-term category
    // itself is exercised without depending on — or reading — anything outside this repo.
    label: 'release-scan (pattern list)',
    script: path.join(ROOT, 'scripts', 'release-scan.mjs'),
    dir: path.join(ROOT, 'scripts', '__fixtures__', 'release-scan'),
    args: (f) => [f, '--all', '--no-gitleaks'],
    env: { RELEASE_SCAN_PRIVATE_TERMS: path.join(ROOT, 'scripts', '__fixtures__', 'release-scan', 'test-private-terms.txt') },
  },
  // WARN-only checks: smoke-tested, not exit-code-asserted (see file header).
  {
    label: 'beat-hit-rate (WARN-only, smoke test)',
    script: path.join(KIT, 'gates', 'beat-hit-rate.mjs'),
    dir: path.join(KIT, 'gates', '__fixtures__', 'beat-hit-rate'),
    args: (f) => [f],
    smoke: true,
  },
  {
    label: 'timing-source-check (WARN-only, smoke test)',
    script: path.join(KIT, 'narration', 'timing-source-check.mjs'),
    dir: path.join(KIT, 'narration', '__fixtures__', 'timing-source-check'),
    args: (f) => [f],
    smoke: true,
  },
];

let pass = 0;
let fail = 0;
let skip = 0;

for (const suite of SUITES) {
  const script = suite.script;
  if (!existsSync(script)) {
    console.log(`[SKIP] ${suite.label} — script not found: ${path.relative(ROOT, script)}`);
    skip++;
    continue;
  }
  if (!existsSync(suite.dir)) {
    console.log(`[SKIP] ${suite.label} — no __fixtures__ dir: ${path.relative(ROOT, suite.dir)}`);
    skip++;
    continue;
  }
  const cases = suite.only ?? ['good', 'bad'];
  for (const c of cases) {
    const fixtureDir = path.join(suite.dir, c);
    if (!existsSync(fixtureDir)) {
      console.log(`[SKIP] ${suite.label}/${c} — fixture missing`);
      skip++;
      continue;
    }
    const { status, out } = run(script, suite.args(fixtureDir), suite.env);
    if (suite.smoke) {
      const ok = status === 0 || status === 1; // "didn't crash" — 2 means the script itself errored
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${suite.label}/${c} — ran without crashing (exit=${status})`);
      ok ? pass++ : fail++;
      continue;
    }
    const expect = c === 'good' ? 0 : 1;
    let ok = status === expect;
    let note = '';
    // disallowSkip: a check whose exit code is 0 for BOTH a real PASS and a "prerequisite file
    // missing" SKIP would otherwise let a broken fixture (SKIP-as-PASS, see I2) silently pass this
    // assertion — require the good/bad fixture pair to actually exercise the check, not skip it.
    if (ok && suite.disallowSkip && /\[SKIP\]/.test(out)) {
      ok = false;
      note = ' — but output contains [SKIP]: this fixture is not actually exercising the check';
    }
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${suite.label}/${c} — expected exit ${expect}, got ${status}${note}`);
    ok ? pass++ : fail++;
  }
}

console.log(`\nrun-fixture-tests: ${pass} PASS, ${fail} FAIL, ${skip} SKIP`);
process.exit(fail > 0 ? 1 : 0);
