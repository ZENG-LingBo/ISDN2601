// Minibus UI. Plain DOM, no framework. Every screen is a function that returns HTML
// built only from escaped values, and clicks are handled in one place.

import * as L from './logic.js';
import { createStore, identity } from './store.js';

const store = createStore();
const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

let route = parseRoute();
let view = null; // the current group's view from the store
let loadError = '';
let unsubscribe = null;
let subscribedTo = null;
let busy = false;
const ui = { swapOpen: false };

// ---------------------------------------------------------------- helpers

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseRoute() {
  const h = decodeURIComponent(location.hash.slice(1));
  let m;
  if (h === 'new') return { name: 'new' };
  if ((m = /^plan-([a-z0-9]+)-([a-z0-9]+)$/.exec(h))) return { name: 'plan', crewId: m[1], hangId: m[2] };
  if ((m = /^shared-([a-z0-9]+)-([a-z0-9]+)$/.exec(h))) return { name: 'shared', crewId: m[1], hangId: m[2] };
  if ((m = /^newplan-([a-z0-9]+)$/.exec(h))) return { name: 'newplan', crewId: m[1] };
  if ((m = /^crew-([a-z0-9]+)$/.exec(h))) return { name: 'crew', crewId: m[1] };
  return { name: 'start' };
}

function go(hash) {
  if (location.hash.slice(1) === hash) {
    route = parseRoute();
    load();
  } else {
    location.hash = hash;
  }
  window.scrollTo(0, 0);
}

function linkTo(hash) {
  return `${location.href.split('#')[0]}#${hash}`;
}

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

function currentHang() {
  return view && route.hangId ? view.hangs.find((h) => h.id === route.hangId) : null;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// Keep what someone is typing when a friend's change re-renders the screen.
function preserveInputs(renderFn) {
  const active = document.activeElement;
  const activeId = active && active.id;
  const values = {};
  app.querySelectorAll('input[id], textarea[id]').forEach((el) => {
    if (el.type !== 'radio' && el.type !== 'checkbox') values[el.id] = el.value;
  });
  const selection = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  renderFn();
  for (const [id, value] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el && el.value !== value && value !== '') el.value = value;
  }
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus({ preventScroll: true });
      if (selection && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(selection[0], selection[1]);
        } catch {
          /* number inputs don't support selection */
        }
      }
    }
  }
}

// ---------------------------------------------------------------- loading

async function load() {
  const crewId = route.crewId || null;
  if (crewId !== subscribedTo) {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    subscribedTo = crewId;
    view = null;
    ui.swapOpen = false;
    if (crewId) unsubscribe = store.subscribe(crewId, refresh);
  }
  if (crewId) await refresh();
  else render();
}

async function refresh() {
  if (!route.crewId) return;
  try {
    view = await store.view(route.crewId);
    loadError = '';
  } catch (e) {
    loadError = e.message;
  }
  preserveInputs(render);
}

// ---------------------------------------------------------------- screens

function topBar() {
  const crew = view && view.crew;
  return `<header class="bar">
    <a class="brand" href="#start" aria-label="Minibus home">Minibus</a>
    ${crew && route.name !== 'crew' ? `<a class="bar-crew" href="#crew-${esc(crew.id)}">${esc(crew.name)}</a>` : ''}
  </header>`;
}

function startScreen() {
  const mine = identity.crews();
  const local = store.kind === 'local';
  return `
  <section class="hero">
    <h1 class="hero-title">we should hang out.</h1>
    <p class="lede">Everyone says it. Nobody books it. Minibus turns it into an actual time and place, and nobody has to be the one chasing everyone.</p>
    <div class="actions">
      <a class="btn primary" href="#new">Start a plan</a>
      ${local ? '<button class="btn" type="button" data-act="start-demo">Try it with fake friends</button>' : ''}
    </div>
  </section>

  ${mine.length ? `<section class="block">
    <h2>Your groups</h2>
    <ul class="list">${mine.map((c) => `<li><a href="#crew-${esc(c.id)}">${esc(c.name)}</a></li>`).join('')}</ul>
  </section>` : ''}

  <section class="block">
    <h2>How it works</h2>
    <ol class="steps">
      <li><b>Someone drops the link in the group chat.</b> Answering takes about 20 seconds.</li>
      <li><b>You say if you'd actually go.</b> Everyone else only sees how many said yes, not who, so nobody looks too keen.</li>
      <li><b>You tap when you're free.</b> Lunch, afternoon or evening, any day this week.</li>
      <li><b>It leaves once enough of you can make the same time.</b> Like a red minibus that goes when the seats fill up. The app picks the time, not you.</li>
      <li><b>Can't make it anymore?</b> Swap to another time instead of bailing. The plan moves instead of dying.</li>
    </ol>
  </section>

  ${local ? `<section class="block notice">
    <h2>About this demo</h2>
    <p>This version keeps everything on this device. Open the plan in a second tab and join as someone else to play two friends at once. To use it with real friends on their own phones, run the small server that comes with it (instructions in the README).</p>
  </section>` : ''}`;
}

