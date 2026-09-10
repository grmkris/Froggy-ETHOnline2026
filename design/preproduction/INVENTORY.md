# Inventory — keep / rework / replace / missing

Audited 10 September 2026 against `main` @ `701f71a`. Starting the visual identity fresh does **not** mean deleting working wallet, browser, authorization or task code. This table separates the two.

Legend — **Keep**: use as-is. **Rework**: good foundation, brief changes it. **Replace**: does not survive the brief. **Missing**: does not exist yet.

## Design system and tokens

| Item | Where | Verdict | Why |
| --- | --- | --- | --- |
| Semantic token set | `packages/ui/src/styles/globals.css` — 252 custom properties, 37 `@utility` rules | **Keep** | Already the brief's palette: `--background #eff1ec` warm-grey cream, `--primary #2f7a4c` restrained forest green, `--brand-soft #e2efe6`, `--radius 20px`. Light-first with a complete `.dark` block. |
| Lime accent | — | **Missing** | The brief asks for "lively lime accents". There is no lime token; `--brand` currently aliases `--primary`. One new accent role needed, not a repaint. |
| Component library | `packages/ui/src/components/` — 34 source files, **113** exported PascalCase components | **Keep** | Includes `Ticket`, `Message`, `ChromeBar`, `Marker`, `DrivingRing` — Froggy-specific, not generic shadcn. |
| shadcn wiring | `packages/ui/components.json`, `apps/web/components.json` | **Keep** | Style `base-nova`, `lucide` icon family, cssVariables. Satisfies the brief's "reuse a coherent licensed UI icon family". |
| Fonts | Inter Tight variable, IBM Plex Mono, via `@fontsource*` | **Keep** | Both OFL, vendored as npm deps — redistributable, no proprietary font risk. A display face is a Phase C choice. |
| Design-system bridge | `.design-sync/` — config, 30 authored previews, 40 component docs, `build-css.sh` | **Keep, reuse** | This _is_ the editable design workflow the brief's B2 asks for, already pointed at `@froggy/ui` (project `09198294-…`). Needs `/design-login` to reconnect. |

`.design-sync/NOTES.md` is the single most valuable file for this assignment: it records that Chromium 108 renders every `oklch()` component transparent with black text, a failure that "looks exactly like the tokens aren't wired up" and cost a full debugging cycle. This host's Chromium is 151 and was verified to support `oklch()`, so that trap is closed.

## Brand and motion assets

| Item | Where | Verdict | Why |
| --- | --- | --- | --- |
| `FrogMark` | `packages/ui/src/components/frog-mark.tsx` | **Rework — strong input** | Drawn SVG, not an emoji, and already token-driven with `--eye`, `--pupil`, `--mouth` as separate roles. That is exactly the separately-editable anatomy Phase C requires. Geometry is minimal (three circles and two paths) and not yet characterful. |
| Favicon | `apps/web/public/favicon.svg` | **Replace** | It is the 🐸 emoji as an SVG `<text>` node. Renders as whatever font the viewer has — the exact problem `FrogMark`'s comment complains about. Placeholder, not a brand asset. |
| Wordmark | — | **Missing** | No wordmark anywhere in the checkout. |
| Mascot poses / illustrations | — | **Missing** | No raster or vector illustration assets exist. The whole repository contains exactly two image files, both the favicon. |
| App-icon master, social avatar | — | **Missing** |  |
| Rive / Lottie source or runtime | — | **Missing** | No `.riv`, `.rev` or `.lottie` file, and no Rive runtime dependency in any `package.json`. Branded animation starts from zero. |
| UI motion foundation | `apps/web/src/lib/motion.ts` + `motion@13.2.0` | **Keep — better than expected** | Spring tokens exported to CSS custom properties, a `data-motion-input` pointer/keyboard mode, animations _finished immediately_ on keyboard focus so navigation never waits, and press-freeze that pauses ancestor entrances under a finger. Reduced motion handled at component level via `useReducedMotion`. The brief's "use the existing Motion/CSS foundation for ordinary UI interactions" is already satisfied — **Motion+ is not needed.** |

