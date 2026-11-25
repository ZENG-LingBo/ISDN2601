// Minibus server. Zero dependencies: Node 18+ only.
//
//   node server.js            # http://localhost:8080, data in ./data/store.json
//   PORT=3000 DATA_FILE=/tmp/minibus.json node server.js
//   MINIBUS_BACKEND=local node server.js   # serve the on-device demo instead
//   TRUST_PROXY=1 node server.js            # behind a proxy that sets X-Forwarded-For
//   ADMIN_TOKEN=long-random-text node server.js   # turns on the export and delete endpoints
//   MINIBUS_OPERATOR="Your name, HKUST ISDN 1001" MINIBUS_CONTACT="you@example.com" \
//   MINIBUS_DELETE_BY="31 Dec 2026" node server.js   # fills in the privacy notice
//
// It serves the same app as the hosted demo, but plans live here, so friends on
// different phones share them. It runs the exact same rules (js/logic.js).

import http from 'node:http';
import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './js/logic.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 16 * 1024;
const MAX_CREWS = 200; // far more than a class test needs, and small enough that saves stay quick
const MAX_STREAMS_PER_CREW = 50;
const MAX_STREAMS = 500; // open live-update connections, all groups together
const MAX_STREAMS_PER_IP = 20;
const IP_CREATES_PER_DAY = 20;
const CODE_SHOWS_PER_MINUTE = 20;
const SAVE_RETRY_MS = 30_000;
const MEMBER_WRITES_PER_MINUTE = 120;
const IP_CREATES_PER_MINUTE = 30;
const IP_JOINS_PER_MINUTE = 120; // a whole class might join from one campus network
const IP_READS_PER_MINUTE = 600;
const SAVE_DELAY_MS = 200;
const SAVE_MAX_WAIT_MS = 2000;
const SETTLE_EVERY_MS = 10 * 60 * 1000;

const STATIC = {
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/js/app.js': ['js/app.js', 'text/javascript; charset=utf-8'],
  '/js/logic.js': ['js/logic.js', 'text/javascript; charset=utf-8'],
  '/js/store.js': ['js/store.js', 'text/javascript; charset=utf-8'],
};

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const ACTIONS = ['createHang', 'respond', 'addPlace', 'like', 'lock', 'outcome', 'leave', 'setSize', 'remove', 'track', 'setSeats', 'checkin'];
const CHECKIN_TRIES_PER_MINUTE = 10;
const KEY_RESETS_PER_HOUR = 5;
const MIN_ADMIN_TOKEN = 32;

function hashKey(key) {
  return createHash('sha256').update(String(key)).digest();
}

