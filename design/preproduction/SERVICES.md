# Services readiness

Product-provider readiness, kept **separate from the design toolchain** in `TOOLCHAIN.md`. Audited 10 September 2026 against `main`, plus one live read of the deployed app's own health endpoint.

## What the statuses mean

| Status | Meaning |
| --- | --- |
| `unknown` | Not yet looked at |
| `documented` | Vendor documents it; nothing checked here |
| `configured` | Real credentials present; no call proven |
| `stubbed` | Running against the loud stub, marked in the UI, `stubbed: true` on receipts |
| `adapter-live` | The service reports itself healthy with real credentials |
| `journey-verified` | A complete user journey through it was observed end to end |

**`adapter-live` is not `journey-verified`, and the gap is the whole point of this file.** A healthy adapter proves credentials and reachability. It does not prove that a person can complete a purchase, that settlement reconciles, or that a failure path is handled. Nothing below is marked `journey-verified` on the strength of a health check.

## How the repository decides

`apps/server/src/environment.ts` is the only place in the codebase that branches on an environment variable. Each integration has a placeholder default; a variable still holding its placeholder puts that service in `stub` mode and the factory returns the stub. A stub is loud by design — `serviceModes` is published to the browser, the wallet pane shows a chip per stubbed integration, and every receipt a stub touches carries `stubbed: true`.

It also refuses to boot with stub adapters on a public origin, so a deployed URL cannot quietly serve fake settlement. That is the single most important safety property in this list and it is already enforced in code.

## Live evidence, 10 September 2026

`GET /health` on the deployed app returned:

```json
{
  "hederaAccounts": "own",
  "modes": {
    "birdeye": "live",
    "uniswap": "live",
    "quicknode": "live",
    "browser": "live",
    "database": "live",
    "graph": "live",
    "hedera": "live",
    "model": "live",
    "privy": "live",
    "telegram": "live"
  },
  "trading": {
    "enso": "live",
    "jupiter": "live",
    "pons": "live",
    "pump": "live",
    "uniswap": "live"
  },
  "runtime": "bun",
  "status": "ok"
}
```

Every declared integration reports live, including Telegram. No stub chips would show.

## Capability groups

Key **names** only below. No value was read, and `.env` was never opened.

| Group | Where | Provider | Key names | Status | Human dependency | UI states it forces |
| --- | --- | --- | --- | --- | --- | --- |
| Identity, wallet, permissions | `packages/wallet`, `apps/server/src/grants.ts` | Privy | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_KEY_ID`, `PRIVY_AUTHORIZATION_PRIVATE_KEY`, `PRIVY_AGENT_POLICY_ID`, `PRIVY_HEDERA_POLICY_ID`, `PRIVY_PERSON_OWNED_POLICIES` | `adapter-live` | Agent signer consent is granted through a browser button; the user-JWT grant path does not work on production | permission list, allowance remaining, expired grant, revoke, "agent cannot pay yet" |
| Token and wallet data | `packages/graph` | The Graph | `GRAPH_API_KEY`, `GRAPH_GATEWAY_URL`, `GRAPH_PAY_PER_QUERY` | `adapter-live` | key propagation is not instant after issue | stale data, provider unavailable, partial result |
| Market data | `apps/server` | Birdeye, QuickNode | `BIRDEYE_API_KEY`, `TENDERLY_*` | `adapter-live` | — | unavailable, stale price, no result |
| Trade execution | `apps/server`, `packages/payments` | Enso, Jupiter, Uniswap, Pons, Pump | `ENSO_API_KEY`, `JUPITER_API_KEY`, `UNISWAP_API_KEY`, `PONS_EXECUTION_ENABLED`, `PUMP_EXECUTION_ENABLED` | `adapter-live`; execution behind explicit flags | owner decision per network; gas credits were a live blocker on 9 Sep | quote, quote changed, reauthorize, rejected, pending, uncertain settlement |
| Staking / yield | `apps/server` | Privy Earn vault | `PRIVY_EARN_VAULT_ID` | `configured` | — | variability and fees disclosed, access/withdrawal conditions, **never a guaranteed return** |
| Payments and x402 | `packages/payments` | Hedera x402 facilitator | `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `HEDERA_FACILITATOR_URL`, `HEDERA_NETWORK`, `HEDERA_PAY_TO`, `HEDERA_KEK`, `HEDERA_HCS_TOPIC_ID` | `adapter-live` | network choice is an owner decision; the fee-payer rule is a known trap | quote, paid, pending, uncertain, receipt |
| Hosted browser and takeover | `packages/browser` | Browser Use Cloud v3 | `BROWSER_USE_API_KEY`, `MAX_BROWSERS`, `RESERVED_BROWSERS`, `BROWSER_IDLE_MS`, `BROWSER_COUNTRY` | `adapter-live` | a person must take over for login and card entry | watching, taking control, handoff, disconnect, retry, closed-but-still-running |
| Merchant checkout | — | — | — | **`unknown`** | **card checkout is a human handoff; there is no supported automated route** | explicit handoff, redacted entry, "Froggy cannot complete this" |
| Notifications | `apps/server` | Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET_TOKEN` | `adapter-live` | bot token is owner-supplied | linked, unlinked, quiet hours, stale approval expired, duplicate decision prevented |
| Inbound MCP | `apps/server`, `skills/froggy` | own surface | OAuth, no key | `adapter-live` | external client consent | consent and scopes, originating assistant shown, granted allowance, expiry, revoke |
| Durable tasks and watches | `packages/domain/src/schedule.ts`, `apps/server/src/schedule-routes.ts` | own | — | `configured` | — | cadence, expiry, paused, stale, stopped; "scheduled, not continuous" |
| Model | `apps/server` | Alibaba MaaS (Qwen), Anthropic fallback | `OPENAI_COMPATIBLE_*`, `ANTHROPIC_API_KEY` | `adapter-live` | — | thinking, tool running, capped output |
| Database | `packages/database` | Postgres (Neon) | `DATABASE_URL` | `adapter-live` | — | — |
| Assets storage | — | — | — | **`unknown`** | design assets currently live in the repository | — |
| Observability | — | PostHog available via MCP; not wired into the product | — | **`unknown`** | — | — |

## The three gaps that change the design

1. **Merchant card checkout has no automated route.** Model it as an explicit human handoff, with the card entry redacted from recordings and never in model-visible content. Do not design a flow that implies Froggy can complete an arbitrary checkout.
2. **The agent signer needs a browser consent click.** Until it is granted, the honest UI is "the agent cannot pay yet" — not a disabled button with no explanation.
3. **Asset storage and observability are undecided.** Neither blocks design. Neither should be invented in a screen. Never create a public bucket by default.

## Backlog, ordered

1. A `journey-verified` run of the first vertical slice: Home → task → structured result → approval → receipt.
2. The uncertain-settlement path, proven not to offer a second debit.
3. Reauthorization when a material purchase detail changes.
4. Human-handoff checkout, with redaction verified in the recording.
5. Quiet hours, task expiry and duplicate-decision prevention across web and Telegram.
6. Asset storage decision; observability wiring.

Nothing here authorizes a production transaction or a live notification test. Those remain separately gated.
