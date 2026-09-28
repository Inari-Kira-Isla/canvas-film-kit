// story-metrics.mjs — RED-LIGHT ALARM for a canvas-film-kit project (generalized 2026-09-28, K1).
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS IS / IS NOT (定位)
//   This is a red-light alarm (紅燈警報器), NOT a judge of story quality. It catches films that are
//   structurally slideshow-like (few beats, evenly split scenes, fixed camera, caption-driven).
//   The real story gate is (1) a human approving the storyboard (docs/preproduction.md `approved_by:`)
//   and (2) an independent human rubric review (docs/design/preproduction.md, per PROFILE). A film can be all
//   green here and still be REJECTed by the rubric; a yellow here is a prompt to look, not a verdict.
//
// THREAT MODEL
//   Guards against agent drift / honest mistakes (a scene that forgot its camera, a padded T
//   table, a re-timed scene list). It is NOT designed to stop a deliberate adversary who edits
//   this script's inputs to pass. The known gaming tricks found in review ARE blocked, and each
//   one is a regression test in docs/design/preproduction.md "刷數測試":
//     ① comment text like `// noCam(`         → irrelevant: nothing here reads source text for cameras
//     ② rename caption() → cap()               → irrelevant: captions = real fillText calls at runtime
//     ③ pad T with unused keys                 → beat-keys-all-used FAIL (Proxy-style getters on T)
//     ④ dead top-level refs `[T.pad1, ...]`    → FAIL: import-time reads only count on a scene's
//                                                own `start:`/`end:` line; anything else must be read
//                                                during draw() sampling
//     ⑤ tiny/invisible scenes with a moving ctx.scale → excluded (<0.5s or zero visible paint) and
//                                                listed; ratios are duration-weighted anyway; an
//                                                unregistered ctx transform never counts as a camera
//   Known NOT blocked (out of threat model, documented): a registered camera fn whose output is
//   computed but never used to draw; `void T.x` inside draw(); a fake `start: T.x` line.
//
// CAMERA = EXPLICIT CONTRACT (no more guessing from ctx transforms)
//   A scene "has a camera" only if, while its draw() is being sampled, either
//     (a) core/camera.ts `applyCam(ctx, cam)` is called and the Cam values vary over time, or
//     (b) a function registered in src/core/camera-registry.ts (CAMERA_REGISTRY) for THAT scene is
//         called and its output varies over time.
//   Registered functions are wrapped at bundle time (esbuild onLoad source rewrite: the original
//   declaration is renamed and a recording wrapper takes its name), so non-exported helpers like
//   an example project's `const camZ = ...` in tunnel.ts can be registered without touching the scene.
//   Large ctx.setTransform/scale/rotate changes in a scene with NO Cam/registered camera produce a
//   WARN "未登記鏡頭" — never a camera credit.
//
// Usage:
//   node scripts/story-metrics.mjs [repoRoot] [--calibrate] [--profile abstract|info-narrative]
//     --calibrate  measure an existing/legacy film: skips the docs/preproduction.md approval gate,
//                  every line of output is framed by "UNCALIBRATED-RUN" and the result is NOT P5
//                  evidence. Gates are still computed and the exit code still reflects red.
//     --profile    TEST/CALIBRATION ONLY: used only when src/config.ts does not export PROFILE.
// Exit codes: 0 = no red gate, 1 = at least one red gate (FAIL), 2 = could not run.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ------------------------------------------------------------------------------------ args
const argv = process.argv.slice(2);
let rootArg = '.';
let CALIBRATE = false;
let profileOverride;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--calibrate') CALIBRATE = true;
  else if (a === '--profile') profileOverride = argv[++i];
  else if (a.startsWith('--profile=')) profileOverride = a.slice('--profile='.length);
  else if (a.startsWith('--')) {
    console.error(`story-metrics: unknown flag ${a}`);
    process.exit(2);
  } else rootArg = a;
}
const root = path.resolve(rootArg);
const require = createRequire(import.meta.url);
const TAG = CALIBRATE ? 'story-metrics[UNCALIBRATED-RUN]' : 'story-metrics';

function fail(msg) {
  console.error(`${TAG}: ${msg}`);
  process.exit(2);
}
function warn(msg) {
  console.error(`${TAG}: WARN: ${msg}`);
}
const EPS = 1e-6; // float-boundary noise only; never widen to make a near-miss pass

// ------------------------------------------------------------------------------------ esbuild
function loadEsbuild() {
  // esbuild is a real `dependencies` entry of canvas-film-kit (package.json) — plain module
  // resolution from this file's own location (inside node_modules/canvas-film-kit/gates/, or this
  // monorepo's packages/kit/gates/ pre-publish) always finds it. No home-directory/project-root guessing.
  try {
    return require('esbuild');
  } catch (e) {
    fail(`esbuild not found via normal Node module resolution (${e.message}) — canvas-film-kit declares esbuild as its own dependency; run \`npm install\` in the film project first.`);
  }
}
const esbuild = loadEsbuild();

async function importCode(code) {
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}
function bundleFile(entryFile, plugins = []) {
  const r = esbuild.buildSync({ entryPoints: [entryFile], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', plugins });
  return r.outputFiles[0].text;
}

// ------------------------------------------------------------------------------------ P0 gate
if (CALIBRATE) {
  console.log(`${TAG}: ===== UNCALIBRATED-RUN — --calibrate: P0 approval gate SKIPPED; output is a measurement, NOT P5 evidence =====`);
} else {
  const preprodPath = path.join(root, 'docs/preproduction.md');
  if (!existsSync(preprodPath)) {
    fail(
      `docs/preproduction.md 搵唔到（${preprodPath}）—— P0 前期規劃未做，拒絕跑。照 docs/design/preproduction.md 產出並由用戶批准。` +
        `（量度舊片用 --calibrate，輸出會標 UNCALIBRATED-RUN。）`
    );
  }
  const src = readFileSync(preprodPath, 'utf8');
  const lines = [...src.matchAll(/^approved_by:[ \t]*(.*)$/gm)].map((m) => m[1].trim());
  if (!lines.length) fail('docs/preproduction.md 冇 "approved_by: <name> <YYYY-MM-DD>" 行——用戶未批准，唔准入 P1。');
  const m = lines[lines.length - 1].match(/^(\S(?:.*\S)?)\s+(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) fail(`approved_by 格式錯：「${lines[lines.length - 1]}」——要係 "approved_by: <name> <YYYY-MM-DD>"`);
  const name = m[1];
  const PLACEHOLDER_NAMES = /^(test|testing|tbd|todo|tba|x+|n\/?a|none|null|nobody|someone|anyone|user|me|name|<.*>|\?+|-+|placeholder|dummy|fake|foo|bar|agent|claude|ai|pending|wip)$/i;
  if (PLACEHOLDER_NAMES.test(name) || name.length < 2) fail(`approved_by 嘅名「${name}」係佔位字（test/tbd/todo/x…），唔算批准。`);
  const [y, mo, d] = [+m[2], +m[3], +m[4]];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) fail(`approved_by 日期「${m[2]}-${m[3]}-${m[4]}」唔係真日期。`);
  if (date.getTime() > Date.now() + 36 * 3600 * 1000) fail(`approved_by 日期「${m[2]}-${m[3]}-${m[4]}」喺未來。`);
  console.log(`${TAG}: P0 gate PASS — approved_by: ${name} ${m[2]}-${m[3]}-${m[4]}`);
}

// ------------------------------------------------------------------------------------ PROFILE / W,H
const configPath = path.join(root, 'src/config.ts');
const configModule = existsSync(configPath) ? await importCode(bundleFile(configPath)) : {};
let PROFILE = configModule.PROFILE;
if (PROFILE === undefined) {
  PROFILE = profileOverride ?? 'abstract';
  warn(`src/config.ts 未 export PROFILE —— 用 "${PROFILE}"${profileOverride ? '（--profile，TEST/CALIBRATION ONLY）' : '（默認）'}；新片必須喺 config.ts 寫明。`);
} else if (profileOverride && profileOverride !== PROFILE) {
  warn(`config.ts PROFILE="${PROFILE}"，忽略 --profile ${profileOverride}`);
}
const KNOWN_PROFILES = ['abstract', 'info-narrative', 'music', 'explainer', 'history', 'economics']; // K4: added economics
if (!KNOWN_PROFILES.includes(PROFILE)) fail(`PROFILE="${PROFILE}" 唔係 ${KNOWN_PROFILES.join('／')}`);
if (!['abstract', 'info-narrative'].includes(PROFILE)) {
  warn(`PROFILE="${PROFILE}" 未有專屬 rubric 帶（Step 2 待辦，見 docs/design/profiles.md）——暫用 info-narrative 嘅門檻做保守預設。`);
}
console.log(`${TAG}: PROFILE=${PROFILE}`);

// ------------------------------------------------------------------------------------ main.ts SCENES
const mainPath = path.join(root, 'src/main.ts');
if (!existsSync(mainPath)) fail('src/main.ts 搵唔到');
const mainSrc = readFileSync(mainPath, 'utf8');
const scenesMatch = mainSrc.match(/const SCENES:\s*Scene\[\]\s*=\s*\[([\s\S]*?)\];/);
if (!scenesMatch) fail('src/main.ts 搵唔到 "const SCENES: Scene[] = [...]"——改咗寫法就同步改呢個腳本，唔准改門檻遷就。');
const mainSceneIds = scenesMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
const importRe = /^import\s*\{([^}]+)\}\s*from\s*'(\.\/scenes\/[^']+)';?\s*$/gm;
const idToFile = new Map();
for (const im of mainSrc.matchAll(importRe)) {
  for (const n of im[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim())) idToFile.set(n, im[2]);
}

