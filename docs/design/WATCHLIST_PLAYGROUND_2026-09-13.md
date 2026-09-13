# Watchlist as the Playground — plan

Written 13 September 2026 against `397af42`, after the owner asked the agent to track a wallet's transfers, got the Telegram alerts, opened the Watchlist and could not tell what was going on. The four decisions below were taken with the owner the same evening. This is the implementation brief; the decision record is `docs/decisions/0042-watchlist-is-the-playground.md` once the work lands.

## What the owner saw is not what is on main

The screenshot shows the page from before `ff235d4` (13 Sep, 14:51): the "Something caught your eye?" bar, Find tokens / Reminder / Add item, category chips, "Newest saved". Production still serves that chunk (`assets/watchlist-items-t5dVW7Ha.js`) because every CI run from `ac8f325` to `b9eabb4` was cancelled by the push that followed it, so Railway never built any of them, and main is four commits ahead of origin and unpushed. The owner will handle the deploy. This brief plans against main, whose Watchlist is a different layout with the same failures.

## What is wrong today

The list (`routes/watchlist-page.tsx`, `watchlist/watchlist-items.tsx`, `watchlist/saved-item-card.tsx`):

1. **The row's second line is machine output.** `observationValue` prints `latest.facts[0].value` verbatim, which is what `describeRow` in `apps/server/src/watchlist-discovery.ts` wrote: "Contract without ERC-20 metadata", or "Address · 0.0221108110263 ETH · 15.30361 USDC". Unrounded, unit-first, no chain in the sentence.
2. **The name is a purpose, not a thing.** `workspace-tools.ts` passes the agent's `input.title` straight through, so a wallet the agent tracked is called "Base contract 0x0Cf8…67F6 activity".
3. **Status is said in five places.** "Watching" as plain text in the row (`WalletMonitorBadge`), presence chips, the "Found on 1 chain: Base" sentence and a "Check again" button (`ItemPresence`), and the Notify me caveat. The detail repeats all of them.
4. **The page tail is three unrelated blocks.** "Recent updates" is a second feed after decision 0040 made Inbox the feed; "Manage monitoring" hides the budget form and the scheduled checks; "Coming up" lists reminders.
5. **No voice, retired surfaces.** "Good things to come back to." under a 30px heading; rows and cards drawn with `border`, which Passbook retired and the Playground never had.

The detail (`ItemDetail`, `watchlist/wallet-monitor-panel.tsx`, `watchlist/notify-toggle.tsx`):

6. **The activity is hidden.** The transfers that fired the Telegram alerts sit inside a `<details>` labelled "Alert details and activity", closed by default, under balances, an enrichment note, Refresh and "Ask Froggy about this". The one thing the person came for is the one thing folded away.
7. **Every item is "Saved for later".** `DetailIdentity` stamps that badge on a wallet that is watching.
8. **The monitor panel says one thing four ways.** A state badge, "Watch ends 14/09/2026, 18:41:03. Pausing does not extend this time.", "Last observed block 36,012,345 · 18:02:11", "Telegram connected · alerts go to your paired chat.", then the coverage sentence.
9. **Activity cards weigh everything the same.** Finality badge, delivery words, network, "View transaction" and the amount all at one size; the counterparty is never shown.
10. **Two columns that do not agree.** The list is `max-w-4xl`; the detail is `max-w-7xl` with a sticky compact copy of the same rows on the left.

## Decisions taken with the owner, 13 September

| Decision | Chosen | What it means |
| --- | --- | --- |
| Deploy | **The owner deploys** | This brief plans against main. The first check after the deploy is that the screenshot's page is gone. |
| Aesthetic | **Playground on Watchlist too** | The Watchlist route's column carries `playground` always, list and detail. The rail, top bar and bottom navigation stay Passbook, as accepted for Home. |
| Purpose | **One mixed list with filters** | Wallets, tokens, shopping, travel and links in one list with filter chips. No split into "Watching" and "Saved", no second page. |
| Platform | **Desktop and installed iPhone both** | Captures at 1440, 768 and 390 in Passbook and Lilypad, the installed-app checklist from `apple-web-app`, and one real-device pass once the owner has deployed. |

## The design

### Scope and tokens

