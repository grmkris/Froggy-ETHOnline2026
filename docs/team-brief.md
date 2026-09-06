# Froggy: team discussion brief

> Historical pre-sync handoff. The later meeting changed the first audience to existing personal-agent users. Read [iteration 2 context](sync/iteration-2-context.md) for current direction, Hedera billing, funding/card scenarios and the updated Fable prompt. The repository map below remains useful; implementation status is a dated snapshot.

Prepared 6 September 2026. Implementation snapshot: `8e7eed7`. This is a meeting handoff, not an approved replacement for the implementation plan.

New meeting input: [agentic-wallet research synthesis](research/agentic-wallets-2026-09-06/synthesis.md) and the [Fable 5.1 facilitation prompt](research/agentic-wallets-2026-09-06/fable-5.1-grilling-prompt.md). The synthesis includes a later commit spot-check and new market research; this brief retains its original implementation snapshot.

## Where we are

Froggy has a substantial foundation: a chat workspace, shared browser, wallet policies, payments, receipts, and scheduled reports. The latest commits make the conversation easier to understand. The implemented demo still demonstrates controlled agent spending; the owner’s intended audience is nontechnical people who want to understand money, discover savings and earning opportunities, and eventually get help buying things.

The meeting should connect that audience to one complete user journey and three meaningful sponsor integrations. Finishing chat presentation will improve the experience, but funding, earning, and withdrawing remain separate product work.

## Direction stated by the owner

- Audience: nontechnical people interested in saving money, earning a return, and learning about economics. Shopping assistance is a longer-term possibility.
- First-session value: learn about savings and earning opportunities within roughly three minutes.
- Money starts outside crypto: a regular bank account or a payment method such as Apple Pay.
- Submission: Start from Scratch, with exactly three sponsor choices. Optimize for substantial prizes and a coherent product.
- Existing sponsor choices can be reconsidered.
- No external user testing has been reported in this discussion.

The country, starting amount, exact financial action, final sponsors, and meaning of pause/freeze are not settled. This discussion has not authorized a real-money consumer deployment.

## Repository map

A Bun/TypeScript monorepo with two applications and shared packages. Turbo coordinates workspace tasks. React renders the frontend; Bun serves the backend; Effect owns configuration, server lifecycle, and schema contracts; Postgres stores durable state when configured.

| Location | Responsibility |
| --- | --- |
| `apps/web/` | Chat, market cards, browser view, receipts, approvals, sign-in, settings. |
| `apps/server/` | API and sockets, agent turns, workspaces, payment coordination, paid data endpoint, Telegram, daily jobs. |
| `packages/domain/` | Money, mandates, decisions, identities, receipts. No UI or transport dependencies. |
| `packages/protocol/` | Validated messages and tool-result contracts. |
| `packages/browser/` | Chrome workers, page actions, screencast, human/agent handoff. |
| `packages/wallet/` | Privy integration, policy evaluation, spending ledger, storage, EVM transfers. |
| `packages/payments/` | x402 protocols, Hedera/EVM payers, paid-service gate, pricing, HCS notes. |
| `packages/graph/` | Standardized lending queries, deployment registry, freshness checks. |
| `packages/database/` | Database schema and migrations. |
| `packages/ui/` | Shared interface components and visual tokens. |
| `e2e/` | Playwright interaction tests. Unit tests live beside implementation files. |
| `tools/` | Repository checks and utilities; `tools/graph.ts` declares package boundaries. |
| `.railway/`, `.github/` | Deployment configuration and CI workflows. |
| `AGENTS.md`, nested `AGENTS.md`, `.agents/skills/` | Coding-agent instructions and browser, spending, verification constraints. |

A message starts a server-owned agent turn. Browser actions go to the user’s Chrome worker; financial actions go through the session’s policy and ledger before a payment adapter is called. Results and receipts return to the conversation. Closing a tab does not cancel the run.

`apps/server/src/services.ts` integrates browser and wallet capabilities. Those two packages cannot import each other. Spending authority stays outside the package handling web-page content.

## Documentation and reading order

| Location | How to use it |
| --- | --- |
| [README](../README.md) | Current pitch, setup, architecture, demo, limitations. Still describes controlled spending. |
| [docs index](README.md) | Entry point to documentation. |
| [PLAN](plan/PLAN.md) | Existing roadmap and architecture; some descriptions lag implementation. |
| [STATUS](plan/STATUS.md) | Chronological work record. Later updates can supersede earlier tables. |
| [DECISIONS](plan/DECISIONS.md) | Previous scope and product decisions; needs reconciliation with the consumer direction above. |
| [Evidence](evidence/) | Graph, Privy, Hedera evidence, missing live demonstrations, and AI-use disclosure. |
| [Architecture decisions](decisions/) | Durable technical choices, including chat rendering in ADR 0008. |
| [Planning index](plan/README.md) | Earlier product, audience, flow, prize, and launch studies. |
| [Research](research/), [archive](plan/archive/) | Historical studies and alternatives, not current commitments. |
| [Earlier handover](handover.md) | Historical demo and defect handoff. |
| [Prize snapshot](prizes.md) | Copied requirements; check official pages before final selection. |
| [Privy policy](privy-agent-policy.json) | Rules for existing EVM signing flows. |

For the meeting, read this brief, the README, and the three sponsor evidence files. Consult longer research when a decision needs it. The newer consumer direction previously lived in the conversation; this brief now records it in the repository without silently rewriting prior decisions.

