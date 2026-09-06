import { describe, expect, it } from "bun:test";

import {
  AgentTokenId,
  MandateId,
  ReceiptId,
  RunId,
  SaleId,
  SessionId,
  SpendId,
  TaskId,
  parQuote,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { Mandate, Receipt, Sale, Task } from "@froggy/domain";

import { memoryStore, readReceipts } from "./store";

const ALICE = userId("did:privy:store-test");
const NOW = 1_756_000_000_000;

const receipt = (at: number): Receipt => ({
  at,
  decision: { _tag: "allow", satisfied: [] },
  id: ReceiptId.generate(),
  intent: {
    amount: {
      asset: {
        decimals: 8,
        id: "0.0.0",
        network: "hedera:testnet",
        symbol: "HBAR",
      },
      units: "1",
    },
    idempotencyKey: `k-${at}`,
    payee: { id: "0.0.1", label: "oracle", provenance: "server" },
    purpose: "test",
    usdMicros: usdMicros(1),
  },
  quote: parQuote(at),
  runId: RunId.generate(),
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: true,
});

describe("memoryStore", () => {
  it("forgets a person entirely", async () => {
    const store = memoryStore();
    await store.receipts.append(ALICE, receipt(NOW));
    await store.frozen.save(ALICE, true);
    await store.pocket.adjust(ALICE, 500_000);
    await store.forget(ALICE);
    expect(await store.receipts.recent(ALICE, 10)).toEqual([]);
    expect(await store.frozen.load(ALICE)).toBe(false);
    expect(await store.mandates.load(ALICE)).toBeNull();
    // Null, not zero: the next session credits the starting allowance again.
    expect(await store.pocket.load(ALICE)).toBeNull();
  });

  it("keeps a pocket that never goes negative, and knows never from zero", async () => {
    const store = memoryStore();
    expect(await store.pocket.load(ALICE)).toBeNull();
    expect(await store.pocket.adjust(ALICE, 500_000)).toBe(500_000);
    expect(await store.pocket.adjust(ALICE, -200_000)).toBe(300_000);
    // A debit the balance cannot cover floors at zero rather than going into
    // debt; the policy is what stops it being asked for in the first place.
    expect(await store.pocket.adjust(ALICE, -900_000)).toBe(0);
    await store.pocket.adjust(ALICE, 100_000);
    await store.pocket.zero(ALICE);
    expect(await store.pocket.load(ALICE)).toBe(0);
  });

  it("returns receipts newest first, capped", async () => {
    const store = memoryStore();
    await store.receipts.append(ALICE, receipt(NOW));
    await store.receipts.append(ALICE, receipt(NOW + 1));
    await store.receipts.append(ALICE, receipt(NOW + 2));

    const recent = await store.receipts.recent(ALICE, 2);
    expect(recent.map((r) => r.at)).toEqual([NOW + 2, NOW + 1]);
  });

  it("round-trips a mandate and the frozen flag", async () => {
    const store = memoryStore();
    const mandate: Mandate = {
      createdAt: NOW,
      frozen: false,
      id: MandateId.generate(),
      rules: [],
      sessionId: SessionId.generate(),
    };
    expect(await store.mandates.load(ALICE)).toBeNull();
    expect(await store.frozen.load(ALICE)).toBe(false);

    await store.mandates.save(ALICE, mandate);
    await store.frozen.save(ALICE, true);

    expect(await store.mandates.load(ALICE)).toEqual(mandate);
    expect(await store.frozen.load(ALICE)).toBe(true);
  });
});

const sale = (paymentHash: string): Sale => ({
  amount: "5000000",
  asset: "0.0.0",
  at: NOW,
  deliveredAt: null,
  error: null,
  id: SaleId.generate(),
  network: "hedera:testnet",
  payer: "0.0.9700388",
  paymentHash,
  resource: "https://example.test/oracle/snapshot?symbol=USDC",
  result: null,
  status: "settled",
  stubbed: true,
  transactionId: "stub-not-a-real-hedera-transaction-1",
});

const task = (key: string | null): Task => ({
  agentTokenId: null,
  createdAt: NOW,
  error: null,
  id: TaskId.generate(),
  idempotencyKey: key,
  input: { symbol: "USDC" },
  kind: "brief",
  priceUsdMicros: usdMicros(50_000),
  result: null,
  runId: null,
  saleId: null,
  status: "quoted",
  updatedAt: NOW,
});

describe("memoryStore sales, tasks and agent tokens", () => {
  it("records a sale once per payment proof and tells only the first caller it created it", async () => {
    const store = memoryStore();
    const first = await store.sales.record(sale("proof-a"));
    const again = await store.sales.record({
      ...sale("proof-a"),
      id: SaleId.generate(),
    });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.sale.id).toBe(first.sale.id);
    await store.sales.update(first.sale.id, {
      deliveredAt: NOW + 1,
      result: { answer: "Euler 2.76%" },
      status: "delivered",
    });
    const byHash = await store.sales.byPaymentHash("proof-a");
    expect(byHash?.status).toBe("delivered");
    const byId = await store.sales.byId(first.sale.id);
    expect(byId?.result).toEqual({ answer: "Euler 2.76%" });
  });

  it("returns the same task for a repeated idempotency key, and none across people", async () => {
    const store = memoryStore();
    const created = task("hermes-1");
    await store.tasks.create(ALICE, created);
    const byKey = await store.tasks.byIdempotencyKey(ALICE, "hermes-1");
    expect(byKey?.id).toBe(created.id);
    expect(
      await store.tasks.byIdempotencyKey(userId("did:privy:bob"), "hermes-1")
    ).toBeNull();
    await store.tasks.update(ALICE, created.id, {
      status: "done",
      updatedAt: NOW + 5,
    });
    const updated = await store.tasks.byId(ALICE, created.id);
    expect(updated?.status).toBe("done");
    expect(
      await store.tasks.byId(userId("did:privy:bob"), created.id)
    ).toBeNull();
  });

  it("looks a token up by its hash until it is revoked, and never returns the hash", async () => {
    const store = memoryStore();
    const id = AgentTokenId.generate();
    await store.agents.create(ALICE, {
      createdAt: NOW,
      id,
      label: "Hermes",
      lastUsedAt: null,
      revokedAt: null,
      secretHash: "hash-1",
    });
    const found = await store.agents.lookup("hash-1");
    expect(found?.userId).toBe(ALICE);
    expect(found?.token).not.toHaveProperty("secretHash");
    await store.agents.touch(id, NOW + 2);
    const touched = await store.agents.list(ALICE);
    expect(touched[0]?.lastUsedAt).toBe(NOW + 2);
    await store.agents.revoke(ALICE, id);
    expect(await store.agents.lookup("hash-1")).toBeNull();
    const revoked = await store.agents.list(ALICE);
    expect(revoked[0]?.revokedAt).not.toBeNull();
  });

  it("forgets a person's tasks and tokens but keeps the seller's sales", async () => {
    const store = memoryStore();
    await store.tasks.create(ALICE, task(null));
    await store.agents.create(ALICE, {
      createdAt: NOW,
      id: AgentTokenId.generate(),
      label: "Hermes",
      lastUsedAt: null,
      revokedAt: null,
      secretHash: "hash-2",
    });
    const recorded = await store.sales.record(sale("proof-b"));
    await store.forget(ALICE);
    expect(await store.tasks.list(ALICE, 10)).toEqual([]);
    expect(await store.agents.list(ALICE)).toEqual([]);
    expect(await store.sales.byId(recorded.sale.id)).not.toBeNull();
  });
});

describe("readReceipts", () => {
  it("skips a document that no longer decodes rather than failing the batch", () => {
    const good = receipt(NOW);
    const read = readReceipts([good, { not: "a receipt" }, null]);
    expect(read.length).toBe(1);
    expect(read[0]?.id).toBe(good.id);
  });
});
