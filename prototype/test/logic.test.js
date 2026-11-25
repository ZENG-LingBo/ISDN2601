import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

// Wed 25 Nov 2026, 10:00 in Hong Kong.
const NOW = Date.parse('2026-11-25T02:00:00Z');
const HOUR = 60 * 60 * 1000;

function crew(extra = {}) {
  return L.createCrewState(
    {
      crewId: 'crew000001',
      hangId: 'hang000001',
      memberId: 'mem0000001',
      crewName: 'O-camp gang',
      size: 4,
      creatorName: 'Mandy',
      idea: 'dinner somewhere cheap',
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

function respond(state, memberId, on, free) {
  return L.reduce(state, { type: 'respond', hangId: H, memberId, on, free }, NOW);
}

test('dates use Hong Kong time whatever the machine timezone', () => {
  assert.equal(L.hkDate(Date.parse('2026-11-25T17:00:00Z')), '2026-11-26');
  assert.equal(L.hkDate(Date.parse('2026-11-25T15:59:00Z')), '2026-11-25');
  assert.equal(L.slotTime(THU_EVE), Date.parse('2026-11-26T19:00:00+08:00'));
  assert.equal(L.slotLabel(THU_EVE), 'Thu 26 Nov, evening');
  assert.equal(L.addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(L.parseSlot('2026-11-26_brunch'), null);
  assert.equal(L.parseSlot('nonsense'), null);
});

test('a new plan covers 7 days from today', () => {
  const state = crew();
  const slots = L.hangSlots(state.hangs[H]);
  assert.equal(slots.length, 21);
  assert.equal(slots[0], '2026-11-25_lunch');
  assert.equal(slots.at(-1), '2026-12-01_eve');
});

test('inputs are cleaned and clamped', () => {
  const state = crew({ crewName: '  O-camp\n\ngang  ', seats: 99, size: 1 });
  assert.equal(state.crew.name, 'O-camp gang');
  assert.equal(state.hangs[H].seats, L.LIMITS.seatsMax);
  assert.equal(state.crew.size, L.LIMITS.sizeMin);
  assert.throws(() => crew({ creatorName: '   ' }), { code: 'invalid' });
  assert.equal(crew({ budget: 'free money' }).hangs[H].budget, '', 'unknown budgets are dropped');
});

test('only people who said yes count toward a time', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, false, [THU_EVE]); // free but not keen: doesn't count
  const s = L.summarize(state, H, NOW);
  assert.equal(s.slots.find((x) => x.id === THU_EVE).count, 1);
  assert.equal(s.onBoardIds.length, 1);
  assert.equal(s.ready, false);
});

test('times outside the plan window are dropped', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE, '2030-01-01_eve', 'bad']);
  assert.deepEqual(state.members[MANDY].r[H].free, [THU_EVE]);
});

test('a plan becomes ready, and locks itself once everyone has answered', () => {
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

test('anyone who said yes can lock a ready plan early', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  assert.throws(() => L.reduce(state, { type: 'lock', hangId: H, memberId: MANDY }, NOW), { code: 'not_ready' });
  state = respond(state, MEI, true, [THU_EVE]);
  assert.throws(() => L.reduce(state, { type: 'lock', hangId: H, memberId: TOM }, NOW), { code: 'not_on_board' });
  state = L.reduce(state, { type: 'lock', hangId: H, memberId: MEI }, NOW);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
});

test('ties go to the earliest time', () => {
  let state = withFriends(crew({ seats: 2 }));
  state = respond(state, MANDY, true, [FRI_LUNCH, THU_EVE]);
  state = respond(state, JASON, true, [FRI_LUNCH, THU_EVE]);
  assert.equal(L.summarize(state, H, NOW).best.id, THU_EVE);
});

test('past times never win', () => {
  let state = withFriends(crew({ seats: 2 }));
  const todayLunch = '2026-11-25_lunch';
  state = respond(state, MANDY, true, [todayLunch, THU_EVE]);
  state = respond(state, JASON, true, [todayLunch, THU_EVE]);
  const later = NOW + 4 * HOUR; // 14:00 HKT, lunch has started
  const s = L.summarize(state, H, later);
  assert.equal(s.slots.find((x) => x.id === todayLunch).past, true);
  assert.equal(s.best.id, THU_EVE);
});

test('when someone swaps out, the plan moves instead of dying', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE, FRI_LUNCH]);
  state = respond(state, JASON, true, [THU_EVE, FRI_LUNCH]);
  state = respond(state, MEI, true, [THU_EVE, FRI_LUNCH]);
  state = respond(state, TOM, false, []);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);

  state = respond(state, MEI, true, [FRI_LUNCH]); // Mei can't do Thursday anymore
  assert.equal(state.hangs[H].lock.slot, FRI_LUNCH);
  assert.equal(state.hangs[H].note.type, 'moved');
  assert.equal(state.hangs[H].note.from, THU_EVE);
});

