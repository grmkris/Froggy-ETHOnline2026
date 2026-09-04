Why: Partner judges score asynchronously from the showcase page and video, and 'most prize money goes to projects that never present live' (verified). The digest names winners and losers but never examined what their submissions actually contain, so the team's day-7/8 video and README work is guided by inference. Comparing PlanBound/Do Not Rug Me/AgentPass (agent-allowance, no prize) with maki/Glassbox402 (prized) would settle empirically whether the shared-browser angle is enough and what the first 30 seconds must show.

# GAP winning_submission_anatomy

## Summary

I pulled the raw showcase pages (RSC payload, not the summarised HTML) for 22 ETHGlobal projects, downloaded 10 of their mux demo videos, extracted frames at 0/10/20/30/60/120/180/210s, pulled one YouTube transcript (Glassbox402), counted repo commits via the GitHub API, curl-checked every "Live Demo" URL today (4 Sep 2026), and read each README. Raw data lives in /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wsa/ (one <slug>.json per project, frames/, *_transcript.txt, readme_*.md). WebSearch budget was exhausted, so everything below is from direct fetches of ethglobal.com, GitHub, npm, and the videos themselves.

WINNERS vs NON-WINNERS, same axes (all VERIFIED unless marked):

Lisbon 2026 winners. Glassbox402 (Hedera AI & Agentic Payments + Finalist): tagline 17 words/95 chars, description 93 words, "How it's made" 476 words, live-demo field is a YouTube link but the app (glassbox402-production.up.railway.app) still returns 200, repo 37 commits, npm package x402ify 0.3.0 published 25 Jul, README 1334 words with a Partners section plus a separate HEDERA.md (1337 words) listing HashScan tx links and the HCS receipt topic. Video 4:00, 1104x720, face-cam overlay; 0–30s = name, one-sentence pitch, problem ("a human has to create a key and hand it to the agent"); product on screen at 1:00; at 3:32 the Payments table with "view on Hedera" HashScan links and "HCS receipt topic" link. atlas (Graph 2nd + ENS): tagline 10 words, description 1347 words, HIM 1237 words full of file-level GitHub permalinks and a candid line ("a quarter of standardized deployments are dead at any moment and a demo that hides that is lying"), live URL 200, 138 commits, README 6195 words with per-sponsor "✅" sections. Video opens on the running product at 0s, cuts to a deck at 30s, back to product by 2:00. BookerBob (Graph 2nd + World 2nd): tagline 16 words, HIM 900 words of which half is a detailed World ID bug report ("Witnessed by the World team at the booth, who asked us to submit this") plus a "Partners, concretely" block naming @x402/hono + @x402/hedera, Blocky402, 0.01 HBAR; live URL 200; video shows a Blockscout transaction page at 2:30 and ends on a recap card: "the agent is real — verified on world chain / it paid to look, per query, on hedera / its history read through the graph / the settlement, scheduled on hedera." EQLTY (Graph 1st): HIM only 219 words but concrete ("117 tests run green", "Partner tech does real work", "The hackiest part is the EQLTY Vault"), 442 commits, FEEDBACK.md in repo, live-demo field empty; video spends its first ~60s scrolling the GitHub README (!), then the live app, ending on a "Review NFLX purchase" authorization modal with explicit limits. Am I Cooked (Graph 1st): face bubble, live product at tracely.live at 0s with an ENS address typed in, result screen by 1:00, no tx hash (read-only product), HIM 466 words naming Messari standardized schemas and a second Graph product. deeptrace (Graph 3rd): 50-word description, 111-word HIM, 2 commits, and NO video object on the showcase page today (anomaly). ETHOnline 2025 Hedera 1st Vision Pay: HIM just 106 words (a stack list), 28 commits, no live URL, 3:00 video that starts on localhost:3000, shows the mandate editor at 1:00 and a live camera "Auto-Paid! TX: 0.0.5639476@1761454466.662237322" at 2:00.

