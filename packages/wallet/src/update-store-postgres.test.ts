import { expect, test } from "bun:test";

import { UpdateId, userId, WatchlistItemId } from "@froggy/domain";
import type { Update } from "@froggy/domain";
import postgres from "postgres";

import { postgresStore } from "./store-postgres";

const databaseUrl = process.env["FROGGY_TEST_DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl === "") {
  test.skip("Postgres Updates requires FROGGY_TEST_DATABASE_URL", () => {
    expect(databaseUrl).toBeDefined();
  });
} else {
  test("Postgres Updates replay across connections preserves read state and transactional rollback", async () => {
    const left = postgres(databaseUrl, { max: 2 });
    const right = postgres(databaseUrl, { max: 2 });
    const owner = userId(`did:privy:updates-${crypto.randomUUID()}`);
    const other = userId(`did:privy:updates-${crypto.randomUUID()}`);
    const first = postgresStore(left);
    const second = postgresStore(right);
    const record: Update = {
      v: 1,
      id: UpdateId.generate(),
      kind: "notice",
      key: "same",
      itemId: null,
      title: "Recorded",
      body: "Provisional",
      at: 10,
      readAt: null,
      stubbed: true,
    };
    try {
      await first.updates.save(owner, record);
      await second.updates.markRead(owner, record.id, 20);
      await Promise.all([
        first.updates.save(owner, {
          ...record,
          id: UpdateId.generate(),
          at: 30,
          body: "Confirmed",
        }),
        second.updates.save(owner, {
          ...record,
          id: UpdateId.generate(),
          at: 40,
          body: "Confirmed",
        }),
      ]);
      expect(await second.updates.byKey(owner, "same")).toEqual({
        ...record,
        body: "Confirmed",
        readAt: 20,
      });
      expect(await second.updates.unread(owner)).toBe(0);
      expect(await first.updates.byId(other, record.id)).toBeNull();
      const rollback = { ...record, id: UpdateId.generate(), key: "rollback" };
      expect(
        first.walletActivity.transact(async (tx) => {
          await tx.saveUpdate(owner, rollback);
          throw new Error("rollback");
        })
      ).rejects.toThrow("rollback");
      expect(await second.updates.byKey(owner, "rollback")).toBeNull();
      const foreignItem = WatchlistItemId.generate();
      expect(
        first.updates.save(other, {
          ...record,
          id: UpdateId.generate(),
          key: "foreign",
          itemId: foreignItem,
        })
      ).rejects.toThrow("Saved item not found");
      await first.updates.save(owner, {
        ...record,
        id: UpdateId.generate(),
        key: "new",
      });
      await second.updates.markAllRead(owner, 50);
      expect(await first.updates.unread(owner)).toBe(0);
      const preserved = await first.updates.byKey(owner, "same");
      expect(preserved?.readAt).toBe(20);
    } finally {
      await first.updates.forget(owner);
      await first.updates.forget(other);
      await left.end();
      await right.end();
    }
  });
}
