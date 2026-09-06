# The Graph — evidence

Track: **Best AI Tooling or AI Use Case with The Graph (from scratch)**, and the standardized-schema angle of the composable track: one query pattern across many protocols, through the Messari standardized lending schema.

## What the agent does with it

- `graph_query` (`apps/server/src/tools.ts`) runs one standardized lending query across every pinned deployment in `packages/graph/src/registry.ts`, at one block each, and returns the cheapest live USDC borrow with the deployment ids and block numbers as **evidence**. The paid snapshot the agent buys is derived from the same query, so a receipt says which indexes, at which blocks, justified the spend.
- Freshness is a gate, not a note: a deployment whose `_meta` block is older than two hours contributes no markets, and every answer lists each deployment as fresh, stale or unavailable so a thin answer is visibly thin. The oracle does not refuse to sell on freshness; the sale is written before the fetch, and a fetch that fails after settlement is a failed sale with the settlement on it.
- Markets nobody has borrowed from are not answers: a 0% rate with zero borrows is filtered out (Compound v3 ships three such USDC markets).

## Live data

Served through a Subgraph Studio key (`GRAPH_API_KEY`), never from a fixture when the key is set; the wallet strip shows a stub chip and every receipt says `stubbed: true` otherwise.

| When | Deployments | Result |
| --- | --- | --- |
| 5 Sep 2026 | Spark, Aave v3 Ethereum, Compound v3 (Messari standardized) | three protocols at one block; cheapest USDC borrow Spark 4.268%, Aave 4.269%, Compound 5.023%. Aave v3 Base reported unavailable: nobody indexes it on the network. |
| 5 Sep 2026 | registry widened to twelve deployments, on evidence (`785d85e`) | twelve deployments across Ethereum, Arbitrum, Polygon and BSC |
| 6 Sep 2026 06:09 UTC | all twelve, one parallel round trip (298 ms) through the Studio key | **12/12 fresh.** Ethereum at block 25916416: Aave v3 `JCNWRypm…`, Aave v2 `C2zniPn4…`, Compound v3 `AwoxEZbi…` (25916415), Compound v2 `4TbqVA8p…`, Spark `GbKdmBe4…`, Euler `95nyAWFF…`. Arbitrum at 502250038: Aave v3 `4xyasjQe…`, Compound v3 `5MjRndNW…` (502250030). Polygon at 93313294: Aave v3 `6yuf1C49…`, Aave v2 `GrZQJ7sW…`, Compound v3 `5wfoWBpf…`. BSC at 120250759: Aave v3 `43jbGkvS…`. Cheapest USDC borrow: Euler on Ethereum 2.76% ($43M borrowed), then Compound v3 Arbitrum 2.92%, Aave Polygon 2.99%, Aave Arbitrum 3.69%. The same answer, paid for through the hosted 402 a minute later, is in `HEDERA.md`. |

## Pay per query (built, awaiting funds)

With `GRAPH_PAY_PER_QUERY=true` and the agent granted a signer on the person's wallet, `graph_query` stops using the Studio key and pays the gateway's x402 endpoint per deployment: `POST /api/x402/subgraphs/id/{id}`, 10000 units ($0.01) of USDC on Base to `0x79DC…FcCB`, signed by Privy under the committed policy. Every query goes through the same paid-request choke point as any other 402 (`apps/server/src/paid-request.ts`), so each deployment's answer is a receipt with the rule that allowed it, the transaction, and the block the index was at. The snapshot's `source` says `via x402` or `via studio`, and one payment per deployment per minute is the idempotency rule, however many times the model asks.

- TODO(tx): the first paid query from the demo wallet, once it holds USDC on Base (owner step 4) and the gateway is in its directory.

## Not yet

- Subgraph MCP for discovery is not used; discovery is the pinned registry, reviewed in code.