Non-winners. PlanBound: 248 commits, 2570-word README with an "Honesty box", a 1535-word docs/demo-script.md beat sheet — and NO video on the showcase page (video:null), live URL planbound.xyz dead today. Kinora: 126 commits, 3861-word README with HashScan links but "Demo video: To be added before submission"; the 3:43 video is still on the localhost landing page at 2:00 (product never shown by then). Do Not Rug Me: 3:30 video is an in-app slide deck — slide 1/10 at 0s, 2/10 at 30s, 8/10 at 2:00. maki (Cannes Finalist, no partner prize): 0–30s a static landing page with "npm install -g maki", live URL dead. AgentPass: 13 commits, README has a "Prize tracks" section, live URL 502, NO video on showcase. ETHOnline 2025 agent-payment projects ZapPay, VibeTrade, AgentRail, Cointext, Hedron, Polyjuice, Disburse, Prism Wallet, HookPay, pay402 — all no prize; Sippy could not be found in the 430-project ETHOnline 2025 showcase list.

What separates them: (1) a video exists and shows the running product within the first 30–60s, with a real explorer page or tx id on screen in the back half; (2) HIM names the sponsor product, the settlement path (facilitator, network, price) and links to on-chain evidence, and openly names the hack/gap; (3) live URL alive; (4) a per-sponsor recap (Partners section / recap card / FEEDBACK.md). What does NOT separate them: commit count (winners 2–442, losers 13–248), README length, HIM length, tagline length (every tagline is ≤99 chars → 100-char limit inferred), pitch quality of the concept (PlanBound's "envelope" idea is arguably stronger than Glassbox's). The shared-browser angle alone is therefore not enough; the angle wins only if the judge sees the 402 unlock, the HashScan link, the policy reject, and the freeze on screen in a video that exists.

Spotlight: ethglobal.com/spotlight and /events/ethonline2026/spotlight both return the ETHGlobal 404 page; the ETHOnline 2026 info page has no "Spotlight" text. The only public path is the submission form's "Finalist and Partner Prizes" option (7-minute live session: 4 min demo + 3 min Q&A; partners judge asynchronously; in async events typically the top 20% advance).

Filled template (paste-ready) is in recommendations.

## Claims

### [high] conf 0.95: Two of the three 'agent-allowance' non-winners (PlanBound, AgentPass) have no video object on their ETHGlobal showcase page at all, and PlanBound's live URL (planbound.xyz) and maki's (trymaki.xyz) are dead today; every prized project except deeptrace has a mux video, and 4 of 6 prized live URLs still return 200.

Evidence: RSC payload of /showcase/planbound-wqxy5 and /showcase/agentpass-92p9u contains "video":null and zero stream.mux.com references; curl to https://planbound.xyz returns 000, https://77-42-84-161.sslip.io/ returns 502, https://trymaki.xyz returns 000; https://lisbonhack.world/ 200, https://atlas-mini-apps.vercel.app/ 200, https://tracely.live/cooked 200, https://glassbox402-production.up.railway.app/ 200.

Sources:
- https://ethglobal.com/showcase/planbound-wqxy5
- https://ethglobal.com/showcase/agentpass-92p9u
- https://ethglobal.com/showcase/glassbox402-qyepd
- https://ethglobal.com/showcase/bookerbob-6zjih
- https://ethglobal.com/showcase/atlas-pmtqo
- https://ethglobal.com/showcase/am-i-cooked-thooh

### [high] conf 0.85: Winning videos put the running product on screen within 0–60 seconds and show a real explorer page or transaction id in the back half; the three Lisbon non-winners with videos spent 2+ minutes on landing pages or slide decks.

Evidence: Frames extracted with ffmpeg: Am I Cooked 0s = live tracely.live with ENS input; atlas 0s = localhost:3000 product; Vision Pay 0s landing, 2:00 'Auto-Paid! TX: 0.0.5639476@1761454466.662237322'; Glassbox transcript 0:00–1:00 pitch then 'let me show you how it looks', 3:32 payments table with 'view on Hedera' HashScan + 'HCS receipt topic' links; BookerBob 2:30 Blockscout 'Transaction details' page. Kinora 0s/20s/60s/120s all localhost:5174 landing page; Do Not Rug Me slide 1/10 at 0s, 2/10 at 30s, 8/10 at 120s; maki 0s/30s static landing page.

