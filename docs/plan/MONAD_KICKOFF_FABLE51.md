# Monad hackathon kickoff

Base document for the next hackathon after ETHOnline 2026. It collects everything the team has said or written about the Monad hackathon ("Monathon") and the consumer betting concept that goes with it, cleaned up from the 6 Sep call transcript, the meeting notes, the KIMI idea rounds of 4 Sep, and the 5 Sep pivot assessment. Jonas owns this file and extends it by hand. It will seed the new repository.

Status on 8 Sep 2026: concept only. No write-up existed before this file, no repository, no registration recorded, no dates verified.

---

## 1. What we know about the hackathon itself

Everything here comes from Jonas's own words on the 6 Sep call. Nothing has been checked against the Monad event page yet.

- Name used by the team: Monathon, the Monad hackathon.
- Structure as Jonas described it: four tracks. The top three teams on any track each get 10K. Small sponsor bounties exist on top.
- Team stance: ignore the small sponsor bounties, aim at the main track.
- Timing: the ETHOnline build ran with "about seven days remaining" on 6 Sep, and Monad comes after it. Exact start, submission deadline and judging dates are unknown.
- Kristjan's earlier brainstorm summary (before 4 Sep) already noted "gaming ideas parked for Monad or another hackathon". Monad was the planned home for the consumer game idea from the start.
- Group chat aside from the 6 Sep overnight session: ref.tools was mentioned as something to use for planning a future hackathon.

To fill in from the event page:

- Registration and team size rules, and whether a project must be new work.
- Track names and the exact wording of each track. Jonas mentioned a consumer track.
- Submission deadline in CEST and EEST, judging format, demo length.
- Which Monad primitives count for eligibility (mainnet or testnet, required contracts, required sponsors).
- Sponsor list and bounty sizes, even though the main track is the target.

---

## 2. How the concept got here

| Date | Event | Result |
| --- | --- | --- |
| Before 4 Sep | Three-way brainstorm with Kristjan and Hemang for ETHOnline | Gaming and betting concept dropped for ETHOnline, parked "for Monad or another hackathon" |
| 4 Sep | KIMI research rounds v2 and v3 | Friend-stakes-plus-AI-referee primitive worked out in three modes: I Told You So (later SquadPot), No Flake, Darepot |
| 5 Sep | Pivot assessment | Decision: no pivot for ETHOnline. Gambling-law text fetched and found to make real-money friend stakes unlicensable in Germany and Slovenia |
| 6 Sep 13:08 EEST | Call, Jonas and Kristjan, recorded by Gemini | Jonas pitched the fitness-commitment plus fact-check game for Monad. Kristjan: write it down, discuss after Froggy stabilises |
| 6 Sep, later | Iteration 3 plan | Monad write-up and the X account assigned to Jonas. The fitness project stays out of the Froggy repository |

---

## 3. The concept as pitched on 6 Sep

Jonas's pitch, cleaned up from the transcript at 00:59 to 01:01.

**Commitment bets on fitness goals.** A user commits to a measurable goal. Examples used: run 15 km a week, or do 10 push-ups every day for seven out of the next ten days. The user bets money on themselves. Friends bet with or against. The pot is split among friends, or handled the way cap.fun does it.

**Proof from the phone.** Push-ups tracked with the mobile device, or health data pulled from Apple Health. Kristjan has apparently built something along these lines before, which Jonas referenced on the call.

**Second mechanic, the fact-check game.** Someone in the group makes a claim. Everyone stakes on whether it is true. The agent fact-checks it in the background and settles.

**The shared piece, an AI referee in the group chat.** An agent joins the group chat or a similar surface, acts as referee, handles all the payments, and runs the game.

**Audience.** The younger generation, "the TikTok generation". Goal is social interaction between friends, not finance.

**Kristjan's reaction.** Positive, wants it written down first and discussed once Froggy is stable. Both agreed it must not be folded into Froggy.

**Jonas's action item from the call.** Write the idea down and brainstorm further.

---

## 4. Prior concept work to reuse (KIMI rounds, 4 Sep)

The KIMI research rounds were built for ETHOnline and rejected there for sponsor fit. The concept itself is the same one Jonas pitched for Monad, so the material carries over.

### 4.1 The one-sentence primitive

Friends stake dollars on something. An AI agent is the referee, escrow and settler. The verdict receipt is the viral artifact.

