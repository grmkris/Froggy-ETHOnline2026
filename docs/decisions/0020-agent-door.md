# 0020 — A second, keyless door for agents that are not ours

10 September 2026

Froggy sells three things over x402 on Hedera mainnet and buys over the same rail, and until now both halves worked only through the app: a person signs in, is given a wallet, and watches an agent browse. There was nothing an outside agent could install. This adds one: a small stdio MCP server, served at `/froggy-mcp.js`, that lets a caller buy from Froggy using their own Hedera account. It is a client of routes that already exist and owns no domain logic of its own; if it ever needs any, the design is wrong.

## Why a second door instead of widening the first

`/mcp` already lets an outside agent spend — but a _person's_ balance, under that person's mandate, after an OAuth consent that person gave. Everything behind `invokeTool` there resolves through `callerOf` to a `UserId`. That is the right shape for "my agent, my money" and the wrong shape for a stranger, who has no account and should not be given one.

The two doors differ in who holds the risk. Through `/mcp`, Froggy signs, so Froggy needs a leash: a mandate, a policy, a spend ledger, an approval when the grant does not cover the request. Through this door, the caller signs, so there is nothing of ours to leash — and correspondingly nothing of ours to protect them with. Keeping them separate keeps each one's guarantees legible. A single door with a "whose money is it" flag would be one refactor away from spending the wrong person's balance.

## The caller's key

It arrives in the process environment as `FROGGY_HEDERA_PRIVATE_KEY` and stays there. It is not logged, not written to disk by us, not echoed into a tool result, and never sent anywhere: the buyer's whole job is to produce a signed transaction locally and put it on a retry. `packages/payments` needed no change for this. `liveHederaPayer` has always taken a key as an argument and `signerHederaPayer` has always taken a `signBytes` callback; the three existing call sites happen to pass the host's key, a key sealed under `HEDERA_KEK`, or a Privy wallet's `raw_sign`. Handing it a stranger's key is a fourth caller, not a new mechanism.

The documentation tells callers to use `.mcp.json` with `${FROGGY_HEDERA_PRIVATE_KEY}` expansion rather than a literal, so the secret lives in their shell and not in a file they might commit. We cannot enforce that, and say so rather than implying we can.

## No fallback facilitator

When the settlement path fails, the door refuses and names the facilitator from the seller's own challenge. It does not try another one.

This is a correctness rule before it is a track rule. The facilitator is part of what the seller offered: the challenge names it, the fee payer in `extra` belongs to it, and the transaction the buyer signed has that fee payer's account as its transaction id. A payment built for one facilitator is not a payment another can settle. Quietly retrying elsewhere would either fail confusingly or succeed as a different transaction than the one described — and it would break the Hedera track's qualification, which names Blocky402 literally, while looking on screen like success.

## The stub is a refusal

The repository's rule is that every external service has a loud stub and that a faked run must never pass for a real one. The usual shape is a stub implementation that marks its output `stubbed: true`. That shape is wrong here, because the thing being stubbed is a stranger's own money: a simulated purchase would produce a settlement id that resolves to nothing, in a transcript that a person may later read as evidence they were charged.

So an unconfigured door has no stub mode. It refuses, names the variable that is missing, and says in the same sentence that nothing was bought and nothing was simulated. The two free views still work, so a caller who has installed it and configured nothing still sees something real.

## Three views, and why not four

What's for sale, buy it, check the receipt. The catalogue and the receipt are free and need no key; only the middle one spends.

The receipt view is the one worth arguing for. It takes any Hedera settlement id — including ones the caller did not make, and ones we did not write — and answers from two independent sources: the ledger says what moved, and the consensus topic says what was claimed about it. The topic carries no submit key, so a note alone proves nothing and the view says so. This is what turns the audit trail from a claim in a README into something a stranger can run, and it is the reason the door is worth shipping even to someone who never buys anything.

A fourth view would mean this had stopped being a door onto Froggy and started being a second product.

## Distribution

Built from its own source by `Bun.build({ target: "node" })` on the first request and cached in a module-level promise, exactly as `/froggy-cli.js` already is, for the same reason: an outside agent's sandbox has Node and curl and nothing of ours, and the repository may be private on the day. Building at request time rather than at image build time means there is no artefact to forget. The bundle is about six megabytes, almost all of it the Hedera SDK, and runs under plain Node with no install step.

## What this changed elsewhere

Three small things, each of which stands on its own:

`lookupHcsNote` reads a settlement's note back off the topic through the public mirror node. `lookupHederaTransactionDetails` now also returns the transfer legs, because a receipt has to name who paid whom and `SUCCESS` does not say that. And waiting in `reconcileHederaPayment` became a port, like the `fetch` beside it, because the door is bundled for plain Node where `Bun` does not exist.

`HEDERA_ASSET` makes the price's asset configuration rather than a literal. That the facilitator accepts an HTS token was verified on 10 September rather than assumed: a `/verify` of a USDC-denominated payload signed from an account holding none came back `insufficient_balance: payer holds 0 of 0.0.456858`, which is a balance answer and not an allowlist one. The default stays HBAR, because a stranger who holds HBAR does not necessarily hold anything else, and arriving with what you already have is the point.

## Known rough edge

`signerHederaPayer`'s token branch coerces a `bigint` amount through `Number()` where the HBAR branch beside it uses `Hbar.fromTinybars` on the string. It is safe below 2^53 — about nine billion USDC at six decimals — and wrong above it. Recorded here rather than fixed in the same change, because it predates this work and is not on its path.
