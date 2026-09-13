# Hosted browser implementation evidence

2026-09-13. Implementation validated with real Browser Use V4 calls. The compatibility tests below did not change production configuration. See the release verification section for the isolated production candidate.

## Live compatibility

The test exercised the shipped `HostedBrowseJob`, `Services.createBrowser`, `CloudBrowser`, profile store, CDP adapter and wallet bridge. Browser Use credentials were read in memory from the existing Railway service. The test used a temporary owner/profile, local in-memory task/sale records, a $0.10 total model allowance and a refusal-only wallet handler. It did not sign or send a transaction, use a customer wallet, log in to websites, or purchase a service onchain.

| Check | Observed result |
| --- | --- |
| Blank-browser bootstrap before the task | Passed; two runs in the compatibility case |
| Wallet injection after navigation/reload | `eth_chainId` returned configured Base Sepolia `0x14a34` |
| Wallet bridge reply and page attribution | `eth_requestAccounts` reached Froggy with `https://example.com` origin and returned `4001` |
| Task completion | Compatibility task finished in 31.444 s, provider model cost $0.006296 |
| Take control during a live run | Working → Handing over → Human; browser control independently read as `human` |
| Continue | Third run reused the task/session and cumulative allowance |
| Final page after continuation | Froggy's browser state independently reported `www.iana.org`, title `Example Domains` |
| Handover task total | 40.316 s including human handoff; three runs, provider model cost $0.006765 |
| Cleanup | Both test browsers confirmed stopped; both temporary profiles deleted |

The handover status was observed at 19.321 s and human control at 21.842 s. These are polling observations, not exact worker-release timestamps. A prior navigation check could not independently verify the final IANA page because the task finished back on Example Domain; the final controlled test required leaving IANA open and verified it from Froggy's browser state. An initial harness omitted the wallet-chain option; it was corrected before the wallet compatibility assertions were accepted.

The JSON evidence contains only sanitized results, phases and public test origins. Raw events, browser viewer/CDP URLs and credentials are excluded. Model costs exclude browser/proxy hosting. No speed advantage over the legacy harness is claimed.

## Local verification

Lifecycle tests cover confirmed handoff, continuation cost, ambiguous POST recovery, restart recovery, force stop, expiry/reconnect, expired capacity release, a disconnected bridge, unexpected browser replacement, bounded redacted activity, scoped approval cancellation, financial reconciliation and owner/version checks. Quote tests cover concurrent signing and preserved ambiguous reservations. Provider/browser tests cover request caps, rate-limit backoff, response validation, V4 shutdown confirmation and refusal to silently replace an expired session.

Mobile Watch live surfaces pending approvals through a Review approval action that returns to the existing approval controls. The task request key preserves the card across viewer remounts; the legacy executor also continues receiving polled results.

Browser tests exercise the task card at 1440 px and 390 px, reduced motion at 320 px, retained history scrolling, stale/reconnect states, cross-route Watch live, expiry/reconnect, deduplicated completion and chat availability. Screenshots were inspected; the duplicate quote-tool Done heading was removed so the card owns the visible lifecycle.

Initial shared-checkout verification:

- Full browser suite: **199 passed**. Following the final remount/approval changes, the focused browser/budget/purchase suite was rerun: **11 passed**.
- Focused backend/browser/state regression suite: **120 passed**, 568 assertions, 13 files.
- TypeScript: **12 workspaces passed**, plus tools and e2e projects.
- Type-aware lint for the browser runner, adapters, task/payment routes, browser components and affected tests: passed.
- Dependency graph and agent-file checks: passed. Whitespace diff check: passed.
- `bun run check:fast` and `bun run check`: attempted; blocked at formatting by 39 files in concurrent monitoring/watchlist work and shared integration files. No rules were disabled or unrelated edits reverted.
- Full package test run: server package reported 701 passing, two database-dependent skips and one OAuth metadata expectation failure due to additional scopes in concurrent work. The other 19 package tasks passed. The focused browser regression suite above passed after the final changes.
- Knip: remaining unused exports/types are in concurrent capabilities, monitoring, wallet-stream/activity and watchlist code. The browser work has no remaining reported unused exports.

The initial shared-checkout gate was blocked by concurrent work. The isolated release below resolves that blocker while preserving the already deployed features.

Reviewed captures use explicit simulated task data: [desktop](hosted-browser-2026-09-13/task-1440.png), [mobile](hosted-browser-2026-09-13/task-390.png).

## Release verification

The release is based on production commit `0608dbd`, preserving its navigation, Inbox, shared Watchlist and included market research. Hosted browser changes were isolated from unfinished monitoring and wallet-stream work in a separate checkout. The optional monitoring outcome field is excluded from this release; task results retain their summary and error states. No database migration is added.

- `bun run check:fast`: passed.
- `bun run check`: passed, including type-aware lint, 12 TypeScript workspaces, package boundaries, agent files, naming checks, all 20 package tasks and Knip. Database-dependent tests retain their explicit skips.
- `bun run build`: passed.
- Browser suite: 195 passed on the first run; the theme-switching assertion and trading-route teardown scenario both passed on an isolated rerun (2 passed). All 197 scenarios were validated. Hosted browser, budget and purchase scenarios passed on the first run.
- `git diff --check`: passed.

Production has no `BROWSE_EXECUTOR` override, so this release retains the `legacy` default. The progress UI and hosted implementation can be deployed without activating the hosted financial path.

## Rollout gate

`BROWSE_EXECUTOR` remains `legacy`. A real Privy financial approval/payment and denial through this new executor remains a prerequisite to enabling hosted browsing in production. The browser compatibility/refusal tests above do not substitute for that financial verification.
