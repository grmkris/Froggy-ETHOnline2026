# Service marketplace — implementation and live activation

The workspace's **Services** page contains the catalog, fixed prices, a request form and recent task results. The same tasks are available through chat (`services_list`, `service_run`, `service_status`), CLI and MCP. Downloads require the owner's bearer credential. Failed and uncertain work stays retrievable.

## Services and spending bounds

| Service | Customer price | Supplier limit | Input bound |
| --- | --: | --: | --- |
| X recent search | $0.06 | X API credits, at most 10 posts | 450 characters, seven-day search |
| You.com web search | $0.01 | $0.01 USDC | 1,000 characters, five results |
| BlockRun image | $0.08 | $0.06 USDC | 2,000 characters, one Nano Banana image |
| BlockRun inference | $0.01 | $0.01 USDC | 2,000 characters, 512 output tokens |
| BlockRun speech | $0.10 | $0.10 USDC | 1,000 characters, ElevenLabs Flash MP3 |

Prices above are Froggy's fixed task prices. Supplier limits are ceilings, not claims about what every request costs. The existing Graph brief and shared browser task remain available through the existing task API and CLI.

## Current production state — 8 September 2026

OAuth is deployed at `/mcp`; discovery and invalid-token refusal passed against production. The reviewed treasury rules and supplier payees are configured for You.com and BlockRun. The X credential was configured and validated with a recent-search request on 8 September; paid delivery evidence through Froggy remains pending for all five services. The dated release sections below preserve the sequence of checks and activation; they do not replace this current state. See [external-client verification](HERMES.md) and the [owner acceptance checklist](../plan/OWNER_ACCEPTANCE.md).

## Configuration for the production owner

1. Review `privy-service-supplier-rules.json`, which contains **additional rules** for the treasury policy. Merge deliberately; do not replace the existing policy or apply these rules to people's wallets. The rules pin Base chain id, USDC contract, recipient and per-signature amount. Application ceilings are narrower for image, inference and web search. Existing budget/aggregation policy still needs review by the production owner.
2. Set `SERVICE_SUPPLIER_PAYEES` to the following after reviewing those rules:

   ```text
   api.you.com=0xc327D0aEb5f65B514b193b5e5A95cC6F4060815f,blockrun.ai=0xe9030014F5DAe217d0A152f02A043567b16c1aBf
   ```

   These addresses were rechecked against the providers' own unpaid 402 responses on 7 September; see `MARKETPLACE_QUOTES.json`. Reverify before a later activation. A changed recipient is refused rather than auto-approved.

3. Keep `EVM_NETWORK=eip155:8453` and the existing funded, policy-controlled `TREASURY_WALLET_ID` / `TREASURY_EVM_ADDRESS` configuration. A signing failure is surfaced; it never falls back to a different wallet.
4. Configure a server-only `X_API_BEARER_TOKEN` with the appropriate X API access and credit budget. The app does not read the operator's personal xurl store.
5. Run one small task per provider from a funded person's wallet. Record the customer Hedera settlement and the supplier Base settlement separately, inspect the delivered artifact, and exercise a deliberate refusal.

The supplier policy and matching payees were activated in the afternoon section below. No paid provider delivery has been verified. The funded Hedera float and existing oracle proof do not establish a purchase from these adapters.

## Agent connection

On **Agents**, connect an external MCP client to `https://app-production-58dd.up.railway.app/mcp`. It discovers OAuth, registers, and sends the person through Froggy's sign-in and consent page. `froggy login` uses the same flow; `--manual` supports a sandbox where the person opens the link on another device. The reusable skill contains no secret. Tokens are stored by the client and the person can revoke the connection through Agents.

The signed-in CLI can also bridge stdio MCP. Legacy `fgy_` tokens and `/api/mcp` remain available under **Advanced: connect with a token**. Tools: `froggy_services`, `froggy_service_run`, `froggy_service_status`. [ADR 0012](../decisions/0012-mcp-oauth-authorization-server.md) describes the deployed authorization server.

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

## Production recheck — 7 September 2026

Deployment `9e4dde82-eb8f-4cbf-b7a9-ec0178876f25` is SUCCESS and runs marketplace commit `f7fa2ee`. The public health endpoint returns 200 with live integration modes, the distributed CLI includes service/MCP commands, and unauthenticated service/MCP calls return 401. Health's live modes do not imply that marketplace suppliers are configured.

Production has neither `SERVICE_SUPPLIER_PAYEES` nor `X_API_BEARER_TOKEN`. The treasury's attached policy `wdct7xe9re788wr3htum96pw` was read directly from Privy: its x402 rule allows only The Graph's recipient, up to 0.02 USDC. It does not authorize You.com or BlockRun. All five new services therefore remain unavailable; setting payees without updating the policy would make supplier signing fail after the customer payment.

Fresh unpaid probes returned valid Base USDC offers: You.com search 0.005, BlockRun image 0.053501, inference 0.002 and short speech 0.002. The configured adapter ceilings cover these examples. No authorization was signed or submitted during this review.

The previous Hedera oracle transaction was independently queried through the mainnet mirror and returned SUCCESS. The Graph Base transaction was independently queried using `eth_getTransactionReceipt` and returned `0x1`. These prove the existing financial integrations, not a new marketplace purchase.

