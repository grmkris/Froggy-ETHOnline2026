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
  const repo = github("grmkris/agentic-wallet", { branch, checkSuites: true });

  // The type is omitted on purpose: `ON_FAILURE` is the default and reads back
  // as `null`, so writing it makes every plan report a change that never settles.
  const restart = { restartPolicyMaxRetries: 3 };

  const db = postgres("Postgres", { region });
  const postgresVolume = volume("postgres-volume", {
    allowOnlineResize: true,
    region,
    sizeMB: 5000,
  });

  /**
   * The agent's Chrome profile.
   *
   * Persistent so logins survive a redeploy — which is the product ("the agent
   * shops as you") and also the scary part. Deleting this volume signs the
   * agent out of everything, and that is the intended escape hatch.
   */
  const browserVolume = volume("browser-profile", { region, sizeMB: 2000 });

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
    deploy: restart,
    env: {
      ANTHROPIC_API_KEY: preserve(),
      APP_ORIGIN: preserve(),
      DATABASE_URL: preserve(),
      EXTRA_ORIGINS: preserve(),
      GRAPH_API_KEY: preserve(),
      GRAPH_SUBGRAPH_ID: preserve(),
      HEDERA_ACCOUNT_ID: preserve(),
      HEDERA_FACILITATOR_URL: preserve(),
      HEDERA_PRIVATE_KEY: preserve(),
      PORT: preserve(),
      PRIVY_APP_ID: preserve(),
      PRIVY_APP_SECRET: preserve(),
    },
    healthcheck: "/health",
    // Generous: the first request starts Chromium, and a cold container pulling
    // a browser into memory is slower than a Bun process answering JSON.
    healthcheckTimeout: 120,
    // EXACTLY ONE replica. The spend ledger is in-memory, so a second replica
    // would have its own idea of what has been spent — and two ledgers under one
    // cap is the same as no cap. `packages/database` holds the schema a second
    // replica would need first.
    replicas: { [region]: 1 },
    source: repo,
    volumeMounts: { "/data": browserVolume },
  });

  return project("froggy", {
    resources: [app, db, postgresVolume, browserVolume],
  });
});
