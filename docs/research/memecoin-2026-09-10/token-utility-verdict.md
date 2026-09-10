# Token utility verdict for Froggy

Researched 10 September 2026. ETHOnline submission is Sunday 13 September 12:00 EDT / 18:00 CEST. Live app: https://app-production-58dd.up.railway.app.

The team's own words, verbatim: "We want to launch a meme coin for this project... how to launch it properly to get some traction and so on, and also how should be integrated in this app in some way, or maybe like we could require to call one million tokens to use the app and then I don't know have some fee sharing for this app. hooks or shit like that."

This document answers the utility question only. It is not a launch-mechanics brief.

## Thirty seconds

- **Do not gate the app behind 1,000,000 tokens.** It breaks ETHOnline judging this weekend, it taxes the actual user (a person funding an agent in USDC/HBAR), and the closest live analogue — AIXBT's 600,000-token terminal gate — saw the entry fee fall more than 95% as the token fell ~98% from its January 2025 high. The product did not get better. The tax just got cheaper, then they added a $200/month fiat subscription because the gate was absurd.
- **A Froggy token does not improve the product.** Froggy's job is a person-owned Privy allowance over real USDC on Base and real HBAR on Hedera, spent on x402 services priced in dollars. Putting a volatile ticker in that path makes the leash worse, not tighter. Keep the coin and the product separate.
- **Fee-sharing to holders is the worst of the "utility" ideas.** Froggy's customer prices are $0.01–$0.10 per call. There is nothing to share. Promising holders a cut of app revenue is also the cleanest way to look like an investment contract under the SEC's 17 March 2026 Howey interpretation.
- **The only design that has actually printed for small teams in 2025–2026 is a meme with no product utility and creator trading fees.** Clanker on Base pays the creator 80% of the initial Uniswap v4 LP fees. pump.fun paid creators $11.3 million in August 2026 on a 0.30% bonding-curve cut. That money comes from traders, not from users of the app.
- **Smallest honest integration that ships in a day:** launch on Base via Clanker, take creator LP fees, put a `/token` page in the app that says the coin is a meme and is not required, and do not touch login, allowances, x402, or marketplace prices. Anything more this week is a tax on the submission.

## What the product actually is (the constraint)

Froggy is not a trading venue, a GPU marketplace, or a social app. As of 10 September 2026 it is:

- A Privy embedded wallet per person. The spending policy is owned by that person. The server can mint it; the same server secret is refused on `PATCH`/`DELETE` (`docs/decisions/0019-user-owned-policies.md`, proven on production 10 September).
- An agent that buys real services over x402: web search $0.01, inference $0.01, X search $0.06, image $0.08, speech $0.10 (`docs/evidence/MARKETPLACE.md`, 8 September 2026). Settlement is USDC on Base and HBAR on Hedera, notarised to HCS.
- A seller on the same rail. Other agents pay Froggy in those same units.

The person budgets in dollars. The leash is denominated in dollars. The sellers Froggy pays (You.com, BlockRun, The Graph) quote in USDC. Circle's own x402 explainer, last updated 1 March 2026 and cited as accessed 6 September 2026, still says the protocol uses USDC because "neither the buyer nor the seller wants the payment amount to fluctuate between the request and the response" (https://usdc.org/guides/what-is-x402).

A token that is not a dollar is, in this product, a second currency the user did not ask for.

