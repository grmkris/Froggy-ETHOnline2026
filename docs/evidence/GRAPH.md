# The Graph — evidence

Track: **Best AI Tooling or AI Use Case with The Graph (from scratch)**, and the standardized-schema angle of the composable track: one query pattern across many protocols, through the Messari standardized lending schema.

## What the agent does with it

- `graph_query` (`apps/server/src/tools.ts`) runs one standardized lending query across every pinned deployment in `packages/graph/src/registry.ts`, at one block each, and returns the cheapest live USDC borrow with the deployment ids and block numbers as **evidence**. The paid snapshot the agent buys is derived from the same query, so a receipt says which indexes, at which blocks, justified the spend.
- Freshness is a gate, not a note: a deployment whose `_meta` block is older than two hours is excluded, and if fewer than two are fresh the oracle answers 503 before charging anyone.
- Markets nobody has borrowed from are not answers: a 0% rate with zero borrows is filtered out (Compound v3 ships three such USDC markets).

## Live data

Served through a Subgraph Studio key (`GRAPH_API_KEY`), never from a fixture when the key is set; the wallet strip shows a stub chip and every receipt says `stubbed: true` otherwise.

| When | Deployments | Result |
| --- | --- | --- |
| 5 Sep 2026 | Spark, Aave v3 Ethereum, Compound v3 (Messari standardized) | three protocols at one block; cheapest USDC borrow Spark 4.268%, Aave 4.269%, Compound 5.023%. Aave v3 Base reported unavailable: nobody indexes it on the network. |
| 5 Sep 2026 | registry widened to twelve deployments, on evidence (`785d85e`) | TODO(blocks): four fresh blocks from the hosted URL, pasted here |

## Not yet

- The mainnet x402 gateway as a second provider, paid per query by the demo wallet (plan item 2.3, second half). Every row and receipt would then carry `servedBy`.
- Subgraph MCP for discovery is not used; discovery is the pinned registry, reviewed in code.
