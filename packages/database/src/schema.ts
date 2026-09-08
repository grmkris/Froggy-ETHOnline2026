/**
 * Persistence.
 *
 * `users` is not an identity table. It holds no name, no email, no credential
 * and nothing you could authenticate against — Privy's DID remains the only
 * answer to "who is this", and duplicating that here would create a second
 * answer that can disagree. What this row records is the opposite direction:
 * **what we are holding on that person's behalf** — the Privy wallet we
 * attached an agent signer to and the Hedera pocket we funded for them. That
 * is state we created, so it has to live
 * somewhere we own.
 *
 * Everything is keyed on the DID rather than on a session id. A session id is
 * generated per process, so a ledger keyed on it would hand a returning user a
 * fresh allowance after every redeploy — not a ledger, a nightly amnesty.
 *
 * The unique index on `(user_id, idempotency_key)` is the load-bearing
 * constraint in this file. It is what turns "a retried tool call must not pay
 * twice" from a convention into something the database enforces, across
 * processes rather than within one.
 */

import {
  AgentInvocationId,
  AgentTokenId,
  ConversionId,
  DirectoryId,
  OAuthClientId,
  OAuthGrantId,
  ReceiptId,
  RunId,
  SaleId,
  ScheduleId,
  SessionId,
  SpendId,
  TaskId,
} from "@froggy/domain";
import type { AgentConnectionId } from "@froggy/domain";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { typeIdColumn, typeIdPrimaryKey } from "./columns";

export const users = pgTable("users", {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Privy's DID. The identity, owned by Privy; this is a foreign key to it. */
  did: text("did").primaryKey(),
  /**
   * `0.0.x`. The person's own Hedera account, opened by the host at their
   * first Hedera payment and funded from the host's float. What a receipt
   * and a seller's book name as the payer.
   */
  hederaAccountId: text("hedera_account_id"),
  /**
   * That account's private key, sealed under the server's key-encryption key.
   *
   * Privy does not hold this key: its policy engine has no method for a raw
   * secp256k1 signature, so a Hedera transaction it signed would be signed
   * without any policy evaluated. The caps on this key are ours to enforce,
   * and `docs/` says so rather than implying Privy is the leash on both chains.
   */
  hederaKeyCiphertext: text("hedera_key_ciphertext"),
  /**
   * When Privy holds the account's key instead: the cosmos-type wallet whose
   * secp256k1 key is the account's ECDSA key, and that key's compressed
   * public form, so a transaction can be signed through `raw_sign` and
   * verified without asking Privy. Either this pair or the ciphertext above.
   */
  hederaPrivyWalletId: text("hedera_privy_wallet_id"),
  hederaPublicKey: text("hedera_public_key"),
  /**
   * The Hedera pocket, as a balance in USD millionths.
   *
   * One host account pays every Hedera 402; this is the share of it each
   * person may spend. A top-up under the Privy policy credits it and a spend
   * draws it down inside the same lock as the reservation. Null means never
   * initialised: the first session credits the
   * starting allowance once, and null is how "once" is known.
   */
  pocketUsdMicros: bigint("pocket_usd_micros", { mode: "number" }),
  /** The wallet Privy minted at login, which we attach a signer to. */
  privyWalletAddress: text("privy_wallet_address"),
  privyWalletId: text("privy_wallet_id"),
});

