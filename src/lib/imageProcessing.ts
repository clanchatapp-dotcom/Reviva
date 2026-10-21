// Real client-side image processing pipeline.
// All operations run on canvas pixel buffers — no external API calls.
// Designed to produce authentic-looking restoration: gentle, film-like,
// not the over-painted look of consumer "AI" tools.

export type RGB = [number, number, number];

export interface RestoreOptions {
  upscale: number;       // 1, 2, 4
  denoise: number;       // 0..100
  sharpen: number;       // 0..100
  colorize: number;      // 0..100 (0 = none, works on grayscale)
  repair: number;        // 0..100 (scratch/damage repair)
  brighten: number;      // -50..50
  contrast: number;      // -50..50
  saturation: number;    // -50..50
  warmTint: number;      // -50..50 (cool<->warm)
  clahe: number;         // 0..100 (adaptive local contrast — the big one for faded photos)
  dehaze: number;        // 0..100 (removes the foggy/veiled look in old photos)
  faceProtect: boolean;  // preserve skin tones / detail in bright regions
}

export const DEFAULT_OPTIONS: RestoreOptions = {
  upscale: 2,
  denoise: 30,
  sharpen: 60,
  colorize: 0,
  repair: 70,
  brighten: 12,
  contrast: 22,
  saturation: 18,
  warmTint: 8,
  clahe: 70,
  dehaze: 55,
  faceProtect: true,
};

export interface ProcessResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  durationMs: number;
}

// ----------------------------- helpers -----------------------------

function clamp(v: number, lo = 0, hi = 255): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  return [y, cb, cr];
}
function ycbcrToRGB(y: number, cb: number, cr: number): RGB {
  const r = y + 1.402 * (cr - 128);
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  const b = y + 1.772 * (cb - 128);
  return [clamp(r), clamp(g), clamp(b)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l * 255; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [clamp(r*255), clamp(g*255), clamp(b*255)];
}

function detectIsGrayscale(data: Uint8ClampedArray): boolean {
  let diffSum = 0, count = 0;
  // sample
  for (let i = 0; i < data.length; i += 4 * 37) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    diffSum += (mx - mn); count++;
  }
  return (diffSum / count) < 6; // very low chroma => grayscale
}

function detectIsSepia(data: Uint8ClampedArray): boolean {
  let rAvg = 0, gAvg = 0, bAvg = 0, count = 0;
  for (let i = 0; i < data.length; i += 4 * 41) {
    rAvg += data[i]; gAvg += data[i+1]; bAvg += data[i+2]; count++;
  }
  rAvg /= count; gAvg /= count; bAvg /= count;
  return rAvg > gAvg + 18 && gAvg > bAvg + 18 && rAvg > bAvg + 40;
}

// ----------------------------- operations -----------------------------

// Edge-aware bilateral-ish smoothing using a 3x3 guided weighted blur.
export function denoisePass(
  src: Uint8ClampedArray,
  w: number, h: number,
  strength: number // 0..1
): Uint8ClampedArray {
  if (strength <= 0) return src;
  const out = new Uint8ClampedArray(src.length);
  const spatialSigma = 1.4;
  const rangeSigma = 18 + 42 * (1 - strength); // tighter when stronger
  const s2 = 2 * spatialSigma * spatialSigma;
  const r2 = 2 * rangeSigma * rangeSigma;
  const radius = strength > 0.6 ? 2 : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const cr = src[i], cg = src[i+1], cb = src[i+2];
      let accR = 0, accG = 0, accB = 0, wSum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = (yy * w + xx) * 4;
          const nr = src[j], ng = src[j+1], nb = src[j+2];
          const spatial = (dx*dx + dy*dy) / s2;
          const range = ((nr-cr)*(nr-cr)+(ng-cg)*(ng-cg)+(nb-cb)*(nb-cb)) / r2;
          const ww = Math.exp(-(spatial + range));
          accR += nr * ww; accG += ng * ww; accB += nb * ww; wSum += ww;
        }
      }
      out[i] = accR / wSum;
      out[i+1] = accG / wSum;
      out[i+2] = accB / wSum;
      out[i+3] = src[i+3];
    }
  }
  return out;
}