Money stays invisible: embedded wallets, balances shown in dollars, stablecoins underneath. The AI is real: it researches, verifies photo or video evidence, judges, pays. The shareable moment is the transaction.

### 4.2 Mode 1, "I Told You So" / SquadPot (KIMI hero, matches the fact-check game)

- A bot plus web app that lives in the group chat. Someone makes a claim, someone says "bet", both stake a small amount, the agent locks the terms, researches or monitors the outcome, posts an evidence-backed ruling and a verdict card naming the loser, and moves the money.
- Pain: friend bets die from forgotten terms, welching and no neutral judge. Prediction markets went mainstream but are trading venues, nobody owns the friend-scale layer.
- Viral loop: the verdict card (claim, stakes, evidence, loser, payout) shared to X or the chat in one tap. The agent has a deadpan personality.
- Sixty-second demo: group chat, "$20 says Jonas flakes on Portugal again", stakes locked, agent monitors, ruling with evidence plus verdict card, payout lands in dollars, card shared.
- Retention: streaks, group leaderboards, small stakes so losing never stings, void options, group seasons.
- KIMI v3 called this the only concept that is empty competitively, because every friend-bet app died from no enforcement and the referee is the fix.

### 4.3 Mode 2, "No Flake" (commitment stakes, matches the fitness idea's mechanics)

- Everyone stakes to a plan. Show up and get it back, flake and the group splits your stake. Attendance verified by check-in or photo.
- Legally the cleanest of the three: deposits returned, outcome is skill or attendance, not chance.
- Weakness: episodic rather than daily, and the booking step was fragile.

### 4.4 Mode 3, "Darepot" (daily challenges, the retention layer)

- Platform-curated daily challenges, never free-form user dares. Friends join with $1 to $5 stakes, submit photo or video proof, a vision model judges instantly, the pot pays out.
- Challenge culture is TikTok's native language. The AI verdict on a real photo is the shareable moment.
- Highest moderation and minor-safety exposure: must be 18+, curated only, geo-gated.
- KIMI's recommendation: one primitive, three modes, one brand. Hero is the referee, No Flake as a second stakes mode, Darepot as the daily loop.

### 4.5 Target audience from KIMI

- Beachhead: 18 to 28 friend groups who live in group chats. Students and young professionals who already screenshot everything and already say "bet".
- Gender-balanced by design. Sports-only framing caps the audience at roughly 80 percent male; group-life bets are broader.
- Acquisition: the group chat the product lives in, plus X and TikTok for verdict cards. Zero install: the bot joins the chat, wallets appear invisibly.
- Separate build-in-public audience: crypto and AI Twitter watching the referee rule on real disputes.

### 4.6 Build-in-public hooks from KIMI

1. "The Referee is live": people submit real friend disputes, the agent rules publicly with evidence.
2. Verdict card gallery: a public feed of the week's funniest rulings.
3. House pot: the team's own group runs real stakes all week, daily standings posted.
4. "It can't be bribed": try to prompt-inject the referee into flipping a verdict or overpaying, blocked live.

### 4.7 Kill criterion from KIMI

By day 3, the verdict card must make at least five non-crypto friends say "send me this". If not, fall back to the most architecture-complete demo.

### 4.8 Adjacent ideas from KIMI v3 worth remembering

- Payback: flight-compensation claims agent. Strong virality, but the user must tap send on any claim.
- SecondOpinion: "is this repair quote BS", lowest build risk, natural paid-report endpoint.
- The KIMI v3 kill list explicitly killed a pure fitness-stakes app named FORFEIT because Forfeit.app is a funded product doing exactly that and "judges will Google it in 4 seconds". The fitness idea needs a differentiator beyond stakes on workouts. The group referee and the social layer are the candidates.

### 4.9 Market numbers KIMI cited

Cited in the KIMI rounds, not verified by the 5 Sep research spine. Treat as leads, re-verify before using in a pitch.

- Partiful reached a 140M dollar valuation on friend-group coordination.
- Kalshi plus Polymarket did 44B dollars of volume in 2025.
- StepBet and DietBet paid out 148.9M dollars on commitment stakes.
- Forfeit reported 94 percent completion with AI vision verification. StepBet reported 73 percent adherence with money at stake against 12 to 18 percent for tracking only.
- Duolingo's streak wager lifted day-7 retention by 14 percent. Habit collapse happens around day 18 to 22.
- 35 percent of TikTok users join challenges.

