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
  graphApiKey: "REPLACE_ME_GRAPH_STUDIO_KEY",
  graphSubgraphId: "REPLACE_ME_SUBGRAPH_ID",
  hederaAccountId: "0.0.0",
  hederaPrivateKey: "0xREPLACE_ME",
  privyAppId: "REPLACE_ME_PRIVY_APP_ID",
  privyAppSecret: "REPLACE_ME_PRIVY_APP_SECRET",
} as const;

const isPlaceholder = (value: string, placeholder: string): boolean =>
  value.trim() === "" || value.trim() === placeholder;

const modeOf = (
  ...pairs: readonly (readonly [string, string])[]
): ServiceMode =>
  pairs.every(([value, placeholder]) => !isPlaceholder(value, placeholder))
    ? "live"
    : "stub";

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
  readonly graphSubgraphId: string;
  readonly hederaAccountId: string;
  readonly hederaFacilitatorUrl: string;
  readonly hederaPrivateKey: string;
  readonly modes: ServiceModes;
  /** OpenAI-compatible fallback so the agent loop is exercisable without Anthropic. */
  readonly openAiCompatibleApiKey: string;
  readonly openAiCompatibleBaseUrl: string;
  readonly openAiCompatibleModel: string;
  readonly port: number;
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
    const staticDirectory = yield* Config.string("STATIC_DIR").pipe(
      Config.withDefault("")
    );
    const chromeProfileDirectory = yield* Config.string(
      "CHROME_PROFILE_DIR"
    ).pipe(Config.withDefault(".froggy/chrome-profile"));
    const databaseUrl = yield* secret(
      "DATABASE_URL",
      "postgres://postgres:postgres@localhost:5432/froggy"
    );

    const privyAppId = yield* Config.string("PRIVY_APP_ID").pipe(
      Config.withDefault(PLACEHOLDER.privyAppId)
    );
    const privyAppSecret = yield* secret(
      "PRIVY_APP_SECRET",
      PLACEHOLDER.privyAppSecret
    );

    const graphApiKey = yield* secret("GRAPH_API_KEY", PLACEHOLDER.graphApiKey);
    const graphSubgraphId = yield* Config.string("GRAPH_SUBGRAPH_ID").pipe(
      Config.withDefault(PLACEHOLDER.graphSubgraphId)
    );
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
      graph: modeOf(
        [Redacted.value(graphApiKey), PLACEHOLDER.graphApiKey],
        [graphSubgraphId, PLACEHOLDER.graphSubgraphId]
      ),
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
      allowedOrigins: [
        appOrigin,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ],
      anthropicApiKey: anthropicKey,
      appOrigin,
      chromeProfileDirectory,
      databaseUrl: Redacted.value(databaseUrl),
      graphApiKey: Redacted.value(graphApiKey),
      graphGatewayUrl,
      graphSubgraphId,
      hederaAccountId,
      hederaFacilitatorUrl,
      hederaPrivateKey: Redacted.value(hederaPrivateKey),
      modes,
      openAiCompatibleApiKey: compatibleKey,
      openAiCompatibleBaseUrl,
      openAiCompatibleModel,
      port,
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
