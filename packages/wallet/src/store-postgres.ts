import {
  browserProfiles,
  agentInvocations,
  agentTokens,
  conversions,
  directory,
  mandates,
  oauthClients,
  oauthGrants,
  oauthTokens,
  purchases,
  receipts,
  sales,
  schedules,
  tasks,
  telegramPairings,
  users,
  walletConnections,
  walletRequests,
} from "@froggy/database";
/**
 * The durable store: mandates, receipts, sales, tasks and tokens in Postgres.
 *
 * Receipts and mandates are stored as documents. A receipt is an immutable
 * record of a past decision, and a mandate is whatever the person last
 * saved; normalising either into columns would mean a later schema change
 * silently rewrites history.
 */
import {
  userId as toUserId,
  Allowance,
  AgentInvocation,
  DirectoryId,
  decodeUserId,
  OAuthScope,
  Purchase,
  WalletConnection,
  WalletRequest,
} from "@froggy/domain";
import type {
  AgentToken,
  DirectoryEntry,
  OAuthClient,
  OAuthGrant,
  Sale,
  Schedule,
  Task,
  UserId,
} from "@froggy/domain";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  inArray,
  sql as raw,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Result, Schema } from "effect";
import type { Sql } from "postgres";

import { postgresCreditStore } from "./credit-store-postgres";
import { postgresHistoryStore } from "./history-store-postgres";
import { postgresLaunchStore } from "./launch-store-postgres";
import { postgresMonitoringStore } from "./monitoring-store-postgres";
import {
  BrowserProfileRecord,
  decodeConversion,
  decodeMandate,
  decodeSale,
  decodeSchedule,
  decodeTask,
  readReceipts,
} from "./store";
import type {
  DueSchedule,
  HederaReceivingRecord,
  OAuthTokenRow,
  OwnedWalletRequest,
  Store,
} from "./store";
import { postgresTradingStore } from "./trading-store-postgres";
import { postgresWatchlistStore } from "./watchlist-store-postgres";

const millis = (value: Date | null): number | null =>
  value === null ? null : value.getTime();

type SaleRow = typeof sales.$inferSelect;
type ScheduleRow = typeof schedules.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;
type TokenRow = typeof agentTokens.$inferSelect;

/**
 * A row back into the domain, decoded rather than asserted. A row this
 * version cannot read is reported as absent, which is the same policy the
 * receipts take: the data stays, only this reader declines it.
 */
const saleOf = (row: SaleRow): Sale | null => {
  const decoded = decodeSale({
    amount: row.amount,
    asset: row.asset,
    at: row.createdAt.getTime(),
    deliveredAt: millis(row.deliveredAt),
    error: row.error,
    id: row.id,
    network: row.network,
    payer: row.payer,
    paymentHash: row.paymentHash,
    resource: row.resource,
    result: row.result,
    status: row.status,
    stubbed: row.stubbed,
    transactionId: row.transactionId,
  });
  return Result.isSuccess(decoded) ? decoded.success : null;
};

const taskOf = (row: TaskRow): Task | null => {
  const decoded = decodeTask({
    agentTokenId: row.agentTokenId,
    connectionId: row.connectionId,
    createdAt: row.createdAt.getTime(),
    error: row.error,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    input: row.input,
    kind: row.kind,
    priceUsdMicros: row.priceUsdMicros,
    result: row.result,
    runId: row.runId,
    saleId: row.saleId,
    chargeId: row.chargeId ?? undefined,
    priceCreditUnits: row.priceCreditUnits ?? undefined,
    chargeStatus: row.chargeStatus ?? undefined,
    status: row.status,
    updatedAt: row.updatedAt.getTime(),
  });
  return Result.isSuccess(decoded) ? decoded.success : null;
};

const scheduleOf = (row: ScheduleRow): Schedule | null => {
  const decoded = decodeSchedule({
    action: row.action,
    cadence: row.cadence,
    createdAt: row.createdAt.getTime(),
    id: row.id,
    label: row.label,
    lastRunAt: millis(row.lastRunAt),
    nextRunAt: millis(row.nextRunAt),
    status: row.status,
    timezone: row.timezone,
  });
  return Result.isSuccess(decoded) ? decoded.success : null;
};

/** Rows into schedules, dropping the ones this version cannot read. */
const schedulesOf = (rows: readonly ScheduleRow[]): Schedule[] => {
  const listed: Schedule[] = [];
  for (const row of rows) {
    const schedule = scheduleOf(row);
    if (schedule !== null) {
      listed.push(schedule);
    }
  }
  return listed;
};

const scheduleInsert = (
  userId: UserId,
  schedule: Schedule
): typeof schedules.$inferInsert => ({
  action: schedule.action,
  cadence: schedule.cadence,
  claimedAt: null,
  createdAt: new Date(schedule.createdAt),
  id: schedule.id,
  label: schedule.label,
  lastRunAt: schedule.lastRunAt === null ? null : new Date(schedule.lastRunAt),
  nextRunAt: schedule.nextRunAt === null ? null : new Date(schedule.nextRunAt),
  status: schedule.status,
  timezone: schedule.timezone,
  userId,
});

const tokenOf = (row: TokenRow): AgentToken => ({
  createdAt: row.createdAt.getTime(),
  id: row.id,
  label: row.label,
  lastUsedAt: millis(row.lastUsedAt),
  revokedAt: millis(row.revokedAt),
});

type OAuthClientRow = typeof oauthClients.$inferSelect;
type OAuthGrantRow = typeof oauthGrants.$inferSelect;
type OAuthTokenDbRow = typeof oauthTokens.$inferSelect;

const decodeScopes = Schema.decodeUnknownResult(Schema.Array(OAuthScope));
const decodeUris = Schema.decodeUnknownResult(Schema.Array(Schema.String));
const decodeTokenKind = Schema.decodeUnknownResult(
  Schema.Literals(["access", "code", "refresh"])
);

/** The scopes a JSON column holds, or none: a scope this version cannot read grants nothing. */
const scopesOf = (column: OAuthGrantRow["scopes"]): readonly OAuthScope[] => {
  const decoded = decodeScopes(column);
  return Result.isSuccess(decoded) ? decoded.success : [];
};