---

## 5. Legal guardrails (must shape the Monad design)

### 5.1 KIMI legal scan, summary rules

- Safe: stakes returned in full (deposit mechanics), sponsor-funded prizes with free entry, skill-based outcomes under 10 dollars, money that never changes ownership between users except pre-agreed peer-to-peer settlement between self-custodial wallets.
- Careful: peer-to-peer settlement between friends' own wallets with no custody and no rake, forfeits routed to a pre-chosen friend or charity.
- Never: any rake on friend wagers (unlicensed bookmaking), chance-based money games, custodial pooling, user-submitted dares for money (Blackout-Challenge liability), minors.
- Hackathon shape: caps of 1 to 10 dollars, no fees, skill or contest framing, geofence the restricted US states later.

### 5.2 Verified statute text from the 5 Sep pivot assessment

The pivot assessment fetched the primary sources. This is the hard constraint for the fitness and fact-check bets.

- Germany, GlüStV 2021 §3(1): bets against payment on the occurrence or outcome of a future event are gambling, and the decision is deemed to depend on chance whenever an uncertain future event is decisive. §3(2): a bot anyone can add to a group is an open circle, so it is public. §4(4): internet permits exist only for lotteries, sports bets, horse bets, casino, slots and poker; everything else online is banned. §4(1) sentence 2 bans participating in the payments (the relayer).
- Germany, StGB §284: punishes whoever provides the facilities (the contract and the bot). §284(4) punishes advertising it (build-in-public posts). §285 punishes participants (German testers). Profit is not an element.
- Slovenia, ZIS: Art. 2 covers any uncertain event, Art. 3 makes organising a state monopoly under concession, Art. 6 bans accepting payments or advertising for unlicensed games, Arts. 110 to 111 fine 30,000 to 250,000 EUR for a legal person and 1,500 to 5,000 EUR for an individual.
- Consequence recorded on 5 Sep: real-money friend stakes are unlicensable in Germany and Slovenia. A design where a user can lose money to another user on an uncertain outcome is out unless the shape changes.

### 5.3 Shapes that stay inside the rules

- Commitment deposits returned in full on success. A forfeit that goes to a pre-chosen charity or is simply returned, never to a counterparty.
- Sponsor-funded or team-funded prize pots with free entry.
- Skill or contest framing with proof of performance, which is where the fitness goal is stronger than the fact-check bet: a push-up count is a performance, a claim about a friend's ex is an uncertain event.
- The fact-check game is the legally weakest piece. If it stays, it must be free entry with a sponsor prize, or reputation only.

### 5.4 Other legal points carried over

- Personal data: rulings on identifiable third parties who never consented, a named loser on a public card, or claim text on an immutable ledger fail GDPR Art. 6(1)(f) balancing and Art. 17 erasure. Cards need consent from the named person and must be deletable.
- Health data from Apple Health is special-category data under GDPR Art. 9. Needs explicit consent and minimal storage. Not yet assessed in detail.
- Telegram's Bot Developer Terms restrict crypto functionality to TON. Any bot exposing wallets on another chain is exposed. Applies if the referee lives in Telegram.
- 18+ only, no minors, for anything with money.

---

## 6. Red-team findings from 5 Sep that still apply

These were written against SquadPot and No Flake for ETHOnline. They are about the primitive, so they apply to the Monad build.

1. **An LLM in the money path is the pattern never to build.** A paid verdict endpoint anyone can call, with the caller supplying the evidence, lets a party buy a verdict for their own pot, and nondeterminism means paying until the answer flips. Any stake-in signature must be bound to the specific pot, not just the contract. The verdict must be deterministic or proof-based where money moves. Device or Apple Health data as evidence is better than free-text evidence for exactly this reason.
2. **Testnet stakes are not stakes.** A stake nobody can lose does not test the behavioural claim. Either use real small money inside the legal shapes above, or accept that testers only see "an AI names the loser".
3. **The tester is a group, not a person.** Every channel the team can reach yields individuals. Nobody adds a hackathon bot to a real friend group for a stranger's demo in a three-day window. Realistic testers are the team's own friends. Plan onboarding for one person and a solo mode, with the group as a second step.
4. **Friend groups in Germany and Slovenia are mostly on WhatsApp or Viber**, not Telegram (inferred, not verified). Surface choice matters for reach.
5. **Void or refund options are decorative once a payout has landed** in a wallet the user owns. Design the settlement delay before the money moves.
6. **Non-resolvable claims end in VOID**, which testers read as "the bot does not work". Prefer claims with a machine-checkable outcome. Fitness goals qualify, most friend drama does not.
7. **Virality is asserted, not measured.** None of the KIMI numbers prove a friend-scale referee spreads, and a verdict card does not travel from a zero-follower account. The day-3 kill check is the only evidence the team will have.
8. **Hours.** The never-cut SquadPot build was estimated at 125 to 165 engineer-hours before the public stunt, tester support and rework. That fits three people with margin, two people only with a cut list.

