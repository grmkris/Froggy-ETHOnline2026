import { expect, test } from "bun:test";

import { ReceiptId, TradeId, userId } from "@froggy/domain";
import type { Trade } from "@froggy/domain";
import { executeTradeStep, memoryStore, recoverTrade } from "@froggy/wallet";
import {
  AccountRole,
  address,
  getCompiledTransactionMessageEncoder,
} from "@solana/kit";

import { jupiterExecution } from "./jupiter-execution";
import { jupiterFixture } from "./jupiter-fixture";
import { validateJupiterTransaction } from "./jupiter-transactions";
import {
  decodeSolanaTrade,
  resolveSolanaTrade,
  SOLANA_PROGRAMS,
  verifySignedSolanaTrade,
} from "./solana-transactions";

const preparedTrade = async (
  fixture: Awaited<ReturnType<typeof jupiterFixture>>
) => {
  const backend = jupiterExecution({
    rpc: fixture.rpc,
    jupiter: fixture.jupiter,
    now: () => 100,
  });
  const prepared = await backend.prepare(fixture.input);
  const trade: Trade = {
    v: 1,
    id: TradeId.generate(),
    idempotencyKey: "jupiter-execution",
    connectionId: null,
    createdAt: 100,
    updatedAt: 100,
    revision: 0,
    input: fixture.input,
    inputFingerprint: "a".repeat(64),
    status: "awaiting_approval",
    ...prepared,
    actualOutput: null,
    phase: "standard",
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

test("Jupiter independently simulates, signs one immutable transaction and reconciles finalized token balances", async () => {
  const fixture = await jupiterFixture();
  const { backend, trade } = await preparedTrade(fixture);
  const [step] = trade.steps;
  if (step === undefined) {
    throw new Error("Missing fixture step");
  }
  expect(step.simulation.provider).toBe("quicknode");
  expect(step.simulation.stubbed).toBe(false);
  const store = memoryStore().trading;
  const owner = userId("did:privy:jupiter-fixture");
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
  const settled = await recoverTrade(
    store,
    owner,
    trade.id,
    backend.submission(null),
    200
  );
  expect(settled.status).toBe("completed");
  expect(settled.actualOutput).toBe("200");
  expect(settled.steps[0]?.actualNativeFee).toBe("5000");
  expect(settled.reservationState).toBe("released");
  expect(fixture.calls.filter((call) => call === "execute")).toHaveLength(1);
});

test("altered recipient, amount, trailing data and unreviewed programs are refused before signing", async () => {
  const fixture = await jupiterFixture();
  const backend = jupiterExecution({
    rpc: fixture.rpc,
    jupiter: fixture.jupiter,
    now: () => 100,
  });
  const wrongAccounts = [...fixture.routeAccounts];
  wrongAccounts[3] = fixture.input.tokenIn;
  const wrongAmount = Buffer.from(fixture.routeData);
  wrongAmount.writeBigUInt64LE(101n, 16);
  const variants = [
    fixture.build(fixture.routeData, wrongAccounts),
    fixture.build(wrongAmount),
    fixture.build(Buffer.concat([fixture.routeData, Buffer.from([0])])),
    fixture.build(fixture.routeData, fixture.routeAccounts, [
      {
        programAddress: address(fixture.input.tokenIn),
        data: Buffer.from([1]),
      },
    ]),
  ];
  const results = await Promise.all(
    variants.map(async (transaction) => {
      const decoded = await resolveSolanaTrade(
        fixture.rpc,
        transaction,
        fixture.input.wallet
      );

      return await validateJupiterTransaction(
        fixture.input,
        "198",
        decoded
      ).then(() => null, String);
    })
  );
  expect(
    results.every((result) => result !== null && result.includes("trade."))
  ).toBe(true);
  fixture.setTransaction(variants[1] ?? "");
  expect(
    await backend.prepare(fixture.input).then(() => null, String)
  ).toContain("trade.route");
  expect(fixture.calls).not.toContain("execute");
});

test("simulation output, snapshot consistency and compute fees are independent signing conditions", async () => {
  const fixture = await jupiterFixture();
  const backend = jupiterExecution({
    rpc: fixture.rpc,
    jupiter: fixture.jupiter,
    now: () => 100,
  });
  fixture.setOutput(197n);
  expect(
    await backend.prepare(fixture.input).then(() => null, String)
  ).toContain("trade.simulation");
  fixture.setOutput(200n);
  fixture.setSimulationSlot(101);
  expect(
    await backend.prepare(fixture.input).then(() => null, String)
  ).toContain("trade.simulation_snapshot");
  expect(
    fixture.calls.filter((call) => call === "simulateTransaction")
  ).toHaveLength(4);
  fixture.setSimulationSlot(100);
  const price = Buffer.alloc(9);
  price[0] = 3;
  price.writeBigUInt64LE(10_000n, 1);
  fixture.setTransaction(
    fixture.build(fixture.routeData, fixture.routeAccounts, [
      { programAddress: address(SOLANA_PROGRAMS.compute), data: price },
    ])
  );
  expect(
    await backend.prepare(fixture.input).then(() => null, String)
  ).toContain("trade.gas");
});

test("only the approved owner signature over identical message bytes is accepted", async () => {
  const fixture = await jupiterFixture();
  const { backend, trade } = await preparedTrade(fixture);
  const [step] = trade.steps;
  if (step === undefined) {
    throw new Error("Missing fixture step");
  }
  const signed = await backend
    .submission({ kind: "solana", signer: fixture.signer })
    .sign(trade, step);
  const bytes = Buffer.from(signed.payload, "base64");
  bytes[1] = ((bytes[1] ?? 0) + 1) % 256;
  expect(
    await verifySignedSolanaTrade(
      fixture.input.wallet,
      fixture.transaction(),
      bytes.toString("base64")
    ).then(() => null, String)
  ).toContain("signature is invalid");
  const changed = Buffer.from(fixture.routeData);
  changed.writeBigUInt64LE(101n, 16);
  expect(
    await verifySignedSolanaTrade(
      fixture.input.wallet,
      fixture.build(changed),
      signed.payload
    ).then(() => null, String)
  ).toContain("differs");
  expect(() =>
    decodeSolanaTrade(fixture.transaction(), fixture.input.tokenIn)
  ).toThrow("only signer");
});

test("a lookup account controlled by another program cannot supply execution addresses", async () => {
  const fixture = await jupiterFixture();
  const { compiled } = decodeSolanaTrade(
    fixture.transaction(),
    fixture.input.wallet
  );
  const message = getCompiledTransactionMessageEncoder().encode({
    ...compiled,
    addressTableLookups: [
      {
        lookupTableAddress: address(fixture.input.tokenIn),
        writableIndexes: [],
        readonlyIndexes: [0],
      },
    ],
  });
  const serialized = Buffer.concat([
    Buffer.from([1]),
    Buffer.alloc(64),
    Buffer.from(message),
  ]).toString("base64");
  expect(
    await resolveSolanaTrade(
      fixture.rpc,
      serialized,
      fixture.input.wallet
    ).then(() => null, String)
  ).toContain("wrong owner");
});

test("an extra native transfer is rejected even when it uses a known program", async () => {
  const fixture = await jupiterFixture();
  const data = Buffer.alloc(12);
  data.writeUInt32LE(2, 0);
  data.writeBigUInt64LE(1n, 4);
  fixture.setTransaction(
    fixture.build(fixture.routeData, fixture.routeAccounts, [
      {
        programAddress: address(SOLANA_PROGRAMS.system),
        data,
        accounts: [
          {
            address: fixture.signer.address,
            role: AccountRole.WRITABLE_SIGNER,
          },
          {
            address: address(fixture.input.tokenIn),
            role: AccountRole.WRITABLE,
          },
        ],
      },
    ])
  );
  const backend = jupiterExecution({
    rpc: fixture.rpc,
    jupiter: fixture.jupiter,
    now: () => 100,
  });
  expect(
    await backend.prepare(fixture.input).then(() => null, String)
  ).toContain("trade.sequence");
});

test.each(["input", "output"] as const)(
  "native SOL as %s reserves rent and reconciles wrapping without counting principal as fees",
  async (native) => {
    const fixture = await jupiterFixture(native);
    const { backend, trade } = await preparedTrade(fixture);
    const [step] = trade.steps;
    if (step === undefined || step.payload.kind !== "solana") {
      throw new Error("Missing Solana step");
    }
    expect(step.payload.nativeFeeLimit).toBe("2005000");
    const store = memoryStore().trading;
    const owner = userId(`did:privy:native-${native}`);
    await store.transact(owner, (book) => {
      book.trades.set(trade.id, trade);
    });
    const balances = await backend.balances(fixture.input);
    const settled = await executeTradeStep(
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
    expect(settled.status).toBe("completed");
    expect(settled.actualOutput).toBe("200");
    expect(settled.steps[0]?.actualNativeFee).toBe("5000");
    if (native === "input") {
      expect(settled.reservations).toEqual([
        { asset: "native", units: "2005100" },
      ]);
    }
  }
);
