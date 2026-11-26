// Freeze: working with masks, small pictures where 1 means "a person is here" and 0 means
// "room". The body-tracking model (or the practice players) gives Freeze a mask of everyone in
// view; these functions shrink it, clean it and compare it with a shape.
// Plain JavaScript on small arrays, so it runs in any browser and in Node for the tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vision = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Shrink a w×h mask by f in each direction. A cell is 1 if at least half its pixels are.
  function shrinkMask(mask, w, h, f) {
    const sw = Math.floor(w / f);
    const sh = Math.floor(h / f);
    const out = new Uint8Array(sw * sh);
    const half = (f * f) / 2;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let s = 0;
        for (let dy = 0; dy < f; dy++) {
          const row = (y * f + dy) * w + x * f;
          for (let dx = 0; dx < f; dx++) s += mask[row + dx] ? 1 : 0;
        }
        out[y * sw + x] = s >= half ? 1 : 0;
      }
    }
    return out;
  }

  // Keep a pixel only if most of its 3×3 neighbours agree. Removes specks and fills pinholes.
  // Pixels outside the picture count as room.
  function cleanMask(mask, w, h, passes) {
    let cur = mask;
    for (let k = 0; k < (passes ?? 1); k++) {
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

  return { shrinkMask, cleanMask, countOnes, scoreFit };
});
