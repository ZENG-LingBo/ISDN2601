// Browser walkthrough of Freeze, with screenshots.
// Not part of `npm test` because it needs Chromium. Usage:
//   node test/e2e.mjs <screenshot-folder> [path-to-playwright]
// It plays a whole practice game at 8 times the normal speed, then checks that the camera path
// starts with Chromium's pretend camera.
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

const errors = [];
function watch(page, who) {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('requestfailed', (r) => {
    if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push(`${who}: failed ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${who}: ${m.text()}`);
  });
}

function check(ok, what) {
  if (!ok) throw new Error('Check failed: ' + what);
  console.log('ok -', what);
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const laptop = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

try {
  // 1. Practice game
  const ctx = await browser.newContext(laptop);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  watch(page, 'practice');
  await page.goto(base + '?speed=8');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/01-start.png` });
  check(await page.isVisible('#screen-start'), 'start screen shows');
  check(await page.getByRole('radio', { name: '3 to 5' }).isChecked(), '3 to 5 is chosen by default');
  await page.getByRole('radio', { name: '6 or more' }).check();
  await page.getByRole('button', { name: 'Try it without a camera' }).click();
  check(await page.isVisible('#screen-setup'), 'setup screen shows');
  check(await page.isVisible('#setup-mode'), 'setup says these are practice players');
  await page.screenshot({ path: `${outDir}/02-setup.png` });
  await page.getByRole('button', { name: 'Learn the room' }).click();
  check(await page.isVisible('#learn-countdown'), 'countdown shows');
  await page.screenshot({ path: `${outDir}/03-step-out.png` });
  await page.waitForSelector('#setup-after', { state: 'visible', timeout: 5000 });
  check(!(await page.isVisible('#setup-warning')), 'no warning after learning an empty room');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/04-check.png` });
  await page.getByRole('button', { name: 'Start the game' }).click();
  check(await page.isVisible('#screen-play'), 'game starts');
  check((await page.textContent('#hud-round')).startsWith('Round 1 of 5: Big wall'), 'round 1 is Big wall');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/05-fill.png` });
  const filled = await page.evaluate(() => window.__freeze.game.live.filled);
  check(filled > 0.3, `the meter shows the shape filling (${Math.round(filled * 100)}%)`);
  await page.waitForFunction(() => window.__freeze.game.phase === 'freeze', null, { timeout: 4000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/06-freeze.png` });
  check((await page.textContent('#callout-main')).includes('Freeze'), 'Freeze shows');
  await page.waitForSelector('#result', { state: 'visible', timeout: 4000 });
  await page.screenshot({ path: `${outDir}/07-result.png` });
  const points = Number(await page.textContent('#result-points'));
  check(points > 40 && points <= 100, `round 1 gives ${points} points`);
  // Pause and resume with the space bar
  await page.keyboard.press('Space');
  check(await page.isVisible('#pause'), 'space pauses');
  const phaseBefore = await page.evaluate(() => [window.__freeze.game.phase, window.__freeze.game.round]);
  await page.waitForTimeout(1200);
  const phaseAfter = await page.evaluate(() => [window.__freeze.game.phase, window.__freeze.game.round]);
  check(JSON.stringify(phaseBefore) === JSON.stringify(phaseAfter), 'the game waits while paused');
  await page.screenshot({ path: `${outDir}/08-paused.png` });
  await page.getByRole('button', { name: 'Resume' }).click();
  check(!(await page.isVisible('#pause')), 'resume closes the pause screen');
  await page.waitForSelector('#screen-done', { state: 'visible', timeout: 20000 });
  await page.screenshot({ path: `${outDir}/09-done.png` });
  const total = Number(await page.textContent('#done-total'));
  const rows = await page.locator('#done-rounds tr').count();
  check(rows === 5, '5 rounds are listed');
  check(total > 150 && total < 500, `the practice players scored ${total} of 500`);
  const fidget = await page.evaluate(() => window.__freeze.game.results[2].still);
  check(fidget < 1, `in round 3 one practice player moves, so "held still" is ${Math.round(fidget * 100)}%`);
  check((await page.textContent('#done-mode')).includes('practice'), 'the end screen says the practice players scored');
  await page.getByRole('button', { name: 'Play again' }).click();
  check(await page.isVisible('#screen-play'), 'play again starts a new game');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Quit to the start' }).click();
  check(await page.isVisible('#screen-start'), 'quit goes back to the start');

  // 2. Phone width: nothing sticks out sideways
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await phone.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const pp = await phone.newPage();
  watch(pp, 'phone');
  await pp.goto(base);
  await pp.waitForTimeout(400);
  const wide = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(wide <= 0, 'no sideways scrolling at phone width');
  await pp.screenshot({ path: `${outDir}/10-phone-start.png`, fullPage: true });

  // 3. Camera path with Chromium's pretend camera
  const cam = await browser.newContext({ ...laptop, permissions: ['camera'] });
  await cam.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const cp = await cam.newPage();
  watch(cp, 'camera');
  await cp.goto(base + '?speed=8');
  await cp.getByRole('radio', { name: '1 or 2' }).check();
  await cp.getByRole('button', { name: 'Start the camera' }).click();
  await cp.waitForSelector('#screen-setup', { state: 'visible', timeout: 5000 });
  check(!(await cp.isVisible('#setup-mode')), 'the camera setup has no practice tag');
  await cp.getByRole('button', { name: 'Learn the room' }).click();
  await cp.waitForSelector('#setup-after', { state: 'visible', timeout: 5000 });
  await cp.screenshot({ path: `${outDir}/11-camera-check.png` });
  const size = await cp.evaluate(() => [window.__freeze.w, window.__freeze.h]);
  check(size[0] === 160 && size[1] > 0, `the camera picture is worked on at ${size[0]} x ${size[1]}`);
  await cp.getByRole('button', { name: 'Start the game' }).click();
  await cp.waitForFunction(() => window.__freeze.game && window.__freeze.game.results.length >= 1, null, { timeout: 6000 });
  check(true, 'a camera round finishes');
  await cp.getByRole('button', { name: 'Pause' }).click();
  await cp.getByRole('button', { name: 'Quit to the start' }).click();
  const live = await cp.evaluate(() => window.__freeze.stream);
  check(live === null, 'quitting turns the camera off');

  check(errors.length === 0, 'no errors in the browser' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log('Walkthrough passed.');
} finally {
  await browser.close();
  server.close();
}
