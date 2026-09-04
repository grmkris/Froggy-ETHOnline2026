# IDEAS — KIMI round v2 (4 Sep 2026, PIVOT)

Full rewrite. Round v1 (subscription killer / group splitting) was rejected:
too fintech-utility, not mass-consumer, not viral enough. This version comes
from a fresh 8-track research swarm aimed at mass-consumer virality: stakes &
commitment apps, Gen Z social pains, AI characters with wallets, friendly
prediction mechanics, challenge/dare culture, legal boundaries, sponsor
re-mapping, and monetization/retention.

Older docs preserved: [`summary.md`](./summary.md), [`PLAN.md`](./PLAN.md),
[`ARCHITECTURE.md`](./ARCHITECTURE.md), `IDEAS.md`.

---

## The one-sentence discovery

Every research track converged on a single primitive:

> **Friends stake dollars on something — an AI agent is the referee, escrow,
> and settler — and the verdict receipt is the viral artifact.**

The money is invisible (Privy embedded wallets, balances in dollars, stablecoin
rails underneath). The AI is real (it researches, verifies photo/video
evidence, judges, pays). And the shareable moment IS the transaction.

Why this is the sweet spot:

- **The pain is mass-market and proven.** Partiful hit a $140M valuation with
  zero marketing because friend-group coordination is broken; Kalshi +
  Polymarket did $44B volume in 2025 because people love being right;
  StepBet/DietBet paid out $148.9M because stakes work. Nobody has fused these
  into one consumer primitive for group chats.
- **The AI referee is the actual novelty.** Friend bets die from welching and
  disputes; commitment apps are solo and joyless. An agent that researches the
  claim, judges the evidence, and settles instantly is genuinely new — and
  demo-able in 60 seconds.
- **The receipt is the viral loop.** Polymarket engineered its growth around
  screenshots; an auto-generated "I TOLD YOU SO" verdict card naming the loser
  is that loop, made personal. Humiliation spreads better than profit.

## Legal guardrails (from the legal scan — these shape all ideas)

- 🟢 **Safe**: stakes returned in full (deposit mechanics); sponsor-funded
  prizes with free entry; skill-based outcomes under $10; money that never
  changes ownership between users except pre-agreed P2P settlement between
  self-custodial wallets.
- 🟡 **Careful**: P2P settlement between friends' own Privy wallets
  (defensible — no custody, no rake); forfeits routed to a pre-chosen
  friend/charity.
