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

import type { ServiceMode, ServiceModes } from "@froggy/protocol";
import { Config, Effect, Redacted } from "effect";

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
  hederaPrivateKey: "0xREPLACE_ME",
  privyAgentPolicyId: "REPLACE_ME_PRIVY_POLICY_ID",
  privyAppId: "REPLACE_ME_PRIVY_APP_ID",
  privyAppSecret: "REPLACE_ME_PRIVY_APP_SECRET",
  privyAuthorizationKeyId: "REPLACE_ME_PRIVY_KEY_QUORUM_ID",
  privyAuthorizationPrivateKey: "REPLACE_ME_PRIVY_AUTHORIZATION_KEY",
} as const;

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

const secret = (name: string, fallback: string) =>
  Config.redacted(name).pipe(Config.withDefault(Redacted.make(fallback)));

export interface Environment {
  readonly anthropicApiKey: string;
  /** Trusted browser origins for WebSocket upgrades. See `ws-router.ts`. */
  readonly allowedOrigins: readonly string[];
  readonly appOrigin: string;
  readonly chromeProfileDirectory: string;
  readonly databaseUrl: string;
  readonly graphApiKey: string;
  readonly graphGatewayUrl: string;
  readonly hederaAccountId: string;
  readonly hederaFacilitatorUrl: string;
  /** Where the HBAR/USD rate every cap is computed from comes from. */
  readonly hederaMirrorNodeUrl: string;
  readonly hederaPrivateKey: string;
  /** Concurrent Chromes allowed across all users. 0 means unlimited. */
  readonly maxBrowsers: number;
  readonly modes: ServiceModes;
  /** OpenAI-compatible fallback so the agent loop is exercisable without Anthropic. */
  readonly openAiCompatibleApiKey: string;
  readonly openAiCompatibleBaseUrl: string;
  readonly openAiCompatibleModel: string;
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
  /** Where the SPA build lives in production. Empty means "dev, Vite serves it". */
  readonly staticDirectory: string;
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
    // One Chrome per signed-in user, uncapped by default — the call made for
    // this build. Two Chromes are roughly a gigabyte, so a link that gets
    // shared widely will exhaust the box; setting this is the mitigation, and
    // it is a variable rather than a code change so it can be set under load.
    const maxBrowsers = yield* Config.number("MAX_BROWSERS").pipe(
      Config.withDefault(0)
    );
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

    const hederaAccountId = yield* Config.string("HEDERA_ACCOUNT_ID").pipe(
      Config.withDefault(PLACEHOLDER.hederaAccountId)
    );
    const hederaPrivateKey = yield* secret(
      "HEDERA_PRIVATE_KEY",
      PLACEHOLDER.hederaPrivateKey
    );
    const hederaFacilitatorUrl = yield* Config.string(
      "HEDERA_FACILITATOR_URL"
    ).pipe(Config.withDefault("https://api.testnet.blocky402.com"));
    const hederaMirrorNodeUrl = yield* Config.string(
      "HEDERA_MIRROR_NODE_URL"
    ).pipe(Config.withDefault("https://mainnet-public.mirrornode.hedera.com"));

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

    const anthropicKey = Redacted.value(anthropicApiKey);
    const compatibleKey = Redacted.value(openAiCompatibleApiKey);

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
      model:
        modeOf([anthropicKey, PLACEHOLDER.anthropicApiKey]) === "live" ||
        (compatibleKey.trim() !== "" && openAiCompatibleBaseUrl.trim() !== "")
          ? "live"
          : "stub",
      privy: modeOf(
        [privyAppId, PLACEHOLDER.privyAppId],
        [Redacted.value(privyAppSecret), PLACEHOLDER.privyAppSecret]
      ),
    };

    return {
      allowedOrigins: allowedOrigins(appOrigin, extraOrigins),
      anthropicApiKey: anthropicKey,
      appOrigin,
      chromeProfileDirectory,
      databaseUrl: Redacted.value(databaseUrl),
      graphApiKey: Redacted.value(graphApiKey),
      graphGatewayUrl,
      hederaAccountId,
      hederaFacilitatorUrl,
      hederaMirrorNodeUrl,
      hederaPrivateKey: Redacted.value(hederaPrivateKey),
      maxBrowsers,
      modes,
      openAiCompatibleApiKey: compatibleKey,
      openAiCompatibleBaseUrl,
      openAiCompatibleModel,
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
      staticDirectory,
    } satisfies Environment;
  }
);

/** One line per integration, printed at boot. Silence about a stub is a trap. */
export const describeModes = (modes: ServiceModes): string =>
  Object.entries(modes)
    .map(([name, mode]) => `${name}=${mode}`)
    .join(" ");