The `playground` class goes on the Watchlist route's column (`data-slot="watchlist-page"`) with no first-use flip: the Watchlist is always the Playground. The tokens exist (`.playground`, `.dark .playground`, added for Home). New rules take a `watch-*` prefix beside `home-*` in `packages/ui/src/styles/globals.css`, and the chip gets a small variant, `playground-chip-sm` (36px, mono 10px). The body stays the workspace grey-green; the status bar samples the top bar, not the column.

### The list page

**Header.** Eyebrow, headline, one status sentence:

```
● SMALL FROG. SHARP EYES.
Your [watchlist]                       Manrope 800, clamp(36px, 4.5vw, 56px), line-height 0.96, −0.05em; lime mark on "watchlist"
2 watching on Base · 3 saved · alerts to Telegram      mono 12px, muted
```

The `h1` text is "Your watchlist"; nothing finds the page by its heading, and the rail link stays "Watchlist". The sentence is computed from the list: how many items have an active watch, how many do not, and whether any watch delivers to Telegram. It is the only status on the page above the rows.

**The bar.** The existing `TrackBar` keeps its behaviour and names (textbox "Address, link or token name", button "More actions", the menu items, the "Search on" group, "Token results"). It takes the Playground surface: card ground, 2px ink border, 6px radius, `3px 3px 0` ink shadow, 52px tall, sans placeholder, an ink square submit chip with the arrow. The helper line beneath becomes mono 10px uppercase: `FREE · ETHEREUM, BASE, ROBINHOOD · LINKS FROM ANYWHERE`, and while a token search is typed, `ENTER SEARCHES ON BASE · 0.05 CREDITS`. The More actions trigger is a chip, not a ghost icon.

**Filters.** One row of small chips: ALL · WALLETS · TOKENS · SHOPPING · TRAVEL · LINKS, a hairline, then NEEDS YOU · 1 (lime fill when the count is above zero, hidden at zero) and ARCHIVED. The selected chip is ink with cream text. The row scrolls horizontally under 640px with an edge fade. Compare stays as a chip at the row's end with its exact label; the count line "5 saved items" stays under the row. The view state (`query`, `archived`, `attention`) is the same `useWatchlistView` state; a `kind` filter joins it.

**The rows.** One card surface for the whole list, 2px ink border, `3px 3px 0` shadow, rows divided by a 1px line of `--border` at 18%. Each row is a grid: 44px icon · identity and sentence · a right column.

- **Line 1**: the name, 15/22 weight 600, and it is the link, with `item.title` as its only text so specs that find rows by name keep working. After it, outside the link: for an address item, the address as a mono 11px chip (`0x0Cf8…67F6`, click copies) and one chip per chain in mono 10px uppercase (`BASE · WALLET`, `BASE · TOKEN`).
- **Line 2**: one sentence in the person's words from `watchWords(item, status)`: "Watching sends and swaps on Base · until 18:41 · Telegram on" · "Watching for a price below $0.01 · waiting for a price" · "Paused · 19h left if you resume" · "Watch ended yesterday" · "Saved · dune.com" · "Needs you · Telegram was disconnected". Never a fact string.
- **Line 3** (address items): "0.022 ETH · 15.30 USDC on Base" from the `presence` rows through `balanceWords`; for a token, "USDC · $0.9959 · −0.4% over 24h" from the stored snapshot. Links, products and flights keep their latest price or first fact, rounded.
- **Right**: the time of the last event in mono 11px ("2 min ago", "13 Sep") and the state chip: WATCHING (ink outline), NEEDS YOU (lime fill), PAUSED, ENDED, SAVED. A lime dot before the time when there is activity newer than the person's last visit to that item.
- "Check again" stays in the row, exactly as today, only when discovery found nothing or a chain could not be checked; `watchlist-capture.spec.ts` finds it inside the "Saved items" region.
- The per-row "Ask Froggy about …" icon leaves the row. The detail keeps "Ask Froggy about this", which is the one the specs press.
- Rows arrive with `useArrivalDelays`; a filter change cross-fades rows in place with `AnimatePresence` and never lets the card change height mid-swap.

**The tail.**

- "Recent updates" goes. In its place, one line when `useUpdatesPage().data.unread > 0`: `● 3 NEW UPDATES IN YOUR INBOX ↗`, the same `InboxNudge` Home uses, made reusable. `watchlist/recent-updates.tsx` is deleted.
- "Manage monitoring" keeps its summary text (`monitoring.spec.ts` clicks it) and becomes a Playground disclosure: eyebrow style with a mono count, `2 CHECKS · $4.00 OF $10.00 THIS MONTH`. The budget form and the existing checks inside are unchanged.
- "Coming up" keeps its reminders as a compact list under the same eyebrow style.

