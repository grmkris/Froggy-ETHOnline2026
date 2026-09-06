# Fable 5.1: iteration 2 team grilling prompt

Updated 6 September 2026 after the team sync and Kristjan's clarification: Browser Use + Link is inspiration; Froggy uses crypto and can demonstrate card checkout with his existing MetaMask Card. Run in **planner mode** with repository access and grilling enabled. Paste everything below the divider. For chat-only use, attach the listed documents.

---

Help the Froggy team agree on an executable second iteration. Run an interactive grilling session, then write the plan. Be candid, invite disagreement, and challenge assumptions against the actual code and evidence. Remain in planner mode; do not implement or deploy.

## Apply the grilling skill

Read and follow Matt Pocock's skill:
https://raw.githubusercontent.com/mattpocock/skills/refs/heads/main/skills/productivity/grilling/SKILL.md

Build a tree of decisions and prerequisites. Each round asks all currently independent, answerable questions, numbered and accompanied by a recommended answer and reasoning. Wait for our answers. Recompute the next round from what we decide; defer questions dependent on another unresolved answer. Do not impose an arbitrary question-count limit.

Look up facts yourself. Dispatch independent factual investigations to subagents when available; continue unaffected questions while they run. Ask us for decisions, not facts obtainable from the repository or provider docs. Record choices, assumptions, disagreements and open evidence checks. Explicitly excluding a feature closes its branch.

Finish when the iteration has no unexamined branches. Present the resulting shared understanding for our confirmation before writing an accepted plan. If the skill cannot be fetched, disclose that and use the method above.

## Read before the first round

Repository: `/home/kristjan/code/ethglobal-online-2026`.

1. `AGENTS.md` and relevant repository skills/instructions.
2. **`docs/sync/iteration-2-context.md`** — newest direction, code gaps, provider checks, open questions and card scenario.
3. `docs/sync/transcript.md`, `docs/sync/full-notes.md`, `docs/sync/notes.md`. Preserve raw sources; prefer later transcript agreements over Gemini summary claims.
4. `README.md`, latest `docs/plan/STATUS.md`, recent commits and git status. Spot-check code paths named in the context brief. Chat Phase 2 was recorded as landed at `b7a8e60`; check for subsequent work and coordinate ownership.
5. `docs/plan/PLAN.md`, `docs/plan/DECISIONS.md`, `docs/evidence/`, and architectural decisions relevant to the chosen scope.
6. `docs/research/agentic-wallets-2026-09-06/{synthesis,grok-findings,web-findings}.md` and `docs/team-brief.md` as historical research. Their consumer-first recommendation was superseded by the sync; do not restore it silently.

Identify inaccessible documents. Research is qualitative, and vendor claims are not customer validation. Distinguish built, locally tested, provider-tested, live testnet, mainnet and merely proposed behavior.

## When conducting the session in Telegram

Read `docs/sync/telegram-relay-handoff.md` for the configured transport and commands. Use the dedicated relay inbox, not Hermes `state.db`; no bot mention is needed. Poll every 20 seconds while running. Collect multiple teammates’ answers to each question, preserving identities, edits and disagreement. Use numeric summaries only for comparable quantities; confirm the resulting team decision rather than assuming the first reply or an average is consensus.

## Carry forward these premises

- Froggy provides browsing and controlled spending to existing personal agents such as Hermes. The external agent delegates intent; Froggy executes on its server, and a human can use the same workspace and browser.
- **Hedera x402 service payments are the main iteration priority.** A useful paid task with a working caller matters more than an isolated payment demonstration.
- Onboarding direction: social login, generated Privy wallet, Apple Pay where supported, copyable receive address. Resolve provider/delivery details without restarting that basic debate.
- The owner wants unified funding and routing across supported chains, including a mainnet path. Ownership, starting chain, assets, routes and truthful balance availability need decisions.
- Callers can pay Froggy on Hedera while Froggy accesses Graph using its own API key or a separate Base x402 payment. These are distinct financial legs. Graph also documents Base Sepolia; do not assume mainnet is the only testing option.
- Pasting an address should produce useful interpretation. Addresses can be ambiguous across chains; inferred intent is not authority to buy, bridge, approve tokens or add payable services.
- Browser Use + Link is a reference for the experience: an agent completes a purchase using a payment method the person has connected. **Link/Link CLI integration is out of scope.** Froggy should deliver a similar experience using crypto and its own payment controls; Link eligibility or compatibility is not a project prerequisite.
- Kristjan already has an active MetaMask Card on **Linea** and offers his own flow as a concrete demonstration. Treat the card as available; plan how Froggy checks its linked account, uses existing spendable funds or routes funds when needed, and completes authorized checkout. Do not turn this into a card-acquisition or Link-integration investigation. Card setup is separate from initial social login. This is an example of the broader capability, not a requirement to make the entire product card-specific; decide its place in iteration 2.
- Exactly three sponsor selections, Start from Scratch, meaningful integrations and substantial achievable prizes. Hedera and Privy anchor the direction; validate the third against the chosen task. Check eligibility and awards; do not invent win probabilities.
- Mona, fitness bets and an AI referee are separate projects. This session requests planning, not financial transactions, credential connections, implementation or deployment.

Reopen settled choices only if new evidence exposes a concrete contradiction. Ask about that contradiction directly. Recommendations in the context brief are not team decisions; incorporate newer answers we supply.

