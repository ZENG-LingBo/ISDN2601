import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

// Wed 25 Nov 2026, 10:00 in Hong Kong.
const NOW = Date.parse('2026-11-25T02:00:00Z');
const HOUR = L.HOUR_MS;

function crew(extra = {}) {
  return L.createCrewState(
    {
      crewId: 'crew000001',
      hangId: 'hang000001',
      memberId: 'mem0000001',
      crewName: 'O-camp gang',
      size: 4,
      creatorName: 'Mandy',
      idea: 'Dinner somewhere cheap',
      seats: 3,
      budget: '$50–100',
      ...extra,
    },
    NOW,
  );
}

function withFriends(state, names = ['Jason', 'Mei', 'Tom']) {
  names.forEach((name, i) => {
    state = L.reduce(state, { type: 'join', memberId: `mem000000${i + 2}`, name }, NOW);
  });
  return state;
}

const H = 'hang000001';
const [MANDY, JASON, MEI, TOM] = ['mem0000001', 'mem0000002', 'mem0000003', 'mem0000004'];
const THU_EVE = '2026-11-26_eve';
const FRI_LUNCH = '2026-11-27_lunch';
const SAT_EVE = '2026-11-28_eve';

function respond(state, memberId, on, free, now = NOW) {
  return L.reduce(state, { type: 'respond', hangId: H, memberId, on, free }, now);
}

// Mandy, Jason and Mei are in and free Thursday evening; Tom says no. Confirms on its own.
function confirmedThursday(extraFree = []) {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE, ...extraFree]);
  state = respond(state, JASON, true, [THU_EVE, ...extraFree]);
  state = respond(state, MEI, true, [THU_EVE, ...extraFree]);
  return respond(state, TOM, false, []);
}

test('dates use Hong Kong time whatever the machine timezone', () => {
  assert.equal(L.hkDate(Date.parse('2026-11-25T17:00:00Z')), '2026-11-26');
  assert.equal(L.hkDate(Date.parse('2026-11-25T15:59:00Z')), '2026-11-25');
  assert.equal(L.slotTime(THU_EVE), Date.parse('2026-11-26T19:00:00+08:00'));
  assert.equal(L.slotLabel(THU_EVE), 'Thu 26 Nov, evening (7–10pm)');
  assert.equal(L.momentLabel(Date.parse('2026-11-27T02:00:00Z')), 'Fri 27 Nov, 10am');
  assert.equal(L.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(L.parseSlot('2026-11-26_brunch'), null);
  assert.equal(L.parseSlot('nonsense'), null);
});

test('a new plan covers 7 days, starting tomorrow if today is over', () => {
  const morning = crew();
  const slots = L.hangSlots(morning.hangs[H]);
  assert.equal(slots.length, 21);
  assert.equal(slots[0], '2026-11-25_lunch');
  const lateNight = L.createCrewState(
    { crewId: 'crew000002', hangId: H, memberId: MANDY, crewName: 'g', creatorName: 'M', idea: 'x' },
    Date.parse('2026-11-25T13:30:00Z'), // 21:30 in Hong Kong
  );
  assert.equal(lateNight.hangs[H].startDate, '2026-11-26');
});

test('inputs are cleaned and clamped', () => {
  const state = crew({ crewName: '  O-camp\n\ngang  ', seats: 99, size: 1 });
  assert.equal(state.crew.name, 'O-camp gang');
  assert.equal(state.hangs[H].seats, L.LIMITS.seatsMax);
  assert.equal(state.crew.size, L.LIMITS.sizeMin);
  assert.equal(crew({ budget: 'free money' }).hangs[H].budget, '', 'unknown budgets are dropped');
  assert.throws(() => crew({ creatorName: '   ' }), { code: 'invalid' });
  assert.equal(L.cleanText('Man​dy‮', 24), 'Mandy', 'invisible and direction characters are removed');
});

test('only people who are in count toward a time', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, false, [THU_EVE]); // free but not in: doesn't count
  const s = L.summarize(state, H, NOW);
  assert.equal(s.slots.find((x) => x.id === THU_EVE).count, 1);
  assert.equal(s.onBoardIds.length, 1);
  assert.equal(s.ready, false);
});

test('times outside the plan, and times that have closed, are dropped', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE, '2030-01-01_eve', 'bad']);
  assert.deepEqual(state.members[MANDY].r[H].free, [THU_EVE]);
  const at11 = NOW + HOUR; // today's lunch (12:30) is now less than 2 hours away
  state = respond(state, MANDY, true, [THU_EVE, '2026-11-25_lunch'], at11);
  assert.deepEqual(state.members[MANDY].r[H].free, [THU_EVE]);
});

test('a time you already picked stays when it closes', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, ['2026-11-25_lunch', THU_EVE]);
  state = respond(state, MANDY, true, ['2026-11-25_lunch', THU_EVE, SAT_EVE], NOW + HOUR);
  assert.deepEqual(state.members[MANDY].r[H].free, ['2026-11-25_lunch', THU_EVE, SAT_EVE]);
});

test('a plan becomes ready, and confirms itself once everyone has answered', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE, FRI_LUNCH]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, MEI, true, [THU_EVE]);
  let s = L.summarize(state, H, NOW);
  assert.equal(s.status, 'ready');
  assert.equal(s.best.id, THU_EVE);
  assert.equal(state.hangs[H].lock, null, 'Tom has not answered, so it waits');
  state = respond(state, TOM, false, []);
  s = L.summarize(state, H, NOW);
  assert.equal(s.status, 'locked');
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
  assert.equal(state.hangs[H].note.type, 'auto');
});

test('after 48 hours, a ready plan confirms without waiting for everyone', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [SAT_EVE]);
  state = respond(state, JASON, true, [SAT_EVE]);
  state = respond(state, MEI, true, [SAT_EVE]);
  assert.equal(state.hangs[H].lock, null);
  const later = state.hangs[H].decideBy + 1;
  L.settle(state, later);
  assert.equal(state.hangs[H].lock.slot, SAT_EVE);
  assert.equal(state.hangs[H].note.type, 'deadline');
});

test('anyone who is in can confirm a ready plan early', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  assert.throws(() => L.reduce(state, { type: 'lock', hangId: H, memberId: MANDY }, NOW), { code: 'not_ready' });
  state = respond(state, MEI, true, [THU_EVE]);
  assert.throws(() => L.reduce(state, { type: 'lock', hangId: H, memberId: TOM }, NOW), { code: 'not_on_board' });
  state = L.reduce(state, { type: 'lock', hangId: H, memberId: MEI }, NOW);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
});

