import type {
  AgentConnectionId,
  OAuthGrantId,
  OAuthScope,
  Receipt,
  Task,
  TaskKind,
  TaskStatus,
  UserId,
  UsdMicros,
} from "@froggy/domain";
import { WatchlistItemId, MonitorCheckId, TaskId, usdMicros } from "@froggy/domain";
/** Delegated work reserves prepaid credits; the server owns execution beyond every socket. */
import { describeBestSupply, describeCheapestBorrow } from "@froggy/graph";
import type { BrowseTaskProgress, TaskOutcome } from "@froggy/protocol";
import type { UIMessage } from "ai";
import { Schema } from "effect";

import { trackAgentRequest } from "./agent-invocations";
import type { InvocationSummary } from "./agent-invocations";
import {
  handleBrowseQuote,
  QuotedBrowseInput,
  storedBrowseQuote,
  serializeBrowsePayment,
} from "./browse-quotes";
import type { ModelBudget } from "./budget";
import { ModelBudgetExhaustedError } from "./budget";
import { connectionScopes } from "./capabilities";
import {
  CreditCommitUncertainError,
  authorizeCreditTask,
  creditBillingError,
  creditLimitsFromMandate,
  finishCreditTask,
} from "./credit-task";
import { detached } from "./detached";
import {
  controlCurrentHostedBrowse,
  hasHostedBrowse,
  startHostedBrowse,
} from "./hosted-browse";
import { hostedTask, publicBrowseTask } from "./hosted-browse-state";
import type { InteractionRegistry } from "./interactions";
import { monitoringState } from "./monitoring";
import type { Notices } from "./notices";
import { insufficientScope } from "./oauth";
import type { ChatRunRegistry } from "./runs";
import { serviceTicket } from "./service-tasks";
import type { Services } from "./services";
import { recordTurn, sseOf, startTurn } from "./turn";
import type { UnlockTokens } from "./unlock";
import type { Workspaces } from "./workspaces";

/** Fixed service prices; one USD micro is one internal credit unit. */
export const TASK_PRICE_USD_MICROS: Record<
  Exclude<TaskKind, "service">,
  UsdMicros
> = {
  brief: usdMicros(50_000),
  browse: usdMicros(500_000),
};

/** A browse stops here whatever the model thinks; the price bought this many. */
const BROWSE_STEP_CAP = 40;

const TaskBody = Schema.Union([
  Schema.Struct({
    v: Schema.Literal(2),
    idempotencyKey: Schema.optional(Schema.String),
    kind: Schema.Literals(["brief"]),
    symbol: Schema.String,
  }),
  QuotedBrowseInput,
  Schema.Struct({
    v: Schema.Literal(2),
    idempotencyKey: Schema.optional(Schema.String),
    instruction: Schema.String,
    kind: Schema.Literals(["browse"]),
  }),
]);
type TaskBody = typeof TaskBody.Type;
const decodeTaskBody = Schema.decodeUnknownResult(TaskBody);

const decodeTaskRequest = async (request: Request) => {
  const raw: unknown = await request.json().catch(() => null);
  const record = Schema.decodeUnknownResult(
    Schema.Record(Schema.String, Schema.Unknown)
  )(raw);
  return record._tag === "Success" && Object.hasOwn(record.success, "budgetUsd")
    ? Schema.decodeUnknownResult(QuotedBrowseInput)(raw)
    : decodeTaskBody(raw);
};

export interface TaskDeps {
  readonly unattended?: boolean;
  readonly enrichmentItemId?: WatchlistItemId;
  readonly monitorCheckId?: MonitorCheckId;
  readonly budget: ModelBudget;
  readonly interactions: InteractionRegistry;
  /** For the `notify` tool inside a browse turn. */
  readonly notices: Notices;
  readonly now?: () => number;
  readonly oracleUrl: string;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  /** Where `POST /api/tasks` lives, for the 402's resource url. */
  readonly tasksUrl: string;
  readonly unlocks: UnlockTokens;
  readonly workspaces: Workspaces;
}

