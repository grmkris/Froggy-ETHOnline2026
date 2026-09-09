# Conversation persistence and activity research

Researched 8 September 2026. Scope: web conversations, Froggy's Telegram bot, inbound MCP calls, task/purchase results, and the interface for understanding them. This is research and a proposed update, not a shipped implementation. The [implementation plan](../plan/CONVERSATIONS_AND_ACTIVITY.md) defines the recommended slices.

## Recommendation

Keep PostgreSQL as Froggy's authoritative history. Add persistent conversation/message/run records around the current AI SDK first. Introduce TanStack DB as the reactive browser projection for conversation lists and joined activity. Evaluate TanStack AI in a bounded compatibility spike after the storage contract exists; make engine migration a separate change with explicit acceptance criteria.

TanStack DB and TanStack AI solve different problems. Neither can independently reconstruct an external agent's conversation, guarantee that an interrupted purchase is safe to retry, or turn a local cache into cross-device history. The recommendation is based on the sources and current implementation below, rather than a preference for a single library family.

## What production actually retains

The deployed web chat still uses `ai@7.0.92` and `@ai-sdk/react@4.0.95`; React Query is `5.102.8`, Router `1.170.32`, React `19.2.8`, and Effect `4.0.0-rc.112`. The shared working tree also contains newer trading work; the production findings refer to deployment `89e787a8-8417-4d9e-886e-4b4c6b6eec84`, not every local edit.

| Surface | Recoverable now | Missing or limited |
| --- | --- | --- |
| Web chat | Mounted tab messages; active SSE replay | No completed transcript in PostgreSQL; completed runs are retired; reload loses the finished chat |
| Froggy Telegram bot | SDK thread cache in PostgreSQL: incoming/outgoing message text | Newest 100 messages; seven-day sliding expiry; Froggy's model context still comes from an in-memory map |
| Inbound MCP | Durable invocation name/time/connection/outcome, optional task and amount; newest 50 per agent in UI/API | No full arguments or result bodies; no external agent transcript; initialization/list/ping and requests rejected before the wrapper are not invocation rows |
| Service tasks | Input, result, error, status and identifiers | Not the surrounding conversation |
| URL purchases | Durable purchase documents and receipts | MCP invocation lacks an explicit purchase-ID link |
| Payments | Existing receipt/spend/sale records | A signature, accepted task, settled payment, and delivered result are different facts |

Production aggregate checks found **12 unexpired Telegram cache entries in one thread** and **14 MCP invocation rows**. No message text or call bodies were printed. Hashes of the live Telegram pager, invocation recorder, and installed Chat/Telegram/PostgreSQL adapter code matched the inspected files. These are dated counts across the inspected deployment, not a statement about a particular user's conversation.

Correction to the initial investigation: an in-memory Telegram model-context map does **not** mean Telegram messages are wholly absent from persistent storage. Chat SDK 4.40.0 independently appends thread history. Its `ThreadHistoryCache` defaults to 100 entries and seven days; the PostgreSQL adapter stores `froggy-telegram` / `msg-history:<threadId>` in `chat_state_lists`. A separate agent's Telegram chat, such as a conversation with Hermes, is not visible to Froggy merely because Hermes calls its MCP endpoint.

Local primary sources: [web workspace](../../apps/web/src/routes/workspace-layout.tsx), [run registry](../../apps/server/src/runs.ts), [Telegram pager](../../apps/server/src/telegram/pager.ts), [MCP handler](../../apps/server/src/mcp.ts), [invocation recorder](../../apps/server/src/agent-invocations.ts), and [retrieval runbook](../CONVERSATION_RETRIEVAL.md). The installed `chat/dist/index.js`, `chat/dist/chunk-BKACWYIW.js`, and `@chat-adapter/state-pg/dist/index.js` were inspected for the SDK behavior; the application does not configure a different history limit.

## Published versions checked

These are research pins, not new repository dependencies. Registry metadata and package source/type tarballs were inspected without installing or executing them.

