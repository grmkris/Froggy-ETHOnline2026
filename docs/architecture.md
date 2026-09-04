# Architecture — web workspace wallet with an agent browser

This is the product shape after round 2 (4 Sep 2026). Market and prize context: [`PLAN.md`](./PLAN.md). Original meeting notes: [`summary.md`](./summary.md).

---

## What we are building

A **web app** where a human and an AI share **one Chrome**.

The human sees a live screencast and can click into the same page (login, passkey, “wait stop”). The agent drives that Chrome over CDP. Spending is **not** a prompt rule: it is Privy policy + a kill switch.

Telegram is how you **arrive** (bot deep link → magic link → the web app), not the app itself.

This is Harness’s distinctive bet — _there is no agent browser and user browser, there is one `BrowserSession`_ — applied to money.

```
┌─────────────────────────────────────────────────────────────┐
│  chat (agent loop)     │  wallet pane                       │
│  ask / steer / freeze  │  balance, policy, receipts, Privy  │
├─────────────────────────────────────────────────────────────┤
│  live Chrome screencast                                     │
│  agent drives  ·  you can grab the page  ·  amber = agent   │
└─────────────────────────────────────────────────────────────┘
```

On a phone the chat is primary and the browser is a strip. Harness `PaneHost` already works that way; steal the interaction grammar, not the whole UI kit.

---

## Why this is “next gen” and not another policy SDK

Shipped in 2026, all **signer + policy**, none of them a shared browser:

- Coinbase Agentic Wallets, Privy agent wallets, MetaMask Agent Wallet
- Cloudflare virtual wallets, Binance Agentic Wallet
- SingIt (Telegram budget, no browser)
- MoonPay PayBox (wallet _inside_ Claude, no page you can grab)

Playwright MCP / Browser-Use give an agent a browser, but it is **headless, not yours**, and it has no leash.

We sit on the empty cell:

|                 | No real browser       | Real browser you can watch |
| --------------- | --------------------- | -------------------------- |
| No spend policy | ChatGPT with a plugin | Harness / Invok today      |
| Spend policy    | every “agent wallet”  | **this**                   |

The agent can use the **actual web**: x402 402s, WebMCP tools on a page, a checkout Claude Commerce would have handed off, a Uniswap UI, a Graph explorer. The wallet is what makes that safe.

---

## Locked vs still open

### Locked

- Web app first.
- Telegram onboarding (Mini App optional later, not in the 90s demo).
- Agent Chrome via **Bun**, `Bun.WebView({ backend: { type: "chrome" } })`, CDP, JPEG screencast over a binary WS, human/agent arbitration.
- Privy for the user wallet and the policy engine.
- Model never sees a key.
- Open source. White-label is not the video.

### Still open (these still fork code)

1. **How the page sees the wallet** — host-side pay tools vs in-page `window.ethereum` (see below).
2. **One job in the demo** — pay for a Hedera x402 service grounded in Graph, vs copy-trade, vs a shopping checkout.
3. **Custody shape** — delegated signer on the user’s Privy wallet vs a funded agent sub-wallet.
4. **Jonas’s Graph layer** — wrap an existing repo (Continuity) vs Subgraph MCP from scratch.
5. **Name.**

---

## The wallet ↔ browser relationship (the real design fork)

This is the decision that makes or breaks “agentic wallet” vs “Harness with a pay button.”

### A — Wallet is a host pane (ship this)

The Chrome the agent drives is a **normal browser**. It does not get the key.

Agent tools that move money live on the **host**:

- `x402_fetch(url, maxValue)` — intercept 402, sign with Privy under policy, retry
- `wallet_swap(...)` / `wallet_send(...)` — allowlisted
- `wallet_quote(...)` — never signs

The browser is for **seeing and acting on sites**: research, fill a cart, click “pay”, read a 402 page. When payment is required, the host pays, then the agent continues.

**Pros:** matches Claude Commerce (“model stages, harness applies”). Matches Invok (“never expose the approval channel as a tool”). Nine-day feasible. Jailbreak demo is clean (tool rejects, not the model).

**Cons:** `app.uniswap.org` → Connect Wallet does nothing unless we also do B or C.

### B — Injected EIP-1193 provider (the “next gen” story)

A Chrome extension (or a CDP-injected script) in the **agent profile** exposes `window.ethereum`. Every `eth_sendTransaction` is forwarded to the host, run through Privy policy, and either signed or parked as `ask_user`.

**Pros:** the agent can use any dapp. This is what “agentic wallet” means to a crypto user.

**Cons:** origin isolation, WalletConnect vs injected, phishing pages, the agent clicking “infinite approve”. This is a product, not a Saturday.

**Hackathon move:** stub a provider that only allows the allowlist and shows a “Connect” that returns the Privy address. One Uniswap click is enough for the video. Do not build a full wallet extension.

