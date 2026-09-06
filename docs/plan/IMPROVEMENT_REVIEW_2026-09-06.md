# Froggy improvement review and proposed plan

Prepared 6 September 2026. Review baseline: `d735e67`, including the wallet-first change `718c8ce` and treasury payer `2bcf6a4`. The shared working tree also contains an active Privy/Hedera custody migration; its draft is not treated as completed work. Recheck HEAD and ownership before implementation.

This is a review and proposed improvement sequence, not a replacement for the owner's accepted product decisions or authorization to deploy or spend funds.

## Direction and open preferences

Preserve the latest owner direction: wallet first, personal-agent delegation, mainnet as the target, ordinary users starting without free credit, and Privy custody for new Hedera keys. The current visual identity—light background, green accents, readable conversation and receipt tickets—is worth retaining.

Questions sent to the owner during this review:

1. Which journey comes first: an existing agent completing a paid task, direct use of Froggy, or delegated shopping?
2. Is this round review and plan only, clear fixes as well, or full implementation?
3. Keep the visual style, rethink navigation/layout, or explore a new visual direction?
4. Guide adding funds and allocating task credit through one explicit flow, or retain separate actions?

Until answered, this plan assumes review first, the current visual style, and a wallet-first journey leading to one paid task through either the web or an existing agent. A guided funding flow is a recommendation, not an accepted change to financial authority. The card purchase remains the second demonstration; swaps and catalog expansion follow a complete first journey.

## What the other agent improved

- Base network/RPC are now configuration, checked for a matching chain at boot. The earlier hard-coded Sepolia transfer finding has been addressed in code; deployment and funded verification remain separate.
- The wallet home exposes balances, receive addresses, task credit, funding actions and recent receipts.
- Account creation can happen at the first top-up, with separate starting-credit configuration for the team.
- A treasury payer exists for Graph calls from the chat tool. Integration into every Graph-backed paid route is still incomplete.
- Privy custody is an accepted decision and is being implemented. Preserve the active migration work and review the completed diff before changing those paths.

## Findings and evidence

| Priority | Finding | Evidence and consequence |
| --- | --- | --- |
| P0 | Task idempotency is checked before payment but claimed after settlement. | `apps/server/src/tasks.ts` still settles before `store.tasks.create`. The previous review reproduced two settlement calls for simultaneous submissions with one task key and two proofs. A database uniqueness error after settlement is too late to prevent the second charge. This handler is unchanged in the reviewed commits. |
| P0 | Seller recovery is less complete than the plan claims. | Seller settlement can throw before any sale/task record exists. Task execution is detached; persisted rows alone do not provide recovery of unfinished work after restart. Reserve intent first, preserve uncertain settlement, and explicitly recover or fail interrupted tasks without charging again. |
| P1 | The wallet-first screen is not reliably the first thing users see. | Fresh desktop and mobile loads on an isolated zero-credit server scrolled past the wallet heading. On mobile the wallet region was entirely above the viewport (`y=-519`, height `517`). The header and empty-state items share the conversation scroller; `defaultScrollPosition="start"` alone does not prevent the observed jump. |
| P1 | Connect an agent opens the wrong destination. | Clicking the wallet CTA selected **Policy**, verified in the browser. The handler only opens `DetailsDrawer`, whose tabs default to `policy`. |
| P1 | Agent setup failures are silent. | A deliberately failed `POST /api/agents` left the form showing “No agent connected yet,” with no error or retry guidance. Query, mint and revoke errors are not rendered. Clipboard failures are also unhandled. |
| P1 | A partial balance is presented as a complete total. | `totalDollars` treats an unknown USDC balance as zero if credit is known. The review showed a `$0.00` total while the USDC row showed `—`. Credit is ledger accounting, not a fresh mark-to-market of the HBAR row, despite the copy equating them. |
| P1 | Funding does not have a complete visible lifecycle. | The UI promises chain reads “every few seconds,” but wallet publication follows connection/receipts; the 15-second cache is not a polling mechanism. Onramp completion is not itself an observed deposit. The top-up button sends a chat instruction and is not gated by connection, running work or sufficient funds. |
| P1 | Receipt summaries disagree about whether money moved. | `wallet-home.tsx` labels an allowed receipt without a failure as `paid`, even when it contains no settlement. The full receipt ticket distinguishes allowed-but-unsettled. The signing endpoint intentionally emits such receipts. |
| P1 | Sign-in copy contradicts the target environment. | `sign-in-gate.tsx` unconditionally says “Testnets only. Nothing here holds real funds.” Its failure state directs users to the browser console instead of offering recovery. |
| P1 | Stop can look successful when the server has not stopped. | The client stops its local stream regardless of the server response and does not check `response.ok`; network failure only reaches the console. Keep server-owned runs, but show stopping, confirmation and visible failure states. |
| P1 | The new Graph payer is not shared by all entry points. | `graphFor` in `tools.ts` selects the treasury, but `runBrief` and the oracle still use `services.graph`. The tool also retains a fallback to the person's wallet. Caller identity should not silently change which wallet funds Froggy's supplier. |
| P2 | The empty screen still reads like a test script. | It includes hosts, payees, multiple network names, another credit display, and a “Send 5 USDC to 0xdead…” starter. That crowds out a useful first task, especially on a phone. |
| P2 | Repeated presentation and stale instructions increase maintenance. | Funding UI/copy is implemented in both the wallet and drawer; receipt verdicts are independently derived; current instructions still describe removed Freeze behavior. The plan/status documents mix historical milestones with current requirements. |

