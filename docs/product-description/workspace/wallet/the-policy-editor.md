# The policy editor

## Summary

The policy editor is where a person changes their own leash. It is four numbers — the most any one payment may be worth, the most in a rolling day, the amount above which they want to be asked, and how many days the whole grant lasts — with a **Change these** button in front of them and a round trip to Privy behind them. Nothing else in the workspace lets a person widen or tighten what their agent may spend.

The four numbers are one object, not four settings. The same shape is compiled into the person's own Privy policy _and_ into Froggy's own mandate, so what the screen promises and what the signer enforces cannot be written down twice and drift; [the leash](../../foundations/the-leash.md) owns that argument and the rules the numbers become. This document is about the act of changing them: what the form accepts, what happens on save, and what a run already in flight sees.

Despite its place in this repository's structure, the editor is not on the Wallet. It sits on **Settings**, inside the **Connection** card, under the sentence naming the signer and the policy id.

## The simple case

A person opens Settings and reads one sentence: "Your agent may pay up to $2.00 at a time and $10.00 a day, and asks you above $1.00. This permission runs out in 29 days." Beneath it are two buttons, **Change these** and **Extend to 30 days**.

Pressing **Change these** replaces the sentence with four labelled fields, filled in with the numbers currently in force: _Most in one payment_, _Most in a day_, _Ask me above_, and _Expires after_, the last in days rather than a date. Each carries one line saying what it does — "Anything above this is refused outright, not asked about", "Rolling, not midnight to midnight, so it cannot be emptied twice in two minutes", "Below this the agent pays on its own. Paying a person always asks, whatever this says", "Days, up to thirty."

The person changes the daily figure from 10 to 25 and presses **Save these rules**. The button becomes "Asking Privy…". Privy asks the person, in its own prompt, to approve the change with their own key. They accept, the form closes, and one line appears: "Saved. Your agent is held to these from now on."

**Extend to 30 days** does the same round trip with the same numbers and a new expiry, without opening the form.

## The request, event by event

```mermaid
stateDiagram-v2
    [*] --> resting
    resting --> editing : Change these
    resting --> asking : Extend to 30 days
    editing --> editing : a number is wrong (Save is disabled)
    editing --> resting : Never mind
    editing --> asking : Save these rules
    asking --> signing : Froggy prepares the exact request
    signing --> asking : the person's key signs it
    asking --> saved : Privy accepts; "Saved."
    asking --> refused : a named refusal, the form stays open
    refused --> editing : change the numbers and try again
```

### Asking

The editor appears only once the agent can actually pay: the signer must be attached under the person's _own_ policy, and there must be an allowance to show. Somebody still on the shared policy is offered the move instead, above it, with the same form behind an **Adjust** link — one card does not carry two calls to action, and the move has to happen first anyway.

The days field is filled from the expiry as it stands, rounded to whole days, so a grant with 29 days left opens on "29" rather than on a date nobody can edit.

### Answered at once

Four numbers can be wrong in six ways, and the form says which, one at a time, under the fields:

- "Every amount has to be more than zero." — a blank, a word, a zero, or a negative in any of the three amounts.
- "A grant has to last at least a day."
- "Privy allows at most thirty days; ask again when it runs out." — thirty is Privy's ceiling, not a product choice.
- "The daily limit is below the single-spend limit, so no spend could ever happen."
- "Asking above the single-spend limit means you would never be asked."

The last two are the ones worth having. Each is accepted by every field on its own and means the opposite of what the person intended: the first makes one payment impossible, the second makes the approval card unreachable. **Save these rules** stays disabled while any problem stands, and no message appears until the person has touched a field, so an untouched form is never scolded.

**Never mind** closes the form and changes nothing.

### The work begins

Pressing **Save these rules** starts a three-legged round trip, and none of the three parties holds everything it needs. Froggy's server builds the exact request Privy will receive — it has the configuration the rules are generated from — and hands it back unaltered. The browser signs it with the person's own key, which exists nowhere else, and Privy usually prompts them to approve. The server then sends that same request with the signature attached and the app secret Privy also demands, which must never reach a browser.

> Technical note: once a Privy policy carries an owner, the app secret alone is refused on every edit. Froggy asks Privy which regime this particular policy is under rather than inferring it from configuration, because a policy minted before per-person policies existed is owned by the app whatever the setting says today. When Privy needs no signature, none is sent: a signature from somebody who is not the owner would be a worse request, not a better one.

The signed request expires two minutes after it is prepared. Nothing has changed at this point, and abandoning the tab here leaves the old numbers in force.

### While it runs

The button reads "Asking Privy…" and both it and **Change these** are disabled. Everything else on the page stays live. Nothing else is blocked: a run in another tab keeps going, is still judged, and is still judged against the numbers it started under.

