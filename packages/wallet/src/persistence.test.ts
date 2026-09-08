import { afterAll, describe, expect, test } from "bun:test";

import {
  AgentInvocationId,
  AgentTokenId,
  OAuthGrantId,
  ConversionId,
  RunId,
  ScheduleId,
  SpendId,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { AgentInvocation, Schedule } from "@froggy/domain";
import postgres from "postgres";

import { memoryLedger, SpendBudgetExceededError } from "./ledger";
import type { SpendLedger } from "./ledger";
import { postgresLedger } from "./ledger-postgres";
import { memoryStore } from "./store";
import type { ConversionRecord, Store } from "./store";
import { postgresStore } from "./store-postgres";

interface Backend {
  readonly store: Store;
  readonly other: Store;
  readonly ledger: SpendLedger;
  readonly otherLedger: SpendLedger;
}
const suite = (name: string, make: () => Backend): void => {
  describe(name, () => {
    test("agent invocation history is owner-scoped, newest 50, and survives disconnect", async () => {
      const { store, other } = make();
      const owner = userId(`did:privy:history-${crypto.randomUUID()}`);
      const stranger = userId(`did:privy:other-history-${crypto.randomUUID()}`);
      const connectionId = AgentTokenId.generate();
      const grantId = OAuthGrantId.generate();
      const at = Date.now();
      await store.agents.create(owner, {
        id: connectionId,
        label: "History",
        createdAt: at,
        lastUsedAt: null,
        revokedAt: null,
        secretHash: crypto.randomUUID(),
      });
      const rows: AgentInvocation[] = Array.from(
        { length: 55 },
        (_, index) => ({
          id: AgentInvocationId.generate(),
          connectionId,
          kind: "mcp",
          name: "froggy_services",
          at: at + index,
          outcome: "started",
          usdMicros: null,
          taskId: null,
          stubbed: true,
        })
      );
      await Promise.all(
        rows.map(async (row) => {
          await store.invocations.append(owner, row);
        })
      );
      const last = rows.at(-1);
      if (last === undefined) {
        throw new Error("Missing fixture");
      }
      await store.invocations.append(owner, {
        ...last,
        id: AgentInvocationId.generate(),
        connectionId: grantId,
      });
      await other.invocations.finish(stranger, last.id, {
        name: last.name,
        outcome: "wrong owner",
        usdMicros: 100,
        taskId: null,
        stubbed: true,
      });
      const before = await other.invocations.list(owner, connectionId);
      expect(before).toHaveLength(50);
      expect(before[0]).toEqual(last);
      expect(before.at(-1)?.at).toBe(at + 5);
      expect(await other.invocations.list(stranger, connectionId)).toEqual([]);
      expect(await other.invocations.list(owner, grantId)).toHaveLength(1);
      await other.invocations.finish(owner, last.id, {
        name: last.name,
        outcome: "ok",
        usdMicros: null,
        taskId: null,
        stubbed: true,
      });
      await store.agents.revoke(owner, connectionId);
      const after = await other.invocations.list(owner, connectionId);
      expect(after[0]?.outcome).toBe("ok");
      await store.forget(owner);
      expect(await other.invocations.list(owner, connectionId)).toEqual([]);
      expect(await other.invocations.list(owner, grantId)).toEqual([]);
    });
    test("completion cannot undo cancellation or overwrite a newer claim", async () => {
      const { store, other } = make();
      const owner = userId(`did:privy:claim-${crypto.randomUUID()}`);
      const at = Date.now();
      const schedule: Schedule = {
        id: ScheduleId.generate(),
        label: "test",
        action: { _tag: "remind", text: "test" },
        cadence: { _tag: "daily", time: "08:00" },
        timezone: "UTC",
        createdAt: at,
        nextRunAt: at,
        lastRunAt: null,
        status: "active",
      };
      await store.schedules.create(owner, schedule);
      const firstClaims = await store.schedules.claimDue(at, 1000);
      const first = firstClaims.find((row) => row.schedule.id === schedule.id);
      expect(first?.claimedAt).toBe(at);
      const secondClaims = await other.schedules.claimDue(at + 1001, 1000);
      const second = secondClaims.find(
        (row) => row.schedule.id === schedule.id
      );
      expect(second?.claimedAt).toBe(at + 1001);
      expect(
        await store.schedules.finish(schedule.id, at, {
          nextRunAt: null,
          status: "done",
        })
      ).toBe(false);
      expect(await other.schedules.cancel(owner, schedule.id)).toBe(true);
      expect(
        await other.schedules.finish(schedule.id, at + 1001, {
          nextRunAt: at + 60_000,
          status: "active",
        })
      ).toBe(false);
      const schedules = await store.schedules.list(owner);
      expect(schedules[0]?.status).toBe("cancelled");
    });
    test("pending reservations across workers share one run budget", async () => {
      const { ledger, otherLedger } = make();
      const owner = userId(`did:privy:budget-${crypto.randomUUID()}`);
      const runId = RunId.generate();
      const row = (key: string) => ({
        id: SpendId.generate(),
        at: Date.now(),
        userId: owner,
        runId,
        idempotencyKey: key,
        usdMicros: usdMicros(200_000),
      });
      const results = await Promise.allSettled([
        ledger.reserve(row("one"), 250_000),
        otherLedger.reserve(row("two"), 250_000),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled")
      ).toHaveLength(1);
      const denied = results.find((result) => result.status === "rejected");
      expect(
        denied?.status === "rejected" &&
          denied.reason instanceof SpendBudgetExceededError
      ).toBe(true);
      const winner = results.find((result) => result.status === "fulfilled");
      if (winner?.status !== "fulfilled") {
        throw new Error("No reservation won.");
      }
      const replay = await otherLedger.reserve(
        row(winner.value.row.idempotencyKey),
        250_000
      );
      expect(replay.created).toBe(false);
      const originalKey = winner.value.row.idempotencyKey;
      await ledger.settle(winner.value.row.id, "abandoned");
      const replacement = await otherLedger.reserve(row(originalKey), 250_000);
      expect(replacement.created).toBe(true);
      await ledger.settle(winner.value.row.id, "abandoned");
      const repeated = await ledger.reserve(row(originalKey), 250_000);
      expect(repeated.created).toBe(false);
    });
    test("conversion credit is unavailable until confirmed and applied only once", async () => {
      const { store, other } = make();
      const owner = userId(`did:privy:conversion-${crypto.randomUUID()}`);
      const record: ConversionRecord = {
        id: ConversionId.generate(),
        key: "conversion",
        usdMicros: 2_000_000,
        evmNetwork: "eip155:84532",
        hederaNetwork: "hedera:testnet",
        phase: "usdc_pending",
        usdcHash: null,
        funding: null,
        error: null,
        credited: false,
      };
      const claims = await Promise.all([
        store.conversions.create(owner, record),
        other.conversions.create(owner, {
          ...record,
          id: ConversionId.generate(),
        }),
      ]);
      expect(claims.filter((claim) => claim.created)).toHaveLength(1);
      const id = claims[0]?.record.id;
      if (id === undefined) {
        throw new Error("No conversion persisted.");
      }
      const refused = await store.conversions
        .credit(owner, id)
        .then(() => null, String);
      expect(refused).toContain("not confirmed");
      expect(
        await other.conversions.update(id, "usdc_pending", { phase: "funded" })
      ).toBe(true);
      const balances = await Promise.all([
        store.conversions.credit(owner, id),
        other.conversions.credit(owner, id),
      ]);
      expect(balances).toEqual([2_000_000, 2_000_000]);
      expect(await store.pocket.load(owner)).toBe(2_000_000);
      expect(await other.conversions.pending(owner)).toEqual([]);
    });
  });
};
suite("memory persistence contracts", () => {
  const store = memoryStore();
  const ledger = memoryLedger();
  return { store, other: store, ledger, otherLedger: ledger };
});
const url = process.env["FROGGY_TEST_DATABASE_URL"];
if (url === undefined) {
  describe.skip("Postgres persistence contracts", () => {
    test("requires FROGGY_TEST_DATABASE_URL", () => {
      expect(url).toBeUndefined();
    });
  });
} else {
  const first = postgres(url, { max: 5 });
  const second = postgres(url, { max: 5 });
  afterAll(async () => {
    await Promise.all([first.end({ timeout: 5 }), second.end({ timeout: 5 })]);
  });
  suite("Postgres persistence contracts", () => ({
    store: postgresStore(first),
    other: postgresStore(second),
    ledger: postgresLedger(first),
    otherLedger: postgresLedger(second),
  }));
}
