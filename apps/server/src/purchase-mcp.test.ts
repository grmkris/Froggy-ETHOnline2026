import { beforeAll, describe, expect, it } from "bun:test";

import { OAuthGrantId, SessionId, userId } from "@froggy/domain";
import type { OAuthScope } from "@froggy/domain";
import { Effect, Schema } from "effect";

import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { handleMcp } from "./mcp";
import { PurchaseToolInput, purchaseToolResult } from "./purchase-tool";
import { createQuotes } from "./quotes";
import { createServices } from "./services";
import { WorkspaceSession } from "./session";
import type { TaskCaller } from "./tasks";

let environment: Environment;
beforeAll(async () => {
  Object.assign(process.env, {
    DATABASE_URL: "",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
  });
  environment = await Effect.runPromise(loadEnvironment());
});
const fixture = async () => {
  const services = createServices({ environment });
  const person = userId(`did:privy:purchase-mcp-${crypto.randomUUID()}`);
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
      quote,
      store: services.store,
    },
    { hosts: [], payeeIds: [] }
  );
  await session.hydrate();
  return { services, session };
};
const Result = Schema.Struct({
  result: Schema.Struct({
    isError: Schema.Boolean,
    content: Schema.Array(
      Schema.Struct({ type: Schema.Literals(["text"]), text: Schema.String })
    ),
  }),
});
const decodeResult = Schema.decodeUnknownSync(Result);
const callerFor = (
  session: WorkspaceSession,
  scopes: readonly OAuthScope[] = ["pay"]
): TaskCaller => ({
  userId: session.userId,
  agentTokenId: null,
  grantId: OAuthGrantId.generate(),
  scopes: new Set(scopes),
});
const call = async (
  context: Awaited<ReturnType<typeof fixture>>,
  caller: TaskCaller,
  name: string,
  args: Readonly<Record<string, string | number>>
) => {
  const response = await handleMcp(
    context.services,
    context.session,
    caller,
    new Request("https://froggy.example/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
  );
  return decodeResult(await response.json()).result;
};
const input = () => ({
  url: "https://seller.example/paid",
  method: "POST",
  body: '{"prompt":"a private request"}',
  purpose: "Purchase an answer",
  idempotencyKey: crypto.randomUUID(),
  maxUsdMicros: 50_000,
});

describe("MCP URL purchases", () => {
  it("accepts a versionless tool request and enforces the spending ceiling", () => {
    const args = input();
    const valid = Schema.decodeUnknownResult(PurchaseToolInput)(args);
    expect(valid._tag).toBe("Success");
    expect(
      Schema.decodeUnknownResult(PurchaseToolInput)({
        ...args,
        maxUsdMicros: 1_000_001,
      })._tag
    ).toBe("Failure");
  });

  it("requires pay scope before creating or reading any purchase", async () => {
    const context = await fixture();
    const caller = callerFor(context.session, ["services"]);
    const refused = await call(context, caller, "froggy_x402_request", input());
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain('"pay" scope');
    expect(
      await context.services.store.purchases.list(context.session.userId, 50)
    ).toEqual([]);
    const status = await call(context, caller, "froggy_x402_status", {});
    expect(status.isError).toBe(true);
    expect(status.content[0]?.text).toContain('"pay" scope');
  });

  it("joins repeated POST requests before sending input or signing", async () => {
    const context = await fixture();
    const caller = callerFor(context.session);
    const args = input();
    const first = await call(context, caller, "froggy_x402_request", args);
    const second = await call(context, caller, "froggy_x402_request", args);
    expect(first.isError).toBe(false);
    expect(second).toEqual(first);
    const purchases = await context.services.store.purchases.list(
      context.session.userId,
      50
    );
    expect(purchases).toHaveLength(1);
    const [purchase] = purchases;
    expect(purchase?.status).toBe("awaiting_approval");
    expect(purchase?.quote).toBeNull();
    expect(purchase?.contactApprovedAt).toBeNull();
    expect(purchase?.payment.state).toBe("none");
    expect(purchase?.connectionId).toBe(caller.grantId);
    expect(context.session.history).toHaveLength(0);
  });

  it("refuses a key reused for a different JSON request", async () => {
    const context = await fixture();
    const caller = callerFor(context.session);
    const args = input();
    await call(context, caller, "froggy_x402_request", args);
    const conflicting = await call(context, caller, "froggy_x402_request", {
      ...args,
      body: '{"prompt":"different work"}',
    });
    expect(conflicting.isError).toBe(true);
    expect(conflicting.content[0]?.text).toContain("different request");
    expect(
      await context.services.store.purchases.list(context.session.userId, 50)
    ).toHaveLength(1);
  });

  it("keeps purchase status private to the requesting connection", async () => {
    const context = await fixture();
    const caller = callerFor(context.session);
    await call(context, caller, "froggy_x402_request", input());
    const [purchase] = await context.services.store.purchases.list(
      context.session.userId,
      50
    );
    if (purchase === undefined) {
      throw new Error("Purchase was not created");
    }
    const args = { purchaseId: purchase.id };
    const owner = await call(context, caller, "froggy_x402_status", args);
    expect(owner.isError).toBe(false);
    expect(owner.content[0]?.text).toContain(purchase.id);
    const stranger = await call(
      context,
      callerFor(context.session),
      "froggy_x402_status",
      args
    );
    expect(stranger.isError).toBe(true);
    expect(stranger.content[0]?.text).toContain("not found");
  });

  it("caps seller output and omits submitted input and approval grants from tools", async () => {
    const context = await fixture();
    const purchase = await context.services.purchases.request(
      { session: context.session, source: "chat" },
      { v: 1, ...input(), method: "POST" }
    );
    const result = purchaseToolResult({
      ...purchase,
      delivery: { ...purchase.delivery, body: "x".repeat(60_000) },
    });
    expect(result.delivery.body).toHaveLength(16_000);
    expect(result.delivery.truncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain("a private request");
    expect(result).not.toHaveProperty("grant");
    expect(result).not.toHaveProperty("approvalId");
    expect(result.payment).not.toHaveProperty("proofHash");
  });
});

it("archives a fixed diagnostic category without malformed authenticated payloads", async () => {
  const context = await fixture();
  const caller = callerFor(context.session);
  const response = await handleMcp(
    context.services,
    context.session,
    caller,
    new Request("https://froggy.example/api/mcp", {
      method: "POST",
      body: "malformed-private-payload=must-not-be-stored",
    })
  );
  expect(response.status).toBe(400);
  const records = await context.services.store.history.list(caller.userId, {
    kind: "execution",
  });
  expect(records).toHaveLength(1);
  expect(JSON.stringify(records)).toContain("protocol_diagnostic");
  expect(JSON.stringify(records)).toContain("invalid_request");
  expect(JSON.stringify(records)).not.toContain("must-not-be-stored");
  expect(
    await context.services.store.receipts.recent(caller.userId, 10)
  ).toHaveLength(0);
});
