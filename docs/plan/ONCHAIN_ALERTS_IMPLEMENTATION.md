# Onchain alert implementation — 13 September 2026

The Base and Robinhood Watchlist alerts are integrated onto main `0366039` in `/tmp/froggy-alert-main-integration`, without editing the shared checkout. Main supplies the credits, research, browser and existing Watchlist implementations; the Watchlist enrichment and saved-card lanes are retained alongside the alert feature. The integration landed on main as `83622af`; the rollout now configures both network sources without deployment switches.

## Implemented

- Wallet native/ERC20 sends and receives, optional asset/direction filters, verified net swap buy/sell filters and safe generic activity fallback.
- One-shot strict price thresholds, explicit USD/USDC/USDG/ETH units, matching first observations, source pinning, health checks, liquidity floors and exact arithmetic.
- Shared per-network sealed Substreams, independent token-price subscriptions, pinned WASM/package identity, atomic fenced evaluation/outbox/cursor and bounded reconnection.
- Watchlist controls and compact tool results: save/track, pause/resume, explicit 24-hour extension, rearm, expiry, sources, gaps, delivery status and paginated activity. Chat, Telegram and MCP use the same permission-checked service.
- Cross-network five-per-minute owner activity limit with overflow summary; durable Telegram intent, at-most-three definitely-unsent retries and uncertain-outcome handling.
- Two-successor delay, reorg rollback/corrections, late-send correction races, unverified gap evidence, safe price baseline reset, cancellation before outbox creation, archive/restore/forget and idle stream termination.
- Explicit local stream and price demo adapters; no signing or transaction submission.
- Cold-start Telegram initialization before outbound sends, recoverable initialization failures and Effect-owned SDK shutdown.

The architectural contract and limitations are in [decision 0035](../decisions/0035-substreams-watchlist-alerts.md). The migration is `packages/database/drizzle/0028_lethal_sentry.sql` and its journal/snapshot entry; it follows main's `0026_busy_silvermane` Watchlist and `0027_dashing_mad_thinker` card migrations. The full merged sequence applied successfully to a fresh disposable local PostgreSQL database. Historical checkpoint migrations are excluded.

## Prior feature evidence

- The final focused backend run passed all 90 tests across nine files, with 389 assertions and no skipped cases. It includes ten real PostgreSQL cases, transaction/concurrency checks, cancellation across a 205-row boundary, and four Telegram cold-start, receipt, deduplication and recovery regressions. Provider transports in the regression tests are stubbed; PostgreSQL uses a disposable local database.
- Type-aware lint passed across the alert backend/persistence/domain/protocol slice and the new Telegram regression test. Domain, wallet, web and server typechecks passed at the alert handoff. During the subsequent push preparation, another whole-project typecheck found new errors in concurrently edited card-bridge tests, watchlist-email and watchlist-image. These focused results do not replace the failing whole-repository gate. The fresh alert regression rerun passed 80 tests with the ten PostgreSQL cases skipped; the earlier 90-test run included those database cases.
- Five isolated Chromium flows pass on desktop/mobile, with no browser errors or overflow. Base and Robinhood price flows use the actual local API/store/worker and clearly marked demo prices, including rearm without extending expiry. Additional fixture coverage exercises pagination and explicit units.
- Rust module tests and reproducible artifact hashes pass. Live price-only stream changes, empty progress and changed-subscription cursor resume passed on Base and Robinhood. See [public stream evidence](../evidence/onchain-alert-streams-2026-09-13.json) and the package README.
- Real Base sealed-stream/RPC price checks passed. Robinhood public RPC checks passed for ETH/USD and a qualifying pools.trade ETH quote; stale stock prices remained unavailable. [Price evidence and primary sources](../evidence/ONCHAIN_ALERT_PRICES.md).
- Real Base stream → local PostgreSQL → Telegram activity delivery passed using the actual pager/outbox path. The initial readiness attempt remained uncertain and was never retried; its still-unattempted companion activity delivered after the cold-start SDK fix. [Delivery evidence](../evidence/ONCHAIN_ALERT_DELIVERY.md).

## Main integration verification

The initial integration on `03bd957` passed the full gate, 796 direct server tests, 174 direct web tests, 20 wallet persistence tests including real PostgreSQL, and 12 Chromium alert/Watchlist flows. Those checks predate the final Watchlist/card rebase.

After rebasing onto `0366039` and regenerating migration `0028`, all checks passed on the merged tree:

- `heavy bun run check`: formatting, type-aware lint, all workspace typechecks, boundary and repository checks, tests and dead-code detection.
- `bun test` directly in `apps/server`: 824 passed, zero failures or skipped tests; the configured disposable PostgreSQL database exercised history and Watchlist persistence.
- `bun test` directly in `apps/web`: 176 passed, zero failures.
- All nine wallet PostgreSQL contract test files: 118 passed, zero failures or skipped tests, covering alerts, cards, credits and existing persistence behavior.
- `bun run e2e e2e/onchain-alerts.spec.ts e2e/watchlist.spec.ts --workers=2`: all 12 Chromium flows passed on the merged UI, including desktop/mobile alerts, existing saved items, token identity and reminders.

The coordinated checks used `heavy` without pipelines, retrying exit 75 when another lane held the slot. Main's Watchlist and card migrations and the landing stylesheet remain unchanged.

Both network sources now select the real adapter automatically when `PINAX_API_KEY` is configured. The validated endpoints, RPC, and actual provider responses determine availability. `/health.onchainAlerts` separates idle/connecting sources from fresh live progress, stale progress, and unavailable connections. Missing production credentials remain unavailable; local credential-free demos remain explicitly labelled. Active watches still require owner configuration, and real Telegram delivery must be verified independently. See decision 0035 for the rollout and runtime availability contract.

The prior Robinhood credential probe rejected by automatic approval review was not rerun. Existing public stream and price evidence remains linked above; no new claim of live Robinhood Telegram delivery is made.
