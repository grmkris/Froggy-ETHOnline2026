# The conversation

## Summary

A conversation is the ordered record of what was asked and what Froggy did about it. It is where a person reads the work back, and it is what makes a reload find a turn still running rather than an empty page.

The thing to understand first is that a conversation is not a place. Froggy's navigation has three destinations and a conversation is not one of them: **a conversation is something a task has**, and Home starts one and sends the person into it. This document owns what a conversation, a message and a turn are, what history keeps, and what each of the states a turn can be in means.

## The simple case

The person starts work from Home. A conversation comes into being, gets an id and a URL, and the answer streams into it. Every turn afterwards appends: what was asked, what the model said, which tools it called, which receipts those produced.

Coming back later, the person opens the conversation and reads it as it was, including the tool cards and the receipts filed under them. If a turn is still running when they arrive, they join it rather than seeing a frozen transcript.

## What history keeps

History is written from the moment [a run](the-request.md) begins, not when it ends. That is what makes a detach safe: the turn is already a fact before anything can be spent.

Each turn records **where it came from**, and there are exactly four sources: the web, Telegram, a connected agent, and a schedule. The same conversation can hold turns from more than one of them, because the same loop serves all four and only the destination of the words differs.

Each turn also carries a **status**, and the set is deliberately larger than "worked" and "did not":

| Status | What it means |
| --- | --- |
| `accepted` | Taken, not yet started. |
| `running` | Working. |
| `waiting` | Parked on a question a person has not answered. |
| `completed` | Finished on its own. |
| `failed` | Ended with an error. |
| `stopped` | A person ended it. |
| `interrupted` | The run's lease expired: the server stopped checkpointing it, as when the process died or was redeployed mid-turn. |
| `uncertain` | A payment was sent and nothing has said whether it landed. |

`stopped` and `interrupted` are kept apart because "a person ended it" and "the server lost it" are different facts about the same visible outcome — and the second needs a different sentence, because nobody watched it end.

A run holds a **lease** on the conversation, renewed as it checkpoints and good for thirty seconds. If the lease expires, the run is marked `interrupted` with the sentence "Execution stopped before completion. Inspect payment evidence before retrying.", every question it was waiting on is resolved as `interrupted`, and anything it had running or waiting becomes `uncertain`. That instruction is not boilerplate: a run that died without checkpointing may have paid for something it never recorded.

`uncertain` is kept apart from `failed` for the reason it always is: not knowing is not the same as knowing it did not happen.

Every record carries a version and a revision, so a conversation written by an older build still reads.

## The request, event by event

### Asking

A message is added to the conversation and the turn is recorded as accepted before any model is called. A request that repeats one already in history is recognised as the same request rather than appended twice.

### Answered at once

Nothing joins the conversation. A refusal before a run exists — the day's turns spent, a scope the grant lacks — is told to the asker on the surface they asked from, and the conversation is untouched.

### The work begins

The turn is in history and its status is running. From here a reload finds it.

### While it runs

The answer, the tool calls and the receipts append as they happen. A turn that parks on an approval shows as waiting. Nothing in the conversation can be edited while it runs, and there is no way to remove a turn in flight.

### Finishing

The turn takes its final status and the conversation is ready for the next one. What a stopped turn keeps is everything it had already done — history is not rewound, because the money it spent cannot be.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | Recorded as the turn's source: web, telegram, agent, or schedule. Decides where the words go, not what is kept. | Cannot change. |
| The policy in force | No effect on what is recorded. | No effect. |
| Funds available | No effect. A conversation records refusals as faithfully as payments. | No effect. |
| What is being asked for | Decides which cards appear in the turn. | No effect. |
| The asking agent's grant | An agent-sourced turn is attributable to its grant. | Revoking does not remove past turns; revocation is a timestamp, not a deletion. |
| The shared browser | A browsing turn carries the browser's activity alongside the words. | No effect on the record. |
| Appearance and motion | Cards rise and stagger as they arrive; reduced motion removes the movement, not the cards. | Rendering only. |

## Cancel and interrupt

