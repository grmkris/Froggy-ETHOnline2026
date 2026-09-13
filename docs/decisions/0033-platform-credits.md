# 0033 — Platform credits funded through x402

Date: 2026-09-13

Status: Accepted for implementation. Live verification is recorded separately.

## Decision

Froggy tools consume an internal, nontransferable credit balance. The owner buys credits through x402 using USDC on the configured Base network or native HBAR on the configured Hedera network. 100 credits equals $1. One branded `CreditUnits` is one USD micro, or 1/10,000 of a credit; wallet money keeps its separate brands and ledgers.

Accounts begin at zero. Existing wallet balances and historical sales are preserved as money and history; there is no inferred conversion or starter grant. Numeric existing wallet caps initialize independent credit limits once, otherwise the defaults are $2 per task and $10 over a rolling 24 hours. Credit authority has its own expiry/frozen state and does not inherit wallet signer expiry.

Only the authenticated owner can buy credits or update credit limits. OAuth agents and connection tokens use an existing owner balance within their granted scope. No tool changes funding or spending authority. External merchant payments, token transfers and trading principal continue through the wallet's existing authority and accounting boundaries. Upstream provider costs are platform expenses, not additional customer wallet charges.

## Receiving native HBAR

A new owner can prepare a Privy receiving key and public Hedera alias before an account number exists. Compare-and-set storage retains one canonical key across concurrent preparations using existing user custody columns. Preparation moves no money, converts no USDC and grants no credits. The owner funds the alias externally; the payer resolves its numeric Hedera account before signing the credit purchase. Historical custody remains recoverable after a workspace reset.

## Durable accounting

Four normalized PostgreSQL tables hold credit accounts, append-only ledger entries, funding purchases and task charges. Account row locks serialize same-owner reservations across processes. A task and its quoted reservation are created atomically; an idempotency key is unique per owner and cannot be reused by another connection or different request. Browser exclusivity and scheduled-run budgets are checked inside that lock.

Successful work captures the reservation. Failure or cancellation releases it. Unknown outcomes remain reserved until evidence resolves them. All held reservations count toward rolling limits regardless of age; captured work counts from its capture time. Monitoring's first successful observation captures its initial reservation; each later paid observation reserves its own durable task.

Funding quotes freeze their terms and expire. The payment proof hash and authorization identity are globally unique and claimed before settlement. Transaction identity is unique per network. Signed EVM transaction bytes, hash and nonce are durable before broadcast; HBAR recovery reuses the exact stored signed proof. Confirmation and the single credit ledger entry are atomic. Recovery reads chain evidence and never signs a replacement payment for an uncertain purchase.

Real and simulated funding cannot share an account. An atomic proof claim selects the funding mode before settlement; a task's service mode must match its funded account. Zero balances are not labelled simulated merely because a new account exists.

## Public migration

Anonymous per-resource selling is retired. New oracle/report purchases and legacy key-holding MCP bundle downloads return HTTP 410 with sign-in, Wallet, authenticated MCP and skill links. Historical sale ids and recorded proofs still retrieve stored results and settlement references. Discovery lists authenticated funding and tools; it publishes no generic payable resource offers because a funding quote belongs to a specific owner purchase.

The runtime and committed agent skills, CLI, API, catalog and Wallet UI use the same credit terminology and units. Buying credits is a separate owner checkout; task submission is direct and idempotent.

## Verification

The ledger is tested in memory and against PostgreSQL through independent connection pools, including racing funding claims, globally reused authorizations, duplicate transactions, reservation overspend, result replay, connection isolation, run budgets, uncertain holds and mode isolation. Payment coordinator and SDK adapter tests exercise saved proof recovery. Public-route tests assert that a fresh signed request cannot create a sale, while historical reports remain readable.

Unit tests and simulated checkout are not live payment evidence. Deployment verification must separately record actual chain settlement, one-time crediting, a tool debit, retry behavior and the public UI/API journey.

## Historical payment replay

HBAR funding accepts only matching ledger transfers whose decimal consensus timestamp is at or after the purchase quote. A network/transaction lookup against every historical sale status prevents a tool payment from also purchasing credits, even when the surrounding x402 envelope changes. Missing or malformed timestamps and verifier refusals with an unknown mirror remain uncertain: a second recovery worker may already have submitted the same transaction. Recovery never replaces the signed payment.
