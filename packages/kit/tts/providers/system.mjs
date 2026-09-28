// tts/providers/system.mjs — the kit's TRULY FREE, OFFLINE TTS option (K4 addition). Added because
// the `edge` provider's free endpoint is unofficial and, as of this kit release, returns HTTP 403
// for many callers (Microsoft has tightened the unofficial endpoint — see providers/edge.mjs's own
// "may simply stop working" warning materialising) — a project with zero budget and zero network
// tolerance (design doc §9 K4: "零網絡" demos) still needs SOME way to get real speech audio, not
// just the `none` provider's "bring your own WAV".
//
// Backend = whatever the OS already ships, no install, no account, no key:
//   macOS   -> `say` (Speech Synthesis manager), writes WAVE directly (`--file-format=WAVE`).
//   Windows -> PowerShell + System.Speech.Synthesis.SpeechSynthesizer (ships with every Windows
//              since Vista) — invoked via `powershell -NoProfile -Command <script>`, spawned with
//              shell:false per this kit's own Windows rule (design doc §2.6).
//   Linux   -> `espeak-ng` if present on PATH (most distros: `apt install espeak-ng`); a future
//              `piper` backend is a v0.2 candidate (design doc §10), not implemented here.
// None of these three backends produce per-word timestamps -> timingSource is ALWAYS 'none' here
// (same as the `none` provider — a caller wanting word-level caption highlighting on `system` audio
// falls back to the estimate path, design doc §4.3 priority 3). Quality is robotic, not broadcast —
// this provider exists for "it must run with zero cost/network/account", not for production voice.
//
// Testability (design doc §9 K4 acceptance: "合約測試用 fixture"): the OS-specific backends are NOT
// safe to invoke unconditionally in an automated, cross-platform, zero-dependency test suite (CI
// Linux images often lack espeak-ng; a Windows-only PowerShell script can't run on macOS/Linux CI).
// `synthesizeCore` below is backend-injectable for exactly this reason — the automated contract test
// (tts/__tests__/run-all.mjs) passes a FAKE backend that writes a tiny deterministic WAV instead of
// shelling out, so the provider's CONTRACT (return shape, error-on-missing-backend behaviour) is
// tested everywhere, zero network, zero platform binary dependency. A SEPARATE, opt-in smoke test
// (tts/__tests__/smoke-system-macos.mjs) invokes the REAL `say` backend once, only when
// process.platform === 'darwin' — see that file's own header.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Maps a TtsProvider `rate` multiplier (1.0 = normal) to each backend's own rate unit. */
const macWpm = (rate) => Math.round(180 * (rate ?? 1)); // `say -r <words-per-minute>`, ~180 default
const sapiRate = (rate) => Math.max(-10, Math.min(10, Math.round(((rate ?? 1) - 1) * 10))); // System.Speech Rate: -10..10, 0=normal
const espeakWpm = (rate) => Math.round(175 * (rate ?? 1)); // espeak-ng `-s <words-per-min>`, ~175 default

function which(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'command', process.platform === 'win32' ? [cmd] : ['-v', cmd], { shell: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

/** Backend contract: `run(text, voice, rate, outTmpPath) -> void` (writes ANY audio format
 *  ffmpeg can read to outTmpPath; synthesizeCore below always normalises it afterwards). */
export const sayBackend = {
  name: 'say (macOS)',
  available: () => process.platform === 'darwin',
  run(text, voice, rate, outTmpPath) {
    const args = ['-o', outTmpPath, '--file-format=WAVE', '--data-format=LEI16@22050'];
    if (voice) args.push('-v', voice);
    args.push('-r', String(macWpm(rate)));
    args.push(text);
    execFileSync('say', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  },
};

export const sapiBackend = {
  name: 'System.Speech (Windows)',
  available: () => process.platform === 'win32',
  run(text, voice, rate, outTmpPath) {
    // Single-quoted PowerShell string: escape a literal `'` as `''`.
    const psEscape = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const lines = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      voice ? `try { $s.SelectVoice(${psEscape(voice)}) } catch { }` : '',
      `$s.Rate = ${sapiRate(rate)}`,
      `$s.SetOutputToWaveFile(${psEscape(outTmpPath)})`,
      `$s.Speak(${psEscape(text)})`,
      '$s.Dispose()',
    ].filter(Boolean);
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', lines.join('; ')], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  },
};

export const espeakBackend = {
  name: 'espeak-ng (Linux)',
  available: () => process.platform !== 'darwin' && process.platform !== 'win32' && which('espeak-ng'),
  run(text, voice, rate, outTmpPath) {
    const args = ['-w', outTmpPath, '-s', String(espeakWpm(rate))];
    if (voice) args.push('-v', voice);
    args.push(text);
    execFileSync('espeak-ng', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  },
};

const BACKENDS_IN_ORDER = [sayBackend, sapiBackend, espeakBackend];

export function pickBackend() {
  return BACKENDS_IN_ORDER.find((b) => b.available());
}

/** Core synth logic, backend-injectable for tests (see this file's own header). Always normalises
 *  the backend's raw output through ffmpeg into `req.outWav` at 44100Hz mono — the same shape every
 *  other provider (`edge`, `minimax`, `openai`) produces, so downstream mixing never has to special-
 *  case which provider made a given line's WAV. */
export async function synthesizeCore(backend, req) {
  if (!backend) {
    throw new Error(
      'tts provider "system": no offline TTS backend available on this OS — ' +
        'macOS ships `say`, Windows ships PowerShell System.Speech, Linux needs `espeak-ng` on PATH ' +
        '(install: `apt install espeak-ng` / `dnf install espeak-ng` / `pacman -S espeak-ng`).',
    );
  }
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'system-tts-'));
  const rawPath = path.join(tmpDir, 'raw.wav');
  try {
    try {
      backend.run(req.text, req.voice, req.rate, rawPath);
    } catch (e) {
      throw new Error(`tts provider "system": ${backend.name} failed: ${e.message?.split('\n')[0] ?? e}`);
    }
    if (!existsSync(rawPath)) {
      throw new Error(`tts provider "system": ${backend.name} reported success but wrote no output file`);
    }
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', rawPath, '-ar', '44100', '-ac', '1', req.outWav]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', req.outWav], { encoding: 'utf8' }).trim();
  const durationSec = Number(out);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('tts provider "system": ffprobe could not read a valid duration from the normalised WAV');
  }
  return { wav: req.outWav, durationSec, words: undefined, timingSource: 'none' };
}

export const provider = {
  id: 'system',
  requiredEnv: [], // no credential, ever — see this file's header
  async synthesize(req) {
    return synthesizeCore(pickBackend(), req);
  },
};
