# Cloud browser integration — local verification

9 September 2026. This records local integration evidence, not a production release or a live Browser Use payment.

Implementation decisions and release prerequisites are in [decision 0016](../decisions/0016-paid-cloud-browser.md).

## Exercised locally

- Cloud API fixtures cover exact user-profile isolation, profile creation, provider URL validation, response-size bounds, redacted errors and stop/delete contracts.
- Task tests cover invalid budgets, frozen quotes and expiry, the exact browser-card challenge, duplicate signing, concurrent payment-proof replay, uncertain settlement and exhausted-allowance resume without another purchase.
- Approval-clock tests exclude overlapping human waits once, independently for each owner.
- Workspace tests verify Cloud idle expiry despite an open viewer, and explicit lease extension.
- Cost-accounting tests distinguish missing provider reports from known hosting charges and prevent duplicate reports from double-counting.
- Budget-card Playwright fixtures verify that quoting never signs, explicit payment starts one task, and uncertain outcomes remove the purchase action.
- Viewer Playwright fixtures verify owner authentication, the restricted sandbox, inert input during agent/stopping states, keyboard input after takeover, Keep open, and preservation of the same page on Resume. The embedded HTML is a fixture; this does not establish compatibility with Browser Use's actual viewer.
- The 11 related budget, URL-purchase, startup and stop Playwright tests pass. The separate Cloud-viewer Playwright test passes.

## Native CDP evidence

Run `bun tools/spikes/cloud-cdp-check.ts` with local Chromium installed. It creates an isolated temporary profile, launches its own Chrome and local HTTP fixture, and cleans both up. It uses the production Cloud adapter with a fixture provider API, without provider or wallet credentials.

The probe exercised:

1. Navigation and bounded snapshots over a multiplexed browser CDP connection.
2. A native popup returning to its original `window.opener`.
3. Agent-input refusal during human ownership, followed by Resume.
4. Observation of the first top-level GET 402.
5. Replay to a 200 response with the fixture payment-response header.
6. No payment proof on a subresource or redirect. Redirect replay stops at 302.

This proves the local CDP transport path. It is not evidence of a live facilitator settlement, provider profile persistence, provider cancellation semantics or provider billing.

## Whole-checkout gates

The release verification on 9 September passed `bun run check` and `bun run build`. A full Playwright run had 130 passing tests and five failures, mostly overall test timeouts, while other builds were active on the host. All five passed when rerun with one worker and a 60-second overall deadline (`--last-failed --workers=1 --timeout=60000`). The combined run covers all 135 browser tests; this is not a claim of a single clean full run.

All migrations also applied to a fresh, isolated PostgreSQL 17 database. The persistence, ledger and history contracts passed: 43 tests, no failures, including the PostgreSQL history tests omitted without a configured test database.

Further concurrent trading edits require the release gate to be repeated before committing them. The release status is recorded separately from this integration evidence.

## Production status and remaining gate

The Railway production `app` service still reports no `BROWSER_USE_API_KEY`; the browser provider remains the local default. No Cloud deployment or live browser purchase was made by this change.

To complete the release:

- Add the server-only Browser Use key and credits through the provider and Railway dashboards.
- Configure verified input/output rates for Froggy's configured model using `BROWSER_MODEL_INPUT_USD_PER_MILLION` and `BROWSER_MODEL_OUTPUT_USD_PER_MILLION`.
- Verify the actual hosted viewer under the current sandbox. If provider storage needs a broader sandbox, review that concrete requirement before changing it.
- Verify real Cloud session creation, reconnect, login/profile persistence, expiry, insufficient credit and uncertain API outcomes.
- Verify one real browser-triggered x402 purchase with the unlocked page and matching receipt, plus rejection, stale navigation and redirect isolation.
- Deploy to the existing Railway service with its pre-deploy migration command, check `/health`, and repeat the real provider flow before making Cloud the default.

Browser execution uses the agreed Froggy/CDP fallback. Managed Browser Use execution has not passed its live control/interception gate and is not enabled.

Dashboard and environment instructions: [Cloud browser setup](../CLOUD_BROWSER_SETUP.md).
