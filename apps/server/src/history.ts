import {
  ArtifactId,
  ConversationId,
  ExecutionId,
  MessageId,
  TaskId,
  RunId,
} from "@froggy/domain";
import type {
  Conversation,
  HistoryExecution,
  HistoryRun,
  HistorySource,
  UserId,
  HistoryMessage,
} from "@froggy/domain";
import { HistoryConflictError, historyText } from "@froggy/wallet";
import type { Store, HistoryStore, HistoryTransaction } from "@froggy/wallet";
import { validateUIMessages } from "ai";
import type { ToolSet, UIMessage } from "ai";
import { Schema } from "effect";

const LEASE_MS = 30_000;
const PREVIEW_CAP = 4096;
const ARTIFACT_CAP = 65_536;
const secretKey =
  /(?:authorization|cookie|password|secret|token|api[-_]?key|private[-_]?key|signature|credential)/iu;
const redactText = (text: string): string =>
  text
    .replaceAll(/\bBearer\s+[\w.\-~+/=]+/giu, "Bearer [redacted]")
    .replaceAll(
      /\b(?:sk|rk|pk_live|ghp|github_pat)[-_][\w-]{12,}/gu,
      "[redacted]"
    )
    .replaceAll(
      /(?<label>(?:password|secret|token|api[-_]?key|private[-_]?key)\s*[=:]\s*)[^\s&,;]+/giu,
      "$<label>[redacted]"
    )
    .replaceAll(/https?:\/\/[^\s<>"']+/gu, (raw) => {
      try {
        const url = new URL(raw);
        url.username = "";
        url.password = "";
        for (const key of url.searchParams.keys()) {
          if (secretKey.test(key)) {
            url.searchParams.set(key, "[redacted]");
          }
        }
        if (url.pathname.startsWith("/unlocked/")) {
          url.pathname = "/unlocked/[redacted]";
        }
        return url.toString();
      } catch {
        return "[invalid URL]";
      }
    });
