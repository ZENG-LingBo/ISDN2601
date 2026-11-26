// The practice players run through the same vision code as a real camera.
// These tests check the whole chain: picture → mask → fit and motion.
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/vision.js');
const S = require('../js/shapes.js');
const P = require('../js/practice.js');
const R = require('../js/rounds.js');

const BIG_W = 320;
const BIG_H = 240;
const W = 160;
const H = 120;

function small(buf) {
  return V.downscale(buf, BIG_W, BIG_H, 2);
}

function learnRoom(scene) {
  const acc = V.createBackground(W, H);
  for (let k = 0; k < 15; k++) V.addBackgroundFrame(acc, small(P.frame(scene, { present: false, t: k * 66 })));
  return V.finishBackground(acc);
}

function maskOf(scene, model, state) {
  return V.cleanMask(V.foregroundMask(small(P.frame(scene, state)), model), W, H);
}

test('the empty pretend room gives an empty mask', () => {
  const scene = P.createScene({ players: 4, seed: 3 });
  const model = learnRoom(scene);
  assert.equal(model.unstable, 0);
  const mask = maskOf(scene, model, { present: false, t: 5000 });
  assert.ok(V.countOnes(mask) / mask.length < 0.005);
});

test('the pretend people show up in the mask', () => {
  const scene = P.createScene({ players: 4, seed: 3 });
  const model = learnRoom(scene);
  const mask = maskOf(scene, model, { present: true, t: 1000 });
  const share = V.countOnes(mask) / mask.length;
  assert.ok(share > 0.1 && share < 0.6, `people cover ${share}`);
});

test('once frozen in place, the pretend people fill every shape fairly well', () => {
  for (const [size, info] of Object.entries(S.SIZES)) {
    const scene = P.createScene({ players: info.practicePlayers, seed: 11 });
    const model = learnRoom(scene);
    for (const shape of S.roundsFor(size)) {
      const mask = maskOf(scene, model, { present: true, shape, phase: 'freeze', elapsed: 2000, round: 0, t: 9000 });
      const fit = V.scoreFit(mask, S.rasterize(shape, W, H));
      assert.ok(fit.filled > 0.55, `${size} ${shape.id} filled ${fit.filled.toFixed(2)}`);
      assert.ok(fit.fit > 0.4, `${size} ${shape.id} fit ${fit.fit.toFixed(2)}`);
      assert.ok(fit.fit < 0.98, `${size} ${shape.id} is too perfect for pretend people`);
    }
  }
});

test('the fit grows as the pretend people walk into the shape', () => {
  const scene = P.createScene({ players: 4, seed: 5 });
  const model = learnRoom(scene);
  const shape = S.SHAPES.steps;
  const target = S.rasterize(shape, W, H);
  const at = (elapsed) => V.scoreFit(maskOf(scene, model, { present: true, shape, phase: 'fill', elapsed, fillMs: 8000, round: 1, t: elapsed }), target).fit;
  assert.ok(at(0) < at(6000), `${at(0)} then ${at(6000)}`);
});

test('the pretend people hold still after Freeze, except one person in the fidget round', () => {
  const scene = P.createScene({ players: 4, seed: 9 });
  const model = learnRoom(scene);
  const shape = S.roundsFor('medium')[P.FIDGET_ROUND];
  // The game compares each frozen frame with the frame 400 ms before it.
  const move = (round, t1, t2) => {
    const s1 = small(P.frame(scene, { present: true, shape, phase: 'freeze', elapsed: t1 - 8000, round, t: t1 }));
    const m1 = V.cleanMask(V.foregroundMask(s1, model), W, H);
    const l1 = V.lumaOf(s1, W, H);
    const s2 = small(P.frame(scene, { present: true, shape, phase: 'freeze', elapsed: t2 - 8000, round, t: t2 }));
    const m2 = V.cleanMask(V.foregroundMask(s2, model), W, H);
    return V.stripMotion(l1, V.lumaOf(s2, W, H), m1, m2, W, H, 8);
  };
  assert.ok(move(0, 8600, 9000) < R.MOVE_LIMIT, 'still round');
  const fidget = Math.max(move(P.FIDGET_ROUND, 8600, 9000), move(P.FIDGET_ROUND, 8800, 9200), move(P.FIDGET_ROUND, 9000, 9400));
  assert.ok(fidget > R.MOVE_LIMIT, `fidget motion ${fidget}`);
});

test('the same seed draws the same people', () => {
  const a = P.createScene({ players: 3, seed: 21 });
  const b = P.createScene({ players: 3, seed: 21 });
  const st = { present: true, t: 500 };
  assert.deepEqual(P.positions(a, st), P.positions(b, st));
});

test('a whole practice game runs from start to finish', () => {
  const size = 'small';
  const scene = P.createScene({ players: S.SIZES[size].practicePlayers, seed: 2 });
  const model = learnRoom(scene);
  const game = R.createGame(size, 0, { speed: 4 });
  let prev = null;
  for (let t = 0; game.phase !== 'done' && t < 60000; t += 66) {
    const shape = game.shapes[game.round];
    const state = { present: true, shape, phase: game.phase, elapsed: R.elapsed(game, t), fillMs: R.times(game).fill, round: game.round, t };
    const s = small(P.frame(scene, state));
    const mask = V.cleanMask(V.foregroundMask(s, model), W, H);
    const luma = V.lumaOf(s, W, H);
    const fit = V.scoreFit(mask, S.rasterize(shape, W, H));
    const motion = prev ? V.motion(prev.luma, luma, prev.mask, mask) : 0;
    prev = { luma, mask };
    R.step(game, t, { ...fit, motion });
  }
  assert.equal(game.phase, 'done');
  assert.equal(game.results.length, 5);
  const total = R.total(game);
  assert.ok(total > 150 && total < 500, `total ${total}`);
});
