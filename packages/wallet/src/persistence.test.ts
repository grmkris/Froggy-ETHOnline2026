import { afterAll, describe, expect, test } from "bun:test";

import {
  defaultAllowance,
  AgentInvocationId,
  AgentTokenId,
  ApprovalId,
  PurchaseId,
  SaleId,
  OAuthGrantId,
  ConversionId,
  RunId,
  ScheduleId,
  SpendId,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { AgentInvocation, Purchase, Sale, Schedule } from "@froggy/domain";
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
const pendingPurchase = (key: string): Purchase => {
  const at = Date.now();
  return {
    id: PurchaseId.generate(),
    createdAt: at,
    updatedAt: at,
    idempotencyKey: key,
    source: "chat",
    connectionId: null,
    runId: RunId.generate(),
    toolCallId: null,
    browserPaymentId: null,
    request: {
      method: "POST",
      url: "https://merchant.example/search",
      body: "{}",
    },
    requestFingerprint: "request-v1",
    purpose: "Look up a price",
    maxUsdMicros: usdMicros(100_000),
    budgetUsdMicros: usdMicros(1_000_000),
    preferredNetwork: null,
    contactApprovedAt: null,
    status: "awaiting_approval",
    quote: null,
    approvalId: ApprovalId.generate(),
    expiresAt: at + 60_000,
    grant: null,
    payment: {
      state: "none",
      proofHash: null,
      transactionId: null,
      sentAt: null,
    },
    delivery: {
      state: "pending",
      status: null,
      contentType: null,
      body: null,
      bodyHash: null,
    },
    receiptId: null,
    error: null,
    stubbed: true,
  };
};

const suite = (name: string, make: () => Backend): void => {
  describe(name, () => {
    test("a person's policy round-trips, is visible to another worker, and clears", async () => {
      const { store, other } = make();
      const owner = userId(`did:privy:policy-${crypto.randomUUID()}`);
      expect(await store.privyPolicy.load(owner)).toBeNull();

      const allowance = defaultAllowance(Date.now());
      await store.privyPolicy.save(owner, {
        allowance,
        policyId: "pol_spike_1",
      });

      // Read back through a *different* connection: the grant path runs on
      // whichever process the person's next request lands on, and a policy only
      // one worker can see would be minted twice.
      const loaded = await other.privyPolicy.load(owner);
      expect(loaded?.policyId).toBe("pol_spike_1");
      expect(loaded?.allowance).toEqual(allowance);

      // Re-granting or adjusting replaces rather than accumulating.
      await store.privyPolicy.save(owner, {
        allowance: { ...allowance, perSpendUsdMicros: usdMicros(5_000_000) },
        policyId: "pol_spike_2",
      });
      const second = await other.privyPolicy.load(owner);
      expect(second?.policyId).toBe("pol_spike_2");
      expect(second?.allowance.perSpendUsdMicros).toBe(usdMicros(5_000_000));

      await store.privyPolicy.clear(owner);
      expect(await other.privyPolicy.load(owner)).toBeNull();
    });

    test("finds only the policies that expire before the horizon", async () => {
      const { store, other } = make();
      const soon = userId(`did:privy:policy-soon-${crypto.randomUUID()}`);
      const later = userId(`did:privy:policy-later-${crypto.randomUUID()}`);
      const now = Date.now();
      const base = defaultAllowance(now);
      await store.privyPolicy.save(soon, {
        allowance: { ...base, expiresAt: now + 86_400_000 },
        policyId: "pol_soon",
      });
      await store.privyPolicy.save(later, {
        allowance: { ...base, expiresAt: now + 20 * 86_400_000 },
        policyId: "pol_later",
      });
      // Read through the other connection: the tick runs wherever it runs.
      const due = await other.privyPolicy.expiringBefore(now + 3 * 86_400_000);
      expect(due).toContain(soon);
      expect(due).not.toContain(later);
    });

    test("forgetting a person takes their standing authority with them", async () => {
      // Unlike the Hedera account, which is money and is kept: a policy is
      // authority, and a person who asked to be forgotten must not leave a
      // standing signature behind.
      const { store } = make();
      const owner = userId(`did:privy:policy-forget-${crypto.randomUUID()}`);
      await store.privyPolicy.save(owner, {
        allowance: defaultAllowance(Date.now()),
        policyId: "pol_spike_forget",
      });
      await store.forget(owner);
      expect(await store.privyPolicy.load(owner)).toBeNull();
    });

    test("purchase creation and approval claims are atomic across workers and owner scoped", async () => {
      const { store, other } = make();
      const owner = userId(`did:privy:purchase-${crypto.randomUUID()}`);
      const stranger = userId(
        `did:privy:other-purchase-${crypto.randomUUID()}`
      );
      const purchase = pendingPurchase(crypto.randomUUID());
      const records = await Promise.all([
        store.purchases.create(owner, purchase),
        other.purchases.create(owner, {
          ...purchase,
          id: PurchaseId.generate(),
        }),
      ]);
      expect(records.filter((record) => record.created)).toHaveLength(1);
      const recorded = records[0]?.purchase;
      if (recorded === undefined) {
        throw new Error("No purchase persisted.");
      }
      expect(records[1]?.purchase.id).toBe(recorded.id);
      expect(await other.purchases.byId(stranger, recorded.id)).toBeNull();
      expect(
        await other.purchases.byKey(stranger, recorded.idempotencyKey)
      ).toBeNull();
      expect(await other.purchases.list(stranger, 50)).toEqual([]);
      expect(
        await other.purchases.update(
          stranger,
          recorded.id,
          ["awaiting_approval"],
          { status: "paying", updatedAt: Date.now() },
          recorded.approvalId
        )
      ).toBeNull();
      const claims = await Promise.all([
        store.purchases.update(
          owner,
          recorded.id,
          ["awaiting_approval"],
          { status: "probing", updatedAt: Date.now() },
          recorded.approvalId
        ),
        other.purchases.update(
          owner,
          recorded.id,
          ["awaiting_approval"],
          { status: "probing", updatedAt: Date.now() },
          recorded.approvalId
        ),
      ]);
      expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
      const quoteApproval = ApprovalId.generate();
      const next = await store.purchases.update(
        owner,
        recorded.id,
        ["probing"],
        {
          approvalId: quoteApproval,
          status: "awaiting_approval",
          contactApprovedAt: Date.now(),
          updatedAt: Date.now(),
        }
      );
      expect(next?.approvalId).toBe(quoteApproval);
      // Returning to the same status must not revive the earlier POST consent.
      expect(
        await other.purchases.update(
          owner,
          recorded.id,
          ["awaiting_approval"],
          { status: "paying", updatedAt: Date.now() },
          recorded.approvalId
        )
      ).toBeNull();
      const paid = await other.purchases.update(
        owner,
        recorded.id,
        ["awaiting_approval"],
        { status: "paying", updatedAt: Date.now() },
        quoteApproval
      );
      expect(paid?.status).toBe("paying");
      expect(
        await store.purchases.update(
          owner,
          recorded.id,
          ["awaiting_approval"],
          { status: "paying", updatedAt: Date.now() },
          quoteApproval
        )
      ).toBeNull();
      const found = await store.purchases.byKey(owner, recorded.idempotencyKey);
      expect(found?.request).toEqual(recorded.request);
      expect(found?.status).toBe("paying");
    });

    test("forget removes the owner's purchase input and result while retaining other owners and the ledger", async () => {
      const { store, other, ledger, otherLedger } = make();
      const owner = userId(`did:privy:forget-purchase-${crypto.randomUUID()}`);
      const stranger = userId(`did:privy:keep-purchase-${crypto.randomUUID()}`);
      const draft = pendingPurchase(crypto.randomUUID());
      const purchase: Purchase = {
        ...draft,
        request: { ...draft.request, body: '{"query":"private owner input"}' },
        delivery: {
          ...draft.delivery,
          state: "delivered",
          status: 200,
          contentType: "application/json",
          body: '{"result":"private owner result"}',
        },
        status: "completed",
      };
      const kept: Purchase = {
        ...purchase,
        id: PurchaseId.generate(),
        request: { ...draft.request, body: '{"query":"other owner input"}' },
        delivery: {
          ...purchase.delivery,
          body: '{"result":"other owner result"}',
        },
      };
      await store.purchases.create(owner, purchase);
      await other.purchases.create(stranger, kept);
      const spend = {
        id: SpendId.generate(),
        userId: owner,
        idempotencyKey: `purchase:${purchase.id}`,
        usdMicros: usdMicros(10_000),
        at: Date.now(),
      };
      await ledger.reserve(spend);
      expect(await other.purchases.byId(owner, purchase.id)).toEqual(purchase);

      await store.forget(owner);

      expect(await other.purchases.byId(owner, purchase.id)).toBeNull();
      expect(
        await other.purchases.byKey(owner, purchase.idempotencyKey)
      ).toBeNull();
      expect(await other.purchases.list(owner, 50)).toEqual([]);
      expect(await other.purchases.byId(stranger, kept.id)).toEqual(kept);
      expect(
        await store.purchases.byKey(stranger, kept.idempotencyKey)
      ).toEqual(kept);
      expect(await store.purchases.list(stranger, 50)).toEqual([kept]);
      expect(await otherLedger.since(owner, 0)).toEqual([
        { ...spend, status: "reserved" },
      ]);
    });

    test("seller proof claims persist uncertainty, transaction IDs, and stub markers", async () => {
      const { store, other } = make();
      const sale: Sale = {
        id: SaleId.generate(),
        amount: "10000",
        asset: "0.0.0",
        at: Date.now(),
        deliveredAt: null,
        error: null,
        network: "hedera:testnet",
        payer: "0.0.1",
        paymentHash: crypto.randomUUID(),
        resource: "https://merchant.example/demo",
        result: null,
        status: "pending",
        stubbed: false,
        transactionId: null,
      };
      const claims = await Promise.all([
        store.sales.record(sale),
        other.sales.record({ ...sale, id: SaleId.generate() }),
      ]);
      expect(claims.filter((claim) => claim.created)).toHaveLength(1);
      const [claim] = claims;
      if (claim === undefined) {
        throw new Error("No sale persisted.");
      }
      await store.sales.update(claim.sale.id, {
        status: "uncertain",
        error: "Connection lost after sending",
        transactionId: "0.0.1@1",
        stubbed: true,
      });
      expect(await other.sales.byPaymentHash(sale.paymentHash)).toMatchObject({
        status: "uncertain",
        transactionId: "0.0.1@1",
        stubbed: true,
      });
      await other.sales.update(claim.sale.id, {
        status: "settled",
        error: null,
        transactionId: "0.0.1@2",
        stubbed: false,
      });
      expect(await store.sales.byId(claim.sale.id)).toMatchObject({
        status: "settled",
        transactionId: "0.0.1@2",
        stubbed: false,
      });
    });

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
