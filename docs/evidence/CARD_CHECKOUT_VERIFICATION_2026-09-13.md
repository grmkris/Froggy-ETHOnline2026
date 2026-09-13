# Saved-card checkout verification — 13 September 2026

Status: **dark integration verified locally; not ready for live enablement**. No real card purchase, Base debit, production migration or Railway deployment was performed.

## Initial implementation evidence

- Initial focused suite: **56 passed, 2 skipped, 0 failed** across card checkout funding/vault tests, bridge calldata tests, bridge observation tests, hosted lifecycle tests, history tests, hosted API tests and card-store tests. The skipped tests require a PostgreSQL URL; card persistence was tested separately below.
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

## Initial isolated integration

The card lane was restored from `wip-tree-2026-09-13` into `/tmp/froggy-card-main-integration`, branch `codex/saved-card-dark-20260913`, initially based on `origin/main` `03bd957`. Main’s credits and unrelated shared changes were preserved. The earlier broad integration snapshot and its failures are superseded by this scoped run; it was not deployed.

- `heavy bun run check:fast`: passed.
- `heavy bun run check`: passed. The final pass includes the private-session and disabled-UI tests and all newly staged files.
- `bun test` directly in `apps/server`: **753 passed, 2 skipped, 0 failed**. The skips require PostgreSQL for existing history/watchlist tests.
- `bun test` directly in `apps/web`: **174 passed, 0 failed**.
- `bun test src/hosted-agent.test.ts` directly in `packages/browser`: **5 passed, 0 failed**, including sharing revocation before secret dispatch and refusal when that revocation fails.
- Fresh local migration chain through the original card migration: passed. **4 card-store tests passed** across memory and two PostgreSQL connections. The disposable database and role were removed.
- Full browser suite: **207 passed, 0 failed** in 10.8 minutes with `FROGGY_E2E_PORT=3240 heavy bun run e2e --workers=2`. Includes three card account tests and hidden disabled controls. The mobile capture was inspected.
- Final affected browser run after the workspace-session query guard: **4 passed, 0 failed** in 22.7 seconds with `FROGGY_E2E_PORT=3240 heavy bun run e2e e2e/card-checkout.spec.ts --workers=1`. Includes a held session-welcome regression proving no card metadata is requested before the owner’s workspace session is known.

The default-off regression sends GET, POST, PUT and DELETE to every payment-method/checkout path family, including prepare, status, authorization, approve, stop, review and reconcile. Every request returns a versioned `403 card.disabled` before storage, body decoding or provider dispatch. Omitting the configuration flag selects disabled/unavailable mode. Account and browser purchase controls stay hidden while disabled, and checkout polling does not start. Card queries also wait for a server-issued workspace session ID so an unresolved session never shares a cache key.

## Watchlist rebase verification

The lane was rebased over watchlist main `c944a11`. Main’s `0026_busy_silvermane` SQL and snapshot are unchanged. Drizzle generated `0027_dashing_mad_thinker` against the merged schema; its snapshot points to main’s `0026` and adds only the three card tables. The journal and exports retain both lanes. The coordinator authorized a main push after the merged gate and PostgreSQL contracts pass. No production migration, deployment, configuration change, real Base debit or card purchase was performed during local verification.

After installing main’s locked dependencies, verification on the merged tree passed:

- `heavy bun run check`: passed, including formatting, type-aware lint, type checking, repository checks, all 20 Turbo test tasks and Knip.
- `bun test` directly in `apps/server`: **758 passed, 2 skipped, 0 failed**. The skips require PostgreSQL for history/watchlist; the watchlist PostgreSQL contract ran separately below.
- `bun test` directly in `apps/web`: **176 passed, 0 failed**.
- Fresh migration through `0027_dashing_mad_thinker`: passed. The snapshot’s predecessor is main’s `0026`, and its only added tables are `payment_methods`, `payment_method_credentials` and `card_checkouts`; existing table snapshots are unchanged.
- Persistence contracts with PostgreSQL enabled: **99 passed, 0 failed**, covering shared persistence, cards, credits, trading, launches, ledger, Hedera receiving, sales replay and watchlist. The disposable database and role were removed after testing.

The first push was rejected because main had advanced to landing commit `78f1aa4`. A second rebase applied cleanly. On that merged tree, `heavy bun run check` passed again, the fresh migration and all **99 persistence contracts passed**, and direct web tests reported **176 passed, 0 failed**. Because the landing lane changed shared CSS and routing, the four card browser checks were repeated: **4 passed, 0 failed** in 23.8 seconds with `FROGGY_E2E_PORT=3240 heavy bun run e2e e2e/card-checkout.spec.ts --workers=1`. `CARD_CHECKOUT_ENABLED` and `CARD_CHECKOUT_IFRAMES_VERIFIED` remain off by default.

## Live-provider evidence and remaining work

The sanitized Uniswap `BRIDGE` quote and `/swap_5792` fixtures prove external-recipient routing and record the provider's unlimited-approval response. Froggy replaces that allowance with the exact input amount before simulation and approval. No source execution was signed during the probe.

The corrected hosted Browser Use probe found and focused an actual cross-origin password input, but `/secrets/{alias}/type` returned `no_focused_field`. The empty field is not proof of domain enforcement. Both probe browsers were stopped. Keep `CARD_CHECKOUT_IFRAMES_VERIFIED=false` until allowed-frame entry and forbidden-frame denial are established using the provider's supported iframe path, including navigation between focus and entry.

The controlled merchant matrix (redirects, decline, 3DS-style takeover, changed totals, restart and credential leakage) remains outstanding. The user supplies the live checkout URL later and approves the exact debit/purchase in Froggy. Actual Base execution, matching Linea arrival, merchant confirmation and issuer-dashboard confirmation must be recorded separately.

See [implementation and release handoff](../plan/CARD_FUNDING_IMPLEMENTATION.md) and [ADR 0034](../decisions/0034-saved-card-checkouts.md).