### The detail page

One column, `max-w-3xl` at every width; the sticky compact list on the left goes. A back chip at the top, `← WATCHLIST`. Then, in this order:

1. **Identity.** Icon at 56px; `h1` is the title, Manrope 800, 32/36, −0.04em; beneath it the address in mono with a copy button, the chain chips, and the state chip. No "Saved for later". `ItemPresence` words appear only while finding, when a chain could not be checked, or when nothing was found; the shimmer stays.
2. **What Froggy is watching** (wallets and tokens; the region keeps its name, "Wallet activity monitor" or "Token price alerts", and its `RadioIcon`).
   - Header: eyebrow `● WATCHING` on the left, the Notify me switch on the right with its caveat sentence beneath; the token prompt ("Tell me when the price goes", "Price in USD", "Start") opens under it, as today.
   - The rules as sentences, one per line with a mono dot: "Sends or receives any token", "Buys or sells any token", "Price below 0.01 USDC · matched". The texts are the existing `ruleLabel` output, which `onchain-alerts.spec.ts` asserts.
   - One time line: a 4px track with a lime fill for the time left of the 24-hour window, and `ENDS 18:41 · 21H LEFT` in mono. "Pausing does not extend this time." moves under the Pause chip as its description.
   - One delivery line: "Telegram on" or "Telegram off · activity stays here", with `TelegramSettings` folded under it when disconnected.
   - Chips: Pause watch / Resume watch, Extend for 24 hours, Edit alerts, Rearm price alert, Start price alert, Track for another 24 hours. The labels are unchanged; the chip uppercases them visually.
   - The stream-gap alert stays visible when `gapSince` is set. "Last observed block …" and the coverage sentence move under a `<details>` labelled "Stream details". "Simulated stream · local demo" stays where it is.
   - For links, products and flights the same slot holds `ItemMonitoring` ("Keep an eye on it"); `MonitoringBudget` leaves the detail, since the list's tail has it.
3. **What happened.** Eyebrow `● WHAT HAPPENED` with a mono count, `3 EVENTS · 2 TODAY`. The activity cards, newest first, restyled through the shared `ActivityCard`:
   - The sentence first, 15px: "Received 15.30 USDC from 0x8Cc2…08C2", "Sent 0.01 ETH to 0x1a2b…9c8d", "Swapped 0.5 ETH for 1,204 USDC on Uniswap v3", "Price already below 0.01 USDC · observed 0.0098". Amount rounded, counterparty short, the full amount in a `title`.
   - The time in mono at the right; the existing `h3` ("Transfer", "Swap", "Price alert", "Wallet activity") stays as the card's heading because the spec finds it, drawn as an eyebrow.
   - One mono line beneath: `TRANSFER · CONFIRMED · BASE · TELEGRAM DELIVERED`; "View transaction" as a mono link at the end of it. Reverted, unverified and partial-evidence cases keep their sentences.
   - A 3px lime rail on the left of every card newer than the person's last visit to this item; the visit time is written to `localStorage` under `froggy.watch-seen.<itemId>` when the page opens.
   - New cards arrive with `MotionItem spring` from 8px. "Load older activity" is a chip. The empty words by state are unchanged.
   - The `<details>` "Alert details and activity" wrapper goes; `onchain-alerts.spec.ts:402` no longer clicks it.
   - `ActivityCard` is shared with the Inbox reader, so the restyle lands there through tokens alone; it must read well inside Passbook.
4. **Balances and facts.** Wallets: "0.022 ETH · 15.30 USDC on Base" and a per-chain list. Tokens: the price history chart (kept, restyled through the tokens) and the "Latest details" facts grid. The enrichment sentence, "View enrichment task" and `RefreshItem` live here.
5. **Notes and actions.** The notes paragraph, then chips: Ask Froggy about this, Edit details, Open website or Open source email, Archive or Restore item, Remove permanently. Names unchanged.

### Words

