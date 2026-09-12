/**
 * Every environment variable, in one place, with a mode per integration.
 *
 * This is the module that makes "the build works before the keys arrive" true
 * rather than aspirational. Each external service has a placeholder default;
 * anything still holding its placeholder is in `stub` mode, and the factory for
 * that service returns its stub implementation. Nothing else in the codebase
 * branches on an environment variable — if it did, "is this real?" would have
 * as many answers as there are call sites.
 *
 * A stub is loud on purpose. `serviceModes` is published to the browser, the
 * wallet pane shows a chip per stubbed integration, and every receipt a stub
 * touches carries `stubbed: true`. A submission whose Graph data was faked and
 * whose UI did not say so would misrepresent the one thing the Graph track
 * judges, so it has to be impossible to do by accident.
 *
 * Secrets go through `Config.redacted` and are unwrapped only where they are
 * used, so a config dump or a log line cannot spill one.
 */

import { decodeUserId, KNOWN_ASSETS, knownAsset } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import {
  EVM_CHAIN_IDS,
  HBAR_ASSET,
  isEvmNetwork,
  isHederaNetwork,
  isSolanaNetwork,
  SOLANA_DEVNET,
} from "@froggy/payments";
import type {
  EvmNetwork,
  HederaNetwork,
  SolanaNetwork,
} from "@froggy/payments";
import { EvmTradingNetwork, TradingNetwork } from "@froggy/protocol";
import type {
  ServiceMode,
  ServiceModes,
  TradingServiceName,
} from "@froggy/protocol";
import { Config, Effect, Redacted, Result, Schema } from "effect";

import { PONS_NETWORK, SOLANA_MAINNET } from "./trading/networks";

/**
 * The placeholder values. A variable equal to its placeholder is *unset* as far
 * as this module is concerned — which is what makes a `.env.example` copied
 * verbatim behave identically to no `.env` at all, instead of producing a
 * confident client pointed at a nonsense key.
 */
const PLACEHOLDER = {
  anthropicApiKey: "sk-ant-REPLACE_ME",
  // Empty, not a plausible local URL: `postgres://…/froggy` is exactly what a
  // developer running Postgres locally would set, so using it as the
  // placeholder would make a real local database indistinguishable from none.
  databaseUrl: "",
  graphApiKey: "REPLACE_ME_GRAPH_STUDIO_KEY",
  birdeyeApiKey: "REPLACE_ME_BIRDEYE_KEY",
  uniswapApiKey: "REPLACE_ME_UNISWAP_KEY",
  goplusApiUrl: "REPLACE_ME_GOPLUS_URL",
  hederaAccountId: "0.0.0",
  hederaKek: "REPLACE_ME_HEDERA_KEK",
  hederaPrivateKey: "0xREPLACE_ME",
  privyAgentPolicyId: "REPLACE_ME_PRIVY_POLICY_ID",
  privyHederaPolicyId: "REPLACE_ME_PRIVY_HEDERA_POLICY_ID",
  privyAppId: "REPLACE_ME_PRIVY_APP_ID",
  privyAppSecret: "REPLACE_ME_PRIVY_APP_SECRET",
  privyAuthorizationKeyId: "REPLACE_ME_PRIVY_KEY_QUORUM_ID",
  privyAuthorizationPrivateKey: "REPLACE_ME_PRIVY_AUTHORIZATION_KEY",
  privyEarnVaultId: "REPLACE_ME_PRIVY_EARN_VAULT_ID",
  privyServicePayee: "0xREPLACE_ME_SERVICE_PAYEE",
  telegramBotToken: "REPLACE_ME_TELEGRAM_BOT_TOKEN",
  telegramWebhookSecret: "",
  treasuryEvmAddress: "0xREPLACE_ME_TREASURY",
  treasuryWalletId: "REPLACE_ME_TREASURY_WALLET_ID",
} as const;

/** The RPC named outright, else the older variable, else the public node for the network. */
const rpcUrlFor = (
  network: EvmNetwork,
  named: string,
  legacy: string
): string => {
  if (named !== "") {
    return named;
  }
  if (legacy !== "") {
    return legacy;
  }
  return network === "eip155:8453"
    ? "https://mainnet.base.org"
    : "https://sepolia.base.org";
};

const isPlaceholder = (value: string, placeholder: string): boolean =>
  value.trim() === "" || value.trim() === placeholder;

const modeOf = (
  ...pairs: readonly (readonly [string, string])[]
): ServiceMode =>
  pairs.every(([value, placeholder]) => !isPlaceholder(value, placeholder))
    ? "live"
    : "stub";

/**
 * Origins the WebSocket upgrade will accept.
 *
 * A WebSocket upgrade bypasses CORS entirely, and the browser socket types into
 * a Chrome logged into the user's sites — so this list is the only thing
 * standing between a hostile page and a remote-control handle on that browser.
 * It is built from configuration rather than hardcoded, because a hardcoded
 * port is how a preview deployment silently loses both sockets.
 *
 * The loopback pair is included so a local dev server on the same origin works
 * without configuration, whichever host name the developer typed.
 */
const allowedOrigins = (
  appOrigin: string,
  extra: string
): readonly string[] => {
  const listed = extra
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
  return [
    ...new Set([
      appOrigin,
      appOrigin.replace("localhost", "127.0.0.1"),
      appOrigin.replace("127.0.0.1", "localhost"),
      ...listed,
    ]),
  ];
};

const isLoopback = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};

/** Names that would attach a stub adapter. Empty means every integration is live or unavailable. */
export const stubbedNames = (
  modes: ServiceModes,
  trading: Pick<
    TradingEnvironment,
    "ensoMode" | "jupiterMode" | "ponsMode" | "pumpMode" | "uniswapMode"
  >
): readonly string[] => [
  ...Object.entries(modes).flatMap(([name, mode]) =>
    mode === "stub" ? [name] : []
  ),
  ...(
    [
      ["enso", trading.ensoMode],
      ["jupiter", trading.jupiterMode],
      ["pons", trading.ponsMode],
      ["pump", trading.pumpMode],
      ["uniswapExecution", trading.uniswapMode],
    ] as const
  ).flatMap(([name, mode]) => (mode === "stub" ? [name] : [])),
];

/**
 * A public origin that would still select a stub adapter is a fake settlement
 * waiting to be screenshotted. Loopback keeps the keyless demo and Playwright.
 */
export const refuseStubbedBoot = (
  appOrigin: string,
  names: readonly string[]
): void => {
  if (names.length === 0 || isLoopback(appOrigin)) {
    return;
  }
  throw new Error(
    `Refusing to boot with stub adapters on ${appOrigin}: ${names.join(", ")}.`
  );
};

