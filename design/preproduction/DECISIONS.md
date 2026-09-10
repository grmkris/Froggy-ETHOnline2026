# Decisions

Settled choices. **Do not reopen these.** Carried-forward product decisions come from the brief and are recorded here so a fresh agent does not re-litigate them; agent decisions are recorded with their reasoning; owner decisions are marked pending until you answer.

Status: `carried` (from the brief, not up for debate) · `agent` (made under existing authority, reversible, stated) · `pending` (needs you).

## Carried forward from the brief — closed

| ID | Decision | Status |
| --- | --- | --- |
| C-01 | Three primary destinations only: **Home/For You, Explore, Wallet**. Home and For You are one destination, never two tabs. | carried |
| C-02 | No Portfolio, Browser, Agents, Receipts, Earn, Telegram or ChatGPT item in the primary navigation. Connections and account settings are secondary. | carried |
| C-03 | The **task** is the organizing unit — conversation, status, structured outputs, decisions, browser context and receipts live inside it. | carried |
| C-04 | The browser is a **contextual task view**, not a destination. Closing the view never stops the work. Watching, taking control and stopping are distinct. | carried |
| C-05 | Home is task-driven: roughly three meaningful cards, a composer, a compact work summary. Sparse initial viewport. No four permanently expanded dashboard sections. | carried |
| C-06 | Structured outputs render as their own shape — comparisons for shopping, itineraries for travel, evidence and risk for token research. Not chat paragraphs. | carried |
| C-07 | Art direction: light warm/cream ground, restrained forest green, lively lime accent, rounded readable components, one expressive original frog. Dark mode is secondary. | carried |
| C-08 | One focal illustration per major screen. No mascot on every card, no sticker walls, no permanent charts, no neon control-room dashboards. | carried |
| C-09 | Personality lives in greetings and illustrations. **Permissions, prices, risks and outcomes are plain and precise.** | carried |
| C-10 | Precedence: written spec > clean layout reference (hierarchy and density) > earlier playful boards (personality only). An original mascot, not a blend of borrowed frog geometries. | carried |
| C-11 | Success follows a confirmed domain event — never a timer, animation end, request submission or optimistic click. | carried |
| C-12 | Agent permissions are always narrower than or equal to the user's authorization, including under delegation. No tool raises its own cap or grants its own approval. | carried |
| C-13 | No "risk-free", "safe bag", guaranteed-yield or "audited = safe" claims anywhere. | carried |
| C-14 | Preproduction only. No production rebuild, deploy, signing, funding, trade or live purchase under this assignment. | carried |

## Agent decisions — made this session, reversible