export const decodeHistoryJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Json)
);
const redactJson = (value: Schema.Json): Schema.Json => {
  if (Schema.is(Schema.String)(value)) {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactJson);
  }
  if (Schema.is(Schema.JsonObject)(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? "[redacted]" : redactJson(item),
      ])
    );
  }
  return value;
};
export const historyPreview = (value: Schema.Json, limit = PREVIEW_CAP) => {
  const raw: string = Schema.is(Schema.String)(value)
    ? value
    : JSON.stringify(value);
  const redacted = redactJson(value);
  const safe: string = Schema.is(Schema.String)(redacted)
    ? redacted
    : JSON.stringify(redacted);
  const bytes = new TextEncoder().encode(safe);
  return {
    text: new TextDecoder().decode(bytes.subarray(0, limit), {
      stream: bytes.length > limit,
    }),
    truncated: bytes.length > limit,
    redacted: safe !== raw,
  };
};
interface SavedParts {
  readonly parts: HistoryMessage["parts"];
  readonly truncated: boolean;
}
const jsonParts = (parts: UIMessage["parts"]): SavedParts => {
  // Provider reasoning and binary attachments are deliberately not archived.
  const visible = parts.filter(
    (part) => part.type !== "reasoning" && part.type !== "file"
  );
  const safe = historyPreview(
    decodeHistoryJson(JSON.stringify(visible)),
    ARTIFACT_CAP
  );
  if (safe.truncated) {
    return {
      parts: [
        {
          type: "text",
          text: `${
            historyPreview(
              visible
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n"),
              ARTIFACT_CAP - 1024
            ).text
          }\n[Output truncated; inspect saved tool evidence.]`,
        },
      ],
      truncated: true,
    };
  }
  return {
    parts: Schema.decodeUnknownSync(Schema.Array(Schema.Json))(
      JSON.parse(safe.text)
    ),
    truncated: false,
  };
};
export class HistoryDuplicateError extends Error {
  readonly run: HistoryRun;
  constructor(run: HistoryRun) {
    super("This message was already accepted.");
    this.name = "HistoryDuplicateError";
    this.run = run;
  }
}
export interface HistoryInput {
  readonly conversationId?: ConversationId;
  readonly revision?: number;
  readonly crossThreadHistory?: boolean;
  readonly source?: typeof HistorySource.Type;
  readonly externalThreadId?: string;
  readonly messages: readonly UIMessage[];
}
export interface AcceptedHistory {
  readonly run: HistoryRun;
  readonly messages: UIMessage[];
}
export const expireHistoryLease = async (
  tx: HistoryTransaction,
  now: number
): Promise<void> => {
  const { activeRunId } = tx.owner;
  if (activeRunId === null || tx.owner.leaseExpiresAt > now) {
    return;
  }
  const run = await tx.get(activeRunId);
  if (run?.kind === "run") {
    await tx.save(
      {
        ...run,
        status: "interrupted",
        waits: run.waits.map((wait) => ({
          ...wait,
          resolution: wait.resolution ?? "interrupted",
        })),
        error:
          "Execution stopped before completion. Inspect payment evidence before retrying.",
        finishedAt: now,
        updatedAt: now,
      },
      run.revision
    );
    const message = await tx.get(run.assistantMessageId);
    if (message?.kind === "message") {
      await tx.save(
        { ...message, status: "interrupted", updatedAt: now },
        message.revision
      );
    }
    const executions = await tx.list({
      kind: "execution",
      runId: run.id,
      limit: 50,
    });
    await Promise.all(
      executions.map(async (execution) => {
        if (
          execution.kind === "execution" &&
          (execution.status === "running" || execution.status === "waiting")
        ) {
          await tx.save(
            {
              ...execution,
              status: "uncertain",
              outcome: "interrupted",
              updatedAt: now,
            },
            execution.revision
          );
        }
      })
    );
  }
  tx.owner.activeRunId = null;
  tx.owner.leaseExpiresAt = 0;
};
const checkHistoryIngress = (
  tx: HistoryTransaction,
  input: HistoryInput,
  existing: Conversation | null
): void => {
  if (tx.owner.activeRunId !== null) {
    throw new HistoryConflictError(
      "Another run is using this workspace. Wait for it or stop it before sending."
    );
  }
  if (
    existing !== null &&
    input.revision !== undefined &&
    input.revision !== existing.revision
  ) {
    throw new HistoryConflictError();
  }
  if (existing?.archived === true) {
    throw new HistoryConflictError("Reopen this conversation before sending.");
  }
};
export const acceptHistory = async (
  store: HistoryStore,
  userId: UserId,
  input: HistoryInput
): Promise<AcceptedHistory> => {
  const last = input.messages.at(-1);
  if (
    last?.role !== "user" ||
    last.id.length > 200 ||
    last.parts.length > 100
  ) {
    throw new HistoryConflictError("Send one new user message.");
  }
  // Only text authored by the person is accepted at ingress. Client-supplied
  // assistant/tool parts never become server history or payment provenance.
  if (last.parts.some((part) => part.type !== "text")) {
    throw new HistoryConflictError("Only text messages can be sent here.");
  }
  const incoming = jsonParts(last.parts);
  const accepted = await store.transaction(userId, async (tx) => {
    const now = Date.now();
    const source = input.source ?? "web";
    const externalKey =
      input.externalThreadId === undefined
        ? null
        : `${source}:${input.externalThreadId}`;
    const external =
      externalKey === null
        ? []
        : await tx.list({ kind: "conversation", externalKey, limit: 1 });
    const [bound] = external;
    const conversationId =
      input.conversationId ??
      (bound?.kind === "conversation" ? bound.id : ConversationId.generate());
    const existing = await tx.get(conversationId);
    if (existing !== null && existing.kind !== "conversation") {
      throw new HistoryConflictError();
    }
    const duplicates = await tx.list({
      kind: "message",
      externalKey: `${conversationId}:${last.id}`,
      limit: 1,
    });
    const [duplicate] = duplicates;
    const duplicateRun =
      duplicate?.kind === "message" && duplicate.runId !== null
        ? await tx.get(duplicate.runId)
        : null;
    if (duplicateRun?.kind === "run") {
      return { run: duplicateRun, duplicate: true, records: [] };
    }
    await expireHistoryLease(tx, now);
    checkHistoryIngress(tx, input, existing);
    const runId = RunId.generate();
    const message: HistoryMessage = {
      v: 1,
      kind: "message",
      id: MessageId.generate(),
      revision: 0,
      createdAt: now,
      updatedAt: now,
      source,
      conversationId,
      runId,
      role: "user",
      clientId: last.id,
      ...incoming,
      status: "completed",
      delivery: "saved",
      recovered: false,
    };
    const text = historyText(message);
    await tx.save(
      existing === null
        ? {
            v: 1,
            kind: "conversation",
            id: conversationId,
            title: text.slice(0, 100) || "New conversation",
            preview: text.slice(0, 200),
            externalKey,
            source,
            archived: false,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }
        : { ...existing, preview: text.slice(0, 200), updatedAt: now },
      existing?.revision ?? 0
    );
    await tx.save(message, 0);
    const assistantId = MessageId.generate();
    await tx.save(
      {
        ...message,
        id: assistantId,
        clientId: assistantId,
        role: "assistant",
        parts: [],
        status: "accepted",
        delivery: source === "telegram" ? "pending" : "saved",
      },
      0
    );
    tx.owner.leaseEpoch += 1;
    tx.owner.leaseExpiresAt = now + LEASE_MS;
    tx.owner.activeRunId = runId;
    const run: HistoryRun = {
      v: 1,
      kind: "run",
      id: runId,
      conversationId,
      triggerMessageId: message.id,
      assistantMessageId: assistantId,
      source,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      status: "accepted",
      leaseEpoch: tx.owner.leaseEpoch,
      leaseExpiresAt: tx.owner.leaseExpiresAt,
      finishedAt: null,
      error: null,
      waits: [],
    };
    await tx.save(run, 0);
    const records = await tx.list({
      kind: "message",
      conversationId,
      limit: 50,
    });
    return { run, duplicate: false, records };
  });
  if (accepted.duplicate) {
    throw new HistoryDuplicateError(accepted.run);
  }
  // The archive is retained; the provider receives a bounded recent suffix.
  let contextBytes = 0;
  const context: HistoryMessage[] = [];
  for (const record of accepted.records) {
    if (
      record.kind !== "message" ||
      record.parts.length === 0 ||
      !["completed", "stopped", "failed", "interrupted"].includes(record.status)
    ) {
      continue;
    }
    const parts =
      record.status === "completed"
        ? record.parts
        : [
            {
              type: "text",
              text: `[Saved partial answer from a ${record.status} run; incomplete.]\n${historyText(record)}`,
            },
          ];
    const bytes = new TextEncoder().encode(JSON.stringify(parts)).byteLength;
    if (contextBytes + bytes > 131_072) {
      break;
    }
    context.push({ ...record, parts });
    contextBytes += bytes;
  }
  const messages = await validateUIMessages({
    messages: context.toReversed().map((record) => ({
      id: record.id,
      role: record.role,
      parts: record.parts,
    })),
  });
  return { run: accepted.run, messages };
};
export const assertHistoryLease = (
  tx: HistoryTransaction,
  run: HistoryRun
): void => {
  if (
    tx.owner.activeRunId !== run.id ||
    tx.owner.leaseEpoch !== run.leaseEpoch ||
    tx.owner.leaseExpiresAt <= Date.now()
  ) {
    throw new HistoryConflictError(
      "Execution ownership expired. The saved run must be inspected before retrying."
    );
  }
};
export const checkpointHistory = async (
  store: HistoryStore,
  userId: UserId,
  run: HistoryRun,
  message: UIMessage | null,
  status: HistoryRun["status"],
  error: string | null = null
): Promise<void> => {
  await store.transaction(userId, async (tx) => {
    assertHistoryLease(tx, run);
    const current = await tx.get(run.id);
    if (current?.kind !== "run") {
      throw new HistoryConflictError();
    }
    const now = Date.now();
    const terminal = !["accepted", "running", "waiting"].includes(status);
    tx.owner.leaseExpiresAt = terminal ? 0 : now + LEASE_MS;
    if (terminal) {
      tx.owner.activeRunId = null;
    }
    await tx.save(
      {
        ...current,
        waits: terminal
          ? current.waits.map((wait) => ({
              ...wait,
              resolution: wait.resolution ?? "interrupted",
            }))
          : current.waits,
        status:
          status === "running" &&
          current.waits.some((wait) => wait.resolution === null)
            ? "waiting"
            : status,
        error,
        updatedAt: now,
        finishedAt: terminal ? now : null,
        leaseExpiresAt: tx.owner.leaseExpiresAt,
      },
      current.revision
    );
    if (message !== null) {
      const currentMessage = await tx.get(run.assistantMessageId);
      if (currentMessage?.kind !== "message") {
        throw new HistoryConflictError();
      }
      await tx.save(
        {
          ...currentMessage,
          ...jsonParts(message.parts),
          status,
          updatedAt: now,
        },
        currentMessage.revision
      );
    }
    const conversation = await tx.get(run.conversationId);
    if (conversation?.kind === "conversation" && terminal) {
      await tx.save(
        {
          ...conversation,
          updatedAt: now,
          preview:
            message === null
              ? conversation.preview
              : historyPreview(
                  message.parts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text)
                    .join("\n"),
                  200
                ).text,
        },
        conversation.revision
      );
    }
  });
};
interface HistoryLinks {
  readonly taskId: HistoryExecution["taskId"];
  readonly purchaseId: HistoryExecution["purchaseId"];
  readonly receiptIds: HistoryExecution["receiptIds"];
}
interface HistoryToolCall {
  readonly references?: (output: Schema.Json) => Promise<HistoryLinks>;
  readonly store: HistoryStore;
  readonly userId: UserId;
  readonly run: HistoryRun;
  readonly name: string;
  readonly toolCallId: string;
  readonly input: Schema.Json;
  readonly abort: () => void;
  readonly action: () => Promise<Schema.Json>;
}
export const executeHistoryTool = async ({
  store,
  userId,
  run,
  name,
  toolCallId,
  input,
  abort,
  action,
  references,
}: HistoryToolCall): Promise<Schema.Json> => {
  const preview = historyPreview(input);
  const now = Date.now();
  const execution: HistoryExecution = {
    v: 1,
    kind: "execution",
    id: ExecutionId.generate(),
    conversationId: run.conversationId,
    runId: run.id,
    invocationId: null,
    connectionId: null,
    toolCallId,
    name,
    input: preview.text,
    result: "",
    truncated: preview.truncated,
    redacted: preview.redacted,
    source: run.source,
    status: "running",
    outcome: "started",
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    revision: 0,
    taskId: null,
    purchaseId: null,
    receiptIds: [],
    artifactIds: [],
  };
  await store.transaction(userId, async (tx) => {
    assertHistoryLease(tx, run);
    await tx.save(execution, 0);
  });
  let output: Schema.Json;
  try {
    output = await action();
  } catch (error) {
    await store.transaction(userId, async (tx) => {
      assertHistoryLease(tx, run);
      await tx.save(
        {
          ...execution,
          status: "failed",
          outcome: "error",
          result: historyPreview(
            error instanceof Error ? error.message : "Tool failed"
          ).text,
          updatedAt: Date.now(),
          finishedAt: Date.now(),
        },
        1
      );
    });
    throw error;
  }
  try {
    const links =
      references === undefined
        ? { taskId: null, purchaseId: null, receiptIds: [] }
        : await references(output);
    const result = historyPreview(output);
    const artifact = historyPreview(output, ARTIFACT_CAP);
    const at = Date.now();
    await store.transaction(userId, async (tx) => {
      assertHistoryLease(tx, run);
      const artifactId = ArtifactId.generate();
      await tx.save(
        {
          v: 1,
          kind: "artifact",
          id: artifactId,
          conversationId: run.conversationId,
          runId: run.id,
          title: name,
          content: artifact.text,
          mediaType: Schema.is(Schema.String)(output)
            ? "text/plain"
            : "application/json",
          sourceUrl: null,
          truncated: artifact.truncated,
          source: run.source,
          revision: 0,
          createdAt: at,
          updatedAt: at,
        },
        0
      );
      await tx.save(
        {
          ...execution,
          ...links,
          status: "completed",
          outcome: "returned",
          result: result.text,
          truncated: result.truncated,
          redacted: result.redacted || execution.redacted,
          artifactIds: [artifactId],
          updatedAt: at,
          finishedAt: at,
        },
        1
      );
    });
  } catch {
    abort();
    throw new Error(
      "Tool returned, but its evidence could not be saved. Outcome needs reconciliation; do not execute it again."
    );
  }
  return output;
};
export const historyTools = (
  tools: ToolSet,
  store: Store,
  userId: UserId,
  run: HistoryRun,
  abort: () => void
): ToolSet =>
  Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      const original = definition.execute;
      if (original === undefined) {
        return [name, definition];
      }
      return [
        name,
        {
          ...definition,
          execute: async (input, options) =>
            await executeHistoryTool({
              store: store.history,
              userId,
              run,
              name,
              toolCallId: options.toolCallId,
              input: decodeHistoryJson(JSON.stringify(input)),
              abort,
              references: async (output) => {
                const receipts = await store.receipts.forRun(userId, run.id);
                const purchases = await store.purchases.forRun(userId, run.id);
                const purchase = purchases.find(
                  (row) => row.toolCallId === options.toolCallId
                );
                let taskId: TaskId | null = null;
                if (name === "service_run" || name === "service_status") {
                  const ticket = Schema.decodeUnknownResult(
                    Schema.Struct({ id: TaskId })
                  )(output);
                  if (
                    ticket._tag === "Success" &&
                    (await store.tasks.byId(userId, ticket.success.id)) !== null
                  ) {
                    taskId = ticket.success.id;
                  }
                }
                return {
                  taskId,
                  purchaseId: purchase?.id ?? null,
                  receiptIds: receipts
                    .filter((row) => row.toolCallId === options.toolCallId)
                    .map((row) => row.id),
                };
              },
              action: async () =>
                decodeHistoryJson(
                  JSON.stringify(await original(input, options))
                ),
            }),
        },
      ];
    })
  );
