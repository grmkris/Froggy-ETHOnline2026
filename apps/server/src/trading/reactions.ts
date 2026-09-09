import { tradeExitTrigger, tradeFinished } from "@froggy/domain";
import type {
  LaunchReaction,
  LaunchWatch,
  LaunchWatchId,
  Trade,
  TradeInput,
  TradeRule,
  UserId,
} from "@froggy/domain";
import type { LaunchStore, TradingStore } from "@froggy/wallet";

import type { WorkspaceSession } from "../session";
import type { TradeCoordinator } from "./coordinator";

const INTERVAL = 30_000;
const LEASE = 120_000;
const reasonOf = (error: Error | null): string =>
  error instanceof Error && /^trade\.[a-z_]+:/u.test(error.message)
    ? error.message.slice(0, 500)
    : "trade.observation: automatic dispatch was unavailable; capacity was consumed without renewal.";

interface LaunchReactorOptions {
  readonly watches: LaunchStore;
  readonly store: TradingStore;
  readonly trades: TradeCoordinator;
  readonly sessionFor: (owner: UserId) => Promise<WorkspaceSession>;
  readonly now: () => number;
}

export class LaunchReactor {
  private active: Promise<void> | null = null;
  private closed = false;
  private cursor = "";
  private readonly options: LaunchReactorOptions;
  constructor(options: LaunchReactorOptions) {
    this.options = options;
  }

  private async claim(owner: UserId, id: LaunchWatchId) {
    return await this.options.watches.transact(owner, (book) => {
      const watch = book.get(id);
      const now = this.options.now();
      const state = watch?.reaction;
      if (
        watch === undefined ||
        state === undefined ||
        watch.status !== "active" ||
        watch.expiresAt <= now ||
        state.checksUsed >= state.maxChecks ||
        state.nextCheckAt > now ||
        (state.claimExpiresAt !== null && state.claimExpiresAt > now)
      ) {
        return null;
      }
      const reaction: LaunchReaction = {
        ...state,
        checksUsed: state.checksUsed + 1,
        nextCheckAt: now + INTERVAL,
        lastCheckAt: now,
        claimExpiresAt: now + LEASE,
      };
      const next = { ...watch, reaction, revision: watch.revision + 1 };
      book.set(id, next);
      return next;
    });
  }

  private async save(
    owner: UserId,
    claimed: LaunchWatch & { readonly reaction: LaunchReaction },
    state: LaunchReaction
  ): Promise<void> {
    await this.options.watches.transact(owner, (book) => {
      const current = book.get(claimed.id);
      if (
        current?.status !== "active" ||
        current.reaction?.checksUsed !== claimed.reaction.checksUsed ||
        current.reaction.claimExpiresAt !== claimed.reaction.claimExpiresAt
      ) {
        return;
      }
      book.set(current.id, {
        ...current,
        revision: current.revision + 1,
        reaction: { ...state, claimExpiresAt: null },
      });
    });
  }

  private async execute(
    owner: UserId,
    watch: LaunchWatch,
    rule: TradeRule,
    state: LaunchReaction
  ): Promise<LaunchReaction> {
    if (state.pendingTradeId === null) {
      return state;
    }
    const session = await this.options.sessionFor(owner);
    const saved = await this.options.trades.get(
      owner,
      state.pendingTradeId,
      watch.connectionId
    );
    if (saved.stubbed !== watch.stubbed) {
      throw new Error(
        "trade.mode: simulated observations cannot dispatch live funds or change execution mode."
      );
    }
    try {
      const trade = await this.options.trades.executeRule(
        { session, connectionId: watch.connectionId },
        state.pendingTradeId,
        rule.id
      );
      return {
        ...state,
        pendingTradeId: tradeFinished(trade.status) ? null : trade.id,
        error: trade.error,
      };
    } catch (error) {
      const reason = reasonOf(error instanceof Error ? error : null);
      if (/^trade\.(?:expired|phase|mode|signer):/u.test(reason)) {
        await this.options.trades
          .cancel(owner, state.pendingTradeId, reason)
          .catch(() => null);
      }
      const after = await this.options.trades.get(
        owner,
        state.pendingTradeId,
        watch.connectionId
      );
      return {
        ...state,
        pendingTradeId: tradeFinished(after.status) ? null : after.id,
        error: reason,
      };
    }
  }

