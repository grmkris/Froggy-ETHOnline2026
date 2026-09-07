import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import postgres from "postgres";
import type { Sql } from "postgres";

export { typeIdColumn, typeIdPrimaryKey } from "./columns";
export {
  agentTokens,
  directory,
  mandates,
  receipts,
  sales,
  schedules,
  spends,
  tasks,
  telegramPairings,
  users,
} from "./schema";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  "DatabaseError",
  {
    cause: Schema.Defect(),
    operation: Schema.String,
  }
) {}

export class Database extends Context.Service<
  Database,
  {
    readonly sql: Sql;
    readonly health: () => Effect.Effect<void, DatabaseError>;
  }
>()("froggy/database/Database") {
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* layer() {
      const connectionString = yield* Config.redacted("DATABASE_URL");
      const sql = yield* Effect.acquireRelease(
        Effect.sync(() =>
          postgres(Redacted.value(connectionString), {
            idle_timeout: 20,
            max: 10,
          })
        ),
        (client) =>
          Effect.promise(async () => {
            await client.end({ timeout: 5 });
          })
      );

      const health = Effect.fn("Database.health")(() =>
        Effect.tryPromise({
          catch: (cause) => new DatabaseError({ operation: "health", cause }),
          try: async () => {
            await sql`select 1`;
          },
        })
      );

      return Database.of({ health, sql });
    })
  );
}
