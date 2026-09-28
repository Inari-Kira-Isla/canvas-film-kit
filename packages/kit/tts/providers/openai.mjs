// tts/providers/openai.mjs — OpenAI TTS (design doc §4.2 table: paid, no provider-native word
// timestamps — falls to §4.3 priority 3, sentence-level estimate; this kit release does not ship
// priority 2, whisper alignment — see tts/provider.mjs's header). Model name comes from an env var,
// never hardcoded (design doc §4.2 "model 名放 config，唔寫死").
//
// Never prints the key value: every thrown error is passed through redact() first.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { redact } from '../provider.mjs';

const DEFAULT_MODEL = process.env.OPENAI_TTS_MODEL || 'tts-1';
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

function credential() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('tts provider "openai": OPENAI_API_KEY is not set (env only — see requiredEnv)');
  return apiKey;
}

export const provider = {
  id: 'openai',
  requiredEnv: ['OPENAI_API_KEY'],
  async synthesize(req) {
    let apiKey;
    try {
      apiKey = credential();
    } catch (e) {
      throw new Error(redact(e.message));
    }
    let resp;
    try {
      resp = await fetch(`${API_BASE}/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          voice: req.voice,
          input: req.text,
          speed: req.rate ?? 1.0,
          response_format: 'wav',
        }),
      });
    } catch (e) {
      throw new Error(redact(`tts provider "openai": network error: ${e.message}`, [apiKey]));
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(redact(`tts provider "openai": HTTP ${resp.status} ${resp.statusText}: ${t.slice(0, 500)}`, [apiKey]));
    }
    const bytes = Buffer.from(await resp.arrayBuffer());
    if (bytes.length === 0) throw new Error('tts provider "openai": 0 bytes returned — refusing to write an empty file');
    writeFileSync(req.outWav, bytes);
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', req.outWav], { encoding: 'utf8' }).trim();
    const durationSec = Number(out);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error('tts provider "openai": ffprobe could not read a valid duration from the synthesized file');
    }
    // OpenAI's TTS endpoint returns no per-word timestamps — always 'none' (design doc §4.3
    // priority 3: caller falls back to a sentence-level estimate for highlight timing; the real
    // audio DURATION here is still exact, only per-word position inside it is unknown).
    return { wav: req.outWav, durationSec, words: undefined, timingSource: 'none' };
  },
};
