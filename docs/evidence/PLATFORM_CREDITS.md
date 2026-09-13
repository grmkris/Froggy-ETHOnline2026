# Platform credits verification

Date: 2026-09-13

This record covers the platform-credit implementation. Historical per-resource HBAR payments do not establish that the new checkout works.

## Release isolation

The release starts at deployed source commit `661414402fb75e6fbd8b3779c2ab73d2aea9c108`. Credit changes were ported into an isolated checkout while preserving production's included research, scoped monitoring, email and hosted-browser features. The concurrent card-checkout, bridge, new watchlist resolver and Substreams wallet-alert work is excluded.

The credit schema is migration `0025_dear_bullseye.sql` on top of production migrations through `0024_pretty_black_knight.sql`. It adds four credit tables and three nullable task billing columns. Historical wallet money and sales are retained. The original shared checkout's migration 0027 was not altered or used as a release migration.

## Verified locally

- Domain, database and wallet package typechecks passed after the isolated foundation merge.
- Production baseline migrations plus credit migration 0025 applied successfully to a fresh dedicated local PostgreSQL database.
- 52 focused tests passed with 195 assertions: credit accounting in memory and through independent PostgreSQL pools, plus public discovery, retired anonymous routes and historical report replay.
- Funding proof/auth identity and transaction reuse, competing reservations, replayed results, caps and run budgets, cross-connection task keys, browser concurrency, uncertain holds and competing real/simulated funding claims are covered.
- Fresh signed and unpaid anonymous oracle/report requests return 410 without creating a sale. Previously recorded proofs still retrieve their saved result and transaction reference.
- A release scan found no concurrent card-checkout, card-store, wallet-stream, onchain-price or watchlist-resolver imports in the credit foundation and root integration files. `git diff --check` passed.

## Release gate and live evidence

`bun run check` passed with exit code 0: formatting, type-aware lint, all 12 package typechecks, tools and browser-test types, dependency graph, agent-file and name checks, package tests and Knip. The server suite passed 722 tests; its two existing database-dependent history/watchlist cases were skipped by Turbo's filtered environment. Credit-ledger and receiving-address PostgreSQL tests ran separately against the dedicated local database and passed across independent pools. No lint or boundary rules were weakened.

`bun run build` passed for both server and web. The complete isolated Playwright run passed 196 of 204 scenarios. Eight outdated label, funding-fixture and mobile interaction assertions were corrected; all eight passed in an 18-test rerun, along with ten unaffected repeated scenarios. This covered the local owner-only HBAR receiving flow, $1 funding, two paid web searches, 98 remaining credits after reload, one funding entry and two captures, and no per-tool wallet signing requests. Five independent external-merchant scenarios passed, preserving approval, delivery, rejection and cancellation coverage.

The [Wallet screenshot](platform-credits/wallet.png) records the local integration flow and clearly labels both credit funding and delivered work as simulated. It is not evidence of real chain settlement.

Live verification must establish the funding transaction, one-time credit creation, a tool reservation/capture, unchanged credit balance on replay, and the public UI/API journey. Pending funding must retain its original proof/transaction identity through recovery. Production migration state must be checked before applying migration 0025.

## Production preflight

Read-only checks on 13 September confirmed Base chain ID 8453 and Hedera mainnet in the deployed configuration. The treasury's ETH balance was 0x4e8daa5ceb4be3 wei. Its existing Privy policy already permits both supported `transferWithAuthorization` overloads only on the configured Base USDC contract, with the recipient fixed to the treasury and zero native transfer value; those rules expire on 30 September 2026. No policy was changed and no payment was signed by these checks.

The actual production migration journal matched the isolated source through migration 0024: the latest timestamp was 1789252565771 and its SHA-256 hash was `10b62ad8b70b1f61e3b02383998cb0ba9fe426c0a8386066ff069bb955f41fc6`. The preceding 0022 and 0023 hashes also matched. Recheck before deploying if production changes meanwhile.

The USDC adapter passed 11 tests with 53 assertions using a local JSON-RPC server and actual EIP-3009 signing. These establish exact receipt-leg matching, rejection of reverted or mismatched transfers, saved-byte resubmission, persistence before broadcast, and no replacement signature during recovery. They establish no mainnet settlement.

## Final payment review

The funding coordinator now rejects historical HBAR transfers, including a previously recorded sale presented with a rewritten x402 envelope. Twelve coordinator tests pass, covering new settlement, replay, missing or malformed decimal consensus timestamps and a verifier refusal racing an unknown mirror. Ambiguous evidence retains the purchase for recovery. The sales lookup passed memory and separate-pool PostgreSQL tests across every historical sale status.

At 02:29 UTC the production source still matched `6614144` and the migration journal still ended at 0024. No task payment or running task needed draining. One previously paid browser task was paused; six unpaid quotes had expired. Two older uncertain external wallet spends (a conversion and a merchant purchase) were left untouched. These historical records are neither retried nor converted to credits by the migration.

After this review, `bun run check` passed again, including 730 server tests and 218 wallet tests. Conditional PostgreSQL skips in the workspace gate were covered by direct database runs. The server build passed again with 3,131 bundled modules. The earlier browser verification remains applicable because the final changes affect live HBAR settlement and historical-sales lookup only.
