# Home as the Playground — plan

Written 13 September 2026 against `ff235d4`, after the owner looked at the signed-in Home and called it ugly. The four decisions below were taken with the owner the same afternoon. This is the implementation brief; the decision record is `docs/decisions/0041-home-is-the-playground.md` once the work lands.

## What is wrong today

Home is the chat page in its first-use state (`apps/web/src/routes/chat-page.tsx`). Above the scroll area it pins `HomeSummary`: a bordered credits card and a "Recent updates" list. The frog hero (`stream/empty-state.tsx`) sits at the top of the scroll area, the composer is pinned to the bottom, and on a tall screen the hero is stranded between them.

1. **The credits card spends six elements on one number.** Icon chip, "Your credits", "Tools and browser tasks", the figure, a Simulated badge and an arrow. It is drawn with a `border`, which the Passbook system retired in favour of the soft shadow card, so it is the only bordered surface on the screen.
2. **"Recent updates" is machine output.** It lists Watchlist observations, not the Inbox feed: a hex address as a title and a fifteen-decimal ETH balance as the body. Nobody reads that on a home screen.
3. **Nothing lines up.** The card and the list run full width with the page margin; the hero is centred at `max-w-3xl`. Two different columns on one screen.
4. **The hero is timid.** Manrope 600 at 36px with a 112px frog, in the workspace's grey-green, after a landing that promised "A home for your agents" in 800 weight on cream with a rotated lime mark. The person walks through the door and the room is beige.
5. **The dollar balance is missing.** The one figure that says whether Froggy can pay for anything is on Your money, two clicks away, while the credits are on Home.

## Decisions taken with the owner, 13 September

| Decision | Chosen | What it means |
| --- | --- | --- |
| Aesthetic | **Full Playground** | Home's content column takes the landing's palette and voice: cream ground, ink green, 800-weight headline with the rotated lime mark, hard-shadow chips, the sticker. The rail, top bar and bottom navigation stay in Passbook; the owner accepted that the shell will not match. |
| Where the money lives | **One line at the top of Home** | A single row in the hero's column, above it. No icon, no subtitle, no badge, no arrow. Nothing in the rail or the top bar. |
| What the credits bar means | **Left of what you bought** | Fill = available ÷ (available + reserved + spent). It drains as credits are used and refills on purchase. Computable from `CreditSummary` today; no endpoint changes. |
| Recent updates | **One line when unread** | The list goes. When the Inbox has unread updates, one sentence links there. When it has none, nothing. |
| Simulated | **Not on Home** | The stub badge leaves the money line. Your money, receipts and the top bar's stub count keep theirs, so stub discipline holds everywhere a payment is shown. |

## The design

### Palette and scope

The landing's tokens move out of `.landing` into a new `.playground` class in `packages/ui/src/styles/globals.css`, and the landing root carries both classes. Home's first-use column carries `playground` while it is in first use, so the same twelve variables paint both screens and cannot drift.

Passbook (light) Playground, unchanged from the landing:

```css
--background: #f9f6e9;
--foreground: #173e30;
--card: #fffdf7;
--card-foreground: #173e30;
--primary: #173e30;
--primary-foreground: #fffdf7;
--secondary: #e8edca;
--secondary-foreground: #173e30;
--muted: #e8edca;
--muted-foreground: #506658;
--border: #254230;
--ring: #46744a;
--playground-accent: #d7f975;
```

Lilypad (dark) Playground, new — the landing is light-only, but a signed-in person on Lilypad reaches Home, and a cream column inside a dark shell is not an option:

```css
--background: #0f2419;
--foreground: #f3f0e2;
--card: #163021;
--card-foreground: #f3f0e2;
--primary: #f3f0e2;
--primary-foreground: #0f2419;
--secondary: #1d3a2a;
--secondary-foreground: #f3f0e2;
--muted: #1d3a2a;
--muted-foreground: #b3c2b5;
--border: #f3f0e2;
--ring: #d7f975;
--playground-accent: #d7f975;
```

The lime stays the accent in both. Inside the Playground it is the landing's accent, used on the mark, the gauge fill and the sticker; the workspace rule that reserves lime for asks applies outside this scope.

### The money line

One row, 44px tall, the full width of the hero's column, a hairline beneath it (`--border` at 18%). The whole row is one link to `/wallet` with the accessible name `Your money: $15.32 balance, 2,000 credits left`.

