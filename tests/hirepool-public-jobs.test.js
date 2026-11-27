import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  _clearPublicJobCache,
  createPublicJobSearchAction,
  formatPublicJobResults,
  searchPublicHirePoolJobs
} from '../integrations/hirepool/public-jobs.js';
import { createApp } from '../backend/src/app.js';
import { parseMarkdown } from '../widget/src/markdown.js';
import { setAIProvider } from '../backend/src/providers/factory.js';
import { sessionManager } from '../backend/src/session-manager.js';

const NOW = Date.parse('2026-11-24T10:00:00Z');

function job(overrides = {}) {
  return {
    id: 'j1',
    slug: 'frontend-developer-acme',
    title: 'Frontend Developer (React)',
    company: { name: 'Acme', slug: 'acme' },
    locations: ['Bengaluru'],
    remote_type: 'hybrid',
    job_type: 'full_time',
    skills: ['React', 'TypeScript'],
    published_at: '2026-11-22T10:00:00Z',
    ...overrides
  };
}

function fakeHirePool(handler) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const body = handler(u);
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetchImpl, calls };
}

test.beforeEach(() => _clearPublicJobCache());

test('searches HirePool public jobs with role, location, and work mode, over loopback', async () => {
  const { fetchImpl, calls } = fakeHirePool(() => ({ items: [job()], total: 1 }));
  const result = await searchPublicHirePoolJobs({ query: 'React developer', location: 'Bengaluru', work_mode: 'hybrid' }, { fetchImpl, env: {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, 'http://127.0.0.1:8000');
  assert.equal(calls[0].pathname, '/api/v1/public/jobs');
  assert.equal(calls[0].searchParams.get('q'), 'React developer');
  assert.equal(calls[0].searchParams.get('location'), 'Bengaluru');
  assert.equal(calls[0].searchParams.get('remote_type'), 'hybrid');
  assert.equal(calls[0].searchParams.get('page_size'), '3');
  assert.equal(result.jobs[0].company, 'Acme');
  assert.equal(result.relaxed, null);
});

test('relaxes work mode, then location, when nothing matches exactly', async () => {
  const { fetchImpl, calls } = fakeHirePool(u =>
    u.searchParams.get('location') ? { items: [], total: 0 } : { items: [job({ locations: ['Pune'] })], total: 4 }
  );
  const result = await searchPublicHirePoolJobs({ query: 'React developer', location: 'Chennai', work_mode: 'remote' }, { fetchImpl, env: {} });
  assert.equal(calls.length, 3);
  assert.equal(result.relaxed, 'location');
  const text = formatPublicJobResults(result, { now: NOW });
  assert.match(text, /Nothing in Chennai right now/);
  assert.match(text, /more matching roles/);
});

test('results read like the agreed conversation and end by offering the account', () => {
  const text = formatPublicJobResults({
    jobs: [{ title: 'Frontend Developer (React)', company: 'Acme', locations: ['Bengaluru'], workMode: 'hybrid', skills: ['React'], publishedAt: '2026-11-22T10:00:00Z' }],
    total: 1,
    relaxed: null,
    criteria: { query: 'React developer', location: 'Bengaluru', workMode: 'hybrid' }
  }, { now: NOW });
  assert.match(text, /Here is an open role on HirePool that fits:/);
  assert.match(text, /🟢 \*\*Frontend Developer \(React\)\*\* · Acme · Bengaluru · Hybrid · posted 2 days ago/);
  assert.match(text, /Shall I create one for you now\?/);
  assert.doesNotMatch(text, /free|https?:\/\//i, 'no pricing claims or production links');
});

test('an empty search is honest and still offers the account', () => {
  const text = formatPublicJobResults({ jobs: [], total: 0, relaxed: null, criteria: { query: 'Java developer', location: 'Pune', workMode: null } });
  assert.match(text, /couldn't find an open \*\*Java developer\*\* role on HirePool right now in Pune/);
  assert.match(text, /create your account now\?/);
});

test('job text from HirePool cannot inject markdown links or HTML', () => {
  const text = formatPublicJobResults({
    jobs: [{ title: '[Click me](javascript:alert(1)) <img>', company: 'Evil*Co', locations: [], workMode: null, skills: [], publishedAt: null }],
    total: 1,
    relaxed: null,
    criteria: { query: 'x', location: null, workMode: null }
  });
  assert.doesNotMatch(text, /\]\(/, 'no link syntax survives');
  assert.doesNotMatch(text, /\\/, 'visitors never see backslashes');
  const html = parseMarkdown(text);
  assert.doesNotMatch(html, /<a |<img/);
});

test('the tool only accepts a role, a location, and a known work mode', () => {
  const { parameterSchema } = createPublicJobSearchAction();
  assert.equal(parameterSchema.safeParse({ query: 'React developer', work_mode: 'hybrid' }).success, true);
  assert.equal(parameterSchema.safeParse({ query: 'React developer', work_mode: 'anywhere' }).success, false);
  assert.equal(parameterSchema.safeParse({ location: 'Pune' }).success, false);
  assert.equal(parameterSchema.safeParse({ query: 'x'.repeat(200) }).success, false);
});

test('website chat: the model calls the search, the server shows real jobs and a signup card', async (t) => {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  process.env.ENABLE_HIREPOOL_LOCAL_BRIDGE = 'true';
  process.env.DYNAMIC_API_DISCOVERY_ENABLED = 'true';
  process.env.API_DISCOVERY_ALLOWED_HOSTS = 'localhost';
  process.env.HIREPOOL_LOCAL_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  sessionManager.sessions.clear();

  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname === '/api/v1/public/jobs') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ items: [job()], total: 1 }) };
    }
    return realFetch(url, init);
  };

  let toolNames = [];
  setAIProvider({
    name: 'public-jobs-provider',
    async checkHealth() { return { available: true, model: 'test' }; },
    async chat({ tools = [] }) {
      toolNames = tools.map(tool => tool.function?.name || tool.name);
      return {
        text: 'Here you go: Senior React role at MadeUpCorp!',
        toolCalls: [{ id: 'call-1', name: 'hirepool_search_jobs', arguments: { query: 'React developer', location: 'Bengaluru', work_mode: 'hybrid' } }],
        model: 'test',
        finishReason: 'tool_calls'
      };
    }
  });

  const app = createApp();
  const res = await request(app)
    .post('/api/chat')
    .set('Origin', 'http://localhost:3000')
    .send({ assistantId: 'hirepool', message: 'React developer in Bengaluru, hybrid' })
    .expect(200);

  assert.deepEqual(toolNames, ['hirepool_search_jobs']);
  assert.match(res.body.text, /Frontend Developer/);
  assert.match(res.body.text, /Acme/);
  assert.doesNotMatch(res.body.text, /MadeUpCorp/, 'the model\'s own job text is replaced by HirePool data');
  assert.equal(res.body.action?.action, 'hirepool_signup');
  assert.equal(res.body.action?.parameters?.role, 'candidate');

  // A plain "yes" to "Shall I create one for you now?" starts candidate signup.
  const yes = await request(app)
    .post('/api/chat')
    .set('Origin', 'http://localhost:3000')
    .send({ assistantId: 'hirepool', message: 'yes please', conversationId: res.body.conversationId })
    .expect(200);
  assert.equal(yes.body.action?.action, 'hirepool_signup');
  assert.equal(yes.body.action?.parameters?.role, 'candidate');

  // The offer applies only to the very next message.
  const later = await request(app)
    .post('/api/chat')
    .set('Origin', 'http://localhost:3000')
    .send({ assistantId: 'hirepool', message: 'no', conversationId: res.body.conversationId })
    .expect(200);
  assert.doesNotMatch(later.body.text, /No problem! Tell me another role/);
});

