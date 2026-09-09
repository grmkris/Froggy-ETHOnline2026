import {
  ApprovalId,
  ConversationId,
  ExecutionId,
  MessageId,
} from "@froggy/domain";
import type { Conversation, HistoryMessage, UserId } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";
import type {
  HistoryStore,
  HistoryTransaction,
  Store,
  TelegramCacheMessage,
} from "@froggy/wallet";

import { assertHistoryLease, historyPreview } from "./history";

const telegramConversation = async (
  tx: HistoryTransaction,
  threadId: string
): Promise<Conversation | null> => {
  const [record] = await tx.list({
    kind: "conversation",
    externalKey: `telegram:${threadId}`,
    limit: 1,
  });
  return record?.kind === "conversation" ? record : null;
};
const createTelegramConversation = (
  threadId: string,
  text: string,
  at: number
): Conversation => ({
  v: 1,
  kind: "conversation",
  id: ConversationId.generate(),
  source: "telegram",
  title: historyPreview(text, 100).text || "Telegram conversation",
  preview: historyPreview(text, 200).text,
  externalKey: `telegram:${threadId}`,
  archived: false,
  revision: 0,
  createdAt: at,
  updatedAt: at,
});
const cachedMessage = (
  conversationId: ConversationId,
  cached: TelegramCacheMessage
): HistoryMessage => {
  const at = Date.parse(cached.metadata.dateSent);
  const safe = historyPreview(cached.text, 60_000);
  return {
    v: 1,
    kind: "message",
    id: MessageId.generate(),
    source: "telegram",
    conversationId,
    runId: null,
    clientId: `tg-${cached.id}`,
    role: cached.author.isMe ? "assistant" : "user",
    parts: [{ type: "text", text: safe.text }],
    truncated: safe.truncated,
    recovered: true,
    status: "completed",
    delivery: "delivered",
    revision: 0,
    createdAt: at,
    updatedAt: at,
  };
};
/** Only the first binding imports the expiring SDK cache. Its contents never
 * replace an existing archive, and importing does not start a model or tool. */
export const recoverTelegramHistory = async (
  store: Store,
  userId: UserId,
  excludeId?: string
): Promise<void> => {
  const pairing = await store.telegram.forUser(userId);
  if (pairing === null) {
    return;
  }
  const existing = await store.history.list(userId, {
    kind: "conversation",
    externalKey: `telegram:${pairing.threadId}`,
    limit: 1,
  });
  if (existing.length > 0) {
    return;
  }
  const cached = await store.history.telegramCache(userId);
  const messages = cached.filter(
    (m) =>
      m.threadId === pairing.threadId &&
      `tg-${m.id}` !== excludeId &&
      Number.isFinite(Date.parse(m.metadata.dateSent))
  );
  if (messages.length === 0) {
    return;
  }
  await store.history.transaction(userId, async (tx) => {
    if ((await telegramConversation(tx, pairing.threadId)) !== null) {
      return;
    }
    const [first] = messages;
    if (first === undefined) {
      return;
    }
    const conversation = createTelegramConversation(
      pairing.threadId,
      first.text,
      Date.parse(first.metadata.dateSent)
    );
    const last = messages.at(-1);
    await tx.save(
      {
        ...conversation,
        updatedAt:
          last === undefined
            ? conversation.updatedAt
            : Date.parse(last.metadata.dateSent),
      },
      0
    );
    // Some SDK versions cache a sent message twice. Platform IDs, not timing,
    // identify those copies; the archive keeps one canonical message.
    const unique = new Map(messages.map((message) => [message.id, message]));
    await Promise.all(
      [...unique.values()].map(async (message) => {
        await tx.save(cachedMessage(conversation.id, message), 0);
      })
    );
  });
};
/** The SDK combines a burst into its latest handler. Keep preceding inputs as
 * context without scheduling extra turns or repeating their side effects. */
