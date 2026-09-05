/**
 * Approvals: the third answer.
 *
 * `allow` and `deny` are the policy's. `ask` hands the decision to a person,
 * and what the person says has to be recorded with the same care as a rule
 * id — a receipt that says "allowed" without saying "because you said so at
 * 14:02" has lost the one fact that made the spend legitimate.
 */

import { Schema } from "effect";

import { ApprovalId } from "./id";

/**
 * What a person can answer. Kept as literals rather than booleans because
 * "no, and stop the run" and "no, try something else" are different
 * instructions, and collapsing them loses the ability to say the first.
 */
export const ApprovalKind = Schema.Literals([
  "deny_stop",
  "deny",
  "allow_session",
  "allow_once",
]);
export type ApprovalKind = typeof ApprovalKind.Type;

/** Presentation order: the primary "yes" sits last, furthest from a stray click. */
export const APPROVAL_KIND_ORDER: Record<ApprovalKind, number> = {
  allow_once: 3,
  allow_session: 2,
  deny: 1,
  deny_stop: 0,
};

/**
 * How a question ended. The four answers, plus the three ways a question
 * ends without one: the clock ran out, the run was stopped underneath it, or
 * there was nobody to ask (a scheduled job has no screen).
 */
export const ApprovalResolution = Schema.Literals([
  ...ApprovalKind.literals,
  "timeout",
  "aborted",
  "unavailable",
]);
export type ApprovalResolution = typeof ApprovalResolution.Type;

/** What the receipt keeps of the question. */
export const ApprovalRecord = Schema.Struct({
  id: ApprovalId,
  resolution: ApprovalResolution,
});
export type ApprovalRecord = typeof ApprovalRecord.Type;
