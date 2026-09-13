# Card funding, credentials and cross-chain bridging in the shared browser — research, 13 Sep 2026

Owner's asks, in the order they came: "how does the wallet get into the browser Agent — through the extension?"; "can we integrate a password manager the same way, so the agent can autofill?"; "could we inject a credit card like this?"; "for demo purposes, could the server just fill in the data?"; "I'd add my disposable crypto-connected card, find it on a specific chain and use it" (Linea USDC, a funding address, card details stored in Froggy's UI); "Uniswap has cross-chain swaps in their UI so the SDK must too"; "we also do Privy 7702 so we should be able to batch, right?"; "can't we swap and then bridge to a different address?".

Every claim is tagged **[verified]** (read from the code, a live endpoint or an official page today) or **[inferred]**. Nothing was paid, no key was used, no browser-hour was spent. The one probe that needs the Uniswap key was **not run** — see §7.

Companion plan: [`docs/plan/CARD_FUNDING_IMPLEMENTATION.md`](../plan/CARD_FUNDING_IMPLEMENTATION.md).

## 1. How the wallet gets into the hosted Chrome (it is not an extension)

[verified from the code] Browser Use Cloud offers no customer extensions (ADR 0024 records this; the v3 and v4 schemas have no extension field). Froggy injects over the CDP socket it already holds per tab:

1. `TabRegistry.adoptTab` (`packages/browser/src/tabs.ts:181`) creates a `WalletBridge` before the tab is released to run.
2. `WalletBridge.start()` (`packages/browser/src/wallet-bridge.ts`) does `Runtime.enable`, `Runtime.addBinding(BROWSER_WALLET_BINDING)`, then `Page.addScriptToEvaluateOnNewDocument` with `walletProviderScript(...)`, then `Page.getFrameTree` to learn the top frame.
3. `wallet-provider-script.ts` is plain JS in a string: an EIP-1193 provider announced under EIP-6963 (`rdns: app.froggy.wallet`) and as `window.ethereum`. It holds **no secret and no state**; every `request()` is JSON-serialised and handed to the binding. `eth_chainId`/`net_version` are answered locally; methods outside `WalletRpcMethod` are refused in-page with 4200.
4. Chrome raises `Runtime.bindingCalled` with the numeric execution-context id; the bridge looks the context up in its map (populated from `Runtime.executionContextCreated`, main world only, `auxData.isDefault === true`) and so reads the **origin from Chrome, never from the payload**. The observation goes to `apps/server/src/wallet-requests.ts` via `onCall`.
5. The server decodes, refuses, or parks an approval card (`deny_stop / deny / allow_once`); the person answers on the authenticated app socket; signing is a one-shot Privy rule patch then the agent key (`commit`). The reply is `Runtime.evaluate`d into exactly the originating context by `uniqueContextId` via `window.__froggyWalletReply(json)`; a navigated-away frame returns `false` and the request is recorded undeliverable.

Two drivers share this: the Browser Use hosted agent (`/api/v4/runs` on the shared session, `hosted-browse.ts` tells it "Use the injected window.ethereum") and Froggy's own CDP agent (`browser_navigate/snapshot/click/type` in `apps/server/src/tools.ts`; `browser_type` is `Input.insertText`, `session.ts:332`).

## 2. Password manager: Browser Use already ships half of it

[verified from `https://api.browser-use.com/api/v4/openapi.json`, fetched 13 Sep] `RunCreateRequest` has:

- `secretBindings: SecretBinding[]` (max 10, run-scoped, "not persisted past the run"). `SecretBinding = { alias, source, allowedDomains (1–10 bare hostnames, subdomains covered) }`. `source` is `{ type: "inline", value ≤ 4096 bytes, writeOnly }` or `{ type: "onepassword", integrationId, vaultId, itemId, fieldId }`. Their description: "The value never reaches the agent. It is encrypted at rest, kept out of the worker payload, and typed straight into the focused field by the server when the agent asks for the alias by name — and only while the page it is typing into is on one of `allowedDomains`." OTP fields resolve to the current code.
- `opVaultId` + `opVaultAllowedDomains` for a whole 1Password vault.
- `/integrations`, `/integrations/{provider}/authorize` (Composio-hosted OAuth) — **project-level**, i.e. the operator's 1Password, not the person's. Inline bindings are the per-user path.

Froggy side [verified]: `HostedRunInput` (`packages/browser/src/hosted-agent.ts:39`) has no secrets field; `create()` builds the body at lines 134–150. Adding `secretBindings` is ~20 lines. Froggy's own CDP agent cannot use Browser Use bindings; it needs a server-side tool that resolves an alias, checks the focused frame's top origin against an allowlist, and `Input.insertText`s — the same "decides nothing, delivers" property as `WalletBridge`. The AX snapshot renders role + label only (`snapshot.ts:126-127`), so typed values do not enter model context from the form.

