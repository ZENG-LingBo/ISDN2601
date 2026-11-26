// Freeze: the screens, the camera, the drawing and the host's voice. The rules are in
// rounds.js, reading poses is in pose.js, and the body tracking is in sensing.js.
(function () {
  'use strict';

  const V = window.Vision;
  const S = window.Shapes;
  const Pose = window.Pose;
  const R = window.Rounds;
  const P = window.Practice;
  const Sensing = window.Sensing;

  const params = new URLSearchParams(location.search);
  const SPEED = Math.max(1, Number(params.get('speed')) || 1); // only for tests: runs everything faster
  const STEP_MS = 66; // look at about 15 frames a second
  const STILL_WINDOW_MS = 400; // while frozen, each moment is compared with the one this long before it
  const NOBODY_MS = 1000; // how long nobody must be in view before the screen says so
  const LEAD_MS = 5000; // "Get in place" before round 1, so whoever pressed Start can step back
  const HANDS_START_MS = 1000; // everyone holding both hands up this long starts the game
  const HANDS_AGAIN_MS = 2000; // ...or this long to play again from the end screen
  const HANDS_IGNORE_MS = 3000; // the end screen ignores hands for this long, so cheering doesn't restart

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const st = {
    screen: 'start',
    mode: null, // 'camera' or 'practice'
    ticket: 0, // stops a slow camera start from taking over after the player chose something else
    stream: null,
    video: null,
    newFrame: false,
    lastVideoTime: -1,
    tracking: false,
    scene: null,
    detW: 320,
    detH: 180,
    w: 160,
    h: 90,
    aspect: 16 / 9,
    players: [],
    tracked: null,
    gestureArmed: false,
    trackDead: false,
    screenSince: 0,
    mask: null,
    lead: null,
    handsSince: null,
    misses: [],
    errors: 0,
    counts: [],
    history: [],
    game: null,
    kind: 'shapes',
    nobodySince: null,
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

  const view = document.createElement('canvas');
  view.id = 'view';
  view.setAttribute('aria-hidden', 'true');
  const viewCtx = view.getContext('2d');
  const det = document.createElement('canvas'); // camera picture for body tracking, not mirrored
  const detCtx = det.getContext('2d', { willReadFrequently: true });
  const cap = document.createElement('canvas'); // practice picture
  const capCtx = cap.getContext('2d');
  const over = document.createElement('canvas');

  // ---------- Screens ----------
  function show(name) {
    if (st.screen !== name) {
      st.screenSince = performance.now();
      st.gestureArmed = false; // hands must come down first
      st.handsSince = null;
    }
    st.screen = name;
    for (const s of ['start', 'ready', 'play', 'done']) $('screen-' + s).hidden = s !== name;
    if (name === 'ready') $('ready-stage').appendChild(view);
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

  // The host reads out each round, so players across the room don't have to read the screen.
  function speak(text) {
    if (!st.sound || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {
      // no voice on this laptop; the screen still shows everything
    }
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function fitView() {
    const stage = view.parentElement;
    if (!stage || stage.closest('[hidden]')) return;
    const aw = stage.clientWidth;
    const ah = stage.clientHeight;
    const cssW = Math.max(1, Math.min(aw, ah * st.aspect));
    const cssH = cssW / st.aspect;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.style.width = cssW + 'px';
    view.style.height = cssH + 'px';
    view.width = Math.round(cssW * dpr);
    view.height = Math.round(cssH * dpr);
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fitView);
    ro.observe($('ready-stage'));
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

  // ---------- Starting ----------
  // detW × detH: the picture the body tracking (or the practice room) works on.
  // w × h: the smaller grid that body outlines and shapes are compared on.
  function setSizes(detW, detH) {
    st.detW = detW;
    st.detH = detH;
    st.w = 160;
    st.h = Math.round((160 * detH) / detW);
    st.aspect = detW / detH;
    det.width = detW;
    det.height = detH;
    cap.width = detW;
    cap.height = detH;
    over.width = st.w;
    over.height = st.h;
    st.shapeId = null;
  }

  function cameraMessage(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return "Freeze isn't allowed to use the camera. Allow the camera in your browser, usually from the address bar, then try again. If Freeze is open inside another page, that page may block the camera. Open Freeze on its own, or play with practice players.";
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return "Freeze couldn't find a camera. Check that this laptop has one, or play with practice players.";
    }
    if (name === 'NotReadableError') {
      return 'Another app may be using the camera. Close any video call apps and try again.';
    }
    return "Freeze couldn't start the camera. Try again, or play with practice players.";
  }

  function showStartError(text) {
    const box = $('camera-error');
    box.textContent = text;
    box.hidden = !text;
  }

  // While the camera prompt is open, only the camera button is locked. A camera answer that
  // comes after the player chose practice players is ignored and the camera turned off.
  function lockStart(locked) {
    $('btn-camera').disabled = locked;
  }

  function stopTracks(stream) {
    if (stream) for (const t of stream.getTracks()) t.stop();
  }

  // Mark when the camera delivers a new frame, so repeated frames aren't judged twice.
  function watchFrames(video) {
    if (!('requestVideoFrameCallback' in video)) return;
    const onFrame = () => {
      if (st.video !== video) return;
      st.newFrame = true;
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
  }

  async function startCamera() {
    initAudio();
    showStartError('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showStartError("This page can't use the camera. Open Freeze on its own, from a link that starts with https, or play with practice players.");
      return;
    }
    const ticket = ++st.ticket;
    lockStart(true);
    let stream = null;
    try {
      // A wide picture fits more people side by side.
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      if (ticket !== st.ticket) return stopTracks(stream);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
      if (ticket !== st.ticket) return stopTracks(stream);
      st.stream = stream;
      st.video = video;
      st.lastVideoTime = -1;
      st.mode = 'camera';
      setSizes(480, Math.max(2, Math.round((480 * video.videoHeight) / video.videoWidth / 2) * 2));
      watchFrames(video);
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => cameraLost(stream));
        track.addEventListener('mute', () => cameraPaused(stream));
      }
      openReady();
      loadTracking(ticket);
    } catch (err) {
      stopTracks(stream); // never leave the camera on after a failed start
      if (ticket === st.ticket) showStartError(cameraMessage(err));
    } finally {
      if (ticket === st.ticket) lockStart(false);
    }
  }

  async function loadTracking(ticket) {
    st.tracking = false;
    $('ready-loading').hidden = false;
    $('ready-error').hidden = true;
    try {
      await Sensing.load();
      if (ticket !== st.ticket) return;
      st.tracking = true;
      $('ready-loading').hidden = true;
    } catch (err) {
      if (ticket !== st.ticket) return;
      $('ready-loading').hidden = true;
      const box = $('ready-error');
      box.textContent = "Freeze couldn't load body tracking. Check that this laptop is online, then go back and start the camera again. You can also play with practice players.";
      box.hidden = false;
    }
  }

  function practiceCount() {
    const c = document.querySelector('input[name="practice-n"]:checked');
    return c ? Number(c.value) : 4;
  }

  function startPractice() {
    initAudio();
    showStartError('');
    st.ticket++;
    lockStart(false);
    st.mode = 'practice';
    setSizes(320, 240);
    st.scene = P.createScene({ players: practiceCount(), seed: 7 });
    openReady();
  }

  for (const r of document.querySelectorAll('input[name="practice-n"]')) {
    r.addEventListener('change', () => {
      if (st.mode !== 'practice') return;
      st.scene = P.createScene({ players: practiceCount(), seed: 7 });
      st.counts = [];
    });
  }

  function stopCamera() {
    stopTracks(st.stream);
    st.stream = null;
    st.video = null;
    st.tracking = false;
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

  function resetFrames() {
    st.players = [];
    st.tracked = null;
    st.mask = null;
    st.history = [];
    st.nobodySince = null;
    st.handsSince = null;
    st.misses = [];
  }

  function openReady() {
    st.game = null;
    st.counts = [];
    resetFrames();
    closePause();
    const practice = st.mode === 'practice';
    $('ready-mode').hidden = !practice;
    $('practice-size').hidden = !practice;
    $('ready-hint').hidden = practice;
    $('ready-gesture').hidden = practice;
    $('ready-loading').hidden = true;
    $('ready-error').hidden = true;
    releaseWakeLock();
    stopSpeech();
    st.lead = null;
    show('ready');
    $('ready-title').focus();
  }

  function quitToStart() {
    st.ticket++;
    if (st.trackDead) {
      Sensing.reset(); // starting the camera again builds a new tracker
      st.trackDead = false;
      st.errors = 0;
    }
    st.game = null;
    st.lead = null;
    st.mode = null;
    stopSpeech();
    stopCamera();
    releaseWakeLock();
    closePause();
    lockStart(false);
    show('start');
    $('btn-camera').focus();
  }

  // How many players Freeze can see, steadied over the last second.
  function playerCount() {
    if (!st.counts.length) return 0;
    const sorted = st.counts.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function chosenGame() {
    const c = document.querySelector('input[name="game"]:checked');
    return c ? c.value : 'shapes';
  }

  // ---------- The game ----------
  // Start: first "Get in place" for 5 seconds, so whoever pressed Start can step back. The
  // players are counted at the end of it, and the rounds are planned for that many.
  function startGame() {
    if (playerCount() < 1 && st.screen !== 'done') return;
    st.kind = chosenGame();
    st.game = null;
    st.lead = { start: performance.now() };
    st.handsSince = null;
    st.lastBeep = -1;
    $('play-mode').hidden = st.mode !== 'practice';
    $('result').hidden = true;
    $('rush').hidden = true;
    $('nobody').hidden = true;
    $('flash').hidden = true;
    $('card').hidden = true;
    closePause();
    $('screen-play').classList.remove('freezing');
    show('play');
    requestWakeLock();
    say('Get in place. The game starts in 5 seconds.');
    speak('Get in place.');
  }

  function leadTick(now) {
    const L = st.lead;
    if (L.paused != null) return;
    const left = LEAD_MS / SPEED - (now - L.start);
    if (left > 0) return;
    const n = playerCount();
    if (n < 1) {
      L.start = now; // wait for someone to step into view
      return;
    }
    st.lead = null;
    beginRounds(n);
  }

  function beginRounds(n) {
    st.game = R.createGame(st.kind, n, performance.now(), { speed: SPEED });
    st.history = [];
    st.lastBeep = -1;
    announceRound();
  }

  function announceRound() {
    const g = st.game;
    const r = g.rounds[g.round];
    drawCard(r);
    say(`Round ${g.round + 1} of ${g.rounds.length}: ${r.type === 'shape' ? r.what : r.name}. ${r.title}. ${r.tip}`);
    speak(`Round ${g.round + 1}. ${r.title}.${r.type === 'shape' ? ' ' + r.tip : ''}`);
  }

  function pct(x) {
    return Math.round(100 * x) + '%';
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
        speak('Freeze!');
      } else if (e === 'result') {
        $('screen-play').classList.remove('freezing');
        $('flash').hidden = true;
        st.flashUntil = 0;
        showResult(g.results[g.results.length - 1], st.misses.slice());
      } else if (e === 'next') {
        $('result').hidden = true;
        st.lastBeep = -1;
        announceRound();
      } else if (e === 'rushing') {
        $('rush').hidden = false;
        say("Slow down. There's time.");
        speak("Slow down. There's time.");
      } else if (e === 'done') {
        finishGame();
      }
    }
  }

  function showResult(r, misses) {
    $('result-points').textContent = String(r.points);
    $('result-still').textContent = pct(r.still);
    let detail = '';
    if (r.type === 'shape') {
      $('result-a-label').textContent = 'Filled';
      $('result-a').textContent = pct(r.filled);
      $('result-b-label').textContent = 'Outside the shape';
      $('result-b').textContent = pct(r.outside);
      $('result-b-box').hidden = false;
      detail = `Filled ${pct(r.filled)}, ${pct(r.outside)} outside the shape`;
    } else if (r.type === 'hands') {
      $('result-a-label').textContent = 'Hands up';
      $('result-a').textContent = `${r.hands} of ${r.target}`;
      $('result-b-box').hidden = true;
      detail = `${r.hands} hands up out of ${r.target}`;
    } else {
      $('result-a-label').textContent = 'Players copying';
      $('result-a').textContent = pct(r.matched);
      $('result-b-box').hidden = true;
      detail = `${pct(r.matched)} of players copying`;
    }
    beep(990, 160);
    setTimeout(() => beep(1320, 220), 170);
    // The host says what went wrong, by name tag, so the group knows what to fix. The same
    // note shows on the result card and goes to screen readers.
    let note = '';
    if (r.type === 'pose' && misses && misses.length) {
      const names = misses.map((id) => 'P' + id);
      note = ` ${names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]} didn't have the pose.`;
    } else if (r.type === 'hands' && r.hands !== r.target) {
      const d = r.hands - r.target;
      note = ` ${Math.abs(d)} ${Math.abs(d) === 1 ? 'hand' : 'hands'} too ${d > 0 ? 'many' : 'few'}.`;
    } else if (r.still < 0.9) {
      note = ' Someone moved.';
    }
    const noteBox = $('result-note');
    noteBox.textContent = note.trim();
    noteBox.hidden = !note;
    $('result').hidden = false;
    say(`${r.points} points. ${detail}, held still ${pct(r.still)} of the time.${note}`);
    speak(`${r.points} points.${note}`);
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
      for (const text of [String(i + 1), r.name, r.type === 'shape' ? `Fill the ${r.what} shape` : r.what, String(r.points)]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });
    $('done-note').textContent =
      st.mode === 'practice'
        ? "The practice players aren't very good at this, so a real group should do better. Laptops that play the same game with the same number of players get the same rounds, so teams can compare scores."
        : 'Playing on more than one laptop? Laptops that play the same game with the same number of players get the same rounds, so you can compare scores.';
    $('done-gesture').hidden = st.mode !== 'camera';
    show('done');
    const text = `${$('done-mode').textContent} ${R.total(g)} of ${R.maxTotal(g)}.`;
    say('Game over. ' + text);
    speak(`Game over. ${R.total(g)} points.`);
    $('btn-again').focus();
  }

  // ---------- Pause ----------
  function pauseGame(reason) {
    if (st.screen !== 'play') return;
    const g = st.game;
    if (st.lead) {
      if (st.lead.paused != null) return;
      st.lead.paused = performance.now();
    } else {
      if (!g || g.phase === 'done' || g.paused !== null) return;
      R.pause(g, performance.now());
    }
    const why = $('pause-reason');
    why.textContent = reason || '';
    why.hidden = !reason;
    $('pause').hidden = false;
    $('play-bar').inert = true; // only the pause buttons work while paused
    $('play-hud').inert = true;
    $('btn-resume').focus();
    say(reason ? 'Paused. ' + reason : 'Paused.');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  function closePause() {
    $('pause').hidden = true;
    $('btn-resume').hidden = false;
    $('play-bar').inert = false;
    $('play-hud').inert = false;
  }

  function resumeGame() {
    if (st.lead && st.lead.paused != null) {
      st.lead.start += performance.now() - st.lead.paused;
      st.lead.paused = null;
      closePause();
      $('btn-pause').focus();
      say('Playing. Get in place.');
      return;
    }
    const g = st.game;
    if (!g || g.paused === null) return;
    R.resume(g, performance.now());
    st.history = []; // people moved while paused; start the movement check afresh
    closePause();
    $('btn-pause').focus();
    say(g.phase === 'freeze' ? 'Playing. Freeze! Hold still.' : 'Playing.');
  }

  function togglePause() {
    const paused = st.lead ? st.lead.paused != null : st.game && st.game.paused !== null;
    if (!st.lead && !st.game) return;
    if (paused) resumeGame();
    else pauseGame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
    else if (st.screen === 'play') {
      st.wakeLock = null; // the browser drops the lock when the tab is hidden
      requestWakeLock();
    }
  });

  async function requestWakeLock() {
    if (st.wakeLock) return;
    try {
      if (!navigator.wakeLock) return;
      const lock = await navigator.wakeLock.request('screen');
      if (st.screen !== 'play') lock.release().catch(() => {}); // the game ended while waiting
      else st.wakeLock = lock;
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
      const r = g.rounds[g.round];
      return { present: true, round: r, roundIndex: g.round, phase: g.phase, elapsed: R.elapsed(g, now), fillMs: R.times(g).fill, t: now };
    }
    return { present: true, t: now };
  }

  // Read the latest picture. Returns { poses, mask } or null if there's nothing new.
  function sense(now) {
    if (st.mode === 'camera') {
      const v = st.video;
      if (!st.tracking || !v || v.readyState < 2) return null;
      if ('requestVideoFrameCallback' in v) {
        if (!st.newFrame) return null;
        st.newFrame = false;
      } else {
        if (v.currentTime === st.lastVideoTime) return null;
        st.lastVideoTime = v.currentTime;
      }
      detCtx.drawImage(v, 0, 0, st.detW, st.detH);
      const r = currentRound();
      return Sensing.detect(det, now, st.w, st.h, !!(r && r.type === 'shape'));
    }
    if (st.mode === 'practice' && st.scene) {
      const f = P.frame(st.scene, practiceState(now));
      capCtx.putImageData(new ImageData(f.rgba, st.detW, st.detH), 0, 0);
      return { poses: f.poses, mask: V.shrinkMask(f.mask, st.detW, st.detH, st.detW / st.w) };
    }
    return null;
  }

  function currentRound() {
    const g = st.game;
    if (st.screen !== 'play' || !g || g.phase === 'done') return null;
    return g.rounds[g.round];
  }

  function shapeMaskFor(shape) {
    if (st.shapeId !== shape.id) {
      st.shapeId = shape.id;
      st.shapeMask = S.rasterize(shape, st.w, st.h);
    }
    return st.shapeMask;
  }

  // While frozen: the share of players who moved less than MOVE_LIMIT since STILL_WINDOW_MS ago
  // (but not since before the half second to settle ended). 1 at other times.
  function stillNow(now, players) {
    const g = st.game;
    const h = st.history;
    if (g.phase !== 'freeze' || h.length < 2) return 1;
    const win = Math.max(STILL_WINDOW_MS / SPEED, 2 * STEP_MS);
    const from = Math.max(now - win, g.phaseStart + R.times(g).grace);
    const base = h.find((f) => f.t >= from);
    if (!base || base.t >= now) return 1;
    return Pose.stillShare(base.players, players, R.MOVE_LIMIT);
  }

  // Everyone in view holding both hands up for a second starts the game (or the next one), so
  // nobody has to stand at the laptop.
  // Hands must be seen down first after a screen opens, and the end screen waits 3 seconds,
  // so a group still celebrating with both arms up doesn't start a game by accident.
  function handsToStart(now, players) {
    const onDone = st.screen === 'done';
    if (st.lead || (onDone && now - st.screenSince < HANDS_IGNORE_MS / SPEED)) {
      st.handsSince = null;
      return;
    }
    if (!Pose.allHandsUp(players)) {
      if (players.length) st.gestureArmed = true;
      st.handsSince = null;
      return;
    }
    if (!st.gestureArmed) return;
    if (st.handsSince === null) st.handsSince = now;
    if (now - st.handsSince >= (onDone ? HANDS_AGAIN_MS : HANDS_START_MS) / SPEED) {
      st.handsSince = null;
      if (st.screen === 'done') setGame(st.kind);
      startGame();
    }
  }

  function process(now) {
    if (st.screen === 'start') return;
    if (st.game && st.game.paused !== null) return; // no tracking while paused
    if (st.lead && st.lead.paused != null) return;
    const seen = sense(now);
    if (!seen) return;
    // Smooth each player's body points a little and keep their name tag with them.
    st.tracked = Pose.track(st.tracked, seen.poses, now);
    const players = st.tracked.players;
    st.players = players;
    st.mask = seen.mask ? V.cleanMask(seen.mask, st.w, st.h, 1) : null;
    st.counts.push(players.length);
    if (st.counts.length > 15) st.counts.shift();
    const prev = st.history.length ? st.history[st.history.length - 1] : null;
    st.history.push({ t: now, players });
    while (st.history.length && st.history[0].t < now - 1500) st.history.shift();
    if (st.screen === 'ready') updateReady();
    if (st.screen === 'ready' || st.screen === 'done') handsToStart(now, players);
    if (st.lead) {
      leadTick(now);
      return;
    }
    const round = currentRound();
    if (!round || st.game.paused !== null) return;
    if (players.length === 0) {
      if (st.nobodySince === null) st.nobodySince = now;
      $('nobody').hidden = now - st.nobodySince < NOBODY_MS;
    } else {
      st.nobodySince = null;
      $('nobody').hidden = true;
    }
    const m = { players: players.length, still: stillNow(now, players), rush: prev ? Pose.speed(prev.players, players, (now - prev.t) / 1000) : 0 };
    if (round.type === 'shape') Object.assign(m, V.scoreFit(st.mask, shapeMaskFor(round.shape)));
    if (round.type === 'hands') m.hands = players.reduce((s, p) => s + Pose.handsUp(p), 0);
    if (round.type === 'pose') {
      m.matching = players.filter((p) => Pose.matches(p, round.card)).length;
      if (st.game.phase === 'freeze') st.misses = players.filter((p) => !Pose.matches(p, round.card)).map((p) => p.id);
    }
    onEvents(R.step(st.game, now, m), now);
  }

  function updateReady() {
    const n = playerCount();
    const text = st.mode === 'camera' && !st.tracking ? 'Looking for players' : n === 0 ? 'Nobody in view yet' : n === 1 ? '1 player' : `${n} players`;
    const el = $('player-count');
    if (el.textContent !== text) el.textContent = text;
    $('btn-play').disabled = n < 1;
    if (st.mode === 'camera') {
      let hint = 'Stand back until everyone has a name tag. Freeze can follow up to 6 players, and needs to see each of you from the waist up.';
      if (n >= Sensing.MAX_PLAYERS) hint = 'Freeze can follow 6 players at a time. If there are more of you, swap players between games.';
      else if (n > 0) hint = S.SIZES[S.sizeFor(n)].stand + ' Everyone should have a name tag.';
      if ($('ready-hint').textContent !== hint) $('ready-hint').textContent = hint;
    }
  }

  // ---------- Drawing ----------
  // Shapes: colour the people teal inside the shape and with coral stripes outside it, with a
  // faint yellow where the shape is still empty. Then draw the outline like floor tape.
  function drawOverlay(ctx, dw, dh, mask, shapeMask, shape, w, h, layer) {
    const lctx = layer.getContext('2d');
    const img = lctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0, p = 0; p < w * h; p++, i += 4) {
      const m = mask ? mask[p] : 0;
      const s = shapeMask ? shapeMask[p] : 0;
      if (m && s) {
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

  // Body points to screen pixels.
  function toScreen(pt, dw, dh) {
    return { x: (pt.x / st.aspect) * dw, y: pt.y * dh };
  }

  const ARMS = [
    [Pose.P.L_SHOULDER, Pose.P.R_SHOULDER],
    [Pose.P.L_SHOULDER, Pose.P.L_ELBOW],
    [Pose.P.L_ELBOW, Pose.P.L_WRIST],
    [Pose.P.R_SHOULDER, Pose.P.R_ELBOW],
    [Pose.P.R_ELBOW, Pose.P.R_WRIST],
  ];

  // Name tags over each player, the lines Freeze sees along their arms, and what counts this round.
  function drawPlayers(ctx, dw, dh, round) {
    const unit = Math.max(1, dw / 640);
    st.players.forEach((p) => {
      // Tags and arm lines are white, so they don't look like the teal "right" or coral "wrong".
      const colour = '#eef1f7';
      const k = Pose.size(p);
      ctx.lineCap = 'round';
      ctx.strokeStyle = colour;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 3 * unit;
      for (const [a, b] of ARMS) {
        if (!Pose.seen(p, a) || !Pose.seen(p, b)) continue;
        const A = toScreen(p[a], dw, dh);
        const B = toScreen(p[b], dw, dh);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (round && round.type === 'hands') {
        for (const [side, wi] of [['left', Pose.P.L_WRIST], ['right', Pose.P.R_WRIST]]) {
          if (!Pose.handUp(p, side)) continue;
          const W = toScreen(p[wi], dw, dh);
          ctx.beginPath();
          ctx.arc(W.x, W.y, 14 * unit, 0, Math.PI * 2);
          ctx.lineWidth = 5 * unit;
          ctx.strokeStyle = '#ffd23f';
          ctx.stroke();
        }
      }
      const c = Pose.centre(p);
      const head = toScreen({ x: Pose.seen(p, Pose.P.NOSE) ? p[Pose.P.NOSE].x : c.x, y: Pose.headY(p) - 0.45 * k }, dw, dh);
      if (round && round.type === 'pose') {
        // A ring round each head: solid teal when the player is copying the pose, dashed coral when not.
        const ok = Pose.matches(p, round.card);
        ctx.beginPath();
        ctx.arc(head.x, Pose.headY(p) * dh, k * 0.32 * dh, 0, Math.PI * 2);
        ctx.lineWidth = 6 * unit;
        ctx.strokeStyle = ok ? '#35d6c0' : '#ff6b7f';
        ctx.setLineDash(ok ? [] : [10 * unit, 8 * unit]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // the tag
      const label = 'P' + p.id;
      ctx.font = `700 ${Math.round(18 * unit)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
      const tw = ctx.measureText(label).width + 16 * unit;
      const th = 26 * unit;
      const tx = Math.max(2, Math.min(dw - tw - 2, head.x - tw / 2));
      const ty = Math.max(2, head.y - th - 6 * unit);
      ctx.fillStyle = colour;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, th / 2);
      else ctx.rect(tx, ty, tw, th);
      ctx.fill();
      ctx.fillStyle = '#0f1320';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx + 8 * unit, ty + th / 2 + 1);
    });
  }

  function draw() {
    if (st.screen !== 'ready' && st.screen !== 'play') return;
    const dw = view.width;
    const dh = view.height;
    if (st.mode === 'camera' && st.video) {
      viewCtx.save();
      viewCtx.setTransform(-1, 0, 0, 1, dw, 0); // mirror, so it works like a mirror
      viewCtx.drawImage(st.video, 0, 0, dw, dh);
      viewCtx.restore();
    } else {
      viewCtx.imageSmoothingEnabled = true;
      viewCtx.drawImage(cap, 0, 0, dw, dh);
    }
    viewCtx.fillStyle = 'rgba(15, 19, 32, 0.25)'; // dim the picture a little so the colours stand out
    viewCtx.fillRect(0, 0, dw, dh);
    const round = currentRound();
    if (round && round.type === 'shape') drawOverlay(viewCtx, dw, dh, st.mask, shapeMaskFor(round.shape), round.shape, st.w, st.h, over);
    drawPlayers(viewCtx, dw, dh, round);
  }

  // The pose card: a stick figure doing the pose, shown like a mirror, the way players see themselves.
  function drawCard(round) {
    const card = $('card');
    if (!round || round.type !== 'pose') {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const ctx = card.getContext('2d');
    const w = card.width;
    const h = card.height;
    ctx.clearRect(0, 0, w, h);
    const scene = { aspect: w / h };
    const f = { cx: 0.5, top: 0.3, width: 0.4, shapeRound: false, left: P.CARD_ARMS[round.card][0], right: P.CARD_ARMS[round.card][1] };
    const pts = P.landmarks(scene, f);
    const sp = (i) => ({ x: (pts[i].x / scene.aspect) * w, y: pts[i].y * h });
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = (a, b) => {
      ctx.beginPath();
      ctx.moveTo(sp(a).x, sp(a).y);
      ctx.lineTo(sp(b).x, sp(b).y);
      ctx.stroke();
    };
    const Pp = Pose.P;
    for (const [a, b] of ARMS) line(a, b);
    const sm = { x: (sp(Pp.L_SHOULDER).x + sp(Pp.R_SHOULDER).x) / 2, y: sp(Pp.L_SHOULDER).y };
    const hm = { x: (sp(Pp.L_HIP).x + sp(Pp.R_HIP).x) / 2, y: sp(Pp.L_HIP).y };
    ctx.beginPath();
    ctx.moveTo(sm.x, sm.y);
    ctx.lineTo(hm.x, hm.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sp(Pp.NOSE).x, sp(Pp.NOSE).y, 0.085 * h, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }

  function hud(now) {
    if (st.screen === 'play' && st.lead) {
      const left = Math.max(0, LEAD_MS / SPEED - ((st.lead.paused ?? now) - st.lead.start));
      const n = playerCount();
      $('hud-round').textContent = 'Starting soon';
      $('callout-main').textContent = 'Get in place';
      $('callout-sub').textContent =
        n < 1 ? 'Nobody in view yet. Step into the picture.' : st.mode === 'practice' ? 'The practice players are getting in place.' : S.SIZES[S.sizeFor(n)].stand;
      const timer = $('timer');
      timer.hidden = false;
      const k = Math.max(1, Math.ceil(left / (1000 / SPEED)));
      timer.textContent = String(k);
      if (k <= 3 && k !== st.lastBeep && st.lead.paused == null) {
        st.lastBeep = k;
        beep(660, 110);
      }
      $('meter-fill').style.width = '0%';
      $('meter-text').textContent = n === 0 ? 'Nobody in view yet' : n === 1 ? '1 player' : `${n} players`;
      $('hud-total').textContent = '0';
      return;
    }
    const g = st.game;
    if (st.screen !== 'play' || !g || g.phase === 'done') return;
    const r = g.rounds[g.round];
    const left = R.remaining(g, now);
    $('hud-round').textContent = `Round ${g.round + 1} of ${g.rounds.length}: ${r.type === 'shape' ? r.what : r.name}`;
    const main = $('callout-main');
    const sub = $('callout-sub');
    const timer = $('timer');
    if (g.phase === 'fill') {
      main.textContent = r.title;
      sub.textContent = r.tip;
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
      sub.textContent = g.round + 1 < g.rounds.length ? 'The next round is coming up.' : 'That was the last round.';
      timer.hidden = true;
    }
    if (!g.rushing || g.phase !== 'fill') $('rush').hidden = true;
    if (st.flashUntil && now > st.flashUntil) {
      $('flash').hidden = true;
      st.flashUntil = 0;
    }
    const L = g.live;
    let share = L.score;
    let text = '';
    if (r.type === 'shape') {
      share = L.filled;
      text = `Filled ${pct(L.filled)}`;
    } else if (r.type === 'hands') {
      const target = L.target || R.handsTarget(r, L.players);
      share = Math.min(1, L.hands / target);
      text = `Hands up: ${L.hands} of ${target}`;
    } else {
      text = `Copying: ${L.matching} of ${L.players} ${L.players === 1 ? 'player' : 'players'}`;
    }
    $('meter-fill').style.width = Math.round(100 * share) + '%';
    $('meter-text').textContent = text;
    $('meter').setAttribute('aria-valuenow', String(Math.round(100 * share)));
    $('hud-total').textContent = String(R.total(g));
  }

  // One error, such as the graphics chip being reset, must not stop the game for good: the next
  // frame is always asked for first, and body tracking is rebuilt on the processor.
  function loop(now) {
    requestAnimationFrame(loop);
    try {
      if (now - st.lastStep >= STEP_MS) {
        st.lastStep = now;
        process(now);
      }
      draw();
      hud(now);
    } catch (err) {
      trackingFailed(err);
    }
  }

  function trackingFailed(err) {
    if (st.mode !== 'camera' || !st.tracking) {
      console.error(err);
      return;
    }
    st.tracking = false;
    st.errors++;
    pauseGame('Body tracking stopped for a moment. Resume works again when it has restarted.');
    $('btn-resume').disabled = true;
    if (st.screen === 'ready') {
      $('ready-error').textContent = 'Body tracking stopped for a moment. It is restarting.';
      $('ready-error').hidden = false;
    }
    const ticket = st.ticket;
    const retry = st.errors <= 2 ? Sensing.rebuild() : Promise.reject(err);
    retry
      .then(() => {
        if (ticket !== st.ticket) return;
        st.tracking = true;
        $('btn-resume').disabled = false;
        $('ready-error').hidden = true;
      })
      .catch(() => {
        if (ticket !== st.ticket) return;
        st.trackDead = true;
        $('btn-resume').disabled = false;
        if (st.screen === 'ready') {
          $('ready-error').textContent = 'Body tracking stopped. Go back, then start the camera again.';
          $('ready-error').hidden = false;
          return;
        }
        pauseGame();
        const why = $('pause-reason');
        why.textContent = 'Body tracking stopped. Choose End the game, then start the camera again.';
        why.hidden = false;
        $('btn-resume').hidden = true; // resuming would play on with nobody tracked
        $('btn-quit').focus();
      });
  }

  // ---------- Start-screen preview ----------
  const preview = { canvas: $('preview'), raf: 0, scene: null, prev: 0 };

  function previewSetup() {
    if (preview.scene) return;
    preview.scene = P.createScene({ players: 4, seed: 3 });
    const shape = Object.assign({ id: 'steps' }, S.SHAPES.steps);
    preview.round = { type: 'shape', shape };
    preview.shapeMask = S.rasterize(shape, 160, 120);
    preview.ctx = preview.canvas.getContext('2d');
    preview.over = document.createElement('canvas');
    preview.over.width = 160;
    preview.over.height = 120;
  }

  function previewFrame(now) {
    const cycle = 7000;
    const t = reduceMotion ? 6000 : (now + 4500) % cycle; // open with the players already in the shape
    const phase = t < 5000 ? 'fill' : 'freeze';
    const f = P.frame(preview.scene, { present: true, round: preview.round, roundIndex: 0, phase, elapsed: phase === 'fill' ? t : t - 5000, fillMs: 5000, t: now });
    const ctx = preview.ctx;
    ctx.putImageData(new ImageData(f.rgba, 320, 240), 0, 0);
    ctx.fillStyle = 'rgba(15, 19, 32, 0.25)';
    ctx.fillRect(0, 0, 320, 240);
    drawOverlay(ctx, 320, 240, V.shrinkMask(f.mask, 320, 240, 2), preview.shapeMask, preview.round.shape, 160, 120, preview.over);
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
  $('btn-play').addEventListener('click', startGame);
  $('btn-ready-back').addEventListener('click', quitToStart);
  $('btn-pause').addEventListener('click', () => pauseGame());
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-pause-change').addEventListener('click', openReady);
  $('btn-quit').addEventListener('click', quitToStart);
  $('btn-again').addEventListener('click', () => {
    setGame(st.kind);
    startGame();
  });
  $('btn-change').addEventListener('click', openReady);
  $('btn-done-quit').addEventListener('click', quitToStart);
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-full').addEventListener('click', toggleFull);

  function setGame(kind) {
    const r = document.querySelector(`input[name="game"][value="${kind}"]`);
    if (r) r.checked = true;
  }

  function toggleSound() {
    st.sound = !st.sound;
    $('btn-sound').textContent = st.sound ? 'Turn sound off' : 'Turn sound on';
    if (!st.sound && 'speechSynthesis' in window) window.speechSynthesis.cancel();
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

  // The space bar always pauses during play, even when a button in the bottom bar has focus.
  // Buttons in the pause dialog keep their normal behaviour, so Space on Resume resumes.
  const inBar = (t) => t instanceof Element && $('play-bar').contains(t);
  document.addEventListener('keydown', (e) => {
    if (st.screen !== 'play') return;
    const paused = st.lead ? st.lead.paused != null : st.game && st.game.paused !== null;
    const barButton = inBar(e.target);
    if (e.code === 'Space' && barButton) e.preventDefault(); // stop the focused button from pressing itself
    if (e.repeat) return;
    if (e.key === 'Escape' && paused) {
      e.preventDefault();
      resumeGame();
    } else if (e.code === 'Space' && (barButton || !(e.target instanceof HTMLButtonElement))) {
      e.preventDefault();
      togglePause();
    } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      toggleSound();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (st.screen === 'play' && e.code === 'Space' && inBar(e.target)) e.preventDefault();
  });

  show('start');
  requestAnimationFrame(loop);
})();
