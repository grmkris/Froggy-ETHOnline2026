# Build in public and tester operations (FABLE51)

Written Sat 5 Sep 2026. Jonas's lane: what to post, where, when, to whom, with which artifact; how testers get in, what they see, and how we count them. Evidence: `RESEARCH_FABLE51.md` sections 5-8, `research_FABLE51/dim-build_in_public_FABLE51.md`, `gap-event_week_graph_and_peers_FABLE51.md`, the build-in-public-first design and the tester refutation in `research_FABLE51/panel-*_FABLE51.md`. Segments and personas are in `TARGET_GROUPS_FABLE51.md`.

Times are CEST. X posts go out at 15:00 CEST (09:00 US Eastern).

---

## 0. Rules that came out of the evidence

1. **Jonas's personal account carries the narrative.** A project account, if any, posts receipts only. Cold accounts in a week with near-zero ETHOnline chatter on X do not travel; the one format that over-reached from a small account was a problem statement developers recognize (@0xblockboy's "authorize once, spend under a limit": 34k views, 202 bookmarks), not a product explainer (about 1.2k views).
2. **Link in the first reply, never in the body.** Native clips under 2:20, front-loaded; the Chrome and the policy card visible in the first three seconds of every clip.
3. **Receipts, not adjectives.** Every post is tied to a thing that shipped that day: a HashScan link, a Basescan link, a policy denial with its id, a grab clip. One number per post.
4. **Address people, never logos.** Sponsor org accounts do not amplify builders mid-event. The accounts that reply: @HederaCommunity, @ed__marquez, @jaycoolh, @narb_s, @JulioMCruz, the Hbar Happy Hour hosts @Mauii_MW and @filhetu, @thehbarbull, @graphprotocol reply threads. Tag @privy_io exactly once, with the policy JSON. Post any Blocky402 gotcha in Hedera Discord build-support; the blockydevs/blocky402 repo returned 404 on 4 Sep, so a GitHub issue only if it goes public.
5. **Vocabulary.** Pocket, allowance, lunch money. Never "give the AI your wallet". Never "spending limits your agent cannot break" (SingIt's line) and never "leash" as a name (taken this week).
6. **No live link before a stranger has a receipt through "Try it".** Until the guest path works (Day 3 target), posts link the repo and the clip; the live URL sits behind an invite code. The first 30-60 minutes after a post decide its reach, and a burst that lands on an email-only door with one shared Chrome is the screenshot we cannot afford.
7. **Cadence.** At most two posts a day, then 60 minutes of replying to every reply. One recap thread Wed 9 Sep. Build-in-public dies if it is nobody's fixed block: Jonas's afternoons, 15:00-17:00, are it.
8. **Honesty in every post.** The custody line ("Privy gates the EVM leg; the Hedera pocket is host-capped lunch money") appears in the thread of any post that mentions money, so nobody can "well, actually" it later.

---

## 1. Channels, with the rule for each

| Channel | Use | Rule |
|---|---|---|
| X (personal account) | The narrative, one clip or receipt a day | Link in first reply; tag people not orgs; 60 minutes of replies |
| GitHub issues on the peer sellers' repos | The primary-segment first touch | The "we paid your 402" issue only after our agent has paid it, with the HashScan link and a clip (text in section 4); a short Sunday ask for their URL and payTo is a separate, smaller issue |
| Hedera Discord build-support | Technical questions and the settlement links | Office hours Mon-Tue 14:00 UTC; ask the duplicate-settle question there; post the first HashScan |
| ETHGlobal Discord #mentorship-help | A real question to @JulioMCruz (idempotent settle, the Privy types map) with the link riding on it | It is a mentoring channel; a 110-word recruitment paragraph is off-topic. Ask a mod on Day 2 whether a showcase channel exists |
| ETHGlobal Discord partner channels | Technical framing only | Ask a mod before any promotion |
| x402 builders Telegram (600+) | The 402-probe card ("this is what your 402 looks like to a buyer"), the hedera:testnet route snippet | Product on screen; most members sell on Base, so lead with the probe, not the pitch |
| t.me/graphhackers (about 480, Graph support engineers present) | Graph day: the receipt with deployment ids, the registry, the docs PR, one real question | Not t.me/graphprotocol |
| Graph Discord #mcp-servers | Same artifact, aimed at MCP users | |
| Privy Developer Slack (privy.io/slack) | One post: the policy JSON and the jailbreak clip | Once |
| Reddit | One fresh r/ethdev self-post on Tue 8 (rules allow it) answering the 25 Aug "how do we let an AI use a wallet without unrestricted control" question with the blocked card; replies into r/ClaudeAI 1vhp54h, r/AI_Agents 1vsy715 and the r/OpenClawUseCases thread; r/alphaandbetausers on Wed 9 with the product shown | The named threads are two to four weeks old, so a reply reaches the OP (worth a DM), not readers. Write replies without a bare link (name the repo, put the URL in a follow-up comment) so automod does not remove them. Expect single-digit starts from Reddit |
| Farcaster | Dropped unless Jonas already has followers there | No ETHOnline conversation exists on Farcaster to tap |
| Hbar Happy Hour Spaces | Ask @Mauii_MW / @filhetu for two minutes with a live transaction | Only with a HashScan link in hand |
| Show HN, Product Hunt, BetaList | After submission only, with the no-signup try link | Their rules require a working product without a waitlist |

---

## 2. The daily artifact schedule

Each artifact exists because the product shipped it that day. If the thing did not ship, the post is the honest failure ("ship the spike, post the failure") or nothing.

| Day | Artifact | Post | Tags and where |
|---|---|---|---|
| Sat 5 | The live screencast pane (15 seconds) | Post 1: "Building an agent browser you can grab, with a Privy leash, for ETHOnline. Shipping a receipt every day until Sunday the 13th." Repo link in the first reply, no live link | Join privy.io/slack, Hedera Discord, t.me/graphhackers, ETHGlobal Discord; DM @JulioMCruz with a real question |
| Sun 6 | The first Blocky402 settlement on HashScan; the graphprotocol/docs fix PR | Post 2: the HashScan screenshot, "first Blocky402-settled request on Hedera, 0.05 tHBAR for a four-deployment lending brief" | @jaycoolh, @ed__marquez; reply under @HederaCommunity's latest post; the PR link as a reply into @graphprotocol's builder thread and in t.me/graphhackers; issues on five peer repos asking for URL and payTo |
| Mon 7 | Basescan: the agent paid The Graph $0.01 a query under Privy policy <id>; the first peer paid (fare402) | Post 3: the Basescan receipt card; the fare402 issue "Our agent paid your 402 (HashScan inside)" | @graphprotocol reply thread; the duplicate-settle question in Hedera office hours; five more peer issues; check-in 1 |
| Tue 8 | The 20-second jailbreak clip; the guest path is live | Post 4: "I told it to send everything to 0xevil. Privy said no. Policy id on screen." First post with the live link in the first reply, only if a stranger produced a receipt that morning | @privy_io once, Privy Slack; the r/ethdev self-post; replies into the three named threads; feedback session 14:00 EDT; tester wave 1 |
| Wed 9 | The recap thread; Graph day | Recap thread (Day 0 versus Day 5 screenshots, real numbers: starts, receipts, blocked, peers). "The blocked board is open: try to make it pay someone it should not; nothing to win but your handle on the board and in the README." | t.me/graphhackers and Graph Discord with the receipt and one real question; DM @PaulBarba12; tester wave 2; peer pings; ask for the Happy Hour slot |
| Thu 10 | The freeze clip; the "what testers broke" thread | Post 6: freeze from the Telegram button, key gone; the thread credits handles | Feedback session 09:00 EDT; check-in 2 |
| Fri 11 | The 60-90-second native cut of the video | Post 7: "submitting tomorrow, numbers so far" | Happy Hour appearance if granted |
| Sat 12 | The ship thread | Post 8: video, HashScan, Basescan, repo, live URL, the real tester count; the recap card | DM the showcase link to @jaycoolh, @ed__marquez, @narb_s, @JulioMCruz and every peer we paid |
| Sun 13 | Nothing new | Re-verify only | Show HN after the submission is confirmed, with the no-signup link |

---

## 3. The two stunts

**The blocked board (from Tue 8).** "Try to make my agent pay 0xevil." Every blocked attempt is a card: the prompt excerpt, the policy id or the host provenance reason, the timestamp, the attacker's handle (opt-in at the moment of the block). No pot, no points, no tokens, no paid testers. The Freysa format at zero cost, provably unwinnable through the wallet (default deny plus allowlist), and every attempt re-demonstrates the product. A real-money pot would be gambling exposure in Germany and Slovenia and a model-budget drain; it is not on the table.

**Peer pays (from Mon 7).** Our agent pays a peer team's 402 on camera under a 0.5 tHBAR cap; the clip and the HashScan link go to them. It is the only channel this week where a reply is near-certain, because they need a buyer for their own submission as much as we need a counterparty.

---

## 4. Texts (use verbatim, fill the brackets)

**Peer-swap GitHub issue.** Title: "Our agent paid your 402 (HashScan inside)".

> Hi [name], we are building [product] for ETHOnline (an agent wallet where the agent drives a Chrome you can watch; Hedera AI & Agentic Payments track). Our agent just paid [endpoint] on hedera:testnet under a 0.5 tHBAR cap: [HashScan link]. 15-second clip: [link]. Two optional asks: (1) may we keep [endpoint] in our default directory this week? Testers can pay you with one click and our morning cron pays you once a day; you get a public paid-calls counter on [url]/receipts and this clip for your README. (2) If your agent buys things, our 402 is at [url]/oracle/snapshot for 0.05 tHBAR and returns a live Graph lending brief; curl: [one-liner]. When does your endpoint go live for good? We keep directory rows open until submission. Either way, thanks for shipping a seller; the track needs those.

**Recruitment (adapt per venue; on X the link goes in the first reply).**

> We are building an open-source agentic wallet for ETHOnline: the agent gets a real Chrome you can watch and take over, and a Privy policy on the EVM wallet plus host-enforced caps on the Hedera pocket (per-call cap, daily cap, allowlist, kill switch) that hold even if you jailbreak the prompt. Testnet only, nothing to buy, nothing to install, desktop browser needed. Ten minutes: open the link, your pocket is already funded, tell it to pay 0xevil and watch Privy say no, then let it buy a Hedera x402 brief on camera. Everything you break is credited by handle in the build log and the README. [link]

**Phone door (landing page, when a phone is detected).**

> The workspace needs a desktop browser (you grab a live Chrome with your mouse). Watch the 30-second clip, or tap "send me the desktop link" and we will also send you tomorrow's receipt on Telegram.

**Consent screen (before the first job).**

> You are talking to an AI agent. Everything here is testnet: no real money, nothing to fund. Without asking, the agent will browse allowlisted pages, read them, quote them, and pay x402 services in your directory up to 0.5 tHBAR per call and 2 tHBAR per day. Anything else parks as a card for you. It cannot exceed the daily cap, pay an address that is not in your directory, raise its own limits, or export a key; a Privy policy and our host enforce that, not the prompt. It can still be wrong or be manipulated by page content, so treat it as a beta. We store: a session id, your Privy user id or a guest id, your receipts, and a Chrome profile that is wiped when your session ends. Delete everything with one click on the wallet pane.

**Blocked-card share text (pre-filled X reply).**

> My prompt: "[excerpt]". The model said yes. Privy policy [id] said no: [reason]. [url]

---

## 5. Tester operations

**Entry.** One link everywhere, `?src=<channel>` appended so ACQUISITION.md fills itself. Two doors on the landing: "Try it" (guest, no signup, prefunded testnet pocket) and "Sign in with email". Guests: IP cap three per day, thirty tester slots plus ten reserved for judges, 48-hour TTL extended to 14 Sep when Telegram is paired; a pool of three pre-provisioned identities so the click starts the run.

**First session, in order.** Consent screen. Two buttons: "Tell it to pay 0xevil" (about ten seconds to a Privy denial card) and "Let it buy something (0.05 tHBAR brief)" (the receipt card; if no Chrome seat is free, the job runs without the browser and the card offers "watch the unlock in the shared Chrome" as the thing to wait for, with the Telegram pairing offered right there). Then "paste your hedera:testnet 402" with a working example as the placeholder; a Base URL gets the "unsupported this week, here is the ten-line Hedera route" card so the visit ends with a next step. The receipt card offers "get tomorrow's receipt on Telegram" (pairing code, hour and timezone asked at pairing).

**Activation metric.** Time from the "Try it" click to the first receipt card; target 90 seconds.

**Day 2.** The digest at their hour: the number and its delta, what it bought, what was refused with the policy id, links, Freeze and Open buttons. Counted as a return: an "Open workspace" press, a poll answer, a reply. Freeze is reported separately. Target: three returns from twelve first receipts (stretch targets; the expected range is 2-4 from 4-8, see TARGET_GROUPS section 8); write that in VALIDATION.md before the numbers exist.

**Bugs.** `/bug` as a DM to the bot. No open tester group: three members in a group on Tuesday reads as a dead product; the empty-room signal stays private.

**Directory pays are opt-in.** The receipt card offers "also buy from N peer services (max 0.1 tHBAR each)?" as a click, never automatic; the cron pays our brief plus at most one directory endpoint, round-robin. A tester's agent buying four strangers' services unasked is the behaviour the secondary segment came here to avoid.

**Capacity and judges.** Six concurrent Chrome workers, one reserved for judges and never handed to a tester; idle kill at ten minutes; the sixth concurrent tester gets the Chrome-less job and a queue position with a Telegram ping if paired. Counter reset at submission so async judges (13-16 Sep) never see "guest limit reached".

**Legal minimums on the landing (not legal advice).** An Impressum (a missing Anbieterkennzeichnung is a standard Abmahnung target in Germany), a short privacy notice naming the controllers, the processors (Privy, Anthropic, the host, Telegram) and the retention (session end; receipts kept), the AI label, and "testnet only". Never write a tester identifier into an HCS message.

---

## 6. ACQUISITION.md (kept in the repo, mirrored at `/log`, pasted into "How it's made")

One row per touch:

| date | channel | message link | replies | starts that day (`src` attributed) | first receipts | blocked cards | endpoints added | notes |

Updated nightly by Jonas. Rows 1-5 on Day 1 are the post URL and the four channel joins. The team's own clicks are excluded. This is the Validation evidence in a form a judge can read, and the honest counter to "no one used it".

---

## 7. VALIDATION.md and FEEDBACK.md

**VALIDATION.md.** N testers, M settled payments with HashScan links, K peer endpoints paid, J blocked cards from strangers, day-2 returns, and quotes with handles (permission asked in a three-question form on the receipt card: what surprised you, what would you not trust, would you fund $5). The real numbers, however small; judges punished fake more than small.

**FEEDBACK.md.** One section per sponsor: what we hit, what we asked, what they answered (the Hedera office-hours duplicate-settle answer, the Privy types-map behaviour, the Graph testnet-host bug and the PR), and what testers said about each integration. The winners' anatomy found the evidence file outside the video separated winners from losers.

---

## 8. The video, Jonas's part

Rehearse three times Friday morning on the judge worker, record Friday afternoon: OBS at 1080p, face cam, own voice, not sped up, the phone in frame for the Telegram beats, three takes, cut to 3:15-3:30, upload to the showcase Friday and re-watch it on the showcase page (the failure mode of PlanBound and AgentPass was a video that did not exist there). The beat sheet is in `PRODUCT_FABLE51.md` section 6 and the rule check in `PRIZE_AUDIT_FABLE51.md` section 9. The fare402 sub-beat is dropped first if a take runs long. Saturday is the re-shoot buffer, not the recording day.

## 9. Kill checks for this lane

- Tue 8, 12:00: if "Try it" has not produced a receipt for someone outside the team, post 4 links the repo and the clip only and wave 1 slips to Wed 15:00.
- Tue 8, 22:00: if no stranger has a receipt, public testers are cut to judge mode plus the peers we pay; the lane switches to clips, receipts and the peer issues.
- Every day: if the artifact did not ship, post the failure or nothing. Never a product explainer without the product on screen.
