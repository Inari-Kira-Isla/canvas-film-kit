#!/usr/bin/env node
// tts/__tests__/smoke-system-macos.mjs — ONE real, end-to-end invocation of the `system` provider's
// actual macOS backend (`say`), as opposed to run-all.mjs's fake-backend contract test (see
// providers/system.mjs's own header for why the two are split). Not part of the zero-dependency
// cross-platform suite — this file SKIPs (exit 0) on any non-macOS platform, and is meant to be run
// by hand / in a macOS-only CI job, never assumed to pass on Linux/Windows CI.
//
// Usage: node smoke-system-macos.mjs
// Exit: 0 = PASS or SKIP (not darwin), 1 = the real `say` backend failed end-to-end.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { provider } from '../providers/system.mjs';

if (process.platform !== 'darwin') {
  console.log(`smoke-system-macos: [SKIP] process.platform="${process.platform}" — this smoke test only runs the macOS \`say\` backend.`);
  process.exit(0);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'system-tts-smoke-'));
try {
  const outWav = path.join(scratch, 'smoke.wav');
  const res = await provider.synthesize({
    text: 'Canvas film kit system provider smoke test.',
    voice: 'Samantha',
    lang: 'en',
    rate: 1.0,
    outWav,
  });
  const ok = existsSync(res.wav) && res.durationSec > 0.5 && res.timingSource === 'none';
  if (!ok) {
    console.error(`smoke-system-macos: [FAIL] unexpected result: ${JSON.stringify(res)}`);
    process.exit(1);
  }
  console.log(`smoke-system-macos: [PASS] real \`say\` synthesis: ${res.wav} (${res.durationSec.toFixed(2)}s, timingSource=${res.timingSource})`);
  process.exit(0);
} catch (e) {
  console.error(`smoke-system-macos: [FAIL] ${e.message}`);
  process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
