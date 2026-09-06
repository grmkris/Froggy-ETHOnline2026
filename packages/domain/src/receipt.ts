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

import { ApprovalRecord } from "./approval";
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
/**
 * One index that contributed to (or was refused from) an answer.
 *
 * On the receipt because "the agent paid on the strength of this number" is
 * only checkable if the receipt says which deployment, at which block. A
 * source URL alone is a claim about a gateway, not about the data.
 */
export const EvidenceDeployment = Schema.Struct({
  blockNumber: Schema.NullOr(Schema.Finite),
  id: Schema.String,
  label: Schema.String,
  /** `fresh`, `stale` or `unavailable`. A stale index contributed nothing. */
  status: Schema.String,
});
export type EvidenceDeployment = typeof EvidenceDeployment.Type;

export const Evidence = Schema.Struct({
  deployments: Schema.Array(EvidenceDeployment),
  query: Schema.String,
  snapshotHash: Schema.String,
  source: Schema.String,
  /** True when the evidence came from a fixture rather than a live provider. */
  stubbed: Schema.Boolean,
});
export type Evidence = typeof Evidence.Type;

export const Settlement = Schema.Struct({
  /** The Hedera Consensus Service note about this payment, when one was posted. */
  hcsSequence: Schema.optional(Schema.Int),
  network: Schema.String,
  /** Chain-native transaction identifier. Hedera's is not a 0x hash. */
  transactionId: Schema.String,
});
export type Settlement = typeof Settlement.Type;

export const Receipt = Schema.Struct({
  /** Present when a person was asked. The decision is what their answer led to. */
  approval: Schema.optional(ApprovalRecord),
  at: Schema.Int,
  decision: PolicyDecision,
  evidence: Schema.optional(Evidence),
  id: ReceiptId,
  intent: SpendIntent,
  quote: Quote,
  runId: RunId,
  sessionId: SessionId,
  /**
   * Why the payment did not go through, when the policy allowed it and it
   * still did not: the signer's refusal in its own words, the seller's
   * error, a network fault. Absent on a settled or refused receipt.
   */
  failure: Schema.optional(Schema.String),
  /** Absent when the decision was `deny` or `ask`, or when settlement failed. */
  settlement: Schema.optional(Settlement),
  spendId: SpendId,
  stubbed: Schema.Boolean,
  /**
   * The tool call that spent, when a tool did. The chat files the receipt
   * under that call's card; a receipt from a job or a replay has none.
   */
  toolCallId: Schema.optional(Schema.String),
});
export type Receipt = typeof Receipt.Type;

/**
 * Where a ledger row is in its life. See the ledger for why it is written first.
 *
 * `failed` and `abandoned` are different facts. A failed spend sent something
 * outbound and did not get a good answer, so money may have moved and the row
 * counts against the cap until somebody says otherwise. An abandoned spend
 * never sent anything — the wallet froze or the run was stopped between the
 * reservation and the call — and consuming allowance for it would be a cap
 * on decisions rather than on money.
 *
 * `uncertain` is the third fact: the payment was sent and neither the seller
 * nor the network has said whether it landed. It counts against the cap like
 * a failure and, unlike one, is never refunded until a mirror node says the
 * money did not move.
 */
export const SpendStatus = Schema.Literals([
  "reserved",
  "settled",
  "failed",
  "refused",
  "abandoned",
  "uncertain",
]);
export type SpendStatus = typeof SpendStatus.Type;

/**
 * For a status read back out of the ledger's `text` column.
 *
 * Postgres has no cheap sum type, so the column widens to text on the way in
 * and narrows here on the way out. A parse rather than an assertion, so a row
 * edited by hand fails loudly instead of flowing through the policy engine as
 * a status nothing handles.
 */
export const spendStatus = Schema.decodeUnknownSync(SpendStatus);
