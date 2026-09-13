import {
  AgentInvocation,
  quotePaymentState,
  ConversionId,
  Mandate,
  Purchase,
  Receipt,
  Sale,
  Schedule,
  Task,
  WalletConnection,
  WalletRequest,
} from "@froggy/domain";
import type {
  Allowance,
  AgentConnectionId,
  AgentInvocationId,
  AgentToken,
  AgentTokenId,
  ApprovalId,
  DirectoryEntry,
  OAuthClient,
  OAuthClientId,
  OAuthGrant,
  OAuthGrantId,
  OAuthScope,
  RunId,
  ReceiptId,
  PurchaseId,
  PurchaseStatus,
  SaleId,
  ScheduleId,
  ScheduleStatus,
  TaskId,
  TelegramPairing,
  UserId,
  WalletConnectionId,
  WalletRequestId,
  WalletRequestStatus,
} from "@froggy/domain";
/**
 * What survives a restart, beyond the ledger.
 *
 * What a redeploy must not forget: the mandate a person edited, the receipts
 * that say why money moved, the sales book, the tasks and the agent tokens.
 * The ledger already outlives the process; this is the rest.
 *
 * Same split as the ledger: an in-memory store when there is no database,
 * reported as `database=stub` in the pane, and a Postgres one otherwise,
 * behind one interface. Nothing above this line knows which it holds.
 */
import { Result, Schema } from "effect";

import { memoryCardStore } from "./card-store";
import type { CardStore } from "./card-store";
import type { CreditStore } from "./credit-store";
import { memoryCreditStore } from "./credit-store-memory";
import type { HistoryStore } from "./history-store";
import { memoryHistoryStore } from "./history-store";
import { memoryLaunchStore } from "./launch-store";
import type { LaunchStore } from "./launch-store";
import { memoryMonitoringStore } from "./monitoring-store";
import type { MonitoringStore } from "./monitoring-store";
import { memoryTradingStore } from "./trading-store";
import type { TradingStore } from "./trading-store";
import type { WatchlistDataStore } from "./watchlist-data-store";
import { memoryWatchlistDataStore } from "./watchlist-data-store";
import { memoryWatchlistStore } from "./watchlist-store";
import type { WatchlistStore } from "./watchlist-store";

/** A token row with the one field the domain record leaves out. */
interface AgentTokenRow extends AgentToken {
  /** SHA-256 of the secret, hex. Never the secret. */
  readonly secretHash: string;
}

/** A due schedule, with whose it is: the ticker fires it on their behalf. */
export interface DueSchedule {
  readonly claimedAt: number;
  readonly schedule: Schedule;
  readonly userId: UserId;
}

/**
 * What a run writes back. `lastRunAt` is absent for a retry that did not
 * run (the person was mid-turn), so the row keeps saying when it last did.
 */
export interface ScheduleFinish {
  readonly lastRunAt?: number;
  readonly nextRunAt: number | null;
  readonly status: ScheduleStatus;
}

export type OAuthTokenKind = "access" | "code" | "refresh";

/**
 * A code, access token or refresh token, keyed by the hash of the secret.
 * The secret itself is never stored; a copy of this row cannot be presented.
 */
export interface OAuthTokenRow {
  /** PKCE S256 challenge, on codes only. */
  readonly codeChallenge: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly grantId: OAuthGrantId;
  /** SHA-256 of the secret, hex. */
  readonly hash: string;
  readonly kind: OAuthTokenKind;
  /** The redirect the code was issued to, on codes only. */
  readonly redirectUri: string | null;
  /** The resource the code was asked for, on codes only, when one was named. */
  readonly resource: string | null;
  readonly revokedAt: number | null;
  readonly scopes: readonly OAuthScope[];
  /** Set exactly once, by `consume`. */
  readonly usedAt: number | null;
}

/**
 * What a task update may change. Everything else is fixed at creation.
 *
 * `input` and `priceUsdMicros` are here for one caller: re-pricing a browse
 * quote nobody has paid, through `claim(..., "quoted", ...)`, so the same card
 * can ask for another budget or a fresh expiry. A quote is a draft; once a
 * task is paid its price and input are what the sale bought and stay put.
 */
type TaskPatch = Partial<
  Pick<
    Task,
    | "error"
    | "input"
    | "priceUsdMicros"
    | "result"
    | "runId"
    | "saleId"
    | "chargeId"
    | "priceCreditUnits"
    | "chargeStatus"
    | "status"
  >
> & { readonly updatedAt: number };

/** What a sale update may change once the proof is on file. */
type SalePatch = Partial<
  Pick<
    Sale,
    "deliveredAt" | "error" | "result" | "status" | "stubbed" | "transactionId"
  >
>;

/**
 * Who holds the account's ECDSA key: Froggy, sealed at rest, or Privy, as a
 * cosmos-type wallet whose key signs through `raw_sign`.
 */
export type HederaCustody =
  | {
      readonly kind: "privy";
      readonly publicKey: string;
      readonly walletId: string;
    }
  | { readonly keyCiphertext: string; readonly kind: "sealed" };

export interface HederaReceivingRecord {
  /** Null until an external HBAR transfer creates the account for its persisted key. */
  readonly accountId: string | null;
  readonly custody: HederaCustody;
}

export interface HederaAccountRecord {
  /** `0.0.x`. */
  readonly accountId: string;
  readonly custody: HederaCustody;
}

/**
 * The person's own Privy policy, and the numbers it was built from.
 *
 * The allowance is kept beside the id deliberately. It is the same allowance
 * the *mandate* is generated from, and `authorize` must be able to hold that
 * ceiling synchronously with no network call — a leash that needed Privy to be
 * reachable in order to refuse would be no leash at all.
 */
export interface PersonPolicyRecord {
  readonly allowance: Allowance;
  readonly policyId: string;
}

const CustodyRecord = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(["sealed"]),
    keyCiphertext: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literals(["privy"]),
    walletId: Schema.String,
    publicKey: Schema.String,
  }),
]);
export const FundingSubmission = Schema.Struct({
  transactionId: Schema.String,
  tinybars: Schema.Number,
  accountId: Schema.NullOr(Schema.String),
  alias: Schema.NullOr(Schema.String),
  custody: Schema.NullOr(CustodyRecord),
});
export type FundingSubmission = typeof FundingSubmission.Type;
export const ConversionRecord = Schema.Struct({
  id: ConversionId,
  key: Schema.String,
  usdMicros: Schema.Number,
  evmNetwork: Schema.String,
  hederaNetwork: Schema.String,
  phase: Schema.Literals([
    "usdc_pending",
    "usdc_confirmed",
    "hbar_pending",
    "funded",
    "failed",
  ]),
  usdcHash: Schema.NullOr(Schema.String),
  funding: Schema.NullOr(FundingSubmission),
  error: Schema.NullOr(Schema.String),
  credited: Schema.Boolean,
});
export type ConversionRecord = typeof ConversionRecord.Type;
export type ConversionPatch = Partial<
  Pick<ConversionRecord, "phase" | "usdcHash" | "funding" | "error">