const oauthClientOf = (row: OAuthClientRow): OAuthClient | null => {
  const uris = decodeUris(row.redirectUris);
  return Result.isSuccess(uris)
    ? {
        createdAt: row.createdAt.getTime(),
        id: row.id,
        name: row.name,
        redirectUris: uris.success,
      }
    : null;
};

const oauthGrantOf = (row: OAuthGrantRow, clientName: string): OAuthGrant => ({
  clientId: row.clientId,
  clientName,
  createdAt: row.createdAt.getTime(),
  id: row.id,
  lastUsedAt: millis(row.lastUsedAt),
  revokedAt: millis(row.revokedAt),
  scopes: scopesOf(row.scopes),
});

const oauthTokenOf = (row: OAuthTokenDbRow): OAuthTokenRow | null => {
  const kind = decodeTokenKind(row.kind);
  if (Result.isFailure(kind)) {
    return null;
  }
  return {
    codeChallenge: row.codeChallenge,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    grantId: row.grantId,
    hash: row.hash,
    kind: kind.success,
    redirectUri: row.redirectUri,
    resource: row.resource,
    revokedAt: millis(row.revokedAt),
    scopes: scopesOf(row.scopes),
    usedAt: millis(row.usedAt),
  };
};

/** The stored allowance, checked on the way out. See `privyPolicy.load`. */
const decodeAllowance = Schema.decodeUnknownResult(Allowance);

