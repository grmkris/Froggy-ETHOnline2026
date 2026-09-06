# Froggy

> Other agent wallets give a model a key and a cap. Froggy gives it a browser you can see, grab and stop — and a policy that still holds when you jailbreak the prompt. Your own personal agent can buy a task from it by the task, paid over Hedera x402, without ever holding a key.

A web workspace where a human and an AI share **one Chrome**. The human watches a live screencast and can take the page mid-action. The agent drives that same Chrome over CDP. What it may spend is not a prompt rule: it is a mandate the agent cannot reach, evaluated outside the model, on every payment.

Built for ETHOnline 2026 — **Privy** (the wallet and the leash), **The Graph** (why it spent), **Hedera x402** (how it paid).

```
┌──────────────────────────────────────────────────────────────┐
│  $0.12 of $10.00 today ▮▮▯▯▯   ● agent is driving   ■ Stop    │
├──────────────────────────────────────────────────────────────┤
│  you: buy the lending snapshot and tell me what it says       │
│  🐸  asked The Graph · requested a paid resource · checked …  │
│      ┌── the shared page, live, amber ring ─────────────────┐ │
│      │  you can click in, take it, split it out, pop it out │ │
│      └──────────────────────────────────────────────────────┘ │
│      ┌ $0.0040 · paid the oracle ── ✂ ── rule · tx · evidence ┐│
│  ┌ YOUR CALL  $1.50 to seller.example ── ✂ ── stop · no · … ┐  │
│  [ ask Froggy to do something…                              ↑ ] │
└──────────────────────────────────────────────────────────────┘
```

The conversation is the ledger: every receipt is filed under the turn that produced it, the live page sits under the turn that opened it, and a question for you pins above the composer with four answers. The same four answers reach your phone through Telegram, where the daily digest lands too.

## Run it

```bash
bun install
cp .env.example .env
bun dev
```

Open `http://localhost:3000`. The Bun server listens on `:3001`; the dev server proxies to it, so the client talks to its own origin exactly as it does in production, where one process serves both.

**It runs with no keys at all.** Every external service has a stub, chosen when its variable still holds the placeholder from `.env.example`. A stubbed integration is marked in the wallet pane and on every receipt it touches, so a faked run cannot be mistaken for a real one. `.env.example` says which prize gate each key unblocks.

## Verify it

```bash
bun run check              # format, type-aware lint, TS, boundaries, tests, knip
bun run e2e:install        # one-time local Chromium
bun run e2e
```

## How it hangs together

```mermaid
flowchart TB
  human([human])
  model([model])

  subgraph browser["packages/browser — the shared Chrome"]
    chrome[Chromium via Bun.WebView]
    arb{{"arbitration<br/>agent · human · idle"}}
  end

  subgraph server["apps/server — the only place these meet"]
    loop[agent loop]
    session[session]
  end

  subgraph leash["packages/wallet — the leash"]
    policy[["authorize()<br/>pure, no model"]]
    ledger[(spend ledger)]
  end

  graph[["packages/graph<br/>why it spent"]]
  pay[["packages/payments<br/>how it paid"]]
  oracle[/"GET /oracle/snapshot<br/>402, Hedera x402"/]

  human -->|clicks, types, stops| arb
  human -->|asks| loop
  arb --> chrome
  loop -->|browser tools| arb
  loop -->|graph_query| graph
  loop -->|"x402_fetch · wallet_send"| session
  session --> policy
  policy -->|allow| pay
  policy -.->|"deny · ask"| human
  session --> ledger
  graph -.->|evidence| session
  pay --> oracle
  oracle --> graph
  model --- loop

  chrome x--x policy
```

The dashed cross is the point: `packages/browser` cannot import `packages/wallet` and the reverse is forbidden too. The browser is where hostile content lives; the wallet is where signing happens. `tools/graph.ts` enforces it.

## What is where

|  |  |
| --- | --- |
| `apps/web` | The workspace: header strip, the stream with tickets, the live page card and its pop-outs, the details drawer. Frames never touch React state. |
| `apps/server` | One Bun process: SPA, API, both sockets, the agent loop; one browser worker process per user. |
| `packages/domain` | Money, mandates, decisions, receipts — as Effect Schema. |
| `packages/protocol` | Both wire protocols and the screencast frame envelope. |
| `packages/browser` | The shared Chrome. Knows nothing about money. |
| `packages/wallet` | Privy, the policy engine, the spend ledger. **The leash.** |
| `packages/payments` | x402: the gate we sell through, and the payer that buys. |
| `packages/graph` | The Graph gateway. The evidence a spend is justified by. |

