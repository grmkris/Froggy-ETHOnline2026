# 0019 — A Privy policy per person, owned by the person

Status: implemented and proven on production, 10 September 2026. The spike this document was written to survive either way has passed.

Supersedes nothing. It changes what `docs/privy-agent-policy.json` is for: that file stays as the app-wide policy a deployment falls back to, and stops being the policy every person's agent is held to.

## The problem, in the owner's words

Until now one policy governed everybody. Every person's embedded wallet carried our server's key as an additional signer with `override_policy_ids` pointing at `froggy-agent-v1`, whose caps, payees and expiry we wrote. On production the mandate's own caps are off (`SPENDING_LIMITS`), so on the EVM leg that shared policy was the only ceiling — and it was a ceiling nobody consented to.

Kristjan put it as two objections on 10 September. That our server holds standing authority at all: "do we want to give this authority to our server? user should just sign whenever is needed... they can get notified in telegram". And that the shape is wrong: "can policies be per user? or are global? this way each user could define their own rules and sign that? isn't that the idea of session keys even?"

Both are right, and the second is the answer to the first. Policies are attached per wallet already; nothing but our own habit made them shared.

## Per person

Each person gets a policy minted when they grant the signer, carrying four numbers they can see and change: the most in one payment, the most in a day, the amount above which they are asked, and how long the grant lasts. Those four are one object, `Allowance`, and it is the single source both leashes are generated from — the Privy rules and the mandate's own `per_tx_cap`, `window_cap`, `expiry` and `approval_threshold`.

That the two are generated rather than maintained in parallel is the point. A leash that is tighter on screen than in the signer is the failure this design exists to prevent, and two hand-written copies of four numbers drift the first time anyone edits one.

Minting is idempotent three times over, because each guard covers a case the others cannot see: the stored policy id catches a returning person and a second device; an in-flight promise per person catches two tabs racing a cold start, when nothing is stored yet; Privy's own idempotency key catches two processes racing, which neither of the others can observe.

## Owned by the person

The policy is created with `owner: { user_id }`, so Privy resolves it to a key quorum whose only member is that person. Proven against the live app on 10 September and recorded in [the evidence](../evidence/PRIVY.md): minting an owned policy needs nothing but the app secret, and once minted that same secret is refused on `PATCH` and on `DELETE` with `401 No valid authorization keys or user signing keys available`, while an otherwise identical unowned policy accepts both. Same secret, same body, same endpoint; the only difference is the owner. **Ownership is not cosmetic.**

**What we gave up to get it.** Our server can no longer widen, tighten, extend or empty a person's policy. Every later change needs a signature from their key, which exists only in a signed-in browser. That costs us the one server-side kill switch we could have had — and it is worth saying plainly that we never had it anyway: removing an additional signer is a wallet _edit_, which needs the wallet's owner, which on this app means the `user_jwts` exchange that has answered `400 Invalid JWT token provided` since 7 September behind a dashboard toggle that does not exist. `revokeAgent` has been in the tree since 5 September (`2f5891c`) and nothing has ever called it.

So the kill switch is the browser's `removeSigners`, and it belongs to the person rather than to us. That is the pitch rather than a regression, on the owner's explicit direction.

**What holds the line instead.** Two things, both ours and neither depending on Privy being reachable. The mandate carries the identical ceilings and `authorize` refuses synchronously with no network call, so a Privy outage can never widen what the agent may spend — only narrow it. And the expiry is enforced on our side as well as in the policy, so a policy we cannot edit still goes quiet on time.

**The one sentence that changed, and which way.** This document was written before it was known whether the person's own key _could_ edit a policy the person owns, with that sentence marked as the only one that would move. It has moved to the pass side: on 10 September Kristjan signed in on production with a new account, was minted policy `hreeb1izpa3cyac6x4xrko8f` owned by quorum `x2stgnp1t56qu25d640l0kh6` — one member, that person, no authorization keys — and changed an allowance through Settings, which saved. The browser signs, our server adds the secret it may not send to a browser, and Privy accepts the pair. Ownership is therefore real in Privy's data and not only in our screens, and the fallback sentence that would have replaced this paragraph is not needed. [The evidence](../evidence/PRIVY.md) carries the ids and the policy read back from the live app.

