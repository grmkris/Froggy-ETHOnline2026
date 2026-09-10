# Bug triage

A consolidated list of the defects and inconsistencies the feature documents raised, in their bodies and in their "Open questions and verification" sections. Each entry was read from the Froggy tree at commit `5caed50` and its tests. **No entry has been confirmed in the running product**; none carries a Status line yet, and a verification pass is what would add them.

The list exists so the product team can decide, item by item, whether to fix, to document as intended, or to leave.

## Summary

_In progress: entries are being merged as the remaining documents land. The counts and the clusters paragraph will be written last._

Two clusters are already visible. The first is **things the server computes and the interface never shows** — a ledger warning, a stub marker, a refusal's reason — which matters more here than in most products, because this one's entire claim is that you can see what your agent did. The second is **words that no longer match the code they describe**, where a comment or a label was left behind by a change made the next day.

| ID | Title | Severity | Area | Decision needed |
| --- | --- | --- | --- | --- |
| B-01 | A stubbed build is not marked on the Wallet, breaking the loud-stub rule | high | wallet | fix |
| B-02 | The warning that the balance is only a floor is computed and never shown | high | wallet | fix |
| B-03 | A minted token is displayed as holding fewer scopes than it actually has | high | connections | fix |
| B-05 | The action-kind authority table is never consulted, so `transfer` and `trade` do not always ask | high | leash | fix |
| B-06 | Editing your allowance does not reach Froggy's own mandate | high | leash | fix |
| B-07 | Freezing the wallet does not stop trading | high | leash | fix |
| B-04 | Add funds no longer offers the address first, undoing a decision made the day before | medium | wallet | fix |

## High

### B-01: A stubbed build is not marked on the Wallet, breaking the loud-stub rule

