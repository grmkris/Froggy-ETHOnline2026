# Froggy workspace UX redesign

Implemented 13 September 2026 from the approved screenshot review and workspace redesign direction. The September 12 [implementation record](001-ui-polish-implementation.md) describes the earlier iteration.

## Delivered

- Home, Inbox and Watchlist form the primary navigation. Desktop has a 224px sidebar with recent conversations and secondary destinations; mobile has three bottom destinations. A single workspace header holds the current title, conversation actions and browser controls.
- Inbox has a dedicated received/outgoing list and reader. At 1024px and above they appear side by side; smaller screens show one at a time. Rows keep their natural height, and each pane scrolls independently. Selecting a message resets its reading position and focuses the reader on mobile.
- Existing email APIs handle received search, cursor pagination, message retrieval, attachment downloads, reply drafting, editing, deletion, revision-bound approval and delivery status. Older attachments remain downloadable even when their metadata is outside the latest page. Downloads retain the server-provided filename. Outgoing explicitly describes its existing latest-20 limit.
- “Ask Froggy” attaches the selected email to its conversation without sending a request. The composer shows removable context and preserves existing unsent text. Chat contains a compact email summary instead of a stack of full messages above the browser.
- Chat drafts, queued text, email context and unsaved email fields live above routes. They survive client navigation within their conversation and workspace session. Session changes clear them synchronously without remounting the workspace, and late uploads from an earlier session cannot restore its private fields. Unsent fields are not persisted to localStorage. Saved email drafts retain the existing server persistence and approval flow.
- Empty Home pairs a compact balance summary with a greeting and three starter actions. A short-phone layout keeps these actions reachable. Active conversation space belongs to messages and the composer. Focusing composer controls no longer displaces them before a click completes.
- Tools groups existing services, trading, purchases and scheduled work into URL-backed views. Result and review links open the correct view; creating a listing watch opens scheduled work. Account has section navigation and disclosed technical details. Money links directly to spending controls. Watchlist uses divided rows with calmer surfaces.
- Browser split view requires at least 1280px and reserves 480px for chat. Pointer and keyboard resizing share bounds; Arrow keys, Shift+Arrow, Home and End are supported. Narrower layouts use the inline browser and preserve the existing browser owner and canvas painter.
- Loading the last page of conversation history retains the toolbar height, keeping the reader’s scroll anchor stable.

## Visual system

Manrope is the UI typeface and IBM Plex Mono identifies technical values in both themes. Warm neutral surfaces, restrained green accents, differentiated 10/12/16/20px radii and flatter controls replace repeated gloss and elevation. Shared overlays enter from scale 0.98 with non-overshooting springs; repeated wallet entrances and hover lift are removed. Keyboard activation remains immediate. Reduced motion, reduced transparency, contrast preferences and visible focus treatments remain supported.

## Verification

- Frontend production build and TypeScript checks passed for `apps/web` and `packages/ui`. All 170 frontend unit tests passed. Type-aware lint passed for the redesign files, as did dependency boundaries, agent-file validation, naming checks and `git diff --check`.
- The final full browser run executed 198 tests: 186 passed, 10 failed and 2 did not run. Failures covered the concurrently changing browsing-budget/monitoring flows, the now-disabled address field without a browser, an appearance timeout, token-saving tests affected by the new monitoring dialog, and the old setup-confirmation assertion after claiming email directly from Inbox.
- An isolated rerun of email, Inbox, appearance, Watchlist and welcome executed 37 tests: 35 passed. The remaining failures were a desktop Watchlist edit timeout and the setup assertion, which was corrected to expect the newly opened mailbox. Both final confirmation checks passed (2/2). The entire 198-test suite was not repeated after this targeted confirmation.
- `bun run check:fast` and `bun run check` were run but are not green for the shared worktree. They stop at formatting issues in concurrently changing server, monitoring, browser and Graph files. Broader frontend lint and dead-code checks also report issues in that integration work; the scoped redesign checks pass. Those files were preserved rather than swept into this change.

Browser tests use the repository’s explicit provider stubs and local identity. They do not prove live payment, real email delivery or physical mobile keyboard behavior. The Inbox regression matrix covers 320, 390, 768, 1024, 1280 and 1440px, natural row height, independent scrolling, search, pagination, downloads with original filenames, explicit Ask Froggy handoff, unsaved fields across navigation, and a delayed upload completing after a session change. Keyboard browser resizing and short-phone Home coverage are included.

## Working screenshots

These captures show the implemented app with explicit simulation markers:

- Home: [desktop](../design/concepts/2026-09-13/workspace-ux/home-1440.png), [mobile](../design/concepts/2026-09-13/workspace-ux/home-390.png), [320 × 568px](../design/concepts/2026-09-13/workspace-ux/home-short-phone.png).
- Inbox: [desktop](../design/concepts/2026-09-13/workspace-ux/inbox-1440.png), [1024px](../design/concepts/2026-09-13/workspace-ux/inbox-1024.png), [mobile](../design/concepts/2026-09-13/workspace-ux/inbox-390.png), [320px](../design/concepts/2026-09-13/workspace-ux/inbox-320.png).
- Account: [Passbook](../design/concepts/2026-09-13/workspace-ux/account-passbook.png), [Lilypad](../design/concepts/2026-09-13/workspace-ux/account-lilypad.png).
