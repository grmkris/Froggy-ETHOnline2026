# x402 purchases from chat, Chrome and connected agents

Requested 8 September 2026. Implement a purchase the person can try from all three surfaces, with explicit approval for a new merchant and a receipt that distinguishes payment from delivery.

## Product contract

- Froggy chat, Claude Code over MCP, and the shared Chrome use one purchase coordinator. Curated services keep their existing customer/supplier accounting.
- A purchase has a durable TypeID, request fingerprint, spending ceiling, selected offer, approval, payment state and bounded result. Retrying its key returns that purchase; a changed request cannot reuse the key.
- Unknown merchants create a human approval ticket. **Pay once** authorizes the exact origin, resource, method/body, recipient, chain, token and amount. It never adds permanent agent signing privileges. Existing directory permissions remain available and must match the merchant's actual payment parameters.
- Every payment still passes `WorkspaceSession.spend`, with reservation before signing/sending. A purchase ceiling applies even when optional global spending limits are disabled. Stop, refusal, expiry and disconnect are exercised.
- EVM and Solana purchases that need the person's authority use only the authenticated person's approval and wallet. Owner credentials remain in memory for that purchase, never in a stored purchase, tool output or browser worker. Existing wallet-level restrictions remain effective.
- The browser detects actual x402 HTTP 402 responses. The first supported replay is a top-level GET in its original tab/session. Page prose cannot authorize payment. Unsupported background/POST browser requests are reported honestly; API purchases support bounded JSON POST requests.
- Base USDC, configured Hedera and Solana USDC use explicit adapters and known assets. An unsupported scheme, missing wallet or insufficient funds produces an actionable result. Network funding is separate from selecting an x402 offer.
- Demo responses and receipts are visibly marked when providers are stubbed. Live provider claims require live evidence; an unpaid probe proves only a quote.

## Work sequence

1. Harden outbound HTTP and protocol parsing: streaming byte limits, bounded challenges, explicit v2 decoding, no cross-origin payment redirects, and explicit EIP-3009 enforcement. Preserve ambiguous post-send outcomes.
2. Add purchase contracts and persistence in memory/Postgres, exact human grants, request/offer fingerprints and atomic status changes. Recheck current policy and the approved quote before sending; persist a sent state before handing payment authorization to a transport. Never blindly repay uncertain work.
3. Implement the coordinator, known-asset offer selection and wallet adapters. Persist results for retrieval and reconnects. Keep settlement, delivery and application errors distinct. Do not expose a general signing/approval tool.
4. Connect request/status API routes and MCP tools with OAuth scope and owner checks; add chat tools that purchase and retrieve the same records. External agent disconnects and duplicate calls must not start another purchase.
5. Add capped Chrome 402 discovery and request-local replay over worker IPC. Keep human input and screencast acknowledgements working while approval waits. Bind replay to tab, navigation generation, URL and expiry; reject stale replay.
6. Add the approval/result UI, wallet readiness and a small demo entry point using existing components and tokens. A person can find an external agent's pending purchase, approve it, and inspect its receipt/result without watching that agent.
7. Add a deterministic demo seller with a free landing page and a paid report, plus documented real supplier URLs and exact Froggy/Claude Code prompts. Probe real endpoints without payment and record supported networks/requirements.
8. Run focused money/transport tests, the complete repository gate, builds and Playwright flows for chat, Chrome and MCP. Boot the app, inspect browser errors, exercise approval/decline/replay, and leave a runnable local demo with directions.

## Required scenarios

- New merchant -> ticket -> Pay once -> one payment -> useful result and receipt.
- Decline/Stop -> no signature and no paid retry; another agent cannot approve.
- Reload while awaiting approval -> the same purchase remains discoverable.
- Same idempotency key -> same purchase/result; changed payload -> conflict.
- Changed quote/recipient/origin -> old permission cannot authorize it.
- Browser navigation during approval -> stale request cannot be paid.
- Browser payment -> original seller page renders in the existing Chrome session.
- MCP caller gets an awaiting-approval purchase and later retrieves its result.
- Unsupported chain/scheme/asset and unfunded wallet -> clear next action.
- Response timeout after authorization leaves -> uncertain, reserved, no auto-repay.
- Concurrent purchases respect the task/purchase budget.

## Delivery and live activation

The owner clarified on 8 September 2026 that the deliverable must work with real mainnet payments. The combined deployment now includes URL purchases, browser approvals and the purchase migration. Activate and verify Base, Solana and Hedera mainnet configuration, preserve the existing wallet policies, and exercise a real owner-approved purchase. The signed-in person supplies the exact purchase approval; neither an agent nor a stored app credential substitutes for it. Keep local stub checks as development evidence, and record live readiness and actual transaction evidence separately.

## Progress

- [x] Current implementation and x402 provider documentation reviewed.
- [x] Product contract and implementation sequence written.
- [x] HTTP/protocol hardening with bounded bodies/challenges, v2 scheme checks and no paid redirects.
- [x] Durable purchase and approval coordinator: persistence, exact grants, cancellation and idempotency verified. Final focused checks passed 118 tests; cancellation drains active work through its receipt, including purchases beyond the visible history limit.
- [x] Wallet/network adapters: configured Base and Solana USDC, Hedera, owner-authorized single-use signing and focused tests. Live funding/signing remains unverified.
- [x] Chat, API and MCP purchase/request status integration with pay scope and connection ownership checks; keyless chat recognizes the same-origin demo report URL, and general chat interpretation requires a configured model.
- [x] Chrome top-level GET discovery/replay, original-session rendering, stale navigation rejection and request-local proof tests; native local stub purchase exercised.
- [x] Approval/result UI, wallet readiness and demo seller implemented; seller idempotency/uncertainty tests and native stub report exercised.
- [x] Full verification and runnable handoff: [local demo guide](../X402_DEMO.md), [unpaid supplier probes](../evidence/X402_DEMO_PROBES.md) and [local validation evidence](../evidence/X402_LOCAL_VERIFICATION.md) written. The isolated fast gate, full gate and final build passed, with 594 unit tests and 21 disposable-database tests passing. All 111 browser scenarios have passing runs across the full suite and focused follow-ups after test-budget and temporary-disk issues; the evidence records the original failures explicitly. Complete HTTP MCP purchase/approval/status behavior also passed.

- [x] Real mainnet activation requested by the owner; purchasing code deployed and Base/Hedera mainnet offers observed. Solana mainnet configuration set and read back.
- [ ] Live owner-approved purchase, onchain confirmation and paid delivery recorded.
