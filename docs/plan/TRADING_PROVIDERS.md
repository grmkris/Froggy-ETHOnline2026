# Trading providers and implementation plan

8 September 2026. Provider roadmap; provider documentation and local source reviewed. The first local delivery now includes Birdeye market reads, configured Quicknode RPC reads and unsigned Uniswap quotes. See the [implementation checklist](TRADING_IMPLEMENTATION.md) and [operator/API guide](../TRADING_SERVICES.md) for the implemented scope and verification status.

## Product decision

Claude Code and other connected agents choose what to investigate and trade. Froggy exposes structured tools, buys the required data, prepares transactions and executes within the person's authority. The same tools are available to Froggy's chat. Provider adapters and ordinary persistent server jobs implement this; there is no additional research agent inside a provider call.

Cover meme discovery, newly launched tokens, buys and sells, yield positions, and withdrawal or reward proceeds used to buy another token. Support is explicit by chain, protocol, action and launch phase. Discovery support never implies trading support.

## Providers to wire

| Provider | Backend responsibility | Initial connection |
| --- | --- | --- |
| **Birdeye** | Recent token listings, token market/security data and holder information where supported. | API key; new listings and token inspection endpoints. Its holder-profile endpoint is Solana-only. |
| **Quicknode** | EVM/Solana RPC, account state, events, transaction submission/status and Solana simulation. | Configured HTTP endpoints; WSS endpoints for persistent watches. Credential-bearing URLs are secrets. |
| **Uniswap Trading API** | EVM buy/sell quotes and unsigned executable swap transactions. | API key; approval check, quote and swap endpoints; Classic routing initially. |
| **Jupiter Swap API v2** | Solana swap orders and managed transaction submission. | API key; order, then execute after Froggy validates and signs the returned transaction. |
| **Enso** | Supported EVM yield deposits, withdrawals and action composition; harvest/claim only where the particular protocol exposes it. | API key; token/position discovery, route and bundle APIs. |
| **Tenderly** | EVM transaction and sequential bundle simulation, decoded failures, gas and balance changes. | Access key and account/project, or a configured simulation RPC endpoint. |
| **Privy — existing** | The person's wallets, transaction signatures and independent signer restrictions. | Extend the existing wallet integration for reviewed trade transactions; payment signing alone is insufficient. |

Use one fixed provider per operation initially. The [sponsor API review](SPONSOR_TRADING_APIS.md) changes the initial EVM choice to Uniswap and retains 1inch Classic and 0x as alternatives for measured route gaps. Existing The Graph lending reads remain useful context. Additional overlapping market-data providers can be added when a concrete coverage gap warrants them.

Primary references, checked 8 September:

- [Birdeye new listings](https://docs.birdeye.so/reference/get-defi-v2-tokens-new_listing), [holder profile](https://data.birdeye.so/docs/data-api/holder/get-token-v1-holder-profile), [x402 coverage](https://data.birdeye.so/docs/agents/x402-agentic-payments).
- [Quicknode x402 and transports](https://www.quicknode.com/docs/build-with-ai/x402-payments), [Robinhood RPC](https://www.quicknode.com/docs/robinhood/api-overview).
- [Uniswap Trading API](https://developers.uniswap.org/docs/trading/overview), [supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains), [quote contract](https://developers.uniswap.org/docs/api-reference/aggregator_quote). Optional alternatives: [1inch Classic](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/quick-start), [0x Swap](https://docs.0x.org/docs/introduction/quickstart/swap-tokens-with-0x-swap-api).
- [Jupiter Swap v2 order/execute](https://developers.jup.ag/docs/swap/order-and-execute), [API access](https://developers.jup.ag/docs/portal/setup).
- [Enso routes](https://docs.enso.build/pages/build/get-started/route), [bundles](https://docs.enso.build/pages/build/get-started/bundling-actions), [OpenAPI](https://docs.enso.build/public/openapi.json), [withdraw and swap](https://docs.enso.build/pages/use-cases/lending-markets/withdraw-and-swap).
- [Tenderly simulation](https://docs.tenderly.co/simulations/overview), [sequential bundles](https://docs.tenderly.co/simulations/bundled-simulations), [network/product coverage](https://docs.tenderly.co/platform/supported-networks).

### Fresh launches

Preserve the Trading Desk discovery coverage for Pons/Robinhood, Pump/Solana, Clanker/Base and Four.meme/BNB. Port the relevant event decoding and evidence handling with attribution; do not depend on the private Desk process in production.

Explicitly validate **Pons and Pump** as the first complete launch lifecycles. Pons has existing curve and graduated-pool research/simulation code. Pump has an [official unsigned swap builder](https://github.com/pump-fun/pump-fun-skills/blob/main/swap/SKILL.md) that selects its curve or PumpSwap route. Use an aggregator when it returns a valid route; use the supported native builder where needed. The exact transaction must still pass Froggy's checks.

Clanker and Four.meme events remain discoverable. Normal aggregator routes can be enabled after validation; unsupported early hook, auction or TokenManager paths return a clear unsupported result. Add direct builders for those phases as a separate adapter task. Jupiter can route some bonding-curve markets: do not blanket-classify all ungraduated tokens as unsupported.

An included launch log, a backfilled event and a pending transaction are distinct observations. This plan establishes measured fresh-launch trading; it does not claim first-block ordering or universal mempool sniping.

## Tools and shared contracts

| Proposed tool | Operation |
| --- | --- |
| `market_search` | Recent launches and token/pool lookup; structured chain, protocol, age and cursor filters. |
| `token_inspect` | Market state, token controls, holder/flow findings and account-specific trading restrictions, with unknowns preserved. |
| `rpc_read` | Allowlisted read methods and bounded batches on configured chains. No signing or transaction submission through this tool. |
| `positions` | Wallet balances and supported yield positions, separating marked value, claimable rewards, withdrawable assets and reserved funds. |
| `quote_action` | A buy, sell, deposit, withdraw or claim; optionally one supported withdrawal/claim followed by a swap. Returns an immutable proposal and required approvals. |
| `simulate_action` | Simulate the exact proposal and sender, carrying state between dependent steps. |
| `execute_action` | Execute an immutable proposal under current user authority, then reconcile actual effects. |
| `watch_launches` | A persistent, bounded observation job. Authorized automatic reactions are added after execution is proven. |
| `task_get` | Retrieve status, result, evidence and receipts without buying the operation again. |

Extend the existing service catalog with supported operations, chains, phases, schemas, availability and prices. The names above are proposed contracts, not additional generic signing or approval endpoints.

Use versioned Effect Schemas and TypeIDs. Asset identity is chain plus contract/mint; quantities are integer base-unit strings. Results retain source time, receipt time, block/hash or slot/commitment, limitations and bounded evidence. Keep data-chain support separate from payment and execution support.

## Payment and authority

Build on [X402_PURCHASING.md](X402_PURCHASING.md), the existing service-task accounting and `WorkspaceSession.spend`. The purchase work is underway concurrently; its coordinator must be usable before these integrations add another paid path.

Customers pay for Froggy operations through the existing configured x402 rail. Ordinary provider credentials are the initial upstream connection; the operator pays those provider costs. Birdeye, Quicknode and 0x also document upstream x402 options. Those can use the reviewed treasury payer later, with explicit supplier limits. Do not charge the user a curated service fee and silently add a second direct supplier debit.

A paid operation has a published price/resource bound and a request-bound idempotency key. A completed simulation that reports a revert is a delivered result. A provider outage is a delivery failure; preserve whether money settled and do not automatically rebuy. Polling and result retrieval are included. Measure provider and payment costs before publishing prices. Buy watch capacity for a bounded period rather than settling a payment for every event.

API expenses, transaction gas and investment capital have separate limits. Trade principal stays in the user's wallet/protocol positions, outside Froggy's merchant treasury. User authority is checked again before signing; tools cannot add signers, raise limits or approve themselves. For future tokens, the user must be able to authorize a bounded launchpad/factory class, with per-position and total allocation limits.

## Implementation order

### 1. Provider connections and read tools

- Add redacted provider configuration in `environment.ts` and `.env.example`; add provider adapters under `apps/server/src/trading/`. Keep the existing wallet/browser dependency boundary intact.
- Wire Birdeye and Quicknode first. Expose `market_search`, `token_inspect`, `rpc_read` and read-only account state through HTTP, MCP and chat.
- Add decoded response fixtures and explicit demo/configured/unavailable status. Every stubbed provider result and affected receipt carries `stubbed: true`; live mode cannot silently deliver a fixture. Verify endpoint authentication, actual chain coverage and response limits before publishing a capability.
- Reuse Desk's event identity, timestamps, orphan handling and gap tracking. Expose streaming gaps and freshness; do not turn an empty sample into a claim of no launches.

### 2. Quotes and simulation

- Wire Uniswap, Jupiter, Enso and Tenderly. Follow Enso's current SDK with GET `/api/v1/shortcuts/route` and POST `/api/v1/shortcuts/bundle`; set slippage explicitly. Use `routingStrategy: "router"` initially, with the user's wallet as receiver and refund receiver. Resolve supported protocol actions from its catalog rather than accepting a free-form protocol name from the agent.
- Support ordinary EVM/Solana buy and sell proposals, then Pons/Pump native routes. Match current launch phase to the proposal and revalidate it before execution.
- Support one verified Enso yield deposit/withdrawal route, initially on an EVM chain where wallet, provider and simulation support intersect. Add reward claims only when demonstrated for that protocol and execution context. Non-tokenized positions and owner-bound claims that need delegation are not implied by router support.
- Expose exact transaction data internally, a readable proposal externally, and simulation results. Validate chain, sender, recipient, input, minimum output, expiry, fee/tip caps and allowance spender. Bind all of them to the proposal fingerprint.
- For Uniswap, require Classic routing, exact-amount permits and reviewed approval targets; start with no-hook routes. Validate Permit2 typed data separately from router calldata and normalize percentage slippage explicitly. Unknown tax metadata stays unknown. For Jupiter, an order with no buildable transaction is not executable.
- Tenderly handles supported EVM simulations; Quicknode Solana `simulateTransaction` handles SVM preflight. Preserve the block/slot and account state assumptions. Existing Pons Anvil fixtures are regression material, not evidence of universal chain support or funded readiness.

### 3. Controlled execution and yield proceeds

- Add the trade proposal/attempt lifecycle and asset reservations to existing persistence. Persist signed-transaction identity before sending; reconcile timeouts, restarts and pending transactions before another economic order can start.
- Extend Privy signing for reviewed EVM transactions and Solana messages. Decode all returned instructions/calls and enforce actual effects/constraints; an approved provider host or router address alone is insufficient authority.
- Broadcast EVM transactions through configured RPC. Submit signed Jupiter orders through its execute endpoint; use RPC for supported native launch transactions. Read transaction outcomes and actual wallet deltas independently.
- Deliver `execute_action` and receipts through the existing task/approval surfaces. Keep every increase in authority on the authenticated human channel, including when ordinary API purchase caps are disabled.
- Deliver a short typed sequence: withdraw a permitted amount or claim rewards, confirm the spendable output, then buy a selected meme token. Prefer one Enso withdrawal-and-swap shortcut where supported; required approvals may still be separate transactions. A separate Uniswap swap is a later stage. An Enso bundle is atomic only when the actual route proves that behavior; otherwise persist stages and stop downstream actions after failure. Queued withdrawals and cross-chain funding remain explicit waits, not atomic promises.
- Record principal, realized yield/rewards and trading proceeds separately. “Spend only yield” requires a defined accounting basis and actual recoverable value; token appreciation or an APR estimate is not available cash.

### 4. Persistent launch monitoring and bounded reactions

- Add one existing-server worker with durable event cursors, claims, reconnect recovery and stop times. Serve bounded event history/status to the agent rather than forwarding every frame into its context.
- Let Claude configure filters and request observations. For automated buys/exits, execute a small set of predefined actions under an existing human-issued trading mandate. A watch or schedule cannot expand authority.
- Keep the event reaction independent of model response time and fresh x402 handshakes. Recheck route phase, liquidity, wallet reservations, expiry and authority at dispatch.
- Implement price/time/liquidity exit attempts for supported positions, and route changes at graduation. A trigger does not guarantee a fill. Preserve failed attempts, costs and unavailable exits.

## Required delivery checks

- A real external MCP client discovers a token, buys an inspection/quote, retrieves its simulation and sees the matching receipt. Duplicate/reconnected calls return the same operation without another charge.
- Missing credentials, unsupported chains, unknown taxes, stale data and no route each produce distinct results. Cross-user task/evidence access is denied.
- Pons/Pump buy/sell checks cover both supported lifecycle phases, phase changes after quoting, actual consumed/refunded amounts and unavailable exits.
- A yield withdrawal or claim followed by a meme purchase accounts for intermediate balances and every fee; a failed/queued first step cannot spend nonexistent proceeds.
- Excessive input/allowance/tips, altered recipients, wrong chains, expired proposals and attempts to expand authority are refused. Concurrent actions reserve capital atomically. Privy policy counters do not replace these reservations.
- Test timeout after submission, pending transactions, revoked authority, restarts, duplicate events and unavailable exits. A user can stop future automation and retain a documented direct wallet/position exit path.
- Follow `froggy-verification`: focused accounting/transport tests, `bun run check:fast`, full `bun run check`, builds and `bun run e2e` for the task/approval UI. Boot the app and exercise the changed flow. Stubs establish local behavior; they do not prove paid delivery or a settled trade.

Provider docs establish advertised interfaces, not measured latency or a successful paid response. Prepare precise provider configuration and live proof requests after local implementation. This plan does not change deployed policies, purchase subscriptions, deploy code or authorize live trades.

## Configuration handoff

Required operator inputs are Birdeye, Uniswap, Jupiter and Enso API keys; chain-specific Quicknode HTTPS/WSS endpoints; Tenderly credentials; and the existing Privy environment. A later 1inch or 0x adapter adds its own credentials. Store them only as redacted server configuration. Missing setup makes the affected capability unavailable. Server-selected hosts and verified deployment/program identities are configuration, never agent-supplied signing destinations.

Before activating each route, resolve its current deployment from a primary source and confirm its code/program identity. Do not copy addresses from the ETHSkills overview or historical reports as production configuration. EVM yield support, Solana execution and Robinhood simulations each have their own capability gate.

Research context: [Trading Desk references](/home/kristjan/code/trading-desk/references/README.md), [LP/yield findings](/home/kristjan/code/trading-desk/docs/lp-reference-research-2026-09-08.md), [ETHSkills](https://ethskills.com/SKILL.md), and [ERC-4626 withdrawal semantics](https://eips.ethereum.org/EIPS/eip-4626).