// Unsharp mask using a separable Gaussian.
function gaussianBlurSeparable(src: Uint8ClampedArray, w: number, h: number, radius: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    gray[j] = 0.299*src[i] + 0.587*src[i+1] + 0.114*src[i+2];
  }
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const sigma = Math.max(0.5, radius);
  const kSize = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(kSize * 2 + 1);
  let kSum = 0;
  const s2 = 2 * sigma * sigma;
  for (let k = -kSize; k <= kSize; k++) { const v = Math.exp(-(k*k)/s2); kernel[k+kSize] = v; kSum += v; }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= kSum;
  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -kSize; k <= kSize; k++) {
        const xx = Math.min(w-1, Math.max(0, x + k));
        s += gray[y*w + xx] * kernel[k+kSize];
      }
      tmp[y*w + x] = s;
    }
  }
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -kSize; k <= kSize; k++) {
        const yy = Math.min(h-1, Math.max(0, y + k));
        s += tmp[yy*w + x] * kernel[k+kSize];
      }
      out[y*w + x] = s;
    }
  }
  return out;
}

export function sharpenPass(
  src: Uint8ClampedArray,
  w: number, h: number,
  strength: number // 0..1
): Uint8ClampedArray {
  if (strength <= 0) return src;
  const radius = 1.2;
  const blurred = gaussianBlurSeparable(src, w, h, radius);
  const amount = 0.35 + 1.1 * strength;
  const threshold = 2;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    const orig = 0.299*src[i] + 0.587*src[i+1] + 0.114*src[i+2];
    const diff = orig - blurred[j];
    const mag = Math.abs(diff);
    const mask = mag > threshold ? 1 : mag / threshold;
    const boost = amount * diff * mask;
    out[i]   = clamp(src[i]   + boost);
    out[i+1] = clamp(src[i+1] + boost);
    out[i+2] = clamp(src[i+2] + boost);
    out[i+3] = src[i+3];
  }
  return out;
}

// Scratch/damage repair via multi-pass outlier inpainting.
// A 3x3 median only fixes isolated specks — real scratches and cracks span
// many pixels, so the local median shifts toward the scratch and never flags
// it as an outlier. Instead we: (1) build a damage map from a wide window so
// multi-pixel scratches are detected against the surrounding healthy region,
// (2) run several progressive passes so each pass erodes scratches in from
// their edges, and (3) fill damaged pixels by interpolating from the nearest
// healthy pixels rather than blending toward a single neighbor.
export function repairPass(
  src: Uint8ClampedArray,
  w: number, h: number,
  strength: number // 0..1
): Uint8ClampedArray {
  if (strength <= 0) return src;
  // Detection threshold: how far a pixel must deviate from its local robust
  // estimate to count as damage. Lower => catch more, risk over-smoothing.
  const threshold = 14 + 26 * (1 - strength);
  // Number of healing passes. More passes progressively shrink larger
  // defects; each pass heals the outer ring of a scratch.
  const passes = Math.round(2 + 3 * strength);
  // Detection window radius (the window we compare a pixel against). A
  // larger window makes the local estimate robust to wide scratches.
  const detectR = 3;
  // Fill window radius (the region we draw replacement color from).
  const fillR = 2;

  let data = src;
  for (let pass = 0; pass < passes; pass++) {
    const out = new Uint8ClampedArray(data.length);
    // Precompute luma for fast access.
    const luma = new Float32Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      luma[j] = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        const cr = data[i], cg = data[i+1], cb = data[i+2];
        const curLuma = luma[idx];

        // Build a robust local estimate from the detection window, excluding
        // the center pixel so the scratch itself doesn't skew the median.
        const window: number[] = [];
        for (let dy = -detectR; dy <= detectR; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -detectR; dx <= detectR; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            window.push(luma[yy * w + xx]);
          }
        }
        window.sort((a, b) => a - b);
        const median = window[Math.floor(window.length / 2)];

        if (Math.abs(curLuma - median) > threshold) {
          // Damaged pixel: inpaint from healthy neighbors in the fill window.
          // Collect only neighbors that are NOT themselves flagged as damage
          // (deviation within threshold), then average them. This means wide
          // scratches heal from their edges inward across passes.
          let aR = 0, aG = 0, aB = 0, aCount = 0;
          for (let dy = -fillR; dy <= fillR; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -fillR; dx <= fillR; dx++) {
              if (dx === 0 && dy === 0) continue;
              const xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              const j = (yy * w + xx) * 4;
              const nl = luma[yy * w + xx];
              // Use neighbor if it's healthy relative to the same median.
              if (Math.abs(nl - median) <= threshold) {
                aR += data[j]; aG += data[j+1]; aB += data[j+2]; aCount++;
              }
            }
          }
          if (aCount > 0) {
            out[i]   = clamp(aR / aCount);
            out[i+1] = clamp(aG / aCount);
            out[i+2] = clamp(aB / aCount);
          } else {
            // No healthy neighbor in window (fully surrounded by damage):
            // fall back to the local median luma applied to the current chroma.
            const ratio = median / Math.max(1, curLuma);
            out[i]   = clamp(cr * ratio);
            out[i+1] = clamp(cg * ratio);
            out[i+2] = clamp(cb * ratio);
          }
        } else {
          out[i] = cr; out[i+1] = cg; out[i+2] = cb;
        }
        out[i+3] = data[i+3];
      }
    }
    data = out;
  }
  return data;
}

