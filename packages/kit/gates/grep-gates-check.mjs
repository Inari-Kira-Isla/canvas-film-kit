#!/usr/bin/env node
// grep-gates-check.mjs — two textual grep gates, as a standalone, independently-testable script.
//
// Gate 1 (hex):               no `#RRGGBB` literal anywhere in <srcDir> — every colour must come
//                              from `P` (src/core/color.template.ts), per the hand-off contract in
//                              src/core/timeline.template.ts.
// Gate 2 (seg-hardcoded-secs): no raw second literal passed as seg()'s 2nd+ arg in <srcDir> — every
//                              cut point must come from `T` (same hand-off contract), never a bare
//                              number typed straight into a scene file.
//
// Usage: node grep-gates-check.mjs [srcDir]   (default: src/scenes)
// Exit codes: 0 = both gates 0 hits, 1 = at least one hit (printed as file:line: <text>), 2 = srcDir missing.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve(process.argv[2] ?? 'src/scenes');
if (!existsSync(srcDir)) {
  console.error(`grep-gates-check: srcDir not found: ${srcDir}`);
  process.exit(2);
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
const files = walk(srcDir);

const GATES = [
  { name: 'hex', re: /#[0-9a-fA-F]{6}/, desc: 'hardcoded hex literal (must go through P, see timeline hand-off contract)' },
  { name: 'seg-hardcoded-seconds', re: /seg\(t,\s*[0-9]/, desc: 'hardcoded second passed to seg() (must go through T)' },
];

let anyHit = false;
for (const g of GATES) {
  const hits = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (g.re.test(line)) hits.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${line.trim()}`);
    });
  }
  console.log(`grep-gates-check: [${g.name}] ${hits.length} hit(s) — ${g.desc}`);
  for (const h of hits) console.log(`  ${h}`);
  if (hits.length) anyHit = true;
}
console.log(`grep-gates-check: ${files.length} file(s) scanned (${srcDir})`);
process.exit(anyHit ? 1 : 0);