const secret = (name: string, fallback: string) =>
  Config.redacted(name).pipe(Config.withDefault(Redacted.make(fallback)));

export type ModelProvider = "anthropic" | "openai-compatible" | "stub";

/**
 * Which model backs the agent.
 *
 * An OpenAI-compatible endpoint wins when all three of its variables are set,
 * because that is the provider this deployment runs on; Anthropic when its
 * key is real; otherwise the scripted model. Decided from placeholders, not
 * from the shape of a key: the earlier check was `startsWith("sk-ant-")`,
 * which the placeholder `sk-ant-REPLACE_ME` also satisfies — so configuring
 * only the compatible endpoint built an Anthropic client around a fake key and
 * every turn failed with a 401. A pure function so the table is testable.
 */
export const selectModelProvider = (input: {
  readonly anthropicApiKey: string;
  readonly openAiCompatibleApiKey: string;
  readonly openAiCompatibleBaseUrl: string;
  readonly openAiCompatibleModel: string;
}): ModelProvider => {
  const compatible = [
    input.openAiCompatibleApiKey,
    input.openAiCompatibleBaseUrl,
    input.openAiCompatibleModel,
  ].every((value) => value.trim() !== "");
  if (compatible) {
    return "openai-compatible";
  }
  if (!isPlaceholder(input.anthropicApiKey, PLACEHOLDER.anthropicApiKey)) {
    return "anthropic";
  }
  return "stub";
};

const TradingPrice = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(100_000_000)
);
const UniswapChain = Schema.Struct({
  network: EvmTradingNetwork,
  routerVersion: Schema.Literals(["2.0", "2.1.1"]),
});

export interface TradingEnvironment {
  readonly privySponsoredNetworks?: readonly string[];
  readonly uniswapMode: "live" | "stub" | "unavailable";
  readonly tenderly: {
    readonly accessKey: Redacted.Redacted;
    readonly account: string;
    readonly project: string;
  } | null;
  readonly confirmations: number;
  readonly ensoApiKey: Redacted.Redacted;
  readonly ensoMode: "live" | "stub" | "unavailable";
  readonly jupiterApiKey: Redacted.Redacted;
  readonly ponsMode: "live" | "stub" | "unavailable";
  readonly pumpMode: "live" | "stub" | "unavailable";
  readonly jupiterMode: "live" | "stub" | "unavailable";
  readonly birdeyeApiKey: Redacted.Redacted;
  readonly uniswapApiKey: Redacted.Redacted;
  /** Public GoPlus base URL; placeholder means stub. */
  readonly goplusApiUrl: string | null;
  readonly rpcEndpoints: Readonly<Record<string, Redacted.Redacted>>;
  readonly uniswapChains: readonly (typeof UniswapChain.Type)[];
  readonly prices: Readonly<
    Partial<Record<TradingServiceName, number | undefined>>
  >;
}

const researchMode = (live: boolean, stubs: boolean): "live" | "stub" =>
  live || !stubs ? "live" : "stub";
const optionalResearchKey = (
  key: Redacted.Redacted
): Redacted.Redacted | null => (Redacted.value(key).trim() === "" ? null : key);

export interface Environment {
  readonly email?:
    | {
        readonly domain: string;
        readonly workerUrl: string;
        readonly secret: Redacted.Redacted;
      }
    | undefined;
  readonly trading: TradingEnvironment;
  readonly xApiBearer: Redacted.Redacted;
  readonly supplierPayees: Readonly<Record<string, string>>;

