# Glossary

The vocabulary used across these documents. When a document uses one of these words, it means exactly this.

Where Froggy's own interface has a word for something, that word wins and this entry says so. Where it does not, the plain word wins over the code's identifier.

## The workspace

**Workspace.** The signed-in Froggy app: everything behind the app URL once a person has a wallet. One workspace belongs to one person and holds one balance, one leash, one history and one set of connected agents.

**Destination.** One of the three places the navigation treats as somewhere to go: Home, Explore, Wallet. _Connections_ and _Account_ are reachable and visibly not destinations. The shared browser is deliberately not a destination — it is a view inside a task, and closing it never stops the work.

**Pane.** A region of a page that shows one kind of thing and updates on its own: the wallet pane, the browser pane, the stream. A pane is not a page and has no route of its own.

## The request

**Request.** The unit of interaction in this repo: the smallest thing that has a beginning, a possibly long and expensive middle, and an end. A person typing in the composer makes one; so does a connected agent calling a paid tool, a schedule firing, and a Telegram message arriving. Its five phases are _asking_, _answered at once_, _the work begins_, _while it runs_, _finishing_.

**Run.** The server-side life of a request that got past _answered at once_. **A run belongs to the server, not to the socket that started it**: closing a tab does not end it, and only an explicit stop does. This is the single load-bearing rule of the agent half of the product, and it exists because a run that died with its socket could leave a spend on the ledger with no receipt.

**Turn.** One exchange inside a conversation: what the person said and everything Froggy did in answer, up to the point it is ready for the next thing. A run carries out a turn.

**Task.** A delegated piece of work with an id that outlives every socket — priced, paid, run on the server, and retrievable afterwards by id. Its kind is _brief_ (a paid data answer, no browser), _browse_ (drives the shared browser), or _service_. Its status is one of `quoted`, `paid`, `running`, `paused`, `awaiting_approval`, `done`, `failed`, or `uncertain`. A caller that hangs up gets the same task back by id; a caller that repeats a request with the same _idempotency key_ gets the same task rather than a second bill.

**Uncertain.** A task whose payment was sent and never confirmed either way. It is its own status rather than a failure, because "we do not know whether that money moved" is a different thing to tell a person than "it did not".

**Conversation.** An ordered series of turns with an id and a URL. A conversation is something a task _has_, not a place the person goes; Home starts one and sends the person to it.

**Idempotency key.** A string that is stable across retries of the same logical request. Tool calls get retried — by the SDK, by a reconnect, by a model that did not see the result — and without this a retry is a second payment.

## Money

**Amount.** What a chain actually moves: an integer count of an asset's smallest unit, carried as a decimal string. Never a float.

**Micro-dollars.** The unit every cap, running total and threshold in the leash is written in. One dollar is 1,000,000. Micro-dollars rather than cents because x402 prices are routinely fractions of a cent, and a cap that cannot express the price it is capping is not a cap. Displayed to two decimal places, or four when the figure needs them.

**Balance.** The one dollar figure the workspace shows. It is what may be spent, not what is held on any one chain.

**Pocket.** The account a host pays its own fees from, as distinct from the person's balance. A pocket that runs dry produces the denial `pocket_exhausted`, which a top-up fixes; it is not a refusal by the leash.

**Conversion.** Turning the person's USDC into the asset a payment needs, at the moment it is needed. Never a thing the person asks for on its own: it exists only nested inside a payment that was already allowed.

**Quote.** The price of something at the moment it was decided, recorded on the receipt beside the rate used. Nothing is metered back afterwards — the quote _is_ the price.

**Cost.** What a request ended up spending, in micro-dollars, across everything it did.

**Receipt.** The durable record of a spend that answers _why_ it spent, not just that it did: which rule let it through, what evidence it was acting on, what it thought it was buying, and what settled where. A receipt cannot be constructed without all three of the first parts. See _stubbed_.

**Evidence.** What the agent knew when it decided to spend: the query, the source, a digest of the result (a _snapshot hash_) rather than the result itself, and which indexes contributed, each with its deployment, block number, and whether it was `fresh`, `stale`, or `unavailable`. A stale index contributed nothing.

**Settlement.** What actually moved on a chain for a payment, including the network and, when one was posted, the Hedera Consensus Service sequence number.

