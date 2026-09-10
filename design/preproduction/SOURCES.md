# Sources — primary-source verification

Every row was fetched or executed on the date shown. "Documented" is not "live-verified": the last column says which. Re-verify before relying on a row that is more than a few days old — the brief's own source list was a starting point, not a version lock.

## Vendor documentation read 10 September 2026

| Ref | Source | What it established | Level |
| --- | --- | --- | --- |
| S1 | `rive.app/docs/editor/ai/mcp` | _"MCP integration is currently available only in the desktop Editor for Windows and macOS."_ _"For the Rive server to be available, you must have the Rive Early Access app opened."_ Endpoint `http://127.0.0.1:9791/mcp`. Early Access, not GA. Six capability groups: file management, scene inspection/editing, design creation, animation and interaction incl. state machines, data binding, Luau/WGSL script editing. Plan requirements not stated on this page. | documented |
| S2 | `rive.app/docs/editor/exporting/exporting-for-runtime` | _"Exporting for runtime is available on paid plans."_ | documented |
| S3 | `rive.app/pricing` | Free $0/seat/mo, 3 collaborative files, **no** `.riv`, **no** `.rev`. Cadet $9/seat/mo, max 3 seats, `.riv` yes, `.rev` **no**. Voyager $32/seat/mo, max 25 seats, `.riv` and `.rev` yes, plus libraries and hosted embed links. Enterprise $120/seat/mo. | documented |
| S4 | `developers.figma.com/docs/figma-mcp-server/write-to-canvas/` | _"You need a Full seat to write to Figma files with agents."_ Dev seats are read-only, and edit permission on the file is also required. `use_figma` executes JavaScript through the Plugin API. Limitations: _"No assets (image) support yet — including no importing components that have images/videos, or creating GIFs"_, _"Custom fonts aren't supported yet"_, 20 KB response cap per call, beta-level quality. | documented |
| S4b | `developers.figma.com/docs/figma-mcp-server/` | Overview page carries no seat, plan, URL or limitation detail — those live on the write-to-canvas page above. Recorded so nobody re-reads it expecting requirements. | documented |

Not yet read, because no decision currently depends on them: Motion AI Kit install [S5], Playwright MCP [S6], SVGator [S8], Lottie Creator [S9], Codex MCP config [S10], OpenAI image guide [S11]. D-04, D-05 and D-06 all resolve to "use what is already installed", so fetching these would be research without a consumer. Read them if a pending decision changes.

## Executed on this host 10 September 2026

| Check | Command / method | Result | Level |
| --- | --- | --- | --- |
| Rive MCP reachable here? | `curl http://127.0.0.1:9791/mcp`, `ss -ltnp \| grep 9791` | No listener, curl exit 7, nothing bound. Expected — no graphical session on this host. | **live-verified (negative)** |
| Graphical session | `DISPLAY`, `WAYLAND_DISPLAY` | Both unset. No desktop browser installed. | **live-verified** |
| MCP registrations | `claude mcp list` | 10 servers; `rive` and Figma absent; `cloudflare` failing on scope. Full table in `ENVIRONMENT.md`. | **live-verified** |
| DesignSync authorization | `DesignSync method=list_projects` | _"DesignSync needs design-system authorization. Run `/design-login`."_ | **live-verified (negative)** |
| Image generation route | Direct inspection of this agent's tool surface; `.env.example` key list | No native image tool. No image-capable provider key: only `ANTHROPIC_API_KEY` and the `OPENAI_COMPATIBLE_*` trio, the latter an Alibaba MaaS text endpoint with a Qwen model. | **live-verified (negative)** |
| Browser review loop | `design/preproduction/tools/review-shot.mjs` | Chromium **151.0.7922.34**. `oklch()` supported at every viewport. Click handled. Reduced motion read back from the document, not the flag: `running=1` normally, `running=0` under `reducedMotion: reduce`. Zero console errors. Evidence: `evidence/phase-a/harness/`. | **live-verified (positive)** |
| Existing design board | Same harness against `docs/design/SCREENS_BOARD_FABLE51.html` | Renders clean at 1440/768/390 with no console errors, `oklch` fine. **Scrolls horizontally at 320 px.** Evidence: `evidence/phase-a/existing-board/review.json`. | **live-verified** |
| Reference provenance | `sha256sum -c` against `REFERENCE_MANIFEST.json`; `unzip -t` | All three images match their recorded checksums; archive intact. Dimensions: 01 is 1536×1024, 02 and 03 are 1448×1086. | **live-verified** |
| Repository identity | `git rev-parse`, `git worktree list`, `git status` | `main` @ `701f71a`, remote `grmkris/Froggy-ETHOnline2026`, nine worktrees, four modified and two untracked files belonging to another session. | **live-verified** |
| Toolchain versions | `--version` on each | Bun 1.4.2, Node 22.23.2, Playwright 1.62.1, Git 2.43.0, Docker 29.7.2, ffmpeg n9.0.1. ImageMagick and Inkscape absent. | **live-verified** |

## Repository evidence

Read directly from the checkout at `701f71a`. Cited in `INVENTORY.md` rather than repeated here: `AGENTS.md`, `.agents/skills/` (`froggy-leash`, `froggy-browser`, `froggy-verification`), `packages/ui/src/styles/globals.css` (252 custom properties, 37 `@utility` rules), `packages/ui/src/components/` (34 files, 113 exports), `packages/ui/src/components/frog-mark.tsx`, `apps/web/src/lib/nav.ts`, `apps/web/src/lib/motion.ts`, `.design-sync/config.json` and `NOTES.md`, `docs/design/`, `plans/`, `tools/graph.ts`, `knip.json`, `.env.example` (68 key names, values never read).

The brief notes that earlier repository descriptions mention Privy, Browser Use, The Graph, Hedera/x402, Telegram and an inbound MCP surface, and says to re-audit rather than treat that list as proof. Those adapters do exist in the checkout as packages and key names. Whether each is stubbed, sandbox-verified or live-verified is Phase F's job and is **not** claimed here — `SERVICES.md` will carry it with evidence per capability group.