// Global tone: brightness, contrast, saturation, warm tint.
export function tonePass(
  src: Uint8ClampedArray,
  w: number, h: number,
  opts: { brighten: number; contrast: number; saturation: number; warmTint: number }
): Uint8ClampedArray {
  const { brighten, contrast, saturation, warmTint } = opts;
  if (!brighten && !contrast && !saturation && !warmTint) return src;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const satFactor = 1 + saturation / 50;
  const warmR = warmTint / 50 * 14;
  const warmB = -warmTint / 50 * 18;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    let r = src[i], g = src[i+1], b = src[i+2];
    // brightness
    r += brighten; g += brighten; b += brighten;
    // contrast
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;
    // saturation
    const gray = 0.299*r + 0.587*g + 0.114*b;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;
    // warm tint
    r += warmR; b += warmB;
    out[i] = clamp(r); out[i+1] = clamp(g); out[i+2] = clamp(b); out[i+3] = src[i+3];
  }
  return out;
}

// Authentic colorization of grayscale imagery.
// Strategy: derive a plausible chroma map from luminance using tone mapping
// (shadows->cool blue, mids->neutral/natural skin-ish warm, highs->warm highlights),
// then blend softly with filmic grain to avoid flat cartoon color.
export function colorizePass(
  src: Uint8ClampedArray,
  w: number, h: number,
  strength: number, // 0..1
  isSepia: boolean
): Uint8ClampedArray {
  if (strength <= 0) return src;
  const out = new Uint8ClampedArray(src.length);
  const s = strength;
  for (let i = 0; i < src.length; i += 4) {
    let r = src[i], g = src[i+1], b = src[i+2];
    if (isSepia) {
      // neutralize sepia tone first
      const y = 0.299*r + 0.587*g + 0.114*b;
      r = g = b = y;
    }
    const l = 0.299*r + 0.587*g + 0.114*b; // 0..255
    const ln = l / 255;
    // chroma curve: cool shadows, warm mid (skin-like), warm-neutral highlights
    // cb (blue<->yellow): higher = warmer
    let cb: number, cr: number;
    if (ln < 0.35) {
      const t = ln / 0.35;
      cb = 128 + (1 - t) * 14;  // slightly blue shadows
      cr = 128 - (1 - t) * 6;
    } else if (ln < 0.7) {
      const t = (ln - 0.35) / 0.35;
      cb = 128 + 8 - t * 4;     // neutral-warm mid
      cr = 128 + t * 10;        // warming mid
    } else {
      const t = (ln - 0.7) / 0.3;
      cb = 128 + 4 - t * 2;     // gentle highlights
      cr = 128 + 10 - t * 2;
    }
    const [nr, ng, nb] = ycbcrToRGB(l, cb, cr);
    // blend toward colorized version
    out[i]   = clamp(r + (nr - r) * s);
    out[i+1] = clamp(g + (ng - g) * s);
    out[i+2] = clamp(b + (nb - b) * s);
    out[i+3] = src[i+3];
  }
  return out;
}

