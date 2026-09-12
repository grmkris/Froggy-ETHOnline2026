# 0024 — Froggy as the wallet a dapp finds in the shared Chrome

Status: **proposed**, 12 September 2026. Not implemented. Written against `main` at `0348bd27f1b683ee157151b5a5bbd2ecb00f082a`. Reopens `docs/plan/DECISIONS.md` row 24, which recorded the injected provider as cut for the submission; that cut stands for the submission and this decision is for the work after it. Research: [`docs/research/BROWSER_WALLET.md`](../research/BROWSER_WALLET.md). Plan: [`docs/plan/BROWSER_WALLET_IMPLEMENTATION.md`](../plan/BROWSER_WALLET_IMPLEMENTATION.md).

## Context

Dapps discover wallets through EIP-1193/EIP-6963 in the page. Froggy's shared Chrome has no wallet in it: the browser pays only by observing a top-level HTTP 402 and replaying one request with a payment header (ADR 0014, `PaymentNavigation`). The Browser Use issue this grew from asks for wallet access inside a hosted browser without a MetaMask fork and without new custody.

Froggy already has the pieces a wallet needs except the page-side provider: one CDP socket per person's browser (`CloudCdp`, ADR 0018), per-tab adoption with a pre-`ready()` hook (`TabRegistry.adoptTab`), a human approval registry answered only on the authenticated app socket (`InteractionRegistry`), a pure policy with provenance and a human line (`authorize`), receipts for allow and refuse, a per-person Privy policy that leaves ask-side kinds without a rule so the agent key cannot sign them (ADR 0019), and the person's own key in Froggy's web app through `@privy-io/react-auth`.

Two facts constrain transport and signing:

- Browser Use Cloud documents no way to install a customer extension; both `/api/v3` and `/api/v4` browser and profile schemas lack any extension field. The CDP `Extensions.loadUnpacked` command needs a directory on the browser host. `/api/v3` is still documented with the same schema as v4, so no version migration is involved.
- The server-side owner-signing exchange (`authorization_context.user_jwts`) has been refused by Privy on this app since 7 September (`docs/evidence/PRIVY.md`), while browser-SDK signing in Froggy's app worked live on 10 September.

## Decision

1. **Transport: CDP injection over the existing socket.** In `adoptTab`, before `view.ready()`, a per-tab `WalletBridge` installs a provider named "Froggy" with `Page.addScriptToEvaluateOnNewDocument` and a one-way channel with `Runtime.addBinding`; replies go to the exact originating execution context by `uniqueContextId` and fail closed when it is gone. No second controller, no second socket, no await of a human inside a CDP command. The MV3 extension stays the goal for browser-verified attribution and is gated on Browser Use offering customer extensions; the wire contract (`BrowserWalletRequest`/`Reply`/`Event`) is transport-neutral so the bridge can be replaced without touching the wallet.
2. **Identity and discovery.** EIP-6963 first, `window.ethereum` only if undefined and never clobbering another wallet, an rdns under a domain Froggy controls, no MetaMask impersonation. One chain per deployment (`EVM_NETWORK`). The account disclosed is the person's embedded EOA; disclosure is a per-origin, revocable connection grant and is not signing authority.
3. **Authority.** Every dapp request is a durable `WalletRequest` (new TypeID), not a `Purchase` or a `Trade`. Everything the page supplies is `page` provenance and stays unpayable for the agent; the person's answer to the exact card, bound to the request fingerprint, is what lifts that one request. `dapp_transaction` and `dapp_signature` are ask-side kinds in `packages/domain/src/authority.ts`, so the standing agent key gets no Privy rule for them. No fallback from any refused path to owner credentials exists because no delegated path exists.
4. **Signing.** The person signs in Froggy's own web app with their own key through the Privy browser SDK; the signed payload returns on the authenticated app socket; the server records the signed identity, broadcasts, and answers the dapp. The server never holds a new key and never uses the agent key for dapp requests.
5. **Refusal by default.** Unlimited allowances, SIWE messages whose domain is not the requesting origin, requests from the wrong chain or a `from` that is not the person's EOA, contract creation, and every method outside the release-1 matrix are refused with a named reason and a receipt.
6. **Lifecycle.** `pending → awaiting_approval → approved → signed → sent → confirmed | failed | uncertain`, plus `declined | expired | cancelled | undeliverable`; restart after `signed` rebroadcasts once and reconciles by hash; nothing re-signs. Revocation and `deny_stop` emit `disconnect`. Nonces are assigned by the server under one per-wallet serial shared with transfers and trade preparation.

## Consequences

- `packages/browser` gains a MAIN-world script and a bridge under ADR 0004's existing CDP exception; it still cannot import `packages/wallet`.
- `packages/domain`, `packages/protocol`, `packages/wallet` (store), `packages/database` (two tables), `apps/server` (coordinator, recovery, socket handling, blocked-origin list) and `apps/web` (ticket variant, signing hooks, Connections) each change in the plan's order; the domain leaf goes first.
- The hosted Chrome must not be able to reach Froggy's own app origin, so a signed-in Privy session can never exist where the agent or a page can drive it.
- Cross-site iframes are refused in release 1: `CloudCdp.attached()` discards non-page targets today and nested auto-attach is deferred.
- Receipts gain an explicit unpriced shape or a sibling Activity row; which one is an open item.
- `apps/server/AGENTS.md` should be corrected: the browser's lifetime is in `workspaces.ts`; `services.ts` remains the only file importing both browser and wallet.

## Unresolved (why this is proposed, not accepted)

- Browser Use's fork has not been shown to raise `Runtime.bindingCalled`/`executionContextCreated` and honour `addScriptToEvaluateOnNewDocument` alongside `Fetch` interception; one testnet browser-hour closes this.
- `useSignTransaction`/`useSignMessage`/`useSignTypedData` in `@privy-io/react-auth` 3.40.0 accepting a server-fixed nonce and fees and returning raw bytes is unverified in the deployed app.
- Browser Use's answer on customer extensions.
- The rdns and icon.

## Evidence

Local Chromium 151.0.7922.34 driven from Bun over a raw WebSocket reproduced early injection, EIP-6963 announcement, per-context reply routing, clean failure on stale contexts, popup and reload coverage, OOPIF attach behaviour and `Extensions.loadUnpacked` semantics (`docs/research/BROWSER_WALLET.md` §5). A local Chromium experiment does not prove the hosted browser; nothing hosted was run and no paid resource was created for this decision.
