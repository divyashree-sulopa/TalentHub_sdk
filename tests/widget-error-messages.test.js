import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAssistantError } from '../widget/src/error-messages.js';

function err(message, extra = {}) {
  return Object.assign(new Error(message), extra);
}

const TECHNICAL = /HTTP|\b[45]\d\d\b|stream|TypeError|fetch|undefined|stack|ECONN/i;

test('every error becomes a plain message with a clear next step', () => {
  const cases = [
    [err('Failed to fetch', { name: 'TypeError' }), {}, 'offline', 'auto'],
    [err('anything'), { online: false }, 'offline', 'auto'],
    [err('Too many requests', { status: 429, code: 'RATE_LIMIT_EXCEEDED' }), {}, 'rate-limited', 'manual'],
    [err('Server returned HTTP 401', { status: 401 }), { surface: 'app' }, 'signed-out', 'none'],
    [err('Server returned HTTP 401', { status: 401 }), { surface: 'website' }, 'session-reset', 'manual'],
    [err('This conversation has expired', { status: 410, code: 'SESSION_EXPIRED' }), {}, 'conversation-expired', 'auto'],
    [err('Invalid request parameters (message: too long)', { status: 400, code: 'VALIDATION_ERROR' }), {}, 'invalid', 'none'],
    [err('Shared state store is unreachable', { status: 503, code: 'STATE_UNAVAILABLE' }), {}, 'unavailable', 'manual'],
    [err('HirePool took too long', { status: 504, code: 'HIREPOOL_API_TIMEOUT' }), {}, 'unavailable', 'manual'],
    [err('The streaming response ended before the assistant completed the request.'), { hadPartialReply: true }, 'interrupted', 'manual'],
    [err('Gemini quota exceeded: 500 INTERNAL at ...stack', { status: 500, code: 'STREAM_ERROR' }), {}, 'unexpected', 'manual']
  ];
  for (const [error, context, kind, retry] of cases) {
    const info = describeAssistantError(error, context);
    assert.equal(info.kind, kind, error.message);
    assert.equal(info.retry, retry, error.message);
    assert.ok(info.message.length > 10, `${kind} has a message`);
    assert.doesNotMatch(info.message, TECHNICAL, `${kind} message must not be technical`);
  }
});

test('the dashboard asks to log in again; partial replies say they were cut off', () => {
  assert.match(describeAssistantError(err('x', { status: 401 }), { surface: 'app' }).message, /log in again/);
  assert.equal(describeAssistantError(err('x', { status: 401 }), { surface: 'app' }).recover, 'reauthenticate');
  assert.match(
    describeAssistantError(err('The streaming response ended early'), { hadPartialReply: true }).message,
    /cut off/
  );
});

test('cancelled requests are silent', () => {
  const info = describeAssistantError(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  assert.equal(info.kind, 'cancelled');
  assert.equal(info.message, '');
});
