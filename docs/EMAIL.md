# Froggy email

## Product flow

The welcome flow offers an optional fourth step, “Give Froggy an email address,” after Notifications. It reuses the Account enrollment controls, previews the full server-configured address, and explains that the handle is permanent. Claiming shows an address-ready state with copy feedback before continuing. “Do this later” leaves the mailbox unclaimed and Home shows a link to finish in Account; loading or provider errors do not block leaving the step. Returning users see their existing address.

In Account, claim a permanent handle. Local development displays `@froggy.test` and “Demo email · no real delivery”; live configuration supplies the actual domain. The Home email link opens the Email conversation. Messages, files, draft review and task continuation live in conversations, without an Inbox navigation item.

Use New email or ask Froggy to prepare a draft. Save the draft, review From, To, Cc, Bcc, body and files, then Approve and send. Editing increments the revision; an older approval is refused. An accepted status means the provider accepted the send request. Delivered requires a terminal success for every recipient. Uncertain is never retried automatically.

The agent can read email, create PDF/text files, prepare drafts and register a task alias. A run can wait for up to 60 seconds; late mail offers Continue. Verification links must belong to the expected service. Mail content is never task or payment authority.

## Implementation

- `packages/email`: ownership, quotas, MIME parsing, documents, Postgres/memory stores and signed transports.
- `apps/email-worker`: inbound routing, private R2 objects, queues, delivery events and durable send claims.
- `apps/server/src/email-routes.ts`: authenticated human API and signed ingestion endpoints.
- `apps/server/src/email-tools.ts`: bounded built-in tools and explicitly scoped connected-agent capabilities.
- `apps/web/src/components/email`: account enrollment and conversation mail cards.
- Migration `0022_hard_psynapse.sql`: mailboxes and owned email records.

## Activation

Activated on the operator-owned `yoda.fun` domain on 12 September 2026. Cloudflare Email Sending and Routing are enabled; the apex MX/SPF records replace the retired SES/registrar setup. The catch-all invokes `froggy-email`, which checks claimed recipients against Froggy before accepting mail. Private R2 storage, incoming/delivery queues, matching webhook secrets and migration `0022` are configured. The operator confirmed the Gmail test arrived. See [live activation evidence](evidence/EMAIL_ACTIVATION.md) for verification and remaining limits.

1. Own `yoda.fun` and add it to the intended Cloudflare account. Enable Email Routing and Email Sending for that domain. Use the DNS records supplied by Cloudflare for MX, SPF, DKIM and sending-domain verification; configure DMARC after checking the actual domain setup. Do not copy guessed DNS values.
2. Create private R2 bucket `froggy-email`, queues `froggy-email-incoming`, `froggy-email-delivery`, and `froggy-email-dead-letter`. Leave automatic expiry disabled. Ingestion removes successfully processed raw copies; unprocessed mail remains available for recovery until explicitly deleted.
3. Set Worker `GATEWAY_URL` to the deployed Froggy origin and `EMAIL_DOMAIN=yoda.fun`. Store a fresh random `EMAIL_WEBHOOK_SECRET` of at least 32 characters using Wrangler secrets. Do not put the secret in `wrangler.toml` or source control.
4. Review `apps/email-worker/wrangler.toml`, then deploy that workspace. Configure Email Routing catch-all to this Worker. Subscribe the domain's delivered, bounced and deferred Email Sending events to `froggy-email-delivery`.
5. Configure the server's `EMAIL_DOMAIN=yoda.fun`, `EMAIL_WORKER_URL` to the Worker HTTPS origin and the same `EMAIL_WEBHOOK_SECRET`. A real `DATABASE_URL` is required. Apply normal database migrations before deploying the server. The Dockerfile includes both new workspace manifests and the PDF assets.
6. Verify using two operator-owned test mailboxes: claim collision, inbound message and attachment, reply threading, human approval, recipient delivery events, restart recovery, user isolation and deletion. Inspect the configured model's image/PDF reading path. Confirm demo markers are absent only for the real adapters.

Cloudflare's [Workers sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) documents the structured sending binding and returned message ID. [Email event subscriptions](https://developers.cloudflare.com/email-service/platform/event-subscriptions/) document recipient lifecycle events. These provider contracts were checked on 12 September 2026. Event-subscription API names are `message.delivered`, `message.bounced` and `message.deferred`; received event types include the `cf.email.sending.` prefix.

## Operations

Monitor incoming/delivery queue age, retries and dead-letter count, Worker failures, R2 usage, and database drafts stuck in sending or uncertain. Avoid logging email bodies, attachments, secrets or verification links. Subscription configuration should select only the events currently decoded by the Worker; unsupported event types are retried and end in the dead-letter queue.

Maintenance runs at startup and every minute. It retries tombstoned object deletion and checks stalled send attempts. For an uncertain send, use its draft ID to find the Durable Object attempt and correlate the provider ID in Email Sending logs. A recorded acknowledgement can recover automatically. If no acknowledgement exists, investigate before the person creates a replacement; never replay the external send blindly.

Disabling a mailbox stops receipt and new approvals but reserves its handle. Deleting messages clears their content and files. Deleting a conversation also tombstones its drafts and cancels waits. Account deletion disables the address and clears mail content, while minimal tombstones and send accounting remain. Parsed body text is capped at 64,000 characters; up to 20 incoming attachments are retained, with a visible truncation marker for excess content. Text extraction reads five PDF pages at a time and caps the model payload.

Email-read permission covers the whole mailbox. A connected agent with only email-draft permission cannot read files. Human approval remains available only through the authenticated app API. Revocation takes effect on subsequent authenticated requests.

## Local verification

```sh
bun test packages/email apps/server/src/email-tools.test.ts
bun run check:fast
bun run check
bun run e2e
cd apps/email-worker
WRANGLER_SEND_METRICS=false bunx --bun wrangler deploy --dry-run --outdir /tmp/froggy-email-worker-build
```

For the Postgres test, migrate a disposable database first and set `FROGGY_TEST_DATABASE_URL` to it. The test races independent connection pools for the same handle and draft approval; it never truncates an existing table. Do not point it at production.

### Verification on 12 September 2026

The email/server run passed 689 tests, with two optional database suites skipped. The email Postgres suite passed separately against a freshly migrated disposable database, including first-use user creation and independent-pool races. All 165 browser tests passed; the final desktop/mobile email flows also passed after the last changes. Worker dry-run bundling and the production Docker build passed, and 20 email tests passed inside that image, including PDF processing. Scoped type-aware email lint is clean.

The isolated email release passed `bun run check` and all 165 browser tests. The main workspace also passed the gate during activation; its latest repeat was blocked by concurrent React effect lint errors in `apps/web/src/routes/workspace-layout.tsx`, outside the email release. An additional real Postgres regression test exercises the JSON serializer overrides applied by Drizzle to the shared production pool. Email writes bind explicit JSON text with a `jsonb` cast, so both standalone and shared pools behave identically. Worker callback tests cover its supported manual redirect mode and rejection of redirect responses. Live attachment/model-provider checks are reported separately from local tests.
