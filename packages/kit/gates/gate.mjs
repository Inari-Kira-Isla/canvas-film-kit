#!/usr/bin/env node
// gate.mjs — aggregates every MECHANICAL pre-export check into one command + one machine-readable
// report (qa/gate.json). scripts/export-mp4.mjs calls this before rendering a single frame — export
// is the one step in the whole film nobody skips, because without it there is no deliverable, so it
// is the natural choke point. Nothing here judges story quality — that is the project owner's
// `approved_by:` + an independent human rubric review; every item below is something a script can
// decide without taste.
//
// As of K4 this kit ships all five profiles (abstract/music/explainer/history/economics — see the
// design doc's batch table). Every step below already SKIPs cleanly when its inputs don't exist yet
// (e.g. `research/fact_table.md`), so a fresh scaffold in any profile never sees a spurious FAIL for
// content it hasn't written yet.
//
// Steps, always run in this order, ALL of them even after an early failure (so one `kit gate` shows
// the whole picture in one pass instead of one failure at a time):
//   1. typecheck                  — tsc --noEmit
//   2. grep gate: hex             — no `#RRGGBB` literal in src/scenes (must go through P, see
//                                    src/core/color.template.ts / timeline hand-off contract)
//   3. grep gate: seg(t, N)       — no hardcoded second value in src/scenes (must go through T)
//   3b. nondeterminism-check.mjs  — no Math.random/Date.now/performance.now in scenes/components
//   4. story-metrics.mjs          — approved_by hard check + red-light story-shape alarms
//   5. fact-strings-check.mjs     — PROFILE !== 'abstract' AND research/fact_table.md exists (also
//                                    scans src/content/*.json card tables — K4)
//   5b. beat-hit-rate.mjs         — music only, never FAILs (WARN only)
//   5c. timing-source-check/speech-rate/onset-check — narration-driven profiles (explainer/history/
//                                    economics — K4 widened this from explainer-only)
//   5g. claim-usage.mjs           — PROFILE !== 'abstract' AND research/fact_table.md exists, same
//                                    gating as step 5 (K6) — every declared claim must be used
//                                    somewhere, not just every USED claim declared (fact-strings-check
//                                    already covers that direction).
//   5d. history-sources-check.mjs / portrait-manifest.mjs — history only (K4)
//   5e. chart-provenance.mjs      — economics only (K4)
//   5f. font-coverage.mjs         — all profiles, once fonts.lock.json exists (K4)
//   6. determinism.mjs            — needs a running dev/preview server (Playwright + real Chrome)
//   7. boundary-diff.mjs          — same server
//   8. font-size-check.mjs        — narration-driven profiles (explainer/history/economics — K6),
//                                    once qa/font-size-check.config.json exists. Needs the SAME
//                                    server as steps 6/7 (captures a real still via scripts/stills.mjs).
//   9. audio-diag.mjs             — narration-driven profiles, once audio/mix.wav exists (the file
//                                    `narration/build-mix.mjs` writes — K6).
//
// determinism/boundary-diff need a real page. Pass --url <url> or set FILM_URL; gate.mjs tries to
// reach it with a short fetch first — if unreachable, both steps are marked FAIL (not silently
// SKIPPED: missing evidence is a failure, per the whole point of this script existing).
// --no-server-checks explicitly demotes 6/7/8 to SKIP (documented opt-out, e.g. CI without a browser)
// — every use of this flag is written into qa/gate.json so a reviewer can see it was used.
//
// Usage: node gate.mjs [--url <url>] [--no-server-checks]
// Exit codes: 0 = every step PASS/SKIP, 1 = at least one FAIL, 2 = gate.mjs itself couldn't run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { classifyStepStatus } from './gate-status.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)); // .../canvas-film-kit/gates
const scriptsDir = path.resolve(here, '..', 'scripts'); // .../canvas-film-kit/scripts
const narrationDir = path.resolve(here, '..', 'narration'); // .../canvas-film-kit/narration (K3)
const root = process.cwd();

const argv = process.argv.slice(2);
let urlArg;
let noServerChecks = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--url') urlArg = argv[++i];
  else if (argv[i] === '--no-server-checks') noServerChecks = true;
  else {
    console.error(`gate: unknown flag ${argv[i]}`);
    process.exit(2);
  }
}
const FILM_URL = urlArg ?? process.env.FILM_URL ?? 'http://localhost:5173/?paused';

