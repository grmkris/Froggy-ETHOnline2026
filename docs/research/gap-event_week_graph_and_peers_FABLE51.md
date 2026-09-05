Why: Goal B (testers in 9 days) and the Hedera rubric's 'Validation' criterion both depend on someone amplifying the team, but the build_in_public dimension only measured channel sizes and third-party X mechanics; it never verified which sponsor accounts actually engage builders mid-event. Segments recommended other Hedera-track teams as counterparties but identified none. Reddit and Farcaster demand were left blank because of fetch blocks that mirrors can route around.

# GAP event_week_graph_and_peers

## Summary

Method note: x.com was read directly through the user's logged-in Chrome (read-only; no posts, follows or likes were made), because every nitter/syndication mirror is dead and fxtwitter only serves profiles and some tweet IDs. Reddit was read via old.reddit.com in the same Chrome (pullpush returned 429 "not for agents"; redlib mirrors are bot-walled). GitHub via unauthenticated API until it rate-limited. WebSearch budget was exhausted before this task started, so everything below is either fetched (VERIFIED) or reasoned (INFERRED).

1. AMPLIFIERS. The headline finding is negative and important: none of the three sponsor org accounts replies to, reposts, or quotes builders mid-event. VERIFIED via `from:<handle> filter:replies` searches back to June: every @hedera_devs reply since 1 Jun is a self-thread; its profile shows no reposts in the last month; during ETHGlobal Cannes week (4-6 Jul 2025, Hedera was a Cannes sponsor; it did NOT sponsor Lisbon Jul 2026) it posted only a newsletter thread and a HIP update, zero builder engagement. @graphprotocol posts daily at 10-19k views but its replies are self-threads; @GraphDevs (1,031 followers) posts office-hours recordings at ~400 views. @privy_io follows 0 accounts; its "Replies" tab is only Friday-ship threads (5k views) and customer case studies (Zebec, 38k views). @ETHGlobal made exactly two emoji replies in two weeks (to 1inch/Aqua and akindo). @BlockyDevs on X has been dormant since July 2024 (105 posts, 97 followers) — the facilitator team engages only via GitHub (blockydevs/blocky402) and the hedera-skills repo (MWBlocky, mmyslblocky). Ed Marquez (@ed__marquez, 3,430 followers, Head of DevRel Hedera) quote-tweets Hedera-official and ecosystem posts (SaucerSwap, ambassadors) at 1.8-4k views and gave one "Cool stuff!" reply; he ran the July x402 bounty, presented "x402 on Hedera: let your AI agent pay", and quote-tweets the @HederaCommunity account. Michiel Mulders (@michiel_mulders) has posted nothing since 15 Jul. Jake Hall is INFERRED to be @jaycoolh ("Jay Cool ħ", 2,071 followers, bio "@hedera / build cool stuff onchain"; GitHub jaycoolh has 23 commits on hedera-dev/hedera-skills; the hedera.com x402 winners post is bylined "Jake Hall, Developer Relations Engineer, UK"); he replies to builders in small threads (60-800 views, e.g. Solo/Hiero reply) and posts personal Claude Code takes. Luke Forrest is the ETHOnline Hedera workshop speaker ("Hedera: Claude Code - AI Skills for Hackathon Builders", youtu.be/-nkd3aorELM) but no X handle could be confirmed. Additional Hedera devrel with real handles: Narbeh Shahnazarian @narb_s (2,252, Sr Solutions Architect, x402 PoC author, hosts devntell podcast), Kiran Pachhai @mr_pachhai (1,064), Ty "Patches" Smith @SL_Patches (458). Lindsay Walker: not found.

