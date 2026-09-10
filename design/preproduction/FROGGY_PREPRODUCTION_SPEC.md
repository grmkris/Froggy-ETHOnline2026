# Froggy — Guided Environment Setup and Design Production

Version: 1.0 · Prepared: 10 September 2026  
Repository: `https://github.com/grmkris/Froggy-ETHOnline2026`  
Owner: Kristjan · Default review language: English · Default timezone: Europe/Ljubljana

## 0. Your mission

Act as my hands-on environment engineer, design-production lead, and guide. Help me configure the working environment with you, then use it to produce Froggy's brand, assets, animations, interface designs, and implementation handoff.

**Do not start rebuilding the production app.** This assignment is preproduction: tools, decisions, editable design assets, a small isolated prototype, and evidence that the pipeline works. Do not stop at advice or a proposed checklist. Create the actual working files and use the available tools.

Proceed interactively. Inspect what you can, do safe reversible work, and guide me through account access, tool setup, and creative decisions when my participation is necessary. We will approve the important choices together. Once a bounded work package is approved, execute it without asking permission for every file or tiny revision.

Keep three things separate throughout:

- **Desired product:** what the future Froggy experience should support.
- **Verified implementation:** what the repository, current tools, and tested integrations actually support.
- **Prototype simulation:** sample data and interactions used to evaluate design.

Nothing in a concept image proves a feature, payment, provider relationship, or live integration.

## 1. Carry forward these product decisions

### 1.1 What Froggy is

Froggy is a playful, crypto-native personal agent and capability platform. It is not crypto-only and not merely a trading dashboard.

People can ask Froggy to research tokens, follow wallets, find shoes, plan a vacation, compare services, browse websites, prepare purchases, and manage authorized financial actions. They can use Froggy directly or give its capabilities to an existing assistant through Froggy's MCP server.

Examples to design around:

- Research a meme token; inspect evidence and risks; review a possible trade.
- Watch wallets or friends and surface relevant changes without automatically copying them.
- Compare staking or yield opportunities and manage positions without implying guaranteed returns.
- Find shoes within a budget; compare options; prepare checkout; buy through an authorized supported route or hand checkout to the user.
- Plan a vacation; return a useful itinerary and options; monitor selected prices when requested.
- Discover and purchase a paid report or service, including supported crypto/x402 access.
- Notify the user over Telegram and return them to the same task.
- Accept delegated tasks or individual service calls from another assistant over MCP.

These are design requirements, not an assertion that all execution routes exist today.

### 1.2 Navigation and layout

There are **three primary destinations: Home, Explore, Wallet.**

| Destination | Purpose |
| --- | --- |
| Home / For You | Start tasks, resume work, review results, handle requests, and see useful findings from requested background work. |
| Explore | Browse tokens, wallets/friends, and useful services. Search and act directly without requiring a chat message for every operation. |
| Wallet | Holdings, available funds, positions, payment methods, spending permissions, and financial history. |

Home and For You are the same destination. Do not introduce two tabs for them. Do not add separate Portfolio, Browser, Agents, Receipts, Earn, Telegram, or ChatGPT items to the primary sidebar. Connections and account settings are secondary.

The browser is a contextual task view. Show a compact “View browser” affordance while browsing, or open a task-specific handoff when the user needs to interact. Closing the view must not mean stopping the work. Distinguish watching, taking control, and stopping.

A task is the organizing unit: conversation, current status, structured outputs, needed decisions, browser context, and receipts. Shopping should render comparisons; travel should render itinerary/options; token research should render evidence and risk findings. Do not force every output into chat paragraphs.

### 1.3 Task-driven Home

Home reflects explicit tasks, watches, permissions, preferences, and results—not invented personal knowledge or a generic engagement feed.

Priority: items needing the user, meaningful results, relevant findings, then quiet background-work status. Keep the initial viewport sparse. Show roughly three meaningful cards, a composer, and a compact work summary rather than four permanently expanded dashboard sections.