| Event | Before the work begins | While it runs |
| --- | --- | --- |
| Stop — the person halts this run | Nothing recorded. | The turn ends as `stopped`, keeping everything it had already done. |
| Freeze — the wallet is frozen, mid-run | No effect on the record. | The turn continues and records refusals. |
| Denying a waiting approval, or leaving it unanswered | Not applicable. | `waiting` ends: denied continues the turn, denied-and-stopped ends it, unanswered ends it with the reason it ended. |
| Asking something else while this request is still in flight | The new turn is appended. | The superseded run is aborted, so its turn ends as `stopped` — the same status a person's own stop produces. The record does not distinguish them. |
| Leaving the page, or switching to another conversation, mid-run | No effect. | No effect on the record; the turn keeps appending while nobody watches. |
| Reload; the tab or the app closed | No effect. | No effect. On return the conversation is read back and a running turn is rejoined. |
| Network lost; the socket drops | The message may never arrive. | The record continues on the server. |
| The model, a service, or the facilitator errors or rate-limits mid-run | Nothing recorded. | The turn ends `failed`, or `uncertain` if a payment was in flight. |
| The session expires, or the person signs out | Nothing recorded. | The record continues; the person stops being able to read it. |
| The policy or a cap changes mid-run | No effect. | No effect. |
| Funds run out mid-run | No effect. | The refusal is recorded in the turn. |
| The person takes control of the shared browser mid-run | No effect. | The turn continues. |
| The same account open in a second tab or on a second device | Both see the same conversation. | Both watch the same turn; a new turn from either supersedes for both. |

## Interactions with other systems

**The leash.** Refusals are part of the record, not an error that replaces it.

**Money and receipts.** A receipt that came from a tool call is filed under that call's card in the conversation. One from a schedule or a replay has no call to file under and appears only in the wallet.

**Approvals.** A parked turn is `waiting`, and how it ended is kept.

**Provenance.** What was said is not signed or posted anywhere. Only spending is provable.

**History and persistence.** This document is it.

**The shared browser.** Browsing appears in the turn as it happens; the browser itself is not part of the record.

**Connected agents and grants.** An agent's turns stay attributable after its token is revoked, because revocation is a timestamp rather than a deletion — "which agent asked for that task last Tuesday" stays answerable.

**Notifications.** A waiting turn raises the badge that follows the person across pages.

**Navigation and URL state.** The conversation has a URL with its id; the run inside it does not. A conversation is treated as belonging to Home's slot in the navigation order, so moving out of one animates from where Home is rather than from nowhere.

**Appearance, motion and accessibility.** Cards arrive with a rise and a stagger; reduced motion removes it.

**Offline and reconnection.** The conversation is read from the server, so an offline person sees what was loaded.

**Stubs.** A stubbed turn is recorded like any other and its receipts carry the marker.

## Edge cases

- One conversation can mix sources: a turn started from Telegram and a turn started in the browser sit in the same thread.
- **A superseded turn and a turn the person stopped both end as `stopped`.** Nothing in the record says which happened, even though one was the person's decision and the other was a consequence of their next message.
- Only a completed turn contributes its full text to the context of later turns. A stopped, failed or interrupted one is carried forward in a reduced form, so the model does not read a half-finished answer as a finished one.
- History has a revision on every record, so two writers cannot silently clobber each other.
- A duplicate submission does not append twice; it is recognised and the existing turn is handed back.
- There is no delete and no edit. A conversation cannot be tidied after the fact, which is deliberate for something that records spending.

## Open questions and verification

- How a conversation is titled, and whether a title is generated or taken from the first message, was not established.
- Whether conversations can be listed, searched, or archived from the interface — and where — was not established from the routes alone. `docs/CONVERSATION_RETRIEVAL.md` records verified production access paths and retention limits and should be read before this section is written.
- Whether a schedule-sourced turn creates its own conversation or appends to an existing one has not been established.
- The lease is thirty seconds and a running turn checkpoints at most once a second, with a ten-second heartbeat behind that. A turn whose checkpoint writes fail is aborted deliberately, with "History could not be saved. Inspect this run before retrying." — durability is preferred over finishing the answer. None of this has been watched happen.
- What the transcript shows for a turn that ended `uncertain` has not been checked by hand.
- The claim that a running turn is rejoined rather than re-rendered on reload comes from the run's replay path and has not been watched happen.

Verified against the Froggy tree at commit `5caed50`.
