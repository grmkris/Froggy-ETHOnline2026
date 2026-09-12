import { beforeAll, describe, expect, it, spyOn } from "bun:test";

import { SessionId, userId } from "@froggy/domain";
import type { TaskId } from "@froggy/domain";
import {
  ServiceCatalog,
  ServiceRequest,
  ServiceResult,
  ServiceTicket,
  TradingServiceRequest,
} from "@froggy/protocol";
import type { TradingServiceName } from "@froggy/protocol";
import { ConfigProvider, Effect, Redacted, Schema } from "effect";

import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { handleMcp } from "./mcp";
import { createQuotes } from "./quotes";
import { handleServices } from "./service-routes";
import { purchaseService, serviceTicket } from "./service-tasks";
import { createServices } from "./services";
import type { Services } from "./services";
import { WorkspaceSession } from "./session";
import type { TaskCaller } from "./tasks";

const BASE = "eip155:8453";
const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
// Test addresses only; these never configure a live market or signing target.
const TOKEN = "0x1111111111111111111111111111111111111111";
const OUTPUT_TOKEN = "0x2222222222222222222222222222222222222222";
const WALLET = "0x3333333333333333333333333333333333333333";
const OPERATIONS = [
  "market_search",
  "token_inspect",
  "rpc_read",
  "quote_action",
] as const;
const TEST_ENV = {
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
  SERVICE_SUPPLIER_PAYEES: "",
  X_API_BEARER_TOKEN: "",
  BIRDEYE_API_KEY: "REPLACE_ME_BIRDEYE_KEY",
  UNISWAP_API_KEY: "REPLACE_ME_UNISWAP_KEY",
  TRADING_RPC_ENDPOINTS: "{}",
  UNISWAP_CHAINS:
    '[{"network":"eip155:8453","routerVersion":"2.1.1"},{"network":"eip155:84532","routerVersion":"2.1.1"}]',
  TRADING_PRICES_USD_MICROS:
    '{"market_search":11000,"token_inspect":12000,"rpc_read":13000,"quote_action":14000,"token_research":15000}',
  GOPLUS_API_URL: "REPLACE_ME_GOPLUS_URL",
};

let environment: Environment;
beforeAll(async () => {
  environment = await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(TEST_ENV)
      )
    )
  );
});

