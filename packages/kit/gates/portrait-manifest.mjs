#!/usr/bin/env node
// portrait-manifest.mjs — history-profile-only gate (design doc §3.1 "history"): "真實人物只准剪影
// 或公有領域圖，有 ai_generated:true 嘅真人肖像即 FAIL". A history film about real people is the one
// place this kit's "generate whatever art you want" freedom must stop cold — an AI-generated face
// presented as a historical figure is a fabrication risk no rubric review should have to catch by
// eye; this is a mechanical, un-overridable check.
//
// Contract: src/content/portrait_manifest.json — a JSON ARRAY, one entry per depicted real person:
//   { person: string, kind: 'silhouette' | 'public-domain' | 'illustration-traced',
//     ai_generated: boolean, source: string, license: string }
//   - kind must be one of the three allowed values (no "ai-portrait", no "photo-realistic-render" —
//     if it needs a new kind name, it needs a new line in this allowlist, not a workaround).
//   - ai_generated must be a real boolean AND must be false. true -> immediate FAIL, regardless of
//     what `kind` claims (belt + suspenders: a manifest entry that says both "silhouette" and
//     "ai_generated: true" is self-contradictory and must not pass on a technicality).
//   - source / license must be non-empty strings (same "who says so" discipline as chart-provenance's
//     dataset metadata — a silhouette or public-domain claim needs a place a reviewer can go check).
//
// SKIP (not FAIL) when src/content/portrait_manifest.json doesn't exist yet — a history project with
// no named on-screen individuals (e.g. only places/events) legitimately has none.
//
// Usage: node portrait-manifest.mjs [root] [--json out.json]
// Exit codes: 0 = PASS or SKIP, 1 = at least one entry fails, 2 = script could not run.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let jsonOut;
{
  const i = args.indexOf('--json');
  if (i !== -1) { jsonOut = args[i + 1]; args.splice(i, 2); }
}
const root = path.resolve(args[0] ?? '.');

function fail(msg) {
  console.error(`portrait-manifest: ${msg}`);
  process.exit(2);
}
function done(status, msg) {
  console.log(`portrait-manifest: [${status}] ${msg}`);
  process.exit(0);
}

const manifestPath = path.join(root, 'src/content/portrait_manifest.json');
if (!existsSync(manifestPath)) {
  done('SKIP', `${path.relative(root, manifestPath)} not found — no named on-screen individuals declared (a places/events-only history film legitimately has none).`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  fail(`${manifestPath} is not valid JSON: ${e.message}`);
}
if (!Array.isArray(manifest)) fail(`${manifestPath} must be a JSON array of portrait entries.`);

const ALLOWED_KINDS = new Set(['silhouette', 'public-domain', 'illustration-traced']);
let failCount = 0;
const rows = [];

manifest.forEach((entry, i) => {
  const label = `portrait_manifest[${i}] person="${entry?.person ?? '?'}"`;
  const problems = [];
  if (!entry || typeof entry.person !== 'string' || entry.person.trim() === '') problems.push('missing "person"');
  if (typeof entry?.kind !== 'string' || !ALLOWED_KINDS.has(entry.kind)) problems.push(`"kind" must be one of ${[...ALLOWED_KINDS].join('/')} (got ${JSON.stringify(entry?.kind)})`);
  if (typeof entry?.source !== 'string' || entry.source.trim() === '') problems.push('missing "source"');
  if (typeof entry?.license !== 'string' || entry.license.trim() === '') problems.push('missing "license"');
  if (typeof entry?.ai_generated !== 'boolean') {
    problems.push('"ai_generated" must be a real boolean (present, not inferred)');
  } else if (entry.ai_generated === true) {
    problems.push('ai_generated:true — an AI-generated likeness of a real historical person is never allowed, use a silhouette or a public-domain image instead');
  }
  if (problems.length) {
    failCount++;
    console.error(`  [FAIL] ${label} — ${problems.join('; ')}`);
    rows.push({ label, ok: false, problems });
  } else {
    console.log(`  [OK] ${label} — kind=${entry.kind}, ai_generated=false, sourced`);
    rows.push({ label, ok: true });
  }
});

console.log(`portrait-manifest: ${manifest.length} entr${manifest.length === 1 ? 'y' : 'ies'}, ${failCount} FAIL`);
const summary = { root, entries: manifest.length, fail_count: failCount, rows };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');

if (failCount > 0) {
  console.error(`portrait-manifest: [FAIL] ${failCount} portrait entry(ies) failed`);
  process.exit(1);
}
console.log('portrait-manifest: [PASS] every depicted real person is a silhouette/public-domain/traced illustration, never AI-generated, and sourced');
process.exit(0);
