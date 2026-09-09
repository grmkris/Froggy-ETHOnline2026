import {
  LaunchEventId,
  LaunchWatch,
  LaunchWatchId,
  LaunchWatchInput,
  sameTradingAddress,
} from "@froggy/domain";
import type { AgentConnectionId, TaskId, UserId } from "@froggy/domain";
import { MarketSearchResult } from "@froggy/protocol";
import type { LaunchStore } from "@froggy/wallet";
import { Schema } from "effect";

import { BIRDEYE_NETWORKS } from "./birdeye";
import type { liveBirdeye } from "./birdeye";
import type { ChainLaunchReader, ChainLaunchSample } from "./launch-chain";

const POLL_MS = 30_000;
const LEASE_MS = 30_000;
const SAMPLE_GAP =
  "The provider supplies a recent-listing snapshot without a replay cursor. Older or missing listings cannot be ruled out.";

const matches = (
  watch: LaunchWatch,
  token: MarketSearchResult["tokens"][number]
): boolean => {
  const { source, minimumLiquidityUsd } = watch.input;
  if (
    source !== null &&
    token.listingSource?.toLowerCase() !== source.toLowerCase()
  ) {
    return false;
  }
  return (
    minimumLiquidityUsd === null ||
    (token.liquidityUsd !== null && token.liquidityUsd >= minimumLiquidityUsd)
  );
};

const observations = (watch: LaunchWatch, result: MarketSearchResult) => {
  const seen = [...watch.seen];
  const events = [...watch.events];
  for (const token of result.tokens) {
    if (
      seen.some((key) =>
        sameTradingAddress(watch.input.network, key, token.address)
      )
    ) {
      continue;
    }
    seen.push(token.address);
    if (events.length >= 100 || !matches(watch, token)) {
      continue;
    }
    events.push({
      v: 1,
      id: LaunchEventId.generate(),
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      source: token.listingSource,
      listedAt: token.listedAt,
      observedAt: result.observedAt,
      liquidityUsd: token.liquidityUsd,
      membership: "unverified",
      stubbed: watch.stubbed,
    });
  }
  return { seen, events };
};

/** Fixed paid observation capacity. Polling cannot create trading authority or replenish its own budget. */
export class LaunchCoordinator {
  private active: Promise<void> | null = null;
  private closed = false;
  private cursor = "";

  private readonly options: {
    readonly store: LaunchStore;
    readonly market: ReturnType<typeof liveBirdeye>;
    readonly providerStubbed: boolean;
    readonly chainReaders?: ReadonlyMap<string, ChainLaunchReader>;
    readonly now: () => number;
    readonly revokeRules?: (owner: UserId, id: LaunchWatchId) => Promise<void>;
  };

  constructor(options: LaunchCoordinator["options"]) {
    this.options = options;
  }

  networks(requireLive: boolean): readonly string[] {
    const listed =
      requireLive && this.options.providerStubbed ? [] : BIRDEYE_NETWORKS;
    const native = [...(this.options.chainReaders?.values() ?? [])]
      .filter((reader) => !requireLive || !reader.stubbed)
      .map((reader) => reader.network);
    return [...new Set([...listed, ...native])];
  }

  async create(input: {
    readonly owner: UserId;
    readonly connectionId: AgentConnectionId | null;
    readonly sourceTaskId: TaskId;
    readonly input: LaunchWatchInput;
    readonly paymentStubbed: boolean;
  }): Promise<LaunchWatch> {
    const checked = Schema.decodeUnknownSync(LaunchWatchInput)(input.input);
    return await this.options.store.transact(input.owner, (book) => {
      const prior = [...book.values()].find(
        (watch) => watch.sourceTaskId === input.sourceTaskId
      );
      if (prior !== undefined) {
        if (
          !Bun.deepEquals(prior.input, checked, true) ||
          prior.connectionId !== input.connectionId
        ) {
          throw new Error(
            "watch.idempotency: paid capacity is already bound to another request."
          );
        }
        return prior;
      }
      if (
        book.size >= 500 ||
        [...book.values()].filter((watch) => watch.status === "active")
          .length >= 5
      ) {
        throw new Error(
          "watch.capacity: at most five active watches and 500 saved watches per workspace."
        );
      }
      const now = this.options.now();
      const reader = this.options.chainReaders?.get(checked.network);
      const providerStubbed = reader?.stubbed ?? this.options.providerStubbed;
      const watch = Schema.decodeUnknownSync(LaunchWatch)({
        v: 1,
        id: LaunchWatchId.generate(),
        sourceTaskId: input.sourceTaskId,
        connectionId: input.connectionId,
        input: checked,
        createdAt: now,
        expiresAt: now + checked.durationMinutes * 60_000,
        status: "active",
        revision: 0,
        nextPollAt: now,
        lastPollAt: null,
        claimExpiresAt: null,
        pollsUsed: 0,
        maxPolls: checked.durationMinutes * 2,
        seen: [],
        events: [],
        gapCount: 1,
        lastGap:
          reader === undefined
            ? SAMPLE_GAP
            : "Native logs start with a bounded backfill; gaps and reorganizations are retained.",
        error: null,
        providerStubbed,
        stubbed: providerStubbed || input.paymentStubbed,
      });
      book.set(watch.id, watch);
      return watch;
    });
  }

