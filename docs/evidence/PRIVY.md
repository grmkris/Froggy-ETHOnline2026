# Privy — evidence

The wallet, and the leash on the EVM leg.

## What is live

- Sign-in with email or Google through Privy; the access token is the only credential the server accepts, on every `/api/*` route and both WebSockets (as a subprotocol, never a query parameter).
- The embedded wallet is minted by Privy at login and owned by the person. The server asks, with the person's own token, to be added as an **additional signer** under the committed policy `docs/privy-agent-policy.json` (policy `rk6qw974uapbesb04u5tq5kb`, no owner, so the app secret applies it; `bun run privy:policy apply`).
- **The policy, applied 5 Sep 2026 21:40 CEST, has two allow rules and an expiry.** Everything else — `eth_sendTransaction`, `personal_sign`, key export, a transfer to any other address — is denied by default, inside Privy, in a process this repository does not run.
  - Rule (a) `graph-x402-usdc-base-mainnet`: `eth_signTypedData_v4`, EIP-3009 `TransferWithAuthorization` of Base mainnet USDC to The Graph's x402 payee, at most 20000 units ($0.02).
  - Rule (b) `pocket-topup-usdc-base-sepolia`: `eth_signTransaction` on chain 84532 to the Base Sepolia USDC contract, decoded calldata `transfer.to` equal to the treasury `0x74bcfbc5abb7c342a128764e1f17707ee3b0031f`, `transfer.amount` at most 2 USDC, and the rolling 24-hour sum of such transfers at most 5 USDC through aggregation `mpjhq6o0t9gzdvg3x0x4gmb1` (`bun run privy:policy aggregation`).
  - Both rules expire at `1790726400` (2026-09-30 00:00 UTC) through a `system.current_unix_timestamp` condition.
- **Freeze revokes the signer.** The wallet pane's kill switch, `/freeze` on Telegram, and "stop and freeze" on an approval card all go through one function that flips the mandate, aborts the run, denies parked approvals, holds the browser and removes the agent signer at Privy.
- The mandate the agent is held to is not a prompt: `packages/wallet/src/policy.ts` is a pure function the model cannot reach, and there is no tool that raises a limit, adds a payee, or unfreezes.

## The control beat: Privy says no

Two layers refuse, and the receipt shows which one did.

1. `wallet_send` to an address the **model** produced is refused on **provenance** by the host before any cap is consulted, however well-formed the address and however the prompt asked. Nothing reaches Privy.
2. `wallet_send` to an address the **person typed** passes the host's provenance and caps and reaches Privy as an `eth_signTransaction`, authorized by the agent's key alone. Privy has no rule for that recipient and refuses. The refusal lands on the receipt as `failure`, in Privy's words, prefixed with the policy the signer signs under.

The transcript, 5 Sep 2026 21:45 CEST, produced through `packages/wallet/src/evm-signer.ts` against a wallet that carries the agent signer under the policy (`wfd3lz2qm2pmvfu0io1y71yd`, `0x801411Bd076988af967c4172cdF03d61bF4cfb73`, created for this purpose with `additional_signers: [{ signer_id: <agent quorum>, override_policy_ids: [rk6qw974uapbesb04u5tq5kb] }]`):

```text
[A. 1 USDC to 0x…dEaD: no rule names this recipient]
REFUSED in 226ms
PrivySignerRefusedError: Privy refused to sign: 400 {"error":"RPC request denied due to policy violation","code":"policy_violation"}

[B. 0.01 USDC to the treasury: rule (b), under both caps]
SIGNED in 248ms: 0x02f8b183014a3480830f… (180 bytes)

[C. 3 USDC to the treasury: rule (b), over the 2 USDC per-transfer cap]
REFUSED in 114ms
PrivySignerRefusedError: Privy refused to sign: 400 {"error":"RPC request denied due to policy violation","code":"policy_violation"}
```

Privy's own message does not name the policy; the signer knows which one it signs under and says so, so a receipt reads "Privy refused to sign under policy rk6qw974uapbesb04u5tq5kb: 400 {…policy_violation}". The signed transaction in B was not broadcast; it exists to show that the same signer, the same key and the same policy say yes to the one transfer the rule describes.

- TODO(tx): the same refusal on the deployed URL, from a signed-in wallet with the agent granted, as a receipt with `failure`.

## The signed flow (built, awaiting its first live run)