| Package | Published version inspected | Role |
| --- | --- | --- |
| [@tanstack/db](https://registry.npmjs.org/@tanstack/db/0.8.7) | 0.8.7 | Collections and live relational queries |
| [@tanstack/react-db](https://registry.npmjs.org/@tanstack/react-db/0.3.7) | 0.3.7 | React bindings |
| [@tanstack/query-db-collection](https://registry.npmjs.org/@tanstack/query-db-collection/1.2.12) | 1.2.12 | Bridge from existing TanStack Query |
| [@tanstack/ai](https://registry.npmjs.org/@tanstack/ai/0.53.0) | 0.53.0 | Chat engine, tools, stream protocol |
| [@tanstack/ai-react](https://registry.npmjs.org/@tanstack/ai-react/0.24.0) | 0.24.0 | Chat UI/client bindings |
| [@tanstack/ai-persistence](https://registry.npmjs.org/@tanstack/ai-persistence/0.5.6) | 0.5.6 | Database-independent persistence contracts and middleware |

The AI packages were published 3 September; the inspected DB packages 31 August. The packages have independently versioned releases. Verify the set together before any implementation; a `latest` documentation example is not a compatibility guarantee.

## TanStack DB findings

**Good fit for the read interface.** DB provides normalized collections, reactive joins/filtering/aggregation, and optimistic mutations. It can sit above REST/Query or a sync engine. Froggy can use it to join runs with actors, outcomes and receipts without placing all history in React component state. It does not supply the server's durable conversation schema or its authorization model. [DB overview](https://tanstack.com/db/latest/docs/overview).

**The existing Query client is the easiest starting point.** Query Collection supports scoped/on-demand loads and predicate push-down. Its direct write APIs can merge server-confirmed WebSocket changes without refetching everything. A dangerous integration detail: an eager query result represents the complete collection scope; returning a page or a delta as that result can remove older loaded rows. Use on-demand subsets or explicitly scoped page collections, and keep incremental writes distinct from full snapshots. Batch operations are collection-local; do not assume a batch across several independent collections is a database transaction. [Query Collection](https://tanstack.com/db/latest/docs/collections/query-collection).

**Browser persistence is an optional second layer.** TanStack's SQLite persistence work adds local durability, offline state and multi-runtime adapters, including browser WASM/OPFS. That may later improve warm loads and read-only offline access. It adds storage migration, logout erasure, browser-support, and synchronization work without solving the immediate need to retrieve history from a different device. Start with server persistence; add a private local cache only after measured need. The March announcement labels that initial persistence release alpha; it should not be used as a claim about today's exact package stability. [DB persistence announcement](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes), [current persistence guidance](https://tanstack.com/intent/registry/%40tanstack__db/db-core%2Fpersistence).

**No extra sync infrastructure for the first release.** Electric/PowerSync are plausible later adapters, but Froggy already has authenticated HTTP and an app socket. Begin with those and a durable cursor/reconciliation endpoint. Introducing a replication service now would increase the work required to ship history. This is an architectural recommendation, not a claim that either sync product cannot work.

## TanStack AI findings

**Persistence is substantial, but requires an adapter.** `withPersistence` supports message, run and interrupt stores. Streaming snapshots are optional and default off; the configured default interval is one second. The documented history contract treats non-empty `messages` as the complete authoritative conversation and an empty array as loading the stored thread. Froggy must assemble authoritative history on the server: blindly accepting a browser's stale full transcript would erase Telegram or another tab's messages. The initial pending-turn write is best effort, so add a required ingress commit before any paid work. [Chat persistence](https://tanstack.com/ai/latest/docs/persistence/chat-persistence).

**Persistence and delivery are separate.** Stable thread identity belongs to the conversation; run identity belongs to one execution. A saved transcript does not restore an executing process, and an event replay log does not constitute long-term conversation storage. This separation is a good architecture to adopt even while keeping the existing SDK. [Persistence internals](https://tanstack.com/ai/latest/docs/persistence/internals).

**Server-authoritative hydration fits Froggy.** Client `persistence: true` can hydrate a thread from the server without caching transcript contents locally. Local-storage mode is a different choice, not a prerequisite. Integrating this would replace the current client transport/message lifecycle, so it needs refresh, identity-switch and message-ID compatibility tests. [Client persistence](https://tanstack.com/ai/latest/docs/persistence/client-persistence).

**Durable streaming does not guarantee safe execution recovery.** The stream API supports a memory adapter, an external durable-stream backend, or a custom adapter. An implementation using PostgreSQL remains possible. Production process death requires a lease/reaper or a real durable worker; automatic takeover documented for sandboxed runs does not automatically apply to Froggy's ordinary model/tool loop. Never rerun a payment because a stream ended. The advanced docs contain differing descriptions of in-memory disconnect behavior in their SSE and WebSocket sections; verify actual behavior on the pinned release. [Resumable streams](https://tanstack.com/ai/latest/docs/resumable-streams/overview), [process death and delivery semantics](https://tanstack.com/ai/latest/docs/resumable-streams/advanced).

**Adapters must obey stronger contracts than example CRUD.** `saveThread` replaces the complete thread; `createOrResume` must preserve an existing run. Froggy needs owner-scoped stores and a revision check or lock. The package ships a conformance testkit. Its published testkit imports Vitest, while this repository uses Bun tests: isolate that conformance runner if evaluating it; do not silently replace the repository's runner. Durable interrupt commits need atomic handling, not a sequence that can half-consume approvals. [Chat adapter contract](https://tanstack.com/ai/latest/docs/persistence/build-your-own-chat-adapter), [locks](https://tanstack.com/ai/latest/docs/advanced/locks).

**Effect can remain the contract language.** Published AI types accept Standard Schema, Standard JSON Schema and JSON Schema. Source inspection shows a validator-only Standard Schema without a JSON Schema converter throws during conversion. Effect's installed RC provides both `toStandardSchemaV1` and `toStandardJSONSchemaV1`; the compatibility spike must combine conversion and runtime validation and exercise TypeIDs, unions and optional fields. Do not add Zod just because the documentation examples use it. Evidence: the versioned AI package above, `src/activities/chat/tools/schema-converter.ts`, and the installed `effect/src/Schema.ts`.

**Tracing and memory are useful additions, not canonical business records.** The OTel middleware emits run/iteration/tool spans; content capture is opt-in and supports redaction. Keep financial truth in the existing ledger and application history in PostgreSQL. Compaction separately reduces provider context while retaining the canonical transcript. Store summary provenance and covered message IDs; never replace the archive with a generated summary. [OpenTelemetry](https://tanstack.com/ai/latest/docs/advanced/otel), [compaction](https://tanstack.com/ai/latest/docs/advanced/compaction).

**Migration has a real surface area.** It changes tool definitions, model adapters, message parts, client hooks and stream framing; it is not an import rename. The generic OpenAI-compatible adapter is relevant to Froggy's configurable model gateway, but provider/tool behavior must still be tested against the actual configured models. [Migration guide](https://tanstack.com/ai/latest/docs/migration/migration-from-vercel-ai), [OpenAI-compatible adapter](https://tanstack.com/ai/latest/docs/adapters/openai-compatible).

## Keeping the existing AI SDK is viable

The installed AI SDK includes a persistence guide covering stored structured UI messages, server validation, stable message IDs, sending just the latest user message, and draining streams after a client disconnect. Froggy already drains its server-owned run. Therefore the first history release can extend a working execution path rather than replacing it. Use installed v7 types to select the actual hooks; examples from older versions are not automatically correct. [AI SDK persistence guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence), installed at `apps/server/node_modules/ai/docs/04-ai-sdk-ui/03-chatbot-message-persistence.mdx`.

| Approach | Immediate benefit | Additional work | Recommendation |
| --- | --- | --- | --- |
| Current AI SDK + PostgreSQL | Fixes lost chat history with least execution change | Build storage and recovery boundaries | First release |
| Above + TanStack DB | Joined activity, stable live lists, less scattered client state | Collection scopes, cursors, projections | Add for unified views |
| TanStack AI + PostgreSQL adapter + DB | Coherent middleware, hydration, tracing and interrupt APIs | Engine/transport migration and compatibility gates | Separate evaluated migration |
| Browser-only DB persistence | Fast local reopening/offline reads | No shared archive; identity/cache lifecycle | Insufficient as the primary fix |

## Research limits

No TanStack dependency was added, no application code was changed for this research, and no paid request or production mutation was performed. Public docs, published package source/types, installed SDK code and read-only production aggregates were checked. Runtime interoperability, bundle size, concurrency, and latency remain measurements for the planned spike. The proposal deliberately separates verified library capabilities from Froggy-specific design choices.