Review found and fixed one documented provider compatibility gap: when BlockRun cannot mirror an image to its media host, it may return a raster data URI in `data[].url`. The adapter now decodes only bounded PNG/JPEG/WebP data with matching file signatures; executable or mislabeled payloads are rejected. Tests also check the settlement receipt returned by the final image poll. This follow-up is commit `6fcd329`; its full repository gate and all 39 browser tests passed. Three initial wallet-balance startup timeouts under higher test concurrency cleared in the full two-worker rerun.

Activation order remains: review and merge the narrow treasury supplier rules, configure matching payees, then run a small customer-funded purchase through each adapter and record both settlement legs and delivered results. X separately needs a server API credential. Public MCP OAuth is still plan task 2.6; existing bearer/stdio MCP is implemented.

Follow-up validation: `bun run check` and `bun run build` pass; 22 focused payment/provider tests pass. The first default-concurrency browser run passed 36 checks and timed out on three initial-wallet assertions; their snapshots showed the expected balance afterward. The complete recheck with `bun run e2e --workers=2` passed all 39. No timeout was raised, assertion weakened, or application startup behavior changed. Parallel startup timing remains worth monitoring.

## Production release handoff — 7 September

Commit `f7fa2ee` is deployed as Railway release `9e4dde82-eb8f-4cbf-b7a9-ec0178876f25`, with [green CI](https://github.com/grmkris/Froggy-ETHOnline2026/actions/runs/34065738962). The release owner independently passed 408 unit tests, all 39 browser tests and both builds, reviewed the mobile catalog, and checked the live CLI download and MCP authentication refusal.

Fresh unpaid quotes matched the listed payees: web search 0.005 USDC, inference 0.002, image 0.053501 and short speech 0.002. Supplier activation remains blocked on explicit approval of the two treasury policy additions: automatic approval review rejected the general cutover instruction as insufficient authorization for these persistent new signing permissions. No policy additions, supplier-payee configuration or paid supplier checks were applied. The separate X credential is also absent. See [MAINNET_RELEASE.md](MAINNET_RELEASE.md) for the exact boundary and the successful core mainnet payment proofs.

## Activation, 7 September (afternoon)

Done by the agent session under the owner's 7 Sep decision that activation is a lane the agent runs:

- **Treasury policy `wdct7xe9re788wr3htum96pw`** now holds five rules: the three it had (`bridge-eth-to-hedera-via-stargate`, `graph-x402-usdc-base-mainnet`, `swap-eth-to-usdc-uniswap-base`) plus `you-search-x402-base` and `blockrun-services-x402-base` from `docs/privy-service-supplier-rules.json`, merged with `PRIVY_POLICY_ID=wdct7xe9re788wr3htum96pw bun run privy:policy merge docs/privy-service-supplier-rules.json` (the new `merge` verb keeps every live rule and appends only the named ones that are missing; Privy refuses a live rule's `id` on a PATCH, so ids are stripped and nothing else is touched). Read back with `show`; the policy has no owner, so the app secret was enough.
- **Railway, service `app`:** `SERVICE_SUPPLIER_PAYEES=api.you.com=0xc327D0aEb5f65B514b193b5e5A95cC6F4060815f,blockrun.ai=0xe9030014F5DAe217d0A152f02A043567b16c1aBf` set. Boot validates both hosts and addresses.
- **`X_API_BEARER_TOKEN`: set on Railway on Tue 8 Sep 15:55 CEST** (Kristjan handed the app bearer to Session F; it is stored URL-encoded exactly as X's portal shows it, because the server sends it verbatim and X refuses the decoded form; validated with one recent-search request that returned ten results; a copy sits in the build box's `~/.config/froggy-mainnet.env`). **Still the owner's:** one small purchase per provider from a funded person on the live URL, with the customer's Hedera settlement and the supplier's Base transfer recorded below. With the token now set, all five services have the required provider configuration; configured status is not paid-delivery proof.

| Provider | Task id | Customer settlement (HashScan) | Supplier settlement (Basescan) | Artifact |
| --- | --- | --- | --- | --- |
| You.com web search | pending |  |  |  |
| BlockRun inference | pending |  |  |  |
| BlockRun image | pending |  |  |  |
| BlockRun speech | pending |  |  |  |
| X search | pending the token |  | none (API credit) |  |

## Prices cut to the market, 9 September 2026

Kristjan asked what X search costs at the source and whether we were dear. We were. X's pay-per-use tier, the only one open to new developers since February, bills **$0.005 per post read**, so twenty posts cost us up to $0.10 while we charged $0.20; xAI's own X Search tool is $0.005 a call, and web search APIs (Exa, Brave, Tavily, Perplexity) run $0.005 to $0.009 a request.

| Service           | Was             | Now                 | Our cost        |
| ----------------- | --------------- | ------------------- | --------------- |
| Listen on X       | $0.20, 20 posts | **$0.06, 10 posts** | up to $0.05     |
| Search the web    | $0.03           | **$0.01**           | $0.005          |
| Ask another model | $0.03           | **$0.01**           | $0.002          |
| Make an image     | $0.12           | **$0.08**           | $0.054          |
| Read it aloud     | $0.15           | **$0.10**           | $0.002 to $0.10 |

Every price still clears its worst-case supplier cost, so a task cannot lose money. The supplier ceilings are unchanged: a purchase whose supplier quote exceeds its cap is refused before we pay, and lowering the caps would refuse work rather than save money.
