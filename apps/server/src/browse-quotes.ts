import {
  ConversationId,
  SaleId,
  TaskId,
  usdMicros,
  quotePaymentState,
} from "@froggy/domain";
import type { Task, UserId } from "@froggy/domain";
import {
  decodePaymentChallenge,
  describePayment,
  encodeChallengeHeader,
  paymentFrom,
} from "@froggy/payments";
import { BrowseBudget, BrowseQuote } from "@froggy/protocol";
import { Schema } from "effect";

import { hostedTask } from "./hosted-browse-state";
import type { TaskCaller, TaskDeps, TaskView } from "./tasks";
import type { Workspaces } from "./workspaces";

export const QuotedBrowseInput = Schema.Struct({
  kind: Schema.Literals(["browse"]),
  instruction: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(8000)
  ),
  budgetUsd: BrowseBudget,
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(200)
  ),
  quoteTaskId: Schema.optional(TaskId),
  conversationId: Schema.optional(ConversationId),
});
type BrowseInput = typeof QuotedBrowseInput.Type;
const StoredQuote = Schema.Struct({
  quote: BrowseQuote,
  challenge: Schema.Unknown,
});
export const storedBrowseQuote = (task: Task) =>
  Schema.decodeUnknownSync(StoredQuote)(task.input);
type Challenge = ReturnType<TaskDeps["services"]["oracle"]["challenge"]>;
interface Context {
  readonly deps: TaskDeps;
  readonly caller: TaskCaller;
  readonly workspace: Awaited<ReturnType<Workspaces["hydrate"]>>;
  readonly execute: (task: Task) => void;
  readonly view: (task: Task) => TaskView;
  readonly now: number;
}
type ResponseBody =
  | {
      readonly error: string;
      readonly task?: TaskView | null;
      readonly taskId?: TaskId;
    }
  | { readonly task: TaskView | null };
const json = (body: ResponseBody, status = 200): Response =>
  Response.json(
    { v: 1, ...body },
    { status, headers: { "cache-control": "no-store" } }
  );
const description = (executionMs: number): string =>
  `A bounded browsing task (${executionMs / 60_000} active minutes maximum). Website purchases cost extra.`;

// The process owns one browser per person. Signing, re-pricing and settlement
// share this queue; the durable signing marker survives a process restart.
const paymentOwners = new Map<UserId, Promise<unknown>>();
export const serializeBrowsePayment = async <T>(
  owner: UserId,
  work: () => Promise<T>
): Promise<T> => {
  const previous = paymentOwners.get(owner) ?? Promise.resolve();
  const next = (async () => {
    await previous.catch(() => null);
    return await work();
  })();
  paymentOwners.set(owner, next);
  try {
    return await next;
  } finally {
    if (paymentOwners.get(owner) === next) {
      paymentOwners.delete(owner);
    }
  }
};

/** A signed payment header is on file for this quote, so its price is spoken for. */
const hasSignedPayment = (task: Task): boolean =>
  quotePaymentState(task) !== null;

/**
 * Everything a quote needs to be paid, or the reason it cannot be offered.
 * Shared between minting a quote and re-pricing one, so both agree on price,
 * minutes, expiry and the challenge the payment will be checked against.
 */
