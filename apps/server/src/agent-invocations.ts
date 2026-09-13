/** Invocation metadata and bounded evidence, joined by the original invocation id. */
import {
  ArtifactId,
  ExecutionId,
  AgentInvocationId,
  AgentTokenId,
  OAUTH_SCOPES,
  TaskId,
} from "@froggy/domain";
import type {
  AgentConnectionId,
  AgentInvocation,
  UserId,
  PurchaseId,
  ReceiptId,
  HistoryExecution,
} from "@froggy/domain";
import type { AgentConnection, AgentDetail } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import { historyPreview } from "./history";
import { boundedBytes } from "./outbound";
import type { Services } from "./services";
import type { TaskCaller } from "./tasks";

export interface InvocationSummary {
  name: string;
  outcome: string;
  taskId: TaskId | null;
  usdMicros: number | null;
  stubbed: boolean;
  purchaseId: PurchaseId | null;
  receiptIds: readonly ReceiptId[];
}

interface InvocationCapture<T> {
  readonly input: Schema.Json;
  readonly output: (value: T) => Schema.Json | Promise<Schema.Json>;
}
const metadataOf = (summary: InvocationSummary) => ({
  name: summary.name,
  outcome: summary.outcome,
  taskId: summary.taskId,
  usdMicros: summary.usdMicros,
  stubbed: summary.stubbed,
});
export const trackAgentInvocation = async <T>(
  services: Services,
  caller: TaskCaller,
  kind: AgentInvocation["kind"],
  name: string,
  run: (summary: InvocationSummary) => Promise<T>,
  capture?: InvocationCapture<T>
): Promise<T> => {
  const connectionId = caller.grantId ?? caller.agentTokenId;
  const summary: InvocationSummary = {
    name: name.slice(0, 120),
    outcome: "error",
    taskId: null,
    purchaseId: null,
    receiptIds: [],
    usdMicros: null,
    stubbed: services.environment.modes.database === "stub",
  };
  if (connectionId === null) {
    return await run(summary);
  }
  const id = AgentInvocationId.generate();
  // Persist before executing, so an interrupted call is still visible.
  await services.store.invocations.append(caller.userId, {
    ...metadataOf(summary),
    id,
    connectionId,
    kind,
    at: Date.now(),
    outcome: "started",
  });
  const startedAt = Date.now();
  const input = historyPreview(
    capture?.input ?? {
      recorded: false,
      reason: "Input body is not available for this endpoint.",
    }
  );
  const execution: HistoryExecution = {
    v: 1,
    kind: "execution",
    id: ExecutionId.generate(),
    revision: 0,
    source: "agent",
    conversationId: null,
    runId: null,
    invocationId: id,
    connectionId,
    toolCallId: id,
    name: summary.name,
    input: input.text,
    result: "",
    truncated: input.truncated,
    redacted: input.redacted,
    status: "running",
    outcome: "started",
    createdAt: startedAt,
    updatedAt: startedAt,
    finishedAt: null,
    taskId: null,
    purchaseId: null,
    receiptIds: [],
    artifactIds: [],
  };
  await services.store.history.transaction(caller.userId, async (tx) => {
    await tx.save(execution, 0);
  });
  let result: Schema.Json = { recorded: false };
  let failed = false;
  try {
    const value = await run(summary);
    if (capture !== undefined) {
      try {
        result = await capture.output(value);
      } catch {
        result = {
          recorded: false,
          reason:
            "Result capture unavailable; inspect the linked business record.",
        };
      }
    }
    return value;
  } catch (error) {
    failed = true;
    result = {
      error: error instanceof Error ? error.message : "Invocation failed",
    };
    throw error;
  } finally {
    try {
      await services.store.invocations.finish(
        caller.userId,
        id,
        metadataOf(summary)
      );
      const preview = historyPreview(result);
      const artifact = historyPreview(result, 65_536);
      const now = Date.now();
      await services.store.history.transaction(caller.userId, async (tx) => {
        const artifactId = ArtifactId.generate();
        await tx.save(
          {
            v: 1,
            kind: "artifact",
            id: artifactId,
            revision: 0,
            source: "agent",
            conversationId: null,
            runId: null,
            title: summary.name,
            content: artifact.text,
            mediaType: "application/json",
            sourceUrl: null,
            truncated: artifact.truncated,
            createdAt: now,
            updatedAt: now,
          },
          0
        );
        await tx.save(
          {
            ...execution,
            status: failed ? "failed" : "completed",
            outcome: summary.outcome,
            result: preview.text,
            redacted: execution.redacted || preview.redacted,
            truncated: execution.truncated || preview.truncated,
            taskId: summary.taskId,
            purchaseId: summary.purchaseId,
            receiptIds: summary.receiptIds,
            artifactIds: [artifactId],
            updatedAt: now,
            finishedAt: now,
          },
          1
        );
      });
    } catch {
      // A bookkeeping failure after payment must not invite another payment.
      console.warn(
        `Agent invocation ${id}: outcome could not be recorded; reconciliation required.`
      );
    }
  }
};

