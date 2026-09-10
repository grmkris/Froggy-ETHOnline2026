# The shared browser

## Summary

The shared browser is the product's headline: a browser the person and the agent look at together, where the person can take the page at any moment. It is a hosted browser driven remotely — there is no local Chrome — and what the person sees is a live screencast they can click into.

It is deliberately **not a destination**. It is a contextual view inside a task, and closing it never stops the work.

## The simple case

A request that needs the web provisions a browser and the pane fills with the page. The agent drives: it navigates, reads, clicks. The person watches it happen frame by frame.

If the person clicks in the canvas, the page is theirs — their click lands on the real page and the badge flips to say who is driving. The work does not stop. When they stop touching it, the agent can pick it up again.

## Who is driving

Three states, and the third is not redundant:

| Mode | What it means |
| --- | --- |
| `agent` | The agent is acting. |
| `human` | The person is acting. |
| `idle` | **Nobody is currently acting** — which is the state the agent may enter from. |

Collapsing `idle` into `agent` would mean the badge lies about whether work is happening, so it is kept separate. A person's own input takes the page the way the panic control does, without asking.

An agent operation that had to wait for the person unblocks for one of three reasons, and they are recorded apart: the wait was skipped, the person went quiet, or the wait timed out.

> Technical note: the person's input and the frames it produces travel on one socket, in both directions. Two independent transports could reorder a click against the frame that shows its result, and a browser where your click appears to happen before you made it is worse than a slow one.

## The request, event by event

### Asking

A browsing request carries an instruction and a budget. The instruction is bounded in length, as is everything else that crosses from the page into a prompt — every limit on this surface is a cap on what a hostile page can push into a prompt, a decision, or the replay buffer.

### Answered at once

No browser exists yet and none is provisioned. A request refused before it starts — no scope, no budget, the leash — costs nothing and leaves no browser running.

### The work begins

A browser is provisioned and the pane shows it. This costs money: browsing is paid everywhere, quoted like anything else, and bounded by the budget the request carried.

### While it runs

Frames stream. The agent acts, the person can interrupt by touching the page, and ownership moves between them without the run pausing. A snapshot that may be stale is retaken rather than acted on.

The person can leave the view entirely. The browser and the run both continue.

### Finishing

The run ends. What the browser did is in the turn; the page itself is not part of the record.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | A person's browsing request and an agent's `browse` scope reach the same browser. | No effect. |
| The policy in force | Bounds what can be paid _from_ a page. An address read off a page is never payable at any amount. | Applies from the next judgement. |
| Funds available | Browsing is paid; an empty balance means no browser. | Running out ends the browsing, not the run. |
| What is being asked for | Only a browsing request provisions one. | No effect. |
| The asking agent's grant | `browse` is the scope that admits an agent. | No effect. |
| The shared browser | The subject of this document. Ownership starts with the agent. | The person can take it at any moment; the run is not stopped. |
| Appearance and motion | The canvas uses a ring and never a border. | Rendering only. |

## Cancel and interrupt

| Event | Before the browser is provisioned | While it is running |
| --- | --- | --- |
| Stop — the person halts this run | Nothing to stop. | The run ends. The browser is torn down with the work that needed it. |
| Freeze — the wallet is frozen, mid-run | No browser is provisioned, because provisioning is a spend. | Browsing cannot be extended; anything requiring payment is refused. |
| Denying a waiting approval, or leaving it unanswered | Not applicable. | A payment the page demanded is refused; the page stays where it is. |
| Asking something else while this request is still in flight | No effect. | The superseding run aborts the old one; the browser belongs to the work, not the tab. |
| Leaving the page, or switching to another conversation, mid-run | No effect. | **Closing the browser view never stops the work.** The browser keeps going. |
| Reload; the tab or the app closed | No effect. | The screencast reconnects; the browser was never in the tab. |
| Network lost; the socket drops | No effect. | Frames stop arriving. The browser continues remotely. |
| The model, a service, or the facilitator errors or rate-limits mid-run | No browser. | The step fails; the page is left where it was. |
| The session expires, or the person signs out | No browser. | The person loses the view; the run is the server's. |
| The policy or a cap changes mid-run | Applies to provisioning. | Applies from the next judgement. |
| Funds run out mid-run | No browser is provisioned. | Browsing stops when its budget is spent. |
| The person takes control of the shared browser mid-run | Nothing to take. | Ownership moves to `human`. The work is not stopped. |
| The same account open in a second tab or on a second device | No effect. | Both can watch. Who may drive from two tabs at once is an open question. |

## Interactions with other systems

**The leash.** The browser is the reason provenance exists. An address that appeared in page content is `page` provenance and is **never payable**, at any amount, by any rule.

**Money and receipts.** Browsing is quoted and paid like a service, and its cost lands on a receipt.

**Approvals.** A page that demands a payment above the ask line parks the run exactly as anything else does.

**Provenance.** See [the leash](the-leash.md#provenance-where-an-address-came-from). This is the concern the whole feature is built against.

**History and persistence.** What the browser did appears in the turn. The page is not stored.

**The shared browser.** This document is it.

**Connected agents and grants.** The `browse` scope admits an agent to the same browser the person watches.

**Notifications.** Browsing raises none on its own.

**Navigation and URL state.** `/browser` is a route and not a destination; it can be popped out.

**Appearance, motion and accessibility.** The canvas is clickable and keyboard-reachable through an off-screen focus proxy — off-screen rather than hidden, because a hidden input cannot be focused and an unfocusable one receives no composition events, which is what makes typing in a non-Latin script work at all.

**Offline and reconnection.** The screencast reconnects; the browser is unaffected by the person's connection.

**Stubs.** Without a browser credential the whole surface is a loud stub and no page can be driven. Browsing is one of the things no stub can stand in for.

## Edge cases

- Clicks are sent in the page's own device pixels, scaled from wherever the layout put the canvas, so the canvas can be any size without clicks landing wrong.
- The canvas uses a ring rather than a border, because a border offsets every click by its own width — a bug that presents as "clicks land slightly wrong".
- Printable characters do not travel as key events; they arrive as text from the focus proxy, which is the only way an IME composition survives the trip.
- A keep-alive shaped like input would flip arbitration to `human` on every interval and starve the agent permanently, so it is not shaped like input.
- The browser outlives the view. A person who closes the pane has no indication in that pane that it is still running and still costing money.
- Every payload crossing from the page is capped — challenge, body, and URL each have their own ceiling.

## Open questions and verification

- What happens when two tabs both try to drive the page has not been established, and the arbitration is described here for one viewer.
- Whether the person sees the browsing budget being consumed while it runs, and where, was not established.
- Whether a browser is torn down promptly when its run ends, or lingers, is not established — it matters because it is billed by the provider.
- The seat cap that bounds provider spend and concurrency is mentioned in `docs/plan/STATUS.md` but its effect on a person who hits it has not been read out of the code.
- The three wait reasons are recorded; whether any of them is ever shown to a person is not established.

Verified against the Froggy tree at commit `5caed50`.
