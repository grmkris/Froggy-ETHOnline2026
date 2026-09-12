# Froggy as a browser wallet: research

Written 12 September 2026. Research and planning only: nothing here is implemented, no policy was changed, no signer attached, no funds moved, no paid resource created. The plan that follows from it is [`docs/plan/BROWSER_WALLET_IMPLEMENTATION.md`](../plan/BROWSER_WALLET_IMPLEMENTATION.md); the proposed decision is [ADR 0024](../decisions/0024-browser-wallet-provider.md).

**Checkout inspected.** Branch `main`, HEAD `0348bd27f1b683ee157151b5a5bbd2ecb00f082a` (the same commit the preliminary review used). The working tree carried uncommitted trading-research work (`apps/server/src/trading/{goplus,holders,research,venues/*}.ts`, `packages/domain/src/token-research.ts`, `docs/decisions/0023-research-gated-rules.md` and related files); it was left untouched and is not part of this research.

**Evidence levels used below.** Every claim carries one of these; they are never merged.

| Level | Meaning |
| --- | --- |
| L1 | Read from this repository, an installed package's types, or a primary specification (CDP protocol JSON, Chromium source, EIP text, Browser Use OpenAPI). |
| L2 | Reproduced in an isolated local experiment (Chromium 151.0.7922.34, raw WebSocket CDP from Bun, no Playwright, no wallet, no network egress). Local Chromium is **not** the hosted browser. |
| L3 | Inferred from the absence of a feature in primary documentation. |
| L4 | Unverified; a feasibility gate that must be closed against the real system before it is relied on. |
| L5 | Planned test that has not been run. Never reported as passed. |

## 1. Recommendation in one paragraph

Ship the first release as **raw CDP injection through the CDP connection Froggy already holds** (transport B): `Page.addScriptToEvaluateOnNewDocument` installs a small EIP-1193/EIP-6963 provider named "Froggy" in every adopted tab, `Runtime.addBinding` gives the page a one-way channel to the server, and the server answers each request into the exact execution context that raised it. The bridge is a second per-tab observer next to `PaymentNavigation`, not a second controller. Every request becomes a durable server-side `WalletRequest` that reuses the existing approval registry, receipts, provenance rules and the owner's own Privy key in Froggy's trusted app; the standing agent signer is never used for a dapp-originated request in the first release. The custom MV3 extension remains the goal for browser-verified attribution and survives this plan as an unresolved feasibility gate: Browser Use Cloud documents no way to install one (L3), and the only CDP route (`Extensions.loadUnpacked`) needs a directory on the browser host's filesystem (L1, L2), which the hosted API does not offer.

## 2. Current-state map (all L1)

### 2.1 What exists and what does not

- **No injected provider exists.** `window.ethereum`, `EIP-1193`, `eip6963`, `Runtime.addBinding`, `bindingCalled` and `addScriptToEvaluateOnNewDocument` have zero hits under `apps/` and `packages/`. They appear only in planning prose: `docs/plan/PLAN.md` row 6.3 (the stretch spec: "EIP-1193 and EIP-6963 provider on allowlisted origins only, every request an approval ticket, `to` is provenance `page` unless allowlisted, infinite approve always refused, freeze emits `disconnect`. Testnet only."), `docs/plan/DECISIONS.md` row 24 ("Injected `window.ethereum` | Cut | Stretch (6.3), last | Open") and `docs/plan/README.md` item 10 ("Cut entirely: WebMCP, the injected provider, WalletConnect…"). This task reopens a decision that was recorded as cut; the ADR says so.
- **The browser pays over HTTP, not over a wallet API.** `packages/browser/src/payment-navigation.ts` observes a top-level `Document` 402 through `Network.*`/`Fetch.*`, publishes a capped `BrowserPaymentRequest`, and replays the one request with a payment header bound to tab, navigation generation, URL and a five-minute expiry (ADR 0014). This is the pattern a wallet bridge should mirror: bounded payloads, generation invalidation, exact-request binding, cancellation on human takeover.

### 2.2 Browser lifecycle