Each surfaced finding needs a task/source link, why it appears, observed time, freshness, and a next action. Provide dismiss, mute, and stop-watching controls. Separate a suggestion from an enabled automation. A user's request for research does not authorize purchasing or indefinite monitoring.

Specify quiet hours, notification frequency, task expiration, check cadence, cost limits, and pause/stop. Closing an app does not cancel an authorized background task; cancelling the task does. Do not imply monitoring is continuous when it is scheduled or delayed. Use fixtures to demonstrate this behavior before implementing a scheduler.

### 1.4 Art direction

Playful, internet-native, slightly degen, friendly, and recognizable. The user preferred the first two playful directions, then explicitly asked for a much less busy interface. The later clean four-screen collage is the best layout reference.

Default: a light, warm/cream interface, restrained forest-green foundations, lively lime accents, rounded readable components, and an expressive original frog. Dark mode is a secondary exploration, not a prerequisite for every deliverable. Keep the mascot characterful rather than corporate or babyish.

Use earlier boards for attitude, frog expressions, and graphic accents—not for layout density. Avoid neon control-room dashboards, excessive gradients, sticker walls, permanent charts everywhere, or giant branding inside every task. Aim for one focal illustration per major screen, not a mascot on every card.

The visual identity can start fresh. The old frog and palette are useful inputs, not constraints. Do not copy another project's exact logo or mascot. Financial confirmations must be plain and precise even when surrounding copy is playful.

### 1.5 Reference handling

Look for the companion `references/` folder. Read `references/README.md` before using its images. The clean layout and playful brand boards are directional references, not final assets or specifications.

If only this Markdown file is provided, continue from the written brief. Ask once for the visual reference files at the creative review stage; do not invent an attachment or claim to have inspected unavailable images. Do not block environment discovery on missing images.

## 2. Working agreement and authority

### Allowed now

Read the repository and scoped environment metadata; create preproduction documentation, original assets, safe diagnostic helpers, and an isolated preview in the designated workspace. Inspect existing tools before adding new ones. Use already authorized tools within their existing permissions and budget.

### Ask before

Purchases, subscriptions, paid-credit top-ups, unapproved metered generation, system-wide installations, global configuration changes, new network exposure, external invitations/messages, public uploads, repository pushes, production changes, or real financial actions. Obtain a setup approval once per clear batch of scoped changes, not once per command.

Production deployment, database changes, signing, funding, token trades, staking, card checkout, and live service purchases are outside this assignment unless I separately authorize a specific test.

Never request secrets in chat. Have me use the provider login or a local secret store. Do not print environment values, wallet keys, credentials, browser cookies, or authentication tokens into logs, prompts, screenshots, reports, or committed files. Record only presence/absence and redacted identifiers.

Preserve uncommitted work and other agents' sessions. No hard reset, force checkout, blanket cleanup, automatic Git hooks, or killing an unknown process to free a port. Read root and applicable nested `AGENTS.md` before touching files. Follow repository package-manager and validation conventions. The inspected repository currently specifies Bun and relevant local skills; recheck the checkout rather than assuming old instructions remain current. [S12]

### How to guide me

Do not give me a 30-question questionnaire. First inspect what is available. Ask only about facts you cannot discover or decisions that materially affect the next step; generally one actionable request at a time.

For a human-required step, use this format:

> **Step / purpose:** what we are enabling.  
> **Already done:** what you actually checked or changed.  
> **Your action:** the precise click, login, permission, file selection, or decision needed.  
> **Success looks like:** an observable result.  
> **Then:** the test you will run after I return.

Recommend a default when asking me to choose. Record decisions and do not ask them again. Report short updates between meaningful steps. At a blocker, save the checkpoint and continue independent work where possible. Never pretend that an unavailable tool ran or that a stopped session will continue by itself.

## 3. Workspace and living records

Default to `design/preproduction/` inside a dedicated worktree. If the repository already has a suitable design workspace, reuse it and record the mapping. Do not duplicate existing plans indiscriminately. Keep mutable status and manifests under one coordinator's ownership.

