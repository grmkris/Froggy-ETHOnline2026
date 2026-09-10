# Froggy product description

A written description of the user experience of Froggy: what the user sees, what they can do, and exactly what happens when they do it.

## Purpose

Froggy is, from the user's point of view, a large state chart. The user moves through it by asking for things — typing in the composer, clicking through Explore, approving or refusing what comes back — and so does the connected agent that reaches Froggy over MCP without a person watching. Most of that behavior is defined implicitly, spread across the run machinery on the server, the policy engine in `packages/domain`, the socket protocol, the Playwright specs, and the UI. There is no single place that says, in plain language, "when the user does X, this is what happens, and this is what happens if they do Y halfway through."

This project is that place. It describes the full experience on the deployed Froggy workspace, signed in, in the default configuration with nothing customized, and the second experience an external agent has when it connects to that same workspace over MCP.

The documents are for people who need to understand or change the product: designers, engineers, writers, testers, and anyone evaluating whether a behavior is intentional. They are written from the outside in. They describe the experience, not the implementation.

### What this is not

- Not API documentation. The wire contracts live in `packages/protocol`; the MCP tool surface is generated at `/llm.md` and `/skill.md` on the running app.
- Not organized by package. `packages/domain`, `packages/wallet`, `packages/browser` and the rest are not described separately. A single behavior is described once, wherever the user meets it.
- Not a technical design document. Durable architectural decisions live in `docs/decisions/`. Where a technical detail is critical to understanding the experience, it appears in a block quote labeled `Technical note:` and nowhere else.
- Not the project's status. What has shipped, what is verified live, and what is still owner-blocked lives in `docs/plan/STATUS.md`. This repo describes behavior in the tree at the pinned commit, which is not always the same thing.

## Conventions

- Describe the experience, not the code. "The refusal appears in the wallet pane before the model says a word about it" rather than "the policy decision resolves before the stream flushes".
- Technical detail goes in block quotes, prefixed with `Technical note:`. Use it only when the mechanism changes what the user would expect.
- Use sentence case for headings.
- Name the vocabulary consistently. The [glossary](glossary.md) is the source of truth for terms like _request_, _run_, _the leash_, _mandate_, _approval_, _receipt_, _freeze_, _stub_, and _takeover_.
- Every document ends with the commit of the Froggy source tree it was written against and a list of open questions.
- When a behavior is surprising, say so and say why it is that way if the reason is known. Do not smooth it over.

## The work to be done

Each document describes one feature. Features are large things (the composer and its streaming answer) or small things (the Copy for your agent button), but each is described in full, including its edge cases and its interactions with other features.

### Document template

Every feature document follows the same skeleton so that documents are comparable and nothing is skipped.

1. **Summary.** One paragraph describing the feature abstractly. For example: "Add funds mints a deposit address in the browser, lets the person pick a chain and a token, and tells them what will arrive and what will not."
2. **The simple case.** The common path in prose.
3. **The request, event by event.** The five phases of a request: **asking**, **answered at once**, **the work begins**, **while it runs**, **finishing**. What starts it and what is captured, what happens when it ends before anything is spent, what is decided at the moment money or a side effect is committed, what updates live, and what is left behind at the end. Include a small state diagram (Mermaid `stateDiagram-v2`) of the states the user passes through.
4. **Variants.** A table of the seven rows of the variant axis below, and what each does when set before asking and when changed while the request runs.
5. **Cancel and interrupt.** The same thirteen rows in the same order in every document.
6. **Interactions with other systems.** The twelve cross-cutting concerns below, in the same order in every document.
7. **Edge cases.** Anything a user could notice that is not covered above.
8. **Open questions and verification.** The commit the document was written against, and any behavior that could not be confirmed.

Item 5 matters most. Asking the same interrupt questions of every feature is how gaps and inconsistencies are found.

#### The unit of interaction

A **request**: the smallest thing that has a beginning, a possibly long and expensive middle, and an end. A person typing in the composer makes one; so does a connected agent calling a paid tool, a schedule firing, and a Telegram message arriving. The five phases are named the same in every document:

| Phase | What it is |
| --- | --- |
| **Asking** | The request is being composed or has just arrived. What the input accepts, what is captured, what is checked before anything happens. |
| **Answered at once** | It ends before anything is spent or committed: an empty composer, a refusal by the leash, a validation error, a question the model answers from what it already has. |
| **The work begins** | The run starts. The first spend is reserved and the first receipt row exists. This is the line after which stopping is no longer free. |
| **While it runs** | The answer streams, tools are called, pages are browsed, approvals wait. What the person can do meanwhile and what is disabled. |
| **Finishing** | The final answer, the receipts, what is persisted, where the person lands, and the failure path. |