export interface TaskCaller {
  readonly grantId: OAuthGrantId | null;
  readonly agentTokenId: Task["agentTokenId"];
  /** An OAuth grant's scopes; null for a person or a legacy `fgy_` token, which may do everything an agent may. */
  readonly scopes: ReadonlySet<OAuthScope> | null;
  readonly userId: UserId;
}

/** The grant or token this caller is, or null when the person is calling. */
const callerConnection = (caller: TaskCaller): AgentConnectionId | null =>
  caller.grantId ?? caller.agentTokenId;

/**
 * An agent sees only the work it created. The person sees every task of
 * theirs, including ones an agent started.
 */
export const visibleTask = (
  task: Task | null,
  caller: TaskCaller
): Task | null => {
  if (task === null) {
    return null;
  }
  const connection = callerConnection(caller);
  return connection === null || task.connectionId === connection ? task : null;
};

export const visibleTasks = (
  tasks: readonly Task[],
  caller: TaskCaller
): readonly Task[] =>
  tasks.filter((task) => visibleTask(task, caller) !== null);

type Workspace = Awaited<ReturnType<Workspaces["hydrate"]>>;

/** An open ticket, as a task reports it: enough to find the card, never to answer it. */
interface TaskApproval {
  readonly amountLabel: string;
  readonly expiresAt: number;
  readonly id: string;
  readonly title: string;
}

/** A task as a caller sees it. Approval and receipts are joined at read time. */
export interface TaskView {
  readonly requestKey?: string | null;
  readonly browse: BrowseTaskProgress | null;
  readonly approval: readonly TaskApproval[];
  readonly createdAt: number;
  readonly error: string | null;
  readonly id: Task["id"];
  readonly input: Task["input"];
  readonly kind: TaskKind;
  readonly priceUsdMicros: UsdMicros;
  readonly receipts: readonly Receipt[];
  readonly result: Task["result"];
  readonly runId: Task["runId"];
  readonly saleId: Task["saleId"];
  readonly billingError?: ReturnType<typeof creditBillingError>;
  readonly chargeId?: Task["chargeId"];
  readonly chargeStatus?: Task["chargeStatus"];
  readonly priceCreditUnits?: Task["priceCreditUnits"];
  readonly status: TaskStatus;
  readonly updatedAt: number;
}

/** Every JSON body these handlers answer with. */
type TaskResponse =
  | { readonly error: string }
  | { readonly error: string; readonly receipt: Receipt }
  | { readonly header: string; readonly receipt: Receipt }
  | { readonly task: TaskView }
  | { readonly tasks: readonly TaskView[] };

const json = (body: TaskResponse, status = 200): Response =>
  Response.json(
    { v: 1, ...body },
    { headers: { "cache-control": "no-store" }, status }
  );

const taskView = (
  task: Task,
  deps: TaskDeps,
  workspace: Workspace
): TaskView => {
  const pending = deps.interactions
    .pendingFor(workspace.session.userId)
    .filter((request) => task.runId !== null && request.runId === task.runId);
  const awaiting = task.status === "running" && pending.length > 0;
  const receipts =
    task.runId === null
      ? []
      : workspace.session.history.filter(
          (receipt) => receipt.runId === task.runId
        );
  const browse =
    task.kind === "browse"
      ? publicBrowseTask(task, (deps.now ?? Date.now)(), awaiting)
      : null;
  let { result } = task;
  if (hostedTask(task)) {
    result = browse?.result ?? null;
  }
  if (task.kind === "service") {
    result = serviceTicket(task);
  }
  return {
    browse: browse?.browse ?? null,
    requestKey: browse?.requestKey ?? null,
    approval: awaiting
      ? pending.map((request) => ({
          amountLabel: request.amountLabel,
          expiresAt: request.expiresAt,
          id: request.id,
          title: request.title,
        }))
      : [],
    createdAt: task.createdAt,
    error: task.error,
    id: task.id,
    input: hostedTask(task) && browse !== null ? browse.input : task.input,
    kind: task.kind,
    priceUsdMicros: task.priceUsdMicros,
    receipts,
    result,
    runId: task.runId,
    saleId: task.saleId,
    billingError: creditBillingError(task),
    chargeId: task.chargeId,
    chargeStatus: task.chargeStatus,
    priceCreditUnits: task.priceCreditUnits,
    status: awaiting ? "awaiting_approval" : task.status,
    updatedAt: task.updatedAt,
  };
};

