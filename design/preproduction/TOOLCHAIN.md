# Toolchain — the smallest complete proposal

Prepared 10 September 2026 from the Phase A audit. Prices quoted from vendor pages read today; see `SOURCES.md`. **Nothing here has been purchased, installed system-wide, or configured beyond the existing checkout. New spending allowance is zero until approved.**

## The recommendation in one line

**Add nothing paid. Reuse the design bridge this repo already has, keep Playwright for review, produce branded motion in SVG + Motion on this host, and generate imagery through your existing chat subscription with prompts I write.** Total new recurring cost: **€0**. One login is needed; one decision is genuinely yours.

## Capability by capability

### 1. Editable design workflow → reuse `.design-sync`, skip Figma

**Recommended: the claude.ai Design System bridge already wired into this repo.**

`.design-sync/config.json` already targets `@froggy/ui` with project `09198294-daf5-4bb6-8d31-6ad66a8a9789`, 30 authored component previews, 40 component docs, and a working Tailwind-4 compile step. It is the brief's B2 requirement — native editable components bound to real tokens, readable back, reviewable as images — and it is already built, already token-accurate, and already documented with its own gotcha file.

- Cost: included in the existing Claude subscription. No new seat.
- Action needed: **`/design-login`** (one command, in your terminal). `DesignSync` returned exactly that instruction when called.
- Rollback: nothing to undo — reading needs no write plan, and writes are gated behind an explicit `finalize_plan` that names every path.

**Recommended against: Figma.** Not on cost grounds but on capability. Figma's own write-to-canvas documentation, read today, states _"You need a Full seat to write to Figma files with agents"_, and then lists the two limitations that matter most for this exact assignment: _"No assets (image) support yet — including no importing components that have images/videos"_ and _"Custom fonts aren't supported yet"_, plus a 20 KB response cap and beta-level output quality. A brand pack whose centre is a mascot illustration and a wordmark is the one job that connector currently cannot do. Adding a paid Full seat to get a read-mostly channel, alongside a working bridge, fails the "smallest complete" test.

Revisit only if you want Figma as the durable design source of truth for its own sake.

### 2. Browser review → Playwright, already proven

Already installed, already exercised this session, zero setup left. Evidence in `evidence/phase-a/`. Isolated `browserContext` per run gives the separate review profiles the brief asks for, with no access to your everyday authenticated browsing.

- Cost: €0. Action needed: none.
- A reusable harness is committed at `tools/review-shot.mjs`.
- Playwright MCP is **not** recommended — it would add a server to drive a browser this workspace already drives directly from a script, and the brief warns about shared-profile contention between parallel workers. Scripts with explicit contexts avoid that entirely.

### 3. UI motion → the repo's existing Motion foundation

`apps/web/src/lib/motion.ts` with `motion@13.2.0` is more careful than most production setups: spring tokens exported to CSS, keyboard focus finishing animations instantly so navigation never waits, press-freeze on ancestors, reduced motion at component level.

- Cost: €0. Action needed: none. **Motion+ is not required to animate a button.**
- The brief's B4 note about Motion's AI Kit installer rewriting configuration is worth heeding: this repo pins Bun, oxfmt and oxlint, and an installer that rewrites config would fight `bun run check`. Recommendation: do not run it. If Motion docs are wanted, read them; do not let an installer touch `oxlint.config.ts` or `package.json`.

### 4. Branded animation → produce in SVG + Motion now; treat Rive as a later, optional upgrade

This is the one place I am recommending against the brief's default tool, so here is the reasoning rather than a verdict.

**Rive cannot run on this host at all.** Its MCP is desktop-only, macOS or Windows, on a loopback port — verified today, no listener here, and this box has no graphical session. So Rive requires (a) a Mac or Windows machine you own, and (b) an agent seat running on it.

**And export is paid.** From Rive's pricing page today:

| Plan | Price | `.riv` runtime export | `.rev` editable backup |
| --- | --- | --- | --- |
| Free | $0/seat/mo, 3 collaborative files | **not included** | **not included** |
| Cadet | $9/seat/mo, max 3 seats | included | **not included** |
| Voyager | $32/seat/mo, max 25 seats | included | included |

Note the trap: the brief requires preserving the editable source _and_ backup separately from the runtime file. Doing that by the book means **Voyager, $32/seat/month** — Cadet gives you a runtime file you cannot back up as an editable artifact. On the free plan you can edit via MCP and ship nothing, which is the "editing verified; export blocked" state the brief anticipates.