test('"no" after the job results gets a friendly answer, not a clarification', async () => {
  sessionManager.sessions.clear();
  setAIProvider({
    name: 'public-jobs-provider-2',
    async checkHealth() { return { available: true, model: 'test' }; },
    async chat() {
      return {
        text: '',
        toolCalls: [{ id: 'call-2', name: 'hirepool_search_jobs', arguments: { query: 'Data analyst' } }],
        model: 'test',
        finishReason: 'tool_calls'
      };
    }
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ items: [], total: 0 }) });
  try {
    const app = createApp();
    const first = await request(app)
      .post('/api/chat')
      .set('Origin', 'http://localhost:3000')
      .send({ assistantId: 'hirepool', message: 'I want a data analyst job' })
      .expect(200);
    assert.match(first.body.text, /couldn't find an open/);
    const no = await request(app)
      .post('/api/chat')
      .set('Origin', 'http://localhost:3000')
      .send({ assistantId: 'hirepool', message: 'not now', conversationId: first.body.conversationId })
      .expect(200);
    assert.match(no.body.text, /No problem!/);
    assert.equal(no.body.action, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('"any" / "anywhere" as a location means no location filter (no "in any." in replies)', async () => {
  const { isPlaceholderLocation, searchPublicHirePoolJobs, formatPublicJobResults, _clearPublicJobCache } = await import('../integrations/hirepool/public-jobs.js');
  const { normalizeHirePoolJobSearchArguments } = await import('../backend/src/routes/chat.js');
  for (const v of ['any', 'Any', 'anywhere', 'any location', 'Anywhere in India', 'pan India', 'no preference', 'flexible', 'N/A', 'any.']) {
    assert.equal(isPlaceholderLocation(v), true, v);
  }
  for (const v of ['Bengaluru', 'Pune', 'Remote', 'Anantapur', 'New York']) {
    assert.equal(isPlaceholderLocation(v), false, v);
  }

  _clearPublicJobCache();
  const seen = [];
  const fetchImpl = async url => {
    seen.push(new URL(String(url)).searchParams.get('location'));
    return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await searchPublicHirePoolJobs({ query: 'software developer', location: 'any' }, { fetchImpl, env: {} });
  assert.deepEqual(seen, [null], 'no location filter sent');
  assert.equal(result.criteria.location, null);
  const text = formatPublicJobResults(result);
  assert.doesNotMatch(text, /\bin any\b/i);
  assert.match(text, /software developer\*\* role on HirePool right now\./);

  // Dashboard search: placeholder locations are dropped, real ones kept.
  assert.deepEqual(normalizeHirePoolJobSearchArguments({ query: { query: 'react developer', locations: 'anywhere' } }), { query: { query: 'react developer' } });
  assert.deepEqual(normalizeHirePoolJobSearchArguments({ query: { query: 'react developer', locations: ['any', 'Pune'] } }), { query: { query: 'react developer', locations: ['Pune'] } });
  assert.deepEqual(normalizeHirePoolJobSearchArguments({ query: { locations: 'any' } }), { query: {} });
  assert.deepEqual(normalizeHirePoolJobSearchArguments({ query: { query: 'react developer', locations: 'Pune' } }), { query: { query: 'react developer', locations: 'Pune' } });
});

test('website: a visitor hiring for their company who says "yes" gets company signup, never a job search or candidate card', async (t) => {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  process.env.ENABLE_HIREPOOL_LOCAL_BRIDGE = 'true';
  process.env.DYNAMIC_API_DISCOVERY_ENABLED = 'true';
  process.env.API_DISCOVERY_ALLOWED_HOSTS = 'localhost';
  process.env.HIREPOOL_LOCAL_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  sessionManager.sessions.clear();

  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let jobSearches = 0;
  globalThis.fetch = async (url, init) => {
    if (new URL(String(url)).pathname === '/api/v1/public/jobs') {
      jobSearches += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify({ items: [], total: 0 }) };
    }
    return realFetch(url, init);
  };
  // The model wrongly reaches for a job search every time.
  setAIProvider({
    name: 'hiring-visitor-provider',
    async checkHealth() { return { available: true, model: 'test' }; },
    async chat({ messages = [] }) {
      const last = messages[messages.length - 1];
      if (last?.role === 'tool') return { text: 'HirePool helps companies hire faster. Would you like to create your **Employer / Company account**?', model: 'test', finishReason: 'stop' };
      return {
        text: '',
        toolCalls: [{ id: 'call-h', name: 'hirepool_search_jobs', arguments: { query: 'software engineer', location: 'remote' } }],
        model: 'test',
        finishReason: 'tool_calls'
      };
    }
  });
  const app = createApp();
  const send = (message, conversationId) => request(app)
    .post('/api/chat')
    .set('Origin', 'http://localhost:3000')
    .send({ assistantId: 'hirepool', message, ...(conversationId ? { conversationId } : {}) })
    .expect(200);

  const hiring = await send("I'm hiring for my company");
  assert.match(hiring.body.text, /Employer \/ Company account/);
  const yes = await send('yes', hiring.body.conversationId);
  assert.equal(yes.body.action?.action, 'hirepool_signup', JSON.stringify(yes.body).slice(0, 200));
  assert.equal(yes.body.action?.parameters?.role, 'client', 'company signup, not candidate');
  assert.equal(jobSearches, 0);

  // Later, a vague message from the same hiring visitor: still no job search or candidate card.
  const vague = await send('tell me more', hiring.body.conversationId);
  assert.equal(jobSearches, 0, 'no job search for a hiring visitor');
  assert.notEqual(vague.body.action?.parameters?.role, 'candidate');
  assert.doesNotMatch(vague.body.text || '', /couldn't find an open/);
});
