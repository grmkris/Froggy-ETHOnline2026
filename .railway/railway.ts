import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

/**
 * Froggy's infrastructure, in code.
 *
 * One public service, deliberately. The house pattern puts a Caddy gateway in
 * front of separate api and web services; this deviates because the product is
 * a binary screencast socket and a page that grabs it — one origin means no
 * CORS, no internal-network hop for the frames, and one fewer thing to debug on
 * the last day before submission.
 */
export default defineRailway((ctx) => {
  const region = "europe-west4-drams3a";
  // One environment for the hackathon, and `main` is the only branch. The
  // expression is kept rather than inlined so a `dev` environment can be added
  // without rediscovering where the branch is decided.
  const branch = ctx.environment === "production" ? "main" : "main";

  // `checkSuites` waits for the Actions run on the pushed sha and skips the
  // deploy if CI fails. It requires that every sha produces a run, which is why
  // the CI workflow carries no `paths-ignore`: a sha with no workflow run has
  // nothing to wait on and the deploy hangs in WAITING forever.
  const repo = github("grmkris/Froggy-ETHOnline2026", {
    branch,
    checkSuites: true,
  });

  // The type is omitted on purpose: `ON_FAILURE` is the default and reads back
  // as `null`, so writing it makes every plan report a change that never settles.
  const restart = { restartPolicyMaxRetries: 3 };

  const db = postgres("Postgres", { region });
  // Railway's own default. Left alone rather than shrunk: a smaller volume is
  // a destructive change for no benefit, and this database holds a spend ledger
  // that should outlive the demo.
  const postgresVolume = volume("postgres-volume", {
    allowOnlineResize: true,
    region,
    sizeMB: 50_000,
  });

  /**
   * The agent's old Chrome profile volume — no longer written to.
   *
   * Profiles moved to Browser Use, one per signed-in user, so nothing in the
   * image mounts anything at `/data` any more. The declaration is kept because
   * removing it deletes the volume, and deleting a volume is the owner's call
   * rather than a side effect of a refactor. Delete it in the Railway dashboard
   * once the migration has been accepted in production.
   */
  const browserVolume = volume("browser-profile", {
    allowOnlineResize: true,
    region,
    sizeMB: 10_000,
  });

  const app = service("app", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      watchPatterns: [
        "apps/**",
        "packages/**",
        "Dockerfile",
        "bun.lock",
        "package.json",
        "turbo.json",
      ],
    },
    deploy: {
      ...restart,
      // Migrations run before the new container takes traffic, so a failed
      // migration fails the deploy rather than putting a half-migrated server
      // in front of users and then crash-looping. The path is resolved from the
      // script's own location, not the working directory, because this runs
      // inside the image where the cwd is not the repository root.
      // One entry, and it is a shell string rather than argv: Railway rejects
      // an array of more than one element here, which it does loudly — but
      // only at apply time, so the wrong shape reads as a plan that never
      // settles rather than as an error.
      preDeployCommand: ["bun apps/server/src/migrate.ts"],
    },
    env: {
      ANTHROPIC_API_KEY: preserve(),
      BROWSER_USE_API_KEY: preserve(),
      BROWSER_COUNTRY: preserve(),
      BROWSER_MODEL_INPUT_USD_PER_MILLION: preserve(),
      BROWSER_MODEL_OUTPUT_USD_PER_MILLION: preserve(),
      BIRDEYE_API_KEY: preserve(),
      UNISWAP_API_KEY: preserve(),
      UNISWAP_CHAINS: preserve(),
      JUPITER_API_KEY: preserve(),
      ENSO_API_KEY: preserve(),
      TRADING_RPC_ENDPOINTS: preserve(),
      TRADING_PRICES_USD_MICROS: preserve(),
      TRADING_CONFIRMATIONS: preserve(),
      TENDERLY_ACCESS_KEY: preserve(),
      TENDERLY_ACCOUNT: preserve(),
      TENDERLY_PROJECT: preserve(),
      APP_ORIGIN: preserve(),
      DATABASE_URL: preserve(),
      EXTRA_ORIGINS: preserve(),
      EVM_NETWORK: preserve(),
      EVM_RPC_URL: preserve(),
      GRAPH_API_KEY: preserve(),
      GRAPH_GATEWAY_URL: preserve(),
      GRAPH_PAY_PER_QUERY: preserve(),
      HEDERA_ACCOUNT_ID: preserve(),
      HEDERA_FACILITATOR_URL: preserve(),
      HEDERA_HCS_TOPIC_ID: preserve(),
      HEDERA_MIRROR_NODE_URL: preserve(),
      HEDERA_NETWORK: preserve(),
      HEDERA_PAY_TO: preserve(),
      HEDERA_PRIVATE_KEY: preserve(),
      HEDERA_KEK: preserve(),
      BROWSER_IDLE_MS: preserve(),
      DEMO_USER_DID: preserve(),
      MAX_BROWSERS: preserve(),
      OPENAI_COMPATIBLE_API_KEY: preserve(),
      OPENAI_COMPATIBLE_BASE_URL: preserve(),
      OPENAI_COMPATIBLE_MODEL: preserve(),
      PORT: preserve(),
      PRIVY_AGENT_POLICY_ID: preserve(),
      PRIVY_HEDERA_POLICY_ID: preserve(),
      PRIVY_APP_ID: preserve(),
      PRIVY_APP_SECRET: preserve(),
      PRIVY_AUTHORIZATION_KEY_ID: preserve(),
      PRIVY_AUTHORIZATION_PRIVATE_KEY: preserve(),
      RESERVED_BROWSERS: preserve(),
      SERVICE_SUPPLIER_PAYEES: preserve(),
      SOLANA_NETWORK: preserve(),
      SOLANA_RPC_URL: preserve(),
      X_API_BEARER_TOKEN: preserve(),
      TELEGRAM_BOT_TOKEN: preserve(),
      TELEGRAM_BOT_USERNAME: preserve(),
      TELEGRAM_WEBHOOK_SECRET_TOKEN: preserve(),
      TREASURY_EVM_ADDRESS: preserve(),
      TREASURY_WALLET_ID: preserve(),
      BASE_SEPOLIA_RPC_URL: preserve(),
      POCKET_STARTING_USD: preserve(),
      STARTING_CREDIT_DIDS: preserve(),
      TEAM_STARTING_USD: preserve(),
      MODEL_RUNS_PER_DAY: preserve(),
      MODEL_STEPS_PER_DAY: preserve(),
      // Baked into the web bundle at build time, via the Dockerfile ARG of the
      // same name. Absent from this list it would be deleted on the next
      // apply, and the deployed client would quietly fall back to the local
      // identity — a failure that looks exactly like sign-in being switched off.
      VITE_PRIVY_APP_ID: preserve(),
    },
    healthcheck: "/health",
    // Generous: the first request starts Chromium, and a cold container pulling
    // a browser into memory is slower than a Bun process answering JSON.
    healthcheckTimeout: 120,
    // EXACTLY ONE replica, still. The ledger is in Postgres now, and its unique
    // index on `(user_id, idempotency_key)` makes a retried payment safe across
    // processes — but the *window total* is read before the row is reserved,
    // outside a transaction, and only a per-user promise chain inside one
    // process closes that gap. Two replicas could each authorise a spend
    // against the same stale total. Also: each replica would run its own
    // Chromes against the same profile volume.
    replicas: { [region]: 1 },
    source: repo,
    volumeMounts: { "/data": browserVolume },
  });

  return project("froggy", {
    resources: [app, db, postgresVolume, browserVolume],
  });
});
