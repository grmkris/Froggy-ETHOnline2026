---
name: froggy-door
description: Migrate the retired anonymous Froggy buyer to authenticated MCP and platform credits.
---

# Connect to Froggy with an account

The anonymous Froggy door and per-resource HBAR purchases have retired. The old bundle URL returns HTTP 410. Do not sign another payment or install the old key-holding buyer.

Sign in at https://your-froggy.example, then read [the current Froggy skill](https://your-froggy.example/skill.md). Connect your MCP client with OAuth:

```sh
claude mcp add --transport http froggy https://your-froggy.example/mcp
```

The owner buys internal, nontransferable credits in Wallet with USDC on Base or native HBAR through x402. 100 credits equals $1. Every account starts at zero. Agents use the existing balance within the owner's limits; agents cannot buy credits or change limits.

Use `froggy_services` to read current availability and credit prices. Reuse task ids and idempotency keys. A successful task captures its reserved credits; failure or cancellation releases them. An uncertain outcome keeps its reservation until reconciled. Never create another purchase to find out whether the first one worked.

Historical sale records remain readable at `/oracle/sales/<saleId>`. Keep existing sale and transaction references. A retired endpoint does not reverse a historical payment.

You do not need to give your agent a wallet private key. Never print a private key or paste one into a message, tool argument or committed file.
