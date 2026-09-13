import { expect, test } from "bun:test";

import {
  userId,
  WalletMonitorCoverage,
  WalletMonitorId,
  WatchlistInput,
  WatchlistItemId,
} from "@froggy/domain";
import { postgresStore } from "@froggy/wallet";
import { Schema } from "effect";
import postgres from "postgres";
import type { Sql } from "postgres";

import {
  claimMonitor,
  configureMonitor,
  monitoringState,
  setMonitoringBudget,
} from "./monitoring";
import { recordItemObservation } from "./watchlist-data";
import { handleWatchlist, saveWatchlistItem } from "./watchlist-routes";

const migrationStatements = async (): Promise<readonly string[]> => {
  const file = await Bun.file(
    new URL(
      "../../../packages/database/drizzle/0029_address_identity.sql",
      import.meta.url
    )
  ).text();
  return file
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
};

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
      const at = Date.now();
      const observation = {
        at,
        source: "Local PostgreSQL fixture",
        sourceUrl: null,
        price: 120,
        currency: "EUR",
        basis: "Two adults",
        stubbed: true,
        facts: [],
      };
      await Promise.all([
        recordItemObservation(first, alice, item.id, observation),
        recordItemObservation(second, alice, item.id, {
          ...observation,
          at: at - 1000,
          price: 130,
        }),
      ]);
      const persisted = await second.watchlistData.transact(alice, (book) =>
        book.get(item.id)
      );
      expect(persisted?.latest?.price).toBe(120);
      expect(persisted?.observations).toHaveLength(2);
      expect(
        await second.watchlistData.transact(bob, (book) => book.get(item.id))
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
      await setMonitoringBudget(first, alice, 1_000_000, "UTC");
      await configureMonitor(
        first,
        alice,
        {
          itemId: item.id,
          cadence: "daily",
          timezone: "UTC",
          context: "Two adults, same itinerary",
          condition: { _tag: "change", field: "departure time" },
        },
        null,
        0
      );
      const checks = await Promise.all([
        claimMonitor(first, alice),
        claimMonitor(second, alice),
      ]);
      expect(checks.filter(Boolean)).toHaveLength(1);
      const aliceState = await monitoringState(second, alice);
      const bobState = await monitoringState(first, bob);
      expect(aliceState.checks).toHaveLength(1);
      expect(bobState.checks).toHaveLength(0);
      await first.watchlist.forget(alice);
      expect(
        await second.watchlistData.transact(alice, (book) => book.size)
      ).toBe(0);
      expect(await second.watchlist.transact(alice, (book) => book.size)).toBe(
        0
      );
    } finally {
      await first.monitoring.forget(alice);
      await second.monitoring.forget(bob);
      await first.watchlist.forget(alice);
      await second.watchlist.forget(bob);
      await left.end();
      await right.end();
    }
  });

  const runMigration = async (sql: Sql): Promise<void> => {
    const statements = await migrationStatements();
    await sql.begin(async (tx) => {
      for (const statement of statements) {
        // The migrator runs a file's statements in order inside one transaction; so does this.
        // eslint-disable-next-line no-await-in-loop -- ordered DDL and DML
        await tx.unsafe(statement);
      }
    });
  };
  test("migration 0029 merges per-chain rows into one address item and re-points its history", async () => {
    const sql = postgres(databaseUrl, { max: 2 });
    const store = postgresStore(sql);
    const owner = userId(`did:privy:merge-${crypto.randomUUID()}`);
    const address = "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2";
    const networks = [
      "eip155:4663",
      "eip155:84532",
      "eip155:11155111",
      "eip155:8453",
    ] as const;
    const ids = networks.map(() => WatchlistItemId.generate());
    const [loser] = ids;
    const survivor = ids.at(-1);
    if (survivor === undefined || loser === undefined) {
      throw new Error("fixture ids");
    }
    const monitorId = WalletMonitorId.generate();
    const now = Date.now();
    const legacy = (index: number, network: string) => {
      const base = {
        v: 1,
        id: ids[index],
        title: address,
        notes: index === 0 || index === 3 ? "Whale wallet" : "",
        source: { _tag: "wallet", network, address },
        createdAt: now - (networks.length - index) * 1000,
        updatedAt: now - index * 10,
        revision: index === 3 ? 2 : 1,
        archived: false,
      };
      if (index !== 3) {
        return base;
      }
      return {
        ...base,
        walletMonitor: {
          v: 1,
          id: monitorId,
          revision: 1,
          enabled: true,
          startedAt: now,
          expiresAt: now + 86_400_000,
          startBlock: 51_253_761,
          telegram: false,
          swaps: true,
          transfers: true,
          rules: [],
        },
      };
    };
    const MergedDocument = Schema.Struct({
      createdAt: Schema.Int,
      revision: Schema.Int,
      notes: Schema.String,
      source: Schema.Struct({
        _tag: Schema.String,
        network: Schema.String,
        address: Schema.String,
      }),
      walletMonitor: Schema.Struct({
        networks: Schema.Array(WalletMonitorCoverage),
      }),
    });
    const RepointedDocument = Schema.Struct({ itemId: WatchlistItemId });
    try {
      await sql`insert into users (did) values (${owner}) on conflict do nothing`;
      for (const [index, network] of networks.entries()) {
        const id = ids[index];
        if (id === undefined) {
          throw new Error("fixture id");
        }
        // eslint-disable-next-line no-await-in-loop -- fixture rows in order
        await sql`insert into saved_items (id, user_id, document) values (${WatchlistItemId.toUuid(id)}, ${owner}, ${JSON.stringify(legacy(index, network))}::jsonb)`;
      }
      // A second, unrelated address must be left alone.
      const other = WatchlistItemId.generate();
      await sql`insert into saved_items (id, user_id, document) values (${WatchlistItemId.toUuid(other)}, ${owner}, ${JSON.stringify(
        {
          ...legacy(1, "eip155:8453"),
          id: other,
          source: {
            _tag: "wallet",
            network: "eip155:8453",
            address: "0x0Cf84F01C311Dc093969136B1814F05B5b3167F6",
          },
        }
      )}::jsonb)`;
      await sql`insert into wallet_activities (id, user_id, item_id, network, transaction_hash, block_number, observed_at, finality, document)
        values (${"wact_01h455vb4pex5vsknk084sn02q"}, ${owner}, ${WatchlistItemId.toUuid(loser)}, ${"eip155:4663"}, ${`0x${"ab".repeat(32)}`}, ${1}, ${now}, ${"provisional"}, ${JSON.stringify({ itemId: loser, kind: "transfer" })}::jsonb)`;
      await sql`insert into saved_item_data (user_id, item_id, document) values (${owner}, ${WatchlistItemId.toUuid(loser)}, ${JSON.stringify(
        {
          v: 1,
          itemId: loser,
          latest: {
            at: now,
            source: "Fixture",
            sourceUrl: null,
            price: null,
            currency: null,
            basis: "fixture",
            stubbed: true,
            facts: [],
          },
          observations: [],
          snapshotTaskId: null,
          enrichment: null,
        }
      )}::jsonb)`;
      expect(await store.watchlist.owners()).toContain(owner);

      await runMigration(sql);

      const rows =
        await sql`select id, document from saved_items where user_id = ${owner} order by id`;
      expect(rows).toHaveLength(2);
      const merged = rows.find(
        (row) => row["id"] === WatchlistItemId.toUuid(survivor)
      );
      const document = Schema.decodeUnknownSync(MergedDocument)(
        merged?.["document"]
      );
      expect(document.createdAt).toBe(now - networks.length * 1000);
      expect(document.revision).toBe(3);
      expect(document.notes).toBe("Whale wallet");
      expect(document.source).toEqual({
        _tag: "wallet",
        network: "eip155:8453",
        address,
      });
      expect(document.walletMonitor.networks).toEqual([
        { network: "eip155:8453", startBlock: 51_253_761 },
      ]);
      const [activity] =
        await sql`select item_id, document from wallet_activities where user_id = ${owner}`;
      expect(activity?.["item_id"]).toBe(WatchlistItemId.toUuid(survivor));
      expect(
        Schema.decodeUnknownSync(RepointedDocument)(activity?.["document"])
          .itemId
      ).toBe(survivor);
      const data = await store.watchlistData.transact(owner, (book) => [
        ...book.keys(),
      ]);
      expect(data).toEqual([survivor]);
      const decoded = await store.watchlist.transact(owner, (book) =>
        book.get(survivor)
      );
      expect(decoded?.walletMonitor?.networks?.[0]?.network).toBe(
        "eip155:8453"
      );
      expect(decoded?.source._tag).toBe("wallet");

      await runMigration(sql);
      const [after] =
        await sql`select count(*)::int as count from saved_items where user_id = ${owner}`;
      expect(after?.["count"]).toBe(2);
    } finally {
      await store.watchlist.forget(owner);
      await sql.end();
    }
  });
}
