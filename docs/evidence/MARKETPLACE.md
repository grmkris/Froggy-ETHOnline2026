# Service marketplace — implementation and live activation

The workspace's **Services** button opens the catalog, fixed prices, a request form and recent task results. The same tasks are available through chat (`services_list`, `service_run`, `service_status`), CLI and MCP. Downloads require the owner's bearer credential. Failed and uncertain work stays retrievable.

## Services and spending bounds

| Service | Customer price | Supplier limit | Input bound |
| --- | --: | --: | --- |
| X recent search | $0.20 | X API credits, at most 20 posts | 450 characters, seven-day search |
| You.com web search | $0.03 | $0.01 USDC | 1,000 characters, five results |
| BlockRun image | $0.12 | $0.06 USDC | 2,000 characters, one Nano Banana image |
| BlockRun inference | $0.03 | $0.01 USDC | 2,000 characters, 512 output tokens |
| BlockRun speech | $0.15 | $0.10 USDC | 1,000 characters, ElevenLabs Flash MP3 |

Prices above are Froggy's fixed task prices. Supplier limits are ceilings, not claims about what every request costs. The existing Graph brief and shared browser task remain available through the existing task API and CLI.

## Configuration for the production owner

1. Review `privy-service-supplier-rules.json`, which contains **additional rules** for the treasury policy. Merge deliberately; do not replace the existing policy or apply these rules to people's wallets. The rules pin Base chain id, USDC contract, recipient and per-signature amount. Application ceilings are narrower for image, inference and web search. Existing budget/aggregation policy still needs review by the production owner.
2. Set `SERVICE_SUPPLIER_PAYEES` to the following after reviewing those rules:

   ```text
   api.you.com=0xc327D0aEb5f65B514b193b5e5A95cC6F4060815f,blockrun.ai=0xe9030014F5DAe217d0A152f02A043567b16c1aBf
   ```

   These addresses were read from the providers' own unpaid 402 responses at 22:29 UTC on 6 September; see `MARKETPLACE_QUOTES.json`. Reverify before a later activation. A changed recipient is refused rather than auto-approved.

3. Keep `EVM_NETWORK=eip155:8453` and the existing funded, policy-controlled `TREASURY_WALLET_ID` / `TREASURY_EVM_ADDRESS` configuration. A signing failure is surfaced; it never falls back to a different wallet.
4. Configure a server-only `X_API_BEARER_TOKEN` with the appropriate X API access and credit budget. The app does not read the operator's personal xurl store.
5. Run one small task per provider from a funded person's wallet. Record the customer Hedera settlement and the supplier Base settlement separately, inspect the delivered artifact, and exercise a deliberate refusal.

No new supplier policy has been applied and no new supplier has been paid by this implementation session. The separate mainnet cutover has a funded Hedera float and an existing oracle proof; that is not proof of these new adapters.

## Agent connection

The generated skill in **Details → Agents** now includes an MCP configuration. It uses `node /absolute/path/to/froggy.mjs mcp`, with `FROGGY_URL` and the person's revocable `FROGGY_TOKEN`. HTTP clients can call `/api/mcp` with the same bearer. Tools: `froggy_services`, `froggy_service_run`, `froggy_service_status`.

The official OAuth connection flow in plan task 2.6 is separate, pending work. This implementation adds no OAuth discovery claims or fake sign-in flow.

Raw service API: `GET /api/services`, `POST /api/services/run`, `GET /api/services/tasks`, `GET /api/services/tasks/:id`, and `GET /api/services/tasks/:id/artifact`. Run body:

```json
{
  "v": 1,
  "service": "web_search",
  "prompt": "affordable train travel",
  "idempotencyKey": "trip-research-1"
}
```

The run endpoint authorizes the person's own wallet to pay Froggy's Hedera challenge internally. It returns a durable ticket immediately. Reuse the key for the same request, poll every three seconds, and never repurchase a pending, failed or uncertain task automatically. Approval remains in the workspace or Telegram; agents cannot approve themselves.

## Evidence and limits

Local verification on 7 September: `bun run check`, `bun run build`, and all 39 Playwright checks pass. This includes running the downloaded CLI under Node against the MCP HTTP endpoint. Desktop and 390px screenshots were captured; the mobile layout was visually inspected. All financial tests use stubs or fixtures.

- Fresh unpaid quotes: You.com $0.005; BlockRun image $0.053501; inference and short speech as recorded in `MARKETPLACE_QUOTES.json`. Quotes are not purchases.
- Regression tests cover concurrent claims, changed-input retries, no-credit refusal, payment uncertainty, owner isolation, MCP revocation, supplier quote ceilings, payee substitution, credential redirects and original-proof image polling. Browser tests exercise purchase, result reload and mobile layout.
- Generated artifacts are capped at three MiB. After a process loss, a stale task becomes visibly uncertain; it is not automatically resumed or rebilled.
- X results are a bounded sample of public posts, not an exhaustive study or verified facts. Web search excerpts likewise remain source claims.

Provider contracts: [You.com machine payments](https://you.com/docs/administration/machine-payments/x402), [BlockRun image generation](https://blockrun.ai/docs/api-reference/image-generation), [BlockRun speech](https://blockrun.ai/docs/api-reference/text-to-speech), [X search](https://docs.x.com/x-api/posts/search/introduction), [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