>;
export const decodeConversion = Schema.decodeUnknownSync(ConversionRecord);

export type PurchasePatch = Partial<
  Pick<
    Purchase,
    | "status"
    | "quote"
    | "grant"
    | "payment"
    | "delivery"
    | "receiptId"
    | "error"
    | "stubbed"
    | "expiresAt"
    | "contactApprovedAt"
    | "approvalId"
  >
> & { readonly updatedAt: number };

/**
 * What may change on a dapp request after it is written. Its origin, payload,
 * fingerprint and context are fixed at creation: the card the person answers
 * is built from them, and a record that could be re-pointed afterwards would
 * be an approval of nothing in particular.
 */
export type WalletRequestPatch = Partial<
  Pick<
    WalletRequest,
    | "status"
    | "delivery"
    | "approvalId"
    | "nonce"
    | "signedHash"
    | "transactionHash"
    | "summary"
    | "receiptId"
    | "error"
    | "expiresAt"
    | "runId"
  >
> & { readonly updatedAt: number };

/** An in-flight request with whose it is, for boot recovery across every person. */
export interface OwnedWalletRequest {
  readonly request: WalletRequest;
  readonly userId: UserId;
}

export const BrowserProfileRecord = Schema.Struct({
  profileId: Schema.String.check(Schema.isUUID()),
  browserId: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  apiVersion: Schema.optional(Schema.Literals([3, 4])),
  uncertain: Schema.Boolean,
  usage: Schema.optional(
    Schema.Struct({
      sessions: Schema.Int,
      unreportedSessions: Schema.Int,
      browserUsdMicros: Schema.Int,
      proxyUsdMicros: Schema.Int,
      lastBrowserId: Schema.String.check(Schema.isUUID()),
      lastBrowserUsdMicros: Schema.NullOr(Schema.Int),
      lastProxyUsdMicros: Schema.NullOr(Schema.Int),
      updatedAt: Schema.Int,
    })
  ),
});
export type BrowserProfileRecord = typeof BrowserProfileRecord.Type;

