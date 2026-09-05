# Pivot assessment: the KIMI ideas versus the agentic wallet (FABLE51)

Written Sat 5 Sep 2026, morning. Validates `IDEAS.md` (round 3, "Allowance"), `IDEAS_KIMI.md` (v2: I Told You So, No Flake, Darepot) and `IDEAS_V3_KIMI.md` (SquadPot, Payback, SecondOpinion, PAYDAY, kill list) against the same evidence base as `RESEARCH_FABLE51.md`. Companion docs: `PRODUCT_FABLE51.md` (what we build), `TARGET_GROUPS_FABLE51.md`, `PRIZE_AUDIT_FABLE51.md`, `BUILD_IN_PUBLIC_FABLE51.md`, `DAY0_CHECKLIST_FABLE51.md`. Full red-team digests: `research_FABLE51/pivot-*_FABLE51.md`.

Not legal advice. Statute text quoted below was fetched from primary sources on 4-5 Sep 2026 and is marked VERIFIED; applications of it to the design are INFERRED.

---

## 0. Decision

**Do not pivot.** Build the agentic wallet (shared Chrome you can watch, grab and freeze; a prefunded pocket whose rules live outside the model; Graph-grounded spend; Hedera x402 via Blocky402), using the consumer vocabulary `IDEAS.md` proposed (pocket, allowance, lunch money; never "give the AI your wallet").

Take four things from the KIMI rounds and nothing else:

1. **The shareable artifact discipline.** Every settlement and every blocked attempt renders a card (receipt card, blocked card) with the explorer link and the policy id. This is the verdict-card idea applied to the product we can actually ship.
2. **A public adversarial stunt with no pot.** "Try to make my agent pay 0xevil"; every blocked attempt is credited by handle on a public board. This is the Freysa format, the only stunt shape the research verified travels, without the gambling exposure of a house pot.
3. **The paid-verdict endpoint as the Hedera service.** SecondOpinion's "$2 report behind x402" is the right shape; ours sells a Graph-grounded lending brief for 0.05 tHBAR through Blocky402.
4. **Dated kill checks.** The KIMI day-3 kill criterion becomes two cut lines (section 8).

SquadPot, No Flake, Payback and Darepot are not buildable this week as consumer products with money in them. The blockers are legal (verified statute text, section 2), evidentiary (testnet stakes are not stakes, so the product testers touch is not the product being pitched), and structural (their testers are groups of non-crypto friends; the referee is an LLM in the money path). The honest version of each (testnet, no rake, free-entry prizes) removes the thing that made them viral on paper.

---

## 1. How this was judged

- Four candidates were steelmanned by one agent each (best 60-second demo, sponsor map, custody, tester path, nine-day cut), then red-teamed by five independent lenses: **prize rules** (literal ETHOnline 2026 track text), **legal** (Germany, Slovenia, EU; primary sources fetched: GlüStV 2021 §3/§4/§21, §284/§285 StGB, §762 and §§339-345 BGB, BVerwG 8 C 26.12, Slovenian ZIS Arts 2/3/5/6/7/10/53/110/111, KZ-1 čl. 212, MiCA Arts 2/3 and Recitals 21/22/83, EU AI Act Art. 50, GDPR Arts 6/13/14/17, RDG §§2/6, Telegram Bot Developer Terms, Privy ToS/AUP, Anthropic AUP, Ninth Circuit Amazon v. Perplexity), **feasibility** (hours versus 2-3 people in the days left), **testers and virality** (who signs up by 12 Sep, through which channel, at what friction), **safety and trust** (who authorizes money movement, what a prompt-injected or wrong model can reach).
- Each lens returned a verdict and a score out of 10. The comparative judging for goal A (prizes) and goal B (testers) and this memo were written by me after the subagent budget ran out; that is a limitation, not a hidden one.

