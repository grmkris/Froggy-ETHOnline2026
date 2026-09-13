import { beforeAll, describe, expect, it } from "bun:test";

import { StubCloudBrowser } from "@froggy/browser";
import {
  EvmAddress,
  EmailId,
  EmailWaitId,
  OAuthClientId,
  OAuthGrantId,
  SessionId,
  SaleId,
  RunId,
  TaskId,
  usdMicros,
  creditUnits,
  userId,
} from "@froggy/domain";
import type { OAuthScope } from "@froggy/domain";
import {
  ServiceRequest,
  ServiceResult,
  ServiceTicket,
  SwapQuoteInput,
} from "@froggy/protocol";
import { asSchema } from "ai";
import type { ToolSet } from "ai";
import { ConfigProvider, Effect, Schema } from "effect";

import { ModelBudget } from "./budget";
import { capabilityFor, canUseTool } from "./capabilities";
import { fundTestCredits } from "./credit-fixture";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { acceptHistory } from "./history";
import { InteractionRegistry } from "./interactions";
import { handleMcp } from "./mcp";
import {
  changeMonitor,
  claimMonitor,
  updateMonitorCheck,
  configureMonitor,
  monitoringState,
  setMonitoringBudget,
} from "./monitoring";
import { createMonitoringRunner } from "./monitoring-runner";
import { createNotices } from "./notices";
import { createQuotes } from "./quotes";
import { ChatRun, ChatRunRegistry } from "./runs";
import { purchaseService } from "./service-tasks";
import { createServices } from "./services";
import { WorkspaceSession } from "./session";
import { buildTools } from "./tools";
import { UnlockTokens } from "./unlock";
import { saveWatchlistItem } from "./watchlist-routes";
import { Workspaces } from "./workspaces";

const BASE = "eip155:8453";
// Synthetic fixtures, never live assets or signing targets.
const TOKEN = Schema.decodeUnknownSync(EvmAddress)(
  "0x1111111111111111111111111111111111111111"
);
const OUTPUT_TOKEN = "0x2222222222222222222222222222222222222222";
const WALLET = "0x3333333333333333333333333333333333333333";
const INPUTS = {
  market_search: { network: BASE, query: null, limit: 3 },
  token_inspect: { network: BASE, address: TOKEN },
  rpc_read: {
    network: BASE,
    call: { method: "eth_getBalance", params: [WALLET, "latest"] },
  },
  quote_action: {
    network: BASE,
    wallet: WALLET,
    tokenIn: TOKEN,
    tokenOut: OUTPUT_TOKEN,
    amount: "1000",
    slippageBps: 100,
  },
};
const ToolObjectSchema = Schema.Struct({
  type: Schema.Literal("object"),
  required: Schema.Array(Schema.String),
  properties: Schema.Record(Schema.String, Schema.Json),
});
const noop = (): void => {};
let environment: Environment;
beforeAll(async () => {
  environment = await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          DATABASE_URL: "",
          HEDERA_ACCOUNT_ID: "0.0.0",
          HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
          HEDERA_NETWORK: "hedera:testnet",
          EVM_NETWORK: "eip155:84532",
          GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
          PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
          PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
          PRIVY_AUTHORIZATION_PRIVATE_KEY: "REPLACE_ME_PRIVY_AUTHORIZATION_KEY",
          PRIVY_AUTHORIZATION_KEY_ID: "REPLACE_ME_PRIVY_KEY_QUORUM_ID",
          BIRDEYE_API_KEY: "REPLACE_ME_BIRDEYE_KEY",
          UNISWAP_API_KEY: "REPLACE_ME_UNISWAP_KEY",
          TRADING_RPC_ENDPOINTS: "{}",
          UNISWAP_CHAINS: '[{"network":"eip155:8453","routerVersion":"2.1.1"}]',
          TRADING_PRICES_USD_MICROS:
            '{"market_search":11000,"token_inspect":12000,"rpc_read":13000,"quote_action":14000}',
        })
      )
    )
  );
});

