Why: The distinctive sentence the team will put in the video ('a Privy policy that still holds if you jailbreak the prompt') is only true on the Base Sepolia leg. The prizes dimension proposed a workaround (Privy raw sign wrapped in a Hedera signer) that my probe of Privy's policies overview suggests is NOT policy-evaluated, which contradicts the feasibility dimension. Nobody checked the EVM (eip155:296) route or Blocky402's HTS/idempotency behavior. This decides the custody architecture on day 0-1.

# GAP hedera_leg_privy_policy

## Summary

Bottom line: the "Privy raw sign wrapped in a Hedera signer" idea is technically buildable but it is NOT policy-gated, so it would silently break the "policy still holds if you jailbreak the prompt" sentence on the Hedera leg. There is no EVM/EIP-3009 escape hatch on Hedera either. The honest architecture is: Privy policy gates the Base Sepolia x402/transfer leg (via eth_signTypedData_v4 / eth_sendTransaction rules); the Hedera leg is paid from a host-held agent pocket (ECDSA key, HBAR, host-enforced caps), and the only way value enters that pocket is a Privy-policied transfer. Say exactly that in the README and the video.

1) Privy raw signing and policies (VERIFIED from docs.privy.io + @privy-io/node 0.34.0 types). Two entry points exist: the EVM RPC `secp256k1_sign` (params: `[hash]`, returns a 65-byte r||s||v hex) and the generic `raw_sign` endpoint (`POST /v1/wallets/{id}/raw_sign`, `params.hash` OR `params.bytes`+`encoding`+`hash_function` in {keccak256, sha256, blake2b256}). The policy `method` enum on the policies overview page is: eth_sendTransaction, eth_signTransaction, eth_signUserOperation, eth_signTypedData_v4, personal_sign, eth_sign7702Authorization, wallet_sendCalls, signTransaction, signAndSendTransaction, signMessage, exportPrivateKey, exportSeedPhrase, signRawMessageBytes, signTransactionBytes, tron_*, xrpl_signTransaction, earn_*, transfer, '*'. Neither `secp256k1_sign` nor `raw_sign` is in it, and the page says verbatim: "Methods `signRawMessageBytes` and `signTransactionBytes` are applicable to Tron and Sui only." The chain-support page adds the design reason: "Tier 2 is the minimum threshold for transaction-level policy controls, because Privy must decode a transaction before it can evaluate conditions on the transaction's contents." Hedera is not a named Privy chain; it falls under Tier 1 "Other Ed25519 and secp256k1 chains" (sign only). Conclusion: a Hedera TransferTransaction signed through Privy raw sign can carry no per-tx cap, daily cap, or allowlist. Whether a policy-attached wallet denies `secp256k1_sign` outright (default-deny for methods without a rule) or ignores it is unverified; either way it is not content-evaluated.

