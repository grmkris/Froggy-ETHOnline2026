# Retrieving recent Froggy conversations

The owner asked on 8 September 2026 to remember an efficient way to retrieve recent conversations from https://app-production-58dd.up.railway.app. Start here when asked to inspect recent chats or what the agent just did. Reuse this procedure; verify only what may have changed.

## What is available

Verified against production on 8 September 2026 after deployment `89e787a8-8417-4d9e-886e-4b4c6b6eec84`: the web app has no durable completed-conversation store or conversation-list API. `useChat` holds messages in the mounted workspace. Navigation between workspace pages preserves that state; a full page reload loses a completed transcript.

`GET /api/chat/<client-chat-id>/stream` resumes only the authenticated person's current run. The path ID is not an archive key: the server chooses the run from the caller's session. Finished runs are removed by `ChatRunRegistry.settle`; replay is also unavailable once its bounded buffer overflows. A 204 means no replay is available. Use a timeout and output cap for an active SSE stream.

The production `chat_state_*` tables belong to the Telegram Chat SDK adapter. They are not a web conversation archive. Telegram's model context is an in-memory map in `telegram/pager.ts`, but the SDK separately persists recent incoming and outgoing thread messages. Do not mistake the in-memory model context for the absence of recoverable Telegram history; use the procedure below.

## Fast retrieval order

1. If an authorized browser tool exposes the person's existing signed-in Froggy tab, read its visible conversation first. Do not reload or navigate away before capturing it. The shared Chrome inside Froggy is a separate browsing surface; do not assume it is the host app's signed-in tab. A new unauthenticated browser only sees the sign-in page.
2. For a still-running turn, use the existing authorized app session's GET stream endpoint above. Do not start another chat to retrieve the old one: starting a turn supersedes the current run.
3. For completed work, use existing authorized read endpoints: `GET /api/tasks` then `GET /api/tasks/<taskId>` for input, status, result and error; `GET /api/purchases` then `GET /api/purchases/<purchaseId>` for purchase history; `GET /api/receipts` for payment evidence. The existing Froggy CLI's `tasks` and `status <taskId>` commands are read operations when it is already connected. These records are evidence of work, not the complete chat transcript.
4. If app authentication is not available but the operator's Railway access is, query the existing database from the app service with a read-only, owner-scoped query. Start with the requested time window, newest 20 records, selected columns, and capped input/result text. Inspect `tasks`, `purchases`, `receipts`, and `agent_invocations` as needed. Resolve the target account from the session or supplied identifiers; do not guess that the newest account is the owner. Preserve row IDs for a targeted follow-up.
5. Use bounded Railway HTTP logs only to correlate request timestamps, HTTP status and failures. A 200 for `/api/chat` proves neither tool success nor transcript retention. Runtime logs are diagnostics, not an archive of model messages. If neither the tab nor an active replay is available, say that the exact conversation cannot currently be recovered and report the saved work separately.

Do not create a new task, replay a payment, mint credentials, change a mandate, or deploy anything to answer a history request. Never print access tokens, database connection strings, or private keys. Keep private conversation text out of committed evidence documents.

## Telegram conversations

For **Froggy's own paired Telegram bot**, Chat SDK 4.40.0 enables `persistThreadHistory` automatically. Its production PostgreSQL adapter uses `key_prefix = 'froggy-telegram'`, with messages in `chat_state_lists` under `list_key = 'msg-history:' || telegram_pairings.thread_id`. The default is the newest 100 messages per thread, expiring seven days after the last append (the append refreshes the list's expiry). Messages include incoming and outgoing text; this is a bounded cache, not permanent history. The SDK strips raw provider payloads before storing messages.

Read through the paired owner's row, filter expiry, select newest 20, then display chronologically. This parameterized query describes the verified storage layout; bind `$1` to the authorized owner's `UserId` and cap text before returning it:

```sql
SELECT l.seq,
       l.value::jsonb ->> 'id' AS message_id,
       l.value::jsonb #>> '{metadata,dateSent}' AS sent_at,
       l.value::jsonb #>> '{author,isBot}' AS is_bot,
       left(l.value::jsonb ->> 'text', 4000) AS text,
       l.expires_at
FROM telegram_pairings AS p
JOIN chat_state_lists AS l
  ON l.key_prefix = 'froggy-telegram'
 AND l.list_key = 'msg-history:' || p.thread_id
WHERE p.user_id = $1
  AND (l.expires_at IS NULL OR l.expires_at > now())
ORDER BY l.seq DESC
LIMIT 20;
```

The installed adapter's `fetchMessages` reads its local cache; the SDK can fall back to persisted thread history. Do not restart the bot or call Telegram's `getUpdates` to obtain old conversations. A separate agent's Telegram conversation (for example, a private chat with Hermes) is outside Froggy's visibility unless that agent explicitly sends it to Froggy; its MCP calls alone do not include that conversation.

Production aggregate verification on 8 September 2026 found 12 unexpired message entries in one thread cache. Source hashes confirmed that the live Telegram pager and installed Chat, Telegram, and PostgreSQL adapter implementations matched the inspected versions. No message text was printed during verification.

## MCP calls

The owner can open **More → Agents → select an agent**, or use authenticated `GET /api/agents` followed by `GET /api/agents/<connectionId>`. The detail response includes the newest 50 invocation records for that connection. For older records, use an owner- and connection-scoped database query on `agent_invocations`, ordered by `(at, id)` with a limit.

Each stored invocation includes its tool name, timestamp, connection, outcome, optional task ID and amount, and stub marker. The row is written as `started` before execution, then updated. Follow `taskId` to retrieve stored task input/result/error; the invocation itself deliberately stores neither request arguments nor response bodies. URL-purchase calls currently do not record a purchase ID on the invocation, so correlate cautiously through owner/connection/time and do not invent a definitive link.

This records decoded `tools/call` invocations with a recognized agent connection. It does not record every MCP protocol message: initialization, listing, ping, notifications, and envelopes rejected before the invocation wrapper are outside this table. Nor does it store the external agent's surrounding conversation or reasoning. An old `started` row is an incomplete audit outcome, not proof that nothing executed.

Production aggregate verification on 8 September 2026 found 14 MCP invocation records. These counts are a dated availability check, not a promise that later retrieval returns the same count.

## Known Railway target

- Project: `d6f4178e-fc21-4827-8347-20b1cec2aba4`
- Production environment: `44c2247f-e0a2-43f8-9b46-586a29126157`
- App service: `393648df-65e9-4491-87f3-1b896c736b9f`

Load the `use-railway` skill before live operations. Use explicit IDs and its caller/session environment variables; do not relink the workspace or print variables. Use one session label per retrieval request.

For bounded HTTP diagnostics:

```sh
RAILWAY_CALLER=skill:use-railway@1.2.1 RAILWAY_AGENT_SESSION=froggy-chat-retrieval-YYYYMMDD railway logs --service 393648df-65e9-4491-87f3-1b896c736b9f --environment 44c2247f-e0a2-43f8-9b46-586a29126157 --http --method POST --path /api/chat --since 1h --lines 30 --json
```

For database reads, the verified mechanism is Python `subprocess.run` with an argument array: `railway ssh --project <project> --environment <environment> --service <service> -- bun -e <script>`. Pass the Bun script as one argument, without adding shell quotes inside that argument. Inside the service, use `import { SQL } from "bun"; new SQL(process.env.DATABASE_URL)` and parameterized SQL; close the connection afterward. No database credential needs to leave the service. Do not dump all tables or all users' records.

## Verification references

The deployed SHA-256 hashes matched the inspected versions of `apps/server/src/chat.ts`, `runs.ts`, `router.ts`, `turn.ts`, and `apps/web/src/routes/workspace-layout.tsx`. A production schema query confirmed the task, purchase, receipt, invocation and Telegram adapter tables. No customer rows were read for this runbook. The earlier investigation is in [CHAT_RECOVERY.md](evidence/CHAT_RECOVERY.md).

If a later deployment adds persistence, inspect the new schema and routes and update this runbook. Persistent conversation history is not implemented by this documentation change.