const fixture = async (
  scopes?: readonly OAuthScope[],
  savedHistory = false
) => {
  const services = createServices({ environment });
  const { quote } = createQuotes(services.rates);
  const balances = {
    hbar: async () => await Promise.resolve(null),
    usdc: async () => await Promise.resolve(null),
  };
  const networks = { evm: "eip155:84532", hedera: "hedera:testnet" } as const;
  const pocket = {
    networks: ["hedera:testnet"] as const,
    startingUsdMicrosFor: () => 2_000_000,
  };
  const person = userId(`did:privy:trading-chat-test-${crypto.randomUUID()}`);
  const session = new WorkspaceSession(
    SessionId.generate(),
    person,
    {
      ledger: services.ledger,
      modes: environment.modes,
      onPolicyDecision: noop,
      onReceipt: noop,
      balances,
      networks,
      pocket,
      quote,
      store: services.store,
    },
    {
      hosts: [new URL(environment.appOrigin).host],
      payeeIds: [services.oracle.payTo],
    }
  );
  await session.hydrate();
  await fundTestCredits(services.store, person, 2_000_000);
  // Trading tools must never reach for a page; a stub refuses loudly if they do.
  const browser = new StubCloudBrowser({});
  const workspaces = new Workspaces({
    blockPrivateNetwork: true,
    browserIdleMs: 1000,
    createBrowser: () => browser,
    balances,
    networks,
    pocket,
    quote,
    demoUserId: null,
    isBusy: () => false,
    ledger: services.ledger,
    maxBrowsers: 1,
    modes: environment.modes,
    onBrowserState: noop,
    onMandate: noop,
    onPolicyDecision: noop,
    onReceipt: noop,
    oracleHost: new URL(environment.appOrigin).host,
    oraclePayTo: services.oracle.payTo,
    reservedBrowsers: 0,
    store: services.store,
  });
  const accepted = savedHistory
    ? await acceptHistory(services.store.history, person, {
        messages: [
          {
            id: "email-wait-request",
            role: "user",
            parts: [
              {
                type: "text",
                text: "Wait for my requested confirmation email.",
              },
            ],
          },
        ],
      })
    : null;
  const run = new ChatRun(session.id, accepted?.run.id);
  const connectionId = scopes ? OAuthGrantId.generate() : null;
  if (connectionId && scopes) {
    const clientId = OAuthClientId.generate();
    await services.store.oauth.clients.create({
      id: clientId,
      name: "Tool fixture",
      createdAt: 0,
      redirectUris: ["https://example.com/callback"],
    });
    await services.store.oauth.grants.create(person, {
      id: connectionId,
      clientId,
      clientName: "Tool fixture",
      createdAt: 0,
      lastUsedAt: null,
      revokedAt: null,
      scopes,
    });
  }
  const tools = buildTools({
    connectionId,
    browser,
    workspaces,
    run,
    services,
    session,
    notices: createNotices({
      notify: async () => await Promise.resolve(false),
      publishApp: noop,
    }),
    unlocks: new UnlockTokens(),
  });
  return { services, session, run, tools, connectionId, workspaces };
};
type Fixture = Awaited<ReturnType<typeof fixture>>;
const callOptions = {
  toolCallId: "trading-chat-call",
  messages: [],
  context: {},
};
const completed = async (
  context: Fixture,
  taskId: TaskId,
  attempts = 100
): Promise<ServiceTicket> => {
  const output = await context.tools.service_status.execute?.(
    { taskId },
    callOptions
  );
  const ticket = Schema.decodeUnknownSync(ServiceTicket)(output);
  if (["done", "failed", "uncertain"].includes(ticket.status)) {
    return ticket;
  }
  if (attempts === 0) {
    throw new Error("Chat trading task did not finish.");
  }
  await Bun.sleep(10);
  return await completed(context, taskId, attempts - 1);
};