The flag stays anyway. `PRIVY_PERSON_OWNED_POLICIES` defaults off and remains a one-variable way back, and the failure a person sees when Privy declines to sign remains a sentence rather than a silent no-op. Passing once, on one account, in one browser, is not evidence that it cannot fail for the next person, and the cost of keeping the way back is nothing.

## Which actions may run without asking

Named once, in `packages/domain/src/authority.ts`, and read by three consumers: the Privy rules, the mandate's rules, and `authorize`. Before this, _what money was for_ was inferred from the shape of the intent in three separate files — a `host` meant a 402, a `convert:` idempotency key meant the conversion, anything else was a transfer. A boundary spread across three inferences is not one a person can be shown, and showing it is now the product.

Paying a seller and the nested USDC-to-HBAR conversion run under the standing signature. Paying a person always asks, whatever the amount, because naming a payee is the person's act rather than a threshold to clear. Anything over the person's own line asks. A payee whose provenance is a page or the model is refused outright and never offered as a question.

The mechanism for the ask side is worth stating: a kind on the ask side gets **no Privy rule at all**, so the standing key physically cannot sign it. The person is asked because the signature is impossible, not because our code remembered to check.

Two properties fail closed on purpose. A kind with no row in the table is refused rather than inheriting the most permissive answer, so a money path added without a row cannot authorise itself. And where a kind's own ceiling meets the person's, the tighter always wins.

## Rolling caps stay host-side, and this was measured

`docs/evidence/PRIVY.md` has said the 24-hour aggregation is app-wide since 5 September, but that was an assumption: `AggregationInput` exposes a `group_by` our tooling had never sent. It was tested on 10 September, control first so an acceptance could not be mistaken for validation Privy does not do. Privy refused a field name that cannot exist, _and named its enumeration_: for `ethereum_transaction` the only groupable field is `to`, the recipient. There is no sender, no wallet and no owner to group by.

So a per-person rolling cap is not expressible at Privy, and the host keeps it. Two further limits bound this permanently and are worth recording so nobody re-opens it: `AggregationMethod` is only `eth_signTransaction | eth_signUserOperation`, so the typed-data x402 leg could never carry an aggregation whatever the grouping; and Privy updates an aggregation's value _after_ a request is signed, so two simultaneous signatures can both pass a cap they jointly exceed.

Per-request caps are Privy's and are stated as Privy's. The rolling cap is ours and is stated as ours.

## Out of scope, and why

**Trading.** `tradeRuleRefusal` is a second policy engine with its own rule shape, its own approval ids and its own `TradeAuthority`. Folding it in would mean rewriting the authority model of a lane that is landing in parallel, during a hackathon week, to gain consistency nobody has asked for. The `trade` kind is named in the table so that it is visibly excluded rather than forgotten, and it sits on the ask side.

**The Hedera leg.** Privy holds each person's Hedera key as a cosmos-type wallet and signs through `raw_sign`, but its policy engine cannot see inside a raw signature: a `signRawMessageBytes` rule is rejected without a condition, and no condition field source reads raw bytes, so the only rule that lets `raw_sign` through is `*`. Privy therefore holds that key and cannot judge what it signs. The caps on that leg are the mandate's and the pocket's, and the documents say so rather than implying Privy is the leash on both chains. Nothing in this decision changes that, and a person's allowance governs the Hedera leg through the mandate exactly as it governs the EVM leg through both.

## What is still true of the app-wide policy

It remains, and it is what a deployment that mints no per-person policies still signs under. That case is not vestigial: `signerStanding` reports `granted` rather than `shared` where per-person policies do not exist, because a deployment with nothing to migrate to should not put a call to action on every screen that nobody can answer.

## Evidence

Every claim about Privy's behaviour here was read from the live production app on 10 September 2026 and is recorded with its request and reply in [`docs/evidence/PRIVY.md`](../evidence/PRIVY.md): that ownership locks our secret out, that an additional signer may call Earn, that Earn rules can pin the vault and cap the amount, and that rolling caps cannot be bucketed per wallet. The plan this implements is [`docs/plan/PLAN_USER_OWNED_POLICIES.md`](../plan/PLAN_USER_OWNED_POLICIES.md).