test('ties go to the earliest time, and closed times never win', () => {
  let state = withFriends(crew({ seats: 2 }));
  state = respond(state, MANDY, true, [FRI_LUNCH, THU_EVE]);
  state = respond(state, JASON, true, [FRI_LUNCH, THU_EVE]);
  assert.equal(L.summarize(state, H, NOW).best.id, THU_EVE);
  const thuAfternoon = Date.parse('2026-11-26T09:30:00Z'); // 17:30, evening starts in 1.5 hours
  const s = L.summarize(state, H, thuAfternoon);
  assert.equal(s.slots.find((x) => x.id === THU_EVE).closed, true);
  assert.equal(s.best.id, FRI_LUNCH);
});

test('when someone changes their times, the plan moves instead of dying', () => {
  let state = confirmedThursday([FRI_LUNCH]);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
  state = respond(state, MEI, true, [FRI_LUNCH]); // Mei can't do Thursday anymore
  assert.equal(state.hangs[H].lock.slot, FRI_LUNCH);
  assert.equal(state.hangs[H].note.type, 'moved');
  assert.equal(state.hangs[H].note.from, THU_EVE);
});

test('if no time works anymore, the group goes back to choosing a time', () => {
  let state = confirmedThursday();
  state = respond(state, JASON, false, undefined);
  assert.equal(state.hangs[H].lock, null);
  assert.equal(state.hangs[H].note.type, 'unlocked');
});

test('a confirmed plan is not moved once it is less than 2 hours away', () => {
  let state = confirmedThursday();
  const soon = Date.parse('2026-11-26T10:00:00Z'); // 18:00, starts in 1 hour
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [] }, soon);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
});

test('before a plan is confirmed, nobody can tell who said what', () => {
  let state = withFriends(crew());
  state = respond(state, JASON, true, [THU_EVE]);
  const view = L.buildView(state, MANDY, NOW);
  const json = JSON.stringify(view);
  assert.ok(!json.includes('"r":'), 'no raw answers in the view');
  assert.ok(!json.includes('waitingNames'), 'no list of who has not answered');
  const hang = view.hangs[0];
  assert.equal(hang.onBoard, null, 'how many said yes is not shared before the plan is confirmed');
  assert.equal(hang.answered, 1);
  assert.equal(hang.showCounts, false, 'with only 1 person in, counts per time would give them away');
  assert.ok(hang.slots.every((s) => s.count === 0));
  assert.equal(hang.best, null);
  assert.ok(view.members.every((m) => Object.keys(m).sort().join() === 'canRemove,id,name'));

  state = respond(state, MEI, true, [THU_EVE]);
  // 2 others are in, but only 2 others have answered: a "no" from one of them would still give the other away.
  assert.equal(L.buildView(state, MANDY, NOW).hangs[0].showCounts, false);
  state = respond(state, TOM, false, []);
  const view2 = L.buildView(state, MANDY, NOW);
  assert.equal(view2.hangs[0].showCounts, true);
  assert.equal(view2.hangs[0].best.count, 2);
});

test('totals only show once 2 OTHER people are in and 3 others have answered', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  // Jason is one of the 2, so for him only Mandy is "other": he could work out her times.
  assert.equal(L.buildView(state, JASON, NOW).hangs[0].showCounts, false);
  // Tom sees 2 other people in, but only 2 others have answered.
  assert.equal(L.buildView(state, TOM, NOW).hangs[0].showCounts, false);
  state = respond(state, MEI, false, []);
  // Now 3 others have answered, so Tom can't tell which 2 are in.
  assert.equal(L.buildView(state, TOM, NOW).hangs[0].showCounts, true);
});

test('a suggested place chip can add a place without voting for it', () => {
  let state = withFriends(crew());
  state = L.reduce(state, { type: 'addPlace', hangId: H, memberId: MANDY, placeId: 'plc0000009', name: 'Hang Hau', vote: false }, NOW);
  const place = L.buildView(state, MANDY, NOW).hangs[0].places[0];
  assert.equal(place.name, 'Hang Hau');
  assert.equal(place.likes, 0);
  assert.equal(place.liked, false);
});

test('before 2 other people are in, a yes and a no look the same to everyone else', () => {
  const a = respond(respond(withFriends(crew()), MANDY, true, [THU_EVE]), MEI, false, []);
  const b = respond(respond(withFriends(crew()), MANDY, false, []), MEI, true, [THU_EVE]);
  const strip = (v) => JSON.stringify(v.hangs[0], (k, val) => (k === 'mine' ? undefined : val));
  assert.equal(strip(L.buildView(a, TOM, NOW)), strip(L.buildView(b, TOM, NOW)));
});

test('once confirmed, it shows only who is going', () => {
  const state = confirmedThursday();
  const view = L.buildView(state, TOM, NOW);
  assert.deepEqual(view.hangs[0].lock.people.sort(), ['Jason', 'Mandy', 'Mei']);
  assert.equal(view.hangs[0].lock.imGoing, false);
  assert.equal(L.buildView(state, MEI, NOW).hangs[0].lock.imGoing, true);
});

test('places: duplicates merge, adding one votes for it, votes sort the list', () => {
  let state = withFriends(crew());
  state = L.reduce(state, { type: 'addPlace', hangId: H, memberId: MANDY, placeId: 'plc0000001', name: 'Hang Hau' }, NOW);
  state = L.reduce(state, { type: 'addPlace', hangId: H, memberId: JASON, placeId: 'plc0000002', name: 'Mong Kok' }, NOW);
  state = L.reduce(state, { type: 'addPlace', hangId: H, memberId: MEI, placeId: 'plc0000003', name: 'mong kok' }, NOW);
  const s = L.summarize(state, H, NOW);
  assert.equal(s.places.length, 2);
  assert.equal(s.places[0].name, 'Mong Kok');
  assert.equal(s.places[0].likes, 2);
  state = L.reduce(state, { type: 'like', hangId: H, memberId: MEI, placeId: 'plc0000002', on: false }, NOW);
  assert.equal(L.summarize(state, H, NOW).places[0].likes, 1);
  assert.throws(
    () => L.reduce(state, { type: 'addPlace', hangId: H, memberId: TOM, placeId: 'plc0000001', name: 'Sai Kung' }, NOW),
    { code: 'invalid' },
    'a place id can only be used once',
  );
});

test('names must be unique in a group and groups have a size limit', () => {
  let state = crew();
  assert.throws(() => L.reduce(state, { type: 'join', memberId: 'mem0000009', name: 'mandy' }, NOW), { code: 'name_taken' });
  for (let i = 0; i < L.LIMITS.members - 1; i++) {
    state = L.reduce(state, { type: 'join', memberId: `memx${String(i).padStart(6, '0')}`, name: `friend ${i}` }, NOW);
  }
  assert.throws(() => L.reduce(state, { type: 'join', memberId: 'memy000001', name: 'one more' }, NOW), { code: 'full' });
});

