/**
 * Production mode: website visitors get guest access to the HirePool bot, and
 * that access works only from the listed HirePool website (never dashboards or
 * other sites, never account data).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.VERCEL = '1';
process.env.VERCEL_ENV = 'production';
process.env.AUTH_MODE = 'jwt';
process.env.JWT_SECRET = 'qa-only-secret-qa-only-secret-123456';
process.env.HIREPOOL_WEBSITE_ORIGINS = 'https://site.example.test';
process.env.HIREPOOL_APP_ORIGINS = 'https://app.example.test';
process.env.CORS_ALLOWED_ORIGINS = 'https://site.example.test,https://app.example.test,https://other.example.test';
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if (String(url).includes('/api/v1/public/jobs')) {
    return new Response(JSON.stringify({ items: [{ title: 'Frontend Developer (React)', company: 'Acme', locations: ['Bengaluru'], remote_type: 'hybrid' }], total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
};
const root = new URL('../', import.meta.url).href;
test('production: HirePool website guests can chat, upload and sign up; nowhere else', async () => {
  try {
  const { createApp } = await import(root + 'backend/src/app.js');
  const { setAIProvider } = await import(root + 'backend/src/providers/factory.js');
  const { default: request } = await import(root + 'node_modules/supertest/index.js');
  setAIProvider({ name: 'qa', async checkHealth() { return { available: true, model: 'qa' }; },
    async chat() { return { text: 'Happy to help! What role are you after?', model: 'qa', finishReason: 'stop' }; },
    async chatStream(i) { i.onChunk?.('Happy to help!'); return { text: 'Happy to help!', model: 'qa' }; } });
  const app = createApp();
  const SITE = 'https://site.example.test';
  const APP = 'https://app.example.test';
  const OTHER = 'https://other.example.test';
  const out = [];
  const log = (name, ok, detail) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);

  const tok = await request(app).post('/api/auth/token').set('Origin', SITE).send({ assistantId: 'hirepool' });
  log('website gets a HirePool guest token', tok.status === 200 && tok.body.token, `${tok.status} ${JSON.stringify(tok.body).slice(0, 120)}`);
  const token = tok.body.token;
  const fromApp = await request(app).post('/api/auth/token').set('Origin', APP).send({ assistantId: 'hirepool' });
  log('dashboard address cannot mint one', fromApp.status === 403, fromApp.status);
  const fromOther = await request(app).post('/api/auth/token').set('Origin', OTHER).send({ assistantId: 'hirepool' });
  log('other sites cannot mint one', fromOther.status === 403, fromOther.status);

  const chat = (origin, message, conversationId) => request(app).post('/api/chat').set('Origin', origin)
    .set('Authorization', `Bearer ${token}`).send({ assistantId: 'hirepool', message, ...(conversationId ? { conversationId } : {}) });
  const hi = await chat(SITE, "I'm looking for a job");
  log('website guest can chat', hi.status === 200 && hi.body.text, `${hi.status} ${JSON.stringify(hi.body).slice(0, 160)}`);
  const price = await chat(SITE, 'What is the pricing?');
  log('pricing goes to contact', /contact/i.test(price.body.text || ''), price.body.text?.slice(0, 100));
  const up = await request(app).post('/api/documents/upload').set('Origin', SITE).set('Authorization', `Bearer ${token}`)
    .set('X-Document-Processing-Consent', 'accepted').set('X-Document-Consent-Version', '1')
    .attach('file', Buffer.from('Priya Sharma\nFrontend Developer\npriya@x.com | 98765 43210 | Bengaluru\nTechnical Skills: React, TypeScript\nWork Experience: Acme\nEducation: B.Tech\nProjects: portfolio, 3 years of experience'), 'cv.txt')
    .field('assistantId', 'hirepool').field('consentAccepted', 'true').field('consentVersion', '1');
  log('website guest can upload a resume', up.status === 200 && up.body.insight?.kind === 'resume', `${up.status} ${JSON.stringify(up.body).slice(0, 160)}`);
  const yes = await chat(SITE, 'Sign me up', up.body.conversationId);
  log('"Sign me up" offers signup', yes.body.action?.action === 'hirepool_signup' || /sign/i.test(yes.body.text || ''), JSON.stringify(yes.body).slice(0, 160));

  const onApp = await chat(APP, 'Show my profile');
  log('guest token refused on the dashboard', onApp.status === 403 && onApp.body.error?.code === 'TOKEN_SURFACE_MISMATCH', `${onApp.status} ${JSON.stringify(onApp.body).slice(0, 120)}`);
  const onOther = await chat(OTHER, 'hello');
  log('guest token refused on other sites', onOther.status === 403, `${onOther.status}`);
  const welcome = await request(app).get('/api/hirepool/assistant/welcome').set('Origin', SITE).set('Authorization', `Bearer ${token}`);
  log('no account data for guests', welcome.status >= 400, welcome.status);
  const noTok = await request(app).post('/api/chat').set('Origin', SITE).send({ assistantId: 'hirepool', message: 'hello' });
  log('without a token chat is still refused', noTok.status === 401, noTok.status);
  console.log(out.join('\n'));
  process.exit(0);

  } finally {
    globalThis.fetch = realFetch;
  }
});