### C — WalletConnect from the pane

Agent clicks Connect on the dapp. The wallet pane is the WC responder. Human or policy approves the session.

**Pros:** no injection. Real dapps. Revoke is a WC disconnect.

**Cons:** WC session UX in nine days, and the agent still has to click through the dapp’s modal.

**Recommendation:** **A is the demo. B is the README + a stubbed provider if we have a day left.** Do not start on C.

---

## Browser: steal Invok’s local backend, do not depend on Invok

Harness is archived. Invok is the maintained port. Code to copy **patterns from**, not to import:

`~/code/invok/apps/invok-api/src/browser/local/`

| File | What it is |
| --- | --- |
| `local-backend.ts` | `new Bun.WebView({ backend: { type: "chrome", argv }, dataStore })` |
| `tabs.ts` | a tab IS a WebView; later tabs are `Target.createTarget` on the same Chrome |
| `popups.ts` | site `window.open` adopted as a tab we own (Bun cannot attach to foreign targets) |
| `screencast.ts` | `Page.startScreencast`, ack per frame, drop on backpressure |
| `arbitration.ts` | `agent \| human \| idle`, 1.5s human-quiet, 15s starvation cap |
| `input.ts` | human pointer/keyboard → `Input.dispatch*` |
| `snapshot.ts` | a11y/text snapshot with `@eN` refs |
| `browser-execute.ts` | agent JS against `session.navigate/click/fill/cdp` |
| `chrome-detect.ts` | `INVOK_CHROME` → OS Chrome → Playwright cache; never prefer `headless_shell` |
| `browser-ws.ts` | `/ws/browser/:id` binary frames, trusted-origin upgrade |

**Do not copy:** terminal PTY, robot, canvas board, ext-loader, OTel inspector, Docker/noVNC fallback (unless judges have no Chrome — then Playwright Chromium is the fallback).

**Threat model change vs Harness:** Harness assumed a human is watching, so tools are not approval-gated. Invalid here. Browser actions (navigate, click, fill) can auto-run. **Anything that signs, pays, or exports a key parks.** Freeze aborts the run **and** revokes the session / disconnects the provider.

Persistent Chrome profile: a **dataStore directory per user**, not `~/.harness/browser` shared across the world. Logins survive, cookies are the user’s. That is the product (the agent shops as you). It is also the scary bit — spell it out in the README.

---

## Privy

Lift from `~/code/humanhook` (the only production-shaped Privy stack on this machine):

- Guest / social login → embedded wallet (`createOnLogin: "all-users"`)
- Optional ERC-4337 smart wallet + `sendCalls` batching (`keep.tsx`, `batch.ts`)
- Server verifies the access token; **smart** address is money, **signer** is the embedded EOA (`dish-auth.ts`)
- Dashboard: guest accounts ON, paymaster if we demo Base Sepolia

For the agent:

- **Delegated signing** (user grants an authorization key + policy) **or** a server wallet owned by the agent with a tight policy.
- Privy [policy engine](https://docs.privy.io/wallets/overview/solutions/agent-wallets): per-tx and rolling USDC cap, allowlisted contracts / recipients, chain allowlist.
- `createX402Client` / `useX402Fetch` with `maxValue` per request.
- Agent CLI pattern: human approves device auth once; later signatures use short-lived keys the model never sees.

B2C video = Privy **financial flow** (onramp or faucet + one live spend). Org / white-label = Privy **B2B** (policies, quorums, intents) — README only unless we flip.

---

## Telegram onboarding (not a Mini App)

Pattern from `~/code/boter`: `t.me/<bot>?start=<pairingToken>`.

Flow:

1. User hits the bot / a landing `t.me` link.
2. Bot creates a one-time code, replies with `https://app.example/from-telegram?code=...`.
3. Web app consumes the code, starts Privy login. If Privy Telegram login/widget is easy, bind `telegramUserId` to the Privy user. If not: email/Google in the web app, store `telegramUserId` as a linked account ourselves.
4. Later: bot is the **pager** — “agent wants $4 to pay this 402, allow once / allow session / freeze.” Same card vocabulary as Invok (`allow_once` / `allow_session` / `deny` / `deny_stop`).
5. Mini App is a **future skin** of the same API. Do not block the demo on Telegram WebApp SDK, TON, or `@wallet`.

The bot must **not** expose `resolvePermission` as a command the agent can call. Invok’s MCP toolkit already documents this; copy the rule.

---

## Agent loop (keep small)

Do not fork Invok. One Bun process:

- AI SDK `streamText` + SSE (Harness `handleChat` shape: **server-owned run**, not `req.signal`)
- Tools: `browser_snapshot`, `browser_execute`, `x402_fetch`, `graph_query`, `wallet_*`, `ask_user`
- Skills on disk (`SKILL.md`) for Graph, x402, shopping — Claude Commerce lesson: skills not subagents
- Presentation tools later: `present_quote`, `present_receipt` (typed cards, not markdown the client parses)
- Cap steps (~12). Panic = abort run + freeze wallet session

Model: one provider, env key. Not a multi-provider registry.

WebMCP two directions (both cheap if the workspace exists):

- **Producer:** our web app registers `document.modelContext` tools (`get_balance`, `set_policy`, `pay`) so Claude-in-Chrome can drive _us_. That was the original “WebMCP so Claude can drive the wallet” line.
- **Consumer:** our agent, in _its_ Chrome, discovers WebMCP tools on other sites instead of clicking. Stretch.

Producer is the prize-shaped one (demo: Claude talks to our page). Consumer is the “we have a browser” payoff.

---

## Prize-shaped demo (still recommended)

Same economic sentence as `PLAN.md`, now with a browser:

1. Telegram → magic link → web workspace. Privy wallet exists.
2. Set policy: $2/tx, $10/day, allowlisted Hedera x402 payTo + one swap router.
3. “Find the cheapest USDC borrow, then pay for the packed answer and show me the site.”
4. Agent **queries Graph** (live Subgraph MCP / standardized schema). That number is why it spends.
5. Agent **opens our Hedera x402 service** in the shared Chrome. 402 → host pays via Privy → page unlocks. You watched it.
6. Optional: agent opens the protocol’s app in the same Chrome (research, not the spend path).
7. You type “send the rest to 0xevil” → policy reject on the **tool**, visible in the wallet pane.
8. Freeze. Receipt: Graph snapshot + tx hash + policy id.

Hedera still requires **we host** the gated service, not only consume someone else’s. Graph still requires live data. Privy still requires one live financial flow.

---

## Stack (day 0)

New repo, not a fork of starters/harness/invok.

| Piece | Choice | Why |
| --- | --- | --- |
| Runtime | Bun | `Bun.WebView`, `Bun.serve`, matches Harness/Invok |
| API | one Bun process, HTTP + two WS (app JSON, browser binary) | Harness split sockets for a reason |
| UI | Vite + React 19 + Tailwind. Steal pane grammar, not 83MB embed | starters `packages/ui` or a fresh shadcn |
| Wallet | Privy React + `@privy-io/server-auth` | humanhook |
| Agent | Vercel AI SDK `streamText` | Harness kernel, minus extensions |
| Telegram | Bot API only (grammY or fetch) | boter pairing, no Mini App SDK |
| Graph | Subgraph MCP / Studio API key | prize qual |
| x402 | Privy client + `@x402/hedera` + Blocky402 | prize qual |
| Chain | Base Sepolia for the user wallet; Hedera testnet for the 402 we host | Arc skipped |

**Not** FIELD/01’s Koota/R3F demo. **Not** Invok as a dependency. **Not** Next.js unless the team insists — Vite SPA + Bun API is what Harness already ships.

---

## Nine-day cut (browser edition)

One person owns Chrome or this fails.

| Day | Browser | Wallet / prizes |
| --- | --- | --- |
| 0–1 | Bun process, Vite shell, `Bun.WebView` one tab, screencast to a canvas | Privy login, one address on screen |
| 2 | snapshot + click/fill + arbitration (human can grab the page) | Telegram bot → magic link |
| 3 | — | Host x402 service on Hedera testnet; pay it once from the host, not the page |
| 4 | Agent tool: `browser_execute` / `browser_snapshot` in the chat loop | Policy: per-tx + daily + allowlist. Jailbreak reject |
| 5 | Agent opens the 402 URL **in the shared Chrome**; you watch the unlock | Graph live query is the body of that 402 response |
| 6 | Panic / freeze, receipts | Onramp or documented faucet. Demo script |
| 7–8 | WebMCP producer on our page **or** stubbed EIP-1193, not both | Video, README, prize checklists |
| 9 | Submit | No ads, no yield, no white-label, no Mini App |

If Chrome slips: Playwright Chromium + a ffmpeg/screencast hack is a downgrade, not a different product. Do not silently switch to “headless screenshots in chat.” The whole point is the shared page.

---

## What we will tell judges in 20 seconds

> Other agent wallets give a model a key and a cap. This one gives it a browser you can see, grab, and freeze — and a Privy policy that still holds if you jailbreak the prompt. Telegram is how you get in. Graph is why it spent. Hedera x402 is the actual payment.

---

## Open questions for the next pass

1. Demo job: packed Graph answer as the 402 body (default) / copy-trade / shopping cart?
2. Host-pane pay (A) only, or stub injected provider (B) for the video?
3. Delegated signer vs funded sub-wallet?
4. Jonas repo: wrap or scratch?
5. Working name for the GitHub / landing page?
6. Who owns the Chrome slice vs the Privy slice vs the Hedera service?