## Implementation snapshot

**Existing foundation:** per-user browser workers and persistent profiles; authenticated chat; policies and approvals; receipts and storage; Graph lending data; x402 purchase and sale paths; a per-user allowance on a host-held Hedera account; EVM signing and transfer code; Telegram integration code; daily jobs.

**Recent chat work:** improved scrolling and streamed Markdown; collapsed reasoning; readable tool outcomes; receipts attached to tool calls; structured Graph results; a mandate-first opening screen. The latest commits group browser steps (`6d9b925`) and present Graph comparisons (`8e7eed7`). These edits are committed; this brief does not assert the other agent has finished its entire task or the deployment has caught up.

**Recorded evidence:** live Graph data across twelve deployments, Hedera testnet settlements including a request against the hosted endpoint, and Privy refusals plus an allowed signature. The allowed signature in PRIVY.md was not broadcast.

**Still marked unverified:** real-login signer grant; user-wallet top-up and refusal in the deployed app; paid Graph query from a funded demo wallet; remaining on-camera interactions. These are evidence-file findings, not fresh external checks.

**Consumer flows absent from the inspected paths:** bank/card/Apple Pay funding, an earning-position deposit and withdrawal, cash-out to a bank, and personal goals with historical market comparisons. The existing pocket top-up buys a service allowance; it does not earn yield.

## Where the story needs alignment

1. **Audience:** older documents prioritize x402 sellers and developers; the owner now wants ordinary consumers.
2. **Opening:** the new welcome screen asks for something that costs money. It offers borrowing rates, buying a snapshot, and a refused transfer, which do not introduce a savings journey.
3. **Financial answer:** supply rates exist, but market selection, model-facing prose, and the displayed winner emphasize cheapest borrowing. Earning comparisons require data and model-context changes as well as labels.
4. **Paid value:** the free query and paid snapshot use the same lending client. The paid step needs a distinct useful result or should leave the first-use journey.
5. **Monitoring:** the digest asks for what changed without receiving a previous market snapshot or personal goal. Useful alerts need a baseline.
6. **Control:** today freeze zeroes the service allowance. A balance-preserving pause is a proposal to discuss, not an implemented change.

Engineering follow-up also includes uncertain settlements treated as failures, Telegram freeze not immediately revoking the Privy signer without a user token, and late refunds/top-ups restoring a zeroed allowance. These affect product promises independently of presentation.

## Proposed through-line

“Froggy helps you understand what your spare money could do, take a step you understand, and keep track afterward.”

Possible demo: enter an amount and time horizon; compare live earning opportunities; explain returns, costs, withdrawal conditions, and risks; view the source together; approve a clearly labelled practice action; withdraw; choose what to monitor.

This is a proposal requiring a real execution path before it becomes the submission promise. Sandbox funding, testnet transactions, and live market data must remain clearly distinguished.

The chat explains, the browser shows and guides, the wallet executes, policies constrain automation, receipts record outcomes, and Telegram brings back useful updates. Shopping and a business edition can remain future directions while the submission completes one journey.

## Decisions to leave the meeting with

| Decision | Concrete output |
| --- | --- |
| First user | One country, typical starting amount, and problem. |
| First-session success | What the person understands or completes within three minutes. |
| Submission flow | Exact start and end, including whether an earning deposit and withdrawal are demonstrated. |
| Three sponsors | Each sponsor’s role in that flow and eligible Start from Scratch tracks. |
| Funding and custody | Entry method, ownership of balances, and what the person can withdraw. |
| Autonomy | What happens automatically, what needs approval, and what pause does. |
| Scope and owners | Must-complete tasks, later work, owner of each dependency, demo acceptance checks. |
| Validation | Three nontechnical testers and a scheduled session with a short task. |

Graph and Privy fit comparison and funding/action respectively. Hedera has existing implementation but needs a useful service-purchase role. Alternatives discussed include 1inch Aqua and Arc; none has been selected. Weigh award size against remaining work and demo quality. Verify whether one project can win several awards from the same sponsor before adding those amounts together.

Official references: [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph), [Privy](https://ethglobal.com/events/ethonline2026/prizes/privy), [Hedera](https://ethglobal.com/events/ethonline2026/prizes/hedera), [1inch](https://ethglobal.com/events/ethonline2026/prizes/1inch), [Arc](https://ethglobal.com/events/ethonline2026/prizes/arc).

After the meeting, reconcile the chosen direction into PLAN.md, DECISIONS.md, the README, onboarding, and agent instructions. Keep this brief as a dated discussion record rather than another competing plan.

## Practical handoff

- Follow the README and `.env.example` for local setup with `bun install` and `bun dev`. Stubs allow development without credentials and must remain visible.
- The gate is `bun run check`; visible changes also need `bun run e2e` and interaction checks. Passing stub tests does not prove live financial completion.
- The team’s Telegram group is reachable through Hermes bot `@kermes96bot` in `hackathons`; a connection check was delivered. This is separate from Froggy’s own Telegram integration. Replies to Hermes do not automatically reach this coding conversation.
- This handoff changes documentation only. The separate chat agent owns verification and completion of its implementation work.
- Handoff validation: documentation formatting and diff whitespace checks passed. `bun run check:fast` passed; `bun run check` reached Knip and stopped on the unused `eventsFrom` export in the concurrently edited `apps/web/src/lib/app-state.ts`. Recheck after the chat agent finishes. No browser suite was rerun for this documentation-only change.
