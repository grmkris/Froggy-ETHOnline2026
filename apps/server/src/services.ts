/**
 * The composition root's composition root.
 *
 * Every "live or stub?" decision happens here and nowhere else. Each adapter
 * package ships both implementations behind one interface; this file reads the
 * modes computed in `environment.ts` and picks. The rest of the server holds
 * interfaces and never learns which one it got.
 *
 * The browser is deliberately *not* here. `tools/graph.ts` forbids
 * `packages/browser` and `packages/wallet` from importing each other — the
 * browser is where hostile content lives and the wallet is where signing
 * happens — and since a Chrome now belongs to one user rather than the
 * process, it is `workspaces.ts` that owns it. This file owns everything a
 * user does not have their own copy of.
 */

import type { GraphClient } from "@froggy/graph";
import { liveGraphClient, stubGraphClient } from "@froggy/graph";
import type { OracleGate, Payer } from "@froggy/payments";
import {
  liveHederaPayer,
  liveOracleGate,
  stubHederaPayer,
  stubOracleGate,
} from "@froggy/payments";
import type { PrivyServer, SpendLedger } from "@froggy/wallet";
import {
  livePrivyServer,
  memoryLedger,
  postgresLedger,
  stubPrivyServer,
} from "@froggy/wallet";
import postgres from "postgres";

import type { Environment } from "./environment";

export interface Services {
  readonly environment: Environment;
  readonly graph: GraphClient;
  readonly ledger: SpendLedger;
  readonly oracle: OracleGate;
  readonly payer: Payer;
  readonly privy: PrivyServer;
  /** Releases anything this module acquired. Called from the server's scope. */
  readonly shutdown: () => Promise<void>;
}

export interface ServiceOptions {
  readonly environment: Environment;
}

export const createServices = (options: ServiceOptions): Services => {
  const { environment } = options;

  const graph =
    environment.modes.graph === "live"
      ? liveGraphClient({
          apiKey: environment.graphApiKey,
          gatewayUrl: environment.graphGatewayUrl,
        })
      : stubGraphClient();

  const oracle =
    environment.modes.hedera === "live"
      ? liveOracleGate({
          facilitatorUrl: environment.hederaFacilitatorUrl,
          payTo: environment.hederaAccountId,
        })
      : stubOracleGate();

  const payer =
    environment.modes.hedera === "live"
      ? liveHederaPayer({
          accountId: environment.hederaAccountId,
          privateKey: environment.hederaPrivateKey,
        })
      : stubHederaPayer();

  const privy =
    environment.modes.privy === "live"
      ? livePrivyServer({
          agent: environment.privyAgent,
          appId: environment.privyAppId,
          appSecret: environment.privyAppSecret,
        })
      : stubPrivyServer();

  // No `DATABASE_URL` means the ledger lives in memory: correct for one
  // process, lost on restart, and loudly reported as `database=stub` in the
  // wallet pane. With a URL the same interface is served by Postgres, where
  // the unique index on `(user_id, idempotency_key)` enforces idempotency
  // across processes and a cap survives a redeploy.
  const sql =
    environment.modes.database === "live"
      ? postgres(environment.databaseUrl, { idle_timeout: 20, max: 10 })
      : null;

  return {
    environment,
    graph,
    ledger: sql === null ? memoryLedger() : postgresLedger(sql),
    oracle,
    payer,
    privy,
    shutdown: async () => {
      await sql?.end({ timeout: 5 });
    },
  };
};