const timelinePath = path.join(root, 'src/core/timeline.ts');
if (!existsSync(timelinePath)) {
  if (existsSync(path.join(root, 'src/core/timeline.template.ts'))) fail('src/core/timeline.ts 未存在（仲係 timeline.template.ts）——先 rename 再填 T。');
  fail(`src/core/timeline.ts 搵唔到`);
}

// ------------------------------------------------------------------------------------ camera registry
// src/core/camera-registry.ts (optional): export const CAMERA_REGISTRY: {
//   fn: string;                 // function/const name as declared in `file`
//   file: string;               // path relative to src/, e.g. 'scenes/tunnel.ts'
//   scenes: string[];           // scene export ids (as in main.ts SCENES) this camera drives
//   kind: 'cam' | 'scale' | 'depth';  // what the fn returns: Cam object | zoom factor | forward depth
// }[]
const registryPath = path.join(root, 'src/core/camera-registry.ts');
let REGISTRY = [];
if (existsSync(registryPath)) {
  const rm = await importCode(bundleFile(registryPath));
  REGISTRY = rm.CAMERA_REGISTRY;
  if (!Array.isArray(REGISTRY)) fail('src/core/camera-registry.ts 冇 export CAMERA_REGISTRY 陣列');
  for (const e of REGISTRY) {
    if (!e || typeof e.fn !== 'string' || typeof e.file !== 'string' || !Array.isArray(e.scenes) || !['cam', 'scale', 'depth'].includes(e.kind)) {
      fail(`CAMERA_REGISTRY 條目形狀錯：${JSON.stringify(e)}——要 {fn, file, scenes[], kind:'cam'|'scale'|'depth'}`);
    }
    if (!existsSync(path.join(root, 'src', e.file))) fail(`CAMERA_REGISTRY: ${e.file} 唔存在（fn=${e.fn}）`);
  }
} else {
  warn('src/core/camera-registry.ts 搵唔到——只有經 core/camera.ts applyCam() 嘅鏡頭會被計。自家鏡頭函數（例如 zoom factor／depth）要登記先算。');
}
const regByFile = new Map();
for (const e of REGISTRY) {
  const abs = path.resolve(root, 'src', e.file);
  if (!regByFile.has(abs)) regByFile.set(abs, []);
  regByFile.get(abs).push(e);
}
const cameraTsAbs = path.resolve(root, 'src/core/camera.ts');
const timelineAbs = path.resolve(timelinePath);

// Source rewrite: rename the original declaration of `name`, append a recording wrapper under the
// original name (a hoisted function declaration, so existing call sites — including module-level
// ones after the original declaration — keep working).
function instrumentFn(src, name, file, valueArg) {
  const esc = name.replace(/[$]/g, '\\$');
  const fnRe = new RegExp(`(^|\\n)([ \\t]*)(export[ \\t]+)?function[ \\t]+${esc}[ \\t]*(<[^>]*>)?[ \\t]*\\(`, 'g');
  const varRe = new RegExp(`(^|\\n)([ \\t]*)(export[ \\t]+)?(const|let|var)[ \\t]+${esc}\\b([ \\t]*:[^=\\n]+)?[ \\t]*=`, 'g');
  const fnHits = [...src.matchAll(fnRe)];
  const varHits = [...src.matchAll(varRe)];
  if (fnHits.length + varHits.length !== 1) {
    fail(`camera 登記：喺 ${file} 搵到 ${fnHits.length + varHits.length} 個 "${name}" 頂層宣告（要啱啱好 1 個）——檢查 CAMERA_REGISTRY 嘅 fn/file。`);
  }
  let exported;
  let out;
  if (fnHits.length) {
    exported = !!fnHits[0][3];
    out = src.replace(fnRe, (_m, a, b, _e, g) => `${a}${b}function __cpfOrig_${name}${g ?? ''}(`);
  } else {
    exported = !!varHits[0][3];
    out = src.replace(varRe, (_m, a, b, _e, kw, ty) => `${a}${b}${kw} __cpfOrig_${name}${ty ?? ''} =`);
  }
  out += `\n${exported ? 'export ' : ''}function ${name}(...a: any[]): any { const r = (__cpfOrig_${name} as any)(...a); (globalThis as any).__cpfCamRec?.(${JSON.stringify(name)}, ${valueArg === 'ret' ? 'r' : `a[${valueArg}]`}, a); return r; }\n`;
  return out;
}

// N9: replace `export const T = <expr>;` with `const __cpfT_raw = <expr>;` + `export const T =
// __cpfWrapT(__cpfT_raw);` right after the statement, so every module (including timeline.ts's own
// later lines) sees a Proxy that can detect enumeration (Object.keys / spread / for-in / `in`).
// Statement end = first `;` at bracket depth 0, or the first newline at depth 0 after a bracket
// closed. Returns null if the shape is not recognised (then the getter fallback is used).
function wrapTDeclaration(src) {
  const m = /(^|\n)([ \t]*)export[ \t]+const[ \t]+T\b([ \t]*:[^=\n]+)?[ \t]*=/.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  let opened = false;
  const n = src.length;
  for (; i < n; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; if (depth === 0 && opened) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if ('([{'.includes(c)) { depth++; opened = true; }
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) { i++; break; }
    else if (c === '\n' && depth === 0 && opened) break;
  }
  if (i >= n && depth !== 0) return null;
  const head = src.slice(0, m.index) + `${m[1]}${m[2]}const __cpfT_raw${m[3] ?? ''} =`;
  const expr = src.slice(m.index + m[0].length, i);
  return `${head}${expr}\nexport const T = (globalThis as any).__cpfWrapT(__cpfT_raw) as typeof __cpfT_raw;\n${src.slice(i)}`;
}

const instrumentPlugin = {
  name: 'cpf-instrument',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, (args) => {
      const abs = path.resolve(args.path);
      const regs = regByFile.get(abs);
      const isCam = abs === cameraTsAbs;
      const isTimeline = abs === timelineAbs;
      if (!regs && !isCam && !isTimeline) return undefined;
      let src = readFileSync(abs, 'utf8');
      if (isCam && /\bfunction\s+applyCam\b/.test(src)) src = instrumentFn(src, 'applyCam', 'core/camera.ts', 1);
      for (const e of regs ?? []) src = instrumentFn(src, e.fn, e.file, 'ret');
      if (isTimeline) {
        const wrapped = wrapTDeclaration(src);
        if (wrapped) src = wrapped;
        else if (/\bexport\s+const\s+T\s*[:=]/.test(src)) src += `\n;(globalThis as any).__cpfHookT?.(T);\n`;
      }
      return { contents: src, loader: 'ts' };
    });
  },
};

