import { describe, expect, test } from "bun:test";

import type { TradeInput } from "@froggy/domain";
import { Cause, ConfigProvider, Effect, Exit, Redacted } from "effect";

import { loadTradingEnvironment } from "./environment";
import { executionProviders } from "./trading/execution-providers";

const BASE = "eip155:8453";
const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const BIRDEYE_KEY = "test-birdeye-secret";
const UNISWAP_KEY = "test-uniswap-secret";
const RPC_TOKEN = "test-rpc-secret";
const RPC_URL = `https://rpc.invalid/${RPC_TOKEN}?api-key=${RPC_TOKEN}`;

const configured = {
  BIRDEYE_API_KEY: BIRDEYE_KEY,
  UNISWAP_API_KEY: UNISWAP_KEY,
  TRADING_RPC_ENDPOINTS: JSON.stringify({
    [BASE]: RPC_URL,
    [SOLANA]: "https://solana.invalid/rpc",
  }),
  TRADING_PRICES_USD_MICROS: JSON.stringify({
    market_search: 1,
    token_inspect: 12_000,
    rpc_read: 13_000,
    quote_action: 100_000_000,
  }),
  UNISWAP_CHAINS: JSON.stringify([
    { network: BASE, routerVersion: "2.1.1" },
    { network: "eip155:1", routerVersion: "2.0" },
  ]),
};

const load = async (values: Readonly<Record<string, string>> = {}) =>
  await Effect.runPromise(
    loadTradingEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(values)
      )
    )
  );

const failureFor = async (values: Readonly<Record<string, string>>) => {
  const result = await Effect.runPromiseExit(
    loadTradingEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(values)
      )
    )
  );
  if (!Exit.isFailure(result)) {
    throw new Error("Invalid configuration unexpectedly loaded.");
  }
  return `${Cause.pretty(result.cause)}\n${JSON.stringify(result)}`;
};