const IDEAS = ['dinner somewhere cheap', 'lunch on campus', 'bubble tea and a walk', 'karaoke', 'hotpot', 'beach in Sai Kung'];
const PLACES = ['Hang Hau', 'Tseung Kwan O', 'Mong Kok', 'Sai Kung', 'campus canteen'];

function ideaFields(prefix) {
  return `
    <fieldset class="field">
      <legend>What's the plan?</legend>
      <div class="chips">${IDEAS.map((i) => `<button type="button" class="chip" data-act="fill" data-target="${prefix}-idea" data-value="${esc(i)}">${esc(i)}</button>`).join('')}</div>
      <label class="sr-only" for="${prefix}-idea">Plan</label>
      <input id="${prefix}-idea" name="idea" maxlength="${L.LIMITS.idea}" placeholder="or type your own" required autocomplete="off">
    </fieldset>
    <div class="field">
      <label for="${prefix}-seats">How many people makes it worth going?</label>
      <input id="${prefix}-seats" name="seats" type="number" inputmode="numeric" min="${L.LIMITS.seatsMin}" max="${L.LIMITS.seatsMax}" value="3" required>
      <p class="help">The plan only locks once this many of you can make the same time.</p>
    </div>
    <fieldset class="field">
      <legend>Budget each</legend>
      <div class="chips">${L.BUDGETS.map((b, i) => `<label class="chip radio"><input type="radio" name="budget" value="${esc(b)}" ${i === 0 ? 'checked' : ''}><span>${b ? esc(b) : 'not sure'}</span></label>`).join('')}</div>
    </fieldset>`;
}

function newCrewScreen() {
  return `
  <section class="block">
    <h1>Start a plan</h1>
    <p class="lede small">Someone said "we should hang out". Let's make it real.</p>
    <form id="create-form" class="form" novalidate>
      <div class="field">
        <label for="c-crew">What's the group called?</label>
        <input id="c-crew" name="crewName" maxlength="${L.LIMITS.crewName}" placeholder="O-camp gang" required autocomplete="off">
      </div>
      <div class="field">
        <label for="c-size">How many people are in the group chat?</label>
        <input id="c-size" name="size" type="number" inputmode="numeric" min="${L.LIMITS.sizeMin}" max="${L.LIMITS.sizeMax}" value="5" required>
      </div>
      ${ideaFields('c')}
      <div class="field">
        <label for="c-name">What do your friends call you?</label>
        <input id="c-name" name="creatorName" maxlength="${L.LIMITS.name}" required autocomplete="nickname">
      </div>
      <button class="btn primary wide" type="submit">Make the link</button>
    </form>
  </section>`;
}

function newPlanScreen() {
  if (!view) return loadingOrMissing();
  if (!view.me) return joinScreen(null);
  return `
  <section class="block">
    <h1>New plan for ${esc(view.crew.name)}</h1>
    <form id="newplan-form" class="form" novalidate>
      ${ideaFields('n')}
      <button class="btn primary wide" type="submit">Make the link</button>
    </form>
  </section>`;
}

function sharedScreen() {
  if (!view) return loadingOrMissing();
  const hang = currentHang();
  if (!hang) return missing();
  const link = linkTo(`plan-${view.crew.id}-${hang.id}`);
  return `
  <section class="block">
    <h1>Now drop it in the group chat</h1>
    <p>Copy this and paste it into your WhatsApp group. It's written to sound like you, not like an app.</p>
    <pre class="message" id="share-text">${esc(L.shareMessage(hang, link))}</pre>
    <div class="actions">
      <button class="btn primary" type="button" data-act="copy" data-source="share-text">Copy message</button>
      <a class="btn" href="#plan-${esc(view.crew.id)}-${esc(hang.id)}">Go to the plan</a>
    </div>
    ${store.kind === 'local' ? '<p class="notice-inline">In this demo the link only opens on this device. Try it in a second tab.</p>' : ''}
  </section>`;
}

