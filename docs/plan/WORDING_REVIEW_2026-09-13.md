# Wording and prompt review — 13 September 2026

Handoff for the agent that continues this work. Nothing in the app was changed by the review; this file and [WORDING_INVENTORY_2026-09-13.md](WORDING_INVENTORY_2026-09-13.md) are its only output. A visual version with before/after message pairs: https://claude.ai/code/artifact/c40e7c37-ac66-4f86-a881-89d0291fc94d (private to the owner).

## The ask

The owner asked for a deep look at recent production interactions — Telegram messages, web chats, alerts, digests, tool calls — to find improvements through better prompts and better wording. It started from a Telegram alert that turned out to be address poisoning (see "Watch alerts" below).

## What was read

- **Production database, read-only**, on 13 Sep 2026 around 15:30 CEST: the owner's Telegram thread cache (34 messages), all 26 of the owner's conversations with messages and tool parts, 205 tool executions, 35 tasks, all `wallet_alerts`, 18 non-completed `conversation_runs`. For the other three accounts only counts and error strings were read, never message text.
- **The code at `3dc27c6`**: every system prompt, tool description and message template. The verbatim inventory is in [WORDING_INVENTORY_2026-09-13.md](WORDING_INVENTORY_2026-09-13.md) — read that before editing copy; it has file:line for everything below.
- The model in production is configured as `qwen3.8-max` (see `.env.example`).

Times below are CEST unless marked UTC. The raw dumps lived in a session scratchpad and are gone; "Re-pulling the data" at the end reproduces them.

## Ranked changes

Ranked by how often the problem appeared in one week of real use, against effort.

### 1. Tolerate stringified tool arguments and return the real validation error — medium

About 22 tool calls in the owner's week failed because the model sent nested objects or numbers as JSON strings, and each failure produced a reply narrating "serialization" to the person.

| Tool | Wrong argument | Failures | Consequence |
| --- | --- | --- | --- |
| `schedule` | `when`, `action` as strings | 3 | "hello world" reminder never set (8 Sep) |
| `watchlist_save` | `source` object as string | 5 | AAPL on Robinhood Chain never saved (13 Sep) |
| `trade_prepare` | token fields replayed as `[redacted]`, then placeholders | 5 | fixed by `bdcfc12` (history redaction removed) |
| `service_status` | `waitMs` as string | 2 | "waitMs keeps getting serialized as a string on my side" |
| `x402_fetch` | cap as string | 4 | digest runs on 10 and 13 Sep |
| `research_read` | `limit` as string | 2 | "Limit needs to be numeric — retrying" |
| `market_search` | `query` omitted instead of null | 1 | — |

Fix at the tool boundary: parse a string that holds a JSON object for object parameters, accept numeric strings for numbers, make nullable fields optional, and flatten nested inputs where possible (e.g. `source` → `sourceKind`/`network`/`address`). Persisted tool errors read only "An error occurred.", so on replay the model cannot see what failed; store the validation message.

### 2. Give the prompt the date, timezone and surface; add a Telegram section — small

- `turn.ts:284-291` assembles the prompt with no date, time, timezone or surface. On 13 Sep the model wrote idempotency keys ending `20260114`. The `schedule` guidance asks it to "confirm … in their local time" without a clock.
- Telegram uses the web prompt, which says the person "is watching the page change" and to narrate before acting. The Chat SDK joins every step's text with blank lines into one message, turns tables into ASCII blocks and truncates at 4096 characters. Result: 400–700 word phone messages containing lines like "Arguments got sent as strings — retrying with the proper object shape".
- The concise-answer policy (`research-guides.ts:60-65`, added `2b6816c` 12 Sep 23:47) visibly shortened web answers afterwards (the AAPL answers were ~100 words). Telegram has had no conversation since, so it is untested there.

Proposed addition (adapt placement; the last paragraph needs change 5 to be true):

```text
Today is ${localDate}, ${localTime} (${timezone}). You are replying on ${surface}.

On Telegram: plain sentences, at most six short lines. No tables, headings or
step-by-step narration. Approval cards, browse cards and lookup cards do not
appear here; when one is needed, say so in one line and give the Froggy link.

Words: say Base, Robinhood Chain, Ethereum, never eip155 ids. Say dollars
($0.01), never micros, tinybars or raw units. Do not show task, trade, rule or
watch ids, idempotency keys, library versions or error codes unless asked.

If a tool rejects your arguments, fix them and call it again without mentioning
it. Mention it only if you give up.

Ask at most one question, and only when the answer changes what you would do.
Otherwise state your assumption and go.

Messages marked [Froggy alert], [digest] or [notice] were posted by Froggy's
systems, not written by you. Do not bring up anything older than a day unless
the person does.
```