// ------------------------------------------------------------------------------------ mock canvas
let CW = configModule.W;
let CH = configModule.H;
function parseAlpha(style) {
  if (typeof style !== 'string') return 1; // gradient/pattern: unknown → assume visible
  const s = style.trim().toLowerCase();
  if (s === 'transparent') return 0;
  let m = s.match(/^rgba?\(([^)]*)\)$/) || s.match(/^hsla?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length >= 4) {
      const a = parts[3];
      return a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
    }
    return 1;
  }
  m = s.match(/^#([0-9a-f]{8})$/);
  if (m) return parseInt(m[1].slice(6), 16) / 255;
  m = s.match(/^#([0-9a-f]{4})$/);
  if (m) return parseInt(m[1][3] + m[1][3], 16) / 255;
  return 1;
}
class MockGradient {
  addColorStop() {}
}
class MockPattern {
  setTransform() {}
}
class BBox {
  constructor() {
    this.x0 = Infinity;
    this.y0 = Infinity;
    this.x1 = -Infinity;
    this.y1 = -Infinity;
  }
  add(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < this.x0) this.x0 = x;
    if (y < this.y0) this.y0 = y;
    if (x > this.x1) this.x1 = x;
    if (y > this.y1) this.y1 = y;
  }
  get empty() {
    return this.x0 > this.x1;
  }
}
// Path2D records points in its own (untransformed) space; fill(path) transforms them at paint time.
class MockPath2D {
  constructor(p) {
    this.pts = p instanceof MockPath2D ? p.pts.slice() : [];
  }
  _p(x, y) {
    this.pts.push([x, y]);
  }
  moveTo(x, y) { this._p(x, y); }
  lineTo(x, y) { this._p(x, y); }
  bezierCurveTo(a, b, c, d, x, y) { this._p(a, b); this._p(c, d); this._p(x, y); }
  quadraticCurveTo(a, b, x, y) { this._p(a, b); this._p(x, y); }
  arcTo(a, b, x, y) { this._p(a, b); this._p(x, y); }
  arc(x, y, r) { this._p(x - r, y - r); this._p(x + r, y + r); this._p(x - r, y + r); this._p(x + r, y - r); }
  ellipse(x, y, rx, ry) { const r = Math.max(rx, ry); this.arc(x, y, r); }
  rect(x, y, w, h) { this._p(x, y); this._p(x + w, y + h); this._p(x, y + h); this._p(x + w, y); }
  roundRect(x, y, w, h) { this.rect(x, y, w, h); }
  closePath() {}
  addPath(p) { if (p instanceof MockPath2D) this.pts.push(...p.pts); }
}
const STATE_KEYS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'globalAlpha', 'globalCompositeOperation', 'font', 'textAlign', 'textBaseline', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'filter', 'imageSmoothingEnabled', 'imageSmoothingQuality', 'lineDashOffset', 'direction', 'letterSpacing'];
class MockCtx {
  constructor(w = CW ?? 1920, h = CH ?? 1080, onscreen = false) {
    this.canvas = { width: w, height: h };
    this._w = w;
    this._h = h;
    this._on = onscreen; // only the scene's own canvas counts as "visible paint"
    this._m = [1, 0, 0, 1, 0, 0];
    this._stack = [];
    this._path = new MockPath2D();
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.miterLimit = 10;
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.shadowBlur = 0;
    this.shadowColor = 'transparent';
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
    this.filter = 'none';
    this.imageSmoothingEnabled = true;
    this.imageSmoothingQuality = 'low';
    this.lineDashOffset = 0;
    this.direction = 'inherit';
    this.letterSpacing = '0px';
    this.visiblePaints = 0;
    this.paintScales = []; // hypot(a,b) of the matrix for each visible paint
    this.onText = undefined;
  }
  save() {
    const st = { m: this._m.slice() };
    for (const k of STATE_KEYS) st[k] = this[k];
    this._stack.push(st);
  }
  restore() {
    const st = this._stack.pop();
    if (!st) return;
    this._m = st.m;
    for (const k of STATE_KEYS) this[k] = st[k];
  }
  _mul(a, b, c, d, e, f) {
    const m = this._m;
    this._m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
  }
  translate(x, y) { this._mul(1, 0, 0, 1, x, y); }
  scale(sx, sy) { this._mul(sx, 0, 0, sy ?? sx, 0, 0); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this._mul(c, s, -s, c, 0, 0); }
  transform(a, b, c, d, e, f) { this._mul(a, b, c, d, e, f); }
  setTransform(a, b, c, d, e, f) {
    if (a && typeof a === 'object') this._m = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
    else if (a === undefined) this._m = [1, 0, 0, 1, 0, 0];
    else this._m = [a, b, c, d, e, f];
  }
  resetTransform() { this._m = [1, 0, 0, 1, 0, 0]; }
  getTransform() { const [a, b, c, d, e, f] = this._m; return { a, b, c, d, e, f, m11: a, m12: b, m21: c, m22: d, m41: e, m42: f, is2D: true }; }
  _dev(x, y) { const m = this._m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  beginPath() { this._path = new MockPath2D(); }
  closePath() {}
  moveTo(x, y) { this._path.moveTo(x, y); }
  lineTo(x, y) { this._path.lineTo(x, y); }
  bezierCurveTo(...a) { this._path.bezierCurveTo(...a); }
  quadraticCurveTo(...a) { this._path.quadraticCurveTo(...a); }
  arcTo(...a) { this._path.arcTo(...a); }
  arc(...a) { this._path.arc(...a); }
  ellipse(...a) { this._path.ellipse(...a); }
  rect(...a) { this._path.rect(...a); }
  roundRect(...a) { this._path.roundRect(...a); }
  clip() {}
  isPointInPath() { return false; }
  isPointInStroke() { return false; }
  // A paint is "visible" if it lands on the scene's own canvas, with non-zero alpha, not an erase,
  // and its device-space bbox (padded) intersects the canvas.
  _paint(pts, pad, styleAlpha) {
    if (!this._on) return;
    if (this.globalAlpha <= 0.01 || styleAlpha <= 0.01) return;
    if (this.globalCompositeOperation === 'destination-out') return;
    const bb = new BBox();
    for (const [x, y] of pts) {
      const [dx, dy] = this._dev(x, y);
      bb.add(dx, dy);
    }
    if (bb.empty) return;
    const sc = Math.hypot(this._m[0], this._m[1]);
    const p = pad * sc;
    if (bb.x1 + p < 0 || bb.y1 + p < 0 || bb.x0 - p > this._w || bb.y0 - p > this._h) return;
    this.visiblePaints++;
    this.paintScales.push(sc);
  }
  fill(p) { this._paint((p instanceof MockPath2D ? p : this._path).pts, 0, parseAlpha(this.fillStyle)); }
  stroke(p) { this._paint((p instanceof MockPath2D ? p : this._path).pts, this.lineWidth, parseAlpha(this.strokeStyle)); }
  fillRect(x, y, w, h) { this._paint([[x, y], [x + w, y + h], [x, y + h], [x + w, y]], 0, parseAlpha(this.fillStyle)); }
  strokeRect(x, y, w, h) { this._paint([[x, y], [x + w, y + h], [x, y + h], [x + w, y]], this.lineWidth, parseAlpha(this.strokeStyle)); }
  clearRect() {}
  setLineDash() {}
  getLineDash() { return []; }
  _text(text, x, y, style) {
    const s = String(text);
    const size = parseFloat((String(this.font).match(/(\d+(?:\.\d+)?)px/) || [])[1] ?? '10');
    const w = s.length * size;
    const before = this.visiblePaints;
    this._paint([[x - w, y - size], [x + w, y + size]], 0, parseAlpha(style));
    if (this.visiblePaints > before && this.onText && s.trim()) this.onText(s);
  }
  fillText(text, x, y) { this._text(text, x, y, this.fillStyle); }
  strokeText(text, x, y) { this._text(text, x, y, this.strokeStyle); }
  measureText(text) {
    const s = String(text ?? '');
    const size = parseFloat((String(this.font).match(/(\d+(?:\.\d+)?)px/) || [])[1] ?? '10');
    return { width: s.length * size * 0.6, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * size * 0.6, fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 };
  }
  drawImage(img, ...a) {
    let x, y, w, h;
    if (a.length >= 8) [, , , , x, y, w, h] = a;
    else if (a.length >= 4) [x, y, w, h] = a;
    else [x, y, w, h] = [a[0], a[1], img?.width ?? 1, img?.height ?? 1];
    this._paint([[x, y], [x + w, y + h], [x, y + h], [x + w, y]], 0, 1);
  }
  createLinearGradient() { return new MockGradient(); }
  createRadialGradient() { return new MockGradient(); }
  createConicGradient() { return new MockGradient(); }
  createPattern() { return new MockPattern(); }
  createImageData(w, h) { const W_ = typeof w === 'number' ? w : w?.width ?? 1; const H_ = typeof h === 'number' ? h : w?.height ?? 1; return { width: W_, height: H_, data: new Uint8ClampedArray(Math.max(1, W_ * H_ * 4)) }; }
  getImageData(_x, _y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }; }
  putImageData() {}
}
function makeOffscreenCanvas() {
  const c = {
    width: 300,
    height: 150,
    getContext(kind) {
      if (kind !== '2d') return null;
      if (!c._ctx) {
        c._ctx = new MockCtx(c.width, c.height, false);
        c._ctx.canvas = c;
      }
      return c._ctx;
    },
  };
  return c;
}
// Unstubbed browser APIs (Image, fetch, window, …) are intentionally left to throw: a sample that
// throws is a fail-loud engine error, never a silent "no camera".
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? makeOffscreenCanvas() : {}) };
globalThis.Path2D = MockPath2D;
globalThis.OffscreenCanvas = class {
  constructor(w, h) { return Object.assign(makeOffscreenCanvas(), { width: w, height: h }); }
};