function placard(hang) {
  let when = 'still deciding';
  if (hang.lock) when = L.slotLabel(hang.lock.slot);
  else if (hang.best) when = `leaning ${L.slotLabel(hang.best.id)}`;
  let where = 'anywhere';
  if (hang.lock && hang.lock.placeName) where = hang.lock.placeName;
  else if (hang.places.length) where = `leaning ${hang.places[0].name}`;
  return `
  <div class="placard">
    <div class="placard-top">
      <span>${esc(view.crew.name)}</span>
      <span>${hang.budget ? esc(hang.budget) : 'budget tbc'}</span>
    </div>
    <p class="dest">${esc(hang.idea)}</p>
    <dl class="placard-rows">
      <div><dt>When</dt><dd>${esc(when)}</dd></div>
      <div><dt>Where</dt><dd>${esc(where)}</dd></div>
    </dl>
  </div>`;
}

function seats(hang) {
  const total = Math.max(hang.expected, hang.seats);
  const filled = hang.lock ? hang.lock.people.length : hang.onBoard;
  const label = hang.lock
    ? `${plural(filled, 'person is', 'people are')} going`
    : `${filled} of ${hang.expected} said they'd go. It leaves once ${hang.seats} can make the same time.`;
  const cells = Array.from({ length: total }, (_, i) => {
    const cls = ['seat'];
    if (i < filled) cls.push('taken');
    if (i === hang.seats - 1) cls.push('needed');
    return `<span class="${cls.join(' ')}"></span>`;
  }).join('');
  return `<div class="seats-wrap">
    <div class="seats" aria-hidden="true">${cells}</div>
    <p class="seats-text">${esc(label)}</p>
  </div>`;
}

function noteBanner(hang) {
  const n = hang.note;
  if (!n || hang.outcome) return '';
  let text = '';
  if (n.type === 'moved') text = `Someone couldn't make ${L.slotLabel(n.from)} anymore, so the plan moved to ${L.slotLabel(n.to)}. It didn't die.`;
  else if (n.type === 'unlocked') text = `Not enough people can make ${L.slotLabel(n.from)} anymore, so the plan is back to picking a time. Add any other times you could do.`;
  else if (n.type === 'auto') text = `Everyone answered, so the app locked the best time. Nobody had to push.`;
  else if (n.type === 'sent' && n.by) text = `${n.by} locked it in once enough of you were free.`;
  return text ? `<p class="banner">${esc(text)}</p>` : '';
}

