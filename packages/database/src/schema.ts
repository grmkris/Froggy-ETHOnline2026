/**
 * Persistence.
 *
 * Deliberately small. There is **no users table** — Privy's DID is the identity
 * and duplicating it locally would create a second answer to "who is this".
 * What is worth persisting is the part that has to survive a restart and be
 * auditable afterwards: what was spent, under which rule, on what evidence.
 *
 * The unique index on `(session_id, idempotency_key)` is the load-bearing
 * constraint in this file. It is what turns "a retried tool call must not pay
 * twice" from a convention into something the database enforces, and it is why
 * a second process could take over from the in-memory ledger without changing
 * the semantics.
 */

import { ReceiptId, SessionId, SpendId } from "@froggy/domain";
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

export const spends = pgTable(
  "spends",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: typeIdPrimaryKey(SpendId),
    idempotencyKey: text("idempotency_key").notNull(),
    sessionId: typeIdColumn(SessionId, "session_id").notNull(),
    /** `reserved | settled | failed | refused`. Written `reserved` first. */
    status: text("status").notNull(),
    /**
     * USD millionths. `bigint` rather than `integer` because a 32-bit column
     * caps at about $2147 and a cap that overflows is a cap that stops working
     * exactly when the numbers get interesting.
     */
    usdMicros: bigint("usd_micros", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("spends_session_idempotency").on(
      table.sessionId,
      table.idempotencyKey
    ),
    index("spends_session_created").on(table.sessionId, table.createdAt),
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
    sessionId: typeIdColumn(SessionId, "session_id").notNull(),
    spendId: typeIdColumn(SpendId, "spend_id").notNull(),
    /** Mirrored out of the document so a stubbed run is greppable in SQL. */
    stubbed: boolean("stubbed").notNull(),
  },
  (table) => [
    index("receipts_session_created").on(table.sessionId, table.createdAt),
  ]
);

export const mandates = pgTable("mandates", {
  document: jsonb("document").notNull(),
  sessionId: typeIdColumn(SessionId, "session_id").primaryKey(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
