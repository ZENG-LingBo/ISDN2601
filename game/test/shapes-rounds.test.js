const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/shapes.js');
const R = require('../js/rounds.js');

const W = 160;
const H = 120;

function area(mask) {
  return mask.reduce((s, x) => s + x, 0) / mask.length;
}

// From the leftmost to the rightmost part of the shape, as a share of the picture's width.
function span(mask) {
  let lo = W;
  let hi = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x]) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
  }
  return (hi - lo + 1) / W;
}

test('every group size has 5 different shapes', () => {
  for (const [size, s] of Object.entries(S.SIZES)) {
    const rounds = S.roundsFor(size);
    assert.equal(rounds.length, 5, size);
    assert.equal(new Set(rounds.map((r) => r.id)).size, 5, size);
    assert.ok(s.label && s.practicePlayers > 0);
  }
  assert.throws(() => S.roundsFor('huge'));
});

test('no shape needs anyone lower than a comfortable crouch', () => {
  // In every column, the shape must reach down to the bottom of the picture without a gap that
  // starts lower than 0.6 of the height, so whoever stands there can crouch rather than lie down.
  for (const [id, shape] of Object.entries(S.SHAPES)) {
    const mask = S.rasterize(shape, W, H);
    for (let x = 0; x < W; x++) {
      if (!mask[(H - 1) * W + x]) continue;
      let y = H - 1;
      while (y > 0 && mask[(y - 1) * W + x]) y--;
      const above = [];
      for (let yy = 0; yy < y; yy++) above.push(mask[yy * W + x]);
      if (above.some(Boolean)) assert.ok(y / H < 0.62, `${id} column ${x}: a gap above someone at ${(y / H).toFixed(2)}`);
    }
  }
});

test('bigger groups get more time to fill the shape', () => {
  assert.ok(S.SIZES.small.fillSeconds < S.SIZES.medium.fillSeconds);
  assert.ok(S.SIZES.medium.fillSeconds < S.SIZES.large.fillSeconds);
  for (const s of Object.values(S.SIZES)) assert.match(s.stand, /^Stand .+ metres from the laptop/);
});

test('every shape has a name and a tip, and a sensible size', () => {
  for (const [id, shape] of Object.entries(S.SHAPES)) {
    assert.ok(shape.name && shape.tip, id);
    const a = area(S.rasterize(shape, W, H));
    assert.ok(a > 0.08 && a < 0.75, `${id} covers ${a}`);
  }
});

test('every shape reaches the bottom of the picture, where bodies are', () => {
  for (const [id, shape] of Object.entries(S.SHAPES)) {
    const mask = S.rasterize(shape, W, H);
    let bottom = 0;
    for (let x = 0; x < W; x++) bottom += mask[(H - 1) * W + x];
    assert.ok(bottom > 0, id);
  }
});

test('bigger groups get wider shapes', () => {
  const avgWidth = (size) => {
    const shapes = S.roundsFor(size);
    return shapes.reduce((s, sh) => s + span(S.rasterize(sh, W, H)), 0) / shapes.length;
  };
  const small = avgWidth('small');
  const medium = avgWidth('medium');
  const large = avgWidth('large');
  assert.ok(small < medium && medium < large, `${small} ${medium} ${large}`);
  assert.ok(small < 0.65 && large > 0.85);
});

test('gaps are empty and the parts around them are filled', () => {
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const win = { rings: [rect(0.1, 0.1, 0.9, 1), rect(0.4, 0.3, 0.6, 0.6)] }; // a ring inside a ring is a hole
  assert.equal(S.inside(win, 0.5, 0.5), false); // the hole
  assert.equal(S.inside(win, 0.5, 0.85), true); // below the hole
  assert.equal(S.inside(win, 0.2, 0.5), true);
  assert.equal(S.inside(S.SHAPES.valley, 0.5, 0.4), false); // above the valley floor
  assert.equal(S.inside(S.SHAPES.valley, 0.5, 0.8), true);
  assert.equal(S.inside(S.SHAPES.bridge, 0.5, 0.8), false); // under the bridge
  assert.equal(S.inside(S.SHAPES.bridge, 0.5, 0.3), true);
  assert.equal(S.inside(S.SHAPES.towers, 0.5, 0.5), false); // between the towers
});

// Helpers for the rules.
const PERFECT = { filled: 1, outside: 0, fit: 1, motion: 0 };

function play(game, from, ms, m, every) {
  let t = from;
  const events = [];
  while (t < from + ms) {
    t += every || 50;
    events.push(...R.step(game, t, typeof m === 'function' ? m(game, t) : m));
  }
  return { t, events };
}

