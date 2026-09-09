import { expect, test } from "bun:test";

import { ReceiptId, TradeId, userId } from "@froggy/domain";
import type { Trade } from "@froggy/domain";
import { executeTradeStep, memoryStore, recoverTrade } from "@froggy/wallet";

import { pumpExecution } from "./pump-execution";
import { pumpFixture } from "./pump-fixture";

const preparedTrade = async (
  fixture: Awaited<ReturnType<typeof pumpFixture>>
) => {
  const backend = pumpExecution({
    rpc: fixture.rpc,
    outbound: fixture.outbound,
    now: () => 100,
  });
  const prepared = await backend.prepare(fixture.input);
  const trade: Trade = {
    v: 1,
    id: TradeId.generate(),
    idempotencyKey: "pump-execution",
    connectionId: null,
    createdAt: 100,
    updatedAt: 100,
    revision: 0,
    input: fixture.input,
    inputFingerprint: "a".repeat(64),
    status: "awaiting_approval",
    ...prepared,
    phase: prepared.phase ?? null,
    actualOutput: null,
    reservations: [],
    reservationState: "none",
    receiptId: ReceiptId.generate(),
    events: [],
    error: null,
    limitations: [],
    stubbed: false,
  };
  return { backend, trade };
};

for (const phase of ["curve", "graduated"] as const) {
  for (const buy of [true, false]) {
    test(`Pump ${phase} ${buy ? "buy" : "sell"} simulates, signs and reconciles finalized balances`, async () => {
      const fixture = await pumpFixture(phase, buy);
      const { backend, trade } = await preparedTrade(fixture);
      const [step] = trade.steps;
      if (step === undefined) {
        throw new Error("Missing fixture step");
      }
      expect(step.simulation.provider).toBe("quicknode");
      expect(step.simulation.stubbed).toBe(false);
      const store = memoryStore().trading;
      const owner = userId("did:privy:pump-fixture");
      await store.transact(owner, (book) => {
        book.trades.set(trade.id, trade);
      });
      const balances = await backend.balances(fixture.input);
      fixture.setConfirmed(false);
      const pending = await executeTradeStep(
        store,
        owner,
        {
          id: trade.id,
          stepId: step.id,
          authority: {
            kind: "human",
            approvalId: step.approvalId,
            fingerprint: step.fingerprint,
          },
          now: 100,
          frozen: false,
          balances: balances.balances,
          balanceObservedAt: 100,
        },
        backend.submission({ kind: "solana", signer: fixture.signer })
      );
      expect(pending.status).toBe("executing");
      expect(pending.reservationState).toBe("held");
      expect(pending.steps[0]?.transactionId).not.toBeNull();
      fixture.setConfirmed(true);
      fixture.setPhase(phase === "curve" ? "graduated" : "curve");
      const settled = await recoverTrade(
        store,
        owner,
        trade.id,
        backend.submission(null),
        200
      );
      expect(settled.status).toBe("completed");
      expect(settled.actualInput).toBe(buy ? "850" : "1000");
      expect(settled.actualOutput).toBe("2000");
      expect(settled.steps[0]?.actualNativeFee).toBe("5000");
      expect(settled.reservationState).toBe("released");
      expect(
        fixture.calls.filter((call) => call === "sendTransaction")
      ).toHaveLength(1);
    });
  }
}

for (const phase of ["curve", "graduated"] as const) {
  test(`Pump ${phase} rejects changed recipients, excessive allocation and trailing instructions`, async () => {
    const fixture = await pumpFixture(phase);
    const backend = pumpExecution({
      rpc: fixture.rpc,
      outbound: fixture.outbound,
      now: () => 100,
    });
    const keys = [...fixture.routeAccounts];
    keys[5] = fixture.input.wallet;
    const data = Buffer.from(fixture.routeData);
    data.writeBigUInt64LE(1001n, 16);
    const refuses = async (transaction: string) => {
      fixture.setTransaction(transaction);
      expect(
        await backend.prepare(fixture.input).then(() => null, String)
      ).toContain("trade.");
    };
    await refuses(fixture.build(fixture.routeData, keys));
    await refuses(fixture.build(data));
    await refuses(
      fixture.build(Buffer.concat([fixture.routeData, Buffer.from([0])]))
    );
    expect(fixture.calls).not.toContain("sendTransaction");
  });
  test(`Pump ${phase} rechecks phase and output before signing`, async () => {
    const fixture = await pumpFixture(phase);
    const { backend, trade } = await preparedTrade(fixture);
    const [step] = trade.steps;
    if (step === undefined) {
      throw new Error("Missing fixture step");
    }
    const submission = backend.submission({
      kind: "solana",
      signer: fixture.signer,
    });
    fixture.setOutput(1n);
    expect(
      await submission.sign(trade, step).then(() => null, String)
    ).toContain("trade.simulation");
    fixture.setOutput(2000n);
    fixture.setPhase(phase === "curve" ? "graduated" : "curve");
    expect(
      await submission.sign(trade, step).then(() => null, String)
    ).toContain("trade.phase");
    expect(fixture.calls).not.toContain("sendTransaction");
  });
}
