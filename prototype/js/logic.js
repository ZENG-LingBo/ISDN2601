// Minibus: the plan rules.
// Pure functions only (no DOM, no storage, no network), so the browser demo
// and server.js run exactly the same rules and the tests can cover all of it.
//
// The idea: a Hong Kong red minibus leaves once enough seats are filled.
// A plan here is confirmed once enough friends are in and enough of them
// are free at the same time.

export const HK_OFFSET_MS = 8 * 60 * 60 * 1000; // Hong Kong has no daylight saving.
export const HOUR_MS = 60 * 60 * 1000;
export const DAYS_AHEAD = 7;
export const CLOSE_BEFORE_MS = 2 * HOUR_MS; // a time can't be picked less than 2 hours before it starts
export const DECIDE_AFTER_MS = 48 * HOUR_MS; // after this, a plan with enough people is confirmed without waiting for everyone
export const MIN_FOR_COUNTS = 2; // counts per time stay hidden until this many OTHER people are in...
export const MIN_ANSWERED_FOR_COUNTS = 3; // ...and this many other people have answered, so a yes can't be singled out
export const MOVED_NOTE_MS = 24 * 3600 * 1000; // "the plan moved" shows for a day
export const SHOWN_CODE_MS = 2 * 60 * 1000; // typing a code counts if someone else showed it this recently
export const REMOVE_AFTER_MS = 6 * HOUR_MS; // someone who never answered can be removed after this
export const AUTO_LEAD_MS = 12 * HOUR_MS; // Minibus only confirms or moves a plan on its own if it's at least this far away
export const CHECKIN_OPENS_BEFORE_MS = 30 * 60 * 1000; // check-in opens 30 minutes before the plan
export const CHECKINS_TO_MEET = 2; // this many check-ins count as "we met"
export const WAKING_HOUR = 9; // deadlines never land before 09:00 Hong Kong time

export const SLOT_TYPES = [
  { key: 'lunch', label: 'lunch', clock: '12:30–2pm', start: '12:30', end: '14:00', hours: 1.5 },
  { key: 'aft', label: 'afternoon', clock: '3–6pm', start: '15:00', end: '18:00', hours: 3 },
  { key: 'eve', label: 'evening', clock: '7–10pm', start: '19:00', end: '22:00', hours: 3 },
];

export const LIMITS = {
  name: 24,
  crewName: 40,
  idea: 60,
  place: 40,
  members: 20,
  hangs: 50,
  places: 12,
  sizeMin: 2,
  sizeMax: 20,
  seatsMin: 2,
  seatsMax: 12,
};

export const BUDGETS = ['', 'Under $50', '$50–100', '$100–200', '$200+'];

// Things the app counts per plan, to measure a user test. No personal data.
export const TRACKED = ['share', 'remind', 'confirmed', 'calendar'];

// Hall (2019): two people need about 50 hours together to become casual friends,
// 90 to become friends, and more than 200 to become close friends.
export const FRIEND_MILESTONES = [
  { hours: 50, label: 'casual friends' },
  { hours: 90, label: 'friends' },
  { hours: 200, label: 'close friends' },
];

export class ActionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const has = (obj, key) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

// ---------- ids ----------

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newId(len = 10) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

export function isId(value) {
  return typeof value === 'string' && /^[a-z0-9]{6,40}$/.test(value);
}

// ---------- text ----------

export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '') // invisible and direction-changing characters
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).slice(0, max).join('');
}

// ---------- dates and times ----------

