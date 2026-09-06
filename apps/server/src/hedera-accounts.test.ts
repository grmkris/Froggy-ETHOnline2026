import { describe, expect, it } from "bun:test";

import { UserId } from "@froggy/domain";
import { HederaAccountError } from "@froggy/payments";
import type { HederaHost, RateSource } from "@froggy/payments";
import { aesGcmKeystore, memoryStore } from "@froggy/wallet";

import { createHederaAccounts } from "./hedera-accounts";

const ALICE = UserId.make("did:privy:alice");

/** What a promise rejected with, or null when it resolved. */
const failureOf = async (work: Promise<unknown>): Promise<Error | null> => {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};
const KEK = Buffer.from(new Uint8Array(32).fill(3)).toString("base64");
/** One HBAR is eight cents, so $0.50 is 6.25 HBAR. */
const rates = (usdMicrosPerHbar: number | null): RateSource => ({
  current: () =>
    usdMicrosPerHbar === null
      ? null
      : { expiresAt: Number.MAX_SAFE_INTEGER, usdMicrosPerHbar },
  mode: "stub",
  refresh: async () => {
    await Promise.resolve();
    return true;
  },
});

interface FakeHost extends HederaHost {
  readonly opened: number[];
  readonly transfers: {
    readonly accountId: string;
    readonly tinybars: number;
  }[];
}

const fakeHost = (): FakeHost => {
  const opened: number[] = [];
  const transfers: { accountId: string; tinybars: number }[] = [];
  let next = 100;
  return {
    accountId: "0.0.1",
    close: () => {
      // Nothing to release.
    },
    network: "hedera:testnet",
    open: async (tinybars) => {
      await Promise.resolve();
      opened.push(tinybars);
      next += 1;
      return {
        accountId: `0.0.${next}`,
        privateKey: `0x${"ab".repeat(32)}`,
        transactionId: `0.0.1@1.${next}`,
      };
    },
    opened,
    transfer: async (accountId, tinybars) => {
      await Promise.resolve();
      transfers.push({ accountId, tinybars });
      return { transactionId: `0.0.1@2.${transfers.length}` };
    },
    transfers,
  };
};

describe("createHederaAccounts", () => {
  it("opens one account at first need, worth the pocket plus a fee margin, and reuses it", async () => {
    const host = fakeHost();
    const store = memoryStore();
    const accounts = createHederaAccounts({
      host,
      keystore: aesGcmKeystore(KEK),
      rates: rates(80_000),
      store,
    });
    const [first, second] = await Promise.all([
      accounts.payerFor(ALICE, 500_000),
      accounts.payerFor(ALICE, 500_000),
    ]);
    expect(first.accountId).toBe("0.0.101");
    expect(second.accountId).toBe("0.0.101");
    expect(first.mode).toBe("live");
    // 6.25 HBAR for the pocket, 0.1 HBAR margin for fees.
    expect(host.opened).toEqual([625_000_000 + 10_000_000]);
    const saved = await store.hedera.load(ALICE);
    expect(saved?.accountId).toBe("0.0.101");
    // Sealed, not the key.
    expect(saved?.keyCiphertext.startsWith("v1.")).toBe(true);
    expect(saved?.keyCiphertext).not.toContain("abab");
    expect(await accounts.lookup(ALICE)).toBe("0.0.101");
    // A later payer comes from the store, not from another opening.
    const again = await accounts.payerFor(ALICE, 0);
    expect(again.accountId).toBe("0.0.101");
    expect(host.opened).toHaveLength(1);
  });

  it("moves a top-up into the account at the rate, and nothing before there is one", async () => {
    const host = fakeHost();
    const accounts = createHederaAccounts({
      host,
      keystore: aesGcmKeystore(KEK),
      rates: rates(80_000),
      store: memoryStore(),
    });
    expect(await accounts.fund(ALICE, 1_000_000)).toBeNull();
    await accounts.payerFor(ALICE, 500_000);
    expect(await accounts.fund(ALICE, 1_000_000)).toEqual({
      tinybars: 1_250_000_000,
      transactionId: "0.0.1@2.1",
    });
    expect(host.transfers).toEqual([
      { accountId: "0.0.101", tinybars: 1_250_000_000 },
    ]);
  });

  it("refuses to open an account without a rate, and opens none", async () => {
    const host = fakeHost();
    const accounts = createHederaAccounts({
      host,
      keystore: aesGcmKeystore(KEK),
      rates: rates(null),
      store: memoryStore(),
    });
    expect(await failureOf(accounts.payerFor(ALICE, 500_000))).toBeInstanceOf(
      HederaAccountError
    );
    expect(host.opened).toEqual([]);
  });
});
