// fft.mjs — minimal iterative radix-2 Cooley-Tukey FFT, pure JS, zero dependencies (design doc
// §2.2: canvas-film-kit's audio pipeline avoids essentia.js on purpose — it is AGPL — so beat
// detection needs its own small DFT implementation rather than pulling in a native/AGPL FFT lib).
//
// `fftSize` must be a power of two. Operates in place on two Float64Arrays (real/imag) of length
// `fftSize` — callers zero-pad short frames to the next power of two before calling.
export function fft(re, im) {
  const n = re.length;
  if (n !== im.length) throw new Error('fft: re/im length mismatch');
  if (n & (n - 1)) throw new Error(`fft: length ${n} is not a power of two`);

  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curWr - im[i + k + len / 2] * curWi;
        const vIm = re[i + k + len / 2] * curWi + im[i + k + len / 2] * curWr;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr;
        curWi = nextWi;
      }
    }
  }
}

/** Real-input magnitude spectrum of one windowed frame, bins [0, fftSize/2] inclusive. */
export function magnitudeSpectrum(frame, fftSize) {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  re.set(frame.subarray(0, Math.min(frame.length, fftSize)));
  fft(re, im);
  const half = fftSize / 2;
  const mag = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}

export function hannWindow(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}