test('a perfect group scores 100 a round and 500 a game', () => {
  const g = R.createGame('medium', 0);
  const { events } = play(g, 0, 5 * 17000 + 1000, PERFECT);
  assert.equal(g.phase, 'done');
  assert.equal(g.results.length, 5);
  assert.ok(g.results.every((r) => r.points === 100));
  assert.equal(R.total(g), 500);
  assert.equal(R.maxTotal(g), 500);
  assert.equal(events.filter((e) => e === 'freeze').length, 5);
  assert.equal(events.filter((e) => e === 'next').length, 4);
  assert.equal(events.at(-1), 'done');
});

test('a round goes fill, then freeze, then result', () => {
  const g = R.createGame('small', 0);
  R.step(g, 7900, PERFECT);
  assert.equal(g.phase, 'fill');
  assert.deepEqual(R.step(g, 8000, PERFECT), ['freeze']);
  assert.equal(g.phase, 'freeze');
  R.step(g, 10900, PERFECT);
  assert.deepEqual(R.step(g, 11000, PERFECT), ['result']);
  assert.equal(g.results[0].name, 'Door');
  assert.deepEqual(R.step(g, 15000, PERFECT), ['next']);
  assert.equal(g.round, 1);
  assert.equal(g.live.filled, 0);
});

test('points are fit times the share of frozen frames held still', () => {
  const g = R.createGame('small', 0);
  play(g, 0, 8000, PERFECT);
  let n = 0;
  play(g, 8000, 3000, () => ({ filled: 0.9, outside: 0.2, fit: 0.8, motion: n++ % 2 ? 0.5 : 0 }));
  const r = g.results[0];
  assert.ok(Math.abs(r.fit - 0.8) < 1e-9);
  assert.ok(Math.abs(r.still - 0.5) < 0.05);
  assert.equal(r.points, Math.round(100 * r.fit * r.still));
});

test('moving in the first half second after Freeze does not count', () => {
  const g = R.createGame('small', 0);
  play(g, 0, 8000, PERFECT);
  play(g, 8000, 3000, (game, t) => ({ ...PERFECT, motion: t - 8000 < 450 ? 0.9 : 0 }));
  assert.equal(g.results[0].points, 100);
});

test('no picture while frozen gives 0 points for the round', () => {
  const g = R.createGame('small', 0);
  play(g, 0, 8000, PERFECT);
  play(g, 8000, 3000, null);
  assert.equal(g.results[0].points, 0);
});

test('rushing during fill raises a slow-down warning, which clears when people slow down', () => {
  const g = R.createGame('large', 0);
  const fast = { ...PERFECT, motion: 0.8 };
  assert.deepEqual(R.step(g, 100, fast), []);
  assert.deepEqual(R.step(g, 300, fast), []);
  assert.deepEqual(R.step(g, 500, fast), ['rushing']);
  assert.equal(g.rushing, true);
  assert.deepEqual(R.step(g, 600, fast), []); // only once
  R.step(g, 700, PERFECT);
  assert.equal(g.rushing, false);
});

test('resuming during Freeze starts the 3 seconds again, with a new half second to settle', () => {
  const g = R.createGame('small', 0);
  play(g, 0, 8000, PERFECT);
  play(g, 8000, 1500, PERFECT);
  assert.equal(g.phase, 'freeze');
  R.pause(g, 9500);
  R.resume(g, 30000);
  assert.equal(g.frozen.length, 0);
  assert.equal(R.remaining(g, 30000), 3000);
  // Moving in the first half second after resuming doesn't count.
  play(g, 30000, 3000, (game, t) => ({ ...PERFECT, motion: t - 30000 < 450 ? 0.9 : 0 }));
  assert.equal(g.results[0].points, 100);
});

test('the rush warning uses the fastest part of the picture when it is given', () => {
  const g = R.createGame('small', 0);
  R.step(g, 100, { ...PERFECT, motion: 0.05, rush: 0.9 });
  assert.deepEqual(R.step(g, 600, { ...PERFECT, motion: 0.05, rush: 0.9 }), ['rushing']);
});

test('pausing stops the clock', () => {
  const g = R.createGame('small', 0);
  R.step(g, 4000, PERFECT);
  R.pause(g, 4000);
  assert.deepEqual(R.step(g, 20000, PERFECT), []);
  assert.equal(R.remaining(g, 20000), 4000);
  R.resume(g, 20000);
  assert.equal(g.phase, 'fill');
  R.step(g, 23900, PERFECT);
  assert.equal(g.phase, 'fill');
  R.step(g, 24000, PERFECT);
  assert.equal(g.phase, 'freeze');
});

test('the speed option shortens every part of a round, for tests', () => {
  const g = R.createGame('small', 0, { speed: 10 });
  R.step(g, 800, PERFECT);
  assert.equal(g.phase, 'freeze');
  assert.equal(R.times(g).result, 400);
});

test('every group size uses the same shapes in the same order each time', () => {
  const a = R.createGame('large', 0).shapes.map((s) => s.id);
  const b = R.createGame('large', 999).shapes.map((s) => s.id);
  assert.deepEqual(a, b);
});
