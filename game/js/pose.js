// Freeze: reading body poses. Pure functions, so they run in the browser and in the tests.
//
// A pose is an array of body points from the body-tracking model (MediaPipe Pose, 33 points),
// each { x, y, v }: x and y from 0 to 1 across the mirrored picture (x = 0 is the left of the
// screen, y = 0 the top), and v how sure the model is that the point is visible (0 to 1).
// Left and right are the player's own left and right. In the mirrored picture, a player's
// right hand shows on the right of the screen.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pose = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const P = { NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24 };
  const KEY = [P.NOSE, P.L_SHOULDER, P.R_SHOULDER, P.L_ELBOW, P.R_ELBOW, P.L_WRIST, P.R_WRIST, P.L_HIP, P.R_HIP];
  const VISIBLE = 0.5;

  function seen(p, i) {
    return !!p[i] && (p[i].v ?? 1) >= VISIBLE;
  }

  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // A pose counts as a player when both shoulders are visible.
  function isPlayer(p) {
    return !!p && seen(p, P.L_SHOULDER) && seen(p, P.R_SHOULDER);
  }

  // The size of a body in the picture: shoulders to hips, or 1.6 shoulder widths if the hips
  // aren't visible. Movement and arm positions are measured in this unit, so players near the
  // camera and far from it are judged the same way.
  function size(p) {
    const sm = mid(p[P.L_SHOULDER], p[P.R_SHOULDER]);
    if (seen(p, P.L_HIP) && seen(p, P.R_HIP)) return Math.max(0.03, dist(sm, mid(p[P.L_HIP], p[P.R_HIP])));
    return Math.max(0.03, 1.6 * dist(p[P.L_SHOULDER], p[P.R_SHOULDER]));
  }

  function centre(p) {
    return mid(p[P.L_SHOULDER], p[P.R_SHOULDER]);
  }

  // Players, left to right across the screen.
  function players(poses) {
    return (poses || []).filter(isPlayer).sort((a, b) => centre(a).x - centre(b).x);
  }

  // Where the top of the head is roughly: the nose if visible, else above the shoulders.
  function headY(p) {
    if (seen(p, P.NOSE)) return p[P.NOSE].y;
    return centre(p).y - 0.45 * size(p);
  }

  // A hand is up when the wrist is high above the head: at least 0.4 of a body size above the
  // nose. A hand resting on the head doesn't count.
  function handUp(p, side) {
    return armHigh(p, side);
  }

  function handsUp(p) {
    return (handUp(p, 'left') ? 1 : 0) + (handUp(p, 'right') ? 1 : 0);
  }

  // A hand on its own shoulder: the wrist close to the shoulder on the same side, below the
  // nose. The hands stay in view, and it needs no more room than standing.
  function onShoulder(p, side) {
    const s = side === 'left' ? P.L_SHOULDER : P.R_SHOULDER;
    const w = side === 'left' ? P.L_WRIST : P.R_WRIST;
    if (!seen(p, w)) return false;
    const k = size(p);
    return Math.hypot(p[w].x - p[s].x, p[w].y - p[s].y) < 0.35 * k && p[w].y > headY(p) + 0.05 * k;
  }

  function onHead(p, side) {
    const w = side === 'left' ? P.L_WRIST : P.R_WRIST;
    if (!seen(p, w)) return false;
    const k = size(p);
    const top = headY(p);
    const c = seen(p, P.NOSE) ? p[P.NOSE].x : centre(p).x;
    return p[w].y < top + 0.15 * k && p[w].y > top - 0.55 * k && Math.abs(p[w].x - c) < 0.55 * k;
  }

  function armHigh(p, side) {
    const w = side === 'left' ? P.L_WRIST : P.R_WRIST;
    return seen(p, w) && p[w].y < headY(p) - 0.4 * size(p);
  }

  function armDown(p, side) {
    const s = side === 'left' ? P.L_SHOULDER : P.R_SHOULDER;
    const w = side === 'left' ? P.L_WRIST : P.R_WRIST;
    return !seen(p, w) || p[w].y > p[s].y + 0.2 * size(p);
  }

  // The poses for "Copy the pose". Each has a plain name and a test.
  const POSES = {
    'arms-up': { name: 'Both arms up', test: (p) => armHigh(p, 'left') && armHigh(p, 'right') },
    'hands-on-shoulders': { name: 'Hands on your shoulders', test: (p) => onShoulder(p, 'left') && onShoulder(p, 'right') },
    'right-up': { name: 'Right hand up', test: (p) => armHigh(p, 'right') && armDown(p, 'left') },
    'hands-on-head': { name: 'Hands on your head', test: (p) => onHead(p, 'left') && onHead(p, 'right') },
    'left-up': { name: 'Left hand up', test: (p) => armHigh(p, 'left') && armDown(p, 'right') },
  };
  // Every pose fits in the space a standing person takes, so big groups don't need more room.
  const POSE_ORDER = ['arms-up', 'hands-on-shoulders', 'right-up', 'hands-on-head', 'left-up'];

  function matches(p, id) {
    const card = POSES[id];
    return !!card && isPlayer(p) && card.test(p);
  }

  // The 5 targets for "Hands up", for n players. Every laptop with the same number of players
  // gets the same targets. They stay between 1 and 2n, so they can always be met.
  function handTargets(n) {
    const m = Math.max(1, n);
    const clamp = (t) => Math.max(1, Math.min(2 * m, t));
    return [clamp(m), clamp(2 * m), clamp(m - 1), clamp(m + 1), clamp(Math.ceil(1.5 * m))];
  }

  // Pair players in `prev` with players in `cur`, closest pairs first, by the middle of the
  // shoulders. `where` gives the position to use for a player in `prev`, for example where they
  // are expected to be now. Pairs further apart than 1.2 body sizes are left unpaired.
  function pairUp(prev, cur, where) {
    const at = where || centre;
    const cand = [];
    prev.forEach((a, i) => {
      const pa = at(a);
      cur.forEach((b, j) => {
        const d = dist(pa, centre(b));
        if (d < 1.2 * size(b)) cand.push([d, i, j]);
      });
    });
    cand.sort((x, y) => x[0] - y[0]);
    const usedA = new Set();
    const usedB = new Set();
    const pairs = [];
    for (const [, i, j] of cand) {
      if (usedA.has(i) || usedB.has(j)) continue;
      usedA.add(i);
      usedB.add(j);
      pairs.push([prev[i], cur[j]]);
    }
    return pairs;
  }

  // How far the player who moved most has moved, in body sizes: the largest shift of any
  // visible key point (head, shoulders, elbows, wrists, hips) between two moments.
  function movement(prev, cur) {
    let worst = 0;
    for (const [a, b] of pairUp(players(prev), players(cur))) {
      const k = size(b);
      for (const i of KEY) {
        if (seen(a, i) && seen(b, i)) worst = Math.max(worst, dist(a[i], b[i]) / k);
      }
    }
    return worst;
  }

  // How fast the fastest player is moving across the room, in body sizes per second, from the
  // middle of the shoulders. Waving arms doesn't count; walking or running does.
  function speed(prev, cur, seconds) {
    if (!(seconds > 0)) return 0;
    let worst = 0;
    for (const [a, b] of pairUp(players(prev), players(cur))) {
      worst = Math.max(worst, dist(centre(a), centre(b)) / size(b) / seconds);
    }
    return worst;
  }

  // How many of the players moved less than `limit` body sizes, as a share from 0 to 1.
  // Judging each player on their own is fairer to big groups than "did anyone move": with
  // 6 players, small tracking errors would make someone look as if they moved almost every time.
  // A player who can't be paired with a moment ago (stepped away, or the model lost them) counts
  // as moved. Returns 1 when nobody is in view, because nobody moved.
  function stillShare(prev, cur, limit) {
    const now = players(cur);
    if (!now.length) return 1;
    const pairs = pairUp(players(prev), now);
    let still = 0;
    for (const [a, b] of pairs) {
      const k = size(b);
      let worst = 0;
      for (const i of KEY) if (seen(a, i) && seen(b, i)) worst = Math.max(worst, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) / k);
      if (worst < limit) still++;
    }
    return still / now.length;
  }

  // True when every player in view has both hands up. Used to start a game without anyone
  // going to the laptop.
  function allHandsUp(poses) {
    const list = players(poses);
    return list.length > 0 && list.every((p) => handsUp(p) === 2);
  }

  // Smooth body points over a few moments, to calm small tracking errors. `prev` is the last
  // smoothed list. Each player has an `id`, `raw` (where the model last saw them, before
  // smoothing) and `vel` (how far that moved last time). Each player is looked for where
  // they're expected to be now, so two players walking past each other keep their own name
  // tags. New players get the lowest free id from 1.
  function track(prev, cur, keep) {
    const k = keep ?? 0.5;
    const list = players(cur);
    const expected = (a) => {
      const c = a.raw || centre(a);
      return a.vel ? { x: c.x + a.vel.x, y: c.y + a.vel.y } : c;
    };
    const pairs = new Map(pairUp(prev, list, expected).map(([a, b]) => [b, a]));
    const used = new Set();
    const out = list.map((b) => {
      const a = pairs.get(b);
      if (!a) return null;
      used.add(a.id);
      const pts = b.map((q, i) => (a[i] && seen(a, i) && (q.v ?? 1) >= VISIBLE ? { x: a[i].x * k + q.x * (1 - k), y: a[i].y * k + q.y * (1 - k), v: q.v } : q));
      pts.id = a.id;
      const before = a.raw || centre(a);
      pts.raw = centre(b);
      pts.vel = { x: pts.raw.x - before.x, y: pts.raw.y - before.y };
      return pts;
    });
    let next = 1;
    return out.map((p, i) => {
      if (p) return p;
      while (used.has(next)) next++;
      used.add(next);
      const fresh = list[i].slice();
      fresh.id = next;
      fresh.raw = centre(list[i]);
      return fresh;
    });
  }

  return { P, KEY, VISIBLE, POSES, POSE_ORDER, seen, isPlayer, size, centre, players, headY, handUp, handsUp, matches, handTargets, pairUp, movement, speed, stillShare, allHandsUp, track };
});
