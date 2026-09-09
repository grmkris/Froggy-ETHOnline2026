# PRD: the second door — Froggy sells to other people's agents

Written Wed 9 Sep 2026 for the Hedera **AI & Agentic Payments** track ($6,000, up to three teams at $2,000, `docs/prizes.md` lines 96-105). This is a product requirements document: it describes what a caller sees, how the thing behaves, what already exists and what has to be added. It is not an implementation plan and carries no timeline; the builders decide how each requirement lands in the tree. It follows the FABLE51 conventions (`README.md` in this folder) and leaves the team's files untouched.

**Status of the ground it stands on.** Every claim about the current product was checked against the tree at commit `63bc37b` on 9 Sep. Every claim about the track was read from `docs/prizes.md`; every claim about x402 on Hedera was read from live sources on 9 Sep. Anything not verified there is marked _unverified_.

---

## 0. In one paragraph

Froggy already sells three things over x402 on Hedera mainnet and already buys over the same rail, and both halves work only through the app: a person signs in, is given a wallet, and watches an agent browse. This feature adds a **second door with no signup**. It is a small server that any coding agent can install, which answers three questions: what does Froggy sell, buy it for me, and show me the settlement was real. The caller pays from their own Hedera account. Nothing is custodied, nothing is created for them, and no API key exists anywhere in the flow. It exists because the track asks to see an agent discover a service and pay for it with no key and no subscription in sight, and because a judge who signs up today has nothing to try: on mainnet a new pocket opens empty by design.

## 1. Why this exists

Three reasons, in order of weight.

**The track asks for it in its narrative, not only its bonus list.** The requirement is a live x402-gated service on Hedera settled through the named facilitator, plus a platform that consumes it. Froggy has both. But the sentence the track was written around is "show an agent discovering it and paying for it without an API key or a subscription in sight". The app is a human interface. This is the agent interface, and it is the only surface where that sentence is literally true.

**A judge cannot try the product today.** Two flows get confused and only one of them works for a stranger. When someone pays Froggy, money moves to Froggy and their own Hedera account is created by the payment itself if they hold only an Ethereum-style address. When someone signs up to Froggy, Froggy's float opens a pocket for them, and on mainnet that pocket opens with nothing in it. So the signup path dead-ends for anyone we have not funded, and the payment path is the one to put in front of a stranger.

**It serves the second tester group we already named.** Developers whose coding agent spends money were recorded as the secondary segment on 5 Sep. This is the artifact that reaches them: they install it, their own agent buys something, and they have felt the product without creating an account.

## 2. What we have today

| Piece | State |
| --- | --- |
| Lending-snapshot oracle, sold per query on Hedera mainnet | Live, priced per call |
| Pond Observatory demo report, free landing page and paid report | Live |
| Paid tasks (brief, browse), priced per job | Live |
| Service card at a well-known address describing the offer | Live, built from the same challenge as the 402 so the two cannot disagree |
| Settlement notes on a Hedera Consensus Service topic | Live on mainnet, sequence numbers reach the person's receipt |
| Facilitator, fee payer read from its own supported endpoint at boot | Live |
| A keyless route where an outside agent has a **person's** wallet sign | Live, requires an authenticated funded person |
| Anything an outside agent can install and run | **Nothing** |

The gap is the last row. Everything the second door needs to sell already exists; what is missing is the shape that an agent can pick up.

## 3. Who it is for

- **A judge with five minutes and no account.** Installs it, asks their agent to buy the snapshot, sees a real payment on mainnet and a receipt they can check. Success is that they never create a Froggy account.
- **A developer whose coding agent spends money.** Installs it once and has a paid data source their agent can reach without a key. Success is a second purchase on a different day.
- **Us.** It is the same product eating its own rail from the outside, which is the cheapest honest test that the seller half works for someone who is not us.

## 4. The three views

The caller's agent lists three things it can do. These are the views: what appears, what comes back, and in whose words.

