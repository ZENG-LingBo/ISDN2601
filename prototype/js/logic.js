// Minibus: the plan rules.
// Pure functions only (no DOM, no storage, no network), so the browser demo
// and server.js run exactly the same rules and the tests can cover all of it.
//
// The idea: a Hong Kong red minibus leaves once enough seats are filled.
// A plan here "leaves" (gets locked) once enough friends have hopped on
// and enough of them are free at the same time.

export const HK_OFFSET_MS = 8 * 60 * 60 * 1000; // Hong Kong has no daylight saving.
export const DAYS_AHEAD = 7;

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

export const BUDGETS = ['', 'under $50', '$50–100', '$100–200', '$200+'];

// Hall (2019): roughly 50 h to casual friend, 90 h to friend, 200+ h to close friend.
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
  return typeof value === 'string' && /^[a-z0-9]{6,24}$/.test(value);
}

// ---------- text ----------

export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  // Collapse whitespace and drop control characters.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, max).join('');
}

// ---------- dates and slots ----------

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

export function isPast(id, nowMs) {
  return slotTime(id, 'start') <= nowMs;
}

export function hangDays(hang) {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(hang.startDate, i));
}

export function hangSlots(hang) {
  return hangDays(hang).flatMap((d) => SLOT_TYPES.map((t) => slotId(d, t.key)));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
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

// ---------- state ----------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function requireName(raw, max, what) {
  const name = cleanText(raw, max);
  if (!name) throw new ActionError('invalid', `${what} can't be empty`);
  return name;
}

function makeHang({ hangId, memberId, idea, seats, budget }, nowMs) {
  return {
    id: hangId,
    idea: requireName(idea, LIMITS.idea, 'the plan'),
    seats: clampInt(seats, LIMITS.seatsMin, LIMITS.seatsMax, 3),
    budget: BUDGETS.includes(budget) ? budget : '',
    startDate: hkDate(nowMs),
    createdBy: memberId,
    createdAt: nowMs,
    places: [],
    lock: null,
    note: null,
    outcome: null,
  };
}

function makeMember(memberId, name, nowMs) {
  return { id: memberId, name, joinedAt: nowMs, r: {} };
}

export function createCrewState(input, nowMs) {
  const { crewId, hangId, memberId, crewName, size, creatorName, idea, seats, budget, demo } = input;
  if (![crewId, hangId, memberId].every(isId)) throw new ActionError('invalid', 'bad id');
  const crew = {
    id: crewId,
    name: requireName(crewName, LIMITS.crewName, 'the group name'),
    size: clampInt(size, LIMITS.sizeMin, LIMITS.sizeMax, 5),
    createdAt: nowMs,
    demo: Boolean(demo),
    clockOffset: 0,
  };
  const member = makeMember(memberId, requireName(creatorName, LIMITS.name, 'your name'), nowMs);
  const hang = makeHang({ hangId, memberId, idea, seats, budget }, nowMs);
  return { v: 1, crew, hangs: { [hangId]: hang }, members: { [memberId]: member } };
}

function response(member, hangId) {
  return member.r[hangId] || { on: null, free: [], likes: [] };
}

function getHang(state, hangId) {
  const hang = state.hangs[hangId];
  if (!hang) throw new ActionError('not_found', "that plan doesn't exist anymore");
  return hang;
}

function getMember(state, memberId) {
  const member = state.members[memberId];
  if (!member) throw new ActionError('not_member', "you're not in this group yet");
  return member;
}

// ---------- summary ----------

