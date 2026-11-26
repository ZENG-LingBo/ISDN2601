// Freeze: practice players, for trying the game without a camera.
// Draws a pretend room with simple pretend people into a pixel buffer. The game then runs the
// same vision code on it as on a real camera, so the scores are worked out the same way.
// The pretend people aren't very good at the game, which is honest: real groups do better.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'));
  else root.Practice = factory(root.Shapes);
})(typeof self !== 'undefined' ? self : this, function (Shapes) {
  'use strict';

  const SHIRTS = [[196, 58, 52], [38, 86, 160], [36, 126, 78], [214, 164, 36], [116, 58, 138], [32, 32, 36], [226, 116, 164], [24, 140, 150]];
  const SKIN = [[224, 172, 138], [198, 134, 96], [141, 85, 54], [238, 198, 166], [170, 112, 80]];
  const STAND_TOP = 0.2; // where a standing person's head starts
  const FIDGET_ROUND = 2; // in this round one pretend person keeps moving after Freeze

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

  // Where the pretend people stand for a shape. Their feet go where the shape meets the bottom
  // of the picture. Each one is as tall as the part of the shape above their feet, and they hold
  // their arms out where the shape is wider than they are.
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
      // Climb up from the feet while still inside the shape.
      let top = H - 1;
      const c = Math.floor(cx * W);
      while (at(c, top - 1)) top--;
      spots.push({ cx, top: Math.min(top / H, 0.75), width, arms: null });
    }
    // Arms out along the shape at shoulder height, but never past the middle to the next person.
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
      if (right - left > s.width + 0.03) s.arms = { y: head + 0.08, left, right };
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
        idle: { cx: (i + 0.5) / n, top: STAND_TOP + rand() * 0.06, width: Math.min(0.13, 0.8 / n), arms: null },
      });
    }
    return { w, h, n, room: drawRoom(w, h), buf: new Uint8ClampedArray(w * h * 4), noise: rng((o.seed || 7) + 99), players, layouts: {} };
  }

  function mix(a, b, k) {
    return a + (b - a) * k;
  }

  function ease(k) {
    const x = Math.max(0, Math.min(1, k));
    return x * x * (3 - 2 * x);
  }

  // Where each person is now. state: { present, shape, phase, elapsed, fillMs, round, t }.
  function positions(scene, state) {
    if (!state.present) return [];
    const target = state.shape ? (scene.layouts[state.shape.id] ||= layout(state.shape, scene.n)) : null;
    return scene.players.map((p, i) => {
      let spot = p.idle;
      if (target && state.phase === 'fill') {
        const k = ease(state.elapsed / (state.fillMs * 0.65));
        const t = target[i];
        spot = { cx: mix(p.idle.cx, t.cx, k), top: mix(p.idle.top, t.top, k), width: mix(p.idle.width, t.width, k), arms: k > 0.9 ? t.arms : null };
      } else if (target && (state.phase === 'freeze' || state.phase === 'result')) {
        spot = target[i];
      }
      let dx = 0.004 * Math.sin(state.t / 400 + p.phase); // small sway
      if (state.phase === 'freeze') {
        dx = 0;
        if (state.round === FIDGET_ROUND && i === 0 && state.elapsed < 1800) dx = 0.04 * Math.sin(state.t / 200);
      }
      return Object.assign({}, spot, { cx: spot.cx + dx, shirt: p.shirt, skin: p.skin });
    });
  }

  // Draw the room and the people into scene.buf (RGBA, scene.w × scene.h) and return it.
  function frame(scene, state) {
    const { w, h, room, buf, noise } = scene;
    buf.set(room);
    const box = (x0, y0, x1, y1, c) => {
      const ya = Math.max(0, Math.round(y0 * h));
      const yb = Math.min(h, Math.round(y1 * h));
      const xa = Math.max(0, Math.round(x0 * w));
      const xb = Math.min(w, Math.round(x1 * w));
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const i = (y * w + x) * 4;
          buf[i] = c[0];
          buf[i + 1] = c[1];
          buf[i + 2] = c[2];
        }
      }
    };
    const disc = (cx, cy, r, c) => {
      const R = r * w;
      for (let y = Math.max(0, Math.floor(cy * h - R)); y < Math.min(h, Math.ceil(cy * h + R)); y++) {
        for (let x = Math.max(0, Math.floor(cx * w - R)); x < Math.min(w, Math.ceil(cx * w + R)); x++) {
          const dx = x + 0.5 - cx * w;
          const dy = y + 0.5 - cy * h;
          if (dx * dx + dy * dy <= R * R) {
            const i = (y * w + x) * 4;
            buf[i] = c[0];
            buf[i + 1] = c[1];
            buf[i + 2] = c[2];
          }
        }
      }
    };
    for (const p of positions(scene, state)) {
      const half = p.width / 2;
      const head = Math.max(p.top, STAND_TOP);
      const r = half * 0.62; // head radius, as a share of the picture's width
      const rh = (r * w) / h; // the same radius as a share of the height
      if (p.top < STAND_TOP) box(p.cx - half * 0.55, p.top, p.cx + half * 0.55, head + rh, p.shirt); // arms up
      if (p.arms) box(p.arms.left, p.arms.y, p.arms.right, p.arms.y + 0.09, p.shirt); // arms out
      disc(p.cx, head + rh, r, p.skin);
      box(p.cx - half, head + 2 * rh, p.cx + half, 0.8, p.shirt);
      box(p.cx - half * 0.85, 0.8, p.cx + half * 0.85, 1, [52, 54, 66]); // legs
    }
    for (let i = 0; i < buf.length; i += 4) {
      const d = ((noise() * 7) | 0) - 3; // camera noise
      buf[i] += d;
      buf[i + 1] += d;
      buf[i + 2] += d;
    }
    return buf;
  }

  return { createScene, frame, layout, positions, FIDGET_ROUND };
});