  private async enter(
    owner: UserId,
    watch: LaunchWatch,
    rule: TradeRule,
    state: LaunchReaction,
    trades: readonly Trade[]
  ): Promise<LaunchReaction> {
    const event = watch.events[state.entryCursor];
    const [venue] = rule.venues;
    if (
      event === undefined ||
      venue === undefined ||
      trades.filter(
        (trade) =>
          trade.automationRuleId === rule.id &&
          trade.exitOfTradeId === undefined
      ).length >= rule.maxTrades
    ) {
      return state;
    }
    const next = { ...state, entryCursor: state.entryCursor + 1 };
    if (
      (watch.orphanedEvents?.includes(event.id) ?? false) ||
      event.observedAt > this.options.now() ||
      event.observedAt < rule.createdAt ||
      this.options.now() - event.observedAt > 60_000 ||
      event.stubbed !== watch.stubbed
    ) {
      return {
        ...next,
        error:
          "trade.event_stale: the listing was observed before activation, is older than one minute or has a different simulation mode.",
      };
    }
    const input: TradeInput = {
      network: rule.network,
      wallet: rule.wallet,
      venue,
      action: "swap",
      tokenIn: rule.inputAsset,
      tokenOut: event.address,
      amount: rule.maxInputPerTrade,
      maxNativeFee: rule.maxNativeFeePerTrade,
      slippageBps: rule.maxSlippageBps,
      position: null,
    };
    const session = await this.options.sessionFor(owner);
    const trade = await this.options.trades.prepare(
      { session, connectionId: watch.connectionId },
      { v: 1, input, idempotencyKey: `reaction:${rule.id}:${event.id}` },
      { automationRuleId: rule.id, launchEventId: event.id }
    );
    if (trade.stubbed !== watch.stubbed) {
      await this.options.trades.cancel(
        owner,
        trade.id,
        "trade.mode: listing and execution modes differ."
      );
      return {
        ...next,
        error:
          "trade.mode: listing and execution modes differ; no signing was attempted.",
      };
    }
    return {
      ...next,
      pendingTradeId: tradeFinished(trade.status) ? null : trade.id,
      error: trade.error,
    };
  }

