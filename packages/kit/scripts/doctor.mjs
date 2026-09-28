#!/usr/bin/env node
// doctor.mjs — diagnostic-only environment check. Never blocks: `kit doctor` always exits 0 (it is
// meant to be read by a human before they run `kit gate`, which IS the hard gate). Writes
// qa/doctor.json (machine-readable, one row per check: PASS/WARN/FAIL + detail).
//
// `--fix` only PRINTS platform-specific install instructions — it never runs an installer itself
// (canvas-film-kit never touches the system outside the project directory without being asked).
//
// Usage: node doctor.mjs [--fix] [--url <url>]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { gpuArgs } from '../render/gpu-flags.mjs';
import { launchBrowser, framePng, FILM_URL as DEFAULT_FILM_URL } from '../render/browser.mjs';

const argv = process.argv.slice(2);
const fix = argv.includes('--fix');
let urlArg;
{
  const i = argv.indexOf('--url');
  if (i !== -1) urlArg = argv[i + 1];
}
const FILM_URL = urlArg ?? DEFAULT_FILM_URL;
const root = process.cwd();

const rows = [];
function report(name, status, detail) {
  rows.push({ name, status, detail });
  const icon = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : status === 'SKIP' ? 'SKIP' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function tryRun(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8' }) };
  } catch (e) {
    return { ok: false, out: e.stdout ?? '', err: e.message };
  }
}

console.log('canvas-film-kit doctor\n');

// ---- 1. Node / npm ----
{
  const [major, minor] = process.versions.node.split('.').map(Number);
  const ok = major > 22 || (major === 22 && minor >= 12);
  report('node-version', ok ? 'PASS' : 'FAIL', `${process.version} (need >=22.12.0)`);
  const npm = tryRun('npm', ['--version']);
  report('npm-available', npm.ok ? 'PASS' : 'FAIL', npm.ok ? npm.out.trim() : npm.err);
}

// ---- 2. ffmpeg / ffprobe ----
{
  const ff = tryRun('ffmpeg', ['-version']);
  if (!ff.ok) {
    report('ffmpeg', 'FAIL', 'not found on PATH' + (fix ? ' — install: macOS `brew install ffmpeg`, Windows `winget install Gyan.FFmpeg`, Linux `apt install ffmpeg` (or your distro equivalent)' : ''));
  } else {
    const versionLine = ff.out.split('\n')[0];
    const enc = tryRun('ffmpeg', ['-hide_banner', '-encoders']);
    const hasX264 = enc.ok && /libx264/.test(enc.out);
    report('ffmpeg', hasX264 ? 'PASS' : 'FAIL', `${versionLine}${hasX264 ? '' : ' — libx264 encoder missing (needed for MP4 export)'}`);
  }
  const ffprobe = tryRun('ffprobe', ['-version']);
  report('ffprobe', ffprobe.ok ? 'PASS' : 'FAIL', ffprobe.ok ? ffprobe.out.split('\n')[0] : 'not found on PATH');
}

// ---- 3+4+5. browser launch / GPU renderer / determinism smoke test ----
let renderer = 'unknown';
let usedChannel = 'unknown';
{
  try {
    const { browser, usedChannel: ch } = await launchBrowser();
    usedChannel = ch;
    const page = await browser.newPage();
    renderer = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl');
      const d = c && c.getExtension('WEBGL_debug_renderer_info');
      return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    await browser.close();
    report('browser-launch', 'PASS', `launched via ${usedChannel === 'chrome' ? 'system Chrome' : 'Playwright bundled Chromium'} (platform=${process.platform}, gpu-flags=${gpuArgs().join(' ')})`);
    if (/swiftshader|llvmpipe|software/i.test(renderer)) {
      report('gpu-renderer', 'WARN', `software renderer ("${renderer}") — rendering will be correct but slow; consider \`kit export --scale 0.5\` for previews`);
    } else {
      report('gpu-renderer', 'PASS', renderer);
    }
  } catch (e) {
    report('browser-launch', 'FAIL', `${e.message.split('\n')[0]}${fix ? ' — run `npx playwright install chromium`, or install/update system Chrome' : ''}`);
    report('gpu-renderer', 'SKIP', 'browser did not launch');
  }
}
{
  try {
    const probe = await fetch(new URL(FILM_URL).origin, { signal: AbortSignal.timeout(1500) });
    void probe;
    const { browser } = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(FILM_URL);
    await page.waitForFunction(() => '__renderAt' in window, null, { timeout: 5000 });
    const h1 = createHash('sha256').update(await framePng(page, 1.234)).digest('hex');
    const h2 = createHash('sha256').update(await framePng(page, 1.234)).digest('hex');
    await browser.close();
    report('determinism-smoke', h1 === h2 ? 'PASS' : 'FAIL', h1 === h2 ? 'same page, t=1.234s rendered twice, identical SHA-256' : `hash mismatch: ${h1.slice(0, 12)} vs ${h2.slice(0, 12)}`);
  } catch {
    report('determinism-smoke', 'SKIP', `${FILM_URL} not reachable — run \`npm run dev\` in another terminal first (this is informational; \`kit gate\`'s determinism step is the real, full-duration check and DOES fail without a server)`);
  }
}

