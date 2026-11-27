import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { configureCors, configureHelmet, configureRateLimiter } from './middleware/security.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/error-handler.js';

import { healthRouter } from './routes/health.js';
import { configRouter } from './routes/config.js';
import { chatRouter } from './routes/chat.js';
import { summarizeRouter } from './routes/summarize.js';
import { sessionsRouter } from './routes/sessions.js';
import { connectorsRouter } from './routes/connectors.js';
import { documentsRouter } from './routes/documents.js';
import { authRouter } from './routes/auth.js';
import { dynamicApiConfirmationRouter } from './routes/dynamic-api-confirmation.js';
import { createHirePoolResumeRouter } from './routes/hirepool-resume.js';
import { createHirePoolSignupRouter } from './routes/hirepool-signup.js';
import { createHirePoolWelcomeRouter } from './routes/hirepool-welcome.js';
import { stateScopeMiddleware } from './state/state-store.js';
import { hydrateSharedStateMiddleware } from './state/hydrate-middleware.js';
import { registerIntegrationDemoActions } from './actions/integration-demo.js';
import { registerHirePoolActions } from '../../integrations/hirepool/actions.js';
import { registerHirePoolLocalDevelopmentIntegration } from '../../integrations/hirepool/local-development.js';
import { hirePoolAuthRouter, isHirePoolLocalBridgeEnabled } from './local-integrations/hirepool-auth.js';
import { HIREPOOL_LOCAL_DASHBOARD_ORIGINS } from '../../config/hirepool-site-policy.js';
import { getConfiguredSurfaceOrigins } from './surface.js';
import { getHirePoolOpenApiUrl } from './local-integrations/hirepool-api-url.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export function createApp() {
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_INTEGRATION_DEMO === 'true') {
    registerIntegrationDemoActions();
  }
  if (process.env.ENABLE_HIREPOOL_INTEGRATION === 'true') {
    registerHirePoolActions();
  }
  if (isHirePoolLocalBridgeEnabled()) {
    registerHirePoolLocalDevelopmentIntegration();
  }

  const app = express();
  if (process.env.VERCEL) {
    app.set('trust proxy', 1);
  }

  // Basic security & parsing
  app.use(configureHelmet());
  app.use((req, res, next) => {
    const requestPath = req.path || '';
    const normalizedPath = requestPath.replace(/\/+$/, '');
    const isDashboardSessionExchange =
      req.method === 'POST' &&
      normalizedPath === '/api/hirepool/session';
    const isDashboardSessionPreflight =
      req.method === 'OPTIONS' &&
      normalizedPath === '/api/hirepool/session';
    const isDashboardSessionValidate =
      req.method === 'GET' &&
      normalizedPath === '/api/hirepool/session/validate';
    const isDashboardSessionValidatePreflight =
      req.method === 'OPTIONS' &&
      normalizedPath === '/api/hirepool/session/validate';
    const isDashboardSessionLogout =
      req.method === 'POST' &&
      normalizedPath === '/api/hirepool/session/logout';
    const isDashboardSessionLogoutPreflight =
      req.method === 'OPTIONS' &&
      normalizedPath === '/api/hirepool/session/logout';
    const isDashboardSessionRevoke =
      req.method === 'POST' &&
      normalizedPath === '/api/hirepool/session/revoke';
    const isDashboardSessionRevokePreflight =
      req.method === 'OPTIONS' &&
      normalizedPath === '/api/hirepool/session/revoke';
    // The in-app bot reads its personal welcome from the dashboard.
    const isDashboardAssistantWelcome =
      (req.method === 'GET' || req.method === 'OPTIONS') &&
      normalizedPath === '/api/hirepool/assistant/welcome';
    // ...and loads/saves the profile form (its own route checks the verified session).
    // (Covers every in-app assistant route: profile form, bench import, job list, submit.
    // Each route checks the verified HirePool session and role itself.)
    const isDashboardProfileForm =
      ['GET', 'POST', 'OPTIONS'].includes(req.method) &&
      (/^\/api\/hirepool\/assistant\/(?:profile-form|profile-entry(?:\/prepare)?|bench-candidates|agency-jobs|bench-submit)$/.test(normalizedPath) ||
        // "Save as my resume" on the candidate dashboard (the routes require a verified candidate session).
        /^\/api\/hirepool\/resume\/(?:prepare|confirm|cancel)$/.test(normalizedPath));
    if (isDashboardAssistantWelcome || isDashboardProfileForm) {
      return next();
    }
    if (
      requestPath.startsWith('/api/hirepool/') &&
      (HIREPOOL_LOCAL_DASHBOARD_ORIGINS.includes(req.get('Origin')) ||
        getConfiguredSurfaceOrigins().app.includes(req.get('Origin'))) &&
      !isDashboardSessionExchange &&
      !isDashboardSessionPreflight &&
      !isDashboardSessionValidate &&
      !isDashboardSessionValidatePreflight &&
      !isDashboardSessionLogout &&
      !isDashboardSessionLogoutPreflight &&
      !isDashboardSessionRevoke &&
      !isDashboardSessionRevokePreflight
    ) {
      return res.status(403).json({
        error: {
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'The local HirePool assistant bridge is not available from dashboard origins'
        }
      });
    }
    next();
  });
  app.use(configureCors());
  app.use(express.json({ limit: process.env.MAX_REQUEST_BODY_SIZE || '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Structured logging
  app.use(requestLogger);

  // Rate limiting on API routes
  app.use('/api', configureRateLimiter());

  // Path normalizer for serverless environments (e.g. Vercel rewrites)
  app.use((req, res, next) => {
    const matched = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'];
    const pathIsCatchAll = typeof matched === 'string' && /\[[^/]+\]/.test(matched);
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const queryPaths = parsedUrl.searchParams.getAll('path');
    const subpath = queryPaths.length > 1 ? queryPaths.join('/') : queryPaths[0];
    const rewriteRequestUrl = url => {
      req.url = url;
      req._parsedUrl = undefined;
      const rewrittenUrl = new URL(url, 'http://localhost');
      req.normalizedPath = rewrittenUrl.pathname;
      req.query = app.get('query parser fn')(rewrittenUrl.search.slice(1));
    };

    if (subpath && (!matched || pathIsCatchAll)) {
      parsedUrl.searchParams.delete('path');
      rewriteRequestUrl(`/api/${String(subpath).replace(/^\/+/, '')}${parsedUrl.search}`);
    } else if (matched && matched.startsWith('/api') && !pathIsCatchAll) {
      const matchedUrl = new URL(matched, 'http://localhost');
      if (!matchedUrl.search) {
        matchedUrl.search = parsedUrl.search;
      }
      rewriteRequestUrl(`${matchedUrl.pathname}${matchedUrl.search}`);
    }
    next();
  });

  // Shared state (Redis on Vercel): load what this request needs, save changes
  // before the response finishes. Both are no-ops without Redis.
  app.use('/api', stateScopeMiddleware());
  app.use('/api', hydrateSharedStateMiddleware());

  // Mount API endpoints
  app.use('/api/health', healthRouter);
  app.use('/api/config', configRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/summarize', summarizeRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/connectors', connectorsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/dynamic-api/confirm', dynamicApiConfirmationRouter);
  if (isHirePoolLocalBridgeEnabled()) {
    app.use('/api/hirepool', hirePoolAuthRouter);
    app.use('/api/hirepool/resume', createHirePoolResumeRouter());
    app.use('/api/hirepool/signup', createHirePoolSignupRouter());
    app.use('/api/hirepool/assistant', createHirePoolWelcomeRouter());
  }

  // OpenAPI spec proxy for dynamic inspection and local tooling
  app.get('/api/openapi.json', async (req, res) => {
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    const defaultUrl = isProd
      ? 'https://api.hirepool.ai/api/openapi.json'
      : getHirePoolOpenApiUrl();
    const openApiUrl = process.env.HIREPOOL_OPENAPI_URL || defaultUrl;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(openApiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Upstream returned HTTP ${response.status}`);
      }
      const data = await response.json();
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
      return res.json(data);
    } catch (err) {
      // Graceful fallback to bundled spec so OpenAPI failure never blocks widget mount or exploration
      try {
        const fallbackPath = path.resolve(rootDir, 'config/hirepool-openapi-fallback.json');
        if (fs.existsSync(fallbackPath)) {
          const content = fs.readFileSync(fallbackPath, 'utf8');
          res.setHeader('X-OpenAPI-Source', 'fallback');
          res.setHeader('Cache-Control', 'public, max-age=60');
          return res.json(JSON.parse(content));
        }
      } catch (fallbackErr) {
        // Fallback failed
      }
      res.status(502).json({ error: 'OpenAPI upstream unreachable', details: err.message });
    }
  });

  // Serve compiled SDK distribution bundle
  const widgetDistPath = path.resolve(rootDir, 'widget/dist');
  app.use('/sdk', express.static(widgetDistPath, {
    setHeaders: (res, filePath) => {
      // Allow cross-origin script loading
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
    }
  }));

  // Serve demo application
  const demoPath = path.resolve(rootDir, 'demo');
  app.use('/demo', express.static(demoPath));

  // Root API redirect to health
  app.get('/api', (req, res) => {
    res.redirect('/api/health');
  });

  // Root redirect to demo
  app.get('/', (req, res) => {
    res.redirect('/demo');
  });

  // Central error handler
  app.use(errorHandler);

  return app;
}
