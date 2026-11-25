import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { IdleNudgeController, pickIdleNudge } from '../widget/src/idle-nudge.js';
import { HIREPOOL_APP_IDLE_NUDGES, HIREPOOL_WEBSITE_IDLE_NUDGES, HIREPOOL_WEBSITE_WELCOME } from '../config/hirepool-surfaces.js';
import { createApp } from '../backend/src/app.js';

function harness(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const posted = [];
  const state = { canNudge: true, paused: false };
  const used = new Set();
  const ctrl = new IdleNudgeController({
    delayMs: 5000,
    maxConsecutive: 2,
    pickNudge: stage => pickIdleNudge(HIREPOOL_WEBSITE_IDLE_NUDGES, stage, used),
    post: nudge => posted.push(nudge),
    canNudge: () => state.canNudge,
    isPaused: () => state.paused,
    ...overrides
  });
  return { ctrl, posted, state };
}

test('the welcome is a short hello with one role card per HirePool role', () => {
  assert.match(HIREPOOL_WEBSITE_WELCOME.message, /Hi there, welcome to HirePool!/);
  assert.match(HIREPOOL_WEBSITE_WELCOME.message, /What brings you here today\?/);
  assert.ok(HIREPOOL_WEBSITE_WELCOME.message.split('\n').length <= 3, 'welcome stays short');
  const cards = HIREPOOL_WEBSITE_WELCOME.roleCards;
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(c => c.icon), ['briefcase', 'building', 'users']);
  assert.ok(cards.every(c => c.title && c.subtitle && c.prompt));
  const all = [HIREPOOL_WEBSITE_WELCOME.message, ...HIREPOOL_WEBSITE_IDLE_NUDGES.afterWelcome.map(n => n.text), ...HIREPOOL_WEBSITE_IDLE_NUDGES.afterAnswer.map(n => n.text)].join('\n');
  assert.doesNotMatch(all, /free|pricing|price|https?:\/\//i, 'no pricing claims or links in canned messages');
});

test('follows up after 5 quiet seconds, at most twice in a row', t => {
  const { ctrl, posted } = harness(t);
  ctrl.onAssistantMessage('answer');
  t.mock.timers.tick(4999);
  assert.equal(posted.length, 0);
  t.mock.timers.tick(1);
  assert.equal(posted.length, 1);
  assert.match(posted[0].text, /Did that help/);
  t.mock.timers.tick(5000);
  assert.equal(posted.length, 2);
  t.mock.timers.tick(60_000);
  assert.equal(posted.length, 2, 'stops after two follow-ups without a reply');
});

