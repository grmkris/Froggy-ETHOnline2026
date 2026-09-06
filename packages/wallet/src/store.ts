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

import { Mandate, NO_DIGEST, Receipt, Sale, Task } from "@froggy/domain";
import type {
  AgentToken,
  AgentTokenId,
  DigestSchedule,
  DirectoryEntry,
  SaleId,
  TaskId,
  TelegramPairing,
  UserId,
} from "@froggy/domain";
import { Result, Schema } from "effect";

/** A token row with the one field the domain record leaves out. */
interface AgentTokenRow extends AgentToken {
  /** SHA-256 of the secret, hex. Never the secret. */
  readonly secretHash: string;
}

/** What a task update may change. Everything else is fixed at creation. */
type TaskPatch = Partial<
  Pick<Task, "error" | "result" | "runId" | "saleId" | "status">
> & { readonly updatedAt: number };

/** What a sale update may change once the proof is on file. */
type SalePatch = Partial<
  Pick<Sale, "deliveredAt" | "error" | "result" | "status">
>;

export interface Store {
  /**
   * Tokens handed to outside agents. `lookup` answers only for tokens not yet
   * revoked, so revocation takes effect on the next request without a cache
   * to flush.
   */
  readonly agents: {
    readonly create: (userId: UserId, token: AgentTokenRow) => Promise<void>;
    /** Every token, revoked ones included, newest first. */
    readonly list: (userId: UserId) => Promise<readonly AgentToken[]>;
    readonly lookup: (secretHash: string) => Promise<{
      readonly token: AgentToken;
      readonly userId: UserId;
    } | null>;
    readonly revoke: (userId: UserId, id: AgentTokenId) => Promise<void>;
    readonly touch: (id: AgentTokenId, at: number) => Promise<void>;
  };
  /**
   * The seller's book. Not per person: the buyer is whichever account paid.
   * `record` is insert-or-return on the payment hash, so two arrivals of one
   * proof yield one sale and only the first caller is told it `created` it.
   */
  readonly sales: {
    readonly byId: (id: SaleId) => Promise<Sale | null>;
    readonly byPaymentHash: (paymentHash: string) => Promise<Sale | null>;
    readonly record: (
      sale: Sale
    ) => Promise<{ readonly created: boolean; readonly sale: Sale }>;
    readonly update: (id: SaleId, patch: SalePatch) => Promise<void>;
  };
  /** Delegated tasks, per person. A key seen before returns the earlier task. */
  readonly tasks: {
    readonly byId: (userId: UserId, id: TaskId) => Promise<Task | null>;
    readonly byIdempotencyKey: (
      userId: UserId,
      key: string
    ) => Promise<Task | null>;
    /** The task a sale bought, so a replayed proof finds it. */
    readonly bySaleId: (userId: UserId, saleId: SaleId) => Promise<Task | null>;
    readonly create: (userId: UserId, task: Task) => Promise<void>;
    /** Newest first. */
    readonly list: (userId: UserId, limit: number) => Promise<readonly Task[]>;
    readonly update: (
      userId: UserId,
      id: TaskId,
      patch: TaskPatch
    ) => Promise<void>;
  };
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
export const decodeSale = Schema.decodeUnknownResult(Sale);
export const decodeTask = Schema.decodeUnknownResult(Task);

/** The domain record, without the hash a caller must never see. */
const publicToken = (row: AgentTokenRow): AgentToken => ({
  createdAt: row.createdAt,
  id: row.id,
  label: row.label,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
});

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
  const tokens = new Map<AgentTokenId, AgentTokenRow & { userId: UserId }>();
  const sales = new Map<SaleId, Sale>();
  const tasks = new Map<TaskId, Task & { userId: UserId }>();
  const unpair = (userId: UserId): void => {
    pairings.delete(userId);
  };
  return {
    agents: {
      create: async (userId, token) => {
        await Promise.resolve();
        tokens.set(token.id, { ...token, userId });
      },
      list: async (userId) => {
        await Promise.resolve();
        return [...tokens.values()]
          .filter((row) => row.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .map(publicToken);
      },
      lookup: async (secretHash) => {
        await Promise.resolve();
        for (const row of tokens.values()) {
          if (row.secretHash === secretHash && row.revokedAt === null) {
            return { token: publicToken(row), userId: row.userId };
          }
        }
        return null;
      },
      revoke: async (userId, id) => {
        await Promise.resolve();
        const row = tokens.get(id);
        if (row !== undefined && row.userId === userId) {
          tokens.set(id, { ...row, revokedAt: Date.now() });
        }
      },
      touch: async (id, at) => {
        await Promise.resolve();
        const row = tokens.get(id);
        if (row !== undefined) {
          tokens.set(id, { ...row, lastUsedAt: at });
        }
      },
    },
    sales: {
      byId: async (id) => {
        await Promise.resolve();
        return sales.get(id) ?? null;
      },
      byPaymentHash: async (paymentHash) => {
        await Promise.resolve();
        for (const sale of sales.values()) {
          if (sale.paymentHash === paymentHash) {
            return sale;
          }
        }
        return null;
      },
      record: async (sale) => {
        await Promise.resolve();
        for (const existing of sales.values()) {
          if (existing.paymentHash === sale.paymentHash) {
            return { created: false, sale: existing };
          }
        }
        sales.set(sale.id, sale);
        return { created: true, sale };
      },
      update: async (id, patch) => {
        await Promise.resolve();
        const sale = sales.get(id);
        if (sale !== undefined) {
          sales.set(id, { ...sale, ...patch });
        }
      },
    },
    tasks: {
      byId: async (userId, id) => {
        await Promise.resolve();
        const task = tasks.get(id);
        return task !== undefined && task.userId === userId ? task : null;
      },
      byIdempotencyKey: async (userId, key) => {
        await Promise.resolve();
        for (const task of tasks.values()) {
          if (task.userId === userId && task.idempotencyKey === key) {
            return task;
          }
        }
        return null;
      },
      bySaleId: async (userId, saleId) => {
        await Promise.resolve();
        for (const task of tasks.values()) {
          if (task.userId === userId && task.saleId === saleId) {
            return task;
          }
        }
        return null;
      },
      create: async (userId, task) => {
        await Promise.resolve();
        tasks.set(task.id, { ...task, userId });
      },
      list: async (userId, limit) => {
        await Promise.resolve();
        return [...tasks.values()]
          .filter((task) => task.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit);
      },
      update: async (userId, id, patch) => {
        await Promise.resolve();
        const task = tasks.get(id);
        if (task !== undefined && task.userId === userId) {
          tasks.set(id, { ...task, ...patch });
        }
      },
    },
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
      for (const [id, row] of tokens) {
        if (row.userId === userId) {
          tokens.delete(id);
        }
      }
      for (const [id, task] of tasks) {
        if (task.userId === userId) {
          tasks.delete(id);
        }
      }
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
