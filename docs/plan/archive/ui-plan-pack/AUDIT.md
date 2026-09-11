# Visual and motion audit

Baseline `a587f55`, 6 September 2026. Source read-only. Prior controlled UI captures were re-inspected; no new animation recording or frame-rate measurement was made. UI source is unchanged since the capture baseline `d735e67`.

Applied: frontend-design, emil-design-eng, improve-animations, find-animation-opportunities and apple-design. Repository browser/leash/verification constraints were also checked. The owner's calm wallet direction takes precedence over decorative recipes in any skill.

## Recon

React 19.2.8; Motion 13.2.0; Tailwind 4.3.3; shadcn base-nova with Base UI 1.8.0; tw-animate-css 1.4.0. Existing typography and colors are centralized in `packages/ui/src/styles/globals.css`. Motion timings are scattered across component classes, CSS keyframes and one workspace spring (`damping: 38, stiffness: 420`). `apps/web/src/main.tsx:26` sets `MotionConfig reducedMotion="user"`; that does not govern separate CSS or imperative DOM scrolling.

Frequency is an audit assumption, not measured analytics: typing, browser input and keyboard navigation are very frequent; scroll indicators/disclosures/copy are frequent; settings/approvals are occasional; first-use setup is rare. Performance findings describe code risk, not measured dropped frames.

## Product and visual findings

| Priority | Location | Evidence and implication | Plan |
| --- | --- | --- | --- |
| HIGH | `apps/web/src/components/stream/stream.tsx:106`, `:123` | Wallet is a message-scroller item under unconditional auto-scroll. Earlier 390×844 capture measured wallet y=-519, height=517: entirely above the viewport on arrival. `defaultScrollPosition="start"` alone did not prevent this. | 001 |
| HIGH | `apps/web/src/routes/workspace-page.tsx:307`; `components/drawer/details-drawer.tsx:411` | Connect only opens a drawer whose default tab is Policy. Reproduced in the prior controlled run. | 001/002 |
| HIGH | `apps/web/src/components/wallet/wallet-home.tsx:107` | The total substitutes zero for an unknown balance whenever another amount is known. The displayed total can look complete when it is not. | 001 |
| HIGH | `apps/web/src/components/wallet/wallet-home.tsx:204`; `components/cards/receipt-ticket.tsx:49` | Wallet calls an allowed receipt “paid” when no failure exists, even if there is no settlement. Full receipt already distinguishes allowed/unsettled. | 001 |
| HIGH | `apps/web/src/routes/workspace-page.tsx:167` | Stop ignores HTTP failure and detaches local chat regardless of outcome. The restored Send control is not evidence that the server stopped. | 004, pull forward |
| MEDIUM | `apps/web/src/components/leash-meter.tsx:66`; `packages/ui/src/components/progress.tsx:43` | Caller supplies a track; shared Progress appends another. Two spending bars render, including conflicting colors when history is unavailable. | 001 |
| MEDIUM | `apps/web/src/components/drawer/agent-settings.tsx:88`, `:99`, `:116`, `:173` | Query/mutations throw, but the rendered UI has no loading/error/retry states. A minted token is described as connected before first use. | 002 |
| MEDIUM | `apps/web/src/components/sign-in-gate.tsx:74`, `:104` | Failure directs the user to the console; unconditional testnet-only copy contradicts the configurable/mainnet direction. | 002 |
| MEDIUM | `apps/web/src/components/stream/empty-state.tsx:36`, `:70`; `wallet/wallet-home.tsx:265` | Full mandate, chain/host identifiers, four demo actions and wallet funding actions compete. The fixed $1 top-up sends a chat prompt. | 001/002 |
| LOW | `packages/ui/src/styles/globals.css:752`, `:775` | Fixed background gradients and grain compete with many raised cards. This is a design judgment for the selected direction, not a performance diagnosis. | 001 |

## Vetted motion findings

