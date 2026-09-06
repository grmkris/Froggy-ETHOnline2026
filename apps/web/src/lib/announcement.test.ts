import { describe, expect, it } from "bun:test";

import {
  MandateId,
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Mandate, Receipt } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";

import { announcementFor } from "./announcement";

const refused = (at: number): Receipt => ({
  at,
  decision: { _tag: "deny", code: "frozen", message: "The wallet is frozen" },
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
    idempotencyKey: "k",
    payee: { id: "0.0.1", label: "the oracle", provenance: "server" },
    purpose: "a snapshot",
    usdMicros: usdMicros(4000),
  },
  quote: { asOf: at, source: "test", usdMicrosPerUnit: usdMicros(1) },
  runId: RunId.generate(),
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: false,
});

const asking: ApprovalRequest = {
  amountLabel: "$1.50",
  detail: "Pay the oracle?",
  expiresAt: 10,
  id: "req-1",
  options: [],
  payeeLabel: "the oracle",
  purpose: "a snapshot",
  title: "Approve $1.50 to the oracle",
};

const plain: Mandate = {
  createdAt: 1,
  id: MandateId.generate(),
  rules: [],
  sessionId: SessionId.generate(),
};

describe("announcementFor", () => {
  it("says nothing when nothing needs saying", () => {
    expect(
      announcementFor({ approvals: [], mandate: null, receipts: [], since: 0 })
    ).toBe("");
  });

  it("puts an open approval first", () => {
    expect(
      announcementFor({
        approvals: [asking],
        mandate: plain,
        receipts: [refused(5)],
        since: 0,
      })
    ).toBe("Your call: Approve $1.50 to the oracle");
  });

  it("says a refusal the person watched land, not one from before they arrived", () => {
    expect(
      announcementFor({
        approvals: [],
        mandate: null,
        receipts: [refused(5)],
        since: 0,
      })
    ).toBe("Refused: The wallet is frozen");
    expect(
      announcementFor({
        approvals: [],
        mandate: null,
        receipts: [refused(5)],
        since: 9,
      })
    ).toBe("");
  });
});
