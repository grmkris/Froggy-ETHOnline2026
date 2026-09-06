# 002 — Guide funding and agent setup

- **Status**: UI implemented and locally verified; durable funding contract and live onramp verification remain open. See [the implementation record](IMPLEMENTATION.md).
- **Baseline commit**: `a587f55` (problem snippets below describe the pre-change code)
- **Severity**: HIGH
- **Category**: Onboarding, actionable feedback and two motion opportunities
- **Estimated scope**: 6–9 app files, two focused reusable app components, existing onboarding tests

## Problem

```text
// apps/web/src/routes/workspace-page.tsx:310 — current
onTopUp={(amountUsd) => {
  send(`Top up the pocket with ${amountUsd} USDC`);
}}
```

The wallet's fixed $1 button requests a chat turn rather than exposing a durable funding operation. `apps/web/src/components/wallet/wallet-home.tsx:117` and `components/drawer/details-drawer.tsx` duplicate funding presentation. `components/drawer/agent-settings.tsx:88–129` throws query/mutation failures but does not render those states.

```text
// apps/web/src/components/drawer/agent-settings.tsx:184 — current
<span className="text-muted-foreground block text-xs">
  connected {when(token.createdAt)} · last used{" "}
  {when(token.lastUsedAt)}
</span>
```

A minted token is not proof that an agent has used it. Copy handlers in this file and wallet-home await clipboard writes without handling errors; “Copied” never resets.

```text
// apps/web/src/components/sign-in-gate.tsx:103 — current
<p className="text-muted-foreground mt-3 text-center text-xs">
  Testnets only. Nothing here holds real funds.
</p>
```

The unconditional network claim is incompatible with configured mainnet operation. The failure branch at line 74 also asks a user to inspect the console.

## Target

Sign-in → understandable wallet → one next step → connected agent or in-app task → result and receipt. Preserve both agent setup before funding and direct use of Froggy. Do not force a tour.

Use “A wallet for your agents” and “Fund tasks, set spending limits, and follow the work” at sign-in. Show Retry on initialization failure. Display configured network/stub facts when available; omit unsupported financial claims before session configuration is known.

| State | UI and action |
| --- | --- |
| Loading | Stable wallet/setup skeleton; no empty-list assertion until the query resolves |
| Balance unavailable | Explain that balance is unavailable; retry/read account; do not show zero |
| Known zero funds and credit | Add funds primary, Connect an agent secondary |
| Known wallet funds, empty credit | Add task credit primary; review chosen amount |
| Existing credit, no configured agent | Connect an agent primary; Use Froggy here secondary |
| Token minted | Show skill once with copy control; Waiting for first use |
| `lastUsedAt` recorded | Agent has connected; allow next task and show last-use time |
| Create/list/disconnect failed | Inline action-specific error and Retry; retain form input/current connection |
| Provider submitted/confirmed | Submitted to provider / Waiting for wallet funds; do not claim an onchain deposit |
| Chat top-up requested | Top-up requested; inspect the run/receipt, with no fabricated completed state |

Keep new feedback small. Copy confirmation occupies a stable-width slot and fades opacity 0→1 in **125ms**, easing **cubic-bezier(0.23,1,0.32,1)**. Reset its success label after **2000ms**, clearing the timer on unmount and restarting it after a new successful copy. This timer controls feedback persistence, not operation latency. Errors remain until retry or dismissal. Keyboard activation updates immediately. Reduced motion keeps the same gentle opacity, with no translation, rotation or scale.

New non-interactive first-use status content may fade opacity 0→1 in **200ms**, the same ease-out. Render controls and errors immediately, with no exit wait, height tween, double text overlap or stagger. Keep the frog static. If plan 003 has landed, reuse its exact tokens; otherwise add the same two CSS variables to the existing stylesheet, not another timing system.

## Repo conventions to follow

- `apps/web/src/lib/privy.tsx:50` defines current `FundOutcome`; `:232` implements `addFunds`. Reuse it. The onramp is explicitly Base mainnet today, so eligibility must not imply it funds a configured Sepolia wallet.
- `agent-settings.tsx` already uses TanStack Query and Effect Schema. Preserve the installed versions and decoders; no Zod or second server-state cache.
- Use existing Base UI Sheet/Button/Input/Textarea and their accessibility behavior. Main controls and close target at least 44px high; 16px mobile padding, full-width sheet on phones, 448px maximum on desktop.
- Spending controls stay outside the model; read `.agents/skills/froggy-leash/SKILL.md`. A nicer form must not bypass the existing mandate or invent a client-side allowance.

## Steps

