// Builds the static site for isdn1001.lbzeng.com into site/dist:
//   /          the home page (site/index.html)
//   /freeze/   the Freeze camera game (game/)
//   /minibus/  the Minibus demo with pretend friends (prototype/, demo mode)
// Every page gets a noindex tag. site/worker-build.mjs then packs this into the Cloudflare Worker,
// which sends the headers from site/_headers (including noindex) with every file.
// Usage: node site/build.mjs
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(here, 'dist');
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

function addNoindex(html) {
  if (html.includes('name="robots"')) return html;
  const at = html.indexOf('<title>');
  if (at < 0) throw new Error('No <title> to put the noindex tag next to');
  return html.slice(0, at) + NOINDEX + '\n' + html.slice(at);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Home page and headers
await writeFile(path.join(out, 'index.html'), addNoindex(await readFile(path.join(here, 'index.html'), 'utf8')));
await cp(path.join(here, '_headers'), path.join(out, '_headers'));

// Freeze: the page, the styles and the scripts. Tests, the server and the README stay out.
await mkdir(path.join(out, 'freeze', 'js'), { recursive: true });
await writeFile(path.join(out, 'freeze', 'index.html'), addNoindex(await readFile(path.join(root, 'game', 'index.html'), 'utf8')));
await cp(path.join(root, 'game', 'styles.css'), path.join(out, 'freeze', 'styles.css'));
for (const f of ['vision.js', 'shapes.js', 'rounds.js', 'practice.js', 'game.js']) {
  await cp(path.join(root, 'game', 'js', f), path.join(out, 'freeze', 'js', f));
}

// Minibus: its index.html is a page fragment, so wrap it the way prototype/server.js does,
// in demo mode (pretend friends on one device, nothing sent to a server).
const fragment = await readFile(path.join(root, 'prototype', 'index.html'), 'utf8');
if (!fragment.includes('<meta name="minibus-backend" content="local">')) throw new Error('Minibus page is not in demo mode');
const minibus =
  '<!doctype html><html lang="en" class="standalone"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '</head><body>' +
  addNoindex(fragment) +
  '</body></html>';
await mkdir(path.join(out, 'minibus', 'js'), { recursive: true });
await writeFile(path.join(out, 'minibus', 'index.html'), minibus);
await cp(path.join(root, 'prototype', 'styles.css'), path.join(out, 'minibus', 'styles.css'));
for (const f of ['app.js', 'logic.js', 'store.js']) {
  await cp(path.join(root, 'prototype', 'js', f), path.join(out, 'minibus', 'js', f));
}

console.log('Built', path.relative(root, out));
