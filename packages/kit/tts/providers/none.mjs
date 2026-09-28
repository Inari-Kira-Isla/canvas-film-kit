// tts/providers/none.mjs — the default provider: captions-only, or "bring your own WAV". This is
// what CI and every shipped demo use (design doc §4.2 table: "CI 同示範片用佢，零網絡"). It never
// makes a network call and never requires a credential.
//
// Contract: the CALLER must already have placed a real audio file at `req.outWav` (a human-recorded
// line, a WAV exported from any TTS tool by hand, or simply nothing at all — see below) BEFORE
// calling synthesize(). This provider does not generate audio; it only inspects what is already
// there:
//   - outWav exists  -> measure its real duration (ffprobe) and report timingSource:'none' (no
//     provider-native word timestamps — a caller wanting per-word highlight timing for a 'none'
//     line must run a separate opt-in alignment step; this kit ships none in this release, see
//     tts/provider.mjs's header).
//   - outWav missing -> FAIL LOUD. Silently treating "no audio" as "duration 0" or fabricating a
//     placeholder duration would corrupt every downstream timing calculation; a project that wants
//     subtitle-only (no audio at all) does not call `kit tts build` for that line in the first
//     place — it writes its own content/cards.json + pauses.json and skips straight to
//     narration/build-timeline.mjs's ESTIMATE fallback (no audio/final/manifest.json at all).
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function ffprobeDuration(p) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8' }).trim();
  return Number(out);
}

export const provider = {
  id: 'none',
  requiredEnv: [],
  async synthesize(req) {
    if (!existsSync(req.outWav)) {
      throw new Error(
        `tts provider "none": ${req.outWav} does not exist — this provider never synthesizes audio, ` +
          `it only measures a WAV you already placed there (see providers/none.mjs's own header). ` +
          `Put a real audio file at that path, or pick a real provider (--provider edge|minimax|openai).`,
      );
    }
    const durationSec = ffprobeDuration(req.outWav);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error(`tts provider "none": ffprobe could not read a valid duration from ${req.outWav}`);
    }
    return { wav: req.outWav, durationSec, words: undefined, timingSource: 'none' };
  },
};
