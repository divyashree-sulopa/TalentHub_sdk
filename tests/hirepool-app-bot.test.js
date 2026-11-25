import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app.js';
import { storeHirePoolSession } from '../backend/src/local-integrations/hirepool-session-store.js';
import {
  buildAppWelcome,
  computeProfileGaps,
  getTimeOfDayGreeting
} from '../integrations/hirepool/app-welcome.js';
import { HirePoolAppSession } from '../widget/src/hirepool-app-session.js';
import { isHirePoolAppUrl } from '../config/hirepool-site-policy.js';

const WEBSITE = 'http://localhost:3000';
const APP = 'http://localhost:5173';

function setupEnvironment() {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  process.env.ENABLE_HIREPOOL_LOCAL_BRIDGE = 'true';
  process.env.DYNAMIC_API_DISCOVERY_ENABLED = 'true';
  process.env.API_DISCOVERY_ALLOWED_HOSTS = 'localhost';
  process.env.HIREPOOL_LOCAL_API_BASE_URL = 'http://localhost:8000/';
  process.env.HIREPOOL_LOCAL_OPENAPI_URL = 'http://localhost:8000/api/openapi.json';
  process.env.HIREPOOL_LOCAL_ALLOWED_ORIGINS = `${WEBSITE},${APP}`;
  process.env.CORS_ALLOWED_ORIGINS = `${WEBSITE},${APP}`;
}

test('time-of-day greeting uses the browser hour and tolerates bad input', () => {
  assert.equal(getTimeOfDayGreeting(8), 'Good morning');
  assert.equal(getTimeOfDayGreeting(13), 'Good afternoon');
  assert.equal(getTimeOfDayGreeting(21), 'Good evening');
  assert.equal(getTimeOfDayGreeting(undefined), 'Hi');
  assert.equal(getTimeOfDayGreeting(42), 'Hi');
});

test('candidate welcome uses the first name and asks about the next missing detail', () => {
  const welcome = buildAppWelcome({
    role: 'candidate',
    hour: 9,
    profile: {
      first_name: 'Priya',
      last_name: 'Sharma',
      phone: '',
      current_location: 'Bengaluru',
      job_title: 'Frontend Developer',
      professional_summary: 'Builds UIs.',
      years_of_experience: 3,
      skills: ['React'],
      profile_completion_percentage: 72.4
    }
  });
  assert.match(welcome.greeting, /^Good morning, Priya! 👋/);
  assert.deepEqual(welcome.suggestedPrompts.slice(0, 2), ['Find matching jobs', 'Show my applications']);
  assert.ok(welcome.profileNudge);
  assert.equal(welcome.profileNudge.field, 'your phone number');
  assert.equal(welcome.profileNudge.completion, 72);
  assert.match(welcome.profileNudge.text, /72%/);
  assert.equal(welcome.profileNudge.acceptPrompt, 'Update my phone number');
});

test('employer and agency welcomes use the member name and organisation', () => {
  const client = buildAppWelcome({
    role: 'client',
    hour: 15,
    userProfile: { full_name: 'Rahul Verma', designation: 'HR Lead', phone: '9876543210' },
    profile: { company_name: 'Acme Corp', industry: 'Technology', company_size: '51-200' }
  });
  assert.match(client.greeting, /^Good afternoon, Rahul!/);
  assert.match(client.greeting, /Acme Corp/);
  assert.equal(client.profileNudge.field, 'your headquarters location');

  const agency = computeProfileGaps('consultancy', {
    userProfile: { full_name: 'A', designation: 'B', phone: '1' },
    profile: {
      industry_specialization: ['IT'],
      headquarters_location: 'Pune',
      company_size: '11-50',
      website: 'https://a.example',
      about_company: 'We place engineers.'
    }
  });
  assert.equal(agency.nextField, null);
  assert.equal(agency.completion, 100);
});

test('a complete or unreadable profile produces no nudge and a generic greeting', () => {
  const generic = buildAppWelcome({ role: 'candidate' });
  assert.match(generic.greeting, /^Hi! 👋/);
  assert.equal(generic.profileNudge, null);
});

