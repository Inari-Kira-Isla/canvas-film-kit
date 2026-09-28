#!/usr/bin/env node
// fonts.mjs — downloads the kit's default OFL 1.1 font set into public/fonts/ and writes
// fonts.lock.json (sha256 per file) so "same style on any computer" holds: a canvas that hits a
// missing glyph silently falls back to whatever the OS ships (Windows 微軟正黑體, Mac 蘋方, …) and
// the whole hand-drawn look drifts. Fonts are NEVER committed to canvas-film-kit itself (each CJK
// weight is multiple MB) — this script is the one place they get fetched, on demand, per project.
//
// Source: the Google Fonts CSS2 API (fonts.googleapis.com) resolves a family+weight request to the
// actual woff2 file URLs on fonts.gstatic.com — the same mechanism any website using Google Fonts
// relies on. A network failure here FAILS LOUD (exits non-zero) — this never silently skips and
// lets the caller believe fonts are ready when they are not.
//
// Usage: node fonts.mjs [--out public/fonts] [--lock fonts.lock.json]
// Exit codes: 0 = every family downloaded + locked, 1 = at least one family failed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
let outArg = 'public/fonts';
let lockArg = 'fonts.lock.json';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') outArg = argv[++i];
  else if (argv[i] === '--lock') lockArg = argv[++i];
}
const outDir = path.resolve(outArg);
const lockPath = path.resolve(lockArg);

// The kit's default type system (theme.ts `type:` block, K2+): display/body in Latin, a matching
// CJK pair, and a mono for on-screen code/numerals. All four are SIL Open Font License 1.1.
const FAMILIES = [
  { name: 'Inter', google: 'Inter', weights: '400;700', role: 'display/body (Latin)', oflSlug: 'inter' },
  { name: 'JetBrains Mono', google: 'JetBrains+Mono', weights: '400;700', role: 'mono', oflSlug: 'jetbrainsmono' },
  { name: 'Noto Sans TC', google: 'Noto+Sans+TC', weights: '400;700', role: 'cjk sans (body)', oflSlug: 'notosanstc' },
  { name: 'Noto Serif TC', google: 'Noto+Serif+TC', weights: '400;700', role: 'cjk serif (display)', oflSlug: 'notoseriftc' },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}
async function fetchBuffer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

mkdirSync(outDir, { recursive: true });

const lock = { generated: new Date().toISOString(), source: 'fonts.googleapis.com (CSS2 API) + google/fonts OFL.txt', families: {}, files: {} };
let anyFail = false;

for (const fam of FAMILIES) {
  const slug = fam.name.toLowerCase().replace(/\s+/g, '-');
  const famDir = path.join(outDir, slug);
  mkdirSync(famDir, { recursive: true });
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${fam.google}:wght@${fam.weights}&display=swap`;
    const css = await fetchText(cssUrl);
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
    const unique = [...new Set(urls)];
    if (!unique.length) throw new Error(`no font file URLs found in CSS2 response for ${fam.name} — Google Fonts API shape may have changed`);
    const files = [];
    for (let i = 0; i < unique.length; i++) {
      const buf = await fetchBuffer(unique[i]);
      const fileName = `${slug}-${i}.woff2`;
      const filePath = path.join(famDir, fileName);
      writeFileSync(filePath, buf);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      const relPath = path.relative(outDir, filePath);
      lock.files[relPath] = sha256;
      files.push({ path: relPath, sha256, bytes: buf.length });
    }
    let ofl = null;
    try {
      ofl = await fetchText(`https://raw.githubusercontent.com/google/fonts/main/ofl/${fam.oflSlug}/OFL.txt`);
      writeFileSync(path.join(famDir, 'OFL.txt'), ofl);
    } catch (e) {
      console.error(`fonts: WARN: could not fetch OFL.txt for ${fam.name} (${e.message}) — the font files themselves still downloaded and are locked, but re-run once network access to raw.githubusercontent.com is available.`);
    }
    lock.families[fam.name] = { role: fam.role, files: files.map((f) => f.path), ofl: ofl ? `${slug}/OFL.txt` : null };
    console.log(`fonts: [OK] ${fam.name} — ${files.length} file(s), ${files.reduce((a, f) => a + f.bytes, 0)} bytes total`);
  } catch (e) {
    anyFail = true;
    console.error(`fonts: [FAIL] ${fam.name} — ${e.message}`);
  }
}

if (anyFail) {
  console.error('\nfonts: at least one family failed to download — refusing to write a partial fonts.lock.json (a partial lock would let `kit doctor` silently pass on missing glyphs). Fix network access and re-run.');
  process.exit(1);
}

writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`\nfonts: wrote ${lockPath} (${Object.keys(lock.files).length} file(s) locked)`);
console.log('fonts: remember to `document.fonts.load()` every family before the first real render (see main.ts) — a canvas that paints before the font is ready silently falls back to a system font for that frame only, which `kit gate`\'s font-coverage check (a later batch) will not catch retroactively.');
process.exit(0);
