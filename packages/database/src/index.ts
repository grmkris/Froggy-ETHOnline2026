import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import postgres from "postgres";
import type { Sql } from "postgres";

export { typeIdColumn, typeIdPrimaryKey } from "./columns";
export {
  savedItems,
  emailMailboxes,
  emailRecords,
  browserProfiles,
  conversations,
  historyMessages,
  historyRuns,
  historyExecutions,
  historyArtifacts,
  historyOwners,
  historyEvents,
  agentInvocations,
  agentTokens,
  conversions,
  directory,
  mandates,
  oauthClients,
  oauthGrants,
  oauthTokens,
  purchases,
  receipts,
  sales,
  schedules,
  spends,
  tasks,
  launchWatches,
  trades,
  tradeRules,
  telegramPairings,
  users,
  walletConnections,
  walletRequests,
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

export { monitoringAccounts } from "./schema";

export {
  walletStreamState,
  walletActivities,
  walletAlerts,
  walletAlertWindows,
  walletPriceEvaluations,
} from "./schema";

export {
  creditAccounts,
  creditCharges,
  creditPurchases,
  creditEntries,
} from "./schema";

export {
  paymentMethods,
  paymentMethodCredentials,
  cardCheckouts,
} from "./schema";

export { savedItemData } from "./schema";
