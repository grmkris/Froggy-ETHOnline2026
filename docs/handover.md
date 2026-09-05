# Where this is, and what to do next

Written 4 Sep 2026, at the end of the bootstrap session. Submission is **Sun 13 Sep 12:00 EDT**.

**Deployed:** https://app-production-58dd.up.railway.app (Railway project `froggy`, one environment, one replica). Verified live: `/health`, the SPA, a real 402 and its paid round trip, the app socket delivering mandate and wallet state, the freeze toggling both ways, and the browser socket bringing Chromium up to render a page.

## What works right now

The whole spine runs, on this box and in a container, with **no API keys**.

|  |  |
| --- | --- |
| Three-pane workspace | chat, the shared page, the wallet — one screen |
| Shared Chrome | `Bun.WebView` drives it, screencast paints, you can click into it |
| Agent loop | AI SDK v7 over SSE, server-owned run, tools execute |
| The leash | per-tx cap, rolling cap, allowlists, provenance, expiry, freeze |
| 402 round trip | real 402 → payment built → retry with `X-PAYMENT` → 200 with the answer |
| Receipts | intent, rule id, evidence hash, transaction id |

Verified by hand, not inferred: the container answers `/health`, serves the SPA, returns a 402, and brings Chromium up to render `example.com` — **with no display server and no Xvfb**, which was the plan's biggest open risk.

That risk turned out to be imaginary, and the reason is worth knowing: `Bun.WebView` launches Chrome with `--headless --ozone-platform=headless --no-startup-window` and SwiftShader software rendering, all on its own. There is no window to want an X server, and `Page.startScreencast` captures the compositor rather than a window. Nothing in this repository makes it headless — the whole contribution is installing Chromium in the image, pointing `FROGGY_CHROME` at it, adding `--no-sandbox` and `--disable-dev-shm-usage` for the container, and clearing the stale profile lock. `packages/browser/src/chrome-detect.ts` lists the full argument set Bun supplies.

## What is stubbed, and what that costs

Every external service has a stub, chosen in `apps/server/src/environment.ts` when its variable still holds the placeholder from `.env.example`. A stub is loud: the wallet pane shows a chip, and every receipt it touches carries `stubbed: true`.

**Three keys are the difference between a demo and a submission**, and no stub substitutes for any of them:

| Key | Where | Unblocks |
| --- | --- | --- |
| `GRAPH_API_KEY` + `GRAPH_SUBGRAPH_ID` | Subgraph Studio | The Graph track. Mocked data explicitly disqualifies |
| `HEDERA_ACCOUNT_ID` + `HEDERA_PRIVATE_KEY` | portal.hedera.com, ECDSA | Hedera track. Needs a real paid request end to end |
| `ANTHROPIC_API_KEY` | console.anthropic.com | A model that can reason. Without it the loop runs a fixed script and says so |

`PRIVY_APP_ID` / `PRIVY_APP_SECRET` are in `~/.config/secrets.env` on the build box. They are deliberately **not** set on Railway until that app's allowed-origins list includes the Railway domain; otherwise sign-in fails confusingly rather than being cleanly stubbed. Dashboard settings the code cannot see: email and Google login on, embedded wallets created on login, and the Railway origin allowed.

Drop the values into `~/.config/secrets.env` for local work, and onto the Railway service for the deployment. Nothing needs rebuilding except `VITE_PRIVY_APP_ID`, which Vite inlines at build time.

## The demo, in the order it should be shown