2) Routes to settle a Hedera x402 payment. (a) Raw sign + ECDSA-alias account: feasible. `@x402/hedera@2.25.0`'s `ClientHederaSigner` is `{accountId, createPartiallySignedTransferTransaction(requirements)}`; the default impl builds a TransferTransaction, sets `TransactionId.generate(feePayer)`, `freezeWith(client)`, then `tx.sign(key)`. A custom impl can use the Hiero SDK's `tx.signWith(publicKey, async bytes => ...)` (async signer, verified in Transaction.js), signing keccak256(bodyBytes) and returning the 64-byte r||s (strip Privy's v byte). `freezeWith(client)` fans out bodyBytes to every healthy node unless `maxNodesPerTransaction` is set, so pin one node or you make ~6 Privy calls per payment. ECDSA is fine: Blocky402's fee payer 0.0.7162784 is itself ECDSA_SECP256K1 (mirror node), and the facilitator verifies against the mirror-node key. Gotcha: the Privy-derived 0x alias is a hollow account until it pays for one transaction itself (HIP-583: it "cannot take part in transactions submitted by others requiring its signature"); with key=null the facilitator's verify returns "could not resolve payer key" and fails closed. Hours 8-12, policy coverage none. (b) EVM route eip155:296: dead. Hashio testnet answers chainId 0x128, and the USDC HTS facade at 0x...68cda returns "USDC" for symbol() but empty (0x) for transferWithAuthorization and DOMAIN_SEPARATOR; HIP-218 lists only basic ERC-20. No facilitator advertises eip155:296/295: Blocky402 (eip155:80002, solana devnet, hedera:testnet), x402.org (hedera:testnet with feePayer 0.0.9185802, no 296), PayAI (no hedera/296), Corbits (empty). (c) Privy eth_sendTransaction on eip155:296 sending HBAR: policy-gated (Privy "is compatible with any EVM-compatible chain" via defineChain), 3-6h, but it is not x402 and not "settled through the Blocky402 facilitator", so alone it fails the Hedera qualifier. It is however the ideal policied top-up of the agent's Hedera pocket.

3) Spec (VERIFIED, coinbase/x402 scheme_exact_hedera.md + package source): client signs a partially-signed TransferTransaction (not scheduled), transactionId account = feePayer, single asset, net to payTo must equal amount; the package rejects alias payTo (`invalid_exact_hedera_payload_pay_to_alias_not_allowed`), so the service's payTo must be a 0.0.x id. Facilitators "SHOULD perform idempotency / replay checks where possible".

4) Blocky402 probe (VERIFIED live): /supported returns hedera:testnet feePayer 0.0.7162784; a garbage /verify returns HTTP 200 `{isValid:false, invalidReason:"invalid_exact_hedera_payload_transaction_could_not_be_decoded"}` which is exactly @x402/hedera's error vocabulary, so Blocky402 runs the @x402/hedera facilitator scheme (INFERRED). Duplicate /settle was NOT probed (no funded testnet account in-session). Inference: the same signed bytes resubmitted hit Hedera's DUPLICATE_TRANSACTION ("duplicate of one that was submitted to this node or reached consensus in the last 180 seconds") and settle returns success:false/transaction_failed; but a retried x402 fetch generates a fresh TransactionId and charges again, so idempotency must live in our host. USDC 0.0.429274 exists (6 decimals) and preflight checks payer balance + payTo association; the GitHub repo linked from blocky402.com (blockydevs/blocky402) 404s today.

5) Hours: fallback (host-owned ECDSA key, `createClientHederaSigner`, HBAR asset 0.0.0, host caps, kill = delete key) 3-5h; raw-sign wrapper 8-12h with zero policy value; Base Sepolia Privy x402 leg with typed-data policy 4-6h.

## Claims

### [high] conf 0.92: Privy policies cannot evaluate raw signatures on Ethereum wallets: `secp256k1_sign` and `raw_sign` are absent from the policy `method` enum, and the docs state raw-bytes methods are Tron/Sui only and that transaction-level policy needs Tier 2 decoding.

Evidence: Policies overview method enum lists eth_sendTransaction, eth_signTransaction, eth_signUserOperation, eth_signTypedData_v4, personal_sign, eth_sign7702Authorization, wallet_sendCalls, ..., signRawMessageBytes, signTransactionBytes, ..., '*' and says verbatim: "Methods `signRawMessageBytes` and `signTransactionBytes` are applicable to Tron and Sui only." Chain support page: "Tier 2 is the minimum threshold for transaction-level policy controls, because Privy must decode a transaction before it can evaluate conditions on the transaction's contents." Hedera is not a named chain; it falls under Tier 1 "Other Ed25519 and secp256k1 chains". VERIFIED.

Sources:
- https://docs.privy.io/controls/policies/overview.md
- https://docs.privy.io/wallets/overview/chains.md
- https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-raw-hash.md
- https://docs.privy.io/wallets/using-wallets/other-chains/index.md

### [high] conf 0.9: Privy's own x402 docs confirm the Base leg is policy-gated only via typed-data rules: x402 payments are EIP-712 signatures, so the leash must be an `eth_signTypedData_v4` rule (chainId/verifyingContract/message conditions), not `eth_sendTransaction`.