### Finishing

Success closes the form and leaves one line: "Saved. Your agent is held to these from now on."

A refusal keeps the form open with the numbers still in it and names what happened, never a shrug:

- "Froggy could not be reached." — the network dropped on either leg.
- "Sign in again before changing these rules." — there is no key in this tab to sign with.
- "Privy did not sign the change. If it asked you to approve it, try again and accept." — by far the likeliest, because a dismissed prompt looks exactly like a failure.
- "Privy would not accept the change: …" — Privy's own words, up to three hundred characters of them.
- "You have no policy of your own yet. Grant the agent first." and "This deployment does not mint policies of your own." — the two states where there is nothing to edit.

The order of the two writes is deliberate: Privy is changed first, and only once it has taken the change is the record of what the person chose written down. A half-landed change therefore leaves the agent held to the tighter of the two, which is the safe direction to fail in.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | Only the person, in a signed-in browser, with their own key. There is no MCP tool, no Telegram command and no schedule that changes an allowance — a route the model could reach would be the one hole this design exists to keep shut. Whose policy is edited is loaded from the store against the authenticated person and never read from the request. | No effect. |
| The policy in force | The current numbers are what the form opens on. Nothing in the leash gates editing it: a person at their daily cap can still change their daily cap. | No effect. The edit is not itself a spend and is never judged. |
| Funds available | No effect. A cap is a promise about spending, not a claim about the balance, and an empty wallet edits its caps the same way a full one does. | No effect. |
| What is being asked for | The four numbers apply to every kind of spend. Kinds that carry their own ceiling keep it, and the tighter of the two wins; kinds on the ask side of the authority table ask however small the amount, whatever _Ask me above_ says. The form says so under that field. | No effect. |
| The asking agent's grant | No scope reaches this. A connected agent can be refused by these numbers and can never move them. | No effect. |
| The shared browser | No interaction. Privy's prompt is its own, not a page in [the shared browser](../../foundations/the-shared-browser.md). | No effect. |
| Appearance and motion | Rendering only: the card, the fields and the error take the saved theme. | A theme change mid-edit restyles the form in place and keeps what is typed. |

## Cancel and interrupt

| Event | Before Privy accepts | After Privy accepts |
| --- | --- | --- |
| Stop — the person halts this run | No effect. Editing the policy is not a run and has no stop control. | No effect. |
| Freeze — the wallet is frozen, mid-run | No effect. The numbers can be edited while spending is halted, and editing them does not lift the halt. | No effect. |
| Denying a waiting approval, or leaving it unanswered | No effect on the edit. The two are answered in different places and neither waits for the other. | No effect. |
| Asking something else while this request is still in flight | No effect. A new turn starts and is judged against whatever is in force at that instant. | No effect. |
| Leaving the page, or switching to another conversation, mid-run | The form unmounts and the change is abandoned. Nothing is sent and the old numbers stand. | The change is already at Privy; the outcome sentence is lost. |
| Reload; the tab or the app closed | The same: abandoned, nothing sent. | The change stands at Privy. The sentence confirming it does not survive. |
| Network lost; the socket drops | "Froggy could not be reached." and the form stays open with the numbers in it. | The confirmation may never arrive, so a change that landed can look like one that failed. Reopening the form is the only way to see what is in force. |
| The model, a service, or the facilitator errors or rate-limits mid-run | No effect. None of them is on this path. | No effect. |
| The session expires, or the person signs out | "Sign in again before changing these rules." Nothing is sent. | The change stands; the mandate's expiry is its own and outlives the session. |
| The policy or a cap changes mid-run — by the person, or by another agent | The last write wins; there is no conflict detection and no warning that the numbers were changed underneath this form. | The same. |
| Funds run out mid-run | No effect. | No effect. |
| The person takes control of the shared browser mid-run | No effect. | No effect. |
| The same account open in a second tab or on a second device | Both tabs open the form on whatever they were last told, which may already be stale. | The second tab keeps showing the old sentence until its wallet summary is refreshed. |

## Interactions with other systems

**The leash.** This is the one surface that writes it. The four numbers become the per-transaction cap, the rolling window cap, the expiry and the approval threshold; the allowlists are a different question and the editor does not touch them. See [the leash](../../foundations/the-leash.md).

**Money and receipts.** Editing is not a spend: no receipt, no ledger row, no cost. What the numbers do to later spends is in [money](../../foundations/money.md).

**Approvals.** _Ask me above_ is the line that produces them. Raising it above the per-payment cap makes them unreachable, which is why the form refuses that combination outright. An approval already on screen is judged again when it is answered, so a mandate edited while the card was open still refuses. See [approvals](../conversation/approvals.md).

**Provenance.** Untouched. Where an address came from is not a number a person can set here, and no allowance widens it.

