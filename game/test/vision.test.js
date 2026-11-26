const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/vision.js');

const W = 40;
const H = 30;

function solid(w, h, c) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  }
  return buf;
}

function paint(buf, w, x0, y0, x1, y1, c) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
    }
  }
  return buf;
}

function noisy(buf, amount, seed) {
  let s = seed || 1;
  const out = new Uint8ClampedArray(buf);
  for (let i = 0; i < out.length; i += 4) {
    s = (s * 1103515245 + 12345) >>> 0;
    const d = (s % (2 * amount + 1)) - amount;
    out[i] += d;
    out[i + 1] += d;
    out[i + 2] += d;
  }
  return out;
}

const WALL = [190, 185, 175];

function roomModel(frames) {
  const acc = V.createBackground(W, H);
  for (let k = 0; k < (frames || 10); k++) V.addBackgroundFrame(acc, noisy(solid(W, H, WALL), 3, k + 1));
  return V.finishBackground(acc);
}

function maskCount(mask, w, x0, y0, x1, y1) {
  let s = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += mask[y * w + x];
  return s;
}

test('luma runs from 0 for black to 255 for white', () => {
  assert.equal(V.luma(0, 0, 0), 0);
  assert.equal(V.luma(255, 255, 255), 255);
  assert.ok(V.luma(0, 255, 0) > V.luma(255, 0, 0));
  assert.ok(V.luma(255, 0, 0) > V.luma(0, 0, 255));
});

test('downscale averages each block of pixels', () => {
  const buf = solid(4, 2, [0, 0, 0]);
  paint(buf, 4, 0, 0, 1, 1, [200, 100, 40]);
  const out = V.downscale(buf, 4, 2, 2);
  assert.equal(out.length, 2 * 1 * 4);
  assert.deepEqual([...out.slice(0, 4)], [50, 25, 10, 255]);
  assert.deepEqual([...out.slice(4, 8)], [0, 0, 0, 255]);
});

test('the room model is the average of the frames, with low noise for a still room', () => {
  const m = roomModel(12);
  assert.equal(m.frames, 12);
  assert.ok(Math.abs(m.mean[0] - WALL[0]) < 2);
  assert.ok(m.noise.every((x) => x < 4));
  assert.equal(m.unstable, 0);
});

test('someone moving while the room is learned shows up as unstable', () => {
  const acc = V.createBackground(W, H);
  for (let k = 0; k < 10; k++) {
    const f = solid(W, H, WALL);
    if (k % 2) paint(f, W, 10, 5, 25, 30, [40, 60, 150]); // a person walking through
    V.addBackgroundFrame(acc, f);
  }
  const m = V.finishBackground(acc);
  assert.ok(m.unstable > 0.2, `unstable ${m.unstable}`);
});

test('finishing a room model with no frames is an error', () => {
  assert.throws(() => V.finishBackground(V.createBackground(W, H)));
});

test('the empty room gives an empty mask', () => {
  const m = roomModel();
  const mask = V.cleanMask(V.foregroundMask(noisy(solid(W, H, WALL), 3, 99), m), W, H);
  assert.equal(V.countOnes(mask), 0);
});

test('a person in front of the wall shows up in the mask, and nothing else does', () => {
  const m = roomModel();
  const f = paint(noisy(solid(W, H, WALL), 3, 50), W, 12, 6, 24, 30, [40, 70, 160]);
  const mask = V.cleanMask(V.foregroundMask(f, m), W, H);
  const inBox = maskCount(mask, W, 12, 6, 24, 30);
  assert.ok(inBox >= 0.9 * 12 * 24, `found ${inBox} of ${12 * 24}`);
  assert.ok(V.countOnes(mask) - inBox <= 4);
});

const WHITE = [235, 232, 228];

function whiteRoom() {
  const acc = V.createBackground(W, H);
  for (let k = 0; k < 10; k++) V.addBackgroundFrame(acc, noisy(solid(W, H, WHITE), 3, k + 1));
  return V.finishBackground(acc);
}

