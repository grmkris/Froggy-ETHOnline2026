/**
 * Parked interactions: a tool call waiting on a human.
 *
 * When the policy says `ask`, the spend does not fail and it does not retry —
 * it parks here until one of three things happens: the person answers on the
 * app socket, the run is aborted (a stop, a superseding turn), or
 * the card's deadline passes. Whichever comes first settles it, and the
 * other two are then no-ops. Every outcome publishes `approval.resolved`, so
 * a second tab showing the same card clears it too.
 *
 * Answering is a socket message from a verified user, never a tool. The
 * check that the answer comes from the user who owns the card is what stops
 * one signed-in person approving another's spend by guessing an id.
 */

import type { UserId } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";

export type ApprovalOutcome =
  | {
      readonly kind: "answered";
      readonly optionId: string;
      /**
       * The answerer's Privy token, when the surface had one. Kept on the
       * outcome so a surface that needs the person's own authority for a
       * follow-up has it; the web socket carries one, Telegram does not.
       */
      readonly accessToken: string | null;
    }
  | { readonly kind: "aborted"; readonly reason: string }
  | { readonly kind: "deadline" };

export interface InteractionDeps {
  readonly now?: () => number;
  readonly onRequest: (userId: UserId, request: ApprovalRequest) => void;
  readonly onResolved: (userId: UserId, requestId: string) => void;
}

export interface ParkInput {
  readonly request: ApprovalRequest;
  /** The run's signal. A parked call must not outlive the turn that made it. */
  readonly signal: AbortSignal;
  readonly userId: UserId;
}

interface Parked {
  readonly request: ApprovalRequest;
  readonly settle: (outcome: ApprovalOutcome) => void;
  readonly userId: UserId;
}

export class InteractionRegistry {
  private readonly deps: InteractionDeps;
  private readonly parked = new Map<string, Parked>();

  constructor(deps: InteractionDeps) {
    this.deps = deps;
  }

  /** The cards a user has open, for a socket that (re)connects mid-question. */
  pendingFor(userId: UserId): readonly ApprovalRequest[] {
    return [...this.parked.values()]
      .filter((entry) => entry.userId === userId)
      .map((entry) => entry.request);
  }

  async park(input: ParkInput): Promise<ApprovalOutcome> {
    const { request, signal, userId } = input;
    const { promise, resolve } = Promise.withResolvers<ApprovalOutcome>();
    const now = this.deps.now ?? Date.now;
    const remaining = Math.max(0, request.expiresAt - now());

    if (signal.aborted) {
      // Nothing to publish: the card would be resolved in the same tick.
      resolve({ kind: "aborted", reason: "the run had already ended" });
      return await promise;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    // First outcome wins; the others find the card gone and do nothing. The
    // abort listener is `once` and checks the same map, so it needs no
    // removal on the other paths.
    const settle = (outcome: ApprovalOutcome): void => {
      if (!this.parked.has(request.id)) {
        return;
      }
      this.parked.delete(request.id);
      if (timer !== null) {
        clearTimeout(timer);
      }
      this.deps.onResolved(userId, request.id);
      resolve(outcome);
    };

    this.parked.set(request.id, { request, settle, userId });
    signal.addEventListener(
      "abort",
      () => {
        settle({ kind: "aborted", reason: "the run was stopped" });
      },
      { once: true }
    );
    timer = setTimeout(() => {
      settle({ kind: "deadline" });
    }, remaining);
    this.deps.onRequest(userId, request);
    return await promise;
  }

  /**
   * A person answered. Refused, silently, when the card is not theirs or is
   * already gone — a stale click is ordinary and a forged one is the reason
   * the user is checked at all.
   */
  resolve(
    userId: UserId,
    requestId: string,
    optionId: string,
    accessToken: string | null = null
  ): boolean {
    const entry = this.parked.get(requestId);
    if (entry === undefined || entry.userId !== userId) {
      return false;
    }
    if (!entry.request.options.some((option) => option.id === optionId)) {
      return false;
    }
    entry.settle({ accessToken, kind: "answered", optionId });
    return true;
  }

  /** Every card this user has open is denied. "Stop the agent" is the usual caller. */
  abortAll(userId: UserId, reason: string): void {
    // Deleting the current entry while iterating a Map is defined behaviour.
    for (const entry of this.parked.values()) {
      if (entry.userId === userId) {
        entry.settle({ kind: "aborted", reason });
      }
    }
  }
}