| Concern | Where | Fact |
| --- | --- | --- |
| Provider API | `packages/browser/src/cloud-api.ts` | `API_BASE = "https://api.browser-use.com/api/v3"`; `create` posts `profileId`, `proxyCountryCode`, `timeout: 60`, `browserScreenWidth/Height`, `enableRecording: false`, `metadata`. `socket()` reads `/json/version` on `https://<id>.cdp.browser-use.com` and insists the returned `wss:` URL stays on that host. |
| One CDP socket | `packages/browser/src/cloud-cdp.ts` `CloudCdp.start()` | Sends `Target.setAutoAttach { autoAttach: true, flatten: true, waitForDebuggerOnStart: true }` on the browser session, then `Target.createTarget about:blank`. Commands time out at 30 s; incoming frames over 4 MiB are dropped. |
| Attach handling | `CloudCdp.attached()` (lines 261–289) | `info.type !== "page"` → only `Runtime.runIfWaitingForDebugger`, **never adopted**. Pages become `CloudView`s; the first resolves `start()`, later ones go to `onView` → `TabRegistry.adoptTab`. |
| Tab adoption | `packages/browser/src/tabs.ts` `adoptTab()` (lines 118–169) | `Page.enable` → `new PaymentNavigation(...)` + `payment.start()` → optional `Network.setBlockedURLs(PRIVATE_URL_PATTERNS)` → `Page.domContentEventFired` listener → **`view.ready?.()`** (which is `Runtime.runIfWaitingForDebugger`) → navigate. Everything before `ready()` runs while the new target is still paused: this is the natural place to install a provider before any page script runs. |
| Per-tab command serialisation | `packages/browser/src/cdp.ts` `tabCdp()` | One in-flight command per tab, default 30 s deadline. A bridge that awaits a human inside a CDP command would block the tab's queue; the bridge must answer requests asynchronously, never inside a command handler. |
| Control | `packages/browser/src/cloud.ts` `CloudBrowser.agent()`, `packages/browser/src/arbitration.ts` | Agent actions are a serialised tail with a generation counter; there is no lock, `HUMAN_ACTIVE_MS = 1500`, `AGENT_WAIT_MS = 15000`. `takePage` (`session.ts`) notes human input, cancels the pending payment and stops loading. |
| Frames | `packages/browser/src/tabs.ts` comment | "Bun consumes `Page.frameNavigated` for its own bookkeeping" — frame events are not relied upon; title/url are polled after `domContentEventFired`. `Runtime.executionContextCreated` did arrive in Bun in the experiment (L2), so context lifecycle can be tracked. |
| Ownership | `apps/server/src/workspaces.ts` | `Workspaces` holds one `Workspace { browser, session, userId }` per person, admits seats, sweeps idle, and wires `browser.subscribePayments(onBrowserPayment)`. `apps/server/src/services.ts` composes adapters but its own comment says the browser belongs to `workspaces.ts`. **Doc drift:** `apps/server/AGENTS.md` still describes `services.ts` as the meeting point of browser and wallet; the *import* boundary is still true (only `services.ts` imports both packages), the *lifetime* is in `workspaces.ts`. |

### 2.3 Money and authorization

