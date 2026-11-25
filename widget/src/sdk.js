import { AssistantWidgetUI } from "./widget.js";
import { AssistantApiClient } from "./api-client.js";
import { AssistantStorage } from "./storage.js";
import { HostIntegrationAdapter, serializeContext } from "./integration.js";
import cssText from "./styles.css";
import { normalizeDocumentUploadSettings } from "../../config/document-upload.js";
import {
  HIREPOOL_LOGIN_ACTION,
  HIREPOOL_SIGNUP_ACTION,
  clearHirePoolAccountWindow,
  isHirePoolAccountWindow,
  openHirePoolLogin,
  openHirePoolSignup,
} from "./hirepool-login.js";
import {
  HirePoolBridge,
  HIREPOOL_ASSISTANT_GREETING,
  HIREPOOL_GUEST_SUGGESTED_PROMPTS,
  createHirePoolPageContext,
} from "./hirepool-bridge.js";
import {
  isHirePoolAppUrl,
  isHirePoolLocalPublicSiteUrl,
  isHirePoolPublicSiteUrl,
} from "../../config/hirepool-site-policy.js";
import { HirePoolAppSession } from "./hirepool-app-session.js";

/**
 * Event emitter for SDK lifecycle and conversation events
 */
class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
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
}

/**
 * Main SDK Class
 */