**Purchase.** A thing bought from a seller. **Sale.** The same event seen from the supplier side, when the workspace is the one selling.

## The leash

**The leash.** The whole apparatus that decides what may be spent: the mandate, the person's Privy policy, and the approval rules between them. The product's pitch is "a browser you can watch, on a leash you set", and this is the leash.

**Mandate.** What the agent is allowed to spend, expressed as data and evaluated entirely outside the model. A jailbreak can make the model ask for anything; it cannot make the judgement return _allow_.

**Rule.** One clause of a mandate, of exactly one of these kinds, each carrying its own id so a refusal can name it:

- **Per-transaction cap** — the most a single spend may be worth.
- **Window cap** — the most that may be spent inside a rolling window. Rolling, not calendar: an agent that empties the allowance at 23:59 and again at 00:01 has obeyed a calendar rule and broken the promise it stood for.
- **Payee allowlist** — only these payees may receive money, whatever the model believes.
- **Host allowlist** — only these hosts may be paid for a 402. Matched on host, never on full URL.
- **Network allowlist** — only these chains.
- **Expiry** — the instant the mandate stops being valid, with or without a human.
- **Approval threshold** — spends at or below this are automatic; above it, a person is asked. This is the line the whole product is arguing about.
- **Ask exemption** — "allow this payee up to this much, for this session, without asking again". Written by exactly one thing: a person answering an approval with _allow for this session_.

**Decision.** The judgement on a spend, which is one of three: **allow** (carrying the ids of the rules that were checked and passed, so an allow is as auditable as a deny), **deny** (carrying a _denial code_, a plain sentence, and usually the id of the rule that refused), or **ask** (park the turn and put the question to a person). Ask is deliberately a third outcome rather than a deny, because a model that can turn "ask a human" into "try again differently" has removed the human by persistence.

**Denial code.** The machine-readable reason for a refusal: `frozen`, `expired`, `per_tx_cap_exceeded`, `window_cap_exceeded`, `payee_not_allowed`, `host_not_allowed`, `network_not_allowed`, `untrusted_provenance`, `unpriceable`, `pocket_exhausted`, `conversion_failed`, `run_budget_exceeded`, `price_changed`, `approval_denied`, `approval_timeout`, `approval_unavailable`. The code is the record; the sentence shown to the person is never the only one kept. "Denied by policy" is not an answer a person can act on; "denied by rule rul_… — daily cap, $10.00 of $10.00 used" is.

**Action kind.** What money is for, named once and read by everything: `service_payment` (paying a seller's 402 — the thing the agent exists to do), `conversion`, `earn_deposit`, `earn_withdraw`, `transfer` (paying a person — never the agent's decision, whatever the amount), and `trade`.

**Standing and ask.** Which side of the line an action kind sits on before any amount is considered. A _standing_ kind can run on a standing signature; an _ask_ kind gets no allow rule at all in the person's Privy policy, so the default refusal catches it and no standing signature can ever reach it.

**Frozen.** The wallet's spending is halted. The interface says "The wallet is frozen"; a spend attempted while frozen is refused with the code `frozen`. Freezing outlives the run that was in flight when it happened, which is what makes it different from _stop_.

## Approvals

**Approval.** The question raised when the leash answers _ask_: the run parks and a person is asked. What the person says is recorded on the receipt with the same care as a rule id, because a receipt that says "allowed" without saying "because you said so at 14:02" has lost the fact that made the spend legitimate.

**Approval answer.** One of four, and the interface's own words for them: **Allow once**, _allow for this session_ (which writes an _ask exemption_), **Deny**, and **Deny & stop**. "No, and stop the run" and "no, try something else" are different instructions, and the product keeps them apart. The primary yes sits last in the row, furthest from a stray click.

**Resolution.** How an approval ended: one of the four answers, or one of the three ways it ends without one — `timeout` (the clock ran out), `aborted` (the run was stopped underneath it), `unavailable` (there was nobody to ask, as when a scheduled job fires with no screen open).

## Endings and interrupts

**Stop.** The person's explicit halt of one run. An explicit stop cancels; a closed socket does not.

**Detach.** Stopping watching without stopping the work: closing the tab, losing the socket, navigating away. A detach has to be a detach — the run keeps draining.

