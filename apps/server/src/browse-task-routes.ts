import { TaskId } from "@froggy/domain";
import type { Task, UserId } from "@froggy/domain";
import type { BrowseTaskView } from "@froggy/protocol";
import { BrowseTaskControl } from "@froggy/protocol";
import { Schema } from "effect";

import { controlHostedBrowse } from "./hosted-browse";
import { hostedTask, publicBrowseTask } from "./hosted-browse-state";
import { handleTaskGet, pauseBrowseTask, resumeBrowseTask } from "./tasks";
import type { TaskCaller, TaskDeps } from "./tasks";
import type { Workspace } from "./workspaces";

type BrowseReply =
  | { readonly v: 1; readonly error: string }
  | { readonly v: 1; readonly task: BrowseTaskView }
  | { readonly v: 1; readonly tasks: readonly BrowseTaskView[] };
const reply = (body: BrowseReply, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const listBrowses = async (
  deps: TaskDeps,
  userId: UserId
): Promise<Response> => {
  const [recent, active] = await Promise.all([
    deps.services.store.tasks.list(userId, 50),
    deps.services.store.tasks.activeBrowses(),
  ]);
  const tasks = new Map(
    recent
      .filter((task) => task.kind === "browse" && task.status !== "quoted")
      .map((task) => [task.id, task])
  );
  for (const row of active) {
    if (row.userId === userId) {
      tasks.set(row.task.id, row.task);
    }
  }
  const pending = deps.interactions.pendingFor(userId);
  return reply({
    v: 1,
    tasks: [...tasks.values()].map((task) =>
      publicBrowseTask(
        task,
        Date.now(),
        pending.some((approval) => approval.runId === task.runId)
      )
    ),
  });
};

const controlLegacy = async (
  deps: TaskDeps,
  workspace: Workspace,
  caller: TaskCaller,
  task: Task,
  action: BrowseTaskControl["action"]
): Promise<Response> => {
  const run = deps.runs.get(workspace.session.id);
  if (action === "continue" && task.status === "paused") {
    await resumeBrowseTask(deps, caller.userId);
  } else if (action === "stop" && task.status === "paused") {
    await deps.services.store.tasks.update(caller.userId, task.id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    if (task.saleId !== null) {
      await deps.services.store.sales.update(task.saleId, {
        status: "failed",
        error: "Stopped. The fixed task price was not refunded.",
      });
    }
  } else if (action === "stop" && run !== null && run.id === task.runId) {
    run.abort();
  } else if (action === "take_control" && run?.id === task.runId) {
    pauseBrowseTask(workspace.session.id);
    run?.abort();
    await workspace.browser.takePage();
  } else {
    return reply(
      { v: 1, error: "Use the legacy browser controls for this task." },
      409
    );
  }
  return await handleTaskGet(deps, workspace, caller, task.id);
};

export const handleBrowseTaskRoutes = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller
): Promise<Response | null> => {
  const path = new URL(request.url).pathname;
  const controlId = /^\/api\/tasks\/(?<id>[^/]+)\/control$/u.exec(path)
    ?.groups?.["id"];
  if (path !== "/api/browse-tasks" && controlId === undefined) {
    return null;
  }
  if (caller.agentTokenId !== null || caller.grantId !== null) {
    return reply(
      { v: 1, error: "Browser task controls belong to the signed-in person." },
      403
    );
  }
  if (path === "/api/browse-tasks" && request.method === "GET") {
    return await listBrowses(deps, caller.userId);
  }

  if (
    request.method !== "POST" ||
    controlId === undefined ||
    !TaskId.is(controlId)
  ) {
    return reply({ v: 1, error: "Task control not found." }, 404);
  }
  const input = Schema.decodeUnknownResult(BrowseTaskControl)(
    await request.json().catch(() => null)
  );
  if (input._tag === "Failure") {
    return reply({ v: 1, error: "Invalid task control." }, 400);
  }
  const task = await deps.services.store.tasks.byId(caller.userId, controlId);
  if (task === null || task.kind !== "browse") {
    return reply({ v: 1, error: "Task not found." }, 404);
  }
  try {
    if (hostedTask(task)) {
      if (task.saleId === null) {
        return reply(
          {
            v: 1,
            error:
              "The payment must be confirmed before controlling this task.",
          },
          409
        );
      }
      return reply({
        v: 1,
        task: await controlHostedBrowse(
          deps,
          caller.userId,
          task.id,
          input.success.action
        ),
      });
    }
    return await controlLegacy(
      deps,
      workspace,
      caller,
      task,
      input.success.action
    );
  } catch (error) {
    return reply(
      {
        v: 1,
        error:
          error instanceof Error
            ? error.message
            : "Task control could not be confirmed.",
      },
      409
    );
  }
};
