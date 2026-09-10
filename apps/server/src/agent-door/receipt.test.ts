/**
 * The success path of the receipt, which had no test and got the important
 * case wrong.
 *
 * "Settled. X moved from A to B" is the most judge-facing sentence this door
 * emits — it is quoted verbatim in the README and in the evidence file — and
 * it is the whole argument for the audit trail being checkable rather than
 * claimed. Every assertion here is about that sentence naming the payment and
 * not one of the fee legs sitting beside it in the same transaction.
 */

import { describe, expect, it } from "bun:test";

import { describeSettlement } from "./receipt";
import type { Settlement } from "./receipt";

const WHEN = "1788733693.213156813";
const TRANSACTION = "0.0.10571514@1788733693.213156813";

const settled = (transfers: Settlement["transfers"]): Settlement => ({
  note: null,
  status: "success",
  transactionId: TRANSACTION,
  transfers,
  when: WHEN,
});

/** The facilitator pays the network fee, so these legs are in every settlement. */
const FEES = [
  { accountId: "0.0.10571514", amount: -110_000n, asset: "0.0.0" },
  { accountId: "0.0.98", amount: 90_000n, asset: "0.0.0" },
  { accountId: "0.0.3", amount: 20_000n, asset: "0.0.0" },
] as const;

describe("describeSettlement, in HBAR", () => {
  it("names the payment, the payer and the payee", () => {
    const said = describeSettlement(
      settled([
        ...FEES,
        { accountId: "0.0.12345", amount: -5_000_000n, asset: "0.0.0" },
        { accountId: "0.0.10847556", amount: 5_000_000n, asset: "0.0.0" },
      ]),
      "hedera:mainnet"
    );
    expect(said).toContain(
      "Settled. 0.05 HBAR moved from 0.0.12345 to 0.0.10847556"
    );
    expect(said).toContain("2026-09-06T22:28:13.000Z");
  });

  it("does not report a fee leg as the payment when the price is under the fee", () => {
    // A cent-scale price is the point of the rail. Picking the largest leg
    // outright would name Hedera's fee account as the seller here.
    const said = describeSettlement(
      settled([
        ...FEES,
        { accountId: "0.0.12345", amount: -1000n, asset: "0.0.0" },
        { accountId: "0.0.10847556", amount: 1000n, asset: "0.0.0" },
      ]),
      "hedera:mainnet"
    );
    expect(said).toContain("from 0.0.12345 to 0.0.10847556");
    expect(said).not.toContain("0.0.98");
  });
});

describe("describeSettlement, in an HTS token", () => {
  it("names the token payment rather than the HBAR fee beside it", () => {
    const said = describeSettlement(
      settled([
        ...FEES,
        { accountId: "0.0.12345", amount: -50_000n, asset: "0.0.456858" },
        { accountId: "0.0.10847556", amount: 50_000n, asset: "0.0.456858" },
      ]),
      "hedera:mainnet"
    );
    expect(said).toContain(
      "Settled. 0.05 USDC moved from 0.0.12345 to 0.0.10847556"
    );
    expect(said).not.toContain("HBAR");
  });
});

describe("describeSettlement, on the note", () => {
  const withNote = (kind: string | undefined): string =>
    describeSettlement(
      {
        ...settled([
          { accountId: "0.0.12345", amount: -5_000_000n, asset: "0.0.0" },
          { accountId: "0.0.10847556", amount: 5_000_000n, asset: "0.0.0" },
        ]),
        note: {
          consensusTimestamp: WHEN,
          note: { kind, ref: "sal_1", transactionId: TRANSACTION },
          payerAccountId: "0.0.10847552",
          sequenceNumber: 1,
          topicId: "0.0.10847557",
        },
      },
      "hedera:mainnet"
    );

  it("reads the two kinds this repository writes", () => {
    expect(withNote("sold")).toContain("a sale by the seller, reference sal_1");
    expect(withNote("paid")).toContain(
      "a purchase by the buyer, reference sal_1"
    );
  });

  it("quotes a kind it does not know rather than rounding it to one it does", () => {
    // Anyone may write to the topic. Reporting a stranger's unknown claim as
    // one of ours is the exact failure this view exists to make impossible.
    const said = withNote("refunded");
    expect(said).toContain('a kind this door does not recognise, "refunded"');
    expect(said).not.toContain("a purchase by the buyer");
  });

  it("always says the topic has no submit key", () => {
    expect(withNote("sold")).toContain("anyone may write to it");
  });
});

describe("describeSettlement, when no topic was searched", () => {
  it("says nobody looked, rather than that nothing was found", () => {
    const said = describeSettlement(
      settled([
        { accountId: "0.0.12345", amount: -5_000_000n, asset: "0.0.0" },
        { accountId: "0.0.10847556", amount: 5_000_000n, asset: "0.0.0" },
      ]),
      "hedera:mainnet",
      { topicKnown: false, why: "the seller publishes no consensus topic" }
    );
    expect(said).toContain("No consensus topic was searched, because");
    expect(said).not.toContain("No matching note was found");
  });
});

describe("describeSettlement, when the ledger has never heard of it", () => {
  it("does not call an absence a failure", () => {
    const said = describeSettlement(
      {
        note: null,
        status: "unknown",
        transactionId: TRANSACTION,
        transfers: [],
        when: null,
      },
      "hedera:mainnet"
    );
    expect(said).toContain("does not know this transaction");
    expect(said).toContain("not the same as saying it failed");
  });
});
