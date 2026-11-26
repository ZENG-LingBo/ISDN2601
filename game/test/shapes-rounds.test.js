const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/shapes.js');
const R = require('../js/rounds.js');
const Pose = require('../js/pose.js');

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
const PERFECT = { players: 4, fit: 1, filled: 1, outside: 0, hands: 4, matching: 4, motion: 0, rush: 0 };

function play(game, from, ms, m, every) {
  let t = from;
  const events = [];
  while (t < from + ms) {
    t += every || 50;
    events.push(...R.step(game, t, typeof m === 'function' ? m(game, t) : m));
  }
  return { t, events };
}

// Perfect play for whatever the current round asks.
function perfect(game) {
  const r = game.rounds[game.round];
  return { ...PERFECT, hands: r.type === 'hands' ? R.handsTarget(r, 4) : 0 };
}

test('the players-to-group-size rule', () => {
  assert.equal(S.sizeFor(1), 'small');
  assert.equal(S.sizeFor(2), 'small');
  assert.equal(S.sizeFor(3), 'medium');
  assert.equal(S.sizeFor(5), 'medium');
  assert.equal(S.sizeFor(6), 'large');
});

test('every game has 5 rounds, and Mix has each kind of round', () => {
  for (const kind of Object.keys(R.GAMES)) {
    const rounds = R.planRounds(kind, 4);
    assert.equal(rounds.length, 5, kind);
    assert.ok(rounds.every((r) => r.title && r.tip && r.fillMs > 0), kind);
  }
  const types = new Set(R.planRounds('mix', 4).map((r) => r.type));
  assert.deepEqual([...types].sort(), ['hands', 'pose', 'shape']);
  assert.throws(() => R.planRounds('golf', 4));
});

test('Shapes picks the shape set from the number of players', () => {
  assert.equal(R.planRounds('shapes', 2)[0].id, 'door');
  assert.equal(R.planRounds('shapes', 4)[0].id, 'wall');
  assert.equal(R.planRounds('shapes', 7)[0].id, 'bigwall');
  assert.equal(R.planRounds('shapes', 7)[0].fillMs, 12000);
});

test('the same game and number of players always give the same rounds', () => {
  const a = R.planRounds('mix', 5).map((r) => r.title);
  const b = R.planRounds('mix', 5).map((r) => r.title);
  assert.deepEqual(a, b);
});

test('Hands up titles say how many hands, and the target fits the players in view', () => {
  const rounds = R.planRounds('hands', 4);
  assert.deepEqual(rounds.map((r) => r.title), ['Show 4 hands', 'Show 8 hands', 'Show 3 hands', 'Show 5 hands', 'Show 6 hands']);
  assert.equal(R.handsTarget(rounds[1], 4), 8);
  assert.equal(R.handsTarget(rounds[1], 2), 4); // two players left: 4 hands at most
  assert.equal(R.planRounds('hands', 1)[2].title, 'Show 1 hand');
});

test('a perfect group scores 100 a round and 500 a game, in every game', () => {
  for (const kind of Object.keys(R.GAMES)) {
    const g = R.createGame(kind, 4, 0);
    const { events } = play(g, 0, 5 * 20000, perfect);
    assert.equal(g.phase, 'done', kind);
    assert.ok(g.results.every((r) => r.points === 100), kind + ' ' + g.results.map((r) => r.points));
    assert.equal(R.total(g), 500);
    assert.equal(events.filter((e) => e === 'freeze').length, 5);
    assert.equal(events.at(-1), 'done');
  }
});

test('a round goes fill, then freeze, then result', () => {
  const g = R.createGame('shapes', 2, 0);
  R.step(g, 7900, PERFECT);
  assert.equal(g.phase, 'fill');
  assert.deepEqual(R.step(g, 8000, PERFECT), ['freeze']);
  R.step(g, 10900, PERFECT);
  assert.deepEqual(R.step(g, 11000, PERFECT), ['result']);
  assert.equal(g.results[0].name, 'Shapes');
  assert.equal(g.results[0].what, 'Door');
  assert.equal(g.results[0].title, 'Fill the shape');
  assert.deepEqual(R.step(g, 14500, PERFECT), ['next']);
  assert.equal(g.round, 1);
});

test('Hands up: exactly right scores 1, one off scores half, more is 0', () => {
  const round = R.planRounds('hands', 4)[0]; // show 4
  assert.equal(R.momentScore(round, { players: 4, hands: 4 }), 1);
  assert.equal(R.momentScore(round, { players: 4, hands: 5 }), 0.5);
  assert.equal(R.momentScore(round, { players: 4, hands: 3 }), 0.5);
  assert.equal(R.momentScore(round, { players: 4, hands: 6 }), 0);
  assert.equal(R.momentScore(round, { players: 0, hands: 4 }), 0);
});

