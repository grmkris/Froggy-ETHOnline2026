import { beforeAll, describe, expect, it } from "bun:test";

import type { TaskId } from "@froggy/domain";
import { SessionId, userId } from "@froggy/domain";
import { ServiceTicket } from "@froggy/protocol";
import { Effect, Schema } from "effect";

import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { handleMcp } from "./mcp";
import { createQuotes } from "./quotes";
import { handleServices } from "./service-routes";
import { purchaseService, serviceTicket } from "./service-tasks";
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
  const services = createServices({ environment });
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
  return { services, session, agentTokenId: null };
};
const request = () => ({
  v: 1 as const,
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
    params?: { name: string; arguments: ReturnType<typeof request> };
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
    expect(result.saleId).not.toBeNull();
    expect(context.session.history).toHaveLength(1);
    expect(context.session.history[0]?.stubbed).toBe(true);
    const replayed = await purchaseService(context, input);
    expect(replayed.id).toBe(ticket.id);
    await rejectsWith(
      purchaseService(context, { ...input, prompt: "different purchase" }),
      "different request"
    );
    expect(context.session.history).toHaveLength(1);
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
        modes: { ...environment.modes, hedera: "live" as const },
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
    expect(context.session.history[0]?.decision._tag).toBe("deny");
  });
  it("keeps a sent but unconfirmed payment uncertain and does not refund or retry", async () => {
    const context = await fixture();
    let settlements = 0;
    const services = {
      ...context.services,
      oracle: {
        ...context.services.oracle,
        settle: async () => {
          settlements += 1;
          await Promise.resolve();
          throw new Error("network timeout");
        },
      },
    };
    const input = request();
    const before = context.session.pocket;
    const ticket = await purchaseService({ ...context, services }, input);
    const result = await done(context, ticket.id);
    expect(result.status).toBe("uncertain");
    expect(result.error).toContain("timeout");
    expect(context.session.pocket).toBeLessThan(before ?? 0);
    await purchaseService({ ...context, services }, input);
    expect(settlements).toBe(1);
  });
  it("funds first-use accounts from the balance before the spend reservation", async () => {
    const context = await fixture(100_000);
    let opening = 0;
    const services = {
      ...context.services,
      hederaPayerFor: async (input: {
        openingUsdMicros: number;
        userId: typeof context.session.userId;
      }) => {
        opening = input.openingUsdMicros;
        return await context.services.hederaPayerFor(input);
      },
    };
    const ticket = await purchaseService({ ...context, services }, request());
    const completed = await done(context, ticket.id);
    expect(completed.status).toBe("done");
    expect(opening).toBe(100_000);
    expect(context.session.pocket).toBeLessThan(opening);
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
    expect(context.session.history).toHaveLength(1);
  });
  it("keeps task results private to their owner", async () => {
    const context = await fixture();
    const ticket = await purchaseService(context, request());
    await done(context, ticket.id);
    const other = userId("did:privy:someone-else");
    const response = await handleServices(
      context.services,
      context.session,
      { userId: other, agentTokenId: null, scopes: null },
      new Request(`https://froggy.example/api/services/tasks/${ticket.id}`)
    );
    expect(response.status).toBe(404);
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
      { userId: context.session.userId, agentTokenId: null, scopes: null },
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
        scopes: null,
      },
      new Request(url)
    );
    expect(other.status).toBe(404);
    const listed = await handleServices(
      context.services,
      context.session,
      { userId: context.session.userId, agentTokenId: null, scopes: null },
      new Request("https://froggy.example/api/services/tasks")
    );
    expect(await listed.text()).not.toContain("iVBORw0KGgo");
  });
  it("MCP lists tools, rejects hostile origins and ignores notification purchases", async () => {
    const context = await fixture();
    const caller = {
      userId: context.session.userId,
      agentTokenId: null,
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