| Candidate | Prize rules | Legal | Feasibility | Testers | Safety | Mean |
|---|---|---|---|---|---|---|
| Agentic wallet (Direction 1, refined) | 6.5 | 8.0 | 7.0 | 5.0 | 7.0 | 6.7 |
| Allowance (same architecture, consumer framing) | 7.0 | 8.5 | 7.0 | 5.0 | 8.0 | **7.1** |
| SquadPot / I Told You So | 6.0 | 7.0 | 6.5 | 4.0 | 6.0 | 5.9 |
| No Flake | 5.0 | 8.0 | 5.5 | 4.0 | 6.0 | 5.7 |

Agentic wallet and Allowance are one architecture; Allowance scores higher because it drops the subscription-killer hero, drops "opt-in mainnet mode for testers", and uses vocabulary that flips hostility. `PRODUCT_FABLE51.md` merges them.

**Goal A (prize tracks).** Wallet > SquadPot > No Flake. Only the wallet makes all three locked sponsors load-bearing in one demo and meets each qualification text literally (Hedera: hosted x402 service settled through Blocky402, paid request on screen; Graph: one Messari query across pinned deployments plus a second Graph product; Privy: a completed policy-gated transfer plus typed-data x402). SquadPot's Graph story only exists for on-chain claims and its Privy story runs on the team's own wallets; No Flake's Graph story is a subgraph over its own testnet contract, the weakest qualifying shape.

**Goal B (testers by 13 Sep).** All four score at most 5. No candidate reaches strangers before Tue-Wed. The difference: the wallet's testers are individually addressable developers and peer sellers who have a reason to reply this week; the pivots' testers are groups of non-crypto friends who need Telegram, a counterparty and a reason to stake play money.

---

## 2. SquadPot / I Told You So (IDEAS_KIMI idea 1, IDEAS_V3 rank 1)

**The steelman.** A Telegram bot plus web app: two friends each lock $1-10 into an on-chain Pot on Base Sepolia, an AI referee behind a Hedera x402 paywall researches the claim (Messari lending data for on-chain claims, web evidence otherwise), signs a verdict the contract can only execute in favour of a participant or as a refund, and posts a verdict card with the HashScan receipt into the chat. Public "House Pot" stunt on Jonas's account with $5 real prizes. Best red-team scores: legal 7, feasibility 6.5.

**What kills it, in order.**

