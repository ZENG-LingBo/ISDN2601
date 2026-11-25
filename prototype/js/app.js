// Minibus screens. Plain DOM, no framework. Every screen is a function that returns HTML
// built only from escaped values. Taps and form submits are handled in one place.

import * as L from './logic.js';
import { createStore, identity } from './store.js';

const store = createStore();
const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const liveEl = document.getElementById('live');

let route = parseRoute();
let view = null;
let loadError = '';
let loaded = false;
let unsubscribe = null;
let subscribedTo = null;
let busy = false;
let lastAnnounced = '';
const ui = { swapOpen: false, swapPick: null, details: false, sizeEdit: false, confirmLeave: false, errors: {} };

// Taps on the time grid show at once and are sent together a moment later.
const pendingFree = new Map(); // hangId -> Set of times
let flushTimer = null;

const IDEAS = ['Dinner somewhere cheap', 'Lunch on campus', 'Bubble tea and a walk', 'Karaoke', 'Hotpot', 'Beach in Sai Kung'];
const PLACES = ['Hang Hau', 'Tseung Kwan O', 'Mong Kok', 'Sai Kung', 'Campus canteen'];

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
  let h = '';
  try {
    h = decodeURIComponent(location.hash.slice(1));
  } catch {
    return { name: 'start' };
  }
  let m;
  if (h === 'new') return { name: 'new' };
  if ((m = /^plan-([a-z0-9]+)-([a-z0-9]+)$/.exec(h))) return { name: 'plan', crewId: m[1], hangId: m[2] };
  if ((m = /^shared-([a-z0-9]+)-([a-z0-9]+)$/.exec(h))) return { name: 'shared', crewId: m[1], hangId: m[2] };
  if ((m = /^newplan-([a-z0-9]+)$/.exec(h))) return { name: 'newplan', crewId: m[1] };
  if ((m = /^crew-([a-z0-9]+)$/.exec(h))) return { name: 'crew', crewId: m[1] };
  if ((m = /^me-([a-z0-9]+)-([a-z0-9]+)-([a-z0-9]+)$/.exec(h))) return { name: 'me', crewId: m[1], memberId: m[2], key: m[3] };
  return { name: 'start' };
}

function go(hash) {
  ui.errors = {};
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
  }, 4000);
}

function announce(message) {
  if (message && message !== lastAnnounced) {
    lastAnnounced = message;
    liveEl.textContent = message;
  }
}

function currentHang() {
  return view && route.hangId ? view.hangs.find((h) => h.id === route.hangId) : null;
}

function people(n) {
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}

function myFree(hang) {
  return pendingFree.has(hang.id) ? pendingFree.get(hang.id) : new Set(hang.mine.free);
}

function fieldError(id) {
  const message = ui.errors[id];
  return message ? `<p class="field-error" id="${id}-error">${esc(message)}</p>` : '';
}

function invalidAttrs(id) {
  return ui.errors[id] ? ` aria-invalid="true" aria-describedby="${id}-error"` : '';
}

// Keep focus and what someone is typing when the screen redraws.
function redraw() {
  const active = document.activeElement;
  const activeId = active && active.id;
  const values = {};
  app.querySelectorAll('input[id]').forEach((el) => {
    if (el.type !== 'radio' && el.type !== 'checkbox') values[el.id] = el.value;
  });
  render();
  for (const [id, value] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el && value !== '' && el.value !== value) el.value = value;
  }
  if (activeId && activeId !== 'app') {
    const el = document.getElementById(activeId);
    if (el) el.focus({ preventScroll: true });
  }
}

// ---------------------------------------------------------------- loading

async function load() {
  if (route.name === 'me') {
    if (store.claim) store.claim(route.crewId, route.memberId, route.key);
    location.replace(`#crew-${route.crewId}`); // don't leave the private link in the address bar
    return;
  }
  const crewId = route.crewId || null;
  if (crewId !== subscribedTo) {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    subscribedTo = crewId;
    view = null;
    loaded = false;
    pendingFree.clear();
    Object.assign(ui, { swapOpen: false, swapPick: null, details: false, sizeEdit: false, confirmLeave: false });
    if (crewId) unsubscribe = store.subscribe(crewId, () => refresh(true));
  }
  if (crewId) await refresh(false);
  else render();
}

async function refresh(fromOthers) {
  if (!route.crewId) return;
  try {
    view = await store.view(route.crewId);
    loadError = '';
  } catch (e) {
    loadError = e.message;
  }
  loaded = true;
  redraw();
  if (fromOthers) announceStatus();
}

function announceStatus() {
  const hang = currentHang();
  if (!hang) return;
  if (hang.status === 'locked') announce(`The plan is confirmed for ${L.slotLabel(hang.lock.slot)}.`);
  else if (hang.status === 'ready') announce(`Enough people are free on ${L.slotLabel(hang.best.id)}.`);
  else announce(`${hang.answered} of ${hang.expected} people have answered.`);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && route.crewId) refresh(false);
});

// ---------------------------------------------------------------- shared pieces

