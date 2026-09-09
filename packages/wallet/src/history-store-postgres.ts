import {
  conversations,
  historyMessages,
  historyRuns,
  historyExecutions,
  historyArtifacts,
  historyOwners,
  historyEvents,
  users,
} from "@froggy/database";
import {
  ActivityEventId,
  ArtifactId,
  ConversationId,
  ExecutionId,
  HistoryEvent,
  HistoryRecord,
  MessageId,
  RunId,
} from "@froggy/domain";
import type { HistoryId, UserId } from "@froggy/domain";
import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  or,
  sql as raw,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import {
  observeHistoryStore,
  TelegramCacheMessage,
  HistoryConflictError,
  historyEvent,
  historyKey,
  historyLimit,
  historyText,
} from "./history-store";
import type {
  HistoryFilter,
  HistoryOwner,
  HistoryReader,
  HistoryStore,
} from "./history-store";

const tables = {
  conversation: conversations,
  message: historyMessages,
  run: historyRuns,
  execution: historyExecutions,
  artifact: historyArtifacts,
};
const identity = (id: HistoryId) => {
  if (ConversationId.is(id)) {
    return { table: conversations, uuid: ConversationId.toUuid(id) };
  }
  if (MessageId.is(id)) {
    return { table: historyMessages, uuid: MessageId.toUuid(id) };
  }
  if (RunId.is(id)) {
    return { table: historyRuns, uuid: RunId.toUuid(id) };
  }
  if (ExecutionId.is(id)) {
    return { table: historyExecutions, uuid: ExecutionId.toUuid(id) };
  }
  return { table: historyArtifacts, uuid: ArtifactId.toUuid(id) };
};
const decode = Schema.decodeUnknownSync(HistoryRecord);
type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const HistoryRecordId = Schema.Union([
  ConversationId,
  MessageId,
  RunId,
  ExecutionId,
  ArtifactId,
]);
const reader = (db: Database | Transaction, userId: UserId): HistoryReader => ({
  get: async (id) => {
    const { table, uuid } = identity(id);
    const [row] = await db
      .select({ data: table.data })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, uuid)))
      .limit(1);
    return row === undefined ? null : decode(row.data);
  },
  list: async (filter: HistoryFilter) => {
    const table = tables[filter.kind];
    const conditions = [eq(table.userId, userId)];
    const orderedAt =
      filter.kind === "conversation" ? table.updatedAt : table.createdAt;
    if (filter.since !== undefined) {
      conditions.push(gte(table.createdAt, filter.since));
    }
    if (filter.conversationId !== undefined) {
      conditions.push(
        eq(table.conversationId, ConversationId.toUuid(filter.conversationId))
      );
    }
    if (filter.rootOnly === true) {
      conditions.push(isNull(table.runId));
    }
    if (filter.runId !== undefined) {
      conditions.push(eq(table.runId, RunId.toUuid(filter.runId)));
    }
    if (filter.externalKey !== undefined) {
      conditions.push(eq(table.externalKey, filter.externalKey));
    }
    if (filter.source !== undefined) {
      conditions.push(eq(table.source, filter.source));
    }
    if (filter.status !== undefined) {
      conditions.push(eq(table.status, filter.status));
    }
    if (filter.connectionId !== undefined) {
      conditions.push(eq(table.connectionId, filter.connectionId));
    }
    if (filter.search !== undefined) {
      const ownText = raw`to_tsvector('simple', ${table.searchText}) @@ websearch_to_tsquery('simple', ${filter.search})`;
      conditions.push(
        filter.kind === "conversation"
          ? raw`(${ownText} or exists (
        select 1 from ${historyMessages} where ${historyMessages.userId} = ${userId}
        and ${historyMessages.conversationId} = ${table.id}
        and to_tsvector('simple', ${historyMessages.searchText}) @@ websearch_to_tsquery('simple', ${filter.search})
      ))`
          : ownText
      );
    }
    if (filter.before !== undefined) {
      const [time, id] = filter.before.split(":");
      const checked = Schema.decodeUnknownSync(HistoryRecordId)(id);
      const before = or(
        lt(orderedAt, Number(time)),
        and(
          eq(orderedAt, Number(time)),
          identity(checked).table === table
            ? lt(table.id, identity(checked).uuid)
            : raw`${{ conversation: "cnvrs", message: "msg", run: "run", execution: "exe", artifact: "art" }[filter.kind] < checked.slice(0, checked.indexOf("_"))}`
        )
      );
      if (before !== undefined) {
        conditions.push(before);
      }
    }
    const rows = await db
      .select({ data: table.data })
      .from(table)
      .where(and(...conditions))
      .orderBy(desc(orderedAt), desc(table.id))
      .limit(historyLimit(filter.limit));
    return rows.map((row) => decode(row.data));
  },
});