export interface Store {
  readonly credits: CreditStore;
  readonly browsers: {
    readonly load: (userId: UserId) => Promise<BrowserProfileRecord | null>;
    readonly save: (
      userId: UserId,
      record: BrowserProfileRecord
    ) => Promise<void>;
  };
  readonly watchlist: WatchlistStore;
  readonly watchlistData: WatchlistDataStore;
  readonly monitoring: MonitoringStore;
  readonly history: HistoryStore;
  readonly cards: CardStore;
  readonly trading: TradingStore;
  readonly launches: LaunchStore;
  readonly purchases: {
    readonly forRun: (
      userId: UserId,
      runId: RunId
    ) => Promise<readonly Purchase[]>;
    readonly create: (
      userId: UserId,
      purchase: Purchase
    ) => Promise<{ readonly created: boolean; readonly purchase: Purchase }>;
    readonly byId: (userId: UserId, id: PurchaseId) => Promise<Purchase | null>;
    readonly byKey: (userId: UserId, key: string) => Promise<Purchase | null>;
    readonly list: (
      userId: UserId,
      limit: number
    ) => Promise<readonly Purchase[]>;
    /** Compare-and-set: only one approval may claim the right to pay. */
    readonly update: (
      userId: UserId,
      id: PurchaseId,
      expected: readonly PurchaseStatus[],
      patch: PurchasePatch,
      approvalId?: ApprovalId
    ) => Promise<Purchase | null>;
  };
  /**
   * Dapp requests. `update` is compare-and-set on status: the coordinator
   * computes the legal next status with `advanceWalletRequest` and the store
   * refuses a write whose expectation no longer holds, so two answers to one
   * card cannot both sign.
   */
  readonly walletRequests: {
    readonly create: (
      userId: UserId,
      request: WalletRequest
    ) => Promise<WalletRequest>;
    readonly byId: (
      userId: UserId,
      id: WalletRequestId
    ) => Promise<WalletRequest | null>;
    /** Newest first. */
    readonly list: (
      userId: UserId,
      limit: number
    ) => Promise<readonly WalletRequest[]>;
    readonly update: (
      userId: UserId,
      id: WalletRequestId,
      expected: readonly WalletRequestStatus[],
      patch: WalletRequestPatch
    ) => Promise<WalletRequest | null>;
    /** Every person's requests in the given statuses, oldest first. */
    readonly inFlight: (
      statuses: readonly WalletRequestStatus[]
    ) => Promise<readonly OwnedWalletRequest[]>;
  };
  /**
   * Which origins may see the person's address. One active connection per
   * origin: granting again replaces, revoking ends. Cleared on `forget`.
   */
  readonly walletConnections: {
    readonly grant: (
      userId: UserId,
      connection: WalletConnection
    ) => Promise<WalletConnection>;
    readonly active: (
      userId: UserId,
      origin: string
    ) => Promise<WalletConnection | null>;
    /** Active connections, newest first. */
    readonly list: (userId: UserId) => Promise<readonly WalletConnection[]>;
    /** True when an active connection of this person's was revoked. */
    readonly revoke: (
      userId: UserId,
      id: WalletConnectionId,
      at: number
    ) => Promise<boolean>;
  };
  readonly invocations: {
    readonly recent: (userId: UserId) => Promise<readonly AgentInvocation[]>;
    readonly append: (
      userId: UserId,
      invocation: AgentInvocation
    ) => Promise<void>;
    readonly finish: (
      userId: UserId,
      id: AgentInvocationId,
      patch: Pick<
        AgentInvocation,
        "name" | "outcome" | "usdMicros" | "taskId" | "stubbed"
      >
    ) => Promise<void>;
    /** Newest 50, scoped to both the person and this grant or token. */
    readonly list: (
      userId: UserId,
      connectionId: AgentConnectionId
    ) => Promise<readonly AgentInvocation[]>;
  };
  readonly conversions: {
    readonly create: (
      userId: UserId,
      record: ConversionRecord
    ) => Promise<{
      readonly created: boolean;
      readonly record: ConversionRecord;
    }>;
    readonly pending: (userId: UserId) => Promise<readonly ConversionRecord[]>;
    readonly update: (
      id: ConversionId,
      phase: ConversionRecord["phase"],
      patch: ConversionPatch
    ) => Promise<boolean>;
    /** Mark confirmed funding credited and add to the pocket in one transaction. */
    readonly credit: (userId: UserId, id: ConversionId) => Promise<number>;
  };
  /**
   * Tokens handed to outside agents. `lookup` answers only for tokens not yet
   * revoked, so revocation takes effect on the next request without a cache
   * to flush.
   */
  readonly agents: {
    readonly create: (userId: UserId, token: AgentTokenRow) => Promise<void>;
    /** Every token, revoked ones included, newest first. */
    readonly list: (userId: UserId) => Promise<readonly AgentToken[]>;
    readonly lookup: (secretHash: string) => Promise<{
      readonly token: AgentToken;
      readonly userId: UserId;
    } | null>;
    readonly revoke: (userId: UserId, id: AgentTokenId) => Promise<void>;
    readonly touch: (id: AgentTokenId, at: number) => Promise<void>;
  };
  /**
   * The seller's book. Not per person: the buyer is whichever account paid.
   * `record` is insert-or-return on the payment hash, so two arrivals of one
   * proof yield one sale and only the first caller is told it `created` it.
   */
  readonly sales: {
    readonly byId: (id: SaleId) => Promise<Sale | null>;
    readonly byPaymentHash: (paymentHash: string) => Promise<Sale | null>;
    /** Historical payments cannot also fund platform credits. */
    readonly byTransaction: (
      network: Sale["network"],
      transactionId: string
    ) => Promise<Sale | null>;
    readonly record: (
      sale: Sale
    ) => Promise<{ readonly created: boolean; readonly sale: Sale }>;
    readonly update: (id: SaleId, patch: SalePatch) => Promise<void>;
  };
  /** Delegated tasks, per person. A key seen before returns the earlier task. */
  readonly tasks: {
    readonly activeBrowses: () => Promise<
      readonly { readonly userId: UserId; readonly task: Task }[]
    >;
    readonly claim: (
      userId: UserId,
      id: TaskId,
      expected: Task["status"],
      patch: TaskPatch
    ) => Promise<boolean>;
    readonly byId: (userId: UserId, id: TaskId) => Promise<Task | null>;
    readonly byIdempotencyKey: (
      userId: UserId,
      key: string
    ) => Promise<Task | null>;
    /** The task a sale bought, so a replayed proof finds it. */
    readonly bySaleId: (userId: UserId, saleId: SaleId) => Promise<Task | null>;
    readonly create: (userId: UserId, task: Task) => Promise<void>;
    /** Newest first. */
    readonly list: (userId: UserId, limit: number) => Promise<readonly Task[]>;
    readonly update: (
      userId: UserId,
      id: TaskId,
      patch: TaskPatch
    ) => Promise<void>;
    /**
     * Boot recovery: every task of `kind` still in an in-flight status whose
     * last progress predates `before` is marked `uncertain` with `error`.
     * A worker lives in one process; a restart mid-flight leaves rows that
     * would otherwise read as "running" forever. Returns how many were marked.
     */
    readonly expireInFlight: (input: {
      readonly kind: Task["kind"];
      readonly statuses: readonly Task["status"][];
      readonly before: number;
      readonly error: string;
      readonly now: number;
    }) => Promise<number>;
  };
  readonly directory: {
    /** Replaces an entry for the same URL. */
    readonly add: (userId: UserId, entry: DirectoryEntry) => Promise<void>;
    /** Oldest first. */
    readonly list: (userId: UserId) => Promise<readonly DirectoryEntry[]>;
    readonly remove: (userId: UserId, id: string) => Promise<void>;
  };
  /**
   * Reminders, unattended prompts and the digest. `claimDue` is the one
   * concurrent operation: it marks and returns every active row that is due
   * and unclaimed (or whose claim is older than `staleMs`) in one statement,
   * so two tickers on one database split the rows rather than share them.
   * `finish` writes the outcome and drops the claim.
   */
  readonly schedules: {
    /** True when an active row of this person's was cancelled. */
    readonly cancel: (userId: UserId, id: ScheduleId) => Promise<boolean>;
    readonly claimDue: (
      now: number,
      staleMs: number
    ) => Promise<readonly DueSchedule[]>;
    readonly create: (userId: UserId, schedule: Schedule) => Promise<void>;
    /** The person's active digest, if they have one. */
    readonly digestOf: (userId: UserId) => Promise<Schedule | null>;
    readonly finish: (
      id: ScheduleId,
      claimedAt: number,
      patch: ScheduleFinish
    ) => Promise<boolean>;
    /** Every schedule of theirs, newest first, whatever its status. */
    readonly list: (userId: UserId) => Promise<readonly Schedule[]>;
    /** Replace the digest: the old one is cancelled, `null` leaves none. */
    readonly saveDigest: (
      userId: UserId,
      schedule: Schedule | null
    ) => Promise<void>;
    /** The zone of their most recent schedule, so a request without one is read in it. */
    readonly timezoneFor: (userId: UserId) => Promise<string | null>;
  };
  /**
   * Everything this store holds about one person: mandate, receipts, purchases,
   * tasks, schedules and tokens. The ledger's spend rows are not here — they are
   * the money record and stay — but nothing that says who this person was
   * or what they allowed survives.
   */
  readonly forget: (userId: UserId) => Promise<void>;
  /**
   * The person's own Hedera account: its id and the sealed key that signs for
   * it. Kept on `forget`: it is money, like the ledger's spends, and a
   * returning person finds their balance where they left it.
   */
  readonly hedera: {
    readonly loadReceiving: (
      userId: UserId
    ) => Promise<HederaReceivingRecord | null>;
    /** Persist one canonical key before exposing its alias to a depositor. */
    readonly prepareReceiving: (
      userId: UserId,
      custody: Extract<HederaCustody, { readonly kind: "privy" }>
    ) => Promise<HederaReceivingRecord>;
    readonly load: (userId: UserId) => Promise<HederaAccountRecord | null>;
    readonly save: (
      userId: UserId,
      record: HederaAccountRecord
    ) => Promise<void>;
  };
  readonly mandates: {
    readonly load: (userId: UserId) => Promise<Mandate | null>;
    readonly save: (userId: UserId, mandate: Mandate) => Promise<void>;
  };
  /**
   * The person's own Privy policy. Null while they are still on the app-wide
   * one, which is every person who granted a signer before this existed.
   *
   * Cleared on `forget`, unlike the Hedera account: this is authority, not
   * money. A person who asked to be forgotten should not leave a standing
   * signature behind, and the policy itself is revoked at Privy separately.
   */
  readonly privyPolicy: {
    readonly clear: (userId: UserId) => Promise<void>;
    /**
     * Everyone whose policy stops allowing anything before `at`.
     *
     * Reads the denormalised expiry column rather than decoding every person's
     * allowance, which is why that column exists. Used to warn people before
     * their agent goes quiet; the expiry itself is enforced by Privy's own rule
     * condition and by the mandate, not by anything that has to run.
     */
    readonly expiringBefore: (at: number) => Promise<readonly UserId[]>;
    readonly load: (userId: UserId) => Promise<PersonPolicyRecord | null>;
    readonly save: (
      userId: UserId,
      record: PersonPolicyRecord
    ) => Promise<void>;
  };
  /**
   * The OAuth authorization server's state: registered clients, the grants
   * people gave them, and the hashed codes and tokens under each grant.
   * `tokens.consume` is the one write that must be atomic across processes:
   * it sets `usedAt` only where it is still null and says whether it did, so
   * a replayed code or an old refresh token is caught by whichever process
   * sees it second.
   */
  readonly oauth: {
    readonly clients: {
      readonly byId: (id: OAuthClientId) => Promise<OAuthClient | null>;
      readonly create: (client: OAuthClient) => Promise<void>;
    };
    readonly grants: {
      /** Revoked grants included, so a token under one still resolves to "revoked". */
      readonly byId: (id: OAuthGrantId) => Promise<{
        readonly grant: OAuthGrant;
        readonly userId: UserId;
      } | null>;
      readonly create: (userId: UserId, grant: OAuthGrant) => Promise<void>;
      /** Every grant, revoked ones included, newest first. */
      readonly list: (userId: UserId) => Promise<readonly OAuthGrant[]>;
      /** True when the grant was this person's and is now revoked. */
      readonly revoke: (
        userId: UserId,
        id: OAuthGrantId,
        at: number
      ) => Promise<boolean>;
      readonly touch: (id: OAuthGrantId, at: number) => Promise<void>;
    };
    readonly tokens: {
      /** Null for a revoked row; an expired or used row is returned and judged by the caller. */
      readonly byHash: (hash: string) => Promise<OAuthTokenRow | null>;
      /** False when the row was already used: the replay signal. */
      readonly consume: (hash: string, at: number) => Promise<boolean>;
      readonly insert: (row: OAuthTokenRow) => Promise<void>;
      readonly revokeAllForGrant: (
        grantId: OAuthGrantId,
        at: number
      ) => Promise<void>;
    };
  };
  /**
   * The person's share of the host account that pays the Hedera leg, in USD
   * millionths. Never negative: a debit larger than the balance floors at
   * zero, and the policy is what stops it being asked for.
   */
  /**
   * When the person last finished or skipped the welcome flow, or null while
   * they never have. Cleared on `forget`, so a person who deleted everything
   * and comes back is welcomed again.
   */
  readonly setup: {
    readonly load: (userId: UserId) => Promise<number | null>;
    readonly save: (userId: UserId, seenAt: number | null) => Promise<void>;
  };
  readonly pocket: {
    /** Adds `deltaUsdMicros` (negative to draw down) and returns the new balance. */
    readonly adjust: (
      userId: UserId,
      deltaUsdMicros: number
    ) => Promise<number>;
    /** Null when this person has never had a pocket, so a starting credit happens once. */
    readonly load: (userId: UserId) => Promise<number | null>;
  };
  readonly telegram: {
    readonly forUser: (userId: UserId) => Promise<TelegramPairing | null>;
    /** Whose account this Telegram user is, or null when nobody has paired it. */
    readonly lookup: (telegramUserId: string) => Promise<UserId | null>;
    /** Replaces any earlier pairing on either side. */
    readonly pair: (userId: UserId, pairing: TelegramPairing) => Promise<void>;
    readonly unpair: (userId: UserId) => Promise<void>;
  };
  readonly receipts: {
    readonly forRun: (
      userId: UserId,
      runId: RunId
    ) => Promise<readonly Receipt[]>;
    readonly byIds: (
      userId: UserId,
      ids: readonly ReceiptId[]
    ) => Promise<readonly Receipt[]>;
    readonly append: (userId: UserId, receipt: Receipt) => Promise<void>;
    /** Newest first. */
    readonly recent: (
      userId: UserId,
      limit: number
    ) => Promise<readonly Receipt[]>;
  };
}

