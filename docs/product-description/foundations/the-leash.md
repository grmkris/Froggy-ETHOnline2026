# The leash

## Summary

The leash is what decides whether money moves. It is the product's pitch — "a browser you can watch, on a leash you set" — and it is the reason Froggy can be handed a wallet at all. Every rule in it is evaluated **outside the model**: a jailbreak can make the model ask for anything, and it cannot make the judgement come back _allow_.

It answers exactly three ways: **allow**, **deny**, or **ask**. Ask is a third outcome rather than a refusal the model can retry around, because a model that can turn "ask a human" into "try again differently" has removed the human by persistence.

The person meets the leash in three places: as the numbers they set in [the policy editor](../workspace/wallet/the-policy-editor.md), as the approval cards that interrupt a run, and as the refusals that appear in the wallet pane. This document owns the rules, the three decisions, the order they are applied in, and the denial codes. What a refusal looks like on each surface belongs to those documents.

## The simple case

The person sets four numbers: the most any one spend may be worth, how much may be spent in a rolling day, the amount above which they want to be asked, and when the whole thing expires. Tapping Allow without changing anything gives two dollars a spend, ten dollars a day, ask above one dollar, and thirty days.

The agent then buys something for eighty cents. It is under every cap and under the ask line, so it goes through and a receipt records which rules were checked and passed. The next thing costs three dollars: over the per-spend cap, so it is refused, and the refusal names the rule and the number rather than saying "denied by policy". Something at a dollar fifty is within the caps but over the ask line, so the run parks and the person is asked.

## How a spend is judged

Every spend arrives as an _intent_: an amount in micro-dollars, a payee with the story of how Froggy learned about it, what the money is for, and a stable key so a retry is not a second payment. The checks run in a fixed order, and the **first** one that refuses wins, so the reason a person is given is the first thing that was wrong rather than the worst.

1. **Where the payee came from.** A well-formed address is not a trusted one.
2. **A bound purchase**, if the intent names one: it must match a permission granted for that exact request and payment offer, and stay under both its own ceiling and the quote it was granted against.
3. **Expiry.** Past it, the mandate allows nothing.
4. **The allowlists** — payee, host, network.
5. **The per-transaction cap.**
6. **The rolling window cap**, computed by adding up what was actually spent inside the window.
7. **The human line** — whether this needs a person, by kind or by amount.

An allow is not silent about why. It carries the ids of every rule that was checked and passed, so an allowance is as auditable as a refusal.

### Provenance: where an address came from

Every payee travels with a record of how it entered the system, and only three of the five kinds can ever be paid:

| Origin | Payable | What it means |
| --- | --- | --- |
| `mandate` | Yes | The person wrote it into the allowlist. |
| `server` | Yes | Froggy minted it this session, from its own oracle. |
| `user` | Yes | The person typed it into the chat this run, verbatim. |
| `model` | **No** | The model produced it. A model that has read a hostile page is not distinguishable from one that has been instructed by one. |
| `page` | **No** | It appeared in page content or a query result. |

This is the check that stops an address suggested by a web page from being paid, and it runs before every cap, so no amount is small enough to get one through. Two details carry the weight: it is enforced in the policy engine rather than in the prompt, because a prompt rule is advice and this is a rule; and deciding that a string counts as `user` is the **server's** job — it checks the person's own messages for the address — never the model's.

A refusal here says where the address came from and what to do about it: type the address yourself, or add it to the mandate, if you meant it.

### The rules

Eight kinds, each carrying its own id so a refusal can name it:

