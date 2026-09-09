import { Schema } from "effect";

import { AgentConnectionId } from "./agent-invocation";
import {
  ApprovalId,
  BrowserPaymentId,
  DirectoryId,
  PurchaseId,
  ReceiptId,
  RuleId,
  RunId,
} from "./id";
import { Amount, Network, UsdMicros } from "./money";

export const PURCHASE_BODY_LIMIT = 64 * 1024;
export const PURCHASE_INPUT_LIMIT = 16 * 1024;
export const PURCHASE_MAX_USD_MICROS = 1_000_000;
export const PURCHASE_RUN_USD_MICROS = 2_000_000;

export const PurchaseHttpRequest = Schema.Struct({
  url: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192)),
  method: Schema.Literals(["GET", "POST"]),
  /** JSON only. Credentials and arbitrary headers never come from a tool. */
  body: Schema.NullOr(
    Schema.String.check(Schema.isMaxLength(PURCHASE_INPUT_LIMIT))
  ),
});
export type PurchaseHttpRequest = typeof PurchaseHttpRequest.Type;

export const PurchaseStatus = Schema.Literals([
  "probing",
  "awaiting_approval",
  "paying",
  "completed",
  "declined",
  "cancelled",
  "expired",
  "failed",
  "uncertain",
]);
export type PurchaseStatus = typeof PurchaseStatus.Type;

export const PurchaseQuote = Schema.Struct({
  amount: Amount,
  payTo: Schema.String.check(Schema.isMaxLength(256)),
  origin: Schema.String.check(Schema.isMaxLength(8192)),
  scheme: Schema.Literals(["exact"]),
  extra: Schema.Record(Schema.String, Schema.Unknown),
  maxTimeoutSeconds: Schema.Int,
  usdMicros: UsdMicros,
  /** Canonical hash of the exact offer, including its signing parameters. */
  fingerprint: Schema.String,
});
export type PurchaseQuote = typeof PurchaseQuote.Type;

/** Permission is written by the authenticated person, never by the requester. */
export const PurchaseGrant = Schema.Struct({
  source: Schema.Literals(["human", "directory", "server"]),
  ruleId: RuleId,
  approvalId: ApprovalId,
  directoryId: Schema.NullOr(DirectoryId),
  grantedAt: Schema.Int,
  expiresAt: Schema.Int,
  requestFingerprint: Schema.String,
  quoteFingerprint: Schema.String,
});
export type PurchaseGrant = typeof PurchaseGrant.Type;

export const Purchase = Schema.Struct({
  id: PurchaseId,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  idempotencyKey: Schema.String.check(Schema.isMaxLength(256)),
  connectionId: Schema.NullOr(AgentConnectionId),
  source: Schema.Literals(["chat", "browser", "agent", "web"]),
  runId: RunId,
  toolCallId: Schema.NullOr(Schema.String),
  browserPaymentId: Schema.NullOr(BrowserPaymentId),
  request: PurchaseHttpRequest,
  requestFingerprint: Schema.String,
  purpose: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
  maxUsdMicros: UsdMicros,
  budgetUsdMicros: UsdMicros,
  preferredNetwork: Schema.NullOr(Network),
  contactApprovedAt: Schema.NullOr(Schema.Int),
  status: PurchaseStatus,
  quote: Schema.NullOr(PurchaseQuote),
  approvalId: ApprovalId,
  expiresAt: Schema.Int,
  grant: Schema.NullOr(PurchaseGrant),
  payment: Schema.Struct({
    state: Schema.Literals([
      "none",
      "signed",
      "sent",
      "settled",
      "uncertain",
      "failed",
    ]),
    /** Audit a proof without storing a redeemable signature. */
    proofHash: Schema.NullOr(Schema.String),
    transactionId: Schema.NullOr(Schema.String),
    sentAt: Schema.NullOr(Schema.Int),
  }),
  delivery: Schema.Struct({
    state: Schema.Literals(["pending", "delivered", "failed"]),
    status: Schema.NullOr(Schema.Int),
    contentType: Schema.NullOr(Schema.String),
    body: Schema.NullOr(
      Schema.String.check(Schema.isMaxLength(PURCHASE_BODY_LIMIT))
    ),
    bodyHash: Schema.NullOr(Schema.String),
  }),
  receiptId: Schema.NullOr(ReceiptId),
  error: Schema.NullOr(Schema.String.check(Schema.isMaxLength(1500))),
  stubbed: Schema.Boolean,
});
export type Purchase = typeof Purchase.Type;

/** Exact purchase context carried into the pure policy decision. */
export const PurchaseIntent = Schema.Struct({
  id: PurchaseId,
  requestFingerprint: Schema.String,
  quoteFingerprint: Schema.String,
});
export type PurchaseIntent = typeof PurchaseIntent.Type;

export const purchaseFinished = (status: PurchaseStatus): boolean =>
  status !== "probing" && status !== "awaiting_approval" && status !== "paying";