test('leaving deletes your name and answers, and the group gets smaller', () => {
  let state = withFriends(crew({ size: 5 }));
  state = respond(state, JASON, true, [THU_EVE]);
  state = L.reduce(state, { type: 'leave', memberId: JASON }, NOW);
  assert.equal(state.members[JASON], undefined);
  assert.ok(!JSON.stringify(state).includes('"Jason"'));
  assert.equal(state.crew.size, 4);
});

test('only the group maker can remove someone, after 6 hours, whether or not they answered', () => {
  let state = withFriends(crew({ size: 5 }));
  state = respond(state, JASON, true, [THU_EVE]);
  // Straight after joining, nobody can be removed, and nobody else even sees the option.
  assert.ok(L.buildView(state, MANDY, NOW).members.every((m) => !m.canRemove));
  const later = NOW + L.REMOVE_AFTER_MS + HOUR;
  // Everyone who joined 6 hours ago can be removed, so neither the list nor a refusal shows who has answered.
  assert.deepEqual(L.buildView(state, MANDY, later).members.filter((m) => m.canRemove).map((m) => m.name).sort(), ['Jason', 'Mei', 'Tom']);
  assert.ok(L.buildView(state, JASON, later).members.every((m) => !m.canRemove), 'only the group maker sees it');
  // Every refusal has the same message, so it never tells you who has answered.
  const tries = [
    { memberId: MANDY, targetId: TOM, at: NOW },
    { memberId: JASON, targetId: TOM, at: later },
    { memberId: MANDY, targetId: MANDY, at: later },
  ];
  const messages = tries.map(({ memberId, targetId, at }) => {
    try {
      L.reduce(state, { type: 'remove', memberId, targetId }, at);
      return 'removed';
    } catch (e) {
      return `${e.code}: ${e.message}`;
    }
  });
  assert.equal(new Set(messages).size, 1);
  assert.match(messages[0], /^cant_remove/);
  state = L.reduce(state, { type: 'remove', memberId: MANDY, targetId: TOM }, later);
  assert.equal(state.members[TOM], undefined);
  assert.equal(state.crew.size, 4);
  assert.equal(state.crew.stats.removed, 1);
  // Jason answered, and he can be removed too. His answers go with him.
  state = L.reduce(state, { type: 'remove', memberId: MANDY, targetId: JASON }, later);
  assert.equal(state.members[JASON], undefined);
  assert.equal(L.summarize(state, H, later).answeredIds.length, 0);
});

test('usage counts: once per person per kind, and members never see them', () => {
  let state = withFriends(crew());
  state = L.reduce(state, { type: 'track', hangId: H, memberId: MANDY, what: 'share' }, NOW);
  state = L.reduce(state, { type: 'track', hangId: H, memberId: MANDY, what: 'share' }, NOW);
  state = L.reduce(state, { type: 'track', hangId: H, memberId: JASON, what: 'share' }, NOW);
  state = L.reduce(state, { type: 'track', hangId: H, memberId: MANDY, what: 'anything-else' }, NOW);
  assert.deepEqual(state.hangs[H].stats, { share: 2 });
  assert.ok(!JSON.stringify(L.buildView(state, MANDY, NOW)).includes('"stats"'));
});

test('the first answer time is kept, for measuring how fast people reply', () => {
  let state = withFriends(crew());
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE, FRI_LUNCH], NOW + HOUR);
  assert.equal(state.members[JASON].r[H].at, NOW);
  assert.equal(state.members[JASON].r[H].updatedAt, NOW + HOUR);
});

test('the deadline is a round hour, never at night, and settle says when something changed', () => {
  const state = crew();
  assert.equal(state.hangs[H].decideBy % HOUR, 0);
  assert.ok(state.hangs[H].decideBy >= NOW + L.DECIDE_AFTER_MS);
  const lateNight = Date.parse('2026-11-25T16:30:00Z'); // 00:30 in Hong Kong
  assert.equal(L.momentLabel(L.decideByFor(lateNight)), 'Sat 28 Nov, 9am');
  const ready = confirmedThursday();
  assert.equal(L.settleChanged(ready, NOW), false, 'nothing new to do');
});

test('a confirmed plan that nobody was going to in the end counts as not met', () => {
  let state = confirmedThursday();
  const soon = Date.parse('2026-11-26T10:00:00Z'); // too late to move
  for (const id of [MANDY, JASON, MEI]) state = L.reduce(state, { type: 'respond', hangId: H, memberId: id, on: false }, soon);
  assert.equal(L.summarize(state, H, L.slotTime(THU_EVE, 'end') + HOUR).status, 'fizzled');
});

test('group size can be changed, but not below the number of people in it', () => {
  let state = withFriends(crew({ size: 8 }));
  // Too low is refused with a message, not quietly changed.
  assert.throws(() => L.reduce(state, { type: 'setSize', memberId: MANDY, size: 2 }, NOW), { code: 'invalid', message: /already has 4 members/ });
  state = L.reduce(state, { type: 'setSize', memberId: MANDY, size: 4 }, NOW);
  assert.equal(state.crew.size, 4);
  state = L.reduce(state, { type: 'setSize', memberId: MANDY, size: 6 }, NOW);
  assert.equal(state.crew.size, 6);
});

test('did you meet: only after the plan ends, and only from people who went', () => {
  let state = confirmedThursday();
  const during = L.slotTime(THU_EVE, 'start') + HOUR;
  assert.throws(() => L.reduce(state, { type: 'outcome', hangId: H, memberId: MANDY, met: false }, during), { code: 'too_early' });
  const after = L.slotTime(THU_EVE, 'end') + HOUR;
  assert.equal(L.summarize(state, H, after).status, 'check');
  assert.throws(() => L.reduce(state, { type: 'outcome', hangId: H, memberId: TOM, met: false }, after), { code: 'not_going' });
  state = L.reduce(state, { type: 'outcome', hangId: H, memberId: MANDY, met: true }, after);
  assert.equal(L.summarize(state, H, after).status, 'happened');
  assert.equal(L.buildView(state, TOM, after).hangs[0].onBoard, 3, 'after confirming, the number who said yes is shared');
  const hours = L.crewHours(state);
  assert.equal(hours.hours, 3);
  assert.equal(hours.times, 1);
});

test('a plan nobody could agree on runs out of days', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  const nextWeek = Date.parse('2026-12-02T15:00:00Z');
  assert.equal(L.summarize(state, H, nextWeek).status, 'expired');
});

