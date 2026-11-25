import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMinibusServer } from '../server.js';
import { hangSlots, startDateFor } from '../js/logic.js';

let dir;
let instance;
let base;
const quiet = { error() {}, log() {} };

async function start(dataFile, opts = {}) {
  const inst = await createMinibusServer({ dataFile, log: quiet, ...opts });
  await new Promise((resolve) => inst.server.listen(0, '127.0.0.1', resolve));
  return { inst, base: `http://127.0.0.1:${inst.server.address().port}` };
}

async function stop(inst) {
  inst.server.closeAllConnections?.();
  await new Promise((resolve) => inst.server.close(resolve));
}

async function call(method, p, body, who) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (who) {
    headers['x-minibus-member'] = who.memberId;
    headers['x-minibus-key'] = who.key;
  }
  const res = await fetch(base + p, {
    method,
    headers,
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

async function newCrew(extra = {}) {
  const r = await call('POST', '/api/crews', { crewName: 'g', size: 3, idea: 'x', seats: 2, creatorName: 'A', ...extra });
  assert.equal(r.status, 201);
  return r.data;
}

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'minibus-'));
  ({ inst: instance, base } = await start(path.join(dir, 'store.json'), {
    adminToken: 'admin-secret-for-tests-0123456789abcdef',
    trustProxy: true,
    notice: { operator: 'Mandy <Chan>', contact: 'mandy@example.com', deleteBy: '31 Dec 2026' },
  }));
});

after(async () => {
  await stop(instance);
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
  const head = await call('HEAD', '/');
  assert.equal(head.status, 200);
  assert.equal(head.data, '');
});

test('does not serve anything outside the app files', async () => {
  for (const p of ['/server.js', '/js/../server.js', '/data/store.json', '/package.json', '/%2e%2e/server.js', '/__proto__', '/constructor']) {
    assert.equal((await call('GET', p)).status, 404, p);
  }
});

