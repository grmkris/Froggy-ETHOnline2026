import { describe, expect, it } from "bun:test";

import { creditUnits, UserId } from "@froggy/domain";
import { HederaAccountError } from "@froggy/payments";
import type { HederaHost, RateSource } from "@froggy/payments";
import type { FundingSubmission } from "@froggy/wallet";
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
  readonly funded: { readonly evmAddress: string; readonly tinybars: number }[];
  readonly opened: number[];
  readonly transfers: {
    readonly accountId: string;
    readonly tinybars: number;
  }[];
}

const fakeHost = (): FakeHost => {
  const opened: number[] = [];
  const funded: { evmAddress: string; tinybars: number }[] = [];
  const transfers: { accountId: string; tinybars: number }[] = [];
  let next = 100;
  return {
    accountId: "0.0.1",
    close: () => {
      // Nothing to release.
    },
    fundAlias: async (evmAddress, tinybars) => {
      await Promise.resolve();
      funded.push({ evmAddress, tinybars });
      return { transactionId: `0.0.1@3.${funded.length}` };
    },
    funded,
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
      keys: null,
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
    const sealed =
      saved?.custody.kind === "sealed" ? saved.custody.keyCiphertext : "";
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("abab");
    expect(await accounts.lookup(ALICE)).toBe("0.0.101");
    // A later payer comes from the store, not from another opening.
    const again = await accounts.payerFor(ALICE, 0);
    expect(again.accountId).toBe("0.0.101");
    expect(host.opened).toHaveLength(1);
  });

  it("opens the account with the first top-up, then moves later ones into it at the rate", async () => {
    const host = fakeHost();
    const accounts = createHederaAccounts({
      host,
      keys: null,
      keystore: aesGcmKeystore(KEK),
      rates: rates(80_000),
      store: memoryStore(),
    });
    // $1 opens the account: 12.5 HBAR plus the fee margin, by the creation.
    expect(await accounts.fund(ALICE, 1_000_000)).toEqual({
      opened: true,
      tinybars: 1_250_000_000 + 10_000_000,
      transactionId: "0.0.1@1.101",
    });
    expect(host.opened).toEqual([1_260_000_000]);
    expect(await accounts.fund(ALICE, 1_000_000)).toEqual({
      opened: false,
      tinybars: 1_250_000_000,
      transactionId: "0.0.1@2.1",
    });
    expect(host.transfers).toEqual([
      { accountId: "0.0.101", tinybars: 1_250_000_000 },
    ]);
  });

  it("refuses to pay for a person with no account and nothing to open one with", async () => {
    const host = fakeHost();
    const accounts = createHederaAccounts({
      host,
      keys: null,
      keystore: aesGcmKeystore(KEK),
      rates: rates(80_000),
      store: memoryStore(),
    });
    const failure = await failureOf(accounts.payerFor(ALICE, 0));
    expect(failure).toBeInstanceOf(HederaAccountError);
    expect(failure?.message).toContain("first top-up");
    expect(host.opened).toEqual([]);
  });

  it("refuses to open an account without a rate, and opens none", async () => {
    const host = fakeHost();
    const accounts = createHederaAccounts({
      host,
      keys: null,
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

describe("createHederaAccounts with Privy holding the keys", () => {
  // The cosmos wallet from spike 1.8: its alias is 0x451718d7197e664d8370d139fcb87abaeb303531.
  const PUBLIC_KEY =
    "0215fa722a20730257c669c8c3e8fd4ea0ea62b82dc6309a41cccf00a42a6a5f20";

  it("creates the key in the person's name, funds its alias and remembers who holds it", async () => {
    const host = fakeHost();
    const store = memoryStore();
    const created: string[] = [];
    const accounts = createHederaAccounts({
      host,
      keys: {
        create: async (ownerDid) => {
          await Promise.resolve();
          created.push(ownerDid);
          return { publicKey: PUBLIC_KEY, walletId: "wallet-1" };
        },
        signBytes: async () => await Promise.resolve(new Uint8Array(64)),
      },
      keystore: aesGcmKeystore(KEK),
      rates: rates(80_000),
      resolve: async (evmAddress) =>
        await Promise.resolve(
          evmAddress === "0x451718d7197e664d8370d139fcb87abaeb303531"
            ? "0.0.10396162"
            : null
        ),
      resolveWaitMs: 1,
      store,
    });
    const payer = await accounts.payerFor(ALICE, 500_000);
    expect(created).toEqual([ALICE]);
    expect(payer.accountId).toBe("0.0.10396162");
    expect(host.funded).toEqual([
      {
        evmAddress: "0x451718d7197e664d8370d139fcb87abaeb303531",
        tinybars: 625_000_000 + 10_000_000,
      },
    ]);
    // Nothing was generated or sealed on Froggy's side.
    expect(host.opened).toEqual([]);
    expect(await store.hedera.load(ALICE)).toEqual({
      accountId: "0.0.10396162",
      custody: { kind: "privy", publicKey: PUBLIC_KEY, walletId: "wallet-1" },
    });
  });

  it("gives up with the alias and the transfer when the mirror never shows the account", async () => {
    const host = fakeHost();
    const accounts = createHederaAccounts({
      host,
      keys: {
        create: async () =>
          await Promise.resolve({
            publicKey: PUBLIC_KEY,
            walletId: "wallet-1",
          }),
        signBytes: async () => await Promise.resolve(new Uint8Array(64)),
      },
      keystore: aesGcmKeystore(KEK),
      rates: rates(80_000),
      resolve: async () => await Promise.resolve(null),
      resolveAttempts: 2,
      resolveWaitMs: 1,
      store: memoryStore(),
    });
    const failure = await failureOf(accounts.payerFor(ALICE, 500_000));
    expect(failure).toBeInstanceOf(HederaAccountError);
    expect(failure?.message).toContain(
      "0x451718d7197e664d8370d139fcb87abaeb303531"
    );
  });
});

describe("funding recovery", () => {
  it("recovers sealed custody after account creation succeeds but its response is lost", async () => {
    const store = memoryStore();
    const keystore = aesGcmKeystore(KEK);
    const prepared: FundingSubmission[] = [];
    const host: HederaHost = {
      ...fakeHost(),
      open: async (_tinybars, beforeBroadcast) => {
        await beforeBroadcast?.("0.0.1@1.101", `0x${"ab".repeat(32)}`);
        throw new Error("receipt timed out");
      },
    };
    const options = { host, keys: null, keystore, rates: rates(80_000), store };
    const failure = await failureOf(
      createHederaAccounts(options).fund(ALICE, 500_000, async (submission) => {
        prepared.push(submission);
        await Promise.resolve();
      })
    );
    expect(failure?.message).toContain("receipt timed out");
    expect(await store.hedera.load(ALICE)).toBeNull();
    const [submission] = prepared;
    if (submission === undefined || submission.custody?.kind !== "sealed") {
      throw new Error("Missing persisted sealed custody");
    }
    expect(submission.custody.keyCiphertext).not.toContain("abab");
    const restarted = createHederaAccounts({
      ...options,
      transaction: async () =>
        await Promise.resolve({
          consensusTimestamp: null,
          entityId: "0.0.101",
          status: "success",
          transfers: [],
        }),
    });
    expect(await restarted.reconcile(ALICE, submission)).toBe("success");
    const saved = await store.hedera.load(ALICE);
    expect(saved?.accountId).toBe("0.0.101");
    expect(saved?.custody).toEqual(submission.custody);
    expect(await restarted.lookup(ALICE)).toBe("0.0.101");
  });
});

const RECEIVING_PUBLIC_KEY =
  "0215fa722a20730257c669c8c3e8fd4ea0ea62b82dc6309a41cccf00a42a6a5f20";
const RECEIVING_ALIAS = "0x451718d7197e664d8370d139fcb87abaeb303531";
interface ReceivingState {
  accountId: string | null;
  created: number;
  signatures: number;
}
const receivingFixture = () => {
  const state: ReceivingState = { accountId: null, created: 0, signatures: 0 };
  const host = fakeHost();
  const store = memoryStore();
  const options = {
    host,
    store,
    keystore: aesGcmKeystore(KEK),
    rates: rates(null),
    keys: {
      create: async () => {
        await Promise.resolve();
        state.created += 1;
        return {
          publicKey: RECEIVING_PUBLIC_KEY,
          walletId: `receiving-${state.created}`,
        };
      },
      signBytes: async () => {
        await Promise.resolve();
        state.signatures += 1;
        return new Uint8Array(64);
      },
    },
    resolve: async () => await Promise.resolve(state.accountId),
  };
  return { state, host, store, options };
};

const expectNoReceivingPayment = (
  fixture: ReturnType<typeof receivingFixture>
) => {
  expect(fixture.host.opened).toEqual([]);
  expect(fixture.host.funded).toEqual([]);
  expect(fixture.host.transfers).toEqual([]);
  expect(fixture.state.signatures).toBe(0);
};

describe("HBAR receiving without a platform-funded account", () => {
  it("persists one receiving key before exposing its alias, without rates, payment or credits", async () => {
    const fixture = receivingFixture();
    const accounts = createHederaAccounts(fixture.options);
    const [first, second] = await Promise.all([
      accounts.prepare(ALICE),
      accounts.prepare(ALICE),
    ]);
    expect(first).toEqual({
      network: "hedera:testnet",
      accountId: null,
      alias: RECEIVING_ALIAS,
      stubbed: false,
    });
    expect(second).toEqual(first);
    expect(fixture.state.created).toBe(1);
    expect(await fixture.store.hedera.load(ALICE)).toBeNull();
    const pending = await fixture.store.hedera.loadReceiving(ALICE);
    expect(pending?.custody).toEqual({
      kind: "privy",
      publicKey: RECEIVING_PUBLIC_KEY,
      walletId: "receiving-1",
    });
    const balance = await fixture.store.credits.summary(ALICE);
    expect(balance.availableUnits).toBe(creditUnits(0));
    expectNoReceivingPayment(fixture);
  });

  it("reuses the persisted key after restart and pays only after external HBAR funding resolves its numeric account", async () => {
    const fixture = receivingFixture();
    await createHederaAccounts(fixture.options).prepare(ALICE);
    const restarted = createHederaAccounts(fixture.options);
    const restored = await restarted.prepare(ALICE);
    expect(restored.alias).toBe(RECEIVING_ALIAS);
    const refused = await failureOf(restarted.payerFor(ALICE, 0));
    expect(refused?.message).toContain("Transfer HBAR");
    fixture.state.accountId = "0.0.10396162";
    const payer = await restarted.payerFor(ALICE, 0);
    expect(payer.accountId).toBe("0.0.10396162");
    expect(payer.mode).toBe("live");
    const saved = await fixture.store.hedera.load(ALICE);
    expect(saved?.accountId).toBe("0.0.10396162");
    expect(fixture.state.created).toBe(1);
    expectNoReceivingPayment(fixture);
  });

  it("returns the canonical persisted custody when independent instances prepare at once", async () => {
    const fixture = receivingFixture();
    await Promise.all([
      createHederaAccounts(fixture.options).prepare(ALICE),
      createHederaAccounts(fixture.options).prepare(ALICE),
    ]);
    const saved = await fixture.store.hedera.loadReceiving(ALICE);
    expect(saved?.custody).toEqual({
      kind: "privy",
      publicKey: RECEIVING_PUBLIC_KEY,
      walletId: "receiving-1",
    });
    const next = await createHederaAccounts(fixture.options).prepare(ALICE);
    expect(next.alias).toBe(RECEIVING_ALIAS);
    expect(fixture.state.created).toBe(2);
    expectNoReceivingPayment(fixture);
  });

  it("does not expose a receiving alias if its custody cannot be saved", async () => {
    const fixture = receivingFixture();
    const accounts = createHederaAccounts({
      ...fixture.options,
      store: {
        ...fixture.store,
        hedera: {
          ...fixture.store.hedera,
          prepareReceiving: async () => {
            await Promise.resolve();
            throw new Error("storage unavailable");
          },
        },
      },
    });
    const refused = await failureOf(accounts.prepare(ALICE));
    expect(refused?.message).toContain("storage unavailable");
    expectNoReceivingPayment(fixture);
  });

  it("refuses receiving preparation without Privy keys and never creates a treasury-funded fallback", async () => {
    const fixture = receivingFixture();
    const accounts = createHederaAccounts({ ...fixture.options, keys: null });
    const refused = await failureOf(accounts.prepare(ALICE));
    expect(refused).toBeInstanceOf(HederaAccountError);
    expect(refused?.message).toContain("not configured");
    expect(fixture.state.created).toBe(0);
    expectNoReceivingPayment(fixture);
  });

  it("reuses prepared custody if a separately authorized legacy conversion later funds HBAR", async () => {
    const fixture = receivingFixture();
    await createHederaAccounts(fixture.options).prepare(ALICE);
    fixture.state.accountId = "0.0.10396162";
    const accounts = createHederaAccounts({
      ...fixture.options,
      rates: rates(80_000),
    });
    await accounts.fund(ALICE, 500_000);
    expect(fixture.state.created).toBe(1);
    expect(fixture.host.funded).toEqual([
      { evmAddress: RECEIVING_ALIAS, tinybars: 635_000_000 },
    ]);
    const saved = await fixture.store.hedera.load(ALICE);
    expect(saved?.custody).toEqual({
      kind: "privy",
      publicKey: RECEIVING_PUBLIC_KEY,
      walletId: "receiving-1",
    });
  });
});