test('the SDK may only mount the in-app bot inside the HirePool app', () => {
  assert.equal(isHirePoolAppUrl('https://app.hirepool.ai/candidate/jobs'), true);
  assert.equal(isHirePoolAppUrl('http://localhost:5173/client/dashboard'), true);
  assert.equal(isHirePoolAppUrl('https://hirepool.ai/'), false);
  assert.equal(isHirePoolAppUrl('https://app.hirepool.ai.evil.example/'), false);
});

test('welcome endpoint: website is refused, unauthenticated app calls get 401, verified users get a greeting', async () => {
  setupEnvironment();
  const app = createApp();

  await request(app).get('/api/hirepool/assistant/welcome').set('Origin', WEBSITE).expect(403);
  await request(app).get('/api/hirepool/assistant/welcome').set('Origin', APP).expect(401);

  const sdkSession = storeHirePoolSession(
    'token-app-welcome',
    { id: 'usr-app-1', email: 'cand@example.test', userType: 'candidate', organizationRole: null },
    Date.now(),
    Date.now()
  );
  // HirePool itself is not running in tests, so profile reads fail and the
  // greeting falls back to a generic one rather than erroring.
  const res = await request(app)
    .get('/api/hirepool/assistant/welcome?hour=20')
    .set('Origin', APP)
    .set('Authorization', `Bearer ${sdkSession.credential}`)
    .expect(200);
  assert.equal(res.body.role, 'candidate');
  assert.match(res.body.greeting, /^Good evening! 👋/);
  assert.equal(res.headers['cache-control'], 'no-store');
});

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift() || { status: 500, body: {} };
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { impl, calls };
}

test('in-app sign-in exchanges the app token once, renews before expiry, and revokes on logout', async t => {
  t.mock.timers.enable({ apis: ['Date'] });
  let token = 'app-access-token';
  const { impl, calls } = fakeFetch([
    { status: 200, body: { credential: 'sdk-cred-1', sessionScope: 's1', expiresIn: 300000, identity: { id: 'u1', userType: 'candidate' } } },
    { status: 200, body: { credential: 'sdk-cred-2', sessionScope: 's1', expiresIn: 300000, identity: { id: 'u1', userType: 'candidate' } } },
    { status: 204, body: null }
  ]);
  const session = new HirePoolAppSession({ apiUrl: 'http://localhost:3100', getAccessToken: () => token, fetchImpl: impl });

  const [a, b] = await Promise.all([session.getSession(), session.getSession()]);
  assert.equal(a.credential, 'sdk-cred-1');
  assert.equal(b, a, 'concurrent callers share one exchange');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:3100/api/hirepool/session');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer app-access-token');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(session.role, 'candidate');

  t.mock.timers.tick(275_000);
  assert.equal((await session.getSession()).credential, 'sdk-cred-2', 'renews shortly before expiry');

  const headers = await session.getHostIntegrationConfig({}).getAuthHeaders();
  assert.deepEqual(headers, { Authorization: 'Bearer sdk-cred-2' });

  await session.end();
  assert.equal(calls[2].url, 'http://localhost:3100/api/hirepool/session/revoke');
  assert.equal(calls[2].init.headers.Authorization, 'Bearer sdk-cred-2');
  assert.equal(await session.getSession(), null, 'no new sessions after logout');
  token = null;
});

test('in-app sign-in re-exchanges when the app refreshes its token or signs out', async () => {
  let token = 'token-a';
  const { impl, calls } = fakeFetch([
    { status: 200, body: { credential: 'cred-a', expiresIn: 300000, identity: { id: 'u1', userType: 'client' } } },
    { status: 200, body: { credential: 'cred-b', expiresIn: 300000, identity: { id: 'u1', userType: 'client' } } }
  ]);
  const session = new HirePoolAppSession({ getAccessToken: () => token, fetchImpl: impl });
  assert.equal((await session.getSession()).credential, 'cred-a');
  assert.equal((await session.getSession()).credential, 'cred-a');
  token = 'token-b';
  assert.equal((await session.getSession()).credential, 'cred-b');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-b');
  token = null;
  assert.equal(await session.getSession(), null, 'app signed out');
});