const runBrief = async (
  deps: TaskDeps,
  workspace: Workspace,
  task: Task,
  symbol: string
): Promise<void> => {
  const now = deps.now ?? Date.now;
  const { userId } = workspace.session;
  await deps.services.store.tasks.update(userId, task.id, {
    status: "running",
    updatedAt: now(),
  });
  const snapshot = await deps.services.graph.lendingMarkets(symbol);
  const fresh = snapshot.deployments.filter((d) => d.status === "fresh").length;
  // Two sentences a person can act on, then the rows they came from.
  const result = {
    bestSupply: describeBestSupply(snapshot),
    capturedAt: snapshot.capturedAt,
    cheapestBorrow: describeCheapestBorrow(snapshot),
    deployments: snapshot.deployments,
    fresh,
    markets: snapshot.markets.slice(0, 12),
    source: snapshot.source,
    stubbed: snapshot.stubbed,
    symbol: symbol.toUpperCase(),
    total: snapshot.deployments.length,
  };
  await finishCreditTask(
    deps.services,
    userId,
    task,
    { result, status: "done", updatedAt: now() },
    "capture"
  );
};

const BrowseProgress = Schema.Struct({
  spentUsdMicros: Schema.Int,
  steps: Schema.Int,
  activeMs: Schema.Int,
  summary: Schema.String,
});
const activeBrowses = new Map<string, { paused: boolean }>();

/** Mark the reason before aborting, so takeover keeps the purchased allowance. */
export const pauseBrowseTask = (sessionId: string): boolean => {
  const active = activeBrowses.get(sessionId);
  if (!active) {
    return false;
  }
  active.paused = true;
  return true;
};

const browseExecution = (deps: TaskDeps, task: Task) => {
  const saved = "quote" in task.input ? storedBrowseQuote(task) : null;
  const allowance = saved?.quote.modelAllowanceUsdMicros ?? 250_000;
  const executionMs = saved?.quote.executionMs ?? 5 * 60_000;
  const stepLimit =
    saved === null
      ? BROWSE_STEP_CAP
      : Math.floor(task.priceUsdMicros / 500_000) * BROWSE_STEP_CAP;
  const { environment } = deps.services;
  const stubbed = environment.modes.model === "stub";
  const rates = Schema.decodeUnknownResult(
    Schema.Struct({ input: Schema.Finite, output: Schema.Finite })
  )(task.input["modelRates"]);
  const inputRate =
    rates._tag === "Success"
      ? rates.success.input
      : environment.browserModelInputRate;
  const outputRate =
    rates._tag === "Success"
      ? rates.success.output
      : environment.browserModelOutputRate;
  if (!stubbed && (!(inputRate > 0) || !(outputRate > 0))) {
    throw new Error(
      "Paid browsing requires configured model token rates. No model call was made."
    );
  }
  return { allowance, executionMs, stepLimit, stubbed, inputRate, outputRate };
};