  readonly anthropicApiKey: string;
  /** Trusted browser origins for WebSocket upgrades. See `ws-router.ts`. */
  readonly allowedOrigins: readonly string[];
  readonly appOrigin: string;
  /**
   * Loopback may attach stub adapters so a keyless laptop and Playwright still
   * boot. A public origin must not: missing config is unavailable or a refused
   * boot, never a fixture that could pass for settlement.
   */
  readonly allowStubs: boolean;
  /**
   * Whether the agent's Chrome refuses the private network. On everywhere the
   * app is not itself on a loopback address — which is to say, everywhere but
   * a developer's laptop, where the oracle page the agent must reach is on
   * `localhost`.
   */
  readonly blockPrivateNetwork: boolean;
  readonly databaseUrl: string;
  /** The JSON-RPC endpoint the host broadcasts signed Base Sepolia transactions to. */
  readonly evmRpcUrl: string;
  readonly researchMode: "stub" | "live";
  readonly pinaxApiKey: Redacted.Redacted | null;
  readonly graphMarketToken: Redacted.Redacted | null;
  readonly pinaxApiUrl: string;
  readonly polymarketGammaUrl: string;
  readonly polymarketClobUrl: string;
  readonly defiLlamaApiUrl: string;
  readonly defiLlamaYieldsUrl: string;
  readonly graphApiKey: string;
  readonly graphGatewayUrl: string;
  /**
   * Pay The Graph per query with x402 from the person's own wallet, when
   * the agent has a signer on it. Off by default: the Studio key serves the
   * same query for free, and a paid query is a receipt the person sees.
   */
  readonly graphPayPerQuery: boolean;
  /** The agent's pocket: the account a 402 is paid *from*. */
  readonly hederaAccountId: string;
  readonly hederaFacilitatorUrl: string;
  /**
   * Which Hedera this deployment pays and sells on. The team chose mainnet
   * for iteration 2; testnet stays the default so a checkout with no
   * configuration cannot sell anything for real money by accident.
   */
  readonly hederaNetwork: HederaNetwork;
  /**
   * What our own paid endpoints are priced in: `"0.0.0"` for native HBAR, or
   * an HTS token id. The facilitator accepts either.
   */
  readonly hederaAsset: string;
  /** The account our own paid endpoint is paid *to*. */
  readonly hederaPayTo: string;
  /** Where the HBAR/USD rate every cap is computed from comes from. */
  /** The HCS topic settlements are noted on. Empty: created at first use. */
  readonly hederaHcsTopicId: string;
  /**
   * Base64, 32 bytes: the key that seals each person's Hedera key at rest.
   * Null when unset, and then nobody gets an account of their own: every
   * Hedera payment is made from the host pocket, as before.
   */
  readonly hederaKek: string | null;
  /** Live Hedera and a KEK: people get accounts of their own, opened at first need. */
  readonly hederaAccounts: boolean;
  readonly hederaMirrorNodeUrl: string;
  readonly hederaPrivateKey: string;
  /** Kill a browser nobody is watching or driving after this long. */
  readonly browserIdleMs: number;
  readonly browserUseApiKey: string | null;
  readonly browserCountry: string | null;
  readonly browserModelInputRate: number;
  readonly browserModelOutputRate: number;
  /** The judge's account: always gets a seat. Null when nobody is reserved. */
  readonly demoUserId: UserId | null;
  /** Concurrent hosted browsers across all users. 0 means unlimited. */
  readonly maxBrowsers: number;
  /** Which model backs the agent. `modes.model` is derived from it. */
  readonly modelProvider: ModelProvider;
  /** Turns one person may start per UTC day. The demo account is exempt. */
  readonly modelRunsPerDay: number;
  /** Model steps one person may take per UTC day, across their turns. */
  readonly modelStepsPerDay: number;
  readonly modes: ServiceModes;
  /** An OpenAI-compatible endpoint: DashScope, a local server, anything with `/chat/completions`. */
  readonly openAiCompatibleApiKey: string;
  readonly openAiCompatibleBaseUrl: string;
  readonly openAiCompatibleModel: string;
  /**
   * What a person's Hedera pocket holds before any top-up, in USD millionths.
   * Testnet lunch money: enough for a few paid requests, credited once.
   */
  readonly pocketStartingUsdMicros: number;
  /**
   * Whether mandates carry caps, an expiry and an approval threshold. Off by
   * default: the first iteration is allowlists, provenance and Privy's policy;
   * limits return later as a setting. On for the browser tests of approvals.
   */
  readonly spendingLimits: boolean;
  /** Privy DIDs that start with `teamStartingUsdMicros` instead: the team and the demo account. */
  readonly startingCreditDids: readonly string[];
  readonly teamStartingUsdMicros: number;
  /**
   * Which Base the person's USDC lives on and top-ups move on. Mainnet or
   * Sepolia; the RPC must answer with the matching chain id, checked at boot.
   */
  readonly evmNetwork: EvmNetwork;
  readonly solanaNetwork: SolanaNetwork;
  readonly solanaRpcUrl: string;
  readonly evmChainId: number;
  readonly port: number;
  /**
   * The agent's Privy authorization key and the policy it signs under.
   *
   * Null when any of the three is unset. Sign-in still works without it — the
   * user gets a wallet, the agent just cannot be granted a signature on it —
   * which is why this is nullable rather than part of the privy mode.
   */
  readonly privyAgent: {
    readonly policyId: string;
    readonly privateKey: string;
    readonly quorumId: string;
  } | null;
  readonly privyAppId: string;
  readonly privyAppSecret: string;
  /**
   * The policy for people's Hedera keys held by Privy as cosmos-type wallets
   * (one `ALLOW *` rule: raw bytes take no conditions). Null means Froggy
   * seals the keys itself under `HEDERA_KEK` instead.
   */
  readonly privyHederaPolicyId: string | null;
  /** Seats held back for the demo account while it is not using one. */
  readonly reservedBrowsers: number;
  /** The bot's @username, for the pairing deep link. Empty until set. */
  readonly telegramBotUsername: string;
  readonly telegramBotToken: string;
  readonly telegramWebhookSecret: string;
  /** Where the SPA build lives in production. Empty means "dev, Vite serves it". */
  readonly staticDirectory: string;
  /**
   * Where a top-up sends the person's USDC on Base Sepolia, or null until
   * configured. The pocket is credited against what lands here; the policy
   * names the same address, so a transfer anywhere else is refused by Privy.
   */
  readonly treasuryEvmAddress: string | null;
  /**
   * What a person's own Privy policy is pinned to, or null while it is not
   * configured.
   *
   * Null is a real state and not a failure: with no payee to pin, a person's
   * policy would carry no rules, and a policy with no rules is a wallet the
   * agent cannot sign for at all. The mint refuses instead, the person stays on
   * the app-wide policy, and the pane says which one they are on.
   */
  /**
   * Whether a person's own policy is owned by them rather than by our app
   * secret.
   *
   * Owned by them is the design: the rules holding their agent stop being ours
   * to widen. It is a variable rather than a constant so it can be turned off
   * in one place if Privy will not let their key edit what our secret cannot —
   * in which case Change and Extend would be buttons nobody can press.
   */
  readonly privyPersonOwnedPolicies: boolean;
  readonly personPolicyPins: {
    readonly chainId: string;
    readonly servicePayee: string;
    readonly treasury: string;
    readonly usdc: string;
    readonly vaultId: string | null;
  } | null;
  /**
   * The treasury as a Privy wallet the agent key may sign for, when it is
   * one: the address above plus its wallet id. Null when either is unset
   * or no agent key exists, and then Froggy pays nothing upstream itself.
   */
  readonly treasuryWallet: {
    readonly address: string;
    readonly id: string;
  } | null;
}

const configuredSolanaNetwork = (network: string): SolanaNetwork => {
  if (!isSolanaNetwork(network)) {
    throw new Error(
      `Unsupported SOLANA_NETWORK ${network}. Use the Solana mainnet or devnet CAIP identifier.`
    );
  }
  return network;
};

const executionModeFor = (input: {
  readonly providerLive: boolean;
  readonly tenderly: TradingEnvironment["tenderly"];
  readonly rpcCount: number;
  readonly tenderlyKeySet: boolean;
}): TradingEnvironment["uniswapMode"] => {
  if (input.providerLive && input.tenderly !== null && input.rpcCount > 0) {
    return "live";
  }
  if (!input.providerLive && !input.tenderlyKeySet && input.rpcCount === 0) {
    return "stub";
  }
  return "unavailable";
};

const jupiterModeFor = (
  key: boolean,
  rpc: boolean
): TradingEnvironment["jupiterMode"] => {
  if (key && rpc) {
    return "live";
  }
  return !key && !rpc ? "stub" : "unavailable";
};

const nativeLaunchModeFor = (
  enabled: boolean,
  rpc: boolean
): TradingEnvironment["pumpMode"] => {
  if (!enabled && !rpc) {
    return "stub";
  }
  return enabled && rpc ? "live" : "unavailable";
};

/** Public origins never advertise a simulated Pump/Pons venue. */
const demoteStub = <M extends "live" | "stub" | "unavailable">(
  mode: M,
  allowStubs: boolean
): M | "unavailable" => (!allowStubs && mode === "stub" ? "unavailable" : mode);