test('ids that look like built-in object keys are rejected', () => {
  const state = crew();
  for (const bad of ['__proto__', 'constructor', 'hasOwnProperty', 'toString']) {
    assert.throws(() => L.reduce(state, { type: 'respond', hangId: bad, memberId: MANDY, on: true }, NOW), { code: 'not_found' });
    assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: bad, on: true }, NOW), { code: 'not_member' });
  }
  assert.equal({}.polluted, undefined);
});

test('unknown or malformed actions are rejected', () => {
  const state = crew();
  assert.throws(() => L.reduce(state, null, NOW), { code: 'invalid' });
  assert.throws(() => L.reduce(state, { type: 'explode', hangId: H, memberId: MANDY }, NOW), { code: 'invalid' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: 'nohang0001', memberId: MANDY, on: true }, NOW), { code: 'not_found' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, on: 'yes' }, NOW), { code: 'invalid' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, free: 'all' }, NOW), { code: 'invalid' });
});

test('messages and calendar files', () => {
  const state = confirmedThursday();
  const hang = L.buildView(state, MANDY, NOW).hangs[0];
  assert.match(L.shareMessage(hang, 'https://x.test/#p'), /confirmed once 3 of us can make the same time/);
  const locked = L.lockedMessage(hang, 'https://x.test/#p');
  assert.match(locked, /^The plan is confirmed: /);
  assert.match(locked, /Thu 26 Nov, evening \(7–10pm\)/);
  assert.match(locked, /Going: /);
  // After a move, the message says what changed.
  const moved = L.lockedMessage({ ...hang, note: { type: 'moved', from: hang.lock.slot, to: hang.lock.slot } }, 'https://x.test/#p');
  assert.match(moved, /^The plan has moved: /);
  assert.match(moved, /\nOld time: Thu 26 Nov, evening \(7–10pm\)\n/);
  const ics = L.icsText(hang, 'O-camp gang', 'uid1', NOW);
  assert.match(ics, /DTSTART:20261126T110000Z/);
  assert.match(ics, /DTEND:20261126T140000Z/);
  assert.ok(ics.includes('\r\n'));
  const url = new URL(L.calendarUrl(hang, 'O-camp gang'));
  assert.equal(url.hostname, 'calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20261126T110000Z/20261126T140000Z');
});

test('the reminder message never names anyone', () => {
  let state = withFriends(crew({ size: 5 }));
  state = respond(state, MANDY, true, [THU_EVE]);
  const hang = L.buildView(state, MANDY, NOW).hangs[0];
  const text = L.nudgeMessage(hang, 'https://x.test');
  assert.match(text, /^Minibus reminder: 4 people haven't answered yet/);
  for (const name of ['Jason', 'Mei', 'Tom']) assert.ok(!text.includes(name));
});

test('old saved data is upgraded', () => {
  const old = crew();
  old.v = 1;
  delete old.hangs[H].decideBy;
  old.crew.demo = true;
  old.crew.clockOffset = 5;
  const state = L.migrate(old);
  assert.equal(state.v, 3);
  assert.ok(state.crew.secret);
  assert.equal(state.crew.createdBy, MANDY);
  assert.equal(state.hangs[H].decideBy, state.hangs[H].createdAt + L.DECIDE_AFTER_MS);
  assert.equal(state.demo.clockOffset, 5);
  assert.equal(state.crew.clockOffset, undefined);
});

test('the demo group starts one person short of confirming', () => {
  const ids = {
    crewId: 'democrew01',
    hangId: 'demohang01',
    memberIds: ['demo000001', 'demo000002', 'demo000003', 'demo000004'],
    placeIds: ['demoplc001', 'demoplc002'],
  };
  const state = L.createDemoState(ids, NOW);
  const s = L.summarize(state, 'demohang01', NOW);
  assert.equal(s.onBoardIds.length, 2);
  assert.equal(s.best.count, 2);
  assert.equal(s.status, 'open');
  assert.equal(s.waiting, 2);
  assert.equal(state.crew.demo, true);
  assert.equal(state.demo.tomFree.length, 2);
});

test('a ready plan shows its best time, but not every other total', () => {
  let state = withFriends(crew({ seats: 2 }));
  state = respond(state, MANDY, true, [THU_EVE, FRI_LUNCH, SAT_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  const jason = L.buildView(state, JASON, NOW).hangs[0];
  assert.equal(jason.status, 'ready');
  assert.equal(jason.best.id, THU_EVE);
  assert.equal(jason.showCounts, false);
  assert.ok(jason.slots.every((s) => s.count === 0), "Jason can't read Mandy's other times");
});

test('when everyone has answered and no time works, the plan says so, and the number needed can go down', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [FRI_LUNCH]);
  state = respond(state, MEI, true, [SAT_EVE]);
  state = respond(state, TOM, false, []);
  assert.equal(L.buildView(state, MANDY, NOW).hangs[0].stuck, true);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [SAT_EVE, THU_EVE] }, NOW);
  state = L.reduce(state, { type: 'setSeats', hangId: H, memberId: MANDY, seats: 2 }, NOW);
  assert.equal(state.hangs[H].lock.slot, THU_EVE, 'with 2 needed and everyone answered, it confirms');
  assert.equal(state.hangs[H].firstLock.slot, THU_EVE);
});

test('an older save never overwrites a newer one', () => {
  let state = withFriends(crew());
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, on: true, free: [THU_EVE, FRI_LUNCH], seq: 200 }, NOW);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, free: [THU_EVE], seq: 100 }, NOW);
  assert.deepEqual(state.members[MANDY].r[H].free, [THU_EVE, FRI_LUNCH]);
});

test('check-in: a code that changes every minute, only for people going, during the plan', () => {
  let state = confirmedThursday();
  const before = L.slotTime(THU_EVE, 'start') - 2 * HOUR;
  assert.throws(() => L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, before), { code: 'checkin_closed' });
  const at = L.slotTime(THU_EVE, 'start') + 10 * 60 * 1000;
  const code = L.checkinCode(state, H, at, 0, MANDY); // Mandy's code
  assert.match(code, /^\d{4}$/);
  assert.notEqual(L.checkinCode(state, H, at + 60 * 1000, 0, MANDY), code, 'the code changes the next minute');
  assert.throws(() => L.reduce(state, { type: 'showCode', hangId: H, memberId: TOM }, at), { code: 'not_going' });
  state = L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, at);
  assert.equal(state.hangs[H].outcome, null, '1 check-in is not enough');
  const wrong = code === '0000' ? '1111' : '0000';
  assert.throws(() => L.reduce(state, { type: 'checkin', hangId: H, memberId: JASON, code: wrong }, at), { code: 'wrong_code' });
  // Last minute's code still works, for someone typing slowly.
  state = L.reduce(state, { type: 'checkin', hangId: H, memberId: JASON, code }, at + 60 * 1000);
  assert.deepEqual(state.hangs[H].outcome && state.hangs[H].outcome.checked, true);
  const view = L.buildView(state, MEI, at + 60 * 1000);
  assert.deepEqual(view.hangs[0].lock.checkedIn.sort(), ['Jason', 'Mandy']);
  assert.equal(view.hangs[0].status, 'happened');
  assert.ok(!JSON.stringify(view).includes(state.crew.secret), 'the secret never reaches anyone');
  assert.ok(!JSON.stringify(L.exportState(state)).includes(state.crew.secret), 'not even the export');
});