[verified] History redaction already strips `password=` pairs, bearer tokens and URL credentials (`docs/product-description/cross-cutting/history-and-persistence.md:31`). Nothing redacts PAN-shaped strings today.

## 3. Cards: why "inject like the wallet" does not transfer, and what does

- There is no in-page protocol for cards the way EIP-1193 is for wallets; `PaymentRequest` `basic-card` is gone. The only route is the password-manager one: the server types digits into a merchant form. Once typed, the page owns them.
- PCI forbids retaining the CVC after authorisation, encrypted or not; the commerce review (`docs/research/commerce-2026-09-08/REVIEW.md` §"Existing-card Settings and alternative providers") already rules out a PAN/expiry/CVC DB field for a *reusable* card and recommends provider-hosted enrolment (Crossmint save-card → `paymentMethodId` → one-time agent card; Stripe Link, US only).
- A **disposable / just-in-time-funded card** bounds the damage of any leak to the balance the person chose seconds earlier, which is what makes server-side typing acceptable for the demo. The card is the policy.
- Browser Use also has `agentcardWalletId` (project AgentCard wallets, admin-funded beta, read-only API) and `stripeLinkConnectionId` (project Stripe Link, connected in their cloud UI) on `RunCreateRequest` [verified]. Both are the **operator's** money, not the person's; fine for a demo where Froggy pays, not a per-user product.
- Demo trap [verified from the code]: `Accessibility.getFullAXTree` (`snapshot.ts:165`) returns only the main frame, so Froggy's own agent cannot obtain a click ref inside a Stripe Elements / Adyen **cross-origin iframe**. `Input.insertText` itself works into a focused OOPIF. Pick a merchant whose card form is same-document (Stripe Checkout hosted page, Shopify checkout, most WooCommerce) or run the card step through the hosted agent.

## 4. Froggy's chain footprint today

[verified] `Network` (`packages/domain/src/money.ts:24`) is Base, Base Sepolia, Hedera ×2, Solana ×2. `EvmNetwork` (`packages/payments/src/evm.ts:27`) is Base / Base Sepolia only. `OnchainNetwork` for the wallet monitor (`packages/domain/src/wallet-monitor.ts:20`) is `eip155:8453` and `eip155:4663` (Pons). The Privy person-policy pins `chainId` per rule (`person-policy.ts`). `sendUsdc` (`apps/server/src/usdc-transfer.ts`, used by `tools.ts:1079`) is Base-only via `EVM_NETWORK`. **Linea (59144) appears nowhere except `UNISWAP_NETWORKS` in `apps/server/src/trading/uniswap.ts:38`**, and `UNISWAP_CHAINS` in `.env.example:245` does not configure it.

[verified] The Uniswap adapter is same-chain only today: `tokenInChainId` and `tokenOutChainId` are both `chainIdOfQuote(input)` (`uniswap.ts:672-673`), and `uniswap.ts:353` refuses any `recipient` that is not the person's wallet. Enso is pinned to mainnet (`enso.ts:152`) and also pays back to `input.wallet`. Neither bridges.

## 5. Uniswap Trading API cross-chain — what exists

Source: `https://trade-api.gateway.uniswap.org/v1/api.json` (fetched 13 Sep, saved only in the session scratchpad) and the two docs pages below, read through `developers.uniswap.org/llms.mdx/...` because the HTML URLs 303 there.

