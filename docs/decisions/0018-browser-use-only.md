# 0018 — Browser Use is the only browser

Status: implemented; live acceptance on the deployment is still outstanding.

Supersedes the provider selection in [0016](0016-paid-cloud-browser.md). Everything 0016 says about the driver, arbitration, task pricing and payment isolation still holds; what changes is that there is no longer a second implementation to select between, and no `BROWSER_PROVIDER` to select with.

## One browser, not a choice of two

Local Chrome is removed: the `Bun.WebView` launch, Chromium detection, the profile-lock recovery, the popup re-opening workaround, the per-user worker process and its IPC protocol, the Chromium layer in the image and the profile volume it wrote to. A browser is a Browser Use hosted browser or it does not exist. A missing `BROWSER_USE_API_KEY` selects the loud stub, exactly as every other integration in this repository does; it does not select a different way of getting a page.

The reasons to keep the local path had expired. Its isolation argument — render hostile pages in a process that holds no secrets — is better served by rendering them on someone else's machine entirely. Its popup workaround lost `window.opener` and turned a form POST into a bare GET, which the hosted path does not, because targets are auto-attached rather than re-opened as tabs we own. And a second implementation that nothing ran was a second implementation to keep true.

Froggy remains the only agent driving the page. Browser Use publishes a CDP endpoint for exactly this — its Browser API is the "bring your own automation" product, distinct from its hosted Agent API — so the screencast, the arbitration gate, the capped snapshots and the payment observation are unchanged. The hosted Agent API is deliberately not used: it would replace the per-step approval and the CDP-level 402 interception that the leash is built on, and the provider's own x402 support pays _Browser Use_, not a paywalled page the agent has reached.

## What the provider actually returns

Both facts below were established against a live browser on 9 September 2026, and both contradicted the fixtures written from the documentation alone.

`cdpUrl` is `https://<browser id>.cdp.browser-use.com` — an HTTPS endpoint, not a socket. The previous validation required `wss:` and would have rejected every real browser as an invalid CDP origin. The socket to attach to is the one Chrome names at `/json/version` on that host; it is resolved per connection, validated to be `wss:` on the same host, and never persisted. That host is reached without the API key: the URL is itself the credential, and the key has no business travelling to it.

Browsers, profiles and billing are `/api/v3`, the version whose published client exposes browser get and stop and profile CRUD. `/api/v4` is the agent API. The previous code addressed profiles and browser reads at `/api/v4`.

The stop reply carries the browser's final `browserCost` and `proxyCost`, so stopping a browser is also the accounting read, and a stop that fails keeps the browser's id in the record — a browser nobody can stop is a browser the provider keeps billing for.

## What the seat cap is now for

`MAX_BROWSERS` used to bound this container's memory, at half a gigabyte of Chrome each. It now bounds money and the provider's concurrency limit: every seated browser bills by the hour, and a free project allows ten at once. The idle release is no longer a tidy-up, it is the thing that stops an abandoned tab billing all night. Set `MAX_BROWSERS` at or below the project's concurrency limit, or the browser past it fails instead of queueing.

Browsing is paid-only everywhere, rather than only under the cloud provider. Every page now costs the operator money, so there is no configuration in which a free browse is correct.

## What the provider is told

A profile is created per signed-in user, named by a SHA-256 hash of the Privy DID. Browsers are labelled `app=froggy` with that profile id, which is what makes the provider's dashboard legible without putting anyone's identity in it. Browser Use receives no wallet credentials and no spending authority; page payments still pass through Froggy's approval, policy, signing and receipt path unchanged.
