// Minibus screens. Plain DOM, no framework. Every screen is a function that returns HTML
// built only from escaped values. Taps and form submits are handled in one place.

import * as L from './logic.js';
import { createStore, identity, noticeDetails } from './store.js';

const store = createStore();
const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const liveEl = document.getElementById('live');
const alertEl = document.getElementById('alert');
toastEl.addEventListener('click', hideToast); // tap the message to close it

let route = parseRoute();
let view = null;
let loadError = '';
let loaded = false;
let unsubscribe = null;
let subscribedTo = null;
let busy = false;
let lastOwnActionAt = 0; // to avoid announcing your own change twice
let focusPageOnRender = false; // after moving to another screen, put focus on its heading
let deferredRedraw = false; // a friend's change arrived while you were typing
let lastAnnounced = '';
const ui = {
  swapOpen: false,
  swapPick: null,
  sizeEdit: false,
  confirmLeave: false,
  removeAsk: null,
  demoOpen: false,
  justJoined: false,
  orderFor: null, // the plan whose screen order was decided
  answerFirst: false, // keep the screen order the same for the whole visit, so nothing jumps
  privateLink: null, // a private link waiting for "are you sure?"
  code: null, // the check-in code being shown: { hangId, code, expiresAt }
  lateMessage: null, // the message to paste after saying you can't come at short notice
  seatsEdit: false,
  errors: {},
};
let codeTimer = null;
let seqCounter = 0;
// Every save of your answer carries an increasing number, so an old save can't overwrite a newer one.
function nextSeq() {
  seqCounter += 1;
  return Date.now() * 1000 + (seqCounter % 1000);
}

// Taps on the time grid show at once and are sent together a moment later.
const pendingFree = new Map(); // hangId -> Set of times
let flushTimer = null;

const IDEAS = ['Dinner somewhere cheap', 'Lunch on campus', 'Bubble tea and a walk', 'Karaoke', 'Hotpot', 'Board games'];

// Apps like Instagram and WeChat open links in their own browser, which forgets you when it closes.
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|MicroMessenger|Line\/|Snapchat|BytedanceWebview|musical_ly/i.test(navigator.userAgent || '');
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

function go(hash, message) {
  ui.errors = {};
  hideToast(); // a message from the last screen doesn't belong on the next one
  focusPageOnRender = true;
  if (message) setTimeout(() => toast(message), 0); // ...but a message about where you just went does
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

// The toast is what you see. Screen readers hear the same words through #live, or #alert for
// errors, which are always on the page, so nothing depends on the toast being shown.
let toastTimer = null;
function toast(message, { error = false } = {}) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (error) {
    alertEl.textContent = '';
    setTimeout(() => {
      alertEl.textContent = message;
    }, 50);
  } else {
    announce(message, true);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
}

function announce(message, force = false) {
  if (message && (force || message !== lastAnnounced)) {
    lastAnnounced = message;
    liveEl.textContent = '';
    setTimeout(() => {
      liveEl.textContent = message;
    }, 50);
  }
}

// A time as shown on screen. Word joiners keep "7–10pm" on one line. Messages for the
// group chat use L.slotLabel directly, so they never contain these characters.
function slotText(id) {
  return L.slotLabel(id).replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2');
}

function currentHang() {
  return view && route.hangId ? view.hangs.find((h) => h.id === route.hangId) : null;
}

// "Mandy", "Mandy and Jason", "Mandy, Jason and Mei"
function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function inAppHint() {
  if (!IN_APP_BROWSER) return '';
  return `<p class="banner">You opened this inside another app. So Minibus remembers you, open it in Safari or Chrome instead: tap the menu (often ••• or ⋮) and choose "Open in browser".</p>`;
}

// Buttons to send a message: the phone's share sheet when there is one, WhatsApp, and copy.
function sendButtons(sourceId, text, copyLabel, copyId) {
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  return `<div class="actions stack">
    <button class="btn primary" type="button" id="${copyId}" data-act="copy" data-source="${sourceId}">${esc(copyLabel)}</button>
    ${typeof navigator.share === 'function' ? `<button class="btn" type="button" id="${copyId}-share" data-act="share" data-source="${sourceId}">Share…</button>` : ''}
    <a class="btn" id="${copyId}-wa" href="${esc(wa)}" target="_blank" rel="noopener">Open WhatsApp with this message</a>
  </div>`;
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

// aria-describedby for a field: its help text, plus its error if there is one.
function invalidAttrs(id, helpId) {
  const ids = [helpId, ui.errors[id] ? `${id}-error` : ''].filter(Boolean).join(' ');
  return `${ui.errors[id] ? ' aria-invalid="true"' : ''}${ids ? ` aria-describedby="${ids}"` : ''}`;
}

function isTyping() {
  const el = document.activeElement;
  return Boolean(el && app.contains(el) && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') && el.type !== 'radio');
}

// Keep focus and what someone is typing when the screen redraws.
function redraw() {
  const active = document.activeElement;
  const activeId = active && active.id;
  const selection = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const values = {};
  const checked = [];
  app.querySelectorAll('input[id]').forEach((el) => {
    if (el.type === 'radio' || el.type === 'checkbox') {
      if (el.checked) checked.push(el.id);
    } else {
      values[el.id] = el.value;
    }
  });
  if (!render()) return; // nothing on screen changed
  for (const [id, value] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el && value !== '' && el.value !== value) el.value = value;
  }
  for (const id of checked) {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  }
  if (activeId && activeId !== 'app') {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus({ preventScroll: true });
      if (selection && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(selection[0], selection[1]);
        } catch {
          /* number fields don't have a text cursor */
        }
      }
    }
  }
}

// ---------------------------------------------------------------- loading

async function load() {
  if (route.name === 'me') return openPrivateLink();
  const crewId = route.crewId || null;
  if (crewId !== subscribedTo) {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    subscribedTo = crewId;
    view = null;
    loaded = false;
    pendingFree.clear();
    Object.assign(ui, { swapOpen: false, swapPick: null, sizeEdit: false, confirmLeave: false, removeAsk: null, justJoined: false, orderFor: null });
    if (crewId) unsubscribe = store.subscribe(crewId, () => refresh(true));
  }
  if (crewId) await refresh(false);
  else render();
}

// Someone opened a private link. Check whose it is, and ask before replacing who you are on this device.
async function openPrivateLink() {
  const { crewId, memberId, key } = route;
  history.replaceState(null, '', location.href.split('#')[0]); // don't leave the private link in the address bar
  if (store.kind !== 'server') return go('start');
  let theirs;
  try {
    theirs = await store.peek(crewId, memberId, key);
  } catch (e) {
    return go('start', e.message);
  }
  if (!theirs.me) {
    return go(`crew-${crewId}`, "This private link doesn't work anymore. Make a new one on the group page of your other phone, or join the group again.");
  }
  const current = identity.get(crewId);
  if (current && current.memberId === memberId) {
    store.claim(crewId, memberId, key, theirs.crew.name);
    return go(`crew-${crewId}`);
  }
  let currentName = '';
  if (current) {
    try {
      const mine = await store.view(crewId);
      if (mine && mine.me) currentName = mine.me.name;
    } catch {
      /* keep it empty */
    }
  }
  ui.privateLink = { crewId, memberId, key, name: theirs.me.name, crewName: theirs.crew.name, currentName };
  view = null;
  route = { name: 'switch' };
  render();
}

