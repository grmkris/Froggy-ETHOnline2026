# Onchain alert delivery evidence

13 September 2026. A bounded live Base stream produced a real activity record, persisted it and its alert in disposable local PostgreSQL, and delivered the activity through Froggy's existing Telegram pager. A fresh read-only database connection verified the matching delivery receipts at `2026-09-13T01:46:46.496Z`. The public-only result is retained in [onchain-alert-delivery-2026-09-13.json](onchain-alert-delivery-2026-09-13.json).

This verifies one real Telegram API acceptance and durable delivery correlation. It does not prove that the recipient opened the message, that monitoring is deployed in production, or that a browser-started production watch is running.

## Live activity and scope

| Field | Observed value |
| --- | --- |
| Network | Base, `eip155:8453` |
| Watched public contract | Uniswap v4 PoolManager `0x498581ff718922c3f8e6a244956af099b2652b2b` |
| Transaction | [`0x2a8e7074af340d9318d58c24038da50887e63f0cf9200d36214f1256af6964d5`](https://basescan.org/tx/0x2a8e7074af340d9318d58c24038da50887e63f0cf9200d36214f1256af6964d5) |
| Block | `51236813` |
| Block hash | `0xfcdc2694572354cbf06d3a991f5b96fe36d680054a58949f4d4d3964d88f963e` |
| Capture | Three sealed Substreams blocks, independently matched to configured Base RPC hashes |
| Activity status | `stubbed: false`, provisional; delivered after the two following captured blocks |
| Application storage | Disposable PostgreSQL 17 fixture bound to `127.0.0.1:55441`, database `froggy_alert_delivery_proof` |

The probe watched an existing public pool transaction. Froggy did not sign or submit a transaction or move funds. The PoolManager identity comes from the [official Uniswap deployment feed](https://developers.uniswap.org/deployments.json), also pinned by the application's deployment registry.

All watchlist, activity, outbox, application-history, and Chat SDK state writes occurred in the disposable local database. The probe resolved only the requesting operator's current Telegram pairing from the previously supplied production conversation, using the [conversation retrieval runbook](../CONVERSATION_RETRIEVAL.md). Production access was read-only. Provider and bot credentials remained in process memory; this evidence omits account, chat, message, and credential identifiers.

## Delivery result

The probe used `liveWalletStream`, configured Base RPC verification, `configureOnchainMonitor`, `commitWalletBlock`, `postgresStore`, `dispatchWalletAlerts`, and `liveTelegramPager`. It retained exactly two reviewed verification messages in the local outbox and cancelled the other local test candidates before any delivery attempt.

| Reviewed message | Attempts | Durable result |
| --- | --- | --- |
| Monitoring-ready verification | 1 | Uncertain; preserved without retry |
| Public Base activity verification | 1 | Delivered; non-null Telegram receipt persisted |

After the pager initialization fix, a separately guarded run allowed only the untouched activity message. Before sending, it required the original immutable review manifest, unchanged current pairing, the first alert still uncertain after exactly one attempt, the activity still pending with zero attempts, and no additional pending messages. Its delivery wrapper allowed one call, checked the reviewed activity text and identity, and closed the SDK afterward. The first alert was never rewritten or resent.

A new database connection then ran a read-only transaction and confirmed:

- The activity alert is delivered after exactly one attempt and references the persisted real activity.
- The activity's receipt matches the outbox receipt.
- Froggy's `conversation_messages` record is delivered and carries the same platform receipt.
- Chat SDK `chat_state_lists` contains exactly one history entry with that receipt for the configured recipient.
- The first alert and its Froggy history record remain uncertain after one attempt, without a platform receipt.
- No alerts remain pending or sending in this disposable fixture.

The saved JSON stores these comparisons as booleans; it contains no recipient or message identifiers.

## Cold-start failure and fix

The first outbound attempt exposed a Chat SDK lifecycle issue. Its thread-post path sends through the Telegram adapter before appending the SDK's own message history. The SDK automatically initializes when handling a webhook; a fresh process can call outbound `thread.post` before any webhook has arrived.

An isolated reproduction used the installed Chat SDK, Telegram adapter and PostgreSQL state adapter with every HTTP request intercepted and a fake PostgreSQL client. It made zero network requests:

| Synthetic case | Observed sequence | Result |
| --- | --- | --- |
| Fresh SDK, no initialization | Fake `sendMessage` accepted; history append attempted | `PostgresStateAdapter is not connected. Call connect() first.`; no receipt returned to caller |
| Explicit initialization | Fake state connection/schema setup; fake `getMe`; fake `sendMessage`; history append | Receipt returned successfully |

This reproduces a failure after the transport has accepted a message. It does not establish whether the first real message reached Telegram. Preserving its uncertain state and avoiding a retry prevents the probe from introducing a possible duplicate.

The [pager](../../apps/server/src/telegram/pager.ts) now initializes the SDK before creating a new outbound alert intent and sending. Its other outbound paths initialize as well, and pager shutdown is registered with the server's Effect lifecycle. The successful activity attempt exercised initialization, state persistence, and shutdown against the real Telegram adapter and disposable PostgreSQL.

## Reproduction boundary

The original capture used a temporary Bun script with a bounded Base stream and no transaction submission. The two delivery attempts were separately reviewed, capped, and guarded by the same immutable manifest. These scripts are deliberately not an unattended retry recipe: rerunning a delivery whose outcome is uncertain can duplicate a message.

To reproduce safely, create a new isolated PostgreSQL fixture, apply the current migrations, resolve the explicitly authorized recipient, capture a new bounded public activity, and review new exact message text and a new immutable manifest before one delivery attempt. Verify outbox, activity, application history and SDK history from a fresh read-only connection. Retain an uncertain result without automatic replay.

The price-source checks are separate evidence in [ONCHAIN_ALERT_PRICES.md](ONCHAIN_ALERT_PRICES.md). This delivery probe exercised Base only; it makes no claim about Robinhood Telegram delivery, production deployment, or the complete browser activation flow. The disposable database was retained for handoff after this verification.
