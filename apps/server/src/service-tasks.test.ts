import { beforeAll, describe, expect, it } from "bun:test";

import type { TaskId } from "@froggy/domain";
import {
  creditUnits,
  AgentTokenId,
  OAuthGrantId,
  OAuthClientId,
  RunId,
  MonitorCheckId,
  SessionId,
  userId,
} from "@froggy/domain";
import { ServiceTicket } from "@froggy/protocol";
import { Effect, Schema } from "effect";

import { trackAgentInvocation } from "./agent-invocations";
import { fundTestCredits } from "./credit-fixture";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { handleMcp } from "./mcp";
import { createQuotes } from "./quotes";
import { handleServices } from "./service-routes";
import {
  awaitServiceTask,
  purchaseService,
  recoverOrphanedServiceTasks,
  SERVICE_WAIT_MAX_MS,
  serviceTicket,
} from "./service-tasks";
import { createServices } from "./services";
import { WorkspaceSession } from "./session";

let environment: Environment;
beforeAll(async () => {
  Object.assign(process.env, {
    DATABASE_URL: "",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
    SERVICE_SUPPLIER_PAYEES: "",
    X_API_BEARER_TOKEN: "",
  });
  environment = await Effect.runPromise(loadEnvironment());
});
const fixture = async (credit = 2_000_000) => {
  const services = createServices({
    environment: {
      ...environment,
      modes: { ...environment.modes, model: "stub" },
    },
  });
  const person = userId(`did:privy:service-${crypto.randomUUID()}`);
  const { quote } = createQuotes(services.rates);
  const session = new WorkspaceSession(
    SessionId.generate(),
    person,
    {
      ledger: services.ledger,
      modes: environment.modes,
      onPolicyDecision: () => {},
      onReceipt: () => {},
      balances: {
        hbar: async () => await Promise.resolve(null),
        usdc: async () => await Promise.resolve(null),
      },
      networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
      pocket: {
        networks: ["hedera:testnet"],
        startingUsdMicrosFor: () => credit,
      },
      quote,
      store: services.store,
    },
    {
      hosts: [new URL(environment.appOrigin).host],
      payeeIds: [services.oracle.payTo],
    }
  );
  await session.hydrate();
  await fundTestCredits(services.store, person, credit);
  return { services, session, agentTokenId: null };
};
const request = () => ({
  v: 2 as const,
  service: "web_search" as const,
  prompt: "affordable train travel",
  idempotencyKey: crypto.randomUUID(),
});
const done = async (
  context: Awaited<ReturnType<typeof fixture>>,
  id: TaskId,
  attempts = 100
): Promise<ServiceTicket> => {
  const task = await context.services.store.tasks.byId(
    context.session.userId,
    id
  );
  if (!task) {
    throw new Error("Task disappeared.");
  }
  if (["done", "failed", "uncertain"].includes(task.status) || attempts === 0) {
    return serviceTicket(task);
  }
  await Bun.sleep(10);
  return await done(context, id, attempts - 1);
};

const rpc = (
  body: {
    jsonrpc: string;
    id?: number;
    method: string;
    params?: {
      name: string;
      arguments?: ReturnType<typeof request> | { id: string };
    };
  },
  origin?: string
) =>
  new Request("https://froggy.example/api/mcp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: origin === undefined ? {} : { origin },
  });

const rejectsWith = async <T>(
  promise: Promise<T>,
  message: string
): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(
      message
    );
    return;
  }
  throw new Error(`Expected rejection containing ${message}`);
};

