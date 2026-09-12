# Browser wallet: implementation plan

Status: **planned, not started.** Written 12 September 2026 against `main` at `0348bd27f1b683ee157151b5a5bbd2ecb00f082a`. Research and evidence levels are in [`docs/research/BROWSER_WALLET.md`](../research/BROWSER_WALLET.md); the decision is [ADR 0024 (proposed)](../decisions/0024-browser-wallet-provider.md). Nothing below has run; every test named here is planned (evidence level L5) until a commit records it.

## One sentence

A dapp open in the shared Chrome finds a wallet called Froggy, its requests travel over the CDP socket Froggy already holds, and the person approves and signs in Froggy's own app with their own key while the agent can neither answer nor sign.

## Scope of release 1

In: EVM only, one configured chain (`EVM_NETWORK`), EIP-6963 discovery plus a non-clobbering `window.ethereum`, connection per origin with revocation, bounded reads, `eth_sendTransaction`, `personal_sign`, `eth_signTypedData_v4`, human approval in the web app, owner signing in the web app, server broadcast, durable request record, receipts, loud stub.

Out: the MV3 extension (gate 3), iframes/OOPIFs (refused, not silently ignored), `wallet_addEthereumChain`, `wallet_sendCalls`, `eth_subscribe`, delegated agent signing for dapps, Hedera and Solana methods, mainnet before the testnet evidence row exists, x402 or trading changes.

## Invariants this plan must keep

- `packages/browser` never imports `packages/wallet` and the reverse; the bridge emits and receives wire-typed messages and knows nothing about keys. The two meet in `apps/server/src/services.ts` (imports) and `apps/server/src/workspaces.ts` (lifetime).
- `packages/domain` stays a leaf: `WalletRequest`, its status machine and its decode rules carry no transport.
- No tool changes spending authority; no tool can answer a wallet card or touch a `WalletRequest` other than reading receipts.
- Every wire message carries `v` and is decoded with Effect Schema. No Zod.
- A run belongs to the server; a closed tab or socket does not cancel a request that has reached `approved`.
- Every request outcome, including refusals and undeliverable replies, produces a receipt; every stubbed path marks `stubbed: true`.
- Page-supplied data is `page` provenance. Only the person's answer to the exact card lifts a request past the provenance gate, and only for that request.
- The standing agent signer gets no rule for dapp kinds. There is no automatic fallback from anything to owner credentials.

## Architecture

```
dapp page (MAIN world)                hosted Chrome                    Froggy server                        person's browser (Froggy app)
──────────────────────                ──────────────                   ─────────────                        ─────────────────────────────
FroggyProvider.request()  ─binding──▶ Runtime.bindingCalled ─────────▶ WalletBridge (packages/browser)
                                                                        └─ BrowserWalletRequest (protocol) ─▶ WalletRequests (apps/server)
                                                                                                             ├─ authorize gate, decode, nonce
                                                                                                             ├─ InteractionRegistry.park ───────▶ ApprovalTicket (wallet variant)
                                                                                                             │                                   ◀─ approval.resolve + signed payload
                                                                                                             ├─ record signed identity, broadcast
__froggyDeliver(id, result) ◀─Runtime.evaluate{contextId}─ WalletBridge ◀─ BrowserWalletReply ◀──────────────┘  receipt.appended
```

The bridge is a per-tab observer next to `PaymentNavigation`, created in `TabRegistry.adoptTab` before `view.ready()`. It never awaits a human inside a CDP command; it publishes a request and later receives a reply through `BrowserHandle`.

## Work plan

Each milestone is a set of small sequential commits on `main`, each green under `bun run check:fast`, with `bun run check` before the milestone is called done. Files are listed so the diff can be reviewed against the boundary rules.

### M0 — Gates that cost nothing (before any product code)

| # | Item | Output |
| --- | --- | --- |
| 0.1 | Ask Browser Use in writing whether a customer MV3 extension can be installed per profile or browser (gate 3). | Answer pasted into `docs/evidence/BROWSER_USE_MIGRATION.md` or a new evidence file. |
| 0.2 | Owner decides the provider `rdns` and icon (gate 4). | One line in the ADR. |
| 0.3 | Confirm in the deployed web app that `useSignTransaction` from `@privy-io/react-auth` 3.40.0 accepts explicit `nonce`, `gas`, `maxFeePerGas`, `maxPriorityFeePerGas` and returns raw signed bytes; same for `useSignMessage` and `useSignTypedData` (gate 2). Testnet, no funds moved: sign, do not broadcast. | Evidence row with the exact call shape and Privy's reply. |

