import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env["FROGGY_E2E_PORT"] ?? "3100");
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65_534) {
  throw new Error("FROGGY_E2E_PORT must be a port from 1024 to 65534");
}
const apiPort = webPort + 1;
const origin = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: process.env["CI"] !== undefined,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: process.env["CI"] === undefined ? "line" : "github",
  retries: process.env["CI"] === undefined ? 0 : 2,
  testDir: "./e2e",
  use: {
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // `APP_ORIGIN` is what the sockets trust, and the page is served from
      // the chosen web port — a mismatch here costs both sockets, which is a
      // quiet enough failure to be worth pinning in the test setup.
      command: `PORT=${apiPort} APP_ORIGIN=${origin} bun run --cwd apps/server start`,
      // External providers are pinned to stubs for every browser run.
      // Pinned to the stub identity. This box exports real Privy credentials
      // for development, and inheriting them put the server into live mode,
      // where it correctly refused the test's local token — an e2e failure
      // caused entirely by whose shell it ran in. The placeholders are how
      // `environment.ts` spells "unset".
      env: {
        DATABASE_URL: "",
        BROWSER_PROVIDER: "local",
        BROWSER_USE_API_KEY: "REPLACE_ME_BROWSER_USE_KEY",
        ANTHROPIC_API_KEY: "sk-ant-REPLACE_ME",
        OPENAI_COMPATIBLE_API_KEY: "",
        OPENAI_COMPATIBLE_BASE_URL: "",
        GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
        BIRDEYE_API_KEY: "REPLACE_ME_BIRDEYE_KEY",
        UNISWAP_API_KEY: "REPLACE_ME_UNISWAP_KEY",
        JUPITER_API_KEY: "REPLACE_ME_JUPITER_API_KEY",
        PUMP_EXECUTION_ENABLED: "false",
        PONS_EXECUTION_ENABLED: "false",
        ENSO_API_KEY: "REPLACE_ME_ENSO_API_KEY",
        TENDERLY_ACCESS_KEY: "REPLACE_ME_TENDERLY_ACCESS_KEY",
        TENDERLY_ACCOUNT: "",
        TENDERLY_PROJECT: "",
        TRADING_CONFIRMATIONS: "2",
        TRADING_RPC_ENDPOINTS: "{}",
        TRADING_PRICES_USD_MICROS: "{}",
        UNISWAP_CHAINS:
          '[{"network":"eip155:8453","routerVersion":"2.1.1"},{"network":"eip155:84532","routerVersion":"2.1.1"},{"network":"eip155:1","routerVersion":"2.1.1"},{"network":"eip155:11155111","routerVersion":"2.1.1"}]',
        GRAPH_PAY_PER_QUERY: "false",
        HEDERA_ACCOUNT_ID: "0.0.0",
        HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
        HEDERA_KEK: "REPLACE_ME_HEDERA_KEK",
        HEDERA_NETWORK: "hedera:testnet",
        HEDERA_PAY_TO: "",
        HEDERA_HCS_TOPIC_ID: "",
        TELEGRAM_BOT_TOKEN: "REPLACE_ME_TELEGRAM_BOT_TOKEN",
        TELEGRAM_WEBHOOK_SECRET_TOKEN: "",
        TREASURY_EVM_ADDRESS: "0xREPLACE_ME_TREASURY",
        TREASURY_WALLET_ID: "REPLACE_ME_TREASURY_WALLET_ID",
        EVM_NETWORK: "eip155:84532",
        EVM_RPC_URL: "",
        BASE_SEPOLIA_RPC_URL: "",
        POCKET_STARTING_USD: "0.50",
        // The approval specs need a threshold to lower; production has none.
        SPENDING_LIMITS: "true",
        STARTING_CREDIT_DIDS: "",
        MAX_BROWSERS: "0",
        EXTRA_ORIGINS: "",
        STATIC_DIR: "",
        PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
        PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
      },
      port: apiPort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // The web dev server proxies to the API, so the test drives one origin —
      // the same shape production has, where one Bun process serves both.
      command: `API_URL=http://127.0.0.1:${apiPort} bun run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: "apps/web",
      // No app id, so the client never loads Privy and uses the local identity
      // — the same token path a real sign-in takes, against the stub verifier.
      env: { VITE_PRIVY_APP_ID: "" },
      port: webPort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
