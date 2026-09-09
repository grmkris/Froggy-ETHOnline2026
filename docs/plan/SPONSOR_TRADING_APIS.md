# Sponsor trading APIs for Froggy

8 September 2026. Research and proposed implementation changes, checked against the official ETHOnline 2026 pages and provider documentation. No paid calls or trades were made.

## Recommendation

Use **Uniswap Trading API as the first EVM swap provider**. It fits the existing proposed quote → simulate → Privy sign → RPC submit flow, and API integration is explicitly eligible for this event's Uniswap prize. Keep **1inch Classic Swap as an optional second EVM provider**, added when route coverage or execution quality justifies it. Its API alone does not satisfy the 1inch prize: that requires an Aqua application.

This updates the EVM provider choice in [TRADING_PROVIDERS.md](TRADING_PROVIDERS.md). Birdeye, Quicknode, Jupiter, Enso and Tenderly keep their assigned roles. Claude Code still reasons over Froggy's structured tools; neither swap adapter needs another LLM.

The phrase “one in Chakra” is interpreted provisionally as **1inch**. The official sponsor list includes 1inch and has no entry named Chakra.

## Sponsor fit

The [official prize list](https://ethglobal.com/events/ethonline2026/prizes) names eleven partners. The recommendations below are our assessment of fit with Froggy, rather than claims of eligibility.

| Sponsor | Fit with this plan | Recommendation |
| --- | --- | --- |
| Uniswap Foundation | EVM swap quotes and transaction construction. | First EVM swap adapter. |
| 1inch | EVM aggregation; Aqua for programmable liquidity. | Optional Classic adapter; evaluate Aqua separately. |
| Privy | Wallets, signing and spending controls already used by Froggy. | Extend the existing integration for trades. |
| The Graph | Existing lending research and indexed protocol data. | Keep as a source for decisions and position context. |
| Hedera | Existing x402 service settlement. | Keep the paid toolbox's configured payment rail. |
| Arc / Circle | Stablecoin treasury and cross-chain funding. | Later, if moving funds between chains becomes necessary. |
| Chainlink | Risk data and workflow automation. | Consider for a defined risk/workflow feature. |
| Bazantic | Composing and selling API workflows through x402/MCP. | Evaluate as optional distribution for the toolbox. |
| Ledger | Hardware-backed signing and secrets. | A separate signer/security integration. |
| ENS | Names and service/agent identity. | Useful later; does not supply trading execution. |
| World | Human/agent verification. | Useful for access or abuse controls, not swap routing. |

The adjacent prizes require additional implementation: [Arc](https://ethglobal.com/events/ethonline2026/prizes/arc) expects meaningful Arc/USDC use; [Chainlink](https://ethglobal.com/events/ethonline2026/prizes/chainlink) emphasizes CRE Confidential Workflows; [Bazantic](https://ethglobal.com/events/ethonline2026/prizes#bazantic) has a prize for working recipes combining sponsor APIs through its gateway. These are possible later features, not automatic eligibility from ordinary API calls.

## Uniswap Trading API

The API builds routes and unsigned transactions; Froggy can retain its own signer and transaction submission. Base, BNB and Robinhood appear in the supported-chain list, alongside supported Sepolia test networks. Solana does not, so Jupiter remains necessary. Router versions differ by chain: resolve current deployments rather than assuming the same router everywhere. [Trading overview](https://developers.uniswap.org/docs/trading/overview), [supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains).

**Connection:** server-only `UNISWAP_API_KEY`, sent as `x-api-key` to `https://trade-api.gateway.uniswap.org/v1`. The current FAQ describes free API access with a default six requests per second; transaction gas and swap costs remain separate. Treat rate limits as configuration and confirm account terms when activating. [API FAQ](https://developers.uniswap.org/docs/trading/swapping-api/faqs).

The `quote_action` tool returns unsigned quote/permit data and approval requirements. Approval/reset broadcasts and Permit2 signatures belong only to `execute_action`, after authority checks and capital reservations. Any calldata built after signing must remain bound to that same quote and its approved constraints.

Initial adapter flow:

1. Call POST `/check_approval` for the wallet, chain, input token and amount. Review any approval/reset transaction and apply the permitted allowance bound. Return it as an unsigned requirement; execution must confirm the approval before relying on its resulting state.
2. Call POST `/quote` with `EXACT_INPUT`, integer base-unit amount, token identities, equal input/output chain IDs, the wallet as swapper and recipient, and explicit slippage. Request `protocols: ["V2", "V3", "V4"]`, `permitAmount: "EXACT"` and `hooksOptions: "V4_NO_HOOKS"` initially.
3. Require a `CLASSIC` response. If it includes `permitData`, validate its domain, token, spender, amount, nonce and expiry before signing that quote's EIP-712 data through Privy during authorized execution.
4. Call POST `/swap` with the quote and any required permit data/signature. Request simulation, validate and independently simulate the returned transaction, then use the planned execution coordinator to sign and broadcast it.

Two details need explicit tests: `permitAmount` defaults to `FULL`, and `slippageTolerance` is a percentage (`0.5` means 0.5%). Normalize the shared contract's units in the adapter; do not forward another provider's basis-point value unchanged. [Quote reference](https://developers.uniswap.org/docs/api-reference/aggregator_quote), [swap reference](https://developers.uniswap.org/docs/api-reference/create_swap_transaction), [OpenAPI schema](https://trade-api.gateway.uniswap.org/v1/api.json).

UniswapX uses signed orders and fillers. Its `DUTCH_V2`, `DUTCH_V3` and `PRIORITY` responses go to `/order`, not `/swap`; `CHAINED` plans also need separate handling. Return an unsupported-routing result for these in the first adapter. [Routing documentation](https://developers.uniswap.org/docs/trading/swapping-api/concepts/swap-routing).

For meme launches, a supported chain and v4 routing are only the starting point. The initial no-hooks setting deliberately excludes hook-dependent pools. Keep the Pons/Pump launch adapters and add specific Clanker/Four.meme/hook routes after validating their launch phase and transaction behavior. Neither the API nor this review establishes first-block fills.

### Uniswap prize

The event allocates **$3,000** to the general stack contribution track (up to three $1,000 awards) and **$2,000** to Continuity (two $1,000 awards). Trading API integrations are in scope; a custom hook is unnecessary. Required submission artifacts are a public open-source repository, `FEEDBACK.md`, the completed developer feedback form linking that file, and README pointers to the relevant implementation. The page does not prescribe a mainnet transaction or a particular testnet. A working swap plus a receipt is our proposed evidence, not an additional published rule. [Exact ETHOnline 2026 Uniswap prize](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation).

## 1inch

### Classic Swap: straightforward alternative

Use server-only `ONEINCH_API_KEY` as a Bearer token. Classic v6.1 exposes GET `https://api.1inch.com/swap/v6.1/{chain}/quote` and `/swap`. The latter returns transaction fields including sender, destination, calldata and value; Froggy validates them, signs through Privy and broadcasts through RPC. Resolve the approval spender through official API/deployment data and bound the allowance. Base is covered by the official quickstart. [Classic quickstart](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/quick-start), [swap reference](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/methods/v6.1/1/swap/method/get).

This fits the same `quote_action` and `execute_action` contracts as Uniswap or 0x. Keep provider identity on every immutable proposal; obtaining a different provider's quote creates a new proposal. Never change the router after approval or launch a second economic trade merely because the first submission timed out.

Fusion introduces an order auction filled by resolvers, and Fusion+ adds cross-chain escrows and secret revelation. They need order/escrow lifecycle handling beyond the initial Classic adapter. Broad platform Solana support does not make this EVM Classic endpoint a replacement for Jupiter. [Fusion](https://business.1inch.com/portal/documentation/apis/swap/intent-swap/introduction), [Fusion+](https://business.1inch.com/portal/documentation/apis/swap/cross-chain-swap/introduction).

1inch also advertises x402 for Swap and Web3 RPC. Its current setup uses USDC on Base, batch settlement, a minimum $2 prepaid deposit and a wallet linked to a verified Business Portal organization. That is a separate supplier payment setup from Froggy's Hedera rail. Start with ordinary API credentials, as in the main plan. [1inch x402](https://business.1inch.com/portal/documentation/payment-methods/x402).

### Aqua: relevant to yield, but a separate feature

Aqua lets makers create and revoke liquidity strategies while keeping tokens in their wallet. It is worth exploring for “earn with idle assets, then allocate proceeds,” but is not a generic Aave withdrawal API. A Froggy feature would need strategy creation/revocation, reserved inventory, actual fill/fee accounting and exits. Tokens backing an active strategy cannot also be treated as freely available snipe capital merely because they remain in the wallet. [Agentic Aqua workflow](https://business.1inch.com/portal/documentation/aqua/getting-started/automate-and-agentic-liquidity).

Current access matters: maker `ship()`/`dock()` operations are permissionless; takers need the `KycNFT` credential, and smart-account/4337 takers are unsupported under the launch gate. Establish the intended maker/taker role and available counterparties before promising live execution. [Current capability status](https://business.1inch.com/portal/documentation/aqua/overview/capability-status).

The event's **$5,000** general and **$2,000** Continuity prizes both target Aqua apps. They require official Aqua/SwapVM contracts, demonstrated token transfers (local forks accepted) and meaningful Git history. SwapVM earns additional judging weight. Therefore, adding Classic, Fusion or Fusion+ alone does not establish qualification. [Exact ETHOnline 2026 1inch prize](https://ethglobal.com/events/ethonline2026/prizes/1inch).

## Implementation changes and proof

1. Replace the initial 0x adapter task with Uniswap Classic on one configured EVM chain, with Base a practical first candidate. Add its server configuration and a loud stub using the existing provider conventions.
2. Keep the shared proposal, simulation, reservations, receipts and execution lifecycle from the main plan. Extend Privy's independently enforced rules for the exact Permit2/router operations; the existing payment policy does not authorize arbitrary swaps. Tools cannot change this authority.
3. Exercise quote, approval/reset, permit, swap, failed simulation, stale quote, unsupported hooks and timeout reconciliation. A provider response is untrusted transaction input. Verify recipients, amounts, minimum output and actual wallet deltas.
4. Demonstrate an agent buying a Froggy quote/simulation, then requesting execution within its mandate. Record the provider, chain, transaction outcome and separate API/gas/principal costs. Add genuine integration feedback after exercising the API.
5. Add **one** of 1inch Classic or 0x when a measured coverage/price gap warrants another route provider. Keep Aqua, UniswapX and Fusion as separately scoped work.

No hosted API keys, deployments, feedback submissions or funded operations were changed by this research. Live behavior, account access and route coverage remain to be verified during implementation.

## Prize nominations

ETHOnline permits **up to three partner nominations**, counting multiple tracks from one partner once. This limits prize entries, not the number of technologies used. The [existing prize audit](PRIZE_AUDIT_FABLE51.md) selects Privy, The Graph and Hedera, so Uniswap or 1inch would require replacing a selected partner. Keep those selections until the implemented demo provides a basis to compare; Uniswap is the strongest additional candidate from this review. [Official event rules](https://ethglobal.com/events/ethonline2026/info/details).

The current audit assumes Start Fresh. If implementation copies project-specific Trading Desk code, reassess the event's prior-work rules and disclose reuse; do not infer eligibility from an existing plan. Only registered Continuity projects can claim the Continuity awards. This document does not change registration or submission choices.