function statusBlock(hang) {
  const me = view.me;
  const planLink = linkTo(`plan-${view.crew.id}-${hang.id}`);

  if (hang.status === 'happened') {
    return `<section class="status done">
      <h2>You actually met.</h2>
      <p>That's ${L.slotHours(hang.lock.slot)} more hours together. Your group is at ${view.hours.hours} hours this term.</p>
      <a class="btn" href="#newplan-${esc(view.crew.id)}">Plan the next one</a>
    </section>`;
  }
  if (hang.status === 'fizzled') {
    return `<section class="status">
      <h2>It fell through this time.</h2>
      <p>It happens. Starting the next one takes a minute.</p>
      <a class="btn" href="#newplan-${esc(view.crew.id)}">Start another plan</a>
    </section>`;
  }
  if (hang.status === 'check') {
    return `<section class="status">
      <h2>So... did it happen?</h2>
      <p>${esc(L.slotLabel(hang.lock.slot))}${hang.lock.placeName ? `, ${esc(hang.lock.placeName)}` : ''}. Be honest, it only counts toward your group's hours if you met.</p>
      <div class="actions">
        <button class="btn primary" type="button" data-act="outcome" data-met="1">Yes, we met</button>
        <button class="btn" type="button" data-act="outcome" data-met="0">No, it fell through</button>
      </div>
    </section>`;
  }
  if (hang.status === 'locked') {
    const imGoing = me && hang.lock.people.includes(me.name);
    const calendar = L.calendarUrl(hang, view.crew.name);
    const file = store.calendarFileUrl(view.crew.id, hang.id);
    return `<section class="status go">
      <h2>It's actually happening.</h2>
      <p class="big">${esc(L.slotLabel(hang.lock.slot))}${hang.lock.placeName ? `<br>${esc(hang.lock.placeName)}` : ''}</p>
      <p>Going: ${esc(hang.lock.people.join(', '))}</p>
      <div class="actions">
        <a class="btn primary" href="${esc(calendar)}" target="_blank" rel="noopener">Add to Google Calendar</a>
        ${file ? `<a class="btn" href="${esc(file)}" download>Download .ics</a>` : ''}
        <button class="btn" type="button" data-act="copy" data-source="locked-text">Copy message for the chat</button>
      </div>
      <pre class="message" id="locked-text">${esc(L.lockedMessage(hang, planLink))}</pre>
      ${imGoing ? swapBlock(hang) : ''}
    </section>`;
  }

  const waitingLine = hang.waiting
    ? `Waiting on ${hang.waitingNames.length ? esc(hang.waitingNames.join(', ')) : ''}${hang.waitingNames.length && hang.notJoined ? ' and ' : ''}${hang.notJoined ? `${plural(hang.notJoined, 'person who hasn\'t', 'people who haven\'t')} opened the link yet` : ''}.`
    : 'Everyone has answered.';

  if (hang.status === 'ready') {
    const onBoard = hang.mine.on === true;
    return `<section class="status go">
      <h2>Enough of you are free.</h2>
      <p class="big">${esc(L.slotLabel(hang.best.id))}</p>
      <p>${plural(hang.best.count, 'person', 'people')} can make it. ${hang.waiting ? `It locks on its own once everyone has answered, or you can lock it now.` : ''}</p>
      ${onBoard
        ? '<button class="btn primary wide" type="button" data-act="lock">Lock it in</button>'
        : '<p>Say you\'re in first, then you can lock it.</p>'}
      <p class="muted-line">${waitingLine}</p>
    </section>`;
  }

  return `<section class="status">
    <h2>Still filling up.</h2>
    <p>${waitingLine}</p>
    ${hang.waiting ? `<p>Want to nudge them? This message blames the app, so you don't look desperate.</p>
    <pre class="message" id="nudge-text">${esc(L.nudgeMessage(hang, planLink))}</pre>
    <button class="btn" type="button" data-act="copy" data-source="nudge-text">Copy nudge</button>` : ''}
  </section>`;
}

function swapBlock(hang) {
  if (!ui.swapOpen) {
    return `<button class="btn quiet" type="button" data-act="swap-open">Can't make it anymore?</button>`;
  }
  return `<div class="swap">
    <h3>No stress. Swap instead of bailing.</h3>
    <p>Tap "I can't do this time" and add any other times you could do in the grid below. If enough people still work at another time, the plan moves there instead of dying.</p>
    <div class="actions">
      <button class="btn primary" type="button" data-act="drop-slot">I can't do ${esc(L.slotLabel(hang.lock.slot))}</button>
      <button class="btn" type="button" data-act="drop-out">I'm out this time</button>
      <button class="btn quiet" type="button" data-act="swap-close">Never mind</button>
    </div>
  </div>`;
}

function answerBlock(hang) {
  if (hang.outcome) return '';
  const on = hang.mine.on;
  return `<section class="block">
    <h2>Would you actually go?</h2>
    <p>Be honest. Nobody sees who said yes until the plan locks, only how many.</p>
    <div class="choice" role="group" aria-label="Would you actually go?">
      <button class="btn toggle" type="button" data-act="on" data-on="1" aria-pressed="${on === true}">Yeah, I'm in</button>
      <button class="btn toggle" type="button" data-act="on" data-on="0" aria-pressed="${on === false}">Not this time</button>
    </div>
  </section>`;
}