  private async exit(
    owner: UserId,
    watch: LaunchWatch,
    rule: TradeRule,
    state: LaunchReaction,
    trades: readonly Trade[]
  ): Promise<LaunchReaction> {
    if (rule.exits === undefined) {
      return state;
    }
    const positions = trades.filter(
      (trade) =>
        trade.automationRuleId === rule.id &&
        trade.exitOfTradeId === undefined &&
        trade.status === "completed" &&
        trade.actualOutput !== null
    );
    const entry =
      positions[state.positionCursor % Math.max(1, positions.length)];
    if (entry === undefined || entry.actualOutput === null) {
      return state;
    }
    const next = {
      ...state,
      positionCursor:
        (state.positionCursor + 1) % Math.max(1, positions.length),
    };
    const attempts = trades.filter((trade) => trade.exitOfTradeId === entry.id);
    const pending = attempts.find((trade) => !tradeFinished(trade.status));
    if (pending !== undefined) {
      return { ...next, pendingTradeId: pending.id };
    }
    const consumed = attempts
      .filter((trade) => trade.status === "completed")
      .reduce(
        (sum, trade) => sum + BigInt(trade.actualInput ?? trade.input.amount),
        0n
      );
    const remaining = BigInt(entry.actualOutput) - consumed;
    if (remaining <= 0n || attempts.length >= rule.exits.maxAttempts) {
      return next;
    }
    const input: TradeInput = {
      ...entry.input,
      tokenIn: entry.input.tokenOut,
      tokenOut: rule.inputAsset,
      amount: remaining.toString(),
      maxNativeFee: rule.maxNativeFeePerTrade,
      slippageBps: rule.maxSlippageBps,
    };
    let trigger: Trade["exitReason"] | null =
      this.options.now() >= entry.updatedAt + rule.exits.maxHoldMinutes * 60_000
        ? "time"
        : null;
    if (trigger === null) {
      try {
        const observation = await this.options.trades.observe(input);
        const now = this.options.now();
        if (
          observation.observedAt > now ||
          now - observation.observedAt > INTERVAL
        ) {
          throw new Error("trade.snapshot: exit observation is stale.");
        }
        trigger = tradeExitTrigger(rule, entry, {
          ...observation,
          now,
          heldOutput: remaining.toString(),
        });
      } catch (error) {
        return {
          ...next,
          error: reasonOf(error instanceof Error ? error : null),
        };
      }
    }
    if (trigger === null) {
      return next;
    }
    const session = await this.options.sessionFor(owner);
    const trade = await this.options.trades.prepare(
      { session, connectionId: watch.connectionId },
      {
        v: 1,
        input,
        idempotencyKey: `exit:${rule.id}:${entry.id}:${attempts.length}`,
      },
      {
        automationRuleId: rule.id,
        exitOfTradeId: entry.id,
        exitReason: trigger,
      }
    );
    return {
      ...next,
      pendingTradeId: tradeFinished(trade.status) ? null : trade.id,
      error: trade.error,
    };
  }

  private async dispatch(owner: UserId, id: LaunchWatchId): Promise<void> {
    const claimed = await this.claim(owner, id);
    if (claimed === null) {
      return;
    }
    let state: LaunchReaction = { ...claimed.reaction, error: null };
    try {
      const book = await this.options.store.transact(
        owner,
        (current) => current
      );
      const rule = book.rules.get(state.ruleId);
      if (
        book.stopped ||
        rule === undefined ||
        rule.revokedAt !== null ||
        rule.expiresAt <= this.options.now() ||
        rule.watchId !== claimed.id
      ) {
        state = {
          ...state,
          error:
            "trade.rule_inactive: automatic reactions are stopped, revoked or expired.",
        };
      } else {
        const trades = [...book.trades.values()];
        if (state.pendingTradeId === null) {
          state = await this.exit(owner, claimed, rule, state, trades);
        }
        if (state.pendingTradeId === null && state.error === null) {
          state = await this.enter(owner, claimed, rule, state, trades);
        }
        state = await this.execute(owner, claimed, rule, state);
      }
    } catch (error) {
      state = {
        ...state,
        error: reasonOf(error instanceof Error ? error : null),
      };
    }
    await this.save(owner, claimed, state);
  }

  private async run(): Promise<void> {
    try {
      const owners = await this.options.watches.pendingOwners();
      const groups = await Promise.all(
        owners.map(
          async (owner) =>
            await this.options.watches.transact(owner, (book) =>
              [...book.values()]
                .filter(
                  (watch) =>
                    watch.status === "active" && watch.reaction !== undefined
                )
                .map((watch) => ({
                  owner,
                  id: watch.id,
                  key: `${owner}/${watch.id}`,
                }))
            )
        )
      );
      const candidates = groups
        .flat()
        .toSorted((a, b) => a.key.localeCompare(b.key));
      const batch = [
        ...candidates.filter((item) => item.key > this.cursor),
        ...candidates.filter((item) => item.key <= this.cursor),
      ].slice(0, 8);
      this.cursor = batch.at(-1)?.key ?? "";
      await Promise.allSettled(
        batch.map(async (item) => {
          if (!this.closed) {
            await this.dispatch(item.owner, item.id);
          }
        })
      );
    } finally {
      this.active = null;
    }
  }
  async tick(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.active ??= this.run();
    await this.active;
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.active;
  }
}
