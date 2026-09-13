/** One paid service path for the web, chat and external agents. */
import { creditUnits, RunId, TaskId } from "@froggy/domain";
import type {
  AgentTokenId,
  MonitorCheckId,
  AgentConnectionId,
  RunId as RunIdValue,
  Task,
  UserId,
} from "@froggy/domain";
import { ServiceRequest, ServiceResult } from "@froggy/protocol";
import type { ServiceTicket } from "@froggy/protocol";
import { Schema } from "effect";

import {
  CreditCommitUncertainError,
  authorizeCreditTask,
  creditBillingError,
  creditLimitsFromMandate,
  finishCreditTask,
} from "./credit-task";
import { detached } from "./detached";
import {
  ProviderExecutionUncertainError,
  StoredServiceJob,
  resumeServiceProvider,
  runServiceProvider,
  serviceCatalog,
} from "./service-providers";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import { preflightTrading, serviceRequestText } from "./trading/services";

/** After this long without a progress write, an in-flight task is reported as uncertain rather than pending. */
const SERVICE_STALE_MS = 15 * 60 * 1000;
const SERVICE_STALE_ERROR =
  "No progress was recorded for 15 minutes. Credits remain held while execution is checked; this request will not run again automatically.";

export const serviceTicket = (task: Task): ServiceTicket => {
  const request = Schema.decodeUnknownSync(ServiceRequest)({
    ...task.input,
    v: 2,
  });
  const decoded = Schema.decodeUnknownResult(ServiceResult)(task.result);
  const result = decoded._tag === "Success" ? decoded.success : null;
  const stale =
    ["quoted", "paid", "running", "awaiting_approval"].includes(task.status) &&
    Date.now() - task.updatedAt > SERVICE_STALE_MS;
  const ticket: ServiceTicket = {
    v: 1,
    id: task.id,
    runId: task.runId,
    saleId: task.saleId,
    billingError: creditBillingError(task),
    chargeId: task.chargeId,
    chargeStatus: task.chargeStatus,
    priceCreditUnits: task.priceCreditUnits,
    upstreamTransactionId: result?.upstreamTransactionId ?? null,
    service: request.service,
    prompt: serviceRequestText(request),
    status: stale ? "uncertain" : task.status,
    priceUsdMicros: task.priceUsdMicros,
    error: stale ? SERVICE_STALE_ERROR : task.error,
    text: result?.text ?? "",
    sources: result?.sources ?? [],
    stubbed: (result?.stubbed ?? false) || task.input["demo"] === true,
    artifact: result?.artifact
      ? {
          mime: result.artifact.mime,
          url: `/api/services/tasks/${task.id}/artifact`,
        }
      : null,
  };
  if (result?.data !== undefined) {
    return { ...ticket, data: result.data };
  }
  return ticket;
};

/** The longest a status read may hold its caller; chat and MCP both stay inside their own request timeouts. */
export const SERVICE_WAIT_MAX_MS = 25_000;
/** How long a purchase waits for its own task before answering with a ticket. */
export const SERVICE_RUN_WAIT_MS = 20_000;
const POLL_MS = 1000;
const IN_FLIGHT = new Set<Task["status"]>(["quoted", "running", "paid"]);

/**
 * Hold a status read until the task reaches a terminal state or `waitMs`
 * elapses, whichever is first.
 *
 * A caller that polls the instant a ticket is handed back sees `running`,
 * which for a service task means "settling the payment", and a model reading
 * that three times in a row concluded the search was stuck when it had in fact
 * failed 56 seconds in. Waiting on the server turns those polls into one
 * honest answer. This is a read: it never buys, resumes or retries anything.
 */
export const awaitServiceTask = async (
  services: Pick<Services, "store">,
  userId: UserId,
  taskId: TaskId,
  waitMs: number,
  sleep: (ms: number) => Promise<void> = Bun.sleep
): Promise<Task | null> => {
  const deadline =
    Date.now() + Math.min(Math.max(waitMs, 0), SERVICE_WAIT_MAX_MS);
  const poll = async (): Promise<Task | null> => {
    const task = await services.store.tasks.byId(userId, taskId);
    const remaining = deadline - Date.now();
    if (task === null || !IN_FLIGHT.has(task.status) || remaining <= 0) {
      return task;
    }
    await sleep(Math.min(POLL_MS, remaining));
    return await poll();
  };
  return await poll();
};