```text
design/preproduction/
  README.md                       # Start here and current phase
  STATUS.md                       # Completed, blocked, next action
  DECISIONS.md                    # Approved choices and scope
  ENVIRONMENT.md                  # Hosts, clients, paths, capabilities
  TOOLCHAIN.md                    # Setup, versions, access, rollback
  SERVICES.md                     # Product-provider readiness
  SOURCES.md                      # Dated primary-source verification
  ASSET_MANIFEST.json
  SCREEN_MANIFEST.json
  TASKS.md                        # Bounded work packages and owners
  references/                    # Approved references and provenance
  brand/                         # Logo, mark, icon, mascot source
  motion/                        # Source, runtime exports, previews
  screens/                       # Screen index and review exports
  system/                        # Tokens, component map, copy rules
  flows/                         # Journeys, permissions, state matrix
  fixtures/                      # Explicitly simulated scenarios
  prototype/                     # Isolated design/animation preview
  agents/                        # Role briefs and handoffs
  tools/                         # Scoped checks, export validation
  evidence/                      # Test results, screenshots, reviews
  handoff/                       # Implementation-ready package
```

Keep large duplicate exports and ephemeral test recordings out of routine source commits. Preserve original design files and originals of generated assets; optimized exports are separate. Decide asset storage only after inspecting what is already used. Never create a public bucket by default.

Every checkpoint updates status, changed files, tool results, approval requirements, exact next step, and any limitations. A fresh agent should be able to resume from `README.md` and `STATUS.md` without this chat.

## 4. Phase A — Audit before installing

### A1. Repository and existing assets

Locate the actual checkout and record repository identity, commit, dirty state, and worktree. Read current instructions, package manifests, `.env.example` key names, design plans, and relevant skills. Inspect existing theme tokens, components, frog assets, motion utilities, screenshots, tests, prototype tools, and `.design-sync` or equivalent design connections if present.

Produce a keep/rework/replace/missing inventory. Starting the design fresh does not mean deleting working wallet, browser, authorization, or task code. Identify older design restrictions that conflict with this brief and record a scoped design decision rather than silently rewriting history.

### A2. Hosts and agent capabilities

Determine where the agent is actually executing: local Mac, Windows, Linux server, SSH, or container. Do not infer the shell host from the user's laptop. Check relevant installed tool versions, current MCP registrations, available image generation, browser automation, Git/worktree support, and preview capabilities.

Inspect the user's existing tmux setup if accessible: named sessions/windows, relevant working directories, sockets, and existing agent workflow. Use metadata first; do not indiscriminately capture private pane content or shell history. If running remotely, distinguish server access from desktop-editor access.

Report a small matrix:

| Capability | Host/client | Present | Authenticated | Tested | Human action |
| --- | --- | --- | --- | --- | --- |
| Rive editing | Unknown until checked | ... | ... | ... | ... |
| Native design editing | ... | ... | ... | ... | ... |
| Image creation/editing | ... | ... | ... | ... | ... |
| Browser review | ... | ... | ... | ... | ... |
| Preview/export checks | ... | ... | ... | ... | ... |

Installed, configured, authenticated, and tested are different states. A working connector in another application does not automatically exist in this agent or every worker.

### A3. Setup proposal

Propose the smallest complete toolchain, needed changes, expected recurring/usage costs, reversible configuration paths, and which machine owns each tool. Ask for missing account choices or budget approval only after the audit. New spending has a default allowance of zero until approved.

**Gate A:** agree on the setup scope, required accounts, and generation budget. Safe inventory and document creation need not wait for this gate.

## 5. Phase B — Configure and prove the design toolchain

Use current primary documentation and the tools actually exposed by the installed client. Record URLs, verification date, installed version, transport, auth flow, limitations, cost basis, and rollback. Do not paste a universal MCP configuration into every client; schemas and scopes differ.

### B1. Rive MCP — primary branded-animation tool

