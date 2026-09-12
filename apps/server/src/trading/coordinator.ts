/**
 * The trading loop: prepare, approve, reserve, sign, broadcast.
 *
 * Every fill goes through `session.spendTrade()`. This file sequences the
 * human or rule approval and the venue backend; it does not price, authorize
 * or pay. A stub backend is loud (`provider: "fixture"`) so a synthetic fill
 * cannot be mistaken for a chain fill.
 */
import {
  ReceiptId,
  Trade,
  TradeId,
  TradeRule,
  TradeRuleId,
  tradeProceedsRefusal,
} from "@froggy/domain";
import type {
  AgentConnectionId,
  TokenResearchFacts,
  TradeInput,
  LaunchEventId,
  LaunchWatchId,
  TradeAssetAmount,
  TradeSimulation,
  TradeStep,
  UserId,
} from "@froggy/domain";
import { publicTrade, TradePrepare, TradeRuleRequest } from "@froggy/protocol";
import type { TradeAnswer, TradeTicket } from "@froggy/protocol";
import { recoverTrade } from "@froggy/wallet";
import type {
  AgentEvmSigner,
  PrivyServer,
  TradingStore,
  LaunchStore,
  TradeSubmission,
} from "@froggy/wallet";
import type { TransactionPartialSigner } from "@solana/kit";
import { Schema } from "effect";

import type { WorkspaceSession } from "../session";

export type TradeSigner =
  | {
      readonly kind: "evm";
      readonly signer: Pick<AgentEvmSigner, "address" | "signTransaction">;
    }
  | { readonly kind: "solana"; readonly signer: TransactionPartialSigner }
  | null;

export interface TradeBackend {
  readonly stubbed: boolean;
  readonly prepare: (input: TradeInput) => Promise<{
    readonly steps: readonly TradeStep[];
    readonly expectedOutput: string;
    readonly minimumOutput: string;
    readonly phase?: "curve" | "graduated" | "standard";
  }>;
  readonly observe?: (input: TradeInput) => Promise<{
    readonly factory: string | null;
    readonly expectedOutput: string;
    readonly quoteLiquidity: string;
    readonly observedAt: number;
  }>;
  /** Own-RPC research facts for fail-closed rule predicates. Optional. */
  readonly research?: (input: TradeInput) => Promise<TokenResearchFacts>;
  readonly simulate: (trade: Trade) => Promise<readonly TradeSimulation[]>;
  readonly balances: (input: TradeInput) => Promise<{
    readonly balances: readonly TradeAssetAmount[];
    readonly observedAt: number;
  }>;
  readonly submission: (signer: TradeSigner) => TradeSubmission;
}
export interface TradeContext {
  readonly session: WorkspaceSession;
  readonly connectionId: AgentConnectionId | null;
}
export interface TradeCoordinatorOptions {
  readonly store: TradingStore;
  readonly watches?: LaunchStore;
  readonly privy: PrivyServer;
  readonly backend: (input: TradeInput) => TradeBackend | null;
  readonly now: () => number;
}
const fingerprint = (input: TradeInput): string =>
  new Bun.CryptoHasher("sha256").update(JSON.stringify(input)).digest("hex");
const publicError = (error: Error): string =>
  /^trade\.[a-z_]+:/u.test(error.message)
    ? error.message.slice(0, 500)
    : "trade.unavailable: preparation or provider verification failed.";
const terminal = (trade: Trade): boolean =>
  [
    "completed",
    "cancelled",
    "declined",
    "expired",
    "failed",
    "partial",
  ].includes(trade.status);

export class TradeCoordinator {
  private readonly options: TradeCoordinatorOptions;

  constructor(options: TradeCoordinatorOptions) {
    this.options = options;
  }

  private async load(
    owner: UserId,
    id: TradeId,
    connectionId: AgentConnectionId | null
  ): Promise<Trade> {
    const trade = await this.options.store.transact(owner, (book) =>
      book.trades.get(id)
    );
    if (
      trade === undefined ||
      (connectionId !== null && trade.connectionId !== connectionId)
    ) {
      throw new Error("trade.missing: trade not found.");
    }
    return trade;
  }

  private backend(input: TradeInput): TradeBackend {
    const backend = this.options.backend(input);
    if (backend === null) {
      throw new Error(
        "trade.unavailable: this venue, action or network is not configured for execution."
      );
    }
    return backend;
  }

