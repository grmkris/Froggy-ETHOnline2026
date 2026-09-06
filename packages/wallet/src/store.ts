/**
 * What survives a restart, beyond the ledger.
 *
 * Three things a redeploy must not forget: that a wallet was frozen — a kill
 * switch that resets on deploy is not a kill switch — the mandate a person
 * edited, and the receipts that say why money moved. The ledger already
 * outlives the process; this is the rest.
 *
 * Same split as the ledger: an in-memory store when there is no database,
 * reported as `database=stub` in the pane, and a Postgres one otherwise,
 * behind one interface. Nothing above this line knows which it holds.
 */

import { Mandate, NO_DIGEST, Receipt } from "@froggy/domain";
import type {
  DigestSchedule,
  DirectoryEntry,
  TelegramPairing,
  UserId,
} from "@froggy/domain";
import { Result, Schema } from "effect";

export interface Store {
  readonly directory: {
    /** Replaces an entry for the same URL. */
    readonly add: (userId: UserId, entry: DirectoryEntry) => Promise<void>;
    /** Oldest first. */
    readonly list: (userId: UserId) => Promise<readonly DirectoryEntry[]>;
    readonly remove: (userId: UserId, id: string) => Promise<void>;
  };
  readonly digest: {
    /** Every user with a digest hour set, for the scheduler's minute tick. */
    readonly all: () => Promise<
      readonly { readonly schedule: DigestSchedule; readonly userId: UserId }[]
    >;
    readonly load: (userId: UserId) => Promise<DigestSchedule>;
    readonly save: (userId: UserId, schedule: DigestSchedule) => Promise<void>;
  };
  /**
   * Everything this store holds about one person: mandate, receipts, the
   * frozen flag. The ledger's spend rows are not here — they are the money
   * record and stay — but nothing that says who this person was or what they
   * allowed survives.
   */
  readonly forget: (userId: UserId) => Promise<void>;
  readonly frozen: {
    readonly load: (userId: UserId) => Promise<boolean>;
    readonly save: (userId: UserId, frozen: boolean) => Promise<void>;
  };
  readonly mandates: {
    readonly load: (userId: UserId) => Promise<Mandate | null>;
    readonly save: (userId: UserId, mandate: Mandate) => Promise<void>;
  };
  /**
   * The person's share of the host account that pays the Hedera leg, in USD
   * millionths. Never negative: a debit larger than the balance floors at
   * zero, and the policy is what stops it being asked for.
   */
  readonly pocket: {
    /** Adds `deltaUsdMicros` (negative to draw down) and returns the new balance. */
    readonly adjust: (
      userId: UserId,
      deltaUsdMicros: number
    ) => Promise<number>;
    /** Null when this person has never had a pocket, so a starting credit happens once. */
    readonly load: (userId: UserId) => Promise<number | null>;
    /** Freeze. A zero balance, not a missing one: the starting credit does not return. */
    readonly zero: (userId: UserId) => Promise<void>;
  };
  readonly telegram: {
    readonly forUser: (userId: UserId) => Promise<TelegramPairing | null>;
    /** Whose account this Telegram user is, or null when nobody has paired it. */
    readonly lookup: (telegramUserId: string) => Promise<UserId | null>;
    /** Replaces any earlier pairing on either side. */
    readonly pair: (userId: UserId, pairing: TelegramPairing) => Promise<void>;
    readonly unpair: (userId: UserId) => Promise<void>;
  };
  readonly receipts: {
    readonly append: (userId: UserId, receipt: Receipt) => Promise<void>;
    /** Newest first. */
    readonly recent: (
      userId: UserId,
      limit: number
    ) => Promise<readonly Receipt[]>;
  };
}

export const decodeMandate = Schema.decodeUnknownResult(Mandate);
const decodeReceipt = Schema.decodeUnknownResult(Receipt);

/**
 * Parse a stored document, or drop it.
 *
 * A row that no longer decodes — after a schema change, say — is skipped
 * rather than allowed to take the whole history down with it. The receipt
 * still exists in the table; it is only unreadable by this version.
 */