1. In `sign-in-gate.tsx`, update the product copy and failure state. Use a clearly labeled Retry action that reloads initialization through the existing page lifecycle; do not install a competing Privy provider. Preserve loading vs signed-out separation. Remove the unconditional testnet claim. Keep actual configured and stub information visible once available.
2. In `details-drawer.tsx`, compose explicit destinations introduced by plan 001. Agents should present a clear setup heading, one name input and next action. Keep secondary settings available but move technical session/signer/WebMCP details under an Account details disclosure. No new navigation framework or swipe gesture.
3. In `agent-settings.tsx`, render initial query pending/error, mint pending/error and revoke pending/error separately. Use action-specific labels such as Creating connection / Disconnecting. Disable the relevant duplicate action while pending, not unrelated controls. A failed revoke leaves the agent entry and a retry action. Never optimistically claim a disconnect the server rejected.
4. Replace “connected at creation” with Created / Waiting for first use until `lastUsedAt` exists. Provide a Refresh status action; refresh once on returning to the window while setup is open using the existing query facilities. No constant polling loop. Preserve the minted skill in memory until the user acknowledges it; closing/reopening setup should not silently discard an unacknowledged secret. Keep that short-lived state in a mounted setup host, not localStorage, URLs, logs or analytics. Once acknowledged, clear it. A reload may require creating a new token; explain that limit without faking recovery.
5. Extract one app-owned CopyButton for wallet address, Hedera account and agent skill callers. Accept text plus an accessible label, e.g. Copy Base wallet address. Catch clipboard refusal, show inline error, keep source text selectable and leave Retry possible. Implement the fixed-width success behavior above. Use existing local component state and a cleanup timer; no toast dependency. Do not move credential handling into the generic UI package.
6. Consolidate funding presentation into one app-owned component under `components/wallet/`, used by home and the drawer. Keep Add funds separate from Add task credit inside the guided surface. Explain their relationship next to the controls. Reuse `identity.addFunds`, display provider outcome accurately and catch unexpected failure. Preserve pending status when the provider window closes. When the configured spending network does not match the current onramp destination, state that limitation and do not offer it as a working way to fund that network.
7. For the current top-up path, allow a valid explicit amount, show its USDC/credit meaning and current limits, then submit exactly once through the existing callback. Disable submission while chat is busy/disconnected or the amount is invalid. Label the outcome **Top-up requested**, with a link to the run/receipt; do not make the model's prose or a timer drive success. Unknown balance is not a zero balance and not proof of sufficient funds. This completes the honest UI portion without changing payment authority.
8. Complete the durable funding step with the backend owner before marking the full guided flow done. Current `apps/server/src/tools.ts:553` owns `wallet_topup`; reuse its underlying operation for an authenticated explicit top-up command rather than duplicating the spend. The contract must bind a stable operation/idempotency ID to amount/user, distinguish requested/submitted/uncertain/confirmed, correlate receipt/run, expose partial allocation recovery and update wallet state. Version/decode it using the existing Effect contracts and TypeIDs. Do not infer success from an unrelated balance increase. The earlier improvement review covers the server work; this UI plan does not claim that contract already exists.
9. Extend `e2e/onboarding.spec.ts` or a focused sibling with agent create failure/retry, disconnect failure, first-use status, clipboard denial and provider-pending display. Test funded and unfunded behavior with deterministic fixtures. Remove repeated copy assertions displaced by these behavior checks. In `suggestions.test.ts`, remove the sentence-forbidding assertion; retain the count limit and state-dependent suggestions.

## Boundaries

- Dependencies: plan 001 layout/navigation; plan 003 shared timing tokens. Keep backend-dependent funding explicitly incomplete until correlated operation outcomes exist.
- No automatic top-up after an onramp callback. No grant of free credit, network switch, wallet transfer or real-provider test in stub e2e.
- Do not change policy authority, remove existing custody fallback, or make the assistant approve itself. No money-moving API implemented from an assumed contract.
- No new dependencies, onboarding engine, global event bus, fabricated connection success or persistent credential copy.
- Recheck live ownership and source drift before edits. Report material contract mismatches rather than patching around them.

## Verification

- **Mechanical:** `bun run check:fast`, `bun run check`, `bun run e2e -- e2e/onboarding.spec.ts`, then integrated `bun run e2e`. Keep all providers deterministic stubs; report existing gate failures separately.
- **Journey:** use zero starting credit, known funds, unknown balance, provider cancellation/submission, token creation failure and disconnect failure. Every state has a next action. One click sends one request. Closing/reopening setup retains unacknowledged skill text only in memory; acknowledgment clears it.
- **Keyboard/accessibility:** focus moves meaningfully into the setup surface and returns to its trigger. Escape works. Errors are announced once near the action. Copy controls have unique names. Test at 390×844 with the keyboard open and at 200% text size.
- **Feel check:** inspect copy success and setup status at normal speed and 10% animation playback; no width movement or double-exposed text. Toggle reduced motion: no positional effect. Keyboard navigation/activation and error messages do not wait for animation.
- **Done when:** setup succeeds and fails intelligibly; funding distinguishes request, provider callback and confirmed available funds; the durable allocation path has correlated recovery evidence, not merely polished pending UI.
