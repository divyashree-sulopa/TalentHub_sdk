/**
 * Shared state for serverless deployments (Vercel + Redis).
 *
 * The existing stores (conversations, SDK logins, confirmations, signup
 * progress) keep working synchronously on in-memory Maps. When Redis is
 * configured, each request first loads the records it needs ("hydrate") and
 * saves what changed before the response finishes ("flush"). Without Redis,
 * nothing is loaded or saved and behaviour is exactly the in-memory one.
 *
 * Every value is encrypted (AES-256-GCM) before it leaves the process, because
 * records include HirePool access tokens and conversation text. Keys never
 * contain raw credentials or tokens, only SHA-256 digests or random IDs.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { RedisRestClient, getRedisRestConfig } from './redis-rest.js';

const KEY_PREFIX = 'hpa:v1:';
const FLUSH_TIMEOUT_MS = 4000;

function isProduction(env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

function loadEncryptionKey(env) {
  const raw = env.STATE_ENCRYPTION_KEY || '';
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('STATE_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (e.g. `openssl rand -base64 32`)');
  }
  return key;
}

export function encryptJson(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`;
}

export function decryptJson(text, key) {
  const [version, iv, tag, body] = String(text).split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unsupported state record format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

export function stateDigest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

/** Redis-backed store. */
export class RedisStateStore {
  constructor({ client, key }) {
    this.client = client;
    this.key = key;
    this.shared = true;
  }

  _k(namespace, id) {
    return `${KEY_PREFIX}${namespace}:${id}`;
  }

  async getJson(namespace, id) {
    const raw = await this.client.command(['GET', this._k(namespace, id)]);
    if (raw === null || raw === undefined) return null;
    try {
      return decryptJson(raw, this.key);
    } catch {
      // Tampered, corrupt, or encrypted with a rotated key: treat as missing.
      return null;
    }
  }

  async setJson(namespace, id, value, ttlMs) {
    const ttl = Math.max(1000, Math.round(ttlMs));
    await this.client.command(['SET', this._k(namespace, id), encryptJson(value, this.key), 'PX', ttl]);
  }

  /** Set only if absent; returns true when this call created the record. */
  async setJsonIfAbsent(namespace, id, value, ttlMs) {
    const ttl = Math.max(1000, Math.round(ttlMs));
    const result = await this.client.command(['SET', this._k(namespace, id), encryptJson(value, this.key), 'PX', ttl, 'NX']);
    return result === 'OK';
  }

  async delete(namespace, id) {
    await this.client.command(['DEL', this._k(namespace, id)]);
  }

  /** Fixed-window counter; returns { count, resetAt }. */
  async increment(namespace, id, windowMs) {
    const key = this._k(namespace, id);
    const [count, ttl] = await this.client.pipeline([
      ['INCR', key],
      ['PTTL', key]
    ]);
    let remaining = Number(ttl);
    if (!(remaining > 0)) {
      await this.client.command(['PEXPIRE', key, windowMs]);
      remaining = windowMs;
    }
    return { count: Number(count), resetAt: Date.now() + remaining };
  }

  async decrement(namespace, id) {
    await this.client.command(['DECR', this._k(namespace, id)]);
  }

  async resetKey(namespace, id) {
    await this.delete(namespace, id);
  }
}

/** Process-local fallback used when Redis is not configured. Nothing is shared. */
export class MemoryStateStore {
  constructor() {
    this.shared = false;
    this.records = new Map();
  }

  _live(k) {
    const record = this.records.get(k);
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      this.records.delete(k);
      return null;
    }
    return record;
  }

  async getJson(namespace, id) {
    const record = this._live(`${namespace}:${id}`);
    return record ? structuredClone(record.value) : null;
  }

  async setJson(namespace, id, value, ttlMs) {
    this.records.set(`${namespace}:${id}`, { value: structuredClone(value), expiresAt: Date.now() + ttlMs });
  }

  async setJsonIfAbsent(namespace, id, value, ttlMs) {
    if (this._live(`${namespace}:${id}`)) return false;
    await this.setJson(namespace, id, value, ttlMs);
    return true;
  }

  async delete(namespace, id) {
    this.records.delete(`${namespace}:${id}`);
  }

  async increment(namespace, id, windowMs) {
    const k = `${namespace}:${id}`;
    const record = this._live(k) || { value: 0, expiresAt: Date.now() + windowMs };
    record.value += 1;
    this.records.set(k, record);
    return { count: record.value, resetAt: record.expiresAt };
  }

  async decrement(namespace, id) {
    const record = this._live(`${namespace}:${id}`);
    if (record) record.value = Math.max(0, record.value - 1);
  }

  async resetKey(namespace, id) {
    this.records.delete(`${namespace}:${id}`);
  }
}

let activeStore = null;

/**
 * The configured store. Redis needs both its REST credentials and
 * STATE_ENCRYPTION_KEY; partial configuration is an error, not a silent fallback.
 */