const steps = [];
function record(name, status, detail, ms) {
  steps.push({ name, status, detail, ms });
  const tag = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`\n=== gate: [${tag}] ${name} (${ms}ms) ===`);
  if (detail) console.log(detail.trimEnd());
}
// Timeouts sized off real measured runs against a full-length (~180s) film, not guessed — local
// checks (typecheck/grep-gates/story-metrics/fact-strings) measured well under a few seconds on a
// small scaffold; determinism/boundary-diff scale with DURATION and boundary count, so the
// server-step budget uses a wide multiple to cover a much longer real project's film.
const LOCAL_STEP_TIMEOUT_MS = 60_000;
const SERVER_STEP_TIMEOUT_MS = 180_000;

function run(cmd, args, opts = {}) {
  const t0 = Date.now();
  const timeout = opts.timeout ?? LOCAL_STEP_TIMEOUT_MS;
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts, timeout });
  const ms = Date.now() - t0;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // r.status is `null` both when the process was killed by a signal (crash, OOM/jetsam SIGKILL,
  // node's own `timeout` option firing as SIGTERM) and when it never started (r.error set, e.g.
  // ENOENT). Any non-zero-or-unknown outcome must FAIL loud here; only an actual `status === 0`
  // counts as PASS — a silently-killed sub-check must never read back as PASS.
  let code;
  let note = '';
  if (typeof r.status === 'number') {
    code = r.status;
  } else if (r.signal) {
    code = 2;
    note = `\n[gate] sub-process was killed by signal ${r.signal} (possibly a ${timeout}ms timeout, OOM/jetsam, or its own crash) — counted as FAIL, never PASS.`;
  } else if (r.error) {
    code = 2;
    note = `\n[gate] sub-process failed to start: ${r.error}`;
  } else {
    code = 2;
    note = '\n[gate] sub-process reported no status/signal/error — unknown failure, counted as FAIL.';
  }
  return { code, out: out + note, ms, error: r.error, signal: r.signal };
}
// Resolve typescript's own CLI entry file (not the node_modules/.bin/tsc shim) so we can hand it
// straight to `node` — see the typecheck step below for why the shim itself is unsafe here.
function resolveTscCliScript(root) {
  try {
    const req = createRequire(path.join(root, 'package.json'));
    return req.resolve('typescript/bin/tsc');
  } catch {
    return null;
  }
}
function resolveGateScript(rel) {
  return path.join(here, rel);
}
function resolveRuntimeScript(rel) {
  return path.join(scriptsDir, rel);
}
function resolveNarrationScript(rel) {
  return path.join(narrationDir, rel);
}

// ------------------------------------------------------------------------------------ 1. typecheck
// Windows bug (2026-09-29 CI, run 36463774651): `node_modules/.bin/tsc` is a shell shim
// (`tsc.cmd`/`tsc.ps1` on Windows, not a directly-executable `tsc`) — spawnSync with shell:false
// (required by AGENTS.md §6) can't launch a .cmd file directly and fails with ENOENT before
// typecheck ever runs, silently or not depending on how the caller treats a start failure (`run()`
// here correctly counts it as FAIL, never PASS — but the point is not to hit this at all). Instead
// resolve typescript's own CLI script (`typescript/bin/tsc`, a plain .js file) via `createRequire`
// rooted at the target project's package.json, and hand it to `node` directly — identical behavior
// on every OS, no shim, no shell needed. Falls back to `npx` only if typescript can't be resolved
// at all (e.g. not installed), which should not happen in normal use since it's a devDependency of
// every scaffolded project.
{
  const tscCliScript = resolveTscCliScript(root);
  const r = tscCliScript ? run(process.execPath, [tscCliScript, '--noEmit']) : run('npx', ['--no-install', 'tsc', '--noEmit']);
  record('typecheck', r.code === 0 ? 'PASS' : 'FAIL', r.out || (r.error ? String(r.error) : ''), r.ms);
}