  async prepare(
    context: TradeContext,
    request: TradePrepare,
    automation?: {
      readonly automationRuleId: TradeRuleId;
      readonly launchEventId?: LaunchEventId;
      readonly exitOfTradeId?: TradeId;
      readonly exitReason?: Trade["exitReason"];
    }
  ): Promise<TradeTicket> {
    const decoded = Schema.decodeUnknownSync(TradePrepare)(request);
    const { input } = decoded;
    const backend = this.backend(input);
    const owner = context.session.userId;
    if (!backend.stubbed) {
      const wallets = await this.options.privy.paymentWallets(owner);
      const matches = input.network.startsWith("solana:")
        ? wallets.solana?.address === input.wallet
        : wallets.ethereum?.address.toLowerCase() ===
          input.wallet.toLowerCase();
      if (!matches) {
        throw new Error(
          "trade.wallet: choose the authenticated owner's embedded wallet."
        );
      }
    }
    const digest =
      decoded.sourceTradeId === undefined && automation === undefined
        ? fingerprint(input)
        : new Bun.CryptoHasher("sha256")
            .update(
              JSON.stringify({
                input,
                sourceTradeId: decoded.sourceTradeId,
                automation,
              })
            )
            .digest("hex");
    const now = this.options.now();
    let created = false;
    const proposed = await this.options.store.transact(owner, (book) => {
      const prior = [...book.trades.values()].find(
        (trade) => trade.idempotencyKey === decoded.idempotencyKey
      );
      if (prior !== undefined) {
        if (
          prior.inputFingerprint !== digest ||
          prior.connectionId !== context.connectionId
        ) {
          throw new Error(
            "trade.idempotency: this key is already bound to another request."
          );
        }
        return prior;
      }
      if (book.stopped) {
        throw new Error("trade.frozen: the person stopped trading.");
      }
      const active = [...book.trades.values()].filter(
        (trade) => !terminal(trade)
      );
      if (active.length >= 20) {
        throw new Error(
          "trade.capacity: resolve existing proposals before preparing more."
        );
      }
      let trade = Schema.decodeUnknownSync(Trade)({
        v: 1,
        id: TradeId.generate(),
        idempotencyKey: decoded.idempotencyKey,
        connectionId: context.connectionId,
        createdAt: now,
        updatedAt: now,
        revision: 0,
        input,
        inputFingerprint: digest,
        status: "preparing",
        expectedOutput: null,
        minimumOutput: null,
        actualOutput: null,
        phase: "standard",
        steps: [],
        reservations: [],
        reservationState: "none",
        receiptId: ReceiptId.generate(),
        events: [],
        error: null,
        limitations: [],
        stubbed: backend.stubbed,
      });
      if (automation !== undefined) {
        trade = Schema.decodeUnknownSync(Trade)({ ...trade, ...automation });
      }
      if (decoded.sourceTradeId !== undefined) {
        trade = { ...trade, sourceTradeId: decoded.sourceTradeId };
      }
      if (trade.sourceTradeId !== undefined) {
        const source = book.trades.get(trade.sourceTradeId);
        if (
          context.connectionId !== null &&
          source?.connectionId !== context.connectionId
        ) {
          throw new Error("trade.missing: source trade not found.");
        }
        const denied = tradeProceedsRefusal(trade, source, 0n);
        if (denied !== null) {
          throw new Error(denied);
        }
      }
      book.trades.set(trade.id, trade);
      created = true;
      return trade;
    });
    if (!created) {
      return publicTrade(proposed);
    }
    try {
      const prepared = await backend.prepare(input);
      return await this.options.store.transact(owner, (book) => {
        const current = book.trades.get(proposed.id);
        if (current === undefined) {
          throw new Error("trade.missing: proposal disappeared.");
        }
        if (current.status !== "preparing") {
          return publicTrade(current);
        }
        const next: Trade = {
          ...current,
          ...prepared,
          revision: current.revision + 1,
          status: "awaiting_approval",
          updatedAt: this.options.now(),
          events: [
            {
              id: ReceiptId.generate(),
              at: this.options.now(),
              stepId: null,
              outcome: "prepared",
              reason:
                "trade.prepared: immutable transactions independently simulated.",
              transactionId: null,
            },
          ],
        };
        book.trades.set(next.id, next);
        return publicTrade(next);
      });
    } catch (error) {
      return await this.options.store.transact(owner, (book) => {
        const current = book.trades.get(proposed.id);
        if (current === undefined) {
          throw new Error("trade.missing: proposal disappeared.", {
            cause: error,
          });
        }
        if (current.status !== "preparing") {
          return publicTrade(current);
        }
        const reason = publicError(
          error instanceof Error ? error : new Error("Preparation failed")
        );
        const next: Trade = {
          ...current,
          status: "failed",
          revision: current.revision + 1,
          updatedAt: this.options.now(),
          error: reason,
          events: [
            ...current.events,
            {
              id: ReceiptId.generate(),
              at: this.options.now(),
              stepId: null,
              outcome: "failed",
              reason,
              transactionId: null,
            },
          ],
        };
        book.trades.set(next.id, next);
        return publicTrade(next);
      });
    }
  }