`packages/browser` cannot import `packages/wallet`, and the reverse is also forbidden — `tools/graph.ts` enforces it. The browser is where hostile content lives; the wallet is where signing happens. They meet in exactly one file, `apps/server/src/services.ts`.

## The rules that are code, not prompts

- **The approval channel is not a tool.** No `raise_limit`, no `approve`. An agent that can approve its own spending has no leash. An outside agent's token cannot reach it either: a token starts and reads tasks and asks the wallet to sign, and gets 403 on everything else.
- **Payees have provenance.** An address that appeared only in page content or in the model's own output cannot be paid, however well-formed it is.
- **Reserve before you pay.** The ledger row is written before the outbound call, with an idempotency key, so a retried tool call cannot pay twice.
- **Page text is fenced.** It reaches the model prefixed as data, from a string constant that cannot be edited away in a prompt.
- **Stop aborts the run first, then withdraws every open ticket.** "Stop the agent" on a ticket does both. There is no freeze: the controls are Stop, the ticket, the caps and Disconnect.
- **The sale is written before the work.** A paid proof is settled, hashed and filed; the same proof presented twice is answered from the book, and an answer that fails after the money moved is a failed sale with the settlement on it, never a 500 with a debit. A payment sent and not confirmed is `uncertain` and is not refunded until the mirror node says it did not land.
- **Privy is the outer leash on the EVM leg.** Every signature the agent asks for goes through Privy's policy engine under a committed default-deny policy; an address the person typed passes the host's checks and is refused by Privy in Privy's words, on the receipt.
- **The pocket is a share, not a key.** The Hedera leg is paid from one host account; each person spends their share of it, credited once and topped up under the Privy policy. The next iteration opens one Hedera account per person and funds it from the treasury's HBAR float; until then "your allowance" is the honest phrase and "your account" is not.

## The demo, in order

1. **Open the workspace.** The mandate is on screen before anything has been spent: caps, allowlists, the pocket, the policy id.
2. **"What is the cheapest USDC borrow right now?"** One standardized Messari query across twelve lending deployments on four chains, at one block each, through The Graph. The answer names the indexes and blocks it came from.
3. **"Buy the snapshot."** The agent asks our own x402 endpoint, the host pays 0.05 HBAR on Hedera testnet through the facilitator under the mandate, the HCS note posts, and the agent opens the one-time unlocked page in the shared Chrome. Receipt: rule, transaction, HCS sequence, evidence hash.
4. **"Top up the pocket."** The agent asks the person's own Privy wallet to sign a USDC transfer to the treasury on Base Sepolia. Privy's rule (b) allows it: right token, right recipient, at most 2 USDC, at most 5 USDC a day. The pocket grows by what landed.
5. **"Send 5 USDC to 0xdead…"** Two refusals, and the receipt says which. An address the model produced is refused on provenance by the host before any cap is read. An address the person typed passes the host and is refused by Privy, whose policy has no rule for it: `Privy refused to sign under policy rk6q…: policy_violation`.
6. **Grab the page** mid-action. The ring turns blue; the agent waits for a fresh snapshot.
7. **Connect Hermes.** Mint a token in Details → Agents, paste the skill it shows into your personal agent, and run `froggy brief USDC` there: the CLI takes the 402, your Froggy wallet signs under the mandate, the task runs and comes back by id with its sale and receipts.

## On-chain and live evidence

| What | Where | Id |
| --- | --- | --- |
| Hedera x402 settlement, pocket `0.0.9700388` to payee `0.0.10377647`, fee paid by the facilitator | HashScan testnet | `1788625330.599677104` |
| Hedera x402 settlement against the **hosted** service, 6 Sep | HashScan testnet | `0.0.7162784@1788674975.439553201` |
| HCS topic, one note per settlement on both sides | HashScan testnet | `0.0.10381647` |
| Privy policy the agent signs under, two allow rules and an expiry | `docs/privy-agent-policy.json` | `rk6qw974uapbesb04u5tq5kb` |
| Privy rolling 24-hour aggregation on top-ups | Privy | `mpjhq6o0t9gzdvg3x0x4gmb1` |
| Privy refusals and one allowed signature, verbatim | `docs/evidence/PRIVY.md` | transcript of 5 Sep |
| The Graph, twelve deployments at one block each | `docs/evidence/GRAPH.md` | blocks of 6 Sep 06:09 UTC |
| The service card | `GET /.well-known/x402.json` on the live URL | — |