// CLAHE (Contrast-Limited Adaptive Histogram Equalization) — the single most
// transformative algorithm for old/faded photos. Equalizes contrast in local
// tiles so detail hidden in muddy midtones becomes visible without washing out
// highlights or crushing shadows. Clip limit prevents over-amplification of noise.
export function clahePass(
  src: Uint8ClampedArray,
  w: number, h: number,
  strength: number // 0..1
): Uint8ClampedArray {
  if (strength <= 0) return src;
  const tile = 64;            // tile size in pixels
  const clipLimit = 2.5 + 4.5 * strength; // higher = more aggressive
  const tx = Math.ceil(w / tile);
  const ty = Math.ceil(h / tile);
  const nTilesX = Math.max(2, tx);
  const nTilesY = Math.max(2, ty);
  const tileW = w / nTilesX;
  const tileH = h / nTilesY;

  // Work on luma
  const luma = new Float32Array(w * h);
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    luma[j] = 0.299*src[i] + 0.587*src[i+1] + 0.114*src[i+2];
  }

  // Build per-tile CDF lookup tables (256 entries each).
  // Each tile produces a mapping luma->luma based on its local histogram.
  const luts = new Float32Array(nTilesY * nTilesX * 256);
  for (let tyi = 0; tyi < nTilesY; tyi++) {
    for (let txi = 0; txi < nTilesX; txi++) {
      const x0 = Math.floor(txi * tileW);
      const y0 = Math.floor(tyi * tileH);
      const x1 = Math.min(w, Math.floor((txi+1) * tileW));
      const y1 = Math.min(h, Math.floor((tyi+1) * tileH));
      const count = (x1 - x0) * (y1 - y0);
      const hist = new Float32Array(256);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[Math.round(luma[y*w + x])]++;
        }
      }
      // clip histogram & redistribute excess
      const excess = new Float32Array(256);
      let totalExcess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipLimit) {
          excess[i] = hist[i] - clipLimit;
          totalExcess += hist[i] - clipLimit;
          hist[i] = clipLimit;
        }
      }
      const redistribute = totalExcess / 256;
      for (let i = 0; i < 256; i++) hist[i] += redistribute;
      // build CDF
      const lut = luts.subarray((tyi * nTilesX + txi) * 256);
      let cdf = 0;
      let cdfMin = 0;
      const cdfArr = new Float32Array(256);
      for (let i = 0; i < 256; i++) { cdf += hist[i]; cdfArr[i] = cdf; }
      // find first non-zero
      for (let i = 0; i < 256; i++) { if (cdfArr[i] > 0) { cdfMin = cdfArr[i]; break; } }
      const denom = Math.max(1, count - cdfMin);
      for (let i = 0; i < 256; i++) {
        lut[i] = ((cdfArr[i] - cdfMin) / denom) * 255;
      }
    }
  }

  // Bilinear interpolation between 4 nearest tile LUTs.
  const out = new Uint8ClampedArray(src.length);
  const newLuma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    // tile coordinate (continuous)
    const fy = (y + 0.5) / tileH - 0.5;
    let tyi0 = Math.floor(fy);
    let tyi1 = tyi0 + 1;
    const wy = fy - tyi0;
    tyi0 = Math.max(0, Math.min(nTilesY - 1, tyi0));
    tyi1 = Math.max(0, Math.min(nTilesY - 1, tyi1));
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / tileW - 0.5;
      let txi0 = Math.floor(fx);
      let txi1 = txi0 + 1;
      const wx = fx - txi0;
      txi0 = Math.max(0, Math.min(nTilesX - 1, txi0));
      txi1 = Math.max(0, Math.min(nTilesX - 1, txi1));
      const lv = Math.round(luma[y*w + x]);
      const lut00 = luts.subarray((tyi0 * nTilesX + txi0) * 256);
      const lut01 = luts.subarray((tyi0 * nTilesX + txi1) * 256);
      const lut10 = luts.subarray((tyi1 * nTilesX + txi0) * 256);
      const lut11 = luts.subarray((tyi1 * nTilesX + txi1) * 256);
      const v00 = lut00[lv];
      const v01 = lut01[lv];
      const v10 = lut10[lv];
      const v11 = lut11[lv];
      const top = v00 + (v01 - v00) * wx;
      const bot = v10 + (v11 - v10) * wx;
      newLuma[y*w + x] = top + (bot - top) * wy;
    }
  }

  // Apply luma change to RGB while preserving chroma ratio.
  const s = strength;
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    const oldL = luma[j];
    const newL = newLuma[j];
    if (oldL < 1) {
      // keep dark pixels mostly intact
      out[i] = clamp(src[i] * (0.5 + 0.5 * s) + newL * 0.5 * s);
      out[i+1] = clamp(src[i+1] * (0.5 + 0.5 * s) + newL * 0.5 * s);
      out[i+2] = clamp(src[i+2] * (0.5 + 0.5 * s) + newL * 0.5 * s);
    } else {
      const ratio = (oldL + (newL - oldL) * s) / oldL;
      out[i] = clamp(src[i] * ratio);
      out[i+1] = clamp(src[i+1] * ratio);
      out[i+2] = clamp(src[i+2] * ratio);
    }
    out[i+3] = src[i+3];
  }
  return out;
}

