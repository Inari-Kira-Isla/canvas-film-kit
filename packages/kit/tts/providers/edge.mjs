// tts/providers/edge.mjs — free, UNOFFICIAL Microsoft Edge "Read Aloud" TTS (design doc §4.2:
// "非官方端點: 標 experimental, README 講明可能失效、用戶自行判斷服務條款; 唔做預設、唔入 CI").
// No API key: `TrustedClientToken` below is a long-published, non-secret constant every community
// client of this endpoint (edge-tts, msedge-tts, …) uses — it identifies "a request from an Edge
// client", not a user account, so there is nothing here to redact.
//
// Protocol (reverse-engineered by the wider community, not documented by Microsoft — hence
// "unofficial", hence this file may simply stop working if Microsoft changes it): open a WebSocket,
// send a JSON "speech.config" control message, then an SSML "ssml" message; the server streams back
// binary "audio" frames (raw compressed audio bytes with a small text header) and JSON
// "audio.metadata" frames carrying WordBoundary offsets (100ns ticks), ending with a "turn.end"
// frame. `Sec-MS-GEC`/`Sec-MS-GEC-Version` are a client-integrity token Microsoft added in 2024;
// the formula (sha256 of a 5-minute-quantised Windows-epoch tick count + the trusted token) is
// published by every maintained community client — again, not a per-user secret.
//
// Output: this endpoint only ever returns compressed audio (mp3) — decoded to the project's WAV via
// a local `ffmpeg` call (no network beyond the one WebSocket round-trip).
//
// Zero real-money risk: this provider is free and requires no account, but it is NOT part of this
// kit's default/CI path (design doc — "唔入 CI"); it is fine to call it directly for a manual smoke
// test.
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

// The browser-style global WebSocket has no way to set request headers (by spec — same reason a
// real browser tab can't either). Every maintained community client of this unofficial endpoint
// (edge-tts, msedge-tts) connects with a raw WebSocket library instead, specifically so it CAN send
// these — the endpoint's handshake rejects a connection missing a browser-shaped User-Agent/Origin.
// None of these values are secrets; they are the same constants every such client sends.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const WS_HEADERS = {
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'User-Agent': CHROME_UA,
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '130.0.2849.68';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600n; // seconds between 1601-01-01 and 1970-01-01 (Windows FILETIME epoch)
const CONNECT_TIMEOUT_MS = 12_000;

function secMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000)) + WIN_EPOCH;
  ticks -= ticks % 300n; // quantise to a 5-minute window, per the published formula
  const ticks100ns = ticks * 10_000_000n;
  const str = `${ticks100ns.toString()}${TRUSTED_CLIENT_TOKEN}`;
  return createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function ratePercentString(rate) {
  const pct = Math.round(((rate ?? 1) - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/** Parses one WebSocket text frame's header block (colon-separated, \r\n-terminated, blank line
 *  ends the header) into { headers, body }. Both binary and text frames from this endpoint share
 *  this same header convention. */
function splitHeaders(text) {
  const idx = text.indexOf('\r\n\r\n');
  const headerText = idx === -1 ? text : text.slice(0, idx);
  const body = idx === -1 ? '' : text.slice(idx + 4);
  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const c = line.indexOf(':');
    if (c === -1) continue;
    headers[line.slice(0, c).trim()] = line.slice(c + 1).trim();
  }
  return { headers, body };
}

async function synthesizeRaw(text, voice, rate) {
  const connectionId = randomUUID().replace(/-/g, '');
  const requestId = randomUUID().replace(/-/g, '');
  const url =
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`;

  const ws = new WebSocket(url, { headers: WS_HEADERS, handshakeTimeout: CONNECT_TIMEOUT_MS });

  const audioChunks = [];
  const words = [];
  let settled = false;

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.terminate(); } catch { /* best-effort */ }
        reject(new Error(`tts provider "edge": timed out after ${CONNECT_TIMEOUT_MS}ms waiting for the unofficial endpoint (experimental — Microsoft may have changed/blocked it; see providers/edge.mjs header)`));
      }
    }, CONNECT_TIMEOUT_MS);

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`tts provider "edge": WebSocket error: ${err.message} (unofficial endpoint — see providers/edge.mjs header)`));
      }
    });

    ws.on('open', () => {
      const configMsg =
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } });
      ws.send(configMsg);

      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${escapeXml(voice)}'><prosody rate='${ratePercentString(rate)}'>${escapeXml(text)}</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        const text_ = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const { headers, body } = splitHeaders(text_);
        const path_ = headers.Path;
        if (path_ === 'audio.metadata') {
          try {
            const meta = JSON.parse(body);
            for (const item of meta?.Metadata ?? []) {
              if (item.Type === 'WordBoundary') {
                const offsetTicks = item.Data.Offset;
                const durationTicks = item.Data.Duration;
                words.push({
                  text: item.Data.text?.Text ?? '',
                  start: offsetTicks / 1e7,
                  end: (offsetTicks + durationTicks) / 1e7,
                });
              }
            }
          } catch { /* a malformed metadata frame just means fewer word marks, not a hard fail */ }
        } else if (path_ === 'turn.end') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { /* best-effort */ }
            resolve({ audioChunks, words });
          }
        }
      } else {
        // Binary frame: 2-byte big-endian header length, then header text, then raw audio bytes.
        const buf = Buffer.from(data);
        const headerLen = buf.readUInt16BE(0);
        const headerText = buf.subarray(2, 2 + headerLen).toString('utf8');
        const { headers } = splitHeaders(headerText + '\r\n\r\n');
        if (headers.Path === 'audio') {
          audioChunks.push(buf.subarray(2 + headerLen));
        }
      }
    });
  });

  return result;
}

export const provider = {
  id: 'edge',
  requiredEnv: [], // no credential — see this file's header
  async synthesize(req) {
    const { audioChunks, words } = await synthesizeRaw(req.text, req.voice, req.rate);
    if (audioChunks.length === 0) {
      throw new Error('tts provider "edge": endpoint returned zero audio frames — refusing to write an empty file (unofficial endpoint, may have changed/blocked — see providers/edge.mjs header)');
    }
    const mp3Bytes = Buffer.concat(audioChunks);
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'edge-tts-'));
    const mp3Path = path.join(tmpDir, 'out.mp3');
    try {
      writeFileSync(mp3Path, mp3Bytes);
      execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', mp3Path, '-ar', '44100', '-ac', '1', req.outWav]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', req.outWav], { encoding: 'utf8' }).trim();
    const durationSec = Number(out);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error('tts provider "edge": ffprobe could not read a valid duration from the decoded WAV');
    }
    return {
      wav: req.outWav,
      durationSec,
      words: words.length ? words : undefined,
      timingSource: words.length ? 'provider' : 'none',
    };
  },
};