test('a dark shirt counts, but a soft shadow on a white wall does not', () => {
  const m = whiteRoom();
  const f = solid(W, H, WHITE);
  paint(f, W, 2, 2, 10, 28, [30, 30, 32]); // dark shirt
  paint(f, W, 20, 2, 30, 28, WHITE.map((c) => Math.round(c * 0.86))); // soft shadow: same colour, 86% as bright
  const mask = V.foregroundMask(f, m);
  assert.ok(maskCount(mask, W, 2, 2, 10, 28) > 0.95 * 8 * 26);
  assert.equal(maskCount(mask, W, 20, 2, 30, 28), 0);
  const noShadow = V.foregroundMask(f, m, { shadows: false });
  assert.ok(maskCount(noShadow, W, 20, 2, 30, 28) > 0.95 * 10 * 26);
});

test('grey and light grey clothes in front of a white wall count as people', () => {
  const m = whiteRoom();
  for (const ratio of [0.68, 0.75, 0.8]) {
    const f = paint(solid(W, H, WHITE), W, 10, 4, 26, 30, WHITE.map((c) => Math.round(c * ratio)));
    const mask = V.foregroundMask(f, m);
    assert.ok(maskCount(mask, W, 10, 4, 26, 30) > 0.95 * 16 * 26, `grey at ${ratio}`);
  }
});

test('when the camera brightens the whole picture, the room still counts as empty', () => {
  const m = roomModel();
  const brighter = solid(W, H, WALL.map((c) => Math.round(c * 1.18)));
  assert.ok(Math.abs(V.gainOf(brighter, m) - 1.18) < 0.02);
  assert.equal(V.countOnes(V.foregroundMask(brighter, m)), 0);
  assert.ok(V.countOnes(V.foregroundMask(brighter, m, { gain: false })) > 0.9 * W * H);
});

test('the brightness correction ignores the people, as long as they cover less than half', () => {
  const m = roomModel();
  const f = solid(W, H, WALL.map((c) => Math.round(c * 1.1)));
  paint(f, W, 0, 0, 16, 30, [250, 250, 250]); // 40% of the picture is a person in white
  assert.ok(Math.abs(V.gainOf(f, m) - 1.1) < 0.02);
});

test('a big group covering 65% of the picture does not fool the brightness correction', () => {
  const m = roomModel();
  const f = solid(W, H, WALL.map((c) => Math.round(c * 1.06))); // the camera brightened by 6%
  paint(f, W, 0, 0, 26, 30, [120, 110, 100]); // mid-tone clothes over 65% of the picture
  const people = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < 26; x++) people[y * W + x] = 1;
  const g = V.gainOf(f, m, V.dilate(people, W, H, 2));
  assert.ok(Math.abs(g - 1.06) < 0.02, `gain ${g}`);
  const mask = V.cleanMask(V.foregroundMask(f, m, { gain: g }), W, H);
  assert.equal(maskCount(mask, W, 30, 0, 40, 30), 0, 'the empty room stays empty');
  assert.ok(maskCount(mask, W, 0, 0, 26, 30) > 0.9 * 26 * 30);
});

test('with almost no room in view, the brightness correction says it cannot judge', () => {
  const m = roomModel();
  const people = new Uint8Array(W * H).fill(1);
  assert.equal(V.gainOf(solid(W, H, WALL), m, people), null);
});

test('dilate grows a mask in every direction', () => {
  const mask = new Uint8Array(W * H);
  mask[10 * W + 10] = 1;
  const out = V.dilate(mask, W, H, 2);
  assert.equal(V.countOnes(out), 25);
  assert.equal(out[12 * W + 12], 1);
  assert.equal(out[13 * W + 10], 0);
});

test('clean-up removes a stray pixel and fills a pinhole', () => {
  const mask = new Uint8Array(W * H);
  mask[3 * W + 3] = 1; // stray
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) mask[y * W + x] = 1;
  mask[15 * W + 15] = 0; // pinhole
  const out = V.cleanMask(mask, W, H);
  assert.equal(out[3 * W + 3], 0);
  assert.equal(out[15 * W + 15], 1);
  assert.equal(out[12 * W + 12], 1);
});

