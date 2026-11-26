// Freeze: the shapes and the rounds.
// Points are [x, y] from 0 to 1 across the mirrored picture: x = 0 is the left of the screen,
// y = 0 is the top. A ring inside another ring would be a hole (none of the shapes use one now,
// because a hole above the floor needs someone to crouch lower than is comfortable). Parts never overlap, so "inside an odd
// number of rings" means "inside the shape", the same rule the canvas uses to draw it.
//
// Every part either touches the bottom of the picture, where people's bodies are, or sits at
// arm height next to a part that does. Bigger groups get wider shapes.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shapes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  const SHAPES = {
    // 1 or 2 people
    door: { name: 'Door', rings: [rect(0.37, 0.14, 0.63, 1)], tip: 'Stand tall in the doorway.' },
    tee: {
      name: 'Letter T',
      rings: [[[0.18, 0.22], [0.82, 0.22], [0.82, 0.4], [0.63, 0.4], [0.63, 1], [0.37, 1], [0.37, 0.4], [0.18, 0.4]]],
      tip: 'Arms out wide.',
    },
    why: {
      name: 'Letter Y',
      rings: [[[0.22, 0.04], [0.36, 0.04], [0.5, 0.3], [0.64, 0.04], [0.78, 0.04], [0.63, 0.44], [0.63, 1], [0.37, 1], [0.37, 0.44]]],
      tip: 'Arms up and out.',
    },
    low: { name: 'Low wall', rings: [rect(0.3, 0.55, 0.7, 1)], tip: 'Crouch down low.' },
    flag: {
      name: 'Flag',
      rings: [[[0.3, 0.1], [0.74, 0.1], [0.74, 0.34], [0.5, 0.34], [0.5, 1], [0.3, 1]]],
      tip: 'One arm out to the side, high up.',
    },
    // 3 to 5 people
    wall: { name: 'Wall', rings: [rect(0.15, 0.3, 0.85, 1)], tip: 'Stand in a line, shoulder to shoulder.' },
    steps: {
      name: 'Steps',
      rings: [[[0.15, 1], [0.15, 0.6], [0.38, 0.6], [0.38, 0.36], [0.62, 0.36], [0.62, 0.1], [0.85, 0.1], [0.85, 1]]],
      tip: 'Low on the left, tall on the right.',
    },
    bridge: {
      name: 'Bridge',
      rings: [[[0.12, 1], [0.12, 0.18], [0.88, 0.18], [0.88, 1], [0.66, 1], [0.66, 0.42], [0.34, 0.42], [0.34, 1]]],
      tip: 'Stand at both sides and join arms over the gap.',
    },
    aitch: {
      name: 'Letter H',
      rings: [[[0.15, 0.14], [0.35, 0.14], [0.35, 0.42], [0.65, 0.42], [0.65, 0.14], [0.85, 0.14], [0.85, 1], [0.65, 1], [0.65, 0.62], [0.35, 0.62], [0.35, 1], [0.15, 1]]],
      tip: 'Two groups, joined by arms in the middle.',
    },
    towers: { name: 'Two towers', rings: [rect(0.15, 0.12, 0.38, 1), rect(0.62, 0.12, 0.85, 1)], tip: 'Split into two groups.' },
    // 6 or more people
    bigwall: { name: 'Big wall', rings: [rect(0.06, 0.32, 0.94, 1)], tip: 'Everyone in one long line.' },
    mountain: { name: 'Mountain', rings: [[[0.05, 1], [0.5, 0.08], [0.95, 1]]], tip: 'Tallest in the middle, lowest at the sides.' },
    valley: {
      name: 'Valley',
      rings: [[[0.05, 1], [0.05, 0.08], [0.5, 0.6], [0.95, 0.08], [0.95, 1]]],
      tip: 'Tallest at the sides, lowest in the middle.',
    },
    three: {
      name: 'Three towers',
      rings: [rect(0.06, 0.1, 0.26, 1), rect(0.4, 0.1, 0.6, 1), rect(0.74, 0.1, 0.94, 1)],
      tip: 'Split into three groups.',
    },
    zigzag: {
      name: 'Zigzag',
      rings: [[[0.05, 1], [0.05, 0.45], [0.2, 0.2], [0.35, 0.45], [0.5, 0.2], [0.65, 0.45], [0.8, 0.2], [0.95, 0.45], [0.95, 1]]],
      tip: 'Tall, short, tall, short, tall.',
    },
  };

  // Everyone who picks the same group size gets the same shapes in the same order,
  // so teams on different laptops can compare scores.
  // stand: how far from the laptop to stand, so the whole group fits in the picture.
  // fillSeconds: bigger groups get longer to rearrange, so nobody has to rush.
  const SIZES = {
    small: { label: '1 or 2', practicePlayers: 2, fillSeconds: 8, stand: 'Stand about 2 metres from the laptop, or a bit closer if you play alone.', shapes: ['door', 'tee', 'low', 'why', 'flag'] },
    medium: { label: '3 to 5', practicePlayers: 4, fillSeconds: 10, stand: 'Stand about 3 metres from the laptop.', shapes: ['wall', 'steps', 'towers', 'bridge', 'aitch'] },
    large: { label: '6 or more', practicePlayers: 7, fillSeconds: 12, stand: 'Stand 3 to 4 metres from the laptop.', shapes: ['bigwall', 'mountain', 'three', 'valley', 'zigzag'] },
  };

  function insideRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function inside(shape, x, y) {
    let n = 0;
    for (const ring of shape.rings) if (insideRing(x, y, ring)) n++;
    return n % 2 === 1;
  }

  // 1 where the shape is, tested at the centre of each pixel.
  function rasterize(shape, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = (y + 0.5) / h;
      for (let x = 0; x < w; x++) if (inside(shape, (x + 0.5) / w, fy)) out[y * w + x] = 1;
    }
    return out;
  }

  // Which shapes suit a group, from the number of players Freeze can see.
  function sizeFor(players) {
    if (players <= 2) return 'small';
    if (players <= 5) return 'medium';
    return 'large';
  }

  function roundsFor(size) {
    const s = SIZES[size];
    if (!s) throw new Error('Unknown group size: ' + size);
    return s.shapes.map((id) => Object.assign({ id }, SHAPES[id]));
  }

  return { SHAPES, SIZES, insideRing, inside, rasterize, sizeFor, roundsFor };
});
