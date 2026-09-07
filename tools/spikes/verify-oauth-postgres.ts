/**
 * DATABASE_URL=<disposable local Postgres> bun tools/spikes/verify-oauth-postgres.ts
 * Run db:migrate first. Uses independent connections to check the DB-owned
 * claims that memory tests cannot prove. Creates only its own test identity.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { resolveAccessToken, revokeGrant } from "../../apps/server/src/oauth";
import postgres from "../../packages/database/node_modules/postgres";
import {
  OAuthClientId,
  OAuthGrantId,
  ScheduleId,
  userId,
} from "../../packages/domain/src/index";
import { postgresStore } from "../../packages/wallet/src/store-postgres";
const databaseUrl = process.env["DATABASE_URL"];
if (
  !databaseUrl ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname)
) {
  throw new Error(
    "Use a disposable local Postgres database, after running db:migrate."
  );
}
const sql = postgres(databaseUrl, { max: 3 });
const secondSql = postgres(databaseUrl, { max: 2 });
try {
  const a = postgresStore(sql),
    b = postgresStore(secondSql),
    now = Date.now(),
    owner = userId(`did:privy:oauth-postgres-check-${crypto.randomUUID()}`);
  const client = {
    id: OAuthClientId.generate(),
    name: "Local verification",
    redirectUris: ["http://127.0.0.1/callback"],
    createdAt: now,
  };
  await a.oauth.clients.create(client);
  assert.deepEqual(await b.oauth.clients.byId(client.id), client);
  const grant = {
    id: OAuthGrantId.generate(),
    clientId: client.id,
    clientName: client.name,
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
    scopes: ["services"] as const,
  };
  await a.oauth.grants.create(owner, grant);
  const secret = "fga_local-database-verification-" + grant.id;
  const token = {
    hash: createHash("sha256").update(secret).digest("hex"),
    kind: "access" as const,
    grantId: grant.id,
    scopes: grant.scopes,
    codeChallenge: null,
    redirectUri: null,
    resource: null,
    createdAt: now,
    expiresAt: now + 3600000,
    revokedAt: null,
    usedAt: null,
  };
  await a.oauth.tokens.insert(token);
  assert.equal((await resolveAccessToken(b, secret, now))?.userId, owner);
  const claimed = await Promise.all([
    a.oauth.tokens.consume(token.hash, now),
    b.oauth.tokens.consume(token.hash, now),
  ]);
  assert.deepEqual(claimed.sort(), [false, true]);
  assert.equal(
    await a.oauth.grants.revoke(
      userId("did:privy:another-person"),
      grant.id,
      now
    ),
    false
  );
  assert.equal(await revokeGrant(b, owner, grant.id, now), true);
  assert.equal(await resolveAccessToken(a, secret, now), null);
  assert.equal((await a.oauth.grants.list(owner))[0]?.revokedAt, now);
  const schedule = {
    id: ScheduleId.generate(),
    createdAt: now,
    label: "database check",
    action: { _tag: "remind" as const, text: "check" },
    cadence: { _tag: "once" as const, at: now },
    timezone: "UTC",
    nextRunAt: now,
    lastRunAt: null,
    status: "active" as const,
  };
  await a.schedules.create(owner, schedule);
  const due = await Promise.all([
    a.schedules.claimDue(now, 600000),
    b.schedules.claimDue(now, 600000),
  ]);
  assert.equal(due.flat().length, 1);
  await a.forget(owner);
  assert.deepEqual(await b.oauth.grants.list(owner), []);
  assert.equal(await b.oauth.tokens.byHash(token.hash), null);
  assert.deepEqual(await b.schedules.list(owner), []);
  console.log(
    "Postgres 17: migration, OAuth round trip, concurrent single-use token, owner isolation, revocation, schedule claim and forget all passed."
  );
} finally {
  await sql.end();
  await secondSql.end();
}
