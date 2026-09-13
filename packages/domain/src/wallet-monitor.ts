import { Schema } from "effect";

import { EvmAddress } from "./address";
import { AgentConnectionId } from "./agent-invocation";
import {
  OnchainAlertRuleId,
  WalletActivityId,
  WalletMonitorId,
  WatchlistItemId,
} from "./id";
import { UserId } from "./identity";
import {
  PriceObservation,
  PriceQuoteCurrency,
  ResolvedPriceSource,
} from "./onchain-price";

const timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const blockNumber = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const hash = Schema.String.check(Schema.isPattern(/^0x[0-9a-f]{64}$/u));
const amount = Schema.String.check(Schema.isPattern(/^[0-9]{1,78}$/u));
export const WALLET_MONITOR_DURATION_MS = 24 * 60 * 60 * 1000;
export const WALLET_MONITOR_USER_LIMIT = 3;
export const WALLET_MONITOR_ADDRESS_LIMIT = 20;
export const OnchainNetwork = Schema.Literals(["eip155:8453", "eip155:4663"]);
export type OnchainNetwork = typeof OnchainNetwork.Type;
export const OnchainAsset = Schema.Union([
  Schema.Literal("native"),
  EvmAddress,
]);
export const OnchainAlertCondition = Schema.Union([
  Schema.TaggedStruct("transfer", {
    direction: Schema.Literals(["sent", "received", "both"]),
    token: Schema.NullOr(OnchainAsset),
  }),
  Schema.TaggedStruct("swap", {
    side: Schema.Literals(["bought", "sold", "both"]),
    token: Schema.NullOr(OnchainAsset),
  }),
  Schema.TaggedStruct("price", {
    comparison: Schema.Literals(["above", "below"]),
    threshold: Schema.String.check(
      Schema.isPattern(/^(?:0|[1-9][0-9]{0,77})(?:\.[0-9]{1,78})?$/u)
    ),
    quoteCurrency: Schema.Literals(["USD", "USDC", "USDG", "ETH"]),
  }),
]);
export type OnchainAlertCondition = typeof OnchainAlertCondition.Type;
export const OnchainAlertRule = Schema.Struct({
  id: OnchainAlertRuleId,
  condition: OnchainAlertCondition,
  source: Schema.NullOr(ResolvedPriceSource),
  latest: Schema.NullOr(PriceObservation),
  triggeredBlock: Schema.NullOr(blockNumber),
});
export type OnchainAlertRule = typeof OnchainAlertRule.Type;

/** Stored with its saved item, so creating a watch cannot leave an orphan. */
export const WalletMonitor = Schema.Struct({
  v: Schema.Literal(1),
  id: WalletMonitorId,
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
  enabled: Schema.Boolean,
  connectionId: Schema.optional(Schema.NullOr(AgentConnectionId)),
  startedAt: timestamp,
  expiresAt: timestamp,
  startBlock: blockNumber,
  telegram: Schema.Boolean,
  swaps: Schema.Boolean,
  transfers: Schema.Boolean,
  rules: Schema.optional(
    Schema.Array(OnchainAlertRule).check(Schema.isMaxLength(4))
  ),
});
export type WalletMonitor = typeof WalletMonitor.Type;

export const WalletActivityFlow = Schema.Struct({
  asset: Schema.Union([Schema.Literal("native"), EvmAddress]),
  amount,
  direction: Schema.Literals(["sent", "received"]),
  counterparty: EvmAddress,
  /** Present only for a net leg attributed to a verified swap pool. */
  swapSide: Schema.optional(Schema.Literals(["sent", "received"])),
  symbol: Schema.NullOr(Schema.String.check(Schema.isMaxLength(24))),
  decimals: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))
  ),
});
export type WalletActivityFlow = typeof WalletActivityFlow.Type;
export const WalletActivity = Schema.Struct({
  v: Schema.Literal(1),
  id: WalletActivityId,
  itemId: WatchlistItemId,
  monitorId: WalletMonitorId,
  monitorRevision: Schema.Int,
  network: OnchainNetwork,
  wallet: EvmAddress,
  transactionHash: Schema.NullOr(hash),
  blockHash: hash,
  blockNumber,
  blockTime: timestamp,
  observedAt: timestamp,
  kind: Schema.Literals(["swap", "transfer", "activity", "price"]),
  price: Schema.optional(
    Schema.Struct({
      ruleId: OnchainAlertRuleId,
      observation: PriceObservation,
      threshold: Schema.String,
      comparison: Schema.Literals(["above", "below"]),
      initiallyMatched: Schema.Boolean,
      quoteCurrency: PriceQuoteCurrency,
      sourceLabel: Schema.String.check(Schema.isMaxLength(120)),
    })
  ),
  flows: Schema.Array(WalletActivityFlow).check(Schema.isMaxLength(200)),
  venues: Schema.Array(
    Schema.Literals([
      "uniswap_v2",
      "uniswap_v3",
      "uniswap_v4",
      "aerodrome",
      "pons",
    ])
  ).check(Schema.isMaxLength(5)),
  finality: Schema.Literals([
    "provisional",
    "finalized",
    "reverted",
    "unverified",
  ]),
  delivery: Schema.Literals([
    "waiting",
    "delivered",
    "not_paired",
    "cancelled",
    "uncertain",
    "failed",
    "summarized",
  ]),
  telegramMessageId: Schema.NullOr(
    Schema.String.check(Schema.isMaxLength(200))
  ),
  complete: Schema.Boolean,
  stubbed: Schema.Boolean,
});
export type WalletActivity = typeof WalletActivity.Type;
export const WalletMonitorStatus = Schema.Struct({
  v: Schema.Literal(1),
  itemId: WatchlistItemId,
  monitor: Schema.NullOr(WalletMonitor),
  state: Schema.Literals([
    "saved",
    "starting",
    "watching",
    "waiting_price",
    "triggered",
    "delayed",
    "paused",
    "expired",
    "unavailable",
  ]),
  latestBlock: Schema.NullOr(blockNumber),
  latestBlockAt: Schema.NullOr(timestamp),
  telegramPaired: Schema.Boolean,
  gapSince: Schema.NullOr(timestamp),
  coverage: Schema.String.check(Schema.isMaxLength(400)),
  stubbed: Schema.Boolean,
});
export type WalletMonitorStatus = typeof WalletMonitorStatus.Type;

/** Reversible rule state, committed with the stream checkpoint. */
export const WalletPriceEvaluation = Schema.Struct({
  v: Schema.Literal(1),
  id: WalletActivityId,
  owner: UserId,
  itemId: WatchlistItemId,
  monitorId: WalletMonitorId,
  revision: Schema.Int,
  network: OnchainNetwork,
  blockNumber,
  blockHash: hash,
  before: WalletMonitor,
  after: WalletMonitor,
});
export type WalletPriceEvaluation = typeof WalletPriceEvaluation.Type;
