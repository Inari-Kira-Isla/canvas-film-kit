#!/usr/bin/env node
// font-coverage.mjs — K4: "any computer, same style" (design doc §5.3) only holds if every character
// the film actually puts on screen has a glyph in one of the fonts `kit fonts` locked. A canvas that
// hits a missing glyph SILENTLY falls back to whatever the OS ships (Windows 微軟正黑體, Mac 蘋方,
// Linux's default CJK fallback) for that one character — visually invisible in a quick look, but a
// real style break the moment someone renders on a different machine. This is a MECHANICAL check
// (a font file either has the glyph or it doesn't) — no taste judgment, so unlike beat-hit-rate it
// really can FAIL the gate.
//
// What it scans for on-screen text:
//   1. every string value in src/content/*.json (cards.json etc.) under a "display text" key name
//      (zh/en/label/text/title/subtitle/caption/name/description — see TEXT_KEYS below), OR any
//      string value (regardless of key name) that contains a CJK character (same heuristic
//      fact-strings-check.mjs uses) — catches unknown/future text fields without an allowlist edit.
//   2. every string literal passed to a fillText(...)/label(...) call in src/scenes/**/*.ts and
//      src/components/**/*.ts (same CALL_LINE convention as fact-strings-check.mjs) — here ALL
//      characters count, not just CJK, since a missing Latin glyph in a display font is just as real
//      a style break.
//
// What it checks against: fonts.lock.json's `families` (written by `kit fonts`) — for each family,
// every locked file under public/fonts/ is opened with fontkit (pure-JS OpenType/TrueType/WOFF/WOFF2
// parser, MIT) and unioned into one "does ANY locked font have this glyph" test. Union (not
// per-family-per-script) matches the real risk: whichever family a scene's CSS font-family list
// picks first with the glyph is what actually renders — the meaningful question is "does at least
// one of the fonts this project ships have it", not "does the 'right' family have it".
//
// SKIP (not FAIL) when fonts.lock.json doesn't exist yet — same "grows into it" shape as
// fact-strings-check.mjs: a brand-new scaffold hasn't run `kit fonts` yet.
//
// Usage: node font-coverage.mjs [root] [--json out.json]
// Exit codes: 0 = PASS or SKIP, 1 = at least one on-screen character has no glyph in any locked
// font, 2 = the script itself could not run (bad fonts.lock.json, a locked file failed to parse).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
let jsonOut;
{
  const i = args.indexOf('--json');
  if (i !== -1) { jsonOut = args[i + 1]; args.splice(i, 2); }
}
const root = path.resolve(args[0] ?? '.');

function fail(msg) {
  console.error(`font-coverage: ${msg}`);
  process.exit(2);
}
function done(status, msg) {
  console.log(`font-coverage: [${status}] ${msg}`);
  process.exit(0);
}

const lockPath = path.join(root, 'fonts.lock.json');
if (!existsSync(lockPath)) {
  done('SKIP', `${path.relative(root, lockPath) || 'fonts.lock.json'} not found — run \`kit fonts\` first (a brand-new scaffold has not downloaded fonts yet).`);
}

let lock;
try {
  lock = JSON.parse(readFileSync(lockPath, 'utf8'));
} catch (e) {
  fail(`${lockPath} is not valid JSON: ${e.message}`);
}
const families = lock.families ?? {};
if (Object.keys(families).length === 0) fail(`${lockPath} has no "families" entries — re-run \`kit fonts\`.`);

let fontkit;
try {
  fontkit = require('fontkit');
} catch (e) {
  fail(`fontkit not found via normal Node module resolution (${e.message}) — canvas-film-kit declares fontkit as its own dependency; run \`npm install\` in the film project first.`);
}

// ---- load every locked font file, build one union "has glyph" predicate ----
const publicFontsDir = path.join(root, 'public', 'fonts');
const loadedFonts = [];
const loadErrors = [];
for (const [famName, famInfo] of Object.entries(families)) {
  for (const relFile of famInfo.files ?? []) {
    const abs = path.join(publicFontsDir, relFile);
    if (!existsSync(abs)) {
      loadErrors.push(`${famName}: ${relFile} is listed in fonts.lock.json but missing on disk (${abs}) — run \`kit fonts\` again.`);
      continue;
    }
    try {
      loadedFonts.push({ family: famName, file: relFile, font: fontkit.openSync(abs) });
    } catch (e) {
      loadErrors.push(`${famName}: ${relFile} failed to parse (${e.message})`);
    }
  }
}
if (loadErrors.length) fail(loadErrors.join('\n'));
if (loadedFonts.length === 0) fail('fonts.lock.json has families but zero loadable font files — nothing to check coverage against.');

