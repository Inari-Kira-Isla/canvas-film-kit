// Single SSOT for canvas size, frame rate and total duration.
export const W = 1920;
export const H = 1080;
export const FPS = 30;
export const DURATION = 27.267; // seconds — matches src/content/timeline.json's duration_s
// (kit tts build -> narration/build-timeline.mjs), same pattern as demos/explainer/history.

export const PROFILE: 'abstract' | 'info-narrative' | 'music' | 'explainer' | 'history' | 'economics' = 'economics';
export const DRIVER: 'music' | 'narration' | 'none' = 'narration';
export const FACTS: 'none' | 'label' | 'knowledge' | 'history' | 'data' = 'data';
export const RUBRIC: 'abstract' | 'info-narrative' | 'music' | 'explainer' | 'history' | 'economics' = 'economics';
