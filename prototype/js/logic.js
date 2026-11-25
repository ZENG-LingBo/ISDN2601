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
export const MIN_FOR_COUNTS = 2; // counts per time stay hidden until this many people are in

export const SLOT_TYPES = [
  { key: 'lunch', label: 'lunch', start: '12:30', end: '14:00', hours: 1.5 },
  { key: 'aft', label: 'afternoon', start: '15:00', end: '18:00', hours: 3 },
  { key: 'eve', label: 'evening', start: '19:00', end: '22:00', hours: 3 },
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

export function slotLabel(id) {
  const p = parseSlot(id);
  if (!p) return '';
  return `${dayLabel(p.date)}, ${p.type.label}`;
}

export function slotHours(id) {
  const p = parseSlot(id);
  return p ? p.type.hours : 0;
}

// "Sat 28 Nov, 10:00" in Hong Kong time.
export function momentLabel(ms) {
  const d = new Date(ms + HK_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dayLabel(d.toISOString().slice(0, 10))}, ${hh}:${mm}`;
}

// ---------- state ----------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function requireText(raw, max, message) {
  const text = cleanText(raw, max);
  if (!text) throw new ActionError('invalid', message);
  return text;
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
    decideBy: Math.ceil((nowMs + DECIDE_AFTER_MS) / HOUR_MS) * HOUR_MS, // a round hour is easier to read
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
    demo: Boolean(demo),
  };
  const member = makeMember(memberId, requireText(creatorName, LIMITS.name, 'Add your name.'), nowMs);
  const hang = makeHang({ hangId, memberId, idea, seats, budget }, nowMs);
  const state = { v: 2, crew, hangs: { [hangId]: hang }, members: { [memberId]: member } };
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
    status,
  };
}

// ---------- automatic changes ----------

function bestSlotAtLeast(summary, seats) {
  return summary.best && summary.best.count >= seats ? summary.best : null;
}

function lockTo(hang, summary, slot, nowMs, reason) {
  const place = summary.topPlace;
  hang.lock = { slot: slot.id, placeId: place ? place.id : null, at: nowMs, reason };
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
      const next = bestSlotAtLeast(summary, hang.seats);
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
      const reason = summary.everyoneAnswered ? 'auto' : 'deadline';
      lockTo(hang, summary, summary.best, nowMs, reason);
      hang.note = { type: reason, to: summary.best.id, at: nowMs };
      changed = true;
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
    const left = Object.keys(state.members).length;
    state.crew.size = Math.max(LIMITS.sizeMin, left, state.crew.size - 1);
    return settle(state, nowMs);
  }

  // Remove someone who joined but never answered anything (for example, they lost their phone).
  // Anyone who has answered can only leave by themselves.
  if (type === 'remove') {
    if (!isId(action.targetId) || !has(state.members, action.targetId) || action.targetId === member.id) {
      throw new ActionError('not_found', "That person isn't in this group.");
    }
    const target = state.members[action.targetId];
    const answeredSomething = Object.values(target.r).some((x) => typeof x.on === 'boolean');
    if (answeredSomething) throw new ActionError('has_answers', `${target.name} has answered a plan, so only they can leave.`);
    delete state.members[target.id];
    state.crew.size = Math.max(LIMITS.sizeMin, Object.keys(state.members).length, state.crew.size - 1);
    return settle(state, nowMs);
  }

  if (type === 'setSize') {
    const min = Math.max(LIMITS.sizeMin, Object.keys(state.members).length);
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
    if (TRACKED.includes(action.what)) bump(hang, action.what);
    return state;
  }

  if (type === 'respond') {
    if (hang.outcome) throw new ActionError('closed', 'This plan is over. Start a new one.');
    if (!r.at) r.at = nowMs; // first answer, for measuring how fast people reply
    r.updatedAt = nowMs;
    if (action.on !== undefined) {
      if (action.on !== null && typeof action.on !== 'boolean') throw new ActionError('invalid', 'Something went wrong. Try again.');
      r.on = action.on;
    }
    if (action.free !== undefined) {
      if (!Array.isArray(action.free)) throw new ActionError('invalid', 'Something went wrong. Try again.');
      const valid = new Set(hangSlots(hang));
      const before = new Set(r.free);
      // New times must still be open. Times you already had stay, even if they've since closed.
      r.free = [...new Set(action.free)].filter((id) => valid.has(id) && (!isClosed(id, nowMs) || before.has(id)));
    }
    member.r[hang.id] = r;
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
    if (!r.likes.includes(placeId)) r.likes.push(placeId);
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
    if (hang.outcome) return state;
    const summary = summarize(state, hang.id, nowMs);
    if (!summary.lockPeople.includes(member.id)) throw new ActionError('not_going', 'Only people who were going can answer this.');
    if (typeof action.met !== 'boolean') throw new ActionError('invalid', 'Something went wrong. Try again.');
    hang.outcome = { met: action.met, at: nowMs, by: member.id };
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
  const nameOf = (id) => (has(state.members, id) ? state.members[id].name : 'Someone');
  const hangs = Object.values(state.hangs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((hang) => {
      const s = summarize(state, hang.id, nowMs);
      const mine = me ? response(me, hang.id) : { on: null, free: [], likes: [] };
      const place = hang.lock && hang.lock.placeId ? hang.places.find((p) => p.id === hang.lock.placeId) : null;
      // Totals show only once at least 2 OTHER people are in, so nobody can work out a single person's answer.
      const othersIn = s.onBoardIds.filter((id) => !me || id !== me.id).length;
      // Once a plan is ready, enough people share a time anyway, so totals give nothing more away.
      const showCounts = Boolean(hang.lock) || othersIn >= MIN_FOR_COUNTS || s.ready;
      return {
        id: hang.id,
        idea: hang.idea,
        seats: hang.seats,
        budget: hang.budget,
        createdAt: hang.createdAt,
        createdBy: nameOf(hang.createdBy),
        decideBy: hang.decideBy,
        status: s.status,
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
        best: showCounts && s.best ? { id: s.best.id, count: s.best.count } : null,
        ready: s.ready,
        places: s.places.map((p) => ({ id: p.id, name: p.name, likes: p.likes, liked: mine.likes.includes(p.id) })),
        lock: hang.lock
          ? {
              slot: hang.lock.slot,
              placeName: place ? place.name : '',
              people: s.lockPeople.map(nameOf),
              reason: hang.lock.reason,
              imGoing: Boolean(me) && s.lockPeople.includes(me.id),
            }
          : null,
        note: hang.note ? { type: hang.note.type, from: hang.note.from, to: hang.note.to, by: hang.note.by ? nameOf(hang.note.by) : undefined } : null,
        outcome: hang.outcome ? { met: hang.outcome.met } : null,
        stats: hang.stats || {},
        mine: { on: mine.on, free: mine.free, likes: mine.likes },
      };
    });
  return {
    crew: { id: state.crew.id, name: state.crew.name, size: state.crew.size, demo: state.crew.demo },
    me: me ? { id: me.id, name: me.name } : null,
    // canRemove: joined but never answered any plan (for example, they lost their phone).
    members: Object.values(state.members).map((m) => ({
      id: m.id,
      name: m.name,
      canRemove: Boolean(me) && m.id !== me.id && !Object.values(m.r).some((x) => typeof x.on === 'boolean'),
    })),
    hangs,
    hours: crewHours(state),
    now: nowMs,
  };
}

// ---------- messages people paste into the group chat ----------

export function shareMessage(hang, link) {
  return [
    `Hi everyone! Instead of just saying we should hang out, let's actually plan it: ${hang.idea}.`,
    ``,
    `Open the link, say if you're in, and tap the times you're free. Nobody sees who said yes until the plan is confirmed. It's confirmed once ${hang.seats} of us can make the same time.`,
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
  return [
    `The plan is confirmed: ${view.idea}`,
    `${slotLabel(view.lock.slot)}${where}`,
    `Going: ${view.lock.people.join(', ')}`,
    ``,
    `If something comes up, change your times in the app instead of cancelling: ${link}`,
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
    details: `With ${view.lock.people.join(', ')}. Planned with Minibus.`,
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
    `DESCRIPTION:${icsEscape(`With ${view.lock.people.join(', ')}.`)}`,
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
