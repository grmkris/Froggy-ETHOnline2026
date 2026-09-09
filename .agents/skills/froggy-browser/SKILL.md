---
name: froggy-browser
description: Work on the shared Chrome, the screencast, arbitration, page input, or snapshots without breaking human handoff or leaking page content into decisions.
---

# The shared browser

One Chrome, two drivers. The Chrome is Browser Use's — nothing in this repository launches a browser, and there is no second provider to fall back to. Every rule below exists because breaking it produced a browser that looked alive and was not.

**The provider's `cdpUrl` is `https://<id>.cdp.browser-use.com`, not a socket.** Attach to the `webSocketDebuggerUrl` Chrome names at `/json/version` on that host, resolved per connection and never persisted. Fixtures written from the documentation had this as `wss://connect.browser-use.com` and every real browser was rejected as an invalid CDP origin; no local test could see it. Browsers, profiles and billing are `/api/v3`. `/api/v4` is the hosted agent API, which Froggy does not use.

**A seat is money.** Every browser bills by the hour, so `MAX_BROWSERS` bounds provider spend and the project's concurrency limit, the idle release is what stops an abandoned tab billing all night, and browsing is sold only inside a paid task. Stopping a browser is also the accounting read: the stop reply carries its final cost, and a stop that fails must keep the browser's id, or nothing will ever stop it.

**Ack every screencast frame unconditionally, before deciding whether to send it.** Chrome stalls the stream at two unacked frames even when you drop the frame locally, so a conditional ack means the first slow client freezes the pane for good, with no error anywhere.

Arbitration has **no lock**. The human always wins immediately; the agent is asked to pause, bounded by a starvation cap. Never route a keepalive through input handling — a ping that counts as human input starves the agent on every interval.

Panic aborts the run **first**, then takes the page. The other order gives the next queued tool call the page back after the quiet window, which looks exactly like the button not working.

Frames never touch React state. The painter in `use-browser-socket.ts` owns the canvas; at thirty frames a second, one `setState` per frame re-renders the whole workspace thirty times a second.

Snapshot refs are replaced wholesale on every capture. A surviving ref resolves to whatever now occupies that slot, and the agent clicks a different button than the one it reasoned about.

Page content enters the model behind `PAGE_CONTENT_FENCE`, as data. Nothing read from a page may become a payee, a recipient, or a permission.

The provider is told a hash, never a Privy DID: one profile per person, named by `providerUserKey`. Browser Use gets no wallet credentials and no spending authority.

This package must not import `@froggy/wallet`, and `@froggy/wallet` must not import it. `tools/graph.ts` enforces that. The browser is where hostile content lives; the wallet is where signing happens.

CDP payloads are narrowed at the call site against the protocol documentation rather than schematised — see `docs/decisions/0004`. Every _other_ wire format in this repository is an Effect Schema, including the three-number frame header.
