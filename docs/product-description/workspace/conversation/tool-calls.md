# Tool calls

## Summary

A tool call is the agent doing something rather than saying something, and it appears in the conversation as a card: a sentence and an icon, a status word, and one line saying what it came to. The raw input and output are one click away and **never hidden**, because "what exactly did it send" is the question this product exists to answer.

## The simple case

The agent says what it is about to do, and a card appears. While the call runs, its sentence shimmers and the status word says it is working. When it finishes, the sentence settles, the status word changes, and a summary line says what it came to.

The card is closed. The story is the sentence and the summary; the JSON is there for anyone who wants to check, behind a disclosure that is always available.

If the call spent money, its receipt is filed under that call's card.

## Where a call is in its life

Six phases, and one place decides which — so the card's tone, its status word, and whether its sentence shimmers cannot drift apart:

| Phase     | What it means                         |
| --------- | ------------------------------------- |
| `running` | Still working. The sentence shimmers. |
| `waiting` | Waiting for the person.               |
| `done`    | Finished.                             |
| `failed`  | It went wrong.                        |
| `refused` | The leash refused it.                 |
| `denied`  | A person refused it.                  |

`refused` and `denied` are separate for the reason everything in this product is separate: a rule saying no and a person saying no are different facts.

> Technical note: **"Waiting for you" is inferred rather than reported.** Froggy's money tools park the approval inside the call itself, so the model's SDK never moves them into an approval state — a tool waiting on a person looks exactly like a tool that is still working. The interface infers it: a money tool still running while an approval ticket is open is the one that is waiting.

## The request, event by event

### Asking

The model chooses a tool and the card appears with its sentence.

### Answered at once

A call with bad arguments fails without spending. A validation error is not a payment refusal, and the agent is instructed to tell them apart: correct the arguments and keep the same idempotency key, rather than treating it as a wallet problem.

### The work begins

The call runs. For a money tool this is where the intent is built, judged and possibly parked.

### While it runs

The sentence shimmers, the status word says so, and the summary line is not there yet. The raw input can already be opened.

### Finishing

The status word settles and the summary line appears, read from the tool's own answer rather than composed by the interface. Receipts are filed under the card.

A ticket is not a result: a paid service returns pending work, and the agent must retrieve it before reporting findings, rather than treating the ticket as an answer.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | The same cards render whoever asked. | No effect. |
| The policy in force | Decides whether a money tool ends `refused`. | Applies to the next call. |
| Funds available | Decides whether a money tool can complete. | A shortfall ends the call refused with a code naming what was short. |
| What is being asked for | Decides which tools are offered at all. A paid browse gets a restricted set and a smaller output ceiling. | The set does not change mid-run. |
| The asking agent's grant | Bounds which tools an agent may reach. | No effect. |
| The shared browser | Browser tools are only callable inside a paid task; outside one the agent is told to call the task tool with the whole goal instead. | No effect. |
| Appearance and motion | The shimmer is the running indicator. Reduced motion removes it. | Rendering only. |

## Cancel and interrupt

| Event | Before the call starts | While it runs |
| --- | --- | --- |
| Stop — the person halts this run | No card. | The card is left as it was, mid-flight, showing what it had reached. |
| Freeze — the wallet is frozen, mid-run | A money tool will end `refused`. | The call ends refused; the card says so. |
| Denying a waiting approval, or leaving it unanswered | Not applicable. | The card moves to `denied`. |
| Asking something else while this request is still in flight | Held by the composer. | Held by the composer. |
| Leaving the page, or switching to another conversation, mid-run | The call runs anyway. | The call runs anyway; the card is there on return. |
| Reload; the tab or the app closed | The call runs anyway. | The same. |
| Network lost; the socket drops | The card does not appear until reconnection. | The card stops updating; the call continues. |
| The model, a service, or the facilitator errors or rate-limits mid-run | No card. | `failed`, with the reason. |
| The session expires, or the person signs out | No card. | The call continues; the person stops seeing it. |
| The policy or a cap changes mid-run | Applies to this call. | Not applied to a call already judged. |
| Funds run out mid-run | `refused`. | `refused`, naming what was short. |
| The person takes control of the shared browser mid-run | No effect. | A browser tool may find the page changed under it and is told to retake a stale snapshot rather than act on it. |
| The same account open in a second tab or on a second device | Both see the card. | Both see it update. |

## Interactions with other systems

**The leash.** Every money tool's call is judged. A refusal is a phase of the card, not an error banner.

**Money and receipts.** A receipt carries the id of the call that spent, which is how the conversation knows where to file it. A receipt from a schedule or a replay has no call and appears only in the Wallet.

**Approvals.** A parked money tool looks like a running one and is inferred to be waiting.

**Provenance.** The raw input is where a person can see exactly which address was about to be paid, which is what makes the disclosure worth having.

**History and persistence.** Cards are part of the turn and are read back with it.

**The shared browser.** Low-level browser tools are gated behind a paid task by instruction.

**Connected agents and grants.** An agent's calls appear as invocations on its trail as well as cards in the turn.

**Notifications.** The `notify` tool is itself a tool call.

**Navigation and URL state.** Disclosure state is not in the URL.

**Appearance, motion and accessibility.** Every card is closed by default and openable; nothing is hidden behind a mode or a setting.

**Offline and reconnection.** Cards catch up on reconnection with the rest of the turn.

**Stubs.** A stubbed tool produces a real card. Only its receipt says it was a stub, so **the card alone cannot tell you whether anything really happened**.

## Edge cases

- Every tool output is capped. An uncapped page dump would reach the stream, every later prompt, and the replay buffer.
- A tool that is waiting on a person is indistinguishable from one that is working, except by the presence of a ticket — so a waiting card with no visible ticket, on a narrow screen or after scrolling, is ambiguous.
- The agent is instructed never to claim a search ran without its result, which means a card claiming a result is a stronger signal than usual — and that instruction is advice to a model, not a rule the engine enforces.
- Graph queries spend treasury funds and are explicitly not free, though nothing on the card distinguishes a paid query from a free one except its receipt.
- A paid browse restricts the tool set to six tools and takes no retries.

## Open questions and verification

- The status words themselves were not read; only the six phases behind them. The exact word per phase should be checked.
- Whether a refused card is visually distinct from a denied one, beyond the word, has not been checked.
- Where the summary line comes from for a tool whose answer has no obvious one-line form is not established.
- Whether the disclosure shows the output for a failed call, or only the input, has not been checked.
- The instruction-level rules quoted here — retrieve a ticket before reporting, keep the idempotency key on a validation error — are prompt text, not enforced behavior, and a document reader should not treat them as guarantees.

Verified against the Froggy tree at commit `5caed50`.
