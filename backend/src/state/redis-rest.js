/**
 * Minimal Redis client for Upstash / Vercel KV over their REST API.
 *
 * HTTP works well on Vercel serverless (no TCP connection pooling to manage).
 * Credentials come from UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, or
 * the Vercel KV names KV_REST_API_URL / KV_REST_API_TOKEN.
 */

export class RedisRestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RedisRestError';
    this.status = status;
  }
}

export function getRedisRestConfig(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  if (!url || !token) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('UPSTASH_REDIS_REST_URL must be an absolute URL');
  }
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('UPSTASH_REDIS_REST_URL must use HTTPS');
  }
  return { url: parsed.href.replace(/\/+$/, ''), token };
}

export class RedisRestClient {
  /**
   * @param {{ url: string, token: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
   */
  constructor({ url, token, fetchImpl, timeoutMs = 3000 }) {
    this.url = url;
    this.token = token;
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.timeoutMs = timeoutMs;
  }

  async _post(path, body) {
    let response;
    try {
      response = await this.fetchImpl(`${this.url}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new RedisRestError(`Shared state store is unreachable (${error?.name || 'network error'})`, 503);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {}
    if (!response.ok) {
      // Never echo the request (it can contain encrypted session data) in errors.
      throw new RedisRestError(`Shared state store rejected the request (HTTP ${response.status})`, response.status);
    }
    return payload;
  }

  /** Run one command, e.g. ['SET', 'key', 'value', 'PX', 60000]. */
  async command(args) {
    const payload = await this._post('', args.map(String));
    if (payload?.error) throw new RedisRestError('Shared state store command failed', 500);
    return payload?.result ?? null;
  }

  /** Run several commands in one round trip. */
  async pipeline(commands) {
    const payload = await this._post('/pipeline', commands.map(args => args.map(String)));
    if (!Array.isArray(payload)) throw new RedisRestError('Shared state store returned an invalid pipeline response', 500);
    return payload.map(item => {
      if (item?.error) throw new RedisRestError('Shared state store command failed', 500);
      return item?.result ?? null;
    });
  }
}