### M1 — Domain and protocol (leaf first)

| File | Change |
| --- | --- |
| `packages/domain/src/id.ts` | `makeIdSchema("bwr", "WalletRequestId")` and `makeIdSchema("bwc", "WalletConnectionId")`. |
| `packages/domain/src/wallet-request.ts` (new) | `WalletRequestKind = "connect" \| "send_transaction" \| "personal_sign" \| "sign_typed_data_v4"`; `WalletRequestStatus` = `pending \| awaiting_approval \| approved \| signed \| sent \| confirmed \| failed \| uncertain \| declined \| expired \| cancelled \| undeliverable`; `WalletRequest` record with `userId, browserSessionId, tabId, contextUniqueId, origin, topOrigin, chainId, from, payload (bounded), fingerprint, nonce?, signedHash?, approvalId?, receiptId?, initiatedDuring: agent \| human \| idle`; `WalletConnection { id, userId, origin, grantedAt, expiresAt?, scope: session \| durable }`; pure transition function `advance(request, event)` that refuses illegal moves. |
| `packages/domain/src/authority.ts` | Add `dapp_transaction` and `dapp_signature` kinds on the ask side (no Privy rule, always asks). |
| `packages/domain/src/dapp-decode.ts` (new) | Pure decoders: selector table (`transfer`, `approve`, `permit`, Permit2 `approve`/`permitTransferFrom`, `setApprovalForAll`), unlimited-allowance detection, SIWE (EIP-4361) parse and domain match, EIP-712 domain/primary-type extraction and known-type surfacing. Output is a `DappAssessment { summary lines, refusals[], warnings[] }`. |
| `packages/protocol/src/browser-wallet.ts` (new) | `BrowserWalletRequest` (from bridge to server; capped: params ≤ 16 KiB, method name ≤ 64 chars), `BrowserWalletReply` (result ≤ 16 KiB or `{code, message, data.reason}`), `BrowserWalletEvent` (`accountsChanged`, `chainChanged`, `disconnect`), constants `BROWSER_WALLET_PARAMS_LIMIT`, `BROWSER_WALLET_RESULT_LIMIT`, `BROWSER_WALLET_PENDING_PER_TAB = 1`. All with `v`. |
| `packages/protocol/src/app.ts` | `approval.request` gains an optional `wallet` block (origin, chain, decoded lines, assessment) rendered by the ticket; new client message `wallet.signed { requestId, signature \| rawTransaction }` and server message `wallet.request.state`. |
| Tests | `wallet-request.test.ts` (every legal and illegal transition), `dapp-decode.test.ts` (fixtures: USDC transfer, unlimited approve, Permit2, SIWE good/bad domain, opaque typed data), `browser-wallet.test.ts` (encode/decode, caps). |

### M2 — Bridge in `packages/browser`

| File | Change |
| --- | --- |
| `packages/browser/src/wallet-provider-script.ts` (new) | The injected source as a string constant: EIP-6963 announce/re-announce, `window.ethereum` only if undefined, `request()` with per-call ids, event emitter, `__froggyDeliver(id, result, error)`, `__froggyEmit(event, payload)`. No secrets, no configuration beyond `chainId`, `rdns`, `name`, `icon`, `uuid`. |
| `packages/browser/src/wallet-bridge.ts` (new) | `WalletBridge` per tab, modelled on `PaymentNavigation`: `start()` runs `Runtime.enable`, `Page.addScriptToEvaluateOnNewDocument`, `Runtime.addBinding`; tracks `Runtime.executionContextCreated/Destroyed` (`uniqueId`, `origin`, `auxData.isDefault/frameId`); on `Runtime.bindingCalled` decodes the payload with `BrowserWalletRequest`, enforces one pending signing request per tab and per-origin rate limits, publishes through `onWalletRequest`; `reply(requestId, reply)` uses `Runtime.evaluate { uniqueContextId }` and settles `undeliverable` on `Cannot find context`; `emit(event)` to every context of an origin; `dispose()` on tab close. Answers top-frame default contexts only in release 1; other contexts get `4200` with reason `iframe_not_supported`. |
| `packages/browser/src/tabs.ts` | Construct and start the bridge in `adoptTab` before `view.ready?.()`; dispose on `closeTab`. Expose `replyWallet(tabId, reply)` and `emitWallet(tabId \| origin, event)`. |
| `packages/browser/src/handle.ts`, `session.ts`, `cloud.ts` | `subscribeWalletRequests`, `replyWalletRequest`, `emitWalletEvent` on `BrowserHandle`; `StubCloudBrowser` implements them loudly. `takePage` records human interaction for the bridge's `initiatedDuring` but does not cancel wallet requests. |
| `packages/browser/src/index.ts` | Exports. |
| Tests | `wallet-bridge.test.ts` with a `FakeBridgeTab implements CdpTab` (pattern: `FakeNetwork` in `payment-navigation.test.ts`): injection order, reply routing by `uniqueContextId`, stale context → undeliverable, one-pending-per-tab, caps, dispose, `emit` fan-out. |