```bash
curl -i "https://app-production-58dd.up.railway.app/oracle/snapshot?symbol=USDC"
# HTTP/1.1 402 … {"x402Version":2,"accepts":[{"scheme":"exact","network":"hedera:testnet",…}]}
curl -s "https://app-production-58dd.up.railway.app/.well-known/x402.json"
```

## What is real, what is host-side, what is not

**Real.** A Chrome on our server the agent drives and you watch, grab and stop. Privy embedded wallets with the agent as a revocable additional signer under a committed default-deny policy, and Privy's own refusal on the receipt. Blocky402 settlements on Hedera testnet with HashScan ids and HCS notes, from a service we host and pay. Live Messari lending data from twelve deployments through The Graph.

**Host-side, not Privy.** The Hedera leg: the pocket balance, the per-transaction and rolling caps, idempotency, the provenance gate on page-derived addresses, the daily model budget. Privy evaluates policies only on transactions it can decode, and a Hedera transaction is a raw signature to it.

**Testnet, or not yet run live.** All Hedera value is testnet HBAR. The top-up sends Base Sepolia USDC to a treasury we control and credits the pocket at par; nothing is bridged. The typed-data x402 payment to The Graph's gateway is built and unverified until the demo wallet holds USDC on Base. The login-time grant of the agent signer is unverified against a real login; the refusal transcript comes from a wallet created with the same grant shape.

**Known gaps.** Privy's daily aggregation is app-wide and updates after signing, so two simultaneous top-ups can both pass; the host serializes each person's spends. A facilitator error after settlement is recorded as failed without consulting the mirror node. The pocket is a per-user balance, not a per-user account.

## Not in scope

Mainnet value for anyone but the team's demo wallet. Guest access without sign-in. Swaps, onramps, bridges, the injected `window.ethereum` provider, the WebMCP consumer. A per-user Hedera account. Anything that changes spending authority as a tool.

## Team

Kristjan Grm, Jonas Heinz, Hemang Vora. Built with Claude Code from 4 to 6 Sep 2026; `docs/evidence/AI-USE.md` says how.

## Surfaces

- **The workspace.** Chat-first; the page is a card in the stream, or a pane beside it, or a window of its own. Receipts are tickets: what and why on the body, rule id, transaction and evidence on the stub. A refusal is a stamp.
- **Telegram.** Pair with a code from the drawer. The daily digest arrives as a card; approval questions arrive with the same four buttons as the web ticket; a plain message runs the same agent on the same mandate.
- **The task API and the CLI.** `POST /api/tasks` sells a lending brief or a browse behind a 402 priced in HBAR at the mirror-node rate, with a durable task id, idempotency, status, receipts and an event stream. `GET /froggy-cli.js` serves a dependency-free command for Node or Bun that is a real x402 client with your Froggy wallet as its signer; `skills/froggy/SKILL.md` is the text a personal agent installs, and Details → Agents hands you a copy with your token filled in.
- **The daily digest.** One unattended turn a day at the hour you pick, bounded to a minute, a dozen steps, five cents and one paid request; nobody can be asked, so anything over the threshold is refused.
- **The directory.** Paste a URL and it is probed, never paid; if the 402 is one this wallet can honour, one click makes it payable, and that click is the only way a stranger's host reaches the allowlist.

## Evidence

`docs/evidence/HEDERA.md`, `GRAPH.md`, `PRIVY.md` hold the on-chain and live-data evidence as it lands, with `TODO` marking what is still to be recorded. `docs/evidence/AI-USE.md` says how AI was used, in the product and in building it.

## Where this is

`docs/plan/STATUS.md` — what has landed. `docs/plan/PLAN.md` — the plan. `docs/plan/DECISIONS.md` — what is still open. `docs/handover.md` — the demo in the order it should be shown, and the defect list with the commit that closed each one.

## Known limits

- Each signed-in user's Chrome profile is persistent, so the agent browses as _you_. That is the point and also the risk. Profiles live under `CHROME_PROFILE_DIR` in a directory named by a hash of the Privy identity, and deleting one signs that agent out of everything.
- `Bun.WebView` launches Chrome headless on its own, so a container needs no display server. Where Chrome cannot start, the pane says so and everything else keeps working.
- Browser seats live in one server process, so the deployment runs at one replica. The spend ledger, mandates, receipts, sales, tasks and agent tokens are in Postgres when `DATABASE_URL` is set and in memory otherwise, and the wallet pane says which.
