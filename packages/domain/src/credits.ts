import { Schema } from "effect";

import { AgentConnectionId } from "./agent-invocation";
import type { Allowance } from "./authority";
import { CreditChargeId, CreditEntryId, CreditPurchaseId, TaskId } from "./id";
import { Network } from "./money";

export const CREDITS_PER_USD = 100;
export const CREDIT_UNITS_PER_CREDIT = 10_000;
/** One unit is one USD micro; the separate brand prevents mixing wallet money and usage. */
export const CreditUnits = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
).pipe(Schema.brand("CreditUnits"));
export type CreditUnits = typeof CreditUnits.Type;
export const creditUnits = Schema.decodeUnknownSync(CreditUnits);

export const CreditLimits = Schema.Struct({
  perTaskUnits: CreditUnits,
  dailyUnits: CreditUnits,
  expiresAt: Schema.NullOr(Schema.Int),
  frozen: Schema.Boolean,
});
export type CreditLimits = typeof CreditLimits.Type;
export const defaultCreditLimits = (
  allowance?: Allowance | null
): CreditLimits => ({
  perTaskUnits: creditUnits(allowance?.perSpendUsdMicros ?? 2_000_000),
  dailyUnits: creditUnits(allowance?.dailyUsdMicros ?? 10_000_000),
  expiresAt: null,
  frozen: false,
});

export const CreditSummary = Schema.Struct({
  v: Schema.Literal(1),
  availableUnits: CreditUnits,
  reservedUnits: CreditUnits,
  spentUnits: CreditUnits,
  limits: CreditLimits,
  stubbed: Schema.Boolean,
});
export type CreditSummary = typeof CreditSummary.Type;

export const CreditChargeStatus = Schema.Literals([
  "reserved",
  "captured",
  "released",
  "uncertain",
  "refused",
]);
export type CreditChargeStatus = typeof CreditChargeStatus.Type;
export const CreditCharge = Schema.Struct({
  id: CreditChargeId,
  taskId: TaskId,
  connectionId: Schema.NullOr(AgentConnectionId),
  idempotencyKey: Schema.String,
  units: CreditUnits,
  status: CreditChargeStatus,
  reason: Schema.NullOr(Schema.String),
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  stubbed: Schema.Boolean,
});
export type CreditCharge = typeof CreditCharge.Type;

export const CreditPurchaseStatus = Schema.Literals([
  "quoted",
  "pending",
  "confirmed",
  "failed",
  "uncertain",
]);
export type CreditPurchaseStatus = typeof CreditPurchaseStatus.Type;
export const CreditPurchase = Schema.Struct({
  v: Schema.Literal(1),
  id: CreditPurchaseId,
  status: CreditPurchaseStatus,
  creditUnits: CreditUnits,
  network: Network,
  asset: Schema.String,
  amount: Schema.String.check(Schema.isPattern(/^[1-9]\d{0,77}$/u)),
  payTo: Schema.String,
  expiresAt: Schema.Int,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  transactionId: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  stubbed: Schema.Boolean,
});
export type CreditPurchase = typeof CreditPurchase.Type;

export const CreditLedgerEntry = Schema.Struct({
  id: CreditEntryId,
  kind: Schema.Literals([
    "funding",
    "reserve",
    "capture",
    "release",
    "refusal",
  ]),
  units: CreditUnits,
  availableDelta: Schema.Int,
  reservedDelta: Schema.Int,
  chargeId: Schema.NullOr(CreditChargeId),
  purchaseId: Schema.NullOr(CreditPurchaseId),
  taskId: Schema.NullOr(TaskId),
  at: Schema.Int,
  note: Schema.String,
  stubbed: Schema.Boolean,
});
export type CreditLedgerEntry = typeof CreditLedgerEntry.Type;
