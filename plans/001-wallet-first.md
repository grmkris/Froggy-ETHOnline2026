# 001 — Make the wallet the first screen

- **Status**: Implemented locally; verification and release limits in [the implementation record](IMPLEMENTATION.md)
- **Baseline commit**: `a587f55` (problem snippets below describe the pre-change code)
- **Severity**: HIGH
- **Category**: Visual hierarchy, navigation and financial presentation
- **Estimated scope**: 8–11 existing files plus one small receipt presentation helper and meaningful tests

## Problem

The first-use wallet participates in chat auto-follow. A prior controlled mobile run at 390×844 measured its rectangle at y=-519, height=517. The relevant source is unchanged at this baseline.

```text
// apps/web/src/components/stream/stream.tsx:106 — current
<MessageScrollerProvider
  autoScroll
  // The empty screen reads from its top; a conversation from its end.
  defaultScrollPosition={items.length === 0 ? "start" : "end"}
```

The same component renders the wallet as `MessageScrollerItem messageId="wallet"` at line 123. `apps/web/src/routes/workspace-page.tsx:307` only sets `detailsOpen` when Connect is clicked; `components/drawer/details-drawer.tsx:411` defaults to Policy.

```text
// packages/ui/src/components/progress.tsx:43 — current
{children}
<ProgressTrack>
  <ProgressIndicator />
</ProgressTrack>
```

`apps/web/src/components/leash-meter.tsx:66` already passes its own ProgressTrack/Indicator children, so two tracks render.

```text
// apps/web/src/components/wallet/wallet-home.tsx:114 — current
return (usdc ?? 0) + (credit ?? 0);
// wallet-home.tsx:208 — current
return receipt.failure === undefined ? "paid" : "failed";
```

These snippets respectively turn an unknown amount into a complete-looking total and call an unsettled allowed receipt paid.

## Target

The owner chose a calm wallet with a playful frog accent. First use begins at the wallet heading and a primary action. During work, chat and live browser remain the focus, with a compact Wallet entry. Balances update immediately without animation or scrolling.

Use existing warm background `oklch(0.982 0.006 95)`, white cards, Onest body, Bricolage headings/money, and IBM Plex Mono identifiers. Set `--primary: oklch(0.48 0.13 148)` and `--primary-foreground: oklch(1 0 0)`; use existing `--brand-soft` behind the frog. Verify rendered contrast. Keep existing radius tokens. Remove workspace grain and fixed decorative gradients. Main content maximum 1024px; conversation maximum 768px. Gutters 24px desktop and 16px mobile; section gaps 24px/16px. Wallet amount 40px/44px desktop and 32px/36px mobile. Main actions and close targets at least 44px high.

Show wallet funds and task credit separately. A combined total appears only when both constituents are known. Otherwise display “Total unavailable” plus the known constituent values and “Balance unavailable” where appropriate. Do not add the displayed HBAR valuation to task credit. Account addresses and chain details sit behind an accessible disclosure.

Receipt status is shared by wallet and full ticket: denied → Refused; ask → Approval required; allowed with settlement → Paid; allowed without settlement or failure → Allowed, not settled; allowed with failure and no settlement → Payment problem, retaining the actual error. Do not infer definite non-payment from an ambiguous failure string.

No new entrance animation, amount tween, auto-scroll timeout or spring is part of this plan. All layout and financial state changes are immediate. Motion refinements have separate plans.

## Repo conventions to follow

- Read `apps/web/AGENTS.md`, both workspace `components.json` files, and `.agents/skills/froggy-browser/SKILL.md` and `froggy-leash/SKILL.md` before implementation.
- `apps/web/src/components/cards/receipt-ticket.tsx:49` already distinguishes settlement from authorization; use that distinction when consolidating, while retaining uncertainty in failures.
- `apps/web/src/components/stream/stream.tsx` and ADR 0008 own conversation anchoring. Keep the ejected shadcn scroller and its documented workarounds.
- Existing Base UI Tabs support controlled `value` and `onValueChange`; use the installed types rather than inventing an API.

## Steps