test('full flow: create, join, answer, confirm, calendar', async () => {
  const mandy = await newCrew({ crewName: 'O-camp gang', idea: 'hotpot', budget: '$100–200', creatorName: 'Mandy' });
  const { crewId, hangId } = mandy;
  assert.match(mandy.key, /^[a-z0-9]{32}$/, 'keys are safe to put in a link');

  const joined = await call('POST', `/api/crews/${crewId}/join`, { name: 'Jason' });
  assert.equal(joined.status, 201);
  const jason = joined.data;

  const slot = hangSlots({ startDate: startDateFor(Date.now()) }).find((id) => Date.parse(id.replace('_eve', 'T19:00:00+08:00').replace('_aft', 'T15:00:00+08:00').replace('_lunch', 'T12:30:00+08:00')) > Date.now() + 3 * 3600e3);

  assert.equal((await call('GET', `/api/crews/${crewId}/hangs/${hangId}/calendar.ics`)).status, 404);

  let r = await call('POST', `/api/crews/${crewId}/actions`, { action: { type: 'respond', hangId, on: true, free: [slot] } }, mandy);
  assert.equal(r.status, 200);

  let view = await call('GET', `/api/crews/${crewId}`, undefined, jason);
  assert.equal(view.data.me.name, 'Jason');
  assert.equal(view.data.hangs[0].onBoard, null);
  assert.equal(view.data.hangs[0].answered, 1);
  assert.equal(view.data.hangs[0].showCounts, false);
  assert.ok(!JSON.stringify(view.data).includes('"r":'));

  r = await call('POST', `/api/crews/${crewId}/actions`, { action: { type: 'respond', hangId, on: true, free: [slot] } }, jason);
  assert.equal(r.status, 200);
  r = await call('POST', `/api/crews/${crewId}/actions`, { action: { type: 'lock', hangId } }, jason);
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

test('the member key must come in headers, not the address', async () => {
  const a = await newCrew();
  const view = await call('GET', `/api/crews/${a.crewId}?member=${a.memberId}&key=${a.key}`);
  assert.equal(view.data.me, null);
});

test('rejects wrong keys, unknown actions and bad bodies', async () => {
  const a = await newCrew();
  const { crewId, hangId } = a;
  const act = (action, who = a) => call('POST', `/api/crews/${crewId}/actions`, { action }, who);
  assert.equal((await act({ type: 'respond', hangId, on: true }, { ...a, key: 'wrong' })).status, 403);
  assert.equal((await act({ type: 'join', name: 'sneaky' })).status, 400);
  assert.equal((await call('POST', `/api/crews/${crewId}/actions`, '{not json', a)).status, 400);
  assert.equal((await call('POST', `/api/crews/${crewId}/actions`, 'null', a)).status, 400);
  assert.equal((await call('POST', `/api/crews/${crewId}/actions`, '[]', a)).status, 400);
  assert.equal((await call('POST', `/api/crews/${crewId}/join`, { name: 'x'.repeat(20000) })).status, 413);
  assert.equal((await call('POST', `/api/crews/${crewId}/join`, { name: '' })).status, 400);
  assert.equal((await call('POST', '/api/crews', { crewName: '', creatorName: 'A', idea: 'x' })).status, 400);
  assert.equal((await call('GET', '/api/crews/doesnotexist1')).status, 404);
  for (const bad of ['__proto__', 'constructor']) {
    const r = await act({ type: 'respond', hangId: bad, on: true });
    assert.ok(r.status === 404 || r.status === 400, `${bad}: ${r.status}`);
  }
});

test('the server picks place ids, so they can never clash', async () => {
  const a = await newCrew();
  const act = (action) => call('POST', `/api/crews/${a.crewId}/actions`, { action }, a);
  await act({ type: 'addPlace', hangId: a.hangId, placeId: 'sameid0001', name: 'Hang Hau' });
  await act({ type: 'addPlace', hangId: a.hangId, placeId: 'sameid0001', name: 'Mong Kok' });
  const view = await call('GET', `/api/crews/${a.crewId}`, undefined, a);
  const ids = view.data.hangs[0].places.map((p) => p.id);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

test('leaving deletes the member and their key', async () => {
  const a = await newCrew();
  const b = (await call('POST', `/api/crews/${a.crewId}/join`, { name: 'B' })).data;
  assert.equal((await call('POST', `/api/crews/${a.crewId}/actions`, { action: { type: 'leave' } }, b)).status, 200);
  const view = await call('GET', `/api/crews/${a.crewId}`);
  assert.deepEqual(view.data.members.map((m) => m.name), ['A']);
  assert.equal((await call('POST', `/api/crews/${a.crewId}/actions`, { action: { type: 'respond', hangId: a.hangId, on: true } }, b)).status, 403);
});

test('plans survive a restart', async () => {
  const { crewId } = await newCrew({ crewName: 'keep me' });
  await instance.flush();
  const second = await start(path.join(dir, 'store.json'));
  const res = await fetch(`${second.base}/api/crews/${crewId}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).crew.name, 'keep me');
  await stop(second.inst);
});

test('a damaged data file is kept aside, never overwritten', async () => {
  const sub = await mkdtemp(path.join(dir, 'bad-'));
  const file = path.join(sub, 'store.json');
  await writeFile(file, '{"crews": {"abc');
  const errors = [];
  const inst = await createMinibusServer({ dataFile: file, log: { error: (m) => errors.push(m) } });
  const files = await readdir(sub);
  const aside = files.find((f) => f.startsWith('store.json.unreadable-'));
  assert.ok(aside, 'the bad file was moved aside');
  assert.equal(await readFile(path.join(sub, aside), 'utf8'), '{"crews": {"abc');
  assert.equal(errors.length, 1);
  await new Promise((r) => inst.server.close(r));

  await writeFile(file, '{"crews": null}');
  const inst2 = await createMinibusServer({ dataFile: file, log: quiet });
  assert.deepEqual(inst2.db.crews, {});
  await new Promise((r) => inst2.server.close(r));
});

test('each member has their own write limit', async () => {
  const a = await newCrew();
  const b = (await call('POST', `/api/crews/${a.crewId}/join`, { name: 'B' })).data;
  const act = (who) => call('POST', `/api/crews/${a.crewId}/actions`, { action: { type: 'respond', hangId: a.hangId, on: true } }, who);
  let lastA;
  for (let i = 0; i < 121; i++) lastA = await act(a);
  assert.equal(lastA.status, 429, 'A hit their limit');
  assert.equal((await act(b)).status, 200, 'B, on the same address, is not affected');
});

test('live updates arrive over server-sent events', async () => {
  const { crewId } = await newCrew({ crewName: 'live' });
  const controller = new AbortController();
  const res = await fetch(`${base}/api/crews/${crewId}/events`, { signal: controller.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  await reader.read(); // retry line
  await call('POST', `/api/crews/${crewId}/join`, { name: 'B' });
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /event: change/);
  controller.abort();
});

test('the privacy notice details are filled in from settings, safely', async () => {
  const res = await call('GET', '/');
  assert.match(res.data, /<meta name="minibus-operator" content="Mandy &lt;Chan&gt;">/);
  assert.match(res.data, /<meta name="minibus-deleteBy" content="31 Dec 2026">/);
});

test('admin export and delete need the admin token', async () => {
  const a = await newCrew({ crewName: 'export me' });
  assert.equal((await call('GET', '/api/admin/export')).status, 404);
  const res = await fetch(`${base}/api/admin/export`, { headers: { authorization: 'Bearer admin-secret-for-tests-0123456789abcdef' } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.crews[a.crewId].crew.name, 'export me');
  assert.ok(!JSON.stringify(data).includes(a.key), 'no member keys in the export');
  assert.ok(!JSON.stringify(data).includes('"keys"'));
  let del = await fetch(`${base}/api/admin/crews/${a.crewId}`, { method: 'DELETE', headers: { authorization: 'Bearer wrong' } });
  assert.equal(del.status, 404);
  del = await fetch(`${base}/api/admin/crews/${a.crewId}`, { method: 'DELETE', headers: { authorization: 'Bearer admin-secret-for-tests-0123456789abcdef' } });
  assert.equal(del.status, 200);
  assert.equal((await call('GET', `/api/crews/${a.crewId}`)).status, 404);
});

test('behind a proxy, only the last forwarded address counts', async () => {
  const statuses = [];
  for (let i = 0; i < 32; i++) {
    const res = await fetch(`${base}/api/crews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` },
      body: JSON.stringify({ crewName: 'g', idea: 'x', creatorName: 'A' }),
    });
    statuses.push(res.status);
  }
  assert.ok(statuses.includes(429), 'faking the first address does not get around the limit');
});

test('one damaged group is set aside and the rest still load', async () => {
  const sub = await mkdtemp(path.join(dir, 'partial-'));
  const file = path.join(sub, 'store.json');
  const good = await createMinibusServer({ dataFile: file, log: quiet });
  const created = await new Promise((resolve) => {
    good.server.listen(0, '127.0.0.1', async () => {
      const r = await fetch(`http://127.0.0.1:${good.server.address().port}/api/crews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ crewName: 'fine', idea: 'x', creatorName: 'A' }),
      });
      resolve(await r.json());
    });
  });
  await good.flush();
  await stop(good);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  saved.crews.brokengroup1 = { state: null };
  await writeFile(file, JSON.stringify(saved));
  const errors = [];
  const again = await createMinibusServer({ dataFile: file, log: { error: (m) => errors.push(m) } });
  assert.ok(again.db.crews[created.crewId], 'the good group is still there');
  assert.equal(again.db.crews.brokengroup1, undefined);
  assert.equal(errors.length, 1);
  assert.ok((await readdir(sub)).some((f) => f.startsWith('store.json.unreadable-groups-')));
  await new Promise((r) => again.server.close(r));
});

