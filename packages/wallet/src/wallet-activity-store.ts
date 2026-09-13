import {
  NoticeId,
  UserId,
  WalletActivity,
  WalletMonitorId,
  WatchlistItemId,
} from "@froggy/domain";
import type {
  WalletActivityId,
  WalletPriceEvaluation,
  WatchlistItem,
} from "@froggy/domain";
import { Schema } from "effect";

const time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export type WalletStreamNetwork = WalletActivity["network"];
export const WALLET_STORE_PAGE_SIZE = 200;
export const WalletStreamCheckpoint = Schema.Struct({
  v: Schema.Literal(1),
  generation: time,
  epoch: time,
  leaseUntil: time,
  cursor: Schema.NullOr(Schema.String.check(Schema.isMaxLength(4096))),
  sourceIdentity: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(400)))
  ),
  block: time,
  blockHash: Schema.NullOr(Schema.String),
  blockAt: time,
  finalizedBlock: time,
  gapSince: Schema.NullOr(time),
  error: Schema.NullOr(Schema.String.check(Schema.isMaxLength(300))),
});
export type WalletStreamCheckpoint = typeof WalletStreamCheckpoint.Type;
export const emptyWalletStreamCheckpoint = (): WalletStreamCheckpoint => ({
  v: 1,
  generation: 0,
  epoch: 0,
  leaseUntil: 0,
  cursor: null,
  sourceIdentity: null,
  block: 0,
  blockHash: null,
  blockAt: 0,
  finalizedBlock: 0,
  gapSince: null,
  error: null,
});
export const WalletAlert = Schema.Struct({
  v: Schema.Literal(1),
  id: NoticeId,
  owner: UserId,
  network: WalletActivity.fields.network,
  itemId: Schema.NullOr(WatchlistItemId),
  monitorId: Schema.NullOr(WalletMonitorId),
  revision: time,
  key: Schema.String.check(Schema.isMaxLength(300)),
  kind: Schema.Literals(["ready", "activity", "correction", "summary"]),
  text: Schema.String.check(Schema.isMaxLength(3000)),
  activityIds: Schema.Array(WalletActivity.fields.id).check(
    Schema.isMaxLength(WALLET_STORE_PAGE_SIZE)
  ),
  state: Schema.Literals([
    "pending",
    "sending",
    "grouped",
    "delivered",
    "uncertain",
    "cancelled",
    "failed",
    "not_paired",
  ]),
  reservedMinute: Schema.optional(time),
  summaryId: Schema.optional(NoticeId),
  createdAt: time,
  notBefore: time,
  attempts: time,
  claimUntil: time,
  telegramMessageId: Schema.NullOr(Schema.String),
});
export type WalletAlert = typeof WalletAlert.Type;
export interface OwnedWalletItem {
  readonly owner: UserId;
  readonly item: WatchlistItem;
}
export interface StoredWalletActivity {
  readonly owner: UserId;
  readonly activity: WalletActivity;
}
/** One transaction serializes config, cursors and outbox claims. No network I/O. */
export interface WalletActivityTransaction {
  readonly network: WalletStreamNetwork;
  readonly checkpoint: WalletStreamCheckpoint;
  readonly saveCheckpoint: (
    checkpoint: WalletStreamCheckpoint
  ) => Promise<void>;
  readonly bumpGenerations: () => Promise<void>;
  readonly watches: () => Promise<readonly OwnedWalletItem[]>;
  readonly items: (owner: UserId) => Promise<readonly WatchlistItem[]>;
  readonly saveItem: (owner: UserId, item: WatchlistItem) => Promise<void>;
  readonly activity: (
    owner: UserId,
    itemId: WatchlistItemId,
    transactionHash: string
  ) => Promise<WalletActivity | null>;
  readonly saveActivity: (
    owner: UserId,
    activity: WalletActivity
  ) => Promise<void>;
  readonly activities: (
    owner: UserId,
    ids: readonly WalletActivityId[]
  ) => Promise<readonly WalletActivity[]>;
  readonly provisional: (
    after?: WalletActivityId
  ) => Promise<readonly StoredWalletActivity[]>;
  readonly awaitingDelivery: (
    after?: WalletActivityId
  ) => Promise<readonly StoredWalletActivity[]>;
  readonly alert: (key: string) => Promise<WalletAlert | null>;
  readonly saveAlert: (alert: WalletAlert) => Promise<void>;
  readonly pending: (now: number) => Promise<readonly WalletAlert[]>;
  readonly alertsFor: (
    monitorId: WalletMonitorId,
    after?: NoticeId
  ) => Promise<readonly WalletAlert[]>;
  /** Reservations include uncertain outcomes; only the same alert may reuse its slot. */
  readonly claimActivitySlot: (
    alert: WalletAlert,
    now: number
  ) => Promise<boolean>;
  readonly deferToSummary: (
    alert: WalletAlert,
    now: number
  ) => Promise<WalletAlert>;
  readonly summaryMembers: (
    summaryId: NoticeId,
    after?: NoticeId
  ) => Promise<readonly WalletAlert[]>;
  readonly summaryCount: (summaryId: NoticeId) => Promise<number>;
  readonly savePriceEvaluation: (
    record: WalletPriceEvaluation
  ) => Promise<void>;
  readonly priceEvaluationsAfter: (
    block: number,
    after?: WalletActivityId
  ) => Promise<readonly WalletPriceEvaluation[]>;
  readonly deletePriceEvaluation: (id: WalletActivityId) => Promise<void>;
}
export interface WalletActivityStore {
  readonly transact: <T>(
    operation: (tx: WalletActivityTransaction) => Promise<T>,
    network?: WalletStreamNetwork
  ) => Promise<T>;
  readonly list: (
    owner: UserId,
    itemId: WatchlistItemId,
    before?: WalletActivityId
  ) => Promise<readonly WalletActivity[]>;
  readonly forget: (owner: UserId) => Promise<void>;
  readonly prune: (before: number) => Promise<void>;
}

export const walletSummaryAlert = (
  alert: WalletAlert,
  minute: number
): WalletAlert => ({
  v: 1,
  id: NoticeId.generate(),
  owner: alert.owner,
  network: alert.network,
  itemId: null,
  monitorId: null,
  revision: 0,
  key: `summary:${alert.owner}:${minute}`,
  kind: "summary",
  text: "More onchain activity is available in your Watchlist.",
  activityIds: [],
  state: "pending",
  createdAt: alert.createdAt,
  notBefore: (minute + 1) * 60_000,
  attempts: 0,
  claimUntil: 0,
  telegramMessageId: null,
});