```
$15.32  BALANCE            CREDITS  [████████████░░]  2,000        YOUR MONEY ↗
```

- **The figure**: `formatUsd(totalUsdMicros)` in the display face, 22/28, weight 800, −0.04em, tabular. `BALANCE` beside it in mono 10px, uppercase, 0.1em tracking, muted.
- **The gauge**: `CREDITS` label, then a 112px × 8px track with a 2px ink border and full radius. Lime fill for what is left; a `--secondary` segment after it for what is held on active work, only when reserved > 0. The count in mono 12px tabular. A non-zero balance never rounds to an empty track: the fill has a 2% floor.
- **`YOUR MONEY ↗`** in mono 10px on the right at ≥640px. Below that the row is still the link; the focus ring says so.
- **Loading**: skeleton bars in the same slots at the same height. The heading beneath must not move when the wallet or credits arrive; `e2e/agent-onboarding.spec.ts` asserts that.
- **Balance unavailable** (`totalUsdMicros === null`): the `balanceLabel` words in the display face at 15px, muted, in place of the figure. Never `$0.00`. The gauge still draws.
- **No credits ever bought** (denominator 0): an empty track and `NO CREDITS YET` in mono. The link still lands on Your money, where Buy credits is.
- **390px**: figure, gauge growing to fill, count. Both labels and the right-hand words hide below 480px.

### The hero

At ≥1024px a grid: copy 1.05fr, art 1fr, aligned centre, 32px gap. The block is centred vertically between the money line and the composer, so on a 900px viewport the headline sits at about forty percent height with the composer beneath it. On short viewports it scrolls.

- **Eyebrow**: `● SMALL FROG. BIG PLANS.` — mono 10px, 0.1em tracking, with the landing's live dot.
- **Headline**: `What can I` / `help with?` — Manrope at weight 800, `clamp(44px, 5.2vw, 72px)`, line-height 0.96, −0.06em. `help` wrapped in a `<mark>`: lime, rotated −3°, `padding: 0 10px 6px`, as the landing's `agents.`. The heading text stays exactly `What can I help with?` because six specs find Home by that name.
- **Subtitle**: `A little research. A trip to plan. Something worth finding.` — 19px, line-height 1.5, −0.025em, muted.
- **Actions**: the three existing actions as Playground chips: card ground, 2px ink border, 6px radius, `3px 3px 0` ink shadow, mono 11px weight 700 uppercase 0.06em, a 15px icon, 44px minimum height. Hover moves the chip 1px into its shadow; press moves it 3px onto it. Under reduced motion only the colour changes.
- **Art**: `next-idea` at up to 300px on the right, overlapping the gutter. The 1.2 MB PNG becomes two alpha WebPs (640 and 320) and the PNG stays as the original, per the pattern in `public/froggy/landing/manifest.json`.
- **Sticker**: the landing's lime circle, 96px, rotated −14°, at the art's bottom left. It reads `THINK BIG. / HOP TO IT.` when nothing needs the person, and `1 THING / NEEDS YOU.` (or `3 THINGS`) when approvals or purchases are waiting, when it also becomes a link that scrolls to the ticket in the composer stack. The count is `app.approvals.length + pendingPurchases`, the same figure the rail badge shows.
- **Below 1024px**: one column. The art sits at 120px to the right of the eyebrow and headline, the sticker hides below 640px, the chips wrap.

### The Inbox nudge

Under the chips, only when `useUpdatesPage().data.unread > 0`:

```
● 3 NEW UPDATES IN YOUR INBOX ↗
```

Mono, the live dot, a link to `/inbox?feed=updates`. It reserves no space when absent; it is below the heading, so its arrival cannot move the heading.

### The composer

Nothing changes in `composer.tsx`. Inside the Playground it inherits the tokens: cream surface, ink-green send button with a cream icon, which is the landing's call to action. The first build checks this visually rather than assuming it.

### The first send

When the first message goes, `firstUse` flips, the `playground` class leaves the column and the workspace tokens return. The column transitions `background-color` and `color` over `--motion-panel` with `--ease-out`, so the page turns from paper into the workspace rather than flashing. Under reduced motion it is instant.

### Entrance

One orchestrated arrival on mount, through the existing `MotionItem` and `useArrivalDelays` vocabulary: money line at 0ms, eyebrow 35, headline 70, subtitle 105, chips 140, nudge 175; the art fades and settles from 8px at 100ms. Reduced motion is opacity only at 125ms, which `MotionItem` already does.

