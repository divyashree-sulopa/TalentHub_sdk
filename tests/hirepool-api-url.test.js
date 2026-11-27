import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {
  getHirePoolApiBaseUrl,
  getHirePoolApiHostname,
  getHirePoolOpenApiUrl,
  hirePoolApiTarget,
  isLocalHirePoolApi
} from '../backend/src/local-integrations/hirepool-api-url.js';
import { getConfiguredSurfaceOrigins } from '../backend/src/surface.js';
import { formatClientApplicationsList } from '../backend/src/routes/chat.js';
import { getHirePoolAccountUrl, HIREPOOL_SIGNUP_ACTION } from '../widget/src/hirepool-login.js';
import { searchPublicHirePoolJobs, _clearPublicJobCache } from '../integrations/hirepool/public-jobs.js';
import { createHirePoolSignupRouter } from '../backend/src/routes/hirepool-signup.js';

test('default: the local HirePool API, reached over loopback with the local Host header', () => {
  const env = {};
  assert.equal(getHirePoolApiBaseUrl(env).href, 'http://localhost:8000/');
  assert.equal(isLocalHirePoolApi(env), true);
  assert.equal(getHirePoolApiHostname(env), 'localhost');
  assert.equal(getHirePoolOpenApiUrl(env), 'http://localhost:8000/api/openapi.json');
  const target = hirePoolApiTarget('api/v1/auth/me', { env });
  assert.equal(target.url.href, 'http://127.0.0.1:8000/api/v1/auth/me');
  assert.deepEqual(target.headers, { Host: 'localhost:8000' });
  // An explicit loopback base keeps the same Host header.
  assert.deepEqual(hirePoolApiTarget('api/v1/auth/refresh', { baseUrl: 'http://127.0.0.1:8000' }).headers, { Host: 'localhost:8000' });
  // The older setting name still works.
  assert.equal(getHirePoolApiBaseUrl({ HIREPOOL_LOCAL_API_BASE_URL: 'http://localhost:9000/' }).href, 'http://localhost:9000/');
});

test('configured HTTPS API (e.g. https://api.hirepool.ai) is called directly', () => {
  const env = { HIREPOOL_API_BASE_URL: 'https://api.hirepool.ai' };
  assert.equal(getHirePoolApiBaseUrl(env).href, 'https://api.hirepool.ai/');
  assert.equal(isLocalHirePoolApi(env), false);
  assert.equal(getHirePoolApiHostname(env), 'api.hirepool.ai');
  assert.equal(getHirePoolOpenApiUrl(env), 'https://api.hirepool.ai/api/openapi.json');
  assert.equal(getHirePoolOpenApiUrl({ ...env, HIREPOOL_OPENAPI_URL: 'https://docs.example.test/openapi.json' }), 'https://docs.example.test/openapi.json');
  const target = hirePoolApiTarget('api/v1/auth/me', { env });
  assert.equal(target.url.href, 'https://api.hirepool.ai/api/v1/auth/me');
  assert.deepEqual(target.headers, {}, 'no Host override for a real API');
  assert.equal(getHirePoolApiBaseUrl({ HIREPOOL_API_BASE_URL: 'https://api.dev.hirepool.ai/' }).hostname, 'api.dev.hirepool.ai');
});

test('unsafe API addresses are refused', () => {
  for (const bad of ['http://api.hirepool.ai/', 'ftp://api.hirepool.ai/', 'https://user:pw@api.hirepool.ai/', 'https://api.hirepool.ai/?x=1', 'not a url']) {
    assert.throws(() => getHirePoolApiBaseUrl({ HIREPOOL_API_BASE_URL: bad }), /HIREPOOL_API_BASE_URL/, bad);
  }
});

test('configured website / app origins are available to origin checks; none by default', () => {
  assert.deepEqual(getConfiguredSurfaceOrigins({}), { website: [], app: [] });
  const origins = getConfiguredSurfaceOrigins({ HIREPOOL_WEBSITE_ORIGINS: 'https://hirepool.ai', HIREPOOL_APP_ORIGINS: 'https://app.hirepool.ai' });
  assert.deepEqual([...origins.website], ['https://hirepool.ai']);
  assert.deepEqual([...origins.app], ['https://app.hirepool.ai']);
});