describe("named trading chat tools", () => {
  it("exposes email and research tools together without sending authority", async () => {
    const { tools } = await fixture();
    const names = Object.keys(tools);
    for (const name of [
      "email_address",
      "email_search",
      "email_draft",
      "email_wait",
      "research_read",
      "graph_schema",
      "watchlist_save",
    ]) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain("email_send");
    expect(names).not.toContain("email_approve");
  });

  it("advertises object schemas that accept all four model inputs without a wire version", async () => {
    const { tools } = await fixture();
    await Promise.all(
      ["market_search", "token_inspect", "rpc_read", "quote_action"].map(
        async (name) => {
          // Decode names rather than widening the four tool/input pairings.
          const operation = Schema.decodeUnknownSync(
            Schema.Literals([
              "market_search",
              "token_inspect",
              "rpc_read",
              "quote_action",
            ])
          )(name);
          const schema = asSchema<unknown>(tools[operation].inputSchema);
          const json = Schema.decodeUnknownSync(ToolObjectSchema)(
            await schema.jsonSchema
          );
          expect(json.type).toBe("object");
          expect(json.required).toContain("input");
          expect(json.required).toContain("idempotencyKey");
          expect(json.properties).not.toHaveProperty("v");
          expect(json.properties).not.toHaveProperty("service");
          const validation = await schema.validate?.({
            input: INPUTS[operation],
            idempotencyKey: "chat-schema-test",
          });
          expect(validation?.success).toBe(true);
        }
      )
    );
  });

  it.each(["market_search", "quote_action"] as const)(
    "executes %s through chat with one durable task and credit charge across coordinator retries",
    async (operation) => {
      const context = await fixture();
      const idempotencyKey = `chat-${operation}-${crypto.randomUUID()}`;
      const output =
        operation === "market_search"
          ? await context.tools.market_search.execute?.(
              { input: INPUTS.market_search, idempotencyKey },
              callOptions
            )
          : await context.tools.quote_action.execute?.(
              {
                input: Schema.decodeUnknownSync(SwapQuoteInput)(
                  INPUTS.quote_action
                ),
                idempotencyKey,
              },
              callOptions
            );
      expect(output).not.toHaveProperty("email_wait");
      expect(output).not.toHaveProperty("email_address");
      const ticket = Schema.decodeUnknownSync(ServiceTicket)(output);
      const result = await completed(context, ticket.id);
      expect(result.status).toBe("done");
      expect(result.runId).toBe(context.run.id);
      expect(result.service).toBe(operation);
      expect(result.stubbed).toBe(true);
      expect(result.data?.operation).toBe(operation);
      expect(result.data?.stubbed).toBe(true);
      expect(context.session.history).toHaveLength(0);
      expect(result.saleId).toBeNull();
      const charge = await context.services.store.credits.findCharge(
        context.session.userId,
        ticket.id
      );
      expect(charge?.status).toBe("captured");
      expect(charge?.stubbed).toBe(true);
      const entries = await context.services.store.credits.entries(
        context.session.userId
      );
      expect(entries.filter((entry) => entry.kind === "capture")).toHaveLength(
        1
      );
      const task = await context.services.store.tasks.byId(
        context.session.userId,
        ticket.id
      );
      expect(
        Schema.decodeUnknownSync(ServiceResult)(task?.result).data
      ).toEqual(result.data);
      const request = Schema.decodeUnknownSync(ServiceRequest)({
        v: 2,
        service: operation,
        input: INPUTS[operation],
        idempotencyKey,
      });
      expect(Schema.decodeUnknownSync(ServiceRequest)(task?.input)).toEqual(
        request
      );
      const replay = await purchaseService(
        {
          services: context.services,
          session: context.session,
          agentTokenId: null,
          runId: context.run.id,
        },
        request
      );
      expect(replay.id).toBe(ticket.id);
      expect(context.session.history).toHaveLength(0);
    }
  );
});

it("registers email and workspace tools on the actual chat collection", async () => {
  const { tools } = await fixture();
  const names = Object.keys(tools);
  for (const name of names) {
    expect(capabilityFor(name)).toBeDefined();
  }
  for (const name of [
    "email_wait",
    "email_read",
    "email_search",
    "watchlist_save",
    "monitor_configure",
    "monitor_list",
  ]) {
    expect(names).toContain(name);
    expect(canUseTool(name, "chat", null)).toBe(true);
  }
  const permitted = new Set([
    "browse",
    "pay",
    "email:read",
    "watchlist:read",
  ] as const);
  expect(canUseTool("email_wait", "browse", permitted)).toBe(true);
  expect(canUseTool("watchlist_get", "browse", permitted)).toBe(true);
  expect(canUseTool("email_draft", "browse", permitted)).toBe(false);
  expect(canUseTool("wallet_send", "browse", permitted)).toBe(false);
  expect(canUseTool("email_read", "schedule", new Set())).toBe(false);
  expect(canUseTool("browser_snapshot", "monitor", null)).toBe(true);
});

