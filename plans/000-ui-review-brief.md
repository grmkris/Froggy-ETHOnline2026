# Froggy — next UI round: audit and decision brief

Status: REVIEW, not an execution plan. Reviewed 12 September 2026 at commit `a0c50ce`, including the uncommitted Home/Watchlist implementation. References describe this worktree, not only the commit. No source changes, installs, builds, or deployments were performed in this review.

## Direction confirmed by the owner

- More expressive and playful: a bold, meme-heavy trading buddy.
- Prioritize simpler Home and mobile chat.
- Desktop Watchlist starts closed and opens when requested.
- “Your money” appears only on the empty Home screen and in the menu. Active conversations have no balance card or header balance.
- Keep Home and mixed Watchlist as the main destinations. Money belongs within Home; no primary Portfolio destination.
- Audience: adults who trade meme tokens and also want help with shopping, trips, and reminders.
- Robinhood, Base, and Ethereum mainnet remain supported. Railway production has a configured Birdeye key and reports `birdeye: live`; local placeholder configuration does not describe production.

All five initial product questions are answered. The owner chose a bold, meme-heavy trading buddy and money only on empty Home and in the menu. These choices replace the earlier recommendations for a quieter witty companion and compact header balance.

## Product assessment

The first implementation delivered a useful foundation: persistent mixed saved items, chain-aware paid token lookups, saved snapshots, reminders, chat attachments, responsive navigation, and an optional shared-browser pane. The next round should make those capabilities easier to understand and reach.

The largest problem is competing hierarchy. Mobile Home stacks global navigation, a full funding card, a separate browser/history toolbar, a large greeting, three tall starter cards, setup links, a cross-chat search switch, an attachment row, the composer, and bottom navigation. The reviewed 390px screenshot shows starter content cut by the pinned composer area; scrolling works, but the layout spends too much space before the conversation. This is a design finding, not a claim that content is unreachable.

Confirmed character: a bold, meme-heavy trading buddy. Explore punchy meme-aware greetings, exaggerated frog expressions, sticker-style spot illustrations, bolder display typography, and confident accent colors. Shopping, travel, and reminders should still feel at home beside trading. Concentrate the personality in greetings, empty states, and confirmed completion moments; use plain, precise labels for transaction facts, permissions, failures, and unknown outcomes. Avoid copy that invents returns, guarantees a win, or mistakes a pending transaction for success. Keep the layout simple and avoid making every control a raised card. The existing frog SVG and five semantic poses provide a starting point; optional generated spot illustrations can be evaluated during design execution without making them a dependency for functional UI.

## Vetted findings, ordered by impact relative to effort

