# 0045 — The Watchlist is the Playground, and the watch comes first

13 September 2026. Decided with the owner after the agent tracked a wallet's transfers, the Telegram alerts arrived, and the Watchlist could not say what was going on. Brief: `docs/design/WATCHLIST_PLAYGROUND_2026-09-13.md`.

## Decision

The Watchlist route's column carries the `playground` class always, list and detail: cream ground, ink green, the lime mark on the headline, ink-bordered surfaces with the hard shadow, mono eyebrows. The rail, top bar and bottom navigation stay Passbook, as accepted for Home in decision 0041.

One mixed list with filter chips: wallets, tokens, shopping, travel and links together, with Needs attention, Archived and Compare beside them. Every row says one sentence in the person's words, from `apps/web/src/lib/watch-words.ts`: what is being watched, where, until when, and where alerts go. The state is one chip, WATCHING, NEEDS YOU, PAUSED, ENDED, SAVED or ARCHIVED; balances are rounded and name the chain; the address is a mono chip that copies itself. The per-row "Ask Froggy" icon leaves; the detail keeps the button.

On the detail the order is the identity, then what Froggy is watching and what happened, then balances and facts, then notes and actions. The "Alert details and activity" disclosure is gone, so the activity that fired an alert is on screen, not folded away. "Saved for later" no longer stamps every item. "Recent updates" leaves the Watchlist; the Inbox nudge takes its place, only when something is unread.

The app is installable: a manifest, both capable metas, an opaque 180px touch icon and PNG icons rendered from the favicon by `bun run icons`. The status bar style is `default`, because nothing pads the top inset and iOS 26.x reports it as zero anyway.

## Why

- The activity the person came for was under a closed disclosure beneath balances, an enrichment note and Refresh. The row's second line was the discovery fact string verbatim, with fifteen decimals. Status was said in five places and the name was the agent's tool title.
- The Playground continuity the owner chose for Home applies to the room where the agent's watching is shown; Passbook surfaces beside Playground ones on the same screen were the worse trade.
- Everything the words need already arrives in the list payload and the monitor view. Nothing new from the server.

## Consequences

- The heading text stays exactly `Watchlist`; the motion suite finds the page by it. "Notify me", "Saved items", "Manage monitoring", "More actions", the rule sentences and the monitor buttons keep their names.
- `onchain-alerts.spec.ts` no longer clicks the disclosure.
- The monitor panel keeps the words the specs pin (the stream states, the rule sentences, "Simulated stream · local demo", the button names) while its surfaces, the time bar and the event sentences change. Event sentences take the domain's lookalike-aware asset label, so the address-poisoning warnings from the same afternoon survive the restyle.
- Lilypad uses the `.dark .playground` values from decision 0041; the owner has not yet approved them.