// ------------------------------------------------------------------------------------ T read recording
let PHASE = 'pre'; // 'import' while scene modules evaluate, 'draw' while sampling, else ignored
const drawReads = new Set();
const importReads = new Map(); // key -> [{line, text}]
let bundleLines = [];
let hookedT = null;
function callerLine() {
  const prev = Error.prepareStackTrace;
  Error.prepareStackTrace = (_e, cs) => cs;
  const o = {};
  Error.captureStackTrace(o, callerLine);
  const cs = o.stack;
  Error.prepareStackTrace = prev;
  // innermost bundle frame = the line that reads T; outermost bundle frame = the module-level
  // statement being evaluated at import time.
  const lines = cs.filter((c) => (c.getFileName?.() ?? '').startsWith('data:')).map((c) => c.getLineNumber());
  return lines.length ? { inner: lines[0], outer: lines[lines.length - 1] } : null;
}
function hookT(T) {
  if (!T || typeof T !== 'object' || hookedT) return;
  hookedT = T;
  if (!proxyMode) warn('T 用 getter 後備模式（非 Proxy）——列舉偵測唔到。');
  for (const key of Object.keys(T)) {
    const desc = Object.getOwnPropertyDescriptor(T, key);
    if (!desc || !desc.configurable) {
      warn(`T.${key} 唔可以重新定義（frozen?）——呢個 key 嘅使用情況量唔到`);
      continue;
    }
    let val = T[key];
    Object.defineProperty(T, key, {
      enumerable: true,
      configurable: true,
      get() {
        if (PHASE === 'draw') drawReads.add(key);
        else if (PHASE === 'import') {
          const ln = callerLine();
          if (!importReads.has(key)) importReads.set(key, []);
          importReads.get(key).push({ inner: ln?.inner ?? null, outer: ln?.outer ?? null, text: ln ? (bundleLines[ln.inner - 1] ?? '').trim() : '' });
        }
        return val;
      },
      set(v) {
        val = v;
      },
    });
  }
  PHASE = 'import';
}
globalThis.__cpfHookT = hookT;
// Proxy path (N9). rawT is kept for this script's own iteration so it never trips the traps.
let rawT = null;
let tEnumerations = []; // { trap, phase, text }
let proxyMode = false;
function recordRead(key) {
  if (PHASE === 'draw') drawReads.add(key);
  else if (PHASE === 'import') {
    const ln = callerLine();
    if (!importReads.has(key)) importReads.set(key, []);
    importReads.get(key).push({ inner: ln?.inner ?? null, outer: ln?.outer ?? null, text: ln ? (bundleLines[ln.inner - 1] ?? '').trim() : '' });
  }
}
function recordEnum(trap) {
  if (PHASE !== 'draw' && PHASE !== 'import') return;
  if (tEnumerations.length < 50) {
    const ln = callerLine();
    tEnumerations.push({ trap, phase: PHASE, text: ln ? (bundleLines[ln.inner - 1] ?? '').trim().slice(0, 80) : '' });
  }
}
globalThis.__cpfWrapT = (raw) => {
  rawT = raw;
  hookedT = raw;
  proxyMode = true;
  PHASE = 'import';
  return new Proxy(raw, {
    get(target, key, recv) {
      if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(target, key)) recordRead(key);
      return Reflect.get(target, key, recv);
    },
    ownKeys(target) {
      recordEnum('ownKeys');
      return Reflect.ownKeys(target);
    },
    has(target, key) {
      recordEnum(`has(${String(key)})`);
      return Reflect.has(target, key);
    },
    getOwnPropertyDescriptor(target, key) {
      recordEnum(`getOwnPropertyDescriptor(${String(key)})`);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
};

// ------------------------------------------------------------------------------------ camera recording
let CUR = null; // { sceneId, t }
const camRecs = []; // { sceneId, fn, t, argT, value }
globalThis.__cpfCamRec = (fn, value, args) => {
  if (!CUR) return;
  camRecs.push({ sceneId: CUR.sceneId, fn, t: CUR.t, argT: typeof args?.[0] === 'number' ? args[0] : undefined, value });
};

// ------------------------------------------------------------------------------------ single bundle
const allSceneIdsFromMain = mainSceneIds;
const entryLines = [`export * as __timeline from './core/timeline';`];
const sceneModuleVar = new Map();
let k = 0;
for (const id of new Set(allSceneIdsFromMain)) {
  const rel = idToFile.get(id);
  if (!rel) continue;
  if (![...sceneModuleVar.values()].some((v) => v.rel === rel)) {
    sceneModuleVar.set(id, { v: `__s${k}`, rel });
    entryLines.push(`export * as __s${k} from '${rel}';`);
    k++;
  } else {
    const existing = [...sceneModuleVar.values()].find((v) => v.rel === rel);
    sceneModuleVar.set(id, existing);
  }
}
let bundleText;
try {
  bundleText = (await esbuild.build({
    stdin: { contents: entryLines.join('\n'), resolveDir: path.join(root, 'src'), loader: 'ts', sourcefile: '__cpf_entry.ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [instrumentPlugin],
  })).outputFiles[0].text;
} catch (e) {
  fail(`bundle 失敗: ${e.message}`);
}
bundleLines = bundleText.split('\n');
let bundle;
try {
  bundle = await importCode(bundleText);
} catch (e) {
  fail(`import 失敗（scene module 頂層撞到未 stub 嘅 API？）: ${e.stack || e.message}`);
}
PHASE = 'idle';
const timelineModule = bundle.__timeline;
const T = rawT ?? timelineModule.T; // raw object: our own Object.keys() must not trip the Proxy traps
const DURATION = timelineModule.DURATION;
if (!T || typeof T !== 'object') fail('src/core/timeline.ts 冇 export T');
if (typeof DURATION !== 'number') fail('src/core/timeline.ts 冇 export DURATION');
if (!hookedT) {
  warn('timeline.ts 唔係 "export const T = ..." 形式——import 期 T 讀取量唔到，只量 draw 期；列舉（Object.keys 等）偵測唔到。');
  hookT(T);
  PHASE = 'idle';
}
if (CW === undefined) {
  // legacy projects keep W/H in core/math.ts
  const mathPath = path.join(root, 'src/core/math.ts');
  if (existsSync(mathPath)) {
    const mm = await importCode(bundleFile(mathPath));
    CW = mm.W;
    CH = mm.H;
  }
}
if (typeof CW !== 'number' || typeof CH !== 'number') fail('搵唔到 W/H（src/config.ts 或 src/core/math.ts）');

// ENDINGS (optional): { name, scenes[] }[] — every gate runs once per branch.
let branches = [{ name: 'main', sceneIds: mainSceneIds }];
if (timelineModule.ENDINGS !== undefined) {
  const E = timelineModule.ENDINGS;
  if (!Array.isArray(E) || E.some((e) => !e || typeof e.name !== 'string' || !Array.isArray(e.scenes))) fail('ENDINGS 形狀要係 { name: string; scenes: string[] }[]');
  branches = E.map((e) => ({ name: e.name, sceneIds: e.scenes }));
  console.log(`${TAG}: ENDINGS ${branches.length} 個分支：${branches.map((b) => b.name).join(', ')}`);
}
const allSceneIds = [...new Set(branches.flatMap((b) => b.sceneIds))];

const sceneById = new Map();
for (const id of allSceneIds) {
  const mv = sceneModuleVar.get(id);
  if (!mv) {
    sceneById.set(id, { id, error: `src/main.ts 冇 "import { ${id} } from './scenes/...'"` });
    continue;
  }
  const scene = bundle[mv.v]?.[id];
  if (!scene || typeof scene.start !== 'number' || typeof scene.end !== 'number' || typeof scene.draw !== 'function') {
    sceneById.set(id, { id, error: `${mv.rel}.ts 冇 export ${id}（或缺 start/end/draw）` });
    continue;
  }
  const start = Math.max(0, Math.min(DURATION, scene.start));
  const end = Math.max(0, Math.min(DURATION, scene.end));
  sceneById.set(id, { id, file: mv.rel, scene, rawStart: scene.start, rawEnd: scene.end, start, end, length: Math.max(0, end - start), clamped: start !== scene.start || end !== scene.end });
}

// ------------------------------------------------------------------------------------ sampling
const STEP = 0.25;
const engineErrors = [];
const captionEvents = [];
function sampleTimes(start, end) {
  const out = [];
  for (let t = start; t < end - EPS; t += STEP) out.push(t);
  if (!out.length && end - start > EPS) out.push(start);
  const last = Math.max(start, end - 1e-3);
  if (out.length && last - out[out.length - 1] > 0.05) out.push(last);
  return out;
}
PHASE = 'draw';
const sceneStats = new Map();
for (const [id, e] of sceneById) {
  if (e.error) continue;
  const st = { samples: 0, visibleSamples: 0, medScales: [] };
  for (const t of sampleTimes(e.start, e.end)) {
    const ctx = new MockCtx(CW, CH, true);
    ctx.onText = (text) => captionEvents.push({ text, t, sceneId: id });
    CUR = { sceneId: id, t };
    try {
      e.scene.draw(ctx, t);
    } catch (err) {
      engineErrors.push({ sceneId: id, t, error: err.stack || err.message || String(err) });
      continue;
    } finally {
      CUR = null;
    }
    st.samples++;
    if (ctx.visiblePaints > 0) {
      st.visibleSamples++;
      const s = ctx.paintScales.slice().sort((a, b) => a - b);
      st.medScales.push(s[Math.floor(s.length / 2)]);
    }
  }
  sceneStats.set(id, st);
}
// bgAt / finishLook are part of the real render (main.ts renderAt) — T keys they read are used.
for (let t = 0; t < DURATION; t += STEP) {
  try {
    timelineModule.bgAt?.(t);
    timelineModule.finishLook?.(t);
  } catch (err) {
    engineErrors.push({ sceneId: '(timeline bgAt/finishLook)', t, error: err.stack || String(err) });
  }
}
PHASE = 'idle';
if (engineErrors.length) {
  for (const e of engineErrors.slice(0, 20)) console.error(`  ! scene=${e.sceneId} t=${e.t.toFixed(2)}: ${e.error.split('\n')[0]}`);
  fail(`${engineErrors.length} 個 draw() 抽樣失敗（見上）——未 stub 嘅 browser API 要喺 MockCtx／mock document 補 stub，唔准吞咗當 0。`);
}

// ------------------------------------------------------------------------------------ T key usage
// A key counts as used if it is read during draw() sampling (or bgAt/finishLook), OR — at import
// time — either (a) on a scene object's own `start:`/`end:` line, or (b) inside a module-level
// declaration whose name is referenced somewhere else in the bundle (a precomputed value that
// feeds drawing, e.g. an example project's shared.ts `HANDOFF_FRAME = galFrame(T.tunnelSeed)` → TUNNEL_SEEDS).
// A top-level declaration referenced by nothing but esbuild's own export map (`name: () => name`)
// is dead code — gaming vector ④ — and does NOT count. Liveness is one level deep (a dead chain of
// two declarations referencing each other is out of the threat model).
const SCENE_BOUNDARY_LINE = /(^|[\s{,])(start|end)\s*:/;
const DECL_RE = /^(?:export\s+)?(?:var|let|const|function\*?|class)\s+([\w$]+)/;
function enclosingDecl(lineNo) {
  for (let i = lineNo - 1; i >= 0; i--) {
    const m = bundleLines[i].match(DECL_RE);
    if (m) return { name: m[1], line: i + 1 };
    if (/^\S/.test(bundleLines[i]) && !/^[}\])]/.test(bundleLines[i])) return null;
  }
  return null;
}
const liveCache = new Map();
function declIsLive(decl) {
  if (liveCache.has(decl.name)) return liveCache.get(decl.name);
  const re = new RegExp(`(^|[^\\w$.])${decl.name.replace(/[$]/g, '\\$')}(?![\\w$])`);
  const exportGetter = new RegExp(`^\\s*${decl.name.replace(/[$]/g, '\\$')}:\\s*\\(\\)\\s*=>\\s*${decl.name.replace(/[$]/g, '\\$')},?$`);
  let live = false;
  for (let i = 0; i < bundleLines.length && !live; i++) {
    if (i + 1 === decl.line) continue;
    const l = bundleLines[i];
    if (exportGetter.test(l)) continue;
    if (re.test(l)) {
      // ignore references that sit inside the declaration's own body (same statement)
      const d = enclosingDecl(i + 1);
      if (d && d.line === decl.line) continue;
      live = true;
    }
  }
  liveCache.set(decl.name, live);
  return live;
}
const keyUsage = [];
for (const key of Object.keys(T)) {
  if (drawReads.has(key)) {
    keyUsage.push({ key, used: true, how: 'draw' });
    continue;
  }
  const ir = importReads.get(key) ?? [];
  if (ir.some((r) => SCENE_BOUNDARY_LINE.test(r.text))) {
    keyUsage.push({ key, used: true, how: 'scene start/end' });
    continue;
  }
  const liveDecl = ir.map((r) => (r.outer ? enclosingDecl(r.outer) : null)).find((d) => d && declIsLive(d));
  if (liveDecl) {
    keyUsage.push({ key, used: true, how: `module-level precompute → ${liveDecl.name}` });
    continue;
  }
  const d0 = ir[0]?.outer ? enclosingDecl(ir[0].outer) : null;
  keyUsage.push({ key, used: false, how: ir.length ? `import-time only, dead declaration ${d0 ? d0.name : '(unknown)'} (${ir[0].text.slice(0, 60)})` : 'never read' });
}
const unusedBeatKeys = keyUsage.filter((u) => !u.used);

// ------------------------------------------------------------------------------------ camera per scene
// Variation thresholds for a registered/Cam camera. Anchors (same two reference films, see
// docs/design/preproduction.md):
//   largest known cosmetic wobble = a breathing-scale idle animation, ±2% (scale ratio 1.04);
//   smallest known real camera move = a slow push, scale 1→1.08.
const CAM_SCALE_RATIO = 1.05;
const CAM_ROT_RAD = 0.03;
const CAM_PAN_PX = 40; // Cam x/y (world px) or anchor ax/ay range
const CAM_DEPTH_RANGE = 0.5; // 'depth' kind: forward travel in the fn's own units (example camZ: 0 → ~12 over the tunnel)
const regEntryByFn = new Map(REGISTRY.map((e) => [e.fn, e]));
const regWarnings = [];
function rangeOf(xs) {
  const v = xs.filter((x) => Number.isFinite(x));
  if (!v.length) return { min: NaN, max: NaN };
  return { min: Math.min(...v), max: Math.max(...v) };
}
function camVaries(kind, perSample) {
  if (perSample.length < 2) return { varies: false, detail: 'only one sample' };
  if (kind === 'cam') {
    const s = rangeOf(perSample.map((v) => v?.s));
    const r = rangeOf(perSample.map((v) => v?.rot ?? 0));
    const x = rangeOf(perSample.map((v) => v?.x));
    const y = rangeOf(perSample.map((v) => v?.y));
    const ax = rangeOf(perSample.map((v) => v?.ax ?? 0));
    const ay = rangeOf(perSample.map((v) => v?.ay ?? 0));
    const sRatio = s.min > 0 ? s.max / s.min : NaN;
    const pan = Math.max(Math.hypot(x.max - x.min, y.max - y.min) || 0, Math.hypot(ax.max - ax.min, ay.max - ay.min) || 0);
    const varies = sRatio >= CAM_SCALE_RATIO || r.max - r.min >= CAM_ROT_RAD || pan >= CAM_PAN_PX;
    return { varies, detail: `s×${fmt(sRatio)} rot=${fmt(r.max - r.min)}rad pan=${fmt(pan)}px` };
  }
  const vals = perSample.filter((v) => typeof v === 'number');
  const r = rangeOf(vals);
  if (kind === 'scale') {
    const ratio = r.min > 0 ? r.max / r.min : NaN;
    return { varies: ratio >= CAM_SCALE_RATIO, detail: `scale×${fmt(ratio)} (${fmt(r.min)}→${fmt(r.max)})` };
  }
  return { varies: r.max - r.min >= CAM_DEPTH_RANGE, detail: `depth Δ=${fmt(r.max - r.min)}` };
}
const sceneCamera = new Map();
for (const [id, e] of sceneById) {
  if (e.error) continue;
  const recs = camRecs.filter((r) => r.sceneId === id);
  const byFn = new Map();
  for (const r of recs) {
    if (!byFn.has(r.fn)) byFn.set(r.fn, []);
    byFn.get(r.fn).push(r);
  }
  const credits = [];
  for (const [fn, rs] of byFn) {
    const reg = regEntryByFn.get(fn);
    const kind = fn === 'applyCam' ? 'cam' : reg.kind;
    if (fn !== 'applyCam' && !reg.scenes.includes(id)) {
      regWarnings.push(`鏡頭函數 ${fn} 喺 ${id} draw 期間被呼叫，但 CAMERA_REGISTRY 冇列 ${id}——唔計；如果係 ${id} 嘅鏡頭，加入 scenes。`);
      continue;
    }
    // one representative value per sample time: prefer the call whose first arg IS the sample t
    const perT = new Map();
    for (const r of rs) {
      const exact = r.argT !== undefined && Math.abs(r.argT - r.t) < 1e-9;
      const cur = perT.get(r.t);
      if (!cur || (exact && !cur.exact)) perT.set(r.t, { exact, value: r.value });
    }
    const v = camVaries(kind, [...perT.values()].map((x) => x.value));
    credits.push({ fn, kind, ...v });
  }
  for (const reg of REGISTRY) {
    if (reg.scenes.includes(id) && !byFn.has(reg.fn)) regWarnings.push(`CAMERA_REGISTRY: ${reg.fn} 登記咗 ${id}，但 ${id} draw 抽樣期間從未呼叫——死登記（唔計）。`);
  }
  const hasCamera = credits.some((c) => c.varies);
  // unregistered big ctx transform change → WARN only
  const st = sceneStats.get(id);
  let unregistered = null;
  if (!hasCamera && st?.medScales.length >= 2) {
    const r = rangeOf(st.medScales);
    if (r.min > 0 && r.max / r.min >= 1.15) unregistered = `ctx 繪製 scale 中位數 ${fmt(r.min)}→${fmt(r.max)}（×${fmt(r.max / r.min)}）`;
  }
  sceneCamera.set(id, { hasCamera, credits, unregistered });
}

// ------------------------------------------------------------------------------------ beats
// N8: only keys actually read during draw() sampling are beats (a key the film never reads is not
// a beat the viewer sees, and must not improve the spacing numbers).
const onsetsRaw = [];
for (const val of Object.keys(T).filter((k) => drawReads.has(k)).map((k) => T[k])) {
  if (typeof val === 'number') onsetsRaw.push(val);
  else if (Array.isArray(val) && typeof val[0] === 'number') onsetsRaw.push(val[0]);
}
onsetsRaw.sort((a, b) => a - b);
const ONSET_MERGE = 0.1;
const onsets = [];
for (const o of onsetsRaw) if (!onsets.length || o - onsets[onsets.length - 1] > ONSET_MERGE + EPS) onsets.push(o);
const gaps = onsets.slice(1).map((o, i) => o - onsets[i]);
const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : NaN;
const maxGap = gaps.length ? Math.max(...gaps) : NaN;

// ------------------------------------------------------------------------------------ per branch
const MIN_SCENE_LEN = 0.5;
const OVERLAY_FRACTION = 0.95;
function computeBranch(b) {
  const entries = b.sceneIds.map((id) => sceneById.get(id) ?? { id, error: 'unknown scene id' });
  const errors = entries.filter((e) => e.error);
  const ok = entries.filter((e) => !e.error);
  const eligible = [];
  const excluded = [];
  for (const s of ok) {
    const st = sceneStats.get(s.id);
    if (s.length >= DURATION * OVERLAY_FRACTION) excluded.push({ s, why: 'overlay（≥95% 片長）' });
    else if (s.length < MIN_SCENE_LEN) excluded.push({ s, why: `<${MIN_SCENE_LEN}s（${s.length.toFixed(2)}s）` });
    else if (!st || st.visibleSamples === 0) excluded.push({ s, why: '抽樣期間零可見 paint（alpha≈0／畫落畫布外）' });
    else eligible.push(s);
  }
  // duration-weighted coefficient of variation: each scene weighted by its own length, so adding
  // short scenes barely moves it.
  const L = eligible.map((s) => s.length);
  const sumL = L.reduce((a, b) => a + b, 0);
  const meanW = sumL ? L.reduce((a, l) => a + l * l, 0) / sumL : NaN;
  const varW = sumL ? L.reduce((a, l) => a + l * (l - meanW) ** 2, 0) / sumL : NaN;
  const lenCV = sumL ? Math.sqrt(varW) / meanW : NaN;
  const camLen = eligible.filter((s) => sceneCamera.get(s.id)?.hasCamera).reduce((a, s) => a + s.length, 0);
  const camCoverage = sumL ? camLen / sumL : NaN;
  const idSet = new Set(b.sceneIds);
  const firstT = new Map();
  for (const e of captionEvents) {
    if (!idSet.has(e.sceneId)) continue;
    const p = firstT.get(e.text);
    if (p === undefined || e.t < p) firstT.set(e.text, e.t);
  }
  const ts = [...firstT.values()].sort((a, b) => a - b);
  let peak8s = 0;
  for (let i = 0; i < ts.length; i++) peak8s = Math.max(peak8s, ts.filter((x) => x >= ts[i] && x < ts[i] + 8).length);
  let minCapGap = Infinity;
  for (let i = 1; i < ts.length; i++) minCapGap = Math.min(minCapGap, ts[i] - ts[i - 1]);
  const maxCapLen = firstT.size ? Math.max(...[...firstT.keys()].map((s) => [...s].length)) : 0;
  return { b, errors, ok, eligible, excluded, lenCV, camCoverage, camLen, sumL, distinctCaptions: firstT.size, peak8s, minCapGap: Number.isFinite(minCapGap) ? minCapGap : NaN, maxCapLen };
}
const results = branches.map(computeBranch);

// ------------------------------------------------------------------------------------ bands
// CALIBRATION (N=1 positive + N=1 negative — NOT statistically robust; re-check after every real
//   film, this is a starting point, not a settled science):
//   positive anchor: a pure procedural-visual short with no on-screen text budget (the "abstract"
//   profile's own shape) — dense beats, full-length camera movement, uneven scene lengths.
//   negative anchor: a slideshow-like B2B piece a human reviewer rated "no narrative, feels like
//   flipping through slides" — sparse beats, near-fixed camera, evenly-split scene lengths.
//   Measured with THIS script against a scratch copy of the positive-anchor film (with
//   camera-registry.ts added, no scene changes) vs. the negative-anchor film as-is. Each band
//   states its margin to both anchors:
//     beat avg gap     positive 0.916s | negative 4.500s → green ≤1.2 (margin +0.28s), red >2.5 (negative 1.8x over)
//                      (N8: onsets from keys READ during draw only — positive anchor 36/41 keys; was 0.833 over all 41)
//     beat max gap     positive 3.000s | negative 9.000s → green ≤4.0 (margin +1.0s), red >6.0 (negative +3.0s over)
//     scene length CV  positive 0.244  | negative 0.127  → green ≥0.21 (margin 0.034), red <0.16 (negative 0.033 under)
//                      (duration-weighted; the WEAKEST separator of the four — only 1.9x apart. Treat
//                       yellow here as "look", never as a verdict.)
//     camera coverage  positive 1.000  | negative 0.000  → green ≥0.50 (margin 0.50), red <0.20 (negative 0.20 under)
//                      (positive anchor: 4 scenes via applyCam + 3 registered scale fns + 1 registered
//                       depth fn = 8/8; without the registry file it is 0.485 = yellow, never red)
//   YELLOW means "between the two anchors — look at it": e.g. avg beat gap 1.2-2.5s = beats sparser
//   than the abstract reference but denser than one-beat-per-slide; camera 0.2-0.5 = some scenes move,
//   most are fixed frames. Yellow never fails the run; the P5 rubric decides.
//   info-narrative: the only sourced anchor is the NEGATIVE one, so red lines anchored to it stay
//   'gate'; everything else with no source (relaxed beat spacing, caption/narration budgets) is
//   severity 'suggestion' — pending calibration against more real films.
function band(value, { greenIf, redIf }) {
  if (Number.isNaN(value)) return 'red';
  if (greenIf(value)) return 'green';
  if (redIf(value)) return 'red';
  return 'yellow';
}
// skipReason (Step 2b fix, 2026-09-28): a fresh scaffold (new-film.mjs output, untouched) has ONE
// placeholder scene spanning the whole DURATION — it gets excluded as an "overlay" (≥95% of the
// film), leaving 0 eligible scenes, so sumL=0 and lenCV/camCoverage divide 0/0 → NaN → band() above
// turns that NaN into 'red' → a 'gate' severity gate FAILs the run before a single real scene has
// been written. Likewise a placeholder-only T table has ≤1 onset, so gaps=[] → avgGap/maxGap=NaN →
// same false FAIL. None of this is a real "looks like a slideshow" signal — it is "there is nothing
// to measure yet" — so these gates SKIP (not red, not green) whenever there is too little material,
// and the reason is printed instead of a bare NaN.
function gate(name, desc, value, bands, severity, skipReason) {
  if (skipReason) return { name, desc, value, band: 'skip', severity, failsRun: false, skipReason };
  const b = band(value, bands);
  return { name, desc, value, band: b, severity, failsRun: severity === 'gate' && b === 'red' };
}
const IN = PROFILE !== 'abstract'; // music/explainer/history reuse info-narrative bands (Step 2 TODO: real per-profile bands)
const TODO_UNCALIBRATED = '（info-narrative 冇出處，待更多實戰片校準）';
const notEnoughBeats = gaps.length === 0;
const beatSkipReason = notEnoughBeats
  ? `merged onsets=${onsets.length}（<2），未有兩個以上嘅 beat 計唔到間距——起手/placeholder 階段，未寫夠 T beats`
  : null;
const globalGates = [
  IN
    ? gate('beat-spacing-avg', `平均 beat 間距 🟢≤2.0 🔴>3.2 ${TODO_UNCALIBRATED}`, avgGap, { greenIf: (v) => v <= 2.0, redIf: (v) => v > 3.2 }, 'suggestion', beatSkipReason)
    : gate('beat-spacing-avg', '平均 beat 間距（合併 0.1s 內 onset）🟢≤1.2s 🔴>2.5s', avgGap, { greenIf: (v) => v <= 1.2, redIf: (v) => v > 2.5 }, 'gate', beatSkipReason),
  IN
    ? gate('beat-spacing-max-gap', `最長無事件空檔 🟢≤5.0 🔴>8.0 ${TODO_UNCALIBRATED}`, maxGap, { greenIf: (v) => v <= 5.0, redIf: (v) => v > 8.0 }, 'suggestion', beatSkipReason)
    : gate('beat-spacing-max-gap', '最長無事件空檔 🟢≤4.0s 🔴>6.0s', maxGap, { greenIf: (v) => v <= 4.0, redIf: (v) => v > 6.0 }, 'gate', beatSkipReason),
];
const branchGates = results.map((r) => {
  // Same skip rationale as beatSkipReason above: with <2 eligible scenes (a fresh scaffold's lone
  // placeholder scene is excluded as an overlay, leaving 0) CV/coverage divide 0/0 → NaN, or with
  // exactly 1 eligible scene the "variation" they measure is undefined by construction (nothing to
  // vary against) — neither is a real slideshow signal, so SKIP instead of a false FAIL/NaN.
  const sceneSkipReason =
    r.eligible.length < 2 ? `合資格場景 <2（${r.eligible.length}），CV／鏡頭覆蓋率喺單場景/零場景冇意義——起手/placeholder 階段` : null;
  const g = [
    gate('scene-length-cv', '場景長度時長加權 CV（唔准均分）🟢≥0.21 🔴<0.16（紅線錨：負面對照片）', r.lenCV, { greenIf: (v) => v >= 0.21, redIf: (v) => v < 0.16 }, 'gate', sceneSkipReason),
    gate('camera-coverage', '有鏡頭場景嘅時長佔比（Cam/登記鏡頭輸出隨時間變化）🟢≥0.50 🔴<0.20（紅線錨：負面對照片）', r.camCoverage, { greenIf: (v) => v >= 0.5, redIf: (v) => v < 0.2 }, 'gate', sceneSkipReason),
    gate('caption-budget-total', `distinct 可見字幕數 🟢≤DURATION/8 🔴>1.5×（冇出處，suggestion）`, r.distinctCaptions, { greenIf: (v) => v <= DURATION / 8, redIf: (v) => v > (DURATION / 8) * 1.5 }, 'suggestion'),
    gate('caption-budget-peak8s', '任何 8s 窗口新字幕數 🟢≤1 🔴>2（冇出處，suggestion）', r.peak8s, { greenIf: (v) => v <= 1, redIf: (v) => v > 2 }, 'suggestion'),
  ];
  if (IN) {
    g.push(
      gate('info-caption-spacing', `新畫面字最短間隔 🟢≥4s 🔴<2s ${TODO_UNCALIBRATED}`, r.distinctCaptions < 2 ? Infinity : r.minCapGap, { greenIf: (v) => v >= 4, redIf: (v) => v < 2 }, 'suggestion'),
      gate('info-caption-length', `最長一句畫面字 🟢≤20 🔴>32 字 ${TODO_UNCALIBRATED}`, r.maxCapLen, { greenIf: (v) => v <= 20, redIf: (v) => v > 32 }, 'suggestion')
    );
  }
  return g;
});
if (IN) {
  const narr = ['src/content/narration.ts', 'src/content/narration.tsx'].map((p) => path.join(root, p)).find((p) => existsSync(p));
  if (narr) {
    const nm = await importCode(bundleFile(narr));
    const raw = nm.NARRATION;
    const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((l) => (typeof l === 'string' ? l : l?.text ?? '')).join('') : null;
    if (text === null) fail(`${narr} 冇 export NARRATION（string 或 {text}[]）`);
    const cps = [...text].length / DURATION;
    for (const g of branchGates) g.push(gate('narration-budget', `旁白字/秒 🟢[3,4] 🔴<1.5或>5 ${TODO_UNCALIBRATED}`, cps, { greenIf: (v) => v >= 3 && v <= 4, redIf: (v) => v > 5 || v < 1.5 }, 'suggestion'));
  } else warn('info-narrative 但冇 src/content/narration.ts——旁白預算跳過（optional）。');
}
// N9: if anything enumerated/probed T during import or draw (Object.keys(T).forEach(k=>T[k]), {...T},
// for-in, `k in T`), every key looks "read" — usage records are unreliable, so this gate can
// never PASS: status UNRELIABLE, fails closed (exit 1). Fix: don't enumerate T in scene/draw code
// (e.g. a debug HUD should list keys from a separate constant, not from T).
const tUnreliable = tEnumerations.length > 0;
const beatKeysGate = { name: 'beat-keys-all-used', value: unusedBeatKeys.length, status: tUnreliable ? 'UNRELIABLE' : unusedBeatKeys.length ? 'FAIL' : 'PASS', failsRun: tUnreliable || unusedBeatKeys.length > 0 };
if (tUnreliable) {
  for (const g of globalGates) {
    if (g.band === 'skip') continue; // not enough beats to judge in the first place — enumeration
    // unreliability is orthogonal to "there is nothing to measure yet"; don't turn a correct SKIP
    // into a FAIL.
    g.unreliable = true;
    g.failsRun = true;
  }
  warn(`key 使用記錄唔可靠（偵測到列舉）：${tEnumerations.length} 次 T 列舉/探測，例：${tEnumerations.slice(0, 3).map((e) => `${e.phase} ${e.trap} @ ${e.text}`).join(' | ')}——beat-keys-all-used = UNRELIABLE（唔可以 PASS），beat 間距亦唔可信。`);
}

// ------------------------------------------------------------------------------------ report
function label(g) {
  if (g.band === 'skip') return 'SKIP';
  if (g.unreliable) return `UNRELIABLE(was ${g.band})`;
  if (g.band === 'green') return 'PASS';
  if (g.band === 'yellow') return 'WARN(yellow)';
  return g.severity === 'suggestion' ? 'WARN(red,suggestion)' : 'FAIL(red)';
}
// SKIP gates print "n/a" instead of the underlying NaN — the NaN is real (0/0, or fewer than 2
// data points) but printing it bare reads as a broken measurement rather than "not enough material
// yet", which is the whole point of this fix (docs/design/preproduction.md §5 — 場景數 <2 SKIP).
function gateLine(g) {
  const val = g.band === 'skip' ? 'n/a' : fmt(g.value);
  const reason = g.skipReason ? `  SKIP 原因: ${g.skipReason}` : '';
  return `  [${label(g)}] ${g.name} — ${g.desc} — value=${val}${reason}`;
}
console.log(`${TAG}: ${root}`);
console.log(`DURATION=${DURATION}s  canvas=${CW}x${CH}  T keys=${Object.keys(T).length}  onsets raw=${onsetsRaw.length} merged(≤${ONSET_MERGE}s)=${onsets.length}`);
console.log(`beat spacing (draw-read keys only, ${onsetsRaw.length}/${Object.keys(T).length}): avg=${notEnoughBeats ? 'n/a' : fmt(avgGap)}s  max-gap=${notEnoughBeats ? 'n/a' : fmt(maxGap)}s${tUnreliable ? '  [UNRELIABLE: T enumerated]' : ''}`);
console.log(`beat-keys-all-used: ${beatKeysGate.status} (${keyUsage.filter((u) => u.how === 'draw').length} read in draw, ${keyUsage.filter((u) => u.used && u.how !== 'draw').length} import-time live [${keyUsage.filter((u) => u.used && u.how !== 'draw').map((u) => `${u.key}: ${u.how}`).join('; ')}], ${unusedBeatKeys.length} unused)`);
for (const u of unusedBeatKeys.slice(0, 40)) console.log(`    ✗ T.${u.key} — ${u.how}`);
if (unusedBeatKeys.length > 40) console.log(`    …再 ${unusedBeatKeys.length - 40} 個`);
for (const g of globalGates) console.log(gateLine(g));
if (regWarnings.length) for (const w of [...new Set(regWarnings)]) warn(w);
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  console.log(`\n--- branch: ${r.b.name} ---`);
  for (const e of r.errors) console.log(`  ! ${e.id}: ${e.error}`);
  for (const s of r.ok) {
    const cam = sceneCamera.get(s.id);
    const st = sceneStats.get(s.id);
    const ex = r.excluded.find((x) => x.s === s);
    const camTxt = cam.credits.length ? cam.credits.map((c) => `${c.fn}[${c.kind}] ${c.varies ? '✓' : '✗'} ${c.detail}`).join('; ') : '—';
    console.log(
      `  - ${s.id}: ${s.start.toFixed(2)}–${s.end.toFixed(2)} = ${s.length.toFixed(2)}s${s.clamped ? ` (clamped from ${s.rawStart}–${s.rawEnd})` : ''}` +
        `  visible ${st.visibleSamples}/${st.samples}  camera=${cam.hasCamera ? 'YES' : 'no'} [${camTxt}]${ex ? `  EXCLUDED: ${ex.why}` : ''}`
    );
    if (cam.unregistered) warn(`未登記鏡頭？${s.id}: ${cam.unregistered}——如果係鏡頭，經 applyCam 或登記 camera-registry.ts；如果係物件動畫，忽略。唔計入 camera-coverage。`);
  }
  if (r.excluded.length) console.log(`  excluded from ratios (${r.excluded.length}): ${r.excluded.map((x) => `${x.s.id}=${x.why}`).join(', ')}`);
  const tooFewScenes = r.eligible.length < 2;
  console.log(
    `  eligible ${r.eligible.length} scene(s), ${fmt(r.sumL)}s total; length CV(weighted)=${tooFewScenes ? 'n/a' : fmt(r.lenCV)}; camera ${fmt(r.camLen)}s/${fmt(r.sumL)}s = ${tooFewScenes ? 'n/a' : fmt(r.camCoverage)}${tooFewScenes ? '  (SKIP: 合資格場景 <2)' : ''}`
  );
  console.log(`  captions: ${r.distinctCaptions} distinct visible fillText string(s), peak-in-8s=${r.peak8s}${IN ? `, min gap=${r.distinctCaptions < 2 ? 'n/a(<2 captions)' : fmt(r.minCapGap)}s, max len=${r.maxCapLen}` : ''}`);
  for (const g of branchGates[i]) console.log(gateLine(g));
}
const anyFail = beatKeysGate.failsRun || globalGates.some((g) => g.failsRun) || branchGates.some((gs) => gs.some((g) => g.failsRun));
console.log('');
console.log(`${TAG}: ${anyFail ? 'FAIL' : 'PASS'}${CALIBRATE ? '  ===== UNCALIBRATED-RUN (not P5 evidence) =====' : ''}`);
process.exit(anyFail ? 1 : 0);

function fmt(n) {
  return typeof n === 'number' ? (Number.isFinite(n) ? n.toFixed(3) : String(n)) : String(n);
}
