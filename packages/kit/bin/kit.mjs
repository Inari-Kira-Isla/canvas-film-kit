#!/usr/bin/env node
// kit.mjs — canvas-film-kit's single CLI entry point.
// Usage: kit <new|doctor|gate|export|stills|determinism|boundary-diff|fonts> [args...]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES as PROFILES_HELP } from '../scaffold/new-film.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)); // .../packages/kit/bin
const PKG_DIR = path.resolve(here, '..');

const [sub, ...rest] = process.argv.slice(2);

function run(scriptRelPath, args) {
  const r = spawnSync('node', [path.join(PKG_DIR, scriptRelPath), ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

switch (sub) {
  case 'new': {
    const { scaffold, PROFILES, ScaffoldError } = await import(path.join(PKG_DIR, 'scaffold', 'new-film.mjs'));
    let target;
    let profile;
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--profile') profile = rest[++i];
      else if (a.startsWith('--profile=')) profile = a.slice('--profile='.length);
      else if (a.startsWith('--')) {
        console.error(`kit new: unknown flag ${a}`);
        process.exit(1);
      } else if (!target) target = a;
      else {
        console.error(`kit new: unexpected extra argument: ${a}`);
        process.exit(1);
      }
    }
    if (!target) {
      console.error(`kit new: needs a <dir> argument. Usage: kit new <dir> --profile <${PROFILES.join('|')}>`);
      process.exit(1);
    }
    if (!profile) {
      console.error(`kit new: needs --profile. Available: ${PROFILES.join(', ')}`);
      process.exit(1);
    }
    try {
      const result = scaffold({ target, profile });
      console.log(`kit new: scaffolded ${result.target} (profile=${result.profile}, driver=${result.axes.driver}, facts=${result.axes.facts}, rubric=${result.axes.rubric})`);
      console.log(`kit new: ${result.gitMessage}`);
      console.log('\nnext steps:');
      console.log(`  cd ${path.relative(process.cwd(), result.target) || '.'}`);
      console.log('  npm install');
      console.log('  fill in docs/preproduction.md, then add an approved_by: <name> <YYYY-MM-DD> line (the ONE manual step `kit gate` requires — see docs/preproduction.md\'s own comment)');
      console.log('  edit src/core/timeline.ts (fill T) and src/core/color.ts (fill P, or point it at ../theme.ts) for your real film — the scaffold already ships working example values so `gate`/`export` run before you touch either file');
      console.log('  npm run dev   # then, in another terminal: npm run gate / npm run export');
    } catch (e) {
      console.error(`kit new: ${e.message}`);
      process.exit(e instanceof ScaffoldError ? e.code : 2);
    }
    break;
  }
  case 'doctor':
    run('scripts/doctor.mjs', rest);
    break;
  case 'gate':
    run('gates/gate.mjs', rest);
    break;
  case 'export':
    run('scripts/export-mp4.mjs', rest);
    break;
  case 'stills':
    run('scripts/stills.mjs', rest);
    break;
  case 'determinism':
    run('scripts/determinism.mjs', rest);
    break;
  case 'boundary-diff':
    run('scripts/boundary-diff.mjs', rest);
    break;
  case 'fonts':
    run('scripts/fonts.mjs', rest);
    break;
  case 'beats':
    run('audio/beats.mjs', rest);
    break;
  case 'make-demo-track':
    run('audio/make-demo-track.mjs', rest);
    break;
  case 'tts': {
    const [ttsSub, ...ttsRest] = rest;
    if (ttsSub === 'build') run('tts/build.mjs', ttsRest);
    else {
      console.error(`kit tts: unknown or missing subcommand${ttsSub ? ` "${ttsSub}"` : ''} — only "build" exists in this release (whisper-based "align" is a future candidate, not shipped — see design doc §10).`);
      process.exit(1);
    }
    break;
  }
  case 'timeline':
    run('narration/build-timeline.mjs', rest);
    break;
  case 'build-mix':
    run('narration/build-mix.mjs', rest);
    break;
  case 'speech-rate':
    run('narration/speech-rate.mjs', rest);
    break;
  case 'onset-check':
    run('narration/onset-check.mjs', rest);
    break;
  case 'measure-onset':
    run('narration/measure-onset.mjs', rest);
    break;
  default:
    console.error(
      [
        'kit: unknown or missing subcommand' + (sub ? ` "${sub}"` : ''),
        '',
        'Usage: kit <subcommand> [args...]',
        `  new <dir> --profile <${PROFILES_HELP.join('|')}>   scaffold a new film project`,
        '  doctor                           check Node/ffmpeg/browser/GPU/fonts',
        '  gate [--url <url>] [--no-server-checks]   run every mechanical pre-export check',
        '  export [url] [out.mp4] [dur] [fps] [--audio <path>] [--skip-gate "<reason>"]   run gate then render an MP4',
        '  stills [url] [outDir] [t1,t2,...] [fps]   render specific timestamps to PNG',
        '  determinism [url] [outJson]      seek-order independence check',
        '  boundary-diff [url] [outJson]    per-transition pixel diff check',
        '  fonts [--lock]                   download + sha256-lock the OFL fonts this kit uses',
        '  beats <audio> [outJson] [--bpm N --offset N]   detect (or manually set) a beat grid, writes beats.json',
        '  make-demo-track [outDir] [--bpm N] [--duration S]   synthesize a CC0 click/hat WAV with a known beat grid',
        '  tts build <root> --script <path> --provider <none|edge|minimax|openai|system> [--voice v] [--lang zh|en] [--rate 1.0]   synthesize narration, write audio/vo manifests + refresh timeline.json',
        '  timeline [root] [--manifest <path>]   build src/content/timeline.json from cards.json + pauses.json (+ audio/vo/manifest.json when present)',
        '  speech-rate [root]               check docs/preproduction.md declared speech_rate_cps against the real audio/vo manifest',
        '  onset-check [root] [--noise-db -40] [--json <path>]   independently re-measure every caption\'s acoustic onset accuracy',
        '  measure-onset <audio> [--noise-db -40] [--json <path>]   report an audio file\'s real leading-silence-to-voice onset',
      ].join('\n'),
    );
    process.exit(sub ? 1 : 0);
}
