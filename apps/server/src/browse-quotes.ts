import { creditUnits, ConversationId, TaskId, usdMicros } from "@froggy/domain";
import type { Task, UserId } from "@froggy/domain";
import { BrowseBudget, BrowseQuote } from "@froggy/protocol";
import { Schema } from "effect";

import { authorizeCreditTask, creditLimitsFromMandate } from "./credit-task";
import { hostedTask } from "./hosted-browse-state";
import type { TaskCaller, TaskDeps, TaskView } from "./tasks";
import type { Workspaces } from "./workspaces";

export const QuotedBrowseInput = Schema.Struct({
  v: Schema.Literal(2),
  kind: Schema.Literal("browse"),
  instruction: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(8000)
  ),
  budgetUsd: BrowseBudget,
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(200)
  ),
  conversationId: Schema.optional(ConversationId),
});
type BrowseInput = typeof QuotedBrowseInput.Type;
const StoredQuote = Schema.Struct({ quote: BrowseQuote });
/** Historical and credit tasks retain the same immutable execution allowance. */
export const storedBrowseQuote = (task: Task) =>
  Schema.decodeUnknownSync(StoredQuote)(task.input);

const owners = new Map<UserId, Promise<unknown>>();
export const serializeBrowsePayment = async <T>(
  owner: UserId,
  work: () => Promise<T>
): Promise<T> => {
  const previous = owners.get(owner) ?? Promise.resolve();
  const next = (async () => {
    await previous.catch(() => null);
    return await work();
  })();
  owners.set(owner, next);
  try {
    return await next;
  } finally {
    if (owners.get(owner) === next) {
      owners.delete(owner);
    }
  }
};

type BrowseResponse =
  | { readonly task: TaskView }
  | {
      readonly error: string | null;
      readonly task?: TaskView;
      readonly code?: string;
      readonly fundingUrl?: string;
    };
const json = (body: BrowseResponse, status = 200): Response =>
  Response.json(
    { v: 1, ...body },
    { status, headers: { "cache-control": "no-store" } }
  );

const createBrowseTask = (
  deps: TaskDeps,
  caller: TaskCaller,
  body: BrowseInput,
  key: string,
  now: number
): Task | Response => {
  const { environment } = deps.services;
  const connectionId = caller.grantId ?? caller.agentTokenId;
  const workspaceTools =
    deps.unattended === true ||
    deps.monitorCheckId !== undefined ||
    connectionId !== null ||
    /\b(?:email|inbox|verification code|confirmation code)\b/iu.test(
      body.instruction
    );
  const executor = workspaceTools ? "legacy" : environment.browseExecutor;
  if (
    environment.browserUseApiKey === null &&
    environment.modes.browser !== "stub"
  ) {
    return json(
      { error: "Browsing is not configured. Nothing was charged." },
      503
    );
  }
  if (
    executor !== "hosted" &&
    environment.modes.model !== "stub" &&
    (!(environment.browserModelInputRate > 0) ||
      !(environment.browserModelOutputRate > 0))
  ) {
    return json(
      {
        error: "Browsing model rates are not configured. Nothing was charged.",
      },
      503
    );
  }
  const price = usdMicros(body.budgetUsd * 1_000_000);
  const id = TaskId.generate();
  const quote: BrowseQuote = {
    taskId: id,
    instruction: body.instruction,
    budgetUsd: body.budgetUsd,
    idempotencyKey: key,
    priceUsdMicros: price,
    priceCreditUnits: creditUnits(price),
    modelAllowanceUsdMicros: price / 2,
    executionMs: { 1: 10, 3: 20, 5: 30 }[body.budgetUsd] * 60_000,
    expiresAt: now + 5 * 60_000,
  };
  let input: Task["input"] = {
    v: 2,
    instruction: body.instruction,
    stubbed:
      environment.modes.browser === "stub" ||
      (executor === "legacy" && environment.modes.model === "stub"),
    executor,
    quote,
    modelRates: {
      input: environment.browserModelInputRate,
      output: environment.browserModelOutputRate,
    },
  };
  if (deps.enrichmentItemId !== undefined) {
    input = { ...input, enrichmentItemId: deps.enrichmentItemId };
  }
  if (deps.monitorCheckId !== undefined) {
    input = { ...input, monitorCheckId: deps.monitorCheckId };
  }
  if (body.conversationId !== undefined) {
    input = { ...input, conversationId: body.conversationId };
  }
  const task: Task = {
    id,
    agentTokenId: caller.agentTokenId,
    connectionId,
    createdAt: now,
    updatedAt: now,
    idempotencyKey: key,
    kind: "browse",
    priceUsdMicros: price,
    status: "paid",
    error: null,
    result: null,
    saleId: null,
    runId: null,
    input,
  };
  return task;
};

