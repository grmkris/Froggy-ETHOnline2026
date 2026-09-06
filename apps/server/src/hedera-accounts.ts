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
import { HederaAccountError, liveHederaPayer } from "@froggy/payments";
import type { HederaHost, Payer, RateSource } from "@froggy/payments";
import type { HederaAccountRecord, Keystore, Store } from "@froggy/wallet";

interface HederaAccountsOptions {
  readonly host: HederaHost;
  readonly keystore: Keystore;
  readonly now?: () => number;
  readonly rates: RateSource;
  readonly store: Store;
}

interface Funded {
  readonly tinybars: number;
  readonly transactionId: string;
}

export interface HederaAccounts {
  /**
   * Moves HBAR worth `usdMicros` from the float into the person's account.
   * Null when they have no account yet: the opening balance covers the
   * pocket, top-ups included, when the account is opened.
   */
  readonly fund: (userId: UserId, usdMicros: number) => Promise<Funded | null>;
  readonly lookup: (userId: UserId) => Promise<string | null>;
  /**
   * The person's own payer. Opens their account with `openingUsdMicros` of
   * HBAR when they have none. Throws when it cannot, with the reason.
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

  const open = async (
    userId: UserId,
    usdMicros: number
  ): Promise<HederaAccountRecord> => {
    const tinybars = tinybarsFor(usdMicros) + FEE_MARGIN_TINYBARS;
    const created = await options.host.open(tinybars);
    const record: HederaAccountRecord = {
      accountId: created.accountId,
      keyCiphertext: await options.keystore.seal(created.privateKey),
    };
    await options.store.hedera.save(userId, record);
    return record;
  };

  const ensure = async (
    userId: UserId,
    usdMicros: number
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
        return await open(userId, usdMicros);
      } finally {
        opening.delete(userId);
      }
    })();
    opening.set(userId, pending);
    return await pending;
  };

  return {
    fund: async (userId, usdMicros) => {
      const record = await options.store.hedera.load(userId);
      if (record === null) {
        return null;
      }
      const tinybars = tinybarsFor(usdMicros);
      const { transactionId } = await options.host.transfer(
        record.accountId,
        tinybars
      );
      return { tinybars, transactionId };
    },
    lookup: async (userId) => {
      const record = await options.store.hedera.load(userId);
      return record?.accountId ?? null;
    },
    payerFor: async (userId, openingUsdMicros) => {
      const record = await ensure(userId, openingUsdMicros);
      return liveHederaPayer({
        accountId: record.accountId,
        network: options.host.network,
        privateKey: await options.keystore.open(record.keyCiphertext),
      });
    },
  };
};
