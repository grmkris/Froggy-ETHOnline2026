/** An isolated, keyless workspace even when the shell exports live credentials. */
const webPort = 3400;
const apiPort = 3401;
const origin = `http://localhost:${webPort}`;
const environment = {
  ...process.env,
  APP_ORIGIN: origin,
  PORT: String(apiPort),
  API_URL: `http://localhost:${apiPort}`,
  DATABASE_URL: "",
  ANTHROPIC_API_KEY: "sk-ant-REPLACE_ME",
  OPENAI_COMPATIBLE_API_KEY: "",
  OPENAI_COMPATIBLE_BASE_URL: "",
  OPENAI_COMPATIBLE_MODEL: "",
  GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
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
  SOLANA_NETWORK: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  SOLANA_RPC_URL: "",
  POCKET_STARTING_USD: "0.50",
  SPENDING_LIMITS: "true",
  STARTING_CREDIT_DIDS: "",
  DEMO_USER_DID: "",
  MAX_BROWSERS: "0",
  EXTRA_ORIGINS: "",
  STATIC_DIR: "",
  BROWSER_USE_API_KEY: "REPLACE_ME_BROWSER_USE_KEY",
  PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
  PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
  VITE_PRIVY_APP_ID: "",
  X_API_BEARER_TOKEN: "",
  SERVICE_SUPPLIER_PAYEES: "",
};
const children = [
  Bun.spawn(["bun", "run", "--cwd", "apps/server", "start"], {
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn(
    [
      "bun",
      "run",
      "--cwd",
      "apps/web",
      "dev",
      "--",
      "--host",
      "localhost",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    {
      env: environment,
      stdout: "inherit",
      stderr: "inherit",
    }
  ),
];
const stop = () => {
  for (const child of children) {
    child.kill();
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(
  `Froggy simulated demo: ${origin}\nPaid report: ${origin}/demo/x402/report\nAll payment providers are stubs. Ctrl+C stops both servers.`
);
const code = await Promise.race(
  children.map(async (child) => await child.exited)
);
stop();
await Promise.all(children.map(async (child) => await child.exited));
process.exit(code);