The prompt also tells chat to open unlocked pages with `browser_navigate`, which chat cannot call (`turn.ts:125-127` vs `tools.ts:797`), and says "never ask them to top up" while refusal texts say "Top it up to continue." — see the inventory's cross-surface section.

### 3. Rewrite watch alerts — small

Template: `apps/server/src/wallet-activity.ts:456-490`. It never names the watch (`item.title`) or the counterparty (`flow.counterparty`), shows two raw links, says "provisional" on every alert, and uses UTC ISO timestamps in the start message (`wallet-monitor-worker.ts:260-269`).

Sent on 13 Sep vs proposed:

```text
Wallet transfer · Base · provisional
Sent 0.1 USDC
https://basescan.org/tx/0x9a7d…
https://app-production-58dd.up.railway.app/watchlist/wli_…
```

```text
0x0Cf8…67F6 sent 0.1 USDC
to your Froggy wallet (0x5eca…0344)
Base · confirming
[View transaction] [Open watch]
```

- **Spoofed transfers.** On 13 Sep two address-poisoning transactions (fake tokens named `UႽD‬C` and `UṢDC` emitting `Transfer(watched → lookalike of the owner's Froggy wallet, 0.1)`) were delivered as "Sent 0.1 0x6c9458…d28c". The symbol check at `wallet-activity.ts:296` already rejects the homoglyph symbol. Proposed rule: a `sent` flow whose token has no verified symbol and whose transaction was not initiated by the wallet goes to the Inbox as "Fake transfer ignored", not to Telegram. Do not use "tx.from ≠ wallet" alone: the watched wallet is an EIP-7702 account and its real sends arrive through relayers. `transactionFrom` is already carried in `packages/graph/src/wallet-stream.ts:46` but unused. Full investigation: memory note on address poisoning, and the transactions `0x510421…fbde`, `0xbe7070…2a07`.
- **Swaps via unverified routers** are titled "Wallet transfer" (`0x4d3f…f6f1`: received USDC, sent ETH). Say "swapped X for Y (unverified route)".
- **Titles** come from the model's `track_wallet` `title` ("Base contract 0x0Cf8…67F6 activity"), producing "Watching Base contract … activity on Base". Generate the title server-side.
- "provisional" appears in five forms across Telegram, Inbox and the watch panel; pick one pair of words (e.g. "confirming" / "confirmed").

### 4. Replace the daily digest — medium

- `telegram/pager.ts:442` saves `${outcome}: ${summary}\nSpent: ${spentUsdMicros} USD micros. Receipts: ${ids}`. The saved digests for 10, 11, 12 and 13 Sep read like "aborted: stopped after a minute / Spent: 0 USD micros. Receipts: " and one used the model's mid-run narration ("Retrying once with the cap as a number") as the summary.
- **None of the 10–13 Sep digests is in the owner's Telegram thread cache**; all are marked delivery `uncertain`. Only the 9 Sep digest arrived. Investigate before rewording.
- `jobs.ts:84-97` still asks the digest to buy the paid lending snapshot; on 13 Sep that endpoint answered `platform_credits_required` ("Anonymous per-resource payments are retired"). The digest is about lending markets the owner has not used in a week, and has no access to Watchlist, Inbox, alerts or pending cards.
- Proposal: build the digest from records (spend in dollars, alerts, pending cards, watches expiring), not model prose; send nothing on an empty day.
- **Coordinate:** `apps/server/src/jobs.ts` had another session's uncommitted edits when this review was written.

### 5. Mark system posts in Telegram history; stop resurfacing stale items — small

`history-sources.ts:187-238` saves alerts, approval summaries, report text and `notify` messages into the Telegram conversation as **assistant** messages, and `history.ts:340-383` replays the last 50. On 12 Sep the owner wrote "Hi" after four days; Froggy answered about a 4-day-old reminder and an unanswered connect card, restated 7 Sep balances, then corrected itself. Prefix those records (`[Froggy alert]`, `[digest]`, `[notice]`) and pair with the prompt line in change 2.

### 6. Browse card copy and outcome feedback — medium

- Tool result: "Choose a browsing budget in the card. Nothing has been charged or browsed yet." (`tools.ts:790`). Six quoted browse tasks were never started; running shoes were requested three times and produced three cards.
- On the cat-food request the owner read the card's budget as the food budget. Proposed card copy: "Froggy's fee for this: up to $1 — covers Froggy's browser time, not the shop. You pay the shop yourself at checkout." with a one-tap Start at the default.
- On 12 Sep a browse ran 12 steps, charged $0.27 and saved an empty report at 21:21; at 21:25 the chat said "nothing has happened yet". A Uniswap browse ended "The agent did not provide evidence of completion" ($0.34) and was resumed at 08:43 the next morning. The saved-evidence prompt block (`research-task-context.ts:52`) may already cover the first; verify, and verify a stopped browse cannot resume later.

### 7. Human amounts in tool results; one vocabulary — small