| Concern | Where | Fact |
| --- | --- | --- |
| Single choke point | `apps/server/src/session.ts` `WorkspaceSession.spend()` (1137–1160), `pay()` (1766–1928) | Order: price → `authorize` → `ledger.reserve` → side effect → receipt, first three under `serial()`. `spendTrade()` (1172–1182) is the typed trading branch on the same lock but on the trading book, not the USD ledger. |
| Approvals | `apps/server/src/interactions.ts` `InteractionRegistry` | `park` (first of answer/abort/deadline), `resolve(userId, requestId, optionId, accessToken)` refuses a card owned by another user or an unknown option, `abortAll(userId)`. Answers arrive only as `approval.resolve` on the authenticated `/ws/app` socket (`apps/server/src/sockets.ts`); agent tokens and OAuth grants cannot call it (`agentMayCall`, ADR 0012/0020). The card TTL is `APPROVAL_TTL_MS` = 120 s. |
| Card shape | `packages/protocol/src/app.ts` `ApprovalRequest` | `id, title, purpose, detail, amountLabel, breakdown? (1–6 lines), payeeLabel, expiresAt, options[] {id, kind, label}, runId?`. Kinds: `deny_stop | deny | allow_session | allow_once` (`packages/domain/src/approval.ts`). |
| Policy | `packages/wallet/src/policy.ts` `authorize()` (406–495) | Pure. Order: provenance → purchase-grant binding → expiry → allowlists (network/payee/host; `user` and purchase skip the payee list) → per-tx cap → window cap → kind ceiling and pocket → human line last. `Provenance = mandate | server | user | model | page`; only the first three are payable. `typedByPerson` (`tools.ts` 269–271) is a case-insensitive substring test against the person's own text. |
| Kinds | `packages/domain/src/authority.ts` | The action-kind table decides which kinds may run under the standing signature and which always ask; a kind without a row is refused. Ask-side kinds get **no Privy rule**, so the agent key physically cannot sign them (ADR 0019). |
| Signers | `packages/wallet/src/evm-signer.ts`, `owner-payments.ts`, `privy.ts` | Agent: `privyAgentSigner` with `authorization_private_keys`, `eth_signTypedData_v4` and type-2 `eth_signTransaction` only; the host broadcasts. Owner: `privyOwnerSigner`/`privyOwnerTransactionSigner` are one-use wrappers over `authorization_context.user_jwts`. No `personal_sign` wrapper exists anywhere. |
| Owner signing status | `docs/evidence/PRIVY.md` line 72, ADR 0015 line 14, ADR 0019 line 31 | The server-side `user_jwts` exchange (`POST /v1/wallets/authenticate`) has answered `400 Invalid JWT token provided` on this app since 7 September; live owner-signed purchase remains "Pending" in `docs/evidence/X402_MAINNET_VERIFICATION.md`. What *has* worked live (10 September) is signing from the **browser** SDK in Froggy's own app: `useSigners().addSigners` and `useAuthorizationSignature` in `apps/web/src/lib/privy.tsx`. |
| Browser SDK surface | `apps/web/node_modules/@privy-io/react-auth` 3.40.0 | Exports `useSignMessage`, `useSignTypedData`, `useSignTransaction`, `useSendTransaction`, `useSign7702Authorization`. None is used yet. |
| Node SDK surface | `@privy-io/node` 0.34.0 `public-api/services/ethereum.d.ts` | `signMessage`, `signTypedData`, `signTransaction`, `sendTransaction`, `signSecp256k1`, `sign7702Authorization`, `signUserOperation`, `sendCalls`. Policy methods gateable per `docs/evidence/PRIVY.md`: `eth_signTransaction`, `eth_signTypedData_v4`, `personal_sign`, `eth_sendTransaction`, … ; the committed and per-person policies grant none of `personal_sign`/`eth_sendTransaction`. |
| Nonces | `packages/wallet/src/transfer.ts`, `evm-chain.ts` `checkTradeBeforeSigning` | Transfers take the live pending nonce at send time; trades freeze nonces at prepare and refuse to sign if `getTransactionCount` moved ("trade.nonce: wallet activity changed"). There is no cross-path nonce lock beyond `serial()`. A dapp transaction is a third writer on the same EOA. |
| Uncertainty | `apps/server/src/purchases.ts` (246–256, 1172–1175), `apps/server/src/trading/recovery.ts` | Both durable records separate `signed`, `sent`, `settled`, `uncertain`; recovery rebroadcasts but never re-signs. |
| Ledger and receipts | `packages/wallet/src/ledger.ts`, `packages/domain/src/receipt.ts` | `spends` row per idempotency key with `reserved/settled/failed/refused/abandoned/uncertain`; `Receipt {decision, intent, quote, runId, sessionId, spendId, stubbed, approval?, settlement?, failure?}`. Receipts exist for refusals too. |
| Identity | `apps/server/src/auth.ts`, `packages/domain/src/id.ts` | Privy access token via header or WS subprotocol → `privy.verify` → `UserId`. TypeIDs in use: `ses run tab bpay mnd rul spn rct apr … pur trd tst …`; next entity is one `makeIdSchema` pair. |
| Boundary | `tools/graph.ts` | `packages/browser` ↮ `packages/wallet`; `domain` is a leaf; `browser` may use only `effect` and `node:fs/os/path`. |

### 2.4 Web surfaces that would carry the human decision

`components/cards/approval-ticket.tsx` (`ApprovalTicket`), `components/chat/composer-stack.tsx` (sends `{ type: "approval.resolve", requestId, optionId, v: 1 }`), `lib/app-state.ts` reducer, `components/wallet/wallet-activity.tsx` and `cards/receipt-ticket.tsx` (shows `stubbed`), `routes/agents-page.tsx` ("Connections"), `components/settings/agent-signer-consent.tsx`. Playwright `e2e/approval.spec.ts` already drives the ticket round trip against a stubbed server with `MAX_BROWSERS: "0"`.

## 3. Hosted browser: what Browser Use Cloud offers

