#!/usr/bin/env node
// fact-strings-check.mjs — every fact-shaped string (including directional/causal assertions) that
// ends up on screen must trace back to research/fact_table.md, not just bare digits.
//
// What it does: scans <srcDir> (default src/) .ts/.tsx scene files for strings passed to
// `label(...)`/`fillText(...)` calls (heuristic: "contains a CJK character, a digit, or an English
// directional/comparative word" — see I5(b) below; this used to be CJK-only, filtering out
// id-like ASCII args). Each candidate string:
//   1. Has a `// fact: Cxx` tag on the same or previous line → look up Cxx in <factTable>'s
//      (default research/fact_table.md) claim_id column — exists = OK; missing = FAIL (dangling ref).
//   2. No tag, but contains a digit or a directional/causal word (higher/lower/increase/decrease/
//      more-than/less-than/more/if-then/than, matched in the source language's own function words)
//      → WARN "looks like a fact/directional assertion with no // fact: tag".
//   3. Everything else (no digit, no directional word, no tag) → ignored, only counted in total.
//
// Exit code: 1 when (a) a dangling Cxx reference exists (FAIL), or (b) not every directional/
// numeric candidate string is tagged AND valid (i.e. "N/N verified" cannot be honestly printed).
// A run that prints "k/N (not fully verified)" always exits non-zero — silently claiming full
// coverage while some candidates are untagged is exactly the failure mode this script exists to
// catch. --strict is accepted for backward compatibility but has no extra effect (every WARN this
// script emits is already directional).
//
// Usage: node fact-strings-check.mjs [srcDir] [factTable] [--fact-table <path>] [--json out.json] [--strict]
//   srcDir      default: src
//   factTable   default: research/fact_table.md (a markdown table whose first column is a claim_id
//               shaped Cxx); positional 2nd arg or --fact-table both work (--fact-table wins).
//
// Known limitation (documented, not hidden): string detection is a "contains CJK" heuristic, not an
// AST parse — multiple strings per line, multi-line strings, or a `// fact:` tag more than one line
// above can be missed. A human still has to eyeball the FAIL/WARN list at review time; "WARN=0"
// alone is not proof of correctness.
//
// K4 fix (2026-09-28, closes a documented K3 limitation — see demos/explainer's own
// docs/preproduction.md Notes: "content/cards.json ... is outside that gate's scan scope by
// construction"): this script ALSO scans <srcDir>/content/*.json card tables (the shape
// `{ cards: [...] }` or a bare `[...]` array, entries with a "zh"/"en" string field — the same
// shape demos/explainer/history/economics all use for on-screen narration text). A card's own
// `"fact": "Cxx"` field is the JSON-native equivalent of a `// fact: Cxx` comment tag in a .ts file
// — same validation (Cxx must exist in the fact table), same WARN when a directional/numeric card
// has no `fact` field at all. This closes the gap: narration text that lives in cards.json data
// (as opposed to a literal fillText/label(...) call in a scene file) is no longer silently outside
// this gate's scan scope.
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--strict');
const strict = process.argv.includes('--strict');
let jsonOut;
const jsonIdx = args.indexOf('--json');
if (jsonIdx !== -1) { jsonOut = args[jsonIdx + 1]; args.splice(jsonIdx, 2); }
let factTableFlag;
const factTableIdx = args.indexOf('--fact-table');
if (factTableIdx !== -1) { factTableFlag = args[factTableIdx + 1]; args.splice(factTableIdx, 2); }
const srcDir = path.resolve(args[0] ?? 'src');
const factTablePath = path.resolve(factTableFlag ?? args[1] ?? 'research/fact_table.md');

function fail(msg) { console.error(`fact-strings-check: ${msg}`); process.exit(2); }
if (!existsSync(srcDir)) fail(`srcDir not found: ${srcDir}`);
// I5(a) fix (2026-09-29 publish review): a missing fact table used to be a hard `fail()` (exit 2)
// which gate.mjs's caller never even reached — it SKIPPED this whole check (SKIP counted as PASS)
// whenever research/fact_table.md didn't exist yet, so a scene with a real, untagged fact-shaped
// string ("the Moon is 384,400 km away...") passed the gate cleanly as long as nobody had created a
// fact table. Now: a missing table is NOT fatal here — this script still scans for candidate
// fact-shaped strings, and if it finds none, that's a legitimate SKIP (fresh scaffold, no content
// yet); if it finds any, that's a FAIL (real content exists with nothing backing it), never a
// silent pass. See the `factTableExists` checks below and near the bottom of this file.
const factTableExists = existsSync(factTablePath);
const validClaims = new Set();
if (factTableExists) {
  // ---- parse fact_table.md: markdown table, first `|` column = claim_id (Cxx).
  const factSrc = readFileSync(factTablePath, 'utf8');
  for (const m of factSrc.matchAll(/^\|\s*(C\d+)\s*\|/gm)) validClaims.add(m[1]);
  if (validClaims.size === 0) fail(`${factTablePath} has no "| Cxx |"-shaped row — wrong format?`);
}

