const test = require('node:test');
const assert = require('node:assert/strict');
const Pose = require('../js/pose.js');
const P = require('../js/practice.js');

// A body built the way the practice players are built, in a 4:3 picture.
const scene = { aspect: 4 / 3 };
function body(left, right, cx, opts) {
  const f = Object.assign({ cx: cx ?? 0.5, top: 0.32, width: 0.12, shapeRound: false, left, right }, opts || {});
  return P.landmarks(scene, f);
}

function shift(pose, dx, dy) {
  return pose.map((p) => ({ x: p.x + dx, y: p.y + (dy || 0), v: p.v }));
}

test('a pose with both shoulders visible counts as a player, and players are listed left to right', () => {
  const a = body('down', 'down', 0.7);
  const b = body('down', 'down', 0.3);
  const hidden = body('down', 'down', 0.5).map((p, i) => (i === Pose.P.L_SHOULDER ? { ...p, v: 0.1 } : p));
  const list = Pose.players([a, hidden, b]);
  assert.equal(list.length, 2);
  assert.ok(Pose.centre(list[0]).x < Pose.centre(list[1]).x);
});

test('hands count as up when the wrist is above the nose', () => {
  assert.equal(Pose.handsUp(body('down', 'down')), 0);
  assert.equal(Pose.handsUp(body('down', 'up')), 1);
  assert.equal(Pose.handsUp(body('up', 'up')), 2);
});

test('each pose card matches its own pose and none of the others', () => {
  for (const [card, arms] of Object.entries(P.CARD_ARMS)) {
    const pose = body(arms[0], arms[1]);
    for (const other of Pose.POSE_ORDER) {
      assert.equal(Pose.matches(pose, other), other === card, `${card} body against ${other} card`);
    }
  }
  for (const card of Pose.POSE_ORDER) assert.equal(Pose.matches(body('down', 'down'), card), false, `arms down against ${card}`);
});

test('left and right are the player\'s own, as in a mirror', () => {
  const right = body('down', 'up');
  // In the mirrored picture the player's right hand is on the screen's right.
  assert.ok(right[Pose.P.R_WRIST].x > right[Pose.P.L_WRIST].x);
  assert.equal(Pose.matches(right, 'right-up'), true);
  assert.equal(Pose.matches(right, 'left-up'), false);
});

test('poses are judged by body size, so near and far players are judged the same', () => {
  const near = body('up', 'up', 0.5, { width: 0.16, top: 0.3 });
  const far = body('up', 'up', 0.5, { width: 0.08, top: 0.45 });
  assert.ok(Pose.size(near) > Pose.size(far));
  assert.equal(Pose.matches(near, 'arms-up'), true);
  assert.equal(Pose.matches(far, 'arms-up'), true);
});

test('a hidden wrist does not count as a hand up', () => {
  const pose = body('up', 'up').map((p, i) => (i === Pose.P.R_WRIST ? { ...p, v: 0.1 } : p));
  assert.equal(Pose.handsUp(pose), 1);
});

test('hand targets stay between 1 and twice the players, and are the same every time', () => {
  for (let n = 1; n <= 8; n++) {
    const t = Pose.handTargets(n);
    assert.equal(t.length, 5);
    assert.ok(t.every((x) => x >= 1 && x <= 2 * n), `${n}: ${t}`);
    assert.deepEqual(t, Pose.handTargets(n));
  }
  assert.deepEqual(Pose.handTargets(4), [4, 8, 3, 5, 6]);
});

test('movement is measured in body sizes for the player who moved most', () => {
  const a = body('down', 'down', 0.3);
  const b = body('down', 'down', 0.7);
  assert.equal(Pose.movement([a, b], [a, b]), 0);
  const k = Pose.size(b);
  const moved = Pose.movement([a, b], [a, shift(b, 0.5 * k)]);
  assert.ok(Math.abs(moved - 0.5) < 0.01, `moved ${moved}`);
  // one arm going up moves the wrist a long way
  assert.ok(Pose.movement([a, b], [a, body('down', 'up', 0.7)]) > 1);
});

test('speed tracks the body crossing the room, not waving arms', () => {
  const a = body('down', 'down', 0.4);
  const k = Pose.size(a);
  assert.ok(Math.abs(Pose.speed([a], [shift(a, 0.4 * k)], 0.2) - 2) < 0.05);
  assert.equal(Pose.speed([a], [body('up', 'up', 0.4)], 0.5), 0);
  assert.equal(Pose.speed([a], [a], 0), 0);
});

