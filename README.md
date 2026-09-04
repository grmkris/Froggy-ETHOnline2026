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

## What is where

|  |  |
| --- | --- |
| `apps/web` | The three panes. Frames never touch React state. |
| `apps/server` | One Bun process: SPA, API, both sockets, the agent loop, Chrome. |
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

`docs/handover.md` — what works, what is stubbed, what to build next, and the demo in the order it should be shown.

## Known limits

- The Chrome profile is persistent, so the agent browses as _you_. That is the point and also the risk; it lives in `CHROME_PROFILE_DIR` and deleting it signs the agent out of everything.
- `Bun.WebView` wants a real window, so a container needs a display. Where the browser cannot start the pane says so and everything else keeps working.
- The spend ledger is in-memory, so the deployment runs at one replica. `packages/database` holds the schema a second one would need.
