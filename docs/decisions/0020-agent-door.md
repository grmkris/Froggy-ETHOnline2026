# 0020 — A second, keyless door for agents that are not ours

10 September 2026

Froggy sells three things over x402 on Hedera mainnet and buys over the same rail, and until now both halves worked only through the app: a person signs in, is given a wallet, and watches an agent browse. There was nothing an outside agent could install. This adds one: a small stdio MCP server, served at `/froggy-mcp.mjs`, that lets a caller buy from Froggy using their own Hedera account. It is a client of routes that already exist and owns no domain logic of its own; if it ever needs any, the design is wrong.

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

Served under `.mjs`, and saved under `.mjs` by the install command. The bundle is an ES module, and Node reads a bare `.js` as CommonJS wherever the nearest `package.json` says so — which is most of the directories an agent works in. `/froggy-mcp.js` still answers, for anyone who has the old link.

The one line that differs per request is the serving origin, stamped in below the shebang. A door downloaded from a testnet deployment, a preview, or somebody's fork should buy from that deployment; a constant compiled in at build time would have sent all of them at our mainnet.

## What this changed elsewhere

Three small things, each of which stands on its own:

`lookupHcsNote` reads a settlement's note back off the topic through the public mirror node. `lookupHederaTransactionDetails` now also returns the transfer legs, because a receipt has to name who paid whom and `SUCCESS` does not say that. And waiting in `reconcileHederaPayment` became a port, like the `fetch` beside it, because the door is bundled for plain Node where `Bun` does not exist.

`HEDERA_ASSET` makes the price's asset configuration rather than a literal. That the facilitator accepts an HTS token was verified on 10 September rather than assumed: a `/verify` of a USDC-denominated payload signed from an account holding none came back `insufficient_balance: payer holds 0 of 0.0.456858`, which is a balance answer and not an allowlist one. The default stays HBAR, because a stranger who holds HBAR does not necessarily hold anything else, and arriving with what you already have is the point — and the boot refuses a token outright until the price has been written for it, because the price is in the asset's own smallest units and the decimals are not the same.

## Known rough edge

`signerHederaPayer`'s token branch coerces a `bigint` amount through `Number()` where the HBAR branch beside it uses `Hbar.fromTinybars` on the string. It is safe below 2^53 — about nine billion USDC at six decimals — and wrong above it. Recorded here rather than fixed in the same change, because it predates this work and is not on its path.

## What the review changed, 10 September

The door was reviewed after it was built, by nine independent readers and by running the built bundle rather than reading it. Forty-five findings survived an adversarial check. The decisions above all stand; these are the ones that were wrong in the implementation of them, grouped by the promise each one broke.

**"A refusal from this door says what is wrong."** It did not, for the failures nobody wrote a branch for. A throw inside a tool — a seller that drops the connection, a key the SDK cannot parse — was caught by the read loop, written to stderr, and answered with nothing at all, so the caller waited forever on a request that would never be answered. The dangerous case is a throw from the retry, after the signed payment has gone out: silence there is indistinguishable from a purchase still in progress. Every path out of a tool is now a sentence, and the one after the money may have moved says that it does not know.

**"The key never leaves the process."** It could leave in a refusal. The two variables sit on adjacent lines of the install command, and a caller who swapped them got the value of `FROGGY_HEDERA_ACCOUNT_ID` quoted back in a tool result — into the agent's context, its transcript, and its model provider. The refusal now describes the value and never repeats it, and says outright when the value has the shape of a key.

**"The price is in the challenge, not in our documentation."** True, and not sufficient: nothing compared the challenge against the catalogue the caller had been shown, so a seller could advertise one price and charge another, to another account. The 402 is now checked against the catalogue row before anything is signed, `maxAmount` lets a caller set their own ceiling, and only the offer that passed those checks is handed to the payer — previously the payer re-picked from `accepts` under a laxer rule than the one the door had assessed and reported.

**"Two independent sources."** The receipt named the wrong parties for any settlement priced in an HTS token, because it picked the largest transfer leg across assets and Hedera's network fee is larger than a cent-scale payment. It now chooses the asset first and looks for the balanced pair, which is also what makes a settlement priced below its own fee read correctly. And it said "no matching note was found on the consensus topic" in cases where it had not looked at one — the view that exists to expose unverified claims should not make one.

**"Every settlement leaves a public note."** The Observatory report was added to the service card in this same change and had no HCS writer at all, so buying it produced a settlement the receipt could not find a note for. It writes one now.

Three things were wrong that were not about a promise. The bundle was an ES module served under a `.js` name, so `node ./froggy-mcp.js` failed to start in any directory whose `package.json` says `"type": "commonjs"` — the CLI beside it had always saved as `.mjs`, and the door now does too. The published `/discovery/resources` listing dropped `extra.feePayer`, the one field a Hedera payment cannot be built without, which left the endpoint decorative. And `Bun.build` rejects rather than answering `{ success: false }`, so a single failed build cached a rejected promise and took `/froggy-mcp.js` out until the process restarted; the same shape was in `cli-route.ts` and is fixed in both.

The HCS-14 identifier was checked against `hashgraph-online/standards-sdk` rather than only against the prose. The canonical JSON puts `skills` first, not in alphabetical order, and `uid` is `"0"` where no registry assigned one. Ours did neither, so the identifier we published could not be recomputed by anyone using the reference implementation — which was the only thing it was for.

`HEDERA_ASSET` now fails the boot rather than mispricing quietly. The price is a number of the asset's own smallest units and the decimals differ, so switching the asset alone would have charged about five hundred times the intended amount with nothing anywhere saying so.
