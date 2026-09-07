/** Stateless Streamable HTTP MCP. Auth is the same revocable token as the task API. */
import { TaskId } from "@froggy/domain";
import type { ServiceCard, ServiceTicket } from "@froggy/protocol";
import { ServiceRequest } from "@froggy/protocol";
import { Schema } from "effect";

import { boundedBytes, serviceCatalog } from "./service-providers";
import { purchaseService, serviceTicket } from "./service-tasks";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import { std } from "./std";
import type { TaskCaller } from "./tasks";

const Envelope = Schema.Struct({
  jsonrpc: Schema.Literals(["2.0"]),
  id: Schema.optional(Schema.Union([Schema.String, Schema.Finite])),
  method: Schema.String,
  params: Schema.optional(Schema.Unknown),
});
const Call = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optional(Schema.Unknown),
});
const StatusInput = Schema.Struct({ id: TaskId });
const Initialize = Schema.Struct({
  protocolVersion: Schema.String,
  capabilities: Schema.Unknown,
  clientInfo: Schema.Struct({ name: Schema.String, version: Schema.String }),
});
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const inputSchema = (schema: Schema.Codec<unknown>) =>
  std(schema)["~standard"].jsonSchema.input({ target: "draft-2020-12" });
const tools = [
  {
    name: "froggy_services",
    description: "List fixed-price services and availability before buying.",
    // Spelled out: an empty Effect struct renders as `anyOf [object, array]`,
    // and the MCP SDK's client rejects a tool whose schema is not an object.
    inputSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "froggy_service_run",
    description:
      "Purchase a service using the person's Froggy wallet under their spending rules. Keep the same idempotencyKey for retries. Returns a task ticket, not completed work. Never automatically repurchase failed or uncertain work.",
    inputSchema: inputSchema(ServiceRequest),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  },
  {
    name: "froggy_service_status",
    description:
      "Read a task result. Approval happens in Froggy, never through this tool.",
    inputSchema: inputSchema(StatusInput),
    annotations: { readOnlyHint: true },
  },
];

interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly isError: boolean;
}
type McpResult =
  | ToolResult
  | { tools: typeof tools }
  | {
      protocolVersion: string | undefined;
      capabilities: { tools: Record<string, never> };
      serverInfo: { name: string; version: string };
      instructions: string;
    }
  | Record<string, never>;
interface McpResponse {
  readonly jsonrpc: "2.0";
  readonly id: string | number | null | undefined;
  readonly result?: McpResult;
  readonly error?: { readonly code: number; readonly message: string };
}
const json = (value: McpResponse, status = 200): Response =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

const invokeTool = async (
  services: Services,
  session: WorkspaceSession,
  caller: TaskCaller,
  call: typeof Call.Type
): Promise<ToolResult> => {
  // Every froggy_* tool is the catalog: a grant without `services` can list
  // the tools and call none of them, and is told which scope to come back with.
  if (caller.scopes !== null && !caller.scopes.has("services")) {
    return {
      content: [
        {
          type: "text",
          text: 'This connection lacks the "services" scope. Reconnect Froggy and allow it.',
        },
      ],
      isError: true,
    };
  }
  try {
    let result: ServiceTicket | { v: number; services: readonly ServiceCard[] };
    switch (call.name) {
      case "froggy_services": {
        result = { v: 1, services: serviceCatalog(services) };
        break;
      }
      case "froggy_service_run": {
        result = await purchaseService(
          { services, session, agentTokenId: caller.agentTokenId },
          Schema.decodeUnknownSync(ServiceRequest)(call.arguments)
        );
        break;
      }
      case "froggy_service_status": {
        const input = Schema.decodeUnknownSync(StatusInput)(call.arguments);
        const task = await services.store.tasks.byId(caller.userId, input.id);
        if (!task || task.kind !== "service") {
          throw new Error("No such service task.");
        }
        result = serviceTicket(task);
        break;
      }
      default: {
        throw new Error("Unknown tool");
      }
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Tool failed.",
        },
      ],
      isError: true,
    };
  }
};

export const handleMcp = async (
  services: Services,
  session: WorkspaceSession,
  caller: TaskCaller,
  request: Request
): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (
    origin !== null &&
    !services.environment.allowedOrigins.includes(origin)
  ) {
    return new Response(null, { status: 403 });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !VERSIONS.includes(version)) {
    return new Response(null, { status: 400 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder().decode(
        await boundedBytes(new Response(request.body), 16_000)
      )
    );
  } catch {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32_700, message: "Parse error" },
      },
      400
    );
  }
  const decoded = Schema.decodeUnknownResult(Envelope)(raw);
  if (decoded._tag === "Failure") {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32_600, message: "Invalid request" },
      },
      400
    );
  }
  const message = decoded.success;
  // Notifications never buy anything, even with a tools/call method.
  if (message.id === undefined) {
    return new Response(null, { status: 202 });
  }
  const respond = (result: McpResult) =>
    json({ jsonrpc: "2.0", id: message.id, result });
  const error = (code: number, text: string) =>
    json({ jsonrpc: "2.0", id: message.id, error: { code, message: text } });
  if (message.method === "initialize") {
    const init = Schema.decodeUnknownResult(Initialize)(message.params);
    if (init._tag === "Failure") {
      return error(-32_602, "Invalid initialize parameters");
    }
    return respond({
      protocolVersion: VERSIONS.includes(init.success.protocolVersion)
        ? init.success.protocolVersion
        : VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: "froggy", version: "1.0.0" },
      instructions:
        "Use froggy_services before purchasing. Human spending controls apply to every request. Poll status; never repurchase pending tasks.",
    });
  }
  if (message.method === "ping") {
    return respond({});
  }
  if (message.method === "tools/list") {
    return respond({ tools });
  }
  if (message.method !== "tools/call") {
    return error(-32_601, "Method not found");
  }
  const call = Schema.decodeUnknownResult(Call)(message.params);
  if (call._tag === "Failure") {
    return error(-32_602, "Invalid tool parameters");
  }
  return respond(await invokeTool(services, session, caller, call.success));
};