| ID | Decision | Reasoning |
| --- | --- | --- |
| D-01 | Workspace is `design/preproduction/` **on `main`**, not a new worktree. | The brief defaults to a dedicated worktree, but this checkout already has nine and the repository's own rules say work on `main` with explicit pathspecs. Adding a tenth worktree is bookkeeping nobody asked for. Mapping recorded in `README.md`. |
| D-02 | Reuse `.design-sync` as the editable design workflow. **Do not add Figma.** | Already wired to `@froggy/ui` with a live project id, 30 previews and 40 component docs. Figma's write-to-canvas needs a paid Full seat and cannot do image assets or custom fonts — the exact two things a mascot brand pack is made of. Full reasoning in `TOOLCHAIN.md`. |
| D-03 | Reuse `docs/design/` and `.design-sync/` rather than duplicating them here. | The brief says reuse a suitable existing design workspace and record the mapping. |
| D-04 | Browser review is Playwright driven by a committed script, not Playwright MCP. | Explicit `browserContext` per run gives isolated review profiles and avoids the shared-profile contention the brief warns about. Proven this session; evidence in `evidence/phase-a/`. |
| D-05 | Produce branded motion in **SVG + Motion** first; treat Rive as a later optional upgrade. | Rive cannot run on this host at all (desktop-only MCP, no graphical session here) and its export is paid — `.riv` from $9/seat/mo, editable `.rev` backup only from $32/seat/mo. The existing `FrogMark` is already a token-driven SVG with separate eye, pupil and mouth roles. Buying an animator's tool for a mascot that does not exist yet is the wrong first purchase. Reversible: if Phase C's character work wants real timelines, buy then. |
| D-06 | Do **not** run Motion's AI Kit installer. | Its installer can rewrite configuration; this repo pins Bun, oxfmt and oxlint and would fight it. `motion@13.2.0` and the existing `lib/motion.ts` already cover UI motion. Motion+ is not required to animate a button. |
| D-07 | This brief **supersedes** `plans/DESIGN.md`'s "calm wallet with a frog accent" framing and the FABLE51 "Passbook and Lilypad" six-screen direction, for navigation and density. Both are kept as history. | The brief is explicit that older design restrictions conflicting with it get a scoped, recorded design decision rather than a silent rewrite. Nothing was deleted. |
| D-08 | The emoji favicon is a placeholder to replace, not a brand asset. | `apps/web/public/favicon.svg` is 🐸 as an SVG `<text>` node, so it renders as whatever font the viewer has — the exact problem the `FrogMark` source comment exists to solve. |
| D-09 | Large review screenshots are not committed. Findings and `review.json` are. | The brief says keep large duplicate exports and ephemeral recordings out of routine source commits. The existing-board run produced 18 MB; the defect it found is recorded, the pixels are not. |
| D-10 | Fixture data obeys the repository's loud-stub rule. | `AGENTS.md`: every stub is marked and every receipt it touches carries `stubbed: true`. A simulated design state must never be able to pass for a real one — the same failure mode the brief warns about for concept images. |

## Gate A — answered 10 September 2026

| ID | Question | Answer | Consequence |
| --- | --- | --- | --- |
| P-01 | Authorize `DesignSync`? | **Still open** — needs you to run `/design-login` | Gate B's editable-design proof is the one thing still blocked |
| P-02 | Is there a macOS or Windows host for Rive? | **Yes, a Mac** | Rive is in the toolchain as the authoring seat. **D-05 is revised below.** Runbook: `agents/RIVE_MAC_SETUP.md` |
| P-03 | Image route and budget | **Manual route confirmed, €0** | I write prompts at Gate C; you generate in the subscription you already have; I verify and record provenance |

### D-05 revised — Rive is in, export stays gated

The original D-05 deferred Rive because no eligible host was known. A Mac exists, so the decision changes to a **sequence** rather than a refusal:

1. Prove Rive editing on the **Free** plan, on the Mac, against a disposable file. Free allows editing through MCP and no export, which is exactly the brief's anticipated "editing verified; export blocked" state — an honest outcome, not a failure.
2. Report how far the smoke test actually got, step by step.
3. **Then** decide the plan, with the result in hand: `.riv` needs Cadet $9/seat/mo,
   editable `.rev` backup needs Voyager $32/seat/mo. Nothing is bought before step 2.
4. `motion/MOTION_CONTRACT.md` is authored first, so the Mac session builds a specified contract instead of exploring. The same contract governs the SVG fallback, so the work is not wasted in either outcome.

What has **not** changed: no purchase is authorized, `.riv` and `.rev` remain behind a separate approval, and the SVG + Motion route stays the fallback rather than being deleted.

### D-06 unchanged, and worth repeating

Motion's AI Kit installer is still not run. `motion@13.2.0` plus the existing `lib/motion.ts` covers UI motion, and Rive covers branded artwork. Neither needs Motion+.

## D-11 — Skip Rive for the submission. Revised again, 10 September 2026.

**Recommendation: do not buy a Rive plan, and do not put Rive in the critical path.** D-05's sequence assumed a runway it does not have. Asked directly whether the paid option is worth the complication, the answer is no — and the cost is not the reason.

### The runway

Internal cut is **Sat 12 Sep 20:00 CEST**, submission **Sun 13 Sep 12:00 EDT**. That is roughly 58 hours from this decision. The Rive path inside it looks like:

install the Early Access desktop app and resolve which channel serves the port → register MCP on the Mac → seven-step smoke test → design a mascot **that does not exist yet**, which itself needs the manual image loop → rig and animate five states → hit the export paywall and pay → ferry the `.riv` to netcup → add a WASM runtime to the web app → verify at five sizes, plus load failure and static fallback.

Steps one and two are unknown-duration setup on a pre-release build. Everything after them is blocked on a mascot that has not been drawn.

### The blocker that is not about time

`apps/server/src/security-headers.ts` enforces `CSP_MODE=enforce` with `script-src 'self'` plus three named payment hosts, and `apps/server/src/security-headers.test.ts` **asserts** that the policy contains neither `unsafe-eval` nor `'unsafe-inline'`. Rive's web runtime is WebAssembly, and instantiating it under a strict policy generally needs `wasm-unsafe-eval` in `script-src`.

So shipping Rive means loosening a security header and rewriting the test that guards it, two days before submitting a product whose entire pitch is _"a browser you can watch, on a leash you set"_. That trade is bad on its own terms, independently of the deadline. A judge reading the diff would be right to ask about it.

### What is given up, honestly

Real state machines, designer-editable timelines, data binding, and better squash-and-stretch character work. Those are genuine. They are also worth paying for when someone is going to sit in an editor and iterate on a character — not for five semantic states on a mark rendered between 24 and 128 px, which reduced motion collapses to static poses anyway, in a product the brief says should keep most of the interface still.

### What replaces it

`FrogMark` is already a token-driven SVG whose eyes, pupils and mouth are separate roles — the rig, already built. `motion@13.2.0` is already a dependency, already in production use, and already correct about reduced motion and keyboard focus. The five states in `motion/MOTION_CONTRACT.md` need **no new dependency, no second machine, no binary asset, no CSP change, and no purchase**, and they are verifiable on the host where the review harness already works.

### What this does not close

`motion/MOTION_CONTRACT.md` is deliberately tool-independent, so none of it is wasted. If Froggy continues past the hackathon and the character work wants a real animator's tool, buy **then** — with the mascot designed, the contract specified, and no deadline. That is also the point at which $9 or $32 a month actually buys something.

`agents/RIVE_MAC_SETUP.md` stays in the repository, unexecuted, for that day.

## D-12 — The design-system project, corrected. 10 September 2026.

**D-02 was right about the tool and wrong about one fact.** It said `.design-sync` was "already wired to a live project". It is wired; the project is gone. Recording the correction rather than quietly editing D-02, because the wrong version informed a recommendation.

`DesignSync get_project` on the id in `.design-sync/config.json`, `09198294-daf5-4bb6-8d31-6ad66a8a9789`, returns **HTTP 404 `project not found`**. The two projects that do exist on the account are `Industry` (fully populated — components, foundations, templates, a different product) and `Design System` (empty). Neither is Froggy.

**Decision, owner-approved:** a new design-system project named **Froggy**, `3f609607-6f91-4b05-9ec7-6dd2bb550092`. `Industry` is left untouched — pushing Froggy components into another product's system would be the kind of mess that is easy to make and tedious to unpick.

`.design-sync/config.json` now carries the new id, so the next agent to run a sync does not rediscover the 404.

### What was pushed

Eight files, read-only inspection first and every path named in a `finalize_plan` before any write:

```
readme.md            styles.css
foundations/color.html   foundations/type.html
components/buttons.html  components/task-card.html  components/approval.html
brand/mark.html
```

Each preview carries a first-line `@dsCard` marker so the Design System pane groups them under Foundations, Components and Brand. Every card renders clean at 1440/768/390/320 and under reduced motion, with no console errors, checked before the push rather than after.

`styles.css` mirrors the shipping palette and marks the proposed `--lime` and `--frog-*` roles as proposed, so the bundle cannot imply the app already has them.

**Gate B's editable-design half is closed.** All four prioritized capabilities are now either proven or resolved: browser review proven, editable design proven, branded motion delivered without Rive, image generation routed through the owner.