**Replay.** What a reconnecting client is sent so it can catch up on what it missed while detached. Bounded: past a ceiling the run keeps going but stops being replayable, because an unbounded buffer is a leak that only shows up on the longest and most expensive turn.

**Resume.** Reload or reconnect and find the run still going, with the missed part replayed. Distinct from _restart_, which Froggy does not do to a run in flight.

## Connected agents

**Connected agent.** An outside assistant that reaches this workspace over MCP, with its own grant. The interface calls the place they are managed **Connections**.

**Grant.** What a connected agent was given: its scopes, when it was granted, and whether it is still live. Disconnecting revokes it.

**Scope.** One permission inside a grant. A grant's scopes bound what the agent may ask for; the leash independently bounds what it may spend. Both apply, and the narrower wins. Each MCP tool requires exactly one scope, chosen by the tool's name: `pay` for the payment and trading tools, `history` for reading history, `services` as the default for the rest. A caller carrying no scope set at all — a person, or a legacy token — is not checked against this list and may do everything an agent may.

**Invocation.** One call a connected agent made — an MCP tool call, a task, or a payment — kept as a trail against the agent that made it.

**Consent.** The screen a person is shown when an agent asks to connect, and the act of agreeing to it. There is a manual-code path for when the redirect cannot be followed.

## The shared browser

**Shared browser.** The hosted browser a person and the agent both look at. Every browser is a hosted browser driven over CDP; there is no local Chrome.

**Ownership.** Who currently drives the page. The interface's words are **Control** (the person has it) and **Follow** (the person is watching the agent). A person's own input takes the page.

**Takeover.** The person taking ownership mid-run. It does not stop the work.

## Stubs and provenance

**Stub.** The stand-in for an external service whose credential has not arrived. Every integration has one, selected in one place, and **a stub is loud**: the wallet pane marks it and every receipt it touches carries `stubbed: true`, in the data and not only in the interface, so a screenshot cannot be presented as a settled payment. A faked run that could pass for a real one is the failure mode the whole design exists to prevent.

**Live.** The opposite of stubbed: the integration is running against real credentials. What `/health` reports per integration.

**Provenance.** The trail that makes a spend checkable afterwards by someone who was not there: the settlement, the Hedera transaction, the consensus sequence number, and the evidence with its snapshot hash and deployment block numbers. A source URL alone is a claim about a gateway, not about the data.

## The record and the pager

**The archive.** The durable side of history: the conversations, messages, runs, tool executions and artifacts a person can read back after everything in memory is gone. Distinct from _replay_, which is a convenience over it and is bounded; the archive is not. It is written before work is attempted rather than after, which is what makes an interrupted run a fact rather than a gap.

**Checkpoint.** One write of a running turn into the archive. A turn checkpoints at most once a second while it streams, with a ten-second heartbeat behind that so a turn producing nothing still proves it is alive. A checkpoint that cannot be written aborts the run, because an answer that cannot be recorded is worth less than the record when the answer may have spent money.

**Lease.** The claim a run holds on its workspace while it works, renewed by every checkpoint and good for thirty seconds. One lease at a time, so two runs can never write the same workspace. A run whose lease expires is marked `interrupted` — nobody was there to end it properly.

**Notice.** Something the agent says without being asked. It has exactly three sources: the `notify` tool inside a turn, a reminder coming due, and the report of an unattended turn. A notice always reaches the web stream and reaches the person's phone when Telegram is paired; the record says truthfully which of the two happened.

**Marker.** An entry the tab files between turns for something that happened to the wallet while the conversation went on: a question asked, an answer given, money arriving, a turn started somewhere else, a notice. Markers are the tab's own memory and are not part of _the archive_.

**The waiting badge.** The count of open approvals, carried on Home wherever the person is: a number beside Home on the rail, a dot on the phone's pill with the count in the accessible name, and a card on Home itself.

**Schedule.** A reminder or a prompt on a clock, in the person's own timezone. A reminder posts a _notice_ and runs nothing. A prompt runs an unattended turn under the person's own leash, with nobody to ask.

**Digest.** The daily report of what changed, what it cost and what was refused. One schedule with an hour and a timezone, or off.
