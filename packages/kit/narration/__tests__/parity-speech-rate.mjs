#!/usr/bin/env node
// narration/__tests__/parity-speech-rate.mjs — verifies narration/speech-rate.mjs (this kit, zero
// Python) reaches the SAME verdict as the Python original it was ported from, on the SAME fixtures
// (design doc §9 K3 acceptance: "speech-rate Node vs Python 對同 fixture 判定一致").
//
// This is a ONE-TIME development-time verification, not part of `kit gate` and not shipped to a
// scaffolded project — this kit's whole point is that Python is NOT required (design doc §2.1
// "核心零 Python"). It SKIPs cleanly (exit 0) when either python3 or the private source script isn't
// present (e.g. a contributor's machine, or CI, neither of which need to re-derive this parity once
// it has been checked once here).
//
// PYTHON_SPEECH_RATE_GATE env var must point at the original .py file — there is no built-in default
// path (a contributor's own local checkout of that private original is exactly that: private and
// machine-specific, and this kit never hardcodes anyone's home-directory layout, see
// docs/design/why-gates.md). Uses the SAME NARRATION_SYNC_PREPROD_PATH env var contract as both
// implementations, so one fixture tree serves both.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, '..', '__fixtures__', 'speech-rate');
const PY_SCRIPT = process.env.PYTHON_SPEECH_RATE_GATE;
const NODE_SCRIPT = path.join(HERE, '..', 'speech-rate.mjs');

function haveCmd(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

if (!haveCmd('python3')) {
  console.log('SKIP: python3 not available — nothing to compare against (this kit does not require Python)');
  process.exit(0);
}
if (!PY_SCRIPT || !existsSync(PY_SCRIPT)) {
  console.log(`SKIP: PYTHON_SPEECH_RATE_GATE not set (or points nowhere) — set it to compare against a local copy of the original Python script`);
  process.exit(0);
}

let pass = 0, fail = 0;
for (const fixture of ['good', 'bad']) {
  const dir = path.join(FIXTURES_DIR, fixture);
  const preprod = path.join(dir, 'docs', 'preproduction.md');
  const env = { ...process.env, NARRATION_SYNC_PREPROD_PATH: preprod };

  const py = spawnSync('python3', [PY_SCRIPT, dir], { encoding: 'utf8', env });
  const node = spawnSync('node', [NODE_SCRIPT, dir], { encoding: 'utf8', env });

  const same = py.status === node.status;
  if (same) {
    console.log(`[PASS] ${fixture}: python exit=${py.status}, node exit=${node.status} (agree)`);
    pass++;
  } else {
    console.error(`[FAIL] ${fixture}: python exit=${py.status}, node exit=${node.status} (DISAGREE)`);
    console.error('  python stderr:', py.stderr);
    console.error('  node stderr:', node.stderr);
    fail++;
  }
}

// ---- K4: `wav-source` — a DOCUMENTED, INTENTIONAL divergence, not a parity bug. speech-rate.mjs's
// resolveSource() accepts .mp3 OR .wav (see that file's own header comment); the Python original
// this was ported from only ever accepted .mp3. Asserting a plain exit-code match here would be
// wrong in BOTH directions: silently accepting the divergence hides it from parity tooling, but
// treating it as a [FAIL] would misreport an intentional widening as a bug. This block instead
// locks in the EXACT expected shape of the divergence (Node PASS, Python FAIL-on-extension) so any
// future change to either script (Node stops accepting .wav, or Python starts accepting it) shows up
// here as a real, visible change instead of silence either way.
{
  const dir = path.join(FIXTURES_DIR, 'wav-source');
  const preprod = path.join(dir, 'docs', 'preproduction.md');
  const env = { ...process.env, NARRATION_SYNC_PREPROD_PATH: preprod };

  const py = spawnSync('python3', [PY_SCRIPT, dir], { encoding: 'utf8', env });
  const node = spawnSync('node', [NODE_SCRIPT, dir], { encoding: 'utf8', env });

  const expected = node.status === 0 && py.status !== 0 && /\.mp3/.test(py.stderr ?? '') && /\.wav/.test(py.stderr ?? '');
  if (expected) {
    console.log(`[PASS] wav-source: node exit=0 (accepts .wav, documented), python exit=${py.status} (rejects .wav extension, documented) — divergence is exactly the known/expected shape`);
    pass++;
  } else {
    console.error(`[FAIL] wav-source: divergence no longer matches the documented shape (node exit=${node.status}, python exit=${py.status}) — re-check speech-rate.mjs's header comment and this file's own comment above, one of the two scripts' .wav handling changed`);
    console.error('  python stderr:', py.stderr);
    console.error('  node stderr:', node.stderr);
    fail++;
  }
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