describe("service purchases", () => {
  it("reserves scheduled service budgets before detached purchases settle", async () => {
    const context = await fixture();
    const runId = RunId.generate();
    const tickets = await Promise.all(
      ["one", "two", "three"].map(
        async (key) =>
          await purchaseService(
            // Affords exactly one X search at $0.06; the other two must be refused.
            { ...context, runId, interactive: false, budgetUsdMicros: 90_000 },
            { ...request(), service: "x_search", idempotencyKey: key }
          )
      )
    );
    const results = await Promise.all(
      tickets.map(async (ticket) => await done(context, ticket.id))
    );
    expect(results.filter((ticket) => ticket.status === "done")).toHaveLength(
      1
    );
    expect(results.filter((ticket) => ticket.status === "failed")).toHaveLength(
      2
    );
    const paid = context.session.history.filter(
      (receipt) => receipt.settlement !== undefined
    );
    expect(
      paid.reduce((total, receipt) => total + receipt.intent.usdMicros, 0)
    ).toBeLessThanOrEqual(250_000);
  });

  it("claims concurrent retries before payment, returns one result and one receipt", async () => {
    const context = await fixture();
    const input = request();
    const tickets = await Promise.all([
      purchaseService(context, input),
      purchaseService(context, input),
      purchaseService(context, input),
    ]);
    expect(new Set(tickets.map((ticket) => ticket.id)).size).toBe(1);
    const [ticket] = tickets;
    const result = await done(context, ticket.id);
    expect(result.status).toBe("done");
    expect(result.stubbed).toBe(true);
    expect(result.text).toContain("DEMO");
    expect(result.saleId).toBeNull();
    expect(result.chargeId).toBeDefined();
    expect(result.chargeStatus).toBe("captured");
    expect(context.session.history).toHaveLength(0);
    const checkedResult11 = await context.services.store.credits.findCharge(
      context.session.userId,
      ticket.id
    );
    expect(checkedResult11?.stubbed).toBe(true);
    const replayed = await purchaseService(context, input);
    expect(replayed.id).toBe(ticket.id);
    await rejectsWith(
      purchaseService(context, { ...input, prompt: "different purchase" }),
      "different request"
    );
    expect(context.session.history).toHaveLength(0);
  });
  it("refuses empty, oversize and unavailable work before charging", async () => {
    const context = await fixture();
    await rejectsWith(
      purchaseService(context, { ...request(), prompt: " " }),
      "empty"
    );
    await rejectsWith(
      purchaseService(context, { ...request(), prompt: "x".repeat(1001) }),
      "too long"
    );
    const live = {
      ...context.services,
      environment: {
        ...environment,
        modes: {
          ...environment.modes,
          hedera: "live" as const,
          privy: "live" as const,
        },
      },
    };
    await rejectsWith(
      purchaseService({ ...context, services: live }, request()),
      "must be configured"
    );
    expect(context.session.history).toHaveLength(0);
  });
  it("records a policy refusal without buying a provider result", async () => {
    const context = await fixture(0);
    const ticket = await purchaseService(context, request());
    const result = await done(context, ticket.id);
    expect(result.status).toBe("failed");
    expect(result.text).toBe("");
    expect(result.saleId).toBeNull();
    expect(result.chargeStatus).toBe("refused");
  });
  it("runs from funded credits with no HBAR rate, signing, or customer settlement", async () => {
    const context = await fixture(100_000);
    let payments = 0;
    const services = {
      ...context.services,
      rates: { ...context.services.rates, current: () => null },
      hederaPayerFor: async () => {
        payments += 1;
        return await Promise.reject(new Error("No customer payment expected"));
      },
      oracle: {
        ...context.services.oracle,
        settle: async () => {
          payments += 1;
          return await Promise.reject(new Error("No settlement expected"));
        },
      },
    };
    const ticket = await purchaseService({ ...context, services }, request());
    const result = await done(context, ticket.id);
    expect(result.status).toBe("done");
    expect(result.chargeStatus).toBe("captured");
    expect(result.saleId).toBeNull();
    expect(payments).toBe(0);
    const checkedResult10 = await services.store.credits.summary(
      context.session.userId
    );
    expect(checkedResult10.availableUnits).toBe(creditUnits(90_000));
    expect(context.session.history).toHaveLength(0);
  });
  it("holds a delivered result on a failed credit commit and recovers without rerunning", async () => {
    const context = await fixture();
    const original = context.services.store.credits;
    let captureAttempts = 0;
    const services = {
      ...context.services,
      store: {
        ...context.services.store,
        credits: {
          ...original,
          finishTask: async (
            ...args: Parameters<typeof original.finishTask>
          ) => {
            if (args[3] === "capture") {
              captureAttempts += 1;
              if (captureAttempts === 1) {
                throw new Error("Database connection lost");
              }
            }
            return await original.finishTask(...args);
          },
        },
      },
    };
    const ticket = await purchaseService({ ...context, services }, request());
    const held = await done(context, ticket.id);
    expect(held.status).toBe("uncertain");
    expect(held.chargeStatus).toBe("uncertain");
    expect(held.text).toContain("DEMO");
    await recoverOrphanedServiceTasks(services);
    const recovered = await done(context, ticket.id);
    expect(recovered.status).toBe("done");
    expect(recovered.chargeStatus).toBe("captured");
    expect(captureAttempts).toBe(2);
  });
  it("monitor service execution needs automation and services scopes without wallet pay", async () => {
    const context = await fixture();
    const connectionId = OAuthGrantId.generate();
    await context.services.store.oauth.grants.create(context.session.userId, {
      id: connectionId,
      clientId: OAuthClientId.generate(),
      clientName: "Monitor",
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null,
      scopes: ["automation", "services"],
    });
    const ticket = await purchaseService(
      { ...context, connectionId, monitorCheckId: MonitorCheckId.generate() },
      request()
    );
    const result = await done(context, ticket.id);
    expect(result.status).toBe("done");
    expect(result.chargeStatus).toBe("reserved");
    expect(context.session.history).toHaveLength(0);
    expect(result.saleId).toBeNull();
  });
  it("marks a stale persisted task uncertain without purchasing it again", async () => {
    const context = await fixture();
    const input = request();
    const ticket = await purchaseService(context, input);
    await done(context, ticket.id);
    await context.services.store.tasks.update(
      context.session.userId,
      ticket.id,
      { status: "running", updatedAt: Date.now() - 16 * 60 * 1000 }
    );
    const replayed = await purchaseService(context, input);
    expect(replayed.status).toBe("uncertain");
    expect(replayed.error).toContain("15 minutes");
    expect(context.session.history).toHaveLength(0);
  });
  it("holds a status read until the task settles, and answers with the phase at the deadline", async () => {
    const context = await fixture();
    const ticket = await purchaseService(context, request());
    const settled = await awaitServiceTask(
      context.services,
      context.session.userId,
      ticket.id,
      SERVICE_WAIT_MAX_MS
    );
    expect(settled?.status).toBe("done");

    // A task frozen mid-payment is polled once a second, not hammered, and
    // the read returns as soon as the store shows progress.
    await context.services.store.tasks.update(
      context.session.userId,
      ticket.id,
      { status: "running", updatedAt: Date.now() }
    );
    const slept: number[] = [];
    const pending = await awaitServiceTask(
      context.services,
      context.session.userId,
      ticket.id,
      SERVICE_WAIT_MAX_MS,
      async (ms) => {
        slept.push(ms);
        if (slept.length === 3) {
          await context.services.store.tasks.update(
            context.session.userId,
            ticket.id,
            { status: "paid", updatedAt: Date.now() }
          );
        }
        if (slept.length === 4) {
          await context.services.store.tasks.update(
            context.session.userId,
            ticket.id,
            { status: "done", updatedAt: Date.now() }
          );
        }
      }
    );
    expect(pending?.status).toBe("done");
    expect(slept).toEqual([1000, 1000, 1000, 1000]);

    // With no wait, an in-flight task is reported as the phase it is in.
    await context.services.store.tasks.update(
      context.session.userId,
      ticket.id,
      { status: "paid", updatedAt: Date.now() }
    );
    const immediate = await awaitServiceTask(
      context.services,
      context.session.userId,
      ticket.id,
      0,
      async () => {
        await Promise.reject(new Error("must not sleep"));
      }
    );
    expect(immediate?.status).toBe("paid");

    // Never a way to see someone else's task.
    expect(
      await awaitServiceTask(
        context.services,
        userId(`did:privy:other-${crypto.randomUUID()}`),
        ticket.id,
        0
      )
    ).toBeNull();
  });

  it("marks tasks orphaned by a restart uncertain in the store, and leaves fresh ones alone", async () => {
    const context = await fixture();
    const stale = await purchaseService(context, request());
    const fresh = await purchaseService(context, request());
    await done(context, stale.id);
    await done(context, fresh.id);
    const { userId: owner } = context.session;
    await context.services.store.tasks.update(owner, stale.id, {
      status: "paid",
      updatedAt: Date.now() - 16 * 60 * 1000,
    });
    await context.services.store.tasks.update(owner, fresh.id, {
      status: "running",
      updatedAt: Date.now(),
    });

    expect(await recoverOrphanedServiceTasks(context.services)).toBe(1);
    const recovered = await context.services.store.tasks.byId(owner, stale.id);
    expect(recovered?.status).toBe("uncertain");
    expect(recovered?.error).toContain("15 minutes");
    const untouched = await context.services.store.tasks.byId(owner, fresh.id);
    expect(untouched?.status).toBe("running");
    // Idempotent: a second boot finds nothing more to mark.
    expect(await recoverOrphanedServiceTasks(context.services)).toBe(0);
  });

  it("keeps task results private to their owner", async () => {
    const context = await fixture();
    const ticket = await purchaseService(context, request());
    await done(context, ticket.id);
    const other = userId("did:privy:someone-else");
    const response = await handleServices(
      context.services,
      context.session,
      { userId: other, agentTokenId: null, grantId: null, scopes: null },
      new Request(`https://froggy.example/api/services/tasks/${ticket.id}`)
    );
    expect(response.status).toBe(404);
  });
  it("keeps service tasks private to the connection that created them", async () => {
    const context = await fixture();
    const owner = {
      userId: context.session.userId,
      agentTokenId: null,
      grantId: null,
      scopes: null,
    };
    const grantA = OAuthGrantId.generate();
    const grantB = OAuthGrantId.generate();
    await Promise.all(
      [grantA, grantB].map(async (id) => {
        await context.services.store.oauth.grants.create(
          context.session.userId,
          {
            id,
            clientId: OAuthClientId.generate(),
            clientName: "Credit service test",
            createdAt: Date.now(),
            lastUsedAt: null,
            revokedAt: null,
            scopes: ["services"],
          }
        );
      })
    );
    const ticket = await purchaseService(
      { ...context, connectionId: grantA },
      request()
    );
    await done(context, ticket.id);
    const callerA = { ...owner, grantId: grantA };
    const callerB = { ...owner, grantId: grantB };
    const url = `https://froggy.example/api/services/tasks/${ticket.id}`;
    const asB = await handleServices(
      context.services,
      context.session,
      callerB,
      new Request(url)
    );
    const asA = await handleServices(
      context.services,
      context.session,
      callerA,
      new Request(url)
    );
    const asOwner = await handleServices(
      context.services,
      context.session,
      owner,
      new Request(url)
    );
    expect(asB.status).toBe(404);
    expect(asA.status).toBe(200);
    expect(asOwner.status).toBe(200);
    const listedResponse = await handleServices(
      context.services,
      context.session,
      callerB,
      new Request("https://froggy.example/api/services/tasks")
    );
    const listed = Schema.decodeUnknownSync(
      Schema.Struct({ tasks: Schema.Array(ServiceTicket) })
    )(await listedResponse.json());
    expect(listed.tasks).toEqual([]);
    const status = await handleMcp(
      context.services,
      context.session,
      callerB,
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "froggy_service_status", arguments: { id: ticket.id } },
      })
    );
    expect(await status.text()).toContain("No such service task");
    const own = await handleMcp(
      context.services,
      context.session,
      callerA,
      rpc({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "froggy_service_status", arguments: { id: ticket.id } },
      })
    );
    expect(await own.text()).toContain(ticket.id);
  });
  it("serves media only to its owner and leaves bytes out of task tickets", async () => {
    const context = await fixture();
    const ticket = await purchaseService(context, request());
    await done(context, ticket.id);
    await context.services.store.tasks.update(
      context.session.userId,
      ticket.id,
      {
        updatedAt: Date.now(),
        result: {
          v: 1,
          service: "web_search",
          stubbed: true,
          text: "Fixture attachment",
          sources: [],
          upstreamTransactionId: null,
          artifact: { mime: "image/png", base64: "iVBORw0KGgo=" },
        },
      }
    );
    const url = `https://froggy.example/api/services/tasks/${ticket.id}/artifact`;
    const own = await handleServices(
      context.services,
      context.session,
      {
        userId: context.session.userId,
        agentTokenId: null,
        grantId: null,
        scopes: null,
      },
      new Request(url)
    );
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("image/png");
    expect(own.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = await own.arrayBuffer();
    expect(bytes.byteLength).toBe(8);
    const other = await handleServices(
      context.services,
      context.session,
      {
        userId: userId("did:privy:other-artifact-owner"),
        agentTokenId: null,
        grantId: null,
        scopes: null,
      },
      new Request(url)
    );
    expect(other.status).toBe(404);
    const listed = await handleServices(
      context.services,
      context.session,
      {
        userId: context.session.userId,
        agentTokenId: null,
        grantId: null,
        scopes: null,
      },
      new Request("https://froggy.example/api/services/tasks")
    );
    expect(await listed.text()).not.toContain("iVBORw0KGgo");
  });
  it("records a scope-refused MCP call under the OAuth grant without buying", async () => {
    const context = await fixture();
    const grantId = OAuthGrantId.generate();
    const caller = {
      userId: context.session.userId,
      agentTokenId: null,
      grantId,
      scopes: new Set(["brief"] as const),
    };
    const response = await handleMcp(
      context.services,
      context.session,
      caller,
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "froggy_services" },
      })
    );
    expect(await response.text()).toContain("scope");
    const rows = await context.services.store.invocations.list(
      caller.userId,
      grantId
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe("insufficient_scope");
    expect(rows[0]?.usdMicros).toBeNull();
    expect(context.session.history).toHaveLength(0);
  });

  it("a history completion failure keeps the successful result and the durable started row", async () => {
    const context = await fixture();
    const agentTokenId = AgentTokenId.generate();
    const caller = {
      userId: context.session.userId,
      agentTokenId,
      grantId: null,
      scopes: null,
    };
    const services = {
      ...context.services,
      store: {
        ...context.services.store,
        invocations: {
          ...context.services.store.invocations,
          finish: async () => {
            await Promise.reject(new Error("database unavailable"));
          },
        },
      },
    };
    const result = await trackAgentInvocation(
      services,
      caller,
      "mcp",
      "froggy_services",
      async (summary) => {
        const rows = await context.services.store.invocations.list(
          caller.userId,
          agentTokenId
        );
        expect(rows[0]?.outcome).toBe("started");
        summary.outcome = "ok";
        return "successful result";
      }
    );
    expect(result).toBe("successful result");
    const rows = await context.services.store.invocations.list(
      caller.userId,
      agentTokenId
    );
    expect(rows[0]?.outcome).toBe("started");
  });

  it("MCP lists tools, rejects hostile origins and ignores notification purchases", async () => {
    const context = await fixture();
    const caller = {
      userId: context.session.userId,
      agentTokenId: null,
      grantId: null,
      scopes: null,
    };
    const list = await handleMcp(
      context.services,
      context.session,
      caller,
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    );
    expect(await list.text()).toContain("froggy_service_run");
    const blocked = await handleMcp(
      context.services,
      context.session,
      caller,
      rpc(
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        "https://evil.example"
      )
    );
    expect(blocked.status).toBe(403);
    const notification = await handleMcp(
      context.services,
      context.session,
      caller,
      rpc({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "froggy_service_run", arguments: request() },
      })
    );
    expect(notification.status).toBe(202);
    expect(
      await context.services.store.tasks.list(caller.userId, 10)
    ).toHaveLength(0);
    const purchased = await handleMcp(
      context.services,
      context.session,
      caller,
      rpc({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "froggy_service_run", arguments: request() },
      })
    );
    const envelope = Schema.decodeUnknownSync(
      Schema.Struct({
        result: Schema.Struct({
          content: Schema.Array(Schema.Struct({ text: Schema.String })),
        }),
      })
    )(await purchased.json());
    const ticket = Schema.decodeUnknownSync(ServiceTicket)(
      JSON.parse(envelope.result.content[0]?.text ?? "null")
    );
    const completed = await done(context, ticket.id);
    expect(completed.status).toBe("done");
  });
});
