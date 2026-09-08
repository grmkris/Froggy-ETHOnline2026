/** A small metadata trail for agent requests. It never contains request or result bodies. */
import {
  AgentInvocationId,
  AgentTokenId,
  OAUTH_SCOPES,
  TaskId,
} from "@froggy/domain";
import type {
  AgentConnectionId,
  AgentInvocation,
  UserId,
} from "@froggy/domain";
import type { AgentConnection, AgentDetail } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import type { Services } from "./services";
import type { TaskCaller } from "./tasks";

export interface InvocationSummary {
  name: string;
  outcome: string;
  taskId: TaskId | null;
  usdMicros: number | null;
  stubbed: boolean;
}

export const trackAgentInvocation = async <T>(
  services: Services,
  caller: TaskCaller,
  kind: AgentInvocation["kind"],
  name: string,
  run: (summary: InvocationSummary) => Promise<T>
): Promise<T> => {
  const connectionId = caller.grantId ?? caller.agentTokenId;
  const summary: InvocationSummary = {
    name: name.slice(0, 120),
    outcome: "error",
    taskId: null,
    usdMicros: null,
    stubbed: services.environment.modes.database === "stub",
  };
  if (connectionId === null) {
    return await run(summary);
  }
  const id = AgentInvocationId.generate();
  // Persist before executing, so an interrupted call is still visible.
  await services.store.invocations.append(caller.userId, {
    ...summary,
    id,
    connectionId,
    kind,
    at: Date.now(),
    outcome: "started",
  });
  try {
    return await run(summary);
  } finally {
    try {
      await services.store.invocations.finish(caller.userId, id, summary);
    } catch {
      // A bookkeeping failure must not turn a successful purchase into a retry.
      // The durable row remains "started", never a fabricated success.
      console.warn(`Agent invocation ${id}: outcome could not be recorded.`);
    }
  }
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

export const trackAgentRequest = async (
  services: Services,
  caller: TaskCaller,
  kind: "task" | "pay",
  name: string,
  method: "GET" | "POST",
  run: (summary: InvocationSummary) => Promise<Response>
): Promise<Response> =>
  await trackAgentInvocation(services, caller, kind, name, async (summary) => {
    const response = await run(summary);
    summary.outcome = httpOutcome(response);
    const decoded = Schema.decodeUnknownResult(ResponseSummary)(
      await response
        .clone()
        .json()
        .catch(() => null)
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
  });

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
    agent = { ...token, name: token.label, scopes: OAUTH_SCOPES };
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
      return {
        ...row,
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