test('if no time works anymore, the plan goes back to picking a time', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, MEI, true, [THU_EVE]);
  state = respond(state, TOM, false, []);
  state = respond(state, JASON, false, undefined);
  assert.equal(state.hangs[H].lock, null);
  assert.equal(state.hangs[H].note.type, 'unlocked');
});

test('who said yes stays hidden until the plan locks', () => {
  let state = withFriends(crew());
  state = respond(state, JASON, true, [THU_EVE]);
  const view = L.buildView(state, MANDY, NOW);
  const json = JSON.stringify(view);
  assert.ok(!json.includes('"r":'), 'no raw responses in the view');
  assert.equal(view.hangs[0].onBoard, 1);
  assert.equal(view.hangs[0].lock, null);
  assert.deepEqual(view.hangs[0].mine.free, []);
  assert.ok(view.members.every((m) => Object.keys(m).sort().join() === 'id,name'));
});

test('names show once it locks: only the people going', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, MEI, true, [THU_EVE]);
  state = respond(state, TOM, false, []);
  const view = L.buildView(state, TOM, NOW);
  assert.deepEqual(view.hangs[0].lock.people.sort(), ['Jason', 'Mandy', 'Mei']);
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
});

test('names must be unique in a group and groups have a size limit', () => {
  let state = crew();
  assert.throws(() => L.reduce(state, { type: 'join', memberId: 'mem0000009', name: 'mandy' }, NOW), { code: 'name_taken' });
  for (let i = 0; i < L.LIMITS.members - 1; i++) {
    state = L.reduce(state, { type: 'join', memberId: `memx${String(i).padStart(6, '0')}`, name: `friend ${i}` }, NOW);
  }
  assert.throws(() => L.reduce(state, { type: 'join', memberId: 'memy000001', name: 'one more' }, NOW), { code: 'full' });
});

test('did it happen: only after it started, and it adds hours', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, MEI, true, [THU_EVE]);
  state = respond(state, TOM, false, []);
  assert.throws(() => L.reduce(state, { type: 'outcome', hangId: H, memberId: MANDY, met: true }, NOW), { code: 'too_early' });
  const after = L.slotTime(THU_EVE, 'end') + HOUR;
  assert.equal(L.summarize(state, H, after).status, 'check');
  state = L.reduce(state, { type: 'outcome', hangId: H, memberId: MANDY, met: true }, after);
  assert.equal(L.summarize(state, H, after).status, 'happened');
  const hours = L.crewHours(state);
  assert.equal(hours.hours, 3);
  assert.equal(hours.next.hours, 50);
});

test('a locked plan in the past is not moved', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, MEI, true, [THU_EVE]);
  state = respond(state, TOM, false, []);
  const after = L.slotTime(THU_EVE, 'end') + HOUR;
  state = L.reduce(state, { type: 'respond', hangId: H, memberId: MEI, free: [] }, after);
  assert.equal(state.hangs[H].lock.slot, THU_EVE);
});

test('messages and calendar files', () => {
  let state = withFriends(crew());
  state = respond(state, MANDY, true, [THU_EVE]);
  state = respond(state, JASON, true, [THU_EVE]);
  state = respond(state, MEI, true, [THU_EVE]);
  state = respond(state, TOM, false, []);
  const hang = L.buildView(state, MANDY, NOW).hangs[0];
  assert.match(L.shareMessage(hang, 'https://x.test/#p'), /3 of us hop on/);
  assert.match(L.lockedMessage(hang, 'https://x.test/#p'), /Thu 26 Nov, evening/);
  const ics = L.icsText(hang, 'O-camp gang', 'uid1', NOW);
  assert.match(ics, /DTSTART:20261126T110000Z/);
  assert.match(ics, /DTEND:20261126T140000Z/);
  assert.ok(ics.includes('\r\n'));
  const url = new URL(L.calendarUrl(hang, 'O-camp gang'));
  assert.equal(url.hostname, 'calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20261126T110000Z/20261126T140000Z');
});

test('nudge message names who has not answered', () => {
  let state = withFriends(crew({ size: 5 }));
  state = respond(state, MANDY, true, [THU_EVE]);
  const hang = L.buildView(state, MANDY, NOW).hangs[0];
  const text = L.nudgeMessage(hang, 'https://x.test');
  assert.match(text, /4 people still haven't answered \(Jason, Mei, Tom\)/);
});

test('the demo group starts one person short of leaving', () => {
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
});

test('unknown or malformed actions are rejected', () => {
  const state = crew();
  assert.throws(() => L.reduce(state, { type: 'explode', hangId: H, memberId: MANDY }, NOW), { code: 'invalid' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: 'nobody0001', on: true }, NOW), { code: 'not_member' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: 'nohang0001', memberId: MANDY, on: true }, NOW), { code: 'not_found' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, on: 'yes' }, NOW), { code: 'invalid' });
  assert.throws(() => L.reduce(state, { type: 'respond', hangId: H, memberId: MANDY, free: 'all' }, NOW), { code: 'invalid' });
});
