import { afterAll, describe, expect, test } from "bun:test";

import { LaunchWatchId, TaskId, userId } from "@froggy/domain";
import type { LaunchWatch } from "@froggy/domain";
import postgres from "postgres";

import { memoryLaunchStore } from "./launch-store";
import type { LaunchStore } from "./launch-store";
import { postgresLaunchStore } from "./launch-store-postgres";

const fixture = (): LaunchWatch => ({
  v: 1,
  id: LaunchWatchId.generate(),
  sourceTaskId: TaskId.generate(),
  connectionId: null,
  input: {
    network: "eip155:8453",
    durationMinutes: 1,
    minimumLiquidityUsd: null,
    source: null,
  },
  createdAt: 1000,
  expiresAt: 61_000,
  status: "active",
  revision: 0,
  nextPollAt: 1000,
  lastPollAt: null,
  claimExpiresAt: null,
  pollsUsed: 0,
  maxPolls: 2,
  seen: [],
  events: [],
  gapCount: 1,
  lastGap: "No replay cursor",
  error: null,
  providerStubbed: true,
  stubbed: true,
});

const refusal = async <T>(pending: Promise<T>): Promise<string | null> =>
  await pending.then(() => null, String);

const suite = (
  name: string,
  create: () => readonly [LaunchStore, LaunchStore]
): void => {
  describe(name, () => {
    test("concurrent poll claims share one durable budget and a refused rewrite rolls back", async () => {
      const [first, second] = create();
      const owner = userId(`did:privy:watch-${crypto.randomUUID()}`);
      const watch = fixture();
      await first.transact(owner, (book) => {
        book.set(watch.id, watch);
      });
      const claim = async (store: LaunchStore) =>
        await store.transact(owner, (book) => {
          const prior = book.get(watch.id);
          if (prior === undefined || prior.claimExpiresAt !== null) {
            return false;
          }
          book.set(watch.id, {
            ...prior,
            pollsUsed: prior.pollsUsed + 1,
            revision: prior.revision + 1,
            claimExpiresAt: 31_000,
            nextPollAt: 31_000,
          });
          return true;
        });
      const outcomes = await Promise.all([claim(first), claim(second)]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(
        await refusal(
          second.transact(owner, (book) => {
            const prior = book.get(watch.id);
            if (prior === undefined) {
              throw new Error("missing watch");
            }
            book.set(watch.id, {
              ...prior,
              revision: prior.revision + 1,
              maxPolls: 120,
            });
          })
        )
      ).toContain("watch.capacity");
      const saved = await second.transact(owner, (book) => book.get(watch.id));
      expect(saved).toMatchObject({ pollsUsed: 1, maxPolls: 2 });
      expect(
        await second.transact(
          userId(`did:privy:stranger-${crypto.randomUUID()}`),
          (book) => book.size
        )
      ).toBe(0);
      expect(await second.pendingOwners()).toContain(owner);
    });
    test("paid task identity and terminal history cannot be replaced", async () => {
      const [first, second] = create();
      const owner = userId(`did:privy:watch-history-${crypto.randomUUID()}`);
      const watch = fixture();
      await first.transact(owner, (book) => {
        book.set(watch.id, watch);
      });
      expect(
        await refusal(
          first.transact(owner, (book) => {
            const clone = { ...watch, id: LaunchWatchId.generate() };
            book.set(clone.id, clone);
          })
        )
      ).toContain("watch.capacity");
      await first.transact(owner, (book) => {
        book.set(watch.id, { ...watch, status: "cancelled", revision: 1 });
      });
      expect(
        await refusal(
          second.transact(owner, (book) => {
            book.set(watch.id, { ...watch, revision: 2 });
          })
        )
      ).toContain("watch.immutable");
      expect(
        await refusal(
          second.transact(owner, (book) => {
            book.delete(watch.id);
          })
        )
      ).toContain("watch.retention");
      const saved = await second.transact(owner, (book) => book.get(watch.id));
      expect(saved?.status).toBe("cancelled");
      expect(await second.pendingOwners()).not.toContain(owner);
    });
  });
};
suite("memory launch store", () => {
  const store = memoryLaunchStore();
  return [store, store];
});
const url = process.env["FROGGY_TEST_DATABASE_URL"];
if (url === undefined) {
  test.skip("Postgres launch persistence requires FROGGY_TEST_DATABASE_URL", () => {});
} else {
  const first = postgres(url, { max: 5 });
  const second = postgres(url, { max: 5 });
  afterAll(async () => {
    await Promise.all([first.end({ timeout: 5 }), second.end({ timeout: 5 })]);
  });
  suite("Postgres launch store", () => [
    postgresLaunchStore(first),
    postgresLaunchStore(second),
  ]);
}
