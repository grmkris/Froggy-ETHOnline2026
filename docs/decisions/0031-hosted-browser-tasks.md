# 0031 — Server-owned hosted browser tasks

Date: 2026-09-13. Status: implemented behind `BROWSE_EXECUTOR=hosted`; production activation remains gated.

A browsing task can continue while the person chats, changes routes, or closes the tab. Froggy therefore owns it independently of `ChatRunRegistry`. Browser Use V4 performs the browser reasoning; Froggy retains the browser connection, wallet bridge, payment interception, approvals, budget, and task record.

## Lifecycle and authority

The quote pins the executor and originating conversation. One person can have one purchased or financially unresolved browser task. Quote signing, re-pricing and settlement share a per-owner queue; a signing marker is persisted before the outbound payer call. Signed or ambiguous quotes reserve the task slot across restarts. The customer price stays fixed. Bootstrap, continuation and reconnect consume the same cumulative model allowance and active execution allowance.

The first provider run is restricted to initializing `about:blank`. Only after Froggy attaches its existing CDP session, pre-document wallet injection and payment interception, and the bootstrap worker releases the session, does a continuation receive the user task. Profiles remain V3 and belong to a hashed user identity. Hosted browsers use V4; the browser record pins that version so rollback can still stop and account for an existing V4 browser.

The provider cancellation response is an acknowledgement. Human input stays locked until `worker.session_released`, a terminal summary, and this run's financial reconciliation are confirmed. After 15 seconds of an unconfirmed handover, the person can explicitly force-close the browser; V4 readback must confirm `stopped`. An unexpected browser replacement is cancelled and stopped before attachment. A disconnected wallet bridge triggers cancellation and recovery. Expired paused browsers release capacity; reconnect explicitly repeats bootstrap within the original allowance.

Pending approvals are scoped by run ID. Browser Stop does not abort the foreground chat, and chat Stop does not cancel the hosted browser task. Already submitted financial work retains its own durable reconciliation. Account deletion waits for the browser task to finish stopping before removing its records.

## Persistence and recovery

`Task.input` stores the pinned executor and conversation. `Task.result.hosted` stores private provider IDs, event cursor, attempt, dispatch state, cumulative cost/time, ownership intent, release/reconciliation flags, bounded activity and summary. No migration is required for these JSON fields or the text status column. Public snapshots and updates strip provider credentials, IDs, payment proof hashes and raw provider events.

There is one serial poller per task, normally every two seconds. It reads bounded event pages, advances a monotonic cursor and updates stable activity IDs. Unknown events are ignored safely; a failed tool step does not itself fail the task. Rate limits honor `Retry-After`, transient reads back off, and freshness is separate from lifecycle state. A terminal status must drain its event pages and reconcile its summary and payments before becoming Done.

The paid run creation marker is saved before POST. An ambiguous response is never automatically retried. Startup resumes the persisted run. Graceful shutdown cancels and drains the worker before detaching CDP; confirmed released sessions can be reattached by the next process. Unconfirmed shutdown closes the browser and keeps reconciliation state. This implementation assumes the repository's single server process; horizontally replicated task dispatch needs a durable lease before enabling multiple replicas.

## Interface

The task card is the primary view. It shows phase, approved fixed price, active time, four recent activity rows, expandable bounded history, task controls and the final result. Chat stays available. A compact active-task indicator appears only when the original card is offscreen, with a durable detail sheet when the conversation is unavailable. Terminal notices are deduplicated; history restoration does not replay them.

Watch live is explicit. Desktop uses the existing browser surface; mobile uses a full-height sheet. The provider viewer is inert while the agent owns the browser. Mobile surfaces pending approvals with a Review approval action. A bounded public request key keeps the original task card attached across layout remounts. Legacy task polling updates the same shared state and keeps its controls available. Loading or disconnected viewers do not imply the task stopped. New activity fades for 125 ms, completion gets one short opacity/scale transition, and reduced motion and keyboard input retain immediate, stable controls.

## Activation and limits

Default: `BROWSE_EXECUTOR=legacy`. `HOSTED_BROWSER_MODEL=gpt-5.6-luna` was used in the live compatibility checks. Scheduled/unattended tasks and requests requiring Froggy's delegated workspace/email tools remain on the legacy executor. An existing task keeps its pinned executor when configuration changes.

Before enabling hosted browsing on the live URL, complete a real Privy approval/payment and denial through the hosted browser, verify the resulting receipts and chain settlement, and clear the repository checks. Compatibility tests used a real Browser Use browser with a refusal-only wallet handler; they did not authorize wallet transactions. The hosted browser timing evidence is not a comparison against the legacy harness.

If a task says Checking what happened after an ambiguous provider POST, reconcile using the provider account's run history and creation time before attaching a discovered run ID. Do not reset its dispatch marker or buy another task as a retry. If a quote signature or payment is ambiguous, reconcile its ledger/payment proof and settlement before releasing the quote slot. Never infer a refund from Stop or Failed.

References: [Create run](https://docs.browser-use.com/cloud/api-v4/runs/create-run), [run events](https://docs.browser-use.com/cloud/api-v4/runs/get-run-events), [cancel run](https://docs.browser-use.com/cloud/api-v4/runs/cancel-run), [human-in-the-loop](https://docs.browser-use.com/cloud/agent/human-in-the-loop). See [implementation evidence](../evidence/HOSTED_BROWSER_IMPLEMENTATION.md).