const priceQuote = (
  context: Context,
  body: BrowseInput,
  id: TaskId,
  key: string
):
  | Response
  | {
      readonly input: Task["input"];
      readonly priceUsdMicros: Task["priceUsdMicros"];
      readonly quote: BrowseQuote;
    } => {
  const { deps, now } = context;
  const { services } = deps;
  const { environment } = services;
  // Delegated tools and email run in Froggy's loop, where their current grants are enforced.
  const workspaceTools =
    deps.unattended === true ||
    context.caller.grantId !== null ||
    context.caller.agentTokenId !== null ||
    /\b(?:email|inbox|verification code|confirmation code)\b/iu.test(
      body.instruction
    );
  if (environment.browserUseApiKey === null) {
    return json(
      { error: "Browsing is not configured. Nothing was charged." },
      503
    );
  }
  if (
    (workspaceTools || environment.browseExecutor !== "hosted") &&
    environment.modes.model !== "stub" &&
    (!(environment.browserModelInputRate > 0) ||
      !(environment.browserModelOutputRate > 0))
  ) {
    return json(
      {
        error:
          "Paid browsing model rates are not configured. Nothing was charged.",
      },
      503
    );
  }
  const rate = services.rates.current(now);
  if (!rate) {
    return json({ error: "No usable HBAR rate; nothing was charged." }, 503);
  }
  const price = usdMicros(body.budgetUsd * 1_000_000);
  const executionMs = { 1: 10, 3: 20, 5: 30 }[body.budgetUsd] * 60_000;
  const quote: BrowseQuote = {
    taskId: id,
    instruction: body.instruction,
    budgetUsd: body.budgetUsd,
    idempotencyKey: key,
    priceUsdMicros: price,
    modelAllowanceUsdMicros: price / 2,
    executionMs,
    expiresAt: now + 5 * 60_000,
  };
  const challenge = services.oracle.challenge({
    description: description(executionMs),
    units: String(Math.ceil((price * 100_000_000) / rate.usdMicrosPerHbar)),
    url: `${deps.tasksUrl}?quote=${id}`,
  });
  let input: Task["input"] = {
    instruction: body.instruction,
    stubbed:
      environment.modes.browser === "stub" ||
      environment.modes.hedera === "stub" ||
      environment.modes.privy === "stub",
    executor: workspaceTools ? "legacy" : environment.browseExecutor,
    quote,
    challenge,
    modelRates: {
      input: environment.browserModelInputRate,
      output: environment.browserModelOutputRate,
    },
  };
  if (body.conversationId !== undefined) {
    input = { ...input, conversationId: body.conversationId };
  }
  return { input, priceUsdMicros: price, quote };
};

const createQuote = async (
  context: Context,
  body: BrowseInput,
  key: string
): Promise<Task | Response> => {
  const { deps, caller, now } = context;
  const { store } = deps.services;
  const id = TaskId.generate();
  const priced = priceQuote(context, body, id, key);
  if (priced instanceof Response) {
    return priced;
  }
  const task: Task = {
    id,
    agentTokenId: caller.agentTokenId,
    connectionId: caller.grantId ?? caller.agentTokenId,
    createdAt: now,
    updatedAt: now,
    idempotencyKey: key,
    input: priced.input,
    kind: "browse",
    priceUsdMicros: priced.priceUsdMicros,
    status: "quoted",
    error: null,
    result: null,
    saleId: null,
    runId: null,
  };
  try {
    await store.tasks.create(caller.userId, task);
    return task;
  } catch (error) {
    const winner = await store.tasks.byIdempotencyKey(caller.userId, key);
    if (winner === null) {
      throw error;
    }
    return winner;
  }
};

/**
 * Price an unpaid quote again, in place.
 *
 * The card's request key is fixed per offer, so without this the first budget
 * chosen — or the first five minutes — would be the only one that card could
 * ever pay. A quote nobody has paid is a draft: same task, same key, new
 * price and expiry. A quote with a signed header on file is not a draft; its
 * spend is keyed to this task, and it keeps its price until it expires.
 */
const requote = async (
  context: Context,
  task: Task,
  body: BrowseInput,
  key: string
): Promise<Task | Response> => {
  const { deps, caller, now } = context;
  const { store } = deps.services;
  if (hasSignedPayment(task)) {
    const { quote } = storedBrowseQuote(task);
    return json(
      {
        error: `A payment for the $${quote.budgetUsd} quote is already signed. Pay that quote, or wait for it to expire.`,
      },
      409
    );
  }
  const priced = priceQuote(context, body, task.id, key);
  if (priced instanceof Response) {
    return priced;
  }
  const patch = {
    input: priced.input,
    priceUsdMicros: priced.priceUsdMicros,
    updatedAt: now,
  };
  const claimed = await store.tasks.claim(
    caller.userId,
    task.id,
    "quoted",
    patch
  );
  if (!claimed) {
    // Somebody paid it between the read and the write. Whatever it is now
    // is what the rest of the handler should see.
    const current = await store.tasks.byId(caller.userId, task.id);
    return current ?? task;
  }
  return { ...task, ...patch };
};