  async get(
    owner: UserId,
    id: TradeId,
    connectionId: AgentConnectionId | null
  ): Promise<TradeTicket> {
    const trade = await this.load(owner, id, connectionId);
    if (["executing", "uncertain"].includes(trade.status)) {
      const backend = this.backend(trade.input);
      if (backend.stubbed !== trade.stubbed) {
        return publicTrade(trade);
      }
      try {
        return publicTrade(
          await recoverTrade(
            this.options.store,
            owner,
            id,
            backend.submission(null),
            this.options.now()
          )
        );
      } catch {
        return publicTrade(trade);
      }
    }
    return publicTrade(trade);
  }

  async list(
    owner: UserId,
    connectionId: AgentConnectionId | null
  ): Promise<readonly TradeTicket[]> {
    return await this.options.store.transact(owner, (book) =>
      [...book.trades.values()]
        .filter(
          (trade) =>
            connectionId === null || trade.connectionId === connectionId
        )
        .toSorted((left, right) => right.createdAt - left.createdAt)
        .slice(0, 50)
        .map(publicTrade)
    );
  }

  async simulate(
    owner: UserId,
    id: TradeId,
    connectionId: AgentConnectionId | null
  ): Promise<TradeTicket> {
    const trade = await this.load(owner, id, connectionId);
    if (trade.status !== "awaiting_approval") {
      throw new Error(
        "trade.state: only unclaimed steps can be simulated again."
      );
    }
    const backend = this.backend(trade.input);
    if (backend.stubbed !== trade.stubbed) {
      throw new Error(
        "trade.mode: prepare a new trade after changing provider mode."
      );
    }
    const results = await backend.simulate(trade);
    return await this.options.store.transact(owner, (book) => {
      const current = book.trades.get(id);
      if (current === undefined || current.revision !== trade.revision) {
        throw new Error(
          "trade.changed: proposal changed while simulation was running."
        );
      }
      let index = 0;
      const steps = current.steps.map((step) => {
        if (step.status !== "prepared" && step.status !== "awaiting_approval") {
          return step;
        }
        const simulation = results[index];
        index += 1;
        if (simulation === undefined) {
          throw new Error("trade.simulation: missing step results.");
        }
        return { ...step, simulation };
      });
      if (index !== results.length) {
        throw new Error("trade.simulation: unexpected step results.");
      }
      const next = {
        ...current,
        revision: current.revision + 1,
        updatedAt: this.options.now(),
        steps,
      };
      book.trades.set(id, next);
      return publicTrade(next);
    });
  }

  async answer(
    context: TradeContext,
    id: TradeId,
    answer: TradeAnswer,
    accessToken: string
  ): Promise<TradeTicket> {
    if (context.connectionId !== null) {
      throw new Error("trade.human_only: agents cannot answer approvals.");
    }
    const owner = context.session.userId;
    const trade = await this.load(owner, id, null);
    const step = trade.steps.find((entry) => entry.id === answer.stepId);
    if (
      step === undefined ||
      step.approvalId !== answer.approvalId ||
      step.fingerprint !== answer.fingerprint
    ) {
      throw new Error(
        "trade.approval: answer does not match this exact transaction."
      );
    }
    if (answer.decision !== "allow_once") {
      if (answer.decision === "deny_stop") {
        await this.stop(owner, true);
      }
      return await this.cancel(
        owner,
        id,
        "trade.declined: the person declined this transaction."
      );
    }
    try {
      return await this.approve(context, trade, step, answer, accessToken);
    } catch (error) {
      const reason = publicError(
        error instanceof Error ? error : new Error("Approval failed")
      );
      await this.recordRefusal(owner, trade, step, reason);
      throw new Error(reason, { cause: error });
    }
  }