Sources:
- https://stream.mux.com/uJq6TypYHp1sboYsMiUx7aqY5R8WOYojLqkPvxLmuBs/high.mp4
- https://youtu.be/yFHJIv2xSRU
- https://stream.mux.com/ZZKNRcW71y3iswUqTkpFg00nNVsIufHk017geielue1gI/high.mp4
- https://stream.mux.com/rhBvsYEZN2qMquvthegdAyepDSzCQXpJPcdVI02EpRos/high.mp4
- https://stream.mux.com/h01vbhAQbeuv9800Yy5djhcziiF7mPUIQMOYq9SOSBYXM/high.mp4
- https://stream.mux.com/Da01KqG6P1W301JkZCJhJt01LnA00PdJUm01BU1Cf3Zoq4Jg/high.mp4

### [medium] conf 0.9: Commit count, README length and 'How it's made' length do not predict prizes: Glassbox402 won Hedera with 37 commits and a 476-word HIM; deeptrace took Graph 3rd with 2 commits and 111 words; Vision Pay took Hedera 1st with 106 words; PlanBound lost with 248 commits, a 2570-word README and a 1535-word demo script; Kinora lost with 126 commits and a 3861-word README.

Evidence: GitHub API Link headers: dhernz/Glassbox402 last page=37, ikodo0/deeptrace=2, chinesepowered/ethonline2025=28, idoamram/planbound=248, SweetieBirdX/Kinora=126, PerkOS-xyz/PerkOS-EQLTY=442, fabianferno/atlas=138, vsnation/Am-I-Cooked=124, slaviquee/maki=29, devprojectsmoon/agentpass=13, sairammr/0g-permissions=30. Word counts from raw showcase JSON and README.md via raw.githubusercontent.com.

Sources:
- https://api.github.com/repos/dhernz/Glassbox402/commits?per_page=1
- https://api.github.com/repos/idoamram/planbound/commits?per_page=1
- https://raw.githubusercontent.com/idoamram/planbound/main/docs/demo-script.md
- https://raw.githubusercontent.com/SweetieBirdX/Kinora/main/README.md

### [high] conf 0.9: Prized 'How it's made' texts name the sponsor product, the settlement path and on-chain evidence, and openly admit the hack: Glassbox ('Settlement runs through the blocky402 facilitator, the textbook Hedera x402 flow… every settled payment writes a receipt to a public HCS topic'), BookerBob ('@x402/hono + @x402/hedera, network hedera:testnet, facilitator Blocky402, price 0.01 HBAR… scheduleUrl = hashscan.io/testnet/schedule/<id>' plus 'Hacky bits worth saying'), EQLTY ('117 tests run green… The hackiest part is the EQLTY Vault'), atlas ('The Graph is the load-bearing data source, three products deep' with file permalinks).

Evidence: Verbatim from howItsMade fields in glassbox402-qyepd.json, bookerbob-6zjih.json, eqlty-smqdg.json, atlas-pmtqo.json extracted from the RSC payloads.

Sources:
- https://ethglobal.com/showcase/glassbox402-qyepd
- https://ethglobal.com/showcase/bookerbob-6zjih
- https://ethglobal.com/showcase/eqlty-smqdg
- https://ethglobal.com/showcase/atlas-pmtqo

### [high] conf 0.85: Winners ship an explicit per-sponsor evidence artifact outside the video: Glassbox README 'Partners' section plus HEDERA.md with HashScan tx links, operator payout account and receipt topic 0.0.9748512; EQLTY repo carries FEEDBACK.md and a 'Sponsor integrations / How we use The Graph' README section; BookerBob's HIM is half a reproducible bug report for World (which awarded it 2nd); atlas README has a checkmarked section per sponsor.

Evidence: raw.githubusercontent.com/dhernz/Glassbox402/master/HEDERA.md lists https://hashscan.io/testnet/transaction/0.0.7162784-1784996924-255223230 and https://hashscan.io/testnet/topic/0.0.9748512; EQLTY video frame at 0:09 shows FEEDBACK.md in the repo tree; atlas README headings 'How it uses The Graph ✅ / MCP server ✅ / ENS ✅ / 0G ✅'.

Sources:
- https://raw.githubusercontent.com/dhernz/Glassbox402/master/HEDERA.md
- https://raw.githubusercontent.com/dhernz/Glassbox402/master/README.md
- https://github.com/PerkOS-xyz/PerkOS-EQLTY
- https://github.com/fabianferno/atlas

