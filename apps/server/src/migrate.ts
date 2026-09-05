/**
 * Migrations, run as a pre-deploy step.
 *
 * Deliberately its own process rather than something the server does at boot:
 * as a Railway `preDeployCommand` a failed migration fails the deploy *before*
 * the new container takes traffic, where a boot-time migration would put a
 * half-migrated server in front of users and then crash-loop.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Resolved from this file, not from the working directory.
 *
 * The folder used to be named as `packages/database/drizzle`, which only found
 * anything when the process happened to start at the repository root — and the
 * two ways this is actually run (`bun run --cwd apps/server migrate`, and
 * Railway's pre-deploy inside the image) both start somewhere else. A migration
 * step that silently finds no migrations is worse than one that fails.
 */
const migrationsFolder = new URL(
  "../../../packages/database/drizzle",
  import.meta.url
).pathname;

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL is required to run migrations.");
}

// `max: 1` because the migrator takes no advisory lock: a pool would let two
// connections race the same migration.
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder });
await sql.end();
