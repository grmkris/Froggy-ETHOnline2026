# Methods, provenance and review corrections

Publication note: workspace-specific tool names in the imported reports and access-test messages are generalized to “workspace tooling” to comply with the repository naming contract. Findings and access limitations are unchanged. Original copies were retained locally during release preparation.


**Later access correction:** [Grok Build successfully searched X through xurl](x-search-followup/README.md), returning 41 unique posts. The unavailable-native-tool statements below describe the original three runs; they do not mean the machine lacked an X API access path.

Read [deep-research.md](deep-research.md) for the reviewed recommendation. The Grok reports are preserved research inputs, not accepted architecture or verified implementation plans.

## Research performed

Three actual **Grok Build CLI / Grok 4.6 / high reasoning** runs worked in parallel: service inventory; user demand and complaints; competition and demo ideas. Each received a bounded brief, discovery followed by gap-driven follow-up, and instructions to write Markdown findings and a structured source ledger. Nested agents were disabled because work was already split across three Groks. The services run stalled for over ten minutes during its write-up; it was interrupted and resumed from its saved conversation with a shorter output request, retaining the research already gathered. No provider payments, provisioning, posts or application changes were requested.

The services lane initially encountered an automatic approval rejection because its brief included internal project architecture and strategy. It was relaunched with a public-only ecosystem brief; Froggy mapping was performed locally. The other two lanes were independently approved. Saved prompts document what each run received.

**Native X keyword/semantic/thread tools were unavailable.** Grok used web search, indexed X posts and attempts to fetch original pages. Reply coverage was incomplete; native X thread fetch count is zero. This is substantial web research with partial X evidence, not a completed native-X conversation crawl. Promoter posts, impressions and likes do not establish customer demand.

The coordinator reopened consequential provider and competitor sources, GitHub and Graph forum discussions, and the original Reddit negative-result thread. It checked You.com search and the historical Firecrawl route using generic public inputs, without credentials or payment signatures. [New probes](coordinator-probes.json) remain separate from the [earlier probes](probes.json), because the time, routes and project state differ.

The completed Grok ledgers contain 20 service records, 32 demand records and 30 ideas records. With 11 coordinator checks, the combined ledger has 93 records covering 81 distinct URL strings (some may be alternate URLs for the same page). These are not 81 independent demand observations. The combined ledger retains lane provenance. The audit gives actual per-lane source counts and deduplicated URLs: multiple Groks finding one page does not make multiple independent sources. Researcher confidence labels are not paid integration certifications. Three ideas-lane records incorrectly say `native X thread`; the combined ledger corrects them to partial web-page access and retains the original label for audit. Narrative source counts in raw reports can disagree with their JSON; use the generated audit counts.

## Corrections that take precedence over raw reports

| Raw finding or assumption | Reviewed treatment |
| --- | --- |
| Only one product/sponsor combination is viable or eligible. | Unsupported exclusivity. The owner has selected three tracks in the current plan; alternatives are not ruled out by this research. |
| Graph AI is the selected third prize; Start from Scratch requires a new repo for this extension. | The team selected standardized/composable products. No new-repository requirement is established here. Eligibility depends on event rules and actual work history. |
| Remote MCP is mandatory next; task IDs, tokens and durable sellers need building. | MCP is deferred. CLI/skill, tokens, durable tasks and uncertain-payment handling landed while research ran. The synthesis reconciles against revision d9cf26e. |
| Introduce metering, refunds, per-agent caps or Freeze. | These conflict with recorded team choices and are not adopted. Fixed-price paid-failure behavior must remain explicit. |
| Shared host balance and testnet-only Hedera remain the architecture. | Stale initial context. Per-person accounts and configurable networks landed; mainnet and Privy custody are the accepted direction. This research does not certify all live rollout steps. |
| Budgets, confirmations and multi-provider MCP are unique. | Competitors already document versions of these. Test the whole shared-workspace experience instead. |
| A stdio MCP is inherently inadequate. | Unsupported. Authentication and client usability matter; transport alone does not decide value. |
| The service lane calls Graph/Messari “logos only,” or Exa the cheapest search. | Incomplete lane evidence, not an ecosystem conclusion. Froggy has live Graph evidence; You.com returned a lower sampled search quote. Use the reviewed shortlist, not those raw rankings. |
| A live 402 means the provider works or proves demand. | It proves advertised terms only. Settlement and useful delivery need separate evidence. |
| Firecrawl is ready because an announcement names a route. | The named route returned 404. Treat as unresolved, not verified or definitively discontinued. |
| Indexed X replies or engagement establish organic demand. | No complete native threads were retrieved. Unverified reply interpretations were not promoted into the synthesis. |
| Historical tool caps apply to all current clients. | Reports are version- and client-specific. No universal limit is claimed. |
| Market volumes, failure rates or attack percentages are established ecosystem facts. | Studies and operator claims were not independently reproduced. The synthesis avoids those numeric claims and does not derive a market size. |
| Zero seller-wallet registrations means zero buyer demand. | Different funnel events. Reddit analytics remain self-reported; use the thread to generate hypotheses. |
| Merchant-of-record or resale obligations follow from an architecture sketch. | No legal determination was made. Provider access/resale terms require a separate review if that commercial model is chosen. |
| All ledger publication dates are verified. | Some are access or inferred dates. Unknown publication dates remain unknown; do not infer a launch date from a ledger alone. |

## Files

- [Reviewed synthesis and shortlist](deep-research.md).
- [Grok services](grok/services.md), [sources](grok/services-sources.json), [brief](grok/services-prompt.md).
- [Grok demand](grok/demand.md), [sources](grok/demand-sources.json), [brief](grok/demand-prompt.md).
- [Grok ideas](grok/ideas.md), [sources](grok/ideas-sources.json), [brief](grok/ideas-prompt.md).
- [Combined ledger](source-ledger.json), [run audit](grok-run-audit.json), [coordinator source checks](coordinator-sources.json).
- [Initial shortlist](shortlist.md) and [initial probes](probes.json): historical baseline predating evening implementation changes.

## Remaining uncertainty

No funded provider jobs, image/audio quality evaluation, reproduction of ecosystem statistics, customer retention study or mainnet funding trial was performed. Hermes-specific organic evidence was sparse. Next evidence should come from an outside teammate completing and voluntarily repeating a real task, then an explicitly budgeted delivery trial of the chosen provider.

Research stops once useful provider options, major substitutes, concrete failure modes and implementation gaps are covered. Remaining gaps are explicit rather than filled with repeated launch posts.

## Repository verification

`bun run check:fast` and `bun run check` both stopped at formatting in the three pre-existing raw sync documents: `docs/sync/full-notes.md`, `docs/sync/notes.md`, and `docs/sync/transcript.md`. Those files were preserved. No application code or browser behavior changed; no browser test or paid integration test is claimed. Research JSON and local document links were checked separately.
