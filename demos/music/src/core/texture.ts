import { W, H, clamp } from './math';
import { noise3, rng } from './random';
import { rgba, type RGB } from './color';

let paper: HTMLCanvasElement | null = null;
let grain: HTMLCanvasElement[] = [];

/** Procedural paper: low-frequency luminance drift + fibres + tooth, centred on mid-grey for 'overlay' blending. */
function makePaper(): HTMLCanvasElement {
  const w = W / 2, h = H / 2; // generated at half-res, upscaled: fibre softness for free
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const r = rng(1234);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const low = noise3(x * 0.006, y * 0.006, 0.5, 3) * 10 + noise3(x * 0.03, y * 0.03, 1.5, 4) * 5;
      const tooth = (r() - 0.5) * 22;
      const v = clamp(128 + low + tooth, 0, 255);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // fibres
  for (let i = 0; i < 900; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 4 + r() * 16;
    g.strokeStyle = r() < 0.5 ? 'rgba(90,90,90,0.18)' : 'rgba(170,170,170,0.18)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

function makeGrain(seed: number): HTMLCanvasElement {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  const r = rng(seed);
  for (let i = 0; i < s * s; i++) {
    const v = 128 + (r() - 0.5) * 90;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function initTextures(): void {
  paper = makePaper();
  grain = [0, 1, 2, 3].map((i) => makeGrain(77 + i));
}

/** Final pass: vignette, paper tooth and animated grain. `light` is 1 on paper/cream scenes, 0 in a dark section. */
export function drawFinish(ctx: CanvasRenderingContext2D, t: number, light: number, tint: RGB): void {
  ctx.save();
  // Vignette — warm and faint on paper, deeper in the dark.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  const dark: RGB = light > 0.5 ? [120, 80, 40] : [0, 0, 6];
  vg.addColorStop(0, rgba(dark, 0));
  vg.addColorStop(1, rgba(dark, 0.18 + (1 - light) * 0.32));
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  if (paper) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.28 + light * 0.3;
    ctx.drawImage(paper, 0, 0, W, H);
  }
  if (grain.length) {
    const f = Math.floor(t * 12);
    const tile = grain[f % grain.length];
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.1 + (1 - light) * 0.06;
      ctx.translate(((f * 37) % 256) - 256, ((f * 91) % 256) - 256);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W + 512, H + 512);
    }
  }
  ctx.restore();
  // A barely-there colour wash keeps every scene in one printed world.
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = rgba(tint, 0.12);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
