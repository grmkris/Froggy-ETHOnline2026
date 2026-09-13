# Browser Use hosted agent compatibility pilot

13 September 2026 (Europe/Berlin). The operator authorized trying the hosted agent and asked whether Froggy's injected extension still works. Production was not changed.

## Result

Browser Use Cloud V4 successfully drove a browser while Froggy's actual `WalletBridge` and `walletProviderScript` were attached through a separate CDP connection. No wallet, signing credentials, browser profile, merchant payment credentials or email integration was supplied. The bridge's server callback refused every account/signing request with code 4001.

The hosted agent navigated from `https://example.com` through its information link to `https://www.iana.org/help/example-domains`. The test independently checked the actual browser URL and heading. The provider was present on the resulting page and after reload. A page account request reached the bridge with the Chrome-attributed origin `https://www.iana.org` and was refused. A follow-up hosted-agent run in the same session independently evaluated the page provider and reported `window.ethereum` present and `eth_chainId` equal to `0x2105`, matching the configured production network.

The injected provider is JavaScript installed through CDP, not a packaged Chrome extension. Its availability does not depend on Froggy's model being the browser driver. It does depend on Froggy attaching its bridge to the correct browser and documents.

## Measurements

Model: `gpt-5.6-luna`, explicitly configured with low reasoning. Each run requested `maxCostUsd: 0.25`, with a 150-second local run deadline. Each browser was fresh, proxyless and unprofiled. All pilot browsers were explicitly stopped and read back as stopped.

| Completed run | Observed wall time | Reported agent cost |
| --- | --: | --: |
| Initial navigation, before correcting pilot CDP setup | 17.404 s | $0.005188 |
| Navigation with persistent provider injection | 15.533 s | $0.005232 |
| Same-session provider inspection by hosted agent | 9.336 s | $0.000930 |

The successful navigation's browser-ready event was observed after 2.530 seconds; bridge attachment completed after 4.796 seconds. Times include API/polling overhead and, for navigation, the pilot's bridge setup. They are not direct measurements of first browser action or pure agent execution time.

Reported agent charges totaled $0.011350. Three browser sessions each reported approximately $0.000333333, with zero proxy cost, for approximately $0.012350 total. These are provider API readings, not an audited billing statement. A preliminary run was cancelled before model cost accrued when the event decoder rejected an unexpected field.

## Integration findings

- The actual `browser.ready` event carries `browser_session_id` and `live_view_url`. The pilot initially expected `browser_id`; it cancelled that run, recovered the browser ID from the event, and stopped that browser before retrying.
- `Page.enable` must precede persistent script injection on the pilot CDP session. A local Chromium reproduction showed injection disappearing after navigation without it and surviving with it. Froggy's production tab setup already enables Page; the omission was in the experimental adapter.
- The same provider implementation can be retained. Production adoption still needs browser ownership and new-target initialization integrated with Froggy's existing tab, screencast and origin-attribution lifecycle.
- This test did not attach the x402 `PaymentNavigation` interceptor or connect real signing, purchases, the app's approval UI, or human takeover. It does not establish safe payment handling or immediate cancellation of in-flight browser actions.
- No same-task baseline using Froggy's complete production harness was run. These results establish live compatibility, not a speed advantage. A production switch should follow matched task benchmarks and takeover/payment integration checks.

Machine-readable sanitized evidence: [BROWSER_USE_HOSTED_PILOT.json](BROWSER_USE_HOSTED_PILOT.json). No API keys, CDP URLs or live-view credentials are retained there. The experimental driver remains at `/tmp/froggy-hosted-pilot.mjs`; application source and production configuration were unchanged.

Official references checked: [Create run](https://docs.browser-use.com/cloud/api-v4/runs/create-run), [run events](https://docs.browser-use.com/cloud/api-v4/runs/get-run-events), [browser metadata](https://docs.browser-use.com/cloud/api-v4/browsers/get-browser-session), [cancellation](https://docs.browser-use.com/cloud/api-v4/runs/cancel-run).
