import { describe, expect, test } from "bun:test";

import {
  AgentTokenId,
  ConversationId,
  ExecutionId,
  userId,
} from "@froggy/domain";
import type { HistoryExecution, UserId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";
import type { Store, TelegramCacheMessage } from "@froggy/wallet";

import {
  acceptHistory,
  checkpointHistory,
  HistoryDuplicateError,
  historyPreview,
} from "./history";
import { externalHistory, internalHistoryTool } from "./history-retrieval";
import {
  recordTelegramDelivery,
  recordTelegramIntent,
  recordTelegramQueued,
  recoverTelegramHistory,
} from "./history-sources";
import type { TaskCaller } from "./tasks";

const rejectionOf = async <T>(operation: Promise<T>): Promise<Error> => {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the operation to reject.");
};
const rejectionMessageOf = async <T>(
  operation: Promise<T>
): Promise<string> => {
  const error = await rejectionOf(operation);
  return error.message;
};
const person = (): UserId => userId(`did:privy:source-${crypto.randomUUID()}`);
const cached = (
  id: string,
  text: string,
  isMe = false
): TelegramCacheMessage => ({
  id,
  text,
  author: { isMe },
  threadId: "telegram:123",
  metadata: { dateSent: new Date(1_700_000_000_000).toISOString() },
});
const paired = async () => {
  const owner = person();
  const base = memoryStore();
  const cache = [
    cached("1", "Original question"),
    cached("2", "Original answer", true),
    cached("2", "Original answer", true),
    cached("3", "Current webhook"),
  ];
  const store: Store = {
    ...base,
    history: {
      ...base.history,
      telegramCache: async () => await Promise.resolve(cache),
    },
  };
  await store.telegram.pair(owner, {
    threadId: "telegram:123",
    telegramUserId: "123",
    since: Date.now(),
  });
  return { owner, store };
};
describe("Telegram history", () => {
  test("queued burst messages are archived once as context without starting extra runs", async () => {
    const { owner, store } = await paired();
    await recoverTelegramHistory(store, owner, "tg-3");
    const queued = [
      cached("queued-1", "First queued input"),
      cached("queued-1", "First queued input"),
      {
        ...cached("foreign", "Not this pairing"),
        threadId: "telegram:foreign",
      },
    ];
    await recordTelegramQueued(store, owner, queued);
    await recordTelegramQueued(store, owner, queued);
    const records = await store.history.list(owner, { kind: "message" });
    expect(
      records.filter(
        (record) =>
          record.kind === "message" && record.clientId === "tg-queued-1"
      )
    ).toHaveLength(1);
    expect(
      records.some(
        (record) =>
          record.kind === "message" && record.clientId === "tg-foreign"
      )
    ).toBe(false);
    expect(await store.history.list(owner, { kind: "run" })).toHaveLength(0);
  });
  test("imports only actual paired messages once and excludes the incoming webhook", async () => {
    const { owner, store } = await paired();
    await Promise.all([
      recoverTelegramHistory(store, owner, "tg-3"),
      recoverTelegramHistory(store, owner, "tg-3"),
    ]);
    const records = await store.history.list(owner, { kind: "message" });
    expect(records).toHaveLength(2);
    expect(
      records.every((record) => record.kind === "message" && record.recovered)
    ).toBe(true);
    expect(
      records
        .map((record) => (record.kind === "message" ? record.role : ""))
        .toSorted((a, b) => a.localeCompare(b))
    ).toEqual(["assistant", "user"]);
    await recoverTelegramHistory(store, person());
    const conversations = await store.history.list(owner, {
      kind: "conversation",
    });
    expect(conversations).toHaveLength(1);
    const input = {
      source: "telegram" as const,
      externalThreadId: "telegram:123",
      messages: [
        {
          id: "tg-3",
          role: "user" as const,
          parts: [{ type: "text" as const, text: "Current webhook" }],
        },
      ],
    };
    const accepted = await acceptHistory(store.history, owner, input);
    expect(accepted.messages).toHaveLength(3);
    expect(
      await rejectionOf(acceptHistory(store.history, owner, input))
    ).toBeInstanceOf(HistoryDuplicateError);
    expect(await store.history.list(owner, { kind: "run" })).toHaveLength(1);
  });
  test("outbound intent is durable before delivery and uncertainty never becomes another send", async () => {
    const { owner, store } = await paired();
    const id = await recordTelegramIntent(
      store,
      owner,
      "telegram:123",
      "Scheduled report"
    );
    const pending = await store.history.get(owner, id);
    expect(pending?.kind === "message" && pending.delivery).toBe("pending");
    await recordTelegramDelivery(store.history, person(), id, "foreign");
    expect(await store.history.get(owner, id)).toEqual(pending);
    await recordTelegramDelivery(store.history, owner, id, null);
    const uncertain = await store.history.get(owner, id);
    expect(uncertain?.kind === "message" && uncertain.delivery).toBe(
      "uncertain"
    );
    await recordTelegramDelivery(store.history, owner, id, "confirmed-message");
    const confirmed = await store.history.get(owner, id);
    expect(confirmed?.kind === "message" && confirmed.clientId).toBe(
      "tg-confirmed-message"
    );
    const messages = await store.history.list(owner, { kind: "message" });
    expect(messages.filter((record) => record.id === id)).toHaveLength(1);
  });
});
const execution = (connectionId: AgentTokenId): HistoryExecution => ({
  v: 1,
  revision: 0,
  kind: "execution",
  id: ExecutionId.generate(),
  source: "agent",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  conversationId: null,
  runId: null,
  invocationId: null,
  connectionId,
  toolCallId: "fixture",
  name: "froggy_service_run",
  input: "Search the launch",
  result: "Private source evidence",
  truncated: false,
  redacted: false,
  status: "completed",
  outcome: "delivered",
  finishedAt: Date.now(),
  taskId: null,
  purchaseId: null,
  receiptIds: [],
  artifactIds: [],
});
test("history is explicit and restricted to the external connection that produced it", async () => {
  const store = memoryStore();
  const owner = person();
  const connection = AgentTokenId.generate();
  const own = execution(connection);
  const other = execution(AgentTokenId.generate());
  await store.history.transaction(owner, async (tx) => {
    await tx.save(own, 0);
    await tx.save(other, 0);
  });
  const caller: TaskCaller = {
    userId: owner,
    agentTokenId: connection,
    grantId: null,
    scopes: new Set(["history"]),
  };
  const found = await externalHistory(store.history, caller, {});
  expect(found).toContain(own.id);
  expect(found).not.toContain(other.id);
  expect(
    await externalHistory(store.history, caller, { executionId: other.id })
  ).not.toContain("Private source evidence");
  expect(
    await externalHistory(
      store.history,
      { ...caller, userId: person() },
      { executionId: own.id }
    )
  ).not.toContain("Private source evidence");
  expect(
    await rejectionMessageOf(
      externalHistory(store.history, { ...caller, scopes: null }, {})
    )
  ).toContain("explicit");
  expect(
    await rejectionMessageOf(
      externalHistory(
        store.history,
        { ...caller, scopes: new Set(["pay", "services"]) },
        {}
      )
    )
  ).toContain("explicit");
});
test("internal retrieval defaults to its thread and resolves cited messages only with explicit cross-thread access", async () => {
  const store = memoryStore();
  const owner = person();
  const accepted = await acceptHistory(store.history, owner, {
    messages: [
      {
        id: "one",
        role: "user",
        parts: [{ type: "text", text: "Confidential launch notes" }],
      },
    ],
  });
  await checkpointHistory(
    store.history,
    owner,
    accepted.run,
    null,
    "completed"
  );
  const other = ConversationId.generate();
  const options = { toolCallId: "read-only", messages: [], context: {} };
  const local = internalHistoryTool(store, owner, other, false);
  expect(
    await local.execute?.({ recordId: accepted.run.triggerMessageId }, options)
  ).not.toContain("Confidential");
  const allowed = internalHistoryTool(store, owner, other, true);
  expect(
    await allowed.execute?.(
      { recordId: accepted.run.triggerMessageId },
      options
    )
  ).toContain("Confidential launch notes");
  expect(
    await allowed.execute?.({ recordId: accepted.run.id }, options)
  ).toContain(accepted.run.triggerMessageId);
  expect(await store.history.list(owner, { kind: "run" })).toHaveLength(1);
});
test("UTF-8 evidence caps preserve whole characters", () => {
  const preview = historyPreview("🐸".repeat(100), 7);
  expect(preview.text).toBe("🐸");
  expect(new TextEncoder().encode(preview.text).byteLength).toBeLessThanOrEqual(
    7
  );
  expect(preview.truncated).toBe(true);
});
