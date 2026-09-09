# Persistent history implementation evidence

9 September 2026. Deployed and verified; history is merged into the shared repository.

## Delivered

- Canonical web conversations, structured messages, server-owned runs, durable waits, tool execution evidence, bounded artifacts and an owner-ordered transactional event outbox.
- Fail-closed ingress and tool-start persistence, fenced execution leases, checkpoints, explicit interrupted/uncertain outcomes, and idempotent incoming messages. Historical reads do not replay execution.
- Paired Telegram input/output capture, delivery intent and uncertainty, idempotent import of available SDK cache records, queued-input preservation, and owner-scoped SDK cache deletion.
- Bounded MCP input/output capture, redacted protocol diagnostics, existing business-record links, and an explicit history permission limited to the external connection's own activity.
- Persistent chat URLs, Recent search with unfinished status, Activity filters and evidence details, explicit Explain, owner/cursor-scoped TanStack DB collections, event recovery, and bounded pagination.
- Retrieval scoped to the current conversation by default, explicit cross-thread reads, indexed text search and stable evidence citations. Existing purchases, policy decisions and receipts remain authoritative.

## Verification

`bun run check` passed, including formatting, type-aware lint, all TypeScript projects, dependency boundaries, agent/name checks, package tests and dead-code detection. `bun run build` passed for both build targets.

A separate disposable PostgreSQL database applied the complete ordered migration set through `0017_typical_sersi`, following the current launch-watch and browser-profile migrations. The history/source contracts passed: **26 tests, 97 assertions**. Coverage includes duplicate ingress, committed final messages across independent readers, rejected replacement transcripts, owner scoping, expired lease fencing, rollback without publication, commit-ordered event cursors, keyset pagination, source deduplication, outbound uncertainty, deletion, failed tool-start writes, and uncertain outcomes after result-write failure. These tests use synthetic business outcomes and do not establish a live financial flow.

The complete Chromium browser gate passed: **124 tests in 8.1 minutes**, using `FROGGY_E2E_PORT=32780 bun run e2e --workers=2 --timeout=60000`. The stable run covers both new history interactions and existing navigation, agent onboarding, OAuth, approvals, receipts, services, settings and responsive themes. Earlier failures during source reloads and a 30-second overall theme-test timeout were superseded by this stable full run.

A disposable PostgreSQL fixture with 1,000 conversations and 10,000 events returned 20 summaries per page over 50 distinct pages. Measured list latency: P50 1.566 ms, P95 2.587 ms; a text-search request took 1.837 ms. The owner/update index served the list. These local timings are not a production latency guarantee. Recent and Activity render a single page, while opening details fetches only selected bounded evidence.

The isolated, version-pinned [TanStack AI evaluation](HISTORY_TANSTACK_AI.md) passed strict TypeScript, Effect validation/JSON Schema, synthetic text/tool round trips, stable hydration IDs and denied hydration. An injected ingress-write failure still allowed adapter/tool execution. AI SDK 7 is retained. Actual provider-adapter, lifecycle and financial parity for a replacement engine remains unestablished; no application engine migration is part of this release.

## Release and limits

The implementation is merged into the shared repository, preserving the concurrent browser, trading and launch-watch changes. The history migration is `0017_typical_sersi`; its architecture decision is `0017-persistent-history` because `0016` belongs to the browser work.

The owner authorized synchronization and deployment after the source-copy permission prompt. All 509 production source files were reconstructed and SHA-256 verified, using 494 matching local versions plus the 15 authorized deployed TypeScript files. No credentials, browser data or user records were copied. The source-copy block is resolved.

Additional trading edits continued arriving during integration. The deployment artifact is therefore `.froggy/history-production-release`: verified production release `16d0468a-a824-4ef8-ad49-dcff2ce37b31` plus history, retaining live positions, withdrawals and reviewed trades. History also remains integrated with the newer shared workspace; those unfinished parallel features are preserved locally rather than included in this release.

The shared integration additionally fixes explicit paid-browse continuation: each attempt uses the task's durable conversation binding, and stopped/failed/interrupted partial answers are marked as incomplete in model context. Incomplete tool parts are not replayed or promoted into user-authored payment provenance. The PostgreSQL contracts passed with this regression: **28 tests, 105 assertions**.

The exact deployment artifact passed the complete `bun run check` gate (server: 408 pass, one PostgreSQL-environment skip; the database contracts run separately). Its production build passed. The artifact's full browser run passed 123/124 cases. The sole failure was an outdated Jupiter route label in the test; after correcting it to the already-deployed label, all four trading cases passed. All 124 browser cases are covered by passing results. No application change was required after the full code/build gate. Railway deployment `d6032c19-7252-4397-8450-20c3768722a5` reached SUCCESS. Production health, authentication boundaries, browser boot, 56 source hashes and the exact migration were verified; see [release evidence](HISTORY_RELEASE_2026_09_09.md).

History restores committed checkpoints. A process crash may lose the latest uncommitted partial text. It cannot recover old web transcripts that were never stored, infer missing MCP arguments, promise permanent binary attachments, or retry uncertain sends/payments automatically. Rollback must retain capture or disclose a recording gap.

## Authorized source-copy scope

These deployed TypeScript source files were copied into the same local repository and verified against the previously collected hashes. This excludes environment files, credentials, browser data and user/database records.

- `apps/server/src/environment.ts`
- `apps/server/src/mcp.ts`
- `apps/server/src/router.ts`
- `apps/server/src/tools.ts`
- `apps/server/src/trading-environment.test.ts`
- `apps/server/src/trading/coordinator.ts`
- `apps/server/src/trading/execution-providers.ts`
- `apps/server/src/trading/stub-execution.ts`
- `apps/server/src/trading/tools.ts`
- `apps/web/src/components/trading/trade-panel.tsx`
- `apps/web/src/components/trading/trade-review.tsx`
- `packages/domain/src/index.ts`
- `packages/domain/src/trade.ts`
- `packages/protocol/src/index.ts`
- `packages/wallet/src/trading-store.ts`
