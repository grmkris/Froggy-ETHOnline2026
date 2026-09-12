/**
 * The app socket: wallet state, receipts, and approval cards.
 *
 * Separate from the browser socket because the two have opposite shapes. The
 * browser socket is a firehose of large binary frames where the newest message
 * supersedes every earlier one; this one is a low-rate stream of small facts
 * where every message matters. Sharing a socket would mean a backlog of frames
 * delaying an approval acknowledgement.
 */

import {
  Allowance,
  ApprovalKind,
  Mandate,
  NoticeId,
  PolicyDecision,
  ProtocolVersion,
  Receipt,
  RunId,
  ScheduleId,
  SessionId,
  UsdMicros,
  WalletRequestId,
  WalletRequestInitiator,
  WalletRequestKind,
} from "@froggy/domain";
import { Schema } from "effect";

import { WalletRequestView } from "./browser-wallet";

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
  birdeye: Schema.optional(ServiceMode),
  quicknode: Schema.optional(ServiceMode),
  uniswap: Schema.optional(ServiceMode),
  goplus: Schema.optional(ServiceMode),
  browser: ServiceMode,
  database: ServiceMode,
  graph: ServiceMode,
  hedera: ServiceMode,
  model: ServiceMode,
  privy: ServiceMode,
  telegram: ServiceMode,
});

/** Where a turn was started from. The web app shows a turn it did not start. */
export const RunSurface = Schema.Literals([
  "web",
  "telegram",
  "digest",
  "schedule",
]);
export type RunSurface = typeof RunSurface.Type;
export type ServiceModes = typeof ServiceModes.Type;

/**
 * Something the agent said to the person without being asked: a message it
 * chose to send, a reminder coming due, or the report of an unattended
 * turn. `telegram` says whether it also reached their phone, so the stream
 * can be honest about which surface the person actually saw it on.
 */
export const NoticeSource = Schema.Literals([
  "email",
  "notify",
  "reminder",
  "scheduled_run",
]);
export type NoticeSource = typeof NoticeSource.Type;

export const Notice = Schema.Struct({
  at: Schema.Int,
  id: NoticeId,
  /** The turn that sent it, when one did. */
  runId: Schema.NullOr(RunId),
  /** The schedule that fired it, when one did. */
  scheduleId: Schema.NullOr(ScheduleId),
  source: NoticeSource,
  telegram: Schema.Boolean,
  text: Schema.String,
});
export type Notice = typeof Notice.Type;

/**
 * One option on an approval card.
 *
 * The four kinds are the whole vocabulary, so the same card renders on every
 * surface. `deny_stop` is distinct from `deny` because
 * "no, and stop the run" and "no, try something else" are different
 * instructions and collapsing them loses the ability to say the first one.
 */
const ApprovalOption = Schema.Struct({
  id: Schema.String,
  kind: ApprovalKind,
  label: Schema.String,
});

const BreakdownLabel = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(80)
);
const BreakdownAmountLabel = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(40)
);
const BreakdownNote = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(240)
);

/**
 * One line of the approval ledger: product, delivery or network fee, fees,
 * or agent spend so far today.
 *
 * `amountUsdMicros` or `amountLabel` (or both). A line with neither is
 * refused rather than shown as a blank. Callers omit unknown lines; they
 * do not invent amounts.
 */
export const ApprovalBreakdownLine = Schema.Struct({
  label: BreakdownLabel,
  amountUsdMicros: Schema.optionalKey(UsdMicros),
  amountLabel: Schema.optionalKey(BreakdownAmountLabel),
  note: Schema.optionalKey(BreakdownNote),
}).check(
  Schema.makeFilter(
    (line) =>
      line.amountUsdMicros !== undefined || line.amountLabel !== undefined,
    { message: "A breakdown line needs an amount." }
  )
);
export type ApprovalBreakdownLine = typeof ApprovalBreakdownLine.Type;

/**
 * What a card about a dapp request carries beyond the money ledger.
 *
 * `needsSignature` is the difference between two cards that look alike: an
 * allow on a connect resolves over the socket like any approval, while an
 * allow on a signature makes the browser sign a one-shot Privy rule first,
 * because the person's key is the only one that can widen their own policy.
 */
export const ApprovalWalletBlock = Schema.Struct({
  requestId: WalletRequestId,
  kind: WalletRequestKind,
  origin: Schema.String,
  chainId: Schema.Int,
  initiatedDuring: WalletRequestInitiator,
  lines: Schema.Array(Schema.String.check(Schema.isMaxLength(300))).check(
    Schema.isMaxLength(12)
  ),
  warnings: Schema.Array(Schema.String.check(Schema.isMaxLength(300))).check(
    Schema.isMaxLength(6)
  ),
  needsSignature: Schema.Boolean,
});
export type ApprovalWalletBlock = typeof ApprovalWalletBlock.Type;