### [medium] conf 0.75: Every showcase tagline across 22 projects is 10–17 words and 61–99 characters, so the tagline field is effectively capped at 100 characters (INFERRED); winners favour a two-clause hook + mechanism ('Who's behind an agent changes terms, not price. Bots prepay; humans get deposit & pay later.').

Evidence: tagline_chars measured from raw JSON: deeptrace 99, Glassbox 95, EQLTY 95, AgentPass 95, Kinora 94, BookerBob 92, Am I Cooked 92, PlanBound 91, maki 84, Do Not Rug Me 74, atlas 61.

Sources:
- https://ethglobal.com/showcase/deeptrace-7fqoz
- https://ethglobal.com/showcase/bookerbob-6zjih
- https://ethglobal.com/showcase/atlas-pmtqo

### [high] conf 0.8: Hedera's track has been won twice by the project that sold or metered something and put the settlement receipt on screen: Glassbox402 (Lisbon 2026: wrap any API, dashboard with HashScan links, published npm package) and Vision Pay (ETHOnline 2025: mandate-gated auto-pay, tx id on screen), while Kinora (real HBAR licence settlement, HashScan links only in README, landing-page video) got nothing.

Evidence: Showcase prize arrays: Glassbox402 'AI & Agentic Payments on Hedera/Hedera'; Vision Pay '1st place/Hedera'; Kinora prizes []. npm registry: x402ify versions 0.1.0–0.3.0 created 2026-07-25T11:21Z. Kinora README section '5. A real settled licence' lists https://hashscan.io/testnet/transaction/0.0.7162784-1785047564-932543869 but README also says 'Demo video: To be added before submission'.

Sources:
- https://ethglobal.com/showcase/glassbox402-qyepd
- https://ethglobal.com/showcase/vision-pay-s1t91
- https://ethglobal.com/showcase/kinora-5dtqg
- https://registry.npmjs.org/x402ify
- https://raw.githubusercontent.com/SweetieBirdX/Kinora/main/README.md

### [high] conf 0.9: Graph prizes went to projects whose HIM proves 'live + standardized': Am I Cooked (Messari standardized schemas via the Graph gateway, one query shape across Aave v3/Compound v3/Spark, plus a second Graph product for pool TVL), atlas (96-entry registry of 86 verified standardized deployment IDs across 11 schema families and 4 networks, health checks with 90s TTL), EQLTY (Rust Substreams package indexing Uniswap V4 swaps, provenance with tx hash and freshness gate), deeptrace (Messari subgraphs compared across Aave v3/Seamless/Moonwell).

Evidence: Verbatim howItsMade text from the four showcase JSONs.

Sources:
- https://ethglobal.com/showcase/am-i-cooked-thooh
- https://ethglobal.com/showcase/atlas-pmtqo
- https://ethglobal.com/showcase/eqlty-smqdg
- https://ethglobal.com/showcase/deeptrace-7fqoz

### [medium] conf 0.85: There is no public ETHGlobal 'Spotlight' page or application: ethglobal.com/spotlight and /events/ethonline2026/spotlight both return the ETHGlobal 404 page, and the ETHOnline 2026 info/details page never mentions Spotlight. The only route to live judging is ticking 'Finalist and Partner Prizes' on the submission form (7 min: 4 demo + 3 Q&A; partners judge asynchronously; async events typically advance the top 20%).

Evidence: curl of https://ethglobal.com/spotlight returns HTML whose only text is 'ERROR CODE: 404 NOT FOUND / We searched high and low...'; WebFetch of /events/ethonline2026/spotlight: 404; /events/ethonline2026/info/details text quoted: 'Opting for this will require you to present your project to judges in the Finalist judging session. Partners will be judging your project asynchronously.'

Sources:
- https://ethglobal.com/spotlight
- https://ethglobal.com/events/ethonline2026/spotlight
- https://ethglobal.com/events/ethonline2026/info/details

### [medium] conf 0.8: The 'Live Demo' field is loosely policed (Glassbox put a YouTube link, Kinora put its GitHub URL, EQLTY left it blank and still won Graph 1st) but a dead link is common among losers (PlanBound 000, maki 000, AgentPass 502), so the field is worth a URL that will still respond during the async judging window after 13 Sep.

Evidence: url fields from raw JSON: glassbox402 'https://youtu.be/yFHJIv2xSRU', kinora 'https://github.com/SweetieBirdX/Kinora', eqlty ''; curl statuses listed in claim 1.