---

## 7. What carries over from Froggy

The 5 Sep assessment listed what survives from the KIMI concept inside Froggy. Those pieces exist or are planned in the ETHOnline codebase and can be lifted for Monad rather than rebuilt.

- The verdict card as a receipt, and blocked-attempt cards.
- The paid-verdict endpoint shape (a hosted service the agent pays per call).
- "Dollars on screen" vocabulary: pocket, allowance, balance in dollars, no chain names in the UI.
- Privy embedded wallets with policy caps as the spend leash. Custody moved to Privy wallets on 6 Sep in Froggy.
- The kill-check discipline: a measurable day-3 test with a named fallback.
- Build-in-public machinery: the X account, landing page, tester recruitment, all owned by Jonas.

Things explicitly not to import: Froggy's browser and marketplace scope, the Hedera x402 metering, the ETHOnline sponsor stack. The Monad build is a separate repository and product.

---

## 8. Open questions for the kickoff

1. Which mode is the hero for Monad: fitness commitment (legally cleanest, needs a differentiator against Forfeit.app), fact-check referee (most viral on paper, legally weakest), or the daily challenge loop?
2. What is the legal money shape: deposits returned plus charity forfeits, sponsor prize pot with free entry, or peer-to-peer settlement between self-custodial wallets? Decide before any code.
3. Which surface does the referee live in: Telegram, WhatsApp, a web app with share links, or a native app because of Apple Health?
4. How does proof work: Apple Health export, HealthKit in a native app, on-device push-up counting (Kristjan's earlier build), or photo and video judged by a vision model?
5. What does Monad specifically require: contracts on Monad, which testnet or mainnet, which wallet stack, and does Privy support it?
6. Team: Jonas, Kristjan, and is Hemang in?
7. Dates: when does the Monad build window start relative to the ETHOnline submission on 13 Sep, and how many days of build are real?
8. Name: "Monathon" is the event. The product has no name yet. KIMI names on the table: I Told You So, SquadPot, No Flake, Darepot.

---

## 9. Action items

| Owner | Item | Source |
| --- | --- | --- |
| Jonas | Write down the Monad concept and brainstorm further | 6 Sep call, notes next steps |
| Jonas | Own the Monad write-up and the X account | Iteration 3 plan |
| Jonas | Fill in section 1 from the Monad event page: dates, tracks, rules | This file |
| Jonas and Kristjan | Discuss the concept after Froggy stabilises, decide hero mode and money shape | 6 Sep call |
| Kristjan | Dig out the earlier push-up or health tracking build referenced on the call | 6 Sep call |
| Team | Confirm Hemang's participation for Monad | Open |

---

## 10. Sources in this repository

- `docs/sync/transcript.md`, the 6 Sep 2026 call, Monad section from 00:59 to the end.
- `docs/sync/notes.md` and `docs/sync/full-notes.md`, the Gemini summaries of the same call.
- `docs/sync/iteration-2-context.md`, the rule that Monad scope stays out of Froggy.
- `docs/plan/ITERATION_3.md`, the assignment of the Monad write-up to Jonas.
- `docs/plan/archive/summary.md`, the earlier brainstorm that parked gaming ideas for Monad.
- `docs/plan/archive/IDEAS_KIMI.md`, the three-mode concept, legal scan, audience, hooks, kill criterion.
- `docs/plan/archive/IDEAS_V3_KIMI.md`, the pain catalog, the kill list including FORFEIT, the SquadPot ranking.
- `docs/plan/PIVOT_ASSESSMENT_FABLE51.md`, the verified statute text and the red-team findings.
- `docs/research/pivot-squadpot_FABLE51.md` and `docs/research/pivot-noflake_FABLE51.md`, the full red-team reports.
- `docs/sync/telegram-grilling-session.md`, the ref.tools mention.
