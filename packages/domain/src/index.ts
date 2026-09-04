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
  MandateId,
  makeIdSchema,
  ReceiptId,
  RuleId,
  RunId,
  SessionId,
  SpendId,
  TabId,
} from "./id";
export type { IdSchema, TypeId } from "./id";
export {
  Allow,
  ApprovalThreshold,
  Ask,
  defaultRules,
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
export { Evidence, Receipt, Settlement, SpendStatus } from "./receipt";

/**
 * Bumped whenever a wire message changes shape. Both sockets carry it, and a
 * client that sees a version it does not know refuses the frame rather than
 * guessing — a screencast socket that guesses is a browser that mis-clicks.
 */
export const PROTOCOL_VERSION = 1 as const;

export const ProtocolVersion = Schema.Literals([PROTOCOL_VERSION]);