const runBrowse = async (
  deps: TaskDeps,
  workspace: Workspace,
  task: Task,
  instruction: string
): Promise<boolean> => {
  const monitorId = Schema.decodeUnknownResult(MonitorCheckId)(
    task.input["monitorCheckId"]
  );
  const monitorCheckId =
    monitorId._tag === "Success" ? monitorId.success : null;
  const enrichment = Schema.is(WatchlistItemId)(task.input["enrichmentItemId"]);
  const readOnly = monitorCheckId !== null || enrichment;
  const now = deps.now ?? Date.now;
  const { session } = workspace;
  const { userId } = session;
  const startedAt = now();
  const priorWaitingMs = deps.interactions.waitingMs(userId);
  const recovered = Schema.decodeUnknownResult(
    Schema.Struct({ progress: BrowseProgress })
  )(task.result);
  let progress =
    recovered._tag === "Success"
      ? recovered.success.progress
      : { spentUsdMicros: 0, steps: 0, activeMs: 0, summary: "" };
  const priorActiveMs = progress.activeMs;
  const activeMs = (): number =>
    priorActiveMs +
    Math.max(
      0,
      now() - startedAt - (deps.interactions.waitingMs(userId) - priorWaitingMs)
    );
  const { allowance, executionMs, stepLimit, stubbed, inputRate, outputRate } =
    browseExecution(deps, task);
  if (
    progress.activeMs >= executionMs ||
    progress.steps >= stepLimit ||
    progress.spentUsdMicros >= allowance
  ) {
    throw new Error(
      "The purchased browsing allowance is exhausted. Request a new quote to continue."
    );
  }
  const active = { paused: false };
  activeBrowses.set(session.id, active);
  let reserved = 0;
  let outcome: TaskOutcome = {
    status: "incomplete",
    reason: "The agent did not provide evidence of completion.",
    evidence: "",
  };
  const save = async (): Promise<void> => {
    progress = {
      ...progress,
      activeMs: activeMs(),
    };
    await deps.services.store.tasks.update(userId, task.id, {
      result: { progress, stubbed, outcome },
      updatedAt: now(),
    });
  };
  const message: UIMessage = {
    id: `task-${task.id}-${crypto.randomUUID()}`,
    parts: [{ text: instruction, type: "text" }],
    role: "user",
  };
  try {
    const turn = await startTurn(
      {
        surface: readOnly ? "monitor" : "browse",
        interactive: deps.unattended !== true,
        reportOutcome: (reported) => {
          outcome = reported;
        },
        connectionId: task.connectionId,
        browser: workspace.browser,
        budget: deps.budget,
        notices: deps.notices,
        oracleUrl: deps.oracleUrl,
        runs: deps.runs,
        services: deps.services,
        session,
        stepCap: stepLimit - progress.steps,
        unlocks: deps.unlocks,
        workspaces: deps.workspaces,
        paidBrowse: {
          beforeStep: async (promptBytes) => {
            if (
              deps.unattended === true &&
              readOnly &&
              deps.workspaces.isWatching(userId)
            ) {
              active.paused = true;
            }
            if (monitorCheckId !== null) {
              const state = await monitoringState(deps.services.store, userId);
              const check = state.checks.find(
                (entry) => entry.id === monitorCheckId
              );
              const monitor = state.monitors.find(
                (entry) => entry.id === check?.monitorId
              );
              if (
                !monitor ||
                monitor.status === "paused" ||
                monitor.revision !== check?.revision
              ) {
                active.paused = true;
              }
            }
            if (active.paused) {
              throw new Error("Paused for human control.");
            }
            if (activeMs() >= executionMs || progress.steps >= stepLimit) {
              throw new Error("The browsing execution allowance is exhausted.");
            }
            reserved = stubbed
              ? 0
              : Math.ceil(promptBytes * inputRate + 2048 * outputRate);
            if (progress.spentUsdMicros + reserved > allowance) {
              throw new Error(
                "The remaining model allowance cannot cover another step. Request a new quote to continue."
              );
            }
            progress = {
              ...progress,
              spentUsdMicros: progress.spentUsdMicros + reserved,
              steps: progress.steps + 1,
            };
            await save();
          },
          afterStep: async (usage) => {
            if (
              usage.inputTokens !== undefined &&
              usage.outputTokens !== undefined
            ) {
              const spent = stubbed
                ? 0
                : Math.ceil(
                    usage.inputTokens * inputRate +
                      usage.outputTokens * outputRate
                  );
              progress = {
                ...progress,
                spentUsdMicros: progress.spentUsdMicros - reserved + spent,
              };
            }
            reserved = 0;
            await save();
          },
        },
      },
      {
        messages: [message],
        externalThreadId: task.id,
        sessionId: session.id,
        source: "agent",
      }
    );
    const timer = setInterval(() => {
      if (activeMs() >= executionMs) {
        turn.run.abort();
      }
    }, 250);
    try {
      await deps.services.store.tasks.update(userId, task.id, {
        runId: turn.run.id,
        status: "running",
        updatedAt: now(),
      });
      recordTurn(deps, session.id, turn.run, sseOf(turn));
      const summary = await turn.result.text;
      const finishReason = await turn.result.finishReason;
      progress = {
        ...progress,
        summary: summary.slice(0, 16_000),
      };
      if (finishReason === "error") {
        throw new Error(
          "The browsing model failed before completing the task."
        );
      }
      await save();
      if (turn.run.signal.aborted && !active.paused) {
        throw new Error(
          task.chargeId === undefined
            ? "Browsing stopped. Its paid allowance was not refunded."
            : "Browsing stopped. Reserved credits were returned."
        );
      }
      const paused =
        active.paused ||
        (readOnly && outcome.status === "blocked");
      const patch = {
        result: { text: progress.summary, progress, stubbed, outcome },
        status: paused ? ("paused" as const) : ("done" as const),
        updatedAt: now(),
      };
      await (paused || monitorCheckId !== null
        ? deps.services.store.tasks.update(userId, task.id, patch)
        : finishCreditTask(deps.services, userId, task, patch, "capture"));
      return !paused;
    } finally {
      clearInterval(timer);
    }
  } catch (error) {
    if (error instanceof CreditCommitUncertainError) {
      throw error;
    }
    await save();
    if (active.paused) {
      await deps.services.store.tasks.update(userId, task.id, {
        status: "paused",
        error: null,
        updatedAt: now(),
      });
      return false;
    }
    throw error;
  } finally {
    activeBrowses.delete(session.id);
  }
};