### M3 — Server: durable requests, approval, owner signing, broadcast

| File | Change |
| --- | --- |
| `packages/wallet/src/store.ts` + memory and Postgres implementations, `packages/database/src/schema.ts` + a generated migration | `walletRequests` and `walletConnections` sub-stores; unique `(userId, contextUniqueId, pageRequestId)` for idempotency; compare-and-set status updates as `purchases` does. |
| `apps/server/src/wallet-requests.ts` (new) | `WalletRequests` coordinator: `observe(context, request)` → bind identity from `Workspace.userId` and the bridge's context record (never from the payload) → `connect` path (card "Connect to origin", `WalletConnection` on allow) or signing path → `authorize` gate for provenance/expiry/network/freeze → decode with `dapp-decode` → refuse or build card → nonce assignment under a per-wallet serial shared with `sendErc20Transfer` and trade prepare → `interactions.park` → on `allow_once` wait for `wallet.signed` bound to the same `requestId` and fingerprint → verify the signature/raw tx recovers to the person's EOA and matches the fingerprint → record `signed` with hash → broadcast via `services.evmTransfersFor`'s RPC → `sent` → confirm or `uncertain` → receipt → `browser.replyWalletRequest`. Refusals, declines, expiries and undeliverable replies produce receipts. |
| `apps/server/src/wallet-request-recovery.ts` (new) | Sweeper: `signed` → rebroadcast once, reconcile by hash; `sent` → reconcile only; never re-sign. Mirrors `trading/recovery.ts`. |
| `apps/server/src/workspaces.ts`, `index.ts`, `sockets.ts` | Wire `browser.subscribeWalletRequests(onWalletRequest)`; handle `wallet.signed` on the authenticated app socket (owner only; `agentMayCall` refuses it); publish `wallet.request.state`; on `deny_stop` expire pending wallet cards and `emitWalletEvent(disconnect)`. Add Froggy's own app origin to the hosted browser's blocked URL patterns. |
| `apps/server/src/services.ts` | Compose live vs stub broadcast and receipt reading for wallet requests; no new signer on the server. |
| Read proxy | Reuse `packages/protocol/src/trading-rpc.ts` read union and the trading RPC client for bounded reads; add missing read methods there rather than a second client; per-origin rate limit and 16 KiB result cap. |
| Tests | `wallet-requests.test.ts`: full happy path with stub RPC and a stub signature that recovers to the stub EOA; refusal receipts (unlimited approve, SIWE mismatch, wrong chain, wrong `from`); idempotent re-send; flood → refused new ids; restart in each status; agent token cannot send `wallet.signed`; `deny_stop` disconnects. |

### M4 — Web app

| File | Change |
| --- | --- |
| `apps/web/src/components/cards/approval-ticket.tsx` | Wallet variant: origin badge, chain, decoded lines from the assessment, warnings, the refusal list when refused. |
| `apps/web/src/components/chat/composer-stack.tsx`, `lib/app-state.ts`, `hooks/use-app-socket.ts` | On `allow_once` for a wallet card, call the Privy hook for the kind (`useSignTransaction` / `useSignMessage` / `useSignTypedData`) with the server-fixed payload, then send `wallet.signed`; a hook failure sends `approval.resolve` with `deny` and Privy's words verbatim. |
| `apps/web/src/lib/privy.tsx` | Expose the three hooks through `PrivyBridge` the way `useSigners` is exposed. |
| `apps/web/src/routes/agents-page.tsx` (Connections) | List dapp connections with origin, granted time, scope; revoke button → `wallet.connection.revoke`. |
| `apps/web/src/components/wallet/wallet-activity.tsx`, `cards/receipt-ticket.tsx` | Render wallet receipts, "unpriced" quotes and `stubbed`. |
| Tests | Playwright `e2e/browser-wallet.spec.ts` against the stub: a stub `WalletRequest` renders the card, the answer path sends `wallet.signed` with a stub signature, the receipt appears, revoke removes the connection. |

### M5 — Evidence

