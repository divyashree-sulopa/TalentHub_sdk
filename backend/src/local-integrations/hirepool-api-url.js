/**
 * Where the HirePool API lives, from settings (no hard-coded addresses).
 *
 * - `HIREPOOL_API_BASE_URL` (or the older `HIREPOOL_LOCAL_API_BASE_URL`),
 *   default `http://localhost:8000/` for local development.
 * - HTTPS for any host; plain HTTP only for localhost / 127.0.0.1.
 * - Local addresses are reached over loopback (127.0.0.1) with the original
 *   `Host` header, exactly as before; remote HTTPS addresses are called as-is.
 */

const DEFAULT_API_BASE_URL = 'http://localhost:8000/';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {URL}
 */
export function getHirePoolApiBaseUrl(env = process.env) {
  const raw = env.HIREPOOL_API_BASE_URL || env.HIREPOOL_LOCAL_API_BASE_URL || DEFAULT_API_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('HIREPOOL_API_BASE_URL must be a valid URL, e.g. https://api.hirepool.ai/');
  }
  const local = LOOPBACK_HOSTS.has(url.hostname);
  if (
    !(url.protocol === 'https:' || (url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('HIREPOOL_API_BASE_URL must be an HTTPS origin (plain HTTP only for localhost)');
  }
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url;
}

function isProductionEnvironment(env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

/**
 * Production may connect to HirePool only with an explicit opt-in
 * (ENABLE_HIREPOOL_PRODUCTION_CONNECTION=true) and an HTTPS, non-local API.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isHirePoolProductionConnectionAllowed(env = process.env) {
  if (env.ENABLE_HIREPOOL_PRODUCTION_CONNECTION !== 'true') return false;
  try {
    const url = getHirePoolApiBaseUrl(env);
    return url.protocol === 'https:' && !LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Where the HirePool connection may run: local development / tests (as before),
 * or production with the explicit opt-in above.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isHirePoolConnectionEnvironmentAllowed(env = process.env) {
  const localDevelopment = (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') &&
    env.VERCEL_ENV !== 'production';
  if (localDevelopment) return true;
  return isProductionEnvironment(env) && isHirePoolProductionConnectionAllowed(env);
}

/** True when the configured API is on this machine. */
export function isLocalHirePoolApi(env = process.env) {
  return LOOPBACK_HOSTS.has(getHirePoolApiBaseUrl(env).hostname);
}

/** Host name of the configured API (for allowed-host lists). */
export function getHirePoolApiHostname(env = process.env) {
  return getHirePoolApiBaseUrl(env).hostname;
}

/** The HirePool OpenAPI document address. */
export function getHirePoolOpenApiUrl(env = process.env) {
  const configured = env.HIREPOOL_OPENAPI_URL || env.HIREPOOL_LOCAL_OPENAPI_URL;
  return configured || new URL('api/openapi.json', getHirePoolApiBaseUrl(env)).href;
}

/**
 * The URL and extra headers for one HirePool API call.
 * @param {string|URL} pathOrUrl a path such as 'api/v1/auth/me', or a full URL on the API
 * @param {{ env?: NodeJS.ProcessEnv, baseUrl?: string|URL }} [options]
 * @returns {{ url: URL, headers: Record<string, string> }}
 */
export function hirePoolApiTarget(pathOrUrl, { env = process.env, baseUrl = null } = {}) {
  const base = baseUrl ? new URL(String(baseUrl)) : getHirePoolApiBaseUrl(env);
  const url = new URL(String(pathOrUrl), base);
  if (LOOPBACK_HOSTS.has(url.hostname)) {
    // Local API: talk to loopback directly and keep the Host the API expects.
    const host = url.host.replace(/^127\.0\.0\.1/, 'localhost');
    url.hostname = '127.0.0.1';
    return { url, headers: { Host: host } };
  }
  return { url, headers: {} };
}
