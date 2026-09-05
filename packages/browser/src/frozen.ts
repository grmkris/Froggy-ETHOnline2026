/**
 * The wallet's kill switch has reached the browser.
 *
 * Thrown to the *agent's* commands only. The human keeps driving: a freeze is
 * a statement about the agent, and locking the person out of their own page
 * while they are trying to stop something would be the wrong way round.
 */
export class BrowserFrozenError extends Error {
  readonly kind = "BrowserFrozenError";

  constructor(reason: string) {
    super(`The browser is frozen (${reason}). The agent may not drive it.`);
    this.name = "BrowserFrozenError";
  }
}
