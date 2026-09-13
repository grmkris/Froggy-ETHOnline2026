import { Schema } from "effect";

import { EvmAddress } from "./address";
import { CardCheckoutId, PaymentMethodId, TaskId, TradeId } from "./id";
import { TradingUnits } from "./trading";

const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const Text = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(300)
);
export const CheckoutDecimal = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,18})?$/u),
  Schema.makeFilter((value) => /[1-9]/u.test(value))
);
export const CheckoutHost = Schema.String.check(
  Schema.isMaxLength(253),
  Schema.isPattern(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/u)
);
export const CardCredentials = Schema.Struct({
  name: Text,
  number: Schema.String.check(Schema.isPattern(/^\d{13,19}$/u)),
  expiryMonth: Schema.String.check(Schema.isPattern(/^(?:0[1-9]|1[0-2])$/u)),
  expiryYear: Schema.String.check(Schema.isPattern(/^20\d{2}$/u)),
  cvc: Schema.String.check(Schema.isPattern(/^\d{3,4}$/u)),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type CardCredentials = typeof CardCredentials.Type;
export const PaymentMethod = Schema.Struct({
  v: Schema.Literal(1),
  id: PaymentMethodId,
  revision: Revision,
  label: Text,
  fundingAddress: EvmAddress,
  fundingNetwork: Schema.Literal("eip155:59144"),
  last4: Schema.String.check(Schema.isPattern(/^\d{4}$/u)),
  createdAt: Time,
  revokedAt: Schema.NullOr(Time),
});
export type PaymentMethod = typeof PaymentMethod.Type;
export const CardVaultEnvelope = Schema.Struct({
  v: Schema.Literal(1),
  nonce: Schema.String.check(Schema.isPattern(/^[a-f0-9]{24}$/u)),
  ciphertext: Schema.String.check(
    Schema.isPattern(/^[a-f0-9]+$/u),
    Schema.isMaxLength(4096)
  ),
});
export type CardVaultEnvelope = typeof CardVaultEnvelope.Type;
export const CheckoutInspection = Schema.Struct({
  v: Schema.Literal(1),
  merchant: CheckoutHost,
  item: Text,
  total: CheckoutDecimal,
  currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  finalTotal: Schema.Literal(true),
  paymentHosts: Schema.Array(CheckoutHost).check(Schema.isMaxLength(8)),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type CheckoutInspection = typeof CheckoutInspection.Type;
export const CardFunding = Schema.Struct({
  cost: TradingUnits,
  buffer: TradingUnits,
  required: TradingUnits,
  balance: TradingUnits,
  reserved: TradingUnits,
  shortfall: TradingUnits,
  baseDebit: TradingUnits,
  minimumArrival: TradingUnits,
  bridgeDeduction: TradingUnits,
  rate: CheckoutDecimal,
  usdRate: CheckoutDecimal,
  rateSource: Schema.Literal(
    "https://api.coinbase.com/v2/exchange-rates?currency=USDC"
  ),
  rateAt: Time,
  balanceAt: Time,
  stubbed: Schema.Boolean,
});
export type CardFunding = typeof CardFunding.Type;
export const CardBridgeObservation = Schema.Struct({
  destinationStartBlock: TradingUnits,
  cursor: TradingUnits,
  depositId: Schema.NullOr(TradingUnits),
  sourceTransaction: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^0x[a-fA-F0-9]{64}$/u))
  ),
  sourceBlockHash: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^0x[a-fA-F0-9]{64}$/u))
  ),
  fillTransaction: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^0x[a-fA-F0-9]{64}$/u))
  ),
  fillBlock: Schema.NullOr(TradingUnits),
  fillBlockHash: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^0x[a-fA-F0-9]{64}$/u))
  ),
  sourceConfirmed: Schema.Boolean,
  destinationConfirmed: Schema.Boolean,
  fillDeadline: Time,
});
export type CardBridgeObservation = typeof CardBridgeObservation.Type;
export const CardCheckout = Schema.Struct({
  v: Schema.Literal(1),
  id: CardCheckoutId,
  revision: Revision,
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
  paymentMethodId: PaymentMethodId,
  paymentMethodRevision: Revision,
  fundingAddress: EvmAddress,
  taskId: TaskId,
  stage: Schema.Literals([
    "inspecting",
    "awaiting_approval",
    "funding",
    "paying",
    "needs_help",
    "order_observed",
    "outcome_unknown",
    "stopped",
    "recovery_required",
  ]),
  inspection: Schema.NullOr(CheckoutInspection),
  funding: Schema.NullOr(CardFunding),
  fingerprint: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
  ),
  expiresAt: Schema.NullOr(Time),
  approvedAt: Schema.NullOr(Time),
  tradeId: Schema.NullOr(TradeId),
  bridge: Schema.NullOr(CardBridgeObservation),
  stoppedAt: Schema.NullOr(Time),
  paymentDispatchedAt: Schema.NullOr(Time),
  providerRunId: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  order: Schema.NullOr(Text),
  charge: Schema.Literal("unverified"),
  error: Schema.NullOr(Text),
  createdAt: Time,
  updatedAt: Time,
  stubbed: Schema.Boolean,
});
export type CardCheckout = typeof CardCheckout.Type;

