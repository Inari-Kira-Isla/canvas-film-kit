# fixture — wav-source (K4: documents the intentional Node/Python divergence — Node's
# resolveSource() accepts .mp3 OR .wav; the Python original this was ported from only accepts
# .mp3 — see speech-rate.mjs's own header. Same manifest/content as the "good" fixture, just
# pointed at a .wav file, so Node is expected to PASS this while Python is expected to reject the
# extension — narration/__tests__/parity-speech-rate.mjs asserts exactly that pattern, not a plain
# exit-code match, for this one fixture.)

speech_rate_cps: 5.05 source: narration/vo/N1.wav