Verify the current official integration before configuring it. At preparation time, Rive documents desktop-editor MCP on macOS/Windows, animation/scene/state-machine editing, and a loopback HTTP endpoint at `http://127.0.0.1:9791/mcp`. The guide mixes latest-desktop and Early Access wording, so check the actual installed channel and endpoint instead of assuming either. [S1]

For Claude Code, the documented example is:

```sh
claude mcp add --transport http rive http://127.0.0.1:9791/mcp
```

Confirm current client syntax, inspect existing entries, choose the appropriate configuration scope, and preserve other servers. For Codex or another client, consult that client's current documentation and `--help`; use its real HTTP MCP configuration. [S10]

Preferred arrangement: one agent on the desktop host runs the Rive authoring session. Linux/tmux workers can perform research, file preparation, tests, and export validation. Do not assume the Rive editor runs headlessly on Linux. If a remote worker needs access, propose an explicitly authorized encrypted tunnel with loopback binding; do not expose an unauthenticated editor port publicly. Remember that localhost refers to the worker's own host.

**Smoke test in a new disposable file:** discover the available tools; inspect an artboard; create or edit a simple shape; animate one property; add an application-controlled behavior; render a visible preview; save and reopen. Use returned tool schemas rather than guessed operation names. Record whether each step was agent-operated or manual.

Then test the export path separately. Rive distinguishes runtime `.riv` files from editable `.rev` backups; current docs place both exports behind paid plans. Preserve the source project and backup separately from the runtime file. Do not purchase a plan without approval or assume MCP can perform the export just because it edits a timeline. [S2][S3]

Load the exported asset in the isolated browser preview and trigger the behavior. Passing the MCP handshake alone is not a passing pipeline. If export is blocked, save the project and label the pipeline “editing verified; export blocked,” with a precise remedy.

### B2. Design editor — Figma first, unless a working equivalent already exists

Use an existing workspace where possible. Test native editable frames, reusable components, variables, layout constraints, and inspection/export—not just screenshot generation.

Current Figma docs describe remote MCP write-to-canvas through `use_figma`, a Full-seat requirement plus edit permission, and limitations including image assets and custom fonts. Recheck these before promising fully automated image placement or typography. Test reading and writing separately. [S4]

Create a dedicated test page with a token-bound button and task card, read them back, and produce a review image. Record any manual image import, font setup, or component publishing step. Install only verified, relevant skills after reviewing their scope.

If the current connection is read-only or no design seat is approved, state that clearly. Propose an isolated code-first design board or an existing editable tool instead. Obtain agreement on the source of truth; do not create a separate elaborate design stack merely to avoid a brief human setup step.

### B3. Image generation — one verified route

Discover the agent's native image-generation/editing tools first. Otherwise identify an approved provider with a documented API or supported connector. Do not assume a chat subscription grants API access, exports, or the same tools in another client. An official image API is a candidate, not an automatically configured capability. [S11]

Under the approved budget, prove generation, reference-image editing, transparent-background output where supported, saving full-resolution originals, and reopening the saved files. Record actual format and alpha support. Never fake transparent output with a checkerboard baked into the picture.

Use image generation for concepts, mascot references, poses, and illustrations. Produce editable vector geometry separately for small logos and rigging. A PNG embedded inside an SVG is not a vectorized character. If native generation is unavailable, prepare exact prompts and guide me through generating/uploading the assets; do not claim that a prompt file is a finished asset.

### B4. UI motion and browser review

Use the existing Motion/CSS foundation for ordinary UI interactions. Rive is for branded animated artwork, not a substitute for semantic buttons or readable text.

Motion's current AI Kit provides free documentation access with optional paid features. Its installer can rewrite configuration; inspect and back up scoped configuration first, respect repository package-manager rules, and verify the current supported installation method. Motion+ is optional, not required to animate a button. [S5]

Use the already working browser automation route or Playwright CLI/MCP. Create isolated review profiles, not access to my everyday authenticated browsing session. Parallel workers need separate contexts/profiles. Microsoft's current docs support browser automation and warn about shared-profile contention. [S6]

