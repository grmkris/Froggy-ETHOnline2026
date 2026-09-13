import {
  MonitorAction,
  MonitorRequest,
  MonitoringBudgetRequest,
} from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import { connectionScopes } from "./capabilities";
import {
  changeMonitor,
  configureMonitor,
  monitoringState,
  setMonitoringBudget,
} from "./monitoring";
import type { TaskCaller } from "./tasks";

const reply = (body: Schema.Json, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export const handleMonitoring = async (
  store: Store,
  caller: TaskCaller,
  request: Request
): Promise<Response | null> => {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/monitoring")) {
    return null;
  }
  const connection = caller.grantId ?? caller.agentTokenId;
  try {
    const scopes = await connectionScopes(store, caller.userId, connection);
    if (scopes !== null && !scopes.has("automation")) {
      return reply(
        { v: 1, error: "Explicit automation permission is required." },
        403
      );
    }
    if (path === "/api/monitoring" && request.method === "GET") {
      const book = await monitoringState(store, caller.userId);
      const recent = new Set(book.checks.slice(-100).map((check) => check.id));
      return reply({
        ...book,
        checks: book.checks.filter(
          (check) =>
            recent.has(check.id) ||
            check.reservedUsdMicros > 0 ||
            check.status === "needs_help"
        ),
      });
    }
    if (path === "/api/monitoring/budget" && request.method === "PUT") {
      if (connection !== null) {
        return reply(
          { v: 1, error: "Only the human may set the monitoring budget." },
          403
        );
      }
      const input = Schema.decodeUnknownSync(MonitoringBudgetRequest)(
        await request.json()
      );
      return reply({
        v: 1,
        budget: await setMonitoringBudget(
          store,
          caller.userId,
          input.monthlyUsdMicros,
          input.timezone
        ),
      });
    }
    if (path === "/api/monitoring" && request.method === "POST") {
      const input = Schema.decodeUnknownSync(MonitorRequest)(
        await request.json()
      );
      return reply(
        {
          v: 1,
          monitor: await configureMonitor(
            store,
            caller.userId,
            input,
            connection
          ),
        },
        201
      );
    }
    if (path === "/api/monitoring/action" && request.method === "POST") {
      const input = Schema.decodeUnknownSync(MonitorAction)(
        await request.json()
      );
      return reply({
        v: 1,
        monitor: await changeMonitor(
          store,
          caller.userId,
          input.id,
          input.action
        ),
      });
    }
    return reply({ v: 1, error: "Method not allowed." }, 405);
  } catch (error) {
    return reply(
      {
        v: 1,
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Monitoring request refused.",
      },
      400
    );
  }
};