export function summarize(state, hangId, nowMs) {
  const hang = getHang(state, hangId);
  const members = Object.values(state.members);
  const expected = Math.max(state.crew.size, members.length);
  const answered = members.filter((m) => typeof response(m, hangId).on === 'boolean');
  const onBoard = members.filter((m) => response(m, hangId).on === true);
  const onBoardIds = onBoard.map((m) => m.id);

  const slots = hangSlots(hang).map((id) => {
    const count = onBoard.filter((m) => response(m, hangId).free.includes(id)).length;
    return { id, past: isPast(id, nowMs), count };
  });

  let best = null;
  for (const s of slots) {
    if (s.past || s.count === 0) continue;
    if (!best || s.count > best.count) best = s;
  }

  const likeCount = (placeId) => members.filter((m) => response(m, hangId).likes.includes(placeId)).length;
  const places = hang.places
    .map((p, i) => ({ ...p, likes: likeCount(p.id), order: i }))
    .sort((a, b) => b.likes - a.likes || a.order - b.order);

  const ready = onBoard.length >= hang.seats && Boolean(best) && best.count >= hang.seats;
  const everyoneAnswered = answered.length >= expected;

  let lockPeople = [];
  if (hang.lock) {
    lockPeople = onBoard.filter((m) => response(m, hangId).free.includes(hang.lock.slot)).map((m) => m.id);
  }

  let status = 'open';
  if (hang.outcome) status = hang.outcome.met ? 'happened' : 'fizzled';
  else if (hang.lock) status = isPast(hang.lock.slot, nowMs) ? 'check' : 'locked';
  else if (ready) status = 'ready';

  return {
    hang,
    expected,
    joined: members.length,
    answeredIds: answered.map((m) => m.id),
    onBoardIds,
    waiting: Math.max(0, expected - answered.length),
    slots,
    best,
    ready,
    everyoneAnswered,
    places,
    topPlace: places[0] || null,
    lockPeople,
    status,
  };
}

// ---------- automatic moves ----------

// The future time with the most people free (ties go to the earliest), if it has enough.
function bestSlotAtLeast(summary, seats) {
  let best = null;
  for (const s of summary.slots) {
    if (s.past || s.count < seats) continue;
    if (!best || s.count > best.count) best = s;
  }
  return best;
}

function lockTo(hang, summary, slot, nowMs, reason) {
  const place = summary.topPlace;
  hang.lock = { slot: slot.id, placeId: place ? place.id : null, at: nowMs, reason };
}

// Runs after every action. Keeps locked plans honest:
// - if the locked time no longer has enough people, move it to the best time that does,
//   or put the plan back to "waiting" if no time works;
// - if a plan is ready and everyone has answered, lock it without anyone having to push.
export function settle(state, nowMs) {
  for (const hang of Object.values(state.hangs)) {
    if (hang.outcome) continue;
    let summary = summarize(state, hang.id, nowMs);

    if (hang.lock) {
      if (isPast(hang.lock.slot, nowMs)) continue; // it's history now, ask "did it happen?" instead
      const stillThere = summary.lockPeople.length;
      if (stillThere >= hang.seats) {
        // Keep the place in sync with the group's favourite until it leaves.
        const place = summary.topPlace;
        hang.lock.placeId = place ? place.id : null;
        continue;
      }
      const from = hang.lock.slot;
      const next = bestSlotAtLeast(summary, hang.seats);
      if (next) {
        lockTo(hang, summary, next, nowMs, 'moved');
        hang.note = { type: 'moved', from, to: next.id, at: nowMs };
      } else {
        hang.lock = null;
        hang.note = { type: 'unlocked', from, at: nowMs };
      }
      continue;
    }

    if (summary.ready && summary.everyoneAnswered) {
      lockTo(hang, summary, summary.best, nowMs, 'auto');
      hang.note = { type: 'auto', to: summary.best.id, at: nowMs };
    }
  }
  return state;
}

// ---------- actions ----------

