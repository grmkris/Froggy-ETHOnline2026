# Money

## Summary

Froggy shows one dollar figure and spends in fractions of a cent. This document owns the units, what a price is, what a receipt records, and the life of a spend from the moment it is reserved to the moment it settles or does not. Everything else links here rather than restating a number.

The person meets money as a balance on the Wallet, as costs attached to what the agent did, and as receipts. Underneath, every cap and every comparison is done in one unit, because a rule that compares a Hedera transfer against a Base transfer any other way is not a rule anybody can trust.

## The two units

**What a chain moves** is an integer count of an asset's smallest unit, carried as a decimal string — never a float, because a float would round a payment, and JSON has no integers wide enough.

**What a rule is written in** is micro-dollars: USD millionths, where one dollar is 1,000,000. Micro-dollars rather than cents because x402 prices are routinely fractions of a cent, and a cap that cannot express the price it is capping is not a cap.

A figure is shown to two decimal places, or to four when it needs them. A price of a third of a cent is displayed as such rather than rounded to zero.

Chains are named as CAIP-2 identifiers rather than friendly names, because that is what an x402 challenge carries: a mandate that spells Base Sepolia one way while every challenge spells it `eip155:84532` is a mandate that can never match.

## What a price is

A **quote** is how many micro-dollars one whole unit of an asset is worth, when that was true, and where it came from. Converting an amount into the rule's unit **rounds up**: a cap is a promise not to exceed a number, so the half-micro of ambiguity belongs on the side that spends less.

For a stablecoin the quote is one dollar per unit and says so — the source is recorded as par rather than left to look like a market price nobody can check.

Prices are **quoted, not metered.** The quote is the price, it is fixed at the moment the decision was made, and it lands on the receipt beside the rate used. Nothing is billed back afterwards for having taken longer or used more.

## The balance, and the other balance

The **balance** is the one figure the workspace shows: what may be spent. It is not what is held on any one chain, and it is not the only account involved.

The **pocket** is the account the host pays its own fees from. It is separate from the person's balance and it can run dry on its own, which is a refusal a top-up fixes rather than a refusal by [the leash](the-leash.md). The two failure sentences are kept apart for that reason: `pocket_exhausted` is the pocket, and `conversion_failed` names who refused when turning the person's USDC into what a payment needed — the signer, the chain, or the balance itself.

**Conversion** is never something a person asks for on its own. It exists only nested inside a payment that was already allowed, which is why it sits on the standing side of the authority table without that being a way to move money out.

## The life of a spend

A spend is written to the ledger **before** it is attempted, not after, and its row moves through states that are deliberately distinct:

| State | What it means | Counts against the cap? |
| --- | --- | --- |
| `reserved` | Judged and written down; nothing sent yet. | Yes |
| `settled` | It landed. | Yes |
| `refused` | The leash said no. | No money moved |
| `failed` | Something was sent outbound and no good answer came back. Money **may** have moved. | Yes, until somebody says otherwise |
| `abandoned` | Nothing was ever sent — the wallet froze, or the run was stopped between the reservation and the call. | **No** |
| `uncertain` | It was sent and neither the seller nor the network has said whether it landed. | Yes, and it is never refunded until a mirror node says the money did not move |

The distinction between `failed` and `abandoned` is the one that matters most, and it is a distinction about honesty rather than bookkeeping: consuming a person's allowance for a spend that never left would be a cap on decisions rather than a cap on money.

`uncertain` is its own fact for the same reason. "We do not know whether that money moved" is a different thing to tell a person than "it did not", and the product refuses to collapse them.

## What a receipt records

A transaction hash answers "did money move". Nobody nervous about an autonomous agent is asking that. They are asking which rule let it through, what it was acting on, and what it thought it was buying — so a receipt cannot be constructed without all three:

- **The decision** — allow with the ids of the rules it satisfied, or deny with its code and the rule that refused.
- **The intent** — the amount, the payee and how Froggy learned about it, what the money was for, and the idempotency key.
- **The quote** used, and when.
- **The evidence**, where there was any: the query, the source, a digest of the result rather than the result itself, and which indexes contributed — each with its deployment, block number, and whether it was fresh, stale or unavailable. A stale index contributed nothing. A source URL alone is a claim about a gateway, not about the data.
- **The approval**, when a person was asked, and what their answer led to.
- **The settlement**, when there was one: the network, and the Hedera consensus sequence number when one was posted.
- **The failure**, when the policy allowed it and it still did not go through — the signer's refusal in its own words, the seller's error, a network fault.
- **`stubbed`**, as data rather than decoration.
- **The tool call that spent**, when a tool did, so the conversation can file the receipt under that call's card. A receipt from a scheduled job or a replay has none and appears only in the wallet.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | Does not change the units or the arithmetic. A receipt records which agent's run produced it. | No effect. |
| The policy in force | Decides whether a spend happens; not what it costs. | The next judgement uses the new numbers. |
| Funds available | A balance too low produces a refusal by balance rather than by rule. | Running dry mid-run refuses that spend with a code naming what was short. |
| What is being asked for | Decides the action kind, which decides the ceiling and the side of the human line. | No effect; the kind is fixed when the intent is built. |
| The asking agent's grant | Recorded on the trail, not in the arithmetic. | No effect. |
| The shared browser | Browsing is priced per run against a ceiling of its own. | No effect. |
| Appearance and motion | Figures use tabular numerals and morph between values rather than jumping. | Rendering only. |