/** Diagnostics retain only a fixed category after authentication, never the
 * malformed body, supplied method name, or validation library's raw payload. */
export const recordMcpDiagnostic = async (
  services: Services,
  caller: TaskCaller,
  reason: "version" | "parse" | "envelope" | "initialize" | "tool_parameters"
): Promise<void> => {
  await trackAgentInvocation(
    services,
    caller,
    "mcp",
    "Protocol validation",
    async (summary) => {
      await Promise.resolve();
      summary.outcome = "invalid_request";
    },
    {
      input: { category: "protocol_diagnostic", reason },
      output: () => ({ accepted: false }),
    }
  );
};

const ResponseSummary = Schema.Struct({
  task: Schema.optional(Schema.Struct({ id: TaskId })),
  receipt: Schema.optional(
    Schema.Struct({
      intent: Schema.Struct({ usdMicros: Schema.Number }),
      stubbed: Schema.Boolean,
    })
  ),
});

const httpOutcome = (response: Response): string => {
  if (
    response.headers.get("www-authenticate")?.includes("insufficient_scope") ===
    true
  ) {
    return "insufficient_scope";
  }
  if (response.status === 403) {
    return "refused";
  }
  if (response.headers.has("payment-required")) {
    return "payment_required";
  }
  if (response.status === 400 || response.status === 422) {
    return "invalid_request";
  }
  return response.ok ? "ok" : "error";
};

const boundedResponseJson = async (
  response: Response
): Promise<Schema.Json> => {
  try {
    const bytes = await boundedBytes(response.clone(), 65_536);
    const decoded = Schema.decodeUnknownResult(
      Schema.fromJsonString(Schema.Json)
    )(new TextDecoder().decode(bytes));
    return decoded._tag === "Success"
      ? decoded.success
      : { recorded: false, reason: "Response was not JSON." };
  } catch {
    return {
      recorded: false,
      reason:
        "Response exceeded history limit or could not be read; inspect the linked business record.",
    };
  }
};
export const trackAgentRequest = async (
  services: Services,
  caller: TaskCaller,
  kind: "task" | "pay",
  name: string,
  method: "GET" | "POST",
  run: (summary: InvocationSummary) => Promise<Response>
): Promise<Response> =>
  await trackAgentInvocation(
    services,
    caller,
    kind,
    name,
    async (summary) => {
      const response = await run(summary);
      summary.outcome = httpOutcome(response);
      const decoded = Schema.decodeUnknownResult(ResponseSummary)(
        await boundedResponseJson(response)
      );
      if (decoded._tag === "Success") {
        summary.taskId = decoded.success.task?.id ?? summary.taskId;
        if (
          response.ok &&
          method === "POST" &&
          kind === "task" &&
          summary.taskId !== null
        ) {
          summary.outcome = response.status === 202 ? "accepted" : "replayed";
        }
        if (response.ok && kind === "pay") {
          summary.outcome = "signed";
          summary.usdMicros = decoded.success.receipt?.intent.usdMicros ?? null;
        }
        summary.stubbed = decoded.success.receipt?.stubbed ?? summary.stubbed;
      }
      return response;
    },
    {
      input: { method, endpoint: name },
      output: boundedResponseJson,
    }
  );

/** Only the owner can resolve a connection, including one they disconnected. */
export const agentDetail = async (
  store: Store,
  userId: UserId,
  id: AgentConnectionId
): Promise<AgentDetail | null> => {
  let agent: AgentConnection;
  if (AgentTokenId.is(id)) {
    const tokens = await store.agents.list(userId);
    const token = tokens.find((row) => row.id === id);
    if (token === undefined) {
      return null;
    }
    agent = {
      ...token,
      name: token.label,
      // A minted token has no scope set and may call every agent tool,
      // including history. Listing a subset would understate what it can do.
      scopes: OAUTH_SCOPES.filter((scope) => !scope.startsWith("email:")),
    };
  } else {
    const found = await store.oauth.grants.byId(id);
    if (found === null || found.userId !== userId) {
      return null;
    }
    agent = { ...found.grant, name: found.grant.clientName };
  }
  const rows = await store.invocations.list(userId, id);
  const invocations = await Promise.all(
    rows.map(async (row) => {
      const task =
        row.taskId === null ? null : await store.tasks.byId(userId, row.taskId);
      const sale =
        task?.saleId === undefined || task.saleId === null
          ? null
          : await store.sales.byId(task.saleId);
      const executions = await store.history.list(userId, {
        kind: "execution",
        externalKey: row.id,
        limit: 1,
      });
      const [execution] = executions;
      return {
        ...row,
        executionId: execution?.kind === "execution" ? execution.id : null,
        // Signing is not settlement, and polling/replaying a task is not another purchase.
        usdMicros:
          row.outcome === "accepted" && sale !== null
            ? (task?.priceUsdMicros ?? null)
            : row.usdMicros,
        stubbed: sale?.stubbed ?? row.stubbed,
        taskKind: task?.kind ?? null,
        taskStatus: task?.status ?? null,
      };
    })
  );
  return { v: 1, agent, invocations };
};
