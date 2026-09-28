// theme.ts — FILL IN is optional here (the 3 presets below are usable as-is): this is the ONE
// upstream entry for every hex literal / stroke width / grain amount / type family in the whole
// film (design doc §5.2). `kit new` already renames `src/core/color.template.ts` to `color.ts` at
// scaffold time (see scaffold/new-film.mjs) — that file can re-export `THEME.palette` as `P`, or a
// scene/component can just `import { THEME } from '../theme'` directly, so the rest of the codebase
// never imports two different palette sources.
//
// Every scene/component reads THEME (or `P` re-exported from it) — never a literal hex string.
// grep gate: `#[0-9A-Fa-f]{6}` must be 0 in src/scenes (and, per the design doc §6 rollup, later
// batches extend that scan to src/components — this file itself lives outside both directories on
// purpose, since it IS the one place hex is allowed to live).
import { hex, type RGB } from './core/color';

export interface ThemePalette {
  bg: RGB; // base background tone
  bg2: RGB; // secondary background (gradients / dark sections)
  ink: RGB; // line / silhouette colour
  paper: RGB; // light fill tone (paper/card backgrounds, captions on dark)
  accent: RGB; // one accent used for a recurring motif
  signal: RGB; // "something is happening now" colour (beat flash, on-word caption highlight)
  muted: RGB; // de-emphasised text / inactive state
}

export interface ThemeStroke {
  base: number; // default line width in px at 1920x1080
  scale: number[]; // relative widths a scene can pick from (hairline/normal/bold/heavy)
  cap: CanvasLineCap;
  join: CanvasLineJoin;
}

export interface ThemeWobble {
  amp: number; // default hand-drawn wobble amplitude in px — see core/draw.ts `wobble()`
  freq: number; // default wobble spatial frequency — see core/draw.ts `wobble()`
  boilFps: number; // how many times/sec a "held" outline re-draws itself — see core/draw.ts `boil()`
  seed: number; // default seed a scene can start from (add an offset per shape so lines don't sync)
}

export interface ThemeType {
  display: string; // headline / large numerals (Latin)
  body: string; // body copy (Latin)
  mono: string; // code/coordinates/timestamps
  cjkDisplay: string; // headline (CJK) — pair with `display`
  cjkBody: string; // body copy (CJK) — pair with `body`
}

export interface Theme {
  palette: ThemePalette;
  stroke: ThemeStroke;
  wobble: ThemeWobble;
  grain: { alpha: number };
  vignette: { strength: number };
  type: ThemeType;
  // Named easing curves a project can standardise on so every scene's "feel" matches — these are
  // NOT the full `ease` table (see core/math.ts), just the three every project ends up picking one
  // of for "the" entrance/exit/hold curve. Pass the *name*, then look it up in core/math.ts's
  // `ease` object at the call site (`ease[THEME.motion.easeOut]`) — kept as a string here rather
  // than a function reference so THEME stays a plain, JSON-serialisable-shaped object.
  motion: { easeIn: string; easeOut: string; easeInOut: string };
}

// ---------------------------------------------------------------------------------- ink-night
// Deep, cool dark ground with a warm ink line and one warm accent — a night/cosmos/water register.
// Same *quality* as the reference project this kit's line-art technique was distilled from (deep
// ground, ivory line, one warm accent, one cool signal), new hex values (not the source palette).
const inkNight: Theme = {
  palette: {
    bg: hex('#111826'),
    bg2: hex('#0A0F1A'),
    ink: hex('#EDE6D6'),
    paper: hex('#F4EFE3'),
    accent: hex('#D8663F'),
    signal: hex('#7FB7C9'),
    muted: hex('#5C6B82'),
  },
  stroke: { base: 3, scale: [0.5, 1, 2, 4], cap: 'round', join: 'round' },
  wobble: { amp: 1.6, freq: 0.9, boilFps: 8, seed: 1 },
  grain: { alpha: 0.045 },
  vignette: { strength: 0.55 },
  type: { display: 'Inter', body: 'Inter', mono: 'JetBrains Mono', cjkDisplay: 'Noto Serif TC', cjkBody: 'Noto Sans TC' },
  motion: { easeIn: 'inSine', easeOut: 'outCubic', easeInOut: 'inOutSine' },
};

// ---------------------------------------------------------------------------------- paper-day
// Warm off-white "paper" with dark ink and one bright accent — the default for teaching/explainer
// work where legibility matters more than mood.
const paperDay: Theme = {
  palette: {
    bg: hex('#F4EEDF'),
    bg2: hex('#EAE1CC'),
    ink: hex('#2B2118'),
    paper: hex('#FBF7EC'),
    accent: hex('#B4502B'),
    signal: hex('#2E7D6B'),
    muted: hex('#8A7F6C'),
  },
  stroke: { base: 3, scale: [0.5, 1, 2, 4], cap: 'round', join: 'round' },
  wobble: { amp: 1.3, freq: 0.9, boilFps: 8, seed: 1 },
  grain: { alpha: 0.03 },
  vignette: { strength: 0.3 },
  type: { display: 'Inter', body: 'Inter', mono: 'JetBrains Mono', cjkDisplay: 'Noto Serif TC', cjkBody: 'Noto Sans TC' },
  motion: { easeIn: 'inSine', easeOut: 'outCubic', easeInOut: 'inOutSine' },
};

// ---------------------------------------------------------------------------------- chalkboard
// Near-black board with chalky off-white line and one accent — a classroom register, higher
// contrast than ink-night (chalk needs to read from the back row).
const chalkboard: Theme = {
  palette: {
    bg: hex('#1B2420'),
    bg2: hex('#121915'),
    ink: hex('#E9EFE6'),
    paper: hex('#EFF4EA'),
    accent: hex('#E3B23C'),
    signal: hex('#C96B4F'),
    muted: hex('#6E7C71'),
  },
  stroke: { base: 4, scale: [0.5, 1, 2, 4], cap: 'round', join: 'round' },
  wobble: { amp: 2.1, freq: 0.8, boilFps: 6, seed: 1 },
  grain: { alpha: 0.06 },
  vignette: { strength: 0.4 },
  type: { display: 'Inter', body: 'Inter', mono: 'JetBrains Mono', cjkDisplay: 'Noto Serif TC', cjkBody: 'Noto Sans TC' },
  motion: { easeIn: 'inSine', easeOut: 'outCubic', easeInOut: 'inOutSine' },
};

export const PRESETS = { 'ink-night': inkNight, 'paper-day': paperDay, chalkboard } as const satisfies Record<string, Theme>;
export type PresetName = keyof typeof PRESETS;

// paper-day: the design doc's own default for teaching/explainer work, where legibility matters
// more than mood.
export const THEME: Theme = PRESETS['paper-day'];
