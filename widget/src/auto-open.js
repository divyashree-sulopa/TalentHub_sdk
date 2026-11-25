/**
 * Website bot auto-open.
 *
 * Desktop: opens the chat after the visitor has spent `delayMs` with the tab
 * visible, without moving keyboard focus. Phones: shows a small greeting bubble
 * next to the launcher instead of covering the page.
 *
 * Rules that keep it from being annoying:
 * - only time while the tab is visible counts;
 * - at most once per browser session;
 * - if the visitor closes it, it stays closed for `snoozeHours`;
 * - never on excluded paths (e.g. /privacy, /terms);
 * - waits while the visitor is typing in a page form;
 * - skipped when the visitor already opened the chat or has a conversation.
 */

const SESSION_KEY = 'hirepool-assistant:auto-open:shown';
const SNOOZE_KEY = 'hirepool-assistant:auto-open:snoozed-until';
const MOBILE_QUERY = '(max-width: 640px)';
const TYPING_RECHECK_MS = 2000;

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
    // Storage can be blocked (private mode, strict settings); auto-open still works for this page view.
  }
}

function normalizePath(path) {
  const value = String(path || '/');
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

/**
 * Decide whether auto-open may run on this page view.
 * @param {object} config behavior.autoOpen from the server
 * @param {{ pathname: string, now: number, sessionStorage?: Storage, localStorage?: Storage, hasConversation?: boolean }} env
 */
export function shouldAutoOpen(config, env) {
  if (!config || config.enabled !== true) return false;
  if (env.hasConversation) return false;
  const path = normalizePath(env.pathname);
  const excluded = Array.isArray(config.excludedPaths) ? config.excludedPaths.map(normalizePath) : [];
  if (excluded.includes(path)) return false;
  if (safeGet(env.sessionStorage, SESSION_KEY) === '1') return false;
  const snoozedUntil = Number(safeGet(env.localStorage, SNOOZE_KEY) || 0);
  if (Number.isFinite(snoozedUntil) && snoozedUntil > env.now) return false;
  return true;
}

function isTypingInPage(doc) {
  const el = doc?.activeElement;
  if (!el || el === doc.body) return false;
  if (el.id === 'ai-assistant-plugin-root') return false;
  const tag = String(el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

export class AutoOpenController {
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
    this.remainingMs = Math.max(1000, Number(this.config.delayMs) || 5000);
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
    this.doc.addEventListener('visibilitychange', this._onVisibility);
    if (this.doc.visibilityState !== 'hidden') this._schedule();
    return true;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.doc?.removeEventListener('visibilitychange', this._onVisibility);
  }

  /** The visitor closed the auto-opened chat or the bubble: stay quiet for a while. */
  snooze() {
    const hours = Number.isFinite(this.config.snoozeHours) ? this.config.snoozeHours : 24;
    if (hours > 0) {
      safeSet(this.win?.localStorage, SNOOZE_KEY, String(Date.now() + hours * 60 * 60 * 1000));
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
    if (this.doc.visibilityState === 'hidden') {
      clearTimeout(this.timer);
      this.timer = null;
      this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAt));
    } else {
      this._schedule();
    }
  }

  _fire() {
    if (this.stopped || this.fired) return;
    // The visitor opened the chat or started chatting on their own.
    if (this.isOpen?.() || this.hasConversation?.()) {
      this.stop();
      return;
    }
    if (isTypingInPage(this.doc)) {
      this.timer = setTimeout(() => this._fire(), TYPING_RECHECK_MS);
      return;
    }
    this.fired = true;
    safeSet(this.win.sessionStorage, SESSION_KEY, '1');
    this.doc.removeEventListener('visibilitychange', this._onVisibility);

    const isPhone = typeof this.win.matchMedia === 'function' && this.win.matchMedia(MOBILE_QUERY).matches;
    const mobileMode = this.config.mobile || 'bubble';
    if (isPhone) {
      if (mobileMode === 'bubble') this.showTeaser?.(this.config.teaser || 'Hi! 👋 Need help getting started?');
      else if (mobileMode === 'panel') this.openPanel?.();
      return;
    }
    this.openPanel?.();
  }
}
