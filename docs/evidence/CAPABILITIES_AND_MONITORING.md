# Capability and monitoring verification

Date: 2026-09-13

The release is prepared in `/tmp/froggy-monitoring-release` from the deployed workspace and research baseline. The original shared checkout and its ongoing wallet-stream implementation remain preserved.

## Behavior

- One `--all-tools` OAuth flow requests the supported capability catalogue. Existing grants retain their scopes; only the human can consent or change a monitoring budget.
- Email reads and rendered attachments recheck permissions after asynchronous work, including waits and revocation during rendering. No email sending or approval tool is introduced.
- Saving a product, trip, link or token offers monitoring setup or an explicit save-only exit. Cadence, exact context and condition are chosen by the owner.
- Monitoring reserves at most $1 per check under an owner transaction lock. The first observation establishes a baseline; subsequent matching transitions can notify the owner. Currency or provider-mode mismatches cannot produce misleading price alerts.
- Pause is checked before payment signing. Failed observations cannot become baselines, and ambiguous payment evidence retains its reservation. Confirmed payment receipts still count when secondary sale recording fails.
- Browser handoff retains the same paid task. Execution status and the reported task goal outcome are shown separately.

## Verified locally

- `bun run check` passed on the isolated implementation: format, type-aware lint, all project typechecks, boundaries, agent/name checks, 1,328 package tests, and unused-code detection. Tests requiring externally configured databases remain explicitly skipped by that default gate.
- A separate real PostgreSQL run applied migration 0024 to a fresh local database and passed 28 ledger, persistence and watchlist tests (135 assertions). Two connections claim only one check and reservation. Migration 0024 adds only `monitoring_accounts`.
- Targeted regressions verify revoked email grants, attachment conversion, no automatic grant expansion, baseline/alert transitions, cap enforcement, quote signing concurrency, pause before signing, and accounting after a sale-write failure.
- The full isolated browser suite passed: 196 tests, zero failures. Mobile/desktop monitoring scenarios check console/page errors, overflow, exact item context, budget, pause, persistence and archive. The release then merged hosted-browser commit `12de97d`; checks of the combined result are recorded below.

## Live acceptance

A new external-agent email signup needs a human OAuth consent containing email-read permission. A live monitoring check needs the human's chosen monthly budget. Local simulated-provider checks are not evidence of a live signup, real monitor charge, or Telegram delivery.

## Combined release checks

- After merging hosted-browser commit `12de97d`, `bun run check` passed with 1,361 passing package tests and no failures.
- `bun run build` passed.
- All 29 browser tests affected by the merge passed, covering hosted progress and task outcomes, browser handoff, purchase flows, monitoring, saved items and agent connection instructions.
- The separate full 196-test browser run passed before the hosted merge. A local simulated run is not evidence of a live external email signup or a paid monitor observation.
