# 0010 — One service task across the workspace and external agents

7 September 2026

Froggy sells bounded services under the person's existing spending mandate. The workspace, chat tools, CLI and bearer-authenticated MCP call the same `purchaseService` function. No entry point can change authority. A service task is claimed by the database's unique `(user_id, idempotency_key)` index before signing; a replay with different input is refused. The in-memory store enforces the same uniqueness.

The person pays Froggy on its configured Hedera network. Froggy separately buys an upstream resource using its Base treasury or its X API credential. These are two financial legs: an X API call is not described as an upstream x402 payment. Customer prices and provider ceilings are separate constants. Supplier routes, models and input limits are selected by code. A supplier's challenge must match the configured payee, Base USDC and the service ceiling before the treasury signs; Privy's treasury policy remains an independent restriction.

A task is persisted before payment, and the spending receipt precedes secondary sale bookkeeping. Paid work is not automatically refunded. Sent but unconfirmed payments remain uncertain. No paid supplier request is automatically repeated; BlockRun image polling reuses the original authorization on the same job path. No progress for fifteen minutes appears as uncertain to callers, including after a restart. This is conservative recovery, not automatic job resumption.

Source excerpts are capped. Media is streamed with a three MiB ceiling, stored in the task's existing JSON result, and served only to its owner through an authenticated download route. Normal task, chat and MCP responses contain a relative artifact URL, never its base64 bytes or a provider download credential. This uses the existing persistence layer for the hackathon; large catalogs or long-lived media should move to object storage with explicit retention.

A stub Hedera deployment runs labelled service fixtures. Live Hedera never sells those fixtures: missing provider configuration makes the service unavailable. “Configured” means configuration exists, not that a payment has been proven.

MCP currently supports authenticated Streamable HTTP at `/api/mcp` and a stdio bridge in the existing CLI. Tokens are checked on every HTTP request and revoked through Agents. The official OAuth onboarding layer and public `/agents` page in `NEXT_ITERATION.md` task 2.6 can sit in front of this handler; this decision does not claim they have been implemented.