// Dehaze via dark-channel prior. Estimates the atmospheric veil (the foggy
// gray/brown layer that ages photos) and subtracts it, restoring true contrast
// and color. This is the algorithm most "enhance" tools use to make old photos
// look dramatic.
export function dehazePass(
  src: Uint8ClampedArray,
  w: number, h: number,
  strength: number // 0..1
): Uint8ClampedArray {
  if (strength <= 0) return src;
  // Estimate airlight (atmospheric light) from brightest pixels.
  // Then estimate transmission via the dark channel.
  const darkChannel = new Float32Array(w * h);
  const minRadius = Math.max(3, Math.round(Math.min(w, h) * 0.02));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let minC = Math.min(src[i], src[i+1], src[i+2]);
      // min over a small neighborhood (box)
      for (let dy = -minRadius; dy <= minRadius; dy += 2) {
        const yy = Math.max(0, Math.min(h-1, y+dy));
        for (let dx = -minRadius; dx <= minRadius; dx += 2) {
          const xx = Math.max(0, Math.min(w-1, x+dx));
          const j = (yy * w + xx) * 4;
          minC = Math.min(minC, src[j], src[j+1], src[j+2]);
        }
      }
      darkChannel[y*w + x] = minC;
    }
  }
  // airlight: pick the top 0.1% brightest in dark channel
  const samples = darkChannel.slice().sort((a,b)=>b-a);
  const topIdx = Math.max(0, Math.floor(samples.length * 0.001));
  const A = samples[topIdx] * 1.1; // atmospheric light estimate (per-channel scalar)
  const atmosphere = Math.max(40, A);

  // transmission estimate
  const omega = 0.85 * strength; // amount of haze removed
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const t = Math.max(0.15, 1 - omega); // minimum transmission floor
    // For each channel: J = (I - A) / t + A
    out[i]   = clamp((src[i]   - atmosphere) / t + atmosphere);
    out[i+1] = clamp((src[i+1] - atmosphere) / t + atmosphere);
    out[i+2] = clamp((src[i+2] - atmosphere) / t + atmosphere);
    out[i+3] = src[i+3];
  }
  return out;
}

