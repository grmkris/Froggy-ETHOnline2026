import { expect, test } from "bun:test";

import { AgentTokenId, TaskId, userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import { stubBirdeye } from "./birdeye";
import { LaunchCoordinator } from "./launches";
import { SOLANA_MAINNET } from "./networks";

const setup = () => {
  const store = memoryStore().launches;
  const owner = userId("did:privy:launch-fixture");
  let now = 1000;
  let calls = 0;
  let failed = false;
  const stub = stubBirdeye();
  const market = {
    ...stub,
    search: async (input: Parameters<typeof stub.search>[0]) => {
      calls += 1;
      if (failed) {
        throw new Error("Private provider diagnostic");
      }
      const result = await stub.search(input);
      const inspected = await stub.inspect({
        network: input.network,
        address: "So11111111111111111111111111111111111111112",
      });
      return {
        ...result,
        observedAt: now,
        tokens: [
          {
            ...inspected.token,
            name: "DEMO launch",
            listingSource: "pump",
            liquidityUsd: 100,
          },
        ],
      };
    },
  };
  const create = () =>
    new LaunchCoordinator({
      store,
      market,
      providerStubbed: true,
      now: () => now,
    });
  const coordinator = create();
  const request = {
    owner,
    connectionId: AgentTokenId.generate(),
    sourceTaskId: TaskId.generate(),
    input: {
      network: SOLANA_MAINNET,
      durationMinutes: 1,
      minimumLiquidityUsd: null,
      source: null,
    },
    paymentStubbed: true,
  };
  return {
    store,
    market,
    owner,
    create,
    coordinator,
    request,
    calls: () => calls,
    setTime: (value: number): void => {
      now = value;
    },
    fail: (): void => {
      failed = true;
    },
  };
};

test("duplicate workers consume one poll and restart retains deduplication and the fixed capacity", async () => {
  const f = setup();
  const watch = await f.coordinator.create(f.request);
  const repeated = await f.coordinator.create(f.request);
  expect(repeated.id).toBe(watch.id);
  await Promise.all([f.coordinator.tick(), f.create().tick()]);
  expect(f.calls()).toBe(1);
  const first = await f.coordinator.get(
    f.owner,
    watch.id,
    f.request.connectionId
  );
  expect(first.pollsUsed).toBe(1);
  expect(first).toMatchObject({ error: null, claimExpiresAt: null });
  expect(first.events.length).toBeGreaterThan(0);
  expect(
    first.events.every(
      (event) => event.stubbed && event.membership === "unverified"
    )
  ).toBe(true);
  f.setTime(31_000);
  await f.create().tick();
  const last = await f.coordinator.get(f.owner, watch.id, null);
  expect(last.status).toBe("completed");
  expect(last.pollsUsed).toBe(2);
  expect(last.events).toEqual(first.events);
  expect(last.seen).toEqual(first.seen);
  await f.create().tick();
  expect(f.calls()).toBe(2);
});

test("cancelled watches never resume and reads are scoped to both owner and connection", async () => {
  const f = setup();
  const watch = await f.coordinator.create(f.request);
  expect(
    await f.coordinator
      .get(userId("did:privy:stranger"), watch.id, null)
      .then(() => null, String)
  ).toContain("watch.missing");
  expect(
    await f.coordinator
      .cancel(f.owner, watch.id, AgentTokenId.generate())
      .then(() => null, String)
  ).toContain("watch.missing");
  await f.coordinator.cancel(f.owner, watch.id, f.request.connectionId);
  await f.create().tick();
  expect(f.calls()).toBe(0);
  expect(
    await f.store
      .transact(f.owner, (book) => {
        const old = book.get(watch.id);
        if (old === undefined) {
          throw new Error("Missing watch");
        }
        book.set(watch.id, {
          ...old,
          revision: old.revision + 1,
          status: "active",
        });
      })
      .then(() => null, String)
  ).toContain("watch.immutable");
});

test("provider failure consumes capacity, records a gap and never leaks diagnostics or repurchases", async () => {
  const f = setup();
  const watch = await f.coordinator.create(f.request);
  f.fail();
  await f.coordinator.tick();
  const result = await f.coordinator.get(f.owner, watch.id, null);
  expect(result.error).toContain("watch.provider");
  expect(JSON.stringify(result)).not.toContain("Private provider diagnostic");
  expect(result.gapCount).toBe(2);
  f.setTime(61_000);
  await f.create().tick();
  const completed = await f.coordinator.get(f.owner, watch.id, null);
  expect(completed.status).toBe("completed");
  expect(f.calls()).toBe(1);
});

test("an expired in-flight claim consumes its slot and restart marks the missing observation", async () => {
  const f = setup();
  const watch = await f.coordinator.create(f.request);
  await f.store.transact(f.owner, (book) => {
    book.set(watch.id, {
      ...watch,
      revision: 1,
      claimExpiresAt: 31_000,
      nextPollAt: 31_000,
      pollsUsed: 1,
    });
  });
  await f.create().tick();
  expect(f.calls()).toBe(0);
  f.setTime(31_000);
  await f.create().tick();
  const last = await f.coordinator.get(f.owner, watch.id, null);
  expect(last.status).toBe("completed");
  expect(last.gapCount).toBeGreaterThan(1);
  expect(last.pollsUsed).toBe(2);
  expect(f.calls()).toBe(1);
});

test("account cancellation stops every active watch without erasing paid history", async () => {
  const f = setup();
  const watch = await f.coordinator.create(f.request);
  await f.coordinator.cancelAll(f.owner);
  await f.create().tick();
  expect(f.calls()).toBe(0);
  const saved = await f.coordinator.list(f.owner, null);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    id: watch.id,
    status: "cancelled",
    sourceTaskId: f.request.sourceTaskId,
  });
});

test("cancelling an in-flight poll retains its consumed slot and fences the late response", async () => {
  const f = setup();
  const original = f.market.search;
  const entered = Promise.withResolvers<null>();
  const release = Promise.withResolvers<null>();
  f.market.search = async (input) => {
    entered.resolve(null);
    await release.promise;
    return await original(input);
  };
  const watch = await f.coordinator.create(f.request);
  const tick = f.coordinator.tick();
  await entered.promise;
  await f.coordinator.cancel(f.owner, watch.id, f.request.connectionId);
  release.resolve(null);
  await tick;
  const cancelled = await f.coordinator.get(f.owner, watch.id, null);
  expect(cancelled).toMatchObject({
    status: "cancelled",
    pollsUsed: 1,
    events: [],
    claimExpiresAt: null,
  });
});

test("source and liquidity filters retain deduplication without inventing launch membership", async () => {
  const f = setup();
  const watch = await f.coordinator.create({
    ...f.request,
    input: {
      ...f.request.input,
      source: "elsewhere",
      minimumLiquidityUsd: 101,
    },
  });
  await f.coordinator.tick();
  const sampled = await f.coordinator.get(f.owner, watch.id, null);
  expect(sampled.seen).toHaveLength(1);
  expect(sampled.events).toHaveLength(0);
  expect(sampled.gapCount).toBeGreaterThan(0);
});
