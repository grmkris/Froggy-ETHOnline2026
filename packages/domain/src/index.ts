import { Schema } from "effect";

export {
  EvmAddress,
  HederaEntityId,
  isPayable,
  normalizePayeeId,
  Payee,
  Provenance,
  TRUSTED_PROVENANCE,
} from "./address";
export {
  APPROVAL_KIND_ORDER,
  ApprovalKind,
  ApprovalRecord,
  ApprovalResolution,
} from "./approval";
export { DigestSchedule, NO_DIGEST } from "./digest";
export { DirectoryEntry } from "./directory";
export { AGENT_TOKEN_PREFIX, AgentToken } from "./agent-token";
export {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  OAUTH_SCOPES,
  OAuthClient,
  OAuthGrant,
  OAuthScope,
} from "./oauth";
export { Sale, SaleStatus } from "./sale";
export {
  ClockTime,
  PromptAction,
  RemindAction,
  Schedule,
  ScheduleAction,
  ScheduleCadence,
  ScheduleStatus,
  Weekday,
  WEEKDAYS,
} from "./schedule";
export { Task, TaskKind, TaskStatus } from "./task";
export { decodeUserId, userId, UserId } from "./identity";
export type { Caller } from "./identity";
export {
  AgentTokenId,
  ApprovalId,
  DirectoryId,
  MandateId,
  makeIdSchema,
  NoticeId,
  OAuthClientId,
  OAuthGrantId,
  ReceiptId,
  RuleId,
  RunId,
  SaleId,
  ScheduleId,
  SessionId,
  SpendId,
  TabId,
  TaskId,
} from "./id";
export type { IdSchema, TypeId } from "./id";
export {
  Allow,
  ApprovalThreshold,
  Ask,
  AskExemption,
  defaultRules,
  LIMIT_RULES,
  withoutLimits,
  DenialCode,
  Deny,
  Expiry,
  HostAllowlist,
  Mandate,
  MandateRule,
  NetworkAllowlist,
  PayeeAllowlist,
  PerTxCap,
  PolicyDecision,
  SpendIntent,
  WindowCap,
} from "./mandate";
export {
  Amount,
  Asset,
  formatUsd,
  KNOWN_ASSETS,
  Network,
  parQuote,
  priceInUsdMicros,
  Quote,
  usd,
  UsdMicros,
  usdMicros,
} from "./money";
export { TelegramPairing } from "./telegram";
export { isPrivateAddress, isPrivateHostname, publicHttpUrl } from "./url";
export type { PublicUrlCheck } from "./url";
export {
  Evidence,
  EvidenceDeployment,
  Receipt,
  Settlement,
  spendStatus,
  SpendStatus,
} from "./receipt";

/**
 * Bumped whenever a wire message changes shape. Both sockets carry it, and a
 * client that sees a version it does not know refuses the frame rather than
 * guessing — a screencast socket that guesses is a browser that mis-clicks.
 */
export const PROTOCOL_VERSION = 1 as const;

export const ProtocolVersion = Schema.Literals([PROTOCOL_VERSION]);