function topBar() {
  const crew = view && view.crew;
  return `<header class="bar">
    <a class="brand" href="#start">Minibus</a>
    ${crew && route.name !== 'crew' && view.me ? `<a class="bar-link" href="#crew-${esc(crew.id)}">${esc(crew.name)}</a>` : ''}
  </header>`;
}

function privacyNote() {
  return `<p class="note">Minibus saves the name you type, your answers and the times you're free, only to run your group's plans. Use a first name or a nickname.${store.kind === 'server' ? ' You can delete your answers at any time from the group page.' : ' In this demo, everything stays on this device.'}</p>`;
}

function demoBar(hang) {
  if (!view || !view.crew.demo || store.kind !== 'local' || !view.me) return '';
  const self = store.demoSelf(view.crew.id);
  const options = view.members
    .map((m) => `<option value="${esc(m.id)}" ${m.id === view.me.id ? 'selected' : ''}>${esc(m.name)}${m.id === self ? ' (you)' : ''}</option>`)
    .join('');
  const buttons = [];
  if (hang && !hang.outcome && hang.status !== 'expired' && view.members.some((m) => m.name === 'Tom') && hang.status !== 'locked' && hang.status !== 'check') {
    buttons.push('<button class="btn small" type="button" id="demo-tom" data-act="demo" data-what="tom">Make Tom answer</button>');
  }
  const swapper = hang && hang.status === 'locked' ? store.demoSwapperName(view.crew.id, hang.id) : null;
  if (swapper) buttons.push(`<button class="btn small" type="button" id="demo-swap" data-act="demo" data-what="swap">${esc(swapper)} can't make it anymore</button>`);
  if (hang && hang.status === 'locked') buttons.push('<button class="btn small" type="button" id="demo-skip" data-act="demo" data-what="skip">Skip to after the plan</button>');
  return `<section class="demo-bar" aria-label="Demo controls">
    <p class="demo-title">Demo</p>
    <div class="demo-row">
      <label for="play-as">See it as</label>
      <select id="play-as" data-act="play-as">${options}</select>
    </div>
    ${buttons.length ? `<div class="actions">${buttons.join('')}</div>` : ''}
  </section>`;
}

function ideaFields(prefix) {
  return `
    <fieldset class="field">
      <legend>What's the plan?</legend>
      <div class="chips">${IDEAS.map((i, n) => `<button type="button" class="chip" id="${prefix}-idea-chip-${n}" data-act="fill" data-target="${prefix}-idea" data-value="${esc(i)}">${esc(i)}</button>`).join('')}</div>
      <label class="sub-label" for="${prefix}-idea">Or type your own</label>
      <input id="${prefix}-idea" name="idea" maxlength="${L.LIMITS.idea}" autocomplete="off"${invalidAttrs(`${prefix}-idea`)}>
      ${fieldError(`${prefix}-idea`)}
    </fieldset>
    <div class="field">
      <label for="${prefix}-seats">How many people need to be free for the plan to happen?</label>
      <input id="${prefix}-seats" name="seats" type="number" inputmode="numeric" min="${L.LIMITS.seatsMin}" max="${L.LIMITS.seatsMax}" value="3">
      <p class="help">The plan is confirmed once this many people can make the same time.</p>
    </div>
    <fieldset class="field">
      <legend>Budget per person</legend>
      <div class="chips">${L.BUDGETS.map((b, i) => `<label class="chip radio"><input type="radio" name="budget" value="${esc(b)}" ${i === 0 ? 'checked' : ''}><span>${b ? esc(b) : 'Not sure'}</span></label>`).join('')}</div>
    </fieldset>`;
}

function placard(hang) {
  let when = 'Not decided yet';
  if (hang.lock) when = L.slotLabel(hang.lock.slot);
  else if (hang.best) when = `Best so far: ${L.slotLabel(hang.best.id)}`;
  let where = 'Not decided yet';
  if (hang.lock && hang.lock.placeName) where = hang.lock.placeName;
  else if (hang.places.length) where = `Most votes: ${hang.places[0].name}`;
  return `
  <div class="placard">
    <div class="placard-top">
      <span>${esc(view.crew.name)}</span>
      <span>${hang.budget ? esc(hang.budget) : 'Budget not set'}</span>
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
  let filled = 0;
  let text = '';
  if (hang.lock) {
    filled = hang.lock.people.length;
    text = `${people(filled)} going.`;
  } else if (hang.best) {
    filled = hang.best.count;
    text = `${people(filled)} can make the same time. The plan needs ${hang.seats}.`;
  } else {
    text = `${hang.onBoard} of ${hang.expected} people are in. The plan needs ${hang.seats} who can make the same time.`;
  }
  const cells = Array.from({ length: total }, (_, i) => {
    const cls = ['seat'];
    if (i < filled) cls.push('taken');
    if (i === hang.seats - 1) cls.push('needed');
    return `<span class="${cls.join(' ')}"></span>`;
  }).join('');
  return `<div class="seats-wrap">
    <div class="seats" aria-hidden="true">${cells}</div>
    <p>${esc(text)}</p>
  </div>`;
}

function noteBanner(hang) {
  const n = hang.note;
  if (!n || hang.outcome || hang.status === 'expired') return '';
  let text = '';
  if (n.type === 'moved') text = `Someone couldn't make ${L.slotLabel(n.from)} anymore, so the plan moved to ${L.slotLabel(n.to)}.`;
  else if (n.type === 'unlocked') text = `Not enough people can make ${L.slotLabel(n.from)} anymore, so the group is choosing a new time. Add any other times you can make.`;
  else if (n.type === 'auto') text = 'Everyone answered, so Minibus confirmed the best time.';
  else if (n.type === 'deadline') text = 'The 48 hours were up and enough people could make it, so Minibus confirmed the best time.';
  else if (n.type === 'sent' && n.by) text = `${n.by} confirmed the plan once enough people were free.`;
  return text ? `<p class="banner">${esc(text)}</p>` : '';
}

