#!/usr/bin/env node
// gates/claim-usage.mjs — K6: cross-checks every claim_id declared in research/fact_table.md against
// ACTUAL usage anywhere in <srcDir> — a `// fact: Cxx` comment tag in a .ts/.tsx scene file, or a
// `"fact": "Cxx"` field on a content/*.json card (the SAME two usage sites fact-strings-check.mjs
// already scans, so both checks agree on what "used" means).
//
// fact-strings-check.mjs already fails the "a tag points at a claim_id that isn't in the table"
// direction (a dangling reference). This check exists for the opposite drift that had no coverage: a
// claim declared in fact_table.md but referenced NOWHERE in the film — i.e. research nobody removed
// after the scene or line that used it was cut or reworded. A stale, unused citation is exactly as
// much a fact-table hygiene problem as a dangling one; this closes that gap. (It also re-flags the
// dangling direction as defence in depth, in case this check is ever run standalone without
// fact-strings-check.)
//
// Usage: node claim-usage.mjs [srcDir] [factTable] [--fact-table <path>] [--json out.json]
//   srcDir      default: src
//   factTable   default: research/fact_table.md — positional 2nd arg or --fact-table both work
//               (--fact-table wins); parsed the same way fact-strings-check.mjs does: any
//               "| Cxx | ..." row, first column = claim_id.
// Exit: 0 = every declared claim is used at least once AND no dangling reference exists,
//       1 = at least one unused-or-dangling claim, 2 = bad args / fact table has no Cxx rows.
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let jsonOut;
const jsonIdx = args.indexOf('--json');
if (jsonIdx !== -1) { jsonOut = args[jsonIdx + 1]; args.splice(jsonIdx, 2); }
let factTableFlag;
const factTableIdx = args.indexOf('--fact-table');
if (factTableIdx !== -1) { factTableFlag = args[factTableIdx + 1]; args.splice(factTableIdx, 2); }
const srcDir = path.resolve(args[0] ?? 'src');
const factTablePath = path.resolve(factTableFlag ?? args[1] ?? 'research/fact_table.md');

function fail(msg) { console.error(`claim-usage: ${msg}`); process.exit(2); }
if (!existsSync(srcDir)) fail(`srcDir not found: ${srcDir}`);
if (!existsSync(factTablePath)) fail(`factTable not found: ${factTablePath}`);

// ---- declared claims: same "| Cxx |" row parse as fact-strings-check.mjs ----
const factSrc = readFileSync(factTablePath, 'utf8');
const declared = new Set();
for (const m of factSrc.matchAll(/^\|\s*(C\d+)\s*\|/gm)) declared.add(m[1]);
if (declared.size === 0) fail(`${factTablePath} has no "| Cxx |"-shaped row — wrong format?`);

// ---- usage scan: walk srcDir for .ts/.tsx files (skip node_modules/dist/.git/__fixtures__) ----
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', '__fixtures__'].includes(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const used = new Map(); // claim_id -> [location, ...]
function markUsed(claimId, location) {
  if (!used.has(claimId)) used.set(claimId, []);
  used.get(claimId).push(location);
}
for (const file of walk(srcDir)) {
  const rel = path.relative(process.cwd(), file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/\/\/\s*fact:\s*(C\d+)/);
    if (m) markUsed(m[1], `${rel}:${i + 1}`);
  });
}

// ---- usage site 2: a content/*.json card's own `"fact": "Cxx"` field — same shape/scan scope as
// fact-strings-check.mjs's K4 addition ({ cards: [...] } or a bare [...] array). timeline.json is
// excluded: it is a BUILD OUTPUT derived from cards.json, not a second authoring site for the same
// fact (see fact-strings-check.mjs's own header for why scanning both would double-count one
// authoring decision under two paths).
function walkJson(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', '__fixtures__'].includes(name) || name === 'timeline.json') continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJson(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}
const contentDir = path.join(srcDir, 'content');
for (const file of walkJson(contentDir)) {
  const rel = path.relative(process.cwd(), file);
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; } // not this check's job to validate JSON syntax
  const cards = Array.isArray(data?.cards) ? data.cards : Array.isArray(data) ? data : [];
  cards.forEach((card, idx) => {
    if (card && typeof card === 'object' && typeof card.fact === 'string' && /^C\d+$/.test(card.fact)) {
      markUsed(card.fact, `${rel}#${card.card_id ?? idx}`);
    }
  });
}

const allClaims = new Set([...declared, ...used.keys()]);
const rows = [];
let unusedCount = 0;
let danglingCount = 0;
for (const claimId of [...allClaims].sort()) {
  const isDeclared = declared.has(claimId);
  const locations = used.get(claimId) ?? [];
  if (isDeclared && locations.length === 0) {
    unusedCount++;
    rows.push({ claim_id: claimId, verdict: 'FAIL', reason: 'declared in the fact table but referenced nowhere in src — stale citation (remove the row, or actually use it)' });
  } else if (!isDeclared && locations.length > 0) {
    danglingCount++;
    rows.push({ claim_id: claimId, verdict: 'FAIL', locations, reason: `referenced at ${locations.join(', ')} but not declared in ${path.relative(process.cwd(), factTablePath)} (also caught by fact-strings-check.mjs)` });
  } else {
    rows.push({ claim_id: claimId, verdict: 'OK', locations });
  }
}

const usedCount = [...declared].filter((c) => (used.get(c)?.length ?? 0) > 0).length;
const total = declared.size;

console.log(`claim-usage: ${total} declared claim(s) in ${path.relative(process.cwd(), factTablePath)}, ${usedCount}/${total} used somewhere in ${path.relative(process.cwd(), srcDir)}`);
for (const r of rows) if (r.verdict !== 'OK') console.log(`  [FAIL] ${r.claim_id} — ${r.reason}`);

const summary = {
  fact_table: path.relative(process.cwd(), factTablePath),
  src_dir: path.relative(process.cwd(), srcDir),
  declared_claims: [...declared].sort(),
  used_count: usedCount,
  total_declared: total,
  unused_count: unusedCount,
  dangling_count: danglingCount,
  rows,
};
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');
  console.log(`wrote ${jsonOut}`);
}
process.exit(unusedCount > 0 || danglingCount > 0 ? 1 : 0);
