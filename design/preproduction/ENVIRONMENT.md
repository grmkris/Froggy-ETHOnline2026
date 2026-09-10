# Environment — audited 10 September 2026

Everything below was observed on this host in this session. Where a row says _not tested_, it was not tested; nothing here is inferred from another machine or another application.

## Where the agent is actually executing

| Fact | Value |
| --- | --- |
| Host | `netcup` — Ubuntu 24.04.4 LTS, kernel 6.8.0-138, KVM guest |
| Reached over | SSH (`SSH_CONNECTION` present) |
| Hardware | 16 × AMD EPYC 9645, 62 GB RAM |
| Graphical session | **None.** `DISPLAY` unset, `WAYLAND_DISPLAY` unset |
| Desktop browser installed | **None.** No `google-chrome`, `chromium`, `chromium-browser` |
| Checkout | `/home/kristjan/code/ethglobal-online-2026`, `main` @ `701f71a` |
| Remote | `github.com/grmkris/Froggy-ETHOnline2026` |

This is a headless Linux build box, not a desktop. That single fact decides the Rive question below, so it is stated first.

### Worktrees already present — do not disturb

Nine worktrees are registered. Two are live agent worktrees under `.claude/worktrees/`, two under `.froggy/`, five under `/tmp/`. This workspace was created on `main` instead of adding a tenth.

### Uncommitted work in the shared tree (not mine)

At session start, four files were modified and two untracked, by another session:

```
 M apps/server/src/grants.test.ts
 M apps/server/src/grants.ts
 M apps/web/src/routes/workspace-layout.tsx
 M packages/wallet/src/agent-signer.ts
?? apps/web/src/hooks/use-wallet-arrival.ts
?? Froggy_Preproduction_Pack.zip
```

Left untouched. Nothing in this session stages, stashes, reverts or reformats them. All commits from this workspace use explicit pathspecs under `design/preproduction/`.

**Resolved during this session:** that other session committed its own work while the audit ran — `152dfe8` "Show a new person their wallet at once" and `c67dfb5` "Record that a person's own key changed their own policy, on production". `HEAD` therefore moved from `701f71a` to `c67dfb5`. The audit below was taken at `701f71a`; nothing in it depends on those two commits, and none of their files were touched here.

## Toolchain present on this host

| Tool | Version | Note |
| --- | --- | --- |
| Bun | 1.4.2 | repository package manager, per `AGENTS.md` |
| Node | v22.23.2 |  |
| Playwright | 1.62.1 | browsers cached: `chromium-1243`, headless shell, ffmpeg |
| Chromium (Playwright) | **151.0.7922.34** | supports `oklch()` — verified in-session |
| Git | 2.43.0 | worktrees supported and in use |
| tmux | present | 3 sessions, see below |
| Docker | 29.7.2 | rootless BuildKit available |
| ffmpeg | n9.0.1 | can capture playback, not just still frames |
| `heavy` | present | serialises one expensive job at a time; **never pipe it** |
| ImageMagick / Inkscape | **absent** | no raster or vector CLI on this host |

## tmux — existing workflow (metadata only, no pane capture)

| Session                 | Window     | Directory                      |
| ----------------------- | ---------- | ------------------------------ |
| `ethglobal-online-2026` | `0:claude` | `~/code/ethglobal-online-2026` |
| `invok`                 | `0:claude` | `~/code/invok`                 |
| `trading-desk`          | `0:claude` | `~/code/trading-desk`          |

One session per project, one `claude` window each, all attached. Sockets `heavyprobe` and `heavyprobe2` also exist under `/tmp/tmux-1000/`. **The convention is 1 session : 1 project, so preproduction work belongs in the existing `ethglobal-online-2026` session**, adding named windows only if parallel specialists are actually launched in Phase G. No existing session was created, renamed or killed.

## MCP registrations visible to this agent

Checked with `claude mcp list`. All are user-scope; the repository has no `.mcp.json` and no project-scoped servers.

