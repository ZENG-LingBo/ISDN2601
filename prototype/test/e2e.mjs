// Browser walkthrough of both versions, with phone-size screenshots.
// Not part of `npm test` because it needs Chromium. Usage:
//   node test/e2e.mjs <screenshot-folder> [path-to-playwright]
// It starts its own servers on random ports.

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createMinibusServer } from '../server.js';

const outDir = process.argv[2] || 'screens';
const pwPath = process.argv[3] || '/opt/node-tools/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(pwPath);
await mkdir(outDir, { recursive: true });
const dataDir = await mkdtemp(path.join(tmpdir(), 'minibus-e2e-'));
const quiet = { error() {}, log() {} };

async function serve(backend) {
  const inst = await createMinibusServer({ dataFile: path.join(dataDir, `${backend}.json`), backend, log: quiet });
  await new Promise((r) => inst.server.listen(0, '127.0.0.1', r));
  return { inst, url: `http://127.0.0.1:${inst.server.address().port}/` };
}

const errors = [];
const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };

function watch(page, who) {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  // Font requests are blocked on purpose (offline runs), so only count other failures.
  page.on('requestfailed', (r) => {
    if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url()) && !/\/events$/.test(r.url())) errors.push(`${who}: failed ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${who}: ${m.text()}`);
  });
}

