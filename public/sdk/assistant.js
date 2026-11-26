var AssistantSDKBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // widget/src/sdk.js
  var sdk_exports = {};
  __export(sdk_exports, {
    default: () => sdk_default
  });

  // widget/src/markdown.js
  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function parseMarkdown(text) {
    if (!text) return "";
    const textWithoutAction = text.replace(/```(?:action:[a-zA-Z0-9_-]+|action)\s*\n[\s\S]*?\n```/gi, "").trim();
    let md = escapeHtml(textWithoutAction);
    md = md.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : "";
      return `<div class="code-block-wrapper">
      <div class="code-header">
        ${langLabel}
        <button class="copy-code-btn" type="button" aria-label="Copy code block">Copy</button>
      </div>
      <pre><code>${code.trim()}</code></pre>
    </div>`;
    });
    md = md.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
    md = md.replace(/^### (.*$)/gim, "<h4>$1</h4>");
    md = md.replace(/^## (.*$)/gim, "<h3>$1</h3>");
    md = md.replace(/^# (.*$)/gim, "<h2>$1</h2>");
    md = md.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    md = md.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    md = md.replace(/_([^_]+)_/g, "<em>$1</em>");
    md = md.replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>");
    md = md.replace(/^\s*[-*+]\s+(.*)$/gim, "<li>$1</li>");
    md = md.replace(/(<li>.*<\/li>)/gims, (match) => {
      return `<ul>${match}</ul>`;
    });
    md = md.replace(/<\/ul>\s*<ul>/g, "");
    md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const paragraphs = md.split(/\n{2,}/);
    const formatted = paragraphs.map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      if (/^<(h[1-4]|div|pre|ul|ol|blockquote)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    }).filter(Boolean).join("");
    return formatted;
  }

  // config/hirepool-site-policy.js
  var HIREPOOL_PUBLIC_SITE_ORIGIN = "https://hirepool.ai";
  var HIREPOOL_LOCAL_LOGIN_URL = "http://localhost:5173/login";
  var HIREPOOL_LOCAL_PUBLIC_SITE_ORIGINS = Object.freeze([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
  ]);
  var HIREPOOL_LOCAL_PUBLIC_SITE_PATHS = Object.freeze([
    "/",
    "/features",
    "/enterprise",
    "/pricing",
    "/partners",
    "/women",
    "/terms",
    "/privacy",
    "/contact"
  ]);
  var HIREPOOL_LOCAL_DASHBOARD_ORIGINS = Object.freeze([
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]);
  var HIREPOOL_APP_ORIGIN = "https://app.hirepool.ai";
  var appOrigins = /* @__PURE__ */ new Set([HIREPOOL_APP_ORIGIN, ...HIREPOOL_LOCAL_DASHBOARD_ORIGINS]);
  function isHirePoolAppUrl(value) {
    try {
      const url = new URL(value);
      return appOrigins.has(url.origin) && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  var localOrigins = new Set(HIREPOOL_LOCAL_PUBLIC_SITE_ORIGINS);
  var publicOrigins = /* @__PURE__ */ new Set([...HIREPOOL_LOCAL_PUBLIC_SITE_ORIGINS, HIREPOOL_PUBLIC_SITE_ORIGIN]);
  var publicPaths = new Set(HIREPOOL_LOCAL_PUBLIC_SITE_PATHS);
  function isApprovedPublicSiteUrl(value, origins) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (!origins.has(url.origin) || url.username || url.password) {
      return false;
    }
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    return publicPaths.has(pathname);
  }
  function isHirePoolLocalPublicSiteUrl(value) {
    return isApprovedPublicSiteUrl(value, localOrigins);
  }
  function isHirePoolPublicSiteUrl(value) {
    return isApprovedPublicSiteUrl(value, publicOrigins);
  }

  // widget/src/hirepool-login.js
  var HIREPOOL_LOGIN_ACTION = "hirepool_login";
  var HIREPOOL_SIGNUP_ACTION = "hirepool_signup";
  var activeAccountWindow = null;
  function resolveAppLoginUrl(appLoginUrl) {
    try {
      const url = new URL(appLoginUrl);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch {
    }
    return HIREPOOL_LOCAL_LOGIN_URL;
  }
  function getHirePoolAccountUrl(currentUrl, action = HIREPOOL_LOGIN_ACTION, appLoginUrl = null) {
    let pageUrl;
    try {
      pageUrl = new URL(currentUrl);
    } catch {
      throw new TypeError("The current page URL is invalid");
    }
    if (!isHirePoolPublicSiteUrl(pageUrl.href)) {
      throw new Error("HirePool account actions can only be opened from an approved public website page");
    }
    const isSignup = action === HIREPOOL_SIGNUP_ACTION;
    if (!isSignup && action !== HIREPOOL_LOGIN_ACTION) {
      throw new TypeError("Unsupported HirePool account action");
    }
    const route = isSignup ? "/register" : "/login";
    const loginBase = resolveAppLoginUrl(appLoginUrl);
    if (pageUrl.origin === HIREPOOL_PUBLIC_SITE_ORIGIN) {
      return new URL(route, loginBase).href;
    }
    const accountUrl = new URL(route, loginBase);
    accountUrl.searchParams.set("assistant_origin", pageUrl.origin);
    return accountUrl.href;
  }
  function openHirePoolAccount({ currentUrl, openWindow, action = HIREPOOL_LOGIN_ACTION, appLoginUrl = null }) {
    if (typeof openWindow !== "function") {
      throw new TypeError("A browser window opener is required");
    }
    const accountUrl = getHirePoolAccountUrl(currentUrl, action, appLoginUrl);
    let accountWindow;
    try {
      accountWindow = openWindow("about:blank", "_blank");
      if (!accountWindow) {
        throw new Error("The HirePool account window was blocked by the browser");
      }
      accountWindow.location.replace(accountUrl);
      activeAccountWindow = accountWindow;
      return {
        message: action === HIREPOOL_SIGNUP_ACTION ? "HirePool signup opened in a new tab. Complete the existing registration and email verification steps, then return to this assistant." : "HirePool login opened in a new tab. Return to this assistant afterward; this conversation will remain open."
      };
    } catch (error) {
      accountWindow?.close?.();
      throw new Error(
        error instanceof Error ? error.message : "HirePool login could not be opened"
      );
    }
  }
  function openHirePoolLogin(options) {
    return openHirePoolAccount({ ...options, action: HIREPOOL_LOGIN_ACTION });
  }
  function openHirePoolSignup(options) {
    return openHirePoolAccount({ ...options, action: HIREPOOL_SIGNUP_ACTION });
  }
  function isHirePoolAccountWindow(source) {
    return Boolean(activeAccountWindow && source === activeAccountWindow);
  }
  function clearHirePoolAccountWindow(source) {
    if (source && source !== activeAccountWindow) return false;
    activeAccountWindow = null;
    return true;
  }

  // widget/src/hirepool-bridge.js
  var HIREPOOL_ASSISTANT_GREETING = "Welcome to HirePool. Log in or sign up for account-specific job and application help.";
  var HIREPOOL_GUEST_SUGGESTED_PROMPTS = [
    "Log in to HirePool",
    "Sign up for HirePool"
  ];
  var AUTH_HANDOFF_ORIGINS = new Set(HIREPOOL_LOCAL_DASHBOARD_ORIGINS);
  function getHirePoolGreetingForAuthState(state) {
    if (state?.status !== "authenticated" || !state?.identity) {
      return {
        greeting: HIREPOOL_ASSISTANT_GREETING,
        prompts: HIREPOOL_GUEST_SUGGESTED_PROMPTS
      };
    }
    const userType = state.identity.user_type || state.identity.userType;
    const name = state.identity.name || state.identity.first_name || state.identity.firstName;
    const namePrefix = name ? `Welcome back, ${name}.` : "Welcome back.";
    switch (userType) {
      case "candidate":
        return {
          greeting: `${namePrefix} I can help with matching jobs, applications, and your profile.`,
          prompts: []
        };
      case "client":
        return {
          greeting: `${namePrefix} I can help with your hiring dashboard and jobs.`,
          prompts: []
        };
      case "consultancy":
        return {
          greeting: `${namePrefix} I can help with placements and your consultancy dashboard.`,
          prompts: []
        };
      default:
        return {
          greeting: name ? `Welcome back, ${name}.` : "Welcome back to HirePool.",
          prompts: []
        };
    }
  }
  function createHirePoolPageContext(pathname, auth = { status: "unavailable", identity: null, role: null }) {
    const isAuth = auth?.status === "authenticated";
    const identity = auth?.identity || null;
    const userType = identity ? identity.user_type || identity.userType : null;
    const role = auth?.role ?? (userType === "candidate" ? "candidate" : identity?.role ?? identity?.organizationRole ?? null);
    const availableCapabilities = !isAuth ? [] : userType === "candidate" || role === "candidate" ? [
      "identity:get",
      "profile:get",
      "profile:update",
      "jobs:read",
      "applications:read",
      "applications:submit",
      "applications:withdraw"
    ] : ["identity:get", "profile:get"];
    const currentPath = typeof pathname === "string" && pathname.trim() ? pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname : typeof window !== "undefined" ? window.location.pathname.length > 1 ? window.location.pathname.replace(/\/+$/, "") : window.location.pathname : "/";
    return {
      application: { id: "hirepool", name: "HirePool" },
      authentication: {
        status: auth?.status || (isAuth ? "authenticated" : "anonymous"),
        identity: identity ? {
          id: String(identity.id),
          email: identity.email,
          name: identity.name || null,
          user_type: userType,
          role,
          is_active: identity.is_active ?? true,
          has_completed_onboarding: identity.has_completed_onboarding ?? true
        } : null,
        role
      },
      currentPage: {
        path: currentPath,
        title: typeof document !== "undefined" ? document.title : ""
      },
      selectedEntity: null,
      workflow: isAuth ? "authenticated_public_site" : "public_marketing_site",
      availableCapabilities
    };
  }
  function isVerifiedHirePoolIdentity(value) {
    if (!value || typeof value !== "object") return false;
    const id = value.id;
    const email = value.email;
    const userType = value.userType || value.user_type;
    const orgRole = "organizationRole" in value ? value.organizationRole : value.role;
    return typeof id === "string" && Boolean(id) && typeof email === "string" && ["candidate", "client", "consultancy"].includes(String(userType)) && (typeof orgRole === "string" || orgRole === null);
  }
  var HirePoolBridge = class {
    constructor(sdk, options = {}) {
      this.sdk = sdk;
      this.currentPathname = options.initialPath || (typeof window !== "undefined" ? window.location.pathname : "/");
      this.authState = {
        status: "anonymous",
        identity: null,
        role: null
      };
      this.lastVerifiedIdentity = null;
      this.sdkCredential = null;
      this.sdkSessionScope = null;
      this.sessionExpiryTimer = null;
      if (typeof window !== "undefined") {
        this._setupStorageListener();
        this._setupRouteListener();
        this._setupMessageListener();
        this.syncFromHostStorage();
      }
    }
    _setupMessageListener() {
      if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
      this._boundMessageHandler = (e) => {
        this.handleAuthMessage(e);
      };
      window.addEventListener("message", this._boundMessageHandler);
    }
    syncFromHostStorage() {
      return;
    }
    _setupStorageListener() {
    }
    _setupRouteListener() {
      if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
      const checkPath = () => {
        if (window.location && window.location.pathname !== this.currentPathname) {
          this.updatePath(window.location.pathname);
        }
      };
      window.addEventListener("popstate", checkPath);
      try {
        const origPush = window.history?.pushState;
        if (typeof origPush === "function") {
          const self = this;
          window.history.pushState = function(...args) {
            const ret = origPush.apply(this, args);
            checkPath();
            return ret;
          };
        }
        const origReplace = window.history?.replaceState;
        if (typeof origReplace === "function") {
          const self = this;
          window.history.replaceState = function(...args) {
            const ret = origReplace.apply(this, args);
            checkPath();
            return ret;
          };
        }
      } catch {
      }
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
        application: { id: "hirepool-local-app", name: "HirePool" },
        getAuthHeaders: async () => this.sdkCredential ? { Authorization: `Bearer ${this.sdkCredential}` } : {},
        getSessionScope: async () => this.sdkCredential ? this.sdkSessionScope : null,
        getIdentity: async () => {
          const current = this.authState;
          if (current.status !== "authenticated" || !current.identity) return null;
          return {
            id: String(current.identity.id),
            user_type: current.identity.user_type,
            role: current.identity.role ?? current.role ?? null
          };
        },
        contextProvider: async () => createHirePoolPageContext(this.currentPathname, this.authState),
        executeAction: async ({ confirmationToken }) => {
          if (!confirmationToken || !/^[A-Za-z0-9_-]{43}$/.test(confirmationToken)) {
            throw new Error("This action has no valid server confirmation. Ask the assistant to prepare it again.");
          }
          if (!this.sdkCredential) {
            throw new Error("Your verified HirePool session expired. Sign in again before confirming this action.");
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
            throw new Error("This action has no valid server confirmation to cancel.");
          }
          if (!this.sdkCredential) {
            throw new Error("Your HirePool session expired before the pending confirmation could be cancelled.");
          }
          return this.sdk.apiClient.cancelDynamicApiAction(confirmationToken);
        }
      };
    }
    async handleAuthMessage(event) {
      if (!event || typeof event !== "object") return;
      if (!AUTH_HANDOFF_ORIGINS.has(event.origin) || !isHirePoolAccountWindow(event.source)) {
        return;
      }
      const data = event.data;
      if (!this.sdk?.initialized || !data || typeof data !== "object" || data.version !== 1) return;
      if (data.type === "hirepool-auth:error") {
        this.handleAuthError(data.message);
        return;
      }
      if (data.type === "hirepool-auth:logout") {
        await this.clearAuthSession(event.source);
        return;
      }
      if (data.type === "hirepool-auth:session") {
        await this.setAuthSession(data);
      }
    }
    handleAuthError(message) {
      if (typeof message === "string" && message.length <= 300) {
        this.sdk.displayNotice(message);
      }
    }
    async setAuthSession(data) {
      if (!data || data.type !== void 0 && data.type !== "hirepool-auth:session" || typeof data.credential !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.credential) || typeof data.sessionScope !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.sessionScope) || typeof data.expiresIn !== "number" || !Number.isInteger(data.expiresIn) || data.expiresIn < 1e3 || data.expiresIn > 3e5 || !isVerifiedHirePoolIdentity(data.identity)) {
        return;
      }
      const identity = data.identity;
      const previousIdentity = this.lastVerifiedIdentity || this.authState.identity;
      const previousUserType = previousIdentity && "userType" in previousIdentity ? previousIdentity.userType : previousIdentity?.user_type;
      const previousRole = previousIdentity && "organizationRole" in previousIdentity ? previousIdentity.organizationRole : previousIdentity?.role;
      const accountChanged = Boolean(
        previousIdentity && (String(previousIdentity.id) !== String(identity.id) || previousUserType !== (identity.userType || identity.user_type) || previousRole !== (identity.organizationRole ?? identity.role))
      );
      const previousCredential = this.sdkCredential;
      if (this.sessionExpiryTimer !== null) {
        clearTimeout(this.sessionExpiryTimer);
        this.sessionExpiryTimer = null;
      }
      this.sdkCredential = data.credential;
      this.sdkSessionScope = data.sessionScope;
      this.authState = {
        status: "authenticated",
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
            console.error("[HirePool Assistant] Could not revoke the previous account session.", error);
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
        console.error("[HirePool Assistant] Verified session activation failed.", error);
        await this._handleSessionActivationFailure(data.credential);
      }
    }
    async _handleSessionExpiry(expiredCredential) {
      this.sdkCredential = null;
      this.sdkSessionScope = null;
      this.authState = { status: "anonymous", identity: null, role: null };
      this.sessionExpiryTimer = null;
      if (this.sdk.apiClient) {
        this.sdk.apiClient.clearAuthenticatedSession();
      }
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
      if (expiredCredential) {
        try {
          await this.sdk.apiClient.revokeHirePoolSession(expiredCredential);
        } catch (error) {
          console.error("[HirePool Assistant] Could not revoke the expired SDK session.", error);
        }
      }
      this.sdk.invalidatePendingActions(
        "This action cannot be reused after session expiry. Ask me to re-check the details and prepare a fresh confirmation."
      );
      try {
        await this.sdk.refreshSessionScope({ preserveConversation: true });
      } catch (error) {
        console.error("[HirePool Assistant] Could not refresh session scope on expiry.", error);
      }
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
      const guestWelcome = getHirePoolGreetingForAuthState(this.authState);
      this.sdk.setGreeting(guestWelcome.greeting, guestWelcome.prompts);
      this.sdk.displayHirePoolLoginNotice(
        "Your verified HirePool assistant session expired. Sign in again to access account data. This conversation is being kept; I will revalidate your identity and refresh data after sign-in."
      );
    }
    async _handleSessionActivationFailure(failedCredential) {
      this.sdkCredential = null;
      this.sdkSessionScope = null;
      if (this.sessionExpiryTimer !== null) {
        clearTimeout(this.sessionExpiryTimer);
        this.sessionExpiryTimer = null;
      }
      this.authState = { status: "anonymous", identity: null, role: null };
      if (this.sdk.apiClient) {
        this.sdk.apiClient.clearAuthenticatedSession();
      }
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
      try {
        await this.sdk.apiClient.revokeHirePoolSession(failedCredential);
      } catch (revokeError) {
        console.error("[HirePool Assistant] Could not revoke the failed SDK session.", revokeError);
      }
      this.sdk.invalidatePendingActions(
        "This action cannot be reused. Ask me to re-check the details and prepare a fresh confirmation."
      );
      try {
        await this.sdk.refreshSessionScope({ preserveConversation: true });
      } catch (error) {
        console.error("[HirePool Assistant] Could not refresh session scope on activation failure.", error);
      }
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
      const guestWelcome = getHirePoolGreetingForAuthState(this.authState);
      this.sdk.setGreeting(guestWelcome.greeting, guestWelcome.prompts);
      this.sdk.displayHirePoolLoginNotice(
        "HirePool login could not be activated for the assistant. Sign in again; this conversation has been kept."
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
      this.authState = { status: "anonymous", identity: null, role: null };
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
            console.error("[HirePool Assistant] Could not revoke the signed-out SDK session.", error);
          }
        }
        this.sdk.clearConversationLocal();
        await this.sdk.refreshSessionScope({ preserveConversation: false });
        this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
        const welcome = getHirePoolGreetingForAuthState(this.authState);
        this.sdk.setGreeting(welcome.greeting, welcome.prompts);
      } catch (error) {
        console.error("[HirePool Assistant] Could not clear the signed-out assistant session.", error);
        this.sdk.displayNotice("You are signed out. The assistant could not clear local conversation state.");
      }
    }
    async handleExpiryOn401() {
      const expiredCredential = this.sdkCredential;
      this.sdkCredential = null;
      this.sdkSessionScope = null;
      this.authState = { status: "anonymous", identity: null, role: null };
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
          console.error("[HirePool Assistant] Could not revoke the expired SDK session.", error);
        }
      }
      this.sdk.invalidatePendingActions(
        "This action cannot be reused after session expiry. Ask me to re-check the details and prepare a fresh confirmation."
      );
      try {
        await this.sdk.refreshSessionScope({ preserveConversation: true });
      } catch (error) {
        console.error("[HirePool Assistant] Could not refresh session scope on 401.", error);
      }
      this.sdk.setContext(createHirePoolPageContext(this.currentPathname, this.authState));
      const guestWelcome = getHirePoolGreetingForAuthState(this.authState);
      this.sdk.setGreeting(guestWelcome.greeting, guestWelcome.prompts);
      this.sdk.displayHirePoolLoginNotice(
        "Your HirePool session expired. Sign in again to continue. This conversation has been kept; your identity and permissions will be revalidated before account data is accessed."
      );
    }
    destroy() {
      if (this._boundMessageHandler && typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("message", this._boundMessageHandler);
        this._boundMessageHandler = null;
      }
      if (this.sessionExpiryTimer !== null) {
        clearTimeout(this.sessionExpiryTimer);
        this.sessionExpiryTimer = null;
      }
      this.sdkCredential = null;
      this.sdkSessionScope = null;
      this.authState = { status: "anonymous", identity: null, role: null };
      this.lastVerifiedIdentity = null;
    }
  };

  // widget/src/auto-open.js
  var SESSION_KEY = "hirepool-assistant:auto-open:shown";
  var SNOOZE_KEY = "hirepool-assistant:auto-open:snoozed-until";
  var MOBILE_QUERY = "(max-width: 640px)";
  var TYPING_RECHECK_MS = 2e3;
  function safeGet(storage, key) {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  function safeSet(storage, key, value) {
    try {
      storage?.setItem(key, value);
    } catch {
    }
  }
  function normalizePath(path) {
    const value = String(path || "/");
    return value.length > 1 ? value.replace(/\/+$/, "") : value;
  }
  function shouldAutoOpen(config, env) {
    if (!config || config.enabled !== true) return false;
    if (env.hasConversation) return false;
    const path = normalizePath(env.pathname);
    const excluded = Array.isArray(config.excludedPaths) ? config.excludedPaths.map(normalizePath) : [];
    if (excluded.includes(path)) return false;
    if (safeGet(env.sessionStorage, SESSION_KEY) === "1") return false;
    const snoozedUntil = Number(safeGet(env.localStorage, SNOOZE_KEY) || 0);
    if (Number.isFinite(snoozedUntil) && snoozedUntil > env.now) return false;
    return true;
  }
  function isTypingInPage(doc) {
    const el = doc?.activeElement;
    if (!el || el === doc.body) return false;
    if (el.id === "ai-assistant-plugin-root") return false;
    const tag = String(el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
  }
  var AutoOpenController = class {
    /**
     * @param {object} options
     * @param {object} options.config behavior.autoOpen
     * @param {() => void} options.openPanel opens the chat without moving focus
     * @param {(text: string) => void} options.showTeaser shows the phone greeting bubble
     * @param {() => boolean} options.isOpen
     * @param {() => boolean} options.hasConversation
     * @param {Window} [options.win]
     */
    constructor({ config, openPanel, showTeaser, isOpen, hasConversation, win = globalThis.window }) {
      this.config = config || {};
      this.openPanel = openPanel;
      this.showTeaser = showTeaser;
      this.isOpen = isOpen;
      this.hasConversation = hasConversation;
      this.win = win;
      this.doc = win?.document;
      this.remainingMs = Math.max(1e3, Number(this.config.delayMs) || 5e3);
      this.timer = null;
      this.startedAt = 0;
      this.fired = false;
      this.stopped = false;
      this._onVisibility = () => this._handleVisibility();
    }
    start() {
      if (!this.win || !this.doc) return false;
      const allowed = shouldAutoOpen(this.config, {
        pathname: this.win.location?.pathname,
        now: Date.now(),
        sessionStorage: this.win.sessionStorage,
        localStorage: this.win.localStorage,
        hasConversation: this.hasConversation?.()
      });
      if (!allowed) return false;
      this.doc.addEventListener("visibilitychange", this._onVisibility);
      if (this.doc.visibilityState !== "hidden") this._schedule();
      return true;
    }
    stop() {
      this.stopped = true;
      clearTimeout(this.timer);
      this.timer = null;
      this.doc?.removeEventListener("visibilitychange", this._onVisibility);
    }
    /** The visitor closed the auto-opened chat or the bubble: stay quiet for a while. */
    snooze() {
      const hours = Number.isFinite(this.config.snoozeHours) ? this.config.snoozeHours : 24;
      if (hours > 0) {
        safeSet(this.win?.localStorage, SNOOZE_KEY, String(Date.now() + hours * 60 * 60 * 1e3));
      }
    }
    _schedule() {
      if (this.stopped || this.fired) return;
      clearTimeout(this.timer);
      this.startedAt = Date.now();
      this.timer = setTimeout(() => this._fire(), this.remainingMs);
    }
    _handleVisibility() {
      if (this.stopped || this.fired) return;
      if (this.doc.visibilityState === "hidden") {
        clearTimeout(this.timer);
        this.timer = null;
        this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAt));
      } else {
        this._schedule();
      }
    }
    _fire() {
      if (this.stopped || this.fired) return;
      if (this.isOpen?.() || this.hasConversation?.()) {
        this.stop();
        return;
      }
      if (isTypingInPage(this.doc)) {
        this.timer = setTimeout(() => this._fire(), TYPING_RECHECK_MS);
        return;
      }
      this.fired = true;
      safeSet(this.win.sessionStorage, SESSION_KEY, "1");
      this.doc.removeEventListener("visibilitychange", this._onVisibility);
      const isPhone = typeof this.win.matchMedia === "function" && this.win.matchMedia(MOBILE_QUERY).matches;
      const mobileMode = this.config.mobile || "bubble";
      if (isPhone) {
        if (mobileMode === "bubble") this.showTeaser?.(this.config.teaser || "Hi! \u{1F44B} Need help getting started?");
        else if (mobileMode === "panel") this.openPanel?.();
        return;
      }
      this.openPanel?.();
    }
  };

  // widget/src/idle-nudge.js
  var IdleNudgeController = class {
    /**
     * @param {object} options
     * @param {number} [options.delayMs=5000]
     * @param {number} [options.maxConsecutive=2]
     * @param {(stage: string, index: number) => ({ text: string, quickReplies?: string[] }|null)} options.pickNudge
     * @param {(nudge: { text: string, quickReplies?: string[] }) => void} options.post
     * @param {() => boolean} options.canNudge true when it is a good moment right now
     * @param {() => boolean} [options.isPaused] true while it should wait (e.g. tab hidden)
     */
    constructor({ delayMs = 5e3, maxConsecutive = 2, pickNudge, post, canNudge, isPaused = () => false }) {
      this.delayMs = Math.max(1e3, Number(delayMs) || 5e3);
      this.maxConsecutive = Math.max(0, Number(maxConsecutive) || 0);
      this.pickNudge = pickNudge;
      this.post = post;
      this.canNudge = canNudge;
      this.isPaused = isPaused;
      this.timer = null;
      this.stage = null;
      this.consecutive = 0;
      this.stopped = false;
    }
    /** The assistant just spoke (welcome, answer, or a follow-up). */
    onAssistantMessage(stage) {
      if (this.stopped) return;
      this.stage = stage;
      this._schedule();
    }
    /** The visitor typed or interacted: wait for them instead of nudging. */
    onUserActivity() {
      clearTimeout(this.timer);
      this.timer = null;
    }
    /** The visitor sent a message: the follow-up allowance starts over. */
    onUserMessage() {
      this.consecutive = 0;
      this.onUserActivity();
    }
    stop() {
      this.stopped = true;
      this.onUserActivity();
    }
    _schedule() {
      clearTimeout(this.timer);
      if (this.stopped || this.consecutive >= this.maxConsecutive) {
        this.timer = null;
        return;
      }
      this.timer = setTimeout(() => this._fire(), this.delayMs);
    }
    _fire() {
      this.timer = null;
      if (this.stopped || this.consecutive >= this.maxConsecutive) return;
      if (this.isPaused()) {
        this._schedule();
        return;
      }
      if (!this.canNudge()) return;
      const nudge = this.pickNudge(this.stage, this.consecutive);
      if (!nudge?.text) return;
      this.consecutive += 1;
      this.post(nudge);
      this._schedule();
    }
  };
  function pickIdleNudge(config, stage, used, role = null) {
    if (role && config?.byRole?.[role]) {
      config = config.byRole[role];
    }
    const pool = (stage === "welcome" ? config?.afterWelcome : stage === "question" ? config?.afterQuestion || config?.afterAnswer : config?.afterAnswer) || [];
    for (const item of pool) {
      const text = typeof item === "string" ? item : item?.text;
      if (text && !used.has(text)) {
        used.add(text);
        return {
          text,
          quickReplies: Array.isArray(item?.quickReplies) ? item.quickReplies.slice(0, 5) : []
        };
      }
    }
    return null;
  }

  // widget/src/error-messages.js
  var AUTH_CODES = /* @__PURE__ */ new Set([
    "INVALID_CREDENTIALS",
    "MISSING_CREDENTIALS",
    "TOKEN_EXPIRED",
    "EXPIRED_SESSION",
    "AUTH_REQUIRED",
    "UNAUTHORIZED",
    "INVALID_HOST_CREDENTIAL"
  ]);
  var UPSTREAM_CODES = /* @__PURE__ */ new Set([
    "STATE_UNAVAILABLE",
    "HIREPOOL_API_TIMEOUT",
    "REQUEST_TIMEOUT",
    "PROVIDER_NOT_CONFIGURED",
    "UPSTREAM_UNAVAILABLE",
    "IDENTITY_UNAVAILABLE"
  ]);
  function isNetworkError(error, online) {
    if (online === false) return true;
    const message = String(error?.message || "");
    return error?.name === "TypeError" && /fetch|network|load failed|connection/i.test(message);
  }
  function describeAssistantError(error, context = {}) {
    const status = Number(error?.status) || null;
    const code = String(error?.code || "").toUpperCase();
    const surface = context.surface || null;
    if (error?.name === "AbortError") {
      return { kind: "cancelled", message: "", retry: "none", recover: null };
    }
    if (isNetworkError(error, context.online)) {
      return {
        kind: "offline",
        message: "I can't reach HirePool right now. Please check your internet connection. I'll try again as soon as you're back online.",
        retry: "auto",
        recover: "wait-online"
      };
    }
    if (status === 429 || code === "RATE_LIMIT_EXCEEDED") {
      return {
        kind: "rate-limited",
        message: "You're sending messages a little fast. Please wait a few seconds, then try again.",
        retry: "manual",
        recover: null,
        retryAfterMs: 5e3
      };
    }
    if (status === 401 || AUTH_CODES.has(code)) {
      if (surface === "app") {
        return {
          kind: "signed-out",
          message: "Your HirePool session has ended. Please log in again to continue.",
          retry: "none",
          recover: "reauthenticate"
        };
      }
      return {
        kind: "session-reset",
        message: "Your session was refreshed. Please send your message again.",
        retry: "manual",
        recover: "reauthenticate"
      };
    }
    if (status === 410 || code === "SESSION_EXPIRED") {
      return {
        kind: "conversation-expired",
        message: "This conversation had expired, so I started a fresh one.",
        retry: "auto",
        recover: "new-conversation"
      };
    }
    if (status === 413 || code === "FILE_TOO_LARGE") {
      return { kind: "too-large", message: "That file is too large. Please choose a smaller one.", retry: "none", recover: null };
    }
    if (status === 400 || code === "VALIDATION_ERROR" || code === "MALFORMED_JSON") {
      return {
        kind: "invalid",
        message: "I couldn't send that message. Please shorten it or rephrase it and try again.",
        retry: "none",
        recover: null
      };
    }
    if (status === 403 && code === "SURFACE_NOT_ALLOWED") {
      return {
        kind: "not-available-here",
        message: "That is only available in your HirePool dashboard after you log in.",
        retry: "none",
        recover: null
      };
    }
    if (status === 502 || status === 503 || status === 504 || UPSTREAM_CODES.has(code)) {
      return {
        kind: "unavailable",
        message: "I'm having trouble reaching HirePool right now. Nothing was changed. Please try again in a moment.",
        retry: "manual",
        recover: null
      };
    }
    if (code === "STREAM_INTERRUPTED" || /stream(?:ing)? (?:response )?(?:ended|event)|malformed streaming|readable streaming/i.test(String(error?.message || ""))) {
      return {
        kind: "interrupted",
        message: context.hadPartialReply ? "My reply was cut off. Please try again for the full answer." : "My reply was interrupted. Please try again.",
        retry: "manual",
        recover: null
      };
    }
    return {
      kind: "unexpected",
      message: "Something went wrong on my side and I couldn't finish that. Nothing was changed. Please try again.",
      retry: "manual",
      recover: null
    };
  }

  // widget/src/hirepool-resume.js
  var HIREPOOL_RESUME_MAX_BYTES = 4 * 1024 * 1024;
  var HIREPOOL_RESUME_STATES = Object.freeze({
    IDLE: "IDLE",
    FILE_SELECTED: "FILE_SELECTED",
    PREPARING: "PREPARING",
    AWAITING_CONFIRMATION: "AWAITING_CONFIRMATION",
    UPLOADING: "UPLOADING",
    UPLOAD_SUCCESS: "UPLOAD_SUCCESS",
    UPLOAD_UNVERIFIED: "UPLOAD_UNVERIFIED",
    UPLOAD_FAILED: "UPLOAD_FAILED",
    CANCELLED: "CANCELLED"
  });
  function validateHirePoolResumeFile(file) {
    if (!file || typeof file.name !== "string" || !Number.isFinite(file.size)) {
      return "Select a PDF resume to continue.";
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return "Only PDF resumes are supported.";
    }
    const mimeType = typeof file.type === "string" ? file.type.toLowerCase() : "";
    const allowedMimeTypes = /* @__PURE__ */ new Set([
      "",
      "application/pdf",
      "application/octet-stream",
      "application/x-pdf",
      "binary/octet-stream"
    ]);
    if (mimeType && !allowedMimeTypes.has(mimeType)) {
      return "Only PDF resumes are supported.";
    }
    if (file.size < 1) return "The selected PDF is empty.";
    if (file.size > HIREPOOL_RESUME_MAX_BYTES) return "Resume PDFs must be 4 MB or smaller.";
    return null;
  }
  function formatHirePoolResumeSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  function isCandidateIdentity(identity) {
    return identity?.user_type === "candidate";
  }
  var HirePoolResumeUpload = class {
    constructor(apiClient, onStateChange = () => {
    }) {
      this.apiClient = apiClient;
      this.onStateChange = onStateChange;
      this.state = HIREPOOL_RESUME_STATES.IDLE;
      this.file = null;
      this.pending = null;
      this.conversationId = null;
      this.identityKey = null;
      this.operation = null;
      this.errorMessage = null;
      this.generation = 0;
    }
    _emit(state, details = {}) {
      this.state = state;
      this.onStateChange({
        state,
        filename: this.pending?.filename || this.file?.name || null,
        fileSize: this.pending?.fileSize ?? this.file?.size ?? null,
        replacingExisting: this.pending?.replacingExisting ?? null,
        conversationId: this.conversationId,
        message: details.message || null,
        error: this.errorMessage
      });
    }
    setIdentity(identity, sessionScope = null) {
      const identityKey = isCandidateIdentity(identity) && identity.id != null ? `${identity.id}:${identity.user_type}:${identity.role || ""}:${sessionScope || ""}` : null;
      if (identityKey === this.identityKey) return false;
      this.generation += 1;
      this.identityKey = identityKey;
      this.file = null;
      this.pending = null;
      this.conversationId = null;
      this.operation = null;
      this.errorMessage = null;
      this._emit(HIREPOOL_RESUME_STATES.IDLE);
      return true;
    }
    selectFile(file, conversationId) {
      if (!this.identityKey) throw new Error("Sign in to a verified HirePool candidate account to upload a resume.");
      if (this.operation || this.state === HIREPOOL_RESUME_STATES.UPLOADING || this.state === HIREPOOL_RESUME_STATES.PREPARING) {
        throw new Error("Wait for the current resume operation to finish.");
      }
      if (this.pending) throw new Error("Confirm or cancel the prepared resume before selecting another file.");
      const validationError = validateHirePoolResumeFile(file);
      if (validationError) throw new Error(validationError);
      this.file = file;
      this.conversationId = conversationId;
      this.errorMessage = null;
      this._emit(HIREPOOL_RESUME_STATES.FILE_SELECTED);
    }
    removeFile() {
      if (this.state !== HIREPOOL_RESUME_STATES.FILE_SELECTED) return false;
      this.file = null;
      this.conversationId = null;
      this._emit(HIREPOOL_RESUME_STATES.IDLE);
      return true;
    }
    reset() {
      this.generation += 1;
      this.file = null;
      this.pending = null;
      this.conversationId = null;
      this.operation = null;
      this.errorMessage = null;
      this._emit(HIREPOOL_RESUME_STATES.IDLE);
    }
    async prepare(conversationId) {
      if (this.state !== HIREPOOL_RESUME_STATES.FILE_SELECTED || !this.file) return false;
      if (this.operation) return this.operation;
      const file = this.file;
      const requestGeneration = this.generation;
      this.conversationId = conversationId || null;
      this.errorMessage = null;
      this._emit(HIREPOOL_RESUME_STATES.PREPARING);
      const operation = (async () => {
        try {
          if (typeof file.slice !== "function") {
            throw new Error("The selected file could not be validated as a PDF.");
          }
          const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
          if (new TextDecoder().decode(signature) !== "%PDF-") {
            throw new Error("The selected file is not a valid PDF.");
          }
          const result = await this.apiClient.prepareHirePoolResume(file, conversationId);
          if (requestGeneration !== this.generation) return false;
          if (result?.status !== "requires_confirmation" || typeof result.confirmationToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.confirmationToken) || typeof result.conversationId !== "string" || conversationId && result.conversationId !== conversationId || typeof result.filename !== "string" || !Number.isInteger(result.fileSize) || typeof result.replacingExisting !== "boolean") {
            throw new Error("HirePool returned an unexpected resume preparation response. Select the PDF and try again.");
          }
          this.conversationId = result.conversationId;
          this.pending = {
            confirmationToken: result.confirmationToken,
            conversationId: result.conversationId,
            filename: result.filename,
            fileSize: result.fileSize,
            replacingExisting: result.replacingExisting
          };
          this.file = null;
          this.errorMessage = null;
          this._emit(HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION);
          return true;
        } catch (error) {
          if (requestGeneration !== this.generation) return false;
          this.errorMessage = error.message || "HirePool could not prepare the resume upload.";
          this._emit(HIREPOOL_RESUME_STATES.UPLOAD_FAILED);
          return false;
        } finally {
          if (this.operation === operation) this.operation = null;
        }
      })();
      this.operation = operation;
      return operation;
    }
    async confirm() {
      if (this.operation) return this.operation;
      if (this.state !== HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION || !this.pending) return false;
      const pending = this.pending;
      const requestGeneration = this.generation;
      this._emit(HIREPOOL_RESUME_STATES.UPLOADING);
      const operation = (async () => {
        try {
          const result = await this.apiClient.confirmHirePoolResume(
            pending.confirmationToken,
            pending.conversationId
          );
          if (requestGeneration !== this.generation) return false;
          if (result?.status === "success" && result.verified === true && typeof result.message === "string") {
            this.pending = null;
            this.errorMessage = null;
            this._emit(HIREPOOL_RESUME_STATES.UPLOAD_SUCCESS);
            return true;
          }
          throw new Error("HirePool returned an unexpected resume upload response.");
        } catch (error) {
          if (requestGeneration !== this.generation) return false;
          this.pending = null;
          this.errorMessage = error.message || "HirePool could not confirm the resume upload.";
          if (error.responseStatus === "uploaded_unverified") {
            this._emit(HIREPOOL_RESUME_STATES.UPLOAD_UNVERIFIED);
          } else {
            this._emit(HIREPOOL_RESUME_STATES.UPLOAD_FAILED);
          }
          return false;
        } finally {
          if (this.operation === operation) this.operation = null;
        }
      })();
      this.operation = operation;
      return operation;
    }
    async cancel() {
      if (this.operation) return this.operation;
      if (this.state !== HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION || !this.pending) return false;
      const pending = this.pending;
      const requestGeneration = this.generation;
      this._emit(HIREPOOL_RESUME_STATES.UPLOADING, { message: "Cancelling the prepared upload..." });
      const operation = (async () => {
        try {
          const result = await this.apiClient.cancelHirePoolResume(
            pending.confirmationToken,
            pending.conversationId
          );
          if (requestGeneration !== this.generation) return false;
          if (result?.status !== "cancelled") {
            throw new Error("HirePool did not confirm cancellation of the prepared resume.");
          }
          this.pending = null;
          this.file = null;
          this.conversationId = null;
          this.errorMessage = null;
          this._emit(HIREPOOL_RESUME_STATES.CANCELLED);
          return true;
        } catch (error) {
          if (requestGeneration !== this.generation) return false;
          this.errorMessage = error.message || "The prepared resume could not be cancelled.";
          this._emit(HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION);
          return false;
        } finally {
          if (this.operation === operation) this.operation = null;
        }
      })();
      this.operation = operation;
      return operation;
    }
  };

  // widget/src/hirepool-validation.js
  var LIMITS = Object.freeze({
    yearsExperience: { min: 0, max: 50 },
    monthsExperience: { min: 0, max: 11 },
    noticeDays: { min: 0, max: 180 },
    expectedSalaryInr: { min: 0, max: 5e7 },
    foundingYear: { min: 1800, max: 2100 },
    maxPhoneLength: 20,
    exactPhoneDigits: 10
  });
  function rangeError(label, v, min, max, unit = "") {
    if (v === null || v === void 0 || Number.isNaN(v)) return null;
    if (v < min) return `${label} must be at least ${min.toLocaleString("en-IN")}${unit}`;
    if (v > max) return `${label} cannot be more than ${max.toLocaleString("en-IN")}${unit}`;
    return null;
  }
  var CLIENT_INDUSTRIES = Object.freeze([
    "Technology",
    "Healthcare",
    "Finance",
    "Education",
    "Manufacturing",
    "Retail",
    "Consulting",
    "Media",
    "Real Estate",
    "Logistics",
    "E-commerce",
    "Other"
  ]);
  var CONSULTANCY_SPECIALIZATIONS = Object.freeze([
    "Technology",
    "Healthcare",
    "Finance",
    "Engineering",
    "Sales",
    "Marketing",
    "HR",
    "Operations",
    "Design",
    "Data Science",
    "General"
  ]);
  var COMPANY_SIZES = Object.freeze([
    "1-10",
    "11-50",
    "51-200",
    "201-500",
    "500+"
  ]);
  var CONSULTANCY_TYPES = Object.freeze(["recruitment", "staffing"]);
  var WORK_TYPES = Object.freeze(["remote", "hybrid", "onsite"]);
  var JOB_TYPES = Object.freeze(["full_time", "contract"]);
  function validatePhoneNumber(value, { required = false, fieldLabel = "Phone number" } = {}) {
    const str = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (!str) {
      if (required) {
        return { isValid: false, error: `${fieldLabel} is required`, digits: "" };
      }
      return { isValid: true, digits: "" };
    }
    if (/[a-zA-Z]/.test(str)) {
      return { isValid: false, error: "Phone number must contain exactly 10 digits", digits: "" };
    }
    let digitsOnly = str.replace(/\D/g, "");
    if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
      digitsOnly = digitsOnly.slice(2);
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
      digitsOnly = digitsOnly.slice(1);
    }
    if (digitsOnly.length !== 10) {
      return { isValid: false, error: "Phone number must contain exactly 10 digits", digits: digitsOnly };
    }
    return { isValid: true, digits: digitsOnly };
  }
  function validateEmail(value, { required = true } = {}) {
    const str = typeof value === "string" ? value.trim() : "";
    if (!str) {
      if (required) {
        return { isValid: false, error: "Email is required" };
      }
      return { isValid: true, sanitized: "" };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(str)) {
      return { isValid: false, error: "Invalid email address" };
    }
    return { isValid: true, sanitized: str.toLowerCase() };
  }
  function validatePassword(password, { confirmPassword = null, acceptAgreement = null, requireAgreement = false } = {}) {
    const errors = [];
    if (typeof password !== "string" || !password) {
      errors.push("Password is required");
      return { isValid: false, errors, firstError: "Password is required" };
    }
    if (password.length < 8) {
      errors.push("Password must be at least 8 characters");
    } else if (password.length > 128) {
      errors.push("Password must be at most 128 characters");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (!/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    }
    if (confirmPassword !== null && password !== confirmPassword) {
      errors.push("Passwords do not match");
    }
    if (requireAgreement && acceptAgreement !== true) {
      errors.push("You must agree to the User Agreement to create an account");
    }
    return {
      isValid: errors.length === 0,
      errors,
      firstError: errors[0]
    };
  }
  function validateWebsiteUrl(url, { required = false, fieldLabel = "Website" } = {}) {
    const str = typeof url === "string" ? url.trim() : "";
    if (!str) {
      if (required) {
        return { isValid: false, error: `${fieldLabel} is required` };
      }
      return { isValid: true, sanitized: null };
    }
    if (!/^https?:\/\//i.test(str)) {
      return { isValid: false, error: "Website must start with http:// or https://" };
    }
    try {
      const parsed = new URL(str);
      const hostname = parsed.hostname;
      if (!hostname.includes(".") || hostname.startsWith(".") || hostname.endsWith(".")) {
        return { isValid: false, error: "Please enter a valid website URL" };
      }
      const parts = hostname.split(".");
      const tld = parts[parts.length - 1];
      if (tld.length < 2) {
        return { isValid: false, error: "Please enter a valid website URL" };
      }
      return { isValid: true, sanitized: str };
    } catch {
      return { isValid: false, error: "Please enter a valid website URL" };
    }
  }
  function validateGstin(gstin) {
    const str = typeof gstin === "string" ? gstin.trim().toUpperCase() : "";
    if (!str) return { isValid: true };
    if (str.length !== 15) {
      return { isValid: false, error: "GSTIN must be exactly 15 characters" };
    }
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(str)) {
      return { isValid: false, error: "Please enter a valid GSTIN format" };
    }
    const stateCode = parseInt(str.substring(0, 2), 10);
    if (!(stateCode >= 1 && stateCode <= 38 || stateCode === 97 || stateCode === 99)) {
      return { isValid: false, error: "Invalid state code in GSTIN" };
    }
    return { isValid: true };
  }
  function validateEducationItem(item) {
    if (!item || typeof item !== "object") {
      return { isValid: false, error: "Education entry must be an object" };
    }
    const inst = typeof item.institution === "string" ? item.institution.trim() : "";
    const deg = typeof item.degree === "string" ? item.degree.trim() : "";
    if (!inst && !deg && !item.field_of_study) {
      return { isValid: false, error: "Empty education entries cannot be submitted" };
    }
    if (!inst) {
      return { isValid: false, error: "Institution is required" };
    }
    if (!deg) {
      return { isValid: false, error: "Degree is required" };
    }
    return { isValid: true };
  }
  function validateWorkExperienceItem(item) {
    if (!item || typeof item !== "object") {
      return { isValid: false, error: "Work experience entry must be an object" };
    }
    const comp = typeof item.company === "string" ? item.company.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!comp && !title && !item.description) {
      return { isValid: false, error: "Empty work experience entries cannot be submitted" };
    }
    if (!comp) {
      return { isValid: false, error: "Company is required" };
    }
    if (!title) {
      return { isValid: false, error: "Job title is required" };
    }
    return { isValid: true };
  }
  function validateCandidateProfile(profile, { mode = "onboarding" } = {}) {
    const errors = {};
    const data = { ...profile || {} };
    const firstName = typeof data.first_name === "string" ? data.first_name.trim() : "";
    if (!firstName) {
      errors.first_name = "First name is required";
    } else if (firstName.length > 100) {
      errors.first_name = "First name cannot be more than 100 characters";
    } else {
      data.first_name = firstName;
    }
    const lastName = typeof data.last_name === "string" ? data.last_name.trim() : "";
    if (!lastName) {
      errors.last_name = "Last name is required";
    } else if (lastName.length > 100) {
      errors.last_name = "Last name cannot be more than 100 characters";
    } else {
      data.last_name = lastName;
    }
    const location = typeof data.current_location === "string" ? data.current_location.trim() : "";
    if (!location) {
      errors.current_location = "Location is required";
    } else if (location.length > 255) {
      errors.current_location = "Location cannot be more than 255 characters";
    } else {
      data.current_location = location;
    }
    const jobTitle = typeof data.job_title === "string" ? data.job_title.trim() : "";
    if (!jobTitle) {
      errors.job_title = "Job title is required";
    } else if (jobTitle.length > 255) {
      errors.job_title = "Job title cannot be more than 255 characters";
    } else {
      data.job_title = jobTitle;
    }
    const phoneRes = validatePhoneNumber(data.phone, {
      required: mode === "profile",
      fieldLabel: "Phone number"
    });
    if (!phoneRes.isValid) {
      errors.phone = phoneRes.error;
    } else {
      data.phone = phoneRes.digits || null;
    }
    if (data.years_of_experience !== void 0 && data.years_of_experience !== null && data.years_of_experience !== "") {
      const yoe = Number(data.years_of_experience);
      if (!Number.isFinite(yoe) || !Number.isInteger(yoe) || yoe < LIMITS.yearsExperience.min || yoe > LIMITS.yearsExperience.max) {
        errors.years_of_experience = `Years of experience must be between ${LIMITS.yearsExperience.min} and ${LIMITS.yearsExperience.max}`;
      } else {
        data.years_of_experience = yoe;
      }
    } else if (mode === "profile") {
      errors.years_of_experience = "Years of experience is required";
    } else {
      data.years_of_experience = 0;
    }
    if (data.months_of_experience !== void 0 && data.months_of_experience !== null && data.months_of_experience !== "") {
      const moe = Number(data.months_of_experience);
      if (!Number.isFinite(moe) || !Number.isInteger(moe) || moe < LIMITS.monthsExperience.min || moe > LIMITS.monthsExperience.max) {
        errors.months_of_experience = "Months of experience must be between 0 and 11";
      } else {
        data.months_of_experience = moe;
      }
    } else {
      data.months_of_experience = 0;
    }
    if (data.notice_period_days !== void 0 && data.notice_period_days !== null && data.notice_period_days !== "") {
      const notice = Number(data.notice_period_days);
      const err = rangeError("Notice period", notice, LIMITS.noticeDays.min, LIMITS.noticeDays.max, " days");
      if (!Number.isFinite(notice) || err) {
        errors.notice_period_days = err || `Notice period cannot be more than ${LIMITS.noticeDays.max} days`;
      } else {
        data.notice_period_days = Math.floor(notice);
      }
    } else {
      data.notice_period_days = null;
    }
    let salMin = null;
    let salMax = null;
    if (data.expected_salary_min !== void 0 && data.expected_salary_min !== null && data.expected_salary_min !== "") {
      const v = Number(data.expected_salary_min);
      const err = rangeError("Minimum expected salary", v, LIMITS.expectedSalaryInr.min, LIMITS.expectedSalaryInr.max);
      if (!Number.isFinite(v) || err) {
        errors.expected_salary_min = err || "Minimum expected salary cannot be more than 50,000,000";
      } else {
        salMin = Math.floor(v);
        data.expected_salary_min = salMin;
      }
    } else {
      data.expected_salary_min = null;
    }
    if (data.expected_salary_max !== void 0 && data.expected_salary_max !== null && data.expected_salary_max !== "") {
      const v = Number(data.expected_salary_max);
      const err = rangeError("Maximum expected salary", v, LIMITS.expectedSalaryInr.min, LIMITS.expectedSalaryInr.max);
      if (!Number.isFinite(v) || err) {
        errors.expected_salary_max = err || "Maximum expected salary cannot be more than 50,000,000";
      } else {
        salMax = Math.floor(v);
        data.expected_salary_max = salMax;
      }
    } else {
      data.expected_salary_max = null;
    }
    if (salMin !== null && salMax !== null && salMin > salMax) {
      errors.expected_salary_min = "The minimum expected salary cannot be more than the maximum";
    }
    let skillsList = [];
    if (Array.isArray(data.skills)) {
      skillsList = data.skills.map((s) => String(s).trim()).filter(Boolean);
    } else if (typeof data.skills === "string") {
      skillsList = data.skills.split(",").map((s) => s.trim()).filter(Boolean);
    }
    data.skills = skillsList;
    if (mode === "profile" && skillsList.length === 0) {
      errors.skills = "At least one skill is required";
    }
    for (const urlField of ["linkedin_url", "github_url", "portfolio_url", "personal_website"]) {
      if (data[urlField]) {
        const urlRes = validateWebsiteUrl(data[urlField], { required: false });
        if (!urlRes.isValid) {
          errors[urlField] = urlRes.error;
        } else {
          data[urlField] = urlRes.sanitized;
        }
      } else {
        data[urlField] = null;
      }
    }
    if (Array.isArray(data.education) && data.education.length > 0) {
      for (let i = 0; i < data.education.length; i++) {
        const eduRes = validateEducationItem(data.education[i]);
        if (!eduRes.isValid) {
          errors[`education.${i}`] = eduRes.error;
          break;
        }
      }
    }
    if (Array.isArray(data.work_experience) && data.work_experience.length > 0) {
      for (let i = 0; i < data.work_experience.length; i++) {
        const expRes = validateWorkExperienceItem(data.work_experience[i]);
        if (!expRes.isValid) {
          errors[`work_experience.${i}`] = expRes.error;
          break;
        }
      }
    }
    const isValid = Object.keys(errors).length === 0;
    return {
      isValid,
      errors,
      firstError: Object.values(errors)[0],
      sanitizedData: data
    };
  }
  function validateClientProfile(profile, { mode = "onboarding" } = {}) {
    const errors = {};
    const data = { ...profile || {} };
    const companyName = typeof data.company_name === "string" ? data.company_name.trim() : "";
    if (!companyName) {
      errors.company_name = "Company name is required";
    } else if (companyName.length > 255) {
      errors.company_name = "Company name cannot be more than 255 characters";
    } else {
      data.company_name = companyName;
    }
    const industry = typeof data.industry === "string" ? data.industry.trim() : "";
    if (!industry) {
      errors.industry = "Industry is required";
    } else {
      data.industry = industry;
    }
    const companySize = typeof data.company_size === "string" ? data.company_size.trim() : "";
    if (!companySize) {
      errors.company_size = "Company size is required";
    } else if (!COMPANY_SIZES.includes(companySize)) {
      errors.company_size = "Please select a valid company size";
    } else {
      data.company_size = companySize;
    }
    const location = typeof data.headquarters_location === "string" ? data.headquarters_location.trim() : "";
    if (!location) {
      errors.headquarters_location = "Location is required";
    } else if (location.length > 255) {
      errors.headquarters_location = "Location cannot be more than 255 characters";
    } else {
      data.headquarters_location = location;
    }
    const contact = { ...data.primary_contact || {} };
    const contactName = typeof contact.full_name === "string" ? contact.full_name.trim() : typeof data.full_name === "string" ? data.full_name.trim() : "";
    if (!contactName) {
      errors["primary_contact.full_name"] = "Your name is required";
    } else if (contactName.length > 200) {
      errors["primary_contact.full_name"] = "Name cannot be more than 200 characters";
    } else {
      contact.full_name = contactName;
    }
    const rawPhone = contact.phone || data.phone;
    const phoneRes = validatePhoneNumber(rawPhone, {
      required: mode === "profile",
      fieldLabel: "Phone number"
    });
    if (!phoneRes.isValid) {
      errors["primary_contact.phone"] = phoneRes.error;
    } else {
      contact.phone = phoneRes.digits || null;
    }
    if (contact.designation) {
      contact.designation = String(contact.designation).trim().slice(0, 100);
    } else if (data.designation) {
      contact.designation = String(data.designation).trim().slice(0, 100);
    } else {
      contact.designation = null;
    }
    data.primary_contact = contact;
    if (data.company_website) {
      const webRes = validateWebsiteUrl(data.company_website, { required: false });
      if (!webRes.isValid) {
        errors.company_website = webRes.error;
      } else {
        data.company_website = webRes.sanitized;
      }
    } else {
      data.company_website = null;
    }
    if (data.founding_year !== void 0 && data.founding_year !== null && data.founding_year !== "") {
      const yr = Number(data.founding_year);
      if (!Number.isFinite(yr) || yr < LIMITS.foundingYear.min || yr > LIMITS.foundingYear.max) {
        errors.founding_year = `Founding year must be between ${LIMITS.foundingYear.min} and ${LIMITS.foundingYear.max}`;
      } else {
        data.founding_year = Math.floor(yr);
      }
    } else {
      data.founding_year = null;
    }
    if (data.gst_tax_id) {
      const gstinRes = validateGstin(data.gst_tax_id);
      if (!gstinRes.isValid) {
        errors.gst_tax_id = gstinRes.error;
      }
    }
    const isValid = Object.keys(errors).length === 0;
    return {
      isValid,
      errors,
      firstError: Object.values(errors)[0],
      sanitizedData: data
    };
  }
  function validateConsultancyProfile(profile, { mode = "onboarding" } = {}) {
    const errors = {};
    const data = { ...profile || {} };
    const consultType = typeof data.consultancy_type === "string" ? data.consultancy_type.trim().toLowerCase() : "";
    if (!consultType || !CONSULTANCY_TYPES.includes(consultType)) {
      errors.consultancy_type = "Please select your agency type";
    } else {
      data.consultancy_type = consultType;
    }
    const consultName = typeof data.consultancy_name === "string" ? data.consultancy_name.trim() : "";
    if (!consultName) {
      errors.consultancy_name = "Agency name is required";
    } else if (consultName.length > 255) {
      errors.consultancy_name = "Agency name cannot be more than 255 characters";
    } else {
      data.consultancy_name = consultName;
    }
    const location = typeof data.headquarters_location === "string" ? data.headquarters_location.trim() : "";
    if (!location) {
      errors.headquarters_location = "Location is required";
    } else if (location.length > 255) {
      errors.headquarters_location = "Location cannot be more than 255 characters";
    } else {
      data.headquarters_location = location;
    }
    let specs = [];
    if (Array.isArray(data.industry_specialization)) {
      specs = data.industry_specialization.map((s) => String(s).trim()).filter(Boolean);
    } else if (typeof data.industry_specialization === "string") {
      specs = data.industry_specialization.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (specs.length === 0) {
      errors.industry_specialization = "Select at least one industry";
    } else {
      data.industry_specialization = specs;
    }
    if (data.company_size) {
      const cs = String(data.company_size).trim();
      if (cs && !COMPANY_SIZES.includes(cs)) {
        errors.company_size = "Please select a valid company size";
      } else {
        data.company_size = cs || null;
      }
    } else {
      data.company_size = null;
    }
    const contact = { ...data.primary_contact || {} };
    const contactName = typeof contact.full_name === "string" ? contact.full_name.trim() : typeof data.full_name === "string" ? data.full_name.trim() : "";
    if (!contactName) {
      errors["primary_contact.full_name"] = "Your name is required";
    } else if (contactName.length > 200) {
      errors["primary_contact.full_name"] = "Name cannot be more than 200 characters";
    } else {
      contact.full_name = contactName;
    }
    const rawPhone = contact.phone || data.phone;
    const phoneRes = validatePhoneNumber(rawPhone, {
      required: mode === "profile",
      fieldLabel: "Phone number"
    });
    if (!phoneRes.isValid) {
      errors["primary_contact.phone"] = phoneRes.error;
    } else {
      contact.phone = phoneRes.digits || null;
    }
    if (contact.designation) {
      contact.designation = String(contact.designation).trim().slice(0, 100);
    } else if (data.designation) {
      contact.designation = String(data.designation).trim().slice(0, 100);
    } else {
      contact.designation = null;
    }
    data.primary_contact = contact;
    if (data.website) {
      const webRes = validateWebsiteUrl(data.website, { required: false });
      if (!webRes.isValid) {
        errors.website = webRes.error;
      } else {
        data.website = webRes.sanitized;
      }
    } else {
      data.website = null;
    }
    if (data.founding_year !== void 0 && data.founding_year !== null && data.founding_year !== "") {
      const yr = Number(data.founding_year);
      if (!Number.isFinite(yr) || yr < LIMITS.foundingYear.min || yr > LIMITS.foundingYear.max) {
        errors.founding_year = `Founding year must be between ${LIMITS.foundingYear.min} and ${LIMITS.foundingYear.max}`;
      } else {
        data.founding_year = Math.floor(yr);
      }
    } else {
      data.founding_year = null;
    }
    const isValid = Object.keys(errors).length === 0;
    return {
      isValid,
      errors,
      firstError: Object.values(errors)[0],
      sanitizedData: data
    };
  }

  // widget/src/hirepool-signup.js
  var HIREPOOL_SIGNUP_STATES = Object.freeze({
    IDLE: "idle",
    ROLE_SELECTION: "role_selection",
    AGREEMENT_FETCHING: "agreement_fetching",
    SIGNUP_FORM: "signup_form",
    REGISTERING: "registering",
    SIGNUP_SUBMITTING: "registering",
    REGISTRATION_CONFIRMED: "registration_confirmed",
    EMAIL_VERIFICATION_PENDING: "email_verification_pending",
    VERIFICATION_PENDING: "email_verification_pending",
    EMAIL_VERIFICATION_IN_PROGRESS: "email_verification_in_progress",
    VERIFICATION_IN_PROGRESS: "email_verification_in_progress",
    EMAIL_VERIFIED: "email_verified",
    PROFILE_COLLECTION: "profile_collection",
    PROFILE_REVIEW: "profile_review",
    PROFILE_SUBMITTING: "profile_submitting",
    PROFILE_READBACK: "profile_readback",
    AUTH_SESSION_ESTABLISHED: "auth_session_established",
    AUTHENTICATION_SMOKE_TEST: "authentication_smoke_test",
    COMPLETED: "completed",
    ERROR: "error",
    CANCELLED: "cancelled"
  });
  var ROLE_DEFINITIONS = Object.freeze({
    candidate: {
      label: "Candidate",
      description: "Looking for tech jobs and personalized AI matching",
      badge: "Job Seeker",
      defaultTitle: "Software Engineer"
    },
    client: {
      label: "Employer / Company",
      description: "Hiring talent and managing applications for your company",
      badge: "Hiring Company",
      defaultTitle: "Hiring Manager"
    },
    consultancy: {
      label: "Agency / Consultancy",
      description: "Placing candidates and tracking placements across clients",
      badge: "Recruitment Agency",
      defaultTitle: "Recruitment Partner"
    }
  });
  function escapeHtml2(str) {
    if (typeof str !== "string") return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  var APPROVED_VERIFICATION_ORIGINS = /* @__PURE__ */ new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]);
  function isSafeVerificationUrl(rawUrl, extraOrigins = []) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return false;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    const approved = APPROVED_VERIFICATION_ORIGINS.has(parsed.origin) || Array.isArray(extraOrigins) && extraOrigins.includes(parsed.origin);
    if (!approved) return false;
    if (!parsed.pathname.startsWith("/auth/verify") && parsed.pathname !== "/verify-email") return false;
    return Boolean(parsed.searchParams.get("token"));
  }
  function parseHirePoolRoleChoice(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;
    if (/\bstaffing\b/i.test(trimmed)) {
      return "staffing";
    }
    if (/\b(?:as\s+(?:a\s+)?candidate|candidate|job\s*seeker|applicant)\b/i.test(trimmed)) {
      return "candidate";
    }
    if (/\b(?:company|client|employer)\b/i.test(trimmed)) {
      return "client";
    }
    if (/\b(?:consultancy|agency|recruitment\s+(?:agency|firm))\b/i.test(trimmed)) {
      return "consultancy";
    }
    return null;
  }
  var HirePoolSignupCoordinator = class {
    constructor({ apiClient, onAuthenticated, onHandoff, onStateChange, onAddMessage, getApprovedOrigins } = {}) {
      this.apiClient = apiClient;
      this.getApprovedOrigins = typeof getApprovedOrigins === "function" ? getApprovedOrigins : () => [];
      this.onAuthenticated = onAuthenticated;
      this.onHandoff = onHandoff;
      this.onStateChange = onStateChange;
      this.onAddMessage = onAddMessage;
      this.state = HIREPOOL_SIGNUP_STATES.IDLE;
      this.selectedRole = null;
      this.agreement = null;
      this.session = null;
      this.verificationUrl = null;
      this.profileData = {};
      this.missingFields = [];
      this._verificationCheckPromise = null;
      this._verifiedTransitioned = false;
    }
    setState(nextState, extra = {}) {
      this.state = nextState;
      if (this.onStateChange) {
        this.onStateChange(this.state, {
          role: this.selectedRole,
          session: this.session,
          verificationUrl: this.verificationUrl,
          profileData: this.profileData,
          missingFields: this.missingFields,
          ...extra
        });
      }
    }
    async start(initialRole = null) {
      if (initialRole && ROLE_DEFINITIONS[initialRole]) {
        return this.selectRole(initialRole);
      }
      this.setState(HIREPOOL_SIGNUP_STATES.ROLE_SELECTION);
      return { stage: HIREPOOL_SIGNUP_STATES.ROLE_SELECTION };
    }
    async selectRole(role) {
      let resolvedRole = role;
      let initialConsultancyType = null;
      if (role === "staffing") {
        resolvedRole = "consultancy";
        initialConsultancyType = "staffing";
      }
      if (!ROLE_DEFINITIONS[resolvedRole]) {
        throw new Error(`Unsupported role: ${role}`);
      }
      this.selectedRole = resolvedRole;
      if (initialConsultancyType) {
        this.profileData.consultancy_type = initialConsultancyType;
      }
      this.setState(HIREPOOL_SIGNUP_STATES.AGREEMENT_FETCHING, { role: this.selectedRole });
      try {
        const agreement = await this.apiClient.getSignupAgreement(this.selectedRole);
        this.agreement = agreement;
        this.setState(HIREPOOL_SIGNUP_STATES.SIGNUP_FORM, { agreement, role: this.selectedRole });
        return { stage: HIREPOOL_SIGNUP_STATES.SIGNUP_FORM, agreement };
      } catch (error) {
        this.setState(HIREPOOL_SIGNUP_STATES.ERROR, { error: error.message });
        throw error;
      }
    }
    async submitSignup({ email, password, confirmPassword }) {
      if (!this.selectedRole || !this.agreement) {
        throw new Error("Please select an account type and accept the User Agreement.");
      }
      this.setState(HIREPOOL_SIGNUP_STATES.REGISTERING);
      try {
        const result = await this.apiClient.signupRegister({
          email,
          password,
          confirmPassword,
          userType: this.selectedRole,
          acceptAgreement: true,
          agreementVersionId: this.agreement.id
        });
        this.session = {
          signupToken: result.signupToken,
          email: result.email,
          userType: result.userType
        };
        this.verificationUrl = isSafeVerificationUrl(result?.verificationUrl, this.getApprovedOrigins()) ? result.verificationUrl : null;
        this._verifiedTransitioned = false;
        this.setState(HIREPOOL_SIGNUP_STATES.REGISTRATION_CONFIRMED, {
          session: this.session,
          verificationUrl: this.verificationUrl,
          result
        });
        this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING, {
          session: this.session,
          verificationUrl: this.verificationUrl
        });
        return result;
      } catch (error) {
        this.setState(HIREPOOL_SIGNUP_STATES.SIGNUP_FORM, { error: error.message });
        throw error;
      }
    }
    async resendVerification() {
      if (!this.session?.signupToken) {
        throw new Error("No active registration session.");
      }
      const result = await this.apiClient.resendSignupVerification({ signupToken: this.session.signupToken });
      if (isSafeVerificationUrl(result?.verificationUrl, this.getApprovedOrigins())) {
        this.verificationUrl = result.verificationUrl;
        if (this.state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING) {
          this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING, {
            session: this.session,
            verificationUrl: this.verificationUrl,
            message: "A fresh verification email has been sent. Use the button below to verify your email."
          });
        }
      }
      return result;
    }
    async verifyWithToken(tokenOrUrl) {
      if (!this.session?.signupToken) {
        throw new Error("No active registration session.");
      }
      if (this._verifiedTransitioned) {
        return { isVerified: true };
      }
      this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_IN_PROGRESS);
      try {
        const result = await this.apiClient.verifySignupEmail({
          signupToken: this.session.signupToken,
          verificationToken: tokenOrUrl
        });
        this._verifiedTransitioned = true;
        this.verificationUrl = null;
        this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFIED);
        this.missingFields = this._getInitialMissingFields(this.selectedRole);
        this.setState(HIREPOOL_SIGNUP_STATES.PROFILE_COLLECTION, { missingFields: this.missingFields });
        return result;
      } catch (error) {
        this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING, { error: error.message });
        throw error;
      }
    }
    async checkVerificationStatus({ silent = false } = {}) {
      if (!this.session?.signupToken) {
        throw new Error("No active registration session.");
      }
      if (this._verifiedTransitioned || this.state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFIED || this.state === HIREPOOL_SIGNUP_STATES.PROFILE_COLLECTION || this.state === HIREPOOL_SIGNUP_STATES.PROFILE_REVIEW || this.state === HIREPOOL_SIGNUP_STATES.COMPLETED) {
        return { isVerified: true };
      }
      if (this._verificationCheckPromise) {
        return this._verificationCheckPromise;
      }
      if (!silent) {
        this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_IN_PROGRESS);
      }
      const runCheck = (async () => {
        try {
          const result = await this.apiClient.checkSignupVerificationStatus(this.session.signupToken);
          if (result.isVerified) {
            if (!this._verifiedTransitioned) {
              this._verifiedTransitioned = true;
              this.verificationUrl = null;
              this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFIED);
              this.missingFields = this._getInitialMissingFields(this.selectedRole);
              this.setState(HIREPOOL_SIGNUP_STATES.PROFILE_COLLECTION, { missingFields: this.missingFields });
            }
          } else if (!silent) {
            this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING, {
              notVerifiedYet: true,
              verificationUrl: this.verificationUrl,
              message: this.verificationUrl ? 'Email verification not completed yet. Click "Verify Email" above (or use the link in your inbox), then we will continue automatically.' : "Verification link not yet clicked. Please check your email inbox and click the link, then try again."
            });
          }
          return result;
        } catch (error) {
          if (!silent) {
            this.setState(HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING, {
              verificationUrl: this.verificationUrl,
              error: error.message
            });
          }
          throw error;
        } finally {
          this._verificationCheckPromise = null;
        }
      })();
      this._verificationCheckPromise = runCheck;
      return runCheck;
    }
    async updateProfileFields(fields) {
      if (!this.session?.signupToken) {
        throw new Error("No active registration session.");
      }
      const result = await this.apiClient.updateSignupProfile({
        signupToken: this.session.signupToken,
        fields
      });
      this.profileData = result.profileData;
      this.missingFields = result.missingFields;
      this.setState(result.stage, {
        profileData: this.profileData,
        missingFields: this.missingFields
      });
      return result;
    }
    async completeProfile(finalProfile = null) {
      if (!this.session?.signupToken) {
        throw new Error("No active registration session.");
      }
      this.setState(HIREPOOL_SIGNUP_STATES.PROFILE_SUBMITTING);
      try {
        const payload = finalProfile || this.profileData;
        const result = await this.apiClient.completeSignupProfile({
          signupToken: this.session.signupToken,
          confirmedProfile: payload
        });
        if (result?.handoff?.type === "app") {
          if (this.onHandoff) {
            await this.onHandoff({ ...result.handoff, role: result.handoff.role || this.selectedRole });
          }
          this.setState(HIREPOOL_SIGNUP_STATES.COMPLETED, { result });
          return result;
        }
        this.setState(HIREPOOL_SIGNUP_STATES.PROFILE_READBACK, { profile: result.profile });
        this.setState(HIREPOOL_SIGNUP_STATES.AUTH_SESSION_ESTABLISHED, { result });
        this.setState(HIREPOOL_SIGNUP_STATES.AUTHENTICATION_SMOKE_TEST);
        if (this.onAuthenticated) {
          await this.onAuthenticated({
            credential: result.credential,
            sessionScope: result.sessionScope,
            expiresIn: result.expiresIn,
            identity: result.identity,
            profile: result.profile,
            role: this.selectedRole
          });
        }
        this.setState(HIREPOOL_SIGNUP_STATES.COMPLETED, { result });
        return result;
      } catch (error) {
        this.setState(HIREPOOL_SIGNUP_STATES.PROFILE_REVIEW, { error: error.message });
        throw error;
      }
    }
    async cancel() {
      if (this.session?.signupToken) {
        try {
          await this.apiClient.cancelSignup(this.session.signupToken);
        } catch {
        }
      }
      this.state = HIREPOOL_SIGNUP_STATES.IDLE;
      this.selectedRole = null;
      this.agreement = null;
      this.session = null;
      this.verificationUrl = null;
      this.profileData = {};
      this.missingFields = [];
      this._verificationCheckPromise = null;
      this._verifiedTransitioned = false;
      this.setState(HIREPOOL_SIGNUP_STATES.IDLE);
    }
    /**
     * Export only non-sensitive pre-registration state (`role_selection` or
     * `signup_form`) for safe persistence across reloads. Never includes
     * credentials, passwords, email addresses, or verification/signup tokens.
     */
    getSafeProgressSnapshot() {
      if (this.state === HIREPOOL_SIGNUP_STATES.ROLE_SELECTION) {
        return {
          state: "role_selection",
          selectedRole: null,
          consultancyType: null,
          agreement: null
        };
      }
      if (this.state === HIREPOOL_SIGNUP_STATES.SIGNUP_FORM && this.selectedRole) {
        return {
          state: "signup_form",
          selectedRole: this.selectedRole,
          consultancyType: this.profileData?.consultancy_type || null,
          agreement: this.agreement ? {
            id: this.agreement.id || this.agreement.version_id || null,
            version: this.agreement.version || null,
            role: this.agreement.role || this.selectedRole,
            title: this.agreement.title || null,
            summary: this.agreement.summary || null,
            effectiveDate: this.agreement.effectiveDate || this.agreement.effective_date || null
          } : null
        };
      }
      return null;
    }
    /**
     * Restore safe non-sensitive signup UI state (`role_selection` or `signup_form`)
     * after a page reload.
     *
     * @param {object|null} snapshot
     */
    async restoreProgress(snapshot) {
      if (!snapshot || typeof snapshot !== "object") return false;
      if (snapshot.state === "role_selection") {
        this.selectedRole = null;
        this.agreement = null;
        this.setState(HIREPOOL_SIGNUP_STATES.ROLE_SELECTION);
        return true;
      }
      if (snapshot.state === "signup_form" && snapshot.selectedRole && ROLE_DEFINITIONS[snapshot.selectedRole]) {
        this.selectedRole = snapshot.selectedRole;
        if (snapshot.consultancyType) {
          this.profileData.consultancy_type = snapshot.consultancyType;
        }
        if (snapshot.agreement && snapshot.agreement.id) {
          this.agreement = snapshot.agreement;
          this.setState(HIREPOOL_SIGNUP_STATES.SIGNUP_FORM, {
            agreement: this.agreement,
            role: this.selectedRole
          });
          return true;
        }
        await this.selectRole(snapshot.selectedRole);
        return true;
      }
      return false;
    }
    /**
     * Re-emit / focus the current active signup card when the user asks to
     * continue or resume signup via chat.
     */
    resume() {
      if (this.state === HIREPOOL_SIGNUP_STATES.IDLE || this.state === HIREPOOL_SIGNUP_STATES.CANCELLED || this.state === HIREPOOL_SIGNUP_STATES.COMPLETED) {
        return false;
      }
      this.setState(this.state, {
        role: this.selectedRole,
        agreement: this.agreement,
        session: this.session,
        profileData: this.profileData,
        missingFields: this.missingFields
      });
      return true;
    }
    _getInitialMissingFields(role) {
      if (role === "candidate") {
        return ["first_name", "last_name", "current_location", "job_title"];
      }
      if (role === "client") {
        return ["company_name", "industry", "company_size", "headquarters_location", "primary_contact.full_name"];
      }
      if (role === "consultancy") {
        return ["consultancy_name", "consultancy_type", "industry_specialization", "headquarters_location", "primary_contact.full_name"];
      }
      return [];
    }
  };
  function renderRoleSelectionCard({ onSelect, onCancel }) {
    const card = document.createElement("div");
    card.className = "ai-action-card ai-signup-card";
    card.innerHTML = `
    <div class="ai-action-header">
      <span class="ai-action-badge">Registration</span>
      <span class="ai-action-title">Create a HirePool Account</span>
    </div>
    <p class="ai-action-explanation">Select your role to begin registration directly inside this assistant:</p>
    <div class="ai-signup-role-options">
      <button type="button" class="ai-role-btn" data-role="candidate">
        <div class="ai-role-badge">Job Seeker</div>
        <div class="ai-role-title">Candidate</div>
        <div class="ai-role-desc">Looking for tech jobs and AI match scoring</div>
      </button>
      <button type="button" class="ai-role-btn" data-role="client">
        <div class="ai-role-badge">Hiring Company</div>
        <div class="ai-role-title">Employer / Company</div>
        <div class="ai-role-desc">Post jobs and manage your candidate pipeline</div>
      </button>
      <button type="button" class="ai-role-btn" data-role="consultancy">
        <div class="ai-role-badge">Recruitment Agency</div>
        <div class="ai-role-title">Agency / Consultancy</div>
        <div class="ai-role-desc">Place agency candidates and track commissions</div>
      </button>
    </div>
    <div class="ai-action-controls" style="margin-top: 12px;">
      <button type="button" class="ai-btn-action-cancel">Cancel</button>
    </div>
  `;
    card.querySelectorAll(".ai-role-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const role = btn.getAttribute("data-role");
        onSelect(role);
      });
    });
    card.querySelector(".ai-btn-action-cancel")?.addEventListener("click", () => {
      card.remove();
      if (onCancel) onCancel();
    });
    return card;
  }
  function renderSignupFormCard({ role, agreement, onSubmit, onCancel }) {
    const card = document.createElement("div");
    card.className = "ai-action-card ai-signup-card";
    const roleMeta = ROLE_DEFINITIONS[role] || { label: role, badge: "HirePool Account" };
    card.innerHTML = `
    <div class="ai-action-header">
      <span class="ai-action-badge">${escapeHtml2(roleMeta.badge)}</span>
      <span class="ai-action-title">Sign up as ${escapeHtml2(roleMeta.label)}</span>
    </div>
    <p class="ai-action-explanation">Enter your details to create your ${escapeHtml2(roleMeta.label)} account. Passwords are encrypted directly and never shared with the AI model.</p>
    
    <form class="ai-signup-form" autocomplete="off">
      <div class="ai-form-group">
        <label class="ai-form-label">Email Address *</label>
        <input type="email" name="email" class="ai-form-input" required placeholder="you@company.com" autocomplete="username">
      </div>
      <div class="ai-form-group">
        <label class="ai-form-label">Password * (min 8 chars, 1 uppercase, 1 lowercase, 1 number)</label>
        <div class="ai-password-wrapper">
          <input type="password" name="password" class="ai-form-input" required minlength="8" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="new-password">
          <button type="button" class="ai-password-toggle" title="Show/Hide Password">\u{1F441}</button>
        </div>
      </div>
      <div class="ai-form-group">
        <label class="ai-form-label">Confirm Password *</label>
        <input type="password" name="confirmPassword" class="ai-form-input" required minlength="8" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="new-password">
      </div>

      <div class="ai-form-group ai-agreement-group">
        <label class="ai-action-acknowledgement" style="font-size: 13px;">
          <input type="checkbox" name="acceptAgreement" required>
          I agree to the <a href="http://localhost:5173/agreements?role=${encodeURIComponent(role)}" target="_blank" rel="noopener noreferrer" style="color: #16a34a; text-decoration: underline;">HirePool User Agreement (v${escapeHtml2(agreement?.version || "1.0")})</a>.
        </label>
      </div>

      <div class="ai-form-error" style="display: none; color: #dc2626; font-size: 13px; margin-bottom: 10px;"></div>

      <div class="ai-action-controls">
        <button type="submit" class="ai-btn-action-confirm">Create Account</button>
        <button type="button" class="ai-btn-action-cancel">Cancel</button>
      </div>
    </form>
  `;
    const form = card.querySelector("form");
    const errorBox = card.querySelector(".ai-form-error");
    const submitBtn = card.querySelector(".ai-btn-action-confirm");
    const cancelBtn = card.querySelector(".ai-btn-action-cancel");
    const passwordInput = card.querySelector('input[name="password"]');
    const toggleBtn = card.querySelector(".ai-password-toggle");
    toggleBtn?.addEventListener("click", () => {
      passwordInput.type = passwordInput.type === "password" ? "text" : "password";
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.style.display = "none";
      const email = form.email.value.trim();
      const password = form.password.value;
      const confirmPassword = form.confirmPassword.value;
      const acceptAgreement = form.acceptAgreement.checked;
      const emailRes = validateEmail(email, { required: true });
      if (!emailRes.isValid) {
        errorBox.textContent = emailRes.error || "Please enter a valid email address.";
        errorBox.style.display = "block";
        form.email.focus();
        return;
      }
      const passRes = validatePassword(password, { confirmPassword, acceptAgreement, requireAgreement: true });
      if (!passRes.isValid) {
        errorBox.textContent = passRes.firstError;
        errorBox.style.display = "block";
        if (passRes.firstError.includes("match")) {
          form.confirmPassword.focus();
        } else if (passRes.firstError.includes("Agreement")) {
          form.acceptAgreement.focus();
        } else {
          form.password.focus();
        }
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating account...";
      try {
        await onSubmit({ email: emailRes.sanitized, password, confirmPassword });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
        errorBox.textContent = err.message || "Registration failed.";
        errorBox.style.display = "block";
      }
    });
    cancelBtn.addEventListener("click", () => {
      card.remove();
      if (onCancel) onCancel();
    });
    return card;
  }
  function renderVerificationCard({
    email,
    verificationUrl = null,
    onVerifyClick,
    onCheckStatus,
    onResend,
    onCancel,
    notVerifiedYet = false,
    message = null,
    error = null,
    approvedOrigins = []
  }) {
    const card = document.createElement("div");
    card.className = "ai-action-card ai-signup-card";
    const safeUrl = isSafeVerificationUrl(verificationUrl, approvedOrigins) ? verificationUrl : null;
    const introText = safeUrl ? `Your verification email has been sent to <strong>${escapeHtml2(email)}</strong>. You can verify your email using the button below.` : `We've sent a verification link to <strong>${escapeHtml2(email)}</strong>.`;
    const hintHtml = safeUrl ? "Click <strong>Verify Email</strong> below to confirm your address. Once verified, we'll automatically load your profile setup here." : "<strong>Check your email:</strong> Open the verification link sent to your inbox to verify your account. We'll detect verification automatically when you return, or you can check status below.";
    card.innerHTML = `
    <div class="ai-action-header">
      <span class="ai-action-badge">Email Verification</span>
      <span class="ai-action-title">Verify Your Email</span>
    </div>
    <div class="ai-verification-body">
      <p style="margin: 0 0 10px 0; font-size: 13px; line-height: 1.5; color: var(--ai-text, #0f172a); overflow-wrap: break-word;">
        ${introText}
      </p>
      <div style="background: rgba(22, 163, 74, 0.08); border: 1px solid rgba(22, 163, 74, 0.25); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; font-size: 12px; line-height: 1.45; color: var(--ai-text, #0f172a); overflow-wrap: break-word;">
        ${hintHtml}
      </div>

      <div class="ai-verification-msg" style="display: ${error || notVerifiedYet || message ? "block" : "none"}; font-size: 12px; margin-bottom: 12px; padding: 8px 10px; border-radius: 6px; overflow-wrap: break-word; ${error || notVerifiedYet ? "background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;" : "background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;"}">
        ${escapeHtml2(error || message || "")}
      </div>

      <div class="ai-action-controls">
        ${safeUrl ? '<button type="button" class="ai-btn-action-confirm ai-btn-verify-email">Verify Email</button>' : ""}
        <button type="button" class="${safeUrl ? "ai-btn-action-edit ai-btn-check-status" : "ai-btn-action-confirm ai-btn-check-status"}">${safeUrl ? "Check status" : "Check Verification Status"}</button>
        <button type="button" class="ai-btn-action-edit ai-btn-resend">Resend email</button>
        <button type="button" class="ai-btn-action-cancel">Cancel</button>
      </div>
    </div>
  `;
    const verifyBtn = card.querySelector(".ai-btn-verify-email");
    const checkStatusBtn = card.querySelector(".ai-btn-check-status");
    const resendBtn = card.querySelector(".ai-btn-resend");
    const cancelBtn = card.querySelector(".ai-btn-action-cancel");
    const msgBox = card.querySelector(".ai-verification-msg");
    const showMsg = (text, isError = true) => {
      msgBox.textContent = text;
      msgBox.style.color = isError ? "#991b1b" : "#1e40af";
      msgBox.style.background = isError ? "#fef2f2" : "#eff6ff";
      msgBox.style.border = isError ? "1px solid #fecaca" : "1px solid #bfdbfe";
      msgBox.style.display = "block";
    };
    if (verifyBtn && safeUrl) {
      verifyBtn.addEventListener("click", () => {
        if (onVerifyClick) {
          onVerifyClick(safeUrl);
        } else if (typeof window !== "undefined" && typeof window.open === "function") {
          window.open(safeUrl, "_blank", "noopener,noreferrer");
        }
        showMsg("Verification link opened. Complete verification in that tab and we will advance automatically once confirmed.", false);
      });
    }
    checkStatusBtn.addEventListener("click", async () => {
      if (checkStatusBtn.disabled) return;
      checkStatusBtn.disabled = true;
      const idleLabel = safeUrl ? "Check status" : "Check Verification Status";
      checkStatusBtn.textContent = "Checking...";
      try {
        const res = await onCheckStatus();
        if (!res?.isVerified) {
          showMsg("Verification not detected yet. Complete verification and we will automatically continue once confirmed.");
          checkStatusBtn.disabled = false;
          checkStatusBtn.textContent = idleLabel;
        }
      } catch (err) {
        checkStatusBtn.disabled = false;
        checkStatusBtn.textContent = idleLabel;
        showMsg(err.message || "Could not verify status.");
      }
    });
    resendBtn.addEventListener("click", async () => {
      if (resendBtn.disabled) return;
      resendBtn.disabled = true;
      resendBtn.textContent = "Sending...";
      try {
        const res = await onResend();
        showMsg(
          res?.verificationUrl ? "A fresh verification email has been sent. Use Verify Email above to verify." : "A fresh verification email has been requested. Check your inbox.",
          false
        );
      } catch (err) {
        showMsg(err.message || "Could not resend email.");
      } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend email";
      }
    });
    cancelBtn.addEventListener("click", () => {
      card.remove();
      if (onCancel) onCancel();
    });
    return card;
  }
  function renderProfileCollectionCard({ role, profileData = {}, missingFields = [], onReview, onCancel }) {
    const card = document.createElement("div");
    card.className = "ai-action-card ai-signup-card";
    const roleMeta = ROLE_DEFINITIONS[role] || { label: role, badge: "Profile" };
    let fieldsHtml = "";
    if (role === "candidate") {
      fieldsHtml = `
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">First Name *</label>
          <input type="text" name="first_name" class="ai-form-input" required value="${escapeHtml2(profileData.first_name || "")}">
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Last Name *</label>
          <input type="text" name="last_name" class="ai-form-input" required value="${escapeHtml2(profileData.last_name || "")}">
        </div>
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Current Location (City) *</label>
          <input type="text" name="current_location" class="ai-form-input" required placeholder="e.g. Bengaluru" value="${escapeHtml2(profileData.current_location || "")}">
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Phone Number (10 digits)</label>
          <input type="tel" name="phone" class="ai-form-input" placeholder="e.g. 9876543210" value="${escapeHtml2(profileData.phone || "")}">
        </div>
      </div>
      <div class="ai-form-group">
        <label class="ai-form-label">Current / Desired Job Title *</label>
        <input type="text" name="job_title" class="ai-form-input" required placeholder="e.g. Senior Frontend Developer" value="${escapeHtml2(profileData.job_title || "")}">
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Years of Experience (0-50)</label>
          <input type="number" name="years_of_experience" min="0" max="50" class="ai-form-input" value="${profileData.years_of_experience !== void 0 ? profileData.years_of_experience : 0}">
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Notice Period (Days, 0-180)</label>
          <input type="number" name="notice_period_days" min="0" max="180" class="ai-form-input" placeholder="30" value="${profileData.notice_period_days || ""}">
        </div>
      </div>
      <div class="ai-form-group">
        <label class="ai-form-label">Skills (comma separated)</label>
        <input type="text" name="skills" class="ai-form-input" placeholder="React, Node.js, Python, TypeScript" value="${escapeHtml2(Array.isArray(profileData.skills) ? profileData.skills.join(", ") : profileData.skills || "")}">
      </div>
    `;
    } else if (role === "client") {
      fieldsHtml = `
      <div class="ai-form-group">
        <label class="ai-form-label">Company Name *</label>
        <input type="text" name="company_name" class="ai-form-input" required placeholder="e.g. Acme Technologies" value="${escapeHtml2(profileData.company_name || "")}">
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Industry *</label>
          <select name="industry" class="ai-form-input" required>
            ${CLIENT_INDUSTRIES.map((ind) => `<option value="${escapeHtml2(ind)}" ${profileData.industry === ind ? "selected" : ""}>${escapeHtml2(ind)}</option>`).join("")}
          </select>
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Company Size *</label>
          <select name="company_size" class="ai-form-input" required>
            ${COMPANY_SIZES.map((sz) => `<option value="${escapeHtml2(sz)}" ${profileData.company_size === sz ? "selected" : ""}>${escapeHtml2(sz)} employees</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="ai-form-group">
        <label class="ai-form-label">Headquarters Location (City) *</label>
        <input type="text" name="headquarters_location" class="ai-form-input" required placeholder="e.g. Mumbai, India" value="${escapeHtml2(profileData.headquarters_location || "")}">
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Primary Contact Full Name *</label>
          <input type="text" name="contact_name" class="ai-form-input" required placeholder="Your full name" value="${escapeHtml2(profileData.primary_contact?.full_name || profileData.contact_name || "")}">
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Primary Contact Phone</label>
          <input type="tel" name="contact_phone" class="ai-form-input" placeholder="e.g. 9876543210" value="${escapeHtml2(profileData.primary_contact?.phone || profileData.contact_phone || "")}">
        </div>
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Designation</label>
          <input type="text" name="designation" class="ai-form-input" placeholder="e.g. Head of HR" value="${escapeHtml2(profileData.primary_contact?.designation || profileData.designation || "")}">
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Company Website</label>
          <input type="url" name="company_website" class="ai-form-input" placeholder="https://example.com" value="${escapeHtml2(profileData.company_website || "")}">
        </div>
      </div>
    `;
    } else if (role === "consultancy") {
      fieldsHtml = `
      <div class="ai-form-group">
        <label class="ai-form-label">Agency / Consultancy Name *</label>
        <input type="text" name="consultancy_name" class="ai-form-input" required placeholder="e.g. Apex Recruitment" value="${escapeHtml2(profileData.consultancy_name || "")}">
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Agency Type *</label>
          <select name="consultancy_type" class="ai-form-input" required>
            <option value="recruitment" ${(profileData.consultancy_type || "recruitment") === "recruitment" ? "selected" : ""}>Recruitment Agency</option>
            <option value="staffing" ${profileData.consultancy_type === "staffing" ? "selected" : ""}>Staffing Agency</option>
          </select>
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Headquarters Location *</label>
          <input type="text" name="headquarters_location" class="ai-form-input" required placeholder="e.g. Bengaluru" value="${escapeHtml2(profileData.headquarters_location || "")}">
        </div>
      </div>
      <div class="ai-form-group">
        <label class="ai-form-label">Specializations (comma separated) *</label>
        <input type="text" name="industry_specialization" class="ai-form-input" required placeholder="Technology, Finance, Engineering" value="${escapeHtml2(Array.isArray(profileData.industry_specialization) ? profileData.industry_specialization.join(", ") : profileData.industry_specialization || "Technology")}">
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Primary Contact Full Name *</label>
          <input type="text" name="contact_name" class="ai-form-input" required placeholder="Your full name" value="${escapeHtml2(profileData.primary_contact?.full_name || profileData.contact_name || "")}">
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Primary Contact Phone</label>
          <input type="tel" name="contact_phone" class="ai-form-input" placeholder="e.g. 9876543210" value="${escapeHtml2(profileData.primary_contact?.phone || profileData.contact_phone || "")}">
        </div>
      </div>
      <div class="ai-form-row">
        <div class="ai-form-group">
          <label class="ai-form-label">Designation</label>
          <input type="text" name="designation" class="ai-form-input" placeholder="e.g. Managing Director" value="${escapeHtml2(profileData.primary_contact?.designation || profileData.designation || "")}">
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label">Agency Website</label>
          <input type="url" name="website" class="ai-form-input" placeholder="https://example.com" value="${escapeHtml2(profileData.website || "")}">
        </div>
      </div>
    `;
    }
    card.innerHTML = `
    <div class="ai-action-header">
      <span class="ai-action-badge">${escapeHtml2(roleMeta.badge)}</span>
      <span class="ai-action-title">Complete Your Profile</span>
    </div>
    <p class="ai-action-explanation">Your email is verified! Complete the required information below to finish setting up your account:</p>
    
    <form class="ai-profile-form">
      ${fieldsHtml}
      <div class="ai-form-error" style="display: none; color: #dc2626; font-size: 13px; margin: 8px 0;"></div>
      <div class="ai-action-controls" style="margin-top: 14px;">
        <button type="submit" class="ai-btn-action-confirm">Review Profile Details</button>
        <button type="button" class="ai-btn-action-cancel">Cancel</button>
      </div>
    </form>
  `;
    const form = card.querySelector("form");
    const errorBox = card.querySelector(".ai-form-error");
    const cancelBtn = card.querySelector(".ai-btn-action-cancel");
    const setInputError = (input, msg) => {
      if (!input) return;
      input.classList.add("ai-input-invalid");
      let errElem = input.parentElement?.querySelector(".ai-field-error");
      if (!errElem) {
        errElem = document.createElement("div");
        errElem.className = "ai-field-error";
        input.parentElement?.appendChild(errElem);
      }
      errElem.textContent = msg;
      errElem.style.display = "block";
    };
    const clearInputError = (input) => {
      if (!input) return;
      input.classList.remove("ai-input-invalid");
      const errElem = input.parentElement?.querySelector(".ai-field-error");
      if (errElem) {
        errElem.remove();
      }
    };
    const clearAllFieldErrors = () => {
      form.querySelectorAll(".ai-input-invalid").forEach((inp) => inp.classList.remove("ai-input-invalid"));
      form.querySelectorAll(".ai-field-error").forEach((el) => el.remove());
    };
    const phoneInput = form.querySelector('input[name="phone"], input[name="contact_phone"]');
    if (phoneInput) {
      phoneInput.addEventListener("input", () => {
        const val = phoneInput.value;
        if (/[a-zA-Z]/.test(val)) {
          setInputError(phoneInput, "Phone number must contain exactly 10 digits");
        } else {
          clearInputError(phoneInput);
        }
      });
      phoneInput.addEventListener("blur", () => {
        const val = phoneInput.value.trim();
        if (val) {
          const res = validatePhoneNumber(val, { required: false });
          if (!res.isValid) {
            setInputError(phoneInput, res.error);
          } else {
            clearInputError(phoneInput);
          }
        } else {
          clearInputError(phoneInput);
        }
      });
    }
    const websiteInput = form.querySelector('input[name="company_website"], input[name="website"]');
    if (websiteInput) {
      websiteInput.addEventListener("blur", () => {
        const val = websiteInput.value.trim();
        if (val) {
          const res = validateWebsiteUrl(val, { required: false });
          if (!res.isValid) {
            setInputError(websiteInput, res.error);
          } else {
            clearInputError(websiteInput);
          }
        } else {
          clearInputError(websiteInput);
        }
      });
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorBox.style.display = "none";
      clearAllFieldErrors();
      const formData = new FormData(form);
      const data = {};
      for (const [key, val] of formData.entries()) {
        data[key] = val;
      }
      if (role === "client" || role === "consultancy") {
        data.primary_contact = {
          full_name: data.contact_name,
          designation: data.designation || null,
          phone: data.contact_phone || null
        };
        delete data.contact_name;
        delete data.designation;
        delete data.contact_phone;
      }
      if (data.skills && typeof data.skills === "string") {
        data.skills = data.skills.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (data.industry_specialization && typeof data.industry_specialization === "string") {
        data.industry_specialization = data.industry_specialization.split(",").map((s) => s.trim()).filter(Boolean);
      }
      let valResult;
      if (role === "candidate") {
        valResult = validateCandidateProfile(data, { mode: "onboarding" });
      } else if (role === "client") {
        valResult = validateClientProfile(data, { mode: "onboarding" });
      } else if (role === "consultancy") {
        valResult = validateConsultancyProfile(data, { mode: "onboarding" });
      }
      if (valResult && !valResult.isValid) {
        errorBox.textContent = valResult.firstError || "Please correct the highlighted errors.";
        errorBox.style.display = "block";
        let firstInvalidInput = null;
        for (const [errField, errMsg] of Object.entries(valResult.errors)) {
          let inputEl = null;
          if (errField === "primary_contact.full_name") {
            inputEl = form.querySelector('[name="contact_name"]');
          } else if (errField === "primary_contact.phone") {
            inputEl = form.querySelector('[name="contact_phone"]');
          } else if (errField === "primary_contact.designation") {
            inputEl = form.querySelector('[name="designation"]');
          } else {
            inputEl = form.querySelector(`[name="${errField}"]`);
          }
          if (inputEl) {
            setInputError(inputEl, errMsg);
            if (!firstInvalidInput) firstInvalidInput = inputEl;
          }
        }
        if (firstInvalidInput) {
          firstInvalidInput.focus();
        }
        return;
      }
      onReview(valResult ? valResult.sanitizedData : data);
    });
    cancelBtn.addEventListener("click", () => {
      card.remove();
      if (onCancel) onCancel();
    });
    return card;
  }
  function renderProfileReviewCard({ role, profileData, onConfirm, onEdit, onCancel }) {
    const card = document.createElement("div");
    card.className = "ai-action-card ai-signup-card";
    const roleMeta = ROLE_DEFINITIONS[role] || { label: role, badge: "Profile Review" };
    let summaryRows = "";
    for (const [key, val] of Object.entries(profileData)) {
      if (val === void 0 || val === null || val === "" || typeof val === "object" && Object.keys(val).length === 0) continue;
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      let displayVal = val;
      if (key === "primary_contact" && typeof val === "object") {
        const parts = [];
        if (val.full_name) parts.push(`Name: ${val.full_name}`);
        if (val.designation) parts.push(`Designation: ${val.designation}`);
        if (val.phone) parts.push(`Phone: ${val.phone}`);
        displayVal = parts.join(", ");
      } else if (Array.isArray(val)) {
        if (val.length === 0) continue;
        if (typeof val[0] === "object") {
          displayVal = val.map((item) => Object.values(item).filter(Boolean).join(" - ")).join("; ");
        } else {
          displayVal = val.join(", ");
        }
      } else if (typeof val === "object") {
        displayVal = Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(", ");
      }
      summaryRows += `
      <div class="ai-action-param-row">
        <span class="ai-action-param-key">${escapeHtml2(label)}:</span>
        <span class="ai-action-param-val">${escapeHtml2(String(displayVal))}</span>
      </div>
    `;
    }
    card.innerHTML = `
    <div class="ai-action-header">
      <span class="ai-action-badge">${escapeHtml2(roleMeta.badge)}</span>
      <span class="ai-action-title">Review &amp; Confirm Your Profile</span>
    </div>
    <p class="ai-action-explanation">Please review the details below. Once confirmed, your profile will be created and your assistant will be ready for account actions.</p>
    <div class="ai-action-details">${summaryRows}</div>
    <div class="ai-review-msg" style="display: none; color: #dc2626; font-size: 13px; margin: 8px 0;"></div>
    <div class="ai-action-controls" style="margin-top: 14px;">
      <button type="button" class="ai-btn-action-confirm ai-btn-complete">Confirm &amp; Complete Registration</button>
      <button type="button" class="ai-btn-edit" style="background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;">Edit</button>
      <button type="button" class="ai-btn-action-cancel">Cancel</button>
    </div>
  `;
    const confirmBtn = card.querySelector(".ai-btn-complete");
    const editBtn = card.querySelector(".ai-btn-edit");
    const cancelBtn = card.querySelector(".ai-btn-action-cancel");
    const msgBox = card.querySelector(".ai-review-msg");
    confirmBtn.addEventListener("click", async () => {
      msgBox.style.display = "none";
      let valRes;
      if (role === "candidate") {
        valRes = validateCandidateProfile(profileData, { mode: "onboarding" });
      } else if (role === "client") {
        valRes = validateClientProfile(profileData, { mode: "onboarding" });
      } else if (role === "consultancy") {
        valRes = validateConsultancyProfile(profileData, { mode: "onboarding" });
      }
      if (valRes && !valRes.isValid) {
        msgBox.textContent = valRes.firstError || "Profile validation failed. Please edit your details.";
        msgBox.style.display = "block";
        return;
      }
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Saving & Verifying...";
      try {
        await onConfirm();
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Confirm & Complete Registration";
        msgBox.textContent = err.message || "Could not complete registration.";
        msgBox.style.display = "block";
      }
    });
    editBtn.addEventListener("click", () => {
      card.remove();
      onEdit();
    });
    cancelBtn.addEventListener("click", () => {
      card.remove();
      if (onCancel) onCancel();
    });
    return card;
  }

  // widget/src/widget.js
  var WEBSITE_UI_VERSION = "role-cards-4";
  var ICONS = {
    chat: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M7 3H21V17L16.5 12.5L7 22L2 17L11.5 7.5Z"/></svg>`,
    launcherClose: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6L18 18M18 6L6 18"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    minimize: `<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
    send: `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    stop: `<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    attachment: `<svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3 3 0 0 0 6 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>`
  };
  var AssistantWidgetUI = class {
    constructor(options, apiClient, storage, events) {
      this.options = options;
      this.apiClient = apiClient;
      this.storage = storage;
      this.events = events;
      this._initialGreeting = options.greeting || "";
      this._initialSuggestedPrompts = Array.isArray(options.suggestedPrompts) ? [...options.suggestedPrompts] : [];
      this.isOpen = false;
      this.isGenerating = false;
      this.abortController = null;
      this.documentUploadController = null;
      this.hirePoolResume = new HirePoolResumeUpload(
        apiClient,
        (state) => this._renderHirePoolResumeState(state)
      );
      this.hirePoolResumeCard = null;
      this.hirePoolSignup = new HirePoolSignupCoordinator({
        apiClient: this.apiClient,
        getApprovedOrigins: () => this._getApprovedAppOrigins(),
        onAuthenticated: async (session) => {
          await this._handleHirePoolSignupSuccess(session);
        },
        onHandoff: (handoff) => {
          this._displaySignupHandoff(handoff);
        },
        onStateChange: (state, data) => {
          this._renderHirePoolSignupState(state, data);
        }
      });
      this.hirePoolSignupCard = null;
      this._verificationPollTimer = null;
      this._verificationFocusHandler = null;
      this._verificationVisibilityHandler = null;
      this.hostIdentity = null;
      this.messages = [];
      this.activeConversationId = null;
      this.contextOverrideSet = false;
      this.hostElement = null;
      this.shadowRoot = null;
    }
    /**
     * Mount widget into the DOM
     */
    mount(cssContent = "") {
      if (this.hostElement && this.hostElement.parentNode) {
        return;
      }
      if (document.getElementById("ai-assistant-plugin-root")) {
        throw new Error("An AI Assistant widget is already mounted on this page.");
      }
      this.hostElement = document.createElement("div");
      this.hostElement.id = "ai-assistant-plugin-root";
      this.shadowRoot = this.hostElement.attachShadow({ mode: "open" });
      const styleTag = document.createElement("style");
      styleTag.textContent = cssContent;
      this.shadowRoot.appendChild(styleTag);
      this._buildDOM();
      this._restoreState();
      this._attachEvents();
      this._authMessageHandler = (event) => {
        if (!event.data || typeof event.data !== "object") return;
        if (event.data.type === "hirepool-auth:logout") {
          void this._handleHirePoolLogout({ loggedOut: true }, "You have been logged out of HirePool.");
        }
      };
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("message", this._authMessageHandler);
      }
      document.body.appendChild(this.hostElement);
      if (this.options?.surface === "website" || this.options?.surface === "app") {
        this.container.classList.add("ai-theme-hirepool");
        if (this.textarea) this.textarea.placeholder = "Type your question\u2026";
      }
      if (this.options?.surface === "website") {
        this.container.classList.add("ai-surface-website");
      }
      if (this.options?.surface === "website" && this.options?.behavior?.welcome) {
        this.container.classList.add("ai-chat-welcome");
      }
      this._setupIdleNudges();
      this._setupAutoOpen();
    }
    /**
     * Unmount widget and clean up DOM
     */
    unmount() {
      if (this._authMessageHandler && typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("message", this._authMessageHandler);
        this._authMessageHandler = null;
      }
      this._stopVerificationWatcher();
      this._autoOpenController?.stop();
      this._autoOpenController = null;
      if (this._onlineHandler && typeof window !== "undefined") {
        window.removeEventListener("online", this._onlineHandler);
        this._onlineHandler = null;
      }
      this._idleNudge?.stop();
      this._idleNudge = null;
      for (const unsubscribe of this._idleNudgeUnsubscribes || []) unsubscribe();
      this._idleNudgeUnsubscribes = [];
      this._hideTeaser();
      if (this.abortController) {
        this.abortController.abort();
      }
      this.cancelDocumentUpload();
      if (this.hirePoolResume.state === HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION) {
        void this.hirePoolResume.cancel();
      }
      if (this.hirePoolSignup && this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.IDLE) {
        void this.hirePoolSignup.cancel();
      }
      if (this.hostElement && this.hostElement.parentNode) {
        this.hostElement.parentNode.removeChild(this.hostElement);
      }
      this.hostElement = null;
      this.shadowRoot = null;
    }
    _buildDOM() {
      const { name, theme, position, primaryColor, greeting, suggestedPrompts, avatarUrl } = this.options;
      const container = document.createElement("div");
      container.className = `ai-widget-container pos-${position || "bottom-right"}`;
      container.setAttribute("data-theme", theme || "auto");
      if (primaryColor) {
        container.style.setProperty("--ai-primary", primaryColor);
        container.style.setProperty("--ai-user-bubble", primaryColor);
      }
      this.container = container;
      const launcherBtn = document.createElement("button");
      launcherBtn.className = "ai-launcher-btn";
      launcherBtn.type = "button";
      launcherBtn.setAttribute("aria-label", `Open ${name}`);
      launcherBtn.setAttribute("aria-haspopup", "dialog");
      launcherBtn.setAttribute("aria-expanded", "false");
      launcherBtn.innerHTML = `
      <span class="icon-chat">${ICONS.chat}</span>
      <span class="icon-close">${ICONS.launcherClose}</span>
      <span class="ai-launcher-badge" aria-hidden="true">.ai</span>
    `;
      this.launcherBtn = launcherBtn;
      const panel = document.createElement("div");
      panel.className = "ai-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-label", name);
      const avatarHtml = avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)} avatar"/>` : `<span class="ai-avatar-icon">${ICONS.chat}</span>`;
      panel.innerHTML = `
      <header class="ai-header">
        <div class="ai-header-info">
          <div class="ai-avatar">${avatarHtml}</div>
          <div class="ai-header-titles">
            <span class="ai-title">${escapeHtml(name)}</span>
            <span class="ai-status">
              <span class="ai-status-dot"></span>
              <span class="ai-status-text">HirePool Online</span>
            </span>
          </div>
        </div>
        <div class="ai-header-actions">
          <button class="ai-header-signin" type="button" data-auth="signin">Sign in</button>
          <button class="ai-header-signup" type="button" data-auth="signup">Sign up</button>
          <button class="ai-icon-btn btn-new-chat" type="button" title="New Conversation" aria-label="Start new conversation">
            ${ICONS.refresh}
          </button>
          <button class="ai-icon-btn btn-close" type="button" title="Close" aria-label="Close chat panel">
            ${ICONS.close}
          </button>
        </div>
      </header>
      <div class="ai-auth-bar" role="group" aria-label="Account">
        <button class="ai-auth-btn ai-auth-signin" type="button" data-auth="signin">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h7V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7v-2H4V5z" transform="matrix(-1 0 0 1 24 0)"/></svg>
          Sign in
        </button>
        <button class="ai-auth-btn ai-auth-signup" type="button" data-auth="signup">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0-6a2 2 0 1 1-2 2 2 2 0 0 1 2-2zm0 8c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4zm-6 4c.2-.7 3.3-2 6-2s5.8 1.3 6 2H9zM6 10V7H4v3H1v2h3v3h2v-3h3v-2H6z"/></svg>
          Sign up
        </button>
      </div>

      <main class="ai-body" role="log" aria-live="polite" aria-relevant="additions text">
        <div class="ai-welcome-box">
          <div class="ai-welcome-greeting">${parseMarkdown(String(greeting || ""))}</div>
          ${suggestedPrompts && suggestedPrompts.length > 0 ? `
            <div class="ai-suggested-prompts">
            <div class="ai-suggested-prompts-label">Suggested Prompts</div>
            <div class="ai-prompts-list">
              ${suggestedPrompts.map((p) => `<button type="button" class="ai-prompt-pill">${escapeHtml(p)}</button>`).join("")}
            </div>
            </div>
          ` : ""}
        </div>
        <div class="ai-messages-list"></div>
        <div class="ai-streaming-indicator" style="display: none;">
          <span class="ai-typing-dot"></span>
          <span class="ai-typing-dot"></span>
          <span class="ai-typing-dot"></span>
        </div>
      </main>

      <footer class="ai-footer">
        <form class="ai-input-form">
          <button class="ai-attach-btn" type="button" aria-label="Upload document" title="Upload a document (PDF, DOCX, TXT)">
            ${ICONS.attachment}
          </button>
          <input type="file" class="ai-file-input" accept=".pdf,.docx,.txt,.text,.md,.markdown,.csv,.json,.log,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json" style="display: none;" />
          <textarea
            class="ai-textarea"
            placeholder="Ask HirePool about jobs, applications, candidates..."
            rows="1"
            aria-label="Message input"
            maxlength="10000"
          ></textarea>
          <button class="ai-send-btn" type="submit" aria-label="Send message" disabled>
            ${ICONS.send}
          </button>
          <button class="ai-stop-btn" type="button" aria-label="Stop generating" style="display: none;">
            ${ICONS.stop}
          </button>
        </form>
        <div class="ai-footer-note">Press Enter to send, Shift+Enter for newline</div>
      </footer>
    `;
      this.panel = panel;
      this.messagesList = panel.querySelector(".ai-messages-list");
      this.streamingIndicator = panel.querySelector(".ai-streaming-indicator");
      this.statusDot = panel.querySelector(".ai-status-dot");
      this.statusText = panel.querySelector(".ai-status-text");
      this.textarea = panel.querySelector(".ai-textarea");
      this.sendBtn = panel.querySelector(".ai-send-btn");
      this.stopBtn = panel.querySelector(".ai-stop-btn");
      this.attachBtn = panel.querySelector(".ai-attach-btn");
      this.fileInput = panel.querySelector(".ai-file-input");
      if (this._isHirePoolResumeEnabled()) {
        this.attachBtn.disabled = true;
        this.attachBtn.title = "Sign in to a verified HirePool candidate account to upload a resume.";
        this.attachBtn.setAttribute("aria-label", this.attachBtn.title);
      }
      this.fileInput.accept = this._isHirePoolResumeEnabled() ? ".pdf,application/pdf" : this.options.documentUpload?.allowedExtensions?.join(",") || ".pdf,.docx,.txt";
      if (this.options?.surface === "website") {
        this.attachBtn.title = "Upload a resume, job description or candidate list (PDF, DOCX, TXT)";
        this.attachBtn.setAttribute("aria-label", this.attachBtn.title);
      }
      this.body = panel.querySelector(".ai-body");
      container.appendChild(panel);
      container.appendChild(launcherBtn);
      this.shadowRoot.appendChild(container);
    }
    _attachEvents() {
      this.launcherBtn.addEventListener("click", () => {
        this.toggle();
      });
      this.panel.querySelectorAll("[data-auth]").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.auth === "signin") {
            this._goToLogin();
          } else if (!this.isGenerating) {
            this._clearRoleCards();
            this._clearQuickReplies();
            void this.sendMessage("Sign up for HirePool");
          }
        });
      });
      this.panel.querySelector(".btn-close").addEventListener("click", () => {
        this.close();
      });
      this.panel.querySelector(".btn-new-chat").addEventListener("click", () => {
        this.newConversation();
      });
      this.stopBtn.addEventListener("click", () => {
        this.cancelGeneration();
      });
      this.panel.querySelectorAll(".ai-prompt-pill").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const text = e.target.textContent.trim();
          if (text) {
            this.sendMessage(text);
          }
        });
      });
      this.textarea.addEventListener("input", () => {
        this.textarea.style.height = "auto";
        this.textarea.style.height = Math.min(this.textarea.scrollHeight, 120) + "px";
        this.sendBtn.disabled = !this.textarea.value.trim() || this.isGenerating;
      });
      this.textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const text = this.textarea.value.trim();
          if (text && !this.isGenerating) {
            this.sendMessage(text);
          }
        }
      });
      this.panel.querySelector(".ai-input-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const text = this.textarea.value.trim();
        if (text && !this.isGenerating) {
          this.sendMessage(text);
        }
      });
      if (this.attachBtn && this.fileInput) {
        this.attachBtn.addEventListener("click", () => {
          if (this.isGenerating) return;
          if (this._isHirePoolResumeEnabled() && this.hirePoolResume.state === HIREPOOL_RESUME_STATES.UPLOADING) return;
          this.fileInput.click();
        });
        this.fileInput.addEventListener("change", (e) => {
          const files = Array.from(e.target.files || []);
          const file = files[0];
          if (!file) return;
          this.fileInput.value = "";
          if (this.options?.surface === "app" && this._userRole === "consultancy" && this._assistantHandlers) {
            this._handleBenchFiles(files.slice(0, 20));
            return;
          }
          if (this._isHirePoolResumeEnabled()) {
            this._handleHirePoolResumeFile(file);
          } else {
            this._handleFileUpload(file);
          }
        });
      }
      this.panel.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) {
          this.close();
        }
      });
      this.messagesList.addEventListener("click", (e) => {
        const copyBtn = e.target.closest(".ai-msg-action-btn") || e.target.closest(".copy-code-btn");
        if (copyBtn) {
          this._handleCopyClick(copyBtn);
        }
        const retryBtn = e.target.closest(".ai-error-retry-btn");
        if (retryBtn) {
          if (typeof this._lastErrorRetryCallback === "function") {
            const callback = this._lastErrorRetryCallback;
            this._lastErrorRetryCallback = null;
            retryBtn.disabled = true;
            retryBtn.textContent = "Verifying...";
            void (async () => {
              try {
                const banner = retryBtn.closest(".ai-error-banner");
                if (banner && banner.parentNode) {
                  banner.parentNode.removeChild(banner);
                }
                await callback();
              } catch (retryErr) {
                this._renderErrorBanner(
                  retryErr?.message || "Verification retry failed. Please try again.",
                  callback
                );
              }
            })();
            return;
          }
          const lastUserMsg = [...this.messages].reverse().find((m) => m.role === "user");
          if (lastUserMsg) {
            this.sendMessage(lastUserMsg.content, { displayUserMessage: false });
          }
        }
      });
    }
    _handleCopyClick(btn) {
      let textToCopy = "";
      if (btn.classList.contains("copy-code-btn")) {
        const wrapper = btn.closest(".code-block-wrapper");
        textToCopy = wrapper ? wrapper.querySelector("code").innerText : "";
      } else {
        const row = btn.closest(".ai-message-row");
        textToCopy = row ? row.getAttribute("data-raw-content") : "";
      }
      if (textToCopy && navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = btn.innerHTML;
          btn.innerHTML = btn.classList.contains("copy-code-btn") ? "Copied!" : `${ICONS.check} Copied`;
          setTimeout(() => {
            btn.innerHTML = originalText;
          }, 2e3);
        }).catch((err) => {
          console.warn("Copy failed:", err);
        });
      }
    }
    _restoreState() {
      const savedSession = this.storage.get("hirepool_session", null);
      if (savedSession && savedSession.credential) {
        this.apiClient.setAuthenticatedSession(savedSession);
        this.hostIdentity = savedSession.identity;
        if (typeof this.storage.setUser === "function") {
          this.storage.setUser(savedSession.identity?.id);
        }
        if (this.options.integration) {
          this.options.integration.getAuthHeaders = async () => ({ Authorization: `Bearer ${savedSession.credential}` });
          this.options.integration.getSessionScope = async () => savedSession.sessionScope;
          this.options.integration.getIdentity = async () => savedSession.identity;
          if (typeof this.options.integration.setSession === "function") {
            this.options.integration.setSession(savedSession);
          }
        }
        void this.apiClient.validateHirePoolSession(savedSession.credential).then((validation) => {
          if (!validation?.valid) {
            this._clearSessionAndFallbackToGuest();
          }
        }).catch(() => {
          this._clearSessionAndFallbackToGuest();
        });
      }
      if (this.options?.surface === "website" && this.storage.get("website_ui_version", null) !== WEBSITE_UI_VERSION) {
        this.storage.set("messages", []);
        this.storage.saveConversationId(null);
        this.storage.set("website_ui_version", WEBSITE_UI_VERSION);
      }
      const savedConvoId = this.storage.getConversationId();
      const savedMessages = this.storage.get("messages", []);
      this.activeConversationId = savedConvoId;
      if (Array.isArray(savedMessages) && savedMessages.length > 0) {
        this.messages = savedMessages;
        this.messages.forEach((msg) => {
          this._renderMessageBubble(msg.role, msg.content, false, msg.action);
        });
        const last = this.messages[this.messages.length - 1];
        if (last?.role === "assistant" && Array.isArray(last.quickReplies) && last.quickReplies.length) {
          this._renderQuickReplies(this.messagesList.lastElementChild, last.quickReplies);
        }
        const welcomeRowIndex = this.messages.findIndex((m) => m.appWelcome);
        if (welcomeRowIndex >= 0 && this.messagesList.children[welcomeRowIndex]) {
          this.messagesList.children[welcomeRowIndex].dataset.appWelcome = "1";
          this.container?.classList.add("ai-chat-welcome");
        }
        if (!this.messages.some((m) => m.role === "user")) {
          const index = this.messages.findIndex((m) => Array.isArray(m.roleCards) && m.roleCards.length);
          if (index >= 0) this._renderRoleCards(this.messagesList.children[index], this.messages[index].roleCards);
          const welcomeIndex = this.messages.findIndex((m) => m.appWelcome && m.profileProgress);
          if (welcomeIndex >= 0) this._renderProfileProgress(this.messagesList.children[welcomeIndex], this.messages[welcomeIndex].profileProgress);
        }
      }
      const wasOpen = this.storage.get("is_open", false);
      if (wasOpen) {
        this.open();
      }
      if (this._isGuestSession() && this._isHirePoolSignupEnabled()) {
        const savedSignup = this.storage.getSignupProgress?.();
        if (savedSignup) {
          void this.hirePoolSignup.restoreProgress(savedSignup).catch(() => {
            this.storage.clearSignupProgress?.();
          });
        }
      }
    }
    _clearHirePoolContextAuth() {
      const ctx = this.options?.context;
      if (!ctx) return;
      if (typeof ctx === "object" && !Array.isArray(ctx)) {
        if ("authentication" in ctx || "identity" in ctx) {
          const sanitized = { ...ctx };
          delete sanitized.authentication;
          delete sanitized.identity;
          this.options.context = sanitized;
        }
        return;
      }
      if (typeof ctx === "string" && ctx.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(ctx);
          if (parsed && typeof parsed === "object" && ("authentication" in parsed || "identity" in parsed)) {
            delete parsed.authentication;
            delete parsed.identity;
            this.options.context = JSON.stringify(parsed);
          }
        } catch {
        }
      }
    }
    _resetHirePoolIntegrationToGuest() {
      this._clearHirePoolContextAuth();
      const integration = this.options?.integration;
      if (integration) {
        integration.getAuthHeaders = async () => ({});
        integration.getSessionScope = async () => "guest";
        integration.getIdentity = async () => null;
        if ("authHeadersProvider" in integration) integration.authHeadersProvider = () => ({});
        if ("sessionScopeProvider" in integration) integration.sessionScopeProvider = () => "guest";
        if ("identityProvider" in integration) integration.identityProvider = () => null;
      }
      if (this.apiClient) {
        this.apiClient.clearAuthenticatedSession();
        this.apiClient.clearDemoToken?.();
        this.apiClient.getAuthHeaders = integration ? () => integration.getAuthHeaders() : null;
      }
    }
    _clearSessionAndFallbackToGuest() {
      this.storage.remove("hirepool_session");
      this._resetHirePoolIntegrationToGuest();
      if (typeof this.storage.setUser === "function") {
        this.storage.setUser(null);
      }
      this.storage.remove("hirepool_session");
      this.storage.clear();
      this.activeConversationId = null;
      this.messages = [];
      if (this.messagesList) {
        this.messagesList.innerHTML = "";
      }
      this.setHostIdentity(null, "guest");
      this.setGreeting(this._initialGreeting || "", this._initialSuggestedPrompts || []);
      this._persistState();
    }
    async _handleHirePoolLogout(logoutInfo = {}, confirmationMessage = null) {
      this.cancelGeneration();
      this.cancelDocumentUpload();
      this._stopVerificationWatcher();
      this._dismissRecoverableBanner();
      this.hirePoolResume?.reset?.();
      this.storage.clearSignupProgress?.();
      if (this.hirePoolSignupCard) {
        this.hirePoolSignupCard.remove();
        this.hirePoolSignupCard = null;
      }
      if (this.hirePoolSignup && this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.IDLE) {
        this.hirePoolSignup.state = HIREPOOL_SIGNUP_STATES.IDLE;
        this.hirePoolSignup.selectedRole = null;
        this.hirePoolSignup.agreement = null;
        this.hirePoolSignup.session = null;
        this.hirePoolSignup.verificationUrl = null;
        this.hirePoolSignup.profileData = {};
        this.hirePoolSignup.missingFields = [];
      }
      const integration = this.options?.integration;
      for (const hook of [
        integration?.clearSession,
        integration?.logout,
        integration?.onLogout,
        integration?.logoutHandler,
        this.options?.onLogout
      ]) {
        if (typeof hook === "function") {
          try {
            await hook.call(integration || this.options, logoutInfo);
          } catch {
          }
        }
      }
      this.storage.remove("hirepool_session");
      this.storage.clear();
      this._resetHirePoolIntegrationToGuest();
      if (typeof this.storage.setUser === "function") {
        this.storage.setUser(null);
      }
      this.storage.remove("hirepool_session");
      this.storage.clear();
      this.activeConversationId = null;
      this.messages = [];
      if (this.messagesList) {
        this.messagesList.innerHTML = "";
      }
      this.setHostIdentity(null, "guest");
      this.setGreeting(this._initialGreeting || "", this._initialSuggestedPrompts || []);
      this._persistState();
      this._setGenerating(false);
      if (confirmationMessage) {
        this._renderMessageBubble("assistant", confirmationMessage, false);
      }
      this.events.emit("auth:logout", logoutInfo || { loggedOut: true });
      this.events.emit("conversation:cleared");
    }
    _persistState() {
      this._syncWebsiteChatState();
      this.storage.set("messages", this.messages.map((message) => message.action?.action === "hirepool_begin_login" || message.action?.parameters?.continuationReference ? { ...message, action: { ...message.action, parameters: {} } } : message));
      this.storage.saveConversationId(this.activeConversationId);
      this.storage.set("is_open", this.isOpen);
    }
    open({ focus = true, source = "user" } = {}) {
      if (this.isOpen) return;
      this.isOpen = true;
      this._autoOpened = source === "auto";
      this._hideTeaser();
      this.container.classList.add("is-open");
      this.launcherBtn.setAttribute("aria-expanded", "true");
      this._maybeShowWebsiteWelcome();
      if (this.options?.surface === "app" && !this.messages.some((m) => m.role === "user")) {
        this._idleNudge?.onAssistantMessage("welcome");
      }
      this._persistState();
      this.events.emit("open", { source });
      setTimeout(() => {
        if (focus) this.textarea.focus();
        this._scrollToBottom();
      }, 100);
    }
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.container.classList.remove("is-open");
      this.launcherBtn.setAttribute("aria-expanded", "false");
      this._persistState();
      this.events.emit("close");
      if (this._autoOpened && !this.messages.some((m) => m.role === "user")) {
        this._autoOpenController?.snooze();
      }
      this._autoOpened = false;
      this.launcherBtn.focus();
    }
    /** Website bot: welcome, introduce HirePool, and ask what the visitor needs. */
    _maybeShowWebsiteWelcome() {
      const welcome = this.options?.behavior?.welcome;
      if (this.options?.surface !== "website" || !welcome?.message || this.messages.length > 0) return;
      this._postLocalAssistantMessage(welcome.message, welcome.quickReplies || [], { roleCards: welcome.roleCards });
      this._idleNudge?.onAssistantMessage("welcome");
    }
    /**
     * Show an assistant message that is generated by the widget (welcome or
     * follow-up). It is kept in this tab's history but never sent to the server.
     * A follow-up replaces the previous unanswered follow-up instead of stacking.
     */
    _postLocalAssistantMessage(text, quickReplies = [], { roleCards = null, nudge = false } = {}) {
      if (!nudge || Array.isArray(quickReplies) && quickReplies.length) this._clearQuickReplies();
      const previous = this.messages[this.messages.length - 1];
      if (nudge && previous?.nudge && this.messagesList?.lastElementChild) {
        this.messagesList.lastElementChild.remove();
        this.messages.pop();
      }
      const row = this._renderMessageBubble("assistant", text, true);
      const replies = Array.isArray(quickReplies) ? quickReplies.filter((r) => typeof r === "string" && r.trim()).slice(0, 5) : [];
      if (replies.length) this._renderQuickReplies(row, replies);
      const cards = Array.isArray(roleCards) ? roleCards.filter((c) => c?.title && c?.prompt).slice(0, 4) : [];
      if (cards.length) this._renderRoleCards(row, cards);
      this.messages.push({
        role: "assistant",
        content: text,
        local: true,
        ...nudge ? { nudge: true } : {},
        ...cards.length ? { roleCards: cards } : {},
        ...replies.length ? { quickReplies: replies } : {}
      });
      this._stampLatestReply();
      this._persistState();
    }
    /** Website: a small "HirePool · 10:42" under the latest assistant reply only. */
    _stampLatestReply() {
      if (!["website", "app"].includes(this.options?.surface) || !this.messagesList) return;
      this.messagesList.querySelectorAll(".ai-msg-meta").forEach((el) => el.remove());
      const bubbles = this.messagesList.querySelectorAll(".ai-message-row.assistant > .ai-bubble");
      const bubble = bubbles[bubbles.length - 1];
      if (!bubble) return;
      const meta = document.createElement("div");
      meta.className = "ai-msg-meta";
      let time = "";
      try {
        time = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      } catch {
        time = "";
      }
      meta.textContent = time ? `HirePool \xB7 ${time}` : "HirePool";
      bubble.insertAdjacentElement("afterend", meta);
    }
    /** Website welcome: large tappable cards for job seekers, companies, and agencies. */
    _renderRoleCards(row, cards) {
      if (!row || !Array.isArray(cards) || !cards.length) return;
      const icons = {
        search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>',
        clipboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6a2 2 0 0 1 2 2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2-2zm0 2v2h6V4H9zM5 6v14h14V6h-2v2H7V6H5zm3 5h8v2H8v-2zm0 4h6v2H8v-2z"/></svg>',
        chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2v16h16v2H3V3zm4 9h3v6H7v-6zm5-5h3v11h-3V7zm5 3h3v8h-3v-8z"/></svg>',
        plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>',
        "user-check": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 8c3.3 0 7 1.6 7 4.5V20H2v-1.5C2 15.6 5.7 14 9 14zm0 2c-2.5 0-4.6 1-4.9 2h9.8c-.3-1-2.4-2-4.9-2zm12.3-6.7 1.4 1.4-4.7 4.7-2.7-2.7 1.4-1.4 1.3 1.3 3.3-3.3z"/></svg>',
        "file-upload": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15l4-4 4 4h-3v4h-2v-4H8z"/></svg>',
        edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
        send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
        "list-check": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2v2H3V5zm4 0h14v2H7V5zM3 11h2v2H3v-2zm4 0h14v2H7v-2zm-4 6h2v2H3v-2zm4 0h14v2H7v-2z"/></svg>',
        "user-plus": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 8c3.3 0 7 1.6 7 4.5V20H3v-1.5C3 15.6 6.7 14 10 14zm0 2c-2.5 0-4.6 1-4.9 2h9.8c-.3-1-2.4-2-4.9-2zM19 8h2v2h2v2h-2v2h-2v-2h-2v-2h2V8z"/></svg>',
        briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h4a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 2v2h4V5h-4zM5 9v4h14V9H5zm0 6v3h14v-3h-6v1h-2v-1H5z"/></svg>',
        building: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4h2a2 2 0 0 1 2 2v10h1v2H2v-2h2zm2 0h4v-3h2v3h2V5H6v16zm10 0h2V11h-2v10zM8 7h2v2H8V7zm0 4h2v2H8v-2zm4-4h2v2h-2V7zm0 4h2v2h-2v-2z"/></svg>',
        users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7.5-1a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM9 13c3.3 0 6 1.8 6 4.5V20H3v-2.5C3 14.8 5.7 13 9 13zm0 2c-2.2 0-4 1-4 2.5v.5h8v-.5c0-1.5-1.8-2.5-4-2.5zm8 0c2.4.2 4 1.4 4 3v2h-4v-2c0-1.1-.4-2.1-1.2-2.9.4-.1.8-.1 1.2-.1z"/></svg>'
      };
      const chevron = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.3 6.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 0-1.4z"/></svg>';
      const group = document.createElement("div");
      group.className = "ai-role-cards";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Choose what brings you here");
      for (const card of cards) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-role-card";
        button.innerHTML = `
        <span class="ai-role-card-icon">${icons[card.icon] || icons.briefcase}</span>
        <span class="ai-role-card-text">
          <span class="ai-role-card-title">${escapeHtml(card.title)}</span>
          ${card.subtitle ? `<span class="ai-role-card-subtitle">${escapeHtml(card.subtitle)}</span>` : ""}
        </span>
        <span class="ai-role-card-chevron">${chevron}</span>
      `;
        button.addEventListener("click", () => {
          this._clearRoleCards();
          this._clearQuickReplies();
          if (typeof card.onSelect === "function") card.onSelect();
          else void this.sendMessage(card.prompt);
        });
        group.appendChild(button);
      }
      row.appendChild(group);
      this._scrollToBottom();
    }
    _clearRoleCards() {
      this.messagesList?.querySelectorAll(".ai-role-cards").forEach((el) => el.remove());
    }
    _renderQuickReplies(row, replies) {
      if (!row) return;
      const container = document.createElement("div");
      container.className = "ai-quick-replies";
      container.setAttribute("role", "group");
      container.setAttribute("aria-label", "Suggested replies");
      for (const reply of replies) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-quick-reply";
        button.textContent = reply;
        button.addEventListener("click", () => {
          this._clearQuickReplies();
          void this.sendMessage(reply);
        });
        container.appendChild(button);
      }
      row.appendChild(container);
      this._scrollToBottom();
    }
    _clearQuickReplies() {
      this.messagesList?.querySelectorAll(".ai-quick-replies").forEach((el) => el.remove());
    }
    /** Website bot: re-engage a quiet visitor a few seconds after the assistant speaks. */
    _setupIdleNudges() {
      const config = this.options?.behavior?.idleNudge;
      const surface = this.options?.surface;
      if (surface !== "website" && surface !== "app" || !config?.enabled) return;
      this._nudgeUsed = new Set(this.messages.filter((m) => m.local).map((m) => m.content));
      const activeSignupStates = /* @__PURE__ */ new Set(["idle", "completed", "cancelled", "error"]);
      this._idleNudge = new IdleNudgeController({
        delayMs: config.delayMs,
        maxConsecutive: config.maxConsecutive,
        pickNudge: (stage) => pickIdleNudge(config, stage, this._nudgeUsed, this._userRole || null),
        post: (nudge) => {
          this._postLocalAssistantMessage(nudge.text, nudge.quickReplies, { nudge: true });
          this.events.emit("idle-nudge:shown", { text: nudge.text });
        },
        isPaused: () => typeof document !== "undefined" && document.visibilityState === "hidden",
        canNudge: () => this.isOpen && !this.isGenerating && !this.textarea?.value?.trim() && activeSignupStates.has(this.hirePoolSignup?.state || "idle")
      });
      this.textarea?.addEventListener("input", () => this._idleNudge?.onUserActivity());
      this._idleNudgeUnsubscribes = [
        this.events.on("message:sent", () => {
          this._clearQuickReplies();
          this._clearRoleCards();
          this._idleNudge?.onUserMessage();
        }),
        this.events.on("message:received", (message) => {
          this._stampLatestReply();
          if (surface === "website") {
            if (!message?.action && /Shall I create one for you now\?/i.test(String(message?.content || ""))) {
              const rows = this.messagesList?.querySelectorAll(".ai-message-row.assistant");
              const last = rows?.[rows.length - 1];
              if (last) {
                this._clearQuickReplies();
                this._renderQuickReplies(last, ["Sign me up", "Not now"]);
              }
            }
          }
          if (message?.action) {
            this._idleNudge?.onUserActivity();
          } else {
            const asked = /\?\s*\**\s*$/.test(String(message?.content || "").trim());
            this._idleNudge?.onAssistantMessage(asked ? "question" : "answer");
          }
        }),
        this.events.on("close", () => this._idleNudge?.onUserActivity()),
        // "New chat" starts the welcome and follow-ups from the beginning.
        this.events.on("conversation:cleared", () => {
          this._nudgeUsed = /* @__PURE__ */ new Set();
          this._visitorSignupRole = null;
          this._idleNudge?.onUserMessage();
          if (this.isOpen) {
            this._maybeShowWebsiteWelcome();
            this._persistState();
          }
          if (this.options?.surface === "app" && this._appWelcome) {
            this.showAppWelcome(this._appWelcome);
          }
        })
      ];
    }
    _setupAutoOpen() {
      const config = this.options?.behavior?.autoOpen;
      if (this.options?.surface !== "website" || !config?.enabled || typeof window === "undefined") return;
      this._autoOpenController = new AutoOpenController({
        config,
        win: window,
        isOpen: () => this.isOpen,
        hasConversation: () => this.messages.length > 0,
        openPanel: () => this.open({ focus: false, source: "auto" }),
        showTeaser: (text) => this._showTeaser(text)
      });
      this._autoOpenController.start();
    }
    /**
     * In-app bot: ask about one missing profile detail. Shown at most once per
     * browser session; "Later" hides it for 7 days for this user.
     */
    /**
     * In-app bot: list the missing profile fields and offer to complete them now.
     * Shown once per login session (and again after each save while fields are
     * still missing). "Later" hides it for a day.
     * @returns {boolean} whether the card was shown
     */
    showProfileNudge(nudge, userId, { force = false, continuing = false } = {}) {
      if (!nudge?.text || !this.messagesList) return false;
      const key = `hirepool-assistant:profile-nudge:${String(userId || "user").slice(0, 80)}`;
      const now = Date.now();
      if (!force) {
        try {
          if (sessionStorage.getItem(key) === "shown") return false;
          if (Number(localStorage.getItem(`${key}:snoozed-until`) || 0) > now) return false;
          sessionStorage.setItem(key, "shown");
        } catch {
          if (this._profileNudgeShown) return false;
        }
      }
      this._profileNudgeShown = true;
      this.messagesList.querySelectorAll(".ai-nudge-row").forEach((el) => el.remove());
      const row = document.createElement("div");
      row.className = "ai-message-row assistant ai-nudge-row";
      const bubble = document.createElement("div");
      bubble.className = "ai-bubble ai-nudge";
      const text = continuing ? `Saved \u2705 ${nudge.text}` : nudge.text;
      bubble.innerHTML = `
      <div class="ai-nudge-text">${parseMarkdown(text)}</div>
      <div class="ai-action-controls">
        <button type="button" class="ai-btn-action-confirm ai-nudge-accept">${continuing ? "Continue" : "Complete my profile"}</button>
        <button type="button" class="ai-btn-action-cancel ai-nudge-later">Later</button>
      </div>
    `;
      const remove = () => row.parentNode && row.parentNode.removeChild(row);
      bubble.querySelector(".ai-nudge-accept").addEventListener("click", () => {
        remove();
        this.events.emit("profile-nudge:accepted", { field: nudge.field });
        if (this._profileFormHandlers) {
          void this.showProfileForm("missing");
        } else {
          void this.sendMessage(nudge.acceptPrompt || "Update my profile");
        }
      });
      bubble.querySelector(".ai-nudge-later").addEventListener("click", () => {
        remove();
        try {
          localStorage.setItem(`${key}:snoozed-until`, String(Date.now() + 3 * 24 * 60 * 60 * 1e3));
        } catch {
        }
        this.events.emit("profile-nudge:snoozed", { field: nudge.field });
      });
      row.appendChild(bubble);
      this.messagesList.appendChild(row);
      this._scrollToBottom();
      this.events.emit("profile-nudge:shown", { field: nudge.field, missing: nudge.missing || [] });
      return true;
    }
    /**
     * Dashboard: show the personal welcome as an interactive chat message —
     * a short hello, role task cards, quick buttons, and profile progress with a
     * "Complete now" button while the profile is incomplete.
     * Only when no conversation is under way. Returns whether it was shown.
     */
    showAppWelcome(welcome) {
      if (!welcome || !this.messagesList || this.options?.surface !== "app") return false;
      this._appWelcome = welcome;
      this.container?.classList.add("ai-chat-welcome");
      if (this.messages.length > 0) {
        this.updateProfileProgress(welcome.profileProgress || null);
        return false;
      }
      const text = [
        `**${welcome.salutation || "Hi! \u{1F44B}"}**`,
        welcome.question || "What would you like to do today?"
      ].join("\n");
      this._postLocalAssistantMessage(text, Array.isArray(welcome.quickReplies) ? welcome.quickReplies : [], {
        roleCards: Array.isArray(welcome.actions) ? welcome.actions : []
      });
      this.messages[this.messages.length - 1].appWelcome = true;
      if (this.messagesList.lastElementChild) this.messagesList.lastElementChild.dataset.appWelcome = "1";
      if (welcome.profileProgress) this.messages[this.messages.length - 1].profileProgress = welcome.profileProgress;
      if (welcome.profileProgress) this._renderProfileProgress(this.messagesList.lastElementChild, welcome.profileProgress);
      this.container?.classList.add("ai-chat-welcome");
      this._persistState();
      return true;
    }
    /**
     * Dashboard: refresh (or remove, once complete) the progress card in the
     * welcome so it never shows an old percentage.
     */
    updateProfileProgress(progress) {
      const index = this.messages.findIndex((m) => m.appWelcome);
      if (index < 0) return;
      const message = this.messages[index];
      if (progress) message.profileProgress = progress;
      else delete message.profileProgress;
      const row = this.messagesList?.querySelector('[data-app-welcome="1"]');
      if (row) {
        if (progress) this._renderProfileProgress(row, progress);
        else row.querySelector(".ai-profile-progress")?.remove();
      }
      if (this._appWelcome) this._appWelcome = { ...this._appWelcome, profileProgress: progress || null };
      this._persistState();
    }
    _renderProfileProgress(row, progress) {
      if (!row || !progress) return;
      row.querySelector(".ai-profile-progress")?.remove();
      const pct = Number.isFinite(progress.completion) ? Math.max(0, Math.min(100, progress.completion)) : null;
      const card = document.createElement("div");
      card.className = "ai-profile-progress";
      const missing = Array.isArray(progress.missing) ? progress.missing : [];
      card.innerHTML = `
      <div class="ai-pp-top">
        <span class="ai-pp-title">Your ${escapeHtml(progress.profileWord || "profile")} is ${pct !== null ? `<strong>${pct}%</strong> complete` : "not complete yet"}</span>
        <span class="ai-pp-count">${progress.remaining} missing</span>
      </div>
      ${pct !== null ? `<div class="ai-pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>` : ""}
      ${missing.length ? `<div class="ai-pp-missing">Missing: ${escapeHtml(missing.join(", "))}${progress.remaining > missing.length ? "\u2026" : ""}</div>` : ""}
      <button type="button" class="ai-pp-btn">Complete now</button>
    `;
      card.querySelector(".ai-pp-btn").addEventListener("click", () => {
        this.events.emit("profile-nudge:accepted", { source: "welcome" });
        if (this._profileFormHandlers) {
          void this.showProfileForm("missing");
        } else {
          void this.sendMessage("Update my profile");
        }
      });
      const bubble = row.querySelector(":scope > .ai-bubble");
      const meta = row.querySelector(":scope > .ai-msg-meta");
      (meta || bubble)?.insertAdjacentElement("afterend", card);
    }
    /** In-app bot: how to load and save the profile form (set by the SDK). */
    setProfileFormHandlers(handlers) {
      this._profileFormHandlers = handlers && typeof handlers.load === "function" && typeof handlers.save === "function" ? handlers : null;
    }
    /**
     * In-app bot: a fill-in form for the user's profile.
     * mode 'missing' shows only empty fields; 'all' shows everything to edit.
     * `overrides` pre-fill values (e.g. from a review card being edited).
     */
    async showProfileForm(mode = "all", { overrides = null, fillEmptyOnly = false, sourceLabel = null } = {}) {
      if (!this._profileFormHandlers || !this.messagesList) return false;
      if (!this.isOpen) this.open({ focus: false });
      this.messagesList.querySelectorAll(".ai-profile-form-row, .ai-nudge-row").forEach((el) => el.remove());
      this._clearQuickReplies();
      const row = document.createElement("div");
      row.className = "ai-message-row assistant ai-signup-row ai-profile-form-row";
      const bubble = document.createElement("div");
      bubble.className = "ai-bubble ai-profile-form-card";
      bubble.innerHTML = '<div class="ai-profile-form-loading">Loading your profile\u2026</div>';
      row.appendChild(bubble);
      this.messagesList.appendChild(row);
      this._scrollToBottom();
      let form;
      try {
        form = await this._profileFormHandlers.load(mode);
      } catch (error) {
        bubble.innerHTML = `<div class="ai-profile-form-error">${escapeHtml(error?.message || "I couldn't load your profile just now. Please try again in a moment.")}</div>`;
        return false;
      }
      if (!form || !Array.isArray(form.fields)) {
        bubble.innerHTML = `<div class="ai-profile-form-error">I couldn't load your profile just now. Please try again in a moment.</div>`;
        return false;
      }
      if (mode === "missing" && form.fields.length === 0 && !(form.chatSections || []).length) {
        row.remove();
        this.updateProfileProgress(null);
        this.postAssistantNote?.("\u{1F389} Your profile is already complete. Say **edit my profile** any time to change something.");
        return true;
      }
      this._renderProfileForm(bubble, form, overrides || {}, { fillEmptyOnly, sourceLabel });
      this.events.emit("profile-form:shown", { mode, fields: form.fields.map((f) => f.key) });
      return true;
    }
    _renderProfileForm(bubble, form, overrides, { fillEmptyOnly = false, sourceLabel = null } = {}) {
      const fieldId = (key) => `ai-pf-${key}`;
      const isEmpty = (value) => value === null || value === void 0 || value === "" || Array.isArray(value) && value.length === 0;
      const display = (value) => Array.isArray(value) ? value.join(", ") : String(value ?? "");
      const usesOverride = (field) => Object.hasOwn(overrides, field.key) && !isEmpty(overrides[field.key]) && (!fillEmptyOnly || isEmpty(field.value));
      const differs = (field) => fillEmptyOnly && Object.hasOwn(overrides, field.key) && !isEmpty(overrides[field.key]) && !isEmpty(field.value) && display(overrides[field.key]).toLowerCase() !== display(field.value).toLowerCase();
      const valueOf = (field) => usesOverride(field) ? overrides[field.key] : field.value;
      const controlHtml = (field) => {
        const value = valueOf(field);
        const common = `id="${fieldId(field.key)}" name="${escapeHtml(field.key)}" class="ai-form-input"`;
        const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
        switch (field.type) {
          case "textarea":
            return `<textarea ${common} rows="3"${placeholder}>${escapeHtml(String(value ?? ""))}</textarea>`;
          case "select":
            return `<select ${common}><option value="">Choose\u2026</option>${(field.options || []).map((o) => `<option value="${escapeHtml(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>`;
          case "multiselect": {
            const selected = new Set(Array.isArray(value) ? value : []);
            return `<div class="ai-pf-chips" role="group" aria-label="${escapeHtml(field.label)}">${(field.options || []).map((o) => `
            <label class="ai-pf-chip"><input type="checkbox" name="${escapeHtml(field.key)}" value="${escapeHtml(o.value)}"${selected.has(o.value) ? " checked" : ""}><span>${escapeHtml(o.label)}</span></label>`).join("")}</div>`;
          }
          case "tags":
            return `<input type="text" ${common}${placeholder} value="${escapeHtml(Array.isArray(value) ? value.join(", ") : String(value ?? ""))}">`;
          case "number":
            return `<input type="number" inputmode="numeric" ${common}${placeholder}${field.min !== void 0 ? ` min="${field.min}"` : ""}${field.max !== void 0 ? ` max="${field.max}"` : ""} value="${value === null || value === void 0 ? "" : escapeHtml(String(value))}">`;
          default:
            return `<input type="${field.type === "tel" ? "tel" : field.type === "url" ? "url" : "text"}" ${common}${placeholder} value="${escapeHtml(String(value ?? ""))}">`;
        }
      };
      const chatSections = form.chatSections || [];
      bubble.innerHTML = `
      <form class="ai-profile-form" novalidate>
        <div class="ai-pf-head">
          <div class="ai-pf-title">${escapeHtml(form.title || "Your profile")}</div>
          <div class="ai-pf-subtitle">${escapeHtml(form.subtitle || "")}${Number.isFinite(form.completion) ? ` <span class="ai-pf-progress">${form.completion}% complete</span>` : ""}</div>
        </div>
        ${form.fields.map((field) => `
          <div class="ai-pf-field${field.missing ? " is-missing" : ""}" data-key="${escapeHtml(field.key)}">
            <label class="ai-pf-label" for="${fieldId(field.key)}">${escapeHtml(field.label)}${usesOverride(field) && sourceLabel ? ` <span class="ai-pf-source">${escapeHtml(sourceLabel)}</span>` : field.missing ? ' <span class="ai-pf-missing">Missing</span>' : ""}</label>
            ${controlHtml(field)}
            ${differs(field) ? `<div class="ai-pf-hint ai-pf-diff">Resume says: <strong>${escapeHtml(display(overrides[field.key]).slice(0, 120))}</strong> <button type="button" class="ai-pf-use" data-key="${escapeHtml(field.key)}">Use this</button></div>` : ""}
            ${field.hint ? `<div class="ai-pf-hint">${escapeHtml(field.hint)}</div>` : ""}
            <div class="ai-pf-error" role="alert"></div>
          </div>`).join("")}
        ${chatSections.length ? `
          <div class="ai-pf-chat-sections">
            <div class="ai-pf-hint">These need a few details each, so we'll add them together in chat:</div>
            ${chatSections.map((s) => `<button type="button" class="ai-pf-chat-btn" data-prompt="${escapeHtml(s.prompt)}">${escapeHtml(s.missing ? `Add ${s.label.toLowerCase()}` : `Edit ${s.label.toLowerCase()}`)}</button>`).join("")}
          </div>` : ""}
        <div class="ai-pf-form-error" role="alert"></div>
        <div class="ai-pf-actions">
          <button type="submit" class="ai-btn-action-confirm ai-pf-save">Save</button>
          <button type="button" class="ai-btn-action-cancel ai-pf-cancel">Cancel</button>
        </div>
      </form>
    `;
      const formEl = bubble.querySelector("form");
      const saveBtn = bubble.querySelector(".ai-pf-save");
      const formError = bubble.querySelector(".ai-pf-form-error");
      const row = bubble.closest(".ai-message-row");
      bubble.querySelectorAll(".ai-pf-use").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.key;
          const field = form.fields.find((f) => f.key === key);
          const value = overrides[key];
          if (!field) return;
          if (field.type === "multiselect") {
            const wanted = new Set(Array.isArray(value) ? value : []);
            formEl.querySelectorAll(`input[name="${CSS.escape(key)}"]`).forEach((input) => {
              input.checked = wanted.has(input.value);
            });
          } else {
            const el = formEl.querySelector(`#${CSS.escape(fieldId(key))}`);
            if (el) el.value = Array.isArray(value) ? value.join(", ") : String(value);
          }
          button.closest(".ai-pf-diff")?.remove();
        });
      });
      bubble.querySelectorAll(".ai-pf-chat-btn").forEach((button) => {
        button.addEventListener("click", () => {
          row?.remove();
          void this.sendMessage(button.dataset.prompt);
        });
      });
      bubble.querySelector(".ai-pf-cancel").addEventListener("click", () => {
        row?.remove();
        this.events.emit("profile-form:cancelled");
      });
      formEl.addEventListener("input", (event) => {
        const wrap = event.target.closest?.(".ai-pf-field");
        if (wrap) {
          wrap.classList.remove("has-error");
          wrap.querySelector(".ai-pf-error").textContent = "";
        }
      });
      formEl.addEventListener("submit", async (event) => {
        event.preventDefault();
        const values = {};
        for (const field of form.fields) {
          if (field.type === "multiselect") {
            values[field.key] = [...formEl.querySelectorAll(`input[name="${CSS.escape(field.key)}"]:checked`)].map((i) => i.value);
          } else {
            const el = formEl.querySelector(`#${CSS.escape(fieldId(field.key))}`);
            values[field.key] = el ? el.value : "";
          }
        }
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving\u2026";
        formError.textContent = "";
        bubble.querySelectorAll(".ai-pf-field.has-error").forEach((el) => {
          el.classList.remove("has-error");
          el.querySelector(".ai-pf-error").textContent = "";
        });
        try {
          const result = await this._profileFormHandlers.save(values);
          if (!result?.saved) {
            formError.textContent = result?.message || "Nothing changed, so there was nothing to save.";
            saveBtn.disabled = false;
            saveBtn.textContent = "Save";
            return;
          }
          row?.remove();
          const savedList = (result.changed || []).slice(0, 6).join(", ");
          const progress = Number.isFinite(result.completion) ? ` Your profile is now **${result.completion}% complete**.` : "";
          const note = result.partial && result.message ? `

${result.message}` : "";
          const rest = result.missingCount > 0 ? `

${result.missingCount} detail${result.missingCount === 1 ? "" : "s"} still missing. Say **complete my profile** whenever you have a moment.` : "\n\n\u{1F389} Your profile is complete. Nice work!";
          this.postAssistantNote?.(`\u2705 Saved${savedList ? `: ${savedList}` : ""}.${progress}${note}${rest}`);
          if (result.missingCount === 0) this.updateProfileProgress(null);
          this.events.emit("profile-form:saved", { changed: result.changed || [], missingCount: result.missingCount ?? null });
        } catch (error) {
          const fields = error?.fields && typeof error.fields === "object" ? error.fields : null;
          let shownInline = false;
          if (fields) {
            for (const [key, message] of Object.entries(fields)) {
              const wrap = bubble.querySelector(`.ai-pf-field[data-key="${CSS.escape(key)}"]`);
              if (wrap) {
                wrap.classList.add("has-error");
                wrap.querySelector(".ai-pf-error").textContent = String(message);
                shownInline = true;
              }
            }
            bubble.querySelector(".ai-pf-field.has-error")?.scrollIntoView?.({ block: "center", behavior: "smooth" });
          }
          formError.textContent = shownInline ? "Please fix the highlighted fields." : error?.message || "I couldn't save your profile just now. Please try again.";
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
        }
      });
      this._scrollToBottom();
    }
    /**
     * Dashboard: open the assistant after the user has spent `delayMs` on the
     * page (visible time only; waits while they type; a bubble on phones).
     * Skipped if the chat is already open or a conversation is under way.
     * @param {object} config { delayMs, mobile, teaser, snoozeHours }
     * @param {{ isBlocked?: () => boolean, onOpen?: (how: 'panel'|'teaser') => void }} [hooks]
     */
    scheduleAutoOpen(config, { isBlocked, onOpen } = {}) {
      if (typeof window === "undefined") return false;
      this._autoOpenController?.stop();
      this._autoOpenController = new AutoOpenController({
        config: { ...config, enabled: true, excludedPaths: [] },
        win: window,
        isOpen: () => this.isOpen,
        // The widget's own welcome does not count as a conversation.
        hasConversation: () => this.messages.some((m) => m.role === "user"),
        openPanel: () => {
          if (isBlocked?.()) return;
          this.open({ focus: false, source: "auto" });
          onOpen?.("panel");
        },
        showTeaser: (text) => {
          if (isBlocked?.()) return;
          this._showTeaser(text);
          onOpen?.("teaser");
        }
      });
      return this._autoOpenController.start();
    }
    /** Dashboard: the signed-in user's role, used to pick role-specific follow-ups. */
    setUserRole(role) {
      this._userRole = ["candidate", "client", "consultancy"].includes(role) ? role : null;
      if (this.options?.surface === "app" && this.attachBtn && this.fileInput) {
        this.attachBtn.disabled = false;
        this.fileInput.multiple = this._userRole === "consultancy";
        this.fileInput.accept = ".pdf,.docx,.txt";
        this.attachBtn.title = {
          candidate: "Upload your resume (PDF, DOCX, TXT)",
          client: "Upload a job description (PDF, DOCX, TXT)",
          consultancy: "Upload candidate resumes, one or several (PDF, DOCX, TXT)"
        }[this._userRole] || "Upload a document";
        this.attachBtn.setAttribute("aria-label", this.attachBtn.title);
      }
    }
    /** A short assistant message from the widget itself (not sent to the server). */
    postAssistantNote(text) {
      if (!text || !this.messagesList) return;
      this._renderMessageBubble("assistant", text, true);
      this.messages.push({ role: "assistant", content: text, local: true });
      this._persistState();
    }
    _showTeaser(text) {
      if (this.isOpen || !this.container) return;
      this._hideTeaser();
      const teaser = document.createElement("div");
      teaser.className = "ai-teaser";
      teaser.setAttribute("role", "status");
      teaser.setAttribute("aria-live", "polite");
      teaser.innerHTML = `
      <button type="button" class="ai-teaser-text">${escapeHtml(text)}</button>
      <button type="button" class="ai-teaser-close" aria-label="Dismiss greeting">${ICONS.launcherClose}</button>
    `;
      teaser.querySelector(".ai-teaser-text").addEventListener("click", () => {
        this.open({ source: "teaser" });
      });
      teaser.querySelector(".ai-teaser-close").addEventListener("click", () => {
        this._hideTeaser();
        this._autoOpenController?.snooze();
        this.events.emit("teaser:dismissed");
      });
      this.container.appendChild(teaser);
      this._teaser = teaser;
      this.events.emit("teaser:shown");
    }
    _hideTeaser() {
      if (this._teaser?.parentNode) this._teaser.parentNode.removeChild(this._teaser);
      this._teaser = null;
    }
    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }
    setTheme(theme) {
      if (["light", "dark", "auto"].includes(theme)) {
        this.container.setAttribute("data-theme", theme);
        this.options.theme = theme;
      }
    }
    setPosition(pos) {
      ["bottom-right", "bottom-left", "top-right", "top-left"].forEach((p) => {
        this.container.classList.remove(`pos-${p}`);
      });
      this.container.classList.add(`pos-${pos}`);
      this.options.position = pos;
    }
    setContext(context, override = true) {
      this.options.context = context;
      this.contextOverrideSet = override;
    }
    setGreeting(greeting, suggestedPrompts = []) {
      const welcome = this.panel?.querySelector(".ai-welcome-box");
      const greetingElement = welcome?.querySelector(".ai-welcome-greeting");
      if (!welcome || !greetingElement) return;
      greetingElement.innerHTML = parseMarkdown(String(greeting || ""));
      this.options.greeting = greeting;
      this.options.suggestedPrompts = suggestedPrompts;
      let promptSection = welcome.querySelector(".ai-suggested-prompts");
      if (!suggestedPrompts.length) {
        promptSection?.remove();
        return;
      }
      if (!promptSection) {
        promptSection = document.createElement("div");
        promptSection.className = "ai-suggested-prompts";
        promptSection.innerHTML = '<div class="ai-suggested-prompts-label">Suggested Prompts</div><div class="ai-prompts-list"></div>';
        greetingElement.insertAdjacentElement("afterend", promptSection);
      }
      const promptList = promptSection.querySelector(".ai-prompts-list");
      promptList.replaceChildren(...suggestedPrompts.map((prompt) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-prompt-pill";
        button.textContent = prompt;
        button.addEventListener("click", () => this.sendMessage(prompt));
        return button;
      }));
    }
    async newConversation() {
      if (this.hirePoolResume.state === HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION) {
        if (!await this.hirePoolResume.cancel()) return false;
      } else if (this.hirePoolResume.state === HIREPOOL_RESUME_STATES.PREPARING || this.hirePoolResume.state === HIREPOOL_RESUME_STATES.UPLOADING) {
        this._renderHirePoolResumeError("Wait for the current resume operation to finish before starting a new chat.");
        return false;
      }
      this.cancelGeneration();
      this.cancelDocumentUpload();
      this._stopVerificationWatcher();
      if (this.activeConversationId) {
        try {
          await this.apiClient.clearSession(this.activeConversationId);
        } catch (err) {
          this._renderErrorBanner(`Could not clear the previous conversation: ${err.message}`);
          this.events.emit("error", err);
          return false;
        }
      }
      this.activeConversationId = null;
      this.messages = [];
      this.messagesList.innerHTML = "";
      this.hirePoolResume.reset();
      if (this.hirePoolSignup && this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.IDLE) {
        await this.hirePoolSignup.cancel();
      }
      this.storage.clear();
      this._persistState();
      this._setGenerating(false);
      this.events.emit("conversation:cleared");
      this.textarea.focus();
      return true;
    }
    clearLocalConversation() {
      this.cancelGeneration();
      this.cancelDocumentUpload();
      this._stopVerificationWatcher();
      this.hirePoolResume.reset();
      if (this.hirePoolSignup && this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.IDLE) {
        void this.hirePoolSignup.cancel();
      }
      this.activeConversationId = null;
      this.messages = [];
      if (this.messagesList) {
        this.messagesList.innerHTML = "";
      }
      this._resetHirePoolIntegrationToGuest();
      this.setHostIdentity(null, "guest");
      if (typeof this.storage.setUser === "function") {
        this.storage.setUser(null);
      }
      this.storage.remove("hirepool_session");
      this.storage.clear();
      this.setGreeting(this._initialGreeting || "", this._initialSuggestedPrompts || []);
      this._persistState();
      this._setGenerating(false);
      this.events.emit("conversation:cleared");
    }
    cancelGeneration() {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      this._setGenerating(false);
    }
    _setGenerating(generating) {
      this.isGenerating = generating;
      if (generating) {
        this.statusDot.classList.add("busy");
        this.statusText.textContent = "Thinking...";
        this.sendBtn.style.display = "none";
        this.stopBtn.style.display = "flex";
        this.streamingIndicator.style.display = "flex";
      } else {
        this.statusDot.classList.remove("busy");
        this.statusText.textContent = "Online";
        this.sendBtn.style.display = "flex";
        this.stopBtn.style.display = "none";
        this.streamingIndicator.style.display = "none";
        this.sendBtn.disabled = !this.textarea.value.trim();
      }
    }
    _scrollToBottom() {
      this.body.scrollTop = this.body.scrollHeight;
    }
    _stripActionBlocks(text) {
      if (!text || typeof text !== "string") return "";
      return text.replace(/```(?:action:[a-zA-Z0-9_-]+|action)\s*\n[\s\S]*?\n```/gi, "").replace(/\n{3,}/g, "\n\n").trim();
    }
    _syncMessageActionState(action) {
      if (!action || !Array.isArray(this.messages)) return;
      for (const msg of this.messages) {
        if (msg?.action && (msg.action === action || action.id && msg.action.id === action.id)) {
          msg.action._status = action._status;
          msg.action._statusMessage = action._statusMessage;
        }
      }
      this._persistState();
    }
    _extractAction(text, actionProp) {
      if (actionProp && typeof actionProp === "object") {
        return actionProp;
      }
      if (!text || typeof text !== "string") return null;
      const match = text.match(/```(?:action:[a-zA-Z0-9_-]+|action)\s*\n([\s\S]*?)\n```/i);
      if (!match) return null;
      try {
        const data = JSON.parse(match[1].trim());
        if (data && data.action && data.title) {
          if (this.options?.assistantId === "hirepool") {
            const hasToken = typeof data.confirmationToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(data.confirmationToken);
            if (!hasToken) {
              return null;
            }
          }
          return data;
        }
      } catch {
      }
      return null;
    }
    _renderActionCard(bubble, action) {
      if (!action || !action.action) return;
      if (this.options?.assistantId === "hirepool" && action.requiresConfirmation === false && action.action !== "hirepool_login" && action.action !== "hirepool_signup") {
        return;
      }
      if (typeof this.options.hasActionHandler !== "function" || !this.options.hasActionHandler(action)) return;
      const actionId = action.id || action.action;
      if (bubble.querySelector(`[data-action-id="${escapeHtml(actionId)}"]`)) {
        return;
      }
      if (action.action === "hirepool_login") {
        return this._renderHirePoolLoginCard(bubble, action);
      }
      const card = document.createElement("div");
      card.className = "ai-action-card";
      card.setAttribute("data-action-id", actionId);
      card.setAttribute("data-action-type", action.action);
      this.events.emit("action:proposed", action);
      const risk = ["read", "write", "destructive"].includes(action.risk) ? action.risk : "write";
      const requiresAcknowledgement = risk === "destructive";
      const isHirePoolAccountAction = ["hirepool_login", "hirepool_signup"].includes(action.action);
      const accountButtonLabel = action.action === "hirepool_signup" ? "Sign up for HirePool" : "Log in to HirePool";
      const badgeLabel = isHirePoolAccountAction ? "HirePool account" : action.formattedReview ? "Review & Confirm" : "Application action";
      let detailsHtml = "";
      const hasReview = Boolean(action.formattedReview && typeof action.formattedReview === "object");
      if (hasReview) {
        const review = action.formattedReview;
        let rowsHtml = "";
        if (Array.isArray(review.fields)) {
          rowsHtml = `
          <table class="ai-review-table">
            <tbody>
              ${review.fields.map((f) => `
                <tr>
                  <th class="ai-review-key">${escapeHtml(f.label)}</th>
                  <td class="ai-review-val">${escapeHtml(f.value)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
        }
        let skillsHtml = "";
        if (Array.isArray(review.requiredSkills) && review.requiredSkills.length > 0) {
          skillsHtml += `
          <div class="ai-review-section">
            <div class="ai-review-section-title">Required Skills</div>
            <div class="ai-review-tags">
              ${review.requiredSkills.map((s) => `<span class="ai-review-tag">${escapeHtml(s)}</span>`).join("")}
            </div>
          </div>
        `;
        }
        if (Array.isArray(review.preferredSkills) && review.preferredSkills.length > 0) {
          skillsHtml += `
          <div class="ai-review-section">
            <div class="ai-review-section-title">Preferred Skills</div>
            <div class="ai-review-tags">
              ${review.preferredSkills.map((s) => `<span class="ai-review-tag preferred">${escapeHtml(s)}</span>`).join("")}
            </div>
          </div>
        `;
        }
        let descHtml = "";
        if (review.description && typeof review.description === "string" && review.description.trim()) {
          descHtml = `
          <div class="ai-review-section">
            <div class="ai-review-section-title">Job Description</div>
            <div class="ai-review-desc">${escapeHtml(review.description.trim())}</div>
          </div>
        `;
        }
        detailsHtml = `
        <div class="ai-review-card-content">
          ${rowsHtml}
          ${skillsHtml}
          ${descHtml}
        </div>
      `;
      } else {
        const params = action.parameters?.body || action.parameters || {};
        let paramRowsHtml = "";
        for (const [key, val] of Object.entries(params)) {
          if (key === "continuationReference" || key === "confirmationToken" || val === void 0 || val === null || val === "") continue;
          const formattedKey = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
          let formattedVal = "";
          if (typeof val === "object") {
            if (Array.isArray(val)) {
              formattedVal = val.join(", ");
            } else {
              formattedVal = Object.entries(val).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("; ");
            }
          } else {
            formattedVal = String(val);
          }
          paramRowsHtml += `
          <div class="ai-action-param-row">
            <span class="ai-action-param-key">${escapeHtml(formattedKey)}:</span>
            <span class="ai-action-param-val">${escapeHtml(formattedVal)}</span>
          </div>
        `;
        }
        if (paramRowsHtml) {
          detailsHtml = `<div class="ai-action-details">${paramRowsHtml}</div>`;
        }
      }
      let explanationText = String(action.explanation || "");
      if (detailsHtml) {
        explanationText = explanationText.split("\n").filter((line) => !/^\s*[-*]\s+\*\*/.test(line)).join("\n").replace(/\s-\s+\*\*[\s\S]*?(?=(?:Choose|Click|Press|Reply)\b|$)/, " ").replace(/\n{3,}/g, "\n\n").trim();
      }
      const explanationHtml = explanationText ? parseMarkdown(explanationText) : "";
      const titleText = action.formattedReview?.title || action.title || "Review Action";
      const confirmBtnLabel = action.formattedReview?.type === "job_creation" ? "Confirm &amp; Create" : isHirePoolAccountAction ? accountButtonLabel : "Confirm &amp; Execute";
      card.innerHTML = `
      <div class="ai-action-header">
        <span class="ai-action-badge">${badgeLabel}</span>
        <span class="ai-action-risk risk-${risk}">${risk === "destructive" ? "Destructive" : risk === "read" ? "Read" : "Write"}</span>
        <span class="ai-action-title">${escapeHtml(titleText)}</span>
      </div>
      ${explanationHtml ? `<div class="ai-action-explanation">${explanationHtml}</div>` : ""}
      ${detailsHtml}
      ${requiresAcknowledgement ? `
        <label class="ai-action-acknowledgement">
          <input type="checkbox" class="ai-action-acknowledge">
          I understand this action may be difficult to undo.
        </label>
      ` : ""}
      <div class="ai-action-status-msg" style="display: none;"></div>
      <div class="ai-action-controls">
        <button type="button" class="ai-btn-action-confirm" ${requiresAcknowledgement ? "disabled" : ""}>${confirmBtnLabel}</button>
        ${hasReview ? '<button type="button" class="ai-btn-action-edit">Edit details</button>' : ""}
        <button type="button" class="ai-btn-action-cancel">${isHirePoolAccountAction ? "Not now" : "Cancel"}</button>
      </div>
    `;
      const btnConfirm = card.querySelector(".ai-btn-action-confirm");
      const btnCancel = card.querySelector(".ai-btn-action-cancel");
      const btnEdit = card.querySelector(".ai-btn-action-edit");
      const statusMsg = card.querySelector(".ai-action-status-msg");
      const controls = card.querySelector(".ai-action-controls");
      const acknowledgement = card.querySelector(".ai-action-acknowledge");
      if (action._status && action._status !== "pending") {
        if (controls) controls.style.display = "none";
        if (acknowledgement) acknowledgement.disabled = true;
        btnConfirm.disabled = true;
        btnCancel.disabled = true;
        if (btnEdit) btnEdit.disabled = true;
        statusMsg.style.display = "flex";
        statusMsg.className = `ai-action-status-msg ${action._status === "completed" ? "success" : action._status}`;
        statusMsg.textContent = action._statusMessage || (action._status === "completed" ? "Action executed successfully!" : action._status === "cancelled" ? "Action cancelled." : "Action could not be completed.");
        bubble.appendChild(card);
        this._scrollToBottom();
        return;
      }
      if (btnEdit) {
        btnEdit.addEventListener("click", () => {
          const body = action.parameters?.body || action.arguments?.body || null;
          if (/profile_update$/.test(String(action.formattedReview?.type || "")) && this._profileFormHandlers) {
            btnCancel.click();
            statusMsg.textContent = "Editing in the form below.";
            action._statusMessage = "Editing in the form below.";
            void this.showProfileForm("all", { overrides: body && typeof body === "object" ? body : null });
            return;
          }
          if (body && typeof body === "object" && (body.first_name || body.email)) {
            const parts = [
              `Name: ${[body.first_name, body.last_name].filter(Boolean).join(" ")}`,
              `Email: ${body.email || ""}`,
              `Job title: ${body.job_title || ""}`,
              `Location: ${body.current_location || ""}`,
              `Experience: ${body.years_of_experience ?? body.experience_years ?? 0} years`,
              `Skills: ${Array.isArray(body.skills) ? body.skills.join(", ") : ""}`
            ];
            if (body.phone) parts.splice(2, 0, `Phone: ${body.phone}`);
            this.textarea.value = parts.join(", ");
            this.textarea.dispatchEvent(new Event("input"));
          }
          this.textarea.focus();
          this.textarea.placeholder = "Type changes to profile, job, or candidate details...";
          this._scrollToBottom();
        });
      }
      let executing = false;
      let timeoutId = null;
      acknowledgement?.addEventListener("change", () => {
        btnConfirm.disabled = !acknowledgement.checked;
      });
      btnConfirm.addEventListener("click", () => {
        if (executing || action._status && action._status !== "pending") return;
        if (action.action === "hirepool_signup") {
          card.remove();
          void this._startHirePoolSignup(action.parameters?.role || null);
          return;
        }
        executing = true;
        btnConfirm.disabled = true;
        btnCancel.disabled = true;
        statusMsg.style.display = "flex";
        statusMsg.className = "ai-action-status-msg executing";
        statusMsg.textContent = isHirePoolAccountAction ? "Opening HirePool login..." : "Executing action in the host application...";
        let handled = false;
        timeoutId = setTimeout(() => {
          if (!handled && executing) {
            executing = false;
            statusMsg.style.display = "flex";
            statusMsg.className = "ai-action-status-msg error";
            if (action.confirmationToken) {
              const timeoutMsg = "The confirmation result was not received. Do not retry this write; check HirePool application history before asking for a fresh readiness check.";
              statusMsg.textContent = timeoutMsg;
              controls.style.display = "none";
              action._status = "error";
              action._statusMessage = timeoutMsg;
              this._syncMessageActionState(action);
            } else {
              statusMsg.textContent = "Action timed out before confirmation completed. Click Retry to try again or Cancel to dismiss.";
              btnConfirm.disabled = false;
              btnCancel.disabled = false;
              btnConfirm.textContent = "Retry";
            }
          }
        }, 15e3);
        this.events.emit("action:execute", {
          actionId: action.id,
          action: action.action,
          parameters: action.parameters || {},
          confirmationToken: action.confirmationToken,
          resolve: (result) => {
            handled = true;
            executing = false;
            clearTimeout(timeoutId);
            const successMsg = result?.message || "Action executed successfully!";
            statusMsg.style.display = "flex";
            statusMsg.className = "ai-action-status-msg success";
            statusMsg.innerHTML = `${ICONS.check} ${escapeHtml(successMsg)}`;
            controls.style.display = "none";
            action._status = "completed";
            action._statusMessage = successMsg;
            this._syncMessageActionState(action);
            this.events.emit("action:success", { actionId: action.id, action: action.action, result });
            this._scrollToBottom();
          },
          reject: (err) => {
            handled = true;
            executing = false;
            clearTimeout(timeoutId);
            const errorMsg = err?.message || "Action failed";
            statusMsg.style.display = "flex";
            statusMsg.className = "ai-action-status-msg error";
            statusMsg.innerHTML = `\u26A0\uFE0F ${escapeHtml(errorMsg)}`;
            const isTerminalWriteError = Boolean(action.confirmationToken) || err?.status >= 400 && err?.status < 500;
            if (isTerminalWriteError) {
              controls.style.display = "none";
              action._status = "error";
              action._statusMessage = errorMsg;
              this._syncMessageActionState(action);
            } else {
              btnConfirm.disabled = false;
              btnCancel.disabled = false;
              btnConfirm.textContent = "Retry";
            }
            this.events.emit("action:error", { actionId: action.id, action: action.action, error: err });
            this._scrollToBottom();
          }
        });
      });
      btnCancel.addEventListener("click", () => {
        if (executing || action._status && action._status !== "pending") return;
        btnConfirm.disabled = true;
        btnCancel.disabled = true;
        clearTimeout(timeoutId);
        controls.style.display = "none";
        statusMsg.style.display = "flex";
        statusMsg.className = "ai-action-status-msg cancelled";
        statusMsg.textContent = "Action cancelled.";
        action._status = "cancelled";
        action._statusMessage = "Action cancelled.";
        this._syncMessageActionState(action);
        this.events.emit("action:cancel", {
          actionId: action.id,
          action: action.action,
          confirmationToken: action.confirmationToken
        });
        this._scrollToBottom();
      });
      bubble.appendChild(card);
      this._scrollToBottom();
    }
    _isHirePoolResumeEnabled() {
      if (this.options?.surface === "website" || this.options?.surface === "app") return false;
      return this._canSaveHirePoolResume();
    }
    /** Can this widget save a PDF to the signed-in candidate's HirePool profile? */
    _canSaveHirePoolResume() {
      return this.options.assistantId === "hirepool" && this.options.applicationId === "hirepool-local-app" && typeof this.apiClient.prepareHirePoolResume === "function";
    }
    setHostIdentity(identity, sessionScope = null) {
      this.hostIdentity = identity;
      const roleType = identity?.user_type || identity?.userType;
      if (this.attachBtn && this._isHirePoolResumeEnabled()) {
        const eligible = roleType === "candidate";
        this.attachBtn.disabled = !eligible;
        this.attachBtn.title = eligible ? "Attach a PDF resume" : "Sign in to a verified HirePool candidate account to upload a resume.";
        this.attachBtn.setAttribute("aria-label", this.attachBtn.title);
      }
      return this.hirePoolResume.setIdentity(identity, sessionScope);
    }
    _handleHirePoolResumeFile(file) {
      const roleType = this.hostIdentity?.user_type || this.hostIdentity?.userType;
      if (roleType !== "candidate") {
        this._renderHirePoolResumeError("Sign in to a verified HirePool candidate account to upload a resume.");
        return;
      }
      try {
        this.hirePoolResume.selectFile(file, this.activeConversationId);
      } catch (error) {
        this._renderHirePoolResumeError(error.message);
      }
    }
    _renderHirePoolResumeError(message) {
      const row = document.createElement("div");
      row.className = "ai-message-row assistant";
      const bubble = document.createElement("div");
      bubble.className = "ai-bubble";
      const error = document.createElement("p");
      error.className = "ai-action-status-msg error";
      error.textContent = message;
      bubble.appendChild(error);
      row.appendChild(bubble);
      this.messagesList.appendChild(row);
      this._scrollToBottom();
    }
    _renderHirePoolResumeState(state) {
      if (state.conversationId && !this.activeConversationId) {
        this.activeConversationId = state.conversationId;
        this._persistState();
      }
      const busy = state.state === HIREPOOL_RESUME_STATES.PREPARING || state.state === HIREPOOL_RESUME_STATES.UPLOADING;
      if (this.attachBtn && this._isHirePoolResumeEnabled()) {
        this.attachBtn.disabled = busy || this.hostIdentity?.user_type !== "candidate";
      }
      if (state.state === HIREPOOL_RESUME_STATES.IDLE) {
        this.hirePoolResumeCard?.remove();
        this.hirePoolResumeCard = null;
        return;
      }
      if (!this.messagesList) return;
      if (!this.hirePoolResumeCard) {
        const row = document.createElement("div");
        row.className = "ai-message-row assistant";
        const bubble = document.createElement("div");
        bubble.className = "ai-bubble";
        const card2 = document.createElement("section");
        card2.className = "ai-hirepool-resume-card";
        card2.setAttribute("aria-live", "polite");
        bubble.appendChild(card2);
        row.appendChild(bubble);
        this.messagesList.appendChild(row);
        this.hirePoolResumeCard = card2;
      }
      const card = this.hirePoolResumeCard;
      card.replaceChildren();
      const addText = (tagName, className, text) => {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        node.textContent = text;
        card.appendChild(node);
        return node;
      };
      const addButton = (label, className, handler, disabled = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener("click", handler);
        controls.appendChild(button);
        return button;
      };
      const controls = document.createElement("div");
      controls.className = "ai-hirepool-resume-controls";
      const filename = state.filename || "Selected resume";
      const size = Number.isInteger(state.fileSize) ? formatHirePoolResumeSize(state.fileSize) : "";
      const fileDescription = size ? `${filename} (${size})` : filename;
      if (state.state === HIREPOOL_RESUME_STATES.FILE_SELECTED) {
        addText("strong", "", fileDescription);
        addText("p", "", "Review the selected PDF before preparing a secure upload.");
        addButton("Remove", "ai-btn-resume-remove", () => this.hirePoolResume.removeFile());
        addButton("Prepare upload", "ai-btn-resume-prepare", () => {
          void this.hirePoolResume.prepare(this.activeConversationId);
        });
      } else if (state.state === HIREPOOL_RESUME_STATES.PREPARING) {
        addText("strong", "", "Preparing resume upload\u2026");
        addText("p", "", "Your PDF is being securely staged. It is not being sent to the assistant.");
        addText("span", "ai-spinner", "");
      } else if (state.state === HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION) {
        addText("strong", "", fileDescription);
        addText(
          "p",
          "",
          state.replacingExisting ? "Confirming will replace the resume currently stored in your HirePool profile." : "Confirm to upload this resume to your HirePool profile."
        );
        addButton("Confirm upload", "ai-btn-resume-confirm", () => {
          void this.hirePoolResume.confirm();
        });
        addButton("Cancel", "ai-btn-resume-cancel", () => {
          void this.hirePoolResume.cancel();
        });
      } else if (state.state === HIREPOOL_RESUME_STATES.UPLOADING) {
        addText("strong", "", state.message || "Uploading resume\u2026");
        addText("span", "ai-spinner", "");
      } else if (state.state === HIREPOOL_RESUME_STATES.UPLOAD_SUCCESS) {
        addText("strong", "", "Your resume was uploaded and verified by HirePool.");
      } else if (state.state === HIREPOOL_RESUME_STATES.UPLOAD_UNVERIFIED) {
        addText("strong", "", "HirePool may have accepted the resume, but the result could not be verified.");
        addText("p", "", "Check your HirePool profile before trying another upload.");
      } else if (state.state === HIREPOOL_RESUME_STATES.UPLOAD_FAILED) {
        addText("strong", "", state.error || "HirePool could not complete the resume operation.");
        if (state.filename) {
          addText("p", "", "You can select a PDF again after checking your HirePool profile.");
        }
      } else if (state.state === HIREPOOL_RESUME_STATES.CANCELLED) {
        addText("p", "ai-document-cancelled", "The prepared resume upload was cancelled.");
      }
      if (state.state === HIREPOOL_RESUME_STATES.FILE_SELECTED || state.state === HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION) {
        card.appendChild(controls);
      }
      this._scrollToBottom();
    }
    _stopVerificationWatcher() {
      if (this._verificationPollTimer) {
        clearInterval(this._verificationPollTimer);
        this._verificationPollTimer = null;
      }
      if (this._verificationFocusHandler && typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("focus", this._verificationFocusHandler);
        this._verificationFocusHandler = null;
      }
      if (this._verificationVisibilityHandler && typeof document !== "undefined" && typeof document.removeEventListener === "function") {
        document.removeEventListener("visibilitychange", this._verificationVisibilityHandler);
        this._verificationVisibilityHandler = null;
      }
    }
    _startVerificationWatcher() {
      this._stopVerificationWatcher();
      const triggerCheck = async () => {
        if (!this.hirePoolSignup || this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING && this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.VERIFICATION_PENDING) {
          this._stopVerificationWatcher();
          return;
        }
        try {
          await this.hirePoolSignup.checkVerificationStatus({ silent: true });
        } catch (err) {
          if (/expired/i.test(err?.message || "")) {
            this._stopVerificationWatcher();
          }
        }
      };
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        this._verificationFocusHandler = () => {
          void triggerCheck();
        };
        window.addEventListener("focus", this._verificationFocusHandler);
      }
      if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        this._verificationVisibilityHandler = () => {
          if (document.visibilityState === "visible") {
            void triggerCheck();
          }
        };
        document.addEventListener("visibilitychange", this._verificationVisibilityHandler);
      }
      let pollsRemaining = 100;
      this._verificationPollTimer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return;
        }
        pollsRemaining -= 1;
        if (pollsRemaining <= 0) {
          this._stopVerificationWatcher();
          return;
        }
        void triggerCheck();
      }, 3e3);
      this._verificationPollTimer.unref?.();
    }
    _renderHirePoolSignupState(state, data) {
      if (this.hirePoolSignupCard) {
        this.hirePoolSignupCard.remove();
        this.hirePoolSignupCard = null;
      }
      const isPendingVerificationState = state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING || state === HIREPOOL_SIGNUP_STATES.VERIFICATION_PENDING;
      const isInProgressVerificationState = state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_IN_PROGRESS || state === HIREPOOL_SIGNUP_STATES.VERIFICATION_IN_PROGRESS;
      if (!isPendingVerificationState && !isInProgressVerificationState) {
        this._stopVerificationWatcher();
      }
      if (state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFIED) {
        this._appendAssistantSignupNotice(
          "Your email has been verified! Complete your HirePool profile details below to finish creating your account."
        );
      }
      const safeSnapshot = this.hirePoolSignup.getSafeProgressSnapshot?.();
      if (safeSnapshot) {
        this.storage.saveSignupProgress?.(safeSnapshot);
      } else {
        this.storage.clearSignupProgress?.();
      }
      if (state === HIREPOOL_SIGNUP_STATES.IDLE || state === HIREPOOL_SIGNUP_STATES.CANCELLED) {
        return;
      }
      const row = document.createElement("div");
      row.className = "ai-message-row assistant ai-signup-row";
      let card = null;
      if (state === HIREPOOL_SIGNUP_STATES.ROLE_SELECTION) {
        card = renderRoleSelectionCard({
          onSelect: (role) => void this.hirePoolSignup.selectRole(role),
          onCancel: () => void this.hirePoolSignup.cancel()
        });
      } else if (state === HIREPOOL_SIGNUP_STATES.SIGNUP_FORM) {
        card = renderSignupFormCard({
          role: data.role || this.hirePoolSignup.selectedRole,
          agreement: data.agreement || this.hirePoolSignup.agreement,
          onSubmit: (formData) => this.hirePoolSignup.submitSignup(formData),
          onCancel: () => void this.hirePoolSignup.cancel()
        });
      } else if (isPendingVerificationState || isInProgressVerificationState) {
        const verificationUrl = data.verificationUrl ?? this.hirePoolSignup.verificationUrl ?? null;
        if (isPendingVerificationState) {
          this._startVerificationWatcher();
        }
        card = renderVerificationCard({
          email: data.session?.email || this.hirePoolSignup.session?.email,
          verificationUrl,
          notVerifiedYet: Boolean(data.notVerifiedYet),
          message: data.message,
          error: data.error,
          approvedOrigins: this._getApprovedAppOrigins(),
          onVerifyClick: (url) => {
            if (typeof window !== "undefined" && typeof window.open === "function") {
              window.open(url, "_blank", "noopener,noreferrer");
            }
            this._startVerificationWatcher();
          },
          onCheckStatus: () => this.hirePoolSignup.checkVerificationStatus(),
          onResend: () => this.hirePoolSignup.resendVerification(),
          onCancel: () => void this.hirePoolSignup.cancel()
        });
      } else if (state === HIREPOOL_SIGNUP_STATES.PROFILE_COLLECTION) {
        card = renderProfileCollectionCard({
          role: data.role || this.hirePoolSignup.selectedRole,
          profileData: data.profileData || this.hirePoolSignup.profileData,
          missingFields: data.missingFields || this.hirePoolSignup.missingFields,
          onReview: (updatedData) => {
            this.hirePoolSignup.profileData = { ...this.hirePoolSignup.profileData, ...updatedData };
            this.hirePoolSignup.setState(HIREPOOL_SIGNUP_STATES.PROFILE_REVIEW, {
              profileData: this.hirePoolSignup.profileData
            });
          },
          onCancel: () => void this.hirePoolSignup.cancel()
        });
      } else if (state === HIREPOOL_SIGNUP_STATES.PROFILE_REVIEW) {
        card = renderProfileReviewCard({
          role: data.role || this.hirePoolSignup.selectedRole,
          profileData: data.profileData || this.hirePoolSignup.profileData,
          onConfirm: () => this.hirePoolSignup.completeProfile(),
          onEdit: () => {
            this.hirePoolSignup.setState(HIREPOOL_SIGNUP_STATES.PROFILE_COLLECTION, {
              profileData: this.hirePoolSignup.profileData,
              missingFields: this.hirePoolSignup.missingFields
            });
          },
          onCancel: () => void this.hirePoolSignup.cancel()
        });
      }
      if (card) {
        this.hirePoolSignupCard = card;
        row.appendChild(card);
        this.messagesList.appendChild(row);
        this._scrollToBottom();
      }
    }
    async _handleHirePoolSignupSuccess(sessionData) {
      if (!sessionData?.credential) {
        throw new Error("Authentication transition failed: missing SDK session credential.");
      }
      const newUserId = sessionData.identity?.id;
      const previousSession = this.storage.get("hirepool_session", null);
      const previousUserId = previousSession?.identity?.id;
      if (typeof this.storage.setUser === "function") {
        this.storage.setUser(newUserId);
      }
      if (previousUserId && previousUserId !== newUserId) {
        this.activeConversationId = null;
        this.storage.clearConversationId();
        this.messages = [];
        if (this.messagesList) {
          this.messagesList.innerHTML = "";
        }
      }
      this.storage.clearSignupProgress?.();
      this.apiClient.setAuthenticatedSession(sessionData);
      this.storage.set("hirepool_session", sessionData);
      this.setHostIdentity(sessionData.identity, sessionData.sessionScope);
      if (this.options.integration) {
        this.options.integration.getAuthHeaders = async () => ({ Authorization: `Bearer ${sessionData.credential}` });
        this.options.integration.getSessionScope = async () => sessionData.sessionScope;
        this.options.integration.getIdentity = async () => sessionData.identity;
        if (typeof this.options.integration.setSession === "function") {
          this.options.integration.setSession(sessionData);
        }
      }
      const runSmokeTest = async () => {
        try {
          const smokeResult = await this.apiClient.validateHirePoolSession(sessionData.credential);
          if (!smokeResult?.valid) {
            throw new Error("HirePool could not validate the newly established session.");
          }
          this._dismissRecoverableBanner();
          this._displaySignupConfirmation(sessionData);
          this.events.emit("auth:session", sessionData);
          return true;
        } catch (smokeErr) {
          console.warn("[AI Assistant] Smoke test failed after account creation:", smokeErr);
          this._renderRecoverableWarningBanner(
            "Account created successfully! However, assistant session verification timed out.",
            "Retry Connection",
            () => runSmokeTest()
          );
          return false;
        }
      };
      await runSmokeTest();
    }
    /**
     * Website bot: after signup, share the HirePool app link, then thank the visitor.
     * No assistant login is created on the public website.
     */
    _displaySignupHandoff(handoff = {}) {
      let appUrl = null;
      try {
        const parsed = new URL(handoff.url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") appUrl = parsed.href;
      } catch {
      }
      this.storage.clearSignupProgress?.();
      const roleLabel = {
        candidate: "candidate",
        client: "company",
        consultancy: "agency"
      }[handoff.role] || "";
      const destination = handoff.role === "candidate" ? "profile" : "dashboard";
      const linkLine = appUrl ? `\u{1F449} **[Open my HirePool ${destination}](${appUrl})**` : "\u{1F449} **Continue to your HirePool dashboard** by logging in at HirePool.";
      const linkMsg = `\u{1F389} Your HirePool ${roleLabel ? `${roleLabel} ` : ""}account is ready!

${linkLine}

If HirePool asks you to log in, use the email and password you just set up.`;
      const thanksMsg = "Thank you for joining HirePool! \u{1F49A} We are excited to have you on board. If you have any other questions about HirePool, I am right here.";
      for (const content of [linkMsg, thanksMsg]) {
        this._renderMessageBubble("assistant", content);
        this.messages.push({ role: "assistant", content });
      }
      if (appUrl) {
        const row = document.createElement("div");
        row.className = "ai-message-row assistant";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ai-btn-action-confirm ai-handoff-btn";
        btn.textContent = handoff.role === "candidate" ? "Go to my profile" : "Go to my dashboard";
        btn.addEventListener("click", () => {
          window.open(appUrl, "_blank", "noopener,noreferrer");
        });
        row.appendChild(btn);
        this.messagesList.appendChild(row);
      }
      this._persistState();
      this._scrollToBottom();
      this.events.emit("signup:completed", { role: handoff.role || null, appUrl });
    }
    _displaySignupConfirmation(sessionData) {
      const role = sessionData.role || sessionData.identity?.userType;
      let greeting = "Welcome to HirePool!";
      let prompts = [];
      let welcomeMsg = "";
      if (role === "candidate") {
        greeting = "Welcome back. I can help with matching jobs, applications, and your profile.";
        prompts = ["Find matching jobs", "View my profile", "My applications"];
        welcomeMsg = `\u{1F389} **Welcome to HirePool!** Your candidate account is verified and your profile is complete. You can now use the assistant to access your account and explore jobs.`;
      } else if (role === "client") {
        greeting = "Welcome back. I can help with your hiring dashboard and jobs.";
        prompts = ["View my jobs", "View company profile", "Dashboard stats"];
        welcomeMsg = `\u{1F389} **Welcome to HirePool!** Your company account is verified and your profile is complete. You can now use the assistant to manage your job listings and view applications.`;
      } else if (role === "consultancy") {
        greeting = "Welcome back. I can help with placements, bench candidates, and your consultancy dashboard.";
        prompts = ["View candidate pool", "Add a candidate", "Placement stats", "View agency profile"];
        welcomeMsg = `\u{1F389} **Welcome to HirePool!** Your consultancy account is verified and your profile is complete. You can now use the assistant to manage bench candidates, track placements, and view your consultancy dashboard.`;
      }
      this.setGreeting(greeting, prompts);
      this._renderMessageBubble("assistant", welcomeMsg);
      this.messages.push({ role: "assistant", content: welcomeMsg });
      this._persistState();
      const pillRow = document.createElement("div");
      pillRow.className = "ai-message-row assistant";
      const pillContainer = document.createElement("div");
      pillContainer.className = "ai-suggested-prompts";
      pillContainer.style.marginTop = "4px";
      pillContainer.style.marginBottom = "8px";
      prompts.forEach((promptText) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ai-prompt-chip";
        btn.textContent = promptText;
        btn.addEventListener("click", () => {
          this.sendMessage(promptText);
        });
        pillContainer.appendChild(btn);
      });
      pillRow.appendChild(pillContainer);
      this.messagesList.appendChild(pillRow);
      this._scrollToBottom();
    }
    _handleFileUpload(file) {
      if (!file) return;
      const settings = this.options.documentUpload;
      if (!settings?.enabled) {
        this._renderMessageBubble("assistant", "Document upload is disabled for this assistant.");
        return;
      }
      const filename = typeof file.name === "string" ? file.name : "document";
      const extension = "." + filename.split(".").pop().toLowerCase();
      if (!settings.allowedExtensions.includes(extension)) {
        this._renderMessageBubble("assistant", "Unsupported document type.");
        return;
      }
      if (!Number.isFinite(file.size) || file.size < 1 || file.size > settings.maxSizeBytes) {
        const limitMb = Math.floor(settings.maxSizeBytes / (1024 * 1024));
        this._renderMessageBubble("assistant", `Document exceeds the ${limitMb} MB upload limit or is empty.`);
        return;
      }
      const sizeFormatted = (file.size / 1024).toFixed(0) + " KB";
      const hasHostListener = Boolean(this.events?.listeners?.get("file:upload")?.size > 0);
      const consent = settings.consent;
      const consentId = `ai-document-consent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const row = document.createElement("div");
      row.className = "ai-message-row assistant";
      const bubble = document.createElement("div");
      bubble.className = "ai-bubble";
      const description = hasHostListener ? consent.hostDescription : consent.description;
      const checkboxLabel = hasHostListener ? consent.hostCheckboxLabel : consent.checkboxLabel;
      bubble.innerHTML = `
      <section class="ai-document-consent" role="group" aria-labelledby="${consentId}-title">
        <h3 id="${consentId}-title">${escapeHtml(consent.title)}</h3>
        <p>${escapeHtml(description)}</p>
        <label class="ai-document-consent-choice" for="${consentId}-accepted">
          <input id="${consentId}-accepted" type="checkbox" class="ai-document-consent-checkbox">
          <span>${escapeHtml(checkboxLabel)}</span>
        </label>
        <div class="ai-document-consent-controls">
          <button type="button" class="ai-btn-document-consent-accept" disabled>Continue</button>
          <button type="button" class="ai-btn-document-consent-cancel">Cancel</button>
        </div>
      </section>
    `;
      row.appendChild(bubble);
      this.messagesList.appendChild(row);
      this._scrollToBottom();
      const checkbox = bubble.querySelector(".ai-document-consent-checkbox");
      const acceptButton = bubble.querySelector(".ai-btn-document-consent-accept");
      const cancelButton = bubble.querySelector(".ai-btn-document-consent-cancel");
      checkbox.addEventListener("change", () => {
        acceptButton.disabled = !checkbox.checked;
      });
      acceptButton.addEventListener("click", () => {
        if (!checkbox.checked || acceptButton.disabled) return;
        this.events.emit("document:consent-accepted", { filename });
        this._processFileUpload(file, bubble, sizeFormatted, hasHostListener);
      });
      cancelButton.addEventListener("click", () => {
        bubble.innerHTML = '<p class="ai-document-cancelled">Document processing cancelled. The file was not sent.</p>';
        this.events.emit("document:consent-rejected", { filename });
        this._scrollToBottom();
      });
    }
    _processFileUpload(file, bubble, sizeFormatted, hasHostListener) {
      const filename = typeof file.name === "string" ? file.name : "document";
      const controller = new AbortController();
      this.documentUploadController = controller;
      const uploadMessage = `Uploaded document: ${filename} (${sizeFormatted})`;
      this.messages.push({ role: "user", content: uploadMessage });
      this._renderMessageBubble("user", uploadMessage);
      this._persistState();
      const cardRow = bubble.closest(".ai-message-row");
      if (cardRow && this.messagesList) this.messagesList.appendChild(cardRow);
      bubble.innerHTML = `
      <div class="ai-processing-state">
        <span class="ai-spinner"></span>
        <span>Processing <strong>${escapeHtml(filename)}</strong>...</span>
        <button type="button" class="ai-btn-document-cancel">Cancel</button>
      </div>
    `;
      const cancelButton = bubble.querySelector(".ai-btn-document-cancel");
      cancelButton.addEventListener("click", () => controller.abort(), { once: true });
      const showCancelled = () => {
        bubble.innerHTML = '<p class="ai-document-cancelled">Document processing cancelled.</p>';
        this.events.emit("document:cancelled", { filename });
        if (this.documentUploadController === controller) this.documentUploadController = null;
        this._scrollToBottom();
      };
      controller.signal.addEventListener("abort", showCancelled, { once: true });
      if (hasHostListener) {
        let handled = false;
        const timeout = setTimeout(() => {
          if (handled || controller.signal.aborted) return;
          handled = true;
          if (this.documentUploadController === controller) this.documentUploadController = null;
          bubble.innerHTML = '<p class="ai-action-status-msg error">The host application did not complete document processing in time.</p>';
          this._scrollToBottom();
        }, 45e3);
        this.events.emit("file:upload", {
          file,
          filename,
          fileSize: file.size,
          fileType: file.type,
          signal: controller.signal,
          resolve: (result) => {
            if (handled || controller.signal.aborted) return;
            handled = true;
            clearTimeout(timeout);
            if (this.documentUploadController === controller) this.documentUploadController = null;
            const message = typeof result?.message === "string" ? result.message : "The host application processed the document.";
            bubble.innerHTML = `<p class="ai-document-host-result">${escapeHtml(message)}</p>`;
            this.events.emit("document:host-processed", { filename, result });
            this._scrollToBottom();
          },
          reject: (error) => {
            if (handled || controller.signal.aborted) return;
            handled = true;
            clearTimeout(timeout);
            if (this.documentUploadController === controller) this.documentUploadController = null;
            bubble.innerHTML = `<p class="ai-action-status-msg error">${escapeHtml(error?.message || "The host application could not process this document.")}</p>`;
            this._scrollToBottom();
          }
        });
        controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
        return;
      }
      this.apiClient.uploadDocument(file, this.activeConversationId, {
        assistantId: this.options?.assistantId || this.apiClient?.assistantId,
        consentAccepted: true,
        signal: controller.signal
      }).then(async (data) => {
        if (controller.signal.aborted) {
          await this.apiClient.removeDocument(data.conversationId, data.document.id);
          return;
        }
        if (data.conversationId && !this.activeConversationId) {
          this.activeConversationId = data.conversationId;
          this._persistState();
        }
        const doc = data.document;
        const wordsCount = doc.wordCount || Math.round(doc.textLength / 5) || 0;
        const pageInfo = doc.pageCount ? ` \u2022 ${doc.pageCount} page${doc.pageCount > 1 ? "s" : ""}` : "";
        bubble.innerHTML = `
        <div class="ai-doc-card">
          <div class="ai-doc-header">
            <div class="ai-doc-icon">\u{1F4C4}</div>
            <div class="ai-doc-details">
              <div class="ai-doc-title">${escapeHtml(doc.filename)}</div>
              <div class="ai-doc-meta">${escapeHtml(doc.fileType.toUpperCase())} \u2022 ${sizeFormatted}${pageInfo} \u2022 ${wordsCount} words</div>
            </div>
            <div class="ai-doc-badge">Ready for questions</div>
          </div>
          <p class="ai-doc-hint">You can ask questions about the extracted text. The text is temporary and limited to this conversation session.</p>
          <button type="button" class="ai-btn-document-remove" aria-label="Remove ${escapeHtml(doc.filename)} from this conversation">Remove document</button>
        </div>
      `;
        const knownDocuments = this.storage.get("documents", []);
        this.storage.set("documents", [...knownDocuments.filter((item) => item.id !== doc.id), doc]);
        this.messages.push({ role: "assistant", content: `Processed document: ${doc.filename}. Ready for questions.` });
        this._persistState();
        bubble.querySelector(".ai-btn-document-remove").addEventListener("click", async (event) => {
          event.currentTarget.disabled = true;
          try {
            await this.apiClient.removeDocument(this.activeConversationId, doc.id);
            const remaining = this.storage.get("documents", []).filter((item) => item.id !== doc.id);
            this.storage.set("documents", remaining);
            bubble.innerHTML = '<p class="ai-document-cancelled">Document removed from this conversation.</p>';
            this.events.emit("document:removed", doc);
          } catch (error) {
            event.currentTarget.disabled = false;
            this._renderErrorBanner(error.message);
            this.events.emit("error", error);
          }
          this._scrollToBottom();
        });
        this.events.emit("document:uploaded", doc);
        if (this.options?.surface === "app" && data.insight) {
          const hint = bubble.querySelector(".ai-doc-hint");
          if (hint) hint.textContent = "Ask me anything about this document. It is only used in this conversation.";
          this._showDashboardDocumentInsight(data.insight, file);
        } else if (data.insight?.text) {
          if (data.insight.signupRole) this._visitorSignupRole = data.insight.signupRole;
          const hint = bubble.querySelector(".ai-doc-hint");
          if (hint) hint.textContent = "Ask me anything about this document. It is only used in this conversation.";
          this._postLocalAssistantMessage(data.insight.text, Array.isArray(data.insight.quickReplies) ? data.insight.quickReplies : []);
          this._idleNudge?.onAssistantMessage("question");
          this.events.emit("document:insight", { kind: data.insight.kind });
        }
        this._scrollToBottom();
      }).catch((error) => {
        if (error.name === "AbortError") return;
        bubble.innerHTML = `<p class="ai-action-status-msg error">${escapeHtml(error?.message || "Failed to process document")}</p>`;
        this._scrollToBottom();
      }).finally(() => {
        controller.signal.removeEventListener("abort", showCancelled);
        if (this.documentUploadController === controller) this.documentUploadController = null;
      });
    }
    /**
     * Dashboard: show what an uploaded document is and the next steps for this role.
     * Nothing is saved until the user confirms in a form or a review card.
     */
    _showDashboardDocumentInsight(insight, file) {
      if (!insight?.text) return;
      const data = insight.data || {};
      const handlers = {
        fill_profile: () => void this.showProfileForm("all", {
          overrides: data.prefill || {},
          fillEmptyOnly: true,
          sourceLabel: "From resume"
        }),
        find_jobs: () => {
          const q = data.jobSearch;
          void this.sendMessage(q?.query ? `Find ${q.query} jobs${q.location ? ` in ${q.location}` : ""}` : "Find matching jobs");
        },
        save_resume: () => {
          if (file && this._canSaveHirePoolResume() && String(file.name || "").toLowerCase().endsWith(".pdf")) {
            try {
              this.hirePoolResume.selectFile(file, this.activeConversationId);
            } catch (error) {
              this._renderHirePoolResumeError(error.message);
            }
          } else {
            this.postAssistantNote("Saving a resume works with **PDF** files here. You can also upload it from your **Profile** page.");
          }
        },
        create_job: () => {
          if (data.message) void this.sendMessage(data.message, { displayText: "Create this job from my job description" });
        },
        edit_job: () => {
          if (!data.message) return;
          this.textarea.value = data.message;
          this.textarea.dispatchEvent(new Event("input"));
          this.textarea.focus();
          this.postAssistantNote("I put the job details in the message box. Change anything you like, then press **send** to see the review card.");
        }
      };
      const options = (Array.isArray(insight.options) ? insight.options : []).map((option) => ({
        icon: option.icon,
        title: option.title,
        subtitle: option.subtitle,
        prompt: option.prompt || option.title,
        onSelect: option.id === "prompt" ? null : handlers[option.id] || null
      }));
      this._postLocalAssistantMessage(insight.text, []);
      if (options.length) this._renderRoleCards(this.messagesList.lastElementChild, options);
      this._idleNudge?.onAssistantMessage("question");
      this.events.emit("document:insight", { kind: insight.kind, surface: "app" });
    }
    /** Dashboard (agency): bench import and submit calls, set by the SDK. */
    setAssistantHandlers(handlers) {
      this._assistantHandlers = handlers && typeof handlers.addCandidate === "function" ? handlers : null;
    }
    /**
     * Agency dashboard: read one or more resumes, then offer to add them to the
     * bench, submit them to a job, or review them one by one.
     */
    _handleBenchFiles(files) {
      const settings = this.options.documentUpload;
      if (!settings?.enabled || !files.length) return;
      const allowed = files.filter((f) => settings.allowedExtensions.includes(`.${String(f.name || "").split(".").pop().toLowerCase()}`) && Number.isFinite(f.size) && f.size > 0 && f.size <= settings.maxSizeBytes);
      const skipped = files.length - allowed.length;
      if (!allowed.length) {
        this.postAssistantNote("Those files can\u2019t be read here. Upload resumes as **PDF, DOCX or TXT**, up to 4 MB each.");
        return;
      }
      const consent = settings.consent;
      const row = document.createElement("div");
      row.className = "ai-message-row assistant";
      const bubble = document.createElement("div");
      bubble.className = "ai-bubble";
      const countLabel = `${allowed.length} resume${allowed.length === 1 ? "" : "s"}`;
      bubble.innerHTML = `
      <section class="ai-document-consent" role="group">
        <h3>${escapeHtml(consent.title)}</h3>
        <p>${escapeHtml(consent.description)}</p>
        <p class="ai-pf-hint">${escapeHtml(countLabel)} selected${skipped ? ` \xB7 ${skipped} file${skipped === 1 ? "" : "s"} skipped (unsupported or too large)` : ""}</p>
        <label class="ai-document-consent-choice"><input type="checkbox" class="ai-document-consent-checkbox"><span>${escapeHtml(consent.checkboxLabel)}</span></label>
        <div class="ai-document-consent-controls">
          <button type="button" class="ai-btn-document-consent-accept" disabled>Continue</button>
          <button type="button" class="ai-btn-document-consent-cancel">Cancel</button>
        </div>
      </section>`;
      row.appendChild(bubble);
      this.messagesList.appendChild(row);
      this._scrollToBottom();
      const checkbox = bubble.querySelector(".ai-document-consent-checkbox");
      const accept = bubble.querySelector(".ai-btn-document-consent-accept");
      checkbox.addEventListener("change", () => {
        accept.disabled = !checkbox.checked;
      });
      bubble.querySelector(".ai-btn-document-consent-cancel").addEventListener("click", () => {
        bubble.innerHTML = '<p class="ai-document-cancelled">Upload cancelled. The files were not sent.</p>';
      });
      accept.addEventListener("click", () => {
        if (!checkbox.checked) return;
        void this._readBenchFiles(allowed, row, bubble);
      });
    }
    async _readBenchFiles(files, row, bubble) {
      const label = `Uploaded ${files.length} resume${files.length === 1 ? "" : "s"}`;
      this.messages.push({ role: "user", content: label });
      this._renderMessageBubble("user", label);
      this.messagesList.appendChild(row);
      this._persistState();
      const results = [];
      for (let i = 0; i < files.length; i += 1) {
        bubble.innerHTML = `<div class="ai-processing-state"><span class="ai-spinner"></span><span>Reading ${i + 1} of ${files.length}: <strong>${escapeHtml(files[i].name)}</strong>\u2026</span></div>`;
        this._scrollToBottom();
        try {
          const data = await this.apiClient.uploadDocument(files[i], this.activeConversationId, {
            assistantId: this.options?.assistantId || this.apiClient?.assistantId,
            consentAccepted: true
          });
          if (data.conversationId && !this.activeConversationId) {
            this.activeConversationId = data.conversationId;
            this._persistState();
          }
          const insight = data.insight || {};
          if (insight.kind === "resume" && insight.data?.candidate) {
            results.push({ filename: files[i].name, ...insight.data, status: insight.data.missing?.length ? "needs_details" : "ready" });
          } else {
            results.push({ filename: files[i].name, status: "not_resume", note: insight.kind === "unreadable" ? "No readable text" : "Not a resume" });
          }
        } catch (error) {
          results.push({ filename: files[i].name, status: "unreadable", note: error?.message || "Could not be read" });
        }
      }
      this._renderBenchCard(bubble, results);
    }
    _renderBenchCard(bubble, results) {
      const nameOf = (r) => [r.candidate?.first_name, r.candidate?.last_name].filter(Boolean).join(" ") || r.filename;
      const chip = (r) => ({
        ready: '<span class="ai-bench-chip ok">Ready</span>',
        needs_details: `<span class="ai-bench-chip warn">Missing: ${escapeHtml((r.missing || []).join(", "))}</span>`,
        adding: '<span class="ai-bench-chip">Adding\u2026</span>',
        added: '<span class="ai-bench-chip ok">Added \u2713</span>',
        duplicate: '<span class="ai-bench-chip">Already on bench</span>',
        failed: `<span class="ai-bench-chip err">${escapeHtml(r.note || "Not added")}</span>`,
        not_resume: `<span class="ai-bench-chip warn">${escapeHtml(r.note || "Not a resume")}</span>`,
        unreadable: `<span class="ai-bench-chip err">${escapeHtml(r.note || "Could not be read")}</span>`
      })[r.status] || "";
      const resumes = results.filter((r) => r.candidate);
      const ready = () => results.filter((r) => r.status === "ready");
      const render = () => {
        const added = results.filter((r) => r.status === "added").length;
        const dup = results.filter((r) => r.status === "duplicate").length;
        const needs = results.filter((r) => r.status === "needs_details").length;
        bubble.innerHTML = `
        <div class="ai-bench-card">
          <div class="ai-pf-title">${resumes.length} resume${resumes.length === 1 ? "" : "s"} read</div>
          <div class="ai-bench-list">
            ${results.map((r, i) => `
              <div class="ai-bench-row" data-index="${i}">
                <div class="ai-bench-who"><strong>${escapeHtml(nameOf(r))}</strong>
                  <span>${escapeHtml([r.candidate?.job_title, r.candidate?.current_location, r.candidate?.email].filter(Boolean).join(" \xB7 ") || r.filename)}</span></div>
                ${chip(r)}
              </div>`).join("")}
          </div>
          ${added || dup ? `<div class="ai-pf-hint">${added} added${dup ? ` \xB7 ${dup} already on your bench` : ""}${needs ? ` \xB7 ${needs} need details (use Review one by one)` : ""}</div>` : ""}
          <div class="ai-bench-actions">
            ${ready().length ? `<button type="button" class="ai-btn-action-confirm" data-act="add">Add ${ready().length} to my bench</button>` : ""}
            ${resumes.length ? '<button type="button" class="ai-btn-action-cancel" data-act="submit">Submit to a job</button>' : ""}
            ${resumes.some((r) => r.status === "ready" || r.status === "needs_details") ? '<button type="button" class="ai-btn-action-cancel" data-act="review">Review one by one</button>' : ""}
          </div>
          <div class="ai-bench-review"></div>
        </div>`;
        bubble.querySelector('[data-act="add"]')?.addEventListener("click", () => void addAll());
        bubble.querySelector('[data-act="submit"]')?.addEventListener("click", () => void submitFlow());
        bubble.querySelector('[data-act="review"]')?.addEventListener("click", () => {
          const box = bubble.querySelector(".ai-bench-review");
          box.innerHTML = "";
          results.filter((r) => r.candidate && r.addMessage && (r.status === "ready" || r.status === "needs_details")).forEach((r) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "ai-pf-chat-btn";
            button.textContent = `Review ${nameOf(r)}`;
            button.addEventListener("click", () => {
              void this.sendMessage(r.addMessage, { displayText: `Review ${nameOf(r)}` });
            });
            box.appendChild(button);
          });
          this._scrollToBottom();
        });
        this._scrollToBottom();
      };
      const addAll = async () => {
        for (const r of ready()) {
          r.status = "adding";
          render();
          try {
            const res = await this._assistantHandlers.addCandidate(r.candidate);
            if (res?.status === "added") {
              r.status = "added";
              r.id = res.id;
            } else if (res?.status === "duplicate") r.status = "duplicate";
            else if (res?.status === "needs_details") {
              r.status = "needs_details";
              r.missing = res.missing?.length ? res.missing : r.missing;
            } else {
              r.status = "failed";
              r.note = res?.message;
            }
          } catch (error) {
            r.status = "failed";
            r.note = error?.message;
          }
        }
        render();
        this.events.emit("bench:import", { added: results.filter((r) => r.status === "added").length });
      };
      const submitFlow = async () => {
        if (ready().length) await addAll();
        const submittable = results.filter((r) => r.status === "added" && r.id);
        const box = bubble.querySelector(".ai-bench-review");
        if (!submittable.length) {
          box.innerHTML = '<p class="ai-pf-hint">Only candidates added just now can be submitted here. For candidates already on your bench, say <strong>submit &lt;name&gt; to &lt;job&gt;</strong>.</p>';
          return;
        }
        box.innerHTML = '<div class="ai-profile-form-loading">Loading open jobs\u2026</div>';
        let jobs = [];
        try {
          jobs = await this._assistantHandlers.listJobs();
        } catch (error) {
          box.innerHTML = `<p class="ai-profile-form-error">${escapeHtml(error?.message || "I couldn't load open jobs just now.")}</p>`;
          return;
        }
        if (!jobs.length) {
          box.innerHTML = '<p class="ai-pf-hint">There are no open jobs to submit to right now.</p>';
          return;
        }
        box.innerHTML = `
        <form class="ai-profile-form ai-bench-submit">
          <label class="ai-pf-label" for="ai-bench-job">Job</label>
          <select id="ai-bench-job" class="ai-form-input"><option value="">Choose a job\u2026</option>
            ${jobs.map((j) => `<option value="${escapeHtml(j.id)}">${escapeHtml([j.title, j.company, j.location].filter(Boolean).join(" \xB7 "))}</option>`).join("")}
          </select>
          <div class="ai-pf-label">Candidates</div>
          <div class="ai-pf-chips">
            ${submittable.map((r) => `<label class="ai-pf-chip"><input type="checkbox" value="${escapeHtml(r.id)}" checked><span>${escapeHtml(nameOf(r))}</span></label>`).join("")}
          </div>
          <div class="ai-pf-form-error" role="alert"></div>
          <div class="ai-pf-actions"><button type="submit" class="ai-btn-action-confirm">Submit</button></div>
        </form>`;
        const form = box.querySelector("form");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const jobId = form.querySelector("#ai-bench-job").value;
          const ids = [...form.querySelectorAll('input[type="checkbox"]:checked')].map((i) => i.value);
          const error = form.querySelector(".ai-pf-form-error");
          if (!jobId || !ids.length) {
            error.textContent = "Choose a job and at least one candidate.";
            return;
          }
          const button = form.querySelector('button[type="submit"]');
          button.disabled = true;
          button.textContent = "Submitting\u2026";
          try {
            await this._assistantHandlers.submit(jobId, ids);
            const job = jobs.find((j) => j.id === jobId);
            box.innerHTML = "";
            this.postAssistantNote(`\u2705 Submitted **${ids.length}** candidate${ids.length === 1 ? "" : "s"} to **${job?.title || "the job"}**. Say **show my submissions** to track them.`);
          } catch (err) {
            error.textContent = err?.message || "HirePool couldn't submit these candidates. Please try again.";
            button.disabled = false;
            button.textContent = "Submit";
          }
        });
        this._scrollToBottom();
      };
      render();
    }
    cancelDocumentUpload() {
      this.documentUploadController?.abort();
      this.documentUploadController = null;
    }
    _renderMessageBubble(role, content, animate = true, action = null) {
      const row = document.createElement("div");
      row.className = `ai-message-row ${role}`;
      row.setAttribute("data-raw-content", content);
      const bubble = document.createElement("div");
      bubble.className = "ai-bubble";
      if (role === "user") {
        bubble.textContent = content;
        row.appendChild(bubble);
      } else {
        const renderedContent = this.options?.assistantId === "hirepool" ? this._stripActionBlocks(content) : content;
        bubble.innerHTML = parseMarkdown(renderedContent);
        const detectedAction = action || this._extractAction(content);
        if (detectedAction) {
          this._renderActionCard(bubble, detectedAction);
        }
        row.appendChild(bubble);
      }
      this.messagesList.appendChild(row);
      this._scrollToBottom();
      return row;
    }
    _renderRecoverableWarningBanner(message, actionText = "Retry Connection", actionCallback = null) {
      this._dismissRecoverableBanner();
      const banner = document.createElement("div");
      banner.className = "ai-warning-banner ai-recoverable-banner";
      banner.style.cssText = "background: #fff3cd; color: #856404; border: 1px solid #ffeeba; border-radius: 8px; padding: 10px 14px; margin: 8px 12px; font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: 8px;";
      const textSpan = document.createElement("span");
      textSpan.textContent = message;
      banner.appendChild(textSpan);
      if (actionCallback) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ai-warning-action-btn";
        btn.style.cssText = "background: #856404; color: #ffffff; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;";
        btn.textContent = actionText;
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = "Verifying...";
          try {
            await actionCallback();
          } finally {
            btn.disabled = false;
            btn.textContent = actionText;
          }
        });
        banner.appendChild(btn);
      }
      this._recoverableBanner = banner;
      this.messagesList.appendChild(banner);
      this._scrollToBottom();
    }
    _dismissRecoverableBanner() {
      if (this._recoverableBanner && this._recoverableBanner.parentNode) {
        this._recoverableBanner.parentNode.removeChild(this._recoverableBanner);
        this._recoverableBanner = null;
      }
    }
    /**
     * Friendly error notice. Only one is shown at a time.
     * @param {string} message plain, user-facing text
     * @param {Function|null} retryCallback what "Try again" does (null hides the button)
     * @param {{ retryLabel?: string|null, retryAfterMs?: number, loginUrl?: string|null }} [options]
     */
    _renderErrorBanner(message, retryCallback = null, options = {}) {
      this.messagesList?.querySelectorAll(".ai-error-banner").forEach((el) => el.remove());
      this._lastErrorRetryCallback = typeof retryCallback === "function" ? retryCallback : null;
      const retryLabel = options.retryLabel === void 0 ? "Try again" : options.retryLabel;
      const banner = document.createElement("div");
      banner.className = "ai-error-banner";
      banner.setAttribute("role", "alert");
      const showRetry = Boolean(retryLabel) && (this._lastErrorRetryCallback || options.retryLabel === void 0);
      let loginUrl = null;
      try {
        const parsed = options.loginUrl ? new URL(options.loginUrl) : null;
        if (parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")) loginUrl = parsed.href;
      } catch {
      }
      const looksTechnical = /\bHTTP\s*\d{3}\b|failed to fetch|networkerror|load failed|\bstream(?:ing)?\b.*\b(?:ended|event|response)\b|typeerror|referenceerror|syntaxerror|\bundefined\b|\bnull\b|ECONN|ETIMEDOUT|ENOTFOUND|stack trace|internal server error|\[object /i.test(String(message || ""));
      const safeMessage = !message || looksTechnical ? "Something went wrong on my side and I couldn't finish that. Nothing was changed. Please try again." : message;
      banner.innerHTML = `
      <span>${escapeHtml(safeMessage)}</span>
      ${showRetry ? `<button class="ai-error-retry-btn" type="button">${escapeHtml(retryLabel)}</button>` : ""}
      ${loginUrl ? `<a class="ai-error-login-link" href="${escapeHtml(loginUrl)}" target="_top">Log in</a>` : ""}
    `;
      const retryBtn = banner.querySelector(".ai-error-retry-btn");
      if (retryBtn && Number(options.retryAfterMs) > 0) {
        retryBtn.disabled = true;
        setTimeout(() => {
          retryBtn.disabled = false;
        }, Number(options.retryAfterMs));
      }
      this.messagesList.appendChild(banner);
      this._scrollToBottom();
    }
    /** Offline: resend once the browser reports the connection is back. */
    _resendWhenOnline(resend) {
      if (this._onlineHandler) window.removeEventListener("online", this._onlineHandler);
      this._onlineHandler = () => {
        window.removeEventListener("online", this._onlineHandler);
        this._onlineHandler = null;
        this.messagesList?.querySelectorAll(".ai-error-banner").forEach((el) => el.remove());
        void resend();
      };
      window.addEventListener("online", this._onlineHandler);
    }
    displayHirePoolLoginNotice(message) {
      this._renderMessageBubble("assistant", message, false, {
        id: `hirepool-login-recovery-${Date.now()}`,
        action: "hirepool_login",
        title: "Sign in to HirePool",
        explanation: "Sign in with your HirePool credentials to access your account.",
        parameters: {},
        risk: "read",
        requiresConfirmation: true
      });
    }
    _renderHirePoolLoginCard(bubble, action) {
      const actionId = action.id || action.action || `hp-login-${Date.now()}`;
      const card = document.createElement("div");
      card.className = "ai-action-card ai-login-card";
      card.setAttribute("data-action-id", actionId);
      card.setAttribute("data-action-type", "hirepool_login");
      this.events.emit("action:proposed", action);
      if (this._isLoginRedirectMode()) {
        const loginUrl = this._getAppLoginUrl();
        card.innerHTML = `
        <div class="ai-action-header">
          <span class="ai-action-badge">HirePool account</span>
          <span class="ai-action-title">Log in to your HirePool dashboard</span>
        </div>
        <div class="ai-action-explanation">Your profile, jobs, and applications are in the HirePool app. The assistant there can help with your account.</div>
        <div class="ai-action-controls">
          <button type="button" class="ai-btn-action-confirm ai-login-redirect-btn">Go to HirePool login</button>
        </div>
      `;
        card.querySelector(".ai-login-redirect-btn").addEventListener("click", () => {
          if (loginUrl) window.open(loginUrl, "_blank", "noopener,noreferrer");
          this.events.emit("login:redirect", { url: loginUrl });
        });
        bubble.appendChild(card);
        this._scrollToBottom();
        return;
      }
      if (action._status && action._status !== "pending") {
        card.innerHTML = `
        <div class="ai-action-header">
          <span class="ai-action-badge">HirePool account</span>
          <span class="ai-action-risk risk-read">Sign In</span>
          <span class="ai-action-title">${escapeHtml(action.title || "Sign in to HirePool")}</span>
        </div>
        <div class="ai-action-status-msg ${action._status === "completed" ? "success" : action._status}" style="display: flex;">
          ${escapeHtml(action._statusMessage || (action._status === "completed" ? "Signed in successfully." : "Sign-in cancelled."))}
        </div>
      `;
        bubble.appendChild(card);
        this._scrollToBottom();
        return;
      }
      card.innerHTML = `
      <div class="ai-action-header">
        <span class="ai-action-badge">HirePool account</span>
        <span class="ai-action-risk risk-read">Sign In</span>
        <span class="ai-action-title">${escapeHtml(action.title || "Sign in to HirePool")}</span>
      </div>
      <p class="ai-action-explanation">${escapeHtml(action.explanation || "Sign in with your HirePool credentials to access your account.")}</p>
      <form class="ai-login-form" autocomplete="on">
        <div class="ai-form-group">
          <label class="ai-form-label" for="hp-email-${escapeHtml(actionId)}">Email</label>
          <input type="email" id="hp-email-${escapeHtml(actionId)}" class="ai-form-input ai-login-email" placeholder="name@example.com" autocomplete="email" required />
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label" for="hp-pass-${escapeHtml(actionId)}">Password</label>
          <div class="ai-password-wrapper">
            <input type="password" id="hp-pass-${escapeHtml(actionId)}" class="ai-form-input ai-login-password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password" required />
            <button type="button" class="ai-password-toggle" aria-label="Toggle password visibility">\u{1F441}</button>
          </div>
        </div>
        <div class="ai-action-status-msg" style="display: none;"></div>
        <div class="ai-action-controls">
          <button type="submit" class="ai-btn-action-confirm ai-btn-login-submit">Sign In</button>
          <button type="button" class="ai-btn-action-cancel">Not now</button>
        </div>
        <div class="ai-login-secondary">
          <button type="button" class="ai-link-button ai-login-external-link">Open HirePool in new tab</button>
        </div>
      </form>
    `;
      const form = card.querySelector(".ai-login-form");
      const emailInput = card.querySelector(".ai-login-email");
      const passwordInput = card.querySelector(".ai-login-password");
      const toggleBtn = card.querySelector(".ai-password-toggle");
      const statusMsg = card.querySelector(".ai-action-status-msg");
      const submitBtn = card.querySelector(".ai-btn-login-submit");
      const cancelBtn = card.querySelector(".ai-btn-action-cancel");
      const externalLinkBtn = card.querySelector(".ai-login-external-link");
      toggleBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        if (passwordInput.type === "password") {
          passwordInput.type = "text";
          toggleBtn.textContent = "\u{1F648}";
        } else {
          passwordInput.type = "password";
          toggleBtn.textContent = "\u{1F441}";
        }
      });
      externalLinkBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          const result = openHirePoolLogin({
            currentUrl: typeof window !== "undefined" ? window.location.href : "http://localhost:3000",
            openWindow: (...args) => typeof window !== "undefined" ? window.open(...args) : null,
            appLoginUrl: this._getAppLoginUrl()
          });
          statusMsg.style.display = "flex";
          statusMsg.className = "ai-action-status-msg info";
          statusMsg.textContent = result?.message || "HirePool login opened in a new tab.";
        } catch (err) {
          statusMsg.style.display = "flex";
          statusMsg.className = "ai-action-status-msg error";
          statusMsg.textContent = err.message || "Could not open HirePool login tab.";
        }
      });
      cancelBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        passwordInput.value = "";
        action._status = "cancelled";
        action._statusMessage = "Sign-in cancelled.";
        this._syncMessageActionState(action);
        form.innerHTML = `
        <div class="ai-action-status-msg cancelled" style="display: flex;">
          Sign-in cancelled.
        </div>
      `;
        this._scrollToBottom();
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        passwordInput.value = "";
        if (!email || !password || !email.includes("@")) {
          statusMsg.style.display = "flex";
          statusMsg.className = "ai-action-status-msg error";
          statusMsg.textContent = "Please enter a valid email and password.";
          return;
        }
        emailInput.disabled = true;
        passwordInput.disabled = true;
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        statusMsg.style.display = "flex";
        statusMsg.className = "ai-action-status-msg executing";
        statusMsg.textContent = "Signing in to HirePool...";
        try {
          const session = await this.apiClient.loginHirePoolPassword(email, password);
          if (session?.status === "mfa_required") {
            statusMsg.className = "ai-action-status-msg info";
            statusMsg.textContent = session.message || "MFA is required on your account. Please log in on the HirePool website.";
            emailInput.disabled = false;
            passwordInput.disabled = false;
            submitBtn.disabled = false;
            cancelBtn.disabled = false;
            return;
          }
          const displayName = session.identity?.name || session.identity?.first_name || session.identity?.email || "User";
          const userType = session.identity?.userType || session.identity?.user_type || "user";
          action._status = "completed";
          action._statusMessage = `Signed in as ${displayName}`;
          this._syncMessageActionState(action);
          form.innerHTML = `
          <div class="ai-action-status-msg success" style="display: flex;">
            ${ICONS.check} Signed in as ${escapeHtml(displayName)} (${escapeHtml(userType)})
          </div>
        `;
          if (this.options.integration && typeof this.options.integration.setAuthSession === "function") {
            await this.options.integration.setAuthSession(session);
          } else {
            this.apiClient.setAuthenticatedSession(session);
          }
          const welcome = getHirePoolGreetingForAuthState({ status: "authenticated", identity: session.identity });
          if (typeof this.setGreeting === "function") {
            this.setGreeting(welcome.greeting, welcome.prompts);
          }
          this.events.emit("hirepool:auth:change", { status: "authenticated", identity: session.identity });
          this.events.emit("action:success", { actionId: action.id, action: action.action, result: session });
          this._scrollToBottom();
        } catch (err) {
          emailInput.disabled = false;
          passwordInput.disabled = false;
          submitBtn.disabled = false;
          cancelBtn.disabled = false;
          statusMsg.style.display = "flex";
          statusMsg.className = "ai-action-status-msg error";
          statusMsg.textContent = err.message || "Email or password is not correct.";
          passwordInput.focus();
          this.events.emit("action:error", { actionId: action.id, action: action.action, error: err });
          this._scrollToBottom();
        }
      });
      bubble.appendChild(card);
      this._scrollToBottom();
    }
    _handleHirePoolLoginTrigger(trimmed) {
      if (!this._isGuestSession()) return false;
      const isLoginTrigger = /^\s*(?:log\s*in(?:\s+to\s+hirepool)?|sign\s*in(?:\s+to\s+hirepool)?|i\s+(?:want|would\s+like|'d\s+like)\s+to\s+(?:log\s*in|sign\s*in))\s*[.!?]*\s*$/i.test(trimmed);
      if (isLoginTrigger) {
        this.displayHirePoolLoginNotice(
          this._isLoginRedirectMode() ? "You can log in to your HirePool dashboard using the button below. Once you are signed in, the assistant there can help with your profile, jobs, and applications." : "Please enter your HirePool email and password below to sign in."
        );
        return true;
      }
      return false;
    }
    invalidatePendingActions(message) {
      for (const card of this.messagesList.querySelectorAll(".ai-action-card")) {
        if (["hirepool_login", "hirepool_signup"].includes(card.getAttribute("data-action-type"))) continue;
        const controls = card.querySelector(".ai-action-controls");
        const status = card.querySelector(".ai-action-status-msg");
        if (controls) controls.style.display = "none";
        if (status) {
          status.style.display = "flex";
          status.className = "ai-action-status-msg cancelled";
          status.textContent = message;
        }
      }
    }
    _isGuestSession() {
      if (this.apiClient?.getAuthenticatedSession?.()) return false;
      if (this.hostIdentity?.id || this.hostIdentity?.email) return false;
      const ctx = this.options?.context;
      if (ctx && typeof ctx === "object" && ctx.authentication?.identity) return false;
      if (typeof ctx === "string" && ctx.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(ctx);
          if (parsed?.authentication?.identity) return false;
        } catch {
        }
      }
      return true;
    }
    _isHirePoolSignupEnabled() {
      if (this.options?.behavior?.signupEnabled === false) return false;
      return Boolean(
        (!this.options?.assistantId || this.options.assistantId === "hirepool") && typeof this.apiClient?.getSignupAgreement === "function"
      );
    }
    _isLoginRedirectMode() {
      return this.options?.behavior?.loginMode === "redirect";
    }
    /** Website "Sign in": go to the HirePool app's login page (local only for now). */
    _goToLogin() {
      const url = this._getAppLoginUrl() || "http://localhost:5173/login";
      this.events.emit("login:redirect", { url });
      if (typeof window !== "undefined" && window.location) {
        window.location.assign(url);
      }
    }
    /** Website: the account bar folds into header buttons once the visitor has written. */
    _syncWebsiteChatState() {
      if (!this.container || this.options?.surface !== "website") return;
      this.container.classList.toggle("ai-has-chat", this.messages.some((m) => m.role === "user"));
    }
    /** The configured HirePool app origin (from HIREPOOL_APP_LOGIN_URL), for verification links. */
    _getApprovedAppOrigins() {
      const loginUrl = this._getAppLoginUrl();
      try {
        return loginUrl ? [new URL(loginUrl).origin] : [];
      } catch {
        return [];
      }
    }
    _getAppLoginUrl() {
      try {
        const url = new URL(this.options?.behavior?.appLoginUrl);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
      } catch {
        return null;
      }
    }
    _buildChatContextPayload(rawContext) {
      let baseContext = typeof rawContext === "string" && rawContext.trim().length > 0 ? rawContext.trim() : "";
      const activeSignupStates = /* @__PURE__ */ new Set([
        HIREPOOL_SIGNUP_STATES.IDLE,
        HIREPOOL_SIGNUP_STATES.CANCELLED,
        HIREPOOL_SIGNUP_STATES.COMPLETED
      ]);
      if (this._isHirePoolSignupEnabled() && this.hirePoolSignup && !activeSignupStates.has(this.hirePoolSignup.state)) {
        const rolePart = this.hirePoolSignup.selectedRole ? ` role=${this.hirePoolSignup.selectedRole}` : "";
        const tag = `[HIREPOOL_SIGNUP_STATE state=${this.hirePoolSignup.state}${rolePart}]`;
        baseContext = baseContext ? `${baseContext}
${tag}` : tag;
      }
      return baseContext || void 0;
    }
    _appendAssistantSignupNotice(text) {
      this._renderMessageBubble("assistant", text, true);
      this.messages.push({ role: "assistant", content: text });
      this._persistState();
      this.events.emit("message:received", { role: "assistant", content: text });
    }
    async _startHirePoolSignup(initialRole = null) {
      try {
        await this.hirePoolSignup.start(initialRole || null);
      } catch (error) {
        this._renderErrorBanner(error?.message || "Unable to start HirePool signup.");
      }
    }
    /**
     * Remember which account type a guest described ("I'm a staffing agency",
     * "I'm looking for a job"). Only short, role-like messages count, so a long
     * question that happens to mention a company does not change it.
     */
    _rememberVisitorRole(text) {
      const value = String(text || "").trim();
      if (!value || value.split(/\s+/).length > 8) return;
      if (/^\s*(?:i'?m|i\s+am)\s+looking\s+for\s+(?:a\s+)?(?:new\s+)?(?:job|work|role)\b|^\s*find\s+(?:me\s+)?(?:a\s+)?job\b/i.test(value)) {
        this._visitorSignupRole = "candidate";
        return;
      }
      const parsed = parseHirePoolRoleChoice(value);
      if (parsed) this._visitorSignupRole = parsed === "staffing" ? "consultancy" : parsed;
    }
    async _handleHirePoolSignupConversation(trimmed) {
      if (!this._isGuestSession() || !this._isHirePoolSignupEnabled()) {
        return false;
      }
      this._rememberVisitorRole(trimmed);
      const signupState = this.hirePoolSignup.state;
      const inActiveSignup = ![
        HIREPOOL_SIGNUP_STATES.IDLE,
        HIREPOOL_SIGNUP_STATES.CANCELLED,
        HIREPOOL_SIGNUP_STATES.COMPLETED
      ].includes(signupState);
      if (inActiveSignup) {
        if (/^\s*(?:cancel|stop|quit|never\s*mind|close\s+signup)(?:\s+signup)?\s*[.!?]*\s*$/i.test(trimmed)) {
          await this.hirePoolSignup.cancel();
          this._appendAssistantSignupNotice(
            'Signup has been cancelled. Ask me anything about HirePool or say "Signup" whenever you would like to start again.'
          );
          return true;
        }
        if (signupState === HIREPOOL_SIGNUP_STATES.ROLE_SELECTION || signupState === HIREPOOL_SIGNUP_STATES.SIGNUP_FORM || signupState === HIREPOOL_SIGNUP_STATES.ERROR) {
          const parsedRole = parseHirePoolRoleChoice(trimmed);
          const explicitRolePhrase = /^\s*(?:i(?:'m| am)\s+(?:a|an)\s+|i\s+(?:want|would\s+like|'d\s+like)\s+(?:to\s+(?:join|sign\s*up|register)\s+as\s+)?(?:a|an)\s+|as\s+(?:a|an)\s+|join\s+(?:hirepool\s+)?as\s+(?:a|an)\s+|switch\s+(?:role\s+)?to\s+|change\s+(?:role\s+)?to\s+|select\s+|choose\s+)?(?:candidate|job\s*seeker|company|client|employer|consultancy|agency|staffing(?:\s+agency)?)\b/i.test(trimmed);
          if (parsedRole && (signupState === HIREPOOL_SIGNUP_STATES.ROLE_SELECTION || explicitRolePhrase)) {
            const canonicalRole = parsedRole === "staffing" ? "consultancy" : parsedRole;
            const label = ROLE_DEFINITIONS[canonicalRole]?.label || canonicalRole;
            this._appendAssistantSignupNotice(
              `Great \u2014 I selected the **${label}** role and loaded your HirePool registration form below.`
            );
            try {
              await this.hirePoolSignup.selectRole(parsedRole);
            } catch (error) {
              this._renderErrorBanner(error?.message || "Unable to load the selected signup role.");
            }
            return true;
          }
        }
        if (signupState === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING || signupState === HIREPOOL_SIGNUP_STATES.VERIFICATION_PENDING || signupState === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_IN_PROGRESS || signupState === HIREPOOL_SIGNUP_STATES.VERIFICATION_IN_PROGRESS) {
          if (/\b(?:resend|send\s+again|new\s+(?:link|email|verification))\b/i.test(trimmed)) {
            try {
              await this.hirePoolSignup.resendVerification();
              this._appendAssistantSignupNotice(
                "I requested a fresh verification email. Please check your inbox and click Verify once you have opened the link."
              );
            } catch (error) {
              this._renderErrorBanner(error?.message || "Could not resend verification email.");
            }
            return true;
          }
          if (/^\s*(?:done|verified|i(?:'ve| have)?\s+verified|i\s+clicked|check(?:\s+verification(?:\s+status)?)?|verify|continue)\s*[.!?]*\s*$/i.test(trimmed)) {
            try {
              await this.hirePoolSignup.checkVerificationStatus();
            } catch (error) {
              this._renderErrorBanner(error?.message || "Could not verify email status yet.");
            }
            return true;
          }
        }
        if (/^\s*(?:continue|resume|show\s+(?:signup|form|card)|go\s+back\s+to\s+signup)\s*[.!?]*\s*$/i.test(trimmed)) {
          this._appendAssistantSignupNotice(
            'Here is your active HirePool signup step below\u2014complete the card or type "cancel" to exit.'
          );
          this.hirePoolSignup.resume();
          return true;
        }
        return false;
      }
      const isRoleSpecificTrigger = /^\s*(?:(?:i\s+(?:want|would\s+like|'d\s+like)\s+to\s+)?(?:sign\s*up|signup|register|join)|(?:create\s+(?:an?\s+)?account))\s+(?:hirepool\s+)?as\s+(?:an?\s+)?(?:candidate|job\s*seeker|company|client|employer|consultancy|agency|staffing(?:\s+agency)?)\b/i.test(trimmed) || /^\s*(?:sign\s*up|register)(?:\s+as)?\s+(?:an?\s+)?(?:candidate|company|client|employer|consultancy|agency|staffing)\b/i.test(trimmed);
      if (isRoleSpecificTrigger) {
        const parsedRole = parseHirePoolRoleChoice(trimmed);
        if (parsedRole) {
          const canonicalRole = parsedRole === "staffing" ? "consultancy" : parsedRole;
          const label = ROLE_DEFINITIONS[canonicalRole]?.label || canonicalRole;
          this._appendAssistantSignupNotice(
            `Starting your **${label}** HirePool signup right here in chat.`
          );
          await this._startHirePoolSignup(parsedRole);
          return true;
        }
      }
      const isGeneralSignupTrigger = /^\s*(?:(?:sign\s*up|signup|register|create\s+(?:an?\s+)?account)\s*(?:for\s+hirepool)?|i\s+(?:want|would\s+like|'d\s+like)\s+to\s+(?:sign\s*up|signup|register|join(?:\s+hirepool)?))\s*[.!?]*\s*$/i.test(trimmed);
      if (isGeneralSignupTrigger && this._visitorSignupRole) {
        const role = this._visitorSignupRole;
        const label = ROLE_DEFINITIONS[role]?.label || role;
        this._appendAssistantSignupNotice(`Great! Let's create your **${label}** account right here in chat.`);
        await this._startHirePoolSignup(role);
        return true;
      }
      if (isGeneralSignupTrigger) {
        this._appendAssistantSignupNotice(
          "Let\u2019s get your HirePool account set up! Choose your account type below, or reply with **Candidate**, **Employer / Company**, or **Agency / Consultancy**."
        );
        await this._startHirePoolSignup(null);
        return true;
      }
      return false;
    }
    async _assertDocumentContextAvailable() {
      const knownDocuments = this.storage.get("documents", []);
      if (!Array.isArray(knownDocuments) || knownDocuments.length === 0) return;
      if (!this.activeConversationId) {
        throw new Error("The previous document session is unavailable. Start a new conversation and upload the document again.");
      }
      const currentDocuments = await this.apiClient.getDocuments(this.activeConversationId);
      const availableIds = new Set(currentDocuments.map((document2) => document2.id));
      if (knownDocuments.some((doc) => !availableIds.has(doc.id))) {
        throw new Error("Document context is no longer available for this conversation. Start a new conversation and upload the document again.");
      }
    }
    async sendMessage(text, { displayUserMessage = true, displayText = null } = {}) {
      const trimmed = (text || "").trim();
      if (!trimmed || this.isGenerating) return;
      const shown = typeof displayText === "string" && displayText.trim() ? displayText.trim() : trimmed;
      try {
        await this._assertDocumentContextAvailable();
      } catch (error) {
        this._renderErrorBanner(error.message);
        this.events.emit("error", error);
        return;
      }
      this.textarea.value = "";
      this.textarea.style.height = "auto";
      if (displayUserMessage) {
        this.messages.push({ role: "user", content: shown });
        this._renderMessageBubble("user", shown);
        this._persistState();
      }
      this.events.emit("message:sent", {
        role: "user",
        content: trimmed,
        resumed: !displayUserMessage
      });
      const isHandledBySignup = await this._handleHirePoolSignupConversation(trimmed);
      if (isHandledBySignup) {
        if (this.sendBtn) this.sendBtn.disabled = true;
        return;
      }
      if (this._handleHirePoolLoginTrigger(trimmed)) {
        if (this.sendBtn) this.sendBtn.disabled = false;
        return;
      }
      if (this._profileFormHandlers && this.options?.surface === "app") {
        const formMode = /^\s*(?:please\s+)?(?:complete|finish|fill\s*(?:in|up)?)\s+(?:my\s+|the\s+)?profile\s*[.!]*\s*$/i.test(trimmed) ? "missing" : /^\s*(?:please\s+)?(?:edit|update|change)\s+(?:my\s+|the\s+)?profile(?:\s+details)?\s*[.!]*\s*$/i.test(trimmed) ? "all" : null;
        if (formMode) {
          await this.showProfileForm(formMode);
          return;
        }
      }
      this._setGenerating(true);
      this.abortController = new AbortController();
      const stream = this.options.features?.streaming ?? true;
      const sendAttempt = async (isRetry = false) => {
        let assistantBubbleRow = null;
        let assistantBubbleContent = null;
        let accumulatedText = "";
        const handleError = async (err) => {
          const isSessionDenied = err?.status === 403 || err?.code === "SESSION_ACCESS_DENIED" || String(err?.message || "").toLowerCase().includes("belongs to another user");
          if (!isRetry && isSessionDenied) {
            console.warn("[AI Assistant] Conversation ownership conflict detected; resetting conversation ID and retrying:", err.message);
            this.activeConversationId = null;
            this.storage.clearConversationId();
            if (assistantBubbleRow && assistantBubbleRow.parentNode) {
              assistantBubbleRow.parentNode.removeChild(assistantBubbleRow);
            }
            await sendAttempt(true);
            return;
          }
          if (err?.name === "AbortError") return;
          console.warn("[AI Assistant] Request failed:", err);
          this.events.emit("error", err);
          const hadPartialReply = Boolean(accumulatedText && accumulatedText.trim());
          if (!hadPartialReply && assistantBubbleRow && assistantBubbleRow.parentNode) {
            assistantBubbleRow.parentNode.removeChild(assistantBubbleRow);
          }
          this.streamingIndicator.style.display = "none";
          const info = describeAssistantError(err, {
            surface: this.options?.surface || null,
            online: typeof navigator !== "undefined" ? navigator.onLine : true,
            hadPartialReply
          });
          if (!isRetry && info.recover === "new-conversation") {
            this.activeConversationId = null;
            this.storage.clearConversationId();
            await sendAttempt(true);
            return;
          }
          if (!isRetry && info.recover === "reauthenticate") {
            this.events.emit("auth:refresh-needed");
            await sendAttempt(true);
            return;
          }
          const resend = () => this.sendMessage(trimmed, { displayUserMessage: false });
          if (info.recover === "wait-online" && typeof window !== "undefined") {
            this._renderErrorBanner(info.message, null, { retryLabel: null });
            this._resendWhenOnline(resend);
            return;
          }
          if (info.kind === "signed-out") {
            this._renderErrorBanner(info.message, null, { retryLabel: null, loginUrl: this._getAppLoginUrl() || "http://localhost:5173/login" });
            return;
          }
          this._renderErrorBanner(
            info.message,
            info.retry === "none" ? null : resend,
            { retryLabel: info.retry === "none" ? null : "Try again", retryAfterMs: info.retryAfterMs }
          );
        };
        try {
          const rawContext = this.options.integration && !this.contextOverrideSet ? await this.options.integration.getContext() : this.options.context;
          const contextPayload = this._buildChatContextPayload(rawContext);
          await this.apiClient.sendMessage({
            assistantId: this.options.assistantId || "default",
            message: trimmed,
            context: contextPayload,
            conversationId: typeof this.activeConversationId === "string" && this.activeConversationId.trim().length > 0 ? this.activeConversationId.trim() : void 0,
            history: (displayUserMessage ? this.messages.slice(0, -1) : this.messages).filter((m) => !m.local).slice(-25),
            stream,
            signal: this.abortController.signal,
            onStart: (event) => {
              if (event.conversationId) {
                this.activeConversationId = event.conversationId;
                this._persistState();
              }
            },
            onChunk: (delta) => {
              accumulatedText += delta;
              if (!assistantBubbleRow) {
                this.streamingIndicator.style.display = "none";
                assistantBubbleRow = document.createElement("div");
                assistantBubbleRow.className = "ai-message-row assistant";
                assistantBubbleContent = document.createElement("div");
                assistantBubbleContent.className = "ai-bubble";
                assistantBubbleRow.appendChild(assistantBubbleContent);
                this.messagesList.appendChild(assistantBubbleRow);
              }
              assistantBubbleContent.innerHTML = parseMarkdown(accumulatedText);
              assistantBubbleRow.setAttribute("data-raw-content", accumulatedText);
              this._scrollToBottom();
            },
            onDone: (result) => {
              const rawFinalText = result.text || accumulatedText;
              const finalText = this.options?.assistantId === "hirepool" ? this._stripActionBlocks(rawFinalText) || rawFinalText : rawFinalText;
              const detectedAction = result.action || this._extractAction(rawFinalText);
              if (result?.logout?.loggedOut) {
                if (assistantBubbleRow && assistantBubbleRow.parentNode) {
                  assistantBubbleRow.parentNode.removeChild(assistantBubbleRow);
                }
                this.streamingIndicator.style.display = "none";
                void this._handleHirePoolLogout(result.logout, finalText);
                this.events.emit("message:received", {
                  role: "assistant",
                  content: finalText,
                  logout: result.logout
                });
                return;
              }
              if (result.conversationId) {
                this.activeConversationId = result.conversationId;
              }
              if (!assistantBubbleRow) {
                this.streamingIndicator.style.display = "none";
                this._renderMessageBubble("assistant", finalText, true, detectedAction);
              } else {
                assistantBubbleContent.innerHTML = parseMarkdown(finalText);
                if (detectedAction) {
                  this._renderActionCard(assistantBubbleContent, detectedAction);
                }
              }
              this.messages.push({ role: "assistant", content: finalText, action: detectedAction || void 0 });
              this._persistState();
              this.events.emit("message:received", { role: "assistant", content: finalText, action: detectedAction || void 0 });
            },
            onError: async (err) => {
              await handleError(err);
            }
          });
        } catch (err) {
          await handleError(err);
        }
      };
      try {
        await sendAttempt(false);
      } finally {
        this._setGenerating(false);
        this.abortController = null;
      }
    }
  };

  // config/document-upload.js
  var DOCUMENT_PROCESSING_CONSENT_VERSION = "1";
  var SUPPORTED_EXTENSIONS = Object.freeze([
    ".pdf",
    ".docx",
    ".txt",
    ".text",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".log"
  ]);
  var DEFAULT_DOCUMENT_UPLOAD_SETTINGS = Object.freeze({
    enabled: true,
    // 4 MB: fits Vercel's ~4.5 MB request limit (including upload overhead).
    maxSizeBytes: 4 * 1024 * 1024,
    allowedExtensions: SUPPORTED_EXTENSIONS,
    consent: Object.freeze({
      title: "Before processing this document",
      description: "If you continue, the SDK sends this file to the assistant backend for text extraction. Extracted text is held temporarily with this conversation and may be sent to the configured AI provider when you ask questions.",
      checkboxLabel: "I agree to process this document for this conversation.",
      hostDescription: "If you continue, this file is passed to the host application\u2019s registered file handler. The host may process or transmit it under its own privacy terms. The SDK document backend is not used in this flow.",
      hostCheckboxLabel: "I agree to let the host application process this document."
    })
  });
  function normalizeDocumentUploadSettings(settings = {}) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new TypeError("documentUpload settings must be an object");
    }
    const maxSizeBytes = settings.maxSizeBytes ?? DEFAULT_DOCUMENT_UPLOAD_SETTINGS.maxSizeBytes;
    if (!Number.isInteger(maxSizeBytes) || maxSizeBytes < 1 || maxSizeBytes > 4 * 1024 * 1024) {
      throw new RangeError("documentUpload.maxSizeBytes must be an integer between 1 and 4194304");
    }
    const allowedExtensions = settings.allowedExtensions ?? DEFAULT_DOCUMENT_UPLOAD_SETTINGS.allowedExtensions;
    if (!Array.isArray(allowedExtensions) || allowedExtensions.length === 0 || allowedExtensions.some((extension) => !SUPPORTED_EXTENSIONS.includes(extension))) {
      throw new TypeError(`documentUpload.allowedExtensions must contain supported extensions: ${SUPPORTED_EXTENSIONS.join(", ")}`);
    }
    const consent = settings.consent ?? {};
    if (!consent || typeof consent !== "object" || Array.isArray(consent)) {
      throw new TypeError("documentUpload.consent must be an object");
    }
    const defaults = DEFAULT_DOCUMENT_UPLOAD_SETTINGS.consent;
    const normalizedConsent = {};
    for (const key of Object.keys(defaults)) {
      const value = consent[key] ?? defaults[key];
      if (typeof value !== "string" || value.trim().length === 0 || value.length > 1e3) {
        throw new TypeError(`documentUpload.consent.${key} must be a non-empty string of at most 1000 characters`);
      }
      normalizedConsent[key] = value.trim();
    }
    const enabled = settings.enabled ?? DEFAULT_DOCUMENT_UPLOAD_SETTINGS.enabled;
    if (typeof enabled !== "boolean") {
      throw new TypeError("documentUpload.enabled must be a boolean");
    }
    return {
      enabled,
      maxSizeBytes,
      allowedExtensions: [...new Set(allowedExtensions)],
      consent: normalizedConsent
    };
  }

  // widget/src/api-client.js
  async function readSseEvents(response, onEvent) {
    if (!response.body?.getReader) {
      throw new Error("The server did not return a readable streaming response.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const dispatchFrame = async (frame) => {
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
      if (!data) return;
      let event;
      try {
        event = JSON.parse(data);
      } catch (cause) {
        throw new Error("The server returned a malformed streaming event.", { cause });
      }
      await onEvent(event);
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) {
          await dispatchFrame(frame);
        }
        if (done) break;
      }
      if (buffer.trim()) {
        await dispatchFrame(buffer);
      }
    } catch (error) {
      try {
        await reader.cancel(error);
      } catch {
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
  function createStreamError(event, fallbackMessage) {
    const error = new Error(event.error?.message || fallbackMessage);
    error.code = event.error?.code;
    error.status = event.error?.status;
    return error;
  }
  var AssistantApiClient = class {
    /**
     * @param {string} baseUrl
     */
    constructor(baseUrl = "", options = {}) {
      this.baseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : "";
      this.assistantId = options.assistantId || "default";
      this.getAuthHeaders = options.getAuthHeaders;
      this.credentials = options.credentials || "same-origin";
      this._demoToken = null;
      this._demoTokenExpiresAt = 0;
      this._tokenFetchPromise = null;
      this._authenticatedSession = null;
    }
    setAuthenticatedSession(session) {
      this._authenticatedSession = session && typeof session === "object" ? session : null;
    }
    getAuthenticatedSession() {
      return this._authenticatedSession;
    }
    clearAuthenticatedSession() {
      this._authenticatedSession = null;
    }
    clearDemoToken() {
      this._demoToken = null;
      this._demoTokenExpiresAt = 0;
    }
    /**
     * Acquire a scoped demo token from the backend when running in standalone / demo mode
     * without a host integration auth provider.
     * @returns {Promise<string|null>}
     */
    async _getOrFetchDemoToken() {
      if (this.getAuthHeaders) return null;
      if (this._demoToken && Date.now() < this._demoTokenExpiresAt - 6e4) {
        return this._demoToken;
      }
      if (this._tokenFetchPromise) {
        return this._tokenFetchPromise;
      }
      this._tokenFetchPromise = (async () => {
        try {
          const url = `${this.baseUrl}/api/auth/token`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assistantId: this.assistantId || "default" }),
            credentials: this.credentials
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.token) {
              this._demoToken = data.token;
              this._demoTokenExpiresAt = Date.now() + (data.expiresIn || 3600) * 1e3;
              return this._demoToken;
            }
          }
        } catch {
        } finally {
          this._tokenFetchPromise = null;
        }
        return null;
      })();
      return this._tokenFetchPromise;
    }
    async _headers(json = false) {
      let headers = {};
      if (this._authenticatedSession?.credential) {
        headers = { Authorization: `Bearer ${this._authenticatedSession.credential}` };
      } else if (this.getAuthHeaders) {
        headers = await this.getAuthHeaders() || {};
        if (!headers.Authorization && this._authenticatedSession?.credential) {
          headers.Authorization = `Bearer ${this._authenticatedSession.credential}`;
        }
      } else {
        const token = await this._getOrFetchDemoToken();
        if (token) {
          headers = { Authorization: `Bearer ${token}` };
        }
      }
      return json ? { ...headers, "Content-Type": "application/json" } : headers;
    }
    async _hirePoolResumeRequest(path, { method, body, json = false } = {}) {
      const response = await fetch(`${this.baseUrl}/api/hirepool/resume/${path}`, {
        method,
        headers: await this._headers(json),
        body,
        credentials: this.credentials,
        cache: "no-store"
      });
      let result = null;
      try {
        result = await response.json();
      } catch {
      }
      if (!response.ok) {
        const error = new Error(
          typeof result?.error?.message === "string" ? result.error.message : `Resume upload request failed (HTTP ${response.status}).`
        );
        error.status = response.status;
        error.responseStatus = result?.status;
        error.code = result?.error?.code;
        throw error;
      }
      return result;
    }
    async prepareHirePoolResume(file, conversationId) {
      const body = new FormData();
      body.append("file", file, file.name);
      if (typeof conversationId === "string" && conversationId) {
        body.append("conversationId", conversationId);
      }
      return this._hirePoolResumeRequest("prepare", { method: "POST", body });
    }
    async confirmHirePoolResume(confirmationToken, conversationId) {
      return this._hirePoolResumeRequest("confirm", {
        method: "POST",
        body: JSON.stringify({ confirmationToken, conversationId }),
        json: true
      });
    }
    async cancelHirePoolResume(confirmationToken, conversationId) {
      return this._hirePoolResumeRequest("cancel", {
        method: "POST",
        body: JSON.stringify({ confirmationToken, conversationId }),
        json: true
      });
    }
    /**
     * Fetch public assistant configuration
     */
    async fetchConfig(assistantId = "default") {
      const url = `${this.baseUrl}/api/config/${encodeURIComponent(assistantId)}`;
      const res = await fetch(url, { credentials: this.credentials });
      if (!res.ok) {
        throw new Error(`Failed to load assistant configuration (HTTP ${res.status})`);
      }
      const data = await res.json();
      return data.assistant;
    }
    /**
     * Send a chat message (streaming or non-streaming)
     */
    async sendMessage({
      assistantId = "default",
      message,
      context,
      conversationId,
      history = [],
      stream = true,
      signal,
      onStart,
      onChunk,
      onDone,
      onAction,
      onError
    }) {
      const endpoint = stream ? "/api/chat/stream" : "/api/chat";
      const url = `${this.baseUrl}${endpoint}`;
      const payload = {
        assistantId: assistantId || "default",
        message,
        stream: !!stream
      };
      if (conversationId && typeof conversationId === "string" && conversationId.trim().length > 0) {
        payload.conversationId = conversationId.trim();
      }
      if (Array.isArray(history) && history.length > 0) {
        payload.history = history;
      }
      if (typeof context === "string" && context.trim().length > 0) {
        payload.context = context.trim();
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: await this._headers(true),
          body: JSON.stringify(payload),
          credentials: this.credentials,
          signal
        });
        if (!response.ok) {
          let errMsg = `Server returned HTTP ${response.status}`;
          let errCode = null;
          try {
            const errData = await response.json();
            if (errData?.error) {
              errCode = errData.error.code || null;
              if (Array.isArray(errData.error.details) && errData.error.details.length > 0) {
                const detailMsg = errData.error.details.map((d) => `${d.field}: ${d.message}`).join(", ");
                errMsg = `${errData.error.message} (${detailMsg})`;
              } else if (errData.error.message) {
                errMsg = errData.error.message;
              }
            }
          } catch {
          }
          const error = new Error(errMsg);
          error.status = response.status;
          error.code = errCode;
          throw error;
        }
        if (!stream) {
          const data = await response.json();
          if (onDone) onDone(data);
          return data;
        }
        let accumulatedText = "";
        let activeConversationId = conversationId;
        let actionProposal = null;
        let doneEvent = null;
        await readSseEvents(response, (event) => {
          if (event.type === "start") {
            activeConversationId = event.conversationId || activeConversationId;
            if (onStart) onStart(event);
          } else if (event.type === "chunk") {
            accumulatedText += event.delta || "";
            if (onChunk) onChunk(event.delta || "", accumulatedText);
          } else if (event.type === "action") {
            actionProposal = event.action;
            if (onAction) onAction(event.action);
          } else if (event.type === "done") {
            if (doneEvent) throw new Error("The streaming response contained duplicate completion events.");
            doneEvent = event;
            const result = {
              text: event.text || accumulatedText,
              action: event.action || actionProposal,
              conversationId: event.logout?.loggedOut ? null : event.conversationId || activeConversationId,
              model: event.model,
              logout: event.logout || null,
              connectorResult: event.connectorResult || null
            };
            if (onDone) onDone(result);
          } else if (event.type === "error") {
            throw createStreamError(event, "Streaming request failed.");
          }
        });
        if (!doneEvent) {
          throw new Error("The streaming response ended before the assistant completed the request.");
        }
        return {
          text: doneEvent.text || accumulatedText,
          action: doneEvent.action || actionProposal,
          conversationId: doneEvent.logout?.loggedOut ? null : doneEvent.conversationId || activeConversationId,
          model: doneEvent.model,
          logout: doneEvent.logout || null,
          connectorResult: doneEvent.connectorResult || null
        };
      } catch (err) {
        if (err.name === "AbortError") {
          return;
        }
        if (onError) onError(err);
        throw err;
      }
    }
    /**
     * Summarize text
     */
    async summarize({ text, style = "concise", focus, stream = false, signal, onChunk, onDone, onError }) {
      const url = `${this.baseUrl}/api/summarize`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: await this._headers(true),
          body: JSON.stringify({ text, style, focus, stream }),
          credentials: this.credentials,
          signal
        });
        if (!response.ok) {
          let errMsg = `Summarization failed (HTTP ${response.status})`;
          try {
            const data = await response.json();
            if (data?.error?.message) errMsg = data.error.message;
          } catch {
          }
          throw new Error(errMsg);
        }
        if (!stream) {
          const data = await response.json();
          if (onDone) onDone(data);
          return data;
        }
        let accumulated = "";
        let doneEvent = null;
        await readSseEvents(response, (event) => {
          if (event.type === "chunk") {
            accumulated += event.delta || "";
            if (onChunk) onChunk(event.delta || "", accumulated);
          } else if (event.type === "done") {
            if (doneEvent) throw new Error("The summarization stream contained duplicate completion events.");
            doneEvent = event;
            if (onDone) onDone({ text: event.text || accumulated, model: event.model });
          } else if (event.type === "error") {
            throw createStreamError(event, "Streaming summarization failed.");
          }
        });
        if (!doneEvent) {
          throw new Error("The summarization stream ended before completion.");
        }
        return { text: doneEvent.text || accumulated, model: doneEvent.model };
      } catch (err) {
        if (err.name === "AbortError") return;
        if (onError) onError(err);
        throw err;
      }
    }
    /**
     * Upload a document to the backend and attach it to the conversation session
     * @param {File|Blob} file
     * @param {string} [conversationId]
     * @param {object} [options]
     * @returns {Promise<object>}
     */
    async uploadDocument(file, conversationId, options = {}) {
      if (options.consentAccepted !== true) {
        throw new Error("Explicit document-processing consent is required before upload.");
      }
      const url = `${this.baseUrl}/api/documents/upload`;
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("consentAccepted", "true");
      formData.append("consentVersion", DOCUMENT_PROCESSING_CONSENT_VERSION);
      if (conversationId) {
        formData.append("conversationId", conversationId);
      }
      const uploadAssistantId = options.assistantId || this.assistantId;
      if (uploadAssistantId) {
        formData.append("assistantId", uploadAssistantId);
      }
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...await this._headers(),
          "X-Document-Processing-Consent": "accepted",
          "X-Document-Consent-Version": DOCUMENT_PROCESSING_CONSENT_VERSION
        },
        body: formData,
        credentials: this.credentials,
        signal: options.signal
      });
      if (!res.ok) {
        let errMsg = `Upload failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error?.message) {
            errMsg = data.error.message;
          }
        } catch {
        }
        const error = new Error(errMsg);
        error.status = res.status;
        throw error;
      }
      return await res.json();
    }
    /**
     * Fetch list of documents attached to a session
     * @param {string} conversationId
     */
    async getDocuments(conversationId) {
      if (!conversationId) return [];
      const url = `${this.baseUrl}/api/documents/${encodeURIComponent(conversationId)}?assistantId=${encodeURIComponent(this.assistantId)}`;
      const res = await fetch(url, {
        headers: await this._headers(),
        credentials: this.credentials
      });
      if (!res.ok) {
        let message = `Failed to retrieve documents (HTTP ${res.status})`;
        try {
          const data2 = await res.json();
          if (data2?.error?.message) message = data2.error.message;
        } catch {
        }
        throw new Error(message);
      }
      const data = await res.json();
      return data.documents || [];
    }
    async removeDocument(conversationId, documentId) {
      if (!conversationId || !documentId) return;
      const res = await fetch(
        `${this.baseUrl}/api/documents/${encodeURIComponent(conversationId)}/${encodeURIComponent(documentId)}?assistantId=${encodeURIComponent(this.assistantId)}`,
        {
          method: "DELETE",
          headers: await this._headers(),
          credentials: this.credentials
        }
      );
      if (!res.ok) {
        let message = `Failed to remove document (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error?.message) message = data.error.message;
        } catch {
        }
        throw new Error(message);
      }
    }
    /**
     * Clear session on the server
     */
    async clearSession(conversationId) {
      if (!conversationId) return;
      const res = await fetch(`${this.baseUrl}/api/sessions/clear`, {
        method: "POST",
        headers: await this._headers(true),
        body: JSON.stringify({ conversationId, assistantId: this.assistantId }),
        credentials: this.credentials
      });
      if (!res.ok) {
        let message = `Failed to clear conversation (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error?.message) message = data.error.message;
        } catch {
        }
        throw new Error(message);
      }
    }
    async _hirePoolSignupRequest(path, { method = "POST", body, json = true } = {}) {
      const isGet = method === "GET";
      const headers = json ? { "Content-Type": "application/json" } : {};
      const response = await fetch(`${this.baseUrl}/api/hirepool/signup/${path}`, {
        method,
        headers,
        body: isGet ? void 0 : json && body ? JSON.stringify(body) : body,
        credentials: this.credentials,
        cache: "no-store"
      });
      let result = null;
      try {
        result = await response.json();
      } catch {
      }
      if (!response.ok) {
        const error = new Error(
          typeof result?.error?.message === "string" ? result.error.message : `Signup request failed (HTTP ${response.status}).`
        );
        error.status = response.status;
        error.code = result?.error?.code;
        error.details = result?.error;
        throw error;
      }
      return result;
    }
    async getSignupAgreement(role) {
      return this._hirePoolSignupRequest(`agreement?role=${encodeURIComponent(role)}`, {
        method: "GET",
        json: false
      });
    }
    async signupRegister(data) {
      return this._hirePoolSignupRequest("register", { body: data });
    }
    async resendSignupVerification(data) {
      return this._hirePoolSignupRequest("resend-verification", { body: data });
    }
    async verifySignupEmail(data) {
      return this._hirePoolSignupRequest("verify-email", { body: data });
    }
    async checkSignupVerificationStatus(signupToken) {
      return this._hirePoolSignupRequest("check-verification", { body: { signupToken } });
    }
    async updateSignupProfile(data) {
      return this._hirePoolSignupRequest("profile-update", { body: data });
    }
    async completeSignupProfile(data) {
      return this._hirePoolSignupRequest("complete-profile", { body: data });
    }
    async cancelSignup(signupToken) {
      return this._hirePoolSignupRequest("cancel", { body: { signupToken } });
    }
    async loginHirePoolPassword(email, password) {
      const url = `${this.baseUrl}/api/hirepool/auth/password-login`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ email, password }),
        credentials: this.credentials,
        cache: "no-store"
      });
      let result = null;
      try {
        result = await response.json();
      } catch {
      }
      if (!response.ok) {
        const error = new Error(
          typeof result?.error?.message === "string" ? result.error.message : "Email or password is not correct."
        );
        error.status = response.status;
        error.code = result?.error?.code;
        throw error;
      }
      return result;
    }
    async validateHirePoolSession(credential = null) {
      const cred = credential || this._authenticatedSession?.credential;
      if (!cred) throw new Error("No session credential to validate");
      let response = await fetch(`${this.baseUrl}/api/hirepool/session/validate`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cred}`,
          Accept: "application/json"
        },
        credentials: this.credentials,
        cache: "no-store"
      });
      if (response.status === 404) {
        try {
          const altResponse = await fetch(`${this.baseUrl}/api/hirepool/signup/validate`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${cred}`,
              Accept: "application/json"
            },
            credentials: this.credentials,
            cache: "no-store"
          });
          if (altResponse.ok || altResponse.status !== 404) {
            response = altResponse;
          }
        } catch {
        }
      }
      let result = null;
      try {
        result = await response.json();
      } catch {
      }
      if (!response.ok) {
        const error = new Error(result?.error?.message || `Session validation failed (HTTP ${response.status})`);
        error.status = response.status;
        error.code = result?.error?.code;
        throw error;
      }
      return result;
    }
    async confirmDynamicApiAction(confirmationToken) {
      if (!confirmationToken || !/^[A-Za-z0-9_-]{43}$/.test(confirmationToken)) {
        throw new Error("This action has no valid server confirmation. Ask the assistant to prepare it again.");
      }
      const response = await fetch(`${this.baseUrl}/api/dynamic-api/confirm`, {
        method: "POST",
        headers: await this._headers(true),
        body: JSON.stringify({ confirmationToken }),
        credentials: this.credentials,
        cache: "no-store"
      });
      let result = null;
      try {
        result = await response.json();
      } catch {
      }
      if (!response.ok) {
        const error = new Error(
          typeof result?.error?.message === "string" ? result.error.message : `HirePool could not execute the confirmed action (HTTP ${response.status}).`
        );
        error.status = response.status;
        error.code = result?.error?.code;
        throw error;
      }
      if (result?.status !== "success" || typeof result.message !== "string") {
        throw new Error("HirePool did not return a confirmed successful result.");
      }
      return result;
    }
    async cancelDynamicApiAction(confirmationToken) {
      if (!confirmationToken || typeof confirmationToken !== "string") {
        throw new Error("This action has no valid server confirmation to cancel.");
      }
      const response = await fetch(`${this.baseUrl}/api/dynamic-api/confirm/cancel`, {
        method: "POST",
        headers: await this._headers(true),
        body: JSON.stringify({ confirmationToken }),
        credentials: this.credentials,
        cache: "no-store"
      });
      let result = null;
      try {
        result = await response.json();
      } catch {
      }
      if (!response.ok) {
        const error = new Error(
          typeof result?.error?.message === "string" ? result.error.message : `The pending confirmation could not be revoked (HTTP ${response.status}).`
        );
        error.status = response.status;
        error.code = result?.error?.code;
        throw error;
      }
      return result;
    }
    async revokeHirePoolSession(credential = null) {
      const cred = credential || this._authenticatedSession?.credential;
      if (!cred) return;
      const response = await fetch(`${this.baseUrl}/api/hirepool/session/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cred}` },
        credentials: this.credentials,
        cache: "no-store"
      });
      if (!response.ok && response.status !== 401 && response.status !== 404) {
        throw new Error(`SDK session revocation failed with HTTP ${response.status}`);
      }
    }
    async logoutHirePoolSession(conversationId = null) {
      const body = {};
      if (typeof conversationId === "string" && conversationId.trim()) {
        body.conversationId = conversationId.trim();
      }
      try {
        const response = await fetch(`${this.baseUrl}/api/hirepool/session/logout`, {
          method: "POST",
          headers: await this._headers(true),
          body: JSON.stringify(body),
          credentials: this.credentials,
          cache: "no-store"
        });
        let result = null;
        try {
          result = await response.json();
        } catch {
        }
        if (!response.ok) {
          const error = new Error(result?.error?.message || `Logout failed (HTTP ${response.status})`);
          error.status = response.status;
          error.code = result?.error?.code;
          throw error;
        }
        return result;
      } finally {
        this.clearAuthenticatedSession();
        this.clearDemoToken();
      }
    }
  };

  // widget/src/storage.js
  var MemoryStore = class {
    constructor() {
      this.map = /* @__PURE__ */ new Map();
    }
    getItem(k) {
      return this.map.has(k) ? this.map.get(k) : null;
    }
    setItem(k, v) {
      this.map.set(k, String(v));
    }
    removeItem(k) {
      this.map.delete(k);
    }
    clear() {
      this.map.clear();
    }
  };
  function getSafeStorage(storageType = "session") {
    try {
      const target = storageType === "local" ? window.localStorage : window.sessionStorage;
      const testKey = "__storage_test__";
      target.setItem(testKey, testKey);
      target.removeItem(testKey);
      return target;
    } catch {
      return new MemoryStore();
    }
  }
  var AssistantStorage = class {
    constructor(assistantId = "default", storageType = "session") {
      this.assistantId = assistantId;
      this.prefix = `ai_assistant_${assistantId}_`;
      this.store = getSafeStorage(storageType);
      this.sessionStore = storageType === "session" ? this.store : getSafeStorage("session");
      this.userScope = "guest_";
    }
    setUser(userId = null) {
      this.userScope = userId ? `usr_${String(userId).trim()}_` : "guest_";
    }
    getUserScope() {
      return this.userScope;
    }
    _getKey(key) {
      if (key === "hirepool_session" || key === "is_open") {
        return `${this.prefix}${key}`;
      }
      return `${this.prefix}${this.userScope || ""}${key}`;
    }
    get(key, defaultValue = null) {
      try {
        const fullKey = this._getKey(key);
        let raw = this.store.getItem(fullKey);
        if (raw === null && this.userScope === "guest_") {
          raw = this.store.getItem(this.prefix + key);
        }
        return raw !== null ? JSON.parse(raw) : defaultValue;
      } catch {
        return defaultValue;
      }
    }
    set(key, value) {
      try {
        const fullKey = this._getKey(key);
        this.store.setItem(fullKey, JSON.stringify(value));
      } catch (err) {
        console.warn("AssistantStorage write failed:", err);
      }
    }
    remove(key) {
      try {
        const fullKey = this._getKey(key);
        this.store.removeItem(fullKey);
        if (this.userScope === "guest_") {
          this.store.removeItem(this.prefix + key);
        }
      } catch {
      }
    }
    getConversationId() {
      return this.get("conversation_id", null);
    }
    saveConversationId(conversationId) {
      if (typeof conversationId === "string" && conversationId.trim()) {
        this.set("conversation_id", conversationId.trim());
      } else {
        this.clearConversationId();
      }
    }
    clearConversationId() {
      this.remove("conversation_id");
    }
    /**
     * Persist only non-sensitive HirePool signup UI progress (`role_selection` or
     * `signup_form` step, selected role, consultancy type, and public agreement metadata)
     * in sessionStorage. Passwords, verification links/tokens, and auth credentials
     * are strictly excluded.
     *
     * @param {object|null} progress
     */
    saveSignupProgress(progress) {
      if (!progress || typeof progress !== "object") {
        this.clearSignupProgress();
        return;
      }
      const allowedStates = /* @__PURE__ */ new Set(["role_selection", "signup_form"]);
      const normalizedState = allowedStates.has(progress.state) ? progress.state : null;
      const normalizedRole = ["candidate", "client", "consultancy"].includes(progress.selectedRole) ? progress.selectedRole : null;
      if (!normalizedState) {
        this.clearSignupProgress();
        return;
      }
      const agreement = progress.agreement && typeof progress.agreement === "object" ? {
        id: progress.agreement.id || progress.agreement.version_id || null,
        version: progress.agreement.version || null,
        role: progress.agreement.role || normalizedRole || null,
        title: progress.agreement.title || null,
        summary: progress.agreement.summary || null,
        effectiveDate: progress.agreement.effectiveDate || progress.agreement.effective_date || null
      } : null;
      const safePayload = {
        state: normalizedState,
        selectedRole: normalizedRole,
        consultancyType: typeof progress.consultancyType === "string" ? progress.consultancyType.slice(0, 64) : null,
        agreement
      };
      try {
        const fullKey = this._getKey("hirepool_signup_progress");
        this.sessionStore.setItem(fullKey, JSON.stringify(safePayload));
      } catch (err) {
        console.warn("AssistantStorage signup progress write failed:", err);
      }
    }
    getSignupProgress() {
      try {
        const fullKey = this._getKey("hirepool_signup_progress");
        const raw = this.sessionStore.getItem(fullKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !["role_selection", "signup_form"].includes(parsed.state)) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }
    clearSignupProgress() {
      try {
        const fullKey = this._getKey("hirepool_signup_progress");
        this.sessionStore.removeItem(fullKey);
      } catch {
      }
    }
    clear() {
      try {
        this.clearConversationId();
        this.clearSignupProgress();
        this.remove("messages");
        this.remove("documents");
        this.remove("is_open");
      } catch {
      }
    }
  };

  // widget/src/integration.js
  var MAX_CONTEXT_LENGTH = 3e4;
  function serializeContext(context) {
    if (context === null || context === void 0 || context === "") {
      return null;
    }
    if (typeof context === "string") {
      const value2 = context.trim();
      if (value2.length > MAX_CONTEXT_LENGTH) {
        throw new RangeError(`Application context cannot exceed ${MAX_CONTEXT_LENGTH} characters`);
      }
      return value2 || null;
    }
    if (typeof context !== "object" || Array.isArray(context)) {
      throw new TypeError("Application context must be a string or a plain object");
    }
    const value = JSON.stringify(context);
    if (value.length > MAX_CONTEXT_LENGTH) {
      throw new RangeError(`Application context cannot exceed ${MAX_CONTEXT_LENGTH} characters`);
    }
    return value;
  }
  var HostIntegrationAdapter = class {
    constructor(config) {
      if (!config || typeof config !== "object" || config.version !== 1) {
        throw new TypeError("Host integration must use contract version 1");
      }
      const application = config.application;
      if (!application || typeof application.id !== "string" || !application.id.trim() || typeof application.name !== "string" || !application.name.trim()) {
        throw new TypeError("Host integration requires an application ID and name");
      }
      if (application.id.length > 100 || application.name.length > 120) {
        throw new RangeError("Host application ID and name exceed their length limits");
      }
      if (config.contextProvider !== void 0 && typeof config.contextProvider !== "function") {
        throw new TypeError("contextProvider must be a function");
      }
      if (config.getAuthHeaders !== void 0 && typeof config.getAuthHeaders !== "function") {
        throw new TypeError("getAuthHeaders must be a function");
      }
      if (config.getSessionScope !== void 0 && typeof config.getSessionScope !== "function") {
        throw new TypeError("getSessionScope must be a function");
      }
      if (config.canExecuteAction !== void 0 && typeof config.canExecuteAction !== "function") {
        throw new TypeError("canExecuteAction must be a function");
      }
      if (config.executeAction !== void 0 && typeof config.executeAction !== "function") {
        throw new TypeError("executeAction must be a function");
      }
      for (const key of ["getIdentity", "getPermissions", "getAvailableActions", "onActionProposed", "onActionResult", "onError", "subscribeContext"]) {
        if (config[key] !== void 0 && typeof config[key] !== "function") {
          throw new TypeError(`${key} must be a function`);
        }
      }
      const credentials = config.credentials || "same-origin";
      if (!["omit", "same-origin", "include"].includes(credentials)) {
        throw new TypeError("credentials must be omit, same-origin, or include");
      }
      this.application = {
        id: application.id.trim(),
        name: application.name.trim()
      };
      this.contextProvider = config.contextProvider;
      this.authHeadersProvider = config.getAuthHeaders;
      this.sessionScopeProvider = config.getSessionScope;
      this.permissionAdapter = config.canExecuteAction;
      this.actionExecutor = config.executeAction;
      this.identityProvider = config.getIdentity;
      this.permissionsProvider = config.getPermissions;
      this.availableActionsProvider = config.getAvailableActions;
      this.actionProposalListener = config.onActionProposed;
      this.actionResultListener = config.onActionResult;
      this.errorListener = config.onError;
      this.contextSubscription = config.subscribeContext;
      this.credentials = credentials;
    }
    async getContext() {
      const provided = this.contextProvider ? await this.contextProvider() : {};
      if (provided === null || provided === void 0) {
        return serializeContext({ application: this.application });
      }
      if (typeof provided !== "object" || Array.isArray(provided)) {
        throw new TypeError("contextProvider must return an object or null");
      }
      return serializeContext({
        ...provided,
        application: this.application
      });
    }
    async getAuthHeaders() {
      const headers = this.authHeadersProvider ? await this.authHeadersProvider() : {};
      if (headers === null || headers === void 0) {
        return {};
      }
      if (typeof headers !== "object" || Array.isArray(headers)) {
        throw new TypeError("getAuthHeaders must return an object of header values");
      }
      const normalized = {};
      for (const [name, value] of Object.entries(headers)) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof value !== "string" || /[\r\n]/.test(value)) {
          throw new TypeError(`Invalid host authentication header: ${name}`);
        }
        normalized[name] = value;
      }
      return normalized;
    }
    async getSessionScope() {
      const scope = this.sessionScopeProvider ? await this.sessionScopeProvider() : null;
      if (scope === null || scope === void 0 || scope === "") return null;
      if (typeof scope !== "string" || scope.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(scope)) {
        throw new TypeError("getSessionScope must return a short opaque identifier or null");
      }
      return scope;
    }
    async getIdentity() {
      const identity = this.identityProvider ? await this.identityProvider() : null;
      if (identity === null || identity === void 0) return null;
      if (typeof identity !== "object" || Array.isArray(identity)) {
        throw new TypeError("getIdentity must return an object or null");
      }
      return identity;
    }
    async getPermissions() {
      const permissions = this.permissionsProvider ? await this.permissionsProvider() : [];
      if (!Array.isArray(permissions) || permissions.some((permission) => typeof permission !== "string")) {
        throw new TypeError("getPermissions must return an array of strings");
      }
      return [...permissions];
    }
    async getAvailableActions() {
      const actions = this.availableActionsProvider ? await this.availableActionsProvider() : [];
      if (!Array.isArray(actions) || actions.some((action) => !action || typeof action !== "object" || typeof action.id !== "string")) {
        throw new TypeError("getAvailableActions must return an array of action objects with string IDs");
      }
      return actions;
    }
    subscribeToContextChanges(callback) {
      if (!this.contextSubscription) return () => {
      };
      const unsubscribe = this.contextSubscription(callback);
      if (typeof unsubscribe !== "function") {
        throw new TypeError("subscribeContext must return an unsubscribe function");
      }
      return unsubscribe;
    }
    notifyActionProposed(action) {
      this.actionProposalListener?.(action);
    }
    notifyActionResult(result) {
      this.actionResultListener?.(result);
    }
    notifyError(error) {
      this.errorListener?.(error);
    }
    async executeHostAction(actionId, parameters, confirmationToken) {
      if (!this.actionExecutor) {
        throw new Error("No host action executor is configured");
      }
      if (this.permissionAdapter && !await this.permissionAdapter(actionId, parameters)) {
        throw new Error("The host application denied permission to execute this action");
      }
      return this.actionExecutor({
        application: this.application,
        actionId,
        parameters,
        ...confirmationToken ? { confirmationToken } : {}
      });
    }
  };

  // widget/src/styles.css
  var styles_default = `:host {\r
  all: initial;\r
  display: block;\r
  font-family: var(--font-sans), 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\r
  font-size: 14px;\r
  line-height: 1.5;\r
  color: #1f2937;\r
  z-index: 2147483640;\r
}\r
\r
*, *::before, *::after {\r
  box-sizing: border-box;\r
}\r
\r
.ai-widget-container {\r
  --ai-primary: #a3e635;\r
  --ai-primary-hover: #8ee055;\r
  --ai-primary-contrast: #030712;\r
  --ai-bg: #ffffff;\r
  --ai-surface: #f8fafc;\r
  --ai-surface-alt: #f1f5f9;\r
  --ai-border: #e2e8f0;\r
  --ai-text: #090d16;\r
  --ai-text-muted: #64748b;\r
  --ai-user-bubble: #a3e635;\r
  --ai-user-text: #030712;\r
  --ai-bot-bubble: #f1f5f9;\r
  --ai-bot-text: #090d16;\r
  --ai-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);\r
  --ai-radius: 16px;\r
  --ai-radius-sm: 8px;\r
\r
  position: fixed;\r
  z-index: 2147483647;\r
  pointer-events: none;\r
}\r
\r
/* Dark Theme overrides */\r
.ai-widget-container[data-theme="dark"] {\r
  --ai-bg: #030712;\r
  --ai-surface: #090d16;\r
  --ai-surface-alt: #0f172a;\r
  --ai-border: #1e293b;\r
  --ai-text: #f8fafc;\r
  --ai-text-muted: #94a3b8;\r
  --ai-user-bubble: #a3e635;\r
  --ai-user-text: #030712;\r
  --ai-bot-bubble: #0f172a;\r
  --ai-bot-text: #f8fafc;\r
  --ai-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6);\r
}\r
\r
/* Auto Theme Media Query */\r
@media (prefers-color-scheme: dark) {\r
  .ai-widget-container[data-theme="auto"] {\r
    --ai-bg: #030712;\r
    --ai-surface: #090d16;\r
    --ai-surface-alt: #0f172a;\r
    --ai-border: #1e293b;\r
    --ai-text: #f8fafc;\r
    --ai-text-muted: #94a3b8;\r
    --ai-user-bubble: #a3e635;\r
    --ai-user-text: #030712;\r
    --ai-bot-bubble: #0f172a;\r
    --ai-bot-text: #f8fafc;\r
    --ai-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6);\r
  }\r
}\r
\r
/* Launcher Positions */\r
.pos-bottom-right { bottom: 20px; right: 20px; }\r
.pos-bottom-left { bottom: 20px; left: 20px; }\r
.pos-top-right { top: 20px; right: 20px; }\r
.pos-top-left { top: 20px; left: 20px; }\r
\r
/* Floating Launcher Button */\r
.ai-launcher-btn {\r
  pointer-events: auto;\r
  position: relative;\r
  width: 56px;\r
  height: 56px;\r
  padding: 0;\r
  border-radius: 50%;\r
  background: #0b0b0b;\r
  color: var(--ai-primary);\r
  border: 1.5px solid var(--ai-primary);\r
  cursor: pointer;\r
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;\r
  outline: none;\r
}\r
\r
.ai-launcher-btn:hover {\r
  transform: scale(1.06);\r
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ai-primary) 18%, transparent), 0 8px 24px rgba(0, 0, 0, 0.4);\r
}\r
\r
.ai-launcher-btn:active {\r
  transform: scale(0.96);\r
}\r
\r
.ai-launcher-btn:focus-visible {\r
  outline: 3px solid var(--ai-primary);\r
  outline-offset: 3px;\r
}\r
\r
.ai-launcher-btn .icon-chat,\r
.ai-launcher-btn .icon-close {\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
}\r
\r
.ai-launcher-btn svg {\r
  width: 26px;\r
  height: 26px;\r
  transition: transform 0.25s ease, opacity 0.2s ease;\r
}\r
\r
.ai-launcher-btn .icon-chat svg {\r
  fill: currentColor;\r
}\r
\r
.ai-launcher-btn:hover .icon-chat svg {\r
  transform: translate(2px, -2px);\r
}\r
\r
.ai-launcher-btn .icon-close svg {\r
  width: 22px;\r
  height: 22px;\r
  fill: none;\r
}\r
\r
.ai-launcher-btn:hover .icon-close svg {\r
  transform: rotate(90deg);\r
}\r
\r
.ai-launcher-btn .icon-close {\r
  display: none;\r
}\r
\r
.ai-widget-container.is-open .ai-launcher-btn .icon-chat {\r
  display: none;\r
}\r
\r
.ai-widget-container.is-open .ai-launcher-btn .icon-close {\r
  display: flex;\r
}\r
\r
/* ".ai" brand badge (from the hirepool.ai wordmark) */\r
.ai-launcher-badge {\r
  position: absolute;\r
  right: -8px;\r
  bottom: -4px;\r
  min-width: 26px;\r
  height: 17px;\r
  padding: 0 6px;\r
  border-radius: 9px;\r
  background: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
  border: 2px solid var(--ai-bg);\r
  font-size: 11px;\r
  font-weight: 700;\r
  line-height: 13px;\r
  letter-spacing: 0.2px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  pointer-events: none;\r
  transition: transform 0.25s ease, opacity 0.2s ease;\r
}\r
\r
.ai-launcher-btn:hover .ai-launcher-badge {\r
  transform: scale(1.05);\r
}\r
\r
.ai-widget-container.is-open .ai-launcher-badge {\r
  opacity: 0;\r
  transform: scale(0.6);\r
}\r
\r
/* Phone greeting bubble (website bot) */\r
.ai-teaser {\r
  pointer-events: auto;\r
  position: absolute;\r
  bottom: 70px;\r
  right: 0;\r
  width: max-content;\r
  max-width: min(260px, calc(100vw - 40px));\r
  display: flex;\r
  align-items: flex-start;\r
  gap: 4px;\r
  padding: 10px 6px 10px 14px;\r
  background: var(--ai-bg);\r
  color: var(--ai-text);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 14px 14px 4px 14px;\r
  box-shadow: var(--ai-shadow);\r
  animation: ai-teaser-in 0.25s ease;\r
}\r
\r
.pos-bottom-left .ai-teaser { right: auto; left: 0; border-radius: 14px 14px 14px 4px; }\r
.pos-top-right .ai-teaser,\r
.pos-top-left .ai-teaser { bottom: auto; top: 70px; }\r
\r
.ai-teaser-text {\r
  all: unset;\r
  cursor: pointer;\r
  font-size: 13.5px;\r
  line-height: 1.45;\r
  color: var(--ai-text);\r
}\r
\r
.ai-teaser-text:focus-visible,\r
.ai-teaser-close:focus-visible {\r
  outline: 2px solid var(--ai-primary);\r
  outline-offset: 2px;\r
  border-radius: 4px;\r
}\r
\r
.ai-teaser-close {\r
  all: unset;\r
  cursor: pointer;\r
  flex-shrink: 0;\r
  width: 22px;\r
  height: 22px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  color: var(--ai-text-muted);\r
  border-radius: 50%;\r
}\r
\r
.ai-teaser-close svg {\r
  width: 12px;\r
  height: 12px;\r
}\r
\r
.ai-widget-container.is-open .ai-teaser {\r
  display: none;\r
}\r
\r
@keyframes ai-teaser-in {\r
  from { opacity: 0; transform: translateY(6px); }\r
  to { opacity: 1; transform: translateY(0); }\r
}\r
\r
.ai-handoff-btn {\r
  margin-top: 2px;\r
}\r
\r
/* Chat Panel */\r
.ai-panel {\r
  pointer-events: auto;\r
  position: absolute;\r
  width: 380px;\r
  height: 560px;\r
  max-width: calc(100vw - 32px);\r
  max-height: calc(100vh - 100px);\r
  background: var(--ai-bg);\r
  border: 1px solid var(--ai-border);\r
  border-radius: var(--ai-radius);\r
  box-shadow: var(--ai-shadow);\r
  display: flex;\r
  flex-direction: column;\r
  overflow: hidden;\r
  opacity: 0;\r
  transform: scale(0.95) translateY(10px);\r
  transform-origin: bottom right;\r
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);\r
  visibility: hidden;\r
}\r
\r
/* Position-based origins and anchors */\r
.pos-bottom-right .ai-panel { bottom: 70px; right: 0; transform-origin: bottom right; }\r
.pos-bottom-left .ai-panel { bottom: 70px; left: 0; transform-origin: bottom left; }\r
.pos-top-right .ai-panel { top: 70px; right: 0; transform-origin: top right; }\r
.pos-top-left .ai-panel { top: 70px; left: 0; transform-origin: top left; }\r
\r
.ai-widget-container.is-open .ai-panel {\r
  opacity: 1;\r
  transform: scale(1) translateY(0);\r
  visibility: visible;\r
}\r
\r
/* Header */\r
.ai-header {\r
  padding: 12px 16px;\r
  background: var(--ai-bg);\r
  border-bottom: 1px solid var(--ai-border);\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  flex-shrink: 0;\r
  user-select: none;\r
}\r
\r
.ai-header-info {\r
  display: flex;\r
  align-items: center;\r
  gap: 10px;\r
}\r
\r
.ai-avatar {\r
  width: 32px;\r
  height: 32px;\r
  border-radius: 50%;\r
  background: #0b0b0b;\r
  color: var(--ai-primary);\r
  border: 1.5px solid var(--ai-primary);\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  font-weight: 600;\r
  font-size: 14px;\r
  overflow: hidden;\r
  flex-shrink: 0;\r
}\r
\r
.ai-avatar-icon {\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
}\r
\r
.ai-avatar-icon svg {\r
  width: 17px;\r
  height: 17px;\r
  fill: currentColor;\r
}\r
\r
.ai-avatar img {\r
  width: 100%;\r
  height: 100%;\r
  object-fit: cover;\r
}\r
\r
.ai-header-titles {\r
  display: flex;\r
  flex-direction: column;\r
}\r
\r
.ai-title {\r
  font-size: 14px;\r
  font-weight: 600;\r
  color: var(--ai-text);\r
  line-height: 1.2;\r
}\r
\r
.ai-status {\r
  font-size: 11px;\r
  color: var(--ai-text-muted);\r
  display: flex;\r
  align-items: center;\r
  gap: 4px;\r
}\r
\r
.ai-status-dot {\r
  width: 7px;\r
  height: 7px;\r
  border-radius: 50%;\r
  background: #10b981;\r
}\r
\r
.ai-status-dot.busy {\r
  background: #f59e0b;\r
  animation: pulse-dot 1.5s infinite;\r
}\r
\r
@keyframes pulse-dot {\r
  0%, 100% { opacity: 1; transform: scale(1); }\r
  50% { opacity: 0.5; transform: scale(1.2); }\r
}\r
\r
.ai-header-actions {\r
  display: flex;\r
  align-items: center;\r
  gap: 4px;\r
}\r
\r
.ai-icon-btn {\r
  background: transparent;\r
  border: none;\r
  color: var(--ai-text-muted);\r
  width: 30px;\r
  height: 30px;\r
  border-radius: var(--ai-radius-sm);\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  cursor: pointer;\r
  transition: background-color 0.15s ease, color 0.15s ease;\r
  outline: none;\r
}\r
\r
.ai-icon-btn:hover {\r
  background: var(--ai-surface-alt);\r
  color: var(--ai-text);\r
}\r
\r
.ai-icon-btn:focus-visible {\r
  outline: 2px solid var(--ai-primary);\r
}\r
\r
.ai-icon-btn svg {\r
  width: 16px;\r
  height: 16px;\r
  fill: currentColor;\r
}\r
\r
/* Conversation Body */\r
.ai-body {\r
  flex: 1;\r
  min-height: 0;\r
  overflow-y: auto;\r
  overflow-x: hidden;\r
  padding: 16px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 14px;\r
  background: var(--ai-bg);\r
  scroll-behavior: smooth;\r
}\r
\r
.ai-body::-webkit-scrollbar {\r
  width: 5px;\r
}\r
\r
.ai-body::-webkit-scrollbar-thumb {\r
  background: var(--ai-border);\r
  border-radius: 4px;\r
}\r
\r
/* Welcome Box */\r
.ai-welcome-box {\r
  background: var(--ai-surface);\r
  border: 1px solid var(--ai-border);\r
  border-radius: var(--ai-radius-sm);\r
  padding: 14px;\r
  margin-bottom: 4px;\r
}\r
\r
.ai-welcome-greeting {\r
  font-size: 13.5px;\r
  color: var(--ai-text);\r
  margin-bottom: 12px;\r
  line-height: 1.5;\r
}\r
\r
.ai-suggested-prompts-label {\r
  font-size: 11px;\r
  font-weight: 600;\r
  text-transform: uppercase;\r
  letter-spacing: 0.5px;\r
  color: var(--ai-text-muted);\r
  margin-bottom: 8px;\r
}\r
\r
.ai-prompts-list {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 6px;\r
}\r
\r
.ai-prompt-pill {\r
  background: var(--ai-bg);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 14px;\r
  padding: 5px 10px;\r
  font-size: 12px;\r
  color: var(--ai-text);\r
  cursor: pointer;\r
  transition: all 0.15s ease;\r
  text-align: left;\r
  outline: none;\r
}\r
\r
.ai-prompt-pill:hover {\r
  background: var(--ai-primary);\r
  border-color: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
  transform: translateY(-1px);\r
}\r
\r
.ai-prompt-pill:focus-visible {\r
  outline: 2px solid var(--ai-primary);\r
}\r
\r
/* Message Rows */\r
.ai-message-row {\r
  display: flex;\r
  flex-direction: column;\r
  max-width: 88%;\r
  min-width: 0;\r
  animation: fadeInMsg 0.2s ease;\r
}\r
\r
.ai-message-row.ai-signup-row {\r
  width: 100%;\r
  max-width: 100%;\r
  min-width: 0;\r
}\r
\r
@keyframes fadeInMsg {\r
  from { opacity: 0; transform: translateY(4px); }\r
  to { opacity: 1; transform: translateY(0); }\r
}\r
\r
.ai-message-row.user {\r
  align-self: flex-end;\r
}\r
\r
.ai-message-row.assistant {\r
  align-self: flex-start;\r
}\r
\r
.ai-bubble {\r
  padding: 10px 14px;\r
  border-radius: 14px;\r
  font-size: 13.5px;\r
  line-height: 1.55;\r
  word-break: break-word;\r
}\r
\r
.ai-message-row.user .ai-bubble {\r
  background: var(--ai-user-bubble);\r
  color: var(--ai-user-text);\r
  border-bottom-right-radius: 4px;\r
}\r
\r
.ai-message-row.assistant .ai-bubble {\r
  background: var(--ai-bot-bubble);\r
  color: var(--ai-bot-text);\r
  border-bottom-left-radius: 4px;\r
  border: 1px solid var(--ai-border);\r
}\r
\r
/* Assistant Bubble Markdown elements */\r
.ai-bubble p {\r
  margin: 0 0 8px 0;\r
}\r
\r
/* The Markdown renderer leaves stray breaks between list items and empty paragraphs. */\r
.ai-bubble ul > br,\r
.ai-bubble ol > br,\r
.ai-bubble p:empty {\r
  display: none;\r
}\r
.ai-bubble p:last-child {\r
  margin-bottom: 0;\r
}\r
\r
.ai-bubble h2, .ai-bubble h3, .ai-bubble h4 {\r
  margin: 10px 0 6px 0;\r
  color: var(--ai-text);\r
  font-weight: 600;\r
}\r
.ai-bubble h2 { font-size: 15px; }\r
.ai-bubble h3 { font-size: 14px; }\r
.ai-bubble h4 { font-size: 13.5px; }\r
\r
.ai-bubble ul, .ai-bubble ol {\r
  margin: 6px 0 8px 18px;\r
  padding: 0;\r
}\r
\r
.ai-bubble li {\r
  margin-bottom: 4px;\r
}\r
\r
.ai-bubble blockquote {\r
  margin: 8px 0;\r
  padding: 4px 10px;\r
  border-left: 3px solid var(--ai-primary);\r
  background: var(--ai-surface);\r
  color: var(--ai-text-muted);\r
  font-style: italic;\r
}\r
\r
.ai-bubble a {\r
  color: var(--ai-primary);\r
  text-decoration: underline;\r
}\r
\r
.ai-bubble code.inline-code {\r
  background: rgba(0, 0, 0, 0.08);\r
  padding: 2px 5px;\r
  border-radius: 4px;\r
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\r
  font-size: 12px;\r
}\r
\r
[data-theme="dark"] .ai-bubble code.inline-code {\r
  background: rgba(255, 255, 255, 0.12);\r
}\r
\r
/* Code block container */\r
.code-block-wrapper {\r
  margin: 8px 0;\r
  border-radius: 6px;\r
  overflow: hidden;\r
  background: #1e1e24;\r
  color: #f8f8f2;\r
  font-size: 12px;\r
}\r
\r
.code-header {\r
  display: flex;\r
  justify-content: space-between;\r
  align-items: center;\r
  padding: 4px 10px;\r
  background: #282a36;\r
  color: #a0a0a0;\r
  font-size: 11px;\r
}\r
\r
.code-lang {\r
  text-transform: uppercase;\r
  font-weight: 600;\r
}\r
\r
.copy-code-btn {\r
  background: transparent;\r
  border: 1px solid #44475a;\r
  color: #f8f8f2;\r
  border-radius: 4px;\r
  padding: 2px 6px;\r
  font-size: 10px;\r
  cursor: pointer;\r
}\r
\r
.copy-code-btn:hover {\r
  background: #44475a;\r
}\r
\r
.code-block-wrapper pre {\r
  margin: 0;\r
  padding: 10px;\r
  overflow-x: auto;\r
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\r
}\r
\r
/* Message Meta & Action Bar */\r
.ai-message-actions {\r
  display: flex;\r
  align-items: center;\r
  gap: 8px;\r
  margin-top: 4px;\r
  font-size: 11px;\r
  color: var(--ai-text-muted);\r
}\r
\r
.ai-msg-action-btn {\r
  background: transparent;\r
  border: none;\r
  color: var(--ai-text-muted);\r
  font-size: 11px;\r
  cursor: pointer;\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 3px;\r
  padding: 2px 6px;\r
  border-radius: 4px;\r
  transition: all 0.15s ease;\r
  outline: none;\r
}\r
\r
.ai-msg-action-btn:hover {\r
  background: var(--ai-surface-alt);\r
  color: var(--ai-text);\r
}\r
\r
.ai-msg-action-btn:focus-visible {\r
  outline: 2px solid var(--ai-primary);\r
}\r
\r
/* Typing / Streaming Indicator */\r
.ai-streaming-indicator {\r
  display: flex;\r
  align-items: center;\r
  gap: 4px;\r
  padding: 8px 12px;\r
  border-radius: 12px;\r
  background: var(--ai-bot-bubble);\r
  border: 1px solid var(--ai-border);\r
  width: fit-content;\r
  align-self: flex-start;\r
}\r
\r
.ai-typing-dot {\r
  width: 6px;\r
  height: 6px;\r
  border-radius: 50%;\r
  background: var(--ai-text-muted);\r
  animation: typingBounce 1.4s infinite ease-in-out both;\r
}\r
\r
.ai-typing-dot:nth-child(1) { animation-delay: -0.32s; }\r
.ai-typing-dot:nth-child(2) { animation-delay: -0.16s; }\r
\r
@keyframes typingBounce {\r
  0%, 80%, 100% { transform: scale(0); opacity: 0.4; }\r
  40% { transform: scale(1); opacity: 1; }\r
}\r
\r
/* Error Banner */\r
.ai-error-banner {\r
  background: #fef2f2;\r
  border: 1px solid #fecaca;\r
  color: #991b1b;\r
  border-radius: var(--ai-radius-sm);\r
  padding: 8px 12px;\r
  font-size: 12px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 8px;\r
  margin: 4px 0;\r
}\r
\r
[data-theme="dark"] .ai-error-banner {\r
  background: #450a0a;\r
  border-color: #7f1d1d;\r
  color: #fca5a5;\r
}\r
\r
.ai-error-retry-btn {\r
  background: #dc2626;\r
  color: white;\r
  border: none;\r
  padding: 3px 8px;\r
  border-radius: 4px;\r
  font-size: 11px;\r
  font-weight: 500;\r
  cursor: pointer;\r
}\r
\r
/* Footer / Input Area */\r
.ai-footer {\r
  padding: 12px 14px;\r
  background: var(--ai-bg);\r
  border-top: 1px solid var(--ai-border);\r
  flex-shrink: 0;\r
}\r
\r
.ai-input-form {\r
  display: flex;\r
  align-items: flex-end;\r
  gap: 8px;\r
  background: var(--ai-surface);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 18px;\r
  padding: 4px 6px 4px 12px;\r
  transition: border-color 0.2s ease, box-shadow 0.2s ease;\r
}\r
\r
.ai-input-form:focus-within {\r
  border-color: var(--ai-primary);\r
  box-shadow: 0 0 0 2px rgba(163, 230, 53, 0.25);\r
}\r
\r
.ai-textarea {\r
  flex: 1;\r
  background: transparent;\r
  border: none;\r
  outline: none;\r
  resize: none;\r
  padding: 6px 0;\r
  max-height: 120px;\r
  min-height: 24px;\r
  font-family: inherit;\r
  font-size: 13.5px;\r
  line-height: 1.4;\r
  color: var(--ai-text);\r
}\r
\r
.ai-textarea::placeholder {\r
  color: var(--ai-text-muted);\r
}\r
\r
.ai-send-btn, .ai-stop-btn {\r
  width: 32px;\r
  height: 32px;\r
  border-radius: 50%;\r
  background: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
  border: none;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  cursor: pointer;\r
  flex-shrink: 0;\r
  transition: background-color 0.15s ease, transform 0.1s ease;\r
  outline: none;\r
}\r
\r
.ai-send-btn:hover, .ai-stop-btn:hover {\r
  background: var(--ai-primary-hover);\r
}\r
\r
.ai-send-btn:disabled {\r
  background: var(--ai-border);\r
  color: var(--ai-text-muted);\r
  cursor: not-allowed;\r
}\r
\r
.ai-stop-btn {\r
  background: #ef4444;\r
}\r
\r
.ai-stop-btn:hover {\r
  background: #dc2626;\r
}\r
\r
.ai-send-btn svg, .ai-stop-btn svg {\r
  width: 15px;\r
  height: 15px;\r
  fill: currentColor;\r
}\r
\r
.ai-footer-note {\r
  font-size: 10.5px;\r
  color: var(--ai-text-muted);\r
  text-align: center;\r
  margin-top: 6px;\r
}\r
\r
/* Reduced Motion */\r
@media (prefers-reduced-motion: reduce) {\r
  .ai-launcher-btn, .ai-launcher-btn svg, .ai-launcher-badge, .ai-teaser, .ai-panel, .ai-message-row, .ai-prompt-pill {\r
    transition: none !important;\r
    animation: none !important;\r
  }\r
}\r
\r
/* Mobile & Small Screen Adaptability */\r
@media (max-width: 640px) {\r
  .ai-panel {\r
    width: 100vw !important;\r
    height: 100% !important;\r
    max-width: 100vw !important;\r
    max-height: 100vh !important;\r
    top: 0 !important;\r
    left: 0 !important;\r
    right: 0 !important;\r
    bottom: 0 !important;\r
    border-radius: 0 !important;\r
    position: fixed !important;\r
  }\r
\r
  .pos-bottom-right, .pos-bottom-left, .pos-top-right, .pos-top-left {\r
    bottom: 16px;\r
    right: 16px;\r
    left: auto;\r
    top: auto;\r
  }\r
}\r
\r
@media (max-width: 480px) {\r
  .ai-body {\r
    padding: 12px;\r
  }\r
\r
  .ai-form-row {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
}\r
\r
/* Action Proposal Card */\r
.ai-action-card {\r
  margin-top: 10px;\r
  width: 100%;\r
  max-width: 100%;\r
  min-width: 0;\r
  box-sizing: border-box;\r
  background: var(--ai-surface);\r
  border: 1px solid var(--ai-border);\r
  border-radius: var(--ai-radius-sm);\r
  padding: 12px;\r
  font-size: 12.5px;\r
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);\r
  display: flex;\r
  flex-direction: column;\r
  gap: 8px;\r
}\r
\r
[data-theme="dark"] .ai-action-card {\r
  background: rgba(255, 255, 255, 0.04);\r
  border-color: rgba(255, 255, 255, 0.12);\r
}\r
\r
.ai-action-header {\r
  display: flex;\r
  align-items: center;\r
  gap: 8px;\r
}\r
\r
.ai-action-badge {\r
  background: rgba(79, 70, 229, 0.12);\r
  color: var(--ai-primary);\r
  font-size: 10.5px;\r
  font-weight: 600;\r
  padding: 2px 7px;\r
  border-radius: 10px;\r
  text-transform: uppercase;\r
  letter-spacing: 0.5px;\r
}\r
\r
[data-theme="dark"] .ai-action-badge {\r
  background: rgba(99, 102, 241, 0.25);\r
  color: #818cf8;\r
}\r
\r
.ai-action-title {\r
  font-weight: 600;\r
  color: var(--ai-text);\r
  font-size: 13px;\r
  flex: 1;\r
}\r
\r
.ai-action-explanation {\r
  margin: 0;\r
  color: var(--ai-text-muted);\r
  line-height: 1.4;\r
  font-size: 12px;\r
}\r
\r
.ai-action-details {\r
  background: var(--ai-bg);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 6px;\r
  padding: 8px 10px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 4px;\r
}\r
\r
[data-theme="dark"] .ai-action-details {\r
  background: rgba(0, 0, 0, 0.2);\r
}\r
\r
.ai-action-param-row {\r
  display: flex;\r
  gap: 8px;\r
  font-size: 11.5px;\r
}\r
\r
.ai-action-param-key {\r
  font-weight: 500;\r
  color: var(--ai-text-muted);\r
  min-width: 80px;\r
  flex-shrink: 0;\r
}\r
\r
.ai-action-param-val {\r
  color: var(--ai-text);\r
  word-break: break-word;\r
  font-weight: 500;\r
}\r
\r
.ai-action-risk {\r
  border-radius: 999px;\r
  font-size: 10px;\r
  font-weight: 600;\r
  padding: 2px 7px;\r
  text-transform: uppercase;\r
}\r
\r
.ai-action-risk.risk-read {\r
  background: rgba(16, 185, 129, 0.12);\r
  color: #047857;\r
}\r
\r
.ai-action-risk.risk-write {\r
  background: rgba(79, 70, 229, 0.12);\r
  color: var(--ai-primary);\r
}\r
\r
.ai-action-risk.risk-destructive {\r
  background: rgba(220, 38, 38, 0.12);\r
  color: #b91c1c;\r
}\r
\r
.ai-action-acknowledgement {\r
  align-items: flex-start;\r
  color: var(--ai-text-muted);\r
  display: flex;\r
  font-size: 11px;\r
  gap: 7px;\r
  line-height: 1.4;\r
}\r
\r
.ai-action-acknowledgement input {\r
  margin: 1px 0 0;\r
}\r
\r
.ai-action-controls {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 8px;\r
  margin-top: 4px;\r
  width: 100%;\r
  min-width: 0;\r
}\r
\r
.ai-btn-action-confirm, .ai-btn-action-cancel {\r
  border-radius: 6px;\r
  font-size: 12px;\r
  font-weight: 500;\r
  padding: 6px 12px;\r
  cursor: pointer;\r
  border: 1px solid transparent;\r
  transition: all 0.15s ease;\r
  min-width: 0;\r
  white-space: normal;\r
  text-align: center;\r
}\r
\r
.ai-btn-action-confirm {\r
  background: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
  flex: 1;\r
}\r
\r
.ai-btn-action-confirm:hover:not(:disabled) {\r
  background: var(--ai-primary-hover);\r
}\r
\r
.ai-btn-action-confirm:disabled {\r
  opacity: 0.6;\r
  cursor: not-allowed;\r
}\r
\r
.ai-btn-action-cancel {\r
  background: transparent;\r
  border-color: var(--ai-border);\r
  color: var(--ai-text-muted);\r
}\r
\r
.ai-btn-action-cancel:hover:not(:disabled) {\r
  background: var(--ai-bg);\r
  color: var(--ai-text);\r
}\r
\r
.ai-action-status-msg {\r
  border-radius: 6px;\r
  padding: 6px 10px;\r
  font-size: 11.5px;\r
  font-weight: 500;\r
  display: flex;\r
  align-items: center;\r
  gap: 6px;\r
}\r
\r
.ai-action-status-msg.executing {\r
  background: #eff6ff;\r
  color: #1d4ed8;\r
  border: 1px solid #bfdbfe;\r
}\r
\r
.ai-action-status-msg.success {\r
  background: #f0fdf4;\r
  color: #15803d;\r
  border: 1px solid #bbf7d0;\r
}\r
\r
.ai-action-status-msg.error {\r
  background: #fef2f2;\r
  color: #b91c1c;\r
  border: 1px solid #fecaca;\r
}\r
\r
.ai-action-status-msg.cancelled {\r
  background: var(--ai-bg);\r
  color: var(--ai-text-muted);\r
  border: 1px solid var(--ai-border);\r
}\r
\r
[data-theme="dark"] .ai-action-status-msg.executing {\r
  background: #1e3a8a;\r
  color: #93c5fd;\r
  border-color: #2563eb;\r
}\r
\r
[data-theme="dark"] .ai-action-status-msg.success {\r
  background: #14532d;\r
  color: #86efac;\r
  border-color: #16a34a;\r
}\r
\r
[data-theme="dark"] .ai-action-status-msg.error {\r
  background: #7f1d1d;\r
  color: #fca5a5;\r
  border-color: #dc2626;\r
}\r
\r
/* Document Attachment Button */\r
.ai-attach-btn {\r
  width: 32px;\r
  height: 32px;\r
  border-radius: 50%;\r
  background: transparent;\r
  color: var(--ai-text-muted);\r
  border: none;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  cursor: pointer;\r
  flex-shrink: 0;\r
  transition: all 0.15s ease;\r
  outline: none;\r
  margin-right: 4px;\r
}\r
.ai-attach-btn:hover {\r
  background: var(--ai-bg);\r
  color: var(--ai-primary);\r
}\r
.ai-attach-btn svg {\r
  width: 17px;\r
  height: 17px;\r
  fill: currentColor;\r
}\r
\r
.ai-processing-state {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: 8px;\r
  font-size: 12.5px;\r
  color: var(--ai-text);\r
}\r
.ai-document-consent {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 10px;\r
  padding: 12px;\r
  background: var(--ai-surface);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 8px;\r
}\r
.ai-document-consent h3,\r
.ai-document-consent p {\r
  margin: 0;\r
}\r
.ai-document-consent h3 {\r
  font-size: 14px;\r
  color: var(--ai-text);\r
}\r
.ai-document-consent p,\r
.ai-document-consent-choice {\r
  font-size: 12px;\r
  color: var(--ai-text);\r
}\r
.ai-document-consent-choice {\r
  display: flex;\r
  align-items: flex-start;\r
  gap: 8px;\r
  cursor: pointer;\r
}\r
.ai-document-consent-choice input {\r
  flex: 0 0 auto;\r
  margin-top: 3px;\r
}\r
.ai-document-consent-controls {\r
  display: flex;\r
  gap: 8px;\r
}\r
.ai-document-consent-controls button,\r
.ai-btn-document-cancel,\r
.ai-btn-document-remove {\r
  border: 1px solid var(--ai-border);\r
  border-radius: 6px;\r
  padding: 6px 10px;\r
  color: var(--ai-text);\r
  background: var(--ai-bg);\r
  font: inherit;\r
  cursor: pointer;\r
}\r
.ai-document-consent-controls .ai-btn-document-consent-accept {\r
  border-color: var(--ai-primary);\r
  background: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
}\r
.ai-document-consent-controls button:disabled,\r
.ai-btn-document-cancel:disabled,\r
.ai-btn-document-remove:disabled {\r
  opacity: 0.55;\r
  cursor: not-allowed;\r
}\r
.ai-document-cancelled {\r
  color: var(--ai-text-muted);\r
}\r
.ai-hirepool-resume-card {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 10px;\r
  padding: 12px;\r
  background: var(--ai-surface);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 8px;\r
}\r
.ai-hirepool-resume-card strong,\r
.ai-hirepool-resume-card p {\r
  margin: 0;\r
  overflow-wrap: anywhere;\r
}\r
.ai-hirepool-resume-card strong {\r
  color: var(--ai-text);\r
  font-size: 13px;\r
}\r
.ai-hirepool-resume-card p {\r
  color: var(--ai-text-muted);\r
  font-size: 12px;\r
}\r
.ai-hirepool-resume-controls {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 8px;\r
}\r
.ai-hirepool-resume-card button {\r
  border: 1px solid var(--ai-border);\r
  border-radius: 6px;\r
  padding: 6px 10px;\r
  color: var(--ai-text);\r
  background: var(--ai-bg);\r
  font: inherit;\r
  cursor: pointer;\r
}\r
.ai-hirepool-resume-card .ai-btn-resume-confirm,\r
.ai-hirepool-resume-card .ai-btn-resume-prepare {\r
  border-color: var(--ai-primary);\r
  background: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
}\r
.ai-hirepool-resume-card button:disabled,\r
.ai-attach-btn:disabled {\r
  opacity: 0.55;\r
  cursor: not-allowed;\r
}\r
.ai-spinner {\r
  width: 16px;\r
  height: 16px;\r
  border: 2px solid rgba(79, 70, 229, 0.2);\r
  border-top-color: var(--ai-primary);\r
  border-radius: 50%;\r
  animation: ai-spin 0.8s linear infinite;\r
}\r
@keyframes ai-spin {\r
  to { transform: rotate(360deg); }\r
}\r
\r
/* Generic Document Attachment Card */\r
.ai-doc-card {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 8px;\r
  background: var(--ai-surface);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 8px;\r
  padding: 10px 12px;\r
  margin: 4px 0;\r
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);\r
}\r
.ai-doc-header {\r
  display: flex;\r
  align-items: center;\r
  gap: 10px;\r
}\r
.ai-doc-icon {\r
  font-size: 22px;\r
  line-height: 1;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
}\r
.ai-doc-details {\r
  flex: 1;\r
  min-width: 0;\r
}\r
.ai-doc-title {\r
  font-size: 13px;\r
  font-weight: 600;\r
  color: var(--ai-text);\r
  white-space: nowrap;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
}\r
.ai-doc-meta {\r
  font-size: 11px;\r
  color: var(--ai-text-muted);\r
  margin-top: 2px;\r
}\r
.ai-doc-badge {\r
  font-size: 10.5px;\r
  font-weight: 500;\r
  color: #059669;\r
  background: rgba(16, 185, 129, 0.12);\r
  padding: 3px 8px;\r
  border-radius: 12px;\r
  white-space: nowrap;\r
}\r
[data-theme="dark"] .ai-doc-badge {\r
  color: #34d399;\r
  background: rgba(16, 185, 129, 0.22);\r
}\r
.ai-doc-hint {\r
  font-size: 12px;\r
  color: var(--ai-text);\r
  line-height: 1.4;\r
  margin: 0;\r
}\r
\r
/* In-Chat Signup & Onboarding Styles */\r
.ai-signup-card {\r
  border-left: 3px solid #16a34a;\r
  width: 100%;\r
  max-width: 100%;\r
  min-width: 0;\r
  box-sizing: border-box;\r
}\r
.ai-signup-role-options {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 8px;\r
  margin: 8px 0;\r
}\r
.ai-role-btn {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: flex-start;\r
  padding: 10px 12px;\r
  border: 1px solid var(--ai-border);\r
  border-radius: 8px;\r
  background: var(--ai-bg);\r
  cursor: pointer;\r
  transition: all 0.2s ease;\r
  text-align: left;\r
}\r
.ai-role-btn:hover {\r
  border-color: #16a34a;\r
  background: rgba(22, 163, 74, 0.05);\r
}\r
.ai-role-badge {\r
  font-size: 10.5px;\r
  font-weight: 600;\r
  color: #16a34a;\r
  text-transform: uppercase;\r
  margin-bottom: 2px;\r
}\r
.ai-role-title {\r
  font-size: 13.5px;\r
  font-weight: 600;\r
  color: var(--ai-text);\r
}\r
.ai-role-desc {\r
  font-size: 11.5px;\r
  color: var(--ai-text-muted);\r
  margin-top: 2px;\r
}\r
.ai-signup-form,\r
.ai-login-form {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 10px;\r
  margin-top: 8px;\r
  width: 100%;\r
  min-width: 0;\r
  max-width: 100%;\r
  box-sizing: border-box;\r
}\r
\r
.ai-profile-form {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 10px;\r
  margin-top: 8px;\r
  width: 100%;\r
  min-width: 0;\r
  max-width: 100%;\r
  box-sizing: border-box;\r
}\r
\r
.ai-login-card {\r
  border-left: 3px solid #2563eb;\r
  width: 100%;\r
  max-width: 100%;\r
  min-width: 0;\r
  box-sizing: border-box;\r
}\r
\r
.ai-login-secondary {\r
  margin-top: 8px;\r
  text-align: center;\r
  width: 100%;\r
}\r
\r
.ai-link-button {\r
  background: none;\r
  border: none;\r
  color: #2563eb;\r
  text-decoration: underline;\r
  font-size: 11.5px;\r
  cursor: pointer;\r
  padding: 4px 6px;\r
  font-family: inherit;\r
  transition: color 0.15s ease;\r
}\r
\r
.ai-link-button:hover {\r
  color: #1d4ed8;\r
}\r
\r
[data-theme="dark"] .ai-link-button {\r
  color: #60a5fa;\r
}\r
\r
[data-theme="dark"] .ai-link-button:hover {\r
  color: #93c5fd;\r
}\r
.ai-form-row {\r
  display: grid;\r
  grid-template-columns: repeat(2, minmax(0, 1fr));\r
  gap: 8px;\r
  align-items: start;\r
  width: 100%;\r
  min-width: 0;\r
  max-width: 100%;\r
  box-sizing: border-box;\r
}\r
.ai-form-group {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 4px;\r
  width: 100%;\r
  min-width: 0;\r
  max-width: 100%;\r
  box-sizing: border-box;\r
}\r
.ai-form-label {\r
  font-size: 11.5px;\r
  font-weight: 500;\r
  color: var(--ai-text);\r
  line-height: 1.35;\r
  overflow-wrap: break-word;\r
  word-wrap: break-word;\r
  min-width: 0;\r
}\r
.ai-form-input {\r
  box-sizing: border-box;\r
  width: 100%;\r
  min-width: 0;\r
  max-width: 100%;\r
  margin: 0;\r
  padding: 7px 10px;\r
  border: 1px solid var(--ai-border);\r
  border-radius: 6px;\r
  font-size: 12.5px;\r
  background: var(--ai-bg);\r
  color: var(--ai-text);\r
  outline: none;\r
  font-family: inherit;\r
}\r
.ai-form-input:focus {\r
  border-color: #16a34a;\r
  box-shadow: 0 0 0 1px #16a34a;\r
}\r
.ai-password-wrapper {\r
  position: relative;\r
  display: flex;\r
  align-items: center;\r
}\r
.ai-password-wrapper .ai-form-input {\r
  width: 100%;\r
  padding-right: 32px;\r
}\r
.ai-password-toggle {\r
  position: absolute;\r
  right: 8px;\r
  background: none;\r
  border: none;\r
  cursor: pointer;\r
  font-size: 14px;\r
  color: var(--ai-text-muted);\r
  padding: 2px;\r
}\r
.ai-form-input.ai-input-invalid {\r
  border-color: #dc2626 !important;\r
  background-color: #fef2f2 !important;\r
}\r
.ai-field-error {\r
  color: #dc2626;\r
  font-size: 11px;\r
  margin-top: 2px;\r
  line-height: 1.3;\r
}\r
\r
/* Structured Action Review Cards & Tables */\r
.ai-review-card-content {\r
  margin: 8px 0;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 8px;\r
}\r
.ai-review-table {\r
  width: 100%;\r
  border-collapse: collapse;\r
  font-size: 12px;\r
  background: var(--ai-bg);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 6px;\r
  overflow: hidden;\r
}\r
.ai-review-table tr {\r
  border-bottom: 1px solid var(--ai-border);\r
}\r
.ai-review-table tr:last-child {\r
  border-bottom: none;\r
}\r
.ai-review-key {\r
  text-align: left;\r
  padding: 6px 10px;\r
  width: 38%;\r
  font-weight: 600;\r
  color: var(--ai-text-muted);\r
  background: rgba(0, 0, 0, 0.02);\r
  vertical-align: top;\r
}\r
.ai-review-val {\r
  padding: 6px 10px;\r
  color: var(--ai-text);\r
  font-weight: 500;\r
  vertical-align: top;\r
}\r
.ai-review-section {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 4px;\r
}\r
.ai-review-section-title {\r
  font-size: 11px;\r
  font-weight: 600;\r
  text-transform: uppercase;\r
  letter-spacing: 0.5px;\r
  color: var(--ai-text-muted);\r
}\r
.ai-review-tags {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 4px;\r
}\r
.ai-review-tag {\r
  display: inline-block;\r
  padding: 2px 8px;\r
  border-radius: 12px;\r
  font-size: 11px;\r
  font-weight: 500;\r
  background: #e0f2fe;\r
  color: #0369a1;\r
  border: 1px solid #bae6fd;\r
}\r
.ai-review-tag.preferred {\r
  background: #f1f5f9;\r
  color: #475569;\r
  border-color: #cbd5e1;\r
}\r
.ai-review-desc {\r
  font-size: 11.5px;\r
  line-height: 1.4;\r
  color: var(--ai-text);\r
  padding: 6px 8px;\r
  background: var(--ai-bg);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 6px;\r
  max-height: 120px;\r
  overflow-y: auto;\r
  white-space: pre-wrap;\r
}\r
.ai-btn-action-edit {\r
  background: transparent;\r
  color: var(--ai-text);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 6px;\r
  padding: 6px 12px;\r
  font-size: 12px;\r
  cursor: pointer;\r
  transition: all 0.15s ease;\r
}\r
.ai-btn-action-edit:hover {\r
  background: rgba(0, 0, 0, 0.05);\r
  border-color: var(--ai-text-muted);\r
}\r
.ai-verification-body {\r
  padding: 4px 0;\r
  width: 100%;\r
  min-width: 0;\r
  box-sizing: border-box;\r
}\r
.ai-role-btn {\r
  width: 100%;\r
  box-sizing: border-box;\r
}\r
/* Website bot: the welcome is a chat message, so the static welcome box is hidden */\r
.ai-widget-container.ai-chat-welcome .ai-welcome-box {\r
  display: none;\r
}\r
\r
/* Website: role cards welcome */\r
.ai-role-cards {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 8px;\r
  margin-top: 10px;\r
  width: 100%;\r
}\r
\r
.ai-message-row.assistant:has(.ai-role-cards) {\r
  flex-direction: column;\r
  align-items: stretch;\r
}\r
\r
.ai-message-row.assistant:has(.ai-role-cards) .ai-bubble {\r
  align-self: flex-start;\r
}\r
\r
.ai-role-card {\r
  display: flex;\r
  align-items: center;\r
  gap: 12px;\r
  width: 100%;\r
  box-sizing: border-box;\r
  padding: 11px 12px;\r
  background: var(--ai-bg);\r
  border: 1px solid var(--ai-border);\r
  border-radius: 12px;\r
  cursor: pointer;\r
  text-align: left;\r
  font-family: inherit;\r
  color: var(--ai-text);\r
  transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.1s ease;\r
}\r
\r
.ai-role-card:hover {\r
  border-color: var(--ai-primary);\r
  background: rgba(163, 230, 53, 0.08);\r
}\r
\r
.ai-role-card:active { transform: scale(0.99); }\r
\r
.ai-role-card:focus-visible {\r
  outline: 2px solid var(--ai-primary);\r
  outline-offset: 2px;\r
}\r
\r
.ai-role-card-icon {\r
  width: 36px;\r
  height: 36px;\r
  border-radius: 10px;\r
  background: rgba(163, 230, 53, 0.18);\r
  color: #3f6212;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  flex-shrink: 0;\r
}\r
\r
.ai-role-card-icon svg,\r
.ai-role-card-chevron svg {\r
  width: 18px;\r
  height: 18px;\r
  fill: currentColor;\r
}\r
\r
.ai-role-card-text {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  flex: 1;\r
  min-width: 0;\r
}\r
\r
.ai-role-card-title {\r
  font-size: 13.5px;\r
  font-weight: 600;\r
  line-height: 1.25;\r
}\r
\r
.ai-role-card-subtitle {\r
  font-size: 12px;\r
  color: var(--ai-text-muted);\r
  line-height: 1.3;\r
}\r
\r
.ai-role-card-chevron {\r
  color: var(--ai-text-muted);\r
  display: flex;\r
  flex-shrink: 0;\r
}\r
\r
.ai-role-card:hover .ai-role-card-chevron { color: #3f6212; }\r
\r
[data-theme="dark"] .ai-role-card-icon,\r
[data-theme="dark"] .ai-role-card:hover .ai-role-card-chevron { color: var(--ai-primary); }\r
\r
@media (prefers-color-scheme: dark) {\r
  [data-theme="auto"] .ai-role-card-icon,\r
  [data-theme="auto"] .ai-role-card:hover .ai-role-card-chevron { color: var(--ai-primary); }\r
}\r
\r
/* Website look: dark branded header, pill input, no keyboard hint */\r
.ai-theme-hirepool .ai-header {\r
  background: #0f1720;\r
  border-bottom-color: #0f1720;\r
}\r
\r
.ai-theme-hirepool .ai-title { color: #ffffff; }\r
\r
.ai-theme-hirepool .ai-status { color: #a3e635; }\r
\r
.ai-theme-hirepool .ai-status-dot { background: #a3e635; }\r
\r
.ai-theme-hirepool .ai-header .ai-icon-btn { color: #cbd5e1; }\r
\r
.ai-theme-hirepool .ai-header .ai-icon-btn:hover {\r
  color: #ffffff;\r
  background: rgba(255, 255, 255, 0.08);\r
}\r
\r
.ai-theme-hirepool .ai-input-form {\r
  border-radius: 999px;\r
  border: 1.5px solid var(--ai-primary);\r
  align-items: center;\r
}\r
\r
.ai-theme-hirepool .ai-textarea {\r
  scrollbar-width: none;\r
}\r
\r
.ai-theme-hirepool .ai-textarea::-webkit-scrollbar { display: none; }\r
\r
.ai-theme-hirepool .ai-footer-note { display: none; }\r
\r
/* Website: account buttons. A bar before the chat starts, header pills after. */\r
.ai-auth-bar,\r
.ai-header-signin,\r
.ai-header-signup { display: none; }\r
\r
.ai-surface-website .ai-auth-bar {\r
  display: flex;\r
  gap: 8px;\r
  padding: 0 14px 12px;\r
  background: #0f1720;\r
  flex-shrink: 0;\r
}\r
\r
.ai-surface-website.ai-has-chat .ai-auth-bar { display: none; }\r
\r
.ai-auth-btn {\r
  flex: 1;\r
  display: inline-flex;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 6px;\r
  height: 34px;\r
  border-radius: 10px;\r
  font-family: inherit;\r
  font-size: 13px;\r
  font-weight: 600;\r
  cursor: pointer;\r
  transition: background-color 0.15s ease, border-color 0.15s ease;\r
}\r
\r
.ai-auth-btn svg { width: 16px; height: 16px; fill: currentColor; }\r
\r
.ai-auth-signin {\r
  background: transparent;\r
  color: #e6edf3;\r
  border: 1px solid #3a4856;\r
}\r
\r
.ai-auth-signin:hover { border-color: #a3e635; color: #ffffff; }\r
\r
.ai-auth-signup {\r
  background: #a3e635;\r
  color: #0f1720;\r
  border: 1px solid #a3e635;\r
}\r
\r
.ai-auth-signup:hover { background: #bef264; border-color: #bef264; }\r
\r
.ai-auth-btn:focus-visible,\r
.ai-header-signin:focus-visible,\r
.ai-header-signup:focus-visible {\r
  outline: 2px solid #a3e635;\r
  outline-offset: 2px;\r
}\r
\r
.ai-surface-website.ai-has-chat .ai-header-signin,\r
.ai-surface-website.ai-has-chat .ai-header-signup {\r
  display: inline-flex;\r
  align-items: center;\r
  height: 26px;\r
  padding: 0 10px;\r
  border-radius: 999px;\r
  font-family: inherit;\r
  font-size: 12px;\r
  font-weight: 600;\r
  cursor: pointer;\r
  white-space: nowrap;\r
}\r
\r
.ai-surface-website .ai-header-signin {\r
  background: transparent;\r
  color: #cbd5e1;\r
  border: none;\r
}\r
\r
.ai-surface-website .ai-header-signin:hover { color: #ffffff; }\r
\r
.ai-surface-website .ai-header-signup {\r
  background: #a3e635;\r
  color: #0f1720;\r
  border: none;\r
  margin-right: 4px;\r
}\r
\r
/* Website: roomier conversation with clear gaps between messages */\r
.ai-theme-hirepool .ai-body {\r
  background: #f6f8fa;\r
  gap: 12px;\r
}\r
\r
.ai-theme-hirepool .ai-messages-list {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 12px;\r
}\r
\r
.ai-theme-hirepool .ai-message-row.assistant {\r
  position: relative;\r
  padding-left: 30px;\r
  max-width: 100%;\r
  box-sizing: border-box;\r
  gap: 8px;\r
}\r
\r
/* Small HirePool avatar beside the assistant's messages (once per run of messages) */\r
.ai-theme-hirepool .ai-message-row.assistant::before {\r
  content: '';\r
  position: absolute;\r
  left: 0;\r
  top: 0;\r
  width: 22px;\r
  height: 22px;\r
  border-radius: 50%;\r
  background: #0b0b0b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23a3e635' d='M7 3H21V17L16.5 12.5L7 22L2 17L11.5 7.5Z'/%3E%3C/svg%3E") center / 12px 12px no-repeat;\r
  box-shadow: 0 0 0 1.5px #a3e635;\r
}\r
\r
.ai-theme-hirepool .ai-message-row.assistant + .ai-message-row.assistant::before { visibility: hidden; }\r
\r
.ai-theme-hirepool .ai-message-row.assistant > .ai-bubble {\r
  align-self: flex-start;\r
  max-width: 88%;\r
  background: #ffffff;\r
  border: 1px solid #e3e8ee;\r
  border-radius: 16px 16px 16px 4px;\r
  padding: 10px 13px;\r
  box-shadow: 0 1px 2px rgba(15, 23, 32, 0.04);\r
}\r
\r
.ai-theme-hirepool .ai-message-row.user {\r
  max-width: 82%;\r
}\r
\r
.ai-theme-hirepool .ai-message-row.user .ai-bubble {\r
  background: #a3e635;\r
  color: #0f1720;\r
  border-radius: 16px 16px 4px 16px;\r
  padding: 8px 13px;\r
  font-weight: 500;\r
}\r
\r
.ai-theme-hirepool .ai-bubble ul,\r
.ai-theme-hirepool .ai-bubble ol {\r
  margin: 6px 0;\r
  padding-left: 18px;\r
}\r
\r
.ai-theme-hirepool .ai-bubble li { margin: 3px 0; }\r
\r
.ai-theme-hirepool .ai-bubble li p,\r
.ai-theme-hirepool .ai-bubble li p:last-child { margin: 0; }\r
\r
/* Keep the header on one line next to the account pills */\r
.ai-theme-hirepool .ai-header-info { min-width: 0; flex: 1; }\r
\r
.ai-theme-hirepool .ai-header-titles { min-width: 0; }\r
\r
.ai-theme-hirepool .ai-title {\r
  white-space: nowrap;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
}\r
\r
.ai-theme-hirepool .ai-header-actions { flex-shrink: 0; }\r
.ai-theme-hirepool .ai-bubble p { margin: 0 0 6px; }\r
\r
.ai-theme-hirepool .ai-bubble p:last-child { margin-bottom: 0; }\r
\r
.ai-theme-hirepool .ai-role-cards { margin-top: 0; }\r
\r
.ai-theme-hirepool .ai-quick-replies { margin-top: 0; }\r
\r
.ai-theme-hirepool .ai-quick-replies { gap: 8px; }\r
\r
/* Website: clearly visible secondary buttons under the cards */\r
.ai-theme-hirepool .ai-quick-reply {\r
  background: #ffffff;\r
  border: 1.5px solid var(--ai-primary);\r
  border-radius: 999px;\r
  padding: 9px 16px;\r
  font-size: 13.5px;\r
  font-weight: 600;\r
  color: #1f2933;\r
  min-height: 38px;\r
}\r
\r
.ai-theme-hirepool .ai-quick-reply:hover {\r
  background: var(--ai-primary);\r
  color: #0f1720;\r
}\r
\r
/* Welcome bubble uses the full width above the cards */\r
.ai-theme-hirepool .ai-message-row.assistant:has(.ai-role-cards) > .ai-bubble {\r
  max-width: 100%;\r
}\r
\r
.ai-msg-meta {\r
  font-size: 11px;\r
  color: #8a96a3;\r
  margin-top: 4px;\r
  padding-left: 2px;\r
}\r
\r
.ai-theme-hirepool .ai-msg-meta { margin-top: -4px; }\r
\r
@media (prefers-reduced-motion: reduce) {\r
  .ai-role-card { transition: none; }\r
}\r
\r
/* Quick replies under the latest assistant message */\r
.ai-quick-replies {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 6px;\r
  margin-top: 8px;\r
}\r
\r
.ai-quick-reply {\r
  background: var(--ai-bg);\r
  border: 1px solid var(--ai-primary);\r
  border-radius: 14px;\r
  padding: 6px 12px;\r
  font-size: 12.5px;\r
  line-height: 1.3;\r
  color: var(--ai-text);\r
  cursor: pointer;\r
  text-align: left;\r
  transition: background-color 0.15s ease, color 0.15s ease;\r
}\r
\r
.ai-quick-reply:hover {\r
  background: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
}\r
\r
.ai-quick-reply:focus-visible {\r
  outline: 2px solid var(--ai-primary);\r
  outline-offset: 2px;\r
}\r
\r
@media (prefers-reduced-motion: reduce) {\r
  .ai-quick-reply { transition: none; }\r
}\r
\r
/* Friendly error notices */\r
.ai-error-banner {\r
  line-height: 1.45;\r
}\r
\r
.ai-error-retry-btn:disabled {\r
  opacity: 0.5;\r
  cursor: not-allowed;\r
}\r
\r
.ai-error-login-link {\r
  flex-shrink: 0;\r
  padding: 4px 10px;\r
  border-radius: var(--ai-radius-sm);\r
  background: var(--ai-primary);\r
  color: var(--ai-primary-contrast);\r
  font-weight: 600;\r
  text-decoration: none;\r
}\r
\r
.ai-error-login-link:focus-visible {\r
  outline: 2px solid var(--ai-primary);\r
  outline-offset: 2px;\r
}\r

/* ===== HirePool theme: dashboard welcome box, reminder card, profile form ===== */
.ai-theme-hirepool .ai-welcome-box {
  background: #ffffff;
  border: 1px solid #e3e8ee;
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 4px;
}

.ai-theme-hirepool .ai-welcome-greeting {
  font-size: 13.5px;
  line-height: 1.55;
  color: #1f2933;
}

.ai-theme-hirepool .ai-suggested-prompts-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #8a96a3;
  margin: 12px 0 8px;
}

.ai-theme-hirepool .ai-prompts-list { display: flex; flex-wrap: wrap; gap: 8px; }

.ai-theme-hirepool .ai-prompt-pill {
  background: #ffffff;
  border: 1.5px solid var(--ai-primary);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2933;
}

.ai-theme-hirepool .ai-prompt-pill:hover {
  background: var(--ai-primary);
  color: #0f1720;
  transform: none;
}

.ai-theme-hirepool .ai-nudge {
  border-left: 3px solid var(--ai-primary) !important;
}

.ai-theme-hirepool .ai-nudge .ai-action-controls { margin-top: 10px; gap: 8px; }

/* Profile form card */
.ai-theme-hirepool .ai-profile-form-row { padding-left: 0; }

.ai-theme-hirepool .ai-profile-form-row::before { display: none; }

.ai-theme-hirepool .ai-message-row.assistant > .ai-profile-form-card,
.ai-profile-form-card {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  padding: 14px;
}

.ai-profile-form { display: flex; flex-direction: column; gap: 12px; }

.ai-pf-head { border-bottom: 1px solid #e3e8ee; padding-bottom: 10px; }

.ai-pf-title { font-size: 15px; font-weight: 700; color: #0f1720; }

.ai-pf-subtitle { font-size: 12.5px; color: #52606d; margin-top: 2px; line-height: 1.4; }

.ai-pf-progress {
  display: inline-block;
  margin-left: 4px;
  background: rgba(163, 230, 53, 0.2);
  color: #3f6212;
  border-radius: 999px;
  padding: 1px 8px;
  font-weight: 600;
  font-size: 11.5px;
}

.ai-pf-field { display: flex; flex-direction: column; gap: 5px; }

.ai-pf-label { font-size: 12.5px; font-weight: 600; color: #1f2933; }

.ai-pf-missing {
  margin-left: 6px;
  font-size: 10.5px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 1px 6px;
}

.ai-profile-form .ai-form-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d5dce3;
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  color: #1f2933;
  background: #ffffff;
}

.ai-profile-form textarea.ai-form-input { resize: vertical; min-height: 64px; }

.ai-profile-form .ai-form-input:focus {
  outline: none;
  border-color: var(--ai-primary);
  box-shadow: 0 0 0 3px rgba(163, 230, 53, 0.25);
}

.ai-pf-field.has-error .ai-form-input { border-color: #dc2626; }

.ai-pf-error, .ai-pf-form-error { font-size: 12px; color: #dc2626; }

.ai-pf-error:empty, .ai-pf-form-error:empty { display: none; }

.ai-pf-hint { font-size: 11.5px; color: #7b8794; }

.ai-pf-chips { display: flex; flex-wrap: wrap; gap: 6px; }

.ai-pf-chip { position: relative; cursor: pointer; }

.ai-pf-chip input { position: absolute; opacity: 0; pointer-events: none; }

.ai-pf-chip span {
  display: inline-block;
  border: 1px solid #d5dce3;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  color: #1f2933;
  background: #ffffff;
}

.ai-pf-chip input:checked + span {
  background: var(--ai-primary);
  border-color: var(--ai-primary);
  color: #0f1720;
  font-weight: 600;
}

.ai-pf-chip input:focus-visible + span { outline: 2px solid var(--ai-primary); outline-offset: 2px; }

.ai-pf-chat-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px dashed #e3e8ee;
}

.ai-pf-chat-sections .ai-pf-hint { width: 100%; }

.ai-pf-chat-btn {
  border: 1.5px solid var(--ai-primary);
  background: #ffffff;
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  color: #1f2933;
}

.ai-pf-chat-btn:hover { background: var(--ai-primary); color: #0f1720; }

.ai-pf-actions {
  display: flex;
  gap: 8px;
  position: sticky;
  bottom: -14px;
  background: #ffffff;
  padding: 8px 0 2px;
}

.ai-pf-actions .ai-pf-save { flex: 1; }

.ai-profile-form-loading, .ai-profile-form-error { font-size: 13px; color: #52606d; }

.ai-profile-form-error { color: #b91c1c; }

/* Dashboard welcome: profile progress */
.ai-profile-progress {
  background: #ffffff;
  border: 1px solid #e3e8ee;
  border-left: 3px solid var(--ai-primary);
  border-radius: 12px;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ai-pp-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }

.ai-pp-title { font-size: 13px; color: #1f2933; }

.ai-pp-title strong { font-weight: 700; }

.ai-pp-count {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 1px 8px;
}

.ai-pp-bar { height: 6px; border-radius: 999px; background: #edf1f5; overflow: hidden; }

.ai-pp-bar span { display: block; height: 100%; background: var(--ai-primary); border-radius: inherit; transition: width 0.4s ease; }

.ai-pp-missing { font-size: 12px; color: #52606d; line-height: 1.4; }

.ai-pp-btn {
  align-self: flex-start;
  background: var(--ai-primary);
  color: #0f1720;
  border: none;
  border-radius: 999px;
  padding: 7px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.ai-pp-btn:hover { background: #bef264; }

.ai-pp-btn:focus-visible { outline: 2px solid var(--ai-primary); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) { .ai-pp-bar span { transition: none; } }

.ai-action-explanation p { margin: 0 0 6px; }
.ai-action-explanation p:last-child { margin-bottom: 0; }

/* Profile form: values taken from an uploaded resume */
.ai-pf-source {
  margin-left: 6px;
  font-size: 10.5px;
  font-weight: 600;
  color: #3f6212;
  background: rgba(163, 230, 53, 0.22);
  border-radius: 999px;
  padding: 1px 6px;
}

.ai-pf-diff { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }

.ai-pf-use {
  border: none;
  background: none;
  color: #3f6212;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

/* Agency: resumes read from an upload */
.ai-bench-card { display: flex; flex-direction: column; gap: 10px; }

.ai-bench-list { display: flex; flex-direction: column; gap: 6px; }

.ai-bench-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid #e3e8ee;
  border-radius: 10px;
  padding: 7px 9px;
  background: #ffffff;
}

.ai-bench-who { display: flex; flex-direction: column; min-width: 0; font-size: 12.5px; }

.ai-bench-who span {
  color: #7b8794;
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-bench-chip {
  flex-shrink: 0;
  max-width: 45%;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 8px;
  background: #edf1f5;
  color: #52606d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-bench-chip.ok { background: rgba(163, 230, 53, 0.22); color: #3f6212; }
.ai-bench-chip.warn { background: #fef3c7; color: #b45309; }
.ai-bench-chip.err { background: #fee2e2; color: #b91c1c; }

.ai-bench-actions { display: flex; flex-wrap: wrap; gap: 8px; }

.ai-bench-review { display: flex; flex-wrap: wrap; gap: 6px; }

.ai-bench-review .ai-profile-form { width: 100%; }
`;

  // widget/src/hirepool-app-session.js
  var REFRESH_MARGIN_MS = 30 * 1e3;
  var MAX_TOKEN_LENGTH = 8192;
  var HIREPOOL_APP_APPLICATION_ID = "hirepool-local-app";
  var HirePoolAppSession = class {
    /**
     * @param {object} options
     * @param {string} options.apiUrl SDK backend origin ('' for same origin)
     * @param {() => (string|null|Promise<string|null>)} options.getAccessToken
     * @param {typeof fetch} [options.fetchImpl]
     */
    constructor({ apiUrl = "", getAccessToken, fetchImpl } = {}) {
      if (typeof getAccessToken !== "function") {
        throw new TypeError("hirePoolApp.getAccessToken must be a function that returns the signed-in user's access token");
      }
      this.apiUrl = String(apiUrl || "").replace(/\/+$/, "");
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
      if (typeof token !== "string" || !token.trim() || token.length > MAX_TOKEN_LENGTH) return null;
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
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: "{}",
        credentials: "omit",
        cache: "no-store"
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
      }
      if (!response.ok || typeof body?.credential !== "string") {
        this.session = null;
        this.expiresAt = 0;
        const error = new Error(body?.error?.message || `HirePool sign-in could not be verified (HTTP ${response.status})`);
        error.status = response.status;
        throw error;
      }
      const ttl = Number(body.expiresIn);
      this.exchangedToken = accessToken;
      this.session = body;
      this.expiresAt = Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : 5 * 60 * 1e3);
      return body;
    }
    /** A valid assistant credential, exchanging or renewing when needed. */
    async getSession() {
      if (this.ended) return null;
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
          method: "POST",
          headers: { Authorization: `Bearer ${credential}` },
          credentials: "omit",
          cache: "no-store",
          keepalive: true
        });
      } catch {
      }
    }
    getHostIntegrationConfig(sdk) {
      return {
        version: 1,
        application: { id: HIREPOOL_APP_APPLICATION_ID, name: "HirePool" },
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
            throw new Error("This action has no valid server confirmation. Ask the assistant to prepare it again.");
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
            throw new Error("This action has no valid server confirmation to cancel.");
          }
          return sdk.apiClient.cancelDynamicApiAction(confirmationToken);
        }
      };
    }
  };

  // widget/src/sdk.js
  var EventEmitter = class {
    constructor() {
      this.listeners = /* @__PURE__ */ new Map();
    }
    on(event, handler) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, /* @__PURE__ */ new Set());
      }
      this.listeners.get(event).add(handler);
      return () => this.off(event, handler);
    }
    off(event, handler) {
      if (this.listeners.has(event)) {
        this.listeners.get(event).delete(handler);
      }
    }
    emit(event, ...args) {
      if (this.listeners.has(event)) {
        for (const handler of this.listeners.get(event)) {
          try {
            handler(...args);
          } catch (err) {
            console.error(`Error in event listener for "${event}":`, err);
          }
        }
      }
    }
    clear() {
      this.listeners.clear();
    }
  };
  var AssistantSDK = class {
    constructor() {
      this.version = "1.0.0";
      this.events = new EventEmitter();
      this.initialized = false;
      this.initializing = false;
      this.widgetUI = null;
      this.apiClient = null;
      this.storage = null;
      this.integration = null;
      this.config = null;
      this.storageNamespace = null;
      this.integrationUnsubscribe = null;
      this.integrationCancelUnsubscribe = null;
      this.integrationHookUnsubscribes = [];
      this.actionHandlers = /* @__PURE__ */ new Map();
      this.hostIdentityRefreshId = 0;
      this._hirePoolBridge = null;
    }
    /**
     * Convenience method to mount the HirePool Assistant
     * @param {object} [options]
     */
    async mount(options = {}) {
      return this.init({
        assistantId: "hirepool",
        ...options
      });
    }
    static async mount(options = {}) {
      return sdkInstance.mount(options);
    }
    _isDemoPage() {
      if (typeof window === "undefined" || !window.location) return false;
      const pathname = String(window.location.pathname || "");
      const hostname = String(window.location.hostname || "");
      return pathname.startsWith("/demo") || hostname.endsWith(".vercel.app");
    }
    /**
     * Initialize the SDK and mount widget
     * @param {object} [options]
     * @param {string} [options.assistantId='default']
     * @param {string} [options.apiUrl=''] Base URL of the backend (default: current host origin)
     * @param {string} [options.theme='auto'] 'light' | 'dark' | 'auto'
     * @param {string} [options.primaryColor] Custom hex color
     * @param {string} [options.position='bottom-right'] 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
     * @param {string} [options.name] Display name override
     * @param {string} [options.greeting] Greeting override
     * @param {string[]} [options.suggestedPrompts] Suggested prompt list override
     * @param {object} [options.features] Feature flag overrides
     */
    async init(options = {}) {
      if (this.initialized) {
        console.warn(
          "[AssistantSDK] SDK is already initialized. Call AssistantSDK.destroy() before reinitializing."
        );
        return this;
      }
      if (this.initializing) {
        return this;
      }
      const assistantId = options.assistantId ?? "hirepool";
      if (typeof assistantId !== "string" || assistantId.length < 1 || assistantId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(assistantId)) {
        throw new TypeError(
          "assistantId must contain 1-64 letters, numbers, underscores, or hyphens"
        );
      }
      const isDemo = this._isDemoPage();
      const hirePoolApp = assistantId === "hirepool" && options.hirePoolApp ? options.hirePoolApp : null;
      if (hirePoolApp && typeof window !== "undefined" && !isDemo && !isHirePoolAppUrl(window.location.href)) {
        throw new Error(
          "The in-app HirePool assistant is available only inside the HirePool app"
        );
      }
      if (!hirePoolApp && assistantId === "hirepool" && typeof window !== "undefined" && !isDemo && !isHirePoolPublicSiteUrl(window.location.href)) {
        throw new Error(
          "The HirePool assistant is available only on approved public website pages"
        );
      }
      const apiUrl = options.apiUrl ?? this._detectApiUrl();
      if (typeof apiUrl !== "string") {
        throw new TypeError("apiUrl must be an absolute HTTP or HTTPS origin");
      }
      if (apiUrl) {
        let parsedApiUrl;
        try {
          parsedApiUrl = new URL(apiUrl);
        } catch {
          throw new TypeError("apiUrl must be an absolute HTTP or HTTPS origin");
        }
        if (!["http:", "https:"].includes(parsedApiUrl.protocol) || parsedApiUrl.username || parsedApiUrl.password || parsedApiUrl.pathname !== "/" || parsedApiUrl.search || parsedApiUrl.hash) {
          throw new TypeError(
            "apiUrl must be an HTTP or HTTPS origin without credentials, path, query, or fragment"
          );
        }
      }
      if (hirePoolApp) {
        this._hirePoolAppSession = new HirePoolAppSession({
          apiUrl,
          getAccessToken: hirePoolApp.getAccessToken
        });
        options.integration = this._hirePoolAppSession.getHostIntegrationConfig(this);
        this._explicitPresentation = {
          name: options.name,
          greeting: options.greeting,
          suggestedPrompts: options.suggestedPrompts
        };
        if (!options.name) options.name = "HirePool Assistant";
        if (!options.context && typeof window !== "undefined") {
          options.context = { surface: "app", page: window.location.pathname };
        }
      } else if (assistantId === "hirepool" || assistantId === "default") {
        if (!this._hirePoolBridge) {
          this._hirePoolBridge = new HirePoolBridge(this, {
            initialPath: options.initialPath || (typeof window !== "undefined" ? window.location.pathname : "/")
          });
        }
        if (!options.integration) {
          options.integration = this._hirePoolBridge.getHostIntegrationConfig();
        }
        this._explicitPresentation = {
          name: options.name,
          greeting: options.greeting,
          suggestedPrompts: options.suggestedPrompts
        };
        if (!options.greeting) options.greeting = HIREPOOL_ASSISTANT_GREETING;
        if (!options.suggestedPrompts)
          options.suggestedPrompts = HIREPOOL_GUEST_SUGGESTED_PROMPTS;
        if (!options.name) options.name = "HirePool Assistant";
        if (!options.context) options.context = this._hirePoolBridge.getContext();
      }
      const integration = options.integration ? new HostIntegrationAdapter(options.integration) : null;
      const sessionScope = integration ? await integration.getSessionScope() : null;
      const initialContext = serializeContext(options.context);
      const documentUpload = normalizeDocumentUploadSettings(
        options.documentUpload
      );
      this.initializing = true;
      this.integration = integration;
      this.actionHandlers.clear();
      if (!hirePoolApp && (assistantId === "hirepool" || assistantId === "default")) {
        this.actionHandlers.set(
          HIREPOOL_LOGIN_ACTION,
          () => openHirePoolLogin({
            currentUrl: window.location.href,
            openWindow: (...args) => window.open(...args),
            appLoginUrl: this.config?.behavior?.appLoginUrl || null
          })
        );
        this.actionHandlers.set(
          HIREPOOL_SIGNUP_ACTION,
          () => openHirePoolSignup({
            currentUrl: window.location.href,
            openWindow: (...args) => window.open(...args),
            appLoginUrl: this.config?.behavior?.appLoginUrl || null
          })
        );
      }
      this.apiClient = new AssistantApiClient(apiUrl, {
        assistantId,
        getAuthHeaders: this.integration ? () => this.integration.getAuthHeaders() : void 0,
        credentials: this.integration?.credentials
      });
      const storageNamespace = integration ? `${integration.application.id}:${assistantId}:${sessionScope || "guest"}` : assistantId;
      this.storageNamespace = storageNamespace;
      this.storage = new AssistantStorage(storageNamespace);
      let serverConfig = {};
      try {
        serverConfig = await this.apiClient.fetchConfig(assistantId);
      } catch (err) {
        console.warn(
          `[AssistantSDK] Could not fetch remote configuration for "${assistantId}", using fallback defaults.`,
          err.message
        );
      }
      const surface = serverConfig.surface === "website" || serverConfig.surface === "app" ? serverConfig.surface : null;
      if (surface && this._explicitPresentation) {
        const explicit = this._explicitPresentation;
        if (!explicit.name && serverConfig.name) options.name = serverConfig.name;
        if (!explicit.greeting && serverConfig.greeting)
          options.greeting = serverConfig.greeting;
        if (!explicit.suggestedPrompts && Array.isArray(serverConfig.suggestedPrompts))
          options.suggestedPrompts = serverConfig.suggestedPrompts;
      }
      this.config = {
        surface,
        behavior: serverConfig.behavior && typeof serverConfig.behavior === "object" ? serverConfig.behavior : {},
        assistantId,
        apiUrl,
        name: options.name || serverConfig.name || "HirePool Assistant",
        description: options.description || serverConfig.description || "Your AI talent and recruitment partner for HirePool",
        avatarUrl: options.avatarUrl || serverConfig.avatarUrl || "",
        theme: options.theme || serverConfig.theme || "auto",
        primaryColor: options.primaryColor || serverConfig.primaryColor || "#a3e635",
        position: options.position || serverConfig.position || "bottom-right",
        greeting: options.greeting || serverConfig.greeting || HIREPOOL_ASSISTANT_GREETING,
        suggestedPrompts: options.suggestedPrompts || serverConfig.suggestedPrompts || HIREPOOL_GUEST_SUGGESTED_PROMPTS,
        context: initialContext,
        applicationId: this.integration?.application.id || null,
        documentUpload,
        features: {
          ...serverConfig.features || {},
          ...options.features || {}
        }
      };
      if (!this.initializing) {
        return this;
      }
      this.initializing = false;
      this.widgetUI = new AssistantWidgetUI(
        {
          ...this.config,
          integration: this.integration,
          hasActionHandler: (action) => this._hasActionHandler(action)
        },
        this.apiClient,
        this.storage,
        this.events
      );
      this._setupIntegrationHooks();
      this.widgetUI.mount(styles_default);
      if (this._hirePoolAppSession) {
        const onSignOut = typeof hirePoolApp?.onSignOut === "function" ? hirePoolApp.onSignOut : null;
        this._profileWasIncomplete = true;
        this.widgetUI.setProfileFormHandlers?.({
          load: (mode) => this._profileFormRequest("GET", mode),
          save: (values) => this._profileFormRequest("POST", null, values)
        });
        this.widgetUI.setAssistantHandlers?.({
          addCandidate: (candidate) => this._assistantRequest("POST", "bench-candidates", { candidate }, { acceptStatuses: [422] }),
          listJobs: () => this._assistantRequest("GET", "agency-jobs").then((data) => Array.isArray(data?.jobs) ? data.jobs : []),
          submit: (jobId, candidateIds) => this._assistantRequest("POST", "bench-submit", { jobId, candidateIds })
        });
        let lastProgressCheck = 0;
        this.events.on("open", () => {
          if (Date.now() - lastProgressCheck < 1e4) return;
          lastProgressCheck = Date.now();
          this._fetchHirePoolAppWelcome().then((loaded) => {
            if (loaded) this.widgetUI?.updateProfileProgress?.(loaded.welcome.profileProgress || null);
          }).catch(() => {
          });
        });
        this.events.on("profile-form:saved", () => {
          this._fetchHirePoolAppWelcome().then((loaded) => {
            if (loaded) this.widgetUI?.updateProfileProgress?.(loaded.welcome.profileProgress || null);
            this._profileWasIncomplete = Boolean(loaded?.welcome?.profileNudge);
          }).catch(() => {
          });
        });
        this.events.on("action:success", (event) => {
          const data = event?.result?.data || event?.result;
          if (data?.verifiedProfile && data?.verificationStatus === "verified") {
            setTimeout(() => {
              this._continueProfileCompletion().catch(() => {
              });
            }, 1200);
          }
        });
        this.events.on("auth:refresh-needed", () => {
          this._hirePoolAppSession?.invalidate();
        });
        this.events.on("auth:logout", () => {
          const appSession = this._hirePoolAppSession;
          if (appSession) {
            appSession.ended = true;
            appSession.invalidate();
          }
          if (onSignOut) {
            setTimeout(() => {
              try {
                onSignOut();
              } catch (error) {
                console.error("[AssistantSDK] The app could not complete sign-out.", error);
              }
            }, 1500);
          }
        });
      }
      this.initialized = true;
      this.refreshHostIdentity().catch(
        (error) => this.events.emit("error", error)
      );
      if (this._hirePoolAppSession) {
        this._loadHirePoolAppWelcome().catch(
          (error) => this.events.emit("error", error)
        );
      }
      this.events.emit("ready", { assistantId, config: this.config });
      return this;
    }
    _setupIntegrationHooks() {
      if ((this.actionHandlers.size > 0 || this.integration?.actionExecutor || typeof this.apiClient?.confirmDynamicApiAction === "function") && !this.integrationUnsubscribe) {
        this.integrationUnsubscribe = this.events.on(
          "action:execute",
          async (request) => {
            try {
              const handler = this.actionHandlers.get(request.action);
              if (handler) {
                request.resolve(await handler(request.parameters));
              } else if (request.confirmationToken && (this.apiClient.getAuthenticatedSession()?.credential || this._hirePoolBridge?.sdkCredential)) {
                try {
                  request.resolve(
                    await this.apiClient.confirmDynamicApiAction(
                      request.confirmationToken
                    )
                  );
                } catch (confirmError) {
                  if (confirmError?.status === 401 && this._hirePoolBridge) {
                    await this._hirePoolBridge.handleExpiryOn401();
                  }
                  throw confirmError;
                }
              } else if (this.integration?.actionExecutor) {
                request.resolve(
                  await this.integration.executeHostAction(
                    request.action,
                    request.parameters,
                    request.confirmationToken
                  )
                );
              } else {
                throw new Error(
                  "No action handler is registered for this operation"
                );
              }
            } catch (err) {
              request.reject(err);
            }
          }
        );
      }
      if (!this.integrationCancelUnsubscribe) {
        this.integrationCancelUnsubscribe = this.events.on(
          "action:cancel",
          (action) => {
            if (!action?.confirmationToken) return;
            const cancelPromise = this.apiClient?.getAuthenticatedSession?.()?.credential && typeof this.apiClient?.cancelDynamicApiAction === "function" ? this.apiClient.cancelDynamicApiAction(action.confirmationToken) : typeof this.integration?.cancelHostAction === "function" ? this.integration.cancelHostAction({
              confirmationToken: action.confirmationToken
            }) : null;
            if (cancelPromise && typeof cancelPromise.catch === "function") {
              cancelPromise.catch((error) => {
                this.displayNotice(
                  `The action card was cancelled, but its server confirmation could not be revoked: ${error.message}`
                );
                this.events.emit("error", error);
              });
            }
          }
        );
      }
      if (this.integration && this.integrationHookUnsubscribes.length === 0) {
        this.integrationHookUnsubscribes.push(
          this.events.on(
            "action:proposed",
            (action) => this.integration?.notifyActionProposed(action)
          ),
          this.events.on(
            "action:success",
            (result) => this.integration?.notifyActionResult({
              status: "success",
              ...result
            })
          ),
          this.events.on(
            "action:error",
            (result) => this.integration?.notifyActionResult({ status: "error", ...result })
          ),
          this.events.on(
            "error",
            (error) => this.integration?.notifyError(error)
          )
        );
        const unsubscribe = this.integration.subscribeToContextChanges(() => {
          this.refreshContext().catch((error) => {
            this.events.emit("error", error);
          });
        });
        this.integrationHookUnsubscribes.push(unsubscribe);
      }
    }
    _hasActionHandler(actionOrId) {
      const actionId = typeof actionOrId === "string" ? actionOrId : actionOrId?.action;
      if (this.actionHandlers.has(actionId)) {
        return true;
      }
      if (this.config?.assistantId === "hirepool" && actionOrId && typeof actionOrId === "object") {
        const isAccountAction = actionId === HIREPOOL_LOGIN_ACTION || actionId === HIREPOOL_SIGNUP_ACTION;
        const hasToken = typeof actionOrId.confirmationToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(actionOrId.confirmationToken);
        if (hasToken && (this.apiClient?.getAuthenticatedSession?.()?.credential || this._hirePoolBridge?.sdkCredential)) {
          return true;
        }
        if (!this.integration?.actionExecutor) {
          return false;
        }
        return isAccountAction || hasToken;
      }
      if (!this.integration?.actionExecutor) {
        return false;
      }
      return true;
    }
    async attachHostIntegration(config) {
      this._ensureInit();
      if (this.config.assistantId !== "hirepool" || !isHirePoolLocalPublicSiteUrl(window.location.href)) {
        throw new Error(
          "Host integration can only be attached to the local HirePool public website"
        );
      }
      if (this.integration) {
        throw new Error(
          "A host integration is already attached to this assistant"
        );
      }
      const integration = new HostIntegrationAdapter(config);
      this.integration = integration;
      this.apiClient.getAuthHeaders = () => this.integration.getAuthHeaders();
      this.apiClient.credentials = integration.credentials;
      this.widgetUI.options.integration = integration;
      this.config.applicationId = integration.application.id;
      this.config.context = await integration.getContext();
      if (!this.widgetUI.contextOverrideSet) {
        this.widgetUI.setContext(this.config.context, false);
      }
      this._setupIntegrationHooks();
      await this.refreshSessionScope();
      return this;
    }
    async refreshSessionScope({ preserveConversation = true } = {}) {
      this._ensureInit();
      if (!this.integration) {
        throw new Error(
          "A host integration is required to change the assistant session scope"
        );
      }
      const scope = await this.integration.getSessionScope();
      const nextNamespace = `${this.integration.application.id}:${this.config.assistantId}:${scope || "guest"}`;
      if (nextNamespace === this.storageNamespace) return this;
      const previousStorage = this.storage;
      const nextStorage = new AssistantStorage(nextNamespace);
      nextStorage.clear();
      if (preserveConversation) {
        nextStorage.set("documents", previousStorage.get("documents", []));
      }
      this.storageNamespace = nextNamespace;
      this.storage = nextStorage;
      this.widgetUI.storage = nextStorage;
      this.widgetUI._persistState();
      previousStorage.clear();
      return this;
    }
    async resumePendingMessage({ conversationId, message }) {
      this._ensureInit();
      if (typeof conversationId !== "string" || typeof message !== "string" || !message.trim()) {
        throw new TypeError("A conversation ID and pending message are required");
      }
      this.widgetUI.activeConversationId = conversationId;
      this.widgetUI._persistState();
      if (!this.widgetUI.isOpen) this.widgetUI.open();
      return this.widgetUI.sendMessage(message, { displayUserMessage: false });
    }
    /**
     * In-app bot: personal greeting and the next missing profile detail.
     * Falls back silently to the server's generic app greeting on any error.
     */
    /** In-app bot: fetch the personal greeting and the profile-completeness check. */
    async _fetchHirePoolAppWelcome() {
      const session = await this._hirePoolAppSession?.getSession().catch(() => null);
      if (!session?.credential || !this.widgetUI) return null;
      const hour = (/* @__PURE__ */ new Date()).getHours();
      const response = await fetch(
        `${this.config.apiUrl || ""}/api/hirepool/assistant/welcome?hour=${hour}`,
        {
          headers: { Authorization: `Bearer ${session.credential}` },
          credentials: "omit",
          cache: "no-store"
        }
      );
      if (!response.ok) return null;
      return { welcome: await response.json(), session };
    }
    /** In-app bot: load (GET) or save (POST) the profile form. */
    _profileFormRequest(method, mode = "all", values = null) {
      return method === "GET" ? this._assistantRequest("GET", `profile-form?mode=${mode === "missing" ? "missing" : "all"}`) : this._assistantRequest("POST", "profile-form", { values });
    }
    /**
     * In-app bot: call /api/hirepool/assistant/<path> with the signed-in user's
     * assistant credential. Errors carry a friendly `message` and, for invalid
     * input, per-field `fields`. Statuses in `acceptStatuses` return their body.
     */
    async _assistantRequest(method, path, body = null, { acceptStatuses = [] } = {}) {
      const session = await this._hirePoolAppSession?.getSession().catch(() => null);
      if (!session?.credential) {
        throw new Error("Please log in to HirePool again to continue.");
      }
      const url = `${this.config.apiUrl || ""}/api/hirepool/assistant/${path}`;
      const values = body;
      let response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${session.credential}`,
            ...method === "POST" ? { "Content-Type": "application/json" } : {}
          },
          body: method === "POST" ? JSON.stringify(values || {}) : void 0,
          credentials: "omit",
          cache: "no-store"
        });
      } catch {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        throw new Error(
          offline ? "You seem to be offline. Check your connection and try again." : "I couldn't reach the HirePool assistant service just now. Please try again in a moment."
        );
      }
      const data = await response.json().catch(() => null);
      if (!response.ok && acceptStatuses.includes(response.status) && data) return data;
      if (!response.ok) {
        if (response.status === 401) this._hirePoolAppSession?.invalidate();
        const error = new Error(data?.error?.message || data?.message || "Something went wrong. Please try again.");
        error.fields = data?.error?.fields || null;
        error.status = response.status;
        throw error;
      }
      return data;
    }
    /**
     * Pages where the assistant must never pop up (tests, interviews, offers, onboarding).
     */
    _isQuietPage() {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      return /\/(?:screening|ai-interview|interview|video|offers?|onboarding|bgv|joining|checkin)(?:\/|$)/i.test(path);
    }
    /**
     * In-app bot: personal greeting, and — while the profile is incomplete — open
     * the assistant once per login session with the list of missing fields.
     * Falls back silently to the server's generic app greeting on any error.
     */
    async _loadHirePoolAppWelcome() {
      const loaded = await this._fetchHirePoolAppWelcome();
      if (!loaded || !this.widgetUI) return;
      const { welcome, session } = loaded;
      this.widgetUI.setUserRole?.(welcome.role || session.identity?.userType || null);
      const userKey = String(session.identity?.id || "user").slice(0, 80);
      const explicit = this._explicitPresentation || {};
      if (!explicit.greeting && typeof welcome.greeting === "string") {
        this.widgetUI.setGreeting(
          welcome.greeting,
          explicit.suggestedPrompts || (Array.isArray(welcome.suggestedPrompts) ? welcome.suggestedPrompts : [])
        );
      }
      const firstVisitKey = `hirepool-assistant:dashboard-welcomed:${userKey}`;
      const profilePopupKey = `hirepool-assistant:profile-popup:${userKey}`;
      let firstVisit = false;
      let profilePopup = false;
      const welcomeShown = Boolean(this.widgetUI.showAppWelcome?.(welcome));
      if (welcome.profileNudge) {
        const shown = welcomeShown || this.widgetUI.showProfileNudge?.(welcome.profileNudge, userKey);
        try {
          const snoozed = Number(localStorage.getItem(`hirepool-assistant:profile-nudge:${userKey}:snoozed-until`) || 0) > Date.now();
          profilePopup = Boolean(shown) && !snoozed && sessionStorage.getItem(profilePopupKey) !== "1";
        } catch {
          profilePopup = false;
        }
      }
      if (this.config.behavior?.firstVisitOpen && session.identity?.id) {
        try {
          firstVisit = localStorage.getItem(firstVisitKey) !== "1";
        } catch {
          firstVisit = false;
        }
      }
      if (firstVisit || profilePopup) {
        const autoOpen = this.config.behavior?.autoOpen || {};
        this.widgetUI.scheduleAutoOpen?.(
          {
            delayMs: autoOpen.delayMs || 3e4,
            mobile: autoOpen.mobile || "bubble",
            teaser: autoOpen.teaser || "Hi! \u{1F44B} Need help with your dashboard?",
            snoozeHours: autoOpen.snoozeHours ?? 24
          },
          {
            isBlocked: () => this._isQuietPage(),
            onOpen: (how) => {
              try {
                if (firstVisit) localStorage.setItem(firstVisitKey, "1");
                if (profilePopup) sessionStorage.setItem(profilePopupKey, "1");
              } catch {
              }
              this.events.emit("dashboard-popup:opened", {
                how,
                role: welcome.role || null,
                reason: profilePopup ? "profile-incomplete" : "first-visit",
                missing: welcome.profileNudge?.missing || []
              });
            }
          }
        );
      }
      this.events.emit("welcome", { role: welcome.role || null });
    }
    /**
     * After a profile update is saved, move straight on to the next missing field
     * (or celebrate a complete profile).
     */
    async _continueProfileCompletion() {
      const loaded = await this._fetchHirePoolAppWelcome().catch(() => null);
      if (!loaded || !this.widgetUI) return;
      this.widgetUI.updateProfileProgress?.(loaded.welcome.profileProgress || null);
      if (loaded.welcome.profileNudge) {
        const left = Array.isArray(loaded.welcome.profileNudge.missing) ? loaded.welcome.profileNudge.missing.length : 0;
        if (left > 0) {
          this.widgetUI.postAssistantNote?.(
            `${left} profile detail${left === 1 ? "" : "s"} still missing. Say **complete my profile** to fill them in a quick form.`
          );
        }
      } else if (this._profileWasIncomplete) {
        this.widgetUI.postAssistantNote?.("\u{1F389} Your profile is now complete. Nice work! Ask me anything else whenever you like.");
      }
      this._profileWasIncomplete = Boolean(loaded.welcome.profileNudge);
    }
    /** In-app bot: call after the HirePool app refreshes its access token. */
    refreshHirePoolAppSession() {
      this._hirePoolAppSession?.invalidate();
    }
    /**
     * In-app bot: call when the user logs out of the HirePool app. Revokes the
     * assistant credential, clears this tab's conversation, and removes the widget.
     */
    async endHirePoolAppSession() {
      const appSession = this._hirePoolAppSession;
      if (!appSession) return;
      this._hirePoolAppSession = null;
      try {
        this.widgetUI?.clearLocalConversation?.();
      } catch {
      }
      await appSession.end();
      if (this.initialized) this.destroy();
    }
    clearConversationLocal() {
      this._ensureInit();
      this.widgetUI.clearLocalConversation();
    }
    async logout() {
      this._ensureInit();
      let result = null;
      let logoutError = null;
      try {
        result = await this.apiClient.logoutHirePoolSession(
          this.widgetUI?.activeConversationId || null
        );
      } catch (err) {
        logoutError = err;
      }
      const confirmationMessage = logoutError ? `Local assistant credentials were cleared, but server logout could not be confirmed (${logoutError.message}).` : result?.backendRevoked === false ? `You are logged out of this assistant session, though HirePool did not confirm upstream token revocation (${result.reason || "backend revocation unavailable"}).` : "You have been logged out of HirePool.";
      await this.widgetUI?._handleHirePoolLogout?.(
        result || {
          loggedOut: true,
          sdkSessionRevoked: true,
          backendRevoked: false,
          reason: logoutError?.message
        },
        confirmationMessage
      );
      if (logoutError) {
        throw logoutError;
      }
      return result;
    }
    displayNotice(message) {
      if (typeof message !== "string" || !message.trim()) {
        throw new TypeError("A non-empty notice message is required");
      }
      if (!this.widgetUI) {
        console.error(`[AssistantSDK] ${message.trim().slice(0, 500)}`);
        return;
      }
      const safeMessage = message.trim().slice(0, 500).replace(
        /[&<>"']/g,
        (character) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[character]
      );
      const isVerificationError = /could not verify|verification|session/i.test(
        message
      );
      const retryCallback = isVerificationError ? async () => {
        let credential = null;
        if (typeof this.integration?.getAuthHeaders === "function") {
          try {
            const headers = await this.integration.getAuthHeaders();
            const authHeader = headers?.Authorization || headers?.authorization || "";
            credential = authHeader.replace(/^Bearer\s+/i, "").trim() || null;
          } catch {
          }
        }
        if (!credential) {
          credential = this.widgetUI?.storage?.get?.("hirepool_session")?.credential || null;
        }
        if (credential && this.apiClient) {
          const result = await this.apiClient.validateHirePoolSession(credential);
          if (result?.valid) {
            await this.refreshSessionScope({ preserveConversation: true });
            return;
          }
        }
        throw new Error(
          "HirePool login verification failed. Please try signing in again."
        );
      } : null;
      this.widgetUI._renderErrorBanner(safeMessage, retryCallback);
    }
    displayHirePoolLoginNotice(message) {
      this._ensureInit();
      if (!this.widgetUI) {
        return this.displayNotice(message);
      }
      this.widgetUI.displayHirePoolLoginNotice(message);
    }
    invalidatePendingActions(message) {
      this._ensureInit();
      this.widgetUI?.invalidatePendingActions(message);
    }
    isHirePoolAccountWindow(source) {
      return this.config?.assistantId === "hirepool" && isHirePoolAccountWindow(source);
    }
    clearHirePoolAccountWindow(source) {
      return clearHirePoolAccountWindow(source);
    }
    async initHirePool(options = {}) {
      return this.init({
        assistantId: "hirepool",
        name: "HirePool Assistant",
        greeting: HIREPOOL_ASSISTANT_GREETING,
        suggestedPrompts: HIREPOOL_GUEST_SUGGESTED_PROMPTS,
        ...options
      });
    }
    async handleHirePoolAuthMessage(event) {
      if (this._hirePoolBridge) {
        return this._hirePoolBridge.handleAuthMessage(event);
      }
    }
    async setHirePoolAuthSession(data) {
      if (this._hirePoolBridge) {
        return this._hirePoolBridge.setAuthSession(data);
      }
    }
    async clearHirePoolAuthSession(source) {
      if (this._hirePoolBridge) {
        return this._hirePoolBridge.clearAuthSession(source);
      }
    }
    updateHirePoolPath(pathname) {
      if (this._hirePoolBridge) {
        this._hirePoolBridge.updatePath(pathname);
      } else if (this.initialized) {
        this.setContext(createHirePoolPageContext(pathname));
      }
    }
    /**
     * Open the chat panel
     */
    open() {
      this._ensureInit();
      this.widgetUI.open();
    }
    /**
     * Close the chat panel
     */
    close() {
      this._ensureInit();
      this.widgetUI.close();
    }
    /**
     * Toggle the chat panel open/closed
     */
    toggle() {
      this._ensureInit();
      this.widgetUI.toggle();
    }
    /**
     * Programmatically send a message as the user
     * @param {string} text
     */
    async sendMessage(text) {
      this._ensureInit();
      if (!this.widgetUI.isOpen) {
        this.widgetUI.open();
      }
      return this.widgetUI.sendMessage(text);
    }
    /**
     * Standalone summarization helper
     * @param {string} text Text to summarize
     * @param {object} [options]
     * @param {'concise'|'detailed'|'bullet_points'|'key_takeaways'|'action_items'|'structured_json'} [options.style='concise']
     * @param {string} [options.focus] Specific aspect to focus on
     * @param {boolean} [options.stream=false]
     * @param {function} [options.onChunk]
     */
    async summarize(text, options = {}) {
      this._ensureInit();
      return this.apiClient.summarize({
        text,
        style: options.style || "concise",
        focus: options.focus,
        stream: !!options.stream,
        onChunk: options.onChunk
      });
    }
    /**
     * Clear active conversation history
     */
    clearConversation() {
      this._ensureInit();
      return this.widgetUI.newConversation();
    }
    /**
     * Change theme dynamically
     * @param {'light'|'dark'|'auto'} theme
     */
    setTheme(theme) {
      this._ensureInit();
      this.widgetUI.setTheme(theme);
    }
    /**
     * Change launcher position dynamically
     * @param {'bottom-right'|'bottom-left'|'top-right'|'top-left'} position
     */
    setPosition(position) {
      this._ensureInit();
      this.widgetUI.setPosition(position);
    }
    /**
     * Dynamically update host application context for subsequent conversation turns
     * @param {string|null} context Application context string, or null/empty to clear
     */
    setContext(context) {
      this._ensureInit();
      const normalized = serializeContext(context);
      this.config.context = normalized;
      if (this.widgetUI) {
        this.widgetUI.setContext(normalized);
      }
      this.refreshHostIdentity().catch(
        (error) => this.events.emit("error", error)
      );
      this.events.emit("context:updated", { context: normalized });
      return this;
    }
    setGreeting(greeting, suggestedPrompts = []) {
      this._ensureInit();
      const text = typeof greeting === "string" ? greeting : "";
      const prompts = Array.isArray(suggestedPrompts) ? suggestedPrompts.filter((prompt) => typeof prompt === "string") : [];
      this.config.greeting = text;
      this.config.suggestedPrompts = prompts;
      this.widgetUI.setGreeting(text, prompts);
      return this;
    }
    /**
     * Clear active host application context
     */
    clearContext() {
      this._ensureInit();
      if (!this.integration) return this.setContext(null);
      this.widgetUI.contextOverrideSet = false;
      return this.refreshContext();
    }
    async refreshContext() {
      this._ensureInit();
      if (!this.integration) return this.config.context;
      const context = await this.integration.getContext();
      await this.refreshHostIdentity();
      if (!this.widgetUI.contextOverrideSet) {
        this.config.context = context;
        this.widgetUI.setContext(context, false);
      }
      this.events.emit("context:updated", { context });
      return context;
    }
    async refreshHostIdentity() {
      this._ensureInit();
      if (!this.integration || !this.widgetUI) return null;
      const refreshId = ++this.hostIdentityRefreshId;
      const [identity, scope] = await Promise.all([
        this.integration.getIdentity(),
        this.integration.getSessionScope()
      ]);
      if (refreshId !== this.hostIdentityRefreshId || !this.initialized || !this.widgetUI)
        return null;
      this.widgetUI.setHostIdentity(identity, scope);
      return identity;
    }
    getHostIdentity() {
      this._ensureInit();
      return this.integration?.getIdentity() || Promise.resolve(null);
    }
    getHostPermissions() {
      this._ensureInit();
      return this.integration?.getPermissions() || Promise.resolve([]);
    }
    getAvailableActions() {
      this._ensureInit();
      return this.integration?.getAvailableActions() || Promise.resolve([]);
    }
    /**
     * Get current active host application context
     * @returns {string|null}
     */
    getContext() {
      return this.config?.context ?? null;
    }
    /**
     * Register event listener
     * Supported events: 'ready', 'open', 'close', 'message:sent', 'message:received', 'error', 'conversation:cleared', 'context:updated'
     */
    on(event, handler) {
      return this.events.on(event, handler);
    }
    /**
     * Remove event listener
     */
    off(event, handler) {
      this.events.off(event, handler);
    }
    /**
     * Get current state
     */
    getState() {
      return {
        initialized: this.initialized,
        isOpen: this.widgetUI?.isOpen || false,
        isGenerating: this.widgetUI?.isGenerating || false,
        conversationId: this.widgetUI?.activeConversationId || null,
        messageCount: this.widgetUI?.messages?.length || 0,
        context: this.config?.context ?? null,
        config: this.config ? { ...this.config } : null
      };
    }
    /**
     * Clean up widget from DOM and reset SDK state
     */
    destroy() {
      this.initializing = false;
      this.hostIdentityRefreshId += 1;
      if (this.widgetUI) {
        this.widgetUI.unmount();
        this.widgetUI = null;
      }
      this.events.clear();
      this.integrationUnsubscribe?.();
      this.integrationUnsubscribe = null;
      this.integrationCancelUnsubscribe?.();
      this.integrationCancelUnsubscribe = null;
      for (const unsubscribe of this.integrationHookUnsubscribes) unsubscribe();
      this.integrationHookUnsubscribes = [];
      this.integration = null;
      this.actionHandlers.clear();
      this.storage = null;
      this.storageNamespace = null;
      this.apiClient = null;
      this.config = null;
      if (this._hirePoolBridge) {
        this._hirePoolBridge.destroy();
        this._hirePoolBridge = null;
      }
      this._hirePoolAppSession = null;
      this._explicitPresentation = null;
      this.initialized = false;
    }
    _ensureInit() {
      if (!this.initialized) {
        throw new Error(
          "[AssistantSDK] SDK is not initialized. Please call AssistantSDK.init() first."
        );
      }
      const allowedHere = this._hirePoolAppSession ? isHirePoolAppUrl(window.location.href) : isHirePoolPublicSiteUrl(window.location.href);
      if (this.config?.assistantId === "hirepool" && typeof window !== "undefined" && !this._isDemoPage() && !allowedHere) {
        throw new Error("The HirePool assistant is unavailable on this page");
      }
    }
    _detectApiUrl() {
      if (typeof window === "undefined") return "";
      const scripts = document.querySelectorAll('script[src*="assistant.js"]');
      if (scripts.length > 0) {
        const src = scripts[scripts.length - 1].getAttribute("src");
        try {
          const parsed = new URL(src, window.location.href);
          return parsed.origin;
        } catch {
        }
      }
      return window.location.origin;
    }
  };
  var sdkInstance = new AssistantSDK();
  if (typeof window !== "undefined") {
    let autoInitFromScriptTag = function() {
      const scripts = document.querySelectorAll('script[src*="assistant.js"]');
      if (!scripts || scripts.length === 0) return;
      const currentScript = scripts[scripts.length - 1];
      const assistantId = currentScript.getAttribute("data-assistant-id");
      const autoload = currentScript.getAttribute("data-autoload");
      const autoMount = currentScript.getAttribute("data-auto-mount");
      const appId = currentScript.getAttribute("data-app-id");
      const hostIntegration = appId && window.__HIREPOOL_ASSISTANT_HOST__;
      if (assistantId || appId || autoload === "true" || autoMount === "true" || currentScript.hasAttribute("data-auto-mount")) {
        const options = {
          assistantId: assistantId || "hirepool",
          apiUrl: currentScript.getAttribute("data-api-url") || void 0,
          theme: currentScript.getAttribute("data-theme") || void 0,
          primaryColor: currentScript.getAttribute("data-primary-color") || void 0,
          position: currentScript.getAttribute("data-position") || void 0,
          greeting: currentScript.getAttribute("data-greeting") || void 0,
          context: currentScript.getAttribute("data-context") || void 0,
          integration: appId ? {
            version: 1,
            application: { id: appId, name: appId },
            ...typeof hostIntegration?.getAuthHeaders === "function" ? { getAuthHeaders: () => hostIntegration.getAuthHeaders() } : {},
            ...typeof hostIntegration?.getSessionScope === "function" ? { getSessionScope: () => hostIntegration.getSessionScope() } : {}
          } : void 0
        };
        Object.keys(options).forEach(
          (k) => options[k] === void 0 && delete options[k]
        );
        sdkInstance.init(options).catch((err) => {
          console.error("[AssistantSDK] Auto-initialization failed:", err);
        });
      }
    };
    window.AssistantSDK = sdkInstance;
    window.HirePoolAssistant = sdkInstance;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoInitFromScriptTag);
    } else {
      autoInitFromScriptTag();
    }
  }
  var sdk_default = sdkInstance;
  return __toCommonJS(sdk_exports);
})();
//# sourceMappingURL=assistant.js.map
