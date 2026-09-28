// Camera registry — the explicit camera contract read by scripts/story-metrics.mjs (v3, 2026-09-25).
//
// story-metrics credits a scene with "has a camera" ONLY when, during that scene's draw(), either
//   (a) applyCam(ctx, cam) from ./camera.ts is called with Cam values that change over time, or
//   (b) a function listed below (for that scene) is called and its return value changes over time.
// It no longer guesses cameras from raw ctx.translate/scale/rotate — an unregistered big ctx
// transform change only produces a WARN "未登記鏡頭". So: prefer applyCam(); if a scene drives its
// view some other way (a zoom factor fed into its own geometry, a forward depth for a tunnel, …),
// list that function here. The function is wrapped at bundle time by story-metrics (no code change
// needed in the scene; non-exported helpers are fine).
//
//   fn     — the name as declared (function or const) in `file`; must be declared exactly once there
//   file   — path relative to src/, e.g. 'scenes/tunnel.ts' or 'core/timeline.ts'
//   scenes — scene export ids (as listed in main.ts SCENES) that this camera drives
//   kind   — 'cam' (returns a Cam object) | 'scale' (returns a zoom factor, counts at ≥×1.05)
//            | 'depth' (returns forward travel in its own units, counts at Δ≥0.5)
//
// Example (a hypothetical scene calibration copy):
//   { fn: 'cosmicScale', file: 'core/timeline.ts', scenes: ['prismScene', 'flowerScene', 'galaxyScene'], kind: 'scale' },
//   { fn: 'camZ', file: 'scenes/tunnel.ts', scenes: ['tunnelScene'], kind: 'depth' },
export const CAMERA_REGISTRY: { fn: string; file: string; scenes: string[]; kind: 'cam' | 'scale' | 'depth' }[] = [];