/** Why a task failed, for the caller: the budget in its own words, else the error's. */
const failureText = (error: Error): string =>
  error instanceof ModelBudgetExhaustedError
    ? `the day's model budget is used up: ${error.message}`
    : error.message;

/** Run a paid task to its end, whatever that is, and write the end down. */
const execute = (deps: TaskDeps, workspace: Workspace, task: Task): void => {
  if (hostedTask(task)) {
    startHostedBrowse(deps, workspace, task);
    return;
  }
  const now = deps.now ?? Date.now;
  const { userId } = workspace.session;
  detached(`task ${task.id}`, async () => {
    try {
      await authorizeCreditTask(deps.services, userId, task);
      if (task.kind === "brief") {
        await runBrief(deps, workspace, task, String(task.input["symbol"]));
      } else if (
        !(await runBrowse(
          deps,
          workspace,
          task,
          String(task.input["instruction"])
        ))
      ) {
        return;
      }
      if (task.saleId !== null) {
        await deps.services.store.sales.update(task.saleId, {
          deliveredAt: now(),
          status: "delivered",
        });
      }
    } catch (error) {
      if (error instanceof CreditCommitUncertainError) {
        return;
      }
      const message = failureText(
        error instanceof Error ? error : new Error("the task failed")
      );
      await finishCreditTask(
        deps.services,
        userId,
        task,
        { error: message, status: "failed", updatedAt: now() },
        "release"
      );
      if (task.saleId !== null) {
        await deps.services.store.sales.update(task.saleId, {
          error: message,
          status: "failed",
        });
      }
    }
  });
};

export const resumeBrowseTask = async (
  deps: TaskDeps,
  userId: UserId,
  taskId?: TaskId
): Promise<void> => {
  const workspace = await deps.workspaces.hydrate(userId);
  if (hasHostedBrowse(userId)) {
    await controlCurrentHostedBrowse(userId, "continue");
    return;
  }
  if (
    deps.runs.get(workspace.session.id) !== null ||
    activeBrowses.has(workspace.session.id)
  ) {
    throw new Error(
      "The previous run is still stopping. Try Resume again shortly."
    );
  }
  const tasks = await deps.services.store.tasks.list(userId, 100);
  const task = tasks.find(
    (entry) =>
      entry.kind === "browse" &&
      (taskId === undefined || entry.id === taskId) &&
      (entry.saleId !== null || entry.chargeId !== undefined) &&
      (entry.status === "paused" ||
        entry.status === "running" ||
        entry.status === "paid")
  );
  if (!task) {
    return;
  }
  if (
    !(await deps.services.store.tasks.claim(userId, task.id, task.status, {
      status: "paid",
      updatedAt: (deps.now ?? Date.now)(),
    }))
  ) {
    return;
  }
  execute(deps, workspace, { ...task, status: "paid" });
};

