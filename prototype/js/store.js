// Two ways to keep plans, same interface:
// - LocalStore: everything on this device (the hosted demo). Tabs stay in sync,
//   so you can play several friends in several tabs.
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
      /* memory copy is enough for this visit */
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

// Who am I in each group, and which groups have I joined, on this device.
export const identity = {
  get(crewId) {
    return readJson(`${PREFIX}me:${crewId}`, null);
  },
  set(crewId, me) {
    storage.set(`${PREFIX}me:${crewId}`, JSON.stringify(me));
  },
  crews() {
    return readJson(`${PREFIX}crews`, []);
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

// ---------------------------------------------------------------- local

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
    return Date.now() + ((state && state.crew.clockOffset) || 0);
  }

  read(crewId) {
    return readJson(`${PREFIX}crew:${crewId}`, null);
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
    const me = identity.get(crewId);
    return L.buildView(state, me && me.memberId, this.now(state));
  }

  async join(crewId, name) {
    const state = this.read(crewId);
    if (!state) throw new L.ActionError('not_found', "can't find that group on this device");
    const memberId = L.newId();
    this.write(L.reduce(state, { type: 'join', memberId, name }, this.now(state)));
    identity.set(crewId, { memberId });
    identity.remember(crewId, state.crew.name);
  }

  async act(crewId, action) {
    const state = this.read(crewId);
    if (!state) throw new L.ActionError('not_found', "can't find that group on this device");
    const me = identity.get(crewId);
    if (!me) throw new L.ActionError('not_member', 'join the group first');
    this.write(L.reduce(state, { ...action, memberId: me.memberId }, this.now(state)));
  }

  // Demo only: make a fake friend do something, or skip ahead in time.
  //   'tom'  : Tom finally answers
  //   'swap' : the first other person going can't make the locked time anymore
  //   'skip' : jump to an hour after the plan
  async demo(crewId, hangId, what) {
    let state = this.read(crewId);
    if (!state || !state.crew.demo || !state.hangs[hangId]) return;
    const hang = state.hangs[hangId];
    const me = identity.get(crewId);
    const now = this.now(state);
    const members = Object.values(state.members);

    if (what === 'tom') {
      const tom = members.find((m) => m.name === 'Tom');
      if (!tom) return;
      state = L.reduce(state, { type: 'respond', hangId, memberId: tom.id, on: true, free: state.crew.demoTomFree || [] }, now);
    } else if (what === 'swap' && hang.lock) {
      const friend = members.find(
        (m) => m.id !== (me && me.memberId) && m.r[hangId] && m.r[hangId].on === true && m.r[hangId].free.includes(hang.lock.slot),
      );
      if (!friend) return;
      const free = friend.r[hangId].free.filter((s) => s !== hang.lock.slot);
      state = L.reduce(state, { type: 'respond', hangId, memberId: friend.id, free }, now);
    } else if (what === 'skip' && hang.lock) {
      const target = L.slotTime(hang.lock.slot, 'end') + 60 * 60 * 1000;
      state.crew.clockOffset = Math.max(state.crew.clockOffset || 0, target - Date.now());
      state = L.settle(state, this.now(state));
    } else {
      return;
    }
    this.write(state);
  }

  demoSwapperName(crewId, hangId) {
    const state = this.read(crewId);
    const hang = state && state.hangs[hangId];
    if (!hang || !hang.lock) return null;
    const me = identity.get(crewId);
    const friend = Object.values(state.members).find(
      (m) => m.id !== (me && me.memberId) && m.r[hangId] && m.r[hangId].on === true && m.r[hangId].free.includes(hang.lock.slot),
    );
    return friend ? friend.name : null;
  }

  calendarFileUrl() {
    return null; // the hosted demo can't download files; the calendar link still works
  }
}

// ---------------------------------------------------------------- server

class ServerStore {
  constructor() {
    this.kind = 'server';
  }

  async request(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new L.ActionError('offline', "can't reach the server. check your connection and try again");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new L.ActionError(data.code || 'error', data.message || 'something went wrong');
    return data;
  }

  auth(crewId) {
    const me = identity.get(crewId);
    return me ? { memberId: me.memberId, key: me.key } : {};
  }

  async createCrew(input) {
    const out = await this.request('POST', '/api/crews', input);
    identity.set(out.crewId, { memberId: out.memberId, key: out.key });
    identity.remember(out.crewId, cleanName(input.crewName));
    return { crewId: out.crewId, hangId: out.hangId };
  }

  async view(crewId) {
    const { memberId, key } = this.auth(crewId);
    const q = memberId ? `?member=${encodeURIComponent(memberId)}&key=${encodeURIComponent(key)}` : '';
    try {
      return await this.request('GET', `/api/crews/${encodeURIComponent(crewId)}${q}`);
    } catch (e) {
      if (e.code === 'not_found') return null;
      throw e;
    }
  }

  async join(crewId, name) {
    const out = await this.request('POST', `/api/crews/${encodeURIComponent(crewId)}/join`, { name });
    identity.set(crewId, { memberId: out.memberId, key: out.key });
    identity.remember(crewId, out.crewName);
  }

  async act(crewId, action) {
    await this.request('POST', `/api/crews/${encodeURIComponent(crewId)}/actions`, { ...this.auth(crewId), action });
  }

  subscribe(crewId, fn) {
    let source = null;
    let timer = null;
    const poll = () => {
      timer = setInterval(fn, 15000);
    };
    if ('EventSource' in window) {
      source = new EventSource(`/api/crews/${encodeURIComponent(crewId)}/events`);
      source.addEventListener('change', fn);
      source.onerror = () => {
        if (source.readyState === EventSource.CLOSED && !timer) poll();
      };
    } else {
      poll();
    }
    return () => {
      if (source) source.close();
      if (timer) clearInterval(timer);
    };
  }

  calendarFileUrl(crewId, hangId) {
    return `/api/crews/${encodeURIComponent(crewId)}/hangs/${encodeURIComponent(hangId)}/calendar.ics`;
  }
}

function cleanName(name) {
  return L.cleanText(name, L.LIMITS.crewName);
}
