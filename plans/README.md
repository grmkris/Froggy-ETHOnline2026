# Froggy visual and interaction overhaul

Prepared 6 September 2026 against `a587f55`. Status: **UI implemented locally; durable funding remains open**.

The owner selected **a calm, polished wallet with a playful frog accent**. This pack turns that choice into four bounded implementation plans. It supplements `docs/plan/NEXT_ITERATION.md`; it does not replace the accepted funding, custody, or agent architecture.

## Product story

**A wallet for your agents. Fund useful tasks, set spending limits, watch the work, and keep the receipts.**

The wallet is the front door. Connecting an existing agent is a primary path; Froggy's own chat is also available. The shared browser makes a task inspectable. Receipts explain the amount, recipient, result and rule. Privy custody and host-enforced controls support this story; do not imply that Privy can inspect or cap every raw Hedera signature.

The first coherent journey is: sign in → see wallet and task credit → fund if needed → connect an agent or use Froggy → complete one useful paid task → inspect its result and receipt. Connecting an agent may happen before funding; funding is required only when the chosen task needs it. Shopping and swaps remain later work in the existing product plan.

## Current status and evidence

The owner authorized implementation after this plan was written. The wallet, setup, shared motion and Stop changes are now in the local tree. See [implementation and verification](IMPLEMENTATION.md), including screenshots and remaining work. Deployment is now authorized; the release candidate passes the full local gate and all 35 browser tests. [GitHub CI](https://github.com/grmkris/Froggy-ETHOnline2026/actions/workflows/ci.yml) and Railway track the release outcome. The baseline audit notes below remain historical evidence.

- The wallet home, agent token UI, treasury Graph payer and configurable networks have landed. `7909a47` adds Privy-held Hedera keys; `a587f55` records testnet custody evidence and the Telegram bot deployment. These are repository records, not new live-provider checks by this audit.
- UI sources under `apps/web` and `packages/ui` have no differences between `d735e67` and this baseline. The earlier controlled desktop/mobile captures therefore remain useful UI evidence. The mobile wallet was above the initial viewport; Connect opened Policy; a failed token creation showed no error. See [the earlier review](../docs/plan/IMPROVEMENT_REVIEW_2026-09-06.md).
- This pass re-read the active UI, requested skills, installed component types and architecture decisions. Two read-only subagents audited shared components and workspace motion; their findings were checked against source.
- Provider readiness is separate: recorded bot deployment is not proof of pairing/digest/approval completion; testnet custody is not proof of the full mainnet task journey.

## Read and execute

Read [the visual brief](DESIGN.md) and [the evidence and motion audit](AUDIT.md). Every numbered plan also contains its own targets and boundaries so it can be handed to an executor independently.

| Order | Plan | Priority | Dependencies | Status |
| --- | --- | --- | --- | --- |
| 1 | [001 — Make the wallet the first screen](001-wallet-first.md) | HIGH | Recheck current ownership and baseline | Implemented locally |
| 2 | [003 — Establish restrained shared motion](003-shared-motion.md) | MEDIUM | 001, because both touch global CSS/progress | Implemented locally |
| 3 | [002 — Guide funding and agent setup](002-onboarding.md) | HIGH | 001; reuse 003 timing tokens | UI implemented; durable funding remains open |
| 4 | [004 — Keep live work and receipts readable](004-live-workspace.md) | HIGH for Stop; MEDIUM for motion | 001 and 003; coordinate workspace edits with 002 | Implemented locally |

Numbering identifies scope; the order column is the recommended execution sequence. The small Stop error-handling fix in 004 can be pulled forward before animation work. Avoid running overlapping plans against the same checkout.

**Completed first slice:** initial wallet visibility, direct agent navigation, one spending bar and truthful unknown-balance presentation. **Next:** the durable funding contract in plan 002 step 8, followed by live-provider verification and a short uncoached onboarding trial.

## Simplification and tests

Consolidate the duplicated funding UI, copy feedback and receipt status mapping only where there are actual callers. Keep presentation in the app and reusable primitives in `packages/ui`. No new animation library, workflow framework, state-machine package or global toast system is needed.

Keep policy, ledger/concurrency, authorization, tenant isolation, wire decoding, browser input/reconnect, approval focus and Graph freshness tests. Replace repeated copy-presence onboarding assertions with actual journey checks. In `apps/web/src/lib/suggestions.test.ts`, remove the editorial assertion forbidding a particular sentence while retaining the maximum-count and behavioral branch checks. No target test count or broad deletion pass.

The earlier review's payment retry, durable task ownership and partial top-up recovery concerns remain a separate prerequisite for calling the paid journey reliable. This design audit has not re-audited that backend. Read its recorded findings before changing payment semantics.

After implementation, reconcile `README.md`, `docs/plan/STATUS.md` and the current plan index with the chosen story and actual shipped journey. Update stale three-pane/Freeze language in nested agent guidance and verification instructions only after checking the current behavior; do not reintroduce retired controls to satisfy old prose. Preserve original meeting notes. Resolve formatting of imported skills and raw notes as a separate, narrowly scoped maintenance task.

## Completion bar

Each executor runs `bun run check:fast`, then `bun run check`, and `bun run e2e` for the visible changes on a deterministic stub configuration. Exercise desktop, narrow mobile, keyboard, reduced motion, delayed responses and recoverable errors. A wallet heading being present in the DOM is insufficient: check its initial viewport position before any action can scroll it into view.

Record implemented, locally verified, deployed and live-provider-verified separately. The final journey should be tried without coaching by someone who can explain wallet funds, task credit, limits and what the receipt proves. Real financial operations and deployment stay with the existing implementation authorization.

Before execution, re-read current nested `AGENTS.md` and ownership notes. Reconcile changed code with the plan; report material contract changes instead of overwriting the other agent's work. Update plan statuses only when their acceptance criteria are met.

## Verification of this plan pack

At the planning-only checkpoint, all seven Markdown files had balanced code fences and valid relative links. No application or test files had been edited at that point. Implementation results are recorded separately above. Required `bun run check:fast` and `bun run check` were attempted; both stop at formatting of newly imported skill files and existing raw meeting notes, before lint/types/tests. `bunx --bun oxfmt --check plans` passes for all seven authored files. No fresh full-suite or live-provider pass is claimed.
