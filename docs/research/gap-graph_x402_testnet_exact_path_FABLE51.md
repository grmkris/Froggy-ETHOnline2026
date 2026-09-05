Why: Three dimensions (segments, feasibility, prizes) rest the whole prize triangle on 'Privy wallet pays The Graph per query on Base Sepolia', but the testnet-gateway-serves-Messari-subgraphs assumption was flagged as wrong by verifiers, the retention dimension could not even find the x402 docs page, and no one recorded the per-query price or which facilitator Privy uses. If Messari data is mainnet-only, the demo needs ~$1-5 of real USDC on Base or a Studio key, which changes the Privy 'live financial flow' story and the day-3/day-5 plan.

# GAP graph_x402_testnet_exact_path

## Summary

Live probes on 4 Sep 2026 settle the "Privy pays The Graph per query on Base Sepolia" assumption. Two load-bearing details in the prior research were wrong, and one more was missing.

1. The testnet host in the docs does not exist. Both thegraph.com/docs/en/subgraphs/tooling/x402-payments/ and the @graphprotocol/client-x402 README say `https://testnet.gateway.thegraph.com`. DNS for that name returns no A record (dig @8.8.8.8 -> NOERROR, ANSWER 0; curl: "Could not resolve host"). The live host is `https://gateway.testnet.thegraph.com`. Transcript: `curl -i -X POST https://gateway.testnet.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk -d '{"query":"{ _meta { block { number } } }"}'` -> HTTP/2 402, `payment-required` (base64 JSON) = {x402Version:2, accepts:[{scheme:"exact", network:"eip155:84532", amount:"42", payTo:"0x301672eEf23F0e5f165cfba26762702F20A74430", asset:"0x036CbD53842c5426634e7929541eC2318f3dCF7e", extra:{assetTransferMethod:"eip3009", name:"USDC", version:"2"}, maxTimeoutSeconds:300}]}. So testnet price is 42 USDC base units = $0.000042 per query.

2. Mainnet: `curl -i -X POST https://gateway.thegraph.com/api/x402/subgraphs/id/<id>` for all three Messari ids (Aave v3 Ethereum JCNW..., Aave v3 Base D7ma..., Zerolend Ethereum 4Zf4...) -> HTTP/2 402 with accepts network "eip155:8453", amount "10000" (= $0.01 USDC/query), payTo 0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB, asset 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (Base USDC), scheme exact / EIP-3009. 200 demo queries = $2.00; 500 = $5.00.

3. A 402 proves nothing about whether a subgraph is served. Both gateways return the identical 402 for a garbage id (`.../subgraphs/id/GarbageIdThatDoesNotExist...` -> 402, and `/api/x402/deployments/id/QmNotReal` -> 402). I then signed real EIP-3009 authorizations from an unfunded throwaway key with @x402/fetch 2.25.0 + @x402/evm 2.25.0: both gateways, real id and garbage id alike, answered 402 with error "Verification failed: invalid_exact_evm_insufficient_balance". Payment is verified by the facilitator BEFORE the subgraph id is resolved, so the only definitive test is a funded query. I did not fund the key (Circle faucet is a reCAPTCHA-gated form; that is outside what I may submit unattended). Indirect evidence that the Messari ids are NOT on testnet: the Graph testnet explorer (testnet.thegraph.com, Arbitrum Sepolia protocol network) returns "not found" / 404 for JCNW..., while the mainnet explorer returns 200 for it and 404 for a garbage id; the Messari deployments are published on the Arbitrum One protocol network (graph-lending-mcp registry, Explorer). I rate "testnet gateway cannot serve Messari lending subgraphs" at ~0.85 INFERRED. Nobody has published a Messari-schema lending subgraph to the Graph testnet that I could find.