1. **Gambling law, verified text.** GlüStV 2021 §3(1): "Wetten gegen Entgelt auf den Eintritt oder Ausgang eines zukünftigen Ereignisses sind Glücksspiele" and "Die Entscheidung über den Gewinn hängt in jedem Fall vom Zufall ab, wenn dafür der ungewisse Eintritt oder Ausgang zukünftiger Ereignisse maßgeblich ist". §3(2): a bot anyone can add to a group is an open circle, so it is public. §4(4): internet permits exist only for lotteries, sports bets, horse bets, casino, slots, poker; "Im Übrigen sind das Veranstalten und das Vermitteln öffentlicher Glücksspiele im Internet verboten." §4(1) S.2 bans "die Mitwirkung an Zahlungen" (the relayer). §284(1) StGB punishes whoever "die Einrichtungen hierzu bereitstellt" (the contract and the bot), §284(4) punishes advertising it (the build-in-public posts), §285 punishes participants (German testers). Profit is not an element. Slovenia: ZIS Art. 2 counts "kakšnega negotovega dogodka" (any uncertain event), Art. 3 makes organising a state monopoly under concession, Art. 6 bans accepting payments or advertising for unlicensed games, Arts. 110-111 fine 30,000-250,000 EUR (legal person) and 1,500-5,000 EUR (individual); KZ-1 čl. 212 adds up to three years. Consequences: **the IDEAS_KIMI "legal guardrails" table is wrong for DE/SI.** "Skill framing" is statutorily excluded for future-event bets; "no rake" is irrelevant because the offence is providing the facility; "P2P settlement between self-custodial wallets" does not help; "the team's own group runs real stakes all week" is not the private exception it looks like (§284(2) StGB reaches habitual games in closed societies). The only legal configuration is worthless testnet tokens and a free-entry prize pool, and that must be a hard invariant (contract pinned to chain 84532 and the test-USDC address, no redemption path ever).
2. **Testnet stakes are not stakes.** The candidate's own consent copy says "test dollars only, no real money in bets". A $5 stake nobody loses does not solve the pain the IDEAS files name (welching, no consequence). The product testers touch is "an AI names the loser", not "money moves because the AI ruled". Testers score 4/10 for this reason alone.
3. **The referee is an LLM in the money path and a public paid service at the same time.** As designed, anyone who pays 0.5 tHBAR (free on testnet) can call the verdict endpoint for any pot; if the body carries the claim or evidence, the caller supplies the evidence and walks away with a signed verdict for a pot they are party to; LLM nondeterminism means paying N times until the answer flips. The EIP-3009 stake-in signature is bound to the contract but not to the pot id, so a relayer can move a user's $10 into a pot with an accomplice. The 1-hour Void is decorative once the payout has landed in a wallet the user owns. This is the pattern the research spine says never to build (an LLM classifier as the signing gate).
4. **The Graph is load-bearing for one claim category only.** Friend-drama claims use web evidence; the leaderboard subgraph over our own Pot events is exactly the disqualified "one Subgraph with no composition" pattern. To qualify, the demo bet must be a cross-protocol DeFi-rate claim, which is not what friend groups bet on; non-resolvable claims end in VOID, which testers read as "the bot does not work".
5. **The tester is a pair on Telegram.** A lone tester from X or Discord cannot use a two-party pot. German and Slovenian friend groups are mostly on WhatsApp or Viber (INFERRED). The stake-in on a phone runs Privy's iframe wallet inside Telegram's in-app browser, unverified. Hosting is a day-2 dependency (the Telegram Login Widget needs the domain set via BotFather), not day 6. No external tester can touch a complete loop before Thu 10, and the day-3 kill check is scheduled before the verdict card can exist.
6. **Personal data.** Rulings on identifiable third parties who never consented ("he gets back with his ex"), a named loser on a public card, claim text on an immutable HCS topic: GDPR Art. 6(1)(f) balancing and Art. 17 erasure both fail. Telegram's Bot Developer Terms restrict crypto functionality to TON (raised by the No Flake legal lens; applies to any bot exposing wallets).
7. **Hours.** The never-cut build is 125-165 engineer-hours before the House Pot stunt, tester support and rework; it fits three people with margin and two people only if the cut list runs on Tuesday.

**What survives.** The verdict card (as receipt and blocked cards), the paid-verdict endpoint (as the brief service), the "dollars on screen" instinct (as pocket vocabulary), and the kill-check discipline.

---

## 3. No Flake (IDEAS_KIMI idea 2)

**The steelman.** Everyone stakes $10 to a plan; the agent polls, buys venue data per query on Hedera, books the table in a Chrome you can watch and grab, and on the night refunds whoever checks in and splits the flake's stake among the people who showed up. It is the only pivot that uses every asset the team already architected. Best red-team score: legal 8.

**What kills it.**

1. **A tester is a group, not a person.** Every channel we can reach yields individuals. Nobody adds a hackathon bot to a real friend group, gets two friends through Telegram OAuth plus Privy plus a stake, and physically meets, for a stranger's testnet demo inside a three-day window. Realistic tester count by 12 Sep: the team's own friends.
2. **Booking sites and datacenter IPs.** Verified 4 Sep from a residential IP: thefork.de and thefork.com return 403 with `x-datadome: protected` to a headless Chrome UA; opentable.com and opentable.de returned nothing at all; quandoo.de returns 200 but its terms could not be read and it covers Germany, not Slovenia. Nothing was tested from a Hetzner IP or through a DataDome or Turnstile challenge. The one beat that uses the shared Chrome is the single point of failure, and its fallback (our own reservation page) deletes the point of the idea.
3. **Testnet forfeits have no sting**, so the core behavioural claim ("stakes make people show up") cannot be validated this week; the flake card "Jonas lost $10" is literally false.
4. **The attendance oracle is soft in both directions.** Telegram `request_location` works in private chats only, with `horizontal_accuracy` up to 1500 m; a 150 m radius in a basement restaurant misfires; a fake-GPS app, checking in at the door, or an organizer who pins the venue to their own flat all pass. The false positive (a present friend publicly named a flake and charged) is the reputational disaster.
5. **The Graph leg is the weakest qualifying shape**: a self-authored subgraph over our own testnet contract, mirroring state the app already holds, with Studio indexing latency put in the booking's critical path for a fact the RPC already knows.
6. **"Legally the cleanest" is overstated.** Paying the no-show's stake out to the attendees is upside that depends on an uncertain event outside the recipient's control, funded from participants' deposits; that is the fact pattern the BVerwG "Einsatz" test and ZIS Art. 2 reach. Fine on testnet, redesign (forfeit to the bill or a charity) before any real-money version.
7. **Privy cannot constrain the split.** The policy can pin `to = escrow` and `function_name in {settle, refundAll}`, but the attendee bitmap is an argument the agent chooses; "the referee cannot change the split" would be an overclaim a Privy judge can falsify. The organizer also types a restaurant password into a Chrome on our box.

