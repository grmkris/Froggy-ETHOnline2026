# Froggy

> Other agent wallets give a model a key and a cap. Froggy gives it a browser you can see, grab and freeze — and a policy that still holds when you jailbreak the prompt.

A web workspace where a human and an AI share **one Chrome**. The human watches a live screencast and can take the page mid-action. The agent drives that same Chrome over CDP. What it may spend is not a prompt rule: it is a mandate the agent cannot reach, evaluated outside the model, on every payment.

Built for ETHOnline 2026 — **Privy** (the wallet and the leash), **The Graph** (why it spent), **Hedera x402** (how it paid).

```
┌──────────────────────────┬──────────────────────────┬─────────────────┐
│  chat                    │  the shared page         │  wallet         │
│  ask · steer · stop      │  agent drives · you can  │  caps · rules   │
│                          │  grab it · amber = agent │  receipts · 🧊  │
└──────────────────────────┴──────────────────────────┴─────────────────┘
```

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

  human -->|clicks, types, freezes| arb
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
| `apps/web` | The three panes. Frames never touch React state. |
| `apps/server` | One Bun process: SPA, API, both sockets, the agent loop; one browser worker process per user. |
| `packages/domain` | Money, mandates, decisions, receipts — as Effect Schema. |
| `packages/protocol` | Both wire protocols and the screencast frame envelope. |
| `packages/browser` | The shared Chrome. Knows nothing about money. |
| `packages/wallet` | Privy, the policy engine, the spend ledger. **The leash.** |
| `packages/payments` | x402: the gate we sell through, and the payer that buys. |
| `packages/graph` | The Graph gateway. The evidence a spend is justified by. |

`packages/browser` cannot import `packages/wallet`, and the reverse is also forbidden — `tools/graph.ts` enforces it. The browser is where hostile content lives; the wallet is where signing happens. They meet in exactly one file, `apps/server/src/services.ts`.

## The rules that are code, not prompts

- **The approval channel is not a tool.** No `raise_limit`, no `unfreeze`. An agent that can approve its own spending has no leash.
- **Payees have provenance.** An address that appeared only in page content or in the model's own output cannot be paid, however well-formed it is.
- **Reserve before you pay.** The ledger row is written before the outbound call, with an idempotency key, so a retried tool call cannot pay twice.
- **Page text is fenced.** It reaches the model prefixed as data, from a string constant that cannot be edited away in a prompt.
- **Freeze aborts the run first, then takes the page.** The other order gives the next queued tool call the page back 1.5 seconds later.

## Where this is

`docs/plan/STATUS.md` — what has landed. `docs/plan/PLAN.md` — the plan. `docs/plan/DECISIONS.md` — what is still open. `docs/handover.md` — the demo in the order it should be shown, and the defect list with the commit that closed each one.

## Known limits

- Each signed-in user's Chrome profile is persistent, so the agent browses as _you_. That is the point and also the risk. Profiles live under `CHROME_PROFILE_DIR` in a directory named by a hash of the Privy identity, and deleting one signs that agent out of everything.
- `Bun.WebView` launches Chrome headless on its own, so a container needs no display server. Where Chrome cannot start, the pane says so and everything else keeps working.
- Browser seats live in one server process, so the deployment runs at one replica. The spend ledger, mandates, receipts and the frozen flag are in Postgres when `DATABASE_URL` is set and in memory otherwise, and the wallet pane says which.
