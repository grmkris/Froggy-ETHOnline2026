import { describe, expect, it } from "bun:test";

import {
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";

import { receiptHeadline, receiptStatus } from "./receipt-status";
import { walletAmounts } from "./wallet-view";

const wallet: WalletSummary = {
  address: null,
  agentNote: null,
  agentSigner: "absent",
  balanceLabel: "test",
  hederaAccountId: null,
  ledgerNote: null,
  balances: {
    evmNetwork: "eip155:84532",
    hederaNetwork: "hedera:testnet",
    hbarTinybars: null,
    usdMicrosPerHbar: null,
    usdcUnits: null,
  },
  pocketUsdMicros: 500_000,
  signerAddress: null,
  totalUsdMicros: null,
  windowSpentUsdMicros: 0,
};

describe("wallet amounts", () => {
  it("keeps unavailable funds distinct from zero and a complete total", () => {
    expect(walletAmounts(null)).toEqual({
      credit: null,
      funds: null,
      total: null,
    });
    expect(walletAmounts(wallet)).toEqual({
      credit: 500_000,
      funds: null,
      total: null,
    });
    expect(
      walletAmounts({
        ...wallet,
        balances: { ...wallet.balances, usdcUnits: "0" },
      })
    ).toEqual({ credit: 500_000, funds: 0, total: 500_000 });
    expect(
      walletAmounts({
        ...wallet,
        balances: { ...wallet.balances, usdcUnits: "1250000" },
      }).total
    ).toBe(1_750_000);
  });
  it("does not present invalid or unrepresentable chain values as money", () => {
    for (const usdcUnits of [
      "",
      " ",
      "NaN",
      "Infinity",
      "-1",
      "1e6",
      "9007199254740993",
    ]) {
      expect(
        walletAmounts({
          ...wallet,
          balances: { ...wallet.balances, usdcUnits },
        }).funds
      ).toBeNull();
    }
  });
});

const receipt: Receipt = {
  at: 1,
  id: ReceiptId.generate(),
  runId: RunId.generate(),
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: true,
  decision: { _tag: "allow", satisfied: [] },
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
};

describe("receipt presentation", () => {
  it("requires settlement before saying paid", () => {
    expect(receiptStatus(receipt)).toBe("Allowed, not settled");
    const settled = {
      ...receipt,
      settlement: {
        network: "hedera:testnet",
        transactionId: "test-transaction",
      },
    };
    expect(receiptStatus(settled)).toBe("Paid");
    expect(receiptHeadline(settled)).toBe("Paid Oracle");
  });
  it("does not turn an uncertain failure into definite non-payment", () => {
    expect(receiptStatus({ ...receipt, failure: "Settlement timed out" })).toBe(
      "Payment problem"
    );
    expect(
      receiptHeadline({ ...receipt, failure: "Settlement timed out" })
    ).toContain("Settlement timed out");
  });
});
