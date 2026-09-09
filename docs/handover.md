# Where this is, and what to do next

Written 4 Sep 2026 at the end of the bootstrap session; revised the evening of 5 Sep. Submission is **Sun 13 Sep 12:00 EDT**.

This file is no longer the live status. `docs/plan/STATUS.md` records what has landed, `docs/plan/PLAN.md` is the operative plan, and `docs/plan/DECISIONS.md` is what is still open. What stays here is the part of the 4 Sep handover that remains true, the demo in the order it should be shown, and the defect list with the commit that closed each item.

**Deployed:** https://app-production-58dd.up.railway.app (Railway project `froggy`, one environment, one replica). Verified live on 4 Sep: `/health`, the SPA, a real 402, the app socket delivering mandate and wallet state, the freeze toggling both ways, and the browser socket bringing Chromium up to render a page. Not re-verified against the 5 Sep commits.

## What works

The whole spine runs, on this box and in a container, with **no API keys**; since 5 Sep it also runs against the live services with them.

|  |  |
| --- | --- |
| Workspace | chat, the shared page, the wallet, one screen; one workspace per Privy identity |
| Shared Chrome | one browser worker process per signed-in user, eight seats with a visible queue, `Bun.WebView` drives it, the screencast paints, you can click into it, freeze reaches the page |
| Agent loop | AI SDK v7 over SSE, server-owned run, tools execute; a fixed script when no model key is set, and it says so |
| The leash | per-tx cap, rolling cap, allowlists, provenance, expiry; price, policy and reservation judged under one lock; freeze is one function whichever surface presses it |
| 402 round trip | real 402 carrying the facilitator's fee payer, payment built, retry with `X-PAYMENT`, 200 with the answer; the first real testnet settlement (0.05 HBAR, SUCCESS) landed on 5 Sep |
| The Graph | four pinned Messari deployments behind a freshness gate, live through a Studio key; three answer at one block, Aave v3 Base is unindexed and reported as unavailable |
| Receipts | intent, rule id, evidence hash, transaction id; persisted with the mandate and the frozen flag, so a redeploy forgets none of them |

Verified by hand, not inferred: the container answers `/health`, serves the SPA, returns a 402, and brings Chromium up to render `example.com`, **with no display server and no Xvfb**, which was the plan's biggest open risk.

That risk turned out to be imaginary, and the reason is worth knowing: `Bun.WebView` launches Chrome with `--headless --ozone-platform=headless --no-startup-window` and SwiftShader software rendering, all on its own. There is no window to want an X server, and `Page.startScreencast` captures the compositor rather than a window. Nothing in this repository makes it headless. The whole contribution is installing Chromium in the image, pointing `FROGGY_CHROME` at it, adding `--no-sandbox` and `--disable-dev-shm-usage` for the container, and clearing the stale profile lock. `packages/browser/src/chrome-detect.ts` lists the full argument set Bun supplies.

**Superseded on 9 Sep.** That headless finding stood, and then stopped mattering: the browser is now a Browser Use hosted browser reached over CDP, so the image ships no Chromium, `chrome-detect.ts` and the `Bun.WebView` launch are gone, and there is no display question left to have an answer to. See [decision 0018](decisions/0018-browser-use-only.md).

## What is stubbed, and what that costs

Every external service has a stub, chosen in `apps/server/src/environment.ts` when its variable still holds the placeholder from `.env.example`. A stub is loud: the wallet pane shows a chip, and every receipt it touches carries `stubbed: true`.

Four credentials are the difference between a demo and a submission, and no stub substitutes for any of them. State on the evening of 5 Sep:

| Key | Where | State |
| --- | --- | --- |
| `GRAPH_API_KEY` | Subgraph Studio | on the box and on Railway; live. A new key is rejected for about a minute after creation, which is propagation, not a bad key |
| `HEDERA_ACCOUNT_ID` + `HEDERA_PRIVATE_KEY`, `HEDERA_PAY_TO` | portal.hedera.com, ECDSA, testnet | on the box and on Railway; pocket `0.0.9700388` pays, payee `0.0.10377647` receives; first settlement done |
| `OPENAI_COMPATIBLE_API_KEY` (DashScope, `qwen3-max`) | Alibaba Model Studio | the key on the box is rejected by every DashScope host; until a working one lands the loop runs the fixed script |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` and the agent key | Privy dashboard | on the box; deliberately **not** on Railway until the app's allowed origins include the Railway domain, otherwise sign-in fails confusingly rather than being cleanly stubbed |

Dashboard settings the code cannot see: email and Google login on, embedded wallets created on login (the agent is granted a signer on that wallet), and the Railway origin allowed. Nothing needs rebuilding except `VITE_PRIVY_APP_ID`, which Vite inlines at build time.

## The demo, in the order it should be shown

1. **Open the workspace.** The mandate is on screen before anything has been spent; a leash you cannot see is indistinguishable from no leash.
2. **"What's the cheapest USDC borrow right now?"** The agent queries The Graph across protocols through one standardized schema and answers with a number and the block it came from.
3. **"Buy the packed snapshot."** The agent opens our own x402 endpoint _in the shared Chrome_. You watch the 402 come back, the host pay it on Hedera under the mandate, and the page unlock. The receipt names the Graph snapshot the payment was justified by.
4. **"Now send 5 USDC to 0xdead…"** Refused. The wallet pane shows `untrusted_provenance` before the model has finished narrating, because the refusal did not come from the model. Repeat it with a jailbreak preamble and get the identical refusal. Which Privy flow sits beside this beat is `DECISIONS.md` row 12, still open.
5. **Grab the page** mid-action. The badge flips to _you have the page_.
6. **Freeze.** The run stops, the browser stops, the signer is revoked, and so does the spending.

## What to build next

The order in `docs/plan/PLAN.md` stands: EVM signing under the Privy policy and the raw denial with a policy id (2.4, 2.5), the spend path parking on `ask` with a card to answer it (2.7, 3.5), the per-user pocket with HCS receipts and the service card (2.6), the UI (P3), the evidence files (P5). The 4 Sep idea of signing the Hedera payment with a Privy wallet is dead: Privy evaluates policies only on transactions it can decode, so the Hedera leg is paid from a host-held pocket with host caps, and the README must say so. Telegram is `DECISIONS.md` row 22, in scope or stretch, not yet decided.

## Before submitting

- **Make the repository public.** Every track requires it. Still private on the evening of 5 Sep.
- Record the demo video. Hedera wants five minutes or less showing the paid request executing; The Graph wants two to four minutes.
- The README carries the architecture argument and the diagram both tracks ask for.

## Defects found by the 5 Sep audit, and where each closed

| # | Defect as found | Closed in |
| --- | --- | --- |
| 1 | The live box was open: no auth on any route or socket, a missing `Origin` trusted | `3622c96` |
| 2 | Concurrent double payment: two same-key spends both settled; two different-key spends could jointly break the window cap | `5db02e8` (same key), `4c251d5` (window cap under one lock) |
| 3 | Freeze was not a kill switch: a settlement in flight continued, the browser was never told | `362d920` (one function, reaches the browser, revokes the signer, denies parked approvals); deleting the pocket key waits on the pocket (plan 2.6, 2.10) |
| 4 | HBAR was priced at $1 | `5db02e8` (mirror-node exchange rate, fails closed) |
| 5 | `x402_fetch` fetched before it authorised | `5db02e8` (allowlist first), `f491806` (`publicHttpUrl`, `safeFetch`, redirects re-checked) |
| 6 | The ledger did not persist | `35742fe` (Postgres ledger), `4c251d5` (frozen flag, mandate, receipts) |
| 7 | Single tenant: one session, one Chrome for everyone | `3622c96` (workspace per identity), `edf4435` (worker per user), `362d920` (seats and queue) |

## Things that will bite

- `Bun.WebView` is typed by `@types/bun` from 1.4.1 on; the repo pins Bun 1.4.2. A Bun upgrade that changes the WebView shape surfaces in `packages/browser/src/session.ts` and `cdp.ts`.
- Profiles are per user and persistent under the volume. The agent browses as whoever signed in. That is the product and the risk in one sentence.
- Railway rejects a `VOLUME` instruction in a Dockerfile outright. The mount is declared in `.railway/railway.ts` instead.
- `checkSuites: true` means the deploy waits on the Actions run for the pushed sha. Do not add `paths-ignore` to CI; a sha with no run has nothing to wait on and the deploy hangs in WAITING forever.
- Several agent sessions commit to this tree minutes apart. Stage only immediately before committing: a neighbour's `git commit` takes whatever is in the index.