- `packages/wallet/src/evm-signer.ts` asks Privy for `eth_signTypedData_v4` or `eth_signTransaction` on the user's wallet, authorized by the agent's key alone — never the user's token — so every signature is evaluated against the committed policy. A refusal comes back as `PrivySignerRefusedError` carrying Privy's own words, and lands on the receipt as `failure`.
- `packages/payments/src/evm.ts` turns the typed-data signer into an x402 payer for `eip155:8453` and `eip155:84532` through `@x402/evm`'s exact scheme (EIP-3009 `TransferWithAuthorization`), the same payload shape The Graph's gateway demands. The buyer speaks both x402 dialects: v2 `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE` headers (which the gateway uses, with an empty body) and the v1 body/`X-PAYMENT`.
- `packages/wallet/src/transfer.ts` turns the transaction signer into an ERC-20 transfer the host broadcasts: nonce and fee from the RPC, a fixed gas limit so Privy's decision never depends on the wallet's balance, then `eth_sendRawTransaction` and a receipt. Signing rather than sending on purpose: Privy keeps its rolling aggregations for signing methods only.
- `x402_fetch` picks the first offer in a 402 that a payer exists for: the Hedera pocket, or the person's Privy wallet once the agent has been granted a signer on it. The Graph gateway's live challenge, read on 5 Sep: `exact`, `eip155:8453`, `10000` units of USDC to `0x79DC…FcCB`, `assetTransferMethod: eip3009` — every field the policy names.
- TODO(tx): the first typed-data signature from a signed-in wallet, and the Basescan settlement once the demo wallet holds USDC on Base.
- TODO(tx): the top-up: a Base Sepolia USDC transfer to the treasury under rule (b), on sepolia.basescan.org, and the third top-up in a day refused by the aggregation.

## What Privy does not gate

- The Hedera leg. Privy evaluates policies only on transactions it can decode, and a Hedera transaction is a raw secp256k1 signature to it (see the `raw_sign` section: it can hold such a key, not judge what it signs), so the Hedera x402 payments are made from Froggy-opened accounts with host-enforced caps: the mandate's per-transaction and rolling caps, and the per-user pocket balance the top-up credits. Freeze zeroes that balance and removes the Privy signer.
- Per-wallet daily sums. The aggregation is app-wide (Privy groups by transaction or calldata fields, not by wallet), and its value is updated after a request is signed rather than before, so two simultaneous transfers can both pass. The demo runs on one wallet, where app-wide equals per-wallet; the host serializes each person's spends.

## raw_sign: a Privy-held key as the person's Hedera account

Spike 1.8, 6 Sep 2026, 21:06 to 21:10 CEST, from the build box against the production Privy app, testnet Hedera, the float `0.0.9700388`. Question: can the person's Privy key sign a Hedera transaction through `raw_sign` under the agent's authorization key, so Froggy never holds a Hedera private key?

