/**
 * Website bot: chat messages must carry the website guest pass when nobody is
 * signed in, even though the SDK attaches the HirePool bridge (whose auth hook
 * returns no pass for visitors). Before this fix the widget skipped the guest
 * pass and production answered 401 ("Your session was refreshed...").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistantApiClient } from '../widget/src/api-client.js';

const API = 'https://sdk.example.test';

function mockServer({ tokenStatus = 200, chatStatuses = [200] } = {}) {
  const calls = [];
  let tokenCount = 0;
  let chatIndex = 0;
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const auth = init.headers?.Authorization || null;
    calls.push({ path, auth });
    if (path === '/api/auth/token') {
      tokenCount += 1;
      if (tokenStatus !== 200) return new Response(JSON.stringify({ error: { code: 'FORBIDDEN_ASSISTANT' } }), { status: tokenStatus });
      return new Response(JSON.stringify({ token: `guest-${tokenCount}`, expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path === '/api/chat') {
      const status = chatStatuses[Math.min(chatIndex, chatStatuses.length - 1)];
      chatIndex += 1;
      if (status === 401) return new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'expired' } }), { status: 401 });
      return new Response(JSON.stringify({ conversationId: 'c1', text: 'Hello!' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };
  return { calls, fetchImpl, tokenCount: () => tokenCount };
}

async function withFetch(fetchImpl, run) {
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('website visitor: the guest pass is used even though a host auth hook exists (HirePool bridge)', async () => {
  const server = mockServer();
  const client = new AssistantApiClient(API, { assistantId: 'hirepool', getAuthHeaders: async () => ({}) });
  const reply = await withFetch(server.fetchImpl, () => client.sendMessage({ assistantId: 'hirepool', message: 'How does HirePool work?', stream: false }));
  assert.equal(reply.text, 'Hello!');
  const chat = server.calls.find(c => c.path === '/api/chat');
  assert.equal(chat.auth, 'Bearer guest-1', 'chat carries the guest pass');
  // The pass is reused for the next message.
  await withFetch(server.fetchImpl, () => client.sendMessage({ assistantId: 'hirepool', message: 'second', stream: false }));
  assert.equal(server.tokenCount(), 1);
});

test('signed-in users and host passes come first; no guest pass is fetched', async () => {
  const server = mockServer();
  const hosted = new AssistantApiClient(API, { assistantId: 'hirepool', getAuthHeaders: async () => ({ Authorization: 'Bearer host-pass' }) });
  await withFetch(server.fetchImpl, () => hosted.sendMessage({ assistantId: 'hirepool', message: 'hi', stream: false }));
  const session = new AssistantApiClient(API, { assistantId: 'hirepool', getAuthHeaders: async () => ({}) });
  session.setAuthenticatedSession?.({ credential: 'sdk-session' });
  session._authenticatedSession = session._authenticatedSession || { credential: 'sdk-session' };
  await withFetch(server.fetchImpl, () => session.sendMessage({ assistantId: 'hirepool', message: 'hi', stream: false }));
  assert.equal(server.tokenCount(), 0);
  assert.deepEqual(server.calls.filter(c => c.path === '/api/chat').map(c => c.auth), ['Bearer host-pass', 'Bearer sdk-session']);
});

test('an expired guest pass is replaced and the message retried once', async () => {
  const server = mockServer({ chatStatuses: [401, 200] });
  const client = new AssistantApiClient(API, { assistantId: 'hirepool', getAuthHeaders: async () => ({}) });
  const reply = await withFetch(server.fetchImpl, () => client.sendMessage({ assistantId: 'hirepool', message: 'hi', stream: false }));
  assert.equal(reply.text, 'Hello!');
  assert.deepEqual(server.calls.filter(c => c.path === '/api/chat').map(c => c.auth), ['Bearer guest-1', 'Bearer guest-2']);

  // Only one retry: a second 401 is reported, not looped.
  const stubborn = mockServer({ chatStatuses: [401, 401, 401] });
  const client2 = new AssistantApiClient(API, { assistantId: 'hirepool' });
  await assert.rejects(withFetch(stubborn.fetchImpl, () => client2.sendMessage({ assistantId: 'hirepool', message: 'hi', stream: false })), err => err.status === 401);
  assert.equal(stubborn.calls.filter(c => c.path === '/api/chat').length, 2);
});

test('where no guest pass is offered (e.g. dashboards), the widget does not ask on every message', async () => {
  const server = mockServer({ tokenStatus: 403 });
  const client = new AssistantApiClient(API, { assistantId: 'hirepool', getAuthHeaders: async () => ({}) });
  await withFetch(server.fetchImpl, async () => {
    await client.sendMessage({ assistantId: 'hirepool', message: 'one', stream: false });
    await client.sendMessage({ assistantId: 'hirepool', message: 'two', stream: false });
  });
  assert.equal(server.tokenCount(), 1, 'asked once, then waits before asking again');
  assert.equal(server.calls.find(c => c.path === '/api/chat').auth, null);
});
