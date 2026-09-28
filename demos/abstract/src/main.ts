import { H, W } from './core/math';
import { rgba } from './core/color';
import { initTextures, drawFinish } from './core/texture';
import { DURATION, FPS, bgAt, finishLook, type Scene } from './core/timeline';
import { oneLineScene } from './scenes/one-line';
import { PROFILE } from './config';

/** Draw order = list order. "One Line" is a single continuous scene (see its own file header for
 *  why: one piece of geometry, no hard cuts) — this array stays one entry long on purpose. */
const SCENES: Scene[] = [oneLineScene];

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
const hud = document.getElementById('hud')!;
const info = document.getElementById('info')!;
const bar = document.getElementById('bar')!;
const fill = document.getElementById('fill')!;

const params = new URLSearchParams(location.search);
let clock = Math.min(DURATION, Math.max(0, parseFloat(params.get('t') ?? '0') || 0));
let playing = !params.has('paused');
let loop = !params.has('once');
let scale = 1;
let lastFrame = -1;

// ?prof — per-scene CPU submission time, read from window.__prof. Check this BEFORE trusting any
// fps claim: a WebGL/canvas renderer string that says software (SwiftShader / llvmpipe) means the
// number is fake — see `kit doctor`.
const PROF = params.has('prof');
const profData: Record<string, [number, number]> = {};
(window as unknown as { __prof: typeof profData }).__prof = profData;
const prof = (k: string, ms: number) => {
  const e = (profData[k] ??= [0, 0]);
  e[0] += ms;
  e[1]++;
};

/** Pure function of time → pixels. Everything on screen derives from t, so seeking and re-rendering are exact.
 *  Core rule: render = pure function of t. No per-frame mutable state, no Math.random — only seeded PRNGs / hash noise. */
function renderAt(t: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const bg = bgAt(t);
  ctx.fillStyle = rgba(bg);
  ctx.fillRect(0, 0, W, H);
  for (const s of SCENES) {
    if (t < s.start || t >= s.end) continue;
    const t0 = PROF ? performance.now() : 0;
    ctx.save();
    s.draw(ctx, t);
    ctx.restore();
    if (PROF) prof(`${Math.floor(t)}:${s.name}`, performance.now() - t0);
  }
  const { light, tint } = finishLook(t);
  const t1 = PROF ? performance.now() : 0;
  drawFinish(ctx, t, light, tint);
  if (PROF) prof(`${Math.floor(t)}:finish`, performance.now() - t1);
}

function resize(): void {
  const vw = window.innerWidth, vh = window.innerHeight;
  const cssW = Math.min(vw, (vh * W) / H);
  const cssH = (cssW * H) / W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.width / W;
  // default (low) smoothing: 'high' costs ~2x GPU time on upscaled sprites for no visible
  // gain here — never set imageSmoothingQuality = 'high' without measuring first.
  renderAt(Math.floor(clock * FPS) / FPS);
}

// ---------------------------------------------------------------- playback

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    clock += dt;
    if (clock >= DURATION) {
      if (loop) clock %= DURATION;
      else {
        clock = DURATION - 1 / FPS;
        playing = false;
        if (recorder) {
          // let the final frame reach the stream before stopping
          renderAt(clock);
          const r = recorder;
          setTimeout(() => r.state !== 'inactive' && r.stop(), 150);
        }
      }
    }
  }
  // quantise to the timeline's fps: deterministic frames regardless of display refresh rate
  const frame = Math.floor(clock * FPS);
  if (frame !== lastFrame) {
    lastFrame = frame;
    renderAt(frame / FPS);
  }
  updateHud();
  requestAnimationFrame(tick);
}

let hudUntil = params.has('hud') ? Infinity : 0;
const SCENE_MARKS: [number, string][] = [[0, 'one-line']];
for (const [t] of SCENE_MARKS) {
  const d = document.createElement('div');
  d.className = 'tick';
  d.style.left = `${(t / DURATION) * 100}%`;
  bar.appendChild(d);
}
function updateHud(): void {
  const on = performance.now() < hudUntil;
  hud.classList.toggle('on', on);
  if (!on) return;
  const name = [...SCENE_MARKS].reverse().find(([t]) => clock >= t)?.[1] ?? '';
  info.textContent = `${clock.toFixed(2)}s / ${DURATION}s · ${name}${playing ? '' : ' · paused'}${loop ? ' · loop' : ''}   [space] play  [←→] seek  [1-0] scenes  [r] restart  [l] loop  [e] record`;
  fill.style.width = `${(clock / DURATION) * 100}%`;
}
const pokeHud = () => {
  if (hudUntil !== Infinity) hudUntil = performance.now() + 2200;
};

window.addEventListener('mousemove', pokeHud);
bar.addEventListener('click', (e) => {
  const r = bar.getBoundingClientRect();
  clock = ((e.clientX - r.left) / r.width) * DURATION;
});
window.addEventListener('keydown', (e) => {
  pokeHud();
  const step = e.shiftKey ? 1 / FPS : 1;
  if (e.key === ' ') playing = !playing;
  else if (e.key === 'ArrowRight') clock = Math.min(DURATION - 1e-3, clock + step);
  else if (e.key === 'ArrowLeft') clock = Math.max(0, clock - step);
  else if (e.key === 'r') clock = 0;
  else if (e.key === 'l') loop = !loop;
  else if (e.key === 'h') hudUntil = hudUntil === Infinity ? 0 : Infinity;
  else if (e.key === 'e') record();
  else if (/^[0-9]$/.test(e.key)) clock = SCENE_MARKS[(parseInt(e.key, 10) + 9) % (SCENE_MARKS.length || 1)]?.[0] ?? 0;
  else return;
  e.preventDefault();
});

/** Real-time WebM capture of one full pass (press E). Stops when the film clock reaches the end.
 *  This is a scrubbing convenience only — the frame-exact deliverable comes from `kit export`. */
let recorder: MediaRecorder | null = null;
let loopBeforeRecord = loop;
function record(): void {
  if (recorder || !('MediaRecorder' in window)) return;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return;
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(canvas.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 16e6 });
  } catch {
    return;
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    a.download = 'preview.webm';
    a.click();
    recorder = null;
    loop = loopBeforeRecord;
  };
  loopBeforeRecord = loop;
  clock = 0;
  playing = true;
  loop = false;
  recorder = rec;
  rec.start();
}

// Hook for deterministic frame capture (`kit stills`, `kit export`).
// This MUST exist before scene 1 is written — it is what makes stills/export/perf possible at all.
(window as unknown as { __renderAt: (t: number) => void }).__renderAt = (t: number) => {
  playing = false;
  clock = t;
  lastFrame = Math.floor(t * FPS);
  renderAt(t);
};

// Machine-readable meta for kit's gate scripts (`kit determinism`, `kit boundary-diff`) — this is
// what lets determinism.mjs auto-generate its sample times from the FULL declared duration + real
// scene boundaries instead of a hand-filled list that silently goes stale when DURATION changes.
// `scenes` is read straight off the same `SCENES` array `renderAt` loops over, so it can never
// drift from what actually plays.
(window as unknown as { __meta: Record<string, unknown> }).__meta = {
  W,
  H,
  FPS,
  DURATION,
  PROFILE,
  scenes: SCENES.map((s) => ({ name: s.name, start: s.start, end: s.end })),
};

initTextures();
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(tick);
