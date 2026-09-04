/**
 * The composition root's composition root.
 *
 * Every "live or stub?" decision happens here and nowhere else. Each adapter
 * package ships both implementations behind one interface; this file reads the
 * modes computed in `environment.ts` and picks. The rest of the server holds
 * interfaces and never learns which one it got.
 *
 * This is also the only module that imports the wallet, the browser and the
 * payment client together. `tools/graph.ts` forbids those packages from
 * importing each other for a reason: the browser is where hostile content
 * lives, and the wallet is where signing happens. They meet in exactly one
 * file, and it is this one, so the blast radius of that adjacency is readable.
 */

import { BrowserSession } from "@froggy/browser";
import type { GraphClient } from "@froggy/graph";
import { liveGraphClient, stubGraphClient } from "@froggy/graph";
import type { OracleGate, Payer } from "@froggy/payments";
import {
  liveHederaPayer,
  liveOracleGate,
  stubHederaPayer,
  stubOracleGate,
} from "@froggy/payments";
import type { BrowserState } from "@froggy/protocol";
import type { PrivyServer, SpendLedger } from "@froggy/wallet";
import { livePrivyServer, memoryLedger, stubPrivyServer } from "@froggy/wallet";

import type { Environment } from "./environment";

export interface Services {
  readonly browser: BrowserSession;
  readonly environment: Environment;
  readonly graph: GraphClient;
  readonly ledger: SpendLedger;
  readonly oracle: OracleGate;
  readonly payer: Payer;
  readonly privy: PrivyServer;
}

export interface ServiceOptions {
  readonly environment: Environment;
  readonly onBrowserStateChange: (state: BrowserState) => void;
}

export const createServices = (options: ServiceOptions): Services => {
  const { environment } = options;

  const graph =
    environment.modes.graph === "live"
      ? liveGraphClient({
          apiKey: environment.graphApiKey,
          gatewayUrl: environment.graphGatewayUrl,
          subgraphId: environment.graphSubgraphId,
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
          appId: environment.privyAppId,
          appSecret: environment.privyAppSecret,
        })
      : stubPrivyServer();

  const browser = new BrowserSession({
    onStateChange: options.onBrowserStateChange,
    profileDirectory: environment.chromeProfileDirectory,
  });

  return {
    browser,
    environment,
    graph,
    // In-memory, and the Railway service is pinned to one replica because of
    // it. The Postgres table with its unique index on
    // `(session_id, idempotency_key)` is the version that survives a second
    // replica; swapping it is one factory call, not a rewrite.
    ledger: memoryLedger(),
    oracle,
    payer,
    privy,
  };
};