test('one person alone can never record "we met" by check-in', () => {
  let state = confirmedThursday();
  const lastHour = L.slotTime(THU_EVE, 'start') - HOUR; // too late to move the plan
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: JASON, on: false }, lastHour);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, on: false }, lastHour);
  const at = L.slotTime(THU_EVE, 'start') + 5 * 60 * 1000;
  state = L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, at);
  assert.equal(state.hangs[H].outcome, null);
});

test('Minibus never confirms or moves a plan on its own to a time less than 12 hours away', () => {
  const morning = Date.parse('2026-11-25T01:00:00Z'); // 09:00 in Hong Kong
  let state = withFriends(crew({ seats: 2 }));
  const todayEve = '2026-11-25_eve';
  state = respond(state, MANDY, true, [todayEve], morning);
  state = respond(state, JASON, true, [todayEve], morning);
  state = respond(state, MEI, false, [], morning);
  state = respond(state, TOM, false, [], morning);
  assert.equal(L.summarize(state, H, morning).status, 'ready');
  assert.equal(state.hangs[H].lock, null, 'everyone answered, but the time is only 10 hours away');
  state = L.reduce(state, { type: 'lock', hangId: H, memberId: MANDY }, morning);
  assert.equal(state.hangs[H].lock.slot, todayEve, 'a person can still confirm it');
});

test('dropping out when it is too late to move the plan tells the group', () => {
  let state = confirmedThursday();
  const lastHour = L.slotTime(THU_EVE, 'start') - HOUR;
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [] }, lastHour);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
  assert.deepEqual({ type: state.hangs[H].note.type, still: state.hangs[H].note.still }, { type: 'dropped', still: 2 });
  assert.equal(L.buildView(state, MANDY, lastHour).hangs[0].lock.tooLateToMove, true);
  assert.equal(L.buildView(state, MANDY, lastHour).hangs[0].note.who, undefined, 'the notice never says who dropped out');

  // Mei changes her mind: she can still add the confirmed time, and the notice goes away.
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, on: true, free: [THU_EVE] }, lastHour);
  assert.deepEqual(L.summarize(state, H, lastHour).lockPeople.sort(), [JASON, MANDY, MEI].sort());
  assert.equal(state.hangs[H].note.type, 'auto', 'the notice goes back to how the plan was confirmed');

  // Mei drops again and Tom joins late instead: the notice stays, with the new count.
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [] }, lastHour);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: TOM, on: true, free: [THU_EVE] }, lastHour);
  assert.equal(state.hangs[H].note.type, 'dropped');
  assert.equal(state.hangs[H].note.still, 3);

  // Two people drop out and one comes back: the notice stays until both are back.
  let two = confirmedThursday();
  two = L.reduce(two, { type: 'respond', hangId: H, memberId: JASON, free: [] }, lastHour);
  two = L.reduce(two, { type: 'respond', hangId: H, memberId: MEI, free: [] }, lastHour);
  two = L.reduce(two, { type: 'respond', hangId: H, memberId: MEI, on: true, free: [THU_EVE] }, lastHour);
  assert.equal(two.hangs[H].note.type, 'dropped', 'Jason is still out');
  assert.equal(two.hangs[H].note.still, 2);
  two = L.reduce(two, { type: 'respond', hangId: H, memberId: JASON, on: true, free: [THU_EVE] }, lastHour);
  assert.equal(two.hangs[H].note.type, 'auto');

  // Once the plan has ended, nobody can join it.
  const after = L.slotTime(THU_EVE, 'end') + HOUR;
  let done = state;
  try {
    done = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, on: true, free: [THU_EVE] }, after);
  } catch {
    /* refusing the answer is fine too */
  }
  assert.ok(!done.members[MEI].r[H].free.includes(THU_EVE));
});

test('someone who is not signed in sees no totals before the plan is confirmed', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, MEI, true, [FRI_LUNCH]);
  const anon = L.buildView(state, null, NOW).hangs[0];
  assert.equal(anon.showCounts, false);
  assert.equal(anon.best, null);
  assert.ok(anon.slots.every((s) => s.count === 0));
});

test('"Did you meet?": every answer is kept, and the result follows them', () => {
  let state = confirmedThursday();
  const after = L.slotTime(THU_EVE, 'end') + HOUR;
  state = L.reduce(state, { type: 'outcome', hangId: H, memberId: JASON, met: false }, after);
  assert.equal(L.summarize(state, H, after).status, 'fizzled');
  state = L.reduce(state, { type: 'outcome', hangId: H, memberId: MANDY, met: true }, after);
  state = L.reduce(state, { type: 'outcome', hangId: H, memberId: MEI, met: true }, after);
  const view = L.buildView(state, TOM, after).hangs[0];
  assert.equal(view.status, 'happened');
  assert.deepEqual([view.outcome.yes, view.outcome.no], [2, 1]);
  assert.equal(state.members[JASON].r[H].met, false, 'the "no" is kept, not overwritten');
});

test('the notice from before someone dropped out comes back when they rejoin', () => {
  let state = confirmedThursday();
  state.hangs[H].note = { type: 'moved', from: FRI_LUNCH, to: THU_EVE, at: NOW };
  const lastHour = L.slotTime(THU_EVE, 'start') - HOUR;
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [] }, lastHour);
  assert.equal(state.hangs[H].note.type, 'dropped');
  assert.equal(L.buildView(state, MANDY, lastHour).hangs[0].note.out, undefined, 'the view never lists who dropped out');
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, on: true, free: [THU_EVE] }, lastHour);
  assert.equal(state.hangs[H].note.type, 'moved');
});