**History and persistence.** The chosen numbers are stored against the person and survive a restart. The nudge that warns an expiry is coming is remembered only in memory, so a redeploy can send a second warning; a duplicate message was judged a smaller harm than a column that can go stale.

**The shared browser.** No interaction.

**Connected agents and grants.** A grant bounds what an agent may ask for and this bounds what may be spent. Both apply and the narrower wins. Tightening these numbers reaches every connected agent at once without touching any grant.

**Notifications.** Three days before the expiry, and at most once a day, the person is told their agent is about to go quiet — "runs out in 3 days", "runs out today", or "has run out. It can pay nothing until you extend it in Settings." The expiry needs nothing to fire; this is only the courtesy of saying so beforehand.

**Navigation and URL state.** No URL of its own. The editor is a state of the Connection card, cannot be linked to, and is closed again by a reload.

**Appearance, motion and accessibility.** Every field is labelled and described; the problem is a field error tied to the form rather than an alert; the outcome is an output element, so it is read without stealing focus. Both buttons clear the 44px target.

**Offline and reconnection.** The form opens offline from the wallet summary already loaded, and both legs then fail with "Froggy could not be reached."

**Stubs.** A stubbed identity has no Privy key and no policy of its own, so the editor does not appear at all: what is offered instead is the grant. **No allowance change can be demonstrated on a stubbed build** — see [stubs](../../cross-cutting/stubs.md).

## Edge cases

- **Extend to 30 days** sets thirty days from today rather than adding thirty to what is left, because Privy's ceiling is thirty and adding would ask for something it refuses. The label says "to" for that reason.
- The days field rounds. A grant with 29 days and 20 hours left opens on "30", and saving it unchanged shortens the grant by twenty hours.
- The form is dollars in and dollars out; the leash compares micro-dollars. Nothing rounds in between, so `2.50` is exactly 2,500,000.
- There is no confirmation step. Widening the per-payment cap tenfold is one press of a button whose label never changes.
- The same form is mounted twice, in the grant sheet behind **Adjust** and here behind **Change these**, because they are the same act. In the grant sheet the numbers are only a proposal: they are applied _after_ the grant lands, and a grant that succeeds while the numbers fail says so — "Granted, but your numbers were not saved: …".
- A person on the shared policy sees no editor. The sentence they get instead warns that Privy allows a signer only one set of rules, so the old ones are removed before theirs are added and the agent can pay nothing for the moment in between.
- The sentence above the buttons is not refreshed by a successful save. It still reads the old numbers until the wallet summary is republished — see Open questions.

## Open questions and verification

- **The saved numbers do not appear to reach the running session, and this is the most serious thing found while writing this document.** `PersonPolicies.adjust` writes the record to the store; nothing then tells the live session about it. `WorkspaceSession.applyAllowance`, the function that rebuilds the mandate's caps from an allowance, has **no caller outside its own tests** at this commit. On the evidence in the tree, an edit reaches Privy immediately and reaches Froggy's own mandate only when a session is next hydrated. Worth treating as a defect: the two-enforcement promise is what makes the editor trustworthy.
- **`authorize` is never given the allowance.** The judgement built in `session.judge` passes the mandate, the ledger and the pocket, but not the person's four numbers, so the kind-based half of the human line — the one that makes `transfer` and `trade` ask however small they are — is inert at this commit, as are the per-kind ceilings of $25 and $10. The table itself is unambiguous; the wiring is what is missing. Filed as suspected, not confirmed by hand.
- The card's own sentence is rendered from the wallet summary, which is republished after a receipt and after a grant refresh but not after a policy change. A person who saves and then reads the sentence above appears to be shown the numbers they just replaced.
- `allowance-form.tsx` says in its own comment that it "sends on the app socket rather than over HTTP, like an approval and a mandate edit". It posts to two HTTP routes. The socket does carry a `mandate.update` message, but nothing in the web app sends one at this commit. The comment is stale; which of the two was intended is not established.
- `PersonPolicies.adjust` documents the mandate as being written "first and synchronously" so a failed Privy edit leaves the tighter leash in force. The commit route does the opposite, writing the record only after Privy accepts, and explains that order in its own comment. Both orders fail safe, but the two comments contradict each other.
- Whether Privy prompts the person on every edit or remembers a recent approval has not been observed by hand; the interface assumes a prompt.
- No e2e spec covers this form. `allowance-form.test.ts` covers the six validation messages as pure functions, and nothing exercises prepare, sign or commit, because none of them can run without a real Privy sign-in.
- Whether a person can reach a state with no expiry rule at all, and what the engine does then, is unresolved in [the leash](../../foundations/the-leash.md) and is not answered here.

Verified against the Froggy tree at commit `5caed50`.
