# Public x402 demo endpoints

Observed 8 September 2026, 13:57–14:00 UTC. These were **unpaid discovery requests**: no wallet, credential, payment header, or signature was sent. A 402 quote proves discovery works; it does not prove settlement or delivery. Prices and availability can change. Every example below returned x402 v2 `exact` offers.

| Demo | Request | Observed quote | Primary documentation |
| --- | --- | --- | --- |
| CoinGecko: live Bitcoin and Ethereum prices | `GET https://pro-api.coingecko.com/api/v3/x402/simple/price?ids=bitcoin,ethereum&vs_currencies=usd` | HTTP 402; 10,000 USDC base units ($0.01) on Base or Solana mainnet | [Privy integration example](https://docs.privy.io/recipes/agent-integrations/x402) |
| PayAI Echo: Base payment test | `GET https://x402.payai.network/api/base/paid-content` | HTTP 402; 10,000 USDC base units ($0.01), Base mainnet | [PayAI Echo](https://docs.payai.network/x402-echo/getting-started) |
| PayAI Echo: Solana payment test | `GET https://x402.payai.network/api/solana/paid-content` | HTTP 402; 10,000 USDC base units ($0.01), Solana mainnet | [PayAI Echo](https://docs.payai.network/x402-echo/getting-started) |
| PayAI Echo: test networks | `GET https://x402.payai.network/api/base-sepolia/paid-content` or `GET https://x402.payai.network/api/solana-devnet/paid-content` | HTTP 402; 10,000 test USDC base units on the named network | [PayAI Echo](https://docs.payai.network/x402-echo/getting-started) |
| Exa: web search | `POST https://api.exa.ai/search`, JSON `{"query":"Hedera x402 protocol official documentation","numResults":1}` | HTTP 402; 7,000 USDC base units ($0.007), Base or Solana | [Exa x402 guide](https://exa.ai/docs/reference/x402-guide) |
| Exa: extract a page | `POST https://api.exa.ai/contents`, JSON `{"urls":["https://www.hedera.com"],"text":true}` | HTTP 402; 1,000 USDC base units ($0.001), Base or Solana | [Exa x402 guide](https://exa.ai/docs/reference/x402-guide) |
| Nansen: smart-money netflow | `POST https://api.nansen.ai/api/v1/smart-money/netflow`, JSON `{"chains":["ethereum"]}` | HTTP 402; 50,000 USDC base units ($0.05), including Base and Solana among other networks | [Nansen agentic payments](https://docs.nansen.ai/getting-started/agentic-payments/x402-payments) |

CoinGecko is the strongest initial demo because its GET URL is usable from browser navigation, chat, and an external MCP client, and purchases useful live data. Its quote's `resource.url` omits the query string: authorization must bind Froggy's actual full request URL independently of that display field.

PayAI requires `Accept: application/json` to return the machine-readable `PAYMENT-REQUIRED` header. A browser's ordinary HTML request returned an HTML payment page with status 402 and no such header. Its challenge places resource metadata in `extra.resource` rather than a top-level resource. Refund claims have not been tested and should not be promised in the demo.

Observed mainnet payees, for comparison only; use the freshly decoded quote at runtime:

| Merchant | Base | Solana |
| --- | --- | --- |
| CoinGecko | `0x110cdBba7FE6434Ec4CE3464CC523942ad6Fb784` | `8XhngTRitTcUJMiaDJ6azw8GRSiFPpwhnmV3HYQLHUpL` |
| PayAI | `0x2a835A505d4Ea32372Cc420d2663b885cE089453` | `H32YnqbzL62YkHMSCzfKcLry9yuipwwx1EMztiCSPhjb` |
| Exa | `0x6d6E695b09861467c7d462f5AAF31cF3540B9192` | `12Ec2cJmfR1C9uwejzxcuMhUgEC7wDrLgm1wBvvR5w9E` |
| Nansen | `0x93053f1e7A5eFEDa532Fe69CbbE43cBEc3A0F13f` | `J7ZvJEspvwP1oRxQZ7mYmNmT22NTm3GWq3t7HEbvPZYx` |

Solana facilitator fee payers are offer data and may rotate. They are never the buyer. USDC mint addresses for Solana mainnet and devnet were checked against [Circle's official registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) on the same date.

Other probes did not yield a suitable demo: BlockRun's documented US stock quote GET returned 501 on both checked hosts; `pinout.club/bazaar` and `/.well-known/x402` returned 404; `https://www.x402.org/protected` offered testnet payments but advertised a different origin in its resource URL. Blocky's `/supported` advertises Hedera mainnet and testnet facilitation, but that endpoint sells no resource. No independent external Hedera GET merchant was verified in this pass; use Froggy's own hosted Hedera resource for that demo.
