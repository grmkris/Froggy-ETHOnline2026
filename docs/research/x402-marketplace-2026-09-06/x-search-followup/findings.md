> Grok Build follow-up, reviewed by the coordinator. Six direct X API requests returned **50 post records, 41 unique posts**, including a root and ten sampled replies. The API recent-search window is **seven days**; this sample's hits happened to be from 6 September. Caller independence and vendor affiliations were not separately verified. Bot reports of signing, swaps and balances were not verified on-chain. Product implications are hypotheses, not changes to the accepted billing plan. See [review notes](README.md).

# Public X conversations: x402, paid agent tools, agent wallets

**Date:** 2026-09-06

## Access test

There is no X MCP server in the connected catalog (`search_tool` returned workspace tooling and Railway tools only). That is not the same as “X is unavailable.”

This session has **no dedicated native X search tool**. The built-in tool that did return x.com posts is **`web_search`**. Queries such as `x402 … site:x.com` returned indexed post URLs, handles, timestamps, and truncated text. That is a **search index of X**, not X API and not a full thread.

**`xurl` is on PATH** with an existing OAuth2 session. After `xurl --help`, `xurl search --help`, and `xurl auth status` (account identifiers omitted), six public read/search calls succeeded with no credit error:

| # | Mechanism | Result |
|---|-----------|--------|
| 1–4 | `xurl search` focused queries, `-n 10` | 10, 9, 10, 10 posts |
| 5 | `xurl search conversation_id:2096658413795066313` | 10 posts |
| 6 | `xurl read 2096658413795066313` | 1 post |

**41 unique posts** from xurl (under the 60-post cap). All xurl search hits were dated **2026-09-06**; recent search did not cover 90 days. Older posts below come only from `web_search` index snippets.

## Method

- Tried built-in search first, then xurl for originals.
- Five recent-search queries: payment failures/refunds; MCP/agent-wallet onboarding; Claude/Cursor/agents buying search, images, or inference; distrust/scam/not-ready; plus one conversation pull.
- One `xurl read` of the live failure thread root.
- No posting, DMs, bookmarks, `xurl token`, `~/.xurl`, or private account history.
- Vendors vs independent users, and actual attempts vs hypotheticals, are labeled. Engagement is not treated as demand.

## What original posts show

### Actual attempt: user tells a bot to pay, payment verifies fail