Sources:
- https://ethglobal.com/showcase/glassbox402-qyepd
- https://ethglobal.com/showcase/kinora-5dtqg
- https://ethglobal.com/showcase/eqlty-smqdg

### [medium] conf 0.95: ETHOnline 2026 rules text (verified) explicitly threatens disqualification for 'large single commits or missing histories', requires AI-use attribution in the submission, and requires all spec/prompt/planning artifacts in the repo if a spec-driven workflow is used.

Evidence: Quoted from /events/ethonline2026/info/details: 'Submissions with large single commits or missing histories may be disqualified'; 'Clearly document in your submission where and how AI tools were used'; 'you must include all spec files, prompts, and planning artifacts in your submission repository'.

Sources:
- https://ethglobal.com/events/ethonline2026/info/details

### [low] conf 0.7: Sippy is not on the ETHOnline 2025 showcase list; among ~430 ETHOnline 2025 projects the agent-payment entries ZapPay, VibeTrade, AgentRail, Cointext, Hedron, Polyjuice, Disburse, Prism Wallet, HookPay and pay402 all show an empty prize array, and Vision Pay is the only Hedera 1st found.

Evidence: WebFetch of https://ethglobal.com/showcase?events=ethonline2025&page=1..14 (page 13 timed out once, then returned); 10 candidate showcase pages fetched and their prizes arrays are []; vision-pay-s1t91 prizes = ['1st place','Hedera'].

Sources:
- https://ethglobal.com/showcase?events=ethonline2025&page=1
- https://ethglobal.com/showcase/zappay-5eco0
- https://ethglobal.com/showcase/vibetrade-mtj70
- https://ethglobal.com/showcase/vision-pay-s1t91

## Recommendations