| Question | Finding | Level |
| --- | --- | --- |
| Is `/api/v3` still valid? | Yes. The v3 and v4 OpenAPI documents expose identical `/browsers` and `/profiles` resources with the same `CreateBrowserSessionRequest` fields (`profileId, proxyCountryCode, metadata, timeout, browserScreenWidth, browserScreenHeight, allowResizing, pdfRendererEnabled, solveCaptchas, customProxy, enableRecording`). Browser Use's docs keep "V3 examples explicitly versioned". The only v4-exclusive surface is the hosted agent API, which Froggy does not use (`froggy-browser` skill). **No migration is warranted**; `cloud-api.ts` matches the documented v3 contract. | L1 |
| Can a customer install a Chrome extension? | Neither spec contains the word "extension"; no field on browser creation or profile references one; the docs mention extensions only for the open-source local `browser-use` library. Competing hosted providers (Browserless, Hyperbrowser, Kernel) document zip-upload extension features; Browser Use does not. | L3 |
| Can CDP load one? | `Extensions.loadUnpacked(path)` succeeded over the remote-debugging WebSocket on local Chromium 151, **with and without** `--enable-unsafe-extension-debugging`, and the MV3 `world: "MAIN"` content script ran before page scripts in the top frame and in a cross-site iframe. But the parameter is a **filesystem path on the machine running Chrome** (Chromium `extensions_handler.cc` → `UnpackedInstaller::Create(context)->Load(FilePath(path))`; the handler exists only for trusted clients on the browser-level target, `chrome_devtools_session.cc` lines 100–106). Froggy has no way to place a directory on the Browser Use host. | L1, L2 |
| Does the hosted fork keep the `Extensions` domain, profile persistence of extensions, or a "stealth" tweak that hides injected providers? | Unknown. "Hardened Chromium fork with stealth" is all the docs say. | L4 |
| Does the hosted browser raise `Runtime.executionContextCreated` and `Runtime.bindingCalled` like upstream? | Expected (they are core CDP), unverified against the fork. | L4 |

Conclusion: the extension is not reachable through anything Froggy can do alone today. The gate that would reopen it is a written answer from Browser Use (or a new API field) allowing a customer extension per profile or per browser. The plan keeps the message contract transport-neutral so that answer would swap the bridge, not the wallet.

## 4. Transport comparison

| | A: MV3 extension in Browser Use | B: raw CDP injection over the existing socket | C: Playwright/CDP adapter | D: another browser deployment |
| --- | --- | --- | --- | --- |
| Feasible now | No (L3; needs provider support) | Yes (L2 locally; L4 on the fork) | Adds a second controller on the same socket with no capability B lacks; Playwright extension support needs `launchPersistentContext` with `--load-extension`, unavailable on a remote browser | Contradicts ADR 0018 and the "one Chrome" product; only if A and B both fail |
| Origin/frame attribution | Browser-verified `MessageSender {origin, frameId, tab.id}` (L2) | CDP-verified `ExecutionContextDescription {origin, auxData.frameId, uniqueId}`; the page cannot forge which context a binding fired from (L1) | same as B | n/a |
| Isolation from page JS | Isolated world + service worker | MAIN world; the page can monkey-patch the provider object but cannot reach the binding's routing | same as B | n/a |
| Availability before page scripts | `run_at: document_start` (L2) | `addScriptToEvaluateOnNewDocument` runs before any page script; `hadEthereumAtStart: true` (L2) | same | n/a |
| Survives reload / new tab / popup | yes | Script and binding persist per target across reloads; new pages need per-target installation, which `adoptTab` already gives; popups arrived as new page targets and were adopted (L2) | same | n/a |
| Cross-site iframes | `all_frames: true` reached the OOPIF (L2) | The OOPIF arrives as its own `iframe` target only through nested `Target.setAutoAttach` on the page session; `CloudCdp.attached()` currently ignores non-page targets; without per-target injection the iframe saw no provider (L2) | same | n/a |
| Worker restart / rotation | Service-worker idle rules apply | Nothing to rotate: no secret lives in the page; the binding name is public, authority lives server-side | same | n/a |
| Repo fit | New artifact type, packaging, and a host we cannot deploy to | Extends `packages/browser` under ADR 0004's existing CDP exception; mirrors `PaymentNavigation` | New dependency in the threat-model package | New provider, new ADR |

**Chosen: B.** A is preserved as the attribution upgrade behind the provider gate. C and D are rejected for the first release.

## 5. Isolated experiment (L2) — what was measured and what it does not prove

Setup: Playwright's Chromium 151.0.7922.34 launched headless with `--remote-debugging-port=0 --site-per-process`, driven from Bun over a raw WebSocket (no Playwright API, so the code path resembles `CloudCdp`). Pages served locally; nothing left the machine. Scripts and logs live outside the repository (`/tmp/froggy-wallet-exp/`).

Observed:

1. `Page.addScriptToEvaluateOnNewDocument` + `Runtime.addBinding { name: "__froggyBridge" }` installed under auto-attach-with-pause, then `Runtime.runIfWaitingForDebugger`: the top page reported `hadEthereumAtStart: true`, announced `eip6963:announceProvider` with rdns `app.froggy.wallet`, answered `eth_chainId` and `eth_accounts` from the injected shim, and `eth_sendTransaction` returned `{ code: 4200 }` when the server side declined.
2. `Runtime.bindingCalled` carried `executionContextId`; replying with `Runtime.evaluate { contextId }` into a **navigated-away** context failed with `-32000 Cannot find context with specified id` — the failure mode is clean and detectable, so a stale reply can never land in a different document.
3. Reload kept the provider (script and binding persist per target). A `window.open` popup arrived as a new `page` target and, once the same installation ran on its session, announced the provider.
4. A page attached **after** it had loaded had `hadEthereumAtStart: false` but announced on `eip6963:requestProvider` once injected, so late injection degrades gracefully rather than failing.
5. A same-site iframe (`127.0.0.1` on another port) was **not** an OOPIF; a cross-site iframe (`localhost`) was, arrived as an `iframe` target via nested auto-attach on the page session, and did not see the provider unless injected on its own session. The extension's `all_frames` content script reached it.
6. `Extensions.getExtensions` and `Extensions.loadUnpacked(<local dir>)` both succeeded on the browser session; the extension's isolated content script obtained `{ origin, frameId, tabId }` from the service worker.

Not proven: any behaviour of Browser Use's Chromium fork; timing on a remote socket with ~100 ms round trips; behaviour under `Fetch.enable` interception already active on the tab; anything about hosted extension installation. The experiment establishes mechanism, not readiness.

## 6. Provider contract (proposed)

Identity: `info = { uuid (per browser session), name: "Froggy", icon: <data: URI>, rdns: <reverse DNS of a domain Froggy controls; placeholder app.froggy.wallet until decided> }`, frozen, announced on load and on every `eip6963:requestProvider`. No `isMetaMask`, no MetaMask rdns, no claims of being any other wallet. `window.ethereum` is set only if undefined, as a configurable, non-enumerable property, so a coexisting wallet in the profile is never clobbered; EIP-6963 is the primary discovery path.

Events: `connect {chainId}` after injection, `chainChanged` (only when configuration changes; expected never mid-session in release 1), `accountsChanged` on connect/disconnect/revoke, `disconnect` (4900) when the workspace browser closes, the person stops the agent with `deny_stop`, or the grant is revoked. `message`/`eth_subscribe` are not offered (4200).

Errors use the EIP-1193 codes viem 2.56.3 also implements: 4001 user rejected, 4100 unauthorized (not connected), 4200 unsupported method, 4900/4901 disconnected, 4902 unknown chain, plus JSON-RPC `-32602` for malformed params and `-32603` for server faults. Every refusal names the Froggy rule that produced it in `data.reason`.

Method matrix for release 1 (single configured chain from `EVM_NETWORK`):

| Method | Handling |
| --- | --- |
| `eth_chainId`, `net_version` | Answered in the page from the injected configuration; also confirmed server-side. |
| `eth_accounts` | `[]` until the origin holds a connection grant; then the person's embedded **EOA** (`WalletAddresses.signer`, not `smart`, so `personal_sign` verifies without ERC-1271). |
| `eth_requestAccounts`, `wallet_requestPermissions([{eth_accounts}])` | Human approval ticket "Connect to `<origin>`". Grant is per origin, durable, revocable from Connections; `allow_session` scopes it to the browser session. Disclosing the address is **not** signing authority. |
| `wallet_getPermissions`, `wallet_revokePermissions` | Reflect and revoke the connection grant. |
| `wallet_switchEthereumChain` | Succeeds for the configured chain, `4902` otherwise. `wallet_addEthereumChain` → `4200`. |
| Bounded reads: `eth_blockNumber`, `eth_getBalance`, `eth_call`, `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `eth_getTransactionCount`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_getBlockByNumber`, `eth_getCode`, `eth_getLogs` | Proxied to the server's configured RPC (`TRADING_RPC_ENDPOINTS` / `EVM_RPC_URL`) through the existing read union in `packages/protocol/src/trading-rpc.ts` where it exists, with params size caps, per-origin rate limits, and a 16 KiB result cap; never the person's browser. |
| `eth_sendTransaction` | Durable `WalletRequest`; human approval; owner signs in Froggy's app; server broadcasts; hash returned to the exact originating document. |
| `personal_sign` | Durable request; human approval with the decoded UTF-8 text, SIWE parsed and its `domain` checked against the requesting origin. |
| `eth_signTypedData_v4` | Durable request; decoded domain/primary type shown; Permit/Permit2/`approve`-style unlimited amounts flagged and, by default, refused (PLAN 6.3: "infinite approve always refused"). |
| `eth_sign`, `eth_signTypedData` (v1/v3), `eth_decrypt`, `eth_getEncryptionPublicKey`, `eth_signTransaction` (returning raw bytes to the page) | `4200`, permanently. |
| `wallet_sendCalls`, `wallet_getCapabilities`, `wallet_watchAsset`, `eth_subscribe` | Deferred, `4200` in release 1. |

