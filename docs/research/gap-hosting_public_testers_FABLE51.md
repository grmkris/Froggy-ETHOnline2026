Why: Every dimension assumed a hosted product (live demo URL as 'cheapest lasting visibility asset', testers via Telegram in 9 days, Hedera rubric weighting real-user Validation 15%), but feasibility only tested Bun.WebView on the author's Mac. If the chrome backend does not run in Docker on Linux, both goal A (clickable demo) and goal B (public testers) collapse to a screen recording, and the team should know on day 0, not day 6.

# GAP hosting_public_testers

## Summary

Bottom line: Bun.WebView's Chrome backend DOES run on Linux inside Docker, and I verified it empirically today (2026-09-04) rather than only from docs: image `oven/bun:1.4.1` (Debian trixie) + apt `chromium` (152, arm64) on Docker Desktop 28.5.2. As root it only spawns when you pass `argv: ["--no-sandbox", "--disable-dev-shm-usage"]` yourself (Chrome's exact refusal: "Running as root without --no-sandbox is not supported. See https://crbug.com/638180"); the PR that would add those defaults (oven-sh/bun #39490) is still open. Non-root `USER bun` with the sandbox on also works if the container gets `--cap-add=SYS_ADMIN` (default seccomp alone fails). With that, `Page.startScreencast` delivered 31 frames / 31 acks in 2.7 s for 30 repaints, `Input.dispatchMouseEvent`/`insertText`/`dispatchKeyEvent` reached the page, `view.screenshot()` worked, and `Bun.WebView.closeAll()` left 0 Chrome processes (run with `--init`). So goal A (clickable demo) and goal B (public testers) do not collapse to a screen recording.

Three constraints change the architecture, all VERIFIED:
1. One Bun process = one Chrome = one profile. The docs say the Chrome `dataStore` directory "applies to the entire Chrome process; first view's directory wins for all subsequent views". In the container, view B created with `dataStore: {directory: "/data/profile-b"}` saw view A's localStorage and cookie, and `/data/profile-b` was never created. Connect mode does not escape it either: two views pointed at two externally spawned Chromes (`backend: {url: ws://...:9222 | :9223}`, distinct `--user-data-dir`) both reported `Profile Path /data/u1/Default` on chrome://version and Chrome #2 received no targets. "One profile per user" therefore means one Bun process per user (a `Bun.spawn`-ed worker per session in the same container), one container per user (Fly Machines), or switching the browser layer to puppeteer-core/playwright-core (one Chrome, `createBrowserContext` per user) — not `dataStore` alone.
2. `view.cdp()` is strictly one-in-flight: a second concurrent call throws synchronously `ERR_INVALID_STATE: a cdp() is already pending`. Screencast acks, human input, and agent CDP must go through one serial queue per view (a 6-line promise chain fixed it in my probe). Bun-level `view.click(x,y)` exists but is a separate "simple" slot.
3. Persistence needs two hygiene steps. `closeAll()` SIGKILLs Chrome, and after a SIGKILL the restarted profile had lost its cookie and localStorage; calling `view.cdp("Browser.close")` first flushed them and a fresh container on the same volume read `who=A` back. Also, Chrome writes a `SingletonLock -> <hostname>-<pid>` symlink; a new container has a new hostname, so Chrome refuses the profile ("in use by another Chromium process ... on another computer") and Bun's respawn dies. `rm -f <profile>/Singleton*` at boot fixed it. (PR #39490 also documents that Bun's stale-DevToolsActivePort respawn path drops user argv.)

