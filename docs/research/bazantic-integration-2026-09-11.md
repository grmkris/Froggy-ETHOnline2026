# Bazantic integration — research, 11 September 2026

Owner's ask: "Bazantic, let's do a deep research to see if we can integrate it properly."
Method: read bazantic.com/docs (all eight pages), the `@bazantic/cli` 0.8.0 README and its
`--help` (installed into the scratchpad with an isolated HOME; no login, no spend), the public
API at api.bazantic.com, and live gateways on bazgateway.com with curl. Nothing was paid, no
account was created. **Verified** means read from their page or observed on the wire today;
**inferred** is marked as such; "not answered" means the docs are silent.

## What Bazantic is (verified)

- An **agent gateway** is "a reverse proxy that a human or AI agent can access via a URL to send
  API requests and pay for those requests, and to access an MCP server to use the API more
  effectively" (concepts). Bazantic hosts it on Fly; each gateway gets an opaque slug
  (`https://bazgateway.com/<slug>/<path>`), optionally a handle (`https://<handle>.bazgateway.com/<path>`),
  an MCP server at `/mcp`, and an A2A-style card at `/.well-known/agent-card.json`.
- A **Recipe** is "one task: typed inputs, a prompt, a model, and the MCP tools it may call. Those
  tools come from APIs already on Bazantic. After you publish, an agent calls the Recipe as a
  single MCP tool" (docs/recipes). Recipes are served from `https://api.bazantic.com/mcp`.
- Callers pay Bazantic, not the provider, in **USDC**: x402 on **Base mainnet** (`eip155:8453`,
  v2 header and v1 body both sent) and MPP on **Tempo** (chainId 4217, `www-authenticate: Payment`).
  Previews on `*.bazgateway.dev` settle on Base Sepolia (CLI README). No Solana, no Hedera on the
  caller side. Every 402 we saw priced at 10000 units = $0.01.
- Public catalogue: `GET https://api.bazantic.com/v1/gateways` (105 gateways today) and
  `GET https://api.bazantic.com/v1/recipes` (17). Both free, no key.
- **Account creation is self-serve.** `bazantic.com/login` and `/signup` offer "Continue with
  GitHub", "Continue with Google" and email; the home page's "Get Started" links to
  `/login?next=/dashboard/recipes/new`. The "Request Beta Access" (developers page) and
  "Submit Your Spec … hear back within 2 business days" (become-a-provider) forms are the
  managed-onboarding lane, not a gate on the dashboard. Inferred: we do not need them.

## 1. Provider side: putting Froggy behind a gateway

**Inputs the dashboard asks for** (docs/deploy-a-gateway, verified): base URL (https only), how the
gateway authenticates to *your* API, product website, docs URL (optional), and an OpenAPI or
OpenRPC document, "as hosted URL or pasted directly". "Bazantic ingests the API methods from your
website, documentation, and OpenAPI specification. Every method starts at the default price of
$0.01 USDC per call — set your own per-method prices here." "Your MCP server is your gateway URL
with `/mcp` appended."

**The upstream may itself be x402.** Verbatim: "Bazantic supports forwarding calls via an API key —
placed in the URL path, in a header, or in a bearer token. If your service does not use an API key
**and** supports x402 and MPP, select that option instead." The CLI makes it the default:

```
baz gateway add --spec-url <url> --endpoint <url> [--name <s>]
  --auth-type <t>   how the gateway authenticates to YOUR api:
                    api-key | jwt | x402-mpp | basic (default: x402-mpp)
  --status <s>      draft | active
  --json            structured result: { ok, id, slug, mcpUrl }
```
"Must declare at least one operation." "https only — the gateway forwards a provider credential to it."

**Precedent with our exact seller stack.** Gateway `retainer-x402` (handle claimed, spec
`https://retainer.edycu.dev/openapi.json`). Its origin answers a Hedera-testnet HBAR challenge
settled through Blocky402 — the same facilitator Froggy uses:

```json
{"scheme":"exact","network":"hedera:testnet","amount":"300000000","asset":"0.0.0",
 "payTo":"0.0.10402910","maxTimeoutSeconds":180,"extra":{"feePayer":"0.0.7162784"}}
```
The Bazantic gateway in front of it re-sells the same route on Base USDC (decoded
`payment-required` header, verbatim):

```json
{"x402Version":2,"resource":{"url":"/api/retainer/access?agent=0x0000000000000000000000000000000000000001"},
 "accepts":[{"scheme":"exact","network":"eip155:8453","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
 "amount":"10000","payTo":"0x7d3Baec5047Fdef294D2852BE4E035795CA86138","maxTimeoutSeconds":300,
 "extra":{"name":"USD Coin","version":"2"}}]}
```
plus `www-authenticate: Payment id="…", realm="gateway", method="tempo", intent="charge",
request="<base64 {"amount":"10000","currency":"0x20C0…8b50","methodDetails":{"chainId":4217},"recipient":"0x7d3B…6138"}>"`.

**Not answered by the docs:** who funds the upstream x402 payment when `auth-type` is
`x402-mpp`. Retainer's origin wants 3 HBAR per subscription while the gateway sells a call for
$0.01, so either Bazantic holds a payer or the paid leg does not actually reach the origin. We did
not pay to find out. This is the first thing to test after creating our gateway ($0.01).

**Settlement and payout** (become-a-provider, verified): "No platform fee during the launch phase";
providers get "access to a wallet you control — funds transfer directly to your bank. Bazantic does
not hold or control your wallet." Payout chain and cadence: not answered. Manifest (`bazantic.yaml`,
verified but "Preview — not released yet"): `version: 1`, `gateways[]` with `handle`, `listing
{name, category}`, `upstream {url, spec {type, url}, auth, extra_headers}`, `default_price` ("$0.0025",
"0.25¢" or millicents; minimum $0.00001), `methods` (explicit `verb`+`path` or `"unmanaged"`),
`status`, `environments {dev, pre, prd}`; secrets only as `${ENV}`. Its `auth.types` list
`none | api-key | basic` — narrower than the CLI's; the CLI is what ships.

**Custom domains** (verified): handle `acme.bazgateway.com` or own domain via TXT
`_baz-challenge.<host>` = `baz-verify=<host>,<token>` plus CNAME to `bazgateway.com`; Fly/Let's
Encrypt TLS; 1 domain per gateway, 5 per account. "The catalog listing, the agent card, the MCP
endpoint, and the 402 payment challenges all use that URL."

**The generated MCP server** (observed on `retainer-x402.bazgateway.com/mcp`): one tool per spec
operation plus `info` and `externalDocs`; `tools/list` is free and needs no session; an
unauthenticated `tools/call` returns `isError: true` with the 402 in the text, carrying both an
`x402` base64 field and an `mpp` header string. Tool descriptions are the spec's, with
Bazantic-appended `conversation_id` and `context` parameters.

**Froggy's fit.** Our live card (`/.well-known/x402.json`) sells two GET resources on
`hedera:mainnet`, 5000000 tinybars each, payee `0.0.10847556`, `feePayer 0.0.10571514`,
facilitator `api.blocky402.com`, HCS topic `0.0.10847557`: `/oracle/snapshot?symbol=USDC` and
`/demo/x402/report`. Both are unauthenticated pure-x402 — the ideal `x402-mpp` upstream.
`POST /api/tasks` answered **401** to an anonymous POST today, i.e. it wants an agent credential
before it challenges; a gateway carries one auth type, so tasks can only go behind Bazantic as
`jwt`/`api-key` with a connection token minted on our Agents page (no x402 on that leg), or stay
out. **Froggy publishes no OpenAPI document** (grep: none in `apps/`), and the spec is required.

## 2. Recipe format

Fields (docs/recipes, verified): `name`, `description`, `input_schema`, `input_example`,
`output_example`, `prompt_template` ("exactly one `{{inputs}}` placeholder"), `model`,
`tool_bindings` (1–64 of `{gateway_slug, tool_name}` only). `handle` is derived from `name`;
the compact JSON may not exceed 24 KiB; task description ≤ 4,000 characters. "Publish locks the
definition and exposes the Recipe as one MCP tool. Unpublish to edit again." "Control calls use the
CLI session. Published Recipe calls use the paid x402 gateway path." Ownership: a Recipe belongs to
one personal or organization account; owner and operator may create, read, edit, test, publish.

