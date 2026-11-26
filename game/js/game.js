// Freeze: the screens, the camera and the drawing. The rules are in rounds.js and the
// vision code is in vision.js.
(function () {
  'use strict';

  const V = window.Vision;
  const S = window.Shapes;
  const R = window.Rounds;
  const P = window.Practice;

  const params = new URLSearchParams(location.search);
  const SPEED = Math.max(1, Number(params.get('speed')) || 1); // only for tests: runs everything faster
  const STEP_MS = 66; // look at about 15 frames a second, so movement is judged the same on every laptop
  const LEARN_COUNT_MS = 5000; // time to step out of the picture
  const LEARN_FRAMES = 20; // frames averaged into the empty room
  const UNSTABLE_LIMIT = 0.08; // share of the room that may change while it's learned
  const STILL_WINDOW_MS = 400; // while frozen, each frame is compared with the one this long before it
  const ROOM_LOST_SHARE = 0.85; // if this much of the picture looks like people...
  const ROOM_LOST_MS = 1000; // ...for this long, the room has probably changed

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const st = {
    screen: 'start',
    mode: null, // 'camera' or 'practice'
    size: 'medium',
    ticket: 0, // stops a slow camera start from taking over after the player chose something else
    stream: null,
    video: null,
    lastVideoTime: -1,
    scene: null,
    capW: 320,
    capH: 240,
    w: 160,
    h: 120,
    model: null,
    gain: 1,
    learn: null,
    game: null,
    prev: null,
    history: [],
    mask: null,
    grown: null,
    overSince: null,
    shapeId: null,
    shapeMask: null,
    lastStep: 0,
    sound: true,
    audio: null,
    wakeLock: null,
    flashUntil: 0,
    lastBeep: -1,
  };
  window.__freeze = st; // for the walkthrough test

  // Canvases
  const view = document.createElement('canvas');
  view.id = 'view';
  view.setAttribute('aria-hidden', 'true');
  const viewCtx = view.getContext('2d');
  const cap = document.createElement('canvas');
  const capCtx = cap.getContext('2d', { willReadFrequently: true });
  const over = document.createElement('canvas');

  // ---------- Screens ----------
  function show(name) {
    st.screen = name;
    for (const s of ['start', 'setup', 'play', 'done']) $('screen-' + s).hidden = s !== name;
    if (name === 'setup') $('setup-stage').appendChild(view);
    if (name === 'play') $('play-stage').prepend(view);
    if (name === 'start') startPreview();
    else stopPreview();
    fitView();
  }

  function say(text) {
    const live = $('live');
    live.textContent = '';
    setTimeout(() => (live.textContent = text), 30);
  }

  function fitView() {
    const stage = view.parentElement;
    if (!stage || stage.closest('[hidden]')) return;
    const aw = stage.clientWidth;
    const ah = stage.clientHeight;
    const aspect = st.capW / st.capH;
    const cssW = Math.max(1, Math.min(aw, ah * aspect));
    const cssH = cssW / aspect;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.style.width = cssW + 'px';
    view.style.height = cssH + 'px';
    view.width = Math.round(cssW * dpr);
    view.height = Math.round(cssH * dpr);
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fitView);
    ro.observe($('setup-stage'));
    ro.observe($('play-stage'));
  }
  window.addEventListener('resize', fitView);

  // ---------- Sound ----------
  function beep(freq, ms, type) {
    if (!st.sound || !st.audio) return;
    const a = st.audio;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + ms / 1000 + 0.05);
  }

  function initAudio() {
    if (st.audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        st.audio = new AC();
      } catch (e) {
        st.audio = null;
      }
    }
  }

  // ---------- Group size ----------
  function chosenSize(name) {
    const c = document.querySelector(`input[name="${name}"]:checked`);
    return c ? c.value : 'medium';
  }

  function setRadio(name, value) {
    const r = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (r) r.checked = true;
  }

  function showFillTime() {
    $('how-fill').textContent = `You have ${S.SIZES[chosenSize('size')].fillSeconds} seconds to get into it together.`;
  }
  for (const r of document.querySelectorAll('input[name="size"]')) r.addEventListener('change', showFillTime);

  function useSize(size) {
    st.size = size;
    setRadio('size', size);
    setRadio('size-next', size);
    showFillTime();
    $('setup-stand').textContent = S.SIZES[size].stand;
    if (st.mode === 'practice') st.scene = P.createScene({ players: S.SIZES[size].practicePlayers, seed: 7 });
  }

  // ---------- Starting ----------
  function setWorkSize(capW, capH) {
    st.capW = capW;
    st.capH = capH;
    st.w = capW / 2;
    st.h = capH / 2;
    cap.width = capW;
    cap.height = capH;
    over.width = st.w;
    over.height = st.h;
    st.shapeId = null;
  }

  function cameraMessage(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return "Freeze isn't allowed to use the camera. Allow the camera in your browser, usually from the address bar, then try again. If Freeze is open inside another page, that page may block the camera. Open Freeze on its own, or try it without a camera.";
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return "Freeze couldn't find a camera. Check that this laptop has one, or try it without a camera.";
    }
    if (name === 'NotReadableError') {
      return 'Another app is using the camera. Close video call apps and try again.';
    }
    return "Freeze couldn't start the camera. Try again, or try it without a camera.";
  }

  function showStartError(text) {
    const box = $('camera-error');
    box.textContent = text;
    box.hidden = !text;
  }

  function lockStart(locked) {
    $('btn-camera').disabled = locked;
    $('btn-practice').disabled = locked;
  }

  function stopTracks(stream) {
    if (stream) for (const t of stream.getTracks()) t.stop();
  }

  async function startCamera() {
    initAudio();
    showStartError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showStartError(
        "This page can't use the camera. Open the Freeze file on this laptop in Chrome or Edge, or open a link to Freeze that starts with https. You can also try it without a camera."
      );
      return;
    }
    const ticket = ++st.ticket;
    lockStart(true);
    let stream = null;
    try {
      // Ask for a wide picture: a 16:9 camera sees more people side by side.
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      if (ticket !== st.ticket) return stopTracks(stream);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
      if (ticket !== st.ticket) return stopTracks(stream);
      const capW = 320;
      const capH = Math.max(2, Math.round((capW * video.videoHeight) / video.videoWidth / 2) * 2);
      st.stream = stream;
      st.video = video;
      st.lastVideoTime = -1;
      st.mode = 'camera';
      setWorkSize(capW, capH);
      useSize(chosenSize('size'));
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => cameraLost(stream));
        track.addEventListener('mute', () => cameraPaused(stream));
      }
      openSetup();
    } catch (err) {
      stopTracks(stream); // never leave the camera on after a failed start
      if (ticket === st.ticket) showStartError(cameraMessage(err));
    } finally {
      if (ticket === st.ticket) lockStart(false);
    }
  }

  function startPractice() {
    initAudio();
    showStartError('');
    st.ticket++;
    st.mode = 'practice';
    setWorkSize(320, 240);
    useSize(chosenSize('size'));
    openSetup();
  }

  function stopCamera() {
    stopTracks(st.stream);
    st.stream = null;
    st.video = null;
  }

  function cameraLost(stream) {
    if (stream !== st.stream) return;
    quitToStart();
    showStartError('The camera stopped. Check that no other app is using it, then start the camera again.');
  }

  function cameraPaused(stream) {
    if (stream !== st.stream) return;
    pauseGame("The camera picture stopped. When it's back, choose Resume.");
  }

  function openSetup() {
    st.model = null;
    st.learn = null;
    st.game = null;
    resetFrames();
    $('setup-mode').hidden = st.mode !== 'practice';
    $('setup-before').hidden = false;
    $('setup-after').hidden = true;
    $('setup-panel').hidden = false;
    $('learn-countdown').hidden = true;
    $('setup-warning').hidden = true;
    show('setup');
    $('btn-learn').focus();
  }

  function quitToStart() {
    st.ticket++;
    st.game = null;
    st.learn = null;
    st.model = null;
    st.mode = null;
    stopCamera();
    releaseWakeLock();
    closePause();
    lockStart(false);
    show('start');
    $('btn-camera').focus();
  }

  function resetFrames() {
    st.prev = null;
    st.history = [];
    st.mask = null;
    st.grown = null;
    st.overSince = null;
  }

  // ---------- Learning the room ----------
  function startLearn() {
    st.model = null;
    resetFrames();
    st.learn = { phase: 'count', start: performance.now(), acc: V.createBackground(st.w, st.h) };
    $('setup-before').hidden = true;
    $('setup-after').hidden = true;
    $('setup-panel').hidden = true;
    $('learn-countdown').hidden = false;
    $('learn-label').textContent = 'Everyone step out of the picture';
    $('learn-number').hidden = false;
    $('learn-countdown').focus();
    st.lastBeep = -1;
    say('Everyone step out of the picture. Freeze starts learning the room in 5 seconds.');
  }

  function learnTick(now, small) {
    const L = st.learn;
    if (L.phase === 'count') {
      const left = LEARN_COUNT_MS / SPEED - (now - L.start);
      const n = Math.ceil(left / (1000 / SPEED));
      $('learn-number').textContent = String(Math.max(1, n));
      if (n !== st.lastBeep && n > 0) {
        st.lastBeep = n;
        beep(660, 120);
      }
      if (left <= 0) {
        L.phase = 'capture';
        $('learn-label').textContent = 'Learning the room. Stay out of the picture.';
        $('learn-number').hidden = true;
      }
      return;
    }
    if (L.phase === 'capture' && small) {
      V.addBackgroundFrame(L.acc, small);
      if (L.acc.frames >= LEARN_FRAMES) finishLearn();
    }
  }

  function finishLearn() {
    st.model = V.finishBackground(st.learn.acc);
    st.learn = null;
    st.gain = 1;
    beep(880, 200);
    $('learn-countdown').hidden = true;
    $('setup-panel').hidden = false;
    $('setup-after').hidden = false;
    const warn = $('setup-warning');
    if (st.model.unstable > UNSTABLE_LIMIT) {
      warn.textContent = 'Something moved while Freeze was learning the room. Check that everyone was out of the picture, then learn the room again.';
      warn.hidden = false; // role="alert" reads it out
    } else {
      warn.hidden = true;
      say('Done. Now step back in. You should turn teal.');
    }
    $('btn-play').focus();
  }

  // ---------- The game ----------
  function startGame() {
    if (!st.model) return;
    st.game = R.createGame(st.size, performance.now(), { speed: SPEED });
    resetFrames();
    st.lastBeep = -1;
    $('play-mode').hidden = st.mode !== 'practice';
    $('result').hidden = true;
    $('rush').hidden = true;
    $('flash').hidden = true;
    closePause();
    $('screen-play').classList.remove('freezing');
    show('play');
    requestWakeLock();
    announceRound();
  }

  function announceRound() {
    const g = st.game;
    const shape = g.shapes[g.round];
    say(`Round ${g.round + 1} of ${g.shapes.length}: ${shape.name}. Fill the shape. ${shape.tip}`);
  }

  function onEvents(events, now) {
    const g = st.game;
    for (const e of events) {
      if (e === 'freeze') {
        $('screen-play').classList.add('freezing');
        const flash = $('flash');
        flash.hidden = false;
        flash.style.animation = 'none';
        void flash.offsetWidth; // restart the animation
        flash.style.animation = '';
        st.flashUntil = now + 900 / SPEED;
        beep(440, 500, 'square');
        say('Freeze! Hold still.');
      } else if (e === 'result') {
        $('screen-play').classList.remove('freezing');
        $('flash').hidden = true;
        st.flashUntil = 0;
        const r = g.results[g.results.length - 1];
        $('result-points').textContent = String(r.points);
        $('result-filled').textContent = pct(r.filled);
        $('result-outside').textContent = pct(r.outside);
        $('result-still').textContent = pct(r.still);
        $('result').hidden = false;
        beep(990, 160);
        setTimeout(() => beep(1320, 220), 170);
        say(`${r.points} points. Filled ${pct(r.filled)}, ${pct(r.outside)} outside the shape, held still ${pct(r.still)} of the time.`);
      } else if (e === 'next') {
        $('result').hidden = true;
        st.lastBeep = -1;
        announceRound();
      } else if (e === 'rushing') {
        $('rush').hidden = false;
        say("Slow down. There's time.");
      } else if (e === 'done') {
        finishGame();
      }
    }
  }

  function pct(x) {
    return Math.round(100 * x) + '%';
  }

  function finishGame() {
    const g = st.game;
    releaseWakeLock();
    $('done-mode').textContent = st.mode === 'practice' ? 'The practice players scored' : 'Your team scored';
    $('done-total').textContent = String(R.total(g));
    $('done-max').textContent = String(R.maxTotal(g));
    const body = $('done-rounds');
    body.textContent = '';
    g.results.forEach((r, i) => {
      const tr = document.createElement('tr');
      for (const text of [String(i + 1), r.name, pct(r.filled), pct(r.still), String(r.points)]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });
    $('done-note').textContent =
      st.mode === 'practice'
        ? "The practice players aren't very good at this, so a real group should do better. Every laptop that picks the same group size gets the same 5 shapes, so teams on different laptops can compare scores."
        : 'Playing on more than one laptop? Every laptop that picked the same group size got the same 5 shapes, so you can compare scores.';
    setRadio('size-next', st.size);
    show('done');
    say(`Game over. ${$('done-mode').textContent} ${R.total(g)} of ${R.maxTotal(g)}.`);
    $('btn-again').focus();
  }

  function playAgain() {
    useSize(chosenSize('size-next'));
    startGame();
  }

  // ---------- Pause ----------
  function pauseGame(reason) {
    const g = st.game;
    if (!g || g.phase === 'done' || st.screen !== 'play' || g.paused !== null) return;
    R.pause(g, performance.now());
    const why = $('pause-reason');
    why.textContent = reason || '';
    why.hidden = !reason;
    $('pause').hidden = false;
    $('play-bar').inert = true; // only the pause buttons work while paused
    $('play-hud').inert = true;
    $('btn-resume').focus();
    say(reason ? 'Paused. ' + reason : 'Paused.');
  }

  function closePause() {
    $('pause').hidden = true;
    $('play-bar').inert = false;
    $('play-hud').inert = false;
  }

  function resumeGame() {
    const g = st.game;
    if (!g || g.paused === null) return;
    R.resume(g, performance.now());
    resetFrames(); // people moved while paused; start the movement and brightness checks afresh
    closePause();
    $('btn-pause').focus();
    say(g.phase === 'freeze' ? 'Playing. Freeze! Hold still.' : 'Playing.');
  }

  function togglePause() {
    const g = st.game;
    if (!g) return;
    if (g.paused === null) pauseGame();
    else resumeGame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  async function requestWakeLock() {
    try {
      if (navigator.wakeLock) st.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      st.wakeLock = null; // the screen may still sleep; that's fine
    }
  }

  function releaseWakeLock() {
    if (st.wakeLock) st.wakeLock.release().catch(() => {});
    st.wakeLock = null;
  }

  // ---------- Each frame ----------
  function practiceState(now) {
    const g = st.game;
    if (st.screen === 'play' && g && g.phase !== 'done') {
      return { present: true, shape: g.shapes[g.round], phase: g.phase, elapsed: R.elapsed(g, now), fillMs: R.times(g).fill, round: g.round, t: now };
    }
    if (st.learn) {
      // The practice players walk out of the picture a moment after the countdown starts.
      const away = st.learn.phase === 'capture' || now - st.learn.start > 1200 / SPEED;
      return { present: !away, t: now };
    }
    return { present: true, t: now };
  }

  // Get the next picture into cap (full size) and return it at working size, or null if there
  // is no new picture yet. A slow camera repeats frames, and judging a repeat would look like
  // perfect stillness.
  function grab(now) {
    if (st.mode === 'camera') {
      const v = st.video;
      if (!v || v.readyState < 2 || v.currentTime === st.lastVideoTime) return null;
      st.lastVideoTime = v.currentTime;
      capCtx.setTransform(-1, 0, 0, 1, st.capW, 0); // mirror, so it works like a mirror
      capCtx.drawImage(v, 0, 0, st.capW, st.capH);
      capCtx.setTransform(1, 0, 0, 1, 0, 0);
      return V.downscale(capCtx.getImageData(0, 0, st.capW, st.capH).data, st.capW, st.capH, 2);
    }
    if (st.mode === 'practice') {
      const buf = P.frame(st.scene, practiceState(now));
      capCtx.putImageData(new ImageData(buf, st.capW, st.capH), 0, 0);
      return V.downscale(buf, st.capW, st.capH, 2);
    }
    return null;
  }

  function currentShape() {
    const g = st.game;
    if (st.screen !== 'play' || !g || g.phase === 'done') return null;
    return g.shapes[g.round];
  }

  function shapeMaskFor(shape) {
    if (st.shapeId !== shape.id) {
      st.shapeId = shape.id;
      st.shapeMask = S.rasterize(shape, st.w, st.h);
    }
    return st.shapeMask;
  }

  // Movement for the "held still" score. While frozen, each frame is compared with the frame
  // STILL_WINDOW_MS before it (but not from before the grace period ended), so slow drifting
  // adds up. It's the largest movement in any of 8 strips of the picture, so one person moving
  // in a big group still counts. At other times it's the change since the last frame.
  function stillMotion(now, luma, mask) {
    const g = st.game;
    const h = st.history;
    if (h.length < 2) return 0;
    if (g.phase !== 'freeze') {
      const prev = h[h.length - 2];
      return V.motion(prev.luma, luma, prev.mask, mask);
    }
    const window = Math.max(STILL_WINDOW_MS / SPEED, 2 * STEP_MS); // at least two frames apart
    const from = Math.max(now - window, g.phaseStart + R.times(g).grace);
    const base = h.find((f) => f.t >= from);
    if (!base || base.t >= now) return 0;
    return V.stripMotion(base.luma, luma, base.mask, mask, st.w, st.h, 8);
  }

  // If nearly the whole picture looks like people for a second, the light changed or the
  // laptop moved. Pause and ask for the room to be learned again.
  function roomCheck(now, cover) {
    const g = st.game;
    if (st.screen !== 'play' || !g || g.paused !== null || g.phase === 'done' || cover < ROOM_LOST_SHARE) {
      st.overSince = null;
      return;
    }
    if (st.overSince === null) st.overSince = now;
    if (now - st.overSince >= ROOM_LOST_MS) {
      st.overSince = null;
      pauseGame("Freeze can't tell people from the room anymore. This happens when the light changes or the laptop moves. Choose Learn the room again and restart.");
    }
  }

  function process(now) {
    const small = grab(now);
    if (st.learn) {
      learnTick(now, small);
      return;
    }
    if (!small || !st.model) return;
    // Brightness change, judged only from the parts of the picture that were room last frame.
    const g0 = V.gainOf(small, st.model, st.grown);
    if (g0 !== null) st.gain = st.prev ? st.gain * 0.6 + g0 * 0.4 : g0;
    const mask = V.cleanMask(V.foregroundMask(small, st.model, { gain: st.gain }), st.w, st.h);
    const luma = V.lumaOf(small, st.w, st.h);
    let rush = 0;
    if (st.prev) {
      // A slow camera gives fewer frames with more movement between them; scale to STEP_MS.
      const dt = Math.max(1, now - st.prev.t);
      rush = V.stripMotion(st.prev.luma, luma, st.prev.mask, mask, st.w, st.h, 8) * Math.min(1, STEP_MS / dt);
    }
    st.prev = { t: now, luma, mask };
    st.history.push(st.prev);
    while (st.history.length && st.history[0].t < now - 1200) st.history.shift();
    st.mask = mask;
    st.grown = V.dilate(mask, st.w, st.h, 2);
    roomCheck(now, V.countOnes(mask) / mask.length);
    const shape = currentShape();
    if (shape && st.game.paused === null) {
      const fit = V.scoreFit(mask, shapeMaskFor(shape));
      const motion = stillMotion(now, luma, mask);
      onEvents(R.step(st.game, now, Object.assign({ motion, rush }, fit)), now);
    }
  }

  // Colour the people over the picture: teal inside the shape, coral stripes outside it, and a
  // faint yellow where the shape is still empty. Then draw the shape's outline like floor tape.
  // mask and shapeMask are w × h; layer is a w × h canvas used to scale them up smoothly.
  function drawOverlay(ctx, dw, dh, mask, shapeMask, shape, w, h, layer) {
    const lctx = layer.getContext('2d');
    const img = lctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0, p = 0; p < w * h; p++, i += 4) {
      const m = mask ? mask[p] : 0;
      const s = shapeMask ? shapeMask[p] : 0;
      if (m && (s || !shapeMask)) {
        d[i] = 53; d[i + 1] = 214; d[i + 2] = 192; d[i + 3] = 150; // filled: teal
      } else if (m) {
        const x = p % w;
        const y = (p / w) | 0;
        const stripe = (x + y) % 6 < 3;
        d[i] = 255; d[i + 1] = 107; d[i + 2] = 127; d[i + 3] = stripe ? 190 : 70; // outside: coral stripes
      } else if (s) {
        d[i] = 255; d[i + 1] = 210; d[i + 2] = 63; d[i + 3] = 70; // still empty: faint tape
      }
    }
    lctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, 0, 0, dw, dh);
    if (shape) {
      ctx.beginPath();
      for (const ring of shape.rings) {
        ring.forEach(([x, y], k) => (k ? ctx.lineTo(x * dw, y * dh) : ctx.moveTo(x * dw, y * dh)));
        ctx.closePath();
      }
      const lw = Math.max(4, dw / 180);
      ctx.lineJoin = 'round';
      ctx.lineWidth = lw + 5;
      ctx.strokeStyle = 'rgba(10, 12, 20, 0.6)';
      ctx.stroke();
      ctx.lineWidth = lw;
      ctx.strokeStyle = '#ffd23f';
      ctx.stroke();
    }
  }

  function draw() {
    if (st.screen !== 'setup' && st.screen !== 'play') return;
    const dw = view.width;
    const dh = view.height;
    if (st.mode === 'camera' && st.video) {
      viewCtx.save();
      viewCtx.setTransform(-1, 0, 0, 1, dw, 0);
      viewCtx.drawImage(st.video, 0, 0, dw, dh);
      viewCtx.restore();
    } else {
      viewCtx.imageSmoothingEnabled = true;
      viewCtx.drawImage(cap, 0, 0, dw, dh);
    }
    viewCtx.fillStyle = 'rgba(15, 19, 32, 0.25)'; // dim the picture a little so the colours stand out
    viewCtx.fillRect(0, 0, dw, dh);
    const shape = currentShape();
    if (st.model && !st.learn) drawOverlay(viewCtx, dw, dh, st.mask, shape ? shapeMaskFor(shape) : null, shape, st.w, st.h, over);
  }

  function hud(now) {
    const g = st.game;
    if (st.screen !== 'play' || !g || g.phase === 'done') return;
    const shape = g.shapes[g.round];
    const left = R.remaining(g, now);
    $('hud-round').textContent = `Round ${g.round + 1} of ${g.shapes.length}: ${shape.name}`;
    const main = $('callout-main');
    const sub = $('callout-sub');
    const timer = $('timer');
    if (g.phase === 'fill') {
      main.textContent = 'Fill the shape';
      sub.textContent = shape.tip;
      timer.hidden = false;
      const n = Math.ceil(left / (1000 / SPEED));
      timer.textContent = String(n);
      if (n <= 3 && n > 0 && n !== st.lastBeep && g.paused === null) {
        st.lastBeep = n;
        beep(660, 110);
      }
    } else if (g.phase === 'freeze') {
      main.textContent = 'Freeze! Hold still';
      sub.textContent = 'Moving now costs points.';
      timer.hidden = false;
      timer.textContent = String(Math.ceil(left / (1000 / SPEED)));
    } else {
      main.textContent = `Round ${g.round + 1} done`;
      sub.textContent = g.round + 1 < g.shapes.length ? 'The next shape is coming up.' : 'That was the last round.';
      timer.hidden = true;
    }
    if (!g.rushing || g.phase !== 'fill') $('rush').hidden = true;
    if (st.flashUntil && now > st.flashUntil) {
      $('flash').hidden = true;
      st.flashUntil = 0;
    }
    const filled = Math.round(100 * g.live.filled);
    $('meter-fill').style.width = filled + '%';
    $('meter-text').textContent = `Filled ${filled}%`;
    $('meter').setAttribute('aria-valuenow', String(filled));
    $('hud-total').textContent = String(R.total(g));
  }

  function loop(now) {
    if (now - st.lastStep >= STEP_MS) {
      st.lastStep = now;
      process(now);
    }
    draw();
    hud(now);
    requestAnimationFrame(loop);
  }

  // ---------- Start-screen preview ----------
  const preview = {
    canvas: $('preview'),
    raf: 0,
    scene: null,
    model: null,
    prev: 0,
  };

  function previewSetup() {
    if (preview.scene) return;
    preview.scene = P.createScene({ players: 4, seed: 3 });
    const acc = V.createBackground(160, 120);
    for (let k = 0; k < 12; k++) V.addBackgroundFrame(acc, V.downscale(P.frame(preview.scene, { present: false, t: k * 66 }), 320, 240, 2));
    preview.model = V.finishBackground(acc);
    preview.shape = Object.assign({ id: 'steps' }, S.SHAPES.steps);
    preview.shapeMask = S.rasterize(preview.shape, 160, 120);
    preview.ctx = preview.canvas.getContext('2d');
    preview.over = document.createElement('canvas');
    preview.over.width = 160;
    preview.over.height = 120;
  }

  function previewFrame(now) {
    const cycle = 7000;
    const t = reduceMotion ? 6000 : (now + 4500) % cycle; // open with the players already in the shape
    const phase = t < 5000 ? 'fill' : 'freeze';
    const state = { present: true, shape: preview.shape, phase, elapsed: phase === 'fill' ? t : t - 5000, fillMs: 5000, round: 0, t: now };
    const buf = P.frame(preview.scene, state);
    const ctx = preview.ctx;
    ctx.putImageData(new ImageData(buf, 320, 240), 0, 0);
    ctx.fillStyle = 'rgba(15, 19, 32, 0.25)';
    ctx.fillRect(0, 0, 320, 240);
    const mask = V.cleanMask(V.foregroundMask(V.downscale(buf, 320, 240, 2), preview.model), 160, 120);
    drawOverlay(ctx, 320, 240, mask, preview.shapeMask, preview.shape, 160, 120, preview.over);
  }

  function previewLoop(now) {
    if (now - preview.prev >= STEP_MS) {
      preview.prev = now;
      previewFrame(now);
    }
    preview.raf = reduceMotion ? 0 : requestAnimationFrame(previewLoop);
  }

  function startPreview() {
    previewSetup();
    if (!preview.raf) {
      if (reduceMotion) previewFrame(performance.now());
      else preview.raf = requestAnimationFrame(previewLoop);
    }
  }

  function stopPreview() {
    if (preview.raf) cancelAnimationFrame(preview.raf);
    preview.raf = 0;
  }

  // ---------- Controls ----------
  $('btn-camera').addEventListener('click', startCamera);
  $('btn-practice').addEventListener('click', startPractice);
  $('btn-learn').addEventListener('click', startLearn);
  $('btn-relearn').addEventListener('click', startLearn);
  $('btn-setup-back').addEventListener('click', quitToStart);
  $('btn-play').addEventListener('click', startGame);
  $('btn-pause').addEventListener('click', () => pauseGame());
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-quit').addEventListener('click', quitToStart);
  $('btn-pause-relearn').addEventListener('click', () => {
    st.game = null;
    closePause();
    releaseWakeLock();
    openSetup();
    startLearn();
  });
  $('btn-again').addEventListener('click', playAgain);
  $('btn-done-quit').addEventListener('click', quitToStart);
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-full').addEventListener('click', toggleFull);

  function toggleSound() {
    st.sound = !st.sound;
    $('btn-sound').textContent = st.sound ? 'Turn sound off' : 'Turn sound on';
  }

  function toggleFull() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  document.addEventListener('fullscreenchange', () => {
    $('btn-full').textContent = document.fullscreenElement ? 'Exit full screen' : 'Enter full screen';
    fitView();
  });

  document.addEventListener('keydown', (e) => {
    if (st.screen !== 'play' || e.repeat) return;
    const paused = st.game && st.game.paused !== null;
    if (e.key === 'Escape' && paused) {
      e.preventDefault();
      resumeGame();
    } else if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      togglePause();
    } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleSound();
    }
  });

  showFillTime();
  show('start');
  requestAnimationFrame(loop);
})();
