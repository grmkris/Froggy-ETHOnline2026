/**
 * One Hedera account per person, opened at first need.
 *
 * The host account is Froggy's float. When a person first pays on Hedera,
 * this module generates a key for them, has the host create an account for
 * it with an opening balance worth their pocket, seals the key under the
 * key-encryption key and remembers the account. From then on their own
 * account pays, so receipts and sellers' books name them; a top-up moves the
 * equivalent HBAR from the float into it at the mirror node's rate. The
 * ledger pocket stays the dollar view and the cap; the account is the money.
 *
 * Nothing here falls back to the host: a person whose account cannot be
 * opened is refused with the reason, because a payment from the float under
 * their name would be a receipt that lies about who paid.
 */

import type { UserId } from "@froggy/domain";
import {
  evmAliasOf,
  HederaAccountError,
  liveHederaPayer,
  lookupHederaTransactionDetails,
  resolveAlias,
  signerHederaPayer,
} from "@froggy/payments";
import type { HederaHost, Payer, RateSource } from "@froggy/payments";
import type {
  FundingSubmission,
  HederaAccountRecord,
  HederaKeys,
  Keystore,
  Store,
} from "@froggy/wallet";

interface HederaAccountsOptions {
  readonly host: HederaHost;
  /**
   * Privy holding the keys, when configured: the account is opened for a
   * key Privy created in the person's name. Null means Froggy generates and
   * seals the key itself.
   */
  readonly keys: HederaKeys | null;
  readonly keystore: Keystore;
  readonly now?: () => number;
  readonly rates: RateSource;
  /** The mirror node's answer for an alias; injected in tests. */
  readonly resolve?: (evmAddress: string) => Promise<string | null>;
  /** How long to wait for the mirror node to show an alias account. */
  readonly resolveAttempts?: number;
  /** Between attempts; shortened in tests. */
  readonly resolveWaitMs?: number;
  readonly store: Store;
  readonly transaction?: typeof lookupHederaTransactionDetails;
}

interface Funded {
  /** True when this top-up opened the account rather than adding to it. */
  readonly opened: boolean;
  readonly tinybars: number;
  readonly transactionId: string;
}

export interface HederaAccounts {
  /**
   * Moves HBAR worth `usdMicros` from the float into the person's account,
   * opening the account with that value when they have none yet: a person's
   * first top-up is what opens their account.
   */
  readonly fund: (
    userId: UserId,
    usdMicros: number,
    beforeBroadcast?: (submission: FundingSubmission) => Promise<void>
  ) => Promise<Funded>;
  readonly reconcile: (
    userId: UserId,
    submission: FundingSubmission
  ) => Promise<"success" | "failed" | "unknown">;
  readonly lookup: (userId: UserId) => Promise<string | null>;
  /**
   * The person's own payer. Opens their account with `openingUsdMicros` of
   * HBAR when they have none and there is something to open it with; a
   * person with no account and no credit is refused with the reason, since
   * an account opened empty could not pay anyway.
   */
  readonly payerFor: (
    userId: UserId,
    openingUsdMicros: number
  ) => Promise<Payer>;
}

/** The account's own transaction fees are on the house: a margin at opening. */
const FEE_MARGIN_TINYBARS = 10_000_000;
const TINYBARS_PER_HBAR = 100_000_000;