test('in-app sign-in reports failures and treats a missing app token as signed out', async () => {
  const noToken = new HirePoolAppSession({ getAccessToken: () => null, fetchImpl: async () => { throw new Error('should not call'); } });
  assert.equal(await noToken.getSession(), null);
  assert.deepEqual(await noToken.getHostIntegrationConfig({}).getAuthHeaders(), {});

  const { impl } = fakeFetch([{ status: 401, body: { error: { message: 'HirePool session invalid' } } }]);
  const rejected = new HirePoolAppSession({ getAccessToken: () => 'bad', fetchImpl: impl });
  await assert.rejects(() => rejected.getSession(), err => err.status === 401 && /invalid/.test(err.message));

  assert.throws(() => new HirePoolAppSession({}), /getAccessToken/);
});

test('profile completion reminder lists every missing field for all three roles', () => {
  const candidate = buildAppWelcome({
    role: 'candidate',
    profile: { first_name: 'Divya', last_name: 'Shree', phone: '1', current_location: 'Bengaluru', job_title: 'Dev', professional_summary: 'Builds apps.', years_of_experience: 0, skills: [], profile_completion_percentage: 66 }
  });
  assert.match(candidate.profileNudge.text, /Your profile is \*\*66%\*\* complete/);
  assert.match(candidate.profileNudge.text, /Still missing: \*\*key skills, education, work experience/);
  assert.ok(candidate.profileNudge.missing.length >= 3);
  assert.match(candidate.profileNudge.text, /quick form/);

  const client = buildAppWelcome({ role: 'client', userProfile: { full_name: 'R' }, profile: { company_name: 'Acme' } });
  assert.match(client.profileNudge.text, /Your company profile is \*\*\d+%\*\* complete/);
  assert.match(client.profileNudge.text, /designation/);
  assert.match(client.profileNudge.text, /industry/);

  const agency = buildAppWelcome({ role: 'consultancy', userProfile: { full_name: 'M', designation: 'Lead', phone: '1' }, profile: { consultancy_name: 'Bhav', industry_specialization: ['IT'], headquarters_location: 'Bengaluru', company_size: '500+' } });
  assert.match(agency.profileNudge.text, /Your agency profile is/);
  assert.match(agency.profileNudge.text, /website/);

  const complete = buildAppWelcome({ role: 'consultancy', userProfile: { full_name: 'M', designation: 'Lead', phone: '1' }, profile: { industry_specialization: ['IT'], headquarters_location: 'B', company_size: '500+', website: 'https://b.example', about_company: 'We place engineers.' } });
  assert.equal(complete.profileNudge, null, 'no reminder once everything is filled');
});

test('the SDK never pops up on interview, screening, offer, or onboarding pages', async () => {
  const sdkSource = await (await import('node:fs/promises')).readFile(new URL('../widget/src/sdk.js', import.meta.url), 'utf8');
  for (const page of ['screening', 'ai-interview', 'offers?', 'onboarding']) {
    assert.ok(sdkSource.includes(page), `quiet page list includes ${page}`);
  }
  assert.match(sdkSource, /profile-popup:/, 'popup is limited per login session');
});

test('dashboard pop-up waits 30 seconds on the page for every role', async () => {
  const { getHirePoolSurfaceConfig } = await import('../config/hirepool-surfaces.js');
  const app = getHirePoolSurfaceConfig('app').behavior;
  assert.equal(app.autoOpen.delayMs, 30000);
  assert.equal(app.autoOpen.mobile, 'bubble');
  assert.equal(app.firstVisitOpen, true);
  const sdkSource = await (await import('node:fs/promises')).readFile(new URL('../widget/src/sdk.js', import.meta.url), 'utf8');
  assert.match(sdkSource, /scheduleAutoOpen/);
  assert.doesNotMatch(sdkSource, /this\.widgetUI\.open\(\{ focus: false, source: "auto" \}\)/, 'no immediate pop-up in the dashboard');
});