Other verified facts: Bun 1.4.1 (released today) fixes the chrome-backend `close()` uncatchable rejection (#40991/#40992) — the team's 1.3.14 has that bug. `navigator.webdriver === true` and UA `HeadlessChrome/152.0.0.0` by default; `--disable-blink-features=AutomationControlled` + `--user-agent=...Chrome/152...` flip both. Chrome for Testing has no Linux arm64 Stable build, so on arm64 hosts (Hetzner CAX, Apple-silicon dev Docker) use distro `chromium` or Playwright's Chromium; PR #39819 (open) says Bun's Playwright chrome-headless-shell auto-detect path is wrong on linux-x64 — pin `BUN_CHROME_PATH`/`backend.path`. Viewport: `height: 700` gave `innerHeight 613`; use `Emulation.setDeviceMetricsOverride` (PR #39090 open).

Resources: Chrome PSS was ~480 MB with one example.com tab and ~630 MB after adding app.uniswap.org, so budget ~0.5-0.8 GB and ~0.3-0.5 vCPU per active tester; Browserless's own sizing (4 cores/8 GB → 10-20 sessions) agrees. Cheapest host for 5-20 concurrent testers: one Hetzner CX43 (8 vCPU/16 GB, €16.49/mo ≈ €0.55/day; CX23 2/4 GB €5.99/mo for the first 3-5 testers) — plain disk, no Firecracker/volume quirks, `--cap-add`/`--shm-size` available. Fly.io works too (shared-cpu-4x 8 GB $44.44/mo ≈ $1.48/day; volumes $0.15/GB/mo but 1:1 pinned to a Machine; stopped Machines cost only rootfs $0.15/GB/mo — attractive for a Machine-per-user model, ~1-2 extra days of work). Railway is ~$20/vCPU-mo + $10/GB-mo (~$5/day for 4 vCPU/8 GB), one volume per service, replicas incompatible with volumes. Cloud Run is a poor fit: WebSockets max 60 min, best-effort affinity, instance-based billing while any socket is open, no real persistent disk.

Sign-in inside the server Chrome: Google's own support page says it blocks sign-ins from browsers "being controlled through software automation" or "embedded in a different application"; default Bun flags trip both `navigator.webdriver` and the HeadlessChrome UA. Stealth flags remove those two signals, but datacenter-IP reputation is untested — do not plan the demo around Google OAuth in the agent Chrome. Passkeys: there is no platform authenticator in headless Linux Chrome; CDP `WebAuthn.enable` + `addVirtualAuthenticator({protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true, automaticPresenceSimulation:true})` makes register/login work, but the credential lives on the server. Turnstile runs proof-of-work/API-probing/browser-quirk challenges and Managed mode may show a checkbox; expect friction on cloud IPs. Critically, the Privy wallet login happens in the user's own browser (the workspace UI), not in the agent Chrome, so the demo's "human grabs the page to log in" should target an email+password or OTP site (or the team's own x402 page), where it will be real.

Setup estimate: single Hetzner box + Docker Compose + Caddy TLS + the verified flags: 4-6 hours. Worker-process-per-user for profile isolation: +1 day. Fly Machines-per-user: +1.5-2 days. The Dockerfile and six probe scripts are in /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest (image `wvtest` kept locally; Docker Desktop was started for these tests).

## Claims

### [high] conf 0.95: VERIFIED: Bun.WebView chrome backend runs inside a Linux Docker container (oven/bun:1.4.1 Debian trixie + apt chromium 152, arm64) and Page.startScreencast, Input.dispatch*, screenshot() and closeAll() all work — but only with argv ['--no-sandbox','--disable-dev-shm-usage'] when running as root, or with USER bun + --cap-add=SYS_ADMIN when non-root; root without --no-sandbox and non-root under default seccomp both die with 'Chrome process closed the pipe'.

Evidence: My container probes today: Chrome stderr 'Running as root without --no-sandbox is not supported. See https://crbug.com/638180'; root+--no-sandbox: navigated in 1.8-2.7 s, screencast 31 frames/31 acks/0 errors in 2.7 s of 30 repaints, mouse/keyboard events observed by the page ('mousedown@60,60', input value 'hello a'), 0 chrome procs after closeAll with --init. PR #39490 (open) confirms Bun does not add these flags itself and that tests hardcoded argv ['--no-sandbox'].

Sources:
- https://github.com/oven-sh/bun/pull/39490
- https://bun.com/docs/runtime/webview
- https://pptr.dev/troubleshooting
- https://playwright.dev/docs/docker

### [high] conf 0.95: VERIFIED: One Bun process drives exactly one Chrome and therefore one profile. Per-view dataStore directories are ignored after the first view, and connect mode (backend.url) to a second Chrome is also ignored — so 'one profile per user' cannot be done with Bun.WebView inside a single Bun process.