**What's for sale.** Returns the catalogue: what each service is in a sentence, what it costs, on which network, in which asset, which facilitator settles it, and which consensus topic carries the receipts. This is the service card the product already publishes, rendered for a reader rather than a parser. Nothing here costs anything and nothing here needs an account.

**Buy it.** Takes the name of a service and any arguments it needs. Runs the payment: asks for the resource, gets the price challenge, pays from the caller's own account, asks again with the proof, returns the result. What comes back is the thing that was bought plus a short line saying what was paid, to whom, and the settlement identifier. The caller never sees a key, a header, or a facilitator.

**Check the receipt.** Takes a settlement identifier and answers whether it really happened: the transfer as the ledger recorded it, and the matching public note. This is the view that turns our audit trail from a claim in a README into something a stranger can run. It costs nothing and works for any settlement, including ones the caller did not make.

Three views is the whole surface. A fourth is a sign that this has become a second product.

## 5. How it behaves

**The ordinary path.** The caller asks what's for sale, picks one, buys it, gets the result. Two round trips, one payment, under a minute from a cold install. The purchase is priced in the challenge, not in our documentation, so the price cannot drift out of sync.

**When the caller has no funds.** The buy view refuses in plain words: what it costs, which network, which asset, and that the caller's account holds less than that. It names the shortfall. It does not offer to fund them and it does not create anything on their behalf.

**When the caller has no account yet.** Nothing special happens, which is the point. A caller holding only an Ethereum-style address has their ledger account created by their first payment. The refusal above still applies if that address is empty.

**When the facilitator is unreachable.** The buy view refuses and says which facilitator and that it is the settlement path, not the seller, that is unavailable. It must not silently fall back to another facilitator: the track requires this specific one, and a quiet fallback would break the qualification while looking like success.

**When it is not configured.** The same honesty rule the rest of the product follows applies here. A simulated sale says so in its own output and in anything it writes, and never returns something that could pass for a real settlement.

**What it never does.** It never holds the caller's key, never spends a Froggy person's balance, and never signs anything except with the caller's own credentials. Anything that changes spending authority is not one of these views.

## 6. What it changes in the app

Almost nothing, deliberately. Two small additions:

- The existing service card grows a line saying that this door exists and where to get it, so an agent that finds the card can find the tool.
- The public page that already describes what Froggy sells gains a short "for agents" section with the install line and one example request. This is the page a judge lands on from the submission.

No change to the wallet, the activity list, receipts, or the mandate. A person using the app should not be able to tell this shipped.

## 7. What this is not

- **Not the buy side.** The existing keyless route, where an outside agent has a Froggy person's wallet sign under their mandate, is a different product with different risks. It stays as it is and gets a paragraph in the README as the other half of the story.
- **Not a wallet.** No key generation, no custody, no funding, no balance display.
- **Not a general marketplace.** It sells what Froggy sells. Listing other people's services is the directory's job, not this one.
- **Not a second codebase.** It is a thin client of routes that already exist. If it starts needing its own domain logic, the design is wrong.

## 8. How we will know it worked

- A stranger completes a paid request without an account, and we did not help them.
- The settlement is on mainnet and the receipt view resolves it.
- It appears in the demo video as the opening beat, because it is the fastest path from nothing to a real payment.
- At least one person outside the team installs it and buys twice.

## 9. Open questions

- **Does the facilitator accept our own token?** The plan to route a platform cut through a token's own fee schedule depends on this, and nobody has documented whether a token allowlist sits in front of it. One verification call answers it. Until then the catalogue sells in the native asset only. _Unverified._
- **Which service is the front door?** The snapshot is the cheapest and most legible; the report is the most visual. The catalogue can carry both, but the example in the README and the video should name one.
- **Do we register the door in a public agent registry?** It would make discovery a demonstrated fact rather than a claim about a well-known file, and it pairs with agent identity. It is additive and can follow.
- **Does the demo run on mainnet or testnet?** Mainnet is rarer and more convincing; testnet is cheaper for a stranger to try. These can differ, and if they do, the page must say which is which without making the reader work it out.