## Investigate and grill the unresolved design

Arrange these subjects by dependency. This is a coverage map, not a questionnaire to dump in round one.

**1. First task and scope.** Who uses it first, what do they ask Hermes/Froggy, and what useful result arrives within three minutes? Choose one primary journey. Establish actual deadline, capacity and demo/user geography. Compare with Browser Use's existing service billing and Link checkout: what observable reason would make someone choose Froggy?

**2. Money ownership and roles.** Does the balance represent user-owned funds, service credit, or both? Who owns/signs Hedera payments: an external caller, delegated user wallet, or Froggy treasury? What does payment buy? Separately account for funding, service billing, upstream costs and merchant purchases. Avoid circular self-payments presented as customer revenue.

**3. Funding and networks.** Once ownership/demo scope are settled, identify initial chain/token/account, route to Hedera, and any route to the card's Linea account. Verify provider eligibility, signer support, route liquidity/quotes, fees and arrival detection. Specify pending, available, reserved, spent and recoverable funds. The existing treasury top-up is not a bridge. Define mainnet readiness tasks and an honest fallback.

**4. Hedera billing and paid tasks.** Choose a concrete billing model: fixed task price, prepaid credit, bounded usage or another defined approach. Metering needs a measured quantity and collection point. Define quote/maximum, 402 challenge, authorization, settlement, entitlement/task creation, retrieval, receipts and reconciliation. Resolve duplicate submissions, mismatched/replayed proofs, uncertain settlement, upstream failure after payment, cancellation and unused credit/refunds. Browser tasks need durable identity/status; disconnection must not restart a paid task.

**5. External-agent integration.** Verify the installed Hermes integration surface before selecting skill, CLI, HTTP API or remote MCP. Define discovery, human linking, scoped credentials, budgets, submission, status/events, results, approval handoff and revocation. Bind requests to the correct user/workspace. Browser WebMCP in the repo is not automatically remote MCP. Reuse the web UI's policy/run machinery; external agents cannot approve themselves or raise limits.

**6. Useful services and Graph.** Select a useful paid answer/action rather than “buy a snapshot.” Existing server API-key access is a candidate for the first Graph-backed endpoint; upstream Base x402 is optional unless it solves an agreed problem. Identify live query, meaningful transformation, freshness, caller value, cost and failure behavior. Reuse the directory/payment foundation. Paid image generation is another candidate, not a simultaneous commitment.

**7. Demonstrate a card-only purchase through Kristjan's existing setup.** Use https://browser-use.com/posts/pay-with-link as UX inspiration only. Do not research or plan Link CLI integration. Work through a concrete purchase with Kristjan's active MetaMask Card on Linea: identify the linked funding account and asset, check spendable funds and allowance, use them directly when sufficient, otherwise route the required funds and confirm arrival, then complete authorized checkout and return the order receipt. Inspect current MetaMask documentation and the available integration surface to determine implementation details. Ask Kristjan only for setup facts or preferences unavailable from tools; never ask him to paste card secrets into the discussion. Specify what Froggy automates and where a human approval or checkout handoff occurs. Account connection does not imply signing authority; do not silently raise allowances. Include sensitive checkout handling, refunds and duplicate-purchase prevention. Reuse this example to define the broader payment capability rather than building a MetaMask-only product.

**8. Address interpretation and controls.** Distinguish token, wallet, contract and service URL using verified context. Show identity/chain confidence; ask when ambiguity changes action. Keep proposals separate from execution. Explain how hostile content cannot change payees, budgets or authority; “no prompt injection” is not a credible guarantee. Define stop/pause separately from fund availability; current freeze behavior must not silently erase the meaning of a new wallet balance.

**9. Sponsors and delivery.** Map exactly three sponsors to steps in one demonstration. Verify official tracks, individual awards, build-history eligibility and required proof. Graph API-key access can qualify; generic CCIP does not establish qualification for a CRE Confidential Workflows bounty. Prioritize a complete demonstration over unrelated bonuses. Assign owners from actual capacity and time-bound every risky provider feasibility check with a fallback.

## Plan required after we confirm

Write `docs/plan/NEXT_ITERATION.md` with:

- Product sentence, audience, task, first-three-minute journey, deadline and explicit cuts.
- Exact demo sequence, networks/assets, three sponsors and qualification evidence.
- Ownership/flow diagram; balances, billing unit, budgets, approvals, reconciliation and recovery.
- External-agent contract and agreed onboarding, Graph, address and card scope.
- Ordered milestones/tasks with named owners, dependencies, existing files/packages, observable acceptance criteria and estimated effort/uncertainty.
- Feasibility gates, fallback decisions and missing provider access. Unsupported integrations are blockers, not ordinary implementation tasks assumed to work.
- Verification per task: repository gates, browser checks for visible changes, actual provider/settlement evidence, external-agent demonstration and failure paths. Specify who records proof and where.
- User test: observe connecting, delegating, understanding price, handling an approval/failure, and finding the result and remaining funds.
- Accepted decisions, unresolved blockers and documentation to reconcile before implementation.

Do not call a blocked plan agreed or implementation-ready. Preserve other agents' changes. Without filesystem access, return Markdown. Do not start coding after writing it.

Begin with a short situation readback, initial decision tree, and questions whose prerequisites are settled now.
