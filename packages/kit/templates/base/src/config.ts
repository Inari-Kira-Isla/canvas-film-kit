// Single SSOT for canvas size, frame rate and total duration.
// Every other module (core/math.ts re-exports W/H, core/timeline.ts re-exports
// FPS/DURATION — `kit new` renames that file from timeline.template.ts at scaffold time) reads
// from here — never hardcode these four numbers anywhere else in src/.
export const W = 1920; // FILL IN if not a 16:9 1080p film
export const H = 1080; // FILL IN
export const FPS = 30; // FILL IN
export const DURATION = 30; // seconds — FILL IN

// Which set of gates `kit gate`'s story-metrics step applies. `kit new --profile <x>` writes this
// file's PROFILE (+ DRIVER/FACTS/RUBRIC below) — FILL IN by hand only if you skipped the scaffold
// command (you shouldn't have).
// 'abstract'  — a pure procedural-visual short: no on-screen text budget beyond the generic
//               caption-budget suggestion, beat spacing tight. The only profile this kit ships in
//               its first release — music/explainer/history/economics land in later batches.
// 'music'          — a music-video: the timeline is driven by the song (beats/onsets), not by a
//                    narrator or a fixed cadence. Facts gate is label-only (lyrics are art, not
//                    a spec sheet — any digit/unit/scale string needs `// fact: LABEL.x`).
// 'explainer'      — narration-driven "how does X work" piece (TTS timeline, step badges).
// 'history'        — narration-driven, two independent time axes (calendar years vs narration
//                    seconds) — never conflate them. Strongest facts gate: every year/name/place
//                    needs a sourced claim; no AI-generated faces of real people.
// 'economics'      — narration-driven, chart/count-up components; every on-screen number must
//                    resolve to a dataset entry with a source.
// 'info-narrative' — kept for backward compatibility with an earlier internal prototype this
//                    kit's design evolved from; not actively promoted as a public profile name.
export const PROFILE: 'abstract' | 'info-narrative' | 'music' | 'explainer' | 'history' | 'economics' = 'abstract';

// Three orthogonal axes PROFILE is a named shorthand for — gate.mjs and future per-profile rubric
// text should read THESE, not the PROFILE string, so a new named profile never needs a whole new
// copy of every check. abstract=(none,none,abstract); info-narrative=(narration|none,knowledge,
// info-narrative); music=(music,label,music); explainer=(narration,knowledge,explainer);
// history=(narration,history,history); economics=(narration,data,economics).
export const DRIVER: 'music' | 'narration' | 'none' = 'none';
export const FACTS: 'none' | 'label' | 'knowledge' | 'history' | 'data' = 'none';
export const RUBRIC: 'abstract' | 'info-narrative' | 'music' | 'explainer' | 'history' | 'economics' = 'abstract';
