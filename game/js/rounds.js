// Freeze: the rules, with no camera or screen code, so the tests can run them.
//
// Every round works the same way: do what the screen says, then freeze.
//   fill    time to do it. Shapes: 8, 10 or 12 seconds, more for bigger groups.
//           Hands up: 6 seconds. Copy the pose: 5 seconds.
//   freeze  3 seconds holding still. The first half second doesn't count, to give people time to stop.
//   result  3.5 seconds showing the points, then the next round.
//
// While frozen, each moment gets a score from 0 to 1:
//   Shapes        how well the group fills the shape (Vision.scoreFit)
//   Hands up      1 for exactly the right number of hands up, 0.5 for one off, else 0
//   Copy the pose the share of players copying the pose
// Points for a round = 100 × the average score × how still the group held: at each moment, the
// share of players who didn't move, averaged. A game is 5 rounds, so 500 at most.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'), require('./pose.js'));
  else root.Rounds = factory(root.Shapes, root.Pose);
})(typeof self !== 'undefined' ? self : this, function (Shapes, Pose) {
  'use strict';

  const TIMES = { freeze: 3000, grace: 500, result: 3500, hands: 6000, pose: 5000 };
  const MOVE_LIMIT = 0.15; // while frozen, a player who moves less than this many body sizes in 0.4 s is still
  const RUSH_LIMIT = 3.5; // moving across the room faster than this many body sizes a second is rushing
  const RUSH_MS = 400; // ...for this long

  const GAMES = {
    shapes: { name: 'Shapes', plan: ['shape', 'shape', 'shape', 'shape', 'shape'] },
    hands: { name: 'Hands up', plan: ['hands', 'hands', 'hands', 'hands', 'hands'] },
    pose: { name: 'Copy the pose', plan: ['pose', 'pose', 'pose', 'pose', 'pose'] },
    mix: { name: 'Mix', plan: ['shape', 'hands', 'pose', 'shape', 'pose'] },
  };

  // The rounds for a game and a number of players. The same game and the same number of
  // players always give the same rounds, so teams on different laptops can compare scores.
  function planRounds(kind, players) {
    const game = GAMES[kind];
    if (!game) throw new Error('Unknown game: ' + kind);
    const size = Shapes.sizeFor(players);
    const shapes = Shapes.roundsFor(size);
    const targets = Pose.handTargets(players);
    const n = { shape: 0, hands: 0, pose: 0 };
    return game.plan.map((type) => {
      const i = n[type]++;
      if (type === 'shape') {
        const s = shapes[i];
        return { type, id: s.id, name: 'Shapes', what: s.name, title: 'Fill the shape', tip: s.tip, shape: s, fillMs: Shapes.SIZES[size].fillSeconds * 1000 };
      }
      if (type === 'hands') {
        const t = targets[i];
        const title = `Show ${t} ${t === 1 ? 'hand' : 'hands'}`;
        return { type, target: t, name: 'Hands up', what: title, title, tip: 'Count together. A hand only counts when it\'s high above your head.', fillMs: TIMES.hands };
      }
      const id = Pose.POSE_ORDER[i];
      return { type, card: id, name: 'Copy the pose', what: Pose.POSES[id].name, title: Pose.POSES[id].name, tip: 'Everyone copies it, then holds still.', fillMs: TIMES.pose };
    });
  }

  function times(game) {
    const k = game.speed;
    const r = game.rounds[game.round];
    return { fill: (r ? r.fillMs : 0) / k, freeze: TIMES.freeze / k, grace: TIMES.grace / k, result: TIMES.result / k };
  }

  function createGame(kind, players, now, opts) {
    const o = opts || {};
    return {
      kind,
      players: Math.max(1, players),
      rounds: planRounds(kind, Math.max(1, players)),
      speed: o.speed || 1,
      round: 0,
      phase: 'fill',
      phaseStart: now,
      paused: null,
      live: blankLive(),
      rushStart: null,
      rushing: false,
      frozen: [],
      results: [],
    };
  }

  function blankLive() {
    return { score: 0, players: 0, filled: 0, outside: 0, hands: 0, matching: 0, target: 0 };
  }

  // The hands target can't be more than the players in view can show.
  function handsTarget(round, players) {
    return Math.max(1, Math.min(round.target, 2 * Math.max(1, players)));
  }

  // The score for one moment, from 0 to 1. m is the latest measurement:
  //   players            how many players Freeze can see
  //   fit, filled, outside   from Vision.scoreFit (Shapes only)
  //   hands              how many hands are up
  //   matching           how many players are copying the pose
  function momentScore(round, m) {
    if (!m || !(m.players > 0)) return 0;
    if (round.type === 'shape') return m.fit || 0;
    if (round.type === 'hands') {
      const off = Math.abs((m.hands || 0) - handsTarget(round, m.players));
      return off === 0 ? 1 : off === 1 ? 0.5 : 0;
    }
    return Math.min(1, (m.matching || 0) / m.players);
  }

  function elapsed(game, now) {
    return (game.paused ?? now) - game.phaseStart;
  }

  function remaining(game, now) {
    const t = times(game);
    const d = game.phase === 'fill' ? t.fill : game.phase === 'freeze' ? t.freeze : game.phase === 'result' ? t.result : 0;
    return Math.max(0, d - elapsed(game, now));
  }

  function setPhase(game, phase, now) {
    game.phase = phase;
    game.phaseStart = now;
  }

  function mostCommon(values) {
    const count = new Map();
    let best = 0;
    let bestN = -1;
    for (const v of values) {
      const c = (count.get(v) || 0) + 1;
      count.set(v, c);
      if (c > bestN) {
        bestN = c;
        best = v;
      }
    }
    return best;
  }

  function finishRound(game) {
    const f = game.frozen;
    const n = f.length;
    const avg = (k) => (n ? f.reduce((s, x) => s + x[k], 0) / n : 0);
    const still = n ? f.reduce((s, x) => s + x.still, 0) / n : 0;
    const score = avg('score');
    const round = game.rounds[game.round];
    const result = {
      type: round.type,
      name: round.name,
      what: round.what,
      title: round.title,
      score,
      still,
      points: Math.round(100 * score * still),
      filled: avg('filled'),
      outside: avg('outside'),
      matched: avg('matchShare'),
      hands: n ? mostCommon(f.map((x) => x.hands)) : 0,
      target: n ? mostCommon(f.map((x) => x.target)) : round.target || 0,
    };
    game.results.push(result);
    return result;
  }

  // Move the game on. m is the latest measurement (see momentScore), plus:
  //   still   the share of players who held still over the last 0.4 s (Pose.stillShare), or
  //   motion  how far the player who moved most has moved, in body sizes, if still is missing
  //   rush    how fast the fastest player is crossing the room, in body sizes a second
  // or null if there isn't a measurement yet. Returns a list of things that happened.
  function step(game, now, m) {
    const events = [];
    if (game.paused !== null || game.phase === 'done') return events;
    const t = times(game);
    const e = now - game.phaseStart;
    const round = game.rounds[game.round];
    if (m && (game.phase === 'fill' || game.phase === 'freeze')) {
      const target = round.type === 'hands' ? handsTarget(round, m.players) : 0;
      game.live = {
        score: momentScore(round, m),
        players: m.players || 0,
        filled: m.filled || 0,
        outside: m.outside || 0,
        hands: m.hands || 0,
        matching: m.matching || 0,
        target,
      };
    }
    if (game.phase === 'fill') {
      if (m) {
        if ((m.rush || 0) > RUSH_LIMIT) {
          if (game.rushStart === null) game.rushStart = now;
          if (now - game.rushStart >= RUSH_MS / game.speed && !game.rushing) {
            game.rushing = true;
            events.push('rushing');
          }
        } else {
          game.rushStart = null;
          game.rushing = false;
        }
      }
      if (e >= t.fill) {
        setPhase(game, 'freeze', now);
        game.frozen = [];
        game.rushing = false;
        game.rushStart = null;
        events.push('freeze');
      }
    } else if (game.phase === 'freeze') {
      if (m && e >= t.grace) {
        const L = game.live;
        game.frozen.push({
          score: L.score,
          still: m.still ?? ((m.motion || 0) < MOVE_LIMIT ? 1 : 0),
          filled: L.filled,
          outside: L.outside,
          hands: L.hands,
          target: L.target,
          matchShare: L.players ? Math.min(1, L.matching / L.players) : 0,
        });
      }
      if (e >= t.freeze) {
        finishRound(game);
        setPhase(game, 'result', now);
        events.push('result');
      }
    } else if (game.phase === 'result') {
      if (e >= t.result) {
        if (game.round + 1 >= game.rounds.length) {
          setPhase(game, 'done', now);
          events.push('done');
        } else {
          game.round++;
          game.live = blankLive();
          setPhase(game, 'fill', now);
          events.push('next');
        }
      }
    }
    return events;
  }

  function pause(game, now) {
    if (game.paused === null && game.phase !== 'done') game.paused = now;
  }

  // Carry on after a pause. A pause during Freeze starts the 3 seconds again, with a new
  // half-second to get back into position, because people move while the game is paused.
  function resume(game, now) {
    if (game.paused === null) return;
    if (game.phase === 'freeze') {
      game.phaseStart = now;
      game.frozen = [];
    } else {
      game.phaseStart += now - game.paused;
    }
    game.rushStart = null;
    game.paused = null;
  }

  function total(game) {
    return game.results.reduce((s, r) => s + r.points, 0);
  }

  function maxTotal(game) {
    return 100 * game.rounds.length;
  }

  return { TIMES, MOVE_LIMIT, RUSH_LIMIT, GAMES, planRounds, handsTarget, momentScore, createGame, step, pause, resume, elapsed, remaining, times, total, maxTotal };
});