// Lanczos resampling kernel with configurable tap count.
function lanczosKernel(x: number, a: number): number {
  if (x === 0) return 1;
  if (x <= -a || x >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

// Single separable Lanczos resample pass. Upscales srcCanvas by `factor`
// using `taps`-tap Lanczos (3 recommended). Separable H then V keeps it fast.
function lanczosResample(
  srcCanvas: HTMLCanvasElement,
  factor: number,
  taps: number,
): HTMLCanvasElement {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const dw = Math.round(sw * factor), dh = Math.round(sh * factor);
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  const srcData = sctx.getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas');
  out.width = dw; out.height = dh;
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  const outImg = octx.createImageData(dw, dh);
  const outData = outImg.data;
  const a = taps;
  const kSize = a;
  const contributionsX: { x: number; w: number }[][] = new Array(dw);
  for (let x = 0; x < dw; x++) {
    const sx = (x + 0.5) / factor - 0.5;
    const left = Math.floor(sx) - kSize + 1;
    const arr: { x: number; w: number }[] = [];
    let wSum = 0;
    for (let k = 0; k <= kSize * 2; k++) {
      const xx = left + k;
      const w = lanczosKernel(sx - xx, a);
      if (w !== 0) { arr.push({ x: xx, w }); wSum += w; }
    }
    for (const c of arr) c.w /= wSum;
    contributionsX[x] = arr;
  }
  // horizontal pass -> temp Float32
  const tmp = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, alpha = 0;
      for (const c of contributionsX[x]) {
        const xx = Math.min(sw - 1, Math.max(0, c.x));
        const j = (y * sw + xx) * 4;
        r += srcData[j] * c.w; g += srcData[j+1] * c.w; b += srcData[j+2] * c.w; alpha += srcData[j+3] * c.w;
      }
      const o = (y * dw + x) * 4;
      tmp[o] = r; tmp[o+1] = g; tmp[o+2] = b; tmp[o+3] = alpha;
    }
  }
  // vertical pass
  const contributionsY: { y: number; w: number }[][] = new Array(dh);
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) / factor - 0.5;
    const top = Math.floor(sy) - kSize + 1;
    const arr: { y: number; w: number }[] = [];
    let wSum = 0;
    for (let k = 0; k <= kSize * 2; k++) {
      const yy = top + k;
      const w = lanczosKernel(sy - yy, a);
      if (w !== 0) { arr.push({ y: yy, w }); wSum += w; }
    }
    for (const c of arr) c.w /= wSum;
    contributionsY[y] = arr;
  }
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, alpha = 0;
      for (const c of contributionsY[y]) {
        const yy = Math.min(sh - 1, Math.max(0, c.y));
        const j = (yy * dw + x) * 4;
        r += tmp[j] * c.w; g += tmp[j+1] * c.w; b += tmp[j+2] * c.w; alpha += tmp[j+3] * c.w;
      }
      const o = (y * dw + x) * 4;
      outData[o] = clamp(r); outData[o+1] = clamp(g); outData[o+2] = clamp(b); outData[o+3] = clamp(alpha);
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

// Iterative Back-Projection detail reconstruction. After interpolation we
// downsample the high-res estimate back to source size (simulating how the
// camera captured it), measure the residual against the real source, then
// project that error — upscaled — back onto the high-res image. Repeated
// passes recover edge detail that plain interpolation smoothed away.
function downsampleBox(canvas: HTMLCanvasElement, dw: number, dh: number): Uint8ClampedArray {
  const sw = canvas.width, sh = canvas.height;
  const sctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Use the browser's high-quality downscale as an averaging proxy.
  const tmp = document.createElement('canvas');
  tmp.width = dw; tmp.height = dh;
  const tctx = tmp.getContext('2d', { willReadFrequently: true })!;
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(canvas, 0, 0, dw, dh);
  return tctx.getImageData(0, 0, dw, dh).data;
}

