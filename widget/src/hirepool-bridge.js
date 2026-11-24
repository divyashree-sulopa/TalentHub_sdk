import {
  HIREPOOL_LOCAL_DASHBOARD_ORIGINS
} from '../../config/hirepool-site-policy.js';
import {
  isHirePoolAccountWindow,
  clearHirePoolAccountWindow
} from './hirepool-login.js';

export const HIREPOOL_ASSISTANT_GREETING =
  'Welcome to HirePool. Log in or sign up for account-specific job and application help.';

export const HIREPOOL_GUEST_SUGGESTED_PROMPTS = [
  'Log in to HirePool',
  'Sign up for HirePool'
];

export const AUTH_HANDOFF_ORIGINS = new Set(HIREPOOL_LOCAL_DASHBOARD_ORIGINS);

export function getHirePoolGreetingForAuthState(state) {
  if (state?.status !== 'authenticated' || !state?.identity) {
    return {
      greeting: HIREPOOL_ASSISTANT_GREETING,
      prompts: HIREPOOL_GUEST_SUGGESTED_PROMPTS
    };
  }
  const userType = state.identity.user_type || state.identity.userType;
  const name = state.identity.name || state.identity.first_name || state.identity.firstName;
  const namePrefix = name ? `Welcome back, ${name}.` : 'Welcome back.';
  switch (userType) {
    case 'candidate':
      return {
        greeting: `${namePrefix} I can help with matching jobs, applications, and your profile.`,
        prompts: []
      };
    case 'client':
      return {
        greeting: `${namePrefix} I can help with your hiring dashboard and jobs.`,
        prompts: []
      };
    case 'consultancy':
      return {
        greeting: `${namePrefix} I can help with placements and your consultancy dashboard.`,
        prompts: []
      };
    default:
      return {
        greeting: name ? `Welcome back, ${name}.` : 'Welcome back to HirePool.',
        prompts: []
      };
  }
}

export function createHirePoolPageContext(pathname, auth = { status: 'unavailable', identity: null, role: null }) {
  const isAuth = auth?.status === 'authenticated';
  const identity = auth?.identity || null;
  const userType = identity ? (identity.user_type || identity.userType) : null;
  const role = auth?.role ?? (userType === 'candidate' ? 'candidate' : (identity?.role ?? identity?.organizationRole ?? null));
  const availableCapabilities = !isAuth
    ? []
    : userType === 'candidate' || role === 'candidate'
      ? [
          'identity:get',
          'profile:get',
          'profile:update',
          'jobs:read',
          'applications:read',
          'applications:submit',
          'applications:withdraw'
        ]
      : ['identity:get', 'profile:get'];

  const currentPath = typeof pathname === 'string' && pathname.trim()
    ? (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)
    : (typeof window !== 'undefined' ? (window.location.pathname.length > 1 ? window.location.pathname.replace(/\/+$/, '') : window.location.pathname) : '/');

  return {
    application: { id: 'hirepool', name: 'HirePool' },
    authentication: {
      status: auth?.status || (isAuth ? 'authenticated' : 'anonymous'),
      identity: identity ? {
        id: String(identity.id),
        email: identity.email,
        name: identity.name || null,
        user_type: userType,
        role: role,
        is_active: identity.is_active ?? true,
        has_completed_onboarding: identity.has_completed_onboarding ?? true
      } : null,
      role: role
    },
    currentPage: {
      path: currentPath,
      title: typeof document !== 'undefined' ? document.title : ''
    },
    selectedEntity: null,
    workflow: isAuth ? 'authenticated_public_site' : 'public_marketing_site',
    availableCapabilities
  };
}

export function isVerifiedHirePoolIdentity(value) {
  if (!value || typeof value !== 'object') return false;
  const id = value.id;
  const email = value.email;
  const userType = value.userType || value.user_type;
  const orgRole = 'organizationRole' in value ? value.organizationRole : value.role;
  return (
    typeof id === 'string' &&
    Boolean(id) &&
    typeof email === 'string' &&
    ['candidate', 'client', 'consultancy'].includes(String(userType)) &&
    (typeof orgRole === 'string' || orgRole === null)
  );
}