- 🔴 **Never**: any rake on friend wagers (that's unlicensed bookmaking),
  chance-based money games, custodial pooling, user-submitted dares for money
  (Blackout-Challenge liability), minors.
- For the hackathon: caps of $1–10, no fees, "skill/contest" framing, geofence
  the ~9 restricted US states later. Demo can run fully on these rails today.

---

## Idea 1 — "I Told You So" (RECOMMENDED HERO)

> **Your group chat's referee. Friends stake dollars on who's right — the AI
> researches it, rules on it, and pays the winner. Receipts included.**

**The product.** A Telegram bot + web app that lives in your group chat.
Someone says "he's definitely getting back with his ex before October" →
"Bet." → both sides stake $5 → the agent locks the terms, researches/monitors
the outcome, and when it's resolvable it posts the verdict: an evidence-backed
ruling and a watermarked verdict card with the winner's name. Money moves
instantly, invisibly (dollars on screen, stablecoins underneath).

**The pain.** "I told you so" is one of the most common moments in any friend
group, and friend bets are broken: nobody remembers terms, losers welch,
there's no neutral judge. Meanwhile prediction markets went mainstream
($44B in 2025) but are trading venues — nobody owns the *social, friend-scale*
layer. Fliprbot and Kash proved conversational betting rails work (both built
on Privy-style invisible wallets) — but they bet on markets, not on your
friends' lives.

**Why it's viral.**
- Every settlement auto-generates the **verdict card**: original claim,
  stakes, evidence, loser's name, payout — one tap to X/Telegram. This is the
  Polymarket screenshot loop made personal.
- The agent has personality: deadpan rulings, savage-but-safe verdict
  write-ups. "The AI looked at the evidence and TOOK his $10" is the clip.
- Growth is structural: every bet needs ≥2 people, and the verdict card pulls
  the next group in.
- Build-in-public: run the agent as a public referee on X all week — "post
  your friend disagreement, our AI rules on it live, $5 stakes."

**The 60-second demo.** Real group chat → "$20 says Jonas flakes on Portugal
again" → stakes locked → agent monitors → resolution day: agent posts the
ruling with evidence and the verdict card → payout lands, balance in dollars,
no crypto anywhere → card shared to X in one tap.

**7-day scope.** Telegram bot, bet-creation flow, Privy wallets + policy caps
(the leash = stakes can't exceed $10), agent research/verdict loop, verdict
card generator (the key viral asset), Graph-indexed public leaderboard.
P2P settlement last, behind the demo path.

**Retention design (learned from Duolingo/StepBet).** Streaks and leaderboards
("most calls won in the group"), small stakes so losing never stings,
forgiveness mechanics (void options), and group seasons. Novelty alone dies —
Sora lost 95% of users in 30 days; stakes + social pools are the habit engine
(Duolingo's streak wager lifted D7 retention +14%).

**Extension.** Categories (sports-lite, celebrity, group drama), public
figure adjudications, sponsored pots, API for other group platforms. The
verdict ledger becomes a reputation graph (Graph/ERC-8004 angle).

---

## Idea 2 — "No Flake"

> **The trip finally leaves the group chat. Everyone stakes $10 to the plan —
> show up and get it back; flake and the group splits your stake.**

**The product.** Partiful proved planning is mass-market (Best App of 2024,
+400% YoY) — but plans don't fail at planning, they fail at commitment. Our
agent polls the group for dates, finds the slot, and — using the shared
browser asset — **actually books** the restaurant/tickets. Everyone deposits
$10. Attendance verified (check-in/photo). No-show's stake goes to the group
(or the bill).

**Why it's viral.** "Group chat trip that never happens" is a universal meme
with loneliness-data underneath (8 in 10 Gen Z experienced loneliness last
year). The flake-charge notification pushed back into the group chat is the
screenshot. The agent doing the actual booking in a watchable browser is the
demo magic nobody else has.

**Why it might win judges.** It uses every asset the team already architected:
shared live browser (booking), Privy leash (deposit caps), Telegram (group
onboarding), agentic payments (real booking spend). It's the most complete
showcase of the architecture.

**Risks.** More episodic than Idea 1 (trips aren't daily), heavier build
(booking flows are fiddly), and flake-charging friends needs careful tone
(opt-in, forgiving defaults). Legally the cleanest of the three (deposits
returned; skill/attendance, not chance).

**Verdict: strongest as Idea 1's second mode.** Same primitive, different
stakes trigger. If the team wants the most architecture-complete demo instead
of the most viral one, make this the hero.

---

## Idea 3 — "Darepot"

> **The AI hosts challenges for your group, judges the proof, and splits the
> pot. Tonight's challenge: best dinner cooked for under $8 — photo proof,
> AI judges, winner takes the pot.**

**The product.** Platform-curated daily challenges (never free-form user
dares — that's the Blackout-Challenge liability). Friends join a challenge
with $1–5 stakes, submit photo/video proof, a vision model judges instantly,
and the pot pays out. Duolingo-meets-StepBet for friend groups.

**Why it's viral.** Challenge culture is TikTok's native language (35% of
users join challenges). The AI verdict on real photos is the shareable moment
("the AI rated my pasta 4/10 and gave my roommate $12"). Forfeit proved AI
vision verification works (94% completion); StepBet proved money-staked
challenges produce 73% adherence vs 12–18% for tracking-only.

**Risks.** Moderation and minor-safety exposure is the highest of the three —
must be 18+, curated challenges only, geo-gated. Also the least
"agentic-looking": the AI is a judge, not a character, and the shared-browser
asset goes unused.

**Verdict: keep as the third mode / post-hackathon expansion.** Its daily-loop
mechanics (a challenge per day) are the retention layer the other two ideas
need later.

---

## Head-to-head

| | 1. I Told You So | 2. No Flake | 3. Darepot |
|---|---|---|---|
| Mass relatability | ★★★★★ | ★★★★★ | ★★★★ |
| Viral artifact | ★★★★★ (verdict card) | ★★★★ (flake receipt) | ★★★★ (AI judgment) |
| Frequency / habit | ★★★★ | ★★☆ (episodic) | ★★★★★ (daily) |
| 7-day feasibility | ★★★★★ | ★★★☆ | ★★★★ |
| Legal safety | ★★★★ (no-rake P2P) | ★★★★★ (deposits) | ★★★ (moderation) |
| Sponsor fit | ★★★★ | ★★★★★ | ★★★☆ |
| Post-hack ceiling | ★★★★★ | ★★★★ | ★★★★ |

**Recommendation: build Idea 1 as the hero, designed so No Flake is a
second stakes-mode (day 5–6 stretch) and Darepot becomes the daily retention
layer after the hackathon.** One primitive, three modes, one brand.

## Target audience

- **Beachhead: 18–28 friend groups who live in group chats** — students and
  young professionals, the Partiful/Kalshi-adjacent generation that already
  screenshots everything and already says "bet." Gender-balanced by design
  (sports-only framing caps the audience at ~80% male; group-life bets are
  BeReal-broad).
- **Acquisition surfaces**: Telegram groups (product lives there) + X/TikTok
  (verdict cards + the public referee stunt). Zero install: bot joins the
  chat, wallets appear invisibly.
- **Build-in-public audience (separate)**: crypto/AI Twitter watches the agent
  referee real arguments all week — that's the sponsor-judge attention layer.

## Sponsor map (unchanged rails, new framing)

- **Privy "Best financial flow" ($2.5k)**: invisible onboarding + P2P
  settlement + policy caps = the flow. The leash is the trust story.
- **Hedera "AI & Agentic Payments" (3 × $2k)**: x402-gated verdict/oracle
  service; micropayment settlement of stakes; HCS audit trail of rulings.
- **The Graph AI track ($5k)**: subgraph over bet/verdict events powering
  leaderboards and the public ruling feed; agent reasons over live data.
- **Sleeper adds**: World Selfie Check (one-human-one-account for fair
  leaderboards, $3.5k), ENS (names for the referee agent, $5k).

## Build-in-public hooks for the week

1. **"The Referee is live"** — X users submit real friend disputes; the agent
   rules publicly with evidence. Every ruling is content.
2. **Verdict card gallery** — a public, Graph-indexed feed of the week's
   funniest rulings.
3. **"$100 house pot"** — the team's own group runs real stakes all week;
   daily standings posted.
4. **"It can't be bribed"** — Break-the-Leash variant: try to prompt-inject
   the referee into flipping a verdict or overpaying; policy engine blocks it
   live. Trust demo as spectacle.

## Kill criteria (check on day 3)

If by day 3 the verdict card doesn't make at least 5 non-crypto friends say
"send me this," fall back to Idea 2's full architecture showcase as the demo —
it wins on judge-legibility even if the viral loop is slower.