  async preflight(owner: UserId): Promise<void> {
    await this.options.store.transact(owner, (book) => {
      if (
        book.size >= 500 ||
        [...book.values()].filter((watch) => watch.status === "active")
          .length >= 5
      ) {
        throw new Error(
          "watch.capacity: at most five active watches and 500 saved watches per workspace. Nothing was charged."
        );
      }
    });
  }

  async list(
    owner: UserId,
    connectionId: AgentConnectionId | null
  ): Promise<readonly LaunchWatch[]> {
    return await this.options.store.transact(owner, (book) =>
      [...book.values()]
        .filter(
          (watch) =>
            connectionId === null || watch.connectionId === connectionId
        )
        .toSorted((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
    );
  }

  async get(
    owner: UserId,
    id: LaunchWatchId,
    connectionId: AgentConnectionId | null
  ): Promise<LaunchWatch> {
    return await this.options.store.transact(owner, (book) => {
      const watch = book.get(id);
      if (
        watch === undefined ||
        (connectionId !== null && watch.connectionId !== connectionId)
      ) {
        throw new Error("watch.missing: watch not found.");
      }
      return watch;
    });
  }

  async cancel(
    owner: UserId,
    id: LaunchWatchId,
    connectionId: AgentConnectionId | null
  ): Promise<LaunchWatch> {
    await this.get(owner, id, connectionId);
    await this.options.revokeRules?.(owner, id);
    return await this.options.store.transact(owner, (book) => {
      const watch = book.get(id);
      if (watch === undefined) {
        throw new Error("watch.missing: watch not found.");
      }
      if (watch.status !== "active") {
        return watch;
      }
      const cancelled: LaunchWatch = {
        ...watch,
        status: "cancelled",
        revision: watch.revision + 1,
        claimExpiresAt: null,
      };
      book.set(id, cancelled);
      return cancelled;
    });
  }

  async cancelAll(owner: UserId): Promise<void> {
    const ids = await this.options.store.transact(owner, (book) => [
      ...book.keys(),
    ]);
    await Promise.all(
      ids.map(async (id) => await this.options.revokeRules?.(owner, id))
    );
    await this.options.store.transact(owner, (book) => {
      for (const watch of book.values()) {
        if (watch.status === "active") {
          book.set(watch.id, {
            ...watch,
            status: "cancelled",
            revision: watch.revision + 1,
            claimExpiresAt: null,
          });
        }
      }
    });
  }

  private async claim(
    owner: UserId,
    id: LaunchWatchId
  ): Promise<LaunchWatch | null> {
    return await this.options.store.transact(owner, (book) => {
      const watch = book.get(id);
      const now = this.options.now();
      if (
        watch === undefined ||
        watch.status !== "active" ||
        watch.nextPollAt > now ||
        (watch.claimExpiresAt !== null && watch.claimExpiresAt > now)
      ) {
        return null;
      }
      if (
        watch.expiresAt <= now ||
        watch.pollsUsed >= watch.maxPolls ||
        watch.events.length >= 100
      ) {
        book.set(id, {
          ...watch,
          status: "completed",
          revision: watch.revision + 1,
          claimExpiresAt: null,
        });
        return null;
      }
      const missed =
        watch.claimExpiresAt !== null || now - watch.nextPollAt > POLL_MS;
      const claimed: LaunchWatch = {
        ...watch,
        revision: watch.revision + 1,
        nextPollAt: now + POLL_MS,
        claimExpiresAt: now + LEASE_MS,
        pollsUsed: watch.pollsUsed + 1,
        gapCount: watch.gapCount + Number(missed),
        lastGap: missed
          ? "A scheduled poll was missed or its result was lost. The provider cannot replay that interval."
          : watch.lastGap,
      };
      book.set(id, claimed);
      return claimed;
    });
  }

  private async poll(owner: UserId, id: LaunchWatchId): Promise<void> {
    const claimed = await this.claim(owner, id);
    if (claimed === null) {
      return;
    }
    const reader = this.options.chainReaders?.get(claimed.input.network);
    if (reader !== undefined) {
      await this.pollChain(owner, claimed, reader);
      return;
    }
    let result: MarketSearchResult | null = null;
    try {
      if (claimed.providerStubbed !== this.options.providerStubbed) {
        throw new Error("Provider mode changed");
      }
      result = Schema.decodeUnknownSync(MarketSearchResult)(
        await this.options.market.search({
          network: claimed.input.network,
          query: null,
          limit: 20,
        })
      );
      const now = this.options.now();
      if (
        result.network !== claimed.input.network ||
        result.mode !== "new_listings" ||
        result.stubbed !== claimed.providerStubbed ||
        result.observedAt > now ||
        now - result.observedAt > POLL_MS
      ) {
        throw new Error("Stale or mismatched snapshot");
      }
    } catch {
      result = null;
    }
    const snapshot = result;
    await this.options.store.transact(owner, (book) => {
      const current = book.get(id);
      if (
        current === undefined ||
        current.status !== "active" ||
        current.pollsUsed !== claimed.pollsUsed ||
        current.claimExpiresAt !== claimed.claimExpiresAt
      ) {
        return;
      }
      const values =
        snapshot === null
          ? { seen: current.seen, events: current.events }
          : observations(current, snapshot);
      const gap =
        snapshot === null ||
        snapshot.truncated ||
        snapshot.tokens.length === 20;
      const now = this.options.now();
      const completed =
        current.pollsUsed >= current.maxPolls ||
        now >= current.expiresAt ||
        values.events.length >= 100;
      book.set(
        id,
        Schema.decodeUnknownSync(LaunchWatch)({
          ...current,
          ...values,
          revision: current.revision + 1,
          status: completed ? "completed" : "active",
          claimExpiresAt: null,
          lastPollAt: now,
          gapCount: current.gapCount + Number(gap),
          lastGap: gap ? SAMPLE_GAP : current.lastGap,
          error:
            snapshot === null
              ? "watch.provider: observation failed or configuration changed. This poll consumed capacity; no automatic repurchase occurs."
              : null,
        })
      );
    });
  }

  private async pollChain(
    owner: UserId,
    claimed: LaunchWatch,
    reader: ChainLaunchReader
  ): Promise<void> {
    let sample: ChainLaunchSample | null = null;
    try {
      if (reader.stubbed !== claimed.providerStubbed) {
        throw new Error("Watch provider mode changed");
      }
      sample = await reader.poll(claimed);
    } catch {
      sample = null;
    }
    const result = sample;
    await this.options.store.transact(owner, (book) => {
      const current = book.get(claimed.id);
      if (
        current?.status !== "active" ||
        current.pollsUsed !== claimed.pollsUsed ||
        current.claimExpiresAt !== claimed.claimExpiresAt
      ) {
        return;
      }
      const now = this.options.now();
      const events = [...current.events, ...(result?.events ?? [])].slice(
        0,
        100
      );
      const seen = [
        ...new Set([
          ...current.seen,
          ...(result?.events.map((event) => event.address) ?? []),
        ]),
      ];
      const next: LaunchWatch = {
        ...current,
        events,
        seen,
        revision: current.revision + 1,
        claimExpiresAt: null,
        lastPollAt: now,
        status:
          current.pollsUsed >= current.maxPolls ||
          now >= current.expiresAt ||
          events.length >= 100
            ? "completed"
            : "active",
        gapCount:
          current.gapCount + Number(result === null || result.gap !== null),
        lastGap: result?.gap ?? current.lastGap,
        error:
          result === null
            ? "watch.provider: native launch observation failed. Capacity was consumed without automatic renewal."
            : null,
      };
      if (result === null) {
        book.set(current.id, next);
      } else {
        book.set(current.id, {
          ...next,
          chainCursor: result.cursor,
          orphanedEvents: result.orphanedEvents,
        });
      }
    });
  }

  private async sweep(): Promise<void> {
    const owners = await this.options.store.pendingOwners();
    const groups = await Promise.all(
      owners.map(
        async (owner) =>
          await this.options.store.transact(owner, (book) =>
            [...book.values()]
              .filter((watch) => watch.status === "active")
              .map((watch) => ({
                owner,
                id: watch.id,
                key: `${owner}/${watch.id}`,
              }))
          )
      )
    );
    const pending = groups
      .flat()
      .toSorted((a, b) => (a.key < b.key ? -1 : Number(a.key > b.key)));
    const batch = [
      ...pending.filter((watch) => watch.key > this.cursor),
      ...pending.filter((watch) => watch.key <= this.cursor),
    ].slice(0, 8);
    this.cursor = batch.at(-1)?.key ?? "";
    await Promise.allSettled(
      batch.map(async (watch) => {
        if (!this.closed) {
          await this.poll(watch.owner, watch.id);
        }
      })
    );
  }

  private async run(): Promise<void> {
    try {
      await this.sweep();
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