function gridBlock(hang) {
  if (hang.outcome || hang.mine.on === false) return '';
  const mine = new Set(hang.mine.free);
  const lockSlot = hang.lock ? hang.lock.slot : null;
  const bestId = hang.lock ? lockSlot : hang.best ? hang.best.id : null;
  const rows = hang.days.map((day) => {
    const cells = L.SLOT_TYPES.map((t) => {
      const id = L.slotId(day, t.key);
      const s = hang.slots.find((x) => x.id === id) || { count: 0, past: true };
      const isMine = mine.has(id);
      const cls = ['cell'];
      if (isMine) cls.push('mine');
      if (id === bestId) cls.push('best');
      const countText = s.past ? 'past' : s.count ? `${s.count} free` : '';
      const aria = `${L.slotLabel(id)}. ${s.past ? 'Already passed.' : `${isMine ? 'You are free.' : 'Tap if you are free.'} ${plural(s.count, 'person', 'people')} free.`}${id === bestId ? ' Best time so far.' : ''}`;
      return `<button class="${cls.join(' ')}" type="button" data-act="slot" data-slot="${esc(id)}" aria-pressed="${isMine}" aria-label="${esc(aria)}" ${s.past ? 'disabled' : ''}>
        <span class="cell-mark">${isMine ? 'free' : ''}</span><span class="cell-count">${esc(countText)}</span>
      </button>`;
    }).join('');
    return `<div class="grid-row"><span class="day">${esc(L.dayLabel(day).replace(/ \w+$/, ''))}</span>${cells}</div>`;
  }).join('');
  const bestLine = hang.lock
    ? `Locked: ${L.slotLabel(lockSlot)}. Adding more times helps if someone has to swap.`
    : hang.best
      ? `Best so far: ${L.slotLabel(hang.best.id)}, ${plural(hang.best.count, 'person', 'people')}.`
      : 'Nobody has picked a time yet. Be the first, it takes a few taps.';
  return `<section class="block">
    <h2>When are you free?</h2>
    <p>Tap every slot that works. The numbers count people who said they'd go.</p>
    <div class="grid" role="group" aria-label="When are you free?">
      <div class="grid-row grid-head" aria-hidden="true"><span></span>${L.SLOT_TYPES.map((t) => `<span>${esc(t.label)}</span>`).join('')}</div>
      ${rows}
    </div>
    <p class="grid-best">${esc(bestLine)}</p>
  </section>`;
}

function placesBlock(hang) {
  if (hang.outcome) return '';
  const list = hang.places.length
    ? `<ul class="places">${hang.places.map((p) => `<li>
        <span class="place-name">${esc(p.name)}</span>
        <button class="btn toggle small" type="button" data-act="like" data-place="${esc(p.id)}" aria-pressed="${p.liked}" aria-label="${esc(`${p.liked ? 'Remove your vote for' : 'Vote for'} ${p.name}. ${p.likes} votes.`)}">+1 · ${p.likes}</button>
      </li>`).join('')}</ul>`
    : '<p>No ideas yet. Throw one in.</p>';
  return `<section class="block">
    <h2>Where-ish?</h2>
    ${list}
    <form id="place-form" class="inline-form" novalidate>
      <label class="sr-only" for="p-name">Suggest a place</label>
      <input id="p-name" name="name" maxlength="${L.LIMITS.place}" placeholder="suggest a place" autocomplete="off">
      <button class="btn" type="submit">Add</button>
    </form>
    <div class="chips">${PLACES.filter((p) => !hang.places.some((x) => x.name.toLowerCase() === p.toLowerCase())).map((p) => `<button type="button" class="chip" data-act="add-place" data-value="${esc(p)}">${esc(p)}</button>`).join('')}</div>
  </section>`;
}

function demoBlock(hang) {
  if (!view.crew.demo || !view.me || store.kind !== 'local') return '';
  const tomAnswered = !hang.waitingNames.includes('Tom');
  const swapper = hang.status === 'locked' ? store.demoSwapperName(view.crew.id, hang.id) : null;
  const buttons = [
    !tomAnswered && !hang.outcome ? '<button class="btn" type="button" data-act="demo" data-what="tom">Tom finally answers</button>' : '',
    swapper ? `<button class="btn" type="button" data-act="demo" data-what="swap">${esc(swapper)} can't make it anymore</button>` : '',
    hang.status === 'locked' ? '<button class="btn" type="button" data-act="demo" data-what="skip">Skip to after the plan</button>' : '',
  ].join('');
  if (!buttons) return '';
  return `<section class="block demo">
    <h2>Demo controls</h2>
    <p>These make the fake friends do things, so you can see what happens.</p>
    <div class="actions">${buttons}</div>
  </section>`;
}

function planScreen() {
  if (!view) return loadingOrMissing();
  const hang = currentHang();
  if (!hang) return missing();
  if (!view.me) return joinScreen(hang);
  return `
    ${placard(hang)}
    ${seats(hang)}
    ${noteBanner(hang)}
    ${statusBlock(hang)}
    ${answerBlock(hang)}
    ${gridBlock(hang)}
    ${placesBlock(hang)}
    ${demoBlock(hang)}
    <p class="back"><a href="#crew-${esc(view.crew.id)}">All plans in ${esc(view.crew.name)}</a></p>`;
}

