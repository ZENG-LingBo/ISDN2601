// Freeze: practice players, for trying the games without a camera.
// Draws a pretend room with simple pretend people into a pixel buffer, and gives the game the
// same things the body-tracking model gives it for a real camera: a mask of where people are,
// and each player's body points. So every game is scored the same way as with a camera.
// The practice players aren't very good at the games, which is honest: real groups do better.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'), require('./pose.js'));
  else root.Practice = factory(root.Shapes, root.Pose);
})(typeof self !== 'undefined' ? self : this, function (Shapes, Pose) {
  'use strict';

  const SHIRTS = [[196, 58, 52], [38, 86, 160], [36, 126, 78], [214, 164, 36], [116, 58, 138], [32, 32, 36], [226, 116, 164], [24, 140, 150]];
  const SKIN = [[224, 172, 138], [198, 134, 96], [141, 85, 54], [238, 198, 166], [170, 112, 80]];
  const STAND_TOP = 0.2; // where a standing person's head starts in Shapes rounds
  const ROW_TOP = 0.32; // in the other games, players stand a bit further back so raised arms fit
  const HIP_Y = 0.78;
  const FIDGET_ROUND = 2; // in this round one practice player keeps moving after Freeze

  // Arms for each pose card: [left, right], the player's own left and right.
  const CARD_ARMS = {
    'arms-up': ['up', 'up'],
    'hands-on-shoulders': ['shoulder', 'shoulder'],
    'right-up': ['down', 'up'],
    'left-up': ['up', 'down'],
    'hands-on-head': ['head', 'head'],
  };

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function drawRoom(w, h) {
    const buf = new Uint8ClampedArray(w * h * 4);
    const fill = (x0, y0, x1, y1, c) => {
      for (let y = Math.max(0, Math.round(y0 * h)); y < Math.min(h, Math.round(y1 * h)); y++) {
        for (let x = Math.max(0, Math.round(x0 * w)); x < Math.min(w, Math.round(x1 * w)); x++) {
          const i = (y * w + x) * 4;
          buf[i] = c[0];
          buf[i + 1] = c[1];
          buf[i + 2] = c[2];
          buf[i + 3] = 255;
        }
      }
    };
    for (let y = 0; y < h; y++) {
      const k = y / h;
      const c = k < 0.8 ? [206 - 26 * k, 200 - 24 * k, 190 - 22 * k] : [146, 124, 102];
      fill(0, y / h, 1, (y + 1) / h, c);
    }
    fill(0.04, 0.22, 0.16, 0.8, [150, 128, 104]); // door
    fill(0.72, 0.12, 0.86, 0.3, [84, 104, 138]); // picture
    fill(0.73, 0.13, 0.85, 0.29, [120, 148, 176]);
    fill(0, 0.78, 1, 0.8, [118, 100, 84]); // skirting
    return buf;
  }

  // Where the practice players stand for a shape. Their feet go where the shape meets the bottom
  // of the picture. Each one is as tall as the part of the shape above their feet, and they hold
  // their arms out where the shape is wider than they are. x values are shares of the width.
  function layout(shape, n) {
    const W = 120;
    const H = 90;
    const grid = Shapes.rasterize(shape, W, H);
    const at = (x, y) => x >= 0 && x < W && y >= 0 && y < H && grid[y * W + x] === 1;
    const feet = [];
    for (let x = 0; x < W; x++) if (at(x, H - 1)) feet.push(x);
    const width = Math.max(0.09, Math.min(0.15, (0.92 * feet.length) / W / n));
    const spots = [];
    for (let i = 0; i < n; i++) {
      const cx = (feet[Math.min(feet.length - 1, Math.floor(((i + 0.5) / n) * feet.length))] + 0.5) / W;
      let top = H - 1;
      const c = Math.floor(cx * W);
      while (at(c, top - 1)) top--;
      spots.push({ cx, top: Math.min(top / H, 0.75), width, bar: null });
    }
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      const head = Math.max(s.top, STAND_TOP);
      const sy = Math.min(H - 1, Math.floor((head + 0.12) * H));
      const c = Math.floor(s.cx * W);
      if (!at(c, sy)) continue;
      let l = c;
      let r = c;
      while (at(l - 1, sy)) l--;
      while (at(r + 1, sy)) r++;
      const left = Math.max(l / W, i > 0 ? (spots[i - 1].cx + s.cx) / 2 : 0, s.cx - 0.22);
      const right = Math.min((r + 1) / W, i < n - 1 ? (spots[i + 1].cx + s.cx) / 2 : 1, s.cx + 0.22);
      if (right - left > s.width + 0.03) s.bar = { y: head + 0.08, left, right };
    }
    return spots;
  }

  function createScene(opts) {
    const o = opts || {};
    const w = o.w || 320;
    const h = o.h || 240;
    const n = o.players || 4;
    const rand = rng(o.seed || 7);
    const players = [];
    for (let i = 0; i < n; i++) {
      players.push({
        shirt: SHIRTS[i % SHIRTS.length],
        skin: SKIN[Math.floor(rand() * SKIN.length)],
        phase: rand() * Math.PI * 2,
        delay: rand(),
        idle: { cx: 0.1 + (0.8 * (i + 0.5)) / n, top: ROW_TOP + rand() * 0.05, width: Math.min(0.13, 0.7 / n), bar: null },
      });
    }
    return {
      w,
      h,
      aspect: w / h,
      n,
      room: drawRoom(w, h),
      buf: new Uint8ClampedArray(w * h * 4),
      mask: new Uint8Array(w * h),
      noise: rng((o.seed || 7) + 99),
      players,
      layouts: {},
    };
  }

  function mix(a, b, k) {
    return a + (b - a) * k;
  }

  function ease(k) {
    const x = Math.max(0, Math.min(1, k));
    return x * x * (3 - 2 * x);
  }

  // The arms each player ends up with in a Hands up or Copy the pose round. Practice players
  // make a mistake in some rounds, so the scores show what a mistake costs.
  function plannedArms(scene, round, roundIndex) {
    const n = scene.n;
    if (round.type === 'hands') {
      let want = Math.min(round.target, 2 * n);
      if (roundIndex % 2 === 1) want = want === 2 * n ? want - 1 : want + 1; // one hand off
      return scene.players.map(() => {
        if (want >= 2) {
          want -= 2;
          return ['up', 'up'];
        }
        if (want === 1) {
          want = 0;
          return ['down', 'up'];
        }
        return ['down', 'down'];
      });
    }
    const arms = CARD_ARMS[round.card] || ['down', 'down'];
    return scene.players.map((p, i) => (roundIndex % 3 === 2 && i === n - 1 ? ['down', 'down'] : arms.slice()));
  }

  // Each player's figure right now. state: { present, round, roundIndex, phase, elapsed, fillMs, t }.
  function figures(scene, state) {
    if (!state.present) return [];
    const round = state.round || null;
    const isShape = round && round.type === 'shape';
    const target = isShape ? (scene.layouts[round.shape.id] ||= layout(round.shape, scene.n)) : null;
    const arms = round && !isShape ? plannedArms(scene, round, state.roundIndex || 0) : null;
    return scene.players.map((p, i) => {
      let spot = p.idle;
      let left = 'down';
      let right = 'down';
      if (isShape && state.phase === 'fill') {
        const k = ease(state.elapsed / (state.fillMs * 0.65));
        const t = target[i];
        spot = { cx: mix(p.idle.cx, t.cx, k), top: mix(p.idle.top, t.top, k), width: mix(p.idle.width, t.width, k), bar: k > 0.9 ? t.bar : null };
      } else if (isShape && (state.phase === 'freeze' || state.phase === 'result')) {
        spot = target[i];
      }
      if (isShape) {
        if (spot.bar) left = right = 'out';
        else if (spot.top < STAND_TOP) left = right = 'up';
      } else if (arms) {
        const ready = state.phase !== 'fill' || state.elapsed > state.fillMs * (0.25 + 0.4 * p.delay);
        if (ready) [left, right] = arms[i];
      }
      let dx = 0.004 * Math.sin(state.t / 400 + p.phase); // small sway
      if (state.phase === 'freeze') {
        dx = 0;
        if (state.roundIndex === FIDGET_ROUND && i === 0 && state.elapsed < 1800) dx = 0.05 * Math.sin(state.t / 120);
      }
      return { cx: spot.cx + dx, top: spot.top, width: spot.width, bar: spot.bar, shapeRound: !!isShape, left, right, shirt: p.shirt, skin: p.skin };
    });
  }

  // Body points for a figure, in the same form as the body-tracking model gives:
  // x from 0 to the picture's width ÷ height, y from 0 to 1, player's left on the screen's left.
  function landmarks(scene, f) {
    const a = scene.aspect;
    const pts = [];
    for (let i = 0; i < 33; i++) pts.push({ x: 0, y: 0, v: 0 });
    const half = f.width / 2;
    const R = half * 0.62 * a; // head radius
    const headTop = f.shapeRound ? Math.max(f.top, STAND_TOP) : f.top;
    const cx = f.cx * a;
    const nose = { x: cx, y: headTop + R };
    const sy = headTop + 2 * R + 0.02;
    const k = HIP_Y - sy;
    const set = (i, x, y) => {
      const inside = x >= 0 && x <= a && y >= 0 && y <= 1;
      pts[i] = { x, y, v: inside ? 0.99 : 0.2 };
    };
    set(Pose.P.NOSE, nose.x, nose.y);
    const sides = [
      ['left', -1, Pose.P.L_SHOULDER, Pose.P.L_ELBOW, Pose.P.L_WRIST, Pose.P.L_HIP],
      ['right', 1, Pose.P.R_SHOULDER, Pose.P.R_ELBOW, Pose.P.R_WRIST, Pose.P.R_HIP],
    ];
    for (const [side, s, S, E, Wr, Hp] of sides) {
      const sx = cx + s * half * 0.85 * a;
      set(S, sx, sy);
      set(Hp, cx + s * half * 0.55 * a, HIP_Y);
      const state = f[side];
      if (state === 'up') {
        set(E, sx + s * 0.08 * k, sy - 0.55 * k);
        set(Wr, sx + s * 0.1 * k, sy - 1.1 * k);
      } else if (state === 'out') {
        set(E, sx + s * 0.55 * k, sy - 0.02 * k);
        set(Wr, sx + s * 1.1 * k, sy - 0.04 * k);
      } else if (state === 'shoulder') {
        set(E, sx + s * 0.3 * k, sy + 0.35 * k);
        set(Wr, sx + s * 0.04 * k, sy + 0.02 * k);
      } else if (state === 'head') {
        set(E, sx + s * 0.45 * k, sy - 0.4 * k);
        set(Wr, nose.x + s * 0.18 * k, nose.y - 0.2 * k);
      } else {
        set(E, sx + s * 0.06 * k, sy + 0.55 * k);
        set(Wr, sx + s * 0.08 * k, sy + 1.05 * k);
      }
    }
    return pts;
  }

  // Draw the room and the people. Returns { rgba, mask, poses }: the picture (scene.w × scene.h),
  // a mask of the same size (1 where a person is), and each player's body points.
  function frame(scene, state) {
    const { w, h, room, buf, mask, noise } = scene;
    buf.set(room);
    mask.fill(0);
    const a = scene.aspect;
    const px = (c, i) => {
      buf[i * 4] = c[0];
      buf[i * 4 + 1] = c[1];
      buf[i * 4 + 2] = c[2];
      mask[i] = 1;
    };
    // x0, x1 as shares of the width; y0, y1 as shares of the height
    const box = (x0, y0, x1, y1, c) => {
      for (let y = Math.max(0, Math.round(y0 * h)); y < Math.min(h, Math.round(y1 * h)); y++) {
        for (let x = Math.max(0, Math.round(x0 * w)); x < Math.min(w, Math.round(x1 * w)); x++) px(c, y * w + x);
      }
    };
    // centre and radius in body-point units (x up to the aspect ratio, y up to 1)
    const disc = (cx, cy, r, c) => {
      const X = cx * h;
      const Y = cy * h;
      const Rp = r * h;
      for (let y = Math.max(0, Math.floor(Y - Rp)); y < Math.min(h, Math.ceil(Y + Rp)); y++) {
        for (let x = Math.max(0, Math.floor(X - Rp)); x < Math.min(w, Math.ceil(X + Rp)); x++) {
          const dx = x + 0.5 - X;
          const dy = y + 0.5 - Y;
          if (dx * dx + dy * dy <= Rp * Rp) px(c, y * w + x);
        }
      }
    };
    const limb = (p, q, r, c) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) * h));
      for (let s = 0; s <= steps; s++) disc(mix(p.x, q.x, s / steps), mix(p.y, q.y, s / steps), r, c);
    };
    const poses = [];
    for (const f of figures(scene, state)) {
      const pts = landmarks(scene, f);
      poses.push(pts);
      const half = f.width / 2;
      const nose = pts[Pose.P.NOSE];
      const R = half * 0.62 * a;
      const sy = pts[Pose.P.L_SHOULDER].y;
      if (f.shapeRound) {
        // Shapes rounds: block arms, as wide as the shape needs.
        if (f.top < STAND_TOP) box(f.cx - half * 0.55, f.top, f.cx + half * 0.55, nose.y, f.shirt);
        if (f.bar) box(f.bar.left, f.bar.y, f.bar.right, f.bar.y + 0.09, f.shirt);
      } else {
        for (const [S, E, Wr] of [[Pose.P.L_SHOULDER, Pose.P.L_ELBOW, Pose.P.L_WRIST], [Pose.P.R_SHOULDER, Pose.P.R_ELBOW, Pose.P.R_WRIST]]) {
          limb(pts[S], pts[E], 0.03, f.shirt);
          limb(pts[E], pts[Wr], 0.026, f.shirt);
          disc(pts[Wr].x, pts[Wr].y, 0.03, f.skin);
        }
      }
      disc(nose.x, nose.y, R, f.skin);
      box(f.cx - half, sy - 0.02, f.cx + half, 0.8, f.shirt);
      box(f.cx - half * 0.85, 0.8, f.cx + half * 0.85, 1, [52, 54, 66]); // legs
    }
    for (let i = 0; i < buf.length; i += 4) {
      const d = ((noise() * 7) | 0) - 3; // camera noise
      buf[i] += d;
      buf[i + 1] += d;
      buf[i + 2] += d;
    }
    return { rgba: buf, mask, poses };
  }

  return { createScene, frame, layout, figures, landmarks, plannedArms, FIDGET_ROUND, CARD_ARMS };
});
