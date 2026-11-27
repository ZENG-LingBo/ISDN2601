// Builds the static site for isdn1001.lbzeng.com into site/dist:
//   /          the home page (site/index.html)
//   /freeze/   the Freeze camera game (game/)
//   /minibus/  the Minibus demo with pretend friends (prototype/, demo mode)
//   /slides/   every slide deck, each on one page with its speaker notes (pitch/*/project)
//   /research/ the user research plan (site/research-intro.md + research/sport-user-research.md)
// Every page gets a noindex tag. site/worker-build.mjs then packs this into the Cloudflare Worker,
// which sends the headers from site/_headers (including noindex) with every file.
// Usage: node site/build.mjs
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdown } from './md.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(here, 'dist');
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

// Your name, as it should appear on the deck covers. Leave it empty to show no name.
const AUTHOR = '';

// The decks, in the order they're listed. Titles are in sentence case, like the rest of the site.
const DECKS = [
  {
    slug: 'pitch',
    dir: 'pitch/sport-deck',
    title: 'We should play sometime',
    intro: 'The 2-minute pitch for the current topic: why university students stop playing sport and games together, the target user, the empathy map, the problem statement and the How Might We question. Freeze is the next stage.',
  },
  {
    slug: 'design-process',
    dir: 'pitch/process-deck',
    title: 'Design process for the first topic',
    intro: 'Every step of the first topic, from "we should hang out" to Minibus 2030: the brief, the research and its limits, the target user and persona, the pain points and empathy map, 4 versions of the problem statement, 6 possible solutions and the choice. The professor later turned this topic down.',
  },
  {
    slug: 'minibus-pitch',
    dir: 'pitch/deck-source',
    title: 'We should hang out',
    intro: "The 2-minute pitch for the first topic: friend groups whose plans never happen. The professor turned this topic down. It's kept as a record of the design process.",
  },
];

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The cover placeholders become the author's name, or nothing.
function fillPlaceholders(html) {
  return html
    .replace(/\[Your name\] · /g, AUTHOR ? esc(AUTHOR) + ' · ' : '')
    .replace(/ · \[date\]/g, '');
}

