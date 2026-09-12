# Trading implementation

8 September 2026. Execution checklist for [the provider plan](TRADING_PROVIDERS.md) and [sponsor review](SPONSOR_TRADING_APIS.md). See [the operator and API guide](../TRADING_SERVICES.md) for the current configuration, request examples and limits.

## First delivery: data and unsigned quotes

The person can request token research or a swap quote from the Services page, chat or an external MCP client. Every operation returns a durable task, a bounded structured result and a receipt. Provider credentials belong to the server. This milestone builds no approvals, signatures or trades into a quote request.

- [x] Add versioned contracts for `market_search`, `token_inspect`, `rpc_read` and `quote_action`, preserving existing text services and stored results.
- [x] Wire Birdeye search/new listings and token overview/security, preserving unknown information and provider timestamps.
- [x] Wire configured Quicknode EVM/Solana endpoints with method-specific read schemas, chain verification and response limits.
- [x] Wire Uniswap Classic quote and approval checks. Return unsigned summaries with a TypeID and explicit freshness; expose no signing tool.
- [x] Extend the existing paid service coordinator with full-request idempotency, provider preflight before charging and consistent simulation markers on tasks, sales and receipts.
- [x] Publish per-operation supported networks, availability, input schemas and configured prices. No live purchase when its provider credentials or price are missing.
- [x] Expose named object-schema tools through MCP and chat, with the same HTTP coordinator and result retrieval.
- [x] Add structured service forms and keep results in the existing task history.
- [x] Verify adapters, concurrent retries, changed inputs, unsupported requests, cross-user access, payment failures and all three entry points.
- [x] Run targeted tests, `check:fast`, `check`, build, browser error checks and E2E; report unrelated worktree failures separately.

Use ordinary API credentials upstream. Froggy charges for its service once; result polling and retries of the same request do not create another supplier purchase. Live prices must be configured after account costs and quotas are reviewed. The default fixture price is solely for local simulated runs.

## Local verification

- `bun run check:fast`, `bun run check` and `bun run build` passed. The full check includes 350 server tests and all other workspace gates.
- Provider, configuration, paid-coordinator and chat tests cover the four operations, secret masking, rejected inputs, durable results, duplicate requests and unsigned quote behavior.
- Browser coverage includes token search, saved-result recovery and an unsigned quote at 320 pixels, with no page errors or horizontal overflow. The full suite passed 110 of 113 cases initially; the three affected existing cases passed on isolated rerun.
- The rerun used a workspace-local `TMPDIR` and a 90-second test budget. The machine temporary filesystem was full, and the failed deletion trace showed Chromium `ERR_INSUFFICIENT_RESOURCES` while loading application modules. No application or test assertions were changed for these reruns.

These are local checks with explicit provider fixtures. Live provider delivery, production pricing and funded execution have not been verified or activated.

## Follow-on milestones

1. **Simulation and additional routes:** Tenderly EVM simulation, Jupiter Solana quotes, one Enso yield route and Pons/Pump lifecycle validation. Confirm actual API access and protocol coverage before advertising each capability.
2. **Controlled execution:** reviewed Privy policies, immutable transaction proposals, atomic capital reservations, persisted transaction identity, reconciliation and human authority checks. Execute an approved swap, then a supported withdrawal/claim followed by a swap.
3. **Persistent launch reactions:** durable event cursors, freshness/gap reporting, bounded watches and user-authorized buy/exit rules. Validate both sides of a launch graduation; unavailable exits remain explicit.

The data delivery is complete. Controlled execution is in progress below; funded verification and prize submissions remain outstanding.

## Full implementation and deployment

Requested 8 September 2026 after the first delivery. Deployment of the completed application to the existing Railway production service is authorized. Live trading-provider credentials are not yet configured there.

- [x] Persist immutable trade proposals, simulations, transaction attempts, capital reservations and human-issued trading rules.
- [x] Build Uniswap, Jupiter, Enso and native Pons/Pump routes; validate transaction contents and independent simulation before signing.
- [x] Support positions and supported withdrawal proceeds (claims remain explicitly unavailable) followed by a swap, with explicit waits and partial outcomes.
- [x] Expose prepare, simulate, execute and status through HTTP, MCP and chat, with approval restricted to authenticated people.
- [x] Add durable bounded launch watches, gap recovery, entry/exit rules and cancellation.
- [ ] Complete provider/configuration, accounting, adversarial, restart and browser verification.
- [ ] Deploy the verified build and migrations to Railway; verify health, authentication and the installed capabilities.
- [ ] Verify live provider delivery where credentials are available; document any configuration that still prevents live testing.

### Execution progress

The local implementation supports independently simulated Uniswap V3 swaps on reviewed Ethereum, Base and Robinhood networks and Jupiter Metis swaps on Solana mainnet. Each route advertises its own configuration and fixture status. Human approval binds the exact payload, wallet, fees and expiry; transaction identity is stored before broadcast and background recovery reconciles it without another signature. Native SOL principal and fees share one atomic balance reservation. Confirmed transactions with insufficient proceeds or excessive fees retain their chain facts and produce a partial outcome. Base and Base Sepolia share the mainnet Uniswap path with rollup data fees reserved inside `maxNativeFee` per [decision 0022](../decisions/0022-rollup-fee-budget.md). Robinhood Uniswap execution uses the published Universal Router 2.1.1 for ordinary V3 pools; Pons remains the venue for curve and hooked graduated markets.

