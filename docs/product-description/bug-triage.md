# Bug triage

A consolidated list of the defects and inconsistencies the feature documents raised, in their bodies and in their "Open questions and verification" sections. Every entry was read from the Froggy tree at commit `5caed50` and its tests.

**No entry has been confirmed in the running product.** None carries a Status line; a verification pass is what would add them. Several of the high entries are claims about wiring that a five-minute check in the deployed app would settle either way, and those are the ones to check first.

## Summary

Roughly a hundred and thirty observations were raised across fifty-five documents. After merging by root cause they come to thirty-one entries: eight high, seventeen medium, and six low, the last of which is a cluster of copy and comment slips.

Two patterns account for most of the high ones.

The first is **things the server computes and the interface never shows**: a warning that the balance is only a floor, a stub marker, a settlement's side note, a refusal's reason on the Wallet. That matters more in this product than in most, because its entire claim is that you can watch what your agent did with your money. Each of these is a sentence someone thought worth writing, carried across the wire, and dropped at the last step.

The second is **safety machinery that is described but not wired**. The action-kind authority table, the allowance reaching the local engine, and the freeze control are all present in the vocabulary, in the schemas, in the interface's own words, and in the promise on the signed-out page — and none of the three runs. `packages/domain/src/authority.ts` says of its table: "this is the part of it a person is shown, so it must stay readable by someone who does not know the codebase." It is readable, and it is shown, and it is not consulted.

Nothing here suggests the design is wrong. It is a young codebase whose intent is unusually well documented in its own comments, which is precisely why the gaps between the comments and the wiring are findable at all.

| ID | Title | Severity | Area | Decision needed |
| --- | --- | --- | --- | --- |
| B-01 | Freeze does not exist, and is still promised on the signed-out page | high | leash | fix |
| B-02 | The action-kind authority table is never consulted, so `transfer` and `trade` do not always ask | high | leash | fix |
| B-03 | Editing your allowance does not reach Froggy's own mandate | high | leash | fix |
| B-04 | A stubbed build is not marked on the Wallet, breaking the loud-stub rule | high | wallet | fix |
| B-05 | The warning that the balance is only a floor is computed and never shown | high | wallet | fix |
| B-06 | A minted token is displayed as holding fewer scopes than it actually has | high | connections | fix |
| B-07 | One agent can read another agent's service tasks | high | agent surface | fix |
| B-08 | "Send a test now" spends real money with no warning | high | account | product call |
| B-09 | The four approval answers are labelled differently on two kinds of ticket | medium | approvals | fix |
| B-10 | The consent screen puts Allow nearest a stray click | medium | agent surface | product call |
| B-11 | A client's own name is rendered verbatim on the consent screen | medium | agent surface | fix |
| B-12 | Reloading the consent screen turns every switch back on | medium | agent surface | fix |
| B-13 | The scope classifier fails open on an unknown tool name | medium | agent surface | fix |
| B-14 | The wallet is readable by any connected agent with no scope | medium | agent surface | product call |
| B-15 | A missed schedule is recorded as though it ran, and nobody is told | medium | account | fix |
| B-16 | The digest's timezone line is the browser's, not the digest's | medium | account | fix |
| B-17 | Pairing Telegram silently takes the account from whoever had it | medium | account | fix |
| B-18 | Signing out leaves Telegram paired and able to approve spending | medium | account | product call |
| B-19 | A purchase cannot be stopped from the interface | medium | services | fix |
| B-20 | Resubmitting the same request is a second bill | medium | services | fix |
| B-21 | Network down, server down and signed out are indistinguishable | medium | offline | fix |
| B-22 | An unmatched API path returns the app shell with status 200 | medium | agent surface | fix |
| B-23 | Add funds no longer offers the address first, undoing a decision made the day before | medium | wallet | fix |
| B-24 | Home drops `/status`, and its stop has no feedback | medium | home | fix |
| B-25 | A history outage renders as an empty conversation list | medium | home | fix |
| B-26 | The appearance crossfade ignores reduced motion, and a test pins it that way | medium | motion | fix |
| B-27 | Conversation archive and delete exist as endpoints with no interface, and one state cannot be undone | medium | history | product call |
| B-28 | A discarded URL parameter is silent, including on links Froggy generates | medium | url state | fix |
| B-29 | The stub count omits the five trading venues | low | stubs | fix |
| B-30 | Accessibility gaps: no skip link, a title-attribute list, focus left on a removed button | low | accessibility | fix |
| B-31 | Small copy, comment and rendering slips | low | several | fix |

