# Capability and monitoring implementation — local verification

Date: 2026-09-13

This is local verification with explicitly simulated external providers. It is not evidence of live delivery or a live monitor charge.

The CLI now accepts `--all-tools` to request every permission in the supported OAuth catalogue through one human consent screen. A smaller `--scopes` selection is validated against that same catalogue. Existing grants and spending limits are unchanged. The generated agent connection instructions request this simpler flow.

Email, watchlist and monitoring tools are registered in the real tool collection. Tool execution rechecks the initiating connection, including revocation. Delegated browser, email and unattended monitoring tasks use Froggy's tool-enabled executor. Task goal outcomes are distinct from execution termination.

Saving products, trips, links and discovered tokens opens monitoring setup with an explicit save-only exit. The human chooses a shared monthly budget, cadence and condition. Item edits invalidate old comparisons. The UI reports pending reservations, current-month charges, status, observations and check history; login or CAPTCHA can hand back control without purchasing the check again.

## Verified locally

- 43 targeted backend tests passed across capabilities, monitoring, actual tool registration/execution, scheduling, paid tasks and generated connection instructions.
- A structured token monitor completed a simulated purchase, stored its baseline, observed a later synthetic price drop, notified once, and reconciled twice without another charge. Unknown currencies and changes between simulated and live markers cannot generate misleading price alerts.
- Two PostgreSQL connections against an isolated local database claimed one monitoring check and one reservation; owner isolation and durability passed.
- 23 browser tests passed with two workers, including mobile/desktop monitoring, save-only and token saves, connection clipboard recovery, and theme/navigation checks. Browser error assertions are included in the changed flows.
- The standalone CLI bundled successfully; an unsupported permission was rejected before contacting an OAuth server.
- Targeted type-aware lint passed. A broader browser run had 194 passing tests, three failures and two unrun tests; the affected connection-copy and theme cases passed in the subsequent targeted run.

## Release status

The checkout also contains concurrent hosted-browser and wallet-stream integration work. Repository-wide `check` / `check:fast` have not passed; their latest failures involve formatting and changing wallet-stream integration code. Do not treat this document as a deployment approval or a clean full-repository gate.

This implementation has not been deployed, and the monitoring migration has only been applied to an isolated local test database. The live Notion signup retry and a real monitoring observation/alert remain unverified. A live delegated signup needs a fresh OAuth grant containing email-read permission; live monitoring needs the human's chosen monthly budget.