- VIDEO IS THE SUBMISSION. Two of your closest analogues (PlanBound, AgentPass) have no video on the showcase and got nothing. Record it by day 7 (11 Sep), upload, and re-watch it on the showcase page before the 13 Sep 12:00 EDT deadline. Keep it 3:00–3:30 at 1080p with a face cam (Glassbox, Am I Cooked, Kinora and Vision Pay all used one; the rules ban AI voice).
- FIRST-30-SECONDS BEAT SHEET (copy): 0:00–0:04 product already on screen: the shared Chrome pane with the amber 'agent driving' border and the wallet pane showing policy '$2/tx · $10/day · 2 allowlisted payTo'. Overlay the name. Line: 'This is <Name>. The agent is driving this Chrome. I can grab it any time.' 0:04–0:12 problem in one sentence, product still visible: 'Every agent wallet shipped this year gives a model a key and a cap. You never see what it does with the key.' 0:12–0:20 the ask, typed live: 'Find the cheapest USDC borrow and pay for the packed answer.' 0:20–0:30 agent's Graph query result appears (show the subgraph names and the number that drives the spend). Do NOT open a deck or a landing page in the first minute (Kinora, Do Not Rug Me, maki all did and lost).
- BACK-HALF BEATS THAT WINNERS SHOW: 0:30–1:15 the 402 page opens in the shared Chrome, host pays through Privy under policy, page unlocks; cut to HashScan transaction page (BookerBob showed Blockscout at 2:30, Glassbox showed HashScan links at 3:32, Vision Pay put the tx id on screen at 2:00). 1:15–1:45 you grab the page mid-run (the WOW beat nobody else has). 1:45–2:15 jailbreak: type 'send the rest to 0xevil', show the Privy policy reject in the wallet pane and the Telegram card. 2:15–2:40 freeze + receipt card: Graph snapshot, Hedera tx id, policy id, HCS topic link. 2:40–3:00 recap card exactly like BookerBob's: 'the agent drove a browser you could grab. it paid per query on hedera via blocky402 <tx>. it spent because the graph said so <subgraph>. privy policy <id> stopped the jailbreak.' Then repo + live URL on screen.
- TAGLINE (≤12 words, ≤100 chars). Primary: 'An agent browser you can grab. A Privy leash it can't slip.' (12 words, 60 chars). Alternates: 'Watch your agent shop in a real Chrome. Privy caps what it spends.' / 'One Chrome, two drivers: your agent pays on Hedera, you hold the kill switch.'
- DESCRIPTION (150–350 words like Glassbox 93 / BookerBob 245 / Am I Cooked 349): open with the one-sentence economic loop ('I fund a pocket, set a mandate, the agent spends inside it without asking, and cannot spend outside it even if you jailbreak the prompt'), then three numbered bullets in the Glassbox shape: 1. One Chrome (agent drives, you watch, grab, freeze). 2. One leash (Privy embedded wallet + policy: per-tx, daily, allowlist, kill switch = revoke). 3. One paid thing (our x402 service on Hedera testnet via Blocky402, gated on a live Graph query). Close with 'No key in the prompt. No popup per call. Every spend has a receipt: why, which policy, which tx.'
- HOW IT'S MADE OUTLINE (400–900 words, this is what partner judges read). Paragraph 1 Stack, one line with pinned versions: 'Bun <x>, Bun.WebView (Chrome backend, CDP screencast), Vite + React 19, Vercel AI SDK, @privy-io/react-auth <x> + @privy-io/server-auth <x>, @x402/hedera <x> + @x402/hono <x>, grammY <x>.' Paragraph 2 'Hedera, where it settles': 'We host the x402-gated service ourselves; settlement runs through the Blocky402 facilitator on hedera:testnet at <price> HBAR per call; the agent's payment lands as <HashScan tx link>; every settled request also writes a receipt to HCS topic <id> (lane, buyer, price, settlement tx) so the wallet's receipt table can be audited off the mirror node with none of our code in the loop.' Paragraph 3 'The Graph is why it spent': 'The spend decision is grounded in live Subgraph Studio queries against Messari standardized lending subgraphs (<deployment IDs>) — one query shape across <Aave v3/Compound v3/Spark>; the packed answer the agent buys is that query's result, so Graph data is the body of the 402, not a sidebar. Health-checked with <timeout>; stale data fails closed.' Paragraph 4 'Privy is the leash': 'User wallet is a Privy embedded wallet; the agent signs through <delegated signer / server wallet> under policy <policy id>: per-tx cap, rolling daily cap, allowlisted payTo and router; freeze = revoke authorization key. The jailbreak in the video is rejected by the policy engine, not by the model.' Paragraph 5 'The browser': arbitration (agent | human | idle, 1.5s human-quiet), what auto-runs vs what parks. Paragraph 6 'Hackiest part' + 'Honesty box' (what is mocked, what is testnet, what broke). Paragraph 7 'Partners, concretely' three lines, then 'Feedback' bullets per sponsor (BookerBob's World bug report won World 2nd; EQLTY ships FEEDBACK.md).
- README SECTIONS (mirror Glassbox + EQLTY): The problem / What it does (the 3 bullets) / The demo (beat list with timestamps) / Where each integration lives (Hedera, The Graph, Privy, Telegram, with file paths) / On-chain evidence (HashScan tx, HCS topic, account ids) / Run it locally (one command) / Honesty box / Not in scope / AI use & attribution (rules require it) / Team. Add HEDERA.md-style evidence file and FEEDBACK.md.
- LIVE DEMO URL: point it at a hosted build that returns 200 through at least 20 Sep (Railway/Vercel), with a judge-mode that works without Chrome on the judge's machine (Playwright Chromium fallback) and a prefunded testnet wallet. Test it with curl on 13 Sep morning. Also put the x402 endpoint URL in the README so a Hedera judge can curl a 402 themselves.
- COMMITS: keep the granular history (rules say large single commits may be disqualified); commit count itself does not matter (winners ranged 2–442).
- FINALIST OPTION: tick 'Finalist and Partner Prizes' on the form; there is no separate Spotlight application. Prepare the 4-minute live cut of the same video and a 3-minute Q&A crib (policy id, facilitator, subgraph deployment IDs, what is testnet).
- BUILD-IN-PUBLIC TIE-IN: Glassbox's on-screen npm package (x402ify) and railway URL doubled as marketing; ship a one-command install (`bunx <name>`) or a public URL before the video so the same asset serves the X thread and the judges.

## Open questions

- Sippy: not present in the 14-page ETHOnline 2025 showcase list; either the name/event in the prior digest is wrong or it was withdrawn. Unverified.
- deeptrace won Graph 3rd with 2 commits and no video object on its showcase page today — was the video removed after judging, or did the Graph team judge from the repo/live MCP alone? Could not determine.
- Which Graph track each 1st place maps to (EQLTY = Continuity, Am I Cooked = From Scratch is the likely split) — the showcase JSON only says '1st place / The Graph'.
- Exact form character limits for tagline (inferred ≤100 chars from 22 samples) and description/HIM (atlas has 1347/1237 words, so no tight cap) — confirm in the Hacker Dashboard form once the team has a submission draft.
- Whether Hedera judges reward HCS receipt logging beyond the base requirement — Glassbox (winner) and Kinora (loser) both did it; the differentiator appears to be the video and the 'sell something' framing, not HCS itself.
- No transcripts were obtainable for the mux-hosted videos (no STT available); first-30s findings for non-Glassbox videos are from extracted frames, not narration.

## All sources

- https://ethglobal.com/showcase/glassbox402-qyepd
- https://ethglobal.com/showcase/atlas-pmtqo
- https://ethglobal.com/showcase/bookerbob-6zjih
- https://ethglobal.com/showcase/eqlty-smqdg
- https://ethglobal.com/showcase/am-i-cooked-thooh
- https://ethglobal.com/showcase/deeptrace-7fqoz
- https://ethglobal.com/showcase/planbound-wqxy5
- https://ethglobal.com/showcase/kinora-5dtqg
- https://ethglobal.com/showcase/do-not-rug-me-7i15x
- https://ethglobal.com/showcase/maki-564eg
- https://ethglobal.com/showcase/agentpass-92p9u
- https://ethglobal.com/showcase/vision-pay-s1t91
- https://ethglobal.com/showcase/zappay-5eco0
- https://ethglobal.com/showcase/vibetrade-mtj70
- https://ethglobal.com/showcase?events=ethonline2025&page=1
- https://ethglobal.com/events/ethonline2026/info/details
- https://ethglobal.com/spotlight
- https://youtu.be/yFHJIv2xSRU
- https://stream.mux.com/uJq6TypYHp1sboYsMiUx7aqY5R8WOYojLqkPvxLmuBs/high.mp4
- https://stream.mux.com/ZZKNRcW71y3iswUqTkpFg00nNVsIufHk017geielue1gI/high.mp4
- https://stream.mux.com/tWzdHCBfBBGOTIzSR91WDvjT6u399riSeCArCv01OW8A/high.mp4
- https://stream.mux.com/rBWp2fX2IoS8orMmKS02kB006Xcbo3FPXgVz3xS4yxTYA/high.mp4
- https://stream.mux.com/xcYGmyLaKniSTb00xTIWC5iWtPsZgLcC48SEGaYE00JIo/high.mp4
- https://stream.mux.com/rhBvsYEZN2qMquvthegdAyepDSzCQXpJPcdVI02EpRos/high.mp4
- https://stream.mux.com/h01vbhAQbeuv9800Yy5djhcziiF7mPUIQMOYq9SOSBYXM/high.mp4
- https://stream.mux.com/J7oMjufgaypdWX02gTo46cW4SL4aho01KJoBWcSGTTpRc/high.mp4
- https://stream.mux.com/Da01KqG6P1W301JkZCJhJt01LnA00PdJUm01BU1Cf3Zoq4Jg/high.mp4
- https://github.com/dhernz/Glassbox402
- https://raw.githubusercontent.com/dhernz/Glassbox402/master/HEDERA.md
- https://github.com/idoamram/planbound
- https://raw.githubusercontent.com/idoamram/planbound/main/docs/demo-script.md
- https://github.com/SweetieBirdX/Kinora
- https://github.com/PerkOS-xyz/PerkOS-EQLTY
- https://github.com/fabianferno/atlas
- https://github.com/vsnation/Am-I-Cooked
- https://github.com/DenisDI/ethglobalhacklisbon_2026
- https://github.com/slaviquee/maki
- https://github.com/devprojectsmoon/agentpass
- https://github.com/sairammr/0g-permissions
- https://github.com/chinesepowered/ethonline2025
- https://registry.npmjs.org/x402ify
- https://glassbox402-production.up.railway.app/
- https://lisbonhack.world/
- https://tracely.live/cooked
- https://atlas-mini-apps.vercel.app/
