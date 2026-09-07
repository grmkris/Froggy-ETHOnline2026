/**
 * What `wallet_status` writes, decoded once for the card and the summary.
 *
 * The tool answers the model in JSON; the card lays the same object out as
 * rows. One decoder, so a field the server adds is read in one place and a
 * shape it changes fails loudly here rather than blanking a card quietly.
 */

import { Schema } from "effect";

export const WalletStatus = Schema.Struct({
  address: Schema.optional(Schema.NullOr(Schema.String)),
  /** The person's own Hedera account, once opened. */
  hederaAccountId: Schema.optional(Schema.NullOr(Schema.String)),
  /** The person's own Hedera pocket, on deployments that still report one. */
  pocketUsdMicros: Schema.optional(Schema.NullOr(Schema.Finite)),
  /** Only the kinds matter here; the page says what the allowlists hold. */
  rules: Schema.optional(Schema.Array(Schema.Struct({ _tag: Schema.String }))),
  /** The one balance: USDC on Base plus HBAR at the rate. */
  totalUsdMicros: Schema.optional(Schema.NullOr(Schema.Finite)),
  windowSpentUsdMicros: Schema.Finite,
});
export type WalletStatus = typeof WalletStatus.Type;

const decode = Schema.decodeUnknownResult(WalletStatus);

/** Null for text that is not the tool's JSON, or JSON of another shape. */
export const walletStatusOf = (text: string): WalletStatus | null => {
  let decoded: ReturnType<typeof decode>;
  try {
    decoded = decode(JSON.parse(text));
  } catch {
    return null;
  }
  return decoded._tag === "Success" ? decoded.success : null;
};
