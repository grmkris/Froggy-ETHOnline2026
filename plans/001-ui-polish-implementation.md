# Froggy UI polish implementation

Implemented 12 September 2026 from the approved Home, mobile chat and Watchlist direction. The preceding [review brief](000-ui-review-brief.md) remains a record of the audit.

## Delivered behavior

- Empty Home has a compact funding summary, original frog artwork, a punchier greeting and three starter actions. Active chat removes the money summary; the workspace menu retains access.
- Home and Watchlist are the two primary destinations. Desktop history lives in the rail; mobile has compact Recent and New chat controls. Agent setup lives in Connections, and welcome replay lives in Account.
- Desktop Watchlist starts closed, preserves its choice through client navigation and resets with a new workspace session. Browser docking and server-owned conversations retain their existing behavior.
- Composer options contain the existing cross-chat permission and browser action. The permission's enabled state stays visible beside the composer. Focused mobile composition hides the bottom navigation, and attachment removal has a 44px target.
- Watchlist discovery opens explicitly. Search and New listings are named modes; neither opening discovery nor changing modes buys a lookup. Existing service pricing and approval paths handle submission.
- Saved token results use active saved items, exact network and normalized address to retain Saved after reload. Confirmed results link directly to the saved item. Token details reuse the last available snapshot, its observation time and simulation marker.
- Item forms retain their contents through popup exit and capture fresh defaults when reopened. Save controls have 44px targets. Reminders confirm their scheduled time, with one Coming up heading.
- Schedule, digest and setup caches are scoped to the session and wait for identity readiness. Mutation cache writes retain the initiating session key. Transient Watchlist and attachment state resets before rendering a different session.

## Character and motion

Two original transparent PNG illustrations are integrated into empty Home and setup completion. The existing SVG remains the navigation/status icon. [Asset provenance and exact prompts](../apps/web/public/froggy/README.md) accompany the files.

Confirmed Saved/reminder feedback fades in over 125ms without moving surrounding content. The first setup completion illustration uses 200ms opacity and scale 0.97 to 1; reduced motion uses only a 125ms fade. Keyboard activation is immediate. Existing shared surfaces retain their intentional 300ms spring, bounce 0.2 and scale 0.94; redundant primitive transition classes were removed. Unused workspace route-slide rules were removed while appearance transitions remain.

## Verification and limits

Browser coverage includes 320/390/768/1440px layouts, both themes, reduced motion, keyboard activation, Home-to-chat hierarchy, persistent Watchlist choice, explicit discovery, save/reload on all three requested networks, item forms, reminders and existing spending/browser flows. The session-cache regression delays the next response during a simulated identity/session transition to prove earlier reminders disappear immediately.

Live reads through the existing Birdeye adapter succeeded for new listings, inspection and search on Robinhood, Base and Ethereum mainnet using the configured Railway key. Results were not stubbed; inspected prices were present. Security data remained unavailable and must continue to be presented as unavailable. The provider initially rate-limited parallel reads; sequential verification succeeded. No trade, live payment, deployment or configuration change was performed.

Desktop Chromium viewport/focus tests do not prove physical iOS/Android software-keyboard behavior. P&L, stock discovery, background website monitoring and new trading integrations remain outside this round. Generated source PNGs are retained at their original resolution; responsive rendered dimensions reserve layout space.

Validation results:

- `bun run check:fast` passed during implementation. The final `bun run check` passed after the routing correction, including type-aware lint, types, dependency boundaries, unit tests and dead-code detection. Two existing unused-disable warnings remain in the trading holders adapter.
- The full `bun run e2e --workers=3` ran 182 tests: 170 passed and 12 failed. Ten failures exposed unwanted `discover=false` query serialization, which was corrected. One wallet geometry assertion and one detached trading screenshot did not reproduce in the final rerun; these remain possible test-timing issues rather than proven product fixes.
- The final targeted rerun of navigation, motion, onboarding, trading and UI-polish suites passed all 54 tests. It includes every failure from the full run, plus the strengthened assertion that an explicit discovery submission issues exactly one request. The entire 182-test suite was not repeated after this passing rerun.
- `git diff --check` passed. Browser console/page-error assertions passed in the new Home/chat and Watchlist flows.

Working-UI captures (local identity with explicit simulation markers):

- Home: [desktop](../design/concepts/2026-09-12/unified-watchlist/polished/home-desktop.png), [mobile](../design/concepts/2026-09-12/unified-watchlist/polished/home-mobile.png), [320px](../design/concepts/2026-09-12/unified-watchlist/polished/home-narrow-mobile.png).
- Active chat: [desktop](../design/concepts/2026-09-12/unified-watchlist/polished/chat-desktop.png), [mobile](../design/concepts/2026-09-12/unified-watchlist/polished/chat-mobile.png), [320px](../design/concepts/2026-09-12/unified-watchlist/polished/chat-narrow-mobile.png).
