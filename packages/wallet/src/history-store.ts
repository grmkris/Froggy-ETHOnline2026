import { ActivityEventId, HistoryRecord } from "@froggy/domain";
import type {
  ConversationId,
  HistoryEvent,
  HistoryId,
  RunId,
  UserId,
} from "@froggy/domain";
import { Schema } from "effect";

export interface HistoryFilter {
  readonly kind: HistoryRecord["kind"];
  readonly conversationId?: ConversationId;
  readonly runId?: RunId;
  readonly rootOnly?: boolean;
  readonly externalKey?: string;
  readonly source?: string;
  readonly status?: string;
  readonly since?: number;
  readonly connectionId?: string;
  readonly search?: string;
  readonly before?: string;
  readonly limit?: number;
}
export interface HistoryOwner {
  sequence: number;
  leaseEpoch: number;
  leaseExpiresAt: number;
  activeRunId: RunId | null;
}
export interface HistoryReader {
  readonly get: (id: HistoryId) => Promise<HistoryRecord | null>;
  readonly list: (filter: HistoryFilter) => Promise<readonly HistoryRecord[]>;
}
export interface HistoryTransaction extends HistoryReader {
  readonly owner: HistoryOwner;
  readonly save: (
    record: HistoryRecord,
    expectedRevision: number
  ) => Promise<HistoryRecord>;
  readonly remove: (id: HistoryId) => Promise<void>;
}
export const TelegramCacheMessage = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  text: Schema.String,
  author: Schema.Struct({ isMe: Schema.Boolean }),
  metadata: Schema.Struct({ dateSent: Schema.String }),
});
export type TelegramCacheMessage = typeof TelegramCacheMessage.Type;
export interface HistoryStore {
  readonly subscribe: (
    listener: (userId: UserId, sequence: number) => void
  ) => () => void;
  readonly telegramCache: (
    userId: UserId
  ) => Promise<readonly TelegramCacheMessage[]>;
  readonly clearTelegramCache: (
    userId: UserId,
    conversationId?: ConversationId
  ) => Promise<void>;
  readonly transaction: <T>(
    userId: UserId,
    action: (tx: HistoryTransaction) => Promise<T>
  ) => Promise<T>;
  readonly get: (
    userId: UserId,
    id: HistoryId
  ) => Promise<HistoryRecord | null>;
  readonly list: (
    userId: UserId,
    filter: HistoryFilter
  ) => Promise<readonly HistoryRecord[]>;
  readonly changes: (
    userId: UserId,
    after: number
  ) => Promise<{
    readonly events: readonly HistoryEvent[];
    readonly cursor: number;
    readonly hasMore: boolean;
  }>;
  readonly forget: (userId: UserId) => Promise<void>;
}
type HistoryBackend = Omit<HistoryStore, "subscribe">;
export const observeHistoryStore = (backend: HistoryBackend): HistoryStore => {
  const listeners = new Set<(userId: UserId, sequence: number) => void>();
  return {
    ...backend,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    transaction: async (userId, action) => {
      let committed = 0;
      const result = await backend.transaction(userId, async (tx) => {
        const before = tx.owner.sequence;
        const value = await action(tx);
        if (tx.owner.sequence > before) {
          committed = tx.owner.sequence;
        }
        return value;
      });
      if (committed > 0) {
        for (const listener of listeners) {
          try {
            listener(userId, committed);
          } catch {
            console.warn(
              "History notification unavailable; committed changes remain recoverable."
            );
          }
        }
      }
      return result;
    },
  };
};
export class HistoryConflictError extends Error {
  constructor(
    message = "This conversation changed. Reload it before sending again."
  ) {
    super(message);
    this.name = "HistoryConflictError";
  }
}
export const historyKey = (record: HistoryRecord): string | null => {
  if (record.kind === "conversation") {
    return record.externalKey;
  }
  if (record.kind === "message") {
    return `${record.conversationId}:${record.clientId}`;
  }
  if (record.kind === "execution") {
    return (
      record.invocationId ??
      (record.runId === null ? null : `${record.runId}:${record.toolCallId}`)
    );
  }
  return null;
};
const TextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});
export const historyText = (record: HistoryRecord): string => {
  switch (record.kind) {
    case "conversation": {
      return `${record.title} ${record.preview}`;
    }
    case "message": {
      return record.parts
        .flatMap((part) => {
          const parsed = Schema.decodeUnknownResult(TextPart)(part);
          return parsed._tag === "Success" ? [parsed.success.text] : [];
        })
        .join("\n");
    }
    case "execution": {
      return `${record.name} ${record.input} ${record.result}`;
    }
    case "artifact": {
      return `${record.title} ${record.content}`;
    }
    case "run": {
      return record.error ?? "";
    }
  }
  throw new Error("Unsupported history record.");
};
export const historyCursor = (record: HistoryRecord): string =>
  `${record.kind === "conversation" ? record.updatedAt : record.createdAt}:${record.id}`;
export const historyLimit = (limit = 50): number =>
  Math.max(1, Math.min(50, Math.floor(limit)));
export const historyEvent = (
  owner: HistoryOwner,
  record: HistoryRecord,
  deleted = false
): HistoryEvent => {
  owner.sequence += 1;
  return {
    v: 1,
    id: ActivityEventId.generate(),
    sequence: owner.sequence,
    entityId: record.id,
    kind: record.kind,
    revision: record.revision,
    deleted,
    recordedAt: Date.now(),
  };
};
const emptyOwner = (): HistoryOwner => ({
  sequence: 0,
  leaseEpoch: 0,
  leaseExpiresAt: 0,
  activeRunId: null,
});
const matchingSource = (
  record: HistoryRecord,
  filter: HistoryFilter
): boolean =>
  (filter.since === undefined || record.createdAt >= filter.since) &&
  (filter.source === undefined || record.source === filter.source);