test('profile form: lists missing fields per role and only sends real changes', async () => {
  const { buildProfileForm, buildProfileFormUpdates } = await import('../integrations/hirepool/profile-form.js');
  const profile = { first_name: 'Asha', last_name: '', job_title: 'Developer', skills: [{ name: 'React' }], years_of_experience: 3, profile_completion_percentage: 40 };
  const missing = buildProfileForm('candidate', { profile }, { mode: 'missing' });
  const keys = missing.fields.map(f => f.key);
  assert.ok(keys.includes('last_name') && keys.includes('professional_summary'));
  assert.ok(!keys.includes('first_name') && !keys.includes('skills'), 'filled fields are left out');
  assert.equal(missing.completion, 40);
  assert.ok(missing.chatSections.some(s => s.key === 'education'));

  const all = buildProfileForm('candidate', { profile }, { mode: 'all' });
  assert.deepEqual(all.fields.find(f => f.key === 'skills').value, ['React']);

  const update = buildProfileFormUpdates('candidate', {
    first_name: 'Asha', last_name: 'Rao', skills: 'React, Node.js', job_title: '', years_of_experience: '3'
  }, { profile });
  assert.equal(update.ok, true);
  assert.deepEqual(Object.keys(update.bodies.profile).sort(), ['last_name', 'skills']);
  assert.deepEqual(update.bodies.profile.skills, ['React', 'Node.js']);

  const bad = buildProfileFormUpdates('candidate', { years_of_experience: '90' }, { profile });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.years_of_experience);

  const org = buildProfileForm('client', { profile: { industry: 'Technology' }, userProfile: { full_name: 'Ravi' } }, { mode: 'missing' });
  assert.ok(org.fields.some(f => f.key === 'designation'));
  assert.ok(org.fields.find(f => f.key === 'company_size').options.length > 2);
  const orgUpdate = buildProfileFormUpdates('client', { designation: 'HR Lead', headquarters_location: 'Pune' }, { profile: { industry: 'Technology' }, userProfile: { full_name: 'Ravi' } });
  assert.equal(orgUpdate.ok, true);
  assert.deepEqual(orgUpdate.bodies.user, { designation: 'HR Lead' });
  assert.equal(orgUpdate.bodies.profile.headquarters_location, 'Pune');
});

test('profile form route: website is refused and guests must log in', async () => {
  process.env.NODE_ENV = 'development';
  const { createApp } = await import('../backend/src/app.js');
  const app = createApp();
  await request(app).get('/api/hirepool/assistant/profile-form').set('Origin', 'http://localhost:3000').expect(r => assert.ok([401, 403].includes(r.status)));
  // The dashboard must reach the route (CORS preflight + the route's own login check), not be blocked by origin.
  const preflight = await request(app).options('/api/hirepool/assistant/profile-form')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
  assert.ok(preflight.status < 300, `preflight status ${preflight.status}`);
  assert.equal(preflight.headers['access-control-allow-origin'], 'http://localhost:5173');
  const get = await request(app).get('/api/hirepool/assistant/profile-form?mode=missing').set('Origin', 'http://localhost:5173');
  assert.equal(get.status, 401);
  assert.equal(get.body.error.code, 'AUTH_REQUIRED');
  const post = await request(app).post('/api/hirepool/assistant/profile-form').set('Origin', 'http://localhost:5173').send({ values: {} });
  assert.equal(post.status, 401);
  assert.equal(post.body.error.code, 'AUTH_REQUIRED');
});

test('dashboard welcome: role task cards, quick buttons, and profile progress', async () => {
  const { buildAppWelcome } = await import('../integrations/hirepool/app-welcome.js');
  const agency = buildAppWelcome({
    role: 'consultancy', hour: 19,
    profile: { consultancy_name: 'Bhav recruitment' }, userProfile: { full_name: 'Divya S' }
  });
  assert.equal(agency.salutation, 'Good evening, Divya! 👋');
  assert.deepEqual(agency.actions.map(a => a.prompt), ['Show job opportunities', 'Add a candidate', 'Show my candidates', 'Placement stats']);
  assert.ok(agency.actions.every(a => a.icon && a.title && a.subtitle));
  assert.ok(!agency.quickReplies.includes('Edit my profile'), 'Complete now is the only profile button');
  assert.ok(agency.profileProgress.remaining > 0);
  assert.equal(agency.profileProgress.profileWord, 'agency profile');

  const client = buildAppWelcome({ role: 'client', profile: { company_name: 'Acme' } });
  assert.ok(client.actions.some(a => a.prompt === 'Post a new job'));
  const candidate = buildAppWelcome({ role: 'candidate', profile: { first_name: 'Asha' } });
  assert.ok(candidate.actions.some(a => a.prompt === 'Find matching jobs'));
});
