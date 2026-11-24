import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HirePoolBridge,
  HIREPOOL_ASSISTANT_GREETING,
  HIREPOOL_GUEST_SUGGESTED_PROMPTS,
  createHirePoolPageContext,
  getHirePoolGreetingForAuthState,
  isVerifiedHirePoolIdentity
} from '../widget/src/hirepool-bridge.js';
import { discoverOperationsForRole } from '../backend/src/dynamic-api/catalog.js';
import { getAssistantConfig, ASSISTANT_PRESETS } from '../config/assistant-presets.js';
import { WIDGET_DEFAULTS } from '../config/defaults.js';
import openapiFixture from './fixtures/hirepool-openapi.json' with { type: 'json' };
import { parseOpenApiSpec } from '../backend/src/dynamic-api/openapi.js';

test('HirePool Bridge & SDK Migration Suite', async (t) => {
  await t.test('1. Role greetings and suggested prompts', () => {
    // Guest
    const guestGreeting = getHirePoolGreetingForAuthState({ status: 'anonymous', identity: null });
    assert.equal(guestGreeting.greeting, HIREPOOL_ASSISTANT_GREETING);
    assert.deepEqual(guestGreeting.prompts, HIREPOOL_GUEST_SUGGESTED_PROMPTS);

    // Candidate
    const candidateGreeting = getHirePoolGreetingForAuthState({
      status: 'authenticated',
      identity: { id: 'cand-1', email: 'c@test.com', user_type: 'candidate' }
    });
    assert.match(candidateGreeting.greeting, /matching jobs, applications/);
    assert.deepEqual(candidateGreeting.prompts, []);

    // Client
    const clientGreeting = getHirePoolGreetingForAuthState({
      status: 'authenticated',
      identity: { id: 'cli-1', email: 'cli@test.com', user_type: 'client' }
    });
    assert.match(clientGreeting.greeting, /hiring dashboard and jobs/);
    assert.deepEqual(clientGreeting.prompts, []);

    // Consultancy
    const consultancyGreeting = getHirePoolGreetingForAuthState({
      status: 'authenticated',
      identity: { id: 'con-1', email: 'con@test.com', user_type: 'consultancy' }
    });
    assert.match(consultancyGreeting.greeting, /placements and your consultancy dashboard/);
    assert.deepEqual(consultancyGreeting.prompts, []);
  });

  await t.test('2. Page context creation for Guest, Candidate, and Client', () => {
    // Guest context
    const guestCtx = createHirePoolPageContext('/features');
    assert.equal(guestCtx.application.id, 'hirepool');
    assert.equal(guestCtx.authentication.status, 'unavailable');
    assert.equal(guestCtx.currentPage.path, '/features');
    assert.equal(guestCtx.workflow, 'public_marketing_site');
    assert.deepEqual(guestCtx.availableCapabilities, []);

    // Anonymous context
    const anonCtx = createHirePoolPageContext('/features', { status: 'anonymous', identity: null });
    assert.equal(anonCtx.authentication.status, 'anonymous');

    // Candidate context
    const candCtx = createHirePoolPageContext('/pricing', {
      status: 'authenticated',
      identity: { id: 'c1', email: 'c1@test.com', user_type: 'candidate' }
    });
    assert.equal(candCtx.authentication.status, 'authenticated');
    assert.equal(candCtx.workflow, 'authenticated_public_site');
    assert.ok(candCtx.availableCapabilities.includes('jobs:read'));
    assert.ok(candCtx.availableCapabilities.includes('applications:submit'));

    // Client context
    const clientCtx = createHirePoolPageContext('/', {
      status: 'authenticated',
      identity: { id: 'cl1', email: 'cl1@test.com', user_type: 'client', role: 'admin' }
    });
    assert.equal(clientCtx.authentication.status, 'authenticated');
    assert.deepEqual(clientCtx.availableCapabilities, ['identity:get', 'profile:get']);
  });

  await t.test('3. Identity verification schema rules', () => {
    assert.equal(isVerifiedHirePoolIdentity(null), false);
    assert.equal(isVerifiedHirePoolIdentity({}), false);
    assert.equal(isVerifiedHirePoolIdentity({ id: '1', email: 'a@b.com', userType: 'unknown' }), false);
    assert.equal(isVerifiedHirePoolIdentity({ id: '1', email: 'a@b.com', userType: 'candidate', organizationRole: null }), true);
    assert.equal(isVerifiedHirePoolIdentity({ id: '2', email: 'b@b.com', userType: 'client', organizationRole: 'admin' }), true);
    assert.equal(isVerifiedHirePoolIdentity({ id: '3', email: 'c@b.com', userType: 'consultancy', organizationRole: null }), true);
  });

  await t.test('4. HirePoolBridge session lifecycle: activation, expiry timer, notice, and scope refresh', async () => {
    const revokedTokens = [];
    const notices = [];
    const contextUpdates = [];
    const greetingUpdates = [];
    let invalidatedMsg = null;
    let refreshedScopeCount = 0;
    let clearedLocalConvo = false;

    const mockSdk = {
      initialized: true,
      apiClient: {
        setAuthenticatedSession() {},
        clearAuthenticatedSession() {},
        async revokeHirePoolSession(token) {
          revokedTokens.push(token);
        }
      },
      setContext(ctx) {
        contextUpdates.push(ctx);
      },
      setGreeting(g, p) {
        greetingUpdates.push({ g, p });
      },
      invalidatePendingActions(msg) {
        invalidatedMsg = msg;
      },
      displayHirePoolLoginNotice(msg) {
        notices.push(msg);
      },
      displayNotice(msg) {
        notices.push(msg);
      },
      clearConversationLocal() {
        clearedLocalConvo = true;
      },
      async refreshSessionScope() {
        refreshedScopeCount += 1;
      }
    };

    const bridge = new HirePoolBridge(mockSdk, { initialPath: '/features' });

    // Activate session
    const validToken = 'A'.repeat(43);
    await bridge.setAuthSession({
      type: 'hirepool-auth:session',
      version: 1,
      credential: validToken,
      sessionScope: 'scope-user-1',
      expiresIn: 1200,
      identity: {
        id: 'usr-1',
        email: 'usr1@test.com',
        userType: 'candidate',
        organizationRole: null
      }
    });

    assert.equal(bridge.authState.status, 'authenticated');
    assert.equal(bridge.sdkCredential, validToken);
    assert.equal(refreshedScopeCount, 1);
    assert.match(greetingUpdates[greetingUpdates.length - 1].g, /matching jobs/);

    // Host integration config works
    const hostIntegration = bridge.getHostIntegrationConfig();
    const headers = await hostIntegration.getAuthHeaders();
    assert.equal(headers.Authorization, `Bearer ${validToken}`);
    const scope = await hostIntegration.getSessionScope();
    assert.equal(scope, 'scope-user-1');

    // Trigger session expiry manually
    await bridge._handleSessionExpiry(validToken);

    assert.equal(bridge.authState.status, 'anonymous');
    assert.equal(bridge.sdkCredential, null);
    assert.ok(revokedTokens.includes(validToken));
    assert.ok(invalidatedMsg.includes('session expiry'));
    assert.ok(notices.some(n => n.includes('expired')));
    assert.equal(refreshedScopeCount, 2);

    bridge.destroy();
  });

  await t.test('5. HirePoolBridge handles 401 error during dynamic API confirmation', async () => {
    const revokedTokens = [];
    const notices = [];
    let invalidatedMsg = null;

    const mockSdk = {
      initialized: true,
      apiClient: {
        setAuthenticatedSession() {},
        clearAuthenticatedSession() {},
        async revokeHirePoolSession(token) {
          revokedTokens.push(token);
        }
      },
      setContext() {},
      setGreeting() {},
      invalidatePendingActions(msg) {
        invalidatedMsg = msg;
      },
      displayHirePoolLoginNotice(msg) {
        notices.push(msg);
      },
      displayNotice(msg) {
        notices.push(msg);
      },
      clearConversationLocal() {},
      async refreshSessionScope() {}
    };

    const bridge = new HirePoolBridge(mockSdk);
    const validToken = 'B'.repeat(43);
    await bridge.setAuthSession({
      type: 'hirepool-auth:session',
      version: 1,
      credential: validToken,
      sessionScope: 'scope-user-2',
      expiresIn: 2000,
      identity: {
        id: 'usr-2',
        email: 'usr2@test.com',
        userType: 'client',
        organizationRole: 'admin'
      }
    });

    // 401 happens
    await bridge.handleExpiryOn401();

    assert.equal(bridge.authState.status, 'anonymous');
    assert.equal(bridge.sdkCredential, null);
    assert.ok(revokedTokens.includes(validToken));
    assert.ok(invalidatedMsg.includes('session expiry'));
    assert.ok(notices.some(n => n.includes('expired')));

    bridge.destroy();
  });

  await t.test('6. HirePoolBridge handles logout and revokes active credential', async () => {
    const revokedTokens = [];
    let clearedConvo = false;

    const mockSdk = {
      initialized: true,
      apiClient: {
        setAuthenticatedSession() {},
        clearAuthenticatedSession() {},
        async revokeHirePoolSession(token) {
          revokedTokens.push(token);
        }
      },
      setContext() {},
      setGreeting() {},
      invalidatePendingActions() {},
      displayHirePoolLoginNotice() {},
      displayNotice() {},
      clearConversationLocal() {
        clearedConvo = true;
      },
      async refreshSessionScope() {}
    };

    const bridge = new HirePoolBridge(mockSdk);
    const validToken = 'C'.repeat(43);
    await bridge.setAuthSession({
      type: 'hirepool-auth:session',
      version: 1,
      credential: validToken,
      sessionScope: 'scope-user-3',
      expiresIn: 3000,
      identity: {
        id: 'usr-3',
        email: 'usr3@test.com',
        userType: 'consultancy',
        organizationRole: 'recruiter'
      }
    });

    await bridge.clearAuthSession();

    assert.equal(bridge.authState.status, 'anonymous');
    assert.equal(bridge.sdkCredential, null);
    assert.ok(revokedTokens.includes(validToken));
    assert.equal(clearedConvo, true);

    bridge.destroy();
  });

  await t.test('7. Dynamic discovery from OpenAPI specification matches operations by role', () => {
    const parsedSpec = parseOpenApiSpec(openapiFixture);

    const candidateOps = discoverOperationsForRole(parsedSpec, 'candidate');
    assert.ok(candidateOps.length > 0);
    assert.ok(candidateOps.includes('get_my_profile_api_v1_candidates_profile_get'));
    assert.ok(candidateOps.includes('update_my_profile_api_v1_candidates_profile_put'));
    assert.ok(candidateOps.includes('get_my_applications_api_v1_applications_my_applications_get'));

    const clientOps = discoverOperationsForRole(parsedSpec, 'client');
    assert.ok(clientOps.length > 0);
    assert.ok(clientOps.includes('get_my_company_profile_api_v1_clients_profile_get'));
    assert.ok(clientOps.includes('get_dashboard_stats_api_v1_clients_dashboard_get'));
    assert.ok(clientOps.includes('create_job_api_v1_jobs_post'));

    const consultancyOps = discoverOperationsForRole(parsedSpec, 'consultancy');
    assert.ok(consultancyOps.length > 0);
    assert.ok(consultancyOps.includes('get_my_consultancy_profile_api_v1_consultancies_profile_get'));
    assert.ok(consultancyOps.includes('list_candidates_api_v1_consultancies_candidates_get'));
    assert.ok(consultancyOps.includes('add_candidate_api_v1_consultancies_candidates_post'));
    assert.ok(consultancyOps.includes('create_consultancy_application_api_v1_applications_consultancy_post'));
  });

  await t.test('8. HirePool-specific assistant configuration presets and widget defaults', () => {
    assert.equal(WIDGET_DEFAULTS.name, 'HirePool Assistant');
    assert.equal(WIDGET_DEFAULTS.primaryColor, '#a3e635');
    assert.ok(WIDGET_DEFAULTS.greeting.includes('HirePool'));

    const config = getAssistantConfig();
    assert.equal(config.assistantId, 'hirepool');
    assert.equal(config.name, 'HirePool Assistant');
    assert.equal(config.primaryColor, '#a3e635');
    assert.ok(config.greeting.includes('HirePool'));
    assert.ok(config.suggestedPrompts.length >= 2);
  });

  await t.test('9. Single-mounting script support and AssistantSDK.mount method', async () => {
    const fs = await import('node:fs/promises');
    const sdkSrc = await fs.readFile(new URL('../widget/src/sdk.js', import.meta.url), 'utf8');
    assert.ok(sdkSrc.includes('async mount(options = {})'));
    assert.ok(sdkSrc.includes('static async mount(options = {})'));
    assert.ok(sdkSrc.includes('window.HirePoolAssistant = sdkInstance'));
    assert.ok(sdkSrc.includes('data-auto-mount'));
  });

  await t.test('10. Bridge host credential sync parses token and user safely', () => {
    const bridge = new HirePoolBridge({ initialized: false });
    assert.equal(typeof bridge.syncFromHostStorage, 'function');
    assert.equal(bridge.authState.status, 'anonymous');
    bridge.destroy();
  });
});