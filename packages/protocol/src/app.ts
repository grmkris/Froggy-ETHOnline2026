/**
 * The app socket: wallet state, receipts, and approval cards.
 *
 * Separate from the browser socket because the two have opposite shapes. The
 * browser socket is a firehose of large binary frames where the newest message
 * supersedes every earlier one; this one is a low-rate stream of small facts
 * where every message matters. Sharing a socket would mean a backlog of frames
 * delaying a freeze acknowledgement.
 */

import {
  Mandate,
  PolicyDecision,
  ProtocolVersion,
  Receipt,
  SessionId,
} from "@froggy/domain";
import { Schema } from "effect";

const Envelope = { v: ProtocolVersion };

/**
 * Which integrations are running against a real provider.
 *
 * Surfaced to the client so the UI can mark a stub in the pane. A build with a
 * faked Graph query must not be able to *look* like a build with a live one,
 * because the difference is the entire Graph qualification.
 */
export const ServiceMode = Schema.Literals(["live", "stub"]);
export type ServiceMode = typeof ServiceMode.Type;

export const ServiceModes = Schema.Struct({
  database: ServiceMode,
  graph: ServiceMode,
  hedera: ServiceMode,
  model: ServiceMode,
  privy: ServiceMode,
});
export type ServiceModes = typeof ServiceModes.Type;

/**
 * One option on an approval card.
 *
 * The four kinds are the whole vocabulary, taken from invok so the same card
 * renders for any harness. `deny_stop` is distinct from `deny` because
 * "no, and stop the run" and "no, try something else" are different
 * instructions and collapsing them loses the ability to say the first one.
 */
export const ApprovalKind = Schema.Literals([
  "deny_stop",
  "deny",
  "allow_session",
  "allow_once",
]);
export type ApprovalKind = typeof ApprovalKind.Type;

export const ApprovalOption = Schema.Struct({
  id: Schema.String,
  kind: ApprovalKind,
  label: Schema.String,
});
export type ApprovalOption = typeof ApprovalOption.Type;

/** Presentation order: the primary "yes" sits last, furthest from a stray click. */
export const APPROVAL_KIND_ORDER: Record<ApprovalKind, number> = {
  allow_once: 3,
  allow_session: 2,
  deny: 1,
  deny_stop: 0,
};

export const ApprovalRequest = Schema.Struct({
  detail: Schema.String,
  /** Server clock past which the card resolves itself as a deny. */
  expiresAt: Schema.Int,
  id: Schema.String,
  options: Schema.Array(ApprovalOption),
  title: Schema.String,
});
export type ApprovalRequest = typeof ApprovalRequest.Type;

export const AppClientMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    optionId: Schema.String,
    requestId: Schema.String,
    type: Schema.Literals(["approval.resolve"]),
  }),
  /**
   * The kill switch. A client message, never a tool — an agent that can call
   * freeze can call unfreeze, and then it is not a kill switch.
   */
  Schema.Struct({
    ...Envelope,
    frozen: Schema.Boolean,
    type: Schema.Literals(["mandate.freeze"]),
  }),
  Schema.Struct({
    ...Envelope,
    mandate: Mandate,
    type: Schema.Literals(["mandate.update"]),
  }),
  Schema.Struct({
    ...Envelope,
    sentAt: Schema.Int,
    type: Schema.Literals(["ping"]),
  }),
]);
export type AppClientMessage = typeof AppClientMessage.Type;

export const WalletSummary = Schema.Struct({
  /** The money address: the smart account when there is one, else the signer. */
  address: Schema.NullOr(Schema.String),
  balanceLabel: Schema.String,
  /** The embedded EOA. What `personal_sign` recovers to; not where funds live. */
  signerAddress: Schema.NullOr(Schema.String),
  windowSpentUsdMicros: Schema.Int,
});
export type WalletSummary = typeof WalletSummary.Type;

export const AppServerMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    modes: ServiceModes,
    sessionId: SessionId,
    type: Schema.Literals(["session.welcome"]),
  }),
  Schema.Struct({
    ...Envelope,
    mandate: Mandate,
    type: Schema.Literals(["mandate.state"]),
  }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(["wallet.state"]),
    wallet: WalletSummary,
  }),
  Schema.Struct({
    ...Envelope,
    receipt: Receipt,
    type: Schema.Literals(["receipt.appended"]),
  }),
  /**
   * A refusal, pushed the moment it happens rather than waiting for the model
   * to narrate it. The jailbreak demo depends on the pane reacting before the
   * chat does: the point is that the rejection did not come from the model.
   */
  Schema.Struct({
    ...Envelope,
    decision: PolicyDecision,
    type: Schema.Literals(["policy.decision"]),
  }),
  Schema.Struct({
    ...Envelope,
    request: ApprovalRequest,
    type: Schema.Literals(["approval.request"]),
  }),
  Schema.Struct({
    ...Envelope,
    requestId: Schema.String,
    type: Schema.Literals(["approval.resolved"]),
  }),
  Schema.Struct({
    ...Envelope,
    sentAt: Schema.Int,
    type: Schema.Literals(["pong"]),
  }),
  Schema.Struct({
    ...Envelope,
    code: Schema.String,
    message: Schema.String,
    type: Schema.Literals(["protocol.error"]),
  }),
]);
export type AppServerMessage = typeof AppServerMessage.Type;

const ClientWire = Schema.fromJsonString(AppClientMessage);
const ServerWire = Schema.fromJsonString(AppServerMessage);

export const decodeAppClientMessage = Schema.decodeUnknownResult(ClientWire);
export const decodeAppServerMessage = Schema.decodeUnknownResult(ServerWire);
export const encodeAppClientMessage = Schema.encodeSync(ClientWire);
export const encodeAppServerMessage = Schema.encodeSync(ServerWire);
