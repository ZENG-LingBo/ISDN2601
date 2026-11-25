// Minibus server. Zero dependencies: Node 18+ only.
//
//   node server.js            # http://localhost:8080, data in ./data/store.json
//   PORT=3000 DATA_FILE=/tmp/minibus.json node server.js
//
// It serves the same app as the hosted demo, but plans live here, so friends on
// different phones share them. It runs the exact same rules (js/logic.js).

import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './js/logic.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 16 * 1024;
const MAX_CREWS = 2000;
const WRITES_PER_MINUTE = 120;

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

function hashKey(key) {
  return createHash('sha256').update(String(key)).digest();
}

function keyMatches(stored, given) {
  if (typeof stored !== 'string' || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(stored, 'hex');
  const b = hashKey(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// backend: 'server' (normal) or 'local' (serve the on-device demo, same as the hosted version).
export async function createMinibusServer({
  dataFile = path.join(ROOT, 'data', 'store.json'),
  now = () => Date.now(),
  backend = 'server',
} = {}) {
  // ---------- storage ----------
  let db = { crews: {} };
  try {
    db = JSON.parse(await readFile(dataFile, 'utf8'));
    if (!db || typeof db.crews !== 'object') db = { crews: {} };
  } catch {
    /* first run */
  }

  let saveTimer = null;
  let saving = Promise.resolve();
  async function writeNow() {
    await mkdir(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(db));
    await rename(tmp, dataFile); // atomic on the same filesystem
  }
  function queueWrite() {
    saving = saving.then(writeNow).catch((e) => console.error('save failed:', e.message));
  }
  // Many quick taps become one write.
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      queueWrite();
    }, 200);
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
  function notify(crewId) {
    const set = listeners.get(crewId);
    if (!set) return;
    for (const res of set) res.write(`event: change\ndata: {}\n\n`);
  }

  // ---------- rate limiting (per IP, writes only) ----------
  const buckets = new Map();
  function allowWrite(ip) {
    const t = now();
    const b = buckets.get(ip) || { count: 0, reset: t + 60_000 };
    if (t > b.reset) {
      b.count = 0;
      b.reset = t + 60_000;
    }
    b.count += 1;
    buckets.set(ip, b);
    if (buckets.size > 10_000) buckets.clear();
    return b.count <= WRITES_PER_MINUTE;
  }

  // ---------- helpers ----------
  function send(res, status, body, headers = {}) {
    const isText = typeof body === 'string' || Buffer.isBuffer(body);
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      'content-type': isText ? headers['content-type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    });
    res.end(isText ? body : JSON.stringify(body));
  }

  function fail(res, status, code, message) {
    send(res, status, { code, message });
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
        if (size > MAX_BODY) {
          reject(new L.ActionError('too_big', 'request too big'));
          return;
        }
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
        } catch {
          reject(new L.ActionError('invalid', 'bad JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  function authMember(entry, memberId, key) {
    if (!memberId || !entry.keys[memberId]) return null;
    return keyMatches(entry.keys[memberId], key) ? memberId : null;
  }

  let indexCache = null;
  async function indexHtml() {
    if (!indexCache) {
      const fragment = await readFile(path.join(ROOT, 'index.html'), 'utf8');
      indexCache =
        '<!doctype html><html lang="en" class="standalone"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
        '</head><body>' +
        fragment.replace('<meta name="minibus-backend" content="local">', `<meta name="minibus-backend" content="${backend === 'local' ? 'local' : 'server'}">`) +
        '</body></html>';
    }
    return indexCache;
  }

  // ---------- routes ----------
  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    const ip = req.socket.remoteAddress || 'unknown';

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      return send(res, 200, await indexHtml(), { 'content-type': 'text/html; charset=utf-8' });
    }
    if (req.method === 'GET' && STATIC[p]) {
      const [file, type] = STATIC[p];
      return send(res, 200, await readFile(path.join(ROOT, file)), { 'content-type': type, 'cache-control': 'no-cache' });
    }
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true });

    if (p === '/api/crews' && req.method === 'POST') {
      if (!allowWrite(ip)) return fail(res, 429, 'slow_down', 'too many requests, give it a minute');
      if (Object.keys(db.crews).length >= MAX_CREWS) return fail(res, 507, 'full', 'this server is full');
      const body = await readBody(req);
      const ids = { crewId: L.newId(), hangId: L.newId(), memberId: L.newId() };
      const state = L.createCrewState({ ...body, ...ids, demo: false }, now());
      const key = randomBytes(24).toString('base64url');
      db.crews[ids.crewId] = { state, keys: { [ids.memberId]: hashKey(key).toString('hex') } };
      scheduleSave();
      return send(res, 201, { ...ids, key });
    }

    const m = /^\/api\/crews\/([a-z0-9]{6,24})(?:\/(join|actions|events)|\/hangs\/([a-z0-9]{6,24})\/calendar\.ics)?$/.exec(p);
    if (!m) return fail(res, 404, 'not_found', 'not found');
    const [, crewId, sub, icsHang] = m;
    const entry = db.crews[crewId];
    if (!entry) return fail(res, 404, 'not_found', "can't find that group");

    if (!sub && !icsHang && req.method === 'GET') {
      const me = authMember(entry, url.searchParams.get('member'), url.searchParams.get('key'));
      return send(res, 200, L.buildView(entry.state, me, now()));
    }

    if (sub === 'events' && req.method === 'GET') {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write('retry: 5000\n\n');
      if (!listeners.has(crewId)) listeners.set(crewId, new Set());
      const set = listeners.get(crewId);
      if (set.size >= 200) {
        res.end();
        return;
      }
      set.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        set.delete(res);
      });
      return;
    }

    if (icsHang && req.method === 'GET') {
      const view = L.buildView(entry.state, null, now());
      const hang = view.hangs.find((h) => h.id === icsHang);
      if (!hang || !hang.lock) return fail(res, 404, 'not_found', 'that plan has no time yet');
      return send(res, 200, L.icsText(hang, view.crew.name, `${crewId}-${hang.id}`, now()), {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="minibus-plan.ics"',
      });
    }

    if (req.method !== 'POST') return fail(res, 405, 'method', 'method not allowed');
    if (!allowWrite(ip)) return fail(res, 429, 'slow_down', 'too many requests, give it a minute');
    const body = await readBody(req);

    if (sub === 'join') {
      const memberId = L.newId();
      entry.state = L.reduce(entry.state, { type: 'join', memberId, name: body.name }, now());
      const key = randomBytes(24).toString('base64url');
      entry.keys[memberId] = hashKey(key).toString('hex');
      scheduleSave();
      notify(crewId);
      return send(res, 201, { memberId, key, crewName: entry.state.crew.name });
    }

    if (sub === 'actions') {
      const me = authMember(entry, body.memberId, body.key);
      if (!me) return fail(res, 403, 'not_member', "you're not in this group on this device. open the link and join first");
      const action = body.action || {};
      const allowed = ['createHang', 'respond', 'addPlace', 'like', 'lock', 'outcome'];
      if (!allowed.includes(action.type)) return fail(res, 400, 'invalid', 'unknown action');
      entry.state = L.reduce(entry.state, { ...action, memberId: me }, now());
      scheduleSave();
      notify(crewId);
      return send(res, 200, { ok: true });
    }

    return fail(res, 404, 'not_found', 'not found');
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e instanceof L.ActionError) {
        const status = e.code === 'not_found' ? 404 : e.code === 'too_big' ? 413 : 400;
        return fail(res, status, e.code, e.message);
      }
      console.error(e);
      return fail(res, 500, 'error', 'something broke on the server');
    });
  });

  // Hourly, re-check every plan so time-based changes are saved even when nobody is active.
  const tick = setInterval(() => {
    for (const entry of Object.values(db.crews)) L.settle(entry.state, now());
    scheduleSave();
  }, 60 * 60 * 1000);
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
  });
  server.listen(port, host, () => {
    console.log(`Minibus is running on http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`  friends on the same Wi-Fi: http://${ip}:${port}`);
  });
  const stop = async () => {
    await flush();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