Dashboard flow: describe the task → Bazantic auto-drafts the fields → edit prompt, tools, inputs →
Save → Test with real values ("Test drafts call bound gateways without payment"; a good run can be
saved with "Use as output example") → Publish. **The `baz recipe create|publish|install` commands
the docs describe do not exist in the published CLI**: `@bazantic/cli` 0.8.0 (22 Aug 2026) answers
`baz: unknown command: recipe`. Today a Recipe is made in the dashboard only.

A catalogue record, verbatim (the public list and the single-record endpoint return
`prompt_template`, `model`, `tool_bindings`, `price` as `null`):

```json
{"handle":"purpleair-sensor-brief","name":"PurpleAir Sensor Brief",
 "description":"Get the latest PurpleAir reading for one sensor and return a concise air-quality brief.",
 "input_schema":{"type":"object","required":["sensor_index"],"properties":{
   "fields":{"type":"string","description":"Optional comma-separated PurpleAir fields"},
   "sensor_index":{"type":"integer","description":"PurpleAir sensor index"}},"additionalProperties":false},
 "input_example":{"fields":"name,latitude,longitude,pm2.5,temperature,humidity,last_seen","sensor_index":131079},
 "output_example":{"pm2_5":7.2,"sensor":"Example sensor","summary":"Air quality is good at this sensor.",
   "humidity":44,"air_quality":"Good","observed_at":"2026-08-28T22:00:00Z","temperature":21.4},
 "author":{"name":"Bazantic","kind":"organization"}}
```
Two hackathon examples worth copying: `verify-self-renewing-agent-access-on-hedera` (Edy Cu Tjong)
binds the Retainer gateway's `getStatus` and a Hedera Mirror Node gateway, `input_example` points
`vendor_status_endpoint` at `https://retainer-x402.bazgateway.com/api/retainer/status`, and its
`output_example` is a markdown verification report; `sourcemark-proven-lending-rate-with-hedera-settl`
is "provenance-checked lending metrics from The Graph, paid and settled on Hedera" — our neighbour.

**The same-prompt-twice test** is an ETHGlobal requirement, not a Bazantic feature: the docs offer
no harness, no comparison view, no export. We must build the run ourselves (same model, prompt,
settings; run A with only our raw API material, run B with the Recipe installed as an MCP tool),
keep both transcripts, and put them in the submission.

**Observed, contradicting the docs:** an unpaid `tools/call` of `purpleair-sensor-brief` on the
recipe gateway (`https://jtc64fcl6jbgzbohqrkfeu4may.bazgateway.com/recipe-mcp`, found in the
`initialize` `_meta`) returned a live reading in ~40 s with no 402, although its spec prices the
route at `x-bazantic-price-millicents: 1000`. `tools/call` on `api.bazantic.com/mcp` itself
answers `Method not found`. Do not design around either; retest at demo time.

## 3. Consumer side: an agent buying from Bazantic

Discovery (verified): `/v1/gateways` rows carry `id, slug, handle, handle_claimed, name, type,
category, tagline, description, tags, product_website, docs_url, spec{type,url}, service_protocol,
domains` — no price, no upstream auth. Per gateway: `/.well-known/agent-card.json` (MCP binding,
skills, "unauthenticated tool calls answer with an x402/MPP payment challenge") and
`POST /mcp tools/list`. "Wrong path returns 404; correct path returns 402 with exact price —
neither charges." Sponsor-adjacent services already listed: Hedera Mirror Node (mainnet and
testnet, several copies), Sourcify, 1inch, Infura, World, ENS Metadata, Arc, Anchor Browser,
Zerion, DEX Screener, DefiLlama, vet402, SourceMark, Bond Desk (Hedera).