| Today | Now |
| --- | --- |
| "Good things to come back to." | "2 watching on Base · 3 saved · alerts to Telegram" |
| "Contract without ERC-20 metadata" as a row line | "A contract on Base" / "Token USDC on Base" |
| "Address · 0.0221108110263 ETH · 15.30361 USDC" | "0.022 ETH · 15.30 USDC on Base" |
| "Watching · until 6:41 PM" | "Watching sends and swaps on Base · until 18:41 · Telegram on" |
| "Saved for later" on every item | WATCHING / NEEDS YOU / PAUSED / ENDED / SAVED |
| "Alert details and activity", closed | "What happened", open, second on the page |
| "Watch ends 14/09/2026, 18:41:03. Pausing does not extend this time." | a lime time bar and `ENDS 18:41 · 21H LEFT` |
| "Telegram connected · alerts go to your paired chat." | "Telegram on" |
| "Received 15.30361 USDC" | "Received 15.30 USDC from 0x8Cc2…08C2" |
| "Recent updates" list with "All updates" | "3 new updates in your Inbox ↗", only when there are |
| Agent title "Base contract 0x0Cf8…67F6 activity" | tool guidance: the title is a name; the reason goes in `notes` (open question 3) |

Rounding: stablecoins to two decimals; ETH to three decimals at 0.01 and above, otherwise four significant figures; other tokens through `Intl.NumberFormat` with four significant figures below one and two decimals above. Full precision always in the `title` attribute and in the transaction link.

### Motion

- Arrival on mount, through `MotionItem` and `useArrivalDelays`: eyebrow 0ms, headline 35, bar 70, filters 105, rows from 140 in list order. Reduced motion is opacity only at 125ms, which `MotionItem` already does.
- Chips keep the Playground press physics: 1px into the shadow on hover, 3px onto it on press, colour only under reduced motion.
- A filter change cross-fades rows in place; the card's height is held for the swap.
- A new activity card slides in from 8px on a critically damped spring; its lime rail fades over two seconds.
- The switch and the chips respond on pointer-down (`press-feedback` is already on the switch).
- The list-to-detail route transition is the one in `MOTION_NAVIGATION_2026-09-08.md`, untouched.

### Installed iPhone

Today: the viewport has `viewport-fit=cover`; the bottom pill navigation and the composer pad `env(safe-area-inset-bottom)`; there is no manifest, no `apple-mobile-web-app-capable`, no `apple-touch-icon` (`apps/web/public` holds only `favicon.svg`), and nothing pads the top inset. iOS 26 opens a Home Screen site as a web app regardless, with a `default` status bar and a `0px` top inset, so the page is safe by accident. The checklist makes it deliberate:

1. `apps/web/public/manifest.webmanifest`: `name` and `short_name` "Froggy", `display: standalone`, `start_url` and `scope` "/", `background_color` and `theme_color` `#f5f6f2` (the body), PNG icons at 192, 512 and 1024 with `purpose: any`, and a 512 maskable with safe-zone padding. The PNGs are rendered from one frog mark onto opaque `#f5f6f2` by a small script under `tools/`, so the sizes cannot drift.
2. `apps/web/index.html`: both `apple-mobile-web-app-capable` and `mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style` set to `default` (the top bar is not designed for content under the clock, and the iOS 26.x inset regressions make `0px` the value to design for), `theme-color` `#f5f6f2`, a 180px opaque `apple-touch-icon`, and the manifest link.
3. The manifest and icons must answer 200 without cookies; `curl -I` against production after the deploy, since iOS fetches them signed out.
4. At 390px: the header stacks; the bar is full width; the filters scroll with the edge fade; rows are full-bleed with 16px padding; chain chips wrap; the time drops under the sentence; the detail is one column with the back chip sticky under the top bar; every target is at least 44px; chips carry `touch-action: manipulation`; `-webkit-tap-highlight-color: transparent` is global; chip hover lives inside `@media (hover: hover)`.
5. Startup images are not in this lane; they need the device table and a version query, and are recorded as a follow-up.
6. Real device, after the deploy: add to Home Screen, swipe-kill, cold launch, open the Watchlist, rotate, focus the bar and watch the keyboard, confirm the pill navigation clears the home indicator; repeat in Lilypad.

### Lilypad

The `.dark .playground` values exist. Open question 1 of the Home brief still stands: approve them, or say "light only" and the Watchlist falls back to Passbook tokens in Lilypad.

## Data: nothing new from the server