Prove: start preview, open it, click a control, resize, emulate reduced motion, capture an image, inspect console errors, and stop only processes owned by this workflow.

### B5. tmux and resumability

Reuse the current multiplexer/harness where it helps. tmux provides terminal sessions and detach/reattach; it is not the task ledger, a durable scheduler, or proof that an agent completed a job. [S7]

Use named sessions/windows for coordinator, asset work, and preview/QA only when needed. Launch distinct workers, assign distinct worktrees and output paths, and record ownership. No broad synchronized input into multiple agent panes. Preserve existing sessions. A desktop editor connection must be tested by the worker that actually uses it.

### B6. Optional tools are fallbacks, not mandatory dependencies

Do not install Rive, SVGator, Lottie Creator, Jitter, Blender, Spline, and multiple design editors “just in case.” Start with one tool per necessary capability.

SVGator MCP or Lottie Creator MCP can be considered for a specific blocked export or authoring need. Recheck current export/licensing requirements; Lottie Creator's documented bridge requires an open editor browser tab. [S8][S9] 3D, audio, and elaborate marketing video are optional later work.

**Gate B:** show one generated asset, one editable design component, one animated asset that loads in the preview (or an explicit export blocker), and a working browser-review loop. Agree on any remaining manual steps before scaling production.

## 6. Phase C — Define the visual system and approve a small sample

Do not generate twenty new art directions. We already have a direction. Create at most two closely related refinements if a choice is needed.

Produce a small review board with the proposed original frog, app icon at actual sizes, wordmark, palette, typography, one task card, one button, and a quiet Home composition. Start shared tokens/components here, before producing every screen.

Use a single canonical mascot reference and consistent geometry. Prepare separately editable eyes, pupils, mouth, face/body, limbs, and optional accessories where the chosen design needs them. Keep a compact mark distinct from a full-body illustration. Sunglasses can be an occasional expression, not an obstruction in every small status icon.

Define semantic color roles, readable text hierarchy, spacing, radius, elevation, focus treatment, icon stroke/size rules, and initial motion timings. Establish safe use of humor: personality in greetings and illustrations, precise wording in permissions, prices, risks, and outcomes.

Record design-to-code mappings in the existing component system. Avoid premature dependencies or production changes. Reuse a coherent licensed UI icon family for ordinary controls; custom-draw only Froggy-specific marks. Record fonts and licensing; do not redistribute proprietary fonts or third-party brand assets without rights.

**Gate C:** I approve the mascot direction, compact mark/icon, tokens, and one Home sample. Do not expand the entire asset library before this review.

## 7. Phase D — Produce the asset and motion pack

### D1. Required deliverables

| Family | Deliverables | Evidence of completion |
| --- | --- | --- |
| Brand | Original wordmark, compact frog, monochrome/reversed variants, app-icon master, favicon/social avatar exports | Editable source plus legible small-size previews |
| Mascot | Canonical reference and roughly six useful poses: idle, research, browse, needs-user, completion, resting | Consistent identity; transparent originals and editable animation source |
| Illustrations | Small shopping, travel, token research, services, and background-watch vignettes | Consistent family; usable crops; no text baked into reusable artwork |
| Icons | Mapped standard UI set plus a few custom brand/status marks | SVG sources, sizes, licenses, accessible usage notes |
| Motion | Logo wake/reveal, working loop, research/browse variants as useful, needs-user, completion, stopped/error | Source project/backup, runtime export, preview, documented controls |
| UI feedback | Button pending/success, task result reveal, approval entrance, browser handoff | Live isolated examples and reduced-motion behavior |
| Copy | Onboarding, status, notification, permission, error, and empty-state patterns | Editable copy deck with clear semantics |

Check current platform requirements before producing final native app-icon export sets. Desktop/mobile web comes first; possible native reuse does not authorize rebuilding the app in Expo now.

### D2. Motion contract

Expose a small semantic contract such as `idle`, `working`, `needs-user`, `success`, and `stopped/error`, plus appropriate theme, size, and reduced-motion controls. These are proposed application states, not assumed Rive tool names. Choose actual data binding/state-machine fields after inspecting current runtime support.

