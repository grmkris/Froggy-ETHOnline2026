# Goal: complete the Froggy product description

You are working in `docs/product-description/` inside the Froggy repository. Read `README.md`, `glossary.md`, `foundations/the-request.md`, `foundations/the-leash.md`, and `workspace/wallet/add-funds.md` first. The README defines the purpose, the document template, the method, the structure, and the coverage table. The other four are the exemplars: match their depth, tone, and structure exactly. Your job is to write every document in the README's structure until the coverage table has no `not started` rows, then run a consistency pass.

## Source of truth

The Froggy source tree is the repository this directory sits inside, pinned at commit `5caed50`. Describe the experience of the deployed workspace, signed in, in the default configuration with nothing customized, and the experience a connected agent has reaching the same workspace over MCP. The build and deploy pipeline, CI, the Railway service, the `design/` workspace, and the trading engine's strategy logic are out of scope; see the README's scope decisions.

The tree moves. Other agents commit to it while you work. Write against the pinned commit, cite it in your footer, and do not chase changes that land mid-draft; a later session reconciles them through the resume path in the skill.

For each document, read in this order before writing:

1. The page or entry point the feature lives on: `apps/web/src/routes/` for the workspace, `apps/server/src/mcp.ts` and `cli/froggy.ts` for the agent surface.
2. Where the request's life is decided: `apps/server/src/runs.ts`, `chat.ts`, `tools.ts`, `paid-request.ts`, and `sockets.ts` for what the tab is told while it runs.
3. The domain objects it touches in `packages/domain/src`. These files carry unusually complete comments explaining _why_ each rule exists; they are the best available source for the reason behind a surprising behavior, and quoting that reason is encouraged.
4. The specs in `e2e/`. `approval.spec.ts`, `stop.spec.ts`, `stream.spec.ts`, `browse-budget.spec.ts`, `oauth.spec.ts`, `purchases.spec.ts`, `schedules.spec.ts` and `telegram.spec.ts` read as executable specifications of the edge cases.
5. Defaults and thresholds: `apps/server/src/budget.ts`, `person-policies.ts`, and `environment.ts` — the last is the only place in the codebase that branches on an environment variable, and it decides what is stubbed.

Do not describe code. Describe what the user sees and does. Technical detail goes only in `> Technical note:` block quotes, and only when the mechanism changes what the user would expect.

## Writing rules

- Follow the eight-section template in the README for every feature document. Foundations and cross-cutting documents may drop sections that do not apply, but must still cover cancel and interrupt behavior wherever an interaction exists.
- The Variants table has the same seven rows, and the cancel-and-interrupt table the same thirteen rows, in the same order, in every document. Do not add, drop, or reorder them in a single document. Every cell filled, "No effect." where that is the answer.
- The twelve cross-cutting concerns appear in the same order in every document, one bold-led paragraph each, including when the answer is "no interaction" — one line that tells the reader the question was asked.
- Use the glossary's words. If you need a term the glossary lacks, add it to `glossary.md` in the right section with a full paragraph before using it. Do not coin a synonym for a term that exists.
- Prefer Froggy's own interface wording where it has one: **Allow once**, **Deny & stop**, **Control**, **Follow**, **Connections**, **Account**, "The wallet is frozen".
- Sentence case for all headings. Direct, concrete language. No hedging, no marketing.
- State surprising behavior plainly and say why if the reason is in the code or a comment. If it looks like a bug, say so in "Open questions" rather than smoothing it over.
- Cross-reference other documents with relative links rather than repeating them. `foundations/the-request.md` owns the phases, what stop does, and what a detach does. `foundations/the-leash.md` owns the rules, the three decisions and the denial codes. `foundations/money.md` owns units, quotes and receipts. Link; do not restate.
- Every document ends with "## Open questions and verification" listing what was read from code but not confirmed by hand, followed by ``Verified against the Froggy tree at commit `5caed50` `` — with a note if you had to read a file that has since changed.
- One Mermaid `stateDiagram-v2` per interaction, limited to the states the user passes through.

