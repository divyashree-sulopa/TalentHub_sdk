import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../backend/src/app.js';
import { _resetPasswordRateLimits } from '../backend/src/local-integrations/hirepool-auth.js';
import {
  HirePoolBridge,
  getHirePoolGreetingForAuthState
} from '../widget/src/hirepool-bridge.js';

function setupEnvironment() {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  process.env.ENABLE_HIREPOOL_LOCAL_BRIDGE = 'true';
  process.env.DYNAMIC_API_DISCOVERY_ENABLED = 'true';
  process.env.API_DISCOVERY_ALLOWED_HOSTS = 'localhost';
  process.env.ENABLE_HIREPOOL_INTEGRATION = 'true';
  process.env.HIREPOOL_LOCAL_API_BASE_URL = 'http://localhost:8000/';
  process.env.HIREPOOL_LOCAL_ALLOWED_ORIGINS =
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3100,http://127.0.0.1:3100,http://localhost:5173,http://127.0.0.1:5173';
}

test('HirePool In-Chat Password Login & Identity Verification Suite', async (t) => {
  setupEnvironment();
  const app = createApp();

  await t.test('Password Login 1: Successful candidate login returns opaque session & server-verified name without exposing raw tokens or password', async () => {
    _resetPasswordRateLimits();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options = {}) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        const parsed = new URL(urlStr);

        if (parsed.pathname === '/api/v1/auth/login') {
          assert.equal(options.method, 'POST');
          const body = JSON.parse(options.body);
          assert.equal(body.email, 'candidate@hirepool.test');
          assert.equal(body.password, 'CorrectPassword123!');
          return new Response(JSON.stringify({
            access_token: 'raw-upstream-jwt-access-token-12345',
            refresh_token: 'raw-upstream-refresh-token-67890',
            token_type: 'bearer',
            expires_in: 86400,
            user: { id: 'usr-cand-1', email: 'candidate@hirepool.test', user_type: 'candidate' }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (parsed.pathname === '/api/v1/auth/me') {
          assert.equal(options.headers.Authorization, 'Bearer raw-upstream-jwt-access-token-12345');
          return new Response(JSON.stringify({
            id: 'usr-cand-1',
            email: 'candidate@hirepool.test',
            user_type: 'candidate',
            is_active: true,
            is_verified: true
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (parsed.pathname === '/api/v1/candidates/profile') {
          assert.equal(options.headers.Authorization, 'Bearer raw-upstream-jwt-access-token-12345');
          return new Response(JSON.stringify({
            id: 'cand-profile-1',
            user_id: 'usr-cand-1',
            first_name: 'Jane',
            last_name: 'Doe'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
      };

      const res = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: 'candidate@hirepool.test',
          password: 'CorrectPassword123!'
        });

      assert.equal(res.status, 200);
      assert.ok(res.body.credential, 'Must have opaque SDK session credential');
      assert.match(res.body.credential, /^[A-Za-z0-9_-]{43}$/);
      assert.ok(res.body.sessionScope, 'Must have session scope');
      assert.match(res.body.sessionScope, /^[A-Za-z0-9_-]{1,128}$/);
      assert.ok(typeof res.body.expiresIn === 'number');
      assert.equal(res.body.identity.id, 'usr-cand-1');
      assert.equal(res.body.identity.email, 'candidate@hirepool.test');
      assert.equal(res.body.identity.userType, 'candidate');
      assert.equal(res.body.identity.name, 'Jane Doe');
      assert.equal(res.body.identity.organizationRole, null);

      // Strict security: NO raw tokens or passwords in response
      const resText = JSON.stringify(res.body);
      assert.equal(resText.includes('raw-upstream-jwt'), false);
      assert.equal(resText.includes('raw-upstream-refresh'), false);
      assert.equal(resText.includes('CorrectPassword123!'), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Password Login 2: Client and Consultancy roles resolve organization role and name', async () => {
    _resetPasswordRateLimits();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options = {}) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        const parsed = new URL(urlStr);

        if (parsed.pathname === '/api/v1/auth/login') {
          const body = JSON.parse(options.body);
          const isClient = body.email.includes('client') || body.email.includes('company');
          return new Response(JSON.stringify({
            access_token: isClient ? 'token-client-99' : 'token-consultancy-88',
            token_type: 'bearer',
            expires_in: 86400,
            user: { id: isClient ? 'usr-client-1' : 'usr-agency-1', email: body.email, user_type: isClient ? 'client' : 'consultancy' }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (parsed.pathname === '/api/v1/auth/me') {
          const isClient = options.headers.Authorization.includes('client');
          return new Response(JSON.stringify({
            id: isClient ? 'usr-client-1' : 'usr-agency-1',
            email: isClient ? 'hr@company.test' : 'lead@agency.test',
            user_type: isClient ? 'client' : 'consultancy',
            is_active: true,
            is_verified: true
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (parsed.pathname === '/api/v1/clients/me') {
          return new Response(JSON.stringify({
            role: 'admin',
            full_name: 'Alice Johnson',
            company_name: 'Acme Corp'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (parsed.pathname === '/api/v1/consultancies/me') {
          return new Response(JSON.stringify({
            role: 'recruiter',
            full_name: 'Bob Smith',
            consultancy_name: 'Apex Recruiting'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
      };

      // Test Client
      const resClient = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'hr@company.test', password: 'SecretPassword1!' });
      assert.equal(resClient.status, 200);
      assert.equal(resClient.body.identity.userType, 'client');
      assert.equal(resClient.body.identity.organizationRole, 'admin');
      assert.equal(resClient.body.identity.name, 'Alice Johnson');

      // Test Consultancy
      const resAgency = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'lead@agency.test', password: 'SecretPassword2!' });
      assert.equal(resAgency.status, 200);
      assert.equal(resAgency.body.identity.userType, 'consultancy');
      assert.equal(resAgency.body.identity.organizationRole, 'recruiter');
      assert.equal(resAgency.body.identity.name, 'Bob Smith');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Password Login 3: Wrong password returns masked generic 401 without revealing account existence', async () => {
    _resetPasswordRateLimits();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        return new Response(JSON.stringify({ detail: 'Incorrect email or password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const res = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'user@hirepool.test', password: 'WrongPassword' });

      assert.equal(res.status, 401);
      assert.equal(res.body.error?.message, 'Email or password is not correct.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Password Login 4: Unverified or inactive account returns masked generic 401', async () => {
    _resetPasswordRateLimits();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ detail: 'Account is unverified' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const res = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'unverified@hirepool.test', password: 'SomePassword' });

      assert.equal(res.status, 401);
      assert.equal(res.body.error?.message, 'Email or password is not correct.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Password Login 5: Rate limit triggers 429 after 5 failed attempts for same IP and email', async () => {
    _resetPasswordRateLimits();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ detail: 'Incorrect email or password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/hirepool/auth/password-login')
          .set('Origin', 'http://localhost:3000')
          .send({ email: 'attacker@target.test', password: `guess-${i}` });
        assert.equal(res.status, 401);
      }

      // 6th attempt should be blocked by rate limiter
      const blockedRes = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'attacker@target.test', password: 'guess-6' });
      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.body.error?.code, 'RATE_LIMIT_EXCEEDED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Password Login 6: MFA-required accounts return mfa_required status without creating session', async () => {
    _resetPasswordRateLimits();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({
          mfa_required: true,
          mfa_token: 'temp-mfa-token-1234',
          message: 'Two-factor authentication required'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };

      const res = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: 'mfa.user@hirepool.test', password: 'MfaPassword123!' });

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'mfa_required');
      assert.ok(res.body.message.includes('MFA is required'));
      assert.equal(res.body.credential, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('Password Login 7: Cross-origin requests from disallowed origins return 403', async () => {
    _resetPasswordRateLimits();
    const res = await request(app)
      .post('/api/hirepool/auth/password-login')
      .set('Origin', 'http://evil-attacker.com')
      .send({ email: 'someone@example.com', password: 'Password123' });

    assert.equal(res.status, 403);
  });

  await t.test('Password Login 8: Validation fails for empty email, malformed email, or missing password', async () => {
    _resetPasswordRateLimits();
    const badRequests = [
      { email: '', password: 'ValidPassword1' },
      { email: 'not-an-email', password: 'ValidPassword1' },
      { email: 'valid@example.com', password: '' },
      { email: null, password: 'ValidPassword1' }
    ];

    for (const reqBody of badRequests) {
      const res = await request(app)
        .post('/api/hirepool/auth/password-login')
        .set('Origin', 'http://localhost:3000')
        .send(reqBody);
      assert.equal(res.status, 400);
      assert.equal(res.body.error?.code, 'INVALID_REQUEST');
    }
  });

  await t.test('Password Login 9: Browser storage tokens are never read or adopted (syncFromHostStorage is no-op)', () => {
    const mockSdk = { initialized: false, setContext: () => {} };
    const bridge = new HirePoolBridge(mockSdk);

    // Populate fake tokens in global window mock
    const fakeStorage = {
      getItem: (key) => {
        if (key === 'access_token') return 'stolen-jwt-token';
        if (key === 'user') return JSON.stringify({ id: 'stolen-user', user_type: 'candidate' });
        return null;
      }
    };
    const origWindow = globalThis.window;
    try {
      globalThis.window = {
        localStorage: fakeStorage,
        sessionStorage: fakeStorage,
        location: { pathname: '/' }
      };

      bridge.syncFromHostStorage();

      // Ensure no credentials were read or adopted
      assert.equal(bridge.sdkCredential, null);
      assert.equal(bridge.authState.status, 'anonymous');
      assert.equal(bridge.authState.identity, null);
    } finally {
      globalThis.window = origWindow;
    }
  });

  await t.test('Password Login 10: getHirePoolGreetingForAuthState uses verified user name for greetings', () => {
    // 1. Candidate with name
    const candidateGreeting = getHirePoolGreetingForAuthState({
      status: 'authenticated',
      identity: { id: 'cand-1', email: 'jane@example.com', userType: 'candidate', name: 'Jane' }
    });
    assert.equal(candidateGreeting.greeting, 'Welcome back, Jane. I can help with matching jobs, applications, and your profile.');

    // 2. Client with full name
    const clientGreeting = getHirePoolGreetingForAuthState({
      status: 'authenticated',
      identity: { id: 'client-1', email: 'alice@company.com', userType: 'client', name: 'Alice Johnson' }
    });
    assert.equal(clientGreeting.greeting, 'Welcome back, Alice Johnson. I can help with your hiring dashboard and jobs.');

    // 3. Consultancy with name
    const consultancyGreeting = getHirePoolGreetingForAuthState({
      status: 'authenticated',
      identity: { id: 'agency-1', email: 'bob@agency.com', userType: 'consultancy', name: 'Bob' }
    });
    assert.equal(consultancyGreeting.greeting, 'Welcome back, Bob. I can help with placements and your consultancy dashboard.');

    // 4. Fallback when name is absent
    const fallbackGreeting = getHirePoolGreetingForAuthState({
      status: 'authenticated',
      identity: { id: 'cand-2', email: 'noname@example.com', userType: 'candidate' }
    });
    assert.equal(fallbackGreeting.greeting, 'Welcome back. I can help with matching jobs, applications, and your profile.');

    // 5. Anonymous guest
    const guestGreeting = getHirePoolGreetingForAuthState({ status: 'anonymous', identity: null });
    assert.ok(guestGreeting.greeting.includes('Log in or sign up'));
    assert.equal(guestGreeting.prompts.length, 2);
  });
});
