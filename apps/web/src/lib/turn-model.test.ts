import { describe, expect, it } from "bun:test";

import {
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt } from "@froggy/domain";

import type { FroggyMessage } from "./stream-model";
import { matchReceipts } from "./turn-model";

const receipt = (at: number, toolCallId?: string): Receipt => {
  const base: Receipt = {
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
        units: "5000000",
      },
      idempotencyKey: `k-${at}`,
      payee: { id: "0.0.1", label: "the oracle", provenance: "server" },
      purpose: "a snapshot",
      usdMicros: usdMicros(4000),
    },
    quote: { asOf: at, source: "test", usdMicrosPerUnit: usdMicros(80_000) },
    runId: RunId.generate(),
    sessionId: SessionId.generate(),
    spendId: SpendId.generate(),
    stubbed: false,
  };
  return toolCallId === undefined ? base : { ...base, toolCallId };
};

const tool = (
  type: `tool-${string}`,
  toolCallId: string
): FroggyMessage["parts"][number] => ({
  input: {},
  output: "ok",
  state: "output-available",
  toolCallId,
  type,
});

const message: FroggyMessage = {
  id: "a1",
  parts: [
    tool("tool-browser_navigate", "b1"),
    tool("tool-x402_fetch", "c1"),
    tool("tool-wallet_send", "c2"),
  ],
  role: "assistant",
};

describe("matchReceipts", () => {
  it("files a receipt under the call it names", () => {
    const named = receipt(10, "c2");
    const { byCall, unclaimed } = matchReceipts(message, [named]);
    expect(byCall.get("c2")).toBe(named);
    expect(byCall.has("c1")).toBe(false);
    expect(unclaimed).toEqual([]);
  });

  it("gives an unnamed receipt to the first bare money call, in order", () => {
    const older = receipt(5);
    const named = receipt(10, "c1");
    const { byCall, unclaimed } = matchReceipts(message, [named, older]);
    // c1 is taken by name, so the unnamed one lands on c2, never on the browser call.
    expect(byCall.get("c1")).toBe(named);
    expect(byCall.get("c2")).toBe(older);
    expect(byCall.has("b1")).toBe(false);
    expect(unclaimed).toEqual([]);
  });

  it("leaves what no card claims under the turn, oldest first", () => {
    const elsewhere = receipt(20, "zz");
    const spare = receipt(1);
    const extra = receipt(2);
    const third = receipt(3);
    const { byCall, unclaimed } = matchReceipts(message, [
      third,
      elsewhere,
      spare,
      extra,
    ]);
    expect([...byCall.keys()].toSorted()).toEqual(["c1", "c2"]);
    expect(unclaimed.map((entry) => entry.at)).toEqual([3, 20]);
  });
});