test('fit is 1 for a perfect fill and drops for gaps and for people outside the shape', () => {
  const shape = new Uint8Array(100);
  for (let i = 0; i < 50; i++) shape[i] = 1;
  assert.deepEqual(V.scoreFit(shape, shape), { filled: 1, outside: 0, fit: 1 });
  const half = new Uint8Array(100);
  for (let i = 0; i < 25; i++) half[i] = 1;
  assert.equal(V.scoreFit(half, shape).fit, 0.5);
  const spill = new Uint8Array(shape);
  for (let i = 50; i < 60; i++) spill[i] = 1;
  const s = V.scoreFit(spill, shape);
  assert.equal(s.filled, 1);
  assert.equal(s.outside, 0.2);
  assert.ok(Math.abs(s.fit - 0.9) < 1e-9);
  assert.equal(V.scoreFit(new Uint8Array(100).fill(1), shape).fit, 0.5);
  assert.equal(V.scoreFit(shape, new Uint8Array(100)).fit, 0);
});

test('motion is 0 for a still group and high when someone moves', () => {
  const still = new Uint8Array(W * H).fill(120);
  const mask = new Uint8Array(W * H);
  for (let y = 5; y < 30; y++) for (let x = 10; x < 20; x++) mask[y * W + x] = 1;
  assert.equal(V.motion(still, still, mask, mask), 0);
  const prev = new Uint8Array(W * H).fill(180);
  const cur = new Uint8Array(W * H).fill(180);
  for (let i = 0; i < mask.length; i++) if (mask[i]) prev[i] = 60;
  const mask2 = new Uint8Array(W * H);
  for (let y = 5; y < 30; y++) for (let x = 14; x < 24; x++) {
    mask2[y * W + x] = 1;
    cur[y * W + x] = 60;
  }
  const m = V.motion(prev, cur, mask, mask2);
  assert.ok(m > 0.5, `motion ${m}`);
});

test('strip motion finds one person moving in a group that is otherwise still', () => {
  const prev = new Uint8Array(W * H).fill(180);
  const cur = new Uint8Array(W * H).fill(180);
  const mask = new Uint8Array(W * H);
  for (let y = 5; y < 30; y++) for (let x = 0; x < W; x++) mask[y * W + x] = 1; // a wide still group
  for (let y = 5; y < 30; y++) for (let x = 0; x < 5; x++) cur[y * W + x] = 60; // one person moving at the left
  const whole = V.motion(prev, cur, mask, mask);
  const strips = V.stripMotion(prev, cur, mask, mask, W, H, 8);
  assert.ok(whole < 0.15, `whole ${whole}`);
  assert.ok(strips > 0.9, `strips ${strips}`);
  assert.equal(V.stripMotion(prev, prev, mask, mask, W, H, 8), 0);
});

test('with clean-up, swaying by less than a pixel is not movement, but drifting is', () => {
  // Two people with sharp edges. Swaying changes only a 1-pixel line along each edge;
  // drifting by 3 pixels changes a band 3 pixels wide.
  const person = (shift) => {
    const luma = new Uint8Array(W * H).fill(200);
    const mask = new Uint8Array(W * H);
    for (const left of [6, 22]) {
      for (let y = 4; y < H; y++) {
        for (let x = left + shift; x < left + 10 + shift; x++) {
          luma[y * W + x] = 50;
          mask[y * W + x] = 1;
        }
      }
    }
    return { luma, mask };
  };
  const a = person(0);
  const sway = person(1); // 1 working pixel is about 2 cm at 3 metres; real sway is less
  const drift = person(3);
  const opts = { clean: true };
  assert.ok(V.stripMotion(a.luma, sway.luma, a.mask, sway.mask, W, H, 8, opts) < 0.03, 'sway');
  assert.ok(V.stripMotion(a.luma, sway.luma, a.mask, sway.mask, W, H, 8) > 0.08, 'without clean-up, sway would count');
  assert.ok(V.stripMotion(a.luma, drift.luma, a.mask, drift.mask, W, H, 8, opts) > 0.08, 'drift');
});

test('a tiny speck flickering is not big movement', () => {
  const prev = new Uint8Array(W * H).fill(100);
  const cur = new Uint8Array(prev);
  const mask = new Uint8Array(W * H);
  mask[0] = 1;
  cur[0] = 200;
  assert.ok(V.motion(prev, cur, mask, mask) < 0.05);
});