- **Where the user meets it:** Looking at the Wallet on a build where the database or a balance source is stubbed.
- **What happens / what was expected:** The Wallet shows a bare "Total unavailable". The server sends `balanceLabel`, which carries "balance unavailable (stub)", and the only reader of that field in the whole web app is `apps/web/src/lib/webmcp.ts` — the machine-facing surface. A person looking at the screen is not told the figure is stubbed. Expected, per the repository's own rule: every stub is loud, and the wallet pane marks it.
- **Reproduce:** Run with a stubbed integration (the e2e suite's own configuration will do) and open the Wallet. Compare what the page says with the `balanceLabel` on the wire.
- **Why (from the code):** `balanceLabel` is declared in `packages/protocol/src/app.ts:182` and read only at `apps/web/src/lib/webmcp.ts:76`. No component under `apps/web/src/components/wallet/` reads it.
- **Severity:** `high`. The root `AGENTS.md` states the rule this breaks: "A faked run that could pass for a real one is the one failure mode this design exists to prevent." A screenshot of this Wallet cannot be distinguished from a real one.
- **Decision needed:** `fix`. Render `balanceLabel` on the Wallet card when the total is unavailable.
- **Raised by:** [the balance](workspace/wallet/the-balance.md#open-questions-and-verification), [stubs](cross-cutting/stubs.md)

### B-02: The warning that the balance is only a floor is computed and never shown

- **Where the user meets it:** When the spend ledger cannot be read, so the balance shown is a lower bound and payments will start being refused for reasons the page does not explain.
- **What happens / what was expected:** The server builds the sentence "Spend history unavailable: … The figure below is a floor, and payments will be refused." and sends it as `ledgerNote`. Nothing in the web app renders it. The person sees an ordinary balance, and then unexplained refusals. Expected: the sentence appears where the balance does.
- **Reproduce:** Make the spend-history read fail, open the Wallet, then attempt a spend.
- **Why (from the code):** `ledgerNote` is set at `apps/server/src/session.ts:981-1035` and asserted by `apps/server/src/session.test.ts:155-156`. Grepping `apps/web/src` for `ledgerNote` returns only test fixtures — no component reads it.
- **Severity:** `high`. The product silently withholds the one sentence that would explain the refusals that follow, and a server test proves the sentence was thought worth writing.
- **Decision needed:** `fix`. Render `ledgerNote` beside the balance.
- **Raised by:** [the balance](workspace/wallet/the-balance.md#open-questions-and-verification)

### B-03: A minted token is displayed as holding fewer scopes than it actually has

- **Where the user meets it:** Opening a connection's detail page for an agent that authenticates with a minted `fgy_` token.
- **What happens / what was expected:** The page lists the token's permissions as every scope **except** `history`. In fact a token caller carries no scope set at all, the scope check is skipped entirely for it, and it can call `froggy_history` along with everything else. Expected: the page states what the token can actually do.
- **Reproduce:** Mint a token in the interface, open `/agents/{id}`, read the permissions line; then call `froggy_history` with that token.
- **Why (from the code):** `apps/server/src/agent-invocations.ts:325` synthesises `OAUTH_SCOPES.filter((scope) => scope !== "history")` for display. The caller is built with `scopes: null` at `apps/server/src/router.ts:429`, and `apps/server/src/mcp.ts` guards with `caller.scopes !== null && !caller.scopes.has(scope)` — so a null scope set skips the check rather than denying. `apps/server/src/tasks.ts:123` says as much: "null for a person or a legacy `fgy_` token, which may do everything an agent may".
- **Severity:** `high`. It misstates a permission in the permissive direction, on the page a person visits specifically to audit what they have given away. It is also the one place in this surface where a missing restriction fails open rather than closed.
- **Decision needed:** `fix`. Either display the token's true reach, or give tokens a real scope set and check it.
- **Raised by:** [the agent detail](workspace/connections/the-agent-detail.md#open-questions-and-verification), [identity and agents](foundations/identity-and-agents.md#open-questions-and-verification)

### B-05: The action-kind authority table is never consulted, so `transfer` and `trade` do not always ask

- **Where the user meets it:** Any spend whose safety depends on _what kind of thing it is_ rather than its size — paying a person, or a trade — at an amount below the numeric ask threshold.
- **What happens / what was expected:** It is allowed without asking. Expected, per the table the product shows a person: `transfer` is on the ask side because "paying a person is your decision, whatever the amount", and `trade` likewise; `earn_deposit` and `earn_withdraw` carry their own $25 and $10 ceilings on top of the person's cap.
- **Reproduce:** With the default allowance (ask above $1), have the agent attempt a `transfer` of $0.50. Expected by the table: a person is asked. Observed from the code path: the kind is never considered, and only the numeric threshold applies, so it goes through.
- **Why (from the code):** `authorize` in `packages/wallet/src/policy.ts` draws the human line from `STANDING_AUTHORITY` **only when `input.allowance` is present** — `kindNeedsPerson` and `ceilingFor` are guarded on it. The judgement object built in `apps/server/src/session.ts:1388` passes `purchase`, `approved`, `intent`, `mandate`, `now`, `recent` and `pocket`, and **never `allowance`**. `AuthorizeInput`'s own comment describes the fallback honestly — "Absent … the `approval_threshold` rules decide exactly as they always have" — but nothing ever supplies it, so the fallback is the only regime that runs. `needsPerson` and `ceilingFor` are exported from `packages/domain` and imported only by `policy.ts`, where those branches never fire.
- **Severity:** `high`. The table is the part of the leash a person is _shown_, and `packages/domain/src/authority.ts` says so in as many words: "this is the part of it a person is shown, so it must stay readable by someone who does not know the codebase." A safety rule that is displayed and not enforced is worse than one that was never claimed.
- **Decision needed:** `fix`. Pass the person's allowance into the judgement. If the intent is that this build runs on the older threshold-only regime, the table should not be presented as current behaviour.
- **Raised by:** [the leash](foundations/the-leash.md#open-questions-and-verification), [the policy editor](workspace/wallet/the-policy-editor.md#open-questions-and-verification)

### B-06: Editing your allowance does not reach Froggy's own mandate

- **Where the user meets it:** Lowering a cap in the policy editor and expecting the agent to be held to it immediately.
- **What happens / what was expected:** The new numbers reach Privy at once, so the signer is bound. Froggy's own engine keeps judging against the mandate it already had, until the session is next hydrated. Expected, and the reason the design exists: the same four numbers become both, "so the Privy rules and the mandate rules cannot drift apart".
- **Reproduce:** Lower the per-spend cap, then have the agent attempt a spend above the new cap and below the old one, without reloading.
- **Why (from the code):** `WorkspaceSession.applyAllowance` (`apps/server/src/session.ts:887`) is what rebuilds the mandate's per-transaction cap, window cap, expiry and threshold from an allowance. Its only callers are `apps/server/src/session.test.ts:1308` and `:1324`. `PersonPolicies.adjust` writes the record to the store and tells no live session.
- **Severity:** `high`. It is precisely the drift the one-shape design was built to prevent, and it fails in the direction where Froggy's local engine — the one described as the synchronous backstop against a Privy outage — is the stale half.
- **Decision needed:** `fix`. Apply the allowance to the live session on commit.
- **Raised by:** [the policy editor](workspace/wallet/the-policy-editor.md#open-questions-and-verification), [the leash](foundations/the-leash.md#open-questions-and-verification)

### B-07: Freezing the wallet does not stop trading

- **Where the user meets it:** Freezing the wallet while the trading desk has work in progress, expecting everything to stop.
- **What happens / what was expected:** Trades continue. Only the desk's own **Stop trading** halts them. Expected: freeze halts spending, full stop — that is what distinguishes it from stopping a single run, and it is how the glossary, the wallet and every refusal path describe it.
- **Reproduce:** Start trading activity, freeze the wallet, observe whether the next step is refused.
- **Why (from the code):** `claimTradeStep` refuses when `request.frozen` is set, and both call sites in `apps/server/src/trading/coordinator.ts` — lines 518 and 581 — pass `frozen: false` as a literal. The separate guard at line 180 is the desk's own stopped flag, not the wallet's frozen state.
- **Severity:** `high`. Freeze is the product's panic control and the one thing a nervous person is told outlives any single run. A panic control with an exception nobody is told about is the wrong kind of surprise.
- **Decision needed:** `fix`. Pass the wallet's real frozen state into the trade path.
- **Raised by:** [trades](workspace/trades.md#open-questions-and-verification), [the leash](foundations/the-leash.md#open-questions-and-verification)

## Medium

### B-04: Add funds no longer offers the address first, undoing a decision made the day before

- **Where the user meets it:** Opening Add funds on the Wallet.
- **What happens / what was expected:** The dialog offers "Send from another chain" first, then the wallet address, then the card. The address is the only path that always works — it needs no Privy sign-in and no particular network — and it is second. Expected, per the commit that arranged it: the address first, the card second.
- **Reproduce:** Open the Wallet, press Add funds, read the order of the three sections. On a local identity the first section is absent entirely, so the dialog opens on the address by accident rather than by design.
- **Why (from the code):** `ffca8fe` (8 September) is titled "Offer the wallet address first in Add funds, and the card second" and rearranged the component to do that. `d998ff2` (9 September), which added funding from other chains, inserted the new section above the address in `apps/web/src/components/wallet/add-funds.tsx` and left the ordering undone. The file's own comment still describes the old arrangement — "one dialog, two ways in" and "The address comes first because it always works" — while there are now three ways in.
- **Severity:** `medium`. Recoverable and cosmetic in effect, but it silently reverses a deliberate product decision, and the stale comment means the next reader will not notice.
- **Decision needed:** `fix`. Restore the order, or update the comment and record that the decision changed.
- **Raised by:** [add funds](workspace/wallet/add-funds.md#open-questions-and-verification)

## Low

_To be written once every document has landed._