const performSettlement = async (
  context: Context,
  task: Task,
  challenge: Challenge,
  payment: string
): Promise<Response> => {
  const { deps, caller, workspace, now, view, execute } = context;
  const { services } = deps;
  const { store } = services;
  const [requirement] = challenge.accepts;
  if (!requirement) {
    return json({ error: "The quote has no payment requirements." }, 500);
  }
  const hash = new Bun.CryptoHasher("sha256").update(payment).digest("hex");
  const approved = Schema.decodeUnknownResult(
    Schema.Struct({ paymentProofHash: Schema.String })
  )(task.result);
  if (
    approved._tag === "Success" &&
    approved.success.paymentProofHash !== hash
  ) {
    return json(
      {
        error:
          "This quote already has a different signed payment. Do not sign again.",
      },
      409
    );
  }
  if (await store.sales.byPaymentHash(hash)) {
    return json({ error: "That proof already paid for a task." }, 409);
  }
  const activeTasks = await store.tasks.activeBrowses();
  const active = activeTasks.find(
    (row) => row.userId === caller.userId && row.task.id !== task.id
  );
  if (active !== undefined) {
    return json(
      { error: "Another browser task is active. Nothing else was charged." },
      409
    );
  }
  if (!hostedTask(task) && deps.runs.get(workspace.session.id) !== null) {
    return json(
      {
        error:
          "Finish or stop the current run before purchasing another browser task.",
      },
      409
    );
  }
  const claimed = await store.tasks.claim(caller.userId, task.id, "quoted", {
    status: "uncertain",
    error: "Payment is being confirmed. Do not purchase again.",
    updatedAt: now,
  });
  if (!claimed) {
    const current = await store.tasks.byId(caller.userId, task.id);
    return json({ task: current === null ? null : view(current) }, 202);
  }
  try {
    const settlement = await services.oracle.settle(payment, requirement);
    if (!settlement.ok) {
      return json(
        {
          error:
            settlement.error ??
            "Payment was not confirmed; inspect this task before retrying.",
          task: { ...view(task), status: "uncertain" },
        },
        402
      );
    }
    const sale = await store.sales.record({
      id: SaleId.generate(),
      amount: requirement.amount,
      asset: requirement.asset,
      network: requirement.network,
      payer: describePayment(payment).payer,
      paymentHash: hash,
      resource: `${deps.tasksUrl}?quote=${task.id}`,
      at: now,
      deliveredAt: null,
      error: null,
      result: null,
      status: "settled",
      stubbed: settlement.stubbed,
      transactionId: settlement.transactionId,
    });
    if (!sale.created) {
      return json(
        {
          error:
            "This payment was already recorded. Reconcile this task before retrying.",
        },
        409
      );
    }
    const paid: Task = {
      ...task,
      status: "paid",
      saleId: sale.sale.id,
      error: null,
      updatedAt: now,
    };
    await store.tasks.update(caller.userId, task.id, {
      status: "paid",
      saleId: sale.sale.id,
      error: null,
      updatedAt: now,
    });
    deps.workspaces.touch(workspace.userId);
    execute(paid);
    return json({ task: view(paid) }, 202);
  } catch {
    return json(
      {
        error:
          "Payment outcome is uncertain. Retrieve this task; do not purchase again.",
        taskId: task.id,
      },
      502
    );
  }
};

// One server owns the browser driver; serialize the external settlement window too.
const settlingOwners = new Map<UserId, TaskId>();
const settleQuote = async (
  context: Context,
  task: Task,
  challenge: Challenge,
  payment: string
): Promise<Response> => {
  const { userId } = context.caller;
  const settling = settlingOwners.get(userId);
  if (settling !== undefined) {
    if (settling !== task.id) {
      return json(
        {
          error:
            "Another browser task payment is being confirmed. Wait for its result.",
        },
        409
      );
    }
    const current = await context.deps.services.store.tasks.byId(
      userId,
      task.id
    );
    return json({ task: current === null ? null : context.view(current) }, 202);
  }
  settlingOwners.set(userId, task.id);
  try {
    return await performSettlement(context, task, challenge, payment);
  } finally {
    settlingOwners.delete(userId);
  }
};

/**
 * The task this request key names, minted if it is new and re-priced if it is
 * a stale draft. Anything that is not a payable quote is answered here.
 */
