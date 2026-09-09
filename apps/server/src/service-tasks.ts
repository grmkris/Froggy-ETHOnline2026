/** One paid service path for the web, chat and external agents. */
import { RunId, SaleId, TaskId } from "@froggy/domain";
import type {
  AgentTokenId,
  AgentConnectionId,
  Amount,
  Receipt,
  RunId as RunIdValue,
  Task,
} from "@froggy/domain";
import { describePayment } from "@froggy/payments";
import { ServiceRequest, ServiceResult } from "@froggy/protocol";
import type { ServiceTicket } from "@froggy/protocol";
import { Schema } from "effect";

import { detached } from "./detached";
import { runServiceProvider, serviceCatalog } from "./service-providers";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";
import { assetFor } from "./tools-assets";
import { preflightTrading, serviceRequestText } from "./trading/services";

export const serviceTicket = (task: Task): ServiceTicket => {
  const request = Schema.decodeUnknownSync(ServiceRequest)(task.input);
  const decoded = Schema.decodeUnknownResult(ServiceResult)(task.result);
  const result = decoded._tag === "Success" ? decoded.success : null;
  const stale =
    ["quoted", "paid", "running", "awaiting_approval"].includes(task.status) &&
    Date.now() - task.updatedAt > 15 * 60 * 1000;
  const ticket: ServiceTicket = {
    v: 1,
    id: task.id,
    runId: task.runId,
    saleId: task.saleId,
    upstreamTransactionId: result?.upstreamTransactionId ?? null,
    service: request.service,
    prompt: serviceRequestText(request),
    status: stale ? "uncertain" : task.status,
    priceUsdMicros: task.priceUsdMicros,
    error: stale
      ? "No progress was recorded for 15 minutes. Check the payment before retrying; this request will not be purchased again automatically."
      : task.error,
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

interface PurchaseContext {
  readonly budgetUsdMicros?: number | undefined;
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

interface PaymentProof {
  hash: string;
  payer: string | null;
}
const recordSaleAudit = (
  services: Services,
  receipt: Receipt,
  amount: Amount,
  taskId: TaskId
): void => {
  const transactionId = receipt.settlement?.transactionId;
  if (transactionId === undefined) {
    return;
  }
  detached("service sale audit", async () => {
    await services.hcs.record({
      amount: amount.units,
      asset: amount.asset.id,
      at: Date.now(),
      kind: "sold",
      network: amount.asset.network,
      ref: taskId,
      transactionId,
    });
  });
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
    if (task.kind !== "service" || !sameRequest(task, request)) {
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
  const rate = services.rates.current(Date.now());
  if (!rate || rate.usdMicrosPerHbar <= 0) {
    throw new Error("No usable HBAR rate. Nothing was charged.");
  }
  const units = String(
    Math.ceil((card.priceUsdMicros * 100_000_000) / rate.usdMicrosPerHbar)
  );
  const runId = context.runId ?? RunId.generate();
  const task: Task = {
    id: TaskId.generate(),
    agentTokenId: context.agentTokenId,
    idempotencyKey: request.idempotencyKey,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    error: null,
    input: { ...request, demo: card.status === "demo" },
    kind: "service",
    priceUsdMicros: card.priceUsdMicros,
    result: null,
    runId,
    saleId: null,
    status: "quoted",
  };
  // The database's unique (user, key) claim wins BEFORE signing or charging.
  try {
    await store.tasks.create(session.userId, task);
  } catch (error) {
    const winner = await store.tasks.byIdempotencyKey(
      session.userId,
      request.idempotencyKey
    );
    if (winner) {
      return replay(winner);
    }
    throw error;
  }
  context.onCreated?.(task.id);
  detached(`service ${task.id}`, async () => {
    let sent = false;
    let settled = false;
    let saleId: SaleId | null = null;
    const proof: PaymentProof = {
      hash: "",
      payer: null,
    };
    try {
      const resource = `${services.environment.appOrigin}/api/services/tasks/${task.id}`;
      const challenge = services.oracle.challenge({
        description: card.title,
        units,
        url: resource,
      });
      const [requirement] = challenge.accepts;
      const amount = requirement ? assetFor(requirement) : null;
      if (!requirement || !amount) {
        throw new Error("No supported payment offer.");
      }
      await store.tasks.update(session.userId, task.id, {
        status: "running",
        updatedAt: Date.now(),
      });
      // Opening an account funds its whole credit, including the amount about to be reserved.
      const openingUsdMicros = session.pocket ?? 0;
      const outcome = await session.spend({
        amount,
        host: new URL(resource).host,
        idempotencyKey: `service:${task.id}`,
        budgetUsdMicros: context.budgetUsdMicros,
        interactive: context.interactive ?? true,
        payeeId: services.oracle.payTo,
        payeeLabel: `Froggy: ${card.title}`,
        provenance: "server",
        purpose: card.title,
        runId,
        settle: async () => {
          const payer = await services.hederaPayerFor({
            userId: session.userId,
            openingUsdMicros,
          });
          const signed = await payer.pay(challenge);
          if (signed.header === null) {
            return {
              ok: false,
              sent: false,
              network: requirement.network,
              stubbed: signed.stubbed || card.status === "demo",
              transactionId: null,
              error: signed.error ?? "Wallet did not sign.",
            };
          }
          proof.hash = new Bun.CryptoHasher("sha256")
            .update(signed.header)
            .digest("hex");
          proof.payer = describePayment(signed.header).payer;
          sent = true;
          try {
            const payment = await services.oracle.settle(
              signed.header,
              requirement
            );
            settled = payment.ok;
            return {
              ...payment,
              stubbed: payment.stubbed || card.status === "demo",
              network: requirement.network,
              sent: true,
            };
          } catch (error) {
            return {
              ok: false,
              sent: true,
              network: requirement.network,
              stubbed: signed.stubbed || card.status === "demo",
              transactionId: null,
              error: errorText(
                error instanceof Error ? error : new Error("Service failed.")
              ),
            };
          }
        },
      });
      if (
        outcome.decision._tag !== "allow" ||
        outcome.receipt.failure !== undefined ||
        !settled
      ) {
        throw new Error(
          outcome.receipt.failure ??
            (outcome.decision._tag === "deny"
              ? outcome.decision.message
              : "Payment was not confirmed.")
        );
      }
      // The spending receipt is durable before secondary sale bookkeeping.
      saleId = SaleId.generate();
      await store.sales.record({
        id: saleId,
        amount: requirement.amount,
        asset: requirement.asset,
        at: Date.now(),
        deliveredAt: null,
        error: null,
        network: requirement.network,
        payer: proof.payer,
        paymentHash: proof.hash,
        resource,
        result: null,
        status: "settled",
        stubbed: outcome.receipt.stubbed,
        transactionId: outcome.receipt.settlement?.transactionId ?? null,
      });
      await store.tasks.update(session.userId, task.id, {
        saleId,
        status: "paid",
        updatedAt: Date.now(),
      });
      recordSaleAudit(services, outcome.receipt, amount, task.id);
      const result = await runServiceProvider(
        services,
        request,
        {},
        {
          owner: session.userId,
          connectionId,
          sourceTaskId: task.id,
          paymentStubbed: outcome.receipt.stubbed,
        }
      );
      await store.tasks.update(session.userId, task.id, {
        status: "done",
        result,
        updatedAt: Date.now(),
      });
      if (saleId !== null) {
        await store.sales.update(saleId, {
          status: "delivered",
          deliveredAt: Date.now(),
        });
      }
    } catch (error) {
      const message = errorText(
        error instanceof Error ? error : new Error("Service failed.")
      );
      await store.tasks.update(session.userId, task.id, {
        status: sent && !settled ? "uncertain" : "failed",
        error: `${message}${settled ? " Paid task; not refunded." : ""}`,
        updatedAt: Date.now(),
      });
      if (saleId !== null) {
        await store.sales.update(saleId, { status: "failed", error: message });
      }
    }
  });
  return { ...serviceTicket(task), stubbed: card.status === "demo" };
};
