import { parseMarkdown, escapeHtml } from './markdown.js';
import { getHirePoolGreetingForAuthState } from './hirepool-bridge.js';
import { openHirePoolLogin } from './hirepool-login.js';
import { AutoOpenController } from './auto-open.js';
import { IdleNudgeController, pickIdleNudge } from './idle-nudge.js';
import { describeAssistantError } from './error-messages.js';
import {
  formatHirePoolResumeSize,
  HIREPOOL_RESUME_STATES,
  HirePoolResumeUpload
} from './hirepool-resume.js';
import {
  HirePoolSignupCoordinator,
  HIREPOOL_SIGNUP_STATES,
  ROLE_DEFINITIONS,
  parseHirePoolRoleChoice,
  renderRoleSelectionCard,
  renderSignupFormCard,
  renderVerificationCard,
  renderProfileCollectionCard,
  renderProfileReviewCard
} from './hirepool-signup.js';

// Bump when the website chat layout changes, so old saved welcomes are not restored.
const WEBSITE_UI_VERSION = 'role-cards-4';

// SVG Icons
const ICONS = {
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

export class AssistantWidgetUI {
  constructor(options, apiClient, storage, events) {
    this.options = options;
    this.apiClient = apiClient;
    this.storage = storage;
    this.events = events;
    this._initialGreeting = options.greeting || '';
    this._initialSuggestedPrompts = Array.isArray(options.suggestedPrompts)
      ? [...options.suggestedPrompts]
      : [];

    this.isOpen = false;
    this.isGenerating = false;
    this.abortController = null;
    this.documentUploadController = null;
    this.hirePoolResume = new HirePoolResumeUpload(
      apiClient,
      state => this._renderHirePoolResumeState(state)
    );
    this.hirePoolResumeCard = null;
    this.hirePoolSignup = new HirePoolSignupCoordinator({
      apiClient: this.apiClient,
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
  mount(cssContent = '') {
    // Prevent duplicate DOM attachment
    if (this.hostElement && this.hostElement.parentNode) {
      return;
    }
    if (document.getElementById('ai-assistant-plugin-root')) {
      throw new Error('An AI Assistant widget is already mounted on this page.');
    }

    this.hostElement = document.createElement('div');
    this.hostElement.id = 'ai-assistant-plugin-root';
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

    // Inject CSS
    const styleTag = document.createElement('style');
    styleTag.textContent = cssContent;
    this.shadowRoot.appendChild(styleTag);

    // Build DOM structure
    this._buildDOM();

    // Restore conversation history from session storage
    this._restoreState();

    // Attach event listeners
    this._attachEvents();

    this._authMessageHandler = (event) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'hirepool-auth:logout') {
        void this._handleHirePoolLogout({ loggedOut: true }, 'You have been logged out of HirePool.');
      }
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('message', this._authMessageHandler);
    }

    document.body.appendChild(this.hostElement);
    if (this.options?.surface === 'website' || this.options?.surface === 'app') {
      // HirePool look on the website and in the dashboards: dark header, pill input, roomy bubbles.
      this.container.classList.add('ai-theme-hirepool');
      if (this.textarea) this.textarea.placeholder = 'Type your question…';
    }
    if (this.options?.surface === 'website') {
      // Website only: the Sign in / Sign up bar.
      this.container.classList.add('ai-surface-website');
    }
    if (this.options?.surface === 'website' && this.options?.behavior?.welcome) {
      // The welcome is a real chat message on the website, so the static box is hidden.
      this.container.classList.add('ai-chat-welcome');
    }
    this._setupIdleNudges();
    this._setupAutoOpen();
  }

  /**
   * Unmount widget and clean up DOM
   */
  unmount() {
    if (this._authMessageHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('message', this._authMessageHandler);
      this._authMessageHandler = null;
    }
    this._stopVerificationWatcher();
    this._autoOpenController?.stop();
    this._autoOpenController = null;
    if (this._onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this._onlineHandler);
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

    const container = document.createElement('div');
    container.className = `ai-widget-container pos-${position || 'bottom-right'}`;
    container.setAttribute('data-theme', theme || 'auto');
    if (primaryColor) {
      container.style.setProperty('--ai-primary', primaryColor);
      container.style.setProperty('--ai-user-bubble', primaryColor);
    }
    this.container = container;

    // Floating Launcher Button
    const launcherBtn = document.createElement('button');
    launcherBtn.className = 'ai-launcher-btn';
    launcherBtn.type = 'button';
    launcherBtn.setAttribute('aria-label', `Open ${name}`);
    launcherBtn.setAttribute('aria-haspopup', 'dialog');
    launcherBtn.setAttribute('aria-expanded', 'false');
    launcherBtn.innerHTML = `
      <span class="icon-chat">${ICONS.chat}</span>
      <span class="icon-close">${ICONS.launcherClose}</span>
      <span class="ai-launcher-badge" aria-hidden="true">.ai</span>
    `;
    this.launcherBtn = launcherBtn;

    // Chat Panel Dialog
    const panel = document.createElement('div');
    panel.className = 'ai-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', name);

    // Header
    const avatarHtml = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)} avatar"/>`
      : `<span class="ai-avatar-icon">${ICONS.chat}</span>`;

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
          <div class="ai-welcome-greeting">${parseMarkdown(String(greeting || ''))}</div>
          ${suggestedPrompts && suggestedPrompts.length > 0 ? `
            <div class="ai-suggested-prompts">
            <div class="ai-suggested-prompts-label">Suggested Prompts</div>
            <div class="ai-prompts-list">
              ${suggestedPrompts.map(p => `<button type="button" class="ai-prompt-pill">${escapeHtml(p)}</button>`).join('')}
            </div>
            </div>
          ` : ''}
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
    this.messagesList = panel.querySelector('.ai-messages-list');
    this.streamingIndicator = panel.querySelector('.ai-streaming-indicator');
    this.statusDot = panel.querySelector('.ai-status-dot');
    this.statusText = panel.querySelector('.ai-status-text');
    this.textarea = panel.querySelector('.ai-textarea');
    this.sendBtn = panel.querySelector('.ai-send-btn');
    this.stopBtn = panel.querySelector('.ai-stop-btn');
    this.attachBtn = panel.querySelector('.ai-attach-btn');
    this.fileInput = panel.querySelector('.ai-file-input');
    if (this._isHirePoolResumeEnabled()) {
      this.attachBtn.disabled = true;
      this.attachBtn.title = 'Sign in to a verified HirePool candidate account to upload a resume.';
      this.attachBtn.setAttribute('aria-label', this.attachBtn.title);
    }
    this.fileInput.accept = this._isHirePoolResumeEnabled()
      ? '.pdf,application/pdf'
      : this.options.documentUpload?.allowedExtensions?.join(',') || '.pdf,.docx,.txt';
    if (this.options?.surface === 'website') {
      this.attachBtn.title = 'Upload a resume, job description or candidate list (PDF, DOCX, TXT)';
      this.attachBtn.setAttribute('aria-label', this.attachBtn.title);
    }
    this.body = panel.querySelector('.ai-body');

    container.appendChild(panel);
    container.appendChild(launcherBtn);
    this.shadowRoot.appendChild(container);
  }

  _attachEvents() {
    // Toggle Launcher
    this.launcherBtn.addEventListener('click', () => {
      this.toggle();
    });

    // Website: Sign in / Sign up buttons (bar before the chat starts, header pills after).
    this.panel.querySelectorAll('[data-auth]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.auth === 'signin') {
          this._goToLogin();
        } else if (!this.isGenerating) {
          this._clearRoleCards();
          this._clearQuickReplies();
          void this.sendMessage('Sign up for HirePool');
        }
      });
    });

    // Close button in header
    this.panel.querySelector('.btn-close').addEventListener('click', () => {
      this.close();
    });

    // New Chat button in header
    this.panel.querySelector('.btn-new-chat').addEventListener('click', () => {
      this.newConversation();
    });

    // Stop button
    this.stopBtn.addEventListener('click', () => {
      this.cancelGeneration();
    });

    // Suggested prompt pills
    this.panel.querySelectorAll('.ai-prompt-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = e.target.textContent.trim();
        if (text) {
          this.sendMessage(text);
        }
      });
    });

    // Input form & textarea auto-grow
    this.textarea.addEventListener('input', () => {
      this.textarea.style.height = 'auto';
      this.textarea.style.height = Math.min(this.textarea.scrollHeight, 120) + 'px';
      this.sendBtn.disabled = !this.textarea.value.trim() || this.isGenerating;
    });

    // Enter to send, Shift+Enter for newline
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = this.textarea.value.trim();
        if (text && !this.isGenerating) {
          this.sendMessage(text);
        }
      }
    });

    // Submit form
    this.panel.querySelector('.ai-input-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.textarea.value.trim();
      if (text && !this.isGenerating) {
        this.sendMessage(text);
      }
    });

    // Attachment button & file upload
    if (this.attachBtn && this.fileInput) {
      this.attachBtn.addEventListener('click', () => {
        if (this.isGenerating) return;
        if (this._isHirePoolResumeEnabled() &&
            this.hirePoolResume.state === HIREPOOL_RESUME_STATES.UPLOADING) return;
        this.fileInput.click();
      });

      this.fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        const file = files[0];
        if (!file) return;
        this.fileInput.value = '';
        // Agency dashboard: one or more resumes go to the bench import.
        if (this.options?.surface === 'app' && this._userRole === 'consultancy' && this._assistantHandlers) {
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

    // Esc key closes panel
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Global copy buttons inside messages delegation
    this.messagesList.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.ai-msg-action-btn') || e.target.closest('.copy-code-btn');
      if (copyBtn) {
        this._handleCopyClick(copyBtn);
      }
      const retryBtn = e.target.closest('.ai-error-retry-btn');
      if (retryBtn) {
        if (typeof this._lastErrorRetryCallback === 'function') {
          const callback = this._lastErrorRetryCallback;
          this._lastErrorRetryCallback = null;
          retryBtn.disabled = true;
          retryBtn.textContent = 'Verifying...';
          void (async () => {
            try {
              const banner = retryBtn.closest('.ai-error-banner');
              if (banner && banner.parentNode) {
                banner.parentNode.removeChild(banner);
              }
              await callback();
            } catch (retryErr) {
              this._renderErrorBanner(
                retryErr?.message || 'Verification retry failed. Please try again.',
                callback
              );
            }
          })();
          return;
        }
        const lastUserMsg = [...this.messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          // The message is already in the chat; resend it without showing it twice.
          this.sendMessage(lastUserMsg.content, { displayUserMessage: false });
        }
      }
    });
  }

  _handleCopyClick(btn) {
    let textToCopy = '';
    if (btn.classList.contains('copy-code-btn')) {
      const wrapper = btn.closest('.code-block-wrapper');
      textToCopy = wrapper ? wrapper.querySelector('code').innerText : '';
    } else {
      const row = btn.closest('.ai-message-row');
      textToCopy = row ? row.getAttribute('data-raw-content') : '';
    }

    if (textToCopy && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = btn.classList.contains('copy-code-btn') ? 'Copied!' : `${ICONS.check} Copied`;
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      }).catch(err => {
        console.warn('Copy failed:', err);
      });
    }
  }

  _restoreState() {
    const savedSession = this.storage.get('hirepool_session', null);

    if (savedSession && savedSession.credential) {
      this.apiClient.setAuthenticatedSession(savedSession);
      this.hostIdentity = savedSession.identity;
      if (typeof this.storage.setUser === 'function') {
        this.storage.setUser(savedSession.identity?.id);
      }
      if (this.options.integration) {
        this.options.integration.getAuthHeaders = async () => ({ Authorization: `Bearer ${savedSession.credential}` });
        this.options.integration.getSessionScope = async () => savedSession.sessionScope;
        this.options.integration.getIdentity = async () => savedSession.identity;
        if (typeof this.options.integration.setSession === 'function') {
          this.options.integration.setSession(savedSession);
        }
      }

      // Asynchronously validate stored session in background
      void this.apiClient.validateHirePoolSession(savedSession.credential).then(validation => {
        if (!validation?.valid) {
          this._clearSessionAndFallbackToGuest();
        }
      }).catch(() => {
        this._clearSessionAndFallbackToGuest();
      });
    }

    // Website: conversations saved by an older widget layout are dropped once,
    // so visitors see the current welcome instead of an outdated one.
    if (this.options?.surface === 'website' && this.storage.get('website_ui_version', null) !== WEBSITE_UI_VERSION) {
      this.storage.set('messages', []);
      this.storage.saveConversationId(null);
      this.storage.set('website_ui_version', WEBSITE_UI_VERSION);
    }

    const savedConvoId = this.storage.getConversationId();
    const savedMessages = this.storage.get('messages', []);

    this.activeConversationId = savedConvoId;
    if (Array.isArray(savedMessages) && savedMessages.length > 0) {
      this.messages = savedMessages;
      this.messages.forEach(msg => {
        this._renderMessageBubble(msg.role, msg.content, false, msg.action);
      });
      const last = this.messages[this.messages.length - 1];
      if (last?.role === 'assistant' && Array.isArray(last.quickReplies) && last.quickReplies.length) {
        this._renderQuickReplies(this.messagesList.lastElementChild, last.quickReplies);
      }
      const welcomeRowIndex = this.messages.findIndex(m => m.appWelcome);
      if (welcomeRowIndex >= 0 && this.messagesList.children[welcomeRowIndex]) {
        this.messagesList.children[welcomeRowIndex].dataset.appWelcome = '1';
        this.container?.classList.add('ai-chat-welcome');
      }
      // Role cards stay until the visitor sends their first message.
      if (!this.messages.some(m => m.role === 'user')) {
        const index = this.messages.findIndex(m => Array.isArray(m.roleCards) && m.roleCards.length);
        if (index >= 0) this._renderRoleCards(this.messagesList.children[index], this.messages[index].roleCards);
        const welcomeIndex = this.messages.findIndex(m => m.appWelcome && m.profileProgress);
        if (welcomeIndex >= 0) this._renderProfileProgress(this.messagesList.children[welcomeIndex], this.messages[welcomeIndex].profileProgress);
      }
    }

    const wasOpen = this.storage.get('is_open', false);
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
    if (typeof ctx === 'object' && !Array.isArray(ctx)) {
      if ('authentication' in ctx || 'identity' in ctx) {
        const sanitized = { ...ctx };
        delete sanitized.authentication;
        delete sanitized.identity;
        this.options.context = sanitized;
      }
      return;
    }
    if (typeof ctx === 'string' && ctx.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(ctx);
        if (parsed && typeof parsed === 'object' && ('authentication' in parsed || 'identity' in parsed)) {
          delete parsed.authentication;
          delete parsed.identity;
          this.options.context = JSON.stringify(parsed);
        }
      } catch {}
    }
  }

  _resetHirePoolIntegrationToGuest() {
    this._clearHirePoolContextAuth();
    const integration = this.options?.integration;
    if (integration) {
      integration.getAuthHeaders = async () => ({});
      integration.getSessionScope = async () => 'guest';
      integration.getIdentity = async () => null;
      if ('authHeadersProvider' in integration) integration.authHeadersProvider = () => ({});
      if ('sessionScopeProvider' in integration) integration.sessionScopeProvider = () => 'guest';
      if ('identityProvider' in integration) integration.identityProvider = () => null;
    }
    if (this.apiClient) {
      this.apiClient.clearAuthenticatedSession();
      this.apiClient.clearDemoToken?.();
      this.apiClient.getAuthHeaders = integration ? () => integration.getAuthHeaders() : null;
    }
  }

  _clearSessionAndFallbackToGuest() {
    this.storage.remove('hirepool_session');
    this._resetHirePoolIntegrationToGuest();
    if (typeof this.storage.setUser === 'function') {
      this.storage.setUser(null);
    }
    this.storage.remove('hirepool_session');
    this.storage.clear();
    this.activeConversationId = null;
    this.messages = [];
    if (this.messagesList) {
      this.messagesList.innerHTML = '';
    }
    this.setHostIdentity(null, 'guest');
    this.setGreeting(this._initialGreeting || '', this._initialSuggestedPrompts || []);
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
      if (typeof hook === 'function') {
        try {
          await hook.call(integration || this.options, logoutInfo);
        } catch {}
      }
    }

    this.storage.remove('hirepool_session');
    this.storage.clear();
    this._resetHirePoolIntegrationToGuest();

    if (typeof this.storage.setUser === 'function') {
      this.storage.setUser(null);
    }
    this.storage.remove('hirepool_session');
    this.storage.clear();

    this.activeConversationId = null;
    this.messages = [];
    if (this.messagesList) {
      this.messagesList.innerHTML = '';
    }
    this.setHostIdentity(null, 'guest');
    this.setGreeting(this._initialGreeting || '', this._initialSuggestedPrompts || []);
    this._persistState();
    this._setGenerating(false);

    if (confirmationMessage) {
      this._renderMessageBubble('assistant', confirmationMessage, false);
    }
    this.events.emit('auth:logout', logoutInfo || { loggedOut: true });
    this.events.emit('conversation:cleared');
  }

  _persistState() {
    this._syncWebsiteChatState();
    this.storage.set('messages', this.messages.map(message => (
      message.action?.action === 'hirepool_begin_login' ||
      message.action?.parameters?.continuationReference
        ? { ...message, action: { ...message.action, parameters: {} } }
        : message
    )));
    this.storage.saveConversationId(this.activeConversationId);
    this.storage.set('is_open', this.isOpen);
  }

  open({ focus = true, source = 'user' } = {}) {
    if (this.isOpen) return;
    this.isOpen = true;
    this._autoOpened = source === 'auto';
    this._hideTeaser();
    this.container.classList.add('is-open');
    this.launcherBtn.setAttribute('aria-expanded', 'true');
    this._maybeShowWebsiteWelcome();
    // Dashboard: the greeting is on screen; follow up if the user stays quiet.
    if (this.options?.surface === 'app' && !this.messages.some(m => m.role === 'user')) {
      this._idleNudge?.onAssistantMessage('welcome');
    }
    this._persistState();
    this.events.emit('open', { source });

    // Auto-open never moves keyboard focus away from the page.
    setTimeout(() => {
      if (focus) this.textarea.focus();
      this._scrollToBottom();
    }, 100);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.container.classList.remove('is-open');
    this.launcherBtn.setAttribute('aria-expanded', 'false');
    this._persistState();
    this.events.emit('close');

    // A visitor who closes an auto-opened chat without chatting is left alone for a while.
    if (this._autoOpened && !this.messages.some(m => m.role === 'user')) {
      this._autoOpenController?.snooze();
    }
    this._autoOpened = false;

    // Return focus to launcher button
    this.launcherBtn.focus();
  }

  /** Website bot: welcome, introduce HirePool, and ask what the visitor needs. */
  _maybeShowWebsiteWelcome() {
    const welcome = this.options?.behavior?.welcome;
    if (this.options?.surface !== 'website' || !welcome?.message || this.messages.length > 0) return;
    this._postLocalAssistantMessage(welcome.message, welcome.quickReplies || [], { roleCards: welcome.roleCards });
    this._idleNudge?.onAssistantMessage('welcome');
  }

  /**
   * Show an assistant message that is generated by the widget (welcome or
   * follow-up). It is kept in this tab's history but never sent to the server.
   * A follow-up replaces the previous unanswered follow-up instead of stacking.
   */
  _postLocalAssistantMessage(text, quickReplies = [], { roleCards = null, nudge = false } = {}) {
    // A plain follow-up keeps the buttons the visitor has not used yet.
    if (!nudge || (Array.isArray(quickReplies) && quickReplies.length)) this._clearQuickReplies();
    const previous = this.messages[this.messages.length - 1];
    if (nudge && previous?.nudge && this.messagesList?.lastElementChild) {
      this.messagesList.lastElementChild.remove();
      this.messages.pop();
    }
    const row = this._renderMessageBubble('assistant', text, true);
    // Order under the welcome: quick-reply buttons first, then the role cards.
    const replies = Array.isArray(quickReplies) ? quickReplies.filter(r => typeof r === 'string' && r.trim()).slice(0, 5) : [];
    if (replies.length) this._renderQuickReplies(row, replies);
    const cards = Array.isArray(roleCards) ? roleCards.filter(c => c?.title && c?.prompt).slice(0, 4) : [];
    if (cards.length) this._renderRoleCards(row, cards);
    this.messages.push({
      role: 'assistant',
      content: text,
      local: true,
      ...(nudge ? { nudge: true } : {}),
      ...(cards.length ? { roleCards: cards } : {}),
      ...(replies.length ? { quickReplies: replies } : {})
    });
    this._stampLatestReply();
    this._persistState();
  }

  /** Website: a small "HirePool · 10:42" under the latest assistant reply only. */
  _stampLatestReply() {
    if (!['website', 'app'].includes(this.options?.surface) || !this.messagesList) return;
    this.messagesList.querySelectorAll('.ai-msg-meta').forEach(el => el.remove());
    const bubbles = this.messagesList.querySelectorAll('.ai-message-row.assistant > .ai-bubble');
    const bubble = bubbles[bubbles.length - 1];
    if (!bubble) return;
    const meta = document.createElement('div');
    meta.className = 'ai-msg-meta';
    let time = '';
    try {
      time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      time = '';
    }
    meta.textContent = time ? `HirePool · ${time}` : 'HirePool';
    bubble.insertAdjacentElement('afterend', meta);
  }

  /** Website welcome: large tappable cards for job seekers, companies, and agencies. */
  _renderRoleCards(row, cards) {
    if (!row || !Array.isArray(cards) || !cards.length) return;
    const icons = {
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>',
      clipboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6a2 2 0 0 1 2 2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2-2zm0 2v2h6V4H9zM5 6v14h14V6h-2v2H7V6H5zm3 5h8v2H8v-2zm0 4h6v2H8v-2z"/></svg>',
      chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2v16h16v2H3V3zm4 9h3v6H7v-6zm5-5h3v11h-3V7zm5 3h3v8h-3v-8z"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/></svg>',
      'user-check': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 8c3.3 0 7 1.6 7 4.5V20H2v-1.5C2 15.6 5.7 14 9 14zm0 2c-2.5 0-4.6 1-4.9 2h9.8c-.3-1-2.4-2-4.9-2zm12.3-6.7 1.4 1.4-4.7 4.7-2.7-2.7 1.4-1.4 1.3 1.3 3.3-3.3z"/></svg>',
      'file-upload': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15l4-4 4 4h-3v4h-2v-4H8z"/></svg>',
      edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
      send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
      'list-check': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h2v2H3V5zm4 0h14v2H7V5zM3 11h2v2H3v-2zm4 0h14v2H7v-2zm-4 6h2v2H3v-2zm4 0h14v2H7v-2z"/></svg>',
      'user-plus': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 8c3.3 0 7 1.6 7 4.5V20H3v-1.5C3 15.6 6.7 14 10 14zm0 2c-2.5 0-4.6 1-4.9 2h9.8c-.3-1-2.4-2-4.9-2zM19 8h2v2h2v2h-2v2h-2v-2h-2v-2h2V8z"/></svg>',
      briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h4a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 2v2h4V5h-4zM5 9v4h14V9H5zm0 6v3h14v-3h-6v1h-2v-1H5z"/></svg>',
      building: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4h2a2 2 0 0 1 2 2v10h1v2H2v-2h2zm2 0h4v-3h2v3h2V5H6v16zm10 0h2V11h-2v10zM8 7h2v2H8V7zm0 4h2v2H8v-2zm4-4h2v2h-2V7zm0 4h2v2h-2v-2z"/></svg>',
      users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7.5-1a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM9 13c3.3 0 6 1.8 6 4.5V20H3v-2.5C3 14.8 5.7 13 9 13zm0 2c-2.2 0-4 1-4 2.5v.5h8v-.5c0-1.5-1.8-2.5-4-2.5zm8 0c2.4.2 4 1.4 4 3v2h-4v-2c0-1.1-.4-2.1-1.2-2.9.4-.1.8-.1 1.2-.1z"/></svg>'
    };
    const chevron = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.3 6.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 0-1.4z"/></svg>';
    const group = document.createElement('div');
    group.className = 'ai-role-cards';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Choose what brings you here');
    for (const card of cards) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-role-card';
      button.innerHTML = `
        <span class="ai-role-card-icon">${icons[card.icon] || icons.briefcase}</span>
        <span class="ai-role-card-text">
          <span class="ai-role-card-title">${escapeHtml(card.title)}</span>
          ${card.subtitle ? `<span class="ai-role-card-subtitle">${escapeHtml(card.subtitle)}</span>` : ''}
        </span>
        <span class="ai-role-card-chevron">${chevron}</span>
      `;
      button.addEventListener('click', () => {
        this._clearRoleCards();
        this._clearQuickReplies();
        if (typeof card.onSelect === 'function') card.onSelect();
        else void this.sendMessage(card.prompt);
      });
      group.appendChild(button);
    }
    // Cards sit right under the welcome text, before any quick replies.
    row.appendChild(group);
    this._scrollToBottom();
  }

  _clearRoleCards() {
    this.messagesList?.querySelectorAll('.ai-role-cards').forEach(el => el.remove());
  }

  _renderQuickReplies(row, replies) {
    if (!row) return;
    const container = document.createElement('div');
    container.className = 'ai-quick-replies';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Suggested replies');
    for (const reply of replies) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-quick-reply';
      button.textContent = reply;
      button.addEventListener('click', () => {
        this._clearQuickReplies();
        void this.sendMessage(reply);
      });
      container.appendChild(button);
    }
    row.appendChild(container);
    this._scrollToBottom();
  }

  _clearQuickReplies() {
    this.messagesList?.querySelectorAll('.ai-quick-replies').forEach(el => el.remove());
  }

  /** Website bot: re-engage a quiet visitor a few seconds after the assistant speaks. */
  _setupIdleNudges() {
    const config = this.options?.behavior?.idleNudge;
    const surface = this.options?.surface;
    if ((surface !== 'website' && surface !== 'app') || !config?.enabled) return;
    this._nudgeUsed = new Set(this.messages.filter(m => m.local).map(m => m.content));
    const activeSignupStates = new Set(['idle', 'completed', 'cancelled', 'error']);
    this._idleNudge = new IdleNudgeController({
      delayMs: config.delayMs,
      maxConsecutive: config.maxConsecutive,
      pickNudge: stage => pickIdleNudge(config, stage, this._nudgeUsed, this._userRole || null),
      post: nudge => {
        this._postLocalAssistantMessage(nudge.text, nudge.quickReplies, { nudge: true });
        this.events.emit('idle-nudge:shown', { text: nudge.text });
      },
      isPaused: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
      canNudge: () =>
        this.isOpen &&
        !this.isGenerating &&
        !this.textarea?.value?.trim() &&
        activeSignupStates.has(this.hirePoolSignup?.state || 'idle')
    });
    this.textarea?.addEventListener('input', () => this._idleNudge?.onUserActivity());
    this._idleNudgeUnsubscribes = [
      this.events.on('message:sent', () => {
        this._clearQuickReplies();
        this._clearRoleCards();
        this._idleNudge?.onUserMessage();
      }),
      this.events.on('message:received', (message) => {
        this._stampLatestReply();
        if (surface === 'website') {
          // Job results end by offering an account: answer it with one tap.
          if (!message?.action && /Shall I create one for you now\?/i.test(String(message?.content || ''))) {
            const rows = this.messagesList?.querySelectorAll('.ai-message-row.assistant');
            const last = rows?.[rows.length - 1];
            if (last) {
              this._clearQuickReplies();
              this._renderQuickReplies(last, ['Sign me up', 'Not now']);
            }
          }
        }
        // Never follow up on top of an action card the visitor still has to act on.
        if (message?.action) {
          this._idleNudge?.onUserActivity();
        } else {
          // A reply that asks the visitor something gets a gentler follow-up.
          const asked = /\?\s*\**\s*$/.test(String(message?.content || '').trim());
          this._idleNudge?.onAssistantMessage(asked ? 'question' : 'answer');
        }
      }),
      this.events.on('close', () => this._idleNudge?.onUserActivity()),
      // "New chat" starts the welcome and follow-ups from the beginning.
      this.events.on('conversation:cleared', () => {
        this._nudgeUsed = new Set();
        this._visitorSignupRole = null;
        this._idleNudge?.onUserMessage();
        if (this.isOpen) {
          this._maybeShowWebsiteWelcome();
          this._persistState();
        }
        if (this.options?.surface === 'app' && this._appWelcome) {
          this.showAppWelcome(this._appWelcome);
        }
      })
    ];
  }

  _setupAutoOpen() {
    const config = this.options?.behavior?.autoOpen;
    if (this.options?.surface !== 'website' || !config?.enabled || typeof window === 'undefined') return;
    this._autoOpenController = new AutoOpenController({
      config,
      win: window,
      isOpen: () => this.isOpen,
      hasConversation: () => this.messages.length > 0,
      openPanel: () => this.open({ focus: false, source: 'auto' }),
      showTeaser: text => this._showTeaser(text)
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
    const key = `hirepool-assistant:profile-nudge:${String(userId || 'user').slice(0, 80)}`;
    const now = Date.now();
    if (!force) {
      try {
        if (sessionStorage.getItem(key) === 'shown') return false;
        if (Number(localStorage.getItem(`${key}:snoozed-until`) || 0) > now) return false;
        sessionStorage.setItem(key, 'shown');
      } catch {
        if (this._profileNudgeShown) return false;
      }
    }
    this._profileNudgeShown = true;
    // Only one completion card at a time.
    this.messagesList.querySelectorAll('.ai-nudge-row').forEach(el => el.remove());

    const row = document.createElement('div');
    row.className = 'ai-message-row assistant ai-nudge-row';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble ai-nudge';
    const text = continuing ? `Saved ✅ ${nudge.text}` : nudge.text;
    bubble.innerHTML = `
      <div class="ai-nudge-text">${parseMarkdown(text)}</div>
      <div class="ai-action-controls">
        <button type="button" class="ai-btn-action-confirm ai-nudge-accept">${continuing ? 'Continue' : 'Complete my profile'}</button>
        <button type="button" class="ai-btn-action-cancel ai-nudge-later">Later</button>
      </div>
    `;
    const remove = () => row.parentNode && row.parentNode.removeChild(row);
    bubble.querySelector('.ai-nudge-accept').addEventListener('click', () => {
      remove();
      this.events.emit('profile-nudge:accepted', { field: nudge.field });
      // Prefer the fill-in form; fall back to the chat edit flow (never sends a value).
      if (this._profileFormHandlers) {
        void this.showProfileForm('missing');
      } else {
        void this.sendMessage(nudge.acceptPrompt || 'Update my profile');
      }
    });
    bubble.querySelector('.ai-nudge-later').addEventListener('click', () => {
      remove();
      try {
        // "Later" really means later: no reminder for three days.
        localStorage.setItem(`${key}:snoozed-until`, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
      } catch {}
      this.events.emit('profile-nudge:snoozed', { field: nudge.field });
    });
    row.appendChild(bubble);
    this.messagesList.appendChild(row);
    this._scrollToBottom();
    this.events.emit('profile-nudge:shown', { field: nudge.field, missing: nudge.missing || [] });
    return true;
  }

  /**
   * Dashboard: show the personal welcome as an interactive chat message —
   * a short hello, role task cards, quick buttons, and profile progress with a
   * "Complete now" button while the profile is incomplete.
   * Only when no conversation is under way. Returns whether it was shown.
   */
  showAppWelcome(welcome) {
    if (!welcome || !this.messagesList || this.options?.surface !== 'app') return false;
    this._appWelcome = welcome;
    // The interactive welcome replaces the old static greeting box for good.
    this.container?.classList.add('ai-chat-welcome');
    if (this.messages.length > 0) {
      // A welcome from earlier in this tab: bring its profile progress up to date.
      this.updateProfileProgress(welcome.profileProgress || null);
      return false;
    }
    const text = [
      `**${welcome.salutation || 'Hi! 👋'}**`,
      welcome.question || 'What would you like to do today?'
    ].join('\n');
    this._postLocalAssistantMessage(text, Array.isArray(welcome.quickReplies) ? welcome.quickReplies : [], {
      roleCards: Array.isArray(welcome.actions) ? welcome.actions : []
    });
    this.messages[this.messages.length - 1].appWelcome = true;
    if (this.messagesList.lastElementChild) this.messagesList.lastElementChild.dataset.appWelcome = '1';
    if (welcome.profileProgress) this.messages[this.messages.length - 1].profileProgress = welcome.profileProgress;
    if (welcome.profileProgress) this._renderProfileProgress(this.messagesList.lastElementChild, welcome.profileProgress);
    this.container?.classList.add('ai-chat-welcome');
    this._persistState();
    return true;
  }

  /**
   * Dashboard: refresh (or remove, once complete) the progress card in the
   * welcome so it never shows an old percentage.
   */
  updateProfileProgress(progress) {
    const index = this.messages.findIndex(m => m.appWelcome);
    if (index < 0) return;
    const message = this.messages[index];
    if (progress) message.profileProgress = progress;
    else delete message.profileProgress;
    const row = this.messagesList?.querySelector('[data-app-welcome="1"]');
    if (row) {
      if (progress) this._renderProfileProgress(row, progress);
      else row.querySelector('.ai-profile-progress')?.remove();
    }
    if (this._appWelcome) this._appWelcome = { ...this._appWelcome, profileProgress: progress || null };
    this._persistState();
  }

  _renderProfileProgress(row, progress) {
    if (!row || !progress) return;
    row.querySelector('.ai-profile-progress')?.remove();
    const pct = Number.isFinite(progress.completion) ? Math.max(0, Math.min(100, progress.completion)) : null;
    const card = document.createElement('div');
    card.className = 'ai-profile-progress';
    const missing = Array.isArray(progress.missing) ? progress.missing : [];
    card.innerHTML = `
      <div class="ai-pp-top">
        <span class="ai-pp-title">Your ${escapeHtml(progress.profileWord || 'profile')} is ${pct !== null ? `<strong>${pct}%</strong> complete` : 'not complete yet'}</span>
        <span class="ai-pp-count">${progress.remaining} missing</span>
      </div>
      ${pct !== null ? `<div class="ai-pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>` : ''}
      ${missing.length ? `<div class="ai-pp-missing">Missing: ${escapeHtml(missing.join(', '))}${progress.remaining > missing.length ? '…' : ''}</div>` : ''}
      <button type="button" class="ai-pp-btn">Complete now</button>
    `;
    card.querySelector('.ai-pp-btn').addEventListener('click', () => {
      this.events.emit('profile-nudge:accepted', { source: 'welcome' });
      if (this._profileFormHandlers) {
        void this.showProfileForm('missing');
      } else {
        void this.sendMessage('Update my profile');
      }
    });
    // Right under the hello, above the task cards.
    const bubble = row.querySelector(':scope > .ai-bubble');
    const meta = row.querySelector(':scope > .ai-msg-meta');
    (meta || bubble)?.insertAdjacentElement('afterend', card);
  }

  /** In-app bot: how to load and save the profile form (set by the SDK). */
  setProfileFormHandlers(handlers) {
    this._profileFormHandlers = handlers && typeof handlers.load === 'function' && typeof handlers.save === 'function'
      ? handlers
      : null;
  }

  /**
   * In-app bot: a fill-in form for the user's profile.
   * mode 'missing' shows only empty fields; 'all' shows everything to edit.
   * `overrides` pre-fill values (e.g. from a review card being edited).
   */
  async showProfileForm(mode = 'all', { overrides = null, fillEmptyOnly = false, sourceLabel = null } = {}) {
    if (!this._profileFormHandlers || !this.messagesList) return false;
    if (!this.isOpen) this.open({ focus: false });
    this.messagesList.querySelectorAll('.ai-profile-form-row, .ai-nudge-row').forEach(el => el.remove());
    this._clearQuickReplies();

    const row = document.createElement('div');
    row.className = 'ai-message-row assistant ai-signup-row ai-profile-form-row';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble ai-profile-form-card';
    bubble.innerHTML = '<div class="ai-profile-form-loading">Loading your profile…</div>';
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
    if (mode === 'missing' && form.fields.length === 0 && !(form.chatSections || []).length) {
      row.remove();
      this.updateProfileProgress(null);
      this.postAssistantNote?.('🎉 Your profile is already complete. Say **edit my profile** any time to change something.');
      return true;
    }
    this._renderProfileForm(bubble, form, overrides || {}, { fillEmptyOnly, sourceLabel });
    this.events.emit('profile-form:shown', { mode, fields: form.fields.map(f => f.key) });
    return true;
  }

  _renderProfileForm(bubble, form, overrides, { fillEmptyOnly = false, sourceLabel = null } = {}) {
    const fieldId = key => `ai-pf-${key}`;
    const isEmpty = value => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    const display = value => (Array.isArray(value) ? value.join(', ') : String(value ?? ''));
    // From an uploaded resume: fill only empty fields; show other differences as a hint.
    const usesOverride = field => Object.hasOwn(overrides, field.key) && !isEmpty(overrides[field.key]) &&
      (!fillEmptyOnly || isEmpty(field.value));
    const differs = field => fillEmptyOnly && Object.hasOwn(overrides, field.key) && !isEmpty(overrides[field.key]) &&
      !isEmpty(field.value) && display(overrides[field.key]).toLowerCase() !== display(field.value).toLowerCase();
    const valueOf = field => (usesOverride(field) ? overrides[field.key] : field.value);
    const controlHtml = field => {
      const value = valueOf(field);
      const common = `id="${fieldId(field.key)}" name="${escapeHtml(field.key)}" class="ai-form-input"`;
      const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
      switch (field.type) {
        case 'textarea':
          return `<textarea ${common} rows="3"${placeholder}>${escapeHtml(String(value ?? ''))}</textarea>`;
        case 'select':
          return `<select ${common}><option value="">Choose…</option>${(field.options || []).map(o =>
            `<option value="${escapeHtml(o.value)}"${o.value === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`;
        case 'multiselect': {
          const selected = new Set(Array.isArray(value) ? value : []);
          return `<div class="ai-pf-chips" role="group" aria-label="${escapeHtml(field.label)}">${(field.options || []).map(o => `
            <label class="ai-pf-chip"><input type="checkbox" name="${escapeHtml(field.key)}" value="${escapeHtml(o.value)}"${selected.has(o.value) ? ' checked' : ''}><span>${escapeHtml(o.label)}</span></label>`).join('')}</div>`;
        }
        case 'tags':
          return `<input type="text" ${common}${placeholder} value="${escapeHtml(Array.isArray(value) ? value.join(', ') : String(value ?? ''))}">`;
        case 'number':
          return `<input type="number" inputmode="numeric" ${common}${placeholder}${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''} value="${value === null || value === undefined ? '' : escapeHtml(String(value))}">`;
        default:
          return `<input type="${field.type === 'tel' ? 'tel' : field.type === 'url' ? 'url' : 'text'}" ${common}${placeholder} value="${escapeHtml(String(value ?? ''))}">`;
      }
    };
    const chatSections = (form.chatSections || []);
    bubble.innerHTML = `
      <form class="ai-profile-form" novalidate>
        <div class="ai-pf-head">
          <div class="ai-pf-title">${escapeHtml(form.title || 'Your profile')}</div>
          <div class="ai-pf-subtitle">${escapeHtml(form.subtitle || '')}${Number.isFinite(form.completion) ? ` <span class="ai-pf-progress">${form.completion}% complete</span>` : ''}</div>
        </div>
        ${form.fields.map(field => `
          <div class="ai-pf-field${field.missing ? ' is-missing' : ''}" data-key="${escapeHtml(field.key)}">
            <label class="ai-pf-label" for="${fieldId(field.key)}">${escapeHtml(field.label)}${usesOverride(field) && sourceLabel
              ? ` <span class="ai-pf-source">${escapeHtml(sourceLabel)}</span>`
              : (field.missing ? ' <span class="ai-pf-missing">Missing</span>' : '')}</label>
            ${controlHtml(field)}
            ${differs(field) ? `<div class="ai-pf-hint ai-pf-diff">Resume says: <strong>${escapeHtml(display(overrides[field.key]).slice(0, 120))}</strong> <button type="button" class="ai-pf-use" data-key="${escapeHtml(field.key)}">Use this</button></div>` : ''}
            ${field.hint ? `<div class="ai-pf-hint">${escapeHtml(field.hint)}</div>` : ''}
            <div class="ai-pf-error" role="alert"></div>
          </div>`).join('')}
        ${chatSections.length ? `
          <div class="ai-pf-chat-sections">
            <div class="ai-pf-hint">These need a few details each, so we'll add them together in chat:</div>
            ${chatSections.map(s => `<button type="button" class="ai-pf-chat-btn" data-prompt="${escapeHtml(s.prompt)}">${escapeHtml(s.missing ? `Add ${s.label.toLowerCase()}` : `Edit ${s.label.toLowerCase()}`)}</button>`).join('')}
          </div>` : ''}
        <div class="ai-pf-form-error" role="alert"></div>
        <div class="ai-pf-actions">
          <button type="submit" class="ai-btn-action-confirm ai-pf-save">Save</button>
          <button type="button" class="ai-btn-action-cancel ai-pf-cancel">Cancel</button>
        </div>
      </form>
    `;
    const formEl = bubble.querySelector('form');
    const saveBtn = bubble.querySelector('.ai-pf-save');
    const formError = bubble.querySelector('.ai-pf-form-error');
    const row = bubble.closest('.ai-message-row');

    bubble.querySelectorAll('.ai-pf-use').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.key;
        const field = form.fields.find(f => f.key === key);
        const value = overrides[key];
        if (!field) return;
        if (field.type === 'multiselect') {
          const wanted = new Set(Array.isArray(value) ? value : []);
          formEl.querySelectorAll(`input[name="${CSS.escape(key)}"]`).forEach(input => { input.checked = wanted.has(input.value); });
        } else {
          const el = formEl.querySelector(`#${CSS.escape(fieldId(key))}`);
          if (el) el.value = Array.isArray(value) ? value.join(', ') : String(value);
        }
        button.closest('.ai-pf-diff')?.remove();
      });
    });
    bubble.querySelectorAll('.ai-pf-chat-btn').forEach(button => {
      button.addEventListener('click', () => {
        row?.remove();
        void this.sendMessage(button.dataset.prompt);
      });
    });
    bubble.querySelector('.ai-pf-cancel').addEventListener('click', () => {
      row?.remove();
      this.events.emit('profile-form:cancelled');
    });
    formEl.addEventListener('input', event => {
      const wrap = event.target.closest?.('.ai-pf-field');
      if (wrap) {
        wrap.classList.remove('has-error');
        wrap.querySelector('.ai-pf-error').textContent = '';
      }
    });
    formEl.addEventListener('submit', async event => {
      event.preventDefault();
      const values = {};
      for (const field of form.fields) {
        if (field.type === 'multiselect') {
          values[field.key] = [...formEl.querySelectorAll(`input[name="${CSS.escape(field.key)}"]:checked`)].map(i => i.value);
        } else {
          const el = formEl.querySelector(`#${CSS.escape(fieldId(field.key))}`);
          values[field.key] = el ? el.value : '';
        }
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      formError.textContent = '';
      bubble.querySelectorAll('.ai-pf-field.has-error').forEach(el => {
        el.classList.remove('has-error');
        el.querySelector('.ai-pf-error').textContent = '';
      });
      try {
        const result = await this._profileFormHandlers.save(values);
        if (!result?.saved) {
          formError.textContent = result?.message || 'Nothing changed, so there was nothing to save.';
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
          return;
        }
        row?.remove();
        const savedList = (result.changed || []).slice(0, 6).join(', ');
        const progress = Number.isFinite(result.completion) ? ` Your profile is now **${result.completion}% complete**.` : '';
        const note = result.partial && result.message ? `\n\n${result.message}` : '';
        const rest = result.missingCount > 0
          ? `\n\n${result.missingCount} detail${result.missingCount === 1 ? '' : 's'} still missing. Say **complete my profile** whenever you have a moment.`
          : '\n\n🎉 Your profile is complete. Nice work!';
        this.postAssistantNote?.(`✅ Saved${savedList ? `: ${savedList}` : ''}.${progress}${note}${rest}`);
        if (result.missingCount === 0) this.updateProfileProgress(null);
        this.events.emit('profile-form:saved', { changed: result.changed || [], missingCount: result.missingCount ?? null });
      } catch (error) {
        const fields = error?.fields && typeof error.fields === 'object' ? error.fields : null;
        let shownInline = false;
        if (fields) {
          for (const [key, message] of Object.entries(fields)) {
            const wrap = bubble.querySelector(`.ai-pf-field[data-key="${CSS.escape(key)}"]`);
            if (wrap) {
              wrap.classList.add('has-error');
              wrap.querySelector('.ai-pf-error').textContent = String(message);
              shownInline = true;
            }
          }
          bubble.querySelector('.ai-pf-field.has-error')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        }
        formError.textContent = shownInline
          ? 'Please fix the highlighted fields.'
          : (error?.message || "I couldn't save your profile just now. Please try again.");
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
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
    if (typeof window === 'undefined') return false;
    this._autoOpenController?.stop();
    this._autoOpenController = new AutoOpenController({
      config: { ...config, enabled: true, excludedPaths: [] },
      win: window,
      isOpen: () => this.isOpen,
      // The widget's own welcome does not count as a conversation.
      hasConversation: () => this.messages.some(m => m.role === 'user'),
      openPanel: () => {
        if (isBlocked?.()) return;
        this.open({ focus: false, source: 'auto' });
        onOpen?.('panel');
      },
      showTeaser: text => {
        if (isBlocked?.()) return;
        this._showTeaser(text);
        onOpen?.('teaser');
      }
    });
    return this._autoOpenController.start();
  }

  /** Dashboard: the signed-in user's role, used to pick role-specific follow-ups. */
  setUserRole(role) {
    this._userRole = ['candidate', 'client', 'consultancy'].includes(role) ? role : null;
    if (this.options?.surface === 'app' && this.attachBtn && this.fileInput) {
      // Every dashboard can upload; agencies can pick several resumes at once.
      this.attachBtn.disabled = false;
      this.fileInput.multiple = this._userRole === 'consultancy';
      this.fileInput.accept = '.pdf,.docx,.txt';
      this.attachBtn.title = {
        candidate: 'Upload your resume (PDF, DOCX, TXT)',
        client: 'Upload a job description (PDF, DOCX, TXT)',
        consultancy: 'Upload candidate resumes, one or several (PDF, DOCX, TXT)'
      }[this._userRole] || 'Upload a document';
      this.attachBtn.setAttribute('aria-label', this.attachBtn.title);
    }
  }

  /** A short assistant message from the widget itself (not sent to the server). */
  postAssistantNote(text) {
    if (!text || !this.messagesList) return;
    this._renderMessageBubble('assistant', text, true);
    this.messages.push({ role: 'assistant', content: text, local: true });
    this._persistState();
  }

  _showTeaser(text) {
    if (this.isOpen || !this.container) return;
    this._hideTeaser();
    const teaser = document.createElement('div');
    teaser.className = 'ai-teaser';
    teaser.setAttribute('role', 'status');
    teaser.setAttribute('aria-live', 'polite');
    teaser.innerHTML = `
      <button type="button" class="ai-teaser-text">${escapeHtml(text)}</button>
      <button type="button" class="ai-teaser-close" aria-label="Dismiss greeting">${ICONS.launcherClose}</button>
    `;
    teaser.querySelector('.ai-teaser-text').addEventListener('click', () => {
      this.open({ source: 'teaser' });
    });
    teaser.querySelector('.ai-teaser-close').addEventListener('click', () => {
      this._hideTeaser();
      this._autoOpenController?.snooze();
      this.events.emit('teaser:dismissed');
    });
    this.container.appendChild(teaser);
    this._teaser = teaser;
    this.events.emit('teaser:shown');
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
    if (['light', 'dark', 'auto'].includes(theme)) {
      this.container.setAttribute('data-theme', theme);
      this.options.theme = theme;
    }
  }

  setPosition(pos) {
    ['bottom-right', 'bottom-left', 'top-right', 'top-left'].forEach(p => {
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
    const welcome = this.panel?.querySelector('.ai-welcome-box');
    const greetingElement = welcome?.querySelector('.ai-welcome-greeting');
    if (!welcome || !greetingElement) return;
    // Greetings may use **bold** (e.g. the company name); the renderer escapes HTML.
    greetingElement.innerHTML = parseMarkdown(String(greeting || ''));
    this.options.greeting = greeting;
    this.options.suggestedPrompts = suggestedPrompts;

    let promptSection = welcome.querySelector('.ai-suggested-prompts');
    if (!suggestedPrompts.length) {
      promptSection?.remove();
      return;
    }
    if (!promptSection) {
      promptSection = document.createElement('div');
      promptSection.className = 'ai-suggested-prompts';
      promptSection.innerHTML = '<div class="ai-suggested-prompts-label">Suggested Prompts</div><div class="ai-prompts-list"></div>';
      greetingElement.insertAdjacentElement('afterend', promptSection);
    }
    const promptList = promptSection.querySelector('.ai-prompts-list');
    promptList.replaceChildren(...suggestedPrompts.map(prompt => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-prompt-pill';
      button.textContent = prompt;
      button.addEventListener('click', () => this.sendMessage(prompt));
      return button;
    }));
  }

  async newConversation() {
    if (this.hirePoolResume.state === HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION) {
      if (!await this.hirePoolResume.cancel()) return false;
    } else if (
      this.hirePoolResume.state === HIREPOOL_RESUME_STATES.PREPARING ||
      this.hirePoolResume.state === HIREPOOL_RESUME_STATES.UPLOADING
    ) {
      this._renderHirePoolResumeError('Wait for the current resume operation to finish before starting a new chat.');
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
        this.events.emit('error', err);
        return false;
      }
    }
    this.activeConversationId = null;
    this.messages = [];
    this.messagesList.innerHTML = '';
    this.hirePoolResume.reset();
    if (this.hirePoolSignup && this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.IDLE) {
      await this.hirePoolSignup.cancel();
    }
    this.storage.clear();
    this._persistState();
    this._setGenerating(false);
    this.events.emit('conversation:cleared');
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
      this.messagesList.innerHTML = '';
    }
    this._resetHirePoolIntegrationToGuest();
    this.setHostIdentity(null, 'guest');
    if (typeof this.storage.setUser === 'function') {
      this.storage.setUser(null);
    }
    this.storage.remove('hirepool_session');
    this.storage.clear();
    this.setGreeting(this._initialGreeting || '', this._initialSuggestedPrompts || []);
    this._persistState();
    this._setGenerating(false);
    this.events.emit('conversation:cleared');
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
      this.statusDot.classList.add('busy');
      this.statusText.textContent = 'Thinking...';
      this.sendBtn.style.display = 'none';
      this.stopBtn.style.display = 'flex';
      this.streamingIndicator.style.display = 'flex';
    } else {
      this.statusDot.classList.remove('busy');
      this.statusText.textContent = 'Online';
      this.sendBtn.style.display = 'flex';
      this.stopBtn.style.display = 'none';
      this.streamingIndicator.style.display = 'none';
      this.sendBtn.disabled = !this.textarea.value.trim();
    }
  }

  _scrollToBottom() {
    this.body.scrollTop = this.body.scrollHeight;
  }

  _stripActionBlocks(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/```(?:action:[a-zA-Z0-9_-]+|action)\s*\n[\s\S]*?\n```/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  _syncMessageActionState(action) {
    if (!action || !Array.isArray(this.messages)) return;
    for (const msg of this.messages) {
      if (msg?.action && (msg.action === action || (action.id && msg.action.id === action.id))) {
        msg.action._status = action._status;
        msg.action._statusMessage = action._statusMessage;
      }
    }
    this._persistState();
  }

  _extractAction(text, actionProp) {
    if (actionProp && typeof actionProp === 'object') {
      return actionProp;
    }
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/```(?:action:[a-zA-Z0-9_-]+|action)\s*\n([\s\S]*?)\n```/i);
    if (!match) return null;
    try {
      const data = JSON.parse(match[1].trim());
      if (data && data.action && data.title) {
        if (this.options?.assistantId === 'hirepool') {
          const hasToken = typeof data.confirmationToken === 'string' &&
            /^[A-Za-z0-9_-]{43}$/.test(data.confirmationToken);
          if (!hasToken) {
            return null;
          }
        }
        return data;
      }
    } catch {}
    return null;
  }

  _renderActionCard(bubble, action) {
    if (!action || !action.action) return;
    if (this.options?.assistantId === 'hirepool' &&
        action.requiresConfirmation === false &&
        action.action !== 'hirepool_login' &&
        action.action !== 'hirepool_signup') {
      return;
    }
    if (typeof this.options.hasActionHandler !== 'function' ||
        !this.options.hasActionHandler(action)) return;

    // Prevent duplicate action cards in same bubble
    const actionId = action.id || action.action;
    if (bubble.querySelector(`[data-action-id="${escapeHtml(actionId)}"]`)) {
      return;
    }

    if (action.action === 'hirepool_login') {
      return this._renderHirePoolLoginCard(bubble, action);
    }

    const card = document.createElement('div');
    card.className = 'ai-action-card';
    card.setAttribute('data-action-id', actionId);
    card.setAttribute('data-action-type', action.action);
    this.events.emit('action:proposed', action);
    const risk = ['read', 'write', 'destructive'].includes(action.risk) ? action.risk : 'write';
    const requiresAcknowledgement = risk === 'destructive';

    const isHirePoolAccountAction = ['hirepool_login', 'hirepool_signup'].includes(action.action);
    const accountButtonLabel = action.action === 'hirepool_signup'
      ? 'Sign up for HirePool'
      : 'Log in to HirePool';
    const badgeLabel = isHirePoolAccountAction
      ? 'HirePool account'
      : (action.formattedReview ? 'Review & Confirm' : 'Application action');

    // Format parameters or structured review
    let detailsHtml = '';
    const hasReview = Boolean(action.formattedReview && typeof action.formattedReview === 'object');
    if (hasReview) {
      const review = action.formattedReview;
      let rowsHtml = '';
      if (Array.isArray(review.fields)) {
        rowsHtml = `
          <table class="ai-review-table">
            <tbody>
              ${review.fields.map(f => `
                <tr>
                  <th class="ai-review-key">${escapeHtml(f.label)}</th>
                  <td class="ai-review-val">${escapeHtml(f.value)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
      let skillsHtml = '';
      if (Array.isArray(review.requiredSkills) && review.requiredSkills.length > 0) {
        skillsHtml += `
          <div class="ai-review-section">
            <div class="ai-review-section-title">Required Skills</div>
            <div class="ai-review-tags">
              ${review.requiredSkills.map(s => `<span class="ai-review-tag">${escapeHtml(s)}</span>`).join('')}
            </div>
          </div>
        `;
      }
      if (Array.isArray(review.preferredSkills) && review.preferredSkills.length > 0) {
        skillsHtml += `
          <div class="ai-review-section">
            <div class="ai-review-section-title">Preferred Skills</div>
            <div class="ai-review-tags">
              ${review.preferredSkills.map(s => `<span class="ai-review-tag preferred">${escapeHtml(s)}</span>`).join('')}
            </div>
          </div>
        `;
      }
      let descHtml = '';
      if (review.description && typeof review.description === 'string' && review.description.trim()) {
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
      let paramRowsHtml = '';
      for (const [key, val] of Object.entries(params)) {
        if (key === 'continuationReference' || key === 'confirmationToken' || val === undefined || val === null || val === '') continue;
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let formattedVal = '';
        if (typeof val === 'object') {
          if (Array.isArray(val)) {
            formattedVal = val.join(', ');
          } else {
            formattedVal = Object.entries(val)
              .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
              .join('; ');
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

    // The card's intro is Markdown. When the details table is shown, leave out the
    // same "- **Field**: value" list so nothing appears twice.
    let explanationText = String(action.explanation || '');
    if (detailsHtml) {
      explanationText = explanationText
        .split('\n')
        .filter(line => !/^\s*[-*]\s+\*\*/.test(line))
        .join('\n')
        .replace(/\s-\s+\*\*[\s\S]*?(?=(?:Choose|Click|Press|Reply)\b|$)/, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    const explanationHtml = explanationText ? parseMarkdown(explanationText) : '';

    const titleText = action.formattedReview?.title || action.title || 'Review Action';
    const confirmBtnLabel = action.formattedReview?.type === 'job_creation'
      ? 'Confirm &amp; Create'
      : (isHirePoolAccountAction ? accountButtonLabel : 'Confirm &amp; Execute');

    card.innerHTML = `
      <div class="ai-action-header">
        <span class="ai-action-badge">${badgeLabel}</span>
        <span class="ai-action-risk risk-${risk}">${risk === 'destructive' ? 'Destructive' : risk === 'read' ? 'Read' : 'Write'}</span>
        <span class="ai-action-title">${escapeHtml(titleText)}</span>
      </div>
      ${explanationHtml ? `<div class="ai-action-explanation">${explanationHtml}</div>` : ''}
      ${detailsHtml}
      ${requiresAcknowledgement ? `
        <label class="ai-action-acknowledgement">
          <input type="checkbox" class="ai-action-acknowledge">
          I understand this action may be difficult to undo.
        </label>
      ` : ''}
      <div class="ai-action-status-msg" style="display: none;"></div>
      <div class="ai-action-controls">
        <button type="button" class="ai-btn-action-confirm" ${requiresAcknowledgement ? 'disabled' : ''}>${confirmBtnLabel}</button>
        ${hasReview ? '<button type="button" class="ai-btn-action-edit">Edit details</button>' : ''}
        <button type="button" class="ai-btn-action-cancel">${isHirePoolAccountAction ? 'Not now' : 'Cancel'}</button>
      </div>
    `;

    const btnConfirm = card.querySelector('.ai-btn-action-confirm');
    const btnCancel = card.querySelector('.ai-btn-action-cancel');
    const btnEdit = card.querySelector('.ai-btn-action-edit');
    const statusMsg = card.querySelector('.ai-action-status-msg');
    const controls = card.querySelector('.ai-action-controls');
    const acknowledgement = card.querySelector('.ai-action-acknowledge');

    if (action._status && action._status !== 'pending') {
      if (controls) controls.style.display = 'none';
      if (acknowledgement) acknowledgement.disabled = true;
      btnConfirm.disabled = true;
      btnCancel.disabled = true;
      if (btnEdit) btnEdit.disabled = true;
      statusMsg.style.display = 'flex';
      statusMsg.className = `ai-action-status-msg ${action._status === 'completed' ? 'success' : action._status}`;
      statusMsg.textContent = action._statusMessage || (
        action._status === 'completed'
          ? 'Action executed successfully!'
          : action._status === 'cancelled'
            ? 'Action cancelled.'
            : 'Action could not be completed.'
      );
      bubble.appendChild(card);
      this._scrollToBottom();
      return;
    }

    if (btnEdit) {
      btnEdit.addEventListener('click', () => {
        const body = action.parameters?.body || action.arguments?.body || null;
        // Own profile update: drop this review and edit everything in the form instead.
        if (/profile_update$/.test(String(action.formattedReview?.type || '')) && this._profileFormHandlers) {
          btnCancel.click();
          statusMsg.textContent = 'Editing in the form below.';
          action._statusMessage = 'Editing in the form below.';
          void this.showProfileForm('all', { overrides: body && typeof body === 'object' ? body : null });
          return;
        }
        // Candidate details: put the current values in the box so the user edits and sends them.
        if (body && typeof body === 'object' && (body.first_name || body.email)) {
          const parts = [
            `Name: ${[body.first_name, body.last_name].filter(Boolean).join(' ')}`,
            `Email: ${body.email || ''}`,
            `Job title: ${body.job_title || ''}`,
            `Location: ${body.current_location || ''}`,
            `Experience: ${body.years_of_experience ?? body.experience_years ?? 0} years`,
            `Skills: ${Array.isArray(body.skills) ? body.skills.join(', ') : ''}`
          ];
          if (body.phone) parts.splice(2, 0, `Phone: ${body.phone}`);
          this.textarea.value = parts.join(', ');
          this.textarea.dispatchEvent(new Event('input'));
        }
        this.textarea.focus();
        this.textarea.placeholder = 'Type changes to profile, job, or candidate details...';
        this._scrollToBottom();
      });
    }

    let executing = false;
    let timeoutId = null;

    acknowledgement?.addEventListener('change', () => {
      btnConfirm.disabled = !acknowledgement.checked;
    });

    btnConfirm.addEventListener('click', () => {
      if (executing || (action._status && action._status !== 'pending')) return;

      if (action.action === 'hirepool_signup') {
        card.remove();
        void this._startHirePoolSignup(action.parameters?.role || null);
        return;
      }

      executing = true;
      btnConfirm.disabled = true;
      btnCancel.disabled = true;

      statusMsg.style.display = 'flex';
      statusMsg.className = 'ai-action-status-msg executing';
      statusMsg.textContent = isHirePoolAccountAction
        ? 'Opening HirePool login...'
        : 'Executing action in the host application...';

      let handled = false;

      // Safety timeout if host does not respond within 35 seconds
      timeoutId = setTimeout(() => {
        if (!handled && executing) {
          executing = false;
          statusMsg.style.display = 'flex';
          statusMsg.className = 'ai-action-status-msg error';
          if (action.confirmationToken) {
            const timeoutMsg = 'The confirmation result was not received. Do not retry this write; check HirePool application history before asking for a fresh readiness check.';
            statusMsg.textContent = timeoutMsg;
            controls.style.display = 'none';
            action._status = 'error';
            action._statusMessage = timeoutMsg;
            this._syncMessageActionState(action);
          } else {
            statusMsg.textContent = 'Action timed out before confirmation completed. Click Retry to try again or Cancel to dismiss.';
            btnConfirm.disabled = false;
            btnCancel.disabled = false;
            btnConfirm.textContent = 'Retry';
          }
        }
      }, 15000);

      this.events.emit('action:execute', {
        actionId: action.id,
        action: action.action,
        parameters: action.parameters || {},
        confirmationToken: action.confirmationToken,
        resolve: (result) => {
          handled = true;
          executing = false;
          clearTimeout(timeoutId);
          const successMsg = result?.message || 'Action executed successfully!';
          statusMsg.style.display = 'flex';
          statusMsg.className = 'ai-action-status-msg success';
          statusMsg.innerHTML = `${ICONS.check} ${escapeHtml(successMsg)}`;
          controls.style.display = 'none';
          action._status = 'completed';
          action._statusMessage = successMsg;
          this._syncMessageActionState(action);
          this.events.emit('action:success', { actionId: action.id, action: action.action, result });
          this._scrollToBottom();
        },
        reject: (err) => {
          handled = true;
          executing = false;
          clearTimeout(timeoutId);
          const errorMsg = err?.message || 'Action failed';
          statusMsg.style.display = 'flex';
          statusMsg.className = 'ai-action-status-msg error';
          statusMsg.innerHTML = `⚠️ ${escapeHtml(errorMsg)}`;
          const isTerminalWriteError = Boolean(action.confirmationToken) || (err?.status >= 400 && err?.status < 500);
          if (isTerminalWriteError) {
            controls.style.display = 'none';
            action._status = 'error';
            action._statusMessage = errorMsg;
            this._syncMessageActionState(action);
          } else {
            btnConfirm.disabled = false;
            btnCancel.disabled = false;
            btnConfirm.textContent = 'Retry';
          }
          this.events.emit('action:error', { actionId: action.id, action: action.action, error: err });
          this._scrollToBottom();
        }
      });
    });

    btnCancel.addEventListener('click', () => {
      if (executing || (action._status && action._status !== 'pending')) return;
      btnConfirm.disabled = true;
      btnCancel.disabled = true;
      clearTimeout(timeoutId);
      controls.style.display = 'none';
      statusMsg.style.display = 'flex';
      statusMsg.className = 'ai-action-status-msg cancelled';
      statusMsg.textContent = 'Action cancelled.';
      action._status = 'cancelled';
      action._statusMessage = 'Action cancelled.';
      this._syncMessageActionState(action);
      this.events.emit('action:cancel', {
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
    // The website and dashboard bots read any uploaded document first (see document insight);
    // saving a resume to the profile is then one of the offered choices.
    if (this.options?.surface === 'website' || this.options?.surface === 'app') return false;
    return this._canSaveHirePoolResume();
  }

  /** Can this widget save a PDF to the signed-in candidate's HirePool profile? */
  _canSaveHirePoolResume() {
    return this.options.assistantId === 'hirepool' &&
      this.options.applicationId === 'hirepool-local-app' &&
      typeof this.apiClient.prepareHirePoolResume === 'function';
  }

  setHostIdentity(identity, sessionScope = null) {
    this.hostIdentity = identity;
    const roleType = identity?.user_type || identity?.userType;
    if (this.attachBtn && this._isHirePoolResumeEnabled()) {
      const eligible = roleType === 'candidate';
      this.attachBtn.disabled = !eligible;
      this.attachBtn.title = eligible
        ? 'Attach a PDF resume'
        : 'Sign in to a verified HirePool candidate account to upload a resume.';
      this.attachBtn.setAttribute('aria-label', this.attachBtn.title);
    }
    return this.hirePoolResume.setIdentity(identity, sessionScope);
  }

  _handleHirePoolResumeFile(file) {
    const roleType = this.hostIdentity?.user_type || this.hostIdentity?.userType;
    if (roleType !== 'candidate') {
      this._renderHirePoolResumeError('Sign in to a verified HirePool candidate account to upload a resume.');
      return;
    }
    try {
      this.hirePoolResume.selectFile(file, this.activeConversationId);
    } catch (error) {
      this._renderHirePoolResumeError(error.message);
    }
  }

  _renderHirePoolResumeError(message) {
    const row = document.createElement('div');
    row.className = 'ai-message-row assistant';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    const error = document.createElement('p');
    error.className = 'ai-action-status-msg error';
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
    const busy = state.state === HIREPOOL_RESUME_STATES.PREPARING ||
      state.state === HIREPOOL_RESUME_STATES.UPLOADING;
    if (this.attachBtn && this._isHirePoolResumeEnabled()) {
      this.attachBtn.disabled = busy || this.hostIdentity?.user_type !== 'candidate';
    }
    if (state.state === HIREPOOL_RESUME_STATES.IDLE) {
      this.hirePoolResumeCard?.remove();
      this.hirePoolResumeCard = null;
      return;
    }
    if (!this.messagesList) return;

    if (!this.hirePoolResumeCard) {
      const row = document.createElement('div');
      row.className = 'ai-message-row assistant';
      const bubble = document.createElement('div');
      bubble.className = 'ai-bubble';
      const card = document.createElement('section');
      card.className = 'ai-hirepool-resume-card';
      card.setAttribute('aria-live', 'polite');
      bubble.appendChild(card);
      row.appendChild(bubble);
      this.messagesList.appendChild(row);
      this.hirePoolResumeCard = card;
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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener('click', handler);
      controls.appendChild(button);
      return button;
    };
    const controls = document.createElement('div');
    controls.className = 'ai-hirepool-resume-controls';
    const filename = state.filename || 'Selected resume';
    const size = Number.isInteger(state.fileSize)
      ? formatHirePoolResumeSize(state.fileSize)
      : '';
    const fileDescription = size ? `${filename} (${size})` : filename;

    if (state.state === HIREPOOL_RESUME_STATES.FILE_SELECTED) {
      addText('strong', '', fileDescription);
      addText('p', '', 'Review the selected PDF before preparing a secure upload.');
      addButton('Remove', 'ai-btn-resume-remove', () => this.hirePoolResume.removeFile());
      addButton('Prepare upload', 'ai-btn-resume-prepare', () => {
        void this.hirePoolResume.prepare(this.activeConversationId);
      });
    } else if (state.state === HIREPOOL_RESUME_STATES.PREPARING) {
      addText('strong', '', 'Preparing resume upload…');
      addText('p', '', 'Your PDF is being securely staged. It is not being sent to the assistant.');
      addText('span', 'ai-spinner', '');
    } else if (state.state === HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION) {
      addText('strong', '', fileDescription);
      addText(
        'p',
        '',
        state.replacingExisting
          ? 'Confirming will replace the resume currently stored in your HirePool profile.'
          : 'Confirm to upload this resume to your HirePool profile.'
      );
      addButton('Confirm upload', 'ai-btn-resume-confirm', () => {
        void this.hirePoolResume.confirm();
      });
      addButton('Cancel', 'ai-btn-resume-cancel', () => {
        void this.hirePoolResume.cancel();
      });
    } else if (state.state === HIREPOOL_RESUME_STATES.UPLOADING) {
      addText('strong', '', state.message || 'Uploading resume…');
      addText('span', 'ai-spinner', '');
    } else if (state.state === HIREPOOL_RESUME_STATES.UPLOAD_SUCCESS) {
      addText('strong', '', 'Your resume was uploaded and verified by HirePool.');
    } else if (state.state === HIREPOOL_RESUME_STATES.UPLOAD_UNVERIFIED) {
      addText('strong', '', 'HirePool may have accepted the resume, but the result could not be verified.');
      addText('p', '', 'Check your HirePool profile before trying another upload.');
    } else if (state.state === HIREPOOL_RESUME_STATES.UPLOAD_FAILED) {
      addText('strong', '', state.error || 'HirePool could not complete the resume operation.');
      if (state.filename) {
        addText('p', '', 'You can select a PDF again after checking your HirePool profile.');
      }
    } else if (state.state === HIREPOOL_RESUME_STATES.CANCELLED) {
      addText('p', 'ai-document-cancelled', 'The prepared resume upload was cancelled.');
    }

    if (state.state === HIREPOOL_RESUME_STATES.FILE_SELECTED ||
        state.state === HIREPOOL_RESUME_STATES.AWAITING_CONFIRMATION) {
      card.appendChild(controls);
    }
    this._scrollToBottom();
  }

  _stopVerificationWatcher() {
    if (this._verificationPollTimer) {
      clearInterval(this._verificationPollTimer);
      this._verificationPollTimer = null;
    }
    if (this._verificationFocusHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('focus', this._verificationFocusHandler);
      this._verificationFocusHandler = null;
    }
    if (this._verificationVisibilityHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this._verificationVisibilityHandler);
      this._verificationVisibilityHandler = null;
    }
  }

  _startVerificationWatcher() {
    this._stopVerificationWatcher();

    const triggerCheck = async () => {
      if (
        !this.hirePoolSignup ||
        (this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING &&
          this.hirePoolSignup.state !== HIREPOOL_SIGNUP_STATES.VERIFICATION_PENDING)
      ) {
        this._stopVerificationWatcher();
        return;
      }
      try {
        await this.hirePoolSignup.checkVerificationStatus({ silent: true });
      } catch (err) {
        if (/expired/i.test(err?.message || '')) {
          this._stopVerificationWatcher();
        }
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._verificationFocusHandler = () => {
        void triggerCheck();
      };
      window.addEventListener('focus', this._verificationFocusHandler);
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this._verificationVisibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          void triggerCheck();
        }
      };
      document.addEventListener('visibilitychange', this._verificationVisibilityHandler);
    }

    let pollsRemaining = 100; // Up to 5 minutes at 3s intervals
    this._verificationPollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      pollsRemaining -= 1;
      if (pollsRemaining <= 0) {
        this._stopVerificationWatcher();
        return;
      }
      void triggerCheck();
    }, 3000);
    this._verificationPollTimer.unref?.();
  }

  _renderHirePoolSignupState(state, data) {
    if (this.hirePoolSignupCard) {
      this.hirePoolSignupCard.remove();
      this.hirePoolSignupCard = null;
    }

    const isPendingVerificationState =
      state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING ||
      state === HIREPOOL_SIGNUP_STATES.VERIFICATION_PENDING;
    const isInProgressVerificationState =
      state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_IN_PROGRESS ||
      state === HIREPOOL_SIGNUP_STATES.VERIFICATION_IN_PROGRESS;

    if (!isPendingVerificationState && !isInProgressVerificationState) {
      this._stopVerificationWatcher();
    }

    if (state === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFIED) {
      this._appendAssistantSignupNotice(
        'Your email has been verified! Complete your HirePool profile details below to finish creating your account.'
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

    const row = document.createElement('div');
    row.className = 'ai-message-row assistant ai-signup-row';
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
        onVerifyClick: (url) => {
          if (typeof window !== 'undefined' && typeof window.open === 'function') {
            window.open(url, '_blank', 'noopener,noreferrer');
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
      throw new Error('Authentication transition failed: missing SDK session credential.');
    }

    // Step 1: User / conversation scoping
    const newUserId = sessionData.identity?.id;
    const previousSession = this.storage.get('hirepool_session', null);
    const previousUserId = previousSession?.identity?.id;

    if (typeof this.storage.setUser === 'function') {
      this.storage.setUser(newUserId);
    }

    if (previousUserId && previousUserId !== newUserId) {
      this.activeConversationId = null;
      this.storage.clearConversationId();
      this.messages = [];
      if (this.messagesList) {
        this.messagesList.innerHTML = '';
      }
    }

    // Step 2: Establish authenticated session in API client, storage, and host identity
    this.storage.clearSignupProgress?.();
    this.apiClient.setAuthenticatedSession(sessionData);
    this.storage.set('hirepool_session', sessionData);
    this.setHostIdentity(sessionData.identity, sessionData.sessionScope);

    if (this.options.integration) {
      this.options.integration.getAuthHeaders = async () => ({ Authorization: `Bearer ${sessionData.credential}` });
      this.options.integration.getSessionScope = async () => sessionData.sessionScope;
      this.options.integration.getIdentity = async () => sessionData.identity;
      if (typeof this.options.integration.setSession === 'function') {
        this.options.integration.setSession(sessionData);
      }
    }

    // Step 3: Run authentication smoke test to verify backend readiness before claiming success
    const runSmokeTest = async () => {
      try {
        const smokeResult = await this.apiClient.validateHirePoolSession(sessionData.credential);
        if (!smokeResult?.valid) {
          throw new Error('HirePool could not validate the newly established session.');
        }
        this._dismissRecoverableBanner();
        this._displaySignupConfirmation(sessionData);
        this.events.emit('auth:session', sessionData);
        return true;
      } catch (smokeErr) {
        console.warn('[AI Assistant] Smoke test failed after account creation:', smokeErr);
        this._renderRecoverableWarningBanner(
          'Account created successfully! However, assistant session verification timed out.',
          'Retry Connection',
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
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') appUrl = parsed.href;
    } catch {}
    this.storage.clearSignupProgress?.();

    const roleLabel = {
      candidate: 'candidate',
      client: 'company',
      consultancy: 'agency'
    }[handoff.role] || '';
    const destination = handoff.role === 'candidate' ? 'profile' : 'dashboard';
    const linkLine = appUrl
      ? `👉 **[Open my HirePool ${destination}](${appUrl})**`
      : '👉 **Continue to your HirePool dashboard** by logging in at HirePool.';
    const linkMsg = `🎉 Your HirePool ${roleLabel ? `${roleLabel} ` : ''}account is ready!\n\n${linkLine}\n\nIf HirePool asks you to log in, use the email and password you just set up.`;
    const thanksMsg = 'Thank you for joining HirePool! 💚 We are excited to have you on board. If you have any other questions about HirePool, I am right here.';

    for (const content of [linkMsg, thanksMsg]) {
      this._renderMessageBubble('assistant', content);
      this.messages.push({ role: 'assistant', content });
    }

    if (appUrl) {
      const row = document.createElement('div');
      row.className = 'ai-message-row assistant';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-btn-action-confirm ai-handoff-btn';
      btn.textContent = handoff.role === 'candidate' ? 'Go to my profile' : 'Go to my dashboard';
      btn.addEventListener('click', () => {
        window.open(appUrl, '_blank', 'noopener,noreferrer');
      });
      row.appendChild(btn);
      this.messagesList.appendChild(row);
    }

    this._persistState();
    this._scrollToBottom();
    this.events.emit('signup:completed', { role: handoff.role || null, appUrl });
  }

  _displaySignupConfirmation(sessionData) {
    const role = sessionData.role || sessionData.identity?.userType;
    let greeting = 'Welcome to HirePool!';
    let prompts = [];
    let welcomeMsg = '';

    if (role === 'candidate') {
      greeting = 'Welcome back. I can help with matching jobs, applications, and your profile.';
      prompts = ['Find matching jobs', 'View my profile', 'My applications'];
      welcomeMsg = `🎉 **Welcome to HirePool!** Your candidate account is verified and your profile is complete. You can now use the assistant to access your account and explore jobs.`;
    } else if (role === 'client') {
      greeting = 'Welcome back. I can help with your hiring dashboard and jobs.';
      prompts = ['View my jobs', 'View company profile', 'Dashboard stats'];
      welcomeMsg = `🎉 **Welcome to HirePool!** Your company account is verified and your profile is complete. You can now use the assistant to manage your job listings and view applications.`;
    } else if (role === 'consultancy') {
      greeting = 'Welcome back. I can help with placements, bench candidates, and your consultancy dashboard.';
      prompts = ['View candidate pool', 'Add a candidate', 'Placement stats', 'View agency profile'];
      welcomeMsg = `🎉 **Welcome to HirePool!** Your consultancy account is verified and your profile is complete. You can now use the assistant to manage bench candidates, track placements, and view your consultancy dashboard.`;
    }

    this.setGreeting(greeting, prompts);
    this._renderMessageBubble('assistant', welcomeMsg);
    this.messages.push({ role: 'assistant', content: welcomeMsg });
    this._persistState();

    // Render quick action prompt pills right below the message
    const pillRow = document.createElement('div');
    pillRow.className = 'ai-message-row assistant';
    const pillContainer = document.createElement('div');
    pillContainer.className = 'ai-suggested-prompts';
    pillContainer.style.marginTop = '4px';
    pillContainer.style.marginBottom = '8px';
    prompts.forEach(promptText => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-prompt-chip';
      btn.textContent = promptText;
      btn.addEventListener('click', () => {
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
      this._renderMessageBubble('assistant', 'Document upload is disabled for this assistant.');
      return;
    }

    const filename = typeof file.name === 'string' ? file.name : 'document';
    const extension = '.' + filename.split('.').pop().toLowerCase();
    if (!settings.allowedExtensions.includes(extension)) {
      this._renderMessageBubble('assistant', 'Unsupported document type.');
      return;
    }
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > settings.maxSizeBytes) {
      const limitMb = Math.floor(settings.maxSizeBytes / (1024 * 1024));
      this._renderMessageBubble('assistant', `Document exceeds the ${limitMb} MB upload limit or is empty.`);
      return;
    }

    const sizeFormatted = (file.size / 1024).toFixed(0) + ' KB';
    const hasHostListener = Boolean(this.events?.listeners?.get('file:upload')?.size > 0);
    const consent = settings.consent;
    const consentId = `ai-document-consent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const row = document.createElement('div');
    row.className = 'ai-message-row assistant';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
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

    const checkbox = bubble.querySelector('.ai-document-consent-checkbox');
    const acceptButton = bubble.querySelector('.ai-btn-document-consent-accept');
    const cancelButton = bubble.querySelector('.ai-btn-document-consent-cancel');
    checkbox.addEventListener('change', () => {
      acceptButton.disabled = !checkbox.checked;
    });
    acceptButton.addEventListener('click', () => {
      if (!checkbox.checked || acceptButton.disabled) return;
      this.events.emit('document:consent-accepted', { filename });
      this._processFileUpload(file, bubble, sizeFormatted, hasHostListener);
    });
    cancelButton.addEventListener('click', () => {
      bubble.innerHTML = '<p class="ai-document-cancelled">Document processing cancelled. The file was not sent.</p>';
      this.events.emit('document:consent-rejected', { filename });
      this._scrollToBottom();
    });
  }

  _processFileUpload(file, bubble, sizeFormatted, hasHostListener) {
    const filename = typeof file.name === 'string' ? file.name : 'document';
    const controller = new AbortController();
    this.documentUploadController = controller;
    const uploadMessage = `Uploaded document: ${filename} (${sizeFormatted})`;
    this.messages.push({ role: 'user', content: uploadMessage });
    this._renderMessageBubble('user', uploadMessage);
    this._persistState();
    // Keep the order natural: "Uploaded document…" first, then the processing / document card.
    const cardRow = bubble.closest('.ai-message-row');
    if (cardRow && this.messagesList) this.messagesList.appendChild(cardRow);

    bubble.innerHTML = `
      <div class="ai-processing-state">
        <span class="ai-spinner"></span>
        <span>Processing <strong>${escapeHtml(filename)}</strong>...</span>
        <button type="button" class="ai-btn-document-cancel">Cancel</button>
      </div>
    `;
    const cancelButton = bubble.querySelector('.ai-btn-document-cancel');
    cancelButton.addEventListener('click', () => controller.abort(), { once: true });

    const showCancelled = () => {
      bubble.innerHTML = '<p class="ai-document-cancelled">Document processing cancelled.</p>';
      this.events.emit('document:cancelled', { filename });
      if (this.documentUploadController === controller) this.documentUploadController = null;
      this._scrollToBottom();
    };
    controller.signal.addEventListener('abort', showCancelled, { once: true });

    if (hasHostListener) {
      let handled = false;
      const timeout = setTimeout(() => {
        if (handled || controller.signal.aborted) return;
        handled = true;
        if (this.documentUploadController === controller) this.documentUploadController = null;
        bubble.innerHTML = '<p class="ai-action-status-msg error">The host application did not complete document processing in time.</p>';
        this._scrollToBottom();
      }, 45000);

      this.events.emit('file:upload', {
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
          const message = typeof result?.message === 'string'
            ? result.message
            : 'The host application processed the document.';
          bubble.innerHTML = `<p class="ai-document-host-result">${escapeHtml(message)}</p>`;
          this.events.emit('document:host-processed', { filename, result });
          this._scrollToBottom();
        },
        reject: (error) => {
          if (handled || controller.signal.aborted) return;
          handled = true;
          clearTimeout(timeout);
          if (this.documentUploadController === controller) this.documentUploadController = null;
          bubble.innerHTML = `<p class="ai-action-status-msg error">${escapeHtml(error?.message || 'The host application could not process this document.')}</p>`;
          this._scrollToBottom();
        }
      });
      controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
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
      const pageInfo = doc.pageCount ? ` • ${doc.pageCount} page${doc.pageCount > 1 ? 's' : ''}` : '';
      bubble.innerHTML = `
        <div class="ai-doc-card">
          <div class="ai-doc-header">
            <div class="ai-doc-icon">📄</div>
            <div class="ai-doc-details">
              <div class="ai-doc-title">${escapeHtml(doc.filename)}</div>
              <div class="ai-doc-meta">${escapeHtml(doc.fileType.toUpperCase())} • ${sizeFormatted}${pageInfo} • ${wordsCount} words</div>
            </div>
            <div class="ai-doc-badge">Ready for questions</div>
          </div>
          <p class="ai-doc-hint">You can ask questions about the extracted text. The text is temporary and limited to this conversation session.</p>
          <button type="button" class="ai-btn-document-remove" aria-label="Remove ${escapeHtml(doc.filename)} from this conversation">Remove document</button>
        </div>
      `;
      const knownDocuments = this.storage.get('documents', []);
      this.storage.set('documents', [...knownDocuments.filter(item => item.id !== doc.id), doc]);
      this.messages.push({ role: 'assistant', content: `Processed document: ${doc.filename}. Ready for questions.` });
      this._persistState();
      bubble.querySelector('.ai-btn-document-remove').addEventListener('click', async (event) => {
        event.currentTarget.disabled = true;
        try {
          await this.apiClient.removeDocument(this.activeConversationId, doc.id);
          const remaining = this.storage.get('documents', []).filter(item => item.id !== doc.id);
          this.storage.set('documents', remaining);
          bubble.innerHTML = '<p class="ai-document-cancelled">Document removed from this conversation.</p>';
          this.events.emit('document:removed', doc);
        } catch (error) {
          event.currentTarget.disabled = false;
          this._renderErrorBanner(error.message);
          this.events.emit('error', error);
        }
        this._scrollToBottom();
      });
      this.events.emit('document:uploaded', doc);
      // Dashboard: what was found plus role-specific choices (fill profile, create job, …).
      if (this.options?.surface === 'app' && data.insight) {
        const hint = bubble.querySelector('.ai-doc-hint');
        if (hint) hint.textContent = 'Ask me anything about this document. It is only used in this conversation.';
        this._showDashboardDocumentInsight(data.insight, file);
      } else if (data.insight?.text) {
        // Website: the assistant explains what it found and suggests the next step.
        if (data.insight.signupRole) this._visitorSignupRole = data.insight.signupRole;
        const hint = bubble.querySelector('.ai-doc-hint');
        if (hint) hint.textContent = 'Ask me anything about this document. It is only used in this conversation.';
        this._postLocalAssistantMessage(data.insight.text, Array.isArray(data.insight.quickReplies) ? data.insight.quickReplies : []);
        this._idleNudge?.onAssistantMessage('question');
        this.events.emit('document:insight', { kind: data.insight.kind });
      }
      this._scrollToBottom();
    }).catch((error) => {
      if (error.name === 'AbortError') return;
      bubble.innerHTML = `<p class="ai-action-status-msg error">${escapeHtml(error?.message || 'Failed to process document')}</p>`;
      this._scrollToBottom();
    }).finally(() => {
      controller.signal.removeEventListener('abort', showCancelled);
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
      fill_profile: () => void this.showProfileForm('all', {
        overrides: data.prefill || {},
        fillEmptyOnly: true,
        sourceLabel: 'From resume'
      }),
      find_jobs: () => {
        const q = data.jobSearch;
        void this.sendMessage(q?.query ? `Find ${q.query} jobs${q.location ? ` in ${q.location}` : ''}` : 'Find matching jobs');
      },
      save_resume: () => {
        if (file && this._canSaveHirePoolResume() && String(file.name || '').toLowerCase().endsWith('.pdf')) {
          try {
            this.hirePoolResume.selectFile(file, this.activeConversationId);
          } catch (error) {
            this._renderHirePoolResumeError(error.message);
          }
        } else {
          this.postAssistantNote('Saving a resume works with **PDF** files here. You can also upload it from your **Profile** page.');
        }
      },
      create_job: () => {
        if (data.message) void this.sendMessage(data.message, { displayText: 'Create this job from my job description' });
      },
      edit_job: () => {
        if (!data.message) return;
        this.textarea.value = data.message;
        this.textarea.dispatchEvent(new Event('input'));
        this.textarea.focus();
        this.postAssistantNote('I put the job details in the message box. Change anything you like, then press **send** to see the review card.');
      }
    };
    const options = (Array.isArray(insight.options) ? insight.options : []).map(option => ({
      icon: option.icon,
      title: option.title,
      subtitle: option.subtitle,
      prompt: option.prompt || option.title,
      onSelect: option.id === 'prompt' ? null : handlers[option.id] || null
    }));
    this._postLocalAssistantMessage(insight.text, []);
    if (options.length) this._renderRoleCards(this.messagesList.lastElementChild, options);
    this._idleNudge?.onAssistantMessage('question');
    this.events.emit('document:insight', { kind: insight.kind, surface: 'app' });
  }

  /** Dashboard (agency): bench import and submit calls, set by the SDK. */
  setAssistantHandlers(handlers) {
    this._assistantHandlers = handlers && typeof handlers.addCandidate === 'function' ? handlers : null;
  }

  /**
   * Agency dashboard: read one or more resumes, then offer to add them to the
   * bench, submit them to a job, or review them one by one.
   */
  _handleBenchFiles(files) {
    const settings = this.options.documentUpload;
    if (!settings?.enabled || !files.length) return;
    const allowed = files.filter(f => settings.allowedExtensions.includes(`.${String(f.name || '').split('.').pop().toLowerCase()}`) &&
      Number.isFinite(f.size) && f.size > 0 && f.size <= settings.maxSizeBytes);
    const skipped = files.length - allowed.length;
    if (!allowed.length) {
      this.postAssistantNote('Those files can’t be read here. Upload resumes as **PDF, DOCX or TXT**, up to 10 MB each.');
      return;
    }
    const consent = settings.consent;
    const row = document.createElement('div');
    row.className = 'ai-message-row assistant';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    const countLabel = `${allowed.length} resume${allowed.length === 1 ? '' : 's'}`;
    bubble.innerHTML = `
      <section class="ai-document-consent" role="group">
        <h3>${escapeHtml(consent.title)}</h3>
        <p>${escapeHtml(consent.description)}</p>
        <p class="ai-pf-hint">${escapeHtml(countLabel)} selected${skipped ? ` · ${skipped} file${skipped === 1 ? '' : 's'} skipped (unsupported or too large)` : ''}</p>
        <label class="ai-document-consent-choice"><input type="checkbox" class="ai-document-consent-checkbox"><span>${escapeHtml(consent.checkboxLabel)}</span></label>
        <div class="ai-document-consent-controls">
          <button type="button" class="ai-btn-document-consent-accept" disabled>Continue</button>
          <button type="button" class="ai-btn-document-consent-cancel">Cancel</button>
        </div>
      </section>`;
    row.appendChild(bubble);
    this.messagesList.appendChild(row);
    this._scrollToBottom();
    const checkbox = bubble.querySelector('.ai-document-consent-checkbox');
    const accept = bubble.querySelector('.ai-btn-document-consent-accept');
    checkbox.addEventListener('change', () => { accept.disabled = !checkbox.checked; });
    bubble.querySelector('.ai-btn-document-consent-cancel').addEventListener('click', () => {
      bubble.innerHTML = '<p class="ai-document-cancelled">Upload cancelled. The files were not sent.</p>';
    });
    accept.addEventListener('click', () => {
      if (!checkbox.checked) return;
      void this._readBenchFiles(allowed, row, bubble);
    });
  }

  async _readBenchFiles(files, row, bubble) {
    const label = `Uploaded ${files.length} resume${files.length === 1 ? '' : 's'}`;
    this.messages.push({ role: 'user', content: label });
    this._renderMessageBubble('user', label);
    this.messagesList.appendChild(row);
    this._persistState();
    const results = [];
    for (let i = 0; i < files.length; i += 1) {
      bubble.innerHTML = `<div class="ai-processing-state"><span class="ai-spinner"></span><span>Reading ${i + 1} of ${files.length}: <strong>${escapeHtml(files[i].name)}</strong>…</span></div>`;
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
        if (insight.kind === 'resume' && insight.data?.candidate) {
          results.push({ filename: files[i].name, ...insight.data, status: insight.data.missing?.length ? 'needs_details' : 'ready' });
        } else {
          results.push({ filename: files[i].name, status: 'not_resume', note: insight.kind === 'unreadable' ? 'No readable text' : 'Not a resume' });
        }
      } catch (error) {
        results.push({ filename: files[i].name, status: 'unreadable', note: error?.message || 'Could not be read' });
      }
    }
    this._renderBenchCard(bubble, results);
  }

  _renderBenchCard(bubble, results) {
    const nameOf = r => [r.candidate?.first_name, r.candidate?.last_name].filter(Boolean).join(' ') || r.filename;
    const chip = r => ({
      ready: '<span class="ai-bench-chip ok">Ready</span>',
      needs_details: `<span class="ai-bench-chip warn">Missing: ${escapeHtml((r.missing || []).join(', '))}</span>`,
      adding: '<span class="ai-bench-chip">Adding…</span>',
      added: '<span class="ai-bench-chip ok">Added ✓</span>',
      duplicate: '<span class="ai-bench-chip">Already on bench</span>',
      failed: `<span class="ai-bench-chip err">${escapeHtml(r.note || 'Not added')}</span>`,
      not_resume: `<span class="ai-bench-chip warn">${escapeHtml(r.note || 'Not a resume')}</span>`,
      unreadable: `<span class="ai-bench-chip err">${escapeHtml(r.note || 'Could not be read')}</span>`
    }[r.status] || '');
    const resumes = results.filter(r => r.candidate);
    const ready = () => results.filter(r => r.status === 'ready');
    const render = () => {
      const added = results.filter(r => r.status === 'added').length;
      const dup = results.filter(r => r.status === 'duplicate').length;
      const needs = results.filter(r => r.status === 'needs_details').length;
      bubble.innerHTML = `
        <div class="ai-bench-card">
          <div class="ai-pf-title">${resumes.length} resume${resumes.length === 1 ? '' : 's'} read</div>
          <div class="ai-bench-list">
            ${results.map((r, i) => `
              <div class="ai-bench-row" data-index="${i}">
                <div class="ai-bench-who"><strong>${escapeHtml(nameOf(r))}</strong>
                  <span>${escapeHtml([r.candidate?.job_title, r.candidate?.current_location, r.candidate?.email].filter(Boolean).join(' · ') || r.filename)}</span></div>
                ${chip(r)}
              </div>`).join('')}
          </div>
          ${added || dup ? `<div class="ai-pf-hint">${added} added${dup ? ` · ${dup} already on your bench` : ''}${needs ? ` · ${needs} need details (use Review one by one)` : ''}</div>` : ''}
          <div class="ai-bench-actions">
            ${ready().length ? `<button type="button" class="ai-btn-action-confirm" data-act="add">Add ${ready().length} to my bench</button>` : ''}
            ${resumes.length ? '<button type="button" class="ai-btn-action-cancel" data-act="submit">Submit to a job</button>' : ''}
            ${resumes.some(r => r.status === 'ready' || r.status === 'needs_details') ? '<button type="button" class="ai-btn-action-cancel" data-act="review">Review one by one</button>' : ''}
          </div>
          <div class="ai-bench-review"></div>
        </div>`;
      bubble.querySelector('[data-act="add"]')?.addEventListener('click', () => void addAll());
      bubble.querySelector('[data-act="submit"]')?.addEventListener('click', () => void submitFlow());
      bubble.querySelector('[data-act="review"]')?.addEventListener('click', () => {
        const box = bubble.querySelector('.ai-bench-review');
        box.innerHTML = '';
        results.filter(r => r.candidate && r.addMessage && (r.status === 'ready' || r.status === 'needs_details')).forEach(r => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ai-pf-chat-btn';
          button.textContent = `Review ${nameOf(r)}`;
          button.addEventListener('click', () => {
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
        r.status = 'adding';
        render();
        try {
          const res = await this._assistantHandlers.addCandidate(r.candidate);
          if (res?.status === 'added') { r.status = 'added'; r.id = res.id; }
          else if (res?.status === 'duplicate') r.status = 'duplicate';
          else if (res?.status === 'needs_details') { r.status = 'needs_details'; r.missing = res.missing?.length ? res.missing : r.missing; }
          else { r.status = 'failed'; r.note = res?.message; }
        } catch (error) {
          r.status = 'failed';
          r.note = error?.message;
        }
      }
      render();
      this.events.emit('bench:import', { added: results.filter(r => r.status === 'added').length });
    };
    const submitFlow = async () => {
      if (ready().length) await addAll();
      const submittable = results.filter(r => r.status === 'added' && r.id);
      const box = bubble.querySelector('.ai-bench-review');
      if (!submittable.length) {
        box.innerHTML = '<p class="ai-pf-hint">Only candidates added just now can be submitted here. For candidates already on your bench, say <strong>submit &lt;name&gt; to &lt;job&gt;</strong>.</p>';
        return;
      }
      box.innerHTML = '<div class="ai-profile-form-loading">Loading open jobs…</div>';
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
          <select id="ai-bench-job" class="ai-form-input"><option value="">Choose a job…</option>
            ${jobs.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml([j.title, j.company, j.location].filter(Boolean).join(' · '))}</option>`).join('')}
          </select>
          <div class="ai-pf-label">Candidates</div>
          <div class="ai-pf-chips">
            ${submittable.map(r => `<label class="ai-pf-chip"><input type="checkbox" value="${escapeHtml(r.id)}" checked><span>${escapeHtml(nameOf(r))}</span></label>`).join('')}
          </div>
          <div class="ai-pf-form-error" role="alert"></div>
          <div class="ai-pf-actions"><button type="submit" class="ai-btn-action-confirm">Submit</button></div>
        </form>`;
      const form = box.querySelector('form');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const jobId = form.querySelector('#ai-bench-job').value;
        const ids = [...form.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
        const error = form.querySelector('.ai-pf-form-error');
        if (!jobId || !ids.length) { error.textContent = 'Choose a job and at least one candidate.'; return; }
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'Submitting…';
        try {
          await this._assistantHandlers.submit(jobId, ids);
          const job = jobs.find(j => j.id === jobId);
          box.innerHTML = '';
          this.postAssistantNote(`✅ Submitted **${ids.length}** candidate${ids.length === 1 ? '' : 's'} to **${job?.title || 'the job'}**. Say **show my submissions** to track them.`);
        } catch (err) {
          error.textContent = err?.message || "HirePool couldn't submit these candidates. Please try again.";
          button.disabled = false;
          button.textContent = 'Submit';
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
    const row = document.createElement('div');
    row.className = `ai-message-row ${role}`;
    row.setAttribute('data-raw-content', content);

    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';

    if (role === 'user') {
      bubble.textContent = content;
      row.appendChild(bubble);
    } else {
      const renderedContent = this.options?.assistantId === 'hirepool'
        ? this._stripActionBlocks(content)
        : content;
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

  _renderRecoverableWarningBanner(message, actionText = 'Retry Connection', actionCallback = null) {
    this._dismissRecoverableBanner();
    const banner = document.createElement('div');
    banner.className = 'ai-warning-banner ai-recoverable-banner';
    banner.style.cssText = 'background: #fff3cd; color: #856404; border: 1px solid #ffeeba; border-radius: 8px; padding: 10px 14px; margin: 8px 12px; font-size: 13px; display: flex; align-items: center; justify-content: space-between; gap: 8px;';
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    banner.appendChild(textSpan);

    if (actionCallback) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-warning-action-btn';
      btn.style.cssText = 'background: #856404; color: #ffffff; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;';
      btn.textContent = actionText;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Verifying...';
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
    this.messagesList?.querySelectorAll('.ai-error-banner').forEach(el => el.remove());
    this._lastErrorRetryCallback = typeof retryCallback === 'function' ? retryCallback : null;
    const retryLabel = options.retryLabel === undefined ? 'Try again' : options.retryLabel;
    const banner = document.createElement('div');
    banner.className = 'ai-error-banner';
    banner.setAttribute('role', 'alert');
    const showRetry = Boolean(retryLabel) && (this._lastErrorRetryCallback || options.retryLabel === undefined);
    let loginUrl = null;
    try {
      const parsed = options.loginUrl ? new URL(options.loginUrl) : null;
      if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) loginUrl = parsed.href;
    } catch {}
    // Last line of defence: technical text never reaches the user.
    const looksTechnical = /\bHTTP\s*\d{3}\b|failed to fetch|networkerror|load failed|\bstream(?:ing)?\b.*\b(?:ended|event|response)\b|typeerror|referenceerror|syntaxerror|\bundefined\b|\bnull\b|ECONN|ETIMEDOUT|ENOTFOUND|stack trace|internal server error|\[object /i
      .test(String(message || ''));
    const safeMessage = !message || looksTechnical
      ? "Something went wrong on my side and I couldn't finish that. Nothing was changed. Please try again."
      : message;
    banner.innerHTML = `
      <span>${escapeHtml(safeMessage)}</span>
      ${showRetry ? `<button class="ai-error-retry-btn" type="button">${escapeHtml(retryLabel)}</button>` : ''}
      ${loginUrl ? `<a class="ai-error-login-link" href="${escapeHtml(loginUrl)}" target="_top">Log in</a>` : ''}
    `;
    const retryBtn = banner.querySelector('.ai-error-retry-btn');
    if (retryBtn && Number(options.retryAfterMs) > 0) {
      // Rate limits: let the wait pass before allowing another try.
      retryBtn.disabled = true;
      setTimeout(() => { retryBtn.disabled = false; }, Number(options.retryAfterMs));
    }
    this.messagesList.appendChild(banner);
    this._scrollToBottom();
  }

  /** Offline: resend once the browser reports the connection is back. */
  _resendWhenOnline(resend) {
    if (this._onlineHandler) window.removeEventListener('online', this._onlineHandler);
    this._onlineHandler = () => {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
      this.messagesList?.querySelectorAll('.ai-error-banner').forEach(el => el.remove());
      void resend();
    };
    window.addEventListener('online', this._onlineHandler);
  }

  displayHirePoolLoginNotice(message) {
    this._renderMessageBubble('assistant', message, false, {
      id: `hirepool-login-recovery-${Date.now()}`,
      action: 'hirepool_login',
      title: 'Sign in to HirePool',
      explanation: 'Sign in with your HirePool credentials to access your account.',
      parameters: {},
      risk: 'read',
      requiresConfirmation: true
    });
  }

  _renderHirePoolLoginCard(bubble, action) {
    const actionId = action.id || action.action || `hp-login-${Date.now()}`;
    const card = document.createElement('div');
    card.className = 'ai-action-card ai-login-card';
    card.setAttribute('data-action-id', actionId);
    card.setAttribute('data-action-type', 'hirepool_login');
    this.events.emit('action:proposed', action);

    // Website bot: never collect passwords here; send the visitor to the HirePool app login.
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
      card.querySelector('.ai-login-redirect-btn').addEventListener('click', () => {
        if (loginUrl) window.open(loginUrl, '_blank', 'noopener,noreferrer');
        this.events.emit('login:redirect', { url: loginUrl });
      });
      bubble.appendChild(card);
      this._scrollToBottom();
      return;
    }

    if (action._status && action._status !== 'pending') {
      card.innerHTML = `
        <div class="ai-action-header">
          <span class="ai-action-badge">HirePool account</span>
          <span class="ai-action-risk risk-read">Sign In</span>
          <span class="ai-action-title">${escapeHtml(action.title || 'Sign in to HirePool')}</span>
        </div>
        <div class="ai-action-status-msg ${action._status === 'completed' ? 'success' : action._status}" style="display: flex;">
          ${escapeHtml(action._statusMessage || (action._status === 'completed' ? 'Signed in successfully.' : 'Sign-in cancelled.'))}
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
        <span class="ai-action-title">${escapeHtml(action.title || 'Sign in to HirePool')}</span>
      </div>
      <p class="ai-action-explanation">${escapeHtml(action.explanation || 'Sign in with your HirePool credentials to access your account.')}</p>
      <form class="ai-login-form" autocomplete="on">
        <div class="ai-form-group">
          <label class="ai-form-label" for="hp-email-${escapeHtml(actionId)}">Email</label>
          <input type="email" id="hp-email-${escapeHtml(actionId)}" class="ai-form-input ai-login-email" placeholder="name@example.com" autocomplete="email" required />
        </div>
        <div class="ai-form-group">
          <label class="ai-form-label" for="hp-pass-${escapeHtml(actionId)}">Password</label>
          <div class="ai-password-wrapper">
            <input type="password" id="hp-pass-${escapeHtml(actionId)}" class="ai-form-input ai-login-password" placeholder="••••••••" autocomplete="current-password" required />
            <button type="button" class="ai-password-toggle" aria-label="Toggle password visibility">👁</button>
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

    const form = card.querySelector('.ai-login-form');
    const emailInput = card.querySelector('.ai-login-email');
    const passwordInput = card.querySelector('.ai-login-password');
    const toggleBtn = card.querySelector('.ai-password-toggle');
    const statusMsg = card.querySelector('.ai-action-status-msg');
    const submitBtn = card.querySelector('.ai-btn-login-submit');
    const cancelBtn = card.querySelector('.ai-btn-action-cancel');
    const externalLinkBtn = card.querySelector('.ai-login-external-link');

    toggleBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = '🙈';
      } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = '👁';
      }
    });

    externalLinkBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        const result = openHirePoolLogin({
          currentUrl: typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000',
          openWindow: (...args) => (typeof window !== 'undefined' ? window.open(...args) : null)
        });
        statusMsg.style.display = 'flex';
        statusMsg.className = 'ai-action-status-msg info';
        statusMsg.textContent = result?.message || 'HirePool login opened in a new tab.';
      } catch (err) {
        statusMsg.style.display = 'flex';
        statusMsg.className = 'ai-action-status-msg error';
        statusMsg.textContent = err.message || 'Could not open HirePool login tab.';
      }
    });

    cancelBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      passwordInput.value = '';
      action._status = 'cancelled';
      action._statusMessage = 'Sign-in cancelled.';
      this._syncMessageActionState(action);
      form.innerHTML = `
        <div class="ai-action-status-msg cancelled" style="display: flex;">
          Sign-in cancelled.
        </div>
      `;
      this._scrollToBottom();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      // Immediately clear the password input from DOM
      passwordInput.value = '';

      if (!email || !password || !email.includes('@')) {
        statusMsg.style.display = 'flex';
        statusMsg.className = 'ai-action-status-msg error';
        statusMsg.textContent = 'Please enter a valid email and password.';
        return;
      }

      emailInput.disabled = true;
      passwordInput.disabled = true;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      statusMsg.style.display = 'flex';
      statusMsg.className = 'ai-action-status-msg executing';
      statusMsg.textContent = 'Signing in to HirePool...';

      try {
        const session = await this.apiClient.loginHirePoolPassword(email, password);
        if (session?.status === 'mfa_required') {
          statusMsg.className = 'ai-action-status-msg info';
          statusMsg.textContent = session.message || 'MFA is required on your account. Please log in on the HirePool website.';
          emailInput.disabled = false;
          passwordInput.disabled = false;
          submitBtn.disabled = false;
          cancelBtn.disabled = false;
          return;
        }

        const displayName = session.identity?.name || session.identity?.first_name || session.identity?.email || 'User';
        const userType = session.identity?.userType || session.identity?.user_type || 'user';

        action._status = 'completed';
        action._statusMessage = `Signed in as ${displayName}`;
        this._syncMessageActionState(action);

        form.innerHTML = `
          <div class="ai-action-status-msg success" style="display: flex;">
            ${ICONS.check} Signed in as ${escapeHtml(displayName)} (${escapeHtml(userType)})
          </div>
        `;

        if (this.options.integration && typeof this.options.integration.setAuthSession === 'function') {
          await this.options.integration.setAuthSession(session);
        } else {
          this.apiClient.setAuthenticatedSession(session);
        }

        const welcome = getHirePoolGreetingForAuthState({ status: 'authenticated', identity: session.identity });
        if (typeof this.setGreeting === 'function') {
          this.setGreeting(welcome.greeting, welcome.prompts);
        }

        this.events.emit('hirepool:auth:change', { status: 'authenticated', identity: session.identity });
        this.events.emit('action:success', { actionId: action.id, action: action.action, result: session });
        this._scrollToBottom();
      } catch (err) {
        emailInput.disabled = false;
        passwordInput.disabled = false;
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        statusMsg.style.display = 'flex';
        statusMsg.className = 'ai-action-status-msg error';
        statusMsg.textContent = err.message || 'Email or password is not correct.';
        passwordInput.focus();
        this.events.emit('action:error', { actionId: action.id, action: action.action, error: err });
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
        this._isLoginRedirectMode()
          ? 'You can log in to your HirePool dashboard using the button below. Once you are signed in, the assistant there can help with your profile, jobs, and applications.'
          : 'Please enter your HirePool email and password below to sign in.'
      );
      return true;
    }
    return false;
  }

  invalidatePendingActions(message) {
    for (const card of this.messagesList.querySelectorAll('.ai-action-card')) {
      if (['hirepool_login', 'hirepool_signup'].includes(card.getAttribute('data-action-type'))) continue;
      const controls = card.querySelector('.ai-action-controls');
      const status = card.querySelector('.ai-action-status-msg');
      if (controls) controls.style.display = 'none';
      if (status) {
        status.style.display = 'flex';
        status.className = 'ai-action-status-msg cancelled';
        status.textContent = message;
      }
    }
  }

  _isGuestSession() {
    if (this.apiClient?.getAuthenticatedSession?.()) return false;
    if (this.hostIdentity?.id || this.hostIdentity?.email) return false;
    const ctx = this.options?.context;
    if (ctx && typeof ctx === 'object' && ctx.authentication?.identity) return false;
    if (typeof ctx === 'string' && ctx.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(ctx);
        if (parsed?.authentication?.identity) return false;
      } catch {}
    }
    return true;
  }

  _isHirePoolSignupEnabled() {
    if (this.options?.behavior?.signupEnabled === false) return false;
    return Boolean(
      (!this.options?.assistantId || this.options.assistantId === 'hirepool') &&
      typeof this.apiClient?.getSignupAgreement === 'function'
    );
  }

  _isLoginRedirectMode() {
    return this.options?.behavior?.loginMode === 'redirect';
  }

  /** Website "Sign in": go to the HirePool app's login page (local only for now). */
  _goToLogin() {
    const url = this._getAppLoginUrl() || 'http://localhost:5173/login';
    this.events.emit('login:redirect', { url });
    if (typeof window !== 'undefined' && window.location) {
      window.location.assign(url);
    }
  }

  /** Website: the account bar folds into header buttons once the visitor has written. */
  _syncWebsiteChatState() {
    if (!this.container || this.options?.surface !== 'website') return;
    this.container.classList.toggle('ai-has-chat', this.messages.some(m => m.role === 'user'));
  }

  _getAppLoginUrl() {
    try {
      const url = new URL(this.options?.behavior?.appLoginUrl);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  }

  _buildChatContextPayload(rawContext) {
    let baseContext = typeof rawContext === 'string' && rawContext.trim().length > 0
      ? rawContext.trim()
      : '';

    const activeSignupStates = new Set([
      HIREPOOL_SIGNUP_STATES.IDLE,
      HIREPOOL_SIGNUP_STATES.CANCELLED,
      HIREPOOL_SIGNUP_STATES.COMPLETED
    ]);

    if (this._isHirePoolSignupEnabled() && this.hirePoolSignup && !activeSignupStates.has(this.hirePoolSignup.state)) {
      const rolePart = this.hirePoolSignup.selectedRole
        ? ` role=${this.hirePoolSignup.selectedRole}`
        : '';
      const tag = `[HIREPOOL_SIGNUP_STATE state=${this.hirePoolSignup.state}${rolePart}]`;
      baseContext = baseContext ? `${baseContext}\n${tag}` : tag;
    }

    return baseContext || undefined;
  }

  _appendAssistantSignupNotice(text) {
    this._renderMessageBubble('assistant', text, true);
    this.messages.push({ role: 'assistant', content: text });
    this._persistState();
    this.events.emit('message:received', { role: 'assistant', content: text });
  }

  async _startHirePoolSignup(initialRole = null) {
    try {
      await this.hirePoolSignup.start(initialRole || null);
    } catch (error) {
      this._renderErrorBanner(error?.message || 'Unable to start HirePool signup.');
    }
  }

  /**
   * Remember which account type a guest described ("I'm a staffing agency",
   * "I'm looking for a job"). Only short, role-like messages count, so a long
   * question that happens to mention a company does not change it.
   */
  _rememberVisitorRole(text) {
    const value = String(text || '').trim();
    if (!value || value.split(/\s+/).length > 8) return;
    if (/^\s*(?:i'?m|i\s+am)\s+looking\s+for\s+(?:a\s+)?(?:new\s+)?(?:job|work|role)\b|^\s*find\s+(?:me\s+)?(?:a\s+)?job\b/i.test(value)) {
      this._visitorSignupRole = 'candidate';
      return;
    }
    const parsed = parseHirePoolRoleChoice(value);
    if (parsed) this._visitorSignupRole = parsed === 'staffing' ? 'consultancy' : parsed;
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

      if (
        signupState === HIREPOOL_SIGNUP_STATES.ROLE_SELECTION ||
        signupState === HIREPOOL_SIGNUP_STATES.SIGNUP_FORM ||
        signupState === HIREPOOL_SIGNUP_STATES.ERROR
      ) {
        const parsedRole = parseHirePoolRoleChoice(trimmed);
        const explicitRolePhrase = /^\s*(?:i(?:'m| am)\s+(?:a|an)\s+|i\s+(?:want|would\s+like|'d\s+like)\s+(?:to\s+(?:join|sign\s*up|register)\s+as\s+)?(?:a|an)\s+|as\s+(?:a|an)\s+|join\s+(?:hirepool\s+)?as\s+(?:a|an)\s+|switch\s+(?:role\s+)?to\s+|change\s+(?:role\s+)?to\s+|select\s+|choose\s+)?(?:candidate|job\s*seeker|company|client|employer|consultancy|agency|staffing(?:\s+agency)?)\b/i.test(trimmed);

        if (parsedRole && (signupState === HIREPOOL_SIGNUP_STATES.ROLE_SELECTION || explicitRolePhrase)) {
          const canonicalRole = parsedRole === 'staffing' ? 'consultancy' : parsedRole;
          const label = ROLE_DEFINITIONS[canonicalRole]?.label || canonicalRole;
          this._appendAssistantSignupNotice(
            `Great — I selected the **${label}** role and loaded your HirePool registration form below.`
          );
          try {
            await this.hirePoolSignup.selectRole(parsedRole);
          } catch (error) {
            this._renderErrorBanner(error?.message || 'Unable to load the selected signup role.');
          }
          return true;
        }
      }

      if (
        signupState === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_PENDING ||
        signupState === HIREPOOL_SIGNUP_STATES.VERIFICATION_PENDING ||
        signupState === HIREPOOL_SIGNUP_STATES.EMAIL_VERIFICATION_IN_PROGRESS ||
        signupState === HIREPOOL_SIGNUP_STATES.VERIFICATION_IN_PROGRESS
      ) {
        if (/\b(?:resend|send\s+again|new\s+(?:link|email|verification))\b/i.test(trimmed)) {
          try {
            await this.hirePoolSignup.resendVerification();
            this._appendAssistantSignupNotice(
              'I requested a fresh verification email. Please check your inbox and click Verify once you have opened the link.'
            );
          } catch (error) {
            this._renderErrorBanner(error?.message || 'Could not resend verification email.');
          }
          return true;
        }

        if (/^\s*(?:done|verified|i(?:'ve| have)?\s+verified|i\s+clicked|check(?:\s+verification(?:\s+status)?)?|verify|continue)\s*[.!?]*\s*$/i.test(trimmed)) {
          try {
            await this.hirePoolSignup.checkVerificationStatus();
          } catch (error) {
            this._renderErrorBanner(error?.message || 'Could not verify email status yet.');
          }
          return true;
        }
      }

      if (/^\s*(?:continue|resume|show\s+(?:signup|form|card)|go\s+back\s+to\s+signup)\s*[.!?]*\s*$/i.test(trimmed)) {
        this._appendAssistantSignupNotice(
          'Here is your active HirePool signup step below—complete the card or type "cancel" to exit.'
        );
        this.hirePoolSignup.resume();
        return true;
      }

      // Allow informational questions during active signup to fall through to the backend LLM
      return false;
    }

    const isRoleSpecificTrigger = /^\s*(?:(?:i\s+(?:want|would\s+like|'d\s+like)\s+to\s+)?(?:sign\s*up|signup|register|join)|(?:create\s+(?:an?\s+)?account))\s+(?:hirepool\s+)?as\s+(?:an?\s+)?(?:candidate|job\s*seeker|company|client|employer|consultancy|agency|staffing(?:\s+agency)?)\b/i.test(trimmed) ||
      /^\s*(?:sign\s*up|register)(?:\s+as)?\s+(?:an?\s+)?(?:candidate|company|client|employer|consultancy|agency|staffing)\b/i.test(trimmed);

    if (isRoleSpecificTrigger) {
      const parsedRole = parseHirePoolRoleChoice(trimmed);
      if (parsedRole) {
        const canonicalRole = parsedRole === 'staffing' ? 'consultancy' : parsedRole;
        const label = ROLE_DEFINITIONS[canonicalRole]?.label || canonicalRole;
        this._appendAssistantSignupNotice(
          `Starting your **${label}** HirePool signup right here in chat.`
        );
        await this._startHirePoolSignup(parsedRole);
        return true;
      }
    }

    const isGeneralSignupTrigger = /^\s*(?:(?:sign\s*up|signup|register|create\s+(?:an?\s+)?account)\s*(?:for\s+hirepool)?|i\s+(?:want|would\s+like|'d\s+like)\s+to\s+(?:sign\s*up|signup|register|join(?:\s+hirepool)?))\s*[.!?]*\s*$/i.test(trimmed);

    // The visitor already told us who they are (role card or reply): skip the role picker.
    if (isGeneralSignupTrigger && this._visitorSignupRole) {
      const role = this._visitorSignupRole;
      const label = ROLE_DEFINITIONS[role]?.label || role;
      this._appendAssistantSignupNotice(`Great! Let's create your **${label}** account right here in chat.`);
      await this._startHirePoolSignup(role);
      return true;
    }

    if (isGeneralSignupTrigger) {
      this._appendAssistantSignupNotice(
        'Let’s get your HirePool account set up! Choose your account type below, or reply with **Candidate**, **Employer / Company**, or **Agency / Consultancy**.'
      );
      await this._startHirePoolSignup(null);
      return true;
    }

    return false;
  }

  async _assertDocumentContextAvailable() {
    const knownDocuments = this.storage.get('documents', []);
    if (!Array.isArray(knownDocuments) || knownDocuments.length === 0) return;
    if (!this.activeConversationId) {
      throw new Error('The previous document session is unavailable. Start a new conversation and upload the document again.');
    }

    const currentDocuments = await this.apiClient.getDocuments(this.activeConversationId);
    const availableIds = new Set(currentDocuments.map(document => document.id));
    if (knownDocuments.some(doc => !availableIds.has(doc.id))) {
      throw new Error('Document context is no longer available for this conversation. Start a new conversation and upload the document again.');
    }
  }

  async sendMessage(text, { displayUserMessage = true, displayText = null } = {}) {
    const trimmed = (text || '').trim();
    if (!trimmed || this.isGenerating) return;
    // A short label for long generated requests (e.g. a job built from an uploaded description).
    const shown = typeof displayText === 'string' && displayText.trim() ? displayText.trim() : trimmed;

    try {
      await this._assertDocumentContextAvailable();
    } catch (error) {
      this._renderErrorBanner(error.message);
      this.events.emit('error', error);
      return;
    }

    // Reset textarea
    this.textarea.value = '';
    this.textarea.style.height = 'auto';

    if (displayUserMessage) {
      this.messages.push({ role: 'user', content: shown });
      this._renderMessageBubble('user', shown);
      this._persistState();
    }
    this.events.emit('message:sent', {
      role: 'user',
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

    // Dashboard: whole-profile edits happen in a form rather than field by field in chat.
    if (this._profileFormHandlers && this.options?.surface === 'app') {
      const formMode = /^\s*(?:please\s+)?(?:complete|finish|fill\s*(?:in|up)?)\s+(?:my\s+|the\s+)?profile\s*[.!]*\s*$/i.test(trimmed)
        ? 'missing'
        : /^\s*(?:please\s+)?(?:edit|update|change)\s+(?:my\s+|the\s+)?profile(?:\s+details)?\s*[.!]*\s*$/i.test(trimmed)
          ? 'all'
          : null;
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
      let accumulatedText = '';

      const handleError = async (err) => {
        const isSessionDenied =
          err?.status === 403 ||
          err?.code === 'SESSION_ACCESS_DENIED' ||
          String(err?.message || '').toLowerCase().includes('belongs to another user');

        if (!isRetry && isSessionDenied) {
          console.warn('[AI Assistant] Conversation ownership conflict detected; resetting conversation ID and retrying:', err.message);
          this.activeConversationId = null;
          this.storage.clearConversationId();
          if (assistantBubbleRow && assistantBubbleRow.parentNode) {
            assistantBubbleRow.parentNode.removeChild(assistantBubbleRow);
          }
          await sendAttempt(true);
          return;
        }

        if (err?.name === 'AbortError') return;

        // Technical details go to the console and the `error` event, never to the user.
        console.warn('[AI Assistant] Request failed:', err);
        this.events.emit('error', err);

        const hadPartialReply = Boolean(accumulatedText && accumulatedText.trim());
        if (!hadPartialReply && assistantBubbleRow && assistantBubbleRow.parentNode) {
          assistantBubbleRow.parentNode.removeChild(assistantBubbleRow);
        }
        this.streamingIndicator.style.display = 'none';

        const info = describeAssistantError(err, {
          surface: this.options?.surface || null,
          online: typeof navigator !== 'undefined' ? navigator.onLine : true,
          hadPartialReply
        });

        // Quiet, one-time recoveries before telling the user anything.
        if (!isRetry && info.recover === 'new-conversation') {
          this.activeConversationId = null;
          this.storage.clearConversationId();
          await sendAttempt(true);
          return;
        }
        if (!isRetry && info.recover === 'reauthenticate') {
          // In the dashboard, get a fresh assistant login from the app's current token.
          this.events.emit('auth:refresh-needed');
          await sendAttempt(true);
          return;
        }

        const resend = () => this.sendMessage(trimmed, { displayUserMessage: false });
        if (info.recover === 'wait-online' && typeof window !== 'undefined') {
          this._renderErrorBanner(info.message, null, { retryLabel: null });
          this._resendWhenOnline(resend);
          return;
        }
        if (info.kind === 'signed-out') {
          this._renderErrorBanner(info.message, null, { retryLabel: null, loginUrl: this._getAppLoginUrl() || 'http://localhost:5173/login' });
          return;
        }
        this._renderErrorBanner(
          info.message,
          info.retry === 'none' ? null : resend,
          { retryLabel: info.retry === 'none' ? null : 'Try again', retryAfterMs: info.retryAfterMs }
        );
      };

      try {
        const rawContext = this.options.integration && !this.contextOverrideSet
          ? await this.options.integration.getContext()
          : this.options.context;
        const contextPayload = this._buildChatContextPayload(rawContext);
        await this.apiClient.sendMessage({
          assistantId: this.options.assistantId || 'default',
          message: trimmed,
          context: contextPayload,
          conversationId: (typeof this.activeConversationId === 'string' && this.activeConversationId.trim().length > 0) ? this.activeConversationId.trim() : undefined,
          history: (displayUserMessage ? this.messages.slice(0, -1) : this.messages).filter(m => !m.local).slice(-25),
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
              this.streamingIndicator.style.display = 'none';
              assistantBubbleRow = document.createElement('div');
              assistantBubbleRow.className = 'ai-message-row assistant';
              assistantBubbleContent = document.createElement('div');
              assistantBubbleContent.className = 'ai-bubble';
              assistantBubbleRow.appendChild(assistantBubbleContent);
              this.messagesList.appendChild(assistantBubbleRow);
            }
            assistantBubbleContent.innerHTML = parseMarkdown(accumulatedText);
            assistantBubbleRow.setAttribute('data-raw-content', accumulatedText);
            this._scrollToBottom();
          },
          onDone: (result) => {
            const rawFinalText = result.text || accumulatedText;
            const finalText = this.options?.assistantId === 'hirepool'
              ? (this._stripActionBlocks(rawFinalText) || rawFinalText)
              : rawFinalText;
            const detectedAction = result.action || this._extractAction(rawFinalText);

            if (result?.logout?.loggedOut) {
              if (assistantBubbleRow && assistantBubbleRow.parentNode) {
                assistantBubbleRow.parentNode.removeChild(assistantBubbleRow);
              }
              this.streamingIndicator.style.display = 'none';
              void this._handleHirePoolLogout(result.logout, finalText);
              this.events.emit('message:received', {
                role: 'assistant',
                content: finalText,
                logout: result.logout
              });
              return;
            }

            if (result.conversationId) {
              this.activeConversationId = result.conversationId;
            }

            if (!assistantBubbleRow) {
              this.streamingIndicator.style.display = 'none';
              this._renderMessageBubble('assistant', finalText, true, detectedAction);
            } else {
              assistantBubbleContent.innerHTML = parseMarkdown(finalText);
              if (detectedAction) {
                this._renderActionCard(assistantBubbleContent, detectedAction);
              }
            }

            this.messages.push({ role: 'assistant', content: finalText, action: detectedAction || undefined });
            this._persistState();
            this.events.emit('message:received', { role: 'assistant', content: finalText, action: detectedAction || undefined });
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
}