# Research: what is actually true on 4 Sep 2026

Companion to `docs/PLAN.md` and `docs/architecture.md`. Those files are the team's plan. This file is what 118 research agents found when they checked that plan against primary sources today. Where the two disagree, this file wins, and section 10 lists every disagreement.

How it was produced: nine research dimensions ran in parallel (demand, competition, segments, build-in-public, feasibility, prizes, retention, safety, hackathon meta). Every high-impact claim was then attacked by two independent verifiers (one fetched the cited sources, one hunted for counter-evidence). A critic listed contradictions and gaps, and six gap studies settled them, including live Docker runs of `Bun.WebView`, live HTTP probes of Blocky402 and The Graph's x402 gateways, and unpacking the `@x402/hedera` and Privy npm packages. Full digests with every URL live in `research_FABLE51/`. Facts below are VERIFIED unless marked INFERRED.

Sibling files: `README_FABLE51.md` (the index), `PRODUCT_FABLE51.md` (the refined product), `PIVOT_ASSESSMENT_FABLE51.md` (the KIMI ideas validated against the same evidence), `TARGET_GROUPS_FABLE51.md`, `BUILD_IN_PUBLIC_FABLE51.md`, `PRIZE_AUDIT_FABLE51.md`, `DAY0_CHECKLIST_FABLE51.md`.

---

## 1. Ten things that change the plan

1. **Privy cannot be the leash on the Hedera leg.** Privy policies never evaluate raw signatures, and the Hedera x402 scheme needs a raw-signed native transaction. The Hedera payment must come from a host-held agent pocket with host caps. Privy gates only what flows into that pocket and everything on Base.
2. **Privy's daily cap does not cover x402.** Rolling aggregations exist only for `eth_signTransaction` and `eth_signUserOperation`. x402 on EVM is typed data. Per-payment cap, payee allowlist, chain pin and expiry are enforceable in Privy; the daily budget must be a host ledger.
3. **The Graph's testnet x402 gateway is not a working path for lending data.** The documented hostname does not resolve, and the working host almost certainly does not serve the Messari mainnet subgraphs. The real options are the mainnet gateway at $0.01 per query with a few dollars of real USDC, or a free Subgraph Studio key.
4. **The browser bet is real and hostable.** `Bun.WebView` drives Chrome inside Linux Docker with screencast and input working. It needs Bun 1.4.1, one worker process per user, a serialized CDP queue, and profile hygiene. A single Hetzner box serves 10 to 20 concurrent testers.
5. **The leash alone will not place.** Spend caps, allowlists and kill switches are shipped by OpenSpender, piprail, MetaMask Agent Wallet and others, and hackathon entries that were only caps won nothing at Lisbon and Cannes. Hedera already paid Tally for agent spend ceilings in August.
6. **The shared, grabbable browser plus an out-of-model policy is an empty cell, narrowly.** Nobody found a shipped product with both. Watch and take-over browsers exist without wallets; wallets exist without browsers. Cloudflare and Brave are the closers to watch.
7. **The video is the submission.** Partners judge asynchronously from the repo, showcase page and video. Two of the closest failed analogues had no video on their showcase at all. Winners put the running product on screen within a minute and a real transaction id in the back half.
8. **Real demand is on Reddit, not on the X posts the plan cites.** The Bankr drain thread, the "$90 it can't spend without me" thread and the r/ethdev "how do we let an AI use a wallet" thread are the strongest signals. Four of the seven X posts in the plan have under 1,200 views.
9. **Sponsors will not amplify you mid-event.** The org accounts reply only to themselves. The people who do engage are the Hedera community account, two named Hedera DevRel people, The Graph's reply threads, and one ETHGlobal mentor.
10. **The prior-art repos are not on Jonas's machine.** `~/code/invok`, `humanhook`, `boter`, `harness`, `starters` do not exist here. Either Kristjan pushes the specific files or the team starts clean.

---

## 2. Rules that bind (ETHOnline 2026)

