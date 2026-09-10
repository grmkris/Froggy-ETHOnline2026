# Handoff

Everything an implementer needs, and an honest account of what is not ready. Start at `../GALLERY.html`; resume from `../STATUS.md`.

**This package does not authorize implementation.** Building the backlog below needs a new decision from the owner.

## 1. The direction, approved

Gate C approved on 10 September 2026: the mascot, the compact mark and icon, the tokens, and the Home sample. Playful, internet-native, light and warm; restrained forest green with a lime accent used in exactly two places; rounded readable components; one expressive original frog and one focal illustration per major screen.

Three primary destinations — **Home/For You, Explore, Wallet**. A task is the organizing unit. The browser is a contextual task view, never a destination.

## 2. Assets and editable sources

| What | Source | Status |
| --- | --- | --- |
| The mark, and the motion rig | `brand/frog-mark.svg` | approved direction |
| Monochrome / reversed | `brand/frog-mark-mono.svg` | **must be inlined** — `currentColor` |
| Favicon | `brand/favicon.svg` | ready to replace the emoji favicon |
| App icon master | `brand/app-icon.svg` | 1024, no native export sets yet |
| Custom icons | `system/icons/leash.svg`, `stubbed.svg` | on lucide's grid |
| Mascot poses | `brand/POSE_PROMPTS.md` | **not produced** — needs the owner's image route |
| Illustration vignettes | — | **not produced** — same blocker |

Every produced asset is recorded in `../ASSET_MANIFEST.json` with bytes, checksum, provenance, licence and review status. Fields that were not established are `null`, never guessed. `BRAND.md` carries the usage rules and the traps.

## 3. Motion

`../motion/MOTION_CONTRACT.md` is the contract. Five application states — `idle`, `working`, `needs-user`, `success`, `stopped` — with the mapping from the repository's real **eight**-state `TaskStatus`. The load-bearing row: `uncertain` renders as neutral `stopped`, never failure and never success.

The app sets **one** value. It does not drive keyframes, does not know about artboards, and never calls a "play celebration" function — that is how a celebration escapes its domain event. `success` is entered only on a confirmed `done`.

Delivered as SVG + the existing `motion@13.2.0` foundation. Rive was dropped: see D-11. Every loop pauses offscreen and on a hidden tab; reduced motion collapses each state to a distinct static pose; a failed asset falls back to a still pose.

## 4. Tokens and component mapping

`../system/TOKENS_PROPOSAL.md`. Two additions, no repaint: `--lime` / `--lime-ink`, and namespaced `--frog-*` roles.

| Design | Existing code |
| --- | --- |
| Task card, approval, receipt | `Card`, `Ticket`, `Message` in `packages/ui` |
| Browser affordance | **`DrivingRing`** — already encodes agent/human/idle |
| Buttons, chips, tabs, sheets | existing `packages/ui` components |
| Primary navigation | `apps/web/src/lib/nav.ts` + `PillNav`; add a desktop rail |
| Motion timings | `apps/web/src/lib/motion.ts` — reuse, do not replace |
| Icons | `lucide`, already wired in both `components.json` |

`FrogMark` in `packages/ui` reads `--eye`, `--pupil`, `--mouth`. If the namespaced roles are adopted it is a three-line change, and the old names can alias the new ones for one release.

## 5. Screens and flows

`../SCREEN_MANIFEST.json` — 16 screens across 11 families, each with viewport, source node, components, fixture and review image. `../flows/NAVIGATION.md` maps six destinations onto three. `../flows/STATE_MATRIX.md` answers twelve states per surface and puts settlement on its own axis. `../system/COPY.md` is the copy deck.

Five fixtures in `../fixtures/`, gated by `tools/check-fixtures.mjs`.

## 6. Services readiness

`../SERVICES.md`, from repository evidence plus a live health read. Every integration reports `adapter-live`. **Nothing is `journey-verified`** — a health check proves credentials and reachability, not that a person can finish a purchase or that settlement reconciles.

## 7. Blockers, named

1. **Merchant card checkout has no automated route.** Modelled throughout as an explicit human handoff with redacted entry. Not a design preference — a capability gap.
2. **The agent signer needs a browser consent click.** Until granted, the honest UI is "Froggy cannot pay yet", not a dead button.
3. **Mascot poses and illustrations are not produced.** No image-generation route on this host; prompts are written and waiting on the owner.
4. **Asset storage and observability are undecided.** Neither blocks design. Neither should be invented into a screen. Never create a public bucket by default.
5. **Rive export is unproven.** Deliberately: D-11 dropped it for the submission on a CSP finding. `agents/RIVE_MAC_SETUP.md` is kept, unexecuted.

## 8. Validation evidence

| Gate | Command | Currently |
| --- | --- | --- |
| Boards match the mark | `tools/build-prototype.mjs --check` | in sync, 4 boards |
| Motion states | `tools/state-sweep.mjs` | 5 states; reduced motion silent; `stopped` still; one-shot live |
| Fixtures | `tools/check-fixtures.mjs` | 5 pass — markers, states, domains, timestamps, claims |
| Any page | `tools/review-shot.mjs` | 1440/768/390/320 + reduced motion, fails on a console error or sideways scroll |
| Repository | `bun run check:fast` | format, lint and graph green on every commit |

**This is preview validation, not a release gate.** It says nothing about the production app.

## 9. Backlog, ordered

The first vertical slice, in order, is the whole point:

1. **Adopt the tokens.** `--lime`, `--frog-*`; alias the old frog names for one release.
2. **Replace the favicon** with `brand/favicon.svg`.
3. **Three destinations.** `nav.ts` to Home/Explore/Wallet; add the desktop rail; retire the More popover; fold Services into Explore, Agents into Connections, Activity into Wallet and the task.
4. **Home becomes task-driven** — needs-you first, then results, then findings, then a one-line background summary. Not a chat log.
5. **The task shell** — conversation, status, structured output, decision, browser context, receipts, with a per-kind result body.
6. **`/browser` becomes contextual**, using `DrivingRing`, with closing ≠ stopping.
7. **The approval** — four separated lines, amount in the button, visible expiry, reauthorization on any material change.
8. **The four settlement outcomes**, especially uncertain: no second debit, no rail switch.
9. **The motion contract** behind one semantic input, driven by `TaskStatus`.
10. **Background work** — cadence, expiry, quiet hours, research-vs-execute as separate permissions, pause and stop.
11. **Connections** — delegate and use-a-service as separate grants, allowance always narrower than the owner's.
12. Mascot poses and illustrations, once generated.

Items 1–2 are hours. 3–8 are the slice worth demonstrating. 9–12 follow.

## 10. Resume

```sh
cd ~/code/ethglobal-online-2026
open design/preproduction/GALLERY.html      # or serve the directory
cat design/preproduction/STATUS.md          # what is done, blocked, next
```

A fresh agent needs `../README.md` and `../STATUS.md` and nothing from the chat that produced this.
