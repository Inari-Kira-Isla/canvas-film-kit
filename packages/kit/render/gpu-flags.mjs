// gpu-flags.mjs — platform-specific Chromium GPU flags (canvas-film-kit K1, cross-platform runtime).
//
// An earlier internal prototype this kit's design evolved from hardcoded `--use-angle=metal`
// everywhere (Mac-only: the only machine it was ever run on). That flag is silently ignored on
// Windows/Linux Chromium builds (unknown ANGLE backend name), which still "worked" there but left
// the renderer on whatever ANGLE picked by default — never verified, never intentional. This module
// is the single place platform GPU flags are decided, so every caller (render/browser.mjs,
// scripts/export-mp4.mjs, scripts/doctor.mjs) gets the same answer.
//
// Backends, one per OS (2026-09-28 design doc §2.5):
//   darwin (Mac)  → ANGLE Metal backend.
//   win32 (Windows) → ANGLE Direct3D 11 backend.
//   linux         → no explicit --use-angle: a desktop Linux box with a real GPU uses whatever
//                    ANGLE picks by default (usually GL); a headless/Docker box with no GPU falls
//                    back to SwiftShader software rendering automatically — that fallback is
//                    CORRECT there (`kit doctor` flags it as a WARN, not silently "fine").
export function gpuArgs() {
  const common = ['--enable-gpu', '--ignore-gpu-blocklist'];
  switch (process.platform) {
    case 'darwin':
      return [...common, '--use-angle=metal'];
    case 'win32':
      return [...common, '--use-angle=d3d11'];
    default: // linux and anything else
      return common;
  }
}
