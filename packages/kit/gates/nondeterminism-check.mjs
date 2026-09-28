#!/usr/bin/env node
// nondeterminism-check.mjs — a standalone grep gate forbidding the three most common sources of
// accidental non-determinism inside the whole `src/` tree (not just src/scenes — unlike the
// hex/seg-hardcoded-seconds gates in grep-gates-check.mjs, any of these three can just as easily
// hide in src/core/ or src/components/ and still break the "render = pure function of t" contract):
//   - `Math.random(`     — the canonical offender. Worse than an obvious crash: passed as a `seed:`
//                            it silently truncates to 0 inside core/random.ts's bitwise ops (see
//                            that file's own comment), so it doesn't even make determinism.mjs FAIL
//                            — it just quietly stops doing what the author intended. This static
//                            check is the real backstop (2026-09-28, K1 verifier finding); the
//                            fail-loud assertion in core/random.ts's rng()/hash() is the second one.
//   - `Date.now(`         — wall-clock time; a render at 14:00 and the same t at 14:05 must be
//                            pixel-identical, which Date.now() can never guarantee.
//   - `performance.now(`  — same problem as Date.now(), just higher resolution.
// A scene/component legitimately measuring ITS OWN render cost (main.ts's own `?prof` HUD) is the
// one sanctioned exception — main.ts is outside `src/scenes`+`src/components`, see the default
// scan roots below.
//
// Usage: node nondeterminism-check.mjs [srcDir1] [srcDir2] ...   (default: src/scenes src/components)
// Exit codes: 0 = 0 hits, 1 = at least one hit (printed as file:line: <text>), 2 = no srcDir found.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const srcDirs = (argv.length ? argv : ['src/scenes', 'src/components']).map((d) => path.resolve(d)).filter((d) => existsSync(d));
if (!srcDirs.length) {
  console.error(`nondeterminism-check: none of the requested source dirs exist (${(argv.length ? argv : ['src/scenes', 'src/components']).join(', ')}) — nothing to scan yet, treating as SKIP-shaped 0-hit pass`);
  process.exit(0);
}

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
const files = srcDirs.flatMap((d) => walk(d));

const PATTERNS = [
  { name: 'Math.random', re: /\bMath\.random\s*\(/, desc: 'non-seeded randomness — use core/random.ts `rng(seed)`/`hash(n, seed)`/`noise1/noise3` instead' },
  { name: 'Date.now', re: /\bDate\.now\s*\(/, desc: 'wall-clock time — render must be a pure function of the timeline second `t` only' },
  { name: 'performance.now', re: /\bperformance\.now\s*\(/, desc: 'wall-clock time — render must be a pure function of the timeline second `t` only' },
];

let anyHit = false;
for (const p of PATTERNS) {
  const hits = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (p.re.test(line)) hits.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${line.trim()}`);
    });
  }
  console.log(`nondeterminism-check: [${p.name}] ${hits.length} hit(s) — ${p.desc}`);
  for (const h of hits) console.log(`  ${h}`);
  if (hits.length) anyHit = true;
}
console.log(`nondeterminism-check: ${files.length} file(s) scanned (${srcDirs.map((d) => path.relative(process.cwd(), d)).join(', ')})`);
process.exit(anyHit ? 1 : 0);
