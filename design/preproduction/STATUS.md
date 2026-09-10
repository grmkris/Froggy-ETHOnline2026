# Status

**Updated:** 10 September 2026 · **Gates A and B closed; C and E landed, F drafted** · **Full push** **Checkout:** `main` @ `701f71a` · **Coordinator:** one agent, no specialists launched

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

## Next, in order

1. **Mascot pose prompts** — exact, reference-anchored prompts for the six poses, ready to paste. Then verification and manifest records when the files come back.
2. **Fixtures** — the five labelled scenarios in `fixtures/`, wired into the boards.
3. **State matrix** — `flows/STATE_MATRIX.md`: empty, loading, partial, no result, provider unavailable, auth expired, blocked, needs-user, rejected, cancelled, failed, completed.
4. **Copy deck** — onboarding, status, notification, permission, error, empty state.
5. **Explore, Token detail, Wallet, Onboarding, Connections** screen families.
6. **Icons** — the mapped `lucide` set plus the few custom brand/status marks.
7. **Gallery and handoff** — one local index over assets, states and screens, then `handoff/` with the ordered implementation backlog.

## Deliberately not done

- No MCP server registered — a `rive` entry on this host would be a server that can never connect.
- No package installed into the repository, no global config changed, no port opened, no Git hook installed, no subscription bought, no credit spent, no account created.
- No production build, deploy, database change or financial action.
- No file belonging to another session staged, stashed, reverted or reformatted.
- No secret read or printed. Only key **names** from `.env.example`; `.env` values were never opened. Presence and absence only.
