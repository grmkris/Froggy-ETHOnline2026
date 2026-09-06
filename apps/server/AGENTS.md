# apps/server

One Bun process: the SPA, the JSON API, both WebSockets, the paid oracle endpoint, the Telegram webhook, the digest scheduler, and one browser worker process per signed-in user. One origin, so there is no CORS configuration that exists only in development.

`index.ts` owns the process lifecycle and nothing else. `router.ts` answers requests. `services.ts` is the only file that holds the browser, the wallet and the payer at once — that adjacency is deliberate and contained. `turn.ts` is the one agent loop; the web chat, Telegram and the digest all start it and differ only in where the words go.

Where money is decided and moved:

- `session.ts` — `spend()` is the single choke point: price, policy, reservation and the pocket draw under one lock, then the payment, then the receipt. Nothing pays around it.
- `paid-request.ts` — every paid HTTP request (`x402_fetch`, The Graph per query) goes through here, in this order: public URL, host allowlist, 402 decoded, a payer exists, then `spend()`.
- `tools.ts` — the agent's tools. `wallet_send` and `wallet_topup` are ERC-20 transfers the person's Privy wallet signs under the committed policy and this process broadcasts; the signer's refusal is a fact on the receipt, never a reason to retry.
- `freeze.ts` — the kill switch as one function, six steps, whichever surface presses it. The pocket is zeroed as the last of them.
- `budget.ts` — turns and steps per person per UTC day, counted before any model call. In memory on purpose.
- `unlock.ts` — one-time, ten-minute links to the page a payment unlocked, opened by the shared Chrome, which holds no token.

Things here that are load-bearing and easy to undo by accident:

- `abortSignal` is the **run's**, never the request's. A client hanging up is a detach, not a cancellation, and with money in the loop that is not academic.
- `consumeSseStream` must keep draining. Without a reader on that branch the model loop stalls the moment a tab closes and the turn finishes truncated.
- Freeze and approval arrive on the app socket. They are not tools, and adding one would remove the leash.
- The pocket is drawn down inside the reservation lock and refunded on an abandoned or failed payment. Moving either side out of `session.ts` reopens a double-spend.
- An address the person typed is `user` provenance and reaches Privy; one the model produced is `model` and never does. `typedByPerson` is the whole test, and it is literal on purpose.
