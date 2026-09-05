import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // `APP_ORIGIN` is what the sockets trust, and the page is served from
      // 3100 — a mismatch here costs both sockets and nothing else, which is a
      // quiet enough failure to be worth pinning in the test setup.
      command:
        "PORT=3101 APP_ORIGIN=http://127.0.0.1:3100 bun run --cwd apps/server start",
      // Pinned to the stub identity. This box exports real Privy credentials
      // for development, and inheriting them put the server into live mode,
      // where it correctly refused the test's local token — an e2e failure
      // caused entirely by whose shell it ran in. The placeholders are how
      // `environment.ts` spells "unset".
      env: {
        PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
        PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
      },
      port: 3101,
      reuseExistingServer: process.env["CI"] === undefined,
      timeout: 30_000,
    },
    {
      // The web dev server proxies to the API, so the test drives one origin —
      // the same shape production has, where one Bun process serves both.
      command:
        "API_URL=http://127.0.0.1:3101 bun run dev -- --host 127.0.0.1 --port 3100",
      cwd: "apps/web",
      // No app id, so the client never loads Privy and uses the local identity
      // — the same token path a real sign-in takes, against the stub verifier.
      env: { VITE_PRIVY_APP_ID: "" },
      port: 3100,
      reuseExistingServer: process.env["CI"] === undefined,
      timeout: 30_000,
    },
  ],
});
