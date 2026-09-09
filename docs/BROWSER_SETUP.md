# Configure the browser

Browser Use is the browser. There is no local Chrome, no provider switch and no fallback: with no key the pane refuses to open a browser and says so, and the wallet pane marks `browser=stub`. Froggy creates the browser, drives it over the CDP endpoint the provider publishes, and stops it — Browser Use runs no agent of its own here, and Froggy's own model remains the only thing driving the page.

## Browser Use

1. Sign in at <https://cloud.browser-use.com> and pick the project this deployment should bill to. The API key belongs to a project, and browsers, profiles and credits all live inside it.
2. Add credit at <https://cloud.browser-use.com/billing>. Hosted browsers are billed by the hour, and Froggy stops a browser nobody is watching, so the cost tracks real use rather than sign-ins. Published rates at <https://browser-use.com/pricing>: **$0.02/browser-hour**, managed
   residential proxy **$5/GB**, direct or own proxy **$0.20/GB**. A free project allows **10 concurrent sessions** — keep `MAX_BROWSERS` at or below the project's concurrency limit, or the ninth person's browser fails to start instead of queueing.
3. Create the key at <https://cloud.browser-use.com/settings?tab=api-keys&new=1>. Keys are prefixed `bu_`. Paste it straight into Railway; never into chat, a frontend variable or Git.
4. Leave session recording off unless recordings of people's browsing are wanted; Froggy creates browsers with `enableRecording: false` and never turns it on. Nothing has to be created by hand: Froggy creates one profile per signed-in user and one browser per seated user, labelled `app=froggy` in the dashboard's browser history.

Provider documentation: [browser quickstart](https://docs.browser-use.com/cloud/browser/quickstart), [live preview](https://docs.browser-use.com/cloud/browser/live-preview), [bring your own automation](https://docs.browser-use.com/cloud/browser/playwright-puppeteer-selenium).

## Railway

**froggy → production → app → Variables:** <https://railway.com/project/d6f4178e-fc21-4827-8347-20b1cec2aba4/service/393648df-65e9-4491-87f3-1b896c736b9f/variables?environmentId=44c2247f-e0a2-43f8-9b46-586a29126157>

Set:

```dotenv
BROWSER_USE_API_KEY=<the bu_ project key>
BROWSER_COUNTRY=us
```

Both are set on `froggy → production` as of 9 September 2026; the key was entered through this panel and is not in Git.

`BROWSER_COUNTRY` is the country the hosted browser is proxied through. `us` is set because sites that matter for the demo refuse datacentre addresses, and a browsing session moves tens of megabytes — call it a few cents at the managed residential rate of $5/GB. Set it to `none` to run with no proxy at all, which costs nothing extra and is the right choice if reliability turns out not to need it.

A paid browse task cannot be sold with a live model until both model accounting rates are above zero. Set on `froggy → production` as of 9 September 2026:

```dotenv
BROWSER_MODEL_INPUT_USD_PER_MILLION=2.00
BROWSER_MODEL_OUTPUT_USD_PER_MILLION=6.00
```

These price **Froggy's own model**, not Browser Use: they are what a browse task's model allowance is drawn down against, and the direction of error matters. Too high and the allowance runs out early — the task stops sooner than it needed to and the margin is intact. Too low and the task keeps running past what its price covered, and the difference comes out of Froggy. So what belongs here is a **ceiling on what a token can cost us**, not a best guess.

$2.00 / $6.00 is the published list rate for `qwen3.8-max`, flat across its whole context window — there are no longer-context tiers to overshoot, and its prompt-cache and batch discounts only ever make the real cost lower. This deployment buys that model through Alibaba's **Token Plan**, a prepaid credit balance, and a prepaid plan does not consume credits at more than list value per token. So list is an honest upper bound, and it is deliberately labelled as one rather than presented as the plan's actual rate.

If the Token Plan console shows a different consumption rate, use that number and say so here. If browse tasks start ending earlier than they should, that is this ceiling doing its job, and the fix is the real rate rather than a smaller guess. The alternative is to point `OPENAI_COMPATIBLE_*` at pay-as-you-go credentials with published rates; the endpoint and the key must belong to the same billing mode.

A worked figure, so the economics are visible: at these rates a browsing step of roughly 20k prompt tokens and 500 output tokens costs about $0.043, so a $1 task's $0.50 allowance buys about eleven steps. Browser time for a ten-minute task is $0.0033. The model is the expensive part; the browser is not.

Remove these, which no longer exist:

```dotenv
BROWSER_PROVIDER      # there is one provider
CHROME_PROFILE_DIR    # profiles live at Browser Use
FROGGY_CHROME         # nothing here launches a browser
```

None of the three is set on `froggy → production` today, so on that service this is a check rather than an edit.

The `browser-profile` Railway volume is no longer written to. It is still declared in `.railway/railway.ts` because removing the declaration deletes the volume, which is the owner's call; delete it in the dashboard once this migration has been accepted in production.

## What each value does

| Variable | Where it comes from | Effect if unset |
| --- | --- | --- |
| `BROWSER_USE_API_KEY` | Browser Use → Settings → API keys | Browser is stubbed; the pane refuses to open one and `browser=stub` shows in the wallet pane |
| `BROWSER_COUNTRY` | Chosen. `none` for no proxy | Defaults to `us`, which bills the residential proxy per GB |
| `BROWSER_MODEL_INPUT_USD_PER_MILLION` | A ceiling on the configured model's own cost. `2.00` for `qwen3.8-max` | A browse quote is refused with 503 while the model is live |
| `BROWSER_MODEL_OUTPUT_USD_PER_MILLION` | Same. `6.00` | Same |
| `MAX_BROWSERS` / `RESERVED_BROWSERS` / `BROWSER_IDLE_MS` | Chosen | 8 seats, 1 held for the demo account, 10-minute idle release. Keep `MAX_BROWSERS` under the provider's concurrency limit |

## Live acceptance

Local tests and `tools/spikes/cloud-cdp-check.ts` cover the driver, takeover and payment observation against a local Chromium and fixture HTTP. They cannot establish provider billing, hosted-viewer compatibility or a real settlement. These remain to be done against the deployment, by someone with the accounts:

1. Sign in, quote a browse task and approve its charge. Confirm a browser appears in the Browser Use dashboard labelled `app=froggy`, and that the allowance and the sale are recorded.
2. Navigate, take control, type, open a login popup, and Resume. Confirm the hosted viewer accepts input only after takeover and that Resume keeps the page.
3. Reload Froggy, then stop and reopen the browser. Confirm the same person's profile persists and a second person gets an isolated one.
4. Exercise Keep open and idle expiry. Confirm the provider session actually stops — closing the iframe alone does not stop the billing.
5. Check the reported browser and proxy costs against the dashboard, and the model allowance against the task. Test insufficient credit and an interrupted provider request without allowing a duplicate purchase.
6. Exercise one real browser-triggered x402 purchase: the unlocked page, the settlement and the receipt, plus rejection, stale navigation and redirect isolation.

Migrations run through Railway's pre-deploy command; no database reset is needed. There is no rollback to local Chrome — that code is gone. The rollback is to clear `BROWSER_USE_API_KEY`, which stubs browsing loudly and leaves the rest of the product working; confirm in the provider dashboard that no browser is still running.