| Server | Transport | Health |
| --- | --- | --- |
| `invok` | HTTP `localhost:49000` | connected — includes browser + tmux/fleet tools |
| `railway` | stdio | connected |
| `vercel` | HTTP | connected |
| `Neon` | HTTP | connected |
| `plugin:posthog:posthog` | HTTP | connected |
| `claude.ai Gmail` / `Google Drive` / `Google Calendar` | HTTP | connected |
| `claude.ai styld` | HTTP | connected |
| `cloudflare` | HTTP | **failed** — `Insufficient scope: required "user:read account:read"` |
| **`rive`** | — | **not registered** |
| **Figma** | — | **not registered** |

`DesignSync` is exposed to this agent as a first-party tool, not as an MCP server. It returned: _"DesignSync needs design-system authorization. Run `/design-login`."_

## Capability matrix

Installed, configured, authenticated and tested are four different states.

| Capability | Host / client | Present | Authenticated | Tested | Human action needed |
| --- | --- | --- | --- | --- | --- |
| **Browser review** | netcup, Playwright 1.62.1 + Chromium 151 | yes | n/a | **yes — passed** | none |
| **Preview / export checks** | netcup, Bun + Vite + `.design-sync` | yes | n/a | partly (probe only) | none |
| **Editable design workflow** | claude.ai Design System, via `DesignSync` | yes | **no** | no | run `/design-login` |
| **Rive editing** | **no eligible host** — needs macOS/Windows desktop | **no** | no | no | decide: does a Mac/Windows machine exist? |
| **Rive runtime export** | same | no | no | no | paid plan, gated behind approval |
| **Image generation** | **no route found** | **no** | no | no | choose a provider + approve a budget |
| **Vector authoring** | netcup, hand-authored SVG in-repo | yes | n/a | no | none (no Inkscape; SVG by hand is fine) |
| **Motion (UI)** | repo already ships `motion@13.2.0` | yes | n/a | in production use | none |
| **Video / playback capture** | netcup, Playwright video + ffmpeg | yes | n/a | no | none |

### Why Rive cannot run here

Rive's own MCP documentation, read today, states: _"MCP integration is currently available only in the desktop Editor for Windows and macOS"_ and _"For the Rive server to be available, you must have the Rive Early Access app opened."_ The endpoint is a loopback address, `http://127.0.0.1:9791/mcp` — **loopback on the host that runs the editor**.

Probed on this host: no listener on port 9791 (`curl` exit 7, nothing in `ss -ltnp`). That is the expected result, not a fault. This box has no graphical session and cannot run the editor, so `claude mcp add --transport http rive http://127.0.0.1:9791/mcp` executed here would register a server that can never connect.

Consequence: **the Rive authoring seat must be an agent running on a macOS or Windows desktop.** This Linux worker can still do everything around it — research, `.riv` runtime loading, export validation, preview harness, file preparation, size and error budgets.

### Why image generation is blocked

This agent exposes no native image-generation tool (checked the tool surface directly). No image-capable provider key exists in the repository's key list: the only model keys named in `.env.example` are `ANTHROPIC_API_KEY` and the `OPENAI_COMPATIBLE_*` trio, and the latter points at an Alibaba MaaS **text** chat endpoint with a Qwen model. No OpenAI, Gemini, Replicate, fal or Stability key is defined anywhere in the key list.

So mascot and illustration concepts cannot be generated on this host today. `TOOLCHAIN.md` carries the recommendation; it needs one decision and a budget, and no credits were spent.

## Evidence for the one capability that passed

`evidence/phase-a/browser-probe.html` rendered through Playwright at three contexts. Screenshots: `probe-1440.png`, `probe-390.png`, `probe-reduced.png`.

| Context | `oklch()` support | Click handled | `.dot` animation-name |
| --- | --- | --- | --- |
| 1440×900 desktop | true | yes | `p` (running) |
| 390 iPhone 13, mobile | true | yes | `p` (running) |
| 1440×900, `reducedMotion: reduce` | true | yes | **`none`** |

Console errors across all three: none. Chromium reported `151.0.7922.34`.

This proves the loop the brief asks for — start a preview, open it, interact, resize, emulate reduced motion, capture an image, read console errors — and it proves the browser is new enough for this design system's `oklch()` tokens. `.design-sync/NOTES.md` records that an old Chromium 108 silently renders every component transparent; 151 clears that trap.
