/**
 * Production readiness: the HirePool connection (off unless explicitly enabled
 * with an HTTPS API), production verification links (/verify-email), and the
 * 4 MB upload limit. Runs in its own process, so production settings here do
 * not affect other test files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  isHirePoolConnectionEnvironmentAllowed,
  isHirePoolProductionConnectionAllowed
} from '../backend/src/local-integrations/hirepool-api-url.js';
import { isHirePoolLocalBridgeEnabled } from '../backend/src/local-integrations/hirepool-auth.js';
import { isDynamicApiDiscoveryEnabled } from '../backend/src/dynamic-api/catalog.js';
import { extractSafeVerificationUrl } from '../backend/src/routes/hirepool-signup.js';
import { isSafeVerificationUrl } from '../widget/src/hirepool-signup.js';
import { DEFAULT_DOCUMENT_UPLOAD_SETTINGS, normalizeDocumentUploadSettings } from '../config/document-upload.js';
import { HIREPOOL_RESUME_MAX_BYTES, validateHirePoolResumeFile } from '../widget/src/hirepool-resume.js';

const FLAGS = { ENABLE_HIREPOOL_LOCAL_BRIDGE: 'true', DYNAMIC_API_DISCOVERY_ENABLED: 'true' };
const PROD = { ...FLAGS, NODE_ENV: 'production', VERCEL_ENV: 'production' };

test('connection: unchanged in development, off in production unless explicitly enabled with HTTPS', () => {
  // Development / tests: as before.
  assert.equal(isHirePoolLocalBridgeEnabled({ ...FLAGS, NODE_ENV: 'development' }), true);
  assert.equal(isHirePoolLocalBridgeEnabled({ ...FLAGS, NODE_ENV: 'test' }), true);
  assert.equal(isHirePoolLocalBridgeEnabled({ NODE_ENV: 'development' }), false, 'flags still required');

  // Production: off by default, even with the old flags.
  assert.equal(isHirePoolLocalBridgeEnabled(PROD), false);
  assert.equal(isDynamicApiDiscoveryEnabled(PROD), false);
  // Opt-in without an HTTPS API address: still off.
  assert.equal(isHirePoolLocalBridgeEnabled({ ...PROD, ENABLE_HIREPOOL_PRODUCTION_CONNECTION: 'true' }), false);
  assert.equal(isHirePoolProductionConnectionAllowed({ ENABLE_HIREPOOL_PRODUCTION_CONNECTION: 'true', HIREPOOL_API_BASE_URL: 'http://localhost:8000/' }), false);
  // Opt-in + HTTPS API: on.
  const on = { ...PROD, ENABLE_HIREPOOL_PRODUCTION_CONNECTION: 'true', HIREPOOL_API_BASE_URL: 'https://api.hirepool.ai/' };
  assert.equal(isHirePoolLocalBridgeEnabled(on), true);
  assert.equal(isDynamicApiDiscoveryEnabled(on), true);
  assert.equal(isHirePoolConnectionEnvironmentAllowed(on), true);
  // An HTTPS address alone (no opt-in) is not enough.
  assert.equal(isHirePoolLocalBridgeEnabled({ ...PROD, HIREPOOL_API_BASE_URL: 'https://api.hirepool.ai/' }), false);
});

test('verification links: /verify-email (production) and /auth/verify-email (local) are accepted', () => {
  const env = { HIREPOOL_APP_ORIGINS: 'https://app.hirepool.ai' };
  assert.equal(extractSafeVerificationUrl('https://app.hirepool.ai/verify-email?token=abc', env), 'https://app.hirepool.ai/verify-email?token=abc');
  assert.equal(extractSafeVerificationUrl('http://localhost:5173/auth/verify-email?token=abc', env), 'http://localhost:5173/auth/verify-email?token=abc');
  // Not configured -> production links still hidden.
  assert.equal(extractSafeVerificationUrl('https://app.hirepool.ai/verify-email?token=abc', {}), null);
  for (const bad of [
    'https://app.hirepool.ai/verify-email-now?token=abc',
    'https://app.hirepool.ai/dashboard?token=abc',
    'https://app.hirepool.ai/verify-email',
    'https://evil.example.test/verify-email?token=abc'
  ]) {
    assert.equal(extractSafeVerificationUrl(bad, env), null, bad);
    assert.equal(isSafeVerificationUrl(bad, ['https://app.hirepool.ai']), false, bad);
  }
  // Widget: trusts the configured app origin it is given.
  assert.equal(isSafeVerificationUrl('https://app.hirepool.ai/verify-email?token=abc', ['https://app.hirepool.ai']), true);
  assert.equal(isSafeVerificationUrl('https://app.hirepool.ai/verify-email?token=abc'), false);
  assert.equal(isSafeVerificationUrl('http://localhost:5173/auth/verify-email?token=abc'), true);
});

test('uploads: 4 MB limit for documents and resumes (fits Vercel)', () => {
  assert.equal(DEFAULT_DOCUMENT_UPLOAD_SETTINGS.maxSizeBytes, 4 * 1024 * 1024);
  assert.throws(() => normalizeDocumentUploadSettings({ maxSizeBytes: 5 * 1024 * 1024 }), /4194304/);
  assert.equal(normalizeDocumentUploadSettings({}).maxSizeBytes, 4 * 1024 * 1024);
  assert.equal(HIREPOOL_RESUME_MAX_BYTES, 4 * 1024 * 1024);
  assert.match(validateHirePoolResumeFile({ name: 'cv.pdf', type: 'application/pdf', size: HIREPOOL_RESUME_MAX_BYTES + 1 }), /4 MB/);
});

test('production app: with the opt-in, HirePool routes are on and use https://api.hirepool.ai', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    AUTH_MODE: 'jwt',
    JWT_SECRET: 'prod-connection-test-secret-0123456789',
    ENABLE_HIREPOOL_LOCAL_BRIDGE: 'true',
    DYNAMIC_API_DISCOVERY_ENABLED: 'true',
    ENABLE_HIREPOOL_PRODUCTION_CONNECTION: 'true',
    HIREPOOL_API_BASE_URL: 'https://api.hirepool.ai/',
    API_DISCOVERY_ALLOWED_HOSTS: 'api.hirepool.ai',
    HIREPOOL_WEBSITE_ORIGINS: 'https://hirepool.ai',
    HIREPOOL_APP_ORIGINS: 'https://app.hirepool.ai',
    HIREPOOL_LOCAL_ALLOWED_ORIGINS: 'https://hirepool.ai,https://app.hirepool.ai',
    CORS_ALLOWED_ORIGINS: 'https://hirepool.ai,https://app.hirepool.ai',
    RATE_LIMIT_MAX_REQUESTS: '100000'
  });
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, headers: init.headers || {} });
    if (target === 'https://api.hirepool.ai/api/v1/auth/me') {
      return new Response(JSON.stringify({ id: 'u-1', email: 'asha@example.test', user_type: 'candidate', is_active: true, is_verified: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (target.startsWith('https://api.hirepool.ai/api/v1/agreements/current')) {
      return new Response(JSON.stringify({ id: 'agr-1', version: '1', content: 'Terms', role: 'candidate' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { createApp } = await import('../backend/src/app.js');
    const app = createApp();

    // Dashboard: assistant login checks the user with the real API address.
    const session = await request(app).post('/api/hirepool/session')
      .set('Origin', 'https://app.hirepool.ai')
      .set('Authorization', 'Bearer app-access-token');
    assert.equal(session.status, 200, JSON.stringify(session.body));
    assert.ok(session.body.credential);
    const me = calls.find(c => c.url === 'https://api.hirepool.ai/api/v1/auth/me');
    assert.ok(me, 'identity checked at https://api.hirepool.ai');
    assert.equal(me.headers.Host, undefined, 'no localhost Host header');

    // Website: signup talks to the real API.
    const agreement = await request(app).get('/api/hirepool/signup/agreement?role=candidate').set('Origin', 'https://hirepool.ai');
    assert.equal(agreement.status, 200, JSON.stringify(agreement.body));
    assert.ok(calls.some(c => c.url === 'https://api.hirepool.ai/api/v1/agreements/current?role=candidate'));

    // Other sites are still refused.
    const evil = await request(app).post('/api/hirepool/session').set('Origin', 'https://evil.example.test').set('Authorization', 'Bearer x');
    assert.ok([401, 403].includes(evil.status), String(evil.status));

  } finally {
    globalThis.fetch = realFetch;
  }
});