Paying (verified from `--help` and README): `baz curl <url> --account wallet|<grant>
--max-amount <usdc> [--network base|tempo|base-sepolia|tempo-moderato] [--x402-version 1|2]
--yes --json` → `{ ok, status, paid, body }`. A **wallet** is a viem self-custody key funded with
USDC on Base; a **grant** is "capped, revocable authority over your existing Bazantic-hosted
balance", Base or Base Sepolia only, approved once in a browser (`baz grant create --name --cap
--service <slug>`). How the hosted balance is funded: not answered.

A second live challenge, Hedera Mirror Node gateway `xmtqdss7cbddlchc7s3sfdb4b4`
(`GET /api/v1/accounts/0.0.2`), decoded header verbatim:

```json
{"x402Version":2,"resource":{"url":"/api/v1/accounts/0.0.2"},"accepts":[{"scheme":"exact",
 "network":"eip155:8453","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","amount":"10000",
 "payTo":"0x2Db0CaB17bBb9d39E1F37E6608a5a939F35262d9","maxTimeoutSeconds":300,
 "extra":{"name":"USD Coin","version":"2"}}]}
```

**Can Froggy pay it as-is?** Mostly yes, on the Base leg. `challengeFrom` reads the v2
`payment-required` header first (so the CAIP `eip155:8453` name is what we see, not the v1 body's
`"base"`); `assess()` passes it: scheme `exact`, network in the payable list once Privy is live
with an agent key (`directory.ts` adds `eip155:8453` and `eip155:84532` then), and no
`assetTransferMethod` in `extra` means the EIP-3009 default we sign; `assetFor` prices it as the known Base USDC in `packages/domain/src/money.ts`. So: paste the gateway URL in
Details → Directory, it probes as payable, the person adds it, the host (`bazgateway.com` or
`<handle>.bazgateway.com`) and payee go on the allowlist, and `x402_fetch` pays $0.01 through the
Privy typed-data signature. The Hedera pocket cannot pay a Bazantic gateway (no `hedera:*` offer),
and nothing in Froggy speaks MPP/Tempo. **Not verified:** an actual settlement against a gateway;
it would spend real USDC on Base and was out of scope. Also unverified: whether Bazantic's settler
accepts the header under both names we send (`payment-signature` and `x-payment`) — the CLI's
`--x402-version` flag suggests both dialects are accepted.

## 4. Fit with the three bounties

| Bounty | Requirement | What we have | What is missing | Effort | Blocker |
|---|---|---|---|---|---|
| Help an Agent Use Your Hackathon Project ($500 × 2, Continuity Track only) | Account; x402/MPP gateway for our project; a Recipe; same prompt twice with and without it; video; username | Live unauthenticated x402 GETs (`/oracle/snapshot`, `/demo/x402/report`) with a card; skill and MCP for our own door | An OpenAPI doc served at e.g. `/openapi.json`; the gateway (dashboard, `x402-mpp`); a Recipe written in the dashboard; a two-run harness and its transcripts; the video | M (spec 2 h, gateway 1 h, recipe 2 h, harness+runs 3 h, video 1 h) | Continuity Track eligibility; whether the gateway can settle our Hedera-mainnet 402 (unknown funder) — if not, point the upstream at a testnet deployment or a free mirror |
| Best Recipe using Sponsor APIs ($500/$300/$200) | Our gateway + at least one service already on Bazantic or from a sponsor; one recipe using both; result depends on both; recording | Our oracle sells a Graph-derived snapshot and writes an HCS note per sale; Hedera Mirror Node gateways already on Bazantic | A recipe that, e.g., buys the snapshot through our gateway and verifies the sale's HCS message on the Mirror Node gateway, returning rates plus settlement proof | S–M (2–3 h on top of the first bounty) | Same settlement question; recipe test runs use operator credentials so the paid leg is only proven at publish |
| Agentify a new API ($500/$300/$200) | Add a service not on Bazantic and not a sponsor API; working gateway for it; recipe using it and ours; recording | A buyer that can already pay Base-USDC gateways; candidates we integrate today (Browser Use Cloud, DashScope, Messari) | Picking one that is neither on the 105-gateway list nor a sponsor; a public spec for it; a second gateway with `api-key` auth and our key in `${ENV}`; a recipe chaining it with ours | M (3–5 h) | Candidate must clear both exclusions (check `/v1/gateways` and prizes.md on the day); our provider key sits in Bazantic's vault |

## Recommended path

Sell through them first, buy from them second; both are small.

1. Publish `GET /openapi.json` on the server describing `/oracle/snapshot` and `/demo/x402/report`
   (and the card), so the gateway has a spec to ingest. Keep `/api/tasks` out for now (401 before 402).
2. Sign up with the project GitHub account, create the gateway from the dashboard with the x402/MPP
   upstream option, claim handle `froggy.bazgateway.com`, price both methods. Immediately `baz curl`
   one call for $0.01 from a self-custody wallet (`--network base`, or `base-sepolia` if the
   gateway lands on a preview) and read the settlement: this answers the open question of whether
   Bazantic actually pays our Hedera 402. If it cannot, switch the upstream to the testnet
   deployment and record the fact in STATUS.
3. Write the Recipe in the dashboard: "USDC lending brief with settlement proof" — bind our gateway's
   snapshot tool and a Hedera Mirror Node gateway tool (topic `0.0.10847557` messages), so the
   output depends on both. That is bounty 1 and bounty 2 with one artefact.
4. Build the two-run harness as a script under `scripts/` (same model, same prompt, run A with
   `/.well-known/x402.json` + the OpenAPI text pasted, run B with the Recipe as an MCP tool),
   save both transcripts under `docs/evidence/bazantic/`, record the video.
5. Buy side: with Privy live, add `https://bazgateway.com/xmtqdss7cbddlchc7s3sfdb4b4/api/v1/accounts/<id>`
   to a directory, pay $0.01 on Base USDC through `x402_fetch`, keep the receipt. One paragraph in the
   submission: Froggy buys from Bazantic and sells through it.