Evidence: Docs: dataStore directory 'applies to entire Chrome process; first view's directory wins for all subsequent views'. Probe: view B with dataStore /data/profile-b saw view A's localStorage 'A' and cookie 'who=A'; /data/profile-b never created. Connect-mode probe: two Chromes on :9222/:9223 with distinct --user-data-dir; both views reported 'Profile Path /data/u1/Default' on chrome://version and /json/list on Chrome #2 showed no view targets.

Sources:
- https://bun.com/docs/runtime/webview

### [high] conf 0.95: VERIFIED: view.cdp() allows exactly one command in flight; a concurrent call throws synchronously ERR_INVALID_STATE 'a cdp() is already pending'. Screencast acks, human input and agent commands must be serialized through one queue per view.

Evidence: Probe output: 'error: Invalid state: a cdp() is already pending, code: ERR_INVALID_STATE' from Promise.allSettled of three Runtime.evaluate calls; a promise-chain queue then produced 31 acked frames with 0 ack errors. Docs: 'One command in flight per view'.

Sources:
- https://bun.com/docs/runtime/webview

### [high] conf 0.9: VERIFIED: A persistent per-user profile survives container restarts on a plain Docker volume only if (a) Chrome is closed gracefully via view.cdp('Browser.close') before closeAll() — after SIGKILL the cookie and localStorage were lost — and (b) <profile>/Singleton* is deleted at boot, because Chrome's SingletonLock encodes hostname-pid and a new container's hostname makes Chrome refuse the profile, after which Bun's respawn fails.

Evidence: Probe (e): restart after closeAll() → 'SPAWN/NAV FAILED', Chrome stderr 'The profile appears to be in use by another Chromium process (10) on another computer (4264798012af)'; after rm Singleton* Chrome started but localStorage null/cookie empty. Probe (g): Browser.close → 'ok', Cookies file 20480 B, fresh container read 'who: A cookie: who=A'. PR #39490 text: stale DevToolsActivePort respawn path 'respawns Chrome with an empty argv'.

Sources:
- https://github.com/oven-sh/bun/pull/39490
- https://bun.com/docs/runtime/webview

### [medium] conf 0.9: VERIFIED: Bun 1.4.1 (released 2026-09-04) fixes the chrome-backend close() uncatchable 'WebView closed' rejection that exists in the team's 1.3.14; Bun 1.4 shipped 2026-08-20. Still-open Linux items: PR #39490 (no-sandbox/dev-shm defaults), PR #39819 (Playwright chrome-headless-shell path wrong on linux-x64), issue #30475 (orphaned helpers on Linux; its fix PR #30476 was closed unmerged on 2026-06-26 due to the Rust rewrite), PR #39090 (viewport sized via window, not device metrics).

Evidence: bun.com/blog/bun-v1.4.1: 'closing a Bun.WebView created with a url option raised an uncatchable WebView closed rejection' fixed; GitHub search results list states/dates; PR #30476 page: 'Closed without merging on June 26, 2026'. In my 1.4.1 run with docker --init, 0 chrome processes remained after closeAll(). Probe: height 700 gave innerHeight 613.

Sources:
- https://bun.com/blog/bun-v1.4.1
- https://github.com/oven-sh/bun/issues/40991
- https://github.com/oven-sh/bun/pull/40992
- https://github.com/oven-sh/bun/pull/39819
- https://github.com/oven-sh/bun/issues/30475
- https://github.com/oven-sh/bun/pull/30476
- https://github.com/oven-sh/bun/pull/39090

### [high] conf 0.85: VERIFIED: Default Bun-launched Chrome exposes navigator.webdriver === true and UA 'HeadlessChrome/152.0.0.0'; adding argv '--disable-blink-features=AutomationControlled' and '--user-agent=... Chrome/152.0.0.0 ...' yields webdriver false and a normal UA. Google's sign-in help page says it blocks browsers 'being controlled through software automation rather than a human' and those 'embedded in a different application', so Google OAuth inside the agent Chrome is unreliable even with stealth flags (IP reputation untested).

