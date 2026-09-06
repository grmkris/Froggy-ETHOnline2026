> **Raw Grok research, not an accepted plan.** Read the [reviewed synthesis](../deep-research.md) and [corrections](../methods.md) first. Source counts, dates, X access labels and implementation assumptions are not all verified. The current team plan defers remote MCP and retains fixed-price billing.

# x402 services inventory (public, 2026-09-06)

**Judgment.** x402 works as an HTTP payment protocol. Usable *buy* supply is thin. Protocol volume is real (x402.org last-30d: 75.41M txs, $24.24M, 94k buyers, 22k sellers; CDP facilitator: >100M txs). What agents can actually purchase with confidence is a small set of first-party Base USDC APIs plus one documented gateway. Hedera has a native `exact` scheme and testnet bounty apps, not a mainnet merchant catalog. A 402 is a quote, not delivery. This study did not pay or provision.

**Labels.** First-party = vendor origin. Gateway = one wallet, many upstreams. Wrapper = third-party 402 over someone else’s API. **Untested** = no paid call here. Native X MCP tools were unavailable; public X pages were web-fetched.

---

## Ranked inventory (14)

Payment is x402 v2 `exact` + USDC unless noted.

### A. First-party Base (USDC)

| # | Service | URL / method | Price, rail, lifecycle | Maturity |
|---|---------|--------------|------------------------|----------|
| 1 | **Exa** | First-party `POST https://api.exa.ai/search`, `/contents`. [docs](https://exa.ai/docs/reference/x402-guide) | From $0.007 search; $0.001/page contents. Base `eip155:8453` USDC `0x833589…2913` + Solana USDC. Sync; 200 held until settle; `PAYMENT-RESPONSE` tx hash. `numResults` capped at 10. | Docs 2026-08-04. **Untested paid.** |
| 2 | **You.com** | `GET https://api.you.com/v1/search`; `GET`/`POST /v1/agents/search`; `POST /v1/finance_research`. [docs](https://you.com/docs/administration/machine-payments/x402) | Search $0.005; livecrawl +$0.001/result; finance $0.11/`deep`, $0.50/`exhaustive`. Base+Solana. Timeout 600s. Finance 120–300s: raise timeout *before* pay. V1 `X-PAYMENT` rejected. No chargebacks. ZDR off. | Best trap list. **Untested paid.** |
| 3 | **CoinMarketCap** | `GET https://pro-api.coinmarketcap.com/x402/v3/cryptocurrency/quotes/latest` (+ listings, DEX). MCP `https://mcp.coinmarketcap.com/x402/mcp` | $0.01 Base only. Example `payTo` `0x271189…8908`; 30s. Docs: settle only after successful delivery. | Docs prefer Pro API keys for production. **Untested paid.** |
| 4 | **Arkham** | `POST https://api.arkm.com/x402/{route}` (JSON body). `/openapi.json`, `/skill.md` | Credits × $0.20; per-row bills `limit`. Base+Solana. Sync JSON. Failed upstream not charged. ~90 public-read routes. | Launch 2026-08-05. **Untested paid.** |
| 5 | **Alchemy** | `https://x402.alchemy.com/{network}/v2` + data/prices. [docs](https://www.alchemy.com/docs/alchemy-for-agents) | SIWE **plus** x402 USDC on Base: 402 tops up a balance, then draws down. Not pure per-call exact. JSON-RPC/data. | Production gateway. **Untested paid.** |
| 6 | **Massive** | `https://agent.massive.com` (not the key API). [blog](https://massive.com/blog/x402-payments-for-ai-agents/) 2026-09-01 | Per-route; read 402. CDP facilitator. Bars, snapshots, indicators, news, SEC JSON. | GA 2026-09-01. Docs fetch truncated. **Untested paid.** |

### B. Gateways and wrappers

| # | Service | URL / method | Price, rail, lifecycle | Maturity |
|---|---------|--------------|------------------------|----------|
| 7 | **BlockRun** | Gateway `https://blockrun.ai` (Base), `sol.blockrun.ai` (Solana). `GET /.well-known/x402`, `/openapi.json`, `/api/v1/models` | Chat at provider rates, 0% markup in manifest; media/search 5% + $0.001. Treasury `0xe903…1aBf`. Chat sync; **video async** (`POST /api/v1/videos/generations` then poll; Sora ~$0.42/4s). TTS `POST /api/v1/audio/speech` from $0.05/1k chars. Vendor: non-2xx not charged. | Largest SKU surface. **Untested paid.** Wraps frontier labs. |
| 8 | **Surf** | Partner on BlockRun ` /api/v1/surf/{path}`. PayTo `0x058a…F17` (Surf, not BlockRun). | Flat $0.0085. Sync crypto/on-chain/prediction JSON. | Direct partner split. **Untested paid.** |
| 9 | **x402image** | `POST https://x402image.org/mcp` | $0.005–$0.02; `process` = sum. Base, CDP. Pay then work; expiring image URL. Needs `mcp-session-id`. | Publishes BaseScan hashes. **Untested paid.** |
| 10 | **Ausca** | `https://ausca.com`. Manifest `GET /.well-known/x402`: `POST /v1/extract-text`, `/analyze-document`, `/transcribe-media`, `/lease-browser` | Gold-402: from $0.05. Unsigned POST → live 402. | Manifest only. **Untested paid.** |
| 11 | **twit.sh** | `https://twit.sh`, `https://x402.twit.sh`. Example `GET /users/by/username` | Site ~$0.0025–$0.01 Base USDC. Catalogs ~$0.006 tweet search. | x402scan activity. Homepage fetch nearly empty. **Stale docs. Untested paid.** |
| 12 | **StableEnrich** | Wrapper `https://stableenrich.dev` | Exa wrap $0.01; Firecrawl $0.0252; Clado $0.20. Sync JSON; crawl poll bound to paying wallet. | High tx count, not first-party. **Untested paid.** |
| 13 | **Agent402.Tools** | `https://agent402.tools` (`/openapi.json`, `/api/pricing`) | Chat $0.003–$0.50; image $0.08; TTS $0.06. Metered quote then actual. Terms: settled calls non-refundable except defect batches. | Self-described 579 tools. **Untested paid.** |

### C. Native Hedera (HBAR/HTS) — not Base

| # | Service | URL / method | Price, rail, lifecycle | Maturity |
|---|---------|--------------|------------------------|----------|
| 14 | **Pinout Compute** | [pinout.club](https://pinout.club/) `POST /compute/<lane>`; `GET /lanes`, `/.well-known/x402` | Per-second tinybars (cpu-1 30,000; T4 474,000). Asset HBAR `0.0.0`. Facilitator `feePayer`. Metered session: HCS checkpoints, unused seconds **refunded on-chain**, mid-job top-up. | **Hedera testnet only.** Mainnet “next.” **Untested paid.** |

**Hedera rail, not a product.** Scheme `exact`; `hedera:mainnet`/`hedera:testnet`; HBAR `0.0.0` or HTS IDs; tinybars; `extra.feePayer`. Facilitator [blocky402.com](https://blocky402.com/): hosted **mainnet = Hedera only**. Bounty winners (closed 31 Jul 2026, announced 31 Aug) are **all testnet**: Tally (`upto`+HTS), Xorv (quota resale), Qisma (atomic multi-payee HBAR), Mystic (VPN). Repos may vanish after judging.

---

## Top 5 demos (quotes only)

1. Exa `POST /search` — cheapest first-party web results.
2. You.com `GET /v1/search?count=10` — do not POST `/v1/search`.
3. CMC `GET /x402/v3/cryptocurrency/quotes/latest?id=1`.
4. Arkham `POST /x402/balances/address` — unpaid quote in docs.
5. BlockRun `GET /.well-known/x402`; manifest lists 7 free open-weight chat models.

**Unusual (thin proof):** Pinout refunds; Qisma atomic HBAR; Xorv quota resale; Ausca OCR; x402image ops. Not mainnet SKUs.

---

## Exclusions

- **Firecrawl first-party x402:** 2025-08-29 case study cites `api.firecrawl.dev/v1/x402/search` and `docs.firecrawl.dev/x402/search`. Docs URL **404** on 2026-09-06. Current Firecrawl 402 = credit exhaustion. Wrappers exist; authorization unknown.
- **StableTravel / Amadeus / Google Flights / Wolfram:** third-party wraps. 2026-04-25 X essay argued ToS conflict; Google Flights left Agentic Market that day.
- **Deepgram, Tripadvisor, The Graph, Messari routes:** logos only. Messari URL hit a Vercel checkpoint.
- **x402video.com:** storefront **gateway offline**.
- **Cloudflare Monetization Gateway / Stripe x402:** waitlist or preview rails, not buyable APIs.
- **claw402, tx402.ai, PLEXUS, Heurist/Questflow catalogs:** listings ≠ documented first-party products.

---

## Traps

V2 headers vs leftover V1 `X-PAYMENT` (BlockRun copy, Blocky402 samples). Do not hardcode `payTo`/`feePayer`. You.com 402s *before* body validation (pay then 422). Exa holds 200 until settle. Alchemy is SIWE+balance, not Exa-style per-call. `exact` is irreversible; refund = new transfer (Pinout remainder refund is the documented exception). gold-402 Jul 2026: 67–79% free catalogs dead; 8/16 paid buys matched ads. BlockRun Exa $0.011 vs first-party $0.007.

**Gaps.** No paid receipts. No Hedera mainnet *buyer* APIs found. Firecrawl first-party unresolved. Scanner totals disagree. twit.sh schema thin.

**X:** native tools unavailable. Full public pages: wrappers thread 2026-04-25, Hedera bounty 2026-08-31, Cloudflare waitlist 2026-07-01. Stopped when searches duplicated catalogs.

**Limitation.** Documentation-grade, not receipt-grade. Sources: `services-sources.json` (20).
