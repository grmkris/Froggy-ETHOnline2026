/**
 * The interaction gate: who is currently driving the shared browser, the human
 * or the agent. Pure policy — no CDP, no tabs, no I/O beyond timers.
 *
 * There is deliberately **no lock**. A lock would mean one of them waits for
 * the other to finish, and the product promise is that a person can grab the
 * page mid-action. So the human always wins immediately and the agent is
 * merely asked to pause, bounded by a starvation cap so a person leaning on a
 * key cannot freeze the agent forever.
 *
 * Ported from invok, which ported it from harness.
 */
import type { InteractionMode } from "@froggy/protocol";

import { BrowserSessionClosedError } from "./errors";

/** Why `waitForHumanIdle` unblocked. `skipped` = human was already quiet. */
export type WaitReason = "skipped" | "idle" | "timeout";

export const HUMAN_ACTIVE_MS = 1500;
/**
 * Upper bound on how long an agent op waits for the human to go quiet.
 * Without it a continuously-typing human starves the agent forever.
 */
const AGENT_WAIT_MS = 15_000;

type Waiter = (result?: Error | "timeout") => void;

export interface ArbitratorDeps {
  onStateChange: () => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** Who is driving, and when the human last touched the page. */
export interface Interaction {
  lastHumanInputAt: number;
  mode: InteractionMode;
}

export class Arbitrator {
  readonly interaction: Interaction = {
    lastHumanInputAt: 0,
    mode: "idle",
  };

  private readonly onStateChange: () => void;
  private readonly now: () => number;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private agentHolders = 0;
  /**
   * Each entry settles one `waitForHumanIdle`: called bare it resolves (the
   * human's window lapsed), with `"timeout"` it is the starvation bound, with
   * an error it rejects (session teardown).
   */
  private readonly idleWaiters = new Set<Waiter>();
  private disposed = false;

  constructor(deps: ArbitratorDeps) {
    this.onStateChange = deps.onStateChange;
    this.now = deps.now ?? Date.now;
  }

  noteHumanInput(): void {
    this.interaction.lastHumanInputAt = this.now();
    if (this.interaction.mode !== "human") {
      this.interaction.mode = "human";
      this.onStateChange();
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      // The window lapsed: hand the browser back to whoever still wants it.
      const next: InteractionMode = this.agentHolders > 0 ? "agent" : "idle";
      if (this.interaction.mode !== next) {
        this.interaction.mode = next;
        this.onStateChange();
      }
      // The same transition that ends the human's turn wakes anyone waiting
      // on it. Each wake deletes itself from the set, which Set iteration
      // tolerates for the current element.
      for (const wake of this.idleWaiters) {
        wake();
      }
    }, HUMAN_ACTIVE_MS);
  }

  /** True while at least one agent operation holds the browser. */
  get agentActive(): boolean {
    return this.agentHolders > 0;
  }

  /**
   * Run an agent operation with the interaction gate held: wait (event-driven)
   * for the human to go quiet, bounded by `waitMs`; ref-count holders so
   * parallel tool calls don't flip the mode out from under each other; publish
   * the mode change only on the 0<->1 transitions. Human input during a hold
   * still wins — `noteHumanInput` takes the mode, and it returns to "agent"
   * when the human's window lapses with the agent still holding.
   */
  async withAgentControl<T>(
    fn: () => Promise<T>,
    opts: { waitMs?: number } = {}
  ): Promise<{ value: T; wait: WaitReason }> {
    if (this.disposed) {
      throw new BrowserSessionClosedError();
    }
    const wait = await this.waitForHumanIdle(opts.waitMs ?? AGENT_WAIT_MS);
    this.acquireAgent();
    try {
      return { value: await fn(), wait };
    } finally {
      this.releaseAgent();
    }
  }

  /**
   * Session teardown: stop the idle timer and fail anyone still waiting on a
   * human window that will now never lapse. Rejected, not resolved: resolving
   * would send them into `fn()` against a closed session.
   */
  dispose(): void {
    this.disposed = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    for (const wake of this.idleWaiters) {
      wake(new BrowserSessionClosedError());
    }
  }

  private get humanActive(): boolean {
    return this.now() - this.interaction.lastHumanInputAt < HUMAN_ACTIVE_MS;
  }

  private async waitForHumanIdle(waitMs: number): Promise<WaitReason> {
    if (!this.humanActive) {
      return "skipped";
    }
    // oxlint-disable-next-line promise/avoid-new -- a waiter set raced against a timer has no await form
    return await new Promise<WaitReason>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish: Waiter = (result) => {
        // Already settled: the delete returning false means another path — the
        // idle timer, the starvation timer, or dispose — got here first.
        if (!this.idleWaiters.delete(finish)) {
          return;
        }
        if (timer) {
          clearTimeout(timer);
        }
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result ?? "idle");
        }
      };
      this.idleWaiters.add(finish);
      timer = setTimeout(() => {
        finish("timeout");
        // The starvation bound: a human leaning on a key must not freeze the
        // agent forever.
      }, waitMs);
    });
  }

  private acquireAgent(): void {
    this.agentHolders += 1;
    if (
      this.agentHolders === 1 &&
      !this.humanActive &&
      this.interaction.mode !== "agent"
    ) {
      this.interaction.mode = "agent";
      this.onStateChange();
    }
  }

  private releaseAgent(): void {
    if (this.agentHolders === 0) {
      return;
    }
    this.agentHolders -= 1;
    if (this.agentHolders === 0 && this.interaction.mode === "agent") {
      this.interaction.mode = "idle";
      this.onStateChange();
    }
  }
}
