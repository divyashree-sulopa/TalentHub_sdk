import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import {
  MemoryStateStore,
  RedisStateStore,
  getStateStore,
  runWithStateScope,
  setStateStore
} from '../backend/src/state/state-store.js';
import { RedisRestClient } from '../backend/src/state/redis-rest.js';
import { sessionManager } from '../backend/src/session-manager.js';
import {
  _resetHirePoolSessionMemory,
  findHirePoolContextBySdkCredential,
  hydrateHirePoolSessionByCredential,
  storeHirePoolSession
} from '../backend/src/local-integrations/hirepool-session-store.js';
import { SharedStateRateLimitStore } from '../backend/src/middleware/security.js';
import { setAIProvider } from '../backend/src/providers/factory.js';
import { createApp } from '../backend/src/app.js';

/** In-process stand-in for the Upstash REST API (GET/SET PX NX/DEL/INCR/DECR/PTTL/PEXPIRE). */
function fakeUpstash() {
  const data = new Map();
  let calls = 0;
  const live = key => {
    const item = data.get(key);
    if (item && item.expiresAt !== null && item.expiresAt <= Date.now()) {
      data.delete(key);
      return null;
    }
    return item || null;
  };
  const run = ([cmd, key, ...rest]) => {
    switch (cmd) {
      case 'GET': return live(key)?.value ?? null;
      case 'SET': {
        const px = rest.indexOf('PX');
        const nx = rest.includes('NX');
        if (nx && live(key)) return null;
        data.set(key, { value: rest[0], expiresAt: px >= 0 ? Date.now() + Number(rest[px + 1]) : null });
        return 'OK';
      }
      case 'DEL': return data.delete(key) ? 1 : 0;
      case 'INCR':
      case 'DECR': {
        const item = live(key) || { value: '0', expiresAt: null };
        item.value = String(Number(item.value) + (cmd === 'INCR' ? 1 : -1));
        data.set(key, item);
        return Number(item.value);
      }
      case 'PTTL': {
        const item = live(key);
        if (!item) return -2;
        return item.expiresAt === null ? -1 : item.expiresAt - Date.now();
      }
      case 'PEXPIRE': {
        const item = live(key);
        if (!item) return 0;
        item.expiresAt = Date.now() + Number(rest[0]);
        return 1;
      }
      default: throw new Error(`unsupported ${cmd}`);
    }
  };
  const fetchImpl = async (url, init) => {
    calls++;
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    const body = JSON.parse(init.body);
    const payload = url.endsWith('/pipeline') ? body.map(c => ({ result: run(c) })) : { result: run(body) };
    return { ok: true, status: 200, json: async () => payload };
  };
  return { data, fetchImpl, calls: () => calls };
}

function sharedStore() {
  const upstash = fakeUpstash();
  const store = new RedisStateStore({
    client: new RedisRestClient({ url: 'https://redis.example', token: 'test-token', fetchImpl: upstash.fetchImpl }),
    key: randomBytes(32)
  });
  return { store, upstash };
}

test.afterEach(() => setStateStore(null));

test('Redis values are encrypted, tamper-checked, and expire', async () => {
  const { store, upstash } = sharedStore();
  await store.setJson('demo', 'a', { accessToken: 'secret-access-token', n: 1 }, 60_000);
  const raw = [...upstash.data.values()][0].value;
  assert.doesNotMatch(raw, /secret-access-token/);
  assert.deepEqual(await store.getJson('demo', 'a'), { accessToken: 'secret-access-token', n: 1 });

  const [key, item] = [...upstash.data.entries()][0];
  upstash.data.set(key, { ...item, value: `${item.value.slice(0, -4)}AAAA` });
  assert.equal(await store.getJson('demo', 'a'), null, 'tampered records are ignored');

  assert.equal(await store.setJsonIfAbsent('claim', 'x', { state: 'executing' }, 60_000), true);
  assert.equal(await store.setJsonIfAbsent('claim', 'x', { state: 'executing' }, 60_000), false, 'only one instance can claim a write');
});

test('Redis needs an encryption key and is not used half-configured', () => {
  setStateStore(null);
  assert.throws(
    () => getStateStore({ UPSTASH_REDIS_REST_URL: 'https://r.example', UPSTASH_REDIS_REST_TOKEN: 't' }),
    /STATE_ENCRYPTION_KEY/
  );
  setStateStore(null);
  assert.throws(
    () => getStateStore({ UPSTASH_REDIS_REST_URL: 'https://r.example', UPSTASH_REDIS_REST_TOKEN: 't', STATE_ENCRYPTION_KEY: 'c2hvcnQ=' }),
    /32 random bytes/
  );
  setStateStore(null);
  assert.equal(getStateStore({}).shared, false);
});

