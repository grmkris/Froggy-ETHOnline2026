# Enable Browser Use Cloud

The application supports Browser Use Cloud with Froggy driving Chrome over CDP. It does not require a Browser Use hosted agent or a second model key.

## Browser Use dashboard

1. Sign in at <https://cloud.browser-use.com/> and select the project intended for Froggy.
2. Add billing credit or an appropriate subscription. Check the project's concurrent browser and persistent profile limits: Froggy creates one isolated profile per user. A small profile allowance is suitable for a private trial, not an unrestricted public launch.
3. Create a project API key in [Settings → API keys](https://cloud.browser-use.com/settings?new=1&tab=api-keys). Copy it directly into Railway; never put it in chat, Git, or a frontend variable.
4. Leave browser recording disabled unless you deliberately want recordings of user sessions. Froggy creates and stops browsers and manages profiles through the API; no manual browser creation is needed.

See the provider's [browser quickstart](https://docs.browser-use.com/cloud/browser/quickstart), [live preview documentation](https://docs.browser-use.com/cloud/browser/live-preview), and [pricing](https://browser-use.com/pricing).

## Railway configuration

Open the existing **froggy → production → app → Variables** panel and set:

```dotenv
BROWSER_USE_API_KEY=<the project key>
BROWSER_COUNTRY=us
```

Before enabling Cloud, configure nonzero model accounting rates:

```dotenv
BROWSER_MODEL_INPUT_USD_PER_MILLION=<verified input rate>
BROWSER_MODEL_OUTPUT_USD_PER_MILLION=<verified output rate>
```

The existing Qwen endpoint uses Alibaba Token Plan. That plan consumes credits; do not label standard pay-as-you-go prices as the actual subscription charge. Choose and document the accounting rates for that plan, or configure matching pay-as-you-go credentials and endpoint with published rates. Endpoint and key must belong to the same billing mode. See [Alibaba's Token Plan setup](https://www.alibabacloud.com/help/en/model-studio/token-plan-quick-start).

For a controlled Cloud trial, set `BROWSER_PROVIDER=cloud` and deploy the variables. Keep `BROWSER_PROVIDER=local` until ready to run that trial. Merely setting the key does not switch providers. Missing credentials select a visibly marked stub, not a live Cloud session.

## Live acceptance

1. Sign in to Froggy, quote a browser task and explicitly approve its purchase. Confirm the real session appears in the Browser Use dashboard and the allowance is recorded.
2. Navigate, take control, type, open a login popup, and resume the agent. Confirm the hosted viewer accepts human input only after takeover and that Resume preserves the page.
3. Reload Froggy, then stop and reopen the browser. Confirm the same user's profile persists and a different user receives an isolated profile.
4. Exercise Keep open and idle expiry. Confirm the provider session is actually stopped; closing an iframe alone does not stop billing.
5. Check reported browser/proxy costs and model allowance. Test insufficient credit and an interrupted provider request without allowing a duplicate purchase.
6. Exercise one real browser-triggered x402 purchase and verify the unlocked page, settlement and receipt. Also check rejection, stale navigation and redirect isolation.

The local tests cover fixture behavior and native local CDP. They cannot establish real provider billing, actual hosted-viewer compatibility, or live payment settlement. These checks remain necessary before enabling Cloud for everyone.

The deployment runs database migrations through Railway's pre-deploy command. No separate database reset is needed. To roll browser creation back to local Chrome, restore `BROWSER_PROVIDER=local` and redeploy; verify any existing Cloud sessions have stopped in the provider dashboard.
