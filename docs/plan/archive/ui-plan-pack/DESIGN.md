# Visual brief: a calm wallet with a frog accent

Baseline: `a587f55`. Direction chosen by the owner on 6 September 2026. All layouts and copy below are implementation targets, not shipped behavior.

## What the screen should communicate

Within a few seconds: what funds are known, what the agent may spend, and the next useful action. The frog supplies warmth. The receipt supplies the distinctive product detail. Money and operational status remain easy to read.

| Before | After | Why |
| --- | --- | --- |
| Wallet embedded as an auto-following chat item | A real wallet section before a conversation starts; a compact wallet entry during work | The first visit needs a stable starting point |
| Three balances, protocol notes and three similarly weighted actions | One labeled overview, separate wallet funds and task credit, one state-dependent primary action | People can tell what they have and what to do |
| Full mandate ticket plus numbered demo prompts | One-line limits summary and one useful task starter | Lower the reading burden before the first task |
| Five tight drawer tabs; agent CTA opens Policy | Explicit destinations and a dedicated agent setup surface using existing components | The label predicts the result |
| Grain, gradients and shadows on many surfaces | Quiet warm background, white content surfaces, restrained elevation | Stronger hierarchy with fewer competing effects |
| Long repeated entrances and a large refusal stamp | Immediate readable content with short, purposeful feedback | Daily use should feel calm and fast |

## Layout

Keep one main route and the existing browser pop-out modes. Do not introduce a dashboard navigation system just to restyle this screen.

- **Desktop, 1024px and above:** centered content up to 1024px, 24px page gutters, 24px section gaps. Header: frog/wordmark, concise spending status, browser and settings actions. The first-use content starts with wallet overview; funding/setup guidance follows; a compact task starter and composer finish the screen. Conversation text stays at a readable maximum of 768px. The existing split browser may use the remaining available width.
- **Tablet, 768–1023px:** single content column, 24px gutters. Wallet amounts and actions wrap at explicit group boundaries. Preserve the existing mobile browser-control capability boundary.
- **Phone, 320–767px:** 16px gutters, 16px section gaps, 16px card padding. A compact header and overview title/amount/primary action appear before account details. Use native page/section scrolling for first use; never a pinned full wallet consuming the entire chat viewport. Composer respects the keyboard and safe-area inset. Setup uses a full-width accessible sheet with its close control visible.
- **During a run:** preserve conversation and live-page visibility. A compact Wallet control opens the overview without losing chat position. A wallet update must not move the conversation or reset its anchor. Keep approvals reachable even if the browser is popped out.

```text
Frog + Froggy                     Browser   Settings

Your wallet
Known total / Total unavailable
Wallet funds       Task credit
[One next action]   Connect an agent
Limits summary                       Edit limits
Account details / networks / addresses (expand)

Get started / Your agent setup / Recent activity

Ask Froggy to do a task…                      Send
```

The illustration describes reading order, not an obligation to squeeze all content above the fold. At 390×844, the heading and primary wallet action must be visible on first load. At 200% text size, content may scroll but controls must remain reachable.

## Visual system

Use the existing semantic tokens in `packages/ui/src/styles/globals.css`; no new palette package or font download.

| Element | Target |
| --- | --- |
| Background | Existing warm `--background: oklch(0.982 0.006 95)`; remove fixed decorative gradients and grain from the workspace |
| Content | Existing white card/popover tokens; border for grouping, `shadow-card` only for the main wallet and receipt surfaces |
| Primary action | Forest green: `--primary: oklch(0.48 0.13 148)` with white `--primary-foreground`; verify contrast in browser before accepting |
| Frog accent | Existing `--brand-soft` and a small existing `FrogMark`; preserve its shape, use it at the header and first-use entry, not every card |
| Type | Existing Onest for body and controls; Bricolage for key headings and money; IBM Plex Mono only for identifiers and technical evidence |
| Scale | Overview amount 40px/44px desktop, 32px/36px mobile; section heading 20px/28px; body/controls 14px/20px; explanatory text at least 12px/18px |
| Rhythm | 4/8/12/16/24/32px spacing; use rem equivalents for type and spacing; preserve the existing radius tokens |
| Interaction | Main touch actions and sheet close controls at least 44px high; quiet text actions still have comfortable hit areas; visible keyboard focus |
| Status | Amber = agent/action needed, blue = human driving, red = refusal/error, green = primary action/confirmed success; always pair status color with text |

Keep the perforation for receipts and approvals. Remove it from setup summaries and ordinary wallet rows. Do not turn every container into a raised card. Keep tabular figures stable; use font weight and grouping rather than all-caps labels everywhere. Avoid blanket transparency or blur; solid sheets are suitable for reading financial details.

## Onboarding language and states

Suggested sign-in headline: **“A wallet for your agents.”** Supporting sentence: **“Fund tasks, set spending limits, and follow the work.”** Existing sign-in methods remain. Initialization failure offers Retry; details belong in diagnostics, not instructions to open a console.

Use **Wallet funds**, **Task credit**, **Add funds**, **Add task credit**, **Connect an agent**, **Spending limits**, **Activity**, and **Account details** consistently. Explain task credit as an amount available for Froggy tasks. Show the live HBAR balance separately as account information; do not assert it always equals the dollar ledger.

| State | Primary action | Explanation |
| --- | --- | --- |
| Balance loading/unavailable | Retry or view account details | Unknown is not zero; partial totals are labeled |
| Known zero wallet funds and zero task credit | Add funds | Funds arrive in the wallet before task credit can be allocated |
| Wallet funded, task credit empty | Add task credit | Review a chosen amount before submitting |
| Credit available, no agent configured | Connect an agent | “Use Froggy here” remains available |
| Token created, never used | View setup instructions | “Waiting for first use,” not “Connected” |
| First authenticated agent use recorded | Run a task / inspect activity | Completion follows server evidence |
| Onramp submitted | View wallet / refresh | A provider callback does not prove spendable funds |
| Allocation pending or uncertain | View status / recovery | No automatic second debit |

The guided funding surface is the recommended presentation within the chosen visual direction. It does not authorize automatic transfers. The current chat-based top-up remains explicitly labeled as a request until the backend exposes a durable operation and outcome.

## Motion character

Most of this interface should remain still. Shared token targets: ease-out `cubic-bezier(0.23, 1, 0.32, 1)`, drawer `cubic-bezier(0.32, 0.72, 0, 1)`, and in-place movement `cubic-bezier(0.77, 0, 0.175, 1)` only where needed. Copy feedback: 125ms opacity. Setup content: 200ms opacity. Sheet: 250ms transform plus opacity. Approval: 200ms opacity only. No arbitrary animation delay.

Do not animate numerical balances, transaction identifiers, streamed tokens, command menus, tab/focus navigation, Stop, or browser input. No mascot loop, confetti, springy account balance, swipe-to-approve or hold-to-stop. The frog can stay still and still give the product personality.
