# 0042 — Credits have one mode

Date: 2026-09-13

Status: Accepted and built. Supersedes the "Real and simulated funding cannot share an account" paragraph of [decision 0033](0033-platform-credits.md).

## Decision

A credit is a credit. The ledger no longer partitions an account into simulated and real: the `stubbed` flag leaves credit accounts, charges and ledger entries, the `credit_mode_mismatch` refusal is gone, and funding no longer has to match an account mode. Any confirmed credit can be spent by any task.

One marker stays, on the purchase: `CreditPurchase.stubbed` says that a purchase was settled by the local stub rail, which exists only on a loopback `APP_ORIGIN` (production refuses a stub adapter at boot). It is a fact about how that payment happened and is shown on that purchase alone. The funding-method markers (`funding[].stubbed`, `HederaReceiving.stubbed`) describe adapters, not credits, and stay. Service and browse results keep their own `stubbed` markers, so a fixture result still says it is one.

Credits the operator issues are a first-class ledger kind, `grant`: one entry with a note, no purchase, written under the account lock by `bun run credits:grant -- --owner <did> --credits <n> --note "<why>"` (`apps/server/src/grant-credits.ts`). On Railway the script runs inside the app container through `railway ssh`. A grant is the only way credits come into being without an x402 settlement; the wallet's activity list shows it as "Granted" with its note.

## Why

The owner's ruling: two kinds of credit made a double flow that nobody asked for, and the production account got stuck in the wrong half. On 13 September a test-only helper, `fundTestCredits`, was run against the production database to top the owner up with 2000 credits. It writes a fake `hedera:testnet` purchase straight into the store, past the funding coordinator's refusal of simulated settlement off loopback, and the account latched to simulated. Production's browser is live, so every real browse task was refused with `credit_mode_mismatch`, and a real USDC purchase would have been refused at claim time for the same reason. The mode existed to keep a faked payment from buying real work; it cannot fire on production, where stub rails are refused at boot, and on a loopback build the operator is the one paying.

The fixture now throws unless `NODE_ENV` is `test`, which Bun sets under `bun test`. Balances on production come from x402 settlement or from `credits:grant`, never from a fixture.

## What stays loud

The stub discipline is unchanged where it matters: `/health` names every adapter's mode, the wallet shows a chip per stubbed integration, a purchase paid on a local stub rail carries its own marker, and a service or browse result produced by a fixture says so. Root `AGENTS.md`'s rule that every receipt a stub touches carries `stubbed: true` still holds: the receipt for a stub-rail payment is the purchase. Charges and ledger entries are internal accounting, not receipts of an integration.

## Migration and wire

Migration `0032_credits_one_mode` drops the three columns. It runs as Railway's pre-deploy step while the previous container still serves, so credit reads on the old code fail for the seconds until the new container takes traffic; deploy at a quiet moment.

`CreditSummary` keeps `v: 1` and loses a field. A browser tab still holding the previous bundle decodes `/api/credits` strictly and fails until it reloads. Saved `credits_balance` tool outputs that carry `stubbed: true` still decode, because excess keys are ignored.

## Production repair

The fixture purchase (`01a09a66-7bd4-7779-b169-b6056684966f`, transaction `test-fixture:ctp_01m2d6cyymexwv2tdp0nk895kf`) and its funding entry were deleted, its 2000 credits subtracted, and 2000 credits granted with a note, so the balance is the same and the ledger says where it came from. The raised limits and the refused browse charge stay as history. Evidence is in [PLATFORM_CREDITS.md](../evidence/PLATFORM_CREDITS.md).
