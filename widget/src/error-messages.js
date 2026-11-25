/**
 * One place that turns any assistant error into something a person can act on.
 * Raw technical text (HTTP codes, stack traces, "stream ended", server error
 * strings) is never shown; it goes to the console and the `error` event only.
 *
 * Each result says what to show and what the widget should do next:
 *   retry: 'manual' | 'auto' | 'none'
 *   recover: 'reauthenticate' | 'new-conversation' | 'wait-online' | null
 */

const AUTH_CODES = new Set([
  'INVALID_CREDENTIALS',
  'MISSING_CREDENTIALS',
  'TOKEN_EXPIRED',
  'EXPIRED_SESSION',
  'AUTH_REQUIRED',
  'UNAUTHORIZED',
  'INVALID_HOST_CREDENTIAL'
]);

const UPSTREAM_CODES = new Set([
  'STATE_UNAVAILABLE',
  'HIREPOOL_API_TIMEOUT',
  'REQUEST_TIMEOUT',
  'PROVIDER_NOT_CONFIGURED',
  'UPSTREAM_UNAVAILABLE',
  'IDENTITY_UNAVAILABLE'
]);

function isNetworkError(error, online) {
  if (online === false) return true;
  const message = String(error?.message || '');
  return error?.name === 'TypeError' && /fetch|network|load failed|connection/i.test(message);
}

/**
 * @param {Error & { status?: number, code?: string }} error
 * @param {{ surface?: 'website'|'app'|'legacy'|null, online?: boolean, loginUrl?: string|null, hadPartialReply?: boolean }} [context]
 * @returns {{ kind: string, message: string, retry: 'manual'|'auto'|'none', recover: string|null, retryAfterMs?: number }}
 */
export function describeAssistantError(error, context = {}) {
  const status = Number(error?.status) || null;
  const code = String(error?.code || '').toUpperCase();
  const surface = context.surface || null;

  if (error?.name === 'AbortError') {
    return { kind: 'cancelled', message: '', retry: 'none', recover: null };
  }

  if (isNetworkError(error, context.online)) {
    return {
      kind: 'offline',
      message: "I can't reach HirePool right now. Please check your internet connection. I'll try again as soon as you're back online.",
      retry: 'auto',
      recover: 'wait-online'
    };
  }

  if (status === 429 || code === 'RATE_LIMIT_EXCEEDED') {
    return {
      kind: 'rate-limited',
      message: "You're sending messages a little fast. Please wait a few seconds, then try again.",
      retry: 'manual',
      recover: null,
      retryAfterMs: 5000
    };
  }

  if (status === 401 || AUTH_CODES.has(code)) {
    if (surface === 'app') {
      return {
        kind: 'signed-out',
        message: "Your HirePool session has ended. Please log in again to continue.",
        retry: 'none',
        recover: 'reauthenticate'
      };
    }
    return {
      kind: 'session-reset',
      message: 'Your session was refreshed. Please send your message again.',
      retry: 'manual',
      recover: 'reauthenticate'
    };
  }

  if (status === 410 || code === 'SESSION_EXPIRED') {
    return {
      kind: 'conversation-expired',
      message: 'This conversation had expired, so I started a fresh one.',
      retry: 'auto',
      recover: 'new-conversation'
    };
  }

  if (status === 413 || code === 'FILE_TOO_LARGE') {
    return { kind: 'too-large', message: 'That file is too large. Please choose a smaller one.', retry: 'none', recover: null };
  }

  if (status === 400 || code === 'VALIDATION_ERROR' || code === 'MALFORMED_JSON') {
    return {
      kind: 'invalid',
      message: "I couldn't send that message. Please shorten it or rephrase it and try again.",
      retry: 'none',
      recover: null
    };
  }

  if (status === 403 && code === 'SURFACE_NOT_ALLOWED') {
    return {
      kind: 'not-available-here',
      message: 'That is only available in your HirePool dashboard after you log in.',
      retry: 'none',
      recover: null
    };
  }

  if (status === 502 || status === 503 || status === 504 || UPSTREAM_CODES.has(code)) {
    return {
      kind: 'unavailable',
      message: "I'm having trouble reaching HirePool right now. Nothing was changed. Please try again in a moment.",
      retry: 'manual',
      recover: null
    };
  }

  if (code === 'STREAM_INTERRUPTED' || /stream(?:ing)? (?:response )?(?:ended|event)|malformed streaming|readable streaming/i.test(String(error?.message || ''))) {
    return {
      kind: 'interrupted',
      message: context.hadPartialReply
        ? 'My reply was cut off. Please try again for the full answer.'
        : 'My reply was interrupted. Please try again.',
      retry: 'manual',
      recover: null
    };
  }

  return {
    kind: 'unexpected',
    message: "Something went wrong on my side and I couldn't finish that. Nothing was changed. Please try again.",
    retry: 'manual',
    recover: null
  };
}
