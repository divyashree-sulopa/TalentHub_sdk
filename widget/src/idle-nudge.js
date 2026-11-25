/**
 * Website bot: gently re-engage a quiet visitor.
 *
 * After the assistant speaks, if the visitor has not replied within `delayMs`
 * (5 s by default), the assistant sends a short, friendly follow-up. Limits
 * keep this from becoming spam:
 * - at most `maxConsecutive` follow-ups in a row; the next one needs a reply;
 * - never while the visitor is typing, while the chat is closed or the tab is
 *   hidden, while a reply is loading, or during a signup form;
 * - each follow-up text is used once per conversation.
 */

export class IdleNudgeController {
  /**
   * @param {object} options
   * @param {number} [options.delayMs=5000]
   * @param {number} [options.maxConsecutive=2]
   * @param {(stage: string, index: number) => ({ text: string, quickReplies?: string[] }|null)} options.pickNudge
   * @param {(nudge: { text: string, quickReplies?: string[] }) => void} options.post
   * @param {() => boolean} options.canNudge true when it is a good moment right now
   * @param {() => boolean} [options.isPaused] true while it should wait (e.g. tab hidden)
   */
  constructor({ delayMs = 5000, maxConsecutive = 2, pickNudge, post, canNudge, isPaused = () => false }) {
    this.delayMs = Math.max(1000, Number(delayMs) || 5000);
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
      // Try again later rather than nudging someone who cannot see it.
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
}

/**
 * Pick the next follow-up for a stage, skipping texts already used in this
 * conversation.
 * @param {object} config behavior.idleNudge from the server
 * @param {string} stage 'welcome' | 'answer'
 * @param {Set<string>} used
 */
export function pickIdleNudge(config, stage, used, role = null) {
  // Dashboard: use the signed-in role's follow-ups when they exist.
  if (role && config?.byRole?.[role]) {
    config = config.byRole[role];
  }
  const pool = (
    stage === 'welcome' ? config?.afterWelcome
      : stage === 'question' ? (config?.afterQuestion || config?.afterAnswer)
        : config?.afterAnswer
  ) || [];
  for (const item of pool) {
    const text = typeof item === 'string' ? item : item?.text;
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
