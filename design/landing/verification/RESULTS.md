# Verification results · Playground landing · 13 September 2026

This is a shared `main` checkout with another agent actively changing watchlist, inbox, wallet activity and their server contracts. Results below describe actual runs, not a claim that the moving combined tree is release-ready.

| Check | Actual result |
| --- | --- |
| Final landing Playwright suite | **16 passed**, 54.8 seconds, two workers, isolated stub ports 3190/3191. All five required widths, all three examples, review/keep-watching, all primary CTAs and hash links, keyboard tabs/FAQ/skip link, reduced motion, clipboard success/failure, art failures, `/landing/playground`, and auth loading/error/cancel/signed-in/private-route behavior. |
| Type-aware lint on landing implementation/tests/Vite metadata | **Passed**. Log `/tmp/froggy-landing-lint.log`. The shared router has additional concurrent edits after this check. |
| Whole-project `bun run typecheck` | **Passed** at the recorded checkpoint: 12 projects plus tools/e2e. The checkout continued changing afterward. |
| Frontend production build | **Passed**, 6.50 seconds, after the final hero/metadata changes. Production captures and performance measurements used this successful build. |
| `bun run build` | **Passed** on the final combined retry: web and server builds, 6.919 seconds. Earlier in-progress database/ActivityCard export failures were resolved by the parallel work. |
| `bun run check:fast` / `bun run check` | **Stopped at formatting**. The last fast run listed 26 files; the final full-check retry listed seven. Concurrent changes touch the shared router and add CSS after the scoped landing block. No global formatting, rule suppression or unrelated fixes were applied. |
| Graph, agent files, name checks | **Passed**: 12 workspaces, three repository skills, 2160 tracked files at that checkpoint. |
| `bun run test` | **Failed** in the existing web market-snapshot test: 181 web tests passed, one failed (`apps/web/src/lib/market-snapshots.test.ts:69`, expected a foreign-chain ticket to be ignored). The parallel work changes the saved-item chain model. Turbo halted the aggregate run; no complete package-suite pass is claimed. |
| `bun run knip` | **Failed**, five unused exports in concurrent update/watchlist files; none in the landing. |
| Broad browser suite | **184 passed, 47 failed, four did not run**, 10.3 minutes, four workers. One of the failures is the initial landing keyboard test, fixed and superseded by the final 16/16 run. Other failures are outside landing; their baseline/concurrent cause was not established by this task. |
| Visual/browser checks | Full-page captures at 320/390/768/1024/1440 and desktop/mobile section close-ups inspected. No horizontal overflow, console/page errors or failed image loads on successful page loads. No private API requests or workspace sockets from public previews. |
| Metadata | Static title/description/favicon/OG/social image checked; configured-origin canonical and absolute social URL verified in built HTML. One description tag after rendering. Body content remains client-rendered. |

## Commands and logs

```sh
FROGGY_E2E_PORT=3190 bun run e2e e2e/landing.spec.ts --workers=2 --output=/tmp/froggy-landing-final-results
FROGGY_E2E_PORT=3200 bun run e2e --workers=4 --grep-invert 'landing screens come from local app flows' --output=/tmp/froggy-landing-full-e2e-results
APP_ORIGIN=http://127.0.0.1:3188 bun run --cwd apps/web build
bun run check:fast
bun run check
bun run typecheck
bun run test
bun run graph
bun run agents:check
bun run names:check
bun run knip
```

The broad run intentionally excluded the old marketing app-screenshot capture because the current brief defers those captures. It still ran the normal application QA tests. Services were pinned to stubs by the existing Playwright configuration; no live purchases, emails or policy changes were made.

Raw local logs use `/tmp/froggy-landing-*.log`; Playwright failure traces are under the output directories above. Screenshot artifacts and [performance measurements](performance.json) live beside this report. The first responsive test treated HTTP 304 as failure; response traces proved the assets loaded successfully, and the check now counts HTTP errors correctly. The keyboard test previously sent Tab before the lazy route mounted; it now waits for the visible headline before exercising the first focus target.

## Latest full-check formatting blockers

- `apps/server/src/updates-routes.ts`
- `apps/server/src/watchlist-enrichment.ts`
- `apps/web/src/router.tsx`
- `packages/ui/src/styles/globals.css`
- `packages/wallet/src/update-store-postgres.test.ts`
- `packages/wallet/src/update-store.ts`
- `packages/wallet/src/wallet-activity-store-memory.ts`

## Broad-suite failures from the recorded run

This run started before the final landing test fixes and overlapped active app changes. Rerun the combined gates after that work settles; the list does not establish causality or authorize changing those features.