// ---------------------------------------------------------------- plan screen blocks

function answerBlock(hang) {
  const on = hang.mine.on;
  return `<section class="block">
    <h2>Are you in?</h2>
    <p>Nobody sees who said yes until the plan is confirmed. Others only see how many people are in.</p>
    <div class="choice" role="group" aria-label="Are you in?">
      <button class="btn toggle" type="button" id="on-yes" data-act="on" data-on="1" aria-pressed="${on === true}">I'm in</button>
      <button class="btn toggle" type="button" id="on-no" data-act="on" data-on="0" aria-pressed="${on === false}">Not this time</button>
    </div>
  </section>`;
}

function gridBlock(hang) {
  if (hang.mine.on === false) return '';
  const mine = myFree(hang);
  const highlight = hang.lock ? hang.lock.slot : hang.best ? hang.best.id : null;
  const rows = hang.days.map((day) => {
    const cells = L.SLOT_TYPES.map((t) => {
      const id = L.slotId(day, t.key);
      const s = hang.slots.find((x) => x.id === id) || { count: 0, closed: true };
      const isMine = mine.has(id);
      const cls = ['cell'];
      if (isMine) cls.push('mine');
      if (id === highlight) cls.push('best');
      const countText = s.closed ? 'Closed' : hang.showCounts && s.count ? `${s.count} free` : '';
      const aria = s.closed
        ? `${L.slotLabel(id)}. Closed.`
        : `${L.slotLabel(id)}. ${isMine ? 'You are free.' : 'Not selected.'}${hang.showCounts ? ` ${people(s.count)} free.` : ''}${id === highlight ? (hang.lock ? ' Confirmed time.' : ' Best time so far.') : ''}`;
      return `<button class="${cls.join(' ')}" type="button" id="slot-${esc(id)}" data-act="slot" data-slot="${esc(id)}" aria-pressed="${isMine}" aria-label="${esc(aria)}" ${s.closed && !isMine ? 'disabled' : ''}>
        <span class="cell-mark">${isMine ? 'You' : ''}</span><span class="cell-count">${esc(countText)}</span>
      </button>`;
    }).join('');
    return `<div class="grid-row"><span class="day">${esc(L.shortDayLabel(day))}</span>${cells}</div>`;
  }).join('');
  let bestLine = 'Nobody has picked a time yet.';
  if (hang.lock) bestLine = `Confirmed: ${L.slotLabel(hang.lock.slot)}. Adding other times helps if someone can't make it.`;
  else if (!hang.showCounts) bestLine = 'You\'ll see how many people are free at each time once 2 people are in.';
  else if (hang.best) bestLine = `Best time so far: ${L.slotLabel(hang.best.id)}, ${people(hang.best.count)}.`;
  return `<section class="block">
    <h2>When are you free?</h2>
    <p>Tap every time that works for you in the next 7 days.</p>
    <div class="grid" role="group" aria-label="When are you free?">
      <div class="grid-row grid-head" aria-hidden="true"><span></span>${L.SLOT_TYPES.map((t) => `<span>${esc(t.label[0].toUpperCase() + t.label.slice(1))}</span>`).join('')}</div>
      ${rows}
    </div>
    <p class="grid-note">${esc(bestLine)}</p>
  </section>`;
}