export function hkDate(nowMs) {
  return new Date(nowMs + HK_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function slotId(date, key) {
  return `${date}_${key}`;
}

export function parseSlot(id) {
  if (typeof id !== 'string') return null;
  const [date, key, extra] = id.split('_');
  if (extra !== undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const type = SLOT_TYPES.find((t) => t.key === key);
  return type ? { date, key, type } : null;
}

export function slotTime(id, which = 'start') {
  const p = parseSlot(id);
  if (!p) return NaN;
  return Date.parse(`${p.date}T${p.type[which]}:00+08:00`);
}

// A time is closed once it's less than 2 hours away: too late to plan around it.
export function isClosed(id, nowMs) {
  return slotTime(id, 'start') - CLOSE_BEFORE_MS <= nowMs;
}

export function hasEnded(id, nowMs) {
  return slotTime(id, 'end') <= nowMs;
}

export function hangDays(hang) {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(hang.startDate, i));
}

export function hangSlots(hang) {
  return hangDays(hang).flatMap((d) => SLOT_TYPES.map((t) => slotId(d, t.key)));
}

// Start today, unless every time today is already closed.
export function startDateFor(nowMs) {
  const today = hkDate(nowMs);
  const open = SLOT_TYPES.some((t) => !isClosed(slotId(today, t.key), nowMs));
  return open ? today : addDays(today, 1);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function shortDayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

// "Sat 28 Nov, evening (7–10pm)": the time of day is spelled out, because "evening" alone is vague.
export function slotLabel(id) {
  const p = parseSlot(id);
  if (!p) return '';
  return `${dayLabel(p.date)}, ${p.type.label} (${p.type.clock})`;
}

export function slotHours(id) {
  const p = parseSlot(id);
  return p ? p.type.hours : 0;
}

// "Sat 28 Nov, 10:00" in Hong Kong time.
export function momentLabel(ms) {
  const d = new Date(ms + HK_OFFSET_MS);
  // Same clock style as the time labels: "9am", "1:30pm".
  const h = d.getUTCHours();
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const clock = `${h % 12 || 12}${mm === '00' ? '' : `:${mm}`}${h < 12 ? 'am' : 'pm'}`;
  return `${dayLabel(d.toISOString().slice(0, 10))}, ${clock}`;
}

// ---------- state ----------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function requireText(raw, max, message) {
  const text = cleanText(raw, max);
  if (!text) throw new ActionError('invalid', message);
  return text;
}

// 48 hours from now, rounded up to the hour, and moved to 09:00 if it would land in the night.
export function decideByFor(nowMs) {
  let t = Math.ceil((nowMs + DECIDE_AFTER_MS) / HOUR_MS) * HOUR_MS;
  const hkHour = new Date(t + HK_OFFSET_MS).getUTCHours();
  if (hkHour < WAKING_HOUR) t += (WAKING_HOUR - hkHour) * HOUR_MS;
  return t;
}

function makeHang({ hangId, memberId, idea, seats, budget }, nowMs) {
  return {
    id: hangId,
    idea: requireText(idea, LIMITS.idea, 'Add what the plan is, like "hotpot".'),
    seats: clampInt(seats, LIMITS.seatsMin, LIMITS.seatsMax, 3),
    budget: BUDGETS.includes(budget) ? budget : '',
    startDate: startDateFor(nowMs),
    createdBy: memberId,
    createdAt: nowMs,
    decideBy: decideByFor(nowMs),
    places: [],
    lock: null,
    note: null,
    outcome: null,
    stats: {},
  };
}

function makeMember(memberId, name, nowMs) {
  return { id: memberId, name, joinedAt: nowMs, r: {} };
}

export function createCrewState(input, nowMs) {
  const { crewId, hangId, memberId, crewName, size, creatorName, idea, seats, budget, demo } = input || {};
  if (![crewId, hangId, memberId].every(isId)) throw new ActionError('invalid', 'Something went wrong. Try again.');
  const crew = {
    id: crewId,
    name: requireText(crewName, LIMITS.crewName, 'Add a name for the group.'),
    size: clampInt(size, LIMITS.sizeMin, LIMITS.sizeMax, 5),
    createdAt: nowMs,
    createdBy: memberId,
    secret: newId(20), // only used to make check-in codes; never shown to anyone
    stats: {},
    demo: Boolean(demo),
  };
  const member = makeMember(memberId, requireText(creatorName, LIMITS.name, 'Add your name.'), nowMs);
  const hang = makeHang({ hangId, memberId, idea, seats, budget }, nowMs);
  const state = { v: 3, crew, hangs: { [hangId]: hang }, members: { [memberId]: member } };
  if (demo) state.demo = { clockOffset: 0, tomFree: [] };
  return state;
}

// Fill in fields that older saved data doesn't have.
export function migrate(state) {
  if (!state || typeof state !== 'object') return state;
  if (state.v === 1) {
    for (const hang of Object.values(state.hangs || {})) {
      if (typeof hang.decideBy !== 'number') hang.decideBy = hang.createdAt + DECIDE_AFTER_MS;
    }
    if (state.crew && state.crew.demo) {
      state.demo = { clockOffset: state.crew.clockOffset || 0, tomFree: state.crew.demoTomFree || [] };
      delete state.crew.clockOffset;
      delete state.crew.demoTomFree;
    }
    state.v = 2;
  }
  if (state.v === 2) {
    const crew = state.crew || {};
    if (!crew.secret) crew.secret = newId(20);
    if (!crew.stats) crew.stats = {};
    if (!crew.createdBy) {
      const first = Object.values(state.members || {}).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      crew.createdBy = first ? first.id : null;
    }
    state.v = 3;
  }
  return state;
}

// The person who can remove members: whoever made the group, or the longest-standing member if they left.
export function managerId(state) {
  if (has(state.members, state.crew.createdBy)) return state.crew.createdBy;
  const first = Object.values(state.members).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  return first ? first.id : null;
}

// The group maker can remove anyone who joined more than 6 hours ago. It doesn't depend on whether they
// answered, so neither the list nor a refusal can show who has answered. Their answers are deleted.
function canRemoveMember(state, managerIdValue, target, nowMs) {
  return target.id !== managerIdValue && nowMs - target.joinedAt >= REMOVE_AFTER_MS;
}

function bumpCrew(state, key) {
  if (!state.crew.stats) state.crew.stats = {};
  state.crew.stats[key] = (state.crew.stats[key] || 0) + 1;
}

// Count something about the group that isn't tied to a plan, like a refused join. For the server only.
export function countCrew(state, key) {
  bumpCrew(state, key);
  return state;
}

function response(member, hangId) {
  return has(member.r, hangId) ? member.r[hangId] : { on: null, free: [], likes: [] };
}

function getHang(state, hangId) {
  if (!isId(hangId) || !has(state.hangs, hangId)) throw new ActionError('not_found', "This plan doesn't exist anymore.");
  return state.hangs[hangId];
}

function getMember(state, memberId) {
  if (!isId(memberId) || !has(state.members, memberId)) throw new ActionError('not_member', "You're not in this group yet. Join first.");
  return state.members[memberId];
}

// ---------- check-in ----------

// A small, fast string hash (FNV-1a). The group's secret never leaves the server, so the code
// can't be worked out without it, and the server limits how many guesses each person gets.
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function checkinOpen(slot, nowMs) {
  return nowMs >= slotTime(slot, 'start') - CHECKIN_OPENS_BEFORE_MS && nowMs <= slotTime(slot, 'end');
}

// A 4-digit code that changes every minute.
// Each person who shows the code gets their own code, so a typed code says whose phone it came from.
export function checkinCode(state, hangId, nowMs, minutesAgo = 0, memberId = '') {
  const minute = Math.floor(nowMs / 60000) - minutesAgo;
  const n = hash32(`${state.crew.secret}|${hangId}|${memberId}|${minute}`) % 10000;
  return String(n).padStart(4, '0');
}

export function codeExpiresAt(nowMs) {
  return (Math.floor(nowMs / 60000) + 1) * 60000;
}

// ---------- summary ----------

export function summarize(state, hangId, nowMs) {
  const hang = getHang(state, hangId);
  const members = Object.values(state.members);
  const expected = Math.max(state.crew.size, members.length);
  const answered = members.filter((m) => typeof response(m, hangId).on === 'boolean');
  const onBoard = members.filter((m) => response(m, hangId).on === true);

  const slots = hangSlots(hang).map((id) => ({
    id,
    closed: isClosed(id, nowMs),
    count: onBoard.filter((m) => response(m, hangId).free.includes(id)).length,
  }));

  // The open time with the most people free. Ties go to the earliest.
  let best = null;
  for (const s of slots) {
    if (s.closed || s.count === 0) continue;
    if (!best || s.count > best.count) best = s;
  }

  const likeCount = (placeId) => members.filter((m) => response(m, hangId).likes.includes(placeId)).length;
  const places = hang.places
    .map((p, i) => ({ ...p, likes: likeCount(p.id), order: i }))
    .sort((a, b) => b.likes - a.likes || a.order - b.order);

  const ready = onBoard.length >= hang.seats && Boolean(best) && best.count >= hang.seats;
  const everyoneAnswered = answered.length >= expected;
  const checkedIn = hang.lock ? onBoard.filter((m) => response(m, hangId).checkedIn && response(m, hangId).free.includes(hang.lock.slot)).map((m) => m.id) : [];
  const metYes = members.filter((m) => response(m, hangId).met === true).length;
  const metNo = members.filter((m) => response(m, hangId).met === false).length;
  const deadlinePassed = nowMs >= hang.decideBy;
  const anyOpen = slots.some((s) => !s.closed);

  const lockPeople = hang.lock
    ? onBoard.filter((m) => response(m, hangId).free.includes(hang.lock.slot)).map((m) => m.id)
    : [];

  let status = 'open';
  if (hang.outcome) status = hang.outcome.met ? 'happened' : 'fizzled';
  else if (hang.lock && hasEnded(hang.lock.slot, nowMs)) status = lockPeople.length ? 'check' : 'fizzled';
  else if (hang.lock) status = 'locked';
  else if (!anyOpen) status = 'expired';
  else if (ready) status = 'ready';

  return {
    hang,
    expected,
    joined: members.length,
    answeredIds: answered.map((m) => m.id),
    onBoardIds: onBoard.map((m) => m.id),
    waiting: Math.max(0, expected - answered.length),
    slots,
    best,
    ready,
    everyoneAnswered,
    deadlinePassed,
    places,
    topPlace: places[0] || null,
    lockPeople,
    checkedIn,
    metYes,
    metNo,
    // No time works, and either everyone has answered or 48 hours have passed.
    stuck: !hang.lock && !hang.outcome && anyOpen && (everyoneAnswered || deadlinePassed) && answered.length > 0 && !ready,
    status,
  };
}

// ---------- automatic changes ----------

// For automatic changes: the time with the most people free (ties go to the earliest) that has
// enough people and is far enough ahead for everyone to see it. Without notifications, a plan
// confirmed for "in 3 hours" could pass before anyone opens the app.
function bestAutoSlot(summary, seats, nowMs) {
  let best = null;
  for (const s of summary.slots) {
    if (s.closed || s.count < seats || slotTime(s.id, 'start') - nowMs < AUTO_LEAD_MS) continue;
    if (!best || s.count > best.count) best = s;
  }
  return best;
}

function lockTo(hang, summary, slot, nowMs, reason) {
  const place = summary.topPlace;
  hang.lock = { slot: slot.id, placeId: place ? place.id : null, at: nowMs, reason };
  if (!hang.firstLock) hang.firstLock = { slot: slot.id, at: nowMs, reason }; // kept for measuring, even if the plan moves
}

// Runs after every change, and when someone opens the plan. Keeps confirmed plans honest:
// - if the confirmed time no longer has enough people, move to the best time that does,
//   or go back to choosing a time if none does;
// - confirm a plan that's ready once everyone has answered, or once the 48-hour deadline passes.
export function settle(state, nowMs) {
  settleChanged(state, nowMs);
  return state;
}

function bump(hang, key) {
  if (!hang.stats) hang.stats = {};
  hang.stats[key] = (hang.stats[key] || 0) + 1;
}

// Same as settle, but says whether anything changed, so the server only saves when needed.
export function settleChanged(state, nowMs) {
  let changed = false;
  for (const hang of Object.values(state.hangs)) {
    if (hang.outcome) continue;
    const summary = summarize(state, hang.id, nowMs);

    if (hang.lock) {
      if (isClosed(hang.lock.slot, nowMs)) continue; // too late to move it now
      if (summary.lockPeople.length >= hang.seats) {
        const place = summary.topPlace;
        const placeId = place ? place.id : null; // follow the group's favourite place until then
        if (hang.lock.placeId !== placeId) {
          hang.lock.placeId = placeId;
          changed = true;
        }
        continue;
      }
      changed = true;
      const from = hang.lock.slot;
      const next = bestAutoSlot(summary, hang.seats, nowMs);
      if (next) {
        lockTo(hang, summary, next, nowMs, 'moved');
        hang.note = { type: 'moved', from, to: next.id, at: nowMs };
        bump(hang, 'moved');
      } else {
        hang.lock = null;
        hang.note = { type: 'unlocked', from, at: nowMs };
        bump(hang, 'unlocked');
      }
      continue;
    }

    if (summary.ready && (summary.everyoneAnswered || summary.deadlinePassed)) {
      const slot = bestAutoSlot(summary, hang.seats, nowMs);
      // Only confirm the time people have been seeing as the best. If that one is too soon, someone
      // has to confirm it, so nobody turns up at a time Minibus quietly swapped.
      if (slot && (!summary.best || slot.id === summary.best.id)) {
        const reason = summary.everyoneAnswered ? 'auto' : 'deadline';
        lockTo(hang, summary, slot, nowMs, reason);
        hang.note = { type: reason, to: slot.id, at: nowMs };
        changed = true;
      }
      // Otherwise the only good time is soon. Someone in the group has to confirm it themselves.
    }
  }
  return changed;
}

// ---------- actions ----------

export function reduce(prev, action, nowMs) {
  if (!action || typeof action !== 'object') throw new ActionError('invalid', 'Something went wrong. Try again.');
  const state = clone(prev);
  const { type } = action;

  if (type === 'join') {
    if (!isId(action.memberId) || has(state.members, action.memberId)) throw new ActionError('invalid', 'Something went wrong. Try again.');
    if (Object.keys(state.members).length >= LIMITS.members) {
      throw new ActionError('full', `This group is full. A group can have up to ${LIMITS.members} people.`);
    }
    const name = requireText(action.name, LIMITS.name, 'Add your name.');
    const taken = Object.values(state.members).some((m) => m.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new ActionError('name_taken', `Someone in this group is already called ${name}. Try adding your last initial.`);
    state.members[action.memberId] = makeMember(action.memberId, name, nowMs);
    if (Object.keys(state.members).length > state.crew.size) state.crew.size = Object.keys(state.members).length;
    return settle(state, nowMs);
  }

  const member = getMember(state, action.memberId);

  if (type === 'leave') {
    delete state.members[member.id];
    bumpCrew(state, 'left');
    const left = Object.keys(state.members).length;
    state.crew.size = Math.max(LIMITS.sizeMin, left, state.crew.size - 1);
    return settle(state, nowMs);
  }

  // Remove someone who joined more than 6 hours ago (for example, they lost their phone and joined again).
  // Their answers are deleted.
  if (type === 'remove') {
    // One message for every reason, so trying it never tells you whether someone has answered.
    const refuse = () => new ActionError('cant_remove', "You can't remove this person. Only the person who made the group can remove members, or the earliest member if the maker has left. Members can be removed only after 6 hours in the group.");
    const manager = managerId(state);
    if (member.id !== manager || !isId(action.targetId) || !has(state.members, action.targetId)) throw refuse();
    const target = state.members[action.targetId];
    if (!canRemoveMember(state, manager, target, nowMs)) throw refuse();
    delete state.members[target.id];
    bumpCrew(state, 'removed');
    state.crew.size = Math.max(LIMITS.sizeMin, Object.keys(state.members).length, state.crew.size - 1);
    return settle(state, nowMs);
  }

  if (type === 'setSize') {
    const count = Object.keys(state.members).length;
    const min = Math.max(LIMITS.sizeMin, count);
    const asked = clampInt(action.size, 0, LIMITS.sizeMax, state.crew.size);
    if (asked < min) throw new ActionError('invalid', count > LIMITS.sizeMin ? `This group already has ${count} members, so its size can't be lower than that.` : `A group needs at least ${LIMITS.sizeMin} people.`);
    state.crew.size = clampInt(action.size, min, LIMITS.sizeMax, state.crew.size);
    return settle(state, nowMs);
  }

  if (type === 'createHang') {
    if (!isId(action.hangId) || has(state.hangs, action.hangId)) throw new ActionError('invalid', 'Something went wrong. Try again.');
    if (Object.keys(state.hangs).length >= LIMITS.hangs) throw new ActionError('full', 'This group has too many plans. Ask the person who runs the server to clear old ones.');
    state.hangs[action.hangId] = makeHang({ ...action, memberId: member.id }, nowMs);
    return settle(state, nowMs);
  }

  const hang = getHang(state, action.hangId);
  const r = clone(response(member, hang.id));

  if (type === 'track') {
    if (!TRACKED.includes(action.what)) return state;
    if (!hang.trackedBy) hang.trackedBy = {};
    const who = hang.trackedBy[action.what] || [];
    if (!who.includes(member.id)) {
      hang.trackedBy[action.what] = [...who, member.id];
      bump(hang, action.what);
    }
    return state;
  }

  if (type === 'setSeats') {
    if (hang.lock || hang.outcome) throw new ActionError('closed', "This plan is already confirmed.");
    const seats = clampInt(action.seats, LIMITS.seatsMin, LIMITS.seatsMax, hang.seats);
    const s0 = summarize(state, hang.id, nowMs);
    if (s0.answeredIds.some((id) => id !== member.id) && r.on !== true) throw new ActionError('closed', "Only people who are in can change the number of people needed.");
    // Once others have answered, changing the number could be used to work out their answers.
    // The one exception: everyone has answered and no time works, so the group can need fewer people.
    const s = summarize(state, hang.id, nowMs);
    const othersAnswered = s.answeredIds.some((id) => id !== member.id);
    if (othersAnswered && !s.stuck) {
      throw new ActionError('closed', "The number of people needed can't change once others have answered. It can only go down if everyone has answered and no time works.");
    }
    if (othersAnswered && seats >= hang.seats) throw new ActionError('invalid', `Choose a number lower than ${hang.seats}.`);
    hang.seats = seats;
    return settle(state, nowMs);
  }

  if (type === 'showCode' || type === 'checkin') {
    if (!hang.lock || (hang.outcome && !hang.outcome.checked)) throw new ActionError('not_locked', 'Check-in is only for confirmed plans.');
    if (!checkinOpen(hang.lock.slot, nowMs)) throw new ActionError('checkin_closed', 'Check-in opens 30 minutes before the plan and closes when it ends.');
    const summary = summarize(state, hang.id, nowMs);
    if (!summary.lockPeople.includes(member.id)) throw new ActionError('not_going', 'Only people who are going can check in.');
    if (type === 'showCode') {
      // Showing the code doesn't check you in. You're checked in when a friend types it in.
      r.shownAt = nowMs;
      member.r[hang.id] = r;
      return state;
    }
    const raw = typeof action.code === 'string' || typeof action.code === 'number' ? String(action.code) : '';
    const code = raw.replace(/\D/g, '');
    const matches = (id) => code === checkinCode(state, hang.id, nowMs, 0, id) || code === checkinCode(state, hang.id, nowMs, 1, id);
    // The code has to come from someone else who showed it in the last 2 minutes. Both of you are checked in.
    const showers = summary.lockPeople.filter((id) => {
      if (id === member.id || !matches(id)) return false;
      const theirs = response(state.members[id], hang.id);
      return typeof theirs.shownAt === 'number' && nowMs - theirs.shownAt <= SHOWN_CODE_MS;
    });
    if (!showers.length && !matches(member.id)) throw new ActionError('wrong_code', "That code didn't work. Codes change every minute, so ask for the current one.");
    if (!showers.length) throw new ActionError('no_shower', 'That code has to come from a friend\'s phone. Ask a friend who is there to tap "Show the code", then type in their code.');
    if (!r.checkedIn) r.checkedIn = nowMs;
    member.r[hang.id] = r;
    for (const id of showers) {
      const theirs = state.members[id].r[hang.id];
      if (!theirs.checkedIn) theirs.checkedIn = nowMs;
    }
    const after = summarize(state, hang.id, nowMs);
    if (after.checkedIn.length >= CHECKINS_TO_MEET && !hang.outcome) {
      hang.outcome = { met: true, at: nowMs, by: member.id, checked: true };
    }
    return state;
  }

  if (type === 'respond') {
    // After 2 check-ins the plan counts as met, but until it ends people can still join or drop out.
    const stillOn = hang.outcome && hang.outcome.checked && hang.lock && !hasEnded(hang.lock.slot, nowMs);
    if (hang.outcome && !stillOn) throw new ActionError('closed', 'This plan is over. Start a new one.');
    if (stillOn && r.checkedIn) throw new ActionError('closed', "You've already checked in to this plan, so your answer can't change now.");
    // A save that was sent before the last one we kept is out of date. Ignore it.
    // seq is the phone's clock in microseconds. One far in the future (a fast clock, or made up)
    // is ignored, so it can't block later saves.
    const maxSeq = (nowMs + 60_000) * 1000 + 999;
    const seqOk = (x) => typeof x === 'number' && Number.isFinite(x) && x <= maxSeq;
    if (seqOk(action.seq) && seqOk(r.seq) && action.seq < r.seq) return state;
    if (seqOk(action.seq)) r.seq = action.seq;
    else if (!seqOk(r.seq)) delete r.seq;
    if (!r.at) r.at = nowMs; // first answer, for measuring how fast people reply
    r.updatedAt = nowMs;
    if (action.on !== undefined) {
      if (action.on !== null && typeof action.on !== 'boolean') throw new ActionError('invalid', 'Something went wrong. Try again.');
      r.on = action.on;
    }
    if (action.decline !== undefined && typeof action.decline !== 'boolean') throw new ActionError('invalid', 'Something went wrong. Try again.');
    if (action.decline === true && hang.lock) {
      // "No, I can't" make the confirmed time: you stay in, and your other times still count if the plan moves.
      r.declined = hang.lock.slot;
      r.free = r.free.filter((id) => id !== hang.lock.slot);
    }
    if (action.free !== undefined) {
      if (!Array.isArray(action.free)) throw new ActionError('invalid', 'Something went wrong. Try again.');
      const valid = new Set(hangSlots(hang));
      const before = new Set(r.free);
      // New times must still be open. Times you already had stay, even if they've since closed.
      // The confirmed time can always be added until it ends, so you can still join, or undo "I can't come".
      const joinable = (id) => hang.lock && id === hang.lock.slot && nowMs < slotTime(id, 'end');
      r.free = [...new Set(action.free)].filter((id) => valid.has(id) && (!isClosed(id, nowMs) || before.has(id) || joinable(id)));
      // Joining after the start is allowed (you can still check in), but without a check-in
      // a late joiner can't decide "Did you meet?" for the people who were there.
      if (hang.lock && r.free.includes(hang.lock.slot) && !before.has(hang.lock.slot) && nowMs >= slotTime(hang.lock.slot)) r.lateJoin = nowMs;
      // Taking the confirmed time out of your times is the same as saying you can't make it.
      if (hang.lock && before.has(hang.lock.slot) && !r.free.includes(hang.lock.slot)) r.declined = hang.lock.slot;
    }
    if (hang.lock && r.free.includes(hang.lock.slot)) delete r.declined;
    const goingBefore = hang.lock && isClosed(hang.lock.slot, nowMs) ? summarize(state, hang.id, nowMs).lockPeople : null;
    member.r[hang.id] = r;
    // Too late to move the plan: tell the group plainly that someone can't make it.
    if (goingBefore) {
      const goingAfter = summarize(state, hang.id, nowMs).lockPeople;
      const wasGoing = goingBefore.includes(member.id);
      const isGoing = goingAfter.includes(member.id);
      const dropped = hang.note && hang.note.type === 'dropped' ? hang.note : null;
      if (wasGoing && !isGoing) {
        // "out" and "prev" stay on the server: the view never says who dropped out.
        const out = dropped ? [...new Set([...(dropped.out || []), member.id])].filter((id) => has(state.members, id)) : [member.id];
        hang.note = { type: 'dropped', still: goingAfter.length, out, prev: dropped ? dropped.prev : hang.note, at: nowMs };
      } else if (!wasGoing && isGoing && dropped) {
        // If everyone who dropped out came back, take the notice back and show the one before it.
        const out = (dropped.out || []).filter((id) => id !== member.id);
        hang.note = out.length ? { ...dropped, out, still: goingAfter.length } : dropped.prev || null;
      }
    }
    return settle(state, nowMs);
  }

  if (type === 'addPlace') {
    if (hang.outcome) throw new ActionError('closed', 'This plan is over. Start a new one.');
    const name = requireText(action.name, LIMITS.place, 'Type a place first.');
    const existing = hang.places.find((p) => p.name.toLowerCase() === name.toLowerCase());
    let placeId = existing ? existing.id : action.placeId;
    if (!existing) {
      if (!isId(placeId) || hang.places.some((p) => p.id === placeId)) throw new ActionError('invalid', 'Something went wrong. Try again.');
      if (hang.places.length >= LIMITS.places) throw new ActionError('full', `This plan already has ${LIMITS.places} places. Vote for one of them.`);
      hang.places.push({ id: placeId, name, by: member.id });
    }
    // Suggesting a place from the quick list doesn't vote for it; typing one in does.
    if (action.vote !== false && !r.likes.includes(placeId)) r.likes.push(placeId);
    member.r[hang.id] = r;
    return settle(state, nowMs);
  }

  if (type === 'like') {
    if (!hang.places.some((p) => p.id === action.placeId)) throw new ActionError('not_found', "That place isn't on this plan anymore.");
    r.likes = r.likes.filter((id) => id !== action.placeId);
    if (action.on) r.likes.push(action.placeId);
    member.r[hang.id] = r;
    return settle(state, nowMs);
  }

  if (type === 'lock') {
    if (hang.lock || hang.outcome) return state;
    const summary = summarize(state, hang.id, nowMs);
    if (!summary.ready) throw new ActionError('not_ready', 'Not enough people are free at the same time yet.');
    if (r.on !== true) throw new ActionError('not_on_board', 'Say you\'re in first. Then you can confirm the plan.');
    lockTo(hang, summary, summary.best, nowMs, 'sent');
    hang.note = { type: 'sent', to: summary.best.id, by: member.id, at: nowMs };
    return settle(state, nowMs);
  }

  if (type === 'outcome') {
    if (!hang.lock) throw new ActionError('not_locked', "This plan was never confirmed.");
    if (!hasEnded(hang.lock.slot, nowMs)) throw new ActionError('too_early', "You can answer this after the plan.");
    if (hang.outcome && hang.outcome.checked) return state; // check-ins already settled it
    const summary = summarize(state, hang.id, nowMs);
    if (!summary.lockPeople.includes(member.id) || (r.lateJoin && !r.checkedIn)) throw new ActionError('not_going', 'Only people who were going when the plan started can answer this.');
    if (typeof action.met !== 'boolean') throw new ActionError('invalid', 'Something went wrong. Try again.');
    // Everyone who was going can answer. Each answer is kept; the result follows the answers so far.
    r.met = action.met;
    member.r[hang.id] = r;
    const after = summarize(state, hang.id, nowMs);
    hang.outcome = { met: after.metYes > 0 && after.metYes >= after.metNo, at: nowMs, by: member.id, yes: after.metYes, no: after.metNo };
    return state;
  }

  throw new ActionError('invalid', 'Something went wrong. Try again.');
}

// ---------- what each person is allowed to see ----------

export function crewHours(state) {
  let hours = 0;
  let times = 0;
  for (const hang of Object.values(state.hangs)) {
    if (hang.outcome && hang.outcome.met && hang.lock) {
      hours += slotHours(hang.lock.slot);
      times += 1;
    }
  }
  const next = FRIEND_MILESTONES.find((m) => m.hours > hours) || null;
  return { hours, times, next };
}

// Before a plan is confirmed, people see counts only: how many answered, how many are in,
// and (once at least 2 people are in) how many are free at each time. Never who.
export function buildView(state, meId, nowMs) {
  const me = meId && has(state.members, meId) ? state.members[meId] : null;
  const manager = managerId(state);
  const nameOf = (id) => (has(state.members, id) ? state.members[id].name : 'Someone');
  const hangs = Object.values(state.hangs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((hang) => {
      const s = summarize(state, hang.id, nowMs);
      const mine = me ? response(me, hang.id) : { on: null, free: [], likes: [] };
      const place = hang.lock && hang.lock.placeId ? hang.places.find((p) => p.id === hang.lock.placeId) : null;
      // Totals show only once at least 2 OTHER people are in, so nobody can work out a single person's answer.
      const othersIn = s.onBoardIds.filter((id) => !me || id !== me.id).length;
      const othersAnswered = s.answeredIds.filter((id) => !me || id !== me.id).length;
      // Someone who isn't signed in (or hasn't joined) sees no totals at all before the plan is
      // confirmed, so a member can't open the plan signed out and compare. Members see totals once
      // at least 2 others are in and at least 3 others have answered, so no one yes stands out.
      // Always 3 other answers. A smaller number for groups of 3 made totals appear exactly when the
      // last person said yes, and anyone could lower the group size to switch it on.
      const needAnswered = MIN_ANSWERED_FOR_COUNTS;
      const showCounts = Boolean(hang.lock) || (Boolean(me) && othersIn >= MIN_FOR_COUNTS && othersAnswered >= needAnswered);
      // A ready plan needs its best time shown, but not every other time's total.
      const showBest = showCounts || (Boolean(me) && s.ready);
      return {
        id: hang.id,
        idea: hang.idea,
        seats: hang.seats,
        budget: hang.budget,
        createdAt: hang.createdAt,
        createdBy: me ? nameOf(hang.createdBy) : '',
        decideBy: hang.decideBy,
        status: !me && s.status === 'ready' ? 'open' : s.status, // signed-out viewers can't tell if it's ready
        expected: s.expected,
        joined: s.joined,
        answered: s.answeredIds.length,
        // How many said yes is only shared once the plan is confirmed. Before that, "answered" alone
        // can't be split into yes and no.
        onBoard: hang.lock ? s.onBoardIds.length : null,
        waiting: s.waiting,
        notJoined: Math.max(0, s.expected - s.joined),
        days: hangDays(hang),
        showCounts,
        slots: s.slots.map((x) => ({ id: x.id, closed: x.closed, count: showCounts ? x.count : 0 })),
        best: showBest && s.best ? { id: s.best.id, count: s.best.count } : null,
        stuck: Boolean(me) && s.stuck,
        ready: Boolean(me) && s.ready,
        places: s.places.map((p) => ({ id: p.id, name: p.name, likes: p.likes, liked: mine.likes.includes(p.id) })),
        lock: hang.lock
          ? {
              slot: hang.lock.slot,
              placeName: place ? place.name : '',
              people: s.lockPeople.map(nameOf),
              reason: hang.lock.reason,
              imGoing: Boolean(me) && s.lockPeople.includes(me.id),
              canSayMet: Boolean(me) && s.lockPeople.includes(me.id) && !(mine.lateJoin && !mine.checkedIn),
              checkinOpen: checkinOpen(hang.lock.slot, nowMs),
              tooLateToMove: isClosed(hang.lock.slot, nowMs),
              checkedIn: s.checkedIn.map(nameOf),
              iCheckedIn: Boolean(me) && s.checkedIn.includes(me.id),
            }
          : null,
        note: hang.note && !(hang.note.type === 'moved' && nowMs - hang.note.at > MOVED_NOTE_MS) ? { type: hang.note.type, from: hang.note.from, to: hang.note.to, still: hang.note.still, by: hang.note.by ? nameOf(hang.note.by) : undefined } : null,
        outcome: hang.outcome ? { met: hang.outcome.met, checked: Boolean(hang.outcome.checked), yes: s.metYes, no: s.metNo } : null,
        mine: {
          on: mine.on,
          free: mine.free,
          likes: mine.likes,
          met: typeof mine.met === 'boolean' ? mine.met : null,
          declined: Boolean(hang.lock && mine.declined === hang.lock.slot), // said they can't make the confirmed time
        },
      };
    });
  return {
    crew: { id: state.crew.id, name: state.crew.name, size: state.crew.size, demo: state.crew.demo },
    me: me ? { id: me.id, name: me.name } : null,
    members: (me ? Object.values(state.members) : []).map((m) => ({
      id: m.id,
      name: m.name,
      canRemove: Boolean(me) && me.id === manager && canRemoveMember(state, manager, m, nowMs),
    })),
    iManage: Boolean(me) && me.id === manager,
    hangs,
    hours: crewHours(state),
    now: nowMs,
  };
}

// What the admin export contains: everything except the group's check-in secret.
export function exportState(state) {
  const copy = clone(state);
  delete copy.crew.secret;
  return copy;
}

// ---------- messages people paste into the group chat ----------

export function shareMessage(hang, link) {
  return [
    `Hi everyone! Instead of just saying we should hang out, let's actually plan it: ${hang.idea}.`,
    ``,
    `Open the link, say if you're in, and tap the times you're free. Until the plan is confirmed, Minibus shows totals, not names. It's confirmed once ${hang.seats} of us can make the same time.`,
    ``,
    link,
  ].join('\n');
}

export function nudgeMessage(view, link) {
  const people = view.waiting === 1 ? '1 person hasn\'t' : `${view.waiting} people haven't`;
  return `Minibus reminder: ${people} answered yet for "${view.idea}". It takes about 20 seconds: ${link}`;
}

export function lockedMessage(view, link) {
  const where = view.lock.placeName ? `, ${view.lock.placeName}` : '';
  const moved = view.note && view.note.type === 'moved' && view.note.from;
  return [
    moved ? `The plan has moved: ${view.idea}` : `The plan is confirmed: ${view.idea}`,
    `${moved ? 'New time: ' : ''}${slotLabel(view.lock.slot)}${where}`,
    ...(moved ? [`Old time: ${slotLabel(view.note.from)}`] : []),
    `Going: ${view.lock.people.join(', ')}`,
    ``,
    view.lock.tooLateToMove ? `Open the plan here: ${link}` : `If something comes up, change your times in the app instead of cancelling: ${link}`,
  ].join('\n');
}

// ---------- calendar ----------

function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function calendarUrl(view, crewName) {
  const start = slotTime(view.lock.slot, 'start');
  const end = slotTime(view.lock.slot, 'end');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${view.idea} (${crewName})`,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details: 'Planned with Minibus.', // no names: Google would see them
  });
  if (view.lock.placeName) params.set('location', view.lock.placeName);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function icsText(view, crewName, uid, nowMs) {
  const start = slotTime(view.lock.slot, 'start');
  const end = slotTime(view.lock.slot, 'end');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Minibus//Plans//EN',
    'BEGIN:VEVENT',
    `UID:${uid}@minibus`,
    `DTSTAMP:${utcStamp(nowMs)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${icsEscape(`${view.idea} (${crewName})`)}`,
    `DESCRIPTION:${icsEscape('Planned with Minibus.')}`,
  ];
  if (view.lock.placeName) lines.push(`LOCATION:${icsEscape(view.lock.placeName)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// ---------- demo group with pretend friends ----------

export const DEMO_FRIENDS = ['Jason', 'Mei', 'Tom', 'Ka Yan'];

export function createDemoState(ids, nowMs) {
  const { crewId, hangId, memberIds } = ids; // memberIds: one per demo friend
  let state = createCrewState(
    {
      crewId,
      hangId,
      memberId: memberIds[0],
      crewName: 'O-camp gang',
      size: 5,
      creatorName: DEMO_FRIENDS[0],
      idea: 'Dinner somewhere cheap',
      seats: 3,
      budget: '$50–100',
      demo: true,
    },
    nowMs,
  );
  for (let i = 1; i < DEMO_FRIENDS.length; i++) {
    state = reduce(state, { type: 'join', memberId: memberIds[i], name: DEMO_FRIENDS[i] }, nowMs);
  }
  const hang = state.hangs[hangId];
  const open = hangSlots(hang).filter((id) => !isClosed(id, nowMs));
  const pick = (...idx) => idx.map((i) => open[i]).filter(Boolean);
  // Jason started it and is free a few times.
  state = reduce(state, { type: 'respond', memberId: memberIds[0], hangId, on: true, free: pick(2, 5, 8, 11) }, nowMs);
  // Mei is free twice when Jason is. The earlier one is the best time so far.
  state = reduce(state, { type: 'respond', memberId: memberIds[1], hangId, on: true, free: pick(5, 8, 10) }, nowMs);
  // Ka Yan can't make it this week.
  state = reduce(state, { type: 'respond', memberId: memberIds[3], hangId, on: false, free: [] }, nowMs);
  // Tom hasn't answered. When he does, he's free at the later shared time,
  // so if someone can't make the first time, the plan has somewhere to move to.
  state.demo.tomFree = pick(8, 11);
  state = reduce(state, { type: 'addPlace', memberId: memberIds[0], hangId, placeId: ids.placeIds[0], name: 'Hang Hau' }, nowMs);
  state = reduce(state, { type: 'addPlace', memberId: memberIds[1], hangId, placeId: ids.placeIds[1], name: 'Mong Kok' }, nowMs);
  state = reduce(state, { type: 'like', memberId: memberIds[1], hangId, placeId: ids.placeIds[0], on: true }, nowMs);
  return state;
}