Chain state scope: one chain per deployment (`EVM_NETWORK`, default `eip155:84532`, production `eip155:8453`). Every dapp request carries `chainId` from the context that raised it and is refused if it disagrees with the server's configuration.

## 7. Authorization design

### 7.1 One new durable record, not a new policy engine

Dapp transactions move arbitrary tokens and signatures move nothing directly, so the USD spend ledger (`spend()`) cannot price them and the trading book's `TradeStep` shape does not fit them. Forcing a dapp request into `Purchase` or `Trade` would misreport both. The proposal is a `WalletRequest` (`bwr_` TypeID) with its own status machine, and reuse of everything around it: `InteractionRegistry` for the human decision, `Receipt` for the record (with an explicit "unpriced" quote where no USD value is decodable), `authorize` for the parts it can judge (provenance, expiry, network allowlist, freeze), `Store` for persistence, and the trading path's *signed-identity-before-broadcast* discipline for submission.

### 7.2 Provenance

Everything a dapp supplies — `from`, `to`, `value`, `data`, `chainId`, typed data, the message — is `page` provenance: untrusted content from the browser. Under today's `authorize`, `page` is never payable and is refused before the human line. That rule stays for the agent. For the browser wallet the human's explicit approval of the exact fingerprint is the act that makes the payee theirs — the same shape as `PurchaseGrant` binding (`permittedPurchase`) rather than a change to provenance semantics. Concretely: a `WalletRequest` is judged with a grant binding (`chainId, from, to, value, keccak(data), nonce, origin, requestId`) and `approved: true` only after the person answered *that* card; the agent's `page`/`model` refusal path is untouched. Nothing typed by the model can approve a dapp request; the model has no tool that touches `WalletRequest` state other than reading receipts.

### 7.3 Who signs

| Path | Status today | Use in release 1 |
| --- | --- | --- |
| Standing agent key under the per-person Privy policy (`authorization_private_keys`) | Works for `eth_signTypedData_v4` EIP-3009 to allowlisted payees and `eth_signTransaction` USDC top-ups (L1). No rule covers arbitrary contracts, `personal_sign`, or `eth_sendTransaction`. | **Not used.** A dapp request has `page` provenance and an arbitrary `to`; giving the agent key a rule for it would widen the leash the product exists to keep narrow. The kind table in `authority.ts` gets `dapp_transaction`/`dapp_signature` rows on the *ask* side so the agent key physically cannot sign them (ADR 0019 mechanism). |
| Server-side owner signing (`user_jwts`) | Refused by Privy on this app since 7 September (L1, `docs/evidence/PRIVY.md`). | Not relied on. If the dashboard toggle ever appears, it becomes an alternative implementation behind the same `WalletRequest` state machine. |
| Owner signing in Froggy's trusted web app via `@privy-io/react-auth` hooks | `useSignMessage`, `useSignTypedData`, `useSignTransaction` exist in 3.40.0 (L1); the sibling `useSigners`/`useAuthorizationSignature` proved live on 10 September (L1). Whether `useSignTransaction` accepts a server-supplied `nonce`, `gasLimit` and fee fields verbatim is **L4**. | **Primary.** The approval ticket and the signature are one act in one trusted place. The signed payload returns to the server on the authenticated app socket or an authenticated HTTP route; the server records the signed identity, broadcasts, and answers the dapp. |

There is **no fallback** from a refused delegated request to owner credentials, and the plan has no delegated path for dapps to fall back from. A refusal is a refusal, with a receipt.

### 7.4 Transaction validation before the card is shown

