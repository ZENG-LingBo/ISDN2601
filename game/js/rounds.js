// Freeze: the rules of a game, with no camera or screen code, so the tests can run them.
//
// Each round has three parts:
//   fill    8, 10 or 12 seconds to get into the shape, more for bigger groups so nobody has to rush.
//           The screen shows how much is filled.
//   freeze  3 seconds holding still. The first half second doesn't count, to give people time to stop.
//   result  4 seconds showing the points, then the next round.
// Points for a round = 100 × fit × still, where fit is the average fit while frozen and still is
// the share of frozen frames in which the group held still. A game is 5 rounds, so 500 at most.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'));
  else root.Rounds = factory(root.Shapes);
})(typeof self !== 'undefined' ? self : this, function (Shapes) {
  'use strict';

  const TIMES = { freeze: 3000, grace: 500, result: 4000 };
  const MOVE_LIMIT = 0.08; // below this in every strip of the picture, the group counts as still (see Vision.stripMotion)
  const RUSH_LIMIT = 0.45; // above this in any strip of the picture during fill, the screen asks people to slow down
  const RUSH_MS = 400; // ...after this long

  function times(game) {
    const k = game.speed;
    return { fill: game.fillMs / k, freeze: TIMES.freeze / k, grace: TIMES.grace / k, result: TIMES.result / k };
  }

  function createGame(size, now, opts) {
    const o = opts || {};
    return {
      size,
      shapes: Shapes.roundsFor(size),
      speed: o.speed || 1,
      fillMs: Shapes.SIZES[size].fillSeconds * 1000,
      round: 0,
      phase: 'fill',
      phaseStart: now,
      paused: null,
      live: { filled: 0, outside: 0, fit: 0 },
      rushStart: null,
      rushing: false,
      frozen: [],
      results: [],
    };
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

  function finishRound(game) {
    const f = game.frozen;
    const n = f.length;
    const avg = (k) => (n ? f.reduce((s, x) => s + x[k], 0) / n : 0);
    const still = n ? f.filter((x) => x.still).length / n : 0;
    const fit = avg('fit');
    const shape = game.shapes[game.round];
    const result = {
      shape: shape.id,
      name: shape.name,
      filled: avg('filled'),
      outside: avg('outside'),
      fit,
      still,
      points: Math.round(100 * fit * still),
    };
    game.results.push(result);
    return result;
  }

  // Move the game on. m is the latest measurement, or null if there isn't one yet:
  //   filled, outside, fit  from Vision.scoreFit
  //   motion                the largest movement in any part of the picture, used while frozen
  //   rush                  the fastest movement in any part of the picture (Vision.stripMotion),
  //                         used while filling; motion is used if it's missing
  // Returns a list of things that happened, for sounds and the screen.
  function step(game, now, m) {
    const events = [];
    if (game.paused !== null || game.phase === 'done') return events;
    const t = times(game);
    const e = now - game.phaseStart;
    if (game.phase === 'fill') {
      if (m) {
        game.live = { filled: m.filled, outside: m.outside, fit: m.fit };
        if ((m.rush ?? m.motion) > RUSH_LIMIT) {
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
      if (m) {
        game.live = { filled: m.filled, outside: m.outside, fit: m.fit };
        if (e >= t.grace) game.frozen.push({ filled: m.filled, outside: m.outside, fit: m.fit, still: m.motion < MOVE_LIMIT });
      }
      if (e >= t.freeze) {
        finishRound(game);
        setPhase(game, 'result', now);
        events.push('result');
      }
    } else if (game.phase === 'result') {
      if (e >= t.result) {
        if (game.round + 1 >= game.shapes.length) {
          setPhase(game, 'done', now);
          events.push('done');
        } else {
          game.round++;
          game.live = { filled: 0, outside: 0, fit: 0 };
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
    return 100 * game.shapes.length;
  }

  return { TIMES, MOVE_LIMIT, RUSH_LIMIT, createGame, step, pause, resume, elapsed, remaining, times, total, maxTotal };
});
