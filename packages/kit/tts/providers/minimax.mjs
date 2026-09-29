// tts/providers/minimax.mjs — MiniMax T2A v2, ported to `fetch` from an earlier internal
// prototype's equivalent Python implementation, with ONE deliberate behaviour change (design doc
// §4.2 table): that original's silent fallback to a private, machine-specific dotfile for
// credentials is REMOVED — this is a public kit, `process.env` only (design doc §4.2 "金鑰規則: 只讀
// process.env"). A user who wants a `.env` file uses Node's own `--env-file=.env` flag; this file
// never reads any dotfile itself.
//
// Never prints the key value: every thrown/rethrown error string is passed through redact() before
// it can reach stdout/stderr, and the raw credential is never interpolated into a log line anywhere
// in this file (grep this file for `apiKey` — it appears only inside the Authorization header).
//
// API shape mirrors platform.minimax.io/docs/api-reference/speech-t2a-http (same as the ported
// Python original): POST {host}/v1/t2a_v2[?GroupId=...] with voice_setting/audio_setting, response
// { data: { audio: <hex>, subtitle_file? }, base_resp: { status_code, status_msg } }.
import { writeFileSync } from 'node:fs';
import { redact } from '../provider.mjs';

const DEFAULT_MODEL = process.env.MINIMAX_TTS_MODEL || 'speech-2.8-hd';

function credential() {
  const apiKey = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;
  const host = process.env.MINIMAX_API_HOST || 'https://api.minimax.io';
  if (!apiKey) {
    throw new Error('tts provider "minimax": MINIMAX_API_KEY is not set (env only — see requiredEnv)');
  }
  return { apiKey, groupId: groupId || null, host };
}

export const provider = {
  id: 'minimax',
  requiredEnv: ['MINIMAX_API_KEY', 'MINIMAX_GROUP_ID'], // GROUP_ID optional at call time, still
  // listed so `kit doctor` can report its presence (§2.5 item 7 — name only, never the value)
  async synthesize(req) {
    let cred;
    try {
      cred = credential();
    } catch (e) {
      throw new Error(redact(e.message));
    }
    const url = new URL(`${cred.host}/v1/t2a_v2`);
    if (cred.groupId) url.searchParams.set('GroupId', cred.groupId);

    const body = {
      model: DEFAULT_MODEL,
      text: req.text,
      voice_setting: { voice_id: req.voice, speed: req.rate ?? 1.0, vol: 1.0, pitch: 0 },
      audio_setting: { format: 'wav', sample_rate: 44100, bitrate: 128000, channel: 1 },
      language_boost: req.lang === 'en' ? 'English' : 'Chinese',
      subtitle_enable: true,
      subtitle_type: 'word', // needed to reliably get word-level timestamps back (see the ported
      // Python original's own comment — omitting this returned no subtitle_file at all in testing)
    };

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cred.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(redact(`tts provider "minimax": network error: ${e.message}`, [cred.apiKey]));
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(redact(`tts provider "minimax": HTTP ${resp.status} ${resp.statusText}: ${t.slice(0, 500)}`, [cred.apiKey]));
    }
    const payload = await resp.json();
    const statusCode = payload?.base_resp?.status_code;
    if (statusCode !== undefined && statusCode !== 0 && statusCode !== '0') {
      throw new Error(redact(`tts provider "minimax": API error ${statusCode}: ${payload?.base_resp?.status_msg ?? 'unknown'}`, [cred.apiKey]));
    }
    const hexAudio = payload?.data?.audio;
    if (!hexAudio) {
      throw new Error(redact(`tts provider "minimax": no audio returned. payload=${JSON.stringify(payload).slice(0, 500)}`, [cred.apiKey]));
    }
    const audioBytes = Buffer.from(hexAudio, 'hex');
    if (audioBytes.length === 0) {
      throw new Error('tts provider "minimax": decoded audio is 0 bytes — refusing to write an empty file');
    }
    writeFileSync(req.outWav, audioBytes);

    let words;
    const subUrl = payload?.data?.subtitle_file;
    if (subUrl) {
      try {
        const subResp = await fetch(subUrl);
        const sub = await subResp.json();
        const list = Array.isArray(sub) ? sub : [sub];
        words = [];
        for (const sentence of list) {
          for (const w of sentence?.timestamped_words ?? []) {
            words.push({ text: w.word, start: w.time_begin / 1000, end: w.time_end / 1000 });
          }
        }
      } catch (e) {
        // K6 fix: this used to silently set words=undefined with NO message at all — a caller had no
        // way to tell "MiniMax genuinely has no word timing for this request" apart from "the fetch
        // broke", and downstream (tts/build.mjs) falls back to the WHOLE FILE's ffprobe duration as
        // speech_len, which is longer than actual speech (it includes any lead/trail silence) and so
        // deflates every measured chars/sec figure without saying so. This provider REQUESTED word
        // timing (subtitle_enable + subtitle_type:'word' above) specifically so it would normally have
        // it — losing it here is a real degradation, not a provider limitation like `system`/`none`
        // (which never produce word timing by design, see those files' own headers), so it is WARNed
        // loud on stderr rather than swallowed.
        words = undefined;
        console.error(`tts provider "minimax": WARN — fetched subtitle_file but could not parse word timestamps (${e.message}); falling back to this file's own ffprobe duration as speech_len, which will UNDER-count actual speech rate if there is any lead/trail silence.`);
      }
    } else {
      words = undefined;
      console.error('tts provider "minimax": WARN — API response had no subtitle_file (word timing) even though subtitle_enable was requested; falling back to this file\'s own ffprobe duration as speech_len, which will UNDER-count actual speech rate if there is any lead/trail silence.');
    }
    const durationSec = words?.length ? words[words.length - 1].end : undefined;
    if (durationSec === undefined) {
      // no words[] at all — fall back to ffprobe on the file we just wrote (see none.mjs's helper
      // logic for why this is safe: the file exists and is non-empty at this point).
      const { execFileSync } = await import('node:child_process');
      const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', req.outWav], { encoding: 'utf8' }).trim();
      return { wav: req.outWav, durationSec: Number(out), words: undefined, timingSource: 'none' };
    }
    return { wav: req.outWav, durationSec, words, timingSource: 'provider' };
  },
};
