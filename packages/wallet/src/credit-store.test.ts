import { afterAll, describe, expect, it } from "bun:test";

import {
  AgentTokenId,
  CreditPurchaseId,
  creditUnits,
  defaultCreditLimits,
  RunId,
  TaskId,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { CreditLimits, Task, UserId } from "@froggy/domain";
import postgres from "postgres";

import type { CreditStore, FundingPurchase } from "./credit-store";
import { memoryCreditStore } from "./credit-store-memory";
import { postgresCreditStore } from "./credit-store-postgres";

const NOW = 1_789_300_000_000;
const owner = () => userId(`did:privy:credits-${crypto.randomUUID()}`);
const quote = (units: number, stubbed = true): FundingPurchase => ({
  v: 1,
  id: CreditPurchaseId.generate(),
  idempotencyKey: crypto.randomUUID(),
  requestFingerprint: "funding",
  creditUnits: creditUnits(units),
  network: "hedera:testnet",
  asset: "0.0.0",
  amount: "1",
  payTo: "0.0.1",
  status: "quoted",
  challenge: {},
  expiresAt: NOW + 60_000,
  createdAt: NOW,
  updatedAt: NOW,
  transactionId: null,
  error: null,
  stubbed,
  proofHash: null,
  authorizationKey: null,
  paymentHeader: null,
  signedTransaction: null,
  transactionNonce: null,
});
const proof = () => ({
  proofHash: crypto.randomUUID(),
  authorizationKey: crypto.randomUUID(),
  paymentHeader: "stub-proof",
});
const fund = async (
  store: CreditStore,
  who: UserId,
  units: number,
  stubbed = true
) => {
  const purchase = quote(units, stubbed);
  await store.createFunding(who, purchase);
  await store.claimFunding(who, purchase.id, proof(), NOW);
  await store.confirmFunding(who, purchase.id, {
    transactionId: crypto.randomUUID(),
    stubbed,
    now: NOW,
  });
  return purchase;
};
const task = (units: number, key = crypto.randomUUID()): Task => ({
  id: TaskId.generate(),
  idempotencyKey: key,
  agentTokenId: null,
  connectionId: null,
  createdAt: NOW,
  updatedAt: NOW,
  error: null,
  input: { service: "web_search", prompt: "frogs" },
  kind: "service",
  priceUsdMicros: usdMicros(units),
  result: null,
  runId: RunId.generate(),
  saleId: null,
  status: "quoted",
});
const limits = (dailyUnits: number): CreditLimits => ({
  ...defaultCreditLimits(),
  dailyUnits: creditUnits(dailyUnits),
});
const reserve = async (
  store: CreditStore,
  who: UserId,
  input: Task,
  now = NOW
) => await store.reserveTask(who, input, { stubbed: true, now });

const expectFailure = async (pending: Promise<unknown>, message: string) => {
  let failure: unknown;
  try {
    await pending;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) {
    expect(failure.message).toContain(message);
  }
};

const suite = (name: string, first: CreditStore, second = first) => {
  describe(name, () => {
    it("starts at zero with independent credit permission", async () => {
      const state = await first.summary(owner());
      expect(state.availableUnits).toBe(creditUnits(0));
      expect(state.stubbed).toBe(false);
      expect(state.limits).toEqual(defaultCreditLimits());
      expect(
        defaultCreditLimits({
          perSpendUsdMicros: usdMicros(42),
          dailyUsdMicros: usdMicros(55),
          askOverUsdMicros: usdMicros(0),
          expiresAt: 1,
        })
      ).toEqual({
        perTaskUnits: creditUnits(42),
        dailyUnits: creditUnits(55),
        frozen: false,
        expiresAt: null,
      });
    });
    it("credits confirmed funding exactly once across repeated confirmations", async () => {
      const who = owner();
      const purchase = quote(100_000);
      await first.createFunding(who, purchase);
      const claim = proof();
      await first.claimFunding(who, purchase.id, claim, NOW);
      const summaryResult1 = await first.summary(who);
      expect(summaryResult1.availableUnits).toBe(creditUnits(0));
      const claimFundingResult2 = await second.claimFunding(
        who,
        purchase.id,
        claim,
        NOW
      );
      expect(claimFundingResult2.claimed).toBe(false);
      const result = { transactionId: crypto.randomUUID(), now: NOW };
      await Promise.all([
        first.confirmFunding(who, purchase.id, result),
        second.confirmFunding(who, purchase.id, result),
      ]);
      const summaryResult3 = await first.summary(who);
      expect(summaryResult3.availableUnits).toBe(creditUnits(100_000));
      const entriesResult4 = await first.entries(who);
      expect(
        entriesResult4.filter((entry) => entry.kind === "funding")
      ).toHaveLength(1);
    });
    it("claims one authorization globally even when different accounts race", async () => {
      const a = owner();
      const b = owner();
      const qa = quote(100);
      const qb = quote(100);
      await first.createFunding(a, qa);
      await second.createFunding(b, qb);
      const auth = proof();
      const results = await Promise.allSettled([
        first.claimFunding(a, qa.id, auth, NOW),
        second.claimFunding(b, qb.id, auth, NOW),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled")
      ).toHaveLength(1);
      const summaryResult5 = await first.summary(a);
      const summaryResult6 = await second.summary(b);
      expect(
        summaryResult5.availableUnits + summaryResult6.availableUnits
      ).toBe(creditUnits(0));
    });
    it("rejects a transaction already credited elsewhere and rolls back", async () => {
      const a = owner();
      const b = owner();
      const qa = quote(100);
      const qb = quote(100);
      await first.createFunding(a, qa);
      await second.createFunding(b, qb);
      await first.claimFunding(a, qa.id, proof(), NOW);
      await second.claimFunding(b, qb.id, proof(), NOW);
      const result = { transactionId: crypto.randomUUID(), now: NOW };
      await first.confirmFunding(a, qa.id, result);
      await expectFailure(second.confirmFunding(b, qb.id, result), "already");
      const summaryResult7 = await second.summary(b);
      expect(summaryResult7.availableUnits).toBe(creditUnits(0));
      const findFundingResult8 = await second.findFunding(b, qb.id);
      expect(findFundingResult8?.status).toBe("pending");
    });
    it("retains the original quote across idempotent create retries", async () => {
      const who = owner();
      const purchase = quote(100);
      await first.createFunding(who, purchase);
      const replay = await second.createFunding(who, {
        ...purchase,
        id: CreditPurchaseId.generate(),
        expiresAt: NOW + 99_000,
      });
      expect(replay.replayed).toBe(true);
      expect(replay.purchase.id).toBe(purchase.id);
      await expectFailure(
        second.createFunding(who, { ...purchase, requestFingerprint: "other" }),
        "different terms"
      );
    });
    it("reserves a task once and persists its credit linkage", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      const input = task(60_000);
      const results = await Promise.all([
        reserve(first, who, input),
        reserve(second, who, { ...input, id: TaskId.generate() }),
      ]);
      expect(results.filter((result) => !result.replayed)).toHaveLength(1);
      expect(results[0]?.charge.id).toBe(results[1]?.charge.id);
      const summaryResult9 = await first.summary(who);
      expect(summaryResult9.availableUnits).toBe(creditUnits(40_000));
      const summaryResult10 = await first.summary(who);
      expect(summaryResult10.reservedUnits).toBe(creditUnits(60_000));
      const pendingTasksResult11 = await first.pendingTasks(1000);
      expect(
        pendingTasksResult11.find((row) => row.userId === who)?.task
          .chargeStatus
      ).toBe("reserved");
    });
    it("cannot overspend when distinct tasks race on separate connections", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      const results = await Promise.all([
        reserve(first, who, task(70_000)),
        reserve(second, who, task(70_000)),
      ]);
      expect(
        results.filter((result) => result.charge.status === "reserved")
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.charge.status === "refused")
      ).toHaveLength(1);
      const summaryResult12 = await first.summary(who);
      expect(summaryResult12.availableUnits).toBe(creditUnits(30_000));
      const entriesResult13 = await first.entries(who);
      expect(
        entriesResult13.filter((entry) => entry.kind === "refusal")
      ).toHaveLength(1);
    });
    it("releases failed work once and never lets a late completion recapture it", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      const started = await reserve(first, who, task(60_000));
      await first.finishTask(
        who,
        started.task.id,
        { status: "failed", error: "Provider refused." },
        "release",
        NOW + 10
      );
      await second.finishTask(
        who,
        started.task.id,
        { status: "done", result: "late" },
        "capture",
        NOW + 20
      );
      const state = await first.summary(who);
      expect(state.availableUnits).toBe(creditUnits(100_000));
      expect(state.reservedUnits).toBe(creditUnits(0));
      expect(state.spentUnits).toBe(creditUnits(0));
      const findChargeResult14 = await first.findCharge(who, started.task.id);
      expect(findChargeResult14?.status).toBe("released");
    });
    it("captures success once when multiple workers report it", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      const started = await reserve(first, who, task(60_000));
      await Promise.all([
        first.finishTask(
          who,
          started.task.id,
          { status: "done" },
          "capture",
          NOW + 10
        ),
        second.finishTask(
          who,
          started.task.id,
          { status: "done" },
          "capture",
          NOW + 10
        ),
      ]);
      const state = await first.summary(who);
      expect(state.availableUnits).toBe(creditUnits(40_000));
      expect(state.reservedUnits).toBe(creditUnits(0));
      expect(state.spentUnits).toBe(creditUnits(60_000));
    });
    it("holds uncertain work across days and refunds only explicit reconciliation", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      await first.setLimits(who, limits(60_000));
      const started = await reserve(first, who, task(60_000));
      await first.finishTask(
        who,
        started.task.id,
        { status: "uncertain" },
        "uncertain",
        NOW + 10
      );
      const denied = await reserve(second, who, task(1), NOW + 2 * 86_400_000);
      expect(denied.charge.reason).toContain("credit_daily_cap");
      await second.finishTask(
        who,
        started.task.id,
        { status: "failed" },
        "release",
        NOW + 2 * 86_400_000
      );
      const summaryResult15 = await first.summary(who);
      expect(summaryResult15.availableUnits).toBe(creditUnits(100_000));
    });
    it("counts capture time in the rolling cap even for an old reservation", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      await first.setLimits(who, limits(60_000));
      const started = await reserve(first, who, task(60_000));
      const tomorrow = NOW + 2 * 86_400_000;
      await first.finishTask(
        who,
        started.task.id,
        { status: "done" },
        "capture",
        tomorrow
      );
      const reservationResult16 = await reserve(
        second,
        who,
        task(1),
        tomorrow + 10
      );
      expect(reservationResult16.charge.reason).toContain("credit_daily_cap");
    });
    it("keeps all child tasks inside a shared run budget", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      const one = task(60_000);
      const options = {
        stubbed: true,
        now: NOW,
        runBudgetUnits: creditUnits(60_000),
      };
      await first.reserveTask(who, one, options);
      const denied = await second.reserveTask(
        who,
        { ...task(1), runId: one.runId },
        options
      );
      expect(denied.charge.reason).toContain("credit_run_cap");
    });
    it("rejects changed input or another connection reusing a task key", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      const input = task(10_000);
      await reserve(first, who, input);
      await expectFailure(
        reserve(second, who, { ...input, input: { prompt: "different" } }),
        "another task"
      );
      await expectFailure(
        reserve(second, who, {
          ...input,
          connectionId: AgentTokenId.generate(),
        }),
        "connection"
      );
      const summaryResult17 = await first.summary(who);
      expect(summaryResult17.reservedUnits).toBe(creditUnits(10_000));
    });
    it("lets a regenerated identical browser quote replay without a second debit", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      const input: Task = {
        ...task(10_000),
        kind: "browse",
        input: {
          instruction: "read",
          quote: { taskId: "first", expiresAt: 1, budgetUsd: 1 },
        },
      };
      await reserve(first, who, input);
      const replay = await reserve(second, who, {
        ...input,
        id: TaskId.generate(),
        input: {
          instruction: "read",
          quote: { taskId: "second", expiresAt: 2, budgetUsd: 1 },
        },
      });
      expect(replay.replayed).toBe(true);
      const taskResult18 = await reserve(second, who, {
        ...task(1),
        kind: "browse",
      });
      expect(taskResult18.charge.reason).toContain("credit_browser_busy");
    });
    it("refuses frozen credit authority without consuming available credit", async () => {
      const who = owner();
      await fund(first, who, 100_000);
      await first.setLimits(who, { ...defaultCreditLimits(), frozen: true });
      const reservationResult19 = await reserve(second, who, task(1));
      expect(reservationResult19.charge.reason).toContain("credit_frozen");
      const summaryResult20 = await first.summary(who);
      expect(summaryResult20.availableUnits).toBe(creditUnits(100_000));
    });
    it("isolates real funds from simulated funding and simulated tasks", async () => {
      const who = owner();
      await fund(first, who, 100_000, false);
      await expectFailure(fund(second, who, 1, true), "cannot share");
      const reservationResult21 = await reserve(second, who, task(1));
      expect(reservationResult21.charge.reason).toContain(
        "credit_mode_mismatch"
      );
      const summaryResult22 = await first.summary(who);
      expect(summaryResult22.availableUnits).toBe(creditUnits(100_000));
    });
    it("chooses one funding mode atomically before either payment can settle", async () => {
      const who = owner();
      const simulated = quote(100, true);
      const real = quote(100, false);
      await first.createFunding(who, simulated);
      await first.createFunding(who, real);
      const outcomes = await Promise.allSettled([
        first.claimFunding(who, simulated.id, proof(), NOW),
        second.claimFunding(who, real.id, proof(), NOW),
      ]);
      expect(
        outcomes.filter((result) => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        outcomes.filter((result) => result.status === "rejected")
      ).toHaveLength(1);
      const state = await first.summary(who);
      expect(state.availableUnits).toBe(creditUnits(0));
      const saved = await first.listFunding(who);
      expect(
        saved.filter((purchase) => purchase.status === "pending")
      ).toHaveLength(1);
      expect(
        saved.filter((purchase) => purchase.status === "quoted")
      ).toHaveLength(1);
    });
    it("persists uncertain transaction identity and never replaces signed bytes", async () => {
      const who = owner();
      const purchase = quote(100);
      const transactionId = crypto.randomUUID();
      await first.createFunding(who, purchase);
      await first.claimFunding(who, purchase.id, proof(), NOW);
      await first.updateFunding(who, purchase.id, {
        transactionId,
        signedTransaction: "signed",
        transactionNonce: 1,
        status: "uncertain",
      });
      await expectFailure(
        second.updateFunding(who, purchase.id, { transactionId: "other" }),
        "cannot be replaced"
      );
      const hasPendingSettlement = await second.pendingSettlement(
        purchase.network
      );
      const ignoresCurrentSettlement = await second.pendingSettlement(
        purchase.network,
        purchase.id
      );
      const ignoresOtherNetwork = await second.pendingSettlement("eip155:8453");
      expect(hasPendingSettlement).toBe(true);
      expect(ignoresCurrentSettlement).toBe(false);
      expect(ignoresOtherNetwork).toBe(false);
      const pendingFundingResult23 = await second.pendingFunding(1000);
      expect(
        pendingFundingResult23.find((row) => row.userId === who)?.purchase
          .signedTransaction
      ).toBe("signed");
      await second.confirmFunding(who, purchase.id, {
        transactionId,
        now: NOW,
      });
      const summaryResult24 = await first.summary(who);
      expect(summaryResult24.availableUnits).toBe(creditUnits(100));
    });
  });
};

suite("memory credit accounting", memoryCreditStore(new Map()));
const url = process.env["FROGGY_TEST_DATABASE_URL"];
if (url !== undefined && url !== "") {
  const one = postgres(url, { max: 3 });
  const two = postgres(url, { max: 3 });
  afterAll(async () => {
    await Promise.all([one.end({ timeout: 5 }), two.end({ timeout: 5 })]);
  });
  suite(
    "Postgres credit accounting across pools",
    postgresCreditStore(one),
    postgresCreditStore(two)
  );
} else {
  describe("Postgres credit accounting", () => {
    it.skip("requires FROGGY_TEST_DATABASE_URL", () => {});
  });
}
