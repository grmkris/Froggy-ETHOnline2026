# Froggy

> A wallet for your agents. Fund tasks, watch the work, and keep receipts.

Connect your own agent or use Froggy here. Start with one balance, USDC on Base and HBAR on Hedera in dollars, then follow a task through its result and receipt. An outside agent can request paid tasks over Hedera x402 without holding a wallet private key.

Inside a task, a human and an AI share **one Chrome**. The human watches a live screencast and can take the page mid-action. The agent drives that same Chrome over CDP. Spending rules are evaluated outside the model on every payment. Privy holds the wallet keys; the host enforces the mandate, including limits that Privy's raw Hedera signing cannot express.

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

During a task, the conversation is the ledger: every receipt is filed under the turn that produced it, the live page sits under the turn that opened it, and a question for you pins above the composer with four answers. The same four answers reach your phone through Telegram, where the daily digest lands too.

Production runs on Hedera mainnet and Base mainnet. [Release evidence](docs/evidence/MAINNET_RELEASE.md) records the hosted payment, HCS audit note, Base treasury payment, deployment and validation. The current visual implementation is recorded in [the UI plan pack](plans/README.md). Hedera payments automatically convert USDC when needed; durable confirmation and recovery after a partial conversion remain backend work. [Iteration 3](docs/plan/ITERATION_3.md) records current completion and remaining live checks.

[Browse the desktop and mobile screenshot tour](docs/evidence/ui-review-2026-09-07/README.md) for the five main pages, interaction states and before/after comparisons.

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
| `apps/web` | Wallet home, funding and agent setup; the conversation with receipts and a shared browser; wallet/settings drawer. Frames never touch React state. |
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
- **Each person has a Hedera account of their own.** Opened by Froggy's float at their first funded Hedera payment; from then on their account pays every 402 and a seller's book names them, not the host. A top-up credits the ledger and moves the same value in HBAR into the account at the mirror-node rate. Custody follows the configured signer adapter; `/health` reports whether accounts are per person.

## The demo, in order

1. **Open the workspace.** One balance is on screen before anything has been spent, and the settings name the allowlists and the policy id.
2. **"What is the cheapest USDC borrow right now?"** One standardized Messari query across twelve lending deployments on four chains, at one block each, through The Graph. The answer names the indexes and blocks it came from.
3. **"Buy the snapshot."** The agent asks our own x402 endpoint, the configured payer pays 0.05 HBAR on Hedera mainnet through the facilitator under the mandate, the HCS note posts, and the agent opens the one-time unlocked page in the shared Chrome. Receipt: rule, transaction, HCS sequence, evidence hash.
4. **A Hedera payment with no HBAR.** Froggy converts on the spot: the person's own Privy wallet signs a USDC transfer to the treasury on Base mainnet under rule (b) (right token, right recipient, at most 10 USDC, at most 25 USDC a day), the float funds their Hedera account with the same value, and the payment goes through. Two receipts, one purchase.
5. **"Send 5 USDC to 0xdead…"** Two refusals, and the receipt says which. An address the model produced is refused on provenance by the host before any cap is read. An address the person typed passes the host and is refused by Privy, whose policy has no rule for it: `Privy refused to sign under policy rk6q…: policy_violation`.
6. **Grab the page** mid-action. The ring turns blue; the agent waits for a fresh snapshot.
7. **Connect an agent.** `claude mcp add --transport http froggy https://<host>/mcp` and authenticate: a tab opens on Froggy, you see what the agent may buy, and you click Allow. Or install the CLI and run `froggy login` (`--manual` in a sandbox with no browser), then `froggy brief USDC`: the CLI takes the 402, your Froggy wallet signs under the mandate, the task runs and comes back by id with its sale and receipts. Nothing is pasted; Disconnect on the Agents page ends it.

## On-chain and live evidence

| What | Where | Id |
| --- | --- | --- |
| Hosted Hedera mainnet payment, HTTP 200, 7 Sep | [Release evidence](docs/evidence/MAINNET_RELEASE.md) | `0.0.10571514@1788735637.380133493` |
| Matching mainnet audit note | HCS topic `0.0.10847557` | sequence 2 |
| Privy treasury payment to The Graph, 0.01 USDC | Base mainnet | `0x9355a0c0378f4a011a9a793d57ed15f045d9dba6c137cf730c72402b5d0993cd` |
| Hedera x402 settlement, pocket `0.0.9700388` to payee `0.0.10377647`, fee paid by the facilitator | HashScan testnet | `1788625330.599677104` |
| Hedera x402 settlement against the **hosted** service, 6 Sep | HashScan testnet | `0.0.7162784@1788674975.439553201` |
| HCS topic, one note per settlement on both sides | HashScan testnet | `0.0.10381647` |
| Privy policy the agent signs under, two allow rules and an expiry | `docs/privy-agent-policy.json` | `rk6qw974uapbesb04u5tq5kb` |
| Historical Sepolia top-up aggregation, 5 Sep | Privy | `mpjhq6o0t9gzdvg3x0x4gmb1` |
| Privy refusals and one allowed signature, verbatim | `docs/evidence/PRIVY.md` | transcript of 5 Sep |
| The Graph, twelve deployments at one block each | `docs/evidence/GRAPH.md` | blocks of 6 Sep 06:09 UTC |
| The service card | `GET /.well-known/x402.json` on the live URL | — |