const postCreditTask = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller,
  invocation: InvocationSummary,
  body: TaskBody
): Promise<Response> => {
  const now = (deps.now ?? Date.now)();
  const key = request.headers.get("idempotency-key") ?? body.idempotencyKey;
  if (key === undefined || key === "" || key.length > 200) {
    return json(
      { error: "An idempotency key between 1 and 200 characters is required." },
      400
    );
  }
  const input =
    body.kind === "brief"
      ? { v: 2, symbol: body.symbol }
      : { v: 2, instruction: body.instruction };
  const task: Task = {
    agentTokenId: caller.agentTokenId,
    connectionId: callerConnection(caller),
    createdAt: now,
    updatedAt: now,
    error: null,
    id: TaskId.generate(),
    idempotencyKey: key,
    input,
    kind: body.kind,
    priceUsdMicros: TASK_PRICE_USD_MICROS[body.kind],
    result: null,
    runId: null,
    saleId: null,
    status: "paid",
  };
  await authorizeCreditTask(deps.services, caller.userId, task);
  const reserved = await deps.services.store.credits.reserveTask(
    caller.userId,
    task,
    {
      initialLimits: creditLimitsFromMandate(workspace.session.currentMandate),
      stubbed:
        body.kind === "brief"
          ? deps.services.environment.modes.graph === "stub"
          : deps.services.environment.modes.browser === "stub",
      now,
    }
  );
  invocation.taskId = reserved.task.id;
  if (reserved.charge.status === "refused") {
    return Response.json(
      {
        v: 1,
        task: taskView(reserved.task, deps, workspace),
        error: reserved.charge.reason,
        code: "credits_refused",
        fundingUrl: "/wallet?buyCredits=1",
      },
      { status: 409 }
    );
  }
  if (!reserved.replayed) {
    deps.workspaces.touch(caller.userId);
    execute(deps, workspace, reserved.task);
  }
  return json(
    { task: taskView(reserved.task, deps, workspace) },
    reserved.task.status === "done" ? 200 : 202
  );
};

const performTaskPost = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller,
  invocation: InvocationSummary
): Promise<Response> => {
  const version = Schema.decodeUnknownResult(
    Schema.Struct({ v: Schema.Literal(2) })
  )(
    await request
      .clone()
      .json()
      .catch(() => null)
  );
  if (
    version._tag === "Failure" ||
    request.headers.has("payment-signature") ||
    request.headers.has("x-payment")
  ) {
    return json(
      {
        error:
          "Upgrade to task API v2. Buy Froggy credits in Your money, then submit without a payment proof.",
      },
      426
    );
  }
  const decoded = await decodeTaskRequest(request);
  if (decoded._tag === "Failure") {
    return json(
      {
        error:
          'Malformed task. Send {"kind":"brief","symbol":"USDC"} or {"kind":"browse","instruction":"..."}.',
      },
      400
    );
  }
  const body = decoded.success;
  invocation.name = body.kind;
  if (
    body.kind === "browse" &&
    deps.monitorCheckId === undefined &&
    /\b(?:email|inbox|verification code|confirmation code)\b/iu.test(
      body.instruction
    )
  ) {
    const scopes = await connectionScopes(
      deps.services.store,
      caller.userId,
      callerConnection(caller)
    );
    if (scopes !== null && !scopes.has("email:read")) {
      return json(
        {
          error:
            "This task requires email:read permission. Reconnect in Agents and enable email access before purchasing. Nothing was charged.",
        },
        403
      );
    }
    const { email } = deps.services;
    const emailStatus = await email?.status(caller.userId);
    if (emailStatus?.mailbox?.active !== true) {
      return json(
        {
          error:
            "Configure your email in Account before purchasing this task. Nothing was charged.",
        },
        409
      );
    }
  }
  // A grant buys only the kinds the person left on; the scope is the kind.
  if (caller.scopes !== null && !caller.scopes.has(body.kind)) {
    return insufficientScope(body.kind);
  }
  if (body.kind === "browse" && "budgetUsd" in body) {
    return await handleBrowseQuote(
      deps,
      request,
      workspace,
      caller,
      body,
      (task) => {
        execute(deps, workspace, task);
      },
      (task) => taskView(task, deps, workspace)
    );
  }
  if (body.kind === "browse") {
    return await serializeBrowsePayment(caller.userId, async () => {
      const activeTasks = await deps.services.store.tasks.activeBrowses();
      const active = activeTasks.some((row) => row.userId === caller.userId);
      if (active || hasHostedBrowse(caller.userId)) {
        return json(
          {
            error: "Another browser task is active. Nothing else was charged.",
          },
          409
        );
      }
      return await postCreditTask(
        deps,
        request,
        workspace,
        caller,
        invocation,
        body
      );
    });
  }
  return await postCreditTask(
    deps,
    request,
    workspace,
    caller,
    invocation,
    body
  );
};