Evidence: docs.privy.io x402 recipe: "x402 payments are signed as EIP-712 typed data, not as ordinary transactions, so a policy on `eth_sendTransaction` does not cover them." Example policies show `ethereum_typed_data_domain` chainId/verifyingContract conditions and warn the `types` map must match exactly. Privy x402 client documents Base, Base Sepolia, Solana only. VERIFIED.

Sources:
- https://docs.privy.io/recipes/agent-integrations/x402.md
- https://docs.privy.io/controls/policies/example-policies/ethereum.md

### [medium] conf 0.85: A Privy raw-sign Hedera signer is technically buildable: `ClientHederaSigner` is a structural type, the Hiero SDK's `signWith` accepts an async signer over per-node bodyBytes, ECDSA signing is keccak256(bodyBytes), and the SDK verifier tolerates 65-byte r||s||v.

Evidence: @x402/hedera@2.25.0 signer-DCjZrivX.d.mts: `ClientHederaSigner = { accountId; createPartiallySignedTransferTransaction(requirements): Promise<string> }`. @hiero-ledger/sdk@2.85.0 Transaction.js `async signWith(publicKey, transactionSigner: (message: Uint8Array) => Promise<Uint8Array>)` calls `transactionSigner(bodyBytes)` per signed transaction. @hiero-ledger/cryptography primitive/ecdsa.js: `sign` does keccak256 then secp256k1.sign(prehash:false); `verify` strips a 65-byte sig to 64. `freezeWith(client)` sets node ids from `getNodeAccountIdsForExecute()` = all nodes unless maxNodesPerTransaction set, so pin one node to avoid ~6 Privy calls per payment. VERIFIED from package source.

Sources:
- https://registry.npmjs.org/@x402/hedera/-/hedera-2.25.0.tgz
- https://www.npmjs.com/package/@hiero-ledger/sdk
- https://www.npmjs.com/package/@hiero-ledger/cryptography

### [medium] conf 0.8: A Privy-derived Hedera account starts as a hollow account and will fail Blocky402 verification until it pays for one transaction itself; the facilitator fails closed on a null mirror-node key.

Evidence: HIP-583: hollow account "cannot take part in transactions submitted by others requiring its signature"; an ECDSA key "must be provided in a future signed transaction issued by the owner of the account to take control of the account." @x402/hedera createHederaVerifyPayerSignature fetches `/api/v1/accounts/{payer}` and returns `{ok:false, reason:'signature_invalid', message:'could not resolve payer key'}` when key is missing. VERIFIED (HIP + source); that Blocky402 uses this exact code is INFERRED from its error vocabulary.

Sources:
- https://raw.githubusercontent.com/hiero-ledger/hiero-improvement-proposals/main/HIP/hip-583.md
- https://registry.npmjs.org/@x402/hedera/-/hedera-2.25.0.tgz

### [high] conf 0.9: The EVM route (eip155:296) is dead for x402 exact: Hedera testnet USDC's HTS facade has no EIP-3009, and no facilitator (Blocky402, x402.org, PayAI, Corbits) advertises eip155:296 or 295.

Evidence: Live probe via https://testnet.hashio.io/api: eth_chainId=0x128; eth_call on 0x...68cda (0.0.429274) symbol()="USDC" but transferWithAuthorization selector 0xe3ee160e and DOMAIN_SEPARATOR 0x3644e515 both return `0x`. HIP-218 facade list: name/symbol/decimals/totalSupply/balanceOf/transfer/allowance/approve/transferFrom only. Blocky402 /supported: eip155:80002, solana devnet, hedera:testnet. x402.org/facilitator/supported: hedera:testnet (feePayer 0.0.9185802), no 296. PayAI /supported: no hedera, no 296. Corbits /supported returned empty. VERIFIED.

Sources:
- https://testnet.hashio.io/api
- https://raw.githubusercontent.com/hiero-ledger/hiero-improvement-proposals/main/HIP/hip-218.md
- https://api.testnet.blocky402.com/supported
- https://x402.org/facilitator/supported
- https://facilitator.payai.network/supported

