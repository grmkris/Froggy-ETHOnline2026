# Trading services and execution

Froggy exposes token search, token inspection, composite token research, bounded RPC reads, unsigned swap quotes and fixed-capacity listing watches through Services, chat, HTTP and MCP. Each purchase uses the existing service-task coordinator and the person's spending rules. The customer pays Froggy's configured Hedera x402 service fee; ordinary server credentials cover the upstream provider call. These operations do not spend investment capital or submit trades.

## Configure the providers

The defaults in [.env.example](../.env.example) are:

```dotenv
BIRDEYE_API_KEY=REPLACE_ME_BIRDEYE_KEY
UNISWAP_API_KEY=REPLACE_ME_UNISWAP_KEY
TRADING_RPC_ENDPOINTS={}
UNISWAP_CHAINS='[{"network":"eip155:1","routerVersion":"2.1.1"},{"network":"eip155:11155111","routerVersion":"2.1.1"},{"network":"eip155:8453","routerVersion":"2.1.1"},{"network":"eip155:84532","routerVersion":"2.1.1"},{"network":"eip155:4663","routerVersion":"2.1.1"}]'
TRADING_PRICES_USD_MICROS={}
```

Birdeye supplies search and inspection. Uniswap supplies quotes and approval checks. GoPlus supplies optional token screens for research (never for signing). `TRADING_RPC_ENDPOINTS` maps each supported CAIP-2 network to an HTTPS JSON-RPC endpoint (Quicknode, Alchemy, or the chain's public RPC), for example `{"eip155:8453":"https://YOUR_ENDPOINT.example/"}`. Replace that illustrative URL through server configuration. API keys and credential-bearing URLs are held as redacted configuration and never belong in tool arguments or browser code. Restart the server after configuration changes.

`UNISWAP_CHAINS` selects configured networks and router versions. The default enables Ethereum, Sepolia, Base, Base Sepolia and Robinhood with version `2.1.1`; the adapter filters out unsupported network/version combinations. Data-network support is separate from the wallet and payment networks.

`TRADING_PRICES_USD_MICROS` sets the price of each operation. Keys are `market_search`, `token_inspect`, `rpc_read`, `quote_action`, `watch_launches` and `token_research`; values are positive integers up to `100000000`. One dollar is `1000000` USD micros. For example, `{"rpc_read":10000}` sets a one-cent RPC service fee. Choose prices after reviewing provider costs and quotas; this example is not a measured cost recommendation.

A live paid operation is unavailable unless its provider is configured, its network is supported and its price is explicitly set. Existing wallet, Hedera funding and spending requirements still apply. With simulated Hedera payments, an omitted price uses the fixture price of `10000` USD micros. Missing provider credentials select fixtures. Configured providers still make live API calls when payment is simulated, so inspect the catalog's `note` as well as its status.

## Discover the current capabilities

Send authenticated requests to the workspace origin with `Authorization: Bearer <FROGGY_TOKEN>`. A Froggy agent token or the signed-in person's token can use the API; OAuth connections need the `services` scope to buy these operations.

`GET /api/services` returns the catalog. For each operation, inspect `networks`, `status`, `note`, `priceUsdMicros` and `inputSchema`. `configured` means configuration is present, not that live delivery has been verified. The catalog is the source of truth for this deployment's supported networks; discovering a token does not establish a swap route.

## Make an HTTP request

All five operations use `POST /api/services/run` with `Content-Type: application/json`. The request body is limited to 16,000 bytes. The addresses below are synthetic examples for fixtures, not verified token contracts or wallet funding destinations.

Find recent listings; replace `query: null` with a search string to search tokens. `limit` is between 1 and 20.

```json
{
  "v": 1,
  "service": "market_search",
  "input": { "network": "eip155:8453", "query": null, "limit": 5 },
  "idempotencyKey": "market-example-1"
}
```

Inspect a token's market data and reported security facts:

```json
{
  "v": 1,
  "service": "token_inspect",
  "input": {
    "network": "eip155:8453",
    "address": "0x1111111111111111111111111111111111111111"
  },
  "idempotencyKey": "inspect-example-1"
}
```

Composite token research at one pinned block (launcher detection, template, launch cohort, reconstructed holders, optional GoPlus screen). Networks are every EVM entry in `TRADING_RPC_ENDPOINTS`. Sources report per-status; GoPlus never authorizes a trade. MCP `froggy_token_research` and chat `token_research` buy the same operation.

```json
{
  "v": 1,
  "service": "token_research",
  "input": {
    "network": "eip155:4663",
    "address": "0x1111111111111111111111111111111111111111",
    "cohortWindowBlocks": 600,
    "holderPageBudget": 20
  },
  "idempotencyKey": "research-example-1"
}
```

Read an account balance through the configured RPC endpoint:

```json
{
  "v": 1,
  "service": "rpc_read",
  "input": {
    "network": "eip155:8453",
    "call": {
      "method": "eth_getBalance",
      "params": ["0x3333333333333333333333333333333333333333", "latest"]
    }
  },
  "idempotencyKey": "rpc-example-1"
}
```

Request an exact-input ERC-20 swap quote:

```json
{
  "v": 1,
  "service": "quote_action",
  "input": {
    "network": "eip155:8453",
    "wallet": "0x3333333333333333333333333333333333333333",
    "tokenIn": "0x1111111111111111111111111111111111111111",
    "tokenOut": "0x2222222222222222222222222222222222222222",
    "amount": "1000",
    "slippageBps": 100
  },
  "idempotencyKey": "quote-example-1"
}
```

Quote amounts are decimal integer strings in token base units, not display amounts. `slippageBps: 100` means 1%; the accepted range is 1–5000 basis points. Tokens must differ, native-token sentinels are refused, and the positive input amount must fit below `2^160`. RPC results retain their native wire encoding, including EVM hexadecimal quantities.

## Use MCP or chat

Connect an authenticated Streamable HTTP MCP client to `/mcp` and grant `services` scope. `/api/mcp` is also supported. Use `froggy_services` to inspect the catalog.

| Operation                 | MCP tool                | Chat tool        |
| ------------------------- | ----------------------- | ---------------- |
| Search or recent listings | `froggy_market_search`  | `market_search`  |
| Token inspection          | `froggy_token_inspect`  | `token_inspect`  |
| Token research            | `froggy_token_research` | `token_research` |
| Bounded RPC read          | `froggy_rpc_read`       | `rpc_read`       |
| Unsigned swap quote       | `froggy_quote_action`   | `quote_action`   |

Each named tool takes the same object shape: `{"idempotencyKey":"…","input":{…}}`. Its `input` matches the corresponding HTTP example; the tool name supplies the operation and the server supplies the wire version. For example, `froggy_rpc_read` accepts:

```json
{
  "idempotencyKey": "block-example-1",
  "input": {
    "network": "eip155:8453",
    "call": { "method": "eth_blockNumber", "params": [] }
  }
}
```

The Services page offers structured forms for the same operations and displays their saved results.

## Retrieve results and handle retries

HTTP returns `202` with a task ticket. Read `GET /api/services/tasks/<id>` until the task reaches `done`, `failed` or `uncertain`; `GET /api/services/tasks` lists recent tasks. MCP uses `froggy_service_status` with `{"id":"<returned task ID>"}`. Chat uses `service_status` with `{"taskId":"<returned task ID>"}`. Answer any human approval in Froggy. Polling is included in the original purchase.

The ticket's `data` contains the typed result, with its operation, provider, observation time and limitations. `text` is a short readable summary. The task's `runId` and `saleId` connect the work to its payment history. Results are scoped to their owner. `stubbed: true` on the task, sale or receipt marks simulated participation; `data.stubbed` specifically identifies provider fixtures. A simulated payment with a live provider therefore has a simulated task/receipt and live provider data.

Reuse the same idempotency key for retries of the same complete request, including retries through another transport. Reordering JSON keys is harmless; changing inputs under that key is refused. To deliberately buy a fresh observation or quote, use a new key. A quote's `refreshAfter` is 30 seconds after observation, a local freshness policy rather than a provider expiry or fill guarantee. Reusing its old key returns the old quote.

A failed paid task is not automatically refunded or purchased again. An uncertain payment must be checked before another purchase. Work belongs to the server and survives client disconnection. Persisted tasks require a configured database to survive process restarts; the database stub is in memory. Interrupted work is not automatically resumed, and tasks without progress for 15 minutes are reported as uncertain.

## Current limits

- Market results are bounded provider snapshots. Missing prices, token controls, taxes or security facts remain unknown. Recent listings are not a complete launch-event stream.
- EVM RPC allows `eth_blockNumber`, `eth_getBalance`, `eth_getCode`, `eth_call`, `eth_getTransactionReceipt` and bounded `eth_getLogs` (required `address`, span ≤ 10,000 blocks, ≤ 4 topics, ≤ 100 logs). Block-dependent calls require an explicit block number or supported tag; `pending` is refused. `eth_call` accepts at most 4096 calldata bytes and uses a fixed 500,000 gas ceiling.
- Solana RPC allows `getSlot`, `getBalance`, `getAccountInfo`, mint-filtered `getTokenAccountsByOwner` and `getSignatureStatuses`. Account reads require `confirmed` or `finalized`; account data uses a base64 slice of at most 1024 bytes. Account lists and signature lists are capped at 20. Signature lookup uses the recent cache; null means unknown.
- RPC verifies the endpoint's chain ID or genesis before the first read. Provider responses are capped at 64,000 bytes and normalized results at 48,000 serialized characters. Unsafe numeric account amounts are refused. Arbitrary endpoints, sending, signing, debug methods, broad account scans and log queries are unavailable.
- Quotes use Uniswap Classic routing with V2/V3 and no-hook V4 routes. Approval and permit information is an unsigned summary; Froggy obtains no trade signature and returns no execution capability. Native wrapping, order routes, hook-dependent pools and launch-curve builders are unsupported. Any provider simulation result is explicitly not independent verification; token taxes are not assessed and gas estimates exclude approvals.

## Robinhood Chain coverage

`eip155:4663` is supported by `market_search`, `token_inspect`, `token_research`, `rpc_read`, `quote_action` and `watch_launches`, and by the unpaid `pons_token` read described below. Each still requires its provider to be configured and its price to be set.

Two consequences are worth knowing before reading a result:

- **Birdeye reports no security facts here.** Its `token_security` endpoint answers 401 for Robinhood on this plan, so `token_inspect` returns `security.status = "unavailable"` with no facts. That is an absence of evidence, not a clean screen.
- **`quote_action` cannot quote a Pons token.** Quotes exclude hook-bearing V4 pools, and every graduated Pons pool carries the Pons hook, so the router answers `NoRouteFoundError` for those pairs. It quotes ordinary Robinhood pools such as USDG/WETH normally. Pons pricing comes from the Pons quoter inside trade preparation instead.

### Read Pons launch state

`pons_token` takes one token address and reports what the Pons V2 factory and the launch's own contracts say at a single pinned block: whether a launch is registered at all, its phase, curve address, deployer, creator fee recipient, creator tax, graduation threshold and buyback flag, then either the curve's reserves, sellable supply and fee basis points, or the graduated pool's key, price, tick and active liquidity.

Every reviewed Pons dependency's runtime hash is checked before anything else is read. If one has changed, the read stops and says so rather than answering through a contract nobody reviewed.

It is chain state and nothing more. It does not count holders, does not describe distribution, is not a quote, and creates no trading authority.

## Controlled trade execution

Execution uses a separate capital ledger and immutable approvals. It does not inherit authority from buying a research service. Open the wallet trade panel or inspect `GET /api/trades/capabilities` (`froggy_trade_capabilities` in MCP, `trade_capabilities` in chat). Its `routes` describe the venue, action, network, wallet, mode and limitations. A live mode indicates configuration, not a verified fill.

Uniswap execution requires the Uniswap key, a configured chain and HTTPS JSON-RPC endpoint in `TRADING_RPC_ENDPOINTS`, live Privy, and `TENDERLY_ACCESS_KEY`, `TENDERLY_ACCOUNT` and `TENDERLY_PROJECT`. Reviewed deployments on Ethereum mainnet, Sepolia, Base, Base Sepolia and Robinhood Chain are executable for ordinary (no-hook) V3 pools. Robinhood uses Universal Router 2.1.1 with an empty `minHopPriceX36` array; mainnet and Base pin Universal Router 2.0. Rollup L1 data fees and Isthmus operator fees on Base are reserved inside `maxNativeFee` using a margined GasPriceOracle estimate at prepare and again before sign; see [decision 0022](decisions/0022-rollup-fee-budget.md). Robinhood Nitro parent gas stays inside `gasUsed` (same receipt path as Pons). Pons curve and hooked graduated pools remain on the Pons venue — see [UNISWAP_ROBINHOOD.md](evidence/UNISWAP_ROBINHOOD.md). Current Uniswap execution is exact-input legacy ERC-20 through a single V3 path. Allowances and swaps each require review.

Jupiter execution requires `JUPITER_API_KEY`, a Solana mainnet entry in `TRADING_RPC_ENDPOINTS`, and live Privy with the person's Solana wallet. It uses owner-paid Metis transactions and independent RPC simulation. Reviewed Raydium, Meteora and Lifinity instruction variants are supported; unknown variants, Token-2022, extra signers and delegated accounts are refused. Enter `native` for SOL. Native budgets are integer lamports; EVM budgets are integer wei. The budget includes conservative account-creation costs where applicable.

`POST /api/trades` prepares a versioned `TradePrepare` request. `GET /api/trades/<id>` retrieves it and `POST /api/trades/<id>/simulate` rechecks the saved payload. MCP exposes `froggy_trade_prepare`, `froggy_trade_status` and `froggy_trade_simulate`; chat exposes the same names without the prefix. Reusing the same key returns the original proposal, and changing inputs under that key is refused.

Review and approve each step in Froggy. Agents cannot approve, create rules or change the stop control. An expired or changed proposal needs fresh preparation and approval. Disconnecting the browser does not cancel an authorized transaction. PostgreSQL stores the signed identity before broadcast; background recovery checks that identity and may rebroadcast identical bytes, but never requests a replacement signature. An unknown signing outcome holds capital for investigation. A confirmed transaction with insufficient proceeds or excessive fees is reported as partial, with actual costs and transaction identity preserved.

Missing all credentials selects visibly marked fixtures. Partial configuration makes the route unavailable. Funded execution has not been verified. Pons launch execution and persistent launch reactions remain work in progress in [the implementation plan](plan/TRADING_IMPLEMENTATION.md).

### Native Pump swaps

Pump supports native SOL buys and sells on its bonding curve and canonical graduated pool. Enter `native` for SOL. The requested input is a maximum allocation; settlement reports `actualInput` separately. The phase and exact transaction are approved together. A phase change before signing requires a fresh proposal; recovery after submission uses the saved phase.

Live Pump execution defaults off. The operator must explicitly set `PUMP_EXECUTION_ENABLED=true` and configure Solana mainnet RPC and Privy signing. RPC alone does not activate it. With no RPC configured and the flag off, the route is a clearly marked curve simulation. Mayhem, cashback, non-SOL quote variants, transfer fees/hooks and delegated token authority are refused. Legacy SPL and fixed-supply Token-2022 with metadata-only mint extensions are supported by native validation. Live Pump execution has not been verified or activated in production.

## Vault positions and withdrawal proceeds

Configure `ENSO_API_KEY` together with Ethereum RPC, Tenderly and Privy to enable reviewed Enso execution. The current route accepts Ethereum ERC-4626 asset deposits and share redemptions through Enso's published router. It validates the outer token amounts and recipient and every nested call. Arbitrary helpers, extra transfers, provider fees and unsupported call variants are refused. Live delivery still needs verification with configured credentials.

`GET /api/trades/positions?network=eip155:1`, MCP `froggy_positions` and chat `positions` return a bounded owner inventory, independently read balances, reserved units and supported redemption previews. The tool input is `{"network":"eip155:1"}`; the server selects the authenticated person's wallet. The Services trading desk has the same positions view. It does not infer cash yield from APR or token appreciation. Historical external transfers, reward claims and queued withdrawals remain unknown.

For a deposit, `venue` is `enso`, `action` is `deposit`, `position` equals the vault share token in `tokenOut`, and `amount` is the underlying asset quantity in base units. For a withdrawal, use `action: "withdraw"`, set `position` and `tokenIn` to the vault, and express `amount` in share base units. `tokenOut` must be the underlying asset. Each required allowance and economic transaction has a separate approval.

After a withdrawal reaches `completed`, prepare a new swap with optional `sourceTradeId` at the top level of the `TradePrepare` request. Its input wallet/network/token must match the source's received asset, and the amount cannot exceed its confirmed, unallocated output. The browser's **Use proceeds in a swap** action fills these fields. Pending, failed and unconfirmed withdrawals cannot fund the swap. Two requests cannot reserve the same proceeds; failed transactions retain their actual fees and confirmed steps remain visible.

The Enso router and command layout were checked against [Enso's router source](https://github.com/EnsoBuild/shortcuts-client-contracts/blob/main/src/router/EnsoRouter.sol), [Ethereum deployment record](https://github.com/EnsoBuild/shortcuts-client-contracts/blob/main/broadcast/EnsoRouterDeployer.s.sol/1/run-latest.json) and [Weiroll interpreter](https://github.com/EnsoBuild/enso-weiroll/blob/900250114203727ff236d3f6313673c17c2d90dd/contracts/VM.sol). Protocol support is narrower than Enso's general routing catalog.

## Fixed-capacity listing watches

Purchase `watch_launches` with `input: { "network": "eip155:8453", "durationMinutes": 5, "minimumLiquidityUsd": null, "source": null }` and the usual version and stable idempotency key. Duration is 1–60 minutes. `watch_launches` has one explicitly configured bundle price, regardless of the selected duration; price it for at most 120 upstream polls. There is no renewal or extra payment per poll. Failed paid work is not automatically refunded, including a capacity race after preflight.

The paid task returns `data.watch.id`. `GET /api/services/watches` lists the most recent 20 watches; `GET /api/services/watches/:id` retrieves one and `DELETE /api/services/watches/:id` permanently stops it. MCP provides `froggy_watch_launches`, `froggy_watch_status` and `froggy_watch_cancel`; status/cancel take `watchId`. Chat has the corresponding names without `froggy_`. Connection callers can read and cancel their own watches; the workspace owner can manage all. The Services page polls status, reports remaining capacity and retains stopped watches after reload.

A watch samples at most 20 recent Birdeye listings every 30 seconds. Capacity is twice the requested duration, at most 120 polls, and ends early at 100 saved matches or its expiry. Five active watches and 500 saved watches are allowed per owner. The first snapshot can include listings from before the watch started. Source matching is exact ignoring case; a liquidity threshold excludes unknown liquidity. These filters use reported provider metadata and never prove launch-program membership.

The provider has no replay cursor. Every watch therefore reports incomplete coverage from the start; failed, missed, full and truncated polls add gaps. A restart keeps already consumed polls and seen addresses. An expired in-flight claim consumes its slot; a late response cannot overwrite cancellation or a newer claim. An empty result means no matching listing was observed in that sample. It does not establish that none launched. Watch observations never authorize a trade. Account reset stops observations while retaining the paid history.

## Human-issued rules and automatic launch reactions

The Trading rules panel is in **Services → Trading desk**. Choose a route, exact assets, principal and native-fee caps, maximum entries, maximum open positions, slippage and expiry. On the Pons route, optional research requirements (template match, launch-window insiders, top-holder share) fail closed before signing; see [decision 0023](decisions/0023-research-gated-rules.md). Only the authenticated human can authorize or revoke a rule. An agent may call `froggy_trade_execute` with `tradeId` and an existing `ruleId`; HTTP uses `POST /api/trades/<id>/execute` with `{ "v": 1, "ruleId": "…" }`. Preparation and simulation do not create authority.

For automatic Pons or Pump reactions, buy a bounded listing watch first and select it in the rule form. The rule applies only to fresh observations after authorization and native membership is checked before signing. Configure a maximum holding time, optional profit/loss or quote-reserve thresholds and at most three exit attempts. Checks run every 30 seconds, share the watch's fixed capacity, and never renew automatically. A position may remain open after capacity, authority or route availability ends. Revocation and Stop watch prevent further authorized signing; already submitted transactions retain their recovery path.

Pons watches read confirmed `TokenLaunched` factory logs on the configured Robinhood network, retain block/hash cursors, backfill at most 500 blocks per poll and report omitted coverage. A changed canonical anchor marks previous observations uncertain and excludes them from automatic entries. Other supported networks use bounded Birdeye snapshots with no replay guarantee. Neither path promises complete launch coverage. Native Pons watches cannot filter by USD liquidity; execution rules use quote-asset reserves.

Live native execution requires the explicit `PONS_EXECUTION_ENABLED` or `PUMP_EXECUTION_ENABLED` flag, the corresponding RPC and live Privy with a matching pre-existing policy. Deployment does not enable these flags or modify that policy. Fixture watches, rules and trades remain visibly simulated.