Decode and refuse or warn: `from` must equal the person's EOA; `chainId` must match configuration; `to` must be a valid address (contract creation refused); `value` and `data` size-capped; `data` decoded against known selectors (`transfer`, `approve`, `permit`, Permit2 `approve`/`permitTransferFrom`, `setApprovalForAll`); unlimited or `type(uint256).max` allowances refused by default; the `to` address checked against any user allowlist and against the same lists trading research consults where available; native value converted to USD when a price exists and shown as "unpriced" otherwise; gas fields ignored from the page and re-estimated by the server (rollup L1 fee budgeted as ADR 0022 does); nonce **assigned by the server** at approval time under a per-wallet serial that also covers `sendErc20Transfer` and trade preparation, then re-checked before broadcast exactly like `checkTradeBeforeSigning`.

### 7.5 Signature assessment

`personal_sign`: hex is decoded to UTF-8 and shown; non-UTF-8 payloads are shown as hex with a warning; SIWE (EIP-4361) messages are parsed and the `domain`/`uri` compared to the requesting origin — mismatch is a refusal, not a warning. `eth_signTypedData_v4`: the domain (`name, chainId, verifyingContract`) and primary type are shown; `Permit`, `PermitSingle/PermitBatch`, `TransferWithAuthorization`, and order/intent types are recognised and their spender/amount/deadline surfaced; unknown types are shown raw and allowed only with an explicit "I understand" option. Privy's policy engine is not the enforcement point here (the owner key signs); the host's decode-and-refuse is, and the receipt says so ("enforced by Froggy before your key signed").

## 8. Threat model and lifecycle

- **Nothing in a page payload is trusted for identity.** `userId`, `walletId`, `origin`, `frameId`, `tabId`, `requestId` and any "approved" flag arriving through the binding are ignored; identity comes from the socket that owns the tab (`Workspace.userId`), the CDP session that raised `bindingCalled`, and the `ExecutionContextDescription` recorded at context creation. A stale or foreign `executionContextId` makes the reply fail closed (L2).
- **Cross-user/tab/origin confusion.** A `WalletRequest` is bound to `(userId, browserSessionId, tabId, uniqueContextId, origin)`; a reply is delivered only if the context still exists and its origin still matches; otherwise the request settles as `undeliverable` and the receipt says so. A result is never re-routed to another document.
- **Frames.** Release 1 answers top-frame requests; requests from iframes (once nested auto-attach lands) show the iframe origin *and* the top origin on the card and are refused when they differ unless the person explicitly allows embedded dapps for that origin.
- **Prompt injection.** The agent never sees the raw request; it sees a fenced, bounded summary through `PAGE_CONTENT_FENCE` if at all, and has no tool to answer. A page cannot trigger approval by producing text.
- **Flooding.** Per-origin and per-tab rate limits, at most one pending signing request per tab (new ones return `-32002 already pending` until resolved), a cap on pending cards per person, and an idempotency key per `(context, requestId)` so a page re-sending the same id gets the same outcome. New ids under a flood are refused, not queued.
- **Reads and SSRF.** Read methods go only to the configured RPC hosts; the page cannot supply a URL. Results capped at 16 KiB.
- **Secrets.** Nothing secret exists in the page, DOM, storage, model context or logs: the binding name is public, requests carry ids, and authority is a server-side record plus the person's own key in their own browser.
- **Owner channel outside agent control.** Approvals and signatures happen in the person's own browser running Froggy's app, never in the hosted Chrome. The hosted Chrome must be unable to reach Froggy's own app origin: add it to the blocked URL patterns for agent tabs and refuse `/ws/app` from the hosted browser's origin (the origin check in `index.ts` already exists; the block is the new part).
- **Durable state.** `WalletRequest` statuses separate `pending → awaiting_approval → approved (nonce assigned, fingerprint fixed) → signed (signed identity recorded, hash known before broadcast) → sent → confirmed | failed | uncertain`, plus `declined | expired | cancelled | undeliverable`. Worker restart in `signed` re-broadcasts once and reconciles by hash; restart in `sent` reconciles only; nothing re-signs. `uncertain` is a terminal state until reconciliation proves otherwise (mirrors purchases and trades).
- **Revocation.** Revoking an origin's connection emits `accountsChanged([])` and `disconnect` to every context of that origin, expires pending cards, and refuses in-flight requests with 4100; it never reverses a broadcast transaction.
- **Human takeover and Stop.** `takePage` leaves a pending wallet card alone (the human may be the one clicking Connect) but records `initiatedDuring: human` on the request for the card; `deny_stop` aborts the run, expires pending wallet cards, and emits `disconnect`. A pending request never blocks the serialized action queue because the bridge answers asynchronously outside any CDP command.

## 9. Validation plan (all L5 until run)

