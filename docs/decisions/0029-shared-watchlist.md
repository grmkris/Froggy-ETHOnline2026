# 0029 — Saved items are separate from monitoring

Status: accepted, 12 September 2026.

Froggy’s daily workspace is Home plus a mixed Watchlist. Home reuses the live conversation and exposes funding balances through “Your money” on the empty Home and in the workspace menu; it does not describe USDC/HBAR funding as complete holdings or buying power. Existing conversation, wallet, tools and account URLs remain valid.

A saved item owns a title, source identity, notes, revision and archive state. Token identity is chain plus address, with case-insensitive EVM address comparison. Product and flight variants are retained in notes and participate in creation deduplication. A saved link is not an approved paid endpoint, so the service Directory is unchanged.

The existing Store owns an owner-scoped, bounded book of at most 200 saved items. Memory mode follows the existing loud database-stub contract; Postgres uses the `saved_items` table, an owner advisory lock and revision comparisons. Retried saves deduplicate, concurrent edits conflict, and account deletion removes saved items. Saving performs no external fetch and starts no paid work.

Token rows reuse existing paid market results by exact network/address and show their observation time and simulation marker. No new provider read occurs because someone opened their Watchlist. Lookup explicitly submits through the existing paid-service path, under existing spending rules. An unknown price remains unknown.

Conversation attachment sends only an opaque item ID and revision. `watchlist_get` checks owner and revision; its result is retained through ordinary tool history. This keeps saved URLs, addresses and hostile notes out of the person’s typed text used for payment-recipient provenance. The chat renders this reference as a Watchlist link. Editing an item before it is read produces a version conflict rather than silently answering from different content.

Reminders remain in the existing schedule system and appear in Watchlist’s Coming up section. Generic website monitoring, conditional price alerts, observation history and P&L are separate capabilities. This change does not label unsupported checks as active or lift the restriction on unattended shared-browser control.

Desktop Watchlist starts closed. Its open state survives client navigation within the workspace and resets for a new session. Reminder, digest and setup queries are keyed by session and wait for identity readiness, so an account transition cannot display a previous session’s cached response.