function switchScreen() {
  const s = ui.privateLink;
  if (!s) return startScreen();
  const where = s.currentName
    ? `On this phone, you use the name ${esc(s.currentName)} in that group.`
    : "You haven't joined that group on this phone.";
  const stay = s.currentName ? `Stay as ${esc(s.currentName)}` : "This isn't my link";
  return `<section class="block">
    <h1 id="page-title" tabindex="-1">Use this group as ${esc(s.name)}?</h1>
    <p>This private link is for ${esc(s.name)} in ${esc(s.crewName)}. ${where}</p>
    <p>If you use this group as ${esc(s.name)}, this phone answers as ${esc(s.name)}. Do this only if it's your own link.</p>
    <div class="actions stack">
      <button class="btn primary" type="button" id="switch-no" data-act="switch-no">${stay}</button>
      <button class="btn" type="button" id="switch-yes" data-act="switch-yes">Use this group as ${esc(s.name)}</button>
    </div>
  </section>`;
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
  if (fromOthers && isTyping()) {
    deferredRedraw = true; // don't redraw under someone's fingers; catch up when they leave the field
    return;
  }
  redraw();
  if (fromOthers && Date.now() - lastOwnActionAt > 2500) announceStatus();
}

app.addEventListener('focusout', () => {
  setTimeout(() => {
    if (deferredRedraw && !isTyping()) {
      deferredRedraw = false;
      redraw();
      announceStatus();
    }
  }, 0);
});

function announceStatus() {
  const hang = currentHang();
  if (!hang) return;
  if (hang.status === 'locked') announce(`The plan is confirmed for ${slotText(hang.lock.slot)}.`);
  else if (hang.status === 'ready') announce(`Enough people are free on ${slotText(hang.best.id)}.`);
  else announce(`${hang.answered} of ${hang.expected} people have answered.`);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && route.crewId) refresh(false);
});

// ---------------------------------------------------------------- shared pieces

function topBar() {
  const crew = view && view.crew;
  return `<header class="bar">
    <a class="brand" id="bar-home" href="#start">Minibus</a>
    ${crew && route.name !== 'crew' && view.me ? `<a class="bar-link" id="bar-crew" href="#crew-${esc(crew.id)}">${esc(crew.name)}</a>` : ''}
  </header>`;
}

function privacyNote() {
  const n = noticeDetails();
  const parts = [];
  if (n.operator) parts.push(`Minibus is a student project run by ${n.operator}.`);
  parts.push(`${n.operator ? 'It' : 'Minibus'} saves your name, your answers and the times you're free. It uses them only for your group's plans${n.operator ? ' and to check whether the app works' : ''}.`);
  parts.push('Use a first name or a nickname.');
  if (store.kind === 'server') {
    if (n.deleteBy) parts.push(`Everything will be deleted by ${n.deleteBy}.`);
    parts.push('You can delete your answers at any time from the group page.');
    if (n.contact) parts.push(`Questions: ${n.contact}`);
  } else {
    parts.push('In this demo, everything stays on this device.');
  }
  return `<p class="note">${esc(parts.join(' '))}</p>`;
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
  const locked = hang && hang.status === 'locked';
  const checkinOpen = locked && hang.lock.checkinOpen;
  const swapper = locked && !checkinOpen ? store.demoSwapperName(view.crew.id, hang.id) : null;
  if (swapper) buttons.push(`<button class="btn small" type="button" id="demo-swap" data-act="demo" data-what="swap">${esc(swapper)} can't make it anymore</button>`);
  if (locked && !checkinOpen) buttons.push('<button class="btn small" type="button" id="demo-start" data-act="demo" data-what="start">Skip to the start of the plan</button>');
  const checker = checkinOpen ? store.demoSwapperName(view.crew.id, hang.id, { notCheckedIn: true }) : null;
  if (checker) buttons.push(`<button class="btn small" type="button" id="demo-checkin" data-act="demo" data-what="checkin">${esc(checker)} types in the code</button>`);
  if (locked) buttons.push('<button class="btn small" type="button" id="demo-skip" data-act="demo" data-what="skip">Skip to after the plan</button>');
  return `<details class="demo-bar" id="demo-box" ${ui.demoOpen ? 'open' : ''}>
    <summary id="demo-summary">Demo controls</summary>
    <div class="demo-body">
      <div class="demo-row">
        <label for="play-as">See it as</label>
        <select id="play-as" data-act="play-as">${options}</select>
      </div>
      ${buttons.length ? `<div class="actions">${buttons.join('')}</div>` : ''}
    </div>
  </details>`;
}

function ideaFields(prefix) {
  return `
    <fieldset class="field">
      <legend>What's the plan?</legend>
      <div class="chips">${IDEAS.map((i, n) => `<button type="button" class="chip" id="${prefix}-idea-chip-${n}" data-act="fill" data-target="${prefix}-idea" data-value="${esc(i)}">${esc(i)}</button>`).join('')}</div>
      <label class="sub-label" for="${prefix}-idea">Or type your own</label>
      <input id="${prefix}-idea" name="idea" maxlength="${L.LIMITS.idea}" autocomplete="off" aria-required="true"${invalidAttrs(`${prefix}-idea`)}>
      ${fieldError(`${prefix}-idea`)}
    </fieldset>
    <div class="field">
      <label for="${prefix}-seats">How many people need to be free for the plan to happen?</label>
      <input id="${prefix}-seats" name="seats" type="number" inputmode="numeric" min="${L.LIMITS.seatsMin}" max="${L.LIMITS.seatsMax}" value="3" aria-describedby="${prefix}-seats-help">
      <p class="help" id="${prefix}-seats-help">Count yourself too. The plan is confirmed once this many people are free at the same time.</p>
    </div>
    <fieldset class="field">
      <legend>Budget per person</legend>
      <div class="chips">${L.BUDGETS.map((b, i) => `<label class="chip radio"><input type="radio" id="${prefix}-budget-${i}" name="budget" value="${esc(b)}" ${i === 0 ? 'checked' : ''}><span>${b ? esc(b) : 'Not sure'}</span></label>`).join('')}</div>
    </fieldset>`;
}

