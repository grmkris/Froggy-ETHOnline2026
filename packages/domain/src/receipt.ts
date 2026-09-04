/**
 * The receipt: why it spent, not just that it did.
 *
 * A transaction hash answers "did money move". Nobody who is nervous about an
 * autonomous agent is asking that. They are asking which rule let it through,
 * what evidence it was acting on, and what it thought it was buying — so all
 * three are fields here, and a receipt cannot be constructed without them.
 *
 * `stubbed` exists because this repository ships with every external service
 * faked until its key arrives. A stubbed receipt has to be visibly a stub, in
 * the data and not only in the UI, so a screenshot cannot accidentally be
 * presented as a settled payment.
 */

import { Schema } from "effect";

import { ReceiptId, RunId, SessionId, SpendId } from "./id";
import { PolicyDecision, SpendIntent } from "./mandate";
import { Quote } from "./money";

/**
 * What the agent knew when it decided to spend.
 *
 * `snapshotHash` is a digest of the query result, not the result itself: the
 * body can be large and it is already stored with the spend, but the digest is
 * what makes "this number is the one it acted on" checkable later.
 */
export const Evidence = Schema.Struct({
  query: Schema.String,
  snapshotHash: Schema.String,
  source: Schema.String,
  /** True when the evidence came from a fixture rather than a live provider. */
  stubbed: Schema.Boolean,
});
export type Evidence = typeof Evidence.Type;

export const Settlement = Schema.Struct({
  network: Schema.String,
  /** Chain-native transaction identifier. Hedera's is not a 0x hash. */
  transactionId: Schema.String,
});
export type Settlement = typeof Settlement.Type;

export const Receipt = Schema.Struct({
  at: Schema.Int,
  decision: PolicyDecision,
  evidence: Schema.optional(Evidence),
  id: ReceiptId,
  intent: SpendIntent,
  quote: Quote,
  runId: RunId,
  sessionId: SessionId,
  /** Absent when the decision was `deny` or `ask`, or when settlement failed. */
  settlement: Schema.optional(Settlement),
  spendId: SpendId,
  stubbed: Schema.Boolean,
});
export type Receipt = typeof Receipt.Type;

/** Where a ledger row is in its life. See the ledger for why it is written first. */
export const SpendStatus = Schema.Literals([
  "reserved",
  "settled",
  "failed",
  "refused",
]);
export type SpendStatus = typeof SpendStatus.Type;
