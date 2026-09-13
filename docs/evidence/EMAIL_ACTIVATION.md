# Live email activation — 12 September 2026

The operator authorized Cloudflare deployment and domain-wide routing for the retired email domain `yoda.fun`, selected `kris@yoda.fun`, and authorized a delivery test to their existing Gmail account. Privy's email lookup verified the owner before the permanent handle was claimed. No authentication bypass or new agent sending authority was added.

## Production configuration

- Cloudflare account: `bceaeae4788dce3493514fde194b4a7e`; zone: `2e72d8c269ec166e88d493c92e818fcd`.
- Worker: `https://froggy-email.kristjan-grm11775.workers.dev`, version `eb98b412-cd19-4526-998e-9706974a66c1`.
- App: `https://app-production-58dd.up.railway.app`; initial activation deployment `161def13-966a-4922-b223-e951e752da29`; callback/shared-pool fix `0352b8e9-ebd9-4dd9-bee0-00b54d3d923a`; final pool-encoding fix `e921b4d8-c5e2-4718-9ad5-bcaf82a1ff6f`.
- Sending domain: `5a8c2728aa984c5d8160f4e1ee8e28f5`, enabled with Cloudflare-managed bounce MX, SPF and DKIM records.
- Routing: enabled, synchronized and ready; catch-all `c735995a78304b3fad8db7722d913c88` invokes `froggy-email`.
- Retired apex SES MX and duplicate apex SPF records were replaced with Cloudflare's supplied records. Unrelated website records were preserved. Public DNS resolved all three Cloudflare MX hosts.
- Private R2 bucket `froggy-email`; incoming and delivery queues use the Worker, with a separate dead-letter queue. No raw-object expiry rule was installed.
- Event subscription `3f08bd7426ce4ddcb4f57860ffcd6f1d` subscribes to `message.delivered`, `message.bounced`, and `message.deferred` for `yoda.fun`.
- The Worker and server use the same generated webhook secret. No token or secret is stored in this evidence or source control. The supplied token enabled sending; the pre-existing token supplied the distinct routing-settings permission.

## Verified live

- Signed Worker/R2 write, read and deletion of a synthetic file.
- Final deployment `e921b4d8-c5e2-4718-9ad5-bcaf82a1ff6f` reached `SUCCESS`; the Gmail reply and delivered PDF remained available after restart.
- A different user could not read the operator’s PDF attachment. Unauthenticated Worker and app email requests returned 401. The PDF draft’s original send acknowledgement remained in its Durable Object, without a resend.
- The permanent mailbox belongs to the verified operator account and is marked `stubbed: false`.
- Recipient webhook accepts the permanent address and an existing draft reply alias, and rejects an unclaimed address.
- The operator confirmed Gmail receipt of the authorized outgoing test.
- The Gmail reply was ingested and attached to the correct Email conversation.
- A fresh PDF sent to the original draft's reply alias passed through actual sending, routing, R2, the incoming queue, the signed server webhook and Postgres. Its recipient delivery event set the draft to `delivered` without manual delivery updates. The inbound PDF parsed as one page with the expected synthetic text. Its temporary raw copy was gone after ingestion.
- Synthetic PDF draft: `emd_01m2br0apzenfsnrytr3nr20mh`; inbound record: `eml_01m2br0k4gfk48j8pv7k9015ya`.
- Original Gmail test: `emd_01m2bpt2djfk69y0ezzq7hxs5p`. Gmail receipt is human-confirmed; its original stored status was still `accepted` during verification, so do not present that as a successful delivery-event test.

## Defects found and fixed

Workers rejects `redirect: "error"`. Gateway callbacks now use `manual`; all non-success responses, including redirects, fail without forwarding credentials or email contents. Regression tests exercise the supported mode and redirect rejection. Queue diagnostics contain only processing stage, fixed status labels and error names.

Drizzle replaces the shared Postgres pool's JSON serializers with identity functions. Email writes now bind validated JSON text as `text` before casting to `jsonb`, avoiding both failed shared-pool writes and double-encoding with standalone pools. The real Postgres regression test writes through both pool configurations and races independent approvals.

During diagnosis the original synthetic attachment was recovered through the email service, and its delivery was recorded only after Cloudflare analytics confirmed it. That recovery is distinct from the subsequent fully automatic PDF round trip. One test mailbox document and one test file record double-encoded by a standalone diagnostic connection were validated and repaired within the operator's mailbox only.

Automatic approval review blocked adding an HTTP consumer to the dead-letter queue. The consumer was not added; older failed test events were left untouched. The production incoming and delivery queues continue using their existing Worker consumer. A separate seven-day raw expiry proposal was also rejected and omitted; successfully ingested raw objects are deleted normally.

## Validation and limits

The isolated email release passed `bun run check`, all 165 browser tests, Worker bundling, and the actual PostgreSQL regression test against an isolated local database. The main workspace passed `bun run check` after the initial email fixes. A later repeat was blocked by concurrent, unrelated React effect lint errors in `apps/web/src/routes/workspace-layout.tsx`; that file was not changed by this activation. Production deployment used an isolated checkout of the production revision plus email changes, preserving concurrent unrelated work in the main workspace.

The live PDF check covers attachment delivery, storage and extraction. No new live model-provider vision request or external-agent email-read session was exercised during activation; those permission paths retain their local test coverage. No claim is made that the older Gmail test's missing delivery event was recovered.
