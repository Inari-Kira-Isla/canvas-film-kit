#!/usr/bin/env node
// gates/font-size-check.mjs — K6: on-screen caption legibility floor, measured against a real
// rendered still rather than a source-code font-size number (a canvas caption's ON-SCREEN ink height
// depends on font family, weight, and the browser's own rasterizer — the number in a `ctx.font =
// '68px ...'` call is not proof of what actually painted to the canvas).
//
// The floor is expressed as a FRACTION of frame width (a commonly-cited mobile captioning legibility
// rule of thumb is roughly 68px of ink height on a 1920-wide frame, i.e. ~3.5% of frame width,
// equivalently ~12.75px measured on a 360px-wide thumbnail-scale render) — scale-agnostic to whatever
// native canvas width a project actually uses. Adjust `--min-zh-px-at-1920` for your own type scale;
// the default is a starting point, not a universal constant.
//
// Method: given a full-resolution still PNG (from scripts/stills.mjs) and the region on screen where
// a caption's ink is expected (screen px, in the STILL's own native resolution — e.g. the plate rect
// a caption component actually painted into), this script:
//   1. crops that region,
//   2. scales the CROP down proportionally so the STILL'S FULL WIDTH would be 360px (scale factor =
//      360 / originalWidth, applied to the crop too — the whole FRAME is 360 wide, not the crop),
//   3. scans the scaled crop for "ink" pixels (bright-on-dark or dark-on-light, see --mode) and finds
//      the TALLEST CONTIGUOUS BAND of ink-bearing rows in the SCALED image,
//   4. compares that band height against the floor.
// No canvas/image npm dependency — crop + scale + raw pixel extraction all go through ffmpeg
// (rawvideo rgba to stdout), the same tool `gates/audio-diag.mjs` already shells out to.
//
// Why "tallest contiguous band" and not "topmost-to-bottommost ink row": a region that contains TWO
// separate lines of text (e.g. a zh line + an en line stacked in one caption plate, or two rows of a
// step-badge list) with a blank gap between them would, if measured end-to-end, silently count the
// blank gap as part of "one glyph's height" — a two-line region where each line is individually too
// small could still measure taller than the floor and false-PASS. A single line of real text has no
// fully-blank row inside its own glyph height (every row has ink somewhere across the line's width),
// so scanning for the tallest contiguous ink band is unchanged for the single-line case and correctly
// treats each line as its own band once two lines are separated by >=1 fully-blank row (see this
// gate's own `bad_twoline` fixture).
//
// Usage:
//   node font-size-check.mjs <stillPng> --region x,y,w,h [--original-width 1920]
//                             [--min-zh-px-at-1920 68] [--mode bright-on-dark|dark-on-light]
//                             [--luma-threshold 128] [--json out.json]
//   --region is REQUIRED and is in the still PNG's OWN native pixel coordinates (not 360-scaled) —
//   pass the same rect the caption component actually painted into, so this never measures unrelated
//   bright pixels elsewhere in the frame.
// Exit: 0 = ink height at 360-scale >= floor, 1 = below floor (or region has zero ink pixels — that
// is a hollow-PASS risk, so a totally empty crop FAILs loud, never silently reports 0 and exits 0),
// 2 = bad args / ffmpeg failure.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
function optNum(flag, def) {
  const i = argv.indexOf(flag);
  return i === -1 ? def : Number(argv[i + 1]);
}
function optStr(flag, def) {
  const i = argv.indexOf(flag);
  return i === -1 ? def : argv[i + 1];
}
const pngPath = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
if (!pngPath) {
  console.error('font-size-check: needs <stillPng> as the first argument');
  process.exit(2);
}
if (!existsSync(pngPath)) {
  console.error(`font-size-check: not found: ${pngPath}`);
  process.exit(2);
}
const regionStr = optStr('--region', undefined);
if (!regionStr) {
  console.error('font-size-check: needs --region x,y,w,h (in stillPng\'s own native resolution)');
  process.exit(2);
}
const [rx, ry, rw, rh] = regionStr.split(',').map(Number);
if (![rx, ry, rw, rh].every((n) => Number.isFinite(n) && n >= 0) || rw <= 0 || rh <= 0) {
  console.error(`font-size-check: --region "${regionStr}" is malformed (need x,y,w,h — four non-negative numbers, w/h>0)`);
  process.exit(2);
}
const ORIGINAL_WIDTH = optNum('--original-width', 1920);
const MIN_ZH_PX_AT_1920 = optNum('--min-zh-px-at-1920', 68); // see header for where this default comes from
const MODE = optStr('--mode', 'bright-on-dark');
if (!['bright-on-dark', 'dark-on-light'].includes(MODE)) {
  console.error(`font-size-check: --mode must be bright-on-dark|dark-on-light, got ${MODE}`);
  process.exit(2);
}
const LUMA_THRESHOLD = optNum('--luma-threshold', 128);
let jsonOut;
{
  const i = argv.indexOf('--json');
  if (i !== -1) jsonOut = argv[i + 1];
}