**What survives.** Nothing structural. The "human grabs the page to log in" beat is already the wallet's grab beat; "escrow plus policied arbiter" is a post-hackathon primitive.

---

## 4. Allowance (IDEAS.md round 3)

**What is right.** Same architecture, so no pivot cost. The pocket/allowance vocabulary flips the "give the AI your wallet" hostility the research measured. The "Break the Leash" public stunt with no pot is the right stunt. "On command and while you sleep" (a scheduled worker that pages the human) is the retention shape the research found survives.

**What is wrong.**

1. **The subscription-killer hero fails on three verified facts**: Google OAuth and passkeys are unreliable inside a headless server Chrome; there is no primitive that revokes a merchant's ability to charge a card; no merchant takes testnet money. The hero chore in `PRODUCT_FABLE51.md` is a Graph-grounded lending brief bought on Hedera instead: mainnet data, testnet money, the only configuration that feels real before mainnet.
2. **It is not mass-consumer.** The "$20" is a metaphor over testnet HBAR and a red team will say so. The audience is crypto-curious prosumers and developers; non-crypto shoppers scored 8/25 in the segment research and are skipped this window.
3. **The adjacent sponsors it lists cost the fourth partner slot that does not exist** (up to three partners per project; a partner with multiple tracks counts once). Ledger requires building on the Ledger Key Ring CLI, so a Privy wallet does not count. ENS, World and Bazantic are out.
4. **Group-expense settling as "feature #2" is scope creep** for a nine-day build; it is not in the plan.
5. **Fifteen testers is the top of what the evidence supports.** The only comparable measured funnel (Sippy, ETHOnline 2025 finalist, real USDC in Colombia: 294 users, 46% activated, 18% retention) suggests 8-15 sign-ups, 4-8 first receipts, 2-4 day-2 returns for a testnet product recruited through crypto-dev channels with no sponsor amplification.

**Red-team fixes adopted into the product spec.** A Privy stateful aggregation without a per-wallet scope sums across every wallet in the app (fifteen testers would share one daily budget); the daily cap must be per wallet or the demo runs on one wallet. Freeze semantics: the server-side frozen flag is the real gate (agent access tokens can live up to 15 minutes); removing the agent signer requires the wallet owner's authority, and the hard stop for a host compromise is rotating the app's authorization key. The leash is enforced against the model, not against the box: app secret, agent key, pocket keys, bot token and Anthropic key on one host means a host compromise loosens every wallet; say so in the honesty box. Graph deployment freshness must be probed on day 1, not day 3. The Privy transfer must complete on screen; a denial alone is not "a completed functional financial flow".

**Verdict.** Adopt the framing, the stunt and the retention shape; drop the hero chore, the adjacent sponsors and feature #2.

---

## 5. The other KIMI ideas (screened, not red-teamed in depth)