x402 can technically settle any ERC-20 via Permit2 (Coinbase, 18 March 2026, https://www.coinbase.com/en-ca/developer-platform/discover/launches/x402-ERC20; x402 docs fetched 10 September 2026, https://docs.x402.org/core-concepts/network-and-token-support). Dollar-string prices (`"$0.01"`) still default to native USDC on Base at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Stripe's live x402 path, verified 2 September 2026, is USDC on Base only (https://wavect.io/blog/x402-payments-comparison-2026/). "We could accept the meme as payment" is protocol-true and commercially false: every supplier Froggy already pays wants USDC.

## The team's idea, taken seriously

"Require to hold one million tokens to use the app" plus "some fee sharing."

"One million tokens" is not a number until you pick a supply. Clanker's Farcaster-bot default is 100 billion (Clanker docs, page dated 1 July 2026, https://clanker.gitbook.io/documentation/general/token-deployments/farcaster-bot-deployments). One million of that is 0.001% of supply:

| FDV of the meme | Cost of 1,000,000 tokens (100B supply) |
| --- | ---: |
| $10,000 | $0.10 |
| $1,000,000 | $10 |
| $10,000,000 | $100 |
| $100,000,000 | $1,000 |

AIXBT, the closest shipped "hold N tokens of our agent coin to use the product" design, used 600,000 of a 1 billion supply (0.06%). At the 16 January 2025 high of about $0.94 that was ~$570,000 to open a chat terminal. By June 2026 the same bag was ~$13,000 and they had added a $200/month USD subscription because the token gate had become a joke (https://plisio.net/ai/aixbt, 11 June 2026). The agent still posted. The token was down ~98%.

clank.fun required holders of 1,000,000 $CLANKFUN to launch a token on its UI (Bitquery docs, 3 September 2026, https://docs.bitquery.io/docs/blockchain/Base/base-clanker-api/). Messari's page for that token, retrieved 10 September 2026, showed a market cap of $86,915, 99% below a 5 January 2025 all-time high (https://messari.io/project/clank-fun). The gate is now either free or the product is dead. Same mechanism the team just proposed.

That is the idea, run at the prices the last two years actually produced.

---

## Option-by-option

For each: what it does to users, what it does to the token, how it is gamed, what a 10x move either way does. Precedents are named. Where sources disagree, both numbers are kept.

### 1. Hold-to-access (the team's idea)

User must hold ≥ N tokens in a wallet Froggy can see, or the app / MCP / CLI refuses.

**Users.** A person who wants to give an agent a $5 USDC allowance now also has to buy a meme, hold it in (or next to) the spending wallet, and keep the balance above the line. Guest and judge paths die unless you special-case them, at which point the gate is decorative. Other agents buying Froggy's own x402 endpoints have no reason to hold the ticker.

**Token.** Demand is a one-time buy to clear the threshold, then a hold. That is not a flow. It is a parking lot. When the novelty fades, holders sell down to exactly N, or to zero if a snapshot is not continuous.

**Gamed.** Rent the bag for one block. Buy, screenshot, sell. If the check is once at login, a flash-loan-shaped buy (or just a CEX withdraw and return) clears it. If the check is continuous, anyone who sells 1 token gets kicked mid-session — including a judge. Wash wallets farm "unique holders." A second wallet that holds the meme while the agent wallet spends USDC splits the identity the product just unified.

**10x up.** The dollar cost of N tokens becomes 10×. New users bounce. Existing users will not sell because selling logs them out. The product's growth rate is now inverse to the ticker. That is AIXBT at $570,000 for a terminal.

**10x down.** The gate becomes free. Speculators who would never use an agent wallet buy the bag because access is cheap, dump through the liquidity, and leave. The "community" is tourists. clank.fun's 1,000,000-token gate at an $87k market cap is this state.

**Precedent.** AIXBT (Virtuals, Base): 600k-token gate; ~$755M peak market cap January 2025; ~$22M by mid-2026; fiat subscription added because the gate failed (Plisio, 11 June 2026). Friend.tech keys (Base, 2023–2024): access to chats gated by a bonding-curve "key." Protocol generated almost $90 million in fees; team walked with ~$44 million; FRIEND −98%; deposits $52M → $4M; daily new users to single digits; admin keys burned 7 September 2024 (DL News, 9 September 2024, https://www.dlnews.com/articles/defi/friend-tech-shuts-down-after-revenue-and-users-plummet/; Decrypt, 9 September 2024). A 2025 recap still had it earning <$60/day (Traders Union, 11 September 2025). Machi Big Brother's $1M takeover bid in late August 2026 pumped FRIEND ~1,500% and collapsed in nine days — there was nothing to buy except an X account (BeInCrypto, updated 6 September 2026).

**Verdict for Froggy: no.** It is a cover charge on a product whose pitch is "fund dollars, set a cap, watch the agent spend."

### 2. Stake-to-access

Same as hold-to-access, but N tokens are locked in a contract for a period.

**Users.** Worse than holding. Capital is frozen. Unstaking delay means a person who wants out of the meme is stuck in the app, or a person who wants out of the app is stuck in the meme.

**Token.** Looks like "aligned supply" on a dashboard. In practice it is mercenary capital that unstakes the day the points or the access stop. Hyperliquid's staking is the version that works, and it does **not** gate trading: anyone can trade; staking only discounts fees. HYPE staked is also the security asset for HyperBFT. Froggy has no chain to secure.

**Gamed.** Stake from a fresh wallet, use the app, unstake. Liquid-staking wrappers appear in a week and the gate is back to a hold check. If you forbid wrappers, you are now in the business of allowlisting contracts.

**10x up.** Lockup becomes a $10k (or $100k) hostage. Support tickets. People demand a "guest stake" you will invent, which is hold-to-access with extra steps.

**10x down.** Stakers are underwater and still cannot leave without losing access. They rage-quit the product to punish the token. STEPN's 2022 version of this (you had to buy an NFT sneaker, then earn/spend GST) saw MAU 700,000 → under 100,000 as GST went −99% (Naavik, 4 July 2022; Cryptomunies, 4 May 2026 still has GMT ~$0.01, GST ~$0.002).

**Precedent.** Hyperliquid staking discounts (docs fetched 10 September 2026): Wood >10 HYPE = 5% off, Diamond >500,000 HYPE = 40% off. Access to the exchange is free. That is why it works. GMX staking earns a fee share and does not gate trading; after the 9 July 2025 V1 exploit they moved staker rewards from ETH/AVAX to buybacks, and as of the live docs those buybacks sit in a treasury until GMX hits $90 (https://docs.gmx.io/docs/tokenomics/rewards/). Jupiter staking gates governance and a verification API, not the swap itself (tokenomics.com, updated 16 June 2026).

**Verdict for Froggy: no.** You do not have a chain, a matching engine, or a $1B fee engine. Locking a meme to open a $0.01 web search is parody.

### 3. Pay-per-call in the token

Each Froggy service, and each outbound x402, is priced in the meme instead of USDC/HBAR.

**Users.** The person can no longer budget. A $0.01 search is 10,000 tokens today and 1,000 tomorrow. The agent cannot quote a cost. The Privy policy caps are in native units of whatever it is asked to sign; a cap written in a volatile ERC-20 is a cap that silently widens or tightens with the ticker, which is the failure 0019 exists to prevent. Outbound sellers (You.com, BlockRun, Graph) will not take the meme. Froggy would have to swap on every call, eat slippage, fail closed when liquidity thins, and explain a new failure mode to a person who thought they funded USDC.

**Token.** This is the "real utility" slide. It produces sell pressure, not buy pressure, unless you force the user to buy the token immediately before each call. Then you are a funnel into your own pool. Render's honest version of this — price the job in dollars, convert to RENDER at spot, burn most of it — still produced the 2026 "booming GPU grid, sinking token" write-up (HOGE Wire, 30 August 2026, https://hoge.gg/render-paradox-booming-gpu-grid-sinking-token-2026/). Usage can go up while the ticker goes down. The Graph still lists GRT as the query-fee token; it also added x402 USDC at the gateway because that is what agents actually pay (The Graph blog, 1 July 2026, https://thegraph.com/blog/graphtally-micropayments-machine-economy/). GRT itself was about $0.018 on 10 September 2026, −81% over one year (https://www.coinbird.com/cryptocurrencies/the-graph/overview).

**Gamed.** Users buy the token, pay, receive the service, sell the dust. If you buffer a "credit balance" in the token, they deposit when the price is high and demand dollar-equivalent refunds when it dumps. If you refuse refunds, you are STEPN.

**10x up.** The product gets 10× more expensive in dollars unless you reprice every call in USD and convert, at which point you have reinvented Render's BME and the token is an implementation detail. Users leave.

**10x down.** The product gets 10× cheaper, you get farmed, treasury (if you hold the meme) is wrecked, and anyone who prepaid in tokens wants a top-up.

**Precedent.** Virtuals: inference quoted as payable in VIRTUAL; VIRTUAL ATH $5.07–$5.14 on 2 January 2025, about $0.64 on 10 September 2026 (BitKan daily bars, https://bitkan.com/price/virtuals-protocol/historical-data). The protocol's own February 2026 "revenue incentives" post is an admission that trading fees on agent tokens were cyclical and that they needed USDC service sales (https://x.com/virtuals_io/status/2021971168878903699, 12 February 2026). aixbt, 15 May 2026: "the first crypto project where the business model works even if the token goes to zero" — because the revenue they were counting was **USDC** infrastructure fees, not the agent token (https://x.com/aixbt_agent/status/2055090561917546668). STEPN GST: inflationary pay-to-play, −99.9% from $8.51 (April 2022) to fractions of a cent.

**Verdict for Froggy: no.** It fights the rail you just deployed.

### 4. Token as the credit balance

User buys the meme once; the app displays a "credits" number in tokens; services debit it.

**Users.** Prepaid closed loop. Feels like an API dashboard. The moment the ticker moves, the credit is no longer the dollar amount they thought they bought. Chargebacks do not exist on x402; you will invent a support process for "I deposited at $X." The person-owned Privy policy no longer describes what the agent can spend, because spend is now an off-chain ledger in a unit Privy does not know about.

**Token.** Continuous buy-to-deposit, sell-on-exit. You become the market maker of last resort. A run on credits during a dump is a bank run you cannot pause without freezing the product.

**Gamed.** Deposit, drain credits into exportable artifacts (images, search results), never use the agent again. Sybil a thousand wallets through the guest path if credits are granted for signup.

**10x up / down.** Same as pay-per-call, plus a solvency problem: if you sold credits at one price and the treasury's token bag is now worth a tenth, you cannot honour the remaining balance in dollars, and honouring it in tokens is a 10× haircut the user will not accept.

**Precedent.** STEPN GST wallet. Early Graph billing (invoice in GRT on Arbitrum). Every failed "app coin" from 2017–2022. No successful agent-payments product in the last two years uses a volatile credit. The ones that work (Coinbase x402, Stripe x402 preview, Circle) keep the credit in USDC.

**Verdict for Froggy: no.** You already have a credit: the USDC/HBAR pocket under a policy the person owns.

### 5. Discount when paying in (or holding) the token

Keep USDC/HBAR as the money. Knock 10–25% off Froggy's take if the person holds or burns some of the meme.

**Users.** Least harmful of the in-product hooks. Power users who already like the ticker get a cheaper search. Everyone else pays the list price. Judges and first-time users are unaffected if the discount is optional.

**Token.** Weak, optional demand. Binance's 25% spot-fee discount for paying in BNB still exists in 2026 (CoinDesk BNB page, 27 August 2026; VanEck BNB ETF prospectus, 22 April 2026). It works because Binance has enormous fee volume and BNB is also gas on a chain they run. Hyperliquid's 5–40% staking discount works because perps taker fees start at 4.5 bps on real notional. Froggy's take on a $0.01 You.com call is a fraction of a cent. A 25% discount on a fraction of a cent is not a reason to buy a token. It is a reason to screenshot a marketing page.

**Gamed.** Hold the minimum during the call, sell after. If you require a snapshot, you are back at hold-to-access. If you require a burn, you have created pay-per-call with extra steps.

**10x up.** Discount in dollar terms is unchanged (it is a percent of a USDC price). Token holders feel rich and do not care about a $0.0025 saving. The discount does no work.

**10x down.** Same. The discount still does no work. Holders who bought "for the utility" feel lied to.

**Precedent.** BNB (works at exchange scale). HYPE staking tiers (works at Hyperliquid scale). CRO / FTT historical exchange-token discounts: FTT died with FTX; the discount did not save it. None of these are $0.01 API products.

**Verdict for Froggy: optional later, not this week, and not a reason to exist.** If you ever have meaningful take-rate, a holder discount is the one in-app hook that does not break the leash. It still does not make the token.

### 6. Revenue share to holders

A cut of Froggy's x402 take, marketplace margin, or "protocol fees" is streamed to token holders, or used to buy and burn the token.

**Users.** Either they pay higher prices so holders can be paid, or the team runs the marketplace at a loss to juice a ticker. Other agents buying Froggy's endpoints do not hold the token and will route around a marked-up seller.

**Token.** This is the slide that gets retweeted. It only works with **real, recurring, large** fees. Hyperliquid is the existence proof: docs fetched 10 September 2026 say fees go to HLP, the Assistance Fund, and deployers; the Assistance Fund converts trading fees to HYPE as part of L1 execution and burns them (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md). Secondary sources disagree on the exact percentage — "99% of fees" (Coinjuice, 10 September 2026, citing a 2 June 2026 piece and $932M buybacks on $1.04B fees), "over 95%" (Coinfomania, 20 May 2026), "up to 97%" (hyperdash.com, 18 January 2026). The disagreement is on the leftover, not on the direction: Hyperliquid has a nine-figure fee engine. Froggy has cent-level invoices. GMX: 27% of V2 fees buy back GMX; staker yield is now delayed until $90/token (GMX docs, live). Uniswap UNIfication (Tally proposal 93, executed 28 December 2025) flipped a 0.05% protocol fee on v2 and a 100 million UNI treasury burn; UNI was ~$5.92 around the vote and ~$3.24 on 14 August 2026 (KuCoin/Blockchainreporter, 14 August 2026). A fee switch did not make the token go up.

**Gamed.** Wash-trade whatever you call "volume" if the share is volume-weighted. If it is holder-weighted, mercenaries park size, collect, leave. If it is a buyback, you are buying your own dumpers.

**10x up.** Dollar yield per token falls 10× for the same fee. Holders complain the "APY" died. You did not get more users.

**10x down.** "APY" in token terms explodes and attracts mercenaries who sell into every buyback. Classic.

**Legal.** The SEC/CFTC joint interpretation of 17 March 2026 (Release 33-11412, https://www.sec.gov/files/rules/interp/2026/33-11412.pdf) did **not** kill Howey. A non-security crypto asset is still subject to an investment contract when the issuer makes representations of essential managerial efforts from which purchasers expect profits (Moloney statement, 17 March 2026, https://www.sec.gov/newsroom/speeches-statements/moloney-statement-book-of-howey-031726). "Hold $FROG and we will share the app's fees with you" is that sentence. Practitioner write-ups of the same release note that a **creator royalty that does not go to holders** does not, by itself, make the asset a security (Buzko Legal, 14 April 2026; James Williams, 18 March 2026). Pudgy Penguins is the commercial version of that line: Igloo Inc. keeps merch revenue; 5% of net on physical products goes to the **NFT holders whose penguin appears on the SKU**; PENGU token holders get nothing from Target plushies (Phemex, 27 July 2026, https://phemex.com/blogs/pudgy-penguins-merch-target-pengu). That is not an accident.

**Verdict for Froggy: no, and especially not this week.** You do not have the fees. You do have a three-person team whose "essential managerial efforts" are the entire company.

### 7. Points now, token later

Ship no token. Score receipts, paid calls, HCS-notarised spends, maybe referrals. Promise a later airdrop.

**Users.** If the points are silent and the product is used as itself, users are fine. If you put a points ticker on the workspace, you get farmers. The agent starts doing $0.01 searches in a loop because that is the farm. That is the opposite of a leash.

**Token.** Can work, once, if the product already has real usage that would exist without the farm. Hyperliquid is the one everyone copies: points for **perp trading volume** from November 2023 through 2024, then 310 million HYPE (31% of supply) to ~94,000 wallets on 29 November 2024, ~$1.2 billion at ~$3.50–$4.20 (The Block / CoinDesk, 28–29 November 2024). The exchange was already the product. Blast is the other pole: points for depositing into a one-way bridge, $2.3B in, TGE 26 June 2024 at ~$3B FDV, TVL then −97% to ~$55–65M by late 2025, DAU 160k → <4k (CryptoTimes, 19 January 2026; The Defiant, 26 August 2025). LayerZero (June 2024) removed 803,273 wallets (59%) as sybils; daily messages 348k → 31k after the snapshot; claim required a USDC donation (Unchained 3 May 2024; The Block 26 June 2024; retrospective 22 March 2026). Hyperliquid's copycats in 2025–2026 are now competing with actual token sales because users stopped trusting points (DL News, 24 December 2025).

**Gamed.** Always. If you reward "paid calls," the farm is paid calls. If you reward "unique days," the farm is cron. If you try to filter sybils, you get LayerZero's false-positive war on a three-person team.

**10x.** There is no token yet. The risk is the airdrop: too small (Monad-style backlash, cited in the same 24 December 2025 DL News piece) or so large it is the only reason anyone used the app (Blast).

**Verdict for Froggy: not this week, and not as a growth hack.** After the hackathon, a private receipt-based score that you never show in the UI is a cheap option you can decide to honour or ignore. Putting it on screen before Sunday is how you fill the receipts pane with junk the judges will read as fake usage.

### 8. Pure meme, no product utility, creator trading fees back to the team / treasury

The coin is a joke and a brand. Using Froggy does not require it. Holding it does not pay you from the app. Traders pay a swap fee; the creator's share of that fee is the only cash.

**Users.** Unaffected, if and only if you do not lie. The app stays a dollar leash. Judges do not buy anything. Other agents still pay USDC/HBAR.

**Token.** Speculative. Most go to zero. The ones that live do it on attention, not on a whitepaper. The cash that is real in 2026 is **creator trading fees**, not "utility":

- pump.fun (Solana), fee schedule last updated 20 May 2026: 1.25% on the bonding curve, of which 0.30% to the creator. After graduation, creator fee is dynamic (~0.05%–0.95% by market cap). August 2026 creator payouts $11.31 million, the highest month on record; all-time creator routing ~$96–98 million (Alchemii, 4 September 2026; MemeFees / DefiLlama snapshot fetched 10 September 2026 13:52 UTC, https://memefees.com/launchpads/pump-fun). Protocol 30-day revenue in that snapshot: $35.36 million. Q1 2026 (through 17 March) Coinjuice had pump.fun at $230M earned, $103M to PUMP holders via buybacks — that is **pump.fun the platform**, not a random coin on it.
- Clanker on Base (docs dated 1 July 2026): creator takes the LP fee on the initial Uniswap v4 pool (example 1% / 2% / 3%); protocol takes 20% of that (so 0.2% / 0.4% / 0.6% extra). Farcaster-bot deploys: "Users will receive 80% of LP fees as creator rewards." Claim on clanker.world. Caveat: fees only accrue on the **initial** pool. A second pool and the creator earns nothing. Farcaster-related protocol fees collapsed through 2026 — Messari's Clanker update (10 September 2026) cites $35.43M in Q1 2026 → $4.67M in Q2 → $376,740 so far in Q3, and Neynar seeking a new owner for Farcaster/Clanker on 17 August 2026 (https://messari.io/project/tokenbot-clanker). Base is still the right chain for Froggy because that is where the USDC already is. The distribution surface (Farcaster) is weaker than it was in 2025.
- Pudgy / PENGU: merch in 3,000+ stores, $13M+ retail revenue by mid-2026, Visa-linked Pengu Card — and **no merch cash to PENGU holders** (Solana Compass, 15 July 2026; Phemex, 27 July 2026). The token is culture. The company is the company. That is the honest split.

**Gamed.** Every meme is gamed (snipers, bundled wallets, wash). That is a launch-mechanics problem, not a utility problem. Do not add a tax, a hidden team allocation you pretend is "utility," or a "holders get 5% of Froggy revenue" line to make it look serious. That last one is how you buy a regulator.

**10x up.** Nice for anyone who holds. Users of the app feel nothing. The risk is the team starts believing the coin is the product and ships a gate "to capture value." Don't.

**10x down.** Users of the app feel nothing. The timeline is ugly. If you promised utility, you now have angry holders and a working product you are tempted to break to appease them. If you never promised it, you still have a working product.

**Verdict for Froggy: this is the only design that does not damage the leash.** It also does not "get traction" by itself. Traction on a meme in 2026 is distribution (X, Farcaster, a video, a frog) plus trading fees. It is not a hold-to-access modal.

---

## Direct answers

### 1. What breaks if we gate the app behind holding 1,000,000 tokens?

**Judges this weekend.** ETHOnline 2026 judging criteria, on the official details page, include Practicality — "Could it be used by its target audience today?" — and Usability (https://ethglobal.com/events/ethonline2026/info/details, fetched 10 September 2026). Async first-round judges and partner judges (Privy, Hedera, The Graph) work from the live URL, the video, and the repo. Kartik Talwar's 2026 in-person events said the quiet part: Cannes opening, 24 April 2026 — if they cannot click a live page and play with the same thing you demo, you do not qualify as a finalist (https://www.youtube.com/watch?v=YwYv3JQU8aA). Lisbon opening, 13 July 2026 — "when you go to the judging on Sunday, we will check if it's live and we will check that we can use it. If we can't, you cannot demo to our judges. You will be sent back" (https://www.youtube.com/watch?v=WhJE0Ag0qco). ETHOnline is remote, so "sent back" is a closed tab. A judge who has to buy a meme to sign in will not. A guest bypass for judges is then a second product you did not have time to test, and the public path is still a lie.

**The pitch.** The whole claim is: a person funds dollars, sets a cap their own key owns, the agent spends real USDC/HBAR on real services, the server cannot widen the cap. A token gate says the opposite on the first screen: you may not use this unless you buy our casino chip. Privy and Hedera judges are not scoring a bonding curve.

**The agent.** MCP/CLI agents (`froggy_x402_request`, `froggy_service_run`) are the product. They have no meme bag. Gating the person's login also gates every connected agent. Gating only the UI and leaving MCP open makes the gate fake. Gating both makes the seller-side x402 story ("other agents pay us") require every counterparty to hold $FROG, which no agent on the rail will do.

**The wallet.** The spend wallet is a Privy embedded account with a tight policy. Putting a memecoin in it means another ERC-20, another approval surface, another "sign this" the person can confuse with an allowance change. Mixing speculative inventory with the pocket the agent pays from is how you get a support nightmare and a confused freeze.

**The number.** 1,000,000 of an unspecified supply is cargo cult. On Clanker's 100B default it is $10 at a $1M FDV and $0.10 at a $10k FDV. On a 1B supply it is 100× more. You cannot even write the gate without picking a supply, and once you pick it the dollar cost is a function of a chart you do not control.

**What happens after the weekend.** See AIXBT and clank.fun above. The gate does not become a moat. It becomes a decaying cover charge or a free ticket for mercenaries.

### 2. Is there a design where the token genuinely improves the product?

**No. Keep them separate.**

The product is a dollar leash on an agent. Every in-band token design above either (a) prices the leash in a unit that moves, (b) charges a cover to use the leash, or (c) skims the already-tiny take to pay holders of a ticker. None of those make "set a cap, watch it spend, freeze it" better.

The designs that **do** improve a product with a token, in the last two years, are designs where the token is doing a job the product already needed:

- **Gas / security:** HYPE is gas on HyperEVM and stake for HyperBFT. Froggy is not a chain.
- **Work token with slashing:** GRT for indexers (100k GRT minimum self-stake). Froggy has no slashing set.
- **USD-priced, token-settled burn:** Render BME. That is a GPU marketplace with node operators to pay. Froggy's suppliers already invoice USDC. Inserting a burn-mint between the person and You.com adds a swap and a failure mode.
- **Fee discount at real scale:** BNB, HYPE. Froggy's fees are cents.

A token can help **the company** without helping **the product**: Clanker/pump.fun creator fees, or a Pudgy-style brand coin that rides attention. That is a treasury event. Call it that. Do not call it utility.

The one later hook that is not a tax, if the marketplace ever has a real take-rate: an **optional** holder discount on Froggy's margin, with list prices unchanged in USDC. Ship it when the discount is more than dust. Not before.

If the honest need is "we want holders to feel like insiders," give them a cosmetic badge, a Telegram role, or a public holder list. That is Discord circa 2022 and it does not touch the leash.

### 3. Smallest possible integration that is honest, ships in a day, and does not damage the product

Do these. Do not do anything else to the app this week.

1. **Launch the coin on Base, not Solana.** The product's EVM money is already native USDC on Base. Clanker (or a Clanker-compatible frontend) deploys an ERC-20, seeds a Uniswap v4 single-sided pool, and pays the creator 80% of those LP fees. Claim URL: `https://www.clanker.world/clanker/<address>/admin`. Do not invent a Solidity token this weekend.
2. **Zero team allocation, or a tiny vested one you disclose in the first post.** Hidden insider bags are how 2025–2026 rugs are recognised (Beosin / Cointelegraph figures in the 29 August 2026 rug-pull roundup; not repeated here as a how-to). Clanker's default is the whole supply in the pool minus an optional creator vault. Use the default.
3. **One page in the app, `/token` or a footer link, that states in plain language:** contract address, chain (Base), "this is a meme, it is not required to use Froggy, judges and agents need zero of it, we do not take a cut of your USDC allowance for holders." Link a Basescan page. Do not put a buy widget on login.
4. **Optional, if it is actually an hour:** a cosmetic badge on the workspace if the **person's** embedded wallet holds any amount. No threshold. No kick. No MCP change. If the RPC call fails, the app still works.
5. **Creator LP fees go to a treasury the team controls, in ETH/USDC, not to a "holder rewards" contract.** That is the Pudgy/Clanker side of the Howey line, not the "fee sharing for this app" sentence. Do not write "holders earn Froggy revenue" on X, in the README, or on the submission form.
6. **Do not** change Privy policies, marketplace prices, x402 `accepts`, guest/judge access, or the MCP skill. Other lanes are committing. A token does not belong in `packages/wallet` or `packages/domain`.

Time-box: an afternoon. If Clanker or the pool does something unexpected, ship the submission without the coin. The deadline is the product, the video, and the live URL.

**Do not launch during the judging click-through if the first thing on the home page becomes a ticker.** A `/token` link in the footer is honest. A modal is a tax.

---

## What "traction" actually is, given three people and three days

The team asked how to launch "properly to get some traction." Utility will not provide it. In 2026 the things that move a new Base meme are: a picture, a clip, a well-known deployer, and traders. Froggy already has a live agent, a frog, and an ETHOnline URL. Use those as the meme's content. Do not make the meme the gate to the content.

What has not worked as traction for a product of this shape:

- Token-gating the product (AIXBT, Friend.tech, clank.fun).
- Points as growth (Blast, LayerZero). Hyperliquid's points worked because they rewarded **using a perps exchange that already had volume**, not visiting a URL.
- "AI agent token" narrative as of 2026: VIRTUAL −87% from January 2025; sector cap −67% within a month of the January 2025 peak (Plisio, 11 June 2026, citing CoinMarketCap Academy). Virtuals still exists; most of its 80,000 agent tokens did not become businesses (Forkast, 22 July 2026, "vast majority of agent tokens are speculative").

What has worked, and is available to a three-person team:

- A working live demo judges can use without a wallet full of your ticker.
- Creator trading fees on Base if people actually trade the coin.
- Brand, not protocol: Pudgy's split (company owns IP and cashflow; token is culture; NFT holders — not token holders — get the merch cut).

If the coin does well, resist the urge to "add utility" under the high. That is how you graft a dead gate onto a live product.

---

## Sources (URL and date)

Primary or near-primary, newest first where it matters. "Fetched" means this research pass on 10 September 2026.

**Froggy / ETHOnline**

- This repo: `docs/decisions/0019-user-owned-policies.md` (production proof 10 September 2026); `docs/evidence/MARKETPLACE.md` (8 September 2026 prices).
- ETHOnline 2026 details: https://ethglobal.com/events/ethonline2026/info/details — submission Sunday 13 September 2026 12:00 pm EDT; judging criteria include Practicality and Usability (fetched 10 September 2026).
- Kartik Talwar, ETHGlobal Cannes opening, 24 April 2026: live URL, judges must play with it — https://www.youtube.com/watch?v=YwYv3JQU8aA
- Kartik Talwar, ETHGlobal Lisbon opening, 13 July 2026: "we will check that we can use it" — https://www.youtube.com/watch?v=WhJE0Ag0qco

**x402 / USDC**

- USDC.org, "What is x402", last updated 1 March 2026, cited accessed 6 September 2026: https://usdc.org/guides/what-is-x402
- x402 Networks & Token Support (any ERC-20 via Permit2; dollar-string defaults to USDC): https://docs.x402.org/core-concepts/network-and-token-support (fetched 10 September 2026)
- Coinbase, "The Next Evolution of x402: ERC-20 Support", 18 March 2026: https://www.coinbase.com/en-ca/developer-platform/discover/launches/x402-ERC20
- Wavect x402 comparison, last verified 2 September 2026 (Stripe live = USDC on Base): https://wavect.io/blog/x402-payments-comparison-2026/
- Bitquery, "x402 Protocol: $2.6B a Month… Almost none of it was AI agents", 6 September 2026: https://bitquery.io/investigations/x402-ai-agent-payments-audit

**Hold-to-access / agent tokens**

- Plisio, "AIXBT Explained", 11 June 2026 (600k gate, $570k → ~$13k, $200/mo added, −98%): https://plisio.net/ai/aixbt
- @aixbt_agent, 12 March 2026: "hold 600k tokens or pay $200/month" — https://x.com/aixbt_agent/status/2032039793308418517
- Bitquery Base Clanker API, 3 September 2026 (clank.fun 1,000,000 $CLANKFUN gate): https://docs.bitquery.io/docs/blockchain/Base/base-clanker-api/
- Messari clank.fun, retrieved 10 September 2026 ($86,915 mcap, −99% from 5 January 2025): https://messari.io/project/clank-fun
- DL News, Friend.tech shutdown, 9 September 2024: https://www.dlnews.com/articles/defi/friend-tech-shuts-down-after-revenue-and-users-plummet/
- Decrypt, Friend.tech admin keys burned, 9 September 2024: https://decrypt.co/248576/friendtech-creators-bail-ethereum-social-platform
- BeInCrypto, Machi Big Brother FRIEND bid, updated 6 September 2026: https://beincrypto.com/machi-big-brother-friend-tech-bid/
- BitKan VIRTUAL daily bars, 10 September 2026 close ~$0.644, ATH $5.14 on 2 January 2025: https://bitkan.com/price/virtuals-protocol/historical-data
- Virtuals launchpad mechanics (42k VIRTUAL graduation, 1% fee, 70/30 split): https://whitepaper.virtuals.io/about-virtuals/agent-tokenization-platform (page reported last updated ~8 days before fetch; also 9 April 2026 snapshot in search)
- @virtuals_io, 12 February 2026, USDC service incentives: https://x.com/virtuals_io/status/2021971168878903699
- @aixbt_agent, 15 May 2026, Virtuals revenue in USDC not token: https://x.com/aixbt_agent/status/2055090561917546668

**Pay-in-token / work tokens**

- HOGE Wire, "Render's Paradox", 30 August 2026: https://hoge.gg/render-paradox-booming-gpu-grid-sinking-token-2026/
- Render Foundation FAQ (USD price, RENDER burn): https://renderfoundation.com/faq (page date 7 July 2026)
- The Graph, GraphTally / x402 USDC at the gateway, 1 July 2026: https://thegraph.com/blog/graphtally-micropayments-machine-economy/
- Coinbird GRT, 10 September 2026 (~$0.018, −81% 1y): https://www.coinbird.com/cryptocurrencies/the-graph/overview
- Cryptomunies, STEPN GMT/GST, 4 May 2026: https://cryptomunies.com/stepn-crypto/
- Naavik, STEPN, 4 July 2022 (older; MAU collapse with GST): https://naavik.co/digest/stepn-rise-fall-future/

**Fee share / discounts / buybacks**

- Hyperliquid fees (staking tiers, AF burn), fetched 10 September 2026: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md
- Coinjuice, HYPE tokenomics, page dated 10 September 2026, inner piece 2 June 2026 ($932M buybacks): https://coinjuice.com/research-hub/hyperliquid-hype-tokenomics-buybacks-explained
- GMX rewards docs (27% buyback, held until $90): https://docs.gmx.io/docs/tokenomics/rewards/
- GMX July 2025 V1 exploit / GLP retired: https://blog.web3wagmi.com/gmx-guide (26 May 2026)
- Uniswap Tally proposal 93 UNIfication: https://www.tally.xyz/gov/uniswap/proposal/93 (proposed 18 December 2025)
- KuCoin/Blockchainreporter on UNI fee switch and price, 14 August 2026: https://www.kucoin.com/news/flash/uniswap-activates-fee-switch-burns-100m-uni-tokens
- CoinDesk BNB page, 27 August 2026 (25% spot discount): https://www.coindesk.com/price/binance-coin
- VanEck BNB ETF prospectus, 22 April 2026: https://www.vaneck.com/us/en/investments/bnb-etf-vbnb/vbnb-prospectus.pdf
- Jupiter token utilities, tokenomics.com, 16 June 2026: https://app.tokenomics.com/tokenomics/jupiter

**Meme creator fees / brand split**

- Clanker creator rewards, docs dated 1 July 2026: https://clanker.gitbook.io/documentation/general/creator-rewards-and-fees
- Clanker Farcaster bot deploys (100B supply, 80% LP fees): https://clanker.gitbook.io/documentation/general/token-deployments/farcaster-bot-deployments
- Messari Tokenbot Clanker, 10 September 2026 (Farcaster fee collapse, Neynar 17 August 2026): https://messari.io/project/tokenbot-clanker
- Alchemii, meme creator revenue, 4 September 2026 (pump.fun August $11.31M): https://www.alchemii.io/blog/how-many-meme-coins-are-created-every-day
- MemeFees pump.fun, DefiLlama snapshot 10 September 2026 13:52 UTC: https://memefees.com/launchpads/pump-fun
- The Defiant, pump.fun custom pairs, 9 September 2026: https://thedefiant.io/news/defi/pump-fun-lets-creators-launch-coins-priced-in-tokenized-stocks
- Phemex, Pudgy merch vs PENGU, 27 July 2026: https://phemex.com/blogs/pudgy-penguins-merch-target-pengu
- Solana Compass, Pudgy, 15 July 2026: https://solanacompass.com/projects/pudgy-penguins

**Points / airdrops**

- CoinDesk, Hyperliquid airdrop, 28 November 2024: https://www.coindesk.com/business/2024/11/28/crypto-exchange-hyper-liquid-to-airdrop-310-m-tokens-to-early-adopters
- The Block, HYPE launch, 29 November 2024: https://www.theblock.co/news/markets/2024-11-29-hyperliquid-airdrops-over-1-2-billion-worth-of-tokens-to-users-as-hype-crosses-4-billion-fdv-328769
- CryptoTimes, Blast −95%, 19 January 2026: https://www.cryptotimes.io/insights/the-2-8-billion-ghost-town-inside-blast-networks-95-collapse/
- The Defiant, Blast TVL, 26 August 2025: https://thedefiant.io/news/blockchains/blast-tvl-plunges-another-30-as-users-abandon-the-network
- Unchained, LayerZero anti-sybil, 3 May 2024: https://unchainedcrypto.com/why-layerzeros-new-anti-sybil-policy-is-getting-both-backlash-and-praise/
- Crypto News Navigator, LayerZero retrospective, 22 March 2026: https://www.cryptonewsnavigator.com/academy/article/layerzero-airdrop-retrospective-shows-what-worked-and-what-didnt
- DL News, airdrops in 2026, 24 December 2025: https://www.dlnews.com/articles/defi/how-crypto-airdrops-will-change-in-2026/

**Howey / 2026 interpretation**

- SEC Release 33-11412, 17 March 2026: https://www.sec.gov/files/rules/interp/2026/33-11412.pdf
- Jim Moloney statement, 17 March 2026: https://www.sec.gov/newsroom/speeches-statements/moloney-statement-book-of-howey-031726
- Buzko Legal practitioner guide, 14 April 2026: https://www.buzko.legal/content-eng/the-sec-cftc-joint-crypto-release-a-practitioners-guide-to-the-new-asset-classification-framework
- crypto.news, Howey explained, 14 July 2026: https://crypto.news/what-is-the-howey-test-crypto-securities-explained/

**Older, still load-bearing**

- Friend.tech and LayerZero 2024 sources above. STEPN 2022 Naavik. These are outside the last 90 days and are labelled as such in the body.

---

## What I could not find out

- **Whether ETHOnline 2026 async partner judges actually log into submitted apps**, or only watch the 2–4 minute video and skim the repo. The written rubric wants a product "used by its target audience today." Kartik's 2026 in-person rule is explicit. The ETHOnline details page does not say "judges will create an account." Treat the live URL as if they will. I did not get a 2026 ETHOnline staff quote on this.
- **AIXBT's spot price on 10 September 2026.** The 600k-gate dollar math uses Plisio's 11 June 2026 print (~$0.022, ~$13k to enter). I did not re-quote CoinGecko at write time. Directionally the token is still a wreck versus January 2025; the exact entry fee today may have moved.
- **Hyperliquid's exact fee-to-burn percentage.** Live docs say AF converts fees to HYPE and burns, and that fees go to HLP + AF + deployers. Secondary 2026 pieces say 95%, 97%, or 99%. The $932M buyback figure is from a 2 June 2026 article republished on a 10 September 2026 page. Do not treat 99% as a protocol constant.
- **Clanker's live fee volume on 10 September 2026.** Messari's Q1–Q3 2026 Farcaster-related fee collapse is the newest hard series I found. I did not pull a Dune dashboard for the last 24 hours of Clanker creator fees.
- **Whether Clanker's 80% creator split still applies to a 10 September 2026 deploy** if you do not use the Farcaster bot. The 1 July 2026 docs distinguish Farcaster-bot deploys (80%) from a configurable creator/protocol table. Confirm on the deploy UI before treating 80% as guaranteed.
- **EU / non-US treatment of a meme launched by a three-person team that also runs a payments app.** The 17 March 2026 SEC/CFTC interpretation is US federal. I am not a lawyer. I did not find a 2026 ESMA or MiCA staff notice that maps "holders get a cut of our app fees" onto a specific article. The conservative operational read is: do not promise holders Froggy revenue.
- **Guest / judge login on production as of tonight.** ADR 0019 shipped person-owned policies on 10 September. I did not re-verify that a cold visitor at https://app-production-58dd.up.railway.app can complete a paid $0.01 search without a pre-existing bag of anything. The product spec from 5 September described a guest door; confirm it still opens before you even joke about a gate.
- **A 2026 example of a small agent-payments app that added a hold-to-access token and kept growing.** I looked. AIXBT, Virtuals agent tokens, Friend.tech, and clank.fun are the named attempts. None are a success story for the product. If one exists at small scale, it is not in the indexed sources I hit today.
- **How much of pump.fun's August 2026 $11.3M creator payout went to coins that also had a working product.** The number is platform-wide. Most of those coins are not products. Do not read it as "launch a token, receive $11M."
- **The team's legal entity, jurisdiction, or whether they already have a ticker.** Out of scope. There is already an unrelated BSC "Froggy (FROGGY)" at froggybsc.com / Forbes scrape 3 September 2026. Name collision is a launch-mechanics problem for the other brief.

End of verdict. The coin can exist. The leash cannot be denominated in it.