test('someone who joins after the start can check in, but without a check-in cannot answer "Did you meet?"', () => {
  let state = confirmedThursday();
  const started = L.slotTime(THU_EVE, 'start') + 10 * 60 * 1000;
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: TOM, on: true, free: [THU_EVE] }, started);
  assert.ok(L.summarize(state, H, started).lockPeople.includes(TOM), 'Tom can still join');
  const after = L.slotTime(THU_EVE, 'end') + HOUR;
  assert.equal(L.buildView(state, TOM, after).hangs[0].lock.canSayMet, false);
  assert.equal(L.buildView(state, MEI, after).hangs[0].lock.canSayMet, true);
  state = L.reduce(state, { type: 'outcome', hangId: H, memberId: MANDY, met: false }, after);
  assert.throws(() => L.reduce(state, { type: 'outcome', hangId: H, memberId: TOM, met: true }, after), { code: 'not_going' });
  assert.equal(state.hangs[H].outcome.met, false);
});

test('"No, I can\'t" make the confirmed time keeps you in, so your other times can still move the plan', () => {
  let state = withFriends(crew());
  for (const id of [MANDY, JASON, MEI, TOM]) state = respond(state, id, true, [THU_EVE, SAT_EVE]);
  if (!state.hangs[H].lock) state = L.reduce(state, { type: 'lock', hangId: H, memberId: MANDY }, NOW);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);

  // Jason can't make Thursday. 3 others still can, so the plan stays.
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: JASON, decline: true }, NOW);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
  const jason = L.buildView(state, JASON, NOW).hangs[0];
  assert.equal(jason.mine.on, true, 'still in');
  assert.equal(jason.mine.declined, true);
  assert.deepEqual(jason.mine.free, [SAT_EVE], 'his other times stay');

  // Tom drops Thursday too. Saturday has 3 people, counting Jason, so the plan moves there.
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: TOM, free: [SAT_EVE] }, NOW);
  assert.equal(state.hangs[H].lock.slot, SAT_EVE);
  const after = L.buildView(state, JASON, NOW).hangs[0];
  assert.equal(after.lock.imGoing, true);
  assert.equal(after.mine.declined, false, 'a new time asks again');
});

test('taking the confirmed time out of your times counts as "can\'t make it", and adding it back undoes it', () => {
  // 4 people can make Thursday, so the plan stays there when Mei takes it out of her times.
  let state = withFriends(crew());
  for (const id of [MANDY, JASON, MEI, TOM]) state = respond(state, id, true, [THU_EVE]);
  if (!state.hangs[H].lock) state = L.reduce(state, { type: 'lock', hangId: H, memberId: MANDY }, NOW);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [SAT_EVE] }, NOW);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
  const mei = L.buildView(state, MEI, NOW).hangs[0];
  assert.equal(mei.mine.declined, true);
  assert.equal(mei.mine.on, true);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [SAT_EVE, THU_EVE] }, NOW);
  assert.equal(L.buildView(state, MEI, NOW).hangs[0].mine.declined, false);
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, decline: 'yes' }, NOW), { code: 'invalid' });
});

test('the number of people needed is locked once others have answered, except to go down when no time works', () => {
  let state = withFriends(crew({ size: 4 }));
  state = L.reduce(state, { type: 'setSeats', hangId: H, memberId: MANDY, seats: 2 }, NOW);
  assert.equal(state.hangs[H].seats, 2, 'nobody else has answered yet');
  state = respond(state, JASON, true, [THU_EVE]);
  assert.throws(() => L.reduce(state, { type: 'setSeats', hangId: H, memberId: MANDY, seats: 3 }, NOW), { code: 'closed' });
  assert.throws(() => L.reduce(state, { type: 'setSeats', hangId: H, memberId: MEI, seats: 2 }, NOW), { code: 'closed' });
  // Odd input is refused like any other change, not a crash.
  assert.throws(() => L.reduce(state, { type: 'setSeats', hangId: H, memberId: MANDY, seats: { toString: 'x' } }, NOW), { code: 'closed' });
});

test('check-in needs a second person: typing a code counts only if someone else showed it', () => {
  let state = confirmedThursday();
  const at = L.slotTime(THU_EVE, 'start') - 10 * 60 * 1000;
  // Mandy shows the code: she isn't checked in yet.
  state = L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, at);
  assert.deepEqual(L.summarize(state, H, at).checkedIn, []);
  // Jason shows his own code and types it: refused.
  const t2 = at + 3 * 60 * 1000;
  let jason = L.reduce(state, { type: 'showCode', hangId: H, memberId: JASON }, t2);
  assert.throws(() => L.reduce(jason, { type: 'checkin', hangId: H, memberId: JASON, code: L.checkinCode(jason, H, t2, 0, JASON) }, t2), { code: 'no_shower' });
  // Mei and Jason both show their codes from different places, and Jason types his own: still refused,
  // because each code belongs to the person who showed it.
  jason = L.reduce(jason, { type: 'showCode', hangId: H, memberId: MEI }, t2);
  assert.throws(() => L.reduce(jason, { type: 'checkin', hangId: H, memberId: JASON, code: L.checkinCode(jason, H, t2, 0, JASON) }, t2), { code: 'no_shower' });
  // Mandy's code from 3 minutes ago is too old.
  assert.throws(() => L.reduce(jason, { type: 'checkin', hangId: H, memberId: JASON, code: L.checkinCode(jason, H, at, 0, MANDY) }, t2), { code: 'wrong_code' });
  // Mei types the code Mandy just showed: both are checked in, and the plan counts as met.
  state = L.reduce(state, { type: 'checkin', hangId: H, memberId: MEI, code: L.checkinCode(state, H, at, 0, MANDY) }, at + 30 * 1000);
  assert.deepEqual(L.summarize(state, H, at + 30 * 1000).checkedIn.sort(), [MANDY, MEI].sort());
  assert.equal(state.hangs[H].outcome.met, true);
  assert.throws(() => L.reduce(confirmedThursday(), { type: 'checkin', hangId: H, memberId: MEI, code: { toString: 'x' } }, at), { code: 'wrong_code' });
});

test('when no time works, the number needed can go down, but not up or to the same number', () => {
  let state = withFriends(crew({ size: 4, seats: 3 }));
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [SAT_EVE]);
  state = respond(state, MEI, true, [FRI_LUNCH]);
  state = respond(state, TOM, false, []);
  assert.equal(L.summarize(state, H, NOW).stuck, true);
  assert.equal(L.buildView(state, null, NOW).hangs[0].stuck, false, 'signed-out viewers can\'t tell stuck from ready');
  assert.throws(() => L.reduce(state, { type: 'setSeats', hangId: H, memberId: MEI, seats: 3 }, NOW), { code: 'invalid' });
  assert.throws(() => L.reduce(state, { type: 'setSeats', hangId: H, memberId: MEI, seats: 4 }, NOW), { code: 'invalid' });
  state = L.reduce(state, { type: 'setSeats', hangId: H, memberId: MEI, seats: 2 }, NOW);
  assert.equal(state.hangs[H].seats, 2);
});