// ---- walk srcDir for .ts/.tsx files (skip node_modules/dist/.git).
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
const files = walk(srcDir);

const HAS_CJK = /[぀-ヿ㐀-鿿가-힣]/;
const DIRECTIONAL_ZH = /(順|逆|高|低|增|減|以上|以下|更|若|則|比)/;
// I5(b) fix (2026-09-29 publish review): the old DIRECTIONAL regex was CJK-only, so an English
// on-screen fact string (README's international-user entry point — this kit ships an English README
// too) with NO digit would sail through unchecked, and even a digit-bearing English string only got
// caught because CANDIDATE detection below now also checks for a digit directly (see next comment).
const DIRECTIONAL_EN = /\b(more|less|greater|smaller|higher|lower|closer|farther|further|nearer|larger|longer|shorter|faster|slower|increase[sd]?|decrease[sd]?|than)\b/i;
const CALL_LINE = /\b(fillText|label)\s*\(/;
const FACT_TAG = /\/\/\s*fact:\s*(C\d+)/;
const STRING_LIT = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
// A line that is itself a comment (not real code) can still contain "label(" or "fillText(" inside
// its prose (e.g. a doc comment explaining a function's optional label parameter) — skip those so
// broadening the candidate test below (from CJK-only to CJK-or-digit-or-English-directional) doesn't
// start flagging prose numbers/words inside comments as on-screen text.
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

const rows = [];
let totalCandidates = 0, directionalCount = 0, directionalOkCount = 0, okCount = 0, warnCount = 0, failCount = 0;

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (COMMENT_LINE.test(line) || !CALL_LINE.test(line)) continue;
    const strings = [];
    for (const m of line.matchAll(STRING_LIT)) strings.push(m[1] ?? m[2] ?? '');
    for (const text of strings) {
      // Candidate = looks like real display text, not an id-like ASCII arg (font name, color key,
      // etc.): CJK, OR a digit (any language's number is a fact worth sourcing), OR an English
      // directional/comparative word (I5(b) — this used to be CJK-only, missing English on-screen
      // facts entirely).
      if (!HAS_CJK.test(text) && !/\d/.test(text) && !DIRECTIONAL_EN.test(text)) continue;
      totalCandidates++;
      const isDirectional = DIRECTIONAL_ZH.test(text) || DIRECTIONAL_EN.test(text) || /\d/.test(text);
      if (isDirectional) directionalCount++;
      const sameLineTag = line.match(FACT_TAG);
      const prevLineTag = i > 0 ? lines[i - 1].match(FACT_TAG) : null;
      const tag = sameLineTag ?? prevLineTag;
      if (tag) {
        const cxx = tag[1];
        if (validClaims.has(cxx)) {
          okCount++;
          if (isDirectional) directionalOkCount++;
          rows.push({ file: rel, line: i + 1, text, fact: cxx, verdict: 'OK' });
        } else {
          failCount++;
          rows.push({ file: rel, line: i + 1, text, fact: cxx, verdict: 'FAIL', reason: factTableExists ? `${cxx} does not exist in ${path.relative(process.cwd(), factTablePath)}` : `${path.relative(process.cwd(), factTablePath)} does not exist — cannot verify tag ${cxx}` });
        }
      } else if (isDirectional) {
        warnCount++;
        rows.push({
          file: rel, line: i + 1, text, fact: null, verdict: 'WARN',
          reason: factTableExists
            ? 'contains a digit or directional/causal word but has no // fact: tag'
            : `contains a digit or directional/causal word but ${path.relative(process.cwd(), factTablePath)} does not exist — create it and tag this string (// fact: Cxx), or remove the number/comparison from on-screen text`,
        });
      }
    }
  }
}