test('after the welcome there is a single gentle follow-up, never "No rush"', t => {
  const { ctrl, posted } = harness(t);
  ctrl.onAssistantMessage('welcome');
  t.mock.timers.tick(60_000);
  assert.equal(posted.length, 1);
  assert.match(posted[0].text, /whenever you're ready/);
  assert.deepEqual(posted[0].quickReplies, [], "the welcome's own buttons stay");
  assert.doesNotMatch(JSON.stringify(HIREPOOL_WEBSITE_IDLE_NUDGES), /No rush/);
});

test('a reply resets the allowance and answers get different follow-ups', t => {
  const { ctrl, posted } = harness(t);
  ctrl.onAssistantMessage('welcome');
  t.mock.timers.tick(5000);
  t.mock.timers.tick(5000);
  assert.equal(posted.length, 1);
  ctrl.onUserMessage();
  ctrl.onAssistantMessage('answer');
  t.mock.timers.tick(5000);
  assert.equal(posted.length, 2);
  assert.match(posted[1].text, /Did that help/);
  const texts = posted.map(p => p.text);
  assert.equal(new Set(texts).size, texts.length, 'no follow-up is repeated');
});

test('typing, a closed chat, a loading reply, or a hidden tab prevent follow-ups', t => {
  const { ctrl, posted, state } = harness(t);
  ctrl.onAssistantMessage('welcome');
  t.mock.timers.tick(3000);
  ctrl.onUserActivity(); // started typing
  t.mock.timers.tick(30_000);
  assert.equal(posted.length, 0);

  state.canNudge = false; // e.g. chat closed or reply loading
  ctrl.onAssistantMessage('answer');
  t.mock.timers.tick(30_000);
  assert.equal(posted.length, 0);

  state.canNudge = true;
  state.paused = true; // tab hidden: waits and tries again later
  ctrl.onAssistantMessage('answer');
  t.mock.timers.tick(15_000);
  assert.equal(posted.length, 0);
  state.paused = false;
  t.mock.timers.tick(5000);
  assert.equal(posted.length, 1);
});

test('after the assistant asks a question, the follow-up is gentle, not "did that help?"', t => {
  const { ctrl, posted } = harness(t);
  ctrl.onAssistantMessage('question');
  t.mock.timers.tick(5000);
  assert.match(posted[0].text, /explain how HirePool works/);
  assert.doesNotMatch(posted[0].text, /Did that help/);
  const all = JSON.stringify({ HIREPOOL_WEBSITE_IDLE_NUDGES, HIREPOOL_APP_IDLE_NUDGES });
  assert.doesNotMatch(all, /Take your time/, 'the "Take your time" follow-up is gone everywhere');
});

test('stop() cancels everything', t => {
  const { ctrl, posted } = harness(t);
  ctrl.onAssistantMessage('welcome');
  ctrl.stop();
  t.mock.timers.tick(60_000);
  assert.equal(posted.length, 0);
});

test('the website config carries the welcome and follow-ups; the app does not', async () => {
  process.env.NODE_ENV = 'development';
  const app = createApp();
  const website = await request(app).get('/api/config/hirepool').set('Origin', 'http://localhost:3000').expect(200);
  assert.match(website.body.assistant.behavior.welcome.message, /What brings you here today\?/);
  assert.equal(website.body.assistant.behavior.welcome.roleCards.length, 3);
  assert.equal(website.body.assistant.behavior.idleNudge.delayMs, 30000);
  assert.equal(website.body.assistant.behavior.idleNudge.maxConsecutive, 1, 'only one follow-up on the website');
  const inApp = await request(app).get('/api/config/hirepool').set('Origin', 'http://localhost:5173').expect(200);
  assert.equal(inApp.body.assistant.behavior.welcome, undefined);
  assert.ok(inApp.body.assistant.behavior.idleNudge.byRole, 'dashboard follow-ups are role-specific');
});

test('dashboard follow-ups match the signed-in role and wait 30 seconds', async () => {
  const { HIREPOOL_APP_IDLE_NUDGES } = await import('../config/hirepool-surfaces.js');
  assert.equal(HIREPOOL_APP_IDLE_NUDGES.delayMs, 30000);
  const candidate = pickIdleNudge(HIREPOOL_APP_IDLE_NUDGES, 'welcome', new Set(), 'candidate');
  assert.match(candidate.text, /jobs that match your profile/);
  assert.ok(candidate.quickReplies.includes('Find matching jobs'));
  const client = pickIdleNudge(HIREPOOL_APP_IDLE_NUDGES, 'welcome', new Set(), 'client');
  assert.match(client.text, /hiring/);
  assert.ok(client.quickReplies.includes('Post a new job'));
  const agency = pickIdleNudge(HIREPOOL_APP_IDLE_NUDGES, 'answer', new Set(), 'consultancy');
  assert.match(agency.text, /candidates could be submitted/);
  assert.equal(pickIdleNudge(HIREPOOL_APP_IDLE_NUDGES, 'welcome', new Set(), null), null, 'no role yet: no follow-up');

  const all = Object.values(HIREPOOL_APP_IDLE_NUDGES.byRole)
    .flatMap(role => [...role.afterWelcome, ...role.afterAnswer, ...role.afterQuestion])
    .map(n => n.text).join('\n');
  assert.doesNotMatch(all, /free|pricing|price|https?:\/\//i);

  process.env.NODE_ENV = 'development';
  const app = createApp();
  const inApp = await request(app).get('/api/config/hirepool').set('Origin', 'http://localhost:5173').expect(200);
  assert.equal(inApp.body.assistant.behavior.idleNudge.delayMs, 30000);
  assert.ok(inApp.body.assistant.behavior.idleNudge.byRole.consultancy.afterWelcome.length > 0);
});
