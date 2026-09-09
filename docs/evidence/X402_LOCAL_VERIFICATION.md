# Local x402 purchase verification

Verified on 8 September 2026. These results cover the local simulated checks, which did not make a live payment, policy update or deployment. The later owner-directed mainnet activation is recorded separately in [mainnet verification](X402_MAINNET_VERIFICATION.md).

## Source under test

The shared checkout was receiving unrelated trading work during implementation. Validation used an isolated worktree based on `b7025b3` with this task's changes copied in. It began at `/tmp/froggy-x402-review`. When the temporary filesystem filled, the unchanged snapshot moved to `/home/kristjan/code/ethglobal-online-2026/.froggy/x402-review`; Git metadata and internal dependency links were repaired and verified. Browser temporary files use `/home/kristjan/code/ethglobal-online-2026/.froggy/x402-tmp`. Only this task's files moved. Workspace package imports resolve to the isolated sources. External dependencies are shared, with fonts copied locally for Vite's filesystem policy. No Vite security setting was widened.

The implementation is also present in the shared checkout, whose final separate `bun run typecheck` passed. The complete gate and browser checks described here ran against the isolated x402 source; this evidence does not claim a complete gate for the concurrent trading changes. The isolated demo was served at `http://localhost:3400` with API port 3401. `/health` reported all six provider modes as `stub`.

## Completed checks

| Check | Result |
| --- | --- |
| `bun run check:fast` | Passed: formatting, lint and TypeScript. |
| `bun run check` | Passed: formatting, type-aware lint, TypeScript, dependency boundaries, agent files, names, all unit tests and Knip. |
| Unit suite inside the gate | 594 passed, 0 failed, 2 optional Postgres cases skipped. |
| Final focused coordinator/session/MCP/payment suite | 118 passed, 0 failed, 453 assertions. |
| `bun run build` | Passed for the final server and web source. |
| Disposable Postgres persistence checks | All 13 migrations applied; 21 tests passed, 110 assertions. |

The Postgres checks used a new `postgres:17-alpine` container with tmpfs storage and a random localhost-only port, then removed that task-owned container and verified removal. No existing database was touched. The opt-in command exercised `packages/wallet/src/persistence.test.ts` and `packages/wallet/src/ledger-postgres.test.ts` with `FROGGY_TEST_DATABASE_URL` pointing only at that disposable database.

Focused tests cover owner/connection isolation, exact grants, duplicate keys and approval races, two-stage POST consent, quoted refusal receipts, funded-network selection, pre-signing funding checks, quote changes, cancellation before and after sending, and receipt completion outside the latest 50 records. A seller's successful settlement acknowledgement with HTTP 500 remains paid with failed delivery; no acknowledgement remains uncertain and reserved. The final memory/Postgres regression also verifies that deleting an owner removes saved purchase inputs and results while preserving other owners and the spending ledger.

## Browser verification

The full Playwright run on dedicated ports 3600/3601, with two workers, finished with **105 passed, 3 total-duration timeouts and 3 skipped** in 11.6 minutes. The skipped cases followed the first failure in the serial purchase group. Traces showed cumulative page navigation/reload time consuming the 30-second total limit in purchase persistence, settings deletion and theme persistence. A single-worker rerun passed all four purchase scenarios. Only the multi-navigation purchase test received an explicit 60-second total budget; its assertion deadlines are unchanged. The unchanged settings deletion case passed against the final store source with a 60-second CLI total budget. Theme persistence also passed unchanged with that budget in 45.2 seconds after the disk fix. All 111 distinct scenarios therefore have passing runs across the full run and focused follow-ups; the original full command's failed result is retained rather than described as a clean pass.

An earlier isolated attempt was stopped because Vite rejected fonts outside the isolated root; its results are not counted as a pass. The dependency setup was corrected without changing Vite security settings or application behavior. Later reruns exposed Chromium `ERR_NETWORK_CHANGED` and `ERR_INSUFFICIENT_RESOURCES`. A direct disk check found `/tmp` at 100% with zero available bytes, and the shell also failed to create a temporary file. Relocating the task snapshot and setting `TMPDIR` on the workspace disk resolved the final theme failure. No product assertions were removed.

Native Chrome checks also exercised the original-session report replay, retained cookies, one-use request binding and a blocked redirect after payment proof.

A separate complete HTTP MCP check against `http://localhost:3400` passed: an OAuth connection with explicit `pay` scope requested the demo report, the owner clicked **Pay once** in Froggy, and `froggy_x402_status` returned completed/settled/delivered with HTTP 200 and a simulated receipt carrying an `allow_once` approval. Reusing the key before and after approval kept exactly one purchase and one receipt. Another pay connection received not found; a services-only connection was refused. Browser page and console errors were empty. Cleanup left no pending tickets and revoked all three validation grants.

The final manual purchase on the running `http://localhost:3400` demo also passed at 320px. Wheel scrolling exposed **Pay once**; approval delivered the report and persisted a simulated receipt with settlement evidence. Desktop and mobile screenshots were inspected. Browser page/console errors and pending requests were both zero. After the owner requested real mainnet operation, this task-owned simulated demo was stopped. Use the production origin and mainnet instructions in [the purchasing guide](../X402_DEMO.md).

To restart that prepared snapshot after stopping it on this host:

```bash
cd /home/kristjan/code/ethglobal-online-2026/.froggy/x402-review
TMPDIR=/home/kristjan/code/ethglobal-online-2026/.froggy/x402-tmp bun run demo
```

## Live checks still required

Simulated signatures and unpaid public 402 probes do not prove live Privy owner signing, onchain Base/Solana/Hedera settlement or public seller delivery. Follow [the demo guide](../X402_DEMO.md) for exact local prompts, real supplier URLs and wallet prerequisites. A settlement acknowledgement is reported as such; it is not independent verification of a transfer's amount or recipient.
