# X research as a Froggy capability

Owner direction, 6 September 2026: use Grok Build for the team's X research; Froggy itself should use the X API as an upstream. These are separate integrations. This note makes that direction concrete without changing the running implementation plan or claiming an integration is already built.

## Product flow

A person asks Froggy, or Hermes/Claude delegates: “Find what people complain about with agent wallets, inspect relevant conversations, and give me a sourced report.”

1. Froggy describes the research scope and quotes a fixed task price.
2. The caller pays Froggy through its existing Hedera x402 service path under the person's mandate.
3. Froggy's server searches the X API, selects relevant conversations, fetches bounded reply samples, and synthesizes findings.
4. The existing task record returns a report, original post links, coverage limits, and a payment receipt. Chat and external agents retrieve the same result.

X is paid through its normal API billing; it does not have to accept x402. Keep the customer's Hedera payment distinct from X API usage costs and model costs. The user's earlier request for MCP remains a desired additional entry point: a thin adapter over the same task API, alongside the current CLI/skill. The confirmed plan still explicitly defers remote MCP; this note records the renewed preference rather than silently changing that plan.

## Upstream access

For development and investigation, `xurl` is X's official CLI. It is installed on this machine and its auth-status command reports an OAuth account configured. The [Grok follow-up](x-search-followup/README.md) subsequently verified six successful public API requests, returning 41 unique posts. That proves this local session can read X; it does not verify production credentials or long-term credit availability. Production should use a server-side X API adapter with service credentials and read-only public-data access, rather than depending on the founder's workstation login. Credentials stay out of the external agent, browser, prompts and reports. [Official xurl documentation](https://github.com/xdevplatform/xurl).

Use `GET /2/tweets/search/recent` for the most recent seven days. A longer requested research window needs `/2/tweets/search/all` and verified archive access; do not silently label seven days as ninety. Request useful fields deliberately, including creation time, author ID, conversation ID and reply relationships. [X search documentation](https://docs.x.com/x-api/posts/search/introduction).

Fetch selected conversations with the `conversation_id:` search operator. Bound pagination, results and time. A sample or inaccessible reply is not a complete thread; return whether the root and replies were actually retrieved and what date range was covered. [Conversation IDs](https://docs.x.com/x-api/fundamentals/conversation-id).

X also offers its own MCP endpoint and an `xurl mcp` bridge. That is an optional upstream interface. It is separate from Froggy's MCP for Hermes/Claude: giving an agent direct X access would bypass Froggy's task billing and shared result flow. [X MCP documentation](https://docs.x.com/tools/mcp).

## Smallest task contract

Proposed capability: `research.x`, implemented as a new explicit task kind or a validated service-task variant. Today the task kinds are `brief` and `browse`; do not charge the existing lending-brief price for this different workload.

Inputs: research question, date window, language, bounded number of posts/conversations, and desired result format. The server derives and limits provider requests; an external agent cannot override the mandate or pass arbitrary credentials or endpoints.

Output: concise findings, supporting post URLs and dates, known affiliation where evidenced, root/reply coverage, conflicting observations, sampling limits, and a Markdown artifact. Keep actual user reports separate from vendor claims. Do not interpret likes or repeated promotional posts as purchasing demand.

Execution: use existing task identity, token ownership, idempotency, approval handling and retrieval. Persist progress so reconnecting or polling does not start another paid research job. Show X access/credit errors as actionable task outcomes, not an empty successful report. Existing fixed-price paid-failure policy remains in force unless the team changes it.

## Pricing and practical proof

X's checked price sheet lists post reads at $0.005 per resource. As an illustrative lower-level cost calculation, 60 distinct returned posts cost $0.30 before extra billable resource types and inference. A search request can return multiple billable resources. Quote from a bounded workload and current account pricing, not “one API request.” This is cost modeling, not a proposed retail price. [X pricing](https://docs.x.com/x-api/getting-started/pricing).

Before promoting the service as available, prove one bounded X request under the intended service account, inspect a root and replies, check the actual usage, and run one end-to-end paid Froggy task with a retrievable report. Also exercise an access failure, a retry and an exceeded budget. X's access and content-use terms apply to the resulting service; charging through x402 does not change them. [Developer agreement](https://docs.x.com/developer-terms/agreement).

## Immediate research follow-up

Grok Build tested built-in search, then successfully used xurl against the X API. The [follow-up report and access audit](x-search-followup/README.md) record six successful requests, 50 returned records and 41 unique posts, including a root and sampled replies. Direct X access works on this machine; an absent X MCP tool did not make research unavailable. Production still needs its own server-side API credentials and bounded task execution.
