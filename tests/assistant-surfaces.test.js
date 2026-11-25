import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app.js';
import { setAIProvider } from '../backend/src/providers/factory.js';
import { sessionManager } from '../backend/src/session-manager.js';
import { storeHirePoolSession } from '../backend/src/local-integrations/hirepool-session-store.js';
import {
  ASSISTANT_SURFACES,
  getSurfaceOrigins,
  resolveAssistantSurface,
  scopeUserToSurface
} from '../backend/src/surface.js';
import {
  HIREPOOL_PRICING_REDIRECT_RESPONSE,
  isHirePoolPricingQuestion
} from '../integrations/hirepool/knowledge-base.js';

const WEBSITE = 'http://localhost:3000';
const APP = 'http://localhost:5173';

function setupEnvironment() {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  delete process.env.HIREPOOL_WEBSITE_ORIGINS;
  delete process.env.HIREPOOL_APP_ORIGINS;
  process.env.ENABLE_HIREPOOL_LOCAL_BRIDGE = 'true';
  process.env.DYNAMIC_API_DISCOVERY_ENABLED = 'true';
  process.env.API_DISCOVERY_ALLOWED_HOSTS = 'localhost';
  process.env.HIREPOOL_LOCAL_API_BASE_URL = 'http://localhost:8000/';
  process.env.HIREPOOL_LOCAL_OPENAPI_URL = 'http://localhost:8000/api/openapi.json';
  process.env.CORS_ALLOWED_ORIGINS = `${WEBSITE},${APP}`;
}

function fakeReq(origin) {
  return { get: name => (name.toLowerCase() === 'origin' ? origin : undefined) };
}

function recordingProvider() {
  const calls = [];
  setAIProvider({
    name: 'surface-test-provider',
    async checkHealth() { return { available: true, model: 'test' }; },
    async chat(input) {
      calls.push(input);
      return { text: 'HirePool helps candidates, employers, and agencies.', model: 'test', finishReason: 'stop' };
    },
    async chatStream(input) {
      calls.push(input);
      input.onChunk?.('HirePool helps candidates, employers, and agencies.');
      return { text: 'HirePool helps candidates, employers, and agencies.', model: 'test' };
    }
  });
  return calls;
}

test('surface resolution is derived only from the Origin header', () => {
  const env = { NODE_ENV: 'development' };
  assert.equal(resolveAssistantSurface(fakeReq(WEBSITE), env), ASSISTANT_SURFACES.WEBSITE);
  assert.equal(resolveAssistantSurface(fakeReq('https://hirepool.ai'), env), ASSISTANT_SURFACES.WEBSITE);
  assert.equal(resolveAssistantSurface(fakeReq(APP), env), ASSISTANT_SURFACES.APP);
  assert.equal(resolveAssistantSurface(fakeReq('https://app.hirepool.ai'), env), ASSISTANT_SURFACES.APP);
  assert.equal(resolveAssistantSurface(fakeReq(undefined), env), ASSISTANT_SURFACES.LEGACY);
  assert.equal(resolveAssistantSurface(fakeReq('https://evil.example'), env), ASSISTANT_SURFACES.LEGACY);

  const prod = { NODE_ENV: 'production' };
  // Local origins are not trusted in production, and unknown callers get least privilege.
  assert.equal(resolveAssistantSurface(fakeReq(APP), prod), ASSISTANT_SURFACES.WEBSITE);
  assert.equal(resolveAssistantSurface(fakeReq(undefined), prod), ASSISTANT_SURFACES.WEBSITE);
  assert.equal(resolveAssistantSurface(fakeReq('https://app.hirepool.ai'), prod), ASSISTANT_SURFACES.APP);
});

test('surface origin configuration is validated', () => {
  assert.throws(
    () => getSurfaceOrigins({ NODE_ENV: 'production', HIREPOOL_APP_ORIGINS: 'http://app.example.com' }),
    /HTTPS/
  );
  assert.throws(
    () => getSurfaceOrigins({ HIREPOOL_WEBSITE_ORIGINS: 'https://a.example', HIREPOOL_APP_ORIGINS: 'https://a.example' }),
    /cannot be both/
  );
  assert.throws(() => getSurfaceOrigins({ HIREPOOL_APP_ORIGINS: 'https://a.example/path' }), /exact origins/);
  const custom = getSurfaceOrigins({ HIREPOOL_APP_ORIGINS: 'https://dashboard.example.com' });
  assert.deepEqual([...custom.app], ['https://dashboard.example.com']);
});

test('the website bot never acts on an account, even with a credential', () => {
  const user = { id: 'u1', role: 'candidate', credential: 'x' };
  assert.equal(scopeUserToSurface(user, ASSISTANT_SURFACES.WEBSITE, 'hirepool'), null);
  assert.equal(scopeUserToSurface(user, ASSISTANT_SURFACES.APP, 'hirepool'), user);
  assert.equal(scopeUserToSurface(user, ASSISTANT_SURFACES.LEGACY, 'hirepool'), user);
});

