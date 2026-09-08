# The MVP and what to pitch (FABLE51)

Written Sun 6 Sep 2026 (late), after iteration 2 was confirmed and the overnight run's phases A, B and E landed. This is the build-in-public lane's reference: what the product actually is now, which flows are safe to show, who we recruit, and which claims in the older FABLE51 files are now false.

Ground truth: `NEXT_ITERATION.md` (the confirmed plan), `STATUS.md` (what is in the tree), `DECISIONS.md` (what the team voted). Where this file disagrees with `PRODUCT_FABLE51.md` or `TARGET_GROUPS_FABLE51.md`, both of those were written Sat 5 Sep and predate the pivot; this file wins.

---

## 0. The sentence

**Your agent gets an allowance, not your keys.**

Long form, for the landing page and the repo:

> Froggy gives your personal agent a browser it can drive and money it can spend under rules you set. The rules live outside the model, so a jailbroken prompt does not move them. Every payment leaves a receipt that says what it bought, what it cost and which rule allowed it. Froggy's own service is sold by the task, paid over Hedera x402 — so an agent with no wallet and no key can still buy from it.

Two halves, and the pitch needs both:

1. **A wallet with rules** — for the person. Google login, real money, dollar balances, a policy the agent cannot edit.
2. **A service any agent can buy** — for the agent. `POST /api/tasks` behind a 402, an agent token, a CLI and a SKILL.md. Your agent holds nothing but a token.

The second half is what's new since Saturday and it is the more distinctive claim. Lead with it.

---

## 1. What the MVP is: four flows

These are the four beats of the demo sequence and the four things worth posting. Each says what is live today, so nothing gets pitched ahead of the build.

### Flow A — Fund it, in under a minute

Sign in with Google. See your address. Tap **Add funds**, pay €10 by Apple Pay, watch USDC land on Base. Tap **Top up credit $1**: USDC moves to Froggy's treasury under a Privy policy rule, and the same value in HBAR lands in a Hedera account that is yours. Every number on screen is in dollars.

- **Live:** wallet-first screen, live balances from the Base RPC and the Hedera mirror node, per-person Hedera accounts, the top-up path, Copy on every address.
- **Waiting:** the real onramp needs the Privy dashboard toggle and a signed-in owner; mainnet needs the HBAR and USDC to land.
- **The line:** no seed phrase, no bridge, no chain picker. You paid ten euro and your agent has money.
- **Sponsor:** Privy (onramp, embedded wallet, policy-gated transfer).

### Flow B — Ask a question that costs money

"Where is the cheapest place to borrow USDC right now, and the best supply rate?" The agent queries twelve Messari lending deployments across four chains through one standardized schema. Froggy's own service answers a 402: $0.05, paid in HBAR from your Hedera account through Blocky402. The receipt carries the HashScan link, the HCS note and every index's block height.

- **Live:** the brief, the twelve deployments with freshness, the 402, the settlement, the HCS note per settlement, the receipt with explorer links, the unlock page.
- **Waiting:** the first mainnet settlement (gate G1 — see §4).
- **The line:** the agent paid five cents for its own data and showed you the bill, with the block height of every number in it.
- **Sponsor:** The Graph (one query pattern, twelve protocols, four chains), Hedera (a real x402 service settled through Blocky402).

### Flow C — Hand your own agent the wallet ← the wedge

Copy the **Connect an agent** block. Paste it into Hermes, Claude Code, Kimi, OpenClaw — whatever you already run. Your agent runs `froggy ask "..."`. It gets a 402 it cannot pay, asks Froggy to sign, Froggy signs from _your_ Hedera account under _your_ mandate, and the answer comes back. The task and its receipt appear in your Froggy workspace.

Your agent never held a key. It held a token you can revoke in one click.

- **Live:** agent tokens, the served CLI (`/froggy-cli.js`), `skills/froggy/SKILL.md`, the task API behind a 402, the remote signing endpoint, Disconnect revoking in one request.
- **Waiting:** the end-to-end run through Hermes on Contabo (task 2.1).
- **The line:** you don't give your agent a wallet. You give it an allowance and a receipt book.
- **This is the recruiting flow.** It is the only one an outsider can try without us funding them.

### Flow D — Try to break it

Tell the agent to send everything to `0xevil`. It refuses on provenance, before any cap is even consulted — an address the agent read off a page is never a payee. Ask for something over your threshold: the run pauses and a ticket appears, in the workspace and on Telegram. You say no. The receipt names the rule that refused.

- **Live:** provenance rules, the mandate, approval tickets with four answers, receipts that name the refusing layer in plain words, Privy's refusal recorded verbatim.
- **Waiting:** Telegram needs the bot token.
- **The line:** the model said yes. The wallet said no.

