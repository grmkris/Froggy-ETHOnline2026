# Onchain alert implementation — 13 September 2026

The Base and Robinhood Watchlist alert implementation is captured for the review branch `codex/onchain-alerts-integration-20260913`. The operator explicitly requested a commit and push after being informed that the full repository gate is failing. This is an application integration checkpoint, not a production-ready release. It includes the shared application dependencies present at capture time; local video skill installations, design captures and unrelated evidence are excluded. The shared checkout and its main branch remain untouched by the temporary-index commit process. Production remains on its prior release.

## Implemented

- Wallet native/ERC20 sends and receives, optional asset/direction filters, verified net swap buy/sell filters and safe generic activity fallback.
- One-shot strict price thresholds, explicit USD/USDC/USDG/ETH units, matching first observations, source pinning, health checks, liquidity floors and exact arithmetic.
- Shared per-network sealed Substreams, independent token-price subscriptions, pinned WASM/package identity, atomic fenced evaluation/outbox/cursor and bounded reconnection.
- Watchlist controls and compact tool results: save/track, pause/resume, explicit 24-hour extension, rearm, expiry, sources, gaps, delivery status and paginated activity. Chat, Telegram and MCP use the same permission-checked service.
- Cross-network five-per-minute owner activity limit with overflow summary; durable Telegram intent, at-most-three definitely-unsent retries and uncertain-outcome handling.
- Two-successor delay, reorg rollback/corrections, late-send correction races, unverified gap evidence, safe price baseline reset, cancellation before outbox creation, archive/restore/forget and idle stream termination.
- Explicit local stream and price demo adapters; no signing or transaction submission.
- Cold-start Telegram initialization before outbound sends, recoverable initialization failures and Effect-owned SDK shutdown.

The architectural contract and limitations are in [decision 0033](../decisions/0033-substreams-watchlist-alerts.md). The migration is `packages/database/drizzle/0026_rare_rumiko_fujikawa.sql` and its journal/snapshot entry; it builds on the existing local migration sequence. Other agents have subsequently added migrations and funding changes, which must remain intact.

## Verified

- The final focused backend run passed all 90 tests across nine files, with 389 assertions and no skipped cases. It includes ten real PostgreSQL cases, transaction/concurrency checks, cancellation across a 205-row boundary, and four Telegram cold-start, receipt, deduplication and recovery regressions. Provider transports in the regression tests are stubbed; PostgreSQL uses a disposable local database.
- Type-aware lint passed across the alert backend/persistence/domain/protocol slice and the new Telegram regression test. Domain, wallet, web and server typechecks passed at the alert handoff. During the subsequent push preparation, another whole-project typecheck found new errors in concurrently edited card-bridge tests, watchlist-email and watchlist-image. These focused results do not replace the failing whole-repository gate. The fresh alert regression rerun passed 80 tests with the ten PostgreSQL cases skipped; the earlier 90-test run included those database cases.
- Five isolated Chromium flows pass on desktop/mobile, with no browser errors or overflow. Base and Robinhood price flows use the actual local API/store/worker and clearly marked demo prices, including rearm without extending expiry. Additional fixture coverage exercises pagination and explicit units.
- Rust module tests and reproducible artifact hashes pass. Live price-only stream changes, empty progress and changed-subscription cursor resume passed on Base and Robinhood. See [public stream evidence](../evidence/onchain-alert-streams-2026-09-13.json) and the package README.
- Real Base sealed-stream/RPC price checks passed. Robinhood public RPC checks passed for ETH/USD and a qualifying pools.trade ETH quote; stale stock prices remained unavailable. [Price evidence and primary sources](../evidence/ONCHAIN_ALERT_PRICES.md).
- Real Base stream → local PostgreSQL → Telegram activity delivery passed using the actual pager/outbox path. The initial readiness attempt remained uncertain and was never retried; its still-unattempted companion activity delivered after the cold-start SDK fix. [Delivery evidence](../evidence/ONCHAIN_ALERT_DELIVERY.md).

## Release blockers and remaining proof

`bun run check:fast` and `bun run check` were run. The final full check stops on shared formatting failures and invalid HTML in a newly installed video skill template (`.agents/skills/talking-head-recut/references/frames/polaroid.html`). Separate whole-project lint/test runs also identify concurrent credit/service/checkout changes. The full browser run completed with 189 passes and 20 failures: nineteen unrelated existing service/credits/Home/discovery expectations, and one alert request interrupted by Vite reloading during shared edits. All five alert cases passed again after those edits. These are not green whole-project gates, and the tests were not weakened to hide failures. The repository [verification skill](../../.agents/skills/froggy-verification/SKILL.md) states that `bun run check` “must pass before a commit”. The operator subsequently explicitly requested committing and pushing after this failure was explained. That instruction authorizes the review checkpoint; it does not turn the failing checks green or make the snapshot suitable for deployment.

Read-only release inspection found production healthy at deployment `17e473fa-88e4-419c-8399-987fc12f157e`, based on release `6614144`. This local branch is one commit ahead and eight behind `origin/main`, with extensive shared uncommitted work. Reconcile the release ancestry and preserve the hosted-browser/email/monitoring changes before a deployment; do not upload this older checkout over the current release.

The remaining release steps are:

1. Let the other active lanes settle, integrate the newer release history in this same checkout, and obtain green full repository and browser gates on the exact release state.
2. Merge the verified integration into main, confirm CI, apply migrations through the existing deploy path, then enable and verify each network's stream flag.
3. Exercise an authenticated production Watchlist configuration and real Telegram delivery before announcing the production URL ready.

Automatic approval review rejected a later probe sending the production Pinax credential to the Robinhood stream endpoint, interpreting the explicit destination approval as Base-only. That rejected command did not run and was not retried. The already completed independent Robinhood stream evidence is retained; any newly blocked use of that credential/destination still requires resolving that approval. No production alert configuration, database migration or deployment was changed by this lane. The review branch is based on local `631624d`; it intentionally does not claim integration with the newer release commits or a clean local checkout.
