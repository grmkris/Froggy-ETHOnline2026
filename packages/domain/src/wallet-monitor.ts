import { Schema } from "effect";

import { EvmAddress } from "./address";
import type { AddressPresence } from "./address-presence";
import { AgentConnectionId } from "./agent-invocation";
import {
  OnchainAlertRuleId,
  WalletActivityId,
  WalletMonitorId,
  WatchlistItemId,
} from "./id";
import { UserId } from "./identity";
import { KNOWN_ASSETS, knownAsset } from "./money";
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

/** One chain the watch streams on, from the block it started there. Heads differ per chain. */
export const WalletMonitorCoverage = Schema.Struct({
  network: OnchainNetwork,
  startBlock: blockNumber,
});
export type WalletMonitorCoverage = typeof WalletMonitorCoverage.Type;

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
  /** Every supported chain the address was seen on; `startBlock` above is the first entry, kept for older rows. */
  networks: Schema.optional(
    Schema.Array(WalletMonitorCoverage).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(2)
    )
  ),
});
export type WalletMonitor = typeof WalletMonitor.Type;
export const monitorCoverage = (
  monitor: WalletMonitor
): readonly WalletMonitorCoverage[] => monitor.networks ?? [];
export const monitorStartBlock = (
  monitor: WalletMonitor,
  network: OnchainNetwork
): number | null =>
  monitorCoverage(monitor).find((entry) => entry.network === network)
    ?.startBlock ?? null;
/** The chains a watch can start on: observed, and streamed by a worker. */
export const supportedPresence = (
  rows: readonly AddressPresence[]
): readonly OnchainNetwork[] =>
  rows.flatMap((row) =>
    row.status === "observed" && Schema.is(OnchainNetwork)(row.network)
      ? [row.network]
      : []
  );

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
/** `0x0Cf8…67F6`: enough to recognise an address a person already knows, never enough to copy. */
export const shortAddress = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
/** A flow's amount in the token's own decimals, or its raw units when the token reported none. */
export const flowAmount = (
  flow: Pick<WalletActivityFlow, "amount" | "decimals">
): string => {
  if (flow.decimals === null) {
    return `${flow.amount} raw units of`;
  }
  if (flow.decimals === 0) {
    return flow.amount;
  }
  const digits = flow.amount.padStart(flow.decimals + 1, "0");
  return `${digits.slice(0, -flow.decimals)}.${digits.slice(-flow.decimals)}`.replace(
    /\.?0+$/u,
    ""
  );
};
export interface FlowAsset {
  /** What to print after the amount. */
  readonly label: string;
  /**
   * Why the label is not to be trusted: the contract reported no symbol, or
   * a symbol that imitates a known asset on this network or hides
   * non-Latin characters. Null for the chain's own coin, an asset in the
   * known-asset table, or an ordinary self-reported symbol.
   */
  readonly doubt: "no_symbol" | "lookalike" | null;
}
const PLAIN_TEXT = /^[ -~]*$/u;
/**
 * What to call a token in an alert. Address-poisoning tokens copy a real
 * symbol, so a symbol is trusted only when the contract is the one the
 * known-asset table names; anything else that claims a known symbol, or
 * carries characters a person cannot tell from Latin ones, is a lookalike.
 */
export const flowAsset = (
  flow: Pick<WalletActivityFlow, "asset" | "symbol">,
  network: string
): FlowAsset => {
  if (flow.asset === "native") {
    return { label: "ETH", doubt: null };
  }
  const known = knownAsset(flow.asset, network);
  if (known !== undefined) {
    return { label: known.symbol, doubt: null };
  }
  const symbol = flow.symbol?.trim() ?? "";
  if (symbol === "") {
    return { label: `token ${shortAddress(flow.asset)}`, doubt: "no_symbol" };
  }
  const imitates = Object.values(KNOWN_ASSETS).some(
    (asset) =>
      asset.network === network &&
      asset.symbol.toLowerCase() === symbol.toLowerCase()
  );
  if (imitates || !PLAIN_TEXT.test(symbol)) {
    return {
      label: `"${symbol}" ${shortAddress(flow.asset)}`,
      doubt: "lookalike",
    };
  }
  return { label: symbol, doubt: null };
};
/**
 * The signer to name when something left the wallet in a transaction the
 * wallet did not sign. A contract may act for a smart account, and a scam
 * token may emit a transfer "from" a wallet that never called it; either
 * way the person should know the wallet's own key was not involved.
 */
export const foreignSigner = (
  activity: Pick<WalletActivity, "wallet" | "transactionFrom" | "flows">
): string | null =>
  activity.transactionFrom !== undefined &&
  activity.transactionFrom.toLowerCase() !== activity.wallet.toLowerCase() &&
  activity.flows.some((flow) => flow.direction === "sent")
    ? activity.transactionFrom
    : null;
export const WalletActivity = Schema.Struct({
  v: Schema.Literal(1),
  id: WalletActivityId,
  itemId: WatchlistItemId,
  monitorId: WalletMonitorId,
  monitorRevision: Schema.Int,
  network: OnchainNetwork,
  wallet: EvmAddress,
  /** Who signed the transaction. Absent on rows written before it was recorded. */
  transactionFrom: Schema.optional(EvmAddress),
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
  /** Per chain; the top-level fields report the worst of these. */
  networks: Schema.optional(
    Schema.Array(
      Schema.Struct({
        network: OnchainNetwork,
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
        stubbed: Schema.Boolean,
      })
    ).check(Schema.isMaxLength(2))
  ),
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
