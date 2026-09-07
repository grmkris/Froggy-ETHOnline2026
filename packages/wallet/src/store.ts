/**
 * What survives a restart, beyond the ledger.
 *
 * What a redeploy must not forget: the mandate a person edited, the receipts
 * that say why money moved, the sales book, the tasks and the agent tokens.
 * The ledger already outlives the process; this is the rest.
 *
 * Same split as the ledger: an in-memory store when there is no database,
 * reported as `database=stub` in the pane, and a Postgres one otherwise,
 * behind one interface. Nothing above this line knows which it holds.
 */

import { Mandate, Receipt, Sale, Schedule, Task } from "@froggy/domain";
import type {
  AgentToken,
  AgentTokenId,
  DirectoryEntry,
  OAuthClient,
  OAuthClientId,
  OAuthGrant,
  OAuthGrantId,
  OAuthScope,
  SaleId,
  ScheduleId,
  ScheduleStatus,
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

/** A due schedule, with whose it is: the ticker fires it on their behalf. */
export interface DueSchedule {
  readonly schedule: Schedule;
  readonly userId: UserId;
}

/**
 * What a run writes back. `lastRunAt` is absent for a retry that did not
 * run (the person was mid-turn), so the row keeps saying when it last did.
 */
export interface ScheduleFinish {
  readonly lastRunAt?: number;
  readonly nextRunAt: number | null;
  readonly status: ScheduleStatus;
}

export type OAuthTokenKind = "access" | "code" | "refresh";

/**
 * A code, access token or refresh token, keyed by the hash of the secret.
 * The secret itself is never stored; a copy of this row cannot be presented.
 */
export interface OAuthTokenRow {
  /** PKCE S256 challenge, on codes only. */
  readonly codeChallenge: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly grantId: OAuthGrantId;
  /** SHA-256 of the secret, hex. */
  readonly hash: string;
  readonly kind: OAuthTokenKind;
  /** The redirect the code was issued to, on codes only. */
  readonly redirectUri: string | null;
  /** The resource the code was asked for, on codes only, when one was named. */
  readonly resource: string | null;
  readonly revokedAt: number | null;
  readonly scopes: readonly OAuthScope[];
  /** Set exactly once, by `consume`. */
  readonly usedAt: number | null;
}

/** What a task update may change. Everything else is fixed at creation. */
type TaskPatch = Partial<
  Pick<Task, "error" | "result" | "runId" | "saleId" | "status">
> & { readonly updatedAt: number };

/** What a sale update may change once the proof is on file. */
type SalePatch = Partial<
  Pick<Sale, "deliveredAt" | "error" | "result" | "status">
>;

/**
 * Who holds the account's ECDSA key: Froggy, sealed at rest, or Privy, as a
 * cosmos-type wallet whose key signs through `raw_sign`.
 */
export type HederaCustody =
  | {
      readonly kind: "privy";
      readonly publicKey: string;
      readonly walletId: string;
    }
  | { readonly keyCiphertext: string; readonly kind: "sealed" };

export interface HederaAccountRecord {
  /** `0.0.x`. */
  readonly accountId: string;
  readonly custody: HederaCustody;
}

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
  /**
   * Reminders, unattended prompts and the digest. `claimDue` is the one
   * concurrent operation: it marks and returns every active row that is due
   * and unclaimed (or whose claim is older than `staleMs`) in one statement,
   * so two tickers on one database split the rows rather than share them.
   * `finish` writes the outcome and drops the claim.
   */
  readonly schedules: {
    /** True when an active row of this person's was cancelled. */
    readonly cancel: (userId: UserId, id: ScheduleId) => Promise<boolean>;
    readonly claimDue: (
      now: number,
      staleMs: number
    ) => Promise<readonly DueSchedule[]>;
    readonly create: (userId: UserId, schedule: Schedule) => Promise<void>;
    /** The person's active digest, if they have one. */
    readonly digestOf: (userId: UserId) => Promise<Schedule | null>;
    readonly finish: (id: ScheduleId, patch: ScheduleFinish) => Promise<void>;
    /** Every schedule of theirs, newest first, whatever its status. */
    readonly list: (userId: UserId) => Promise<readonly Schedule[]>;
    /** Replace the digest: the old one is cancelled, `null` leaves none. */
    readonly saveDigest: (
      userId: UserId,
      schedule: Schedule | null
    ) => Promise<void>;
    /** The zone of their most recent schedule, so a request without one is read in it. */
    readonly timezoneFor: (userId: UserId) => Promise<string | null>;
  };
  /**
   * Everything this store holds about one person: mandate, receipts, tasks,
   * schedules and tokens. The ledger's spend rows are not here — they are
   * the money record and stay — but nothing that says who this person was
   * or what they allowed survives.
   */
  readonly forget: (userId: UserId) => Promise<void>;
  /**
   * The person's own Hedera account: its id and the sealed key that signs for
   * it. Kept on `forget`: it is money, like the ledger's spends, and a
   * returning person finds their balance where they left it.
   */
  readonly hedera: {
    readonly load: (userId: UserId) => Promise<HederaAccountRecord | null>;
    readonly save: (
      userId: UserId,
      record: HederaAccountRecord
    ) => Promise<void>;
  };
  readonly mandates: {
    readonly load: (userId: UserId) => Promise<Mandate | null>;
    readonly save: (userId: UserId, mandate: Mandate) => Promise<void>;
  };
  /**
   * The OAuth authorization server's state: registered clients, the grants
   * people gave them, and the hashed codes and tokens under each grant.
   * `tokens.consume` is the one write that must be atomic across processes:
   * it sets `usedAt` only where it is still null and says whether it did, so
   * a replayed code or an old refresh token is caught by whichever process
   * sees it second.
   */
  readonly oauth: {
    readonly clients: {
      readonly byId: (id: OAuthClientId) => Promise<OAuthClient | null>;
      readonly create: (client: OAuthClient) => Promise<void>;
    };
    readonly grants: {
      /** Revoked grants included, so a token under one still resolves to "revoked". */
      readonly byId: (id: OAuthGrantId) => Promise<{
        readonly grant: OAuthGrant;
        readonly userId: UserId;
      } | null>;
      readonly create: (userId: UserId, grant: OAuthGrant) => Promise<void>;
      /** Every grant, revoked ones included, newest first. */
      readonly list: (userId: UserId) => Promise<readonly OAuthGrant[]>;
      /** True when the grant was this person's and is now revoked. */
      readonly revoke: (
        userId: UserId,
        id: OAuthGrantId,
        at: number
      ) => Promise<boolean>;
      readonly touch: (id: OAuthGrantId, at: number) => Promise<void>;
    };
    readonly tokens: {
      /** Null for a revoked row; an expired or used row is returned and judged by the caller. */
      readonly byHash: (hash: string) => Promise<OAuthTokenRow | null>;
      /** False when the row was already used: the replay signal. */
      readonly consume: (hash: string, at: number) => Promise<boolean>;
      readonly insert: (row: OAuthTokenRow) => Promise<void>;
      readonly revokeAllForGrant: (
        grantId: OAuthGrantId,
        at: number
      ) => Promise<void>;
    };
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
export const decodeSchedule = Schema.decodeUnknownResult(Schedule);

/** The domain record, without the hash a caller must never see. */
const publicToken = (row: AgentTokenRow): AgentToken => ({
  createdAt: row.createdAt,
  id: row.id,
  label: row.label,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
});

/** A schedule as the memory store keeps it: with its owner and its claim. */
interface ScheduleRow extends Schedule {
  readonly claimedAt: number | null;
  readonly userId: UserId;
}

/** A schedule row as the domain sees it: without the owner and the claim. */
const publicSchedule = (row: ScheduleRow): Schedule => ({
  action: row.action,
  cadence: row.cadence,
  createdAt: row.createdAt,
  id: row.id,
  label: row.label,
  lastRunAt: row.lastRunAt,
  nextRunAt: row.nextRunAt,
  status: row.status,
  timezone: row.timezone,
});

/** The person's active digest among the rows, if any. */
const digestRowOf = (
  rows: Iterable<ScheduleRow>,
  userId: UserId
): Schedule | null => {
  for (const row of rows) {
    if (
      row.userId === userId &&
      row.action._tag === "digest" &&
      row.status === "active"
    ) {
      return publicSchedule(row);
    }
  }
  return null;
};

/** The grant without its owner, which is the caller's to know separately. */
const publicGrant = (row: OAuthGrant & { userId: UserId }): OAuthGrant => ({
  clientId: row.clientId,
  clientName: row.clientName,
  createdAt: row.createdAt,
  id: row.id,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
  scopes: row.scopes,
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
  const mandates = new Map<UserId, Mandate>();
  const receipts = new Map<UserId, Receipt[]>();
  const schedules = new Map<ScheduleId, ScheduleRow>();
  const pairings = new Map<UserId, TelegramPairing>();
  const entries = new Map<UserId, DirectoryEntry[]>();
  const pockets = new Map<UserId, number>();
  const hederaAccounts = new Map<UserId, HederaAccountRecord>();
  const tokens = new Map<AgentTokenId, AgentTokenRow & { userId: UserId }>();
  const sales = new Map<SaleId, Sale>();
  const tasks = new Map<TaskId, Task & { userId: UserId }>();
  const oauthClients = new Map<OAuthClientId, OAuthClient>();
  const oauthGrants = new Map<OAuthGrantId, OAuthGrant & { userId: UserId }>();
  const oauthTokens = new Map<string, OAuthTokenRow>();
  const unpair = (userId: UserId): void => {
    pairings.delete(userId);
  };
  return {
    oauth: {
      clients: {
        byId: async (id) => {
          await Promise.resolve();
          return oauthClients.get(id) ?? null;
        },
        create: async (client) => {
          await Promise.resolve();
          oauthClients.set(client.id, client);
        },
      },
      grants: {
        byId: async (id) => {
          await Promise.resolve();
          const row = oauthGrants.get(id);
          return row === undefined
            ? null
            : { grant: publicGrant(row), userId: row.userId };
        },
        create: async (userId, grant) => {
          await Promise.resolve();
          oauthGrants.set(grant.id, { ...grant, userId });
        },
        list: async (userId) => {
          await Promise.resolve();
          return [...oauthGrants.values()]
            .filter((row) => row.userId === userId)
            .toSorted((a, b) => b.createdAt - a.createdAt)
            .map(publicGrant);
        },
        revoke: async (userId, id, at) => {
          await Promise.resolve();
          const row = oauthGrants.get(id);
          if (row === undefined || row.userId !== userId) {
            return false;
          }
          oauthGrants.set(id, { ...row, revokedAt: row.revokedAt ?? at });
          return true;
        },
        touch: async (id, at) => {
          await Promise.resolve();
          const row = oauthGrants.get(id);
          if (row !== undefined) {
            oauthGrants.set(id, { ...row, lastUsedAt: at });
          }
        },
      },
      tokens: {
        byHash: async (hash) => {
          await Promise.resolve();
          const row = oauthTokens.get(hash);
          return row === undefined || row.revokedAt !== null ? null : row;
        },
        consume: async (hash, at) => {
          await Promise.resolve();
          const row = oauthTokens.get(hash);
          if (row === undefined || row.usedAt !== null) {
            return false;
          }
          oauthTokens.set(hash, { ...row, usedAt: at });
          return true;
        },
        insert: async (row) => {
          await Promise.resolve();
          oauthTokens.set(row.hash, row);
        },
        revokeAllForGrant: async (grantId, at) => {
          await Promise.resolve();
          for (const [hash, row] of oauthTokens) {
            if (row.grantId === grantId && row.revokedAt === null) {
              oauthTokens.set(hash, { ...row, revokedAt: at });
            }
          }
        },
      },
    },
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
        if (
          task.idempotencyKey !== null &&
          [...tasks.values()].some(
            (entry) =>
              entry.userId === userId &&
              entry.idempotencyKey === task.idempotencyKey
          )
        ) {
          throw new Error("Task idempotency key already exists.");
        }
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
    schedules: {
      cancel: async (userId, id) => {
        await Promise.resolve();
        const row = schedules.get(id);
        if (
          row === undefined ||
          row.userId !== userId ||
          row.status !== "active"
        ) {
          return false;
        }
        schedules.set(id, {
          ...row,
          claimedAt: null,
          nextRunAt: null,
          status: "cancelled",
        });
        return true;
      },
      claimDue: async (now, staleMs) => {
        await Promise.resolve();
        const due: DueSchedule[] = [];
        for (const [id, row] of schedules) {
          if (
            row.status === "active" &&
            row.nextRunAt !== null &&
            row.nextRunAt <= now &&
            (row.claimedAt === null || row.claimedAt < now - staleMs)
          ) {
            schedules.set(id, { ...row, claimedAt: now });
            due.push({ schedule: publicSchedule(row), userId: row.userId });
          }
        }
        return due;
      },
      create: async (userId, schedule) => {
        await Promise.resolve();
        schedules.set(schedule.id, { ...schedule, claimedAt: null, userId });
      },
      digestOf: async (userId) => {
        await Promise.resolve();
        return digestRowOf(schedules.values(), userId);
      },
      finish: async (id, patch) => {
        await Promise.resolve();
        const row = schedules.get(id);
        if (row !== undefined) {
          schedules.set(id, {
            ...row,
            claimedAt: null,
            lastRunAt: patch.lastRunAt ?? row.lastRunAt,
            nextRunAt: patch.nextRunAt,
            status: patch.status,
          });
        }
      },
      list: async (userId) => {
        await Promise.resolve();
        return [...schedules.values()]
          .filter((row) => row.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .map(publicSchedule);
      },
      saveDigest: async (userId, schedule) => {
        await Promise.resolve();
        for (const [id, row] of schedules) {
          if (
            row.userId === userId &&
            row.action._tag === "digest" &&
            row.status === "active"
          ) {
            schedules.set(id, {
              ...row,
              claimedAt: null,
              nextRunAt: null,
              status: "cancelled",
            });
          }
        }
        if (schedule !== null) {
          schedules.set(schedule.id, { ...schedule, claimedAt: null, userId });
        }
      },
      timezoneFor: async (userId) => {
        await Promise.resolve();
        const [latest] = [...schedules.values()]
          .filter((row) => row.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt);
        return latest?.timezone ?? null;
      },
    },
    forget: async (userId) => {
      await Promise.resolve();
      for (const [id, row] of tokens) {
        if (row.userId === userId) {
          tokens.delete(id);
        }
      }
      for (const [id, row] of schedules) {
        if (row.userId === userId) {
          schedules.delete(id);
        }
      }
      for (const [id, task] of tasks) {
        if (task.userId === userId) {
          tasks.delete(id);
        }
      }
      for (const [id, grant] of oauthGrants) {
        if (grant.userId === userId) {
          oauthGrants.delete(id);
          for (const [hash, row] of oauthTokens) {
            if (row.grantId === id) {
              oauthTokens.delete(hash);
            }
          }
        }
      }
      entries.delete(userId);
      unpair(userId);
      mandates.delete(userId);
      pockets.delete(userId);
      receipts.delete(userId);
    },
    hedera: {
      load: async (userId) => {
        await Promise.resolve();
        return hederaAccounts.get(userId) ?? null;
      },
      save: async (userId, record) => {
        await Promise.resolve();
        hederaAccounts.set(userId, record);
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
