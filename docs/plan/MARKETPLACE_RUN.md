# Marketplace implementation — 6 September 2026

Scope: one service catalog for X search, web search, image generation, inference and speech, alongside the existing Graph brief. The workspace, chat tools and external agents use the same durable tasks and spending controls.

Baseline reviewed: `6608fcc`. Existing task/CLI/wallet implementation is retained. No deployment or live supplier payment is implied by passing fixture tests.

## Work

- [x] Provider contracts, bounded adapters, explicit readiness and demo markers.
- [x] Durable service checkout, input-bound idempotency, receipts and artifacts.
- [x] Chat, CLI and MCP access under existing agent tokens.
- [x] Catalog, task status, results and downloads in the workspace.
- [x] Payment/authentication regression tests, full gate and browser exercise.
- [x] Operator configuration and evidence handoff.
- [ ] Production owner: apply supplier configuration and record paid delivery proofs.

## Review findings and fixes

The older task API accepted changed input on an idempotent retry and could settle concurrent retries before claiming their task. Both now reject conflicting input and claim the task first. Its wallet signing endpoint also validates the service recipient, fee payer and timeout against the server-owned oracle configuration. New service checkout constructs the full challenge on the server, reserves before signing and records the task before money moves. Supplier requests have independent price ceilings and pinned payees; an upstream failure never automatically resubmits a paid request. First-use Hedera funding captures the wallet balance before the reservation, preventing a small first purchase from appearing unfunded.

The separate production session has completed Hedera funding and a mainnet oracle proof. It owns the production cutover; this session has not deployed, changed live policies or paid suppliers. Treasury policy additions and supplier configuration are documented in `docs/evidence/MARKETPLACE.md`. MCP works with existing revocable bearer tokens and the distributed CLI bridge; the public agents page and OAuth flow remain separate plan task 2.6.
