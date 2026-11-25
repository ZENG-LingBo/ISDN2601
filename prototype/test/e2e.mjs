// Browser walkthrough of both versions, with phone-size screenshots.
// Not part of `npm test` because it needs a Chromium. Usage:
//   node test/e2e.mjs <screenshot-dir> [path-to-playwright]
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

async function serve(backend) {
  const inst = await createMinibusServer({ dataFile: path.join(dataDir, `${backend}.json`), backend });
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
    if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push(`${who}: failed ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${who}: ${m.text()}`);
  });
}

async function shot(page, name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
}

const step = (msg) => console.log(`- ${msg}`);

// Fonts come from Google; block them so runs are offline and repeatable.
async function context(opts = {}) {
  const ctx = await browser.newContext({ ...phone, ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return ctx;
}

// ---------------------------------------------------------------- server mode, two friends
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
  await mandy.fill('#c-crew', 'O-camp gang');
  await mandy.fill('#c-size', '3');
  await mandy.click('button.chip:has-text("hotpot")');
  await mandy.fill('#c-seats', '2');
  await mandy.check('input[name="budget"][value="$100–200"]', { force: true });
  await mandy.fill('#c-name', 'Mandy');
  await shot(mandy, '02-create-form');
  await mandy.click('button:has-text("Make the link")');
  await mandy.waitForSelector('#share-text');
  await shot(mandy, '03-share');
  const planHash = (await mandy.textContent('#share-text')).match(/#plan-[a-z0-9]+-[a-z0-9]+/)[0];
  step('server: plan created and share message shows a link');

  await mandy.click('text=Go to the plan');
  await mandy.click('button:has-text("Yeah, I\'m in")');
  const firstOpen = mandy.locator('button.cell:not([disabled])').nth(4);
  const slot = await firstOpen.getAttribute('data-slot');
  await firstOpen.click();
  await mandy.waitForSelector(`button.cell.mine[data-slot="${slot}"]`);
  await shot(mandy, '04-plan-open');
  step('server: Mandy answered and picked a time');

  await jason.goto(url + planHash);
  await jason.waitForSelector('#j-name');
  await shot(jason, '05-join-dark');
  await jason.fill('#j-name', 'Jason');
  await jason.click('button:has-text("Join")');
  await jason.waitForSelector('text=Would you actually go?');
  const countText = await jason.textContent(`button.cell[data-slot="${slot}"] .cell-count`);
  if (!/1 free/.test(countText)) throw new Error(`Jason should see 1 free, saw "${countText}"`);
  await jason.click('button:has-text("Yeah, I\'m in")');
  await jason.click(`button.cell[data-slot="${slot}"]`);
  await jason.waitForSelector('text=Enough of you are free.');
  await shot(jason, '06-ready-dark');
  step('server: Jason joined from the link and the plan became ready');

  // Mandy's page updates live, without a reload.
  await mandy.waitForSelector('text=Enough of you are free.', { timeout: 8000 });
  step('server: Mandy saw it update live');
  await mandy.click('button:has-text("Lock it in")');
  await mandy.waitForSelector("text=It's actually happening.");
  await shot(mandy, '07-locked');
  const going = await mandy.textContent('.status.go');
  if (!/Mandy/.test(going) || !/Jason/.test(going)) throw new Error('names should show once locked');
  step('server: locked, names revealed');

  await jason.waitForSelector("text=It's actually happening.", { timeout: 8000 });
  await jason.click("text=Can't make it anymore?");
  await shot(jason, '08-swap-dark');
  await jason.click('button:has-text("I can\'t do")');
  await jason.waitForSelector('text=back to picking a time');
  await shot(jason, '09-unlocked-dark');
  step('server: Jason swapped out and the plan went back to picking a time');

  await mandyCtx.close();
  await jasonCtx.close();
  await new Promise((r) => inst.server.close(r));
}

// ---------------------------------------------------------------- local demo mode
{
  const { inst, url } = await serve('local');
  const ctx = await context();
  const page = await ctx.newPage();
  watch(page, 'demo');
  await page.goto(url);
  await page.click('text=Try it with fake friends');
  await page.waitForSelector('#j-name');
  await shot(page, '10-demo-join');
  await page.fill('#j-name', 'Mandy');
  await page.click('button:has-text("Join")');
  await page.waitForSelector('text=Would you actually go?');
  await shot(page, '11-demo-plan');
  await page.click('button:has-text("Yeah, I\'m in")');
  // The demo friends overlap on one time; joining it fills the third seat.
  const best = await page.locator('button.cell.best').getAttribute('data-slot');
  await page.click(`button.cell[data-slot="${best}"]`);
  await page.waitForSelector('text=Enough of you are free.');
  step('demo: joining the best time made it ready');
  await page.click('button:has-text("Tom finally answers")');
  await page.waitForSelector("text=It's actually happening.");
  await shot(page, '12-demo-locked');
  step('demo: Tom answered, everyone had answered, so it locked itself');
  const swapper = page.locator('button[data-act="demo"][data-what="swap"]');
  await swapper.click();
  await page.waitForSelector('.banner');
  await shot(page, '13-demo-after-swap');
  step(`demo: after a friend swapped out: ${(await page.textContent('.banner')).trim()}`);

  // Make sure it's locked before skipping ahead.
  if (await page.locator('button[data-act="lock"]').count()) await page.click('button[data-act="lock"]');
  if (await page.locator('button[data-act="demo"][data-what="skip"]').count()) {
    await page.click('button[data-act="demo"][data-what="skip"]');
    await page.waitForSelector('text=did it happen?');
    await page.click('button:has-text("Yes, we met")');
    await page.waitForSelector('text=You actually met.');
    await shot(page, '14-demo-met');
    await page.click('.bar-crew');
    await page.waitForSelector('text=hours together this term');
    await shot(page, '15-demo-crew');
    step('demo: marked as met and the hours counter went up');
  } else {
    step('demo: plan was not locked after the swap, skipped the "did it happen" part');
  }

  // A second tab plays another friend and stays in sync.
  const tab2 = await ctx.newPage();
  watch(tab2, 'demo-tab2');
  await tab2.goto(page.url());
  await tab2.waitForSelector('main h1, main h2');
  step('demo: a second tab opens the same plan');
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