function iterativeBackProjection(
  source: HTMLCanvasElement,
  hr: HTMLCanvasElement,
  factor: number,
  iters: number,
): HTMLCanvasElement {
  const sw = source.width, sh = source.height;
  const srcData = source.getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, sw, sh).data;
  let current = hr;
  const relaxation = 0.35; // how much of the residual to apply each pass
  for (let it = 0; it < iters; it++) {
    const simData = downsampleBox(current, sw, sh);
    // Build a signed residual at source resolution.
    const res = new Float32Array(sw * sh * 4);
    for (let i = 0; i < res.length; i += 4) {
      res[i]   = srcData[i]   - simData[i];
      res[i+1] = srcData[i+1] - simData[i+1];
      res[i+2] = srcData[i+2] - simData[i+2];
      res[i+3] = 0;
    }
    // Render residual to a canvas (offset by 128 to keep it unsigned),
    // upscale it, then subtract the offset back out when applying.
    const resCanvas = document.createElement('canvas');
    resCanvas.width = sw; resCanvas.height = sh;
    const rctx = resCanvas.getContext('2d', { willReadFrequently: true })!;
    const rImg = rctx.createImageData(sw, sh);
    for (let i = 0; i < res.length; i += 4) {
      rImg.data[i]   = clamp(res[i]   + 128);
      rImg.data[i+1] = clamp(res[i+1] + 128);
      rImg.data[i+2] = clamp(res[i+2] + 128);
      rImg.data[i+3] = 255;
    }
    rctx.putImageData(rImg, 0, 0);
    const resHR = lanczosResample(resCanvas, factor, 3);
    const hw = resHR.width, hh = resHR.height;
    const hrCtx = current.getContext('2d', { willReadFrequently: true })!;
    const hrData = hrCtx.getImageData(0, 0, hw, hh);
    const resHrData = resHR.getContext('2d', { willReadFrequently: true })!
      .getImageData(0, 0, hw, hh).data;
    for (let i = 0; i < hrData.data.length; i += 4) {
      hrData.data[i]   = clamp(hrData.data[i]   + (resHrData[i]   - 128) * relaxation);
      hrData.data[i+1] = clamp(hrData.data[i+1] + (resHrData[i+1] - 128) * relaxation);
      hrData.data[i+2] = clamp(hrData.data[i+2] + (resHrData[i+2] - 128) * relaxation);
    }
    hrCtx.putImageData(hrData, 0, 0);
  }
  return current;
}

// High-quality progressive upscaler for both photos and video frames.
// Combines progressive Lanczos-3 resampling (so 4x = two 2x passes, keeping
// the kernel well-shaped at each stage) with iterative back-projection that
// reconstructs edge detail lost to interpolation.
export function upscaleCanvas(srcCanvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  if (factor <= 1) return srcCanvas;
  // Progressive 2x steps: decompose factor into the largest 2x chunks plus a
  // final fractional step. Progressive upscaling keeps each pass near the
  // ideal 2x ratio where Lanczos performs best.
  let current = srcCanvas;
  let remaining = factor;
  while (remaining > 1.001) {
    const step = remaining >= 2 ? 2 : remaining;
    current = lanczosResample(current, step, 3);
    remaining /= step;
  }
  // Detail reconstruction: 2 IBP iterations recover sharpness. Only worth
  // the cost for 2x+ upscaling; skip for near-1x.
  if (factor >= 1.5) {
    current = iterativeBackProjection(srcCanvas, current, factor, 2);
  }
  return current;
}

// Subtle film grain for authenticity.
function addGrain(canvas: HTMLCanvasElement, amount = 0.025) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount;
    d[i] = clamp(d[i] + n);
    d[i+1] = clamp(d[i+1] + n);
    d[i+2] = clamp(d[i+2] + n);
  }
  ctx.putImageData(img, 0, 0);
}

// Mild vignette to recenter focus (authentic restoration look).
function addVignette(canvas: HTMLCanvasElement, amount = 0.12) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const grad = ctx.createRadialGradient(
    width/2, height/2, Math.min(width,height)*0.35,
    width/2, height/2, Math.max(width,height)*0.72
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.fillStyle = grad;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
}

// ----------------------------- pipeline -----------------------------

export interface ProcessProgress {
  (stage: string, pct: number): void;
}

