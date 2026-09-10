# Where tokens actually launch — 10 September 2026

For Froggy: a live ETHOnline product on Base and Hedera, three people, Sunday 13 September 18:00 CEST deadline. The team wants a meme coin for traction, plus some way the *app* earns from it (fee sharing, hooks, or a token gate).

## Thirty-second summary

- **Liquidity is not on Base.** On 10 September 2026, tracked launchpad fees were ~59% Robinhood Chain (Pons), ~24% Solana, ~16% BSC, **0.8% Base**. Hedera has no memecoin launchpad with measurable volume. [memefees.com](https://memefees.com/launchpads), fetched 2026-09-10 13:45 UTC.
- **The venue that currently prints money is Pons on Robinhood Chain** (~$5.3M fees / 24h, ~$83.5M curve volume). Pump.fun on Solana is still the attention market for a named product (~$1.41M curve fees, ~$99M volume, plus ~$341M on PumpSwap). FOMO is a *trading app*, not a launcher — do not treat its $1.52M as launchpad revenue.
- **Best creator-fee cut of a live Base venue: o1 Launchpad** (0.50% of every trade in the quote asset, claimable to a recorded address; `claimTo` can redirect). Virtuals pays more on paper (0.70% of volume) but its launchpad is quiet ($17.3K fees / 24h). Clanker and Zora are dead as venues even though their *contracts* still pay.
- **Do not require 1,000,000 tokens to use Froggy.** That is a 2024–25 agent-token gate. It fights the product (embedded wallet + allowance, not keys). Route a creator-fee share to a treasury contract instead.
- **For a three-person team with a working product: one token, on Base, via o1 (USDC pair) if the point is “the app earns”; or on Solana via pump.fun if the point is “traders show up this weekend.”** Do not do both. Do not launch on Hedera. Do not launch on Clanker, Zora, Believe, or Moonshot.

---

## 1. The market as of 10 September 2026

MemeFees snapshot, 13:45 UTC, 10 September 2026 ([source](https://memefees.com/launchpads)):

| Rank | Venue | Chain | Fees 24h | Volume 24h | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | **Pons** | Robinhood Chain | $5.30M | $83.50M* | *V2 curve only; V1 + Uniswap v4 excluded from volume |
| 2 | **FOMO** | Solana | $1.52M | $98.74M | Trading app, not a launchpad. DefiLlama adapter is the wallet |
| 3 | **Flap.sh** | BSC | $1.46M | $34.07M | Irrelevant to Base/Hedera |
| 4 | **pump.fun** | Solana | $1.41M | $99.09M | Curve only. PumpSwap DEX is extra: $341M / 24h |
| 5 | **LetsBONK.fun** | Solana | $250.2K | — | +9211% 7d is a **tracking artefact** (indexed from 2026-09-03), not 92× growth |
| — | **StonkFun** | Solana | $968.3K | — | Listed under “beyond majors”; any-quote LaunchLab |
| — | **o1 Launchpad** | Base + RHC | $134.5K | — | $4.70M / 30d; $2.75M of that on Base |
| 11 | **Bags** | Solana + RHC | $19.6K | — | Best fee-split product, almost no flow |
| 12 | **Virtuals** | Base + Solana | $17.3K | $120.4K | Product-fit, dead flow |
| 14 | **Clanker** | Base | $7.0K | — | Operatorless as of Aug 2026 |
| 15 | **Moonshot** | Solana | $1.3K | — | Now Moonit |
| 17 | **Zora** | Base | $301 | $7.6K | Fees −99% vs Aug 2025 |
| 18 | **Believe** | Solana | $0 | — | Founder sued + arrested; pad idle |

Chain split of launchpad fees (FOMO excluded, same snapshot): **RHC 59.1% / SOL 24.2% / BSC 15.8% / Base 0.8%**.

Launches on 9 September 2026: **107,077** new tokens across 16 pads, of which Pons 25,193 and pump.fun 33,766. Graduations that day: 2,089. Most coins die on the curve.

Pump.fun’s own supply-side (creator fees + cashback) was **$10.96M over 30 days** and **$341.7K in 24h** (MemeFees / DefiLlama, 10 Sep). That is the real creator-fee pool on Solana. It is not evenly distributed: a mid-2026 sample of ~191k Solana launches found **median creator PnL ≈ 0 SOL**, and **34 addresses (0.018%) earned more than ~$7,110** ([toptraders0x, 10 Aug 2026](https://toptraders0x.com/notes/discovery-layer-first-thirty-seconds/)). Treat “we will earn from trading fees” as a tail outcome, not a plan.

SOL ≈ $100, ETH ≈ $2,400, VIRTUAL ≈ $0.64–0.66 on 9–10 September 2026 (Forbes / CoinGecko closes). Use those for dollar conversions below; they move.

---

## 2. Honest chain answer

Froggy settles in USDC on Base and HBAR on Hedera, and is Base-adjacent for ETHGlobal. That does **not** put the meme-trader audience on those chains.

- **Robinhood Chain (Pons)** is where launchpad fees are this month. It is a 90-day-old Arbitrum L2 (mainnet 1 July 2026) with a gas subsidy inside Robinhood Wallet until **29 September 2026 23:59 ET**. Third-party wallets already pay real gas; CoinDesk (3 Sep) and The Defiant (3 Sep) both flag that Pons is independent of Robinhood and that the subsidy does not cover dapp-browser trades.
- **Solana** is still where a *named* product coin gets looked at: pump.fun terminals, GMGN, Axiom, Jupiter. PumpSwap adds ~$341M/day of post-grad volume that MemeFees’ pump.fun row does not include.
- **Base** is 0.8% of launchpad fees. The only Base pad with real money in the last 30 days is **o1** ($2.75M of $4.70M). Clanker, Zora, Flaunch, and Virtuals’ launchpad are not a discovery surface in September 2026.
- **Hedera** has SaucerSwap (a DEX, V3 CLOB live June 2026) and HeadStarter (an IDO whitelist). There is no pump-style pad, no creator-fee stream a three-person team can plug into, and no meme-trader terminal. A Froggy coin launched only as an HTS token will not be traded.

If the token is supposed to *be traded*, pick Solana or Robinhood Chain. If the token is supposed to *sit next to the product and pay the app*, pick Base (o1 or Virtuals) and accept thin flow.

---

## 3. Venues worth the team’s time

Each section: chain, mechanics, cost, what the creator actually gets, liquidity, realistic outcome. Fee-routing to a contract is summarised again in §5.

### 3.1 Pons — Robinhood Chain

**What it is.** Independent factory by Ozzy (@MEADGod). First factory 13 July 2026 after NOXA stopped taking launches. V2 factory from ~3 August. This is the pad that, on 3 September, posted **$5.95M fees in 24h** and ranked fourth among all DefiLlama protocols behind Tether, Uniswap, and Circle ([CoinDesk, 3 Sep 2026](https://www.coindesk.com/tech/2026/09/03/a-memecoin-making-app-becomes-crypto-s-top-fee-generators-as-robinhood-chain-activity-explodes)).

**Mechanics.**

- V1: mint 1B supply + locked Uniswap v3 WETH pool in one tx. “Graduation” at 4.2 ETH paired is a **status flag**, not a migration.
- V2 (current): per-token bonding curve, 1% curve fee, optional creator tax capped by the factory, 99% opening buy tax decaying over ~3 seconds. At the quote-asset threshold the curve is swept into a **Uniswap v4 pool** with hook `PonsV2MemeHook` (`0xe5e702641ea86f4ae6cc3cdaed2b886f976be044`), pool fee 0 (hook takes fees), liquidity permanently locked. Quotes: native ETH, USDG, cbBTC, tokenized stocks/ETFs. Graduation 4.2 ETH for ETH-quoted launches; other quotes have a per-asset threshold. ([Bitquery Pons API, updated 9 Sep 2026](https://docs.bitquery.io/docs/blockchain/robinhood/pons-api/))

**Cost.** 0.0005 ETH launch fee (~$1.20) + gas. Robinhood Wallet users currently have gas sponsored for in-app swaps > $0.50 until 29 Sep; a launch from a normal wallet pays gas.

**Creator cut.** V1 current factory: **70% of the 1% pool fee = 0.70% of volume**, 30% protocol (legacy first-factory tokens keep 90/10). V2: same 70/30 of the 1% plus optional creator tax; fees paid in the quote asset. Protocol share: ~80% of V1 protocol take buys and burns PONS; V2 reportedly spends 50% of the creator’s residual buying the launched token and vesting over five years (The Defiant, 12 Aug 2026 — this V2 buyback detail is from secondary reporting, not Pons docs I could open).

**Claim.** From the Pons UI, any time, in the quote asset. Split is snapshotted at launch and does not change.

**Liquidity.** Locked from block one (V1) or from graduation (V2). You do not seed LP. You do not control LP.

**Realistic outcome.** Pons is a casino for unnamed tickers. Bitquery (4 Sep): 207,893 coins in 32 days, 3,228 filled the reserve (1.6%), half of those in under 4 minutes. A Froggy-branded coin would be one of ~25k daily launches, on a chain Froggy users are not on, with a 90-day gas holiday that ends in 19 days. Creator-fee dollars exist only if the coin is in the 1.6%. Median is zero.

**Froggy fit.** Weak, except that Froggy already lists `pons` as a trade venue. A Pons coin could theoretically be bought in-app. That is not the same as Pons traders finding Froggy.

### 3.2 pump.fun — Solana

**What it is.** Still the named-coin attention market. Curve fees $1.41M / 24h; PumpSwap $341M / 24h. Custom Pairs (tokenized stocks, majors, 93 quote assets) shipped **9 September 2026**.

**Mechanics.** Create a 1B SPL coin on a bonding curve (SOL or USDC since 21 May 2026; Custom Pairs since 9 Sep). Curve fills → migrate to a **canonical PumpSwap** pool. Graduation fee **0.015 SOL**. LP on the canonical pool is protocol-controlled (LP burned to the incinerator on migrate — Alchemii, 24 May 2026). Coins that already migrated to Raydium (pre-PumpSwap era) get **no** creator fees.

**Cost.** 0 SOL to create + network fee.

**Fees** (official page last updated **20 May 2026**, [pump.fun/docs/fees](https://pump.fun/docs/fees)):

Bonding curve (SOL and USDC):

| Creator | Protocol | LP | Total |
| --- | --- | --- | --- |
| 0.300% | 0.95% | 0% | 1.25% |

Canonical PumpSwap, SOL-denominated market cap (price × 1B). Partial table from the same page:

| Market cap | Creator | Protocol | LP | Total |
| --- | --- | --- | --- | --- |
| 0 – 420 SOL | 0.300% | 0.930% | 0.020% | 1.250% |
| 420 – 1,470 SOL | 0.950% | 0.050% | 0.200% | 1.200% |
| 1,470 – 2,460 SOL | 0.900% | 0.050% | 0.200% | 1.150% |
| … declining … | | | | |
| 19,650 – 24,560 SOL | 0.600% | 0.050% | (truncated in fetch) | |

Alchemii (4 Sep 2026) describes the top of the schedule as creator **0.05%** once the coin is large. I did not get the full remaining rows from the clickwrapped docs page; treat 0.05% at the top as second-hand but consistent across two 2026 writeups.

Custom Pairs (9 Sep): same protocol fees; creator sets **0.05%–1%** (form accepts 0.01–1) paid **in the quote asset**, or Cashback (0.3% on the curve / 0.05% after graduation, routed to traders). 50% of Custom Pairs protocol revenue goes to the PUMP buyback-and-burn contract. The May 20 fee page has **no stock-quote tier table** — The Defiant flagged this the day Custom Pairs launched.

**Fee sharing.** Since 9 January 2026: split across **up to 10 wallets**, transfer coin ownership, revoke update authority, assign percentages post-launch. Locks once applied; **one further update** after a community takeover. Custom Pairs inherit this. ([The Block, 9 Jan 2026](https://www.theblock.co/news/markets/2026-01-09-pump-fun-overhauls-creator-fees-token-launches-highest-daily-september-384975); The Defiant, 9 Sep 2026.)

**Claim.** `collectCreatorFee(creator)` / `collectCoinCreatorFee`. **The creator pubkey must sign.** Fees sit in a creator-vault PDA. Unclaimed balances remain. Cashback coins skip the creator vault.

**Sniping.** No protocol-level 99% tax on standard SOL/USDC launches. Custom Pairs and Cashback are the current knobs. Pump.fun is the most sniped venue on earth; a hyped ticker will be bought by bots in the first slots.

**Realistic outcome.** ~33k launches on 9 Sep. Graduation is the exception. If Froggy is a *named* product with a working app and an X account, pump.fun is still the place strangers will look. Creator-fee income is real in the tail (the platform paid $11.3M to creators+cashback in August 2026, all-time high) and ~0 at the median. Do not budget it.

**Froggy fit.** Strong for traction, weak for chain-alignment. Froggy already lists `pump` as a trade venue.

### 3.3 o1 Launchpad — Base (and Robinhood Chain, Monad)

**What it is.** The only Base-native pad with real 30-day fees: **$4.70M / 30d**, of which **$2.75M on Base**, $1.95M on RHC, rounding error on Monad. 24h fees $134.5K on 10 Sep (DefiLlama / MemeFees). On-chain config reread **5 September 2026**. Docs: [docs.o1.exchange](https://docs.o1.exchange/launchpad/introduction).

**Mechanics.** One tx creates a **native B20 token on Base** (no admin) or a fixed-supply ERC-20 on RHC/Monad, plus a Uniswap v4 pool. **1B supply, 18 decimals, full supply into a permanent token-side range.** Opening FDV ≈ $4,000. No bonding curve, no migration. Quotes on Base: ETH, USDC, 8 Coinbase crypto majors, 10 Base stock tokens.

**Cost.** **0.001 ETH** creation fee + gas, regardless of quote asset.

**Fees.** 1% of the paired-asset amount:

| Recipient | Share of the 1% | Of trade |
| --- | --- | --- |
| Creator | 50% | **0.50%** |
| Platform | 30% | 0.30% |
| Referrer | 20% | 0.20% |

No referrer → platform takes the 0.20%. Anti-snipe: **99% → 1% linearly over 20 seconds**; the surcharge above 1% goes to the **platform**, not the creator. Optional atomic Dev Buy pays 1% and **skips** the surcharge.

**Claim.** Balances accrue until claimed, in the quote asset (USDC if you pair USDC). `claimFor` is **permissionless** and always pays the recorded recipient. `claimTo` lets the balance owner send to a chosen address. One inactive recipient cannot block swaps. ([docs.o1.exchange/launchpad/trading/claims](https://docs.o1.exchange/launchpad/trading/claims))

**Liquidity.** Permanent, contract-enforced, no creator deposit. You cannot pull LP.

**Realistic outcome.** o1 is smaller than Pons by ~40× on a 24h-fee basis, but it is the Base pad that is actually alive. A USDC-paired Froggy coin would pay the treasury in USDC, on Base, with locked LP and a 20-second snipe tax. Discovery is whatever o1’s UI and Base terminals show — not pump.fun.

**Froggy fit.** Best Base option for “the app earns.” Set the creator fee recipient to a treasury contract that can receive USDC. Use `claimFor` (anyone can poke it) or have the owner `claimTo` the contract.

### 3.4 Bags — Solana (and Robinhood Chain)

**What it is.** The fee-sharing product. SDK + partner keys + up to **100 fee earners**. Current flow: **$19.6K fees / 24h** (MemeFees, 10 Sep). Cumulative fees were $63.88M as of 31 Aug 2026 ([Meme Central](https://memecentral.fun/guides/what-is-bags)) — that number is stock, not run-rate. 7d fees on 31 Aug were $1.51M; two weeks later the 24h print is $20K. The pad has cooled.

**Mechanics.** Bonding curve → Meteora DAMM v2. Default graduation **~85 SOL**. “SpaceX Mode” (17 Jun 2026): 4% of supply circulating at launch, 96% locked, post-grad fee 2% → 0.5% as market cap grows. Token Launch v2 **requires** an explicit fee-share config; BPS must sum to 10,000.

**Default fee mode** (`fa29606e-5e48-4c37-827f-4b03d58ee23d`):

| Stage | Total | Protocol | Creator | Compounded into LP |
| --- | --- | --- | --- | --- |
| Pre-migration | 2% | 1% | **1%** | — |
| Post-migration | 2% | 0.75% | **0.75%** | 0.5% |

Other modes: 0.25%/1%, 1%/0.25%, 10%/10%, 85% locked, 1K supply, 96% locked with decaying post-grad fee. Chosen at config time, immutable. ([docs.bags.fm customize-token-fees](https://docs.bags.fm/how-to-guides/customize-token-fees), fetched 10 Sep 2026)

**Cost.** Network + an initial buy (examples use 0.01 SOL). Smithii bundler quotes 0.3 SOL to create-and-snipe (21 May 2026 — may be stale).

**Fee sharing.** Creator must be listed explicitly even at 100%. Additional claimers by wallet or by twitter/kick/github username (Bags resolves to a registered wallet). **Partner key** lets a platform take a cut of every launch that includes it — this is the intended “Froggy as a launch partner” hook, except Bags has no flow right now. Admin can update claimers and transfer admin.

**Claim.** Quote-token fees; Bags API v2 claim transactions. Telegram bots print claims of 1–4 SOL on dead coins (10 Sep), which is the actual shape of Bags income today.

**Realistic outcome.** Best *mechanism* for splitting fees to an app treasury. Worst *audience* of the live Solana pads. Launching Froggy here in September 2026 is launching into a quiet room with excellent plumbing.

### 3.5 Virtuals Protocol — Base (Solana agent launch also live)

**What it is.** AI-agent launchpad. Parent token VIRTUAL ~$0.64–0.66, ~$435M mcap on 10 Sep (CoinGecko). Launchpad fees $17.3K / 24h, $120K volume — the *pad* is quiet even though VIRTUAL itself still trades. 44k+ agents historically. Modular launch (ACF, 60 Days, Titan, Fair Launch) shipped June 2026. Solana agent-token offerings reopened 24 Aug 2026.

**Mechanics.** Create an agent (free; some modules cost 10–100 VIRTUAL). Bonding curve in VIRTUAL. Graduation at **42,000 VIRTUAL ≈ $27k** at today’s price. 1B agent tokens minted, paired with the raised VIRTUAL, **LP locked 10 years**. Anti-snipe optional: 99% decaying over 0s / 60s / 10min / 98min, surcharge used to buy the agent token, vested 3-month cliff + 9-month linear to the team. Hyperboost (every graduation after 27 Jul 2026 16:00 UTC): leftover supply dripped 14 days to traders and content. ([whitepaper.virtuals.io launch mechanics](https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/virtuals-launch-mechanics), fetched 10 Sep)

**Fees.** 1% from day one: **70% creator (0.70% of volume), 30% Virtuals treasury.** 60 Days module locks the 70% until the founder commits.

**Fee delegation.** Separate the launcher from the fee recipient. Recipient = X handle or **wallet address**. Accrues until the builder verifies the profile, then they claim. Launcher cannot take delegated fees. ([Fee Delegation docs](https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/fee-delegation-for-ai-agent-token-launches.md))

**Claim.** Platform UI after profile verification. Wallet-address path is the one that can point at a contract; I did not confirm a contract can complete “profile verification.” Flagged in §8.

**Realistic outcome.** Closest *narrative* to Froggy (agent, wallet, paid services). Weakest *flow* of anything still technically alive on Base except Zora. Judges at ETHGlobal will recognise the name. Traders will not find the coin.

### 3.6 Clanker — Base (skip as a venue, keep as a fee primitive)

**What it is.** Farcaster-native Uniswap v4 deployer, v4 live. **Neynar (which owns Farcaster) asked for a new owner of Farcaster + Clanker on 17 August 2026.** Protocol-fee buybacks of CLANKER were **$0 in Q3** after $3.98M in Q1 (Messari project update, 10 Sep 2026). MemeFees: **$7.0K fees / 24h**.

**Mechanics still work.** 100B ERC-20, full (or residual) supply into a single-sided Uniswap v4 LP. Creator fee 1/2/3% of swaps on *that* initial LP only; Clanker takes 20% on top (so 1.2 / 2.4 / 3.6% total). Up to **7 reward recipients**, BPS must sum to 10,000, each with an admin who can change *that* recipient but not the BPS. Rewards in Clanker token, paired token (WETH), or both. Vault / airdrop / dev-buy extensions. MEV: block delay, max n+11. Claim is **permissionless**; funds go to the recipient, not the caller. ([Clanker docs](https://clanker.gitbook.io/documentation/general/creator-rewards-and-fees); [v4 intro](https://paragraph.com/@dish/introducing-clanker-v4))

**Why skip.** No operator, no discovery, no buybacks, Farcaster fee collapse. The SDK is still the cleanest Base primitive for “pay a contract 80% of LP fees in WETH.” If the team wanted a *custom* Uniswap v4 launch with Clanker’s locker and their own frontend, that is an engineering project, not a weekend launch.

### 3.7 Zora coins — Base (and Solana, RHC)

**What it is.** Content/creator coins. Coinbase CEO said the content-coin experiment “didn’t work” (The Defiant, 13 Jul 2026). Zora Base fees **$14,768 in August 2026 vs $2.51M in August 2025 (−99.4%)**. 24h fees 10 Sep: **$301**. Headcount < 10; new CEO Dee Goens 9 Sep 2026, buybacks named as a priority.

**Mechanics that still exist.** Creator Coin (one per profile, 1B, 50% to creator over 5 years, 50% in pool, paired to ZORA). Content Coin (post-level, paired to the creator coin). Trend Coin (0.01%, no creator cut). **Custom Pairs** (20 Aug 2026): pick ETH/USDC/stock/Solana token; 1% fee, **0.70% creator / 0.25% protocol / 0.05% Doppler** on Base. Sniper tax 99% → 1% over **10 seconds**. V4 hook auto-converts and **pushes rewards on every swap** to `payoutRecipient`. ([docs.zora.co/coins/contracts/rewards](https://docs.zora.co/coins/contracts/rewards); [support.zora.co rewards](https://support.zora.co/en/articles/2509953), edited 12 Aug 2026)

**Froggy fit.** Custom Pairs is a fine *contract* (0.70% auto-paid to a payout address, which can be a contract). It is not a *venue*. Do not launch a product token into a social app that the Base lead and the Coinbase CEO have walked away from.

### 3.8 StonkFun + Raydium LaunchLab — Solana

**What it is.** StonkFun is a LaunchLab front-end that lets you pair a new coin with **any quote** (SOL, ZEC, wBTC, xStocks, another StonkFun coin). Raydium announced any-pair LaunchLab on **6 September 2026**; StonkFun was the first integration. StonkFun 24h fees **$968K** (MemeFees “beyond majors”). LaunchLab itself $56.3K / 24h.

**Mechanics.** Token-2022, 1B, 6 decimals, LaunchLab curve, graduate to Raydium CPMM at ~85 SOL of *quote*. Standard mode: **1% fee, 50/50 creator/platform = 0.50% of volume** in the quote asset ([stonkfun.xyz/launch](https://www.stonkfun.xyz/launch), 9 Sep). Reward-token mode uses a 1% or 3% transfer tax (taxes *transfers*, not just swaps). Deploy **~0.03 SOL** (down from 0.29 SOL).

**Creator-fee catch.** DefiLlama’s StonkFun adapter says StonkFun **claims the CPMM creator fee as pool creator** after graduation. Read that twice: on graduated pools, the *platform* may be the creator-of-record. Pre-grad 0.50% is the number the launch page advertises. Post-grad, verify `pool_creator` on the CPMM config before treating it as Froggy revenue. Raydium’s 17 Aug 2026 upgrade also moved locked-LP Fee Keys from the creator to the **platform** for new migrations.

**Froggy fit.** Interesting if you want a USDC- or stock-quoted Solana coin with 0.50% to a wallet. Worse discovery than pump.fun, better quote-asset flexibility. Confirm post-grad creator-of-record in writing before using it as a treasury.

### 3.9 Jupiter Studio — Solana

**Mechanics.** Meme mode: USDC quote, 5k → 75k mcap, ~15.4k USDC raised, no vesting. Custom: quote SOL or USDC, vesting 0–80% of 1B supply, 6 or 12 months, optional cliff. 1% lifetime fee, **50/50 creator/Jupiter = 0.50%**. Anti-snipe 99% → 0 over a **random 15–60s**, **100% of that surcharge to the creator**. Claim from the deployer wallet on the Studio page. LP locked. ([docs.jup.ag Studio](https://docs.jup.ag/user-docs/launch/studio), 5 Aug 2026)

**Flow.** MemeFees: **$383 / 24h**. Skip as a venue. Keep in mind as the cleanest “vested team allocation + 0.50% fee + Jupiter routing” if they ever want a structured Solana launch with no pump.fun casino attached.

### 3.10 Flaunch — Base / Robinhood

Uniswap v4 fair launch, 30-minute fixed-price window, **1% fee, 0–100% to creator in ETH**, rest to a progressive bid wall. Protocol takes 0 unless FLAY governance turns on a ≤10% switch. Claimable ETH in the header above 0.001 ETH. Dune (updated ~25 Aug): **$107M all-time volume, Ξ162 withdrawn by creators** — not nothing historically, not a 2026-Q3 venue. Not on the MemeFees 24h leaderboard. Skip unless they want to own the fee NFT and ignore discovery.

### 3.11 LetsBONK.fun — Solana

Raydium LaunchLab white-label. 1% swap fee, currently routed mostly to Bonk, Inc. (Nasdaq: BNKK) “Buy for BNKK” (51%) plus staking/marketing/dev (Cryptonews.net, 1 Sep 2026). Creator fees were slashed toward 0% in “BONK Classic” (14 Jan 2026) with a separate “BONKERS” path for higher creator take. **Not a fee-sharing venue for an app treasury.** The +9211% 7d on MemeFees is a new indexer, not a renaissance. Skip.

---

## 4. Venues that are not worth the time

| Venue | Why skip (dated) |
| --- | --- |
| **Believe / Launchcoin** | MemeFees **$0** fees. Class action filed 23 Mar 2026 (SDNY) alleging ~$54M extracted and a 33% dilution on the Oct 2025 LAUNCHCOIN→BELIEVE migration. Founder Ben Pasternak arrested Apr 2026 (assault charges, pleaded not guilty). Official @believeapp last original post 13 Jan 2026 per the complaint. Tweet-to-launch is a 2025 story. |
| **Moonshot / Moonit** | $1.3K fees / 24h. DexScreener’s pad. 1% taker fee, 2 SOL / 0.1 ETH migration, LP locked. After 2 Apr 2026, Meteora AirLock rewards go to the **creator wallet**, not top-50 holders. Nobody is looking here. |
| **daos.fun** | Not a meme pad. Approval-gated **fund DAOs**. 1B tokens, 850M sold in a 7-day capped raise, 150M + 80% of SOL seed a Meteora DAMM v2 pool (1% fee: Meteora 0.2%, daos.fun 0.8% of which 50% = **0.40% of volume** to the creator). Homepage featured “agents” on 10 Sep were $1.3k–$1.6k mcap. ai16z was the 2024 outlier, not a 2026 playbook. |
| **Base App coins** | Base ended Creator Rewards (Feb 2026) and Jesse Pollak / Brian Armstrong have both said the content-coin push failed. New program (2 Sep 2026) is **$4,000 cash grants for content**, not tradable coins. |
| **Hedera / SaucerSwap / HeadStarter** | DEX + IDO whitelist. $3,000 LP to get default-list on SaucerSwap (HeadStarter process, Dec 2025). No creator-fee launchpad, no meme terminal, no volume a Froggy coin would see. Keep HBAR as a *settlement* rail. |
| **four.meme (BSC), Flap.sh, NOXA, pools.trade** | Wrong chain or residual. pools.trade (Uniswap Labs, 5 Aug 2026, RHC) is structurally interesting (0.25% LP fee, optional 0.05pp creator, $0 protocol take) but $26.8K / 24h and not Base. |

---

## 5. Creator fee sharing — the matrix the team asked for

“Can the app earn from the token?” maps to three questions: **rate**, **split to multiple parties**, **can the money land in a contract**.

| Venue | Creator rate (of trade) | Split N ways | Paid in | Claim | Contract as recipient? |
| --- | --- | --- | --- | --- | --- |
| **Pons V1/V2** | 0.70% of 1% pool (optional extra tax on V2) | No documented N-way split | Quote asset (ETH/USDG/stock) | UI, any time | **Unknown.** Fee wallet is set at deploy. An EVM contract that can receive ERC-20/ETH should work as the fee wallet; I did not read a Pons restriction. |
| **pump.fun** | 0.30% on curve; 0.30%→~0.95%→~0.05% on PumpSwap by mcap; Custom Pairs 0.05–1% | **Up to 10 wallets**, lock + 1 CTO update | SOL / USDC / quote | `collectCreatorFee`, **creator must sign** | **Uncertain.** Vault is a PDA of the creator pubkey; collect requires that pubkey’s signature. A fee-share *recipient* can be any pubkey (a PDA can hold SOL). A program cannot sign `collectCreatorFee` unless they make a program the `creator`. Do not assume a treasury program can *claim* without a signer. |
| **o1** | **0.50%** (50% of 1%) | Referrer is a separate 0.20%; no N-way creator split | Quote (set USDC) | Permissionless `claimFor` → recorded recipient; owner `claimTo` any address | **Yes.** Record the treasury as recipient, or `claimTo` it. Recipient only needs to receive the ERC-20. |
| **Bags** | **1.00%** pre / **0.75%** post (default mode) | **Up to 100**, explicit BPS, partner key for platforms | Quote (usually SOL) | API claim txs | **Probably yes** as a PublicKey that can hold SOL. Partner-key path is designed for a platform cut. Confirm a program-owned account can submit the claim ix. |
| **Virtuals** | **0.70%** (70% of 1%) | Fee Delegation: one builder identity (X or wallet), not N-way | VIRTUAL (then claimable) | UI after profile verify | **Wallet path: maybe. X-handle path: no.** Profile verification is the blocker for a mute contract. |
| **Clanker v4** | 1–3% of swaps on the *initial* LP (not later pools) | **Up to 7**, BPS immutable, admin can rotate recipient | WETH / token / both | Permissionless; pays recipient | **Yes.** Recipient is an address. This is the cleanest Base primitive. |
| **Zora Custom Pairs** | **0.70%** of 1% | No N-way; payoutRecipient + protocol + Doppler | Auto-swapped; Custom Pairs skip ZORA hops | V4: **pushed on every swap** | **Yes.** `payoutRecipient` can be a contract that accepts the token. |
| **Zora Creator/Content** | 0.50% of 1% (0.5pp) | Referrals are separate | ZORA, auto | Auto | Same, but paid in ZORA. |
| **Jupiter Studio** | 0.50% + 100% of anti-snipe surcharge | No | USDC/SOL | Deployer wallet on Studio page | **Likely no** without the deployer being a wallet that can click Claim. |
| **StonkFun standard** | 0.50% on the curve | No | Quote | LaunchLab `ClaimCreatorFee` | Same Solana-signer problem as pump. Post-grad, StonkFun may be pool creator. |
| **Flaunch** | 0–100% of 1%, in ETH | Immutable split vs bid-wall | ETH | Header claim, NFT-gated | Transfer the revenue NFT to a contract. |
| **daos.fun** | 0.40% of volume | Referrer 5% of daos.fun’s cut | SOL | Not documented here | Skip. |
| **LetsBONK Classic** | ~0% | n/a | n/a | n/a | Skip. |
| **Moonshot/Moonit** | LP rewards to creator after 2 Apr 2026 (Meteora path) | No | SOL | Airdropped | Skip. |
| **Believe** | Was ~1% of 2% (50/50), claimable daily | Scout cut existed | SOL | Idle | Do not touch. |

**Hooks.** The team said “hooks or shit like that.” On Base, creator fees *are* Uniswap v4 hooks: o1 `LaunchHook`, Zora `ZoraV4CoinHook`, Clanker dynamic-fee hook, Pons `PonsV2MemeHook`, Flaunch. You do not write a custom hook this week. You pick a factory whose hook already pays an address you control.

---

## 6. The “1 million tokens to use the app” idea

Do not do this.

- The only live analogue is **clank.fun’s 1,000,000 $CLANKFUN to *launch***, not to use an app (Bitquery Base Clanker API, 3 Sep 2026 — and that page still describes the older 0.4% Uniswap v3 number, which is stale vs Clanker v4).
- Froggy’s pitch is: embedded wallet, person-owned Privy policy, allowance not keys. A token gate reintroduces a key-shaped object (you must already be in the casino) and will be read as a 2024 agent-token farm.
- Circular demand: need the token to use the app, need the app to give the token demand. Three people cannot bootstrap that before Sunday.
- If they want *some* token utility after a launch: (a) route creator fees to a treasury that pays inference/x402 costs, (b) optional fee discount for holders, (c) a holder-only cosmetic. Never a hard gate on chat.

Fee sharing **from the coin’s trading** into the app is the integration that matches the product. Token-gating the product is the integration that fights it.

---

## 7. Ranked recommendation (three people, real product, this week)

**Constraint:** ETHOnline deadline is Sunday 13 September 18:00 CEST. A token can be deployed in minutes on any of these pads. App integration cannot. Pick a venue whose fee recipient is an address you already control, and ship the rest after the deadline.

### Rank 1 — o1 on Base, USDC pair, treasury as creator

Do this if the point is “Froggy earns, on our chain, with locked LP, without looking like a Pons shitcoin.”

- 0.001 ETH to create. 1B B20, no admin, full supply locked in a v4 range. Opening FDV ~$4,000.
- **0.50% of every trade in USDC** to a recorded recipient. Permissionless `claimFor`. `claimTo` if you need to move it.
- 20-second 99%→1% snipe tax (surcharge to o1, not to you). Optional atomic Dev Buy at 1%.
- Base-native for ETHGlobal. o1 is the only Base pad with millions of dollars of 30-day fees.
- **Do not expect Pons- or pump-scale attention.** $134K/day of *platform* fees is the whole pad.

### Rank 2 — pump.fun on Solana, fee-share 10 wallets

Do this if the point is “strangers trade a Froggy ticker this weekend.”

- 0 SOL to create. Named-product coins still get looked at here. Custom Pairs (stocks/USDC) are 24 hours old — do not be the guinea pig unless you want quote-asset fees in NVDA.
- Split creator fees across team wallets + a Solana treasury address (up to 10). Accept that **claiming the vault needs a signer**.
- Median creator earns 0. Have an X account, a live URL ([app-production-58dd.up.railway.app](https://app-production-58dd.up.railway.app)), and a one-sentence product. That is the only edge versus 33k daily deploys.
- Chain mismatch with the product is real. Say it in the tweet: “fees on Solana, product on Base.”

### Rank 3 — Virtuals on Base, fee-delegated to a wallet

Do this if the point is the ETHGlobal *story* (AI agent, paid services, locked LP) more than traders.

- 0.70% of volume, 10-year LP lock, optional anti-snipe that vests sniper tax to the team.
- Fee Delegation to a wallet you control. Do not use the X-handle path for a treasury.
- Launchpad is quiet. VIRTUAL itself is a $435M token; that does not make an agent coin liquid.

### Do not

- Two tokens (a “serious” Base coin and a “meme” Solana coin). Three people cannot support both.
- Clanker, Zora, Believe, Moonshot, daos.fun, LetsBONK, Hedera.
- Token-gate the app.
- Pons, unless someone on the team is already living in that casino *and* accepts that 98.4% of coins never fill the reserve.

### If they insist the app itself is a launch *partner*

Bags’ partner-key is the documented pattern (platform cut on every launch that includes the key). Bags has no volume. Building “Froggy Launch” on Clanker v4 / o1 / Zora Custom Pairs as a *seller of launches over x402* is a post-hackathon product, not a Sunday task. It is also closer to what Froggy already is (buyer and seller on the same rail) than launching one more ticker.

---

## 8. What I could not find out

- **Pons V2 official docs** (creator-tax cap, V2 buyback/vesting of the launched token, whether the fee wallet may be a contract). Bitquery, Messari, CoinDesk, The Defiant, and MemeFees disagree on V1-vs-V2 emphasis. I did not get a first-party Pons fee page equivalent to pump.fun’s.
- **Full PumpSwap tier table** past 19,650 SOL. Official page is clickwrapped; May 20 2026 update is the last dated schedule. Custom Pairs have **no published mcap-tier table** as of 9 Sep.
- **Whether a Solana program / PDA can both receive and *claim* pump.fun or Bags creator fees** without a human signer. Pump’s `collectCreatorFee` requires the creator to sign. Bags claim ixs were not executed in this research.
- **Virtuals: can a contract complete fee-delegation claim?** Docs allow a wallet address; claim still goes through “verify the linked profile.”
- **StonkFun post-grad creator-of-record.** Launch page says 0.50% to you. DefiLlama adapter says StonkFun claims CPMM creator fees as pool creator. These can both be true for different modes. Not resolved.
- **Believe’s remaining on-chain fee stream.** DefiLlama still prints $42 / 24h on the LAUNCHCOIN adapter in one view and MemeFees prints $0. I did not reconcile. Do not use the pad either way.
- **Hedera memecoin flow in 2026.** I found no pad, no creator-fee program, and no terminal. Absence of evidence, not a proof that nothing exists — but nothing with volume showed up in MemeFees, DefiLlama, or the last-90-day search.
- **Median creator earnings on o1, Pons, Bags, Virtuals.** Only pump.fun-adjacent samples (toptraders0x, Alchemii) quantified the median-is-zero fact. Other pads publish *platform* fees, not per-creator distributions.
- **LetsBONK current creator rate per launch mode.** The 1 Sep 2026 fee dashboard is almost entirely BNKK/treasury. I could not find a live “creator %” for a standard LetsBONK launch today.
- **o1 B20 token standard** beyond “native B20, no administrator.” Compatibility with Froggy’s existing Base ERC-20 assumptions (Privy, x402, Uniswap) is unverified here.
- **Robinhood Chain after 29 September 2026**, when the in-app gas subsidy ends. Pons economics may change in three weeks. Nobody has a measurement.

---

## 9. Sources

Primary / dated. Accessed 10 September 2026 unless noted.

**Market prints**

- [MemeFees launchpad rankings](https://memefees.com/launchpads) — 2026-09-10 13:45 UTC
- [MemeFees launches per day](https://memefees.com/stats/launches) — 2026-09-10 13:23 UTC
- [MemeFees pump.fun](https://memefees.com/launchpads/pump-fun) — 2026-09-10 13:51 UTC
- [MemeFees FOMO](https://memefees.com/launchpads/fomo) — 2026-09-10 13:08 UTC (adapter caveat)
- [DefiLlama o1 Launchpad](https://defillama.com/protocol/o1-launchpad) — 30d $4.7M fees
- [DefiLlama StonkFun](https://defillama.com/protocol/stonkfun) — 30d $6.16M fees
- [CoinGecko VIRTUAL historical](https://www.coingecko.com/en/coins/virtual-protocol/historical_data) — 2026-09-09 close $0.661

**pump.fun**

- [pump.fun/docs/fees](https://pump.fun/docs/fees) — last updated 20 May 2026
- [pump-fun/pump-public-docs PUMP_CREATOR_FEE_README](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_CREATOR_FEE_README.md) — collectCreatorFee requires creator signature
- [The Defiant, Custom Pairs](https://thedefiant.io/news/defi/pump-fun-lets-creators-launch-coins-priced-in-tokenized-stocks) — 9 Sep 2026
- [The Block, fee sharing](https://www.theblock.co/news/markets/2026-01-09-pump-fun-overhauls-creator-fees-token-launches-highest-daily-september-384975) — 9 Jan 2026
- [Alchemii, daily coin count / creator payouts](https://www.alchemii.io/blog/how-many-meme-coins-are-created-every-day) — 4 Sep 2026
- [Alchemii, PumpSwap](https://www.alchemii.io/blog/what-is-pumpswap) — 24 May 2026 (updated language as of Sep 2026)

**Pons / Robinhood Chain**

- [Bitquery Pons API](https://docs.bitquery.io/docs/blockchain/robinhood/pons-api/) — 9 Sep 2026
- [CoinDesk, Pons $5.95M day](https://www.coindesk.com/tech/2026/09/03/a-memecoin-making-app-becomes-crypto-s-top-fee-generators-as-robinhood-chain-activity-explodes) — 3 Sep 2026
- [The Defiant, pump share vs Pons](https://thedefiant.io/news/defi/pump-fun-launchpad-fee-share-falls-robinhood-chain-pons-noxa) — 12 Aug 2026
- [The Defiant, RHC gas](https://thedefiant.io/news/blockchains/robinhood-chain-gas-fees-jump-82-fold-in-11-days-to-top-every-other-chain) — 3 Sep 2026
- [Messari, Pons](https://messari.io/project/pons-launchpad/profile)
- [MemeFees Pons](https://memefees.com/launchpads/pons)

**o1**

- [o1 introduction](https://docs.o1.exchange/launchpad/introduction) — config reread 5 Sep 2026
- [o1 fees, anti-snipe, referrals](https://docs.o1.exchange/launchpad/trading/fees-referrals)
- [o1 claims](https://docs.o1.exchange/launchpad/trading/claims)
- [o1 live configuration](https://docs.o1.exchange/launchpad/reference/live-configuration.md) — 5 Sep 2026

**Bags**

- [Customize token fees](https://docs.bags.fm/how-to-guides/customize-token-fees)
- [Launch a token (fee share v2)](https://docs.bags.fm/how-to-guides/launch-token)
- [Meme Central, Bags](https://memecentral.fun/guides/what-is-bags) — 31 Aug 2026
- [@finnbags, SpaceX Mode](https://x.com/finnbags/status/2067110195420131702) — 17 Jun 2026

**Virtuals**

- [Launch mechanics](https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/virtuals-launch-mechanics)
- [Fee Delegation](https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/fee-delegation-for-ai-agent-token-launches.md)
- [KuCoin, modular launches](https://www.kucoin.com/news/flash/virtuals-protocol-launches-modular-token-launch-options-for-crypto-founders) — 8 Jun 2026

**Clanker / Zora / Base**

- [Clanker creator rewards](https://clanker.gitbook.io/documentation/general/creator-rewards-and-fees) — last updated ~1 Jul 2026
- [Clanker FAQ (permissionless claim)](https://clanker.gitbook.io/documentation/general/faq)
- [Introducing Clanker v4](https://paragraph.com/@dish/introducing-clanker-v4)
- [Messari CLANKER, Neynar sale](https://messari.io/project/tokenbot-clanker) — update 10 Sep 2026
- [Zora rewards (docs)](https://docs.zora.co/coins/contracts/rewards)
- [Zora rewards (support)](https://support.zora.co/en/articles/2509953) — edited 12 Aug 2026
- [BitcoinEthereumNews, Zora CEO / −99% fees](https://bitcoinethereumnews.com/tech/zora-co-founder-dee-goens-replaces-jacob-horne-as-ceo/) — 9 Sep 2026
- [The Defiant, Armstrong on content coins](https://thedefiant.io/news/blockchains/coinbase-ceo-says-base-s-content-coins-didn-t-work) — 13 Jul 2026
- [crypto.news, Base creator grants](https://crypto.news/base-launches-creator-grant-program-with-up-to-4000-for-creators/) — 2 Sep 2026

**Others**

- [daos.fun liquidity/fees](https://docs.daos.fun/docs/liquidity) — docs dated 7 Jan 2026
- [Moonshot FAQ](https://docs.moonshot.cc/faq) (redirects to Moonit)
- [Jupiter Studio launching a token](https://docs.jup.ag/user-docs/launch/studio/launching-a-token) — 5 Aug 2026
- [Raydium LaunchLab creator fees](https://docs.raydium.io/products/launchlab/creator-fees) — 14 Aug 2026 (17 Aug upgrade)
- [StonkFun launch](https://www.stonkfun.xyz/launch) — 9 Sep 2026
- [crypto.news, LaunchLab any-pair](https://crypto.news/raydium-launchlab-adds-support-for-any-token-pair-on-solana/) — 7 Sep 2026
- [Flaunch FAQ](https://docs.flaunch.gg/protocol/frequently-asked-questions)
- [Solana Compass, Believe](https://solanacompass.com/projects/believe_app) — 10 Sep 2026
- [crypto.news, Believe class action](https://crypto.news/class-action-claims-believe-founder-collected-54m-while-diluting-token-holders/) — 29 Apr 2026
- [toptraders0x, median creator PnL](https://toptraders0x.com/notes/discovery-layer-first-thirty-seconds/) — 10 Aug 2026
- [TechFlow, PONS dethrones pump.fun](https://www.techflowpost.com/en-US/article/33875) — 10 Sep 2026