const coverageCache = new Map();
function hasGlyph(cp) {
  if (coverageCache.has(cp)) return coverageCache.get(cp);
  const has = loadedFonts.some(({ font }) => {
    try {
      return font.hasGlyphForCodePoint(cp);
    } catch {
      return false;
    }
  });
  coverageCache.set(cp, has);
  return has;
}

// ---- gather on-screen text ----
const HAS_CJK = /[぀-ヿ㐀-鿿가-힣]/;
const TEXT_KEYS = new Set(['zh', 'en', 'label', 'text', 'title', 'subtitle', 'caption', 'name', 'description', 'headline', 'body']);
const ID_LIKE_KEYS = new Set(['card_id', 'n_id', 'id', 'scene', 'source', 'source_id', 'url', 'license', 'unit', 'fictional', 'retrieved', 'claim_id', 'dataset_id', 'kind', 'type']);

const candidates = []; // { text, location }

function walkJsonStrings(value, keyName, location) {
  if (typeof value === 'string') {
    const useByKey = keyName !== undefined && TEXT_KEYS.has(keyName) && !ID_LIKE_KEYS.has(keyName);
    const useByContent = !ID_LIKE_KEYS.has(keyName ?? '') && HAS_CJK.test(value);
    if (useByKey || useByContent) candidates.push({ text: value, location });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkJsonStrings(v, keyName, `${location}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkJsonStrings(v, k, `${location}.${k}`);
  }
}

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

// 1. src/content/*.json
const contentDir = path.join(root, 'src', 'content');
for (const file of walkFiles(contentDir, /\.json$/)) {
  const rel = path.relative(root, file);
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue; // not this check's job to validate JSON syntax
  }
  walkJsonStrings(data, undefined, rel);
}

// 2. fillText(...)/label(...) string literals in src/scenes + src/components
const CALL_LINE = /\b(fillText|label)\s*\(/;
const STRING_LIT = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
for (const dir of [path.join(root, 'src', 'scenes'), path.join(root, 'src', 'components')]) {
  for (const file of walkFiles(dir, /\.(ts|tsx)$/)) {
    const rel = path.relative(root, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!CALL_LINE.test(line)) return;
      for (const m of line.matchAll(STRING_LIT)) {
        const text = m[1] ?? m[2] ?? '';
        if (text) candidates.push({ text, location: `${rel}:${i + 1}` });
      }
    });
  }
}

// ---- check coverage ----
const missingByChar = new Map(); // char -> Set(locations)
let totalChars = 0;
for (const { text, location } of candidates) {
  for (const ch of text) {
    if (/\s/.test(ch)) continue; // whitespace is never a glyph-coverage question
    totalChars++;
    const cp = ch.codePointAt(0);
    if (!hasGlyph(cp)) {
      if (!missingByChar.has(ch)) missingByChar.set(ch, new Set());
      missingByChar.get(ch).add(location);
    }
  }
}

const fontList = loadedFonts.map((f) => `${f.family}/${f.file}`);
console.log(`font-coverage: ${candidates.length} candidate string(s), ${totalChars} non-whitespace character(s) checked against ${loadedFonts.length} locked font file(s): ${fontList.join(', ')}`);

const summary = {
  root,
  fonts_checked: fontList,
  candidate_strings: candidates.length,
  characters_checked: totalChars,
  missing_characters: [...missingByChar.entries()].map(([ch, locs]) => ({ char: ch, codepoint: `U+${ch.codePointAt(0).toString(16).toUpperCase()}`, locations: [...locs] })),
};

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');

if (missingByChar.size > 0) {
  console.error(`font-coverage: [FAIL] ${missingByChar.size} character(s) missing from every locked font:`);
  for (const row of summary.missing_characters) {
    console.error(`  "${row.char}" (${row.codepoint}) — seen at ${row.locations.slice(0, 5).join(', ')}${row.locations.length > 5 ? ` (+${row.locations.length - 5} more)` : ''}`);
  }
  process.exit(1);
}
console.log('font-coverage: [PASS] every on-screen character has a glyph in at least one locked font');
process.exit(0);