async function shot(page, name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const step = (msg) => console.log(`- ${msg}`);

async function context(opts = {}) {
  const ctx = await browser.newContext({ ...phone, ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return ctx;
}

// ---------------------------------------------------------------- server version, two friends
{
  const { inst, url } = await serve('server');
  const mandyCtx = await context();
  const jasonCtx = await context({ colorScheme: 'dark' });
  const mandy = await mandyCtx.newPage();
  const jason = await jasonCtx.newPage();
  watch(mandy, 'mandy');
  watch(jason, 'jason');

  await mandy.goto(url);
  await shot(mandy, '01-start');
  await mandy.click('text=Start a plan');
  await mandy.click('#create-submit');
  await mandy.waitForSelector('.field-error');
  check((await mandy.getAttribute('#c-crew', 'aria-invalid')) === 'true', 'empty group name should be marked invalid');
  check((await mandy.evaluate(() => document.activeElement.id)) === 'c-crew', 'focus should move to the first error');
  await shot(mandy, '02-create-errors');
  step('server: empty form shows errors under the fields and focuses the first one');

  await mandy.fill('#c-crew', 'O-camp gang');
  await mandy.fill('#c-size', '3');
  await mandy.click('button.chip:has-text("Hotpot")');
  await mandy.fill('#c-seats', '2');
  await mandy.check('input[name="budget"][value="$100–200"]', { force: true });
  await mandy.fill('#c-name', 'Mandy');
  await mandy.click('#create-submit');
  await mandy.waitForSelector('#share-text');
  await shot(mandy, '03-share');
  const planHash = (await mandy.textContent('#share-text')).match(/#plan-[a-z0-9]+-[a-z0-9]+/)[0];
  step('server: plan created and the share message has a link');

  await mandy.click('text=Go to the plan');
  await mandy.waitForSelector('#on-yes');
  check((await mandy.evaluate(() => document.activeElement && document.activeElement.id)) === 'page-title', 'after moving to a new screen, focus should be on its heading');
  check(await mandy.locator('button.cell:not([disabled])').count() === 0, 'the time grid should wait until you say if you are in');
  step('server: on a new screen, focus starts on the heading, and the grid waits for "I\'m in"');
  await mandy.click('#on-yes');
  await mandy.waitForSelector('#on-yes[aria-pressed="true"]');
  const focused = await mandy.evaluate(() => document.activeElement && document.activeElement.tagName);
  check(focused && focused !== 'BODY', 'after tapping "I\'m in", focus should not drop to the top of the page');
  // Four quick taps should all be saved.
  const open = mandy.locator('button.cell:not([disabled])');
  const picks = [];
  for (let i = 3; i < 7; i++) picks.push(await open.nth(i).getAttribute('data-slot'));
  for (const slot of picks) await mandy.click(`button.cell[data-slot="${slot}"]`);
  await mandy.waitForTimeout(900);
  await mandy.reload();
  await mandy.waitForSelector('#on-yes');
  for (const slot of picks) check(await mandy.locator(`button.cell.mine[data-slot="${slot}"]`).count(), `quick tap on ${slot} was lost`);
  await shot(mandy, '04-plan-open');
  step('server: four quick taps on the time grid were all saved');
  const slot = picks[0];

  await jason.goto(url + planHash);
  await jason.waitForSelector('#j-name');
  await shot(jason, '05-join-dark');
  await jason.fill('#j-name', 'Mandy');
  await jason.click('#join-submit');
  await jason.waitForSelector('#j-name[aria-invalid="true"]');
  step('server: a name that is already taken shows an error under the field');
  await jason.fill('#j-name', 'Jason');
  await jason.click('#join-submit');
  await jason.waitForSelector('text=Are you in?');
  const firstHeading = await jason.locator('main h2').first().textContent();
  check(firstHeading === 'Are you in?', `a new person should see their own question first, saw "${firstHeading}"`);
  const hidden = await jason.textContent(`button.cell[data-slot="${slot}"] .cell-count`);
  check(hidden.trim() === '', `with 1 person in, counts should be hidden, saw "${hidden}"`);
  step('server: Jason joined; his question comes first and counts stay hidden while only 1 person is in');

  const cell = `button.cell[data-slot="${slot}"]`;
  const pageY = (page, sel) => page.$eval(sel, (el) => el.getBoundingClientRect().top + window.scrollY);
  const yBefore = await pageY(jason, cell);
  await jason.click('#on-yes');
  await jason.click(cell);
  await jason.waitForSelector('text=Enough people are free', { timeout: 8000 });
  await jason.waitForSelector('#go-status');
  const yAfter = await pageY(jason, cell);
  check(Math.abs(yAfter - yBefore) < 60, `the grid jumped by ${Math.round(yAfter - yBefore)}px after the first answer`);
  step('server: the page did not jump when Jason answered for the first time');
  check(await jason.locator('#copy-joined').count(), 'after answering, the private link box should show');
  await shot(jason, '06-ready-dark');
  step('server: Jason said yes and picked the same time; the plan is ready, with a "Go to confirm" cue and the private link box below');

  await mandy.waitForSelector('text=Enough people are free', { timeout: 8000 });
  step('server: Mandy saw it update live');
  await mandy.click('#confirm');
  await mandy.waitForSelector('text=The plan is confirmed');
  check((await mandy.textContent('#alert')).trim() === '', 'no error should be announced');
  await shot(mandy, '07-confirmed');
  const going = await mandy.textContent('.status.go');
  check(/Mandy/.test(going) && /Jason/.test(going), 'names should show once confirmed');
  step('server: confirmed, and only then names are shown');

  await jason.waitForSelector('text=The plan is confirmed', { timeout: 8000 });
  await jason.click('#swap-open');
  await jason.waitForSelector('#swap-save');
  await shot(jason, '08-change-times-dark');
  await jason.click('#swap-save');
  await jason.waitForSelector('text=choosing a new time');
  await shot(jason, '09-back-to-choosing-dark');
  step('server: Jason changed his times and the group went back to choosing a time');

  await mandy.click('.bar-link');
  await mandy.waitForSelector('#copy-personal');
  await shot(mandy, '10-group-page');
  step('server: the group page offers a private link for other devices');

  check(!(await mandy.locator('#manage-box').count()), 'nobody can be removed straight after joining');
  const mandysLink = await mandy.getAttribute('#copy-personal', 'data-text');
  await jason.goto(mandysLink);
  await jason.waitForSelector('text=Use this group as Mandy?');
  await shot(jason, '10b-switch-prompt-dark');
  await jason.click('#switch-no');
  await jason.waitForSelector('text=Plans');
  check(/Jason \(you\)/.test(await jason.textContent('main')), 'Jason should still be Jason after saying no');
  step("server: opening Mandy's private link on Jason's phone asks first, and Jason stayed Jason");

  await mandyCtx.close();
  await jasonCtx.close();
  await new Promise((r) => inst.server.close(r));
}

// ---------------------------------------------------------------- demo version
{
  const { inst, url } = await serve('local');
  const ctx = await context();
  const page = await ctx.newPage();
  watch(page, 'demo');
  await page.goto(url);
  await page.click('#start-demo');
  await page.waitForSelector('#j-name');
  await shot(page, '11-demo-join');
  await page.fill('#j-name', 'Mandy');
  await page.click('#join-submit');
  await page.waitForSelector('#on-yes');
  await shot(page, '12-demo-plan');
  await page.click('#on-yes');
  await page.waitForSelector('button.cell.best');
  const best = await page.locator('button.cell.best').getAttribute('data-slot');
  await page.click(`button.cell[data-slot="${best}"]`);
  await page.waitForSelector('text=Enough people are free');
  step('demo: picking the best time made the plan ready');

  check(!(await page.locator('#demo-box').getAttribute('open') !== null), 'demo controls should start folded');
  await page.click('#demo-box > summary');
  const mandysCells = await page.$$eval('button.cell.mine', (els) => els.map((e) => e.dataset.slot).join());
  await page.selectOption('#play-as', { label: 'Jason' });
  await page.waitForTimeout(200);
  check((await page.locator('#play-as option:checked').textContent()) === 'Jason', 'should now be playing Jason');
  const jasonsCells = await page.$$eval('button.cell.mine', (els) => els.map((e) => e.dataset.slot).join());
  check(jasonsCells !== mandysCells, 'switching to Jason should show his times straight away, while the menu still has focus');
  await page.selectOption('#play-as', { label: 'Mandy (you)' });
  await page.waitForTimeout(200);
  step('demo: switched to Jason and back');

  await page.click('#demo-tom');
  await page.waitForSelector('text=The plan is confirmed');
  await shot(page, '13-demo-confirmed');
  step('demo: Tom answered, so everyone had answered and Minibus confirmed it');

  await page.click('#demo-swap');
  await page.waitForSelector('.banner');
  const banner = (await page.textContent('.banner')).trim();
  check(/moved from .* to /.test(banner), `expected the plan to move, saw: ${banner}`);
  check((await page.locator("text=The plan moved to a new time").count()) + (await page.locator("text=Can you make it?").count()) >= 1, "the status should say the plan moved, or ask about the new time");
  await shot(page, '14-demo-moved');
  step(`demo: ${banner}`);

  if (await page.locator('text=Can you make it?').count()) {
    await page.click('#join-time');
    await page.waitForSelector('#demo-start');
    step('demo: Mandy was asked about the new time and said yes');
  }
  await page.click('#demo-start');
  await page.waitForSelector('#show-code');
  // Too late to move the plan. Can't make it anymore: the plan stays, and you get a message to send.
  await page.click('#swap-open');
  await page.waitForSelector('#late-out');
  await page.click('#late-out');
  await page.waitForSelector("text=You're no longer going");
  check(/Sorry everyone/.test(await page.textContent('#late-text')), 'the message to send should be shown');
  await shot(page, '14b-demo-off');
  step("demo: close to the start, Mandy said she can't come and got a message to send to the group");
  await page.click('#late-done');
  await page.waitForSelector('#join-time');
  await page.click('#join-time');
  await page.waitForSelector('#show-code');
  check(!(await page.locator("text=Someone can't make it anymore").count()), 'after Mandy joined again, the notice that someone dropped out should go');
  step('demo: Mandy changed her mind and joined again');
  await page.click('#show-code');
  await page.waitForSelector('.code');
  const code = (await page.textContent('.code span[aria-hidden]')).trim();
  check(/^\d{4}$/.test(code), `expected a 4-digit code, saw "${code}"`);
  await shot(page, '15-demo-checkin');
  step(`demo: at the start of the plan, Mandy shows the check-in code (${code})`);
  await page.click('#demo-checkin');
  await page.waitForSelector('h2:has-text("You met")');
  check(/checked in/.test(await page.textContent('.status')), 'the plan should say who checked in');
  await shot(page, '16-demo-met');
  step('demo: a friend typed in the code, so the plan counts as met (checked in)');
  await page.click('.bar-link');
  await page.waitForSelector("text=You've met 1 time");
  await shot(page, '16b-demo-group');
  step('demo: the group page counts it');

  await ctx.close();
  await new Promise((r) => inst.server.close(r));
}

// ---------------------------------------------------------------- narrow screen
{
  const { inst, url } = await serve('local');
  const ctx = await context({ viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  watch(page, 'narrow');
  await page.goto(url);
  await page.click('#start-demo');
  await page.fill('#j-name', 'Mandy');
  await page.click('#join-submit');
  await page.waitForSelector('#on-yes');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `page scrolls sideways at 320px by ${overflow}px`);
  await shot(page, '17-narrow-320');
  step('320px wide: nothing scrolls sideways');
  await ctx.close();
  await new Promise((r) => inst.server.close(r));
}

await browser.close();
await rm(dataDir, { recursive: true, force: true });

if (errors.length) {
  console.error('\nBrowser errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\nAll good. Screenshots in ${outDir}`);