export const loadTradingEnvironment = Effect.fn("loadTradingEnvironment")(
  function* loadTradingEnvironment() {
    const birdeyeApiKey = yield* secret(
      "BIRDEYE_API_KEY",
      PLACEHOLDER.birdeyeApiKey
    );
    const uniswapApiKey = yield* secret(
      "UNISWAP_API_KEY",
      PLACEHOLDER.uniswapApiKey
    );
    const goplusApiUrlRaw = yield* Config.string("GOPLUS_API_URL").pipe(
      Config.withDefault(PLACEHOLDER.goplusApiUrl)
    );
    const goplusApiUrl = isPlaceholder(
      goplusApiUrlRaw,
      PLACEHOLDER.goplusApiUrl
    )
      ? null
      : goplusApiUrlRaw.replace(/\/$/u, "");
    const jupiterApiKey = yield* secret(
      "JUPITER_API_KEY",
      "REPLACE_ME_JUPITER_API_KEY"
    );
    const ponsEnabled = yield* Config.boolean("PONS_EXECUTION_ENABLED").pipe(
      Config.withDefault(false)
    );
    const pumpEnabled = yield* Config.boolean("PUMP_EXECUTION_ENABLED").pipe(
      Config.withDefault(false)
    );
    const ensoApiKey = yield* secret("ENSO_API_KEY", "REPLACE_ME_ENSO_API_KEY");
    const tenderlyAccessKey = yield* secret(
      "TENDERLY_ACCESS_KEY",
      "REPLACE_ME_TENDERLY_ACCESS_KEY"
    );
    const tenderlyAccount = yield* Config.string("TENDERLY_ACCOUNT").pipe(
      Config.withDefault("")
    );
    const tenderlyProject = yield* Config.string("TENDERLY_PROJECT").pipe(
      Config.withDefault("")
    );
    const confirmations = yield* Config.int("TRADING_CONFIRMATIONS").pipe(
      Config.withDefault(2)
    );
    if (confirmations < 1 || confirmations > 100) {
      throw new Error("TRADING_CONFIRMATIONS must be between 1 and 100.");
    }
    const tenderlyKeySet =
      Redacted.value(tenderlyAccessKey) !== "REPLACE_ME_TENDERLY_ACCESS_KEY" &&
      Redacted.value(tenderlyAccessKey).trim() !== "";
    const tenderly =
      tenderlyKeySet &&
      /^[a-zA-Z0-9_-]{1,128}$/u.test(tenderlyAccount) &&
      /^[a-zA-Z0-9_-]{1,128}$/u.test(tenderlyProject)
        ? {
            accessKey: tenderlyAccessKey,
            account: tenderlyAccount,
            project: tenderlyProject,
          }
        : null;
    const privySponsoredRaw = yield* Config.string(
      "PRIVY_SPONSORED_NETWORKS"
    ).pipe(Config.withDefault("[]"));
    const privySponsoredNetworks = Schema.decodeUnknownSync(
      Schema.Array(Schema.Literals(["eip155:8453", "eip155:84532"])).check(
        Schema.isMaxLength(2)
      )
    )(JSON.parse(privySponsoredRaw));
    const tradingRpcRaw = yield* secret("TRADING_RPC_ENDPOINTS", "{}");
    const tradingPricesRaw = yield* Config.string(
      "TRADING_PRICES_USD_MICROS"
    ).pipe(Config.withDefault("{}"));
    const uniswapChainsRaw = yield* Config.string("UNISWAP_CHAINS").pipe(
      Config.withDefault(
        `[{"network":"eip155:8453","routerVersion":"2.0"},{"network":"eip155:84532","routerVersion":"2.0"},{"network":"eip155:1","routerVersion":"2.0"},{"network":"eip155:11155111","routerVersion":"2.0"},{"network":"${PONS_NETWORK}","routerVersion":"2.1.1"}]`
      )
    );
    const rpcEndpoints: Record<string, Redacted.Redacted> = {};
    let uniswapChains: TradingEnvironment["uniswapChains"];
    let prices: TradingEnvironment["prices"];
    try {
      const endpoints = Schema.decodeUnknownSync(
        Schema.Record(Schema.String, Schema.String)
      )(JSON.parse(Redacted.value(tradingRpcRaw)));
      if (Object.keys(endpoints).length > 16) {
        throw new Error("Too many RPC endpoints.");
      }
      for (const [network, endpoint] of Object.entries(endpoints)) {
        Schema.decodeUnknownSync(TradingNetwork)(network);
        const url = new URL(endpoint);
        if (
          url.protocol !== "https:" ||
          url.username !== "" ||
          url.password !== "" ||
          url.hash !== ""
        ) {
          throw new Error("Invalid RPC endpoint.");
        }
        rpcEndpoints[network] = Redacted.make(url.toString());
      }
      uniswapChains = Schema.decodeUnknownSync(
        Schema.Array(UniswapChain).check(Schema.isMaxLength(16))
      )(JSON.parse(uniswapChainsRaw));
      if (
        new Set(uniswapChains.map((chain) => chain.network)).size !==
        uniswapChains.length
      ) {
        throw new Error("Duplicate Uniswap chain.");
      }
      prices = Schema.decodeUnknownSync(
        Schema.Struct({
          market_search: Schema.optional(TradingPrice),
          token_inspect: Schema.optional(TradingPrice),
          rpc_read: Schema.optional(TradingPrice),
          quote_action: Schema.optional(TradingPrice),
          watch_launches: Schema.optional(TradingPrice),
          token_research: Schema.optional(TradingPrice),
        }),
        { onExcessProperty: "error" }
      )(JSON.parse(tradingPricesRaw));
    } catch {
      // A decoder issue can include the input. Credential-bearing RPC URLs must never reach logs.
      throw new Error(
        "Invalid trading configuration. Use HTTPS RPC endpoints keyed by network, unique Uniswap chains with router versions 2.0 or 2.1.1, and positive integer service prices in USD micros."
      );
    }
    const uniswapLive =
      modeOf([Redacted.value(uniswapApiKey), PLACEHOLDER.uniswapApiKey]) ===
      "live";
    const uniswapMode = executionModeFor({
      providerLive: uniswapLive,
      tenderly,
      rpcCount: Object.keys(rpcEndpoints).length,
      tenderlyKeySet,
    });
    const jupiterLive =
      modeOf([Redacted.value(jupiterApiKey), "REPLACE_ME_JUPITER_API_KEY"]) ===
      "live";
    const solanaRpc = rpcEndpoints[SOLANA_MAINNET] !== undefined;
    const jupiterMode = jupiterModeFor(jupiterLive, solanaRpc);
    const ensoMode = executionModeFor({
      providerLive:
        modeOf([Redacted.value(ensoApiKey), "REPLACE_ME_ENSO_API_KEY"]) ===
        "live",
      tenderly,
      rpcCount: rpcEndpoints["eip155:1"] === undefined ? 0 : 1,
      tenderlyKeySet,
    });
    return {
      ensoApiKey,
      ensoMode,
      jupiterApiKey,
      jupiterMode,
      pumpMode: nativeLaunchModeFor(pumpEnabled, solanaRpc),
      ponsMode:
        ponsEnabled && tenderly === null
          ? "unavailable"
          : nativeLaunchModeFor(
              ponsEnabled,
              rpcEndpoints[PONS_NETWORK] !== undefined
            ),
      uniswapMode,
      privySponsoredNetworks,
      tenderly,
      confirmations,
      birdeyeApiKey,
      uniswapApiKey,
      goplusApiUrl,
      rpcEndpoints,
      uniswapChains,
      prices,
    };
  }
);

