# Status

**Updated:** 10 September 2026 · **Preproduction complete. Implementation authorized and under way.** **Checkout:** `main` @ `701f71a` · **Coordinator:** one agent, no specialists launched

## Done

**Phase A — audit.** `ENVIRONMENT.md` (headless host, capability matrix, MCP registrations, tmux metadata), `INVENTORY.md` (keep/rework/replace/missing), `TOOLCHAIN.md`, `SOURCES.md`, `DECISIONS.md`. References verified against their manifest checksums.

**Phase B — toolchain proof.**

- Browser review **proven** and reusable: `tools/review-shot.mjs` runs 1440/768/390/320 and reduced motion, reads reduced motion back from the document rather than trusting the flag, and exits non-zero on a console error or a sideways scroll.
- Rive **dropped for the submission** (D-11) on the CSP finding, not on price.
- Branded motion **delivered without it**: `brand/frog-mark.svg` plus `prototype/motion-states.html`, all five contract states, verified by `tools/state-sweep.mjs`.
- `tools/build-prototype.mjs` generates every board from the one mark, with a `--check` staleness gate, so geometry cannot drift across 24 stamps in three boards.

**Phase C — visual system.** `screens/review-board.html`: mark from 128 to 16, app icon, wordmark and reversed variant, palette, type scale, one button in every state, one task card, one approval, and a quiet Home with the sidebar the clean reference uses. `system/TOKENS_PROPOSAL.md` adds the missing lime accent and namespaced frog roles without repainting the existing palette.

**Phase E — first slice.** `screens/task-workspace.html`: one shell carrying conversation, status, a structured comparison, the decision, the browser affordance in all five modes, and four honest receipts — confirmed, uncertain, stubbed, price-changed.

**Phase F — readiness.** `SERVICES.md` from repository evidence plus one live read of the deployed app's health endpoint. Every integration reports live, Telegram included. Nothing is claimed `journey-verified` on the strength of a health check.

**Navigation.** `flows/NAVIGATION.md` maps today's six destinations onto the brief's three without deleting a capability.

### Defects the review loop caught, in this workspace's own work

Worth listing, because each one reported healthy while being broken:

1. CSS cannot reach inside an SVG `<use>` shadow tree — every rig animation was dead.
2. The generator suffixed `id="frog"`, silently breaking the working bob and success hop.
3. Eyelid travel never reached the eye: the blink never blinked and `stopped` was identical to `idle`, both while reporting running animations.
4. The review board's pending spinner ignored `prefers-reduced-motion`.
5. The board scrolled sideways at 320 px.
6. A Home mock labelled "desktop 1440" was rendered in a 400 px column.
7. Task step markers collided with their own labels.

## Blocked

| What | Blocked by | Effect |
| --- | --- | --- |
| Mascot poses and illustrations | No image-generation route here | Route agreed: prompts from me, generation by you. Prompts are the next artifact. |
| Merchant card checkout | No automated route exists at all | Designed as a human handoff, recorded in `SERVICES.md` |

## What is left

| Phase | State |
| --- | --- |
| A audit · B toolchain · C visual system | complete; Gate C approved 10 Sep |
| E screen families | complete — 16 screens, 11 families, all fixture-driven |
| F services readiness | complete — `SERVICES.md`, nothing over-claimed |
| H quality gate and handoff | complete — `GALLERY.html`, both manifests, `handoff/` |
| **D asset pack** | **partly blocked** — motion, brand exports, icons and copy done; **mascot poses and illustrations need your image route** |
| G parallel agents | not needed; one coordinator was enough |

### Preproduction is finished; implementation was authorized on 10 Sep

All generated assets are in: seven poses (two at revision 2) and five vignettes, verified for real alpha, dimensions, palette and checksums, with provenance read from each file's own C2PA manifest (`gpt-image 2.0`). Twenty assets recorded.

The owner authorized the implementation backlog. What has landed in the app:

| Item | State |
| --- | --- |
| 1 · Adopt the tokens | done — `--lime`, `--lime-ink`, `--frog-*`, old names aliased |
| 2 · Replace the favicon | done — the emoji favicon is gone |
| 3 · `FrogMark` with poses | done — five-state `pose` prop, `compact` under 40px |
| 4 · Three destinations | done — Home/Explore/Wallet, desktop rail, no More popover |
| 5 · Task-driven Home | done — real approvals, conversations and schedules; `/chat` holds the conversation |
| 6 · Contextual browser | already true — not a destination, lives inside the task |
| 8 · Four settlement outcomes | **already implemented before this work** — `uncertain` and `pending` are handled honestly, with tests named "never calls an uncertain sent payment free" |
| 10 · Background work | done — schedules in Explore, cadence stated, never "monitoring" |
| 11 · Connections | done — `/agents` is Connections in the rail |
| **7 · Four-line approval ledger** | **not landed — needs a protocol change.** `ApprovalRequest` carries one `amountLabel` and a `detail` string; separating product, delivery, fees and agent spend means a new field on the money path. Flagged rather than pushed 48 hours before submission. |
| 12 · Vignettes in the app | done — `watch` and `services` in the empty states they were drawn for, exported at 192px (136KB for five, against 2.6MB of originals) |

Three real defects were found by the e2e suite while doing this, all of them mine:

1. `newChat` navigated to `/`, which is Home now, so "New chat" no longer opened a chat.
2. An effect redirected `/` to the last saved conversation — written when `/` _was_ the conversation. It would have made **Home unreachable for every returning person.**
3. Two "Froggy" wordmarks at desktop width, one in the rail and one in the top bar.

Thirteen e2e specs moved with the change, because the conversation moved to `/chat`. That is the specs following the app, not the tests being bent to pass.

### Everything else is done and gated

| Gate | Command | Currently |
| --- | --- | --- |
| Boards match the mark | `tools/build-prototype.mjs --check` | in sync, 5 outputs |
| Motion states | `tools/state-sweep.mjs` | reduced motion silent, `stopped` still, one-shot live |
| Fixtures | `tools/check-fixtures.mjs` | 5 pass |
| Any page | `tools/review-shot.mjs` | 4 widths + reduced motion; fails on a console error or sideways scroll |

The generator also refuses to write an output that the formatter would reformat, because that combination is a gate which fails forever — it happened three times here before the guard existed.

## Deliberately not done

- No MCP server registered — a `rive` entry on this host would be a server that can never connect.
- No package installed into the repository, no global config changed, no port opened, no Git hook installed, no subscription bought, no credit spent, no account created.
- No production build, deploy, database change or financial action.
- No file belonging to another session staged, stashed, reverted or reformatted.
- No secret read or printed. Only key **names** from `.env.example`; `.env` values were never opened. Presence and absence only.