export async function processImage(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  opts: RestoreOptions,
  onProgress?: ProcessProgress
): Promise<ProcessResult> {
  const start = performance.now();
  const p = (stage: string, pct: number) => onProgress?.(stage, pct);
  p('Preparing', 0.02);

  // Draw source to base canvas at natural size
  const w = 'videoWidth' in source ? source.videoWidth || source.width : source.width;
  const h = 'videoHeight' in source ? source.videoHeight || source.height : source.height;
  const base = document.createElement('canvas');
  base.width = w; base.height = h;
  const bctx = base.getContext('2d', { willReadFrequently: true })!;
  bctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  await microtask();
  p('Analyzing', 0.06);

  // 1. Dehaze — remove the foggy/veiled layer FIRST so subsequent steps see real detail
  let imgData = bctx.getImageData(0, 0, w, h);
  let data = imgData.data;
  if (opts.dehaze > 0) {
    p('Removing haze', 0.09);
    data = dehazePass(data, w, h, opts.dehaze / 100);
    bctx.putImageData(new ImageData(data, w, h), 0, 0);
    await microtask();
  }

  // 2. Repair (before upscale, while small)
  imgData = bctx.getImageData(0, 0, w, h);
  data = imgData.data;
  if (opts.repair > 0) {
    p('Repairing damage', 0.16);
    data = repairPass(data, w, h, opts.repair / 100);
    await microtask();
  }

  // 3. Denoise
  if (opts.denoise > 0) {
    p('Reducing noise', 0.26);
    data = denoisePass(data, w, h, opts.denoise / 100);
    await microtask();
  }

  // write back intermediate
  bctx.putImageData(new ImageData(data, w, h), 0, 0);

  // 4. Upscale
  p('Upscaling', 0.42);
  let work = base;
  if (opts.upscale > 1) {
    work = upscaleCanvas(base, opts.upscale);
  }
  const ww = work.width, wh = work.height;
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  await microtask();

  // 5. Colorize (if grayscale)
  let wData = wctx.getImageData(0, 0, ww, wh);
  if (opts.colorize > 0) {
    p('Applying color', 0.54);
    const isGray = detectIsGrayscale(wData.data);
    const isSep = isGray ? false : detectIsSepia(wData.data);
    if (isGray || isSep) {
      wData = new ImageData(
        colorizePass(wData.data, ww, wh, opts.colorize / 100, isSep),
        ww, wh
      );
      wctx.putImageData(wData, 0, 0);
    }
    await microtask();
  }

  // 6. CLAHE — adaptive local contrast (the big one for faded photos)
  if (opts.clahe > 0) {
    p('Enhancing local detail', 0.64);
    wData = wctx.getImageData(0, 0, ww, wh);
    wData = new ImageData(clahePass(wData.data, ww, wh, opts.clahe / 100), ww, wh);
    wctx.putImageData(wData, 0, 0);
    await microtask();
  }

  // 7. Tone adjustments
  p('Balancing tones', 0.74);
  wData = wctx.getImageData(0, 0, ww, wh);
  wData = new ImageData(
    tonePass(wData.data, ww, wh, {
      brighten: opts.brighten,
      contrast: opts.contrast,
      saturation: opts.saturation,
      warmTint: opts.warmTint,
    }),
    ww, wh
  );
  wctx.putImageData(wData, 0, 0);
  await microtask();

  // 8. Sharpen (on upscaled)
  if (opts.sharpen > 0) {
    p('Restoring detail', 0.86);
    wData = wctx.getImageData(0, 0, ww, wh);
    wData = new ImageData(sharpenPass(wData.data, ww, wh, opts.sharpen / 100), ww, wh);
    wctx.putImageData(wData, 0, 0);
    await microtask();
  }

  // 9. Finishing: subtle grain + vignette for authentic feel
  p('Finishing', 0.95);
  addGrain(work, 0.018);
  addVignette(work, 0.08);

  p('Done', 1);
  return { canvas: work, width: ww, height: wh, durationMs: performance.now() - start };
}

function microtask(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

export function loadImageFromDataURL(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
