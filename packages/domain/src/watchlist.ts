import { Schema } from "effect";

import { EvmAddress } from "./address";
import { EmailId, WatchlistItemId } from "./id";
import { EvmTradingNetwork } from "./trading";
import { publicHttpUrl } from "./url";
import { WalletMonitor } from "./wallet-monitor";

/** Saved identity is independent of a paid service or a scheduled check. */
const SourceUrl = Schema.String.check(
  Schema.isMaxLength(2048),
  Schema.makeFilter((value) => publicHttpUrl(value).ok, {
    message: "Use a public http or https URL without credentials.",
  })
);
export const WatchlistSource = Schema.Union([
  Schema.TaggedStruct("wallet", {
    network: EvmTradingNetwork,
    address: EvmAddress,
  }),
  Schema.TaggedStruct("token", {
    network: EvmTradingNetwork,
    address: EvmAddress,
  }),
  Schema.TaggedStruct("email", { emailId: EmailId, kind: Schema.Literals(["flight", "product", "link"]) }),
  Schema.TaggedStruct("link", { url: SourceUrl }),
  Schema.TaggedStruct("product", { url: SourceUrl }),
  Schema.TaggedStruct("flight", { url: SourceUrl }),
]);
export type WatchlistSource = typeof WatchlistSource.Type;

export const WatchlistInput = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  notes: Schema.String.check(Schema.isMaxLength(1000)),
  source: WatchlistSource,
});
export type WatchlistInput = typeof WatchlistInput.Type;

export const WatchlistItem = Schema.Struct({
  v: Schema.Literal(1),
  id: WatchlistItemId,
  ...WatchlistInput.fields,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  archived: Schema.Boolean,
  walletMonitor: Schema.optional(WalletMonitor),
});
export type WatchlistItem = typeof WatchlistItem.Type;

export const watchlistSourceKey = (source: WatchlistSource): string => {
  if (source._tag === "wallet") {
    return `wallet:${source.network}:${source.address.toLowerCase()}`;
  }
  if (source._tag === "token") {
    return `${source.network}:${source.address.toLowerCase()}`;
  }
  if (source._tag === "email") { return `email:${source.kind}:${source.emailId}`; }
  return `${source._tag}:${source.url}`;
};