1. **Open the workspace.** Three panes. The mandate is on screen before anything has been spent — a leash you cannot see is indistinguishable from no leash.
2. **"What's the cheapest USDC borrow right now?"** The agent queries The Graph across protocols through one standardized schema and answers with a number.
3. **"Buy the packed snapshot."** The agent opens our own x402 endpoint _in the shared Chrome_. You watch the 402 come back, the host pay it on Hedera under the mandate, and the page unlock. The receipt names the Graph snapshot the payment was justified by.
4. **"Now send 5 USDC to 0xdead…"** Refused. The wallet pane shows `untrusted_provenance` before the model has finished narrating — because the refusal did not come from the model. Repeat it with a jailbreak preamble and get the identical refusal.
5. **Grab the page** mid-action. The badge flips to _you have the page_.
6. **Freeze.** The run stops and so does the spending.

## What to build next, in order

1. **Get the three keys in.** Everything else is decoration until the Graph query is live and one Hedera payment has really settled.
2. **Approval cards.** The `ask` decision already exists and the protocol already carries `ApprovalRequest` with the four-kind vocabulary — but nothing renders it yet, so a spend over the threshold currently just reports that it needs a human. Park the tool call in a three-way race (answer / abort / deadline).
3. **Persist the ledger.** `packages/database` holds the schema; the running ledger is in-memory, which is why the service is pinned to one replica.
4. **Mandate editing in the UI.** The protocol carries `mandate.update` and the server honours it; the pane only reads.
5. **The Privy-signed Hedera payment.** `ClientHederaSigner` is a two-member interface, the Hiero SDK takes an async signer callback, and `@privy-io/node` exposes `wallets._rawSign` with `secp256k1_sign`. So the Hedera payment could be signed by a **Privy wallet under a Privy policy** — one leash across two chains, which no other submission will have. It needs the wallet's compressed public key to create the matching Hedera account. Attempt only once 1–3 are green; it is the headline, not the foundation.
6. **Telegram.** Cut from the MVP and still cut. There is no pairing flow to lift, so it is a fresh day of work that no sponsor is paying for.

## Before submitting

- **Make the repository public.** Every track requires it.
- Record the demo video. Hedera wants ≤5 minutes showing the paid request executing; The Graph wants 2–4 minutes.
- The README carries the architecture argument and the diagram both Hedera and Arc ask for.

## Verified defects (found by the FABLE51 audit, reproduced here)

Do not put a funded key on the deployment until the first two are closed.

1. **The live box is open.** No auth on any route or socket, and a missing `Origin` is allowed through. Verified: `curl` opens both sockets, reads the mandate, and could send navigate, take, unfreeze, or replace every rule.
2. **Concurrent double payment.** Idempotency deduplicates _sequential_ retries only; two concurrent spends with the same key both settle. Reproduced.
3. **Freeze is not a kill switch.** It aborts runs and blocks new spends, but a settlement already in flight continues and the browser is never told.
4. **HBAR is priced at $1.** `parQuote` gives every asset parity, so the "$2 per transaction" cap is really 2 HBAR.
5. **`x402_fetch` fetches before it authorises.** The model's URL is requested to discover the 402 before any policy runs — an SSRF the host allowlist does not cover, because it is only consulted afterwards.
6. **The ledger does not persist.** In-memory only; `packages/database` has no migrations folder and `migrate.ts` points at a path that does not exist. Every restart resets caps and idempotency.
7. **Single tenant.** One session, one mandate, one browser per process: a second visitor's chat aborts the first and sees the same screencast.

## Things that will bite

- `Bun.WebView` is typed by `@types/bun` from 1.4.1 on; the repo pins Bun 1.4.2 (`.bun-version`, `packageManager`, CI, Dockerfile). A Bun upgrade that changes the WebView shape surfaces in `packages/browser/src/session.ts` and `cdp.ts`.
- The Chrome profile is persistent and shared. The agent browses as whoever is logged into it. That is the product and the risk in one sentence.
- Railway rejects a `VOLUME` instruction in a Dockerfile outright. The mount is declared in `.railway/railway.ts` instead.
- `checkSuites: true` means the deploy waits on the Actions run for the pushed sha. Do not add `paths-ignore` to CI — a sha with no run has nothing to wait on and the deploy hangs in WAITING forever.