#### The variant axis

The same seven rows in every document's Variants table, in this order:

1. **Who is asking** — the person in the app, a connected agent over MCP, Telegram, or a schedule.
2. **The policy in force** — the caps, allowlists and approval rules on the leash at the moment of asking.
3. **Funds available** — the balance, and whether a conversion is needed to pay.
4. **What is being asked for** — a free answer, a paid service, browsing, or a trade.
5. **The asking agent's grant** — which scopes the connected agent holds, and whether the grant is still live.
6. **The shared browser** — whether one is attached, and who currently owns the page.
7. **Appearance and motion** — the saved theme and reduced-motion preference. Rendering only; it never changes what happens.

#### The interrupt list

The same thirteen rows in the same order in every document. Every cell filled, even when the answer is "no effect".

Stop and freeze are separate rows because they are separate things: stop halts this run, freeze halts all spending and outlives the run.

1. Stop — the person halts this run.
2. Freeze — the wallet is frozen, mid-run.
3. Denying a waiting approval, or leaving it unanswered.
4. Asking something else while this request is still in flight.
5. Leaving the page, or switching to another conversation, mid-run.
6. Reload; the tab or the app closed.
7. Network lost; the socket drops.
8. The model, a service, or the facilitator errors or rate-limits mid-run.
9. The session expires, or the person signs out.
10. The policy or a cap changes mid-run — by the person, or by another agent.
11. Funds run out mid-run: the balance empties, or a cap is reached.
12. The person takes control of the shared browser mid-run.
13. The same account open in a second tab or on a second device.

#### The cross-cutting concerns

One bold-led paragraph each, in this order, in every document:

**The leash.** **Money and receipts.** **Approvals.** **Provenance.** **History and persistence.** **The shared browser.** **Connected agents and grants.** **Notifications.** **Navigation and URL state.** **Appearance, motion and accessibility.** **Offline and reconnection.** **Stubs.**

### Method

For each document:

1. Read the run machinery in `apps/server/src` (`runs.ts`, `chat.ts`, `tools.ts`, `paid-request.ts`, `sockets.ts`) and the domain objects the feature touches in `packages/domain/src`.
2. Read the matching specs in `e2e/`. Files like `approval.spec.ts`, `stop.spec.ts`, `stream.spec.ts` and `browse-budget.spec.ts` are close to executable specifications of the edge cases.
3. Draft the document.
4. Try anything ambiguous in the running product. Tests settle "what happens"; the running product settles how it feels, what is visible while a request is in flight, and what the timing is like.
5. Record the commit written against.

### Verification

Drafting reads the code; verification watches the product. The `verification/` directory holds one checklist per cluster of documents, each item a single observable claim with setup, steps, expected result, a priority, and what it needs. A tester runs them against the deployed app, records `pass`, `fail`, or `blocked` in the Result column, and files every failure in [bug-triage.md](bug-triage.md) with the item's ID. A document moves from `drafted` to `verified` in the coverage table only when every P1 and P2 item for it has passed or been filed.

Froggy has a verification rule of its own that overrides the usual one: **a stubbed run never counts.** A claim about money, provenance, or a live service is verified only against real credentials. See [the stub concern](cross-cutting/stubs.md) and `.agents/skills/froggy-verification`.

### Order of work

1. **Pilot: [add funds](wallet/add-funds.md).** Small, self-contained, with a real decision in it and a refusal path. Used to settle the template, tone, and depth.
2. **Foundations.** [The request](foundations/the-request.md) and [the leash](foundations/the-leash.md) first; everything else refers to them.
3. **The conversation.** The bulk of the experience and the hardest part: the composer, the streaming answer, tool calls, approvals arriving mid-stream, and freeze. Written third so the template is already proven.
4. **Everything else.** Drafted in parallel once the exemplars exist, followed by a consistency pass and a verification pass across the whole set.