test('a save numbered from a clock far in the future cannot block later saves', () => {
  let state = withFriends(crew());
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, on: true, free: [THU_EVE], seq: (NOW + 24 * HOUR) * 1000 }, NOW);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [SAT_EVE], seq: NOW * 1000 }, NOW);
  assert.deepEqual(state.members[MEI].r[H].free, [SAT_EVE]);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [THU_EVE], seq: 1e308 }, NOW);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [FRI_LUNCH], seq: NOW * 1000 + 5 }, NOW);
  assert.deepEqual(state.members[MEI].r[H].free, [FRI_LUNCH]);
});

test('people who are not signed in see no names and cannot tell if a plan is ready', () => {
  let state = withFriends(crew({ seats: 2 }));
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  const outside = L.buildView(state, null, NOW).hangs[0];
  assert.equal(outside.createdBy, '');
  assert.equal(outside.ready, false);
  assert.notEqual(outside.status, 'ready');
});

test('after 48 hours with no time that works, the number needed can go down even if someone never answered', () => {
  let state = withFriends(crew({ size: 4, seats: 3 }));
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [SAT_EVE]);
  state = respond(state, MEI, true, [SAT_EVE]);
  // Tom never answers.
  const later = state.hangs[H].decideBy + HOUR;
  assert.equal(L.summarize(state, H, NOW).stuck, false, 'before the deadline, wait for Tom');
  assert.equal(L.summarize(state, H, later).stuck, true);
  state = L.reduce(state, { type: 'setSeats', hangId: H, memberId: MEI, seats: 2 }, later);
  assert.equal(state.hangs[H].lock && state.hangs[H].lock.slot, SAT_EVE, 'Saturday has 2 people, so it can be confirmed');
  // The data for the user test shows the number was lowered, and from what.
  assert.equal(state.hangs[H].seatsAtStart, 3);
  assert.equal(state.hangs[H].stats.lowered, 1);
});

test('at the deadline, Minibus never confirms a different time from the one it has been showing', () => {
  let state = withFriends(crew({ size: 5, seats: 2 }));
  const thuNoon = '2026-11-26_lunch';
  state = respond(state, MANDY, true, [thuNoon, SAT_EVE]);
  state = respond(state, JASON, true, [thuNoon, SAT_EVE]);
  state = respond(state, MEI, true, [thuNoon]);
  // 3 people can make Thursday lunch, so it's the best time. At the deadline it's too soon to confirm on its own.
  const atDeadline = L.slotTime(thuNoon) - 6 * HOUR;
  state.hangs[H].decideBy = atDeadline - 1;
  const settled = L.settle(JSON.parse(JSON.stringify(state)), atDeadline);
  assert.equal(settled.hangs[H].lock, null, 'Saturday has enough people, but the best time shown is Thursday');
  assert.equal(L.summarize(settled, H, atDeadline).status, 'ready');
  // Control: once Thursday lunch has passed, Saturday is the best time and Minibus confirms it.
  const later = L.slotTime(thuNoon, 'end') + HOUR;
  const after = L.settle(JSON.parse(JSON.stringify(state)), later);
  assert.equal(after.hangs[H].lock && after.hangs[H].lock.slot, SAT_EVE);
});

test('after 2 people check in, others who are going can still check in until the plan ends', () => {
  let state = confirmedThursday();
  const at = L.slotTime(THU_EVE, 'start') - 10 * 60 * 1000;
  state = L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, at);
  state = L.reduce(state, { type: 'checkin', hangId: H, memberId: MEI, code: L.checkinCode(state, H, at, 0, MANDY) }, at);
  assert.equal(state.hangs[H].outcome.met, true);
  state = L.reduce(state, { type: 'checkin', hangId: H, memberId: JASON, code: L.checkinCode(state, H, at, 0, MANDY) }, at + 60 * 1000);
  assert.deepEqual(L.summarize(state, H, at + 60 * 1000).checkedIn.sort(), [JASON, MANDY, MEI].sort());
  assert.equal(L.buildView(state, TOM, at).hangs[0].lock.imGoing, false);
});

test('a group of 3 never sees totals before the plan is confirmed, because they would show who said yes', () => {
  let state = withFriends(crew({ size: 3, seats: 3 }), ['Jason', 'Mei']);
  state = respond(state, JASON, true, [SAT_EVE]);
  state = respond(state, MEI, true, [THU_EVE]);
  assert.equal(L.buildView(state, MANDY, NOW).hangs[0].showCounts, false);
  // Lowering the group size can't switch totals on either.
  let five = withFriends(crew({ size: 5, seats: 3 }), ['Jason', 'Mei']);
  five = respond(five, JASON, true, [SAT_EVE]);
  five = respond(five, MEI, true, [THU_EVE]);
  five = L.reduce(five, { type: 'setSize', memberId: MANDY, size: 3 }, NOW);
  assert.equal(L.buildView(five, MANDY, NOW).hangs[0].showCounts, false);
});

test('after checking in, your answer cannot change for the rest of the plan', () => {
  let state = confirmedThursday();
  const at = L.slotTime(THU_EVE, 'start') + 5 * 60 * 1000;
  state = L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, at);
  state = L.reduce(state, { type: 'checkin', hangId: H, memberId: MEI, code: L.checkinCode(state, H, at, 0, MANDY) }, at);
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, on: false }, at + 60 * 1000), { code: 'closed' });
});

test('the third person to join a group of 5 does not see totals from the first 2 answers', () => {
  let state = crew({ size: 5 });
  state = L.reduce(state, { type: 'join', memberId: JASON, name: 'Jason' }, NOW);
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = L.reduce(state, { type: 'join', memberId: TOM, name: 'Tom' }, NOW);
  const tom = L.buildView(state, TOM, NOW).hangs[0];
  assert.equal(tom.showCounts, false);
  assert.ok(tom.slots.every((s) => s.count === 0));
});

test('only people who are in can lower the number needed', () => {
  let state = withFriends(crew({ size: 4, seats: 4 }));
  state = respond(state, MANDY, true, [SAT_EVE]);
  state = respond(state, JASON, true, [SAT_EVE]);
  state = respond(state, MEI, false, []);
  const later = state.hangs[H].decideBy + HOUR;
  assert.equal(L.summarize(state, H, later).stuck, true);
  assert.throws(() => L.reduce(state, { type: 'setSeats', hangId: H, memberId: MEI, seats: 2 }, later), { code: 'closed' });
  assert.throws(() => L.reduce(state, { type: 'setSeats', hangId: H, memberId: TOM, seats: 2 }, later), { code: 'closed' });
  assert.equal(L.reduce(state, { type: 'setSeats', hangId: H, memberId: JASON, seats: 2 }, later).hangs[H].lock.slot, SAT_EVE);
});