- **Ethereum wallets: no.** On the purpose-made wallet `wfd3lz2qm2pmvfu0io1y71yd`, under the committed policy, `POST /v1/wallets/{id}/raw_sign` answered in 239 ms: `400 {"error":"ethereum wallets are not supported for this low-level signature endpoint.","code":"invalid_data"}`. Not a policy refusal; the endpoint does not exist for that key type. The person's embedded wallet cannot be their Hedera account.
- **Solana wallets: no**, same wording (`n4cxnkvwtt4rm9cthzur7lq8`, under a wildcard policy `g3lx7qyk7xizkg7m3uowlgpx`).
- **Cosmos, Tron and Bitcoin-segwit wallets: yes.** They are secp256k1, the curve of a Hedera ECDSA account, and `raw_sign` accepts a 32-byte hash for them (Stellar, Aptos, Near, TON and Starknet accept arbitrary bytes, so an ed25519 Hedera account is possible the same way; not exercised).
- **Proven on the cosmos wallet `rsyx1mmcuarb0mmp5tur97zl`** (policy `lwv7beqkwvqbjtm9xgw9thhg`, one rule `ALLOW *`): `raw_sign` over `keccak256(message)` signed in 336 ms, 64 bytes, no recovery byte; the key recovered from the signature equals Privy's stated `public_key` `0215fa72…5f20`; the Hiero SDK's `PublicKey.verify` accepts it. Its EVM alias `0x451718d7197e664d8370d139fcb87abaeb303531` was funded with 2 HBAR from the float ([`0.0.9700388@1788721784.844739555`](https://hashscan.io/testnet/transaction/0.0.9700388%401788721784.844739555)), which created Hedera account **`0.0.10396162`**. A 0.5 HBAR transfer out of that account, built with the SDK and signed through `Transaction.signWith(publicKey, bytes => raw_sign(keccak256(bytes)))` and nothing else, settled: [`0.0.10396162@1788721784.801491552`](https://hashscan.io/testnet/transaction/0.0.10396162%401788721784.801491552) SUCCESS.
- **The policy cannot see inside.** A `signRawMessageBytes` rule is rejected without a condition ("must have at least one condition"), and no condition field source reads raw bytes, so the only rule that lets `raw_sign` through is `*`. Privy therefore holds the key but cannot cap what it signs on Hedera; the caps on that leg stay Froggy's, exactly as `docs/` says today. Privy's contribution is custody: the private key never exists on Froggy's side.

**Taken into the product the same night (phase G of the overnight run, ADR 0009).** With `PRIVY_HEDERA_POLICY_ID` set, `apps/server/src/hedera-accounts.ts` asks Privy for a cosmos-type wallet in the person's name, the float pays its alias, and `packages/payments/src/payer.ts`'s `signerHederaPayer` signs every Hedera payment through `raw_sign` on the keccak256 hash of the body. Proven at 22:21 CEST on testnet with a purpose-made Privy test person (`did:privy:cmtq98t70006g0cjrgjhm3oxj`): wallet `jp1gksq1ndvwtisrug1xpgvv` (public key `028f142f…2d03`) became account **`0.0.10396804`** in 5.9 s by the float paying its alias, and that account paid the **hosted** oracle's 402: settlement [`0.0.7162784@1788726082.952826873`](https://hashscan.io/testnet/transaction/0.0.7162784%401788726082.952826873), answer 200 with the brief. Privy's `bytes` form of `raw_sign` refuses cosmos wallets ("Raw signing with bytes does not support cosmos wallets"); the hash form is what works.

Verdict for G2: **pass, by a cosmos-type wallet per person rather than their embedded Ethereum wallet.** The product change, if taken, is small: `packages/payments/src/accounts.ts` opens the account for a Privy-created key instead of a generated one, and the payer signs through `raw_sign` instead of a sealed key; `HEDERA_KEK` and the sealed keys go away. Decision for Monday morning; the Froggy-custodied keys of task 1.5 are live meanwhile. The spike wallets and policies above stay in the Privy app until the owner archives them.

## Not yet

- **The login-time grant, verified on 7 Sep 09:24 CEST: it does not attach, for anyone.** With the server logging Privy's answer (`1df3d40`), two people's reloads on production both produced `400 {"error":"Invalid JWT token provided","code":"invalid_data"}` from the JWT exchange the SDK runs for `user_jwts` (`POST /v1/wallets/authenticate`), and none of the app's three user-owned Ethereum wallets carries an additional signer (`uuz44hmhivyv4fmtzs8xc9jn`, `j0etzgm5w91w20t2ujjm8o3u`, `kbaho45omta6zh54u97lcn2v`; the server-created cosmos wallet does carry the agent under `chxmr9kx3p6zljal8wo4tfoa`). Privy gates that exchange behind a dashboard toggle: User management → Authentication → Advanced → **Server-side access** ("enable signers for your application"). Until 09:24 a refused grant also hid the wallet: `grantAgentSigner` returned no wallet when the signer did not attach, so the session never learned the address, balances read "Unavailable" and Add funds was hidden. Fixed in `1df3d40`: the wallet is returned whatever Privy says about the signer, a refused grant is asked again after a minute, and the reason is logged. Owner action: flip the toggle, reload, and read "the agent may sign under policy" in the drawer.
- A policy-owner key, so freeze can also wipe the rules; today the policy has no owner and the app secret governs it.
- `personal_sign` under the policy was not exercised (the fixture script called the SDK wrongly); it has no rule and is denied by default.

## The agent signer works on a person's wallet, and the leash holds — 9 September 2026, 22:50 CEST

Two spikes, both against the live production app, both without moving money. They answer the two questions row 0 of `../plan/PRD_PRIVY_FLOW_FABLE51.md` asks.

**The signer is real.** `privyAgentSigner` was pointed at Kristjan's wallet `j0etzgm5w91w20t2ujjm8o3u` and asked to sign an EIP-3009 `TransferWithAuthorization` for one unit of Base USDC to `0x…dEaD`, an address no rule names. Privy answered **`400 policy_violation`, "RPC request denied due to policy violation"**, quoting policy `rk6qw974uapbesb04u5tq5kb`. That is the answer we wanted twice over: the additional signer granted through the browser button that afternoon **is recognised on a person's wallet**, the policy engine ran on its request, and it refused a payee the policy does not name. Until now the kill-switch story rested on the treasury wallet, which the app owns; this is the first proof on a wallet a person owns. Nothing was signed and nothing was broadcast.

**Earn is not permitted yet.** Both policies were read from Privy. `froggy-agent-v1` carries three rules, all signing methods: `eth_signTypedData_v4` for the Graph x402 payee, and `eth_signTransaction` for the pocket top-up on Base mainnet and Sepolia. `froggy-treasury-v1` carries five, likewise all `eth_signTypedData_v4` or `eth_signTransaction`. **Neither policy contains `earn_deposit` or `earn_withdraw`**, and both are default-deny, so an Earn action signed by the agent key would be refused exactly as the probe above was. Stage 2 of the PRD therefore needs new rules on `froggy-agent-v1` before any vault work can succeed, and adding persistent signing authority is the owner's decision, not a lane's.

**What is still unproven.** That Privy permits an _additional signer_, rather than the wallet's owner, to call Earn actions at all once a rule exists. ADR 0015 showed wallet _edits_ need the owner; whether wallet _actions_ of the Earn kind accept a signer is a separate question that only a rule plus one attempt can settle.

## A rolling cap cannot be bucketed per wallet — 10 September 2026, 09:4x CEST

Spike 0c of [the user-owned policy plan](../plan/PLAN_USER_OWNED_POLICIES.md), against the live production app, creating nothing.

The claim above — that the rolling 24-hour aggregation is app-wide because "Privy groups by transaction or calldata fields, not by wallet" — was written before anyone read `AggregationInput.group_by`, which the SDK does expose (up to two `{field, field_source}` pairs) and which `tools/privy-policy.ts` has never sent. If Privy would group by the sending wallet, a per-person rolling cap would move inside Privy instead of staying ours.

Two `POST /v1/aggregations` calls, control first, so that an acceptance could not be mistaken for validation Privy does not do:

```text
[control] group_by ethereum_transaction.not_a_real_field_xyz
  -> 400 {"error":"Validation error: Field 'not_a_real_field_xyz' is not valid for group_by
      with 'ethereum_transaction'. Valid fields are: to at \"group_by[0].field\"",
      "code":"invalid_aggregation_format"}

[candidate] group_by ethereum_transaction.from
  -> 400 {"error":"Validation error: Field 'from' is not valid for group_by with
      'ethereum_transaction'. Valid fields are: to at \"group_by[0].field\"",
      "code":"invalid_aggregation_format"}
```

The control refusal is what makes the second line evidence: Privy validates these names against an enumeration, and it named the enumeration itself — for `ethereum_transaction`, the only groupable field is `to`, the recipient. There is no sender, no wallet and no owner to group by.

**Verdict: no.** A per-wallet rolling cap is not expressible at Privy, and the sentence above stands as written rather than as an assumption. Rolling caps stay host-side and every document that says so is correct. Two further limits bound this permanently: `AggregationMethod` is only `eth_signTransaction | eth_signUserOperation`, so the typed-data x402 leg could never carry an aggregation whatever the grouping, and Privy updates an aggregation's value _after_ a request is signed, so two simultaneous signatures can both pass a cap they jointly exceed.

Both requests were refused, so no aggregation object was created and the app is as it was. The probe is `tools/spikes/privy-aggregation-groupby.ts`.

## A policy can be owned by the person, and then we cannot touch it — 10 September 2026

Spike 0a of [the user-owned policy plan](../plan/PLAN_USER_OWNED_POLICIES.md), server half, against the live production app. `tools/spikes/privy-person-owned-policy.ts`.

The plan turns on an asymmetry read from the SDK types: `PolicyCreateParams` carries no authorization-signature header, while `PolicyUpdateParams`, `PolicyDeleteParams` and the per-rule params all do. If that holds against the live API, the server can mint a policy the person owns using nothing but the app secret — and from that moment cannot change it.

A control ran first, so that a refusal below could not be a malformed body rather than a permissions answer:

```text
--- control: a policy with no owner ---
  create:    200   id ie3kaesh79ccluu82bdq5ugl, owner_id null
  patch:     200   rules replaced
  delete:    200   {"success":true}

--- candidate: owner { user_id: did:privy:cmtq98t70006g0cjrgjhm3oxj } ---
  create:    200   id nq6wgzda7e0r8t6afu1waaph, owner_id "xxlunyp4g9kkvlgelelnlq2t"
  patch:     401   {"error":"No valid authorization keys or user signing keys available","code":"invalid_data"}
  delete:    401   {"error":"No valid authorization keys or user signing keys available","code":"invalid_data"}
```

Same secret, same body, same endpoint; the only difference is the owner. **Person-owned policies are real, and ownership is not cosmetic.**

Reading the owner Privy created is what tells us how the other half must work:

```text
GET /v1/key_quorums/xxlunyp4g9kkvlgelelnlq2t
{"id":"xxlunyp4g9kkvlgelelnlq2t","display_name":null,"authorization_threshold":1,
 "authorization_keys":[],"user_ids":["did:privy:cmtq98t70006g0cjrgjhm3oxj"],"key_quorum_ids":[]}
```

Privy minted a quorum whose only member is the **user**, with no authorization keys at all. So the sole way to authorize a change is a _user signing key_ — exactly the second half of the 401's wording — which is the same class of credential the browser already uses successfully for `addSigners`, and the same one the server-side `user_jwts` exchange has been refused on this app since 7 September. That is why the remaining question can only be asked from a signed-in browser.

**What is still open, and it is the gate on the whole approach:** that the person's own key _can_ edit a policy the person owns. Until that passes, a person-owned policy is a policy **nobody** can change.

**Cost of asking, recorded honestly.** The control was deleted. The candidate cannot be deleted by us — that is the finding — so policy `nq6wgzda7e0r8t6afu1waaph` and, from a later harness test, `obvo4d48po1d1po4lgdgpdvm` remain on the app, owned by the test person, attached to no wallet and governing nothing.

### The browser half, ready to run

Two pieces: `tools/spikes/privy-policy-owner-relay.ts` plus one dev-only function exposed in `apps/web/src/lib/privy.tsx`. The browser holds the user's signing key but must never hold the app secret, so the browser signs and the relay sends; they meet over loopback. Both are deleted once the verdict is written.

```
bun tools/spikes/privy-policy-owner-relay.ts     # terminal 1
bun run dev:web                                  # terminal 2, then sign in
await window.froggySpikePolicyOwner()            # browser console
```

It answers PASS or FAIL on its own. Everything up to the signature is already exercised: `/mint` returns a well-formed signing payload, and `/patch` with a deliberately bogus signature earns the same `401` from Privy, proving the header reaches the policy engine. Note that a wrong signature and a missing one are indistinguishable in Privy's reply, so a FAIL is not by itself proof that the person's key may not do this — it must be separated from a payload that differs by a byte before it is recorded as a verdict.

## Earn is switched off at the app, before any policy or owner question — 10 September 2026

Spike 0b of [the user-owned policy plan](../plan/PLAN_USER_OWNED_POLICIES.md). `tools/spikes/privy-earn-additional-signer.ts`.

The open question from 9 September was whether an _additional signer_, rather than the wallet's owner, may call an Earn action once a rule exists. Asking it looked like it needed a funded wallet and a vault id from the dashboard. It does not: the question is about authorisation, and authorisation and execution fail at different stages, so a differential asks it for nothing. Two app-owned throwaway wallets, one under a policy with a pinned `earn_deposit` rule and one under a policy with no Earn rule at all, each sent the same deposit authorised by the agent's key alone. A `policy_violation` on the control and anything else on the test would have proved the signer is judged by its policy exactly like a signing method.

Both came back the same, and before either question was reached:

```text
[rule present] 403 {"error":"Yield features are not enabled for this app"}
[rule absent ] 403 {"error":"Yield features are not enabled for this app"}
```

**This is a blocker, not a verdict.** The app-level gate fires ahead of the policy engine and ahead of any owner check, so nothing here says whether a signer may call Earn. The 9 September entry's "still unproven" stands unchanged.

**What unblocks it is one dashboard toggle** — Yield/Earn on this Privy app — and nothing else. No funds, no vault id, no fee wrapper: re-run the spike immediately after the toggle and the differential answers itself. That is a smaller ask than [the Privy flow PRD](../plan/PRD_PRIVY_FLOW_FABLE51.md) row 0 assumed, and it is also a prerequisite that row 0 does not list, so stage 2 of that PRD is blocked on it too.

### What Privy will accept in an Earn or transfer rule, which was worth the trip

Rules for the high-level actions read their conditions from a field source none of our policies use, `action_request_body`. Asking Privy to validate a deliberately wrong field name made it enumerate the whole vocabulary:

```text
earn_deposit / earn_withdraw   vault_id, amount, raw_amount
transfer                       source.asset, source.asset_address, source.amount,
                               source.chain, destination.address, destination.asset,
                               destination.chain
```

Both Earn methods also refuse a rule with no conditions ("must have at least one condition"), exactly as `signRawMessageBytes` does. So the vault **can** be pinned and the amount **can** be capped inside Privy, and a transfer rule **can** pin the source asset, the destination chain and the destination address — every leash the Privy flow PRD's stages 2 to 4 assume it can express. That much is confirmed from Privy's own validator rather than from its documentation.

## Earn, once switched on: the signer is allowed, the leash is unproven — 10 September 2026

Kristjan enabled Yield on the app and created two vaults. Re-running spike 0b (`tools/spikes/privy-earn-additional-signer.ts`) got past the 403 and two stages further, and answered half the question.

### The two vaults, read back rather than assumed

Neither id says what it is, so both were read from `GET /v1/earn/ethereum/vaults/{id}`. They are the two Morpho vaults the Privy flow PRD names, and they are not interchangeable:

| Vault id | Name | Chain | Asset | User APY | App share | TVL | Available liquidity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `unzkw5f9txnd2hvmu4z3uan2` | Gauntlet USDC Prime | Base (`eip155:8453`) | USDC `0x8335…2913`, 6dp | 3.74% | 0.42% | $167.2m | $162.4m |
| `xigq1x9pihk6g023z6ya4n1h` | Steakhouse Prime USDC | Base (`eip155:8453`) | USDC `0x8335…2913`, 6dp | 3.74% | 0.42% | $428.2m | $179.0m |

Both are `provider: morpho`, both on Base, both USDC, both reporting the same rates, and both carry a non-zero app share, so the revenue-sharing beat is live either way. `user_apy` and `app_apy` are basis points: 374 is 3.74% to the person and 42 is 0.42% to the app. The PRD's first choice is Gauntlet USDC Prime, `unzkw5f9txnd2hvmu4z3uan2`; Steakhouse has more than twice the TVL but _less_ liquidity as a share of it. **Which to pin is the owner's call and is not guessed here.**

### What the differential now says

Two wallets, one under a policy pinning an `earn_deposit` rule and one under a policy naming no Earn method at all, each sent the same deposit authorised by the agent's key alone:

```text
[rule present] 400 {"error":"Insufficient balance: wallet has insufficient funds for this operation"}
[rule absent ] 400 {"error":"Insufficient balance: wallet has insufficient funds for this operation"}
```

**Answered: an additional signer is not structurally barred from Earn.** Neither arm was refused for want of the wallet's owner. Both reached execution's balance check carrying only the agent key's signature, on a wallet the app does not own. That is the question ADR 0015 left open — wallet _edits_ need the owner, and wallet _actions_ of the Earn kind demonstrably do not. Stage 2 of the Privy flow PRD does not need the person's browser for every sweep.

The wallets are owned by a test person rather than by the app, and that correction is what makes the run mean anything: an app-created wallet with no owner is owned by the same app secret the spike sends as Basic auth, so Privy would have authorised as the owner and never consulted the signer's policy at all. An earlier run had that flaw and its identical-looking answers were worthless.

**Still open: whether the policy gates Earn.** Privy resolves the vault first, then checks the balance, and only then — presumably — consults the policy. On an empty wallet the arm with _no_ Earn rule is refused for funds rather than by default-deny, so the two arms cannot be told apart. This matters beyond tidiness: if the policy does not judge Earn, then "Privy is the leash" does not extend to Earn, and the submission must say so.

**One cheap test settles it.** Put a few cents of USDC on Base into the wallet **without** the rule and re-run with `PRIVY_SPIKE_DENIED_WALLET` set to it. `policy_violation` proves the leash covers Earn; a successful deposit of 0.000001 USDC proves it does not. The spike now reuses a wallet named that way rather than minting a fresh one, so the funds are not stranded by the next run.

Ordering, established along the way and worth keeping: **vault resolution → balance → policy.** A spike that pins a fabricated vault id, or that runs against an empty wallet, learns nothing about authorisation whatever its policy says.
