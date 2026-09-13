---
name: froggy-verification
description: Verify a change to this repository, from the local gate through the live checks that no stub can stand in for before submission.
---

# Verifying

`bun run check` is the gate: format, type-aware lint, TypeScript across every project, package boundaries, agent-file validation, tests, and dead-code detection. It must pass before a commit, and it passes on a fully-stubbed build.

E2E is opt-in. Run `bun run e2e` only when the user explicitly requests it; do not start browser tests automatically for visible changes. E2E does not block commits, pushes, CI, or deployment. CI retains the full `bun run check` gate, Postgres persistence checks, and the application build.

The gate is deliberately strict, and two exceptions to it are written down rather than silent: `docs/decisions/0004` for the CDP boundary, and the scoped blocks in `oxlint.config.ts` for the Privy loader and two SDK bridges. Widen one by editing that file and saying why, not with a disable comment.

## What a stub cannot prove

The stubs make the whole flow runnable without keys. They cannot make it true. Before submission, each of these has to happen for real, and none of them has a substitute:

- `graph_query` returning numbers that **change between runs**, from a live Subgraph Studio key. Mocked data explicitly disqualifies the Graph track.
- A Hedera transaction id from a real paid request, resolving on a testnet mirror explorer. This is the Hedera qualification.
- One live Privy financial flow.

And the repository must be public.

## Checks worth doing by hand

The screencast paints; clicking in the canvas moves the page and flips the arbitration badge. A refusal appears in the wallet pane _before_ the model narrates it — that ordering is the demo. Freezing mid-run stops the turn and the spending. Reloading the tab mid-run resumes rather than restarts.
