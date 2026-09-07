# 0011 — One balance, just-in-time conversion, and a two-way pager

Decided 7 September 2026 by the owner after the team demo (D1 to D4 in `docs/plan/DECISIONS.md`). Lanes 1 and 4 implement them.

## The four decisions

**D1, limits hidden, engine kept.** A new mandate carries the three allowlists (payee, host, network) and nothing else: no per-transaction cap, no rolling cap, no approval threshold, no expiry. `withoutLimits` strips those rules from a saved mandate on hydrate and from any `mandate.update` on the socket, so an old client cannot re-add one; `SPENDING_LIMITS=1` is the one switch that keeps them, read in `environment.ts` like every other stub or mode. `authorize` in `packages/wallet/src/policy.ts` is untouched; the approval machinery stays for the day the limits come back as advanced settings. Restraint now lives in provenance, the allowlists and Privy's policy on the agent's signer.

**D2, one dollar total.** `WalletSummary.totalUsdMicros` is USDC on Base plus the HBAR in the person's own Hedera account at the mirror-node rate, and null when either side is unknown, because an unknown balance is not zero. The per-chain breakdown sits behind a disclosure. The words "task credit" and "pocket" leave the UI; `pocketUsdMicros` stays as an internal figure.

**D3, just-in-time conversion.** When a Hedera payment needs more HBAR than the person holds, `spend()` converts their USDC before judging the payment, with no chat message and no deposit watcher.

**D4, two-way Telegram.** The agent may message the person unasked (`notify`), set one-off and recurring reminders, and run scheduled unattended turns whose reports go to Telegram and into the web stream.

## The conversion, as implemented in `apps/server/src/session.ts`

`replenish()` runs before `judgeAndReserve`, outside the serial lock, only when the intent draws from the pocket and a `convert` dependency exists (it does not without `TREASURY_EVM_ADDRESS`). It joins an in-flight conversion first, re-reads the pocket, and computes the shortfall.

Amount policy: `target = max($2, price × 2)`; `amount = min(target − pocket, USDC held)`. Two dollars is the floor because Base gas and Hedera fees make dust pointless; twice the price covers the next payment like this one. When `amount < shortfall` nothing is sent and the payment is denied `conversion_failed` with "You hold $X of USDC on Base and this needs $Y more on Hedera." No agent signer means the same denial with the signer's own note.

The conversion is a nested `spend()` keyed `convert:<parent key>`, provenance `server`, payee the treasury (a birthright payee), so it is judged, reserved, receipted and idempotent like any other spend, and an SDK retry of the payment joins the same conversion rather than buying HBAR twice. `isConversion(receipt)` tells the digest's budget and the one-paid-request rule to ignore it.

Partial-failure contract, in order of how much moved:

- Privy refuses the USDC transfer: the parent payment is denied `conversion_failed` quoting the refusal; nothing was paid.
- The USDC moved but funding the Hedera account failed: the pocket is credited by the amount that moved, the parent is denied with the treasury transaction id and "try again in a minute", and the next attempt finds a covered pocket and either pays or fails honestly at the network.
- Both legs succeed: the conversion receipt's `settlement.note` says how much HBAR moved into which account and by which transaction, and the payment proceeds.

## Schedules, as implemented in `apps/server/src/schedules.ts`

A schedule is a row: label, action (`remind`, `prompt`, `digest`), cadence (`once{at}`, `daily{time}`, `weekly{time, weekday}`), an IANA zone, `next_run_at`, `last_run_at`, `claimed_at`, status. The cadence is kept as the person said it and the next run is recomputed from it after every run through the zone's offset, so "08:00" is still eight after the clocks change; the Berlin change on 2026-10-25 is a test.

**At-least-once claiming.** The minute tick claims due rows with one `UPDATE … SET claimed_at = now WHERE status = 'active' AND next_run_at <= now AND (claimed_at IS NULL OR claimed_at < now − 10 min) RETURNING`, so two processes on one database split the rows and never fire the same one. `finish` clears the claim and writes the next run (`done` for a once-off). A process that dies between claim and finish leaves a claim that goes stale after ten minutes and fires again. That is at-least-once, chosen over at-most-once because a reminder that never arrives is worse than one that arrives twice, and a scheduled prompt is bounded by its own budget (a quarter, a minute, twelve steps, no browser tools) so a repeat costs little.

**Busy people.** A run that finds a turn already in progress reports busy; the ticker retries it a minute later for fifteen minutes past the due time, then skips it. The fifteen minutes are counted in memory per ticker, so a restart mid-retry starts them again, which is bounded and cheap.

**The digest.** It is now one schedule row with a `digest` action, kept under its old `{hour, timezone}` API at `/api/digest` so the Settings control needs no change. The old `users.digest_hour` and `digest_timezone` columns are dropped by migration 0008 and their values are not copied: only team accounts had one, and they set it again on the Settings page.

## Why `notify` and `schedule` are tools and the conversion is not

The leash rule is that nothing which changes spending authority may be a tool. A message to the person changes nothing about what may be paid; a schedule changes when the agent runs, and a scheduled prompt runs under the same mandate with fewer tools and a smaller budget than a chat turn. Neither widens what the model can spend, so both may be tools the model calls.

The conversion moves the person's USDC. It is keyed `convert:<parent>` and happens only inside `spend()`, on the way to a payment the mandate has to allow anyway, judged and receipted as a spend of its own. Exposing it as a tool would let a prompt move USDC to the treasury on its own initiative, with no payment behind it; keeping it inside the spend path means it can only ever happen in the amount the next payment needs. `wallet_topup` was deleted for that reason.

## What is accepted with this

- A notice is best-effort: a failed Telegram post is a warning in the log and the web stream still gets the marker, whose `telegram` flag is honest about whether the phone saw it.
- `notify` writes an assistant line into the Telegram DM history the model sees, so the person's reply lands in a conversation the model remembers; that history is in memory and does not survive a restart, as before.
- A scheduled prompt can buy a listed service (`service_run`) unattended, under the mandate, up to its budget. It cannot drive the browser.
