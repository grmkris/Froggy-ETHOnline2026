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

Reserve on the ledger **before** the outbound call, with an idempotency key. Tool calls get retried — by the SDK, by a reconnect, by a model that never saw the result — and a ledger written afterwards cannot see an in-flight spend.

Write a receipt for a refusal as well as a payment. "It did not spend" and "it was told not to" are different facts, and only one of them is reassuring.

A stub must be visibly a stub in the data, not only in the UI. A screenshot of a faked run must never pass for a settled one.
