import { beforeAll, describe, expect, it } from "bun:test";

import { StubCloudBrowser } from "@froggy/browser";
import { SessionId, userId } from "@froggy/domain";
import type { TaskId } from "@froggy/domain";
import {
  ServiceRequest,
  ServiceResult,
  ServiceTicket,
  SwapQuoteInput,
} from "@froggy/protocol";
import { asSchema } from "ai";
import { ConfigProvider, Effect, Schema } from "effect";

import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { createNotices } from "./notices";
import { createQuotes } from "./quotes";
import { ChatRun } from "./runs";
import { purchaseService } from "./service-tasks";
import { createServices } from "./services";
import { WorkspaceSession } from "./session";
import { buildTools } from "./tools";
import { UnlockTokens } from "./unlock";
import { Workspaces } from "./workspaces";

const BASE = "eip155:8453";
// Synthetic fixtures, never live assets or signing targets.
const TOKEN = "0x1111111111111111111111111111111111111111";
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

const fixture = async () => {
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
  const tools = buildTools({
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
  return { services, session, run, tools };
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
    "executes %s through chat with the same durable task, sale, and receipt as the coordinator",
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
      const [receipt] = context.session.history;
      expect(context.session.history).toHaveLength(1);
      expect(receipt?.stubbed).toBe(true);
      expect(receipt?.runId).toBe(context.run.id);
      expect(receipt?.intent.idempotencyKey).toBe(`service:${ticket.id}`);
      if (result.saleId === null) {
        throw new Error("Chat trading task did not retain its sale.");
      }
      const sale = await context.services.store.sales.byId(result.saleId);
      expect(sale?.transactionId).toBe(receipt?.settlement?.transactionId);
      expect(sale?.stubbed).toBe(true);
      const task = await context.services.store.tasks.byId(
        context.session.userId,
        ticket.id
      );
      expect(
        Schema.decodeUnknownSync(ServiceResult)(task?.result).data
      ).toEqual(result.data);
      const request = Schema.decodeUnknownSync(ServiceRequest)({
        v: 1,
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
      expect(context.session.history).toHaveLength(1);
    }
  );
});
