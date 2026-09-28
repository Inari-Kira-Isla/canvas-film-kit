#!/usr/bin/env node
// tts/__tests__/run-all.mjs — provider contract test suite (design doc §9 K3 acceptance:
// "provider合約測試用錄音fixture（零網絡）；假key失敗路徑stdout/stderr grep 0").
//
// Three kinds of test here, deliberately separated:
//   1. `none` provider contract tests — a RECORDED audio fixture (tts/__fixtures__/sample-line.wav,
//      a deterministic 1.5s tone standing in for "a line someone recorded"), zero network, zero
//      credential. This is the "provider合約測試" the acceptance criterion asks for.
//   2. Fake-key failure-path tests for minimax/openai — these DO attempt a real network call (an
//      invalid key still has to reach the provider to get rejected), but assert the thrown error's
//      message never contains the fake key substring — grep-testing tts/provider.mjs's redact().
//      If the sandbox this runs in has no network at all, the call fails even earlier (DNS/connect
//      error) and the redaction assertion still holds trivially (the key was never echoed either
//      way) — this test never depends on actually reaching MiniMax/OpenAI's servers to be valid.
//   3. `system` provider contract tests (K4) — a FAKE backend injected via synthesizeCore() (see
//      providers/system.mjs's own header for why: an automated, cross-platform, zero-dependency
//      suite cannot assume `say`/PowerShell/espeak-ng are installed on whatever machine runs it).
//      The fake backend just copies the SAME recorded fixture WAV `none` uses — this proves the
//      shared ffmpeg-normalise + ffprobe-duration + return-shape contract works, without depending
//      on any real OS speech engine. The REAL `say` backend gets one genuine invocation in the
//      separate, opt-in tts/__tests__/smoke-system-macos.mjs (macOS only, not part of this suite).
//
// Usage: node run-all.mjs
// Exit: 0 = all PASS, 1 = at least one FAIL.
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { provider as none } from '../providers/none.mjs';
import { provider as minimax } from '../providers/minimax.mjs';
import { provider as openai } from '../providers/openai.mjs';
import { synthesizeCore } from '../providers/system.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, '..', '__fixtures__', 'sample-line.wav');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`[PASS] ${name}`); pass++; }
  else { console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); fail++; }
}
async function expectThrows(name, fn) {
  try {
    await fn();
    check(name, false, 'expected it to throw, but it did not');
    return null;
  } catch (e) {
    check(name, true);
    return e;
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'tts-contract-'));
try {
  // ---- 1. none provider: real recorded fixture, zero network, zero credential ----
  {
    const outWav = path.join(scratch, 'line.wav');
    copyFileSync(FIXTURE, outWav);
    const res = await none.synthesize({ text: 'placeholder', voice: 'n/a', lang: 'en', outWav });
    check('none: returns the same wav path', res.wav === outWav);
    check('none: durationSec matches the fixture (~1.5s)', Math.abs(res.durationSec - 1.5) < 0.05, `got ${res.durationSec}`);
    check('none: timingSource is "none" (no provider word timestamps)', res.timingSource === 'none');
    check('none: words is undefined', res.words === undefined);
  }

  // ---- 2. none provider: missing file -> fail loud, never fabricate a duration ----
  {
    const outWav = path.join(scratch, 'does-not-exist.wav');
    await expectThrows('none: missing outWav throws (never fabricates a duration)', () =>
      none.synthesize({ text: 'x', voice: 'n/a', lang: 'en', outWav }),
    );
  }

  // ---- 3. fake-key failure paths: error message must never contain the fake key ----
  {
    const fakeKey = 'sk-FAKEKEY1234567890ABCDEFGHIJKLMNOP';
    process.env.OPENAI_API_KEY = fakeKey;
    const outWav = path.join(scratch, 'openai-fail.wav');
    const e = await expectThrows('openai: fake key call fails', () =>
      openai.synthesize({ text: 'hello', voice: 'alloy', lang: 'en', outWav }),
    );
    if (e) check('openai: error message does not contain the fake key', !e.message.includes(fakeKey), e.message);
    delete process.env.OPENAI_API_KEY;
  }
  {
    const fakeKey = 'fakeminimaxkeyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    process.env.MINIMAX_API_KEY = fakeKey;
    const outWav = path.join(scratch, 'minimax-fail.wav');
    const e = await expectThrows('minimax: fake key call fails', () =>
      minimax.synthesize({ text: 'hello', voice: 'Casual_Guy', lang: 'zh', outWav }),
    );
    if (e) check('minimax: error message does not contain the fake key', !e.message.includes(fakeKey), e.message);
    delete process.env.MINIMAX_API_KEY;
  }
  {
    // no key set at all -> must fail with a clear "not set" message, still zero network attempted
    const outWav = path.join(scratch, 'minimax-nokey.wav');
    await expectThrows('minimax: missing MINIMAX_API_KEY throws without a network call', () =>
      minimax.synthesize({ text: 'hello', voice: 'Casual_Guy', lang: 'zh', outWav }),
    );
  }

  // ---- 4. system provider: FAKE backend, zero network, zero platform dependency (K4) ----
  {
    const fakeBackend = {
      name: 'fake backend (test)',
      available: () => true,
      run(_text, _voice, _rate, outTmpPath) {
        copyFileSync(FIXTURE, outTmpPath); // stand in for a real say/SAPI/espeak-ng WAV
      },
    };
    const outWav = path.join(scratch, 'system-line.wav');
    const res = await synthesizeCore(fakeBackend, { text: 'placeholder', voice: undefined, lang: 'en', outWav });
    check('system: returns the requested outWav path', res.wav === outWav);
    check('system: durationSec matches the fixture (~1.5s) after ffmpeg normalise', Math.abs(res.durationSec - 1.5) < 0.1, `got ${res.durationSec}`);
    check('system: timingSource is "none" (no backend gives per-word timestamps)', res.timingSource === 'none');
    check('system: words is undefined', res.words === undefined);
  }
  {
    // no backend available on this "platform" -> fail loud with an install hint, never silently no-op
    const noBackend = undefined;
    const outWav = path.join(scratch, 'system-nobackend.wav');
    const e = await expectThrows('system: no available backend throws (never silently produces nothing)', () =>
      synthesizeCore(noBackend, { text: 'hello', voice: undefined, lang: 'en', outWav }),
    );
    if (e) check('system: error message names the Linux fallback install command', e.message.includes('espeak-ng'), e.message);
  }
  {
    // backend throws (e.g. the real binary failed) -> re-thrown with the provider's own error prefix,
    // never swallowed into a fabricated success
    const throwingBackend = { name: 'throwing backend (test)', available: () => true, run() { throw new Error('boom'); } };
    const outWav = path.join(scratch, 'system-backend-fail.wav');
    await expectThrows('system: a backend that throws propagates as a real failure', () =>
      synthesizeCore(throwingBackend, { text: 'hello', voice: undefined, lang: 'en', outWav }),
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