function placard(hang, asHeading = true) {
  let when = 'Not decided yet';
  if (hang.lock) when = slotText(hang.lock.slot);
  else if (hang.best) when = `Best so far: ${slotText(hang.best.id)}`;
  let where = 'Not decided yet';
  if (hang.lock && hang.lock.placeName) where = hang.lock.placeName;
  else if (hang.places.length) where = `Most votes: ${hang.places[0].name}`;
  return `
  <div class="placard">
    <div class="placard-top">
      <span>${esc(view.crew.name)}</span>
      <span>${hang.budget ? esc(hang.budget) : 'Budget not set'}</span>
    </div>
    ${asHeading ? `<h1 class="dest" id="page-title" tabindex="-1">${esc(hang.idea)}</h1>` : `<p class="dest">${esc(hang.idea)}</p>`}
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
    text = hang.outcome ? `${people(filled)} were going.` : `${people(filled)} going.`;
  } else if (hang.best) {
    filled = hang.best.count;
    text = `Needed: ${people(hang.seats)} free at the same time. So far: ${hang.best.count}.`;
  } else {
    text = `Needed: ${people(hang.seats)} free at the same time.${hang.mine.on === true ? " You're in." : ''}`;
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
  if (n.type === 'moved') text = `The plan moved from ${slotText(n.from)} to ${slotText(n.to)}, because someone can't make the old time.`;
  else if (n.type === 'unlocked') text = 'Not enough people can make the old time anymore, so the group is choosing a new time. Add any other times you can make.';
  else if (n.type === 'auto') text = 'Everyone answered, so Minibus confirmed the best time.';
  else if (n.type === 'deadline') text = 'After 48 hours, enough people could make it, so Minibus confirmed the best time.';
  else if (n.type === 'sent' && n.by) text = `${n.by} confirmed the plan once enough people were free.`;
  else if (n.type === 'dropped') text = `Someone can't come anymore. ${people(n.still)} ${n.still === 1 ? 'is' : 'are'} still going. It's too late to move the plan.`;
  return text ? `<p class="banner">${esc(text)}</p>` : '';
}

// ---------------------------------------------------------------- plan screen blocks

function answerBlock(hang) {
  const on = hang.mine.on;
  return `<section class="block">
    <h2>Are you in?</h2>
    <p>Until the plan is confirmed, nobody sees your name with your answer. People only see totals, like "3 free".</p>
    <div class="choice" role="group" aria-label="Are you in?">
      <button class="btn toggle" type="button" id="on-yes" data-act="on" data-on="1" aria-pressed="${on === true}">I'm in</button>
      <button class="btn toggle" type="button" id="on-no" data-act="on" data-on="0" aria-pressed="${on === false}">Not this time</button>
    </div>
  </section>`;
}

function gridBlock(hang) {
  if (hang.mine.on === false) return '';
  const notYet = hang.mine.on === null; // say you're in before picking times
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
      const countText = s.closed ? 'Too late' : hang.showCounts && s.count ? `${s.count} free` : '';
      // The name starts with what's shown on the button ("You", "3 free"), then adds the date.
      const shown = [isMine ? 'You' : '', countText].filter(Boolean).join(', ');
      const aria = `${shown ? `${shown}. ` : ''}${slotText(id)}.${id === highlight ? (hang.lock ? ' Confirmed time.' : ' Best time so far.') : ''}`;
      return `<button class="${cls.join(' ')}" type="button" id="slot-${esc(id)}" data-act="slot" data-slot="${esc(id)}" aria-pressed="${isMine}" aria-label="${esc(aria)}" ${(s.closed && !isMine) || notYet ? 'disabled' : ''}>
        <span class="cell-mark">${isMine ? 'You' : ''}</span><span class="cell-count">${esc(countText)}</span>
      </button>`;
    }).join('');
    return `<div class="grid-row"><span class="day">${esc(L.shortDayLabel(day))}</span>${cells}</div>`;
  }).join('');
  let bestLine = 'Nobody has picked a time yet.';
  if (notYet) bestLine = '';
  else if (hang.lock) bestLine = `Confirmed: ${slotText(hang.lock.slot)}. Add other times you could make, in case the plan needs to move.`;
  else if (!hang.showCounts) bestLine = "You'll see how many people are free at each time once a few more people have answered.";
  else if (hang.best) bestLine = `Best time so far: ${slotText(hang.best.id)} (${people(hang.best.count)}).`;
  const readyCue = hang.status === 'ready' && ui.answerFirst
    ? `<div class="ready-cue"><p><b>Enough people are free on ${esc(slotText(hang.best.id))}.</b></p><button class="btn small" type="button" id="go-status" data-act="go-status">Go to the confirm button</button></div>`
    : '';
  return `<section class="block">
    <h2>When are you free?</h2>
    <p>${notYet ? "Say you're in first. Then tap all the times you're free in the next 7 days." : "Tap all the times you're free in the next 7 days."}</p>
    <div class="grid" role="group" aria-label="When are you free?">
      <div class="grid-row grid-head" aria-hidden="true"><span></span>${L.SLOT_TYPES.map((t) => `<span>${esc(t.label[0].toUpperCase() + t.label.slice(1))}<span class="clock">${esc(t.clock)}</span></span>`).join('')}</div>
      ${rows}
    </div>
    ${bestLine ? `<p class="grid-note">${esc(bestLine)}</p>` : ""}
    ${readyCue}
  </section>`;
}