## Cancel and interrupt

| Event | Before the spend is sent | After it is sent |
| --- | --- | --- |
| Stop — the person halts this run | The reserved row becomes `abandoned` and does not consume allowance. | Nothing is undone. The row settles or becomes `uncertain` on its own. |
| Freeze — the wallet is frozen, mid-run | The same: `abandoned`, no allowance consumed. | No effect on money already sent. |
| Denying a waiting approval, or leaving it unanswered | Recorded as a refusal with the code that matches how it ended. | Not applicable. |
| Asking something else while this request is still in flight | A reservation the superseded run had not sent becomes `abandoned`. | The payment stands and its receipt belongs to the superseded run. |
| Leaving the page, or switching to another conversation, mid-run | No effect; the server is doing the spending. | No effect. |
| Reload; the tab or the app closed | No effect. | No effect. |
| Network lost; the socket drops | No effect on the spend. | May end as `uncertain`. |
| The model, a service, or the facilitator errors or rate-limits mid-run | No spend is attempted. | `failed` if something went out, `uncertain` if nothing came back. |
| The session expires, or the person signs out | No effect; the run is the server's. | No effect. |
| The policy or a cap changes mid-run | Applies to the next judgement. | Never applied retroactively. |
| Funds run out mid-run | `pocket_exhausted` or `conversion_failed`. | No effect. |
| The person takes control of the shared browser mid-run | No effect. | No effect. |
| The same account open in a second tab or on a second device | One ledger; both see the same rows. | Both see the same receipt. |

## Interactions with other systems

**The leash.** Every number here is what the leash compares. The rounding rule and the unit exist so that comparison is honest.

**Money and receipts.** This document is it.

**Approvals.** An approval's answer lands on the receipt, because a receipt that says "allowed" without saying "because you said so at 14:02" has lost the fact that made the spend legitimate.

**Provenance.** Evidence is what makes a spend checkable by someone who was not there.

**History and persistence.** The ledger is durable and written before the attempt, which is what makes the `abandoned` state possible at all. Status is stored as text and parsed on the way out, so a row edited by hand fails loudly rather than flowing through the policy engine as something nothing handles.

**The shared browser.** Browsing costs money and is quoted like anything else.

**Connected agents and grants.** A receipt carries which run spent; the run carries which agent asked.

**Notifications.** Spending raises no notification on its own. Approvals do.

**Navigation and URL state.** A receipt can be linked to through the activity record parameter.

**Appearance, motion and accessibility.** Figures are tabular and morph rather than jump, so a changing balance does not move the page.

**Offline and reconnection.** The ledger is the server's. A person offline sees a stale balance, not a wrong one.

**Stubs.** A stubbed receipt carries `stubbed: true` in the data so a screenshot cannot be presented as a settled payment. **This is the rule the whole design exists to protect**; see [stubs](../cross-cutting/stubs.md).

## Edge cases

- Rounding up means a spend of exactly a cap can be refused where a truncating conversion would have allowed it. That is the intended direction.
- A refused spend still writes a row. The wallet's history of refusals is as complete as its history of payments.
- `uncertain` is never automatically refunded; a mirror node saying the money did not move is what releases it.
- A receipt with no settlement and no failure is a decision that was never carried out — the two absences mean different things and both are legal.
- A receipt with no tool call is not an error: scheduled jobs and replays produce them.
- The pocket running dry looks to the person like a refusal, but no rule refused it and no policy change fixes it.

## Open questions and verification

- Where the balance figure is computed and whether it includes reserved-but-unsettled rows has not been established. It changes what a person sees mid-run.
- Whether a `failed` row is ever reconciled to `settled` or `abandoned` afterwards, and by what, is not established. It matters because a failed row consumes allowance until somebody says otherwise.
- The interface's claim that a direct transfer shows up "about a minute" after it confirms has not been timed.
- Whether refused rows appear in the same list as settled ones, or in a separate view, has not been checked by hand.
- The four-decimal display threshold was read from the formatter and not confirmed in the running product.

Verified against the Froggy tree at commit `5caed50`.