function keyMatches(stored, given) {
  if (typeof stored !== 'string' || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(stored, 'hex');
  const b = hashKey(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function attr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isCrewEntry(entry) {
  return isPlainObject(entry) && isPlainObject(entry.state) && isPlainObject(entry.state.crew) && isPlainObject(entry.state.hangs) && isPlainObject(entry.state.members) && isPlainObject(entry.keys);
}

// backend: 'server' (normal) or 'local' (serve the on-device demo, same as the hosted version).
export async function createMinibusServer({
  dataFile = path.join(ROOT, 'data', 'store.json'),
  now = () => Date.now(),
  backend = 'server',
  trustProxy = false,
  adminToken = '',
  notice = {},
  log = console,
} = {}) {
  if (adminToken && adminToken.length < MIN_ADMIN_TOKEN) {
    throw new Error(`ADMIN_TOKEN must be at least ${MIN_ADMIN_TOKEN} characters. Make one with: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`);
  }
  // ---------- storage ----------
  let db = { crews: {} };
  try {
    const parsed = JSON.parse(await readFile(dataFile, 'utf8'));
    if (!isPlainObject(parsed) || !isPlainObject(parsed.crews)) throw new Error('missing "crews"');
    // Keep every group that reads fine. Set aside only the ones that don't.
    const bad = {};
    for (const [id, entry] of Object.entries(parsed.crews)) {
      if (L.isId(id) && isCrewEntry(entry)) L.migrate(entry.state);
      else {
        bad[id] = entry;
        delete parsed.crews[id];
      }
    }
    db = parsed;
    if (Object.keys(bad).length) {
      const aside = `${dataFile}.unreadable-groups-${now()}.json`;
      await writeFile(aside, JSON.stringify(bad)).catch(() => {});
      log.error(`${Object.keys(bad).length} group(s) in ${dataFile} could not be read. Saved them to ${aside}.`);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Never overwrite a file we couldn't read. Keep it for recovery and start empty.
      const aside = `${dataFile}.unreadable-${now()}`;
      await rename(dataFile, aside).catch(() => {});
      log.error(`Could not read ${dataFile} (${e.message}). Moved it to ${aside} and started with no plans.`);
    }
  }

  let saveTimer = null;
  let firstPendingAt = 0;
  let saving = Promise.resolve();
  let lastSaveOk = true; // while false, changes are refused, so nobody thinks their answer was kept
  let retryTimer = null;
  async function writeNow() {
    await mkdir(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.${process.pid}.tmp`;
    try {
      const fh = await open(tmp, 'w');
      try {
        await fh.writeFile(JSON.stringify(db));
        await fh.sync();
      } finally {
        await fh.close();
      }
      await rename(tmp, dataFile); // atomic on the same filesystem
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
    try {
      const dir = await open(path.dirname(dataFile), 'r'); // make the rename itself survive a power cut
      await dir.sync().catch(() => {});
      await dir.close();
    } catch {
      /* not every system can sync a folder */
    }
  }
  function queueWrite() {
    firstPendingAt = 0;
    saving = saving
      .then(writeNow)
      .then(() => {
        lastSaveOk = true;
      })
      .catch((e) => {
        lastSaveOk = false;
        log.error('Save failed:', e.message);
        // Keep trying, so the server recovers on its own once there's disk space again.
        clearTimeout(retryTimer);
        retryTimer = setTimeout(queueWrite, SAVE_RETRY_MS);
        if (retryTimer.unref) retryTimer.unref();
      });
  }
  // Quick changes are grouped into one write, but nothing waits more than 2 seconds.
  function scheduleSave() {
    const t = now();
    if (!firstPendingAt) firstPendingAt = t;
    clearTimeout(saveTimer);
    if (t - firstPendingAt >= SAVE_MAX_WAIT_MS) {
      saveTimer = null;
      queueWrite();
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      queueWrite();
    }, SAVE_DELAY_MS);
  }
  async function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      queueWrite();
    }
    await saving;
  }

  // ---------- live updates ----------
  const listeners = new Map(); // crewId -> Set<res>
  let openStreams = 0;
  const streamsByIp = new Map(); // ip -> open live-update connections
  const openedSeen = new Set(); // "crew:plan:ip" already counted as an open
  function notify(crewId) {
    const set = listeners.get(crewId);
    if (!set) return;
    for (const res of set) res.write(`event: change\ndata: {}\n\n`);
  }

  // Apply time-based changes (deadline, moved plans). Save and tell open pages if anything changed.
  function settleCrew(crewId, entry) {
    if (L.settleChanged(entry.state, now())) {
      scheduleSave();
      notify(crewId);
    }
  }

  // ---------- rate limits ----------
  const buckets = new Map();
  function allow(bucketKey, limit, windowMs = 60_000) {
    const t = now();
    const b = buckets.get(bucketKey) || { count: 0, reset: t + windowMs };
    if (t > b.reset) {
      b.count = 0;
      b.reset = t + windowMs;
    }
    b.count += 1;
    buckets.set(bucketKey, b);
    if (buckets.size > 20_000) {
      for (const [k, v] of buckets) if (t > v.reset) buckets.delete(k); // drop only the expired ones
      if (buckets.size > 50_000) buckets.clear(); // last resort
    }
    return b.count <= limit;
  }

  // Behind a proxy, the last X-Forwarded-For entry is the one the proxy added. Earlier entries
  // come from the client and can be faked.
  function clientIp(req) {
    if (trustProxy) {
      const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function isAdmin(req) {
    if (!adminToken) return false;
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const a = hashKey(adminToken);
    const b = hashKey(given);
    return Boolean(given) && timingSafeEqual(a, b);
  }

  // ---------- helpers ----------
  function send(req, res, status, body, headers = {}) {
    const isText = typeof body === 'string' || Buffer.isBuffer(body);
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      // Behind an https host (like Railway), tell browsers to always use https.
      ...(trustProxy && req.headers['x-forwarded-proto'] === 'https' ? { 'strict-transport-security': 'max-age=15552000' } : {}),
      'content-type': isText ? headers['content-type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(req.method === 'HEAD' ? undefined : isText ? body : JSON.stringify(body));
  }

  function fail(req, res, status, code, message) {
    send(req, res, status, { code, message });
  }

  async function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 64 * MAX_BODY) req.destroy(); // someone is just flooding us
        else if (size <= MAX_BODY) chunks.push(c);
      });
      req.on('end', () => {
        // Read the whole body before answering, so the client gets a clean 413.
        if (size > MAX_BODY) return reject(new L.ActionError('too_big', 'That request is too big.'));
        let parsed;
        try {
          parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        } catch {
          return reject(new L.ActionError('invalid', 'The server could not read that request.'));
        }
        if (!isPlainObject(parsed)) return reject(new L.ActionError('invalid', 'The server could not read that request.'));
        resolve(parsed);
      });
      req.on('error', reject);
    });
  }

  // The member id and key travel in headers, not the address, so they don't end up in logs.
  // A new private link only replaces the old one once it has been used, so a lost reply
  // never locks anyone out.
  function authMember(req, entry) {
    const memberId = String(req.headers['x-minibus-member'] || '');
    const key = String(req.headers['x-minibus-key'] || '');
    if (!L.isId(memberId) || !Object.prototype.hasOwnProperty.call(entry.keys, memberId)) return null;
    if (keyMatches(entry.keys[memberId], key)) return memberId;
    const pending = entry.pendingKeys && Object.prototype.hasOwnProperty.call(entry.pendingKeys, memberId) ? entry.pendingKeys[memberId] : null;
    if (pending && keyMatches(pending, key)) {
      entry.keys[memberId] = pending;
      delete entry.pendingKeys[memberId];
      scheduleSave();
      return memberId;
    }
    return null;
  }

  let indexCache = null;
  async function indexHtml() {
    if (!indexCache) {
      const fragment = await readFile(path.join(ROOT, 'index.html'), 'utf8');
      const noticeMeta = ['operator', 'contact', 'deleteBy']
        .filter((k) => notice[k])
        .map((k) => `<meta name="minibus-${k}" content="${attr(notice[k])}">`)
        .join('');
      indexCache =
        '<!doctype html><html lang="en" class="standalone"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
        noticeMeta +
        '</head><body>' +
        fragment.replace('<meta name="minibus-backend" content="local">', `<meta name="minibus-backend" content="${backend === 'local' ? 'local' : 'server'}">`) +
        '</body></html>';
    }
    return indexCache;
  }

  function newKey() {
    return L.newId(32); // letters and digits only, so it can travel in a link
  }

  // ---------- routes ----------
  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://local');
    } catch {
      return fail(req, res, 400, 'invalid', 'The server could not read that request.');
    }
    const p = url.pathname;
    const reading = req.method === 'GET' || req.method === 'HEAD';

    if (reading && (p === '/' || p === '/index.html')) {
      return send(req, res, 200, await indexHtml(), { 'content-type': 'text/html; charset=utf-8' });
    }
    if (reading && Object.prototype.hasOwnProperty.call(STATIC, p)) {
      const [file, type] = STATIC[p];
      return send(req, res, 200, await readFile(path.join(ROOT, file)), { 'content-type': type, 'cache-control': 'no-cache' });
    }
    if (reading && p === '/api/health') return lastSaveOk ? send(req, res, 200, { ok: true }) : send(req, res, 503, { ok: false, error: 'save_failed' });
    if (!reading && !lastSaveOk) return fail(req, res, 503, 'save_failed', "The server can't save changes right now. Try again in a few minutes.");

    // ---------- admin (only when ADMIN_TOKEN is set) ----------
    if (p === '/api/admin/export' && reading) {
      if (!isAdmin(req)) return fail(req, res, 404, 'not_found', 'Not found.');
      const crews = Object.fromEntries(Object.entries(db.crews).map(([id, entry]) => [id, L.exportState(entry.state)])); // no keys or secrets
      return send(req, res, 200, { exportedAt: now(), crews }, { 'content-disposition': 'attachment; filename="minibus-export.json"' });
    }
    // The whole data file, for restoring after a problem. It has key hashes and check-in secrets,
    // but no private links. Keep it as safe as the export.
    if (p === '/api/admin/backup' && reading) {
      if (!isAdmin(req)) return fail(req, res, 404, 'not_found', 'Not found.');
      return send(req, res, 200, db, { 'content-disposition': 'attachment; filename="minibus-backup.json"' });
    }
    // Which address the server counts for request limits. Use it to check TRUST_PROXY on a host.
    if (p === '/api/admin/ip' && reading) {
      if (!isAdmin(req)) return fail(req, res, 404, 'not_found', 'Not found.');
      return send(req, res, 200, { countedAs: clientIp(req), forwardedFor: String(req.headers['x-forwarded-for'] || ''), trustProxy });
    }
    const adminDelete = /^\/api\/admin\/crews\/([a-z0-9]{6,40})$/.exec(p);
    if (adminDelete && req.method === 'DELETE') {
      if (!isAdmin(req)) return fail(req, res, 404, 'not_found', 'Not found.');
      if (!Object.prototype.hasOwnProperty.call(db.crews, adminDelete[1])) return fail(req, res, 404, 'not_found', 'No such group.');
      delete db.crews[adminDelete[1]];
      notify(adminDelete[1]);
      scheduleSave();
      return send(req, res, 200, { ok: true });
    }

    if (p === '/api/crews' && req.method === 'POST') {
      if (!allow(`ip:${clientIp(req)}`, IP_CREATES_PER_MINUTE)) return fail(req, res, 429, 'slow_down', 'Too many requests. Wait a minute and try again.');
      if (!allow(`ipday:${clientIp(req)}`, IP_CREATES_PER_DAY, 24 * 3600 * 1000)) return fail(req, res, 429, 'slow_down', 'Too many new groups from this network today. Try again tomorrow, or switch to mobile data.');
      if (Object.keys(db.crews).length >= MAX_CREWS) return fail(req, res, 507, 'full', 'This server is full.');
      const body = await readBody(req);
      const ids = { crewId: L.newId(), hangId: L.newId(), memberId: L.newId() };
      const state = L.createCrewState({ ...body, ...ids, demo: false }, now());
      const key = newKey();
      db.crews[ids.crewId] = { state, keys: { [ids.memberId]: hashKey(key).toString('hex') } };
      scheduleSave();
      return send(req, res, 201, { ...ids, key });
    }

    const m = /^\/api\/crews\/([a-z0-9]{6,40})(?:\/(join|actions|events|reset-key|opened)|\/hangs\/([a-z0-9]{6,40})\/(calendar\.ics|code))?$/.exec(p);
    if (!m) return fail(req, res, 404, 'not_found', 'Not found.');
    const [, crewId, sub, hangPart, hangSub] = m;
    const icsHang = hangSub === 'calendar.ics' ? hangPart : null;
    const codeHang = hangSub === 'code' ? hangPart : null;
    if (!Object.prototype.hasOwnProperty.call(db.crews, crewId)) return fail(req, res, 404, 'not_found', "This group doesn't exist. Check the link.");
    const entry = db.crews[crewId];

    if (!sub && !hangPart && reading) {
      if (!allow(`read:${clientIp(req)}`, IP_READS_PER_MINUTE)) return fail(req, res, 429, 'slow_down', 'Too many requests. Wait a minute and try again.');
      settleCrew(crewId, entry);
      return send(req, res, 200, L.buildView(entry.state, authMember(req, entry), now()));
    }

    if (sub === 'events' && req.method === 'GET') {
      const ip = clientIp(req);
      if (!allow(`events:${ip}`, 60)) return fail(req, res, 429, 'slow_down', 'Too many requests. Wait a minute and try again.');
      if (!listeners.has(crewId)) listeners.set(crewId, new Set());
      const set = listeners.get(crewId);
      if (set.size >= MAX_STREAMS_PER_CREW || openStreams >= MAX_STREAMS || (streamsByIp.get(ip) || 0) >= MAX_STREAMS_PER_IP) {
        return fail(req, res, 503, 'busy', 'Too many open pages for this group.');
      }
      openStreams += 1;
      streamsByIp.set(ip, (streamsByIp.get(ip) || 0) + 1);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write('retry: 5000\n\n');
      set.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        set.delete(res);
        openStreams -= 1;
        const left = (streamsByIp.get(ip) || 1) - 1;
        if (left > 0) streamsByIp.set(ip, left);
        else streamsByIp.delete(ip);
      });
      return;
    }

    if (icsHang && reading) {
      if (!allow(`read:${clientIp(req)}`, IP_READS_PER_MINUTE)) return fail(req, res, 429, 'slow_down', 'Too many requests. Wait a minute and try again.');
      const view = L.buildView(entry.state, null, now());
      const hang = view.hangs.find((h) => h.id === icsHang);
      if (!hang || !hang.lock) return fail(req, res, 404, 'not_found', "This plan doesn't have a time yet.");
      return send(req, res, 200, L.icsText(hang, view.crew.name, `${crewId}-${hang.id}`, now()), {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="minibus-plan.ics"',
      });
    }

    if (req.method !== 'POST') return fail(req, res, 405, 'method', 'Method not allowed.');
    if (hangPart && !codeHang) return fail(req, res, 405, 'method', 'Method not allowed.');

    // Someone opened a plan link (before or after joining). Counted for the user test only.
    if (sub === 'opened') {
      if (!allow(`opened:${clientIp(req)}`, IP_READS_PER_MINUTE)) return fail(req, res, 429, 'slow_down', 'Too many requests. Wait a minute and try again.');
      const body = await readBody(req);
      const hang = typeof body.hangId === 'string' && Object.prototype.hasOwnProperty.call(entry.state.hangs, body.hangId) ? entry.state.hangs[body.hangId] : null;
      const seenKey = `${crewId}:${body.hangId}:${clientIp(req)}`;
      if (hang && !openedSeen.has(seenKey)) {
        if (openedSeen.size > 50_000) openedSeen.clear();
        openedSeen.add(seenKey); // once per address while the server runs
        hang.stats = hang.stats || {};
        hang.stats.opens = (hang.stats.opens || 0) + 1;
        scheduleSave();
      }
      return send(req, res, 200, { ok: true });
    }

    if (sub === 'join') {
      if (!allow(`join:${clientIp(req)}`, IP_JOINS_PER_MINUTE)) return fail(req, res, 429, 'slow_down', 'Too many requests. Wait a minute and try again.');
      const body = await readBody(req);
      const memberId = L.newId();
      try {
        entry.state = L.reduce(entry.state, { type: 'join', memberId, name: body.name }, now());
      } catch (e) {
        if (e.code === 'name_taken') {
          L.countCrew(entry.state, 'nameTaken'); // a sign that someone lost their place and tried again
          scheduleSave();
        }
        throw e;
      }
      const key = newKey();
      entry.keys[memberId] = hashKey(key).toString('hex');
      scheduleSave();
      notify(crewId);
      return send(req, res, 201, { memberId, key, crewName: entry.state.crew.name });
    }

    if (sub === 'actions') {
      const me = authMember(req, entry);
      if (!me) return fail(req, res, 403, 'not_member', "You're not in this group on this device. Open the group link and join, or use your private link.");
      if (!allow(`member:${me}`, MEMBER_WRITES_PER_MINUTE)) return fail(req, res, 429, 'slow_down', 'Too many changes at once. Wait a minute and try again.');
      const body = await readBody(req);
      const action = isPlainObject(body.action) ? { ...body.action } : {};
      if (!ACTIONS.includes(action.type)) return fail(req, res, 400, 'invalid', 'The server could not read that request.');
      if (action.type === 'checkin' && !allow(`checkin:${me}`, CHECKIN_TRIES_PER_MINUTE)) {
        return fail(req, res, 429, 'slow_down', 'Too many tries. Wait a minute and ask for the current code.');
      }
      if (action.type === 'addPlace') action.placeId = L.newId(); // the server picks ids, not the client
      entry.state = L.reduce(entry.state, { ...action, memberId: me }, now());
      const gone = action.type === 'leave' ? me : action.type === 'remove' ? action.targetId : null;
      if (gone) {
        delete entry.keys[gone];
        if (entry.pendingKeys) delete entry.pendingKeys[gone];
      }
      scheduleSave();
      if (action.type !== 'track') notify(crewId);
      return send(req, res, 200, { ok: true });
    }

    // Show the check-in code. You are checked in when a friend types it in.
    if (codeHang) {
      const me = authMember(req, entry);
      if (!me) return fail(req, res, 403, 'not_member', "You're not in this group on this device. Open the group link and join first.");
      if (!allow(`code:${me}`, CODE_SHOWS_PER_MINUTE)) return fail(req, res, 429, 'slow_down', 'Too many requests. Wait a minute and try again.');
      entry.state = L.reduce(entry.state, { type: 'showCode', hangId: codeHang, memberId: me }, now());
      scheduleSave();
      notify(crewId);
      return send(req, res, 200, { code: L.checkinCode(entry.state, codeHang, now()), expiresAt: L.codeExpiresAt(now()) });
    }

    // A new private link. The old one stops working.
    if (sub === 'reset-key') {
      const me = authMember(req, entry);
      if (!me) return fail(req, res, 403, 'not_member', "You're not in this group on this device. Open the group link and join first.");
      if (!allow(`reset:${me}`, KEY_RESETS_PER_HOUR, 60 * 60 * 1000)) return fail(req, res, 429, 'slow_down', 'You made several new links already. Try again in an hour.');
      const key = newKey();
      if (!entry.pendingKeys) entry.pendingKeys = {};
      entry.pendingKeys[me] = hashKey(key).toString('hex');
      scheduleSave();
      return send(req, res, 200, { key });
    }

    return fail(req, res, 404, 'not_found', 'Not found.');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e instanceof L.ActionError) {
        const status = e.code === 'not_found' ? 404 : e.code === 'too_big' ? 413 : e.code === 'not_member' ? 403 : 400;
        return fail(req, res, status, e.code, e.message);
      }
      log.error(e);
      return fail(req, res, 500, 'error', 'Something went wrong on the server. Try again.');
    });
  });

  // Every 10 minutes, apply time-based changes (like the 48-hour deadline) even if nobody is looking.
  const tick = setInterval(() => {
    for (const [crewId, entry] of Object.entries(db.crews)) {
      try {
        settleCrew(crewId, entry);
      } catch (e) {
        log.error(`Couldn't update group ${crewId}:`, e.message);
      }
    }
  }, SETTLE_EVERY_MS);
  tick.unref();
  server.on('close', () => clearInterval(tick));

  return { server, flush, db };
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 8080;
  const host = process.env.HOST || '0.0.0.0';
  const { server, flush } = await createMinibusServer({
    dataFile: process.env.DATA_FILE || undefined,
    backend: process.env.MINIBUS_BACKEND === 'local' ? 'local' : 'server',
    trustProxy: process.env.TRUST_PROXY === '1',
    adminToken: process.env.ADMIN_TOKEN || '',
    notice: {
      operator: process.env.MINIBUS_OPERATOR || '',
      contact: process.env.MINIBUS_CONTACT || '',
      deleteBy: process.env.MINIBUS_DELETE_BY || '',
    },
  });
  server.listen(port, host, () => {
    console.log(`Minibus is running on http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`  Friends on the same Wi-Fi can open http://${ip}:${port}`);
  });
  const stop = async () => {
    await flush();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
