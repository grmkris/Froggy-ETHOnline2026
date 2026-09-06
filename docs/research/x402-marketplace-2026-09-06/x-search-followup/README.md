# Direct X access: Grok Build follow-up

**Verified on 6 September 2026:** Grok Build invoked the installed `xurl` CLI. Four topic searches, one conversation search and one root-post read all succeeded. They returned 50 post records representing 41 unique posts. The conversation sample includes a retrieved root and ten replies; it is not a complete reply history.

This corrects the earlier practical conclusion: the original Grok sessions lacked a dedicated X tool, but **direct X API access was available on this machine**. Grok's built-in web search also returned X index results; it was not demonstrated to be a dedicated native X API/thread tool. No X posts or messages were sent. These reads used existing X API access; actual API-credit deductions were not measured. No x402 payments were made in this follow-up.

## Evidence and findings

- [Grok's findings](findings.md): the clearest behavioral example is a caller asking Bankr to retry a paid endpoint after verification failures. It concerns a token gate, not an image/search purchase. No debit or double charge was independently confirmed.
- [Source ledger](sources.json): 12 selected post records, ten derived from direct API reads and two from indexed X text. Four records describe the same Bankr conversation; they are not four independent demand examples.
- [Grok access test](access-test.json): commands and observed mechanisms, without credentials. Its `returned_posts: 41` refers to unique posts; the per-request total is 50.
- [Coordinator audit](coordinator-access-audit.json): independently counted response records, unique IDs, and hashes.
- [Exact brief](prompt.md): built-in search first, bounded public-API fallback, no account changes or posting.
- [Froggy X research service](../x-research-service.md): X API upstream, Hedera-paid task, shared chat/CLI and proposed MCP entry.

## Interpretation limits

Recent search covers seven days, even though this particular sample's results were all dated 6 September. Several long posts were truncated in default xurl payloads. A production research adapter should explicitly request available long-form text and disclose missing text or partial thread coverage.

Caller independence and affiliations are not independently established. Descriptions such as “independent user” in the raw report mean an apparent public caller, not a verified unaffiliated customer. Claims about protocols, refunds, swaps, balances and payment debits are attributed post content unless separately checked. One conversation plus vendor commentary cannot establish market size or general user requirements.

The follow-up strengthens evidence of attempted agent payments and repeat failures; it does not validate a broad market for paid image/search capabilities. Refund suggestions in Grok's report do not override the team's existing paid-failure decision.

JSON, post-ID matching, document links and Markdown fences were checked locally. Required repository gates again stopped at formatting in the three pre-existing raw sync documents; those were preserved. No application code changed.