it("enforces a delegated grant again when an already-built tool executes", async () => {
  const context = await fixture(["watchlist:read"]);
  const available: ToolSet = context.tools;
  const read = available["watchlist_list"];
  const write = available["watchlist_save"];
  if (!read?.execute || !write?.execute || !context.connectionId) {
    throw new Error("Expected scoped tools");
  }
  expect(read.execute({ query: "" }, callOptions)).resolves.toEqual({
    v: 1,
    items: [],
  });
  expect(
    write.execute(
      {
        title: "Fixture",
        notes: "",
        source: { _tag: "link", url: "https://example.com" },
      },
      callOptions
    )
  ).rejects.toThrow("permission");
  await context.services.store.oauth.grants.revoke(
    context.session.userId,
    context.connectionId,
    Date.now()
  );
  expect(read.execute({ query: "" }, callOptions)).rejects.toThrow("revoked");
});

const emailFixture = async (savedHistory = false) => {
  const context = await fixture(["email:read"], savedHistory);
  const { email } = context.services;
  if (!email || !context.connectionId) {
    throw new Error("Expected email and an explicit read grant");
  }
  const owner = context.session.userId;
  await email.claim(owner, "scoped-email");
  const grantId = context.connectionId;
  const revoke = async () => {
    await context.services.store.oauth.grants.revoke(
      owner,
      grantId,
      Date.now()
    );
  };
  return { context, email, owner, grantId, revoke };
};
const readEmailMcp = async (context: Fixture, fileId: string, owner = false) =>
  await handleMcp(
    context.services,
    context.session,
    {
      userId: context.session.userId,
      agentTokenId: null,
      grantId: owner ? null : context.connectionId,
      scopes: owner ? null : new Set(["email:read"]),
    },
    new Request(`${environment.appOrigin}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "froggy_email_file_read",
          arguments: { id: fileId },
        },
      }),
    })
  );

it("reads the owner's attachment but rejects a revoked MCP grant despite cached caller scopes", async () => {
  const { context, email, owner, revoke } = await emailFixture();
  const file = await email.upload(
    owner,
    "note.txt",
    "text/plain",
    new TextEncoder().encode("Private attachment fixture")
  );
  const own = await readEmailMcp(context, file.id, true);
  expect(await own.text()).toContain("Private attachment fixture");
  await revoke();
  const denied = await readEmailMcp(context, file.id);
  const output = await denied.text();
  expect(output).toContain("revoked");
  expect(output).not.toContain("Private attachment fixture");
});

it("withholds MCP attachment bytes when the grant is revoked during the attachment read", async () => {
  const { context, email, owner, revoke } = await emailFixture();
  const file = await email.upload(
    owner,
    "note.txt",
    "text/plain",
    new TextEncoder().encode("Private delayed attachment")
  );
  const read = email.file.bind(email);
  let reads = 0;
  email.file = async (...args) => {
    const result = await read(...args);
    reads += 1;
    if (reads === 2) {
      await revoke();
    }
    return result;
  };
  const response = await readEmailMcp(context, file.id);
  const output = await response.text();
  expect(reads).toBe(2);
  expect(output).toContain("revoked");
  expect(output).not.toContain("Private delayed attachment");
});

it("withholds model attachment output when reading revokes the grant after conversion starts", async () => {
  const { context, email, owner, revoke } = await emailFixture();
  const bytes =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=";
  const file = await email.upload(
    owner,
    "pixel.png",
    "image/png",
    new Uint8Array(Buffer.from(bytes, "base64"))
  );
  const available: ToolSet = context.tools;
  const readTool = available["email_file_read"];
  if (!readTool?.execute || !readTool.toModelOutput) {
    throw new Error("Expected attachment tool");
  }
  const output: unknown = await readTool.execute({ id: file.id }, callOptions);
  const read = email.file.bind(email);
  email.file = async (...args) => {
    const result = await read(...args);
    await revoke();
    return result;
  };
  expect(
    readTool.toModelOutput({
      toolCallId: callOptions.toolCallId,
      input: { id: file.id },
      output,
    })
  ).rejects.toThrow("revoked");
});

it("withholds a waited-for email result when its grant is revoked during the wait", async () => {
  const { context, email, revoke } = await emailFixture(true);
  const available: ToolSet = context.tools;
  const wait = available["email_wait"];
  if (!wait?.execute) {
    throw new Error("Expected email wait tool");
  }
  const first: unknown = await wait.execute(
    { expectedDomain: "example.com" },
    callOptions
  );
  const { id } = Schema.decodeUnknownSync(Schema.Struct({ id: EmailWaitId }))(
    JSON.parse(Schema.decodeUnknownSync(Schema.String)(first))
  );
  const waitStatus = email.waitStatus.bind(email);
  email.waitStatus = async (...args) => {
    const result = await waitStatus(...args);
    await revoke();
    return { ...result, status: "received", emailId: EmailId.generate() };
  };
  expect(
    wait.execute({ expectedDomain: "example.com", id }, callOptions)
  ).rejects.toThrow("revoked");
});

it("runs a structured token monitor through purchase, task reconciliation and baseline without Chrome", async () => {
  const context = await fixture();
  const { workspaces } = context;
  let fixturePrice = 2;
  const messages: string[] = [];
  const services = {
    ...context.services,
    trading: {
      ...context.services.trading,
      market: {
        ...context.services.trading.market,
        inspect: async (
          input: Parameters<typeof context.services.trading.market.inspect>[0]
        ) => {
          const result = await context.services.trading.market.inspect(input);
          return {
            ...result,
            token: { ...result.token, priceUsd: fixturePrice },
          };
        },
      },
    },
  };
  const owner = context.session.userId;
  const item = await saveWatchlistItem(services.store, owner, {
    title: "Synthetic token",
    notes: "Exact Base token",
    source: { _tag: "token", network: BASE, address: TOKEN },
  });
  await setMonitoringBudget(services.store, owner, 2_000_000, "UTC");
  const monitor = await configureMonitor(
    services.store,
    owner,
    {
      itemId: item.id,
      cadence: "daily",
      timezone: "UTC",
      context: "Exact Base token",
      condition: { _tag: "price_below", amount: 1, currency: "USD" },
    },
    null
  );
  const runner = createMonitoringRunner({
    services,
    workspaces,
    budget: new ModelBudget({ exempt: null, runsPerDay: 5, stepsPerDay: 50 }),
    interactions: new InteractionRegistry({
      onRequest: noop,
      onResolved: noop,
    }),
    notices: createNotices({
      notify: async (_owner, text) => {
        messages.push(text);
        return await Promise.resolve(false);
      },
      publishApp: noop,
    }),
    oracleUrl: `${environment.appOrigin}/oracle/snapshot`,
    tasksUrl: `${environment.appOrigin}/api/tasks`,
    runs: new ChatRunRegistry(),
    unlocks: new UnlockTokens(),
  });
  await runner.tick();
  const started = await monitoringState(services.store, owner);
  const [check] = started.checks;
  if (!check?.taskId) {
    throw new Error("Monitor task missing");
  }
  const ticket = await completed(context, check.taskId);
  expect(ticket.status).toBe("done");
  await runner.tick();
  const settled = await monitoringState(services.store, owner);
  expect(settled.checks[0]?.error).toBeNull();
  expect(settled.checks[0]?.status).toBe("done");
  expect(settled.checks[0]?.reservedUsdMicros).toBe(0);
  expect(settled.checks[0]?.spentUsdMicros).toBe(12_000);
  expect(settled.monitors[0]?.baseline?.stubbed).toBe(true);
  expect(settled.monitors[0]?.baseline?.evidence).toContain(TOKEN);
  expect(settled.monitors[0]?.baseline?.evidence).toContain(BASE);
  expect(settled.checks[0]?.alert).toBeNull();
  await runner.tick();
  const replay = await monitoringState(services.store, owner);
  expect(replay.months[0]?.spentUsdMicros).toBe(12_000);
  expect(replay.checks).toHaveLength(1);
  fixturePrice = 0.5;
  await changeMonitor(services.store, owner, monitor.id, "check");
  await runner.tick();
  const changed = await monitoringState(services.store, owner);
  const next = changed.checks.at(-1);
  if (!next?.taskId) {
    throw new Error("Missing second task");
  }
  await completed(context, next.taskId);
  await runner.tick();
  await runner.tick();
  const alerted = await monitoringState(services.store, owner);
  expect(alerted.checks.at(-1)?.alert).toContain("$0.5");
  expect(alerted.months[0]?.spentUsdMicros).toBe(24_000);
  expect(messages).toHaveLength(1);
});

const monitoringFixture = async (
  context: Fixture,
  services = context.services
) => {
  const owner = context.session.userId;
  const item = await saveWatchlistItem(services.store, owner, {
    title: "Accounting fixture",
    notes: "Exact synthetic Base token",
    source: { _tag: "token", network: BASE, address: TOKEN },
  });
  await setMonitoringBudget(services.store, owner, 2_000_000, "UTC");
  await configureMonitor(
    services.store,
    owner,
    {
      itemId: item.id,
      cadence: "daily",
      timezone: "UTC",
      context: "Exact synthetic Base token",
      condition: { _tag: "price_below", amount: 1, currency: "USD" },
    },
    null
  );
  return createMonitoringRunner({
    services,
    workspaces: context.workspaces,
    budget: new ModelBudget({ exempt: null, runsPerDay: 5, stepsPerDay: 50 }),
    interactions: new InteractionRegistry({
      onRequest: noop,
      onResolved: noop,
    }),
    notices: createNotices({
      notify: async () => await Promise.resolve(false),
      publishApp: noop,
    }),
    oracleUrl: `${environment.appOrigin}/oracle/snapshot`,
    tasksUrl: `${environment.appOrigin}/api/tasks`,
    runs: new ChatRunRegistry(),
    unlocks: new UnlockTokens(),
  });
};

it("captures monitor credits once without any per-task sale bookkeeping", async () => {
  const context = await fixture();
  const services = {
    ...context.services,
    trading: {
      ...context.services.trading,
      market: {
        ...context.services.trading.market,
        inspect: async (
          input: Parameters<typeof context.services.trading.market.inspect>[0]
        ) => {
          const result = await context.services.trading.market.inspect(input);
          return { ...result, token: { ...result.token, priceUsd: 2 } };
        },
      },
    },
    store: {
      ...context.services.store,
      sales: {
        ...context.services.store.sales,
        record: async () => {
          await Promise.resolve();
          throw new Error("Simulated sale write failure after settlement");
        },
      },
    },
  };
  const runner = await monitoringFixture(context, services);
  const owner = context.session.userId;
  await runner.tick();
  const started = await monitoringState(services.store, owner);
  const taskId = started.checks[0]?.taskId;
  if (taskId === null || taskId === undefined) {
    throw new Error("Missing monitor task");
  }
  const ticket = await completed(context, taskId);
  expect(ticket.status).toBe("done");
  expect(ticket.saleId).toBeNull();
  expect(ticket.chargeStatus).toBe("reserved");
  await runner.tick();
  await runner.tick();
  const state = await monitoringState(services.store, owner);
  expect(state.checks[0]?.error).toBeNull();
  expect(state.checks[0]?.status).toBe("done");
  expect(state.checks[0]?.reservedUsdMicros).toBe(0);
  expect(state.checks[0]?.spentUsdMicros).toBe(12_000);
  expect(state.months[0]?.spentUsdMicros).toBe(12_000);
  const charge = await services.store.credits.findCharge(owner, taskId);
  expect(charge?.status).toBe("captured");
  const balance = await services.store.credits.summary(owner);
  expect(balance.availableUnits).toBe(creditUnits(1_988_000));
  expect(await services.ledger.since(owner, 0)).toEqual([]);
});

it("releases the monitor allowance when the credit per-task cap refuses its charge", async () => {
  const context = await fixture();
  const services = {
    ...context.services,
    oracle: { ...context.services.oracle, payTo: "0.0.999999" },
  };
  const runner = await monitoringFixture(context, services);
  const owner = context.session.userId;
  const summary = await services.store.credits.summary(owner);
  await services.store.credits.setLimits(owner, {
    ...summary.limits,
    perTaskUnits: creditUnits(0),
  });
  await runner.tick();
  const started = await monitoringState(services.store, owner);
  const taskId = started.checks[0]?.taskId;
  if (taskId === null || taskId === undefined) {
    throw new Error("Missing monitor task");
  }
  const ticket = await completed(context, taskId);
  expect(ticket.status).toBe("failed");
  await runner.tick();
  const state = await monitoringState(services.store, owner);
  expect(state.checks[0]?.status).toBe("failed");
  expect(state.checks[0]?.reservedUsdMicros).toBe(0);
  expect(state.checks[0]?.spentUsdMicros).toBe(0);
  expect(state.months[0]?.spentUsdMicros).toBe(0);
});

it.each([
  ["service", "failed"],
  ["browse", "failed"],
  ["service", "cancelled"],
  ["browse", "cancelled"],
] as const)(
  "holds the reservation for a %s task ending %s with missing payment evidence",
  async (kind, status) => {
    const context = await fixture();
    const runner = await monitoringFixture(context);
    const { store } = context.services;
    const owner = context.session.userId;
    const check = await claimMonitor(store, owner);
    if (check === null) {
      throw new Error("Missing monitoring claim");
    }
    const id = TaskId.generate();
    await store.tasks.create(owner, {
      id,
      kind,
      runId: RunId.generate(),
      saleId: null,
      status,
      error: "Interrupted after payment attempt",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      priceUsdMicros: usdMicros(12_000),
      input: {},
      result: null,
      idempotencyKey: `monitor:${check.id}`,
      agentTokenId: null,
      connectionId: null,
    });
    await updateMonitorCheck(store, owner, check.id, {
      taskId: id,
      status: "running",
    });
    await runner.tick();
    await runner.tick();
    const state = await monitoringState(store, owner);
    expect(state.checks).toHaveLength(1);
    expect(state.checks[0]?.status).toBe("uncertain");
    expect(state.checks[0]?.reservedUsdMicros).toBe(1_000_000);
    expect(state.checks[0]?.spentUsdMicros).toBe(0);
    expect(state.months).toHaveLength(0);
  }
);

it.each(["completed", "blocked"] as const)(
  "reconciles a cancelled paid browser check immediately despite its prior %s report",
  async (status) => {
    const context = await fixture();
    const runner = await monitoringFixture(context);
    const { store } = context.services;
    const owner = context.session.userId;
    const check = await claimMonitor(store, owner);
    if (check === null) {
      throw new Error("Missing monitoring claim");
    }
    const id = TaskId.generate();
    await store.tasks.create(owner, {
      id,
      kind: "browse",
      runId: RunId.generate(),
      saleId: SaleId.generate(),
      status: "cancelled",
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      priceUsdMicros: usdMicros(12_000),
      input: {},
      result: {
        outcome: {
          status,
          reason: "Prior report",
          evidence: "Synthetic page",
          observation: {
            at: Date.now(),
            value: "$0.50",
            price: 0.5,
            currency: "USD",
            sourceUrl: "https://example.com/token",
            evidence: "Synthetic token",
            stubbed: true,
          },
        },
      },
      idempotencyKey: `monitor:${check.id}`,
      agentTokenId: null,
      connectionId: null,
    });
    await updateMonitorCheck(store, owner, check.id, {
      taskId: id,
      status: "running",
    });
    await runner.tick();
    await runner.tick();
    const state = await monitoringState(store, owner);
    expect(state.checks).toHaveLength(1);
    expect(state.checks[0]?.status).toBe("failed");
    expect(state.checks[0]?.error).toBe("The check was cancelled.");
    expect(state.checks[0]?.reservedUsdMicros).toBe(0);
    expect(state.months[0]?.spentUsdMicros).toBe(12_000);
    expect(state.monitors[0]?.baseline).toBeNull();
    expect(state.monitors[0]?.status).toBe("failed");
  }
);