Evidence: Probe (b): 'ua: ... HeadlessChrome/152.0.0.0', 'webdriver: true'; probe (c) stealth: 'ua: ... Chrome/152.0.0.0 Safari/537.36', 'webdriver: false'. Google support 7675428 quoted; Google OAuth webview ban since 2017-04-20. W3C: navigator.webdriver 'Returns true if webdriver-active flag is set'.

Sources:
- https://support.google.com/accounts/answer/7675428
- https://developers.googleblog.com/en/modernizing-oauth-interactions-in-native-apps-for-better-usability-and-security/
- https://w3c.github.io/webdriver/#interface

### [medium] conf 0.75: VERIFIED (CDP docs) / INFERRED (headless behaviour): Passkeys in the server Chrome need the CDP virtual authenticator — WebAuthn.enable then WebAuthn.addVirtualAuthenticator({protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true, automaticPresenceSimulation:true}) — because headless Linux Chrome has no platform authenticator; Privy passkeys are optional, and Privy login for the wallet happens in the user's own browser, not the agent Chrome.

Evidence: CDP WebAuthn domain lists exactly those parameters and 'automaticPresenceSimulation ... Defaults to true'; Chrome DevTools WebAuthn guide describes software virtual authenticators (ctap2/u2f; usb/nfc/ble/internal). Privy docs: passkey 'must be enabled in the Privy Dashboard', optional alongside email/phone/OAuth. The 'no platform authenticator in headless Linux' part is inferred, not tested.

Sources:
- https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/
- https://developer.chrome.com/docs/devtools/webauthn
- https://docs.privy.io/authentication/user-authentication/login-methods/passkey

### [medium] conf 0.85: VERIFIED: Chrome memory per tester is ~0.5-0.8 GB: PSS was 479.8 MB (13 procs) with one example.com tab and 631.6 MB (14 procs) after adding an app.uniswap.org tab; Browserless sizing says 4 cores/8 GB handles 10-20 concurrent sessions and that Docker's 64 MB /dev/shm crashes Chrome (use --disable-dev-shm-usage and/or --shm-size).

Evidence: Probe (d'') smaps_rollup Pss sums; Browserless docker quickstart table: Light 2 cores/4 GB 5-10 sessions, Medium 4 cores/8 GB 10-20, Heavy 8+/16 GB+ 20-50; '/dev/shm defaults to 64MB'.

Sources:
- https://docs.browserless.io/baas/docker/quickstart
- https://pptr.dev/troubleshooting

### [medium] conf 0.8: VERIFIED pricing: Hetzner CX43 8 vCPU/16 GB €16.49/mo and CX23 2 vCPU/4 GB €5.99/mo (CAX11 arm €6.49, CAX31 arm €21.49; DE prices, US ~20% higher); Fly shared-cpu-4x 8 GB $44.44/mo, shared-cpu-1x 1 GB $5.92/mo, volumes $0.15/GB/mo, stopped Machines $0.15/GB rootfs/mo; Railway ~$20/vCPU-mo + $10/GB-mo, Hobby $5 base, volume 5 GB on Hobby, one volume per service, 'Replicas cannot be used with volumes'; Cloud Run WebSockets max 60 min, session affinity 'best effort', any open socket bills as instance-based.

