# 0016 — Paid tasks in a hosted shared Chrome

Status: implemented locally; Cloud release remains gated on live verification.

Froggy can host each person's Chrome in Browser Use Cloud while retaining its own agent and payment controls. The runtime stays Bun. `BROWSER_PROVIDER=local` remains the rollback default until the Cloud release checks pass.

## One owner, one driver

This implementation selects the agreed CDP fallback. Browser Use hosts Chrome; Froggy is its only agent. Managed Browser Use execution is not enabled: cancellation status alone does not prove that an outstanding browser action has stopped, and no live integration has established the required cancellation and payment-interception guarantees.

The adapter attaches CDP target sessions with new targets paused. Each tab installs payment observation before resuming script execution. Native popups retain their opener. A serialized driver queue and generation counter invalidate queued agent actions at takeover. The app aborts the run and cancels pending purchases first, then waits for browser actions to finish before exposing human input. Resume disables human input before continuing the existing paid task. A failed Resume returns control to the person.

Provider profile and browser identifiers are durable. Browser creation is marked uncertain before dispatch; an ambiguous response cannot cause a blind replacement purchase. A reconnect retrieves the existing browser identifier. Closing stops the provider browser before releasing the local connection so its profile can persist. This is a single-server driver model; adding concurrent server replicas requires a distributed driver lease.

## Viewer credentials

The authenticated owner obtains the viewer URL from `GET /api/browser/viewer`, with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. External agent tokens and OAuth grants cannot use that endpoint. CDP URLs never reach the browser client, model prompt, task input or replay buffer.

Only `https://live.browser-use.com` may be embedded. The iframe is inert while the agent controls it. Its sandbox permits scripts, forms, popups and downloads, but not `allow-same-origin`. The existing iframe security lint rule remains enabled. Compatibility with the provider viewer under this restriction is a live release gate; no sandbox exception was applied.

Cloud viewers cannot expose their individual input events across origins. Consequently a watched Cloud session still expires after `BROWSER_IDLE_MS` (ten minutes by default) without Froggy activity. While the person controls it, the pane states its closing time and offers an explicit Keep open action. Active server-owned runs extend the idle lease. Ordinary socket pings do not extend it or transfer control.

## A task price and a model allowance are different things

`POST /api/tasks` accepts a browsing budget of $1, $3 or $5. Its frozen quote binds the owner, instruction, request key, price, model allowance, active execution limit and expiry. These purchase a fixed-price service, not a refundable balance:

| Price | Model allowance | Active execution limit |
| --- | --- | --- |
| $1 | $0.50 | 10 minutes |
| $3 | $1.50 | 20 minutes |
| $5 | $2.50 | 30 minutes |
| Legacy request without a budget: $0.50 | $0.25 | 5 minutes |

Invalid budgets fail decoding instead of falling through to the legacy contract. Frozen quotes expire after five minutes. The web card does not sign on quote creation; the person explicitly chooses Pay and browse. Both the card and external agents settle through the same task route. A compare-and-set transition claims settlement before contacting the facilitator. Signed proofs, sales and execution are deduplicated. Uncertain outcomes stay retrievable and never automatically purchase again.

Task progress persists consumed model allowance, steps, active time and a bounded partial result. A model request reserves a conservative prompt/output estimate before dispatch; actual token usage adjusts the reservation afterward. Missing usage keeps the reservation. Paid model calls disable automatic retries. Input and output rates must be configured for a live model before a quote can be sold. The configured rates must cover the provider's applicable context and reasoning tiers; a reservation is not a provider-side billing limit.

Human approval waits do not consume active execution minutes. Takeover pauses the task, and Resume uses its remaining purchased allowance. Budget exhaustion does not initiate another charge. Failures and aborts are reported without claiming a refund.

Browser time and network costs belong to Froggy. The browser profile record separately accumulates reported hosting costs and counts sessions whose costs were not reported. These values never masquerade as the task's model budget or the user's wallet balance. Provider billing remains authoritative, particularly where final usage reporting is delayed.

## Website payments remain separate

Only top-level GET 402 navigation is intercepted. Each payment still passes through Froggy's purchase approval, policy, signing and receipt services. Payment proof is confined to the approved navigation, with redirect and subresource isolation. Stale navigation and takeover invalidate pending replay. Browser Use receives no wallet credentials or spending authority. Existing typed GET/JSON POST purchase tools continue to use their own authorization path.

A task, its x402 sale, its model usage, hosting costs and website-purchase receipts remain distinct records.

## Release gate

Before setting Cloud as the production default, configure `BROWSER_USE_API_KEY` and the configured model's verified `BROWSER_MODEL_INPUT_USD_PER_MILLION` and `BROWSER_MODEL_OUTPUT_USD_PER_MILLION`. Then verify the embedded live viewer, keyboard takeover, native popups, profile persistence, reconnect, provider expiry/outages, and a real browser-triggered x402 purchase with a matching receipt. Run the repository and browser gates against a stable checkout, migrate the database, deploy to the existing Railway app, and repeat the checks there. Missing credentials or a stub cannot substitute for these checks.
