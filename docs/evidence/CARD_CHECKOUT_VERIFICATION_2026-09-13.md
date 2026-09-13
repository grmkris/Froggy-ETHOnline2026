# Saved-card checkout verification — 13 September 2026

Status: **local implementation verified in focused tests; not ready for live enablement**. No real card purchase, Base debit, production migration or Railway deployment was performed.

## Passing checks

- Final focused suite: **56 passed, 2 skipped, 0 failed** across card checkout funding/vault tests, bridge calldata tests, bridge observation tests, hosted lifecycle tests, history tests, hosted API tests and card-store tests. The skipped tests require a PostgreSQL URL; card persistence was tested separately below.
- Dedicated local PostgreSQL: the complete migration chain applied, then **4 card-store tests passed** across memory and two independent PostgreSQL connections. Covered owner isolation, credential separation, persistence across instances, revocation and concurrent method reservations. The disposable database and role were removed afterwards.
- Account browser acceptance: **2 passed**. Added a synthetic card, checked masked responses, reloaded, opened replacement with blank credential fields, revoked, and checked page errors. At 390px the form fits the viewport, password fields remain masked, and keyboard focus reaches card entry. Captured and inspected the mobile layout.
- Purchase source: scoped type-aware lint passed. The server type checker passed in the shared working tree. Dependency graph check passed for all 12 workspaces.
- Broad isolated unit run: all 20 Turbo test tasks passed, including **1,449 passing tests** reported by package suites. Subsequent purchase changes were covered by the final focused suite.

Focused command:

```sh
bun test apps/server/src/card-checkouts.test.ts \
  apps/server/src/trading/card-bridge.test.ts \
  apps/server/src/trading/card-bridge-observation.test.ts \
  apps/server/src/hosted-browse.test.ts apps/server/src/history.test.ts \
  packages/browser/src/hosted-agent.test.ts packages/wallet/src/card-store.test.ts
```

Coverage includes owner-only API access, arbitrary entered recipients, AES-GCM owner/revision authentication, fresh nonces, FX rounding/reservations, sufficient existing balance, bridge-fee requoting and its three-attempt bound, exact allowances, mutated calls/recipients/amounts/messages, stale approval, duplicate approval, revocation, worker-release handover, secret-free 3DS continuation, ambiguous dispatch after restart, source/destination confirmation separation, unrelated transfers, RPC outage and destination reorg. An outage after observed funding blocks credential release. Synthetic funding cannot release credentials into a live browser.

## Repository-wide blockers

A disposable worktree at `/home/kristjan/code/froggy-card-release` was created from `origin/main` `661414402fb75e6fbd8b3779c2ab73d2aea9c108`, then populated with the working integration and its existing prerequisites. This is an integration snapshot, **not a scoped release branch**: the shared source already contained substantial unrelated uncommitted work. It must not be deployed wholesale.

`bun run check:fast` and `bun run check` were run. The final isolated formatting check passed, but lint remains blocked in other working changes: `trading-tools.test.ts` awaits a member expression, `watchlist-enrichment.ts` contains a redundant block, and `agents.ts` exceeds the complexity limit. The isolated type run additionally retained a missing `TradingServiceName` import in `trading/services.ts`; the subsequent shared-tree server check passed. Knip reports unrelated unused exports/types in capabilities, monitoring, credits and watchlist. No global check was weakened to hide these failures.

The shared-tree fast gate also encounters malformed HTML in an unrelated untracked skill reference, `.agents/skills/talking-head-recut/references/frames/polaroid.html`; that skill was excluded from the isolated source snapshot.

Full isolated `bun run e2e`: **198 passed, 13 failed, 4 did not run** across 215 cases. Failures are in agent activity, wallet approval/receipts, history, monitoring, URL purchases, streaming, address discovery and existing layout tests. This is not a passing release gate. The dedicated card account tests pass independently; they do not establish the complete merchant-payment flow.

## Live-provider evidence and remaining work

The sanitized Uniswap `BRIDGE` quote and `/swap_5792` fixtures prove external-recipient routing and record the provider's unlimited-approval response. Froggy replaces that allowance with the exact input amount before simulation and approval. No source execution was signed during the probe.

The corrected hosted Browser Use probe found and focused an actual cross-origin password input, but `/secrets/{alias}/type` returned `no_focused_field`. The empty field is not proof of domain enforcement. Both probe browsers were stopped. Keep `CARD_CHECKOUT_IFRAMES_VERIFIED=false` until allowed-frame entry and forbidden-frame denial are established using the provider's supported iframe path, including navigation between focus and entry.

The controlled merchant matrix (redirects, decline, 3DS-style takeover, changed totals, restart and credential leakage) remains outstanding. The user supplies the live checkout URL later and approves the exact debit/purchase in Froggy. Actual Base execution, matching Linea arrival, merchant confirmation and issuer-dashboard confirmation must be recorded separately.

See [implementation and release handoff](../plan/CARD_FUNDING_IMPLEMENTATION.md) and [ADR 0034](../decisions/0034-saved-card-checkouts.md).
