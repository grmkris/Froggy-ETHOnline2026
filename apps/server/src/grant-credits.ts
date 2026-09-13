/**
 * Grant credits to one account, as the operator.
 *
 *   bun run credits:grant -- --owner did:privy:… --credits 2000 --note "why"
 *
 * The only way credits come into being without an x402 settlement. It writes
 * one `grant` ledger entry under the account lock and prints the new balance,
 * so the wallet's activity list says who added what and why. Run it where
 * `DATABASE_URL` reaches the ledger: on Railway, `railway ssh -s app -- bun
 * apps/server/src/grant-credits.ts …` inside the running container.
 */

import { parseArgs } from "node:util";

import {
  CREDIT_UNITS_PER_CREDIT,
  creditUnits,
  decodeUserId,
} from "@froggy/domain";
import { postgresStore } from "@froggy/wallet";
import { Result } from "effect";
import postgres from "postgres";

const usage: (problem: string) => never = (problem) => {
  console.error(problem);
  console.error(
    'Usage: bun apps/server/src/grant-credits.ts --owner <did:privy:…> --credits <whole credits> --note "<why>"'
  );
  process.exit(1);
};

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    owner: { type: "string" },
    credits: { type: "string" },
    note: { type: "string" },
  },
  strict: true,
});

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  usage("DATABASE_URL is required to grant credits.");
}
const decoded = decodeUserId(values.owner);
if (!Result.isSuccess(decoded)) {
  usage("--owner must be the account's Privy DID.");
}
const owner = decoded.success;
const credits = Number(values.credits);
if (!Number.isInteger(credits) || credits <= 0) {
  usage("--credits must be a whole number of credits above zero.");
}
const note = values.note?.trim() ?? "";
if (note === "") {
  usage("--note must say why the credits are granted.");
}

// `max: 1`: one statement at a time, one account lock, nothing to race.
const sql = postgres(url, { max: 1 });
try {
  const account = await postgresStore(sql).credits.grant(
    owner,
    creditUnits(credits * CREDIT_UNITS_PER_CREDIT),
    note
  );
  console.log(
    `Granted ${credits} credits to ${owner}. Available now: ${account.availableUnits / CREDIT_UNITS_PER_CREDIT} credits (${account.reservedUnits / CREDIT_UNITS_PER_CREDIT} held).`
  );
} finally {
  await sql.end({ timeout: 5 });
}
