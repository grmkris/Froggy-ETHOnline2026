---
name: froggy-leash
description: Change spending, mandates, policy rules, receipts, or approvals while keeping every control outside the model and every refusal traceable to a rule.
---

# The leash

The product claim is that a jailbroken prompt cannot move money. That is only true while every control is data the model cannot reach.

**Never add a tool that changes what the agent may spend.** No `raise_limit`, no `approve`, no `unfreeze`. Those arrive on the app socket from a human. A prompt instruction not to call such a tool is a request; its absence is a control.

`authorize` in `packages/wallet/src/policy.ts` is pure — mandate in, history in, decision out — and it must stay that way. No clock of its own, no I/O, no model. Order matters and is part of the contract: freeze first, then provenance, then allowlists and caps, and the human-approval threshold **last**, so `ask` is only ever offered for a spend that would otherwise have been allowed.

Every refusal names the rule that produced it. "Denied by policy" is not an answer a person can act on.

A payee carries where it came from. `mandate` and `server` are payable; `model` and `page` are not, however well-formed the address looks. If you add a path that produces a payee, decide its provenance deliberately.

The just-in-time conversion of USDC to HBAR is a spend, not a tool. It happens only inside `spend()`, on the way to a Hedera payment the mandate has to allow anyway, as a nested spend keyed `convert:<parent key>` with `server` provenance to the treasury — judged, reserved and receipted like any other, and joined rather than repeated on a retry. A `wallet_topup` or `convert` tool would let a prompt move USDC with no payment behind it; do not add one back. `notify` and `schedule` may be tools because neither changes what the agent may spend.

The conversion's USDC leg is two signatures under two leashes (`docs/decisions/0026`): the person authorizes the amount and the treasury as recipient under their policy, and the treasury wallet settles it under its own, paying the gas. The relayer rule pins `transferWithAuthorization.to` to the treasury and value to zero; widening either lets the relayer move money on its own account. Keep the relayer able to pay fees, never to choose recipients.

Reserve on the ledger **before** the outbound call, with an idempotency key. Tool calls get retried — by the SDK, by a reconnect, by a model that never saw the result — and a ledger written afterwards cannot see an in-flight spend.

Write a receipt for a refusal as well as a payment. "It did not spend" and "it was told not to" are different facts, and only one of them is reassuring.

A stub must be visibly a stub in the data, not only in the UI. A screenshot of a faked run must never pass for a settled one.

Token research reads are tolerant: every source says `observed`, `not_indexed`, `unavailable`, or `not_applicable`, and GoPlus never authorizes a trade. Research predicates on a trading rule are the opposite — fail closed, ≤30 s fresh, and only own-RPC bases (template, venue-event cohort, reconstructed holders) may refuse signing. They gate entries only; an automatic exit never waits on a research read. Each venue may only carry the predicates its own backend can read: Pons all three, Uniswap the holder cap alone. Buying research does not grant trading authority; a human attaches the policy to a rule.
