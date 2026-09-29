#!/usr/bin/env node
// scaffold/__tests__/scaffold-agent-files.mjs — asserts `kit new` actually ships the agent-guidance
// files this task exists to add: a fresh scaffold must contain AGENTS.md, CLAUDE.md, and the three
// canvas-film skill files (SKILL.md + its two references/), byte-identical to this repo's own single
// source (see new-film.mjs's AGENT_FILES comment — this is the drift guard that comment promises).
// It also asserts the generated docs/preproduction.md has a `## Kickoff` section with an
// `approved_by_kickoff:` line commented out (never a live line an agent could satisfy by accident).
//
// This is a development-time self-test, like narration/__tests__/parity-speech-rate.mjs — not part
// of `kit gate` and not shipped to a scaffolded project.
//
// Usage: node packages/kit/scaffold/__tests__/scaffold-agent-files.mjs
// Exit codes: 0 = every assertion held, 1 = at least one didn't.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../new-film.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');

let pass = 0;
let fail = 0;
function check(label, cond) {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}`);
  cond ? pass++ : fail++;
}

const tmp = mkdtempSync(path.join(tmpdir(), 'canvas-film-kit-scaffold-test-'));
const target = path.join(tmp, 'test-film');

try {
  const result = scaffold({ target, profile: 'abstract' });
  check('scaffold() returns the resolved target', result.target === target);

  // ---- AGENTS.md / CLAUDE.md / skill files exist and are byte-identical to the single source ----
  const AGENT_FILE_PAIRS = [
    [path.join(REPO_ROOT, 'AGENTS.md'), path.join(target, 'AGENTS.md')],
    [path.join(REPO_ROOT, 'CLAUDE.md'), path.join(target, 'CLAUDE.md')],
    [
      path.join(REPO_ROOT, '.claude', 'skills', 'canvas-film', 'SKILL.md'),
      path.join(target, '.claude', 'skills', 'canvas-film', 'SKILL.md'),
    ],
    [
      path.join(REPO_ROOT, '.claude', 'skills', 'canvas-film', 'references', 'kickoff-questions.md'),
      path.join(target, '.claude', 'skills', 'canvas-film', 'references', 'kickoff-questions.md'),
    ],
    [
      path.join(REPO_ROOT, '.claude', 'skills', 'canvas-film', 'references', 'rubrics.md'),
      path.join(target, '.claude', 'skills', 'canvas-film', 'references', 'rubrics.md'),
    ],
  ];
  for (const [source, copy] of AGENT_FILE_PAIRS) {
    const rel = path.relative(target, copy);
    if (!existsSync(source)) {
      // this repo's own source moved — that's a real failure of this test's own assumptions, not a
      // scaffold bug, but still something to surface loudly rather than silently skip.
      check(`${rel} — source exists at ${path.relative(REPO_ROOT, source)}`, false);
      continue;
    }
    check(`${rel} exists in scaffold`, existsSync(copy));
    if (existsSync(copy)) {
      const same = readFileSync(source, 'utf8') === readFileSync(copy, 'utf8');
      check(`${rel} is byte-identical to the repo-root source (no second drifting copy)`, same);
    }
  }

  // ---- docs/preproduction.md has a Kickoff section + the human-only sign-off line ----
  const preprodPath = path.join(target, 'docs', 'preproduction.md');
  check('docs/preproduction.md exists', existsSync(preprodPath));
  if (existsSync(preprodPath)) {
    const preprod = readFileSync(preprodPath, 'utf8');
    check('docs/preproduction.md has a "## Kickoff" section', /^## Kickoff$/m.test(preprod));
    check('docs/preproduction.md asks all five kickoff questions', ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'].every((q) => preprod.includes(`**${q} —`)));
    check(
      'docs/preproduction.md has approved_by_kickoff: only inside a comment (never a live, agent-fillable line)',
      /<!--[\s\S]*approved_by_kickoff: <name> <YYYY-MM-DD>[\s\S]*-->/.test(preprod) &&
        !/^approved_by_kickoff:\s*\S/m.test(preprod.replace(/<!--[\s\S]*?-->/g, '')),
    );
    check('docs/preproduction.md still keeps the pre-existing approved_by: comment', /approved_by: <name> <YYYY-MM-DD>/.test(preprod));
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nscaffold-agent-files: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