1. In `workspace-page.tsx`, give first use a normal scroll container outside the message scroller. Render the full WalletHome followed by compact setup/empty content when there is no conversation, active run or requested live browser. Use conversation/run/browser state for this branch, never balance freshness. In the conversation branch remove the wallet message item and add a compact Wallet control. Opening it must preserve the active conversation's mounted state and scroll position. Remove the now-unused Stream header prop in `stream.tsx` if it has no other caller. Do not change user-message anchors or resume behavior.
2. Introduce explicit drawer selection in `workspace-page.tsx` and `details-drawer.tsx`: a typed tab value for policy/history/directory/agents/about. Connect selects agents before opening; Wallet selects about; Spending limits selects policy. Use controlled Tabs. Validate primitive values before storing them. Repeated opening must reach the requested destination, and focus returns to the initiating control.
3. Recompose `wallet-home.tsx`: heading and amount, separate Wallet funds/Task credit, primary/secondary actions, compact limits summary, Account details disclosure, recent activity. Apply the dimensions above and keep the overview readable while data is loading. Provide stable region/heading names. Route existing actions without changing their financial authority. Plan 002 supplies full state-dependent onboarding behavior.
4. Simplify `empty-state.tsx` to one useful task starter and “Use Froggy here.” Remove the full duplicate mandate ticket and duplicate top-up prompt. Remove the hard-coded transfer-to-demo-address action from ordinary onboarding; preserve existing refusal test/demo coverage in its explicit test context. Do not invent a paid-task price or imply a paid task is free.
5. Fix `totalDollars` and row text in `wallet-home.tsx` using the known/unknown rules above. Replace “the HBAR above, priced in dollars” with wording that distinguishes task credit from the onchain account balance. Existing `WalletSummary` lacks timestamps: do not invent a “last updated” value. Contract-level freshness is separate payment/backend work.
6. Create one small app-owned receipt presentation helper, for example `apps/web/src/lib/receipt-status.ts`, used by wallet and `receipt-ticket.tsx`. Preserve detailed denial reasons, evidence, transaction links, stub markers and approval provenance. Do not change domain decisions or settlement data.
7. Fix Progress composition in `packages/ui/src/components/progress.tsx`: children replace the default track when provided, otherwise use the default track. Confirm the current single app caller and its accessible semantics. Keep the custom amber history-unavailable indicator in `leash-meter.tsx`.
8. Simplify `top-bar.tsx` around wordmark, concise spending status, browser and settings actions. Remove duplicate address/credit presentation from the header when the overview already supplies it; retain connection/stub markers and driving ownership. Mobile must not lose stub disclosure. Use the existing frog SVG without redrawing it. In global CSS apply the palette/background changes above; do not re-theme unseen primitives or add dark mode.
9. Update `e2e/onboarding.spec.ts` to check initial viewport and CTA destination before clicking anything that could auto-scroll. Add compact presentation cases for unknown/partial amounts and allowed-unsettled receipts. Keep tests about outcomes, not the precise prose or every utility class.

## Boundaries

- No payment API, policy, custody, ledger or network changes. Read current ownership notes before touching any file shared with another agent.
- Do not make the full wallet sticky above mobile chat. Do not reset the scroller on each wallet update, add arbitrary scroll delays, or reintroduce `content-visibility:auto`.
- Do not animate or add a border to the interactive canvas; its ring and input geometry are a documented contract.
- No new dependencies. If the baseline has materially changed, reconcile the plan and report the difference before applying stale snippets.

## Verification

- **Mechanical:** `bun run check:fast`, `bun run check`, then `bun run e2e -- e2e/onboarding.spec.ts e2e/pop-out.spec.ts`; run the complete `bun run e2e` when the integrated visible changes are ready. Use deterministic stub providers. Report any pre-existing gate failure separately.
- **Browser:** boot locally and check page errors. At 1440×1000, 768×1024, 390×844 and 320×568, assert the wallet heading and primary action intersect the initial viewport before interaction. After late wallet data arrives, scroll position stays stable. No horizontal overflow, including at 200% text size.
- **Interaction:** Connect → Agents, close → same trigger, reopen → Agents. Wallet entry during a run does not lose the conversation. Exactly one spending track exists, including history-unavailable state. Unknown USDC plus known credit never presents a complete total. Allowed without settlement never says Paid.
- **Feel check:** inspect first load and late data updates at normal speed and slowed animation playback; there should be no wallet entrance or scroll jump. Reduced motion produces the same stable layout. Confirm mobile composer/keyboard and desktop pop-out still work.
- **Done when:** the wallet is visibly first, the next action is clear, financial labels match available evidence, and the checked-in behavior passes the checks above.
