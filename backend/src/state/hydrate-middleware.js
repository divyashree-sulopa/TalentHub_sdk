/**
 * Loads the shared records a request needs before the (synchronous) route
 * logic runs. Every step is a no-op when Redis is not configured.
 */

import { getStateStore } from './state-store.js';
import { sessionManager } from '../session-manager.js';
import { hydrateHirePoolSessionByCredential } from '../local-integrations/hirepool-session-store.js';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function bearerToken(req) {
  const header = req.get('Authorization') || '';
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{16,512})$/i.exec(header.trim());
  return match ? match[1] : null;
}

function conversationIdsFor(req) {
  const ids = new Set();
  for (const candidate of [req.body?.conversationId, req.query?.conversationId]) {
    if (typeof candidate === 'string' && ID_PATTERN.test(candidate.trim())) ids.add(candidate.trim());
  }
  // /api/documents/:conversationId[/...] and /api/sessions/:conversationId
  const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
  const match = /^\/api\/(?:documents|sessions)\/([^/]+)/.exec(fullPath);
  if (match && ID_PATTERN.test(match[1])) ids.add(match[1]);
  return [...ids];
}

export function hydrateSharedStateMiddleware() {
  return async (req, res, next) => {
    if (!getStateStore().shared) return next();
    try {
      const token = bearerToken(req);
      if (token) await hydrateHirePoolSessionByCredential(token);
      await Promise.all(conversationIdsFor(req).map(id => sessionManager.hydrate(id)));
      next();
    } catch (error) {
      // The shared store is unavailable: fail clearly instead of acting on partial state.
      res.status(503).json({
        error: { code: 'STATE_UNAVAILABLE', message: 'The assistant is temporarily unavailable. Please try again shortly.' }
      });
      console.error('[State] Could not load shared state:', error?.message || error);
    }
  };
}