test('app links in chat replies follow HIREPOOL_APP_LOGIN_URL (localhost by default)', () => {
  const previous = process.env.HIREPOOL_APP_LOGIN_URL;
  try {
    delete process.env.HIREPOOL_APP_LOGIN_URL;
    assert.match(formatClientApplicationsList([]), /http:\/\/localhost:5173\/client\/applications/);
    process.env.HIREPOOL_APP_LOGIN_URL = 'https://app.hirepool.ai/login';
    assert.match(formatClientApplicationsList([]), /https:\/\/app\.hirepool\.ai\/client\/applications/);
    assert.match(formatClientApplicationsList([{ candidate_name: 'A', job_title: 'Dev' }]), /\(https:\/\/app\.hirepool\.ai\/client\/applications\)/);
  } finally {
    if (previous === undefined) delete process.env.HIREPOOL_APP_LOGIN_URL;
    else process.env.HIREPOOL_APP_LOGIN_URL = previous;
  }
});

test('website login / signup links use the configured app address', () => {
  assert.equal(getHirePoolAccountUrl('http://localhost:3000/'), 'http://localhost:5173/login?assistant_origin=http%3A%2F%2Flocalhost%3A3000');
  assert.equal(
    getHirePoolAccountUrl('http://localhost:3000/', HIREPOOL_SIGNUP_ACTION, 'https://app.hirepool.ai/login'),
    'https://app.hirepool.ai/register?assistant_origin=http%3A%2F%2Flocalhost%3A3000'
  );
  assert.match(getHirePoolAccountUrl('http://localhost:3000/', undefined, 'javascript:alert(1)'), /^http:\/\/localhost:5173\/login/, 'unsafe value falls back');
});

test('website job search calls the configured API address', async () => {
  _clearPublicJobCache();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers });
    return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await searchPublicHirePoolJobs({ query: 'React' }, { fetchImpl, env: { HIREPOOL_API_BASE_URL: 'https://api.hirepool.ai/' } });
  assert.match(calls[0].url, /^https:\/\/api\.hirepool\.ai\/api\/v1\/public\/jobs\?/);
  assert.equal(calls[0].headers.Host, undefined);
  _clearPublicJobCache();
  await searchPublicHirePoolJobs({ query: 'Java' }, { fetchImpl, env: {} });
  assert.match(calls[1].url, /^http:\/\/127\.0\.0\.1:8000\/api\/v1\/public\/jobs\?/);
  assert.equal(calls[1].headers.Host, 'localhost:8000');
});

test('signup calls the configured API and accepts a configured website origin', async () => {
  const saved = { api: process.env.HIREPOOL_API_BASE_URL, site: process.env.HIREPOOL_WEBSITE_ORIGINS };
  process.env.HIREPOOL_API_BASE_URL = 'https://api.hirepool.ai/';
  process.env.HIREPOOL_WEBSITE_ORIGINS = 'https://hirepool.ai';
  try {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers || {} });
      return new Response(JSON.stringify({ id: 'agr-1', version: '1', content: 'Terms', role: 'candidate' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const app = express();
    app.use(express.json());
    app.use('/signup', createHirePoolSignupRouter({ fetchImpl }));
    const res = await request(app).get('/signup/agreement?role=candidate').set('Origin', 'https://hirepool.ai');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(calls[0].url, 'https://api.hirepool.ai/api/v1/agreements/current?role=candidate');
    assert.equal(calls[0].headers.Host, undefined, 'no localhost Host header for the real API');
    const other = await request(app).get('/signup/agreement?role=candidate').set('Origin', 'https://evil.example.test');
    assert.equal(other.status, 403);
  } finally {
    if (saved.api === undefined) delete process.env.HIREPOOL_API_BASE_URL; else process.env.HIREPOOL_API_BASE_URL = saved.api;
    if (saved.site === undefined) delete process.env.HIREPOOL_WEBSITE_ORIGINS; else process.env.HIREPOOL_WEBSITE_ORIGINS = saved.site;
  }
});

test('signup User Agreement label shows the version even when the API sends a number', async () => {
  const { getAgreementLinkLabel, formatAgreementVersion } = await import('../widget/src/hirepool-signup.js');
  assert.equal(getAgreementLinkLabel({ version: 1 }), 'HirePool User Agreement (v1)');
  assert.equal(getAgreementLinkLabel({ version: '1.2' }), 'HirePool User Agreement (v1.2)');
  assert.equal(getAgreementLinkLabel({ version: 0 }), 'HirePool User Agreement (v0)');
  assert.equal(getAgreementLinkLabel({}), 'HirePool User Agreement');
  assert.equal(getAgreementLinkLabel(null), 'HirePool User Agreement');
  assert.equal(formatAgreementVersion('   '), '');
});
