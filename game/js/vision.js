// Freeze: the computer vision part.
// Plain JavaScript on small pixel arrays, so it runs in any browser and in Node for the tests.
// No libraries, no machine learning model and no network. The video never leaves the laptop.
//
// How it finds people:
// 1. Everyone steps out of the picture and Freeze averages about 1 second of frames.
//    That average is the background, the empty room.
// 2. Each new frame is compared with the background, pixel by pixel. Pixels that differ
//    by more than the camera's normal noise are "foreground": the people.
// 3. A clean-up pass removes single stray pixels and fills small gaps.
// 4. The foreground is compared with the target shape to get a fit score.
// 5. Two frames in a row are compared to measure how much the people are moving.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vision = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Tuning. Pixel values run from 0 to 255.
  const MIN_DIFF = 30; // a pixel must differ from the room by at least this much to count as a person
  const NOISE_K = 3; // ...or by 3 times that pixel's own noise, if the camera is noisy there
  const SHADOW_LOW = 0.6; // a pixel 60–97% as bright as the room, with the same colour, is a shadow
  const SHADOW_HIGH = 0.97;
  const SHADOW_CHROMA = 0.045;
  const MOVE_DIFF = 20; // brightness change that counts as movement between two frames
  const UNSTABLE_NOISE = 12; // background pixels noisier than this were probably someone moving

  function luma(r, g, b) {
    return (r * 77 + g * 150 + b * 29) >> 8;
  }

  // Average each block of f×f pixels. rgba is RGBA bytes, w×h pixels; w and h must divide by f.
  function downscale(rgba, w, h, f) {
    const sw = Math.floor(w / f);
    const sh = Math.floor(h / f);
    const out = new Uint8ClampedArray(sw * sh * 4);
    const n = f * f;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = 0; dy < f; dy++) {
          let i = ((y * f + dy) * w + x * f) * 4;
          for (let dx = 0; dx < f; dx++, i += 4) {
            r += rgba[i];
            g += rgba[i + 1];
            b += rgba[i + 2];
          }
        }
        const o = (y * sw + x) * 4;
        out[o] = r / n;
        out[o + 1] = g / n;
        out[o + 2] = b / n;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  function lumaOf(rgba, w, h) {
    const out = new Uint8Array(w * h);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
    return out;
  }

  // Background ("the empty room").
  function createBackground(w, h) {
    return { w, h, frames: 0, sum: new Float64Array(w * h * 3), sumSq: new Float64Array(w * h * 3) };
  }

  function addBackgroundFrame(acc, rgba) {
    const { sum, sumSq } = acc;
    for (let i = 0, j = 0; j < sum.length; i += 4, j += 3) {
      for (let c = 0; c < 3; c++) {
        const v = rgba[i + c];
        sum[j + c] += v;
        sumSq[j + c] += v * v;
      }
    }
    acc.frames++;
    return acc;
  }

  // Turn the collected frames into a model. `unstable` is the share of pixels that changed a lot
  // while the room was being learned, which usually means someone was still in the picture.
  function finishBackground(acc) {
    const { w, h, frames, sum, sumSq } = acc;
    if (frames < 1) throw new Error('No background frames');
    const n = w * h;
    const mean = new Float32Array(n * 3);
    const noise = new Float32Array(n);
    let unstable = 0;
    for (let p = 0; p < n; p++) {
      let worst = 0;
      for (let c = 0; c < 3; c++) {
        const j = p * 3 + c;
        const m = sum[j] / frames;
        mean[j] = m;
        const v = Math.max(0, sumSq[j] / frames - m * m);
        worst = Math.max(worst, Math.sqrt(v));
      }
      noise[p] = worst;
      if (worst > UNSTABLE_NOISE) unstable++;
    }
    return { w, h, frames, mean, noise, unstable: unstable / n };
  }

  // Laptop cameras change their brightness when people walk in. Estimate that change from the
  // middle value of (frame brightness / room brightness), which comes from the room as long as
  // people cover less than half the picture. Returns a factor near 1.
  function gainOf(rgba, model) {
    const { mean } = model;
    const n = model.w * model.h;
    const bins = new Uint32Array(201); // ratio 0.50 to 1.50 in steps of 0.005
    let count = 0;
    for (let p = 0; p < n; p += 3) {
      const i = p * 4;
      const j = p * 3;
      const lb = mean[j] + mean[j + 1] + mean[j + 2];
      if (lb < 60) continue; // too dark to judge
      const ratio = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / lb;
      if (ratio < 0.5 || ratio > 1.5) continue;
      bins[Math.round((ratio - 0.5) * 200)]++;
      count++;
    }
    if (count < 20) return 1;
    let seen = 0;
    for (let k = 0; k < bins.length; k++) {
      seen += bins[k];
      if (seen * 2 >= count) {
        const g = 0.5 + k / 200;
        return Math.min(1.3, Math.max(0.75, g));
      }
    }
    return 1;
  }

  // 1 where a person is, 0 where the room is.
  function foregroundMask(rgba, model, opts) {
    const o = opts || {};
    const minDiff = o.minDiff ?? MIN_DIFF;
    const noiseK = o.noiseK ?? NOISE_K;
    const shadows = o.shadows !== false;
    const gain = o.gain === false ? 1 : gainOf(rgba, model);
    const { mean, noise } = model;
    const n = model.w * model.h;
    const mask = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      const j = p * 3;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const br = mean[j] * gain;
      const bg = mean[j + 1] * gain;
      const bb = mean[j + 2] * gain;
      const d = Math.max(Math.abs(r - br), Math.abs(g - bg), Math.abs(b - bb));
      if (d <= Math.max(minDiff, noiseK * noise[p] * gain)) continue;
      if (shadows) {
        const l = r + g + b;
        const lb = br + bg + bb;
        if (lb > 0 && l > SHADOW_LOW * lb && l < SHADOW_HIGH * lb) {
          const chroma = Math.abs(r / l - br / lb) + Math.abs(g / l - bg / lb);
          if (chroma < SHADOW_CHROMA) continue; // same colour, a bit darker: a shadow
        }
      }
      mask[p] = 1;
    }
    return mask;
  }

  // Keep a pixel only if most of its 3×3 neighbours agree. Removes specks and fills pinholes.
  // Pixels outside the picture count as room.
  function cleanMask(mask, w, h, passes) {
    let cur = mask;
    for (let k = 0; k < (passes ?? 2); k++) {
      const next = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx >= 0 && xx < w) s += cur[yy * w + xx];
            }
          }
          next[y * w + x] = s >= 5 ? 1 : 0;
        }
      }
      cur = next;
    }
    return cur;
  }

  function countOnes(mask) {
    let s = 0;
    for (let i = 0; i < mask.length; i++) s += mask[i];
    return s;
  }

  // How well the people fill the shape.
  // filled: share of the shape covered by people.
  // outside: people outside the shape, as a share of the shape's size (at most 1).
  // fit: filled minus half of outside, from 0 to 1.
  function scoreFit(mask, shape) {
    let area = 0;
    let covered = 0;
    let spill = 0;
    for (let i = 0; i < shape.length; i++) {
      if (shape[i]) {
        area++;
        if (mask[i]) covered++;
      } else if (mask[i]) spill++;
    }
    if (!area) return { filled: 0, outside: 0, fit: 0 };
    const filled = covered / area;
    const outside = Math.min(1, spill / area);
    return { filled, outside, fit: Math.max(0, Math.min(1, filled - 0.5 * outside)) };
  }

  // How much the people moved between two frames: the share of their pixels whose brightness
  // changed by more than MOVE_DIFF. Divided by the people's size, so one person and eight
  // people are judged the same way. Pixels in either mask count, so a person moving into
  // empty room counts too.
  function motion(prevLuma, curLuma, prevMask, curMask, opts) {
    const o = opts || {};
    const diff = o.diff ?? MOVE_DIFF;
    const n = curLuma.length;
    let moved = 0;
    let people = 0;
    for (let p = 0; p < n; p++) {
      const inPeople = curMask[p] || prevMask[p];
      if (!inPeople) continue;
      people++;
      if (Math.abs(curLuma[p] - prevLuma[p]) > diff) moved++;
    }
    const floor = Math.max(1, Math.round(n * 0.03)); // stops a tiny speck from looking like big movement
    return moved / Math.max(people, floor);
  }

  return {
    MIN_DIFF,
    MOVE_DIFF,
    luma,
    downscale,
    lumaOf,
    createBackground,
    addBackgroundFrame,
    finishBackground,
    gainOf,
    foregroundMask,
    cleanMask,
    countOnes,
    scoreFit,
    motion,
  };
});