### Words

| Today | Now |
| --- | --- |
| Link "Your credits" | Link "Your money: $15.32 balance, 2,000 credits left" |
| "Tools and browser tasks" | gone |
| Simulated badge on Home | gone from Home; stays on Your money, receipts and the top bar's stub count |
| "Recent updates" list, "All updates" | "3 new updates in your Inbox", only when there are |
| "2,000 credits" in the card | `2,000` in mono beside the gauge |

## Data: nothing new from the server

| Fact | Source | Note |
| --- | --- | --- |
| Dollar balance | `app.wallet` through `walletAmounts` and `formatUsd` | Null is words, never zero |
| Unavailable words | `wallet.balanceLabel` | Already the rule on Your money |
| Credits left, held, spent | `useCredits().summary`: `availableUnits`, `reservedUnits`, `spentUnits` | `spentUnits` is lifetime captures, so the three sum to what was ever bought |
| Unread updates | `useUpdatesPage().data.unread` | Same query the rail uses |
| Things needing the person | `app.approvals.length + pendingPurchases` | Same figure as the rail badge |

## What changes in the code

1. `packages/ui/src/styles/globals.css` — the token block moves from `.landing` to `.playground`; `.dark .playground` is added; new `playground-eyebrow`, `playground-mark`, `playground-chip`, `playground-sticker`, `money-line` and `credit-gauge` rules beside the landing rules. The landing's own `.landing-*` classes are not touched.
2. `apps/web/src/routes/landing-page.tsx` — the root carries `landing playground`.
3. `apps/web/src/lib/money-line.ts` (+ test) — `creditGauge(summary)` returns the left and held percentages and the words; `balanceWords(wallet)` returns the figure or the label.
4. `apps/web/src/components/chat/money-line.tsx` — the row.
5. `apps/web/src/components/chat/inbox-nudge.tsx` — the sentence.
6. `apps/web/src/lib/frog-pose.ts` — `stickerForHome(needsUser)` beside `copyForHome`, with a test.
7. `apps/web/src/components/stream/empty-state.tsx` — rewritten as the Playground hero, taking `needsUser`.
8. `apps/web/src/routes/chat-page.tsx` — the first-use column gets `playground` and the transition, `MoneyLine` replaces `HomeSummary`, the hero is centred, the nudge sits under it.
9. `apps/web/src/components/chat/home-summary.tsx` — deleted. `watchlist/recent-updates.tsx` stays for the Watchlist page; its `limit` prop goes if nothing else passes one.
10. `apps/web/public/froggy/next-idea.webp` and `next-idea-320.webp` — alpha WebPs from the PNG; `public/froggy/README.md` records it.
11. `apps/web/AGENTS.md` — one sentence: Home's first-use column is the Playground scope.
12. `docs/decisions/0041-home-is-the-playground.md` and a `docs/plan/STATUS.md` entry.

Commits land in that order, one per coherent piece: tokens and landing class; the money line with its helpers and test; the hero, sticker and nudge; the page wiring and the deletion; assets; specs; docs.

## Tests and gates

- `e2e/ui-polish.spec.ts` — the link is found by `/Your money/` instead of `"Your credits"`; a new assertion that `main` holds no text "Simulated" on Home; the `home-*` captures regenerate.
- `e2e/agent-onboarding.spec.ts`, `welcome.spec.ts`, `landing.spec.ts`, `motion.spec.ts` — unchanged; they find Home by the heading, which keeps its text.
- `bun test` for the two new helpers.
- `heavy bun run check:fast` while working, `heavy bun run check` before done, then `bun run e2e -- ui-polish landing agent-onboarding welcome motion`.
- Playwright captures at 1440, 768 and 390 in Passbook and Lilypad under `docs/evidence/ui-review-2026-09-13/home/`, with the browser console clean. The stub identity is the demo default; it is captured first.

## Out of scope

The rail, top bar and bottom navigation. The composer's internals. Your money and its Simulated markers. The welcome flow and `setup-complete.png` (1.1 MB, the same conversion is worth doing, separately). The landing's own classes, beyond the one-word root change. Extending the Playground to Inbox or Watchlist.

## Open for the owner

1. The Lilypad Playground values above are new; approve them, or say "light only" and Home falls back to Passbook tokens in Lilypad.
2. The sticker words when nothing is waiting: `THINK BIG. / HOP TO IT.` as on the landing, or something of Home's own.