### [high] conf 0.85: Blocky402 testnet is live, ECDSA-friendly, and runs the @x402/hedera facilitator scheme; payTo must be a 0.0.x account id (aliases rejected).

Evidence: GET /supported -> `{"kinds":[...{"scheme":"exact","network":"hedera:testnet","extra":{"feePayer":"0.0.7162784"}}],"signers":{"hedera:*":["0.0.7162784"]}}`. Mirror node: 0.0.7162784 key type ECDSA_SECP256K1, max_automatic_token_associations -1. POST /verify with junk -> HTTP 200 `{"isValid":false,"invalidReason":"invalid_exact_hedera_payload_transaction_could_not_be_decoded","payer":""}`; that string and `invalid_exact_hedera_payload_pay_to_alias_not_allowed` are in @x402/hedera's dist. Blocky402 networks doc: "the payer signs a `TransferTransaction`"; quickstart uses PrivateKey.fromStringECDSA. VERIFIED (probe); same-code claim INFERRED.

Sources:
- https://api.testnet.blocky402.com/supported
- https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.7162784
- https://blocky402.com/docs/networks
- https://blocky402.com/docs/quickstart/

### [medium] conf 0.7: Duplicate /settle of the same signed payload cannot double-charge (Hedera rejects duplicate TransactionIds for 180s), but a retried x402 fetch mints a new TransactionId and charges again; idempotency must be implemented in the host.

Evidence: Hedera response codes: DUPLICATE_TRANSACTION = "This transaction ID is a duplicate of one that was submitted to this node or reached consensus in the last 180 seconds (receipt period)"; SDK DEFAULT_TRANSACTION_VALID_DURATION = 120. @x402/hedera client calls `TransactionId.generate(feePayer)` per payload; FacilitatorHederaSigner contract says any non-SUCCESS receipt throws -> `SettleResponse { success:false, errorReason:'transaction_failed' }`; spec only says facilitators "SHOULD perform idempotency / replay checks where possible". Blocky402 API reference documents no idempotency. Live duplicate-settle NOT probed. INFERRED.

Sources:
- https://docs.hedera.com/hedera/sdks-and-apis/hedera-api/miscellaneous/responsecode
- https://raw.githubusercontent.com/coinbase/x402/main/specs/schemes/exact/scheme_exact_hedera.md
- https://blocky402.com/docs/api-reference/

### [medium] conf 0.65: Privy `eth_sendTransaction` on eip155:296 (Hashio) is the one Hedera-side action that IS policy-gated, but it is not x402 and not Blocky402-settled, so it only works as the policied top-up of the agent's pocket, not as the paid request.

Evidence: Privy: "Privy is compatible with any EVM-compatible chain" with viem `defineChain` + `supportedChains`; eth_sendTransaction policies support `ethereum_transaction` `value` lte and `to` allowlists. Hedera track qualifier: "Host a live x402-gated service on Hedera testnet or mainnet, settled through the Blocky402 facilitator." Whether Privy's server-side send works on chain 296 without dashboard RPC config is unverified. VERIFIED docs / INFERRED fit.

Sources:
- https://docs.privy.io/basics/react/advanced/configuring-evm-networks.md
- https://docs.privy.io/controls/policies/example-policies/ethereum.md
- https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction.md

### [medium] conf 0.8: HBAR (asset 0.0.0) is the lowest-risk settlement asset for the demo; HTS USDC 0.0.429274 adds funding, association and preflight risk for little prize value.

Evidence: @x402/hedera HEDERA_TESTNET_USDC = "0.0.429274", decimals 6; mirror node confirms token exists (treasury 0.0.5176). Facilitator preflight "checks that the payer holds enough of `asset` and that `payTo` is either associated with `asset` or has an available auto-association slot". Hedera track text: "all in HBAR or HTS tokens"; HTS tokens are only an "extra points" line. VERIFIED.

Sources:
- https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.429274
- https://registry.npmjs.org/@x402/hedera/-/hedera-2.25.0.tgz
- /Users/jonas/Documents/web3/agentic-wallet/prizes.md

