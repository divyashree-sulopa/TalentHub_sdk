import { Router } from 'express';
import { getAIProvider } from '../providers/factory.js';
import { sessionManager } from '../session-manager.js';

export const healthRouter = Router();

healthRouter.get('/', async (req, res, next) => {
  try {
    const provider = getAIProvider();
    const providerHealth = await provider.checkHealth();

    const isHealthy = providerHealth.available;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      service: 'ai-assistant-plugin-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      provider: {
        name: provider.name,
        available: providerHealth.available,
        model: providerHealth.model,
        message: providerHealth.message
      },
      sessions: sessionManager.getStats(),
      readiness: {
        openapi: 'configured',
        upstream: process.env.HIREPOOL_OPENAPI_URL || ((process.env.NODE_ENV === 'production' || process.env.VERCEL) ? 'https://api.hirepool.ai/api/openapi.json' : 'http://localhost:8000/api/openapi.json')
      }
    });
  } catch (err) {
    next(err);
  }
});
