#!/usr/bin/env node
// chart-provenance.mjs — economics-profile-only gate (design doc §3.1 "economics" / §6 rollup).
// The economics profile's whole point is "every on-screen number traces to a source" — this is the
// mechanical half of that promise (a human rubric review is the other half, same split as every
// other profile's story-metrics vs. rubric).
//
// Contract (static, file-based — no scene bundling/runtime sampling, unlike story-metrics.mjs):
//   src/data/*.json        — each file: an ARRAY of dataset entries
//                             { id, source, url, retrieved: 'YYYY-MM-DD', unit, license,
//                               fictional: boolean, values?: ... }
//   src/content/chart_manifest.json — an ARRAY of entries, one per on-screen chart/count-up/card:
//                             { scene, sceneFile, component: 'bar-chart'|'line-chart'|'area-chart'
//                               |'count-up'|'entity-card', dataset_id, yMin?: number,
//                               truncatedAxis?: string|null }
//
// Checks, all of them, every run (report everything in one pass, same policy as gate.mjs itself):
//   1. every manifest entry's dataset_id resolves to a real entry across src/data/*.json
//      -> FAIL "dangling dataset_id" if not.
//   2. every REFERENCED dataset entry has non-empty source/url/unit/license, retrieved shaped like
//      YYYY-MM-DD, and fictional is a real boolean (present, not inferred) -> FAIL "incomplete
//      metadata: missing X" listing exactly which field(s).
//   3. dataset.fictional === true -> sceneFile must contain a `drawSourceFooter(...)` call AND that
//      call's argument text must mention `fictional` (either `fictional: true` or a variable named
//      with "fictional" in it — the component itself renders the "示意數據" label at runtime once it
//      sees a truthy fictional flag; this check only proves the call site actually WIRES that flag
//      through, not what pixels came out — see the design doc §3.1's own OCR-is-too-heavy note). No
//      drawSourceFooter(...) call in sceneFile at all -> FAIL "fictional dataset but no source-footer".
//   4. component === 'bar-chart': yMin defaults to 0 when absent. If yMin !== 0 (a truncated axis),
//      truncatedAxis must be a non-empty string of at least 8 characters (a real reason, not a
//      placeholder) -> FAIL "truncated bar axis with no truncatedAxis reason". If yMin === 0 (or
//      absent), truncatedAxis must be null/absent -> FAIL "yMin=0 but truncatedAxis set" (a stray
//      excuse for an axis that isn't actually truncated is itself a smell worth catching).
//
// SKIP (not FAIL) when src/content/chart_manifest.json doesn't exist yet — same "grows into it"
// shape as fact-strings-check.mjs / beat-hit-rate.mjs: a brand-new economics scaffold has neither
// file until content is written.
//
// Usage: node chart-provenance.mjs [root] [--json out.json]
// Exit codes: 0 = PASS or SKIP, 1 = at least one check above failed, 2 = script could not run
// (malformed JSON, sceneFile referenced but missing).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let jsonOut;
{
  const i = args.indexOf('--json');
  if (i !== -1) { jsonOut = args[i + 1]; args.splice(i, 2); }
}
const root = path.resolve(args[0] ?? '.');

function fail(msg) {
  console.error(`chart-provenance: ${msg}`);
  process.exit(2);
}
function done(status, msg) {
  console.log(`chart-provenance: [${status}] ${msg}`);
  process.exit(0);
}