function placesBlock(hang) {
  const list = hang.places.length
    ? `<ul class="places">${hang.places.map((p) => `<li>
        <span class="place-name">${esc(p.name)}</span>
        <button class="btn toggle small" type="button" id="vote-${esc(p.id)}" data-act="like" data-place="${esc(p.id)}" aria-pressed="${p.liked}" aria-label="${esc(`${p.liked ? 'Remove your vote for' : 'Vote for'} ${p.name}. ${p.likes} ${p.likes === 1 ? 'vote' : 'votes'}.`)}">Vote · ${p.likes}</button>
      </li>`).join('')}</ul>`
    : '<p>No places yet. Suggest one.</p>';
  const chips = PLACES.filter((p) => !hang.places.some((x) => x.name.toLowerCase() === p.toLowerCase()));
  return `<section class="block" id="where">
    <h2>Where?</h2>
    ${list}
    <form id="place-form" class="field" novalidate>
      <label for="p-name">Suggest a place</label>
      <div class="inline-form">
        <input id="p-name" name="name" maxlength="${L.LIMITS.place}" autocomplete="off"${invalidAttrs('p-name')}>
        <button class="btn" type="submit" id="p-add">Add</button>
      </div>
      ${fieldError('p-name')}
    </form>
    ${chips.length ? `<div class="chips">${chips.map((p, n) => `<button type="button" class="chip" id="place-chip-${n}" data-act="add-place" data-value="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
  </section>`;
}

function remindBlock(hang) {
  if (!hang.waiting || hang.mine.on === null) return '';
  const link = linkTo(`plan-${view.crew.id}-${hang.id}`);
  return `<div class="remind">
    <h3>Remind your group</h3>
    <p>This message comes from Minibus, so you don't have to be the one asking.</p>
    <pre class="message" id="nudge-text">${esc(L.nudgeMessage(hang, link))}</pre>
    <button class="btn" type="button" id="copy-nudge" data-act="copy" data-source="nudge-text">Copy reminder</button>
  </div>`;
}

function waitingLine(hang) {
  const deadline = L.momentLabel(hang.decideBy);
  return `${hang.answered} of ${hang.expected} people have answered. If enough people can make the same time, Minibus confirms the plan when everyone has answered, or on ${deadline}, whichever comes first.`;
}

function openStatus(hang) {
  return `<section class="status">
    <h2>Waiting for more people</h2>
    <p>${esc(waitingLine(hang))}</p>
    ${remindBlock(hang)}
  </section>`;
}

function readyStatus(hang) {
  const onBoard = hang.mine.on === true;
  return `<section class="status go">
    <h2>Enough people are free</h2>
    <p class="big">${esc(L.slotLabel(hang.best.id))}</p>
    <p>${esc(`${people(hang.best.count)} can make it.`)} ${hang.waiting ? esc(waitingLine(hang)) : ''}</p>
    ${onBoard
      ? '<button class="btn primary wide" type="button" id="confirm" data-act="lock">Confirm this time now</button>'
      : '<p>Say you\'re in to confirm the plan now.</p>'}
    ${remindBlock(hang)}
  </section>`;
}

function lockedStatus(hang) {
  const me = view.me;
  const planLink = linkTo(`plan-${view.crew.id}-${hang.id}`);
  const when = L.slotLabel(hang.lock.slot);
  const whereLine = hang.lock.placeName ? `<p class="big-sub">${esc(hang.lock.placeName)}</p>` : '';
  const summary = `<p class="big">${esc(when)}</p>${whereLine}<p>Going: ${esc(hang.lock.people.join(', '))}</p>`;

  // Said yes, but isn't free at the confirmed time (the plan moved, or they joined late).
  if (hang.mine.on === true && !hang.lock.imGoing) {
    return `<section class="status ask">
      <h2>The plan is set for ${esc(when)}. Can you make it?</h2>
      ${summary}
      <div class="actions stack">
        <button class="btn primary" type="button" id="join-time" data-act="join-time">Yes, I can make it</button>
        <button class="btn" type="button" id="skip-time" data-act="on" data-on="0">No, I can't</button>
      </div>
    </section>`;
  }
  if (!hang.lock.imGoing) {
    return `<section class="status go">
      <h2>The plan is confirmed</h2>
      ${summary}
      <button class="btn primary wide" type="button" id="join-time" data-act="join-time">I can make it too</button>
    </section>`;
  }

  const calendar = L.calendarUrl(hang, view.crew.name);
  const file = store.calendarFileUrl(view.crew.id, hang.id);
  const noPlace = !hang.lock.placeName
    ? '<p class="banner">There\'s no place yet. Suggest one or vote below.</p>'
    : '';
  return `<section class="status go">
    <h2>The plan is confirmed</h2>
    ${summary}
    ${noPlace}
    <p>Let everyone know in the group chat:</p>
    <pre class="message" id="locked-text">${esc(L.lockedMessage(hang, planLink))}</pre>
    <div class="actions stack">
      <button class="btn primary" type="button" id="copy-locked" data-act="copy" data-source="locked-text">Copy message for the group chat</button>
      <a class="btn" id="calendar" href="${esc(calendar)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      ${file ? `<a class="btn" id="ics" href="${esc(file)}" download>Download calendar file</a>` : ''}
    </div>
    ${me ? swapBlock(hang) : ''}
  </section>`;
}

function swapBlock(hang) {
  if (!ui.swapOpen) {
    return `<button class="btn quiet" type="button" id="swap-open" data-act="swap-open">Can't make it anymore?</button>`;
  }
  const lockSlot = hang.lock.slot;
  if (!ui.swapPick) ui.swapPick = new Set(hang.mine.free.filter((s) => s !== lockSlot));
  // Times other people can make come first, then the soonest. Times you already picked always show.
  const options = hang.slots
    .filter((s) => !s.closed && s.id !== lockSlot)
    .sort((a, b) => b.count - a.count || L.slotTime(a.id) - L.slotTime(b.id))
    .filter((s, i) => i < 6 || ui.swapPick.has(s.id));
  return `<div class="swap">
    <h3>Change your times instead of cancelling</h3>
    <p>Pick any other times you can make. If enough people can make one of them, the plan moves there.</p>
    <div class="swap-list" role="group" aria-label="Other times you can make">
      ${options.map((s) => `<button class="btn toggle" type="button" id="pick-${esc(s.id)}" data-act="swap-pick" data-slot="${esc(s.id)}" aria-pressed="${ui.swapPick.has(s.id)}">${esc(L.slotLabel(s.id))} · ${people(s.count)} free</button>`).join('')}
    </div>
    <div class="actions stack">
      <button class="btn primary" type="button" id="swap-save" data-act="swap-save">Save my times</button>
      <button class="btn" type="button" id="swap-out" data-act="on" data-on="0">I can't go at all</button>
      <button class="btn quiet" type="button" id="swap-close" data-act="swap-close">Keep my plan</button>
    </div>
  </div>`;
}

function afterStatus(hang) {
  if (hang.status === 'check') {
    if (!hang.lock.imGoing) {
      return `<section class="status"><h2>Waiting to hear if it happened</h2><p>The people who went will say whether you met.</p></section>`;
    }
    return `<section class="status">
      <h2>Did you meet?</h2>
      <p>${esc(L.slotLabel(hang.lock.slot))}${hang.lock.placeName ? `, ${esc(hang.lock.placeName)}` : ''}. Only plans that happened count toward your group's time together.</p>
      <div class="actions stack">
        <button class="btn primary" type="button" id="met-yes" data-act="outcome" data-met="1">Yes, we met</button>
        <button class="btn" type="button" id="met-no" data-act="outcome" data-met="0">No, we didn't</button>
      </div>
    </section>`;
  }
  const again = `<div class="actions stack">
    <button class="btn primary" type="button" id="again" data-act="again">Plan the same thing again</button>
    <a class="btn" href="#newplan-${esc(view.crew.id)}">Start a different plan</a>
  </div>`;
  if (hang.status === 'happened') {
    return `<section class="status done">
      <h2>You met</h2>
      <p>That's ${L.slotHours(hang.lock.slot)} more hours together. Your group has met ${view.hours.times} ${view.hours.times === 1 ? 'time' : 'times'} so far.</p>
      ${again}
    </section>`;
  }
  if (hang.status === 'fizzled') {
    return `<section class="status"><h2>It didn't happen this time</h2><p>That's OK. Starting the next plan takes a minute.</p>${again}</section>`;
  }
  // expired
  return `<section class="status"><h2>This plan ran out of days</h2><p>Not enough people could make the same time in those 7 days.</p>${again}</section>`;
}

function planScreen() {
  if (!view) return loadingOrMissing();
  const hang = currentHang();
  if (!hang) return missing();
  if (!view.me) return joinScreen(hang);

  const top = `${demoBar(hang)}${placard(hang)}${seats(hang)}${noteBanner(hang)}`;
  const back = `<p class="back"><a href="#crew-${esc(view.crew.id)}">All plans in ${esc(view.crew.name)}</a></p>`;

  if (['check', 'happened', 'fizzled', 'expired'].includes(hang.status)) return `${top}${afterStatus(hang)}${back}`;

  if (hang.lock) {
    const showForm = ui.details || !hang.lock.placeName;
    return `${top}${lockedStatus(hang)}
      ${hang.lock.imGoing && hang.lock.placeName ? `<button class="btn quiet" type="button" id="details" data-act="details" aria-expanded="${ui.details}">${ui.details ? 'Hide my answers' : 'Change my answers'}</button>` : ''}
      ${showForm && hang.lock.imGoing ? `${!hang.lock.placeName ? placesBlock(hang) : `${gridBlock(hang)}${placesBlock(hang)}`}` : ''}
      ${back}`;
  }

  const status = hang.status === 'ready' ? readyStatus(hang) : openStatus(hang);
  // Someone who hasn't answered sees their own question first.
  if (hang.mine.on === null) return `${top}${answerBlock(hang)}${gridBlock(hang)}${placesBlock(hang)}${status}${back}`;
  return `${top}${status}${answerBlock(hang)}${gridBlock(hang)}${placesBlock(hang)}${back}`;
}

// ---------------------------------------------------------------- other screens

function startScreen() {
  const mine = identity.crews();
  const local = store.kind === 'local';
  return `
  <section class="hero">
    <h1 class="hero-title">We should hang out.</h1>
    <p class="lede">Everyone says it. Then nobody makes a plan. Minibus helps your group choose a time and a place, so the plan actually happens and nobody has to keep asking.</p>
    <div class="actions">
      <a class="btn primary" href="#new">Start a plan</a>
      ${local ? '<button class="btn" type="button" id="start-demo" data-act="start-demo">Try the demo</button>' : ''}
    </div>
  </section>

  ${mine.length ? `<section class="block">
    <h2>Your groups</h2>
    <ul class="list">${mine.map((c) => `<li><a href="#crew-${esc(c.id)}">${esc(c.name)}</a></li>`).join('')}</ul>
  </section>` : ''}

  <section class="block">
    <h2>How it works</h2>
    <ol class="steps">
      <li>Start a plan and paste the message into your group chat.</li>
      <li>Each friend says if they're in. Others only see how many said yes, not who.</li>
      <li>Everyone taps the times they're free in the next 7 days.</li>
      <li>When enough people can make the same time, the plan is confirmed. Minibus picks the time, so nobody has to push.</li>
      <li>If you can't make it anymore, change your times instead of cancelling. The plan moves to another time.</li>
    </ol>
    <p>Minibus is named after Hong Kong's red minibuses, which leave once enough seats are filled.</p>
  </section>

  ${local ? `<section class="block notice">
    <h2>About this demo</h2>
    <p>This demo saves everything on this device only. Pretend friends answer too, and you can switch between them to see what each person sees. To use Minibus with real friends on their own phones, run the server version. The README explains how.</p>
  </section>` : ''}`;
}

function newCrewScreen() {
  return `
  <section class="block">
    <h1>Start a plan</h1>
    <form id="create-form" class="form" novalidate>
      <div class="field">
        <label for="c-crew">Group name</label>
        <input id="c-crew" name="crewName" maxlength="${L.LIMITS.crewName}" autocomplete="off" placeholder="For example, O-camp gang"${invalidAttrs('c-crew')}>
        ${fieldError('c-crew')}
      </div>
      <div class="field">
        <label for="c-size">How many people are in the group chat?</label>
        <input id="c-size" name="size" type="number" inputmode="numeric" min="${L.LIMITS.sizeMin}" max="${L.LIMITS.sizeMax}" value="5">
      </div>
      ${ideaFields('c')}
      <div class="field">
        <label for="c-name">Your name</label>
        <input id="c-name" name="creatorName" maxlength="${L.LIMITS.name}" autocomplete="nickname"${invalidAttrs('c-name')}>
        <p class="help">Your friends will see this name.</p>
        ${fieldError('c-name')}
      </div>
      ${privacyNote()}
      <button class="btn primary wide" type="submit" id="create-submit">Create plan</button>
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
      <button class="btn primary wide" type="submit" id="newplan-submit">Create plan</button>
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
    <h1>Send this to your group chat</h1>
    <p>Copy the message and paste it into your group chat.</p>
    <pre class="message" id="share-text">${esc(L.shareMessage(hang, link))}</pre>
    <div class="actions stack">
      <button class="btn primary" type="button" id="copy-share" data-act="copy" data-source="share-text">Copy message</button>
      <a class="btn" href="#plan-${esc(view.crew.id)}-${esc(hang.id)}">Go to the plan</a>
    </div>
    ${store.kind === 'local' ? '<p class="notice-inline">In this demo, the link only works on this device.</p>' : ''}
  </section>`;
}

function joinScreen(hang) {
  const names = view.members.map((m) => m.name);
  return `
    ${hang ? placard(hang) : ''}
    <section class="block">
      <h1>${hang ? 'Join this plan' : `Join ${esc(view.crew.name)}`}</h1>
      ${hang ? `<p>${esc(hang.createdBy)} started this plan in ${esc(view.crew.name)}.</p>` : ''}
      <form id="join-form" class="field" novalidate>
        <label for="j-name">Your name</label>
        <div class="inline-form">
          <input id="j-name" name="name" maxlength="${L.LIMITS.name}" autocomplete="nickname"${invalidAttrs('j-name')}>
          <button class="btn primary" type="submit" id="join-submit">Join</button>
        </div>
        ${fieldError('j-name')}
        <p class="help">Your friends will see this name.</p>
      </form>
      ${privacyNote()}
      ${names.length ? `<p>Already in this group: ${esc(names.join(', '))}.</p>` : ''}
      ${view.crew.demo ? '<p>This is the demo group. Join as yourself and answer like you normally would.</p>' : ''}
    </section>`;
}

function crewScreen() {
  if (!view) return loadingOrMissing();
  if (!view.me) return joinScreen(null);
  const h = view.hours;
  const inviteLink = linkTo(`crew-${view.crew.id}`);
  const personal = store.personalLink(view.crew.id);
  const minSize = Math.max(L.LIMITS.sizeMin, view.members.length);
  return `
  ${demoBar(null)}
  <section class="block">
    <h1>${esc(view.crew.name)}</h1>
    <p>${esc(view.members.map((m) => m.name).join(', '))}</p>
  </section>

  <section class="block">
    <div class="row-head"><h2>Plans</h2><a class="btn small" href="#newplan-${esc(view.crew.id)}">New plan</a></div>
    <ul class="plans">${view.hangs.map((hang) => `<li><a href="#plan-${esc(view.crew.id)}-${esc(hang.id)}">
      <span class="plan-idea">${esc(hang.idea)}</span>
      <span class="plan-status">${esc(statusWords(hang))}</span>
    </a></li>`).join('')}</ul>
  </section>

  <section class="block">
    <h2>${h.times ? `You've met ${h.times} ${h.times === 1 ? 'time' : 'times'}` : "You haven't met yet"}</h2>
    <p>${h.times ? `That's about ${h.hours} hours together.` : 'Plans that actually happen show up here.'} Researchers found that two friends need about 200 hours together to become close friends (Hall, 2019).</p>
    <progress class="meter" max="200" value="${Math.min(200, h.hours)}" aria-label="${esc(`${h.hours} of 200 hours`)}"></progress>
  </section>

  <section class="block">
    <h2>Invite someone</h2>
    <pre class="message" id="invite-text">${esc(`Join our group on Minibus so our plans actually happen: ${inviteLink}`)}</pre>
    <button class="btn" type="button" id="copy-invite" data-act="copy" data-source="invite-text">Copy invite</button>
  </section>

  <section class="block">
    <h2>Group size</h2>
    <p>Minibus waits for ${people(view.crew.size)} to answer before it confirms a plan on its own. After 48 hours it stops waiting.</p>
    ${ui.sizeEdit
      ? `<form id="size-form" class="field" novalidate>
          <label for="s-size">How many people are in the group chat?</label>
          <div class="inline-form">
            <input id="s-size" name="size" type="number" inputmode="numeric" min="${minSize}" max="${L.LIMITS.sizeMax}" value="${view.crew.size}">
            <button class="btn primary" type="submit" id="size-save">Save</button>
          </div>
        </form>`
      : '<button class="btn" type="button" id="size-edit" data-act="size-edit">Change group size</button>'}
  </section>

  ${personal ? `<section class="block">
    <h2>Use this group on another device</h2>
    <p>Open this private link on your other phone or browser to keep your name and answers. Anyone with this link can answer as you, so don't share it.</p>
    <pre class="message" id="personal-text">${esc(personal)}</pre>
    <button class="btn" type="button" id="copy-personal" data-act="copy" data-source="personal-text">Copy my private link</button>
  </section>` : ''}

  <section class="block">
    <h2>Leave this group</h2>
    ${ui.confirmLeave
      ? `<p>This deletes your name and all your answers from ${esc(view.crew.name)}. You can't undo this.</p>
        <div class="actions stack">
          <button class="btn danger" type="button" id="leave-yes" data-act="leave">Leave and delete my answers</button>
          <button class="btn quiet" type="button" id="leave-no" data-act="leave-cancel">Stay in the group</button>
        </div>`
      : '<button class="btn" type="button" id="leave-ask" data-act="leave-ask">Leave and delete my answers</button>'}
  </section>`;
}

function statusWords(hang) {
  switch (hang.status) {
    case 'locked':
      return `Confirmed: ${L.slotLabel(hang.lock.slot)}`;
    case 'check':
      return 'Did you meet?';
    case 'happened':
      return 'You met';
    case 'fizzled':
      return "Didn't happen";
    case 'expired':
      return 'Ran out of days';
    case 'ready':
      return 'Ready to confirm';
    default:
      return `${hang.onBoard} of ${hang.expected} in`;
  }
}

function loadingOrMissing() {
  if (loadError) return `<section class="block"><h1>Can't load this page</h1><p>${esc(loadError)}</p><button class="btn" type="button" id="retry" data-act="retry">Try again</button></section>`;
  if (loaded) return missing();
  return '<p class="block">Loading...</p>';
}

function missing() {
  const local = store.kind === 'local';
  return `<section class="block">
    <h1>Can't find this plan</h1>
    <p>${local ? "This demo keeps plans on the device that made them, so a link from someone else's phone won't open here." : 'The link might be wrong, or the group was deleted.'}</p>
    <a class="btn" href="#start">Go to the home page</a>
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
  const title = view && view.crew && route.crewId ? `${view.crew.name} · Minibus` : 'Minibus';
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

async function act(action, hangId = route.hangId) {
  await store.act(route.crewId, { hangId, ...action });
  await refresh(false);
}

function flushFree() {
  clearTimeout(flushTimer);
  flushTimer = null;
  const entries = [...pendingFree.entries()];
  if (!entries.length) return Promise.resolve();
  return (async () => {
    for (const [hangId, set] of entries) {
      const hang = view && view.hangs.find((h) => h.id === hangId);
      const action = { type: 'respond', free: [...set] };
      if (hang && hang.mine.on === null && set.size) action.on = true; // picking times means you're in
      try {
        await store.act(route.crewId, { hangId, ...action });
      } catch (e) {
        toast(e.message || 'Your times were not saved. Try again.');
      }
      if (pendingFree.get(hangId) === set) pendingFree.delete(hangId);
    }
    await refresh(false);
  })();
}

function toggleSlot(hang, slot) {
  const set = new Set(myFree(hang));
  if (set.has(slot)) set.delete(slot);
  else set.add(slot);
  pendingFree.set(hang.id, set);
  redraw();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushFree, 400);
}

async function copyFrom(sourceId, button) {
  const el = document.getElementById(sourceId);
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.textContent);
    toast('Copied. Now paste it into your group chat.');
    if (button) button.textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast("The text is selected. Use your phone's Copy button.");
  }
}

function requireFields(form, ids) {
  ui.errors = {};
  for (const [id, message] of ids) {
    const input = form.querySelector(`#${id}`);
    if (input && !L.cleanText(input.value, 200)) ui.errors[id] = message;
  }
  const first = Object.keys(ui.errors)[0];
  if (first) {
    redraw();
    const el = document.getElementById(first);
    if (el) el.focus();
    return false;
  }
  return true;
}

function showFieldError(id, message) {
  ui.errors = { [id]: message };
  redraw();
  const el = document.getElementById(id);
  if (el) el.focus();
}

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.act === 'play-as') {
    store.playAs(route.crewId, target.value);
    toast(`You're now seeing the plan as ${target.options[target.selectedIndex].text.replace(' (you)', '')}.`);
  }
});

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]');
  if (!target || target.disabled || target.tagName === 'SELECT') return;
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
  if (a === 'retry') return void run(() => refresh(false));
  if (a === 'start-demo') {
    return void run(async () => {
      const out = await store.createDemo();
      go(`plan-${out.crewId}-${out.hangId}`);
    });
  }
  if (a === 'size-edit') {
    ui.sizeEdit = true;
    redraw();
    document.getElementById('s-size')?.focus();
    return;
  }
  if (a === 'leave-ask' || a === 'leave-cancel') {
    ui.confirmLeave = a === 'leave-ask';
    redraw();
    document.getElementById(ui.confirmLeave ? 'leave-no' : 'leave-ask')?.focus();
    return;
  }
  if (a === 'leave') {
    return void run(async () => {
      await store.act(route.crewId, { type: 'leave' });
      toast('You left the group. Your answers were deleted.');
      go('start');
    });
  }
  if (!hang) return;

  if (a === 'slot') return void toggleSlot(hang, target.dataset.slot);
  if (a === 'swap-open' || a === 'swap-close') {
    ui.swapOpen = a === 'swap-open';
    ui.swapPick = null;
    redraw();
    document.getElementById(ui.swapOpen ? 'swap-save' : 'swap-open')?.focus();
    return;
  }
  if (a === 'swap-pick') {
    const id = target.dataset.slot;
    if (ui.swapPick.has(id)) ui.swapPick.delete(id);
    else ui.swapPick.add(id);
    redraw();
    return;
  }
  if (a === 'details') {
    ui.details = !ui.details;
    redraw();
    return;
  }
  if (a === 'demo') {
    return void run(async () => {
      await flushFree();
      await store.demo(route.crewId, hang.id, target.dataset.what);
      await refresh(false);
    });
  }

  run(async () => {
    await flushFree();
    const fresh = currentHang() || hang;
    switch (a) {
      case 'on':
        ui.swapOpen = false;
        await act({ type: 'respond', on: target.dataset.on === '1' });
        break;
      case 'like':
        await act({ type: 'like', placeId: target.dataset.place, on: target.getAttribute('aria-pressed') !== 'true' });
        break;
      case 'add-place':
        await act({ type: 'addPlace', placeId: L.newId(), name: target.dataset.value });
        break;
      case 'lock':
        await act({ type: 'lock' });
        toast('The plan is confirmed. Copy the message and paste it into your group chat.');
        break;
      case 'join-time':
        await act({ type: 'respond', on: true, free: [...new Set([...fresh.mine.free, fresh.lock.slot])] });
        break;
      case 'swap-save': {
        const free = [...ui.swapPick].filter((s) => s !== fresh.lock.slot);
        ui.swapOpen = false;
        ui.swapPick = null;
        await act({ type: 'respond', free });
        break;
      }
      case 'outcome':
        await act({ type: 'outcome', met: target.dataset.met === '1' });
        break;
      case 'again': {
        const hangId = L.newId();
        await store.act(route.crewId, { type: 'createHang', hangId, idea: fresh.idea, seats: fresh.seats, budget: fresh.budget });
        go(`shared-${route.crewId}-${hangId}`);
        break;
      }
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
    if (!requireFields(form, [
      ['c-crew', 'Add a name for the group.'],
      ['c-idea', 'Pick a plan above or type your own.'],
      ['c-name', 'Add your name.'],
    ])) return;
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
    if (!requireFields(form, [['n-idea', 'Pick a plan above or type your own.']])) return;
    run(async () => {
      const hangId = L.newId();
      await store.act(route.crewId, { type: 'createHang', hangId, idea: data.idea, seats: data.seats, budget: data.budget || '' });
      go(`shared-${route.crewId}-${hangId}`);
    });
  } else if (form.id === 'join-form') {
    if (!requireFields(form, [['j-name', 'Add your name.']])) return;
    run(async () => {
      try {
        await store.join(route.crewId, data.name);
      } catch (e) {
        if (e.code === 'name_taken' || e.code === 'invalid') return showFieldError('j-name', e.message);
        throw e;
      }
      ui.errors = {};
      await refresh(false);
      document.getElementById('on-yes')?.focus();
    });
  } else if (form.id === 'place-form') {
    if (!requireFields(form, [['p-name', 'Type a place first.']])) return;
    run(async () => {
      await flushFree();
      await act({ type: 'addPlace', placeId: L.newId(), name: data.name });
      const input = document.getElementById('p-name');
      if (input) input.value = '';
    });
  } else if (form.id === 'size-form') {
    run(async () => {
      await store.act(route.crewId, { type: 'setSize', size: data.size });
      ui.sizeEdit = false;
      await refresh(false);
      toast('Group size saved.');
    });
  }
});

window.addEventListener('hashchange', () => {
  flushFree();
  route = parseRoute();
  load();
});

load();
