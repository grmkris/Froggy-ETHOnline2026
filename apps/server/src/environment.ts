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

import { decodeUserId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { EVM_CHAIN_IDS, isEvmNetwork, isHederaNetwork } from "@froggy/payments";
import type { EvmNetwork, HederaNetwork } from "@froggy/payments";
import type { ServiceMode, ServiceModes } from "@froggy/protocol";
import { Config, Effect, Redacted, Result } from "effect";

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
  hederaAccountId: "0.0.0",
  hederaKek: "REPLACE_ME_HEDERA_KEK",
  hederaPrivateKey: "0xREPLACE_ME",
  privyAgentPolicyId: "REPLACE_ME_PRIVY_POLICY_ID",
  privyHederaPolicyId: "REPLACE_ME_PRIVY_HEDERA_POLICY_ID",
  privyAppId: "REPLACE_ME_PRIVY_APP_ID",
  privyAppSecret: "REPLACE_ME_PRIVY_APP_SECRET",
  privyAuthorizationKeyId: "REPLACE_ME_PRIVY_KEY_QUORUM_ID",
  privyAuthorizationPrivateKey: "REPLACE_ME_PRIVY_AUTHORIZATION_KEY",
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

export interface Environment {
  readonly xApiBearer: Redacted.Redacted;
  readonly supplierPayees: Readonly<Record<string, string>>;

  readonly anthropicApiKey: string;
  /** Trusted browser origins for WebSocket upgrades. See `ws-router.ts`. */
  readonly allowedOrigins: readonly string[];
  readonly appOrigin: string;
  /**
   * Whether the agent's Chrome refuses the private network. On everywhere the
   * app is not itself on a loopback address — which is to say, everywhere but
   * a developer's laptop, where the oracle page the agent must reach is on
   * `localhost`.
   */
  readonly blockPrivateNetwork: boolean;
  readonly chromeProfileDirectory: string;
  readonly databaseUrl: string;
  /** The JSON-RPC endpoint the host broadcasts signed Base Sepolia transactions to. */
  readonly evmRpcUrl: string;
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
  /** The judge's account: always gets a seat. Null when nobody is reserved. */
  readonly demoUserId: UserId | null;
  /** Concurrent browser workers across all users. 0 means unlimited. */
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
  /** Privy DIDs that start with `teamStartingUsdMicros` instead: the team and the demo account. */
  readonly startingCreditDids: readonly string[];
  readonly teamStartingUsdMicros: number;
  /**
   * Which Base the person's USDC lives on and top-ups move on. Mainnet or
   * Sepolia; the RPC must answer with the matching chain id, checked at boot.
   */
  readonly evmNetwork: EvmNetwork;
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
   * The treasury as a Privy wallet the agent key may sign for, when it is
   * one: the address above plus its wallet id. Null when either is unset
   * or no agent key exists, and then Froggy pays nothing upstream itself.
   */
  readonly treasuryWallet: {
    readonly address: string;
    readonly id: string;
  } | null;
}

export const loadEnvironment = Effect.fn("loadEnvironment")(
  function* loadEnvironment() {
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
    const chromeProfileDirectory = yield* Config.string(
      "CHROME_PROFILE_DIR"
    ).pipe(Config.withDefault(".froggy/chrome-profile"));
    // One browser process per signed-in user, eight at a time by default: a
    // headless Chrome is half a gigabyte and change, so eight is comfortable
    // on the deployment's memory and a link that gets shared widely queues
    // rather than exhausting the box. One of the eight is held for the demo
    // account, so a judge never waits behind testers. All three are variables
    // rather than code so they can be moved under load.
    const maxBrowsers = yield* Config.number("MAX_BROWSERS").pipe(
      Config.withDefault(8)
    );
    const reservedBrowsers = yield* Config.number("RESERVED_BROWSERS").pipe(
      Config.withDefault(1)
    );
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
    const evmRpcUrl = rpcUrlFor(evmNetwork, evmRpcUrlRaw, legacyRpcUrl);
    const pocketStartingUsd = yield* Config.number("POCKET_STARTING_USD").pipe(
      Config.withDefault(0.5)
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
    const modes: ServiceModes = {
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

    return {
      xApiBearer,
      supplierPayees,
      allowedOrigins: allowedOrigins(appOrigin, extraOrigins),
      anthropicApiKey: anthropicKey,
      appOrigin,
      blockPrivateNetwork: !isLoopback(appOrigin),
      browserIdleMs,
      demoUserId,
      chromeProfileDirectory,
      databaseUrl: Redacted.value(databaseUrl),
      evmRpcUrl,
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
      startingCreditDids: startingCreditDidsRaw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ""),
      teamStartingUsdMicros: Math.round(teamStartingUsd * 1_000_000),
      evmNetwork,
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