export const postgresStore = (sql: Sql): Store => {
  const database = drizzle(sql);
  const loadHederaReceiving = async (
    userId: UserId
  ): Promise<HederaReceivingRecord | null> => {
    const rows = await database
      .select({
        accountId: users.hederaAccountId,
        keyCiphertext: users.hederaKeyCiphertext,
        publicKey: users.hederaPublicKey,
        walletId: users.hederaPrivyWalletId,
      })
      .from(users)
      .where(eq(users.did, userId))
      .limit(1);
    const [row] = rows;
    if (row === undefined) {
      return null;
    }
    if (row.walletId !== null && row.publicKey !== null) {
      return {
        accountId: row.accountId,
        custody: {
          kind: "privy",
          publicKey: row.publicKey,
          walletId: row.walletId,
        },
      };
    }
    if (row.keyCiphertext !== null) {
      return {
        accountId: row.accountId,
        custody: { keyCiphertext: row.keyCiphertext, kind: "sealed" },
      };
    }
    return null;
  };

  const ensureUser = async (userId: UserId): Promise<void> => {
    await database.insert(users).values({ did: userId }).onConflictDoNothing();
  };
  const grantWithClient = async (
    where: ReturnType<typeof eq>
  ): Promise<
    readonly { readonly grant: OAuthGrantRow; readonly name: string }[]
  > =>
    await database
      .select({ grant: oauthGrants, name: oauthClients.name })
      .from(oauthGrants)
      .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
      .where(where)
      .orderBy(desc(oauthGrants.createdAt));
  const history = postgresHistoryStore(sql);
  const monitoring = postgresMonitoringStore(sql);
  const watchlist = postgresWatchlistStore(sql);
  return {
    credits: postgresCreditStore(sql),
    browsers: {
      load: async (userId) => {
        const [row] = await database
          .select()
          .from(browserProfiles)
          .where(eq(browserProfiles.userId, userId))
          .limit(1);
        return row === undefined
          ? null
          : Schema.decodeUnknownSync(BrowserProfileRecord)(row.document);
      },
      save: async (userId, record) => {
        await ensureUser(userId);
        const document = Schema.decodeUnknownSync(BrowserProfileRecord)(record);
        await database
          .insert(browserProfiles)
          .values({ userId, document })
          .onConflictDoUpdate({
            target: browserProfiles.userId,
            set: { document },
          });
      },
    },
    history,
    watchlist,
    monitoring,
    trading: postgresTradingStore(sql),
    launches: postgresLaunchStore(sql),
    purchases: {
      forRun: async (userId, runId) => {
        const rows = await database
          .select({ document: purchases.document })
          .from(purchases)
          .where(
            and(
              eq(purchases.userId, userId),
              raw`${purchases.document}->>'runId' = ${runId}`
            )
          )
          .orderBy(asc(purchases.createdAt))
          .limit(100);
        return rows.map((row) =>
          Schema.decodeUnknownSync(Purchase)(row.document)
        );
      },
      create: async (userId, purchase) => {
        const decoded = Schema.decodeUnknownSync(Purchase)(purchase);
        await ensureUser(userId);
        const [inserted] = await database
          .insert(purchases)
          .values({
            id: decoded.id,
            userId,
            idempotencyKey: decoded.idempotencyKey,
            status: decoded.status,
            createdAt: new Date(decoded.createdAt),
            updatedAt: new Date(decoded.updatedAt),
            document: decoded,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted !== undefined) {
          return {
            created: true,
            purchase: Schema.decodeUnknownSync(Purchase)(inserted.document),
          };
        }
        const [existing] = await database
          .select()
          .from(purchases)
          .where(
            and(
              eq(purchases.userId, userId),
              eq(purchases.idempotencyKey, decoded.idempotencyKey)
            )
          )
          .limit(1);
        if (existing === undefined) {
          throw new Error("Purchase record disappeared.");
        }
        return {
          created: false,
          purchase: Schema.decodeUnknownSync(Purchase)(existing.document),
        };
      },
      byId: async (userId, id) => {
        const [row] = await database
          .select()
          .from(purchases)
          .where(and(eq(purchases.userId, userId), eq(purchases.id, id)))
          .limit(1);
        return row === undefined
          ? null
          : Schema.decodeUnknownSync(Purchase)(row.document);
      },
      byKey: async (userId, key) => {
        const [row] = await database
          .select()
          .from(purchases)
          .where(
            and(eq(purchases.userId, userId), eq(purchases.idempotencyKey, key))
          )
          .limit(1);
        return row === undefined
          ? null
          : Schema.decodeUnknownSync(Purchase)(row.document);
      },
      list: async (userId, limit) => {
        const rows = await database
          .select()
          .from(purchases)
          .where(eq(purchases.userId, userId))
          .orderBy(desc(purchases.createdAt), desc(purchases.id))
          .limit(limit);
        return rows.map((row) =>
          Schema.decodeUnknownSync(Purchase)(row.document)
        );
      },
      update: async (userId, id, expected, patch, approvalId) =>
        await database.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(purchases)
            .where(and(eq(purchases.userId, userId), eq(purchases.id, id)))
            .for("update");
          if (row === undefined) {
            return null;
          }
          const prior = Schema.decodeUnknownSync(Purchase)(row.document);
          if (
            !expected.includes(prior.status) ||
            (approvalId !== undefined && prior.approvalId !== approvalId)
          ) {
            return null;
          }
          const next = Schema.decodeUnknownSync(Purchase)({
            ...prior,
            ...patch,
          });
          await tx
            .update(purchases)
            .set({
              status: next.status,
              updatedAt: new Date(next.updatedAt),
              document: next,
            })
            .where(and(eq(purchases.userId, userId), eq(purchases.id, id)));
          return next;
        }),
    },
    walletRequests: {
      create: async (userId, request) => {
        const decoded = Schema.decodeUnknownSync(WalletRequest)(request);
        await ensureUser(userId);
        await database.insert(walletRequests).values({
          id: decoded.id,
          userId,
          status: decoded.status,
          createdAt: new Date(decoded.createdAt),
          updatedAt: new Date(decoded.updatedAt),
          document: decoded,
        });
        return decoded;
      },
      byId: async (userId, id) => {
        const [row] = await database
          .select()
          .from(walletRequests)
          .where(
            and(eq(walletRequests.userId, userId), eq(walletRequests.id, id))
          )
          .limit(1);
        return row === undefined
          ? null
          : Schema.decodeUnknownSync(WalletRequest)(row.document);
      },
      list: async (userId, limit) => {
        const rows = await database
          .select()
          .from(walletRequests)
          .where(eq(walletRequests.userId, userId))
          .orderBy(desc(walletRequests.createdAt), desc(walletRequests.id))
          .limit(limit);
        return rows.map((row) =>
          Schema.decodeUnknownSync(WalletRequest)(row.document)
        );
      },
      update: async (userId, id, expected, patch) =>
        await database.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(walletRequests)
            .where(
              and(eq(walletRequests.userId, userId), eq(walletRequests.id, id))
            )
            .for("update");
          if (row === undefined) {
            return null;
          }
          const prior = Schema.decodeUnknownSync(WalletRequest)(row.document);
          if (!expected.includes(prior.status)) {
            return null;
          }
          const next = Schema.decodeUnknownSync(WalletRequest)({
            ...prior,
            ...patch,
          });
          await tx
            .update(walletRequests)
            .set({
              status: next.status,
              updatedAt: new Date(next.updatedAt),
              document: next,
            })
            .where(
              and(eq(walletRequests.userId, userId), eq(walletRequests.id, id))
            );
          return next;
        }),
      inFlight: async (statuses) => {
        if (statuses.length === 0) {
          return [];
        }
        const rows = await database
          .select()
          .from(walletRequests)
          .where(inArray(walletRequests.status, [...statuses]))
          .orderBy(asc(walletRequests.createdAt))
          .limit(500);
        const owned: OwnedWalletRequest[] = [];
        for (const row of rows) {
          const decodedUser = decodeUserId(row.userId);
          if (Result.isSuccess(decodedUser)) {
            owned.push({
              request: Schema.decodeUnknownSync(WalletRequest)(row.document),
              userId: decodedUser.success,
            });
          }
        }
        return owned;
      },
    },
    walletConnections: {
      grant: async (userId, connection) => {
        const decoded = Schema.decodeUnknownSync(WalletConnection)(connection);
        await ensureUser(userId);
        await database.transaction(async (tx) => {
          const revokedAt = new Date(decoded.grantedAt);
          await tx
            .update(walletConnections)
            .set({
              revokedAt,
              document: raw`${walletConnections.document} || ${JSON.stringify({ revokedAt: decoded.grantedAt })}::jsonb`,
            })
            .where(
              and(
                eq(walletConnections.userId, userId),
                eq(walletConnections.origin, decoded.origin),
                isNull(walletConnections.revokedAt)
              )
            );
          await tx.insert(walletConnections).values({
            id: decoded.id,
            userId,
            origin: decoded.origin,
            revokedAt: null,
            document: decoded,
          });
        });
        return decoded;
      },
      active: async (userId, origin) => {
        const [row] = await database
          .select()
          .from(walletConnections)
          .where(
            and(
              eq(walletConnections.userId, userId),
              eq(walletConnections.origin, origin),
              isNull(walletConnections.revokedAt)
            )
          )
          .limit(1);
        return row === undefined
          ? null
          : Schema.decodeUnknownSync(WalletConnection)(row.document);
      },
      list: async (userId) => {
        const rows = await database
          .select()
          .from(walletConnections)
          .where(
            and(
              eq(walletConnections.userId, userId),
              isNull(walletConnections.revokedAt)
            )
          );
        return rows
          .map((row) =>
            Schema.decodeUnknownSync(WalletConnection)(row.document)
          )
          .toSorted((a, b) => b.grantedAt - a.grantedAt);
      },
      revoke: async (userId, id, at) => {
        const updated = await database
          .update(walletConnections)
          .set({
            revokedAt: new Date(at),
            document: raw`${walletConnections.document} || ${JSON.stringify({ revokedAt: at })}::jsonb`,
          })
          .where(
            and(
              eq(walletConnections.userId, userId),
              eq(walletConnections.id, id),
              isNull(walletConnections.revokedAt)
            )
          )
          .returning({ id: walletConnections.id });
        return updated.length > 0;
      },
    },
    invocations: {
      recent: async (userId) => {
        const rows = await database
          .select()
          .from(agentInvocations)
          .where(eq(agentInvocations.userId, userId))
          .orderBy(desc(agentInvocations.at), desc(agentInvocations.id))
          .limit(50);
        return rows.map((row) =>
          Schema.decodeUnknownSync(AgentInvocation)({
            ...row,
            at: row.at.getTime(),
          })
        );
      },
      append: async (userId, invocation) => {
        const decoded = Schema.decodeUnknownSync(AgentInvocation)(invocation);
        await ensureUser(userId);
        await database
          .insert(agentInvocations)
          .values({ ...decoded, userId, at: new Date(decoded.at) });
      },
      finish: async (userId, id, patch) => {
        await database
          .update(agentInvocations)
          .set(patch)
          .where(
            and(
              eq(agentInvocations.userId, userId),
              eq(agentInvocations.id, id)
            )
          );
      },
      list: async (userId, connectionId) => {
        const rows = await database
          .select()
          .from(agentInvocations)
          .where(
            and(
              eq(agentInvocations.userId, userId),
              eq(agentInvocations.connectionId, connectionId)
            )
          )
          .orderBy(desc(agentInvocations.at), desc(agentInvocations.id))
          .limit(50);
        return rows.map((row) =>
          Schema.decodeUnknownSync(AgentInvocation)({
            ...row,
            at: row.at.getTime(),
          })
        );
      },
    },
    conversions: {
      create: async (userId, record) => {
        await ensureUser(userId);
        const [inserted] = await database
          .insert(conversions)
          .values({
            id: record.id,
            userId,
            key: record.key,
            phase: record.phase,
            data: record,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted !== undefined) {
          return { created: true, record: decodeConversion(inserted.data) };
        }
        const [existing] = await database
          .select()
          .from(conversions)
          .where(
            and(eq(conversions.userId, userId), eq(conversions.key, record.key))
          )
          .limit(1);
        if (existing === undefined) {
          throw new Error("Conversion record disappeared.");
        }
        return { created: false, record: decodeConversion(existing.data) };
      },
      pending: async (userId) => {
        const rows = await database
          .select()
          .from(conversions)
          .where(eq(conversions.userId, userId));
        return rows
          .map((row) => decodeConversion(row.data))
          .filter((record) => !record.credited && record.phase !== "failed");
      },
      update: async (id, phase, patch) =>
        await database.transaction(async (tx) => {
          const [found] = await tx
            .select()
            .from(conversions)
            .where(eq(conversions.id, id))
            .for("update");
          if (found === undefined || found.phase !== phase) {
            return false;
          }
          const next = { ...decodeConversion(found.data), ...patch };
          await tx
            .update(conversions)
            .set({ data: next, phase: next.phase })
            .where(eq(conversions.id, id));
          return true;
        }),
      credit: async (userId, id) =>
        await database.transaction(async (tx) => {
          const [found] = await tx
            .select()
            .from(conversions)
            .where(and(eq(conversions.id, id), eq(conversions.userId, userId)))
            .for("update");
          if (found === undefined || found.phase !== "funded") {
            throw new Error("Conversion funding is not confirmed.");
          }
          const record = decodeConversion(found.data);
          if (!record.credited) {
            await tx
              .update(users)
              .set({
                pocketUsdMicros: raw`coalesce(${users.pocketUsdMicros}, 0) + ${record.usdMicros}`,
              })
              .where(eq(users.did, userId));
            await tx
              .update(conversions)
              .set({ data: { ...record, credited: true } })
              .where(eq(conversions.id, id));
          }
          const [owner] = await tx
            .select({ balance: users.pocketUsdMicros })
            .from(users)
            .where(eq(users.did, userId));
          return owner?.balance ?? 0;
        }),
    },
    oauth: {
      clients: {
        byId: async (id) => {
          const rows = await database
            .select()
            .from(oauthClients)
            .where(eq(oauthClients.id, id))
            .limit(1);
          const [row] = rows;
          return row === undefined ? null : oauthClientOf(row);
        },
        create: async (client) => {
          await database.insert(oauthClients).values({
            createdAt: new Date(client.createdAt),
            id: client.id,
            name: client.name,
            redirectUris: client.redirectUris,
          });
        },
      },
      grants: {
        byId: async (id) => {
          const [row] = await grantWithClient(eq(oauthGrants.id, id));
          if (row === undefined) {
            return null;
          }
          const owner = decodeUserId(row.grant.userId);
          return Result.isSuccess(owner)
            ? {
                grant: oauthGrantOf(row.grant, row.name),
                userId: owner.success,
              }
            : null;
        },
        create: async (userId, grant) => {
          await ensureUser(userId);
          await database.insert(oauthGrants).values({
            clientId: grant.clientId,
            createdAt: new Date(grant.createdAt),
            id: grant.id,
            lastUsedAt: null,
            revokedAt: null,
            scopes: grant.scopes,
            userId,
          });
        },
        list: async (userId) => {
          const rows = await grantWithClient(eq(oauthGrants.userId, userId));
          return rows.map((row) => oauthGrantOf(row.grant, row.name));
        },
        revoke: async (userId, id, at) => {
          const rows = await database
            .update(oauthGrants)
            .set({
              revokedAt: raw`COALESCE(${oauthGrants.revokedAt}, ${new Date(at).toISOString()})`,
            })
            .where(and(eq(oauthGrants.id, id), eq(oauthGrants.userId, userId)))
            .returning({ id: oauthGrants.id });
          return rows.length > 0;
        },
        touch: async (id, at) => {
          await database
            .update(oauthGrants)
            .set({ lastUsedAt: new Date(at) })
            .where(eq(oauthGrants.id, id));
        },
      },
      tokens: {
        byHash: async (hash) => {
          const rows = await database
            .select()
            .from(oauthTokens)
            .where(eq(oauthTokens.hash, hash))
            .limit(1);
          const [row] = rows;
          if (row === undefined || row.revokedAt !== null) {
            return null;
          }
          return oauthTokenOf(row);
        },
        consume: async (hash, at) => {
          // One statement: the row is marked used only where it is still
          // unused, so two processes presenting one code agree on who won.
          const rows = await database
            .update(oauthTokens)
            .set({ usedAt: new Date(at) })
            .where(and(eq(oauthTokens.hash, hash), isNull(oauthTokens.usedAt)))
            .returning({ hash: oauthTokens.hash });
          return rows.length > 0;
        },
        insert: async (row) => {
          await database.insert(oauthTokens).values({
            codeChallenge: row.codeChallenge,
            createdAt: new Date(row.createdAt),
            expiresAt: new Date(row.expiresAt),
            grantId: row.grantId,
            hash: row.hash,
            kind: row.kind,
            redirectUri: row.redirectUri,
            resource: row.resource,
            revokedAt: null,
            scopes: row.scopes,
            usedAt: null,
          });
        },
        revokeAllForGrant: async (grantId, at) => {
          await database
            .update(oauthTokens)
            .set({ revokedAt: new Date(at) })
            .where(
              and(
                eq(oauthTokens.grantId, grantId),
                isNull(oauthTokens.revokedAt)
              )
            );
        },
      },
    },
    agents: {
      create: async (userId, token) => {
        await ensureUser(userId);
        await database.insert(agentTokens).values({
          createdAt: new Date(token.createdAt),
          id: token.id,
          label: token.label,
          lastUsedAt: null,
          revokedAt: null,
          secretHash: token.secretHash,
          userId,
        });
      },
      list: async (userId) => {
        const rows = await database
          .select()
          .from(agentTokens)
          .where(eq(agentTokens.userId, userId))
          .orderBy(desc(agentTokens.createdAt));
        return rows.map(tokenOf);
      },
      lookup: async (secretHash) => {
        const rows = await database
          .select()
          .from(agentTokens)
          .where(eq(agentTokens.secretHash, secretHash))
          .limit(1);
        const [row] = rows;
        if (row === undefined || row.revokedAt !== null) {
          return null;
        }
        const owner = decodeUserId(row.userId);
        return Result.isSuccess(owner)
          ? { token: tokenOf(row), userId: owner.success }
          : null;
      },
      revoke: async (userId, id) => {
        await database
          .update(agentTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)));
      },
      touch: async (id, at) => {
        await database
          .update(agentTokens)
          .set({ lastUsedAt: new Date(at) })
          .where(eq(agentTokens.id, id));
      },
    },
    sales: {
      byId: async (id) => {
        const rows = await database
          .select()
          .from(sales)
          .where(eq(sales.id, id))
          .limit(1);
        const [row] = rows;
        return row === undefined ? null : saleOf(row);
      },
      byPaymentHash: async (paymentHash) => {
        const rows = await database
          .select()
          .from(sales)
          .where(eq(sales.paymentHash, paymentHash))
          .limit(1);
        const [row] = rows;
        return row === undefined ? null : saleOf(row);
      },
      byTransaction: async (network, transactionId) => {
        const rows = await database
          .select()
          .from(sales)
          .where(
            and(
              eq(sales.network, network),
              eq(sales.transactionId, transactionId)
            )
          )
          .limit(1);
        const [row] = rows;
        return row === undefined ? null : saleOf(row);
      },
      record: async (sale) => {
        // Insert-or-return on the hash, across processes: the unique index
        // decides who recorded the sale, the way the spends index decides who
        // may pay.
        const inserted = await database
          .insert(sales)
          .values({
            amount: sale.amount,
            asset: sale.asset,
            createdAt: new Date(sale.at),
            deliveredAt:
              sale.deliveredAt === null ? null : new Date(sale.deliveredAt),
            error: sale.error,
            id: sale.id,
            network: sale.network,
            payer: sale.payer,
            paymentHash: sale.paymentHash,
            resource: sale.resource,
            result: sale.result,
            status: sale.status,
            stubbed: sale.stubbed,
            transactionId: sale.transactionId,
          })
          .onConflictDoNothing({ target: sales.paymentHash })
          .returning();
        if (inserted.length > 0) {
          return { created: true, sale };
        }
        const rows = await database
          .select()
          .from(sales)
          .where(eq(sales.paymentHash, sale.paymentHash))
          .limit(1);
        const [row] = rows;
        const existing = row === undefined ? null : saleOf(row);
        if (existing === null) {
          throw new Error(
            `Sale ${sale.paymentHash} neither inserted nor found.`
          );
        }
        return { created: false, sale: existing };
      },
      update: async (id, patch) => {
        // Built field by field: an absent patch key means "leave it", and a
        // spread of `undefined` would write a null over a value we meant to keep.
        const set: Partial<typeof sales.$inferInsert> = {};
        if (patch.deliveredAt !== undefined) {
          set.deliveredAt =
            patch.deliveredAt === null ? null : new Date(patch.deliveredAt);
        }
        if (patch.error !== undefined) {
          set.error = patch.error;
        }
        if (patch.result !== undefined) {
          set.result = patch.result;
        }
        if (patch.status !== undefined) {
          set.status = patch.status;
        }
        if (patch.stubbed !== undefined) {
          set.stubbed = patch.stubbed;
        }
        if (patch.transactionId !== undefined) {
          set.transactionId = patch.transactionId;
        }
        await database.update(sales).set(set).where(eq(sales.id, id));
      },
    },
    tasks: {
      activeBrowses: async () => {
        const rows = await database
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.kind, "browse"),
              or(
                inArray(tasks.status, [
                  "paid",
                  "running",
                  "paused",
                  "awaiting_approval",
                  "uncertain",
                ]),
                and(
                  eq(tasks.status, "quoted"),
                  raw`(${tasks.result}->>'paymentSigning' = 'true' OR ${tasks.result}->>'paymentProofHash' IS NOT NULL)`
                )
              )
            )
          );
        return rows.flatMap((row) => {
          const task = taskOf(row);
          const owner = decodeUserId(row.userId);
          return task === null || owner._tag === "Failure"
            ? []
            : [{ userId: owner.success, task }];
        });
      },
      claim: async (userId, id, expected, patch) => {
        const rows = await database
          .update(tasks)
          .set({ ...patch, updatedAt: new Date(patch.updatedAt) })
          .where(
            and(
              eq(tasks.userId, userId),
              eq(tasks.id, id),
              eq(tasks.status, expected)
            )
          )
          .returning({ id: tasks.id });
        return rows.length === 1;
      },
      byId: async (userId, id) => {
        const rows = await database
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
          .limit(1);
        const [row] = rows;
        return row === undefined ? null : taskOf(row);
      },
      byIdempotencyKey: async (userId, key) => {
        const rows = await database
          .select()
          .from(tasks)
          .where(and(eq(tasks.userId, userId), eq(tasks.idempotencyKey, key)))
          .limit(1);
        const [row] = rows;
        return row === undefined ? null : taskOf(row);
      },
      bySaleId: async (userId, saleId) => {
        const rows = await database
          .select()
          .from(tasks)
          .where(and(eq(tasks.userId, userId), eq(tasks.saleId, saleId)))
          .limit(1);
        const [row] = rows;
        return row === undefined ? null : taskOf(row);
      },
      create: async (userId, task) => {
        await ensureUser(userId);
        await database.insert(tasks).values({
          agentTokenId: task.agentTokenId,
          connectionId: task.connectionId,
          createdAt: new Date(task.createdAt),
          error: task.error,
          id: task.id,
          idempotencyKey: task.idempotencyKey,
          input: task.input,
          kind: task.kind,
          priceUsdMicros: task.priceUsdMicros,
          result: task.result,
          runId: task.runId,
          saleId: task.saleId,
          chargeId: task.chargeId ?? null,
          priceCreditUnits: task.priceCreditUnits ?? null,
          chargeStatus: task.chargeStatus ?? null,
          status: task.status,
          updatedAt: new Date(task.updatedAt),
          userId,
        });
      },
      list: async (userId, limit) => {
        const rows = await database
          .select()
          .from(tasks)
          .where(eq(tasks.userId, userId))
          .orderBy(desc(tasks.createdAt))
          .limit(limit);
        const list: Task[] = [];
        for (const row of rows) {
          const task = taskOf(row);
          if (task !== null) {
            list.push(task);
          }
        }
        return list;
      },
      update: async (userId, id, patch) => {
        const set: Partial<typeof tasks.$inferInsert> = {
          updatedAt: new Date(patch.updatedAt),
        };
        if (patch.error !== undefined) {
          set.error = patch.error;
        }
        if (patch.result !== undefined) {
          set.result = patch.result;
        }
        if (patch.runId !== undefined) {
          set.runId = patch.runId;
        }
        if (patch.saleId !== undefined) {
          set.saleId = patch.saleId;
        }
        if (patch.status !== undefined) {
          set.status = patch.status;
        }
        await database
          .update(tasks)
          .set(set)
          .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
      },
      expireInFlight: async ({ kind, statuses, before, error, now }) => {
        const rows = await database
          .update(tasks)
          .set({ status: "uncertain", error, updatedAt: new Date(now) })
          .where(
            and(
              eq(tasks.kind, kind),
              inArray(tasks.status, [...statuses]),
              lt(tasks.updatedAt, new Date(before))
            )
          )
          .returning({ id: tasks.id });
        return rows.length;
      },
    },
    directory: {
      add: async (userId, entry) => {
        await ensureUser(userId);
        await database
          .insert(directory)
          .values({
            amount: entry.amount,
            asset: entry.asset,
            createdAt: new Date(entry.addedAt),
            host: entry.host,
            id: entry.id,
            label: entry.label,
            network: entry.network,
            payTo: entry.payTo,
            url: entry.url,
            userId,
          })
          .onConflictDoUpdate({
            set: {
              amount: entry.amount,
              asset: entry.asset,
              host: entry.host,
              label: entry.label,
              network: entry.network,
              payTo: entry.payTo,
            },
            target: [directory.userId, directory.url],
          });
      },
      list: async (userId) => {
        const rows = await database
          .select()
          .from(directory)
          .where(eq(directory.userId, userId))
          .orderBy(asc(directory.createdAt));
        const listed: DirectoryEntry[] = [];
        for (const row of rows) {
          if (DirectoryId.is(row.id)) {
            listed.push({
              addedAt: row.createdAt.getTime(),
              amount: row.amount,
              asset: row.asset,
              host: row.host,
              id: row.id,
              label: row.label,
              network: row.network,
              payTo: row.payTo,
              url: row.url,
            });
          }
        }
        return listed;
      },
      remove: async (userId, id) => {
        if (!DirectoryId.is(id)) {
          return;
        }
        await database
          .delete(directory)
          .where(and(eq(directory.userId, userId), eq(directory.id, id)));
      },
    },
    telegram: {
      forUser: async (userId) => {
        const rows = await database
          .select({
            since: telegramPairings.createdAt,
            telegramUserId: telegramPairings.telegramUserId,
            threadId: telegramPairings.threadId,
          })
          .from(telegramPairings)
          .where(eq(telegramPairings.userId, userId))
          .limit(1);
        const [row] = rows;
        return row === undefined
          ? null
          : {
              since: row.since.getTime(),
              telegramUserId: row.telegramUserId,
              threadId: row.threadId,
            };
      },
      lookup: async (telegramUserId) => {
        const rows = await database
          .select({ userId: telegramPairings.userId })
          .from(telegramPairings)
          .where(eq(telegramPairings.telegramUserId, telegramUserId))
          .limit(1);
        const [row] = rows;
        if (row === undefined) {
          return null;
        }
        const decoded = decodeUserId(row.userId);
        return Result.isSuccess(decoded) ? decoded.success : null;
      },
      pair: async (userId, pairing) => {
        await ensureUser(userId);
        // Either side may have been paired before; both old rows go.
        await database
          .delete(telegramPairings)
          .where(eq(telegramPairings.userId, userId));
        await database
          .delete(telegramPairings)
          .where(eq(telegramPairings.telegramUserId, pairing.telegramUserId));
        await database.insert(telegramPairings).values({
          createdAt: new Date(pairing.since),
          telegramUserId: pairing.telegramUserId,
          threadId: pairing.threadId,
          userId,
        });
      },
      unpair: async (userId) => {
        await database
          .delete(telegramPairings)
          .where(eq(telegramPairings.userId, userId));
      },
    },
    schedules: {
      cancel: async (userId, id) => {
        const rows = await database
          .update(schedules)
          .set({ claimedAt: null, nextRunAt: null, status: "cancelled" })
          .where(
            and(
              eq(schedules.id, id),
              eq(schedules.userId, userId),
              eq(schedules.status, "active")
            )
          )
          .returning({ id: schedules.id });
        return rows.length > 0;
      },
      claimDue: async (now, staleMs) => {
        // One statement claims and reads: the rows it returns are the rows
        // it marked, so a second ticker on the same database, running the
        // same statement a moment later, finds them claimed and takes none.
        const rows = await database
          .update(schedules)
          .set({ claimedAt: new Date(now) })
          .where(
            and(
              eq(schedules.status, "active"),
              lte(schedules.nextRunAt, new Date(now)),
              or(
                isNull(schedules.claimedAt),
                lt(schedules.claimedAt, new Date(now - staleMs))
              )
            )
          )
          .returning();
        const due: DueSchedule[] = [];
        for (const row of rows) {
          const schedule = scheduleOf(row);
          const owner = decodeUserId(row.userId);
          if (schedule !== null && Result.isSuccess(owner)) {
            due.push({ claimedAt: now, schedule, userId: owner.success });
          }
        }
        return due;
      },
      create: async (userId, schedule) => {
        await ensureUser(userId);
        await database
          .insert(schedules)
          .values(scheduleInsert(userId, schedule));
      },
      digestOf: async (userId) => {
        const rows = await database
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.userId, userId),
              eq(schedules.status, "active"),
              raw`${schedules.action}->>'_tag' = 'digest'`
            )
          )
          .limit(1);
        const [row] = rows;
        return row === undefined ? null : scheduleOf(row);
      },
      finish: async (id, claimedAt, patch) => {
        const set: Partial<typeof schedules.$inferInsert> = {
          claimedAt: null,
          nextRunAt:
            patch.nextRunAt === null ? null : new Date(patch.nextRunAt),
          status: patch.status,
        };
        if (patch.lastRunAt !== undefined) {
          set.lastRunAt = new Date(patch.lastRunAt);
        }
        const rows = await database
          .update(schedules)
          .set(set)
          .where(
            and(
              eq(schedules.id, id),
              eq(schedules.status, "active"),
              eq(schedules.claimedAt, new Date(claimedAt))
            )
          )
          .returning({ id: schedules.id });
        return rows.length > 0;
      },
      list: async (userId) => {
        const rows = await database
          .select()
          .from(schedules)
          .where(eq(schedules.userId, userId))
          .orderBy(desc(schedules.createdAt))
          .limit(100);
        return schedulesOf(rows);
      },
      saveDigest: async (userId, schedule) => {
        await ensureUser(userId);
        await database
          .update(schedules)
          .set({ claimedAt: null, nextRunAt: null, status: "cancelled" })
          .where(
            and(
              eq(schedules.userId, userId),
              eq(schedules.status, "active"),
              raw`${schedules.action}->>'_tag' = 'digest'`
            )
          );
        if (schedule !== null) {
          await database
            .insert(schedules)
            .values(scheduleInsert(userId, schedule));
        }
      },
      timezoneFor: async (userId) => {
        const rows = await database
          .select({ timezone: schedules.timezone })
          .from(schedules)
          .where(eq(schedules.userId, userId))
          .orderBy(desc(schedules.createdAt))
          .limit(1);
        return rows[0]?.timezone ?? null;
      },
    },
    forget: async (userId) => {
      await watchlist.forget(userId);
      await monitoring.forget(userId);
      await database
        .delete(browserProfiles)
        .where(eq(browserProfiles.userId, userId));
      await history.clearTelegramCache(userId);
      await history.forget(userId);
      await database.delete(purchases).where(eq(purchases.userId, userId));
      await database
        .delete(walletRequests)
        .where(eq(walletRequests.userId, userId));
      await database
        .delete(walletConnections)
        .where(eq(walletConnections.userId, userId));
      await database
        .delete(agentInvocations)
        .where(eq(agentInvocations.userId, userId));
      await database.delete(tasks).where(eq(tasks.userId, userId));
      await database
        .delete(oauthTokens)
        .where(
          inArray(
            oauthTokens.grantId,
            database
              .select({ id: oauthGrants.id })
              .from(oauthGrants)
              .where(eq(oauthGrants.userId, userId))
          )
        );
      await database.delete(oauthGrants).where(eq(oauthGrants.userId, userId));
      await database.delete(agentTokens).where(eq(agentTokens.userId, userId));
      await database.delete(directory).where(eq(directory.userId, userId));
      await database.delete(schedules).where(eq(schedules.userId, userId));
      await database
        .delete(telegramPairings)
        .where(eq(telegramPairings.userId, userId));
      await database.delete(receipts).where(eq(receipts.userId, userId));
      await database.delete(mandates).where(eq(mandates.userId, userId));
      // The row itself stays: the ledger's spends reference it, and a spend
      // is a money record that outlives the person's preferences. The pocket
      // goes back to null, so a returning person is credited once more. The
      // Hedera account stays too: it holds their money.
      //
      // The policy does *not* stay. It is standing authority rather than money,
      // and a person who asked to be forgotten must not leave a signature the
      // agent can still use. Clearing it here only forgets the id; revoking it
      // at Privy is a separate act, and both have to happen.
      await database
        .update(users)
        .set({
          pocketUsdMicros: null,
          privyPolicyAllowance: null,
          privyPolicyExpiresAt: null,
          privyPolicyId: null,
          setupSeenAt: null,
        })
        .where(eq(users.did, userId));
    },
    hedera: {
      loadReceiving: loadHederaReceiving,
      prepareReceiving: async (userId, custody) => {
        await ensureUser(userId);
        await database
          .update(users)
          .set({
            hederaPrivyWalletId: custody.walletId,
            hederaPublicKey: custody.publicKey,
          })
          .where(
            and(
              eq(users.did, userId),
              isNull(users.hederaAccountId),
              isNull(users.hederaPrivyWalletId),
              isNull(users.hederaKeyCiphertext)
            )
          );
        const record = await loadHederaReceiving(userId);
        if (record === null) {
          throw new Error("The receiving key could not be persisted.");
        }
        return record;
      },
      load: async (userId) => {
        const record = await loadHederaReceiving(userId);
        return record === null || record.accountId === null
          ? null
          : { accountId: record.accountId, custody: record.custody };
      },
      save: async (userId, record) => {
        await ensureUser(userId);
        await database
          .update(users)
          .set({
            hederaAccountId: record.accountId,
            hederaKeyCiphertext:
              record.custody.kind === "sealed"
                ? record.custody.keyCiphertext
                : null,
            hederaPrivyWalletId:
              record.custody.kind === "privy" ? record.custody.walletId : null,
            hederaPublicKey:
              record.custody.kind === "privy" ? record.custody.publicKey : null,
          })
          .where(eq(users.did, userId));
      },
    },
    privyPolicy: {
      clear: async (userId) => {
        await database
          .update(users)
          .set({
            privyPolicyAllowance: null,
            privyPolicyExpiresAt: null,
            privyPolicyId: null,
          })
          .where(eq(users.did, userId));
      },
      expiringBefore: async (at) => {
        const rows = await database
          .select({ did: users.did })
          .from(users)
          .where(
            and(
              isNotNull(users.privyPolicyId),
              lt(users.privyPolicyExpiresAt, new Date(at))
            )
          );
        return rows.map((row) => toUserId(row.did));
      },
      load: async (userId) => {
        const rows = await database
          .select({
            allowance: users.privyPolicyAllowance,
            policyId: users.privyPolicyId,
          })
          .from(users)
          .where(eq(users.did, userId))
          .limit(1);
        const [row] = rows;
        if (row === undefined || row.policyId === null) {
          return null;
        }
        // The allowance is decoded rather than trusted. It is what the mandate's
        // ceilings are built from, so a row that has drifted from the schema
        // must read as "no policy" and be minted again, never as a silently
        // wrong cap.
        const decoded = decodeAllowance(row.allowance);
        if (Result.isFailure(decoded)) {
          return null;
        }
        return { allowance: decoded.success, policyId: row.policyId };
      },
      save: async (userId, record) => {
        await ensureUser(userId);
        await database
          .update(users)
          .set({
            privyPolicyAllowance: record.allowance,
            // Denormalised from the allowance so an expiry sweep can find rows
            // by date without decoding every person's JSON.
            privyPolicyExpiresAt: new Date(record.allowance.expiresAt),
            privyPolicyId: record.policyId,
          })
          .where(eq(users.did, userId));
      },
    },
    setup: {
      load: async (userId) => {
        const rows = await database
          .select({ seenAt: users.setupSeenAt })
          .from(users)
          .where(eq(users.did, userId))
          .limit(1);
        const [row] = rows;
        return row === undefined || row.seenAt === null
          ? null
          : row.seenAt.getTime();
      },
      save: async (userId, seenAt) => {
        await ensureUser(userId);
        await database
          .update(users)
          .set({ setupSeenAt: seenAt === null ? null : new Date(seenAt) })
          .where(eq(users.did, userId));
      },
    },
    pocket: {
      adjust: async (userId, deltaUsdMicros) => {
        await ensureUser(userId);
        // One statement, so two concurrent adjustments serialise on the row
        // rather than both reading the same balance and both writing over it.
        const rows = await database
          .update(users)
          .set({
            pocketUsdMicros: raw<number>`GREATEST(COALESCE(${users.pocketUsdMicros}, 0) + ${deltaUsdMicros}, 0)`,
          })
          .where(eq(users.did, userId))
          .returning({ balance: users.pocketUsdMicros });
        return rows[0]?.balance ?? 0;
      },
      load: async (userId) => {
        const rows = await database
          .select({ balance: users.pocketUsdMicros })
          .from(users)
          .where(eq(users.did, userId))
          .limit(1);
        return rows[0]?.balance ?? null;
      },
    },
    mandates: {
      load: async (userId) => {
        const rows = await database
          .select({ document: mandates.document })
          .from(mandates)
          .where(eq(mandates.userId, userId))
          .limit(1);
        const [row] = rows;
        if (row === undefined) {
          return null;
        }
        const decoded = decodeMandate(row.document);
        return Result.isSuccess(decoded) ? decoded.success : null;
      },
      save: async (userId, mandate) => {
        await ensureUser(userId);
        await database
          .insert(mandates)
          .values({ document: mandate, updatedAt: new Date(), userId })
          .onConflictDoUpdate({
            set: { document: mandate, updatedAt: new Date() },
            target: mandates.userId,
          });
      },
    },
    receipts: {
      forRun: async (userId, runId) => {
        const rows = await database
          .select({ document: receipts.document })
          .from(receipts)
          .where(
            and(
              eq(receipts.userId, userId),
              raw`${receipts.document}->>'runId' = ${runId}`
            )
          )
          .orderBy(asc(receipts.createdAt))
          .limit(100);
        return readReceipts(rows.map((row) => row.document));
      },
      byIds: async (userId, ids) => {
        if (ids.length === 0) {
          return [];
        }
        const rows = await database
          .select({ document: receipts.document })
          .from(receipts)
          .where(
            and(
              eq(receipts.userId, userId),
              inArray(receipts.id, ids.slice(0, 100))
            )
          )
          .limit(100);
        return readReceipts(rows.map((row) => row.document));
      },
      append: async (userId, receipt) => {
        await ensureUser(userId);
        await database
          .insert(receipts)
          .values({
            createdAt: new Date(receipt.at),
            document: receipt,
            id: receipt.id,
            sessionId: receipt.sessionId,
            spendId: receipt.spendId,
            stubbed: receipt.stubbed,
            userId,
          })
          .onConflictDoNothing();
      },
      recent: async (userId, limit) => {
        const rows = await database
          .select({ document: receipts.document })
          .from(receipts)
          .where(eq(receipts.userId, userId))
          .orderBy(desc(receipts.createdAt))
          .limit(limit);
        return readReceipts(rows.map((row) => row.document));
      },
    },
  };
};
