# 0017 — Persistent history belongs to Froggy

Status: accepted, 9 September 2026.

Web, paired Telegram, schedules and external-agent calls need a durable account of what happened. A live socket and an SDK transcript cannot provide execution ownership or prove whether an external action completed.

Use versioned Effect records in the existing Store and PostgreSQL. Conversations, structured messages, runs, executions and bounded artifacts share owner-scoped reads. A per-owner locked sequence commits state and its publication event together. Database leases fence concurrent workers; expired work becomes interrupted and never automatically executes again. Persist ingress and tool starts before execution, and record uncertainty when an external action outlives its history write. Existing purchases, tasks and receipts remain the business evidence and financial authority.

The browser uses owner- and cursor-scoped TanStack DB Query Collections with fresh authenticated reads. Committed changes repair loaded pages by revision; gaps refresh snapshots. Unmount and account changes dispose collections and clear their Query cache. Token streaming remains in the active chat renderer. Chrome frames and financial approvals remain outside these collections.

Retain AI SDK 7. The isolated TanStack AI 0.53.0 / persistence 0.5.6 check passed Effect validation, text/tool round trips and stable hydration IDs, but demonstrated that a failed eager transcript write permits model/tool execution. Adopting it would still require Froggy's ingress, lease, evidence and delivery boundaries. The comparison does not establish adapter or financial parity; see the [recorded evaluation](../evidence/HISTORY_TANSTACK_AI.md).

History is read-only evidence. Internal retrieval defaults to the selected conversation; the person explicitly enables other conversations or invokes Explain. External OAuth history permission reaches only that connection's own calls. Existing services/pay permission and legacy tokens do not acquire private-chat access. Stored approvals and model-visible history cannot authorize spending.

Keep managed conversations and artifacts until deletion. Cap previews at 4 KiB, artifacts/message snapshots at 64 KiB, and model context separately at 128 KiB. Redact credentials before persistence and display truncation. Import only actual, unexpired, paired Telegram cache records with recovery provenance. Preserve queued inputs as context, record outbound intent and delivery uncertainty, and clear owner-scoped SDK state on deletion. No automatic send retry follows an uncertain Telegram delivery.

This release restores committed messages and checkpoints. It does not promise byte-perfect stream replay across process death, permanent binary attachments, offline financial execution, or recovery of historical web messages that were never stored. Rollbacks must retain capture or explicitly disclose a recording gap.