test('Copy the pose scores the share of players copying', () => {
  const round = R.planRounds('pose', 4)[0];
  assert.equal(R.momentScore(round, { players: 4, matching: 3 }), 0.75);
  assert.equal(R.momentScore(round, { players: 0, matching: 0 }), 0);
});

test('points are the average score times the share of frozen moments held still', () => {
  const g = R.createGame('pose', 4, 0);
  play(g, 0, 5000, PERFECT);
  let n = 0;
  play(g, 5000, 3000, () => ({ ...PERFECT, matching: 2, motion: n++ % 2 ? 0.5 : 0 }));
  const r = g.results[0];
  assert.ok(Math.abs(r.score - 0.5) < 1e-9);
  assert.ok(Math.abs(r.still - 0.5) < 0.05);
  assert.equal(r.points, Math.round(100 * r.score * r.still));
  assert.ok(Math.abs(r.matched - 0.5) < 1e-9);
});

test('the Hands up result keeps the most common count and the target', () => {
  const g = R.createGame('hands', 4, 0);
  play(g, 0, 6000, PERFECT);
  play(g, 6000, 3000, { ...PERFECT, hands: 3 });
  assert.equal(g.results[0].hands, 3);
  assert.equal(g.results[0].target, 4);
  assert.equal(g.results[0].points, 50);
});

test('moving in the first half second after Freeze does not count', () => {
  const g = R.createGame('shapes', 2, 0);
  play(g, 0, 8000, PERFECT);
  play(g, 8000, 3000, (game, t) => ({ ...PERFECT, motion: t - 8000 < 450 ? 0.9 : 0 }));
  assert.equal(g.results[0].points, 100);
});

test('nobody in view while frozen gives 0 points for the round', () => {
  const g = R.createGame('pose', 4, 0);
  play(g, 0, 5000, PERFECT);
  play(g, 5000, 3000, { ...PERFECT, players: 0, matching: 0 });
  assert.equal(g.results[0].points, 0);
  const h = R.createGame('pose', 4, 0);
  play(h, 0, 5000, PERFECT);
  play(h, 5000, 3000, null);
  assert.equal(h.results[0].points, 0);
});

test('crossing the room fast during fill raises a slow-down warning, which clears when people slow down', () => {
  const g = R.createGame('shapes', 7, 0);
  const fast = { ...PERFECT, rush: R.RUSH_LIMIT + 1 };
  assert.deepEqual(R.step(g, 100, fast), []);
  assert.deepEqual(R.step(g, 300, fast), []);
  assert.deepEqual(R.step(g, 500, fast), ['rushing']);
  assert.deepEqual(R.step(g, 600, fast), []); // only once
  R.step(g, 700, PERFECT);
  assert.equal(g.rushing, false);
});

test('resuming during Freeze starts the 3 seconds again, with a new half second to settle', () => {
  const g = R.createGame('shapes', 2, 0);
  play(g, 0, 8000, PERFECT);
  play(g, 8000, 1500, PERFECT);
  assert.equal(g.phase, 'freeze');
  R.pause(g, 9500);
  R.resume(g, 30000);
  assert.equal(g.frozen.length, 0);
  assert.equal(R.remaining(g, 30000), 3000);
  play(g, 30000, 3000, (game, t) => ({ ...PERFECT, motion: t - 30000 < 450 ? 0.9 : 0 }));
  assert.equal(g.results[0].points, 100);
});

test('pausing stops the clock', () => {
  const g = R.createGame('shapes', 2, 0);
  R.step(g, 4000, PERFECT);
  R.pause(g, 4000);
  assert.deepEqual(R.step(g, 20000, PERFECT), []);
  assert.equal(R.remaining(g, 20000), 4000);
  R.resume(g, 20000);
  R.step(g, 23900, PERFECT);
  assert.equal(g.phase, 'fill');
  R.step(g, 24000, PERFECT);
  assert.equal(g.phase, 'freeze');
});

test('the speed option shortens every part of a round, for tests', () => {
  const g = R.createGame('pose', 4, 0, { speed: 10 });
  R.step(g, 500, PERFECT);
  assert.equal(g.phase, 'freeze');
  assert.equal(R.times(g).result, 350);
});

test('how still the group held is the average share of players holding still', () => {
  const g = R.createGame('pose', 4, 0);
  play(g, 0, 5000, PERFECT);
  play(g, 5000, 3000, { ...PERFECT, still: 0.75 });
  assert.ok(Math.abs(g.results[0].still - 0.75) < 1e-9);
  assert.equal(g.results[0].points, 75);
});