test('pricing questions are detected without catching account edits', () => {
  for (const question of [
    'Explain pricing in HirePool.',
    'Is HirePool free for candidates?',
    'How much does HirePool cost?',
    'Do you have a free trial for employers?',
    'What are your subscription plans?'
  ]) {
    assert.equal(isHirePoolPricingQuestion(question), true, question);
  }
  for (const other of [
    'Set commission structure to 15% flat fee',
    'Update my expected salary to 12 LPA',
    'How does AI job matching work?',
    'I need a career plan'
  ]) {
    assert.equal(isHirePoolPricingQuestion(other), false, other);
  }
  assert.doesNotMatch(HIREPOOL_PRICING_REDIRECT_RESPONSE, /free forever|free trial|14-day|\$|₹/i);
});

test('public config is chosen per surface', async () => {
  setupEnvironment();
  const app = createApp();

  const website = await request(app).get('/api/config/hirepool').set('Origin', WEBSITE).expect(200);
  assert.equal(website.body.assistant.surface, 'website');
  assert.equal(website.body.assistant.behavior.autoOpen.enabled, true);
  assert.equal(website.body.assistant.behavior.autoOpen.delayMs, 5000);
  assert.equal(website.body.assistant.behavior.autoOpen.mobile, 'bubble');
  assert.equal(website.body.assistant.behavior.signupEnabled, true);
  assert.equal(website.body.assistant.systemInstruction, undefined);
  assert.match(website.headers.vary || '', /Origin/i);

  const inApp = await request(app).get('/api/config/hirepool').set('Origin', APP).expect(200);
  assert.equal(inApp.body.assistant.surface, 'app');
  assert.equal(inApp.body.assistant.behavior.autoOpen.enabled, false);
  assert.equal(inApp.body.assistant.behavior.signupEnabled, false);

  const legacy = await request(app).get('/api/config/hirepool').expect(200);
  assert.equal(legacy.body.assistant.surface, 'legacy');
  assert.equal(legacy.body.assistant.behavior, undefined);
});

test('website chat ignores credentials and offers app login instead of account data', async () => {
  setupEnvironment();
  sessionManager.sessions.clear();
  const calls = recordingProvider();
  const app = createApp();
  const sdkSession = storeHirePoolSession(
    'token-surface-website',
    { id: 'usr-surface-1', email: 'cand@example.test', userType: 'candidate', organizationRole: null },
    Date.now(),
    Date.now()
  );

  const res = await request(app)
    .post('/api/chat')
    .set('Origin', WEBSITE)
    .set('Authorization', `Bearer ${sdkSession.credential}`)
    .send({ assistantId: 'hirepool', message: 'Log in to HirePool' })
    .expect(200);
  assert.match(res.body.text, /log in to your HirePool dashboard/i);
  assert.equal(res.body.action?.action, 'hirepool_login');

  // An ordinary question reaches the model as a guest with the friendly website rules
  // and without any account tools.
  await request(app)
    .post('/api/chat')
    .set('Origin', WEBSITE)
    .set('Authorization', `Bearer ${sdkSession.credential}`)
    .send({ assistantId: 'hirepool', message: 'How does HirePool work for employers?' })
    .expect(200);
  const last = calls[calls.length - 1];
  assert.ok(last, 'model should be called for an informational question');
  assert.match(last.systemInstruction, /\[HIREPOOL WEBSITE ASSISTANT\]/);
  assert.doesNotMatch(last.systemInstruction, /\[VERIFIED HIREPOOL ACCOUNT\]/);
  assert.doesNotMatch(last.systemInstruction, /usr-surface-1|cand@example\.test/);
  assert.doesNotMatch(last.systemInstruction, /free forever|14-day free trial/i);
  const toolNames = (last.tools || []).map(tool => tool.function?.name || tool.name);
  // The only tool a website guest gets is the read-only public job search.
  assert.deepEqual(toolNames, ['hirepool_search_jobs']);
});

test('pricing is answered with the contact reply on every surface without calling the model', async () => {
  setupEnvironment();
  sessionManager.sessions.clear();
  const calls = recordingProvider();
  const app = createApp();

  for (const origin of [WEBSITE, null]) {
    const req = request(app).post('/api/chat');
    if (origin) req.set('Origin', origin);
    const res = await req.send({ assistantId: 'hirepool', message: 'How much does HirePool cost?' }).expect(200);
    assert.equal(res.body.text, HIREPOOL_PRICING_REDIRECT_RESPONSE);
  }

  const sse = await request(app)
    .post('/api/chat/stream')
    .set('Origin', WEBSITE)
    .send({ assistantId: 'hirepool', message: 'Is HirePool free for candidates?' })
    .expect(200);
  assert.match(sse.text, /hi@hirepool\.ai/);
  assert.equal(calls.length, 0);
});

