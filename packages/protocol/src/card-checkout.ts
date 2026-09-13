import {
  CardCheckout,
  CardCheckoutId,
  CardCredentials,
  PaymentMethod,
  PaymentMethodId,
  TaskId,
  TradingUnits,
} from "@froggy/domain";
import { Schema } from "effect";

import { TradeAnswer, TradeTicket } from "./trade-execution";

export const PaymentMethodSave = Schema.Struct({
  v: Schema.Literal(1),
  label: PaymentMethod.fields.label,
  fundingAddress: PaymentMethod.fields.fundingAddress,
  credentials: CardCredentials,
  expectedRevision: Schema.optionalKey(PaymentMethod.fields.revision),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type PaymentMethodSave = typeof PaymentMethodSave.Type;
export const PaymentMethodView = Schema.Struct({
  method: PaymentMethod,
  balance: Schema.NullOr(TradingUnits),
  observedAt: Schema.NullOr(Schema.Int),
  stubbed: Schema.Boolean,
});
export const PaymentMethods = Schema.Struct({
  v: Schema.Literal(1),
  enabled: Schema.Boolean,
  liveCardEntry: Schema.Boolean,
  methods: Schema.Array(PaymentMethodView).check(Schema.isMaxLength(20)),
});
export const CardCheckoutPrepare = Schema.Struct({
  v: Schema.Literal(1),
  paymentMethodId: PaymentMethodId,
  taskId: TaskId,
  idempotencyKey: CardCheckout.fields.idempotencyKey,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export const CardCheckoutApprove = Schema.Struct({
  v: Schema.Literal(1),
  fingerprint: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  tradeAnswer: Schema.NullOr(TradeAnswer),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export const CardCheckoutView = Schema.Struct({
  v: Schema.Literal(1),
  checkout: CardCheckout,
  trade: Schema.NullOr(TradeTicket),
});
export const CardCheckoutList = Schema.Struct({
  v: Schema.Literal(1),
  checkouts: Schema.Array(CardCheckout).check(Schema.isMaxLength(50)),
});
export const CardCheckoutControl = Schema.Struct({
  v: Schema.Literal(1),
  id: CardCheckoutId,
});
