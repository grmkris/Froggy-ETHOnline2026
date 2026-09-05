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

import { Mandate, Receipt } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { Result, Schema } from "effect";

export interface Store {
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
  return {
    forget: async (userId) => {
      await Promise.resolve();
      frozen.delete(userId);
      mandates.delete(userId);
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