const quotedTaskFor = async (
  context: Context,
  body: BrowseInput,
  key: string,
  payment: string | null
): Promise<Task | Response> => {
  const { deps, caller, now, view } = context;
  const { store } = deps.services;
  let task = await store.tasks.byIdempotencyKey(caller.userId, key);
  if (task === null) {
    if (payment !== null || body.quoteTaskId !== undefined) {
      return json({ error: "Request a quote before paying." }, 409);
    }
    const created = await createQuote(context, body, key);
    if (created instanceof Response) {
      return created;
    }
    task = created;
  }
  if (
    task.kind !== "browse" ||
    !("quote" in task.input) ||
    task.input["instruction"] !== body.instruction
  ) {
    return json(
      { error: "That request key belongs to a different task." },
      409
    );
  }
  if (task.status !== "quoted") {
    return json({ task: view(task) }, task.status === "done" ? 200 : 202);
  }
  const saved = storedBrowseQuote(task);
  // Asking again, with nothing signed: another budget or a fresh expiry gets a
  // fresh quote rather than the first one this card ever saw. A payment
  // request never re-prices; it is checked against the quote it names.
  if (
    payment === null &&
    body.quoteTaskId === undefined &&
    (saved.quote.budgetUsd !== body.budgetUsd || saved.quote.expiresAt <= now)
  ) {
    const repriced = await requote(context, task, body, key);
    if (repriced instanceof Response) {
      return repriced;
    }
    if (repriced.status !== "quoted") {
      return json(
        { task: view(repriced) },
        repriced.status === "done" ? 200 : 202
      );
    }
    return repriced;
  }
  return task;
};

const performBrowseQuote = async (
  deps: TaskDeps,
  request: Request,
  workspace: Context["workspace"],
  caller: TaskCaller,
  body: BrowseInput,
  execute: Context["execute"],
  view: Context["view"]
): Promise<Response> => {
  const now = (deps.now ?? Date.now)();
  const context: Context = { deps, caller, workspace, execute, view, now };
  const key = request.headers.get("idempotency-key") ?? body.idempotencyKey;
  const payment = paymentFrom(request.headers);
  const activeTasks = await deps.services.store.tasks.activeBrowses();
  const active = activeTasks.find(
    (row) => row.userId === caller.userId && row.task.idempotencyKey !== key
  );
  if (active !== undefined && payment === null) {
    const connection = caller.grantId ?? caller.agentTokenId;
    return connection === null || active.task.connectionId === connection
      ? json({ task: view(active.task) })
      : json(
          {
            error: "Another browser task is active. Nothing else was charged.",
          },
          409
        );
  }
  if (body.conversationId !== undefined) {
    const conversation = await deps.services.store.history.get(
      caller.userId,
      body.conversationId
    );
    if (conversation === null || conversation.kind !== "conversation") {
      return json({ error: "Conversation not found." }, 404);
    }
  }
  const task = await quotedTaskFor(context, body, key, payment);
  if (task instanceof Response) {
    return task;
  }
  const saved = storedBrowseQuote(task);
  const decoded = decodePaymentChallenge(saved.challenge);
  if (decoded._tag === "Failure") {
    return json(
      { error: "The saved quote cannot be read. Nothing was charged." },
      500
    );
  }
  const [frozen] = decoded.success.accepts;
  if (!frozen) {
    return json({ error: "The quote has no payment requirements." }, 500);
  }
  const challenge = deps.services.oracle.challenge({
    description: description(saved.quote.executionMs),
    units: frozen.amount,
    url: `${deps.tasksUrl}?quote=${task.id}`,
  });
  const normalized = decodePaymentChallenge(challenge);
  if (
    normalized._tag === "Failure" ||
    JSON.stringify(normalized.success) !== JSON.stringify(decoded.success)
  ) {
    return json(
      { error: "Payment configuration changed. Request a new quote." },
      409
    );
  }
  if (saved.quote.expiresAt <= now) {
    return json(
      {
        error:
          "This quote expired. Request a new task quote; nothing was charged.",
      },
      410
    );
  }
  if (payment === null) {
    return Response.json(
      { ...challenge, v: 1, quote: saved.quote },
      {
        status: 402,
        headers: {
          "cache-control": "no-store",
          "payment-required": encodeChallengeHeader(challenge),
        },
      }
    );
  }
  if (
    body.quoteTaskId !== task.id ||
    body.budgetUsd !== saved.quote.budgetUsd
  ) {
    return json(
      { error: "Payment must name the exact quoted task and budget." },
      409
    );
  }
  return await settleQuote(context, task, challenge, payment);
};

export const handleBrowseQuote = async (
  ...args: Parameters<typeof performBrowseQuote>
): Promise<Response> =>
  await serializeBrowsePayment(
    args[3].userId,
    async () => await performBrowseQuote(...args)
  );