export function getStateStore(env = process.env) {
  if (activeStore) return activeStore;
  const redis = getRedisRestConfig(env);
  const key = loadEncryptionKey(env);
  if (redis && !key) {
    throw new Error('STATE_ENCRYPTION_KEY is required when Redis is configured');
  }
  activeStore = redis
    ? new RedisStateStore({ client: new RedisRestClient(redis), key })
    : new MemoryStateStore();
  return activeStore;
}

/** For tests. */
export function setStateStore(store) {
  activeStore = store;
}

export function isSharedStateConfigured(env = process.env) {
  try {
    return getStateStore(env).shared === true;
  } catch {
    return false;
  }
}

/**
 * Production on more than one instance needs shared state. Returns a reason
 * string when the deployment is not safe to serve HirePool account features.
 */
export function getSharedStateProblem(env = process.env) {
  if (!isProduction(env)) return null;
  try {
    return getStateStore(env).shared ? null : 'Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN and STATE_ENCRYPTION_KEY)';
  } catch (error) {
    return error.message;
  }
}

// ---------------------------------------------------------------------------
// Shared map: a Map whose entries are saved to Redis when a request touches them
// ---------------------------------------------------------------------------

/**
 * Drop-in for `new Map()` holding plain-data records with an `expiresAt` field.
 * Reads stay synchronous; call `hydrate(key)` before handling a request.
 * Keys are stored only as SHA-256 digests.
 */
export class SharedRecordMap extends Map {
  constructor(namespace) {
    super();
    this.namespace = namespace;
    this.touchedBucket = `map:${namespace}`;
    this.deletedBucket = `map:${namespace}:deleted`;
    registerStateFlushHandler(scope => this._flush(scope));
  }

  get(key) {
    const value = super.get(key);
    if (value) markStateTouched(this.touchedBucket, key);
    return value;
  }

  set(key, value) {
    markStateTouched(this.touchedBucket, key);
    return super.set(key, value);
  }

  delete(key) {
    markStateTouched(this.deletedBucket, key);
    return super.delete(key);
  }

  async hydrate(key) {
    if (typeof key !== 'string' || !key || key.length > 512 || super.has(key)) return;
    const store = getStateStore();
    if (!store.shared) return;
    const record = await store.getJson(this.namespace, stateDigest(key));
    if (record && record.expiresAt > Date.now()) super.set(key, record);
  }

  async _flush(scope) {
    const touched = scope.get(this.touchedBucket);
    const deleted = scope.get(this.deletedBucket);
    if (!touched?.size && !deleted?.size) return;
    const store = getStateStore();
    const now = Date.now();
    const writes = [];
    for (const key of touched || []) {
      const value = super.get(key);
      if (value && value.expiresAt > now) {
        writes.push(store.setJson(this.namespace, stateDigest(key), value, value.expiresAt - now));
      }
    }
    for (const key of deleted || []) {
      if (!super.has(key)) writes.push(store.delete(this.namespace, stateDigest(key)));
    }
    await Promise.all(writes);
  }
}

// ---------------------------------------------------------------------------
// Request-scoped persistence
// ---------------------------------------------------------------------------

const requestScope = new AsyncLocalStorage();
const flushHandlers = [];

/**
 * Register a function that saves the records a request touched.
 * @param {(scope: Map<string, any>) => Promise<void>} handler
 */
export function registerStateFlushHandler(handler) {
  flushHandlers.push(handler);
}

/** Per-request bag that stores use to remember what they touched. */
export function getRequestStateScope() {
  return requestScope.getStore() || null;
}

/** Remember that this request touched `id` in `bucket` so it is saved at the end. */
export function markStateTouched(bucket, id) {
  const scope = requestScope.getStore();
  if (!scope || id === undefined || id === null) return;
  if (!scope.has(bucket)) scope.set(bucket, new Set());
  scope.get(bucket).add(id);
}

async function flushScope(scope) {
  if (!scope || scope.size === 0) return;
  const work = Promise.allSettled(flushHandlers.map(handler => handler(scope)));
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);
  });
  try {
    const results = await Promise.race([work, timeout]);
    if (Array.isArray(results)) {
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('[State] Could not save request state:', result.reason?.message || result.reason);
        }
      }
    } else {
      console.error('[State] Saving request state timed out');
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Express middleware: runs the request inside a state scope and, when shared
 * state is enabled, saves touched records before the response finishes
 * (serverless functions may be frozen right after the response is sent).
 */
export function stateScopeMiddleware() {
  return (req, res, next) => {
    const scope = new Map();
    if (getStateStore().shared) {
      const originalEnd = res.end.bind(res);
      let ending = false;
      res.end = function patchedEnd(...args) {
        if (ending) return originalEnd(...args);
        ending = true;
        flushScope(scope).finally(() => originalEnd(...args));
        return res;
      };
    }
    requestScope.run(scope, next);
  };
}

/**
 * Run work outside an HTTP request (scripts, tests) with the same
 * load/save behaviour, saving touched records when it finishes.
 */
export async function runWithStateScope(fn) {
  const scope = new Map();
  const result = await requestScope.run(scope, fn);
  if (getStateStore().shared) await flushScope(scope);
  return result;
}

/** Save now (used by long-lived streams that write state mid-response). */
export async function flushRequestState() {
  if (!getStateStore().shared) return;
  await flushScope(requestScope.getStore());
}
