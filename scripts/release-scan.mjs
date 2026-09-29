#!/usr/bin/env node
// scripts/release-scan.mjs — the K5 "may this repo go public" gate (design doc §7.1). Scans every
// git-tracked file (by default) for personal paths, credential-shaped strings, and (optionally) an
// external, per-user/org list of private brand/identity terms. This is a HUMAN-REVIEW-ORIENTED
// scanner, not an auto-fixer: any hit is meant to block a release until a person looks at it and
// either fixes the content or (rarely, see ALLOWLIST below) confirms it is not a real leak.
//
// 2026-09-29 rewrite (post-publish-review C1 fix): this file used to hardcode a real owner's brand
// names, project codenames and personal identifiers directly in its own source (CATEGORIES 'brand'/
// 'internal-system'/'misc' + literal names in 'identity'), and exempted its own file from every
// category. That made the SCANNER ITSELF the leak: publishing this repo would publish the very list
// of private terms it exists to protect. Fixed by keeping ONLY generic, owner-agnostic rules in this
// file — local machine paths, email/phone-shaped strings, credential-shaped strings, `file:` local
// dependency URIs — and moving every private/brand/identity term OUT of the repo entirely, into a
// file the user points this script at (see loadPrivateTerms() below). Nothing under that mechanism
// ever gets committed here; scripts/private-terms.example.txt (repo-tracked) documents the format
// with synthetic examples only.
//
// Design doc §7.1's own categories, folded in here 1:1 (generic ones; private ones now external),
// plus scripts/check-no-absolute-paths.mjs's earlier, narrower package.json-only check (same bug
// class: an absolute `file:` dependency path, found by an independent K3 verifier — see that file's
// own header for the story). That standalone script still works and still runs in CI as a fast
// pre-check; this file is the full-scope version design doc §7.1 asks K5 to ship.
//
// What it does NOT do: fix anything, judge writing quality, or replace `gitleaks` (§7.1 explicitly
// wants BOTH `gitleaks detect --no-git` on the working tree and `gitleaks detect` on repo history —
// this script runs the working-tree pass itself when `gitleaks` is on PATH, and prints doctor-style
// install guidance instead of failing the whole scan when it isn't; the history pass is a separate,
// explicit step documented in README/CI because it needs an actual git history to inspect).
//
// Usage: node scripts/release-scan.mjs [rootDir] [--all] [--no-gitleaks] [--json <path>]
//   [rootDir]      defaults to this script's own repo root. Point it at ANY git repo (e.g. the
//                  scratchpad orphan-release-repo copy) to scan that instead.
//   --all          scan every file on disk under rootDir instead of `git ls-files` (use outside a
//                  git repo, or to double-check files `.gitignore` would otherwise hide from the
//                  default pass — .gitignore hiding a real secret from THIS scan is exactly the
//                  failure mode `gitleaks`'s own --no-git flag and this flag both guard against).
//   --no-gitleaks  skip the bundled gitleaks invocation (CI matrix legs without it installed use
//                  this and rely on a separate doctor-style notice instead of a hard fail).
//   --json <path>  also write the full machine-readable report there.
// Env:
//   RELEASE_SCAN_PRIVATE_TERMS=<path>  private brand/identity term list (see loadPrivateTerms()).
//                                      Defaults to ~/.config/canvas-film-kit/private-terms.txt.
// Exit codes: 0 = clean, 1 = at least one problem found, 2 = script itself could not run.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
let root;
let all = false;
let noGitleaks = false;
let jsonOut;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--all') all = true;
  else if (a === '--no-gitleaks') noGitleaks = true;
  else if (a === '--json') jsonOut = argv[++i];
  else if (!a.startsWith('--') && !root) root = a;
}
root = path.resolve(root ?? path.join(HERE, '..'));
if (!existsSync(root)) {
  console.error(`release-scan: root not found: ${root}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// File list: git-tracked by default (what would actually ship), full filesystem walk with --all.
// ---------------------------------------------------------------------------------------------
function gitTrackedFiles(dir) {
  const r = spawnSync('git', ['-C', dir, 'ls-files', '-z'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.split('\0').filter(Boolean).map((f) => path.join(dir, f));
}
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.cache']);
function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkAll(p, out);
    else out.push(p);
  }
  return out;
}
const files = all ? walkAll(root) : (gitTrackedFiles(root) ?? walkAll(root));
if (!all && !gitTrackedFiles(root)) {
  console.log(`release-scan: ${root} is not a git repo (or git failed) — fell back to a full filesystem walk`);
}

// Binary/media extensions: skip CONTENT scanning (no text patterns can live there in a way this
// script can usefully read), but filenames themselves are still checked below.
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mp3', '.wav', '.woff', '.woff2', '.ttf', '.otf', '.ico', '.icns']);

// ---------------------------------------------------------------------------------------------
// ALLOWLIST — design doc §7.1's own text says "唯一 allowlist: package.json repository/author 欄位
// 同 README 維護者一行". In practice, a pattern-matching tool that bans the literal string "/Users/"
// necessarily also matches ITS OWN source code documenting that ban (this file's and
// check-no-absolute-paths.mjs's regex definitions + comments) — that is not a leak, it is the
// scanner explaining itself. Every entry below is scoped to ONE category on ONE file, with a reason;
// nothing here suppresses a whole file or a whole category globally.
// ---------------------------------------------------------------------------------------------
const ALLOWLIST = [
  { file: 'scripts/check-no-absolute-paths.mjs', category: 'local-path', reason: 'documents the literal string it bans; its own bad-fixture example is a synthetic username, not a real one' },
  { file: 'scripts/__fixtures__/check-no-absolute-paths/bad/package.json', category: 'local-path', reason: 'intentional bad-fixture for that checker\'s own test; uses a synthetic username (example-user), not a real one' },
  { file: 'scripts/__fixtures__/check-no-absolute-paths/good/package.json', category: 'local-path', reason: 'intentional good-fixture pair for the same test' },
  { file: 'packages/kit/tts/providers/edge.mjs', category: 'secret', reason: 'TRUSTED_CLIENT_TOKEN is a long-published, non-account constant every community client of this unofficial endpoint uses (see this file\'s own header comment) — confirmed via `gitleaks detect`, also allowlisted in .gitleaksignore by fingerprint' },
  { file: 'packages/kit/tts/__tests__/run-all.mjs', category: 'secret', reason: 'deliberately fake key (design doc §4.2: "有一個測試用假 key 跑 provider 失敗路徑") used to test that a rejected credential never echoes back in stdout/stderr — not a real key' },
  { file: 'scripts/release-scan.mjs', category: 'local-path', reason: 'this file documents the literal path patterns it bans (e.g. "/Users/", "~/Projects") in its own regex source and comments — that is the scanner explaining itself, not a leak. It contains NO brand/identity literals any more (see 2026-09-29 header note), so no other category needs an entry here.' },
  { file: 'packages/kit/scaffold/new-film.mjs', category: 'identity', reason: '"scaffold@canvas-film-kit.invalid" is a synthetic fallback git-commit-author email under the reserved .invalid TLD (RFC 2606) — used ONLY for the scaffold\'s own first commit when no real git identity is configured on the machine, never a real person\'s address.' },
  { file: 'packages/kit/scaffold/__tests__/scaffold-git-identity.mjs', category: 'identity', reason: 'test asserts the same synthetic .invalid fallback email (RFC 2606) used by new-film.mjs' },
  { file: 'scripts/release-scan.mjs', category: 'identity', reason: 'this ALLOWLIST array\'s own reason string above quotes the synthetic fallback email literally (to describe exactly which finding it exempts on new-film.mjs) — the scanner explaining itself, not a leak.' },
];
// This script's OWN bad-fixture directory (used by `kit gate`-style self-tests, see
// scripts/__fixtures__/release-scan/{bad,good}/) is exempt from every category wholesale: unlike the
// single-purpose file-level entries above, everything under bad/ exists specifically to contain
// synthetic examples of every category this scanner checks, on purpose, and none of it is real.
const ALLOWLIST_DIR_PREFIXES = ['scripts/__fixtures__/release-scan/bad/'];
function isAllowlisted(relFile, category) {
  if (ALLOWLIST_DIR_PREFIXES.some((p) => relFile.startsWith(p))) return true;
  return ALLOWLIST.some((e) => e.file === relFile && e.category === category);
}

// ---------------------------------------------------------------------------------------------
// Category patterns — GENERIC ONLY. Every pattern below is owner-agnostic: it detects a *shape*
// (a local filesystem path, an email address, a credential) rather than any specific person's or
// brand's literal name. That is deliberate — this file is meant to be published, so it must never
// itself need to carry the very private strings it's checking for. Brand names, internal project
// codenames, and personal identifiers are NOT here — see loadPrivateTerms() below for those.
// ---------------------------------------------------------------------------------------------
const CATEGORIES = [
  {
    id: 'local-path',
    label: 'local machine path',
    patterns: [
      /\/Users\//,
      /C:\\Users\\/i,
      /~\/\.claude/,
      /~\/\.openclaw/,
      /~\/Projects/,
      /~\/work\b/,
      /\bhomedir\(\)/,
    ],
  },
  {
    id: 'identity',
    label: 'personal identity pattern (generic shape: email / phone-shaped)',
    patterns: [
      /claude\.ai\/code\/session/i, // a shared-session link is itself an exposure, regardless of who owns it
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // any email address
      /\+?853[ -]?\d{4}[ -]?\d{4}/, // Macau phone, with country code — generic format, safe in code too
      /\+?852[ -]?\d{4}[ -]?\d{4}/, // HK phone, with country code — generic format, safe in code too
    ],
  },
  {
    // A bare 8-digit run (design doc §7.1's "8 位數連號") is a plausible Macau/HK phone number with
    // no country code — but it is ALSO an ordinary hash seed, magic constant, date (YYYYMMDD), or
    // port/PID in source code (e.g. this repo's own noise-hashing primes in core/random.ts). Scoping
    // it to prose-like files only (never .ts/.mjs/.js/.json/.py) keeps the real-leak detection value
    // for docs/README/commit-message-shaped content without drowning in code-constant noise.
    id: 'identity-prose',
    label: 'personal identity pattern (bare phone-shaped number, prose files only)',
    proseOnly: true,
    patterns: [/(?<!\d)\d{8}(?!\d)/],
  },
  {
    id: 'secret',
    label: 'credential-shaped string',
    patterns: [
      /sk-[A-Za-z0-9]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\./, /AKIA[A-Z0-9]{16}/, /ghp_[A-Za-z0-9]{20,}/,
      /xox[bp]-[A-Za-z0-9-]{10,}/, /\b[0-9a-f]{32,}\b/i,
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Private terms — brand names, internal project codenames, personal names, and any other
// owner-specific string that must never live in a PUBLIC repo. This repo's own source, comments and
// fixtures may not contain any of these literally (see the 2026-09-29 header note) — instead each
// user/org supplies their OWN list in a file OUTSIDE this repo, and this scan reads it at run time.
//
// Format: one term per line in a plain text file. Blank lines and lines starting with `#` are
// ignored. A term made only of ASCII word characters (letters/digits/_/-) is matched with `\b`word
// boundaries (case-insensitive); anything else (CJK, punctuation, spaces) is matched as a literal
// case-insensitive substring — JS regex `\b` is ASCII-only and would silently never match CJK terms.
//
// Location: RELEASE_SCAN_PRIVATE_TERMS=<path> env var, else ~/.config/canvas-film-kit/private-terms.txt.
// Missing file = this category is SKIPPED with a printed notice, not a hard failure — a public user
// of this generic template has no private terms of their own by default, so `--all`/CI on a fork
// with no such file must not fail just because it doesn't exist. See scripts/private-terms.example.txt
// (repo-tracked, synthetic examples only) for the format and a starting point to copy.
// ---------------------------------------------------------------------------------------------
function loadPrivateTerms() {
  const p = process.env.RELEASE_SCAN_PRIVATE_TERMS || path.join(os.homedir(), '.config', 'canvas-film-kit', 'private-terms.txt');
  if (!existsSync(p)) {
    console.log(`\nrelease-scan: no private-terms file at ${p} — private brand/identity term checks SKIPPED.`);
    console.log('  Set RELEASE_SCAN_PRIVATE_TERMS=<path>, or create the default file, before a real release.');
    console.log('  Format/example: scripts/private-terms.example.txt');
    return [];
  }
  const terms = readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const patterns = terms.map((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const asciiWord = /^[A-Za-z0-9_-]+$/.test(term);
    return new RegExp(asciiWord ? `\\b${escaped}\\b` : escaped, 'i');
  });
  console.log(`\nrelease-scan: loaded ${patterns.length} private term(s) from ${p}`);
  return patterns;
}
const PRIVATE_TERM_PATTERNS = loadPrivateTerms();
if (PRIVATE_TERM_PATTERNS.length) {
  CATEGORIES.push({
    id: 'private-term',
    label: 'private brand/identity term (from external RELEASE_SCAN_PRIVATE_TERMS list)',
    patterns: PRIVATE_TERM_PATTERNS,
  });
}
// Filename-only checks (not content) — a real screenshot or a stray dotfile/cache dir slipping into
// git is itself the leak, regardless of what bytes are inside it.
const FILENAME_PATTERNS = [
  { id: 'misc', re: /(^|\/)__pycache__(\/|$)/, label: '__pycache__/ directory tracked in git' },
  { id: 'misc', re: /(^|\/)\.DS_Store$/, label: '.DS_Store tracked in git' },
  { id: 'misc', re: /(^|\/)qa\/.*\.png$/, label: 'a real render screenshot under qa/ tracked in git (qa/ is meant to be regenerated, not committed)' },
];

// ---------------------------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------------------------
const problems = [];
for (const abs of files) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  for (const fp of FILENAME_PATTERNS) {
    if (fp.re.test(rel) && !isAllowlisted(rel, fp.id)) {
      problems.push({ file: rel, category: fp.id, label: fp.label, line: 0, match: rel });
    }
  }
  const ext = path.extname(rel).toLowerCase();
  if (BINARY_EXT.has(ext)) continue;
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { continue; } // unreadable/binary-with-weird-ext — skip content scan
  // eslint-disable-next-line no-control-regex
  if (text.includes('\u0000')) continue; // still binary despite the extension guess
  const PROSE_EXT = new Set(['.md', '.txt', '.html']);
  const lines = text.split('\n');
  for (const cat of CATEGORIES) {
    if (isAllowlisted(rel, cat.id)) continue;
    if (cat.proseOnly && !PROSE_EXT.has(ext)) continue;
    for (const re of cat.patterns) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (let i = 0; i < lines.length; i++) {
        const m = g.exec(lines[i]);
        if (m) {
          problems.push({ file: rel, category: cat.id, label: cat.label, line: i + 1, match: m[0] });
          g.lastIndex = 0; // one hit per (line, pattern) is enough to flag for review
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// gitleaks — design doc §7.1: "外加 gitleaks detect --no-git（工作樹）...兩者 0 finding". Only the
// working-tree half runs HERE (this script has no opinion about git history, which the orphan-repo
// step in §7.2 handles by construction — a single fresh commit has no history to leak from). Doctor
// pattern: not installed = a printed install hint, not a hard failure of this script (CI legs that
// lack it rely on the pattern-list scan above plus a separate, explicit gitleaks step).
// ---------------------------------------------------------------------------------------------
let gitleaksResult = { ran: false, findings: null };
if (!noGitleaks) {
  const has = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  if (has.status === 0) {
    // NOTE: gitleaks discovers `.gitleaksignore` relative to its OWN working directory, not
    // `--source` — passing `--source .` with `cwd: root` (rather than `--source <absolute root>`
    // from wherever this script happened to be invoked) is what makes it actually find `root`'s
    // `.gitleaksignore` (verified by hand: an absolute --source from a different cwd silently
    // ignores the file and re-reports the one known-safe finding documented there).
    const r = spawnSync('gitleaks', ['detect', '--no-git', '--source', '.', '--no-banner'], { encoding: 'utf8', cwd: root });
    gitleaksResult.ran = true;
    gitleaksResult.findings = r.status === 0 ? 0 : 'nonzero (see output above)';
    console.log('\n=== gitleaks detect --no-git ===');
    if (r.stdout) console.log(r.stdout.trimEnd());
    if (r.stderr) console.log(r.stderr.trimEnd());
    if (r.status !== 0) problems.push({ file: '(gitleaks)', category: 'secret', label: 'gitleaks working-tree scan', line: 0, match: 'gitleaks reported findings — see output above' });
  } else {
    console.log('\n=== gitleaks ===');
    console.log('[SKIP] gitleaks not found on PATH — install it before a real release:');
    console.log('  macOS:   brew install gitleaks');
    console.log('  Linux:   see https://github.com/gitleaks/gitleaks#installing');
    console.log('  Windows: winget install gitleaks OR scoop install gitleaks');
    console.log('This scan\'s own pattern list still ran; gitleaks catches shapes the list above does not enumerate.');
  }
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------
console.log(`\nrelease-scan: scanned ${files.length} file(s) under ${root} (${all ? 'full filesystem walk' : 'git-tracked only'})`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ root, scanned: files.length, problems, gitleaks: gitleaksResult }, null, 2));
  console.log(`release-scan: wrote ${jsonOut}`);
}
if (problems.length === 0) {
  console.log('release-scan: [PASS] 0 findings — clean to release as far as this scan can tell (gitleaks + a human read-through still matter).');
  process.exit(0);
}
console.error(`release-scan: [FAIL] ${problems.length} finding(s):`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line} — [${p.category}] ${p.label}: ${JSON.stringify(p.match)}`);
}
process.exit(1);
