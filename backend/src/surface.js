/**
 * Assistant surfaces: which HirePool bot a request belongs to.
 *
 * - website: the public marketing site (guest only — friendly help, HirePool
 *   questions and signup for every role; never reads or changes an account).
 * - app: the logged-in HirePool application (every account feature).
 * - legacy: requests with no recognised Origin outside production (the demo
 *   page, local tools and tests). Keeps the original combined behaviour.
 *
 * The surface is derived only from the request's Origin header, which browsers
 * set and page scripts cannot change. Nothing the client sends in the body or
 * query can select a surface.
 */

export const ASSISTANT_SURFACES = Object.freeze({
  WEBSITE: 'website',
  APP: 'app',
  LEGACY: 'legacy'
});

const PRODUCTION_WEBSITE_ORIGINS = Object.freeze(['https://hirepool.ai', 'https://www.hirepool.ai']);
const PRODUCTION_APP_ORIGINS = Object.freeze(['https://app.hirepool.ai']);
const LOCAL_WEBSITE_ORIGINS = Object.freeze([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
]);
const LOCAL_APP_ORIGINS = Object.freeze(['http://localhost:5173', 'http://127.0.0.1:5173']);

function isProduction(env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseOriginList(raw, name, env) {
  const origins = String(raw)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const origin = normalizeOrigin(item);
      if (!origin) {
        throw new Error(`${name} must be a comma-separated list of exact origins (got "${item}")`);
      }
      if (isProduction(env) && !origin.startsWith('https://')) {
        throw new Error(`${name} must use HTTPS origins in production (got "${item}")`);
      }
      return origin;
    });
  return Object.freeze([...new Set(origins)]);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ website: readonly string[], app: readonly string[] }}
 */
export function getSurfaceOrigins(env = process.env) {
  const production = isProduction(env);
  const website = env.HIREPOOL_WEBSITE_ORIGINS
    ? parseOriginList(env.HIREPOOL_WEBSITE_ORIGINS, 'HIREPOOL_WEBSITE_ORIGINS', env)
    : Object.freeze([...PRODUCTION_WEBSITE_ORIGINS, ...(production ? [] : LOCAL_WEBSITE_ORIGINS)]);
  const app = env.HIREPOOL_APP_ORIGINS
    ? parseOriginList(env.HIREPOOL_APP_ORIGINS, 'HIREPOOL_APP_ORIGINS', env)
    : Object.freeze([...PRODUCTION_APP_ORIGINS, ...(production ? [] : LOCAL_APP_ORIGINS)]);

  const overlap = website.filter(origin => app.includes(origin));
  if (overlap.length) {
    throw new Error(`An origin cannot be both a website and an app surface: ${overlap.join(', ')}`);
  }
  return { website, app };
}

/**
 * Resolve the assistant surface for a request.
 * @param {{ get?: (name: string) => string | undefined, headers?: object }} req
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'website'|'app'|'legacy'}
 */
export function resolveAssistantSurface(req, env = process.env) {
  const rawOrigin = typeof req?.get === 'function' ? req.get('Origin') : req?.headers?.origin;
  const origin = rawOrigin ? normalizeOrigin(rawOrigin) : null;
  const { website, app } = getSurfaceOrigins(env);
  if (origin && app.includes(origin)) return ASSISTANT_SURFACES.APP;
  if (origin && website.includes(origin)) return ASSISTANT_SURFACES.WEBSITE;
  // Least privilege in production: anything unrecognised is treated as the public website.
  return isProduction(env) ? ASSISTANT_SURFACES.WEBSITE : ASSISTANT_SURFACES.LEGACY;
}

/**
 * True only for an Origin explicitly listed as the HirePool website (never the
 * production "unknown origin" fallback). Website guest access depends on it.
 */
export function isListedWebsiteOrigin(req, env = process.env) {
  const rawOrigin = typeof req?.get === 'function' ? req.get('Origin') : req?.headers?.origin;
  const origin = rawOrigin ? normalizeOrigin(rawOrigin) : null;
  return Boolean(origin && getSurfaceOrigins(env).website.includes(origin));
}

/**
 * The website bot never acts on an account, even if a credential is presented.
 * @param {object|null} user
 * @param {string} surface
 * @param {string} assistantId
 */
export function scopeUserToSurface(user, surface, assistantId) {
  if (assistantId === 'hirepool' && surface === ASSISTANT_SURFACES.WEBSITE) {
    return null;
  }
  return user ?? null;
}

/**
 * Where website visitors are sent to log in to the HirePool app.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getHirePoolAppLoginUrl(env = process.env) {
  // Local-only for now: links point at the local HirePool app unless configured.
  const raw = env.HIREPOOL_APP_LOGIN_URL || 'http://localhost:5173/login';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('HIREPOOL_APP_LOGIN_URL must be an absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('HIREPOOL_APP_LOGIN_URL must be an HTTP(S) URL without credentials');
  }
  if (isProduction(env) && env.HIREPOOL_APP_LOGIN_URL && url.protocol !== 'https:') {
    throw new Error('HIREPOOL_APP_LOGIN_URL must use HTTPS in production');
  }
  return url.href;
}

const APP_HOME_PATHS = Object.freeze({
  candidate: '/candidate/profile',
  client: '/client/dashboard',
  consultancy: '/consultancy/dashboard'
});

/**
 * Where a newly signed-up visitor is sent: their profile (candidates) or
 * dashboard (companies, agencies) in the HirePool app. If they are not signed
 * in there yet, the app shows its login page first and then their dashboard.
 * Local-only for now: same origin as the app login link.
 * @param {'candidate'|'client'|'consultancy'} role
 */
export function getHirePoolAppHomeUrl(role, env = process.env) {
  const base = new URL(getHirePoolAppLoginUrl(env));
  return new URL(APP_HOME_PATHS[role] || '/', base.origin).href;
}

/** Whether the guest login/signup account actions are offered on this surface. */
export function surfaceAllowsGuestAccountActions(surface) {
  return surface !== ASSISTANT_SURFACES.APP;
}

/** Whether in-chat signup is available on this surface. */
export function surfaceAllowsSignup(surface) {
  return surface !== ASSISTANT_SURFACES.APP;
}
