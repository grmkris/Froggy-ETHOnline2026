# Try real x402 purchases

Froggy chat, the shared Chrome and connected agents use the same purchase record, human approval and spending checks. Use the [deployed workspace](https://app-production-58dd.up.railway.app) for the mainnet demo. On 8 September 2026 the owner explicitly requested real mainnet operation; the local stub launcher below is only a development fixture.

## Mainnet workspace

Sign in at **https://app-production-58dd.up.railway.app**. Under **Services → Wallets for URL purchases**, check the displayed wallet and balance. Production is configured for Base mainnet, Solana mainnet and Hedera mainnet. Base and Solana purchases require USDC in the person's displayed wallet on that chain. A missing Solana wallet can be created through the owner's **Create Solana wallet** control. Selecting a network does not fund it.

For the first external purchase, use **Services → Pay a URL**, paste this URL, set the maximum to **$0.01**, then request the purchase:

```text
https://pro-api.coingecko.com/api/v3/x402/simple/price?ids=bitcoin,ethereum&vs_currencies=usd
```

Review the fresh quote and click **Pay once**. The observed quote on 8 September was $0.01 USDC on Base or Solana mainnet. A purchase is complete only when the saved result and receipt show the outcome. Keep the same purchase after a failed or uncertain attempt; do not create another charge to work around it.

To request the same flow from Froggy chat:

```text
Use x402_fetch to GET https://pro-api.coingecko.com/api/v3/x402/simple/price?ids=bitcoin,ethereum&vs_currencies=usd with purpose "Read current Bitcoin and Ethereum prices", idempotencyKey "coingecko-mainnet-1", and maxUsdMicros 10000. Wait for my approval in Froggy, then summarize the result and show the purchase ID and receipt. Do not create a new purchase if this one fails or is uncertain.
```

For shared Chrome, open [the public seller](https://app-production-58dd.up.railway.app/demo/x402) **inside Froggy's browser**, then choose **Open the paid report**. The deployed report advertises **0.05 HBAR on Hedera mainnet**. Froggy detects the 402 response and shows the approval; the original Chrome tab receives the paid page after successful payment and delivery. This uses the person's configured Hedera funding path. Opening the URL in an ordinary browser only shows its payment page.

Connect Claude Code to production:

```bash
claude mcp add --transport http froggy https://app-production-58dd.up.railway.app/mcp
```

Authenticate with the **pay** scope and keep Froggy open for approval. Ask Claude to call `froggy_x402_request` with:

```json
{
  "url": "https://pro-api.coingecko.com/api/v3/x402/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
  "method": "GET",
  "purpose": "Read current Bitcoin and Ethereum prices",
  "idempotencyKey": "coingecko-mainnet-mcp-1",
  "maxUsdMicros": 10000
}
```

Claude then polls `froggy_x402_status` with the returned `purchaseId`. Approval belongs to the signed-in person in Froggy. Each distinct example is a separate intended purchase; use one example for the first payment.

Current deployment and paid-proof status are recorded in [mainnet verification](evidence/X402_MAINNET_VERIFICATION.md). The live 402 probes prove offer discovery; they do not establish owner signing, settlement or paid delivery.

## Optional local fixture with simulated payments

From the repository root, with Bun installed:

```bash
bun install
bun run demo
```

Open **http://localhost:3400**. This isolated launcher runs the server on port 3401 and the web app on 3400, pins all payment providers and the model to stubs, uses an in-memory database, and keeps its Chrome profile in `.froggy/x402-demo`. It overrides inherited live provider settings for the child processes without editing your `.env`. **Ctrl+C** stops both servers. Simulated results and receipts say **STUB** or **Simulated**. Never fund a simulated address.

The web app proxies API, OAuth, MCP and demo requests. Use the same `http://localhost:3400` origin throughout the recipes below. Purchases survive page reloads in the running demo process but disappear when it restarts.

For your configured development app, use the normal launcher instead:

```bash
# On a fresh checkout only; preserve an existing .env.
cp .env.example .env
bun dev
```

That app uses **http://localhost:3000**, server port 3001 and `APP_ORIGIN=http://localhost:3000`. Replace port 3400 with 3000 in the recipes when using it. Existing shell variables or an existing `.env` can enable live providers, so check the wallet/provider labels before approving. To exercise persistence across restarts, configure a local Postgres database and run `bun run db:migrate` before starting this normal development server. The purchase-table migration is included. Local databases must apply it before purchase requests are stored.

The free seller landing page is **http://localhost:3400/demo/x402**. Its paid resource is **http://localhost:3400/demo/x402/report**. It sells a USDC lending report for 0.05 HBAR on the configured Hedera network. With placeholder providers the payment and market observations are simulated. Opening the paid URL in an ordinary browser shows the seller's 402 page; automatic detection happens inside Froggy's shared Chrome.

The simplest model-free check is **Services → Pay a URL → Use demo report → Request purchase**. Review the approval above the workspace and choose **Pay once**. The result appears under **URL purchases**, with payment and delivery reported separately. Reload while awaiting approval to check that the same ticket returns. Choose **Deny** on a separate request to check that it ends without a payment.

## 1. Froggy chat

For the keyless local demo, paste this into chat:

```text
Buy http://localhost:3400/demo/x402/report for at most $0.05 and wait for my approval.
```

The scripted model recognizes an explicit `/demo/x402/report` URL on the configured app origin and issues real `x402_fetch` and `wallet_status` tool calls. The purchase still waits for human approval. Its closing message says it is scripted and does not interpret the report. This path is limited to the local demo URL; it does not handle arbitrary merchant prompts.

The isolated demo intentionally keeps its model scripted. For a conversational summary or another merchant, use the normal `bun dev` app and configure `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL` and `OPENAI_COMPATIBLE_MODEL`, or `ANTHROPIC_API_KEY`, then use:

```text
Use x402_fetch to buy http://localhost:3400/demo/x402/report with GET, purpose "Read the Pond Observatory USDC lending report", idempotencyKey "pond-chat-1", and maxUsdMicros 50000. Wait for my approval in Froggy. Then explain the returned report and show its purchase ID and receipt. Do not create another purchase if this one fails or is uncertain.
```

The chat tool waits while the approval is visible. Check the exact URL, quote, recipient and network, then click **Pay once**. The agent receives bounded seller text after completion. To see the report as its original page, use the Chrome recipe below.

## 2. Shared Chrome

1. Open Chat and choose **Show the browser**.
2. Enter `http://localhost:3400/demo/x402` in the shared browser's **Address** field.
3. In the seller page, open **Open the paid report**. Alternatively navigate directly to `http://localhost:3400/demo/x402/report`.
4. Froggy detects the actual top-level GET 402 response. Review **Approve URL purchase** and click **Pay once**.
5. The existing Chrome tab becomes **Your USDC lending report · Pond Observatory**. Cookies remain in that Chrome session. Find the matching purchase and receipt under Services.

To let a configured chat model drive the same journey:

```text
Open http://localhost:3400/demo/x402/report in the shared browser and buy the USDC lending report for at most $0.05. Wait for my approval, then explain the page that opens. Do not retry a failed or uncertain payment.
```

Moving to another page while approval waits invalidates the captured request. Return to the paid page to discover a fresh quote. Browser replay currently supports a top-level GET only: background fetches, subresources, forms and browser POSTs are not replayed as purchases. A generic HTML payment page without a supported x402 quote cannot be signed.

## 3. Claude Code over MCP

Run Claude Code on a machine that can reach the local workspace:

```bash
claude mcp add --transport http froggy http://localhost:3400/mcp
```

Authenticate the connection through Claude Code's MCP sign-in flow. In Froggy's consent page, allow the **pay** scope. Keep Froggy open for human approvals. A remote or containerized Claude Code process needs a reachable Froggy origin; its own `localhost` may be a different machine.

Ask Claude Code:

```text
Call Froggy's froggy_x402_request with the JSON below. Tell me the returned purchase ID and wait for me to approve in Froggy. Poll froggy_x402_status for that same purchase; do not issue a new purchase when the status is pending, failed or uncertain.

{"url":"http://localhost:3400/demo/x402/report","method":"GET","purpose":"Read the Pond Observatory USDC lending report","idempotencyKey":"pond-mcp-1","maxUsdMicros":50000}
```

Approve the visible ticket in Froggy. Status lookup uses:

```json
{ "purchaseId": "<the returned pur_… ID>" }
```

Only the requesting connection and the signed-in person can retrieve that connection's purchase. An external agent can request and read purchases; it cannot approve, cancel through the owner controls, create a Solana wallet or change spending authority. Closing the MCP connection detaches the client from server-owned work. Revoking its Froggy connection before sending prevents the purchase from proceeding.

The equivalent API is `POST /api/purchases` with the same fields plus `"v":1`; read it at `GET /api/purchases/<id>`. Agent requests require `pay` scope. The API and MCP calls create the same kind of record as chat and Chrome.

## Fund a live Base or Solana purchase

Use the normal `bun dev` app for real external merchants; `bun run demo` always pins simulated providers. Real external merchants require live Privy configuration and the person's funded embedded wallet. Set `PRIVY_APP_ID`, `PRIVY_APP_SECRET` and the matching public `VITE_PRIVY_APP_ID`, enable embedded Ethereum wallets on login in Privy, and allow the workspace origin. Sign in as the person who will approve the purchase.

**Services → Wallets for URL purchases** shows the configured network, funding address and balance. The existing Ethereum wallet receives Base USDC. If the Solana wallet is missing, the person can click **Create Solana wallet**, then fund its displayed address with USDC on the displayed Solana network. A positive-balance **Ready** badge is a setup indicator; it does not promise enough balance for every quote. Solana balance checks use the wallet's standard associated USDC token account.

Choose networks in `.env`, then restart the server:

| Payment asset | Fresh-checkout network | Mainnet setting |
| --- | --- | --- |
| Base USDC | `EVM_NETWORK=eip155:84532` (Base Sepolia) | `EVM_NETWORK=eip155:8453` |
| Solana USDC | `SOLANA_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (devnet) | `SOLANA_NETWORK=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Hedera HBAR | `HEDERA_NETWORK=hedera:testnet` | `HEDERA_NETWORK=hedera:mainnet` |

`EVM_RPC_URL` and `SOLANA_RPC_URL` optionally select RPC endpoints for their configured networks; empty values use network defaults. Hedera's facilitator follows `HEDERA_NETWORK` unless explicitly configured. Changing a setting does not move funds between chains. Test USDC is separate from mainnet USDC, and the Base balance is separate from the Solana balance. Fund the displayed address on the intended network before approving a real purchase.

Base uses x402 v2 `exact` USDC with EIP-3009 authorization. Solana uses x402 v2 `exact` USDC transactions with the offer's facilitator fee payer. Unsupported schemes, assets or networks fail with no signature. A tool can include `network` to request one configured network explicitly.

**Pay once** binds the approved request and quote. For Base and Solana the server uses the authenticated person's Privy authorization for one signing operation; it does not grant a merchant permanent agent authority. Wallet-level Privy restrictions still apply. Neither the model nor the browser worker receives the person's signing credential. Existing Hedera account/funding prerequisites still apply to live Hedera purchases.

## Other real resources to try

These endpoints were probed without payment on 8 September 2026. The observed price is not a guarantee of the next quote. See [the probe evidence](evidence/X402_DEMO_PROBES.md) for primary documentation, recipients and limitations.

| Resource | Exact request | Observed offer |
| --- | --- | --- |
| Bitcoin and Ethereum prices | `GET https://pro-api.coingecko.com/api/v3/x402/simple/price?ids=bitcoin,ethereum&vs_currencies=usd` | $0.01 USDC; Base or Solana mainnet |
| PayAI Echo on Base | `GET https://x402.payai.network/api/base/paid-content` | $0.01 USDC; Base mainnet |
| PayAI Echo on Solana | `GET https://x402.payai.network/api/solana/paid-content` | $0.01 USDC; Solana mainnet |
| PayAI Echo on test networks | `GET https://x402.payai.network/api/base-sepolia/paid-content` or `GET https://x402.payai.network/api/solana-devnet/paid-content` | 10,000 test USDC units on the named network |
| Exa web search | `POST https://api.exa.ai/search` | $0.007 USDC; Base or Solana mainnet |
| Nansen smart-money netflow | `POST https://api.nansen.ai/api/v1/smart-money/netflow` | $0.05 USDC; includes Base and Solana mainnet |

For CoinGecko, replace the demo URL in any of the three recipes with the complete URL above, use a distinct key such as `coingecko-prices-1`, and keep `maxUsdMicros` at `50000` ($0.05). Its observed quote omits the query in the displayed resource URL; Froggy still binds the actual full requested URL, including the query. A new quote must match a configured and funded network.

PayAI returned a machine-readable challenge only with `Accept: application/json`, which Froggy's server purchase requests send. An ordinary Chrome HTML navigation returned a generic payment page without that header, so use chat, MCP or the Services URL form for those Echo URLs. No refund behavior was validated.

No independent external Hedera GET merchant was verified in this pass. Use the local report for the deterministic Hedera flow; external Hedera payment claims need separate evidence.

## JSON POST: approve the input, then the payment

Use **Services → Pay a URL → JSON POST**, chat `x402_fetch`, or MCP `froggy_x402_request`. The JSON input is limited to **16 KiB**. Agents cannot supply arbitrary headers, cookies or credentials.

For example, request Exa through MCP with:

```json
{
  "url": "https://api.exa.ai/search",
  "method": "POST",
  "body": "{\"query\":\"Hedera x402 protocol official documentation\",\"numResults\":1}",
  "purpose": "Find one official Hedera x402 reference",
  "idempotencyKey": "exa-reference-1",
  "maxUsdMicros": 50000
}
```

The first ticket says **Send input & get price**. Approving it sends the displayed JSON to that exact URL to obtain the quote, without paying. If the seller returns a supported 402, a second ticket says **Pay once** and displays the payment terms. The paid request uses the same JSON. A stale first approval cannot answer the second ticket. If the seller answers successfully for free, there is no payment ticket.

For Nansen, use the listed netflow URL with `body` equal to `{"chains":["ethereum"]}` and an appropriate ceiling of at least the fresh quote. Seller input is data disclosure: decline the first ticket if it should not leave Froggy.

## Read the outcome and retry safely

Every purchase is capped at **$1**, and purchases sharing a run are capped at **$2** or a lower existing run budget. These ceilings remain even when `SPENDING_LIMITS=false`; current mandate rules and available funds also apply. Approval expires after five minutes. Human consent covers the exact origin, full URL and query, method, canonical JSON body, recipient, network, token, amount and signing parameters.

The coordinator follows no redirects during discovery or payment, including same-origin redirects. A GET quote is checked again before signing; changing its payment terms invalidates the old approval. Chrome proof injection is limited to the captured request in its original tab and navigation generation. Redirects after payment proof are blocked rather than opening a second target with authority. Existing private-network restrictions still depend on the deployment's browser/outbound configuration; local development permits the local demo.

| Outcome | Meaning and next action |
| --- | --- |
| Awaiting approval | The same saved request is waiting for its owner. Approve or decline it in Froggy. |
| Payment `settled` | The seller returned a matching successful x402 `PAYMENT-RESPONSE` acknowledgement. This is **not independent verification of the chain transfer or its recipient/amount**. Keep the transaction reference for reconciliation. |
| Delivery `delivered` | A successful HTTP response was received and its bounded body was saved. It does not certify that the seller's answer is correct. |
| Payment settled, delivery failed | The seller acknowledged payment but the requested result failed. Do not automatically buy it again. |
| `uncertain` | Authorization may have left Froggy without a conclusive acknowledgement. The reservation remains held; no automatic refund or repayment is attempted. Reconcile with the seller and chain before deciding on another purchase. |
| Declined, cancelled or expired before sending | No paid request is submitted. Stop after sending cannot reverse a payment and can leave an uncertain outcome. |

Reuse the original `idempotencyKey` to retrieve the same purchase after a lost response. The same key with changed URL, method/body, network or ceiling is a conflict. Status polling and reconnects do not create another payment. Do not work around a failed or uncertain purchase with a fresh key. The demo seller also stores a sale per payment proof and returns the stored outcome when that proof is presented again.

Stored response bodies are capped at 64 KiB; agent tool output includes at most 16,000 characters of seller text with a truncation flag. The workspace displays seller HTML as text in purchase results. Only the shared Chrome renders the original seller page. Seller content remains untrusted data.

## Verification status

Focused tests cover owner-only approvals, request/quote binding, duplicate requests, stale POST approval IDs, owner wallet signers, Solana signing boundaries, cancellation, uncertain outcomes, browser replay and demo seller proof reuse. A native local Chrome run rendered the paid report with a stub payer, retained its existing session and blocked a post-proof redirect. These checks demonstrate local behavior with explicit simulated providers.

On 8 September 2026, the final opt-in Postgres contracts also passed against a **new disposable `postgres:17-alpine` container**: all 13 repository migrations applied, then `packages/wallet/src/persistence.test.ts` and `packages/wallet/src/ledger-postgres.test.ts` finished with **21 passed, 0 failed, 110 assertions**. This exercised purchase creation/approval races and ownership, seller proof uncertainty and transaction fields, stale claim cancellation, shared run budgets, one-time conversion credit, two-pool ledger idempotency and owner-scoped purchase deletion while retaining the ledger. The database used tmpfs and a random localhost-only port; the task-owned container was removed afterward and its removal was checked. No existing database or live provider was used.

The isolated fast gate, complete repository gate and final production build passed. The gate ran 594 passing tests with zero failures; its two optional Postgres cases were exercised separately as described above. A complete HTTP MCP purchase also passed through OAuth pay scope, owner approval in the UI and status retrieval, with duplicate requests, connection isolation and no browser errors verified. See [the local validation evidence](evidence/X402_LOCAL_VERIFICATION.md) for the tested source, browser results and shared-checkout limitations. To run the checks locally:

```bash
bun run check:fast
bun run check
bun run build
bun run e2e:install
bun run e2e
```

Real signed-in Privy owner signing, real Base/Solana/Hedera settlement and paid delivery from the public endpoints remain live checks. An unpaid 402 probe and a simulated purchase do not satisfy those checks.