- e2e/credits.spec.ts:143:1 › credits are separate from wallet funds and have independent caps
- e2e/credits.spec.ts:180:3 › review eip155:8453 purchase and recover pending payment after reload
- e2e/credits.spec.ts:180:3 › review hedera:testnet purchase and recover pending payment after reload
- e2e/landing.spec.ts:149:1 › navigation, keyboard tabs, FAQs and reduced motion work
- e2e/navigation.spec.ts:25:5 › lilypad navigation reaches every destination at 768px
- e2e/navigation.spec.ts:25:5 › lilypad navigation reaches every destination at 390px
- e2e/navigation.spec.ts:25:5 › lilypad navigation reaches every destination at 320px
- e2e/navigation.spec.ts:118:1 › Home counts a waiting approval, and stops when it is answered
- e2e/onchain-alerts.spec.ts:77:3 › wallet conditions persist and pause on eip155:8453 at 1440px
- e2e/onchain-alerts.spec.ts:77:3 › wallet conditions persist and pause on eip155:4663 at 390px
- e2e/onchain-alerts.spec.ts:135:3 › local demo price triggers and rearms without extending expiry on eip155:8453
- e2e/onchain-alerts.spec.ts:135:3 › local demo price triggers and rearms without extending expiry on eip155:4663
- e2e/onchain-alerts.spec.ts:217:1 › price editor keeps quote units and renders a marked fixture with rearm and pagination
- e2e/pop-out.spec.ts:12:1 › the page can go to a split pane and back
- e2e/pop-out.spec.ts:84:1 › browser resize is keyboard accessible and keeps chat readable across breakpoints
- e2e/purchases.spec.ts:79:3 › URL purchases › approves a saved request after reload and keeps the delivered response
- e2e/screens.spec.ts:27:5 › /watchlist holds together at 1440px
- e2e/screens.spec.ts:27:5 › /watchlist holds together at 768px
- e2e/screens.spec.ts:27:5 › /watchlist holds together at 390px
- e2e/screens.spec.ts:27:5 › /watchlist holds together at 320px
- e2e/screens.spec.ts:27:5 › /activity?tab=agents holds together at 1440px
- e2e/themes.spec.ts:5:1 › appearance defaults to Passbook, persists, previews, and follows System
- e2e/themes.spec.ts:45:5 › passbook components fit at 768px with reduced motion
- e2e/trading.spec.ts:499:1 › a listing watch shows fixed capacity and stays stopped after a mobile reload
- e2e/trading.spec.ts:540:1 › a human authorizes and revokes a bounded Pons watch rule on mobile
- e2e/trading.spec.ts:679:1 › a bare address paste is looked up for free and nothing is bought
- e2e/trading.spec.ts:719:1 › sponsored approval explains gas and delegation, and missing owner authorization never submits
- e2e/ui-polish.spec.ts:16:3 › Home makes room for an active conversation at 320px
- e2e/ui-polish.spec.ts:16:3 › Home makes room for an active conversation at 390px
- e2e/ui-polish.spec.ts:16:3 › Home makes room for an active conversation at 1440px
- e2e/ui-polish.spec.ts:88:1 › a new session removes cached reminders before the next response arrives
- e2e/ui-polish.spec.ts:159:1 › keyboard button activation has no press transform
- e2e/ui-polish.spec.ts:189:1 › opening discovery is free and new listings are an explicit request
- e2e/ui-polish.spec.ts:218:1 › short phone Home keeps its starter actions and composer reachable
- e2e/watchlist-capture.spec.ts:29:3 › paste resolves both chains without a purchase and saves without a modal at 1440px
- e2e/watchlist-capture.spec.ts:29:3 › paste resolves both chains without a purchase and saves without a modal at 390px
- e2e/watchlist-capture.spec.ts:248:1 › duplicate enrichment and refresh requests purchase one task per explicit request
- e2e/watchlist-capture.spec.ts:349:1 › insufficient credits keep the saved item and do not retry enrichment automatically
- e2e/watchlist.spec.ts:7:3 › save, edit, attach and archive a product at 1440px
- e2e/watchlist.spec.ts:7:3 › save, edit, attach and archive a product at 390px
- e2e/watchlist.spec.ts:7:3 › save, edit, attach and archive a product at 320px
- e2e/watchlist.spec.ts:108:3 › token lookup and save preserve Robinhood identity
- e2e/watchlist.spec.ts:108:3 › token lookup and save preserve Base identity
- e2e/watchlist.spec.ts:108:3 › token lookup and save preserve Ethereum identity
- e2e/watchlist.spec.ts:147:1 › creates a real scheduled reminder and cancels it
- e2e/workspace-walkthrough.spec.ts:10:3 › walk through the wallet, services and agent setup at 1440px
- e2e/workspace-walkthrough.spec.ts:10:3 › walk through the wallet, services and agent setup at 390px

## Rollout status

The landing implementation, optimized art and its focused verification are delivered on `main`. The repository-wide gate is **not green**. The operator subsequently authorized commit and push; no branch, merge or deployment was performed. Resolve the parallel work’s outstanding test/lint failures and rerun the gates on a stable tree before release. Supply the actual public `APP_ORIGIN` when building production metadata. Live merchant/booking and payment-provider claims remain unverified and are deliberately not promised by this landing.

## Commit request checkpoint

The operator explicitly requested committing and pushing after the implementation handoff reported the wider gate failures. A fresh `bun run check` passed formatting, then stopped on `unicorn(consistent-function-scoping)` in the concurrently edited `apps/web/src/lib/market-snapshots.test.ts:22`. Landing-owned files and only the landing additions in the shared router/stylesheet are selected for the commit. Other agent changes, the handoff archive and pre-existing public originals stay out of this commit. The focused landing suite remains 16/16 and the latest recorded combined build passed.
