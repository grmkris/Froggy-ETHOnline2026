import type { Task } from "@froggy/domain";
import { TaskId } from "@froggy/domain";
import type { ServiceCard, ServiceTicket } from "@froggy/protocol";
import { ServiceRequest, ServiceResult } from "@froggy/protocol";
import { Schema } from "effect";

import { trackAgentInvocation } from "./agent-invocations";
import { handleLaunchWatches } from "./launch-routes";
import { boundedBytes } from "./outbound";
import { serviceCatalog } from "./service-providers";
import { purchaseService, serviceTicket } from "./service-tasks";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import { visibleTask, visibleTasks } from "./tasks";
import type { TaskCaller } from "./tasks";

type ServiceResponse =
  | ServiceTicket
  | { v: 1; services: readonly ServiceCard[] }
  | { v: 1; tasks: readonly ServiceTicket[] }
  | { v: 1; error: string };
const json = (value: ServiceResponse, status = 200): Response =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

const artifactResponse = (task: Task): Response => {
  const result = Schema.decodeUnknownResult(ServiceResult)(task.result);
  const artifact = result._tag === "Success" ? result.success.artifact : null;
  if (!artifact) {
    return json({ v: 1, error: "No artifact." }, 404);
  }
  const extension =
    artifact.mime === "audio/mpeg" ? "mp3" : artifact.mime.split("/")[1];
  return new Response(Buffer.from(artifact.base64, "base64"), {
    headers: {
      "cache-control": "private, no-store",
      "content-type": artifact.mime,
      "x-content-type-options": "nosniff",
      "content-disposition": `attachment; filename="froggy-${task.id}.${extension}"`,
    },
  });
};

export const handleServices = async (
  services: Services,
  session: WorkspaceSession,
  caller: TaskCaller,
  request: Request
): Promise<Response> => {
  const path = new URL(request.url).pathname;
  if (
    path === "/api/services/watches" ||
    path.startsWith("/api/services/watches/")
  ) {
    return await handleLaunchWatches(services, caller, request);
  }
  if (path === "/api/services" && request.method === "GET") {
    return json({ v: 1, services: serviceCatalog(services) });
  }
  if (path === "/api/services/run" && request.method === "POST") {
    return await trackAgentInvocation(
      services,
      caller,
      "task",
      "services.run",
      async (invocation) => {
        try {
          const input: unknown = JSON.parse(
            new TextDecoder().decode(
              await boundedBytes(new Response(request.body), 16_000)
            )
          );
          const decoded = Schema.decodeUnknownSync(ServiceRequest)(input);
          invocation.name = decoded.service;
          const ticket = await purchaseService(
            {
              services,
              session,
              agentTokenId: caller.agentTokenId,
              connectionId: caller.grantId ?? caller.agentTokenId,
              onCreated: (id) => {
                invocation.taskId = id;
                invocation.outcome = "accepted";
              },
            },
            decoded
          );
          invocation.taskId = ticket.id;
          invocation.stubbed = ticket.stubbed;
          if (invocation.outcome !== "accepted") {
            invocation.outcome = "replayed";
          }
          return json(ticket, 202);
        } catch (error) {
          invocation.outcome = "error";
          return json(
            {
              v: 1,
              error:
                error instanceof Error
                  ? error.message.slice(0, 1000)
                  : "Invalid request.",
            },
            400
          );
        }
      }
    );
  }
  if (path === "/api/services/tasks" && request.method === "GET") {
    const tasks = visibleTasks(
      await services.store.tasks.list(caller.userId, 50),
      caller
    );
    return json({
      v: 1,
      tasks: tasks.filter((task) => task.kind === "service").map(serviceTicket),
    });
  }
  const match =
    /^\/api\/services\/tasks\/(?<id>[^/]+)(?<artifact>\/artifact)?$/u.exec(
      path
    )?.groups;
  const id = match?.["id"];
  if (request.method !== "GET" || id === undefined || !TaskId.is(id)) {
    return json({ v: 1, error: "Not found." }, 404);
  }
  const task = visibleTask(
    await services.store.tasks.byId(caller.userId, id),
    caller
  );
  if (!task || task.kind !== "service") {
    return json({ v: 1, error: "Not found." }, 404);
  }
  if (match?.["artifact"] === undefined) {
    return json(serviceTicket(task));
  }
  return artifactResponse(task);
};