const callerConnection = (caller: TaskCaller) =>
  caller.grantId ?? caller.agentTokenId;

const performBrowse = async (
  deps: TaskDeps,
  request: Request,
  workspace: Awaited<ReturnType<Workspaces["hydrate"]>>,
  caller: TaskCaller,
  body: BrowseInput,
  execute: (task: Task) => void,
  view: (task: Task) => TaskView
): Promise<Response> => {
  const now = (deps.now ?? Date.now)();
  const { services } = deps;
  const { store } = services;
  const key = request.headers.get("idempotency-key") ?? body.idempotencyKey;
  const connectionId = callerConnection(caller);
  const earlier = await store.tasks.byIdempotencyKey(caller.userId, key);
  if (earlier !== null) {
    if (
      earlier.kind !== "browse" ||
      earlier.connectionId !== connectionId ||
      earlier.input["v"] !== 2 ||
      earlier.input["instruction"] !== body.instruction ||
      earlier.input["conversationId"] !== body.conversationId ||
      storedBrowseQuote(earlier).quote.budgetUsd !== body.budgetUsd
    ) {
      return json(
        {
          error: "That request key belongs to a different task or connection.",
        },
        409
      );
    }
    return json({ task: view(earlier) }, earlier.status === "done" ? 200 : 202);
  }
  const activeTasks = await store.tasks.activeBrowses();
  const active = activeTasks.some((row) => row.userId === caller.userId);
  if (active) {
    return json(
      { error: "Another browser task is active. Nothing else was charged." },
      409
    );
  }
  if (body.conversationId !== undefined) {
    const conversation = await store.history.get(
      caller.userId,
      body.conversationId
    );
    if (conversation?.kind !== "conversation") {
      return json({ error: "Conversation not found." }, 404);
    }
  }
  const task = createBrowseTask(deps, caller, body, key, now);
  if (task instanceof Response) {
    return task;
  }
  if (!hostedTask(task) && deps.runs.get(workspace.session.id) !== null) {
    return json(
      {
        error: "Finish or stop the current run before starting a browser task.",
      },
      409
    );
  }
  await authorizeCreditTask(services, caller.userId, task);
  const reserved = await store.credits.reserveTask(caller.userId, task, {
    initialLimits: creditLimitsFromMandate(workspace.session.currentMandate),
    stubbed: task.input["stubbed"] === true,
    now,
  });
  if (reserved.charge.status === "refused") {
    return json(
      {
        task: view(reserved.task),
        error: reserved.charge.reason,
        code: "credits_refused",
        fundingUrl: "/wallet?buyCredits=1",
      },
      409
    );
  }
  if (!reserved.replayed) {
    deps.workspaces.touch(workspace.userId);
    execute(reserved.task);
  }
  return json({ task: view(reserved.task) }, 202);
};

export const handleBrowseQuote = async (
  ...args: Parameters<typeof performBrowse>
): Promise<Response> =>
  await serializeBrowsePayment(
    args[3].userId,
    async () => await performBrowse(...args)
  );