export const decodeMandate = Schema.decodeUnknownResult(Mandate);
const decodeReceipt = Schema.decodeUnknownResult(Receipt);
export const decodeSale = Schema.decodeUnknownResult(Sale);
export const decodeTask = Schema.decodeUnknownResult(Task);
export const decodeSchedule = Schema.decodeUnknownResult(Schedule);

/** The domain record, without the hash a caller must never see. */
const publicToken = (row: AgentTokenRow): AgentToken => ({
  createdAt: row.createdAt,
  id: row.id,
  label: row.label,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
});

/** A schedule as the memory store keeps it: with its owner and its claim. */
interface ScheduleRow extends Schedule {
  readonly claimedAt: number | null;
  readonly userId: UserId;
}

/** A schedule row as the domain sees it: without the owner and the claim. */
const publicSchedule = (row: ScheduleRow): Schedule => ({
  action: row.action,
  cadence: row.cadence,
  createdAt: row.createdAt,
  id: row.id,
  label: row.label,
  lastRunAt: row.lastRunAt,
  nextRunAt: row.nextRunAt,
  status: row.status,
  timezone: row.timezone,
});

/** The person's active digest among the rows, if any. */
const digestRowOf = (
  rows: Iterable<ScheduleRow>,
  userId: UserId
): Schedule | null => {
  for (const row of rows) {
    if (
      row.userId === userId &&
      row.action._tag === "digest" &&
      row.status === "active"
    ) {
      return publicSchedule(row);
    }
  }
  return null;
};

/** The grant without its owner, which is the caller's to know separately. */
const publicGrant = (row: OAuthGrant & { userId: UserId }): OAuthGrant => ({
  clientId: row.clientId,
  clientName: row.clientName,
  createdAt: row.createdAt,
  id: row.id,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
  scopes: row.scopes,
});

