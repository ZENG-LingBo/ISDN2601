const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/vision.js');

const W = 40;
const H = 30;

test('shrinkMask keeps a cell when at least half its pixels are people', () => {
  const mask = new Uint8Array(4 * 2);
  mask[0] = 1;
  mask[1] = 1; // half of the first 2×2 block
  mask[3] = 1; // a quarter of the second block
  const out = V.shrinkMask(mask, 4, 2, 2);
  assert.deepEqual([...out], [1, 0]);
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

test('countOnes counts the people pixels', () => {
  assert.equal(V.countOnes(new Uint8Array([1, 0, 1, 1])), 3);
});