const tradingModes = (trading: TradingEnvironment) => ({
  birdeye: modeOf([
    Redacted.value(trading.birdeyeApiKey),
    PLACEHOLDER.birdeyeApiKey,
  ]),
  uniswap: modeOf([
    Redacted.value(trading.uniswapApiKey),
    PLACEHOLDER.uniswapApiKey,
  ]),
  goplus: trading.goplusApiUrl === null ? ("stub" as const) : ("live" as const),
  quicknode:
    Object.keys(trading.rpcEndpoints).length > 0
      ? ("live" as const)
      : ("stub" as const),
});

const loadBrowserConfiguration = Effect.fn("loadBrowserConfiguration")(
  function* loadBrowserConfiguration() {
    const browserUseSecret = yield* secret(
      "BROWSER_USE_API_KEY",
      "REPLACE_ME_BROWSER_USE_KEY"
    );
    const browserUseValue = Redacted.value(browserUseSecret);
    const browserUseApiKey = isPlaceholder(
      browserUseValue,
      "REPLACE_ME_BROWSER_USE_KEY"
    )
      ? null
      : browserUseValue;
    const country = yield* Config.string("BROWSER_COUNTRY").pipe(
      Config.withDefault("us")
    );
    const browserCountry = country === "none" ? null : country;
    const browserModelInputRate = yield* Config.number(
      "BROWSER_MODEL_INPUT_USD_PER_MILLION"
    ).pipe(Config.withDefault(0));
    const browserModelOutputRate = yield* Config.number(
      "BROWSER_MODEL_OUTPUT_USD_PER_MILLION"
    ).pipe(Config.withDefault(0));
    // No provider key, no browser: the pane refuses to open one and says so,
    // rather than showing a page nobody is hosting.
    const browserMode: ServiceMode =
      browserUseApiKey === null ? "stub" : "live";
    return {
      browserUseApiKey,
      browserCountry,
      browserModelInputRate,
      browserModelOutputRate,
      browserMode,
    };
  }
);

/**
 * What a person's own policy is pinned to, or null when it is not configured.
 *
 * Null is a real state rather than a failure: with no payee to pin, a person's
 * policy would carry no rules, and a policy with no rules is a wallet the agent
 * cannot sign for at all. Everyone stays on the app-wide policy until both a
 * payee and a treasury exist.
 */
const personPolicyPins = (input: {
  readonly evmNetwork: EvmNetwork;
  readonly privyEarnVaultId: string;
  readonly privyServicePayee: string;
  readonly treasuryEvmAddress: string;
}): Environment["personPolicyPins"] => {
  if (
    isPlaceholder(input.privyServicePayee, PLACEHOLDER.privyServicePayee) ||
    isPlaceholder(input.treasuryEvmAddress, PLACEHOLDER.treasuryEvmAddress)
  ) {
    return null;
  }
  const vaultConfigured = !isPlaceholder(
    input.privyEarnVaultId,
    PLACEHOLDER.privyEarnVaultId
  );
  return {
    // Decimal, because that is what Privy compares against: a number here
    // matches nothing and refuses everything, quietly.
    chainId: String(EVM_CHAIN_IDS[input.evmNetwork]),
    servicePayee: input.privyServicePayee,
    treasury: input.treasuryEvmAddress,
    usdc: KNOWN_ASSETS[`${input.evmNetwork}:usdc`].id,
    vaultId: vaultConfigured ? input.privyEarnVaultId : null,
  };
};

/**
 * Refuse a `HEDERA_ASSET` this build cannot price, and refuse a token whose
 * decimals do not match the price that was written for HBAR.
 *
 * The price lives in `oracle-route.ts` as a number of smallest units. HBAR has
 * eight decimals and Hedera's USDC has six, so the same literal is two
 * different amounts of money — and a deployment that flipped the asset alone
 * would sell at roughly five hundred times the intended price with nothing
 * anywhere saying so. Pricing in a token is supported; doing it by accident is
 * not.
 */
const assertPriceableAsset = (asset: string, network: HederaNetwork): void => {
  const known = knownAsset(asset, network);
  if (known === undefined) {
    throw new Error(
      `HEDERA_ASSET is ${asset}, which is not an asset this build knows how to price on ${network}. Use 0.0.0 for HBAR, or add the token to KNOWN_ASSETS with its decimals.`
    );
  }
  if (known.id !== HBAR_ASSET) {
    throw new Error(
      `HEDERA_ASSET is ${asset} (${known.symbol}, ${known.decimals} decimals) while the price is written in tinybars. Set the price for ${known.symbol} in apps/server/src/oracle-route.ts before selling in it, and remove this check when the two are read from one place.`
    );
  }
};

const loadEmailEnvironment = Effect.fn("loadEmailEnvironment")(
  function* loadEmailEnvironment() {
    const emailDomain = yield* Config.string("EMAIL_DOMAIN").pipe(
      Config.withDefault("")
    );
    const emailWorkerUrl = yield* Config.string("EMAIL_WORKER_URL").pipe(
      Config.withDefault("")
    );
    const emailSecret = yield* secret("EMAIL_WEBHOOK_SECRET", "");
    if (
      (emailDomain || emailWorkerUrl || Redacted.value(emailSecret)) &&
      (!/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(emailDomain) ||
        !emailWorkerUrl.startsWith("https://") ||
        Redacted.value(emailSecret).length < 32)
    ) {
      throw new Error(
        "Email needs a domain, HTTPS Worker URL, and at least a 32-character webhook secret."
      );
    }
    return emailDomain
      ? { domain: emailDomain, workerUrl: emailWorkerUrl, secret: emailSecret }
      : undefined;
  }
);

