import {
  CreditLedgerEntry,
  CreditPurchase,
  CreditSummary,
  CreditUnits,
} from "@froggy/domain";
import { Schema } from "effect";

export {
  CreditSummary,
  CreditLimits,
  CreditPurchase,
  CreditUnits,
} from "@froggy/domain";
export const CreditLimitsUpdate = Schema.Struct({
  v: Schema.Literal(1),
  perTaskUnits: CreditUnits,
  dailyUnits: CreditUnits,
});
export type CreditLimitsUpdate = typeof CreditLimitsUpdate.Type;
export const CreditActivity = Schema.Struct({
  v: Schema.Literal(1),
  entries: Schema.Array(CreditLedgerEntry),
  purchases: Schema.Array(CreditPurchase),
});
export type CreditActivity = typeof CreditActivity.Type;

export const CreditState = Schema.Struct({
  ...CreditSummary.fields,
  funding: Schema.Array(
    Schema.Struct({
      network: Schema.String,
      label: Schema.String,
      asset: Schema.String,
      payTo: Schema.String,
      available: Schema.Boolean,
      reason: Schema.NullOr(Schema.String),
      stubbed: Schema.Boolean,
    })
  ),
});
export type CreditState = typeof CreditState.Type;