## High

### B-01: Freeze does not exist, and is still promised on the signed-out page

- **Where the user meets it:** Wanting to halt all spending at once. Also on the marketing surface, before signing up.
- **What happens / what was expected:** There is no way to freeze. Expected, per the product's own page: "Freeze spending or disconnect an agent whenever you need."
- **Reproduce:** Look for a freeze control anywhere in the workspace. Read the signed-out page.
- **Why (from the code):** The denial code `frozen` appears exactly once in the tree, as a literal in the list at `packages/domain/src/mandate.ts:148`. Nothing constructs a refusal carrying it. There is no freeze, unfreeze, or frozen state in `apps/server/src` or `apps/web/src`. `apps/web/src/lib/denial.ts:22` maps the code to "The wallet is frozen." — a renderer for something never emitted. The promise is at `apps/web/src/components/sign-in-gate.tsx:11`. `mandate.ts` records the cause in an aside: one field is absent "for `frozen` on receipts written before **the kill switch was removed**". Two further remnants survive: `claimTradeStep` takes a `frozen` flag whose only two callers pass `false` as a literal (`apps/server/src/trading/coordinator.ts:518` and `:581`), and this description's own thirteen-row interrupt list asks every feature what freezing does.
- **Severity:** `high`. It is the panic control, it is named in the pitch, and it is promised to people who have not signed up yet. Disconnecting an agent — the other half of the same sentence — does exist, so the promise is half true, which is worse than plainly false.
- **Decision needed:** `fix`. Either restore a kill switch, or remove the promise and the remnants. If it is deliberately out of scope for this build, the signed-out page must stop offering it before anyone demonstrates the product.
- **Raised by:** [stopping and freezing](workspace/conversation/freeze.md#open-questions-and-verification), [the leash everywhere](cross-cutting/the-leash-everywhere.md), [trades](workspace/trades.md#open-questions-and-verification), [the leash](foundations/the-leash.md#open-questions-and-verification)

### B-02: The action-kind authority table is never consulted, so `transfer` and `trade` do not always ask

- **Where the user meets it:** Any spend whose safety depends on _what kind of thing it is_ rather than its size — paying a person, or a trade — at an amount below the numeric ask threshold.
- **What happens / what was expected:** It is allowed without asking. Expected, per the table the product shows a person: `transfer` is on the ask side because "paying a person is your decision, whatever the amount", `trade` likewise, and `earn_deposit`/`earn_withdraw` carry their own $25 and $10 ceilings on top of the person's cap.
- **Reproduce:** With the default allowance (ask above $1), have the agent attempt a `transfer` of $0.50. By the table a person is asked; by the code path the kind is never considered.
- **Why (from the code):** `authorize` in `packages/wallet/src/policy.ts` draws the human line from `STANDING_AUTHORITY` **only when `input.allowance` is present** — `kindNeedsPerson` and `ceilingFor` are both guarded on it. The judgement object built at `apps/server/src/session.ts:1388` passes `purchase`, `approved`, `intent`, `mandate`, `now`, `recent` and `pocket`, and never `allowance`. `AuthorizeInput`'s own comment describes the fallback honestly — "Absent … the `approval_threshold` rules decide exactly as they always have" — but nothing supplies it, so the fallback is the only regime that ever runs.
- **Severity:** `high`. A safety rule that is displayed and not enforced is worse than one never claimed, and `authority.ts` is explicit that this table is the part a person is shown.
- **Decision needed:** `fix`. Pass the person's allowance into the judgement. If this build is meant to run on the threshold-only regime, stop presenting the table as current behaviour.
- **Raised by:** [the leash](foundations/the-leash.md#open-questions-and-verification), [the policy editor](workspace/wallet/the-policy-editor.md#open-questions-and-verification), [the leash everywhere](cross-cutting/the-leash-everywhere.md)

### B-03: Editing your allowance does not reach Froggy's own mandate

- **Where the user meets it:** Lowering a cap and expecting the agent to be held to it immediately.
- **What happens / what was expected:** The new numbers bind Privy at once. Froggy's own engine keeps judging against the mandate it already had until the session is next hydrated. Expected, and the stated reason the design exists: the same four numbers become both, "so the Privy rules and the mandate rules cannot drift apart".
- **Reproduce:** Lower the per-spend cap, then have the agent attempt a spend above the new cap and below the old one, without reloading.
- **Why (from the code):** `WorkspaceSession.applyAllowance` (`apps/server/src/session.ts:887`) is what rebuilds the mandate's cap, window, expiry and threshold from an allowance. Its only callers are `apps/server/src/session.test.ts:1308` and `:1324`. `PersonPolicies.adjust` writes the record and tells no live session.
- **Severity:** `high`. It is exactly the drift the one-shape design was built to prevent, and it fails on the side of the local engine, which is described as the synchronous backstop for a Privy outage.
- **Decision needed:** `fix`. Apply the allowance to the live session on commit.
- **Raised by:** [the policy editor](workspace/wallet/the-policy-editor.md#open-questions-and-verification), [the leash](foundations/the-leash.md#open-questions-and-verification)

### B-04: A stubbed build is not marked on the Wallet, breaking the loud-stub rule

- **Where the user meets it:** Looking at the Wallet on a build where a balance source is stubbed.
- **What happens / what was expected:** The Wallet shows a bare "Total unavailable". The server sends `balanceLabel`, carrying "balance unavailable (stub)", and its only reader in the whole web app is `apps/web/src/lib/webmcp.ts:76` — the machine-facing surface. Expected, per the repository's own rule and two separate comments: "the wallet pane shows a chip per stubbed integration".
- **Reproduce:** Run with a stubbed integration and open the Wallet. Compare what the page says with `balanceLabel` on the wire.
- **Why (from the code):** `balanceLabel` is declared at `packages/protocol/src/app.ts:182` and read only in `webmcp.ts`. No component under `apps/web/src/components/wallet/` reads it or renders any stub marker; the only visible marker anywhere is one aggregate badge in `apps/web/src/components/top-bar.tsx`. Both the root `AGENTS.md` and the header of `apps/server/src/environment.ts` still describe the per-integration chip on the wallet pane. The marker moved and the comments did not.
- **Severity:** `high`. `AGENTS.md` states the rule this breaks: "A faked run that could pass for a real one is the one failure mode this design exists to prevent." A screenshot of this Wallet cannot be told from a real one.
- **Decision needed:** `fix`. Render `balanceLabel`, and a per-integration marker, where the money is.
- **Raised by:** [the balance](workspace/wallet/the-balance.md#open-questions-and-verification), [stubs](cross-cutting/stubs.md#open-questions-and-verification)

### B-05: The warning that the balance is only a floor is computed and never shown

- **Where the user meets it:** When the spend ledger cannot be read, so the balance is a lower bound and payments will start being refused for reasons the page does not explain.
- **What happens / what was expected:** The server builds "Spend history unavailable: … The figure below is a floor, and payments will be refused." and sends it as `ledgerNote`. Nothing renders it. The person sees an ordinary balance, then unexplained refusals.
- **Reproduce:** Make the spend-history read fail, open the Wallet, attempt a spend.
- **Why (from the code):** `ledgerNote` is set at `apps/server/src/session.ts:981-1035` and asserted by `apps/server/src/session.test.ts:155-156`. Grepping `apps/web/src` returns only test fixtures — no component reads it.
- **Severity:** `high`. The product withholds the one sentence that would explain what follows, and a server test proves someone thought the sentence worth writing.
- **Decision needed:** `fix`. Render it beside the balance.
- **Raised by:** [the balance](workspace/wallet/the-balance.md#open-questions-and-verification)

### B-06: A minted token is displayed as holding fewer scopes than it actually has

- **Where the user meets it:** Opening a connection's detail page for an agent using a minted `fgy_` token.
- **What happens / what was expected:** The page lists its permissions as every scope **except** `history`. In fact a token carries no scope set, the check is skipped entirely for it, and it can call `froggy_history` along with everything else.
- **Reproduce:** Mint a token, open `/agents/{id}`, read the permissions line, then call `froggy_history` with that token.
- **Why (from the code):** `apps/server/src/agent-invocations.ts:325` synthesises `OAUTH_SCOPES.filter((scope) => scope !== "history")` for display. The caller is built with `scopes: null` at `apps/server/src/router.ts:429`, and `apps/server/src/mcp.ts` guards with `caller.scopes !== null && !caller.scopes.has(scope)`, so a null set skips rather than denies. `apps/server/src/tasks.ts:123` says so: "null for a person or a legacy `fgy_` token, which may do everything an agent may".
- **Severity:** `high`. It misstates a permission in the permissive direction on the page a person visits to audit what they gave away, and it is the one place in this surface where a missing restriction fails open.
- **Decision needed:** `fix`. Display the token's true reach, or give tokens a real scope set and check it.
- **Raised by:** [the agent detail](workspace/connections/the-agent-detail.md#open-questions-and-verification), [identity and agents](foundations/identity-and-agents.md#open-questions-and-verification), [oauth consent](agent-surface/oauth-consent.md#open-questions-and-verification)

### B-07: One agent can read another agent's service tasks

- **Where the user meets it:** Connecting two agents and expecting each to see only its own work.
- **What happens / what was expected:** Either can read the other's service tasks, and the person's own workspace-started tasks. Expected, by the pattern every neighbouring surface follows: scoped to the connection that made it.
- **Reproduce:** Run a service task from one connection, then read it by id from another.
- **Why (from the code):** `froggy_service_status`, `GET /api/services/tasks` and `GET /api/tasks/{id}` check only `caller.userId`. Purchases, trades, watches and history all additionally check `connectionId`.
- **Severity:** `high`. It is a cross-agent read of work and results, and the inconsistency with every neighbouring route suggests an oversight rather than a decision.
- **Decision needed:** `fix`. Scope these to the connection, as the neighbours are.
- **Raised by:** [reading results and receipts](agent-surface/reading-results-and-receipts.md#open-questions-and-verification), [asking for a paid task](agent-surface/asking-for-a-paid-task.md#open-questions-and-verification)

### B-08: "Send a test now" spends real money with no warning

- **Where the user meets it:** Pressing the test button under the daily digest settings.
- **What happens / what was expected:** A real scheduled run executes — real model turn, real receipts, real Telegram card, its own spending ceiling — with no confirmation, no cost shown beforehand, and no limit on how often it can be pressed. Expected of a control labelled "test": a preview, or at least a warning.
- **Reproduce:** Open the digest settings and press it. Then press it again.
- **Why (from the code):** The handler calls `runScheduledFor` with the real `digestJob`; nothing distinguishes it from the scheduled path.
- **Severity:** `high`. A button that spends money without saying so, in a product whose whole subject is not spending money without saying so.
- **Decision needed:** `product call`. Either show the cost and confirm, rate-limit it, or make it a genuine dry run.
- **Raised by:** [the daily digest](workspace/account/the-daily-digest.md#open-questions-and-verification)

## Medium

### B-09: The four approval answers are labelled differently on two kinds of ticket

The mandate ticket's labels come from `apps/server/src/session.ts:393-396`: **Allow once**, **Not this time**, **Stop the agent**. The ticket raised for a URL purchase uses **Deny** and **Deny & stop** for the same two refusals (`apps/web/src/components/purchases/purchase-approvals.tsx:38-39`). One product, two vocabularies for one decision, with nothing explaining which a person is looking at. `fix` — settle on one pair. Raised by [approvals](workspace/conversation/approvals.md#edge-cases), [approvals everywhere](cross-cutting/approvals-everywhere.md).

### B-10: The consent screen puts Allow nearest a stray click

The approval card deliberately puts the primary yes **last**, furthest from a stray click, and the code says so. The consent screen — also a one-click yes, to a standing grant rather than a single spend — puts **Allow** first. Both cannot be right. `product call` — decide the house rule and apply it to both. Raised by [oauth consent](agent-surface/oauth-consent.md#open-questions-and-verification).

### B-11: A client's own name is rendered verbatim on the consent screen

The name comes from the client's own registration, is capped at 80 characters, and is displayed with nothing marking it untrusted. A client may call itself "Froggy". `fix` — mark it as self-reported, or show the redirect origin beside it. Raised by [oauth consent](agent-surface/oauth-consent.md#open-questions-and-verification).

### B-12: Reloading the consent screen turns every switch back on

Switches the person turned off are discarded on reload, returning to all-on. A person who is being careful and reloads is silently made less careful. `fix`. Raised by [oauth consent](agent-surface/oauth-consent.md#open-questions-and-verification).

### B-13: The scope classifier fails open on an unknown tool name

`classifyCall` in `apps/server/src/mcp.ts` defaults to `services`, so a tool added without a matching case inherits the cheapest scope instead of being refused. This is the exact reverse of the rule `packages/domain/src/authority.ts` states for action kinds — "a kind with no row is refused rather than assumed to be standing. A missing leash must never fail open." Two sibling dispatchers, opposite defaults. `fix`. Raised by [being refused](agent-surface/being-refused.md#open-questions-and-verification).

### B-14: The wallet is readable by any connected agent with no scope

`GET /api/wallet` returns the balance, the window spent, the allowance and the policy id, and requires no scope at all — while reading history requires `history`. `product call` — decide whether balance is public to connections, and if so say so on the consent screen. Raised by [the leash everywhere](cross-cutting/the-leash-everywhere.md#open-questions-and-verification).

### B-15: A missed schedule is recorded as though it ran, and nobody is told

A schedule given up on after its fifteen-minute busy window has `lastRunAt` set and moves to its next occurrence, and the "skipped" report is deliberately not delivered. Miss the 07:30 digest by chatting at 07:31 and nothing says so, in either direction. `fix` — record and show the miss. Raised by [schedules](workspace/account/schedules.md#open-questions-and-verification).

### B-16: The digest's timezone line is the browser's, not the digest's

`digest-settings.tsx` prints `Intl.DateTimeFormat().resolvedOptions().timeZone` under the hour, while the digest fires in the zone it was saved with — which the server returns and the page never shows. Set 08:00 in Berlin, open it in New York, and the page reads "America/New_York" under a digest that still fires at 08:00 Berlin; nudging the hour there silently relocates it. `fix`. Raised by [the daily digest](workspace/account/the-daily-digest.md#open-questions-and-verification).

### B-17: Pairing Telegram silently takes the account from whoever had it

`store.telegram.pair` deletes any other person's pairing on the same Telegram account without telling them; their card keeps saying "Telegram connected." until it refetches. `fix`. Raised by [telegram](workspace/account/telegram.md#open-questions-and-verification).

### B-18: Signing out leaves Telegram paired and able to approve spending

A signed-out person remains reachable on their phone and can still answer approval cards there. `product call` — whether signing out should end the pairing, or whether the pairing is deliberately independent of the browser session. Raised by [telegram](workspace/account/telegram.md), [history and persistence](cross-cutting/history-and-persistence.md#open-questions-and-verification).

### B-19: A purchase cannot be stopped from the interface

`POST /api/purchases/{id}/cancel` exists and is used by **Deny & stop** and by account deletion. No button reaches it, so "Payment in progress" cannot be stopped from the page. Stopping the chat run that requested it does not reach it either, because the work detaches at ticket time. `fix`. Raised by [purchases](workspace/wallet/purchases.md#open-questions-and-verification), [buying a service](workspace/services/buying-a-service.md#open-questions-and-verification).

### B-20: Resubmitting the same request is a second bill

`service-request-form.tsx` regenerates the idempotency key on success, so submitting identical text again is a second purchase — while its own comment claims "the same words twice are the same task". `fix` — either hold the key or correct the comment. Raised by [buying a service](workspace/services/buying-a-service.md#open-questions-and-verification).

### B-21: Network down, server down and signed out are indistinguishable

All three produce the same `reconnecting…` badge and the same locked composer; `navigator.onLine` is never consulted anywhere in `apps/web/src`, and a signed-out tab retries forever on the same backoff path as a dropped socket (`hooks/use-app-socket.ts`). `fix` — tell the three apart, at least well enough to say "sign in again". Raised by [offline and reconnection](cross-cutting/offline-and-reconnection.md#open-questions-and-verification), [errors](cross-cutting/errors.md).

### B-22: An unmatched API path returns the app shell with status 200

Almost nothing below the API 404s: an unmatched path serves the SPA with a success code, so an agent probing endpoints gets HTML and `200`. `fix`. Raised by [discovery](agent-surface/discovery.md#open-questions-and-verification).

### B-23: Add funds no longer offers the address first, undoing a decision made the day before

`ffca8fe` (8 September), titled "Offer the wallet address first in Add funds, and the card second", rearranged the dialog to do exactly that. `d998ff2` (9 September) added funding from other chains and inserted the new section **above** the address, undoing it. The file's comment still describes the old arrangement — "one dialog, two ways in", "The address comes first because it always works" — while there are now three ways in and the address is second. The address is the only path that needs no Privy sign-in and no particular network. `fix`. Raised by [add funds](workspace/wallet/add-funds.md#open-questions-and-verification).

### B-24: Home drops `/status`, and its stop has no feedback

Home handles `stop` itself and lets every other slash command fall through to `openChat()`, which navigates without sending anything — so `/status` typed on Home is silently discarded, while the same command in the conversation sends "What is the state of the wallet and the mandate?". Separately, `StopFeedback` lives in `ComposerStack`, which Home does not use, so a stop from Home produces no "Stop requested" and no unconfirmed warning. `fix`. Raised by [home](workspace/home.md#open-questions-and-verification).

### B-25: A history outage renders as an empty conversation list

`useHistoryPage` exposes `isError` and Home ignores it, so a failed request draws the "Nothing yet" card. `e2e/history.spec.ts` asserts the opposite behaviour for the Recent dialog, so the intent is settled. `fix`. Raised by [home](workspace/home.md#open-questions-and-verification).

### B-26: The appearance crossfade ignores reduced motion, and a test pins it that way

`packages/ui/src/styles/globals.css:1225` covers the page transitions and dialogs under `prefers-reduced-motion: reduce` but not `active-view-transition-type(appearance)`, which stays at 250 ms — a full-surface fade. `e2e/motion.spec.ts` asserts that duration in **both** the `reduce` and `no-preference` runs, so fixing the CSS breaks a test that currently encodes the bug. `fix` — change both. Raised by [appearance](workspace/account/appearance.md#open-questions-and-verification), [appearance and motion](cross-cutting/appearance-and-motion.md#open-questions-and-verification).

### B-27: Conversation archive and delete exist as endpoints with no interface, and one state cannot be undone

`history-routes.ts` offers PATCH and DELETE for rename, archive and delete; nothing in the interface calls them. `acceptHistory` refuses an archived conversation with "Reopen this conversation before sending." — a state nothing in the product can produce or undo. `product call` — finish the feature or remove the endpoints. Raised by [history and persistence](cross-cutting/history-and-persistence.md#open-questions-and-verification), [the conversation](foundations/the-conversation.md#open-questions-and-verification).

### B-28: A discarded URL parameter is silent, including on links Froggy generates

`/services?service=…` and `/activity?record=…` drop a value that fails validation and render as though nothing was named. `/activity?record={id}` is a link Froggy itself hands the model as evidence, so a stale or malformed one degrades into an ordinary page with no indication. `fix`. Raised by [url state](cross-cutting/url-state.md#open-questions-and-verification).

## Low

### B-29: The stub count omits the five trading venues

`stubsOf()` reads `ServiceModes`, which does not carry the venue adapters (`enso`, `jupiter`, `pons`, `pump`, `uniswapExecution`) that `stubbedNames()` counts for the boot refusal. A build can badge zero stubs while a venue is simulated. `fix`. Raised by [stubs](cross-cutting/stubs.md#open-questions-and-verification).

### B-30: Accessibility gaps

- The list of stubbed integrations is a `title` attribute — unreachable by keyboard and by touch; a phone gets only the count.
- No skip link anywhere; on the desktop rail every page begins with five navigation links.
- Only the services page moves focus to its heading on a route change.
- Answering an approval leaves focus on a button that is about to be removed, and nothing catches it.
- The single live region is `aria-live="assertive"`, so a refusal interrupts whatever is being read.
- The composer's disabled reason lives only in its `placeholder`, which some screen readers do not announce for a disabled control.
- No accessibility audit spec exists in `e2e/`.

`fix`. Raised by [accessibility](cross-cutting/accessibility.md#open-questions-and-verification).

### B-31: Small copy, comment and rendering slips

- The navigation says **Connections** and **Account**; the pages title themselves "Agents" and "Settings", and the text every agent installs tells people to look at "the Agents page" — a word that is not in the navigation.
- The composer's own description says a slash opens "the four commands". There are two.
- `service-catalog.tsx` says "The five services as cards". There are ten.
- `allowance-form.tsx` argues its security case from sending on the app socket "and nowhere else"; both mounts POST over HTTP, and the rule is enforced server-side instead.
- `PersonPolicies.adjust` documents the mandate as written "first and synchronously"; `policy-routes.ts` writes it only after Privy accepts, and explains why. Both fail safe; the comments disagree.
- The turn's own description mentions rendering "what it thought", and a reasoning component exists, while the stream is created with reasoning not sent.
- `TaskStatus` includes `paused`; `STATUS_WORDS` omits it, so such a task renders "Unknown".
- A trading card that is unavailable for want of a configured price displays "$0.00", which reads as free rather than unpriced.
- The approval countdown renders as "300s" rather than a duration.
- Evidence can read "Because 0 of 3 Graph indexes answered at a current block".
- "Calls made before history was added are unavailable" shows permanently on every connection, including ones created afterwards.
- "Payments already submitted may still settle" is shown after stopping a stubbed run, where it is untrue.
- `hashscanNetwork` falls back to testnet for an unrecognised network, so an explorer link can point at the wrong network; `explorerUrl` returns null for both Solana networks although they are spendable.
- Only three notices are kept above the composer; a fourth evicts the oldest with no record.
- Home requests four recent conversations and renders three.
- "Untitled task" is unreachable: `Conversation.title` is never null.

`fix`. Raised across most of the set.
