/**
 * In-app bot sign-in.
 *
 * The HirePool app already holds the user's access token. The host passes a
 * `getAccessToken()` callback; this class exchanges that token at the SDK
 * backend (`POST /api/hirepool/session`) for a short-lived opaque assistant
 * credential, re-exchanges shortly before it expires, and never stores the
 * app's token itself. The backend verifies the identity with HirePool; nothing
 * the browser says about the user's role is trusted.
 */

const REFRESH_MARGIN_MS = 30 * 1000;
const MAX_TOKEN_LENGTH = 8192;
export const HIREPOOL_APP_APPLICATION_ID = 'hirepool-local-app';

export class HirePoolAppSession {
  /**
   * @param {object} options
   * @param {string} options.apiUrl SDK backend origin ('' for same origin)
   * @param {() => (string|null|Promise<string|null>)} options.getAccessToken
   * @param {typeof fetch} [options.fetchImpl]
   */
  constructor({ apiUrl = '', getAccessToken, fetchImpl } = {}) {
    if (typeof getAccessToken !== 'function') {
      throw new TypeError('hirePoolApp.getAccessToken must be a function that returns the signed-in user\'s access token');
    }
    this.apiUrl = String(apiUrl || '').replace(/\/+$/, '');
    this.getAccessToken = getAccessToken;
    this.fetchImpl = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.session = null;
    this.expiresAt = 0;
    this.pending = null;
    this.ended = false;
    this.exchangedToken = null;
  }

  get identity() {
    return this.session?.identity || null;
  }

  get role() {
    return this.session?.identity?.userType || this.session?.identity?.user_type || null;
  }

  async _readAccessToken() {
    const token = await this.getAccessToken();
    if (typeof token !== 'string' || !token.trim() || token.length > MAX_TOKEN_LENGTH) return null;
    return token.trim();
  }

  async _exchange() {
    const accessToken = await this._readAccessToken();
    if (!accessToken) {
      this.session = null;
      this.expiresAt = 0;
      return null;
    }
    const response = await this.fetchImpl(`${this.apiUrl}/api/hirepool/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: '{}',
      credentials: 'omit',
      cache: 'no-store'
    });
    let body = null;
    try {
      body = await response.json();
    } catch {}
    if (!response.ok || typeof body?.credential !== 'string') {
      this.session = null;
      this.expiresAt = 0;
      const error = new Error(body?.error?.message || `HirePool sign-in could not be verified (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }
    const ttl = Number(body.expiresIn);
    this.exchangedToken = accessToken;
    this.session = body;
    this.expiresAt = Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : 5 * 60 * 1000);
    return body;
  }

  /** A valid assistant credential, exchanging or renewing when needed. */
  async getSession() {
    if (this.ended) return null;
    // The app refreshed its token or signed out/in as someone else: start over.
    const currentToken = await this._readAccessToken();
    if (currentToken !== this.exchangedToken) {
      this.invalidate();
      if (!currentToken) return null;
    }
    if (this.session && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) return this.session;
    if (!this.pending) {
      this.pending = this._exchange().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /** Force a fresh exchange, e.g. after the app refreshed its token or a 401. */
  invalidate() {
    this.session = null;
    this.expiresAt = 0;
    this.exchangedToken = null;
  }

  /** Revoke the assistant credential (used when the user logs out of the app). */
  async end() {
    const credential = this.session?.credential;
    this.ended = true;
    this.invalidate();
    if (!credential) return;
    try {
      await this.fetchImpl(`${this.apiUrl}/api/hirepool/session/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credential}` },
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true
      });
    } catch {
      // The credential expires on its own within minutes.
    }
  }

  getHostIntegrationConfig(sdk) {
    return {
      version: 1,
      application: { id: HIREPOOL_APP_APPLICATION_ID, name: 'HirePool' },
      getAuthHeaders: async () => {
        const session = await this.getSession().catch(() => null);
        return session?.credential ? { Authorization: `Bearer ${session.credential}` } : {};
      },
      getSessionScope: async () => {
        const session = await this.getSession().catch(() => null);
        return session?.sessionScope || null;
      },
      getIdentity: async () => {
        const identity = this.identity;
        if (!identity?.id) return null;
        return {
          id: String(identity.id),
          user_type: identity.userType || identity.user_type || null,
          role: identity.organizationRole || null
        };
      },
      executeAction: async ({ confirmationToken }) => {
        if (!confirmationToken || !/^[A-Za-z0-9_-]{43}$/.test(confirmationToken)) {
          throw new Error('This action has no valid server confirmation. Ask the assistant to prepare it again.');
        }
        try {
          return await sdk.apiClient.confirmDynamicApiAction(confirmationToken);
        } catch (error) {
          if (error?.status === 401) this.invalidate();
          throw error;
        }
      },
      cancelHostAction: async ({ confirmationToken }) => {
        if (!confirmationToken || !/^[A-Za-z0-9_-]{43}$/.test(confirmationToken)) {
          throw new Error('This action has no valid server confirmation to cancel.');
        }
        return sdk.apiClient.cancelDynamicApiAction(confirmationToken);
      }
    };
  }
}
