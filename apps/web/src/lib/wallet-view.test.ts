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
import { showsHeld, walletAmounts } from "./wallet-view";

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
    expect(walletAmounts(null).totalUsdMicros).toBeNull();
    expect(walletAmounts(wallet)).toMatchObject({
      heldUsdMicros: 500_000,
      totalUsdMicros: null,
      usdcUsdMicros: null,
    });
    // No Hedera account yet: a known zero there, so USDC alone is the total.
    expect(
      walletAmounts({
        ...wallet,
        balances: { ...wallet.balances, usdcUnits: "0" },
      })
    ).toMatchObject({ hbarUsdMicros: 0, totalUsdMicros: 0, usdcUsdMicros: 0 });
    expect(
      walletAmounts({
        ...wallet,
        balances: { ...wallet.balances, usdcUnits: "1250000" },
      }).totalUsdMicros
    ).toBe(1_250_000);
  });
  it("adds HBAR at the rate once an account exists, and not before it is known", () => {
    const funded = {
      ...wallet,
      balances: {
        ...wallet.balances,
        hbarTinybars: "100000000",
        usdMicrosPerHbar: 80_000,
        usdcUnits: "1000000",
      },
      hederaAccountId: "0.0.42",
    };
    expect(walletAmounts(funded)).toMatchObject({
      hbarTinybars: 100_000_000,
      hbarUsdMicros: 80_000,
      totalUsdMicros: 1_080_000,
    });
    expect(
      walletAmounts({
        ...funded,
        balances: { ...funded.balances, hbarTinybars: null },
      }).totalUsdMicros
    ).toBeNull();
    // The server's total wins when it has one.
    expect(walletAmounts({ ...funded, totalUsdMicros: 5 }).totalUsdMicros).toBe(
      5
    );
  });
  it("shows held money only before an account exists", () => {
    expect(showsHeld(wallet)).toBe(true);
    expect(showsHeld({ ...wallet, pocketUsdMicros: 0 })).toBe(false);
    expect(showsHeld({ ...wallet, hederaAccountId: "0.0.42" })).toBe(false);
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
        }).usdcUsdMicros
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
