import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMinibusServer } from '../server.js';
import { hangSlots } from '../js/logic.js';

let dir;
let instance;
let base;

async function start(dataFile) {
  const inst = await createMinibusServer({ dataFile });
  await new Promise((resolve) => inst.server.listen(0, '127.0.0.1', resolve));
  return { inst, base: `http://127.0.0.1:${inst.server.address().port}` };
}

async function call(method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'minibus-'));
  ({ inst: instance, base } = await start(path.join(dir, 'store.json')));
});

after(async () => {
  instance.server.closeAllConnections?.();
  await new Promise((resolve) => instance.server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

test('serves the app in server mode with security headers', async () => {
  const res = await call('GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.data, /<meta name="minibus-backend" content="server">/);
  assert.match(res.data, /^<!doctype html>/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await call('GET', '/js/logic.js')).status, 200);
});

test('does not serve anything outside the app files', async () => {
  for (const p of ['/server.js', '/js/../server.js', '/data/store.json', '/package.json', '/%2e%2e/server.js']) {
    assert.equal((await call('GET', p)).status, 404, p);
  }
});

test('full flow: create, join, answer, lock, calendar', async () => {
  const created = await call('POST', '/api/crews', {
    crewName: 'O-camp gang',
    size: 3,
    idea: 'hotpot',
    seats: 2,
    budget: '$100–200',
    creatorName: 'Mandy',
  });
  assert.equal(created.status, 201);
  const { crewId, hangId, memberId, key } = created.data;
  assert.ok(key.length > 20);

  const joined = await call('POST', `/api/crews/${crewId}/join`, { name: 'Jason' });
  assert.equal(joined.status, 201);
  const jason = joined.data;

  const slot = hangSlots({ startDate: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) })[5];

  const ics404 = await call('GET', `/api/crews/${crewId}/hangs/${hangId}/calendar.ics`);
  assert.equal(ics404.status, 404);

  let r = await call('POST', `/api/crews/${crewId}/actions`, { memberId, key, action: { type: 'respond', hangId, on: true, free: [slot] } });
  assert.equal(r.status, 200);

  // Jason's view: counts, not names, before it locks.
  let view = await call('GET', `/api/crews/${crewId}?member=${jason.memberId}&key=${jason.key}`);
  assert.equal(view.data.me.name, 'Jason');
  assert.equal(view.data.hangs[0].onBoard, 1);
  assert.ok(!JSON.stringify(view.data).includes('"r":'));

  r = await call('POST', `/api/crews/${crewId}/actions`, { memberId: jason.memberId, key: jason.key, action: { type: 'respond', hangId, on: true, free: [slot] } });
  assert.equal(r.status, 200);
  r = await call('POST', `/api/crews/${crewId}/actions`, { memberId: jason.memberId, key: jason.key, action: { type: 'lock', hangId } });
  assert.equal(r.status, 200);

  view = await call('GET', `/api/crews/${crewId}`);
  assert.equal(view.data.me, null);
  assert.equal(view.data.hangs[0].status, 'locked');
  assert.deepEqual(view.data.hangs[0].lock.people.sort(), ['Jason', 'Mandy']);

  const ics = await call('GET', `/api/crews/${crewId}/hangs/${hangId}/calendar.ics`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.data, /BEGIN:VEVENT/);
});

test('rejects wrong keys, unknown actions and bad bodies', async () => {
  const { data } = await call('POST', '/api/crews', { crewName: 'g', size: 2, idea: 'x', seats: 2, creatorName: 'A' });
  const { crewId, hangId, memberId, key } = data;
  let r = await call('POST', `/api/crews/${crewId}/actions`, { memberId, key: 'wrong', action: { type: 'respond', hangId, on: true } });
  assert.equal(r.status, 403);
  r = await call('POST', `/api/crews/${crewId}/actions`, { memberId, key, action: { type: 'join', name: 'sneaky' } });
  assert.equal(r.status, 400);
  r = await call('POST', `/api/crews/${crewId}/actions`, '{not json');
  assert.equal(r.status, 400);
  r = await call('POST', `/api/crews/${crewId}/join`, { name: 'x'.repeat(20000) });
  assert.equal(r.status, 413);
  r = await call('POST', `/api/crews/${crewId}/join`, { name: '' });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/crews', { crewName: '', creatorName: 'A', idea: 'x' });
  assert.equal(r.status, 400);
  r = await call('GET', '/api/crews/doesnotexist1');
  assert.equal(r.status, 404);
});

test('plans survive a restart', async () => {
  const { data } = await call('POST', '/api/crews', { crewName: 'keep me', size: 2, idea: 'x', seats: 2, creatorName: 'A' });
  await instance.flush();
  const second = await start(path.join(dir, 'store.json'));
  const res = await fetch(`${second.base}/api/crews/${data.crewId}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).crew.name, 'keep me');
  await new Promise((resolve) => second.inst.server.close(resolve));
});

test('live updates arrive over server-sent events', async () => {
  const { data } = await call('POST', '/api/crews', { crewName: 'live', size: 2, idea: 'x', seats: 2, creatorName: 'A' });
  const controller = new AbortController();
  const res = await fetch(`${base}/api/crews/${data.crewId}/events`, { signal: controller.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  await reader.read(); // retry line
  await call('POST', `/api/crews/${data.crewId}/join`, { name: 'B' });
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /event: change/);
  controller.abort();
});