test('after 2 check-ins, someone can still join and check in before the plan ends', () => {
  let state = confirmedThursday();
  const at = L.slotTime(THU_EVE, 'start') + 5 * 60 * 1000;
  state = L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, at);
  state = L.reduce(state, { type: 'checkin', hangId: H, memberId: MEI, code: L.checkinCode(state, H, at, 0, MANDY) }, at);
  assert.equal(state.hangs[H].outcome.met, true);
  // Tom said no earlier, but he turns up after all.
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: TOM, on: true, free: [THU_EVE] }, at + 20 * 60 * 1000);
  state = L.reduce(state, { type: 'showCode', hangId: H, memberId: MANDY }, at + 21 * 60 * 1000);
  state = L.reduce(state, { type: 'checkin', hangId: H, memberId: TOM, code: L.checkinCode(state, H, at + 21 * 60 * 1000, 0, MANDY) }, at + 21 * 60 * 1000);
  assert.ok(L.summarize(state, H, at + 21 * 60 * 1000).checkedIn.includes(TOM));
  // After the plan ends, answers are closed again.
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: TOM, on: false }, L.slotTime(THU_EVE, 'end') + 1), { code: 'closed' });
});

// ---------- Minibus 2030: private limits and suggestions ----------

function suggestPlan(seats = 3) {
  let state = withFriends(crew({ idea: '', seats, budget: '' }));
  assert.equal(state.hangs[H].suggest, true, 'an empty idea means Minibus suggests');
  return state;
}

test('suggestions leave out meals that someone who is in cannot eat, and things over budget', () => {
  let state = suggestPlan();
  for (const id of [MANDY, JASON, MEI]) state = respond(state, id, true, [THU_EVE]);
  state = L.reduce(state, { type: 'setLimits', memberId: JASON, diet: ['vegetarian', 'no-spicy'], spend: 100 }, NOW);
  // Ask for many suggestions' worth of moods, so meals rank high.
  for (const id of [MANDY, JASON, MEI]) state = L.reduce(state, { type: 'respond', hangId: H, memberId: id, mood: 'hungry' }, NOW);
  const ideas = L.suggestions(state, H);
  assert.equal(ideas.length, 3);
  for (const a of ideas) {
    assert.ok(a.price <= 100, `${a.name} is over the budget`);
    if (a.food === 'main') assert.ok(!a.fails.includes('vegetarian') && !a.fails.includes('no-spicy'), `${a.name} doesn't suit Jason`);
  }
  assert.ok(ideas.some((a) => a.food === 'main'), 'hungry people get a meal option');
  assert.ok(ideas.some((a) => a.food !== 'main'), 'and something that is not a meal');
});

test('someone who is not in does not change the suggestions', () => {
  let state = suggestPlan();
  for (const id of [MANDY, JASON]) state = respond(state, id, true, [THU_EVE]);
  const before = L.suggestions(state, H).map((a) => a.id);
  state = L.reduce(state, { type: 'setLimits', memberId: TOM, diet: ['vegetarian'], spend: 50 }, NOW);
  state = respond(state, TOM, false, []);
  assert.deepEqual(L.suggestions(state, H).map((a) => a.id), before);
});

test('nobody else can see your limits or your mood', () => {
  let state = suggestPlan();
  state = respond(state, MEI, true, [THU_EVE]);
  state = L.reduce(state, { type: 'setLimits', memberId: MEI, diet: ['allergy'], spend: 50 }, NOW);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, mood: 'not-hungry' }, NOW);
  const json = JSON.stringify(L.buildView(state, MANDY, NOW));
  assert.ok(!json.includes('allergy') && !json.includes('not-hungry'));
  const mine = L.buildView(state, MEI, NOW);
  assert.deepEqual(mine.myLimits, { diet: ['allergy'], spend: 50 });
  assert.equal(mine.hangs[0].mine.mood, 'not-hungry');
  assert.equal(L.buildView(state, null, NOW).hangs[0].suggestions.length, 0, 'people who have not joined see no suggestions');
});

test('when the plan is confirmed, the suggestion most people would go to becomes the plan', () => {
  let state = suggestPlan(3);
  for (const id of [MANDY, JASON, MEI]) state = respond(state, id, true, [SAT_EVE]);
  const ideas = L.suggestions(state, H);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, picks: [ideas[2].id] }, NOW);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: JASON, picks: [ideas[2].id, ideas[0].id] }, NOW);
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, anyOk: true }, NOW);
  const view = L.buildView(state, MANDY, NOW).hangs[0];
  assert.equal(view.suggestions.find((a) => a.id === ideas[2].id).count, 3);
  state = L.reduce(state, { type: 'lock', hangId: H, memberId: MANDY }, NOW);
  assert.equal(state.hangs[H].chosen, ideas[2].id);
  const after = L.buildView(state, MANDY, NOW).hangs[0];
  assert.equal(after.idea, ideas[2].name);
  assert.equal(after.suggest, false);
  assert.match(L.lockedMessage(after, 'https://x.test/#p'), new RegExp(`The plan is confirmed: ${ideas[2].name}`));
});

test('a plan with an idea never changes its idea, and bad limits are refused', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [SAT_EVE]);
  assert.equal(state.hangs[H].suggest, false);
  assert.equal(L.buildView(state, MANDY, NOW).hangs[0].suggestions.length, 0);
  assert.throws(() => L.reduce(state, { type: 'setLimits', memberId: MANDY, diet: [], spend: 75 }, NOW), { code: 'invalid' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, mood: 'angry' }, NOW), { code: 'invalid' });
  const odd = L.reduce(state, { type: 'setLimits', memberId: MANDY, diet: ['vegetarian', 'nonsense', 'vegetarian'] }, NOW);
  assert.deepEqual(odd.members[MANDY].limits, { diet: ['vegetarian'], spend: null });
});

test('the share message for a plan without an idea explains the private limits', () => {
  const state = suggestPlan();
  const hang = L.buildView(state, MANDY, NOW).hangs[0];
  const msg = L.shareMessage(hang, 'https://x.test/#p');
  assert.match(msg, /tell Minibus privately what works for you/);
  assert.match(L.nudgeMessage({ ...hang, waiting: 2 }, 'https://x.test/#p'), /for our plan/);
});