Specify artboard, state-machine/view-model names, triggers/properties, allowed transitions, loop behavior, interruptions, and reset behavior. Explain how the app maps task states to these controls. Test rapid transitions, re-entry, stopping, loading failure, and the static fallback.

Never trigger payment success from a timer, animation end, request submission, or an optimistic click. Success follows the confirmed domain event. Numeric balances, quotes, and identifiers remain immediately readable. Unknown progress gets an indeterminate indicator and an honest stage label, not an invented percentage.

Every continuous loop needs offscreen/inactive behavior and reduced-motion handling. Keep the majority of the interface still. Show Stop and approval actions immediately; never delay them for an entrance or exit animation. Keep essential labels and interaction in accessible UI outside the decorative canvas.

Test compact states at 24/32 pixels and larger placements at 64/128 pixels, on relevant backgrounds. Inspect legibility, clipping, file size, runtime errors, and measured rendering behavior. Set budgets after a real baseline; do not claim a frame rate from visual impression alone.

## 8. Phase E — Screen families, onboarding, and realistic states

Create these as related screen families, not additional primary destinations. Use desktop and mobile variants where applicable, named state IDs, shared components, and real editable text. Default review widths: 1440, 768, and 390 pixels, with a narrow 320-pixel stress check.

| Family | Required views and decisions |
| --- | --- |
| Onboarding | Welcome; use Froggy or connect my assistant; first task; contextual account/funding request; optional Telegram setup |
| Home / For You | First use; active tasks; needs-user; result ready; quiet day; paused/stale watch |
| Explore | Token discovery; wallet/friend following; service discovery; search/no results |
| Token detail | Evidence and uncertainty; selected chain/contract; proposed action and review; no fictional safety guarantee |
| Wallet | Holdings and positions; available vs reserved funds; permissions; payment methods; pending/unknown state |
| Task workspace | Shopping comparison, travel itinerary, token research, and service result using one shell |
| Browser mode | Closed/available, watching live, taking control, login/checkout handoff, disconnect/retry |
| Approval and receipt | Exact action/payee/amount/method; quote change; reject/expiry; pending/uncertain; confirmed receipt |
| Background task setup | Purpose, cadence, expiry, source, notification rules, research vs execute, limits, pause/stop |
| Connections | External-assistant consent/scopes, Telegram linking, access expiry, revoke/disconnect |

Minimize mandatory onboarding. Do not force every user to connect a wallet, add funds, link Telegram, and configure an external assistant before trying a task. Ask for access when the chosen task needs it. Funding should not be disguised as a required welcome step for free exploration.

For external assistants, distinguish **delegate a task** from **use a service directly**. In the task detail, show the originating assistant and the granted allowance. “Use Froggy from your assistant” is clearer than implying Froggy unlocks a ChatGPT subscription. Check each client's actual read/write/tool support before promising interoperability.

### E1. State and trust requirements

Make a state matrix covering empty, loading, partial result, no result, provider unavailable, auth expired, blocked, needs-user, rejected, cancelled, failed, and completed.

Separate task completion from purchase settlement. A pending or uncertain payment is not a failed payment; do not offer a blind second debit or switch payment rails until the outcome is reconciled. Distinguish product price, provider/service fees, delivery/tax, and agent/research spend. Reauthorization is needed when material purchase details change.

The agent's permissions must be narrower than or equal to the user's authorization, including when another agent delegates work. No agent tool raises its own cap or grants itself approval. Model an explicit human handoff for card checkout, login, or verification where necessary. Redact sensitive entry from recordings and model-visible content as required; do not ask the model to handle raw card numbers or one-time codes in chat.

No “risk-free,” “safe bag,” guaranteed-yield, or “audited = safe” claims. Yield examples need source/time, variability, fees, access/withdrawal conditions, and relevant uncertainty. Public onchain observations do not make all connected identities or private tasks public. Social sharing is opt-in; never publish shopping, travel, or browser activity through a friends feed by default.