const matchingSearch = (
  record: HistoryRecord,
  filter: HistoryFilter,
  records: Map<HistoryId, HistoryRecord>
): boolean => {
  if (filter.search === undefined) {
    return true;
  }
  const search = filter.search.toLowerCase();
  return (
    historyText(record).toLowerCase().includes(search) ||
    (record.kind === "conversation" &&
      [...records.values()].some(
        (message) =>
          message.kind === "message" &&
          message.conversationId === record.id &&
          historyText(message).toLowerCase().includes(search)
      ))
  );
};
const matchingRoot = (record: HistoryRecord, filter: HistoryFilter): boolean =>
  filter.rootOnly !== true || !("runId" in record) || record.runId === null;
const matching = (record: HistoryRecord, filter: HistoryFilter): boolean =>
  (filter.conversationId === undefined ||
    ("conversationId" in record &&
      record.conversationId === filter.conversationId)) &&
  (filter.runId === undefined ||
    ("runId" in record && record.runId === filter.runId)) &&
  (filter.externalKey === undefined ||
    historyKey(record) === filter.externalKey) &&
  matchingRoot(record, filter) &&
  matchingSource(record, filter) &&
  (filter.status === undefined ||
    ("status" in record && record.status === filter.status)) &&
  (filter.connectionId === undefined ||
    ("connectionId" in record &&
      record.connectionId === filter.connectionId)) &&
  (filter.search === undefined ||
    historyText(record).toLowerCase().includes(filter.search.toLowerCase())) &&
  (filter.before === undefined || historyCursor(record) < filter.before);

export const memoryHistoryStore = (): HistoryStore => {
  const owners = new Map<UserId, HistoryOwner>();
  const rows = new Map<UserId, Map<HistoryId, HistoryRecord>>();
  const events = new Map<UserId, HistoryEvent[]>();
  const locks = new Map<UserId, Promise<void>>();
  const reader = (records: Map<HistoryId, HistoryRecord>): HistoryReader => ({
    get: async (id) =>
      await Promise.resolve(structuredClone(records.get(id) ?? null)),
    list: async (filter) => {
      const { search: _search, ...scope } = filter;
      return await Promise.resolve(
        structuredClone(
          [...records.values()]
            .filter(
              (record) =>
                record.kind === filter.kind &&
                matching(record, scope) &&
                matchingSearch(record, filter, records)
            )
            .toSorted((a, b) =>
              historyCursor(b).localeCompare(historyCursor(a))
            )
            .slice(0, historyLimit(filter.limit))
        )
      );
    },
  });
  const store: HistoryBackend = {
    telegramCache: async () => await Promise.resolve([]),
    clearTelegramCache: async () => {
      await Promise.resolve();
    },
    transaction: async (userId, action) => {
      const previous = locks.get(userId) ?? Promise.resolve();
      const gate = Promise.withResolvers<undefined>();
      locks.set(userId, gate.promise);
      await previous;
      try {
        const owner = structuredClone(owners.get(userId) ?? emptyOwner());
        const records = structuredClone(
          rows.get(userId) ?? new Map<HistoryId, HistoryRecord>()
        );
        const changes = [...(events.get(userId) ?? [])];
        const reads = reader(records);
        const result = await action({
          ...reads,
          owner,
          save: async (record, expectedRevision) => {
            await Promise.resolve();
            const existing = records.get(record.id);
            if ((existing?.revision ?? 0) !== expectedRevision) {
              throw new HistoryConflictError();
            }
            const key = historyKey(record);
            if (
              key !== null &&
              [...records.values()].some(
                (r) =>
                  r.kind === record.kind &&
                  r.id !== record.id &&
                  historyKey(r) === key
              )
            ) {
              throw new HistoryConflictError();
            }
            const saved = Schema.decodeUnknownSync(HistoryRecord)({
              ...record,
              revision: expectedRevision + 1,
            });
            records.set(saved.id, structuredClone(saved));
            changes.push(historyEvent(owner, saved));
            return saved;
          },
          remove: async (id) => {
            await Promise.resolve();
            const record = records.get(id);
            if (record !== undefined) {
              records.delete(id);
              changes.push(
                historyEvent(
                  owner,
                  { ...record, revision: record.revision + 1 },
                  true
                )
              );
            }
          },
        });
        owners.set(userId, owner);
        rows.set(userId, records);
        events.set(userId, changes);
        return result;
      } finally {
        gate.resolve();
        if (locks.get(userId) === gate.promise) {
          locks.delete(userId);
        }
      }
    },
    get: async (userId, id) =>
      await reader(rows.get(userId) ?? new Map<HistoryId, HistoryRecord>()).get(
        id
      ),
    list: async (userId, filter) =>
      await reader(
        rows.get(userId) ?? new Map<HistoryId, HistoryRecord>()
      ).list(filter),
    changes: async (userId, after) => {
      await Promise.resolve();
      const found = (events.get(userId) ?? [])
        .filter((e) => e.sequence > after)
        .slice(0, 51);
      const page = found.slice(0, 50);
      return {
        events: structuredClone(page),
        cursor: page.at(-1)?.sequence ?? after,
        hasMore: found.length > 50,
      };
    },
    forget: async (userId) => {
      await store.transaction(userId, async () => {
        await Promise.resolve();
        rows.delete(userId);
      });
      rows.delete(userId);
      events.delete(userId);
      owners.delete(userId);
    },
  };
  return observeHistoryStore(store);
};
