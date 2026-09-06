import { describe, expect, it } from "bun:test";

import {
  ReceiptId,
  RuleId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt } from "@froggy/domain";

import { layerOf } from "./denial";

const base = (): Receipt => ({
  at: 1,
  decision: { _tag: "allow", satisfied: [] },
  id: ReceiptId.generate(),
  intent: {
    amount: {
      asset: {
        decimals: 6,
        id: "0xusdc",
        network: "eip155:84532",
        symbol: "USDC",
      },
      units: "500000",
    },
    idempotencyKey: "k",
    payee: { id: "0xdead", label: "0xdead", provenance: "user" },
    purpose: "a test",
    usdMicros: usdMicros(500_000),
  },
  quote: { asOf: 1, source: "test", usdMicrosPerUnit: usdMicros(1) },
  runId: RunId.generate(),
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: false,
});

describe("layerOf", () => {
  it("names the mandate, and the rule in plain words", () => {
    const layer = layerOf({
      ...base(),
      decision: {
        _tag: "deny",
        code: "payee_not_allowed",
        message: "0xdead is not on the list",
        ruleId: RuleId.generate(),
      },
    });
    expect(layer?.who).toBe("The mandate refused, before any key was touched.");
    expect(layer?.why).toBe("That payee is not on the list.");
  });

  it("credits the signer when the mandate allowed and Privy said no", () => {
    const layer = layerOf({
      ...base(),
      failure:
        "Privy refused under policy rk6q: RPC request denied due to policy violation",
    });
    expect(layer?.who).toContain("the signer refused");
    expect(layer?.why).toContain("Privy");
  });

  it("calls a chain fault not paid, not refused", () => {
    expect(
      layerOf({ ...base(), failure: "the transfer reverted on chain" })?.who
    ).toBe("The mandate allowed; the payment did not go through.");
  });

  it("has nothing to say about a settled payment", () => {
    expect(
      layerOf({
        ...base(),
        settlement: { network: "eip155:84532", transactionId: "0xabc" },
      })
    ).toBeNull();
  });
});