### E2. Fixture scenarios

Create clearly labeled simulated data for:

1. Shoes: compare options, user selects, merchant/size changes, checkout handoff, simulated receipt.
2. Travel: build itinerary, monitor one price, surface a finding, pause the watch.
3. Token: surface watched-wallet activity, research evidence/risks, review a hypothetical trade, demonstrate uncertain settlement without re-debit.
4. Paid service: request through external MCP client, approve a limited purchase, receive result and receipt.
5. Telegram: notify about the same task, reopen it, expire a stale approval, and prevent duplicate decisions.

Use example domains and invented products/tokens or clearly fictionalized samples. Do not turn reference-image prices, APYs, or product claims into factual recommendations. Default display examples to EUR with explicit crypto asset/network units where relevant; store/show clear timestamps and timezone.

**Gate E:** review Home, a shopping task, token research, one approval, and a mobile handoff together. Confirm the interface is still calm and usable before polishing every secondary state.

## 9. Phase F — Product services readiness, separately from design tools

Create `SERVICES.md` from actual repository evidence and current provider docs. Do not ask me to register for every conceivable service. Identify what is needed for the prototype, the first production journey, and later expansion.

Inventory these capability groups: identity/wallet/permissions; token and wallet data; trade execution; staking/yield data and execution; search/research; hosted browser and human takeover; merchant checkout/crypto payments; card-provider or human checkout; paid-service/x402 catalog; notifications/Telegram; inbound MCP; durable task/watch execution; data/assets storage; observability.

For each group record current adapter/config location, provider, key names only, supported operations, evidence level, sandbox route, costs/limits, regional/account restrictions where relevant, human dependency, fallback, and the UI states it requires.

Use statuses such as `unknown`, `documented`, `configured`, `stubbed`, `sandbox-verified`, and `live-verified`, with evidence. “Documented” is not “live-verified.” Earlier repository descriptions mention Privy, Browser Use, The Graph, Hedera/x402, Telegram, and an inbound MCP surface; re-audit rather than treating that list as proof. [S12]

All production transactions and live notification tests remain gated. Model unsupported card checkout as a human handoff. A supported MCP tool does not imply universal merchant purchasing. Prepare an implementation backlog for gaps; do not build every integration during design production.

## 10. Phase G — Controlled parallel agents

Start with one coordinator until the toolchain and visual sample are approved. Then run bounded specialists if the host/client supports them:

| Role | Owns |
| --- | --- |
| Environment/integration scout | Tool verification, setup notes, service readiness; read-only product inspection |
| Brand/asset artist | Canonical mascot, brand exports, illustration consistency |
| UX/design-system designer | Screen families, components, tokens, onboarding, copy |
| Motion specialist | Rive source and motion examples based on approved assets |
| QA/asset librarian | Independent review, export/manifest checks, evidence, handoff |

These can be successive roles in one capable agent when parallel execution is unavailable. Do not claim multiple workers exist unless actually launched.

Each work package must name inputs/reference revisions, acceptance criteria, allowed files, required tools, budget, output location, dependency, and review gate. Workers return artifacts and evidence—not just summaries.

Use separate worktrees and narrowly owned outputs. A single coordinator owns shared manifests and final integration. One writer operates each Rive file or mutable editor session at a time; separate terminal panes do not prevent editor conflicts. Serialize edits or use separate source files with explicit merge/review. Do not launch a new orchestration platform for this assignment.

Dependency order: environment proof → approved brand/tokens/Home sample → screen and motion production → prototype integration → independent QA → implementation handoff.

## 11. Phase H — Quality gate and final handoff

Create a simple local gallery for assets, icons, screen states, and animation controls. Reuse an existing preview if possible. The isolated prototype can contain interactive fixture-driven components; it must not acquire production endpoints or secrets. No production backend rebuild is needed to evaluate design.

Verify exports open, intended transparency exists, SVGs are actual editable geometry where promised, sources are retained, and runtime assets load. Test responsive layout, keyboard/focus, text enlargement, reduced motion, readable status without color, and actionable controls during transitions. Capture normal playback as well as still frames; a screenshot cannot prove animation timing.