The amplification that actually exists is (a) the post-bounty winners thread: on 31 Aug @hedera_devs posted a root tweet (9.4k views) plus one reply per winner with the GitHub card (930-1,118 views each), then a 2 Sep follow-up (795 views) praising three winners for shipping "no smart contract at all"; @graphprotocol did the same for its Lisbon prizes on 28 Jul (~500 views/post); (b) the community layer: @HederaCommunity (144,985 followers) posts at 4-10k views, replies to ecosystem people ("Neuron is MAJOR!!", "This is truth."), promotes the monthly Hedera Dev Q&A (3 Sep 15:00 UTC, "share your screen, debug live with the Hedera dev team", 10k views) and Hbar Happy Hour X Spaces (#12 on 2 Sep, #13 on 4 Sep, hosts @Mauii_MW 9.3k and @filhetu 8.6k); @thehbarbull (40k) interviewed Ed Marquez about the x402 bounty (2.2k views clip via HederaCommunity). (c) ETHGlobal mentor @JulioMCruz (1,849 followers) posted on 4 Sep: "If you need help on AI agents, identity, orchestration, or onchain payments (x402), ping me. Find me in the @ETHGlobal Discord #mentorship-help" (467 views, 4 replies).

2. EVENT-WEEK CHATTER. @ETHGlobal: kickoff "1300+ hackers, 26% new to web3, 398 cities, 88 countries" (1,445 views); "ETHOnline 2026 Kickoff | Kartik Talwar" YouTube (1,579 views); per-sponsor prize cards (Hedera 4.4k, Graph 12.8k, Privy 3.1k views); new Hacker Pack perk (free AI coding agent from @freepicli by @DennisonBertram). @hedera 4 Sep "Calling all builders" $15K post: 11.6k views, 24 reposts, 3 replies. @graphprotocol 3 Sep QT of ETHGlobal: 10.3k views. @privy_io: nothing about ETHOnline at all. The "who's building at ETHOnline?" post got 3 replies totalling 31 views — X chatter from hackers is near zero. ETHGlobal has no public /schedule page (404); the sponsor pages carry recorded workshops only (Hedera/Luke Forrest; Arc, World, Bazantic, 1inch, Ledger, Chainlink). Discord: ETHGlobal 34,083 members (2,878 online), Hedera 12,591 (1,331 online), Privy 655 (22 online); channels seen: #mentorship-help (ETHGlobal), hedera.com/discord is the official "Build Support" link on the x402 bounty page.

3. PEERS. GitHub repos created 1-4 Sep for the Hedera x402 track (all 0 stars): charlie-morrison/tollgate (pay-per-unit API, HBAR), retailbox-automation/x402-work-receipts (agent-to-agent work orders + HCS receipts, first Blocky402 testnet settlement done, HashScan links), ducnmm/fare402 (live Railway merchant, pay-per-query mirror lookups, 3 settled txs on day 1), valentin-alexandrov/hedera-x402-pay-per-inference (LLM inference, demo GIF, HCS audit topic), pogosiandavid115-dev/turnstile-x402-hedera (inference, merges the three hedera-dev starters), sgladkov/inference-exchange (agents buy/sell inference), livevnx8/hedera-x402-paid-lookup, Linus-Shyu/Ether-Hunt (Hedera x402 + Graph From Scratch + Arc; pay-per-scan audit, @Linus_Shyu 78 followers), roderickhodgson/AgentTether (Graph AI + Hedera; webhooks paid via x402 upto), MIA-Ether/x402-agent-gateway. All of these are sellers — natural counterparties for an agent that pays. Direct competitors to "agent wallet with caps": Ridwannurudeen/countersign-ethonline2026 (owner-signed mandate + guard key, x402-gated review on Hedera; author @Ggudman1, 2,200 followers), nisargpatel7042lva/mandate (Next.js boilerplate only), Nikodem01/chip402 (Omarchy plugin, spend-capped x402 on Hedera, created 24 Aug), and — most important — Tally by Madhav Gupta (@Madhav__28), winner of the July Hedera x402 bounty: "spend-control & audit layer for agentic payments on Hedera", x402 upto scheme, npm packages x402-hedera-upto / x402-hedera-receipts / x402-hedera-mcp, MCP server, HCS receipts. Non-Hedera prior art also in the same week: hms1499/leash (Celo, on-chain per-tx/daily caps + allowlist), Akixama/intent-firewall, ring29-labs/wallet, OnchainRouter. No ETHOnline repo found that combines a shared human+agent browser with a policy wallet; nothing found on Privy agent wallets for ETHOnline (0 GitHub hits).

4. NORMIE DEMAND (Reddit, top by score, past year): r/pwnhub 817 pts "$175K in crypto got drained from an AI's wallet because a guy posted Morse code in a tweet" (May 2026); r/ClaudeAI 351 pts / r/AI_Agents 60 pts + 99 comments / r/ArtificialSentience 72 pts "I gave a Claude Fable 5 agent a domain and $90 it can't spend without me" (Aug 2026; body: "It can propose a spend and sign its half, but nothing moves until I co-sign. Money in needs nobody's permission, money out needs a human"); r/nanocurrency 142 pts x402 spec; r/cybersecurity 76 pts "audited 31,000+ OpenClaw skills, 2,371 malicious"; r/OpenClawUseCases 65 pts "$3400 lesson learned" (agent in a hallucination loop kept spinning up paid proxies overnight with a hardcoded corporate card); r/ethdev 6 pts / 16 comments "How do we let an AI use a wallet without giving the AI unrestricted control?" (25 Aug; proposes exactly "AI Agents -> Policy/Execution layer -> Blockchain"; a commenter: "We use per action and per day limits... if the order or payee/total changes it is kicked out for reapproval"); r/ethdev "We gave AI agents Ethereum wallets and watched them trade across 3 chains, here's what broke" (26 comments), "A single extra field in my x402 402 response silently rejected every payment for five days", "I mapped which wallet defense stops which agent-wallet drain". r/ethdev rules: "No specific rules... apart from the normal global reddit rules... if you post scams, you will be banned" — self-posts about your project are tolerated. r/ClaudeAI top posts are cost/billing anxiety, not wallets.

## Claims

### [high] conf 0.9: None of @hedera_devs, @graphprotocol/@GraphDevs, @privy_io or @ETHGlobal replied to, reposted or quoted an individual builder's post in the last 30 days; the only builder-facing amplification is a post-event winners thread.

Evidence: VERIFIED. from:hedera_devs filter:replies since:2026-06-01 returns only 'Replying to @hedera_devs' self-threads; profile shows no reposts; from:(graphprotocol OR GraphDevs) filter:replies since:2026-07-01 likewise; privy_io/with_replies shows only own threads (privy_io follows 0); from:ETHGlobal filter:replies since:2026-08-20 = 2 emoji replies (97 and 186 views). Winners thread: hedera_devs 31 Aug root 9,386 views, per-winner replies 930-1,118 views each.

Sources:
- https://x.com/hedera_devs/status/2094435634408821100
- https://x.com/hedera_devs/status/2094435639089656033
- https://x.com/hedera_devs/status/2095121983457423795
- https://x.com/graphprotocol/status/2082225180898906114
- https://x.com/ETHGlobal/status/2093482258288263371
- https://x.com/privy_io/status/2095888157195616366

### [medium] conf 0.85: Hedera did not sponsor ETHGlobal Lisbon (Jul 2026); it sponsored Cannes (4 Jul 2025), and during Cannes week @hedera_devs posted only a newsletter thread and a HIP update — zero engagement with hackathon builders.

Evidence: VERIFIED. ethglobal.com/events/lisbon/prizes contains The Graph but no Hedera/Privy; /events/cannes/prizes contains all three; from:hedera_devs since:2025-07-01 until:2025-07-12 shows 8 posts, all self-content (newsletter 11.9k views, HIP-1217 13k views).

Sources:
- https://ethglobal.com/events/lisbon/prizes
- https://ethglobal.com/events/cannes/prizes
- https://x.com/hedera_devs/status/1940806582918648204
- https://x.com/hedera_devs/status/1941147077582442549

### [high] conf 0.85: The real mid-event amplifiers on the Hedera side are the community accounts, not the org accounts: @HederaCommunity (144,985 followers, 4-10k views/post, replies to ecosystem people, runs the monthly Hedera Dev Q&A and Hbar Happy Hour Spaces) and @thehbarbull (40,311), plus Ed Marquez (@ed__marquez, 3,430) who quote-tweets ecosystem posts at 1.8-4k views.

Evidence: VERIFIED via fxtwitter profile counts and from:HederaCommunity since:2026-08-20 (Dev Q&A post 10,000 views; 'Neuron is MAJOR!!' reply; Happy Hour #13 2,403 views) and from:ed__marquez since:2026-07-15 (QTs of SaucerSwap 4,097 views, holaNFT ambassadors 2,781 views, 'Cool stuff!' reply to HederaCommunity).

Sources:
- https://api.fxtwitter.com/HederaCommunity
- https://x.com/HederaCommunity/status/2095293381895418296
- https://x.com/HederaCommunity/status/2095215204715970565
- https://x.com/ed__marquez/status/2090410081498050826
- https://x.com/ed__marquez/status/2081764563393925564
- https://api.fxtwitter.com/thehbarbull

### [medium] conf 0.7: Jake Hall (author of the Hedera x402 winners post) is very likely @jaycoolh on X (2,071 followers), who does reply to individual builders in small threads; Michiel Mulders has not posted since 15 Jul; Luke Forrest (ETHOnline Hedera workshop speaker) has no findable X handle.

Evidence: VERIFIED: hedera.com winners post bylined 'Jake Hall, Developer Relations Engineer, UK'; GitHub jaycoolh has 23 commits on hedera-dev/hedera-skills; @jaycoolh bio '@hedera / build cool stuff onchain'; from:jaycoolh since:2026-07-01 shows builder replies (e.g. Solo/Hiero reply 62 views) and QT of Hedera ambassador post 604 views. INFERRED: the identity link jaycoolh = Jake Hall. Workshop title from YouTube oEmbed for -nkd3aorELM. from:michiel_mulders returned nothing since 15 Jul.

Sources:
- https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/
- https://api.github.com/repos/hedera-dev/hedera-skills/contributors
- https://api.fxtwitter.com/jaycoolh
- https://x.com/jaycoolh/status/2085264467722661906
- https://www.youtube.com/watch?v=-nkd3aorELM
- https://api.fxtwitter.com/michiel_mulders

### [high] conf 0.95: Tally (Madhav Gupta, @Madhav__28) already won $1,000 in Hedera's July x402 bounty for 'the spend-control & audit layer for agentic payments on Hedera' (x402 upto ceiling, HCS receipts, npm packages, MCP server) and @hedera_devs publicly praised it — it is the closest prior art to 'agent wallet with caps' and judges will know it.

Evidence: VERIFIED from the Tally README, the winners post and the hedera_devs winner tweet (1,046 views: 'The first non-EVM implementation of x402's upto scheme. An agent signs one spending ceiling off-chain... then pays only what').

Sources:
- https://github.com/Madhav-Gupta-28/Tally
- https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/
- https://x.com/hedera_devs/status/2094435639089656033
- https://api.fxtwitter.com/Madhav__28

### [high] conf 0.9: At least ten ETHOnline 2026 teams are already building x402 sellers on Hedera (created 1-4 Sep), several with live endpoints and settled Blocky402 testnet transactions; three ETHOnline repos are direct 'agent spend caps' competitors (countersign, chip402, mandate).

Evidence: VERIFIED via GitHub search 'hedera x402 created:>2026-08-20' and 'ETHOnline 2026' plus READMEs: fare402 live at fare-production.up.railway.app with 3 HashScan settlements on 4 Sep; x402-work-receipts 'a real HBAR payment settled through the Blocky402 testnet facilitator'; tollgate; hedera-x402-pay-per-inference (demo GIF, HCS topic); turnstile; inference-exchange; hedera-x402-paid-lookup; Ether-Hunt (Hedera+Graph+Arc); AgentTether (Graph+Hedera). Competitors: Ridwannurudeen/countersign-ethonline2026 (owner mandate + guard key, x402-gated /review), Nikodem01/chip402, nisargpatel7042lva/mandate.

Sources:
- https://github.com/ducnmm/fare402
- https://github.com/retailbox-automation/x402-work-receipts
- https://github.com/charlie-morrison/tollgate
- https://github.com/valentin-alexandrov/hedera-x402-pay-per-inference
- https://github.com/pogosiandavid115-dev/turnstile-x402-hedera
- https://github.com/Linus-Shyu/Ether-Hunt
- https://github.com/roderickhodgson/AgentTether
- https://github.com/Ridwannurudeen/countersign-ethonline2026
- https://github.com/Nikodem01/chip402
- https://github.com/livevnx8/hedera-x402-paid-lookup

### [medium] conf 0.85: Hacker chatter about ETHOnline on X is near zero: ETHGlobal's 'who's building at ETHOnline 2026?' post got 3 replies with 4-14 views each, and a keyword search for ETHOnline + (x402/privy/hedera/graph) since 30 Aug surfaces only sponsor cards, Hedera-community reposts and one mentor offer; no team has posted a build in public yet.

Evidence: VERIFIED from the thread page and the live search; the only builder-relevant post is @JulioMCruz (ETHGlobal mentor, 1,849 followers) offering x402/AI-agent help in Discord #mentorship-help (467 views, 4 replies). ETHGlobal reports 1300+ hackers.

Sources:
- https://x.com/ETHGlobal/status/2095907487144935440
- https://x.com/JulioMCruz/status/2095935981669040182
- https://x.com/ETHGlobal/status/2095920997476278280
- https://x.com/hedera/status/2095911871882613100

### [high] conf 0.9: Reddit demand for exactly this product is real and recent: the top posts are about agents draining or overspending ($175K AI wallet drain, $3,400 proxy loop) and about human co-signing of agent spend ('$90 it can't spend without me' at 351 pts on r/ClaudeAI and 99 comments on r/AI_Agents); r/ethdev has an Aug-25 thread asking literally 'How do we let an AI use a wallet without giving the AI unrestricted control?' and its rules allow self-posts.

Evidence: VERIFIED via old.reddit.com search (top, past year) and thread bodies read in Chrome; r/ethdev sidebar: 'No specific rules are enforced apart from the normal global reddit rules... if you post scams, you will be banned.'

Sources:
- https://old.reddit.com/r/pwnhub/comments/1t4r33k/175k_in_crypto_got_drained_from_an_ais_wallet/
- https://old.reddit.com/r/ClaudeAI/comments/1vhp54h/i_gave_a_claude_fable_5_agent_a_domain_and_90_it/
- https://old.reddit.com/r/AI_Agents/comments/1vsy715/i_gave_a_claude_fable_5_agent_a_domain_90_it/
- https://old.reddit.com/r/ethdev/comments/1vxnws5/how_do_we_let_an_ai_use_a_wallet_without_giving/
- https://old.reddit.com/r/OpenClawUseCases/comments/1rsc743/3400_lesson_learned/
- https://old.reddit.com/r/ethdev/comments/1uckfxf/we_gave_ai_agents_ethereum_wallets_and_watched/
- https://old.reddit.com/r/ethdev/comments/1v2y7x2/i_mapped_which_wallet_defense_stops_which/

### [medium] conf 0.9: @BlockyDevs is not reachable on X (dormant since 24 Jul 2024, 97 followers); the Blocky402 team's live surface is GitHub (blockydevs/blocky402) and the hedera-dev repos where MWBlocky and mmyslblocky commit.

Evidence: VERIFIED: BlockyDevs/with_replies newest post 2024-07-24; hedera-skills contributors include MWBlocky (4) and mmyslblocky (1); blocky402.com links only to github.com/blockydevs/blocky402 and twitter.com/blockydevs.

Sources:
- https://x.com/BlockyDevs/with_replies
- https://api.github.com/repos/hedera-dev/hedera-skills/contributors
- https://blocky402.com/
- https://api.fxtwitter.com/BlockyDevs

### [medium] conf 0.85: @graphprotocol is the highest-reach sponsor feed (10-19k views/post) and it explicitly solicits builder replies: 'Poll for agent builders: what breaks your agent most often? Bad or missing data, no way to pay for data, or identity and permissions' (21 Aug, 10 replies) and 'tell us what you're building below' (30 Jul); it also frames x402-paid Subgraph gateways and ERC-8004/Agent0 as its agent story — the exact vocabulary the team's Graph-driven spend decision should use.

Evidence: VERIFIED from from:(GraphDevs OR graphprotocol) since:2026-08-20 and filter:replies listings (views 12,310 and 1,053 respectively; x402 gateway post 15,473 views; ERC-8004 post 19,164 views).

Sources:
- https://x.com/graphprotocol/status/2090609328420171865
- https://x.com/graphprotocol/status/2082793705107247244
- https://x.com/graphprotocol/status/2090445310342451304
- https://x.com/graphprotocol/status/2090795614770491428
- https://x.com/graphprotocol/status/2093356844940918881

### [medium] conf 0.85: Privy will not amplify hackathon teams on X: it follows nobody, posts only product-ship threads and paying-customer case studies, and has posted nothing about ETHOnline; its Discord is tiny (655 members, 22 online).

Evidence: VERIFIED from privy_io/with_replies (Friday ship thread 5,026 views; Zebec case study 38,259 views), fxtwitter profile (following 0), and discord.com/api invite metadata for 'privy'.

Sources:
- https://x.com/privy_io/with_replies
- https://api.fxtwitter.com/privy_io
- https://discord.com/api/v9/invites/privy?with_counts=true

### [low] conf 0.75: Farcaster has no ETHOnline/Hedera-x402 conversation to tap; the only relevant casts are generic Cloudflare/Coinbase agent-wallet news and one builder asking for 'an owner, a spend limit, and a receipt when an agent payment fails'.

Evidence: VERIFIED via client.warpcast.com/v2/search-casts for 'x402 hedera', 'ETHOnline', 'Blocky402' (0 relevant results since June) and 'agent wallet spend limit' (3 low-engagement casts).

Sources:
- https://warpcast.com/gaysonloser/0xb26eae68
- https://warpcast.com/fahime/0x1b67be4b
- https://warpcast.com/kenny/0x077d13e7

## Recommendations

- Ranked engage-list for days 1-3 (format each responds to): 1) @HederaCommunity — reply/QT their Dev Q&A and Happy Hour posts with a 20-30s clip of the shared-Chrome 402 unlock + HashScan link; they reply to ecosystem people and have 145k followers. 2) Hbar Happy Hour X Space hosts @Mauii_MW and @filhetu — ask for 2 minutes on #14 next week; bring a live testnet tx. 3) @ed__marquez — he quote-tweets ecosystem posts that tag @hedera/@hashgraph and mention x402; post a clean demo clip that names 'x402 on Hedera via Blocky402' and tag him and @hedera_devs. 4) @jaycoolh (Jake Hall, INFERRED) — reply in his threads with something technical (he replies to builders; he is the one who wrote the winners post, so he is likely a judge-adjacent voice); mention the 'no smart contract, HCS receipt' pattern he praised. 5) @JulioMCruz — DM/ping in ETHGlobal Discord #mentorship-help; he offered x402 help publicly and has 1.8k followers who are hackers. 6) @narb_s (Narbeh, Hashgraph Solutions Architect, x402 PoC author, hosts devntell podcast) — ask him to sanity-check the Blocky402 flow; a podcast slot is plausible post-submit. 7) @graphprotocol's agent-builder poll thread and 'tell us what you're building' threads — reply with a receipt screenshot showing the Graph query that changed the spend; that account rewards replies with 10k+ view threads. 8) @thehbarbull — the HBAR Bull pushes clips; send a 60s clip after the first live tx. 9) Hedera Discord (hedera.com/discord, 12.6k members) build-support channel — post the live 402 URL and ask other ETHOnline sellers to hit it. 10) r/ethdev thread 1vxnws5 ('How do we let an AI use a wallet without unrestricted control?') — reply with the architecture and repo; r/ethdev allows it. Then r/AI_Agents and r/ClaudeAI 'Cairn' threads: reply (not a new post) describing the co-sign/policy leash and the watchable browser.
- Peer counterparties: pick two live ETHOnline sellers and make the agent PAY THEM on day 3-5 in addition to your own hosted service: ducnmm/fare402 (live Railway merchant, priced per query, HashScan-proven) and valentin-alexandrov/hedera-x402-pay-per-inference (inference). Open a GitHub issue on each ('our agent paid your endpoint under a $2 cap, here is the tx') — this is mutual validation both teams can screenshot for the Hedera 'Validation' rubric, and it is exactly the 'agent discovering and paying for it' language in the track.
- Positioning against prior art the judges already know: Tally (bounty winner, upto ceiling + receipts), countersign (owner mandate + guard key), chip402 (spend-capped x402 plugin). Do not lead with 'spend caps'; lead with the empty cell — a real browser you can watch and grab, with Privy policy as the leash — and cite Tally/countersign in the README as complementary (your agent could pay a Tally-metered endpoint). Judges reward the pattern hedera_devs praised on 2 Sep: settle with native transfers, HCS for the receipt trail, verifiable from the free mirror node.
- Post format that the Hedera accounts actually amplify is a per-project card: repo link with an OG image, one sentence of what is sold and how it settles, a HashScan link. Make the repo README and OG image good by day 2, because the winners thread reuses them verbatim.
- Do not spend effort on @privy_io or @BlockyDevs for reach; for Privy, aim at the 'Best Financial Flow' rubric only and post the Privy policy-reject screenshot on X tagging @privy_io once (no reply expected). For Blocky402, file a real issue/PR on github.com/blockydevs/blocky402 if you hit a gotcha (x402-work-receipts already documented gotchas in spike/README.md) — that is the visible surface for their team.
- Use the Reddit demand quotes verbatim in the landing page and video: '$175K drained from an AI's wallet', '$3,400 lesson learned' (hallucination loop buying proxies), 'money in needs nobody's permission, money out needs a human'. The 'Cairn' post (351 pts, 79 comments on r/ClaudeAI; 99 comments on r/AI_Agents) is the single best normie thread to reply into with a working demo link.
- Watch for: the monthly Hedera Dev Q&A already happened 3 Sep (15:00 UTC); the next is after submission, so use Hbar Happy Hour (weekly Spaces) and Discord instead. ETHGlobal has no schedule page; workshops are recorded videos on the sponsor prize pages.

## Open questions

- Is @jaycoolh actually Jake Hall? Strong circumstantial match (bio, GitHub jaycoolh commits on hedera-skills, UK) but not confirmed by name on the profile.
- Luke Forrest's and Lindsay Walker's X handles could not be found; GitHub 'web3buidlerz' (106 commits on hedera-harness, 62 on scaffold-hbar) is probably Luke Forrest but the profile has no name.
- Whether Hedera DevRel or ETHGlobal reply to builders inside Discord (unreadable here); the ETHGlobal #mentorship-help channel and Hedera build-support channel names are known only from tweets/pages.
- Graph devrel individual handles (Yash from the 'Graph Builders Office Hours' recording, current Graph community leads) were not identified; @GraphDevs itself has only 1,031 followers.
- Exact view/reply counts for a few posts came from the rendered page and may drift; fxtwitter stopped serving new tweet IDs mid-session (rate limit).
- r/CryptoCurrency and r/ChatGPT were only covered via the global Reddit search, not subreddit-restricted searches.
- Whether any ETHOnline team is building on Privy agent wallets at all (GitHub returned 0 hits; X search returned none) — could mean low competition on the Privy tracks or that teams are not public yet.

## All sources

- https://x.com/hedera_devs
- https://x.com/hedera_devs/status/2094435634408821100
- https://x.com/hedera_devs/status/2095121983457423795
- https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/
- https://hedera.com/x402-bounty/
- https://x.com/ed__marquez/status/2080353732873556444
- https://x.com/HederaCommunity/status/2095293381895418296
- https://x.com/graphprotocol/status/2095595183282749896
- https://x.com/graphprotocol/status/2090609328420171865
- https://x.com/privy_io/with_replies
- https://x.com/ETHGlobal/status/2095920997476278280
- https://x.com/ETHGlobal/status/2095907487144935440
- https://x.com/JulioMCruz/status/2095935981669040182
- https://x.com/BlockyDevs/with_replies
- https://x.com/jaycoolh
- https://api.fxtwitter.com/HederaCommunity
- https://api.fxtwitter.com/thehbarbull
- https://api.fxtwitter.com/narb_s
- https://ethglobal.com/events/ethonline2026/prizes/hedera
- https://ethglobal.com/events/cannes/prizes
- https://ethglobal.com/events/lisbon/prizes
- https://ethglobal.com/rules
- https://www.youtube.com/watch?v=-nkd3aorELM
- https://discord.com/api/v9/invites/ethglobal?with_counts=true
- https://discord.com/api/v9/invites/hederahashgraph?with_counts=true
- https://github.com/Madhav-Gupta-28/Tally
- https://github.com/Ridwannurudeen/countersign-ethonline2026
- https://github.com/ducnmm/fare402
- https://github.com/retailbox-automation/x402-work-receipts
- https://github.com/valentin-alexandrov/hedera-x402-pay-per-inference
- https://github.com/charlie-morrison/tollgate
- https://github.com/Linus-Shyu/Ether-Hunt
- https://github.com/roderickhodgson/AgentTether
- https://github.com/Nikodem01/chip402
- https://github.com/hms1499/leash
- https://github.com/blockydevs/blocky402
- https://old.reddit.com/r/ethdev/comments/1vxnws5/
- https://old.reddit.com/r/ClaudeAI/comments/1vhp54h/
- https://old.reddit.com/r/OpenClawUseCases/comments/1rsc743/
- https://old.reddit.com/r/pwnhub/comments/1t4r33k/
- https://client.warpcast.com/v2/search-casts?q=x402%20hedera