Evidence: Hetzner numbers from vpsbenchmarks mirror (hetzner.com's own page did not render its table for me — CX33 price unverified); Fly and Railway numbers from their pricing pages; Cloud Run from docs.cloud.google.com/run/docs/triggering/websockets; Cloud Run pricing page could not be extracted.

Sources:
- https://www.vpsbenchmarks.com/hosters/hetzner/plans
- https://fly.io/docs/about/pricing/
- https://fly.io/docs/volumes/overview/
- https://railway.com/pricing
- https://docs.railway.com/reference/volumes
- https://docs.cloud.google.com/run/docs/triggering/websockets

### [medium] conf 0.9: VERIFIED: Chrome for Testing publishes Stable 152.0.7977.82 only for linux64/mac-arm64/mac-x64/win32/win64 (linux-arm64 only in Beta/Dev/Canary), so on arm64 hosts (Hetzner CAX, Apple-silicon Docker) use the distro `chromium` package (what I tested) or Playwright's Chromium; Puppeteer docs say Chrome 'does not provide arm64 binaries for Linux' and Alpine is problematic; the official oven/bun image is debian:trixie with a `bun` uid 1000 user and amd64/arm64 builds.

Evidence: googlechromelabs chrome-for-testing dashboard; pptr.dev/troubleshooting; oven-sh/bun dockerhub/debian/Dockerfile ('FROM debian:trixie', useradd bun --uid 1000, amd64→x64-baseline, arm64→aarch64).

Sources:
- https://googlechromelabs.github.io/chrome-for-testing/
- https://pptr.dev/troubleshooting
- https://raw.githubusercontent.com/oven-sh/bun/main/dockerhub/debian/Dockerfile
- https://bun.com/docs/guides/ecosystem/docker

### [high] conf 0.85: VERIFIED: The drop-in fallback if Bun.WebView is abandoned is puppeteer-core/playwright-core in the same Bun process; the screencast/input code is byte-for-byte the same CDP (Page.startScreencast {format,quality,maxWidth,maxHeight,everyNthFrame,maxFramesInFlight}, Page.screencastFrame → Page.screencastFrameAck {sessionId}, Input.dispatchMouseEvent/dispatchKeyEvent/insertText) — only the transport changes from view.cdp()/view.addEventListener to `const client = await page.createCDPSession(); client.send(...); client.on(...)`, and it removes both the one-Chrome-per-process and one-in-flight limits (one Chrome + Target.createBrowserContext per user, contexts are 'fast and cheap to create and are completely isolated').

Evidence: CDP Page/Input domain docs; Puppeteer CDPSession docs; Playwright browser-contexts docs; CDP Target.createBrowserContext 'Similar to an incognito profile but you can have more than one'; Storage.getCookies/setCookies accept browserContextId for persistence.

Sources:
- https://chromedevtools.github.io/devtools-protocol/tot/Page/
- https://chromedevtools.github.io/devtools-protocol/tot/Input/
- https://pptr.dev/api/puppeteer.cdpsession
- https://playwright.dev/docs/browser-contexts
- https://chromedevtools.github.io/devtools-protocol/tot/Target/
- https://chromedevtools.github.io/devtools-protocol/tot/Storage/

### [low] conf 0.8: VERIFIED: Cloudflare Turnstile runs 'proof-of-work, proof-of-space, probing for web APIs, and various other challenges for detecting browser-quirks and human behavior' and Managed mode 'automatically decides whether to show a checkbox based on visitor risk level' — so Turnstile-protected sites can add a checkbox or block from a datacenter IP; Playwright's own default Chromium switch list (no --enable-automation, --disable-dev-shm-usage, --disable-background-networking, --password-store=basic, --use-mock-keychain, --no-service-autorun, etc.) is the reference set for a server Chrome.

Evidence: developers.cloudflare.com/turnstile quoted; microsoft/playwright chromiumSwitches.ts list fetched.

Sources:
- https://developers.cloudflare.com/turnstile/
- https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/chromium/chromiumSwitches.ts

## Recommendations

- Day 0 (today): upgrade to Bun 1.4.1 (close() rejection fix). Copy /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest/{Dockerfile,test2.ts,test4.ts,test6.ts} into the repo as `deploy/` + `scripts/smoke-browser.ts`; it is a working Linux smoke test (screencast, input, persistence). Run it once on x64 with google-chrome-stable to confirm the arm64 Chromium result carries over.
- Recommended stack: Hetzner CX43 (8 vCPU/16 GB, €16.49/mo ≈ €0.55/day; start on CX23 €5.99 for ≤5 testers), Ubuntu 24.04, Docker Compose, Caddy for TLS/WebSocket. Image: `FROM oven/bun:1.4.1` + `apt-get install -y chromium fonts-liberation fonts-noto-color-emoji` (or google-chrome-stable on x64). Run: `init: true`, `shm_size: 1g`, volume `/data`. Either stay root with argv `--no-sandbox --disable-dev-shm-usage --disable-blink-features=AutomationControlled --user-agent=<normal Chrome 152 UA>`, or `USER bun` + `cap_add: [SYS_ADMIN]` and drop --no-sandbox. Set `BUN_CHROME_PATH=/usr/bin/chromium` explicitly (PR #39819 bug). Budget ~4-6 h.
- Fix the one-Chrome-per-process constraint now, not on day 6: pick one of (a) worker-per-user — the API process `Bun.spawn(['bun','browser-worker.ts'], {env:{PROFILE_DIR:'/data/profiles/<userId>'}})` per active session, each worker owns one Bun.WebView with its own dataStore and streams frames over a Unix socket/WS (keeps the locked Bun.WebView bet; ~1 day); or (b) puppeteer-core in the main process with one Chrome + `browser.createBrowserContext()` per user and cookies persisted via Storage.getCookies/setCookies (removes the cdp() one-in-flight limit too; ~1 day, drops Bun.WebView). Do NOT rely on dataStore per view or backend.url per view — both verified ignored.
- Wrap every view.cdp() call (screencast ack, human Input.dispatch*, agent commands) in one serial promise queue per view; let human input starve agent commands, not the other way round. Ack frames from inside the queue; drop frames on backpressure (maxFramesInFlight defaults to 3).
- Profile hygiene, both verified necessary: on worker boot `rm -f $PROFILE_DIR/Singleton*` before constructing the WebView; on idle/logout/shutdown call `await view.cdp('Browser.close')` and wait for exit before closeAll() so cookies/localStorage flush. Set the container hostname fixed (`hostname: agent`) as belt and braces. Use `Emulation.setDeviceMetricsOverride` to get an exact viewport (height 700 gave innerHeight 613).
- Do not put Google OAuth or passkeys in the agent-Chrome part of the demo. The Privy login is in the user's own browser (workspace UI) and is unaffected. For the 'human grabs the page and logs in' beat, use a site with email+password/OTP, or your own x402 page. If you must show a passkey in the shared Chrome, add a CDP virtual authenticator (ctap2/internal/resident/userVerified) and say on screen that it lives on the server. Test Google sign-in with the stealth flags from the Hetzner IP once on Day 1 and decide; expect Turnstile/reCAPTCHA friction from datacenter IPs.
- Per-tester capacity: budget 0.6-0.8 GB RSS and ~0.4 vCPU per active session; hard-cap concurrent sessions (e.g. 15 on CX43), kill idle Chromes after 10 min (Browser.close), and keep profiles on disk (~50-150 MB each). At 20 testers/day this is ~€0.55/day on Hetzner; on Fly (shared-cpu-4x 8 GB) ~$1.50/day; Railway ~$5/day; skip Cloud Run.
- If judges' demo reliability matters more than tester scale, run the judge demo on its own dedicated worker/profile that nobody else can touch, and pre-warm it (first navigate in a fresh container took 12 s on arm64 emulation; warm was 0.6-2.7 s).
- Watch oven-sh/bun PRs #39490 (no-sandbox defaults), #39819 (Playwright path), #39090 (viewport) — if any merge before 13 Sep, bump; otherwise the argv/env workarounds above are sufficient. Mention in the README that closeAll() is SIGKILL and that helper-process orphaning (#30475) is mitigated by `init: true`.
- Day-1 checklist: (1) `docker compose up` on Hetzner passes the smoke test; (2) Caddy serves the Vite app + /ws/browser binary stream over TLS; (3) two browser tabs as two users get two workers/two profiles and cannot see each other's cookies; (4) restart the container, both profiles still logged in; (5) memory graph with 5 sessions open; (6) Telegram deep link → workspace → live screencast end-to-end from a phone.

## Open questions

- Does the same container recipe work on linux-x64 with google-chrome-stable? All my probes ran arm64 Debian `chromium` 152 (Apple-silicon Docker); x64 is the likely production host and should be re-run once (5 minutes with the kept scripts).
- Does Google sign-in actually succeed from a Hetzner/Fly datacenter IP with the stealth flags? Verified only that navigator.webdriver/UA are fixed, not that Google's risk engine accepts it.
- Is the Linux helper-process orphaning (#30475) fixed by the Rust rewrite or merely masked by `--init` in my run? I saw 0 leftover processes but did not test without an init process.
- Can Bun.WebView ever place a view in a specific Target.createBrowserContext (multi-profile inside one Chrome)? Docs and probes say no today; the Rust codebase may change this — nothing on the roadmap found.
- Exact Hetzner CX33 (4 vCPU/8 GB) price and current availability ('Currently not available' appeared on hetzner.com for some shared plans); Cloud Run pricing page could not be extracted (irrelevant given the WebSocket/affinity limits).
- Does Bun.WebView's connect mode (backend.url) reconnect if the external Chrome restarts, and does headless new-mode Chrome show Privy's passkey UI at all (untested) — only the CDP virtual-authenticator parameters were verified.
- Fly Machines architecture: the docs example shows x86_64; I could not confirm whether arm64 Machines exist, which matters only if you build arm64 images locally without buildx.

## All sources

- https://bun.com/docs/runtime/webview
- https://bun.com/blog/bun-v1.4.1
- https://bun.com/blog/bun-v1.4
- https://bun.com/blog
- https://bun.com/docs/guides/ecosystem/docker
- https://raw.githubusercontent.com/oven-sh/bun/main/dockerhub/debian/Dockerfile
- https://github.com/oven-sh/bun/pull/39490
- https://github.com/oven-sh/bun/pull/39819
- https://github.com/oven-sh/bun/issues/30475
- https://github.com/oven-sh/bun/pull/30476
- https://github.com/oven-sh/bun/pull/28185
- https://github.com/oven-sh/bun/issues/40991
- https://github.com/oven-sh/bun/pull/40992
- https://github.com/oven-sh/bun/pull/39090
- https://github.com/oven-sh/bun/pull/29407
- https://pptr.dev/troubleshooting
- https://pptr.dev/guides/docker
- https://pptr.dev/api/puppeteer.cdpsession
- https://playwright.dev/docs/docker
- https://playwright.dev/docs/browsers
- https://playwright.dev/docs/browser-contexts
- https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/chromium/chromiumSwitches.ts
- https://googlechromelabs.github.io/chrome-for-testing/
- https://developer.chrome.com/docs/chromium/new-headless
- https://developer.chrome.com/docs/chromium/headless
- https://developer.chrome.com/docs/devtools/webauthn
- https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/
- https://chromedevtools.github.io/devtools-protocol/tot/Page/
- https://chromedevtools.github.io/devtools-protocol/tot/Input/
- https://chromedevtools.github.io/devtools-protocol/tot/Target/
- https://chromedevtools.github.io/devtools-protocol/tot/Storage/
- https://w3c.github.io/webdriver/#interface
- https://support.google.com/accounts/answer/7675428
- https://developers.googleblog.com/en/modernizing-oauth-interactions-in-native-apps-for-better-usability-and-security/
- https://developers.cloudflare.com/turnstile/
- https://docs.privy.io/authentication/user-authentication/login-methods/passkey
- https://docs.privy.io/authentication/user-authentication/login-methods/telegram
- https://fly.io/docs/about/pricing/
- https://fly.io/docs/volumes/overview/
- https://fly.io/docs/launch/autostop-autostart/
- https://fly.io/docs/networking/dynamic-request-routing/
- https://fly.io/docs/machines/overview/
- https://fly.io/docs/machines/guides-examples/machine-sizing/
- https://railway.com/pricing
- https://docs.railway.com/reference/volumes
- https://docs.cloud.google.com/run/docs/triggering/websockets
- https://www.vpsbenchmarks.com/hosters/hetzner/plans
- https://docs.browserless.io/baas/docker/quickstart
- https://github.com/browserless/browserless
- /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest/Dockerfile
- /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest/test.ts
- /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest/test2.ts
- /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest/test4.ts
- /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest/test5.ts
- /private/tmp/claude-501/-Users-jonas-Documents-web3-agentic-wallet/ace6e5a2-eb35-4d30-b09a-7db65fc3c119/scratchpad/wvtest/test6.ts
- /Users/jonas/Documents/web3/agentic-wallet/ARCHITECTURE.md
- /Users/jonas/Documents/web3/agentic-wallet/PLAN.md
