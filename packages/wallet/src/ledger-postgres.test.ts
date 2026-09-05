/**
 * The durable ledger, against a real Postgres.
 *
 * Skipped unless `FROGGY_TEST_DATABASE_URL` points at a database the test may
 * write to, because `bun run check` must stay runnable on a laptop with no
 * services. Start one and run it:
 *
 *   docker run -d --name froggy-pg -e POSTGRES_PASSWORD=postgres \
 *     -e POSTGRES_DB=froggy -p 5434:5432 postgres:17
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/froggy bun run db:migrate
 *   FROGGY_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/froggy \
 *     bun test packages/wallet/src/ledger-postgres.test.ts
 *
 * The last test is the one the in-memory ledger cannot pass: two ledgers on
 * two separate pools, racing the same idempotency key, ending on one row.
 * That is the unique index doing the work, not a promise chain — the property
 * that would let this service run at more than one replica.
 */

import { afterAll, describe, expect, it } from "bun:test";

import { SpendId, usdMicros, userId } from "@froggy/domain";
import postgres from "postgres";
import type { Sql } from "postgres";

import { postgresLedger } from "./ledger-postgres";

const url = process.env["FROGGY_TEST_DATABASE_URL"];
const NOW = Date.now();

// A fresh DID per run, so repeated runs never see each other's rows and the
// test needs no truncation step (which would be a footgun pointed at a
// database someone might have pointed at something real).
const suffix = Math.random().toString(36).slice(2, 10);
const alice = userId(`did:privy:alice-${suffix}`);
const bob = userId(`did:privy:bob-${suffix}`);

const row = (key: string, micros: number, who = alice) => ({
  at: NOW,
  id: SpendId.generate(),
  idempotencyKey: key,
  usdMicros: usdMicros(micros),
  userId: who,
});

/**
 * The suite, taking its connection as an argument.
 *
 * A function rather than a `describe.skipIf` so the types narrow at the call
 * site and nothing inside has to assert a connection exists. The `else` branch
 * below still registers a skipped test, so a run with no database says so
 * rather than quietly reporting full coverage of an untested file.
 */
const suite = (sql: Sql, connectionUrl: string): void => {
  describe("postgresLedger", () => {
    const ledger = postgresLedger(sql);

    afterAll(async () => {
      await sql.end({ timeout: 5 });
    });

    it("reserves before anything is paid", async () => {
      const reserved = await ledger.reserve(row("reserve", 10_000));
      expect(reserved.created).toBe(true);
      expect(reserved.row.status).toBe("reserved");
      expect(reserved.row.usdMicros).toBe(usdMicros(10_000));
    });

    it("hands back the same row for a repeated key", async () => {
      const first = await ledger.reserve(row("repeat", 10_000));
      const second = await ledger.reserve(row("repeat", 10_000));
      expect(second.row.id).toBe(first.row.id);
      // Only the first caller may pay. Before this field existed, both saw a
      // row in state `reserved` and both went on to settle.
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
    });

    it("settles a row it reserved", async () => {
      const reserved = await ledger.reserve(row("settle", 10_000));
      await ledger.settle(reserved.row.id, "settled");
      const rows = await ledger.since(alice, NOW - 1000);
      expect(rows.find((r) => r.id === reserved.row.id)?.status).toBe(
        "settled"
      );
    });

    it("keeps one user's spend out of another's total", async () => {
      await ledger.reserve(row("bob-only", 99_000, bob));
      const rows = await ledger.since(alice, NOW - 1000);
      expect(rows.every((r) => r.userId === alice)).toBe(true);
    });

    it("excludes a refusal from the window", async () => {
      const refused = await ledger.reserve(row("refused", 5000));
      await ledger.settle(refused.row.id, "refused");
      const rows = await ledger.since(alice, NOW - 1000);
      // A refusal never consumed anything. Counting it would let a rejected
      // spend eat the allowance it was denied.
      expect(rows.some((r) => r.id === refused.row.id)).toBe(false);
    });

    it("excludes a spend older than the window", async () => {
      const old = await ledger.reserve({
        ...row("stale", 1000),
        at: NOW - 100_000,
      });
      const rows = await ledger.since(alice, NOW - 1000);
      expect(rows.some((r) => r.id === old.row.id)).toBe(false);
    });

    it("survives two pools racing one key", async () => {
      const other = postgres(connectionUrl, { max: 2 });
      try {
        const second = postgresLedger(other);
        const [a, b] = await Promise.all([
          ledger.reserve(row("cross-process", 7000)),
          second.reserve(row("cross-process", 7000)),
        ]);
        // Neither ledger's promise chain can see the other's. Only the unique
        // index on `(user_id, idempotency_key)` makes this one row — and only
        // one of the two is told it may move money.
        expect(a.row.id).toBe(b.row.id);
        expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
      } finally {
        await other.end({ timeout: 5 });
      }
    });
  });
};

if (url === undefined) {
  describe.skip("postgresLedger (set FROGGY_TEST_DATABASE_URL)", () => {
    it("needs a database", () => {
      expect(url).toBeUndefined();
    });
  });
} else {
  suite(postgres(url, { max: 5 }), url);
}