/**
 * Boot recovery. The worker that carries a service task from `running`
 * through payment to `done` lives in one process and is never resumed; a
 * deploy in the middle leaves the row in-flight forever, and the ticket's
 * read-time overlay only hides that from callers who ask. Writing the same
 * verdict into the store makes the Services list, the chat and MCP agree.
 * Nothing is retried or refunded here: a stale payment is for a human to check.
 */
export const recoverOrphanedServiceTasks = async (
  services: Services,
  now: number = Date.now()
): Promise<number> => {
  const pending = await services.store.credits.pendingTasks();
  await Promise.all(
    pending.map(async ({ userId, task }) => {
      const delivery = Schema.decodeUnknownResult(
        Schema.Struct({ creditDeliveryReady: Schema.Literal(true) })
      )(task.result);
      if (delivery._tag === "Success") {
        await finishCreditTask(
          services,
          userId,
          task,
          { status: "done", error: null, updatedAt: now },
          "capture"
        );
        return;
      }
      if (task.kind !== "service") {
        return;
      }
      const job = Schema.decodeUnknownResult(StoredServiceJob)(task.result);
      if (job._tag === "Success") {
        detached(`recover provider ${task.id}`, async () => {
          try {
            const result = await resumeServiceProvider(job.success);
            await finishCreditTask(
              services,
              userId,
              task,
              { status: "done", result, error: null, updatedAt: Date.now() },
              "capture"
            );
          } catch (error) {
            if (error instanceof CreditCommitUncertainError) {
              return;
            }
            const uncertain = error instanceof ProviderExecutionUncertainError;
            await finishCreditTask(
              services,
              userId,
              task,
              {
                status: uncertain ? "uncertain" : "failed",
                error:
                  error instanceof Error
                    ? error.message.slice(0, 1000)
                    : "The provider job could not finish.",
                updatedAt: Date.now(),
              },
              uncertain ? "uncertain" : "release"
            );
          }
        });
      } else if (task.updatedAt < now - SERVICE_STALE_MS) {
        await finishCreditTask(
          services,
          userId,
          task,
          { status: "uncertain", error: SERVICE_STALE_ERROR, updatedAt: now },
          "uncertain"
        );
      }
    })
  );
  return await services.store.tasks.expireInFlight({
    kind: "service",
    statuses: [...IN_FLIGHT],
    before: now - SERVICE_STALE_MS,
    error: SERVICE_STALE_ERROR,
    now,
  });
};

interface PurchaseContext {
  readonly budgetUsdMicros?: number | undefined;
  readonly monitorCheckId?: MonitorCheckId;
  readonly services: Services;
  readonly session: WorkspaceSession;
  readonly agentTokenId: AgentTokenId | null;
  readonly connectionId?: AgentConnectionId | null;
  readonly runId?: RunIdValue;
  readonly interactive?: boolean;
  /** Called only by the request that created the task, never an idempotent replay. */
  readonly onCreated?: (id: TaskId) => void;
}

const errorText = (error: Error): string => error.message.slice(0, 1000);
const requestEquals = Schema.toEquivalence(ServiceRequest);
const sameRequest = (task: Task, request: ServiceRequest): boolean => {
  const decoded = Schema.decodeUnknownResult(ServiceRequest)(task.input);
  return decoded._tag === "Success" && requestEquals(decoded.success, request);
};