const manifestPath = path.join(root, 'src/content/chart_manifest.json');
if (!existsSync(manifestPath)) {
  done('SKIP', `${path.relative(root, manifestPath)} not found — a brand-new economics scaffold has no charts declared yet.`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  fail(`${manifestPath} is not valid JSON: ${e.message}`);
}
if (!Array.isArray(manifest)) fail(`${manifestPath} must be a JSON array of chart entries.`);

// ---- load + merge every src/data/*.json dataset file ----
const dataDir = path.join(root, 'src', 'data');
const datasets = new Map(); // id -> entry (+ __file)
if (existsSync(dataDir)) {
  for (const name of readdirSync(dataDir)) {
    if (!name.endsWith('.json')) continue;
    const p = path.join(dataDir, name);
    let arr;
    try {
      arr = JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      fail(`${path.relative(root, p)} is not valid JSON: ${e.message}`);
    }
    if (!Array.isArray(arr)) fail(`${path.relative(root, p)} must be a JSON array of dataset entries.`);
    for (const entry of arr) {
      if (!entry || typeof entry.id !== 'string') fail(`${path.relative(root, p)} has an entry with no string "id"`);
      if (datasets.has(entry.id)) fail(`dataset id "${entry.id}" is defined more than once (${path.relative(root, p)} and elsewhere)`);
      datasets.set(entry.id, { ...entry, __file: path.relative(root, p) });
    }
  }
}

const REQUIRED_STRING_FIELDS = ['source', 'url', 'unit', 'license'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
let failCount = 0;
function recordFail(label, msg) {
  failCount++;
  console.error(`  [FAIL] ${label} — ${msg}`);
}
function recordOk(label, msg) {
  console.log(`  [OK] ${label} — ${msg}`);
}

const validatedDatasets = new Map(); // id -> ok boolean
function validateDataset(id) {
  const d = datasets.get(id);
  if (!d) return null;
  if (validatedDatasets.has(id)) return d;
  const missing = [];
  for (const f of REQUIRED_STRING_FIELDS) {
    if (typeof d[f] !== 'string' || d[f].trim() === '') missing.push(f);
  }
  if (typeof d.retrieved !== 'string' || !DATE_RE.test(d.retrieved)) missing.push('retrieved (YYYY-MM-DD)');
  if (typeof d.fictional !== 'boolean') missing.push('fictional (boolean)');
  if (missing.length) {
    recordFail(`dataset "${id}" (${d.__file})`, `incomplete metadata: missing ${missing.join(', ')}`);
    validatedDatasets.set(id, false);
  } else {
    recordOk(`dataset "${id}" (${d.__file})`, 'metadata complete');
    validatedDatasets.set(id, true);
  }
  return d;
}

const entryResults = [];
manifest.forEach((entry, i) => {
  const label = `manifest[${i}] scene="${entry?.scene ?? '?'}"`;
  if (!entry || typeof entry.dataset_id !== 'string') {
    recordFail(label, 'entry has no string "dataset_id"');
    entryResults.push({ label, ok: false });
    return;
  }
  // 1. dangling dataset_id
  if (!datasets.has(entry.dataset_id)) {
    recordFail(label, `dataset_id "${entry.dataset_id}" not found in any src/data/*.json`);
    entryResults.push({ label, ok: false });
    return;
  }
  // 2. metadata completeness
  const d = validateDataset(entry.dataset_id);
  let ok = validatedDatasets.get(entry.dataset_id) === true;

  // 3. fictional -> source-footer wiring
  if (d.fictional === true) {
    if (typeof entry.sceneFile !== 'string') {
      recordFail(label, 'dataset is fictional:true but manifest entry has no "sceneFile" to check for a source-footer call');
      ok = false;
    } else {
      const sceneFilePath = path.join(root, entry.sceneFile);
      if (!existsSync(sceneFilePath)) {
        fail(`${label}: sceneFile "${entry.sceneFile}" does not exist`);
      }
      const src = readFileSync(sceneFilePath, 'utf8');
      const callMatch = src.match(/drawSourceFooter\s*\(([\s\S]*?)\)\s*;/);
      if (!callMatch) {
        recordFail(label, `dataset "${entry.dataset_id}" is fictional:true but ${entry.sceneFile} has no drawSourceFooter(...) call`);
        ok = false;
      } else if (!/fictional/.test(callMatch[1])) {
        recordFail(label, `${entry.sceneFile} calls drawSourceFooter(...) but the call never mentions "fictional" — the "示意數據" flag is not wired through`);
        ok = false;
      } else {
        recordOk(label, `fictional dataset has a drawSourceFooter(...) call wiring "fictional" through`);
      }
    }
  }

  // 4. bar-chart y-axis-from-zero
  if (entry.component === 'bar-chart') {
    const yMin = entry.yMin ?? 0;
    const truncatedAxis = entry.truncatedAxis ?? null;
    if (yMin !== 0) {
      if (typeof truncatedAxis !== 'string' || truncatedAxis.trim().length < 8) {
        recordFail(label, `bar-chart yMin=${yMin} (not 0) but "truncatedAxis" is missing or too short — a truncated axis needs a real, explicit reason`);
        ok = false;
      } else {
        recordOk(label, `truncated bar axis declared with a reason: "${truncatedAxis}"`);
      }
    } else if (truncatedAxis !== null) {
      recordFail(label, `bar-chart yMin=0 (not truncated) but "truncatedAxis" is set ("${truncatedAxis}") — remove it, or fix yMin`);
      ok = false;
    }
  }

  entryResults.push({ label, ok });
});

console.log(`chart-provenance: ${manifest.length} manifest entr${manifest.length === 1 ? 'y' : 'ies'}, ${datasets.size} dataset(s) loaded`);

const summary = {
  root,
  manifest_entries: manifest.length,
  datasets: datasets.size,
  fail_count: failCount,
  entries: entryResults,
};
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');

if (failCount > 0) {
  console.error(`chart-provenance: [FAIL] ${failCount} problem(s) found (see above)`);
  process.exit(1);
}
console.log('chart-provenance: [PASS] every chart/count-up/card entry has a real, complete, correctly-wired dataset');
process.exit(0);
