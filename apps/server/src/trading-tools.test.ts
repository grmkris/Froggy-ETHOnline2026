import { beforeAll, describe, expect, it } from "bun:test";

import { StubCloudBrowser } from "@froggy/browser";
import {
  EvmAddress,
  OAuthClientId,
  OAuthGrantId,
  SessionId,
  userId,
} from "@froggy/domain";
import type { OAuthScope, TaskId } from "@froggy/domain";
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
import { InteractionRegistry } from "./interactions";
import {
  changeMonitor,
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

const fixture = async (scopes?: readonly OAuthScope[]) => {
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
  const run = new ChatRun(session.id);
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
      expect(
        (
          await context.services.store.credits.entries(context.session.userId)
        ).filter((entry) => entry.kind === "capture")
      ).toHaveLength(1);
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
