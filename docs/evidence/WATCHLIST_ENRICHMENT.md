# Watchlist enrichment implementation — 13 September 2026

Implemented free address/URL previews, editable metadata-prefilled capture, explicit one-time enrichment, optional inline alerts, durable observations, safe image loading, real token history, category comparisons, typed chat cards, saved email facts, recent updates and desktop/mobile layouts. Design decisions and constraints are recorded in [decision 0034](../decisions/0034-watchlist-enrichment.md).

## Verification

Recovered the enrichment lane from `wip-tree-2026-09-13` onto main `03bd957` in `/tmp/froggy-watchlist-release`, branch `codex/watchlist-enrichment`. Main's newer credit, research, permission and browser-resume behavior is preserved.

- `heavy bun run check` is the release gate. Server and web tests also run directly with `bun test` in each application, bypassing Turbo's cached test results.
- The complete Chromium browser suite passed: **210 tests**, using isolated ports 3410/3411 and two workers. This includes capture, monitoring, charts, comparisons, chat cards, credits, email, trading and responsive layouts from 320px to 1440px.
- Capture regression coverage verifies that the Preview action remains free after selecting a result and Enter in the details form saves without enrichment, even when the paid option is available.
- PostgreSQL 17: all migrations through `0026_busy_silvermane.sql` applied to a fresh disposable database. Concurrent item/observation writes, revision conflicts, owner isolation and cascading deletion passed. The new migration adds only `saved_item_data`, with its journal and snapshot regenerated after main's existing migration.
- The agent regression verifies that reading saved facts creates no task and refuses another owner's item. Chart windows and comparisons use stored results without new purchases; changed prices, duplicate requests and insufficient-credit recovery are exercised in the browser.
- Current mobile and comparison captures were inspected. Browser tests check page errors, console errors, accessible interactions and horizontal overflow.

The lane is prepared locally for sequenced integration; it has not been pushed or deployed. Wallet alert implementation remains in the separate alerts lane.

## Screenshots

All displayed market values in these screenshots are explicitly simulated test fixtures.

- [Desktop token details](watchlist-2026-09-13/token-detail.png)
- [Token comparison](watchlist-2026-09-13/token-comparison.png)
- [Mobile save](watchlist-2026-09-13/mobile-save.png)

## Configuration and limits

Run the normal migration step before deploying. Live token snapshots require a Birdeye key with the relevant OHLCV entitlement and an explicit `token_snapshot` entry in `TRADING_PRICES_USD_MICROS`; missing configuration leaves the service unavailable. The implementation was not deployed and no live paid provider request was made.

Static previews intentionally do not execute website JavaScript. Variant-dependent prices, login-gated information and ambiguous itinerary details require a website check or human context. Email extraction is deliberately narrow and preserves a useful subset rather than promising universal email parsing. Saved observations are snapshots with source times, not a live portfolio or a complete holdings/P&L system. Provider aggregation, broader history caching and additional portfolio accounting remain separate work.