| # | Severity | Category | Location | Finding | Fix summary |
| --- | --- | --- | --- | --- | --- |
| M1 | MEDIUM | Accessibility | `packages/ui/src/components/sheet.tsx:54`; `alert-dialog.tsx:55`; `message-scroller.tsx:111` | Active CSS sheet, Delete dialog and jump-control translation/scale lack reduced-motion handling. | Explicit opacity-only reduction in 003 |
| M2 | MEDIUM | Accessibility | `apps/web/src/lib/scroll-to-live.ts:11` | Always requests smooth scrolling, including under reduced motion and keyboard activation. | Immediate native scroll for this frequent navigation in 004 |
| M3 | MEDIUM | Cohesion | `apps/web/src/routes/workspace-page.tsx:354`; `components/cards/approval-ticket.tsx:72` | Motion spring wrapper and 420ms CSS rise-in animate the same approval together. | One short opacity transition, immediately usable controls in 004 |
| M4 | MEDIUM | Frequency / interruptibility | `apps/web/src/components/browser/browser-strip.tsx:38`; `routes/workspace-page.tsx:289` | Scroll-boundary remount restarts the 420ms entrance; exit is immediate. | Remove entrance on this frequently appearing control in 004 |
| M5 | MEDIUM | Easing / duration | `packages/ui/src/components/message-scroller.tsx:111` | Jump control exits over 400ms with accelerating `cubic-bezier(0.7,0,0.84,0)`. | 125ms opacity-only state transition in 003 |
| M6 | MEDIUM | Purpose / cohesion | `apps/web/src/components/cards/receipt-ticket.tsx:226`, `:262`; `packages/ui/src/styles/globals.css:891`, `:907` | Every receipt replays 420ms rise-in; fresh refusal adds a 1.8×, 360ms overshooting stamp. Reduced motion is already handled for these. | Static historical receipts; small fresh status fade, static money in 004 |
| M7 | LOW | Transition scope / cohesion | `packages/ui/src/components/button.tsx:6`; `tabs.tsx:60`; `badge.tsx:8`; `progress.tsx:24` | Broad transition-all and unrelated local timings; installed progress indicator changes width. No measured frame-drop claim. | Narrow properties; update financial progress immediately; common tokens in 003 |
| M8 | LOW | Accessibility / frequency | `apps/web/src/components/stream/browse-card.tsx:53`, `:141`; `reasoning.tsx:87`; `tool-card.tsx:137` | Repeated disclosure chevrons animate rotation without a reduction branch. | Make the frequent disclosure change immediate in 004 |

## Additive opportunities that pass the gate

| # | Location | Today | Purpose | Frequency | Suggested motion |
| --- | --- | --- | --- | --- | --- |
| O1 | `apps/web/src/components/wallet/wallet-home.tsx:148`; `components/drawer/agent-settings.tsx:60` | Copy text swaps; success never resets and errors are not displayed | Feedback | Occasional within setup; potentially frequent later | Fixed-width feedback slot, opacity 0→1 in **125ms**, `cubic-bezier(0.23,1,0.32,1)`, no position/scale; same gentle opacity under reduced motion. Keyboard copy feedback is immediate. Functional fix precedes motion. Plan 002. |
| O2 | `apps/web/src/components/sign-in-gate.tsx:56`; `components/drawer/agent-settings.tsx:165` | Readiness/setup results replace content abruptly | State indication / preventing a jarring change | Rare first-use setup | New non-interactive status region fades opacity 0→1 in **200ms**, `cubic-bezier(0.23,1,0.32,1)`; no exit wait, positional motion, overlap of readable text or artificial latency. Same opacity under reduced motion; keyboard actions and error rendering remain immediate. Plan 002. |

Both pass the speed gate (<300ms) and function gate: only confirmation/status decoration transitions, not values or controls a person is reading or acting on. No hover motion is proposed. Any future hover movement must be gated by `(hover: hover) and (pointer: fine)`.

## Rejected candidates

- Composer/slash menu and settings tab navigation: frequency/keyboard gate fails. Keep immediate.
- Wallet balances, spending bar, receipt amounts and IDs: function gate fails. Financial data should be stable and update directly.
- Stop, Disconnect, approve/deny and Take the page: function gate fails for delay/celebration. Authority changes and their accurate status cannot wait for choreography.
- Canvas input, browser split resizing and page handoff: direct manipulation; spring smoothing could detach visible feedback from the pointer. No decorative transform of the interactive canvas.
- Whole-screen stagger, repeated frog bounce and success confetti: purpose/frequency gate fails for the daily workspace. Existing frog art and restrained color provide enough personality.

## Cleared and deliberately preserved

Shimmer restores readable static text under reduced motion (`globals.css:642`). Driving-ring motion is already preference-gated (`:869`), with static ownership colors; preserve its documented state-indication purpose. Streamdown already checks reduced motion. The sheet already uses interruptible CSS transitions. Center origin for a centered Delete dialog is correct. TooltipContent, generic Dialog and Switch have no active app callers; they are not shipped-experience findings. ADR 0008's scroller workarounds are deliberate and stay in place.

No blanket conclusion is made about GPU acceleration from Motion shorthand properties or CSS alone. Runtime profiling is needed before claiming jank. The live canvas wrapper's layout animation is a targeted verification risk, not an observed click-offset regression.

## Verdict

Froggy needs less repeated motion and better feedback at a few state boundaries. Copy/error feedback is the highest-leverage additive opportunity; the most important overall fixes are initial layout, accurate financial status, direct setup navigation and confirmed Stop handling. The four linked plans implement that sequence without introducing a new animation stack.