**What SVG + Motion delivers on this host, today, for €0:** the whole motion contract the brief specifies in D2 — `idle`, `working`, `needs-user`, `success`, `stopped/error` — with theme, size and reduced-motion controls, driven by the app's real domain events rather than timers. `FrogMark` is already a token-driven SVG with separately addressable eyes, pupils and mouth, which is precisely the rig Phase C asks to prepare. Runtime cost is a few KB of markup instead of a runtime library plus a binary asset, it renders in the review harness that already works, and it needs no second machine.

**What Rive genuinely adds:** designer-owned timelines and real state machines, better squash-and-stretch character work, and data binding — worth real money _if_ a person is going to sit in the editor and iterate on character animation. For a five-state semantic contract on a mascot that does not yet exist, it is the wrong first purchase.

**Recommended sequence:** produce the motion contract in SVG + Motion in Phase D. If the character work then wants a real animator's tool, buy Cadet or Voyager _then_, with the mascot already designed and the contract already specified — which is also when the €9–32/month actually buys something. This keeps the pipeline honest: nothing is labelled "verified" that was not run.

### 5. Image generation → your existing subscription, my prompts

There is no image-generation route on this host: this agent exposes no native image tool, and no image-capable provider key exists in the repository's key list. The only model keys named are `ANTHROPIC_API_KEY` and the `OPENAI_COMPATIBLE_*` trio, and the latter is an Alibaba MaaS **text** endpoint.

**Recommended: you generate, I write the prompts and handle everything after.** The brief explicitly allows this — _"If native generation is unavailable, prepare exact prompts and guide me through generating/uploading the assets."_ I write exact, reference-anchored prompts; you paste them into the Claude or ChatGPT app you already pay for; you drop the files into `brand/`; I verify format, real alpha channel, dimensions and checksums, record provenance in `ASSET_MANIFEST.json`, and trace the vector geometry by hand for anything small enough to need it.

- Cost: €0 new. Action needed: nothing yet — the prompts come at Gate C.
- Alternative, only if the manual loop becomes the bottleneck: add one image API key (OpenAI `gpt-image` class or Google Gemini image). That is a new key, a new spend, and a budget approval. I have not created an account or spent a cent. My advice is to start manual and see whether volume ever justifies it — for a mascot plus roughly six poses and five vignettes, it very likely does not.
- Hard rule regardless of route: full-resolution originals are preserved, optimized exports are separate files, and transparency is verified in the alpha channel. A checkerboard painted into a picture is not a transparent background.

### 6. Vector authoring → hand-authored SVG

No Inkscape or ImageMagick on this host, and none needed. `FrogMark` shows the house style already: hand-written SVG with token `fill` values, which is how a mark stays themeable and diffable. A PNG wrapped in an `<svg>` element is not a vectorized character and will not be delivered as one.

### 7. Not recommended, and why — SVGator, Lottie Creator, Blender, Spline, 3D, audio

The brief is explicit that these are fallbacks, not a starter kit, and it is right. Lottie Creator's MCP bridge needs an open editor browser tab, which is another desktop dependency on top of the Rive one. None of them get installed unless a specific export is blocked and one of them is the specific remedy.

## Summary table

| Capability | Tool | Where it runs | New cost | Human action |
| --- | --- | --- | --- | --- |
| Editable design | `.design-sync` + claude.ai Design System | netcup | €0 | **`/design-login`** |
| Browser review | Playwright 1.62.1 + Chromium 151 | netcup | €0 | none — proven |
| UI motion | `motion@13.2.0`, existing foundation | netcup | €0 | none |
| Branded motion | SVG + Motion now; Rive later, optional | netcup | €0 | **decision: Mac/Windows?** |
| Imagery | Your chat subscription, my prompts | your machine | €0 | none until Gate C |
| Vector | Hand-authored SVG | netcup | €0 | none |
| Icons | `lucide`, already wired | netcup | €0 | none |

**Total new recurring cost: €0. Total new accounts: none. Blocking human actions: one login, one question.**

## Rollback

Everything added this session is additive and confined to `design/preproduction/`, plus one script at `tools/review-shot.mjs`. No global configuration was changed, no MCP server was registered, no package was installed into the repository, no port was opened, no Git hook was installed. Removing the directory and that one file returns the checkout to `701f71a` plus the other session's in-flight work, untouched.