Deterministic test dapp (kept under `e2e/fixtures/dapp/`, served by Bun): announces discovery results, exercises each method, records ordering and timing, and renders results as text for Playwright to assert.

| Level | What it proves | How |
| --- | --- | --- |
| Unit (`bun test`, `packages/browser`) | Bridge routing, caps, stale-context handling, one-pending-per-tab, generation invalidation | A `FakeBridgeTab implements CdpTab` modelled on `FakeNetwork` in `payment-navigation.test.ts` emitting `Runtime.bindingCalled` / `executionContextCreated|Destroyed` |
| Unit (`packages/domain`, `packages/wallet`) | `WalletRequest` schema and transitions; decode/refuse rules; SIWE domain binding; unlimited-approval refusal; ask-side kinds have no Privy rule | Pure tests, no network |
| Unit (`apps/server`) | Request → card → resolve → signed identity → broadcast → receipt; refusal receipts; idempotency; restart in each state | In-memory store, stub RPC and stub signer with `stubbed: true` on every receipt |
| Playwright (`bun run e2e`) | The card renders, the answer returns to the dapp, revocation disconnects | Stubbed provider with `MAX_BROWSERS: "0"` cannot host a page; this level runs the *web app* side against a stub `WalletRequest` |
| Local Chromium bridge check (outside the repo, like this research's experiment) | Injection, EIP-6963 announce, popup and reload coverage on the real `CloudCdp` code driving a local Chrome over `ws://` | Requires a small test harness that points `CloudCdp` at a local socket; does not prove the hosted fork |
| Hosted, testnet | The fork raises the same events; injection and reply on `cdp.browser-use.com`; a real dapp connects, signs a SIWE message, sends one Base Sepolia transaction with the owner's key | Costs a browser-hour and requires the owner signed in; **not run in this task** |
| Mainnet | Nothing in release 1 | Explicitly excluded until the testnet row is recorded in `docs/evidence/` |

Existing commands: `bun run check` (format, type-aware lint, typecheck, graph, agent files, names, tests, knip), `bun run check:fast`, `bun run e2e`. The planned tests are listed in the implementation plan by file.

## 10. Critical review

**Browser lifecycle.** The bridge is one more per-tab observer beside `PaymentNavigation`, installed in `adoptTab` before `view.ready()`; it does not open a second socket, does not take the arbitration slot, and never awaits inside a CDP command. Risks: `Fetch.enable` interception and `Runtime.enable` on the same session are independent domains and should coexist, but only the hosted fork can confirm; the initial about:blank page is adopted after `first` resolves, and `adoptTab` must still run the installation for it; OOPIF support needs `Target.setAutoAttach` per page session and adoption of `iframe` targets that `CloudCdp.attached()` currently discards — deferred, with iframe requests refused rather than silently unanswered.

**Wallet authorization security.** The owner's key signs in the owner's browser, so the hosted Chrome, the model, and Browser Use never hold authority; the agent key gets no rule; page provenance stays unpayable for the agent; every refusal has a receipt. The residual risks are the person approving something they misread — mitigated by decode-and-refuse rules and by refusing unlimited approvals and SIWE domain mismatches outright — and the three-writer nonce problem, mitigated by server-assigned nonces under one serial. The signing hooks' acceptance of server-fixed nonce and fees is the one L4 item on this axis.

**Repository fit.** New TypeID, new domain record and schema, new protocol messages with `v`, a `packages/browser` bridge under the existing ADR 0004 exception, composition in `services.ts`/`workspaces.ts`, web ticket variants, stub and live implementations with loud markers. No Zod, no new framework, no browser↔wallet import. The reopened "cut" decision and the doc drift in `apps/server/AGENTS.md` are recorded in the ADR.

## 11. Unresolved gates

1. **Hosted fork behaviour** (L4): `Runtime.addBinding`/`bindingCalled`, `addScriptToEvaluateOnNewDocument`, and coexistence with `Fetch` interception on `cdp.browser-use.com`. Closed by one testnet browser-hour with the owner present.
2. **Owner signing hooks** (L4): `useSignTransaction`/`useSignMessage`/`useSignTypedData` accept server-fixed nonce/fees and return raw signed bytes; verified in the deployed app, not locally with stubs.
3. **Extension route** (L3→L4): a written answer from Browser Use on customer extensions. Until then transport A is a goal, not a plan.
4. **rdns and icon**: a domain Froggy controls, decided by the owner.
5. **Unpriced receipts**: whether `Receipt.quote` gains an explicit unpriced variant or `WalletRequest` is surfaced separately in Activity.
