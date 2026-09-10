# A Froggy token: what seven research lanes found — 10 September 2026

Kristjan asked whether to launch a meme coin for Froggy, how to get traction, and
how to wire it into the app — floating "require one million tokens to use the app"
and "fee sharing, hooks or shit like that". Seven Grok agents searched the web and
X in parallel, each on a different angle, each writing its own file here. This is
the synthesis. Where they disagreed, the disagreement is kept rather than smoothed.

The numbers are snapshots from 10 September 2026 and will rot quickly.

## What they agreed on, unanimously

**Do not gate the app behind holding tokens.** Every lane reached this
independently, and two found the same evidence: AIXBT gated its terminal behind
600,000 tokens (0.06% of supply), which cost about $570,000 at the January 2025
high and roughly $13,000 by June 2026 — after which they added a $200/month fiat
subscription, because the gate had become a joke. clank.fun required 1,000,000
$CLANKFUN to launch a token; that token is now 99% below its high. The gate ends
either free or attached to a dead product. It also fights what Froggy is: a person
funding an agent in dollars, on a leash denominated in dollars.

And the timing objection is independent of all that: ETHOnline judges must be able
to use the app this weekend without buying anything.

**Do not launch before Sunday's submission.** The product being judged is the
leash. A token deployed three days out, with a handful of holders, reads as a
distraction from it — and the distribution lane notes the launch would land in the
same window as the judging, which is a sponsor-relationship risk even though it
breaks no published rule.

**Revenue sharing to holders is the legal red line, not the token itself.** Under
ESMA's CAFI guidelines, profit or revenue rights are transferable-security
features: that exits MiCA and enters MiFID II and the Prospectus Regulation, which
in Germany carries criminal exposure under KMAG. A separate problem sits in front
of it: MiCA Article 4(1)(a) requires the offeror to be a **legal person**, and
three natural persons launching a public token are already offside. There is no
company here yet.

The safer shape, if value must flow to holders at all, is buying the token on the
open market from off-chain revenue and burning it, rather than a contract that pays
holders a stream.

## What they disagreed on

**Which venue, if we launch on Base.** The venue lane ranks o1 Launchpad first on
Base (0.50% of every trade to a claimable creator address, `claimTo` redirectable)
and calls Clanker dead as a venue — $7.0K of fees in 24 hours, operatorless since
August 2026 — even though its contracts still pay. The stack lane and the hooks
lane both recommend Clanker anyway, for its v4 fee locker paying 80% of LP fees to
the creator in USDC with no custom hook to write. Both readings are defensible:
one optimises for the fee rate, the other for not writing a hook in a week when we
have a deadline. This needs a decision, not more research.

**Whether Base is the right chain at all.** Launchpad fees on 10 September split
roughly 59% Robinhood Chain (Pons), 24% Solana, 16% BSC, and **0.8% Base**. If the
goal is traders showing up, that points at Solana and pump.fun. If the goal is the
app earning and the token sitting beside the USDC our users already hold, it points
at Base. The lanes agree on one thing: pick one, and do not do both.

**Hedera: no.** No meme-launch ecosystem with measurable volume. Hedera DEX volume
is ~$1.6–1.8M/24h against Base's ~$1.15B. Keep Hedera as the sponsor story by
notarising the deploy and any airdrop merkle root to HCS topic `0.0.10847557`.

## The honest outcome distribution

On 9 September 2026, 107,077 new tokens launched across 16 tracked pads; 2,089
graduated. A mid-2026 sample of ~191,000 Solana launches found median creator
profit of approximately zero, with 34 addresses — 0.018% — earning more than about
$7,110. "We will earn from trading fees" is a tail outcome, not a plan.

For three people with modest followings and no budget, the distribution lane's
estimate: most likely dead on the curve under $50k; a good run with the frog art
and a live demo is $100k–$500k peak; $1–8M needs a named amplifier and still
retraces 70–90% by day three.

## What the product would actually have to do

Even a decorative token is not free. Our wallet UI, `WalletSummary` and
`KNOWN_ASSETS` cannot display an arbitrary ERC-20 today, and our users hold USDC
and no ETH, so any transfer or swap of a custom token needs gas sponsorship or it
fails silently. Our Uniswap execution path is Ethereum-mainnet and v3 only, so a
Base v4 pool will quote and then refuse to send. That is a day of work before a
token appears anywhere in the app, and it is a day that currently belongs to the
submission.

## The recommendation

Separate the coin from the product, and do it after Sunday.

1. **Before the deadline: nothing.** No contract, no ticker, no pre-announcement.
2. **After the deadline, if the team still wants it:** one token, on one chain,
   launched through a venue whose contracts already split fees to a creator
   address, so no hook gets written. Trading fees go to the treasury; the app is
   not gated; prices stay in dollars.
3. **In the app: one page that says the coin is a meme and is not required.**
   Nothing touching login, allowances, x402, or marketplace prices.
4. **Before any of it: a legal entity**, because the offeror must be one, and one
   conversation with Slovenian or German counsel about the classification fork.
5. **If value must reach holders**, buy and burn from real revenue. Not a
   dividend contract.

The precedent lane put the underlying warning best: the products that survived the
2024–25 agent-token cycle did so *in spite of* their tokens. Shaw Walters, who
built ElizaOS and watched the token take the foundation's treasury through a class
action, wrote on 4 August 2026: "I am never letting a token come close to Eliza
again." The software still ships. The token does not.

## The files

| File | Angle |
| --- | --- |
| `launch-venues.md` | Where tokens actually launch now, and which venues pay creators |
| `hooks-and-fee-routing.md` | Uniswap v4 hooks on Base, and routing value to a treasury |
| `distribution-on-x.md` | What works on X this month, and a launch-day plan |
| `token-utility-verdict.md` | The 1M-token gate, stress-tested |
| `legal-and-platform-risk.md` | MiCA, MiFID, ETHGlobal and sponsor risk |
| `precedents.md` | Virtuals, ai16z, Bankr, Clanker, AIXBT, PayAI and the rest |
| `our-stack-and-plan.md` | Chain choice, Privy's limits, and an engineering plan |