- **Per-transaction cap** — the most a single spend may be worth.
- **Window cap** — the most that may be spent in a rolling window. Rolling rather than calendar, because an agent that empties the allowance at 23:59 and again at 00:01 has obeyed a calendar rule and broken the promise it stood for.
- **Payee allowlist** — only these payees, whatever the model believes.
- **Host allowlist** — only these hosts may be paid for a 402. Matched on **host, never on full URL**.
- **Network allowlist** — only these chains. A spend on an unexpected chain is a spend nobody planned.
- **Expiry** — the instant it all stops being valid, with or without a human.
- **Approval threshold** — at or below, automatic; above, a person is asked. This is the line the whole product is arguing about: autonomy for a cent, a human for fifty dollars.
- **Ask exemption** — written by exactly one thing, a person answering "allow for this session", and scoped to one payee, one ceiling and one expiry so a later reader can see what was pre-approved and until when. The threshold rule stays.

### What the money is for

Before any amount is considered, the _kind_ of spend decides which side of the line it sits on. There is one table, and adding a money-moving path means adding a row to it first:

| Kind | Side | Its own ceiling | Why |
| --- | --- | --- | --- |
| `service_payment` | standing | the person's cap | Buying a service is what the agent is for. |
| `conversion` | standing | the person's cap | Converting to gas happens inside a payment already allowed, never on its own. |
| `earn_deposit` | standing | $25 | Moving idle money into the vault pays nobody and can be undone. |
| `earn_withdraw` | standing | $10 | Taking your own money back out pays nobody. |
| `transfer` | **ask** | the person's cap | Paying a person is your decision, whatever the amount. |
| `trade` | **ask** | the person's cap | A trade is judged by its own rule or by you, never by this table. |

_Standing_ does not mean uncapped: the person's caps still apply, and where a kind carries its own ceiling the **tighter of the two wins**. It means only that no human is asked _because of what this is_. An `ask` kind stops for a person however small the amount.

A kind with no row is refused rather than assumed to be standing. A missing leash must never fail open.

### Two enforcements of one decision

The same four numbers are compiled into two places, from one shape, so they cannot drift apart:

- **The person's Privy policy.** A standing kind becomes an allow rule carrying the person's cap. An ask kind gets **no rule at all**, so Privy's default refusal catches it and no standing signature can ever reach it.
- **Froggy's own mandate.** The same numbers become the per-transaction cap, the window cap, the expiry and the approval threshold, so the engine holds an identical ceiling synchronously.

The failure this prevents is a leash that is tighter on the screen than it is in the signer. A Privy outage cannot widen what the agent may spend, because the mandate is checked first and locally; the rolling daily ceiling in particular is Froggy's to enforce, because Privy cannot group spends by wallet.

### Denial codes

The code is the record; the sentence shown to a person is never the only thing kept. `frozen`, `expired`, `per_tx_cap_exceeded`, `window_cap_exceeded`, `payee_not_allowed`, `host_not_allowed`, `network_not_allowed`, `untrusted_provenance`, `unpriceable`, `pocket_exhausted`, `conversion_failed`, `run_budget_exceeded`, `price_changed`, `approval_denied`, `approval_timeout`, `approval_unavailable`.

Two of these are not the leash refusing at all, and are worth telling apart: `pocket_exhausted` means the account the host pays its own fees from is dry and a top-up fixes it, and `conversion_failed` names who refused — the signer, the chain, or the balance.

## Cancel and interrupt

| Event | Before the spend is judged | After it is allowed |
| --- | --- | --- |
| Stop — the person halts this run | The spend never happens. | Money already moved has moved. Stopping is not a rollback. |
| Freeze — the wallet is frozen, mid-run | Everything from that moment is refused with `frozen`. | No effect on what already settled. |
| Denying a waiting approval, or leaving it unanswered | `approval_denied`, `approval_timeout`, or `approval_unavailable` — three different codes, kept apart because they are different facts. | Not applicable. |
| Asking something else while this request is still in flight | The new run supersedes the old; a spend the old run had reached is the open question in [the request](the-request.md). | No effect. |
| Leaving the page, or switching to another conversation, mid-run | No effect. The run keeps going and keeps being judged. | No effect. |
| Reload; the tab or the app closed | No effect. | No effect. |
| Network lost; the socket drops | No effect on judgement; the person may not see the refusal until they return. | A payment sent and never confirmed is `uncertain`, not failed. |
| The model, a service, or the facilitator errors or rate-limits mid-run | The spend is not judged. | Settlement may be incomplete; the receipt says what it knows. |
| The session expires, or the person signs out | The mandate's expiry is separate from the session's and outlives it. | No effect. |
| The policy or a cap changes mid-run | Applies to the next judgement. | A spend already allowed is never revisited. |
| Funds run out mid-run | Refused by balance rather than by rule: `pocket_exhausted` or `conversion_failed`. | No effect. |
| The person takes control of the shared browser mid-run | No effect. Ownership of the page is not a spending question. | No effect. |
| The same account open in a second tab or on a second device | One leash, one set of counts. Both tabs see the same refusal. | Both see the same receipt. |