function deckPage(deck, slides, others) {
  const items = slides
    .map((html, i) => {
      const aside = html.match(/<aside>([\s\S]*?)<\/aside>/);
      const notes = aside ? aside[1].replace(/<[^>]+>/g, '').trim() : '';
      return (
        `<div class="dv-slide" id="slide-${i + 1}">` +
        `<p class="dv-num">Slide ${i + 1} of ${slides.length}</p>` +
        `<div class="dv-frame">${fillPlaceholders(html)}</div>` +
        (notes ? `<p class="dv-notes"><strong>Speaker notes</strong>${esc(notes)}</p>` : '') +
        `</div>`
      );
    })
    .join('\n');
  const links = others.map((d) => `<a class="dv-btn" href="../${d.slug}/">${esc(d.title)}</a>`).join(' ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(deck.title)}</title>
<meta name="description" content="${esc(deck.intro)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Big+Shoulders+Display:wght@900&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<link rel="stylesheet" href="deck.css">
<link rel="stylesheet" href="../viewer.css">
</head>
<body class="dv">
<main class="dv-page">
<div class="dv-head">
<a class="dv-back" href="../">All slides</a>
<h1 class="dv-h1">${esc(deck.title)}</h1>
<p class="dv-intro">${esc(deck.intro)}</p>
<div class="dv-actions"><button id="dv-present" class="dv-btn dv-primary" type="button">Present</button><span>${slides.length} slides. The speaker notes are under each slide.</span></div>
</div>
<div class="dv-deck">
${items}
</div>
<div class="dv-other">
<h2>Other slides</h2>
<div class="dv-actions">${links}</div>
</div>
</main>
<script src="../viewer.js"></script>
</body>
</html>
`;
}

function slidesIndex(decks) {
  const cards = decks
    .map((d) => `<a class="dv-deck-link" href="${d.slug}/"><span class="dv-deck-title">${esc(d.title)}</span><span class="dv-deck-meta">${d.count} slides</span><span>${esc(d.intro)}</span></a>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Slides</title>
<meta name="description" content="Every slide deck from the ISDN 1001 project, with speaker notes.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<link rel="stylesheet" href="viewer.css">
</head>
<body class="dv">
<main class="dv-page">
<div class="dv-head">
<a class="dv-back" href="../">Home</a>
<h1 class="dv-h1">Slides</h1>
<p class="dv-intro">Every slide deck from the project, newest first. Each deck shows all its slides on one page, with the speaker notes under each slide. Choose Present to show them one at a time.</p>
</div>
<div class="dv-decks">
${cards}
</div>
</main>
</body>
</html>
`;
}

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
for (const f of await readdir(path.join(root, 'game', 'js'))) {
  if (f.endsWith('.js')) await cp(path.join(root, 'game', 'js', f), path.join(out, 'freeze', 'js', f));
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

// Slides: one page for each deck, plus a list of decks.
await mkdir(path.join(out, 'slides'), { recursive: true });
await cp(path.join(here, 'slides', 'viewer.css'), path.join(out, 'slides', 'viewer.css'));
await cp(path.join(here, 'slides', 'viewer.js'), path.join(out, 'slides', 'viewer.js'));
for (const deck of DECKS) {
  const dir = path.join(root, deck.dir, 'project');
  const manifest = JSON.parse(await readFile(path.join(dir, 'deck.json'), 'utf8'));
  const slides = [];
  for (const id of manifest.order) slides.push((await readFile(path.join(dir, 'slides', id + '.html'), 'utf8')).trim());
  deck.count = slides.length;
  const target = path.join(out, 'slides', deck.slug);
  await mkdir(target, { recursive: true });
  await cp(path.join(dir, 'deck.css'), path.join(target, 'deck.css'));
  await writeFile(path.join(target, 'index.html'), addNoindex(deckPage(deck, slides, DECKS.filter((d) => d !== deck))));
}
await writeFile(path.join(out, 'slides', 'index.html'), addNoindex(slidesIndex(DECKS)));

// The research plan: where the project is, questions for the TA, then the plan itself.
const intro = await readFile(path.join(here, 'research-intro.md'), 'utf8');
const plan = (await readFile(path.join(root, 'research', 'sport-user-research.md'), 'utf8')).replace(/^# .*\n/, '');
await mkdir(path.join(out, 'research'), { recursive: true });
await writeFile(
  path.join(out, 'research', 'index.html'),
  addNoindex(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>User research plan</title>
<meta name="description" content="Draft plan for the survey, interviews and playtests in the ISDN 1001 project.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<link rel="stylesheet" href="../slides/viewer.css">
<style>
  .md { display: grid; gap: 0.9rem; max-width: 46rem; }
  .md h2 { margin: 1.6rem 0 0; font: 900 2rem/1.1 var(--dv-display); color: var(--dv-tape); }
  .md h3 { margin: 1rem 0 0; font-size: 1.3rem; }
  .md p, .md ul, .md ol, .md blockquote { margin: 0; }
  .md ul, .md ol { display: grid; gap: 0.35rem; padding-left: 1.4rem; }
  .md li ul { margin-top: 0.35rem; }
  .md a { color: var(--dv-fill); }
  .md code { font-size: 0.95em; color: var(--dv-text-2); }
  .md blockquote { padding: 0.8rem 1rem; border-left: 4px solid var(--dv-tape); background: var(--dv-panel); }
  .md-table { overflow-x: auto; }
  .md table { width: 100%; border-collapse: collapse; font-size: 0.98rem; }
  .md th, .md td { padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--dv-line); text-align: left; vertical-align: top; }
  .md th { color: var(--dv-text-2); }
  .draft { justify-self: start; padding: 0.15rem 0.7rem; border: 2px solid var(--dv-tape); border-radius: 999px; color: var(--dv-tape); font-weight: 700; }
</style>
</head>
<body class="dv">
<main class="dv-page">
<div class="dv-head">
<a class="dv-back" href="../">Home</a>
<p class="draft">Draft for discussion</p>
<h1 class="dv-h1">User research plan</h1>
<p class="dv-intro">Where the project is now, the questions I'd like input on, and the plan for the survey, interviews and playtests.</p>
</div>
<div class="md">
${markdown(intro)}
${markdown(plan)}
</div>
</main>
</body>
</html>
`)
);

console.log('Built', path.relative(root, out));