- [verified] `Routing` enum: `CLASSIC, DUTCH_LIMIT, DUTCH_V2, DUTCH_V3, BRIDGE, LIMIT_ORDER, PRIORITY, WRAP, UNWRAP, CHAINED`. `/quote` "may be used to get a quote for a swap, a bridge, or a wrap/unwrap". The request format is unchanged for cross-chain: set `tokenInChainId ≠ tokenOutChainId`.
- [verified] `BridgeQuote` = `{ quoteId, chainId, destinationChainId, swapper, input, output, tradeType, gas…, estimatedFillTimeMs, exclusiveRelayer, exclusivityDeadline, fillDeadline }`. The bridge provider is **Across Protocol** (integration guide, §Slippage: "quoted through the bridge provider (Across Protocol)").
- [verified] `/swap_5792` accepts `quote: ClassicQuote | WrapUnwrapQuote | BridgeQuote | Dutch… | PriorityQuote` and returns `CreateSwap5792Response = { requestId, from, chainId, calls: TransactionRequest5792[] (to, data, value, gas…), gasFee }` — i.e. the `wallet_sendCalls` shape. `/swap_7702` is the 7702 analogue; `/wallet/check_delegation` reports delegation status per chain. `walletExecutionContext` on `/quote` and `/plan` is marked `x-internal`.
- [verified] **Chained Actions** (concept page `docs/trading/swapping-api/concepts/chained-actions`, integration guide `…/start-building/chained-actions-integration`): `/quote` returns `routing: "CHAINED"` automatically when a trade cannot settle in one transaction. Then `POST /plan { routing: "CHAINED", quote }` → `planId` + ordered `steps`; `PATCH /plan/:planId { steps: [{ stepIndex, proof: { txHash | signature } }] }` advances; `GET /plan/:planId[?forceRefresh=true]` polls and re-quotes remaining steps. Step `method` ∈ `SEND_TX | SIGN_MSG | SEND_CALLS`, `payloadType` ∈ `TX | EIP_712 | EIP_5792`, `stepType` includes `APPROVAL_TXN, APPROVAL_PERMIT, CLASSIC, BRIDGE, SWAP_BRIDGE, …`; statuses `NOT_READY → AWAITING_ACTION → IN_PROGRESS → COMPLETE | STEP_ERROR`. Patterns: S→B, B→S, S→B→S (ETH as the bridge medium). Exact-input only; Solana unsupported; `permitData` always null; a plan is owned by the API key that created it (403 otherwise); "bridge steps can take several minutes".
- [verified] **Proof validation**: "the `from` address must match the expected `swapper`, and the calldata must match what the step specified. Any change to the transaction before submission fails validation." Consequence [inferred]: an EIP-7702 batch whose outer transaction wraps several steps will not validate as proof of one `SEND_TX` step; each plan step must go as its own (possibly single-call, still sponsored) batch unless the plan itself emits `SEND_CALLS` steps.
- [verified] Linea `59144` is in the `ChainId` enum and in `UNISWAP_NETWORKS`.
- **Not verified** (needs the key): whether USDC(Base)→USDC(Linea) returns `BRIDGE` or `CHAINED`; whether `recipient ≠ swapper` is accepted on a bridge or chained quote; what `/swap_5792` returns for a `BridgeQuote` (expected: `[USDC.approve(SpokePool), SpokePool.depositV3(...)]`).

## 6. Privy EIP-7702 fit

[verified] ADR 0027 and `packages/wallet/src/privy-execution.ts`: the embedded EOA is delegated through EIP-7702 and Privy's native `wallet_sendCalls` sponsors its atomic batch (`sponsor: true`, `caip2: EvmTradingNetwork`, 1–8 calls). The browser signs the exact Privy request; an agent trading rule cannot authorise the batch; delegation persists per chain and is live on Base / Base Sepolia. `Trade` (`packages/domain/src/trade.ts`) is up to 8 `TradeStep`s (`kind ∈ approve | permit | swap | deposit | withdraw | claim`), each with its own approval, fingerprint, `managed` Privy request, status and recovery — a plan, in Uniswap's sense, already exists in the domain.

Consequences for funding a Linea card from Base [inferred from the verified pieces]:

- A pure USDC→USDC bridge is **one sponsored batch on Base** (`approve` + `depositV3`); the Across relayer delivers on Linea to `recipient`. No Linea delegation, no Linea gas, no Linea Privy rule. Linea enters Froggy only as a read-only RPC for the monitor.
- "Swap then bridge to a different address" has three shapes, compared in the plan: (1) Uniswap `CHAINED` with `recipient` = card; (2) two Froggy `TradeStep`s — existing swap to own wallet, then `BRIDGE` via `/swap_5792` to the card; (3) one atomic batch bridging `minimumOutput`, which Uniswap's quote simulation will likely not accept because the USDC is not held at quote time, and which would need Across's own fee API to build `depositV3`.

## 7. The probe that closes the open questions (not run)

The Uniswap key is in Railway (`railway status` shows project `froggy`, env `production`, linked from the repo); no local `.env` carries it. Run with the key read straight into the request so it is never printed:

```bash
UNISWAP_API_KEY="$(railway variables --json | jq -r .UNISWAP_API_KEY)" \
curl -sS -X POST https://trade-api.gateway.uniswap.org/v1/quote \
  -H "x-api-key: $UNISWAP_API_KEY" -H 'Content-Type: application/json' \
  -d '{"tokenIn":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
       "tokenOut":"0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
       "tokenInChainId":8453,"tokenOutChainId":59144,"amount":"25000000",
       "swapper":"<person EOA>","recipient":"<card funding address>",
       "type":"EXACT_INPUT","slippageTolerance":0.5}'
```

Unauthenticated, this returns `401 {"errorCode":"Unauthorized"}` [verified]. Read off: `routing` (`BRIDGE` vs `CHAINED`), whether `recipient` is echoed or rejected, `estimatedFillTimeMs`. Then feed the `quote` object to `/swap_5792` and read `calls[]`. Token addresses: USDC on Base `0x8335…2913` [verified in the repo]; USDC on Linea `0x1762…1ff` [from memory — confirm against Circle's USDC contract list before pinning it in code].

## 8. What this does not change

- ADR 0024's decision row 24 still stands for the submission: the injected provider is post-submission work; this research is for the work after it.
- No bridge code, Linea network literal, card vault or Browser Use secret binding exists yet. Everything in §2–§6 that says "add" is unbuilt.