test('the in-app bot never offers guest signup or login', async () => {
  setupEnvironment();
  sessionManager.sessions.clear();
  const calls = recordingProvider();
  const app = createApp();

  const res = await request(app)
    .post('/api/chat')
    .set('Origin', APP)
    .send({ assistantId: 'hirepool', message: 'Sign up for HirePool' })
    .expect(200);
  assert.match(res.body.text, /signed out of HirePool/i);
  assert.match(res.body.text, /\[log in again\]\(http:\/\/localhost:5173\/login\)/);
  assert.equal(res.body.action, undefined);
  assert.equal(calls.length, 0);
});

test('logging out from the dashboard chat says so and sends the user to log in', async () => {
  setupEnvironment();
  sessionManager.sessions.clear();
  recordingProvider();
  const app = createApp();
  const sdkSession = storeHirePoolSession(
    'token-app-logout',
    { id: 'usr-app-logout', email: 'out@example.test', userType: 'candidate', organizationRole: null },
    Date.now(),
    Date.now()
  );
  const res = await request(app)
    .post('/api/chat')
    .set('Origin', APP)
    .set('Authorization', `Bearer ${sdkSession.credential}`)
    .send({ assistantId: 'hirepool', message: 'logout' })
    .expect(200);
  assert.equal(res.body.logout?.loggedOut, true);
  assert.match(res.body.text, /logged out of HirePool\. Taking you to the login page/);
  assert.match(res.body.text, /\(http:\/\/localhost:5173\/login\)/);

  // The old credential no longer works; the next message points to log in, not "could not confirm".
  const after = await request(app)
    .post('/api/chat')
    .set('Origin', APP)
    .set('Authorization', `Bearer ${sdkSession.credential}`)
    .send({ assistantId: 'hirepool', message: 'Show my profile' });
  assert.ok([200, 401].includes(after.status));
  if (after.status === 200) {
    assert.match(after.body.text, /signed out of HirePool.*log in again/i);
  }
});

test('website: the bot offering an account turns a plain "ok" into in-chat signup for that role', async () => {
  setupEnvironment();
  const reply = 'HirePool helps your IT agency place candidates faster.\n\n**Would you like to set up your consultancy account now?**';
  setAIProvider({
    name: 'signup-offer-provider',
    async checkHealth() { return { available: true, model: 'test' }; },
    async chat() { return { text: reply, model: 'test', finishReason: 'stop' }; },
    async chatStream(input) { input.onChunk?.(reply); return { text: reply, model: 'test' }; }
  });
  const app = createApp();
  const first = await request(app).post('/api/chat').set('Origin', WEBSITE)
    .send({ assistantId: 'hirepool', message: 'how will hirepool be useful to me' }).expect(200);
  assert.match(first.body.text, /consultancy account/);
  const ok = await request(app).post('/api/chat').set('Origin', WEBSITE)
    .send({ assistantId: 'hirepool', message: 'ok', conversationId: first.body.conversationId }).expect(200);
  assert.equal(ok.body.action?.action, 'hirepool_signup');
  assert.equal(ok.body.action?.parameters?.role, 'consultancy');
});

test('website: signup offers are recognised and take the role from the reply or the visitor', async () => {
  const { detectGuestSignupOffer } = await import('../backend/src/routes/chat.js');
  const { extractHirePoolRegistrationRole } = await import('../integrations/hirepool/visitor-state.js');
  const website = ASSISTANT_SURFACES.WEBSITE;
  assert.equal(detectGuestSignupOffer('Would you like to set up a Consultancy account to get started?', { surface: website }).role, 'consultancy');
  assert.equal(detectGuestSignupOffer('**Shall I create your company account now?**', { surface: website }).role, 'client');
  assert.equal(detectGuestSignupOffer('Would you like me to guide you to the signup page?', {
    surface: website, session: { hirePoolVisitor: { selectedRole: 'consultancy' } }
  }).role, 'consultancy');
  assert.equal(detectGuestSignupOffer('HirePool matches skills to jobs. What role are you after?', { surface: website }), null);
  assert.equal(detectGuestSignupOffer('Would you like to set up your account?', { surface: ASSISTANT_SURFACES.APP }), null, 'not on the dashboard');
  assert.equal(detectGuestSignupOffer('Would you like to set up your account?', { surface: website, verifiedHirePoolUser: { id: 1 } }), null);

  assert.equal(extractHirePoolRegistrationRole("I'm looking for a job"), 'candidate');
  assert.equal(extractHirePoolRegistrationRole("I'm a staffing agency"), 'consultancy');
  assert.equal(extractHirePoolRegistrationRole("I'm hiring for my company"), 'client');
});
