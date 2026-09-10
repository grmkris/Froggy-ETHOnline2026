# Uniswap v4 hooks and on-chain fee routing for Froggy

Researched 10 September 2026. ETHOnline deadline is Sunday 13 September 18:00 CEST. This is a shipping brief, not a whitepaper.

Froggy today: a person gets a Privy embedded wallet and gives their agent an allowance, not keys. Spending rules live in a Privy policy the person owns. Agents buy real services over x402 (search, X, inference, images, speech, browsing). Settlements are USDC on Base and HBAR on Hedera mainnet, notarised to Hedera Consensus Service. Froggy also sells those services to other agents over x402. Live app: https://app-production-58dd.up.railway.app.

## Thirty-second summary

- A Uniswap v4 hook can take a cut of every swap and send it to a treasury. That is shipped, audited-at-the-core, and live on Base. It cannot be bolted onto an existing pool, cannot force Uniswap/1inch/0x to route to you, and cannot safely sit in a transfer-tax token.
- The cleanest way to send **token trading fees** to Froggy's product treasury is not a custom hook this weekend. Either (a) be the LP and collect v4 position fees, or (b) launch through Clanker or Flaunch, whose hooks already split swap fees to a creator locker. Both of those hooks are already on Uniswap's routing allowlist.
- The cleanest way to send a slice of **x402 revenue** (USDC on Base, HBAR on Hedera) to token holders is off-chain: accumulate the spread, periodically buy the token on the open market, burn it. That is what Hyperliquid does at scale. On-chain staking that pays USDC to stakers is a three-to-seven-day job and smells like a dividend under Howey.
- Do not ship a transfer-fee ERC-20. Uniswap's own v3 docs still say routers will not support them; v4 PoolManager accounting assumes exact amounts; aggregators skip or mis-route them. Pons spent 9 September 2026 explaining that terminals were routing its token into high-tax pools that were not its 1% hook pool.
- A three-person team with a Sunday deadline should launch a vanilla ERC-20 on Base, a vanilla or Clanker v4 pool, and a documented buyback script. A custom `afterSwapReturnDelta` hook, a staking contract, and a 1-million-token gate are post-hackathon.

## 1. What a Uniswap v4 hook can and cannot do on Base

Uniswap v4 is live on Base. Canonical addresses, confirmed against Uniswap's deployments page on 10 September 2026:

| Contract | Base address |
| --- | --- |
| PoolManager | [`0x498581fF718922c3f8E6A244956aF099B2652b2b`](https://basescan.org/address/0x498581fF718922c3f8E6A244956aF099B2652b2b) |
| PositionManager | [`0x7C5f5A4bBd8fD63184577525326123B519429bDc`](https://basescan.org/address/0x7C5f5A4bBd8fD63184577525326123B519429bDc) |
| StateView | [`0xa3c0c9b65bad0b08107aa264b0f3db444b867a71`](https://basescan.org/address/0xa3c0c9b65bad0b08107aa264b0f3db444b867a71) |
| V4Quoter | [`0x0d5e0f971ed27fbff6c2837bf31316121532048d`](https://basescan.org/address/0x0d5e0f971ed27fbff6c2837bf31316121532048d) |
| Universal Router | [`0x6fF5693b99212Da76ad316178A184AB56D299b43`](https://basescan.org/address/0x6fF5693b99212Da76ad316178A184AB56D299b43) |
| Permit2 | [`0x000000000022D473030F116dDEE9F6B43aC78BA3`](https://basescan.org/address/0x000000000022D473030F116dDEE9F6B43aC78BA3) |

A hook is an external contract whose address is part of the pool's `PoolKey` (`currency0`, `currency1`, `fee`, `tickSpacing`, `hooks`). Same pair + different hook = different pool. The hook is chosen at `PoolManager.initialize` and **cannot be added, removed, or swapped later**.

The PoolManager calls the hook at up to ten lifecycle points, plus four "return delta" flags that let the hook take or give currency. Permissions are not stored in a registry. They are the **lowest 14 bits of the hook's own address**. You mine a CREATE2 salt until those bits match `getHookPermissions()`. `BaseHook` reverts on deploy if they do not.

### What a hook can do

- Run logic before/after initialize, add/remove liquidity, swap, donate.
- Override the LP fee on a **dynamic-fee** pool (`key.fee == 0x800000`) from `beforeSwap`, by returning a `uint24` with bit `0x400000` set and a value ≤ `1_000_000` (100%, in hundredths of a bip).
- Call `poolManager.updateDynamicLPFee` to change the stored LP fee.
- Take a **hook fee** independent of the LP fee, by returning a delta from `beforeSwap` (`BeforeSwapDelta`) and/or `afterSwap` (`int128` unspecified-currency delta) and calling `poolManager.take` or minting ERC-6909 claims. Official docs recommend charging the unspecified currency in `afterSwap`.
- Block initialize, swap, or liquidity ops by reverting.
- Route taken fees to a treasury, a locker, a bid-wall, a referrer encoded in `hookData`, or a staking contract. The PoolManager does not care who the recipient is.
- Serve many pools from one hook contract.

### What a hook cannot do

- Attach to a pool that already exists.
- Change its permission bits after deploy (the address is the API). A proxy can change implementation while keeping bits; that is a separate, larger trust surface. Trail of Bits (30 July 2026) says prefer immutable versioned deploys.
- Force Uniswap Labs' interface, Universal Router, 1inch, or 0x to route through the pool. Uniswap's docs are explicit: "just because you made a hook, that does not mean you will get liquidity routed to your hook from the Uniswap frontend." Routing is an allowlist plus a UniswapX filler path.
- Reliably see the original EOA. `msg.sender` in the hook is the PoolManager. The `sender` argument is the router. Getting the EOA requires a trusted-router list and `IMsgSender.msgSender()`.
- Take Uniswap's **protocol fee**. That is a governance-controlled cut, capped at 10 bps (1,000 pips) per pool, currently live on v2 and selected v3, still a temp-check for v4 as of 7 July 2026.
- Make a fee-on-transfer ERC-20 work. The PoolManager settles exact deltas. A tax in `_transfer` desyncs those deltas.
- Survive a revert in a callback. If `afterSwap` or `afterRemoveLiquidity` reverts, the user's swap or withdrawal reverts. Optional logic (reward distribution, oracles, dust) that reverts bricks the pool.

v4 has three fee layers that can coexist: **LP fee** (to in-range LPs), **protocol fee** (Uniswap governance, max 0.1%), **hook fee** (your contract). Hook fees are not a share of the LP fee unless you write them that way. They are extra, taken via custom accounting.

## 2. Permissions that actually matter for fee routing

From `IHooks` / `Hooks.sol`. Bits that Froggy would set for a treasury-fee hook:

| Flag | Why it matters |
| --- | --- |
| `beforeSwap` | Override LP fee on dynamic-fee pools; take a fee on the specified currency via `BeforeSwapDelta`. |
| `afterSwap` | See actual swap deltas; take a fee on the unspecified (usually output) currency. |
| `beforeSwapReturnDelta` | Without this bit, a non-zero `BeforeSwapDelta` is treated as zero. The Sorella Angstrom finding: missing `afterSwapReturnDelta` made every swap revert with `CurrencyNotSettled()` once the fee was turned on. |
| `afterSwapReturnDelta` | Required to actually debit the swapper for an `afterSwap` fee. |
| `beforeInitialize` | Allowlist which pools may attach this hook. Skip this and anyone can create a malicious pool with your hook and your accounting. Trail of Bits pattern #2. |
| `beforeAddLiquidity` / `beforeRemoveLiquidity` | Only if you need to gate LPs (fair-launch lock, bid-wall). Dangerous: a revert here traps LP funds. |

A minimum treasury-fee hook is: `afterSwap` + `afterSwapReturnDelta` (+ `beforeInitialize` to bind the pool). That is exactly OpenZeppelin's `BaseHookFee` (uniswap-hooks v1.2.0, experimental).

Dynamic LP fee is a **different** knob. It changes what LPs earn, not what the hook takes. Clanker uses both: `beforeSwap` calls `updateDynamicLPFee`, then takes a protocol cut with return-delta.

## 3. Live Base examples that take a fee and route it

These are deployed, verified, and (for Clanker and Flaunch) on Uniswap's routing allowlist in [`uniroute-public/.../hooksAddressesAllowlist.ts`](https://github.com/Uniswap/uniroute-public/blob/main/src/lib/poolCaching/util/hooksAddressesAllowlist.ts) as of this research.

### Clanker — the production memecoin fee split on Base

Source: [clanker-devco/v4-contracts](https://github.com/clanker-devco/v4-contracts). Docs dated 1 July 2026.

| Contract | Base address |
| --- | --- |
| Factory `Clanker` | [`0xE85A59c628F7d27878ACeB4bf3b35733630083a9`](https://basescan.org/address/0xE85A59c628F7d27878ACeB4bf3b35733630083a9) |
| `ClankerFeeLocker` | [`0xF3622742b1E446D92e45E22923Ef11C2fcD55D68`](https://basescan.org/address/0xF3622742b1E446D92e45E22923Ef11C2fcD55D68) |
| `ClankerHookStaticFee` v4.0 | [`0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC`](https://basescan.org/address/0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC) |
| `ClankerHookDynamicFee` v4.0 | [`0x34a45c6B61876d739400Bd71228CbcbD4F53E8cC`](https://basescan.org/address/0x34a45c6B61876d739400Bd71228CbcbD4F53E8cC) |
| `ClankerHookStaticFeeV2` | [`0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC`](https://basescan.org/address/0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC) |
| `ClankerHookDynamicFeeV2` | [`0xd60D6B218116cFd801E28F78d011a203D2b068Cc`](https://basescan.org/address/0xd60D6B218116cFd801E28F78d011a203D2b068Cc) |

Mechanism, from Clanker's own docs and the verified V2 source:

- Token is a vanilla ERC-20, 100,000,000,000 supply, 18 decimals.
- Pool is a Uniswap v4 **dynamic-fee** pool (`fee = 8388608 = 0x800000`).
- Creator sets static bps per direction (default 1% / 100 bps) or a dynamic curve (example: 0.5% base, 5% max).
- **Clanker protocol fee = 20% of the active LP fee, always taken in the paired token (WETH/USDC), via `BeforeSwapDelta` / `AfterSwapDelta`.** Example: 1% creator LP fee + 0.2% Clanker = 1.2% total. DefiLlama's Clanker adapter documents this as "20% of the creator fee on top."
- LP fees accrue to `ClankerFeeLocker`; up to 7 reward recipients with bps splits in `ClankerLpLockerFeeConversion`.
- Max LP fee 30%. Clanker itself says fees that high will not work with every router.
- Fees lag by one swap (PoolManager only credits LP fees after the swap completes).

Uniswap Labs' v4 hook explorer (Dune, snapshot retrieved 10 September 2026) puts Clanker at ~$518k L24H volume, ~$2.9B lifetime, ~1M initialized pools across Base / Unichain / Arbitrum / BNB / Robinhood. MemeFees (10 September 2026, 13:45 UTC) lists Clanker Base at **$7.0k fees / 24h**.

If Froggy launches on Clanker, "trading fees to the product treasury" is a locker recipient bps split, not a new hook.

### Flaunch — creator cut + automated buybacks

Source: [flayerlabs/flaunchgg-contracts](https://github.com/flayerlabs/flaunchgg-contracts). SDK changelog 8 September 2026.

| Contract | Base address |
| --- | --- |
| PositionManager (hook) v1.3 | [`0x23321f11a6d44fd1ab790044fdfde5758c902fdc`](https://basescan.org/address/0x23321f11a6d44fd1ab790044fdfde5758c902fdc) |
| AnyPositionManager | [`0x8DC3b85e1dc1C846ebf3971179a751896842e5dC`](https://basescan.org/address/0x8DC3b85e1dc1C846ebf3971179a751896842e5dC) |
| BidWall | [`0x7f22353d1634223a802D1c1Ea5308Ddf5DD0ef9c`](https://basescan.org/address/0x7f22353d1634223a802D1c1Ea5308Ddf5DD0ef9c) |
| BuyBackAction | [`0xDa4866c97E3414b920663041C680012D6Ee296bE`](https://basescan.org/address/0xDa4866c97E3414b920663041C680012D6Ee296bE) |
| FeeDistributor (in the hook) | see `src/contracts/hooks/FeeDistributor.sol` |

Mechanism:

- The PositionManager **is** the Uniswap v4 hook. Permission suffix documented as `25DC` / `2FDC` depending on version.
- `afterSwap` captures swap fees, pays an optional referrer from `hookData`, splits the rest across creator / protocol / bid-wall / governance. `MAX_PROTOCOL_ALLOCATION = 10_00` (10% in their 2-decimal units).
- Creator can take 0–100% of remaining revenue. Rest fills a Progressive Bid Wall (0.1 ETH limit order just below spot) — an automated buyback, not a holder dividend.
- Creator revenue is streamed in flETH (`0x000000000d564d5be76f7f0d28fe52605afc7cf8`), not in the memecoin, so claiming does not dump the token.
- Dune (filarm/flaunch, updated ~25 August 2026) and Uniswap's hook explorer put Flaunch at ~$29k L24H volume, ~$384M lifetime, ~150k pools — smaller than Clanker right now.

Flaunch is the closest shipped "hooks for fee sharing + buybacks" product. Using it means Froggy does not own the hook, and Team Finance does not currently lock v4 positions on Base (TrustSwap, August 2026).

### SuperStrategy — 2% swap fee, 0.30% to a protocol receiver

Hooklist (updated 1 September 2026): Base [`0x1e0c810a30fb82391df936602c1161421381b0c8`](https://basescan.org/address/0x1e0c810a30fb82391df936602c1161421381b0c8). Also in Uniswap's allowlist as `SUPERSTRATEGY_HOOK_ON_BASE`. Description: 2% on each swap, auto-compounds reserves, forwards 0.30% to a protocol fee receiver, MM whitelist for fee-free trades. Flags: `beforeSwap`, `afterSwap`, `beforeSwapReturnsDelta`.

### aeon.fun DynamicFee — 10 bps to a compile-time treasury

Base [`0x723b16eF13a1b9A2BD63238BEC47cDF1d4A010C4`](https://basescan.org/address/0x723b16eF13a1b9A2BD63238BEC47cDF1d4A010C4). Operator-gated audit dated **7 September 2026**: immutable, no owner, no proxy, `poolManager.take()` sends a fixed 10 bps to treasury [`0xF1E958db7D1e4C074377946018Ad645db4FB158e`](https://basescan.org/address/0xF1E958db7D1e4C074377946018Ad645db4FB158e). LP fee 0.05–5% from previous swap's tick move. This is the smallest "fee to treasury" shape on Base that I found with a public on-chain audit note.

### Stockify — 3% hook fee, 90% buys tokenized equities for holders

X post 6 September 2026 ([@FollowtheFloow_](https://x.com/FollowtheFloow_/status/2096612256142209378)): 3% hook fee on ETH/$STFY Uniswap v4 trades; 90% to a keeper that buys B20 tokenized equities into holder wallets pro-rata, no staking. Hook is on Uniswap's allowlist as `STOCKIFY_FEE_HOOK_ON_BASE` [`0x47ec48c74f3069e9ae69406197821996d80200cc`](https://basescan.org/address/0x47ec48c74f3069e9ae69406197821996d80200cc). I did not independently verify the 90% split on-chain; treat the tweet as a claim.

### OpenZeppelin BaseHookFee — the copy-paste shape

[`uniswap-hooks/src/fee/BaseHookFee.sol`](https://github.com/OpenZeppelin/uniswap-hooks/blob/master/src/fee/BaseHookFee.sol), v1.2.0. Marked **experimental**. `_afterSwap` computes `feeAmount = unspecifiedAmount * hookFee / 1e6`, takes it as ERC-6909 claims on the hook, returns that delta. Implementer must write `handleHookFees(Currency[])` to withdraw claims to a Safe. Permissions: `afterSwap` + `afterSwapReturnDelta` only.

v4-by-example `FixedHookFee` is the same idea with a flat amount instead of a percentage: https://www.v4-by-example.org/fees/fixed-hook-fee

### dngr2/v4-fee-hooks — bounded 0.05% three-way split

https://github.com/dngr2/v4-fee-hooks — `RevenueSplitHook` takes `HOOK_FEE_BIPS = 5` (0.05% of output), splits protocol / referrer / creator, wei-conserved. `FeeShareStaking` is a Synthetix/MasterChef accumulator on top. I did not find a Base mainnet deployment of this suite.

## 4. Gas and audit risk

### Gas

Base sequencer gas at the time of this research was on the order of 0.005 gwei (BaseScan page chrome, 10 September 2026). Absolute ETH cost of an extra 30k gas is negligible. The constraint is **routing heuristics and revert risk**, not the user's wallet.

Measured numbers:

- CodesenSys EWMA dynamic-fee hook (Sepolia traces, documented in their README): `beforeSwap` ~15.9k, `afterSwap` ~13.1k, **~29k total hook overhead** on top of a vanilla v4 swap. Packed storage saves ~14.4k vs three slots.
- Uniswap routing allowlist assigns **50k–500k** extra `gasOverheadPerHop` to hooks whose callbacks do real work (Slipstream aggregator on Base: 500k, calibrated 8–9 September 2026). A custom Froggy hook that is not on that list is either ignored or under-estimated; under-estimation becomes the tx gas limit and reverts (`TRANSFER_FROM_FAILED` at Permit2 settle). That comment is in Uniswap's own allowlist source.
- Clanker warns that a 30% LP fee will not work with every router. High hook fees have the same problem: quoter simulation must match execution.

ERC-6909 `mint` of fee claims (OpenZeppelin `BaseHookFee`) is cheaper than `take` of ERC-20 every swap. Withdraw later in `handleHookFees`.

### Audit risk — this is the real cost

Uniswap v4-core was reviewed by Trail of Bits (report dated July 2024, still the cited core review). **Hooks are application code.** Trail of Bits, 30 July 2026: the Cork exploit (~$12M, May 2025) and the Bunni exploit ($8.4M, September 2025) were hook/accounting bugs, not PoolManager bugs. Recurring patterns:

1. Missing `onlyPoolManager` on callbacks.
2. Anyone can initialize a pool with your hook; attacker-chosen tokens reenter.
3. Custom accounting leaks value even when settlement succeeds (Bunni: 44 tiny withdrawals, rounding).
4. Logic in the wrong callback (`beforeSwap` seeing pre-swap state).
5. Address bits ≠ implemented functions (Angstrom: all swaps revert).
6. Non-essential revert bricks withdrawals.
7. Shared scratch state across nested swaps / multi-pool hooks.

OpenZeppelin uniswap-hooks is labelled experimental and "as is." Composing `BaseHookFee` is still a custom contract. I could not find a 2026 price list for a v4-hook audit; historically this is weeks and a five-figure USD invoice, not a weekend Foundry test.

A three-person team cannot honestly "audit" a custom hook before Sunday. They can inherit `BaseHook`, keep it immutable, fuzz deltas, and still be one rounding bug away from Bunni.

## 5. Alternatives to a custom hook

### Transfer-fee / tax tokens — do not

Uniswap Developers, page updated 25 August 2026, still covering v3 and pointing at v4: **"Fee-on-transfer tokens will not function with our router contracts. ... We will not be making a router that supports fee-on-transfer tokens in the future."** Rebasing tokens shift loss onto LPs.

v4 is worse, not better: PoolManager flash accounting assumes the amount sent equals the delta. A tax in `_transfer` makes settlement fail or silently leak. Trail of Bits lists fee-on-transfer as a token behaviour you must explicitly support and test.

Aggregator reality:

- Uniswap Labs interface warns on buy/sell tax via GoPlus (support article, updated ~20 May 2026).
- 0x Swap API: "supports all tokens by default except those blocked for compliance" — not a FOT guarantee; simulation mismatch drops the route.
- Binance Web3 Trading API (docs 9 September 2026) hard-errors `TAX_TOKEN_FEE_CONFLICT` (40470) when you try to attach a referral fee on the same side as a tax token.
- Trading Strategy docs (updated 9 September 2026): taxed tokens are treated as honeypot-adjacent; tax that governance can flip to 100% is a rug.

Pons, 9 September 2026 (HTX/community): founder Ozzy had to explain that terminals were routing Pons tokens into **other** high-tax v4 pools, not the official 0% token-tax / 1% hook-fee pool. Users saw "tax > 1%" and assumed the protocol changed the tax. That is what a tax token plus multiple pools looks like in the wild, this week.

Uniswap's own routing allowlist includes `SIMPLE_SELL_TAX_HOOK_ON_BASE` and `TAX_HOOK_ON_BASE` — those are **hook** taxes, not ERC-20 transfer taxes. If you want a sell tax, put it in the hook, not in `_transfer`.

### Uniswap "fee switch" — not yours

UNIfication (proposal 79, passed ~26 December 2025) turned on protocol fees on v2 and selected v3, routing them into UNI burns via TokenJar/Firepit. v4 protocol fees are a separate governance temp-check (7 July 2026): static pools, CCA pools, aggregator-hook pools. **Froggy cannot flip a Uniswap fee switch on its pool.** The protocol fee controller is Uniswap's, capped at 10 bps, and currently not the mechanism you want. A hook fee is the app-level equivalent.

### Buyback-and-burn from off-chain revenue — the thing that actually ships

Hyperliquid is the 2026 reference:

- ~97–99% of trading fees to an Assistance Fund that buys HYPE on the open market continuously.
- Fund address `0xfefefefefefefefefefefefefefefefefefefefe` has no private key.
- December 2025 validator vote (85% for) treats the balance as burned.
- CoinMarketCap Academy, 10 September 2026: crypto buybacks hit a 2026 record $638M; Hyperliquid ~$370M, Pump.fun ~$200M, together ~90% of the year's buybacks.
- Unlocks.app (30 July 2026) and Coinjuice (page dated 10 September 2026) disagree on trailing numbers ($932M vs ~$1.3B cumulative). I am not reconciling those; the mechanism is what matters.

GMX (docs current 2026): 27% of fees buy back GMX (DAO Tally vote); 63% to GM LPs; 10% treasury. Direct ETH distributions to stakers were paused; buybacks accumulate until a $90 GMX trigger that is not close (May 2026 price ~$6.73). That is the other honest pattern: **buy the token, don't promise a cash dividend.**

Pump.fun locked 50% of net revenue into automatic PUMP buybacks for one year (CoinMarketCap, 10 September 2026).

For Froggy this is a script, not a hook: treasury USDC (and converted HBAR) → swap on the FROGGY/USDC or FROGGY/WETH v4 pool → `burn` or send to `0xdead`. Publish every tx.

### Staking contracts that pay from a revenue stream

Canonical shape: Synthetix `StakingRewards.sol` — `stake` / `withdraw` / `getReward` / `notifyRewardAmount`. Modern copies:

- [solidity-by-example.org/defi/staking-rewards](https://solidity-by-example.org/defi/staking-rewards)
- [Synthetixio/fixed-staking-rewards](https://github.com/Synthetixio/fixed-staking-rewards) (Solidity ^0.8.29)
- Berachain `StakingRewards` (abstracted from Synthetix)
- dngr2 `FeeShareStaking` (checkpoint-before-balance, MasterChef-style)

Known footguns, still open in 2026 writeups: if `notifyRewardAmount` runs with `totalSupply == 0`, rewards leak until the first staker (0xMacro, 2022; still cited in 2024–2026 audit contests). Overflow if `rewardRate` is huge (SIP-68). First-staker griefing.

GMX's original `RewardTracker` stack (ETH to stakers) is the high-complexity version of the same idea. They moved toward buybacks.

**Howey smell is high.** Paying USDC to people because they hold FROGGY, from Froggy's operating revenue, is the textbook "profits from the efforts of others." See section 7.

### Off-chain rev-share, paid on-chain

Same as buyback, without the burn: a Safe holds USDC, a weekly tx sends USDC to a Merkle distributor or to a staking contract's `notifyRewardAmount`. The on-chain part is a payment, not a promise encoded in the token. Transparency is a public spreadsheet plus the txs. This is how a three-person team actually does "holders get a cut" without writing a hook.

### Token-gated access ("require 1 million tokens")

This is an app check, not a hook: `IERC20(froggy).balanceOf(person) >= N` before MCP/service/workspace use.

Problems specific to Froggy:

- **Supply first.** Clanker mints 100 billion. 1 million tokens is 0.001% of supply — not a gate. 1 million of a 1 million supply is "only the deployer." Pick N as a percent of circulating supply, not a meme number.
- **It fights the product.** Froggy sells services to other agents over x402 in USDC/HBAR. An external agent that must first acquire FROGGY cannot pay the rail you just built. ADR 0010 is "one service task across the workspace and external agents."
- **Wash trading.** A gate that is cheap to satisfy gets farmed; a gate that is expensive keeps customers out.
- **Privy policy is the wrong place.** The leash is spending authority. Do not put a token-balance check in the policy that the person owns.

A less-bad variant: optional FROGGY payment rail (pay the x402 challenge in FROGGY at a posted rate), or a holder **discount**, or burn-to-call (consume tokens per task). Those are utility. A balance gate that does not consume tokens is a club, and clubs do not help x402 sellers.

## 6. Froggy-specific design

Two money flows, already in the product (ADR 0010, marketplace evidence 8 September 2026):

1. **Seller leg (Hedera).** The person (or an external MCP agent) pays Froggy in HBAR on Hedera mainnet for a catalogued service. Fixed customer prices today: web search $0.01, inference $0.01, X search $0.06, image $0.08, speech $0.10.
2. **Buyer leg (Base).** Froggy's treasury pays suppliers in USDC on Base (You.com, BlockRun) under a Privy treasury policy. Supplier quotes on 7 September 2026: You.com $0.005, BlockRun image $0.053501, inference $0.002, speech $0.002.

The spread (customer price minus supplier cost, minus failed/uncertain jobs) is the only real protocol revenue. It is currently hackathon-scale. Marketplace paid-delivery evidence was still pending as of 8 September 2026. Designing a staking protocol for revenue that does not yet exist is how teams miss the Sunday deadline.

HBAR does not live on Uniswap v4. Hedera's DEX is SaucerSwap (V1 Uniswap-v2-style, V2 concentrated liquidity). Uniswap v4 is not deployed on Hedera. Bridging HBAR/HTS to Base is possible via Axelar/Squid (SaucerSwap bridge, 26 February 2026) but is a second product. **Put the meme coin on Base.** Keep Hedera as the x402 seller rail. Convert HBAR surplus to USDC when you actually have surplus.

### A. Route a slice of x402 revenue to token holders

**Do this:** off-chain buyback.

Contract-level shape: none, for now. Operational shape:

```
Hedera HBAR receipts  →  treasury account (already exists)
Base USDC leftover    →  TREASURY_EVM_ADDRESS (already exists)
once per day/week, if surplus > threshold:
  swap surplus → FROGGY on the canonical v4 pool (Universal Router)
  FROGGY.burn(amount) or transfer(0x000...dEaD, amount)
  post the tx hash next to the Hedera HCS topic id for that day's settlements
```

This matches Hyperliquid's *mechanism* (fee → buy token → remove from supply) without Hyperliquid's *scale* or a keyless system address. Discretionary, so you can stop it. Publish the rule ("50% of net x402 spread") so it is not a surprise.

**Do not do this yet:** `StakingRewards` with USDC rewards. It is the cleanest *on-chain* dividend and the loudest Howey fact pattern. If you later want it, the shape is:

```solidity
// stakingToken = FROGGY, rewardsToken = USDC (Base 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
contract FroggyRevShare is StakingRewards {
    // onlyRewardsDistribution = Froggy treasury Safe
    // notifyRewardAmount(usdc) after each weekly convert-and-send
}
```

Reference: [Synthetix StakingRewards](https://github.com/Synthetixio/synthetix/blob/develop/contracts/StakingRewards.sol), [solidity-by-example](https://solidity-by-example.org/defi/staking-rewards). HBAR rewards would need a second contract on Hedera or a bridge. Dual-chain staking is not a days-scale job.

### B. Route a slice of TOKEN trading fees to the product treasury

Three shipped options, in increasing complexity.

**B0. Be the LP. Weekend.** Vanilla ERC-20, vanilla v4 pool, no hook, fee tier 1% (`10000` hundredths of a bip) or 0.30% (`3000`). Team (or a Safe) holds the v4 Position NFT. `DECREASE_LIQUIDITY` with `liquidity = 0` collects fees (Etherwave tutorial, 10 July 2026). Trading fees **are** the product treasury's, because the product is the LP. Honest, boring, aggregators can route a vanilla pool without an allowlist. Downside: you take LP inventory risk; you do not take a cut of other people's LP.

**B1. Launch on Clanker or Flaunch. Weekend (hours).** Token stays a vanilla ERC-20. Hook is theirs, already allowlisted. Set Froggy's Safe as a Clanker reward recipient (bps of LP fees, claimable in WETH from `ClankerFeeLocker`) or as Flaunch creator (fees in flETH, rest to bid-wall buybacks). Cost: Clanker takes 20% of the LP fee on top; Flaunch takes a protocol allocation up to their cap; you do not own the hook; Clanker supply is 100b. This is how Base memecoins actually launch in 2026.

**B2. Custom `BaseHookFee`. Not a weekend.** Inherit OpenZeppelin `BaseHookFee`, mine CREATE2 flags `AFTER_SWAP | AFTER_SWAP_RETURNS_DELTA | BEFORE_INITIALIZE`, bind one pool in `beforeInitialize`, take 10–30 bps of unspecified output as ERC-6909, `handleHookFees` to a Safe. Immutable, no owner, treasury address in constructor. Then: Foundry fuzz of deltas, a public testnet pool, the Uniswap hook-allowlist form (https://share.hsforms.com/15fMHwt6NTzuKuQdxw6nHwws8pgg), and an auditor. Until allowlisted, Universal Router can still swap if a user pastes the pool, but the Uniswap interface and most aggregators will not find it.

Do **not** combine B2 with a transfer-tax token.

### C. The "1 million tokens to use the app" idea

Do not ship it for ETHOnline. It collides with x402-as-seller. If you want a token hook in the app after the hackathon:

- Holder **discount** on Froggy's customer price (e.g. 10% off if `balanceOf >= 0.1% of supply`), checked in the service layer, not in Privy policy.
- Optional pay-in-FROGGY x402 rail, quoted in USDC terms. Unverified whether Hedera's x402 facilitator will accept a custom token; the MCP-seller PRD already flagged this as unverified on 2026-09 (catalogue currently sells in the native asset only).
- Burn-to-call: spend FROGGY per task. That is consumption, which is the better Howey fact.

### Recommended path for this team, this week

```
Day 0–1  vanilla OZ ERC-20 on Base, mint to a 3/3 Safe, renounce minter
         Clanker launch (or vanilla v4 pool + team LP) against WETH or USDC
Day 1    document: "50% of net x402 spread, when surplus exists, buys and burns"
         no staking, no custom hook, no token gate
Day 2–3  ETHOnline submission, product, video
Later    if volume exists: BaseHookFee, Uniswap allowlist, optional StakingRewards
```

## 7. Trade-offs: tax/regulatory smell, complexity, three people

I am not a lawyer. This is the public-record shape as of 10 September 2026.

On 17 March 2026 the SEC issued Interpretive Release 33-11412 (with CFTC companion guidance) on Howey and crypto. Headline: most crypto assets are not themselves securities; an asset can be *subject to* an investment contract when the issuer makes representations of essential managerial efforts; protocol mining, protocol staking (as described), wrapping, and certain airdrops are carved out. Protocol staking in that release is **PoS validation**, not "stake our app token, receive a share of app revenue."

Cashflow to holders because the team runs Froggy sits on the wrong side of that carve-out:

| Mechanism | Howey-ish smell | Why |
| --- | --- | --- |
| Vanilla meme + no promises | Lower | Joke token, no cashflow claim. Still can be an investment contract at *sale* if you pitch profits. |
| Token gate / burn-to-use | Lower if it is actually used | Looks like a product, not a dividend. |
| Buyback-and-burn, discretionary, from treasury | Medium | Industry-standard 2026; still a profit expectation if you market the yield. Hyperliquid's version is a validator-consensus policy, not a holder right. |
| Hook fee to treasury (product runway) | Medium-low | Treasury of the product, not a payment to holders. |
| `StakingRewards` paying USDC from x402 spread | High | This is a dividend. Common enterprise + efforts of others. |
| Marketing "holders earn Froggy's revenue" | High regardless of mechanism | The pitch is the security. |

CLARITY Act commentary in June 2026 treats "entitlement to a dividend or transfer of value from a person other than a decentralized governance system" as disqualifying from network-token treatment. A Froggy Safe sending USDC to stakers is exactly that transfer of value. Flag and get counsel before promising it in a tweet.

Complexity vs three people vs Sunday:

| Job | Calendar | Who can break it |
| --- | --- | --- |
| OZ ERC-20, mint, renounce | Hours | You, if you leave `mint` on |
| Vanilla v4 pool + LP | Hours | You, if you don't lock/hold the NFT honestly |
| Clanker / Flaunch launch | Hours | Their hook; you don't own it |
| App-side `balanceOf` check | Hours | Product (kills x402 seller) |
| Buyback script + public log | A day | Operational keys; MEV on the buy |
| Custom `BaseHookFee` + tests | Several days | Accounting, CREATE2 flags, routing |
| Uniswap hook allowlist | Unknown wait | Uniswap Labs |
| StakingRewards + dual-chain USDC/HBAR | A week-plus | Empty-pool leak, Howey, bridging |
| Transfer-tax token | Hours to deploy, forever to regret | Every router |

## 8. Contract-level shapes and references to read

**Minimum treasury hook (post-hackathon):**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHookFee, IPoolManager, PoolKey, SwapParams, BalanceDelta, Currency}
    from "uniswap-hooks/src/fee/BaseHookFee.sol";

contract FroggyTreasuryFee is BaseHookFee {
    address public immutable treasury;
    uint24 public immutable hookFee; // e.g. 10_00 = 10 bps in hundredths of a bip? 
                                     // BaseHookFee uses 1e6 = 100%, so 1_000 = 10 bps

    constructor(IPoolManager pm, address treasury_, uint24 hookFee_)
        BaseHookFee(pm)
    {
        treasury = treasury_;
        hookFee = hookFee_;
    }

    function _getHookFee(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        internal view override returns (uint24)
    {
        return hookFee;
    }

    function handleHookFees(Currency[] memory currencies) public override {
        for (uint256 i; i < currencies.length; ++i) {
            // redeem ERC-6909 claims, transfer to treasury
        }
    }
}
```

Read, in this order:

1. [OpenZeppelin BaseHookFee.sol](https://github.com/OpenZeppelin/uniswap-hooks/blob/master/src/fee/BaseHookFee.sol) — the fee take.
2. [v4-by-example FixedHookFee](https://www.v4-by-example.org/fees/fixed-hook-fee) — `afterSwapReturnDelta` + `poolManager.mint`.
3. [Uniswap custom accounting](https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting) — hook fees vs LP fees.
4. [ClankerHook verified source on Base](https://basescan.org/address/0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC#code) — production take of 20% protocol fee in the paired token.
5. [Flaunch FeeDistributor.sol](https://github.com/flayerlabs/flaunchgg-contracts/blob/main/src/contracts/hooks/FeeDistributor.sol) — creator / protocol / bid-wall split.
6. [Trail of Bits, 30 July 2026](https://blog.trailofbits.com/2026/07/30/building-secure-uniswap-v4-hooks/) — the seven failure patterns.
7. [HookMiner](https://github.com/Uniswap/v4-periphery/blob/main/src/utils/HookMiner.sol) — CREATE2 flags.
8. [v4-template](https://github.com/uniswapfoundation/v4-template) — Foundry bootstrap.
9. [Synthetix StakingRewards](https://solidity-by-example.org/defi/staking-rewards) — only if you later pay USDC to stakers.
10. [Uniswap hook allowlist form](https://share.hsforms.com/15fMHwt6NTzuKuQdxw6nHwws8pgg) and [hook-routing docs](https://developers.uniswap.org/docs/protocols/v4/concepts/hook-routing) (page dated 3 September 2026).

Base USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. WETH: `0x4200000000000000000000000000000000000006`.

## Sources

Uniswap / v4

- Uniswap v4 deployments (Base addresses): https://developers.uniswap.org/docs/protocols/v4/deployments — retrieved 10 September 2026.
- Hooks concept: https://developers.uniswap.org/docs/protocols/v4/concepts/hooks — updated 27 August 2026.
- Hook routing / UniswapX fillers: https://developers.uniswap.org/docs/protocols/v4/concepts/hook-routing — 3 September 2026.
- Fees (LP / protocol / hook): https://developers.uniswap.org/docs/get-started/concepts/fees — 25 August 2026.
- IHooks: https://docs.uniswap.org/contracts/v4/reference/core/interfaces/IHooks — 14 April 2026.
- Fee-on-transfer unsupported: https://developers.uniswap.org/docs/protocols/v3/concepts/unsupported-tokens — 25 August 2026.
- Custom accounting / hook fees: https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting
- Fixed hook fee example: https://www.v4-by-example.org/fees/fixed-hook-fee
- Hooklist registry: https://github.com/Uniswap/hooklist — hooklist.json dated 1 September 2026.
- Routing allowlist (Clanker, Flaunch, SuperStrategy, Stockify, tax hooks): https://github.com/Uniswap/uniroute-public/blob/main/src/lib/poolCaching/util/hooksAddressesAllowlist.ts — retrieved 10 September 2026.
- v4 hook explorer: https://dune.com/uniswaplabs/v4-hook-explorer — numbers retrieved 10 September 2026.
- v4 protocol-fee temp-check: https://gov.uniswap.org/t/temp-check-activate-v4-protocol-fees/26162 — 7 July 2026.
- UNIfication: https://blog.uniswap.org/unification — 10 November 2025 (older than 90 days; still the fee-switch origin).
- Etherwave v4 LP tutorial: https://www.etherwavelabs.com/blog/uniswap-v4-vs-v3-liquidity-management-hooks — 10 July 2026.
- Datawallet v4/hooks/UNIfication recap: https://www.datawallet.com/crypto/uniswap-v4-explained — 11 June 2026.

Security

- Trail of Bits, "Building secure Uniswap v4 hooks": https://blog.trailofbits.com/2026/07/30/building-secure-uniswap-v4-hooks/ — 30 July 2026. Cork ~$12M (May 2025), Bunni $8.4M (September 2025).
- OpenZeppelin uniswap-hooks (experimental): https://github.com/OpenZeppelin/uniswap-hooks — BaseHookFee v1.2.0.
- OpenZeppelin Uniswap Hooks docs: https://docs.openzeppelin.com/uniswap-hooks
- Surfing Solodit hook findings (updated 14 January 2026): https://surfing-solodit.com/uniswap-v4-hooks-security-deep-dive
- aeon.fun DynamicFee on-chain audit note: https://github.com/aeonfun/univ4-hooks/blob/main/audits/dynamicfee.md — 7 September 2026.

Live fee-taking hooks

- Clanker v4 contracts README: https://github.com/clanker-devco/v4-contracts/blob/main/README.md
- ClankerHook docs: https://clanker.gitbook.io/documentation/references/core-contracts/v4/clankerhook — 1 July 2026.
- Clanker deployed contracts: https://clanker.gitbook.io/documentation/references/deployed-contracts — 1 July 2026.
- DefiLlama Clanker fee adapter (20% of creator fee on top): https://github.com/DefiLlama/dimension-adapters/blob/master/fees/clanker.ts
- Flaunch contracts README / addresses: https://github.com/flayerlabs/flaunchgg-contracts
- Flaunch FeeDistributor: https://github.com/flayerlabs/flaunchgg-contracts/blob/main/src/contracts/hooks/FeeDistributor.sol
- Flaunch SDK changelog (protected routers 8 September 2026): https://github.com/flayerlabs/flaunch-sdk/blob/master/CHANGELOG.md
- Flaunch Dune: https://dune.com/filarm/flaunch — updated ~25 August 2026.
- TrustSwap Clanker vs Zora vs Flaunch: https://trustswap.com/base/clanker-vs-zora-vs-flaunch — August 2026.
- MemeFees launchpad ranking: https://memefees.com/launchpads — snapshot 10 September 2026, 13:45 UTC.
- dngr2 v4-fee-hooks: https://github.com/dngr2/v4-fee-hooks
- v4hooks.com catalog: https://v4hooks.com/ — updated 27 August 2026.
- Stockify claim: https://x.com/FollowtheFloow_/status/2096612256142209378 — 6 September 2026.

Tax tokens / routers

- Uniswap unsellable-token support: https://support.uniswap.org/hc/en-us/articles/17523088290573-Unsellable-token-scams — ~20 May 2026.
- How to find a token's fee: https://support.uniswap.org/hc/en-us/articles/19503913435405-How-to-find-a-token-s-fee — ~20 May 2026.
- Trading Strategy token-tax docs: https://tradingstrategy.ai/docs/programming/market-data/token-tax.html — 9 September 2026.
- Binance Web3 fee-share vs tax tokens: https://web3.binance.com/en/dev-docs/products/trading-api/fee-and-revenue-sharing — 9 September 2026.
- Pons tax-routing controversy: https://www.htx.com/feed/community/21871949/ — 9 September 2026.

Buyback / staking / GMX / Hyperliquid

- CoinMarketCap Academy buybacks 2026: https://coinmarketcap.com/academy/article/crypto-token-buybacks-hit-record-are-they-working — 10 September 2026.
- Unlocks.app buyback meta: https://insights.unlocks.app/buyback-and-burn-explained-what-they-are-who-is-doing-them-and-whether-they-actually-work/ — 30 July 2026.
- Coinjuice HYPE tokenomics: https://coinjuice.com/research-hub/hyperliquid-hype-tokenomics-buybacks-explained — page dated 10 September 2026 (article byline 2 June 2026).
- Giants Labs buyback engineering: https://giantslabs.pro/models/buyback-engineering/ — 11 May 2026.
- GMX rewards: https://docs.gmx.io/docs/tokenomics/rewards/ — retrieved 10 September 2026.
- GMX 2026 guide (buyback 27% / pause until $90): https://blog.web3wagmi.com/gmx-guide — 26 May 2026.
- Synthetix StakingRewards (example): https://solidity-by-example.org/defi/staking-rewards
- 0xMacro staking empty-pool leak: https://0xmacro.com/blog/synthetix-staking-rewards-issue-inefficient-reward-distribution/ — 4 August 2022 (older than 90 days; still the cited bug).

Regulatory

- SEC Interpretive Release 33-11412: https://www.sec.gov/files/rules/interp/2026/33-11412.pdf — 17 March 2026.
- Commissioner Moloney statement: https://www.sec.gov/newsroom/speeches-statements/moloney-statement-book-of-howey-031726 — 17 March 2026.
- Paul Weiss summary: https://www.paulweiss.com/insights/client-memos/sec-and-cftc-release-interpretation-on-application-of-federal-securities-laws-to-crypto-assets — 27 March 2026.
- Protocol staking staff statement (PoS, not app-token staking): https://www.sec.gov/newsroom/speeches-statements/statement-certain-protocol-staking-activities-052925 — 29 May 2025 (older than 90 days).
- Croke Fairchild on CLARITY / Howey: https://crokefairchild.com/2026/06/howey-lives-but-barely/ — 2 June 2026.

Hedera

- SaucerSwap deployments: https://docs.saucerswap.finance/developers/contracts — 7 September 2026.
- SaucerSwap Axelar/Squid bridge: https://www.saucerswap.finance/blog/saucerswap-labs-launches-a-dedicated-bridge-powered-by-squid-and-axelar — 26 February 2026.

Froggy (this repo)

- ADR 0010 service marketplace: `docs/decisions/0010-service-marketplace.md` — 7 September 2026.
- Marketplace evidence / prices: `docs/evidence/MARKETPLACE.md` — 8 September 2026.

## What I could not find out

- A 2026 price or typical turnaround for a professional Uniswap v4 hook audit. Trail of Bits published the failure-pattern piece on 30 July 2026 and invites hook reviews; they do not publish a rate card. Assume weeks and a five-figure invoice, not a weekend.
- Whether Uniswap Labs will allowlist a new Froggy hook before 13 September. The form exists; the wait time is unpublished. Clanker and Flaunch are already on the list; a custom hook is not.
- Whether Hedera's x402 facilitator will accept a custom ERC-20/HTS as the payment asset. The MCP-seller PRD in this repo already marks that unverified. Until someone sends a challenge in FROGGY and it settles, assume native HBAR / Base USDC only.
- Independent on-chain confirmation of Stockify's "90% of hook fees buy B20 equities for holders." The hook is allowlisted; the 90% split is a 6 September tweet.
- A single reconciled 2026 figure for Hyperliquid buybacks. Sources this week disagree ($932M trailing twelve months vs ~$1.3B cumulative vs $370M YTD 2026). The mechanism is consistent; the dollar totals are not.
- Whether 1inch Fusion / 0x / CoW solvers will fill a *vanilla* (no custom `hookData`) `BaseHookFee` pool without an allowlist. Uniswap's own router allowlist is documented; the others are not, for this specific hook shape. Simulation-based solvers can fill anything they can quote; many still skip `vanillaSwap: false` hooks.
- Current TVL and 24h volume of the aeon.fun DynamicFee pool. The 7 September audit note exists; I did not pull a DefiLlama adapter for it.
- Whether Flaunch's creator-fee allocation is still mutable after launch. Dune text says the split is immutable; `FeeDistributor.setCreatorFeeAllocation` in the contracts is a public function gated to the ERC721 holder. Those two statements conflict; read the deployed 1.3 bytecode before relying on immutability.
- Counsel's view of a buyback-from-x402-spread for an EU/US-touching three-person team. The March 2026 interpretation helps protocol staking and airdrops. It does not bless app-revenue dividends. Get a lawyer before tweeting yield.
- A clean Hedera-native equivalent of Uniswap v4 hooks. SaucerSwap is v2/v3-style. There is no v4 PoolManager on Hedera to attach a fee hook to.
- Live Froggy x402 net spread in dollars. Customer prices and supplier quotes exist; paid-delivery evidence was still pending on 8 September 2026. Any holder-rev-share number you publish before that evidence is a story, not a yield.