| # | Check | Record |
| --- | --- | --- |
| 5.1 | Local Chromium over `ws://` driving the real `CloudCdp` + `TabRegistry` code with a local test dapp (`e2e/fixtures/dapp/`): discovery, connect, one refused request, one stub-signed request. That script lives outside the product tree or behind a dev-only script. | `docs/evidence/BROWSER_WALLET_LOCAL.md` |
| 5.2 | Hosted testnet: one Browser Use browser-hour, the owner signed in, test dapp on a public URL, Base Sepolia: connect, SIWE sign, one transaction with real owner signing and server broadcast, one refused unlimited approve. | `docs/evidence/BROWSER_WALLET_HOSTED.md` with tx hash and receipts |
| 5.3 | One real dapp (Uniswap or Aave testnet UI) connects and shows the Froggy address; a swap request produces a card with a correct decode. Signing may be declined; the decline receipt is the evidence. | same file |

Mainnet is not part of release 1. It needs the owner's stronger review named in `AGENTS.md`.

## Verification matrix

| Claim | Unit | Playwright (stub) | Local Chromium | Hosted testnet |
| --- | --- | --- | --- | --- |
| Provider present before page scripts | — | — | 5.1 | 5.2 |
| EIP-6963 announce and re-announce | — | — | 5.1 | 5.2 |
| Reply lands only in the originating context | `wallet-bridge.test.ts` | — | 5.1 | 5.2 |
| One pending signing request per tab; flood refused | `wallet-bridge.test.ts`, `wallet-requests.test.ts` | — | 5.1 | — |
| Human card shows origin, chain, decoded intent | — | `browser-wallet.spec.ts` | — | 5.2 |
| Agent/OAuth cannot answer or sign | `wallet-requests.test.ts` | — | — | — |
| Refusal receipts (unlimited approve, SIWE mismatch, wrong chain) | `dapp-decode.test.ts`, `wallet-requests.test.ts` | `browser-wallet.spec.ts` | — | 5.2 |
| Owner hook signs server-fixed payload | — | — | — | 0.3 then 5.2 |
| Signed identity recorded before broadcast; restart never re-signs | `wallet-requests.test.ts` | — | — | 5.2 |
| Revocation emits `accountsChanged([])` and `disconnect` | `wallet-bridge.test.ts` | `browser-wallet.spec.ts` | 5.1 | — |
| Stub is loud | `wallet-requests.test.ts` | `browser-wallet.spec.ts` | — | — |
| Hosted fork behaves like upstream | — | — | — | 5.2 |

## Risks and unresolved gates

| Gate | Blocks | Closes with |
| --- | --- | --- |
| G1 Hosted fork CDP behaviour (`addBinding`, `bindingCalled`, `addScriptToEvaluateOnNewDocument`, coexistence with `Fetch.enable`) | M5.2, release | The M5.2 browser-hour |
| G2 Owner signing hooks accept server-fixed nonce/fees and return raw bytes | M3 design of `wallet.signed` | M0.3 |
| G3 Browser Use customer extension support | Transport A only; not release 1 | M0.1 |
| G4 `rdns`/icon | M2 constant | M0.2 |
| G5 Unpriced receipts (`Receipt.quote` variant vs separate Activity row) | M3/M4 shape | Owner choice; default: explicit `unpriced` quote |
| R1 Three writers on one EOA nonce | Failed or stuck dapp transactions | Server-assigned nonce under one per-wallet serial; recheck before broadcast |
| R2 Person misreads a card | Loss | Decode-and-refuse defaults; refusal of unlimited approvals and SIWE mismatches, not warnings |
| R3 Reopening a recorded "cut" | Product focus | ADR 0024 states it; scope stays testnet and single-chain |

## First implementation step

Commit 1, `packages/domain` only, no behaviour change elsewhere:

1. Add `makeIdSchema("bwr", "WalletRequestId")` and `makeIdSchema("bwc", "WalletConnectionId")` to `packages/domain/src/id.ts`.
2. Add `packages/domain/src/wallet-request.ts` with the kinds, statuses, record schema and the pure `advance()` transition function.
3. Add `packages/domain/src/wallet-request.test.ts` covering every legal transition and refusing every illegal one, including that nothing leaves `signed`/`sent` except through reconciliation and that `uncertain` never returns to `pending`.
4. Add the two ask-side rows to `packages/domain/src/authority.ts` and extend its existing test so the Privy rule generator produces **no rule** for them.
5. `bun run check` green; commit as "domain: wallet request record and ask-only dapp kinds".

Nothing in that commit touches the browser, the server, the web app, a policy, a signer or a network.