const SCALE = 360 / ORIGINAL_WIDTH;
const MIN_HEIGHT_AT_360 = MIN_ZH_PX_AT_1920 * (360 / 1920);

// ---- crop then scale in one ffmpeg pass, output raw RGBA to stdout ----
const cropW = Math.max(1, Math.round(rw * SCALE));
const cropH = Math.max(1, Math.round(rh * SCALE));
const filter = `crop=${rw}:${rh}:${rx}:${ry},scale=${cropW}:${cropH}`;
const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', pngPath, '-vf', filter, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {
  encoding: 'buffer',
  maxBuffer: 256 * 1024 * 1024,
});
if (r.status !== 0 || !r.stdout || r.stdout.length === 0) {
  console.error(`font-size-check: ffmpeg crop+scale failed (exit ${r.status})`);
  console.error((r.stderr ?? Buffer.alloc(0)).toString('utf8').slice(-2000));
  process.exit(2);
}
const buf = r.stdout;
const expected = cropW * cropH * 4;
if (buf.length !== expected) {
  console.error(`font-size-check: read ${buf.length} bytes, expected ${expected} (${cropW}x${cropH}x4) — ffmpeg output shape is wrong`);
  process.exit(2);
}

function isInk(r8, g8, b8) {
  const luma = (r8 + g8 + b8) / 3;
  return MODE === 'bright-on-dark' ? luma >= LUMA_THRESHOLD : luma <= LUMA_THRESHOLD;
}

// See this file's header for why "tallest contiguous band" replaces a naive top..bottom span.
const rowHasInk = new Array(cropH).fill(false);
let inkPixelCount = 0;
for (let y = 0; y < cropH; y++) {
  for (let x = 0; x < cropW; x++) {
    const o = (y * cropW + x) * 4;
    if (isInk(buf[o], buf[o + 1], buf[o + 2])) {
      rowHasInk[y] = true;
      inkPixelCount++;
    }
  }
}

const bands = [];
{
  let bandStart = -1;
  for (let y = 0; y < cropH; y++) {
    if (rowHasInk[y]) {
      if (bandStart === -1) bandStart = y;
    } else if (bandStart !== -1) {
      bands.push([bandStart, y - 1]);
      bandStart = -1;
    }
  }
  if (bandStart !== -1) bands.push([bandStart, cropH - 1]);
}

if (bands.length === 0) {
  console.error(
    `font-size-check: FAIL — --region ${regionStr} has zero ink pixels under --mode ${MODE} (luma threshold ${LUMA_THRESHOLD}). ` +
      `This is never treated as "couldn't measure = PASS" (hollow-PASS trap) — either the region is wrong, or there really is no text there right now.`,
  );
  const summary0 = { still: path.relative(process.cwd(), pngPath), region: { x: rx, y: ry, w: rw, h: rh }, mode: MODE, verdict: 'FAIL', reason: 'no ink pixels found in region' };
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary0, null, 2) + '\n');
  process.exit(1);
}

let [topRow, bottomRow] = bands[0];
for (const [s, e] of bands) if (e - s > bottomRow - topRow) { topRow = s; bottomRow = e; }
const heightAt360 = bottomRow - topRow + 1;
const pass = heightAt360 >= MIN_HEIGHT_AT_360;

console.log(`font-size-check: ${path.relative(process.cwd(), pngPath)} region=${regionStr} original_width=${ORIGINAL_WIDTH}`);
console.log(`  ink pixel count: ${inkPixelCount} / ${cropW * cropH}`);
console.log(`  ink bands (contiguous ink-bearing rows) @360px-wide-frame scale: ${bands.length} band(s) — ${bands.map(([s, e]) => `${e - s + 1}px(${s}..${e})`).join(', ')}`);
console.log(`  tallest band: ${heightAt360}px (rows ${topRow}..${bottomRow} of scaled crop)`);
console.log(`  floor: ${MIN_HEIGHT_AT_360.toFixed(2)}px (= ${MIN_ZH_PX_AT_1920}px @1920 wide) -> ${pass ? 'PASS' : 'FAIL'}`);

const summary = {
  still: path.relative(process.cwd(), pngPath),
  region: { x: rx, y: ry, w: rw, h: rh },
  original_width: ORIGINAL_WIDTH,
  mode: MODE,
  luma_threshold: LUMA_THRESHOLD,
  ink_pixel_count: inkPixelCount,
  bands: bands.map(([s, e]) => ({ start: s, end: e, height_px: e - s + 1 })),
  height_at_360_px: heightAt360,
  floor_px: +MIN_HEIGHT_AT_360.toFixed(3),
  min_zh_px_at_1920: MIN_ZH_PX_AT_1920,
  verdict: pass ? 'PASS' : 'FAIL',
};
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + '\n');
  console.log(`wrote ${jsonOut}`);
}
process.exit(pass ? 0 : 1);
