# 0014 — Bound URL purchases across chat, Chrome and MCP

8 September 2026. Local implementation; live payment and deployment evidence remain separate.

## One purchase lifecycle

An arbitrary merchant URL is a durable purchase, identified by a `pur_` TypeID. Chat's `x402_fetch`, HTTP purchase routes, MCP's `froggy_x402_request` and Chrome's observed 402 request use the same coordinator. The existing curated service and oracle accounting remain available; a new URL purchase does not silently become a directory permission.

The purchase stores its owner, requesting connection, run, normalized request, caller ceiling, selected quote, approval ID, exact grant, payment state and bounded delivery result. Memory and Postgres expose the same owner-scoped contract. The database enforces a unique owner/idempotency-key pair; reusing a key with changed URL, method/body, preferred network or ceiling is a conflict. Status transitions compare the expected state. Approval transitions also compare the approval ID, so a delayed first-stage POST answer cannot authorize a later payment ticket.

GET discovery obtains a quote without paying. JSON POST first waits for consent to disclose its input, then sends the exact canonical JSON for a quote. A supported 402 creates a distinct payment approval. Input is at most 16 KiB; saved delivery is at most 64 KiB and tool output exposes at most 16,000 characters of seller text. No arbitrary authentication headers or cookies come from agent arguments.

The human's payment grant binds the actual origin, full URL and query, method/body, network, known token, recipient, units and quote signing parameters. A merchant's display resource URL cannot replace the actual request. Approval lasts five minutes. GET payment terms are refreshed before signing; changed terms need a new request. The coordinator follows no redirects, including same-origin redirects, for either quote discovery or paid delivery.

Every payment enters `WorkspaceSession.spend`. The request ceiling is $1 and purchases sharing a run have a $2 ceiling or the lower existing run budget, even when optional global limits are disabled. An exact human grant replaces only the otherwise missing allowlist/approval decision. Provenance, expiry, spending caps, run reservation, funding and the final policy check remain in force. Nested Hedera conversion receives the same run budget. The run and detached purchase belong to the server; a closed HTTP/MCP response is not cancellation.

## Owner authorization is consumed by one adapter

Base and Solana purchases use the authenticated person's Privy wallet after approval. The server verifies the access token's user ID against the workspace owner and resolves only that person's Privy embedded wallet for the requested chain. Owner signing passes `authorization_context.user_jwts` to Privy. It does not combine the JWT with the agent's authorization key or broaden a permanent merchant policy; wallet-level Privy restrictions still apply.

The EVM signer accepts one typed-data signing call. The Solana signer accepts exactly one transaction in exactly one signing call. Both consume their local signing capability before awaiting the provider, including a refused attempt. This is a single-use server adapter, **not a cryptographically purchase-bound or single-use Privy JWT**. The coordinator's durable claim, exact grant, pinned offer and policy checks provide the purchase binding. The access token is retained only by the active server operation and is absent from stored purchases, tool output and browser IPC. Redeemable payment proofs are not stored; the purchase keeps a proof hash for audit.

Only an authenticated owner route can create the missing Solana embedded wallet. Connected agents with `pay` scope may request purchases and read their own connection's results, but cannot approve, create wallets or change spending authority. The coordinator rechecks connection revocation before signing and before sending. Cancellation checks the purchase owner before touching the active operation.

## Explicit adapters and assets

The supported subset is x402 v2 `exact`: configured Hedera HBAR, Base USDC via EIP-3009, and Solana USDC. Base Permit2 and unknown assets/schemes are rejected. Canonical USDC identities live in the leaf domain package and were resolved from Circle's primary registry. Solana addresses preserve case; only syntactically valid EVM addresses are normalized to lowercase.

The payment package adds pinned `@x402/svm` 2.25.0 and `@solana/kit` 5.5.1. The wallet package uses the same Kit version with Privy's installed Solana signer adapter. The dependency declaration admits these SDKs only in the owning adapters; browser and wallet remain unable to import each other. Adapters are plain async TypeScript, while Effect Schema owns the wire contracts. No second schema library is introduced.

Solana signs a partially signed transfer transaction for the offer's facilitator fee payer; it does not broadcast from the signer. Validation rejects malformed fee payers, using the buyer as fee payer, unsupported assets and oversized memos before invoking Privy. The memo limit comes from `@x402/svm`'s `MAX_MEMO_BYTES` (256 in the pinned version). Readiness checks the canonical associated USDC token account. A missing account or insufficient funds is a setup failure, not permission to create a transfer on another chain.

Networks are configuration. Base defaults to Sepolia, Solana to devnet and Hedera to testnet in a fresh checkout. Mainnet settings do not bridge or convert funds between wallets. Hedera's existing authorized USDC-to-HBAR funding path is the only automatic conversion in this slice.

## Chrome keeps the seller session

Chrome observes capped real top-level GET 402 responses. Its replay is bound to a tab, navigation generation, full request URL and expiry. The payment header is injected into that one request only; it is never a global header. A stale navigation cannot consume it. The existing Chrome session retains its cookies, and the paid HTML renders in the original tab. Post-proof redirects are blocked, including same-origin redirects. Background requests, subresources and browser POSTs are outside this replay scope.

The browser worker knows neither the owner credential nor wallet signing APIs. Browser and wallet adapters meet only through the server's service composition. Seller text reaches agents as bounded untrusted data. The workspace's purchase result renders HTML as text; the shared Chrome remains the place where the original seller page runs.

## Payment and delivery are separate observations

Before handing authorization to transport, the coordinator atomically records that sending may begin. A timeout, process interruption or unknown exception after that point keeps the reservation and yields `uncertain`; absence of a reply is not evidence of no payment. No automatic repayment or refund follows. Failures proven to have sent nothing release the reservation. Stop after sending does not reverse a payment.

Payment `settled` means the seller returned a successful x402 settlement acknowledgement on the matching network. The transaction reference is seller-provided. This slice does **not independently prove the onchain transfer's payer, recipient, token or amount**. Delivery has its own HTTP status and result state, so an acknowledged payment with failed delivery is preserved as such. Chain/seller reconciliation is required before deciding whether uncertain work may be purchased again.

The local Pond Observatory seller writes one sale per payment proof and stores its outcome, including uncertainty and failed delivery. Replaying the same proof retrieves that sale rather than settling twice. Both payment and data fixtures are visibly marked as simulated. Public endpoint probes prove only a quote; local stub flows prove the coordinator and browser plumbing. Live owner signing, settlement and paid delivery require their own evidence. [The local demo guide](../X402_DEMO.md) records exact recipes and limits.
