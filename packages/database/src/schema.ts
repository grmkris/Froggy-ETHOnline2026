/**
 * Persistence.
 *
 * `users` is not an identity table. It holds no name, no email, no credential
 * and nothing you could authenticate against — Privy's DID remains the only
 * answer to "who is this", and duplicating that here would create a second
 * answer that can disagree. What this row records is the opposite direction:
 * **what we are holding on that person's behalf** — the Privy wallet we
 * attached an agent signer to, the Hedera pocket we funded for them, and
 * whether they have frozen it. That is state we created, so it has to live
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

import { DirectoryId, ReceiptId, SessionId, SpendId } from "@froggy/domain";
import {
  bigint,
  boolean,
  index,
  integer,
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
   * The local hour (0–23) the daily digest runs, or null for never, in the
   * IANA zone beside it. Stored as the person said it, not as UTC: a digest
   * "at eight" should still be at eight after the clocks change.
   */
  digestHour: integer("digest_hour"),
  digestTimezone: text("digest_timezone"),
  /**
   * When the user froze their wallet, or null.
   *
   * A timestamp rather than a boolean so an unfreeze is a new fact rather than
   * a lost one: "frozen at 14:02, unfrozen at 14:09" is answerable, and it is
   * the question you have after something goes wrong.
   */
  frozenAt: timestamp("frozen_at", { withTimezone: true }),
  /** `0.0.x`. The Hedera pocket the agent pays small amounts from. */
  hederaAccountId: text("hedera_account_id"),
  /**
   * The pocket's private key, encrypted at rest.
   *
   * Privy cannot hold this: its policy engine has no method for a raw
   * secp256k1 signature, so a Hedera transaction it signed would be signed
   * without any policy evaluated. The caps on this key are therefore ours to
   * enforce, and `docs/` must say so rather than implying Privy is the leash on
   * both chains.
   */
  hederaKeyCiphertext: text("hedera_key_ciphertext"),
  /**
   * The Hedera pocket, as a balance in USD millionths.
   *
   * One host account pays every Hedera 402; this is the share of it each
   * person may spend. A top-up under the Privy policy credits it, a spend
   * draws it down inside the same lock as the reservation, a freeze zeroes
   * it. Null means never initialised: the first session credits the
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