export const purchaseService = async (
  context: PurchaseContext,
  input: ServiceRequest
): Promise<ServiceTicket> => {
  const request = Schema.decodeUnknownSync(ServiceRequest)(input);
  const { services, session } = context;
  const { store } = services;
  const connectionId = context.connectionId ?? context.agentTokenId;
  const earlier = await store.tasks.byIdempotencyKey(
    session.userId,
    request.idempotencyKey
  );
  const replay = (task: Task): ServiceTicket => {
    if (
      task.kind !== "service" ||
      task.connectionId !== connectionId ||
      !sameRequest(task, request)
    ) {
      throw new Error(
        "Idempotency key already belongs to a different request."
      );
    }
    return serviceTicket(task);
  };
  if (earlier) {
    return replay(earlier);
  }
  const card = serviceCatalog(services).find(
    (entry) => entry.name === request.service
  );
  if (
    !card ||
    ("prompt" in request &&
      (request.prompt.trim() === "" || request.prompt.length > card.maxInput))
  ) {
    throw new Error("Service input is empty or too long.");
  }
  if (card.status === "unavailable") {
    throw new Error(card.note);
  }
  if ("input" in request) {
    preflightTrading(services, request);
  }
  if (request.service === "watch_launches") {
    await services.launches.preflight(session.userId);
  }
  const runId = context.runId ?? RunId.generate();
  let storedInput: Task["input"] = { ...request, demo: card.status === "demo" };
  if (context.monitorCheckId !== undefined) {
    storedInput = { ...storedInput, monitorCheckId: context.monitorCheckId };
  }
  const task: Task = {
    id: TaskId.generate(),
    agentTokenId: context.agentTokenId,
    connectionId,
    idempotencyKey: request.idempotencyKey,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: null,
    input: storedInput,
    kind: "service",
    priceUsdMicros: card.priceUsdMicros,
    result: null,
    runId,
    saleId: null,
    status: "quoted",
  };
  await authorizeCreditTask(services, session.userId, task);
  if (
    context.budgetUsdMicros !== undefined &&
    task.priceUsdMicros > context.budgetUsdMicros
  ) {
    throw new Error(
      "This service exceeds the task's credit budget. Nothing was charged."
    );
  }
  let reserveOptions: NonNullable<
    Parameters<typeof store.credits.reserveTask>[2]
  > = {
    initialLimits: creditLimitsFromMandate(session.currentMandate),
    stubbed: card.status === "demo",
  };
  if (context.budgetUsdMicros !== undefined) {
    reserveOptions = {
      ...reserveOptions,
      runBudgetUnits: creditUnits(context.budgetUsdMicros),
    };
  }
  const reserved = await store.credits.reserveTask(
    session.userId,
    task,
    reserveOptions
  );
  if (reserved.replayed) {
    return replay(reserved.task);
  }
  context.onCreated?.(reserved.task.id);
  if (reserved.charge.status === "refused") {
    return serviceTicket(reserved.task);
  }
  detached(`service ${task.id}`, async () => {
    try {
      await authorizeCreditTask(services, session.userId, reserved.task);
      await store.tasks.update(session.userId, task.id, {
        status: "running",
        updatedAt: Date.now(),
      });
      const result = await runServiceProvider(
        services,
        request,
        {},
        {
          owner: session.userId,
          connectionId,
          sourceTaskId: task.id,
          paymentStubbed: reserved.charge.stubbed,
        }
      );
      const patch = { status: "done" as const, result, updatedAt: Date.now() };
      // A monitor captures only after its usable observation is durable.
      await (context.monitorCheckId === undefined
        ? finishCreditTask(
            services,
            session.userId,
            reserved.task,
            patch,
            "capture"
          )
        : store.tasks.update(session.userId, task.id, patch));
    } catch (error) {
      if (error instanceof CreditCommitUncertainError) {
        return;
      }
      const message = errorText(
        error instanceof Error ? error : new Error("Service failed.")
      );
      await finishCreditTask(
        services,
        session.userId,
        reserved.task,
        {
          status:
            error instanceof ProviderExecutionUncertainError
              ? "uncertain"
              : "failed",
          error: message,
          updatedAt: Date.now(),
        },
        error instanceof ProviderExecutionUncertainError
          ? "uncertain"
          : "release"
      );
    }
  });
  return serviceTicket(reserved.task);
};
