#!/usr/bin/env node
// history-sources-check.mjs — history-profile-only gate (design doc §3.1 "history"): "來源等級
// （一手／二手／通俗）欄必填、爭議措辭 allowlist（「一說」「據載」）".
//
// Two independent checks against research/fact_table.md, extended (history profile only) with two
// columns beyond the base `| claim_id | claim (zh) | claim (en) | source |` shape every profile's
// fact-strings-check.mjs already reads:
//   | tier | disputed |
//   tier      — one of 一手 (primary) / 二手 (secondary) / 通俗 (popular/secondary-popular).
//               EVERY row must have a valid tier — FAIL "missing/invalid tier" otherwise. A history
//               claim with no declared source tier is exactly the "how solid is this, really"
//               question this profile exists to force onto the record.
//   disputed  — 'yes'/'no' (case-insensitive). Rows are 'no' if the column is absent (back-compat
//               with a base fact_table.md that hasn't added history columns yet, though tier is
//               still hard-required once history-sources-check actually runs).
//
// For every row with disputed=yes: find every src/content/*.json card entry whose own "fact" field
// equals that claim_id (same field fact-strings-check.mjs's cards.json extension reads — see that
// script's own header) and require its "zh" text to contain at least one hedge word from
// HEDGE_ALLOWLIST (一說 / 據載). A disputed claim presented as flat, unhedged fact on screen is
// exactly the failure mode this check exists to catch. A disputed claim_id with NO matching card at
// all is not this check's problem (fact-strings-check already requires every used claim_id to exist;
// a claim declared but never actually shown on screen has nothing to hedge).
//
// SKIP (not FAIL) when research/fact_table.md doesn't exist yet — same "grows into it" shape as
// fact-strings-check.mjs.
//
// Usage: node history-sources-check.mjs [root] [--fact-table path] [--json out.json]
// Exit codes: 0 = PASS or SKIP, 1 = at least one row/card fails, 2 = script could not run.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let jsonOut;
let factTableFlag;
{
  let i = args.indexOf('--json');
  if (i !== -1) { jsonOut = args[i + 1]; args.splice(i, 2); }
  i = args.indexOf('--fact-table');
  if (i !== -1) { factTableFlag = args[i + 1]; args.splice(i, 2); }
}
const root = path.resolve(args[0] ?? '.');
const factTablePath = path.resolve(factTableFlag ?? path.join(root, 'research/fact_table.md'));

function fail(msg) {
  console.error(`history-sources-check: ${msg}`);
  process.exit(2);
}
function done(status, msg) {
  console.log(`history-sources-check: [${status}] ${msg}`);
  process.exit(0);
}

if (!existsSync(factTablePath)) {
  done('SKIP', `${path.relative(root, factTablePath)} not found — a brand-new history scaffold has no fact table yet.`);
}

// ---- parse the markdown table generically by header name (robust to column order/extra columns) ----
const src = readFileSync(factTablePath, 'utf8');
const tableLines = src.split('\n').filter((l) => /^\s*\|/.test(l));
if (tableLines.length < 2) fail(`${factTablePath} has no "| ... |"-shaped table rows`);
const headerCells = tableLines[0].split('|').map((c) => c.trim()).filter((c) => c !== '');
const colIndex = (name) => headerCells.findIndex((h) => h.toLowerCase() === name.toLowerCase());
const idxClaimId = colIndex('claim_id');
const idxTier = colIndex('tier');
const idxDisputed = colIndex('disputed');
if (idxClaimId === -1) fail(`${factTablePath} header has no "claim_id" column`);
if (idxTier === -1) fail(`${factTablePath} header has no "tier" column — history profile requires 來源等級 (一手/二手/通俗) for every claim`);

const VALID_TIERS = new Set(['一手', '二手', '通俗']);
const HEDGE_ALLOWLIST = ['一說', '據載'];

const rows = [];
for (let i = 2; i < tableLines.length; i++) {
  // skip the markdown separator row (---|---|---)
  if (/^\s*\|[\s:-]+\|/.test(tableLines[i]) && !/[^\s|:-]/.test(tableLines[i])) continue;
  const cells = tableLines[i].split('|').map((c) => c.trim());
  // markdown "| a | b |" split on '|' yields ['', a, b, ''] — cells[1..] align with headerCells[0..]
  const get = (idx) => (idx === -1 ? undefined : cells[idx + 1]);
  const claimId = get(idxClaimId);
  if (!claimId) continue;
  const tier = get(idxTier);
  const disputedRaw = (get(idxDisputed) ?? 'no').toLowerCase();
  const disputed = disputedRaw === 'yes' || disputedRaw === 'true' || disputedRaw === '有';
  rows.push({ claimId, tier, disputed });
}
if (rows.length === 0) fail(`${factTablePath} table has a header but zero data rows`);

let failCount = 0;
for (const r of rows) {
  if (!r.tier || !VALID_TIERS.has(r.tier)) {
    failCount++;
    console.error(`  [FAIL] ${r.claimId} — invalid/missing tier "${r.tier ?? ''}" (must be one of ${[...VALID_TIERS].join('/')})`);
  } else {
    console.log(`  [OK] ${r.claimId} — tier=${r.tier}${r.disputed ? ' (disputed)' : ''}`);
  }
}

// ---- disputed-claim hedge-wording cross-check against src/content/*.json cards ----
function walkFiles(dir, pattern, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', '__fixtures__'].includes(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, pattern, out);
    else if (pattern.test(name)) out.push(p);
  }
  return out;
}
const contentDir = path.join(root, 'src', 'content');
const cardsByFact = new Map(); // claim_id -> [{ zh, file }]
for (const file of walkFiles(contentDir, /\.json$/)) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  const cards = Array.isArray(data?.cards) ? data.cards : Array.isArray(data) ? data : [];
  for (const card of cards) {
    if (card && typeof card.fact === 'string' && typeof card.zh === 'string') {
      if (!cardsByFact.has(card.fact)) cardsByFact.set(card.fact, []);
      cardsByFact.get(card.fact).push({ zh: card.zh, file: path.relative(root, file) });
    }
  }
}

const disputedRows = rows.filter((r) => r.disputed);
for (const r of disputedRows) {
  const cards = cardsByFact.get(r.claimId) ?? [];
  if (cards.length === 0) {
    console.log(`  [INFO] ${r.claimId} is disputed but no on-screen card references it (fact-strings-check.mjs governs whether it's actually used) — nothing to hedge-check`);
    continue;
  }
  for (const c of cards) {
    const hedged = HEDGE_ALLOWLIST.some((h) => c.zh.includes(h));
    if (!hedged) {
      failCount++;
      console.error(`  [FAIL] ${r.claimId} is disputed but ${c.file} shows it unhedged: "${c.zh}" (needs one of ${HEDGE_ALLOWLIST.join('/')})`);
    } else {
      console.log(`  [OK] ${r.claimId} (disputed) hedged in ${c.file}: "${c.zh}"`);
    }
  }
}

console.log(`history-sources-check: ${rows.length} claim(s), ${disputedRows.length} disputed, ${failCount} FAIL`);
const summary = { root, fact_table: path.relative(root, factTablePath), rows, fail_count: failCount };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');

if (failCount > 0) {
  console.error(`history-sources-check: [FAIL] ${failCount} problem(s) found`);
  process.exit(1);
}
console.log('history-sources-check: [PASS] every claim has a valid source tier, every disputed claim is hedged on screen');
process.exit(0);