export function reduce(prev, action, nowMs) {
  const state = clone(prev);
  const { type } = action || {};

  if (type === 'join') {
    if (!isId(action.memberId)) throw new ActionError('invalid', 'bad id');
    if (state.members[action.memberId]) throw new ActionError('invalid', 'already joined');
    if (Object.keys(state.members).length >= LIMITS.members) {
      throw new ActionError('full', `this group is full (${LIMITS.members} people max)`);
    }
    const name = requireName(action.name, LIMITS.name, 'your name');
    const taken = Object.values(state.members).some((m) => m.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new ActionError('name_taken', `someone here is already called ${name}. add an initial?`);
    state.members[action.memberId] = makeMember(action.memberId, name, nowMs);
    if (Object.keys(state.members).length > state.crew.size) state.crew.size = Object.keys(state.members).length;
    return settle(state, nowMs);
  }

  const member = getMember(state, action.memberId);

  if (type === 'createHang') {
    if (!isId(action.hangId) || state.hangs[action.hangId]) throw new ActionError('invalid', 'bad id');
    if (Object.keys(state.hangs).length >= LIMITS.hangs) throw new ActionError('full', 'too many plans in this group');
    state.hangs[action.hangId] = makeHang({ ...action, memberId: member.id }, nowMs);
    return settle(state, nowMs);
  }

  const hang = getHang(state, action.hangId);
  const r = clone(response(member, hang.id));

  if (type === 'respond') {
    if (hang.outcome) throw new ActionError('closed', 'this plan is already over');
    if (action.on !== undefined) {
      if (action.on !== null && typeof action.on !== 'boolean') throw new ActionError('invalid', 'bad answer');
      r.on = action.on;
    }
    if (action.free !== undefined) {
      if (!Array.isArray(action.free)) throw new ActionError('invalid', 'bad times');
      const valid = new Set(hangSlots(hang));
      r.free = [...new Set(action.free)].filter((id) => valid.has(id));
    }
    member.r[hang.id] = r;
    return settle(state, nowMs);
  }

  if (type === 'addPlace') {
    if (hang.outcome) throw new ActionError('closed', 'this plan is already over');
    const name = requireName(action.name, LIMITS.place, 'the place');
    const existing = hang.places.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const placeId = existing ? existing.id : action.placeId;
    if (!existing) {
      if (!isId(placeId)) throw new ActionError('invalid', 'bad id');
      if (hang.places.length >= LIMITS.places) throw new ActionError('full', 'that is plenty of places already');
      hang.places.push({ id: placeId, name, by: member.id });
    }
    if (!r.likes.includes(placeId)) r.likes.push(placeId);
    member.r[hang.id] = r;
    return settle(state, nowMs);
  }

  if (type === 'like') {
    if (!hang.places.some((p) => p.id === action.placeId)) throw new ActionError('not_found', 'that place is gone');
    r.likes = r.likes.filter((id) => id !== action.placeId);
    if (action.on) r.likes.push(action.placeId);
    member.r[hang.id] = r;
    return settle(state, nowMs);
  }

  if (type === 'lock') {
    if (hang.lock || hang.outcome) return state;
    const summary = summarize(state, hang.id, nowMs);
    if (!summary.ready) throw new ActionError('not_ready', "not enough people are free at the same time yet");
    if (r.on !== true) throw new ActionError('not_on_board', 'hop on first, then you can send it');
    lockTo(hang, summary, summary.best, nowMs, 'sent');
    hang.note = { type: 'sent', to: summary.best.id, by: member.id, at: nowMs };
    return settle(state, nowMs);
  }

  if (type === 'outcome') {
    if (!hang.lock) throw new ActionError('not_locked', "this plan never got a time");
    if (!isPast(hang.lock.slot, nowMs)) throw new ActionError('too_early', "it hasn't happened yet");
    if (typeof action.met !== 'boolean') throw new ActionError('invalid', 'bad answer');
    hang.outcome = { met: action.met, at: nowMs, by: member.id };
    return state;
  }

  throw new ActionError('invalid', 'unknown action');
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

// Who said yes stays hidden until the plan leaves. Before that, people only see counts.
export function buildView(state, meId, nowMs) {
  const me = meId && state.members[meId] ? state.members[meId] : null;
  const nameOf = (id) => (state.members[id] ? state.members[id].name : 'someone');
  const hangs = Object.values(state.hangs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((hang) => {
      const s = summarize(state, hang.id, nowMs);
      const mine = me ? response(me, hang.id) : { on: null, free: [], likes: [] };
      const place = hang.lock && hang.lock.placeId ? hang.places.find((p) => p.id === hang.lock.placeId) : null;
      const waitingNames = Object.values(state.members)
        .filter((m) => !s.answeredIds.includes(m.id))
        .map((m) => m.name);
      return {
        id: hang.id,
        idea: hang.idea,
        seats: hang.seats,
        budget: hang.budget,
        createdAt: hang.createdAt,
        createdBy: nameOf(hang.createdBy),
        status: s.status,
        expected: s.expected,
        joined: s.joined,
        answered: s.answeredIds.length,
        onBoard: s.onBoardIds.length,
        waiting: s.waiting,
        waitingNames,
        notJoined: Math.max(0, s.expected - s.joined),
        days: hangDays(hang),
        slots: s.slots,
        best: s.best,
        ready: s.ready,
        places: s.places.map((p) => ({ id: p.id, name: p.name, likes: p.likes, liked: mine.likes.includes(p.id) })),
        lock: hang.lock
          ? {
              slot: hang.lock.slot,
              placeName: place ? place.name : '',
              people: s.lockPeople.map(nameOf),
              reason: hang.lock.reason,
            }
          : null,
        note: hang.note ? { ...hang.note, by: hang.note.by ? nameOf(hang.note.by) : undefined } : null,
        outcome: hang.outcome,
        mine: { on: mine.on, free: mine.free, likes: mine.likes },
      };
    });
  return {
    crew: { id: state.crew.id, name: state.crew.name, size: state.crew.size, demo: state.crew.demo },
    me: me ? { id: me.id, name: me.name } : null,
    members: Object.values(state.members).map((m) => ({ id: m.id, name: m.name })),
    hangs,
    hours: crewHours(state),
    now: nowMs,
  };
}

// ---------- messages people paste into the group chat ----------

export function shareMessage(hang, link) {
  return [
    `ok i made us a thing so we stop just saying "we should hang out" lol`,
    ``,
    `${hang.idea}`,
    `it works like a red minibus: it only leaves once ${hang.seats} of us hop on and we're free at the same time. nobody sees who said yes until it's actually happening, so no pressure`,
    ``,
    `takes like 20 sec: ${link}`,
  ].join('\n');
}

export function nudgeMessage(view, link) {
  const people = view.waitingNames.length ? ` (${view.waitingNames.join(', ')})` : '';
  const waiting = view.waiting === 1 ? '1 person still hasn\'t answered' : `${view.waiting} people still haven't answered`;
  return `the minibus app is making me nudge you, not my fault 🙃 ${waiting}${people} for "${view.idea}". tap when you're free: ${link}`;
}

export function lockedMessage(view, link) {
  const where = view.lock.placeName ? `, ${view.lock.placeName}` : '';
  return [
    `it's actually happening: ${view.idea}`,
    `${slotLabel(view.lock.slot)}${where}`,
    `${view.lock.people.join(', ')}`,
    ``,
    `if something comes up, swap times in the app instead of bailing: ${link}`,
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
    'PRODID:-//Minibus//Hangout planner//EN',
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

// ---------- demo crew with simulated friends ----------

export const DEMO_FRIENDS = ['Jason', 'Mei', 'Tom', 'Ka Yan'];

export function createDemoState(ids, nowMs) {
  const { crewId, hangId, memberIds } = ids; // memberIds: one per demo friend
  const creatorId = memberIds[0];
  let state = createCrewState(
    {
      crewId,
      hangId,
      memberId: creatorId,
      crewName: 'O-camp gang',
      size: 5,
      creatorName: DEMO_FRIENDS[0],
      idea: 'dinner somewhere cheap',
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
  const future = hangSlots(hang).filter((id) => !isPast(id, nowMs));
  const pick = (...idx) => idx.map((i) => future[i]).filter(Boolean);
  // Jason started it, is keen, and is free a few times.
  state = reduce(state, { type: 'respond', memberId: memberIds[0], hangId, on: true, free: pick(2, 5, 8, 11) }, nowMs);
  // Mei is keen and overlaps with Jason twice. The earlier overlap is the one to beat.
  state = reduce(state, { type: 'respond', memberId: memberIds[1], hangId, on: true, free: pick(5, 8, 10) }, nowMs);
  // When Tom finally answers, he can do the later overlap, so a swap has somewhere to move to.
  state.crew.demoTomFree = pick(8, 11);
  // Ka Yan honestly can't this week.
  state = reduce(state, { type: 'respond', memberId: memberIds[3], hangId, on: false, free: [] }, nowMs);
  // Tom hasn't opened the link. Classic Tom.
  state = reduce(state, { type: 'addPlace', memberId: memberIds[0], hangId, placeId: ids.placeIds[0], name: 'Hang Hau' }, nowMs);
  state = reduce(state, { type: 'addPlace', memberId: memberIds[1], hangId, placeId: ids.placeIds[1], name: 'Mong Kok' }, nowMs);
  state = reduce(state, { type: 'like', memberId: memberIds[1], hangId, placeId: ids.placeIds[0], on: true }, nowMs);
  return state;
}
