// Browser walkthrough of Freeze, with screenshots.
// Not part of `npm test` because it needs Chromium. Usage:
//   node test/e2e.mjs <screenshot-folder> [path-to-playwright]
// It plays every game with practice players at 8 times the normal speed. Then it starts the
// camera with Chromium's pretend camera. The body-tracking model's servers are blocked in this
// test, so it checks what players see when the model can't load. The model itself is only
// tried on a real laptop.
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer } = require('../server.js');
const outDir = process.argv[2] || 'screens';
const pwPath = process.argv[3] || '/opt/node-tools/node_modules/playwright';
const { chromium } = require(pwPath);
await mkdir(outDir, { recursive: true });

const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/`;
const BLOCKED = /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|storage\.googleapis\.com/;

const errors = [];
function watch(page, who) {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!BLOCKED.test(r.url())) errors.push(`${who}: failed ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${who}: ${m.text()}`);
  });
}

function check(ok, what) {
  if (!ok) throw new Error('Check failed: ' + what);
  console.log('ok -', what);
}

// The heads-up text updates on the next animation frame, so wait for it.
async function waitText(page, sel, test, what) {
  await page.waitForFunction(([sel, src]) => new RegExp(src).test(document.querySelector(sel).textContent), [sel, test.source], { timeout: 3000 });
  check(true, what);
}

async function newPage(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route(BLOCKED, (r) => r.abort());
  return { ctx, page: await ctx.newPage() };
}

async function playWholeGame(page, game, shots) {
  await page.getByRole('radio', { name: new RegExp('^' + game) }).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  check(await page.isVisible('#screen-play'), `${game}: the game starts`);
  if (shots) {
    await page.waitForFunction(() => window.__freeze.game.phase === 'fill' && window.__freeze.game.live.players > 0, null, { timeout: 4000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${outDir}/${shots}-fill.png` });
  }
  await page.waitForSelector('#screen-done', { state: 'visible', timeout: 40000 });
  const total = Number(await page.textContent('#done-total'));
  check((await page.locator('#done-rounds tr').count()) === 5, `${game}: 5 rounds are listed`);
  check(total > 150 && total < 500, `${game}: the practice players scored ${total} of 500`);
  if (shots) await page.screenshot({ path: `${outDir}/${shots}-done.png` });
  return total;
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const laptop = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

