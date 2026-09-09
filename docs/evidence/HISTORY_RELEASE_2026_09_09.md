# Persistent history release — 9 September 2026

Status: deployed and verified. [Open Froggy](https://app-production-58dd.up.railway.app). Railway deployment `d6032c19-7252-4397-8450-20c3768722a5` is **SUCCESS** in the existing production app service.

## Scope

Persistent web and paired Telegram conversations, Recent search, Activity and evidence details, canonical checkpoints and durable waits, bounded MCP capture, authorized history retrieval, and owner-scoped live collection recovery are deployed. History is also merged into the shared local repository.

The deployed artifact preserves the verified live trading release `16d0468a-a824-4ef8-ad49-dcff2ce37b31`. Ongoing trading additions in the shared workspace remain local. The history integration there preserves those edits, including paid-browser continuation against canonical conversation history.

## Verification

- The deployment artifact passed `bun run check` and `bun run build`. The server suite passed 408 tests; its PostgreSQL-environment skip was covered separately.
- PostgreSQL contracts passed **28 tests and 105 assertions** against a disposable database migrated through `0017_typical_sersi`.
- The full Chromium run passed 123 of 124 tests. The sole failure expected the old Jupiter route label; after correcting the test to the existing deployed label, all four trading tests passed. All 124 cases have passing results. Application code did not change after the full gate.
- Railway applied additive migrations before the health-checked rollout and reported **SUCCESS**.
- Production `/health` returned 200. Anonymous requests to `/api/conversations`, `/api/activity`, and `/api/history/search` returned 401.
- The production Activity route loaded the real sign-in screen with no browser runtime errors. This was an unauthenticated boot check; no production account or payment was created.
- All **56** checked deployed source hashes matched the tested artifact, covering history, server lifecycle, APIs, migration and the preserved trading implementation.
- Read-only database metadata confirmed all seven history tables and the exact SHA-256 hash of migration `0017`.

Live verification timestamp: `2026-09-09T09:04:01.213Z`. The source-copy approval was resolved before deployment; credentials, browser data and user records were not copied.

## Operational notes

The additive history migration follows the existing launch-watch and browser-profile migrations without renumbering them. The accepted architecture decision is [0017](../decisions/0017-persistent-history.md).

History restores committed transcripts and checkpoints. Previously unrecorded web chats cannot be recovered. An interrupted operation is evidence to inspect, not an instruction to replay a payment. A rollback must retain history capture or explicitly disclose the recording gap.

Detailed implementation and compatibility evidence: [implementation](HISTORY_IMPLEMENTATION.md), [TanStack AI decision](HISTORY_TANSTACK_AI.md).