| ID | Severity | Category | Location | Finding | Fix direction |
| --- | --- | --- | --- | --- | --- |
| U1 | HIGH | Home hierarchy | `apps/web/src/routes/chat-page.tsx:188`, `:271`; `components/stream/empty-state.tsx:27`, `:46`, `:96` | Persistent money/toolbars and a large welcome compete with mobile chat. Setup and permission controls occupy the daily path. | Show the money summary only on empty Home and retain menu access during chat; compact the greeting and starter actions; move setup/replay links to Connections/Account; put cross-chat permission in an explicit composer option while keeping its state discoverable. Never change permission just by hiding its control. |
| U2 | MEDIUM | Desktop simplification | `apps/web/src/routes/chat-page.tsx:105`; `components/nav/app-rail.tsx:78`; `components/chat/recent-conversations.tsx:298` | Watchlist starts open; recent conversations and New chat are offered in both the rail and toolbar. | Start Watchlist closed. Give desktop history one clear home; retain a mobile history entry. Preserve current browser docking and stop behavior. |
| U3 | MEDIUM | Touch usability | `apps/web/src/components/watchlist/attached-item.tsx:19`; `market-results.tsx:45`; `packages/ui/src/components/button.tsx:26`, `:29` | Attachment removal has a 24px box; token Save is 28px high. | Provide at least 44px touch targets at these call sites, with clear focus/press states; avoid indiscriminately enlarging every shared button. |
| U4 | MEDIUM | Persistent state | `apps/web/src/components/watchlist/market-results.tsx:28`, `:41`, `:48` | Saved feedback comes only from a mutation instance. Remounting results can show Save for an already-saved token. | Derive saved state from the owner’s active saved items using exact chain and normalized address; offer Open saved item. Backend dedup already prevents duplicate rows. |
| U5 | MEDIUM | Exit continuity | `apps/web/src/components/watchlist/item-form.tsx:233`; `packages/ui/src/styles/globals.css:1220` | Closing Add/Edit removes fields immediately while the popup continues its 125ms exit, allowing an empty/collapsing shell. | Keep form contents until the popup finishes closing; reset at a deliberate lifecycle boundary. Reproduce at slow playback before implementation. |
| U6 | HIGH | Account correctness | `apps/web/src/components/settings/schedule-list.tsx:43`; `apps/web/src/main.tsx:22`; `components/app-shell.tsx:19`; `lib/privy.tsx:405` | Reminder queries use global `["schedules"]` under a QueryClient that survives identity changes, with 30s freshness. A new login can reuse earlier account data. | Reproduce account switching, scope reads and mutation invalidation by owner/session, and prevent requests until identity is ready. This is a code-supported client-cache defect, not evidence of backend authorization failure. |
| U7 | MEDIUM | Watchlist hierarchy | `apps/web/src/routes/watchlist-page.tsx:181`; `components/watchlist/token-discovery.tsx:81`; `components/settings/schedule-list.tsx:68` | Saved search, paid discovery, and schedules compete in one column; Coming up repeats as Scheduled. New listings are hidden behind submitting a blank query. | Make saved items primary, discovery an explicit secondary action, and New listings a named action; use one reminder heading. Keep lookup cost visible and never buy a refresh on render. |
| U8 | MEDIUM | Useful detail | `apps/web/src/routes/watchlist-page.tsx:52`; `components/watchlist/watchlist-items.tsx:145` | Token rows can show a snapshot, but item details drop it and prioritize management controls over asking Froggy. | Retain chain, observed price, timestamp, and source state; put Ask Froggy earlier and group secondary management actions. Do not imply a snapshot is a live quote. |
| M1 | MEDIUM | Keyboard motion | `packages/ui/src/styles/globals.css:1081`, `:1287`; `packages/ui/src/components/button.tsx:6` | Keyboard bypass omits buttons. Unlayered press CSS applies scale and a 240ms return regardless of input modality. | Reproduce Space activation; extend the immediate keyboard contract at the actual winning CSS rule while retaining pointer feedback. Code mismatch confirmed; visible severity needs runtime verification. |
| M2 | LOW | Motion authority | `packages/ui/src/styles/globals.css:1209`; `packages/ui/src/components/dialog.tsx:54`; `design/concepts/2026-09-12/unified-watchlist/implementation.md:22` | Primitive classes/notes describe 200ms and scale .97, but global CSS supplies a 300ms spring and scale .94. | Consolidate motion specifications and correct documentation. Preserve intentional .94 Add funds behavior tested in `e2e/motion.spec.ts:238`; do not call that spring a regression. |
| M3 | LOW | Cleanup | `packages/ui/src/styles/globals.css:1112`, `:1226` | Old workspace route-slide CSS remains after its activation was removed. | Remove only unused workspace-forward/back rules. Preserve the active appearance transition in `apps/web/src/lib/theme.ts:81`. |

Smaller copy cleanup: `item-form.tsx:179` uses shopping-oriented placeholder text for token notes; `watchlist-items.tsx:119` uses first-use copy for empty archives. Repeated “no automatic checks” disclaimers can become one clear explanation per surface, while retaining truthful per-item monitoring state.

## Motion recon and frequency map

React 19, Motion 13.2, Base UI 1.8, Tailwind 4, Streamdown, and Torph are already installed. Shared CSS provides `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`, feedback 125ms, panel 200ms, and sheet 250ms. `apps/web/src/lib/motion.ts` supplies the existing 300ms/bounce .2 surface spring and 240ms/bounce .2 press return.

- Frequent: typing, sending, navigation, search filtering, reading prices. Preserve immediate controls and stable reading geometry.
- Occasional: saving an item, scheduling, opening detail/edit surfaces. Brief feedback can help.
- Rare: initial onboarding and first successful save. This is the place for character and delight.

Audit coverage: purpose/frequency, easing/duration, physicality/origin, interruptibility, performance, accessibility, cohesion/tokens, and missing motion. Anchored popovers, reduced-motion overlay fades, hover-capability gating, full transform strings, static financial totals, and bounded streaming reveals are already good foundations. No broad motion rewrite is justified.

## Opportunities that pass the motion gate