For preview code, run relevant type/lint/tests according to repository instructions and inspect browser errors. Distinguish preview validation from production-app tests; do not claim a full release gate from a static design review.

Every approved asset needs a manifest record with stable ID, revision, role, source project/path, export paths, dimensions/format, checksum, generation/edit provenance, model/tool version when known, license/rights notes, review status, and runtime contract if relevant. Status can be `draft`, `needs-review`, `approved`, or `superseded`; missing fields must not be replaced with fabricated metadata.

Every screen needs an ID, flow/state, viewport, source file/node, component references, fixture, asset dependencies, review image, and approval status.

Final handoff includes the selected direction, assets and editable sources, motion controls, tokens/component mappings, approved screens and flows, source-linked services readiness, remaining blockers, setup/resume instructions, validation evidence, and an ordered implementation backlog. Include a first vertical slice: **Home → task → structured result → approval/handoff → receipt**, with explicit production capability gaps.

Do not call the complete pack ready when a core export or critical state is blocked. Deliver the usable portion with named blockers. Do not start implementing the production backlog without a new authorization.

## 12. First-session instructions — start here, not with the whole production run

1. Read this specification and current repository instructions. Locate the reference pack when supplied.
2. Inspect the checkout, scoped host/agent capabilities, existing MCP registrations, and relevant tmux setup without exposing secrets.
3. Create the initial README, STATUS, ENVIRONMENT, TOOLCHAIN, and DECISIONS records in the selected workspace. Populate findings, not empty templates for everything.
4. Present the smallest setup plan and any needed account/budget approval. Recommend one clear working arrangement.
5. Begin the first achievable tool proof. Prefer a local Rive MCP edit/preview/export test when available; otherwise explain the exact desktop step needed and continue independent setup.
6. End at a real human-action checkpoint with precise instructions, or continue the approved steps if nothing requires me. Never merely return another large plan and stop.

Completion of the first session means: we know what exists, what is missing, where each tool runs, what is authorized, and what the next concrete setup step is.

## 13. Primary-source starting points

These were checked while preparing this brief. Recheck live documentation and installed behavior before execution; examples are not a version lock. Add new verification evidence to `SOURCES.md`. Repository files are discovery starting points, not a promise about future checkouts.

- **[S1] Rive MCP:** `https://rive.app/docs/editor/ai/mcp`
- **[S2] Rive runtime export:** `https://rive.app/docs/editor/exporting/exporting-for-runtime`
- **[S3] Rive editable backup:** `https://rive.app/docs/editor/exporting/exporting-for-backup`
- **[S4] Figma MCP and write-to-canvas:** `https://developers.figma.com/docs/figma-mcp-server/` and `https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/`
- **[S5] Motion AI Kit and installation:** `https://motion.dev/docs/ai-kit` and `https://motion.dev/docs/ai-kit-install`
- **[S6] Microsoft Playwright MCP:** `https://github.com/microsoft/playwright-mcp`
- **[S7] tmux:** `https://github.com/tmux/tmux/wiki`
- **[S8] SVGator MCP:** `https://www.svgator.com/mcp-for-ai-animations`
- **[S9] Lottie Creator MCP:** `https://docs.lottiefiles.com/en/creator/13_ai-tools/lottie-creator-mcp`
- **[S10] Codex MCP configuration:** `https://developers.openai.com/codex/mcp/` (follow its current official redirect).
- **[S11] OpenAI image API guide, if this provider is selected:** `https://platform.openai.com/docs/guides/image-generation`
- **[S12] Froggy repository:** `https://github.com/grmkris/Froggy-ETHOnline2026`; inspect `AGENTS.md`, `README.md`, applicable nested instructions, manifests, existing design plans, and relevant skills.

**Operating principle: make the workspace real, prove the tools on a small example, approve the visual system, then scale production. Keep me involved in decisions—not in work you can perform and verify yourself.**
