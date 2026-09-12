/**
 * Delegated tasks: the thing an outside agent buys.
 *
 * `POST /api/tasks` is an x402 seller like the oracle, and the same book
 * records every sale before any work starts. What it sells is a task with a
 * durable id: a paid data brief with no browser, or a browse on the person's
 * own Chrome under their mandate. The id outlives every socket, so a caller
 * that hangs up gets the same task back, and a caller that repeats a request
 * with the same idempotency key gets the same task rather than a second bill.
 *
 * Prices are fixed per kind and the quote is the price; nothing is metered
 * back. Paid work that fails afterwards stays retrievable as a failed task
 * whose receipt says paid, failed, not refunded.
 */

import { RunId, SaleId, TaskId, usdMicros } from "@froggy/domain";
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
import { describeBestSupply, describeCheapestBorrow } from "@froggy/graph";
import {
  decodePaymentChallenge,
  describePayment,
  encodeChallengeHeader,
  paymentFrom,
} from "@froggy/payments";
import type { PaymentChallenge } from "@froggy/payments";
import type { UIMessage } from "ai";
import { Schema } from "effect";

import { trackAgentRequest } from "./agent-invocations";
import type { InvocationSummary } from "./agent-invocations";
import {
  handleBrowseQuote,
  QuotedBrowseInput,
  storedBrowseQuote,
} from "./browse-quotes";
import type { ModelBudget } from "./budget";
import { ModelBudgetExhaustedError } from "./budget";
import { detached } from "./detached";
import type { InteractionRegistry } from "./interactions";
import type { Notices } from "./notices";
import { insufficientScope } from "./oauth";
import type { ChatRunRegistry } from "./runs";
import { serviceTicket } from "./service-tasks";
import type { Services } from "./services";
import { MalformedSpendError, UnpricedAssetError } from "./session";
import type { SpendRequest } from "./session";
import { assetFor } from "./tools-assets";
import { recordTurn, sseOf, startTurn } from "./turn";
import type { UnlockTokens } from "./unlock";
import type { Workspaces } from "./workspaces";