  private async recordRefusal(
    owner: UserId,
    trade: Trade,
    step: TradeStep,
    reason: string
  ): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      const current = book.trades.get(trade.id);
      if (
        current === undefined ||
        current.events.length >= 241 ||
        current.events
          .slice(trade.events.length)
          .some(
            (event) =>
              event.outcome === "denied" &&
              event.stepId === step.id &&
              event.reason === reason
          )
      ) {
        return;
      }
      book.trades.set(trade.id, {
        ...current,
        revision: current.revision + 1,
        updatedAt: this.options.now(),
        events: [
          ...current.events,
          {
            id: ReceiptId.generate(),
            at: this.options.now(),
            stepId: step.id,
            outcome: "denied",
            reason,
            transactionId: null,
          },
        ],
      });
    });
  }

  private async approve(
    context: TradeContext,
    trade: Trade,
    step: TradeStep,
    answer: TradeAnswer,
    accessToken: string
  ): Promise<TradeTicket> {
    const owner = context.session.userId;
    const { id } = trade;
    const backend = this.backend(trade.input);
    if (backend.stubbed !== trade.stubbed) {
      throw new Error(
        "trade.mode: prepare a new trade after changing provider mode."
      );
    }
    // Refresh the same bytes, then let the atomic claim check their fingerprint and freshness.
    await this.simulate(owner, id, null);
    const balances = await backend.balances(trade.input);
    const signer = backend.stubbed
      ? null
      : await this.ownerSigner(owner, trade.input, accessToken);
    const result = await context.session.spendTrade(
      {
        id,
        stepId: step.id,
        authority: {
          kind: "human",
          approvalId: answer.approvalId,
          fingerprint: answer.fingerprint,
        },
        now: this.options.now(),
        frozen: false,
        balances: balances.balances,
        balanceObservedAt: balances.observedAt,
      },
      backend.submission(signer)
    );
    return publicTrade(result);
  }

  async executeRule(
    context: TradeContext,
    id: TradeId,
    ruleId: TradeRuleId
  ): Promise<TradeTicket> {
    const owner = context.session.userId;
    await this.get(owner, id, context.connectionId);
    const trade = await this.load(owner, id, context.connectionId);
    if (
      terminal(trade) ||
      trade.status === "executing" ||
      trade.status === "uncertain"
    ) {
      return publicTrade(trade);
    }
    const step = trade.steps.find(
      (entry) =>
        entry.status === "prepared" || entry.status === "awaiting_approval"
    );
    if (step === undefined) {
      return await this.get(owner, id, context.connectionId);
    }
    try {
      const backend = this.backend(trade.input);
      if (backend.stubbed !== trade.stubbed) {
        throw new Error(
          "trade.mode: prepare a new trade after changing provider mode."
        );
      }
      await this.simulate(owner, id, context.connectionId);
      const observation = await backend.observe?.(trade.input);
      if (
        observation !== undefined &&
        (observation.observedAt > this.options.now() ||
          this.options.now() - observation.observedAt > 30_000)
      ) {
        throw new Error(
          "trade.snapshot: refresh launch membership before signing."
        );
      }
      const bookRule = await this.options.store.transact(owner, (book) =>
        book.rules.get(ruleId)
      );
      const research = await this.ruleResearch(backend, trade, bookRule);
      const balances = await backend.balances(trade.input);
      const signer = backend.stubbed
        ? null
        : await this.agentSigner(owner, trade.input);
      const result = await context.session.spendTrade(
        {
          id,
          stepId: step.id,
          authority: {
            kind: "rule",
            ruleId,
            verifiedFactory: observation?.factory ?? null,
            research,
          },
          now: this.options.now(),
          frozen: false,
          balances: balances.balances,
          balanceObservedAt: balances.observedAt,
        },
        backend.submission(signer)
      );
      return publicTrade(result);
    } catch (error) {
      const reason = publicError(
        error instanceof Error ? error : new Error("Rule execution failed")
      );
      await this.recordRefusal(owner, trade, step, reason);
      throw new Error(reason, { cause: error });
    }
  }

  /**
   * Research predicates gate entries only. An exit spends a position the rule
   * already acquired; a stale or failed read must refuse a buy, never trap it.
   */
  private async ruleResearch(
    backend: TradeBackend,
    trade: Trade,
    rule: TradeRule | undefined
  ): Promise<TokenResearchFacts | null> {
    if (rule?.research === undefined || trade.exitOfTradeId !== undefined) {
      return null;
    }
    if (backend.research === undefined) {
      throw new Error(
        "trade.research_venue: this route cannot supply research facts for the rule."
      );
    }
    const research = await backend.research(trade.input);
    if (
      research.observedAt > this.options.now() ||
      this.options.now() - research.observedAt > 30_000
    ) {
      throw new Error(
        "trade.research_stale: refresh research facts before signing."
      );
    }
    return research;
  }

  async observe(input: TradeInput) {
    const backend = this.backend(input);
    if (backend.observe === undefined) {
      throw new Error(
        "trade.observation: this route has no automatic exit observation."
      );
    }
    return await backend.observe(input);
  }

  private async agentSigner(
    owner: UserId,
    input: TradeInput
  ): Promise<TradeSigner> {
    const wallets = await this.options.privy.paymentWallets(owner);
    if (input.network.startsWith("solana:")) {
      const wallet = wallets.solana;
      const signer =
        wallet === null ? null : this.options.privy.solanaSignerFor(wallet);
      if (signer === null || wallet?.address !== input.wallet) {
        throw new Error(
          "trade.signer: a policy-bound Solana agent signer is unavailable; owner approval is required."
        );
      }
      return { kind: "solana", signer };
    }
    const wallet = wallets.ethereum;
    const signer =
      wallet === null ? null : this.options.privy.signerFor(wallet);
    if (
      signer === null ||
      wallet?.address.toLowerCase() !== input.wallet.toLowerCase()
    ) {
      throw new Error(
        "trade.signer: a policy-bound EVM agent signer is unavailable; owner approval is required."
      );
    }
    return { kind: "evm", signer };
  }

  private async ownerSigner(
    owner: UserId,
    input: TradeInput,
    accessToken: string
  ): Promise<TradeSigner> {
    const request = { did: owner, accessToken };
    if (input.network.startsWith("solana:")) {
      const signer = await this.options.privy.ownerSolanaSigner(request);
      if (signer === null) {
        throw new Error(
          "trade.signer: the owner's Solana signer is unavailable."
        );
      }
      return { kind: "solana", signer };
    }
    const signer = await this.options.privy.ownerTradeSigner(request);
    if (signer === null) {
      throw new Error("trade.signer: the owner's EVM signer is unavailable.");
    }
    return { kind: "evm", signer };
  }

  async stop(owner: UserId, stopped: boolean): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      book.stopped = stopped;
    });
  }

  async stopAndRevoke(owner: UserId): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      book.stopped = true;
      for (const [id, rule] of book.rules) {
        if (rule.revokedAt === null) {
          book.rules.set(id, { ...rule, revokedAt: this.options.now() });
        }
      }
    });
  }

  async cancel(
    owner: UserId,
    id: TradeId,
    reason = "trade.cancelled: the person cancelled this proposal."
  ): Promise<TradeTicket> {
    return await this.options.store.transact(owner, (book) => {
      const trade = book.trades.get(id);
      if (trade === undefined) {
        throw new Error("trade.missing: trade not found.");
      }
      if (terminal(trade)) {
        return publicTrade(trade);
      }
      if (
        trade.steps.some((step) =>
          ["signing", "signed", "submitted", "uncertain"].includes(step.status)
        )
      ) {
        throw new Error(
          "trade.pending: reconcile the submitted transaction before cancelling remaining steps."
        );
      }
      const next: Trade = {
        ...trade,
        revision: trade.revision + 1,
        status: "cancelled",
        updatedAt: this.options.now(),
        reservationState: "released",
        error: reason,
        steps: trade.steps.map((step) =>
          step.status === "confirmed" ? step : { ...step, status: "cancelled" }
        ),
        events: [
          ...trade.events,
          {
            id: ReceiptId.generate(),
            at: this.options.now(),
            stepId: null,
            outcome: "cancelled",
            reason,
            transactionId: null,
          },
        ],
      };
      book.trades.set(id, next);
      return publicTrade(next);
    });
  }

  async createRule(
    owner: UserId,
    request: TradeRuleRequest
  ): Promise<TradeRule> {
    const input = Schema.decodeUnknownSync(TradeRuleRequest)(request);
    const rule = Schema.decodeUnknownSync(TradeRule)({
      ...input,
      id: TradeRuleId.generate(),
      createdAt: this.options.now(),
      revokedAt: null,
    });
    if (
      rule.expiresAt <= rule.createdAt ||
      rule.expiresAt > rule.createdAt + 7 * 24 * 60 * 60_000
    ) {
      throw new Error("trade.rule_expiry: choose an expiry within seven days.");
    }
    if (rule.research !== undefined) {
      const ponsOnly = rule.venues.length === 1 && rule.venues[0] === "pons";
      if (!ponsOnly) {
        throw new Error(
          "trade.research_venue: research predicates are only available on the Pons venue."
        );
      }
      if (
        rule.research.requireTemplateMatch ||
        rule.research.forbidLaunchInsiders
      ) {
        // Pons supplies template and venue_events cohort.
      } else if (rule.research.maxTopHoldersBps === null) {
        throw new Error(
          "trade.research_venue: enable at least one research predicate."
        );
      }
    }
    if (rule.watchId !== undefined) {
      await this.checkWatchRule(owner, rule);
    } else if (rule.exits !== undefined) {
      throw new Error(
        "trade.rule_watch: automatic exits require a bounded paid watch."
      );
    }
    await this.options.store.transact(owner, (book) => {
      if (book.rules.size >= 100) {
        throw new Error(
          "trade.rule_capacity: this workspace has reached its retained rule limit."
        );
      }
      book.rules.set(rule.id, rule);
    });
    if (rule.watchId !== undefined) {
      try {
        await this.attachWatchRule(owner, rule);
      } catch (error) {
        await this.revokeRule(owner, rule.id);
        throw error;
      }
    }
    return rule;
  }

  private async checkWatchRule(owner: UserId, rule: TradeRule): Promise<void> {
    if (this.options.watches === undefined || rule.watchId === undefined) {
      throw new Error("trade.rule_watch: the purchased watch is unavailable.");
    }
    const id = rule.watchId;
    const watch = await this.options.watches.transact(owner, (book) =>
      book.get(id)
    );
    if (
      watch === undefined ||
      watch.status !== "active" ||
      watch.reaction !== undefined ||
      watch.expiresAt < rule.expiresAt ||
      watch.input.network !== rule.network ||
      watch.expiresAt <= this.options.now()
    ) {
      throw new Error(
        "trade.rule_watch: choose an active, unbound watch on the same network with capacity through the rule's expiry."
      );
    }
    if (
      rule.venues.length !== 1 ||
      !["pons", "pump"].includes(rule.venues[0] ?? "") ||
      rule.actions.length !== 1 ||
      rule.actions[0] !== "swap"
    ) {
      throw new Error(
        "trade.rule_route: automatic launch reactions support one native Pons or Pump swap route."
      );
    }
  }

  private async attachWatchRule(owner: UserId, rule: TradeRule): Promise<void> {
    const store = this.options.watches;
    const id = rule.watchId;
    if (store === undefined || id === undefined) {
      throw new Error("trade.rule_watch: watch is unavailable.");
    }
    await store.transact(owner, (book) => {
      const watch = book.get(id);
      const now = this.options.now();
      if (
        watch === undefined ||
        watch.status !== "active" ||
        watch.reaction !== undefined ||
        watch.expiresAt <= now
      ) {
        throw new Error(
          "trade.rule_watch: the watch changed before activation."
        );
      }
      book.set(id, {
        ...watch,
        revision: watch.revision + 1,
        reaction: {
          ruleId: rule.id,
          createdAt: now,
          nextCheckAt: now,
          lastCheckAt: null,
          claimExpiresAt: null,
          checksUsed: 0,
          maxChecks: Math.min(
            watch.maxPolls,
            Math.ceil((rule.expiresAt - now) / 30_000)
          ),
          entryCursor: watch.events.length,
          positionCursor: 0,
          pendingTradeId: null,
          error: null,
        },
      });
    });
  }

  async revokeWatchRules(owner: UserId, id: LaunchWatchId): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      for (const [key, rule] of book.rules) {
        if (rule.watchId === id && rule.revokedAt === null) {
          book.rules.set(key, { ...rule, revokedAt: this.options.now() });
        }
      }
    });
  }

  async revokeRule(owner: UserId, id: TradeRuleId): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      const rule = book.rules.get(id);
      if (rule === undefined) {
        throw new Error("trade.rule_missing: rule not found.");
      }
      if (rule.revokedAt === null) {
        book.rules.set(id, { ...rule, revokedAt: this.options.now() });
      }
    });
  }
}