The browser findings were exercised at 1440×1000 and 390×844 using entirely stubbed integrations and an ordinary zero-credit identity. No page errors or document-level horizontal overflow occurred. This does not verify a real Privy login, onramp, signature, or payment. Screenshots and the reproduction log are in `/tmp/froggy-ux-{desktop,mobile,agents}.jpg` and `/tmp/froggy-ux-review-results.log` for this session.

## Proposed user journey

1. **Sign in.** Explain one useful outcome and the available sign-in methods. Show loading, failure and retry without sending the person to developer tools.
2. **See the wallet and next step.** Separate wallet funds from the amount available for tasks. Keep receive addresses copyable. Put technical account detail behind disclosure; keep the current spending limit easy to find.
3. **Fund and allocate.** Recommend one guided flow with an explicit amount allocated to task credit. Show where the money goes, any quoted costs, and the resulting amounts. Preserve a meaningful distinction between provider checkout submitted, deposit observed, credit funding pending, and ready to spend.
4. **Choose how to use it.** “Ask Froggy” and “Connect your agent” lead directly to their respective actions. The latter shows skill instructions, a copy action, setup state, connection verification, and revocation. Creating a token is “ready to connect”; the agent's first authenticated use establishes that it connected.
5. **Complete a useful task.** Show the price and applicable approval before execution. Keep the task and any approval discoverable across reconnects. Show the result together with service cost, purchase costs where applicable, and receipt links.
6. **Return.** Show active work first, then recent results and a compact wallet summary. Preserve the person's scroll position while reading; incoming balance data must not move the page.

## Implementation sequence

### 1. Stabilize the payment lifecycle

Scope: `tasks.ts`, seller settlement, task/sale storage and CLI retry behavior, coordinating with the active agent before editing.

- Claim a task key durably before any external settlement; bind it to the request contents and purchased entitlement.
- Reuse the claim and payment attempt across retries, including wallet-header signing. A time-generated signing key must not turn a retry into another reservation.
- Persist the boundary between not sent, sent but uncertain, confirmed, and delivered/failed. Reconcile before issuing another payment.
- Define restart handling for paid/running tasks and make every paid failure retrievable. Preserve the owner's no-refund policy for delivered attempts; it does not justify losing the purchase record.
- Bind receipts and approvals to the task, including brief tasks, so the UI and CLI can find the same result and payment.
- Review the custody migration once complete: network/account association, opening races, partial account creation, existing funded accounts, and the point at which sealed-key support can actually be retired. Do not remove the ability to recover existing funds merely to simplify code.

Acceptance: concurrent identical submissions settle once; conflicting reuse of a task key is rejected; timeout after submission produces a retrievable uncertain attempt; restart produces a recoverable or clearly failed task; no duplicate charge; no cross-user result access. Use a real temporary Postgres database for the storage/concurrency case rather than relying solely on the memory store.

### 2. Repair navigation and first-load behavior

Scope: workspace route, stream, wallet home, sign-in, details drawer and agent settings.

- Separate first-use layout behavior from conversation auto-follow. A fresh visit starts at the wallet; an existing conversation can restore its position.
- Make the drawer destination explicit so the agent CTA opens Agents directly and remains correct on repeated openings.
- Replace the long demo checklist with one useful starter and a context-sensitive next step. Keep the hostile-payee demonstration available for a deliberate demo, outside ordinary onboarding.
- Render agent loading, create/revoke error, retry and clipboard outcomes. Keep the one-time secret visible until the person is done with setup; do not equate clicking “I pasted it” with a verified connection.
- Replace unconditional network claims with configured facts. Add a useful retry path for sign-in failure.

Acceptance: wallet heading and primary action are in the initial viewport on desktop and mobile; late balance updates do not scroll the page; Connect opens Agents; a failed connection displays its error and can be retried; keyboard focus is usable and returns to the initiating control.

### 3. Make wallet amounts and funding trustworthy

Scope: balance contract/readers, wallet summary, funding presentation and top-up command path.

- Represent balance value, freshness and error separately. Load each chain independently so one failure does not discard the other balance or masquerade as a ledger error.
- Display a partial total as partial, or omit it until complete. Never silently substitute zero for unknown funds.
- Present wallet funds and available task credit clearly. Explain any difference between the dollar ledger and the onchain HBAR value; do not count the same funds twice.
- Use one funding UI and one copy of its wording, reachable from both home and settings.
- Add bounded refresh while funding is pending, on return/focus, and after known financial events. Invalidate cached values at those boundaries; publish a timestamp rather than claiming continuous freshness.
- Make top-up a deterministic, explicitly reviewed financial action through the existing spending controls. The chat tool and the button should share the same operation. Disable duplicate submissions and offer recovery when USDC arrived but the HBAR allocation did not complete.