function joinScreen(hang) {
  const names = view.members.map((m) => m.name);
  return `
    ${hang ? placard(hang) : ''}
    <section class="block">
      <h1>Hop on</h1>
      <p>${hang ? `${esc(hang.createdBy)} started this plan in ${esc(view.crew.name)}.` : `This is ${esc(view.crew.name)}.`} What do your friends call you?</p>
      <form id="join-form" class="inline-form" novalidate>
        <label class="sr-only" for="j-name">Your name</label>
        <input id="j-name" name="name" maxlength="${L.LIMITS.name}" placeholder="your name" required autocomplete="nickname">
        <button class="btn primary" type="submit">Join</button>
      </form>
      ${names.length ? `<p>Already here: ${esc(names.join(', '))}.</p>` : ''}
      ${view.crew.demo ? '<p>This is the demo group. Join as yourself, then answer like you normally would.</p>' : ''}
    </section>`;
}

function crewScreen() {
  if (!view) return loadingOrMissing();
  if (!view.me) return joinScreen(null);
  const h = view.hours;
  const next = h.next;
  const pct = next ? Math.min(100, Math.round((h.hours / next.hours) * 100)) : 100;
  const inviteLink = linkTo(`crew-${view.crew.id}`);
  return `
  <section class="block">
    <h1>${esc(view.crew.name)}</h1>
    <p>${esc(view.members.map((m) => m.name).join(', '))}</p>
  </section>

  <section class="block hours">
    <h2>${h.hours} hours together this term</h2>
    <p>${h.times ? `From ${plural(h.times, 'hangout', 'hangouts')} that actually happened.` : 'Nothing yet. The first one is the hardest.'}</p>
    ${next ? `<progress class="meter" max="${next.hours}" value="${h.hours}" aria-label="${esc(`${h.hours} of ${next.hours} hours`)}">${pct}%</progress>
    <p>A study of friendships (Hall, 2019) found it takes about ${next.hours} hours together to become ${esc(next.label)}. You're ${next.hours - h.hours} hours away.</p>` : '<p>That is close-friend territory.</p>'}
  </section>

  <section class="block">
    <div class="row-head"><h2>Plans</h2><a class="btn small" href="#newplan-${esc(view.crew.id)}">New plan</a></div>
    <ul class="plans">${view.hangs.map((hang) => `<li><a href="#plan-${esc(view.crew.id)}-${esc(hang.id)}">
      <span class="plan-idea">${esc(hang.idea)}</span>
      <span class="plan-status">${esc(statusWords(hang))}</span>
    </a></li>`).join('')}</ul>
  </section>

  <section class="block">
    <h2>Invite someone</h2>
    <pre class="message" id="invite-text">${esc(`join our group on minibus so plans actually happen: ${inviteLink}`)}</pre>
    <button class="btn" type="button" data-act="copy" data-source="invite-text">Copy invite</button>
  </section>`;
}

function statusWords(hang) {
  switch (hang.status) {
    case 'locked':
      return `happening ${L.slotLabel(hang.lock.slot)}`;
    case 'check':
      return 'did it happen?';
    case 'happened':
      return 'you met';
    case 'fizzled':
      return 'fell through';
    case 'ready':
      return 'ready to lock';
    default:
      return `${hang.onBoard} of ${hang.expected} in`;
  }
}

function loadingOrMissing() {
  if (loadError) return `<section class="block"><h1>Can't load this</h1><p>${esc(loadError)}</p><button class="btn" type="button" data-act="retry">Try again</button></section>`;
  if (view === null && subscribedTo) return missing();
  return '<p class="block">Loading...</p>';
}

function missing() {
  const local = store.kind === 'local';
  return `<section class="block">
    <h1>Can't find that plan</h1>
    <p>${local ? 'This demo keeps plans on the device that made them, so a link from someone else\'s phone won\'t open here.' : 'The link might be wrong, or the plan was removed.'}</p>
    <a class="btn" href="#start">Go home</a>
  </section>`;
}