## Navigation and screens — where the brief conflicts with the code

| Item | Where | Verdict | Why |
| --- | --- | --- | --- |
| Primary navigation | `apps/web/src/lib/nav.ts` | **Rework — conflict recorded** | Ships **six** destinations — Chat `/`, Wallet, Services, Agents, Activity, Settings — with the first three in a pill and the rest under a "More" popover. The brief mandates **three**: Home/For You, Explore, Wallet, and explicitly forbids separate Portfolio, Browser, Agents, Receipts, Earn and Telegram items in the primary sidebar. |
| `PillNav` mechanics | `apps/web/src/components/nav/pill-nav.tsx` | **Keep** | The shell is fine — one landmark at every width, popover inside the nav for assistive tech, `LayoutGroup` shared indicator, reduced-motion branch. Only the item list changes. |
| Route surfaces | `apps/web/src/router.tsx` | **Rework** | Routes exist for `/activity`, `/services`, `/browser`, `/wallet`, `/agents`, `/settings`, `/oauth/*`. Under the brief, `/browser` becomes a contextual task view rather than a destination, and Activity/Agents/Services fold into Explore or into task detail. |
| Earlier screens board | `docs/design/SCREENS_BOARD_FABLE51.html` (321 KB), `SCREENS_HANDOFF_FABLE51.md` | **Keep as history, superseded for layout** | A working code-first, token-bound HTML review board — the pattern the brief's B2 names as the fallback if no design seat exists. Its direction, "Passbook and Lilypad", has screens Home / Balance / Services / Agents / Settings, i.e. the six-item world. **Superseded by this brief, not deleted.** |
| Motion navigation study | `docs/design/MOTION_NAVIGATION_2026-09-08.md` | **Keep** | Prior art for nav transitions. |
| Wallet redesign brief | `docs/design/WALLET_REDESIGN_BRIEF_FABLE51.md` | **Keep as history** | Predates this brief. |
| Existing plans | `plans/DESIGN.md` ("a calm wallet with a frog accent"), `plans/00{1,2,3,4}-*.md` | **Rework** | `DESIGN.md`'s "calm wallet" framing is narrower than this brief's "playful crypto-native personal agent and capability platform". Recorded as a scoped design decision in `DECISIONS.md`, D-07 — not silently rewritten. |

## Product code the design must not break

| Item | Where | Verdict |
| --- | --- | --- |
| Wallet, signing, policy leash | `packages/wallet`, `packages/domain`, `apps/server/src/grants.ts` | **Keep — out of design scope** |
| Shared browser | `packages/browser` (session, tabs, screencast, arbitration, payment-navigation) | **Keep** |
| Graph / payments / protocol | `packages/graph`, `packages/payments`, `packages/protocol` | **Keep** |
| Dependency-direction rule | `tools/graph.ts` | **Keep — hard constraint.** `packages/browser` may not import `packages/wallet`, and vice versa. Design work adds no edge here. |
| Loud stubs | `apps/server/src/environment.ts` | **Keep — hard constraint.** Every stub is marked in the wallet pane and every receipt it touches carries `stubbed: true`. Fixture-driven design screens must obey the same rule: a simulated state must never be able to pass for a real one. |

## Summary

- **Keep:** the token system, 113 components, the `.design-sync` bridge, the Motion foundation, the nav mechanics, and all product code.
- **Rework:** the frog mark's geometry, the six-item navigation, `plans/DESIGN.md`'s scope.
- **Replace:** the emoji favicon.
- **Missing:** wordmark, mascot poses, illustrations, icon masters, a lime accent token, and every branded-animation asset — plus the two capabilities needed to make them (Rive host, image generation). See `ENVIRONMENT.md`.

The honest headline: **the interface foundation is in better shape than the brief assumes, and the brand layer is essentially empty.**
