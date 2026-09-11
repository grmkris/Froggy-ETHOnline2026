# apps/server

One Bun process: the SPA, the JSON API, both WebSockets, the paid oracle endpoint, the Telegram webhook, the schedule ticker, and one hosted browser per signed-in user. One origin, so there is no CORS configuration that exists only in development.

`index.ts` owns the process lifecycle and nothing else. `router.ts` answers requests. `services.ts` is the only file that holds the browser, the wallet and the payer at once — that adjacency is deliberate and contained. `turn.ts` is the one agent loop; the web chat, Telegram and a scheduled run all start it and differ only in where the words go.

Where money is decided and moved:

- `session.ts` — `spend()` is the single choke point: price and authorize, reserve the run budget, replenish if needed, then recheck policy and draw the pocket under one lock before paying and writing the receipt. Nothing pays around it. Only after the parent Hedera payment is allowed and reserved, `replenish()` converts the person's USDC to HBAR when the pocket is short: a nested spend keyed `convert:<parent key>`, judged and receipted like any other, never a tool (`docs/decisions/0013`).
- `session.ts` — `spendTrade()` is the typed trading branch of the same authority boundary. It serializes immutable human/rule approval, reserves token principal and native fees in the durable trading book, and persists signing identity before broadcast. Trading capital never uses an invented USD quote; service purchases continue through `spend()` (decision `0021`).
- `conversion.ts` — durable recovery of the USDC transfer and Hedera funding. Persist transaction identifiers before broadcast, reconcile unknown outcomes, and credit the pocket once only after funding is confirmed.
- `paid-request.ts` — every paid HTTP request (`x402_fetch`, The Graph per query) goes through here, in this order: public URL, host allowlist, 402 decoded, a payer exists, then `spend()`.
- `tools.ts` — the agent's tools. `wallet_send` is an ERC-20 transfer the person's Privy wallet signs under the committed policy and this process broadcasts; the signer's refusal is a fact on the receipt, never a reason to retry. `notify`, `schedule`, `schedules_list` and `schedule_cancel` are allowed as tools because none of them changes what may be spent.
- `schedules.ts` — the next run of a cadence in the person's zone, and the minute tick that claims due rows through the store (one `UPDATE … RETURNING`, so two processes never fire the same row) and fires them: a reminder becomes a notice, a prompt or the digest becomes `runScheduledFor` in `jobs.ts`. `schedule-routes.ts` is the HTTP side and the one `createSchedule`.
- `notices.ts` — what the agent says unasked: to the paired Telegram thread through `TelegramPager.notify`, and always into the web stream as a `notice` message whose `telegram` flag says whether the phone saw it.
- `budget.ts` — turns and steps per person per UTC day, counted before any model call. In memory on purpose.
- `unlock.ts` — one-time, ten-minute links to the page a payment unlocked, opened by the shared Chrome, which holds no token.

Things here that are load-bearing and easy to undo by accident:

- `abortSignal` is the **run's**, never the request's. A client hanging up is a detach, not a cancellation, and with money in the loop that is not academic.
- `consumeSseStream` must keep draining. Without a reader on that branch the model loop stalls the moment a tab closes and the turn finishes truncated.
- Freeze and approval arrive on the app socket. They are not tools, and adding one would remove the leash.
- The pocket is drawn down inside the final policy lock and refunded on an abandoned or failed payment. Moving either side out of `session.ts` reopens a double-spend.
- An address the person typed is `user` provenance and reaches Privy; one the model produced is `model` and never does. `typedByPerson` is the whole test, and it is literal on purpose.
