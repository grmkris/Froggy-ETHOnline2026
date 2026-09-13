# 0041 — Home's first screen is the Playground

13 September 2026. Decided with the owner after they looked at the signed-in Home and called it ugly. Brief: `docs/design/HOME_PLAYGROUND_2026-09-13.md`.

## Decision

The first screen a signed-in person sees, before the first message, is drawn in the landing's palette and voice: cream ground, ink green, the 800-weight headline with the rotated lime mark, hard-shadow chips, the sticker. The twelve tokens live once, in a `.playground` class that the landing root and Home's first-use column both carry, with a Lilypad variant because the landing never had to draw a dark theme. On the first send the class leaves the column and the workspace tokens fade back in.

Above the hero stands one money line: the dollar balance in the display face and a gauge of the credits left of everything ever bought, held credits as their own segment, the count in mono. The row is the way to Your money. No icon, no subtitle, no arrow, and no stub badge: Your money, receipts and the top bar's stub count keep theirs. An unanswered balance shows the wallet's own words, never zero.

The "Recent updates" list is gone from Home. When the Inbox has unread updates, one sentence links there; otherwise nothing.

## Why

- The credits card spent six elements on one number and was the only bordered surface on the screen. The updates list printed hex addresses and fifteen-decimal balances.
- The landing promised a Playground. The room behind the door was the workspace's grey-green with a 36px headline. Continuity from the door to the room matters more than the shell matching, and the owner chose that trade.
- The gauge draws on `availableUnits`, `reservedUnits` and `spentUnits`, which already arrive; `spentUnits` is a lifetime count of captures, so the three sum to what was ever bought. Nothing new from the server.

## Consequences

- The rail, top bar and bottom navigation stay Passbook around a Playground column. That contrast is accepted, not a bug.
- The heading text stays `What can I help with?`; six browser specs find Home by it. The money row's accessible name begins `Your money`.
- The 1.2 MB Home frog PNG serves as two alpha WebPs. The welcome's `setup-complete.png` is still the PNG.
