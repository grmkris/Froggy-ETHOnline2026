# 0044 — The Playground is the app

13 September 2026. Decided with the owner on the afternoon of submission day, after the landing (`80ef801`), Home's first screen (decision 0041) and the Watchlist (brief `docs/design/WATCHLIST_PLAYGROUND_2026-09-13.md`, in flight) had been redrawn in the Playground while Chat, Inbox, Activity, Your money, Account, Welcome, the sign-in gate, the OAuth pages and the shell were still Passbook. Half the app in one voice and half in another was the problem; the owner asked for the rest, straight to `main`, with typecheck and lint as the gate.

## Decision

Every screen and the shell draw in the Playground. The twelve tokens the landing and Home shared inside `.playground` move to the root for both themes, in a new stylesheet, `packages/ui/src/styles/playground.css`, loaded after `globals.css`. The same file restyles the shared surfaces through their `data-slot` attributes rather than page by page:

| Surface | Now |
| --- | --- |
| Cards, tickets, dialogs, popovers | the ink outline and the hard offset shadow, both drawn as shadow so nothing moves |
| Outline buttons, tabs | Playground chips: 2px ink, 6px radius, mono uppercase, pressed into their shadow |
| Badges | machine words in a small box |
| Inputs, textareas, selects, input groups (the composer among them) | card ground, 2px ink, the ring on focus |
| `text-title`, `text-greeting`, `text-section`, `text-money` | weight 800 at the Playground's sizes |
| One-sided borders and dividers | the 20% hairline the money line uses; a box keeps its ink |
| The rail, top bar and pill navigation | converted by tokens alone; no structural change |

The shared page wrapper takes a mono eyebrow above its heading. Lilypad uses the `.dark .playground` values, which the owner had not yet judged; "light only" remains one line away.

## Why

- Continuity from the door to the room was the argument for 0041. Once the room is the Playground, every other room has to be, or the contrast that 0041 called "accepted, not a bug" becomes the bug.
- A theme-level flip converts the whole app in one commit. The two per-page briefs took an afternoon each and there were nine screens left with two hours to the submission.
- `globals.css` is another lane's live edit today. A stylesheet loaded after it can override tokens and utilities without touching it: rules outside a cascade layer beat Tailwind's layered utilities whatever their specificity, and `:where()` keeps each rule at zero specificity so a component's own class rules (`.landing-cta`, `.watch-bar`, `.playground-chip`) still win.

## Consequences

- 0041's "the rail, top bar and bottom navigation stay Passbook" is superseded. The `playground` class on Home's first-use column and the Watchlist column now repeats the root values; it is scope only, and Home's fade from paper to workspace on the first send is a no-op.
- No accessible name changed. Uppercase is `text-transform`, which the accessibility tree does not apply, so every heading, tab, region and button the browser specs pin reads as before.
- `destructive` stays the soft refused field (0038), the amber and blue driving rings stay, `text-machine` is never uppercased (addresses), and the browser canvas keeps its ring rather than a border.
- Follow-ups, once the files are free: fold `playground.css` into `globals.css`; add IBM Plex Mono 700 to the font imports (chips ask for it and synthesise today); turn the `rounded-xl` literals into tokens; the welcome step dots at 2px; a sentence in `apps/web/AGENTS.md` and an entry in `docs/plan/STATUS.md`.
- Not verified in a browser. The gate for this lane was `heavy bun run check:fast` on each commit; the first look is the owner's, before filming.