Source: [ethglobal.com/events/ethonline2026/info/details](https://ethglobal.com/events/ethonline2026/info/details), the event page schedule JSON, and [ethglobal.com/rules](https://ethglobal.com/rules).

| Item | Rule |
| --- | --- |
| Submission | Sun 13 Sep 2026 12:00 EDT. No late submissions, no grace period. |
| Check-ins | #1 due Mon 7 Sep 23:59 EDT. #2 due Thu 10 Sep 23:59 EDT. Consequence of missing them is undocumented. |
| Feedback sessions | Tue 8 Sep 14:00 EDT and Thu 10 Sep 09:00 EDT. |
| Judging | Async round from Sun 13 Sep 15:00 EDT. Live round Mon 14 Sep 12:00 EDT, 7 minutes (4 demo + 3 Q&A). Finale Wed 16 Sep 12:00 EDT. |
| Video | 2 to 4 minutes (auto-rejected outside), at least 720p (upload fails below), human narration, no TTS or AI voice, not sped up, not phone-recorded. Hedera tracks add: the video must show the paid request executing. |
| Partner prizes | Select up to 3 partners at submission. A partner with several tracks counts as one. Privy (2 tracks), The Graph (2 non-Continuity tracks), Hedera (AI & Agentic Payments) fit exactly. |
| Who judges | Partners judge asynchronously from repo, showcase page and video. They do not see round-one results. The entire $80k pool is partner prizes; live judging is visibility, not money. |
| Start Fresh | Project-specific code, designs and assets must begin after kickoff. Open-source libraries and starter kits are fine if disclosed. Planning docs are fine. |
| Commit history | "Submissions with large single commits or missing histories may be disqualified." |
| AI attribution | Document where and how AI tools were used. If spec-driven, include all spec files, prompts and planning artifacts in the submission repo. |
| Prior work | Must be disclosed in writing. Undisclosed prior work means disqualification, revoked prizes, possible ban. |
| Team | Up to 5 people. Each member stakes ETH, refunded on submission. |
| Showcase fields | Title, tagline (every observed tagline is under 100 characters), description, "How it's made", video, live demo URL, source URL. There is no Spotlight program; the page 404s. |

Hedera ships its own hackathon rubric in [hedera-dev/hedera-skills](https://github.com/hedera-dev/hedera-skills) (hackathon-helper): Execution 20%, Success on Hedera metrics 20%, Integration 15%, Validation with real user feedback 15%, Innovation 10%, Feasibility 10%, Pitch 10%. Whether ETHOnline judges apply it verbatim is INFERRED, but it makes real testers score-bearing.

---

## 3. What winning submissions look like

Twenty-two showcase pages were pulled raw, ten videos downloaded and frame-sampled, one transcript read, live URLs curl-checked, repos counted. Digest: `research_FABLE51/gap-winning_submission_anatomy_FABLE51.md`.

What separates winners from losers on the same axes:

- **A video exists and shows the running product within 60 seconds.** Glassbox402 (Hedera winner and Finalist at Lisbon 2026) pitches for 60 seconds then shows the product; Am I Cooked and atlas open on the live product at 0:00. Kinora's video sat on a landing page for two minutes; Do Not Rug Me's was a slide deck; PlanBound and AgentPass had no video object on their showcase pages at all.
- **A real explorer page or transaction id is on screen in the back half.** Glassbox showed HashScan links at 3:32; Vision Pay (ETHOnline 2025 Hedera 1st) put the Hedera tx id on screen at 2:00; BookerBob showed a Blockscout page at 2:30.
- **"How it's made" names the sponsor product, the settlement path and on-chain evidence, and admits the hack.** Glassbox: "Settlement runs through the blocky402 facilitator... every settled payment writes a receipt to a public HCS topic." BookerBob: package names, network, facilitator, price, plus a "Hacky bits worth saying" section. EQLTY: "117 tests run green... The hackiest part is the EQLTY Vault."
- **A per-sponsor evidence artifact outside the video.** Glassbox has a `HEDERA.md` with HashScan transaction links and the receipt topic id. EQLTY has `FEEDBACK.md`. atlas has a checkmarked section per sponsor.
- **The live URL still responds.** Four of six prized live URLs return 200 today. PlanBound's and maki's are dead.

What does not predict a prize: commit count (winners ranged 2 to 442), README length, tagline length, concept quality (PlanBound's "envelope" idea is arguably stronger than Glassbox's).

Sponsor-specific patterns:

- **Hedera** rewarded projects that sold or metered something and put the receipt on screen: Glassbox402 ("Google Analytics for x402", x402ify any API, MCP server, published npm package) and Vision Pay (mandate-gated auto-pay). Kinora, which also settled via Blocky402, lacked a video and got nothing.
- **The Graph** praised standardized schemas ("one query format covers Aave v3, Compound v3, and Spark"), pinned deployment ids, freshness gates, returning "unavailable" over stale data, and a second Graph product. atlas placed 2nd with an honestly disclosed unexercised x402 stub. Source: [The Graph's Lisbon 2026 winners post](https://thegraph.com/blog/ethglobal-lisbon-2026-winners/).
- **Privy** rewarded clean, shallow integrations using the exact feature the track names, inside a polished consumer demo. Agent-track winners were server-wallet agents with an allowlist. Privy slots often go unawarded (one of four at New York 2026). A Telegram-plus-Privy delegated-wallet project (Deport The Dip) won nothing. Digest: `research_FABLE51/gap-privy_track_intel_FABLE51.md`.

Prior art the judges already know: [Tally](https://github.com/Madhav-Gupta-28/Tally) (Hedera x402 bounty winner announced 31 Aug 2026, agent-signed spend ceiling via the `upto` scheme, HCS receipts, MCP server, npm packages), HumanMandate (Lisbon: daily caps, revoke, selfie step-up), and this week's ETHOnline repos countersign, chip402 and mandate. "An agent wallet with caps" reads as a repeat.

---

## 4. Verified technical facts

### 4.1 Browser: Bun.WebView

Digests: `dim-feasibility`, `gap-hosting_public_testers`.

- On Jonas's Mac (Bun 1.3.14, Chrome 152), `Bun.WebView` with the Chrome backend works end to end: navigate, evaluate, raw `cdp()`, `Page.startScreencast` frames, `Input.dispatch*`, `Accessibility.getFullAXTree`. Pass an explicit Chrome `path`; auto-detect picked a stale HeadlessChrome 108 binary.
- Inside Linux Docker (`oven/bun:1.4.1` plus apt `chromium` 152) it also works: 31 screencast frames and 31 acks in 2.7 seconds, mouse and keyboard reach the page, `closeAll()` leaves no orphans when the container runs with `--init`. As root it needs `--no-sandbox --disable-dev-shm-usage`; as user `bun` it needs `--cap-add=SYS_ADMIN`. The Bun PR that would add these defaults ([#39490](https://github.com/oven-sh/bun/pull/39490)) is still open.
- Constraints that shape the architecture:
  - Headless only. The human sees the page only through the screencast. This is what the plan already assumes.
  - One Chrome per Bun process. Per-view `dataStore` directories and `backend.url` connect mode were both verified to be ignored after the first view. One profile per user therefore means one worker process per user, or puppeteer-core with one browser context per user.
  - `view.cdp()` allows exactly one command in flight; a second throws `ERR_INVALID_STATE`. Screencast acks, human input and agent commands must go through one serialized queue per view.
  - `Target.attachToTarget` returns a session id, but `cdp()` cannot route to it. Only the primary tab is drivable.
  - `close()` on the Chrome backend throws an uncatchable rejection in 1.3.14. Bun 1.4.1, released 4 Sep 2026, fixes it. Upgrade.
  - Profile persistence: cookies were lost after a SIGKILL. Call `Browser.close` before exit, and `rm -f <profile>/Singleton*` at boot because Chrome's lock encodes the container hostname.
  - `navigator.webdriver` is true and the UA says HeadlessChrome by default. `--disable-blink-features=AutomationControlled` plus a normal UA string fixes both.
  - `evaluate()` is expression-only. Use `Emulation.setDeviceMetricsOverride` for an exact viewport.
- Login inside the server Chrome: Google's help page says it blocks automated or embedded browsers, so Google OAuth is unreliable even with stealth flags. Passkeys need a CDP virtual authenticator. Turnstile may challenge datacenter IPs. Privy login happens in the user's own browser (the workspace UI), so it is unaffected. The "human grabs the page to log in" beat should target an email-plus-OTP site or the team's own page.
- Fallback: puppeteer-core or Playwright uses byte-identical CDP calls. Only the transport changes. About one day to swap.
- Hosting: Chrome uses 0.5 to 0.8 GB per active tester. Hetzner CX43 (8 vCPU, 16 GB, EUR 16.49 per month) handles 10 to 20 concurrent sessions; CX23 (EUR 5.99) covers the first five. Docker Compose plus Caddy for TLS: 4 to 6 hours. Worker-per-user isolation: one more day. Cloud Run is a poor fit (60-minute WebSocket cap, no persistent disk). A working Dockerfile and six probe scripts are in the session scratchpad under `wvtest/`.
- WebMCP: Chrome origin trial only, no mainstream consumer, the Claude Chrome extension request was closed as not planned. Cut it.

### 4.2 Custody and policy

Digests: `gap-hedera_leg_privy_policy`, `dim-feasibility`, `dim-safety`, `dim-prizes`. Primary sources: [Privy policies overview](https://docs.privy.io/controls/policies/overview), [stateful policies](https://docs.privy.io/controls/policies/stateful-policies), [Privy x402 recipe](https://docs.privy.io/recipes/x402), [x402 Hedera exact scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md).

- Privy policies are on the free Developer plan. Parsed from the raw pricing HTML: Policy engine, Key quorum approvals and Delegated access are checked for Developer. Only Webhooks, KYT, Custodial wallets and the Dashboard manual-approvals UI are Enterprise. Earlier "unresolved" reads were a text-flattening artifact. The Intents API has no sales gate.
- Policy-gated EVM methods: `eth_sendTransaction`, `eth_signTransaction`, `eth_signUserOperation`, `eth_signTypedData_v4`, `personal_sign`, `eth_sign7702Authorization`, `wallet_sendCalls`. Default is DENY.
- Stateful (rolling) caps: only `eth_signTransaction` and `eth_signUserOperation`; sum only; 1 to 72 hour windows; max 10 per app; updated after signing so concurrent requests can slip. Privy calls them "disaster prevention". They do not count `eth_sendTransaction` spend (Privy's own recipe says so) and do not cover typed data.
- EVM x402 payments are EIP-3009 typed data signed via `eth_signTypedData_v4`. Privy can enforce, in-enclave and statelessly: a per-payment cap (`ethereum_typed_data_message.value lte`), a payee allowlist (`.to in_condition_set`), a chain and contract pin (`ethereum_typed_data_domain.chainId` and `verifyingContract`), and an expiry (`system.current_unix_timestamp`). The `types` map must match the request exactly. Privy cannot enforce a daily x402 budget; that is a host ledger, serialized per session, checked before requesting the signature. The x402 client's `maxValue` is client-side only.
- To show a 24-hour aggregation rejecting a jailbreak on EVM, the transfer must be an `eth_signTransaction` (host broadcasts) or `eth_signUserOperation`, gated by a `to` allowlist, a decoded-calldata `transfer.amount` cap and a rolling aggregation. Say "enforced server-side under policy"; simulation-based limits run at the API level, not in the enclave.
- The Hedera leg. Privy raw signing (`secp256k1_sign`, `raw_sign`) is absent from the policy method enum; the docs say raw-bytes methods are Tron and Sui only and that transaction policies need Tier 2 decoding. A Privy-raw-sign Hedera signer is technically buildable (the `@x402/hedera` `ClientHederaSigner` is a two-member structural type, Hiero's `signWith` takes an async signer, ECDSA is secp256k1 over keccak256 of the body bytes), but it carries zero policy coverage, costs 8 to 12 hours, and hits a hollow-account gotcha. The EVM route is dead: Hedera testnet USDC's HTS facade returns empty for `transferWithAuthorization`, and no facilitator advertises chain 296 or 295.
- Decision from the evidence: pay the Hedera x402 service from a host-held agent ECDSA account with host-enforced per-transaction and daily caps. Kill switch deletes the key. The only way value enters that pocket is a Privy-policied transfer. "Privy is the leash" is literally true only on the EVM leg, and the README and video must say so.
- Blocky402 testnet facilitator: live and open at `https://api.testnet.blocky402.com`, network `hedera:testnet`, fee payer `0.0.7162784` (read from `/supported` at runtime; docs are stale and once listed a different account), ECDSA-friendly, 100 requests per minute per IP documented. Mainnet at `https://api.blocky402.com` is also live for `hedera:mainnet`. `payTo` must be a `0.0.x` account id; aliases are rejected. HBAR (asset `0.0.0`) is the lowest-risk settlement asset; HTS USDC `0.0.429274` needs association and funding. The GitHub repo linked from blocky402.com returns 404.
- Idempotency: resubmitting identical signed bytes hits Hedera's duplicate-transaction rejection within 180 seconds, but a retried x402 fetch mints a new transaction id and charges again. The `payment_identifier` extension exists in the TypeScript SDK; keep a host-side id-to-result map, sign once per intent, reuse the payload on retry.
- Revocation: removing a signer is immediate, but agent access tokens can live up to 15 minutes. Keep a server-side "frozen" flag checked before every sign.

### 4.3 Telegram onboarding via Privy

Source: [Privy Telegram bot recipe](https://docs.privy.io/recipes/telegram-bot). Digest: `gap-privy_track_intel`.

- Bot `/start` creates the user server-side with `privy.users().create({linked_accounts:[{type:'telegram', telegram_user_id}]})`, then creates the wallet with the user as owner and the agent as an `additional_signer` with an override policy. Lookup via `getByTelegramUserID`.
- The docs say the user can later "claim" the wallet by logging into the web app via Telegram; a Telegram account "cannot be linked to another user"; pregenerated wallets "automatically appear" on first login. No sentence literally states the identity merge, so verify it on day 1 (INFERRED, high confidence).
- Turn off automatic embedded-wallet creation on login in the dashboard, or the web login mints a second wallet.
- The official GitHub starter is stale (legacy SDK, ownerless wallets, mock DB). Follow the docs recipe, not the starter.
- Webhooks are Enterprise. Poll. Above-cap approvals can use the Intents API: agent proposes an intent, Telegram Approve makes the server authorize it, Privy executes. About 6 to 8 hours.

### 4.4 The Graph

Digests: `gap-graph_x402_testnet_exact_path`, `dim-prizes`, `dim-feasibility`.

- The mainnet x402 gateway is live: `POST https://gateway.thegraph.com/api/x402/subgraphs/id/{id}` returns a 402 for `eip155:8453`, amount 10000 units, which is $0.01 USDC per query, payee `0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB`.
- The testnet hostname printed in The Graph's docs and in the `@graphprotocol/client-x402` README does not resolve. The working host is `https://gateway.testnet.thegraph.com` ($0.000042 per query on Base Sepolia). It returns an identical 402 for garbage subgraph ids because payment is verified before the id is resolved, and it almost certainly does not serve the Messari mainnet subgraphs (INFERRED at 0.85; only a funded query is definitive).
- The official `@graphprotocol/client-x402` accepts only a raw private key. It cannot sign with a Privy wallet. Use Privy's `createX402Client` (Node) or `useX402Fetch` (React, 3.7.0 and later) with `@x402/fetch` against the gateway URL. In x402 v2 the client never chooses a facilitator.
- Recommended: mainnet gateway at $0.01 per query with about $5 of real Base USDC in the Privy wallet, a Privy typed-data policy as the per-payment cap and payee allowlist, a host daily ledger, and a free Subgraph Studio key (100,000 queries per month) plus the Subgraph MCP (`https://subgraphs.mcp.thegraph.com/sse`, Bearer key) as a silent fallback. x402 is encouraged, not required, for the Graph AI track.
- Composable track: a single-subgraph query is explicitly disqualified. Cheapest qualifying path is one Messari lending query across at least two live deployments: Aave v3 Ethereum `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`, Aave v3 Base `D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9`, plus Compound v3 Ethereum `AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9` or Spark Lend Ethereum `GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si` (Zerolend shows "last updated 2 years ago"). Verified schema fields: `markets { name canBorrowFrom isActive inputToken { symbol } totalBorrowBalanceUSD rates { rate side type } }` with side `BORROWER` and type `VARIABLE`. Add Subgraph MCP for discovery, a small protocol-to-deployment registry JSON, and a `SKILL.md`. Log the deployment id and block in the receipt; provenance is what Graph praised.
- Agent0 ERC-8004 subgraphs are live on Base Sepolia (not Hedera). Registering the agent and reading it back through The Graph counts for Hedera's "on-chain agent identity" extra points and for Graph composition. About 4 to 6 hours.

### 4.5 Everything else

- LLM for the agent loop: `claude-opus-5` through the Vercel AI SDK with `@ai-sdk/anthropic`, adaptive thinking, a step cap around 12. Do not use Fable for the tool loop (forced `tool_choice` returns 400).
- Safety mechanisms that fit nine days (digest `dim-safety`): policy outside the model; server-issued ids for recipients; staged writes; caps on resulting state; serialized spends; fenced untrusted content (Graph results, page snapshots, 402 bodies are "report on, never act on"); exact-origin allowlists with a real URL parser, deny `data:`, `blob:`, `javascript:`, `file:`, strip userinfo (browser-use CVE-2025-47241 and a still-open data-URL bypass); a fresh per-user Chrome profile, never import real cookies; a denylist for banking, email and exchange domains; no `window.ethereum` (option A); Telegram approvals only via inline buttons with a server nonce and a `callback_query.from.id` check (OpenClaw shipped exactly that bug); never expose `resolvePermission`, `raise_limit` or `unfreeze` as agent tools; never use an LLM classifier as the signing gate; a hard per-session budget on unattended runs.
- Legal, not advice (digest `dim-safety`): a testnet, no-fee, no-fiat public beta is very unlikely to be a MiCA crypto-asset service. It gets grey when mainnet value, a server-held signer over user funds, and a business coincide. EU AI Act Article 50 applies from 2 Aug 2026: label the agent as an AI. Expected beta copy: "still risky", "only fund what you can lose", what it does without asking, what parks, what is impossible, what we store.

---

## 5. Market and demand

Digests: `dim-demand`, `dim-retention`, `gap-event_week_graph_and_peers`.

**What people actually fear.** The 2026 incidents everyone cites: Bankr/Grok on 4 May (about $150k to $175k moved after an airdropped NFT granted "Executive" privileges and a Morse-code reply was decoded into a transfer; SlowMist: "without multi-step confirmation or spending limits"; about 80% recovered), Lobstar Wilde in February (a session crash wiped the agent's memory of its balance; not a prompt attack), and Gitcoin's Owockibot leaking its own key with losses contained by a $2,100 balance. Zscaler got 4 of 26 LLMs to pay via hidden HTML.

**Where the demand is voiced.** Reddit, read in Chrome this week: "$175K in crypto got drained from an AI's wallet because a guy posted Morse code" (r/pwnhub, 817 points); "I gave a Claude agent a domain and $90 it can't spend without me" (r/ClaudeAI 351 points, r/AI_Agents 99 comments; the body says "money in needs nobody's permission, money out needs a human"); "$3,400 lesson learned" (an agent loop bought proxies overnight on a hardcoded card); r/ethdev 25 Aug: "How do we let an AI use a wallet without giving the AI unrestricted control?" (a commenter: "per action and per day limits... if the payee or total changes it is kicked out for reapproval"). r/ethdev allows self-posts.

**The best developer-side signal on X** is @0xblockboy (2.3k followers, 34k views, 202 bookmarks): connect a wallet, set a spending limit, make API calls funded by the wallet; "no turnkey way to authorize once in a browser and have x402 execute automatically after that." The @svpino "watch a space, take over it, or kill it" post (51.8k views) is an influencer quote-tweet of ego lite's launch; use the vocabulary, not the number. The x402 double-spend "screaming" in the plan rests on a 14-view tweet.

**Who pays over x402 today.** Volume is extremely concentrated: one LLM routing gateway accounts for roughly 94% of tracked transactions. The high-frequency payer is a developer's coding agent spending from a wallet a human funded and configured. The human remains the funding, policy and approval owner. On Hedera the x402 ecosystem is tiny and hackathon-driven, and Hedera's own track text admits it "is still short of one thing: actual services you can pay for."

**Big tech has retreated from autonomous payments.** OpenAI retired Instant Checkout on 24 Mar 2026 and shut down Operator, Atlas and the ChatGPT agent by August; Claude in Chrome blocks financial sites; Chrome auto browse pauses before any purchase. Agent-initiated payments at scale run through native rails inside chat apps. The lesson: "agent clicks checkout in a browser" is the losing shape; "agent calls a policy-gated payment rail" is the winning one. The browser is for seeing and acting on the web; the host pays.

**Retention reality.** Measurable daily use in agent-adjacent products is trading, which is mainnet-only. Browser-agent incumbents retain on chores. Scheduled or triggered agents that page the human retain better than chats the human must open. For a testnet product, "read mainnet data, spend testnet money" is the only configuration that feels real. Funding friction kills first sessions; prefund every tester.

**Framing.** "Give the AI your wallet" gets "No, never, not even once as a joke" (a Privy-built product's HN thread). "Pocket" and "allowance" framing flips it.

---

## 6. Competition and white space

Digest: `dim-competition`, `dim-segments`.

| Product | Visible browser | Human takeover | Policy outside the model | Telegram | EVM / Hedera | Open source | Consumer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MetaMask Agent Wallet (public 6 Aug) | no | no | yes, hosted keys, Guard/Beast | no | EVM + others | CLI is MIT/Apache | dev CLI |
| Coinbase Agentic Wallet / awal | no | no | client-side x402 spend controls | no | Base, Solana | partly | dev |
| Privy agent wallets | no | no | yes (policy engine) | login only | EVM, Solana | SDK | infra |
| OpenSpender, piprail | no | no | yes, full cap set | no | Base | no / partly | Claude Code, OpenClaw |
| SingIt | no | no | signed budget | yes | Base | 6-star repo | yes, tiny |
| MoonPay PayBox | no | no | modes, revoke | no | Solana + 7 EVM | no | yes |
| OpenClaw metamask-agent-wallet skill | headed Chrome (undocumented) | pause-and-ask only | prompt-level permissions.json | no | EVM | MIT-0 | hobbyist |
| Browserbase, Steel, Cloudflare Browser Run, ego lite, Vercel agent-browser | yes | yes | none, no wallet | no | n/a | some | infra |
| Cloudflare Wallets (announced 4 Aug) | separate product | separate product | announced | no | tbd | no | reservation only |
| Brave BAT Roadmap 4.0 | browser | yes | not specified | no | EVM | browser is OSS | prototypes "this fall" |
| **This project** | yes | yes | Privy on EVM, host caps on Hedera | yes | Base + Hedera | yes | yes |

The bottom-right cell is empty as far as the research could find. The honest phrasing is "we found none", not "none exists". Cloudflare could close the infra version within months; Brave could close the consumer-browser version by winter. The durable moat for the hackathon and the first users is open source, the Telegram pager, chain-agnostic settlement, and receipts that explain why a spend was allowed.

Direct competitors this week inside ETHOnline: countersign (owner mandate plus guard key, x402-gated review on Hedera), chip402 (spend-capped x402 plugin), mandate (boilerplate). Peer sellers this week: fare402 (live on Railway with settled Blocky402 transactions), x402-work-receipts, tollgate, hedera-x402-pay-per-inference, turnstile, inference-exchange, hedera-x402-paid-lookup, Ether-Hunt, AgentTether. Nobody found combining a shared browser with a policy wallet.

---

## 7. Segments

Scored 1 to 5 on pain, reachability in nine days by one person, testnet tolerance, day-two return, and overlap with what the judges reward. Digest: `dim-segments`.

| Segment | Score /25 | Verdict |
| --- | --- | --- |
| x402 service builders on Hedera and Base, including ETHOnline peer teams | 23 | Top. They have endpoints and no buyers, are testnet-native, individually addressable via GitHub and Discord. Their endpoints appear late and are ephemeral; treat cross-team pays as bonus, never as a demo dependency. |
| AI-agent builders on OpenClaw, Claude Code, Cursor | 19 | Second. Huge community, small crypto-curious subset (x402 Telegram 600+), already served on caps. Differentiator for them: a watchable Chrome plus an MCP or CLI pay tool so their agent pays through our pocket. |
| DeFi researchers on Graph data | 19 | Judge-shaped. Named node: PaulieB (@PaulBarba12, graph-lending-mcp). Channels: t.me/graphhackers, Graph Discord #mcp-servers. |
| ETHGlobal hackers themselves | 19 | Cheapest testers this week. Dies after 13 Sep. |
| Small teams wanting a shared agent treasury | 14 | README only (Privy B2B). |
| Crypto-native copy-traders | 12 | Mainnet-only. Skip. |
| Telegram trading-bot users | 10 | Solana-heavy, promo-hostile. Skip. |
| Non-crypto shoppers | 8 | OpenAI's own data says they browse but do not buy. Skip. |

---

## 8. Channels and amplifiers, verified this week

Digest: `gap-event_week_graph_and_peers`, `dim-build_in_public`.

- The sponsor org accounts (@hedera_devs, @graphprotocol, @privy_io, @ETHGlobal) did not reply to, repost or quote a single builder in the last 30 days. Privy follows nobody. @BlockyDevs has been dormant since 2024. The one amplification that exists is the post-event winners thread (hedera_devs 31 Aug: root post 9.4k views, one card reply per winner at about 1k views each, reusing the repo's OG image, one sentence and a HashScan link).
- People who do engage mid-event: @HederaCommunity (145k followers, 4 to 10k views per post, replies to ecosystem people, runs weekly Hbar Happy Hour Spaces with @Mauii_MW and @filhetu), Ed Marquez @ed__marquez (Hedera Head of DevRel, quote-tweets ecosystem posts mentioning x402), @jaycoolh (very likely Jake Hall, the Hedera DevRel engineer who wrote the x402 winners post; replies to builders in small threads), @narb_s (Hashgraph solutions architect, wrote the x402 PoC), @thehbarbull (40k), @JulioMCruz (ETHGlobal mentor who offered x402 and AI-agent help in the ETHGlobal Discord #mentorship-help on 4 Sep), and @graphprotocol's own reply threads ("Poll for agent builders: what breaks your agent most often?" on 21 Aug; "tell us what you're building").
- Channels and their rules: ETHGlobal Discord (34k members; #mentorship-help; partner channels), Hedera Discord (12.6k; the official build-support link), The Graph Builders Telegram at t.me/graphhackers (480 members, staffed by Graph support engineers during sponsored hackathons; t.me/graphprotocol is a different announcements channel), Graph Discord, Privy developer Slack via privy.io/slack (Privy's Discord has 655 members), the x402 builders Telegram (600+), Farcaster /base-builds (54k), /dev (183k) and /ethglobal (7.9k) while /x402 and /ai-agents are effectively empty, r/ethdev (self-posts allowed), r/AI_Agents and r/ClaudeAI (reply into the "$90" threads rather than posting fresh), r/alphaandbetausers, r/SideProject (must show the product), Show HN only after submission with a no-signup try link.
- X mechanics (single vendor source, medium confidence): the first 30 to 60 minutes decide reach; replies weigh far more than likes; non-Premium accounts posting links in the body get suppressed, so put links in the first reply; 2 to 3 posts per day; native video under 2:20, front-loaded. Kaito Yaps is dead; do not run incentivized posting. A brand-new account is a cold start none of the sources address; Jonas's personal account should carry the narrative.
- Hacker chatter about ETHOnline on X this week is near zero. Nobody has posted a build in public yet.

---

## 9. Prize expected value

Author estimates from the rules, past winners and this week's peer count; not measured per-track submission volumes.

| Track | Money | P(win) | EV |
| --- | --- | --- | --- |
| Hedera AI & Agentic Payments | $2,000 x up to 3 | 0.35 | $700 |
| Privy Best financial flow | $2,500 | 0.25 | $625 |
| Graph Composable / Standardized | $2,500 / 1,500 / 1,000 | 0.30 | about $450 |
| Graph AI Use Case (From Scratch) | $2,500 / 1,500 / 1,000 | 0.20 | about $300 |
| Privy Best B2B financial product | $2,500 | 0.10 | $250 |

Expected about $2,300; ceiling $12,000 (five first places: $2,000 + 4 x $2,500). The base rate for any partner prize is roughly 8 to 10% of showcased projects. Adjacent tracks (ENS v2, World Selfie Check, Ledger, Uniswap, Chainlink, Bazantic) each cost one of the three partner slots and are gated by hardware, beta access or feedback forms. None is free.

---

## 10. Corrections to docs/PLAN.md and docs/architecture.md

1. "Privy policy is the leash on the Hedera x402 payment" (ARCHITECTURE §Privy, PLAN §7, §9) is false. Only the EVM leg is Privy-gated. See 4.2.
2. "Per-tx and rolling USDC cap" via Privy (PLAN §7) works only for `eth_signTransaction` and `eth_signUserOperation`. Not for x402 typed data, and not for `eth_sendTransaction`. The daily x402 budget is a host ledger.
3. "Steal patterns from `~/code/invok`, `humanhook`, `boter`" (ARCHITECTURE §Browser, §Privy, §Telegram; PLAN §8) is not possible on Jonas's machine. The repos are not here. Kristjan must push the specific files or the team starts clean, and the plan should say which.
4. Graph x402 on Base Sepolia (PLAN §4 "Graph — Best AI use case") is not a working path for Messari lending data. It is mainnet with real USDC, or a Studio key.
5. WebMCP producer and consumer (ARCHITECTURE §Agent loop, PLAN §1) should be cut entirely.
6. The demand section (PLAN §2) over-weights low-reach X posts. Four of seven cited posts have under 1,200 views. The strongest evidence is the Reddit threads and the Bankr incident.
7. Telegram approval cards (ARCHITECTURE §Telegram step 4) are plumbing on top of a deny-only policy engine or the Intents API, not a free by-product. Budget 6 to 8 hours or cut.
8. The nine-day cut (ARCHITECTURE §Nine-day cut) has no hosting day, and the hosted product needs Bun 1.4.1 plus worker-per-user Chrome isolation. Public testers require a hosted URL.
9. "Cheap extras" (PLAN §4: ENS v2, World, Uniswap, Ledger, Bazantic) each consume a partner slot. None is cheap.
10. The one-liner must contain the browser. "Spending limits your AI agent cannot break" is SingIt's line, and "policy-bound spend" alone reads as Tally, HumanMandate or countersign.
11. The Privy Telegram binding does not need a custom pairing-code table (ARCHITECTURE §Telegram steps 2 and 3). Privy's bot recipe creates the user with a Telegram linked account server-side.
12. The "watch the 402 unlock in the shared Chrome" beat (ARCHITECTURE §Prize-shaped demo step 5) cannot be the page paying; the host pays. The service must return a one-time receipt token the agent navigates to.
13. `Bun.WebView` is headless-only and one-Chrome-per-process; "a tab IS a WebView; later tabs are `Target.createTarget`" (ARCHITECTURE §Browser table) does not hold because `cdp()` cannot route to attached sessions.
14. Jonas's prior Graph layer must stay out of the tree (Start Fresh) or go into Graph's Continuity pool with a documented diff. Do not mix.

---

## 11. What the research could not settle

- Whether a server-created Telegram user and a later Telegram OAuth web login resolve to the same Privy user and wallet (docs strongly imply yes). Verify day 1.
- Whether a policy-attached Privy wallet hard-denies `secp256k1_sign` or ignores policy for it. Fifteen-minute live test; put the result in the README.
- Whether Blocky402's `/settle` is idempotent on a duplicate. Test on day 2 and record it.
- Whether the Graph testnet gateway serves any Messari deployment (needs one funded query).
- Whether Hedera judges will accept a self-hosted Blocky402 instance as "settled through the Blocky402 facilitator". Use the hosted one.
- Whether @jaycoolh is Jake Hall (strong circumstantial match).
- ETHOnline 2026 registration and per-track submission counts (ETHGlobal reported "1300+ hackers" at kickoff).

Questions only the team can answer: the name; who owns the Chrome slice full-time; whether Kristjan can push the invok, humanhook and boter files; whether Jonas's Graph layer is a real repo; whether the team will put $5 to $20 of real Base USDC in the demo wallet; whether the team will run a Hetzner box.

---

## 12. Method and limits

- Web search budget ran out before four of the nine dimensions started (competition, retention, safety, hackathon meta), so those are fetch-only. X was read via the fxtwitter mirror and, for the event-week study, directly in Jonas's logged-in Chrome (read-only; no posts, follows or likes were made). Reddit was read in Chrome via old.reddit.com. Farcaster via the Warpcast API.
- Verifiers refuted roughly a third of high-impact claims, almost always for overreach in framing rather than false facts. Every refuted claim above has been replaced by the narrowed version the verifier could support.
- Live probes were run on 4 Sep 2026 against Blocky402, The Graph gateways, Hedera mirror nodes and the Hashio JSON-RPC relay. Docker tests ran on Apple-silicon Docker Desktop with arm64 Chromium; the x64 path with google-chrome-stable should be re-run once.
- Everything dated "this week" was true on 4 Sep 2026 and will drift.