| ID | Location and current state | Purpose | Frequency | Exact proposed motion | Function and input constraints |
| --- | --- | --- | --- | --- | --- |
| A1 | `components/watchlist/market-results.tsx:48`: Save swaps instantly to Saved | Feedback | Occasional explicit save | Fixed-size icon/label slot; crossfade opacity over 125ms with `cubic-bezier(0.23, 1, 0.32, 1)` after confirmed success. | Fix U4 first. No row or price movement. Reduced motion retains opacity-only feedback; keyboard changes immediately. Do not delay completion for animation. |
| A2 | `components/watchlist/reminder-form.tsx:61`: closes dialog; reminder may be below fold | Feedback | Occasional explicit scheduling | Show a compact “Reminder set for …” status near the initiating action, opacity 0 to 1 over 125ms with the same curve. | Announce the confirmed time accessibly. Reduced motion keeps the fade; keyboard is immediate. No auto-scroll, reordering, or animated date text. |
| A3 | `components/welcome/ready-step.tsx:150`, `packages/ui/src/components/frog-mark.tsx:30`: static success character | Delight | First completed onboarding only | Reveal only the decorative success frog with opacity 0 to 1 and transform scale(.97) to scale(1), 200ms `cubic-bezier(0.23, 1, 0.32, 1)`. | Controls and completion text are available immediately. Reduced motion uses opacity for 125ms; keyboard arrival is static. Do not replay on every Home visit. Character art/copy should supply most of the personality. |

These recipes add no library and do not animate layout dimensions. No hover animation is proposed; any future hover movement must be inside `(hover: hover) and (pointer: fine)`.

### Deliberately rejected

- Home/Watchlist page slides and flying token-to-detail transitions: fail frequency and keyboard gates; navigation was deliberately made immediate.
- Rolling prices, bouncing gains, chart-drawing flourishes: fail function; people are reading and acting on those values.
- Looping frog blinks/bobbing in the normal empty Home or thinking row: recurring decoration fails frequency/function. Existing semantic working/needs-user/success poses can communicate state without looping.
- Animation for every saved-list filter or reorder: fails frequency and reading stability.
- Extra animation on the attachment chip: the existing implementation deliberately keeps it static. First fix its touch target and placement; no change is justified merely because it can animate.

Verdict: the app needs less competing chrome and more character, with a small amount of completion feedback. A1 is the highest-leverage animation addition after its saved-state fix. A selected row can be handed off as `improve-animations plan <row>` with exact scope and verification.

## Recommended sequence for selection

1. **Home and mobile structure:** U1–U3; active-chat header without a balance, money on empty Home and in the menu, readable composer, one place for history, closed-by-default Watchlist.
2. **Correctness and continuity:** U4–U6 and M1; durable Saved state, form lifecycle, account-scoped reminders, keyboard behavior. Investigate U6 first within this work.
3. **Character and feedback:** approved typography/copy/mascot direction plus A1–A3. Make the hierarchy and character work statically before adding motion.
4. **Watchlist refinement:** U7–U8 and small copy fixes; optional for this round if Home needs more iteration.
5. **Maintenance:** M2–M3, keeping intentional tested behavior.

This is an audit and candidate sequence. No individual execution plans have been written yet; select which findings and motion opportunities to include before writing individual execution plans. Product direction is now confirmed.

## Verification required by the eventual plan

- Exercise new/active/restored chat at 320, 390, 768, and 1440px, with and without attachments, approvals, errors, and an open software keyboard. Check browser errors, focus, text zoom, scroll anchoring, and Stop reachability.
- Confirm Home/Watchlist switching never interrupts a server-owned run or changes spending permissions.
- Verify fresh and already-saved token results on Robinhood, Base, and Ethereum; preserve observation times, unavailable fields, and simulation markers. Production configuration is verified, but live endpoint behavior is a separate check.
- Test account switching for schedules; successful, failed, and conflicting saves; close/reopen during form submission; restored saved-item chat references.
- Run `bun run check:fast`, `bun run check`, and `bun run e2e` during execution. Those commands were not run in this read-only review.
- Feel-check selected motion at normal speed and 10% playback, with rapid interruption, keyboard-only use, and reduced motion. Inspect real mobile software-keyboard behavior; desktop screenshots do not prove it.

## Evidence and limits

Reviewed source plus the prior implementation’s actual screenshots in `design/concepts/2026-09-12/unified-watchlist/implemented/`. The mobile Home screenshot was visually inspected in this review. Prior implementation validation reported 176 passing browser tests and a passing full code gate; this audit does not claim a new live browser run.

Existing P&L, general website price monitoring, and stock-discovery gaps remain separate product work. Do not quietly expand this polish round into those integrations. Existing email, OAuth, wallet, and other worktree changes must be preserved.
