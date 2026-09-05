import { describe, expect, it } from "bun:test";

import {
  MandateId,
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  parQuote,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { Mandate, Receipt } from "@froggy/domain";

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

describe("readReceipts", () => {
  it("skips a document that no longer decodes rather than failing the batch", () => {
    const good = receipt(NOW);
    const read = readReceipts([good, { not: "a receipt" }, null]);
    expect(read.length).toBe(1);
    expect(read[0]?.id).toBe(good.id);
  });
});