// ---- 6. fonts ----
{
  const lockPath = path.join(root, 'fonts.lock.json');
  if (!existsSync(lockPath)) {
    report('fonts', 'SKIP', 'fonts.lock.json not found — run `kit fonts` to download + hash-lock the OFL fonts this kit uses (optional in the abstract profile)');
  } else {
    let lock;
    try {
      lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    } catch (e) {
      report('fonts', 'FAIL', `fonts.lock.json is not valid JSON: ${e.message}`);
      lock = null;
    }
    if (lock) {
      let allOk = true;
      const details = [];
      for (const [file, expected] of Object.entries(lock.files ?? {})) {
        const p = path.join(root, 'public', 'fonts', file);
        if (!existsSync(p)) {
          allOk = false;
          details.push(`${file}: missing`);
          continue;
        }
        const actual = createHash('sha256').update(readFileSync(p)).digest('hex');
        if (actual !== expected) {
          allOk = false;
          details.push(`${file}: sha256 mismatch`);
        }
      }
      report('fonts', allOk ? 'PASS' : 'FAIL', allOk ? `${Object.keys(lock.files ?? {}).length} font file(s) present and sha256-verified` : details.join('; '));
    }
  }
}

// ---- 7. TTS providers — report which env var NAMES each provider needs and whether each is set.
// Never the value (design doc §2.5 item 7 "只報「有／冇」，永不印值") — this loop only ever reads
// process.env[name] to test truthiness, the value itself is never interpolated into any string. ----
{
  const { PROVIDER_IDS, loadProvider } = await import(new URL('../tts/provider.mjs', import.meta.url));
  const rows = [];
  for (const id of PROVIDER_IDS) {
    try {
      const p = await loadProvider(id);
      const envStatus = p.requiredEnv.map((name) => `${name}=${process.env[name] ? 'set' : 'MISSING'}`);
      rows.push(`${id}: ${p.requiredEnv.length ? envStatus.join(', ') : '(no credential needed)'}`);
    } catch (e) {
      rows.push(`${id}: could not load (${e.message.split('\n')[0]})`);
    }
  }
  report('tts-providers', 'PASS', rows.join(' | '));
}

// ---- 8. disk space / writable / git ----
{
  const df = tryRun('df', ['-k', root]);
  if (df.ok) {
    const lines = df.out.trim().split('\n');
    const cols = lines[lines.length - 1].trim().split(/\s+/);
    // `df -k` column layout differs slightly across platforms; available space is reliably the
    // column right before the capacity-percentage column on both macOS and Linux.
    const pctIdx = cols.findIndex((c) => /%$/.test(c));
    const availKb = pctIdx > 0 ? Number(cols[pctIdx - 1]) : NaN;
    const availGb = availKb / (1024 * 1024);
    report('disk-space', Number.isFinite(availGb) && availGb >= 2 ? 'PASS' : 'WARN', Number.isFinite(availGb) ? `${availGb.toFixed(1)}GB free (need ~2GB for PNG-pipe/scratch during export)` : `could not parse \`df\` output: ${lines[lines.length - 1]}`);
  } else {
    report('disk-space', 'WARN', 'could not run `df` to check free space');
  }
  try {
    const probe = path.join(root, '.kit-doctor-write-probe');
    writeFileSync(probe, 'x');
    statSync(probe);
    rmSync(probe);
    report('directory-writable', 'PASS', root);
  } catch (e) {
    report('directory-writable', 'FAIL', e.message);
  }
  const git = tryRun('git', ['--version']);
  report('git', git.ok ? 'PASS' : 'FAIL', git.ok ? git.out.trim() : 'not found on PATH');
}

mkdirSync(path.join(root, 'qa'), { recursive: true });
writeFileSync(path.join(root, 'qa/doctor.json'), JSON.stringify({ generated: new Date().toISOString(), platform: process.platform, nodeVersion: process.version, renderer, usedChannel, rows }, null, 2));
console.log(`\nwritten qa/doctor.json — ${rows.filter((r) => r.status === 'PASS').length} PASS, ${rows.filter((r) => r.status === 'WARN').length} WARN, ${rows.filter((r) => r.status === 'SKIP').length} SKIP, ${rows.filter((r) => r.status === 'FAIL').length} FAIL`);
console.log('(doctor is diagnostic-only and always exits 0 — `kit gate` is the real pass/fail gate)');
process.exit(0);