6. Bounty 3 only if 1–5 are done by 13 Sep: shortlist a non-sponsor API we already hold a key for.

Blockers, plainly: Continuity Track eligibility for bounty 1; the unfunded-upstream question (test
in step 2); Privy live with the agent signer for any Base payment; a few dollars of USDC on Base;
the missing `baz recipe` command (dashboard only); the harness is ours to build.

## Sources

- https://bazantic.com/docs · /docs/concepts · /docs/deploy-a-gateway · /docs/recipes ·
  /docs/spend-grants · /docs/custom-domains · /docs/gateway-manifest · /docs/api-reference
  ("coming soon") · /docs/cli
- https://bazantic.com/ · /developers · /become-a-provider · /login · /signup
- https://registry.npmjs.org/@bazantic/cli (0.8.0 README) and `baz --help`, `baz gateway`, `baz grant`
- https://api.bazantic.com/v1/recipes · /v1/recipes/purpleair-sensor-brief ·
  /v1/recipes/verify-self-renewing-agent-access-on-hedera · /v1/gateways ·
  /v1/gateways/4d3fuvjalzgtdfmjsrolnaja7a · /v1/gateways/jtc64fcl6jbgzbohqrkfeu4may/spec · /mcp
- https://retainer-x402.bazgateway.com/api/retainer/access · /api/retainer/status · /mcp ·
  /.well-known/agent-card.json · https://retainer.edycu.dev/api/retainer/access · /judge
- https://bazgateway.com/xmtqdss7cbddlchc7s3sfdb4b4/api/v1/accounts/0.0.2 ·
  https://jtc64fcl6jbgzbohqrkfeu4may.bazgateway.com/recipe-mcp
- https://github.com/bazantic (empty org) · github.com/0xLeonhack/recon · github.com/helloAbhishekJha/nextbeat-ethonline
- https://app-production-58dd.up.railway.app/.well-known/x402.json · /oracle/snapshot · /api/tasks
- Repo: docs/prizes.md 330–372, apps/server/src/{paid-request,directory,skill,router,tasks}.ts,
  packages/payments/src/{probe,wire}.ts
