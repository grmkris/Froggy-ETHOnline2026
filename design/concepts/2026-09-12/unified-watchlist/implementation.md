# Home + Watchlist implementation

The concepts informed a working layout, with existing features and real data contracts determining what is shown. This records the initial implementation; see [the subsequent polish round](../../../../plans/001-ui-polish-implementation.md) for the current behavior and verification.

Implemented:

- Home renders the persistent conversation, compact “Your money” funding balance and context attachment.
- Home and Watchlist navigation; desktop recent conversations and closeable Watchlist pane; mobile full-page details and workspace menu.
- Owner-scoped saved tokens, products, flights and public links; create, search, edit, archive, restore and remove archived items.
- Chain-aware token lookup, exact-address inspection and new listings using existing service prices and payment controls. Choices come from the service catalog, including Robinhood, Base and Ethereum.
- Readable token snapshots and Save actions in lookup and service results. Saved rows reuse paid snapshots without buying refreshes.
- Reminder creation, persisted schedules and cancellation through the existing scheduler.
- Bounded agent save/list/get tools; item/revision attachments persist as references in chat history and resolve through the owner-checked read tool.
- Postgres migration `0023_familiar_mauler.sql`, with the memory adapter following existing simulation markers.

Remaining capabilities from the illustrative screens: background flight/product price checks, conditional alerts and durable update history, reminder editing, broader holdings valuation, P&L and a stock-specific discovery feed. Saved items clearly state that automatic checks are not running. “Your money” describes supported funding balances rather than inventing a portfolio total.

## Motion opportunities and decisions

| Location | Purpose | Frequency | Decision |
| --- | --- | --- | --- |
| Save/edit dialogs and workspace menu | Spatial consistency | Occasional | Reuse existing Base UI surfaces: transform/opacity, the shared 300ms spring with bounce `0.2`, scale `0.94` to `1` (corrected after inspecting the winning global CSS); reduced-motion opacity uses `--motion-feedback: 125ms`, keyboard activation stays immediate. |
| Save completion | Feedback | Occasional | Update the button to a check and “Saved”; no entrance replay or data movement. |
| Context attachment | State indication | Frequent | Static chip, removable immediately. |

Rejected: page slides on Home/Watchlist navigation (high frequency); rolling balances from zero (financial data being read); animated token prices or list reordering (reading stability); a new motion library (existing primitives suffice).

| Before | After | Why |
| --- | --- | --- |
| Route snapshots slide 56px for 300ms | Immediate navigation | Daily navigation and keyboard use should not wait for movement. |
| Bottom navigation enters and moves its indicator | Static two-destination bar | Stable touch targets and spatial memory. |
| Wallet total starts at zero and rolls for 600ms | Show the actual value immediately | Zero was never the balance; repeat visits should preserve reading stability. |

Motion verdict: approve the changed surfaces for restraint, stable data and existing reduced-motion behavior. Existing shared-browser and approval motion was preserved.

## Verification

`bun run check:fast` and `bun run check` passed. The full gate reports 1,283 passing tests and seven optional integration tests skipped, with no test failures. Two pre-existing unused-disable warnings remain in `apps/server/src/trading/holders.ts`.

`bun run e2e --workers=3` passed all 176 tests. After correcting the Watchlist toggle to dock a split browser back into the conversation, both focused `e2e/pop-out.spec.ts` tests passed. The full code gate was rerun after that correction.

Targeted checks cover owner isolation, revision races, URL validation, chain identity, context provenance, saved-item flows at 1440/390/320px, snapshots and reminders. The migration was applied to a disposable local Postgres 17 instance; the optional Watchlist database test passed separately across two database connections (one test, four assertions). The disposable database was stopped after verification.

Reviewed screenshots of the implemented app:

- Home: [desktop](implemented/home-desktop.png), [mobile](implemented/home-mobile.png), [320px](implemented/home-narrow-mobile.png).
- Saved-item details: [desktop](implemented/watchlist-detail-desktop.png), [mobile](implemented/watchlist-detail-mobile.png), [320px](implemented/watchlist-detail-narrow-mobile.png).

These screenshots show local identity and simulation markers. They are captures of the working UI, not generated concepts.

Live Birdeye verification was attempted through the configured environment, which contains a placeholder key in this checkout. The browser tests use explicitly marked stubs. No trade, live payment, production migration or deployment was performed.

Robinhood’s configured mainnet ID was checked against its [official connection documentation](https://docs.robinhood.com/chain/connecting/).
