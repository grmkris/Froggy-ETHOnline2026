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
export {
  ActionKind,
  Allowance,
  authorityFor,
  AuthoritySide,
  ceilingFor,
  defaultAllowance,
  GRANT_DAYS,
  needsPerson,
  STANDING_AUTHORITY,
} from "./authority";
export type { ActionAuthority } from "./authority";
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
export { Task, TaskKind, TaskStatus, quotePaymentState } from "./task";
export { decodeUserId, userId, UserId } from "./identity";
export type { Caller } from "./identity";
export {
  AgentInvocationId,
  AgentTokenId,
  ApprovalId,
  BrowserPaymentId,
  DirectoryId,
  MandateId,
  makeIdSchema,
  NoticeId,
  OAuthClientId,
  OAuthGrantId,
  PurchaseId,
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
  formatAmount,
  formatUsd,
  knownAsset,
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

export { ConversionId } from "./id";

export { AgentConnectionId, AgentInvocation } from "./agent-invocation";

export {
  Purchase,
  PurchaseGrant,
  PurchaseHttpRequest,
  PurchaseIntent,
  PurchaseQuote,
  PurchaseStatus,
  purchaseFinished,
  PURCHASE_BODY_LIMIT,
  PURCHASE_INPUT_LIMIT,
  PURCHASE_MAX_USD_MICROS,
  PURCHASE_RUN_USD_MICROS,
} from "./purchase";

export { TradeQuoteId } from "./id";

export {
  TradeId,
  TradeStepId,
  TradeRuleId,
  LaunchWatchId,
  LaunchEventId,
} from "./id";

export {
  EvmTradingNetwork,
  TradingNetwork,
  TradingUnits,
  TradingAddress,
  SolanaTradingAddress,
  hasBase58Size,
  sameTradingAddress,
} from "./trading";

export {
  Trade,
  TradeAction,
  TradeEvent,
  TradeExitPolicy,
  TradeAssetAmount,
  TradeInput,
  TradePayload,
  TradeRule,
  TradeSimulation,
  TradeStatus,
  TradeStep,
  TradeStepStatus,
  TradeVenue,
  tradeFinished,
  tradeRuleRefusal,
  tradeProceedsRefusal,
  minimumTradeOutput,
} from "./trade";
export type { TradeRuleUsage } from "./trade";

export {
  LauncherId,
  ResearchStatus,
  LauncherFact,
  TokenTemplateFact,
  LaunchCohortFact,
  HolderConcentrationFact,
  TokenScreenFact,
  TokenResearchFacts,
  TradeResearchPolicy,
  RESEARCH_FRESHNESS_MS,
  tradeResearchRefusal,
  emptyTokenResearchFacts,
} from "./token-research";

export {
  LaunchWatch,
  LaunchReaction,
  LaunchWatchInput,
  LaunchObservation,
} from "./launch-watch";

export {
  ConversationId,
  MessageId,
  ExecutionId,
  ActivityEventId,
  ArtifactId,
} from "./id";
export {
  Conversation,
  HistoryMessage,
  HistoryRun,
  HistoryExecution,
  HistoryArtifact,
  HistoryRecord,
  HistoryId,
  HistoryEvent,
  HistoryPage,
  HistoryChanges,
  HistorySource,
  HistoryStatus,
} from "./history";

export { tradeExitRefusal, tradeExitTrigger } from "./trade-exits";

export { WalletConnectionId, WalletRequestId } from "./id";
export {
  advanceWalletRequest,
  canonicalWalletRequest,
  WALLET_REQUEST_PARAMS_LIMIT,
  WALLET_REQUEST_RESULT_LIMIT,
  WALLET_REQUEST_TTL_MS,
  WALLET_RULE_TTL_MS,
  WalletConnectPayload,
  WalletConnection,
  WalletMessagePayload,
  WalletRequest,
  WalletRequestDelivery,
  WalletRequestEvent,
  WalletRequestInitiator,
  WalletRequestKind,
  WalletRequestPayload,
  WalletRequestStatus,
  WalletTransactionPayload,
  WalletTypedDataPayload,
  walletRequestFinished,
} from "./wallet-request";
export {
  assessMessage,
  assessTransaction,
  assessTypedData,
  parseSiwe,
  parseTypedData,
} from "./dapp-decode";
export type {
  DappAssessment,
  SiweMessage,
  TypedDataDocument,
} from "./dapp-decode";

export {
  MailboxId,
  EmailId,
  EmailDraftId,
  EmailFileId,
  EmailWaitId,
} from "./id";
export {
  EmailAddress,
  EmailHandle,
  Mailbox,
  EmailFile,
  EmailMessage,
  EmailDraftInput,
  EmailDraft,
  EmailWait,
  EmailRecord,
} from "./email";

export { WatchlistItemId } from "./id";
export {
  WatchlistInput,
  WatchlistItem,
  WatchlistSource,
  watchlistSourceKey,
} from "./watchlist";

export { MonitorId, MonitorCheckId } from "./id";
export {
  MonitorCondition,
  MonitorConfig,
  MonitorObservation,
  Monitor,
  MonitorCheck,
  MonitoringBook,
  emptyMonitoringBook,
  monitorMatches,
} from "./monitoring";

export {
  WalletActivity,
  WalletActivityFlow,
  WalletMonitor,
  WalletMonitorStatus,
  WALLET_MONITOR_DURATION_MS,
  WALLET_MONITOR_USER_LIMIT,
  WALLET_MONITOR_ADDRESS_LIMIT,
} from "./wallet-monitor";

export { WalletMonitorId, WalletActivityId } from "./id";

export { OnchainAlertRuleId } from "./id";
export {
  OnchainNetwork,
  OnchainAsset,
  OnchainAlertCondition,
  OnchainAlertRule,
  WalletPriceEvaluation,
} from "./wallet-monitor";

export {
  OnchainPriceNetwork,
  PriceAsset,
  PriceDecimal,
  PriceObservation,
  PriceOracleFeed,
  PriceQuoteCurrency,
  ResolvedPriceSource,
  matchesPriceThreshold,
  priceDecimalRatio,
  priceRatioDecimal,
} from "./onchain-price";
export type { PriceRatio } from "./onchain-price";

export {
  CREDITS_PER_USD,
  CREDIT_UNITS_PER_CREDIT,
  CreditUnits,
  creditUnits,
  CreditLimits,
  defaultCreditLimits,
  CreditSummary,
  CreditChargeStatus,
  CreditCharge,
  CreditPurchaseStatus,
  CreditPurchase,
  CreditLedgerEntry,
} from "./credits";
export { CreditChargeId, CreditPurchaseId, CreditEntryId } from "./id";

export * from "./card-checkout";
export { PaymentMethodId, CardCheckoutId } from "./id";

export { WatchlistData, WatchlistObservation, WatchlistFact, emptyWatchlistData } from "./watchlist-data";

export { WatchlistPreviewId } from "./id";
