import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { signJwt } from '../middleware/auth.js';
import { ASSISTANT_PRESETS } from '../../../config/assistant-presets.js';
import { ASSISTANT_SURFACES, isListedWebsiteOrigin } from '../surface.js';

/** Website visitors may use the HirePool assistant as guests (public help, jobs, signup). */
const WEBSITE_GUEST_ASSISTANT_IDS = new Set(['hirepool']);

export const authRouter = Router();

// Allowed public assistants eligible for demo tokens
const PUBLIC_ASSISTANT_IDS = new Set([
  ...Object.keys(ASSISTANT_PRESETS).filter(id => id !== 'hirepool'),
  'integration-demo'
]);

/**
 * POST /api/auth/token & GET /api/auth/token
 * Issues a cryptographically signed, scoped demo/guest JWT for public assistant interactions.
 * This allows the public demo widget and standalone embeds to authenticate securely in production
 * without exposing server secrets or requiring users to generate manual credentials.
 */
function handleDemoToken(req, res, next) {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(200).json({
        token: null,
        tokenType: 'None',
        expiresIn: 0,
        message: 'JWT authentication is not configured on this server.'
      });
    }

    const assistantId = req.body?.assistantId || req.query?.assistantId || 'default';

    // HirePool website: a guest token that only works from the HirePool website
    // (the server refuses it on dashboards and anywhere else; see auth middleware).
    if (WEBSITE_GUEST_ASSISTANT_IDS.has(assistantId) && isListedWebsiteOrigin(req)) {
      const guestId = `guest_${randomUUID()}`;
      const token = signJwt(
        {
          sub: guestId,
          role: 'guest',
          scopes: ['chat', 'document:upload', 'session:clear'],
          assistantId,
          surface: ASSISTANT_SURFACES.WEBSITE,
          isGuest: true
        },
        jwtSecret,
        { expiresIn: 3600, issuer: process.env.JWT_ISSUER || 'ai-assistant-plugin' }
      );
      return res.status(200).json({ token, tokenType: 'Bearer', expiresIn: 3600, user: { id: guestId, role: 'guest' } });
    }

    // Prevent abuse: demo tokens can ONLY be minted for public demo assistants
    if (!PUBLIC_ASSISTANT_IDS.has(assistantId)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN_ASSISTANT',
          message: `Demo tokens are only available for public demo assistants. Protected assistant '${assistantId}' requires host application authentication.`
        }
      });
    }

    const guestId = `guest_${randomUUID()}`;
    const token = signJwt(
      {
        sub: guestId,
        role: 'demo',
        scopes: ['chat', 'summarize', 'document:upload', 'session:clear'],
        assistantId,
        isDemo: true
      },
      jwtSecret,
      {
        expiresIn: 3600, // 1 hour
        issuer: process.env.JWT_ISSUER || 'ai-assistant-plugin'
      }
    );

    res.status(200).json({
      token,
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: {
        id: guestId,
        role: 'demo'
      }
    });
  } catch (err) {
    next(err);
  }
}

authRouter.post('/token', handleDemoToken);
authRouter.get('/token', handleDemoToken);