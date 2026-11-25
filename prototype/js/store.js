// Two ways to keep plans, with the same interface:
// - LocalStore: everything on this device (the hosted demo, with pretend friends).
// - ServerStore: talks to server.js, so friends on different phones share one plan.

import * as L from './logic.js';

const PREFIX = 'minibus:v1:';

// localStorage can throw (private mode, blocked storage, previews). Fall back to memory.
const memory = new Map();
const storage = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? memory.get(key) ?? null : v;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* the memory copy is enough for this visit */
    }
  },
  remove(key) {
    memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};

function readJson(key, fallback) {
  try {
    const raw = storage.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Who you are in each group, and which groups you've joined, on this device.
export const identity = {
  get(crewId) {
    return readJson(`${PREFIX}me:${crewId}`, null);
  },
  set(crewId, me) {
    storage.set(`${PREFIX}me:${crewId}`, JSON.stringify(me));
  },
  forget(crewId) {
    storage.remove(`${PREFIX}me:${crewId}`);
    storage.set(`${PREFIX}crews`, JSON.stringify(identity.crews().filter((c) => c.id !== crewId)));
  },
  crews() {
    const list = readJson(`${PREFIX}crews`, []);
    return Array.isArray(list) ? list : [];
  },
  remember(crewId, name) {
    const list = identity.crews().filter((c) => c.id !== crewId);
    list.unshift({ id: crewId, name });
    storage.set(`${PREFIX}crews`, JSON.stringify(list.slice(0, 20)));
  },
};

export function backendKind() {
  const meta = document.querySelector('meta[name="minibus-backend"]');
  return meta && meta.content === 'server' ? 'server' : 'local';
}

export function createStore() {
  return backendKind() === 'server' ? new ServerStore() : new LocalStore();
}

// ---------------------------------------------------------------- on this device

class LocalStore {
  constructor() {
    this.kind = 'local';
    this.listeners = new Map();
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel('minibus') : null;
    if (this.channel) this.channel.onmessage = (e) => this.ping(e.data && e.data.crewId);
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith(`${PREFIX}crew:`)) this.ping(e.key.slice(`${PREFIX}crew:`.length));
    });
  }

  now(state) {
    return Date.now() + ((state && state.demo && state.demo.clockOffset) || 0);
  }

  read(crewId) {
    return L.migrate(readJson(`${PREFIX}crew:${crewId}`, null));
  }

  write(state) {
    storage.set(`${PREFIX}crew:${state.crew.id}`, JSON.stringify(state));
    if (this.channel) this.channel.postMessage({ crewId: state.crew.id });
    this.ping(state.crew.id);
  }

  ping(crewId) {
    const set = this.listeners.get(crewId);
    if (set) for (const fn of set) fn();
  }

  subscribe(crewId, fn) {
    if (!this.listeners.has(crewId)) this.listeners.set(crewId, new Set());
    this.listeners.get(crewId).add(fn);
    return () => this.listeners.get(crewId).delete(fn);
  }

  async createCrew(input) {
    const ids = { crewId: L.newId(), hangId: L.newId(), memberId: L.newId() };
    const state = L.createCrewState({ ...input, ...ids }, Date.now());
    this.write(state);
    identity.set(ids.crewId, { memberId: ids.memberId });
    identity.remember(ids.crewId, state.crew.name);
    return { crewId: ids.crewId, hangId: ids.hangId };
  }

  async createDemo() {
    const ids = {
      crewId: L.newId(),
      hangId: L.newId(),
      memberIds: L.DEMO_FRIENDS.map(() => L.newId()),
      placeIds: [L.newId(), L.newId()],
    };
    const state = L.createDemoState(ids, Date.now());
    this.write(state);
    identity.remember(ids.crewId, state.crew.name);
    return { crewId: ids.crewId, hangId: ids.hangId };
  }

  async view(crewId) {
    const state = this.read(crewId);
    if (!state) return null;
    // Apply time-based changes, like the 48-hour deadline.
    const before = JSON.stringify(state);
    L.settle(state, this.now(state));
    if (JSON.stringify(state) !== before) storage.set(`${PREFIX}crew:${crewId}`, JSON.stringify(state));
    const me = identity.get(crewId);
    return L.buildView(state, me && me.memberId, this.now(state));
  }

  async join(crewId, name) {
    const state = this.read(crewId);
    if (!state) throw new L.ActionError('not_found', "This group isn't saved on this device.");
    const memberId = L.newId();
    this.write(L.reduce(state, { type: 'join', memberId, name }, this.now(state)));
    identity.set(crewId, { memberId });
    identity.remember(crewId, state.crew.name);
  }

  async act(crewId, action) {
    const state = this.read(crewId);
    if (!state) throw new L.ActionError('not_found', "This group isn't saved on this device.");
    const me = identity.get(crewId);
    if (!me) throw new L.ActionError('not_member', 'Join the group first.');
    this.write(L.reduce(state, { ...action, memberId: me.memberId }, this.now(state)));
    if (action.type === 'leave') identity.forget(crewId);
  }

  // ---- demo only ----

  // Switch which person you're playing, to see what each friend sees.
  playAs(crewId, memberId) {
    const state = this.read(crewId);
    if (!state || !state.crew.demo || !Object.prototype.hasOwnProperty.call(state.members, memberId)) return;
    const before = identity.get(crewId) || {};
    identity.set(crewId, { memberId, demoSelf: before.demoSelf || before.memberId || memberId });
    this.ping(crewId);
  }

  // The person you joined as in the demo (not one of the pretend friends).
  demoSelf(crewId) {
    const me = identity.get(crewId);
    return me ? me.demoSelf || me.memberId : null;
  }

  // Make a pretend friend do something, or skip ahead in time.
  //   'tom'  : Tom finally answers
  //   'swap' : someone else who is going can't make the confirmed time anymore
  //   'skip' : jump to an hour after the plan
  async demo(crewId, hangId, what) {
    let state = this.read(crewId);
    if (!state || !state.crew.demo || !Object.prototype.hasOwnProperty.call(state.hangs, hangId)) return;
    const hang = state.hangs[hangId];
    const now = this.now(state);
    const tom = Object.values(state.members).find((m) => m.name === 'Tom');

    if (what === 'tom' && tom) {
      state = L.reduce(state, { type: 'respond', hangId, memberId: tom.id, on: true, free: state.demo.tomFree || [] }, now);
    } else if (what === 'swap' && hang.lock) {
      const friend = this.demoSwapper(state, hangId);
      if (!friend) return;
      const free = friend.r[hangId].free.filter((s) => s !== hang.lock.slot);
      state = L.reduce(state, { type: 'respond', hangId, memberId: friend.id, free }, now);
    } else if (what === 'skip' && hang.lock) {
      const target = L.slotTime(hang.lock.slot, 'end') + L.HOUR_MS;
      state.demo.clockOffset = Math.max(state.demo.clockOffset || 0, target - Date.now());
      state = L.settle(state, this.now(state));
    } else {
      return;
    }
    this.write(state);
  }

  demoSwapper(state, hangId) {
    const hang = state.hangs[hangId];
    if (!hang || !hang.lock) return null;
    const me = identity.get(state.crew.id);
    return (
      Object.values(state.members).find(
        (m) =>
          m.id !== (me && me.memberId) &&
          m.id !== (me && me.demoSelf) &&
          m.r[hangId] &&
          m.r[hangId].on === true &&
          m.r[hangId].free.includes(hang.lock.slot),
      ) || null
    );
  }

  demoSwapperName(crewId, hangId) {
    const state = this.read(crewId);
    const friend = state ? this.demoSwapper(state, hangId) : null;
    return friend ? friend.name : null;
  }

  calendarFileUrl() {
    return null; // the hosted demo can't download files; the calendar link still works
  }

  personalLink() {
    return null; // not needed: the demo only works on this device anyway
  }
}

