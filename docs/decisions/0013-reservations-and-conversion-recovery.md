# 0013 — Reservations and durable conversion recovery

8 September 2026. Fixes from the review of recent commits, authorized by the owner for deployment.

## Payment ordering

A Hedera request must pass its own policy and reserve capacity before it can trigger a USDC conversion. After funding, it passes policy again and draws the pocket under the session lock. A price change during funding requires a fresh request. Denied payees, unavailable approvals, and exhausted run budgets never initiate conversion.

Scheduled runs pass their budget through tools and detached service tasks into the ledger. Reservations include a run ID. Postgres locks the user row while checking counted reservations and inserting the next one, so concurrent workers cannot each spend the same remaining run budget. Conversion funding is excluded from this service-purchase budget; it remains a separately authorized and receipted USDC spend. The model's between-step stop is only a stopping condition.

An abandoned attempt is known to have sent nothing. It keeps its audit row but releases its payment key, allowing safe retry. Unknown submissions keep their reservation and key. Confirmed chain failures are distinguished from unknown outcomes.

## Conversion journal

Migration 0010 adds a conversion journal and the nullable spend run ID. It is additive and runs in Railway's pre-deploy step.

The conversion key remains `convert:<parent key>`. Before EVM broadcast, the signed transaction's hash is persisted. Before Hedera broadcast, its transaction ID and recovery data are persisted. A newly created account's key is sealed before persistence; Privy custody stores identifiers instead of private keys.

Recovery checks the original network and known transaction identifiers. It retries an HBAR leg only when nothing was submitted or the mirror confirms failure. Unknown submissions stay pending. The pocket is credited only after confirmed HBAR funding, with the credit and journal marker committed in one transaction. Concurrent recovery cannot apply the credit twice.

The journal recovers on the next eligible payment attempt, including after restart. It is not a background reconciliation service. A crash after claiming a leg but before recording its identifier remains held for operator investigation; absence of an identifier is not permission to submit again. Historical conversions predating the journal cannot be reconstructed automatically. Existing receipts remain historical observations and are not rewritten when recovery later succeeds.

The service remains at one replica: general mandate window checks and the shared Chrome profile still rely on process ownership. The database guarantees here cover run budgets, conversion phase claims and credit, not every session operation across replicas.

## Schedules and credentials

A schedule completion must match its current claim timestamp and active status. Cancellation wins over a worker finishing later, and a stale worker cannot overwrite a newer claim. The digest control and schedules list invalidate each other's query after mutations.

CLI commands lock the credential file's directory before refreshing, then reread credentials under the lock. Only one process rotates a refresh token. Credential replacement is atomic and mode 0600. HTTP/authentication failures exit nonzero. A process killed while holding the lock leaves it for manual removal after checking no CLI command is running; time alone does not establish that its refresh request stopped.

## Verification

Shared memory/Postgres contracts exercise cancellation, stale claims, concurrent budget reservations, safe retry, and one-time credit. CLI tests run two actual child processes against the OAuth handler. Conversion tests simulate lost EVM and Hedera replies and restart recovery, including sealed account custody. Playwright covers settings synchronization and rapid balance changes with both motion preferences. These tests use synthetic identities and funds; they do not establish live onchain settlement.
