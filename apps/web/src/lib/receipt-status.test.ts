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

import {
  receiptFollowUp,
  receiptHeadline,
  receiptStatus,
} from "./receipt-status";

const receipt = (patch: Partial<Receipt> = {}): Receipt => ({
  at: 1,
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
    idempotencyKey: "presentation",
    payee: { id: "0.0.1", label: "Oracle", provenance: "server" },
    purpose: "a snapshot",
    usdMicros: usdMicros(4000),
  },
  quote: { asOf: 1, source: "test", usdMicrosPerUnit: usdMicros(80_000) },
  runId: RunId.generate(),
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: false,
  ...patch,
});

describe("receipt settlement copy", () => {
  it("says confirmed only after a real settlement", () => {
    expect(receiptStatus(receipt())).toBe("Allowed, not settled");
    const settled = receipt({
      settlement: {
        network: "hedera:testnet",
        transactionId: "test-transaction",
      },
    });
    expect(receiptStatus(settled)).toBe("Confirmed");
    expect(receiptHeadline(settled)).toBe("Confirmed Oracle");
    expect(receiptFollowUp(settled)).toBeNull();
  });

  it("does not turn an uncertain failure into definite non-payment", () => {
    const uncertain = receipt({ failure: "Settlement timed out" });
    expect(receiptStatus(uncertain)).toBe("Outcome not yet known");
    expect(receiptHeadline(uncertain)).toBe("Outcome not yet known.");
    expect(receiptFollowUp(uncertain)).toContain("will not try again");
    expect(receiptHeadline(uncertain)).not.toMatch(/paid|failed/iu);
  });

  it("uses the full stub sentence and never Simulated alone", () => {
    const stubbed = receipt({
      settlement: {
        network: "hedera:testnet",
        transactionId: "stub-transaction",
      },
      stubbed: true,
    });
    expect(receiptStatus(stubbed)).toBe("Stubbed");
    expect(receiptHeadline(stubbed)).toBe(
      "Nothing was paid. This receipt exists so a demo cannot be mistaken for a purchase."
    );
    expect(receiptHeadline(stubbed)).not.toBe("Simulated");
    expect(receiptFollowUp(stubbed)).toBeNull();
  });

  it("says the price-changed line from the deny code", () => {
    const changed = receipt({
      decision: {
        _tag: "deny",
        code: "price_changed",
        message: "The quoted amount is no longer what the seller asks.",
        ruleId: RuleId.generate(),
      },
    });
    expect(receiptStatus(changed)).toBe("Price changed");
    expect(receiptHeadline(changed)).toBe(
      "Your approval does not cover this. Nothing was paid."
    );
  });

  it("keeps the refused reason from the decision", () => {
    const refused = receipt({
      decision: {
        _tag: "deny",
        code: "payee_not_allowed",
        message: "Oracle is not on the list",
        ruleId: RuleId.generate(),
      },
    });
    expect(receiptStatus(refused)).toBe("Refused");
    expect(receiptHeadline(refused)).toBe("Oracle is not on the list");
    expect(receiptFollowUp(refused)).toBeNull();
  });
});