## Interactions with other systems

**The leash.** This document is it.

**Money and receipts.** Every decision lands on a receipt: the rules satisfied, or the code and the rule that refused. See [money](money.md).

**Approvals.** _Ask_ is where the leash hands over. The four answers and the three ways an approval ends without one are in [approvals](../workspace/conversation/approvals.md).

**Provenance.** Two different meanings share the word and must not be confused: the payee's _origin_ decides whether it may be paid at all, and the receipt's _evidence_ records what the agent knew when it decided. Both are on the receipt.

**History and persistence.** Rules and their edits are durable. The window cap's arithmetic is done over actual recorded spends rather than a counter, so it survives a restart correctly.

**The shared browser.** The browser is the reason provenance exists. An address read off a page is the canonical thing the leash refuses.

**Connected agents and grants.** A grant bounds what an agent may ask for; the leash bounds what may be spent. Both apply and the narrower wins.

**Notifications.** A refusal appears in the wallet pane. An ask raises a badge and, where paired, a Telegram message.

**Navigation and URL state.** No part of the leash lives in the URL.

**Appearance, motion and accessibility.** A refusal is announced, not merely rendered. The ordering of the approval buttons is deliberate: the primary yes sits last, furthest from a stray click.

**Offline and reconnection.** Judgement happens on the server, so it is unaffected by the tab. A person offline simply does not see the refusal yet.

**Stubs.** The leash itself is never stubbed — it is local arithmetic over local rules. What is stubbed is the settlement underneath it, and a receipt from a stubbed settlement says so.

## Edge cases

- The **first** refusal wins, so a spend that breaks three rules is explained by one. A person fixing that reason may immediately meet the next.
- The window cap adds up what was actually spent in the window, so it moves continuously: a spend refused now may be allowed twenty minutes later with nothing changed.
- A person typing an address into the chat makes it payable by provenance, but not by the caps — "a person asking to pay `0xdead…` gets refused by a rule, not by a rule about where the address came from".
- `service_payment` is standing while `transfer` asks, so the same amount to the same address is judged differently depending on what it is called.
- The default expiry is thirty days, which is Privy's own ceiling rather than a product choice.
- Answering "allow for this session" leaves a durable rule behind. It is the only rule a person writes without visiting the editor, and the only one written mid-run.
- A receipt written before action kinds existed can still be read; an intent that arrives with no kind is treated as needing a person rather than as the most permissive answer.

## Open questions and verification

- The relationship between the mandate's `approval_threshold` rules and the newer four-number allowance is two regimes in one function: with an allowance the kind is asked first and the numeric threshold is the fallback; without one, the threshold rules decide alone. Which regime a live workspace is under has not been confirmed by hand.
- Whether the person's editor can produce a mandate with no expiry rule at all, and what the engine does then, is not established.
- `unpriceable` is the one denial that carries no rule id. What a person is shown for it has not been checked.
- The claim that a Privy outage cannot widen the leash rests on the mandate being checked first and locally. It has not been tested by taking Privy away.
- Whether freezing writes a rule or is a separate state is not established here; the code carries `frozen` as a denial code and a note that a kill-switch rule was removed.

Verified against the Froggy tree at commit `5caed50`.