function placesBlock(hang) {
  const list = hang.places.length
    ? `<ul class="places">${hang.places.map((p) => `<li>
        <span class="place-name">${esc(p.name)}</span>
        <button class="btn toggle small" type="button" id="vote-${esc(p.id)}" data-act="like" data-place="${esc(p.id)}" aria-pressed="${p.liked}" aria-label="${esc(`Vote · ${p.likes}, for ${p.name}`)}">Vote · ${p.likes}</button>
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
    ${chips.length ? `<div class="chips">${chips.map((p) => `<button type="button" class="chip" id="place-chip-${esc(p.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}" data-act="add-place" data-value="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
  </section>`;
}

function remindBlock(hang) {
  if (!hang.waiting || hang.mine.on !== true) return '';
  const link = linkTo(`plan-${view.crew.id}-${hang.id}`);
  const text = L.nudgeMessage(hang, link);
  return `<div class="remind">
    <h3>Remind your group</h3>
    <p>This message comes from Minibus, so you don't have to be the one asking.</p>
    <pre class="message" id="nudge-text">${esc(text)}</pre>
    ${sendButtons('nudge-text', text, 'Copy reminder', 'copy-nudge')}
  </div>`;
}

function answeredLine(hang) {
  return `${hang.answered} of ${hang.expected} people ${hang.answered === 1 ? 'has' : 'have'} answered.`;
}

function waitingLine(hang) {
  const deadline = L.momentLabel(hang.decideBy);
  return `${answeredLine(hang)} Minibus confirms the plan when everyone has answered, or on ${deadline}. Enough people must be free at the same time.`;
}

// Minibus doesn't confirm a time on its own if it's less than 12 hours away, because nobody gets a notification.
function isSoon(slot) {
  return L.slotTime(slot, 'start') - (view ? view.now : Date.now()) < L.AUTO_LEAD_MS;
}

function statusTitle(text) {
  return `<h2 id="status-title" tabindex="-1">${esc(text)}</h2>`;
}

function openStatus(hang) {
  if (hang.stuck) {
    return `<section class="status ask">
      ${statusTitle('No time works yet')}
      <p>Everyone has answered, but no time has ${people(hang.seats)} free. Add more times you could make, or lower the number of people needed.</p>
      ${ui.seatsEdit
        ? `<form id="seats-form" class="field" novalidate>
            <label for="h-seats">How many people need to be free?</label>
            <div class="inline-form">
              <input id="h-seats" name="seats" type="number" inputmode="numeric" min="${L.LIMITS.seatsMin}" max="${L.LIMITS.seatsMax}" value="${Math.max(L.LIMITS.seatsMin, hang.seats - 1)}">
              <button class="btn primary" type="submit" id="seats-save">Save</button>
            </div>
          </form>`
        : '<button class="btn" type="button" id="seats-edit" data-act="seats-edit">Lower the number needed</button>'}
    </section>`;
  }
  return `<section class="status">
    ${statusTitle('Waiting for more people')}
    <p>${esc(waitingLine(hang))}</p>
    ${remindBlock(hang)}
  </section>`;
}

function readyStatus(hang) {
  const onBoard = hang.mine.on === true;
  return `<section class="status go">
    ${statusTitle('Enough people are free')}
    <p class="big">${esc(slotText(hang.best.id))}</p>
    <p>${esc(`${people(hang.best.count)} are free then.`)} ${esc(answeredLine(hang))}</p>
    ${isSoon(hang.best.id) ? '<p>This time is soon, so Minibus won\'t confirm it on its own. Someone who is in needs to confirm it.</p>' : ''}
    ${onBoard
      ? '<button class="btn primary wide" type="button" id="confirm" data-act="lock">Confirm this time now</button>'
      : '<p>Say you\'re in to confirm the plan now.</p>'}
    ${remindBlock(hang)}
  </section>`;
}

function lockedStatus(hang) {
  const me = view.me;
  const planLink = linkTo(`plan-${view.crew.id}-${hang.id}`);
  const when = slotText(hang.lock.slot);
  const whereLine = hang.lock.placeName ? `<p class="big-sub">${esc(hang.lock.placeName)}</p>` : '';
  const summary = `<p class="big">${esc(when)}</p>${whereLine}<p>Going: ${esc(hang.lock.people.join(', '))}</p>`;

  // You just said you can't come: show the message to send, before anything else.
  if (ui.lateMessage && ui.lateMessage.hangId === hang.id) {
    return `<section class="status">
      ${statusTitle("You're off this plan")}
      <p>Send this to the group so nobody waits for you:</p>
      <pre class="message" id="late-text">${esc(ui.lateMessage.text)}</pre>
      ${sendButtons('late-text', ui.lateMessage.text, 'Copy message', 'copy-late')}
      <button class="btn quiet" type="button" id="late-done" data-act="late-done">Done</button>
    </section>`;
  }

  // Said yes, but isn't free at the confirmed time (the plan moved, or they joined late).
  if (hang.mine.on === true && !hang.lock.imGoing) {
    return `<section class="status ask">
      ${statusTitle(hang.note && hang.note.type === 'moved' ? 'The plan moved to a new time. Can you make it?' : 'The plan is confirmed. Can you make it?')}
      ${summary}
      <div class="actions stack">
        <button class="btn primary" type="button" id="join-time" data-act="join-time">Yes, I can make it</button>
        <button class="btn" type="button" id="skip-time" data-act="on" data-on="0">No, I can't</button>
      </div>
    </section>`;
  }
  if (!hang.lock.imGoing) {
    return `<section class="status go">
      ${statusTitle('The plan is confirmed')}
      ${summary}
      <button class="btn primary wide" type="button" id="join-time" data-act="join-time">I can make it too</button>
    </section>`;
  }

  const calendar = L.calendarUrl(hang, view.crew.name);
  const file = store.calendarFileUrl(view.crew.id, hang.id);
  const noPlace = !hang.lock.placeName
    ? '<p class="banner">There\'s no place yet. Suggest one or vote below.</p>'
    : '';
  const moved = hang.note && hang.note.type === 'moved';
  return `<section class="status go">
    ${statusTitle(moved ? 'The plan moved to a new time' : 'The plan is confirmed')}
    ${summary}
    ${noPlace}
    <p>${moved ? 'Tell the group about the new time:' : 'Let everyone know in the group chat:'}</p>
    <pre class="message" id="locked-text">${esc(L.lockedMessage(hang, planLink))}</pre>
    ${sendButtons('locked-text', L.lockedMessage(hang, planLink), 'Copy message for the group chat', 'copy-locked')}
    <div class="actions stack">
      <a class="btn" id="calendar" href="${esc(calendar)}" target="_blank" rel="noopener" data-track="calendar">Add to Google Calendar</a>
      ${file ? `<a class="btn" id="ics" href="${esc(file)}" download>Download calendar file</a>` : ''}
    </div>
    ${hang.lock.checkinOpen ? checkinBlock(hang) : ''}
    ${me && hang.lock.tooLateToMove ? lateBlock(hang) : ''}
    ${me && !hang.lock.tooLateToMove ? swapBlock(hang) : ''}
  </section>`;
}

// Less than 2 hours before the plan, it can't move anymore. Be honest about it.
function lateBlock(hang) {
  if (!ui.swapOpen) return `<button class="btn" type="button" id="swap-open" data-act="swap-open">Can't come anymore?</button>`;
  return `<div class="swap">
    <h3>Can't come anymore?</h3>
    <p>It's too late to move the plan to another time. If you can't come, Minibus tells the group how many people are still going.</p>
    <div class="actions stack">
      <button class="btn danger" type="button" id="late-out" data-act="late-out">I can't come</button>
      <button class="btn quiet" type="button" id="swap-close" data-act="swap-close">I'm still coming</button>
    </div>
  </div>`;
}

function checkinBlock(hang) {
  const names = hang.lock.checkedIn.map((n) => (view.me && n === view.me.name ? `${n} (you)` : n));
  const who = names.length ? `Checked in: ${names.join(', ')}.` : 'Nobody has checked in yet.';
  const shown = ui.code && ui.code.hangId === hang.id ? ui.code : null;
  return `<div class="checkin">
    <h3>Check in</h3>
    <p>When you meet, one person shows the code and the others type it in. When ${L.CHECKINS_TO_MEET} people have checked in, the plan counts as met.</p>
    <p>${esc(who)}</p>
    ${shown
      ? `<p class="code"><span aria-hidden="true">${esc(shown.code)}</span><span class="sr-only">Check-in code: ${esc(shown.code.split('').join(' '))}</span></p><p>This code changes every minute.</p>`
      : '<button class="btn primary" type="button" id="show-code" data-act="show-code">Show the code</button>'}
    ${hang.lock.iCheckedIn ? '' : `<form id="checkin-form" class="field" novalidate>
      <label for="ci-code">Enter the code</label>
      <div class="inline-form">
        <input id="ci-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="4" aria-required="true"${invalidAttrs('ci-code')}>
        <button class="btn" type="submit" id="checkin-submit">Check in</button>
      </div>
      ${fieldError('ci-code')}
    </form>`}
  </div>`;
}

function swapBlock(hang) {
  if (!ui.swapOpen) {
    return `<button class="btn" type="button" id="swap-open" data-act="swap-open">Can't make it? Change my times</button>`;
  }
  const lockSlot = hang.lock.slot;
  if (!ui.swapPick) ui.swapPick = new Set(hang.mine.free.filter((s) => s !== lockSlot));
  const others = (s) => s.count - (hang.mine.free.includes(s.id) ? 1 : 0); // don't count yourself
  // Times other people can make come first, then the soonest. Times you already picked always show.
  const open = hang.slots
    .filter((s) => !s.closed && s.id !== lockSlot)
    .sort((a, b) => b.count - a.count || L.slotTime(a.id) - L.slotTime(b.id));
  let options = open.filter((s, i) => (s.count > 0 && i < 6) || ui.swapPick.has(s.id));
  if (options.length < 3) options = open.filter((s, i) => i < 4 || ui.swapPick.has(s.id));
  return `<div class="swap">
    <h3>Change your times instead of cancelling</h3>
    <p>Pick any other times you can make. If enough people can make one of them, the plan moves there.</p>
    <div class="swap-list" role="group" aria-label="Other times you can make">
      ${options.map((s) => `<button class="btn toggle" type="button" id="pick-${esc(s.id)}" data-act="swap-pick" data-slot="${esc(s.id)}" aria-pressed="${ui.swapPick.has(s.id)}">${esc(slotText(s.id))}${others(s) ? ` (${people(others(s))} free)` : ''}</button>`).join('')}
    </div>
    <div class="actions stack">
      <button class="btn primary" type="button" id="swap-save" data-act="swap-save">Save my times</button>
      <button class="btn" type="button" id="swap-out" data-act="on" data-on="0">I can't go at all</button>
      <button class="btn quiet" type="button" id="swap-close" data-act="swap-close">Keep my times</button>
    </div>
  </div>`;
}

function afterStatus(hang) {
  if (hang.status === 'check') {
    if (!hang.lock.imGoing) {
      return `<section class="status">${statusTitle('Waiting to hear if they met')}<p>The people who went will say whether they met.</p></section>`;
    }
    return `<section class="status">
      ${statusTitle('Did you meet?')}
      <p>${esc(slotText(hang.lock.slot))}${hang.lock.placeName ? `, ${esc(hang.lock.placeName)}` : ''}. ${hang.lock.checkedIn.length === 1 ? 'Only 1 person checked in' : 'Nobody checked in'}, so answer here. Only plans where you met count toward your group's hours together.</p>
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
  const answers = hang.outcome && !hang.outcome.checked ? `<p>${hang.outcome.yes} said you met, ${hang.outcome.no} said you didn't.</p>` : '';
  const addMine = hang.outcome && !hang.outcome.checked && hang.lock.imGoing && hang.mine.met === null
    ? `<div class="actions stack">
        <p>Did you meet? Your answer counts too.</p>
        <button class="btn" type="button" id="met-yes" data-act="outcome" data-met="1">Yes, we met</button>
        <button class="btn" type="button" id="met-no" data-act="outcome" data-met="0">No, we didn't</button>
      </div>`
    : '';
  if (hang.status === 'happened') {
    return `<section class="status done">
      ${statusTitle('You met')}
      <p>${hang.outcome && hang.outcome.checked ? `${esc(joinNames(hang.lock.checkedIn))} checked in. ` : ''}That's ${L.slotHours(hang.lock.slot)} more hours together. Your group has met ${view.hours.times} ${view.hours.times === 1 ? 'time' : 'times'} so far.</p>
      ${answers}${addMine}
      ${again}
    </section>`;
  }
  if (hang.status === 'fizzled') {
    return `<section class="status">${statusTitle("You didn't meet this time")}<p>That's OK. Starting the next plan takes a minute.</p>${answers}${addMine}${again}</section>`;
  }
  // expired
  return `<section class="status">${statusTitle('No time worked')}<p>Not enough people could make the same time in those 7 days.</p>${again}</section>`;
}

function planScreen() {
  if (!view) return loadingOrMissing();
  const hang = currentHang();
  if (!hang) return missing();
  if (!view.me) {
    if (store.kind === 'server') countOpen(hang.id);
    return joinScreen(hang);
  }

  if (ui.orderFor !== hang.id) {
    ui.orderFor = hang.id;
    ui.answerFirst = hang.mine.on === null;
  }
  if (store.kind === 'server') countOpen(hang.id);
  const top = `${demoBar(hang)}${inAppHint()}${placard(hang)}${seats(hang)}${sinceBanner(hang)}${noteBanner(hang)}`;
  const back = `<p class="back"><a id="back-link" href="#crew-${esc(view.crew.id)}">All plans in ${esc(view.crew.name)}</a></p>`;

  if (['check', 'happened', 'fizzled', 'expired'].includes(hang.status)) return `${top}${afterStatus(hang)}${back}`;

  if (hang.lock) {
    // Times change through "Change my times". Votes on the place stay open until the plan.
    // If you were still answering when the plan was confirmed, keep your grid so you can finish.
    const keepGrid = ui.answerFirst && hang.lock.imGoing && !hang.lock.checkinOpen ? gridBlock(hang) : '';
    return `${top}${lockedStatus(hang)}${keepGrid}${hang.lock.imGoing && !hang.lock.checkinOpen ? placesBlock(hang) : ''}${joinedBanner(hang)}${back}`;
  }

  const status = hang.status === 'ready' ? readyStatus(hang) : openStatus(hang);
  // Someone who hadn't answered when they opened the page sees their own question first,
  // and the order stays the same while they answer.
  if (ui.answerFirst) return `${top}${answerBlock(hang)}${gridBlock(hang)}${placesBlock(hang)}${status}${joinedBanner(hang)}${back}`;
  return `${top}${status}${answerBlock(hang)}${gridBlock(hang)}${placesBlock(hang)}${joinedBanner(hang)}${back}`;
}

// ---------------------------------------------------------------- other screens

function startScreen() {
  const mine = identity.crews();
  const local = store.kind === 'local';
  return `
  <section class="hero">
    <h1 class="hero-title" id="page-title" tabindex="-1">We should hang out.</h1>
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
      <li>When enough people can make the same time, the plan is confirmed. Minibus picks the time for you.</li>
      <li>If you can't make it anymore, change your times instead of cancelling. The plan moves to another time.</li>
    </ol>
    <p>Minibus is named after Hong Kong's red minibuses, which leave once enough seats are filled.</p>
  </section>

  ${local ? `<section class="block notice">
    <h2>About this demo</h2>
    <p>This demo saves everything on this device only. Pretend friends answer too, and you can switch between them to see what each person sees. To use Minibus with real friends on their own phones, someone needs to run it on a server. The README file in the project explains how.</p>
  </section>` : ''}`;
}

function newCrewScreen() {
  return `
  <section class="block">
    <h1 id="page-title" tabindex="-1">Start a plan</h1>
    <form id="create-form" class="form" novalidate>
      <div class="field">
        <label for="c-crew">Group name</label>
        <input id="c-crew" name="crewName" maxlength="${L.LIMITS.crewName}" autocomplete="off" placeholder="For example, O-camp gang" aria-required="true"${invalidAttrs('c-crew')}>
        ${fieldError('c-crew')}
      </div>
      <div class="field">
        <label for="c-size">How many people are in the group chat?</label>
        <input id="c-size" name="size" type="number" inputmode="numeric" min="${L.LIMITS.sizeMin}" max="${L.LIMITS.sizeMax}" value="5">
      </div>
      ${ideaFields('c')}
      <div class="field">
        <label for="c-name">Your name</label>
        <input id="c-name" name="creatorName" maxlength="${L.LIMITS.name}" autocomplete="nickname" aria-required="true"${invalidAttrs('c-name', 'c-name-help')}>
        <p class="help" id="c-name-help">Your friends will see this name.</p>
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
    <h1 id="page-title" tabindex="-1">New plan for ${esc(view.crew.name)}</h1>
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
    <h1 id="page-title" tabindex="-1">Send this to your group chat</h1>
    <p>Copy the message and paste it into your group chat.</p>
    <pre class="message" id="share-text">${esc(L.shareMessage(hang, link))}</pre>
    ${sendButtons('share-text', L.shareMessage(hang, link), 'Copy message', 'copy-share')}
    <p>Then answer the plan yourself: say if you're in and when you're free.</p>
    <p><a class="btn" id="go-plan" href="#plan-${esc(view.crew.id)}-${esc(hang.id)}">Go to the plan</a></p>
    ${store.kind === 'local' ? '<p class="notice-inline">In this demo, the link only works on this device.</p>' : ''}
  </section>`;
}

function joinedBanner(hang) {
  if (!ui.justJoined || store.kind !== 'server' || hang.mine.on === null) return '';
  const link = store.personalLink(view.crew.id);
  if (!link) return '';
  return `<section class="private-box">
    <h2>Save your private link</h2>
    <p>You joined ${esc(view.crew.name)}. To use it on another phone later, copy your private link and keep it to yourself. Anyone with it can answer as you, so don't paste it in the group chat.</p>
    <div class="actions">
      <button class="btn" type="button" id="copy-joined" data-act="copy-text" data-text="${esc(link)}" data-private="1">Copy my private link</button>
      <button class="btn quiet" type="button" id="joined-close" data-act="joined-close">Not now</button>
    </div>
  </section>`;
}

// What changed since you last opened this plan, so coming back makes sense.
function snapshotOf(hang) {
  return { status: hang.status, answered: hang.answered, slot: hang.lock ? hang.lock.slot : null };
}

function sinceBanner(hang) {
  const key = `minibus-seen-${hang.id}`;
  const firstLook = !(ui.since && ui.since.hangId === hang.id);
  let before = null;
  try {
    if (firstLook) before = JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(snapshotOf(hang))); // keep it up to date for next time
  } catch {
    /* no history on this device */
  }
  if (!firstLook) return ui.since.html;
  const items = [];
  const movedNote = hang.note && hang.note.type === 'moved' && hang.lock && hang.note.to === hang.lock.slot;
  if (before) {
    const more = hang.answered - before.answered;
    if (more > 0) items.push(`${people(more)} more ${more === 1 ? 'has' : 'have'} answered.`);
    if (!before.slot && hang.lock) items.push(`The plan was confirmed for ${slotText(hang.lock.slot)}.`);
    else if (before.slot && hang.lock && before.slot !== hang.lock.slot && !movedNote) items.push(`The plan moved from ${slotText(before.slot)} to ${slotText(hang.lock.slot)}.`);
    else if (before.slot && !hang.lock && !hang.outcome) items.push('The plan is no longer confirmed. The group is choosing a new time.');
    if (before.status !== hang.status && ['happened', 'fizzled'].includes(hang.status)) items.push(hang.status === 'happened' ? 'The group met.' : "The group didn't meet.");
  }
  const html = items.length
    ? `<section class="since" aria-label="Since you last looked"><h2>Since you last looked</h2><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`
    : '';
  ui.since = { hangId: hang.id, html };
  return html;
}

// Count that this plan link was opened, once per visit (for the user test).
function countOpen(hangId) {
  const key = `minibus-opened-${hangId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    return;
  }
  store.opened(route.crewId, hangId);
}

function joinScreen(hang) {
  const names = view.members.map((m) => m.name);
  return `
    ${hang ? placard(hang, false) : ''}
    <section class="block">
      ${inAppHint()}
      <h1 id="page-title" tabindex="-1">${hang ? 'Join this plan' : `Join ${esc(view.crew.name)}`}</h1>
      ${hang ? `<p>This plan is for ${esc(view.crew.name)}. Minibus is named after Hong Kong's red minibuses, which leave once enough people get on. Your plan happens once enough friends are free at the same time.</p>` : ''}
      <form id="join-form" class="field" novalidate>
        <label for="j-name">Your name</label>
        <div class="inline-form">
          <input id="j-name" name="name" maxlength="${L.LIMITS.name}" autocomplete="nickname" aria-required="true"${invalidAttrs('j-name', 'j-name-help')}>
          <button class="btn primary" type="submit" id="join-submit">Join</button>
        </div>
        ${fieldError('j-name')}
        <p class="help" id="j-name-help">Your friends will see this name.</p>
      </form>
      ${privacyNote()}
      ${names.length ? `<p>Already in this group: ${esc(names.join(', '))}.</p>` : ''}
      ${store.kind === 'server' ? `<details class="manage">
        <summary>Joined before on another phone or browser?</summary>
        <p>Open your private link if you saved it. If you didn't, join again with a slightly different name, like "Mei C". The person who made the group can remove your old name after 6 hours.</p>
      </details>` : ''}
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
    <h1 id="page-title" tabindex="-1">${esc(view.crew.name)}</h1>
    <p>${esc(view.members.map((m) => (m.id === view.me.id ? `${m.name} (you)` : m.name)).join(', '))}</p>
  </section>

  <section class="block">
    <div class="row-head"><h2>Plans</h2><a class="btn small" href="#newplan-${esc(view.crew.id)}">Start a new plan</a></div>
    <ul class="plans">${view.hangs.map((hang) => `<li><a href="#plan-${esc(view.crew.id)}-${esc(hang.id)}">
      <span class="plan-idea">${esc(hang.idea)}</span>
      <span class="plan-status">${esc(statusWords(hang))}</span>
    </a></li>`).join('')}</ul>
  </section>

  <section class="block">
    <h2>${h.times ? `You've met ${h.times} ${h.times === 1 ? 'time' : 'times'}` : "You haven't met yet"}</h2>
    <p>${h.times ? `That's about ${h.hours} hours together.` : 'Plans where you meet show up here.'} Every time counts: researchers found that 2 friends need about 200 hours together to become close friends (Hall, 2019).</p>
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
    <h2>Use this group on another phone</h2>
    <p>Copy your private link and open it on your other phone to keep your name and answers. Anyone with this link can answer as you, so don't share it.</p>
    <div class="actions stack">
      <button class="btn" type="button" id="copy-personal" data-act="copy-text" data-text="${esc(personal)}" data-private="1">Copy my private link</button>
      <button class="btn quiet" type="button" id="reset-key" data-act="reset-key">Make a new private link</button>
    </div>
    <p>If you make a new link, your old link will stop working.</p>
  </section>` : ''}

  ${view.members.some((m) => m.canRemove) ? `<details class="block manage" id="manage-box" ${ui.removeAsk ? 'open' : ''}>
    <summary id="manage-summary">Manage members</summary>
    <p>You made this group, so you can remove someone who joined more than 2 days ago and hasn't answered anything. This helps if someone lost their phone.</p>
    ${membersList()}
  </details>` : ''}

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

function membersList() {
  const items = view.members.filter((m) => m.canRemove).map((m) => {
    if (ui.removeAsk === m.id) {
      return `<li class="member-ask"><span>Remove ${esc(m.name)} from the group?</span>
        <span class="actions"><button class="btn small danger" type="button" id="remove-yes" data-act="remove" data-member="${esc(m.id)}" data-name="${esc(m.name)}">Remove</button>
        <button class="btn small quiet" type="button" id="remove-no" data-act="remove-cancel">Keep ${esc(m.name)}</button></span></li>`;
    }
    return `<li><span>${esc(m.name)}</span> <button class="btn small quiet" type="button" id="remove-${esc(m.id)}" data-act="remove-ask" data-member="${esc(m.id)}">Remove</button></li>`;
  });
  return `<ul class="members">${items.join('')}</ul>`;
}

function statusWords(hang) {
  switch (hang.status) {
    case 'locked':
      return `Confirmed: ${slotText(hang.lock.slot)}`;
    case 'check':
      return 'Did you meet?';
    case 'happened':
      return 'You met';
    case 'fizzled':
      return "Didn't meet";
    case 'expired':
      return 'No time worked';
    case 'ready':
      return 'Ready to confirm';
    default:
      return `${hang.answered} of ${hang.expected} ${hang.answered === 1 ? 'has' : 'have'} answered`;
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
  // Keep the demo box open or closed as the person left it.
  const box = document.getElementById('demo-box');
  if (box) ui.demoOpen = box.open;
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
    case 'switch':
      body = switchScreen();
      break;
    default:
      body = startScreen();
  }
  const html = `${topBar()}<main class="main">${body}</main>`;
  const hang = currentHang();
  const titles = {
    new: 'Start a plan',
    newplan: 'New plan',
    shared: 'Send to your group',
    switch: 'Use this group?',
    plan: hang && view ? `${hang.idea} · ${view.crew.name}` : '',
    crew: view && view.crew ? view.crew.name : '',
  };
  const title = titles[route.name] ? `${titles[route.name]} · Minibus` : 'Minibus';
  if (document.title !== title) document.title = title;
  if (html === lastHtml && !focusPageOnRender) return false; // nothing changed, so leave the page alone
  lastHtml = html;
  app.innerHTML = html;
  if (focusPageOnRender && (view || !route.crewId)) {
    focusPageOnRender = false;
    document.getElementById('page-title')?.focus({ preventScroll: true });
  }
  return true;
}
let lastHtml = '';

// ---------------------------------------------------------------- actions

async function run(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    toast(e && e.message ? e.message : 'Something went wrong. Try again.', { error: true });
  } finally {
    busy = false;
    // If the button you pressed is gone, don't drop focus to the top of the page.
    if (!document.activeElement || document.activeElement === document.body) focusStatus(true);
  }
}

async function act(action, hangId = route.hangId) {
  lastOwnActionAt = Date.now();
  await store.act(route.crewId, { hangId, ...action });
  await refresh(false);
}

// Saves go one after another, so a slow save can never overwrite a newer one.
let saveChain = Promise.resolve();
function flushFree({ leaving = false } = {}) {
  clearTimeout(flushTimer);
  flushTimer = null;
  const entries = [...pendingFree.entries()];
  if (!entries.length) return saveChain;
  const crewId = route.crewId;
  const actions = entries.map(([hangId, set]) => {
    const hang = view && view.hangs.find((h) => h.id === hangId);
    const action = { type: 'respond', hangId, free: [...set], seq: nextSeq() };
    return { hangId, set, action, wasReady: hang && hang.status === 'ready' };
  });
  if (leaving) {
    // The page is closing: send now, without waiting for earlier saves. The numbers keep the order right.
    for (const { action } of actions) store.act(crewId, action, { keepalive: true }).catch(() => {});
    return saveChain;
  }
  saveChain = saveChain.then(async () => {
    let wasReady = true;
    for (const { hangId, set, action, wasReady: r } of actions) {
      wasReady = wasReady && r;
      try {
        await store.act(crewId, action, { keepalive: true });
      } catch (e) {
        toast(e.message || "Your times weren't saved. Try again.", { error: true });
      }
      if (pendingFree.get(hangId) === set) pendingFree.delete(hangId);
    }
    await refresh(false);
    cueIfReady(wasReady);
  });
  return saveChain;
}

// When your own answer makes the plan ready, say so, even if the confirm button is further down.
function cueIfReady(wasReady) {
  const hang = currentHang();
  if (!wasReady && hang && hang.status === 'ready') toast(`Enough people are free on ${slotText(hang.best.id)}. You can confirm the plan now.`);
}

async function showCode(hang) {
  if (!hang) return;
  const out = await store.showCode(route.crewId, hang.id);
  ui.code = { hangId: hang.id, ...out };
  await refresh(false);
  clearInterval(codeTimer);
  // Keep the code on screen up to date while it's shown.
  codeTimer = setInterval(async () => {
    const h = currentHang();
    if (!h || !h.lock || !h.lock.checkinOpen || document.visibilityState !== 'visible') {
      clearInterval(codeTimer);
      ui.code = null;
      return;
    }
    if (Date.now() >= ui.code.expiresAt - 5000) {
      try {
        const next = await store.showCode(route.crewId, h.id);
        ui.code = { hangId: h.id, ...next };
        redraw();
      } catch {
        /* try again next time */
      }
    }
  }, 5000);
}

// Send any waiting taps before the page is closed or hidden.
window.addEventListener('pagehide', () => flushFree({ leaving: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushFree({ leaving: true });
});

function toggleSlot(hang, slot) {
  const set = new Set(myFree(hang));
  if (set.has(slot)) set.delete(slot);
  else set.add(slot);
  pendingFree.set(hang.id, set);
  redraw();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushFree, 400);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    toast(button && button.dataset.private ? 'Copied. Open it on your other phone.' : 'Copied. Now paste it into your group chat.');
    if (button) button.textContent = 'Copied';
  } catch {
    toast("Couldn't copy. Open this page in Safari or Chrome and try again.");
  }
}

async function copyFrom(sourceId, button) {
  const el = document.getElementById(sourceId);
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.textContent);
    toast(button && button.dataset.private ? 'Copied. Open it on your other phone.' : 'Copied. Now paste it into your group chat.');
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

// When the button you pressed goes away, move focus to the new heading instead of the top of the page.
function focusStatus(scroll = true) {
  const el = document.getElementById('status-title') || document.getElementById('page-title');
  if (!el) return;
  el.focus({ preventScroll: true });
  if (scroll) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }
}

// Count calendar clicks for the user test (server version only).
app.addEventListener('click', (event) => {
  const link = event.target.closest('[data-track]');
  if (link && route.crewId) store.act(route.crewId, { type: 'track', hangId: route.hangId, what: link.dataset.track }).catch(() => {});
});

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
    const what = { 'share-text': 'share', 'nudge-text': 'remind', 'locked-text': 'confirmed' }[target.dataset.source];
    if (what && route.crewId) store.act(route.crewId, { type: 'track', hangId: route.hangId, what }).catch(() => {});
    return;
  }
  if (a === 'switch-yes' || a === 'switch-no') {
    const s = ui.privateLink;
    ui.privateLink = null;
    if (s && a === 'switch-yes') store.claim(s.crewId, s.memberId, s.key, s.crewName);
    return void go(s ? `crew-${s.crewId}` : 'start');
  }
  if (a === 'share') {
    const el = document.getElementById(target.dataset.source);
    if (el && typeof navigator.share === 'function') navigator.share({ text: el.textContent }).catch(() => {});
    return;
  }
  if (a === 'copy-text') {
    copyText(target.dataset.text, target);
    return;
  }
  if (a === 'go-status') {
    focusStatus(true);
    return;
  }
  if (a === 'seats-edit') {
    ui.seatsEdit = true;
    redraw();
    document.getElementById('h-seats')?.focus();
    return;
  }
  if (a === 'show-code') {
    return void run(() => showCode(currentHang()));
  }
  if (a === 'joined-close') {
    ui.justJoined = false;
    redraw();
    return;
  }
  if (a === 'remove-ask' || a === 'remove-cancel') {
    ui.removeAsk = a === 'remove-ask' ? target.dataset.member : null;
    redraw();
    document.getElementById(ui.removeAsk ? 'remove-no' : 'leave-ask')?.focus();
    return;
  }
  if (a === 'remove') {
    return void run(async () => {
      ui.removeAsk = null;
      await store.act(route.crewId, { type: 'remove', targetId: target.dataset.member });
      await refresh(false);
      toast(`${target.dataset.name} was removed from the group.`);
    });
  }
  if (a === 'reset-key') {
    return void run(async () => {
      await store.resetKey(route.crewId);
      redraw();
      toast('New private link made. The old one no longer works.');
    });
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
      go('start', 'You left the group. Your answers were deleted.');
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
      case 'on': {
        ui.swapOpen = false;
        const wasReady = fresh.status === 'ready';
        await act({ type: 'respond', on: target.dataset.on === '1', seq: nextSeq() });
        cueIfReady(wasReady);
        break;
      }
      case 'like':
        await act({ type: 'like', placeId: target.dataset.place, on: target.getAttribute('aria-pressed') !== 'true' });
        break;
      case 'add-place':
        await act({ type: 'addPlace', placeId: L.newId(), name: target.dataset.value, vote: false });
        document.getElementById('p-name')?.focus();
        break;
      case 'lock':
        await act({ type: 'lock' });
        toast('The plan is confirmed. Copy the message and paste it into your group chat.');
        focusStatus();
        break;
      case 'join-time':
        await act({ type: 'respond', on: true, free: [...new Set([...fresh.mine.free, fresh.lock.slot])], seq: nextSeq() });
        focusStatus();
        break;
      case 'late-out': {
        const still = fresh.lock.people.length - 1;
        ui.swapOpen = false;
        await act({ type: 'respond', on: false, free: fresh.mine.free.filter((x) => x !== fresh.lock.slot), seq: nextSeq() });
        ui.lateMessage = { hangId: fresh.id, text: `Sorry everyone, I can't make it to ${fresh.idea} anymore. ${still} ${still === 1 ? 'person is' : 'people are'} still going. Have fun!` };
        redraw();
        document.getElementById('copy-late')?.focus();
        break;
      }
      case 'late-done':
        ui.lateMessage = null;
        redraw();
        focusStatus();
        break;
      case 'swap-save': {
        const free = [...ui.swapPick].filter((s) => s !== fresh.lock.slot);
        ui.swapOpen = false;
        ui.swapPick = null;
        await act({ type: 'respond', free, seq: nextSeq() });
        focusStatus();
        break;
      }
      case 'outcome':
        await act({ type: 'outcome', met: target.dataset.met === '1' });
        focusStatus();
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
      ui.justJoined = true;
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
  } else if (form.id === 'seats-form') {
    run(async () => {
      await act({ type: 'setSeats', seats: data.seats });
      ui.seatsEdit = false;
      toast('Saved. The plan now needs fewer people.');
    });
  } else if (form.id === 'checkin-form') {
    if (!requireFields(form, [['ci-code', 'Type the 4-digit code.']])) return;
    run(async () => {
      try {
        await act({ type: 'checkin', code: data.code });
      } catch (e) {
        if (['wrong_code', 'slow_down'].includes(e.code)) return showFieldError('ci-code', e.message);
        throw e;
      }
      ui.errors = {};
      toast("You're checked in.");
      focusStatus();
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
  focusPageOnRender = true; // also for the browser's back button
  ui.since = null;
  ui.lateMessage = null;
  load();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideToast();
});

load();
