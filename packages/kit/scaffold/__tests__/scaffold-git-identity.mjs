#!/usr/bin/env node
// scaffold/__tests__/scaffold-git-identity.mjs — regression test for the CI red (ubuntu-latest /
// windows-latest, v0.2.0) and the matching real-world bug: a brand-new machine (or a CI runner) has
// no git user.name/user.email configured ANYWHERE (no global, no system, no XDG config) and
// `git commit` hard-fails with "Author identity unknown" before scaffold() ever returns.
//
// This simulates "no git identity anywhere" by pointing HOME/USERPROFILE/XDG_CONFIG_HOME at a fresh
// empty directory and forcing GIT_CONFIG_GLOBAL to the platform's null device (so even a real
// ~/.gitconfig on the machine actually running this test is ignored), plus GIT_CONFIG_NOSYSTEM=1 and
// clearing any GIT_AUTHOR_*/GIT_COMMITTER_*/EMAIL env vars a shell might have exported. It then
// asserts scaffold() still succeeds and the first commit was made with the documented fallback
// identity — never by silently mutating the user's own git config.
//
// Usage: node packages/kit/scaffold/__tests__/scaffold-git-identity.mjs
// Exit codes: 0 = every assertion held, 1 = at least one didn't.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../new-film.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
function check(label, cond) {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}`);
  cond ? pass++ : fail++;
}

const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';
const ENV_KEYS_TO_CLEAR = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'EMAIL',
];
const ENV_KEYS_TO_OVERRIDE = ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];

const savedEnv = {};
for (const key of [...ENV_KEYS_TO_CLEAR, ...ENV_KEYS_TO_OVERRIDE]) savedEnv[key] = process.env[key];

const tmp = mkdtempSync(path.join(tmpdir(), 'canvas-film-kit-scaffold-git-identity-'));
const fakeHome = path.join(tmp, 'fake-home'); // fresh dir: guaranteed no .gitconfig / .config/git/config inside it
const target = path.join(tmp, 'test-film');

try {
  for (const key of ENV_KEYS_TO_CLEAR) delete process.env[key];
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome; // Windows equivalent of HOME
  process.env.XDG_CONFIG_HOME = path.join(fakeHome, '.config');
  process.env.GIT_CONFIG_GLOBAL = NULL_DEVICE; // belt-and-suspenders: ignore the REAL machine's global config too
  process.env.GIT_CONFIG_NOSYSTEM = '1'; // ignore any system-level identity (e.g. a CI image that sets one)

  // sanity check the harness itself: new-film.mjs's fix branches on `git config user.name` /
  // `git config user.email` being empty (that's the precondition it actually checks — NOT whether a
  // raw `git commit` would happen to fail, since git also has an OS-username/hostname guessing
  // fallback that succeeds on some machines/OSes and not others, which is exactly the
  // works-on-macOS-fails-on-ubuntu/windows flakiness this fix exists to route around
  // deterministically). Confirm the env override above actually makes both queries empty here —
  // otherwise a PASS below would be meaningless.
  const sanityDir = path.join(tmp, 'sanity');
  spawnSync('git', ['init', '-q', sanityDir]);
  const sanityName = spawnSync('git', ['-C', sanityDir, 'config', 'user.name'], { encoding: 'utf8' });
  const sanityEmail = spawnSync('git', ['-C', sanityDir, 'config', 'user.email'], { encoding: 'utf8' });
  check(
    'harness sanity: `git config user.name`/`user.email` are empty with no identity configured anywhere (env override actually works)',
    sanityName.stdout.trim() === '' && sanityEmail.stdout.trim() === '',
  );

  // ---- the actual regression: scaffold() must succeed anyway, using a fallback identity ----
  let result;
  let threw = null;
  try {
    result = scaffold({ target, profile: 'abstract' });
  } catch (err) {
    threw = err;
  }
  check('scaffold() does not throw when no git identity is configured anywhere', threw === null);

  if (!threw) {
    check('scaffold() still returns the resolved target', result.target === target);
    check('gitMessage documents the fallback identity was used (never silent)', /fallback|scaffold@canvas-film-kit\.invalid/i.test(result.gitMessage ?? ''));
    check('gitMessage tells the user to set their own identity', /git config --global user\.(name|email)/.test(result.gitMessage ?? ''));

    const log = spawnSync('git', ['-C', target, 'log', '-1', '--format=%an <%ae>%n%s'], { encoding: 'utf8' });
    const [authorLine, subjectLine] = (log.stdout || '').split('\n');
    check('first commit author is the documented fallback identity', authorLine === 'canvas-film-kit scaffold <scaffold@canvas-film-kit.invalid>');
    check('first commit subject still contains the machine-readable "scaffold:" proof', /^scaffold:/.test(subjectLine ?? ''));

    // the fallback identity must be scoped to that one commit only — it must NOT have been written
    // into the scaffolded project's own local git config (that would silently override the user's
    // real identity the moment they configure one and make their next commit).
    const localName = spawnSync('git', ['-C', target, 'config', '--local', 'user.name'], { encoding: 'utf8' });
    check('fallback identity was NOT written into the scaffolded project\'s local git config', localName.stdout.trim() === '' || localName.status !== 0);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  for (const key of [...ENV_KEYS_TO_CLEAR, ...ENV_KEYS_TO_OVERRIDE]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}

console.log(`\nscaffold-git-identity: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
