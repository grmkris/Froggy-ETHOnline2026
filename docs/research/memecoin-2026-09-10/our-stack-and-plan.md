# Froggy token: chain, holding, distribution, first-week engineering

10 September 2026. Written against the production app at `https://app-production-58dd.up.railway.app`, the tree in this repository, and live launchpad/DEX numbers from today. Not a tokenomics whitepaper. A three-person team with almost no users, a Sunday 13 September 18:00 CEST ETHOnline deadline, and a product whose users never see a chain.

## Thirty-second summary

- **Put the token on Base, as a Clanker v4 ERC-20 paired with native USDC** (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`). That is the only chain our people already hold money on, the only chain our Privy Ethereum wallet and x402 EIP-3009 payer speak, and the only place a Uniswap v4 pool sits next to the USDC the agent already spends.
- **Do not launch on Hedera.** There is no meme-launch ecosystem worth using. Hedera DEX volume today is ~$1.6–1.8M/24h against Base ~$1.15B and pump.fun alone ~$99M. HTS create is cheap (~$1); attention is not. Keep Hedera as the sponsor story: notarize the deploy and the airdrop merkle on HCS topic `0.0.10847557`.
- **Do not require “one million tokens to use the app.”** That kills the two audiences we actually have (non-crypto people; other agents paying USDC/HBAR over x402). Clanker’s fee locker is the fee-share they meant by “hooks”: 80% of LP fees to the treasury, in USDC, with no custom Uniswap v4 hook written this week.
- **Do not ship the token before Sunday.** The product being judged is the leash. A Clanker deploy three days out, with a handful of wallets, looks like a distraction. After the deadline: Clanker deploy with 70% LP / 20% 90-day team vault / 10% usage airdrop, then a third wallet row that is **not** in the dollar total.
- **Holding is not free.** Privy’s API can read and swap an arbitrary ERC-20. Froggy’s wallet UI, `WalletSummary`, and `KNOWN_ASSETS` cannot. Users typically have USDC and no ETH, so a transfer/swap of a custom token needs gas sponsorship or it silently fails. Our Uniswap **execution** path is currently Ethereum-mainnet-only and v3-only; Base v4 Clanker pools will quote and then refuse to send.

---

## 1. Chain choice

Judged on three things: where liquidity and attention actually are **this month**, what it costs *our* users, and whether Hedera has a token-launch market. Numbers below are 10 September 2026 unless dated otherwise.

### Where the money is this month

MemeFees snapshot **2026-09-10 13:45 UTC** ([memefees.com/launchpads](https://memefees.com/launchpads)):

| Rank | Launchpad | Chain | Fees 24h | Spot volume 24h | 24h fee share |
| --- | --- | --- | --- | --- | --- |
| 1 | Pons | Robinhood Chain | $5.30M | $83.50M* | 45.4% |
| 2 | FOMO | Solana | $1.52M | $98.74M | 13.0% |
| 3 | Flap.sh | BSC | $1.46M | $34.07M | 12.5% |
| 4 | pump.fun | Solana | $1.41M | $99.09M | 12.1% |
| 12 | Virtuals Protocol | Base · Solana | $17.3K | $120.4K | 0.1% |
| 14 | Clanker | Base | $7.0K | — | 0.1% |
| 17 | Zora | Base | $301 | $7.6K | 0.0% |

\* Pons volume is V2 launch-curve swaps only.

Chain fee share in the same snapshot: Robinhood Chain 59.1%, Solana 24.2%, BSC 15.8%, **Base 0.8%** ($90.6K fees / $3.28M over 30 days). Hedera does not appear.

That is the honest attention picture: **the meme casino this month is Robinhood Chain (Pons) and Solana, not Base, and not Hedera.** Base as a *chain* is still a large DEX market — DefiLlama Base DEX volume ~$1.153B/24h today, Aerodrome ~$529M, Uniswap ~$404M ([defillama.com/dexs/chain/base](https://defillama.com/dexs/chain/base)) — but almost none of that is Clanker/Zora/Virtuals launchpad flow. DexPaprika independently reports ~$952M Base DEX volume at 12:09 UTC the same day; the two trackers disagree on the exact dollar figure and we do not reconcile them.

Hedera, same day, DefiLlama: DeFi TVL **$26.35M**, DEX volume **$1.64–1.76M/24h**, of which SaucerSwap is essentially all of it (~$1.63M). HbarSuite is $5.3K. That is three orders of magnitude below Base DEX, two below a single Solana launchpad. SaucerSwap’s own pool page still shows the real pairs: HBARX/HBAR, USDC/HBAR (~$1.4M/24h), SAUCE, DOVU, BONZO — ecosystem tokens, not a meme factory.

### Cost to our users

| Chain | What they already hold | What a token there costs them | Hidden cost |
| --- | --- | --- | --- |
| **Base** | Native USDC in the Privy Ethereum EOA. Card onramp and copy-address both land here. | Swap USDC→token. Gas is cents if they have ETH; **$0 to them if we sponsor it.** | They often have **no ETH**. A custom ERC-20 `transfer`/`approve` fails without sponsorship. |
| **Solana** | Optional Solana wallet, created on demand for x402 URL purchases. Different address from the Ethereum wallet. | Need SOL + a Jupiter/Pump route. We have Jupiter quotes and Pump execution locally; Pump is `PUMP_EXECUTION_ENABLED=false` and not on production. | A second address, a second funding story, a third chain in a product that currently shows “one dollar.” |
| **Hedera** | A cosmos-type Privy wallet the product uses only as a secp256k1 signer. The person never sees it as a token wallet. | HTS TokenCreate ~$1; associate $0.05; transfer $0.001 ([Hedera fees table](https://docs.hedera.com/networks/fees), fetched 10 Sep). Cheap to *create*, expensive in attention. | Privy cannot display HTS on the Ethereum embedded wallet. The Hedera account is `raw_sign` under `ALLOW *`; we cannot policy-gate HTS transfers at Privy. |
| **Robinhood Chain (Pons)** | Same Ethereum EOA works (same address on every EVM chain). | Same as Base in theory. | They hold **zero** RHC USDC/ETH. Funding is Base. Our Uniswap execution is not enabled on L2s. Pons trading exists locally and is not the production money path. |

### Hedera launch ecosystem, checked honestly

**No.** There is no Hedera equivalent of pump.fun, Clanker, or Pons that a 2026 meme trader would open.

What exists:

- **HTS**, a first-class token primitive. TokenCreate $1, TokenAirdrop $0.10 if the recipient has not associated. Real, cheap, well documented. Not a market.
- **SaucerSwap** V1/V2 AMM plus V3 CLOB (mainnet June 2026). A real DEX. Sentinel/HeadStarter listing still requires a score, a Planck-NFT vote, and **$3,000 of LP** (HeadStarter × SaucerSwap post, 14 Dec 2025 — older than 90 days, still the published bar). That is an IDO whitelist, not a meme pad.
- **HeadStarter**, the “launchpad of the Hedera ecosystem.” Litepaper still describes vetted IDOs. No 2026 volume that shows up on MemeFees or DefiLlama launchpad tables.
- **SolCreate** added a Hedera HTS creator (40 HBAR/action). A minting tool, not a trader destination.
- **Scaffold HBAR** (live on hedera.com today) has templates for HTS/HCS. Builder tooling, not a launchpad.
- NFT pads (TierBot, SentX) are NFT mints.

MemeFees’ tracked launchpad directory on 10 Sep lists RHC, SOL, BSC, BASE, MONAD, TRON, XLAYER, ETH. Hedera is absent. If a Hedera meme pad of any size existed this month, it would be on that list.

**Use Hedera for the story we already have:** every Froggy settlement is already a note on HCS topic `0.0.10847557`. A token deploy and an airdrop merkle root are two more notes. That is a sponsor beat. It is not a listing.

### Virtuals, Flaunch, Bankr, custom hooks — why not

- **Virtuals** is the AI-agent token narrative. Pair is `$VIRTUAL`, not USDC. Graduation is 42,000 VIRTUAL into a Uniswap pool with a **10-year LP lock**, 1% tax (70% creator / 30% treasury). Fees today: $17.3K/24h, −60.6% over 7d. Our people hold USDC, not VIRTUAL. Forcing a VIRTUAL buy in front of “use Froggy” is the same class of mistake as a token gate.
- **Flaunch** is Uniswap v4 hooks with 100% of fees to creator/buybacks and a Progressive Bid Wall. MemeFees does not rank it in the top 18 today. Dune still has historical volume; it is not where attention is this week.
- **Bankr / Doppler** on Base and Robinhood Chain: 0.7% swap fee, 95% to creator. Fine product. We do not have a Bankr deploy path in this repo, and Robinhood Chain is the wrong funding rail.
- **A custom Uniswap v4 hook we write.** Uniswap Foundation’s ETHOnline 2026 prize is $3,000 / $2,000 for “best Uniswap stack contribution,” including new v4 hooks ([ethglobal.com/events/ethonline2026/prizes/uniswap-foundation](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation)). We already quote Uniswap. Writing a hook in the last 72 hours of a hackathon, with CREATE2 address mining, allowlisting for `dynamicFees` / `*ReturnsDelta` flags ([Uniswap Labs routing note, 3 Sep 2026](https://support.uniswap.org/hc/en-us/articles/48291859140621-Routing-for-hooked-pools)), and a `FEEDBACK.md` plus their form, is a prize play that puts the submission at risk. Clanker already *is* a v4 hook. Use it.

### Verdict

| Option | Traction this month | Fits the wallet we have | Fits x402 / the leash | Do it? |
| --- | --- | --- | --- | --- |
| Base + Clanker v4, pair USDC | Weak as a *meme pad* (0.8% of launchpad fees). Strong as a *DEX* ($1B+/day). | Yes. Same EOA, same USDC. | Yes. Same chain the Graph 402 and the person-owned policy already name. | **Yes. After Sunday.** |
| Solana + pump.fun | Strong. | No. Different address, SOL gas, Pump flag off in production. | No. Our x402 seller and Graph buyer are not Solana-primary for humans. | No, unless the goal is a casino ticker with no product link. |
| Robinhood Chain + Pons | Strongest this month. | Same EOA, empty of funds. | We have Pons adapters locally. Production money is Base USDC. | No for v1. Revisit only if we ever fund RHC. |
| Hedera HTS + SaucerSwap | None that matters. | The Hedera account is a signer, not a token inbox. | HTS is invisible to Privy policy. | **No for the token. Yes for an HCS note.** |
| Virtuals on Base | Tiny, shrinking. | Users would need VIRTUAL. | Conflicts with “one dollar, USDC + HBAR.” | No. |

**The traction argument for Solana/Pons is real, and we are still picking Base.** A three-person team with a handful of users will not win a pump.fun slot. What we can win is a token that the existing wallet can hold, that Uniswap on Base can price against the USDC we already understand, and that Clanker’s fee locker turns into a USDC stream to `0x8Cc232c9EB25b4b20ee448106858e3B6281708C2` without us writing a hook.

---

## 2. Mechanics of holding, in *this* Privy wallet

The person has one Ethereum embedded wallet (EOA). Money for display and for Graph x402 is at the **signer**, not a smart account — `apps/server/src/session.ts` says so in the comment on `walletSummary()`, because the Graph 402 is EIP-3009 from the address that holds the USDC, and the smart wallet on this app was configured for Base Sepolia only. They may also have a Solana wallet (created from Settings) and a cosmos-type Privy wallet that is their Hedera key (ADR 0009). The cosmos wallet is not an HTS inbox.

### Receive

Anyone can send an ERC-20 to the EOA. Nothing in Froggy notices. `walletSummary()` calls `balances.usdc(signer)` which is `eth_call` `balanceOf` on **only** Base USDC (`apps/server/src/services.ts`, `encodeBalanceOf` in `packages/wallet/src/erc20.ts`). A Froggy token would sit on the same address, invisible.

Privy itself **can** see it. `GET /v1/wallets/{id}/balance?token=base:0x…` returns `raw_value` / `raw_value_decimals` for an arbitrary ERC-20 ([docs, updated 8 Sep 2026](https://docs.privy.io/wallets/gas-and-asset-management/assets/fetch-balance)). Named assets (`usdc`, `eth`) are a short enum; custom tokens use the `token` query, not the `asset` query, and the two cannot be mixed. Dashboard “Asset watchlist” is how Privy’s own transfer UI and webhooks learn a custom token ([transfer overview, 24 Aug 2026](https://docs.privy.io/wallets/actions/transfer/overview)). Product updates in April 2026 added “just-in-time balances and custom token support in the dashboard.”

Froggy does not use Privy’s default wallet UI. `apps/web/src/lib/privy.tsx` drives `fund()` and crypto deposits toward USDC. The in-app wallet is `WalletHome` + `WalletBreakdown`: one dollar figure, two rows (USDC, HBAR).

### Hold / display

| Surface | Arbitrary ERC-20 today? | What breaks |
| --- | --- | --- |
| Froggy Wallet total | No. `totalUsdMicros` is USDC units + HBAR at the mirror rate. | Adding a 18-decimal Clanker token into that sum, unpriced, would lie. Keep it **out of the dollar total**. |
| Froggy “Where it is” | No. `WalletSummary.balances` has `usdcUnits` and `hbarTinybars` only (`packages/protocol/src/app.ts`). | Needs a third field, or a sidecar, plus a row in `wallet-breakdown.tsx`. |
| Privy Dashboard | Yes, after adding the contract to the Asset watchlist. | Operators see it; users of Froggy do not, unless they open Privy’s UI, which we hide. |
| Privy `GET /balance` | Yes, `token=base:<addr>`. | We do not call it. We `eth_call` USDC. Either works; `eth_call` matches what we already do and does not depend on the watchlist. |
| Agent / mandate | No. `KNOWN_ASSETS` (`packages/domain/src/money.ts`) is USDC (Base, Sepolia, Solana) and HBAR/USDC-HTS. An unlisted asset cannot be priced, and an unpriced spend is refused. | Do not add the meme to `KNOWN_ASSETS` until we have a quote we trust. A meme is not par. |

Clanker v4 tokens are **100,000,000,000** units, **18 decimals**, not mintable after deploy, burnable. USDC is 6 decimals. Reusing `usdcUnits` or treating Clanker raw amounts as microdollars is a class of bug this codebase is specifically built to avoid.

### Spend / swap

Three spend paths, only one of which is live for a custom token without new work:

1. **Privy Swap API** (already spiked). `tools/spikes/privy-swap-spike-wallet.ts` posts to `/v1/wallets/{id}/swap` with `destination: { asset_address: USDC, caip2: eip155:8453 }`. Docs (18 Aug 2026) list Base as a supported EVM chain; input/output are ERC-20 addresses. Requires swaps enabled in the dashboard and **app-pays gas sponsorship** on Base, which crypto-deposit setup already demands. This is the realistic “person taps Buy in Froggy” path next week. Developer fees on swaps exist (`collect-fees` in Privy docs) — a second fee-share, separate from Clanker LP fees.

2. **Froggy Uniswap trading.** Quotes: `apps/server/src/trading/uniswap.ts` already requests protocols `["V2","V3","V4"]` and lists `eip155:8453`. Execution: `uniswapExecutionNetwork()` returns true **only** for `eip155:1` and `eip155:11155111`, with the comment “Rollup data/operator fees are outside an EIP-1559 execution fee cap.” Pool checks in `uniswap-execution.ts` throw unless `pool.protocol === "v3"`. A Clanker v4 USDC pool will **quote and then refuse to send**. Do not promise in-app Uniswap execution of this token until that bound is redesigned. `trade` is already `ask` in `packages/domain/src/authority.ts`; that part is correct.

3. **x402 pay-with-token.** Protocol: any ERC-20 via Permit2 since Coinbase’s 18 Mar 2026 post; CDP facilitator documents Permit2 on Base ([network support](https://docs.cloud.coinbase.com/x402/network-support)). Our payer: `packages/payments/src/evm.ts` is EIP-3009 `TransferWithAuthorization` only, pinned to USDC. Clanker tokens are not EIP-3009. Person-owned policies (`packages/wallet/src/person-policy.ts` `servicePaymentRule`) pin `verifyingContract` to `pins.usdc` and the typed-data primary type to `TransferWithAuthorization`. Permit2 is `PermitWitnessTransferFrom` against `0x000000000022D473030F116dDEE9F6B43aC78BA3`. Adding it means a new rule, and **every existing person must sign a policy update in the browser** — the server cannot patch a person-owned policy (ADR 0019, proven 10 Sep). First Permit2 use without gas sponsorship also needs an on-chain `approve`. This is not a first-week job.

### What else breaks

- **No ETH in the wallet.** Treasury on 7 Sep held ~0.0221 ETH and 7.53 USDC (`docs/evidence/MAINNET_RELEASE.md`). People topping up by card get USDC, not ETH. Without Privy gas sponsorship, they can receive the token (someone else paid gas) and cannot send or swap it. Sponsorship is a dashboard + budget decision, not a code change.
- **Person-owned policy is default-deny.** The standing key cannot `approve`, cannot `transfer` the meme, cannot sign Permit2, cannot call ClankerFeeLocker. Anything the *agent* does with the token is a new `ActionKind` or it is refused. The *person* can sign from the browser with their own key, the way freeze/`removeSigners` already works.
- **Hedera cosmos wallet.** `raw_sign` cannot be scoped. Do not put the meme, or a wrapped HTS copy, under that key.
- **Deposit addresses.** Privy crypto deposits convert inbound assets to **USDC on Base**. If someone sends the meme token into a universal deposit address configured `destination.asset: usdc`, Privy will try to swap it away. Either exclude the token from `source.mode: "all"`, or do not turn deposits on for that asset. Confirm against current deposit-account docs before enabling.
- **“1 million tokens to use the app.”** Clanker supply is 100B, 18 decimals. 1,000,000 tokens is 0.001% of supply — a rounding error, not a membership. The failure is product, not arithmetic: other agents paying our x402 seller have USDC, not $FROGGY; a human on email login has no token and no DEX; a price crash locks people out of a wallet product. Gate at the app layer (`session.ts` / `auth.ts`) if you ever do it, not at Privy — Privy policies do not gate login. Do not do it.

---

## 3. Distribution that does not look like insiders taking everything

We have very few users. On 7 Sep the evidence named **three** user-owned Ethereum wallets (`uuz44hmhivyv4fmtzs8xc9jn`, `j0etzgm5w91w20t2ujjm8o3u`, `kbaho45omta6zh54u97lcn2v` in `docs/evidence/PRIVY.md`). The mainnet database cutover the same morning started from essentially empty (`froggy_mainnet`). I did not query production for a current count. Treat “a handful, mostly the team” as the working fact.

If we mint an OpenZeppelin ERC-20 from a team key, the team holds 100% at block 0. That is the look they are trying to avoid. **Clanker’s supply split is the distribution mechanism.** Up to 90% may go to extensions; the rest is single-sided Uniswap v4 LP, locked in `ClankerLpLocker` / `ClankerLpLockerFeeConversion`. Tokens are not mintable after deploy.

### Recommended split (100B, 18 decimals)

| Slice | Amount | Mechanism | Who can move it | Why |
| --- | --- | --- | --- | --- |
| LP | 70% | Clanker factory → Uniswap v4 pool, paired with native USDC, locker `0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496` (fee-conversion) or `0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0` | Nobody. Locked in the Clanker LP locker. | Most of the supply is in the market, not in a team wallet, at deploy. |
| Team | 20% | `ClankerVault` `0x8E845EAd15737bF71904A30BdDD3aEE76d6ADF6C`. Min lockup 7 days; set **90 days lock + 180 days linear vest**. Admin = a 2-of-3, not Kristjan’s EOA. | After lock+vest, the vault `claim()` pays the admin. Anyone can trigger `claim`. | 20% is visible and boring. A 7-day min would let the team dump the week after the hackathon. Don’t. |
| Usage airdrop | 10% | `ClankerAirdrop` `0x56Fa0Da89eD94822e46734e736d34Cab72dF344F` or AirdropV2 `0xf652B3610D75D81871bf96DB50825d9af28391E0`. Merkle root of **signer addresses that have a settled, non-stub receipt**, not every Privy DID that logged in. Min lockup 1 day; set **7 days**. | Recipients `claim(token, recipient, amount, proof)`. | “Existing users” with three wallets is not a community. Usage is the only non-insider signal we have. Leave the root documented on HCS so it can be audited. |

Do not take a creator-buy (dev buy) on day one unless there is a published USDC amount and a recipient that is the vault, not a personal wallet. Clanker’s USDC-paired dev-buy only works if a WETH↔USDC v4 pool exists, which it does on Base; it is still a first-buy that looks like a sniper if it is large.

### What not to do

- **Do not airdrop to the three team wallets and call it community.** Publish the merkle as a CSV of `address, amount` and the rule that produced it (e.g. one share per settled non-stub receipt before T-0, capped per address).
- **Do not put team tokens in the deployer’s liquid balance.** Vault or it did not happen.
- **Do not announce a % of supply “for the community” that is actually sitting on a team EOA waiting for a later airdrop.** If it is not in the Clanker airdrop extension at deploy, it is team supply.
- **Do not mix this with the $1 team credit or the treasury USDC.** Those are product balances. The token is a separate asset.
- **Points now, token later** is the only honest path if they want more than ten recipients. Start counting settled receipts (we already write them, and HCS already notarises settlements) on Monday. Do not invent a points contract this week.

### Fee share, which is the actual “hooks” ask

Clanker v4 hooks (`ClankerHookStaticFeeV2` `0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC` or DynamicFeeV2 `0xd60D6B218116cFd801E28F78d011a203D2b068Cc` on Base) take LP fees on every swap and route them to `ClankerFeeLocker` `0xF3622742b1E446D92e45E22923Ef11C2fcD55D68`. Documented split: creator chooses 1/2/3% LP fee; Clanker takes 20% of that (so 0.2/0.4/0.6%); creator gets 80%. Claim on `clanker.world/clanker/<token>/admin` or by calling the locker.

Set:

- `pairedToken` = Base USDC, not WETH. Our users hold USDC. Creator rewards in `"Paired"` then arrive as USDC.
- `creatorRewardRecipient` = treasury `0x8Cc232c9EB25b4b20ee448106858e3B6281708C2` (Privy wallet `yikihk1kul6vh518z6pers1f`, from the 7 Sep mainnet release).
- `tokenAdmin` = the 2-of-3, not a laptop.

That is fee sharing without a custom hook, without touching `authorize`, and without a token gate. App-level fee sharing (kick back a % of Froggy service revenue to holders) is a later ledger feature and is not required for the token to be real.

---

## 4. Engineering plan

Assumption: competent engineers who have not shipped a meme token. The deadline work is the leash, the demo, the prizes (Privy, Hedera, Graph, Uniswap-as-already-integrated). A token that makes any of those screens less true is a bad trade.

### Before Sunday 13 September 18:00 CEST

**Default: nothing on-chain, nothing in the app.** If the demo video needs a sentence, the sentence is “we are not gating this product with a token.”

If, and only if, there is a leftover two-hour window after the video is shot and the submission form is filled:

1. One person (not a coding agent unsupervised) opens [clanker.world/deploy](https://www.clanker.world/deploy) from a **throwaway deployer EOA**, not the production treasury, not a person’s Froggy wallet.
2. Configure: name/symbol/image; pair **USDC**; static or dynamic fee; 20% vault / 0% airdrop (merkle is not ready) / 80% LP; reward recipient = treasury; tokenAdmin = deployer with a written plan to rotate.
3. Pay the small ETH the UI asks for. Save: token address, pool id, deploy tx, locker, vault. Post one HCS message on `0.0.10847557` with those hexes and nothing about people.
4. Do **not** merge UI for it. Do **not** change `docs/privy-agent-policy.json` or person-policy generation. Do **not** add a `KNOWN_ASSETS` row. Do **not** enable Uniswap execution on Base.

If that window is not leftover, skip. A token address in the README that the app does not show is still better than a half-wired third balance that poisons `totalUsdMicros`.

### The week after (realistic, five working days)

**Day 1 — Deploy for real, or redo the leftover deploy.**

- Prefer Clanker v4.1 hooks (StaticFeeV2 / DynamicFeeV2) + AirdropV2 so the merkle can be rotated when more users exist.
- Pair USDC. Vault 20% at 90d+180d. Airdrop 10% merkle of usage addresses, 7d lock. LP 70%.
- `tokenAdmin` and vault admin: 2-of-3 (Kristjan, Jonas, Corot) or a Safe on Base. Rotate off the deploy EOA the same day.
- Record addresses in a new `docs/decisions/00xx-froggy-token.md`. Never hardcode them in more than one module; one `FROGGY_TOKEN` env / pins field, same rule as USDC.
- HCS note of deploy tx + merkle root.

**Day 1–2 — Show it, without lying about dollars.**

Files, in order:

1. `packages/wallet/src/erc20.ts` — already has `encodeBalanceOf` / `decodeUint256`. Reuse. Do not add an ERC-20 SDK.
2. `apps/server/src/services.ts` — `Balances` currently `{ hbar, usdc }`. Add `token(address, contract): Promise<bigint | null>` as the same cached `eth_call` pattern as USDC (one retry, unknown ≠ 0).
3. `packages/protocol/src/app.ts` `WalletSummary` — add `tokenUnits: NullOr(String)` and `tokenAddress: NullOr(String)` **next to** `balances`, not inside the USDC field. Bump the protocol `v` if the schema rules require it; do not silently extend a struct the client decodes strictly.
4. `apps/server/src/session.ts` `walletSummary()` — fetch the token `balanceOf(signer)` in the existing `Promise.all` with USDC/HBAR. Leave `totalUsdMicros` as USDC+HBAR only.
5. `apps/web/src/lib/wallet-view.ts` — a `tokenRaw` that is **not** converted with USDC’s 6 decimals.
6. `apps/web/src/components/wallet/wallet-breakdown.tsx` — a third row: ticker, raw formatted 18-decimal amount, Basescan link. Label it as a separate asset, not as money.
7. Tests: `wallet-view.test.ts`, a session test that a missing token RPC keeps `totalUsdMicros` intact, e2e that the dollar figure does not include the token.

**Day 2 — Privy dashboard, not Privy policy.**

- Asset watchlist: the token on `eip155:8453`.
- Confirm gas sponsorship covers `approve` + swap on Base (crypto-deposit setup already required this; verify the budget).
- Do not add a Privy rule for the token. The agent must not be able to dump it.

**Day 3 — Let the person buy, via Privy Swap, not Uniswap execution.**

- Thin wrapper around the swap endpoint already used in `tools/spikes/privy-swap-spike-wallet.ts`: USDC → token, token → USDC, person-signed (owner path in `packages/wallet/src/owner-payments.ts`, same as a human purchase approval).
- Surface: one button on the token row, “Swap with USDC”, which is an approval card (`ActionKind` stays `trade` / `ask`).
- Do **not** flip `uniswapExecutionNetwork` to include `eip155:8453` as a side effect. That comment about rollup operator fees is a real bound; lifting it is its own design, and Clanker pools are v4 besides.

**Day 4 — Airdrop claim in-app (optional, still real).**

- Merkle proof from a static JSON we publish (addresses from `ledger` settled receipts).
- Person signs `claim` on `ClankerAirdrop` / V2 from the browser. Host never holds the token.
- If this slips, claiming on clanker.world is acceptable. Linking the admin/claim URL from Settings is enough.

**Day 5 — Fee locker → treasury, and a holder discount that is not a gate.**

- Call `ClankerFeeLocker` from a documented operator script (not from the agent signer) to collect USDC into the treasury.
- Optional product hook that *is* real: if `balanceOf(signer) ≥ N`, Froggy-sold services (`apps/server/src/service-providers.ts` prices) take a published % off. Enforced in the seller path, not in Privy, not as a login wall. Other agents over x402 still pay USDC at the list price unless they too hold the token in the paying wallet — and we advertise both accepts.

**Explicitly not this week**

- Permit2 x402 accept of the token (`packages/payments/src/evm.ts` + a new person-policy rule + a migration that asks every user to re-sign).
- Token in `KNOWN_ASSETS` / `priceInUsdMicros`.
- Custom v4 hook.
- HTS wrapper / Hashport / LayerZero copy on Hedera.
- `require(balanceOf ≥ 1_000_000e18)` in `auth.ts`.
- Pump.fun or Pons launch “for traction.”
- Uniswap L2 execution.

### Contract and address cheat-sheet (Base mainnet, from Clanker docs retrieved 10 Sep 2026)

Do not treat these as “ours.” They are Clanker’s factory and modules. Our token address does not exist until we deploy.

| Piece | Address | Role |
| --- | --- | --- |
| Clanker factory v4.0 | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` | `deployToken(DeploymentConfig)` |
| ClankerHookStaticFeeV2 | `0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC` | v4.1 static fee hook |
| ClankerHookDynamicFeeV2 | `0xd60D6B218116cFd801E28F78d011a203D2b068Cc` | v4.1 dynamic fee hook |
| ClankerFeeLocker | `0xF3622742b1E446D92e45E22923Ef11C2fcD55D68` | claim creator USDC |
| ClankerLpLockerFeeConversion | `0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496` | LP + fee split, up to 7 recipients |
| ClankerVault | `0x8E845EAd15737bF71904A30BdDD3aEE76d6ADF6C` | team lock; min 7d |
| ClankerAirdrop | `0x56Fa0Da89eD94822e46734e736d34Cab72dF344F` | merkle; min 1d |
| ClankerAirdropV2 | `0xf652B3610D75D81871bf96DB50825d9af28391E0` | merkle rotatable |
| Native USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | pair and reward token |
| WETH (only if we ignore the USDC advice) | `0x4200000000000000000000000000000000000006` | Clanker default pair |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | later x402 / Uniswap |
| Froggy treasury | `0x8Cc232c9EB25b4b20ee448106858e3B6281708C2` | creatorRewardRecipient |
| Graph x402 payee | `0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB` | do not mix with token fees |
| HCS topic | `0.0.10847557` | notarize deploy + merkle |
| Uniswap Universal Router on Base (already in tree) | `0x6fF5693b99212Da76ad316178A184AB56D299b43` | quotes; not our execution net |

UI for a non-SDK deploy: [clanker.world/deploy](https://www.clanker.world/deploy). SDK: [`clanker-devco/clanker-sdk`](https://github.com/clanker-devco/clanker-sdk) `deployTokenV4`. Docs: [Token Deployments](https://clanker.gitbook.io/documentation/general/token-deployments) (page “last updated 2 months ago” as of today — still the live v4.0.0 writeup).

### File-level map for the week-after UI slice

| File | Change |
| --- | --- |
| `packages/wallet/src/erc20.ts` | Reuse `encodeBalanceOf`. No new encoder. |
| `apps/server/src/services.ts` | `Balances.token`. Same cache/retry as USDC. |
| `packages/protocol/src/app.ts` | `WalletSummary` token fields. Strict decode. |
| `apps/server/src/session.ts` | Parallel `balanceOf`. Do not fold into `totalOf()`. |
| `apps/web/src/lib/wallet-view.ts` + `.test.ts` | Raw 18-decimal format. Unknown ≠ 0. |
| `apps/web/src/components/wallet/wallet-breakdown.tsx` | Third row, not money. |
| `apps/web/src/components/wallet/wallet-home.tsx` | Leave the hero as USDC+HBAR. |
| `packages/domain/src/money.ts` | Do not add the token to `KNOWN_ASSETS` this week. |
| `packages/wallet/src/person-policy.ts` | Do not add a rule. |
| `docs/privy-agent-policy.json` | Do not touch. App-wide fallback is USDC-only on purpose. |
| `packages/payments/src/evm.ts` | Leave EIP-3009. Permit2 is a later payer. |
| `apps/server/src/trading/uniswap-execution.ts` | Do not “just add Base.” |
| `apps/server/src/environment.ts` | One `froggyToken` pin, same style as `usdc`. |

---

## Sources

Live or near-live (within 90 days of 10 Sep 2026):

- MemeFees launchpad ranking, snapshot 2026-09-10 13:45 UTC. https://memefees.com/launchpads
- MemeFees pump.fun page, fees 2026-09-10 13:51 UTC. https://memefees.com/launchpads/pump-fun
- DefiLlama Hedera chain, fetched 10 Sep 2026. TVL $26.35M, DEX $1.76M/24h. https://defillama.com/chain/hedera
- DefiLlama Hedera DEX ranking, fetched 10 Sep 2026. $1.64M/24h, SaucerSwap $1.63M. https://defillama.com/dexs/chain/hedera
- DefiLlama Base DEX ranking, fetched 10 Sep 2026. $1.153B/24h. https://defillama.com/dexs/chain/base
- DexPaprika Base, 2026-09-10 12:09 UTC. $952.29M 24h. https://dexpaprika.com/base
- Hedera network fees table, TokenCreate $1.00, TokenAirdrop $0.10, TokenAssociate $0.05. Page updated 10 Jul 2026, fetched 10 Sep. https://docs.hedera.com/networks/fees
- Hedera HTS create-from-EVM, ~$1, unused gas refunded, excess msg.value not. 5 Jun 2026. https://docs.hedera.com/evm/hedera-services/hts-solidity/create-tokens
- Clanker token deployments (v4.0.0, 100B, extensions, 7d/1d mins). Docs “last updated 2 months ago” as of 10 Sep. https://clanker.gitbook.io/documentation/general/token-deployments
- Clanker creator rewards / 20% protocol cut. Same vintage. https://clanker.gitbook.io/documentation/general/creator-rewards-and-fees
- Clanker deployed contracts, Base 8453 v4.0.0 and v4.1.0. https://clanker.gitbook.io/documentation/references/deployed-contracts
- Clanker v4 module list (vault, airdrop, fee locker, hooks). https://clanker.gitbook.io/documentation/references/core-contracts/v4
- Clanker factory GitHub README, Base addresses. https://github.com/clanker-devco/v4-contracts/blob/main/README.md
- Privy fetch balance, custom `token=chain:address`, 8 Sep 2026. https://docs.privy.io/wallets/gas-and-asset-management/assets/fetch-balance
- Privy swap overview, Base in the EVM table, 18 Aug 2026. https://docs.privy.io/wallets/actions/swap/overview
- Privy transfer custom assets / Asset watchlist, 24 Aug 2026. https://docs.privy.io/wallets/actions/transfer/overview
- Privy product updates: custom tokens in dashboard (April 2026); Solana swap (later 2026). https://docs.privy.io/changelogs/product-updates
- Coinbase: x402 any ERC-20 via Permit2, 18 Mar 2026 (older than 90 days, still the protocol change). https://www.coinbase.com/en-ca/developer-platform/discover/launches/x402-ERC20
- Coinbase x402 network support, all ERC-20 via Permit2 on EVM. https://docs.cloud.coinbase.com/x402/network-support
- Uniswap Foundation ETHOnline 2026 prize page. https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation
- Uniswap Labs, routing for hooked pools, 3 Sep 2026. https://support.uniswap.org/hc/en-us/articles/48291859140621-Routing-for-hooked-pools
- Virtuals fee delegation / 70–30 of 1%, 14 Aug 2026. https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer/fee-delegation-for-ai-agent-token-launches
- Virtuals capital formation, 42k VIRTUAL graduation, 10-year LP lock, 25 Aug 2026. https://whitepaper.virtuals.io/about-virtuals/capital-formation-layer
- Base.org “Launch a Token” (Zora / Clanker / Flaunch), 23 Aug 2026. https://docs.base.org/get-started/launch-token
- Scaffold HBAR, fetched 10 Sep 2026. https://hedera.com/scaffold-hbar/
- Bitquery, Robinhood vs Solana memes, 3 Sep 2026 (August weeklies). https://bitquery.io/investigations/robinhood-vs-solana-memecoins
- CryptoBriefing, Base B20 $1B DEX volume, 3 Sep 2026. https://cryptobriefing.com/base-billion-dex-volume-b20-tokens/
- This repo: `docs/evidence/PRIVY.md`, `docs/evidence/HEDERA.md`, `docs/evidence/MAINNET_RELEASE.md`, `docs/decisions/0009-privy-holds-the-hedera-key.md`, `docs/decisions/0019-user-owned-policies.md`, `docs/privy-agent-policy.json`, `packages/wallet/src/{erc20,person-policy,privy}.ts`, `packages/payments/src/evm.ts`, `packages/protocol/src/app.ts`, `packages/domain/src/{money,authority}.ts`, `apps/server/src/{session,services}.ts`, `apps/server/src/trading/{uniswap,uniswap-execution,uniswap-transactions}.ts`, `apps/web/src/{lib/wallet-view.ts,components/wallet/*}`.

Older than 90 days, still cited because nothing newer replaced them:

- HeadStarter × SaucerSwap whitelist + $3,000 LP, 14 Dec 2025. https://www.saucerswap.finance/blog/headstarter-x-saucerswap-token-whitelisting
- SaucerSwap V3 announcement (CLOB, Q2 2026), 27 Feb 2026. https://www.saucerswap.finance/blog/introducing-saucerswap-v3
- OpenLiquid Solana vs Base launch comparison, 20 Mar 2026 — DexScreener thresholds in that article were not re-measured today.

X: keyword and semantic searches on 10 Sep 2026 returned spam, a 5 Sep Base-launch shill, and a 9 Jul note that Base B20 memes were running; they did not contradict the MemeFees ranking. They are not used as evidence of liquidity.

---

## What I could not find out

- **Current production user count and the list of Privy signer addresses.** Evidence from 7 Sep named three Ethereum wallets. I did not query `froggy_mainnet` or the Privy dashboard. An airdrop merkle cannot be built from this document alone.
- **Whether Clanker.world’s UI exposes USDC pairing and AirdropV2 without a partner API key.** The authenticated deploy API documents `pool.pairedToken` and `charmsUsdc` (page dated 8 Jul 2026). The public `/deploy` UI may still default to WETH. Confirm with a dry run (`dryRun: true` on the API, or a Base Sepolia deploy) before mainnet.
- **Exact ETH/USDC the Clanker UI will pull from the deployer** for a USDC-paired pool with 70% LP and no dev-buy. Not published as a single number. Treasury on 7 Sep had ~0.022 ETH — possibly too little if the UI still wants a WETH-side seed. Fund the *deployer*, not the treasury, with a published amount after the dry run.
- **Whether Privy’s swap router will pick a Clanker v4 hooked pool** the same day, or only after Uniswap Labs allowlisting. Static-fee hooks without `*ReturnsDelta` / `dynamicFees` / `0x91…` addresses are auto-routed per the 3 Sep Uniswap note; DynamicFeeV2 likely needs allowlisting. Prefer StaticFeeV2 if we want routing on day one.
- **Hedera meme volume that MemeFees might be missing.** Absence from their directory is strong but not proof that zero HTS memes traded on SaucerSwap today. I did not pull a SaucerSwap API snapshot of long-tail pairs. Even a generous reading cannot close a 500× gap to Base DEX.
- **HeadStarter 2026 launch volume.** No current dashboard found. The 2025 whitelist post is the latest process I could pin.
- **Whether a person-owned Privy policy can express “deny all unless `balanceOf(token) ≥ N`.”** Privy’s policy engine matches call fields, not ERC-20 balances of the sender. I did not find a `balanceOf` condition. Treat “token-gate inside Privy” as unavailable; gate in our host if ever.
- **Live Froggy Uniswap quotes for a not-yet-deployed token.** Cannot be measured. Execution on Base is disabled in code regardless.
- **Legal / offering status in the team’s jurisdictions.** Out of scope for this file; a public Clanker launch with a team vault is still a token launch.
- **A ticker and a name.** The team has not picked one. Do not let the deployer EOA pick it in the Clanker UI under time pressure without Jonas looking at the image and the symbol.
