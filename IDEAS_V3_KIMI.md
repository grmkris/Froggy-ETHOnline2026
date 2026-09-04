# IDEAS v3 — KIMI research mega-round (4 Sep 2026)

Two swarm runs, 26 research agents total:
- **Run 1** (16 agents): pain-point mining across 16 consumer domains (travel,
  housing, jobs, dating, pets, fitness, parents, students, cars, food, events,
  resale, bureaucracy, creators, gaming, home services) — real Reddit/TikTok/X
  complaints with sources.
- **Run 2** (10 agents): cross-validation — 4 feasibility red-teams, virality
  red-team, legal red-team, prize-fit verifier (against the actual prize board
  in `prizes.md`), competitor red-team, audience-reach analyst, judge/demo
  red-team.

Prior rounds: [`IDEAS.md`](./IDEAS.md) (v1), [`IDEAS_KIMI.md`](./IDEAS_KIMI.md) (v2).

---

## 1. The pain catalog — best pain per domain, with evidence

| Domain | Sharpest pain found | Proof it hurts |
|---|---|---|
| Travel | EU261 compensation: airlines wrongly reject **52% of valid claims**; AirHelp skims 35–50%, takes 8–24 months | [AirHelp analysis](https://www.thetraveler.org/airlines-wrongly-reject-over-half-of-valid-uk-flight-compensation-claims-airhelp-finds/) |
| Housing | **26% of renters have lost a deposit**, 36% with no explanation; landlord-confrontation TikToks go viral on their own | [RapidEye](https://rapideyeinspections.com/research/security-deposit-statistics/) |
| Jobs | Ghost jobs: **27% of LinkedIn listings likely fake**; funnel reality is ~85 applications → 1 offer | [Entrepreneur](https://www.entrepreneur.com/business-news/one-quarter-of-jobs-posted-online-are-fake-ghost-jobs-study/496683) |
| Dating | ~80% report dating-app burnout; Tea hit #1 App Store then leaked 72k IDs — safety demand proven, trustworthy version doesn't exist | [WJCL](https://www.wjcl.com/article/swiping-fatigue-why-more-singles-say-dating-apps-are-leaving-them-burned-out/70326383), [Wikipedia](https://en.wikipedia.org/wiki/Tea_(app)) |
| Pets | Vet bill shock: avg $392/visit (+32% since 2020); "economic euthanasia" at the ~$3,000 tipping point | [CBS](https://www.cbsnews.com/news/how-high-pet-care-costs-strain-finances/) |
| Fitness | Habit collapse at day ~18–22; Fitbod makes $2M/mo just answering "what do I train today" | [habitcoach](https://habitcoach.ai/blog/why-most-people-quit-after-3-weeks) |
| Parents | "Venmo parenting": one organizer fronts cash and chases 30 parents for teacher gifts/team dues | [SF Moms](https://sanfranciscomoms.com/parenting/school-aged/why-you-should-skip-venmo-for-this-years-teacher-appreciation-class-gift/) |
| Students | Group-project freeloaders: universal rage, zero consequence mechanism exists anywhere | viral [Inc. coverage](https://www.inc.com/kit-eaton/a-reddit-rant-calling-out-uneven-workloads-just-went-viral/91210712) |
| Cars | Repair-quote distrust: people post invoices line-by-line begging strangers "is this a ripoff?" | [The Autopian](https://www.theautopian.com/we-took-a-375000-mile-nyc-taxi-to-a-dealership-for-inspection-and-the-repair-quote-was-astronomical-partner-post/) |
| Food | Delivery fee rage: $15 fees on $35 orders; Canada sued DoorDash over ~$1B in drip pricing | [KOMO](https://komonews.com/news/local/seattle-food-delivery-drivers-customers-app-based-fees-tax-city-council-andrew-lewis-lisa-herbold-business-president-sara-nelson-washington-king-county-doordash-uber-eats-instacart-grubhub) |
| Events | Ticket scams/scalpers: Oasis dynamic-pricing CMA investigation; 50k fans' resale tickets cancelled | [WalesOnline](https://www.walesonline.co.uk/whats-on/music-nightlife-news/fans-livid-oasis-tickets-cancelled-30971531) |
| Resale | Depop **1.3/5 on 6,769 reviews**; closet worth $500+ unsold because listing grind is miserable | [Vendoo](https://blog.vendoo.co/real-depop-reviews-for-resellers-should-you-sell-on-depop) |
| Bureaucracy | Insurance denials: <1% appeal, **~75% of appeals win**; UHC's condolence post got 72k "haha" reacts | [KFF](https://www.kff.org/affordable-care-act/issue-brief/consumer-survey-highlights-problems-with-denied-health-insurance-claims/) |
| Creators | **56% face late brand payments**; a creator missed a mortgage payment over blown Net-60s | [Digiday](https://digiday.com/marketing/in-a-booming-influencer-economy-creators-seek-standardization-for-payment-terms/) |
| Gaming | LFG no-shows: **66% of matches ghost/no-show**; zero accountability mechanism exists | [Connex](https://connex.games/) |
| Home services | Paid the deposit, contractor vanished; Angi paid **$7.2M FTC redress** for fake leads | [ABC7](https://abc7chicago.com/post/suburban-homeowners-say-facebook-contractor-didnt-complete-work/4519416/) |

## 2. The kill list — validated dead ends (don't relitigate)

| Concept | Killed by | Why |
|---|---|---|
| FightBack (insurance appeals) | feasibility + legal + demo | CPT data is licensed IP, HIPAA, multi-week resolution can't demo; already solved free (FightHealthInsurance, Counterforce Health) despite top virality |
| FORFEIT (fitness stakes) | competitor + name | Forfeit.app is a funded product doing exactly this; judges will Google it in 4 seconds |
| DatePilot (staked dates) | feasibility | venues unbookable on stage, attendance unverifiable, collusion-proof nothing |
| DinnerVote | feasibility | no API to place consumer food orders as a third party — core agentic act blocked |
| Kitty (parent collections) | virality + competitor | "automated parent-shaming" backfires on the builder; Cheddar Up/Zeffy solved collection |
| StakeStudy | virality + demo | one-trick campus joke; weakest verification surface |
| CramPay (notes market) | legal | P2P notes marketplace = university copyright/IP hostility + DMCA |
| Hammerlock (contractor escrow) | feasibility | real contractors don't answer bots; 3-quote collection is unfakeable theater |
| SquadStake (gaming stakes) | audience | gamers are historically hostile to anything blockchain-adjacent — "invisible" won't survive a public build |

## 3. The survivors — cross-validation matrix

Scores: ✅ strong · ⚠️ mixed · ❌ weak, across the 5 validators.

| Concept | Feasibility | Virality | Legal | Competition | Demo wow |
|---|---|---|---|---|---|
| **Payback** (flight claims agent) | ⚠️ best data (AeroDataBox free tier), but must NOT auto-send claims | ✅ #2 virality, Tier-S audience | ⚠️ claims-mgmt licensing if agent files; green if "user taps send" | ❌ MateFull/Settlemate already ship 0%-fee AI claims | ✅ "everyone in this terminal is owed €600" |
| **SquadPot** ("I Told You So" referee) | ✅ viable scoped: own x402 merchant as the "venue" | ⚠️ verdict card strong; pot itself weak | ✅ green if no rake + forfeits to charity/return | ✅ EMPTY — friend-bet apps all died from no enforcement; the AI referee IS the fix | ✅ #2 — money moves because the AI ruled |
| **PAYDAY** (creator escrow) | ✅ strongest of all 16 — full real loop demo-able day 7 | ❌ B2B creator pain, low scroll-stop | ⚠️ escrow fine if bilateral purpose-bound | ⚠️ Passionfroot/Lumanu are brand-side; creator-protection angle open | ⚠️ strong IF settlement is live P2P |
| **SecondOpinion** (car quote autopsy) | ✅ lowest build risk of all 16 (hand-curated benchmark table + vision OCR) | ✅ proven mechanic-rage genre | ✅ consumer info, near-zero exposure | ✅ BROKEN INCUMBENT — RepairPal has data but no agent | ❌ reads as a comparison form unless staged well |
| **GhostBuster** (ghost-job detector) | ✅ submission-driven, no scraping | ✅ daily "exposed company" engine | ⚠️ defamation-flavored leaderboard — label "community-reported" | ✅ nobody consumerizes this | ❌ detection-only = "a list" |
| **Boomerang** (deposit escrow) | ⚠️ 21-day statutory window forces a compressed timer demo | ✅ landlord rage is proven | ⚠️ two-sided adoption; escrow OK per FinCEN FIN-2014-R004 | ⚠️ Rhino/Jetty merged & crowded — but nobody agents the *dispute* | ⚠️ payoff is paperwork, not a visual moment |
| **SellCloset** (closet-selling agent) | ❌ FB/Poshmark automation is ToS-blocked; internal board fake | ⚠️ low-arousal "nice" content | ✅ | ⚠️ Flyp/Vendoo buggy but exist | ❌ real sale can't close in-week |

## 4. Prize-board reality check (verified against prizes.md)

- **Hedera x402 ($6k)**: must HOST a live Blocky402-settled x402-gated service +
  an agent making ≥1 real paid request. "We accept payments" is not enough —
  the product must expose a paid endpoint (e.g. verdict API, claim-check API).
- **The Graph ($15k)**: mocked/static data explicitly disqualified; a single
  plain subgraph query disqualified. Only claim if the agent reasons over live
  provider data.
- **Arc ($10k)**: mainnet opens **Sept 16 — after the Sept 13 deadline**;
  claim "testnet + deployment-ready."
- **World ($7k)**: AgentKit is Continuity-only; new teams get Selfie Check
  ($3.5k, needs a feedback document).
- **Ledger ($5k)**: must use `wallet-cli ring` (Key Ring CLI); a Privy wallet
  integration does NOT count.
- **ENS ($5k)**: ENSv2 on Sepolia only, central not cosmetic.
- **Uniswap ($5k)** & 1inch ($7k): natural fits for none of the survivors —
  don't bolt on, judges clock it.
- **Bazantic ($3k)**: cheap ~1-day bolt-on (x402 recipe) for any winner.

## 5. Final ranking

### 🥇 1. SquadPot — "the group-chat referee that settles it in dollars"
*(evolution of v2's "I Told You So")*
The only concept that is **empty competitively** (friend-bet apps all died
precisely because nobody enforced settlement), **Tier-S audience** (students/
nightlife groups — the team can recruit 10 real test users from group chats in
48h), top-3 demo (money moves *because the AI ruled*, verdict card = viral
artifact), and the widest **legitimate** prize stack: Privy (financial flow),
Hedera (x402-gated verdict oracle = a real hosted service), The Graph (live
verdict leaderboard), World (one-human-one-stake), ENSv2 (referee agent
namespace), Bazantic. Legal-safe with the no-rake + charity/return-forfeit
rules. The build-in-public engine writes itself: the agent referees real X
disputes all week with $5 payouts.

### 🥈 2. Payback — "everyone in this terminal is owed €600"
Best raw virality + Tier-S audience + best data situation, but two constraints
are non-negotiable: the agent **prepares** the claim and the **user taps send**
(claims-management licensing), and differentiate hard from MateFull/Settlemate
on the agent-acts-live spectacle. Strong as a fallback or as SquadPot's
"public mission" during build week.

### 🥉 3. SecondOpinion — "is this quote BS?"
The dark horse: lowest build risk, cleanest legal profile, broken incumbents,
and a natural x402 paywall ($2 full report = the Hedera-hosted service). Weak
demo wow unless staged as a live "quote autopsy" series with followers' real
quotes — which is also a proven viral genre. Best risk-hedge if SquadPot's
social logistics wobble.

**Sleeper: PAYDAY.** If the team decides virality matters less than a
flawless full-loop demo (real escrow, real release, real 30% tax-vault sweep —
all doable by day 7), this is the safest prize-harvesting build. Weak top-of-
funnel, though.

## 6. Recommended play

Build **SquadPot** as hero. Use **Payback's claim-filing as the referee's
public stunt** during build week (the agent researches and rules on followers'
real disputes — flight-compensation disputes included). Keep **SecondOpinion's
x402 paid-verdict endpoint** as the Hedera service. One architecture: stakes
escrow + agent verdict + instant settlement + public verdict ledger.

Day-3 kill criterion (unchanged philosophy): if 5 non-crypto friends don't say
"send me this" to the verdict card, pivot the demo to SecondOpinion's pure
x402 flow — the contracts and wallets carry over.
