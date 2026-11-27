/** Small DSP helpers for tests and diagnostics. Pure TypeScript, no platform dependencies. */

export function generateSine(
  freq: number,
  sampleRate: number,
  seconds: number,
  amplitude = 0.5,
): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Dominant frequency (Hz) using a Hann-windowed, zero-padded FFT and parabolic peak interpolation. */
export function dominantFrequency(samples: Float32Array, sampleRate: number): number {
  let n = 1;
  while (n < samples.length) n <<= 1;
  n = Math.max(n, 1 << 15) * 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const len = samples.length;
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
    re[i] = samples[i]! * w;
  }
  fft(re, im);
  let best = 1;
  let bestMag = 0;
  const mag = new Float64Array(n / 2);
  for (let k = 1; k < n / 2; k++) {
    mag[k] = Math.hypot(re[k]!, im[k]!);
    if (mag[k]! > bestMag) {
      bestMag = mag[k]!;
      best = k;
    }
  }
  const a = Math.log(mag[best - 1]! + 1e-12);
  const b = Math.log(mag[best]! + 1e-12);
  const c = Math.log(mag[best + 1]! + 1e-12);
  const denom = a - 2 * b + c;
  const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  return ((best + delta) * sampleRate) / n;
}

export function rms(samples: Float32Array): number {
  let s = 0;
  for (const v of samples) s += v * v;
  return Math.sqrt(s / Math.max(1, samples.length));
}