export const handleTaskPost = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller
): Promise<Response> =>
  await trackAgentRequest(
    deps.services,
    caller,
    "task",
    "tasks.create",
    "POST",
    async (invocation) =>
      await performTaskPost(deps, request, workspace, caller, invocation)
  );

export const handleTaskGet = async (
  deps: TaskDeps,
  workspace: Workspace,
  caller: TaskCaller,
  id: string
): Promise<Response> => {
  if (!TaskId.is(id)) {
    return json({ error: "Not a task id." }, 404);
  }
  const task = visibleTask(
    await deps.services.store.tasks.byId(caller.userId, id),
    caller
  );
  if (task === null) {
    return json({ error: "No such task." }, 404);
  }
  return json({ task: taskView(task, deps, workspace) });
};

export const handleTaskList = async (
  deps: TaskDeps,
  workspace: Workspace,
  caller: TaskCaller,
  idempotencyKey: string | null = null
): Promise<Response> => {
  const { userId } = caller;
  if (idempotencyKey !== null) {
    const task = visibleTask(
      await deps.services.store.tasks.byIdempotencyKey(userId, idempotencyKey),
      caller
    );
    return json({
      tasks: task === null ? [] : [taskView(task, deps, workspace)],
    });
  }
  const tasks = visibleTasks(
    await deps.services.store.tasks.list(userId, 50),
    caller
  );
  return json({ tasks: tasks.map((task) => taskView(task, deps, workspace)) });
};

/** The run's stream, for a task still running on this process. 204 otherwise. */
export const handleTaskEvents = async (
  deps: TaskDeps,
  workspace: Workspace,
  caller: TaskCaller,
  id: string
): Promise<Response> => {
  if (!TaskId.is(id)) {
    return json({ error: "Not a task id." }, 404);
  }
  const task = visibleTask(
    await deps.services.store.tasks.byId(caller.userId, id),
    caller
  );
  if (task === null) {
    return json({ error: "No such task." }, 404);
  }
  const run = deps.runs.get(workspace.session.id);
  const replay = run !== null && run.id === task.runId ? run.replay() : null;
  if (replay === null) {
    return new Response(null, { status: 204 });
  }
  return new Response(replay.pipeThrough(new TextEncoderStream()), {
    headers: { "content-type": "text/event-stream" },
  });
};

/** The old task-signing door is retired before it can touch any wallet. */
export const handleWalletPay = async (
  _deps: TaskDeps,
  _request: Request,
  _workspace: Workspace,
  _caller: TaskCaller
): Promise<Response> =>
  await Promise.resolve(
    json(
      {
        error:
          "Per-task payments are retired. Buy Froggy credits in Your money and use task API v2.",
      },
      410
    )
  );
