# Browser Use as the only browser — evidence

9 September 2026. This records what was verified locally and against the live Browser Use API. It is **not** a claim of a production release, a hosted-viewer check or a live browser-triggered payment; those remain outstanding and are listed at the end.

## Verified against the live provider API

Called with the project key, directly, before writing the adapter against it. The probe created one browser, read it back, stopped it and deleted the profile it used. Total charge: **$0.00033** of browser time, from the project's $15 signup credit. No page was loaded, no wallet was involved and no payment was settled.

| Call | Result |
| --- | --- |
| `GET /api/v3/billing/account` | 200. Free tier, $15 credit, **10 concurrent sessions**, rate limit 10 |
| `POST /api/v3/profiles` | 200, profile id returned for a supplied `userId` |
| `GET /api/v3/profiles?query=…` | 200, `{items, totalItems, pageNumber, pageSize}` |
| `POST /api/v3/browsers` | 200. `metadata` labels round-tripped; `browserCost` accrues from creation |
| `GET /api/v3/browsers/{id}` | 200 with `liveUrl`, `cdpUrl`, `timeoutAt`, `browserCost`, `proxyCost` |
| `PATCH /api/v3/browsers/{id}` `{"action":"stop"}` | 200, `status: stopped`, `finishedAt`, **final costs on the reply** |
| `DELETE /api/v3/profiles/{id}` | 204 |
| `GET {cdpUrl}/json/version` | 200, Chrome 151, `webSocketDebuggerUrl` on the same host |

Two things the documentation-derived fixtures had wrong, both of which would have failed on the first real browser:

1. **`cdpUrl` is `https://<browser id>.cdp.browser-use.com`**, not a `wss:` URL. The previous `validateBrowser` required `wss:` and would have rejected every real browser as an invalid CDP origin, and `new WebSocket(httpsUrl)` would not have connected in any case. The socket is the `webSocketDebuggerUrl` Chrome names at `/json/version` on that host.
2. **Profiles and browser reads are `/api/v3`.** The previous code addressed both at `/api/v4`. `/api/v4` is the hosted agent API; its published client has no profiles resource and no browser read.

The fixtures in `packages/browser/src/cloud-api.test.ts` now carry the recorded shapes, and the file says where they came from.

## Verified by driving a real hosted browser

The adapter as shipped — `cloudApi` and `CloudBrowser`, no fixtures — against a real Browser Use browser, from this box:

- Profile created, browser created, `cdpUrl` resolved through `/json/version` and the CDP socket attached.
- `agentNavigate("https://example.com/")` loaded the page; `agentSnapshot()` returned the accessibility tree behind `PAGE_CONTENT_FENCE`.
- `viewer()` answered a `https://live.browser-use.com` URL.
- `takePage()` moved control to `human`; `browser.resume` returned it, and the agent navigated again on the same browser.
- `close()` stopped the browser at the provider and recorded its final cost: one session, `browserUsdMicros: 334`, nothing unreported. The provider's browser list then showed `status: stopped` and `activeSessionCount: 0`.
- The browser carried its `app=froggy` labels in the dashboard, and the profile was deleted afterwards.

Charged: **$0.000334**. Two probe browsers in total across this migration cost
$0.00075 of the project's $15 credit. No page payment, no wallet and no settlement were involved.

This establishes the transport, the driver, profile creation, the takeover gate and the cost accounting against the real provider. It does **not** establish the hosted viewer inside Froggy's iframe sandbox, profile persistence across a redeploy, or any payment.

## Verified locally

- `heavy bun run check:fast`, then `heavy bun run check` — format, type-aware lint, typechecks across ten packages, package boundaries, agent-file and name checks, **452 unit tests** and Knip. All green.
- `heavy bun run e2e --workers=2` — **136/136 passed** in 6.5 minutes, no retries and no flakes. An earlier run of the same suite had one failure, the browser-payment test discussed below, which is why it is no longer there.
- The provider boundary tests cover exact user-profile matching, the real browser metadata, rejection of viewer and CDP URLs outside the provider, refusal of a DevTools socket that leaves the browser's host or drops TLS, capped output with redacted bodies, and the stop reply's final cost.
- `tools/spikes/cloud-cdp-check.ts` remains the CDP fixture harness: it starts a local Chromium, hands the production adapter that browser's DevTools socket through a fixture provider API, and exercises navigation, a native popup returning to its opener, agent refusal during human control, Resume, the first top-level GET 402, replay to 200, and proof isolation across subresources and redirects. Chromium discovery lives in the spike now; nothing Froggy ships can launch a browser.

One Playwright test was removed rather than repaired: `a paid page in the shared Chrome asks and opens its original HTML` drove a local Chrome to a 402 fixture served by the test server itself, on `127.0.0.1`. A hosted browser cannot reach that, and pointing it at a public paywall would spend real money on every suite run. It was replaced by a test asserting the honest new behaviour — with no provider configured, the pane says so and no purchase is invented — and the 402 observe/replay/isolation path it covered is exercised by `tools/spikes/cloud-cdp-check.ts`. This is a real reduction in what Playwright checks, recorded here rather than absorbed.

A fixture run proves the CDP transport and the driver. It is not evidence of provider billing, hosted-viewer compatibility, provider cancellation semantics or a live settlement, and must not be reported as one.

## Still outstanding

Owner access or live money is required for all of these; none was done here.

- A deploy. `BROWSER_USE_API_KEY` and `BROWSER_COUNTRY=us` were set on `froggy → production → app` on 9 September with deploys skipped, so they take effect on the next deploy of this branch.
- Verified model accounting rates for the Token Plan endpoint (`BROWSER_MODEL_INPUT_USD_PER_MILLION` / `..._OUTPUT_...`). Until both are above zero, a browse quote is refused with 503 while the model is live, so **no browsing can be sold** — this is the remaining functional gate.
- The real hosted viewer under the current iframe sandbox: takeover, keyboard, Keep open, and the same page on Resume.
- Profile persistence and isolation across a redeploy, with two accounts.
- Insufficient credit, an interrupted create, and idle expiry actually stopping the provider browser.
- One real browser-triggered x402 purchase with its unlocked page, settlement and receipt, plus rejection, stale navigation and redirect isolation.

Setup steps and the exact dashboard and Railway URLs are in [browser setup](../BROWSER_SETUP.md). Decisions are in [0018](../decisions/0018-browser-use-only.md).