export const recordTelegramQueued = async (
  store: Store,
  userId: UserId,
  messages: readonly TelegramCacheMessage[]
): Promise<void> => {
  const pairing = await store.telegram.forUser(userId);
  if (pairing === null) {
    return;
  }
  const queued = messages
    .slice(-100)
    .filter(
      (message) =>
        message.threadId === pairing.threadId &&
        !message.author.isMe &&
        Number.isFinite(Date.parse(message.metadata.dateSent))
    );
  const [first] = queued;
  if (first === undefined) {
    return;
  }
  await store.history.transaction(userId, async (tx) => {
    const existing = await telegramConversation(tx, pairing.threadId);
    const conversation =
      existing ??
      createTelegramConversation(
        pairing.threadId,
        first.text,
        Date.parse(first.metadata.dateSent)
      );
    if (existing === null) {
      await tx.save(conversation, 0);
    }
    const unique = new Map(queued.map((message) => [message.id, message]));
    await Promise.all(
      [...unique.values()].map(async (message) => {
        const found = await tx.list({
          kind: "message",
          externalKey: `${conversation.id}:tg-${message.id}`,
          limit: 1,
        });
        if (found.length === 0) {
          await tx.save(
            { ...cachedMessage(conversation.id, message), recovered: false },
            0
          );
        }
      })
    );
  });
};
export const recordTelegramIntent = async (
  store: Store,
  userId: UserId,
  threadId: string,
  text: string
): Promise<MessageId> => {
  await recoverTelegramHistory(store, userId);
  return await store.history.transaction(userId, async (tx) => {
    const now = Date.now();
    const existing = await telegramConversation(tx, threadId);
    const conversation =
      existing ?? createTelegramConversation(threadId, text, now);
    await tx.save(
      {
        ...conversation,
        preview: historyPreview(text, 200).text,
        updatedAt: now,
      },
      conversation.revision
    );
    const id = MessageId.generate();
    const safe = historyPreview(text, 60_000);
    await tx.save(
      {
        v: 1,
        kind: "message",
        id,
        source: "telegram",
        conversationId: conversation.id,
        runId: null,
        clientId: id,
        role: "assistant",
        parts: [{ type: "text", text: safe.text }],
        truncated: safe.truncated,
        recovered: false,
        status: "completed",
        delivery: "pending",
        revision: 0,
        createdAt: now,
        updatedAt: now,
      },
      0
    );
    return id;
  });
};
export const recordTelegramDelivery = async (
  store: HistoryStore,
  userId: UserId,
  messageId: MessageId,
  platformId: string | null
): Promise<void> => {
  await store.transaction(userId, async (tx) => {
    const message = await tx.get(messageId);
    if (message?.kind !== "message") {
      return;
    }
    await tx.save(
      {
        ...message,
        clientId: platformId === null ? message.clientId : `tg-${platformId}`,
        delivery: platformId === null ? "uncertain" : "delivered",
        updatedAt: Date.now(),
      },
      message.revision
    );
  });
};

export const recoverAgentHistory = async (
  store: Store,
  userId: UserId
): Promise<void> => {
  const invocations = await store.invocations.recent(userId);
  await store.history.transaction(userId, async (tx) => {
    await Promise.all(
      invocations
        .filter(
          (row) => row.outcome !== "started" || row.at < Date.now() - 600_000
        )
        .map(async (row) => {
          const existing = await tx.list({
            kind: "execution",
            externalKey: row.id,
            limit: 1,
          });
          const [record] = existing;
          if (record !== undefined) {
            if (
              record.kind === "execution" &&
              record.status === "running" &&
              record.createdAt < Date.now() - 600_000
            ) {
              await tx.save(
                {
                  ...record,
                  status: "uncertain",
                  outcome:
                    row.outcome === "started" ? "interrupted" : row.outcome,
                  result:
                    "The call ended without a saved outcome. Inspect its linked business record before retrying.",
                  taskId: record.taskId ?? row.taskId,
                  updatedAt: Date.now(),
                },
                record.revision
              );
            }
            return;
          }
          await tx.save(
            {
              v: 1,
              kind: "execution",
              id: ExecutionId.generate(),
              source: "agent",
              revision: 0,
              conversationId: null,
              runId: null,
              invocationId: row.id,
              connectionId: row.connectionId,
              toolCallId: row.id,
              name: row.name,
              input:
                "Unavailable: this call predates detailed history capture.",
              result:
                "Only the original invocation metadata and linked business records remain.",
              redacted: false,
              truncated: false,
              status: row.outcome === "started" ? "uncertain" : "completed",
              outcome: row.outcome,
              taskId: row.taskId,
              purchaseId: null,
              receiptIds: [],
              artifactIds: [],
              createdAt: row.at,
              updatedAt: row.at,
              finishedAt: null,
            },
            0
          );
        })
    );
  });
};

export const recordHistoryWait = async (
  store: HistoryStore,
  userId: UserId,
  request: ApprovalRequest,
  resolution: string | null
): Promise<void> => {
  const { runId } = request;
  if (runId === undefined || !ApprovalId.is(request.id)) {
    return;
  }
  const { id } = request;
  await store.transaction(userId, async (tx) => {
    const run = await tx.get(runId);
    if (run?.kind !== "run") {
      return;
    }
    assertHistoryLease(tx, run);
    const remaining = run.waits.filter((wait) => wait.id !== id);
    const wait = {
      id,
      expiresAt: request.expiresAt,
      resolution,
      request: {
        title: historyPreview(request.title, 240).text,
        amountLabel: historyPreview(request.amountLabel, 100).text,
        payeeLabel: historyPreview(request.payeeLabel, 200).text,
        purpose: historyPreview(request.purpose, 500).text,
        detail: historyPreview(request.detail, 1000).text,
        options: request.options.slice(0, 8).map((option) => ({
          id: option.id,
          kind: option.kind,
          label: historyPreview(option.label, 100).text,
        })),
      },
    };
    const waits = [...remaining, wait].slice(-20);
    const status = waits.some((entry) => entry.resolution === null)
      ? "waiting"
      : "running";
    await tx.save(
      { ...run, waits, status, updatedAt: Date.now() },
      run.revision
    );
  });
};