/**
 * Parse a stored document, or drop it.
 *
 * A row that no longer decodes — after a schema change, say — is skipped
 * rather than allowed to take the whole history down with it. The receipt
 * still exists in the table; it is only unreadable by this version.
 */
export const readReceipts = (documents: readonly unknown[]): Receipt[] => {
  const receipts: Receipt[] = [];
  for (const document of documents) {
    const decoded = decodeReceipt(document);
    if (Result.isSuccess(decoded)) {
      receipts.push(decoded.success);
    }
  }
  return receipts;
};

export const memoryStore = (): Store => {
  const browsers = new Map<UserId, BrowserProfileRecord>();
  const history = memoryHistoryStore();
  const watchlistData = memoryWatchlistDataStore();
  const watchlist = memoryWatchlistStore();
  const monitoring = memoryMonitoringStore();
  const purchases = new Map<
    PurchaseId,
    { userId: UserId; purchase: Purchase }
  >();
  const invocations = new Map<
    AgentInvocationId,
    { userId: UserId; invocation: AgentInvocation }
  >();
  const walletRequests = new Map<
    WalletRequestId,
    { userId: UserId; request: WalletRequest }
  >();
  const walletConnections = new Map<
    WalletConnectionId,
    { userId: UserId; connection: WalletConnection }
  >();
  const conversions = new Map<
    ConversionId,
    { userId: UserId; record: ConversionRecord }
  >();
  const mandates = new Map<UserId, Mandate>();
  const receipts = new Map<UserId, Receipt[]>();
  const schedules = new Map<ScheduleId, ScheduleRow>();
  const pairings = new Map<UserId, TelegramPairing>();
  const entries = new Map<UserId, DirectoryEntry[]>();
  const pockets = new Map<UserId, number>();
  const setupSeen = new Map<UserId, number>();
  const hederaAccounts = new Map<UserId, HederaReceivingRecord>();
  const personPolicies = new Map<UserId, PersonPolicyRecord>();
  const tokens = new Map<AgentTokenId, AgentTokenRow & { userId: UserId }>();
  const sales = new Map<SaleId, Sale>();
  const tasks = new Map<TaskId, Task & { userId: UserId }>();
  const oauthClients = new Map<OAuthClientId, OAuthClient>();
  const oauthGrants = new Map<OAuthGrantId, OAuthGrant & { userId: UserId }>();
  const oauthTokens = new Map<string, OAuthTokenRow>();
  const unpair = (userId: UserId): void => {
    pairings.delete(userId);
  };
  return {
    credits: memoryCreditStore(
      tasks,
      (owner) => personPolicies.get(owner)?.allowance ?? null
    ),
    browsers: {
      load: async (userId) =>
        await Promise.resolve(structuredClone(browsers.get(userId) ?? null)),
      save: async (userId, record) => {
        await Promise.resolve();
        browsers.set(
          userId,
          Schema.decodeUnknownSync(BrowserProfileRecord)(record)
        );
      },
    },
    history,
    watchlist,
    watchlistData,
    monitoring,
    cards: memoryCardStore(),
    trading: memoryTradingStore(),
    launches: memoryLaunchStore(),
    purchases: {
      forRun: async (userId, runId) =>
        await Promise.resolve(
          [...purchases.values()]
            .filter(
              (row) => row.userId === userId && row.purchase.runId === runId
            )
            .map((row) => structuredClone(row.purchase))
            .slice(0, 100)
        ),
      create: async (userId, purchase) => {
        await Promise.resolve();
        const existing = [...purchases.values()].find(
          (row) =>
            row.userId === userId &&
            row.purchase.idempotencyKey === purchase.idempotencyKey
        );
        if (existing !== undefined) {
          return {
            created: false,
            purchase: structuredClone(existing.purchase),
          };
        }
        const decoded = Schema.decodeUnknownSync(Purchase)(purchase);
        purchases.set(decoded.id, {
          userId,
          purchase: structuredClone(decoded),
        });
        return { created: true, purchase: structuredClone(decoded) };
      },
      byId: async (userId, id) => {
        await Promise.resolve();
        const row = purchases.get(id);
        return row?.userId === userId ? structuredClone(row.purchase) : null;
      },
      byKey: async (userId, key) => {
        await Promise.resolve();
        const row = [...purchases.values()].find(
          (entry) =>
            entry.userId === userId && entry.purchase.idempotencyKey === key
        );
        return row === undefined ? null : structuredClone(row.purchase);
      },
      list: async (userId, limit) => {
        await Promise.resolve();
        return [...purchases.values()]
          .filter((row) => row.userId === userId)
          .map((row) => structuredClone(row.purchase))
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit);
      },
      update: async (userId, id, expected, patch, approvalId) => {
        await Promise.resolve();
        const row = purchases.get(id);
        if (
          row?.userId !== userId ||
          !expected.includes(row.purchase.status) ||
          (approvalId !== undefined && row.purchase.approvalId !== approvalId)
        ) {
          return null;
        }
        const next = Schema.decodeUnknownSync(Purchase)({
          ...row.purchase,
          ...patch,
        });
        purchases.set(id, { userId, purchase: structuredClone(next) });
        return structuredClone(next);
      },
    },
    walletRequests: {
      create: async (userId, request) => {
        await Promise.resolve();
        const decoded = Schema.decodeUnknownSync(WalletRequest)(request);
        walletRequests.set(decoded.id, {
          request: structuredClone(decoded),
          userId,
        });
        return structuredClone(decoded);
      },
      byId: async (userId, id) => {
        await Promise.resolve();
        const row = walletRequests.get(id);
        return row?.userId === userId ? structuredClone(row.request) : null;
      },
      list: async (userId, limit) => {
        await Promise.resolve();
        return [...walletRequests.values()]
          .filter((row) => row.userId === userId)
          .map((row) => structuredClone(row.request))
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit);
      },
      update: async (userId, id, expected, patch) => {
        await Promise.resolve();
        const row = walletRequests.get(id);
        if (row?.userId !== userId || !expected.includes(row.request.status)) {
          return null;
        }
        const next = Schema.decodeUnknownSync(WalletRequest)({
          ...row.request,
          ...patch,
        });
        walletRequests.set(id, { request: structuredClone(next), userId });
        return structuredClone(next);
      },
      inFlight: async (statuses) => {
        await Promise.resolve();
        return [...walletRequests.values()]
          .filter((row) => statuses.includes(row.request.status))
          .toSorted((a, b) => a.request.createdAt - b.request.createdAt)
          .map((row) => ({
            request: structuredClone(row.request),
            userId: row.userId,
          }));
      },
    },
    walletConnections: {
      grant: async (userId, connection) => {
        await Promise.resolve();
        const decoded = Schema.decodeUnknownSync(WalletConnection)(connection);
        for (const [id, row] of walletConnections) {
          if (
            row.userId === userId &&
            row.connection.origin === decoded.origin &&
            row.connection.revokedAt === null
          ) {
            walletConnections.set(id, {
              connection: { ...row.connection, revokedAt: decoded.grantedAt },
              userId,
            });
          }
        }
        walletConnections.set(decoded.id, { connection: decoded, userId });
        return decoded;
      },
      active: async (userId, origin) => {
        await Promise.resolve();
        for (const row of walletConnections.values()) {
          if (
            row.userId === userId &&
            row.connection.origin === origin &&
            row.connection.revokedAt === null
          ) {
            return row.connection;
          }
        }
        return null;
      },
      list: async (userId) => {
        await Promise.resolve();
        return [...walletConnections.values()]
          .filter(
            (row) => row.userId === userId && row.connection.revokedAt === null
          )
          .map((row) => row.connection)
          .toSorted((a, b) => b.grantedAt - a.grantedAt);
      },
      revoke: async (userId, id, at) => {
        await Promise.resolve();
        const row = walletConnections.get(id);
        if (row?.userId !== userId || row.connection.revokedAt !== null) {
          return false;
        }
        walletConnections.set(id, {
          connection: { ...row.connection, revokedAt: at },
          userId,
        });
        return true;
      },
    },
    invocations: {
      recent: async (userId) =>
        await Promise.resolve(
          [...invocations.values()]
            .filter((row) => row.userId === userId)
            .map((row) => row.invocation)
            .toSorted((a, b) => b.at - a.at)
            .slice(0, 50)
        ),
      append: async (userId, invocation) => {
        await Promise.resolve();
        invocations.set(invocation.id, {
          userId,
          invocation: Schema.decodeUnknownSync(AgentInvocation)(invocation),
        });
      },
      finish: async (userId, id, patch) => {
        await Promise.resolve();
        const row = invocations.get(id);
        if (row?.userId === userId) {
          invocations.set(id, {
            userId,
            invocation: Schema.decodeUnknownSync(AgentInvocation)({
              ...row.invocation,
              ...patch,
            }),
          });
        }
      },
      list: async (userId, connectionId) => {
        await Promise.resolve();
        return [...invocations.values()]
          .filter(
            (row) =>
              row.userId === userId &&
              row.invocation.connectionId === connectionId
          )
          .map((row) => row.invocation)
          .toSorted((a, b) => b.at - a.at || b.id.localeCompare(a.id))
          .slice(0, 50);
      },
    },
    conversions: {
      create: async (userId, record) => {
        await Promise.resolve();
        const existing = [...conversions.values()].find(
          (row) => row.userId === userId && row.record.key === record.key
        );
        if (existing !== undefined) {
          return { created: false, record: existing.record };
        }
        conversions.set(record.id, { userId, record });
        return { created: true, record };
      },
      pending: async (userId) => {
        await Promise.resolve();
        return [...conversions.values()]
          .filter(
            (row) =>
              row.userId === userId &&
              !row.record.credited &&
              row.record.phase !== "failed"
          )
          .map((row) => row.record);
      },
      update: async (id, phase, patch) => {
        await Promise.resolve();
        const found = conversions.get(id);
        if (found === undefined || found.record.phase !== phase) {
          return false;
        }
        found.record = { ...found.record, ...patch };
        return true;
      },
      credit: async (userId, id) => {
        await Promise.resolve();
        const found = conversions.get(id);
        if (
          found === undefined ||
          found.userId !== userId ||
          found.record.phase !== "funded"
        ) {
          throw new Error("Conversion funding is not confirmed.");
        }
        if (!found.record.credited) {
          pockets.set(
            userId,
            (pockets.get(userId) ?? 0) + found.record.usdMicros
          );
          found.record = { ...found.record, credited: true };
        }
        return pockets.get(userId) ?? 0;
      },
    },
    oauth: {
      clients: {
        byId: async (id) => {
          await Promise.resolve();
          return oauthClients.get(id) ?? null;
        },
        create: async (client) => {
          await Promise.resolve();
          oauthClients.set(client.id, client);
        },
      },
      grants: {
        byId: async (id) => {
          await Promise.resolve();
          const row = oauthGrants.get(id);
          return row === undefined
            ? null
            : { grant: publicGrant(row), userId: row.userId };
        },
        create: async (userId, grant) => {
          await Promise.resolve();
          oauthGrants.set(grant.id, { ...grant, userId });
        },
        list: async (userId) => {
          await Promise.resolve();
          return [...oauthGrants.values()]
            .filter((row) => row.userId === userId)
            .toSorted((a, b) => b.createdAt - a.createdAt)
            .map(publicGrant);
        },
        revoke: async (userId, id, at) => {
          await Promise.resolve();
          const row = oauthGrants.get(id);
          if (row === undefined || row.userId !== userId) {
            return false;
          }
          oauthGrants.set(id, { ...row, revokedAt: row.revokedAt ?? at });
          return true;
        },
        touch: async (id, at) => {
          await Promise.resolve();
          const row = oauthGrants.get(id);
          if (row !== undefined) {
            oauthGrants.set(id, { ...row, lastUsedAt: at });
          }
        },
      },
      tokens: {
        byHash: async (hash) => {
          await Promise.resolve();
          const row = oauthTokens.get(hash);
          return row === undefined || row.revokedAt !== null ? null : row;
        },
        consume: async (hash, at) => {
          await Promise.resolve();
          const row = oauthTokens.get(hash);
          if (row === undefined || row.usedAt !== null) {
            return false;
          }
          oauthTokens.set(hash, { ...row, usedAt: at });
          return true;
        },
        insert: async (row) => {
          await Promise.resolve();
          oauthTokens.set(row.hash, row);
        },
        revokeAllForGrant: async (grantId, at) => {
          await Promise.resolve();
          for (const [hash, row] of oauthTokens) {
            if (row.grantId === grantId && row.revokedAt === null) {
              oauthTokens.set(hash, { ...row, revokedAt: at });
            }
          }
        },
      },
    },
    agents: {
      create: async (userId, token) => {
        await Promise.resolve();
        tokens.set(token.id, { ...token, userId });
      },
      list: async (userId) => {
        await Promise.resolve();
        return [...tokens.values()]
          .filter((row) => row.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .map(publicToken);
      },
      lookup: async (secretHash) => {
        await Promise.resolve();
        for (const row of tokens.values()) {
          if (row.secretHash === secretHash && row.revokedAt === null) {
            return { token: publicToken(row), userId: row.userId };
          }
        }
        return null;
      },
      revoke: async (userId, id) => {
        await Promise.resolve();
        const row = tokens.get(id);
        if (row !== undefined && row.userId === userId) {
          tokens.set(id, { ...row, revokedAt: Date.now() });
        }
      },
      touch: async (id, at) => {
        await Promise.resolve();
        const row = tokens.get(id);
        if (row !== undefined) {
          tokens.set(id, { ...row, lastUsedAt: at });
        }
      },
    },
    sales: {
      byId: async (id) => {
        await Promise.resolve();
        return sales.get(id) ?? null;
      },
      byPaymentHash: async (paymentHash) => {
        await Promise.resolve();
        for (const sale of sales.values()) {
          if (sale.paymentHash === paymentHash) {
            return sale;
          }
        }
        return null;
      },
      byTransaction: async (network, transactionId) => {
        await Promise.resolve();
        for (const sale of sales.values()) {
          if (
            sale.network === network &&
            sale.transactionId === transactionId
          ) {
            return sale;
          }
        }
        return null;
      },
      record: async (sale) => {
        await Promise.resolve();
        for (const existing of sales.values()) {
          if (existing.paymentHash === sale.paymentHash) {
            return { created: false, sale: existing };
          }
        }
        sales.set(sale.id, sale);
        return { created: true, sale };
      },
      update: async (id, patch) => {
        await Promise.resolve();
        const sale = sales.get(id);
        if (sale !== undefined) {
          sales.set(id, { ...sale, ...patch });
        }
      },
    },
    tasks: {
      activeBrowses: async () =>
        await Promise.resolve(
          [...tasks.values()]
            .filter(
              (task) =>
                task.kind === "browse" &&
                ([
                  "paid",
                  "running",
                  "paused",
                  "awaiting_approval",
                  "uncertain",
                ].includes(task.status) ||
                  (task.status === "quoted" &&
                    quotePaymentState(task) !== null))
            )
            .map((task) => ({ userId: task.userId, task }))
        ),
      claim: async (userId, id, expected, patch) => {
        await Promise.resolve();
        const row = tasks.get(id);
        if (
          row === undefined ||
          row.userId !== userId ||
          row.status !== expected
        ) {
          return false;
        }
        tasks.set(id, { ...row, ...patch });
        return true;
      },
      byId: async (userId, id) => {
        await Promise.resolve();
        const task = tasks.get(id);
        return task !== undefined && task.userId === userId ? task : null;
      },
      byIdempotencyKey: async (userId, key) => {
        await Promise.resolve();
        for (const task of tasks.values()) {
          if (task.userId === userId && task.idempotencyKey === key) {
            return task;
          }
        }
        return null;
      },
      bySaleId: async (userId, saleId) => {
        await Promise.resolve();
        for (const task of tasks.values()) {
          if (task.userId === userId && task.saleId === saleId) {
            return task;
          }
        }
        return null;
      },
      create: async (userId, task) => {
        await Promise.resolve();
        if (
          task.idempotencyKey !== null &&
          [...tasks.values()].some(
            (entry) =>
              entry.userId === userId &&
              entry.idempotencyKey === task.idempotencyKey
          )
        ) {
          throw new Error("Task idempotency key already exists.");
        }
        tasks.set(task.id, { ...task, userId });
      },
      list: async (userId, limit) => {
        await Promise.resolve();
        return [...tasks.values()]
          .filter((task) => task.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit);
      },
      expireInFlight: async ({ kind, statuses, before, error, now }) => {
        await Promise.resolve();
        let marked = 0;
        for (const [id, task] of tasks) {
          if (
            task.kind === kind &&
            statuses.includes(task.status) &&
            task.updatedAt < before
          ) {
            tasks.set(id, {
              ...task,
              status: "uncertain",
              error,
              updatedAt: now,
            });
            marked += 1;
          }
        }
        return marked;
      },
      update: async (userId, id, patch) => {
        await Promise.resolve();
        const task = tasks.get(id);
        if (task !== undefined && task.userId === userId) {
          tasks.set(id, { ...task, ...patch });
        }
      },
    },
    directory: {
      add: async (userId, entry) => {
        await Promise.resolve();
        const list = (entries.get(userId) ?? []).filter(
          (existing) => existing.url !== entry.url
        );
        list.push(entry);
        entries.set(userId, list);
      },
      list: async (userId) => {
        await Promise.resolve();
        return [...(entries.get(userId) ?? [])].toSorted(
          (a, b) => a.addedAt - b.addedAt
        );
      },
      remove: async (userId, id) => {
        await Promise.resolve();
        entries.set(
          userId,
          (entries.get(userId) ?? []).filter((entry) => entry.id !== id)
        );
      },
    },
    telegram: {
      forUser: async (userId) => {
        await Promise.resolve();
        return pairings.get(userId) ?? null;
      },
      lookup: async (telegramUserId) => {
        await Promise.resolve();
        for (const [userId, pairing] of pairings) {
          if (pairing.telegramUserId === telegramUserId) {
            return userId;
          }
        }
        return null;
      },
      pair: async (userId, pairing) => {
        await Promise.resolve();
        for (const [other, existing] of pairings) {
          if (existing.telegramUserId === pairing.telegramUserId) {
            pairings.delete(other);
          }
        }
        pairings.set(userId, pairing);
      },
      unpair: async (userId) => {
        await Promise.resolve();
        unpair(userId);
      },
    },
    schedules: {
      cancel: async (userId, id) => {
        await Promise.resolve();
        const row = schedules.get(id);
        if (
          row === undefined ||
          row.userId !== userId ||
          row.status !== "active"
        ) {
          return false;
        }
        schedules.set(id, {
          ...row,
          claimedAt: null,
          nextRunAt: null,
          status: "cancelled",
        });
        return true;
      },
      claimDue: async (now, staleMs) => {
        await Promise.resolve();
        const due: DueSchedule[] = [];
        for (const [id, row] of schedules) {
          if (
            row.status === "active" &&
            row.nextRunAt !== null &&
            row.nextRunAt <= now &&
            (row.claimedAt === null || row.claimedAt < now - staleMs)
          ) {
            schedules.set(id, { ...row, claimedAt: now });
            due.push({
              claimedAt: now,
              schedule: publicSchedule(row),
              userId: row.userId,
            });
          }
        }
        return due;
      },
      create: async (userId, schedule) => {
        await Promise.resolve();
        schedules.set(schedule.id, { ...schedule, claimedAt: null, userId });
      },
      digestOf: async (userId) => {
        await Promise.resolve();
        return digestRowOf(schedules.values(), userId);
      },
      finish: async (id, claimedAt, patch) => {
        await Promise.resolve();
        const row = schedules.get(id);
        if (
          row !== undefined &&
          row.status === "active" &&
          row.claimedAt === claimedAt
        ) {
          schedules.set(id, {
            ...row,
            claimedAt: null,
            lastRunAt: patch.lastRunAt ?? row.lastRunAt,
            nextRunAt: patch.nextRunAt,
            status: patch.status,
          });
          return true;
        }
        return false;
      },
      list: async (userId) => {
        await Promise.resolve();
        return [...schedules.values()]
          .filter((row) => row.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt)
          .map(publicSchedule);
      },
      saveDigest: async (userId, schedule) => {
        await Promise.resolve();
        for (const [id, row] of schedules) {
          if (
            row.userId === userId &&
            row.action._tag === "digest" &&
            row.status === "active"
          ) {
            schedules.set(id, {
              ...row,
              claimedAt: null,
              nextRunAt: null,
              status: "cancelled",
            });
          }
        }
        if (schedule !== null) {
          schedules.set(schedule.id, { ...schedule, claimedAt: null, userId });
        }
      },
      timezoneFor: async (userId) => {
        await Promise.resolve();
        const [latest] = [...schedules.values()]
          .filter((row) => row.userId === userId)
          .toSorted((a, b) => b.createdAt - a.createdAt);
        return latest?.timezone ?? null;
      },
    },
    forget: async (userId) => {
      await watchlistData.forget(userId);
      await watchlist.forget(userId);
      await monitoring.forget(userId);
      browsers.delete(userId);
      setupSeen.delete(userId);
      await history.clearTelegramCache(userId);
      await history.forget(userId);
      await Promise.resolve();
      for (const [id, row] of purchases) {
        if (row.userId === userId) {
          purchases.delete(id);
        }
      }
      for (const [id, row] of invocations) {
        if (row.userId === userId) {
          invocations.delete(id);
        }
      }
      for (const [id, row] of walletRequests) {
        if (row.userId === userId) {
          walletRequests.delete(id);
        }
      }
      for (const [id, row] of walletConnections) {
        if (row.userId === userId) {
          walletConnections.delete(id);
        }
      }
      for (const [id, row] of tokens) {
        if (row.userId === userId) {
          tokens.delete(id);
        }
      }
      for (const [id, row] of schedules) {
        if (row.userId === userId) {
          schedules.delete(id);
        }
      }
      for (const [id, task] of tasks) {
        if (task.userId === userId) {
          tasks.delete(id);
        }
      }
      for (const [id, grant] of oauthGrants) {
        if (grant.userId === userId) {
          oauthGrants.delete(id);
          for (const [hash, row] of oauthTokens) {
            if (row.grantId === id) {
              oauthTokens.delete(hash);
            }
          }
        }
      }
      entries.delete(userId);
      unpair(userId);
      mandates.delete(userId);
      personPolicies.delete(userId);
      pockets.delete(userId);
      receipts.delete(userId);
    },
    hedera: {
      loadReceiving: async (userId) => {
        await Promise.resolve();
        return hederaAccounts.get(userId) ?? null;
      },
      prepareReceiving: async (userId, custody) => {
        await Promise.resolve();
        const existing = hederaAccounts.get(userId);
        if (existing !== undefined) {
          return existing;
        }
        const record = { accountId: null, custody };
        hederaAccounts.set(userId, record);
        return record;
      },
      load: async (userId) => {
        await Promise.resolve();
        const record = hederaAccounts.get(userId);
        return record === undefined || record.accountId === null
          ? null
          : { accountId: record.accountId, custody: record.custody };
      },
      save: async (userId, record) => {
        await Promise.resolve();
        hederaAccounts.set(userId, record);
      },
    },
    mandates: {
      load: async (userId) => {
        await Promise.resolve();
        return mandates.get(userId) ?? null;
      },
      save: async (userId, mandate) => {
        await Promise.resolve();
        mandates.set(userId, mandate);
      },
    },
    privyPolicy: {
      clear: async (userId) => {
        await Promise.resolve();
        personPolicies.delete(userId);
      },
      expiringBefore: async (at) => {
        await Promise.resolve();
        const due: UserId[] = [];
        for (const [id, record] of personPolicies) {
          if (record.allowance.expiresAt < at) {
            due.push(id);
          }
        }
        return due;
      },
      load: async (userId) => {
        await Promise.resolve();
        return personPolicies.get(userId) ?? null;
      },
      save: async (userId, record) => {
        await Promise.resolve();
        personPolicies.set(userId, record);
      },
    },
    setup: {
      load: async (userId) => {
        await Promise.resolve();
        return setupSeen.get(userId) ?? null;
      },
      save: async (userId, seenAt) => {
        await Promise.resolve();
        if (seenAt === null) {
          setupSeen.delete(userId);
        } else {
          setupSeen.set(userId, seenAt);
        }
      },
    },
    pocket: {
      adjust: async (userId, deltaUsdMicros) => {
        await Promise.resolve();
        const next = Math.max(0, (pockets.get(userId) ?? 0) + deltaUsdMicros);
        pockets.set(userId, next);
        return next;
      },
      load: async (userId) => {
        await Promise.resolve();
        return pockets.get(userId) ?? null;
      },
    },
    receipts: {
      forRun: async (userId, runId) =>
        await Promise.resolve(
          (receipts.get(userId) ?? [])
            .filter((r) => r.runId === runId)
            .slice(0, 100)
        ),
      byIds: async (userId, ids) =>
        await Promise.resolve(
          (receipts.get(userId) ?? []).filter((r) =>
            ids.slice(0, 100).includes(r.id)
          )
        ),
      append: async (userId, receipt) => {
        await Promise.resolve();
        const list = receipts.get(userId) ?? [];
        list.push(receipt);
        receipts.set(userId, list);
      },
      recent: async (userId, limit) => {
        await Promise.resolve();
        return (receipts.get(userId) ?? []).toReversed().slice(0, limit);
      },
    },
  };
};
