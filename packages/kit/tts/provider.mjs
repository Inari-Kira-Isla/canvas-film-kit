// tts/provider.mjs — the TTS provider contract every provider under providers/*.mjs implements
// (design doc §4.1), plus the shared helpers every provider needs: secret redaction (never let a
// provider's own error text leak an API key to stdout/stderr — a fake-key failure-path test greps
// exactly this), and a content-hash cache so a re-run of `kit tts build` never re-pays/re-calls a
// paid API for a line whose (provider, voice, lang, rate, text) tuple hasn't changed — this is also
// what lets `kit gate`/`kit export` run with zero network once a project's audio/ has been built
// once (design doc §4.1's own reasoning).
//
// Provider contract (informal — plain JS, no TypeScript build step in this package):
//   { id: 'none'|'edge'|'minimax'|'openai'|string,
//     requiredEnv: string[],                 // env var NAMES only — doctor.mjs reports presence,
//                                             // never the value (design doc §2.5 item 7)
//     synthesize({ text, voice, lang, rate, outWav }) => Promise<{
//       wav: string,                         // == outWav, once written
//       durationSec: number,
//       words?: { text: string, start: number, end: number }[],  // WordStamp[], provider-native
//                                             // per-word timestamps, when the provider returns them
//       timingSource: 'provider' | 'none',   // 'provider' = words[] above is REAL per-word timing
//                                             // from this provider; 'none' = no word-level timing
//                                             // (caller falls back to sentence-level / estimate —
//                                             // design doc §4.3 priority 3; priority 2, whisper
//                                             // alignment, is intentionally NOT implemented in this
//                                             // kit release — see design doc §10 "今次唔做")
//     }> }
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Mask common secret SHAPES generically (so an unanticipated leak still gets caught), AND any
 *  exact known secret VALUE a caller passes in `knownSecrets` (belt + suspenders — a provider
 *  should always pass its own credential values here, not rely on the shape-only patterns alone).
 *  Never throws; safe to call on arbitrary provider error text before it reaches stdout/stderr. */
export function redact(text, knownSecrets = []) {
  if (typeof text !== 'string') text = String(text);
  let out = text;
  for (const secret of knownSecrets) {
    if (secret && typeof secret === 'string' && secret.length >= 6) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  const SHAPES = [
    /sk-[A-Za-z0-9_-]{10,}/g, // OpenAI-style secret key
    /Bearer\s+[A-Za-z0-9._-]{10,}/gi, // Authorization header value
    /eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+){1,2}/g, // JWT-shaped token
    /\b[0-9a-fA-F]{32,}\b/g, // long hex (group ids / hashes that could double as secrets)
  ];
  for (const re of SHAPES) out = out.replace(re, '[REDACTED]');
  return out;
}

/** Content hash for the TTS cache: identical (provider, voice, lang, rate, text) always resolves
 *  to the same cache entry, so re-running `kit tts build` after an unrelated edit costs nothing. */
export function cacheKey({ provider, voice, lang, rate, text }) {
  const h = createHash('sha256');
  h.update(JSON.stringify({ provider, voice, lang: lang ?? '', rate: rate ?? 1, text }));
  return h.digest('hex').slice(0, 32);
}

export function cacheDir(root) {
  return path.join(root, '.cache', 'tts');
}

/** Returns the cached { wav, meta } for this key, or null if no cache entry exists / it is corrupt
 *  (corrupt cache is treated as a miss, never a fail-loud — a cache is disposable by definition). */
export function readCache(root, key) {
  const dir = cacheDir(root);
  const wav = path.join(dir, `${key}.wav`);
  const metaPath = path.join(dir, `${key}.json`);
  if (!existsSync(wav) || !existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    return { wav, meta };
  } catch {
    return null;
  }
}

export function writeCache(root, key, wavBytes, meta) {
  const dir = cacheDir(root);
  mkdirSync(dir, { recursive: true });
  const wav = path.join(dir, `${key}.wav`);
  writeFileSync(wav, wavBytes);
  writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(meta, null, 2) + '\n');
  return wav;
}

const PROVIDER_MODULES = {
  none: './providers/none.mjs',
  edge: './providers/edge.mjs',
  minimax: './providers/minimax.mjs',
  openai: './providers/openai.mjs',
  // K4: truly free + offline (macOS `say` / Windows System.Speech / Linux espeak-ng) — added because
  // `edge`'s free endpoint is unofficial and returns HTTP 403 for many callers as of this release;
  // see providers/system.mjs's own header.
  system: './providers/system.mjs',
};

export async function loadProvider(id) {
  const rel = PROVIDER_MODULES[id];
  if (!rel) {
    throw new Error(`unknown tts provider "${id}" — available: ${Object.keys(PROVIDER_MODULES).join(', ')}`);
  }
  const mod = await import(new URL(rel, import.meta.url));
  if (!mod.provider || mod.provider.id !== id) {
    throw new Error(`providers/${id}.mjs does not export a \`provider\` object with id="${id}"`);
  }
  return mod.provider;
}

export const PROVIDER_IDS = Object.keys(PROVIDER_MODULES);