HTTP, MCP, chat and the wallet trade panel expose preparation, simulation and status. Only the authenticated person can approve execution, change rules or stop trading. Jupiter and Uniswap browser flows have passed with explicit fixtures. The full repository gate and production build passed after the settlement refinements. All four affected trading browser cases passed, including reload recovery and the narrow Solana layout.

The Uniswap, Jupiter, Enso and withdrawal-proceeds baseline was deployed on 9 September as Railway deployment `16d0468a-a824-4ef8-ad49-dcff2ce37b31`. Public health, authentication boundaries and the mobile sign-in page passed live checks. All 122 browser cases passed locally before that release. Native launch additions and bounded listing watches below are still local; rule-triggered execution remains unfinished. No funded trade has been run.

The operator renewed the end-to-end implementation and deployment request on 9 September. The earlier automatic approval block was resolved and Enso work resumed.

Enso Ethereum ERC-4626 deposits and share redemptions now have bounded provider discovery, nested Weiroll call validation, exact allowances, independent Tenderly simulation and the existing persisted execution/recovery path. Only direct reviewed call sequences without provider fees are accepted. The positions view independently reads balances and synchronous redemption limits; queued exits, reward claims and historical realized yield remain explicitly unknown or unsupported.

A completed withdrawal can fund a separate swap through `sourceTradeId`. The new proposal requires fresh human approval. Its input must match the confirmed source wallet, network, asset and execution mode, and the atomic capital claim prevents allocating the same proceeds twice. HTTP, MCP and chat use the same versioned preparation contract. All seven trading browser flows passed, including positions-to-withdrawal-to-swap. The full repository gate passed with 387 server tests, and the production build passed. The subsequent full browser suite passed and this baseline was deployed as described above.

### Native Pump additions (local)

The adapter validates canonical bonding-curve and graduated-pool transactions, refreshes the blockhash, independently simulates bounded principal and fees, and rechecks launch phase before signing. Finalized receipts use the saved phase and signed bytes; graduation after submission does not invalidate recovery. Native buys reserve a maximum allocation and preserve the actual consumed input in immutable settlement evidence. Above-budget settlement remains a partial outcome with its chain facts intact.

`PUMP_EXECUTION_ENABLED` defaults to `false`. With no Solana RPC, the app offers a visibly simulated curve fixture. RPC configuration alone leaves the route unavailable; live activation also requires the explicit flag and live Privy. Automatic approval review rejected activation based solely on RPC; this explicit, disabled-by-default configuration was accepted as the safer alternative. Production configuration has not been changed. Mayhem, cashback, non-SOL quote pools, transfer hooks, transfer fees and delegated token authority are unsupported.

Native tests exercise buys and sells in both phases, changed recipients and bounds, stale phase before signing, recovery after phase changes, Token-2022 restrictions, actual-input accounting and immutable receipts. All ten trading browser cases pass, including Pump buy and sell receipts and the listing watch mobile flow. The Pump unit tests cover both phases; browser fixtures do not prove live chain execution.

## Persistent listing watches (local)

`watch_launches` now runs through the existing paid task coordinator with a configured fixed bundle price and no per-poll payment. Versioned contracts, memory/Postgres storage, server lifecycle polling, HTTP/MCP/chat status and cancellation, and a Services form/history view are implemented. Capacity, deduplication, expiry, provider mode and gaps survive restart. Connection ownership is fixed at purchase. Account reset cancels watches and retains history. Provider metadata remains explicitly unverified; no replay cursor or complete coverage is claimed.

Focused paid-service/watch tests pass, including HTTP/MCP replay and authority injection refusal. Separate PostgreSQL connections pass shared budget and immutable history tests against a disposable database. All ten trading browser tests pass, including mobile watch cancellation and reload. The full unit suite passed with 406 server tests before the additional account-reset watch test. The shared workspace's concurrent browser implementation currently prevents a clean full formatting/type gate; this watch addition has passed scoped type-aware lint. Watch migration `0015` has only been applied to the disposable database. Pump/watch changes are not deployed. Automatic entry and exit rules remain to be connected.

## Native routes and rules verification — 9 September

Pons curve and graduated-pool buy/sell routes, native confirmed-log watches, and human-issued entry/exit rules are implemented locally. Pons transactions passed four buy/sell checks against a disposable local fork of real deployments; no mainnet transaction was submitted. A separate read-only production RPC check verified the factory and confirmed watch cursor, then resumed it successfully. Pump tests cover both lifecycle phases. Unsupported reward claims and queued withdrawals remain explicit.

Automatic reactions persist check claims, trade identities and progress across workers and restarts. Entry and exit authority share atomic wallet accounting. Orphaned or stale launch observations cannot trigger entries. Rule authorization, reload and revocation passed in the actual UI at 320 pixels with no page errors or horizontal overflow. The fast gate, full repository gate (453 server tests) and production build passed. The final full browser suite and deployment are recorded below when complete.