Acceptance: zero funds, unknown balance, stale RPC, onramp cancellation, deposit pending, funded wallet, pending credit allocation and completed top-up each have a clear next action. One top-up creates one debit/allocation and appears without reloading. Test the actual signed-in flow separately with the owner.

### 4. Use consistent results, receipts and supplier billing

Scope: domain/protocol fields as needed, wallet summary rows, full receipt cards, task result view, Graph acquisition and treasury path.

- Derive payment presentation once from structured facts. Distinguish approval, authorization, settlement, uncertainty and delivery. Keep stub markers visible in summaries as well as detail.
- Show an acknowledged stop only after the server confirms it; retain the task link and show a visible error if cancellation fails.
- Select the Graph acquisition path in one shared place used by chat, the oracle and delegated briefs. Make platform payment versus user payment explicit, without silently charging the user's wallet as a fallback.
- Record supplier attempts with task attribution, deduplication and a platform spending bound. Reuse existing ledger/receipt concepts where they fit rather than building another payment framework.
- Measure upstream cost against the fixed task price before expanding the paid Graph path. Cached/API-key acquisition and x402 acquisition need an explicit cost policy.

Acceptance: an authorized but unsettled receipt never says paid; uncertain payment is never described as definitely failed; chat and CLI expose the same task result; supplier retries are controlled; stop failure is visible; the wrong payer is never selected by fallback.

### 5. Simplify tests and code where evidence supports it

Do not set a test-count or line-count reduction target. The current important gaps are missing behavior checks, not simply too many tests.

| Keep | Consolidate or remove | Replace/add where needed |
| --- | --- | --- |
| Policy order, provenance, authorization, spend reservation, refunds/reconciliation, tenant isolation, token revocation, amount/rate handling and wire decoding. | Duplicated funding controls/copy; separate receipt-verdict logic; repeated setup fixtures only where duplication is substantial. | Atomic task retry and restart tests; partial top-up recovery; task/supplier attribution. |
| Browser arbitration, frame flow, reconnect, input coordinates, approval focus, accessible announcements and reduced-motion behavior. | Repeated e2e assertions that merely copy the same prose in several screens. In `suggestions.test.ts`, the assertion forbidding the phrase “Buy the lending snapshot” tests editorial wording rather than behavior. | Onboarding CTA destination, initial viewport, connection error/retry, confirmed stop and funding state transitions. |
| Graph freshness and partial-deployment behavior; account/network selection; successful and refused payer paths. | Historical Freeze fixtures should use current denial cases when Freeze itself is not what is under test. Remove obsolete behavior tests only after its implementation is retired. | One meaningful external-agent lifecycle test and a small set of rendering cases for payment status. |

The current onboarding e2e should retain core wallet semantics but stop treating the presence of labels as proof of successful onboarding. Make test ports configurable so local developer servers cannot silently change the system under test. Pin every external integration to stubs in the browser suite; real provider checks are separate evidence.

Prefer a few shared operations and models with clear ownership. Avoid a generic workflow engine, a new package for every concept, broad dependency upgrades, or replacing the component library during this pass.

### 6. Reconcile documentation and prove the complete journey

- Make one current plan/status entry point; label historical notes rather than letting later readers infer chronology.
- Update instructions and product copy for Stop, Disconnect, mainnet configuration, custody, and actual financial authority.
- Preserve raw meeting documents; resolve their formatting-gate conflict explicitly and narrowly instead of rewriting original records casually or weakening all formatting checks.
- Record implemented, locally verified, deployed, and live-provider-verified separately.
- Run the agreed journey with Kristjan's real agent, then have Jonas and Hemang repeat it without coaching. Record where they hesitate and whether they can explain balances, cost, approval and result retrieval.

Acceptance: the local gates pass on a stable checkout, desktop/mobile interactions pass, and live evidence connects login, funds, agent connection, a paid task, result and receipt. Any real-fund or deployment action follows the authorization applicable to that implementation session.

## Review verification and limits

- Isolated local app booted; desktop/mobile first-use views, agent CTA and forced agent-creation failure were exercised. No browser page errors or document-level horizontal overflow were observed.
- `bun run check:fast` and `bun run check` both stop at formatting in `docs/sync/full-notes.md`, `notes.md` and `transcript.md`. Those pre-existing source documents were not changed.
- The previous review's 25 browser passes apply to the previous checkout, not automatically to the new wallet home and active custody migration. This pass used targeted browser observations; it does not claim a fresh full-suite pass.
- No implementation or test deletion is included in this review. The only repository file added by this pass is this plan; the other agent's ongoing edits are preserved.

Suggested first implementation batch: task-payment correctness plus the independently scoped first-screen/navigation fixes. Follow with funding-state work, then consolidate shared payment presentation and supplier acquisition. Broader visual changes and provider expansion follow the owner's answers and a successful first journey.