test('an SDK login created on one instance works on another', async () => {
  const { store, upstash } = sharedStore();
  setStateStore(store);
  const session = await runWithStateScope(() =>
    storeHirePoolSession('hirepool-access-token-1', { id: 'u-1', email: 'u1@example.test', userType: 'candidate', organizationRole: null })
  );
  for (const { value } of upstash.data.values()) {
    assert.doesNotMatch(value, /hirepool-access-token-1|u1@example/);
  }
  assert.ok(![...upstash.data.keys()].some(k => k.includes(session.credential)), 'raw credential is never a key');

  _resetHirePoolSessionMemory(); // a different instance
  assert.equal(findHirePoolContextBySdkCredential(session.credential), null);
  const context = await hydrateHirePoolSessionByCredential(session.credential);
  assert.equal(context.identity.id, 'u-1');
  assert.equal(context.accessToken, 'hirepool-access-token-1');
  assert.equal(findHirePoolContextBySdkCredential(session.credential).credential, session.credential);

  assert.equal(await hydrateHirePoolSessionByCredential('not-a-real-credential-value'), null);
});

test('conversations follow the user across instances and logout clears them everywhere', async () => {
  const { store } = sharedStore();
  setStateStore(store);
  const options = { userId: 'user-77', applicationId: null };
  await runWithStateScope(() => {
    const s = sessionManager.getOrCreate('conv-shared-0001', 'default', options);
    sessionManager.addMessage(s.id, 'user', 'Hello there', options);
    s.hirePoolWorkflow = { stage: 'shortlist' };
  });

  sessionManager.sessions.clear();
  const restored = await sessionManager.hydrate('conv-shared-0001');
  assert.equal(restored.messages.length, 1);
  assert.equal(restored.hirePoolWorkflow.stage, 'shortlist', 'direct changes to the session are saved too');
  assert.throws(() => sessionManager.getOrCreate('conv-shared-0001', 'default', { userId: 'someone-else' }), /Access denied/);

  await runWithStateScope(() => sessionManager.destroyByUser('user-77'));
  sessionManager.sessions.clear();
  assert.equal(await sessionManager.hydrate('conv-shared-0001'), null);
});

test('rate limits are counted across instances', async () => {
  const { store } = sharedStore();
  setStateStore(store);
  const a = new SharedStateRateLimitStore(60_000);
  const b = new SharedStateRateLimitStore(60_000);
  assert.equal((await a.increment('203.0.113.9')).totalHits, 1);
  assert.equal((await b.increment('203.0.113.9')).totalHits, 2);
  const third = await a.increment('203.0.113.9');
  assert.equal(third.totalHits, 3);
  assert.ok(third.resetTime instanceof Date && third.resetTime.getTime() > Date.now());
  await b.resetKey('203.0.113.9');
  assert.equal((await a.increment('203.0.113.9')).totalHits, 1);
});

test('chat history survives a request landing on a fresh instance', async () => {
  process.env.NODE_ENV = 'development';
  const { store } = sharedStore();
  setStateStore(store);
  const seen = [];
  setAIProvider({
    name: 'shared-state-provider',
    async checkHealth() { return { available: true, model: 'test' }; },
    async chat({ messages }) {
      seen.push(messages.length);
      return { text: 'Noted.', model: 'test', finishReason: 'stop' };
    }
  });
  const app = createApp();
  const first = await request(app).post('/api/chat').send({ assistantId: 'default', message: 'My name is Asha.' }).expect(200);
  sessionManager.sessions.clear(); // next request handled by another instance
  await request(app)
    .post('/api/chat')
    .send({ assistantId: 'default', message: 'What is my name?', conversationId: first.body.conversationId })
    .expect(200);
  assert.ok(seen[1] > seen[0], `second turn should include earlier messages (${seen.join(' -> ')})`);
});

test('without Redis nothing is written anywhere', async () => {
  const memory = new MemoryStateStore();
  setStateStore(memory);
  await runWithStateScope(() => sessionManager.getOrCreate('conv-local-0001', 'default', {}));
  assert.equal(memory.records.size, 0);
});
