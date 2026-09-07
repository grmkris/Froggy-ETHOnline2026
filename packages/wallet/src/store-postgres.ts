/**
 * The durable store: mandates, receipts, sales, tasks and tokens in Postgres.
 *
 * Receipts and mandates are stored as documents. A receipt is an immutable
 * record of a past decision, and a mandate is whatever the person last
 * saved; normalising either into columns would mean a later schema change
 * silently rewrites history.
 */

import {
  agentTokens,
  directory,
  mandates,
  oauthClients,
  oauthGrants,
  oauthTokens,
  receipts,
  sales,
  schedules,
  tasks,
  telegramPairings,
  users,
} from "@froggy/database";
import { DirectoryId, decodeUserId, OAuthScope } from "@froggy/domain";
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

import {
  decodeMandate,
  decodeSale,
  decodeSchedule,
  decodeTask,
  readReceipts,
} from "./store";
import type { DueSchedule, OAuthTokenRow, Store } from "./store";

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

export const postgresStore = (sql: Sql): Store => {
  const database = drizzle(sql);
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
  return {
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
        await database.update(sales).set(set).where(eq(sales.id, id));
      },
    },
    tasks: {
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
            due.push({ schedule, userId: owner.success });
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
      finish: async (id, patch) => {
        const set: Partial<typeof schedules.$inferInsert> = {
          claimedAt: null,
          nextRunAt:
            patch.nextRunAt === null ? null : new Date(patch.nextRunAt),
          status: patch.status,
        };
        if (patch.lastRunAt !== undefined) {
          set.lastRunAt = new Date(patch.lastRunAt);
        }
        await database.update(schedules).set(set).where(eq(schedules.id, id));
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
      await database
        .update(users)
        .set({ pocketUsdMicros: null })
        .where(eq(users.did, userId));
    },
    hedera: {
      load: async (userId) => {
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
        if (row === undefined || row.accountId === null) {
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