```bash
curl -i "https://app-production-58dd.up.railway.app/oracle/snapshot?symbol=USDC"
# HTTP/1.1 402 … {"x402Version":2,"accepts":[{"scheme":"exact","network":"hedera:mainnet",…}]}
curl -s "https://app-production-58dd.up.railway.app/.well-known/x402.json"
```

## What is real, what is host-side, what is not

**Real.** A Chrome on our server the agent drives and you watch, grab and stop. Privy embedded wallets with the agent as a revocable additional signer under a committed default-deny policy, and Privy's own refusal on the receipt. Blocky402 settlements on Hedera mainnet with HashScan ids and matching HCS notes, including a paid HTTP 200 response from the hosted service. Live Messari lending data from twelve deployments through The Graph.

**Host-side, not Privy.** The Hedera leg: the pocket balance, the per-transaction and rolling caps, idempotency, the provenance gate on page-derived addresses, the daily model budget. Privy evaluates policies only on transactions it can decode, and a Hedera transaction is a raw signature to it.

**Mainnet since Mon 7 Sep.** Float `0.0.10847552`, receiver `0.0.10847556`, HCS topic `0.0.10847557`. Production uses a separate mainnet ledger; the old testnet database is retained. The top-up is configured to transfer Base mainnet USDC to the treasury and allocate HBAR from the float. A direct Privy-signed treasury query paid The Graph 0.01 USDC on Base and returned live data. This does not prove the person's onramp, top-up or login-time signer grant; those journeys still need a real signed-in person.

**Known gaps.** Durable funding confirmation and partial-allocation recovery remain open. Uncertain payments require reconciliation before another purchase. The new marketplace suppliers need their reviewed policy configuration and paid delivery proofs; X search also needs provider credentials. MCP clients sign in through OAuth 2.1 at `/mcp` (ADR 0012); the live check from Hermes' sandbox and the public agents page are still owed.

## Not in scope

Guest access without sign-in. Anything that changes spending authority as an agent tool. Card purchases, bridges, browser-based MCP clients on another origin and a completed real onramp are not claims of this release.

## Team

Kristjan Grm, Jonas Heinz, Hemang Vora. Built with Claude Code from 4 to 6 Sep 2026; `docs/evidence/AI-USE.md` says how.

## Surfaces

- **The workspace.** Wallet-first; tasks continue in chat, where the page is a card in the stream, or a pane beside it, or a window of its own. Receipts are tickets: what and why on the body, rule id, transaction and evidence on the stub. A refusal is a stamp.
- **Telegram.** Open Connect an agent → Telegram, then open the bot and tap Start using the expiring link. The daily digest arrives as a card; approval questions arrive with the same four buttons as the web ticket; a plain message runs the same agent on the same mandate.
- **The task API and the CLI.** `POST /api/tasks` sells a lending brief or a browse behind a 402 priced in HBAR at the mirror-node rate, with a durable task id, idempotency, status, receipts and an event stream. `GET /froggy-cli.js` serves a dependency-free command for Node or Bun that is a real x402 client with your Froggy wallet as its signer; `froggy login` signs it in through the browser (or `--manual` by a pasted code) and `skills/froggy/SKILL.md` is the text a personal agent installs, with no secret in it. A minted token under "Advanced: connect with a token" remains for an unattended agent.
- **Services and MCP.** Froggy is a remote MCP server at `/mcp` with OAuth 2.1: dynamic registration, PKCE, a consent page with one switch per scope (`brief`, `browse`, `pay`, `services`), short-lived access tokens, rotating refresh tokens, and Disconnect on the Agents page. The catalog, chat, CLI and MCP share durable service tasks and spending controls. Provider availability is explicit; setup and live activation requirements are in [the marketplace handoff](docs/evidence/MARKETPLACE.md).
- **The daily digest.** One unattended turn a day at the hour you pick, bounded to a minute, a dozen steps, five cents and one paid request; nobody can be asked, so anything over the threshold is refused.
- **The directory.** Paste a URL and it is probed, never paid; if the 402 is one this wallet can honour, one click makes it payable, and that click is the only way a stranger's host reaches the allowlist.

## Evidence

`docs/evidence/HEDERA.md`, `GRAPH.md`, `PRIVY.md` hold the on-chain and live-data evidence as it lands, with `TODO` marking what is still to be recorded. `docs/evidence/AI-USE.md` says how AI was used, in the product and in building it.

## Where this is

`docs/plan/STATUS.md` — what has landed. `docs/plan/NEXT_ITERATION.md` — the current plan. `docs/plan/DECISIONS.md` — what is still open. `docs/handover.md` — the demo in the order it should be shown, and the defect list with the commit that closed each one.

## Known limits

- Each signed-in user's Chrome profile is persistent, so the agent browses as _you_. That is the point and also the risk. Profiles live under `CHROME_PROFILE_DIR` in a directory named by a hash of the Privy identity, and deleting one signs that agent out of everything.
- `Bun.WebView` launches Chrome headless on its own, so a container needs no display server. Where Chrome cannot start, the pane says so and everything else keeps working.
- Browser seats live in one server process, so the deployment runs at one replica. The spend ledger, mandates, receipts, sales, tasks and agent tokens are in Postgres when `DATABASE_URL` is set and in memory otherwise, and the wallet pane says which.