/** Dollars, fixed per kind. Charged in HBAR at the mirror-node rate. */
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
    idempotencyKey: Schema.optional(Schema.String),
    kind: Schema.Literals(["brief"]),
    symbol: Schema.String,
  }),
  QuotedBrowseInput,
  Schema.Struct({
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

const PayBody = Schema.Struct({
  challenge: Schema.Unknown,
  quoteTaskId: Schema.optional(TaskId),
});
const decodePayBody = Schema.decodeUnknownResult(PayBody);

export interface TaskDeps {
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
export const callerConnection = (
  caller: TaskCaller
): AgentConnectionId | null => caller.grantId ?? caller.agentTokenId;

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

/** The proof's fingerprint, the same way the oracle keys its book. */
const paymentHash = (paymentHeader: string): string =>
  new Bun.CryptoHasher("sha256").update(paymentHeader).digest("hex");

/**
 * Dollars into tinybars at the mirror-node rate, rounded up so the seller is
 * never short by a tinybar. Null when there is no usable rate: a task cannot
 * be sold at a guessed price.
 */
const tinybarsFor = (
  services: Services,
  priceUsdMicros: number,
  now: number
): string | null => {
  const rate = services.rates.current(now);
  if (rate === null) {
    return null;
  }
  return String(
    Math.ceil((priceUsdMicros * 100_000_000) / rate.usdMicrosPerHbar)
  );
};

const challengeFor = (
  deps: TaskDeps,
  kind: Exclude<TaskKind, "service">,
  now: number
) => {
  const units = tinybarsFor(deps.services, TASK_PRICE_USD_MICROS[kind], now);
  if (units === null) {
    return null;
  }
  return deps.services.oracle.challenge({
    description:
      kind === "brief"
        ? "A lending brief for one token across twelve standardized deployments."
        : `A browse on the person's shared Chrome, up to ${BROWSE_STEP_CAP} steps, under their mandate.`,
    units,
    url: deps.tasksUrl,
  });
};

const taskView = (
  task: Task,
  deps: TaskDeps,
  workspace: Workspace
): TaskView => {
  const pending = deps.interactions.pendingFor(workspace.session.userId);
  const awaiting = task.status === "running" && pending.length > 0;
  const receipts =
    task.runId === null
      ? []
      : workspace.session.history.filter(
          (receipt) => receipt.runId === task.runId
        );
  return {
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
    input: task.input,
    kind: task.kind,
    priceUsdMicros: task.priceUsdMicros,
    receipts,
    result: task.kind === "service" ? serviceTicket(task) : task.result,
    runId: task.runId,
    saleId: task.saleId,
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
  await deps.services.store.tasks.update(userId, task.id, {
    result,
    status: "done",
    updatedAt: now(),
  });
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
  const save = async (): Promise<void> => {
    progress = {
      ...progress,
      activeMs: activeMs(),
    };
    await deps.services.store.tasks.update(userId, task.id, {
      result: { progress, stubbed },
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
          "Browsing stopped. Its paid allowance was not refunded."
        );
      }
      await deps.services.store.tasks.update(userId, task.id, {
        result: { text: progress.summary, progress, stubbed },
        status: active.paused ? "paused" : "done",
        updatedAt: now(),
      });
      return !active.paused;
    } finally {
      clearInterval(timer);
    }
  } catch (error) {
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
  const now = deps.now ?? Date.now;
  const { userId } = workspace.session;
  detached(`task ${task.id}`, async () => {
    try {
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
      const message = failureText(
        error instanceof Error ? error : new Error("the task failed")
      );
      // Paid, failed, not refunded: the sale keeps its settlement and the
      // task says why, which is the whole of what the caller gets.
      await deps.services.store.tasks.update(userId, task.id, {
        error: message,
        status: "failed",
        updatedAt: now(),
      });
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
  userId: UserId
): Promise<void> => {
  const workspace = await deps.workspaces.hydrate(userId);
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
      entry.saleId !== null &&
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

const inputOf = (body: TaskBody): Task["input"] =>
  body.kind === "brief"
    ? { symbol: body.symbol }
    : { instruction: body.instruction };

const replayTask = (
  task: Task,
  body: TaskBody,
  deps: TaskDeps,
  workspace: Workspace
): Response => {
  if (
    task.kind !== body.kind ||
    JSON.stringify(task.input) !== JSON.stringify(inputOf(body))
  ) {
    return json(
      { error: "Idempotency key belongs to different task input." },
      409
    );
  }
  return json({ task: taskView(task, deps, workspace) });
};

const claimTask = async (
  deps: TaskDeps,
  workspace: Workspace,
  task: Task,
  body: TaskBody
): Promise<Response | null> => {
  try {
    await deps.services.store.tasks.create(workspace.session.userId, task);
    return null;
  } catch (error) {
    const winner = await deps.services.store.tasks.byIdempotencyKey(
      workspace.session.userId,
      task.idempotencyKey ?? task.id
    );
    if (winner !== null) {
      return replayTask(winner, body, deps, workspace);
    }
    throw error;
  }
};

const postLegacyTask = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller,
  invocation: InvocationSummary,
  body: TaskBody
): Promise<Response> => {
  const now = deps.now ?? Date.now;
  const { store } = deps.services;
  const { userId } = caller;
  const key =
    request.headers.get("idempotency-key") ?? body.idempotencyKey ?? null;
  if (key !== null) {
    const earlier = await store.tasks.byIdempotencyKey(userId, key);
    if (earlier !== null) {
      return replayTask(earlier, body, deps, workspace);
    }
  }

  const payment = paymentFrom(request.headers);
  const challenge = challengeFor(deps, body.kind, now());
  if (challenge === null) {
    return json({ error: "No usable HBAR rate; try again shortly." }, 503);
  }
  if (payment === null) {
    return Response.json(challenge, {
      headers: {
        "cache-control": "no-store",
        "payment-required": encodeChallengeHeader(challenge),
      },
      status: 402,
    });
  }

  const hash = paymentHash(payment);
  const seen = await store.sales.byPaymentHash(hash);
  if (seen !== null) {
    const bought = await store.tasks.bySaleId(userId, seen.id);
    if (bought !== null) {
      return replayTask(bought, body, deps, workspace);
    }
    return json({ error: "That payment already bought something else." }, 409);
  }

  const [requirements] = challenge.accepts;
  if (requirements === undefined) {
    return json({ error: "No payment requirements." }, 500);
  }
  const task: Task = {
    agentTokenId: caller.agentTokenId,
    connectionId: caller.grantId ?? caller.agentTokenId,
    createdAt: now(),
    error: null,
    id: TaskId.generate(),
    idempotencyKey: key ?? `proof:${hash}`,
    input: inputOf(body),
    kind: body.kind,
    priceUsdMicros: TASK_PRICE_USD_MICROS[body.kind],
    result: null,
    runId: null,
    saleId: null,
    status: "quoted",
    updatedAt: now(),
  };
  const existing = await claimTask(deps, workspace, task, body);
  if (existing !== null) {
    return existing;
  }

  invocation.taskId = task.id;
  let settled: Awaited<ReturnType<Services["oracle"]["settle"]>>;
  try {
    settled = await deps.services.oracle.settle(payment, requirements);
  } catch (error) {
    await store.tasks.update(userId, task.id, {
      status: "uncertain",
      error: "Payment outcome is unknown; do not purchase again.",
      updatedAt: now(),
    });
    throw error;
  }
  if (!settled.ok) {
    await store.tasks.update(userId, task.id, {
      status: "uncertain",
      error: settled.error ?? "Payment was not confirmed.",
      updatedAt: now(),
    });
    return json({ error: settled.error ?? "Payment was not settled." }, 402);
  }

  const described = describePayment(payment);
  const recorded = await store.sales.record({
    amount: requirements.amount,
    asset: requirements.asset,
    at: now(),
    deliveredAt: null,
    error: null,
    id: SaleId.generate(),
    network: requirements.network,
    payer: described.payer,
    paymentHash: hash,
    resource: `${deps.tasksUrl}#${body.kind}`,
    result: null,
    status: "settled",
    stubbed: settled.stubbed,
    transactionId: settled.transactionId,
  });
  const paidTask: Task = {
    ...task,
    saleId: recorded.sale.id,
    status: "paid",
    updatedAt: now(),
  };
  await store.tasks.update(userId, task.id, {
    saleId: recorded.sale.id,
    status: "paid",
    updatedAt: now(),
  });
  deps.workspaces.touch(userId);
  execute(deps, workspace, paidTask);
  return json({ task: taskView(paidTask, deps, workspace) }, 202);
};

const performTaskPost = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller,
  invocation: InvocationSummary
): Promise<Response> => {
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
  return await postLegacyTask(
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

/** The Hedera `exact` offer, the one leg a keyless agent can have signed here. */
const offerFor = (
  deps: TaskDeps,
  challenge: PaymentChallenge
): PaymentChallenge["accepts"][number] | null =>
  challenge.accepts.find(
    (requirement) =>
      requirement.network === deps.services.payer.network &&
      requirement.scheme === "exact"
  ) ?? null;

/**
 * `POST /api/wallet/pay`: sign a payment for a 402 the caller holds, under
 * the person's mandate, and hand the header back.
 *
 * This is how an outside agent that holds no key pays: it is a real x402
 * client whose signer is the person's Froggy wallet. The spend goes through
 * the same choke point as every payment — priced, judged, reserved, filed —
 * and only the header leaves. Money moves when the seller settles it; the
 * receipt therefore carries no settlement, and the sale does.
 */
const trustedTaskOffer = (
  deps: TaskDeps,
  requirement: PaymentChallenge["accepts"][number]
): boolean => {
  const [trusted] = deps.services.oracle.challenge({
    description: "Froggy task",
    units: requirement.amount,
    url: deps.tasksUrl,
  }).accepts;
  return (
    trusted !== undefined &&
    requirement.payTo === deps.services.oracle.payTo &&
    requirement.asset === "0.0.0" &&
    JSON.stringify(requirement.extra ?? {}) ===
      JSON.stringify(trusted.extra ?? {}) &&
    requirement.maxTimeoutSeconds === trusted.maxTimeoutSeconds
  );
};

const validateQuotePayment = async (
  deps: TaskDeps,
  caller: TaskCaller,
  quoteTaskId: TaskId | undefined,
  challenge: Extract<
    ReturnType<typeof decodePaymentChallenge>,
    { _tag: "Success" }
  >
): Promise<Response | null> => {
  if (quoteTaskId !== undefined) {
    const quoted = await deps.services.store.tasks.byId(
      caller.userId,
      quoteTaskId
    );
    if (quoted === null || quoted.status !== "quoted") {
      return json({ error: "That quote is not payable." }, 409);
    }
    const saved = storedBrowseQuote(quoted);
    const decodedSaved = decodePaymentChallenge(saved.challenge);
    if (
      saved.quote.expiresAt <= (deps.now ?? Date.now)() ||
      decodedSaved._tag === "Failure" ||
      JSON.stringify(decodedSaved.success) !== JSON.stringify(challenge.success)
    ) {
      return json(
        { error: "Payment must match the unexpired task quote." },
        409
      );
    }
  }
  return null;
};

const performWalletPay = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller
): Promise<Response> => {
  const body = decodePayBody(await request.json().catch(() => null));
  if (body._tag === "Failure") {
    return json({ error: 'Send {"challenge": <the 402 body>}.' }, 400);
  }
  const challenge = decodePaymentChallenge(body.success.challenge);
  if (challenge._tag === "Failure") {
    return json({ error: "That is not an x402 challenge." }, 400);
  }
  const invalidQuote = await validateQuotePayment(
    deps,
    caller,
    body.success.quoteTaskId,
    challenge
  );
  if (invalidQuote !== null) {
    return invalidQuote;
  }
  const requirement = offerFor(deps, challenge.success);
  if (requirement === null) {
    return json(
      { error: "This wallet cannot pay any of the networks that 402 offers." },
      422
    );
  }
  if (!trustedTaskOffer(deps, requirement)) {
    return json({ error: "Payment parameters do not match this server." }, 422);
  }
  const amount = assetFor(requirement);
  if (amount === null) {
    return json({ error: `Unknown network ${requirement.network}.` }, 422);
  }
  const { session } = workspace;
  let payer: Services["payer"];
  try {
    payer = await deps.services.hederaPayerFor({
      openingUsdMicros: session.pocket ?? 0,
      userId: caller.userId,
    });
  } catch (error) {
    return json(
      {
        error: `Could not open your Hedera account: ${error instanceof Error ? error.message : String(error)}. Nothing was signed.`,
      },
      502
    );
  }
  let header: string | null = null;
  const spend: SpendRequest = {
    amount,
    host: new URL(deps.tasksUrl).host,
    kind: "service_payment",
    idempotencyKey:
      body.success.quoteTaskId === undefined
        ? `pay:${caller.agentTokenId ?? "person"}:${requirement.payTo}:${requirement.amount}:${Date.now()}`
        : `pay:quote:${body.success.quoteTaskId}`,
    interactive: true,
    payeeId: requirement.payTo,
    payeeLabel: `${requirement.payTo} (x402, signed for an agent)`,
    provenance: "server",
    purpose: `a payment header for ${requirement.amount} ${requirement.asset} on ${requirement.network}`,
    runId: RunId.generate(),
    settle: async () => {
      const attempt = await payer.pay(challenge.success);
      if (attempt.header === null) {
        return {
          error: attempt.error ?? "no payment could be built",
          network: requirement.network,
          ok: false,
          sent: false,
          stubbed: attempt.stubbed,
          transactionId: null,
        };
      }
      ({ header } = attempt);
      // Signed and handed over, not settled: the seller settles it, and the
      // receipt says a header left rather than that money moved.
      return {
        network: requirement.network,
        ok: true,
        sent: true,
        stubbed: attempt.stubbed,
        transactionId: null,
      };
    },
  };
  try {
    const result = await session.spend(spend);
    if (result.decision._tag === "deny") {
      return json(
        { error: result.decision.message, receipt: result.receipt },
        403
      );
    }
    if (header === null) {
      return json(
        {
          error: result.receipt.failure ?? "no payment was signed",
          receipt: result.receipt,
        },
        402
      );
    }
    if (body.success.quoteTaskId !== undefined) {
      await deps.services.store.tasks.update(
        caller.userId,
        body.success.quoteTaskId,
        {
          result: { paymentProofHash: paymentHash(header) },
          updatedAt: (deps.now ?? Date.now)(),
        }
      );
    }
    return json({ header, receipt: result.receipt });
  } catch (error) {
    if (
      error instanceof MalformedSpendError ||
      error instanceof UnpricedAssetError
    ) {
      return json({ error: error.message }, 422);
    }
    throw error;
  }
};

export const handleWalletPay = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller
): Promise<Response> =>
  await trackAgentRequest(
    deps.services,
    caller,
    "pay",
    "wallet.pay",
    "POST",
    async () => await performWalletPay(deps, request, workspace, caller)
  );
