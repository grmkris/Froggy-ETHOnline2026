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

import type { ModelBudget } from "./budget";
import { ModelBudgetExhaustedError } from "./budget";
import { detached } from "./detached";
import type { InteractionRegistry } from "./interactions";
import type { Notices } from "./notices";
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
  Schema.Struct({
    idempotencyKey: Schema.optional(Schema.String),
    instruction: Schema.String,
    kind: Schema.Literals(["browse"]),
  }),
]);
type TaskBody = typeof TaskBody.Type;
const decodeTaskBody = Schema.decodeUnknownResult(TaskBody);

const PayBody = Schema.Struct({ challenge: Schema.Unknown });
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
  readonly agentTokenId: Task["agentTokenId"];
  readonly userId: UserId;
}

type Workspace = Awaited<ReturnType<Workspaces["hydrate"]>>;

/** An open ticket, as a task reports it: enough to find the card, never to answer it. */
interface TaskApproval {
  readonly amountLabel: string;
  readonly expiresAt: number;
  readonly id: string;
  readonly title: string;
}

/** A task as a caller sees it. Approval and receipts are joined at read time. */
interface TaskView {
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
  Response.json(body, { headers: { "cache-control": "no-store" }, status });

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

const runBrowse = async (
  deps: TaskDeps,
  workspace: Workspace,
  task: Task,
  instruction: string
): Promise<void> => {
  const now = deps.now ?? Date.now;
  const { session } = workspace;
  const { userId } = session;
  const message: UIMessage = {
    id: `task-${task.id}`,
    parts: [{ text: instruction, type: "text" }],
    role: "user",
  };
  const turn = await startTurn(
    {
      browser: workspace.browser,
      budget: deps.budget,
      notices: deps.notices,
      oracleUrl: deps.oracleUrl,
      runs: deps.runs,
      services: deps.services,
      session,
      stepCap: BROWSE_STEP_CAP,
      unlocks: deps.unlocks,
      workspaces: deps.workspaces,
    },
    { messages: [message], sessionId: session.id }
  );
  await deps.services.store.tasks.update(userId, task.id, {
    runId: turn.run.id,
    status: "running",
    updatedAt: now(),
  });
  // Recorded so the web client can replay the run and the receipts are
  // filed under it, exactly as a chat turn would be.
  recordTurn(deps, session.id, turn.run, sseOf(turn));
  const text = await turn.result.text;
  await deps.services.store.tasks.update(userId, task.id, {
    result: { text },
    status: "done",
    updatedAt: now(),
  });
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
      await (task.kind === "brief"
        ? runBrief(deps, workspace, task, String(task.input["symbol"]))
        : runBrowse(deps, workspace, task, String(task.input["instruction"])));
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

export const handleTaskPost = async (
  deps: TaskDeps,
  request: Request,
  workspace: Workspace,
  caller: TaskCaller
): Promise<Response> => {
  const now = deps.now ?? Date.now;
  const { store } = deps.services;
  const { userId } = caller;
  const decoded = decodeTaskBody(await request.json().catch(() => null));
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

export const handleTaskGet = async (
  deps: TaskDeps,
  workspace: Workspace,
  userId: UserId,
  id: string
): Promise<Response> => {
  if (!TaskId.is(id)) {
    return json({ error: "Not a task id." }, 404);
  }
  const task = await deps.services.store.tasks.byId(userId, id);
  if (task === null) {
    return json({ error: "No such task." }, 404);
  }
  return json({ task: taskView(task, deps, workspace) });
};

export const handleTaskList = async (
  deps: TaskDeps,
  workspace: Workspace,
  userId: UserId
): Promise<Response> => {
  const tasks = await deps.services.store.tasks.list(userId, 50);
  return json({ tasks: tasks.map((task) => taskView(task, deps, workspace)) });
};

/** The run's stream, for a task still running on this process. 204 otherwise. */
export const handleTaskEvents = async (
  deps: TaskDeps,
  workspace: Workspace,
  userId: UserId,
  id: string
): Promise<Response> => {
  if (!TaskId.is(id)) {
    return json({ error: "Not a task id." }, 404);
  }
  const task = await deps.services.store.tasks.byId(userId, id);
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

export const handleWalletPay = async (
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
    idempotencyKey: `pay:${caller.agentTokenId ?? "person"}:${requirement.payTo}:${requirement.amount}:${Date.now()}`,
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