function render() {
  let body = '';
  switch (route.name) {
    case 'new':
      body = newCrewScreen();
      break;
    case 'newplan':
      body = newPlanScreen();
      break;
    case 'shared':
      body = sharedScreen();
      break;
    case 'plan':
      body = planScreen();
      break;
    case 'crew':
      body = crewScreen();
      break;
    default:
      body = startScreen();
  }
  app.innerHTML = `${topBar()}<main class="main">${body}</main>`;
  const title = view && view.crew ? `${view.crew.name} · Minibus` : 'Minibus';
  if (document.title !== title) document.title = title;
}

// ---------------------------------------------------------------- actions

async function run(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    toast(e && e.message ? e.message : 'Something went wrong. Try again.');
  } finally {
    busy = false;
  }
}

async function act(action) {
  await store.act(route.crewId, { hangId: route.hangId, ...action });
  await refresh();
}

async function copyFrom(sourceId, button) {
  const el = document.getElementById(sourceId);
  if (!el) return;
  const text = el.textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it in the group chat.');
    if (button) button.textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Text selected. Copy it with your phone\'s copy button.');
  }
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (!target || target.disabled) return;
  const a = target.dataset.act;
  const hang = currentHang();

  if (a === 'copy') {
    copyFrom(target.dataset.source, target); // must stay inside the click for clipboard access
    return;
  }
  if (a === 'fill') {
    const input = document.getElementById(target.dataset.target);
    if (input) {
      input.value = target.dataset.value;
      input.focus();
    }
    return;
  }
  if (a === 'swap-open' || a === 'swap-close') {
    ui.swapOpen = a === 'swap-open';
    render();
    return;
  }
  if (a === 'retry') {
    run(refresh);
    return;
  }
  if (a === 'start-demo') {
    run(async () => {
      const out = await store.createDemo();
      go(`plan-${out.crewId}-${out.hangId}`);
    });
    return;
  }
  if (!hang) return;

  run(async () => {
    switch (a) {
      case 'on':
        await act({ type: 'respond', on: target.dataset.on === '1' });
        break;
      case 'slot': {
        const slot = target.dataset.slot;
        const free = new Set(hang.mine.free);
        if (free.has(slot)) free.delete(slot);
        else free.add(slot);
        const patch = { type: 'respond', free: [...free] };
        if (hang.mine.on === null && free.size) patch.on = true; // tapping times means you're in
        await act(patch);
        break;
      }
      case 'like':
        await act({ type: 'like', placeId: target.dataset.place, on: target.getAttribute('aria-pressed') !== 'true' });
        break;
      case 'add-place':
        await act({ type: 'addPlace', placeId: L.newId(), name: target.dataset.value });
        break;
      case 'lock':
        await act({ type: 'lock' });
        toast('Locked in. Copy the message and drop it in the chat.');
        break;
      case 'drop-slot':
        ui.swapOpen = false;
        await act({ type: 'respond', free: hang.mine.free.filter((s) => s !== hang.lock.slot) });
        break;
      case 'drop-out':
        ui.swapOpen = false;
        await act({ type: 'respond', on: false });
        break;
      case 'outcome':
        await act({ type: 'outcome', met: target.dataset.met === '1' });
        break;
      case 'demo':
        await store.demo(route.crewId, hang.id, target.dataset.what);
        await refresh();
        break;
      default:
        break;
    }
  });
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());

  if (form.id === 'create-form') {
    run(async () => {
      const out = await store.createCrew({
        crewName: data.crewName,
        size: data.size,
        idea: data.idea,
        seats: data.seats,
        budget: data.budget || '',
        creatorName: data.creatorName,
      });
      go(`shared-${out.crewId}-${out.hangId}`);
    });
  } else if (form.id === 'newplan-form') {
    run(async () => {
      const hangId = L.newId();
      await store.act(route.crewId, { type: 'createHang', hangId, idea: data.idea, seats: data.seats, budget: data.budget || '' });
      go(`shared-${route.crewId}-${hangId}`);
    });
  } else if (form.id === 'join-form') {
    run(async () => {
      await store.join(route.crewId, data.name);
      await refresh();
    });
  } else if (form.id === 'place-form') {
    run(async () => {
      if (!L.cleanText(data.name, L.LIMITS.place)) return;
      await act({ type: 'addPlace', placeId: L.newId(), name: data.name });
      const input = document.getElementById('p-name');
      if (input) input.value = '';
    });
  }
});

window.addEventListener('hashchange', () => {
  route = parseRoute();
  load();
});

load();
