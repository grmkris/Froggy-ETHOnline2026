import {
  EvmAddress,
  OnchainAlertCondition,
  OnchainNetwork,
  WalletActivity,
  WalletActivityId,
  WalletMonitorStatus,
  WatchlistItemId,
} from "@froggy/domain";
import { Schema } from "effect";

export const TrackWalletInput = Schema.Struct({
  network: Schema.optional(OnchainNetwork),
  address: Schema.Union([EvmAddress, Schema.Literal("my_froggy_wallet")]),
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  telegram: Schema.Boolean,
  swaps: Schema.Boolean,
  transfers: Schema.Boolean,
});
export const WalletMonitorUpdate = Schema.Struct({
  v: Schema.Literal(1),
  itemId: WatchlistItemId,
  action: Schema.Literals(["pause", "resume", "extend", "rearm"]),
});
export const WalletMonitorStart = Schema.Struct({
  v: Schema.Literal(1),
  telegram: Schema.Boolean,
  swaps: Schema.Boolean,
  transfers: Schema.Boolean,
});
export const WalletMonitorView = Schema.Struct({
  v: Schema.Literal(1),
  status: WalletMonitorStatus,
  activities: Schema.Array(WalletActivity).check(Schema.isMaxLength(50)),
  nextCursor: Schema.optional(Schema.NullOr(WalletActivityId)),
});

export const OnchainMonitorConfigure = Schema.Struct({
  v: Schema.Literal(1),
  telegram: Schema.Boolean,
  conditions: Schema.Array(OnchainAlertCondition).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(4)
  ),
});
export type OnchainMonitorConfigure = typeof OnchainMonitorConfigure.Type;
