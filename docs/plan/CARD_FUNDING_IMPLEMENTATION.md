# Saved-card browser purchases: implementation handoff

Updated 13 September 2026. This replaces the earlier speculative swap-and-password-manager plan. The accepted scope is existing **Base USDC → independently entered Linea address → saved card**, with owner approval and the existing hosted browser lifecycle. See [ADR 0034](../decisions/0034-saved-card-checkouts.md).

Verification results, limits and commands are recorded in [the verification report](../evidence/CARD_CHECKOUT_VERIFICATION_2026-09-13.md).

## Implemented locally

- Account → Payment methods: add, replace and revoke, write-only encrypted card details including demo CVC, masked metadata and observed balance. Owner-scoped TypeIDs, AES-GCM revision binding and separate credentials/checkouts tables.
- Browser purchase review and stages, server-calculated FX estimate/buffer/shortfall, exact Base debit and destination, expiring approval, explicit new review and owner issuer-reconciliation actions.
- A `bridge` trade through the existing reservation/authorization/submission/recovery machinery. Rules and agent credentials cannot authorize it. Saved method recipient/revision checks apply at the trading boundary.
- Uniswap `BRIDGE` and `/swap_5792` decoding, exact bounded allowance, Across deposit validation, Base simulation and independent Linea deposit/fill/transfer reconciliation with durable cursors.
- Hosted inspection without secrets, run-scoped credential bindings, disabled recording/sharing, current frame checks, worker-release handover, 3DS continuation without secret redispatch, and ambiguous-dispatch recovery without an automatic payment retry.
- Feature default off, Linea read-only configuration, loud synthetic funding/rates/outcomes, fixed order observations and card-number history redaction.

The runtime still needs the release checks below. Local code and stubs are not proof of a real purchase.

## Verified provider findings

Sanitized quote and call fixtures are in `apps/server/src/trading/fixtures/card-bridge-{quote,swap_5792}.json`. The addresses `0x111…111` and `0x222…222` are synthetic probe values, never product defaults. The route accepted an external recipient: 25,000,000 Base USDC units quoted 24,977,704 Linea units. The returned calls were USDC unlimited `approve` followed by Across `depositV3`. The implementation replaces the allowance with the exact debit and preserves the validated deposit bytes.

Verified contracts: Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Linea USDC `0x176211869cA2b568f2A7D4EE941E073a821EE1ff`; Base Across proxy `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64`; Linea Across proxy `0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75`. Primary sources are linked in the ADR. These are token/protocol addresses; the funding recipient is always entered by the user.

## Live-entry blocker

Two synthetic hosted probes used a controlled HTTPS checkout on `eu.httpbin.org` with an iframe on `httpbin.org`. The first fixture did not complete reliably. The corrected run `ccc31e5a-bd5c-432b-815b-22928e414bf6` found and focused the iframe password input (`activeId: card`, `activeType: password`). The server-side alias endpoint returned `no_focused_field`, leaving the field empty. This is **inconclusive for domain enforcement**, not an accepted security test. Both probe browsers were stopped. No real card credentials or wallet transactions were used.

Resolve the provider's iframe entry path, then prove both allowed-frame success and forbidden-frame denial, including navigation between focus and entry. Keep `CARD_CHECKOUT_IFRAMES_VERIFIED=false` until that evidence exists. No production feature enablement has been performed.

## Migration and Railway release

Migration `0028_serious_newton_destine.sql` creates `payment_methods`, `payment_method_credentials`, and `card_checkouts`. It belongs in the existing migration sequence; preserve subsequent unrelated migrations. Take a database backup before the normal release migration. The migration is additive; disabling the feature does not delete recovery records or reverse funding.

Existing Railway target: project `d6f4178e-fc21-4827-8347-20b1cec2aba4`, production environment `44c2247f-e0a2-43f8-9b46-586a29126157`, app service `393648df-65e9-4491-87f3-1b896c736b9f`.

Prepare a scoped release on current main with the required hosted-browser/trading prerequisites. The shared checkout contains substantial unrelated ongoing work; do not upload that whole directory as a card release. Run `bun run check:fast`, `bun run check`, `bun run e2e`, and the normal build/migration checks in isolation. Configure `CARD_VAULT_KEY` as a new secret 32-byte lowercase hex key and `LINEA_RPC_URL` as an HTTPS Linea read-only RPC. Preserve the vault key across deploys; changing it without re-encryption makes saved credentials unreadable. Set `LINEA_CONFIRMATIONS=2`. Verify configured Base mainnet RPC, sponsored Privy execution, Uniswap and Tenderly. Initially keep both feature flags false.

After all acceptance checks, enable `CARD_CHECKOUT_ENABLED=true`; enable `CARD_CHECKOUT_IFRAMES_VERIFIED` only after the cross-origin proof. No environment mutation, migration or deployment was performed by this implementation run.

## Remaining acceptance

The full controlled-checkout matrix must cover cross-origin entry, redirects, declines, a 3DS-style human takeover, changed totals, browser restart, revocation and leaked card echoes. Confirm keyboard access, responsive layout and absence of browser errors. The account payment-method UI and hosted lifecycle are covered by automated tests; they do not replace this end-to-end provider acceptance.

The user supplies the real checkout URL later and approves the exact purchase and debit in Froggy. Record the actual Base transaction, matching confirmed Linea arrival, observed merchant confirmation and user issuer-dashboard confirmation separately. Do not report the feature complete based on a quote, a stubbed test, or this handoff.
