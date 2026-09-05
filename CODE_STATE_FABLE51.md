# Implementation state (FABLE51)

Audited Sat 5 Sep 2026, 09:00-11:30 CEST, at commit `0b076fe` (the code is unchanged since Kristjan's push at 22:38 on 4 Sep; everything after is planning docs). Method: nine readers, one per area, each claim then challenged by two independent verifiers (code-reading and "would this hold hosted with two strangers and real keys"), then one synthesis. Full digest with file and line references: `research_FABLE51/code-state-audit_FABLE51.md`. Live checks were made against the deployed URL and Blocky402's `/supported`.

Bottom line: **the spine is real and coherent, everything money-shaped is stubbed, the service is single-tenant and unauthenticated, and the plan's Day 3 milestone is not reachable on the current schedule.**

---

## 1. What exists and works

- **One Bun process** serves the SPA, the API, both WebSockets, the agent loop and the Chrome; a Railway deploy gated on CI answers `/health`.
- **Shared Chrome**: Bun.WebView with a JPEG screencast, acknowledgement and backpressure, human input capture, the 1.5-second and 15-second arbitration between agent and human (eight passing tests), accessibility snapshots with element refs. Taking the page aborts the run first.
- **Agent loop**: AI SDK v7 `streamText`, server-owned abort, 12-step cap, SSE with replay on reload; eight tools (navigate, snapshot, click, type, graph query, x402 fetch, wallet send, wallet status).
- **Host policy engine**: a pure `authorize()` that checks frozen, provenance, expiry, network, payee, host, per-transaction cap, rolling-window cap and an "ask" band, in that order, with twelve passing tests and a receipt written on every outcome, including denials.
- **A 402 envelope** on the oracle route with the right shape (x402 v2, `hedera:testnet`, exact scheme, HBAR), and live verify-and-settle code against a facilitator.
- **Tooling and CI**: format, type-aware lint, typecheck, dependency-boundary check, tests, knip, build and a Playwright smoke test on every push.
- **The gates are green, verified locally** on Bun 1.4.2, Sat 5 Sep 11:30-11:50 CEST: `bun install --frozen-lockfile` (557 packages), `bun run check` exit 0 (oxfmt over 163 files, type-aware oxlint, ten typecheck tasks plus the `tools` and `e2e` projects, the dependency-graph and agent-file checks, sixteen test tasks, knip), `bun run build` exit 0, `bun run e2e` three passed. **107 tests across nine packages, zero failures**: browser 26, wallet 21, web 14, server 12, domain 9, graph 8, protocol 7, payments 6, database 4. This replaces the audit's "seven of nine suites could not be run" — that was the Bun 1.3.14 lockfile mismatch, not the code.

## 2. What is stubbed or missing, against the plan

| Capability the plan needs | Today | Hours to plan |
| --- | --- | --- |
| Shared Chrome, grab, freeze | Partial: freeze sets a flag and aborts runs but never reaches the browser; no grey state; new runs can start while frozen; no fps or latency measurement exists | 3 |
| Per-user isolation, fresh profile per session | Missing: one session, one mandate, one ledger, one persistent profile per process; a second visitor's chat aborts the first; every socket sees the same screencast | 22 |
| Authentication on routes and sockets | Missing: no auth anywhere; a request with no Origin header is trusted, verified live: curl can open both sockets, receive frames and the mandate, and could send navigate, take, unfreeze, or replace every rule | 6 |
| Privy wallet, agent signer, policy | Missing: the adapter makes two identity calls and nothing calls them; the client never sends its token; no wallet creation, no policy, no signing method anywhere; the deployed build has Sign-in disabled | 17 |
| Privy top-up transfer | Missing | 5 |
| Typed-data x402 to The Graph | Missing: the payer selects only `hedera:testnet` | 6 |
| Hedera 402 service | Partial: the live gate is a stub that settles any well-formed envelope with a fake transaction id; `payTo` is `0.0.0`; `extra` is empty so no fee payer; flat price; no HCS, no receipt token, no service card | 8 |
| Hedera payer and first real settlement | Partial: a live payer exists behind one shared env key; no settlement has ever happened; no per-user pocket, no host tHBAR caps | 12 |
| Idempotency | Partial: sequential replays are deduplicated but return no body; two concurrent same-key spends both settle, reproduced by a verifier against the real ledger | 4 |
| HCS receipts | Missing | 2 |
| Graph registry of four deployments, freshness gate | Partial: one subgraph id with the right Messari query shape; the live URL serves a fixture; no `_meta` block, no freshness, no deployment id on rows or receipts | 8 |
| Receipts | Partial: intent, decision, evidence hash, transaction id; missing Graph ids and blocks, policy id, explorer links, HCS sequence, ledger line; in-memory, not replayed on reload; no public page | 9 |
| Ledger persistence | Broken: in-memory only; the migrations folder does not exist; the migrate script points at a missing path and claims a deploy hook that is not declared; Postgres is provisioned and unused; every restart resets caps and idempotency | 6 |
| Users table, nonces | Missing (the schema explicitly declares no users table) | 2 |
| Telegram | Missing | 11 |
| Guest path, consent, invite code, phone door, judge slots | Missing: one route, Sign in or Sign out only | 20 |
| 402 probe, seller directory, two pre-typed buttons | Missing: the payee allowlist is only the server's own oracle | 8 |
| Evidence files | Missing: none of HEDERA.md, PRIVY.md, GRAPH.md, VALIDATION.md, FEEDBACK.md, ACQUISITION.md, AI-USE.md exists | 2 |
| Runtime and model pins | Local Bun is now 1.4.2 and the whole gate runs; CI still pins 1.4.0 in `ci.yml` while the lockfile is written by 1.4.x, so pin one version in both. The code still pins `claude-sonnet-5` where the plan says `claude-opus-5`, unverified either way | 0.5 |

Total to the plan's Day 3 milestone as written: about **155 hours**. Two builders at eight hours a day reach Day 3 with about 48.

## 3. Track readiness today

| Track | Today | What unblocks it first |
| --- | --- | --- |
| Hedera AI & Agentic Payments | A curl-able 402 with the right shape and nothing behind it: no real account, no fee payer, no settlement, no HashScan id | Fund two accounts, read the fee payer at boot, one settled transaction into HEDERA.md |
| Graph Composable | One subgraph id and a fixture on the live URL, which the track text names as not qualifying | Studio key, the four-deployment registry with `_meta` and a freshness gate |
| Graph AI (From Scratch) | The mechanism is there (query, hash, evidence on the spend) but the model is scripted and the data is a fixture; "From Scratch" is at risk from undisclosed ported-code headers | Live model key, the registry, AI-USE.md |
| Privy financial flow | Nothing Privy runs | Fresh app, authorization key, policy JSON, the denial script, then per-user wallets |
| Privy B2B | Nothing | Do not tick unless the Intents box ships |

## 4. Rule and safety risks (fix before the repo goes public or any real key lands)

- **Tracked Chrome profile**: 209 files under the server app, including Cookies, Login Data, History and Web Data, added on 4 Sep and not ignored. Verified read-only: zero cookies, zero logins, history is example.com only, so it is a leak vector, not a leak. Three history files are already modified in the working tree; a `git add -A` would ship browsing history. Fix: untrack, ignore, one README line, no history rewrite.
- **Undisclosed prior-project headers**: "Ported from invok", "Ported from harness", "lifted from humanhook" in eight files across the browser, server, web, protocol and wallet packages; the handover names a prior project's Privy app as the credentials on the box; two docs cite machine-local prior-repo paths. No AI-USE.md. This is the Start Fresh disclosure rule and the Graph From Scratch pool.
- **The live box is open**: no authentication and a missing Origin is trusted. Anyone with curl can drive the shared Chrome, replace the mandate, or unfreeze. Do not set a real Hedera or Privy key on Railway until sockets and routes carry a session token.
- **Navigation is unchecked** on every path (agent, human, first start); popups are adopted with only an http(s) test and steal the screencast; the x402 tool fetches any model-supplied URL before policy runs (SSRF). Chrome runs as root with no sandbox in the container.
- **Freeze is not a kill switch** for money in flight or for browsing: a settle already started continues; the browser is never told; unfreeze is the same unauthenticated message.
- **Concurrent double payment** with the same idempotency key, reproduced by a verifier.
- **Pricing**: the quote values 1 HBAR at $1, so the USD labels and the $2/$10 caps are really 2 and 10 HBAR.
- **The repo is private** (public GitHub API returns 404); every track requires it public, and CI results cannot be inspected from outside.
- **Stale docs**: two architecture decision records describe a different project (game-core, simulation); the README says a container needs a display while the Dockerfile proves it does not; the plan doc links a file by its old name.

## 5. Claims in README and handover that did not survive verification

- "A real 402 and its paid round trip, verified live": the 402 is real; the round trip settles against a stub that accepted `transaction: "garbage"` with HTTP 200.
- "A retried tool call cannot pay twice": true for sequential retries, false for concurrent ones.
- "Freeze aborts the run first, then takes the page": freeze never takes the page; only the human grab does.
- "The server honours mandate.update": from any unauthenticated socket client.
- "Runs as a Railway pre-deploy command" (migrations): no such hook is declared and no migrations exist.
- "It runs with no keys, verify with `bun run check`": **now confirmed true** on Bun 1.4.2 — the full gate, the build and the browser smoke tests all pass with no keys set. The audit could not check this because Bun 1.3.14 cannot parse a v2 lockfile.
- **CI on `main` was red, and nothing said so.** `bun run check` starts with `oxfmt --check`, which covers markdown; forty-two committed `.md` files failed it, so every push since the research corpus landed has had a failing check suite. Because `.railway/railway.ts` sets `checkSuites: true`, a red suite means the Railway deploy waits forever — the live URL cannot pick up a new commit until the gate is green. Fixed in this commit: the nine top-level planning docs are oxfmt-clean, and `.prettierignore` holds `research_FABLE51/` and the three `IDEAS*.md` out of the formatter, because oxfmt canonicalises GFM ambiguities in that prose (a lone `~` becomes `~~` strikethrough, `*` emphasis becomes `_`) and those files are the verbatim evidence record.
- **`bun run e2e` needs `bun run e2e:install` first** on a fresh install — Playwright refuses to launch a browser revision it did not download, and the failure prints as two failed specs, not as a missing browser. CI does run the install step, so this bites locally only.

## 6. What this means for the plan

The eight-day plan in `PRODUCT_FABLE51.md` assumed the spine was further along on the wallet side than it is. With two builders, the honest Day 3 target is: hygiene commit, the auth gate, the first Hedera settlement, the Privy Day 1 items (fresh app, key, policy JSON, denial transcript), the Graph registry, and the ledger fixes. Per-user isolation, the guest path and the probe/directory move to Days 4-5; the whole video path on the live URL becomes the Day 5 milestone; the public-tester cut line moves from Tue 22:00 to Wed 22:00, and the tester targets drop accordingly. If the third builder is out, per-user isolation is replaced by concurrency 1 plus a queue from the start, and the video records on the single reserved worker.

## 7. First five tasks, in order

1. **Hygiene commit** (1.5 h): untrack and ignore the Chrome profile with a README disclosure line; add AI-USE.md naming the invok, harness and humanhook pattern sources with public links, or strip the headers; rewrite the handover line about the prior project's Privy app and the local-path references; commit the eight evidence-file skeletons.
2. **Measure and decide** (1 h): frames per second and click round-trip on the live URL into `docs/measurements.md`; write the isolation choice and the Sun 12:00 cut line into the plan; pin Bun 1.4.x everywhere and upgrade the local runtime; decide and verify the model id.
3. **Close the open door** (1 h now, 6 h on Day 2): reject a missing Origin, put a per-session token on both sockets and the four API routes, refuse mandate edits and unfreeze without it, check the host before the first fetch in the x402 tool. No real key on Railway before this lands.
4. **First real Hedera settlement** (3 h): fund a service account and a separate payer, read the fee payer from `/supported` at boot and put it in the 402, run verify and settle for real, paste the HashScan id into HEDERA.md, flip the live health report from stub to live.
5. **Privy Day 1** (4 h, independent of the code): fresh app with email OTP on and create-on-login off, the agent's authorization key, the committed policy JSON, the 40-line denial script and its transcript into PRIVY.md, the 15-minute raw-signing test. Then Day 2 starts with the ledger: the in-flight duplicate guard, the cached body, persistence with migrations and a deploy hook, before any per-user pocket is built on it.