test('players who appear or leave are not paired with someone else', () => {
  const a = body('down', 'down', 0.2);
  const b = body('down', 'down', 0.8);
  assert.equal(Pose.pairUp([a], [b]).length, 0);
  assert.equal(Pose.movement([a], [a, b]), 0);
});

test('hands resting on the head are not counted as hands up', () => {
  assert.equal(Pose.handsUp(body('head', 'head')), 0);
  assert.equal(Pose.matches(body('head', 'head'), 'hands-on-head'), true);
});

test('stillness is judged per player: one mover in a group of 4 leaves 3 of 4 still', () => {
  const group = [0.2, 0.4, 0.6, 0.8].map((x) => body('down', 'down', x));
  assert.equal(Pose.stillShare(group, group, 0.15), 1);
  const k = Pose.size(group[0]);
  const moved = group.map((p, i) => (i === 1 ? shift(p, 0.3 * k) : p));
  assert.equal(Pose.stillShare(group, moved, 0.15), 0.75);
  // tracking errors smaller than the limit don't count
  const jitter = group.map((p) => shift(p, 0.05 * k, 0.03 * k));
  assert.equal(Pose.stillShare(group, jitter, 0.15), 1);
  // a big step is paired with the same player, so it counts as moving
  assert.equal(Pose.stillShare([group[0]], [shift(group[0], 0.65 * k)], 0.15), 0);
  assert.equal(Pose.stillShare([], [], 0.15), 1);
});

test('everyone holding both hands up starts the game, and only then', () => {
  assert.equal(Pose.allHandsUp([body('up', 'up', 0.3), body('up', 'up', 0.7)]), true);
  assert.equal(Pose.allHandsUp([body('up', 'up', 0.3), body('down', 'up', 0.7)]), false);
  assert.equal(Pose.allHandsUp([]), false);
});

test('name tags stay with each player when they swap places', () => {
  const a = body('down', 'down', 0.3);
  const b = body('down', 'down', 0.7);
  let state = Pose.track(null, [a, b], 0);
  assert.deepEqual(state.players.map((p) => p.id), [1, 2]);
  // they walk past each other in small steps
  for (let s = 1; s <= 10; s++) {
    const t = s / 10;
    state = Pose.track(state, [body('down', 'down', 0.3 + 0.4 * t), body('down', 'down', 0.7 - 0.4 * t)], s * 66);
  }
  assert.equal(Pose.players(state.players)[0].id, 2, 'the player now on the left kept tag 2');
  // a newcomer gets the lowest free tag
  state = Pose.track(state, [...Pose.players(state.players), body('down', 'down', 0.92)], 800);
  assert.deepEqual(state.players.map((p) => p.id).sort(), [1, 2, 3]);
});

test('a player missed for a moment gets their own tag back, and nobody else takes it', () => {
  const p1 = body('down', 'down', 0.2);
  const p2 = body('down', 'down', 0.5);
  const p3 = body('down', 'down', 0.8);
  let state = Pose.track(null, [p1, p2, p3], 0);
  assert.deepEqual(state.players.map((p) => p.id), [1, 2, 3]);
  state = Pose.track(state, [p2, p3], 66); // P1 leaves
  state = Pose.track(state, [p2], 132); // P3 is missed for a moment
  assert.deepEqual(state.lost.map((p) => p.id).sort(), [1, 3]);
  state = Pose.track(state, [p2, p3], 198); // P3 is back
  assert.equal(state.players.find((p) => Pose.centre(p).x > 0.9).id, 3, 'P3 is P3 again, not P1');
  // after a second, a lost tag is free again
  state = Pose.track(state, [p2, p3], 1500);
  state = Pose.track(state, [p2, p3, body('down', 'down', 0.08)], 1566);
  assert.deepEqual(state.players.map((p) => p.id).sort(), [1, 2, 3]);
});

test('smoothing halves a sudden jump in one frame', () => {
  const a = body('down', 'down', 0.5);
  const first = Pose.track(null, [a], 0);
  const k = Pose.size(a);
  const next = Pose.track(first, [shift(a, 0.2 * k)], 66);
  const moved = next.players[0][Pose.P.NOSE].x - a[Pose.P.NOSE].x;
  assert.ok(Math.abs(moved - 0.1 * k) < 1e-9);
});
