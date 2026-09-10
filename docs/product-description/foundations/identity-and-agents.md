# Identity and agents

## Summary

Three kinds of actor meet in one workspace: the person who owns it, the wallet that holds their money, and the outside agents they have let in. This document owns what each is, how an agent is admitted, and the line between what an agent may _ask for_ and what only a person may _change_.

That line is the important part. Scopes map onto the things an agent can buy, not onto the things a person can change: **no scope approves a ticket, raises a cap or adds a payee.** An agent with every scope Froggy offers still cannot widen its own leash.

## The simple case

The person signs in, and that sign-in is their identity — there is no second account system beside it. A wallet comes with it, and the balance on it is what the agent may spend.

To let an outside agent in, the person copies an instruction from Home or the Wallet and gives it to that agent. The agent connects, a consent screen appears asking for a named set of scopes, and the person leaves on the ones they want. From then on the agent shows up in **Connections** with what it has been doing and what it has spent, and can be disconnected there.

## Who a caller is

The person's identity is their Privy DID and it is the only one. A user row is keyed by that value, so there is never a moment where two sources of truth about "who is this" can disagree.

An **agent token** is what a connected agent carries. What the workspace keeps about it is the label the person gave it — "Hermes", "Claude on the laptop" — when it was made, when it was last used, and when it was revoked. **The secret itself is not kept**: it is shown once at creation and only its hash is stored, so a copy of the database cannot impersonate an agent. Every secret starts with a fixed prefix so a leaked one is recognisable in a log.

Revocation is a **timestamp, not a deletion**. "Which agent asked for that task last Tuesday" stays answerable after the token is gone.

A **grant** is the same idea for an MCP client that came in through consent: which client, the name it gave at registration, the scopes the person left on, when it happened, and when it was withdrawn. The tokens that carry a grant are hashed rows, rotated on use, so a copy of a grant says who was allowed what and never lets anyone act on it.

## What a scope is for

Five, in the order the consent page shows them:

| Scope | What it buys |
| --- | --- |
| `brief` | A lending brief. |
| `browse` | A run on the shared browser. |
| `pay` | Signing an x402 payment header for a task the agent brings. |
| `services` | Buying from the fixed-price catalog — and what **every** MCP tool call needs. |
| `history` | Reading back what happened. |

Every one of them is a thing to _buy_ or _read_. None of them is a thing to _change_. An agent cannot answer its own approval, cannot raise the per-spend cap, cannot add a payee to the allowlist, and cannot unfreeze a wallet. Those are the person's, and the only way an agent gets more room is for the person to give it.

Two bounds apply to everything an agent does, and the narrower always wins: its grant bounds what it may ask for, and [the leash](the-leash.md) independently bounds what it may spend.

## The request, event by event

### Asking

An agent presents its token or grant on every call. A caller with no valid one gets a refusal that says so without saying anything about the workspace.

### Answered at once

A scope the grant lacks ends it here. Nothing is spent, nothing is recorded against the person's money, and the agent is told which scope it needed.

### The work begins

The call is attributed to the grant and becomes an invocation on that agent's trail. From here it is [a request](the-request.md) like any other and is judged by the same leash.

### While it runs

The agent's trail accumulates. The person can watch it happen in Connections without being the one who asked.

### Finishing

The invocation is recorded with what it did and what it cost, and stays attributable even if the grant is revoked afterwards.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | The whole subject of this document. A person's own request has no grant and no scope check. | Cannot change. |
| The policy in force | Applies identically whoever asked. An agent gets no more room than the person would. | Applies from the next judgement. |
| Funds available | One balance, shared by every agent and the person. | Running out affects whoever asks next. |
| What is being asked for | Decides which scope is needed. | No effect. |
| The asking agent's grant | Bounds what may be asked. | Revoking mid-run does not retroactively stop a run already accepted. |
| The shared browser | The `browse` scope is what admits an agent to it. | No effect. |
| Appearance and motion | No effect on an agent. | No effect. |

## Cancel and interrupt

| Event | Before the work begins | While it runs |
| --- | --- | --- |
| Stop — the person halts this run | Nothing to stop. | The person can stop a run their agent started. |
| Freeze — the wallet is frozen, mid-run | Every agent is refused from that moment. | Spends are refused; the agent is told why. |
| Denying a waiting approval, or leaving it unanswered | Not applicable. | The agent is told the person refused. It cannot answer its own ticket at any scope. |
| Asking something else while this request is still in flight | No effect. | An agent's run is superseded by a newer run on the same session like any other. |
| Leaving the page, or switching to another conversation, mid-run | No effect — the agent is not in the page. | No effect. The person watching is incidental to the work. |
| Reload; the tab or the app closed | No effect. | No effect. Agent work does not need anyone watching. |
| Network lost; the socket drops | The agent's own call fails; the workspace is untouched. | The task id outlives the socket; the agent asks again by id. |
| The model, a service, or the facilitator errors or rate-limits mid-run | The call fails with a reason. | Recorded on the invocation. |
| The session expires, or the person signs out | An agent's grant is not the person's browser session and is unaffected. | Unaffected. |
| The policy or a cap changes mid-run | Applies to the agent immediately. | Applies from the next judgement. |
| Funds run out mid-run | The agent is refused by balance. | The same. |
| The person takes control of the shared browser mid-run | No effect on the grant. | The agent's browsing continues under the person's ownership of the page. |
| The same account open in a second tab or on a second device | No effect. | Both see the agent's activity. |

## Interactions with other systems

**The leash.** A second, independent bound on every agent. Scopes and caps are not the same mechanism and neither substitutes for the other.

**Money and receipts.** One balance and one ledger for the person and every agent. A receipt says which run spent; the run says which agent asked.

**Approvals.** Always the person's. No scope reaches them.

**Provenance.** An address an agent supplies is `model` provenance unless the person typed it, and is therefore not payable.

**History and persistence.** Agent-sourced turns are part of the same history, marked with their source.

**The shared browser.** The `browse` scope admits an agent to the same browser the person watches.

**Connected agents and grants.** This document is it.

**Notifications.** An agent's request that needs an approval raises the same badge as the person's own.

**Navigation and URL state.** Connections is a secondary destination; an individual agent has its own page.

**Appearance, motion and accessibility.** The connection instruction is copyable with a manual-copy recovery path for when the clipboard is refused.

**Offline and reconnection.** An agent reaches the server directly and does not care whether the person's tab is open.

**Stubs.** A stubbed build still admits agents and still records their invocations; what is stubbed is what their spending settles against.

## Edge cases

- The person's identity comes from Privy, so an identity failure is a sign-in failure and not something the workspace can route around.
- A token secret cannot be recovered. Losing it means making a new one; the old one is revoked, and its history stays.
- A revoked grant's past invocations stay visible in Connections, which is the point of revoking by timestamp.
- `services` is needed by every MCP tool call, so a grant without it is nearly inert whatever else it holds.
- A client's name is stored as it named itself at registration, so two clients can present the same name.
- An agent that has been disconnected mid-run does not have its already-accepted run stopped.

## Open questions and verification

- Whether disconnecting an agent stops work it has in flight, or only prevents new work, is not established from the schemas alone and matters to anyone using disconnect as a panic control.
- How a person recovers when the clipboard is unavailable — the manual-copy path — is described in `docs/evidence/HERMES.md` and has not been checked by hand here.
- Whether a token and an OAuth grant appear in the same list in Connections, or in two, has not been confirmed.
- The consent screen's exact wording per scope has not been read; only the order is established.
- Whether a person can narrow an existing grant's scopes without disconnecting and reconnecting is not established.

Verified against the Froggy tree at commit `5caed50`.