## Things already established (do not re-derive, do not contradict)

- **A run belongs to the server, not to the socket that started it.** An explicit stop cancels a run; a closed socket does not. Closing a tab is a _detach_, and the run keeps draining.
- The replay buffer is bounded at 8 MB. Past that the run keeps going but stops being replayable.
- Money is compared in **micro-dollars**: one dollar is 1,000,000. Every cap, running total and threshold is in this unit. Amounts that chains move are integer counts of an asset's smallest unit, carried as decimal strings.
- Prices are **quoted, not metered**. The quote is the price and lands on the receipt with the rate used.
- The leash returns exactly three decisions: **allow**, **deny**, **ask**. Ask parks the turn; it is not a deny the model can retry around.
- An allow carries the ids of the rules it satisfied, so an allow is as auditable as a deny. A deny carries a _denial code_, and the code — not the sentence shown to the person — is the record.
- The eight rule kinds are per-transaction cap, window cap, payee allowlist, host allowlist, network allowlist, expiry, approval threshold, and ask exemption. The window cap is rolling, not calendar.
- The host allowlist matches on **host, never on full URL**.
- The four approval answers are **Allow once**, allow for this session, **Deny**, **Deny & stop**; the three ways one ends without an answer are `timeout`, `aborted`, `unavailable`. The primary yes sits last in the row.
- Answering "allow for this session" writes an **ask exemption** rule scoped to one payee, one ceiling and one expiry. The threshold rule stays.
- Action kinds sit on one of two sides before any amount is considered. An `ask` kind gets **no allow rule at all** in the person's Privy policy, so default refusal catches it; `transfer` is never the agent's decision, whatever the amount.
- `conversion` never happens on its own — only nested inside a payment already allowed.
- **Stop and freeze are different.** Stop halts one run. Freeze halts spending and outlives the run; a spend attempted while frozen is denied with the code `frozen` and the interface says "The wallet is frozen".
- **Every stub is loud.** A stubbed receipt carries `stubbed: true` in the data, not only in the interface. `apps/server/src/environment.ts` is the only place in the codebase that branches on an environment variable.
- A task's id outlives every socket. The same idempotency key returns the same task rather than a second bill. `uncertain` is its own status: the payment was sent and never confirmed either way.
- Navigation has three destinations — Home, Explore, Wallet — with Connections and Account reachable and visibly not destinations. The shared browser is deliberately not a destination. **This differs from `docs/plan/STATUS.md`, which describes an earlier five-page pill.** Describe the tree, not the status file.
- Every browser is a hosted browser driven over CDP. There is no local Chrome. A person's own input takes the page without stopping the work, and **closing the browser view never stops the work**.

Added as the foundations were written:

- The default allowance is **$2 a spend, $10 a rolling day, ask above $1, expiring in 30 days** — thirty being Privy's own ceiling, not a product choice.
- Action kinds carry their own ceilings on top of the person's: `earn_deposit` $25, `earn_withdraw` $10. **The tighter of the two always wins.** A kind with no row in the table is refused, never assumed standing: a missing leash must never fail open.
- Checks run in a fixed order and the **first refusal wins**: provenance, bound purchase, expiry, allowlists, per-transaction cap, rolling window cap, then the human line.
- **Provenance has five values and three are payable**: `mandate`, `server`, `user` yes; `model` and `page` never, at any amount. Deciding a string counts as `user` is the server's job, never the model's.
- Converting an amount to micro-dollars **rounds up**, because a cap is a promise not to exceed a number.
- A spend is written to the ledger **before** it is attempted. Its states are `reserved`, `settled`, `refused`, `failed`, `abandoned`, `uncertain`. `abandoned` (nothing was ever sent) does **not** consume allowance; `failed` and `uncertain` do.
- A turn's status is one of `accepted`, `running`, `waiting`, `completed`, `failed`, `stopped`, `interrupted`, `uncertain`. `stopped` means a person ended it; `interrupted` means something else did.
- History has exactly four sources: `web`, `telegram`, `agent`, `schedule`.
- The step cap within one turn is **twelve**. The model budget is separate, per person per UTC day, counts turns and steps, lives in memory, and exempts one demo account.
- The five OAuth scopes are `brief`, `browse`, `pay`, `services`, `history`, in that order on the consent page. **No scope approves a ticket, raises a cap or adds a payee.**
- **Each MCP tool needs exactly one scope**, decided by name: `pay` for the x402 and trading tools, `history` for `froggy_history`, `services` for everything else as the default. `packages/domain/src/oauth.ts` claims `services` "is what every MCP tool call needs" and the dispatcher does not agree with it — describe the dispatcher and raise the discrepancy, do not repeat the comment.
- A caller whose scopes are `null` — a person, or a legacy `fgy_` token — **skips the scope check entirely and may do everything an agent may**.
- An agent token's secret is shown once and only hashed; revocation is a **timestamp, not a deletion**, so past invocations stay attributable.
- Browser arbitration has three modes — `agent`, `human`, `idle` — and `idle` is "nobody is currently acting", not "nobody connected".
- Navigation is **three destinations** (Home, Explore, Wallet) with Connections and Account at the foot; a conversation and the browser are deliberately not destinations.

## Order of work

1. `foundations/` first, in this order: the-request, the-leash, money, the-conversation, identity-and-agents, navigation, the-shared-browser. Everything else links to them.
2. `workspace/conversation/` next, all six documents. This is the hardest part and the bulk of the experience. Read `runs.ts`, `chat.ts`, `tools.ts` and `sockets.ts` in full before starting any of them, because the states hand off to each other and the documents must agree on where one ends and the next begins. Ownership of states: `the-composer.md` owns asking and answered-at-once; `the-streaming-answer.md` owns while-it-runs and finishing for an ordinary turn; `tool-calls.md` owns what a tool call looks like inside that; `approvals.md` owns the parked state and every resolution; `freeze.md` owns stop and freeze and what each leaves behind; `resuming.md` owns detach, replay and reconnection.
3. The remaining `workspace/` documents, then `agent-surface/`, then `cross-cutting/`. These are independent and can be drafted in parallel by subagents once the foundations and conversation documents exist to link to.
4. Consistency pass over the whole set, including `python3 ~/.claude/skills/product-description/references/check-links.py .`.
5. Update the coverage table in `README.md` as you go: `drafted` when written, never `verified` — verification by hand is a separate pass.

## Working rules

- Commit after each document or coherent group with a message of the form `docs: add {path}` or `docs: revise {path}`.
- **Stage explicitly with `git add docs/product-description/{paths}`.** Never `git add -A` or `git add .`: other agents work in this tree concurrently and their uncommitted work is live, not debris.
- This repository's commits carry the session's AI attribution trailer. Copy the trailer from the most recent commit on `main` rather than inventing one.
- Do not modify anything outside `docs/product-description/`. The rest of the tree is read-only reference material.
- Do not add files outside the README's structure without updating the structure and the coverage table to match.
- When a behavior cannot be determined from code and tests, write down what you could determine, put the rest in "Open questions", and move on. Do not guess and do not block.
- Depth bar: `workspace/wallet/add-funds.md` is the small-feature bar at roughly 150–200 lines. The conversation documents run longer; cross-cutting documents are often shorter. Completeness matters more than length: every phase, every variant row, every interrupt row accounted for, even when the answer is "no effect".
- If the README's structure turns out to be wrong for something you discover — a document that should be split, two that should merge — make the change, update the structure and coverage table, and say why in the commit message.

You are done when the coverage table has no `not started` rows, the consistency pass is complete, and everything is committed.
