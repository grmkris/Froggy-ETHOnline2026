import { expect, test } from "bun:test";

import { UpdateId, userId } from "@froggy/domain";
import type { Update } from "@froggy/domain";

import { memoryStore } from "./store";

const alice = userId("did:privy:updates-alice");
const bob = userId("did:privy:updates-bob");
const record = (key: string): Update => ({
  v: 1,
  id: UpdateId.generate(),
  kind: "notice",
  itemId: null,
  key,
  title: key,
  body: "A recorded result",
  at: 10,
  readAt: null,
  stubbed: true,
});
test("updates preserve identity, chronology and read state on replay; isolate owners", async () => {
  const store = memoryStore();
  const first = await store.updates.save(alice, record("same"));
  expect(await store.updates.markRead(bob, first.id, 20)).toBe(false);
  expect(await store.updates.markRead(alice, first.id, 20)).toBe(true);
  const next = await store.updates.save(alice, {
    ...record("same"),
    body: "Confirmed",
    at: 30,
  });
  expect(next).toEqual({ ...first, body: "Confirmed", readAt: 20 });
  expect(await store.updates.unread(alice)).toBe(0);
  expect(await store.updates.byKey(bob, "same")).toBeNull();
  await store.updates.save(bob, record("same"));
  expect(await store.updates.unread(bob)).toBe(1);
});
test("updates paginate by stable ids and mark all read without losing rows", async () => {
  const store = memoryStore();
  await Promise.all(
    Array.from(
      { length: 32 },
      async (_, i) => await store.updates.save(alice, record(String(i)))
    )
  );
  const page = await store.updates.list(alice);
  expect(page.updates).toHaveLength(30);
  expect(page.unread).toBe(32);
  expect(page.next).not.toBeNull();
  const next = await store.updates.list(alice, page.next ?? undefined);
  expect(next.updates).toHaveLength(2);
  expect(next.next).toBeNull();
  await store.updates.markAllRead(alice, 30);
  expect(await store.updates.unread(alice)).toBe(0);
  await store.forget(alice);
  const forgotten = await store.updates.list(alice);
  expect(forgotten.updates).toHaveLength(0);
});
test("wallet cursor and updates roll back together", async () => {
  const store = memoryStore();
  const update = record("atomic");
  expect(
    store.walletActivity.transact(async (tx) => {
      await tx.saveUpdate(alice, update);
      await tx.saveCheckpoint({ ...tx.checkpoint, block: 100 });
      throw new Error("rollback");
    })
  ).rejects.toThrow("rollback");
  expect(await store.updates.byKey(alice, update.key)).toBeNull();
  await store.walletActivity.transact(async (tx) => {
    expect(tx.checkpoint.block).toBe(0);
    await tx.saveUpdate(alice, update);
  });
  expect(await store.updates.byId(alice, update.id)).toEqual(update);
});