### [low] conf 0.85: Blocky402's public source is not available: the GitHub link on blocky402.com (github.com/blockydevs/blocky402) returns 404, so settle idempotency cannot be verified by reading code.

Evidence: blocky402.com homepage advertises "MIT License", "Self-hostable" and links github.com/blockydevs/blocky402; fetching that URL returned HTTP 404 on 2026-09-04. VERIFIED.

Sources:
- https://blocky402.com/
- https://github.com/blockydevs/blocky402

## Recommendations

- Day 0 decision: do NOT build the Privy-raw-sign Hedera wrapper. It costs 8-12h and yields zero policy coverage; it would make the video sentence false. Lock custody as: (1) user's Privy embedded wallet with a delegated/session signer on Base Sepolia, leash = Privy policy rules on eth_signTypedData_v4 (x402 EIP-3009: chainId 84532, verifyingContract = USDC, message.value lte cap, message.to in allowlist) and eth_sendTransaction (value lte, to in allowlist), plus a stateful daily cap; (2) a host-owned Hedera ECDSA account (create in portal.hedera.com, ECDSA key) used via `createClientHederaSigner` from @x402/hedera@2.25.0 with host-enforced per-tx/daily caps and kill switch = delete the key from the host and notify Telegram.
- Hedera leg build order (3-5h): host the x402 service with @x402/hedera server + Blocky402 (`https://api.testnet.blocky402.com`, network hedera:testnet, feePayer 0.0.7162784), payTo = a 0.0.x account id (aliases are rejected), asset 0.0.0 HBAR for the demo; pin `tx.setNodeAccountIds([AccountId.fromString('0.0.3')])` or `client.setMaxNodesPerTransaction(1)`; log the receipt to an HCS topic for the 'verifiable audit trail' extra points. Only add USDC 0.0.429274 (associate payer + payTo, fund via a testnet USDC source) if everything else is green by day 5.
- Make the policy leash reach the Hedera pocket without lying: the pocket is funded only by a Privy-policied transfer (Base Sepolia USDC via a bridge/OTC you document, or a Privy eth_sendTransaction on eip155:296 via Hashio if a 30-minute spike shows Privy's send works on chain 296). Then the README statement 'Privy caps how much can ever reach the agent's Hedera pocket' is true, and the pocket itself is host-capped.
- Implement x402 idempotency in the host now: key = (resource URL, resource nonce from the 402 body); never re-run `wrapFetchWithPayment` for the same key; persist the Hedera transactionId returned by /settle (`0.0.7162784@sec.nanos`) as the receipt. Do not rely on Blocky402 for dedup; duplicate signed bytes will fail on-chain, but a fresh attempt is a fresh charge.
- Spend 15 minutes on day 1 empirically documenting `secp256k1_sign` against a policy-attached Privy wallet (with and without a `'*'` ALLOW rule) and put the result in the README under 'Why Privy does not gate Hedera'. Judges on the Privy track will respect the honesty; a false claim is worse than a smaller claim.
- Draft README sentence (use verbatim): "Privy's policy engine gates every EVM signature the agent produces — the x402 EIP-3009 payments and transfers on Base Sepolia — with a per-tx cap, a rolling daily cap, a recipient allowlist and a kill switch. Hedera transactions are raw-signed (Privy Tier 1), and Privy only evaluates policies on transactions it can decode (Tier 2+), so the Hedera x402 leg is paid from a separate host-held pocket with host-enforced caps; the only way funds enter that pocket is a Privy-policied transfer, and the kill switch deletes the pocket key." Video line: "the Privy policy is the leash on the user's wallet; the Hedera pocket is the agent's lunch money."
- Ask in the Hedera Discord (#x402 / Blocky402 channel) on day 1: (a) is duplicate /settle idempotent, (b) is the blockydevs/blocky402 repo going public before 13 Sep, (c) is there a testnet USDC 0.0.429274 faucet. Record answers in the README; it doubles as build-in-public content.
- Keep eip155:296 x402 as a README stretch only: it would require deploying your own EIP-3009 token on Hedera EVM and self-hosting a facilitator on chain 296, and probably fails the 'settled through the Blocky402 facilitator' wording. Not in nine days.

## Open questions

- Does a Privy Ethereum wallet with a policy attached hard-deny `secp256k1_sign`/`raw_sign` (default-deny for unlisted methods) or ignore policy for it entirely? Not testable without app credentials; needs a 15-minute live test.
- Blocky402 duplicate /settle behaviour was not probed live (no funded Hedera testnet account in-session). Expected: on-chain DUPLICATE_TRANSACTION -> success:false; unknown whether Blocky402 adds its own idempotency cache or returns the earlier transaction id.
- Does Privy's server-side `eth_sendTransaction` (caip2 eip155:296) broadcast on Hedera testnet without dashboard RPC configuration, and does Hedera's JSON-RPC relay accept the transaction shape Privy produces (hollow-account sender, gas model)?
- Is there a working faucet for Hedera testnet USDC 0.0.429274 (Circle faucet coverage), and does the payer created via ECDSA alias get unlimited auto-associations (HIP-904) on current testnet?
- Will Hedera judges accept a self-hosted Blocky402 instance as 'settled through the Blocky402 facilitator', or must it be api.testnet.blocky402.com?
- Whether the blockydevs/blocky402 repository becomes public before submission (404 on 2026-09-04) so settlement code can be cited.
- Exact Privy x402 client behaviour if the 402 offers both Base Sepolia and hedera:testnet accepts: does `createX402Client` skip unknown networks gracefully or throw?

## All sources

- https://docs.privy.io/controls/policies/overview.md
- https://docs.privy.io/wallets/overview/chains.md
- https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-raw-hash.md
- https://docs.privy.io/wallets/using-wallets/other-chains/index.md
- https://docs.privy.io/api-reference/wallets/raw-sign.md
- https://docs.privy.io/api-reference/wallets/ethereum/secp256k1-sign.md
- https://docs.privy.io/recipes/agent-integrations/x402.md
- https://docs.privy.io/controls/policies/example-policies/ethereum.md
- https://docs.privy.io/basics/react/advanced/configuring-evm-networks.md
- https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction.md
- https://docs.privy.io/wallets/using-wallets/rpc.md
- https://registry.npmjs.org/@privy-io/node/-/node-0.34.0.tgz
- https://registry.npmjs.org/@x402/hedera/-/hedera-2.25.0.tgz
- https://www.npmjs.com/package/@hiero-ledger/sdk
- https://www.npmjs.com/package/@hiero-ledger/cryptography
- https://raw.githubusercontent.com/coinbase/x402/main/specs/schemes/exact/scheme_exact_hedera.md
- https://api.testnet.blocky402.com/supported
- https://blocky402.com/
- https://blocky402.com/docs/quickstart/
- https://blocky402.com/docs/api-reference/
- https://blocky402.com/docs/networks
- https://github.com/blockydevs/blocky402
- https://x402.org/facilitator/supported
- https://facilitator.payai.network/supported
- https://facilitator.corbits.dev/supported
- https://testnet.hashio.io/api
- https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.429274
- https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.7162784
- https://raw.githubusercontent.com/hiero-ledger/hiero-improvement-proposals/main/HIP/hip-583.md
- https://raw.githubusercontent.com/hiero-ledger/hiero-improvement-proposals/main/HIP/hip-218.md
- https://raw.githubusercontent.com/hiero-ledger/hiero-improvement-proposals/main/HIP/hip-719.md
- https://docs.hedera.com/hedera/sdks-and-apis/hedera-api/miscellaneous/responsecode
- https://docs.hedera.com/hedera/sdks-and-apis/hedera-api/basic-types/transactionid
- /Users/jonas/Documents/web3/agentic-wallet/prizes.md
- /Users/jonas/Documents/web3/agentic-wallet/PLAN.md
- /Users/jonas/Documents/web3/agentic-wallet/ARCHITECTURE.md
