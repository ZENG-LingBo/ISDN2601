// The practice players give the games the same things the body-tracking model does: body
// points and a mask. These tests run the games end to end on them.
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/vision.js');
const S = require('../js/shapes.js');
const Pose = require('../js/pose.js');
const P = require('../js/practice.js');
const R = require('../js/rounds.js');

const BIG_W = 320;
const BIG_H = 240;
const W = 160;
const H = 120;

function look(scene, state) {
  const f = P.frame(scene, state);
  return { players: Pose.players(f.poses), mask: V.cleanMask(V.shrinkMask(f.mask, BIG_W, BIG_H, 2), W, H, 1), rgba: f.rgba };
}

function frozen(round, i, t) {
  return { present: true, round, roundIndex: i, phase: 'freeze', elapsed: 2000, fillMs: round.fillMs, t: t || 9000 };
}

test('every practice player is found as a player', () => {
  for (const n of [2, 4, 6]) {
    const scene = P.createScene({ players: n, seed: 3 });
    assert.equal(look(scene, { present: true, t: 1000 }).players.length, n);
    assert.equal(look(scene, { present: false, t: 1000 }).players.length, 0);
  }
});

test('the mask covers the practice players and nothing else', () => {
  const scene = P.createScene({ players: 4, seed: 3 });
  const share = V.countOnes(look(scene, { present: true, t: 1000 }).mask) / (W * H);
  assert.ok(share > 0.1 && share < 0.6, `people cover ${share}`);
  assert.equal(V.countOnes(look(scene, { present: false, t: 1000 }).mask), 0);
});

test('once frozen, the practice players fill every shape fairly well', () => {
  for (const n of [2, 4, 6]) {
    const scene = P.createScene({ players: n, seed: 11 });
    R.planRounds('shapes', n).forEach((round, i) => {
      const fit = V.scoreFit(look(scene, frozen(round, i)).mask, S.rasterize(round.shape, W, H));
      assert.ok(fit.filled > 0.55, `${n} ${round.id} filled ${fit.filled.toFixed(2)}`);
      assert.ok(fit.fit > 0.4 && fit.fit < 0.98, `${n} ${round.id} fit ${fit.fit.toFixed(2)}`);
    });
  }
});

test('in Hands up, practice players show the target, except in the rounds where they get it one off', () => {
  for (const n of [2, 4, 6]) {
    const scene = P.createScene({ players: n, seed: 5 });
    R.planRounds('hands', n).forEach((round, i) => {
      const { players } = look(scene, frozen(round, i));
      const hands = players.reduce((s, p) => s + Pose.handsUp(p), 0);
      const off = Math.abs(hands - R.handsTarget(round, players.length));
      assert.equal(off, i % 2 === 1 ? 1 : 0, `${n} players, round ${i + 1}: ${hands} hands for ${round.target}`);
    });
  }
});

test('in Copy the pose, practice players copy the card, except one player in round 3', () => {
  for (const n of [2, 4, 6]) {
    const scene = P.createScene({ players: n, seed: 5 });
    R.planRounds('pose', n).forEach((round, i) => {
      const { players } = look(scene, frozen(round, i));
      const matching = players.filter((p) => Pose.matches(p, round.card)).length;
      assert.equal(matching, i === 2 ? n - 1 : n, `${n} players, ${round.card}`);
    });
  }
});

test('practice players start each round with arms down and copy the pose during the round', () => {
  const scene = P.createScene({ players: 4, seed: 5 });
  const round = R.planRounds('pose', 4)[0];
  const at = (elapsed) => look(scene, { present: true, round, roundIndex: 0, phase: 'fill', elapsed, fillMs: round.fillMs, t: elapsed }).players.filter((p) => Pose.matches(p, round.card)).length;
  assert.equal(at(0), 0);
  assert.equal(at(round.fillMs), 4);
});

test('practice players hold still after Freeze, except one player in round 3', () => {
  const scene = P.createScene({ players: 4, seed: 9 });
  const rounds = R.planRounds('pose', 4);
  const at = (i, t) => look(scene, { ...frozen(rounds[i], i, t), elapsed: t - 8000 }).players; // Freeze started at 8000
  const move = (i, t1, t2) => Pose.movement(at(i, t1), at(i, t2));
  assert.ok(move(0, 8600, 9000) < R.MOVE_LIMIT, 'round 1 is still');
  const fidget = Math.max(move(P.FIDGET_ROUND, 8600, 9000), move(P.FIDGET_ROUND, 8800, 9200), move(P.FIDGET_ROUND, 9000, 9400));
  assert.ok(fidget > R.MOVE_LIMIT, `round 3 movement ${fidget}`);
});

test('practice players walking into a shape are not rushing', () => {
  const scene = P.createScene({ players: 6, seed: 2 });
  const round = R.planRounds('shapes', 6)[0];
  let worst = 0;
  let prev = null;
  for (let t = 0; t < round.fillMs; t += 66) {
    const { players } = look(scene, { present: true, round, roundIndex: 0, phase: 'fill', elapsed: t, fillMs: round.fillMs, t });
    if (prev) worst = Math.max(worst, Pose.speed(prev, players, 0.066));
    prev = players;
  }
  assert.ok(worst < R.RUSH_LIMIT, `fastest ${worst.toFixed(2)} body sizes a second`);
});

test('the same seed draws the same people', () => {
  const a = P.createScene({ players: 3, seed: 21 });
  const b = P.createScene({ players: 3, seed: 21 });
  const st = { present: true, t: 500 };
  assert.deepEqual(P.figures(a, st), P.figures(b, st));
});

test('a whole practice game of each kind runs from start to finish', () => {
  for (const kind of Object.keys(R.GAMES)) {
    const n = 4;
    const scene = P.createScene({ players: n, seed: 2 });
    const game = R.createGame(kind, n, 0, { speed: 4 });
    const history = [];
    for (let t = 0; game.phase !== 'done' && t < 120000; t += 66) {
      const round = game.rounds[game.round];
      const { players, mask } = look(scene, { present: true, round, roundIndex: game.round, phase: game.phase, elapsed: R.elapsed(game, t), fillMs: R.times(game).fill, t });
      history.push({ t, players });
      const base = history.find((h) => h.t >= t - 100) || history[history.length - 1];
      const m = { players: players.length, motion: Pose.movement(base.players, players), rush: 0 };
      if (round.type === 'shape') Object.assign(m, V.scoreFit(mask, S.rasterize(round.shape, W, H)));
      if (round.type === 'hands') m.hands = players.reduce((s, p) => s + Pose.handsUp(p), 0);
      if (round.type === 'pose') m.matching = players.filter((p) => Pose.matches(p, round.card)).length;
      R.step(game, t, m);
    }
    assert.equal(game.phase, 'done', kind);
    const total = R.total(game);
    assert.ok(total > 150 && total < 500, `${kind} total ${total}`);
  }
});