// ---- K4: scan <srcDir>/content/*.json card tables (see this file's own header, K4 fix note) ----
// `timeline.json` is EXCLUDED here on purpose: narration/build-timeline.mjs's own header names
// cards.json the "caption SSOT" and generates timeline.json FROM it (a build output, like
// qa/*.json) — it does not currently carry a card's own "fact" field through into its copy of that
// card's text (see build-timeline.mjs), so scanning both would flag the exact same untagged string
// twice under two different paths for one real authoring decision. Scan the SSOT once, at the
// source, not its derivative.
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
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue; // not this check's job to validate JSON syntax
  }
  const cards = Array.isArray(data?.cards) ? data.cards : Array.isArray(data) ? data : [];
  cards.forEach((card, idx) => {
    if (!card || typeof card !== 'object') return;
    for (const field of ['zh', 'en']) {
      const text = card[field];
      if (typeof text !== 'string') continue;
      if (!HAS_CJK.test(text) && !/\d/.test(text) && !DIRECTIONAL_EN.test(text)) continue;
      totalCandidates++;
      const isDirectional = DIRECTIONAL_ZH.test(text) || DIRECTIONAL_EN.test(text) || /\d/.test(text);
      if (isDirectional) directionalCount++;
      const cxx = typeof card.fact === 'string' ? card.fact : null;
      const loc = `${rel}#${card.card_id ?? idx}.${field}`;
      if (cxx) {
        if (validClaims.has(cxx)) {
          okCount++;
          if (isDirectional) directionalOkCount++;
          rows.push({ file: loc, line: 0, text, fact: cxx, verdict: 'OK' });
        } else {
          failCount++;
          rows.push({ file: loc, line: 0, text, fact: cxx, verdict: 'FAIL', reason: factTableExists ? `${cxx} does not exist in ${path.relative(process.cwd(), factTablePath)}` : `${path.relative(process.cwd(), factTablePath)} does not exist — cannot verify tag ${cxx}` });
        }
      } else if (isDirectional) {
        warnCount++;
        rows.push({
          file: loc, line: 0, text, fact: null, verdict: 'WARN',
          reason: factTableExists
            ? 'contains a digit or directional/causal word but the card has no "fact" field'
            : `contains a digit or directional/causal word but ${path.relative(process.cwd(), factTablePath)} does not exist — create it and add a "fact": "Cxx" field, or remove the number/comparison from on-screen text`,
        });
      }
    }
  });
}

const allDirectionalVerified = directionalCount === 0 || directionalOkCount === directionalCount;

const summary = {
  src_dir: path.relative(process.cwd(), srcDir),
  fact_table: path.relative(process.cwd(), factTablePath),
  files_scanned: files.length,
  total_candidate_strings: totalCandidates,
  directional_or_numeric_strings: directionalCount,
  directional_verified: directionalOkCount,
  all_directional_verified: allDirectionalVerified,
  ok: okCount,
  warn: warnCount,
  fail: failCount,
  rows,
};

if (!factTableExists) {
  if (directionalCount === 0) {
    // I5(a): a genuinely legitimate SKIP — no fact table AND nothing fact-shaped on screen yet
    // (e.g. a fresh scaffold). gate.mjs greps stdout for "[SKIP]", same convention as
    // beat-hit-rate.mjs/timing-source-check.mjs, to report this as SKIP rather than PASS.
    console.log(`fact-strings-check: [SKIP] ${path.relative(process.cwd(), factTablePath)} not found and 0 candidate fact-shaped string(s) in ${path.relative(process.cwd(), srcDir)} — nothing to verify yet.`);
  } else {
    console.error(`fact-strings-check: [FAIL] ${path.relative(process.cwd(), factTablePath)} does not exist but ${directionalCount} candidate fact-shaped string(s) were found — create the fact table before this can pass (see WARN/FAIL rows below).`);
  }
}
console.log(`fact-strings-check: ${files.length} file(s), ${totalCandidates} candidate string(s) (CJK, digit, or English directional/comparative word), of which ${directionalCount} directional/causal/numeric assertion(s)`);
console.log(`  OK=${okCount}  WARN=${warnCount}  FAIL=${failCount}`);
for (const r of rows) {
  if (r.verdict === 'OK') continue;
  console.log(`  [${r.verdict}] ${r.file}:${r.line} "${r.text}"${r.fact ? ` (fact: ${r.fact})` : ''} — ${r.reason ?? ''}`);
}
if (directionalCount === 0) {
  console.log('directional assertions: 0 (no candidate strings, nothing to verify)');
} else if (allDirectionalVerified) {
  console.log(`directional assertions: ${directionalCount}/${directionalCount} fully verified`);
} else {
  console.log(`directional assertions: ${directionalOkCount}/${directionalCount} (not fully verified — see WARN/FAIL rows above)`);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');
  console.log(`wrote ${jsonOut}`);
}

const exitFail = failCount > 0 || !allDirectionalVerified || (strict && warnCount > 0);
process.exit(exitFail ? 1 : 0);