class AssistantSDK {
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
    this.actionHandlers = new Map();
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
      ...options,
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
        "[AssistantSDK] SDK is already initialized. Call AssistantSDK.destroy() before reinitializing.",
      );
      return this;
    }
    if (this.initializing) {
      return this;
    }

    const assistantId = options.assistantId ?? "hirepool";
    if (
      typeof assistantId !== "string" ||
      assistantId.length < 1 ||
      assistantId.length > 64 ||
      !/^[a-zA-Z0-9_-]+$/.test(assistantId)
    ) {
      throw new TypeError(
        "assistantId must contain 1-64 letters, numbers, underscores, or hyphens",
      );
    }
    const isDemo = this._isDemoPage();
    // In-app bot: the logged-in HirePool app passes hirePoolApp.getAccessToken.
    const hirePoolApp =
      assistantId === "hirepool" && options.hirePoolApp ? options.hirePoolApp : null;
    if (
      hirePoolApp &&
      typeof window !== "undefined" &&
      !isDemo &&
      !isHirePoolAppUrl(window.location.href)
    ) {
      throw new Error(
        "The in-app HirePool assistant is available only inside the HirePool app",
      );
    }
    if (
      !hirePoolApp &&
      assistantId === "hirepool" &&
      typeof window !== "undefined" &&
      !isDemo &&
      !isHirePoolPublicSiteUrl(window.location.href)
    ) {
      throw new Error(
        "The HirePool assistant is available only on approved public website pages",
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
      if (
        !["http:", "https:"].includes(parsedApiUrl.protocol) ||
        parsedApiUrl.username ||
        parsedApiUrl.password ||
        parsedApiUrl.pathname !== "/" ||
        parsedApiUrl.search ||
        parsedApiUrl.hash
      ) {
        throw new TypeError(
          "apiUrl must be an HTTP or HTTPS origin without credentials, path, query, or fragment",
        );
      }
    }
    if (hirePoolApp) {
      this._hirePoolAppSession = new HirePoolAppSession({
        apiUrl,
        getAccessToken: hirePoolApp.getAccessToken,
      });
      options.integration = this._hirePoolAppSession.getHostIntegrationConfig(this);
      this._explicitPresentation = {
        name: options.name,
        greeting: options.greeting,
        suggestedPrompts: options.suggestedPrompts,
      };
      if (!options.name) options.name = "HirePool Assistant";
      if (!options.context && typeof window !== "undefined") {
        options.context = { surface: "app", page: window.location.pathname };
      }
    } else if (assistantId === "hirepool" || assistantId === "default") {
      if (!this._hirePoolBridge) {
        this._hirePoolBridge = new HirePoolBridge(this, {
          initialPath:
            options.initialPath ||
            (typeof window !== "undefined" ? window.location.pathname : "/"),
        });
      }
      if (!options.integration) {
        options.integration = this._hirePoolBridge.getHostIntegrationConfig();
      }
      // Remember what the host set itself, so the server's website/app wording
      // can replace the generic HirePool defaults below.
      this._explicitPresentation = {
        name: options.name,
        greeting: options.greeting,
        suggestedPrompts: options.suggestedPrompts,
      };
      if (!options.greeting) options.greeting = HIREPOOL_ASSISTANT_GREETING;
      if (!options.suggestedPrompts)
        options.suggestedPrompts = HIREPOOL_GUEST_SUGGESTED_PROMPTS;
      if (!options.name) options.name = "HirePool Assistant";
      if (!options.context) options.context = this._hirePoolBridge.getContext();
    }
    const integration = options.integration
      ? new HostIntegrationAdapter(options.integration)
      : null;
    const sessionScope = integration
      ? await integration.getSessionScope()
      : null;
    const initialContext = serializeContext(options.context);
    const documentUpload = normalizeDocumentUploadSettings(
      options.documentUpload,
    );
    this.initializing = true;

    this.integration = integration;
    this.actionHandlers.clear();
    if (!hirePoolApp && (assistantId === "hirepool" || assistantId === "default")) {
      this.actionHandlers.set(HIREPOOL_LOGIN_ACTION, () =>
        openHirePoolLogin({
          currentUrl: window.location.href,
          openWindow: (...args) => window.open(...args),
        }),
      );
      this.actionHandlers.set(HIREPOOL_SIGNUP_ACTION, () =>
        openHirePoolSignup({
          currentUrl: window.location.href,
          openWindow: (...args) => window.open(...args),
        }),
      );
    }
    this.apiClient = new AssistantApiClient(apiUrl, {
      assistantId,
      getAuthHeaders: this.integration
        ? () => this.integration.getAuthHeaders()
        : undefined,
      credentials: this.integration?.credentials,
    });
    const storageNamespace = integration
      ? `${integration.application.id}:${assistantId}:${sessionScope || "guest"}`
      : assistantId;
    this.storageNamespace = storageNamespace;
    this.storage = new AssistantStorage(storageNamespace);

    // Fetch server-side public configuration for this assistant
    let serverConfig = {};
    try {
      serverConfig = await this.apiClient.fetchConfig(assistantId);
    } catch (err) {
      console.warn(
        `[AssistantSDK] Could not fetch remote configuration for "${assistantId}", using fallback defaults.`,
        err.message,
      );
    }

    // HirePool website/app surfaces: server wording wins over generic defaults,
    // but never over values the host passed explicitly.
    const surface =
      serverConfig.surface === "website" || serverConfig.surface === "app"
        ? serverConfig.surface
        : null;
    if (surface && this._explicitPresentation) {
      const explicit = this._explicitPresentation;
      if (!explicit.name && serverConfig.name) options.name = serverConfig.name;
      if (!explicit.greeting && serverConfig.greeting)
        options.greeting = serverConfig.greeting;
      if (!explicit.suggestedPrompts && Array.isArray(serverConfig.suggestedPrompts))
        options.suggestedPrompts = serverConfig.suggestedPrompts;
    }

    // Merge configurations (server configuration merged with client runtime overrides)
    this.config = {
      surface,
      behavior:
        serverConfig.behavior && typeof serverConfig.behavior === "object"
          ? serverConfig.behavior
          : {},
      assistantId,
      apiUrl,
      name: options.name || serverConfig.name || "HirePool Assistant",
      description:
        options.description ||
        serverConfig.description ||
        "Your AI talent and recruitment partner for HirePool",
      avatarUrl: options.avatarUrl || serverConfig.avatarUrl || "",
      theme: options.theme || serverConfig.theme || "auto",
      primaryColor:
        options.primaryColor || serverConfig.primaryColor || "#a3e635",
      position: options.position || serverConfig.position || "bottom-right",
      greeting:
        options.greeting ||
        serverConfig.greeting ||
        HIREPOOL_ASSISTANT_GREETING,
      suggestedPrompts:
        options.suggestedPrompts ||
        serverConfig.suggestedPrompts ||
        HIREPOOL_GUEST_SUGGESTED_PROMPTS,
      context: initialContext,
      applicationId: this.integration?.application.id || null,
      documentUpload,
      features: {
        ...(serverConfig.features || {}),
        ...(options.features || {}),
      },
    };

    if (!this.initializing) {
      return this;
    }
    this.initializing = false;

    // Instantiate and mount widget UI
    this.widgetUI = new AssistantWidgetUI(
      {
        ...this.config,
        integration: this.integration,
        hasActionHandler: (action) => this._hasActionHandler(action),
      },
      this.apiClient,
      this.storage,
      this.events,
    );
    this._setupIntegrationHooks();
    this.widgetUI.mount(cssText);

    // In-app bot: "logout" in the chat ends the HirePool session, so the app
    // must log out too. Stop using the old credential and tell the host app.
    if (this._hirePoolAppSession) {
      const onSignOut =
        typeof hirePoolApp?.onSignOut === "function" ? hirePoolApp.onSignOut : null;
      // A request was rejected as signed out: get a fresh assistant login from
      // the app's current token before the widget's single retry.
      this._profileWasIncomplete = true;
      this.widgetUI.setProfileFormHandlers?.({
        load: (mode) => this._profileFormRequest("GET", mode),
        save: (values) => this._profileFormRequest("POST", null, values),
      });
      // Agency dashboard: resumes -> bench, bench -> a job.
      this.widgetUI.setAssistantHandlers?.({
        addCandidate: (candidate) =>
          this._assistantRequest("POST", "bench-candidates", { candidate }, { acceptStatuses: [422] }),
        listJobs: () => this._assistantRequest("GET", "agency-jobs").then((data) => (Array.isArray(data?.jobs) ? data.jobs : [])),
        submit: (jobId, candidateIds) => this._assistantRequest("POST", "bench-submit", { jobId, candidateIds }),
      });
      // The profile can also change in the dashboard itself: re-check when the chat is opened
      // (at most every 10 seconds) so the progress card never shows an old percentage.
      let lastProgressCheck = 0;
      this.events.on("open", () => {
        if (Date.now() - lastProgressCheck < 10000) return;
        lastProgressCheck = Date.now();
        this._fetchHirePoolAppWelcome()
          .then((loaded) => {
            if (loaded) this.widgetUI?.updateProfileProgress?.(loaded.welcome.profileProgress || null);
          })
          .catch(() => {});
      });
      // After the profile form saves, refresh the welcome's progress with the real numbers.
      this.events.on("profile-form:saved", () => {
        this._fetchHirePoolAppWelcome()
          .then((loaded) => {
            if (loaded) this.widgetUI?.updateProfileProgress?.(loaded.welcome.profileProgress || null);
            this._profileWasIncomplete = Boolean(loaded?.welcome?.profileNudge);
          })
          .catch(() => {});
      });
      this.events.on("action:success", (event) => {
        // Profile updates (all three roles) come back with a verified profile read.
        const data = event?.result?.data || event?.result;
        if (data?.verifiedProfile && data?.verificationStatus === "verified") {
          setTimeout(() => {
            this._continueProfileCompletion().catch(() => {});
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
          // Give the user a moment to read the confirmation first.
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
    this.refreshHostIdentity().catch((error) =>
      this.events.emit("error", error),
    );
    if (this._hirePoolAppSession) {
      this._loadHirePoolAppWelcome().catch((error) =>
        this.events.emit("error", error),
      );
    }
    this.events.emit("ready", { assistantId, config: this.config });

    return this;
  }

  _setupIntegrationHooks() {
    if (
      (this.actionHandlers.size > 0 ||
        this.integration?.actionExecutor ||
        typeof this.apiClient?.confirmDynamicApiAction === "function") &&
      !this.integrationUnsubscribe
    ) {
      this.integrationUnsubscribe = this.events.on(
        "action:execute",
        async (request) => {
          try {
            const handler = this.actionHandlers.get(request.action);
            if (handler) {
              request.resolve(await handler(request.parameters));
            } else if (
              request.confirmationToken &&
              (this.apiClient.getAuthenticatedSession()?.credential ||
                this._hirePoolBridge?.sdkCredential)
            ) {
              try {
                request.resolve(
                  await this.apiClient.confirmDynamicApiAction(
                    request.confirmationToken,
                  ),
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
                  request.confirmationToken,
                ),
              );
            } else {
              throw new Error(
                "No action handler is registered for this operation",
              );
            }
          } catch (err) {
            request.reject(err);
          }
        },
      );
    }
    if (!this.integrationCancelUnsubscribe) {
      this.integrationCancelUnsubscribe = this.events.on(
        "action:cancel",
        (action) => {
          if (!action?.confirmationToken) return;
          const cancelPromise =
            this.apiClient?.getAuthenticatedSession?.()?.credential &&
            typeof this.apiClient?.cancelDynamicApiAction === "function"
              ? this.apiClient.cancelDynamicApiAction(action.confirmationToken)
              : typeof this.integration?.cancelHostAction === "function"
                ? this.integration.cancelHostAction({
                    confirmationToken: action.confirmationToken,
                  })
                : null;
          if (cancelPromise && typeof cancelPromise.catch === "function") {
            cancelPromise.catch((error) => {
              this.displayNotice(
                `The action card was cancelled, but its server confirmation could not be revoked: ${error.message}`,
              );
              this.events.emit("error", error);
            });
          }
        },
      );
    }
    if (this.integration && this.integrationHookUnsubscribes.length === 0) {
      this.integrationHookUnsubscribes.push(
        this.events.on("action:proposed", (action) =>
          this.integration?.notifyActionProposed(action),
        ),
        this.events.on("action:success", (result) =>
          this.integration?.notifyActionResult({
            status: "success",
            ...result,
          }),
        ),
        this.events.on("action:error", (result) =>
          this.integration?.notifyActionResult({ status: "error", ...result }),
        ),
        this.events.on("error", (error) =>
          this.integration?.notifyError(error),
        ),
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
    const actionId =
      typeof actionOrId === "string" ? actionOrId : actionOrId?.action;
    if (this.actionHandlers.has(actionId)) {
      return true;
    }
    if (
      this.config?.assistantId === "hirepool" &&
      actionOrId &&
      typeof actionOrId === "object"
    ) {
      const isAccountAction =
        actionId === HIREPOOL_LOGIN_ACTION ||
        actionId === HIREPOOL_SIGNUP_ACTION;
      const hasToken =
        typeof actionOrId.confirmationToken === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(actionOrId.confirmationToken);
      if (
        hasToken &&
        (this.apiClient?.getAuthenticatedSession?.()?.credential ||
          this._hirePoolBridge?.sdkCredential)
      ) {
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
    if (
      this.config.assistantId !== "hirepool" ||
      !isHirePoolLocalPublicSiteUrl(window.location.href)
    ) {
      throw new Error(
        "Host integration can only be attached to the local HirePool public website",
      );
    }
    if (this.integration) {
      throw new Error(
        "A host integration is already attached to this assistant",
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
        "A host integration is required to change the assistant session scope",
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
    if (
      typeof conversationId !== "string" ||
      typeof message !== "string" ||
      !message.trim()
    ) {
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
    const hour = new Date().getHours();
    const response = await fetch(
      `${this.config.apiUrl || ""}/api/hirepool/assistant/welcome?hour=${hour}`,
      {
        headers: { Authorization: `Bearer ${session.credential}` },
        credentials: "omit",
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    return { welcome: await response.json(), session };
  }

  /** In-app bot: load (GET) or save (POST) the profile form. */
  _profileFormRequest(method, mode = "all", values = null) {
    return method === "GET"
      ? this._assistantRequest("GET", `profile-form?mode=${mode === "missing" ? "missing" : "all"}`)
      : this._assistantRequest("POST", "profile-form", { values });
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
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "POST" ? JSON.stringify(values || {}) : undefined,
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      throw new Error(
        offline
          ? "You seem to be offline. Check your connection and try again."
          : "I couldn't reach the HirePool assistant service just now. Please try again in a moment.",
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
        explicit.suggestedPrompts ||
          (Array.isArray(welcome.suggestedPrompts) ? welcome.suggestedPrompts : []),
      );
    }

    // Reasons to pop the assistant open: the first dashboard visit in this
    // browser (e.g. right after signup), or an incomplete profile (once per
    // login session). Either way it opens only after 30 seconds on the page.
    const firstVisitKey = `hirepool-assistant:dashboard-welcomed:${userKey}`;
    const profilePopupKey = `hirepool-assistant:profile-popup:${userKey}`;
    let firstVisit = false;
    let profilePopup = false;
    // Interactive welcome (task cards + profile progress) when no conversation is under way;
    // otherwise the separate reminder card, once per login session.
    const welcomeShown = Boolean(this.widgetUI.showAppWelcome?.(welcome));
    if (welcome.profileNudge) {
      const shown = welcomeShown || this.widgetUI.showProfileNudge?.(welcome.profileNudge, userKey);
      try {
        const snoozed = Number(localStorage.getItem(`hirepool-assistant:profile-nudge:${userKey}:snoozed-until`) || 0) > Date.now();
        profilePopup = Boolean(shown) && !snoozed && sessionStorage.getItem(profilePopupKey) !== "1";
      } catch {
        profilePopup = false; // storage blocked: never pop up repeatedly
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
          delayMs: autoOpen.delayMs || 30000,
          mobile: autoOpen.mobile || "bubble",
          teaser: autoOpen.teaser || "Hi! 👋 Need help with your dashboard?",
          snoozeHours: autoOpen.snoozeHours ?? 24,
        },
        {
          isBlocked: () => this._isQuietPage(),
          onOpen: (how) => {
            try {
              if (firstVisit) localStorage.setItem(firstVisitKey, "1");
              if (profilePopup) sessionStorage.setItem(profilePopupKey, "1");
            } catch {}
            this.events.emit("dashboard-popup:opened", {
              how,
              role: welcome.role || null,
              reason: profilePopup ? "profile-incomplete" : "first-visit",
              missing: welcome.profileNudge?.missing || [],
            });
          },
        },
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
    // Keep the welcome's progress card in step with the saved profile.
    this.widgetUI.updateProfileProgress?.(loaded.welcome.profileProgress || null);
    if (loaded.welcome.profileNudge) {
      // A short line, not the full reminder card again after every save.
      const left = Array.isArray(loaded.welcome.profileNudge.missing) ? loaded.welcome.profileNudge.missing.length : 0;
      if (left > 0) {
        this.widgetUI.postAssistantNote?.(
          `${left} profile detail${left === 1 ? "" : "s"} still missing. Say **complete my profile** to fill them in a quick form.`,
        );
      }
    } else if (this._profileWasIncomplete) {
      this.widgetUI.postAssistantNote?.("🎉 Your profile is now complete. Nice work! Ask me anything else whenever you like.");
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
    } catch {}
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
        this.widgetUI?.activeConversationId || null,
      );
    } catch (err) {
      logoutError = err;
    }
    const confirmationMessage = logoutError
      ? `Local assistant credentials were cleared, but server logout could not be confirmed (${logoutError.message}).`
      : result?.backendRevoked === false
        ? `You are logged out of this assistant session, though HirePool did not confirm upstream token revocation (${result.reason || "backend revocation unavailable"}).`
        : "You have been logged out of HirePool.";
    await this.widgetUI?._handleHirePoolLogout?.(
      result || {
        loggedOut: true,
        sdkSessionRevoked: true,
        backendRevoked: false,
        reason: logoutError?.message,
      },
      confirmationMessage,
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
    const safeMessage = message
      .trim()
      .slice(0, 500)
      .replace(
        /[&<>"']/g,
        (character) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[character],
      );

    const isVerificationError = /could not verify|verification|session/i.test(
      message,
    );
    const retryCallback = isVerificationError
      ? async () => {
          let credential = null;
          if (typeof this.integration?.getAuthHeaders === "function") {
            try {
              const headers = await this.integration.getAuthHeaders();
              const authHeader =
                headers?.Authorization || headers?.authorization || "";
              credential = authHeader.replace(/^Bearer\s+/i, "").trim() || null;
            } catch {}
          }
          if (!credential) {
            credential =
              this.widgetUI?.storage?.get?.("hirepool_session")?.credential ||
              null;
          }
          if (credential && this.apiClient) {
            const result =
              await this.apiClient.validateHirePoolSession(credential);
            if (result?.valid) {
              await this.refreshSessionScope({ preserveConversation: true });
              return;
            }
          }
          throw new Error(
            "HirePool login verification failed. Please try signing in again.",
          );
        }
      : null;

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
    return (
      this.config?.assistantId === "hirepool" && isHirePoolAccountWindow(source)
    );
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
      ...options,
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
      onChunk: options.onChunk,
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
    this.refreshHostIdentity().catch((error) =>
      this.events.emit("error", error),
    );
    this.events.emit("context:updated", { context: normalized });
    return this;
  }

  setGreeting(greeting, suggestedPrompts = []) {
    this._ensureInit();
    const text = typeof greeting === "string" ? greeting : "";
    const prompts = Array.isArray(suggestedPrompts)
      ? suggestedPrompts.filter((prompt) => typeof prompt === "string")
      : [];
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
      this.integration.getSessionScope(),
    ]);
    if (
      refreshId !== this.hostIdentityRefreshId ||
      !this.initialized ||
      !this.widgetUI
    )
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
      config: this.config ? { ...this.config } : null,
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
    // Unmounting (e.g. leaving the app layout) does not revoke the credential;
    // endHirePoolAppSession() does that on logout.
    this._hirePoolAppSession = null;
    this._explicitPresentation = null;
    this.initialized = false;
  }

  _ensureInit() {
    if (!this.initialized) {
      throw new Error(
        "[AssistantSDK] SDK is not initialized. Please call AssistantSDK.init() first.",
      );
    }
    const allowedHere = this._hirePoolAppSession
      ? isHirePoolAppUrl(window.location.href)
      : isHirePoolPublicSiteUrl(window.location.href);
    if (
      this.config?.assistantId === "hirepool" &&
      typeof window !== "undefined" &&
      !this._isDemoPage() &&
      !allowedHere
    ) {
      throw new Error("The HirePool assistant is unavailable on this page");
    }
  }

  _detectApiUrl() {
    if (typeof window === "undefined") return "";
    // If the script was loaded from a URL like http://localhost:3000/sdk/assistant.js,
    // detect that origin automatically
    const scripts = document.querySelectorAll('script[src*="assistant.js"]');
    if (scripts.length > 0) {
      const src = scripts[scripts.length - 1].getAttribute("src");
      try {
        const parsed = new URL(src, window.location.href);
        return parsed.origin;
      } catch {}
    }
    return window.location.origin;
  }
}

// Global instance
const sdkInstance = new AssistantSDK();

// Auto-initialize if script element includes data-assistant-id, data-autoload="true", or data-auto-mount="true"
if (typeof window !== "undefined") {
  window.AssistantSDK = sdkInstance;
  window.HirePoolAssistant = sdkInstance;

  function autoInitFromScriptTag() {
    const scripts = document.querySelectorAll('script[src*="assistant.js"]');
    if (!scripts || scripts.length === 0) return;

    const currentScript = scripts[scripts.length - 1];
    const assistantId = currentScript.getAttribute("data-assistant-id");
    const autoload = currentScript.getAttribute("data-autoload");
    const autoMount = currentScript.getAttribute("data-auto-mount");

    const appId = currentScript.getAttribute("data-app-id");
    const hostIntegration = appId && window.__HIREPOOL_ASSISTANT_HOST__;
    if (
      assistantId ||
      appId ||
      autoload === "true" ||
      autoMount === "true" ||
      currentScript.hasAttribute("data-auto-mount")
    ) {
      const options = {
        assistantId: assistantId || "hirepool",
        apiUrl: currentScript.getAttribute("data-api-url") || undefined,
        theme: currentScript.getAttribute("data-theme") || undefined,
        primaryColor:
          currentScript.getAttribute("data-primary-color") || undefined,
        position: currentScript.getAttribute("data-position") || undefined,
        greeting: currentScript.getAttribute("data-greeting") || undefined,
        context: currentScript.getAttribute("data-context") || undefined,
        integration: appId
          ? {
              version: 1,
              application: { id: appId, name: appId },
              ...(typeof hostIntegration?.getAuthHeaders === "function"
                ? { getAuthHeaders: () => hostIntegration.getAuthHeaders() }
                : {}),
              ...(typeof hostIntegration?.getSessionScope === "function"
                ? { getSessionScope: () => hostIntegration.getSessionScope() }
                : {}),
            }
          : undefined,
      };

      // Remove undefined keys
      Object.keys(options).forEach(
        (k) => options[k] === undefined && delete options[k],
      );

      sdkInstance.init(options).catch((err) => {
        console.error("[AssistantSDK] Auto-initialization failed:", err);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInitFromScriptTag);
  } else {
    autoInitFromScriptTag();
  }
}

export default sdkInstance;