export class HirePoolBridge {
  constructor(sdk, options = {}) {
    this.sdk = sdk;
    this.currentPathname = options.initialPath || (typeof window !== 'undefined' ? window.location.pathname : '/');
    this.authState = {
      status: 'anonymous',
      identity: null,
      role: null
    };
    this.lastVerifiedIdentity = null;
    this.sdkCredential = null;
    this.sdkSessionScope = null;
    this.sessionExpiryTimer = null;

    if (typeof window !== 'undefined') {
      this._setupStorageListener();
      this._setupRouteListener();
      this._setupMessageListener();
      this.syncFromHostStorage();
    }
  }

  _setupMessageListener() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    this._boundMessageHandler = (e) => {
      this.handleAuthMessage(e);
    };
    window.addEventListener('message', this._boundMessageHandler);
  }

  syncFromHostStorage() {
    // Deprecated and neutralized: tokens are never read from browser storage.
    // Raw tokens are never adopted from localStorage or sessionStorage.
    return;
  }

  _setupStorageListener() {
    // Neutralized: no tokens or sessions are read from window storage events.
  }

  _setupRouteListener() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const checkPath = () => {
      if (window.location && window.location.pathname !== this.currentPathname) {
        this.updatePath(window.location.pathname);
      }
    };
    window.addEventListener('popstate', checkPath);
    try {
      const origPush = window.history?.pushState;
      if (typeof origPush === 'function') {
        const self = this;
        window.history.pushState = function(...args) {
          const ret = origPush.apply(this, args);
          checkPath();
          return ret;
        };
      }
      const origReplace = window.history?.replaceState;
      if (typeof origReplace === 'function') {
        const self = this;
        window.history.replaceState = function(...args) {
          const ret = origReplace.apply(this, args);
          checkPath();
          return ret;
        };
      }
    } catch {}
  }

  getContext() {
    return createHirePoolPageContext(this.currentPathname, this.authState);
  }

  updatePath(pathname) {
    this.currentPathname = pathname;
    if (this.sdk?.initialized) {
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    }
  }

  getHostIntegrationConfig() {
    return {
      version: 1,
      application: { id: 'hirepool-local-app', name: 'HirePool' },
      getAuthHeaders: async () => this.sdkCredential
        ? { Authorization: `Bearer ${this.sdkCredential}` }
        : {},
      getSessionScope: async () => this.sdkCredential
        ? this.sdkSessionScope
        : null,
      getIdentity: async () => {
        const current = this.authState;
        if (current.status !== 'authenticated' || !current.identity) return null;
        return {
          id: String(current.identity.id),
          user_type: current.identity.user_type,
          role: current.identity.role ?? current.role ?? null
        };
      },
      contextProvider: async () => createHirePoolPageContext(this.currentPathname, this.authState),
      executeAction: async ({ confirmationToken }) => {
        if (!confirmationToken || !/^[A-Za-z0-9_-]{43}$/.test(confirmationToken)) {
          throw new Error('This action has no valid server confirmation. Ask the assistant to prepare it again.');
        }
        if (!this.sdkCredential) {
          throw new Error('Your verified HirePool session expired. Sign in again before confirming this action.');
        }
        try {
          return await this.sdk.apiClient.confirmDynamicApiAction(confirmationToken);
        } catch (error) {
          if (error?.status === 401) {
            await this.handleExpiryOn401();
          }
          throw error;
        }
      },
      cancelHostAction: async ({ confirmationToken }) => {
        if (!confirmationToken || !/^[A-Za-z0-9_-]{43}$/.test(confirmationToken)) {
          throw new Error('This action has no valid server confirmation to cancel.');
        }
        if (!this.sdkCredential) {
          throw new Error('Your HirePool session expired before the pending confirmation could be cancelled.');
        }
        return this.sdk.apiClient.cancelDynamicApiAction(confirmationToken);
      }
    };
  }

  async handleAuthMessage(event) {
    if (!event || typeof event !== 'object') return;
    if (!AUTH_HANDOFF_ORIGINS.has(event.origin) || !isHirePoolAccountWindow(event.source)) {
      return;
    }
    const data = event.data;
    if (!this.sdk?.initialized || !data || typeof data !== 'object' || data.version !== 1) return;

    if (data.type === 'hirepool-auth:error') {
      this.handleAuthError(data.message);
      return;
    }
    if (data.type === 'hirepool-auth:logout') {
      await this.clearAuthSession(event.source);
      return;
    }
    if (data.type === 'hirepool-auth:session') {
      await this.setAuthSession(data);
    }
  }

  handleAuthError(message) {
    if (typeof message === 'string' && message.length <= 300) {
      this.sdk.displayNotice(message);
    }
  }

  async setAuthSession(data) {
    if (
      !data ||
      (data.type !== undefined && data.type !== 'hirepool-auth:session') ||
      typeof data.credential !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(data.credential) ||
      typeof data.sessionScope !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(data.sessionScope) ||
      typeof data.expiresIn !== 'number' ||
      !Number.isInteger(data.expiresIn) ||
      data.expiresIn < 1000 ||
      data.expiresIn > 300000 ||
      !isVerifiedHirePoolIdentity(data.identity)
    ) {
      return;
    }

    const identity = data.identity;
    const previousIdentity = this.lastVerifiedIdentity || this.authState.identity;
    const previousUserType = previousIdentity && 'userType' in previousIdentity
      ? previousIdentity.userType
      : previousIdentity?.user_type;
    const previousRole = previousIdentity && 'organizationRole' in previousIdentity
      ? previousIdentity.organizationRole
      : previousIdentity?.role;
    const accountChanged = Boolean(
      previousIdentity &&
      (
        String(previousIdentity.id) !== String(identity.id) ||
        previousUserType !== (identity.userType || identity.user_type) ||
        previousRole !== (identity.organizationRole ?? identity.role)
      )
    );
    const previousCredential = this.sdkCredential;
    if (this.sessionExpiryTimer !== null) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
    this.sdkCredential = data.credential;
    this.sdkSessionScope = data.sessionScope;
    this.authState = {
      status: 'authenticated',
      identity: {
        id: String(identity.id),
        email: identity.email,
        name: identity.name || null,
        user_type: identity.userType || identity.user_type,
        role: identity.organizationRole ?? identity.role ?? null,
        is_active: true,
        has_completed_onboarding: true
      },
      role: identity.organizationRole ?? identity.role ?? null
    };
    this.lastVerifiedIdentity = identity;

    if (this.sdk.apiClient) {
      this.sdk.apiClient.setAuthenticatedSession({
        credential: data.credential,
        sessionScope: data.sessionScope,
        expiresIn: data.expiresIn,
        identity: this.authState.identity
      });
    }

    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));

    try {
      if (accountChanged) {
        this.sdk.clearConversationLocal();
      }
      if (previousCredential && previousCredential !== data.credential) {
        try {
          await this.sdk.apiClient.revokeHirePoolSession(previousCredential);
        } catch (error) {
          console.error('[HirePool Assistant] Could not revoke the previous account session.', error);
        }
      }
      await this.sdk.refreshSessionScope({ preserveConversation: !accountChanged });
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
      const welcome = getHirePoolGreetingForAuthState(this.authState);
      this.sdk.setGreeting(welcome.greeting, welcome.prompts);

      this.sessionExpiryTimer = setTimeout(() => {
        this._handleSessionExpiry(data.credential);
      }, data.expiresIn);
    } catch (error) {
      console.error('[HirePool Assistant] Verified session activation failed.', error);
      await this._handleSessionActivationFailure(data.credential);
    }
  }

  async _handleSessionExpiry(expiredCredential) {
    this.sdkCredential = null;
    this.sdkSessionScope = null;
    this.authState = { status: 'anonymous', identity: null, role: null };
    this.sessionExpiryTimer = null;
    if (this.sdk.apiClient) {
      this.sdk.apiClient.clearAuthenticatedSession();
    }
    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    if (expiredCredential) {
      try {
        await this.sdk.apiClient.revokeHirePoolSession(expiredCredential);
      } catch (error) {
        console.error('[HirePool Assistant] Could not revoke the expired SDK session.', error);
      }
    }
    this.sdk.invalidatePendingActions(
      'This action cannot be reused after session expiry. Ask me to re-check the details and prepare a fresh confirmation.'
    );
    try {
      await this.sdk.refreshSessionScope({ preserveConversation: true });
    } catch (error) {
      console.error('[HirePool Assistant] Could not refresh session scope on expiry.', error);
    }
    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    const guestWelcome = getHirePoolGreetingForAuthState(this.authState);
    this.sdk.setGreeting(guestWelcome.greeting, guestWelcome.prompts);
    this.sdk.displayHirePoolLoginNotice(
      'Your verified HirePool assistant session expired. Sign in again to access account data. This conversation is being kept; I will revalidate your identity and refresh data after sign-in.'
    );
  }

  async _handleSessionActivationFailure(failedCredential) {
    this.sdkCredential = null;
    this.sdkSessionScope = null;
    if (this.sessionExpiryTimer !== null) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
    this.authState = { status: 'anonymous', identity: null, role: null };
    if (this.sdk.apiClient) {
      this.sdk.apiClient.clearAuthenticatedSession();
    }
    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    try {
      await this.sdk.apiClient.revokeHirePoolSession(failedCredential);
    } catch (revokeError) {
      console.error('[HirePool Assistant] Could not revoke the failed SDK session.', revokeError);
    }
    this.sdk.invalidatePendingActions(
      'This action cannot be reused. Ask me to re-check the details and prepare a fresh confirmation.'
    );
    try {
      await this.sdk.refreshSessionScope({ preserveConversation: true });
    } catch (error) {
      console.error('[HirePool Assistant] Could not refresh session scope on activation failure.', error);
    }
    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    const guestWelcome = getHirePoolGreetingForAuthState(this.authState);
    this.sdk.setGreeting(guestWelcome.greeting, guestWelcome.prompts);
    this.sdk.displayHirePoolLoginNotice(
      'HirePool login could not be activated for the assistant. Sign in again; this conversation has been kept.'
    );
  }

  async clearAuthSession(source) {
    const previousCredential = this.sdkCredential;
    this.sdkCredential = null;
    this.sdkSessionScope = null;
    if (this.sessionExpiryTimer !== null) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
    this.authState = { status: 'anonymous', identity: null, role: null };
    this.lastVerifiedIdentity = null;
    if (this.sdk.apiClient) {
      this.sdk.apiClient.clearAuthenticatedSession();
    }
    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    if (source) {
      clearHirePoolAccountWindow(source);
    }
    try {
      if (previousCredential) {
        try {
          await this.sdk.apiClient.revokeHirePoolSession(previousCredential);
        } catch (error) {
          console.error('[HirePool Assistant] Could not revoke the signed-out SDK session.', error);
        }
      }
      this.sdk.clearConversationLocal();
      await this.sdk.refreshSessionScope({ preserveConversation: false });
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
      const welcome = getHirePoolGreetingForAuthState(this.authState);
      this.sdk.setGreeting(welcome.greeting, welcome.prompts);
    } catch (error) {
      console.error('[HirePool Assistant] Could not clear the signed-out assistant session.', error);
      this.sdk.displayNotice('You are signed out. The assistant could not clear local conversation state.');
    }
  }

  async handleExpiryOn401() {
    const expiredCredential = this.sdkCredential;
    this.sdkCredential = null;
    this.sdkSessionScope = null;
    this.authState = { status: 'anonymous', identity: null, role: null };
    if (this.sessionExpiryTimer !== null) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
    if (this.sdk.apiClient) {
      this.sdk.apiClient.clearAuthenticatedSession();
    }
    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    if (expiredCredential) {
      try {
        await this.sdk.apiClient.revokeHirePoolSession(expiredCredential);
      } catch (error) {
        console.error('[HirePool Assistant] Could not revoke the expired SDK session.', error);
      }
    }
    this.sdk.invalidatePendingActions(
      'This action cannot be reused after session expiry. Ask me to re-check the details and prepare a fresh confirmation.'
    );
    try {
      await this.sdk.refreshSessionScope({ preserveConversation: true });
    } catch (error) {
      console.error('[HirePool Assistant] Could not refresh session scope on 401.', error);
    }
    this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
    const guestWelcome = getHirePoolGreetingForAuthState(this.authState);
    this.sdk.setGreeting(guestWelcome.greeting, guestWelcome.prompts);
    this.sdk.displayHirePoolLoginNotice(
      'Your HirePool session expired. Sign in again to continue. This conversation has been kept; your identity and permissions will be revalidated before account data is accessed.'
    );
  }

  destroy() {
    if (this._boundMessageHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('message', this._boundMessageHandler);
      this._boundMessageHandler = null;
    }
    if (this.sessionExpiryTimer !== null) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
    this.sdkCredential = null;
    this.sdkSessionScope = null;
    this.authState = { status: 'anonymous', identity: null, role: null };
    this.lastVerifiedIdentity = null;
  }
}