export const spends = pgTable(
  "spends",
  {
    runId: typeIdColumn(RunId, "run_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: typeIdPrimaryKey(SpendId),
    idempotencyKey: text("idempotency_key").notNull(),
    /** `reserved | settled | failed | refused`. Written `reserved` first. */
    status: text("status").notNull(),
    /**
     * USD millionths. `bigint` rather than `integer` because a 32-bit column
     * caps at about $2147 and a cap that overflows is a cap that stops working
     * exactly when the numbers get interesting.
     */
    usdMicros: bigint("usd_micros", { mode: "number" }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
  },
  (table) => [
    uniqueIndex("spends_user_idempotency").on(
      table.userId,
      table.idempotencyKey
    ),
    index("spends_user_created").on(table.userId, table.createdAt),
  ]
);

export const receipts = pgTable(
  "receipts",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * The whole receipt, as decoded by `@froggy/domain`.
     *
     * A document rather than columns because a receipt is an immutable record
     * of a past decision, and normalising it would mean a later schema change
     * silently rewrites the history of *why* something was allowed.
     */
    document: jsonb("document").notNull(),
    id: typeIdPrimaryKey(ReceiptId),
    /** The run this receipt belongs to. Not an owner — `user_id` is that. */
    sessionId: typeIdColumn(SessionId, "session_id").notNull(),
    spendId: typeIdColumn(SpendId, "spend_id").notNull(),
    /** Mirrored out of the document so a stubbed run is greppable in SQL. */
    stubbed: boolean("stubbed").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
  },
  (table) => [index("receipts_user_created").on(table.userId, table.createdAt)]
);

export const mandates = pgTable("mandates", {
  document: jsonb("document").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  userId: text("user_id")
    .primaryKey()
    .references(() => users.did),
});

/**
 * One Telegram account per person, one person per Telegram account.
 *
 * The thread id is the DM the bot opened, kept so a digest or a freeze notice
 * can be posted without waiting for the person to write first.
 */
export const telegramPairings = pgTable("telegram_pairings", {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  telegramUserId: text("telegram_user_id").primaryKey(),
  threadId: text("thread_id").notNull(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.did),
});

/** Paid endpoints a person added, one row per URL per person. */
export const directory = pgTable(
  "directory",
  {
    amount: text("amount").notNull(),
    asset: text("asset").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    host: text("host").notNull(),
    id: typeIdPrimaryKey(DirectoryId),
    label: text("label").notNull(),
    network: text("network").notNull(),
    payTo: text("pay_to").notNull(),
    url: text("url").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
  },
  (table) => [uniqueIndex("directory_user_url").on(table.userId, table.url)]
);

/**
 * What the seller side sold. Not keyed on a person: the buyer is whichever
 * account paid, named as the payment payload named it.
 *
 * `payment_hash` is unique so the same proof presented twice finds the sale
 * it already bought before the facilitator is asked to settle it again. The
 * row is written before the work, which is the whole point of the table.
 */
export const sales = pgTable(
  "sales",
  {
    amount: text("amount").notNull(),
    asset: text("asset").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    error: text("error"),
    id: typeIdPrimaryKey(SaleId),
    network: text("network").notNull(),
    payer: text("payer"),
    paymentHash: text("payment_hash").notNull(),
    resource: text("resource").notNull(),
    result: jsonb("result"),
    /** `settled | delivered | failed`. */
    status: text("status").notNull(),
    stubbed: boolean("stubbed").notNull(),
    transactionId: text("transaction_id"),
  },
  (table) => [
    uniqueIndex("sales_payment_hash").on(table.paymentHash),
    index("sales_transaction").on(table.transactionId),
  ]
);

/**
 * Delegated tasks. The unique index on `(user_id, idempotency_key)` is the
 * same promise the spends table makes: a repeated request is the same task,
 * not a second bill. Nulls are distinct in Postgres, so tasks without a key
 * do not collide.
 */
export const tasks = pgTable(
  "tasks",
  {
    agentTokenId: typeIdColumn(AgentTokenId, "agent_token_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    error: text("error"),
    id: typeIdPrimaryKey(TaskId),
    idempotencyKey: text("idempotency_key"),
    input: jsonb("input").notNull(),
    kind: text("kind").notNull(),
    priceUsdMicros: bigint("price_usd_micros", { mode: "number" }).notNull(),
    result: jsonb("result"),
    runId: typeIdColumn(RunId, "run_id"),
    saleId: typeIdColumn(SaleId, "sale_id"),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
  },
  (table) => [
    uniqueIndex("tasks_user_idempotency").on(
      table.userId,
      table.idempotencyKey
    ),
    index("tasks_user_created").on(table.userId, table.createdAt),
  ]
);

/**
 * Tokens handed to outside agents. Only the hash of the secret is stored, so
 * the table cannot be used to impersonate an agent; a revoked token keeps
 * its row and its timestamp.
 */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: typeIdPrimaryKey(AgentTokenId),
    label: text("label").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    secretHash: text("secret_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
  },
  (table) => [
    uniqueIndex("agent_tokens_secret").on(table.secretHash),
    index("agent_tokens_user").on(table.userId),
  ]
);

/**
 * Reminders, unattended prompts and the digest, one row each.
 *
 * `action` and `cadence` are documents, as the domain decodes them; the
 * cadence is what the person said ("daily at 07:30") and `next_run_at` is
 * the one instant derived from it. `claimed_at` is the lock: a ticker takes
 * a due row by setting it in the same statement that reads it, so two
 * processes on one database never fire the same reminder twice. `finish`
 * clears it; a claim older than the stale window is treated as abandoned,
 * which makes a crash between claim and finish at-least-once rather than
 * never.
 */
export const schedules = pgTable(
  "schedules",
  {
    action: jsonb("action").notNull(),
    cadence: jsonb("cadence").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: typeIdPrimaryKey(ScheduleId),
    label: text("label").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    /** `active | done | cancelled`. */
    status: text("status").notNull(),
    timezone: text("timezone").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
  },
  (table) => [
    index("schedules_due").on(table.status, table.nextRunAt),
    index("schedules_user").on(table.userId),
  ]
);

/**
 * MCP clients that registered themselves (RFC 7591). Public clients only:
 * there is no secret column because there is no secret — PKCE and the
 * redirect URI are what bind a code to the client that asked for it.
 */
export const oauthClients = pgTable("oauth_clients", {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  id: typeIdPrimaryKey(OAuthClientId),
  name: text("name").notNull(),
  /** A JSON array of absolute URIs, checked at registration. */
  redirectUris: jsonb("redirect_uris").notNull(),
});

/**
 * One person's consent to one client. Revoking the grant is what
 * "Disconnect" does; every token under it stops on the next request.
 */
export const oauthGrants = pgTable(
  "oauth_grants",
  {
    clientId: typeIdColumn(OAuthClientId, "client_id")
      .notNull()
      .references(() => oauthClients.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: typeIdPrimaryKey(OAuthGrantId),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** A JSON array of scope names. */
    scopes: jsonb("scopes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
  },
  (table) => [index("oauth_grants_user").on(table.userId)]
);

/**
 * Codes, access tokens and refresh tokens, by the SHA-256 of the secret.
 * `used_at` is set exactly once by `UPDATE … WHERE used_at IS NULL`, which is
 * how a replayed code or an old refresh token is detected across processes.
 */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    /** PKCE S256 challenge, on codes only. */
    codeChallenge: text("code_challenge"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    grantId: typeIdColumn(OAuthGrantId, "grant_id")
      .notNull()
      .references(() => oauthGrants.id),
    hash: text("hash").primaryKey(),
    /** `code | access | refresh`. */
    kind: text("kind").notNull(),
    /** The redirect the code was issued to, matched exactly at exchange. */
    redirectUri: text("redirect_uri"),
    /** RFC 8707: the resource the code was asked for, when one was named. */
    resource: text("resource"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    scopes: jsonb("scopes").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [index("oauth_tokens_grant").on(table.grantId)]
);

/** Recovery records stay with money when a person deletes workspace data. */
export const conversions = pgTable(
  "conversions",
  {
    id: typeIdPrimaryKey(ConversionId),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
    key: text("key").notNull(),
    phase: text("phase").notNull(),
    data: jsonb("data").notNull(),
  },
  (table) => [uniqueIndex("conversions_user_key").on(table.userId, table.key)]
);

/** A bounded metadata trail, retained when an agent is disconnected. */
export const agentInvocations = pgTable(
  "agent_invocations",
  {
    id: typeIdPrimaryKey(AgentInvocationId),
    userId: text("user_id")
      .notNull()
      .references(() => users.did),
    connectionId: text("connection_id").$type<AgentConnectionId>().notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    outcome: text("outcome").notNull(),
    usdMicros: bigint("usd_micros", { mode: "number" }),
    taskId: typeIdColumn(TaskId, "task_id"),
    stubbed: boolean("stubbed").notNull(),
  },
  (table) => [
    index("agent_invocations_owner_connection_at").on(
      table.userId,
      table.connectionId,
      table.at,
      table.id
    ),
  ]
);
