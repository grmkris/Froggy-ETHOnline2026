import { EmailRecord, Mailbox, userId as parseUserId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { Effect, Schema } from "effect";
import type { Sql } from "postgres";

export interface EmailTransaction {
  mailbox: Mailbox | null;
  get: (id: string) => Promise<EmailRecord | null>;
  list: (kind: EmailRecord["kind"]) => Promise<readonly EmailRecord[]>;
  put: (record: EmailRecord) => Promise<void>;
}
export interface EmailStore {
  transaction: <T>(
    userId: UserId,
    action: (tx: EmailTransaction) => Promise<T>
  ) => Promise<T>;
  owner: (handle: string) => Promise<UserId | null>;
  owners: () => Promise<readonly UserId[]>;
}
export const memoryEmailStore = (): EmailStore => {
  const boxes = new Map<UserId, Mailbox>();
  const records = new Map<UserId, Map<string, EmailRecord>>();
  let pending: Promise<void> = Promise.resolve();
  return {
    owner: async (handle) =>
      await Promise.resolve(
        [...boxes].find(([, box]) => box.handle === handle)?.[0] ?? null
      ),
    owners: async () => await Promise.resolve([...boxes.keys()]),
    transaction: async (userId, action) => {
      const previous = pending;
      const release = Promise.withResolvers<undefined>();
      pending = release.promise;
      await previous;
      try {
        const entries = new Map(records.get(userId));
        const tx: EmailTransaction = {
          mailbox: boxes.get(userId) ?? null,
          get: async (id) => await Promise.resolve(entries.get(id) ?? null),
          list: async (kind) =>
            await Promise.resolve(
              [...entries.values()].filter((record) => record.kind === kind)
            ),
          put: async (record) => {
            entries.set(
              record.id,
              Schema.decodeUnknownSync(EmailRecord)(record)
            );
            await Promise.resolve();
          },
        };
        const result = await action(tx);
        if (tx.mailbox) {
          for (const [owner, box] of boxes) {
            if (owner !== userId && box.handle === tx.mailbox.handle) {
              throw new Error("That address is already claimed.");
            }
          }
          boxes.set(userId, tx.mailbox);
        }
        records.set(userId, entries);
        return result;
      } finally {
        release.resolve();
      }
    },
  };
};
const BoxRow = Schema.Struct({ data: Mailbox });
const RecordRow = Schema.Struct({ data: EmailRecord });
const OwnerRow = Schema.Struct({ user_id: Schema.String });
export const postgresEmailStore = (sql: Sql): EmailStore => ({
  owner: async (handle) => {
    const rows =
      await sql`select user_id from email_mailboxes where handle = ${handle}`;
    return rows[0]
      ? parseUserId(Schema.decodeUnknownSync(OwnerRow)(rows[0]).user_id)
      : null;
  },
  owners: async () =>
    Schema.decodeUnknownSync(Schema.Array(OwnerRow))(
      await sql`select user_id from email_mailboxes`
    ).map((row) => parseUserId(row.user_id)),
  transaction: async (userId, action) => {
    // The mailbox lock serializes quotas, approvals and deduplication across replicas.
    let result: { value: Awaited<ReturnType<typeof action>> } | undefined;
    await sql.begin(async (db) => {
      await db`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
      const boxes =
        await db`select data from email_mailboxes where user_id = ${userId}`;
      const original = boxes[0]
        ? Schema.decodeUnknownSync(BoxRow)(boxes[0]).data
        : null;
      const writes = new Map<string, EmailRecord>();
      const tx: EmailTransaction = {
        mailbox: original,
        get: async (id) => {
          if (writes.has(id)) {
            return writes.get(id) ?? null;
          }
          const rows =
            await db`select data from email_records where user_id = ${userId} and id = ${id}`;
          return rows[0]
            ? Schema.decodeUnknownSync(RecordRow)(rows[0]).data
            : null;
        },
        list: async (kind) => {
          const rows = Schema.decodeUnknownSync(Schema.Array(RecordRow))(
            await db`select data from email_records where user_id = ${userId} and kind = ${kind}`
          );
          const merged = new Map(rows.map((row) => [row.data.id, row.data]));
          for (const record of writes.values()) {
            if (record.kind === kind) {
              merged.set(record.id, record);
            }
          }
          return [...merged.values()];
        },
        put: async (record) => {
          writes.set(record.id, Schema.decodeUnknownSync(EmailRecord)(record));
          await Promise.resolve();
        },
      };
      result = { value: await action(tx) };
      // Drizzle shares this pool and replaces its JSON serializers with identity functions.
      // Bind explicit JSON text so both shared and standalone pools encode the same data.
      if (tx.mailbox !== null && tx.mailbox !== original) {
        await db`insert into users (did) values (${userId}) on conflict (did) do nothing`;
        await db`insert into email_mailboxes (user_id, handle, data) values (${userId}, ${tx.mailbox.handle}, ${JSON.stringify(Schema.encodeSync(Schema.Json)(tx.mailbox))}::text::jsonb) on conflict (user_id) do update set data = excluded.data`;
      }
      await Effect.runPromise(
        Effect.forEach(
          writes.values(),
          (record) =>
            Effect.promise(async () => {
              await db`insert into email_records (id, user_id, kind, data) values (${record.id}, ${userId}, ${record.kind}, ${JSON.stringify(Schema.encodeSync(Schema.Json)(record))}::text::jsonb) on conflict (id) do update set data = excluded.data where email_records.user_id = excluded.user_id`;
            }),
          { concurrency: 1 }
        )
      );
    });
    if (!result) {
      throw new Error("Email transaction did not complete.");
    }
    return result.value;
  },
});