try {
  // 1. Practice players
  const { page } = await newPage(browser, laptop);
  watch(page, 'practice');
  await page.goto(base + '?speed=8');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/01-start.png` });
  check(await page.isVisible('#screen-start'), 'start screen shows');
  await page.getByRole('button', { name: 'Play with practice players' }).click();
  check(await page.isVisible('#screen-ready'), 'the who is playing screen shows');
  await page.waitForFunction(() => document.getElementById('player-count').textContent === '4 players', null, { timeout: 3000 });
  check(true, 'Freeze counts 4 practice players');
  check(await page.isEnabled('#btn-play'), 'the game can start once players are found');
  await page.screenshot({ path: `${outDir}/02-ready.png` });

  // Shapes, with pause checks
  await page.getByRole('radio', { name: /^Shapes/ }).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await waitText(page, '#callout-main', /^Get in place$/, 'the game starts with Get in place, so the person at the laptop can step back');
  await page.screenshot({ path: `${outDir}/03a-get-in-place.png` });
  await page.keyboard.press('Space');
  check(await page.isVisible('#pause'), 'Get in place can be paused too');
  const leadLeft = await page.textContent('#timer');
  await page.waitForTimeout(900);
  check((await page.textContent('#timer')) === leadLeft, 'the Get in place countdown waits while paused');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#pause')), 'Escape resumes Get in place');
  await waitText(page, '#hud-round', /^Round 1 of 5: Wall$/, 'Shapes for 4 players starts with the Wall shape');
  const boxes = await page.evaluate(() => ({
    hud: document.getElementById('play-hud').getBoundingClientRect().bottom,
    bar: document.getElementById('play-bar').getBoundingClientRect().top,
    view: document.getElementById('view').getBoundingClientRect().toJSON(),
  }));
  check(boxes.view.top >= boxes.hud - 1 && boxes.view.bottom <= boxes.bar + 1, 'the top and bottom bands do not cover the picture');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/03-shapes-fill.png` });
  await page.waitForFunction(() => window.__freeze.game.phase === 'freeze', null, { timeout: 5000 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${outDir}/04-freeze.png` });
  await page.waitForSelector('#result', { state: 'visible', timeout: 4000 });
  await page.screenshot({ path: `${outDir}/05-result.png` });
  const points = Number(await page.textContent('#result-points'));
  check(points > 40 && points <= 100, `Shapes round 1 gives ${points} points`);
  await page.keyboard.press('Space');
  check(await page.isVisible('#pause'), 'space pauses');
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true })));
  check(await page.isVisible('#pause'), 'a held space key does not flip pause back and forth');
  const before = await page.evaluate(() => [window.__freeze.game.phase, window.__freeze.game.round]);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => [window.__freeze.game.phase, window.__freeze.game.round]);
  check(JSON.stringify(before) === JSON.stringify(after), 'the game waits while paused');
  await page.screenshot({ path: `${outDir}/06-paused.png` });
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#pause')), 'Escape resumes');
  await page.locator('#btn-sound').focus();
  await page.keyboard.press('Space');
  check(await page.isVisible('#pause'), 'space pauses even when the sound button has focus');
  check(await page.evaluate(() => window.__freeze.sound) === true, 'space does not press the focused sound button');
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check(await page.isVisible('#pause'), 'switching to another tab pauses the game');
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }));
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForSelector('#screen-done', { state: 'visible', timeout: 40000 });
  const shapes = Number(await page.textContent('#done-total'));
  check(shapes > 150 && shapes < 500, `Shapes: the practice players scored ${shapes} of 500`);
  check((await page.textContent('#done-mode')).includes('practice'), 'the end screen says the practice players scored');
  await page.screenshot({ path: `${outDir}/07-done.png` });

  // Hands up
  await page.getByRole('button', { name: 'Choose another game' }).click();
  check(await page.isVisible('#screen-ready'), 'choose another game goes back to the who is playing screen');
  await page.getByRole('radio', { name: /^Hands up/ }).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await waitText(page, '#callout-main', /^Show 4 hands$/, 'Hands up for 4 players starts with Show 4 hands');
  await page.waitForFunction(() => window.__freeze.game.phase === 'freeze', null, { timeout: 5000 });
  await page.screenshot({ path: `${outDir}/08-hands-freeze.png` });
  await page.waitForSelector('#result', { state: 'visible', timeout: 4000 });
  check(/^\d+ of \d+$/.test(await page.textContent('#result-a')), 'the Hands up result shows hands up out of the target');
  await page.waitForFunction(() => window.__freeze.game.results.length >= 1, null, { timeout: 4000 });
  const first = await page.evaluate(() => window.__freeze.game.results[0]);
  check(first.hands === 4 && first.target === 4 && first.points > 0, 'round 1: 4 hands up out of 4');
  await page.waitForSelector('#screen-done', { state: 'visible', timeout: 40000 });
  const hands = Number(await page.textContent('#done-total'));
  check(hands > 150 && hands < 500, `Hands up: the practice players scored ${hands} of 500`);

  // Copy the pose
  await page.getByRole('button', { name: 'Choose another game' }).click();
  await page.getByRole('radio', { name: /^Copy the pose/ }).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await waitText(page, '#callout-main', /^Both arms up$/, 'Copy the pose starts with Both arms up');
  check(await page.isVisible('#card'), 'the pose card shows');
  await page.waitForFunction(() => window.__freeze.game.phase === 'freeze', null, { timeout: 5000 });
  await page.screenshot({ path: `${outDir}/09-pose-freeze.png` });
  await page.waitForSelector('#screen-done', { state: 'visible', timeout: 40000 });
  const pose = Number(await page.textContent('#done-total'));
  check(pose > 150 && pose < 500, `Copy the pose: the practice players scored ${pose} of 500`);
  const round3 = await page.evaluate(() => window.__freeze.game.results[2]);
  // Holding still is checked at normal speed in the unit tests; at 8 times the speed a fidget is too short to count.
  check(round3.matched < 1, 'in round 3 one practice player does the wrong pose');

  // Mix, with 7 players, then play again
  await page.getByRole('button', { name: 'Choose another game' }).click();
  await page.getByRole('radio', { name: '6' }).check();
  await page.waitForFunction(() => document.getElementById('player-count').textContent === '6 players', null, { timeout: 3000 });
  check(true, 'Freeze counts 6 practice players');
  await page.getByRole('radio', { name: /^Mix/ }).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await waitText(page, '#hud-round', /^Round 1 of 5: Big wall$/, 'Mix for 6 players starts with the Big wall shape');
  await page.waitForSelector('#screen-done', { state: 'visible', timeout: 40000 });
  const kinds = await page.evaluate(() => window.__freeze.game.results.map((r) => r.type).join(','));
  check(kinds === 'shape,hands,pose,shape,pose', 'Mix plays each kind of round');
  await page.screenshot({ path: `${outDir}/10-mix-done.png` });
  await page.getByRole('button', { name: 'Play again' }).click();
  check(await page.isVisible('#screen-play'), 'play again starts the same game');
  await waitText(page, '#hud-round', /^Round 1 of 5/, 'play again goes from Get in place to round 1');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'End the game' }).click();
  check(await page.isVisible('#screen-start'), 'end the game goes back to the start');

  // 2. Phone width
  const { page: pp } = await newPage(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  watch(pp, 'phone');
  await pp.goto(base);
  await pp.waitForTimeout(400);
  check((await pp.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no sideways scrolling at phone width');
  await pp.getByRole('button', { name: 'Play with practice players' }).click();
  await pp.waitForTimeout(400);
  check((await pp.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'the who is playing screen fits at phone width');
  await pp.screenshot({ path: `${outDir}/11-phone-ready.png` });

  // 3. Camera, with the body-tracking model blocked
  const { ctx: cctx, page: cp } = await newPage(browser, laptop);
  await cctx.grantPermissions(['camera'], { origin: base.replace(/\/$/, '') });
  watch(cp, 'camera');
  await cp.goto(base + '?speed=8');
  await cp.getByRole('button', { name: 'Start the camera' }).click();
  await cp.waitForSelector('#screen-ready', { state: 'visible', timeout: 6000 });
  check(!(await cp.isVisible('#ready-mode')), 'the camera screen has no practice tag');
  check(await cp.evaluate(() => document.activeElement.id) === 'ready-title', 'focus goes to the screen title');
  check(await cp.isVisible('#ready-gesture'), 'the camera screen says players can raise both hands to start');
  check((await cp.evaluate(() => [window.__freeze.w, window.__freeze.h].join('x'))) === '160x90', 'the camera picture is worked on at 160 x 90');
  await cp.waitForSelector('#ready-error', { state: 'visible', timeout: 10000 });
  check((await cp.textContent('#ready-error')).includes("couldn't load body tracking"), 'if the model cannot load, the screen says so');
  check(!(await cp.isEnabled('#btn-play')), 'the game cannot start without body tracking');
  await cp.screenshot({ path: `${outDir}/12-camera-no-model.png` });
  await cp.getByRole('button', { name: 'Back' }).click();
  check((await cp.evaluate(() => window.__freeze.stream)) === null, 'going back turns the camera off');

  check(errors.length === 0, 'no errors in the browser' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Walkthrough passed.');
} finally {
  await browser.close();
  server.close();
}