Progress is tracked in the [coverage table](#coverage) below.

### Scope decisions

- **Two surfaces, one repo.** Froggy has two kinds of user: the person in the workspace and the connected agent that reaches it over MCP. The skill this repo was built with wants one surface per repo; that rule is deliberately bent here, because the two share one leash, one wallet and one history, and describing them apart would duplicate all three. They are two areas — `workspace/` and `agent-surface/` — over one set of foundations. Where a behavior differs between them, the document says so in the "Who is asking" row of its Variants table rather than in a second document.
- **The deployed app, signed in, defaults.** One account, no customization beyond what the app itself saves. The signed-out marketing surface and the OAuth consent screens seen by a _person_ are described; the provisioning of new accounts is not.
- **Money is described as the person meets it, not as the chain sees it.** Balances, costs, receipts and refusals are the subject. Transaction construction, signer wrapping and facilitator mechanics appear only as `Technical note:` block quotes.
- **Stubs are a cross-cutting concern, not a separate surface.** Every integration has a loud stub, and what a stub changes about what the user sees belongs in each document's "Stubs" paragraph, not in a parallel set of stubbed-mode documents.
- **Out of scope: the build and deploy pipeline, CI, the Railway service, and the design workspace under `design/`.** None of it is something a user meets. It is excluded, not forgotten.
- **Out of scope: the trading coordinator's strategy logic.** What the person sees — a trade proposed, approved, executed, receipted — is described in `workspace/trades.md`. Why a particular exit was chosen is a model and strategy question, not a user-experience one.
- **Interaction shape.** The unit of interaction is a request and its phases are asking, answered at once, the work begins, while it runs, finishing. The interrupt list and the order of cross-cutting concerns are fixed as written above.
- **Numbered rules.** These are prose documents, not numbered specifications. Stable heading anchors are enough for cross-references.

## Structure

```
README.md                        this file
goal.md                          the standing instructions for whoever drafts
AGENTS.md, CLAUDE.md             entry points for agents: read README.md, then goal.md
glossary.md                      shared vocabulary
bug-triage.md                    suspected defects collected from every document

verification/
  README.md                      how to run a hand-verification pass and record results
  foundations.md                 checklists for foundations/
  workspace.md                   checklists for workspace/
  agent-surface.md               checklists for agent-surface/
  cross-cutting.md               checklists for cross-cutting/

foundations/
  the-request.md                 the unit: asking, running, freezing; what the server owns and
                                   what the tab only watches
  the-leash.md                   the policy: caps, allowlists, what needs approval, what refuses
  money.md                       the balance, what a cost is, conversion, what "spent" means
  the-conversation.md            task, conversation, message, and what history keeps
  identity-and-agents.md         the person, the wallet, the connected agent, grants and scopes
  navigation.md                  the three destinations and two secondary ones, routes, URL state
  the-shared-browser.md          the hosted browser, who owns the page, and how ownership moves

workspace/
  home.md                        where work starts, resumes, and reports back
  conversation/
    the-composer.md              what the input accepts and what Enter does
    the-streaming-answer.md      what appears while the model works, and in what order
    tool-calls.md                how a tool call is shown, capped, and costed
    approvals.md                 the approval that stops a run, and what denying it does
    freeze.md                    the panic button: what stops, what is kept, what is still owed
    resuming.md                  reload and reconnection mid-run
  explore.md                     looking things up and acting without writing a sentence
  wallet/
    the-balance.md               the one dollar figure and what it includes
    add-funds.md                 PILOT. minting a deposit address, picking a chain and token
    receipts.md                  what a receipt records and how a stubbed one is marked
    the-policy-editor.md         changing your own leash from the live site
    purchases.md                 what was bought, from whom, for how much
  services/
    the-directory.md             what is for sale and who is selling it
    buying-a-service.md          quote, pay, deliver, receipt
    selling-a-service.md         the supplier side: rules, payees, delivery proof
  trades.md                      a trade proposed, approved, executed, receipted
  connections/
    connecting-an-agent.md       Copy for your agent, and what the agent does with it
    the-agent-list.md            which agents are connected and what they have spent
    the-agent-detail.md          scopes, dates, disconnect, and the invocation trail
  account/
    appearance.md                Passbook, Lilypad, System, and the query override
    telegram.md                  pairing, two-way messages, and cancelling
    schedules.md                 reminders, reports, and what a missed one does
    the-daily-digest.md          what it contains and Send a test now
  activity.md                    the record of what happened, and the record deep link

agent-surface/
  discovery.md                   what an agent finds before it has permission
  oauth-consent.md               the consent screen, the manual code path, and refusal
  froggy-login.md                the CLI login and logout
  asking-for-a-paid-task.md      the paid request an agent makes and what comes back
  reading-results-and-receipts.md what an agent can see after the fact
  being-refused.md               every way the leash says no, and what the agent is told

cross-cutting/
  the-leash-everywhere.md        how the policy shows up in every surface
  money-and-receipts.md          the shape of a cost, everywhere it appears
  approvals-everywhere.md        every place an approval can be raised and answered
  provenance.md                  Hedera transactions, the HCS topic, and what is provable
  history-and-persistence.md     what survives a reload, a sign-out, and a redeploy
  notifications.md               the waiting badge, Telegram, and the digest
  url-state.md                   what is in the URL and what is restored on return
  appearance-and-motion.md       themes, reduced motion, and what motion is load-bearing
  accessibility.md               keyboard traversal, focus, landmarks, and names
  offline-and-reconnection.md    what the app does when the socket drops
  stubs.md                       what a stub changes about what the user sees
  errors.md                      how failure is shown, everywhere
```

## Coverage

Status is one of `not started`, `drafted`, or `verified`.

| Document                                       | Status      |
| ---------------------------------------------- | ----------- |
| glossary.md                                    | not started |
| bug-triage.md                                  | not started |
| verification/README.md                         | not started |
| verification/foundations.md                    | not started |
| verification/workspace.md                      | not started |
| verification/agent-surface.md                  | not started |
| verification/cross-cutting.md                  | not started |
| foundations/the-request.md                     | not started |
| foundations/the-leash.md                       | not started |
| foundations/money.md                           | not started |
| foundations/the-conversation.md                | not started |
| foundations/identity-and-agents.md             | not started |
| foundations/navigation.md                      | not started |
| foundations/the-shared-browser.md              | not started |
| workspace/home.md                              | not started |
| workspace/conversation/the-composer.md         | not started |
| workspace/conversation/the-streaming-answer.md | not started |
| workspace/conversation/tool-calls.md           | not started |
| workspace/conversation/approvals.md            | not started |
| workspace/conversation/freeze.md               | not started |
| workspace/conversation/resuming.md             | not started |
| workspace/explore.md                           | not started |
| workspace/wallet/the-balance.md                | not started |
| workspace/wallet/add-funds.md                  | not started |
| workspace/wallet/receipts.md                   | not started |
| workspace/wallet/the-policy-editor.md          | not started |
| workspace/wallet/purchases.md                  | not started |
| workspace/services/the-directory.md            | not started |
| workspace/services/buying-a-service.md         | not started |
| workspace/services/selling-a-service.md        | not started |
| workspace/trades.md                            | not started |
| workspace/connections/connecting-an-agent.md   | not started |
| workspace/connections/the-agent-list.md        | not started |
| workspace/connections/the-agent-detail.md      | not started |
| workspace/account/appearance.md                | not started |
| workspace/account/telegram.md                  | not started |
| workspace/account/schedules.md                 | not started |
| workspace/account/the-daily-digest.md          | not started |
| workspace/activity.md                          | not started |
| agent-surface/discovery.md                     | not started |
| agent-surface/oauth-consent.md                 | not started |
| agent-surface/froggy-login.md                  | not started |
| agent-surface/asking-for-a-paid-task.md        | not started |
| agent-surface/reading-results-and-receipts.md  | not started |
| agent-surface/being-refused.md                 | not started |
| cross-cutting/the-leash-everywhere.md          | not started |
| cross-cutting/money-and-receipts.md            | not started |
| cross-cutting/approvals-everywhere.md          | not started |
| cross-cutting/provenance.md                    | not started |
| cross-cutting/history-and-persistence.md       | not started |
| cross-cutting/notifications.md                 | not started |
| cross-cutting/url-state.md                     | not started |
| cross-cutting/appearance-and-motion.md         | not started |
| cross-cutting/accessibility.md                 | not started |
| cross-cutting/offline-and-reconnection.md      | not started |
| cross-cutting/stubs.md                         | not started |
| cross-cutting/errors.md                        | not started |

## Reference

The source of truth is the Froggy tree this repo sits inside, pinned at commit `5caed50`. The relevant locations are:

- `apps/web/src/routes/`: the surface this project describes — one file per page.
- `apps/web/src/router.tsx`: the routes, their parameters, and the page-transition order.
- `apps/server/src/runs.ts`, `chat.ts`, `tools.ts`, `paid-request.ts`: where a request's life is decided.
- `apps/server/src/sockets.ts`, `packages/protocol/`: what the tab is told while a run is in flight.
- `packages/domain/src/`: the objects — `mandate.ts`, `approval.ts`, `authority.ts`, `receipt.ts`, `purchase.ts`, `task.ts`, `money.ts`, `schedule.ts`, `oauth.ts`, `agent-token.ts`.
- `apps/server/src/budget.ts`, `person-policies.ts`, `policy-routes.ts`: the leash as it is enforced and as it is edited.
- `apps/server/src/mcp.ts`, `oauth.ts`, `grants.ts`, `cli/froggy.ts`: the agent surface.
- `packages/browser/`, `apps/server/src/browse-quotes.ts`: the shared browser and what it costs.
- `apps/web/src/components/`: the panes, the pill, the wallet pane, the approval cards.
- `e2e/`: behavioral specs. `approval.spec.ts`, `stop.spec.ts`, `stream.spec.ts`, `browse-budget.spec.ts`, `oauth.spec.ts`, `purchases.spec.ts`, `schedules.spec.ts`, `telegram.spec.ts` read as executable specifications.
- `apps/server/src/environment.ts`: which integrations are live and which are stubbed, and the only place in the codebase that branches on an environment variable.