// ------------------------------------------------------------------------------------ 2+3. grep gates
{
  const r = run('node', [resolveGateScript('grep-gates-check.mjs'), path.join(root, 'src/scenes')]);
  record('grep-gates (hex + seg-hardcoded-seconds)', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
}

// ------------------------------------------------------------------------------ 3b. nondeterminism grep
// K2 addition (2026-09-28, K1 verifier finding): Math.random()/Date.now()/performance.now() anywhere
// in src/scenes or src/components — see nondeterminism-check.mjs's own header for why this needs to
// be a STATIC check and can't just rely on determinism.mjs catching it at runtime.
{
  const scenesDir = path.join(root, 'src/scenes');
  const componentsDir = path.join(root, 'src/components');
  const dirs = [scenesDir, componentsDir].filter((d) => existsSync(d));
  const r = run('node', [resolveGateScript('nondeterminism-check.mjs'), ...dirs]);
  record('nondeterminism-check (Math.random/Date.now/performance.now)', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
}

// ------------------------------------------------------------------------------------ 4. story-metrics
{
  const r = run('node', [resolveGateScript('story-metrics.mjs'), root]);
  // story-metrics exits 2 when it "could not run" (e.g. missing approved_by) — that is a real gate
  // FAIL for our purposes (P0 not approved yet), not a gate.mjs internal error.
  record('story-metrics', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
}

// ------------------------------------------------------------------------------------ 5. fact-strings-check
const configPath = path.join(root, 'src/config.ts');
let profile = 'abstract';
if (existsSync(configPath)) {
  const m = readFileSync(configPath, 'utf8').match(/export const PROFILE[^=]*=\s*['"]([\w-]+)['"]/);
  if (m) profile = m[1];
}
const factTable = path.join(root, 'research/fact_table.md');
{
  // I5(a) fix (2026-09-29 publish review): this used to SKIP (counted as PASS) whenever
  // research/fact_table.md didn't exist yet, with NO check at all of whether the scene files
  // actually contained any fact-shaped on-screen text — a real, untagged number/comparison sailed
  // through as long as nobody had created a fact table yet. Now: for any profile with a facts
  // budget, ALWAYS run fact-strings-check.mjs (even with no table) — the script itself decides
  // SKIP (genuinely nothing to verify) vs FAIL (real content, no table backing it); see its own
  // "[SKIP]"-tagged stdout line, same convention as beat-hit-rate.mjs/timing-source-check.mjs below.
  if (profile === 'abstract') {
    record('fact-strings-check', 'SKIP', `PROFILE="${profile}" has no facts budget, not run`, 0);
  } else {
    const r = run('node', [resolveGateScript('fact-strings-check.mjs'), 'src', factTable]);
    // NEW-1 fix (2026-09-29 re-review, second pass) — see gate-status.mjs's own header for the full
    // story: exit code decides FAIL first, and the SKIP marker is matched only via an anchored
    // start-of-line regex, so a scene's on-screen text merely containing the substring "[SKIP]"
    // (echoed back inside a FAIL/WARN row) can never masquerade as this script's real SKIP marker.
    const status = classifyStepStatus(r.code, r.out, [{ pattern: /^fact-strings-check: \[SKIP\]/m, status: 'SKIP' }]);
    record('fact-strings-check', status, r.out, r.ms);
  }
}

// -------------------------------------------------------------------------------- 5b. beat-hit-rate
// music profile only (K2) — see beat-hit-rate.mjs's own header: this NEVER fails the gate (exit 0
// always), it only WARNs, so a WARN here must never flip `anyFail` below.
{
  if (profile !== 'music') {
    record('beat-hit-rate', 'SKIP', `PROFILE="${profile}" is not "music"`, 0);
  } else {
    const r = run('node', [resolveGateScript('beat-hit-rate.mjs'), root]);
    // Same exit-code-first classifier as fact-strings-check above (NEW-1), applied here for
    // consistency — see gate-status.mjs.
    const status = classifyStepStatus(r.code, r.out, [
      { pattern: /^beat-hit-rate: \[WARN\]/m, status: 'WARN' },
      { pattern: /^beat-hit-rate: \[SKIP\]/m, status: 'SKIP' },
    ]);
    record('beat-hit-rate', status, r.out, r.ms);
  }
}

// ---------------------------------------------------------------------- 5c. narration-driven profiles
// explainer + history + economics (K4: history/economics both use DRIVER='narration' too — design
// doc §3.1's own axis table — so they need the exact same TTS-timeline checks explainer already had;
// this used to be explainer-only, a K3 gap this batch closes). speech-rate/onset-check both need real
// inputs a fresh scaffold does not yet have (docs/preproduction.md's own speech-rate declaration, and
// a `kit tts build`-produced timeline) — SKIP (not FAIL) until those exist, same "grows into it"
// pattern as fact-strings-check above.
const NARRATION_PROFILES = ['explainer', 'history', 'economics'];
{
  if (!NARRATION_PROFILES.includes(profile)) {
    record('timing-source-check', 'SKIP', `PROFILE="${profile}" is not narration-driven (${NARRATION_PROFILES.join('/')})`, 0);
    record('speech-rate', 'SKIP', `PROFILE="${profile}" is not narration-driven (${NARRATION_PROFILES.join('/')})`, 0);
    record('onset-check', 'SKIP', `PROFILE="${profile}" is not narration-driven (${NARRATION_PROFILES.join('/')})`, 0);
  } else {
    const timelinePath = path.join(root, 'src/content/timeline.json');
    if (!existsSync(timelinePath)) {
      record('timing-source-check', 'SKIP', `${timelinePath} does not exist yet — run \`kit tts build\` or \`kit timeline\` first`, 0);
    } else {
      const r = run('node', [resolveNarrationScript('timing-source-check.mjs'), root]);
      // Same exit-code-first classifier as fact-strings-check above (NEW-1), applied here for
      // consistency — see gate-status.mjs.
      const status = classifyStepStatus(r.code, r.out, [
        { pattern: /^\[WARN\] timing-source-check:/m, status: 'WARN' },
        { pattern: /^\[SKIP\] timing-source-check:/m, status: 'SKIP' },
      ]);
      record('timing-source-check', status, r.out, r.ms);
    }

    const preprodPath = path.join(root, 'docs/preproduction.md');
    const hasDeclaration = existsSync(preprodPath) && /speech_rate_cps:/.test(readFileSync(preprodPath, 'utf8'));
    if (!hasDeclaration) {
      record('speech-rate', 'SKIP', 'docs/preproduction.md has no speech_rate_cps declaration yet — a fresh scaffold has none until P0 planning adds one', 0);
    } else {
      const r = run('node', [resolveNarrationScript('speech-rate.mjs'), root]);
      record('speech-rate', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }

    let timelineMeasured = false;
    if (existsSync(timelinePath)) {
      try { timelineMeasured = JSON.parse(readFileSync(timelinePath, 'utf8')).timing_source === 'measured'; } catch { /* handled by timing-source-check above */ }
    }
    if (!timelineMeasured) {
      record('onset-check', 'SKIP', 'src/content/timeline.json is missing or timing_source is not "measured" yet (ESTIMATE mode has no real audio to re-measure against)', 0);
    } else {
      const r = run('node', [resolveNarrationScript('onset-check.mjs'), root]);
      record('onset-check', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }
  }
}

// ------------------------------------------------------------------------------------ 5g. claim-usage (K6)
// Same profile/fact_table gating as fact-strings-check (step 5) — both read research/fact_table.md,
// so both SKIP together until that file exists. fact-strings-check.mjs already fails a `// fact:`/
// `"fact"` tag that points at a claim_id nobody declared; this checks the opposite drift: a claim
// declared in the table but referenced NOWHERE in src (a stale citation nobody removed after a cut).
{
  if (profile === 'abstract') {
    record('claim-usage', 'SKIP', `PROFILE="${profile}" has no facts budget, not run`, 0);
  } else if (!existsSync(factTable)) {
    record('claim-usage', 'SKIP', `${path.relative(root, factTable)} does not exist yet — run once it does`, 0);
  } else {
    const r = run('node', [resolveGateScript('claim-usage.mjs'), 'src', factTable]);
    record('claim-usage', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
  }
}

// -------------------------------------------------------------------------------- 5d. history profile (K4)
// history-only: source-tier + disputed-wording check, and the real-person-portrait manifest check
// (design doc §3.1 "history"). Both SKIP cleanly until their own input file exists — same "grows
// into it" shape as every other profile-scoped check above. Scoped strictly to profile === 'history'
// (not "whenever research/fact_table.md exists") because history-sources-check.mjs hard-requires a
// "tier" column explainer/economics fact tables don't have — running it unconditionally would break
// those profiles' own (tier-less) fact_table.md with a script error, not a clean SKIP.
{
  if (profile !== 'history') {
    record('history-sources-check', 'SKIP', `PROFILE="${profile}" is not "history"`, 0);
    record('portrait-manifest', 'SKIP', `PROFILE="${profile}" is not "history"`, 0);
  } else {
    if (!existsSync(factTable)) {
      record('history-sources-check', 'SKIP', `research/fact_table.md does not exist yet — a new scaffold has no fact table`, 0);
    } else {
      const r = run('node', [resolveGateScript('history-sources-check.mjs'), root, '--fact-table', factTable]);
      record('history-sources-check', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }
    const portraitManifestPath = path.join(root, 'src/content/portrait_manifest.json');
    if (!existsSync(portraitManifestPath)) {
      record('portrait-manifest', 'SKIP', `${path.relative(root, portraitManifestPath)} not found — no named on-screen individuals declared yet`, 0);
    } else {
      const r = run('node', [resolveGateScript('portrait-manifest.mjs'), root]);
      record('portrait-manifest', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }
  }
}

// ------------------------------------------------------------------------------ 5e. economics profile (K4)
// economics-only: every chart/count-up/card must resolve to a sourced dataset entry, and a fictional
// dataset must show the "示意數據" disclosure (design doc §3.1 "economics"). SKIP until
// src/content/chart_manifest.json exists (chart-provenance.mjs's own SKIP, matched here for a clean
// [SKIP] row rather than relying on the sub-script's own exit-0-and-print-SKIP behaviour, same
// pattern as timing-source-check above).
{
  if (profile !== 'economics') {
    record('chart-provenance', 'SKIP', `PROFILE="${profile}" is not "economics"`, 0);
  } else {
    const chartManifestPath = path.join(root, 'src/content/chart_manifest.json');
    if (!existsSync(chartManifestPath)) {
      record('chart-provenance', 'SKIP', `${path.relative(root, chartManifestPath)} not found — no charts declared yet`, 0);
    } else {
      const r = run('node', [resolveGateScript('chart-provenance.mjs'), root]);
      record('chart-provenance', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }
  }
}

// ------------------------------------------------------------------------------------- 5f. font-coverage (K4)
// ALL profiles (not profile-scoped — any on-screen text in any profile can hit a missing glyph, see
// font-coverage.mjs's own header). SKIP until fonts.lock.json exists (`kit fonts` not run yet — every
// demo this kit ships runs offline and does not call `kit fonts`, so this SKIPs there too, same as
// `kit doctor`'s own "fonts" row already does).
{
  const lockPath = path.join(root, 'fonts.lock.json');
  if (!existsSync(lockPath)) {
    record('font-coverage', 'SKIP', `${path.relative(root, lockPath) || 'fonts.lock.json'} not found — run \`kit fonts\` first`, 0);
  } else {
    const r = run('node', [resolveGateScript('font-coverage.mjs'), root]);
    record('font-coverage', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
  }
}

// ------------------------------------------------------------------------------------ 6+7. server-dependent gates
async function serverReachable(url) {
  try {
    const u = new URL(url);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    await fetch(`${u.protocol}//${u.host}`, { signal: controller.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

// `reachable` is hoisted (not block-scoped) so step 8 (font-size-check, below) can reuse the same
// server-probe result instead of probing FILM_URL a second time.
let reachable = false;
if (noServerChecks) {
  record('determinism', 'SKIP', '--no-server-checks explicitly given (every use of this flag is recorded in qa/gate.json)', 0);
  record('boundary-diff', 'SKIP', '--no-server-checks explicitly given', 0);
} else {
  reachable = await serverReachable(FILM_URL);
  if (!reachable) {
    const msg = `${FILM_URL} is unreachable — no dev/preview server running? This is a FAIL, not a SKIP: no evidence means it does not count as passed (use --no-server-checks to explicitly skip, or --url to point at the right place)`;
    record('determinism', 'FAIL', msg, 0);
    record('boundary-diff', 'FAIL', msg, 0);
  } else {
    {
      const r = run('node', [resolveRuntimeScript('determinism.mjs'), FILM_URL, path.join(root, 'qa/determinism.json')], { timeout: SERVER_STEP_TIMEOUT_MS });
      record('determinism', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }
    {
      const r = run('node', [resolveRuntimeScript('boundary-diff.mjs'), FILM_URL, path.join(root, 'qa/boundary-diff.json')], { timeout: SERVER_STEP_TIMEOUT_MS });
      record('boundary-diff', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }
  }
}

// ------------------------------------------------------------------------------------ 8. font-size-check (K6)
// narration-driven profiles only (explainer/history/economics — the profiles that burn a caption
// plate onto the frame). Config-driven: a project declares WHICH moment(s) + screen region(s) to
// check in qa/font-size-check.config.json (an array of `{ "t": number, "region": "x,y,w,h",
// "originalWidth"?: number, "minZhPxAt1920"?: number }`) once it actually has captions on screen to
// check — a fresh scaffold has none yet, so this SKIPs (not FAILs) until that config exists, same
// "SKIP until the input exists, then really run" contract as fact-strings-check/claim-usage above.
// Needs the SAME running dev/preview server as determinism/boundary-diff (captures a real still via
// scripts/stills.mjs) — `--no-server-checks` or an unreachable FILM_URL SKIPs/FAILs it exactly the
// way it does those two.
{
  const configFile = path.join(root, 'qa/font-size-check.config.json');
  if (!NARRATION_PROFILES.includes(profile)) {
    record('font-size-check', 'SKIP', `PROFILE="${profile}" is not narration-driven (${NARRATION_PROFILES.join('/')}) — no burned-in caption plate to measure`, 0);
  } else if (!existsSync(configFile)) {
    record('font-size-check', 'SKIP', `${path.relative(root, configFile)} does not exist yet — no caption screen region declared, run once it does`, 0);
  } else if (noServerChecks) {
    record('font-size-check', 'SKIP', '--no-server-checks explicitly given (needs a real render to measure ink height from)', 0);
  } else if (!reachable) {
    record('font-size-check', 'FAIL', `${FILM_URL} is unreachable, but ${path.relative(root, configFile)} already exists — no evidence means it does not count as passed`, 0);
  } else {
    let entries;
    try {
      entries = JSON.parse(readFileSync(configFile, 'utf8'));
    } catch (e) {
      record('font-size-check', 'FAIL', `${configFile} is not valid JSON: ${e.message}`, 0);
      entries = null;
    }
    if (entries) {
      const stillsDir = path.join(root, 'qa/font-size-stills');
      const times = entries.map((e) => e.t).join(',');
      const shotR = run('node', [resolveRuntimeScript('stills.mjs'), FILM_URL, stillsDir, times]);
      if (shotR.code !== 0) {
        record('font-size-check', 'FAIL', `stills.mjs could not capture a still: ${shotR.out}`, shotR.ms);
      } else {
        let out = '';
        let anyFail = false;
        for (const e of entries) {
          const stillPath = path.join(stillsDir, `t${e.t.toFixed(2).padStart(5, '0')}.png`);
          const args = [resolveGateScript('font-size-check.mjs'), stillPath, '--region', e.region];
          if (e.originalWidth) args.push('--original-width', String(e.originalWidth));
          if (e.minZhPxAt1920) args.push('--min-zh-px-at-1920', String(e.minZhPxAt1920));
          const r = run('node', args);
          out += `--- t=${e.t} region=${e.region} ---\n${r.out}\n`;
          if (r.code !== 0) anyFail = true;
        }
        record('font-size-check', anyFail ? 'FAIL' : 'PASS', out, shotR.ms);
      }
    }
  }
}

// ------------------------------------------------------------------------------------ 9. audio-diag (K6)
// narration-driven profiles only. Runs against `audio/mix.wav` — the FINAL mixed narration(+music)
// track `narration/build-mix.mjs` writes. A fresh project (or one still using per-line TTS output with
// no final mix yet) SKIPs — this is a delivery-stage gate, not a per-line one.
{
  if (!NARRATION_PROFILES.includes(profile)) {
    record('audio-diag', 'SKIP', `PROFILE="${profile}" is not narration-driven (${NARRATION_PROFILES.join('/')}) — no narration mix to measure`, 0);
  } else {
    const mixPath = path.join(root, 'audio/mix.wav');
    if (!existsSync(mixPath)) {
      record('audio-diag', 'SKIP', `${path.relative(root, mixPath)} does not exist yet — run \`kit tts build\` (or narration/build-mix.mjs) first`, 0);
    } else {
      const r = run('node', [resolveGateScript('audio-diag.mjs'), mixPath]);
      record('audio-diag', r.code === 0 ? 'PASS' : 'FAIL', r.out, r.ms);
    }
  }
}

// ------------------------------------------------------------------------------------ report
const anyFail = steps.some((s) => s.status === 'FAIL');
const summary = { generated: new Date().toISOString(), url: FILM_URL, root, no_server_checks: noServerChecks, steps, overall: anyFail ? 'FAIL' : 'PASS' };
mkdirSync(path.join(root, 'qa'), { recursive: true });
writeFileSync(path.join(root, 'qa/gate.json'), JSON.stringify(summary, null, 2));
console.log(`\n=== gate: ${summary.overall} — ${steps.filter((s) => s.status === 'PASS').length} PASS, ${steps.filter((s) => s.status === 'SKIP').length} SKIP, ${steps.filter((s) => s.status === 'WARN').length} WARN, ${steps.filter((s) => s.status === 'FAIL').length} FAIL ===`);
console.log('written qa/gate.json');
process.exit(anyFail ? 1 : 0);