Independent user [@cryptotony5150](https://x.com/cryptotony5150/status/2096658413795066313) asked [@bankrbot](https://x.com/bankrbot) to “make an x402 call” to `x402.bankr.bot/…/httpbase20`. **Replies were inspected** via `conversation_id` search (10 posts; root missing from that search, filled by `xurl read`).

Sequence:

1. User: pay that endpoint.
2. Bot: x402 402; cost 0.00402 USDC; gate is “pay to prove you hold HTTPBASE20.”
3. User: “Use those bankr tokens to pay.”
4. Bot swapped 16.257 BNKR → 0.004053 USDC ([Base tx](https://basescan.org/tx/0xc7643dcae1c4aec3175a2339e1150caf648b602a9d7db8e91210eb30a5a5ce26)), then: “the payment was signed and sent” but still **payment verification failed** ([post](https://x.com/bankrbot/status/2096659236680004084)).
5. User: “Try again.”
6. Bot confirmed HTTPBASE20 + 0.254 USDC in the wallet; verify still failed ([post](https://x.com/bankrbot/status/2096663513842499900)).

This is a **real pay attempt**, not a launch thread. It is **not** buying search, images, or model inference; it is a token-gated x402 “door.” The user retried after a signed payment. This session did **not** confirm a double debit on-chain.

### Refunds, irreversibility, recourse (mostly builders/vendors)

[@casaisdev](https://x.com/casaisdev/status/2096662559839678629) (builder tone): x402 now has deposits, withdrawals, and refunds in a Coinbase facilitator pricing table “and nobody read it.” Text **truncated**; the one reply was **not** fetched.

[@cortexcloud1](https://x.com/cortexcloud1/status/2096629998031339700) (infra/vendor): “settlement is irreversible. no refund code.” Claim: agents call `/settle` without `/estimate`. One reply not fetched. Treat as product teaching, not a personal charge.

[@kalapowered](https://x.com/kalapowered/status/2096643592362017116) (Kala, vendor, reply to PayAI): keep card **reversal** in the loop; default card; upgrade to stablecoin only when the purchase “doesn't need recourse.” Parent PayAI post not fetched.

**Indexed, not xurl:** [@x402rorg](https://x.com/x402rorg/status/2041448118777192714) (refund-protocol vendor) quotes [@jnptzl](https://x.com/jnptzl/status/2031440117525565523): “my agent just lost 3.20 usdc because a Veo video generation failed.” That is the closest **independent paid-generation failure** in this pass. Originals were **not** fetched via X API; refund outcome unknown.

**Indexed, not xurl:** [@QuackAI_AI](https://x.com/QuackAI_AI/status/2090018903292629024) (vendor, 2026-08-19) states the buyer problem: wiring 402 yourself, and that a paying agent can “overpay, double-pay, or pay the wrong thing.” Their product answer is MCP `q402_x402_fetch`, per-call/session caps, two-phase consent. Replies not inspected.

### Paid MCP / Claude / Cursor: almost all promoters

Recent xurl hits for MCP + Claude/Cursor were **vendor pitches**, not users reporting a first wallet fund:

- [@SolEnrichHQ](https://x.com/SolEnrichHQ/status/2096675520993730602): pay-per-call USDC via x402 or card, “No API key. MCP tools for Claude and Cursor.”
- [@sdcrypto10](https://x.com/sdcrypto10/status/2096485357088813136) (promoter): Openzoo as pay-per-call inference (Claude/GPT/Grok) without a key.
- [@Nokaizoku0](https://x.com/Nokaizoku0/status/2096686891546341864) (Steve/OOBE promo): non-custodial agent wallet, “x402 when a tool is paid. Abort when the policy breaks.”
- [@402Signal](https://x.com/402Signal/status/2096612463257022971): “Wallet plus API plus agent CLI/x402/MCP in one stack is rare.”

No xurl original in this budget showed a Cursor/Claude user saying they just funded an agent wallet and bought search. That absence is a **recent-search/promoter-bias** limit, not proof the behavior does not exist.

### Distrust, anonymous endpoints, launch dissent: sparse in recent API

The dissent query mostly returned noise (leaderboard XP bots, unrelated news). Useful nearby signal:

- [@gegelz](https://x.com/gegelz/status/2096596287923585068): public-wallet x402 metering “still shows every call”; wants a **private** agent wallet while paying. Parent not fetched.
- [@SumitSisodiya28](https://x.com/SumitSisodiya28/status/2096512918401823227): hire, check, pay, and “a record the next stranger can trust.” Five replies and the linked article were **not** inspected.
- [@SingItAgent](https://x.com/SingItAgent/status/2096663904793354547): on-chain “USDC pool” result was fake/unknown — distrust of data an agent might pay for, not of an x402 URL itself.

`web_search` found **non-X** coverage (Jan Curn / Apify “not ready,” facilitator security tests, wash/leaderboard volume). Those were **not** retrieved as original X posts here. Do not treat them as X threads.

## Uncertainties

- **xurl recent search ≈ last day**, not 90 days. Independent failures from spring/summer (Veo refund, QuackAI buyer post) are index-only.
- Default tweet payloads **truncate** long posts; casaisdev and several vendor posts are incomplete.
- `conversation_id` search is **not** a complete thread API; one live thread was sampled to 10 replies.
- No on-chain confirmation that the Bankr “signed and sent” payment debited USDC, so **double-charge is unproven** in that thread.
- Search operators matched “fake,” “leaderboard,” “wallet” loosely; several hits are promo or off-topic.
- `web_search` X snippets can include quoted text; quoted jnptzl was **not** `xurl read`.

**Next technical step if more originals are required:** raise the xurl cap and use `xurl read` on indexed IDs (`2031440117525565523`, `2090018903292629024`, `2090467979121013077`) plus `conversation_id` pulls; recent search cannot backfill 90 days.

## Product implications

1. **Buyer-side verify/settle is the live pain.** Users already tell personal bots to pay. Signed-and-sent then 402-verify-failed, plus “try again,” is the failure mode to design for (idempotency, receipt, no second authorization).
2. **Refunds when the resource fails** (quoted Veo case) and **estimate-before-irreversible-settle** are what builders say is missing. Card rails are pitched specifically because stablecoin x402 has weak recourse.
3. **Spend caps and human confirm** are the vendor answer to overpay/double-pay; they are not visible in the independent Bankr thread.
4. **MCP-for-Claude/Cursor + fund-a-wallet** is how sellers talk. Independent recent posts show chatting with a paying bot, not installing MCP. Onboarding still looks like “mention a bot,” not a wallet setup wizard.
5. **Privacy vs audit:** some want every call visible on a public wallet; others want the agent wallet hidden. Both are product requirements, not one slider.
6. **Anonymous endpoint trust** barely showed up as user complaints in this xurl window; more common is “leave a record a stranger can trust.” Do not infer market size from likes or from vendor volume claims.

Raw API responses were retained in the local scratch directory `/tmp/froggy-x-search-followup-20260906/_xurl/`; this repository bundle contains source links, summaries and response hashes rather than full post payloads.