const requestFor = (
  service: TradingServiceName,
  idempotencyKey: string = crypto.randomUUID()
): TradingServiceRequest => {
  const inputs = {
    watch_launches: {
      network: BASE,
      durationMinutes: 1,
      minimumLiquidityUsd: null,
      source: null,
    },
    market_search: { network: BASE, query: null, limit: 3 },
    token_inspect: { network: BASE, address: TOKEN },
    token_research: {
      network: BASE,
      address: TOKEN,
      cohortWindowBlocks: 600,
      holderPageBudget: 5,
    },
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
  return Schema.decodeUnknownSync(TradingServiceRequest)({
    v: 1,
    service,
    input: inputs[service],
    idempotencyKey,
  });
};

const fixture = async () => {
  const services = createServices({ environment });
  const calls = {
    market_search: 0,
    token_inspect: 0,
    rpc_read: 0,
    quote_action: 0,
    payments: 0,
  };
  const counted: Services = {
    ...services,
    hederaPayerFor: async (input) => {
      calls.payments += 1;
      return await services.hederaPayerFor(input);
    },
    trading: {
      market: {
        search: async (input) => {
          calls.market_search += 1;
          return await services.trading.market.search(input);
        },
        inspect: async (input) => {
          calls.token_inspect += 1;
          return await services.trading.market.inspect(input);
        },
      },
      rpc: {
        read: async (input) => {
          calls.rpc_read += 1;
          return await services.trading.rpc.read(input);
        },
      },
      quotes: {
        quote: async (input) => {
          calls.quote_action += 1;
          return await services.trading.quotes.quote(input);
        },
      },
      pons: services.trading.pons,
      goplus: services.trading.goplus,
      research: services.trading.research,
    },
  };
  const person = userId(`did:privy:trading-test-${crypto.randomUUID()}`);
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
        startingUsdMicrosFor: () => 2_000_000,
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
  return { services: counted, session, agentTokenId: null, calls };
};
type Fixture = Awaited<ReturnType<typeof fixture>>;
const callerFor = (context: Fixture): TaskCaller => ({
  userId: context.session.userId,
  agentTokenId: null,
  grantId: null,
  scopes: null,
});

const completed = async (
  context: Fixture,
  id: TaskId,
  attempts = 100
): Promise<ServiceTicket> => {
  const task = await context.services.store.tasks.byId(
    context.session.userId,
    id
  );
  if (task === null) {
    throw new Error("Trading task disappeared.");
  }
  if (["done", "failed", "uncertain"].includes(task.status)) {
    return serviceTicket(task);
  }
  if (attempts === 0) {
    throw new Error("Trading task did not finish.");
  }
  await Bun.sleep(10);
  return await completed(context, id, attempts - 1);
};

const httpRun = async (
  context: Fixture,
  body: Schema.Json
): Promise<Response> =>
  await handleServices(
    context.services,
    context.session,
    callerFor(context),
    new Request("https://froggy.example/api/services/run", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
const mcp = async (
  context: Fixture,
  method: "tools/list" | "tools/call",
  params?: { name: string; arguments: Schema.Json },
  caller = callerFor(context)
): Promise<Response> =>
  await handleMcp(
    context.services,
    context.session,
    caller,
    new Request("https://froggy.example/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    })
  );
const McpResult = Schema.Struct({
  result: Schema.Struct({
    isError: Schema.Boolean,
    content: Schema.Array(Schema.Struct({ text: Schema.String })),
  }),
});
const mcpResult = async (response: Response) =>
  Schema.decodeUnknownSync(McpResult)(await response.json()).result;
const mcpTicket = async (response: Response): Promise<ServiceTicket> => {
  const result = await mcpResult(response);
  expect(result.isError).toBe(false);
  return Schema.decodeUnknownSync(ServiceTicket)(
    JSON.parse(result.content[0]?.text ?? "null")
  );
};
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

describe("paid trading services", () => {
  it.each([...OPERATIONS])(
    "persists typed %s results with one matching stubbed payment and sale",
    async (operation) => {
      const context = await fixture();
      const request = requestFor(operation);
      const ticket = await purchaseService(context, request);
      expect(ticket.stubbed).toBe(true);
      const result = await completed(context, ticket.id);
      expect(result.status).toBe("done");
      expect(result.service).toBe(operation);
      expect(result.data?.operation).toBe(operation);
      expect(result.data?.stubbed).toBe(true);
      expect(result.stubbed).toBe(true);
      expect(result.text).toContain("DEMO");
      expect(Number(result.priceUsdMicros)).toBe(
        environment.trading.prices[operation] ?? 0
      );
      expect(context.calls[operation]).toBe(1);
      expect(context.calls.payments).toBe(1);
      expect(context.session.history).toHaveLength(1);
      const [receipt] = context.session.history;
      expect(receipt?.stubbed).toBe(true);
      expect(receipt?.intent.idempotencyKey).toBe(`service:${ticket.id}`);
      expect(result.runId).toBe(receipt?.runId ?? null);
      expect(receipt?.settlement).toBeDefined();
      const savedReceipts = await context.services.store.receipts.recent(
        context.session.userId,
        10
      );
      expect(savedReceipts).toHaveLength(1);
      expect(savedReceipts[0]?.id).toBe(receipt?.id);
      expect(savedReceipts[0]?.stubbed).toBe(true);
      if (result.saleId === null) {
        throw new Error("Delivered trading task has no sale.");
      }
      const sale = await context.services.store.sales.byId(result.saleId);
      expect(sale?.stubbed).toBe(true);
      expect(sale?.transactionId).toBe(receipt?.settlement?.transactionId);
      const stored = await context.services.store.tasks.byId(
        context.session.userId,
        result.id
      );
      expect(stored?.input["demo"]).toBe(true);
      expect(Schema.decodeUnknownSync(ServiceRequest)(stored?.input)).toEqual(
        request
      );
      expect(
        Schema.decodeUnknownSync(ServiceResult)(stored?.result).data
      ).toEqual(result.data);
    }
  );

  it("claims concurrent structured retries and ignores JSON property order, but rejects changed economic inputs", async () => {
    const context = await fixture();
    const first = requestFor("quote_action", "same-quote");
    const reordered = Schema.decodeUnknownSync(TradingServiceRequest)({
      idempotencyKey: "same-quote",
      input: {
        slippageBps: 100,
        amount: "1000",
        tokenOut: OUTPUT_TOKEN,
        tokenIn: TOKEN,
        wallet: WALLET,
        network: BASE,
      },
      service: "quote_action",
      v: 1,
    });
    const tickets = await Promise.all([
      purchaseService(context, first),
      purchaseService(context, reordered),
      purchaseService(context, first),
    ]);
    const [ticket] = tickets;
    if (ticket === undefined) {
      throw new Error("No trading ticket.");
    }
    expect(new Set(tickets.map((entry) => entry.id)).size).toBe(1);
    const result = await completed(context, ticket.id);
    expect(result.status).toBe("done");
    const changed = Schema.decodeUnknownSync(TradingServiceRequest)({
      ...reordered,
      input: { ...reordered.input, amount: "1001" },
    });
    await rejectsWith(purchaseService(context, changed), "different request");
    const replay = await purchaseService(context, reordered);
    expect(replay.data).toEqual(result.data);
    expect(context.calls.quote_action).toBe(1);
    expect(context.calls.payments).toBe(1);
    expect(context.session.history).toHaveLength(1);
  });

  it.each([...OPERATIONS])(
    "refuses unsupported networks for %s before creating a task or charging",
    async (operation) => {
      const context = await fixture();
      const request = requestFor(operation);
      const response = await httpRun(context, {
        ...request,
        input: { ...request.input, network: "eip155:987654321" },
      });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("network");
      expect(context.calls.payments).toBe(0);
      expect(context.calls[operation]).toBe(0);
      expect(context.session.history).toHaveLength(0);
      expect(
        await context.services.store.tasks.list(context.session.userId, 10)
      ).toHaveLength(0);
    }
  );

  it("rejects unsafe RPC methods, quote inputs, and mismatched addresses before payment", async () => {
    const context = await fixture();
    const invalid: Schema.Json[] = [
      {
        ...requestFor("rpc_read"),
        input: {
          network: BASE,
          call: { method: "eth_sendRawTransaction", params: ["0x00"] },
        },
      },
      {
        ...requestFor("rpc_read"),
        input: {
          network: BASE,
          call: {
            method: "eth_call",
            params: [{ to: TOKEN, data: "0x", value: "0x1" }, "latest"],
          },
        },
      },
      {
        ...requestFor("rpc_read"),
        input: {
          network: SOLANA,
          call: {
            method: "getBalance",
            params: ["1".repeat(33), { commitment: "finalized" }],
          },
        },
      },
      {
        ...requestFor("quote_action"),
        input: {
          network: BASE,
          wallet: WALLET,
          tokenIn: TOKEN,
          tokenOut: TOKEN,
          amount: "1000",
          slippageBps: 100,
        },
      },
      {
        ...requestFor("quote_action"),
        input: {
          network: BASE,
          wallet: WALLET,
          tokenIn: TOKEN,
          tokenOut: OUTPUT_TOKEN,
          amount: "0",
          slippageBps: 100,
        },
      },
      {
        ...requestFor("token_inspect"),
        input: { network: BASE, address: "1".repeat(32) },
      },
      {
        ...requestFor("token_inspect"),
        input: { network: SOLANA, address: "z".repeat(44) },
      },
      {
        ...requestFor("market_search"),
        input: { network: BASE, query: "   ", limit: 3 },
      },
    ];
    const responses = await Promise.all(
      invalid.map(async (body) => await httpRun(context, body))
    );
    expect(responses.every((response) => response.status === 400)).toBe(true);
    expect(context.calls.payments).toBe(0);
    expect(context.session.history).toHaveLength(0);
    expect(
      await context.services.store.tasks.list(context.session.userId, 20)
    ).toHaveLength(0);
  });

  it.each([...OPERATIONS])(
    "refuses live %s purchases when credentials or a price are missing",
    async (operation) => {
      const context = await fixture();
      const noCredentials: Environment = {
        ...environment,
        modes: { ...environment.modes, hedera: "live" },
      };
      const noPrice: Environment = {
        ...environment,
        modes: {
          ...environment.modes,
          hedera: "live",
          birdeye: "live",
          quicknode: "live",
          uniswap: "live",
        },
        trading: {
          ...environment.trading,
          prices: {},
          rpcEndpoints: {
            [BASE]: Redacted.make("https://rpc.example.test/fixture-only"),
          },
        },
      };
      await Promise.all(
        [noCredentials, noPrice].map(async (configured) => {
          await rejectsWith(
            purchaseService(
              {
                ...context,
                services: { ...context.services, environment: configured },
              },
              requestFor(operation)
            ),
            "required"
          );
        })
      );
      expect(context.calls.payments).toBe(0);
      expect(context.calls[operation]).toBe(0);
      expect(context.session.history).toHaveLength(0);
      expect(
        await context.services.store.tasks.list(context.session.userId, 10)
      ).toHaveLength(0);
    }
  );

  it("retrieves structured results only for the task owner through HTTP and MCP", async () => {
    const context = await fixture();
    const request = requestFor("token_inspect");
    const ticket = await purchaseService(context, request);
    const result = await completed(context, ticket.id);
    const url = `https://froggy.example/api/services/tasks/${ticket.id}`;
    const own = await handleServices(
      context.services,
      context.session,
      callerFor(context),
      new Request(url)
    );
    expect(
      Schema.decodeUnknownSync(ServiceTicket)(await own.json()).data
    ).toEqual(result.data);
    const other = {
      ...callerFor(context),
      userId: userId("did:privy:other-trading-user"),
    };
    const hidden = await handleServices(
      context.services,
      context.session,
      other,
      new Request(url)
    );
    expect(hidden.status).toBe(404);
    const hiddenMcp = await mcpResult(
      await mcp(
        context,
        "tools/call",
        { name: "froggy_service_status", arguments: { id: ticket.id } },
        other
      )
    );
    expect(hiddenMcp.isError).toBe(true);
    expect(hiddenMcp.content[0]?.text).toContain("No such service task");
    expect(context.calls.payments).toBe(1);
  });

  it("publishes named MCP object schemas and structured HTTP catalog entries", async () => {
    const context = await fixture();
    const response = await mcp(context, "tools/list");
    const list = Schema.decodeUnknownSync(
      Schema.Struct({
        result: Schema.Struct({
          tools: Schema.Array(
            Schema.Struct({ name: Schema.String, inputSchema: Schema.Json })
          ),
        }),
      })
    )(await response.json());
    const catalogResponse = await handleServices(
      context.services,
      context.session,
      callerFor(context),
      new Request("https://froggy.example/api/services")
    );
    const catalog = Schema.decodeUnknownSync(ServiceCatalog)(
      await catalogResponse.json()
    );
    for (const operation of OPERATIONS) {
      const tool = list.result.tools.find(
        (entry) => entry.name === `froggy_${operation}`
      );
      const schema = Schema.decodeUnknownSync(
        Schema.Struct({
          type: Schema.Literals(["object"]),
          properties: Schema.Record(Schema.String, Schema.Json),
        })
      )(tool?.inputSchema);
      expect(Object.keys(schema.properties).toSorted()).toEqual([
        "idempotencyKey",
        "input",
      ]);
      const card = catalog.services.find((entry) => entry.name === operation);
      expect(card?.status).toBe("demo");
      expect(card?.inputKind).toBe("structured");
      expect(card?.networks).toContain(BASE);
      expect(Number(card?.priceUsdMicros)).toBe(
        environment.trading.prices[operation] ?? 0
      );
      expect(card?.inputSchema).toBeDefined();
    }
    expect(context.calls.payments).toBe(0);
  });

  it.each([...OPERATIONS])(
    "uses the same durable %s task across named MCP and HTTP retries",
    async (operation) => {
      const context = await fixture();
      const request = requestFor(operation);
      const ticket = await mcpTicket(
        await mcp(context, "tools/call", {
          name: `froggy_${operation}`,
          arguments: {
            idempotencyKey: request.idempotencyKey,
            input: request.input,
          },
        })
      );
      const result = await completed(context, ticket.id);
      const http = await httpRun(context, request);
      expect(http.status).toBe(202);
      const replay = Schema.decodeUnknownSync(ServiceTicket)(await http.json());
      expect(replay.id).toBe(ticket.id);
      expect(replay.data).toEqual(result.data);
      const status = await mcpTicket(
        await mcp(context, "tools/call", {
          name: "froggy_service_status",
          arguments: { id: ticket.id },
        })
      );
      expect(status.data).toEqual(result.data);
      expect(context.calls[operation]).toBe(1);
      expect(context.calls.payments).toBe(1);
    }
  );

  it("quotes without obtaining Privy transaction signers or expanding authority", async () => {
    const context = await fixture();
    const spies = [
      spyOn(context.services.privy, "signerFor"),
      spyOn(context.services.privy, "ownerEvmSigner"),
      spyOn(context.services.privy, "ownerSolanaSigner"),
      spyOn(context.services.privy, "grantAgent"),
    ];
    try {
      const ticket = await purchaseService(context, requestFor("quote_action"));
      const result = await completed(context, ticket.id);
      expect(result.status).toBe("done");
      expect(result.data?.operation).toBe("quote_action");
      expect(result.text).toContain("No trade was submitted");
      for (const signer of spies) {
        expect(signer).not.toHaveBeenCalled();
      }
    } finally {
      for (const signer of spies) {
        signer.mockRestore();
      }
    }
  });

  it("keeps a paid provider failure durable and never buys it again on retry", async () => {
    const context = await fixture();
    let attempts = 0;
    const services: Services = {
      ...context.services,
      trading: {
        ...context.services.trading,
        rpc: {
          read: async () => {
            attempts += 1;
            await Promise.resolve();
            throw new Error("RPC provider unavailable.");
          },
        },
      },
    };
    const request = requestFor("rpc_read");
    const ticket = await purchaseService({ ...context, services }, request);
    const result = await completed(context, ticket.id);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Paid task; not refunded");
    expect(result.saleId).not.toBeNull();
    expect(result.data).toBeUndefined();
    const retried = await purchaseService({ ...context, services }, request);
    expect(retried.id).toBe(ticket.id);
    expect(retried.status).toBe("failed");
    expect(attempts).toBe(1);
    expect(context.calls.payments).toBe(1);
    expect(context.session.history).toHaveLength(1);
  });
});

describe("paid launch watches", () => {
  it("purchases once across HTTP and MCP, strips internal state, and cancels without another payment", async () => {
    const context = await fixture();
    const request = requestFor("watch_launches", "fixed-watch");
    const first = await httpRun(context, request);
    const ticket = Schema.decodeUnknownSync(ServiceTicket)(await first.json());
    const done = await completed(context, ticket.id);
    expect(done.status).toBe("done");
    if (done.data?.operation !== "watch_launches") {
      throw new Error("Missing watch result");
    }
    const { id } = done.data.watch;
    expect(done.data.watch.maxPolls).toBe(2);
    expect(done.data.watch.stubbed).toBe(true);
    expect(done.data.watch).not.toHaveProperty("seen");
    expect(done.data.watch).not.toHaveProperty("connectionId");
    expect(done.data.watch).not.toHaveProperty("claimExpiresAt");
    await mcp(context, "tools/call", {
      name: "froggy_watch_launches",
      arguments: {
        input: request.input,
        idempotencyKey: request.idempotencyKey,
      },
    });
    expect(context.calls.payments).toBe(1);
    await context.services.launches.tick();
    const status = await mcp(context, "tools/call", {
      name: "froggy_watch_status",
      arguments: { watchId: id },
    });
    expect(await status.text()).toContain("pollsUsed");
    const cancelled = await handleServices(
      context.services,
      context.session,
      callerFor(context),
      new Request(`https://froggy.example/api/services/watches/${id}`, {
        method: "DELETE",
      })
    );
    expect(await cancelled.json()).toMatchObject({
      status: "cancelled",
      pollsUsed: 1,
    });
    await context.services.launches.tick();
    expect(context.calls.payments).toBe(1);
    const stopped = await context.services.launches.get(
      context.session.userId,
      id,
      null
    );
    expect(stopped.pollsUsed).toBe(1);
  });

  it("rejects capacity before charging and cannot accept trading authority in watch input", async () => {
    const context = await fixture();
    await Promise.all(
      Array.from({ length: 5 }, async () => {
        const started = await purchaseService(
          context,
          requestFor("watch_launches")
        );
        const done = await completed(context, started.id);
        expect(done.status).toBe("done");
      })
    );
    const failure = await purchaseService(
      context,
      requestFor("watch_launches")
    ).then(() => null, String);
    expect(failure).toContain("watch.capacity");
    expect(context.calls.payments).toBe(5);
    const request = requestFor("watch_launches");
    expect(() =>
      Schema.decodeUnknownSync(ServiceRequest)({
        ...request,
        input: { ...request.input, autoBuy: true },
      })
    ).toThrow();
  });
});