export const createHederaAccounts = (
  options: HederaAccountsOptions
): HederaAccounts => {
  const now = options.now ?? ((): number => Date.now());
  const resolve =
    options.resolve ??
    (async (evmAddress: string): Promise<string | null> =>
      await resolveAlias({ evmAddress, network: options.host.network }));
  const opening = new Map<UserId, Promise<HederaAccountRecord>>();

  const tinybarsFor = (usdMicros: number): number => {
    const rate = options.rates.current(now());
    if (rate === null) {
      throw new HederaAccountError(
        "No HBAR rate is known right now, so dollars cannot be turned into HBAR. Try again in a minute."
      );
    }
    return Math.ceil((usdMicros / rate.usdMicrosPerHbar) * TINYBARS_PER_HBAR);
  };

  const lastOpening = new Map<UserId, Funded>();

  /** Froggy's own key, sealed at rest: the account is created for it outright. */
  const openSealed = async (
    tinybars: number,
    beforeBroadcast?: (submission: FundingSubmission) => Promise<void>
  ): Promise<{ record: HederaAccountRecord; transactionId: string }> => {
    const created = await options.host.open(
      tinybars,
      async (transactionId, privateKey) => {
        await beforeBroadcast?.({
          transactionId,
          tinybars,
          accountId: null,
          alias: null,
          custody: {
            kind: "sealed",
            keyCiphertext: await options.keystore.seal(privateKey),
          },
        });
      }
    );
    return {
      record: {
        accountId: created.accountId,
        custody: {
          keyCiphertext: await options.keystore.seal(created.privateKey),
          kind: "sealed",
        },
      },
      transactionId: created.transactionId,
    };
  };

  /**
   * Privy's key: the account comes into being when the float pays its EVM
   * alias, and the mirror node says which id Hedera gave it a few seconds later.
   */
  const openWithPrivy = async (
    keys: HederaKeys,
    userId: UserId,
    tinybars: number,
    beforeBroadcast?: (submission: FundingSubmission) => Promise<void>
  ): Promise<{ record: HederaAccountRecord; transactionId: string }> => {
    const key = await keys.create(userId);
    const evmAddress = evmAliasOf(key.publicKey);
    const { transactionId } = await options.host.fundAlias(
      evmAddress,
      tinybars,
      async (preparedId) => {
        await beforeBroadcast?.({
          transactionId: preparedId,
          tinybars,
          accountId: null,
          alias: evmAddress,
          custody: {
            kind: "privy",
            walletId: key.walletId,
            publicKey: key.publicKey,
          },
        });
      }
    );
    const attempts = options.resolveAttempts ?? 15;
    let accountId: string | null = null;
    for (
      let attempt = 0;
      attempt < attempts && accountId === null;
      attempt += 1
    ) {
      // The mirror node lags consensus by a few seconds; nothing else can
      // answer, so waiting in sequence is the whole point.
      // eslint-disable-next-line no-await-in-loop
      accountId = await resolve(evmAddress);
      if (accountId === null) {
        // eslint-disable-next-line no-await-in-loop
        await Bun.sleep(options.resolveWaitMs ?? 2000);
      }
    }
    if (accountId === null) {
      throw new HederaAccountError(
        `The float paid the new account's alias ${evmAddress} (${transactionId}) but the mirror node has not shown the account yet. Try again in a moment.`
      );
    }
    return {
      record: {
        accountId,
        custody: {
          kind: "privy",
          publicKey: key.publicKey,
          walletId: key.walletId,
        },
      },
      transactionId,
    };
  };

  const open = async (
    userId: UserId,
    usdMicros: number,
    beforeBroadcast?: (submission: FundingSubmission) => Promise<void>
  ): Promise<HederaAccountRecord> => {
    const tinybars = tinybarsFor(usdMicros) + FEE_MARGIN_TINYBARS;
    const opened =
      options.keys === null
        ? await openSealed(tinybars, beforeBroadcast)
        : await openWithPrivy(options.keys, userId, tinybars, beforeBroadcast);
    await options.store.hedera.save(userId, opened.record);
    lastOpening.set(userId, {
      opened: true,
      tinybars,
      transactionId: opened.transactionId,
    });
    return opened.record;
  };

  /** The payer for whichever custody the record names. */
  const payerOf = async (record: HederaAccountRecord): Promise<Payer> => {
    const { custody } = record;
    if (custody.kind === "sealed") {
      return liveHederaPayer({
        accountId: record.accountId,
        network: options.host.network,
        privateKey: await options.keystore.open(custody.keyCiphertext),
      });
    }
    const { keys } = options;
    if (keys === null) {
      throw new HederaAccountError(
        "This account's key is held by Privy, but this deployment has no Privy Hedera keys configured."
      );
    }
    return signerHederaPayer({
      accountId: record.accountId,
      network: options.host.network,
      publicKey: custody.publicKey,
      signBytes: async (bytes) => await keys.signBytes(custody.walletId, bytes),
    });
  };

  const ensure = async (
    userId: UserId,
    usdMicros: number,
    beforeBroadcast?: (submission: FundingSubmission) => Promise<void>
  ): Promise<HederaAccountRecord> => {
    const existing = await options.store.hedera.load(userId);
    if (existing !== null) {
      return existing;
    }
    // Two first payments at once open one account, not two.
    const inFlight = opening.get(userId);
    if (inFlight !== undefined) {
      return await inFlight;
    }
    const pending = (async (): Promise<HederaAccountRecord> => {
      try {
        return await open(userId, usdMicros, beforeBroadcast);
      } finally {
        opening.delete(userId);
      }
    })();
    opening.set(userId, pending);
    return await pending;
  };

  return {
    fund: async (userId, usdMicros, beforeBroadcast) => {
      const record = await options.store.hedera.load(userId);
      if (record === null) {
        await ensure(userId, usdMicros, beforeBroadcast);
        const funded = lastOpening.get(userId);
        if (funded === undefined) {
          throw new HederaAccountError(
            "The account was opened by another request at the same moment; the top-up will show in it."
          );
        }
        return funded;
      }
      const tinybars = tinybarsFor(usdMicros);
      const { transactionId } = await options.host.transfer(
        record.accountId,
        tinybars,
        async (preparedId) => {
          await beforeBroadcast?.({
            transactionId: preparedId,
            tinybars,
            accountId: record.accountId,
            alias: null,
            custody: null,
          });
        }
      );
      return { opened: false, tinybars, transactionId };
    },
    reconcile: async (userId, submission) => {
      const result = await (
        options.transaction ?? lookupHederaTransactionDetails
      )({
        network: options.host.network,
        transactionId: submission.transactionId,
      });
      if (result.status !== "success") {
        return result.status;
      }
      if (submission.custody !== null) {
        const accountId =
          submission.alias === null
            ? result.entityId
            : await resolve(submission.alias);
        if (accountId === null) {
          return "unknown";
        }
        await options.store.hedera.save(userId, {
          accountId,
          custody: submission.custody,
        });
      }
      return "success";
    },
    lookup: async (userId) => {
      const record = await options.store.hedera.load(userId);
      return record?.accountId ?? null;
    },
    payerFor: async (userId, openingUsdMicros) => {
      const existing = await options.store.hedera.load(userId);
      if (existing === null && openingUsdMicros <= 0) {
        throw new HederaAccountError(
          "Your Hedera account opens with your first top-up, and there has been none yet."
        );
      }
      const record = existing ?? (await ensure(userId, openingUsdMicros));
      return await payerOf(record);
    },
  };
};