export const ApprovalRequest = Schema.Struct({
  runId: Schema.optional(RunId),
  /** Present only on a card about a dapp request. */
  wallet: Schema.optionalKey(ApprovalWalletBlock),
  /** "$0.50", "0.05 tHBAR" — what the card prints large. */
  amountLabel: Schema.String,
  /**
   * The four-line money ledger. Optional so a card written before this
   * field still decodes and still renders as amount-plus-detail. Cap at
   * six so a sender cannot dump a statement onto the ticket.
   */
  breakdown: Schema.optionalKey(
    Schema.Array(ApprovalBreakdownLine).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(6)
    )
  ),
  detail: Schema.String,
  /** Server clock past which the card resolves itself as a deny. */
  expiresAt: Schema.Int,
  id: Schema.String,
  options: Schema.Array(ApprovalOption),
  payeeLabel: Schema.String,
  purpose: Schema.String,
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

/**
 * Whether the agent currently holds a signature on this wallet.
 *
 * `pending` is a real state, not a placeholder: the grant is asked for
 * asynchronously on the first authenticated request, so there is a second or
 * two where the honest answer is "asking". Collapsing it into `absent` would
 * flash a scary "the agent cannot pay" on every sign-in.
 */
export const AgentSignerState = Schema.Literals([
  "granted",
  "pending",
  "absent",
  /**
   * The agent may sign, but under the app-wide policy every wallet used to
   * share rather than under rules this person set.
   *
   * Deliberately not `granted`: the agent can spend either way, so collapsing
   * the two would be technically true and would hide the only thing the person
   * can act on — that the numbers holding their agent are not theirs yet. It is
   * the state everybody who granted before per-person policies is in.
   */
  "shared",
]);
export type AgentSignerState = typeof AgentSignerState.Type;

export const WalletSummary = Schema.Struct({
  /** The money address: the smart account when there is one, else the signer. */
  address: Schema.NullOr(Schema.String),
  /** Why the agent has no signature, when it has none. Shown verbatim. */
  agentNote: Schema.NullOr(Schema.String),
  agentSigner: AgentSignerState,
  /**
   * The numbers this person's agent is held to, when they have set any.
   *
   * The whole `Allowance` rather than the fields a screen happens to want: it
   * is what their Privy policy and their mandate are both generated from, so
   * anything that shows one of these numbers should be showing that object and
   * not a copy that can drift from it.
   */
  agentAllowance: Schema.NullOr(Allowance),
  /**
   * The Privy policy this person's agent signs under, when they have one of
   * their own. Null while they are on the app-wide policy, and the welcome's
   * `policyId` is what the screen falls back to.
   */
  agentPolicyId: Schema.NullOr(Schema.String),
  balanceLabel: Schema.String,
  /**
   * What the chains say the person holds, read for display and never spent
   * on the strength of: USDC in the wallet on the configured Base, HBAR in
   * their own Hedera account, and the rate that prices the HBAR. Null where
   * nothing answered or there is no account yet. The networks say which
   * explorer a link goes to.
   */
  balances: Schema.Struct({
    evmNetwork: Schema.String,
    hbarTinybars: Schema.NullOr(Schema.String),
    hederaNetwork: Schema.String,
    usdMicrosPerHbar: Schema.NullOr(Schema.Finite),
    usdcUnits: Schema.NullOr(Schema.String),
  }),
  /**
   * The person's own Hedera account, `0.0.x`, once the host has opened one:
   * null before their first Hedera payment, and on a deployment that pays
   * from the host pocket.
   */
  hederaAccountId: Schema.NullOr(Schema.String),
  /**
   * Set when the spend history could not be read.
   *
   * `windowSpentUsdMicros` is then a floor, not a total, and saying so matters:
   * a wallet reporting "$0 spent" because the database is unreachable looks
   * exactly like one with a full allowance left.
   */
  ledgerNote: Schema.NullOr(Schema.String),
  /**
   * What is left in the person's Hedera pocket, in USD millionths, or null
   * when this deployment draws nothing from a pocket. A top-up raises it, a
   * Hedera payment lowers it.
   */
  pocketUsdMicros: Schema.NullOr(Schema.Int),
  /** The embedded EOA. What `personal_sign` recovers to; not where funds live. */
  signerAddress: Schema.NullOr(Schema.String),
  /**
   * The one number a person is shown: USDC on Base plus the HBAR in their own
   * Hedera account at the mirror-node rate, in USD millionths. Null when
   * either side is unknown, because an unknown balance is not zero.
   */
  totalUsdMicros: Schema.NullOr(Schema.Int),
  windowSpentUsdMicros: Schema.Int,
});
export type WalletSummary = typeof WalletSummary.Type;

export const AppServerMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    type: Schema.Literal("history.changed"),
    sequence: Schema.Int,
  }),
  Schema.Struct({
    ...Envelope,
    /**
     * The key quorum the agent signs with, when the server has one. Public:
     * the browser names it when the person grants the agent a signature on
     * their wallet, and Privy holds the key.
     */
    agentSignerId: Schema.NullOr(Schema.String),
    /** The Hedera Consensus Service topic the audit notes are posted to, when one is pinned. */
    hcsTopicId: Schema.NullOr(Schema.String),
    /** Where an MCP client connects by URL, once this deployment answers there; null until it does. */
    mcpUrl: Schema.NullOr(Schema.String),
    modes: ServiceModes,
    /** The Privy policy the agent's signer is held to, when the agent has one. */
    policyId: Schema.NullOr(Schema.String),
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
  /** A dapp request moved. The Activity pane and the ticket follow it by id. */
  Schema.Struct({
    ...Envelope,
    request: WalletRequestView,
    type: Schema.Literals(["wallet.request.state"]),
  }),
  /**
   * A turn began somewhere other than this tab — a Telegram message, the
   * daily digest. The tab cannot attach to it mid-stream, so it says so and
   * offers a reload, which resumes the run's replay.
   */
  Schema.Struct({
    ...Envelope,
    runId: Schema.String,
    surface: RunSurface,
    type: Schema.Literals(["run.started"]),
  }),
  /** The agent spoke unprompted. Filed in the stream where it happened. */
  Schema.Struct({
    ...Envelope,
    notice: Notice,
    type: Schema.Literals(["notice"]),
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
