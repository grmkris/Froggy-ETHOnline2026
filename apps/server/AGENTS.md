# apps/server

One Bun process: the SPA, the JSON API, both WebSockets, the paid oracle endpoint, and the Chrome the agent drives. One origin, so there is no CORS configuration that exists only in development.

`index.ts` owns the process lifecycle and nothing else. `router.ts` answers requests. `services.ts` is the only file that holds the browser, the wallet and the payer at once — that adjacency is deliberate and contained.

Three things here are load-bearing and easy to undo by accident:

- `abortSignal` is the **run's**, never the request's. A client hanging up is a detach, not a cancellation, and with money in the loop that is not academic.
- `consumeSseStream` must keep draining. Without a reader on that branch the model loop stalls the moment a tab closes and the turn finishes truncated.
- Freeze and approval arrive on the app socket. They are not tools, and adding one would remove the leash.