// ---------------------------------------------------------------- server

class ServerStore {
  constructor() {
    this.kind = 'server';
  }

  async request(method, path, { body, crewId } = {}) {
    const headers = {};
    if (body) headers['content-type'] = 'application/json';
    const me = crewId ? identity.get(crewId) : null;
    if (me && me.key) {
      headers['x-minibus-member'] = me.memberId;
      headers['x-minibus-key'] = me.key;
    }
    let res;
    try {
      res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new L.ActionError('offline', "Can't reach Minibus. Check your internet connection and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new L.ActionError(data.code || 'error', data.message || 'Something went wrong. Try again.');
    return data;
  }

  async createCrew(input) {
    const out = await this.request('POST', '/api/crews', { body: input });
    identity.set(out.crewId, { memberId: out.memberId, key: out.key });
    identity.remember(out.crewId, L.cleanText(input.crewName, L.LIMITS.crewName));
    return { crewId: out.crewId, hangId: out.hangId };
  }

  async view(crewId) {
    try {
      return await this.request('GET', `/api/crews/${encodeURIComponent(crewId)}`, { crewId });
    } catch (e) {
      if (e.code === 'not_found') return null;
      throw e;
    }
  }

  async join(crewId, name) {
    const out = await this.request('POST', `/api/crews/${encodeURIComponent(crewId)}/join`, { body: { name } });
    identity.set(crewId, { memberId: out.memberId, key: out.key });
    identity.remember(crewId, out.crewName);
  }

  async act(crewId, action) {
    await this.request('POST', `/api/crews/${encodeURIComponent(crewId)}/actions`, { body: { action }, crewId });
    if (action.type === 'leave') identity.forget(crewId);
  }

  // Live updates. If the live connection drops, check every 15 seconds until it's back.
  subscribe(crewId, fn) {
    let timer = null;
    const startPolling = () => {
      if (!timer) timer = setInterval(fn, 15000);
    };
    const stopPolling = () => {
      clearInterval(timer);
      timer = null;
    };
    let source = null;
    if ('EventSource' in window) {
      source = new EventSource(`/api/crews/${encodeURIComponent(crewId)}/events`);
      source.addEventListener('change', fn);
      source.addEventListener('open', () => {
        stopPolling();
        fn(); // catch up on anything missed while disconnected
      });
      source.addEventListener('error', startPolling);
    } else {
      startPolling();
    }
    return () => {
      if (source) source.close();
      stopPolling();
    };
  }

  calendarFileUrl(crewId, hangId) {
    return `/api/crews/${encodeURIComponent(crewId)}/hangs/${encodeURIComponent(hangId)}/calendar.ics`;
  }

  // A private link that signs you back in on another device or browser.
  personalLink(crewId) {
    const me = identity.get(crewId);
    if (!me || !me.key) return null;
    return `${location.href.split('#')[0]}#me-${crewId}-${me.memberId}-${me.key}`;
  }

  claim(crewId, memberId, key) {
    identity.set(crewId, { memberId, key });
  }
}