| Idea | Verdict | Why |
|---|---|---|
| **Payback** (flight-compensation claims; IDEAS_V3 rank 2) | No | If the agent files, it is claims management under the RDG; the v3 constraint "agent prepares, user taps send" leaves a form-filler that MateFull and Settlemate already ship at 0% fee. No Graph fit, no browser need, Hedera fit only as a paid data endpoint. The "public stunt with followers' real flight data" is a GDPR problem on a personal X account. |
| **SecondOpinion** (repair-quote autopsy; rank 3) | No as a product, yes as a shape | Cleanest legal profile and lowest build risk, but no browser, no Graph, and the Privy flow is "pay $2". Its x402 paid-report endpoint is exactly our Hedera brief service, so the shape is kept. |
| **Darepot** (IDEAS_KIMI idea 3) | No | 18+ gating that is not verification, curated-only challenges, vision judging of photos, the highest moderation and minor-safety exposure of the set, and no agentic act that uses the browser or the wallet policy. |
| **PAYDAY** (creator escrow; v3 sleeper) | No | B2B creator pain with weak top-of-funnel; a team-held key over pooled funds plus fees is the MiCA grey zone the safety research flags; it would fit Privy B2B and nothing else. |
| v3 kill list (FightBack, FORFEIT, DatePilot, DinnerVote, Kitty, StakeStudy, CramPay, Hammerlock, SquadStake) | Accepted as killed | The stated reasons hold; nothing in our evidence reopens them. |

---

## 6. What the KIMI rounds got right

- Money must be invisible in the UI: pocket, allowance, dollars-shaped balances, no chain words in consumer copy.
- The receipt is the viral artifact; the product should render its own share cards.
- A public stunt on the builder's personal account beats waiting for sponsor org accounts, which do not amplify mid-event.
- Kill criteria with a date beat optimism.
- "Money moves because the AI ruled" is a strong beat. Ours is "money moves because The Graph said so, inside a Privy policy", which is the same beat with a deterministic decider.

## 7. What the KIMI rounds got wrong (do not cite in the submission)

- The legal guardrails table (skill framing, no-rake, P2P defensible): wrong for Germany and Slovenia, see section 2.
- "$100 house pot with real stakes" and "the team's own group runs real stakes all week": criminal exposure in both countries.
- Partiful, Polymarket, StepBet and Sora numbers: not verified against the research spine, and none proves a friend-scale referee spreads.
- "10 real test users from group chats in 48h": plausible for this team, unverified, and it produces group-shaped testers that do not feed sponsor judges.
- World, ENS and Bazantic as "sleeper adds": each costs a partner slot.
- "Graph subgraph over bet or verdict events": the explicitly disqualified single-subgraph pattern.
- "The AI referee is the actual novelty": it is an LLM in the money path, which is the thing every 2026 incident (Bankr, the $3,400 proxy loop) warns against.

---

## 8. Kill criteria for the chosen path

- **Tue 8 Sep 22:00 CEST.** If no stranger has a receipt from the hosted URL, public testers are cut to judge mode plus peers paid by our agent; build-in-public switches to clips and repo links only. All five tracks still qualify.
- **Wed 9 Sep 22:00 CEST.** Any red core item (browser isolation, Hedera settlement, four-deployment Graph, Privy denial, Privy top-up, freeze) cancels every stretch item; Thursday becomes a fix day.
- **If the browser slips past Wed.** Testers get the workspace at concurrency 1 with a queue; the video records on the reserved judge worker. The one-liner keeps the browser only if it is on screen at 0:00 of the video.

## 9. Evidence

- `research_FABLE51/pivot-agentic_wallet_FABLE51.md`, `pivot-allowance_FABLE51.md`, `pivot-squadpot_FABLE51.md`, `pivot-noflake_FABLE51.md`: steelman plus five red-team lenses each, with sources.
- `research_FABLE51/panel-*_FABLE51.md`: six product designs (prize-first, user-first, contrarian, build-in-public-first, engineering-first, CEO), three judge panels, the synthesis and two refutations that produced `PRODUCT_FABLE51.md`.
- `RESEARCH_FABLE51.md` sections 2 (rules), 4 (technical verification), 5 (market), 7 (segments), 9 (prize EV).
