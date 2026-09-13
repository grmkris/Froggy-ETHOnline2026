# 0033 — Substreams alerts belong to Watchlist

Accepted 13 September 2026. Implemented and verified locally; production rollout remains pending.

## Product behavior

A saved wallet or token can carry an explicit 24-hour onchain watch on Base or Robinhood Chain. Saving alone stays inactive. Wallet rules match native/ERC20 sends and receives, or verified buys and sells, with optional token filters. Token rules match a strict absolute above/below threshold in USD, USDC, USDG or ETH. Equality does not match. A matching first valid observation says “already above/below”; each price rule fires once until manually rearmed. Rearming and resuming preserve expiry. Extending an active watch preserves pending events and the observation baseline; restarting an expired watch requires explicit extension.

The item, its conditions, source, quote unit, expiry, stream health and paginated activity stay in the existing Watchlist. Chat, Telegram and MCP use the same versioned configuration service. Tool confirmations are brief and render a compact Watchlist link. Web controls use owner-scoped routes. External-agent execution rechecks its current automation, Watchlist and notification grants; neither configuration nor event handling creates spending authority.

There are at most three active items per owner across both networks and four rules per item. The shared network subscription budget is twenty distinct wallets and twenty distinct price source keys, expanded to at most one hundred concrete dependencies. Identical active configuration deduplicates atomically by owner and normalized network/address and preserves title, notes and expiry. Archive pauses; restore stays inactive. Pause cancels pending ordinary alerts, and resume starts at the current head without replaying the pause interval.

## Data and price provenance

One long-lived Substreams worker per network runs under the Effect-owned server lifecycle. The packaged Rust module composes Pinax native and ERC20 transfers, bounded swap candidates and independently subscribed price-source changes. It emits every sealed block even with no wallet subscriptions. Flashblocks are not used. The package and embedded transfer descriptors are pinned and documented in `packages/graph/substreams/README.md`; package SHA256, module/schema identity and network fence the saved cursor.

A stream change is a signal to read verified state, not a trusted price. Bounded RPC calls bootstrap and verify oracle or pool identity and read the exact sealed block; hashes are checked before and after. Pool/indexer candidates must pass that verification. The first observation and a bounded heartbeat also refresh sources whose health can change without a subscribed log. Per-source and shared network/block RPC limits prevent one configuration from expanding into unbounded discovery.

Official Chainlink USD feeds are preferred. Direct USDC/USDG/ETH pools require an explicit unit; an explicit USD request never silently becomes another unit. Supported math is Uniswap v2/v3, hookless v4 including the known pools.trade key, Aerodrome volatile pools and individually verified graduated Pons hooks. Unknown hooks, Aerodrome stable math and pre-graduation Pons curve prices remain unsupported. Standard v4 keys are discovered automatically; arbitrary keys need an indexer candidate. Stable quote depth must be at least 10,000 USDC/USDG, or 5 ETH. Concentrated-liquidity depth is an active-range equivalent, not total TVL. Threshold decisions use exact integer rational arithmetic.

Oracle proxy/aggregator identity, rounds, heartbeat, pause state, known sequencer health and block freshness are checked. Robinhood stock prices are already USD per token after the issuer multiplier. Closed/stale feeds remain pinned and show waiting; they do not trigger from old values or silently switch to a DEX. No canonical Robinhood sequencer feed was found, so its absence is an explicit limitation alongside the fresh, hash-matched block requirement. Public deployment sources and live samples are recorded in `docs/evidence/ONCHAIN_ALERT_PRICES.md`.

Wallet trade attribution uses verified venue emissions and connected net wallet flows, never `transaction.from` alone. Only those net legs carry buy/sell evidence; unrelated receipts and refunded inputs cannot satisfy a token-buy rule. Unknown or incomplete swap candidates remain generic wallet activity. Native and wrapped ETH are connected for attribution while original transfers remain visible.

## Durability, delivery and recovery

A fenced database lease and configuration generation serialize each network worker. Evaluations, activity, outbox and cursor commit together. Database transactions use bounded lock and statement times. Provider calls happen before the commit. Two successor sealed blocks are required before provisional Telegram delivery, independently of finality notifications. All notices name their provisional status; no LLM runs per event.

Telegram uses the owner's current pairing. Events from before that pairing are not replayed. A durable owner/minute reservation admits the first five individual activity/price messages across both networks; overflow becomes one minute-end summary, retaining every browser record. Ready/correction notices are distinct from activity rate slots. The pager initializes the Chat SDK state before an outbound send, including before the first webhook after a restart, and shuts down with the Effect lifecycle. Delivery intent is saved before sending. Only definitely-unsent attempts retry, at most three times. Timeouts and unknown outcomes stay uncertain and are never blindly resent. A late receipt resolves the same alert, including a reorganization that raced the send.

Undo records revert price observations in reverse block order only when the current rule still matches the recorded after-state. This preserves manual rearm/configuration changes while rolling back paused rules. Pending orphaned alerts are cancelled; already delivered provisional evidence gets a deterministic correction. Cursor replay is limited to thirty minutes. Dropping an obsolete or stale cursor must mark unresolved prior evidence unverified, preserve known finalized results, reset untriggered price baselines and expose the gap. It must not infer confirmation solely from a newer height. Terminal records expire after thirty days; reads and reconciliation use bounded pages.

The exact-file `no-await-in-loop` exceptions in `oxlint.config.ts` cover ordered cursor/undo pages, transaction writes, durable delivery-slot claims and a shared bounded RPC allowance. These operations depend on prior results; parallel execution changes their behavior. Other lint and dependency rules remain enforced.

## Verification and rollout

Local adapters label streams, price sources and resulting records as demo/stubbed. A stub cannot prove live data or Telegram delivery. Required checks are the full repository gate, browser flows, PostgreSQL migration/concurrency tests, reproducible package build and live stream/price/delivery evidence. Per-network environment flags remain disabled by default. A rollout must preserve changes already live from other agents, apply the migration through the existing release path, and verify the exact deployed revision before announcing the app ready.