export const postgresHistoryStore = (sql: Sql): HistoryStore => {
  const database = drizzle(sql);
  const cacheAvailable = async (): Promise<boolean> => {
    const [row] = await sql<
      { present: boolean }[]
    >`select to_regclass('public.chat_state_lists') is not null as present`;
    return row?.present === true;
  };
  return observeHistoryStore({
    telegramCache: async (userId) => {
      if (!(await cacheAvailable())) {
        return [];
      }
      const rows = await sql<{ value: string }[]>`
        select c.value from chat_state_lists c
        join telegram_pairings p on c.list_key = 'msg-history:' || p.thread_id
        where p.user_id = ${userId} and c.key_prefix = 'froggy-telegram'
          and (c.expires_at is null or c.expires_at > now()) and octet_length(c.value) <= 131072
        order by c.seq desc limit 100`;
      return rows.toReversed().flatMap((row) => {
        const parsed = Schema.decodeUnknownResult(
          Schema.fromJsonString(TelegramCacheMessage)
        )(row.value);
        return parsed._tag === "Success" ? [parsed.success] : [];
      });
    },
    clearTelegramCache: async (userId, conversationId) => {
      if (!(await cacheAvailable())) {
        return;
      }
      const conversationUuid =
        conversationId === undefined
          ? null
          : ConversationId.toUuid(conversationId);
      const threads = await sql<{ thread_id: string }[]>`
        select substring(external_key from 10) as thread_id from conversations
        where user_id = ${userId} and source = 'telegram' and (${conversationUuid}::uuid is null or id = ${conversationUuid}::uuid)
        union select thread_id from telegram_pairings where user_id = ${userId} and ${conversationUuid}::uuid is null`;
      await Promise.all(
        threads.flatMap(({ thread_id: threadId }) => [
          sql`delete from chat_state_lists where key_prefix = 'froggy-telegram' and list_key = ${`msg-history:${threadId}`}`,
          sql`delete from chat_state_cache where key_prefix = 'froggy-telegram' and cache_key = ${`thread-state:${threadId}`}`,
          sql`delete from chat_state_queues where key_prefix = 'froggy-telegram' and thread_id = ${threadId}`,
          sql`delete from chat_state_subscriptions where key_prefix = 'froggy-telegram' and thread_id = ${threadId}`,
          sql`delete from chat_state_locks where key_prefix = 'froggy-telegram' and thread_id = ${threadId}`,
        ])
      );
    },
    get: async (userId, id) => await reader(database, userId).get(id),
    list: async (userId, filter) => await reader(database, userId).list(filter),
    transaction: async (userId, action) =>
      await database.transaction(async (tx) => {
        await tx.insert(users).values({ did: userId }).onConflictDoNothing();
        await tx.insert(historyOwners).values({ userId }).onConflictDoNothing();
        const [row] = await tx
          .select()
          .from(historyOwners)
          .where(eq(historyOwners.userId, userId))
          .for("update");
        if (row === undefined) {
          throw new Error("History owner missing.");
        }
        const owner: HistoryOwner = { ...row };
        const reads = reader(tx, userId);
        const append = async (record: HistoryRecord, deleted = false) => {
          const event = historyEvent(owner, record, deleted);
          await tx.insert(historyEvents).values({
            id: ActivityEventId.toUuid(event.id),
            userId,
            sequence: event.sequence,
            data: event,
          });
        };
        const result = await action({
          ...reads,
          owner,
          save: async (record, expectedRevision) => {
            const old = await reads.get(record.id);
            if ((old?.revision ?? 0) !== expectedRevision) {
              throw new HistoryConflictError();
            }
            const saved = decode({ ...record, revision: expectedRevision + 1 });
            const { table, uuid } = identity(saved.id);
            const values = {
              id: uuid,
              userId,
              conversationId:
                "conversationId" in saved && saved.conversationId !== null
                  ? ConversationId.toUuid(saved.conversationId)
                  : null,
              runId:
                "runId" in saved && saved.runId !== null
                  ? RunId.toUuid(saved.runId)
                  : null,
              externalKey: historyKey(saved),
              source: saved.source,
              status: "status" in saved ? saved.status : null,
              connectionId: "connectionId" in saved ? saved.connectionId : null,
              searchText: historyText(saved).slice(0, 65_536),
              createdAt: saved.createdAt,
              updatedAt: saved.updatedAt,
              data: saved,
            };
            const inserted = await tx
              .insert(table)
              .values(values)
              .onConflictDoUpdate({
                target: table.id,
                set: values,
                setWhere: eq(table.userId, userId),
              })
              .returning({ id: table.id });
            if (inserted.length !== 1) {
              throw new HistoryConflictError("Conversation unavailable.");
            }
            await append(saved);
            return saved;
          },
          remove: async (id) => {
            const old = await reads.get(id);
            if (old === null) {
              return;
            }
            const { table, uuid } = identity(id);
            await tx
              .delete(table)
              .where(and(eq(table.userId, userId), eq(table.id, uuid)));
            await append({ ...old, revision: old.revision + 1 }, true);
          },
        });
        await tx
          .update(historyOwners)
          .set(owner)
          .where(eq(historyOwners.userId, userId));
        return result;
      }),
    changes: async (userId, after) => {
      const found = await database
        .select()
        .from(historyEvents)
        .where(
          and(
            eq(historyEvents.userId, userId),
            gt(historyEvents.sequence, after)
          )
        )
        .orderBy(historyEvents.sequence)
        .limit(51);
      const events = found
        .slice(0, 50)
        .map((r) => Schema.decodeUnknownSync(HistoryEvent)(r.data));
      return {
        events,
        cursor: events.at(-1)?.sequence ?? after,
        hasMore: found.length > 50,
      };
    },
    forget: async (userId) => {
      await database.transaction(async (tx) => {
        await tx
          .select()
          .from(historyOwners)
          .where(eq(historyOwners.userId, userId))
          .for("update");
        await Promise.all(
          Object.values(tables).map(async (table) => {
            await tx.delete(table).where(eq(table.userId, userId));
          })
        );
        await tx.delete(historyEvents).where(eq(historyEvents.userId, userId));
        await tx.delete(historyOwners).where(eq(historyOwners.userId, userId));
      });
    },
  });
};