const ceil = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator;
const rational = (value: string): readonly [bigint, bigint] => {
  const checked = Schema.decodeUnknownSync(CheckoutDecimal)(value);
  const [whole, fraction = ""] = checked.split(".");
  return [BigInt(`${whole}${fraction}`), 10n ** BigInt(fraction.length)];
};
/** Rates are currency units per USDC; all divisions round upwards before reserving. */
export const calculateCardFunding = (input: {
  readonly total: string;
  readonly rate: string;
  readonly usdRate: string;
  readonly balance: string;
  readonly reserved: string;
  readonly rateAt: number;
  readonly balanceAt: number;
  readonly now: number;
  readonly stubbed: boolean;
}): CardFunding => {
  if (
    [input.rateAt, input.balanceAt].some(
      (at) => at > input.now || input.now - at > 60_000
    )
  ) {
    throw new Error("card.stale: refresh the exchange rate and Linea balance.");
  }
  const [total, totalScale] = rational(input.total);
  const [rate, rateScale] = rational(input.rate);
  const [usdRate, usdScale] = rational(input.usdRate);
  const cost = ceil(total * rateScale * 1_000_000n, totalScale * rate);
  const percent = ceil(cost * 5n, 100n);
  const dollar = ceil(usdScale * 1_000_000n, usdRate);
  const buffer = percent > dollar ? percent : dollar;
  const required = cost + buffer;
  const available =
    BigInt(Schema.decodeUnknownSync(TradingUnits)(input.balance)) -
    BigInt(Schema.decodeUnknownSync(TradingUnits)(input.reserved));
  const shortfall =
    required > available ? required - (available > 0n ? available : 0n) : 0n;
  return {
    cost: cost.toString(),
    buffer: buffer.toString(),
    required: required.toString(),
    balance: input.balance,
    reserved: input.reserved,
    shortfall: shortfall.toString(),
    baseDebit: "0",
    minimumArrival: "0",
    bridgeDeduction: "0",
    rate: input.rate,
    usdRate: input.usdRate,
    rateSource: "https://api.coinbase.com/v2/exchange-rates?currency=USDC",
    rateAt: input.rateAt,
    balanceAt: input.balanceAt,
    stubbed: input.stubbed,
  };
};

/** A dispatched attempt keeps its reserve until a person reconciles the issuer charge. */
export const cardCheckoutReserved = (checkout: CardCheckout): boolean =>
  checkout.paymentDispatchedAt !== null ||
  (checkout.stoppedAt === null &&
    !["stopped", "recovery_required"].includes(checkout.stage));
