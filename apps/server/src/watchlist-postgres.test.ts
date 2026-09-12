import { expect, test } from "bun:test";

import { userId, WatchlistInput } from "@froggy/domain";
import { postgresStore } from "@froggy/wallet";
import { Schema } from "effect";
import postgres from "postgres";

import { handleWatchlist, saveWatchlistItem } from "./watchlist-routes";

const databaseUrl = process.env["FROGGY_TEST_DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl === "") {
  test.skip("PostgreSQL watchlist requires FROGGY_TEST_DATABASE_URL", () => {
    expect(databaseUrl).toBeDefined();
  });
} else {
  test("Postgres retains saved items, isolates owners, and serializes edits across two connections", async () => {
    const left = postgres(databaseUrl, { max: 2 });
    const right = postgres(databaseUrl, { max: 2 });
    const alice = userId(`did:privy:watchlist-${crypto.randomUUID()}`);
    const bob = userId(`did:privy:watchlist-${crypto.randomUUID()}`);
    const first = postgresStore(left);
    const second = postgresStore(right);
    try {
      const input = Schema.decodeUnknownSync(WatchlistInput)({
        title: "A saved trip",
        notes: "Two adults",
        source: { _tag: "flight", url: "https://example.com/flight" },
      });
      const item = await saveWatchlistItem(first, alice, input);
      const restored = await second.watchlist.transact(alice, (book) =>
        book.get(item.id)
      );
      expect(restored).toEqual(item);
      expect(
        await second.watchlist.transact(bob, (book) => book.get(item.id))
      ).toBeUndefined();
      const path = `/api/watchlist/${item.id}`;
      const patch = () =>
        new Request(`https://froggy.test${path}`, {
          method: "PATCH",
          body: JSON.stringify({ v: 1, revision: 1, title: "A better trip" }),
        });
      const outcomes = await Promise.all([
        handleWatchlist(first, patch(), alice, path),
        handleWatchlist(second, patch(), alice, path),
      ]);
      expect(
        outcomes
          .map((response) => response?.status)
          .toSorted((a, b) => (a ?? 0) - (b ?? 0))
      ).toEqual([200, 409]);
      await first.watchlist.forget(alice);
      expect(await second.watchlist.transact(alice, (book) => book.size)).toBe(
        0
      );
    } finally {
      await first.watchlist.forget(alice);
      await second.watchlist.forget(bob);
      await left.end();
      await right.end();
    }
  });
}