describe("trading environment", () => {
  test("defaults to no live prices or RPC endpoints and redacted placeholder keys", async () => {
    const result = await load();
    expect(result.prices).toEqual({});
    expect(result.rpcEndpoints).toEqual({});
    expect(Redacted.isRedacted(result.birdeyeApiKey)).toBe(true);
    expect(Redacted.isRedacted(result.uniswapApiKey)).toBe(true);
    expect(Redacted.value(result.birdeyeApiKey)).toBe("REPLACE_ME_BIRDEYE_KEY");
    expect(Redacted.value(result.uniswapApiKey)).toBe("REPLACE_ME_UNISWAP_KEY");
    expect(result.uniswapChains).toEqual([
      { network: BASE, routerVersion: "2.1.1" },
      { network: "eip155:84532", routerVersion: "2.1.1" },
      { network: "eip155:1", routerVersion: "2.1.1" },
      { network: "eip155:11155111", routerVersion: "2.1.1" },
    ]);
  });

  test("loads explicit prices and router versions while keeping credentials redacted", async () => {
    const result = await load(configured);
    expect(result.prices).toEqual({
      market_search: 1,
      token_inspect: 12_000,
      rpc_read: 13_000,
      quote_action: 100_000_000,
    });
    expect(result.uniswapChains).toEqual([
      { network: BASE, routerVersion: "2.1.1" },
      { network: "eip155:1", routerVersion: "2.0" },
    ]);
    expect(Redacted.value(result.birdeyeApiKey)).toBe(BIRDEYE_KEY);
    expect(Redacted.value(result.uniswapApiKey)).toBe(UNISWAP_KEY);
    expect(Object.keys(result.rpcEndpoints)).toEqual([BASE, SOLANA]);
    for (const [network, endpoint] of Object.entries(result.rpcEndpoints)) {
      expect(Redacted.isRedacted(endpoint)).toBe(true);
      expect(Redacted.value(endpoint)).toBe(
        network === BASE ? RPC_URL : "https://solana.invalid/rpc"
      );
    }
    const serialized = JSON.stringify(result);
    for (const secret of [BIRDEYE_KEY, UNISWAP_KEY, RPC_TOKEN, RPC_URL]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["oversized", 100_000_001],
    ["numeric string", "12000"],
    ["null", null],
  ] as const)("rejects a %s service price", async (_name, price) => {
    expect(
      await failureFor({
        TRADING_PRICES_USD_MICROS: JSON.stringify({ rpc_read: price }),
      })
    ).toContain("Invalid trading configuration.");
  });

  test("rejects unknown service names in the price table", async () => {
    expect(
      await failureFor({ TRADING_PRICES_USD_MICROS: '{"rpc_reads":12000}' })
    ).toContain("Invalid trading configuration.");
  });

  test.each([
    ["HTTP", "http://rpc.invalid/token"],
    ["WebSocket", "wss://rpc.invalid/token"],
    ["URL username", "https://user@rpc.invalid/token"],
    ["URL password", "https://user:password@rpc.invalid/token"],
    ["URL fragment", "https://rpc.invalid/token#fragment"],
    ["malformed URL", "rpc.invalid/token"],
  ] as const)("rejects an RPC endpoint with %s", async (_name, endpoint) => {
    expect(
      await failureFor({
        TRADING_RPC_ENDPOINTS: JSON.stringify({ [BASE]: endpoint }),
      })
    ).toContain("Invalid trading configuration.");
  });

  test.each([
    "ethereum:1",
    "eip155:0",
    "eip155:01",
    "eip155:12345678901",
    "solana:mainnet-beta",
  ])("rejects unsupported RPC network %s", async (network) => {
    expect(
      await failureFor({
        TRADING_RPC_ENDPOINTS: JSON.stringify({ [network]: RPC_URL }),
      })
    ).toContain("Invalid trading configuration.");
  });

  test("rejects more than sixteen RPC endpoints", async () => {
    const endpoints = Object.fromEntries(
      Array.from({ length: 17 }, (_, index) => [`eip155:${index + 1}`, RPC_URL])
    );
    expect(
      await failureFor({ TRADING_RPC_ENDPOINTS: JSON.stringify(endpoints) })
    ).toContain("Invalid trading configuration.");
  });

  test.each([
    [
      "duplicate networks",
      [
        { network: BASE, routerVersion: "2.0" },
        { network: BASE, routerVersion: "2.1.1" },
      ],
    ],
    ["unknown router version", [{ network: BASE, routerVersion: "latest" }]],
    ["Solana network", [{ network: SOLANA, routerVersion: "2.1.1" }]],
    [
      "more than sixteen chains",
      Array.from({ length: 17 }, (_, index) => ({
        network: `eip155:${index + 1}`,
        routerVersion: "2.1.1",
      })),
    ],
  ] as const)(
    "rejects Uniswap configuration with %s",
    async (_name, chains) => {
      expect(
        await failureFor({ UNISWAP_CHAINS: JSON.stringify(chains) })
      ).toContain("Invalid trading configuration.");
    }
  );

  test.each([
    ["RPC JSON syntax", "TRADING_RPC_ENDPOINTS", `{"${BASE}":"${RPC_URL}"`],
    [
      "RPC URL validation",
      "TRADING_RPC_ENDPOINTS",
      JSON.stringify({ [BASE]: `${RPC_URL}#fragment` }),
    ],
    [
      "price decoding",
      "TRADING_PRICES_USD_MICROS",
      JSON.stringify({ rpc_read: BIRDEYE_KEY }),
    ],
    [
      "router decoding",
      "UNISWAP_CHAINS",
      JSON.stringify([{ network: BASE, routerVersion: UNISWAP_KEY }]),
    ],
  ] as const)("hides credentials when %s fails", async (_name, key, value) => {
    const rendered = await failureFor({ ...configured, [key]: value });
    expect(rendered).toContain("Invalid trading configuration.");
    for (const secret of [BIRDEYE_KEY, UNISWAP_KEY, RPC_TOKEN, RPC_URL]) {
      expect(rendered).not.toContain(secret);
    }
  });
});

test("live rollup execution stays unavailable even with configured providers, while its fixture remains explicit", async () => {
  const input: TradeInput = {
    network: BASE,
    venue: "uniswap",
    action: "swap",
    wallet: "0x1111111111111111111111111111111111111111",
    tokenIn: "0x2222222222222222222222222222222222222222",
    tokenOut: "0x3333333333333333333333333333333333333333",
    amount: "100",
    maxNativeFee: "1000",
    slippageBps: 100,
    position: null,
  };
  const environment = await load({
    ...configured,
    TENDERLY_ACCESS_KEY: "test-key",
    TENDERLY_ACCOUNT: "account",
    TENDERLY_PROJECT: "project",
  });
  expect(environment.uniswapMode).toBe("live");
  expect(executionProviders(environment, true)(input)).toBeNull();
  const stub = await load();
  expect(executionProviders(stub, false)(input)?.stubbed).toBe(true);
});

test("Enso execution requires complete credentials and remains an explicit fixture otherwise", async () => {
  const input: TradeInput = {
    network: "eip155:1",
    venue: "enso",
    action: "deposit",
    wallet: "0x1111111111111111111111111111111111111111",
    tokenIn: "0x2222222222222222222222222222222222222222",
    tokenOut: "0x3333333333333333333333333333333333333333",
    position: "0x3333333333333333333333333333333333333333",
    amount: "100",
    slippageBps: 100,
    maxNativeFee: "10000",
  };
  expect(executionProviders(await load(), false)(input)?.stubbed).toBe(true);
  const partial = await load({ ENSO_API_KEY: "test-enso" });
  expect(partial.ensoMode).toBe("unavailable");
  expect(executionProviders(partial, true)(input)).toBeNull();
  const complete = await load({
    ENSO_API_KEY: "test-enso",
    TRADING_RPC_ENDPOINTS: JSON.stringify({ "eip155:1": RPC_URL }),
    TENDERLY_ACCESS_KEY: "test-tenderly",
    TENDERLY_ACCOUNT: "account",
    TENDERLY_PROJECT: "project",
  });
  expect(complete.ensoMode).toBe("live");
  expect(JSON.stringify(complete)).not.toContain("test-enso");
  expect(executionProviders(complete, true)(input)?.stubbed).toBe(false);
  expect(executionProviders(complete, false)(input)).toBeNull();
  expect(
    executionProviders(complete, true)({ ...input, action: "claim" })
  ).toBeNull();
});

test("Pump stays disabled with RPC alone and requires explicit activation plus live signing", async () => {
  const input: TradeInput = {
    network: SOLANA,
    venue: "pump",
    action: "swap",
    wallet: "11111111111111111111111111111111",
    tokenIn: "native",
    tokenOut: "So11111111111111111111111111111111111111112",
    amount: "1000",
    maxNativeFee: "10000",
    slippageBps: 100,
    position: null,
  };
  const rpc = { TRADING_RPC_ENDPOINTS: JSON.stringify({ [SOLANA]: RPC_URL }) };
  const disabled = await load(rpc);
  expect(disabled.pumpMode).toBe("unavailable");
  expect(executionProviders(disabled, true)(input)).toBeNull();
  const defaults = await load();
  expect(defaults.pumpMode).toBe("stub");
  expect(executionProviders(defaults, false)(input)?.stubbed).toBe(true);
  const missingRpc = await load({ PUMP_EXECUTION_ENABLED: "true" });
  expect(missingRpc.pumpMode).toBe("unavailable");
  const enabled = await load({ ...rpc, PUMP_EXECUTION_ENABLED: "true" });
  expect(enabled.pumpMode).toBe("live");
  expect(executionProviders(enabled, false)(input)).toBeNull();
  expect(executionProviders(enabled, true)(input)?.stubbed).toBe(false);
});

test("Pons requires explicit activation, simulation, RPC and a live wallet", async () => {
  const input: TradeInput = {
    network: "eip155:4663",
    venue: "pons",
    action: "swap",
    wallet: "0x1111111111111111111111111111111111111111",
    tokenIn: "0x2222222222222222222222222222222222222222",
    tokenOut: "0x3333333333333333333333333333333333333333",
    amount: "100",
    maxNativeFee: "10000",
    slippageBps: 100,
    position: null,
  };
  const defaults = await load();
  expect(defaults.ponsMode).toBe("stub");
  expect(executionProviders(defaults, false)(input)?.stubbed).toBe(true);
  const rpc = {
    TRADING_RPC_ENDPOINTS: JSON.stringify({ "eip155:4663": RPC_URL }),
  };
  const disabled = await load(rpc);
  const missingSimulation = await load({
    ...rpc,
    PONS_EXECUTION_ENABLED: "true",
  });
  expect(disabled.ponsMode).toBe("unavailable");
  expect(missingSimulation.ponsMode).toBe("unavailable");
  const enabled = await load({
    ...rpc,
    PONS_EXECUTION_ENABLED: "true",
    TENDERLY_ACCESS_KEY: "test-key",
    TENDERLY_ACCOUNT: "test-account",
    TENDERLY_PROJECT: "test-project",
  });
  expect(enabled.ponsMode).toBe("live");
  expect(executionProviders(enabled, false)(input)).toBeNull();
  expect(executionProviders(enabled, true)(input)?.stubbed).toBe(false);
});