export const loadEnvironment = Effect.fn("loadEnvironment")(
  function* loadEnvironment() {
    const email = yield* loadEmailEnvironment();
    const port = yield* Config.number("PORT").pipe(Config.withDefault(3001));
    const appOrigin = yield* Config.string("APP_ORIGIN").pipe(
      Config.withDefault("http://localhost:3000")
    );
    // Extra origins the sockets will accept, comma-separated. Needed whenever
    // the page is served from somewhere other than `APP_ORIGIN` — a second dev
    // port, a preview deployment, a phone on the same network.
    const extraOrigins = yield* Config.string("EXTRA_ORIGINS").pipe(
      Config.withDefault("")
    );
    const staticDirectory = yield* Config.string("STATIC_DIR").pipe(
      Config.withDefault("")
    );
    // One provider browser per signed-in user, eight at a time by default.
    // The cap is now about money and the provider's concurrency limit rather
    // than this box's memory: every seated browser bills by the hour, and a
    // free Browser Use project allows ten at once. A link that gets shared
    // widely queues instead of opening browsers nobody asked to pay for. One
    // of the eight is held for the demo account, so a judge never waits behind
    // testers. All three are variables rather than code so they can be moved
    // under load.
    const maxBrowsers = yield* Config.number("MAX_BROWSERS").pipe(
      Config.withDefault(8)
    );
    const reservedBrowsers = yield* Config.number("RESERVED_BROWSERS").pipe(
      Config.withDefault(1)
    );
    const {
      browserUseApiKey,
      browserCountry,
      browserModelInputRate,
      browserModelOutputRate,
      browserMode,
    } = yield* loadBrowserConfiguration();
    const browserIdleMs = yield* Config.number("BROWSER_IDLE_MS").pipe(
      Config.withDefault(10 * 60 * 1000)
    );
    const demoUserDid = yield* Config.string("DEMO_USER_DID").pipe(
      Config.withDefault("")
    );
    const demoUser = decodeUserId(demoUserDid);
    const demoUserId = Result.isSuccess(demoUser) ? demoUser.success : null;
    const databaseUrl = yield* secret("DATABASE_URL", PLACEHOLDER.databaseUrl);

    const privyAppId = yield* Config.string("PRIVY_APP_ID").pipe(
      Config.withDefault(PLACEHOLDER.privyAppId)
    );
    const privyAppSecret = yield* secret(
      "PRIVY_APP_SECRET",
      PLACEHOLDER.privyAppSecret
    );

    const privyAuthorizationKeyId = yield* Config.string(
      "PRIVY_AUTHORIZATION_KEY_ID"
    ).pipe(Config.withDefault(PLACEHOLDER.privyAuthorizationKeyId));
    const privyAuthorizationPrivateKey = yield* secret(
      "PRIVY_AUTHORIZATION_PRIVATE_KEY",
      PLACEHOLDER.privyAuthorizationPrivateKey
    );
    const privyAgentPolicyId = yield* Config.string(
      "PRIVY_AGENT_POLICY_ID"
    ).pipe(Config.withDefault(PLACEHOLDER.privyAgentPolicyId));

    const graphMarketToken = yield* secret("GRAPH_MARKET_TOKEN", "");
    const pinaxKey = yield* secret("PINAX_API_KEY", "");
    const pinaxApiUrl = yield* Config.string("PINAX_API_URL").pipe(
      Config.withDefault("https://api.pinax.network")
    );
    const polymarketGammaUrl = yield* Config.string(
      "POLYMARKET_GAMMA_URL"
    ).pipe(Config.withDefault("https://gamma-api.polymarket.com"));
    const polymarketClobUrl = yield* Config.string("POLYMARKET_CLOB_URL").pipe(
      Config.withDefault("https://clob.polymarket.com")
    );
    const defiLlamaApiUrl = yield* Config.string("DEFILLAMA_API_URL").pipe(
      Config.withDefault("https://api.llama.fi")
    );
    const defiLlamaYieldsUrl = yield* Config.string(
      "DEFILLAMA_YIELDS_URL"
    ).pipe(Config.withDefault("https://yields.llama.fi"));
    const liveResearch = yield* Config.boolean("RESEARCH_LIVE").pipe(
      Config.withDefault(false)
    );
    const graphApiKey = yield* secret("GRAPH_API_KEY", PLACEHOLDER.graphApiKey);
    const graphGatewayUrl = yield* Config.string("GRAPH_GATEWAY_URL").pipe(
      Config.withDefault("https://gateway.thegraph.com/api")
    );
    const graphPayPerQuery = yield* Config.boolean("GRAPH_PAY_PER_QUERY").pipe(
      Config.withDefault(false)
    );

    const hederaAccountId = yield* Config.string("HEDERA_ACCOUNT_ID").pipe(
      Config.withDefault(PLACEHOLDER.hederaAccountId)
    );
    const hederaPrivateKey = yield* secret(
      "HEDERA_PRIVATE_KEY",
      PLACEHOLDER.hederaPrivateKey
    );
    // Defaults to the pocket, so a single-account setup still works — but a
    // service paying itself is a demo of nothing, and the settlement is only
    // visible on a mirror node if the HBAR actually moves between two
    // accounts. Two accounts is the shape worth showing.
    const hederaKek = yield* secret("HEDERA_KEK", PLACEHOLDER.hederaKek);
    const hederaHcsTopicId = yield* Config.string("HEDERA_HCS_TOPIC_ID").pipe(
      Config.withDefault("")
    );
    const hederaPayTo = yield* Config.string("HEDERA_PAY_TO").pipe(
      Config.withDefault("")
    );
    // What the services are priced in. `0.0.0` is native HBAR; an HTS token
    // id prices in that token instead. The facilitator was verified on
    // 10 Sep 2026 to accept an HTS asset, so this is a real switch and not a
    // placeholder — but a buyer holding HBAR does not necessarily hold a
    // token, so the default stays where a stranger can reach it.
    const hederaAsset = yield* Config.string("HEDERA_ASSET").pipe(
      Config.withDefault("0.0.0")
    );
    const hederaNetworkRaw = yield* Config.string("HEDERA_NETWORK").pipe(
      Config.withDefault("hedera:testnet")
    );
    if (!isHederaNetwork(hederaNetworkRaw)) {
      // Fail closed: a typo here would sell on the wrong network.
      throw new Error(
        `HEDERA_NETWORK must be hedera:testnet or hedera:mainnet, not ${hederaNetworkRaw}`
      );
    }
    const hederaNetwork: HederaNetwork = hederaNetworkRaw;
    // Fail closed here too, and for a sharper reason than a typo. The price is
    // a number of the asset's own smallest units, so changing the asset
    // without changing the price silently changes what is charged: the 5000000
    // that is 0.05 HBAR is 5 USDC at six decimals, about five hundred times
    // more. Nothing downstream can tell those apart, so the check is here,
    // once, before anything is sold.
    assertPriceableAsset(hederaAsset, hederaNetwork);
    // The facilitator host follows the network unless told otherwise, so
    // switching networks is one variable, not two that can disagree.
    const hederaFacilitatorUrl = yield* Config.string(
      "HEDERA_FACILITATOR_URL"
    ).pipe(
      Config.withDefault(
        hederaNetwork === "hedera:mainnet"
          ? "https://api.blocky402.com"
          : "https://api.testnet.blocky402.com"
      )
    );
    const hederaMirrorNodeUrl = yield* Config.string(
      "HEDERA_MIRROR_NODE_URL"
    ).pipe(Config.withDefault("https://mainnet-public.mirrornode.hedera.com"));

    // `EVM_RPC_URL` first; `BASE_SEPOLIA_RPC_URL` is the older name a
    // deployment may still carry. The default follows EVM_NETWORK.
    const legacyRpcUrl = yield* Config.string("BASE_SEPOLIA_RPC_URL").pipe(
      Config.withDefault("")
    );
    const evmRpcUrlRaw = yield* Config.string("EVM_RPC_URL").pipe(
      Config.withDefault("")
    );
    const startingCreditDidsRaw = yield* Config.string(
      "STARTING_CREDIT_DIDS"
    ).pipe(Config.withDefault(""));
    const teamStartingUsd = yield* Config.number("TEAM_STARTING_USD").pipe(
      Config.withDefault(1)
    );
    const evmNetworkRaw = yield* Config.string("EVM_NETWORK").pipe(
      Config.withDefault("eip155:84532")
    );
    if (!isEvmNetwork(evmNetworkRaw)) {
      // Fail closed, like HEDERA_NETWORK: a typo here would move USDC on the wrong chain.
      throw new Error(
        `EVM_NETWORK must be eip155:8453 or eip155:84532, not ${evmNetworkRaw}`
      );
    }
    const evmNetwork: EvmNetwork = evmNetworkRaw;
    const solanaNetworkRaw = yield* Config.string("SOLANA_NETWORK").pipe(
      Config.withDefault(SOLANA_DEVNET)
    );
    const solanaNetwork = configuredSolanaNetwork(solanaNetworkRaw);
    const solanaRpcUrl = yield* Config.string("SOLANA_RPC_URL").pipe(
      Config.withDefault("")
    );
    const evmRpcUrl = rpcUrlFor(evmNetwork, evmRpcUrlRaw, legacyRpcUrl);
    const pocketStartingUsd = yield* Config.number("POCKET_STARTING_USD").pipe(
      Config.withDefault(0.5)
    );
    const spendingLimits = yield* Config.boolean("SPENDING_LIMITS").pipe(
      Config.withDefault(false)
    );
    const treasuryEvmAddress = yield* Config.string(
      "TREASURY_EVM_ADDRESS"
    ).pipe(Config.withDefault(PLACEHOLDER.treasuryEvmAddress));
    const privyHederaPolicyId = yield* Config.string(
      "PRIVY_HEDERA_POLICY_ID"
    ).pipe(Config.withDefault(PLACEHOLDER.privyHederaPolicyId));
    const treasuryWalletId = yield* Config.string("TREASURY_WALLET_ID").pipe(
      Config.withDefault(PLACEHOLDER.treasuryWalletId)
    );
    const privyServicePayee = yield* Config.string(
      "PRIVY_PERSON_SERVICE_PAYEE"
    ).pipe(Config.withDefault(PLACEHOLDER.privyServicePayee));
    const privyEarnVaultId = yield* Config.string("PRIVY_EARN_VAULT_ID").pipe(
      Config.withDefault(PLACEHOLDER.privyEarnVaultId)
    );
    // Off unless asked for: minting a policy nobody can edit is worse than
    // minting one we can, so this turns on deliberately and turns off in one
    // variable.
    const privyPersonOwnedPolicies = yield* Config.boolean(
      "PRIVY_PERSON_OWNED_POLICIES"
    ).pipe(Config.withDefault(false));

    const anthropicApiKey = yield* secret(
      "ANTHROPIC_API_KEY",
      PLACEHOLDER.anthropicApiKey
    );
    const openAiCompatibleApiKey = yield* secret(
      "OPENAI_COMPATIBLE_API_KEY",
      ""
    );
    const openAiCompatibleBaseUrl = yield* Config.string(
      "OPENAI_COMPATIBLE_BASE_URL"
    ).pipe(Config.withDefault(""));
    const openAiCompatibleModel = yield* Config.string(
      "OPENAI_COMPATIBLE_MODEL"
    ).pipe(Config.withDefault(""));

    // The model key is the one credential a stranger can spend without
    // moving money. Forty turns and four hundred steps a day is an afternoon
    // of real use and a bounded loss from a shared link.
    const modelRunsPerDay = yield* Config.number("MODEL_RUNS_PER_DAY").pipe(
      Config.withDefault(40)
    );
    const modelStepsPerDay = yield* Config.number("MODEL_STEPS_PER_DAY").pipe(
      Config.withDefault(400)
    );

    const anthropicKey = Redacted.value(anthropicApiKey);
    const compatibleKey = Redacted.value(openAiCompatibleApiKey);
    const modelProvider = selectModelProvider({
      anthropicApiKey: anthropicKey,
      openAiCompatibleApiKey: compatibleKey,
      openAiCompatibleBaseUrl,
      openAiCompatibleModel,
    });

    const telegramBotToken = yield* secret(
      "TELEGRAM_BOT_TOKEN",
      PLACEHOLDER.telegramBotToken
    );
    const telegramWebhookSecret = yield* secret(
      "TELEGRAM_WEBHOOK_SECRET_TOKEN",
      PLACEHOLDER.telegramWebhookSecret
    );
    const telegramBotUsername = yield* Config.string(
      "TELEGRAM_BOT_USERNAME"
    ).pipe(Config.withDefault(""));

    const xApiBearer = yield* secret("X_API_BEARER_TOKEN", "");
    const supplierPayeesRaw = yield* Config.string(
      "SERVICE_SUPPLIER_PAYEES"
    ).pipe(Config.withDefault(""));
    const supplierPayees: Record<string, string> = {};
    for (const entry of supplierPayeesRaw.split(",").filter(Boolean)) {
      const [host, payee] = entry.trim().split("=");
      if (
        (host !== "blockrun.ai" && host !== "api.you.com") ||
        payee === undefined ||
        payee === "" ||
        !/^0x[0-9a-fA-F]{40}$/u.test(payee)
      ) {
        throw new Error(
          "SERVICE_SUPPLIER_PAYEES must contain supported host=EVM-address pairs."
        );
      }
      supplierPayees[host] = payee;
    }
    const loadedTrading = yield* loadTradingEnvironment();
    const allowStubs = isLoopback(appOrigin);
    const trading = {
      ...loadedTrading,
      ponsMode: demoteStub(loadedTrading.ponsMode, allowStubs),
      pumpMode: demoteStub(loadedTrading.pumpMode, allowStubs),
    };
    const modes: ServiceModes = {
      ...tradingModes(trading),
      browser: browserMode,
      database: modeOf([Redacted.value(databaseUrl), PLACEHOLDER.databaseUrl]),
      // The key alone. The deployments are pinned in `packages/graph`'s
      // registry rather than configured, because *which* four indexes the
      // answer came from is a claim the receipt makes and code is where a
      // claim like that can be reviewed.
      graph: modeOf([Redacted.value(graphApiKey), PLACEHOLDER.graphApiKey]),
      // Both halves are needed: an account with no key cannot sign, and a key
      // with no account cannot be addressed. Half-configured is not half-live.
      hedera: modeOf(
        [hederaAccountId, PLACEHOLDER.hederaAccountId],
        [Redacted.value(hederaPrivateKey), PLACEHOLDER.hederaPrivateKey]
      ),
      model: modelProvider === "stub" ? "stub" : "live",
      privy: modeOf(
        [privyAppId, PLACEHOLDER.privyAppId],
        [Redacted.value(privyAppSecret), PLACEHOLDER.privyAppSecret]
      ),
      // Token and webhook secret together: a bot that answers unverified
      // webhooks is a bot anyone on the internet can answer approval cards through.
      telegram: modeOf(
        [Redacted.value(telegramBotToken), PLACEHOLDER.telegramBotToken],
        [
          Redacted.value(telegramWebhookSecret),
          PLACEHOLDER.telegramWebhookSecret,
        ]
      ),
    };

    refuseStubbedBoot(appOrigin, stubbedNames(modes, trading));

    return {
      email,
      trading,
      xApiBearer,
      supplierPayees,
      allowedOrigins: allowedOrigins(appOrigin, extraOrigins),
      anthropicApiKey: anthropicKey,
      appOrigin,
      allowStubs,
      blockPrivateNetwork: !isLoopback(appOrigin),
      browserIdleMs,
      browserUseApiKey,
      browserCountry,
      browserModelInputRate,
      browserModelOutputRate,
      demoUserId,
      databaseUrl: Redacted.value(databaseUrl),
      evmRpcUrl,
      researchMode: researchMode(liveResearch, allowStubs),
      pinaxApiKey: optionalResearchKey(pinaxKey),
      graphMarketToken: optionalResearchKey(graphMarketToken),
      pinaxApiUrl,
      polymarketGammaUrl,
      polymarketClobUrl,
      defiLlamaApiUrl,
      defiLlamaYieldsUrl,
      graphApiKey: Redacted.value(graphApiKey),
      graphGatewayUrl,
      graphPayPerQuery,
      hederaAccountId,
      hederaAccounts:
        modes.hedera === "live" &&
        !isPlaceholder(Redacted.value(hederaKek), PLACEHOLDER.hederaKek),
      hederaFacilitatorUrl,
      hederaHcsTopicId,
      hederaKek: isPlaceholder(Redacted.value(hederaKek), PLACEHOLDER.hederaKek)
        ? null
        : Redacted.value(hederaKek),
      hederaMirrorNodeUrl,
      hederaNetwork,
      hederaAsset,
      hederaPayTo: hederaPayTo === "" ? hederaAccountId : hederaPayTo,
      hederaPrivateKey: Redacted.value(hederaPrivateKey),
      maxBrowsers,
      modelProvider,
      modelRunsPerDay,
      modelStepsPerDay,
      modes,
      openAiCompatibleApiKey: compatibleKey,
      openAiCompatibleBaseUrl,
      openAiCompatibleModel,
      pocketStartingUsdMicros: Math.round(pocketStartingUsd * 1_000_000),
      spendingLimits,
      startingCreditDids: startingCreditDidsRaw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ""),
      teamStartingUsdMicros: Math.round(teamStartingUsd * 1_000_000),
      evmNetwork,
      solanaNetwork,
      solanaRpcUrl,
      evmChainId: EVM_CHAIN_IDS[evmNetwork],
      port,
      // All three or none. Two of three is a deployment that would fail at the
      // first payment with an error from Privy rather than at boot with one
      // from us, and the second is much easier to act on.
      privyAgent:
        modeOf(
          [privyAuthorizationKeyId, PLACEHOLDER.privyAuthorizationKeyId],
          [
            Redacted.value(privyAuthorizationPrivateKey),
            PLACEHOLDER.privyAuthorizationPrivateKey,
          ],
          [privyAgentPolicyId, PLACEHOLDER.privyAgentPolicyId]
        ) === "live"
          ? {
              policyId: privyAgentPolicyId,
              privateKey: Redacted.value(privyAuthorizationPrivateKey),
              quorumId: privyAuthorizationKeyId,
            }
          : null,
      privyAppId,
      privyAppSecret: Redacted.value(privyAppSecret),
      privyHederaPolicyId: isPlaceholder(
        privyHederaPolicyId,
        PLACEHOLDER.privyHederaPolicyId
      )
        ? null
        : privyHederaPolicyId,
      reservedBrowsers,
      staticDirectory,
      telegramBotToken: Redacted.value(telegramBotToken),
      telegramBotUsername,
      telegramWebhookSecret: Redacted.value(telegramWebhookSecret),
      privyPersonOwnedPolicies,
      personPolicyPins: personPolicyPins({
        evmNetwork,
        privyEarnVaultId,
        privyServicePayee,
        treasuryEvmAddress,
      }),
      treasuryEvmAddress: isPlaceholder(
        treasuryEvmAddress,
        PLACEHOLDER.treasuryEvmAddress
      )
        ? null
        : treasuryEvmAddress,
      treasuryWallet:
        isPlaceholder(treasuryEvmAddress, PLACEHOLDER.treasuryEvmAddress) ||
        isPlaceholder(treasuryWalletId, PLACEHOLDER.treasuryWalletId)
          ? null
          : { address: treasuryEvmAddress, id: treasuryWalletId },
    } satisfies Environment;
  }
);

/** One line per integration, printed at boot. Silence about a stub is a trap. */
export const describeModes = (modes: ServiceModes): string =>
  Object.entries(modes)
    .map(([name, mode]) => `${name}=${mode}`)
    .join(" ");

export const describeTradingModes = (trading: TradingEnvironment): string =>
  [
    `uniswapExecution=${trading.uniswapMode}`,
    `jupiter=${trading.jupiterMode}`,
    `enso=${trading.ensoMode}`,
    `pump=${trading.pumpMode}`,
    `pons=${trading.ponsMode}`,
  ].join(" ");
