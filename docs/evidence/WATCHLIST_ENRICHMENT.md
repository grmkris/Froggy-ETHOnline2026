# Watchlist enrichment implementation — 13 September 2026

Implemented free address/URL previews, editable metadata-prefilled capture, explicit one-time enrichment, optional inline alerts, durable observations, safe image loading, real token history, category comparisons, typed chat cards, saved email facts, recent updates and desktop/mobile layouts. Design decisions and constraints are recorded in [decision 0034](../decisions/0034-watchlist-enrichment.md).

## Verification

- Watchlist/monitoring browser suite: **15 passed**, covering widths 320/390/1440, both preview chains, save/edit/attach/archive, chain identity, optional alert setup, history/comparison without purchases, changed prices, duplicate requests and insufficient credits.
- Affected chat/discovery rerun: **2 passed**. Free address cards retain balance/ownership information; opening discovery remains free and listing retrieval is explicit.
- PostgreSQL 17: all migrations applied to a disposable local database. Concurrent saved-item and observation writes, revision conflicts, owner isolation and cascading deletion passed. The database was removed after testing.
- Complete final unit suite: **1,452 passed**, two database tests skipped without a test database. The Watchlist database test was then run successfully against PostgreSQL. Focused agent tests additionally verify enriched reads create no tasks and cannot read another owner's item.
- Production frontend/server build, strict TypeScript, dependency graph and naming checks passed after integration. Focused type-aware lint and formatting passed for the implementation.
- The complete browser run recorded **198 passed, 13 failed, 4 did not run**. Four failures related to changed Watchlist/monitoring/address/discovery expectations were fixed and passed on rerun. Remaining failures concern agent-detail, approval, shared-run history, purchases and scripted-chat/Home expectations in the concurrently changing workspace; the complete suite is not green.
- `bun run check` / `check:fast` remain blocked by global formatting/lint issues, including malformed HTML in newly installed video skills. Agent-skill validation and dead-code checks also report issues in the added skills and concurrent feature work. Independent checks distinguish feature failures from those unrelated errors. No lint rule or global gate was weakened.

## Screenshots

All displayed market values in these screenshots are explicitly simulated test fixtures.

- [Desktop token details](watchlist-2026-09-13/token-detail.png)
- [Token comparison](watchlist-2026-09-13/token-comparison.png)
- [Mobile save](watchlist-2026-09-13/mobile-save.png)

## Configuration and limits

Run the normal migration step before deploying. Live token snapshots require a Birdeye key with the relevant OHLCV entitlement and an explicit `token_snapshot` entry in `TRADING_PRICES_USD_MICROS`; missing configuration leaves the service unavailable. The implementation was not deployed and no live paid provider request was made.

Static previews intentionally do not execute website JavaScript. Variant-dependent prices, login-gated information and ambiguous itinerary details require a website check or human context. Email extraction is deliberately narrow and preserves a useful subset rather than promising universal email parsing. Saved observations are snapshots with source times, not a live portfolio or a complete holdings/P&L system. Provider aggregation, broader history caching and additional portfolio accounting remain separate work.
