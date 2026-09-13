# 0040 — Inbox keeps a durable Updates feed

Status: accepted

Watch events, discovery and enrichment results previously lived in mutable detail slots or a transient app socket. Telegram delivery was the only lasting notification, and activity retention could remove the original evidence. Inbox now records those outcomes independently of delivery, alongside the existing Mail feed.

Each update belongs to an owner and has a UUIDv7 TypeID, optional saved item and activity references, an idempotency key, bounded title/body and an explicit simulated marker. Replaying an owner/key patches its content while preserving identity, creation time and read state. Postgres `read_at` is authoritative over the JSON document. Cursor pages contain at most 30 records, ordered by ID; deleting a saved item cascades its updates. Account deletion removes all updates.

Onchain activity and price events enter Inbox only after two successor blocks, under the same transaction as the stream cursor. They do so whether Telegram is enabled or paired. Finalization patches the existing record without making it unread. A reorganization or monitoring gap appends a correction only if the earlier event was actually filed. A reversion before the delay creates no update. Telegram's durable delivery outbox remains separate.

Finished or interrupted enrichment, successful chain discovery and non-email notices also file updates. Discovery and enrichment use their intent keys to avoid a new row on reconciliation. Email stays in Mail. Inbox readers may inspect an associated activity while it survives retention; the durable update still explains what was filed after activity expires.

The owner HTTP API lists, opens and marks records read. Agent HTTP tokens cannot access these routes. MCP exposes only `updates_list` under `watchlist:read`; reading through a tool never marks a record read. App sockets publish absolute unread counts on welcome and after committed changes. The UI also refreshes periodically to recover from missed messages.

Two counts live on navigation: approvals on Home and unread updates on Inbox. Only the first interrupts. Mail remains the default Inbox feed. Read updates are not pruned yet; grouping nearby events and retention for old read rows are separate future decisions.