4. Facilitator question is a category error in x402 v2: the client never picks a facilitator; the resource server (The Graph's gateway) does. Verified in source: @privy-io/node 0.34.0 `x402.mjs` createX402Client only does `new x402Client(); registerExactEvmScheme(client, {signer: createViemAccount(...)})` (or SVM). No facilitator URL, no CDP/PayAI/Corbits key. @graphprotocol/client-x402 1.0.0 (src/createGraphQuery.ts) does exactly the same with `privateKeyToAccount` — it is ~15 lines and requires a raw private key, so it is useless with Privy; replicate it with Privy's signer instead. The Graph's own facilitator is not disclosed in the 402 payload. x402.org/facilitator/supported (verified) lists eip155:84532 (exact, upto, batch-settlement) plus hedera:testnet, but NOT eip155:8453 — the public x402.org facilitator is testnet-only, relevant only if the team's own service settles on Base Sepolia.

5. Privy versions: useX402Fetch in @privy-io/react-auth >=3.7.0 (published 2025-11-14; latest 3.40.0, 2026-09-03) with `maxValue: BigInt` and `signatureOptions:{type:'erc1271'}` for gas-sponsored smart wallets. @privy-io/node 0.34.0 peer-depends on @x402/evm ^2.3.0 and @x402/fetch ^2.3.0. Privy docs: "Users need USDC in their Privy embedded wallet on the correct network (e.g. Base, Base Sepolia)"; "the facilitator pays gas". Policy: x402 payments are `eth_signTypedData_v4` over TransferWithAuthorization {from,to,value,validAfter,validBefore,nonce}; Privy clients send only that type (no EIP712Domain). Per-request cap = condition `ethereum_typed_data_message` field `value` operator `lte`; allowlist = field `to` eq/in_condition_set; chain pin = `ethereum_typed_data_domain` chainId eq '8453'/'84532' and verifyingContract eq USDC. CRITICAL: Privy stateful aggregations (rolling caps) support only eth_signTransaction and eth_signUserOperation — NOT eth_signTypedData_v4 — so a rolling daily cap on x402 spend cannot be enforced inside Privy today; it must live in the host (x402Client.registerPolicy / SpendControls / DEFAULT_MAX_AMOUNT_PER_PAYMENT in @x402/core, plus a host ledger).

6. Messari lending schema (messari/subgraphs schema-lending.graphql, verified field names): Market { name isActive canBorrowFrom inputToken{symbol decimals} inputTokenPriceUSD totalValueLockedUSD totalBorrowBalanceUSD rates { rate side type } }, enum InterestRateSide {LENDER, BORROWER}, enum InterestRateType {STABLE, VARIABLE, FIXED}. graph-lending-mcp (PaulieB14, last tested 2026-03-06, uses gateway API key, not x402) marks aave-v3-ethereum, aave-v3-base and zerolend-ethereum LIVE; Explorer shows Zerolend Ethereum "last updated 2 years ago", so prefer Compound v3 Ethereum (AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9) or Spark Lend Ethereum (GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si) as the third deployment.

7. Fallback data path: Subgraph Studio Free Plan = 100,000 free monthly queries (verified); Subgraph MCP endpoint https://subgraphs.mcp.thegraph.com/sse with `Authorization: Bearer <GATEWAY_API_KEY>` (verified in docs mdx). Prize text for both Graph tracks explicitly accepts "querying Subgraphs with an API key from Subgraph Studio" as live-provider proof.

Recommended path A (~5-6 h): pay The Graph mainnet gateway with real Base USDC from the Privy wallet at $0.01/query (fund $5), Privy typed-data policy as per-tx cap + payTo allowlist, host-side daily ledger; Studio key as silent fallback; own Hedera x402 service stays the Hedera line. Path B (testnet, ~3 h) only proves "agent can pay a 402" against a subgraph you do not need, and cannot carry the Composable/Standardized track.

## Claims

### [high] conf 0.98: The testnet host printed in The Graph's x402 docs and in the @graphprotocol/client-x402 README (`testnet.gateway.thegraph.com`) does not resolve in DNS; the working testnet x402 gateway is `https://gateway.testnet.thegraph.com/api/x402/...`.

Evidence: VERIFIED: `dig @8.8.8.8 testnet.gateway.thegraph.com` -> status NOERROR, ANSWER 0; curl -> 'Could not resolve host'. `curl -i -X POST https://gateway.testnet.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` -> HTTP/2 402 with payment-required for eip155:84532. Docs mdx and README both list the non-resolving host.

Sources:
- https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/
- https://raw.githubusercontent.com/graphprotocol/docs/main/website/src/pages/en/subgraphs/tooling/x402-payments.mdx
- https://www.npmjs.com/package/@graphprotocol/client-x402

### [high] conf 0.97: Per-query price is $0.01 USDC on the mainnet gateway (amount '10000', network eip155:8453, payTo 0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB, asset 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) and $0.000042 on the testnet gateway (amount '42', eip155:84532, payTo 0x301672eEf23F0e5f165cfba26762702F20A74430, asset 0x036CbD53842c5426634e7929541eC2318f3dCF7e); scheme 'exact' via EIP-3009. 200 demo queries on mainnet cost $2.00.

Evidence: VERIFIED by decoding the base64 `payment-required` header from live 402 responses on both hosts for all three Messari ids (4 Sep 2026 19:20-19:23 UTC).

Sources:
- https://gateway.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
- https://gateway.testnet.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk

### [high] conf 0.95: A 402 from either gateway does not prove the subgraph is served: both gateways return an identical 402 for a garbage id, and payment verification happens before the subgraph id is resolved.

Evidence: VERIFIED: garbage id `GarbageIdThatDoesNotExist1234567890abcdefgh` and `/api/x402/deployments/id/QmNotReal` -> 402 on both hosts. Signed real EIP-3009 payloads from an unfunded key via @x402/fetch 2.25.0: all four combinations (2 hosts x real/garbage id) -> 402 'Verification failed: invalid_exact_evm_insufficient_balance'.

Sources:
- https://gateway.testnet.thegraph.com/api/x402/subgraphs/id/GarbageIdThatDoesNotExist1234567890abcdefgh
- https://gateway.thegraph.com/api/x402/deployments/id/QmNotReal

### [high] conf 0.85: The Messari standardized lending subgraphs (Aave v3 Ethereum/Base, Zerolend) are published on The Graph's Arbitrum One protocol network and are almost certainly NOT served by the Base Sepolia x402 gateway, which fronts the Arbitrum Sepolia testnet protocol network.

Evidence: INFERRED (not funded-verified): testnet explorer testnet.thegraph.com/explorer/subgraphs/JCNW... returns 'not found' (WebFetch 404), while mainnet explorer returns 200 for JCNW... and 404 for a garbage id; graph-lending-mcp registry and Explorer list these ids on mainnet (Arbitrum One). Definitive proof requires one funded testnet query (Circle faucet: 20 USDC / 2h on Base Sepolia).

Sources:
- https://testnet.thegraph.com/explorer/subgraphs/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
- https://thegraph.com/explorer/subgraphs/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk?view=Query&chain=arbitrum-one
- https://raw.githubusercontent.com/PaulieB14/graph-lending-mcp/main/src/registry.ts
- https://faucet.circle.com/

### [medium] conf 0.95: In x402 v2 the client does not choose or contact a facilitator; Privy's createX402Client and useX402Fetch only register an EIP-3009 signer, so no Coinbase CDP / Pay AI / Corbits API key is needed to pay The Graph. The Graph's gateway picks its own (undisclosed) facilitator.

Evidence: VERIFIED from @privy-io/node 0.34.0 package/x402.mjs (createX402Client = new x402Client + registerExactEvmScheme({signer: createViemAccount(...)})) and from @graphprotocol/client-x402 src/createGraphQuery.ts (same pattern with privateKeyToAccount). Privy recipe lists three facilitators only as background. x402.org/facilitator/supported lists eip155:84532 but not eip155:8453.

Sources:
- https://registry.npmjs.org/@privy-io/node/-/node-0.34.0.tgz
- https://github.com/graphprotocol/graph-client/tree/main/packages/x402
- https://docs.privy.io/recipes/x402
- https://x402.org/facilitator/supported

### [medium] conf 0.95: @graphprotocol/client-x402 1.0.0 requires a raw private key (X402_PRIVATE_KEY / privateKey option) and cannot take a Privy signer; the team should skip it and call the gateway URL with `wrapFetchWithPayment(fetch, createX402Client(privy, {walletId, address}))` from @x402/fetch, which is functionally identical.

Evidence: VERIFIED: package src (createGraphQuery.ts, index.ts) only supports privateKeyToAccount; deps @x402/evm ^2.8.0, @x402/fetch ^2.8.0, viem ^2.39.3; single version 1.0.0 created 2026-04-14. Privy node peer deps @x402/evm ^2.3.0, @x402/fetch ^2.3.0; latest @x402/* is 2.25.0 (2026-09-04).

Sources:
- https://registry.npmjs.org/@graphprotocol/client-x402
- https://github.com/graphprotocol/graph-client/tree/main/packages/x402/src
- https://registry.npmjs.org/@privy-io/node

### [high] conf 0.9: Privy can enforce a per-payment cap and payee allowlist on x402 (policy on eth_signTypedData_v4: ethereum_typed_data_message field `value` lte N, field `to` eq/in_condition_set, ethereum_typed_data_domain chainId/verifyingContract eq), but Privy stateful aggregations (rolling daily caps) support only eth_signTransaction and eth_signUserOperation, so a daily x402 cap cannot be enforced inside Privy and must live in the host.

Evidence: VERIFIED: Privy x402 sanctions-screening recipe gives the exact TransferWithAuthorization types map Privy clients send and domain conditions; stateful-policies page 'Supported RPC methods' table lists only eth_signTransaction and eth_signUserOperation; operators include lte/gte. @x402/core client exposes registerPolicy, SpendControls, DEFAULT_MAX_AMOUNT_PER_PAYMENT for host-side caps.

Sources:
- https://docs.privy.io/recipes/agent-integrations/x402-sanctions-screening
- https://docs.privy.io/controls/policies/stateful-policies
- https://docs.privy.io/controls/policies/overview

### [medium] conf 0.95: useX402Fetch ships in @privy-io/react-auth >=3.7.0 (published 2025-11-14; latest 3.40.0 on 2026-09-03) with `maxValue: BigInt` and `signatureOptions:{type:'erc1271'}` for gas-sponsored wallets; Privy states users need USDC on Base or Base Sepolia and the facilitator pays gas, with Circle's faucet for testnet.

Evidence: VERIFIED from docs.privy.io/recipes/x402.md and npm registry timestamps.

Sources:
- https://docs.privy.io/recipes/x402
- https://registry.npmjs.org/@privy-io/react-auth

### [medium] conf 0.85: The Messari lending schema field names needed for 'cheapest USDC borrow' are stable across the 3.1.0 deployments: markets { name canBorrowFrom isActive inputToken { symbol } totalBorrowBalanceUSD rates { rate side type } } with side in {LENDER, BORROWER} and type in {STABLE, VARIABLE, FIXED}; aave-v3-ethereum, aave-v3-base and zerolend-ethereum were LIVE in graph-lending-mcp's 2026-03-06 test, but Zerolend Ethereum shows 'last updated 2 years ago' in Explorer.

Evidence: VERIFIED schema from messari/subgraphs schema-lending.graphql and graph-lending-mcp queries.ts (GET_RATES); status from SUBGRAPHS.md and Explorer pages. Nested `rates(where:{side: BORROWER})` filtering is INFERRED, not executed.

Sources:
- https://raw.githubusercontent.com/messari/subgraphs/master/schema-lending.graphql
- https://raw.githubusercontent.com/PaulieB14/graph-lending-mcp/main/src/queries.ts
- https://raw.githubusercontent.com/PaulieB14/graph-lending-mcp/main/SUBGRAPHS.md
- https://thegraph.com/explorer/subgraphs/4Zf4doH54RDit9KVsfCp3MkjrP3szhJZwvw2z5PHczx9?view=Query&chain=arbitrum-one

### [medium] conf 0.95: The free fallback is real: Subgraph Studio Free Plan gives 100,000 queries/month, and the Subgraph MCP is at https://subgraphs.mcp.thegraph.com/sse with `Authorization: Bearer <GATEWAY_API_KEY>`; both Graph prize tracks explicitly accept 'querying Subgraphs with an API key from Subgraph Studio' as live-provider proof, and the AI track lists x402 as one option, not a requirement.

Evidence: VERIFIED: Studio intro page ('100,000 free monthly queries'), subgraph-mcp/claude.mdx (mcp-remote --header Authorization:Bearer GATEWAY_API_KEY https://subgraphs.mcp.thegraph.com/sse), prizes.md lines 100, 130, 140.

Sources:
- http://thegraph.com/docs/en/subgraphs/providers/subgraph-studio/introduction/
- https://raw.githubusercontent.com/graphprotocol/docs/main/website/src/pages/en/subgraphs/tooling/subgraph-mcp/claude.mdx
- /Users/jonas/Documents/web3/agentic-wallet/prizes.md

## Recommendations

- Path A (recommended, ~5-6 h): pay The Graph MAINNET x402 gateway from the Privy wallet with real Base USDC at $0.01/query. Fund the demo wallet with $5 USDC on Base (covers 500 queries). Code: `const x402 = createX402Client(privy,{walletId,address}); const pay = wrapFetchWithPayment(fetch, x402); pay('https://gateway.thegraph.com/api/x402/subgraphs/id/<id>', {method:'POST', body: JSON.stringify({query})})`. Do not use @graphprotocol/client-x402 (raw private key only).
- Attach a Privy policy to the agent wallet: method eth_signTypedData_v4, ALLOW only when ethereum_typed_data_domain.chainId eq '8453' AND verifyingContract eq 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 AND ethereum_typed_data_message(TransferWithAuthorization types map exactly as in the Privy sanctions recipe).value lte '20000' ($0.02) AND .to in_condition_set {Graph payTo 0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB, your Hedera-service payTo}. Send one payment first and copy the exact `types` map from the signing request, or every payment fails closed.
- Implement the daily cap in the host, not Privy: register an x402Client policy / SpendControls (@x402/core exports PaymentPolicy, SpendControls, DEFAULT_MAX_AMOUNT_PER_PAYMENT) and keep a per-session USDC ledger; say in the README that Privy aggregations do not cover eth_signTypedData_v4 today. Kill switch = remove policy_ids / revoke the authorization key.
- Keep a Studio Gateway API key (Free Plan, 100k queries/month) wired as a silent fallback for the same three subgraph ids and as the Subgraph MCP credential (https://subgraphs.mcp.thegraph.com/sse, Bearer key). If the mainnet x402 path hiccups during recording, the Graph tracks still qualify.
- Standardized query for all deployments (Aave v3 Ethereum JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk, Aave v3 Base D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9, plus Compound v3 Ethereum AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9 or Spark Lend Ethereum GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si instead of stale Zerolend): `{ markets(first:100, where:{canBorrowFrom:true, isActive:true}) { name inputToken{symbol} totalBorrowBalanceUSD rates{rate side type} } }` then filter client-side for inputToken.symbol=='USDC' and side==BORROWER (type VARIABLE first); pick min rate. Do not rely on nested rates(where:) until tested.
- Before committing to Path B (testnet), spend 15 minutes to settle it: get 20 USDC from faucet.circle.com (Base Sepolia, reCAPTCHA, per-address 2h limit) into a throwaway key and run one paid query against gateway.testnet.thegraph.com for JCNW...; expect a 'subgraph not found'-class error. If it does serve it, Path B becomes viable at $0.000042/query and Privy's flow can stay on Base Sepolia.
- Path B if you must stay testnet (~3 h, weaker): Privy wallet on Base Sepolia pays gateway.testnet.thegraph.com for whatever testnet subgraph exists (proves 'agent pays per query with x402'), while the Messari lending data comes via the Studio key. This satisfies the AI track's live-provider rule but the x402 payment is no longer load-bearing for the decision; the Composable/Standardized track is carried entirely by the Studio-key queries.
- Fix the docs bug as a cheap build-in-public win: open a PR to graphprotocol/docs and graphprotocol/graph-client replacing `testnet.gateway.thegraph.com` with `gateway.testnet.thegraph.com` (and post the curl transcript on X tagging The Graph). It doubles as evidence for the Graph judges that you actually hit the x402 gateway.
- Update PLAN.md day-3/day-5: 'Graph live query wired (Studio API key)' becomes 'Graph mainnet x402 at $0.01 from Privy wallet, Studio key fallback', and the Privy 'live financial flow' becomes a real-money USDC-on-Base payment plus a Privy funding step (onramp or team-funded), which is a stronger story than testnet.

## Open questions

- Definitive (funded) proof that gateway.testnet.thegraph.com refuses the Messari mainnet-network ids — needs one Circle-faucet-funded query; the exact error string for an unserved subgraph on the x402 path is unknown.
- Which facilitator The Graph's gateway uses (Coinbase CDP vs. self-hosted); the 402 payload and error strings do not reveal it. Matters only for settlement latency in the demo (~1-6 s observed for verify round-trips).
- Whether a Privy embedded (user) wallet vs. a Privy server wallet is the right payer: policies with eth_signTypedData_v4 conditions verified for server wallets via @privy-io/node; the same policy applied to a user's embedded wallet via useX402Fetch is documented but not exercised here.
- Whether graph-node accepts nested `rates(where:{side: BORROWER, type: VARIABLE})` on the Messari Market entity — untested; client-side filtering is the safe default.
- Zerolend Ethereum's data freshness ('last updated 2 years ago' in Explorer) — not queried; may be stale, so verify or swap for Compound v3 / Spark Lend.
- Privy's `maxValue` on useX402Fetch is documented for React; whether @privy-io/node's createX402Client accepts a maxValue (vs. relying on @x402/core SpendControls) was not confirmed in source.

## All sources

- https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/
- https://raw.githubusercontent.com/graphprotocol/docs/main/website/src/pages/en/subgraphs/tooling/x402-payments.mdx
- https://www.npmjs.com/package/@graphprotocol/client-x402
- https://github.com/graphprotocol/graph-client/tree/main/packages/x402
- https://gateway.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
- https://gateway.testnet.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
- https://x402.org/facilitator/supported
- https://docs.privy.io/recipes/x402
- https://docs.privy.io/recipes/agent-integrations/x402-sanctions-screening
- https://docs.privy.io/controls/policies/stateful-policies
- https://docs.privy.io/controls/policies/overview
- https://docs.privy.io/controls/policies/example-policies/ethereum
- https://registry.npmjs.org/@privy-io/node
- https://registry.npmjs.org/@privy-io/react-auth
- https://registry.npmjs.org/@x402/fetch
- https://github.com/PaulieB14/graph-lending-mcp
- https://raw.githubusercontent.com/PaulieB14/graph-lending-mcp/main/SUBGRAPHS.md
- https://raw.githubusercontent.com/PaulieB14/graph-lending-mcp/main/src/registry.ts
- https://raw.githubusercontent.com/PaulieB14/graph-lending-mcp/main/src/queries.ts
- https://raw.githubusercontent.com/messari/subgraphs/master/schema-lending.graphql
- https://thegraph.com/explorer/subgraphs/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk?view=Query&chain=arbitrum-one
- https://thegraph.com/explorer/subgraphs/D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9?view=Query&chain=arbitrum-one
- https://thegraph.com/explorer/subgraphs/4Zf4doH54RDit9KVsfCp3MkjrP3szhJZwvw2z5PHczx9?view=Query&chain=arbitrum-one
- https://testnet.thegraph.com/explorer
- http://thegraph.com/docs/en/subgraphs/providers/subgraph-studio/introduction/
- https://raw.githubusercontent.com/graphprotocol/docs/main/website/src/pages/en/subgraphs/tooling/subgraph-mcp/claude.mdx
- https://faucet.circle.com/
- /Users/jonas/Documents/web3/agentic-wallet/prizes.md
- /Users/jonas/Documents/web3/agentic-wallet/PLAN.md
- /Users/jonas/Documents/web3/agentic-wallet/ARCHITECTURE.md