test('a weak admin token stops the server from starting', async () => {
  await assert.rejects(() => createMinibusServer({ dataFile: path.join(dir, 'weak.json'), adminToken: 'short', log: quiet }), /at least 32/);
});

test('a new private link only replaces the old one once it is used, and resets are limited', async () => {
  const a = await newCrew();
  const res = await call('POST', `/api/crews/${a.crewId}/reset-key`, {}, a);
  const fresh = { memberId: a.memberId, key: res.data.key };
  assert.equal((await call('GET', `/api/crews/${a.crewId}`, undefined, a)).data.me.name, 'A', 'old link still works until the new one is used');
  assert.equal((await call('GET', `/api/crews/${a.crewId}`, undefined, fresh)).data.me.name, 'A');
  assert.equal((await call('GET', `/api/crews/${a.crewId}`, undefined, a)).data.me, null, 'now the old link has stopped working');
  let who = fresh;
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', `/api/crews/${a.crewId}/reset-key`, {}, who);
    statuses.push(r.status);
    if (r.status === 200) {
      who = { memberId: a.memberId, key: r.data.key };
      await call('GET', `/api/crews/${a.crewId}`, undefined, who);
    }
  }
  assert.ok(statuses.includes(429));
});

test('check-in through the server: show the code, type it in, too many wrong tries are stopped', async () => {
  const a = await newCrew();
  const b = (await call('POST', `/api/crews/${a.crewId}/join`, { name: 'B' })).data;
  const codeRes = await call('POST', `/api/crews/${a.crewId}/hangs/${a.hangId}/code`, {}, a);
  assert.equal(codeRes.status, 400, 'no code before the plan is confirmed');
  const wrong = [];
  for (let i = 0; i < 11; i++) {
    wrong.push((await call('POST', `/api/crews/${a.crewId}/actions`, { action: { type: 'checkin', hangId: a.hangId, code: '0000' } }, b)).status);
  }
  assert.equal(wrong.at(-1), 429, 'guessing is limited');
});