`wallet_status` returns `hbarTinybars`, `usdcUnits`, `*UsdMicros` and raw rules. The model turned 336,715,101 tinybars into "~3,367 HBAR" (it is 3.37). Replies leaked `eip155:8453`, `tsk_…`/`trd_…`/`wli_…` ids, `notAfter 1791660864220`, `reservationState`, `viem@2.56.3`. Add formatted fields (`"$19.23"`, `"13.2 HBAR"`) next to raw ones and the glossary line from change 2.

### 8. Translate errors at the edge; refund failed paid work — medium

| Shown | Proposed |
| --- | --- |
| `An unknown RPC error occurred. Details: trade.rpc: execution RPC failed or returned an invalid response. Version: viem@2.56.3 Paid task; not refunded.` | Token research couldn't reach Base just now. You weren't charged. Try again in a few minutes. |
| `trade.simulation_invalid: Tenderly returned an invalid bounded response.` | Couldn't preview this swap: the simulator returned an error. Nothing was signed or spent. |
| `Privy refused to sign under policy …: 400 {"error":"caip2 is required when signature_options is provided"}` (another account) | Couldn't convert USDC to HBAR because of a problem on Froggy's side. Nothing was paid. |
| `credit_mode_mismatch: Simulated tasks and real purchased credits are kept separate.` | This card was created in demo mode and can't use real credits. Ask again for a new one. (verify meaning first) |
| `The model stream failed.` — 12 runs across 3 accounts, empty reply | Froggy didn't answer that one. Send it again. |

Four paid tasks in the owner's week ended "Paid task; not refunded" after provider failures, while the `service_status` description says "Failed work returns its credits". One of them is wrong.

### 9. Deduplicate notices; give email notices a sender and subject — small

"New email in Froggy. ${appOrigin}/chat/${id}" (`email-routes.ts:318`) was sent three times for the same email thread (12 Sep 23:21, 23:22, 13 Sep 12:43).

### 10. Address classification and tool scoping — small

- `trading/address-lookup.ts:250` classifies an EIP-7702 delegated EOA (code `0xef0100…`) as a contract; `trading/privy-execution.ts:381` already recognises that prefix. The watched wallet was described as "a contract … most events will be protocol flows rather than a person trading".
- `pons_token` ran on non-Robinhood addresses 4 times; `positions` failed on Base 6 times across two accounts ("yield-position discovery currently supports Ethereum"). Constrain the schemas rather than the prose.

## Worth checking first (not wording)

- Telegram delivery 10–13 Sep: digests, a `notify` test, the Uniswap connect card and two email notices are `uncertain` and absent from the thread. On 12 Sep 10:06 `notify` returned "No Telegram is paired" although the owner's pairing dates from 8 Sep.
- Browse outcome visibility and stale resumption (change 6).
- Refund contradiction (change 8).

## Already fixed during the week

- `[redacted]` replayed into tool inputs — `bdcfc12`, 12 Sep 19:57.
- Bare 0x address → free `address_lookup` first — `08e63c8`, 12 Sep 13:25; every later conversation follows it.
- Sponsorship misdiagnosed as missing gas — prompt line in `fe95428`, 12 Sep 18:56.
- Shorter answers — `2b6816c`, 12 Sep 23:47.

## Suggested order for the next agent

1. Change 1 (boundary coercion) and change 2 (prompt date/surface/Telegram rules) together — they remove most of the noise and are testable with unit tests on the tool schemas and a prompt snapshot.
2. Change 5 (system-post markers) so change 2's last paragraph is true.
3. Change 3 (alerts), then the digest investigation and rewrite (change 4) once `jobs.ts` is free.

Work on `main`, commit each change by pathspec, and never stage files you did not edit; other sessions share this tree.

## Re-pulling the data

Follow [the conversation retrieval runbook](../CONVERSATION_RETRIEVAL.md) (Railway IDs and the `railway ssh … -- bun -e <script>` mechanism through Python `subprocess.run`). Useful facts learned on 13 Sep:

- `conversations.data.id` is the `cnvrs_…` id; `conversation_messages.data.conversationId` joins to it (the `conversation_id` uuid columns do not match between the two tables).
- `wallet_activities.item_id` is a uuid column; filter by `document->>'itemId'` for `wli_…` ids.
- Message parts live in `conversation_messages.data.parts` (`text`, `reasoning`, `tool-<name>` with `input`/`output`/`errorText`).
- Tool executions: `tool_executions.data` has `name`, `input`, `result`, `outcome`; tasks keep `input`, `result`, `error` columns.
- Telegram thread cache: `chat_state_lists` with `key_prefix = 'froggy-telegram'` and `list_key = 'msg-history:' || telegram_pairings.thread_id`.
- Scope queries to the owner's user id; read other accounts only as counts and error strings. Keep private conversation text out of committed files.