| Fact | Source |
| --- | --- |
| Watch state, rules, window, Telegram | `useWalletMonitor(item.id).view.data.status` (`WalletMonitorStatus`): `state`, `monitor.rules`, `monitor.expiresAt`, `telegramPaired` |
| Activity, and whether there is more | `view.data.activities` (`WalletActivity`), `view.hasNextPage` |
| Balances per chain | `useWatchlistDetails(id).data.data.presence[]`: `nativeBalance`, `usdc.units`, `kind`, `token` |
| Token price | `snapshotForItem` and `details.data.snapshot`, as today |
| Unread updates | `useUpdatesPage().data.unread`, the query the rail uses |
| Needs attention | the existing `needsAttention` in `watchlist-items.tsx` |
| Last visit, for the lime rail | `localStorage` `froggy.watch-seen.<itemId>`, client only |

One optional server change, open question 3: the track tool's description in `workspace-tools.ts` says the title is a short name and the reason belongs in `notes`.

## What changes in the code

1. `packages/ui/src/styles/globals.css` — `watch-page`, `watch-headline`, `watch-bar`, `watch-filters`, `watch-row`, `watch-state`, `watch-time-bar`, `watch-event` rules beside `home-*`; `playground-chip-sm`.
2. `apps/web/src/lib/watch-words.ts` (+ test) — `watchWords(item, status)`, `balanceWords(presence)`, `amountWords(amount, decimals, symbol)`, `eventSentence(activity)`, `pageSentence(items, statuses)`; pure functions tested against the fixture states.
3. `apps/web/src/components/watchlist/saved-item-card.tsx` and `watchlist-items.tsx` — the row, the filter chips with the `kind` view state, the state chip, the lime dot; the per-row Ask Froggy icon removed.
4. `apps/web/src/components/watchlist/track-bar.tsx` — surfaces and helper line only.
5. `apps/web/src/routes/watchlist-page.tsx` — `playground` on the column, the header, the nudge (from `chat/inbox-nudge.tsx`, made reusable), the single-column detail, the section order, `DetailIdentity` without the badge, the disclosure removed; `watchlist/recent-updates.tsx` deleted.
6. `apps/web/src/components/watchlist/wallet-monitor-panel.tsx` — split into `WatchRules` and `WatchTimeline`, the time bar, the delivery line, "Stream details", the `ActivityCard` sentence form; `notify-toggle.tsx` mounted in the rules header.
7. `apps/web/index.html`, `apps/web/public/manifest.webmanifest`, the icon PNGs and their script, one sentence in `apps/web/AGENTS.md`.
8. Specs: `onchain-alerts.spec.ts` drops the disclosure click; `ui-polish.spec.ts` gains `watchlist-{1440,768,390}` captures in both themes; `watchlist.spec.ts` captures regenerate.
9. `docs/decisions/0042-watchlist-is-the-playground.md` and a `docs/plan/STATUS.md` entry; captures under `docs/evidence/ui-review-2026-09-13/watchlist/`.

Commits land in that order, one per coherent piece: styles; the words with their tests; the rows and filters; the bar; the page and the detail order; the monitor split and the timeline; the installed-app assets; specs and captures; docs.

## Tests and gates

- `bun test` for `watch-words`.
- `heavy bun run check:fast` while working; `heavy bun run check` before done; `bun run knip` for the new exports.
- `bun run e2e -- watchlist watchlist-capture onchain-alerts monitoring ui-polish updates` (updates, because `ActivityCard` is shared with the Inbox reader).
- Playwright captures at 1440, 768 and 390 in Passbook and Lilypad with the browser console clean; the real-device pass above once the owner has deployed.

## Out of scope

The rail, top bar and bottom navigation. The Inbox layout beyond the shared `ActivityCard`. Startup images. The monitoring budget form's internals. The server's discovery words (`describeRow` stays the observation's text; the UI stops showing it raw). Pushing and deploying, which the owner does. The uncommitted `router.tsx` and `e2e/*.spec.ts` changes in the tree on 13 Sep belong to another lane and are not touched.

## Open for the owner

1. The Lilypad Playground values, as for Home.
2. The per-row "Ask Froggy" icon is removed from the list in this plan; the detail keeps the button. Say if you want it back on rows.
3. The one-line tool guidance in `workspace-tools.ts` so the agent names items rather than describing them.
4. `default` rather than `black-translucent` for the installed app's status bar, because nothing pads the top inset today.