test('link opens and refused rejoins are counted for the user test', async () => {
  const a = await newCrew();
  await call('POST', `/api/crews/${a.crewId}/opened`, { hangId: a.hangId });
  await call('POST', `/api/crews/${a.crewId}/opened`, { hangId: '__proto__' });
  assert.equal((await call('POST', `/api/crews/${a.crewId}/join`, { name: 'A' })).status, 400);
  const res = await fetch(`${base}/api/admin/export`, { headers: { authorization: 'Bearer admin-secret-for-tests-0123456789abcdef' } });
  const data = await res.json();
  assert.equal(data.crews[a.crewId].hangs[a.hangId].stats.opens, 1);
  assert.equal(data.crews[a.crewId].crew.stats.nameTaken, 1);
  assert.equal(data.crews[a.crewId].crew.secret, undefined);
});

test('the admin backup can be restored: members can still sign in afterwards', async () => {
  const a = await newCrew({ crewName: 'back me up' });
  assert.equal((await call('GET', '/api/admin/backup')).status, 404);
  const res = await fetch(`${base}/api/admin/backup`, { headers: { authorization: 'Bearer admin-secret-for-tests-0123456789abcdef' } });
  assert.equal(res.status, 200);
  const backup = await res.text();
  assert.ok(!backup.includes(a.key), 'no private links in the backup, only key hashes');
  // Restore it into a fresh server and sign in with the old key.
  const file = path.join(dir, 'restored.json');
  await writeFile(file, backup);
  const restored = await start(file);
  const view = await fetch(`${restored.base}/api/crews/${a.crewId}`, { headers: { 'x-minibus-member': a.memberId, 'x-minibus-key': a.key } });
  assert.equal((await view.json()).me.name, 'A');
  await stop(restored.inst);
});

test('the admin address check shows which address the limits count', async () => {
  assert.equal((await call('GET', '/api/admin/ip')).status, 404);
  const res = await fetch(`${base}/api/admin/ip`, {
    headers: { authorization: 'Bearer admin-secret-for-tests-0123456789abcdef', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
  });
  const data = await res.json();
  assert.equal(data.countedAs, '5.6.7.8');
  assert.equal(data.trustProxy, true);
});

test('when saving fails, changes are refused and the health check says so', async () => {
  const notAFolder = path.join(dir, 'a-file');
  await writeFile(notAFolder, 'x');
  const broken = await start(path.join(notAFolder, 'store.json'));
  const first = await fetch(`${broken.base}/api/crews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ crewName: 'g', size: 3, idea: 'x', seats: 2, creatorName: 'A' }),
  });
  assert.equal(first.status, 201);
  await broken.inst.flush();
  assert.equal((await fetch(`${broken.base}/api/health`)).status, 503);
  const second = await fetch(`${broken.base}/api/crews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ crewName: 'g', size: 3, idea: 'x', seats: 2, creatorName: 'A' }),
  });
  assert.equal(second.status, 503);
  await stop(broken.inst);
});

test('a malformed address gets a clear 400, and https hosts get HSTS', async () => {
  const port = new URL(base).port;
  const raw = await new Promise((resolve) => {
    import('node:net').then(({ connect }) => {
      const sock = connect(Number(port), '127.0.0.1', () => sock.write('GET http://[bad HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
      let data = '';
      sock.on('data', (d) => (data += d));
      sock.on('end', () => resolve(data));
      sock.on('error', () => resolve(data));
    });
  });
  assert.match(raw, /^HTTP\/1\.1 400/);
  const res = await fetch(`${base}/api/health`, { headers: { 'x-forwarded-proto': 'https' } });
  assert.match(res.headers.get('strict-transport-security') || '', /max-age=/);
});