**Beat 5 (the MetaMask Card purchase over CCTP) is not MVP.** It is the second demo beat and the riskiest thing in the plan (gate G3). Do not pitch it until a burn and a mint both exist. If it lands it is a bonus post, not a promise.

---

## 2. Who we are looking for

Revised from `TARGET_GROUPS_FABLE51.md`, which had the primary and secondary tiers the other way round for the product we are now building.

| Tier | Who | Why they care | Where |
| --- | --- | --- | --- |
| **Primary** | People already running a personal agent that spends or could spend money — Claude Code, OpenClaw, Hermes, Kimi, Cursor | They have felt the fear (the $3,400 overnight proxy loop; the "$90 it can't spend without me" thread). What they lack is a cap that lives outside their own agent's config and a receipt book | r/ethdev, r/AI_Agents, r/OpenClawUseCases, r/ClaudeAI; the x402 builders Telegram (600+); X replies under agent-tooling threads |
| **Secondary** | Analysts and tool builders on The Graph's standardized Messari data | The registry and the SKILL.md are reusable in their own agent; per-query payment without a Studio key | t.me/graphhackers, Graph Discord #mcp-servers |
| **Counterparties** | ETHOnline peers shipping x402 sellers on Hedera | Still valuable — they are what the directory is _for_ — but they are now a supply story, not the wedge. One paid settlement each, one issue each | Their GitHub repos, Hedera Discord build-support |
| **Audience** | ETHGlobal hackers, sponsor DevRel, async judges | Reach and scoring, not usage | ETHGlobal Discord, X, Hbar Happy Hour |

**The one-line recruit ask** (use this verbatim, it is the whole funnel):

> If you run an agent that spends money — Claude Code, OpenClaw, Hermes, whatever — I'll give you a wallet it can use and can't drain. Takes one paste. Tell me where it breaks.

**Qualify hard on this:** they must already have an agent running. Someone who has to install an agent first will not convert this week. The test in `NEXT_ITERATION.md` §9 is exactly this — you with Kimi, Hemang with Claude, cold, observed, Wednesday evening.

---

## 3. What to stop saying

Four claims in the older FABLE51 files and the earlier posts are now false. They will get caught.

| Stale claim | What is true now |
| --- | --- |
| **"Freeze" / "the kill switch deletes the key"** | Freeze is removed from the product entirely — no button, no Telegram command, no API. Voted out by all three of us. **Stop** ends a run; **Disconnect** revokes an agent token. The Thu 10 "freeze clip" in the artifact schedule needs replacing — use the refusal clip (Flow D) instead |
| **"Testnet only"** | Mainnet everywhere, decided Sun 21:40. Base mainnet and Hedera mainnet, real money, capped at €100 total. The consent copy and the Impressum notice both need rewriting |
| **"Try it, no signup, prefunded guest pocket, 90 seconds to first receipt"** | There is no guest path and no free money. `POCKET_STARTING_USD=0`; an account opens at the person's first top-up. Login is Google or email. **This kills the planned Tue 8 no-signup door** — the substitute is Flow C, where an outsider brings their own agent and their own €10 |
| **"Pocket"** | The word is gone. It is a **Privy wallet** (your USDC on Base) and **service credit** (HBAR in your own Hedera account, shown in dollars) |

Also: the `pay` MCP tool listed as "the first post-submission item" effectively shipped as the CLI and SKILL.md. That is a post — _the thing we said was next week is live_.

---

## 4. The honest risk, if someone asks

One gate is unproven and has no agreed fallback: whether Blocky402 settles on Hedera **mainnet** without an API key that has not been issued. Testnet works and is proven. If mainnet refuses, the Hedera beat cannot be recorded as planned and the team decides then (Kristjan's call; a labelled testnet fallback was your preference and is on record as declined).

Do not pre-announce mainnet settlements. Post them when a HashScan link exists.

---

## 5. Post-ready lines

Short, one artifact each, no thread required.

- "Your agent doesn't get your keys. It gets an allowance and a receipt book." + the Connect-an-agent card
- "I told it to send everything to 0xevil. It refused before it even checked the limit — an address it read off a page is not a payee." + the refusal card
- "My agent just paid five cents for its own data. Here's the bill, and the block height of every number in it." + the receipt
- "One paste into Claude Code and it can buy things. It never holds a key — we sign for it, under rules it can't edit." + a 15-second terminal clip
- "Twelve lending markets, four chains, one query. That's what standardized subgraphs buy you." + the brief
- "€10 in by Apple Pay, no seed phrase, no bridge, no chain picker. The agent has money." + the wallet screen

Rule that has not changed: never post an artifact we cannot click. Link in the first reply, tag people not orgs.