export const readReceipts = (documents: readonly unknown[]): Receipt[] => {
  const receipts: Receipt[] = [];
  for (const document of documents) {
    const decoded = decodeReceipt(document);
    if (Result.isSuccess(decoded)) {
      receipts.push(decoded.success);
    }
  }
  return receipts;
};

export const memoryStore = (): Store => {
  const frozen = new Map<UserId, boolean>();
  const mandates = new Map<UserId, Mandate>();
  const receipts = new Map<UserId, Receipt[]>();
  const digests = new Map<UserId, DigestSchedule>();
  const pairings = new Map<UserId, TelegramPairing>();
  const entries = new Map<UserId, DirectoryEntry[]>();
  const pockets = new Map<UserId, number>();
  const unpair = (userId: UserId): void => {
    pairings.delete(userId);
  };
  return {
    directory: {
      add: async (userId, entry) => {
        await Promise.resolve();
        const list = (entries.get(userId) ?? []).filter(
          (existing) => existing.url !== entry.url
        );
        list.push(entry);
        entries.set(userId, list);
      },
      list: async (userId) => {
        await Promise.resolve();
        return [...(entries.get(userId) ?? [])].toSorted(
          (a, b) => a.addedAt - b.addedAt
        );
      },
      remove: async (userId, id) => {
        await Promise.resolve();
        entries.set(
          userId,
          (entries.get(userId) ?? []).filter((entry) => entry.id !== id)
        );
      },
    },
    telegram: {
      forUser: async (userId) => {
        await Promise.resolve();
        return pairings.get(userId) ?? null;
      },
      lookup: async (telegramUserId) => {
        await Promise.resolve();
        for (const [userId, pairing] of pairings) {
          if (pairing.telegramUserId === telegramUserId) {
            return userId;
          }
        }
        return null;
      },
      pair: async (userId, pairing) => {
        await Promise.resolve();
        for (const [other, existing] of pairings) {
          if (existing.telegramUserId === pairing.telegramUserId) {
            pairings.delete(other);
          }
        }
        pairings.set(userId, pairing);
      },
      unpair: async (userId) => {
        await Promise.resolve();
        unpair(userId);
      },
    },
    digest: {
      all: async () => {
        await Promise.resolve();
        return [...digests.entries()]
          .filter(([, schedule]) => schedule.hour !== null)
          .map(([userId, schedule]) => ({ schedule, userId }));
      },
      load: async (userId) => {
        await Promise.resolve();
        return digests.get(userId) ?? NO_DIGEST;
      },
      save: async (userId, schedule) => {
        await Promise.resolve();
        digests.set(userId, schedule);
      },
    },
    forget: async (userId) => {
      await Promise.resolve();
      entries.delete(userId);
      unpair(userId);
      digests.delete(userId);
      frozen.delete(userId);
      mandates.delete(userId);
      pockets.delete(userId);
      receipts.delete(userId);
    },
    frozen: {
      load: async (userId) => {
        await Promise.resolve();
        return frozen.get(userId) ?? false;
      },
      save: async (userId, value) => {
        await Promise.resolve();
        frozen.set(userId, value);
      },
    },
    mandates: {
      load: async (userId) => {
        await Promise.resolve();
        return mandates.get(userId) ?? null;
      },
      save: async (userId, mandate) => {
        await Promise.resolve();
        mandates.set(userId, mandate);
      },
    },
    pocket: {
      adjust: async (userId, deltaUsdMicros) => {
        await Promise.resolve();
        const next = Math.max(0, (pockets.get(userId) ?? 0) + deltaUsdMicros);
        pockets.set(userId, next);
        return next;
      },
      load: async (userId) => {
        await Promise.resolve();
        return pockets.get(userId) ?? null;
      },
      zero: async (userId) => {
        await Promise.resolve();
        pockets.set(userId, 0);
      },
    },
    receipts: {
      append: async (userId, receipt) => {
        await Promise.resolve();
        const list = receipts.get(userId) ?? [];
        list.push(receipt);
        receipts.set(userId, list);
      },
      recent: async (userId, limit) => {
        await Promise.resolve();
        return (receipts.get(userId) ?? []).toReversed().slice(0, limit);
      },
    },
  };
};
